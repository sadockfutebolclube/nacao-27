/**
 * Geração de lotes ao longo das vias (estilo Cities: Skylines): cada lado de cada trecho
 * recebe lotes retangulares orientados de frente para a rua. Um raster de ocupação de 2 m
 * resolve conflitos (cruzamentos, curvas internas, água, encostas, equipamentos públicos).
 */
import { BUILD_HALF, LOT_D, LOT_D_SHALLOW, LOT_W, RASTER_CELL, RASTER_RES } from './constants';
import { edgeEnds, meiaVia, sampleByLength, type RoadGraph } from './roads';
import { sampleHeight, type Heightmap } from './terrain';

export interface LotGeom {
  edge: number;
  side: 1 | -1;
  x: number;
  z: number;
  /** Rotação Y: o eixo +Z local aponta para a rua (fachada). */
  angle: number;
  w: number;
  d: number;
  /** Cota do piso (menor altura sob o lote). */
  baseY: number;
  /** Fase 11: índice do prédio real (OSM) quando o lote é um prédio existente da cidade real */
  real?: number;
}

export interface Footprint { x: number; z: number; angle: number; w: number; d: number }

/** x, z, ângulo, largura, profundidade, cota, aresta, prédio real (índice + 1; 0 = lote comum) */
export const LOT_STRIDE = 8;

export function packLots(lots: LotGeom[]): Float32Array {
  const out = new Float32Array(lots.length * LOT_STRIDE);
  lots.forEach((l, i) => {
    const o = i * LOT_STRIDE;
    out[o] = l.x; out[o + 1] = l.z; out[o + 2] = l.angle; out[o + 3] = l.w; out[o + 4] = l.d; out[o + 5] = l.baseY; out[o + 6] = l.edge; out[o + 7] = l.real !== undefined ? l.real + 1 : 0;
  });
  return out;
}

const toCell = (v: number) => Math.floor((v + BUILD_HALF) / RASTER_CELL);

/** Percorre as células cobertas por um retângulo orientado. Retorna false se o visitante abortar. */
export function forRectCells(f: Footprint, visit: (idx: number) => boolean | void, pad = 0): boolean {
  const c = Math.cos(f.angle), s = Math.sin(f.angle);
  const hw = f.w / 2 + pad, hd = f.d / 2 + pad;
  const ex = Math.abs(c * hw) + Math.abs(s * hd);
  const ez = Math.abs(s * hw) + Math.abs(c * hd);
  const i0 = Math.max(0, toCell(f.x - ex)), i1 = Math.min(RASTER_RES - 1, toCell(f.x + ex));
  const j0 = Math.max(0, toCell(f.z - ez)), j1 = Math.min(RASTER_RES - 1, toCell(f.z + ez));
  for (let j = j0; j <= j1; j++) {
    const cz = -BUILD_HALF + (j + 0.5) * RASTER_CELL - f.z;
    for (let i = i0; i <= i1; i++) {
      const cx = -BUILD_HALF + (i + 0.5) * RASTER_CELL - f.x;
      // coordenadas locais (rotação inversa)
      const lx = c * cx - s * cz;
      const lz = s * cx + c * cz;
      if (Math.abs(lx) <= hw && Math.abs(lz) <= hd) {
        if (visit(j * RASTER_RES + i) === false) return false;
      }
    }
  }
  return true;
}

/** Rasteriza as vias (leito + calçada) como -1. */
export function rasterizeRoads(g: RoadGraph, raster: Int32Array) {
  for (const e of g.edges.values()) {
    // túnel e viaduto não têm calçada nem lotes ao lado (o leito não ocupa o chão)
    if (e.nivel) continue;
    const [p0, c, p1] = edgeEnds(g, e);
    const hw = meiaVia(e);
    const { pts } = sampleByLength(p0, c, p1, 2);
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      const ang = Math.atan2(b.x - a.x, b.z - a.z);
      forRectCells({ x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, angle: ang, w: hw * 2, d: len + 1.5 }, (idx) => { raster[idx] = -1; });
    }
    // disco no nó (cruzamentos limpos)
    for (const n of [g.nodes.get(e.a)!, g.nodes.get(e.b)!]) {
      forRectCells({ x: n.x, z: n.z, angle: 0, w: hw * 2.2, d: hw * 2.2 }, (idx) => { raster[idx] = -1; });
    }
  }
}

/** Código no raster para casas de ocupação informal (bloqueiam lotes, mas não umas às outras). */
export const RASTER_INFORMAL = -3;

/**
 * Prédios em encosta (Fase 33): a planta nunca é inclinada. O desnível sob ela até `DESNIVEL_MAX` (3 m) é vencido por uma base maciça ("pilotis até o
 * terreno": o prédio sobe da cota mais baixa e a base fica na mais alta, ver `plintoDoLote`); acima disso a base é REBAIXADA para 3 m acima do ponto mais
 * baixo (o lado de cima entra no morro, como num muro de arrimo) nos prédios reais do OSM, e os lotes gerados que passam do limite são descartados.
 */
export const DESNIVEL_MAX = 3;
/** Fase 34: prédio real com mais de tanto desnível sob a planta não cabe nem com base maciça (a casa ficaria enterrada de um lado e no ar do outro): o lote é removido e contado */
export const DESNIVEL_REMOVER = 8;
export const estatLotes = { comMuroDeArrimo: 0, descartadosPorDesnivel: 0, comBaseMaciça: 0, removidosPorDesnivel: 0 };

