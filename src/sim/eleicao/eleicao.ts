/**
 * Eleição estadual (Fase 7): candidatos e coligações, pré-campanha e campanha, horário eleitoral,
 * agenda pelos municípios, debates na TV, pesquisas, votação por município (eleitorado real do TSE),
 * apuração, segundo turno com apoios — no calendário real (1º turno no 1º domingo de outubro,
 * 2º turno no último domingo, propaganda no rádio e na TV de 30/8 até a antevéspera).
 *
 * Dados puros guardados no Estado. As funções recebem o RNG da simulação (determinismo).
 */
import type { EleitoradoUF, MunicipioEleitoral } from '../../data/eleitorado';
import { hash01, hash32, Rng, seedFromString } from '../core/rng';
import { PARTIDOS, type IdPartido } from '../politica/dados';
import { gerarPessoa, type Pessoa } from '../politica/politica';

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

// ── Calendário ───────────────────────────────────────────────────────────────────

export const ehAnoEleitoral = (ano: number) => ano >= 2030 && ano % 4 === 2;
/** Dia do mês do 1º domingo de outubro. */
export function primeiroTurno(ano: number): number {
  const dow = new Date(Date.UTC(ano, 9, 1)).getUTCDay();
  return 1 + ((7 - dow) % 7);
}
/** Dia do mês do último domingo de outubro. */
export function segundoTurno(ano: number): number {
  const dow = new Date(Date.UTC(ano, 9, 31)).getUTCDay();
  return 31 - dow;
}
const DIAS_ANTES = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
export const diaDoAno = (mes: number, dia: number) => DIAS_ANTES[mes - 1] + dia;

// ── Tipos ────────────────────────────────────────────────────────────────────────

export type Origem = 'governador' | 'sucessor' | 'prefeito' | 'deputado' | 'outsider' | 'nanico';
export interface Candidato {
  id: number;
  pessoa: Pessoa;
  urna: string;
  partido: IdPartido;
  origem: Origem;
  /** −1 esquerda a 1 direita */
  ideologia: number;
  carisma: number;
  /** força extra na capital e no interior */
  forcaCapital: number;
  forcaInterior: number;
  /** cidade-reduto (código IBGE) com bônus próprio */
  reduto: string | null;
  coligacao: IdPartido[];
  /** fração do horário eleitoral */
  tempoTV: number;
  /** ímpeto da campanha (acumula com decaimento) */
  momento: number;
  /** desgaste: escândalos, ataques recebidos (soma na rejeição) */
  desgaste: number;
  /** visitas: município → bônus local */
  agenda: Record<string, number>;
  /** candidato do jogador (governador ou sucessor) */
  doJogador: boolean;
  /** apoios recebidos no 2º turno (ids de candidatos eliminados) */
  apoios: number[];
  ativo: boolean;
}

export interface PesquisaEleitoral {
  data: string;
  instituto: string;
  turno: 1 | 2;
  /** % por candidato (estimulada, sobre o total), na ordem de `candidatos` */
  intencao: Record<number, number>;
  rejeicao: Record<number, number>;
  indecisos: number;
  margem: number;
  /** simulação de 2º turno: jogador x principal adversário (% dos válidos) */
  segundo?: { a: number; b: number; pa: number; pb: number };
}

export interface ResultadoMunicipio { ibge: string; votos: number[]; brancosNulos: number; abstencao: number }
export interface Resultado {
  turno: 1 | 2;
  data: string;
  /** ids dos candidatos na ordem de `votos` */
  ids: number[];
  totais: number[];
  validos: number;
  brancosNulos: number;
  abstencao: number;
  eleitores: number;
  municipios: ResultadoMunicipio[];
}

export type TipoResposta = 'dados' | 'promessa' | 'ataque' | 'esquiva' | 'emocao';
export interface Pergunta {
  quem: string;
  texto: string;
  opcoes: { texto: string; tipo: TipoResposta; efeito: number; nota: string }[];
  respondida?: number;
}
export interface Debate { turno: 1 | 2; data: string; dia: number; perguntas: Pergunta[]; concluido: boolean; placar: number; resumo?: string }

export type Tema = 'obras' | 'saude' | 'seguranca' | 'educacao' | 'emprego' | 'ataque' | 'emocao';
export type Fase = 'pre' | 'campanha' | 'segundoTurno' | 'apurado' | 'encerrada';

