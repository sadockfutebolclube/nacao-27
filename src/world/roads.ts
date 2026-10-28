/**
 * Grafo viário com arestas em Bézier quadrática. Puro e serializável: o Worker é a fonte da
 * verdade; a thread principal usa as mesmas funções para pré-visualizar (custo, validade, snaps).
 */
import { BUILD_HALF, SNAP_DIST } from './constants';
import type { Heightmap } from './terrain';
import { sampleHeight } from './terrain';

export type RoadType = 'rua' | 'avenida';

export interface RoadSpec {
  nome: string;
  /** Largura do leito carroçável (m). */
  width: number;
  /** Largura de cada calçada (m). */
  sidewalk: number;
  lanes: number;
  /** Custo de implantação (R$/m). Pontes custam PONTE_MULT×. */
  custoM: number;
  /** Manutenção mensal (R$/m). */
  manutencaoM: number;
  velocidade: number;
}

export const ROAD_SPECS: Record<RoadType, RoadSpec> = {
  rua: { nome: 'Rua', width: 8, sidewalk: 2.5, lanes: 2, custoM: 2_400, manutencaoM: 2.2, velocidade: 11 },
  avenida: { nome: 'Avenida', width: 19, sidewalk: 4, lanes: 4, custoM: 6_500, manutencaoM: 5, velocidade: 16 },
};
export const PONTE_MULT = 4;

export const halfRoad = (t: RoadType) => ROAD_SPECS[t].width / 2 + ROAD_SPECS[t].sidewalk;

export interface RoadNode { id: number; x: number; z: number; /** Fase 14: cruzamento com semáforo */ semaforo?: boolean }
export interface RoadEdge {
  id: number; a: number; b: number; cx: number; cz: number; type: RoadType; name: string;
  /** Fase 14 (vias reais): faixas totais, mão única e nível (+1 ponte/viaduto, −1 túnel); ausentes = padrão do tipo */
  faixas?: number; maoUnica?: boolean; nivel?: -1 | 1;
}

/** Faixas totais da via (as da etiqueta do OSM nas vias reais, senão as do tipo). */
export const faixasVia = (e: Pick<RoadEdge, 'type' | 'faixas'>) => e.faixas ?? ROAD_SPECS[e.type].lanes;
/** Largura do leito (m): 3,2 m por faixa nas vias reais, com mínimo de 5 m (e um acostamento nas de mão dupla). */
export const larguraVia = (e: Pick<RoadEdge, 'type' | 'faixas' | 'maoUnica'>) =>
  e.faixas === undefined ? ROAD_SPECS[e.type].width : Math.max(5, Math.min(34, e.faixas * 3.2 + (e.maoUnica ? 0.6 : 1.4)));
/** Largura de cada calçada (m): maior nas avenidas, menor em via de uma faixa. */
export const calcadaVia = (e: Pick<RoadEdge, 'type' | 'faixas'>) => (e.faixas === undefined ? ROAD_SPECS[e.type].sidewalk : e.type === 'avenida' ? 3.5 : e.faixas <= 1 ? 1.6 : 2.2);
/** Meia largura total (leito + calçada) — o que os lotes e equipamentos têm de respeitar. */
export const meiaVia = (e: Pick<RoadEdge, 'type' | 'faixas' | 'maoUnica'>) => larguraVia(e) / 2 + calcadaVia(e);

export interface RoadGraph {
  nodes: Map<number, RoadNode>;
  edges: Map<number, RoadEdge>;
  nextNode: number;
  nextEdge: number;
}

export interface RoadGraphJSON { nodes: RoadNode[]; edges: RoadEdge[]; nextNode: number; nextEdge: number }

export const emptyGraph = (): RoadGraph => ({ nodes: new Map(), edges: new Map(), nextNode: 1, nextEdge: 1 });

