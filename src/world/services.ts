/** Encaixe de equipamentos públicos de frente para a via mais próxima (puro, usado no preview e no Worker). */
import { BUILD_HALF } from './constants';
import type { Footprint } from './lots';
import { bezTan, edgeEnds, findEdgeNear, halfRoad, type RoadGraph } from './roads';

export function serviceFootprint(g: RoadGraph, x: number, z: number, w: number, d: number): { fp: Footprint; edgeId: number } | null {
  const near = findEdgeNear(g, x, z, 70);
  if (!near) return null;
  const e = near.edge;
  const [p0, c, p1] = edgeEnds(g, e);
  const tg = bezTan(p0, c, p1, near.t);
  const side = Math.sign(tg.x * (z - near.z) - tg.z * (x - near.x)) || 1;
  const nx = -tg.z * side, nz = tg.x * side;
  const off = halfRoad(e.type) + 0.8 + d / 2;
  const fp = { x: near.x + nx * off, z: near.z + nz * off, angle: Math.atan2(-nx, -nz), w, d };
  if (Math.abs(fp.x) + d > BUILD_HALF || Math.abs(fp.z) + d > BUILD_HALF) return null;
  return { fp, edgeId: e.id };
}

/** Ponto dentro de um retângulo orientado? */
export function insideFootprint(f: Footprint, x: number, z: number, pad = 0): boolean {
  const c = Math.cos(f.angle), s = Math.sin(f.angle);
  const dx = x - f.x, dz = z - f.z;
  const lx = c * dx - s * dz, lz = s * dx + c * dz;
  return Math.abs(lx) <= f.w / 2 + pad && Math.abs(lz) <= f.d / 2 + pad;
}
