/**
 * Modo Presidente (Fase 9): o Planalto. Um dia por passo; no dia 1 de cada mês roda a economia,
 * a aprovação, o Congresso e os eventos. Estado só de dados (serializa em JSON) — a UI lê a instância.
 *
 *  - Economia: src/sim/presidente/economia.ts (PIB, inflação, câmbio, dívida, Copom).
 *  - Orçamento: base por programa + medidas em vigor − contingenciamento, dentro do limite do arcabouço.
 *  - Congresso: Câmara (513) e Senado (81) com deputados e senadores fictícios; votações usam o mesmo
 *    modelo de propensão da Assembleia (Fase 5). MPs valem na hora e caducam em 120 dias; PEC exige 3/5 em
 *    dois turnos nas duas Casas.
 *  - STF: 11 ministros com idade (aposentadoria aos 75), ações contra medidas aprovadas, liminares.
 *  - Banco Central autônomo (LC 179/2021): Copom 8×/ano, mandato do presidente do BC defasado.
 *  - Governadores, aprovação por UF, eleição presidencial por UF, impeachment e legado.
 */
import type { DadosMacro } from '../../data/macro';
import { Rng, seedFromString } from '../core/rng';
import { Motor, novoEstadoEventos, sortearStorylet, type Contexto, type Efeitos, type EstadoEventos, type Storylet } from '../eventos/motor';
import { BANCADAS, composicaoBancadas, DEP_FEDERAIS, PARTIDOS, type IdBancada, type IdPartido } from '../politica/dados';
import { gerarPessoa, placar, votar, type Deputado, type EstadoPolitico, type Placar, type Postura, type Projeto } from '../politica/politica';
import { MEDIDA, MINISTERIOS, INCLINACAO, QUORUM, TURNOS, type IdMinisterio, type TipoProposta } from './dados';
import { COPOM, criarEconomia, decisaoCopom, despesaTotal, passoEconomia, PROGRAMAS, type Economia, type Programa } from './economia';

export interface UFBasica { sigla: string; nome: string; regiao: string; populacao: number; cidades: string[] }

export interface PresInit {
  partido: IdPartido;
  origem: string;
  nome: string;
  genero: 'f' | 'm';
  anoInicio: number;
  semente: string;
  macro: DadosMacro;
  ufs: UFBasica[];
  /** vindo de um governo estadual (carreira): aprovação final como governador(a) */
  carreira?: { uf: string; aprovacao: number };
}

/** Câmara ou Senado — compatível com o EstadoPolitico da Fase 5 nas funções de votação (votacoes/pauta/capital são internos dela). */
export interface Casa { cadeiras: number; deputados: Deputado[]; presidenteALE: number; votacoes: unknown[]; pauta: unknown[]; capital: number }

export interface Proposta {
  uid: number;
  medida: string;
  tipo: TipoProposta;
  titulo: string;
  casa: 'camara' | 'senado';
  turno: number;
  votaEm: number;
  desde: number;
  /** MP: dia em que caduca */
  caducaEm?: number;
  status: 'tramitando' | 'aprovada' | 'rejeitada' | 'caducou' | 'retirada';
  bonus: number;
  urgencia: boolean;
  log: string[];
}

export interface Vigente { medida: string; uid: number; desde: number; provisoria: boolean; suspensa: boolean }
export interface Ministro { nome: string; genero: 'f' | 'm'; partido: IdPartido | null; competencia: number; retrato: number }
export interface MinistroSTF { id: number; nome: string; genero: 'f' | 'm'; idade: number; ideologia: number; indicadoPorVoce: boolean; retrato: number }
export interface AcaoSTF { uid: number; medida: string; autor: IdPartido; julgaEm: number; liminar: boolean; status: 'pendente' | 'mantida' | 'derrubada'; votos?: [number, number] }
export interface CandidatoCargo { nome: string; genero: 'f' | 'm'; perfil: string; ideologia: number; desc: string; retrato: number }
export interface Governador { uf: string; nome: string; genero: 'f' | 'm'; partido: IdPartido; relacao: number; retrato: number }
export interface Noticia { data: string; texto: string; tom: 'bom' | 'ruim' | 'alerta' | 'info' }
export interface Votacao { data: string; titulo: string; casa: string; sim: number; nao: number; necessarios: number; aprovado: boolean }

export interface CandPres { id: number; nome: string; genero: 'f' | 'm'; partido: IdPartido; ideologia: number; carisma: number; doJogador: boolean; retrato: number; ativo: boolean }
export interface EleicaoPres {
  ano: number;
  fase: 'pre' | 'campanha' | 'segundo' | 'encerrada';
  candidatos: CandPres[];
  pesquisas: { data: string; v: number[] }[];
  campanha: Record<string, number>;
  primeiro?: { total: number[]; porUF: Record<string, number[]> };
  segundo?: { total: number[]; porUF: Record<string, number[]>; ids: [number, number] };
  vencedor?: number;
  dia1: number;
  dia2: number;
}

export interface PontoSerie { data: string; aprovacao: number; inflacao: number; selic: number; cambio: number; desemprego: number; crescimento: number; divida: number; primario: number }

export interface FimPres { motivo: 'mandato' | 'derrota' | 'impeachment' | 'sucessor-eleito' | 'sucessor-derrotado'; data: string; texto: string }

type EfeitosPres = Efeitos & Partial<{
  inflacao: number; hiato: number; cambio: number; credibilidade: number; divida: number; despesaExtra: number;
  camara: number; senado: number; governadores: number; ufs: Record<string, number>; escandalo: number; receita: number;
}>;

const DISCRICIONARIAS: Programa[] = ['bolsa', 'saude', 'educacao', 'investimentos', 'emendas', 'custeio'];
const PISOS: Partial<Record<Programa, number>> = { saude: 1.6, educacao: 1.05, emendas: 0.3 };
const DM = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const sigm = (x: number) => 1 / (1 + Math.exp(-x));
const bissexto = (a: number) => (a % 4 === 0 && a % 100 !== 0) || a % 400 === 0;

/** Dia do mês do n-ésimo domingo (n = −1: último) — calendário eleitoral (CF art. 77). */
export function domingo(ano: number, mes: number, n: number): number {
  const dias = mes === 2 && bissexto(ano) ? 29 : DM[mes - 1];
  const doms: number[] = [];
  for (let d = 1; d <= dias; d++) if (new Date(Date.UTC(ano, mes - 1, d)).getUTCDay() === 0) doms.push(d);
  return n < 0 ? doms[doms.length - 1] : doms[n - 1];
}

export class Presidencia {
  init: PresInit;
  ano: number; mes: number; dia: number;
  /** dias desde a posse */
  t = 0;
  rngState: [number, number, number, number];
  eco: Economia;
  base: Record<Programa, number>;
  ploa: Record<Programa, number>;
  loaAprovada = true;
  contingenciamento = 0;
  limite: number;
  gastoExtra = 0;
  descumprimentos = 0;
  gatilhos = false;
  metaPorAno: Record<number, number>;
  despesaAnterior: number;

  camara: Casa; senado: Casa;
  posturas: Record<IdPartido, Postura>;
  capital = 50;
  propostas: Proposta[] = [];
  vigentes: Vigente[] = [];
  enviadas: string[] = [];
  votacoes: Votacao[] = [];
  mpsAno = 0;
  ministros: Record<IdMinisterio, Ministro>;

  stf: MinistroSTF[];
  acoes: AcaoSTF[] = [];
  vagaSTF: { candidatos: CandidatoCargo[]; aberta: number } | null = null;

  bc: { presidente: CandidatoCargo & { perfil: string; vies: number; indicadoPorVoce: boolean }; mandatoAte: number; decisoes: { data: string; selic: number; mudanca: number }[]; indicacao: CandidatoCargo[] | null; ultimaCritica: number; ultimoSwap: number };

  governadores: Governador[];
  aprovacao = 50;
  aprovUF: Record<string, number> = {};
  bonusUF: Record<string, number> = {};
  lado = 0;
  choqueAprov = 0;
  escandalos = 0;
  visitasMes = 0;
  ultimaVisita: Record<string, number> = {};
  obrasAno: string[] = [];

  eventos: EstadoEventos = novoEstadoEventos();
  noticias: Noticia[] = [];
  serie: PontoSerie[] = [];
  eleicao: EleicaoPres | null = null;
  mandato = 1;
  impeachment: { fase: 'camara' | 'senado'; votaEm: number } | null = null;
  fim: FimPres | null = null;
  nextUid = 1;

  private rng: Rng;
  private motor: Motor;

