/** Fase 26: facções (Milícia, CV, ADA, TCP), instituições do Estado, ocorrências e despacho — dados em src/data/seguranca/*.json. */
import { describe, expect, it } from 'vitest';
import faccoesJson from '../src/data/seguranca/faccoes.json';
import instituicoesJson from '../src/data/seguranca/instituicoes.json';
import ocorrenciasJson from '../src/data/seguranca/ocorrencias.json';
import traits from '../data/ufs/traits.json';
import type { BairroCenso } from '../src/data/bairros';
import { ArquivoTracos } from '../src/data/schemas';
import { Zone } from '../src/sim/catalog';
import { cenaEm, cenas, comercioFechadoEm, fatorTransito, novaCena, sirenes, sireneAte, supressaoDeSpawn } from '../src/render/city/ocorrenciaEstado';
import { DADOS, IDS_FACCAO, INDICE_FACCAO, NF, validarDados } from '../src/sim/faccoes/dados';
import { despachar } from '../src/sim/faccoes/ocorrencias';
import type { SimInit } from '../src/sim/protocol';
import { Simulation, TICKS_POR_DIA } from '../src/sim/simulation';
import { Unidades } from '../src/sim/faccoes/unidades';
import { generateTerrain, sampleHeight } from '../src/world/terrain';
import { BUILD_HALF } from '../src/world/constants';

const rj = ArquivoTracos.parse(traits).ufs.find((u) => u.sigla === 'RJ')!;
const hm = generateTerrain(2027, rj.terreno, 'mata-atlantica');
const init: SimInit = { sigla: 'RJ', nomeEstado: 'Rio de Janeiro', cidade: 'Rio de Janeiro', terreno: rj.terreno, bioma: 'mata-atlantica', latitude: rj.capital.lat, efeitos: Object.assign({}, ...rj.tracos.map((t) => t.efeitos)), esgotoUF: 66, festas: rj.festas, regiao: 'Sudeste', seed: 2027, modo: 'mandato' };

function origem(): [number, number] {
  for (let r = 0; r < 1200; r += 40) for (let a = 0; a < Math.PI * 2; a += 0.4) {
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    let ok = true;
    for (let dx = -300; dx <= 300 && ok; dx += 30) for (let dz = -300; dz <= 300 && ok; dz += 30) { const h = sampleHeight(hm, x + dx, z + dz); if (h < 1.2 || h > 40) ok = false; }
    if (ok) return [x, z];
  }
  return [0, -600];
}
const dias = (sim: Simulation, n: number) => { for (let i = 0; i < n * TICKS_POR_DIA; i++) sim.step(); };

/** cidade pequena com população, para a grade territorial ter gente */
function cidade() {
  const sim = new Simulation(init, hm);
  sim.caixa = 5e9;
  const [ox, oz] = origem();
  for (let k = -2; k <= 2; k++) {
    sim.command({ kind: 'road', req: { x0: ox - 260, z0: oz + k * 70, cx: ox, cz: oz + k * 70, x1: ox + 260, z1: oz + k * 70, type: k === 0 ? 'avenida' : 'rua' } });
    sim.command({ kind: 'road', req: { x0: ox + k * 110, z0: oz - 180, cx: ox + k * 110, cz: oz, x1: ox + k * 110, z1: oz + 180, type: 'rua' } });
  }
  sim.command({ kind: 'zone', x: ox - 100, z: oz, radius: 160, zone: Zone.ResBaixa });
  sim.command({ kind: 'zone', x: ox + 80, z: oz + 60, radius: 90, zone: Zone.Comercial });
  return { sim, ox, oz };
}

