/**
 * Governo estadual (Fase 3): Tesouro, folha, previdência (RPPS), dívida, LRF, mínimos
 * constitucionais, ciclo PPA/LDO/LOA com votação na ALE, secretarias com indicadores que
 * respondem ao gasto com atraso, obras e aprovação por grupo social.
 *
 * Passo mensal (chamado pela Simulation no dia 1º). Fórmulas: SIMULATION.md, seção Estado.
 */
import type { Rng } from '../core/rng';
import { calibrar, JUROS_REAL_OUTROS, JUROS_REAL_UNIAO, loaInicial, PRAZO_OUTROS_ANOS, PRAZO_UNIAO_ANOS, type Calibracao, type EstadoInit } from './calibracao';
import { defObra, obraDef, OBRAS } from './obras';
import { CARGOS, type Cargo } from '../politica/dados';
import { amplificador, atoresMensal, criarAtores, fatorFederal, type EstadoAtores } from '../atores/atores';
import type { Efeitos } from '../eventos/motor';
import {
  apoiosAutomaticos, criarDebate, criarEleicao, diaDoAno, ehAnoEleitoral, fecharDebate, formarColigacoes, intencaoEstadual, ordem, pedirApoio,
  pesquisa, primeiroTurno, responderDebate, segundoTurno, semanaDeCampanha, TEMAS, votar as votarEleicao, type ContextoEleitoral, type EstadoEleicao,
} from '../eleicao/eleicao';
import { calcularLegado, type Legado } from '../eleicao/legado';
import { novoPresidente } from '../atores/atores';
import { PARTIDOS, type IdPartido } from '../politica/dados';
import {
  baseAliada, candidatosPara, cederSecretaria, criarPolitica, negociar, nomear, placar, politicaMensal, votar,
  type EstadoPolitico, type Projeto,
} from '../politica/politica';
import {
  AREAS, CARREIRAS, type AcaoEstado, type Area, type Capag, type Carreira, type EstadoSnapshot, type EventoCalendario,
  type GruposAprovacao, type Indicadores, type MesFiscal, type MetaLDO, type ObraAtiva, type ObraCustom, type Politicas, type PropostaLOA, type RegimeDivida,
} from './tipos';

export type Noticiador = (texto: string, tom: 'bom' | 'ruim' | 'alerta' | 'info', chave: string, cooldownDias: number) => void;

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
/** Percentual com vírgula (texto de notícia). */
const p1 = (x: number) => (x * 100).toFixed(1).replace('.', ',');
const somaV = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);
const LIMITE_MAX_PESSOAL = 0.49;
const LIMITE_PRUDENCIAL = 0.4655;
const LIMITE_ALERTA = 0.441;
/** Sazonalidade do IPVA (concentrado no 1º trimestre). */
const SAZ_IPVA = [0.26, 0.2, 0.16, 0.05, 0.04, 0.04, 0.04, 0.04, 0.04, 0.04, 0.04, 0.05];
const PESOS_GRUPOS = { servidores: 0.06, empresariado: 0.04, classeMedia: 0.35, baixaRenda: 0.55 };

export interface ContextoMes {
  ano: number;
  mes: number; // 1–12 (mês que COMEÇA agora; o fechamento é do mês anterior)
  aprovacaoCidade: number | null;
  rng: Rng;
  noticia: Noticiador;
  /** situação da capital (Visão Cidade), quando houver */
  cidade?: { populacao: number; territorioCriminoso: number; tempoDeslocamento: number };
}

interface Choque { valor: number; meia: number; grupo?: keyof GruposAprovacao }

export class Estado {
  readonly ini: EstadoInit;
  readonly cal: Calibracao;

  // macro
  ipca = 0.042;
  gNacional = 0.02;
  precos = 1;
  idxNacional = 1;
  petroleo = 1;
  pibReal = 1;
  pibNominal: number;
  gEstado = 0.02;

  // tesouro
  caixa: number;
  dividaUniao: number;
  dividaOutros: number;
  outrasDividas: number;
  regime: RegimeDivida;
  fracPagamento: number;
  anosRegime = 0;
  jurosReaisUniao = JUROS_REAL_UNIAO;
  emprestimosPendentes: { valor: number; credor: string; liberaEm: number }[] = [];
  mesIndex = 0; // meses decorridos desde jan/2027

  // folha e previdência
  servidores: Record<Carreira, number>;
  salario: Record<Carreira, number>;
  salarioInicial: Record<Carreira, number>;
  beneficios: number;
  aliquotaPrev: number;
  reformaPrevidencia = false;
  mesReforma = -99;
  quadroInicioAno: Record<Carreira, number>;
  greves: Partial<Record<Carreira, number>> = {};
  atrasoSalarial = false;

  // orçamento
  loa: PropostaLOA;
  loaAnterior: PropostaLOA;
  proposta: PropostaLOA | null = null;
  loaStatus: EstadoSnapshot['loaStatus'] = 'vigente';
  duodecimos = false;
  contingenciamento = 0;
  metaLDO: MetaLDO = 'equilibrada';
  ldoDefinida = false;
  ppaEixos: Area[] = [];
  ppaDefinido = false;
  baseAliada: number;
  revotacao = false;

  // execução
  historico: MesFiscal[] = [];
  janela: { rcl: number; dtp: number; receitas: Record<string, number>; despesas: Record<string, number>; gastoArea: Record<Area, number>; primario: number; nominal: number }[] = [];
  anoCorrente = { ril: 0, saude: 0, educacao: 0 };
  ultimoAno = { saudePct: 0, educacaoPct: 0 };
  execucao: Record<Area, { custeio: number; investimento: number; pessoal: number }>;
  gastoBaseArea: Record<Area, number>;

  // obras e indicadores
  obras: ObraAtiva[] = [];
  nextObra = 1;
  efeitosObras: Partial<Record<keyof Indicadores, number>> = {};
  custeioObras: Record<Area, number>;
  ind: Indicadores;
  ind0: Indicadores;
  idebDivulgado: { ano: number; valor: number } | null = null;

  // políticas das secretarias (Fase 4)
  politicas: Politicas;
  private politicas0: Politicas;
  private mutiraoMeses = 0;
  private operacoesRecentes = 0;
  custoPoliticasMes = 0;
  concluidasNoMes: ObraAtiva[] = [];

  // política
  grupos: GruposAprovacao = { servidores: 50, empresariado: 50, classeMedia: 50, baixaRenda: 50 };
  aprovacao = 55;
  choques: Choque[] = [];
  alertas: string[] = [];
  descumprimentos = 0;
  // Fase 5: gabinete e Assembleia
  pol: EstadoPolitico;
  /** competência do gabinete na posse (o efeito é relativo a ela, para não deslocar a calibração) */
  comp0: Record<Cargo, number>;
  // Fase 6: prefeitos, União, imprensa; choques de eventos
  atores: EstadoAtores;
  /** choques relativos em indicadores (decaem 20%/mês) */
  choqueInd: Partial<Record<keyof Indicadores, number>> = {};
  /** choque no crescimento anual do PIB (decai 15%/mês) */
  choquePib = 0;
  /** estiagem/enchente do mês (vinda do clima da capital) */
  climaMes = { estiagem: 0, enchente: 0 };
  // Fase 7: eleição, mandatos e legado
  eleicao: EstadoEleicao | null = null;
  historicoEleicoes: EstadoSnapshot['historicoEleicoes'] = [];
  mandato = 1;
  mesPosse = 0;
  partidoGov: IdPartido;
  /** aprovação mês a mês (gráfico do legado) */
  serie: number[] = [];
  posseInfo: { caixa: number; dcl: number; pessoal: number } | null = null;
  fim: EstadoSnapshot['fim'] = null;
  emendasTotal = 0;

  constructor(ini: EstadoInit) {
    this.ini = ini;
    this.cal = calibrar(ini);
    const c = this.cal;
    this.pibNominal = ini.pibNominal * 1.2;
    this.caixa = c.caixa;
    this.dividaUniao = c.dividaUniao;
    this.dividaOutros = c.dividaOutros;
    this.outrasDividas = c.outrasDividas;
    this.regime = c.regime;
    this.fracPagamento = c.fracPagamento;
    this.servidores = { ...c.servidores };
    this.salario = { ...c.salario };
    this.salarioInicial = { ...c.salario };
    this.quadroInicioAno = { ...c.servidores };
    this.beneficios = c.beneficios;
    this.aliquotaPrev = c.aliquotaPrev0;
    this.loa = loaInicial(c);
    this.loaAnterior = this.loa;
    this.pol = criarPolitica({ sigla: ini.sigla, regiao: ini.regiao ?? 'Sudeste', complexidade: ini.efeitos.complexidadePolitica ?? 0, cidades: this.cidades });
    this.comp0 = Object.fromEntries(CARGOS.map((c) => [c.id, this.pol.secretarios[c.id].competencia])) as Record<Cargo, number>;
    this.baseAliada = baseAliada(this.pol);
    {
      // partido do governador: o maior partido da base que não é do Centrão
      const base = (Object.keys(this.pol.posturas) as IdPartido[]).filter((p) => this.pol.posturas[p] === 'base' && PARTIDOS[p].fisiologismo < 0.75);
      const cad = (p: IdPartido) => this.pol.deputados.filter((d) => d.partido === p).length;
      this.partidoGov = base.sort((a, b) => cad(b) - cad(a))[0] ?? 'UPB';
    }
    this.atores = criarAtores({ sigla: ini.sigla, cidades: this.cidades, populacoes: ini.populacoes ?? [], posturas: this.pol.posturas });
    this.execucao = Object.fromEntries(AREAS.map((a) => [a.id, { custeio: 0, investimento: 0, pessoal: 0 }])) as Estado['execucao'];
    this.custeioObras = Object.fromEntries(AREAS.map((a) => [a.id, 0])) as Record<Area, number>;
    this.gastoBaseArea = Object.fromEntries(AREAS.map((a) => [a.id, c.pessoalPorArea[a.id] * (1 + 2 * c.aliquotaPrev0) + c.custeio[a.id] + c.investimento[a.id]])) as Record<Area, number>;

    const idh = ini.idh;
    // DATASUS/PNAD reais quando o arquivo existe; senão, estimativa pelo IDH (D-020)
    const soc = ini.social;
    this.ind0 = {
      esperaEmergencia: clamp(3 + (0.82 - idh) * 40 + (soc ? (1.6 - soc.leitosPorMil) * 1.5 : 0), 2, 10),
      mortalidadeInfantil: soc?.mortalidadeInfantil ?? clamp(8 + (0.82 - idh) * 70, 8, 20),
      ideb: ini.idebEM,
      homicidios: ini.homicidios,
      esgoto: ini.esgoto,
      deslocamento: clamp(25 + 6 * Math.log10(Math.max(0.3, ini.populacao / 1e6)), 20, 45),
      pobreza: soc?.extremaPobreza ?? clamp((0.82 - idh) * 80, 1.5, 15),
      desemprego: soc?.desemprego ?? clamp(0.05 + (0.82 - idh) * 0.6, 0.04, 0.14),
      crescimentoPIB: 0.02,
      leitos: 0, filaCirurgias: 0, evasao: 0, letalidade: 0, lotacaoPrisional: 0, roubos: 0,
    };
    // políticas iniciais: herança do governo anterior (perfil da UF)
    const sig = ini.sigla;
    this.politicas = {
      gestaoSaude: ['SP', 'GO', 'PE', 'ES'].includes(sig) ? 'os' : 'direta',
      tempoIntegral: sig === 'PE' ? 0.55 : ['CE', 'PB', 'PI', 'ES'].includes(sig) ? 0.35 : 0.2,
      bonusProfessor: ['CE', 'PE'].includes(sig),
      doutrina: (ini.efeitos.criminalidade ?? 0) >= 0.3 ? 'confronto' : 'inteligencia',
      cameras: ['SP', 'SC'].includes(sig),
      integracaoDados: ['SP', 'MG', 'PR'].includes(sig),
      rendaEstadual: false,
    };
    this.politicas0 = { ...this.politicas };
    const letal0 = ini.homicidios * (this.politicas.doutrina === 'confronto' ? 0.17 : 0.09) * (this.politicas.cameras ? 0.6 : 1);
    Object.assign(this.ind0, {
      leitos: soc?.leitosPorMil ?? clamp(1.4 + (idh - 0.68) * 7, 1.2, 2.8),
      filaCirurgias: (ini.populacao / 1000) * 1.6 / 1000,
      evasao: clamp(4 + (0.8 - idh) * 55, 3, 12),
      letalidade: letal0,
      lotacaoPrisional: 165,
      roubos: ini.homicidios * 17,
    });
    this.ind = { ...this.ind0 };
    this.ultimoAno = { saudePct: ini.fiscal.minimos.saudePct / 100, educacaoPct: ini.fiscal.minimos.educacaoPct / 100 };

    // Fecha o orçamento contra os PRÓPRIOS fluxos do modelo (receitas modeladas ≠ RCL oficial
    // por classificação contábil): o custeio absorve a diferença até o resultado-alvo.
    {
      const b0 = this.fluxosBase();
      // receita média do 1º ano ≈ 3% acima do mês-base (inflação + crescimento ao longo do ano)
      const rec = somaV(b0.receitas) * 12 * 1.03, desp = somaV(b0.despesas) * 12;
      const alvo = clamp(0.01 - 0.03 * Math.max(0, ini.efeitos.dividaInicial ?? 0), -0.025, 0.012) * this.cal.rclAnual;
      const custeioTot = somaV(this.cal.custeio);
      const novo = Math.max(this.cal.rclAnual * 0.05, custeioTot + (rec - desp - alvo));
      const k = custeioTot > 0 ? novo / custeioTot : 1;
      for (const a of AREAS) this.cal.custeio[a.id] *= k;
      this.loa = loaInicial(this.cal);
      this.loaAnterior = this.loa;
      this.gastoBaseArea = Object.fromEntries(AREAS.map((a) => [a.id, this.cal.pessoalPorArea[a.id] * (1 + 2 * this.cal.aliquotaPrev0) + this.cal.custeio[a.id] + this.cal.investimento[a.id]])) as Record<Area, number>;
    }

    // janela LRF inicial: 12 meses sintéticos na linha de base (o RGF não começa do zero)
    const base = this.fluxosBase();
    for (let i = 0; i < 12; i++) this.janela.push(base);
  }

  // ── Fluxos de referência (para preencher a janela inicial) ─────────────────────────

  private fluxosBase() {
    const c = this.cal;
    const receitas = {
      icms: c.icms / 12, ipva: c.ipva / 12, itcd: c.itcd / 12, irrf: c.irrfTaxa * (this.folhaAnual() + c.beneficios) / 12,
      outras: (c.outrasTrib + c.contribOutras + c.servicos + c.outrasCorrentes + c.patrimonial) / 12,
      fpe: (c.fpe + c.lc61) / 12, transferencias: c.outrasTransf / 12,
    };
    const transfMun = c.kMunicipios * (0.25 * c.icms + 0.5 * c.ipva + 0.25 * c.lc61) / 12;
    const formFundeb = c.kFundeb * 0.2 * (c.icms + c.ipva + c.itcd + c.fpe + c.lc61 - transfMun * 12) / 12;
    const fundeb = c.fundebRetorno * formFundeb;
    const rcl = somaV(receitas) + fundeb - transfMun - formFundeb;
    const S = this.folhaAnual() / 12;
    const dtp = S * (1 + 2 * c.aliquotaPrev0) + c.fracInativosDTP * c.beneficios / 12;
    const gastoArea = Object.fromEntries(AREAS.map((a) => [a.id, this.gastoBaseArea[a.id] / 12])) as Record<Area, number>;
    const contrib = c.kContrib * (3 * c.aliquotaPrev0 * S + 0.15 * c.aliquotaPrev0 * c.beneficios / 12) + c.compensacao / 12;
    const juros = (this.dividaUniao * (JUROS_REAL_UNIAO + 0.04) + this.dividaOutros * (JUROS_REAL_OUTROS + 0.04)) / 12 * c.fracPagamento;
    const amortizacao = (this.dividaUniao / PRAZO_UNIAO_ANOS + this.dividaOutros / PRAZO_OUTROS_ANOS) / 12 * c.fracPagamento;
    const despesas = {
      pessoal: S * (1 + 2 * c.aliquotaPrev0), previdencia: Math.max(0, c.beneficios / 12 - contrib),
      custeio: somaV(c.custeio) / 12, investimento: somaV(c.investimento) / 12, poderes: c.shareDuodecimos * rcl,
      programaCapital: c.programaCapital / 12, emendas: (c.rclAnual * 0.004) / 12, juros, amortizacao,
    };
    const primario = rcl - (somaV(despesas) - juros - amortizacao);
    return { rcl, dtp, receitas: { ...receitas, fundeb, municipios: -transfMun, formacaoFundeb: -formFundeb }, despesas, gastoArea, primario, nominal: primario - juros };
  }

