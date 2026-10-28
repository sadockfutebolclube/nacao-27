/** Fase 25: seleção por clique — registro de entidades (ECS leve), picking por raio e geração das fichas. */
import { describe, expect, it } from 'vitest';
import {
  classeDaRenda, curvaTurismo, gerarCarro, gerarCasa, gerarEstabelecimento, gerarPessoa, humorDe, MARCOS, regiaoDoBairro, regiaoPorAP, sorteio, tipoDeEstabelecimento, visitantesAgora,
  type EntradaPessoa,
} from '../src/entidades/geracao';
import { Registro, IndiceCaixas, ID_BASE_LOTE, ehEstatico, raioCaixa, type Caixa } from '../src/entidades/registro';

const aleatorio = (semente: number) => () => { semente = (semente * 1664525 + 1013904223) >>> 0; return semente / 4294967296; };
const caixa = (x: number, z: number, w = 10, d = 6, h = 8, yaw = 0, y = 0): Caixa => ({ x, y, z, yaw, w, h, d });

describe('raio × caixa orientada', () => {
  it('acerta de frente, erra ao lado e respeita a altura', () => {
    const b = caixa(0, 20, 4, 4, 3);
    expect(raioCaixa(0, 1.5, 0, 0, 0, 1, b)).toBeCloseTo(18, 5); // entra na face z = 18
    expect(raioCaixa(6, 1.5, 0, 0, 0, 1, b)).toBe(-1);          // passa ao lado
    expect(raioCaixa(0, 5, 0, 0, 0, 1, b)).toBe(-1);            // por cima (altura 3)
    expect(raioCaixa(6, 1.5, 0, 0, 0, 1, b, 4.5)).toBeGreaterThan(0); // com margem acerta
  });

  it('a rotação (yaw) gira a caixa como o rotation.y do Three', () => {
    // caixa comprida (w = 20 em x, d = 2) girada 90°: passa a ser comprida em z
    const b = caixa(0, 0, 20, 2, 2, Math.PI / 2);
    expect(raioCaixa(8, 1, -20, 0, 0, 1, b)).toBe(-1);     // x = 8 está fora da caixa girada (largura 2 em x)
    expect(raioCaixa(0.5, 1, -30, 0, 0, 1, b)).toBeGreaterThan(0);
    const c = caixa(0, 0, 20, 2, 2, 0);
    expect(raioCaixa(8, 1, -20, 0, 0, 1, c)).toBeGreaterThan(0); // sem rotação x = 8 está dentro
  });
});

describe('índice espacial de caixas', () => {
  it('o primeiro acerto da varredura em grade é o mesmo da força bruta', () => {
    const r = aleatorio(4);
    const n = 600;
    const caixas: Caixa[] = [], ids: number[] = [];
    for (let i = 0; i < n; i++) { caixas.push(caixa((r() - 0.5) * 1500, (r() - 0.5) * 1500, 4 + r() * 30, 4 + r() * 25, 3 + r() * 30, r() * 6.28, r() * 40)); ids.push(1000 + i); }
    const idx = new IndiceCaixas(caixas, ids, new Array(n).fill(4), 32);
    for (let q = 0; q < 300; q++) {
      const ox = (r() - 0.5) * 1700, oy = 20 + r() * 150, oz = (r() - 0.5) * 1700;
      let dx = r() - 0.5, dy = -0.1 - r() * 0.6, dz = r() - 0.5;
      const L = Math.hypot(dx, dy, dz); dx /= L; dy /= L; dz /= L;
      let melhor = -1, tm = 4000;
      for (let i = 0; i < n; i++) { const t = raioCaixa(ox, oy, oz, dx, dy, dz, caixas[i]); if (t >= 0 && t < tm) { tm = t; melhor = i; } }
      const h = idx.raio(ox, oy, oz, dx, dy, dz, 4000);
      expect(h ? h.i : -1, `raio ${q}`).toBe(melhor);
    }
  });

  it('perto() devolve todas as caixas cujo centro está no quadrado', () => {
    const r = aleatorio(8);
    const caixas = Array.from({ length: 400 }, () => caixa((r() - 0.5) * 1000, (r() - 0.5) * 1000));
    const idx = new IndiceCaixas(caixas, caixas.map((_, i) => i), caixas.map(() => 3), 32);
    const achados = new Set(idx.perto(100, -50, 80));
    caixas.forEach((c, i) => { if (Math.abs(c.x - 100) < 80 && Math.abs(c.z + 50) < 80) expect(achados.has(i), `caixa ${i}`).toBe(true); });
  });
});

