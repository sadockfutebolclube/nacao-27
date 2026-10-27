/**
 * Conjuntura macroeconômica do Brasil (Fase 9 — Modo Presidente), gerada por scripts/fetch-macro.ts
 * a partir do SGS e do Focus do Banco Central; composição do orçamento federal curada (RTN/Tesouro).
 */
import { z } from 'zod';

const Ponto = z.object({ data: z.string(), valor: z.number() });

export const DadosMacro = z.object({
  geradoEm: z.string(),
  /** data de referência de cada série (última observação) */
  selicMeta: z.number(),
  ipca12m: z.number(),
  cambio: z.number(),
  desemprego: z.number(),
  /** dívida bruta do governo geral (% PIB) */
  dividaBruta: z.number(),
  /** dívida líquida do setor público (% PIB) */
  dividaLiquida: z.number(),
  /** resultado primário do setor público, 12 meses (% PIB; positivo = superávit) */
  primario: z.number(),
  /** juros nominais do setor público, 12 meses (% PIB) */
  juros: z.number(),
  /** PIB nominal acumulado em 12 meses (R$) */
  pibNominal: z.number(),
  /** crescimento real do PIB no último ano fechado (%) */
  pibReal: z.number(),
  focus: z.object({ data: z.string(), ipcaAnoQueVem: z.number(), ipcaLongo: z.number(), selicFimAno: z.number().nullable() }),
  historico: z.object({ ipca12m: z.array(Ponto), selic: z.array(Ponto), cambio: z.array(Ponto), dividaBruta: z.array(Ponto), desemprego: z.array(Ponto) }),
  /** despesas e receitas primárias do governo central (% PIB) — aproximadas */
  orcamento: z.object({
    fonte: z.string(),
    receitaLiquida: z.number(),
    despesas: z.record(z.string(), z.number()),
  }),
  /** eleitorado (TSE 2022) por UF */
  eleitorado: z.record(z.string(), z.number()),
  fontes: z.array(z.object({ nome: z.string(), url: z.string() })),
});
export type DadosMacro = z.infer<typeof DadosMacro>;