export interface EstadoEleicao {
  ano: number;
  fase: Fase;
  candidatos: Candidato[];
  pesquisas: PesquisaEleitoral[];
  debates: Debate[];
  resultado1: Resultado | null;
  resultado2: Resultado | null;
  vencedor: number | null;
  /** o jogador decidiu (convenção) — null = ainda não */
  decisao: 'reeleicao' | 'sucessor' | null;
  /** opções de sucessor oferecidas na convenção */
  opcoesSucessor: { nome: string; perfil: string; carisma: number; ideologia: number; partido: IdPartido }[];
  tema: Tema;
  /** visitas restantes na semana */
  visitas: number;
  /** erro das pesquisas sorteado para o dia da eleição */
  surpresa: Record<number, number>;
  nextId: number;
  log: { data: string; texto: string }[];
  /** líder estimado por município na última pesquisa: ibge → [id do candidato, fatia do líder] */
  mapa: Record<string, [number, number]>;
}

// ── Contexto que o Estado fornece ────────────────────────────────────────────────

export interface ContextoEleitoral {
  sigla: string;
  regiao: string;
  eleitorado: EleitoradoUF;
  capitalIbge: string | null;
  /** município construído pelo jogador (reduto do governador); null = capital */
  sedeIbge?: string | null;
  grupos: { servidores: number; empresariado: number; classeMedia: number; baixaRenda: number };
  aprovacao: number;
  /** escândalos ativos, greves, crises (penalidade de desgaste do governo) */
  crises: number;
  /** partido do governador e postura dos partidos (coligações) */
  partidoGov: IdPartido;
  baseAliada: number;
  posturas: Record<IdPartido, 'base' | 'independente' | 'oposicao'>;
  cadeiras: Record<IdPartido, number>;
  /** prefeitos (cidade, relação com o governo) */
  prefeitos: { cidade: string; relacao: number; nome: string; partido: IdPartido; ambicao: number; capital: boolean; retrato: number; genero: 'f' | 'm'; idade: number }[];
  oposicaoLider: { nome: string; urna: string; partido: IdPartido; cidade: string; retrato: number; genero: 'f' | 'm'; idade: number } | null;
  reeleicaoPermitida: boolean;
  /** variações dos indicadores desde a posse (negativo = melhorou para "menor é melhor") */
  delta: { homicidios: number; espera: number; desemprego: number; ideb: number; fila: number; obras: number };
}

// ── Inclinação política dos municípios (suave; ver DECISIONS D-040) ────────────

const LEAN_REGIAO: Record<string, number> = { Nordeste: -0.25, Norte: 0.05, Sudeste: 0.05, Sul: 0.25, 'Centro-Oeste': 0.3 };
const lean = (m: MunicipioEleitoral, regiao: string) => (LEAN_REGIAO[regiao] ?? 0) + (hash01(Number(m.ibge)) - 0.5) * 0.5;

// ── Candidatos ───────────────────────────────────────────────────────────────────

function idPorCidade(el: EleitoradoUF, nome: string): string | null {
  return el.municipios.find((m) => m.nome === nome)?.ibge ?? null;
}