  folhaAnual(): number {
    return CARREIRAS.reduce((s, c) => s + this.servidores[c.id] * this.salario[c.id] * 13.33, 0);
  }

  get rcl12() { return this.janela.reduce((s, m) => s + m.rcl, 0); }
  get dtp12() { return this.janela.reduce((s, m) => s + m.dtp, 0); }
  get pessoalPct() { return this.dtp12 / Math.max(1, this.rcl12); }
  get dividaConsolidada() { return this.dividaUniao + this.dividaOutros + this.outrasDividas; }
  get dcl() { return this.dividaConsolidada - Math.max(0, this.caixa); }
  get dclPct() { return this.dcl / Math.max(1, this.rcl12); }

  capag(): Capag {
    // Metodologia STN (Portaria 501/2017), simplificada: endividamento, poupança corrente e liquidez
    const end = this.dividaConsolidada / Math.max(1, this.rcl12);
    const rec = this.janela.reduce((s, m) => s + somaV(m.receitas), 0);
    const despCorr = this.janela.reduce((s, m) => s + (m.despesas.pessoal ?? 0) + (m.despesas.previdencia ?? 0) + (m.despesas.custeio ?? 0) + (m.despesas.juros ?? 0) + (m.despesas.poderes ?? 0), 0);
    const poup = despCorr / Math.max(1, rec);
    const liq = this.caixa > 0 ? (despCorr / 12) / this.caixa : 99;
    const nEnd = end < 0.6 ? 'A' : end < 1.5 ? 'B' : 'C';
    const nPoup = poup < 0.9 ? 'A' : poup < 0.95 ? 'B' : 'C';
    const nLiq = liq < 1 ? 'A' : 'C';
    if (this.caixa < 0) return 'D';
    if (nPoup === 'A' && nLiq === 'A') return nEnd === 'C' ? 'B' : 'A';
    if (nPoup === 'B' && nLiq === 'A') return nEnd === 'C' ? 'C' : 'B';
    if (nLiq === 'A' && nEnd !== 'C') return 'C';
    return 'D';
  }

  // ── Passo mensal ─────────────────────────────────────────────────────────────────

  mes(ctx: ContextoMes): { repasseCapital: number; concluidas: ObraAtiva[] } {
    const { rng } = ctx;
    this.concluidasNoMes = [];
    this.cidadeCtx = ctx.cidade ?? null;
    const m = ctx.mes; // mês que se inicia
    const mesFechado = ((m + 10) % 12) + 1; // mês que acabou de ser executado
    const L = this.loa; // em duodécimos executa-se 1/12 da última LOA aprovada

    // macro: inflação, ciclo nacional, petróleo
    this.ipca = clamp(this.ipca + (0.04 - this.ipca) * 0.08 + (rng.next() - 0.5) * 0.004, 0.015, 0.11);
    this.gNacional = clamp(this.gNacional + (0.02 - this.gNacional) * 0.06 + (rng.next() - 0.5) * 0.006, -0.04, 0.05);
    this.petroleo = clamp(this.petroleo * (1 + (rng.next() - 0.5) * 0.08 + (1 - this.petroleo) * 0.03), 0.45, 1.8);
    this.precos *= 1 + this.ipca / 12;
    this.idxNacional *= 1 + (this.ipca + this.gNacional) / 12;
    const ef = this.ini.efeitos;
    const efeitoObrasPIB = this.efeitosObras.crescimentoPIB ?? 0;
    this.gEstado = this.gNacional + efeitoObrasPIB
      - 0.12 * (L.aliquotaICMS / this.cal.aliquotaICMS0 - 1)
      + 0.06 * L.incentivos
      + 0.004 * (this.ind.ideb - this.ind0.ideb)
      - 0.006 * (this.ind.homicidios / Math.max(1, this.ind0.homicidios) - 1)
      + 0.004 * ((ef.agro ?? 0) + (ef.industria ?? 0)) * 0.5
      - (this.caixa < 0 ? 0.005 : 0)
      + this.choquePib
      - 0.02 * this.climaMes.estiagem * (0.5 + (ef.agro ?? 0));
    this.pibReal *= 1 + this.gEstado / 12;
    this.pibNominal *= 1 + (this.gEstado + this.ipca) / 12;
    const crescIdx = this.pibReal * this.precos; // índice nominal do PIB estadual

    // ── Receitas do mês ──
    const c = this.cal;
    const r = (aliq: number, aliq0: number, el: number) => Math.pow(aliq / aliq0, el);
    const fazenda = 1 + 0.05 * (this.pol.secretarios.administracao.competencia - this.comp0.administracao);
    const icms = (c.icms / 12) * crescIdx * r(L.aliquotaICMS, c.aliquotaICMS0, 0.45) * (1 - L.incentivos) * (mesFechado === 12 ? 1.12 : 0.99) * fazenda;
    const ipva = c.ipva * SAZ_IPVA[mesFechado - 1] * crescIdx * r(L.aliquotaIPVA, c.aliquotaIPVA0, 0.85);
    const itcd = (c.itcd / 12) * crescIdx * r(L.aliquotaITCMD, c.aliquotaITCMD0, 0.7);
    const S = this.folhaMensal(mesFechado);
    const B = this.beneficiosMensal(mesFechado);
    const irrf = c.irrfTaxa * (S + B);
    const royalties = (c.patrimonial / 12) * this.precos * (c.fracRoyalties * this.petroleo + (1 - c.fracRoyalties));
    const outras = ((c.outrasTrib + c.contribOutras + c.servicos + c.outrasCorrentes) / 12) * crescIdx;
    const fpe = ((c.fpe + c.lc61) / 12) * this.idxNacional;
    const transferencias = (c.outrasTransf / 12) * this.idxNacional * fatorFederal(this.atores);
    const transfMun = c.kMunicipios * (0.25 * icms + 0.5 * ipva + 0.25 * (c.lc61 / 12) * this.idxNacional);
    const formacaoFundeb = c.kFundeb * 0.2 * (icms + ipva + itcd + fpe - transfMun);
    const fundeb = c.fundebRetorno * formacaoFundeb;
    const receitas = { icms, ipva, itcd, irrf, royalties, outras, fpe, transferencias, fundeb, municipios: -transfMun, formacaoFundeb: -formacaoFundeb };
    const receitaCorrenteLiq = somaV(receitas);
    let credito = 0;
    this.emprestimosPendentes = this.emprestimosPendentes.filter((e) => {
      if (e.liberaEm <= this.mesIndex) { credito += e.valor; this.dividaOutros += e.valor; return false; }
      return true;
    });

    // ── Despesas do mês ──
    const cont = this.contingenciamento;
    // em duodécimos só seguem as despesas obrigatórias e metade dos contratos de obras em andamento
    const fracInvest = this.duodecimos ? 0.5 : 1;
    const patronal = 2 * this.aliquotaPrev * S;
    const contrib = c.kContrib * (this.aliquotaPrev * S + patronal + 0.15 * this.aliquotaPrev * B) + c.compensacao / 12 * this.precos;
    const aporte = Math.max(0, B - contrib);
    const poderes = c.shareDuodecimos * this.rcl12 / 12;
    let custeio = 0, investimento = 0;
    const gastoArea = {} as Record<Area, number>;
    const folhaArea = this.folhaPorArea(S);
    // obras: consomem a dotação de investimento da área
    const necessidade = {} as Record<Area, number>;
    for (const o of this.obras) if (o.fase === 'execucao') {
      const d = defObra(o);
      necessidade[d.area] = (necessidade[d.area] ?? 0) + o.custoTotal / d.meses;
    }
    const ritmoObras = {} as Record<Area, number>;
    for (const a of AREAS) {
      const cus = (L.custeio[a.id] / 12) * (1 - cont) + (this.custeioObras[a.id] / 12) * this.precos;
      const dot = (L.investimento[a.id] / 12) * (1 - cont) * fracInvest;
      const nec = necessidade[a.id] ?? 0;
      // se a dotação não cobre as obras, o Tesouro ainda paga até 2× a dotação em medições atrasadas
      const inv = Math.max(dot, Math.min(nec, dot * 2));
      ritmoObras[a.id] = nec > 0 ? clamp(inv / nec, 0, 1) : 1;
      custeio += cus;
      investimento += inv;
      const greve = this.greveArea(a.id) ? 0.55 : 1;
      gastoArea[a.id] = (folhaArea[a.id] * (1 + 2 * this.aliquotaPrev)) * greve + cus + Math.max(0, inv - Math.min(inv, nec) * 0.5);
      this.execucao[a.id] = { custeio: cus, investimento: inv, pessoal: folhaArea[a.id] };
    }
    // custo mensal das políticas (diferença em relação às herdadas) — também conta como esforço da área
    const pol = this.custosPoliticas();
    this.custoPoliticasMes = pol.total;
    for (const [a, v] of Object.entries(pol.porArea) as [Area, number][]) gastoArea[a] += v;
    const programaCapital = (L.programaCapital / 12) * fracInvest * (1 - cont);
    // emendas da LOA + as negociadas voto a voto no mês anterior
    this.emendasTotal += this.pol.emendasAPagar;
    const emendas = (L.emendas / 12) * (1 - cont * 0.5) + this.pol.emendasAPagar;
    this.pol.emendasAPagar = 0;
    const convenios = this.atores.conveniosAPagar;
    this.atores.conveniosAPagar = 0;
    const publicidade = this.atores.publicidade;

    // dívida
    const jurosU = this.dividaUniao * (this.jurosReaisUniao + this.ipca) / 12;
    const jurosO = this.dividaOutros * (JUROS_REAL_OUTROS + this.ipca) / 12;
    const amortU = this.dividaUniao / (PRAZO_UNIAO_ANOS * 12);
    const amortO = this.dividaOutros / (PRAZO_OUTROS_ANOS * 12);
    // fracPagamento: no RRF é a parcela efetivamente paga (o resto capitaliza); fora dele é a
    // calibração do custo real dos contratos (juros e prazos variam entre estados)
    const fp = this.fracPagamento;
    const jurosPagos = (jurosU + jurosO) * fp;
    const amortPaga = (amortU + amortO) * fp;
    if (this.regime === 'RRF') this.dividaUniao += jurosU * (1 - fp) - amortU * fp;
    else this.dividaUniao -= amortU * fp;
    this.dividaOutros -= amortO * fp;
    this.outrasDividas *= 1 + this.ipca / 12;

    const despesas = {
      pessoal: S + patronal, previdencia: aporte, custeio, investimento, poderes, programaCapital, emendas,
      politicas: pol.total, juros: jurosPagos, amortizacao: amortPaga, convenios, publicidade,
    };
    const totalDesp = somaV(despesas);
    const resultado = receitaCorrenteLiq + credito - totalDesp;
    const primario = receitaCorrenteLiq - (totalDesp - jurosPagos - amortPaga) - (royalties * 0);
    this.caixa += resultado;

    // LRF: janela de 12 meses
    const rclMes = receitaCorrenteLiq;
    const dtpMes = S + patronal + c.fracInativosDTP * B;
    this.janela.push({ rcl: rclMes, dtp: dtpMes, receitas, despesas, gastoArea, primario, nominal: primario - jurosPagos });
    if (this.janela.length > 12) this.janela.shift();

    // mínimos (ano corrente)
    const ril = icms + ipva + itcd + irrf + fpe - transfMun;
    this.anoCorrente.ril += ril;
    this.anoCorrente.saude += c.kSaude * (folhaArea.saude * (1 + 2 * this.aliquotaPrev) + this.execucao.saude.custeio + this.execucao.saude.investimento);
    this.anoCorrente.educacao += c.kEducacao * (folhaArea.educacao * (1 + 2 * this.aliquotaPrev) + this.execucao.educacao.custeio + this.execucao.educacao.investimento);

    this.historico.push({ rotulo: `${MESES[mesFechado - 1]}/${String(mesFechado === 12 ? ctx.ano - 1 : ctx.ano).slice(2)}`, receitas: { ...receitas, credito }, despesas, resultado, caixa: this.caixa });
    if (this.historico.length > 48) this.historico.shift();

    this.atualizarFolha(mesFechado, rng);
    this.atualizarObras(ritmoObras, ctx);
    this.atualizarIndicadores();
    this.aplicarChoquesInd();
    this.atualizarAtrasos(ctx);
    this.mesIndex++;
    this.calendario(ctx);
    this.passoPolitico(ctx);
    this.atualizarAprovacao(ctx);
    this.serie.push(Math.round(this.aprovacao * 10) / 10);
    if (this.serie.length > 120) this.serie.shift();
    this.posseInfo ??= { caixa: this.caixa, dcl: this.dclPct, pessoal: this.pessoalPct };
    if (this.pol.afastado && !this.fim) this.fim = { motivo: 'afastado', data: this.pol.afastado.data };
    return { repasseCapital: programaCapital, concluidas: this.concluidasNoMes };
  }

  private cidadeCtx: ContextoMes['cidade'] | null = null;

  // ── Eleição (Fase 7) ────────────────────────────────────────────────────────────

  ctxEleitoral(): ContextoEleitoral {
    const el = this.ini.eleitorado!;
    const cad = {} as Record<IdPartido, number>;
    for (const d of this.pol.deputados) cad[d.partido] = (cad[d.partido] ?? 0) + 1;
    const op = this.pol.deputados.filter((d) => d.relacao < -0.2 && d.partido !== this.partidoGov).sort((a, b) => b.influencia * b.mandatos - a.influencia * a.mandatos)[0];
    const obras = this.obras.filter((o) => o.fase === 'concluida').length;
    return {
      sigla: this.ini.sigla, regiao: this.ini.regiao ?? 'Sudeste', eleitorado: el,
      capitalIbge: el.municipios.find((m) => m.nome === this.cidades[0])?.ibge ?? el.municipios[0]?.ibge ?? null,
      sedeIbge: this.ini.sede ? el.municipios.find((m) => m.nome === this.ini.sede)?.ibge ?? null : null,
      grupos: this.grupos, aprovacao: this.aprovacao,
      crises: this.pol.escandalos.filter((e) => e.fase !== 'encerrado').length + 0.5 * Object.values(this.greves).filter(Boolean).length + (this.atrasoSalarial ? 1 : 0),
      partidoGov: this.partidoGov, baseAliada: this.baseAliada, posturas: this.pol.posturas, cadeiras: cad,
      prefeitos: this.atores.prefeitos.map((p) => ({ cidade: p.cidade, relacao: p.relacao, nome: p.nome, partido: p.partido, ambicao: p.ambicao, capital: p.capital, retrato: p.retrato, genero: p.genero, idade: p.idade })),
      oposicaoLider: op ? { nome: op.nome, urna: op.urna, partido: op.partido, cidade: op.cidade, retrato: op.retrato, genero: op.genero, idade: op.idade } : null,
      reeleicaoPermitida: this.mandato < 2,
      delta: {
        homicidios: this.ind.homicidios / Math.max(0.1, this.ind0.homicidios) - 1, espera: this.ind.esperaEmergencia / Math.max(0.1, this.ind0.esperaEmergencia) - 1,
        desemprego: this.ind.desemprego - this.ind0.desemprego, ideb: this.ind.ideb - this.ind0.ideb, fila: this.ind.filaCirurgias / Math.max(0.01, this.ind0.filaCirurgias) - 1, obras,
      },
    };
  }

