/**
 * Carteira de grandes obras estaduais. Custos em R$ de 2027 (ordem de grandeza de obras
 * públicas brasileiras); efeitos aplicados na inauguração e escalados pelo tamanho do estado.
 */
import type { Area, Indicadores, ObraAtiva } from './tipos';

export interface DefObra {
  id: string;
  nome: string;
  area: Area;
  descricao: string;
  custo: number;
  meses: number;
  /** custeio anual extra depois de pronta (pessoal/manutenção) */
  custeioAnual: number;
  /** variação relativa (multiplicador − 1) ou absoluta (pp) nos indicadores-alvo */
  efeitos: Partial<Record<keyof Indicadores, number>>;
  /** efeitos escalam por (popRef / população)^0.5 */
  popRef: number;
  /** população mínima do estado para fazer sentido */
  popMin?: number;
  ambiental?: boolean;
}

export const OBRAS: DefObra[] = [
  { id: 'hospital', nome: 'Hospital Estadual de Referência', area: 'saude', descricao: '300 leitos, UTI e centro cirúrgico. Reduz filas e espera nas emergências.', custo: 480e6, meses: 30, custeioAnual: 180e6, efeitos: { esperaEmergencia: -0.12, mortalidadeInfantil: -0.03, leitos: 0.08, filaCirurgias: -0.1 }, popRef: 3e6 },
  { id: 'upas', nome: '10 UPAs 24 horas', area: 'saude', descricao: 'Pronto-atendimento descentralizado nas periferias.', custo: 130e6, meses: 12, custeioAnual: 95e6, efeitos: { esperaEmergencia: -0.08, leitos: 0.02 }, popRef: 3e6 },
  { id: 'maternidade', nome: 'Rede Cegonha estadual', area: 'saude', descricao: 'Maternidades regionais e UTIs neonatais.', custo: 220e6, meses: 20, custeioAnual: 70e6, efeitos: { mortalidadeInfantil: -0.1 }, popRef: 3e6 },
  { id: 'integral', nome: 'Escolas em Tempo Integral', area: 'educacao', descricao: 'Reforma e ampliação de 150 escolas de ensino médio para jornada integral.', custo: 340e6, meses: 18, custeioAnual: 160e6, efeitos: { ideb: 0.2, evasao: -0.12 }, popRef: 3e6 },
  { id: 'tecnicas', nome: 'Rede de Escolas Técnicas', area: 'educacao', descricao: 'Ensino técnico integrado ao médio, ligado às vocações regionais.', custo: 260e6, meses: 20, custeioAnual: 90e6, efeitos: { ideb: 0.08, desemprego: -0.004 }, popRef: 3e6 },
  { id: 'batalhoes', nome: 'Batalhões e Cerco Inteligente', area: 'seguranca', descricao: 'Novos batalhões, videomonitoramento e leitura de placas nas divisas.', custo: 190e6, meses: 10, custeioAnual: 60e6, efeitos: { homicidios: -0.06, roubos: -0.1 }, popRef: 4e6 },
  { id: 'presidio', nome: 'Complexo Penitenciário', area: 'seguranca', descricao: 'Reduz a superlotação e o recrutamento de facções dentro das cadeias.', custo: 360e6, meses: 24, custeioAnual: 110e6, efeitos: { homicidios: -0.04, lotacaoPrisional: -0.18 }, popRef: 4e6 },
  { id: 'restaurantes', nome: 'Restaurantes Populares', area: 'assistencia', descricao: '20 restaurantes com refeição a R$ 2.', custo: 60e6, meses: 6, custeioAnual: 70e6, efeitos: { pobreza: -0.05 }, popRef: 3e6 },
  { id: 'qualifica', nome: 'Programa Qualifica + Primeiro Emprego', area: 'assistencia', descricao: 'Centros de qualificação e bolsa de primeiro emprego.', custo: 90e6, meses: 8, custeioAnual: 110e6, efeitos: { desemprego: -0.006, pobreza: -0.03 }, popRef: 3e6 },
  { id: 'brt', nome: 'Corredor BRT Metropolitano', area: 'transporte', descricao: 'Faixas exclusivas, estações e 120 articulados.', custo: 1.6e9, meses: 30, custeioAnual: 60e6, efeitos: { deslocamento: -0.06 }, popRef: 4e6, popMin: 1.5e6 },
  { id: 'metro', nome: 'Nova Linha de Metrô', area: 'transporte', descricao: '12 km subterrâneos, 9 estações. Obra para mais de um mandato.', custo: 7.5e9, meses: 66, custeioAnual: 250e6, efeitos: { deslocamento: -0.14, crescimentoPIB: 0.002 }, popRef: 8e6, popMin: 4e6, ambiental: true },
  { id: 'rodovia', nome: 'Duplicação de Rodovia Estadual', area: 'infraestrutura', descricao: '180 km duplicados no principal eixo de escoamento.', custo: 1.1e9, meses: 36, custeioAnual: 25e6, efeitos: { crescimentoPIB: 0.003 }, popRef: 4e6, ambiental: true },
  { id: 'habitacao', nome: 'Programa Moradia Digna', area: 'infraestrutura', descricao: '12 mil unidades habitacionais e regularização fundiária.', custo: 1.4e9, meses: 30, custeioAnual: 20e6, efeitos: { pobreza: -0.05 }, popRef: 4e6 },
  { id: 'encostas', nome: 'Contenção de Encostas e Sirenes', area: 'infraestrutura', descricao: 'Muros de arrimo, drenagem e alerta nas áreas de risco.', custo: 230e6, meses: 14, custeioAnual: 12e6, efeitos: { mortalidadeInfantil: -0.01 }, popRef: 3e6 },
  { id: 'saneamento', nome: 'Programa Metropolitano de Saneamento', area: 'saneamento', descricao: 'Troncos coletores e ETE regional. Melhora a água das praias e baías.', custo: 2.2e9, meses: 42, custeioAnual: 60e6, efeitos: { esgoto: 6, mortalidadeInfantil: -0.06 }, popRef: 4e6, ambiental: true },
  { id: 'adutora', nome: 'Adutora e Segurança Hídrica', area: 'saneamento', descricao: 'Nova adutora e reservatórios contra a crise hídrica.', custo: 700e6, meses: 28, custeioAnual: 20e6, efeitos: { esgoto: 1.5 }, popRef: 3e6, ambiental: true },
  { id: 'polo', nome: 'Polo Tecnológico', area: 'desenvolvimento', descricao: 'Parque de inovação com incubadoras e fibra ótica.', custo: 420e6, meses: 24, custeioAnual: 30e6, efeitos: { crescimentoPIB: 0.002, desemprego: -0.004 }, popRef: 4e6 },
  { id: 'porto', nome: 'Porto Seco e Plataforma Logística', area: 'desenvolvimento', descricao: 'Terminal intermodal para a produção do interior.', custo: 650e6, meses: 30, custeioAnual: 15e6, efeitos: { crescimentoPIB: 0.0025 }, popRef: 4e6 },
  { id: 'arena', nome: 'Arena Multiuso e Centro de Eventos', area: 'cultura', descricao: 'Shows, congressos e o Carnaval fora de época.', custo: 380e6, meses: 26, custeioAnual: 25e6, efeitos: { crescimentoPIB: 0.0008 }, popRef: 4e6 },
];

export const obraDef = (id: string) => OBRAS.find((o) => o.id === id)!;

/** Definição efetiva de uma obra em andamento: do catálogo ou sob medida (vinda da cidade). */
export function defObra(o: ObraAtiva): DefObra {
  if (o.custom) {
    const c = o.custom;
    return { id: o.id, nome: c.nome, area: c.area, descricao: '', custo: c.custo, meses: c.meses, custeioAnual: c.custeioAnual, efeitos: {}, popRef: 1, ambiental: c.ambiental };
  }
  return obraDef(o.id);
}
