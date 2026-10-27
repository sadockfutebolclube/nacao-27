/**
 * Normais climatológicas mensais das 27 capitais (Fase 6), geradas por scripts/fetch-clima.ts
 * a partir da reanálise ERA5 (Open-Meteo), período 1991–2020 — o mesmo período das normais da OMM/INMET.
 */
import { z } from 'zod';

export const MesClima = z.object({
  /** temperatura média, média das máximas e das mínimas (°C) */
  tMed: z.number(), tMax: z.number(), tMin: z.number(),
  /** chuva acumulada no mês (mm) */
  chuva: z.number(),
  /** dias com chuva ≥ 1 mm */
  diasChuva: z.number(),
  /** chuva diária no percentil 99 dos dias chuvosos (mm) — temporais */
  p99: z.number(),
  /** máxima diária no percentil 95 (°C) — calor extremo */
  tMaxP95: z.number(),
});
export type MesClima = z.infer<typeof MesClima>;

export const NormaisUF = z.object({
  capital: z.string(),
  lat: z.number(), lon: z.number(),
  meses: z.array(MesClima).length(12),
});
export type NormaisUF = z.infer<typeof NormaisUF>;

export const DadosClima = z.object({
  geradoEm: z.string(),
  fonte: z.string(),
  periodo: z.string(),
  ufs: z.record(z.string(), NormaisUF),
});
export type DadosClima = z.infer<typeof DadosClima>;
