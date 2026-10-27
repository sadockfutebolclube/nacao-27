/**
 * Cidade real (Fase 11): relevo, água, verde, ruas e prédios de um município, gerados por
 * scripts/fetch-cidades.ts a partir do OpenStreetMap (© colaboradores do OSM, ODbL) e dos tiles de
 * altitude Terrarium (SRTM/GMTED). Coordenadas em metros no sistema do jogo: origem na sede,
 * +X leste, +Z sul. Arrays planos e compactos para caber no repositório.
 */
import { z } from 'zod';

export const TIPO_PREDIO = ['residencial', 'comercial', 'industrial', 'servico', 'religioso'] as const;

export const CidadeReal = z.object({
  versao: z.literal(1),
  ibge: z.string(),
  nome: z.string(),
  uf: z.string(),
  lat: z.number(),
  lon: z.number(),
  geradoEm: z.string(),
  /** altitude real subtraída das alturas (m); 0 no litoral (o mar fica em 0) */
  base: z.number(),
  litoral: z.boolean(),
  /** grade de alturas: `res`×`res` amostras a cada `passo` m, cobrindo o mapa inteiro (6.144 m) */
  passo: z.number(),
  res: z.number(),
  /** Int16 em decímetros, base64 (água e mar já rebaixados abaixo de 0) */
  alturas: z.string(),
  /** Uint8 0–255 de vegetação, grade de 32 m (192×192), base64 */
  verde: z.string(),
  vias: z.object({
    /** [x, z] por nó (id = índice + 1) */
    nos: z.array(z.number()),
    /** [a, b, cx, cz, tipo (0 rua, 1 avenida), índice do nome] por aresta (id = índice + 1) */
    arestas: z.array(z.number()),
    nomes: z.array(z.string()),
  }),
  /** [x, z, ângulo×1000, largura, profundidade, andares, tipo, aresta, índice do nome (−1 = sem nome)] por prédio */
  predios: z.array(z.number()),
  nomesPredios: z.array(z.string()),
  estat: z.object({ predios: z.number(), comAndares: z.number(), vias: z.number(), km: z.number() }),
});
export type CidadeReal = z.infer<typeof CidadeReal>;

export const CAMPOS_PREDIO = 9;
export const CAMPOS_ARESTA = 6;

export interface PredioReal { x: number; z: number; angle: number; w: number; d: number; andares: number; tipo: number; aresta: number; nome: string | null }

export function predio(c: CidadeReal, i: number): PredioReal {
  const p = c.predios, o = i * CAMPOS_PREDIO;
  return { x: p[o], z: p[o + 1], angle: p[o + 2] / 1000, w: p[o + 3], d: p[o + 4], andares: p[o + 5], tipo: p[o + 6], aresta: p[o + 7], nome: p[o + 8] >= 0 ? c.nomesPredios[p[o + 8]] : null };
}

/** base64 → bytes (navegador e Node). */
export function deBase64(b64: string): Uint8Array {
  if (typeof atob === 'function') {
    const s = atob(b64);
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }
  return new Uint8Array((globalThis as unknown as { Buffer: { from: (s: string, e: string) => Uint8Array } }).Buffer.from(b64, 'base64'));
}