/** Monta o campo de candidatos no início do ano eleitoral. */
export function criarEleicao(ano: number, ctx: ContextoEleitoral): EstadoEleicao {
  const rng = new Rng(seedFromString(`ELEICAO:${ctx.sigla}:${ano}`));
  const cidades = ctx.eleitorado.municipios.slice(0, 12).map((m) => m.nome);
  const cands: Candidato[] = [];
  let id = 1;
  const novo = (p: Partial<Candidato> & { pessoa: Pessoa; partido: IdPartido; origem: Origem; urna: string }): Candidato => ({
    id: id++, ideologia: PARTIDOS[p.partido].ideologia * 0.75, carisma: 0.5, forcaCapital: 0, forcaInterior: 0, reduto: null, coligacao: [p.partido],
    tempoTV: 0, momento: 0, desgaste: 0, agenda: {}, doJogador: false, apoios: [], ativo: true, ...p,
  });
  // o governador (o jogador) — se puder concorrer, a convenção confirma
  cands.push(novo({
    pessoa: { nome: 'Governador(a)', genero: 'm', idade: 55, cidade: cidades[0] ?? '', retrato: 1, bordao: 'Trabalho e resultado.' },
    urna: 'Governador(a)', partido: ctx.partidoGov, origem: 'governador', carisma: 0.55, doJogador: true, reduto: ctx.sedeIbge ?? ctx.capitalIbge,
  }));
  // prefeito ambicioso da capital
  const pref = ctx.prefeitos.find((p) => p.capital);
  if (pref && pref.ambicao > 0.5 && pref.relacao < 0.25) {
    cands.push(novo({
      pessoa: { nome: pref.nome, genero: pref.genero, idade: pref.idade, cidade: pref.cidade, retrato: pref.retrato, bordao: 'A capital deu certo. Agora é o estado.' },
      urna: pref.nome.split(' ').slice(0, 2).join(' '), partido: pref.partido, origem: 'prefeito', carisma: 0.6, forcaCapital: 0.25, forcaInterior: -0.1, reduto: idPorCidade(ctx.eleitorado, pref.cidade),
    }));
  }
  // líder da oposição na ALE
  if (ctx.oposicaoLider && !cands.some((c) => c.partido === ctx.oposicaoLider!.partido)) {
    const o = ctx.oposicaoLider;
    cands.push(novo({
      pessoa: { nome: o.nome, genero: o.genero, idade: o.idade, cidade: o.cidade, retrato: o.retrato, bordao: 'Chega de desgoverno!' },
      urna: o.urna, partido: o.partido, origem: 'deputado', carisma: 0.5, forcaInterior: 0.1, reduto: idPorCidade(ctx.eleitorado, o.cidade),
    }));
  }
  // terceira via: apresentador de TV ou empresário de fora da política
  const pOut = gerarPessoa(rng, cidades.length ? cidades : ['Capital'], ['Não sou político, sou gestor.', 'O povo cansou dos mesmos de sempre.'], [45, 64]);
  let partOut: IdPartido = rng.chance(0.5) ? 'NLI' : 'PMU';
  if (cands.some((c) => c.partido === partOut)) partOut = partOut === 'NLI' ? 'PMU' : 'NLI';
  cands.push(novo({
    pessoa: pOut, urna: rng.chance(0.5) ? `${pOut.nome.split(' ')[0]} da TV` : pOut.nome.split(' ').slice(0, 2).join(' '),
    partido: partOut, origem: 'outsider', carisma: rng.range(0.45, 0.62), ideologia: clamp(PARTIDOS[partOut].ideologia * 0.75 + rng.range(-0.2, 0.2), -1, 1),
    reduto: idPorCidade(ctx.eleitorado, pOut.cidade),
  }));
  // nanico ideológico (o lado oposto ao maior adversário)
  const pNan = gerarPessoa(rng, cidades.length ? cidades : ['Capital'], ['Só a luta muda a vida.', 'Ordem e trabalho.'], [30, 60]);
  const partNan: IdPartido = cands.some((c) => c.ideologia < -0.4) ? 'POP' : 'EPU';
  if (!cands.some((c) => c.partido === partNan)) cands.push(novo({ pessoa: pNan, urna: pNan.nome.split(' ').slice(0, 2).join(' '), partido: partNan, origem: 'nanico', carisma: 0.35 }));
  const e: EstadoEleicao = {
    ano, fase: 'pre', candidatos: cands, pesquisas: [], debates: [], resultado1: null, resultado2: null, vencedor: null,
    decisao: ctx.reeleicaoPermitida ? null : 'sucessor', opcoesSucessor: [], tema: 'obras', visitas: 3, surpresa: {}, nextId: id, log: [], mapa: {},
  };
  formarColigacoes(e, ctx);
  return e;
}

/** Partidos se coligam: a base vai com o governo; os demais com o mais próximo; o Centrão com quem lidera. */
export function formarColigacoes(e: EstadoEleicao, ctx: ContextoEleitoral, lider?: number) {
  const ativos = e.candidatos.filter((c) => c.ativo);
  for (const c of ativos) c.coligacao = [c.partido];
  const gov = ativos.find((c) => c.doJogador);
  for (const p of Object.keys(PARTIDOS) as IdPartido[]) {
    if (ativos.some((c) => c.partido === p)) continue;
    const pt = PARTIDOS[p];
    let alvo: Candidato | undefined;
    if (pt.fisiologismo > 0.75) alvo = ativos.find((c) => c.id === lider) ?? (ctx.aprovacao >= 45 ? gov : undefined);
    if (!alvo && gov && ctx.posturas[p] === 'base' && ctx.aprovacao > 30) alvo = gov;
    if (!alvo) alvo = [...ativos].sort((a, b) => Math.abs(a.ideologia - pt.ideologia) - Math.abs(b.ideologia - pt.ideologia))[0];
    alvo?.coligacao.push(p);
  }
  // horário eleitoral: 90% pela bancada, 10% igualitário (regra da Lei 9.504, com a ALE como referência)
  const tot = Object.values(ctx.cadeiras).reduce((a, b) => a + b, 0) || 1;
  for (const c of ativos) {
    const cad = c.coligacao.reduce((s, p) => s + (ctx.cadeiras[p] ?? 0), 0);
    c.tempoTV = 0.1 / ativos.length + 0.9 * (cad / tot);
  }
}

