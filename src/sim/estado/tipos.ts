import type { EstadoEleicao, Tema } from '../eleicao/eleicao';
import type { Legado } from '../eleicao/legado';
import type { EstadoAtores } from '../atores/atores';
import type { Carta, EstadoPolitico } from '../politica/politica';
import type { Cargo, IdBancada, IdPartido } from '../politica/dados';
/**
 * Tipos do governo estadual (Fase 3): orçamento, folha, previdência, dívida, LRF,
 * secretarias, obras e ciclo PPA/LDO/LOA. Valores monetários em R$ nominais.
 */

export type Area =
  | 'saude' | 'educacao' | 'seguranca' | 'assistencia' | 'transporte'
  | 'infraestrutura' | 'saneamento' | 'cultura' | 'desenvolvimento' | 'administracao';

export const AREAS: { id: Area; nome: string; secretaria: string; cor: string; funcoes: string[] }[] = [
  { id: 'saude', nome: 'Saúde', secretaria: 'Secretaria de Saúde', cor: '#ff6b7a', funcoes: ['saude'] },
  { id: 'educacao', nome: 'Educação', secretaria: 'Secretaria de Educação', cor: '#f5b942', funcoes: ['educacao'] },
  { id: 'seguranca', nome: 'Segurança', secretaria: 'Secretaria de Segurança Pública', cor: '#5b8def', funcoes: ['seguranca'] },
  { id: 'assistencia', nome: 'Assistência e Trabalho', secretaria: 'Secretaria de Assistência Social', cor: '#c77dff', funcoes: ['assistencia', 'direitosCidadania', 'trabalho'] },
  { id: 'transporte', nome: 'Transportes', secretaria: 'Secretaria de Transportes', cor: '#3ee0b0', funcoes: ['transporte'] },
  { id: 'infraestrutura', nome: 'Obras e Habitação', secretaria: 'Secretaria de Infraestrutura', cor: '#e8742a', funcoes: ['urbanismo', 'habitacao', 'energia'] },
  { id: 'saneamento', nome: 'Saneamento e Ambiente', secretaria: 'Secretaria do Ambiente', cor: '#3fa9f5', funcoes: ['saneamento', 'gestaoAmbiental'] },
  { id: 'cultura', nome: 'Cultura, Esporte e Turismo', secretaria: 'Secretaria de Cultura', cor: '#ff9ad5', funcoes: ['cultura', 'desporto'] },
  { id: 'desenvolvimento', nome: 'Desenvolvimento Econômico', secretaria: 'Secretaria de Desenvolvimento', cor: '#9bd85e', funcoes: ['agricultura', 'industria', 'comercioServicos', 'cienciaTecnologia'] },
  { id: 'administracao', nome: 'Administração e Fazenda', secretaria: 'Casa Civil e Fazenda', cor: '#94a8a2', funcoes: ['administracao'] },
];

export type Carreira = 'educacao' | 'saude' | 'seguranca' | 'demais';
export const CARREIRAS: { id: Carreira; nome: string; salarioBase: number; pessoalNaFuncao: number }[] = [
  { id: 'educacao', nome: 'Professores e educação', salarioBase: 6_900, pessoalNaFuncao: 0.72 },
  { id: 'saude', nome: 'Saúde', salarioBase: 8_400, pessoalNaFuncao: 0.42 },
  { id: 'seguranca', nome: 'Polícias e bombeiros', salarioBase: 9_800, pessoalNaFuncao: 0.82 },
  { id: 'demais', nome: 'Demais carreiras', salarioBase: 8_100, pessoalNaFuncao: 0.35 },
];

export type RegimeDivida = 'normal' | 'RRF' | 'PROPAG';
export type MetaLDO = 'austera' | 'equilibrada' | 'expansionista';

