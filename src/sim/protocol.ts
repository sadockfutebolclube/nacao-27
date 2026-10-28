import type { CidadeReal } from '../data/cidadeReal';
import type { NormaisUF } from '../data/clima';
import type { ResumoClima } from './clima/clima';
import type { TipoFesta } from './eventos/festas';
import type { Pendente, Registro } from './eventos/motor';
/** Contrato de mensagens entre a thread principal e o Worker de simulação. */
import type { Bioma, ChaveEfeito, SiglaUF, Terreno } from '../data/schemas';
import type { RoadGraphJSON, RoadRequest } from '../world/roads';
import type { EstadoInit } from './estado/calibracao';
import type { AcaoEstado, EstadoSnapshot } from './estado/tipos';
import type { PoliticaVans, ResumoTerritorio } from './city/territorio';
import type { ResumoServicos } from './city/servicos';
import type { ResumoMobilidade, TipoLinha } from './city/transporte';
import type { StatusFavela } from './city/favelas';

export type ModoJogo = 'mandato' | 'sandbox';

export interface SimInit {
  sigla: SiglaUF;
  nomeEstado: string;
  cidade: string;
  /** Fase 11: código IBGE da cidade real (ruas e prédios do OpenStreetMap); ausente = mapa procedural */
  cidadeReal?: string;
  /** a cidade construída é a capital? (Fase 8; ausente em saves antigos = sim) */
  capital?: boolean;
  terreno: Terreno;
  bioma: Bioma;
  latitude: number;
  efeitos: Partial<Record<ChaveEfeito, number>>;
  /** % de esgoto coletado na UF (dado real) — define a poluição inicial da água. */
  esgotoUF: number;
  festas: string[];
  regiao: string;
  seed: number;
  modo: ModoJogo;
  /** Governo estadual com dados reais do SICONFI (ausente em testes só de cidade). */
  estado?: EstadoInit;
  /** normais climatológicas da capital (ERA5 1991–2020); ausente = clima sintético pela latitude */
  clima?: NormaisUF;
}

export type Command =
  | { kind: 'road'; req: RoadRequest }
  | { kind: 'zone'; x: number; z: number; radius: number; zone: number }
  | { kind: 'service'; eq: string; x: number; z: number }
  | { kind: 'bulldoze'; x: number; z: number }
  | { kind: 'estado'; acao: AcaoEstado }
  | { kind: 'evento'; uid: number; escolha: number }
  | { kind: 'operacao'; x: number; z: number }
  | { kind: 'favela'; id: number; acao: 'urbanizar' | 'regularizar' | 'remover' }
  | { kind: 'linha'; tipo: TipoLinha; paradas: { x: number; z: number }[] }
  | { kind: 'linha-remover'; id: number }
  | { kind: 'linha-frota'; id: number; frota: number }
  | { kind: 'transporte-politica'; tarifa?: number; vans?: PoliticaVans };

export interface Ledger {
  receitas: { icms: number; consumo: number; tarifas: number; repasse: number; royalties: number; passagens: number };
  despesas: { vias: number; equipamentos: number; divida: number; transporte: number };
  investimentos: number;
  saldo: number;
}

export interface Noticia {
  id: number;
  data: string;
  texto: string;
  /** veículo fictício que deu a notícia (Fase 6) */
  fonte?: string;
  tom: 'bom' | 'ruim' | 'alerta' | 'info';
}

export interface RedeStats { capacidade: number; uso: number; atendidos: number; total: number }

export interface Stats {
  dia: number; mes: number; ano: number; tick: number;
  populacao: number;
  empregos: number;
  empregados: number;
  desemprego: number;
  demanda: { r: number; c: number; i: number };
  caixa: number;
  sandbox: boolean;
  ultimoBalanco: Ledger | null;
  mesCorrente: Ledger;
  aprovacao: number;
  agua: RedeStats;
  energia: RedeStats;
  esgoto: RedeStats & { tratadoPct: number };
  poluicaoAgua: number;
  edificios: number;
  emObra: number;
  lotes: number;
  lotesZoneados: number;
  valorSoloMedio: number;
  historico: { rotulo: string; populacao: number; caixa: number; aprovacao: number }[];
  /** satisfação nos bairros da Visão Cidade (a aprovação geral vem do Estado) */
  aprovacaoCidade: number;
  estado: EstadoSnapshot | null;
  populacaoInformal: number;
  cidade: CidadeStats;
  /** Fase 6: tempo, festas, decisões pendentes e efeitos visuais */
  clima: ResumoClima;
  festa: { nome: string; tipo: TipoFesta; dia: number } | null;
  eventos: { pendentes: Pendente[]; historico: Registro[] };
  visuais: { tipo: string; intensidade: number }[];
}

