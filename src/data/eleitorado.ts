/**
 * Eleitorado real por município (Fase 7): TSE, perfil do eleitorado da eleição de 2022,
 * gerado por scripts/fetch-eleitorado.ts → public/data/eleitorado/{UF}.json
 */
import { z } from 'zod';

export const MunicipioEleitoral = z.object({
  /** código IBGE (casa com a malha em public/data/geo/municipios) */
  ibge: z.string(),
  nome: z.string(),
  eleitores: z.number(),
  /** frações do eleitorado */
  jovem: z.number(),
  idoso: z.number(),
  superior: z.number(),
  baixaEsc: z.number(),
  mulheres: z.number(),
});
export type MunicipioEleitoral = z.infer<typeof MunicipioEleitoral>;

export const EleitoradoUF = z.object({
  sigla: z.string(),
  ano: z.number(),
  fonte: z.string(),
  total: z.number(),
  municipios: z.array(MunicipioEleitoral),
});
export type EleitoradoUF = z.infer<typeof EleitoradoUF>;