export const graphToJSON = (g: RoadGraph): RoadGraphJSON => ({
  nodes: [...g.nodes.values()], edges: [...g.edges.values()], nextNode: g.nextNode, nextEdge: g.nextEdge,
});
export const graphFromJSON = (j: RoadGraphJSON): RoadGraph => ({
  nodes: new Map(j.nodes.map((n) => [n.id, { ...n }])),
  edges: new Map(j.edges.map((e) => [e.id, { ...e }])),
  nextNode: j.nextNode, nextEdge: j.nextEdge,
});

// ── Bézier quadrática ────────────────────────────────────────────────────────────────

export interface V2 { x: number; z: number }

export function bez(p0: V2, c: V2, p1: V2, t: number): V2 {
  const u = 1 - t;
  return { x: u * u * p0.x + 2 * u * t * c.x + t * t * p1.x, z: u * u * p0.z + 2 * u * t * c.z + t * t * p1.z };
}
export function bezTan(p0: V2, c: V2, p1: V2, t: number): V2 {
  const x = 2 * (1 - t) * (c.x - p0.x) + 2 * t * (p1.x - c.x);
  const z = 2 * (1 - t) * (c.z - p0.z) + 2 * t * (p1.z - c.z);
  const l = Math.hypot(x, z) || 1;
  return { x: x / l, z: z / l };
}
/** De Casteljau: divide a curva em t. */
export function splitBez(p0: V2, c: V2, p1: V2, t: number): [[V2, V2, V2], [V2, V2, V2]] {
  const c1 = { x: p0.x + (c.x - p0.x) * t, z: p0.z + (c.z - p0.z) * t };
  const c2 = { x: c.x + (p1.x - c.x) * t, z: c.z + (p1.z - c.z) * t };
  const m = bez(p0, c, p1, t);
  return [[p0, c1, m], [m, c2, p1]];
}

/** Amostras uniformes em t (suficiente para curvas suaves de via). */
export function sampleCurve(p0: V2, c: V2, p1: V2, n = 32): V2[] {
  const out: V2[] = [];
  for (let i = 0; i <= n; i++) out.push(bez(p0, c, p1, i / n));
  return out;
}

export function polyLength(pts: V2[]): number {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
  return L;
}

export function edgeEnds(g: RoadGraph, e: RoadEdge): [V2, V2, V2] {
  const a = g.nodes.get(e.a)!, b = g.nodes.get(e.b)!;
  return [a, { x: e.cx, z: e.cz }, b];
}

export function edgeLength(g: RoadGraph, e: RoadEdge): number {
  const [p0, c, p1] = edgeEnds(g, e);
  return polyLength(sampleCurve(p0, c, p1, 24));
}

/**
 * Amostragem por comprimento de arco: retorna pontos espaçados ~step metros, com t e
 * tangente. Base para a malha das vias, lotes e veículos.
 */
export function sampleByLength(p0: V2, c: V2, p1: V2, step: number) {
  const dense = sampleCurve(p0, c, p1, 64);
  const cum = [0];
  for (let i = 1; i < dense.length; i++) cum.push(cum[i - 1] + Math.hypot(dense[i].x - dense[i - 1].x, dense[i].z - dense[i - 1].z));
  const L = cum[cum.length - 1];
  const n = Math.max(1, Math.ceil(L / step));
  const pts: { x: number; z: number; t: number; s: number; tx: number; tz: number }[] = [];
  let k = 0;
  for (let i = 0; i <= n; i++) {
    const s = (L * i) / n;
    while (k < cum.length - 2 && cum[k + 1] < s) k++;
    const f = (s - cum[k]) / Math.max(1e-6, cum[k + 1] - cum[k]);
    const t = (k + f) / (dense.length - 1);
    const p = bez(p0, c, p1, t);
    const tg = bezTan(p0, c, p1, t);
    pts.push({ x: p.x, z: p.z, t, s, tx: tg.x, tz: tg.z });
  }
  return { pts, length: L };
}

// ── Consultas ────────────────────────────────────────────────────────────────────────

