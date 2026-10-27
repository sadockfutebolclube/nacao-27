import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DadosMacro } from '../src/data/macro';
import { IndiceUFs } from '../src/data/schemas';
import { Rng } from '../src/sim/core/rng';
import { compilar, variaveisDe } from '../src/sim/eventos/motor';
import { STORYLETS_PRES } from '../src/sim/presidente/biblioteca';
import { MEDIDAS } from '../src/sim/presidente/dados';
import { COPOM, criarEconomia, decisaoCopom, passoEconomia } from '../src/sim/presidente/economia';
import { domingo, Presidencia, type PresInit } from '../src/sim/presidente/presidencia';

const macro = DadosMacro.parse(JSON.parse(readFileSync('public/data/macro/brasil.json', 'utf8')));
const indice = IndiceUFs.parse(JSON.parse(readFileSync('public/data/ufs/index.json', 'utf8')));
const init = (over: Partial<PresInit> = {}): PresInit => ({
  partido: 'UPB', origem: 'MG', nome: 'Helena Duarte', genero: 'f', anoInicio: 2027, semente: 'teste', macro,
  ufs: indice.ufs.map((u) => ({ sigla: u.sigla, nome: u.nome, regiao: u.regiao.nome, populacao: u.populacao.valor, cidades: [u.tracos.capital.nome] })), ...over,
});
const nova = (over: Partial<PresInit> = {}) => new Presidencia(init(over), STORYLETS_PRES);

describe('Fase 9 — dados e economia', () => {
  it('conjuntura real do Banco Central e eleitorado do TSE', () => {
    expect(macro.selicMeta).toBeGreaterThan(2);
    expect(macro.selicMeta).toBeLessThan(30);
    expect(macro.cambio).toBeGreaterThan(3);
    expect(macro.dividaBruta).toBeGreaterThan(60);
    expect(macro.pibNominal).toBeGreaterThan(10e12);
    expect(Object.keys(macro.eleitorado)).toHaveLength(27);
    expect(Object.values(macro.eleitorado).reduce((a, b) => a + b, 0)).toBeGreaterThan(150e6);
    expect(macro.historico.ipca12m.length).toBeGreaterThan(12);
  });

  it('Copom reage à inflação e o risco fiscal desvaloriza o real', () => {
    const e = criarEconomia(macro);
    e.expectativa = 7;
    expect(decisaoCopom(e, 0)).toBeGreaterThan(e.selic);
    e.expectativa = 2.5; e.hiato = -3;
    expect(decisaoCopom(e, 0)).toBeLessThan(e.selic);
    // mesmo choque, duas economias: a de dívida maior fica com o dólar mais caro
    const a = criarEconomia(macro), b = criarEconomia(macro);
    b.divida += 20;
    const ra = new Rng(5), rb = new Rng(5);
    for (let i = 0; i < 24; i++) { passoEconomia(a, ra, { impulso: 0, descumpriuMeta: false }); passoEconomia(b, rb, { impulso: 0, descumpriuMeta: false }); }
    expect(b.risco).toBeGreaterThan(a.risco);
    expect(b.cambio).toBeGreaterThan(a.cambio);
    expect(COPOM).toHaveLength(8);
  });

  it('quatro anos sem jogador ficam em faixas plausíveis', () => {
    const e = criarEconomia(macro);
    const rng = new Rng(11);
    for (let i = 0; i < 48; i++) {
      passoEconomia(e, rng, { impulso: 0, descumpriuMeta: false });
      if (COPOM.some(([m]) => m === (i % 12) + 1)) e.selic = decisaoCopom(e, 0.2);
    }
    expect(e.inflacao).toBeGreaterThan(0);
    expect(e.inflacao).toBeLessThan(12);
    expect(e.desemprego).toBeGreaterThan(3);
    expect(e.desemprego).toBeLessThan(12);
    expect(e.divida).toBeGreaterThan(macro.dividaBruta);
    expect(e.divida).toBeLessThan(115);
  });
});

