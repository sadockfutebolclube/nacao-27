/**
 * Perfil 3D de cada trecho (amostras a cada ~3 m com cota suavizada). Usado pela malha das
 * vias, pelos postes e pelos veículos — todos andam exatamente sobre o mesmo asfalto.
 */
import { edgeEnds, halfRoad, nodeDegree, ROAD_SPECS, sampleByLength, type RoadEdge, type RoadGraph } from '../../world/roads';
import { roadBaseY, type Heightmap } from '../../world/terrain';

export interface Perfil {
  edge: RoadEdge;
  n: number;
  x: Float32Array; y: Float32Array; z: Float32Array;
  tx: Float32Array; tz: Float32Array;
  s: Float32Array;
  comprimento: number;
  /** recorte (m) nas pontas por causa do cruzamento */
  cortaA: number;
  cortaB: number;
}

export function raioNo(g: RoadGraph, nodeId: number): number {
  const grau = nodeDegree(g, nodeId);
  if (grau < 3) return 0;
  let r = 0;
  for (const e of g.edges.values()) if (e.a === nodeId || e.b === nodeId) r = Math.max(r, ROAD_SPECS[e.type].width / 2);
  return r + 1.5;
}

export function construirPerfis(g: RoadGraph, hm: Heightmap): Map<number, Perfil> {
  const out = new Map<number, Perfil>();
  const raios = new Map<number, number>();
  const raio = (id: number) => raios.get(id) ?? (raios.set(id, raioNo(g, id)), raios.get(id)!);
  for (const e of g.edges.values()) {
    const [p0, c, p1] = edgeEnds(g, e);
    const { pts, length } = sampleByLength(p0, c, p1, 3);
    const n = pts.length;
    const x = new Float32Array(n), y = new Float32Array(n), z = new Float32Array(n);
    const tx = new Float32Array(n), tz = new Float32Array(n), s = new Float32Array(n);
    const bruto = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const p = pts[i];
      x[i] = p.x; z[i] = p.z; tx[i] = p.tx; tz[i] = p.tz; s[i] = p.s;
      bruto[i] = roadBaseY(hm, p.x, p.z);
    }
    // suavização (média móvel) mantendo as pontas fixas para casar com os nós
    for (let i = 0; i < n; i++) {
      if (i === 0 || i === n - 1) { y[i] = bruto[i]; continue; }
      let soma = 0, k = 0;
      for (let d = -3; d <= 3; d++) {
        const j = Math.min(n - 1, Math.max(0, i + d));
        soma += bruto[j]; k++;
      }
      const t = Math.min(i, n - 1 - i) / 3;
      y[i] = bruto[i] + (soma / k - bruto[i]) * Math.min(1, t);
      // nunca abaixo do terreno (evita asfalto enterrado)
      y[i] = Math.max(y[i], bruto[i] - 0.15);
    }
    out.set(e.id, { edge: e, n, x, y, z, tx, tz, s, comprimento: length, cortaA: raio(e.a), cortaB: raio(e.b) });
  }
  return out;
}

/** Posição e tangente ao longo do perfil (s em metros). */
export function amostrarPerfil(p: Perfil, s: number, out: { x: number; y: number; z: number; tx: number; tz: number }) {
  const L = p.comprimento;
  const ss = Math.min(L, Math.max(0, s));
  const f = (ss / Math.max(1e-6, L)) * (p.n - 1);
  const i = Math.min(p.n - 2, Math.floor(f));
  const t = f - i;
  out.x = p.x[i] + (p.x[i + 1] - p.x[i]) * t;
  out.y = p.y[i] + (p.y[i + 1] - p.y[i]) * t;
  out.z = p.z[i] + (p.z[i + 1] - p.z[i]) * t;
  out.tx = p.tx[i] + (p.tx[i + 1] - p.tx[i]) * t;
  out.tz = p.tz[i] + (p.tz[i + 1] - p.tz[i]) * t;
  return out;
}

export const meiaLargura = halfRoad;
