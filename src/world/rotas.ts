/**
 * Roteamento no grafo viário: Dijkstra com heap binário (puro). Usado pelas linhas de ônibus/BRT
 * (caminho entre paradas) e pelo modelo de deslocamentos (árvores de menor tempo por zona).
 */
import { edgeEnds, findNodeNear, sampleCurve, type RoadGraph, type V2 } from './roads';

/** Heap mínimo de pares (chave, valor). */
export class HeapMin {
  private k: number[] = [];
  private v: number[] = [];
  get tamanho() { return this.k.length; }
  push(chave: number, valor: number) {
    this.k.push(chave); this.v.push(valor);
    let i = this.k.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.k[p] <= this.k[i]) break;
      [this.k[p], this.k[i]] = [this.k[i], this.k[p]];
      [this.v[p], this.v[i]] = [this.v[i], this.v[p]];
      i = p;
    }
  }
  pop(): [number, number] {
    const rk = this.k[0], rv = this.v[0];
    const lk = this.k.pop()!, lv = this.v.pop()!;
    if (this.k.length) {
      this.k[0] = lk; this.v[0] = lv;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < this.k.length && this.k[l] < this.k[m]) m = l;
        if (r < this.k.length && this.k[r] < this.k[m]) m = r;
        if (m === i) break;
        [this.k[m], this.k[i]] = [this.k[i], this.k[m]];
        [this.v[m], this.v[i]] = [this.v[i], this.v[m]];
        i = m;
      }
    }
    return [rk, rv];
  }
}

/** Grafo compacto (índices densos) para rodar Dijkstra muitas vezes por semana. */
export interface GrafoCompacto {
  nodeIds: number[];
  indice: Map<number, number>;
  x: Float64Array; z: Float64Array;
  /** adjacência: para cada nó, lista de [vizinho, idxAresta] */
  adj: { viz: number; aresta: number }[][];
  arestaIds: number[];
  comprimento: Float64Array;
  avenida: Uint8Array;
}

export function compactar(g: RoadGraph): GrafoCompacto {
  const nodeIds = [...g.nodes.keys()];
  const indice = new Map(nodeIds.map((id, i) => [id, i]));
  const x = new Float64Array(nodeIds.length), z = new Float64Array(nodeIds.length);
  nodeIds.forEach((id, i) => { const n = g.nodes.get(id)!; x[i] = n.x; z[i] = n.z; });
  const adj: GrafoCompacto['adj'] = nodeIds.map(() => []);
  const arestaIds: number[] = [];
  const comp: number[] = [];
  const av: number[] = [];
  for (const e of g.edges.values()) {
    const a = indice.get(e.a), b = indice.get(e.b);
    if (a === undefined || b === undefined) continue;
    const k = arestaIds.length;
    arestaIds.push(e.id);
    const [p0, c, p1] = edgeEnds(g, e);
    const pts = sampleCurve(p0, c, p1, 12);
    let L = 0;
    for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
    comp.push(L);
    av.push(e.type === 'avenida' ? 1 : 0);
    adj[a].push({ viz: b, aresta: k });
    adj[b].push({ viz: a, aresta: k });
  }
  return { nodeIds, indice, x, z, adj, arestaIds, comprimento: Float64Array.from(comp), avenida: Uint8Array.from(av) };
}

/**
 * Árvore de menor custo a partir de um nó. `custo(k)` dá o custo da aresta compacta k
 * (Infinity = proibida). Retorna distâncias e aresta predecessora de cada nó.
 */