// ── Modelo de voto ───────────────────────────────────────────────────────────────

const TAU = 0.5;

/** Desempenho percebido do governo no município (pela composição do eleitorado). */
function desempenho(m: MunicipioEleitoral, ctx: ContextoEleitoral): number {
  const g = ctx.grupos;
  const wB = 0.35 + 0.8 * m.baixaEsc, wM = 0.25 + 1.2 * m.superior, wS = 0.05, wE = 0.03;
  const local = (g.baixaRenda * wB + g.classeMedia * wM + g.servidores * wS + g.empresariado * wE) / (wB + wM + wS + wE);
  // aprovação local de 45% é neutra; cada 9 pontos valem meio ponto de utilidade
  return (local - 45) / 18 - 0.05 * ctx.crises;
}

/** Utilidade (determinística) de cada candidato num município. */
export function utilidades(e: EstadoEleicao, m: MunicipioEleitoral, ctx: ContextoEleitoral, turno: 1 | 2): { ids: number[]; u: number[] } {
  const ativos = e.candidatos.filter((c) => c.ativo);
  const L = lean(m, ctx.regiao);
  const capital = m.ibge === ctx.capitalIbge;
  const perf = desempenho(m, ctx);
  const ids: number[] = [], u: number[] = [];
  for (const c of ativos) {
    let x = 0.8 * c.carisma + 0.2 * Math.log(c.tempoTV + 0.05) + c.momento - 0.45 * Math.abs(c.ideologia - L) - c.desgaste;
    x += capital ? c.forcaCapital : c.forcaInterior * (1 - Math.min(1, m.eleitores / 400_000));
    if (c.reduto && c.reduto === m.ibge) x += 0.25;
    x += Math.min(0.45, c.agenda[m.ibge] ?? 0);
    // máquina, recall e obras: o incumbente parte na frente; o desempenho decide o resto
    if (c.origem === 'governador') x += 0.35 + perf;
    if (c.origem === 'sucessor') x += 0.12 + 0.6 * perf;
    // prefeitos aliados ou hostis viram cabos eleitorais na sua cidade
    const pf = ctx.prefeitos.find((p) => p.cidade === m.nome);
    if (pf && c.doJogador) x += pf.relacao > 0.3 ? 0.22 : pf.relacao < -0.3 ? -0.15 : 0;
    // 2º turno: apoios dos eliminados
    if (turno === 2 && c.apoios.length) x += 0.12 * c.apoios.length;
    // ruído local fixo (cada cidade tem suas lideranças)
    x += (hash01(hash32(Number(m.ibge) * 31 + c.id * 7919 + e.ano)) - 0.5) * 0.35;
    ids.push(c.id); u.push(x);
  }
  return { ids, u };
}

function softmax(u: number[]): number[] {
  const mx = Math.max(...u);
  const ex = u.map((x) => Math.exp((x - mx) / TAU));
  const s = ex.reduce((a, b) => a + b, 0);
  return ex.map((x) => x / s);
}

/** Intenção estadual esperada (fração dos válidos), ponderada pelo eleitorado. */
export function intencaoEstadual(e: EstadoEleicao, ctx: ContextoEleitoral, turno: 1 | 2): Record<number, number> {
  const tot: Record<number, number> = {};
  let W = 0;
  for (const m of ctx.eleitorado.municipios) {
    const { ids, u } = utilidades(e, m, ctx, turno);
    const p = softmax(u);
    ids.forEach((id, i) => { tot[id] = (tot[id] ?? 0) + p[i] * m.eleitores; });
    W += m.eleitores;
  }
  for (const k of Object.keys(tot)) tot[Number(k)] /= W;
  return tot;
}

/** Rejeição ("não votaria de jeito nenhum"), em %. */
export function rejeicao(c: Candidato, ctx: ContextoEleitoral): number {
  let r = 18 + 30 * Math.abs(c.ideologia) + 25 * c.desgaste - 10 * c.carisma;
  if (c.origem === 'governador') r += (55 - ctx.aprovacao) * 0.6;
  if (c.origem === 'sucessor') r += (55 - ctx.aprovacao) * 0.35;
  return clamp(r, 8, 75);
}

// ── Pesquisas ────────────────────────────────────────────────────────────────────