describe('Fase 9 — instituições', () => {
  it('Congresso, STF, governadores e coalizão na posse', () => {
    const p = nova();
    expect(p.camara.cadeiras).toBe(513);
    expect(p.senado.cadeiras).toBe(81);
    expect(p.camara.deputados.filter((d) => d.cidade === 'SP')).toHaveLength(70);
    expect(p.stf).toHaveLength(11);
    expect(p.governadores).toHaveLength(27);
    expect(Object.values(p.posturas)).toContain('base');
    expect(Object.values(p.posturas)).toContain('oposicao');
    expect(p.base_()).toBeGreaterThan(0.3);
    expect(p.base_()).toBeLessThan(0.85);
    expect(p.aprovacao).toBeGreaterThan(35);
    expect(p.aprovacao).toBeLessThan(70);
  });

  it('MP vale na hora e caduca sem votação em 120 dias', () => {
    const p = nova();
    const antes = p.eco.despesas.bolsa;
    expect(p.enviar('renda-ampliada', 'MP').ok).toBe(true);
    expect(p.eco.despesas.bolsa).toBeCloseTo(antes + 0.3, 5);
    const mp = p.propostas[0];
    mp.votaEm = 9999; // o Congresso engaveta
    p.avancar(125);
    expect(mp.status).toBe('caducou');
    expect(p.vigentes.some((v) => v.uid === mp.uid)).toBe(false);
    expect(p.eco.despesas.bolsa).toBeLessThan(antes + 0.05);
  });

  it('PEC passa por dois turnos em cada Casa', () => {
    const p = nova({ partido: 'CDF', semente: 'pec' });
    p.capital = 100;
    expect(p.enviar('seguranca', 'PEC').ok).toBe(true);
    const x = p.propostas[0];
    for (const a of ['lideres', 'emendas', 'cargos', 'urgencia'] as const) p.articular(x.uid, a);
    p.avancar(400);
    expect(x.status === 'aprovada' || x.status === 'rejeitada').toBe(true);
    if (x.status === 'aprovada') expect(x.log.filter((l) => l.includes('aprova'))).toHaveLength(4);
    expect(p.votacoes.some((v) => v.titulo.includes('1º turno'))).toBe(true);
  });

  it('vaga no STF aos 75 anos e sabatina no Senado', () => {
    const p = nova();
    p.stf[0].idade = 74;
    p.avancar(365);
    expect(p.stf.length === 10 || p.stf.some((m) => m.indicadoPorVoce)).toBe(true);
    if (p.vagaSTF) {
      p.capital = 100;
      const r = p.indicarSTF(0);
      expect(p.votacoes[0].titulo).toContain('STF');
      if (r.ok) expect(p.stf.some((m) => m.indicadoPorVoce)).toBe(true);
    }
  });

  it('meta fiscal descumprida aciona os gatilhos do arcabouço', () => {
    const p = nova();
    p.base.custeio += 1.5; // gasto bem acima da meta
    p.avancar(365);
    expect(p.descumprimentos).toBeGreaterThanOrEqual(1);
    expect(p.gatilhos).toBe(true);
    expect(p.enviar('renda-ampliada', 'PL').ok).toBe(false);
  });
});

describe('Fase 9 — eleição, eventos e save', () => {
  it('calendário eleitoral real e eleição por UF em 2030', () => {
    expect(domingo(2030, 10, 1)).toBe(6);
    expect(domingo(2030, 10, -1)).toBe(27);
    const p = nova({ semente: 'eleicao' });
    while (p.ano < 2030 || p.mes < 11) p.avancar(30);
    const el = p.eleicao!;
    expect(el.fase).toBe('encerrada');
    expect(el.vencedor).toBeDefined();
    expect(Object.keys(el.primeiro!.porUF)).toHaveLength(27);
    expect(el.primeiro!.total.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 5);
    expect(el.pesquisas.length).toBeGreaterThan(3);
    p.avancar(70);
    expect(p.mandato === 2 || p.fim !== null).toBe(true);
  });

  it('biblioteca presidencial válida: condições e variáveis conhecidas', () => {
    expect(STORYLETS_PRES.length).toBeGreaterThanOrEqual(40);
    expect(new Set(STORYLETS_PRES.map((s) => s.id)).size).toBe(STORYLETS_PRES.length);
    const ctx = nova().contexto();
    const textos = ['presidente', 'titulo', 'ministroFazenda', 'presidenteCamara', 'presidenteSenado', 'presidenteBC', 'uf', 'sigla', 'governador', 'oposicao', 'partido', 'tv', 'jornal', 'instituto'];
    for (const s of STORYLETS_PRES) {
      for (const c of [...s.se, ...s.escolhas.flatMap((e) => e.se)]) {
        compilar(c);
        for (const v of variaveisDe(c)) expect(Object.keys(ctx), `${s.id}: ${c}`).toContain(v);
      }
      const tudo = [s.titulo, s.texto, ...s.escolhas.flatMap((e) => [e.texto, e.resultado ?? '', ...e.depois.map((d) => d.texto)])].join(' ');
      for (const m of tudo.matchAll(/\{([a-zA-Z]+)\}/g)) expect(textos, `${s.id}: {${m[1]}}`).toContain(m[1]);
    }
    for (const m of MEDIDAS) expect(m.tipos.length).toBeGreaterThan(0);
  });

  it('save/load: a Presidência restaurada segue igual', () => {
    const a = nova({ semente: 'save' });
    a.enviar('pac', 'PL');
    a.avancar(200);
    const b = Presidencia.restaurar(a.serializar(), macro, STORYLETS_PRES);
    a.avancar(150); b.avancar(150);
    expect(b.aprovacao).toBeCloseTo(a.aprovacao, 8);
    expect(b.eco.selic).toBe(a.eco.selic);
    expect(b.eco.divida).toBeCloseTo(a.eco.divida, 8);
    expect(b.noticias[0]).toEqual(a.noticias[0]);
  });
});

describe('Fase 9 — nuvem', () => {
  it('save comprimido (gzip + base64) volta idêntico e encolhe', async () => {
    const { gzipB64, gunzipB64, nuvemConfigurada } = await import('../src/cloud/nuvem');
    const json = nova({ semente: 'nuvem' }).serializar();
    const z = await gzipB64(json);
    expect(await gunzipB64(z)).toBe(json);
    expect(z.length).toBeLessThan(json.length / 2);
    expect(nuvemConfigurada()).toBe(false);
    const sql = readFileSync('supabase/migrations/20261026000000_nacao27_nuvem.sql', 'utf8');
    expect(sql).toContain('enable row level security');
    expect((sql.match(/create policy/g) ?? []).length).toBe(6);
  });
});
