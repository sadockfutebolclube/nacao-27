/**
 * Catálogo de zonas, arquétipos de edificação e equipamentos públicos (Fases 2 e 4).
 * Valores monetários em R$ (preços de 2026, ordem de grandeza realista para obras públicas).
 */

export const Zone = { None: 0, ResBaixa: 1, ResAlta: 2, Comercial: 3, Industrial: 4, ZEIS: 5 } as const;
export type Zone = (typeof Zone)[keyof typeof Zone];

export const ZONES: { id: Zone; nome: string; curto: string; cor: string }[] = [
  { id: Zone.None, nome: 'Sem zona', curto: '—', cor: '#000000' },
  { id: Zone.ResBaixa, nome: 'Residencial baixa densidade', curto: 'R1', cor: '#5fbf4a' },
  { id: Zone.ResAlta, nome: 'Residencial alta densidade', curto: 'R2', cor: '#1f8f4e' },
  { id: Zone.Comercial, nome: 'Comercial', curto: 'C', cor: '#3f8fe0' },
  { id: Zone.Industrial, nome: 'Industrial', curto: 'I', cor: '#e0b030' },
  { id: Zone.ZEIS, nome: 'ZEIS — habitação de interesse social', curto: 'ZEIS', cor: '#e46aa8' },
];

export type Estilo = 'casa' | 'predio' | 'vidro' | 'galpao';
export type Telhado = 'laje' | 'telha' | 'galpao';

export interface Arquetipo {
  id: number;
  zone: Zone;
  level: number;
  nome: string;
  andaresMin: number;
  andaresMax: number;
  peDireito: number;
  /** fração da frente e da profundidade do lote ocupadas */
  frente: number;
  fundo: number;
  recuo: number;
  moradores: number;
  empregos: number;
  estilo: Estilo;
  telhado: Telhado;
  /** dias de obra */
  obra: number;
}

export const ARQUETIPOS: Arquetipo[] = [
  // Residencial baixa
  { id: 1, zone: Zone.ResBaixa, level: 1, nome: 'Casa térrea com laje', andaresMin: 1, andaresMax: 1, peDireito: 3.2, frente: 0.78, fundo: 0.5, recuo: 4, moradores: 4, empregos: 0, estilo: 'casa', telhado: 'laje', obra: 12 },
  { id: 2, zone: Zone.ResBaixa, level: 2, nome: 'Sobrado', andaresMin: 2, andaresMax: 2, peDireito: 3.0, frente: 0.82, fundo: 0.55, recuo: 3.5, moradores: 8, empregos: 0, estilo: 'casa', telhado: 'telha', obra: 20 },
  { id: 3, zone: Zone.ResBaixa, level: 3, nome: 'Casa de três andares', andaresMin: 3, andaresMax: 3, peDireito: 3.0, frente: 0.9, fundo: 0.6, recuo: 2.5, moradores: 15, empregos: 0, estilo: 'casa', telhado: 'laje', obra: 30 },
  // Residencial alta
  { id: 4, zone: Zone.ResAlta, level: 1, nome: 'Prédio de 4 andares', andaresMin: 3, andaresMax: 4, peDireito: 2.9, frente: 0.86, fundo: 0.62, recuo: 3, moradores: 32, empregos: 0, estilo: 'predio', telhado: 'laje', obra: 45 },
  { id: 5, zone: Zone.ResAlta, level: 2, nome: 'Edifício residencial', andaresMin: 6, andaresMax: 9, peDireito: 2.9, frente: 0.9, fundo: 0.7, recuo: 3, moradores: 70, empregos: 0, estilo: 'predio', telhado: 'laje', obra: 80 },
  { id: 6, zone: Zone.ResAlta, level: 3, nome: 'Edifício caixote anos 70', andaresMin: 11, andaresMax: 15, peDireito: 2.9, frente: 0.9, fundo: 0.74, recuo: 2.5, moradores: 140, empregos: 0, estilo: 'predio', telhado: 'laje', obra: 120 },
  { id: 7, zone: Zone.ResAlta, level: 4, nome: 'Torre residencial', andaresMin: 18, andaresMax: 26, peDireito: 3.0, frente: 0.88, fundo: 0.72, recuo: 3, moradores: 230, empregos: 0, estilo: 'predio', telhado: 'laje', obra: 160 },
  // Comercial
  { id: 8, zone: Zone.Comercial, level: 1, nome: 'Loja térrea', andaresMin: 1, andaresMax: 2, peDireito: 3.8, frente: 0.92, fundo: 0.6, recuo: 0.8, moradores: 0, empregos: 8, estilo: 'casa', telhado: 'laje', obra: 15 },
  { id: 9, zone: Zone.Comercial, level: 2, nome: 'Galeria comercial', andaresMin: 3, andaresMax: 5, peDireito: 3.6, frente: 0.94, fundo: 0.7, recuo: 0.8, moradores: 0, empregos: 30, estilo: 'predio', telhado: 'laje', obra: 50 },
  { id: 10, zone: Zone.Comercial, level: 3, nome: 'Edifício de escritórios', andaresMin: 10, andaresMax: 20, peDireito: 3.7, frente: 0.9, fundo: 0.75, recuo: 2, moradores: 0, empregos: 140, estilo: 'vidro', telhado: 'laje', obra: 140 },
  // Industrial
  { id: 11, zone: Zone.Industrial, level: 1, nome: 'Galpão', andaresMin: 1, andaresMax: 1, peDireito: 8, frente: 0.92, fundo: 0.75, recuo: 2, moradores: 0, empregos: 25, estilo: 'galpao', telhado: 'galpao', obra: 25 },
  { id: 12, zone: Zone.Industrial, level: 2, nome: 'Fábrica', andaresMin: 1, andaresMax: 2, peDireito: 7, frente: 0.95, fundo: 0.85, recuo: 1.5, moradores: 0, empregos: 70, estilo: 'galpao', telhado: 'galpao', obra: 50 },
  // ZEIS: conjuntos habitacionais populares (cara de programa habitacional, blocos iguais)
  { id: 13, zone: Zone.ZEIS, level: 1, nome: 'Conjunto habitacional', andaresMin: 4, andaresMax: 5, peDireito: 2.7, frente: 0.86, fundo: 0.66, recuo: 3, moradores: 48, empregos: 0, estilo: 'predio', telhado: 'laje', obra: 60 },
  { id: 14, zone: Zone.ZEIS, level: 2, nome: 'Condomínio popular', andaresMin: 6, andaresMax: 8, peDireito: 2.7, frente: 0.88, fundo: 0.7, recuo: 3, moradores: 85, empregos: 0, estilo: 'predio', telhado: 'laje', obra: 90 },
];