export interface LinhaResumo {
  id: number; nome: string; tipo: TipoLinha; cor: string; status: 'operando' | 'em_obra'; passageirosDia: number; lotacao: number;
  headwayMin: number; frota: number; comprimento: number; paradas: number;
}

export interface FavelaResumo {
  id: number; nome: string; status: StatusFavela; grupo: 1 | 2; cx: number; cz: number; populacao: number; casas: number;
  regularizada: boolean; risco: number; crime: number; cobertura: { saude: number; educacao: number; seguranca: number }; mortosDeslizamento: number;
}

export interface CidadeStats {
  servicos: ResumoServicos;
  territorio: ResumoTerritorio;
  mobilidade: Omit<ResumoMobilidade, 'vias'>;
  transporte: { tarifa: number; vans: PoliticaVans; linhas: LinhaResumo[]; receitaMes: number; custoMes: number };
  favelas: { lista: FavelaResumo[]; deficit: number; demandaPopular: number };
}

/** Dados de renderização que mudam pouco (enviados só quando a versão muda). */
export interface CidadeRender {
  territorio?: { versao: number; F: Float32Array; M: Float32Array };
  favelas?: { versao: number; casas: Float32Array; meta: { id: number; status: StatusFavela; grupo: 1 | 2; regularizada: boolean }[] };
  linhas?: { versao: number; linhas: { id: number; tipo: TipoLinha; cor: string; status: 'operando' | 'em_obra'; caminho: number[]; paradas: { x: number; z: number }[]; frota: number; headwayMin: number }[] };
  transito?: { versao: number; vias: Float32Array };
}

export interface ServiceInst { id: number; eq: string; x: number; z: number; angle: number; conectado: boolean }

/** zona, arquétipo, obra, andares, look, flags, valor do solo, ocupação, poluição, saúde, educação, segurança, crime */
export const LOT_STATE_STRIDE = 13;
/** Bits de flags em lotState[5]. */
export const FLAG = { AGUA: 1, ENERGIA: 2, ESGOTO: 4, ABANDONADO: 8 } as const;

/** Desempenho da simulação (painel F4): passo = o que cada `step()`/fatia custa, trabalhos = o que cada fase do dia custa. */
export interface PerfSim {
  passoMs: { ultimo: number; p50: number; p95: number; p99: number; max: number };
  /** 0 = síncrono */
  orcamentoMs: number;
  lotes: number; lotesPerto: number; raioFoco: number;
  fila: string[]; diasPulados: number; concluidos: number;
  trabalhos: { nome: string; fatias: number; ms: number; ema: number; pior: number }[];
}

export type ToWorker =
  | { type: 'init'; init: SimInit; real?: CidadeReal | null }
  | { type: 'load'; save: SaveData; real?: CidadeReal | null }
  | { type: 'speed'; speed: number }
  | { type: 'cmd'; id: number; cmd: Command }
  | { type: 'save'; id: number }
  /** câmera: lotes a menos de `raio` m de (x, z) rodam a simulação completa todo dia; os outros, em LOD (Fase 23) */
  | { type: 'foco'; x: number; z: number; raio: number }
  /** ms de CPU por passo para o trabalho pesado do dia; 0 = síncrono */
  | { type: 'orcamento'; ms: number }
  /** só desenvolvimento/testes: avança N dias de uma vez */
  | { type: 'avancar'; dias: number };

export type FromWorker =
  | { type: 'ready'; init: SimInit }
  | { type: 'world'; version: number; roads: RoadGraphJSON; lots: Float32Array; services: ServiceInst[] }
  | { type: 'state'; version: number; lotState: Float32Array; pollution: Float32Array; stats: Stats; news: Noticia[]; render: CidadeRender; perf: PerfSim }
  | { type: 'cmdResult'; id: number; ok: boolean; msg?: string; custo?: number }
  | { type: 'saved'; id: number; save: SaveData }
  | { type: 'error'; msg: string };

export interface SaveData {
  formato: 'nacao27';
  versao: 1;
  salvoEm: string;
  init: SimInit;
  roads: RoadGraphJSON;
  services: ServiceInst[];
  nextService: number;
  lots: { zone: number[]; arch: number[]; progress: number[]; floors: number[]; look: number[]; semUtil: number[]; occ: number[]; lv: number[]; abandonado: number[] };
  demanda: { r: number; c: number; i: number };
  cooldown: [string, number][];
  pollution: number[];
  lotPol: number[];
  cidade?: { territorio: unknown; favelas: unknown; transporte: unknown; contencao: boolean; crime?: number[]; clima?: unknown; eventos?: unknown; visuais?: unknown; real?: unknown };
  tick: number;
  rng: [number, number, number, number];
  caixa: number;
  mesCorrente: Ledger;
  ultimoBalanco: Ledger | null;
  historico: Stats['historico'];
  aprovacao: number;
  poluicaoAgua: number;
  noticias: Noticia[];
  marcos: string[];
  estado?: Record<string, unknown>;
}