export function nodeDegree(g: RoadGraph, id: number): number {
  let d = 0;
  for (const e of g.edges.values()) if (e.a === id || e.b === id) d++;
  return d;
}

export function edgesAt(g: RoadGraph, id: number): RoadEdge[] {
  const out: RoadEdge[] = [];
  for (const e of g.edges.values()) if (e.a === id || e.b === id) out.push(e);
  return out;
}

export function findNodeNear(g: RoadGraph, x: number, z: number, maxD = SNAP_DIST): RoadNode | null {
  let best: RoadNode | null = null;
  let bd = maxD;
  for (const n of g.nodes.values()) {
    const d = Math.hypot(n.x - x, n.z - z);
    if (d < bd) { bd = d; best = n; }
  }
  return best;
}

/** Aresta mais próxima de (x,z) com parâmetro t e distância. */
export function findEdgeNear(g: RoadGraph, x: number, z: number, maxD = SNAP_DIST): { edge: RoadEdge; t: number; d: number; x: number; z: number } | null {
  let best: { edge: RoadEdge; t: number; d: number; x: number; z: number } | null = null;
  for (const e of g.edges.values()) {
    const [p0, c, p1] = edgeEnds(g, e);
    const minX = Math.min(p0.x, c.x, p1.x) - maxD, maxX = Math.max(p0.x, c.x, p1.x) + maxD;
    const minZ = Math.min(p0.z, c.z, p1.z) - maxD, maxZ = Math.max(p0.z, c.z, p1.z) + maxD;
    if (x < minX || x > maxX || z < minZ || z > maxZ) continue;
    const N = 48;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const p = bez(p0, c, p1, t);
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < maxD && (!best || d < best.d)) best = { edge: e, t, d, x: p.x, z: p.z };
    }
  }
  if (best) {
    // refina t localmente
    const [p0, c, p1] = edgeEnds(g, best.edge);
    let lo = Math.max(0, best.t - 1 / 48), hi = Math.min(1, best.t + 1 / 48);
    for (let it = 0; it < 20; it++) {
      const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3;
      const a = bez(p0, c, p1, m1), b = bez(p0, c, p1, m2);
      if (Math.hypot(a.x - x, a.z - z) < Math.hypot(b.x - x, b.z - z)) hi = m2; else lo = m1;
    }
    const t = (lo + hi) / 2;
    const p = bez(p0, c, p1, t);
    best = { edge: best.edge, t, d: Math.hypot(p.x - x, p.z - z), x: p.x, z: p.z };
  }
  return best;
}

function segIntersect(a: V2, b: V2, c: V2, d: V2): [number, number] | null {
  const r = { x: b.x - a.x, z: b.z - a.z };
  const s = { x: d.x - c.x, z: d.z - c.z };
  const den = r.x * s.z - r.z * s.x;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c.x - a.x) * s.z - (c.z - a.z) * s.x) / den;
  const u = ((c.x - a.x) * r.z - (c.z - a.z) * r.x) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return [t, u];
}