export const MAX_LEVEL: Record<Zone, number> = { [Zone.None]: 0, [Zone.ResBaixa]: 3, [Zone.ResAlta]: 4, [Zone.Comercial]: 3, [Zone.Industrial]: 2, [Zone.ZEIS]: 2 };

export function arquetipo(zone: Zone, level: number): Arquetipo {
  return ARQUETIPOS.find((a) => a.zone === zone && a.level === level)!;
}
export const arquetipoPorId = (id: number) => ARQUETIPOS[id - 1];

/** Valor do solo mínimo para subir de nível (índice = nível alvo). */
export const LV_PARA_NIVEL = [0, 0, 32, 50, 68];

// ── Equipamentos públicos ───────────────────────────────────────────────────────────

export type Rede = 'agua' | 'energia' | 'esgoto' | 'lazer' | 'saude' | 'educacao' | 'seguranca';

export interface Equipamento {
  id: string;
  nome: string;
  descricao: string;
  rede: Rede;
  custo: number;
  manutencao: number;
  /** capacidade em unidades (1 unidade ≈ consumo de 1 morador); saúde/educação/segurança: pessoas atendidas */
  capacidade: number;
  w: number;
  d: number;
  altura: number;
  cor: string;
  poluicao: number;
  /** raio de influência (lazer: valor do solo; serviços sociais: área atendida; segurança: presença policial) */
  raio?: number;
  bonus?: number;
  /** precisa ficar perto da água (captação/descarga) */
  margemAgua?: boolean;
}

