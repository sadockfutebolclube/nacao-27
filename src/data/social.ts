/**
 * Indicadores sociais reais por UF (Fase 5): DATASUS (SINASC, SIM, CNES) e PNAD Contínua (SIDRA/IBGE).
 * Gerado por scripts/fetch-social.ts → public/data/social/indicadores.json
 */
import { z } from 'zod';

export const FonteSocial = z.object({ nome: z.string(), url: z.string(), periodo: z.string() });

export const SocialUF = z.object({
  /** nascidos vivos (SINASC, por residência da mãe) */
  nascidos: z.number(),
  /** óbitos de menores de 1 ano (SIM, por residência) */
  obitosInfantis: z.number(),
  /** óbitos infantis por mil nascidos vivos */
  mortalidadeInfantil: z.number(),
  /** leitos de internação SUS (CNES) */
  leitosSUS: z.number(),
  /** leitos SUS por mil habitantes */
  leitosPorMil: z.number(),
  /** taxa de desocupação (fração, PNAD Contínua trimestral) */
  desemprego: z.number(),
  /** % da população com renda domiciliar per capita abaixo da linha de extrema pobreza */
  extremaPobreza: z.number(),
  /** índice de Gini do rendimento domiciliar per capita */
  gini: z.number(),
  /** rendimento domiciliar per capita no percentil 50 (R$/mês) */
  rendaMediana: z.number(),
});
export type SocialUF = z.infer<typeof SocialUF>;

export const DadosSociais = z.object({
  geradoEm: z.string(),
  linhaExtremaPobreza: z.number(),
  fontes: z.record(z.string(), FonteSocial),
  valores: z.record(z.string(), SocialUF),
});
export type DadosSociais = z.infer<typeof DadosSociais>;