  /** Passo diário do calendário eleitoral (chamado pela Simulation). */
  diario(ctx: { ano: number; mes: number; dia: number; rng: Rng; noticia: Noticiador; tv: { ancora: string; nome: string } }) {
    if (!this.ini.eleitorado || this.fim) return;
    const { ano, mes, dia, rng, noticia } = ctx;
    const data = `${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')}/${ano}`;
    // posse em 6 de janeiro do ano seguinte à eleição (EC 111/2021)
    if (mes === 1 && dia === 6 && this.eleicao && this.eleicao.ano === ano - 1 && this.eleicao.fase === 'apurado') { this.posse(ano, noticia); return; }
    if (!ehAnoEleitoral(ano)) return;
    const hoje = diaDoAno(mes, dia);
    const t1 = diaDoAno(10, primeiroTurno(ano)), t2 = diaDoAno(10, segundoTurno(ano));
    if (!this.eleicao || this.eleicao.ano !== ano) {
      if (mes < 3) return;
      this.eleicao = criarEleicao(ano, this.ctxEleitoral());
      noticia(`Começa o ano eleitoral: ${this.eleicao.candidatos.length - 1} pré-candidatos já se movimentam para o governo do estado.`, 'info', `anoEl${ano}`, 0);
    }
    const el = this.eleicao;
    const c = this.ctxEleitoral();
    // pré-campanha: pesquisas mensais (dia 15)
    if (el.fase === 'pre' && dia === 15 && mes >= 3 && mes <= 7) this.publicarPesquisa(el, c, 1, data, rng, t1 - hoje, noticia);
    // condutas vedadas a partir de 3 meses antes
    if (hoje === t1 - 92 && this.atores.publicidade > 0) {
      this.atores.publicidade = 0;
      noticia('Lei eleitoral: publicidade institucional do governo sai do ar até a eleição.', 'info', `vedada${ano}`, 0);
    }
    // convenções: 20/7 a 5/8
    if (hoje === diaDoAno(7, 20)) {
      el.opcoesSucessor = this.opcoesSucessor();
      noticia(this.mandato < 2 ? 'Começam as convenções partidárias. O Palácio precisa decidir: reeleição ou sucessor?' : 'Começam as convenções: sem direito a novo mandato, o governador precisa escolher quem vai defender o governo.', 'alerta', `convAb${ano}`, 0);
    }
    if (hoje === diaDoAno(8, 5)) {
      if (el.decisao === null || (el.decisao === 'sucessor' && el.candidatos[0].origem !== 'sucessor')) {
        if (this.mandato < 2) { el.decisao = 'reeleicao'; noticia('Sem anúncio do Palácio, o partido registra a candidatura do governador à reeleição.', 'info', `convAuto${ano}`, 0); }
        else { if (!el.opcoesSucessor.length) el.opcoesSucessor = this.opcoesSucessor(); this.acao({ tipo: 'convencao', decisao: 'sucessor', sucessor: 0 }, { ano, mes, rng, noticia }); }
      }
      const exp = intencaoEstadual(el, c, 1);
      const lider = [...el.candidatos].sort((a, b) => (exp[b.id] ?? 0) - (exp[a.id] ?? 0))[0];
      formarColigacoes(el, c, lider?.id);
      const jog = el.candidatos.find((x) => x.doJogador)!;
      noticia(`Coligações fechadas: ${jog.coligacao.length} partidos e ${Math.round(jog.tempoTV * 100)}% do horário eleitoral para o candidato do governo.`, 'info', `colig${ano}`, 0);
    }
    // campanha oficial a partir de 16/8
    if (el.fase === 'pre' && hoje >= diaDoAno(8, 16)) { el.fase = 'campanha'; noticia('Começa oficialmente a campanha eleitoral: comícios, carreatas e santinhos nas ruas.', 'info', `camp${ano}`, 0); }
    if (el.fase === 'campanha' && hoje < t1) {
      if ((hoje - diaDoAno(8, 16)) % 7 === 0) {
        semanaDeCampanha(el, c, rng, hoje >= diaDoAno(8, 30) && hoje <= t1 - 2, data);
        this.publicarPesquisa(el, c, 1, data, rng, t1 - hoje, noticia);
      }
      if (hoje === t1 - 10) { criarDebate(el, c, 1, t1 - 8, data, ctx.tv, rng); noticia(`${ctx.tv.nome} confirma o debate entre os candidatos ao governo hoje à noite.`, 'alerta', `debA${ano}`, 0); }
      if (hoje === t1 - 8) this.encerrarDebatePendente(el, noticia);
    }
    if (el.fase === 'campanha' && hoje === t1) this.apurar(el, c, 1, data, rng, noticia);
    if (el.fase === 'segundoTurno' && hoje > t1 && hoje < t2) {
      if ((hoje - t1 - 1) % 7 === 0) {
        semanaDeCampanha(el, c, rng, hoje >= t1 + 5 && hoje <= t2 - 2, data);
        this.publicarPesquisa(el, c, 2, data, rng, t2 - hoje, noticia);
      }
      if (hoje === t2 - 5) { criarDebate(el, c, 2, t2 - 3, data, ctx.tv, rng); noticia(`Debate do 2º turno na ${ctx.tv.nome}: frente a frente, sem rodeios.`, 'alerta', `debB${ano}`, 0); }
      if (hoje === t2 - 3) this.encerrarDebatePendente(el, noticia);
    }
    if (el.fase === 'segundoTurno' && hoje === t2) this.apurar(el, c, 2, data, rng, noticia);
  }

  private encerrarDebatePendente(el: EstadoEleicao, noticia: Noticiador) {
    const d = el.debates.find((x) => !x.concluido);
    if (!d) return;
    const respondidas = d.perguntas.filter((q) => q.respondida !== undefined).length;
    fecharDebate(el, d, respondidas === 0);
    noticia(`Debate na TV: ${d.resumo}`, d.placar > 0.03 ? 'bom' : d.placar < -0.02 ? 'ruim' : 'info', `deb${el.ano}${d.turno}`, 0);
  }

  private publicarPesquisa(el: EstadoEleicao, c: ContextoEleitoral, turno: 1 | 2, data: string, rng: Rng, dias: number, noticia: Noticiador) {
    const p = pesquisa(el, c, turno, data, rng, dias);
    const ord = el.candidatos.filter((x) => x.ativo).sort((a, b) => (p.intencao[b.id] ?? 0) - (p.intencao[a.id] ?? 0));
    const top = ord.slice(0, 3).map((x) => `${x.doJogador ? x.urna + ' (governo)' : x.urna} ${Math.round(p.intencao[x.id])}%`).join(', ');
    noticia(`Pesquisa ${p.instituto} para governador${turno === 2 ? ' (2º turno)' : ''}: ${top}.`, 'info', `pesqEl${data}`, 0);
  }

  private apurar(el: EstadoEleicao, c: ContextoEleitoral, turno: 1 | 2, data: string, rng: Rng, noticia: Noticiador) {
    const r = votarEleicao(el, c, turno, data, rng);
    const o = ordem(r);
    const cand = (i: number) => el.candidatos.find((x) => x.id === r.ids[i])!;
    const pct = (i: number) => (r.totais[i] / Math.max(1, r.validos)) * 100;
    const f = (v: number) => v.toFixed(1).replace('.', ',');
    if (turno === 1) {
      el.resultado1 = r;
      const a = cand(o[0]), b = cand(o[1]);
      if (pct(o[0]) > 50) {
        el.vencedor = a.id; el.fase = 'apurado';
        noticia(`${a.urna} vence no 1º turno com ${f(pct(o[0]))}% dos votos válidos.${a.doJogador ? ' Festa no comitê do governo!' : ''}`, a.doJogador ? 'bom' : 'ruim', `t1${el.ano}`, 0);
      } else {
        el.fase = 'segundoTurno';
        for (const x of el.candidatos) x.ativo = x.id === a.id || x.id === b.id;
        apoiosAutomaticos(el);
        for (const x of el.candidatos) x.momento *= 0.5;
        noticia(`Haverá 2º turno: ${a.urna} (${f(pct(o[0]))}%) e ${b.urna} (${f(pct(o[1]))}%) disputam o governo em ${segundoTurno(el.ano)} de outubro.`, 'alerta', `t1${el.ano}`, 0);
      }
    } else {
      el.resultado2 = r;
      el.vencedor = cand(o[0]).id; el.fase = 'apurado';
      const a = cand(o[0]);
      noticia(`${a.urna} é eleito(a) governador(a) no 2º turno com ${f(pct(o[0]))}% dos votos válidos.`, a.doJogador ? 'bom' : 'ruim', `t2${el.ano}`, 0);
    }
    if (el.fase === 'apurado') {
      const v = el.candidatos.find((x) => x.id === el.vencedor)!;
      const jog = el.candidatos.find((x) => x.doJogador)!;
      const res = el.resultado2 ?? el.resultado1!;
      const i = res.ids.indexOf(jog.id);
      const pj = i >= 0 ? (res.totais[i] / Math.max(1, res.validos)) * 100 : 0;
      const turnoFinal = el.resultado2 ? 2 : 1;
      const r1 = el.resultado1!, i1 = r1.ids.indexOf(jog.id);
      const fora = !v.doJogador && turnoFinal === 2 && i < 0;
      const pj1 = i1 >= 0 ? (r1.totais[i1] / Math.max(1, r1.validos)) * 100 : 0;
      const texto = fora ? `${jog.origem === 'governador' ? 'Ficou' : `O(a) sucessor(a) ${jog.urna} ficou`} fora do 2º turno (${f(pj1)}% dos válidos); ${v.urna} venceu` : v.doJogador
        ? (jog.origem === 'governador' ? `Reeleito(a) no ${turnoFinal}º turno com ${f(pj)}% dos válidos` : `${jog.urna}, o(a) sucessor(a), eleito(a) no ${turnoFinal}º turno com ${f(pj)}%`)
        : `${jog.origem === 'governador' ? 'Derrotado(a)' : `O(a) sucessor(a) ${jog.urna} foi derrotado(a)`} por ${v.urna} no ${turnoFinal}º turno (${f(pj)}% dos válidos)`;
      this.historicoEleicoes.push({ ano: el.ano, texto, venceu: v.doJogador, turno: turnoFinal, pct: fora ? pj1 : pj });
      if (v.doJogador) this.pol.capital = clamp(this.pol.capital + 15, 0, 100);
      noticia(`Eleição presidencial: ${novoPresidente(this.ini.sigla, el.ano, this.cidades[0]).nome} é eleito(a) Presidente da República.`, 'info', `pres${el.ano}`, 0);
    }
  }

  /** Nomes para a sucessão: Casa Civil, o secretário mais bem avaliado e um deputado aliado. */
  private opcoesSucessor(): EstadoEleicao['opcoesSucessor'] {
    const cc = this.pol.secretarios.casaCivil;
    const melhor = Object.values(this.pol.secretarios).filter((x) => x.cargo !== 'casaCivil' && !x.interino).sort((a, b) => b.competencia - a.competencia)[0];
    const dep = this.pol.deputados.filter((d) => d.relacao > 0.3).sort((a, b) => b.influencia - a.influencia)[0];
    const ideoGov = PARTIDOS[this.partidoGov].ideologia;
    const out: EstadoEleicao['opcoesSucessor'] = [
      { nome: cc.nome, perfil: 'chefe da Casa Civil', carisma: 0.45 + 0.2 * cc.lealdade, ideologia: ideoGov, partido: this.partidoGov },
    ];
    if (melhor) out.push({ nome: melhor.nome, perfil: `secretário(a) de ${CARGOS.find((x) => x.id === melhor.cargo)!.nome}`, carisma: 0.35 + 0.35 * melhor.competencia, ideologia: ideoGov, partido: melhor.partido ?? this.partidoGov });
    if (dep) out.push({ nome: dep.nome, perfil: `deputado(a) estadual (${dep.urna})`, carisma: 0.5 + 0.2 * dep.influencia, ideologia: dep.ideologia, partido: dep.partido });
    return out;
  }

  /** 6 de janeiro após a eleição: novo mandato ou fim de jogo. */
  private posse(ano: number, noticia: Noticiador) {
    const el = this.eleicao!;
    el.fase = 'encerrada';
    const v = el.candidatos.find((x) => x.id === el.vencedor)!;
    const jog = el.candidatos.find((x) => x.doJogador)!;
    const data = `06/01/${ano}`;
    // novo Presidente da República
    this.atores.presidente = novoPresidente(this.ini.sigla, el.ano, this.cidades[0]);
    if (v.doJogador && jog.origem === 'governador' && this.mandato < 2) {
      this.mandato = 2;
      this.mesPosse = this.mesIndex;
      // nova Assembleia: mesmos partidos na base, novos deputados
      const nova = criarPolitica({ sigla: this.ini.sigla, regiao: this.ini.regiao ?? 'Sudeste', complexidade: this.ini.efeitos.complexidadePolitica ?? 0, cidades: this.cidades, semente: `ALE:${this.ini.sigla}:${ano}`, posturas: this.pol.posturas });
      for (const d of nova.deputados) if (this.pol.posturas[d.partido] === 'base') d.relacao = clamp(d.relacao + 0.1, -1, 1);
      this.pol.deputados = nova.deputados;
      this.pol.presidenteALE = nova.presidenteALE;
      this.pol.pauta = this.pol.pauta.filter((p) => p.tipo === 'loa');
      this.baseAliada = baseAliada(this.pol);
      noticia(`Posse do segundo mandato: o governador é empossado na Assembleia renovada, com ${Math.round(this.baseAliada * this.pol.cadeiras)} deputados na base. Novo Presidente da República assume em Brasília.`, 'bom', `posse${ano}`, 0);
      return;
    }
    const motivo: Legado['motivo'] = jog.origem === 'sucessor' ? (v.doJogador ? 'sucessor-eleito' : 'sucessor-derrotado') : this.mandato >= 2 ? 'fim-mandatos' : 'derrota';
    this.fim = { motivo, data };
    noticia(v.doJogador ? `${v.urna} toma posse como governador(a). Fim do seu governo.` : `${v.urna} toma posse e assume o Palácio. Fim do seu governo.`, 'info', `fim${ano}`, 0);
  }

  legado(): Legado {
    const p = this.posseInfo ?? { caixa: this.caixa, dcl: this.dclPct, pessoal: this.pessoalPct };
    const ano = (mi: number) => 2027 + Math.floor(mi / 12);
    return calcularLegado({
      motivo: this.fim?.motivo ?? 'fim-mandatos', inicio: 'jan/2027',
      fim: this.fim?.motivo === 'afastado' ? this.fim.data : this.fim ? `dez/${Number(this.fim.data.slice(-4)) - 1}` : `${ano(this.mesIndex)}`, mandatos: this.mandato, serie: this.serie,
      ind0: this.ind0, ind: this.ind, caixa: [p.caixa, this.caixa], dcl: [p.dcl, this.dclPct], pessoal: [p.pessoal, this.pessoalPct],
      pibReal: this.pibReal, regime: this.regime,
      obras: this.obras.filter((o) => o.fase === 'concluida').map((o) => defObra(o).nome),
      votacoes: this.pol.votacoes, cpis: this.pol.cpis.length, escandalos: this.pol.escandalos.length, afastado: !!this.pol.afastado,
      eleicoes: this.historicoEleicoes, emendas: this.emendasTotal, imprensaFinal: -amplificador(this.atores), reformaPrevidencia: this.reformaPrevidencia,
    });
  }

  /** Cidades da UF (naturalidade dos personagens, redutos eleitorais). */
  get cidades(): string[] {
    return this.ini.cidades?.length ? this.ini.cidades : [this.ini.sigla];
  }

  /** Escala das negociações (emendas e obras crescem com o tamanho do orçamento). */
  get escalaPolitica(): number {
    return clamp(this.rcl12 / 40e9, 0.4, 3);
  }