/** Primeira interseção (menor t na curva nova) com arestas existentes. */
function firstCrossing(g: RoadGraph, p0: V2, c: V2, p1: V2, ignoreNodes: Set<number>): { tNew: number; edge: RoadEdge; tEdge: number } | null {
  const N = 48;
  const pts = sampleCurve(p0, c, p1, N);
  let best: { tNew: number; edge: RoadEdge; tEdge: number } | null = null;
  const minX = Math.min(p0.x, c.x, p1.x), maxX = Math.max(p0.x, c.x, p1.x);
  const minZ = Math.min(p0.z, c.z, p1.z), maxZ = Math.max(p0.z, c.z, p1.z);
  for (const e of g.edges.values()) {
    const [q0, qc, q1] = edgeEnds(g, e);
    if (Math.max(q0.x, qc.x, q1.x) < minX || Math.min(q0.x, qc.x, q1.x) > maxX) continue;
    if (Math.max(q0.z, qc.z, q1.z) < minZ || Math.min(q0.z, qc.z, q1.z) > maxZ) continue;
    const M = 32;
    const qs = sampleCurve(q0, qc, q1, M);
    for (let i = 0; i < N; i++) {
      for (let k = 0; k < M; k++) {
        const hit = segIntersect(pts[i], pts[i + 1], qs[k], qs[k + 1]);
        if (!hit) continue;
        const tNew = (i + hit[0]) / N;
        const tEdge = (k + hit[1]) / M;
        const p = bez(p0, c, p1, tNew);
        // ignora toques nas pontas já conectadas
        const nearIgnored = [...ignoreNodes].some((id) => {
          const n = g.nodes.get(id);
          return n && Math.hypot(n.x - p.x, n.z - p.z) < SNAP_DIST + 1;
        });
        if (nearIgnored) continue;
        if (tNew < 0.002 || tNew > 0.998) continue;
        if (!best || tNew < best.tNew) best = { tNew, edge: e, tEdge };
      }
    }
  }
  return best;
}

// ── Planejamento (pré-visualização) e aplicação ──────────────────────────────────────

export interface RoadRequest { x0: number; z0: number; cx: number; cz: number; x1: number; z1: number; type: RoadType }

export interface RoadPlan {
  ok: boolean;
  erro?: string;
  custo: number;
  comprimento: number;
  ponteM: number;
  cruzamentos: number;
  snapA: 'no' | 'aresta' | null;
  snapB: 'no' | 'aresta' | null;
  /** Pontas efetivas após snap. */
  a: V2; b: V2;
}

/** Ajusta pontas a nós/arestas próximos (sem alterar o grafo). */
export function resolveEndpoint(g: RoadGraph, x: number, z: number): { p: V2; kind: 'no' | 'aresta' | null; nodeId?: number; edgeId?: number; t?: number } {
  const n = findNodeNear(g, x, z);
  if (n) return { p: { x: n.x, z: n.z }, kind: 'no', nodeId: n.id };
  const e = findEdgeNear(g, x, z);
  if (e) {
    // perto de uma ponta da aresta? usa o nó
    if (e.t < 0.04) { const nn = g.nodes.get(e.edge.a)!; return { p: { x: nn.x, z: nn.z }, kind: 'no', nodeId: nn.id }; }
    if (e.t > 0.96) { const nn = g.nodes.get(e.edge.b)!; return { p: { x: nn.x, z: nn.z }, kind: 'no', nodeId: nn.id }; }
    return { p: { x: e.x, z: e.z }, kind: 'aresta', edgeId: e.edge.id, t: e.t };
  }
  return { p: { x, z }, kind: null };
}