/** Proposta de Lei Orçamentária Anual (valores do ano inteiro). */
export interface PropostaLOA {
  ano: number;
  aliquotaICMS: number;
  aliquotaIPVA: number;
  aliquotaITCMD: number;
  /** fração do ICMS renunciada em incentivos fiscais (0–0,15) */
  incentivos: number;
  /** reajuste salarial por carreira (0,05 = 5%) */
  reajuste: Record<Carreira, number>;
  /** variação do quadro por carreira via concursos (0,03 = +3%) */
  quadro: Record<Carreira, number>;
  custeio: Record<Area, number>;
  investimento: Record<Area, number>;
  /** Programa Estadual de Desenvolvimento Urbano da Capital (a Visão Cidade) */
  programaCapital: number;
  /** emendas parlamentares (moeda de negociação com a ALE) */
  emendas: number;
  aliquotaPrevidencia: number;
}

export type FaseObra = 'licitacao' | 'execucao' | 'paralisada' | 'concluida';

/** Obra criada a partir da Visão Cidade (urbanização de favela, BRT, metrô, teleférico). */
export interface ObraCustom {
  nome: string;
  area: Area;
  custo: number;
  meses: number;
  custeioAnual: number;
  ambiental?: boolean;
  ref: { tipo: 'favela' | 'linha' | 'deputado'; id: number };
}

export interface ObraAtiva {
  uid: number;
  id: string;
  custom?: ObraCustom;
  fase: FaseObra;
  progresso: number;
  custoTotal: number;
  gasto: number;
  mesesLicitacao: number;
  mesesParada: number;
  mesesRuins: number;
  iniciadaEm: string;
  concluidaEm?: string;
}

export interface Indicadores {
  esperaEmergencia: number;
  mortalidadeInfantil: number;
  ideb: number;
  homicidios: number;
  esgoto: number;
  deslocamento: number;
  pobreza: number;
  desemprego: number;
  crescimentoPIB: number;
  /** leitos SUS por mil habitantes */
  leitos: number;
  /** fila de cirurgias eletivas (milhares de pessoas) */
  filaCirurgias: number;
  /** evasão no ensino médio (%) */
  evasao: number;
  /** mortes por intervenção policial por 100 mil */
  letalidade: number;
  /** lotação do sistema prisional (% da capacidade) */
  lotacaoPrisional: number;
  /** roubos por 100 mil */
  roubos: number;
}

export type GestaoSaude = 'direta' | 'os';
export type DoutrinaSeguranca = 'confronto' | 'inteligencia' | 'prevencao';

/** Políticas das secretarias (Fase 4). */
export interface Politicas {
  gestaoSaude: GestaoSaude;
  /** fração do ensino médio em tempo integral (0–1) */
  tempoIntegral: number;
  bonusProfessor: boolean;
  doutrina: DoutrinaSeguranca;
  cameras: boolean;
  integracaoDados: boolean;
  rendaEstadual: boolean;
}

export interface GruposAprovacao { servidores: number; empresariado: number; classeMedia: number; baixaRenda: number }

export interface MesFiscal {
  rotulo: string;
  receitas: Record<string, number>;
  despesas: Record<string, number>;
  resultado: number;
  caixa: number;
}

export type Capag = 'A' | 'B' | 'C' | 'D';

export interface EventoCalendario { data: string; titulo: string; tipo: 'ldo' | 'loa' | 'rgf' | 'votacao' | 'ppa' | 'ideb' }