  constructor(init: PresInit, storylets: Storylet[]) {
    this.init = init;
    this.motor = new Motor(storylets);
    this.rng = new Rng(seedFromString(`PRES:${init.semente}`));
    this.rngState = this.rng.state();
    this.ano = init.anoInicio; this.mes = 1; this.dia = 5;
    this.eco = criarEconomia(init.macro);
    this.base = { ...this.eco.despesas };
    this.ploa = { ...this.base };
    // trajetória de metas (Fase 10: suavizada para ser alcançável com ajuste; a LDO real é mais ambiciosa)
    this.metaPorAno = { [this.ano]: 0, [this.ano + 1]: 0.25, [this.ano + 2]: 0.5, [this.ano + 3]: 0.75, [this.ano + 4]: 0.75, [this.ano + 5]: 0.75, [this.ano + 6]: 0.75, [this.ano + 7]: 0.75 };
    this.eco.meta = this.metaPorAno[this.ano];
    this.limite = despesaTotal(this.eco) + 0.1;
    this.despesaAnterior = despesaTotal(this.eco);

    const ideo = PARTIDOS[init.partido].ideologia;
    this.posturas = {} as Record<IdPartido, Postura>;
    for (const p of Object.values(PARTIDOS)) {
      const dist = Math.abs(p.ideologia - ideo);
      this.posturas[p.id] = p.id === init.partido || dist < 0.45 ? 'base' : p.fisiologismo > 0.75 || dist < 0.9 ? 'independente' : 'oposicao';
    }
    this.ministros = this.montarMinisterio();
    this.camara = this.montarCasa('camara', `CAM:${init.semente}:${this.ano}`);
    this.senado = this.montarCasa('senado', `SEN:${init.semente}:${this.ano}`);
    this.stf = this.montarSTF();
    this.bc = this.montarBC();
    this.governadores = this.montarGovernadores();
    for (const u of init.ufs) this.bonusUF[u.sigla] = 0;
    if (init.carreira) this.bonusUF[init.carreira.uf] = 4 + Math.max(0, init.carreira.aprovacao - 45) / 5;
    this.aprovacao = 52;
    this.atualizarAprovacao(true);
    this.registrarSerie();
    this.noticia(`${this.titulo()} ${init.nome} toma posse no Congresso Nacional. Dólar a R$ ${this.eco.cambio.toFixed(2).replace('.', ',')}, Selic em ${this.fmtPct(this.eco.selic)} e dívida em ${this.fmtPct(this.eco.divida)} do PIB.`, 'info');
    this.rngState = this.rng.state();
  }

  // ── utilidades ──────────────────────────────────────────────────────────────

  titulo() { return this.init.genero === 'f' ? 'A presidente' : 'O presidente'; }
  dataTexto() { return `${String(this.dia).padStart(2, '0')}/${String(this.mes).padStart(2, '0')}/${this.ano}`; }
  fmtPct(v: number) { return `${v.toFixed(2).replace('.', ',')}%`; }
  noticia(texto: string, tom: Noticia['tom']) {
    this.noticias.unshift({ data: this.dataTexto(), texto, tom });
    this.noticias = this.noticias.slice(0, 120);
  }
  get ideologia() { return PARTIDOS[this.init.partido].ideologia; }
  private pessoa(cidades: string[], idade: [number, number]) { return gerarPessoa(this.rng, cidades, [''], idade); }
  private cidades(uf?: string) { return (uf ? this.init.ufs.find((u) => u.sigla === uf)?.cidades : this.init.ufs.flatMap((u) => u.cidades.slice(0, 2))) ?? ['Brasília']; }
  private sortear<T>(itens: [T, number][]): T {
    const tot = itens.reduce((a, [, w]) => a + w, 0);
    let r = this.rng.next() * tot;
    for (const [x, w] of itens) { r -= w; if (r <= 0) return x; }
    return itens[itens.length - 1][0];
  }

  private montarMinisterio(): Record<IdMinisterio, Ministro> {
    const out = {} as Record<IdMinisterio, Ministro>;
    // coalizão de largada: o centrão leva Cidades e Minas e Energia; o resto é do partido ou técnico
    const centrao = (Object.keys(PARTIDOS) as IdPartido[]).filter((p) => PARTIDOS[p].fisiologismo > 0.75);
    for (const m of MINISTERIOS) {
      const p = this.pessoa(this.cidades(), [40, 70]);
      const partido: IdPartido | null = m.id === 'cidades' ? centrao[0] : m.id === 'minas' ? centrao[1] ?? centrao[0] : m.id === 'casaCivil' || m.id === 'relacoes' ? this.init.partido : null;
      out[m.id] = { nome: p.nome, genero: p.genero, partido, competencia: partido ? this.rng.range(0.35, 0.7) : this.rng.range(0.6, 0.9), retrato: p.retrato };
    }
    for (const p of centrao) if (this.posturas[p] !== 'oposicao') this.posturas[p] = 'base';
    return out;
  }

  private montarCasa(qual: 'camara' | 'senado', semente: string): Casa {
    const rng = new Rng(seedFromString(semente));
    const ideo = this.ideologia;
    const deputados: Deputado[] = [];
    let id = 1;
    for (const u of this.init.ufs) {
      const n = qual === 'camara' ? DEP_FEDERAIS[u.sigla] ?? 8 : 3;
      const comp = composicaoBancadas(u.regiao, 0.5);
      if (qual === 'senado') { comp.oposicao *= 0.8; comp.centrao *= 1.2; }
      // estados à esquerda elegem mais sindicais/ambientalistas; à direita, mais bala/ruralistas
      const inc = INCLINACAO[u.sigla] ?? 0;
      comp.sindical *= 1 - 0.5 * inc; comp.ambientalista *= 1 - 0.4 * inc; comp.bala *= 1 + 0.4 * inc; comp.ruralista *= 1 + 0.3 * inc;
      const lista = Object.entries(comp) as [IdBancada, number][];
      for (let k = 0; k < n; k++) {
        const tot = lista.reduce((a, [, w]) => a + w, 0);
        let r = rng.next() * tot, b: IdBancada = 'centrao';
        for (const [x, w] of lista) { r -= w; if (r <= 0) { b = x; break; } }
        const banc = BANCADAS[b];
        let partido = banc.partidos[0][0];
        { const t2 = banc.partidos.reduce((a, [, w]) => a + w, 0); let r2 = rng.next() * t2; for (const [x, w] of banc.partidos) { r2 -= w; if (r2 <= 0) { partido = x; break; } } }
        if (b === 'oposicao') {
          // a "oposição raiz" é do campo ideológico oposto ao do governo
          const opostos = (Object.keys(PARTIDOS) as IdPartido[]).filter((p) => Math.sign(PARTIDOS[p].ideologia) !== Math.sign(ideo) && Math.abs(PARTIDOS[p].ideologia) > 0.4);
          partido = opostos[rng.int(0, opostos.length - 1)] ?? partido;
        }
        const pt = PARTIDOS[partido];
        const p = gerarPessoa(rng, u.cidades.length ? u.cidades : [u.nome], banc.bordoes, qual === 'senado' ? [40, 80] : [28, 75]);
        const postura = b === 'oposicao' ? 'oposicao' : this.posturas[partido];
        const rel0 = postura === 'base' ? 0.4 : postura === 'independente' ? 0 : -0.5;
        const titulo = banc.titulos[rng.int(0, banc.titulos.length - 1)];
        const nomes = p.nome.split(' ');
        deputados.push({
          ...p, cidade: u.sigla, id: id++, urna: `${titulo ? titulo + ' ' : ''}${nomes[0]} ${nomes[nomes.length - 1]}`.trim(), partido, bancada: b,
          ideologia: clamp(pt.ideologia + rng.range(-0.25, 0.25), -1, 1),
          influencia: clamp(0.3 + Math.pow(rng.next(), 2) * 0.7, 0.3, 1),
          fisiologismo: clamp(pt.fisiologismo + rng.range(-0.2, 0.2) + (b === 'centrao' ? 0.15 : 0), 0, 1),
          tecnico: rng.range(0.1, 0.8), telhado: rng.next(),
          relacao: clamp(rel0 + rng.range(-0.25, 0.25), -1, 1),
          mandatos: 1 + Math.floor(Math.pow(rng.next(), 2) * (qual === 'senado' ? 4 : 6)),
          favores: [], cartas: [], promessas: [],
        });
      }
    }
    const cand = deputados.filter((d) => d.bancada === 'centrao').sort((a, b) => b.influencia * b.mandatos - a.influencia * a.mandatos);
    const pres = cand[0] ?? deputados[0];
    pres.influencia = 1;
    return { cadeiras: deputados.length, deputados, presidenteALE: pres.id, votacoes: [], pauta: [], capital: 50 };
  }

  private montarSTF(): MinistroSTF[] {
    // idades espalhadas: dois ou três ministros chegam aos 75 dentro de um mandato
    const idades = [74, 72, 71, 69, 67, 63, 60, 58, 56, 54, 52].map((i) => i - this.rng.int(0, 2));
    return idades.map((idade, i) => {
      const p = this.pessoa(this.cidades(), [idade, idade]);
      return { id: i + 1, nome: p.nome, genero: p.genero, idade, ideologia: clamp(this.rng.range(-0.7, 0.7), -1, 1), indicadoPorVoce: false, retrato: p.retrato };
    });
  }

  private candidatosBC(): CandidatoCargo[] {
    const perfis: [string, number, string][] = [['ortodoxo', 0.45, 'Economista-chefe de banco, defende juro alto até a inflação ceder.'], ['moderado', 0.1, 'Ex-diretor do BC, pragmático e respeitado pelo mercado.'], ['desenvolvimentista', -0.5, 'Professor de macroeconomia, acha que o juro real está alto demais.']];
    return perfis.map(([perfil, ideologia, desc]) => { const p = this.pessoa(this.cidades(), [45, 66]); return { nome: p.nome, genero: p.genero, perfil, ideologia, desc, retrato: p.retrato }; });
  }

  private montarBC() {
    const c = this.candidatosBC()[0];
    // LC 179/2021: o mandato do presidente do BC começa no 3º ano do mandato presidencial
    return { presidente: { ...c, perfil: 'herdado', vies: 0.2, indicadoPorVoce: false, desc: 'Indicado(a) pelo governo anterior, mandato até o fim do 2º ano do seu governo.' }, mandatoAte: this.ano + 1, decisoes: [], indicacao: null, ultimaCritica: -999, ultimoSwap: -999 };
  }