const INSTITUTOS = ['Instituto Pulso', 'Aferir Pesquisas'];
export function pesquisa(e: EstadoEleicao, ctx: ContextoEleitoral, turno: 1 | 2, data: string, rng: Rng, diasAteEleicao: number): PesquisaEleitoral {
  const exp = intencaoEstadual(e, ctx, turno);
  e.mapa = {};
  for (const m of ctx.eleitorado.municipios) {
    const { ids, u } = utilidades(e, m, ctx, turno);
    const p = softmax(u);
    let k = 0;
    for (let i = 1; i < p.length; i++) if (p[i] > p[k]) k = i;
    e.mapa[m.ibge] = [ids[k], Math.round(p[k] * 1000) / 1000];
  }
  const indecisos = clamp(4 + diasAteEleicao * 0.12, 4, 28);
  const inst = INSTITUTOS[e.pesquisas.length % 2];
  const intencao: Record<number, number> = {}, rej: Record<number, number> = {};
  for (const c of e.candidatos.filter((x) => x.ativo)) {
    const g = Math.sqrt(-2 * Math.log(Math.max(1e-9, rng.next()))) * Math.cos(2 * Math.PI * rng.next());
    intencao[c.id] = clamp(exp[c.id] * (100 - indecisos) + g * 1.1, 0.5, 95);
    rej[c.id] = clamp(rejeicao(c, ctx) + g * 1.5, 3, 90);
  }
  const p: PesquisaEleitoral = { data, instituto: inst, turno, intencao, rejeicao: rej, indecisos, margem: inst === INSTITUTOS[0] ? 2.5 : 3 };
  // simulação de 2º turno (no 1º turno): jogador x adversário mais forte
  if (turno === 1) {
    const jog = e.candidatos.find((c) => c.doJogador && c.ativo);
    const adv = e.candidatos.filter((c) => c.ativo && !c.doJogador).sort((a, b) => (exp[b.id] ?? 0) - (exp[a.id] ?? 0))[0];
    if (jog && adv) {
      const sim: EstadoEleicao = { ...e, candidatos: e.candidatos.map((c) => ({ ...c, ativo: c.id === jog.id || c.id === adv.id })) };
      const r2 = intencaoEstadual(sim, ctx, 2);
      p.segundo = { a: jog.id, b: adv.id, pa: r2[jog.id] * 100, pb: r2[adv.id] * 100 };
    }
  }
  e.pesquisas.push(p);
  if (e.pesquisas.length > 40) e.pesquisas.shift();
  return p;
}

// ── Votação e apuração ───────────────────────────────────────────────────────────

export function votar(e: EstadoEleicao, ctx: ContextoEleitoral, turno: 1 | 2, data: string, rng: Rng): Resultado {
  const ids = e.candidatos.filter((c) => c.ativo).map((c) => c.id);
  // erro das pesquisas: o eleitor decide na última hora
  for (const id of ids) if (e.surpresa[id] === undefined || turno === 2) {
    e.surpresa[id] = (Math.sqrt(-2 * Math.log(Math.max(1e-9, rng.next()))) * Math.cos(2 * Math.PI * rng.next())) * 0.07;
  }
  const res: Resultado = { turno, data, ids, totais: ids.map(() => 0), validos: 0, brancosNulos: 0, abstencao: 0, eleitores: 0, municipios: [] };
  for (const m of ctx.eleitorado.municipios) {
    const { u } = utilidades(e, m, ctx, turno);
    const uu = u.map((x, i) => x + e.surpresa[ids[i]] + (rng.next() - 0.5) * 0.12);
    const p = softmax(uu);
    const abst = clamp(0.17 + 0.12 * (m.idoso - 0.2) + (turno === 2 ? 0.015 : 0) + (rng.next() - 0.5) * 0.04, 0.08, 0.4);
    const comp = m.eleitores * (1 - abst);
    const bn = comp * clamp(0.065 + (turno === 2 ? 0.02 : 0) + (rng.next() - 0.5) * 0.02, 0.02, 0.15);
    const val = comp - bn;
    const votos = p.map((x) => Math.round(x * val));
    const valR = votos.reduce((a, b) => a + b, 0);
    votos.forEach((v, i) => { res.totais[i] += v; });
    res.validos += valR; res.brancosNulos += Math.round(bn); res.abstencao += Math.round(m.eleitores * abst); res.eleitores += m.eleitores;
    res.municipios.push({ ibge: m.ibge, votos, brancosNulos: Math.round(bn), abstencao: Math.round(m.eleitores * abst) });
  }
  return res;
}

/** Cor de cada candidato na interface (o do jogador é sempre o verde do jogo). */
export const CORES_CANDIDATO = ['#3ee0b0', '#ff6b5b', '#5b8def', '#f5b942', '#c77dff', '#ff9ad5', '#9bd85e'];
export const corCandidato = (e: EstadoEleicao, id: number) => CORES_CANDIDATO[Math.max(0, e.candidatos.findIndex((c) => c.id === id)) % CORES_CANDIDATO.length];