  private passoPolitico(ctx: ContextoMes) {
    const m = ctx.mes;
    const saida = politicaMensal(this.pol, {
      mesIndex: this.mesIndex, ano: ctx.ano, mes: m, data: `${MESES[m - 1]}/${ctx.ano}`, aprovacao: this.aprovacao, rng: ctx.rng, noticia: ctx.noticia,
      cidades: this.cidades, atrasoSalarial: this.atrasoSalarial, pessoalAcimaLRF: this.pessoalPct > LIMITE_MAX_PESSOAL,
      obrasConcluidas: this.concluidasNoMes.map((o) => o.uid),
      obrasParadas: this.obras.filter((o) => o.fase === 'paralisada' || o.mesesRuins >= 3).map((o) => o.uid),
    });
    for (const c of saida.choques) this.choque(c.valor, c.meia, c.grupo);
    const sa = atoresMensal(this.atores, {
      mesIndex: this.mesIndex, mes: m, ano: ctx.ano, data: `${MESES[m - 1]}/${ctx.ano}`, aprovacao: this.aprovacao,
      escandalos: this.pol.escandalos.filter((e) => e.fase !== 'encerrado').length, escala: this.escalaPolitica, posturas: this.pol.posturas, rng: ctx.rng, noticia: ctx.noticia,
    });
    for (const c of sa.choques) this.choque(c.valor, c.meia);
    for (const r of saida.resolvidos) {
      const p = r.projeto;
      if (p.tipo === 'pec-previdencia') {
        if (r.aprovado) {
          this.reformaPrevidencia = true;
          this.mesReforma = this.mesIndex;
          this.aliquotaPrev = Math.max(this.aliquotaPrev, 0.16);
          this.loa = { ...this.loa, aliquotaPrevidencia: this.aliquotaPrev };
          ctx.noticia(`ALE aprova a reforma da Previdência estadual por ${r.aFavor} votos (precisava de 3/5): idade mínima maior e alíquota de até 16%. Servidores prometem greve.`, 'alerta', 'prevOk', 0);
          this.choque(-10, 6, 'servidores');
        } else {
          ctx.noticia(`Reforma da Previdência estadual é derrotada na ALE: ${r.aFavor} votos, abaixo dos 3/5 exigidos. Galerias lotadas de servidores comemoram.`, 'ruim', `prevNo${this.mesIndex}`, 0);
          this.choque(-4, 5);
        }
      } else if (p.tipo === 'credito' && p.ref?.valor) {
        if (r.aprovado) {
          const credor = p.ref.credor as 'bndes' | 'bird' | 'bancos';
          const juros = credor === 'bancos' ? 0.02 : 0;
          this.emprestimosPendentes.push({ valor: p.ref.valor * (1 - juros), credor, liberaEm: this.mesIndex + (credor === 'bird' ? 6 : 3) });
          ctx.noticia(`ALE autoriza operação de crédito de R$ ${(p.ref.valor / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} milhões (${r.aFavor} a ${r.contra}).`, 'info', `cred${this.mesIndex}`, 0);
        } else {
          ctx.noticia(`ALE nega autorização para o empréstimo de R$ ${(p.ref.valor / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} milhões (${r.contra} votos contra).`, 'ruim', `credNo${this.mesIndex}`, 0);
        }
      }
    }
    this.baseAliada = baseAliada(this.pol);
  }

  /** Placar previsto e chance de um projeto da pauta (para a interface). */
  placarDe(id: string) {
    const p = this.pol.pauta.find((x) => x.id === id);
    return p ? placar(this.pol, p, { aprovacao: this.aprovacao }) : null;
  }

  /** Custos mensais das políticas em relação às herdadas (R$), por área. */
  custosPoliticas(): { total: number; porArea: Partial<Record<Area, number>> } {
    const p = this.politicas, p0 = this.politicas0;
    const pop = this.ini.populacao;
    const precos = this.precos;
    const porArea: Partial<Record<Area, number>> = {};
    const add = (a: Area, v: number) => { porArea[a] = (porArea[a] ?? 0) + v; };
    // OS: economia de ~3% do custeio da saúde (com risco de escândalo)
    if (p.gestaoSaude !== p0.gestaoSaude) add('saude', (p.gestaoSaude === 'os' ? -0.03 : 0.03) * this.loa.custeio.saude / 12);
    // tempo integral: R$ 5.500/aluno/ano a mais; ensino médio ≈ 4,5% da população
    add('educacao', (p.tempoIntegral - p0.tempoIntegral) * pop * 0.045 * 5_500 / 12 * precos);
    if (p.bonusProfessor !== p0.bonusProfessor) add('educacao', (p.bonusProfessor ? 1 : -1) * 0.03 * this.servidores.educacao * this.salario.educacao * 13.33 / 12);
    if (p.doutrina === 'prevencao' && p0.doutrina !== 'prevencao') add('assistencia', 25 * pop / 12 * precos);
    if (p.cameras !== p0.cameras) add('seguranca', (p.cameras ? 1 : -1) * 5 * pop / 12 * precos);
    if (p.integracaoDados !== p0.integracaoDados) add('seguranca', (p.integracaoDados ? 1 : -1) * 4 * pop / 12 * precos);
    if (p.rendaEstadual) add('assistencia', 150 * (pop * this.ind.pobreza / 100 / 3.2) * precos);
    if (this.mutiraoMeses > 0) add('saude', this.ind.filaCirurgias * 1000 * 2_500 / 3);
    return { total: Object.values(porArea).reduce((a, b) => a + (b ?? 0), 0), porArea };
  }

  /** Obra pedida pela Visão Cidade (urbanização, BRT, metrô, teleférico), paga pelo Tesouro. */
  iniciarObraCustom(c: ObraCustom, ctx: { ano: number; mes: number; rng: Rng; noticia: Noticiador }): number {
    const uid = this.nextObra++;
    this.obras.push({ uid, id: `custom-${uid}`, custom: c, fase: 'licitacao', progresso: 0, custoTotal: c.custo, gasto: 0, mesesLicitacao: ctx.rng.int(2, 4) + (c.ambiental ? 2 : 0), mesesParada: 0, mesesRuins: 0, iniciadaEm: `${MESES[ctx.mes - 1]}/${ctx.ano}` });
    ctx.noticia(`Governo publica edital de "${c.nome}" (${(c.custo / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} milhões).`, 'info', `edital${uid}`, 0);
    return uid;
  }

  /** Uma operação policial aconteceu na capital. */
  registrarOperacao(mortos: number, presos: number) {
    this.operacoesRecentes += mortos;
    this.ind.homicidios += mortos * 100_000 / Math.max(1, this.ini.populacao) * 0.5;
    if (presos > mortos * 3) this.choque(2, 3, 'classeMedia');
    if (mortos > 0) this.choque(-Math.min(8, 1 + mortos * 0.7), 4, 'baixaRenda');
  }

  /** Tragédia (deslizamento etc.) na capital. */
  registrarTragedia(mortos: number) {
    this.choque(-(2 + Math.min(8, mortos * 0.6)), 5);
  }

  private folhaMensal(mesFechado: number): number {
    // 1/3 de férias diluído; 13º em dezembro
    return CARREIRAS.reduce((s, c) => s + this.servidores[c.id] * this.salario[c.id] * (mesFechado === 12 ? 2.0278 : 1.0278), 0);
  }
  private beneficiosMensal(mesFechado: number): number {
    return (this.beneficios / 13) * (mesFechado === 12 ? 2 : 1);
  }

  private folhaPorArea(S: number): Record<Area, number> {
    const total = CARREIRAS.reduce((s, c) => s + this.servidores[c.id] * this.salario[c.id], 0) || 1;
    const porCarreira = Object.fromEntries(CARREIRAS.map((c) => [c.id, (S * this.servidores[c.id] * this.salario[c.id]) / total])) as Record<Carreira, number>;
    const out = {} as Record<Area, number>;
    const base = this.cal.pessoalPorArea;
    const demaisBase = AREAS.filter((a) => !['saude', 'educacao', 'seguranca'].includes(a.id)).reduce((s, a) => s + base[a.id], 0) || 1;
    for (const a of AREAS) {
      if (a.id === 'saude' || a.id === 'educacao' || a.id === 'seguranca') out[a.id] = porCarreira[a.id];
      else out[a.id] = porCarreira.demais * base[a.id] / demaisBase;
    }
    return out;
  }

  private greveArea(a: Area): boolean {
    if (a === 'saude' || a === 'educacao' || a === 'seguranca') return (this.greves[a] ?? 0) > 0;
    return (this.greves.demais ?? 0) > 0 && a === 'administracao';
  }

  /** Aposentadorias, concursos, benefícios e greves. */
  private atualizarFolha(mesFechado: number, rng: Rng) {
    const L = this.loa; // em duodécimos executa-se 1/12 da última LOA aprovada
    for (const c of CARREIRAS) {
      const n = this.servidores[c.id];
      const aposentam = n * 0.0022;
      const alvo = L.quadro[c.id];
      const repoe = alvo >= 0 ? aposentam + (this.quadroInicioAno[c.id] * alvo) / 12 : 0;
      this.servidores[c.id] = Math.max(100, n - aposentam + repoe);
      // novos aposentados entram no RPPS com ~85% do salário (13 parcelas)
      this.beneficios += aposentam * this.salario[c.id] * 0.85 * 13;
      const g = this.greves[c.id];
      if (g) this.greves[c.id] = g - 1;
    }
    // mortalidade de beneficiários e efeito da reforma
    this.beneficios *= 1 - (this.reformaPrevidencia ? 0.0021 : 0.0014);
    // indexação de benefícios pela inflação e crescimento vegetativo da folha
    // (progressões, triênios, promoções ≈ 1,2% a.a.) a cada virada de ano
    if (mesFechado === 12) {
      this.beneficios *= 1 + this.ipca * 0.85;
      for (const c of CARREIRAS) this.salario[c.id] *= 1.012;
    }

    // greves: perda salarial real acumulada provoca paralisações
    for (const c of CARREIRAS) {
      const perda = 1 - (this.salario[c.id] / this.salarioInicial[c.id]) / this.precos;
      const atraso = this.atrasoSalarial ? 0.15 : 0;
      if (!this.greves[c.id] && rng.chance(Math.max(0, (perda - 0.04) * 0.25 + atraso))) this.greves[c.id] = rng.int(1, 3);
    }
  }

  private atualizarObras(ritmo: Record<Area, number>, ctx: ContextoMes) {
    const { rng, noticia } = ctx;
    for (const o of this.obras) {
      const d = defObra(o);
      if (o.fase === 'licitacao') {
        o.mesesLicitacao--;
        if (o.mesesLicitacao <= 0) {
          if (rng.chance(0.12)) {
            o.mesesLicitacao = rng.int(2, 4);
            noticia(`Licitação de "${d.nome}" é impugnada; edital volta para a mesa da PGE.`, 'alerta', `impug${o.uid}`, 60);
          } else {
            o.fase = 'execucao';
            noticia(`Ordem de serviço assinada: começam as obras de "${d.nome}".`, 'bom', `os${o.uid}`, 0);
          }
        }
        continue;
      }
      if (o.fase === 'paralisada') {
        o.mesesParada--;
        if (o.mesesParada <= 0) { o.fase = 'execucao'; noticia(`TCE libera "${d.nome}" e a obra é retomada.`, 'info', `ret${o.uid}`, 0); }
        continue;
      }
      if (o.fase !== 'execucao') continue;
      const rit = ritmo[d.area] ?? 1;
      const avanço = (1 / d.meses) * rit * (o.custoTotal > 0 ? d.custo / o.custoTotal : 1);
      o.progresso = Math.min(1, o.progresso + avanço);
      o.gasto += (o.custoTotal / d.meses) * rit;
      o.mesesRuins = rit < 0.4 ? o.mesesRuins + 1 : 0;
      if (o.mesesRuins === 3) {
        noticia(`"${d.nome}" vira obra parada: canteiro abandonado e placa desbotada. Falta dotação de investimento em ${AREAS.find((a) => a.id === d.area)!.nome}.`, 'ruim', `parada${o.uid}`, 120);
        this.choque(-3, 6);
      }
      if (rng.chance(0.025)) {
        const extra = rng.range(0.08, 0.25);
        o.custoTotal *= 1 + extra;
        noticia(`Aditivo de ${Math.round(extra * 100)}% encarece "${d.nome}". Oposição fala em superfaturamento.`, 'alerta', `adit${o.uid}`, 90);
      }
      if (d.ambiental && rng.chance(0.012)) {
        o.fase = 'paralisada'; o.mesesParada = rng.int(2, 5);
        noticia(`Liminar suspende "${d.nome}" por pendência no licenciamento ambiental.`, 'ruim', `lim${o.uid}`, 90);
      } else if (rng.chance(0.008)) {
        o.fase = 'paralisada'; o.mesesParada = rng.int(2, 4);
        noticia(`TCE manda suspender "${d.nome}" e pede explicações sobre medições.`, 'ruim', `tce${o.uid}`, 90);
      }
      if (o.progresso >= 1) {
        o.fase = 'concluida';
        o.concluidaEm = `${MESES[ctx.mes - 1]}/${ctx.ano}`;
        const escala = Math.sqrt(d.popRef / Math.max(2e5, this.ini.populacao));
        for (const [k, v] of Object.entries(d.efeitos) as [keyof Indicadores, number][]) {
          this.efeitosObras[k] = (this.efeitosObras[k] ?? 0) + v * clamp(escala, 0.2, 2.5);
        }
        this.custeioObras[d.area] += d.custeioAnual;
        noticia(`Inauguração! "${d.nome}" é entregue com banda, faixa e discurso do(a) governador(a).`, 'bom', `inaug${o.uid}`, 0);
        this.choque(4, 4);
        if (o.custom) this.concluidasNoMes.push(o);
      }
    }
  }

  private esforco(a: Area): number {
    const gasto = this.janela.reduce((s, m) => s + (m.gastoArea[a] ?? 0), 0) / this.precos;
    const pop = 1; // população estável na Fase 3
    return clamp(gasto / Math.max(1, this.gastoBaseArea[a]) / pop, 0.3, 3);
  }