  private montarGovernadores(): Governador[] {
    return this.init.ufs.map((u) => {
      const inc = INCLINACAO[u.sigla] ?? 0;
      const partidos = (Object.keys(PARTIDOS) as IdPartido[]).map((p) => [p, Math.exp(-3 * Math.abs(PARTIDOS[p].ideologia - inc * 0.7)) + PARTIDOS[p].fisiologismo * 0.4] as [IdPartido, number]);
      const partido = this.sortear(partidos);
      const p = this.pessoa(u.cidades.length ? u.cidades : [u.nome], [42, 70]);
      const rel = clamp(0.5 - Math.abs(PARTIDOS[partido].ideologia - this.ideologia) * 0.6 + this.rng.range(-0.2, 0.2), -1, 1);
      return { uf: u.sigla, nome: p.nome, genero: p.genero, partido, relacao: rel, retrato: p.retrato };
    });
  }

  // ── orçamento ───────────────────────────────────────────────────────────────

  /** Despesa executada = orçamento base + medidas em vigor − contingenciamento (+ gastos extras do mês). */
  recalcularDespesas() {
    const d = { ...this.base };
    for (const v of this.vigentes) {
      if (v.suspensa) continue;
      for (const [k, x] of Object.entries(MEDIDA[v.medida]?.despesa ?? {})) d[k as Programa] += x as number;
    }
    d.abonoSeguro = clamp(this.base.abonoSeguro + 0.06 * (this.eco.desemprego - 5.3), 0.4, 1.6);
    for (const k of ['investimentos', 'custeio', 'emendas'] as Programa[]) d[k] *= 1 - this.contingenciamento;
    d.investimentos += this.gastoExtra;
    for (const k of Object.keys(d) as Programa[]) d[k] = Math.max(0, d[k]);
    this.eco.despesas = d;
    this.eco.receitaMedidas = this.vigentes.filter((v) => !v.suspensa).reduce((a, v) => a + (MEDIDA[v.medida]?.receita ?? 0), 0);
  }

  ploaTotal() { return Object.values(this.ploa).reduce((a, b) => a + b, 0); }
  ploaCabe() { return this.ploaTotal() <= this.limite + 0.005; }

  // ── passo diário ────────────────────────────────────────────────────────────

  passoDia() {
    if (this.fim) return;
    this.dia++;
    const dias = this.mes === 2 && bissexto(this.ano) ? 29 : DM[this.mes - 1];
    if (this.dia > dias) {
      this.dia = 1; this.mes++;
      if (this.mes > 12) { this.mes = 1; this.ano++; this.virarAno(); }
    }
    this.t++;
    if (this.dia === 1) this.mensal();
    if (this.mes === 1 && this.dia === 5 && this.eleicao?.fase === 'encerrada') this.posse();
    if (COPOM.some(([m, d]) => m === this.mes && d === this.dia)) this.copom();
    for (const p of this.propostas.filter((x) => x.status === 'tramitando')) {
      if (p.caducaEm !== undefined && this.t >= p.caducaEm) this.caducar(p);
      else if (this.t >= p.votaEm) this.votarProposta(p);
    }
    for (const a of this.acoes.filter((x) => x.status === 'pendente' && this.t >= x.julgaEm)) this.julgar(a);
    if (this.impeachment && this.t >= this.impeachment.votaEm) this.votarImpeachment();
    this.diaEleitoral();
    for (const s of this.motor.vencidos(this.eventos, this.contexto(), this.t, this.dataTexto(), this.rng)) {
      this.aplicarEfeitos(s.efeitos as EfeitosPres);
      if (s.texto) this.noticia(s.texto, s.tom);
    }
  }

  avancar(dias: number) { for (let i = 0; i < dias && !this.fim; i++) this.passoDia(); }

  private virarAno() {
    this.mpsAno = 0;
    this.obrasAno = [];
    for (const m of this.stf) m.idade++;
    // LOA do ano: aprovada em dezembro ou duodécimos (o orçamento anterior segue valendo)
    if (this.loaAprovada) for (const k of DISCRICIONARIAS) this.base[k] = this.ploa[k];
    this.contingenciamento = 0;
    this.eco.meta = this.metaPorAno[this.ano] ?? 1;
    // arcabouço (LC 200/2023): a despesa cresce 70% do crescimento real da receita, entre 0,6% e 2,5%
    const gLim = clamp(0.7 * this.eco.crescimento, 0.6, 2.5);
    this.limite = this.limite * (1 + gLim / 100) / (1 + Math.max(-3, this.eco.crescimento) / 100);
    this.ploa = { ...this.base };
    for (const m of this.stf.filter((x) => x.idade >= 75)) this.abrirVagaSTF(m);
  }

  private mensal() {
    // envelhecimento: a Previdência sobe ~0,07 p.p. do PIB por ano
    this.base.previdencia += 0.006;
    this.recalcularDespesas();
    const desp = despesaTotal(this.eco);
    const impulso = desp - this.despesaAnterior;
    this.despesaAnterior = desp;
    this.gastoExtra *= 0.4;
    passoEconomia(this.eco, this.rng, { impulso, descumpriuMeta: this.gatilhos });
    this.capital = clamp(this.capital + 2.5 + (this.aprovacao - 45) / 20, 0, 100);
    this.visitasMes = 0;
    this.atualizarAprovacao(false);
    this.relacoesMensais();
    this.lado *= 0.97;
    this.escandalos = Math.max(0, this.escandalos - 0.08);
    if (this.mes === 9 && this.dia === 1) this.noticia(`O Planalto envia ao Congresso o Orçamento de ${this.ano + 1}: despesa primária de ${this.ploaTotal().toFixed(1).replace('.', ',')}% do PIB (limite do arcabouço: ${this.limite.toFixed(1).replace('.', ',')}%).`, 'info');
    if (this.mes === 12) this.votarLOA();
    if (this.mes === 1 && this.ano > this.init.anoInicio) this.fecharAnoFiscal();
    // BC: indicação no fim do mandato do presidente do BC
    if (this.ano === this.bc.mandatoAte && this.mes === 10 && !this.bc.indicacao) {
      this.bc.indicacao = this.candidatosBC();
      this.noticia(`O mandato de ${this.bc.presidente.nome} no Banco Central termina em dezembro. O Planalto precisa indicar o sucessor ao Senado.`, 'alerta');
    }
    if (this.ano === this.bc.mandatoAte + 1 && this.mes === 1 && this.bc.indicacao) {
      // sem indicação aprovada, o Senado aprova o nome técnico do próprio BC
      const c = this.bc.indicacao[1];
      this.bc.presidente = { ...c, vies: 0.15, indicadoPorVoce: false };
      this.bc.mandatoAte = this.ano + 3;
      this.bc.indicacao = null;
      this.noticia(`Sem indicação do Planalto, ${c.nome} assume o Banco Central como interino(a) e é efetivado(a).`, 'info');
    }
    this.checarImpeachment();
    this.eventoMensal();
    this.eleicaoMensal();
    this.registrarSerie();
  }

  private fecharAnoFiscal() {
    const ano = this.ano - 1, meta = this.metaPorAno[ano] ?? 0, r = this.eco.primario;
    if (r < meta - 0.25) {
      this.descumprimentos++;
      this.gatilhos = true;
      this.eco.credibilidade = clamp(this.eco.credibilidade - 0.05, 0.1, 0.95);
      this.noticia(`Meta fiscal de ${ano} descumprida: primário de ${this.fmtPct(r)} do PIB contra meta de ${this.fmtPct(meta)}. Gatilhos do arcabouço acionados — sem aumento real de despesas em ${this.ano}.`, 'ruim');
    } else {
      this.gatilhos = false;
      this.eco.credibilidade = clamp(this.eco.credibilidade + 0.02, 0.1, 0.95);
      this.noticia(`Meta fiscal de ${ano} cumprida: primário de ${this.fmtPct(r)} do PIB (meta ${this.fmtPct(meta)}, tolerância de 0,25 p.p.).`, 'bom');
    }
  }

  private copom() {
    const antes = this.eco.selic;
    const nova = decisaoCopom(this.eco, this.bc.presidente.vies);
    this.eco.selic = nova;
    const mud = nova - antes;
    this.bc.decisoes.unshift({ data: this.dataTexto(), selic: nova, mudanca: mud });
    this.bc.decisoes = this.bc.decisoes.slice(0, 24);
    const txt = mud === 0 ? `Copom mantém a Selic em ${this.fmtPct(nova)}.` : `Copom ${mud > 0 ? 'eleva' : 'corta'} a Selic em ${Math.round(Math.abs(mud) * 100)} pontos-base, para ${this.fmtPct(nova)}.`;
    this.noticia(`${txt} Expectativa de inflação em 12 meses: ${this.fmtPct(this.eco.expectativa)}.`, mud > 0 ? 'alerta' : mud < 0 ? 'bom' : 'info');
  }

  // ── aprovação ───────────────────────────────────────────────────────────────

  private eleitores(uf: string) { return this.init.macro.eleitorado[uf] ?? 1; }

