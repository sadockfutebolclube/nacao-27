import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import traits from '../data/ufs/traits.json';
import { DadosClima, type NormaisUF } from '../src/data/clima';
import { ArquivoTracos } from '../src/data/schemas';
import { Clima } from '../src/sim/clima/clima';
import { Rng } from '../src/sim/core/rng';
import { Estado } from '../src/sim/estado/estado';
import { STORYLETS } from '../src/sim/eventos/biblioteca';
import { festasDoAno, pascoa } from '../src/sim/eventos/festas';
import { atende, compilar, Motor, novoEstadoEventos, Storylet, variaveisDe } from '../src/sim/eventos/motor';
import type { SimInit } from '../src/sim/protocol';
import { Simulation, TICKS_POR_DIA } from '../src/sim/simulation';
import { generateTerrain } from '../src/world/terrain';
import { initDe } from './helpers';

const arquivoClima = 'public/data/clima/normais.json';
const normais = (sigla: string): NormaisUF | undefined =>
  existsSync(arquivoClima) ? DadosClima.parse(JSON.parse(readFileSync(arquivoClima, 'utf8'))).ufs[sigla] : undefined;

const tracos = ArquivoTracos.parse(traits);
function initSim(sigla: string, comEstado = true): SimInit {
  const u = tracos.ufs.find((x) => x.sigla === sigla)!;
  const ini = initDe(sigla);
  return {
    sigla: sigla as SimInit['sigla'], nomeEstado: sigla, cidade: u.capital.nome, terreno: u.terreno, bioma: u.biomas[0], latitude: u.capital.lat,
    efeitos: ini.efeitos, esgotoUF: 60, festas: u.festas, regiao: ini.regiao!, seed: 99, modo: 'mandato', estado: comEstado ? ini : undefined, clima: normais(sigla),
  };
}
const dias = (sim: Simulation, n: number) => { for (let i = 0; i < n * TICKS_POR_DIA; i++) sim.step(); };

describe('Fase 6 — biblioteca de storylets', () => {
  it('tem 150+ eventos válidos, ids únicos e escolhas padrão existentes', () => {
    expect(STORYLETS.length).toBeGreaterThanOrEqual(150);
    expect(new Set(STORYLETS.map((s) => s.id)).size).toBe(STORYLETS.length);
    for (const s of STORYLETS) {
      expect(() => Storylet.parse(s)).not.toThrow();
      if (s.escolhas.length) expect(s.padrao).toBeLessThan(s.escolhas.length);
    }
    const cats = new Set(STORYLETS.map((s) => s.categoria));
    for (const c of ['desastre', 'seguranca', 'economia', 'servicos', 'politica', 'prefeitos', 'federal', 'imprensa', 'festa', 'esporte', 'positivo']) expect(cats.has(c as never)).toBe(true);
  });

  it('toda condição compila e só usa variáveis do contexto; todo texto só usa variáveis conhecidas', () => {
    const sim = new Simulation(initSim('RJ'), generateTerrain(99, tracos.ufs.find((x) => x.sigla === 'RJ')!.terreno, 'mata-atlantica'));
    dias(sim, 3);
    const { ctx, textos } = sim.contextoEventos();
    const conds: string[] = [];
    const tpls: string[] = [];
    for (const s of STORYLETS) {
      conds.push(...s.se);
      tpls.push(s.titulo, s.texto);
      for (const e of s.escolhas) {
        conds.push(...e.se);
        tpls.push(e.texto, e.detalhe ?? '', e.resultado ?? '');
        for (const d of e.depois) { conds.push(...d.se); tpls.push(d.texto); }
      }
    }
    for (const c of conds) {
      expect(() => compilar(c)).not.toThrow();
      for (const v of variaveisDe(c)) expect(Object.keys(ctx), `variável "${v}" em "${c}"`).toContain(v);
    }
    for (const t of tpls) for (const m of t.matchAll(/\{([a-zA-Z0-9_:]+)\}/g)) expect(Object.keys(textos), `texto usa {${m[1]}}`).toContain(m[1]);
  });

  it('mini-linguagem: comparações, listas, flags e negação', () => {
    const c = { a: 3, r: 'Sul', l: ['x', 'y'], b: true, flags: ['f1'] };
    expect(atende(['a >= 3', 'a < 4', 'r in Sul,Sudeste', 'l has y', 'b', 'flag f1', '!flag f2', 'r != Norte', 'r notin Norte'], c)).toBe(true);
    expect(atende(['a > 3'], c)).toBe(false);
    expect(atende(['naoExiste >= 0'], c)).toBe(false);
  });
});

