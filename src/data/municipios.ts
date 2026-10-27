/**
 * Municípios jogáveis (Fase 8): as maiores cidades de cada UF com terreno e bioma derivados de dados
 * reais (altitude Copernicus via Open-Meteo, coordenadas da sede) — gerado por scripts/fetch-municipios.ts.
 */
import { z } from 'zod';
import type { NormaisUF } from './clima';
import { Bioma, Terreno } from './schemas';

export const MunicipioJogavel = z.object({
  ibge: z.string(),
  nome: z.string(),
  populacao: z.number(),
  capital: z.boolean(),
  lat: z.number(),
  lon: z.number(),
  /** altitude da sede (m) */
  elevacao: z.number(),
  /** desnível típico na área do mapa (P90 − P10, m) */
  desnivel: z.number(),
  distCostaKm: z.number(),
  terreno: Terreno,
  bioma: Bioma,
  /** ajuste do clima da capital para este município (estimado) */
  clima: z.object({ dTemp: z.number(), fChuva: z.number(), estimado: z.boolean() }),
  descricao: z.string(),
});
export type MunicipioJogavel = z.infer<typeof MunicipioJogavel>;

/** Ajusta as normais da capital para o município (altitude e semiárido): temperatura somada, chuva escalada. */
export function ajustarClima(n: NormaisUF, m: MunicipioJogavel): NormaisUF {
  if (m.capital) return n;
  const { dTemp, fChuva } = m.clima;
  return {
    ...n, capital: m.nome, lat: m.lat, lon: m.lon,
    meses: n.meses.map((x) => ({
      ...x, tMed: x.tMed + dTemp, tMax: x.tMax + dTemp, tMin: x.tMin + dTemp, tMaxP95: x.tMaxP95 + dTemp,
      chuva: x.chuva * fChuva, diasChuva: x.diasChuva * fChuva ** 0.7, p99: x.p99 * fChuva ** 0.5,
    })),
  };
}

export const MunicipiosUF = z.object({ sigla: z.string(), geradoEm: z.string(), municipios: z.array(MunicipioJogavel) });
export type MunicipiosUF = z.infer<typeof MunicipiosUF>;