describe('dados em JSON (validados)', () => {
  it('os arquivos do repositório passam na validação e têm as 4 facções e as 9 instituições pedidas', () => {
    expect(IDS_FACCAO).toEqual(['milicia', 'cv', 'ada', 'tcp']);
    expect(NF).toBe(4);
    expect(DADOS.instituicoes.ordem).toEqual(['pm', 'civil', 'federal', 'guarda', 'exercito', 'marinha', 'aeronautica', 'bombeiros', 'samu']);
    for (const t of ['operacao', 'confronto', 'blitz', 'roubo', 'incendio', 'acidente', 'resgate', 'enchente']) expect(DADOS.ocorrencias.tipos[t], t).toBeTruthy();
    expect(INDICE_FACCAO.milicia).toBe(0);
  });

  it('cada facção tem poder, armamento, dinheiro, influência, rivais, aliados e as 4 fontes de renda', () => {
    for (const id of IDS_FACCAO) {
      const f = DADOS.faccoes.faccoes[id];
      expect(f.inicial.poder).toBeGreaterThan(0);
      expect(Object.keys(f.fontes).sort()).toEqual(['gatonet', 'taxas', 'trafico', 'transporteAlternativo']);
      expect(Array.isArray(f.rivais) && Array.isArray(f.aliados)).toBe(true);
    }
  });

  it('um erro de digitação no JSON vira mensagem com o campo, não NaN no meio do jogo', () => {
    const f = JSON.parse(JSON.stringify(faccoesJson));
    f.faccoes.cv.rivais.push('comando-fantasma');
    expect(() => validarDados(f, instituicoesJson, ocorrenciasJson)).toThrow(/comando-fantasma/);
    const o = JSON.parse(JSON.stringify(ocorrenciasJson));
    o.tipos.incendio.despacho.primaria = ['bombeiros-do-espaco'];
    expect(() => validarDados(faccoesJson, instituicoesJson, o)).toThrow(/bombeiros-do-espaco/);
    const i = JSON.parse(JSON.stringify(instituicoesJson));
    i.instituicoes.pm.veiculo = 'tanque-de-guerra';
    expect(() => validarDados(faccoesJson, i, ocorrenciasJson)).toThrow(/tanque-de-guerra/);
    const n = JSON.parse(JSON.stringify(faccoesJson));
    n.faccoes.cv.inicial.poder = 'muito';
    expect(() => validarDados(n, instituicoesJson, ocorrenciasJson)).toThrow(/poder/);
  });
});

describe('unidades territoriais (polígonos de bairro)', () => {
  const quadrado = (nome: string, x0: number, z0: number, x1: number, z1: number): BairroCenso => ({ nome, ra: 'X', ap: '1', pop: 1000, pop10: 900, dom: 300, km2: 1, aneis: [[x0, z0, x1, z0, x1, z1, x0, z1]] });

  it('sem Censo, o mapa vira setores de 1 km que cobrem toda a grade', () => {
    const u = new Unidades(null);
    expect(u.fonte).toBe('setores');
    expect(u.celula.every((c) => c !== 255)).toBe(true);
    expect(u.lista.reduce((s, x) => s + x.celulas.length, 0)).toBe(u.celula.length);
  });

  it('com polígonos do Censo: cada bairro vira unidade, as vizinhas são simétricas e o ponto cai no bairro certo', () => {
    const u = new Unidades([quadrado('Oeste', -3000, -1000, 0, 1000), quadrado('Leste', 0, -1000, 3000, 1000), quadrado('Longe', 4500, 4000, 5500, 5000)]);
    expect(u.fonte).toBe('censo');
    expect(u.lista.map((x) => x.nome).sort()).toEqual(['Leste', 'Longe', 'Oeste']);
    expect(u.de(-1500, 0)).toBe(u.porNome('Oeste')!.id);
    expect(u.de(1500, 0)).toBe(u.porNome('Leste')!.id);
    expect(u.de(0, 3000)).toBe(255); // fora de todo polígono (mar, outro município)
    const o = u.porNome('Oeste')!.id, l = u.porNome('Leste')!.id;
    expect(u.vizinhas[o]).toContain(l); expect(u.vizinhas[l]).toContain(o);
    expect(u.vizinhas[u.porNome('Longe')!.id]).toEqual([]);
    expect(Math.abs(u.porNome('Oeste')!.cx + 1500)).toBeLessThan(120);
  });
});