  private atualizarIndicadores() {
    const i0 = this.ind0, ind = this.ind, eo = this.efeitosObras;
    const D = (a: Area) => this.esforco(a) - 1 + 0.35 * (this.pol.secretarios[a].competencia - this.comp0[a]);
    const ppa = (a: Area) => (this.ppaEixos.includes(a) ? 0.12 : 0);
    const aprox = (atual: number, alvo: number, tau: number) => atual + (alvo - atual) / tau;
    const tanh = Math.tanh;

    const espera = i0.esperaEmergencia * (1 - 0.45 * tanh(1.3 * D('saude') + ppa('saude'))) * (1 + (eo.esperaEmergencia ?? 0));
    ind.esperaEmergencia = aprox(ind.esperaEmergencia, Math.max(0.6, espera), 5);
    const mort = i0.mortalidadeInfantil * (1 - 0.12 * tanh(D('saude')) - 0.004 * (ind.esgoto - i0.esgoto)) * (1 + (eo.mortalidadeInfantil ?? 0));
    ind.mortalidadeInfantil = aprox(ind.mortalidadeInfantil, Math.max(4, mort), 24);
    const greveEduc = (this.greves.educacao ?? 0) > 0 ? -0.25 : 0;
    const ideb = i0.ideb + 0.9 * tanh(1.1 * D('educacao') + ppa('educacao')) + (eo.ideb ?? 0) + greveEduc
      + 0.6 * (this.politicas.tempoIntegral - this.politicas0.tempoIntegral) + (this.politicas.bonusProfessor && !this.politicas0.bonusProfessor ? 0.12 : 0);
    ind.ideb = aprox(ind.ideb, clamp(ideb, 2, 7), 30);
    const p = this.politicas, p0 = this.politicas0;
    const fDout = (d: string) => (d === 'confronto' ? 0.95 : d === 'inteligencia' ? 0.93 : 0.9);
    const tauHom = p.doutrina === 'confronto' ? 6 : p.doutrina === 'inteligencia' ? 12 : 20;
    const terrCidade = this.cidadeCtx ? this.cidadeCtx.territorioCriminoso : 0;
    const hom = i0.homicidios * (1 - 0.3 * tanh(1.4 * D('seguranca') + ppa('seguranca')) - 0.12 * tanh(D('assistencia')) - 0.08 * (ind.ideb - i0.ideb)
      + 2.5 * (ind.desemprego - i0.desemprego) + ((this.greves.seguranca ?? 0) > 0 ? 0.08 : 0)) * (1 + (eo.homicidios ?? 0))
      * (fDout(p.doutrina) / fDout(p0.doutrina)) * (p.integracaoDados && !p0.integracaoDados ? 0.97 : 1) * (1 + 0.25 * terrCidade);
    ind.homicidios = aprox(ind.homicidios, Math.max(2, hom * (this.atores.forcaNacional > 0 ? 0.9 : 1)), tauHom);
    // novos indicadores (Fase 4)
    const fLet = (d: string, cam: boolean) => (d === 'confronto' ? 1.6 : d === 'inteligencia' ? 0.8 : 0.7) * (cam ? 0.6 : 1);
    this.operacoesRecentes *= 0.7;
    const letal = i0.letalidade * (fLet(p.doutrina, p.cameras) / fLet(p0.doutrina, p0.cameras)) + this.operacoesRecentes * 100_000 / Math.max(1, this.ini.populacao) * 2;
    ind.letalidade = aprox(ind.letalidade, Math.max(0.1, letal), 4);
    const leitos = i0.leitos * (1 + 0.15 * tanh(D('saude'))) * (1 + (eo.leitos ?? 0));
    ind.leitos = aprox(ind.leitos, leitos, 12);
    if (this.mutiraoMeses > 0) { this.mutiraoMeses--; ind.filaCirurgias *= 0.87; }
    const fila = i0.filaCirurgias * (1 - 0.45 * tanh(1.2 * D('saude') + ppa('saude'))) * (p.gestaoSaude === 'os' ? 0.92 : 1) * (1 + (eo.filaCirurgias ?? 0));
    ind.filaCirurgias = aprox(ind.filaCirurgias, Math.max(0.2, fila), 10);
    const evasao = i0.evasao * (1 - 0.25 * tanh(D('educacao')) - 0.35 * (p.tempoIntegral - p0.tempoIntegral)) * (1 + 1.5 * (ind.desemprego - i0.desemprego)) * (1 + (eo.evasao ?? 0));
    ind.evasao = aprox(ind.evasao, clamp(evasao, 0.5, 25), 14);
    const lot = i0.lotacaoPrisional * (1 + (p.doutrina === 'confronto' ? 0.06 : p.doutrina === 'prevencao' ? -0.08 : -0.03) - (p0.doutrina === 'confronto' ? 0.06 : 0)) * (1 + (eo.lotacaoPrisional ?? 0));
    ind.lotacaoPrisional = aprox(ind.lotacaoPrisional, clamp(lot, 60, 300), 18);
    const roubos = i0.roubos * (1 - 0.25 * tanh(1.3 * D('seguranca')) + 1.5 * (ind.desemprego - i0.desemprego)) * (p.integracaoDados && !p0.integracaoDados ? 0.88 : 1) * (p.doutrina === 'inteligencia' && p0.doutrina !== 'inteligencia' ? 0.92 : 1) * (1 + (eo.roubos ?? 0)) * (1 + 0.3 * terrCidade);
    ind.roubos = aprox(ind.roubos, Math.max(10, roubos), 8);
    const invSan = this.execucao.saneamento.investimento / this.precos;
    const baseSan = this.cal.investimento.saneamento / 12;
    const pop = Math.max(2e5, this.ini.populacao);
    ind.esgoto = clamp(ind.esgoto + ((invSan - 0.6 * baseSan) / (pop * 2600)) * 100 + 0.01, 0, 98);
    const cid = this.cidadeCtx;
    const fatorCapital = cid && cid.populacao > 5000 && cid.tempoDeslocamento > 0 ? 0.85 + 0.15 * cid.tempoDeslocamento / i0.deslocamento : 1;
    const deslAlvo = i0.deslocamento * (1 - 0.08 * tanh(D('transporte') + ppa('transporte'))) * (1 + (eo.deslocamento ?? 0)) * (1 + 0.6 * (this.pibReal - 1)) * fatorCapital;
    ind.deslocamento = aprox(ind.deslocamento, deslAlvo, 18);
    const pob = i0.pobreza * (1 - 0.3 * tanh(1.2 * D('assistencia') + ppa('assistencia'))) * (1 + 3 * (ind.desemprego - i0.desemprego)) * (1 + (eo.pobreza ?? 0))
      * (this.politicas.rendaEstadual ? 0.75 : 1);
    ind.pobreza = aprox(ind.pobreza, clamp(pob, 0.3, 30), 10);
    const des = i0.desemprego - 0.8 * (this.gEstado - 0.02) + (eo.desemprego ?? 0) - 0.01 * tanh(D('desenvolvimento') + ppa('desenvolvimento'));
    ind.desemprego = aprox(ind.desemprego, clamp(des, 0.025, 0.25), 8);
    ind.crescimentoPIB = this.gEstado;
  }

  /** Choques de eventos sobre indicadores: deslocam o valor e decaem. */
  private aplicarChoquesInd() {
    for (const k of Object.keys(this.choqueInd) as (keyof Indicadores)[]) {
      const c = this.choqueInd[k] ?? 0;
      if (Math.abs(c) < 0.002) { delete this.choqueInd[k]; continue; }
      this.ind[k] *= 1 + c * 0.25;
      this.choqueInd[k] = c * 0.8;
    }
    this.choquePib *= 0.85;
  }

  /** Efeitos de um storylet no Governo do Estado (o resto é aplicado pela Simulation). */
  aplicarEfeitos(ef: Efeitos) {
    if (ef.aprovacao) this.choque(ef.aprovacao, 4);
    for (const [g, v] of Object.entries(ef.grupos ?? {})) if (v) this.choque(v, 4, g as keyof GruposAprovacao);
    if (ef.caixa) this.caixa += ef.caixa * this.rcl12;
    if (ef.capital) this.pol.capital = clamp(this.pol.capital + ef.capital, 0, 100);
    if (ef.base) for (const d of this.pol.deputados) d.relacao = clamp(d.relacao + ef.base, -1, 1);
    for (const [b, v] of Object.entries(ef.bancadas ?? {})) for (const d of this.pol.deputados) if (d.bancada === b) d.relacao = clamp(d.relacao + v, -1, 1);
    if (ef.prefeito && this.atores.prefeitos[0]) this.atores.prefeitos[0].relacao = clamp(this.atores.prefeitos[0].relacao + ef.prefeito, -1, 1);
    if (ef.prefeitos) for (const p of this.atores.prefeitos) p.relacao = clamp(p.relacao + ef.prefeitos, -1, 1);
    if (ef.presidente) this.atores.presidente.relacao = clamp(this.atores.presidente.relacao + ef.presidente, -1, 1);
    if (ef.imprensa) for (const v of this.atores.imprensa) v.humor = clamp(v.humor + ef.imprensa, -1, 1);
    for (const [k, v] of Object.entries(ef.indicadores ?? {})) this.choqueInd[k as keyof Indicadores] = (this.choqueInd[k as keyof Indicadores] ?? 0) + v;
    if (ef.pib) this.choquePib += ef.pib;
    if (ef.greve) this.greves[ef.greve] = Math.max(this.greves[ef.greve] ?? 0, 2);
    if (ef.calamidade) this.atores.calamidade = Math.max(this.atores.calamidade, ef.calamidade);
    if (ef.forcaNacional) this.atores.forcaNacional = Math.max(this.atores.forcaNacional, ef.forcaNacional);
    this.baseAliada = baseAliada(this.pol);
  }

  private atualizarAtrasos(ctx: ContextoMes) {
    const atrasava = this.atrasoSalarial;
    this.atrasoSalarial = this.caixa < -0.25 * (this.folhaAnual() / 12);
    if (this.caixa < 0 && !atrasava) {
      ctx.noticia(this.atrasoSalarial
        ? 'Sem caixa, governo atrasa salários e escalona o pagamento. Servidores fazem fila na porta do Palácio.'
        : 'Conta única no vermelho: fornecedores sem pagamento e restos a pagar disparam.', 'ruim', 'semcaixa', 45);
      this.choque(this.atrasoSalarial ? -8 : -3, 5, this.atrasoSalarial ? 'servidores' : undefined);
    }
  }

  private choque(valor: number, meia: number, grupo?: keyof GruposAprovacao) {
    if (this.atores) {
      const amp = amplificador(this.atores);
      valor *= valor < 0 ? 1 + 0.35 * amp : 1 - 0.25 * amp;
    }
    this.choques.push({ valor, meia, grupo });
  }

  // ── Calendário fiscal e político ─────────────────────────────────────────────────

  private calendario(ctx: ContextoMes) {
    const { mes, ano, rng, noticia } = ctx;
    this.alertas = [];

    if (mes === 1) {
      // virada do ano: mínimos constitucionais do ano encerrado
      const s = this.anoCorrente.saude / Math.max(1, this.anoCorrente.ril);
      const e = this.anoCorrente.educacao / Math.max(1, this.anoCorrente.ril);
      this.ultimoAno = { saudePct: s, educacaoPct: e };
      if (s < 0.12) { this.descumprimentos++; noticia(`Estado aplicou só ${p1(s)}% em saúde em ${ano - 1} (mínimo: 12%). TCE dá parecer pela rejeição das contas.`, 'ruim', `minS${ano}`, 0); this.choque(-6, 8); }
      if (e < 0.25) { this.descumprimentos++; noticia(`Educação recebeu ${p1(e)}% da receita de impostos em ${ano - 1} (mínimo: 25%). MP pede intervenção.`, 'ruim', `minE${ano}`, 0); this.choque(-6, 8); }
      if (s >= 0.12 && e >= 0.25 && ano > 2027) noticia(`Mínimos cumpridos em ${ano - 1}: saúde ${p1(s)}%, educação ${p1(e)}%.`, 'bom', `minOK${ano}`, 0);
      this.anoCorrente = { ril: 0, saude: 0, educacao: 0 };
      // nova LOA entra em vigor
      if (this.loaStatus === 'enviada' && this.proposta) {
        this.aplicarNovaLOA(this.proposta);
      } else if (this.loaStatus === 'rejeitada') {
        this.duodecimos = true;
        this.loaStatus = 'duodecimos';
        noticia('Sem orçamento aprovado, o Estado começa o ano em regime de duodécimos: só custeio, nenhum investimento novo.', 'ruim', 'duod', 0);
      }
      if (this.regime === 'RRF') {
        this.anosRegime++;
        this.fracPagamento = clamp(this.fracPagamento + 0.111, 0, 1);
        if (this.fracPagamento >= 1) {
          this.regime = 'normal';
          noticia('Estado conclui a transição do RRF e volta a pagar integralmente a dívida com a União.', 'info', 'fimRRF', 0);
        }
      }
      this.contingenciamento = Math.min(this.contingenciamento, 0.3);
    }
    if (mes >= 2 && mes <= 7 && this.loaStatus === 'duodecimos' && this.proposta) {
      // revotação mensal até o recesso de julho
      // pressão cresce a cada mês sem orçamento (servidores, prefeitos, fornecedores)
      this.revotacao = true;
      this.votarLOA(ctx, 0.2 + 0.12 * (mes - 2));
      // votarLOA pode ter mudado o status
      if ((this.loaStatus as string) === 'enviada') { this.aplicarNovaLOA(this.proposta); this.duodecimos = false; }
    }
    if (mes === 4) noticia(`Prazo da LDO ${ano + 1}: defina a meta fiscal até 15 de abril (painel Governo → Orçamento).`, 'info', `ldo${ano}`, 300);
    if (mes === 5 && !this.ldoDefinida) {
      this.metaLDO = 'equilibrada'; this.ldoDefinida = true;
      noticia(`Casa Civil envia a LDO ${ano + 1} com meta "equilibrada" por falta de definição do Palácio.`, 'info', `ldoAuto${ano}`, 300);
    }
    if (mes === 8) {
      this.loaStatus = 'janela';
      this.proposta = null;
      this.pol.pauta = this.pol.pauta.filter((p) => p.tipo !== 'loa');
      noticia(`Começa a elaboração do orçamento ${ano + 1}. A proposta de LOA precisa chegar à Assembleia até 31 de agosto.`, 'info', `loaJan${ano}`, 300);
      if (ano === 2027 && !this.ppaDefinido) noticia('Primeiro ano de mandato: o PPA 2028–2031 vai junto com a LOA. Escolha até 3 eixos estratégicos.', 'info', 'ppa', 999);
    }
    if (mes === 9 && this.loaStatus === 'janela') {
      // prazo estourado: governo envia a LOA "inercial"
      this.proposta = this.loaInercial(ano + 1);
      this.loaStatus = 'enviada';
      if (ano === 2027 && !this.ppaDefinido) { this.ppaEixos = ['saude', 'seguranca', 'educacao']; this.ppaDefinido = true; }
      noticia(`No último dia do prazo, a Fazenda envia uma LOA ${ano + 1} "copia e cola" do ano anterior, corrigida pela inflação.`, 'alerta', `loaAuto${ano}`, 300);
    }
    if (mes === 12 && this.loaStatus === 'enviada' && this.proposta) this.votarLOA(ctx, 0);

    // RGF quadrimestral (publicado após abril, agosto e dezembro)
    if (mes === 5 || mes === 9 || mes === 1) this.checarLRF(ctx);

    // IDEB (biênios ímpares, divulgado em setembro do ano seguinte)
    if (mes === 9 && ano % 2 === 0) {
      const v = Math.round(this.ind.ideb * 10) / 10;
      const ant = this.idebDivulgado?.valor ?? this.ind0.ideb;
      this.idebDivulgado = { ano: ano - 1, valor: v };
      noticia(`INEP divulga o IDEB ${ano - 1}: ensino médio estadual com nota ${v.toFixed(1).replace('.', ',')} (antes: ${ant.toFixed(1).replace('.', ',')}).`, v > ant ? 'bom' : v < ant ? 'ruim' : 'info', `ideb${ano}`, 0);
      this.choque(v > ant ? 3 : v < ant ? -3 : 0, 4, 'classeMedia');
    }

    if (this.politicas.gestaoSaude === 'os' && rng.chance(0.006)) {
      noticia('Operação da PF investiga desvio em contrato de Organização Social que gere hospitais estaduais. Secretário de Saúde fala em "caso isolado".', 'ruim', 'osEscandalo', 120);
      this.choque(-4, 6);
    }

    // greves em andamento
    for (const c of CARREIRAS) if (this.greves[c.id] && rng.chance(0.5)) {
      noticia(`Greve: ${c.nome.toLowerCase()} cruzam os braços por reajuste. ${c.id === 'educacao' ? 'Escolas fechadas e pais sem saber onde deixar os filhos.' : c.id === 'seguranca' ? 'Operação-padrão nas delegacias e quartéis aquartelados.' : c.id === 'saude' ? 'Só emergências funcionam nos hospitais estaduais.' : 'Serviços administrativos param.'}`, 'ruim', `greve${c.id}`, 45);
      this.choque(-2, 2);
    }


    // alertas permanentes
    const p = this.pessoalPct;
    if (p > LIMITE_MAX_PESSOAL) this.alertas.push(`Pessoal em ${p1(p)}% da RCL — acima do limite máximo da LRF (49%)`);
    else if (p > LIMITE_PRUDENCIAL) this.alertas.push(`Pessoal em ${p1(p)}% da RCL — limite prudencial: reajustes e concursos vedados`);
    else if (p > LIMITE_ALERTA) this.alertas.push(`Pessoal em ${p1(p)}% da RCL — limite de alerta`);
    if (this.dclPct > 2) this.alertas.push(`Dívida líquida em ${(this.dclPct * 100).toFixed(0)}% da RCL — acima de 200%: novas operações de crédito vedadas`);
    if (this.caixa < 0) this.alertas.push('Caixa negativo: atrasos com fornecedores' + (this.atrasoSalarial ? ' e salários' : ''));
    if (this.duodecimos) this.alertas.push('Orçamento não aprovado: regime de duodécimos');
    const sAno = this.anoCorrente.saude / Math.max(1, this.anoCorrente.ril), eAno = this.anoCorrente.educacao / Math.max(1, this.anoCorrente.ril);
    if (this.anoCorrente.ril > 0 && mes > 3 && sAno < 0.12) this.alertas.push(`Saúde em ${p1(sAno)}% no ano (mínimo 12%)`);
    if (this.anoCorrente.ril > 0 && mes > 3 && eAno < 0.25) this.alertas.push(`Educação em ${p1(eAno)}% no ano (mínimo 25%)`);
  }