  atualizarAprovacao(inicial: boolean) {
    const e = this.eco;
    const meses = this.t / 30;
    const luaDeMel = this.mandato === 1 ? 7 * Math.exp(-meses / 6) : 2 * Math.exp(-meses / 6);
    // Fase 10: crise fiscal (risco alto, metas descumpridas) também custa popularidade
    const nucleo = 47 + luaDeMel - 6 * Math.max(0, e.risco - 0.55) - 1 * this.descumprimentos - 2.4 * (e.inflacao - 4.5) - 2.0 * (e.desemprego - 6) + 1.2 * (e.crescimento - 2) + 10 * (e.despesas.bolsa - 1.4) - 3 * this.escandalos + this.choqueAprov - 3 * Math.max(0, e.cambio / e.cambio0 - 1.15) * 10;
    this.choqueAprov *= 0.8;
    let soma = 0, peso = 0;
    for (const u of this.init.ufs) {
      const gov = this.governadores.find((g) => g.uf === u.sigla);
      const inc = INCLINACAO[u.sigla] ?? 0;
      const v = nucleo + 10 * inc * this.ideologia - 4 * inc * this.lado + 3 * (gov?.relacao ?? 0) + (this.bonusUF[u.sigla] ?? 0) + (u.sigla === this.init.origem ? 6 : 0);
      const ant = this.aprovUF[u.sigla] ?? v;
      this.aprovUF[u.sigla] = clamp(inicial ? v : ant + 0.3 * (v - ant), 3, 95);
      this.bonusUF[u.sigla] = (this.bonusUF[u.sigla] ?? 0) * 0.85;
      const w = this.eleitores(u.sigla);
      soma += this.aprovUF[u.sigla] * w; peso += w;
    }
    this.aprovacao = soma / Math.max(1, peso);
  }

  // ── Congresso ───────────────────────────────────────────────────────────────

  private relacoesMensais() {
    const ministeriosPorPartido: Partial<Record<IdPartido, number>> = {};
    for (const m of Object.values(this.ministros)) if (m.partido) ministeriosPorPartido[m.partido] = (ministeriosPorPartido[m.partido] ?? 0) + 1;
    for (const casa of [this.camara, this.senado]) {
      for (const d of casa.deputados) {
        const post = d.bancada === 'oposicao' ? 'oposicao' : this.posturas[d.partido];
        const alvo = (post === 'base' ? 0.35 : post === 'independente' ? 0 : -0.5) + d.fisiologismo * (this.aprovacao - 42) / 60 + 0.08 * (ministeriosPorPartido[d.partido] ?? 0) * d.fisiologismo + 0.15 * (1 - this.contingenciamento * 3) * d.fisiologismo - 0.15;
        d.relacao = clamp(d.relacao + 0.12 * (alvo - d.relacao) + this.rng.range(-0.03, 0.03), -1, 1);
      }
    }
    for (const g of this.governadores) g.relacao = clamp(g.relacao + 0.05 * ((this.aprovUF[g.uf] - 45) / 40 - g.relacao) + this.rng.range(-0.02, 0.02), -1, 1);
  }

  /** Fração da Câmara com relação positiva (base efetiva). */
  base_() { return this.camara.deputados.filter((d) => d.relacao > 0.1).length / this.camara.cadeiras; }

  private projeto(p: Proposta): Projeto {
    const m = MEDIDA[p.medida];
    return { id: `${p.uid}-${p.casa}-${p.turno}`, tipo: 'credito', titulo: p.titulo, descricao: m?.descricao ?? '', quorum: QUORUM[p.tipo] === '3/5' ? '3/5' : 'simples', eixos: m?.eixos ?? {}, governoQuer: 'sim', gravidade: 0, votaEm: p.votaEm, dataVotacao: '' } as Projeto;
  }
  private pol(c: Casa) { return c as unknown as EstadoPolitico; }

  placarProposta(p: Proposta): Placar {
    return placar(this.pol(p.casa === 'camara' ? this.camara : this.senado), this.projeto(p), { aprovacao: this.aprovacao, bonus: p.bonus });
  }

  private votarProposta(p: Proposta) {
    const casa = p.casa === 'camara' ? this.camara : this.senado;
    const r = votar(this.pol(casa), this.projeto(p), { aprovacao: this.aprovacao, bonus: p.bonus }, this.rng);
    const pl = placar(this.pol(casa), this.projeto(p), { aprovacao: this.aprovacao, bonus: p.bonus });
    const nomeCasa = p.casa === 'camara' ? 'Câmara' : 'Senado';
    const turnoTxt = TURNOS[p.tipo] > 1 ? ` (${p.turno}º turno)` : '';
    this.votacoes.unshift({ data: this.dataTexto(), titulo: `${p.tipo} — ${p.titulo}${turnoTxt}`, casa: nomeCasa, sim: r.aFavor, nao: r.contra, necessarios: pl.necessarios, aprovado: r.aprovado });
    this.votacoes = this.votacoes.slice(0, 60);
    p.log.push(`${this.dataTexto()}: ${nomeCasa}${turnoTxt} ${r.aprovado ? 'aprova' : 'rejeita'} por ${r.aFavor} a ${r.contra}`);
    if (!r.aprovado) {
      p.status = 'rejeitada';
      this.noticia(`${nomeCasa} rejeita ${p.tipo === 'MP' ? 'a MP' : p.tipo === 'PEC' ? 'a PEC' : 'o projeto'} "${p.titulo}"${turnoTxt}: ${r.aFavor} votos a favor, ${pl.necessarios} necessários. Derrota do governo.`, 'ruim');
      this.choqueAprov -= 1.5;
      this.capital = clamp(this.capital - 5, 0, 100);
      if (p.tipo === 'MP') this.revogar(p.uid, 'rejeitada');
      return;
    }
    this.noticia(`${nomeCasa} aprova "${p.titulo}"${turnoTxt} por ${r.aFavor} a ${r.contra}.`, 'bom');
    if (p.turno < TURNOS[p.tipo]) { p.turno++; p.votaEm = this.t + 7; return; }
    if (p.casa === 'camara') { p.casa = 'senado'; p.turno = 1; p.votaEm = this.t + Math.max(20, Math.round(MEDIDA[p.medida].tramitacao * 30 * (p.urgencia ? 0.4 : 0.7))); if (p.caducaEm !== undefined) p.votaEm = Math.min(p.votaEm, p.caducaEm - 3); return; }
    p.status = 'aprovada';
    p.caducaEm = undefined;
    const vig = this.vigentes.find((v) => v.uid === p.uid);
    if (vig) vig.provisoria = false; else this.entrarEmVigor(p, false);
    this.noticia(p.tipo === 'PEC' ? `Congresso promulga a emenda constitucional: "${p.titulo}".` : `${this.titulo()} sanciona "${p.titulo}".`, 'bom');
    this.choqueAprov += 1;
    this.talvezADI(p.medida, p.uid);
  }

  private entrarEmVigor(p: Proposta, provisoria: boolean) {
    const m = MEDIDA[p.medida];
    this.vigentes.push({ medida: p.medida, uid: p.uid, desde: this.t, provisoria, suspensa: false });
    this.choqueAprov += m.aprovacao;
    this.lado += m.lado ?? 0;
    if (m.hiato) this.eco.choques.hiato += m.hiato;
    if (m.inflacao) this.eco.choques.inflacao += m.inflacao;
    if (m.credibilidade) this.eco.credibilidade = clamp(this.eco.credibilidade + m.credibilidade, 0.1, 0.95);
    if (m.divida) this.eco.divida += m.divida;
    if (m.meta) for (const k of Object.keys(this.metaPorAno)) if (Number(k) >= this.ano) this.metaPorAno[Number(k)] += m.meta;
    if (m.meta) this.eco.meta = this.metaPorAno[this.ano];
    if (p.medida === 'revogar-autonomia') this.bc.mandatoAte = this.ano;
    this.recalcularDespesas();
  }

  private revogar(uid: number, motivo: string) {
    const v = this.vigentes.find((x) => x.uid === uid);
    if (!v) return;
    const m = MEDIDA[v.medida];
    this.vigentes = this.vigentes.filter((x) => x.uid !== uid);
    this.lado -= (m.lado ?? 0) * 0.5;
    if (m.meta) for (const k of Object.keys(this.metaPorAno)) if (Number(k) >= this.ano) this.metaPorAno[Number(k)] -= m.meta;
    this.recalcularDespesas();
    if (motivo === 'stf') this.choqueAprov -= 1;
  }

  private caducar(p: Proposta) {
    p.status = 'caducou';
    p.log.push(`${this.dataTexto()}: perdeu a validade sem votação`);
    this.revogar(p.uid, 'caducou');
    this.noticia(`A MP "${p.titulo}" caducou: o Congresso deixou passar os 120 dias sem votar. Os efeitos acabam hoje.`, 'ruim');
  }

  /** Envia uma medida ao Congresso. */
  enviar(medida: string, tipo: TipoProposta): { ok: boolean; msg: string } {
    const m = MEDIDA[medida];
    if (!m || !m.tipos.includes(tipo)) return { ok: false, msg: 'Forma inválida para esta medida.' };
    if (this.propostas.some((p) => p.medida === medida && p.status === 'tramitando')) return { ok: false, msg: 'Já está tramitando.' };
    if (m.unica && this.vigentes.some((v) => v.medida === medida)) return { ok: false, msg: 'Já está em vigor.' };
    if (tipo === 'MP' && this.mpsAno >= 6) return { ok: false, msg: 'O Congresso já reclama do excesso de MPs: no máximo 6 por ano.' };
    if (this.gatilhos && (m.despesa && Object.values(m.despesa).some((x) => (x as number) > 0))) return { ok: false, msg: 'Gatilhos do arcabouço acionados: nenhuma despesa nova até cumprir a meta.' };
    const custo = tipo === 'PEC' ? 10 : tipo === 'MP' ? 4 : 5;
    if (this.capital < custo) return { ok: false, msg: `Capital político insuficiente (${custo}).` };
    this.capital -= custo;
    const p: Proposta = {
      uid: this.nextUid++, medida, tipo, titulo: m.nome, casa: 'camara', turno: 1, desde: this.t,
      votaEm: this.t + Math.round(m.tramitacao * 30 * (tipo === 'MP' ? 0.8 : 1)), status: 'tramitando', bonus: 0, urgencia: false, log: [`${this.dataTexto()}: enviada como ${tipo}`],
    };
    if (tipo === 'MP') {
      p.caducaEm = this.t + 120;
      this.mpsAno++;
      this.entrarEmVigor(p, true);
      // presidente da Câmara hostil engaveta a MP
      const pres = this.camara.deputados.find((d) => d.id === this.camara.presidenteALE)!;
      if (pres.relacao < -0.15 && this.rng.chance(0.5)) p.votaEm = p.caducaEm + 10;
      for (const d of this.camara.deputados) d.relacao = clamp(d.relacao - 0.01, -1, 1);
    }
    this.propostas.unshift(p);
    this.enviadas.push(medida);
    this.noticia(`${this.titulo()} envia ao Congresso ${tipo === 'MP' ? 'medida provisória' : tipo === 'PEC' ? 'proposta de emenda constitucional' : tipo === 'PLP' ? 'projeto de lei complementar' : 'projeto de lei'}: "${m.nome}".${tipo === 'MP' ? ' Vale desde já.' : ''}`, 'info');
    return { ok: true, msg: tipo === 'MP' ? 'MP publicada no Diário Oficial — tem 120 dias para ser votada.' : 'Enviado à Câmara.' };
  }

