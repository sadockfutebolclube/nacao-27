import { describe, expect, it } from 'vitest';
import { Rng } from '../src/sim/core/rng';
import { Estado } from '../src/sim/estado/estado';
import { cadeirasALE, CARGOS } from '../src/sim/politica/dados';
import { placar, politicaMensal, type Projeto } from '../src/sim/politica/politica';
import { initDe } from './helpers';

function rodar(e: Estado, meses: number, rng: Rng, inicio = { ano: 2027, mes: 1 }) {
  const noticias: string[] = [];
  let { ano, mes } = inicio;
  for (let i = 0; i < meses; i++) {
    mes++;
    if (mes > 12) { mes = 1; ano++; }
    e.mes({ ano, mes, rng, aprovacaoCidade: null, noticia: (t) => noticias.push(`${mes}/${ano} ${t}`) });
  }
  return noticias;
}
const ctx = (rng: Rng, notas: string[] = []) => ({ ano: 2027, mes: 2, rng, noticia: (t: string) => notas.push(t) });

describe('Fase 5 — indicadores reais (DATASUS/PNAD)', () => {
  it('o ponto de partida usa mortalidade infantil, leitos, desemprego e extrema pobreza reais', () => {
    const ini = initDe('RJ');
    expect(ini.social).toBeDefined();
    const s = ini.social!;
    // ordens de grandeza conhecidas (SIM/SINASC 2023, CNES, PNAD Contínua)
    expect(s.mortalidadeInfantil).toBeGreaterThan(8);
    expect(s.mortalidadeInfantil).toBeLessThan(20);
    expect(s.leitosPorMil).toBeGreaterThan(0.8);
    expect(s.leitosPorMil).toBeLessThan(3);
    expect(s.desemprego).toBeGreaterThan(0.01);
    expect(s.desemprego).toBeLessThan(0.2);
    const e = new Estado(ini);
    expect(e.ind0.mortalidadeInfantil).toBe(s.mortalidadeInfantil);
    expect(e.ind0.leitos).toBe(s.leitosPorMil);
    expect(e.ind0.desemprego).toBe(s.desemprego);
    expect(e.ind0.pobreza).toBe(s.extremaPobreza);
  });
});

