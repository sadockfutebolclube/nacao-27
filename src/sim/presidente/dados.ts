/**
 * Dados do Modo Presidente (Fase 9): medidas que o Planalto pode enviar ao Congresso, ministérios,
 * inclinação política regional e regras de quórum. Tudo fictício nos nomes; regras reais da Constituição.
 */
import type { Eixos } from '../politica/dados';
import type { Programa } from './economia';

export type TipoProposta = 'MP' | 'PL' | 'PLP' | 'PEC';

export interface DefMedida {
  id: string;
  nome: string;
  descricao: string;
  /** formas possíveis (MP só para urgência e relevância) */
  tipos: TipoProposta[];
  eixos: Eixos;
  /** efeitos quando em vigor */
  despesa?: Partial<Record<Programa, number>>;
  /** receita permanente (% PIB) */
  receita?: number;
  /** choque único na dívida (p.p. do PIB; privatização reduz) */
  divida?: number;
  /** aprovação (pontos, decai) e efeito por região ideológica: + agrada a esquerda, − a direita */
  aprovacao: number;
  lado?: number;
  hiato?: number;
  inflacao?: number;
  /** variação da credibilidade do BC */
  credibilidade?: number;
  /** variação da meta de primário (p.p.) */
  meta?: number;
  /** chance de o STF derrubar se for questionado (0–1) */
  riscoSTF: number;
  /** meses de comissões antes do plenário */
  tramitacao: number;
  /** pode ser enviada só uma vez por mandato */
  unica?: boolean;
}