  /** Articulação de uma proposta: emendas, cargos, conversa com líderes, urgência, retirada. */
  articular(uid: number, acao: 'emendas' | 'cargos' | 'lideres' | 'urgencia' | 'retirar'): { ok: boolean; msg: string } {
    const p = this.propostas.find((x) => x.uid === uid && x.status === 'tramitando');
    if (!p) return { ok: false, msg: 'Proposta não está tramitando.' };
    if (acao === 'retirar') { p.status = 'retirada'; this.revogar(p.uid, 'retirada'); this.noticia(`Governo retira "${p.titulo}" de pauta.`, 'info'); return { ok: true, msg: 'Retirada.' }; }
    if (acao === 'urgencia') {
      if (p.urgencia) return { ok: false, msg: 'Já tem urgência.' };
      if (this.capital < 6) return { ok: false, msg: 'Capital político insuficiente (6).' };
      this.capital -= 6; p.urgencia = true; p.votaEm = Math.min(p.votaEm, this.t + 15);
      return { ok: true, msg: 'Urgência constitucional: votação em até 15 dias.' };
    }
    if (p.bonus >= 0.8) return { ok: false, msg: 'Não há mais o que oferecer nesta votação.' };
    if (acao === 'emendas') {
      this.gastoExtra += 0.03;
      p.bonus += 0.22;
      this.noticia(`Planalto libera R$ ${(this.eco.pib * 0.0003 / 1e9).toFixed(1).replace('.', ',')} bilhões em emendas na véspera da votação de "${p.titulo}".`, 'alerta');
      return { ok: true, msg: 'Emendas liberadas (pesa no primário).' };
    }
    if (acao === 'cargos') {
      if (this.capital < 8) return { ok: false, msg: 'Capital político insuficiente (8).' };
      this.capital -= 8; p.bonus += 0.2;
      if (this.rng.chance(0.12)) { this.escandalos += 1; this.noticia('Indicado do centrão para uma estatal vira alvo de reportagem sobre loteamento de cargos.', 'ruim'); }
      return { ok: true, msg: 'Cargos de 2º escalão distribuídos.' };
    }
    if (this.capital < 5) return { ok: false, msg: 'Capital político insuficiente (5).' };
    this.capital -= 5; p.bonus += 0.12;
    return { ok: true, msg: 'Café com os líderes no Alvorada.' };
  }

  /** Troca o titular de um ministério: técnico (null) ou cota de partido (traz o partido para a base). */
  nomearMinistro(id: IdMinisterio, partido: IdPartido | null): { ok: boolean; msg: string } {
    if (this.capital < 3) return { ok: false, msg: 'Capital político insuficiente (3).' };
    const ant = this.ministros[id];
    if (ant.partido === partido) return { ok: false, msg: 'O ministério já está com essa cota.' };
    this.capital -= 3;
    const p = this.pessoa(this.cidades(), [40, 70]);
    this.ministros[id] = { nome: p.nome, genero: p.genero, partido, competencia: partido ? this.rng.range(0.3, 0.65) : this.rng.range(0.6, 0.92), retrato: p.retrato };
    if (partido && this.posturas[partido] !== 'base' && PARTIDOS[partido].ideologia * this.ideologia > -0.5) this.posturas[partido] = 'base';
    if (ant.partido && !Object.values(this.ministros).some((m) => m.partido === ant.partido) && ant.partido !== this.init.partido) {
      this.posturas[ant.partido] = 'independente';
      for (const c of [this.camara, this.senado]) for (const d of c.deputados) if (d.partido === ant.partido) d.relacao = clamp(d.relacao - 0.2, -1, 1);
    }
    if (partido) for (const c of [this.camara, this.senado]) for (const d of c.deputados) if (d.partido === partido) d.relacao = clamp(d.relacao + 0.15, -1, 1);
    if (id === 'fazenda') this.eco.credibilidade = clamp(this.eco.credibilidade + (partido ? -0.06 : 0.03), 0.1, 0.95);
    const nomeM = MINISTERIOS.find((m) => m.id === id)!.nome;
    this.noticia(`${p.nome} assume o Ministério ${nomeM === 'Casa Civil' ? 'da Casa Civil' : `de ${nomeM}`}${partido ? ` na cota do ${PARTIDOS[partido].sigla}` : ', em perfil técnico'}.`, 'info');
    return { ok: true, msg: 'Nomeação publicada.' };
  }

  private votarLOA() {
    if (this.dia !== 1) return;
    const casa = this.camara;
    const proj = { id: `LOA-${this.ano}`, tipo: 'loa', titulo: `LOA ${this.ano + 1}`, descricao: '', quorum: 'simples', eixos: { emendas: (this.ploa.emendas - 0.45) * 4, deficit: (this.ploaTotal() - this.limite) * 2 }, governoQuer: 'sim', gravidade: 0, votaEm: this.t, dataVotacao: '' } as Projeto;
    const r = votar(this.pol(casa), proj, { aprovacao: this.aprovacao, bonus: 0.3 }, this.rng);
    this.loaAprovada = r.aprovado && this.ploaCabe();
    this.votacoes.unshift({ data: this.dataTexto(), titulo: `Orçamento de ${this.ano + 1}`, casa: 'Congresso', sim: r.aFavor, nao: r.contra, necessarios: Math.floor(casa.cadeiras / 2) + 1, aprovado: this.loaAprovada });
    this.noticia(this.loaAprovada ? `Congresso aprova o Orçamento de ${this.ano + 1}.` : `Orçamento de ${this.ano + 1} não é votado a tempo: o governo começa o ano em duodécimos.`, this.loaAprovada ? 'bom' : 'ruim');
  }

  setPloa(prog: Programa, v: number): { ok: boolean; msg: string } {
    if (!DISCRICIONARIAS.includes(prog)) return { ok: false, msg: 'Despesa obrigatória: só muda por lei ou emenda constitucional.' };
    if (this.mes >= 9) return { ok: false, msg: 'O Orçamento do ano que vem já foi enviado.' };
    const piso = PISOS[prog] ?? 0;
    const pisoEf = this.vigentes.some((x) => x.medida === 'corte-gastos') ? piso * 0.9 : piso;
    if (v < pisoEf) return { ok: false, msg: `Abaixo do piso constitucional (${pisoEf.toFixed(2)}% do PIB).` };
    if (this.gatilhos && v > this.base[prog]) return { ok: false, msg: 'Gatilhos acionados: sem aumento de despesa.' };
    this.ploa[prog] = Math.round(v * 1000) / 1000;
    return { ok: true, msg: '' };
  }

  contingenciar(frac: number): { ok: boolean; msg: string } {
    this.contingenciamento = clamp(frac, 0, 0.35);
    this.recalcularDespesas();
    if (frac > 0.05) for (const d of this.camara.deputados) d.relacao = clamp(d.relacao - 0.02 * d.fisiologismo, -1, 1);
    this.noticia(frac > 0 ? `Governo contingencia ${Math.round(frac * 100)}% das despesas discricionárias para cumprir a meta. Congresso reclama das emendas travadas.` : 'Governo libera o orçamento contingenciado.', frac > 0 ? 'alerta' : 'info');
    return { ok: true, msg: '' };
  }

  // ── STF ─────────────────────────────────────────────────────────────────────

  private talvezADI(medida: string, uid: number) {
    const m = MEDIDA[medida];
    if (!m || m.riscoSTF <= 0 || !this.rng.chance(0.2 + 0.8 * m.riscoSTF)) return;
    const autores = (Object.keys(this.posturas) as IdPartido[]).filter((p) => this.posturas[p] === 'oposicao');
    const autor = autores[this.rng.int(0, Math.max(0, autores.length - 1))] ?? 'POP';
    const a: AcaoSTF = { uid, medida, autor, julgaEm: this.t + this.rng.int(90, 360), liminar: false, status: 'pendente' };
    if (m.riscoSTF > 0.35 && this.rng.chance(0.35)) {
      a.liminar = true;
      const v = this.vigentes.find((x) => x.uid === uid);
      if (v) { v.suspensa = true; this.recalcularDespesas(); }
    }
    this.acoes.unshift(a);
    this.noticia(`${PARTIDOS[autor].sigla} vai ao STF contra "${m.nome}".${a.liminar ? ' Um ministro concede liminar e suspende a lei até o julgamento.' : ''}`, a.liminar ? 'ruim' : 'alerta');
  }