describe('registro de entidades', () => {
  it('IDs novos são únicos e crescentes; estáticos têm faixa própria', () => {
    const r = new Registro();
    const a = r.novoId(), b = r.novoId();
    expect(b).toBeGreaterThan(a);
    expect(ehEstatico(a)).toBe(false);
    expect(ehEstatico(ID_BASE_LOTE + 5)).toBe(true);
  });

  it('componentes: definir, ler, remover e limpar', () => {
    const r = new Registro();
    r.definir('ficha', 7, { nome: 'Ana' });
    expect(r.ler<{ nome: string }>('ficha', 7)?.nome).toBe('Ana');
    expect(r.tem('ficha', 7)).toBe(true);
    r.remover(7);
    expect(r.tem('ficha', 7)).toBe(false);
    r.definir('x', 1, 1); r.definir('x', 2, 2);
    r.limpar('x', (id) => id === 2);
    expect(r.tem('x', 1)).toBe(false); expect(r.tem('x', 2)).toBe(true);
  });

  it('o picking escolhe o mais perto entre pessoas, carros e prédios; o filtro limita os tipos', () => {
    const r = new Registro();
    r.iniciarQuadro('pessoa'); r.iniciarQuadro('carro');
    r.publicar('pessoa', 11, 'pessoa', 0, 0, 10, 0, 0.6, 1.8, 0.5);
    r.publicar('carro', 12, 'carro', 0, 0, 25, 0, 1.8, 1.5, 4.5);
    const predio = new IndiceCaixas([caixa(0, 40, 20, 20, 30)], [ID_BASE_LOTE + 3], [4]);
    r.definirEstaticos(predio, 1);
    // raio horizontal a 1 m de altura ao longo de +z: pessoa (10), carro (25), prédio (30)
    expect(r.picar(0, 1, 0, 0, 0, 1, 500)?.id).toBe(11);
    expect(r.picar(0, 1, 0, 0, 0, 1, 500, (t) => t !== 'pessoa')?.id).toBe(12);
    expect(r.picar(0, 1, 0, 0, 0, 1, 500, (t) => t === 'predio')?.id).toBe(ID_BASE_LOTE + 3);
    expect(r.picar(0, 1, 0, 0, 0, 1, 5)).toBeNull(); // curto demais
  });

  it('caixaDe acha dinâmicos publicados no quadro e estáticos; some quando o quadro não republica', () => {
    const r = new Registro();
    r.iniciarQuadro('pessoa');
    r.publicar('pessoa', 5, 'pessoa', 3, 0, 4, 1, 0.6, 1.8, 0.5);
    r.definirEstaticos(new IndiceCaixas([caixa(50, 60)], [ID_BASE_LOTE + 9], [3]), 1);
    expect(r.caixaDe(5)?.x).toBe(3);
    expect(r.caixaDe(ID_BASE_LOTE + 9)?.z).toBe(60);
    expect(r.tipoDinamico(5)).toBe('pessoa');
    r.iniciarQuadro('pessoa'); // quadro seguinte: a pessoa não foi republicada (saiu de cena)
    expect(r.caixaDe(5)).toBeNull();
    expect(r.caixaDe(ID_BASE_LOTE + 99)).toBeNull();
  });

  it('fontes vivas: várias podem responder pelo mesmo tipo; a primeira que conhece o ID ganha', () => {
    const r = new Registro();
    const sai = r.fonte('carro', (id) => (id === 1 ? { v: 10 } : null));
    r.fonte('carro', (id) => (id === 2 ? { v: 20 } : null));
    expect(r.vivo('carro', 1)).toEqual({ v: 10 });
    expect(r.vivo('carro', 2)).toEqual({ v: 20 });
    expect(r.vivo('carro', 3)).toBeNull();
    sai();
    expect(r.vivo('carro', 1)).toBeNull();
  });
});

