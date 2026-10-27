import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Rng } from '../src/sim/core/rng';
import { Estado, projetarLOA, tetoRRF } from '../src/sim/estado/estado';
import { AREAS } from '../src/sim/estado/tipos';
import { initDe } from './helpers';


function rodar(e: Estado, meses: number, rng: Rng, aoMes?: (m: number) => void, inicio = { ano: 2027, mes: 1 }) {
  const noticias: string[] = [];
  let { ano, mes } = inicio;
  for (let i = 0; i < meses; i++) {
    mes++;
    if (mes > 12) { mes = 1; ano++; }
    e.mes({ ano, mes, rng, aprovacaoCidade: null, noticia: (t) => noticias.push(`${mes}/${ano} ${t}`) });
    aoMes?.(i);
  }
  return noticias;
}

const SIGLAS = ['RJ', 'SP', 'MG', 'RS', 'BA', 'AC', 'RN', 'DF'];

describe('Estado — calibração com dados reais do SICONFI', () => {
  it.each(SIGLAS)('%s: ponto de partida reproduz LRF e mínimos', (sigla) => {
    const ini = initDe(sigla);
    const e = new Estado(ini);
    // RCL calibrada = RCL 2024 × fator 2027
    expect(e.rcl12 / (ini.fiscal.rcl * 1.2)).toBeGreaterThan(0.9);
    expect(e.rcl12 / (ini.fiscal.rcl * 1.2)).toBeLessThan(1.1);
    // % de pessoal próximo do RGF real
    expect(Math.abs(e.pessoalPct * 100 - ini.fiscal.pessoal.pctRcl)).toBeLessThan(6);
  });

  it('mandato inteiro com a LOA herdada: tudo finito, caixa coerente, notícias geradas', () => {
    const linhas: string[] = [];
    for (const sigla of SIGLAS) {
      const e = new Estado(initDe(sigla));
      const rng = new Rng(7);
      let caixaAntes = e.caixa;
      const notas = rodar(e, 48, rng, () => {
        const h = e.historico[e.historico.length - 1];
        // identidade de caixa: Δcaixa = resultado do mês
        expect(e.caixa - caixaAntes).toBeCloseTo(h.resultado, 0);
        caixaAntes = e.caixa;
        for (const v of [e.caixa, e.aprovacao, e.pessoalPct, e.dclPct, ...Object.values(e.ind)]) expect(Number.isFinite(v)).toBe(true);
      });
      const s = e.snapshot(2031, 1);
      linhas.push(`${sigla} RCL ${(s.rcl12 / 1e9).toFixed(1)}bi caixa ${(s.caixa / 1e9).toFixed(1)}bi pessoal ${(s.pessoalPctRcl * 100).toFixed(1)}% DCL ${(s.dclPctRcl * 100).toFixed(0)}% saúde ${(s.saudePctAno * 100).toFixed(1)}% educ ${(s.educacaoPctAno * 100).toFixed(1)}% CAPAG ${s.capag} ${s.regime} aprov ${s.aprovacao.toFixed(0)} hom ${s.indicadores.homicidios.toFixed(1)} ideb ${s.indicadores.ideb.toFixed(2)} notícias ${notas.length}`);
      expect(s.aprovacao).toBeGreaterThan(3);
      expect(s.aprovacao).toBeLessThan(97);
    }
    writeFileSync('tests/.estado-relatorio.txt', linhas.join('\n'));
  });

  it('projeção da LOA: aumentar ICMS aumenta receita, reajuste aumenta pessoal', () => {
    const e = new Estado(initDe('BA'));
    const s = e.snapshot();
    const base = projetarLOA(s, e.loa);
    const icms = projetarLOA(s, { ...e.loa, aliquotaICMS: e.loa.aliquotaICMS + 0.01 });
    expect(icms.receitas).toBeGreaterThan(base.receitas);
    const reaj = projetarLOA(s, { ...e.loa, reajuste: { educacao: 0.1, saude: 0.1, seguranca: 0.1, demais: 0.1 } });
    expect(reaj.pessoalPct).toBeGreaterThan(base.pessoalPct);
    expect(base.saudePct).toBeGreaterThan(0.09);
    expect(base.educacaoPct).toBeGreaterThan(0.2);
  });

  it('cortar saúde abaixo do mínimo gera descumprimento e notícia', () => {
    const e = new Estado(initDe('PE'));
    const rng = new Rng(3);
    e.loa = { ...e.loa, custeio: { ...e.loa.custeio, saude: e.loa.custeio.saude * 0.1 }, investimento: { ...e.loa.investimento, saude: 0 } };
    e.contingenciamento = 0.4;
    const notas = rodar(e, 13, rng);
    expect(notas.some((n) => n.includes('saúde') && n.includes('mínimo'))).toBe(true);
  });

  it('obra: licita, executa, inaugura e melhora o indicador', () => {
    const e = new Estado(initDe('CE'));
    const rng = new Rng(11);
    const ctx = { ano: 2027, mes: 2, rng, noticia: () => undefined };
    expect(e.acao({ tipo: 'iniciar-obra', id: 'upas' }, ctx).ok).toBe(true);
    e.loa = { ...e.loa, investimento: { ...e.loa.investimento, saude: e.loa.investimento.saude + 200e6 } };
    rodar(e, 30, rng);
    expect(e.obras[0].fase).toBe('concluida');
    expect(e.efeitosObras.esperaEmergencia).toBeLessThan(0);
  });

  it('ciclo orçamentário: LOA enviada em agosto é votada em dezembro e vigora em janeiro (RJ, no RRF)', () => {
    const e = new Estado(initDe('RJ'));
    expect(e.regime).toBe('RRF');
    const rng = new Rng(21);
    const notas = rodar(e, 7, rng); // até 1º de agosto
    expect(e.loaStatus).toBe('janela');
    const p = e.loaInercial(2028);
    expect(tetoRRF(e.snapshot(2027, 8), p)!.ok).toBe(true);
    const r = e.acao({ tipo: 'propor-loa', proposta: { ...p, emendas: e.rcl12 * 0.008 } }, { ano: 2027, mes: 8, rng, noticia: (t) => notas.push(t) });
    expect(r.ok).toBe(true);
    expect(e.loaStatus).toBe('enviada');
    rodar(e, 5, rng, undefined, { ano: 2027, mes: 8 });
    // em janeiro: aprovada (vigente 2028) ou rejeitada (duodécimos) — nunca as duas coisas
    expect(e.loa.ano === 2028 || e.duodecimos).toBe(true);
  });

  it('PROPAG reduz os juros da dívida com a União', () => {
    const a = new Estado(initDe('SP')), b = new Estado(initDe('SP'));
    const ctx = { ano: 2027, mes: 2, rng: new Rng(1), noticia: () => undefined };
    b.acao({ tipo: 'regime', regime: 'PROPAG' }, ctx);
    rodar(a, 24, new Rng(5)); rodar(b, 24, new Rng(5));
    const jurosA = a.historico.slice(-12).reduce((s, h) => s + h.despesas.juros, 0);
    const jurosB = b.historico.slice(-12).reduce((s, h) => s + h.despesas.juros, 0);
    expect(jurosB).toBeLessThan(jurosA);
    expect(AREAS.length).toBe(10);
  });
});
