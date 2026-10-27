/**
 * Macroeconomia do Modo Presidente (Fase 9): um modelo novo-keynesiano pequeno, mensal, calibrado na
 * conjuntura real (SGS/Focus do Banco Central). Equações em SIMULATION.md, Parte VIII.
 *
 *  hiato     h' = 0,93h − 0,03(r − r*) + 0,3·impulso fiscal + commodities + choques
 *  inflação  π' = π + 0,12(πᵉ − π) + 0,035h + 0,1·Δcâmbio(%) + choques
 *  expect.   πᵉ' = πᵉ + 0,08(π − πᵉ) + 0,06·credibilidade·(meta − πᵉ) + 0,4·Δrisco fiscal
 *  câmbio    ln e' = ln e + 0,08(ln e* − ln e) + σε, e* sobe com o risco fiscal e cai com o diferencial de juros
 *  desemprego u' = u + 0,12(uₙ − 0,45h − u)
 *  dívida    d' = d + [d(i − g)/(1 + g) − primário]/12
 *  Copom     regra de Taylor com suavização, viés do presidente do BC, passos de 0,25 p.p.
 */
import type { Rng } from '../core/rng';
import type { DadosMacro } from '../../data/macro';

export const META_INFLACAO = 3;
export const JURO_NEUTRO = 5.25;
const POTENCIAL = 2.0;
const U_NATURAL = 6.2;

export type Programa = 'previdencia' | 'pessoal' | 'bpc' | 'abonoSeguro' | 'bolsa' | 'saude' | 'educacao' | 'investimentos' | 'emendas' | 'custeio';
export const PROGRAMAS: { id: Programa; nome: string; obrigatoria: boolean; dica: string }[] = [
  { id: 'previdencia', nome: 'Previdência (RGPS)', obrigatoria: true, dica: 'Aposentadorias e pensões do INSS — cresce com o envelhecimento e o salário mínimo.' },
  { id: 'pessoal', nome: 'Pessoal e encargos', obrigatoria: true, dica: 'Servidores civis e militares, ativos e inativos.' },
  { id: 'bpc', nome: 'BPC/LOAS', obrigatoria: true, dica: 'Benefício de um salário mínimo a idosos e pessoas com deficiência de baixa renda.' },
  { id: 'abonoSeguro', nome: 'Abono e seguro-desemprego', obrigatoria: true, dica: 'Sobe quando o desemprego sobe.' },
  { id: 'bolsa', nome: 'Transferência de renda', obrigatoria: false, dica: 'O programa de renda às famílias pobres. Popular, barato perto da Previdência.' },
  { id: 'saude', nome: 'Saúde (SUS)', obrigatoria: false, dica: 'Piso constitucional de 15% da receita corrente líquida.' },
  { id: 'educacao', nome: 'Educação', obrigatoria: false, dica: 'Piso constitucional de 18% da receita de impostos.' },
  { id: 'investimentos', nome: 'Investimentos', obrigatoria: false, dica: 'Obras e equipamentos: o primeiro alvo do contingenciamento — e o que mais puxa o PIB.' },
  { id: 'emendas', nome: 'Emendas parlamentares', obrigatoria: false, dica: 'Individuais e de bancada são impositivas; cortá-las irrita o Congresso.' },
  { id: 'custeio', nome: 'Custeio da máquina', obrigatoria: false, dica: 'Funcionamento dos ministérios e órgãos.' },
];

export interface Economia {
  hiato: number;
  inflacao: number;
  expectativa: number;
  selic: number;
  cambio: number;
  /** câmbio de referência no início (para o fundamento) */
  cambio0: number;
  desemprego: number;
  /** crescimento real do PIB em 12 meses (%) */
  crescimento: number;
  /** PIB nominal em 12 meses (R$) */
  pib: number;
  divida: number;
  receita: number;
  /** despesa primária (% PIB) por programa — o orçamento executado */
  despesas: Record<Programa, number>;
  primario: number;
  /** credibilidade do BC (0–1): ancora as expectativas */
  credibilidade: number;
  /** percepção de risco fiscal (0–1): câmbio, expectativas, juros longos */
  risco: number;
  fed: number;
  /** termos de troca (0 = neutro; +0,1 = commodities 10% acima) */
  commodities: number;
  choques: { inflacao: number; hiato: number; cambio: number; receita: number };
  /** hiato dos últimos 12 meses (cálculo do crescimento) */
  hist: number[];
  meta: number;
  /** ajuste permanente de receita por medidas (% PIB) */
  receitaMedidas: number;
  juroImplicito0: number;
  selic0: number;
  /** meta de inflação do CMN (%) */
  metaInflacao: number;
}