  private checarLRF(ctx: ContextoMes) {
    const p = this.pessoalPct;
    const q = ctx.mes === 5 ? '1º' : ctx.mes === 9 ? '2º' : '3º';
    if (p > LIMITE_MAX_PESSOAL) {
      ctx.noticia(`RGF do ${q} quadrimestre: pessoal em ${p1(p)}% da RCL, acima do teto da LRF. Estado tem dois quadrimestres para se enquadrar ou perde transferências voluntárias.`, 'ruim', `lrf${ctx.ano}${q}`, 0);
      this.choque(-3, 6, 'empresariado');
    } else if (p > LIMITE_PRUDENCIAL) {
      ctx.noticia(`TCE emite alerta: gasto com pessoal (${p1(p)}% da RCL) passou do limite prudencial.`, 'alerta', `lrfP${ctx.ano}${q}`, 0);
    }
  }

  private aplicarNovaLOA(p: PropostaLOA) {
    this.loaAnterior = this.loa;
    this.loa = p;
    this.loaStatus = 'vigente';
    this.duodecimos = false;
    for (const c of CARREIRAS) this.salario[c.id] *= 1 + p.reajuste[c.id];
    if (p.aliquotaPrevidencia > this.aliquotaPrev + 1e-6) this.choque(-4, 6, 'servidores');
    this.aliquotaPrev = p.aliquotaPrevidencia;
    this.quadroInicioAno = { ...this.servidores };
  }