export function dijkstra(G: GrafoCompacto, origem: number, custo: (k: number) => number): { dist: Float64Array; pred: Int32Array; predNo: Int32Array } {
  const n = G.nodeIds.length;
  const dist = new Float64Array(n).fill(Infinity);
  const pred = new Int32Array(n).fill(-1);
  const predNo = new Int32Array(n).fill(-1);
  const h = new HeapMin();
  dist[origem] = 0;
  h.push(0, origem);
  while (h.tamanho) {
    const [d, u] = h.pop();
    if (d > dist[u]) continue;
    for (const { viz, aresta } of G.adj[u]) {
      const c = custo(aresta);
      if (!Number.isFinite(c)) continue;
      const nd = d + c;
      if (nd < dist[viz]) { dist[viz] = nd; pred[viz] = aresta; predNo[viz] = u; h.push(nd, viz); }
    }
  }
  return { dist, pred, predNo };
}

export function noMaisProximo(G: GrafoCompacto, x: number, z: number, maxD = Infinity): number {
  let melhor = -1, bd = maxD;
  for (let i = 0; i < G.nodeIds.length; i++) {
    const d = Math.hypot(G.x[i] - x, G.z[i] - z);
    if (d < bd) { bd = d; melhor = i; }
  }
  return melhor;
}

export interface RotaOnibus { ok: boolean; erro?: string; caminho: number[]; comprimento: number; arestas: number[] }

/**
 * Rota de ônibus/BRT pelas vias passando pelas paradas na ordem. Cada parada encaixa no nó
 * mais próximo (até 60 m). BRT só pode usar avenidas (corredor exclusivo).
 */
export function rotaPorVias(g: RoadGraph, paradas: V2[], soAvenidas: boolean): RotaOnibus {
  const vazio = { ok: false, caminho: [], comprimento: 0, arestas: [] as number[] };
  if (paradas.length < 2) return { ...vazio, erro: 'Coloque ao menos 2 paradas' };
  const G = compactar(g);
  const nos: number[] = [];
  for (const p of paradas) {
    const n = findNodeNear(g, p.x, p.z, 60);
    const i = n ? G.indice.get(n.id)! : noMaisProximo(G, p.x, p.z, 60);
    if (i === undefined || i < 0) return { ...vazio, erro: 'Parada longe demais de uma via (máx. 60 m de um cruzamento ou ponta)' };
    nos.push(i);
  }
  const custo = (k: number) => (soAvenidas && !G.avenida[k] ? Infinity : G.comprimento[k]);
  const caminho: number[] = [];
  const arestasUsadas: number[] = [];
  let total = 0;
  for (let s = 0; s < nos.length - 1; s++) {
    if (nos[s] === nos[s + 1]) continue;
    const { dist, pred, predNo } = dijkstra(G, nos[s], custo);
    if (!Number.isFinite(dist[nos[s + 1]])) return { ...vazio, erro: soAvenidas ? 'BRT só anda em avenidas: ligue as estações por avenidas' : 'Não há caminho pelas vias entre duas paradas' };
    total += dist[nos[s + 1]];
    // reconstrói do destino para a origem
    const trecho: number[][] = [];
    let u = nos[s + 1];
    while (u !== nos[s]) {
      const k = pred[u], v = predNo[u];
      const e = g.edges.get(G.arestaIds[k])!;
      const [p0, c, p1] = edgeEnds(g, e);
      let pts = sampleCurve(p0, c, p1, 10);
      // orienta de v → u
      const ia = G.indice.get(e.a)!;
      if (ia !== v) pts = pts.reverse();
      trecho.unshift(pts.flatMap((p) => [p.x, p.z]));
      arestasUsadas.push(G.arestaIds[k]);
      u = v;
    }
    for (const t of trecho) {
      const ini = caminho.length ? 2 : 0; // evita duplicar o ponto de junção
      for (let i = ini; i < t.length; i++) caminho.push(t[i]);
    }
  }
  return { ok: true, caminho, comprimento: total, arestas: arestasUsadas };
}

/** Comprimento de uma polilinha plana [x0,z0,x1,z1,…]. */
export function comprimentoPolilinha(p: ArrayLike<number>): number {
  let L = 0;
  for (let i = 2; i < p.length; i += 2) L += Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1]);
  return L;
}