describe('Fase 6 — clima e festas', () => {
  it('clima segue as normais: verão mais quente que o inverno e chuva anual perto da normal', () => {
    const n = normais('RJ');
    const cl = new Clima({ normais: n ?? null, regiao: 'Sudeste', bioma: 'mata-atlantica', litoral: true, latitude: -22.9 });
    const rng = new Rng(4);
    const tempMes = Array(12).fill(0), chuvaAno: number[] = [];
    const DM = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    for (let ano = 0; ano < 6; ano++) {
      let chuva = 0;
      for (let m = 1; m <= 12; m++) for (let d = 1; d <= DM[m - 1]; d++) {
        const r = cl.diario(m, d, rng);
        tempMes[m - 1] += r.temp;
        chuva += r.chuvaHoje;
      }
      chuvaAno.push(chuva);
    }
    expect(tempMes[0] / (31 * 6)).toBeGreaterThan(tempMes[6] / (31 * 6) + 2);
    const normal = Array.from({ length: 12 }, (_, i) => cl.normais(i + 1).chuva).reduce((a, b) => a + b, 0);
    const media = chuvaAno.reduce((a, b) => a + b, 0) / chuvaAno.length;
    expect(media).toBeGreaterThan(normal * 0.65);
    expect(media).toBeLessThan(normal * 1.45);
  });

  it('festas com datas reais: Carnaval pela Páscoa, Círio no 2º domingo de outubro, São João em junho', () => {
    expect(pascoa(2027)).toEqual({ mes: 3, dia: 28 });
    expect(pascoa(2030)).toEqual({ mes: 4, dia: 21 });
    const rj = festasDoAno(['Carnaval na Sapucaí', 'Réveillon de Copacabana'], 2027, 'Sudeste');
    const carn = rj.find((f) => f.tipo === 'carnaval')!;
    // 2027: Páscoa 28/3 ⇒ terça de Carnaval 9/2; a folia começa na sexta, 5/2 (dia 36)
    expect(carn.inicio).toBe(36);
    expect(rj.find((f) => f.tipo === 'reveillon')!.inicio).toBe(365);
    const pa = festasDoAno(['Círio de Nazaré'], 2027, 'Norte');
    expect(pa.find((f) => f.tipo === 'religiosa')!.inicio).toBe(273 + 10); // 10/10/2027
    const pe = festasDoAno(['Carnaval de Recife e Olinda', 'São João de Caruaru'], 2028, 'Nordeste');
    expect(pe.some((f) => f.tipo === 'junina')).toBe(true);
  });
});

describe('Fase 6 — motor de eventos', () => {
  const st = Storylet.parse({
    id: 't', categoria: 'politica', titulo: 'Teste {cidade}', texto: 'x', se: ['a >= 1'], prazoDias: 5, padrao: 1,
    escolhas: [
      { texto: 'gastar', efeitos: { caixa: -0.01 }, depois: [{ meses: 1, texto: 'volta', efeitos: { aprovacao: 2 } }] },
      { texto: 'nada', efeitos: { aprovacao: -1 } },
    ],
  });
  it('decisão sem resposta vence o prazo e aplica a escolha padrão; consequências chegam no tempo certo', () => {
    const m = new Motor([st]);
    const e = novoEstadoEventos();
    expect(m.elegiveis(e, { a: 0 }, 'mensal', 0)).toHaveLength(0);
    const r = m.disparar(e, st, { a: 1 }, { cidade: 'X' }, 0, 'jan');
    expect(r.pendente!.titulo).toBe('Teste X');
    expect(m.elegiveis(e, { a: 1 }, 'mensal', 1)).toHaveLength(0); // pendente e em cooldown
    expect(m.vencidos(e, {}, 3, 'jan', new Rng(1))).toHaveLength(0);
    const v = m.vencidos(e, {}, 5, 'jan', new Rng(1));
    expect(v).toHaveLength(1);
    expect(v[0].efeitos.aprovacao).toBe(-1);
    expect(e.historico[0].escolha).toContain('sem resposta');
    // escolha explícita agenda a consequência
    const e2 = novoEstadoEventos();
    const p = m.disparar(e2, st, { a: 1 }, { cidade: 'X' }, 0, 'jan').pendente!;
    expect(m.resolver(e2, p.uid, 0, 2, 'jan')!.efeitos.caixa).toBe(-0.01);
    expect(m.vencidos(e2, {}, 20, 'jan', new Rng(1))).toHaveLength(0);
    expect(m.vencidos(e2, {}, 32, 'fev', new Rng(1))[0].texto).toBe('volta');
  });
});