export const MEDIDAS: DefMedida[] = [
  {
    id: 'isencao-ir', nome: 'Isenção do IR até R$ 5 mil', descricao: 'Isenta do Imposto de Renda quem ganha até R$ 5 mil, compensada por um imposto mínimo sobre altas rendas.',
    tipos: ['PL'], eixos: { impostos: -0.3, social: 0.7 }, receita: -0.03, aprovacao: 5, lado: 0.2, hiato: 0.15, riscoSTF: 0.1, tramitacao: 3, unica: true,
  },
  {
    id: 'dividendos', nome: 'Tributação de lucros e dividendos', descricao: 'Volta a cobrar IR sobre dividendos distribuídos, com alíquota de 15%.',
    tipos: ['PL'], eixos: { impostos: 0.9, social: 0.3 }, receita: 0.35, aprovacao: 1, lado: 0.4, hiato: -0.1, riscoSTF: 0.1, tramitacao: 4, unica: true,
  },
  {
    id: 'corte-gastos', nome: 'PEC do equilíbrio fiscal', descricao: 'Desvincula benefícios do salário mínimo, limita supersalários e flexibiliza os pisos de saúde e educação.',
    tipos: ['PEC'], eixos: { deficit: -1, social: -0.8, servidores: -0.4 }, despesa: { previdencia: -0.25, bpc: -0.1, saude: -0.1, educacao: -0.1 },
    aprovacao: -6, lado: -0.5, credibilidade: 0.08, riscoSTF: 0.3, tramitacao: 5, unica: true,
  },
  {
    id: 'previdencia', nome: 'Nova reforma da Previdência', descricao: 'Idade mínima sobe com a expectativa de vida e regras de transição mais curtas.',
    tipos: ['PEC'], eixos: { deficit: -1, servidores: -0.8, social: -0.6 }, despesa: { previdencia: -0.35 }, aprovacao: -7, lado: -0.4, credibilidade: 0.06, riscoSTF: 0.2, tramitacao: 6, unica: true,
  },
  {
    id: 'administrativa', nome: 'Reforma administrativa', descricao: 'Avaliação de desempenho, fim de promoções automáticas e novos vínculos para futuros servidores.',
    tipos: ['PEC'], eixos: { servidores: -1.3, deficit: -0.5 }, despesa: { pessoal: -0.2 }, aprovacao: -2, lado: -0.3, riscoSTF: 0.25, tramitacao: 6, unica: true,
  },
  {
    id: 'renda-ampliada', nome: 'Ampliação da transferência de renda', descricao: 'Aumenta o benefício por criança e inclui 2 milhões de famílias da fila.',
    tipos: ['MP', 'PL'], eixos: { social: 1.1, deficit: 0.5 }, despesa: { bolsa: 0.3 }, aprovacao: 4, lado: 0.6, hiato: 0.2, riscoSTF: 0.05, tramitacao: 2,
  },
  {
    id: 'auxilio-gas', nome: 'Auxílio Gás ampliado', descricao: 'Botijão a cada dois meses para as famílias do Cadastro Único.',
    tipos: ['MP', 'PL'], eixos: { social: 0.8, deficit: 0.3 }, despesa: { bolsa: 0.07 }, aprovacao: 2, lado: 0.4, riscoSTF: 0.02, tramitacao: 2,
  },
  {
    id: 'diesel', nome: 'Subvenção ao diesel', descricao: 'Zera tributos federais e subsidia o diesel por 6 meses para segurar o frete.',
    tipos: ['MP'], eixos: { agro: 0.6, deficit: 0.6, impostos: -0.4 }, receita: -0.08, aprovacao: 2, inflacao: -0.3, credibilidade: -0.02, riscoSTF: 0.05, tramitacao: 2,
  },
  {
    id: 'pac', nome: 'Programa de investimentos', descricao: 'Obras de infraestrutura, saneamento e habitação em todos os estados, com crédito extraordinário.',
    tipos: ['PL', 'MP'], eixos: { emendas: 0.7, deficit: 0.5, credito: 0.4 }, despesa: { investimentos: 0.4 }, aprovacao: 3, hiato: 0.35, riscoSTF: 0.05, tramitacao: 3,
  },
  {
    id: 'seguranca', nome: 'PEC da Segurança Pública', descricao: 'Constitucionaliza o SUSP, amplia o papel da PF contra facções e cria o fundo nacional.',
    tipos: ['PEC'], eixos: { seguranca: 1.2, deficit: 0.2 }, despesa: { custeio: 0.05 }, aprovacao: 3, lado: -0.2, riscoSTF: 0.2, tramitacao: 5, unica: true,
  },
  {
    id: 'ambiental', nome: 'Desmatamento zero', descricao: 'Metas de desmatamento zero, rastreio do gado e crédito verde para recuperação de pasto.',
    tipos: ['PL'], eixos: { ambiente: 1.2, agro: -0.7 }, aprovacao: 1, lado: 0.4, hiato: -0.05, riscoSTF: 0.1, tramitacao: 4, unica: true,
  },
  {
    id: 'licenciamento', nome: 'Licenciamento ambiental simplificado', descricao: 'Licença por adesão e prazos menores para obras e agro.',
    tipos: ['PL'], eixos: { agro: 1.1, ambiente: -1.1 }, aprovacao: 0, lado: -0.5, hiato: 0.15, riscoSTF: 0.55, tramitacao: 3, unica: true,
  },
  {
    id: 'meta-flexivel', nome: 'Flexibilizar a meta fiscal', descricao: 'Lei complementar que reduz a meta de resultado primário em 0,5 p.p. do PIB.',
    tipos: ['PLP'], eixos: { deficit: 0.8, emendas: 0.3 }, meta: -0.5, aprovacao: 0, credibilidade: -0.08, riscoSTF: 0, tramitacao: 2,
  },
  {
    id: 'revogar-autonomia', nome: 'Revogar a autonomia do Banco Central', descricao: 'Volta a permitir a troca do presidente do BC a qualquer momento.',
    tipos: ['PLP'], eixos: { credito: 0.6 }, aprovacao: 1, lado: 0.3, credibilidade: -0.3, riscoSTF: 0.15, tramitacao: 3, unica: true,
  },
  {
    id: 'privatizacao', nome: 'Programa de desestatização', descricao: 'Vende o controle de estatais federais e abate a dívida com o caixa.',
    tipos: ['PL'], eixos: { servidores: -0.6, impostos: -0.2, deficit: -0.4 }, divida: -1.2, aprovacao: -2, lado: -0.6, credibilidade: 0.03, riscoSTF: 0.25, tramitacao: 5, unica: true,
  },
  {
    id: 'redes', nome: 'Regulação das plataformas digitais', descricao: 'Responsabiliza as redes por conteúdo criminoso impulsionado e cria um órgão regulador.',
    tipos: ['PL'], eixos: { social: 0.3, seguranca: 0.3 }, aprovacao: 1, lado: 0.3, riscoSTF: 0.35, tramitacao: 4, unica: true,
  },
  {
    id: 'salario-educacao', nome: 'Escola em tempo integral', descricao: 'Repasse federal para metade das matrículas do ensino médio em tempo integral.',
    tipos: ['PL', 'MP'], eixos: { social: 0.6, deficit: 0.3, servidores: 0.4 }, despesa: { educacao: 0.15 }, aprovacao: 2, lado: 0.2, hiato: 0.05, riscoSTF: 0.02, tramitacao: 3, unica: true,
  },
];
export const MEDIDA = Object.fromEntries(MEDIDAS.map((m) => [m.id, m])) as Record<string, DefMedida>;