  /** Probabilidade de cada ministro votar pela inconstitucionalidade. */
  pDerrubar(min: MinistroSTF, risco: number) {
    const afinidade = 1 - Math.abs(min.ideologia - this.ideologia);
    return sigm(5 * (risco - 0.4) - 1.4 * (afinidade - 0.5) - (min.indicadoPorVoce ? 0.7 : 0));
  }

  private julgar(a: AcaoSTF) {
    const m = MEDIDA[a.medida];
    let contra = 0;
    for (const min of this.stf) if (this.rng.chance(this.pDerrubar(min, m.riscoSTF))) contra++;
    a.votos = [contra, this.stf.length - contra];
    const v = this.vigentes.find((x) => x.uid === a.uid);
    if (contra >= 6) {
      a.status = 'derrubada';
      this.revogar(a.uid, 'stf');
      this.noticia(`STF declara inconstitucional "${m.nome}" por ${contra} a ${this.stf.length - contra}.`, 'ruim');
    } else {
      a.status = 'mantida';
      if (v) { v.suspensa = false; this.recalcularDespesas(); }
      this.noticia(`STF mantém "${m.nome}" por ${this.stf.length - contra} a ${contra}.`, 'bom');
    }
  }

  private abrirVagaSTF(m: MinistroSTF) {
    this.stf = this.stf.filter((x) => x.id !== m.id);
    const perfis: [string, number, string][] = [
      ['jurista técnico', 0, 'Professor(a) de Direito Constitucional, currículo impecável — aprovação fácil no Senado.'],
      ['aliado do governo', this.ideologia * 0.9, 'Advogado(a) do partido e amigo(a) de longa data. Fiel, mas a sabatina vai ser dura.'],
      ['magistrado de carreira', -this.ideologia * 0.3, 'Ministro(a) do STJ, discreto(a), sem alinhamento claro.'],
    ];
    this.vagaSTF = { aberta: this.t, candidatos: perfis.map(([perfil, ideologia, desc]) => { const p = this.pessoa(this.cidades(), [48, 62]); return { nome: p.nome, genero: p.genero, perfil, ideologia, desc, retrato: p.retrato }; }) };
    this.noticia(`${m.nome} se aposenta compulsoriamente aos 75 anos. Abre-se uma vaga no STF: a indicação é do Planalto e passa por sabatina no Senado.`, 'alerta');
  }

  /** Sabatina no Senado (maioria absoluta, 41 votos). */
  indicarSTF(i: number): { ok: boolean; msg: string } {
    if (!this.vagaSTF) return { ok: false, msg: 'Não há vaga.' };
    const c = this.vagaSTF.candidatos[i];
    const bonus = c.perfil === 'jurista técnico' ? 0.5 : c.perfil === 'aliado do governo' ? -0.15 : 0.35;
    const proj = { id: `STF-${this.t}-${i}`, tipo: 'credito', titulo: 'Sabatina', descricao: '', quorum: 'simples', eixos: {}, governoQuer: 'sim', gravidade: 0, votaEm: this.t, dataVotacao: '' } as Projeto;
    const r = votar(this.pol(this.senado), proj, { aprovacao: this.aprovacao, bonus }, this.rng);
    this.votacoes.unshift({ data: this.dataTexto(), titulo: `Sabatina de ${c.nome} (STF)`, casa: 'Senado', sim: r.aFavor, nao: r.contra, necessarios: 41, aprovado: r.aFavor >= 41 });
    if (r.aFavor >= 41) {
      this.stf.push({ id: 100 + this.t, nome: c.nome, genero: c.genero, idade: 55, ideologia: c.ideologia, indicadoPorVoce: true, retrato: c.retrato });
      this.vagaSTF = null;
      this.noticia(`Senado aprova ${c.nome} para o STF por ${r.aFavor} votos.`, 'bom');
      return { ok: true, msg: 'Aprovado(a) pelo Senado.' };
    }
    this.vagaSTF.candidatos.splice(i, 1, { ...c, nome: this.pessoa(this.cidades(), [48, 62]).nome });
    this.capital = clamp(this.capital - 8, 0, 100);
    this.noticia(`Senado rejeita ${c.nome} para o STF (${r.aFavor} votos, eram precisos 41). Derrota rara e humilhante para o Planalto.`, 'ruim');
    return { ok: false, msg: 'Rejeitado(a) pelo Senado.' };
  }

  // ── Banco Central ───────────────────────────────────────────────────────────

  indicarBC(i: number): { ok: boolean; msg: string } {
    if (!this.bc.indicacao) return { ok: false, msg: 'Não há indicação em aberto.' };
    const c = this.bc.indicacao[i];
    const bonus = c.perfil === 'moderado' ? 0.5 : c.perfil === 'ortodoxo' ? 0.35 : -0.1;
    const proj = { id: `BC-${this.t}-${i}`, tipo: 'credito', titulo: 'Sabatina BC', descricao: '', quorum: 'simples', eixos: {}, governoQuer: 'sim', gravidade: 0, votaEm: this.t, dataVotacao: '' } as Projeto;
    const r = votar(this.pol(this.senado), proj, { aprovacao: this.aprovacao, bonus }, this.rng);
    this.votacoes.unshift({ data: this.dataTexto(), titulo: `Sabatina de ${c.nome} (BC)`, casa: 'Senado', sim: r.aFavor, nao: r.contra, necessarios: 41, aprovado: r.aFavor >= 41 });
    if (r.aFavor < 41) { this.noticia(`Senado rejeita ${c.nome} para o Banco Central.`, 'ruim'); this.capital = clamp(this.capital - 6, 0, 100); return { ok: false, msg: 'Rejeitado(a).' }; }
    this.bc.presidente = { ...c, vies: c.ideologia, indicadoPorVoce: true };
    this.bc.mandatoAte = this.ano + 4;
    this.bc.indicacao = null;
    this.eco.credibilidade = clamp(this.eco.credibilidade + (c.perfil === 'desenvolvimentista' ? -0.12 : c.perfil === 'ortodoxo' ? 0.05 : 0.02), 0.1, 0.95);
    if (c.perfil === 'desenvolvimentista') { this.eco.choques.cambio += 0.04; this.eco.expectativa += 0.3; }
    this.noticia(`Senado aprova ${c.nome} (${c.perfil}) para a presidência do Banco Central. ${c.perfil === 'desenvolvimentista' ? 'Dólar sobe e juros futuros abrem.' : 'Mercado reage bem.'}`, c.perfil === 'desenvolvimentista' ? 'alerta' : 'bom');
    return { ok: true, msg: 'Aprovado(a).' };
  }

  criticarBC(): { ok: boolean; msg: string } {
    if (this.t - this.bc.ultimaCritica < 60) return { ok: false, msg: 'Você criticou o BC há pouco tempo.' };
    this.bc.ultimaCritica = this.t;
    this.eco.credibilidade = clamp(this.eco.credibilidade - 0.04, 0.1, 0.95);
    this.eco.expectativa += 0.12;
    this.eco.choques.cambio += 0.015;
    this.choqueAprov += 0.8;
    this.lado += 0.3;
    this.noticia(`${this.titulo()} critica a Selic: "Esse juro está matando o emprego". Dólar sobe e o mercado revisa a inflação para cima.`, 'alerta');
    return { ok: true, msg: 'Discurso feito.' };
  }

  swapCambial(): { ok: boolean; msg: string } {
    if (this.t - this.bc.ultimoSwap < 90) return { ok: false, msg: 'O BC já interveio recentemente.' };
    if (this.eco.cambio / this.eco.cambio0 < 1.08) return { ok: false, msg: 'O BC só intervém em disfuncionalidade do câmbio.' };
    this.bc.ultimoSwap = this.t;
    this.eco.choques.cambio -= 0.03;
    this.noticia('Banco Central anuncia leilões de swap cambial para conter a disparada do dólar.', 'info');
    return { ok: true, msg: 'Leilões de swap anunciados.' };
  }

  /** CMN (Fazenda, Planejamento e BC) muda a meta de inflação. */
  mudarMetaInflacao(meta: number): { ok: boolean; msg: string } {
    if (meta === this.eco.metaInflacao) return { ok: false, msg: 'Meta inalterada.' };
    const subiu = meta > this.eco.metaInflacao;
    this.eco.metaInflacao = meta;
    this.eco.credibilidade = clamp(this.eco.credibilidade + (subiu ? -0.1 : 0.03), 0.1, 0.95);
    if (subiu) this.eco.expectativa += 0.25;
    this.noticia(`Conselho Monetário Nacional muda a meta de inflação para ${this.fmtPct(meta)}. ${subiu ? 'Mercado vê afrouxamento e revisa expectativas para cima.' : 'Sinal de compromisso com a inflação baixa.'}`, subiu ? 'alerta' : 'bom');
    return { ok: true, msg: '' };
  }

  // ── Governadores ────────────────────────────────────────────────────────────

  visitar(uf: string): { ok: boolean; msg: string } {
    if (this.visitasMes >= 3) return { ok: false, msg: 'Agenda cheia: até 3 viagens por mês.' };
    if (this.t - (this.ultimaVisita[uf] ?? -999) < 45) return { ok: false, msg: 'Você esteve lá há pouco tempo.' };
    this.visitasMes++;
    this.ultimaVisita[uf] = this.t;
    this.bonusUF[uf] = (this.bonusUF[uf] ?? 0) + 4;
    const g = this.governadores.find((x) => x.uf === uf);
    if (g) g.relacao = clamp(g.relacao + 0.05, -1, 1);
    if (this.eleicao?.fase === 'campanha' || this.eleicao?.fase === 'segundo') this.eleicao.campanha[uf] = (this.eleicao.campanha[uf] ?? 0) + 1;
    const nome = this.init.ufs.find((u) => u.sigla === uf)?.nome ?? uf;
    this.noticia(`${this.titulo()} visita ${nome}${g ? ` ao lado ${g.genero === 'f' ? 'da governadora' : 'do governador'} ${g.nome}` : ''}.`, 'info');
    return { ok: true, msg: 'Visita feita.' };
  }