/** Altura (m) da base maciça sob o prédio: da cota da base até o ponto mais baixo do terreno sob a planta. */
export function plintoDoLote(hm: Heightmap, x: number, z: number, angle: number, w: number, d: number, baseY: number): number {
  return Math.max(0, baseY - Math.min(...cornerHeights(hm, { x, z, angle, w, d })));
}

export function computeLots(g: RoadGraph, hm: Heightmap, blockers: Footprint[], raster: Int32Array, informais: Footprint[] = [], fixos: (Footprint & { edge: number; ref: number })[] = []): LotGeom[] {
  raster.fill(0);
  estatLotes.comMuroDeArrimo = 0; estatLotes.descartadosPorDesnivel = 0; estatLotes.comBaseMaciça = 0; estatLotes.removidosPorDesnivel = 0;
  rasterizeRoads(g, raster);
  for (const b of blockers) forRectCells(b, (idx) => { raster[idx] = -2; });
  for (const b of informais) forRectCells(b, (idx) => { if (raster[idx] === 0) raster[idx] = RASTER_INFORMAL; });

  const lots: LotGeom[] = [];
  // Fase 11: prédios reais primeiro (lotes fixos). Ficam se a maior parte do terreno estiver livre e seco.
  for (const f of fixos) {
    let total = 0, livres = 0;
    forRectCells(f, (idx) => { total++; if (raster[idx] === 0) livres++; });
    if (!total || livres < total * 0.6) continue;
    const hs = cornerHeights(hm, f);
    if (Math.min(...hs) < 0.3 && hs[4] < 0.6) continue;
    if (Math.max(...hs) - Math.min(...hs) > DESNIVEL_REMOVER) { estatLotes.removidosPorDesnivel++; continue; }
    const id = lots.length + 1;
    forRectCells(f, (idx) => { if (raster[idx] === 0) raster[idx] = id; });
    const minR = Math.min(...hs), maxR = Math.max(...hs);
    // base na cota mais alta; passando de 3 m de desnível, rebaixada para 3 m sobre o ponto mais baixo (muro de arrimo no lado de cima)
    if (maxR - minR > DESNIVEL_MAX) estatLotes.comMuroDeArrimo++; else if (maxR - minR > 0.4) estatLotes.comBaseMaciça++;
    lots.push({ edge: f.edge, side: 1, x: f.x, z: f.z, angle: f.angle, w: f.w, d: f.d, baseY: Math.max(0.3, Math.min(maxR, minR + DESNIVEL_MAX)), real: f.ref });
  }
  const edges = [...g.edges.values()].sort((a, b) => a.id - b.id);
  for (const e of edges) {
    if (e.nivel) continue;
    const [p0, c, p1] = edgeEnds(g, e);
    const hw = meiaVia(e);
    const { pts, length } = sampleByLength(p0, c, p1, 1);
    if (length < LOT_W) continue;
    for (const side of [1, -1] as const) {
      for (let s = LOT_W / 2 + 1; s <= length - LOT_W / 2 - 1; s += LOT_W) {
        const p = pts[Math.min(pts.length - 1, Math.round(s))];
        // normal à esquerda/direita da tangente
        const nx = -p.tz * side, nz = p.tx * side;
        // lote "olha" para a rua: +Z local aponta para -normal
        const angle = Math.atan2(-nx, -nz);
        for (const depth of [LOT_D, LOT_D_SHALLOW]) {
          const off = hw + 0.4 + depth / 2;
          const lx = p.x + nx * off, lz = p.z + nz * off;
          const f: Footprint = { x: lx, z: lz, angle, w: LOT_W - 0.4, d: depth };
          if (Math.abs(lx) + depth > BUILD_HALF || Math.abs(lz) + depth > BUILD_HALF) break;
          // terreno: seco e sem encosta forte
          const hs = cornerHeights(hm, f);
          const minH = Math.min(...hs), maxH = Math.max(...hs);
          if (minH < 0.9) continue;
          if (maxH - minH > DESNIVEL_MAX) { estatLotes.descartadosPorDesnivel++; continue; }
          let livre = true;
          forRectCells(f, (idx) => { if (raster[idx] !== 0) { livre = false; return false; } });
          if (!livre) continue;
          const id = lots.length + 1;
          forRectCells(f, (idx) => { raster[idx] = id; });
          if (maxH - minH > 0.4) estatLotes.comBaseMaciça++;
          lots.push({ edge: e.id, side, x: lx, z: lz, angle, w: f.w, d: depth, baseY: maxH });
          break;
        }
      }
    }
  }
  return lots;
}

function cornerHeights(hm: Heightmap, f: Footprint): number[] {
  const c = Math.cos(f.angle), s = Math.sin(f.angle);
  const out: number[] = [];
  for (const [u, v] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5], [0, 0]]) {
    const lx = u * f.w, lz = v * f.d;
    out.push(sampleHeight(hm, f.x + c * lx + s * lz, f.z - s * lx + c * lz));
  }
  return out;
}

/** Transforma um ponto local do lote/equipamento (u ao longo da frente, v rumo à rua) em mundo. */
export function localToWorld(f: { x: number; z: number; angle: number }, lx: number, lz: number): [number, number] {
  const c = Math.cos(f.angle), s = Math.sin(f.angle);
  return [f.x + c * lx + s * lz, f.z - s * lx + c * lz];
}
