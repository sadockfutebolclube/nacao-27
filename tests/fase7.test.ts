import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { EleitoradoUF } from '../src/data/eleitorado';
import { Rng } from '../src/sim/core/rng';
import { intencaoEstadual, primeiroTurno, segundoTurno } from '../src/sim/eleicao/eleicao';
import { Estado } from '../src/sim/estado/estado';
import { initDe } from './helpers';

const DM = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
/** Roda o Estado dia a dia (mês no dia 1, calendário eleitoral todo dia) até a data dada. */
function rodarAte(e: Estado, ate: { ano: number; mes: number; dia: number }, rng: Rng, desde = { ano: 2027, mes: 1, dia: 1 }, aoDia?: (a: number, m: number, d: number) => void) {
  const notas: string[] = [];
  const noticia = (t: string) => notas.push(t);
  let { ano, mes, dia } = desde;
  for (;;) {
    if (dia === 1 && !(ano === 2027 && mes === 1)) e.mes({ ano, mes, rng, aprovacaoCidade: null, noticia });
    e.diario({ ano, mes, dia, rng, noticia, tv: { ancora: 'Âncora', nome: 'TV Guará' } });
    aoDia?.(ano, mes, dia);
    if (ano === ate.ano && mes === ate.mes && dia === ate.dia) break;
    dia++;
    if (dia > DM[mes - 1]) { dia = 1; mes++; if (mes > 12) { mes = 1; ano++; } }
  }
  return notas;
}
const ctx = (ano: number, mes: number, rng = new Rng(1)) => ({ ano, mes, rng, noticia: () => undefined });

describe('Fase 7 — dados e calendário', () => {
  it('eleitorado real do TSE casado com as malhas do IBGE', () => {
    const sp = EleitoradoUF.parse(JSON.parse(readFileSync('public/data/eleitorado/SP.json', 'utf8')));
    expect(sp.municipios.length).toBe(645);
    expect(sp.total).toBeGreaterThan(34e6);
    expect(sp.municipios[0].nome).toBe('São Paulo');
    const malha = JSON.parse(readFileSync('public/data/geo/municipios/SP.geojson', 'utf8')) as { features: { properties: { codarea: string } }[] };
    const cods = new Set(malha.features.map((f) => f.properties.codarea));
    for (const m of sp.municipios) expect(cods.has(m.ibge)).toBe(true);
    let tot = 0;
    for (const uf of ['AC', 'BA', 'MG', 'RJ', 'RR', 'RN']) tot += EleitoradoUF.parse(JSON.parse(readFileSync(`public/data/eleitorado/${uf}.json`, 'utf8'))).municipios.length;
    expect(tot).toBe(22 + 417 + 853 + 92 + 15 + 167);
  });

  it('1º turno no primeiro domingo e 2º no último domingo de outubro', () => {
    expect(primeiroTurno(2030)).toBe(6);
    expect(segundoTurno(2030)).toBe(27);
    expect(primeiroTurno(2034)).toBe(1);
    expect(segundoTurno(2034)).toBe(29);
  });
});