export function criarEconomia(m: DadosMacro): Economia {
  const desp = m.orcamento.despesas as Record<Programa, number>;
  // desemprego abaixo do natural ⇒ economia acima do potencial
  const hiato = (U_NATURAL - m.desemprego) / 0.45 * 0.5;
  const receita = m.orcamento.receitaLiquida;
  const primario = receita - Object.values(desp).reduce((a, b) => a + b, 0);
  return {
    hiato, inflacao: m.ipca12m, expectativa: m.focus.ipcaAnoQueVem, selic: m.selicMeta, cambio: m.cambio, cambio0: m.cambio,
    desemprego: m.desemprego, crescimento: m.pibReal, pib: m.pibNominal, divida: m.dividaBruta, receita, despesas: { ...desp }, primario,
    credibilidade: 0.72, risco: riscoFiscal(m.dividaBruta, primario, 0, 0.72), fed: 3.75, commodities: 0,
    choques: { inflacao: 0, hiato: 0, cambio: 0, receita: 0 }, hist: Array(12).fill(hiato), meta: 0, receitaMedidas: 0,
    juroImplicito0: (m.juros / m.dividaBruta) * 100, selic0: m.selicMeta, metaInflacao: META_INFLACAO,
  };
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const normal = (rng: Rng) => Math.sqrt(-2 * Math.log(Math.max(1e-9, rng.next()))) * Math.cos(2 * Math.PI * rng.next());

/** Risco fiscal 0–1: dívida, distância da meta, descumprimentos e a confiança no BC. */
export function riscoFiscal(divida: number, primario: number, desvioMeta: number, credibilidade: number): number {
  const x = 0.07 * (divida - 82) - 0.9 * (primario + 0.6) + 1.2 * Math.max(0, desvioMeta) - 1.5 * (credibilidade - 0.72);
  return clamp(1 / (1 + Math.exp(-(x - 0.2))), 0.02, 0.98);
}

export const despesaTotal = (e: Economia) => Object.values(e.despesas).reduce((a, b) => a + b, 0);

/** Um mês da economia. `impulso` = variação da despesa primária no mês (% PIB). */
export function passoEconomia(e: Economia, rng: Rng, par: { impulso: number; descumpriuMeta: boolean }) {
  const juroReal = e.selic - e.expectativa;
  const riscoAntes = e.risco, cambioAntes = e.cambio;
  // termos de troca: passeio aleatório com volta à média
  e.commodities = clamp(0.95 * e.commodities + 0.025 * normal(rng), -0.4, 0.4);
  e.fed = clamp(e.fed + 0.04 * normal(rng) - 0.01 * (e.fed - 3.25), 1, 6);

  e.hiato = clamp(0.93 * e.hiato - 0.03 * (juroReal - JURO_NEUTRO) + 0.3 * par.impulso + 0.06 * e.commodities + e.choques.hiato + 0.12 * normal(rng) - 0.6 * (e.risco - riscoAntes), -8, 6);
  e.hist.push(e.hiato);
  if (e.hist.length > 12) e.hist.shift();
  e.crescimento = POTENCIAL + (e.hiato - e.hist[0]) + 0.15 * normal(rng);

  // fiscal: receita cíclica (a despesa é recalculada pelo Planalto: orçamento + medidas − contingenciamento)
  e.receita = 18.6 + e.receitaMedidas + 0.12 * e.hiato + 0.6 * e.commodities + e.choques.receita;
  e.primario = e.receita - despesaTotal(e);
  // deflator do PIB ≈ IPCA + 0,8 p.p.; juro implícito da dívida calibrado nos juros nominais reais (% PIB ÷ dívida)
  const gNom = (e.crescimento + e.inflacao + 0.8) / 100;
  const iEff = (e.juroImplicito0 + 0.55 * (e.selic - e.selic0)) / 100;
  e.divida = clamp(e.divida + ((e.divida * (iEff - gNom)) / (1 + gNom) - e.primario) / 12, 20, 200);
  e.pib *= 1 + gNom / 12;
  e.risco = riscoFiscal(e.divida, e.primario, par.descumpriuMeta ? e.meta - e.primario : 0, e.credibilidade);

  // câmbio: fundamento + ruído
  const difJuros = e.selic - e.fed;
  const fund = e.cambio0 * Math.exp(0.4 * (e.risco - 0.45) - 0.025 * (difJuros - 10) - 0.5 * e.commodities);
  e.cambio = Math.exp(Math.log(e.cambio) + 0.08 * (Math.log(fund) - Math.log(e.cambio)) + 0.022 * normal(rng) + e.choques.cambio);
  const dCambio = (e.cambio / cambioAntes - 1) * 100;

  // inflação e expectativas
  e.inflacao = clamp(e.inflacao + 0.12 * (e.expectativa - e.inflacao) + 0.035 * e.hiato + 0.1 * dCambio + e.choques.inflacao + 0.12 * normal(rng), -2, 30);
  e.expectativa = clamp(e.expectativa + 0.08 * (e.inflacao - e.expectativa) + 0.06 * e.credibilidade * (e.metaInflacao - e.expectativa) + 0.4 * (e.risco - riscoAntes) + 0.01 * dCambio, -1, 25);
  e.desemprego = clamp(e.desemprego + 0.12 * (U_NATURAL - 0.45 * e.hiato - e.desemprego) + 0.05 * normal(rng), 3, 20);
  // credibilidade se reconstrói devagar quando a inflação converge
  e.credibilidade = clamp(e.credibilidade + 0.01 * (0.8 - e.credibilidade) - 0.004 * Math.max(0, Math.abs(e.expectativa - e.metaInflacao) - 1), 0.1, 0.95);

  for (const k of Object.keys(e.choques) as (keyof Economia['choques'])[]) e.choques[k] *= 0.6;
}

/** Decisão do Copom: Taylor com suavização. `vies` > 0 = presidente do BC mais duro. */
export function decisaoCopom(e: Economia, vies: number): number {
  const alvo = JURO_NEUTRO + e.expectativa + 1.5 * (e.expectativa - e.metaInflacao) + 0.5 * e.hiato + 0.8 * vies + 2 * (e.risco - 0.45);
  const passo = clamp((alvo - e.selic) * 0.5, -1, 1);
  const q = Math.round(passo * 4) / 4;
  return clamp(Math.round((e.selic + (Math.abs(q) < 0.25 ? 0 : q)) * 4) / 4, 2, 30);
}

/** Calendário do Copom (8 reuniões por ano; datas típicas de anúncio). */
export const COPOM: [number, number][] = [[1, 27], [3, 17], [5, 5], [6, 16], [7, 28], [9, 15], [11, 3], [12, 8]];
