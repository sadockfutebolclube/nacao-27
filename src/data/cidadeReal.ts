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
    /**
     * [a, b, cx, cz, tipo (0 rua, 1 avenida), índice do nome] por aresta (id = índice + 1); com `campos` = 8 (Fase 14)
     * vêm também [faixas totais, flags: 1 mão única · 2 ponte/viaduto · 4 túnel]
     */
    arestas: z.array(z.number()),
    nomes: z.array(z.string()),
    /** campos por aresta (6 nos arquivos antigos) */
    campos: z.number().optional(),
    /** Fase 14: ids dos nós (índice + 1) com semáforo */
    semaforos: z.array(z.number()).optional(),
    /** Fase 14: faixas de pedestre no meio do quarteirão, [x, z, ângulo×1000 (direção da rua, atan2(tx, tz))] cada */
    faixasPed: z.array(z.number()).optional(),
    /** Fase 19: rotatórias validadas do OSM (`junction=roundabout`, círculo fechado de 8–40 m) — [x, z, raio] cada */
    rotatorias: z.array(z.number()).optional(),
    /** Fase 19: o que foi descartado e por quê (painel de depuração F3) */
    rotatoriasDescartadas: z.array(z.object({ nome: z.string(), motivo: z.string(), x: z.number(), z: z.number() })).optional(),
  }),
  /** [x, z, ângulo×1000, largura, profundidade, andares, tipo, aresta, índice do nome (−1 = sem nome)] por prédio */
  predios: z.array(z.number()),
  nomesPredios: z.array(z.string()),
  /**
   * Fase 12 — planta real de cada prédio, na mesma ordem de `predios`: Int16 em base64 com n e depois
   * n×(dx, dz) em decímetros a partir do centro, eixos do mundo, anel anti-horário visto de cima;
   * n = 0 quando a planta é o próprio retângulo (casas de quadra dividida, por exemplo).
   */
  contornos: z.string().optional(),
  /** Fase 16: nomes de bairro do OSM — [x, z, tipo (0 bairro, 1 sub-bairro/comunidade), índice do nome] cada */
  bairros: z.array(z.number()).optional(),
  nomesBairros: z.array(z.string()).optional(),
  estat: z.object({ predios: z.number(), comAndares: z.number(), vias: z.number(), km: z.number() }),
});
export type CidadeReal = z.infer<typeof CidadeReal>;

export const CAMPOS_PREDIO = 9;
export const CAMPOS_ARESTA = 6;

/** Bairro (tipo 0) mais perto de (x, z), ou null — para a ficha do lote. */
export function bairroMaisPerto(c: CidadeReal, x: number, z: number): string | null {
  const b = c.bairros, nomes = c.nomesBairros;
  if (!b || !nomes) return null;
  let melhor = -1, dm = Infinity;
  for (let i = 0; i < b.length; i += 4) {
    if (b[i + 2] !== 0) continue;
    const d = (b[i] - x) ** 2 + (b[i + 1] - z) ** 2;
    if (d < dm) { dm = d; melhor = b[i + 3]; }
  }
  return melhor >= 0 && dm < 2500 * 2500 ? nomes[melhor] : null;
}
export const FLAG_VIA = { MAO_UNICA: 1, PONTE: 2, TUNEL: 4 } as const;

export interface PredioReal { x: number; z: number; angle: number; w: number; d: number; andares: number; tipo: number; aresta: number; nome: string | null }

export function predio(c: CidadeReal, i: number): PredioReal {
  const p = c.predios, o = i * CAMPOS_PREDIO;
  return { x: p[o], z: p[o + 1], angle: p[o + 2] / 1000, w: p[o + 3], d: p[o + 4], andares: p[o + 5], tipo: p[o + 6], aresta: p[o + 7], nome: p[o + 8] >= 0 ? c.nomesPredios[p[o + 8]] : null };
}

const cacheContornos = new WeakMap<CidadeReal, { v: Int16Array; ini: Int32Array }>();

/**
 * Planta real do prédio `i` em coordenadas do mundo (anel anti-horário visto de cima), ou o retângulo
 * orientado quando o arquivo não traz contorno.
 */
export function contorno(c: CidadeReal, i: number): [number, number][] {
  const p = predio(c, i);
  let cc = cacheContornos.get(c);
  if (!cc && c.contornos) {
    const b = deBase64(c.contornos);
    const v = new Int16Array(b.buffer, b.byteOffset, b.byteLength / 2);
    const n = c.predios.length / CAMPOS_PREDIO;
    const ini = new Int32Array(n);
    for (let k = 0, o = 0; k < n && o < v.length; k++) { ini[k] = o; o += 1 + v[o] * 2; }
    cc = { v, ini };
    cacheContornos.set(c, cc);
  }
  if (cc) {
    const o = cc.ini[i], n = cc.v[o];
    if (n >= 3) {
      const out: [number, number][] = [];
      for (let k = 0; k < n; k++) out.push([p.x + cc.v[o + 1 + k * 2] / 10, p.z + cc.v[o + 2 + k * 2] / 10]);
      return out;
    }
  }
  return retangulo(p);
}

/** Retângulo orientado do prédio (anti-horário visto de cima). +X local = (cos a, −sin a), +Z local = (sin a, cos a), como nos lotes. */
export function retangulo(p: PredioReal): [number, number][] {
  const c0 = Math.cos(p.angle), s0 = Math.sin(p.angle), hw = p.w / 2, hd = p.d / 2;
  const canto = (lx: number, lz: number): [number, number] => [p.x + c0 * lx + s0 * lz, p.z - s0 * lx + c0 * lz];
  const r = [canto(-hw, -hd), canto(hw, -hd), canto(hw, hd), canto(-hw, hd)];
  let a = 0;
  for (let k = 0; k < 4; k++) { const [x1, z1] = r[k], [x2, z2] = r[(k + 1) % 4]; a += x1 * z2 - x2 * z1; }
  return a > 0 ? r.reverse() : r;
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