export function planRoad(g: RoadGraph, hm: Heightmap, req: RoadRequest): RoadPlan {
  const A = resolveEndpoint(g, req.x0, req.z0);
  const B = resolveEndpoint(g, req.x1, req.z1);
  const p0 = A.p, p1 = B.p;
  const straight = Math.hypot(req.cx - (req.x0 + req.x1) / 2, req.cz - (req.z0 + req.z1) / 2) < 0.01;
  const c = straight ? { x: (p0.x + p1.x) / 2, z: (p0.z + p1.z) / 2 } : { x: req.cx, z: req.cz };
  const pts = sampleCurve(p0, c, p1, 48);
  const L = polyLength(pts);
  const base: RoadPlan = { ok: false, custo: 0, comprimento: L, ponteM: 0, cruzamentos: 0, snapA: A.kind, snapB: B.kind, a: p0, b: p1 };
  if (L < 12) return { ...base, erro: 'Via curta demais' };
  if (L > 1600) return { ...base, erro: 'Trecho longo demais (máx. 1,6 km)' };
  if (A.kind === 'no' && B.kind === 'no' && A.nodeId === B.nodeId) return { ...base, erro: 'Início e fim no mesmo ponto' };
  const lim = BUILD_HALF - 20;
  if (pts.some((p) => Math.abs(p.x) > lim || Math.abs(p.z) > lim)) return { ...base, erro: 'Fora da área do município' };
  // curvatura: ângulo entre tangentes nas pontas
  const t0 = bezTan(p0, c, p1, 0), t1 = bezTan(p0, c, p1, 1);
  if (t0.x * t1.x + t0.z * t1.z < -0.2) return { ...base, erro: 'Curva fechada demais' };
  // declividade e trechos sobre a água
  let ponte = 0;
  let maxGrade = 0;
  for (let i = 1; i < pts.length; i++) {
    const seg = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
    const ha = sampleHeight(hm, pts[i - 1].x, pts[i - 1].z), hb = sampleHeight(hm, pts[i].x, pts[i].z);
    if (hb < 0.4) ponte += seg;
    if (ha > 0.4 && hb > 0.4) maxGrade = Math.max(maxGrade, Math.abs(hb - ha) / Math.max(seg, 0.01));
  }
  if (maxGrade > 0.35) return { ...base, erro: 'Ladeira íngreme demais (>35%)' };
  if (ponte > 700) return { ...base, erro: 'Ponte longa demais' };
  // duplicata
  if (A.nodeId && B.nodeId) {
    for (const e of g.edges.values()) {
      if ((e.a === A.nodeId && e.b === B.nodeId) || (e.a === B.nodeId && e.b === A.nodeId)) {
        if (Math.hypot(e.cx - c.x, e.cz - c.z) < 10) return { ...base, erro: 'Já existe uma via aqui' };
      }
    }
  }
  // cruzamentos (só contagem para o custo/feedback)
  let cruz = 0;
  const ignore = new Set<number>([A.nodeId ?? -1, B.nodeId ?? -1]);
  let rest: [V2, V2, V2] = [p0, c, p1];
  for (let guard = 0; guard < 40; guard++) {
    const hit = firstCrossing(g, rest[0], rest[1], rest[2], ignore);
    if (!hit) break;
    cruz++;
    rest = splitBez(rest[0], rest[1], rest[2], hit.tNew)[1];
    if (polyLength(sampleCurve(rest[0], rest[1], rest[2], 12)) < 2) break;
  }
  const spec = ROAD_SPECS[req.type];
  const custo = Math.round((L - ponte) * spec.custoM + ponte * spec.custoM * PONTE_MULT);
  return { ...base, ok: true, custo, ponteM: ponte, cruzamentos: cruz };
}

function addNode(g: RoadGraph, x: number, z: number): RoadNode {
  const n = { id: g.nextNode++, x, z };
  g.nodes.set(n.id, n);
  return n;
}

function addEdge(g: RoadGraph, a: number, b: number, c: V2, type: RoadType, name: string): RoadEdge {
  const e = { id: g.nextEdge++, a, b, cx: c.x, cz: c.z, type, name };
  g.edges.set(e.id, e);
  return e;
}

/** Divide a aresta em t, criando um nó. Retorna o nó e as duas novas arestas. */
export function splitEdge(g: RoadGraph, edgeId: number, t: number): { node: RoadNode; left: RoadEdge; right: RoadEdge; removed: RoadEdge } {
  const e = g.edges.get(edgeId)!;
  const [p0, c, p1] = edgeEnds(g, e);
  const [L, R] = splitBez(p0, c, p1, t);
  const node = addNode(g, L[2].x, L[2].z);
  g.edges.delete(edgeId);
  const left = addEdge(g, e.a, node.id, L[1], e.type, e.name);
  const right = addEdge(g, node.id, e.b, R[1], e.type, e.name);
  return { node, left, right, removed: e };
}

export interface ApplyResult { created: number[]; removed: number[]; splitMap: Map<number, number[]> }

/**
 * Aplica uma via planejada: snaps, divisão de arestas cruzadas e criação dos trechos.
 * Pressupõe planRoad(...).ok === true.
 */