/** Ordem do resultado (índices em `ids`) do mais votado ao menos. */
export const ordem = (r: Resultado) => r.ids.map((_, i) => i).sort((a, b) => r.totais[b] - r.totais[a]);

// ── Campanha (semanal) ───────────────────────────────────────────────────────────

export const TEMAS: Record<Tema, { nome: string; desc: string }> = {
  obras: { nome: 'Obras entregues', desc: 'Mostra hospitais, escolas e estradas. Rende se houve obra de verdade.' },
  saude: { nome: 'Saúde', desc: 'Fala da fila e das emergências. Rende se a espera caiu.' },
  seguranca: { nome: 'Segurança', desc: 'Fala de homicídios e policiamento. Rende se a violência caiu.' },
  educacao: { nome: 'Educação', desc: 'Fala de escola e IDEB. Rende se o IDEB subiu.' },
  emprego: { nome: 'Emprego', desc: 'Fala de vagas e investimentos. Rende se o desemprego caiu.' },
  ataque: { nome: 'Ataque ao adversário', desc: 'Desgasta o principal rival — e aumenta a sua rejeição.' },
  emocao: { nome: 'Emoção e jingle', desc: 'Histórias de gente comum. Pouco risco, pouco ganho.' },
};

/** Efeito de uma semana de horário eleitoral com o tema escolhido (−0,1 a +0,1 de ímpeto). */
export function efeitoTema(t: Tema, ctx: ContextoEleitoral): number {
  const d = ctx.delta;
  switch (t) {
    case 'obras': return clamp(0.012 * d.obras - 0.01, -0.03, 0.08);
    case 'saude': return clamp(-0.25 * d.espera - 0.12 * d.fila, -0.08, 0.08);
    case 'seguranca': return clamp(-0.3 * d.homicidios, -0.08, 0.08);
    case 'educacao': return clamp(0.15 * d.ideb, -0.06, 0.07);
    case 'emprego': return clamp(-2.5 * d.desemprego, -0.07, 0.07);
    case 'emocao': return 0.025;
    case 'ataque': return 0;
  }
}

/** Uma semana de campanha: horário eleitoral, ímpeto, adversários atacam o líder. */
export function semanaDeCampanha(e: EstadoEleicao, ctx: ContextoEleitoral, rng: Rng, horarioEleitoral: boolean, data: string) {
  const ativos = e.candidatos.filter((c) => c.ativo);
  const exp = intencaoEstadual(e, ctx, e.fase === 'segundoTurno' ? 2 : 1);
  const lider = [...ativos].sort((a, b) => (exp[b.id] ?? 0) - (exp[a.id] ?? 0))[0];
  for (const c of ativos) {
    c.momento *= 0.9;
    for (const k of Object.keys(c.agenda)) c.agenda[k] *= 0.94;
    const g = Math.sqrt(-2 * Math.log(Math.max(1e-9, rng.next()))) * Math.cos(2 * Math.PI * rng.next());
    c.momento += g * 0.025;
    if (!horarioEleitoral) continue;
    if (c.doJogador) {
      const ef = efeitoTema(e.tema, ctx) * (0.6 + 2 * c.tempoTV);
      c.momento += ef;
      if (e.tema === 'ataque') {
        const alvo = ativos.filter((x) => !x.doJogador).sort((a, b) => (exp[b.id] ?? 0) - (exp[a.id] ?? 0))[0];
        if (alvo) { alvo.momento -= 0.06 * (0.6 + 2 * c.tempoTV); c.desgaste += 0.025; }
      }
    } else {
      // a IA: quem está atrás ataca o líder; o líder fala de propostas
      if (c.id !== lider?.id && rng.chance(0.45) && lider) {
        lider.momento -= 0.03 * (0.6 + 2 * c.tempoTV);
        c.desgaste += 0.01;
        if (lider.doJogador && rng.chance(0.5)) e.log.unshift({ data, texto: `${c.urna} usa o horário eleitoral para atacar o governo.` });
      } else c.momento += 0.02 * (0.6 + 2 * c.tempoTV) * c.carisma;
      // agenda da IA: reduto e as maiores cidades
      const alvoCidade = rng.chance(0.5) && c.reduto ? c.reduto : ctx.eleitorado.municipios[rng.int(0, Math.min(15, ctx.eleitorado.municipios.length - 1))].ibge;
      c.agenda[alvoCidade] = (c.agenda[alvoCidade] ?? 0) + 0.1;
    }
    c.momento = clamp(c.momento, -0.6, 0.6);
  }
  e.visitas = 3;
  e.log = e.log.slice(0, 30);
}