  obraFederal(uf: string): { ok: boolean; msg: string } {
    if (this.obrasAno.includes(uf)) return { ok: false, msg: 'Já há uma obra federal lançada neste estado este ano.' };
    if (this.gatilhos) return { ok: false, msg: 'Gatilhos do arcabouço: sem obras novas.' };
    this.obrasAno.push(uf);
    this.gastoExtra += 0.015;
    this.bonusUF[uf] = (this.bonusUF[uf] ?? 0) + 5;
    const g = this.governadores.find((x) => x.uf === uf);
    if (g) g.relacao = clamp(g.relacao + 0.2, -1, 1);
    for (const d of this.camara.deputados) if (d.cidade === uf) d.relacao = clamp(d.relacao + 0.05, -1, 1);
    this.noticia(`Governo federal anuncia obra de R$ ${(this.eco.pib * 0.00015 / 1e9).toFixed(1).replace('.', ',')} bilhão em ${this.init.ufs.find((u) => u.sigla === uf)?.nome ?? uf}.`, 'bom');
    return { ok: true, msg: 'Obra anunciada.' };
  }

  // ── Impeachment ─────────────────────────────────────────────────────────────

  private checarImpeachment() {
    if (this.impeachment || this.fim) return;
    const crime = this.descumprimentos >= 2 || this.escandalos >= 2;
    const pres = this.camara.deputados.find((d) => d.id === this.camara.presidenteALE)!;
    if (this.aprovacao < 22 && crime && pres.relacao < 0 && this.rng.chance(0.25)) {
      this.impeachment = { fase: 'camara', votaEm: this.t + 45 };
      this.noticia(`Presidente da Câmara aceita pedido de impeachment por crime de responsabilidade. Votação no plenário em 45 dias: são precisos 342 votos para autorizar.`, 'ruim');
    }
  }

  private votarImpeachment() {
    const imp = this.impeachment!;
    const casa = imp.fase === 'camara' ? this.camara : this.senado;
    const proj = { id: `IMP-${imp.fase}-${this.t}`, tipo: 'impeachment', titulo: 'Impeachment', descricao: '', quorum: '2/3', eixos: {}, governoQuer: 'nao', gravidade: Math.min(1, 0.3 + 0.2 * this.escandalos + 0.15 * this.descumprimentos), votaEm: this.t, dataVotacao: '' } as Projeto;
    const r = votar(this.pol(casa), proj, { aprovacao: this.aprovacao }, this.rng);
    const need = Math.ceil((2 * casa.cadeiras) / 3);
    this.votacoes.unshift({ data: this.dataTexto(), titulo: 'Impeachment', casa: imp.fase === 'camara' ? 'Câmara' : 'Senado', sim: r.aFavor, nao: r.contra, necessarios: need, aprovado: r.aFavor >= need });
    if (r.aFavor < need) { this.impeachment = null; this.noticia(`Impeachment barrado: ${r.aFavor} votos, eram precisos ${need}.`, 'bom'); this.capital = clamp(this.capital + 10, 0, 100); return; }
    if (imp.fase === 'camara') { this.impeachment = { fase: 'senado', votaEm: this.t + 120 }; this.noticia(`Câmara autoriza o processo de impeachment por ${r.aFavor} votos. O Senado julga; ${this.titulo().toLowerCase()} é afastado(a) se o processo for instaurado.`, 'ruim'); return; }
    this.fim = { motivo: 'impeachment', data: this.dataTexto(), texto: `O Senado condena ${this.init.nome} por crime de responsabilidade por ${r.aFavor} votos. Fim do mandato.` };
    this.noticia(this.fim.texto, 'ruim');
  }

  // ── Eleição ─────────────────────────────────────────────────────────────────

  anoEleitoral() { return (this.ano - this.init.anoInicio) % 4 === 3; }

  private eleicaoMensal() {
    if (!this.anoEleitoral()) return;
    if (!this.eleicao && this.mes >= 3) this.montarEleicao();
    const el = this.eleicao;
    if (!el || el.fase === 'encerrada') return;
    if (this.mes === 8 && el.fase === 'pre') { el.fase = 'campanha'; this.noticia('Começa a campanha presidencial. Viagens aos estados valem votos.', 'info'); }
    if (this.mes >= 4 && this.mes <= 10) {
      const v = this.intencao(el.candidatos.filter((c) => c.ativo).map((c) => c.id), true);
      el.pesquisas.unshift({ data: this.dataTexto(), v: el.candidatos.map((c) => v.total[c.id] ?? 0) });
    }
  }

  private montarEleicao() {
    const ideo = this.ideologia;
    const pick = (f: (p: IdPartido) => number) => (Object.keys(PARTIDOS) as IdPartido[]).sort((a, b) => f(b) - f(a))[0];
    const op = pick((p) => Math.abs(PARTIDOS[p].ideologia - ideo) - PARTIDOS[p].fisiologismo * 0.3);
    const centro = pick((p) => -Math.abs(PARTIDOS[p].ideologia) + (p === this.init.partido || p === op ? -9 : 0));
    const outsider = pick((p) => (p === this.init.partido || p === op || p === centro ? -9 : this.rng.next()));
    const cand = (partido: IdPartido, doJogador: boolean, carisma: number, id: number): CandPres => {
      const p = this.pessoa(this.cidades(), [45, 70]);
      return { id, nome: doJogador && this.mandato === 1 ? this.init.nome : p.nome, genero: doJogador && this.mandato === 1 ? this.init.genero : p.genero, partido, ideologia: PARTIDOS[partido].ideologia, carisma, doJogador, retrato: p.retrato, ativo: true };
    };
    this.eleicao = {
      ano: this.ano, fase: 'pre', pesquisas: [], campanha: {},
      candidatos: [cand(this.init.partido, true, this.mandato === 1 ? 0.3 : 0.08, 0), cand(op, false, 0.25, 1), cand(centro, false, 0.1, 2), cand(outsider, false, 0, 3)],
      dia1: 0, dia2: 0,
    };
    this.noticia(this.mandato === 1 ? `Ano eleitoral: ${this.init.nome} confirma que disputa a reeleição.` : `Ano eleitoral: sem direito a um terceiro mandato, ${this.init.nome} lança ${this.eleicao.candidatos[0].nome} como ${this.eleicao.candidatos[0].genero === 'f' ? 'sucessora' : 'sucessor'}.`, 'info');
  }

  /** Intenção de voto por UF (logit multinomial) e total ponderado pelo eleitorado. */
  intencao(ids: number[], comRuido = false): { total: Record<number, number>; porUF: Record<string, Record<number, number>> } {
    const el = this.eleicao!;
    const porUF: Record<string, Record<number, number>> = {};
    const total: Record<number, number> = {};
    let peso = 0;
    for (const u of this.init.ufs) {
      const inc = INCLINACAO[u.sigla] ?? 0;
      const us = ids.map((id) => {
        const c = el.candidatos[id];
        let x = c.carisma - 1.3 * Math.abs(c.ideologia - inc * 0.8);
        if (c.doJogador) x += 0.05 * (this.aprovUF[u.sigla] - 45) + 0.18 * (el.campanha[u.sigla] ?? 0) + (u.sigla === this.init.origem ? 0.3 : 0);
        else x -= 0.02 * (this.aprovUF[u.sigla] - 45);
        if (comRuido) x += this.rng.range(-0.08, 0.08);
        return x / 0.5;
      });
      const mx = Math.max(...us);
      const ex = us.map((v) => Math.exp(v - mx));
      const s = ex.reduce((a, b) => a + b, 0);
      porUF[u.sigla] = {};
      const w = this.eleitores(u.sigla);
      ids.forEach((id, i) => { porUF[u.sigla][id] = ex[i] / s; total[id] = (total[id] ?? 0) + (ex[i] / s) * w; });
      peso += w;
    }
    for (const id of ids) total[id] /= peso;
    return { total, porUF };
  }

  private diaEleitoral() {
    const el = this.eleicao;
    if (!el || el.fase === 'encerrada' || this.mes !== 10) return;
    const d1 = domingo(this.ano, 10, 1), d2 = domingo(this.ano, 10, -1);
    el.dia1 = d1; el.dia2 = d2;
    if (this.dia === d1 && !el.primeiro) {
      const ids = el.candidatos.map((c) => c.id);
      const r = this.intencao(ids, true);
      el.primeiro = { total: ids.map((i) => r.total[i]), porUF: Object.fromEntries(Object.entries(r.porUF).map(([k, v]) => [k, ids.map((i) => v[i])])) };
      const ord = [...ids].sort((a, b) => r.total[b] - r.total[a]);
      if (r.total[ord[0]] > 0.5) { this.concluirEleicao(ord[0], r.total[ord[0]]); return; }
      for (const c of el.candidatos) c.ativo = ord.slice(0, 2).includes(c.id);
      el.fase = 'segundo';
      this.noticia(`1º turno: ${el.candidatos[ord[0]].nome} (${(r.total[ord[0]] * 100).toFixed(1)}%) e ${el.candidatos[ord[1]].nome} (${(r.total[ord[1]] * 100).toFixed(1)}%) vão ao 2º turno.`, 'alerta');
    }
    if (this.dia === d2 && el.fase === 'segundo' && !el.segundo) {
      const ids = el.candidatos.filter((c) => c.ativo).map((c) => c.id) as [number, number];
      const r = this.intencao(ids, true);
      el.segundo = { ids, total: ids.map((i) => r.total[i]), porUF: Object.fromEntries(Object.entries(r.porUF).map(([k, v]) => [k, ids.map((i) => v[i])])) };
      const v = r.total[ids[0]] >= r.total[ids[1]] ? ids[0] : ids[1];
      this.concluirEleicao(v, r.total[v]);
    }
  }