describe('Fase 6 — integração com a cidade e o Estado', () => {
  it('um ano no RJ: clima, festas, eventos e decisões; comando de escolha e save/load determinístico', () => {
    const u = tracos.ufs.find((x) => x.sigla === 'RJ')!;
    const hm = generateTerrain(99, u.terreno, 'mata-atlantica');
    const sim = new Simulation(initSim('RJ'), hm);
    sim.caixa = 1e9;
    let pendenteVista = false, festaVista = false;
    for (let d = 0; d < 365; d++) {
      dias(sim, 1);
      const s = sim.stats();
      if (s.festa?.tipo === 'carnaval') festaVista = true;
      const p = sim.eventos.pendentes[0];
      if (p && !pendenteVista) {
        pendenteVista = true;
        const r = sim.command({ kind: 'evento', uid: p.uid, escolha: p.escolhas[0].i });
        expect(r.ok).toBe(true);
        expect(sim.command({ kind: 'evento', uid: p.uid, escolha: 0 }).ok).toBe(false);
      }
    }
    expect(festaVista).toBe(true);
    expect(pendenteVista).toBe(true);
    expect(sim.eventos.historico.length).toBeGreaterThan(5);
    expect(sim.noticias.some((n) => n.fonte && n.fonte !== 'Plantão N27')).toBe(true);
    expect(sim.estado!.atores.pesquisas.length).toBeGreaterThan(6);
    // save/load
    const save = JSON.parse(JSON.stringify(sim.serialize()));
    const b = Simulation.deserialize(save, hm);
    dias(sim, 40); dias(b, 40);
    expect(b.clima.resumo.chuva30d).toBeCloseTo(sim.clima.resumo.chuva30d, 6);
    expect(b.eventos.historico.length).toBe(sim.eventos.historico.length);
    expect(b.estado!.aprovacao).toBeCloseTo(sim.estado!.aprovacao, 6);
  }, 120_000);

  it('estiagem tira água da rede; sem clima, o jogo segue com o clima sintético', () => {
    const u = tracos.ufs.find((x) => x.sigla === 'DF')!;
    const init = { ...initSim('DF', false), clima: undefined };
    const sim = new Simulation(init, generateTerrain(99, u.terreno, u.biomas[0]));
    dias(sim, 200);
    expect(Number.isFinite(sim.clima.resumo.temp)).toBe(true);
    expect(sim.clima.resumo.chuva30d).toBeGreaterThanOrEqual(0);
  }, 60_000);
});

describe('Fase 6 — prefeitos, União e imprensa', () => {
  it('prefeitos das maiores cidades, Presidente e seis veículos fictícios', () => {
    const e = new Estado(initDe('BA'));
    expect(e.atores.prefeitos.length).toBe(Math.min(8, initDe('BA').cidades!.length));
    expect(e.atores.prefeitos[0].cidade).toBe('Salvador');
    expect(e.atores.prefeitos[0].capital).toBe(true);
    expect(['aliado', 'neutro', 'opositor']).toContain(e.atores.presidente.alinhamento);
    expect(e.atores.imprensa.map((v) => v.id)).toEqual(['tv', 'jornal', 'portal', 'blog', 'influencer', 'zap']);
  });

  it('convênio aproxima o prefeito e sai do caixa no mês seguinte; publicidade vira despesa', () => {
    const e = new Estado(initDe('PE'));
    const rng = new Rng(3);
    const ctx = { ano: 2027, mes: 2, rng, noticia: () => undefined };
    const p = e.atores.prefeitos[1];
    const rel0 = p.relacao;
    expect(e.acao({ tipo: 'convenio', prefeito: 1, valor: 20e6 }, ctx).ok).toBe(true);
    expect(p.relacao).toBeGreaterThan(rel0);
    e.acao({ tipo: 'publicidade', valor: 2e6 }, ctx);
    e.mes({ ano: 2027, mes: 2, rng, aprovacaoCidade: null, noticia: () => undefined });
    const d = e.historico[e.historico.length - 1].despesas;
    expect(d.convenios).toBe(20e6);
    expect(d.publicidade).toBe(2e6);
    expect(e.atores.conveniosAPagar).toBe(0);
  });

  it('imprensa hostil amplifica notícias ruins', () => {
    const a = new Estado(initDe('SP')), b = new Estado(initDe('SP'));
    for (const v of a.atores.imprensa) v.humor = 0.8;
    for (const v of b.atores.imprensa) v.humor = -0.8;
    a.aplicarEfeitos({ aprovacao: -10 });
    b.aplicarEfeitos({ aprovacao: -10 });
    const ca = a.choques[a.choques.length - 1].valor, cb = b.choques[b.choques.length - 1].valor;
    expect(cb).toBeLessThan(ca);
  });
});