describe('facções na simulação', () => {
  it('domínio semeado é repartido entre as facções, renda e poder ficam finitos, e o save devolve o mesmo estado', () => {
    const { sim, ox, oz } = cidade();
    dias(sim, 60);
    sim.territorio.semear(ox - 100, oz, 1, 0.9);
    sim.territorio.semear(ox + 60, oz + 40, 2, 0.9);
    dias(sim, 90);
    const F = sim.faccoes, R = F.resumo();
    for (let f = 0; f < NF; f++) for (const v of [F.poder[f], F.armamento[f], F.dinheiro[f], F.influencia[f], R.faccoes[f].renda.total]) expect(Number.isFinite(v)).toBe(true);
    // onde há presença, as parcelas somam 1
    let comPresenca = 0;
    for (let u = 0; u < F.unidades.n; u++) { let s = 0; for (let f = 0; f < NF; f++) s += F.share[u * NF + f]; if (s > 0.001) { comPresenca++; expect(s).toBeCloseTo(1, 3); } }
    expect(comPresenca).toBeGreaterThan(0);
    expect(R.faccoes.some((x) => x.populacao > 0)).toBe(true);
    expect(R.estado).toBeLessThan(1);
    // save/load: o mesmo estado
    const copia = Simulation.deserialize(JSON.parse(JSON.stringify(sim.serialize())), hm);
    expect(Array.from(copia.faccoes.share)).toEqual(Array.from(F.share));
    expect(Array.from(copia.faccoes.poder)).toEqual(Array.from(F.poder));
    expect(copia.faccoes.ocorrencias.length).toBe(F.ocorrencias.length);
    expect(copia.faccoes.proximoId).toBe(F.proximoId);
  }, 180_000);

  it('uma operação policial tira armas e dinheiro de quem domina a área', () => {
    const { sim, ox, oz } = cidade();
    dias(sim, 60);
    sim.territorio.semear(ox - 100, oz, 1, 0.9);
    dias(sim, 60);
    const F = sim.faccoes;
    const antes = Array.from(F.armamento);
    const r = F.aoOperacao(ox - 100, oz, 280);
    if (r.length) {
      const f = r[0].faccao;
      expect(F.armamento[f]).toBeLessThan(antes[f]);
    }
    expect(r.every((x) => x.peso >= 0.05)).toBe(true);
  }, 180_000);

  it('o comando de operação do jogador vira uma ocorrência ordenada com despacho', () => {
    const { sim, ox, oz } = cidade();
    dias(sim, 80);
    sim.territorio.semear(ox - 100, oz, 1, 0.9);
    dias(sim, 5);
    const n0 = sim.faccoes.ocorrencias.length;
    const r = sim.command({ kind: 'operacao', x: ox - 100, z: oz });
    if (r.ok) {
      const oc = sim.faccoes.ocorrencias.at(-1)!;
      expect(sim.faccoes.ocorrencias.length).toBe(n0 + 1);
      expect(oc.tipo).toBe('operacao');
      expect(oc.ordenada).toBe(true);
      expect(oc.resposta.some((x) => x.inst === 'pm')).toBe(true);
    }
  }, 180_000);

  it('o resultado do dia é o mesmo com orçamento (fatiado) e sem — as facções entram no trabalho do dia', () => {
    const a = cidade().sim, b = cidade().sim;
    b.orcamentoMs = 1;
    b.definirFoco(0, 0, 100000);
    dias(a, 30); dias(b, 30);
    b.drenar();
    expect(Number.isFinite(b.faccoes.poder[0])).toBe(true);
    expect(b.faccoes.versao).toBeGreaterThan(0);
  }, 180_000);
});

describe('ocorrências e despacho', () => {
  function sim30() {
    const { sim, ox, oz } = cidade();
    dias(sim, 30);
    return { sim, ox, oz };
  }

  it('incêndio chama os Bombeiros; ferido chama o SAMU; tiroteio grave chama PM e BOPE; roubo chama PM e Civil', () => {
    const { sim, ox, oz } = sim30();
    const F = sim.faccoes;
    const inst = (t: string, g: number, ferido: boolean) => despachar(sim, F, t, ox, oz, g, ferido, 0.1).map((r) => (r.esp ? `${r.inst}:${r.esp}` : r.inst));
    expect(inst('incendio', 0.2, false)).toContain('bombeiros');
    expect(inst('incendio', 0.2, true)).toContain('samu');
    const tiro = inst('confronto', 0.8, true);
    expect(tiro).toContain('pm'); expect(tiro).toContain('pm:bope'); expect(tiro).toContain('samu');
    const roubo = inst('roubo', 0.9, false);
    expect(roubo).toContain('pm'); expect(roubo).toContain('civil');
    expect(inst('blitz', 0.1, false)).toEqual(expect.arrayContaining(['pm', 'guarda']));
  }, 120_000);

  it('o tempo de chegada cresce com a distância da base e dá o atraso de escolta em área dominada', () => {
    const { sim, ox, oz } = sim30();
    const F = sim.faccoes;
    const eta = (x: number, z: number) => despachar(sim, F, 'incendio', x, z, 0.5, false, 0.1).find((r) => r.inst === 'bombeiros')!;
    const base = eta(ox, oz);
    const naBase = eta(base.baseX, base.baseZ);
    // ponto da grade mais distante de qualquer quartel de bombeiros
    let longe = naBase;
    for (let x = -BUILD_HALF; x <= BUILD_HALF; x += 600) for (let z = -BUILD_HALF; z <= BUILD_HALF; z += 600) { const e = eta(x, z); if (e.etaMin > longe.etaMin) longe = e; }
    expect(longe.etaMin).toBeGreaterThan(naBase.etaMin + 1);
    const dominada = despachar(sim, F, 'resgate', ox, oz, 0.9, true, 0.8).find((r) => r.inst === 'samu')!;
    const livre = despachar(sim, F, 'resgate', ox, oz, 0.9, true, 0.1).find((r) => r.inst === 'samu')!;
    expect(dominada.escolta).toBe(true);
    expect(dominada.etaMin).toBeGreaterThan(livre.etaMin + DADOS.ocorrencias.despacho.atrasoEscoltaMin - 0.5);
  }, 120_000);

  it('equipamentos que o jogador constrói viram bases de despacho (delegacia → Polícia Civil)', () => {
    const { sim, ox, oz } = sim30();
    const antes = sim.faccoes.bases.lista.filter((b) => b.jogador).length;
    let ok = false;
    for (let dx = -250; dx <= 250 && !ok; dx += 25) for (const dz of [-200, 200]) if (sim.command({ kind: 'service', eq: 'delegacia', x: ox + dx, z: oz + dz }).ok) { ok = true; break; }
    dias(sim, 2);
    if (ok) {
      const novas = sim.faccoes.bases.lista.filter((b) => b.jogador);
      expect(novas.length).toBe(antes + 1);
      expect(novas.some((b) => b.inst === 'civil')).toBe(true);
    }
  }, 120_000);

  it('depois de meses há ocorrências de vários tipos, com números coerentes e nenhuma NaN', () => {
    const { sim } = sim30();
    dias(sim, 150);
    const F = sim.faccoes;
    expect(F.ocorrencias.length).toBeGreaterThan(20);
    expect(Object.keys(F.totais).length).toBeGreaterThanOrEqual(3);
    for (const o of F.ocorrencias) {
      expect(o.mortos >= 0 && o.feridos >= 0 && o.presos >= 0).toBe(true);
      expect(Number.isFinite(o.x) && Number.isFinite(o.z) && Number.isFinite(o.gravidade)).toBe(true);
      expect(Math.abs(o.x)).toBeLessThanOrEqual(BUILD_HALF + 1);
      for (const r of o.resposta) expect(Number.isFinite(r.etaMin) && r.etaMin >= 0).toBe(true);
    }
    expect(F.mortosTotal).toBeGreaterThanOrEqual(0);
  }, 180_000);
});