describe('Fase 7 — campanha, eleição e posse', () => {
  it('mandato inteiro no AC: pré-candidatos, pesquisas, convenção, coligações, debates, apuração e posse', () => {
    const e = new Estado(initDe('AC'));
    const rng = new Rng(13);
    const notas = rodarAte(e, { ano: 2031, mes: 1, dia: 7 }, rng);
    const el = e.eleicao!;
    expect(el.ano).toBe(2030);
    expect(el.candidatos.length).toBeGreaterThanOrEqual(3);
    expect(el.decisao).toBe('reeleicao');
    expect(el.pesquisas.length).toBeGreaterThan(8);
    expect(el.debates.length).toBeGreaterThanOrEqual(1);
    const r = el.resultado1!;
    // contabilidade da urna: válidos + brancos/nulos + abstenção = eleitorado
    expect(Math.abs(r.validos + r.brancosNulos + r.abstencao - r.eleitores) / r.eleitores).toBeLessThan(0.002);
    expect(r.municipios.length).toBe(22);
    expect(r.abstencao / r.eleitores).toBeGreaterThan(0.1);
    expect(r.abstencao / r.eleitores).toBeLessThan(0.3);
    const pctTop = Math.max(...r.totais) / r.validos;
    if (pctTop <= 0.5) expect(el.resultado2).not.toBeNull();
    expect(notas.some((n) => n.includes('Começa oficialmente a campanha'))).toBe(true);
    expect(notas.some((n) => n.includes('Eleição presidencial'))).toBe(true);
    expect(e.historicoEleicoes).toHaveLength(1);
    // posse: 2º mandato ou fim de jogo com legado
    if (e.historicoEleicoes[0].venceu) { expect(e.mandato).toBe(2); expect(e.fim).toBeNull(); }
    else { expect(e.fim!.motivo).toBe('derrota'); expect(e.fim!.data).toBe('06/01/2031'); expect(e.snapshot(2031, 1).legado!.titulo).toContain('Derrotado'); }
  }, 120_000);

  it('aprovação maior rende mais votos; agenda no município aumenta a votação local', () => {
    const e = new Estado(initDe('BA'));
    rodarAte(e, { ano: 2030, mes: 8, dia: 20 }, new Rng(4));
    const el = e.eleicao!;
    expect(el.fase).toBe('campanha');
    const jog = el.candidatos.find((c) => c.doJogador)!;
    const c0 = e.ctxEleitoral();
    const base = intencaoEstadual(el, c0, 1)[jog.id];
    const mais = intencaoEstadual(el, { ...c0, grupos: { servidores: 70, empresariado: 70, classeMedia: 70, baixaRenda: 70 } }, 1)[jog.id];
    const menos = intencaoEstadual(el, { ...c0, grupos: { servidores: 25, empresariado: 25, classeMedia: 25, baixaRenda: 25 } }, 1)[jog.id];
    expect(mais).toBeGreaterThan(base);
    expect(menos).toBeLessThan(base);
    const antes = intencaoEstadual(el, c0, 1)[jog.id];
    const r = e.acao({ tipo: 'campanha-visita', ibge: c0.eleitorado.municipios[0].ibge }, ctx(2030, 8));
    expect(r.ok).toBe(true);
    expect(intencaoEstadual(el, e.ctxEleitoral(), 1)[jog.id]).toBeGreaterThan(antes);
    // três visitas por semana
    e.acao({ tipo: 'campanha-visita', ibge: c0.eleitorado.municipios[1].ibge }, ctx(2030, 8));
    e.acao({ tipo: 'campanha-visita', ibge: c0.eleitorado.municipios[2].ibge }, ctx(2030, 8));
    expect(e.acao({ tipo: 'campanha-visita', ibge: c0.eleitorado.municipios[3].ibge }, ctx(2030, 8)).ok).toBe(false);
    // condutas vedadas
    expect(e.acao({ tipo: 'convenio', prefeito: 1, valor: 5e6 }, ctx(2030, 8)).ok).toBe(false);
    expect(e.acao({ tipo: 'publicidade', valor: 1e6 }, ctx(2030, 8)).ok).toBe(false);
    expect(e.atores.publicidade).toBe(0);
  }, 120_000);

  it('debate: as respostas mexem no ímpeto; sem resposta é cadeira vazia', () => {
    const e = new Estado(initDe('AC'));
    const rng = new Rng(8);
    const t1 = primeiroTurno(2030);
    rodarAte(e, { ano: 2030, mes: 9, dia: 30 + t1 - 10 }, rng);
    const el = e.eleicao!;
    const deb = el.debates[0];
    expect(deb).toBeDefined();
    expect(deb.perguntas).toHaveLength(4);
    const jog = el.candidatos.find((c) => c.doJogador)!;
    const m0 = jog.momento;
    for (let q = 0; q < 4; q++) {
      const melhor = deb.perguntas[q].opcoes.reduce((bi, o, i, arr) => (o.efeito > arr[bi].efeito ? i : bi), 0);
      expect(e.acao({ tipo: 'debate', opcao: melhor }, ctx(2030, 9)).ok).toBe(true);
    }
    expect(deb.concluido).toBe(true);
    expect(jog.momento).toBeGreaterThan(m0);
    expect(e.acao({ tipo: 'debate', opcao: 0 }, ctx(2030, 9)).ok).toBe(false);
  }, 120_000);

  it('sem reeleição no 2º mandato: a convenção exige um sucessor', () => {
    const e = new Estado(initDe('PE'));
    e.mandato = 2;
    rodarAte(e, { ano: 2030, mes: 7, dia: 21 }, new Rng(2));
    const el = e.eleicao!;
    expect(el.opcoesSucessor.length).toBeGreaterThanOrEqual(2);
    expect(e.acao({ tipo: 'convencao', decisao: 'reeleicao' }, ctx(2030, 7)).ok).toBe(false);
    expect(e.acao({ tipo: 'convencao', decisao: 'sucessor', sucessor: 1 }, ctx(2030, 7)).ok).toBe(true);
    expect(el.candidatos[0].origem).toBe('sucessor');
    expect(el.candidatos[0].pessoa.nome).toBe(el.opcoesSucessor[1].nome);
  }, 120_000);

  it('reeleição renova a Assembleia e troca o Presidente; save/load preserva a eleição', () => {
    const e = new Estado(initDe('SP'));
    const rng = new Rng(13);
    const deps0 = e.pol.deputados.map((d) => d.urna).join();
    const pres0 = e.atores.presidente.nome;
    rodarAte(e, { ano: 2030, mes: 10, dia: 20 }, rng);
    const json = JSON.parse(JSON.stringify(e.serialize()));
    const f = Estado.deserialize(initDe('SP'), json);
    expect(f.eleicao).toEqual(e.eleicao);
    const r1 = new Rng(77), r2 = new Rng(77);
    rodarAte(e, { ano: 2031, mes: 1, dia: 7 }, r1, { ano: 2030, mes: 10, dia: 21 });
    rodarAte(f, { ano: 2031, mes: 1, dia: 7 }, r2, { ano: 2030, mes: 10, dia: 21 });
    expect(f.historicoEleicoes).toEqual(e.historicoEleicoes);
    expect(f.mandato).toBe(e.mandato);
    expect(e.atores.presidente.nome).not.toBe(pres0);
    if (e.mandato === 2) expect(e.pol.deputados.map((d) => d.urna).join()).not.toBe(deps0);
  }, 180_000);

  it('legado: indicadores da posse ao fim, contas e conquistas (inclusive após impeachment)', () => {
    const e = new Estado(initDe('RS'));
    rodarAte(e, { ano: 2028, mes: 6, dia: 1 }, new Rng(5));
    e.pol.afastado = { data: 'jun/2028', motivo: 'teste' };
    e.mes({ ano: 2028, mes: 7, rng: new Rng(1), aprovacaoCidade: null, noticia: () => undefined });
    const L = e.snapshot(2028, 7).legado!;
    expect(L.motivo).toBe('afastado');
    expect(L.indicadores.length).toBeGreaterThanOrEqual(8);
    expect(L.aprovacao.serie.length).toBeGreaterThan(10);
    expect(L.assembleia.impeachment).toBe(true);
    for (const l of L.indicadores) { expect(Number.isFinite(l.antes)).toBe(true); expect(Number.isFinite(l.depois)).toBe(true); }
  }, 120_000);
});