describe('Fase 5 — Assembleia e gabinete', () => {
  it('ALE com o número real de cadeiras (CF art. 27), deputados com nome, partido, bancada e reduto', () => {
    expect(cadeirasALE('SP')).toBe(94);
    expect(cadeirasALE('MG')).toBe(77);
    expect(cadeirasALE('RJ')).toBe(70);
    expect(cadeirasALE('PB')).toBe(36);
    expect(cadeirasALE('AC')).toBe(24);
    for (const uf of ['SP', 'RJ', 'AC']) {
      const e = new Estado(initDe(uf));
      expect(e.pol.deputados.length).toBe(cadeirasALE(uf));
      expect(new Set(e.pol.deputados.map((d) => d.id)).size).toBe(e.pol.deputados.length);
      for (const d of e.pol.deputados) {
        expect(d.urna.length).toBeGreaterThan(2);
        expect(initDe(uf).cidades).toContain(d.cidade);
      }
      expect(e.pol.deputados.some((d) => d.id === e.pol.presidenteALE)).toBe(true);
      for (const c of CARGOS) expect(e.pol.secretarios[c.id].nome.split(' ').length).toBeGreaterThanOrEqual(3);
      expect(e.baseAliada).toBeGreaterThan(0.3);
      expect(e.baseAliada).toBeLessThan(0.85);
    }
  });

  it('mesma UF ⇒ mesma Assembleia; UFs diferentes ⇒ Assembleias diferentes', () => {
    const a = new Estado(initDe('BA')), b = new Estado(initDe('BA')), c = new Estado(initDe('PE'));
    expect(a.pol.deputados.map((d) => d.urna)).toEqual(b.pol.deputados.map((d) => d.urna));
    expect(a.pol.deputados[0].urna === c.pol.deputados[0].urna && a.pol.deputados[1].urna === c.pol.deputados[1].urna).toBe(false);
  });

  it('PEC da Previdência vai à pauta, negociação aumenta a chance e a votação acontece no mês seguinte', () => {
    const e = new Estado(initDe('RJ'));
    const rng = new Rng(3);
    const notas: string[] = [];
    const r = e.acao({ tipo: 'reforma-previdencia' }, ctx(rng, notas));
    expect(r.ok).toBe(true);
    const pec = e.pol.pauta.find((p) => p.tipo === 'pec-previdencia')!;
    expect(pec.quorum).toBe('3/5');
    const antes = e.placarDe(pec.id)!.chance;
    const capital0 = e.pol.capital;
    expect(e.acao({ tipo: 'negociar-bancada', bancada: 'centrao', carta: 'emenda' }, ctx(rng, notas)).ok).toBe(true);
    expect(e.acao({ tipo: 'negociar-bancada', bancada: 'evangelica', carta: 'cargo' }, ctx(rng, notas)).ok).toBe(true);
    const indecisos = e.pol.deputados.filter((d) => e.placarDe(pec.id)!.intencoes[d.id] !== 'sim').slice(0, 6);
    for (const d of indecisos) e.acao({ tipo: 'negociar', deputado: d.id, carta: 'tecnico', projeto: pec.id }, ctx(rng, notas));
    const depois = e.placarDe(pec.id)!.chance;
    expect(depois).toBeGreaterThan(antes);
    expect(e.pol.capital).toBeLessThan(capital0);
    expect(e.pol.emendasAPagar).toBeGreaterThan(0);
    // repetir a mesma carta com o mesmo deputado no mesmo ano é recusado
    const d0 = e.pol.deputados.find((d) => d.bancada === 'centrao')!;
    expect(e.acao({ tipo: 'negociar', deputado: d0.id, carta: 'emenda', projeto: null }, ctx(rng, notas)).ok).toBe(false);
    const n = rodar(e, 1, rng);
    expect(e.pol.pauta.some((p) => p.id === pec.id)).toBe(false);
    expect(e.pol.votacoes[0].titulo).toContain('Previdência');
    expect(n.some((t) => t.includes('Previdência'))).toBe(true);
    // emendas negociadas foram pagas no mês
    expect(e.pol.emendasAPagar).toBe(0);
    expect(e.historico[e.historico.length - 1].despesas.emendas).toBeGreaterThan(e.loa.emendas / 12);
  });

  it('empréstimo precisa de autorização da ALE; LOA enviada entra na pauta e é votada em dezembro', () => {
    const e = new Estado(initDe('SP'));
    const rng = new Rng(9);
    expect(e.acao({ tipo: 'emprestimo', valor: 1e9, credor: 'bndes' }, ctx(rng)).ok).toBe(true);
    expect(e.emprestimosPendentes.length).toBe(0);
    rodar(e, 1, rng);
    const v = e.pol.votacoes[0];
    expect(v.titulo).toContain('Empréstimo');
    expect(e.emprestimosPendentes.length).toBe(v.aprovado ? 1 : 0);

    rodar(e, 6, rng, { ano: 2027, mes: 2 }); // até 1º de agosto
    expect(e.loaStatus).toBe('janela');
    expect(e.acao({ tipo: 'propor-loa', proposta: e.loaInercial(2028) }, { ano: 2027, mes: 8, rng, noticia: () => undefined }).ok).toBe(true);
    expect(e.pol.pauta.some((p) => p.id === 'loa-2028')).toBe(true);
    rodar(e, 5, rng, { ano: 2027, mes: 8 });
    expect(e.pol.votacoes.some((x) => x.titulo === 'LOA 2028')).toBe(true);
  });

  it('obra no reduto vira obra do Estado; trocar e ceder secretarias mexe com a base', () => {
    const e = new Estado(initDe('MG'));
    const rng = new Rng(4);
    const dep = e.pol.deputados.find((d) => d.bancada === 'centrao')!;
    const obras0 = e.obras.length;
    expect(e.acao({ tipo: 'negociar', deputado: dep.id, carta: 'obra', projeto: null }, ctx(rng)).ok).toBe(true);
    expect(e.obras.length).toBe(obras0 + 1);
    expect(e.obras[e.obras.length - 1].custom?.ref.tipo).toBe('deputado');
    expect(dep.promessas[0].obraUid).toBe(e.obras[e.obras.length - 1].uid);

    // nomear: três candidatos (técnico, político, confiança)
    e.acao({ tipo: 'candidatos', cargo: 'saude' }, ctx(rng));
    const cands = e.pol.candidatos.saude!;
    expect(cands.map((c) => c.perfil)).toEqual(['tecnico', 'politico', 'confianca']);
    expect(e.acao({ tipo: 'nomear', cargo: 'saude', indice: 0 }, ctx(rng)).ok).toBe(true);
    expect(e.pol.secretarios.saude.nome).toBe(cands[0].nome);

    // ceder uma pasta a um partido independente aproxima o partido inteiro
    const partido = (Object.keys(e.pol.posturas) as (keyof typeof e.pol.posturas)[]).find((p) => e.pol.posturas[p] === 'independente' && e.pol.deputados.some((d) => d.partido === p))!;
    const rel0 = e.pol.deputados.filter((d) => d.partido === partido).reduce((s, d) => s + d.relacao, 0);
    expect(e.acao({ tipo: 'ceder-secretaria', partido, cargo: 'cultura' }, ctx(rng)).ok).toBe(true);
    const rel1 = e.pol.deputados.filter((d) => d.partido === partido).reduce((s, d) => s + d.relacao, 0);
    expect(rel1).toBeGreaterThan(rel0);
    expect(e.pol.secretarios.cultura.partido).toBe(partido);
  });

  it('secretário desonesto: escândalo na imprensa → pedido de CPI → desfecho', () => {
    const e = new Estado(initDe('RJ'));
    for (const s of Object.values(e.pol.secretarios)) s.honestidade = 0;
    const notas = rodar(e, 36, new Rng(11));
    expect(e.pol.escandalos.length).toBeGreaterThan(0);
    expect(notas.some((t) => t.includes('EXCLUSIVO'))).toBe(true);
    // todo escândalo segue a cadeia: CPI (instalada/engavetada), arquivamento ou PF
    expect(notas.some((t) => /CPI|Polícia Federal/.test(t))).toBe(true);
  });

  it('crise grave: presidente da ALE hostil aceita o impeachment e 2/3 afastam o governador', () => {
    const e = new Estado(initDe('ES'));
    for (const d of e.pol.deputados) d.relacao = -0.9;
    const rng = new Rng(2);
    const notas: string[] = [];
    for (let i = 0; i < 40 && !e.pol.afastado; i++) {
      for (const d of e.pol.deputados) d.relacao = -0.9;
      politicaMensal(e.pol, {
        mesIndex: i, ano: 2028, mes: (i % 12) + 1, data: `m${i}`, aprovacao: 8, rng, noticia: (t) => notas.push(t), cidades: ['Vitória'],
        atrasoSalarial: true, pessoalAcimaLRF: true, obrasConcluidas: [], obrasParadas: [],
      });
    }
    expect(notas.some((t) => t.includes('impeachment'))).toBe(true);
    expect(e.pol.afastado).not.toBeNull();
  });

  it('placar: CPI precisa de 1/3; governo popular e base fiel barram a CPI', () => {
    const e = new Estado(initDe('SP'));
    const cpi: Projeto = { id: 'cpi-t', tipo: 'cpi', titulo: 'CPI', descricao: '', quorum: '1/3', eixos: {}, governoQuer: 'nao', gravidade: 0.3, votaEm: 0, dataVotacao: '' };
    for (const d of e.pol.deputados) d.relacao = d.bancada === 'oposicao' ? -0.8 : 0.7;
    const p = placar(e.pol, cpi, { aprovacao: 65 });
    expect(p.necessarios).toBe(32);
    expect(p.chance).toBeLessThan(0.2);
    for (const d of e.pol.deputados) d.relacao = -0.6;
    expect(placar(e.pol, { ...cpi, gravidade: 1.4 }, { aprovacao: 20 }).chance).toBeGreaterThan(0.8);
  });

  it('save/load do Estado preserva a política', () => {
    const e = new Estado(initDe('PE'));
    const rng = new Rng(5);
    e.acao({ tipo: 'reforma-previdencia' }, ctx(rng));
    rodar(e, 3, rng);
    const json = JSON.parse(JSON.stringify(e.serialize()));
    const f = Estado.deserialize(initDe('PE'), json);
    expect(f.pol).toEqual(e.pol);
    const r1 = new Rng(8), r2 = new Rng(8);
    rodar(e, 6, r1); rodar(f, 6, r2);
    expect(f.pol.capital).toBeCloseTo(e.pol.capital, 9);
    expect(f.aprovacao).toBeCloseTo(e.aprovacao, 9);
  });
});