export const EQUIPAMENTOS: Equipamento[] = [
  { id: 'reservatorio', nome: 'Reservatório elevado', descricao: 'Caixa d\'água do bairro abastecida pela adutora estadual.', rede: 'agua', custo: 4_000_000, manutencao: 45_000, capacidade: 6_000, w: 16, d: 16, altura: 22, cor: '#d8dde2', poluicao: 0 },
  { id: 'eta', nome: 'Estação de Tratamento de Água', descricao: 'Capta, trata e distribui. Precisa estar a até 250 m da água.', rede: 'agua', custo: 32_000_000, manutencao: 380_000, capacidade: 60_000, w: 44, d: 36, altura: 9, cor: '#b9c9d6', poluicao: 0, margemAgua: true },
  { id: 'subestacao', nome: 'Subestação de energia', descricao: 'Rebaixa a tensão da rede de transmissão para os bairros.', rede: 'energia', custo: 6_000_000, manutencao: 60_000, capacidade: 16_000, w: 26, d: 22, altura: 7, cor: '#9aa3a8', poluicao: 0 },
  { id: 'solar', nome: 'Usina solar', descricao: 'Energia limpa e silenciosa. Ocupa bastante área.', rede: 'energia', custo: 14_000_000, manutencao: 50_000, capacidade: 10_000, w: 60, d: 40, altura: 2.2, cor: '#26365a', poluicao: 0 },
  { id: 'termeletrica', nome: 'Termelétrica a gás', descricao: 'Muita energia, muita fumaça. Vizinhos não vão gostar.', rede: 'energia', custo: 30_000_000, manutencao: 650_000, capacidade: 90_000, w: 50, d: 40, altura: 16, cor: '#8d8a84', poluicao: 6 },
  { id: 'ete', nome: 'Estação de Tratamento de Esgoto', descricao: 'Sem ela, o esgoto vai in natura para a água. Precisa estar a até 250 m da água.', rede: 'esgoto', custo: 26_000_000, manutencao: 330_000, capacidade: 50_000, w: 48, d: 40, altura: 6, cor: '#a7b29a', poluicao: 0.6, margemAgua: true },
  { id: 'praca', nome: 'Praça', descricao: 'Bancos, árvores e um pipoqueiro. Valoriza a vizinhança.', rede: 'lazer', custo: 600_000, manutencao: 8_000, capacidade: 0, w: 22, d: 22, altura: 0.3, cor: '#6c9a4a', poluicao: 0, raio: 140, bonus: 10 },
  // ── Saúde ──
  { id: 'ubs', nome: 'Clínica da Família (UBS)', descricao: 'Atenção básica perto de casa: consultas, vacina, pré-natal. Gerida pela prefeitura com apoio do Estado.', rede: 'saude', custo: 3_800_000, manutencao: 140_000, capacidade: 9_000, w: 24, d: 18, altura: 5, cor: '#e9f1f4', poluicao: 0, raio: 450 },
  { id: 'upa', nome: 'UPA 24 horas', descricao: 'Pronto-atendimento: desafoga as emergências dos hospitais.', rede: 'saude', custo: 13_000_000, manutencao: 480_000, capacidade: 35_000, w: 32, d: 26, altura: 7, cor: '#f4f6f8', poluicao: 0, raio: 1000 },
  { id: 'hospital', nome: 'Hospital Estadual', descricao: 'Referência regional com UTI, centro cirúrgico e heliponto.', rede: 'saude', custo: 95_000_000, manutencao: 2_600_000, capacidade: 140_000, w: 46, d: 40, altura: 30, cor: '#eef2f4', poluicao: 0, raio: 2200 },
  // ── Educação ──
  { id: 'escola', nome: 'Colégio Estadual', descricao: 'Ensino médio regular, turnos manhã/tarde/noite.', rede: 'educacao', custo: 8_500_000, manutencao: 230_000, capacidade: 12_000, w: 40, d: 30, altura: 8, cor: '#f2d27a', poluicao: 0, raio: 650 },
  { id: 'integral', nome: 'Escola em Tempo Integral', descricao: 'Jornada de 9 horas, laboratórios e esporte. Melhora o IDEB, mas custa mais.', rede: 'educacao', custo: 13_000_000, manutencao: 420_000, capacidade: 10_000, w: 44, d: 34, altura: 9, cor: '#f0b25a', poluicao: 0, raio: 650 },
  { id: 'tecnica', nome: 'Escola Técnica Estadual', descricao: 'Cursos técnicos ligados às vocações da cidade.', rede: 'educacao', custo: 26_000_000, manutencao: 650_000, capacidade: 35_000, w: 50, d: 36, altura: 10, cor: '#d9c7a0', poluicao: 0, raio: 1600 },
  // ── Segurança ──
  { id: 'delegacia', nome: 'Delegacia de Polícia', descricao: 'Polícia Civil: registro e investigação. Presença do Estado no bairro.', rede: 'seguranca', custo: 6_500_000, manutencao: 320_000, capacidade: 28_000, w: 26, d: 20, altura: 7, cor: '#bfc6cc', poluicao: 0, raio: 750 },
  { id: 'batalhao', nome: 'Batalhão da PM', descricao: 'Policiamento ostensivo de uma região inteira. Base para operações.', rede: 'seguranca', custo: 26_000_000, manutencao: 950_000, capacidade: 90_000, w: 44, d: 36, altura: 9, cor: '#c9b48a', poluicao: 0, raio: 1600 },
  { id: 'base', nome: 'Base de Policiamento Comunitário', descricao: 'Pequena, de porta aberta e conhecida pelo nome. Sozinha não vence uma guerra, mas impede a volta do crime depois dela.', rede: 'seguranca', custo: 1_600_000, manutencao: 160_000, capacidade: 9_000, w: 12, d: 10, altura: 4, cor: '#dfe5ea', poluicao: 0, raio: 380 },
  { id: 'parque', nome: 'Parque urbano', descricao: 'Pista de caminhada, quadra e academia ao ar livre.', rede: 'lazer', custo: 3_500_000, manutencao: 40_000, capacidade: 0, w: 50, d: 40, altura: 0.3, cor: '#4f8a3a', poluicao: 0, raio: 280, bonus: 16 },
];

export const equipamento = (id: string) => EQUIPAMENTOS.find((e) => e.id === id)!;

/** Consumo por pessoa/emprego (unidades/dia). */
export const CONSUMO = {
  aguaMorador: 1, aguaEmprego: 0.5,
  energiaMorador: 1, energiaComercio: 1, energiaIndustria: 1.6,
  esgotoFator: 0.8,
};