describe('geração das fichas', () => {
  const entrada = (semente: number, extra: Partial<EntradaPessoa> = {}): EntradaPessoa => ({
    semente, persona: 'trabalhador', agora: { rua: 'Rua X', bairro: 'Botafogo' },
    casa: { rua: 'Rua A', numero: 10, bairro: 'Botafogo', regiao: 'Zona Sul' }, trabalho: { nome: 'Loja', rua: 'Rua B', bairro: 'Centro' },
    lvCasa: 50, crimeCasa: 0.2, dominioCasa: null, hora: 10, fimDeSemana: false, chuva: 0, estado: 'andando', atividade: 'desloca', data: (d) => (d === 0 ? 'hoje' : 'ontem'), ...extra,
  });

  it('a mesma semente dá a mesma pessoa; outra semente dá outra', () => {
    const a = gerarPessoa(entrada(123)), b = gerarPessoa(entrada(123)), c = gerarPessoa(entrada(124));
    expect(b).toEqual(a);
    expect(c.nome === a.nome && c.idade === a.idade && c.profissao === a.profissao).toBe(false);
  });

  it('idade e renda ficam nas faixas da persona; a classe acompanha a renda', () => {
    for (let s = 1; s <= 200; s++) {
      const e = gerarPessoa(entrada(s, { persona: s % 2 ? 'aposentado' : 'estudante' }));
      if (s % 2) expect(e.idade).toBeGreaterThanOrEqual(62); else expect(e.idade).toBeLessThanOrEqual(24);
      expect(e.renda).toBeGreaterThanOrEqual(0);
      expect(e.classe.id).toBe(classeDaRenda(e.renda).id);
    }
    expect(classeDaRenda(1000).id).toBe('E');
    expect(classeDaRenda(25_000).id).toBe('B');
    expect(classeDaRenda(60_000).id).toBe('A');
  });

  it('afiliação só aparece em área dominada; o criminoso é mais comum lá; o flag é independente da afiliação visível', () => {
    let afil = 0, crimDom = 0, crimLivre = 0;
    const dom = { nome: 'Comando da Laje', tipo: 'facção' as const };
    for (let s = 1; s <= 3000; s++) {
      const d = gerarPessoa(entrada(s, { dominioCasa: dom, crimeCasa: 0.6 }));
      const l = gerarPessoa(entrada(s, { dominioCasa: null, crimeCasa: 0.05 }));
      if (d.faccao) afil++;
      expect(l.faccao).toBeNull();
      if (d.criminoso) crimDom++;
      if (l.criminoso) crimLivre++;
    }
    expect(afil).toBeGreaterThan(40);
    expect(crimDom).toBeGreaterThan(crimLivre * 2);
    expect(crimLivre / 3000).toBeLessThan(0.05);
  });

  it('o criminoso tem crimes na ficha; o inocente não', () => {
    for (let s = 1; s <= 400; s++) { const p = gerarPessoa(entrada(s, { crimeCasa: 0.7 })); expect(p.crimes.length > 0).toBe(p.criminoso); }
  });

  it('humor: medo em área dominada à noite; chuva e fila de ônibus pioram', () => {
    const dom = { nome: 'Liga do Asfalto', tipo: 'milícia' as const };
    let medo = 0;
    for (let s = 1; s <= 200; s++) if (humorDe({ semente: s, persona: 'trabalhador', hora: 23, chuva: 0, crimeCasa: 0.7, dominioCasa: dom, fimDeSemana: false, estado: 'andando' }).id === 'com_medo') medo++;
    expect(medo).toBeGreaterThan(60);
    const media = (extra: Partial<Parameters<typeof humorDe>[0]>) => {
      const ordem = ['irritado', 'estressado', 'preocupado', 'cansado', 'tranquilo', 'animado'];
      let t = 0;
      for (let s = 1; s <= 300; s++) t += ordem.indexOf(humorDe({ semente: s, persona: 'trabalhador', hora: 13, chuva: 0, crimeCasa: 0, dominioCasa: null, fimDeSemana: false, estado: 'andando', ...extra }).id);
      return t / 300;
    };
    expect(media({ chuva: 0.8, estado: 'esperando ônibus' })).toBeLessThan(media({}));
  });

  it('região: pelo Censo (AP/RA), pela lista de bairros e, no fim, pela posição', () => {
    expect(regiaoPorAP('2', 'COPACABANA')).toBe('Zona Sul');
    expect(regiaoPorAP('2', 'TIJUCA')).toBe('Zona Norte');
    expect(regiaoPorAP('1', 'CENTRO')).toBe('Centro');
    expect(regiaoPorAP('1', 'SAO CRISTOVAO')).toBe('Zona Norte');
    expect(regiaoPorAP('4', 'JACAREPAGUA')).toBe('Zona Oeste');
    expect(regiaoDoBairro('Leblon', 0, 0)).toBe('Zona Sul');
    expect(regiaoDoBairro('Lapa', 0, 0)).toBe('Centro');
    expect(regiaoDoBairro(null, -5000, 0)).toBe('Zona Oeste');
  });

  it('casa: idades somam os moradores, valor cresce com o valor do solo e na Zona Sul, segurança cai com domínio', () => {
    const base = { semente: 9, endereco: { rua: 'R', numero: 1, bairro: 'B', regiao: 'Zona Norte' }, tipoPredio: 'residencial' as const, andares: 2, w: 12, d: 8, moradores: 7, lv: 40, cobSeg: 0.6, crime: 0.2, dominio: null, disputado: false, nome: null };
    const c = gerarCasa(base);
    expect(c.idades.length).toBe(7);
    expect(c.tipo).toBe('Casa');
    expect(gerarCasa({ ...base, lv: 80 }).valor).toBeGreaterThan(c.valor);
    expect(gerarCasa({ ...base, endereco: { ...base.endereco, regiao: 'Zona Sul' } }).valor).toBeGreaterThan(c.valor * 1.5);
    expect(gerarCasa({ ...base, dominio: { nome: 'X', tipo: 'milícia' } }).seguranca.valor).toBeLessThan(c.seguranca.valor);
    expect(gerarCasa({ ...base, andares: 8 }).tipo).toContain('Prédio residencial');
  });

  it('estabelecimento: o tipo sai do nome; horário e clientes seguem a hora; a taxa só aparece com domínio (ou rara)', () => {
    expect(tipoDeEstabelecimento('Padaria Brasil').tipo).toBe('Padaria');
    expect(tipoDeEstabelecimento('Farmácia São João').tipo).toBe('Farmácia');
    expect(tipoDeEstabelecimento('Igreja Batista').tipo).toBe('Templo religioso');
    expect(tipoDeEstabelecimento(null).tipo).toBe('Comércio');
    const e = (hora: number, dominio: { nome: string; tipo: 'facção' | 'milícia' } | null = null, sem = 5) => gerarEstabelecimento({ semente: sem, nome: 'Padaria Brasil', tipoPredio: 'comercial', endereco: { rua: 'R', numero: 1, bairro: 'B', regiao: 'Centro' }, w: 12, d: 10, andares: 1, lv: 60, hora, fimDeSemana: false, chuva: 0, dominio });
    expect(e(12.5).aberto).toBe(true);
    expect(e(3).aberto).toBe(false);
    expect(e(3).clientesAgora).toBe(0);
    expect(e(12.5).clientesAgora).toBeGreaterThan(0);
    let pagam = 0, livres = 0;
    for (let s = 1; s <= 400; s++) { if (e(12, { nome: 'Liga do Asfalto', tipo: 'milícia' }, s).taxa.paga) pagam++; if (e(12, null, s).taxa.paga) livres++; }
    expect(pagam).toBeGreaterThan(300);
    expect(livres).toBeLessThan(30);
  });

  it('carro: o modelo corresponde ao tipo; viatura e ônibus têm o rótulo certo', () => {
    expect(gerarCarro(1, 10).tipo).toBe('viatura');
    expect(gerarCarro(1, 10).modelo).toContain('Viatura');
    expect(gerarCarro(1, 1, 30).tipo).toBe('ônibus');
    expect(gerarCarro(1, 1, 30).passageiros).toBe(30);
    expect(gerarCarro(7, 2).modelo).toMatch(/Honda|Yamaha/);
    expect(gerarCarro(5, 0)).toEqual(gerarCarro(5, 0));
  });

  it('ponto turístico: vazio de madrugada, mais gente no fim de semana, menos na chuva; todos têm história e nota', () => {
    const m = MARCOS[0];
    expect(visitantesAgora(m, 3, false, 0, 1)).toBe(0);
    expect(visitantesAgora(m, 11, true, 0, 1)).toBeGreaterThan(visitantesAgora(m, 11, false, 0, 1));
    expect(visitantesAgora(m, 11, false, 1, 1)).toBeLessThan(visitantesAgora(m, 11, false, 0, 1));
    expect(curvaTurismo(11)).toBeGreaterThan(curvaTurismo(18));
    for (const k of MARCOS) { expect(k.historia.length).toBeGreaterThan(60); expect(k.nota).toBeGreaterThan(3); expect(k.nota).toBeLessThanOrEqual(5); }
    expect(MARCOS.map((k) => k.nome)).toContain('Cristo Redentor');
  });

  it('sorteio é determinístico e uniforme o bastante', () => {
    expect(sorteio(5, 3)).toBe(sorteio(5, 3));
    let s = 0;
    for (let i = 0; i < 2000; i++) s += sorteio(i, 1);
    expect(s / 2000).toBeGreaterThan(0.45); expect(s / 2000).toBeLessThan(0.55);
  });
});