// ── Debate ───────────────────────────────────────────────────────────────────────

export function criarDebate(e: EstadoEleicao, ctx: ContextoEleitoral, turno: 1 | 2, dia: number, data: string, tv: { ancora: string; nome: string }, rng: Rng): Debate {
  const d = ctx.delta;
  const jog = e.candidatos.find((c) => c.doJogador && c.ativo);
  const exp = intencaoEstadual(e, ctx, turno);
  const adv = e.candidatos.filter((c) => c.ativo && !c.doJogador).sort((a, b) => (exp[b.id] ?? 0) - (exp[a.id] ?? 0))[0];
  const nomeAdv = adv?.urna ?? 'o adversário';
  // tema do jornalista: o indicador que mais piorou desde a posse
  const piores: [string, number, string, boolean][] = [
    ['na segurança', d.homicidios, 'as mortes violentas', true], ['na saúde', d.espera, 'a espera nas emergências', false],
    ['no emprego', d.desemprego * 10, 'o desemprego', false], ['na saúde', d.fila, 'a fila de cirurgias', false],
  ];
  piores.sort((a, b) => b[1] - a[1]);
  const [area, var1, frase, plural] = piores[0];
  const piorou = var1 > 0.02;
  const P: Pergunta[] = [
    {
      quem: `${tv.ancora} (${tv.nome})`,
      texto: `Candidato, ${area}, ${frase} ${piorou ? (plural ? 'aumentaram' : 'piorou') : (plural ? 'quase não caíram' : 'quase não melhorou')} no seu governo. O que deu errado?`,
      opcoes: [
        { texto: 'Mostrar os números do governo', tipo: 'dados', efeito: piorou ? -0.07 : 0.05, nota: piorou ? 'A checagem da TV desmente os números do governador.' : 'Os números batem com os dados oficiais.' },
        { texto: 'Prometer um plano para os primeiros 100 dias', tipo: 'promessa', efeito: 0.03, nota: 'Promessa concreta, bem recebida.' },
        { texto: 'Culpar Brasília e a herança do governo anterior', tipo: 'esquiva', efeito: piorou ? 0.0 : -0.03, nota: 'Eleitor não gosta de quem terceiriza a culpa.' },
      ],
    },
    {
      quem: nomeAdv,
      texto: ctx.crises > 0.5 ? `Seu governo tem secretário investigado e escândalo na imprensa. Vai continuar fingindo que não vê?` : `O senhor prometeu muita obra. Cadê? O povo cansou de placa e foto.`,
      opcoes: [
        { texto: 'Rebater com a lista de entregas', tipo: 'dados', efeito: d.obras >= 3 ? 0.06 : -0.04, nota: d.obras >= 3 ? 'A lista de obras entregues cala o adversário.' : 'A lista é curta — e o adversário sabe disso.' },
        { texto: 'Contra-atacar o passado do adversário', tipo: 'ataque', efeito: 0.03, nota: 'O ataque funciona, mas aumenta a rejeição.' },
        { texto: 'Ignorar e falar de propostas', tipo: 'esquiva', efeito: 0.01, nota: 'Postura de estadista; pouco efeito.' },
      ],
    },
    {
      quem: 'Pergunta de eleitor',
      texto: `"Moro na periferia e pego dois ônibus para trabalhar. O que o senhor vai fazer pelo transporte?"`,
      opcoes: [
        { texto: 'Anunciar metrô/BRT para a próxima gestão', tipo: 'promessa', efeito: 0.04, nota: 'Grande promessa; a imprensa vai cobrar.' },
        { texto: 'Explicar o que já foi feito na mobilidade', tipo: 'dados', efeito: d.obras >= 2 ? 0.03 : -0.01, nota: 'Resposta técnica.' },
        { texto: 'Contar a história da sua mãe, que pegava ônibus', tipo: 'emocao', efeito: 0.03 * (jog ? jog.carisma * 2 : 1), nota: 'Emoção conecta — se o candidato tiver carisma.' },
      ],
    },
    {
      quem: 'Considerações finais',
      texto: 'Um minuto para falar diretamente com o eleitor.',
      opcoes: [
        { texto: 'Balanço do governo: "eu fiz, e vou fazer mais"', tipo: 'dados', efeito: ctx.aprovacao >= 45 ? 0.05 : -0.03, nota: ctx.aprovacao >= 45 ? 'O eleitor reconhece o governo.' : 'O balanço soa fora da realidade para quem está insatisfeito.' },
        { texto: 'Pedir o voto com emoção', tipo: 'emocao', efeito: 0.03, nota: 'Fecha bem.' },
        { texto: `Último ataque a ${nomeAdv}`, tipo: 'ataque', efeito: turno === 2 ? 0.04 : 0.02, nota: 'Agressividade no fim divide opiniões.' },
      ],
    },
  ];
  // embaralha a ordem das opções (a melhor não é sempre a primeira)
  for (const q of P) for (let i = q.opcoes.length - 1; i > 0; i--) { const j = rng.int(0, i); [q.opcoes[i], q.opcoes[j]] = [q.opcoes[j], q.opcoes[i]]; }
  const deb: Debate = { turno, data, dia, perguntas: P, concluido: false, placar: 0 };
  e.debates.push(deb);
  return deb;
}