/** Foto do Estado enviada à interface a cada tick. */
export interface EstadoSnapshot {
  ano: number;
  mes: number;
  caixa: number;
  rcl12: number;
  receitas12: Record<string, number>;
  despesas12: Record<string, number>;
  resultadoPrimario12: number;
  resultadoNominal12: number;
  pessoalPctRcl: number;
  dividaConsolidada: number;
  dclPctRcl: number;
  saudePct: number;
  educacaoPct: number;
  saudePctAno: number;
  educacaoPctAno: number;
  capag: Capag;
  regime: RegimeDivida;
  jurosReais: number;
  pagamentoDivida: number;
  loaVigente: PropostaLOA;
  loaProposta: PropostaLOA | null;
  loaStatus: 'vigente' | 'janela' | 'enviada' | 'rejeitada' | 'duodecimos';
  duodecimos: boolean;
  contingenciamento: number;
  metaLDO: MetaLDO;
  ldoDefinida: boolean;
  ppaEixos: Area[];
  ppaDefinido: boolean;
  baseAliada: number;
  folha: Record<Carreira, { servidores: number; salarioMedio: number; ganhoReal: number }>;
  inflacaoAcumulada: number;
  previdencia: { beneficios12: number; contribuicoes12: number; deficit12: number; aliquota: number; reformada: boolean };
  indicadores: Indicadores;
  indicadoresIniciais: Indicadores;
  idebDivulgado: { ano: number; valor: number } | null;
  aprovacao: number;
  grupos: GruposAprovacao;
  obras: ObraAtiva[];
  execucao: Record<Area, { custeio: number; investimento: number; pessoal: number }>;
  historico: MesFiscal[];
  calendario: EventoCalendario[];
  alertas: string[];
  pibNominal: number;
  populacao: number;
  greves: Carreira[];
  emprestimosPendentes: { valor: number; credor: string; liberaEm: number }[];
  /** constantes de calibração usadas pela projeção da LOA na interface */
  politicas: Politicas;
  /** custo mensal corrente das políticas (R$) */
  custoPoliticasMes: number;
  /** Fase 5: gabinete, ALE, pauta, CPIs, capital político */
  pol: EstadoPolitico;
  /** Fase 6: prefeitos, Presidente, imprensa e pesquisas */
  atores: EstadoAtores;
  /** amplificador da imprensa sobre notícias ruins (> 0 = hostil) */
  amplificador: number;
  /** Fase 7: eleição em curso (ou a última), mandato, fim de jogo e legado */
  eleicao: EstadoEleicao | null;
  mandato: number;
  partidoGov: IdPartido;
  fim: { motivo: Legado['motivo']; data: string } | null;
  legado: Legado | null;
  historicoEleicoes: { ano: number; texto: string; venceu: boolean; turno: number; pct: number }[];
  calib: {
    aliquotaICMS0: number; aliquotaIPVA0: number; aliquotaITCMD0: number; kSaude: number; kEducacao: number;
    fracInativosDTP: number; shareDuodecimos: number; pessoalPorArea: Record<Area, number>; ipca: number; kMunicipios: number;
  };
}

export type AcaoEstado =
  | { tipo: 'propor-loa'; proposta: PropostaLOA }
  | { tipo: 'contingenciar'; pct: number }
  | { tipo: 'iniciar-obra'; id: string }
  | { tipo: 'emprestimo'; valor: number; credor: 'bndes' | 'bird' | 'bancos' }
  | { tipo: 'regime'; regime: 'PROPAG' | 'RRF' }
  | { tipo: 'reforma-previdencia' }
  | { tipo: 'ldo'; meta: MetaLDO }
  | { tipo: 'ppa'; eixos: Area[] }
  | { tipo: 'politica'; politicas: Partial<Politicas> }
  | { tipo: 'mutirao' }
  // Fase 5: gabinete e Assembleia
  | { tipo: 'candidatos'; cargo: Cargo }
  | { tipo: 'nomear'; cargo: Cargo; indice: number }
  | { tipo: 'ceder-secretaria'; partido: IdPartido; cargo: Cargo }
  | { tipo: 'negociar'; deputado: number; carta: Carta; projeto: string | null }
  | { tipo: 'negociar-bancada'; bancada: IdBancada; carta: 'emenda' | 'cargo' }
  // Fase 6: prefeitos, União e imprensa
  | { tipo: 'convenio'; prefeito: number; valor: number }
  | { tipo: 'federal'; pedido: 'forca-nacional' | 'convenio' | 'socorro' }
  | { tipo: 'presidente'; postura: 'apoiar' | 'criticar' }
  | { tipo: 'publicidade'; valor: number }
  | { tipo: 'coletiva' }
  // Fase 7: eleição
  | { tipo: 'convencao'; decisao: 'reeleicao' | 'sucessor'; sucessor?: number }
  | { tipo: 'campanha-visita'; ibge: string }
  | { tipo: 'campanha-tema'; tema: Tema }
  | { tipo: 'debate'; opcao: number }
  | { tipo: 'apoio-2turno'; candidato: number };