export function applyRoad(g: RoadGraph, req: RoadRequest, nameFor: () => string): ApplyResult {
  const created: number[] = [];
  const removed: number[] = [];
  const splitMap = new Map<number, number[]>();
  const noteSplit = (old: number, a: number, b: number) => {
    removed.push(old);
    // se a aresta dividida era nova nesta operação, substitui na lista
    const idx = created.indexOf(old);
    if (idx >= 0) created.splice(idx, 1, a, b);
    const prev = splitMap.get(old);
    splitMap.set(old, [a, b]);
    if (prev) splitMap.delete(old);
  };

  const endpoint = (x: number, z: number): number => {
    const r = resolveEndpoint(g, x, z);
    if (r.kind === 'no') return r.nodeId!;
    if (r.kind === 'aresta') {
      const s = splitEdge(g, r.edgeId!, r.t!);
      noteSplit(s.removed.id, s.left.id, s.right.id);
      return s.node.id;
    }
    return addNode(g, x, z).id;
  };

  const straight = Math.hypot(req.cx - (req.x0 + req.x1) / 2, req.cz - (req.z0 + req.z1) / 2) < 0.01;
  const aId = endpoint(req.x0, req.z0);
  const bId = endpoint(req.x1, req.z1);
  const A = g.nodes.get(aId)!, B = g.nodes.get(bId)!;
  const c = straight ? { x: (A.x + B.x) / 2, z: (A.z + B.z) / 2 } : { x: req.cx, z: req.cz };
  const name = nameFor();

  let cur: [V2, V2, V2] = [A, c, B];
  let curStart = aId;
  const ignore = new Set<number>([aId, bId]);
  for (let guard = 0; guard < 60; guard++) {
    const hit = firstCrossing(g, cur[0], cur[1], cur[2], ignore);
    if (!hit) break;
    // ponto de cruzamento: reaproveita nó próximo se houver
    const [Lc, Rc] = splitBez(cur[0], cur[1], cur[2], hit.tNew);
    const px = Lc[2].x, pz = Lc[2].z;
    let crossNode = findNodeNear(g, px, pz, SNAP_DIST);
    if (!crossNode) {
      const s = splitEdge(g, hit.edge.id, hit.tEdge);
      noteSplit(s.removed.id, s.left.id, s.right.id);
      crossNode = s.node;
    }
    ignore.add(crossNode.id);
    if (crossNode.id !== curStart) {
      const ne = addEdge(g, curStart, crossNode.id, Lc[1], req.type, name);
      created.push(ne.id);
    }
    curStart = crossNode.id;
    cur = [crossNode, Rc[1], Rc[2]];
  }
  if (curStart !== bId) {
    const ne = addEdge(g, curStart, bId, cur[1], req.type, name);
    created.push(ne.id);
  }
  return { created, removed, splitMap };
}

/** Remove uma aresta e nós órfãos. */
export function removeEdge(g: RoadGraph, edgeId: number): boolean {
  const e = g.edges.get(edgeId);
  if (!e) return false;
  g.edges.delete(edgeId);
  for (const id of [e.a, e.b]) if (nodeDegree(g, id) === 0) g.nodes.delete(id);
  return true;
}

/** Componentes conexos (union-find) — base das redes de água, luz e esgoto. */
export function components(g: RoadGraph): Map<number, number> {
  const parent = new Map<number, number>();
  const find = (x: number): number => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    let y = x;
    while (parent.get(y) !== r) { const nx = parent.get(y)!; parent.set(y, r); y = nx; }
    return r;
  };
  for (const id of g.nodes.keys()) parent.set(id, id);
  for (const e of g.edges.values()) {
    const ra = find(e.a), rb = find(e.b);
    if (ra !== rb) parent.set(ra, rb);
  }
  const out = new Map<number, number>();
  for (const id of g.nodes.keys()) out.set(id, find(id));
  return out;
}