/** Responde a próxima pergunta do debate em aberto. */
export function responderDebate(e: EstadoEleicao, opcao: number): { ok: boolean; msg: string; fim?: boolean } {
  const deb = e.debates.find((d) => !d.concluido);
  if (!deb) return { ok: false, msg: 'Não há debate em andamento' };
  const q = deb.perguntas.find((x) => x.respondida === undefined);
  if (!q) return { ok: false, msg: 'Debate já respondido' };
  const o = q.opcoes[opcao];
  if (!o) return { ok: false, msg: 'Resposta inválida' };
  q.respondida = opcao;
  deb.placar += o.efeito;
  const jog = e.candidatos.find((c) => c.doJogador && c.ativo);
  if (jog && o.tipo === 'ataque') jog.desgaste += 0.02;
  const fim = deb.perguntas.every((x) => x.respondida !== undefined);
  if (fim) fecharDebate(e, deb);
  return { ok: true, msg: o.nota, fim };
}

export function fecharDebate(e: EstadoEleicao, deb: Debate, ausente = false) {
  deb.concluido = true;
  const jog = e.candidatos.find((c) => c.doJogador && c.ativo);
  if (ausente) deb.placar = -0.08;
  if (jog) jog.momento = clamp(jog.momento + deb.placar, -0.6, 0.6);
  deb.resumo = ausente
    ? 'Cadeira vazia: o candidato do governo não foi ao debate. Os adversários bateram à vontade.'
    : deb.placar > 0.1 ? 'Pesquisa relâmpago: o candidato do governo venceu o debate com folga.'
      : deb.placar > 0.03 ? 'Pesquisa relâmpago: vitória apertada do candidato do governo no debate.'
        : deb.placar > -0.02 ? 'Debate morno: ninguém venceu com clareza.' : 'Pesquisa relâmpago: o candidato do governo saiu derrotado do debate.';
}

// ── 2º turno: apoios ─────────────────────────────────────────────────────────────

/** Eliminados declaram apoio (IA) ao finalista mais próximo — se não for muito distante. */
export function apoiosAutomaticos(e: EstadoEleicao) {
  const fin = e.candidatos.filter((c) => c.ativo);
  for (const c of e.candidatos.filter((x) => !x.ativo)) {
    if (fin.some((f) => f.apoios.includes(c.id))) continue;
    const alvo = [...fin].sort((a, b) => Math.abs(a.ideologia - c.ideologia) - Math.abs(b.ideologia - c.ideologia))[0];
    if (alvo && Math.abs(alvo.ideologia - c.ideologia) < 0.45 && !alvo.doJogador) alvo.apoios.push(c.id);
  }
}

export function pedirApoio(e: EstadoEleicao, candId: number, rng: Rng): { ok: boolean; msg: string } {
  const c = e.candidatos.find((x) => x.id === candId && !x.ativo);
  const jog = e.candidatos.find((x) => x.doJogador && x.ativo);
  if (!c || !jog || e.fase !== 'segundoTurno') return { ok: false, msg: 'Só no 2º turno, com candidatos eliminados' };
  const fin = e.candidatos.filter((x) => x.ativo);
  if (fin.some((f) => f.apoios.includes(c.id))) return { ok: false, msg: `${c.urna} já declarou apoio` };
  const chance = clamp(0.75 - 0.9 * Math.abs(c.ideologia - jog.ideologia), 0.1, 0.85);
  if (!rng.chance(chance)) {
    fin.forEach((f) => { if (!f.doJogador && Math.abs(f.ideologia - c.ideologia) < 0.6 && !f.apoios.includes(c.id)) f.apoios.push(c.id); });
    return { ok: false, msg: `${c.urna} recusou o apoio${fin.some((f) => !f.doJogador && f.apoios.includes(c.id)) ? ' e fechou com o adversário' : ''}.` };
  }
  jog.apoios.push(c.id);
  return { ok: true, msg: `${c.urna} declara apoio ao candidato do governo no 2º turno.` };
}