  /**
   * Proposta "inercial" que a Fazenda monta se o Palácio não decidir: LOA vigente corrigida pelo
   * crescimento nominal esperado da receita, revisão geral dos salários e ajuste para cumprir os
   * mínimos de saúde e educação.
   */
  loaInercial(ano: number): PropostaLOA {
    const f = 1 + this.ipca + (this.regime === 'RRF' ? 0 : 0.025);
    const L = this.loa;
    const mult = (o: Record<Area, number>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v * f])) as Record<Area, number>;
    const p = this.loaInercialBruta(ano, L, mult);
    const snap = this.snapshot();
    for (let i = 0; i < 6; i++) {
      const pr = projetarLOA(snap, p);
      if (pr.saudePct < 0.125) p.custeio.saude *= 1 + Math.min(0.5, (0.125 - pr.saudePct) / Math.max(0.01, pr.saudePct) * 2.2);
      if (pr.educacaoPct < 0.255) p.custeio.educacao *= 1 + Math.min(0.5, (0.255 - pr.educacaoPct) / Math.max(0.01, pr.educacaoPct) * 2.2);
      if (pr.saudePct >= 0.125 && pr.educacaoPct >= 0.255) break;
    }
    // no RRF, cabe no teto cortando as demais pastas (saúde e educação preservadas)
    const teto = tetoRRF(snap, p);
    if (teto && !teto.ok) {
      const protegidas: Area[] = ['saude', 'educacao'];
      const resto = AREAS.filter((a) => !protegidas.includes(a.id)).reduce((s, a) => s + p.custeio[a.id] + p.investimento[a.id], 0);
      const k = Math.max(0.5, 1 - teto.excesso / Math.max(1, resto));
      for (const a of AREAS) if (!protegidas.includes(a.id)) { p.custeio[a.id] *= k; p.investimento[a.id] *= k; }
    }
    return p;
  }

  private loaInercialBruta(ano: number, L: PropostaLOA, mult: (o: Record<Area, number>) => Record<Area, number>): PropostaLOA {
    const f = 1 + this.ipca + (this.regime === 'RRF' ? 0 : 0.025);
    return {
      ...L, ano,
      // revisão geral anual (CF art. 37, X) pela inflação
      reajuste: { educacao: this.ipca, saude: this.ipca, seguranca: this.ipca, demais: this.ipca },
      quadro: { educacao: 0, saude: 0, seguranca: 0, demais: 0 },
      custeio: mult(L.custeio), investimento: mult(L.investimento),
      programaCapital: L.programaCapital * f, emendas: L.emendas * f,
    };
  }

  /** Probabilidade de aprovação da LOA na ALE (logística). */
  chanceLOA(p: PropostaLOA, bonus = 0): number {
    return chanceLOA(this.snapshot(), p, bonus);
  }

  private votarLOA(ctx: ContextoMes, bonus: number) {
    const p = this.proposta!;
    const proj = projetoLOA(this.snapshot(), p);
    proj.dataVotacao = `dez/${ctx.ano}`;
    const v = votar(this.pol, proj, { aprovacao: this.aprovacao, bonus }, ctx.rng);
    if (v.aprovado) {
      this.loaStatus = 'enviada';
      ctx.noticia(`ALE aprova a LOA ${p.ano} por ${v.aFavor} votos a ${v.contra}${this.revotacao ? ' em segunda votação' : ''}. Deputados comemoram as emendas.`, 'bom', `loaOk${p.ano}`, 0);
    } else {
      // numa revotação, segue em duodécimos e tenta de novo no mês seguinte
      this.loaStatus = this.duodecimos ? 'duodecimos' : 'rejeitada';
      ctx.noticia(`Derrota no plenário: ALE rejeita a LOA ${p.ano} por ${v.contra} votos a ${v.aFavor}. Oposição acusa o governo de "orçamento de ficção".`, 'ruim', `loaNo${p.ano}`, this.duodecimos ? 25 : 0);
      this.pol.pauta.push({ ...proj, votaEm: this.mesIndex + 1 });
      this.choque(-3, 4);
    }
    this.revotacao = false;
  }

  private atualizarAprovacao(ctx: ContextoMes) {
    const i = this.ind, i0 = this.ind0;
    const L = this.loa;
    const ganhoReal = CARREIRAS.reduce((s, c) => s + (this.salario[c.id] / this.salarioInicial[c.id]) / this.precos - 1, 0) / CARREIRAS.length;
    const concursos = CARREIRAS.some((c) => L.quadro[c.id] > 0) ? 4 : 0;
    const alvo: GruposAprovacao = {
      servidores: 50 + 220 * ganhoReal - (this.atrasoSalarial ? 30 : 0) - (this.mesIndex - this.mesReforma < 12 ? 12 : 0) + concursos - (this.regime === 'RRF' ? 5 : 0),
      empresariado: 52 - 260 * (L.aliquotaICMS - this.cal.aliquotaICMS0) + 120 * L.incentivos + 500 * (this.gEstado - 0.02) - (this.caixa < 0 ? 12 : 0) + (this.capag() <= 'B' ? 4 : -4),
      classeMedia: 50 + 26 * (1 - i.homicidios / i0.homicidios) + 18 * (1 - i.esperaEmergencia / i0.esperaEmergencia) + 40 * (1 - i.deslocamento / i0.deslocamento)
        + 12 * (i.ideb - i0.ideb) - 450 * (L.aliquotaIPVA - this.cal.aliquotaIPVA0) - 100 * Math.max(0, L.aliquotaICMS - this.cal.aliquotaICMS0),
      baixaRenda: 50 + 25 * (1 - i.pobreza / i0.pobreza) + 18 * (1 - i.esperaEmergencia / i0.esperaEmergencia) + 15 * (1 - i.homicidios / i0.homicidios)
        - 260 * (i.desemprego - i0.desemprego) + 0.5 * (i.esgoto - i0.esgoto) + 10 * (1 - i.mortalidadeInfantil / i0.mortalidadeInfantil),
    };
    // políticas das secretarias
    const p = this.politicas, p0 = this.politicas0;
    if (p.cameras && !p0.cameras) { alvo.servidores -= 3; alvo.baixaRenda += 2; }
    if (p.doutrina === 'confronto') { alvo.classeMedia += 3; alvo.baixaRenda -= 3; }
    if (p.doutrina === 'prevencao') { alvo.baixaRenda += 2; alvo.classeMedia -= 1; }
    if (p.bonusProfessor && !p0.bonusProfessor) { alvo.servidores -= 3; alvo.classeMedia += 2; }
    if (p.gestaoSaude === 'os' && p0.gestaoSaude === 'direta') alvo.servidores -= 3;
    if (p.rendaEstadual) { alvo.baixaRenda += 6; alvo.empresariado -= 1; }
    alvo.classeMedia -= 6 * (this.ind.roubos / this.ind0.roubos - 1);
    alvo.baixaRenda -= 3 * (this.ind.letalidade / Math.max(0.1, this.ind0.letalidade) - 1);
    alvo.classeMedia -= 8 * (this.ind.filaCirurgias / Math.max(0.1, this.ind0.filaCirurgias) - 1);
    const luaDeMel = 10 * Math.max(0, 1 - (this.mesIndex - this.mesPosse) / 8);
    // choques decaem exponencialmente
    let geral = 0;
    const porGrupo: Partial<Record<keyof GruposAprovacao, number>> = {};
    for (const c of this.choques) {
      if (c.grupo) porGrupo[c.grupo] = (porGrupo[c.grupo] ?? 0) + c.valor * 2.5; else geral += c.valor;
      c.valor *= Math.pow(0.5, 1 / c.meia);
    }
    this.choques = this.choques.filter((c) => Math.abs(c.valor) > 0.1);
    for (const k of Object.keys(alvo) as (keyof GruposAprovacao)[]) {
      const t = clamp(alvo[k] + luaDeMel + geral + (porGrupo[k] ?? 0), 2, 98);
      this.grupos[k] += (t - this.grupos[k]) * 0.2;
    }
    let ap = Object.entries(PESOS_GRUPOS).reduce((s, [k, w]) => s + this.grupos[k as keyof GruposAprovacao] * w, 0);
    if (ctx.aprovacaoCidade !== null) ap = ap * 0.92 + ctx.aprovacaoCidade * 0.08;
    this.aprovacao = clamp(ap, 3, 97);
  }

  // ── Ações do jogador ─────────────────────────────────────────────────────────────

  acao(a: AcaoEstado, ctx: Omit<ContextoMes, 'aprovacaoCidade'>): { ok: boolean; msg?: string } {
    const { noticia } = ctx;
    switch (a.tipo) {
      case 'propor-loa': {
        if (this.loaStatus !== 'janela' && this.loaStatus !== 'duodecimos') return { ok: false, msg: 'A proposta de LOA só pode ser enviada entre 1º e 31 de agosto (ou em duodécimos).' };
        const p = this.validarLOA(a.proposta);
        if (typeof p === 'string') return { ok: false, msg: p };
        this.proposta = p;
        if (this.loaStatus === 'janela') this.loaStatus = 'enviada';
        // a proposta entra na pauta da ALE: dá para negociar votos até a votação
        this.pol.pauta = this.pol.pauta.filter((x) => x.tipo !== 'loa');
        const proj = projetoLOA(this.snapshot(ctx.ano, ctx.mes), p);
        proj.dataVotacao = this.loaStatus === 'duodecimos' ? `${MESES[ctx.mes % 12]}/${ctx.mes === 12 ? ctx.ano + 1 : ctx.ano}` : `dez/${ctx.ano}`;
        this.pol.pauta.push(proj);
        noticia(`Governo entrega à ALE a proposta de LOA ${p.ano}. Relator promete parecer até dezembro.`, 'info', `loaEnv${p.ano}`, 0);
        return { ok: true };
      }
      case 'contingenciar': {
        const pct = clamp(a.pct, 0, 0.4);
        if (pct > this.contingenciamento + 0.001) noticia(`Decreto de contingenciamento congela ${Math.round(pct * 100)}% do custeio e dos investimentos.`, 'alerta', `cont${Math.round(pct * 100)}`, 30);
        this.contingenciamento = pct;
        return { ok: true };
      }
      case 'iniciar-obra': {
        const d = obraDef(a.id);
        if (!d) return { ok: false, msg: 'Obra desconhecida' };
        if (d.popMin && this.ini.populacao < d.popMin) return { ok: false, msg: 'Esta obra não se justifica no porte do estado' };
        if (this.obras.some((o) => o.id === a.id && o.fase !== 'concluida')) return { ok: false, msg: 'Já existe uma obra dessas em andamento' };
        if (this.duodecimos) return { ok: false, msg: 'Em duodécimos não é possível licitar obras novas' };
        this.obras.push({ uid: this.nextObra++, id: a.id, fase: 'licitacao', progresso: 0, custoTotal: d.custo, gasto: 0, mesesLicitacao: ctx.rng.int(2, 4) + (d.ambiental ? 2 : 0), mesesParada: 0, mesesRuins: 0, iniciadaEm: `${MESES[ctx.mes - 1]}/${ctx.ano}` });
        noticia(`Governo publica edital de "${d.nome}" (${(d.custo / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} milhões).`, 'info', `edital${a.id}`, 0);
        return { ok: true };
      }
      case 'emprestimo': {
        if (this.dclPct > 2) return { ok: false, msg: 'Dívida acima de 200% da RCL: operação de crédito vedada (Res. Senado 40/2001)' };
        const cap = this.capag();
        if ((a.credor === 'bird' || a.credor === 'bndes') && cap !== 'A' && cap !== 'B') return { ok: false, msg: `CAPAG ${cap}: sem garantia da União para ${a.credor.toUpperCase()}` };
        if (this.regime === 'RRF') return { ok: false, msg: 'No RRF, operações de crédito dependem do Conselho de Supervisão (indisponível)' };
        if (this.pol.pauta.some((p) => p.tipo === 'credito')) return { ok: false, msg: 'Já há um pedido de empréstimo aguardando votação na ALE' };
        const valor = clamp(a.valor, 50e6, this.rcl12 * 0.15);
        const nomeCredor = a.credor === 'bird' ? 'o Banco Mundial' : a.credor === 'bndes' ? 'o BNDES' : 'bancos privados';
        this.pol.pauta.push({
          id: `cred-${this.mesIndex}`, tipo: 'credito', titulo: `Empréstimo de R$ ${(valor / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} mi com ${nomeCredor}`,
          descricao: 'Operação de crédito precisa de autorização legislativa (maioria simples).', quorum: 'simples',
          eixos: { credito: 1, deficit: 0.3, emendas: 0.25 }, governoQuer: 'sim', gravidade: 0, votaEm: this.mesIndex + 1, dataVotacao: `${MESES[ctx.mes % 12]}/${ctx.mes === 12 ? ctx.ano + 1 : ctx.ano}`,
          ref: { valor, credor: a.credor },
        });
        noticia(`Governo envia à ALE pedido de autorização para empréstimo com ${nomeCredor}.`, 'info', `credEnv${this.mesIndex}`, 0);
        return { ok: true, msg: 'Enviado à Assembleia: votação no próximo mês' };
      }
      case 'regime': {
        if (a.regime === this.regime) return { ok: false, msg: 'O estado já está nesse regime' };
        if (a.regime === 'RRF') {
          if (this.dclPct < 1.0 && this.caixa > 0 && this.pessoalPct < 0.6) return { ok: false, msg: 'Requisitos do RRF não atendidos (desequilíbrio grave exigido)' };
          this.regime = 'RRF'; this.fracPagamento = 0; this.anosRegime = 0;
          noticia('Estado adere ao Regime de Recuperação Fiscal: dívida com a União suspensa, mas com teto de gastos e reajustes congelados.', 'alerta', 'rrf', 0);
          this.choque(-6, 8, 'servidores');
          return { ok: true };
        }
        // PROPAG (LC 212/2025, simplificado): federaliza ativos (10% da dívida) e reduz juros reais a 2% a.a.
        const ativos = this.dividaUniao * 0.1;
        this.dividaUniao -= ativos;
        this.cal.patrimonial *= 0.94;
        this.jurosReaisUniao = 0.02;
        // sai do RRF (se estava) e passa a pagar a parcela cheia, com juros menores
        if (this.regime === 'RRF') this.fracPagamento = 1;
        this.regime = 'PROPAG';
        noticia(`Estado adere ao PROPAG: entrega ativos de R$ ${(ativos / 1e9).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} bi à União e os juros reais caem de 4% para 2% ao ano.`, 'bom', 'propag', 0);
        this.choque(3, 6, 'empresariado');
        return { ok: true };
      }
      case 'reforma-previdencia': {
        if (this.reformaPrevidencia) return { ok: false, msg: 'A reforma já foi aprovada' };
        if (this.pol.pauta.some((p) => p.tipo === 'pec-previdencia')) return { ok: false, msg: 'A PEC já está na pauta da ALE' };
        this.pol.pauta.push({
          id: `pec-prev-${this.mesIndex}`, tipo: 'pec-previdencia', titulo: 'PEC da Previdência estadual',
          descricao: 'Idade mínima maior e alíquota progressiva de até 16%. Emenda à Constituição estadual: 3/5 da Assembleia.',
          quorum: '3/5', eixos: { servidores: -1.5, deficit: -0.8 }, governoQuer: 'sim', gravidade: 0, votaEm: this.mesIndex + 1,
          dataVotacao: `${MESES[ctx.mes % 12]}/${ctx.mes === 12 ? ctx.ano + 1 : ctx.ano}`,
        });
        noticia('Governo envia à ALE a PEC da Previdência estadual. Sindicatos convocam vigília nas galerias.', 'alerta', `prevEnv${this.mesIndex}`, 0);
        this.choque(-3, 4, 'servidores');
        return { ok: true, msg: 'PEC enviada: votação no próximo mês (precisa de 3/5 dos deputados)' };
      }
      case 'ldo': {
        this.metaLDO = a.meta;
        this.ldoDefinida = true;
        noticia(`LDO define meta fiscal "${a.meta}" para o próximo ano.`, 'info', `ldoMeta${this.mesIndex}`, 0);
        return { ok: true };
      }
      case 'politica': {
        const antes = { ...this.politicas };
        this.politicas = { ...this.politicas, ...a.politicas, tempoIntegral: clamp(a.politicas.tempoIntegral ?? this.politicas.tempoIntegral, 0, 1) };
        const mud: string[] = [];
        if (antes.doutrina !== this.politicas.doutrina) mud.push(`doutrina de segurança: ${{ confronto: 'confronto', inteligencia: 'inteligência e investigação', prevencao: 'prevenção e policiamento comunitário' }[this.politicas.doutrina]}`);
        if (antes.cameras !== this.politicas.cameras) mud.push(this.politicas.cameras ? 'câmeras corporais nas fardas' : 'fim das câmeras corporais');
        if (antes.gestaoSaude !== this.politicas.gestaoSaude) mud.push(this.politicas.gestaoSaude === 'os' ? 'hospitais geridos por Organizações Sociais' : 'volta da gestão direta nos hospitais');
        if (antes.tempoIntegral !== this.politicas.tempoIntegral) mud.push(`${Math.round(this.politicas.tempoIntegral * 100)}% do ensino médio em tempo integral`);
        if (antes.bonusProfessor !== this.politicas.bonusProfessor) mud.push(this.politicas.bonusProfessor ? 'bônus por resultado para professores' : 'fim do bônus de professores');
        if (antes.integracaoDados !== this.politicas.integracaoDados) mud.push(this.politicas.integracaoDados ? 'integração de dados e cerco eletrônico' : 'fim do cerco eletrônico');
        if (antes.rendaEstadual !== this.politicas.rendaEstadual) mud.push(this.politicas.rendaEstadual ? 'programa estadual de renda para famílias em extrema pobreza' : 'fim do programa estadual de renda');
        if (mud.length) noticia(`Governo anuncia: ${mud.join('; ')}.`, 'info', `pol${this.mesIndex}${mud[0]}`, 0);
        this.custoPoliticasMes = this.custosPoliticas().total;
        return { ok: true };
      }
      case 'candidatos': {
        candidatosPara(this.pol, a.cargo, ctx.rng, this.mesIndex, this.cidades);
        return { ok: true };
      }
      case 'nomear': {
        const r = nomear(this.pol, a.cargo, a.indice, this.mesIndex);
        if (r.ok) {
          const s = this.pol.secretarios[a.cargo];
          noticia(`Governador nomeia ${s.nome} (${s.formacao}) para ${CARGOS.find((c) => c.id === a.cargo)!.nome}.`, 'info', `nom${a.cargo}${this.mesIndex}`, 0);
        }
        return r;
      }
      case 'ceder-secretaria': {
        const r = cederSecretaria(this.pol, a.partido, a.cargo, ctx.rng, this.mesIndex, this.cidades);
        if (r.ok) noticia(`Reforma do secretariado: ${r.msg}`, 'info', `ceder${a.cargo}${this.mesIndex}`, 0);
        this.baseAliada = baseAliada(this.pol);
        return r;
      }
      case 'negociar': {
        const r = negociar(this.pol, a.deputado, a.carta, a.projeto, { mesIndex: this.mesIndex, ano: ctx.ano, rng: ctx.rng, escala: this.escalaPolitica, competenciaCasaCivil: this.pol.secretarios.casaCivil.competencia });
        if (r.obra) {
          const uid = this.iniciarObraCustom({ nome: r.obra.nome, area: 'infraestrutura', custo: r.obra.custo, meses: r.obra.meses, custeioAnual: r.obra.custo * 0.02, ref: { tipo: 'deputado', id: r.obra.deputado } }, { ano: ctx.ano, mes: ctx.mes, rng: ctx.rng, noticia });
          const d = this.pol.deputados.find((x) => x.id === r.obra!.deputado)!;
          d.promessas[d.promessas.length - 1].obraUid = uid;
        }
        if (r.vazou) {
          noticia(`Áudio vazado: governo é acusado de pressionar deputado(a) com dossiê. Oposição fala em "chantagem de Estado".`, 'ruim', `vaz${this.mesIndex}`, 0);
          this.choque(-3, 4);
        }
        this.baseAliada = baseAliada(this.pol);
        return { ok: r.ok, msg: r.msg };
      }
      case 'negociar-bancada': {
        let n = 0, total = 0;
        for (const d of this.pol.deputados) if (d.bancada === a.bancada) {
          const r = negociar(this.pol, d.id, a.carta, null, { mesIndex: this.mesIndex, ano: ctx.ano, rng: ctx.rng, escala: this.escalaPolitica, competenciaCasaCivil: this.pol.secretarios.casaCivil.competencia });
          if (r.ok) { n++; total += r.custo ?? 0; }
        }
        if (!n) return { ok: false, msg: 'Ninguém da bancada aceitou (ou a carta já foi usada com todos este ano)' };
        if (a.carta === 'cargo' && n >= 4) noticia(`Imprensa revela "porteira fechada": governo distribui ${n} cargos para a ${a.bancada === 'centrao' ? 'base do Centrão' : 'bancada'} às vésperas de votação.`, 'alerta', `porteira${this.mesIndex}`, 30);
        if (a.carta === 'cargo' && n >= 4) this.choque(-1.5, 3, 'classeMedia');
        this.baseAliada = baseAliada(this.pol);
        return { ok: true, msg: `${n} deputados atendidos${total ? ` · R$ ${(total / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi em emendas` : ''}` };
      }
      case 'convenio': {
        if (ehAnoEleitoral(ctx.ano) && ctx.mes >= 7 && ctx.mes <= 10) return { ok: false, msg: 'Conduta vedada: transferências voluntárias a municípios são proibidas nos 3 meses antes da eleição (Lei 9.504, art. 73)' };
        const p = this.atores.prefeitos[a.prefeito];
        if (!p) return { ok: false, msg: 'Prefeitura não encontrada' };
        const valor = clamp(a.valor, 1e6, this.rcl12 * 0.004);
        this.atores.conveniosAPagar += valor;
        p.convenios += valor;
        const ganho = clamp(valor / (25e6 * this.escalaPolitica), 0.03, 0.3);
        p.relacao = clamp(p.relacao + ganho, -1, 1);
        noticia(`Governo assina convênio de R$ ${(valor / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} milhões com a Prefeitura de ${p.cidade}. ${p.nome} agradece: "${p.bordao}"`, 'info', `conv${a.prefeito}${this.mesIndex}`, 0);
        this.choque(0.6 * ganho * 3, 3, 'baixaRenda');
        return { ok: true, msg: `Convênio assinado com ${p.cidade}` };
      }
      case 'federal': {
        const P = this.atores.presidente;
        if (this.pol.capital < 3) return { ok: false, msg: 'Capital político insuficiente (pedidos a Brasília custam 3)' };
        this.pol.capital -= 3;
        const chance = 1 / (1 + Math.exp(-3 * (P.relacao + (P.alinhamento === 'aliado' ? 0.25 : P.alinhamento === 'opositor' ? -0.25 : 0) + 0.1)));
        if (a.pedido === 'forca-nacional') {
          if (this.atores.forcaNacional > 0) return { ok: false, msg: 'A Força Nacional já está no estado' };
          if (this.ind.homicidios < this.ind0.homicidios * 1.03 && !this.climaMes.enchente) return { ok: false, msg: 'Ministério da Justiça: "não há quadro de excepcionalidade que justifique a Força Nacional"' };
          if (!ctx.rng.chance(chance)) { noticia('Ministério da Justiça nega pedido de Força Nacional; governador reclama de "abandono de Brasília".', 'ruim', `fnNo${this.mesIndex}`, 0); P.relacao = clamp(P.relacao - 0.05, -1, 1); return { ok: false, msg: `Pedido negado (chance era ${Math.round(chance * 100)}%)` }; }
          this.atores.forcaNacional = 4;
          noticia('Força Nacional chega ao estado: 400 agentes reforçam o policiamento nas áreas mais violentas por quatro meses.', 'info', `fn${this.mesIndex}`, 0);
          this.choque(2, 4, 'classeMedia');
          return { ok: true, msg: 'Força Nacional autorizada por 4 meses' };
        }
        if (a.pedido === 'convenio') {
          if (this.mesIndex - this.atores.ultimoConvenioFederal < 12) return { ok: false, msg: 'Já houve um convênio federal nos últimos 12 meses' };
          this.atores.ultimoConvenioFederal = this.mesIndex;
          if (!ctx.rng.chance(chance)) { noticia('Pedido de verba federal para obras fica parado na Esplanada.', 'info', `convFNo${this.mesIndex}`, 0); return { ok: false, msg: `A União não liberou a verba (chance era ${Math.round(chance * 100)}%)` }; }
          const v = this.rcl12 * 0.003;
          this.caixa += v;
          noticia(`União libera R$ ${(v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} milhões em convênios para obras no estado.`, 'bom', `convF${this.mesIndex}`, 0);
          return { ok: true, msg: 'Verba federal liberada' };
        }
        if (this.atores.calamidade <= 0) return { ok: false, msg: 'Socorro federal só com decreto de calamidade pública em vigor' };
        const v = this.rcl12 * 0.005 * (0.6 + 0.8 * chance);
        this.atores.calamidade = 0;
        this.caixa += v;
        noticia(`Governo federal reconhece a calamidade e libera R$ ${(v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} milhões para reconstrução.`, 'bom', `socorro${this.mesIndex}`, 0);
        return { ok: true, msg: 'Socorro federal liberado' };
      }
      case 'presidente': {
        const P = this.atores.presidente;
        const pop = (P.popularidade - 50) / 10;
        if (a.postura === 'apoiar') {
          P.relacao = clamp(P.relacao + 0.25, -1, 1);
          this.choque(pop, 4);
          noticia(`Governador elogia o Presidente ${P.nome.split(' ')[0]} em evento em Brasília: "parceria que funciona".`, 'info', `presAp${this.mesIndex}`, 0);
        } else {
          P.relacao = clamp(P.relacao - 0.3, -1, 1);
          this.choque(-pop, 4);
          noticia(`Governador critica duramente o Presidente ${P.nome.split(' ')[0]}: "o estado foi abandonado pela União".`, 'alerta', `presCr${this.mesIndex}`, 0);
        }
        return { ok: true, msg: a.postura === 'apoiar' ? 'Aproximação com o Planalto' : 'Rompimento público com o Planalto' };
      }
      case 'publicidade': {
        if (ehAnoEleitoral(ctx.ano) && ctx.mes >= 7 && ctx.mes <= 10 && a.valor > 0) return { ok: false, msg: 'Conduta vedada: publicidade institucional suspensa nos 3 meses antes da eleição' };
        this.atores.publicidade = clamp(a.valor, 0, 12e6 * this.escalaPolitica);
        return { ok: true, msg: `Verba de publicidade: R$ ${(this.atores.publicidade / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi/mês` };
      }
      case 'coletiva': {
        if (this.atores.ultimaColetiva === this.mesIndex) return { ok: false, msg: 'Já houve uma coletiva neste mês' };
        this.atores.ultimaColetiva = this.mesIndex;
        const bem = ctx.rng.chance(clamp(0.35 + (this.aprovacao - 40) / 60 + 0.3 * (this.pol.secretarios.casaCivil.competencia - 0.5), 0.1, 0.9));
        for (const v of this.atores.imprensa) v.humor = clamp(v.humor + (bem ? 0.06 : -0.06), -1, 1);
        noticia(bem ? 'Coletiva no Palácio: governador responde a todas as perguntas e sai elogiado pela imprensa.' : 'Coletiva desastrosa: governador perde a paciência com repórter e vídeo viraliza.', bem ? 'bom' : 'ruim', `colet${this.mesIndex}`, 0);
        this.choque(bem ? 1 : -2, 3);
        return { ok: true, msg: bem ? 'A coletiva foi bem' : 'A coletiva deu errado' };
      }
      case 'convencao': {
        const el = this.eleicao;
        if (!el || el.decisao !== null && !(el.decisao === 'sucessor' && el.candidatos[0].origem !== 'sucessor')) return { ok: false, msg: 'Não há convenção aberta' };
        if (a.decisao === 'reeleicao') {
          if (this.mandato >= 2) return { ok: false, msg: 'A Constituição permite uma única reeleição consecutiva' };
          el.decisao = 'reeleicao';
          noticia(`Convenção do ${PARTIDOS[this.partidoGov].sigla} confirma: o governador vai disputar a reeleição.`, 'info', `conv${el.ano}`, 0);
          return { ok: true, msg: 'Candidatura à reeleição registrada' };
        }
        const op = el.opcoesSucessor[a.sucessor ?? 0];
        if (!op) return { ok: false, msg: 'Escolha um nome para a sucessão' };
        const c = el.candidatos[0];
        Object.assign(c, { origem: 'sucessor', partido: op.partido, ideologia: op.ideologia, carisma: op.carisma, urna: op.nome.split(' ').slice(0, 2).join(' '),
          pessoa: { ...c.pessoa, nome: op.nome, retrato: hash32Simples(op.nome), bordao: 'Continuar o que está dando certo.' } });
        el.decisao = 'sucessor';
        noticia(`Governador lança ${op.nome} (${op.perfil}) como candidato(a) à sucessão.`, 'info', `conv${el.ano}`, 0);
        return { ok: true, msg: `${op.nome} é o(a) candidato(a) do governo` };
      }
      case 'campanha-visita': {
        const el = this.eleicao;
        const c = el?.candidatos.find((x) => x.doJogador && x.ativo);
        if (!el || !c || (el.fase !== 'campanha' && el.fase !== 'segundoTurno')) return { ok: false, msg: 'Só durante a campanha' };
        if (el.visitas <= 0) return { ok: false, msg: 'A agenda da semana está cheia (3 visitas)' };
        const m = this.ini.eleitorado!.municipios.find((x) => x.ibge === a.ibge);
        if (!m) return { ok: false, msg: 'Município não encontrado' };
        el.visitas--;
        c.agenda[a.ibge] = (c.agenda[a.ibge] ?? 0) + 0.16;
        c.momento += 0.004;
        el.log.unshift({ data: `${ctx.mes}/${ctx.ano}`, texto: `Caminhada e comício em ${m.nome}.` });
        return { ok: true, msg: `Agenda em ${m.nome}` };
      }
      case 'campanha-tema': {
        if (!this.eleicao) return { ok: false, msg: 'Não há eleição' };
        this.eleicao.tema = a.tema;
        return { ok: true, msg: `Horário eleitoral: ${TEMAS[a.tema].nome}` };
      }
      case 'debate': {
        if (!this.eleicao) return { ok: false, msg: 'Não há eleição' };
        const r = responderDebate(this.eleicao, a.opcao);
        if (r.fim) {
          const d = this.eleicao.debates[this.eleicao.debates.length - 1];
          noticia(`Debate na TV: ${d.resumo}`, d.placar > 0.03 ? 'bom' : d.placar < -0.02 ? 'ruim' : 'info', `deb${this.eleicao.ano}${d.turno}`, 0);
        }
        return r;
      }
      case 'apoio-2turno': {
        if (!this.eleicao) return { ok: false, msg: 'Não há eleição' };
        if (this.pol.capital < 6) return { ok: false, msg: 'Capital político insuficiente (precisa de 6)' };
        this.pol.capital -= 6;
        const r = pedirApoio(this.eleicao, a.candidato, ctx.rng);
        noticia(r.msg, r.ok ? 'bom' : 'info', `apoio${a.candidato}${this.mesIndex}`, 0);
        return r;
      }
      case 'mutirao': {
        if (this.mutiraoMeses > 0) return { ok: false, msg: 'Já há um mutirão em andamento' };
        this.mutiraoMeses = 3;
        this.custoPoliticasMes = this.custosPoliticas().total;
        noticia(`Mutirão de cirurgias eletivas: hospitais estaduais funcionam à noite e nos fins de semana para zerar a fila de ${Math.round(this.ind.filaCirurgias * 1000).toLocaleString('pt-BR')} pacientes.`, 'bom', `mutirao${this.mesIndex}`, 0);
        this.choque(3, 4, 'baixaRenda');
        return { ok: true };
      }
      case 'ppa': {
        if (this.ppaDefinido) return { ok: false, msg: 'O PPA já foi enviado' };
        this.ppaEixos = a.eixos.slice(0, 3);
        this.ppaDefinido = true;
        noticia(`PPA 2028–2031 prioriza ${this.ppaEixos.map((e) => AREAS.find((x) => x.id === e)!.nome.toLowerCase()).join(', ')}.`, 'info', 'ppaOk', 0);
        return { ok: true };
      }
    }
  }

  /** Aplica as travas legais sobre a proposta. Retorna mensagem de erro ou a proposta ajustada. */
  validarLOA(p: PropostaLOA): PropostaLOA | string {
    const q: PropostaLOA = structuredClone(p);
    q.aliquotaICMS = clamp(q.aliquotaICMS, 0.17, 0.25);
    q.aliquotaIPVA = clamp(q.aliquotaIPVA, 0.01, 0.05);
    q.aliquotaITCMD = clamp(q.aliquotaITCMD, 0.02, 0.08);
    q.incentivos = clamp(q.incentivos, 0, 0.15);
    q.aliquotaPrevidencia = clamp(q.aliquotaPrevidencia, 0.14, 0.22);
    const prudencial = this.pessoalPct > LIMITE_PRUDENCIAL;
    for (const c of CARREIRAS) {
      q.reajuste[c.id] = clamp(q.reajuste[c.id], 0, 0.25);
      q.quadro[c.id] = clamp(q.quadro[c.id], -0.1, 0.15);
      if (prudencial || this.regime === 'RRF') {
        // LRF art. 22 / LC 159: só revisão geral anual e reposição de vagas
        q.reajuste[c.id] = Math.min(q.reajuste[c.id], this.ipca);
        q.quadro[c.id] = Math.min(q.quadro[c.id], 0);
      }
    }
    for (const a of AREAS) { q.custeio[a.id] = Math.max(0, q.custeio[a.id]); q.investimento[a.id] = Math.max(0, q.investimento[a.id]); }
    const teto = tetoRRF(this.snapshot(), q);
    if (teto && !teto.ok) return `No RRF, custeio + investimento não podem crescer acima da inflação (teto de gastos): excesso de ${(teto.excesso / 1e9).toFixed(2).replace('.', ',')} bi.`;
    q.programaCapital = Math.max(0, q.programaCapital);
    q.emendas = clamp(q.emendas, 0, this.rcl12 * 0.02);
    return q;
  }

  // ── Fotografia para a interface ─────────────────────────────────────────────────

  snapshot(ano = 2027, mes = 1): EstadoSnapshot {
    const somaJ = (k: 'receitas' | 'despesas') => {
      const out: Record<string, number> = {};
      for (const m of this.janela) for (const [kk, v] of Object.entries(m[k])) out[kk] = (out[kk] ?? 0) + v;
      return out;
    };
    const ril = Math.max(1, this.anoCorrente.ril);
    const benef12 = this.beneficios * this.precos;
    const S12 = this.folhaAnual();
    const contrib12 = this.cal.kContrib * (this.aliquotaPrev * S12 * 3 + 0.15 * this.aliquotaPrev * benef12) + this.cal.compensacao;
    const cal: EventoCalendario[] = [];
    const prox = (m: number) => (m >= mes ? ano : ano + 1);
    cal.push({ data: `15/04/${prox(4)}`, titulo: 'Envio da LDO', tipo: 'ldo' });
    cal.push({ data: `31/08/${prox(8)}`, titulo: 'Envio da LOA à ALE', tipo: 'loa' });
    cal.push({ data: `15/12/${prox(12)}`, titulo: 'Votação da LOA', tipo: 'votacao' });
    for (const [m, q] of [[5, '1º'], [9, '2º'], [1, '3º']] as const) cal.push({ data: `30/${String(m).padStart(2, '0')}/${prox(m)}`, titulo: `RGF ${q} quadrimestre`, tipo: 'rgf' });
    cal.sort((a, b) => a.data.split('/').reverse().join('').localeCompare(b.data.split('/').reverse().join('')));
    return {
      ano, mes,
      caixa: this.caixa,
      rcl12: this.rcl12,
      receitas12: somaJ('receitas'),
      despesas12: somaJ('despesas'),
      resultadoPrimario12: this.janela.reduce((s, m) => s + m.primario, 0),
      resultadoNominal12: this.janela.reduce((s, m) => s + m.nominal, 0),
      pessoalPctRcl: this.pessoalPct,
      dividaConsolidada: this.dividaConsolidada,
      dclPctRcl: this.dclPct,
      saudePct: this.anoCorrente.ril > 0 ? this.anoCorrente.saude / ril : this.ultimoAno.saudePct,
      educacaoPct: this.anoCorrente.ril > 0 ? this.anoCorrente.educacao / ril : this.ultimoAno.educacaoPct,
      saudePctAno: this.ultimoAno.saudePct,
      educacaoPctAno: this.ultimoAno.educacaoPct,
      capag: this.capag(),
      regime: this.regime,
      jurosReais: this.jurosReaisUniao,
      pagamentoDivida: this.fracPagamento,
      loaVigente: this.loa,
      loaProposta: this.proposta,
      loaStatus: this.loaStatus,
      duodecimos: this.duodecimos,
      contingenciamento: this.contingenciamento,
      metaLDO: this.metaLDO,
      ldoDefinida: this.ldoDefinida,
      ppaEixos: this.ppaEixos,
      ppaDefinido: this.ppaDefinido,
      baseAliada: this.baseAliada,
      pol: this.pol,
      atores: this.atores,
      amplificador: amplificador(this.atores),
      eleicao: this.eleicao,
      mandato: this.mandato,
      partidoGov: this.partidoGov,
      fim: this.fim,
      legado: this.fim ? this.legado() : null,
      historicoEleicoes: this.historicoEleicoes,
      folha: Object.fromEntries(CARREIRAS.map((c) => [c.id, { servidores: Math.round(this.servidores[c.id]), salarioMedio: this.salario[c.id], ganhoReal: (this.salario[c.id] / this.salarioInicial[c.id]) / this.precos - 1 }])) as EstadoSnapshot['folha'],
      inflacaoAcumulada: this.precos - 1,
      previdencia: { beneficios12: benef12, contribuicoes12: contrib12, deficit12: benef12 - contrib12, aliquota: this.aliquotaPrev, reformada: this.reformaPrevidencia },
      indicadores: { ...this.ind },
      indicadoresIniciais: { ...this.ind0 },
      idebDivulgado: this.idebDivulgado,
      aprovacao: this.aprovacao,
      grupos: { ...this.grupos },
      obras: this.obras.map((o) => ({ ...o })),
      execucao: structuredClone(this.execucao),
      historico: this.historico,
      calendario: cal,
      alertas: [...this.alertas],
      pibNominal: this.pibNominal,
      populacao: this.ini.populacao,
      greves: CARREIRAS.filter((c) => (this.greves[c.id] ?? 0) > 0).map((c) => c.id),
      emprestimosPendentes: [...this.emprestimosPendentes],
      politicas: { ...this.politicas },
      custoPoliticasMes: this.custoPoliticasMes,
      calib: {
        aliquotaICMS0: this.cal.aliquotaICMS0, aliquotaIPVA0: this.cal.aliquotaIPVA0, aliquotaITCMD0: this.cal.aliquotaITCMD0,
        kSaude: this.cal.kSaude, kEducacao: this.cal.kEducacao, fracInativosDTP: this.cal.fracInativosDTP, shareDuodecimos: this.cal.shareDuodecimos,
        pessoalPorArea: this.cal.pessoalPorArea, ipca: this.ipca, kMunicipios: this.cal.kMunicipios,
      },
    };
  }

  /** Esgoto atual (dado real projetado) — usado pela Visão Cidade para a poluição da água. */
  get esgotoPct() { return this.ind.esgoto; }

  serialize(): Record<string, unknown> {
    const { ini: _i, cal: _c, ...resto } = this as unknown as Record<string, unknown>;
    return JSON.parse(JSON.stringify({ ...resto, cal: this.cal }));
  }

  static deserialize(ini: EstadoInit, s: Record<string, unknown>): Estado {
    const e = new Estado(ini);
    Object.assign(e, s);
    return e;
  }
}

/**
 * Chance de a ALE aprovar a LOA. Pura: a interface mostra exatamente o número usado na votação.
 * Base aliada e aprovação ajudam; aumento de imposto, déficit projetado e alíquota previdenciária
 * maior atrapalham; emendas parlamentares compram apoio.
 */
export function chanceLOA(s: EstadoSnapshot, p: PropostaLOA, bonus = 0): number {
  return placar(s.pol, projetoLOA(s, p), { aprovacao: s.aprovacao, bonus }).chance;
}

/**
 * A LOA como projeto de lei: em que eixos ela mexe (impostos, déficit, emendas, servidores).
 * Cada bancada pesa esses eixos do seu jeito (ver politica/dados.ts).
 */
export function projetoLOA(s: EstadoSnapshot, p: PropostaLOA): Projeto {
  const V = s.loaVigente;
  const imp = (p.aliquotaICMS - V.aliquotaICMS) * 100 * 0.9 + (p.aliquotaIPVA - V.aliquotaIPVA) * 100 * 0.6;
  const emendasPct = p.emendas / Math.max(1, s.rcl12);
  const proj = projetarLOA(s, p);
  const deficit = proj.resultado < 0 ? Math.min(2, (-proj.resultado / Math.max(1, proj.receitas)) * 15) : 0;
  const prevReforma = p.aliquotaPrevidencia > s.previdencia.aliquota + 1e-6 ? 0.7 : 0;
  const reaj = CARREIRAS.reduce((a, c) => a + p.reajuste[c.id], 0) / CARREIRAS.length;
  return {
    id: `loa-${p.ano}`, tipo: 'loa', titulo: `LOA ${p.ano}`,
    descricao: 'Lei Orçamentária Anual: maioria simples. Sem aprovação, o ano começa em duodécimos.',
    quorum: 'simples', governoQuer: 'sim', gravidade: 0, votaEm: -1, dataVotacao: `dez/${p.ano - 1}`,
    eixos: { impostos: imp, deficit, emendas: (emendasPct - 0.004) * 150, servidores: (reaj - s.calib.ipca) * 10 - prevReforma },
  };
}

/** Teto de gastos do RRF (LC 159/2017): custeio + investimento corrigidos só pela inflação. */
export function tetoRRF(s: EstadoSnapshot, p: PropostaLOA): { ok: boolean; limite: number; proposto: number; excesso: number } | null {
  if (s.regime !== 'RRF') return null;
  const soma = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);
  const limite = (soma(s.loaVigente.custeio) + soma(s.loaVigente.investimento)) * (1 + s.calib.ipca) * 1.001;
  const proposto = soma(p.custeio) + soma(p.investimento);
  return { ok: proposto <= limite, limite, proposto, excesso: Math.max(0, proposto - limite) };
}

