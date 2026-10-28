/** Tipos compartilhados do sistema de facções e instituições (Fase 26): usados pelo Worker, pelo protocolo e pela interface. */

export interface RespostaOcorrencia {
  /** id da instituição (pm, bombeiros…) e, se foi o caso, da especialização (bope) */
  inst: string; esp?: string;
  base: string; baseX: number; baseZ: number;
  viaturas: number;
  /** tempo estimado de chegada em minutos (preparo + deslocamento + atrasos de escolta) */
  etaMin: number;
  /** a viatura teve que esperar escolta policial (área dominada) */
  escolta: boolean;
}

export interface Ocorrencia {
  id: number; tipo: string;
  x: number; z: number; unidade: number; local: string;
  /** dia do jogo e hora (0–24) em que começou */
  dia: number; hora: number;
  gravidade: number;
  /** índices das facções envolvidas (0 = milícia…) */
  faccoes: number[];
  resposta: RespostaOcorrencia[];
  mortos: number; feridos: number; presos: number;
  /** ordenada pelo jogador (operação) */
  ordenada: boolean;
  manchete: string;
}

export interface ResumoFaccao {
  id: string; nome: string; sigla: string; cor: string; tipo: 'facção' | 'milícia';
  poder: number; armamento: number; dinheiro: number; influencia: number;
  /** fração da população da cidade em território controlado por ela */
  populacao: number;
  unidades: number;
  renda: { trafico: number; taxas: number; gatonet: number; transporteAlternativo: number; total: number };
  rivais: string[]; aliados: string[]; emGuerraCom: string[]; emTreguaCom: string[];
}

export interface ResumoUnidade {
  id: number; nome: string; populacao: number;
  /** 0–1: o quanto da unidade está sob domínio criminoso */
  forca: number;
  /** controle por facção (fração da unidade), na ordem das facções */
  controle: number[];
  /** índice da facção dominante (ou −1) */
  dono: number;
  conflito: number;
}

export interface ResumoFaccoes {
  faccoes: ResumoFaccao[];
  unidades: ResumoUnidade[];
  /** fração da população sob Estado (sem domínio relevante) */
  estado: number;
  conflitosHoje: number;
  recentes: Ocorrencia[];
  /** contagem por tipo desde o início do jogo */
  totais: Record<string, number>;
  mortosTotal: number;
}

/** Dados para o desenho (overlay T e cenas): mudam uma vez por dia. */
export interface RenderFaccoes {
  versao: number;
  /** dono de cada célula de 64 m: 0 = sem dono, 1.. = facção (índice + 1) */
  dono: Uint8Array;
  /** ocorrências recentes (as últimas N), com posição e resposta */
  ocorrencias: Ocorrencia[];
  /** quantas vezes o relógio de ocorrências andou (as cenas novas são as de id maior que o último visto) */
  ultimoId: number;
}