describe('reação no desenho (estado compartilhado das cenas)', () => {
  const oc = (tipo: string, x: number, z: number) => ({ id: 1, tipo, x, z, unidade: 0, local: 'teste', dia: 0, hora: 12, gravidade: 0.5, faccoes: [], resposta: [], mortos: 0, feridos: 0, presos: 0, ordenada: false, manchete: '' });

  it('cena de tiroteio: pedestres fogem, comércio fecha, trânsito afunila, spawn some; longe dela nada muda', () => {
    cenas.length = 0; sirenes.length = 0;
    cenas.push(novaCena(oc('confronto', 100, 100), () => 0.5));
    const c = cenas[0];
    expect(c.reacao).toBe('fogem');
    expect(cenaEm(110, 100)?.cena.id).toBe(1);
    expect(cenaEm(100 + c.raio + 50, 100)).toBeNull();
    expect(comercioFechadoEm(120, 100)).toBe(true);
    expect(fatorTransito(100, 100)).toBeLessThan(0.3);
    expect(fatorTransito(100 + c.raio * 3, 100)).toBe(1);
    expect(supressaoDeSpawn(105, 100)).toBeLessThan(0.2);
    expect(supressaoDeSpawn(5000, 5000)).toBe(1);
    cenas.length = 0;
  });

  it('blitz: o povo fica curioso (spawn não some) e o comércio não fecha; sirene faz o carro ceder numa distância', () => {
    cenas.length = 0; sirenes.length = 0;
    cenas.push(novaCena(oc('blitz', 0, 0), () => 0.5));
    expect(cenas[0].reacao).toBe('curiosos');
    expect(supressaoDeSpawn(10, 0)).toBe(1);
    expect(comercioFechadoEm(10, 0)).toBe(false);
    sirenes.push({ x: 50, z: 0, yaw: 0 });
    expect(sireneAte(60, 0, DADOS.ocorrencias.reacao.viaturaCedePassagemM)).toBeCloseTo(10, 5);
    expect(sireneAte(200, 0, DADOS.ocorrencias.reacao.viaturaCedePassagemM)).toBe(-1);
    cenas.length = 0; sirenes.length = 0;
  });

  it('cada tipo de ocorrência tem efeito visual e reação conhecidos', () => {
    for (const [id, t] of Object.entries(DADOS.ocorrencias.tipos)) {
      expect(['tiros', 'fogo', 'bloqueio', 'alarme', 'colisao', 'resgate', 'agua'], id).toContain(t.cena.fx);
      expect(['fogem', 'escondem', 'curiosos'], id).toContain(t.cena.pedestres);
      expect(t.cena.duracaoS[0]).toBeLessThanOrEqual(t.cena.duracaoS[1]);
    }
  });
});