/** Obras disponíveis para o porte do estado. */
export function obrasDisponiveis(pop: number) {
  return OBRAS.filter((o) => !o.popMin || pop >= o.popMin);
}

/**
 * Projeção anual de uma proposta de LOA (usada na tela de orçamento e na votação):
 * receitas pela elasticidade das alíquotas, folha com reajustes e concursos, mínimos e LRF.
 */
export function projetarLOA(s: EstadoSnapshot, p: PropostaLOA) {
  const k = s.calib;
  const g = 1 + k.ipca + 0.02;
  const R = s.receitas12;
  const el = (a: number, a0: number, e: number) => Math.pow(a / a0, e);
  const V = s.loaVigente;
  const icms = (R.icms ?? 0) * g * el(p.aliquotaICMS, V.aliquotaICMS, 0.45) * (1 - p.incentivos) / (1 - V.incentivos);
  const ipva = (R.ipva ?? 0) * g * el(p.aliquotaIPVA, V.aliquotaIPVA, 0.85);
  const itcd = (R.itcd ?? 0) * g * el(p.aliquotaITCMD, V.aliquotaITCMD, 0.7);
  const outras = ((R.irrf ?? 0) + (R.royalties ?? 0) + (R.outras ?? 0) + (R.fpe ?? 0) + (R.transferencias ?? 0)) * g;
  const baseMun = 0.25 * (R.icms ?? 0) + 0.5 * (R.ipva ?? 0);
  const transfMun = -(R.municipios ?? 0) * (baseMun > 0 ? (0.25 * icms + 0.5 * ipva) / baseMun : g);
  const fundebLiq = ((R.fundeb ?? 0) + (R.formacaoFundeb ?? 0)) * g * ((icms + ipva + itcd) / Math.max(1, ((R.icms ?? 0) + (R.ipva ?? 0) + (R.itcd ?? 0)) * g));
  const receitas = icms + ipva + itcd + outras - transfMun + fundebLiq;

  let folha = 0;
  const folhaCarreira: Record<string, number> = {};
  for (const [c, f] of Object.entries(s.folha)) {
    const v = f.servidores * (1 + Math.max(0, p.quadro[c as keyof typeof p.quadro]) * 0.5) * f.salarioMedio * (1 + p.reajuste[c as keyof typeof p.reajuste]) * 13.33;
    folhaCarreira[c] = v;
    folha += v;
  }
  const patronal = 2 * p.aliquotaPrevidencia * folha;
  const previdencia = Math.max(0, s.previdencia.beneficios12 * (1 + k.ipca) * 1.03 - s.previdencia.contribuicoes12 * (p.aliquotaPrevidencia / s.previdencia.aliquota) * (folha / Math.max(1, Object.values(s.folha).reduce((a, f) => a + f.servidores * f.salarioMedio * 13.33, 0))));
  const custeio = Object.values(p.custeio).reduce((a, b) => a + b, 0);
  const investimento = Object.values(p.investimento).reduce((a, b) => a + b, 0);
  const divida = ((s.despesas12.juros ?? 0) + (s.despesas12.amortizacao ?? 0)) * (1 + k.ipca);
  const rcl = receitas;
  const poderes = k.shareDuodecimos * rcl;
  const despesas = folha + patronal + previdencia + custeio + investimento + poderes + p.programaCapital + p.emendas + divida;
  const dtp = folha + patronal + k.fracInativosDTP * s.previdencia.beneficios12 * (1 + k.ipca);
  const ril = icms + ipva + itcd + (R.irrf ?? 0) * g + (R.fpe ?? 0) * g - transfMun;
  const area = (a: 'saude' | 'educacao', c: 'saude' | 'educacao') => folhaCarreira[c] * (1 + 2 * p.aliquotaPrevidencia) + p.custeio[a] + p.investimento[a];
  return {
    receitas, despesas, resultado: receitas - despesas,
    pessoalPct: dtp / Math.max(1, rcl),
    saudePct: (k.kSaude * area('saude', 'saude')) / Math.max(1, ril),
    educacaoPct: (k.kEducacao * area('educacao', 'educacao')) / Math.max(1, ril),
    icms, ipva, itcd, folha: folha + patronal, previdencia, custeio, investimento, poderes, divida,
  };
}

/** Semente estável a partir de um nome (retrato do sucessor). */
function hash32Simples(t: string): number {
  let h = 2166136261;
  for (let i = 0; i < t.length; i++) h = Math.imul(h ^ t.charCodeAt(i), 16777619);
  return h >>> 0;
}