  private concluirEleicao(id: number, pct: number) {
    const el = this.eleicao!;
    el.vencedor = id; el.fase = 'encerrada';
    const c = el.candidatos[id];
    this.noticia(`${c.nome} (${PARTIDOS[c.partido].sigla}) é eleito(a) Presidente da República com ${(pct * 100).toFixed(1).replace('.', ',')}% dos votos válidos.`, c.doJogador ? 'bom' : 'ruim');
  }

  /** Posse de 5 de janeiro (EC 111/2021): segundo mandato, sucessor ou fim. */
  posse(): void {
    const el = this.eleicao;
    if (!el || el.vencedor === undefined) return;
    const venceu = el.candidatos[el.vencedor].doJogador;
    if (venceu && this.mandato === 1) {
      this.mandato = 2;
      this.eleicao = null;
      this.camara = this.montarCasa('camara', `CAM:${this.init.semente}:${this.ano}`);
      this.senado = this.montarCasa('senado', `SEN:${this.init.semente}:${this.ano}`);
      this.capital = 60;
      this.noticia(`${this.init.nome} toma posse para o segundo mandato. Novo Congresso, mesmos problemas.`, 'bom');
      return;
    }
    this.fim = {
      motivo: this.mandato === 2 ? (venceu ? 'sucessor-eleito' : 'sucessor-derrotado') : 'derrota',
      data: this.dataTexto(),
      texto: this.mandato === 2 ? (venceu ? `${el.candidatos[el.vencedor].nome}, ${el.candidatos[el.vencedor].genero === 'f' ? 'sua sucessora' : 'seu sucessor'}, assume a Presidência.` : `A oposição vence: ${el.candidatos[el.vencedor].nome} assume a Presidência.`) : `${el.candidatos[el.vencedor].nome} toma posse. Fim do seu governo.`,
    };
  }

  // ── eventos ─────────────────────────────────────────────────────────────────

  contexto(): Contexto {
    const e = this.eco;
    return {
      ano: this.ano, mes: this.mes, aprovacao: Math.round(this.aprovacao), inflacao: e.inflacao, selic: e.selic, cambio: e.cambio, desemprego: e.desemprego,
      crescimento: e.crescimento, divida: e.divida, primario: e.primario, risco: e.risco, credibilidade: e.credibilidade, base: this.base_(), capital: this.capital,
      ideologia: this.ideologia < -0.2 ? 'esquerda' : this.ideologia > 0.2 ? 'direita' : 'centro', anoEleitoral: this.anoEleitoral(), mandato: this.mandato,
      gatilhos: this.gatilhos, escandalos: this.escandalos, vagaSTF: !!this.vagaSTF, flags: this.eventos.flags,
    };
  }

  private textos(): Record<string, string> {
    const uf = this.init.ufs[this.rng.int(0, this.init.ufs.length - 1)];
    const g = this.governadores.find((x) => x.uf === uf.sigla)!;
    const pc = this.camara.deputados.find((d) => d.id === this.camara.presidenteALE)!;
    const ps = this.senado.deputados.find((d) => d.id === this.senado.presidenteALE)!;
    const op = (Object.keys(this.posturas) as IdPartido[]).find((p) => this.posturas[p] === 'oposicao') ?? 'POP';
    return {
      presidente: this.init.nome, titulo: this.titulo(), ministroFazenda: this.ministros.fazenda.nome, presidenteCamara: pc.urna, presidenteSenado: ps.urna,
      presidenteBC: this.bc.presidente.nome, uf: uf.nome, sigla: uf.sigla, governador: g.nome, oposicao: PARTIDOS[op].sigla, partido: PARTIDOS[this.init.partido].sigla,
      tv: 'TV Guará', jornal: 'O Pregoeiro', instituto: 'Instituto Pulso',
    };
  }

  private eventoMensal() {
    if (!this.rng.chance(0.85)) return;
    const c = this.contexto();
    const st = sortearStorylet(this.motor.elegiveis(this.eventos, c, 'mensal', this.t), this.rng);
    if (!st) return;
    const r = this.motor.disparar(this.eventos, st, c, this.textos(), this.t, this.dataTexto());
    if (r.imediato) { this.aplicarEfeitos(r.imediato.efeitos as EfeitosPres); if (r.imediato.texto) this.noticia(r.imediato.texto, r.imediato.tom); }
  }

  decidir(uid: number, escolha: number) {
    const r = this.motor.resolver(this.eventos, uid, escolha, this.t, this.dataTexto());
    if (r) { this.aplicarEfeitos(r.efeitos as EfeitosPres); if (r.texto) this.noticia(r.texto, r.tom); }
  }

  aplicarEfeitos(ef: EfeitosPres) {
    const e = this.eco;
    if (ef.aprovacao) this.choqueAprov += ef.aprovacao;
    if (ef.capital) this.capital = clamp(this.capital + ef.capital, 0, 100);
    if (ef.base) for (const c of [this.camara, this.senado]) for (const d of c.deputados) d.relacao = clamp(d.relacao + ef.base, -1, 1);
    if (ef.camara) for (const d of this.camara.deputados) d.relacao = clamp(d.relacao + ef.camara, -1, 1);
    if (ef.senado) for (const d of this.senado.deputados) d.relacao = clamp(d.relacao + ef.senado, -1, 1);
    if (ef.bancadas) for (const [b, v] of Object.entries(ef.bancadas)) for (const c of [this.camara, this.senado]) for (const d of c.deputados) if (d.bancada === b) d.relacao = clamp(d.relacao + v, -1, 1);
    if (ef.governadores) for (const g of this.governadores) g.relacao = clamp(g.relacao + ef.governadores, -1, 1);
    if (ef.ufs) for (const [uf, v] of Object.entries(ef.ufs)) this.bonusUF[uf] = (this.bonusUF[uf] ?? 0) + v;
    if (ef.inflacao) e.choques.inflacao += ef.inflacao;
    if (ef.hiato) e.choques.hiato += ef.hiato;
    if (ef.cambio) e.choques.cambio += ef.cambio;
    if (ef.receita) e.choques.receita += ef.receita;
    if (ef.credibilidade) e.credibilidade = clamp(e.credibilidade + ef.credibilidade, 0.1, 0.95);
    if (ef.divida) e.divida += ef.divida;
    if (ef.despesaExtra) this.gastoExtra += ef.despesaExtra;
    if (ef.escandalo) this.escandalos += ef.escandalo;
    if (ef.flag && !this.eventos.flags.includes(ef.flag)) this.eventos.flags.push(ef.flag);
    if (ef.limparFlag) this.eventos.flags = this.eventos.flags.filter((f) => f !== ef.limparFlag);
  }

  // ── série, legado, save ─────────────────────────────────────────────────────

  private registrarSerie() {
    const e = this.eco;
    this.serie.push({ data: `${String(this.mes).padStart(2, '0')}/${this.ano}`, aprovacao: this.aprovacao, inflacao: e.inflacao, selic: e.selic, cambio: e.cambio, desemprego: e.desemprego, crescimento: e.crescimento, divida: e.divida, primario: e.primario });
  }

  /** Nota de 0 a 100 para o ranking: aprovação, economia, contas e resultado eleitoral. */
  nota(): number {
    const e = this.eco, s0 = this.serie[0];
    let n = 0.45 * this.aprovacao + 6 * (2 - Math.abs(e.inflacao - e.metaInflacao)) + 2.5 * (e.crescimento) - 1.2 * (e.desemprego - 6) - 0.8 * (e.divida - (s0?.divida ?? e.divida)) + 4 * (e.primario - (s0?.primario ?? 0)) - 3 * this.descumprimentos;
    if (this.fim?.motivo === 'impeachment') n -= 25;
    if (this.mandato === 2) n += 10;
    if (this.fim?.motivo === 'sucessor-eleito') n += 8;
    return Math.round(clamp(n + 20, 0, 100));
  }

  serializar(): string {
    this.rngState = this.rng.state();
    const { motor: _m, rng: _r, ...resto } = this as unknown as Record<string, unknown>;
    void _m; void _r;
    return JSON.stringify({ ...resto, init: { ...this.init, macro: undefined } });
  }

  static restaurar(json: string, macro: DadosMacro, storylets: Storylet[]): Presidencia {
    const d = JSON.parse(json) as Presidencia;
    const p = Object.create(Presidencia.prototype) as Presidencia;
    Object.assign(p, d);
    p.init = { ...d.init, macro };
    (p as unknown as { motor: Motor }).motor = new Motor(storylets);
    (p as unknown as { rng: Rng }).rng = new Rng(d.rngState);
    return p;
  }

  /** Programas para a UI (nome, valor executado, PLOA). */
  programas() { return PROGRAMAS.map((p) => ({ ...p, executado: this.eco.despesas[p.id], base: this.base[p.id], ploa: this.ploa[p.id], piso: PISOS[p.id] ?? 0 })); }
}