/** Quórum por tipo (CF arts. 47, 60, 62 e 69); a PEC vota em dois turnos em cada Casa. */
export const QUORUM: Record<TipoProposta, '3/5' | 'simples' | 'absoluta'> = { MP: 'simples', PL: 'simples', PLP: 'absoluta', PEC: '3/5' };
export const TURNOS: Record<TipoProposta, number> = { MP: 1, PL: 1, PLP: 1, PEC: 2 };

export type IdMinisterio = 'casaCivil' | 'fazenda' | 'planejamento' | 'saude' | 'educacao' | 'social' | 'agricultura' | 'ambiente' | 'justica' | 'cidades' | 'minas' | 'relacoes';
export const MINISTERIOS: { id: IdMinisterio; nome: string; peso: number }[] = [
  { id: 'casaCivil', nome: 'Casa Civil', peso: 1 },
  { id: 'fazenda', nome: 'Fazenda', peso: 1 },
  { id: 'planejamento', nome: 'Planejamento e Orçamento', peso: 0.6 },
  { id: 'saude', nome: 'Saúde', peso: 0.9 },
  { id: 'educacao', nome: 'Educação', peso: 0.8 },
  { id: 'social', nome: 'Desenvolvimento Social', peso: 0.7 },
  { id: 'agricultura', nome: 'Agricultura', peso: 0.6 },
  { id: 'ambiente', nome: 'Meio Ambiente', peso: 0.4 },
  { id: 'justica', nome: 'Justiça e Segurança Pública', peso: 0.7 },
  { id: 'cidades', nome: 'Cidades', peso: 0.8 },
  { id: 'minas', nome: 'Minas e Energia', peso: 0.7 },
  { id: 'relacoes', nome: 'Relações Institucionais', peso: 0.5 },
];

/**
 * Inclinação política das UFs no eixo esquerda (−1) — direita (+1), estilizada a partir do padrão
 * regional das eleições presidenciais recentes (Nordeste mais à esquerda; Sul, Centro-Oeste e Norte agro à direita).
 */
export const INCLINACAO: Record<string, number> = {
  AC: 0.6, AL: -0.5, AP: 0.1, AM: 0, BA: -0.8, CE: -0.7, DF: 0.3, ES: 0.4, GO: 0.6, MA: -0.8, MT: 0.75, MS: 0.6, MG: 0.05,
  PA: -0.2, PB: -0.6, PR: 0.6, PE: -0.75, PI: -0.9, RJ: 0.4, RN: -0.6, RS: 0.4, RO: 0.8, RR: 0.8, SC: 0.8, SP: 0.35, SE: -0.6, TO: 0.1,
};

/** Senadores: 3 por UF (CF art. 46). */
export const SENADORES_POR_UF = 3;

export const NOMES_CARGO_BC = ['economista-chefe de banco', 'ex-diretor do BC', 'professora de macroeconomia', 'ex-secretário do Tesouro', 'economista de corretora'];
