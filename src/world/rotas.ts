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
  /** adjacência em CSR (Fase 23): os vizinhos de u são csrViz[csrInicio[u] .. csrInicio[u+1]) e a aresta de cada um, em csrAresta */
  csrInicio: Int32Array; csrViz: Int32Array; csrAresta: Int32Array;
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
  const csrInicio = new Int32Array(nodeIds.length + 1);
  for (let u = 0; u < nodeIds.length; u++) csrInicio[u + 1] = csrInicio[u] + adj[u].length;
  const csrViz = new Int32Array(csrInicio[nodeIds.length]), csrAresta = new Int32Array(csrInicio[nodeIds.length]);
  for (let u = 0; u < nodeIds.length; u++) adj[u].forEach((a, q) => { csrViz[csrInicio[u] + q] = a.viz; csrAresta[csrInicio[u] + q] = a.aresta; });
  return { nodeIds, indice, x, z, adj, arestaIds, comprimento: Float64Array.from(comp), avenida: Uint8Array.from(av), csrInicio, csrViz, csrAresta };
}

/** Heap binário em typed arrays (sem alocar por inserção): chaves e valores crescem por dobra. */
export class HeapTipado {
  private k = new Float64Array(1024);
  private v = new Int32Array(1024);
  n = 0;
  /** chave do último `pop` */
  chave = 0;
  limpar() { this.n = 0; }
  push(chave: number, valor: number) {
    if (this.n === this.k.length) { const k2 = new Float64Array(this.n * 2), v2 = new Int32Array(this.n * 2); k2.set(this.k); v2.set(this.v); this.k = k2; this.v = v2; }
    let i = this.n++;
    const k = this.k, v = this.v;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= chave) break;
      k[i] = k[p]; v[i] = v[p]; i = p;
    }
    k[i] = chave; v[i] = valor;
  }
  /** remove o menor e devolve o valor dele (a chave fica em `chave`) */
  pop(): number {
    const k = this.k, v = this.v;
    const rv = v[0]; this.chave = k[0];
    const n = --this.n;
    if (n > 0) {
      const lk = k[n], lv = v[n];
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        if (l >= n) break;
        const r = l + 1;
        const m = r < n && k[r] < k[l] ? r : l;
        if (k[m] >= lk) break;
        k[i] = k[m]; v[i] = v[m]; i = m;
      }
      k[i] = lk; v[i] = lv;
    }
    return rv;
  }
}

export interface ArvoreRotas { dist: Float64Array; pred: Int32Array; predNo: Int32Array }
export const arvoreVazia = (n: number): ArvoreRotas => ({ dist: new Float64Array(n), pred: new Int32Array(n), predNo: new Int32Array(n) });
const heapCompartilhado = new HeapTipado();

/**
 * Dijkstra por CSR + heap tipado, escrevendo em `saida` (reaproveitável: zero alocação por busca). `custo` é o vetor de custo
 * por aresta compacta (Infinity = proibida).
 */
export function dijkstraEm(G: GrafoCompacto, origem: number, custo: ArrayLike<number>, saida: ArvoreRotas): ArvoreRotas {
  const { dist, pred, predNo } = saida;
  dist.fill(Infinity); pred.fill(-1); predNo.fill(-1);
  const h = heapCompartilhado;
  h.limpar();
  const { csrInicio, csrViz, csrAresta } = G;
  dist[origem] = 0;
  h.push(0, origem);
  while (h.n) {
    const u = h.pop();
    const d = h.chave;
    if (d > dist[u]) continue;
    for (let q = csrInicio[u], f = csrInicio[u + 1]; q < f; q++) {
      const a = csrAresta[q];
      const c = custo[a];
      if (c === Infinity) continue;
      const nd = d + c, viz = csrViz[q];
      if (nd < dist[viz]) { dist[viz] = nd; pred[viz] = a; predNo[viz] = u; h.push(nd, viz); }
    }
  }
  return saida;
}

/**
 * Árvore de menor custo a partir de um nó. `custo(k)` dá o custo da aresta compacta k
 * (Infinity = proibida). Retorna distâncias e aresta predecessora de cada nó.
 */
export function dijkstra(G: GrafoCompacto, origem: number, custo: (k: number) => number): ArvoreRotas {
  const nA = G.arestaIds.length;
  const c = new Float64Array(nA);
  for (let k = 0; k < nA; k++) { const v = custo(k); c[k] = Number.isFinite(v) ? v : Infinity; }
  return dijkstraEm(G, origem, c, arvoreVazia(G.nodeIds.length));
}

/** Grade de células de 128 m sobre os nós do grafo (montada uma vez por grafo compacto, em CSR). */
interface GradeNos { minX: number; minZ: number; nx: number; nz: number; ini: Int32Array; itens: Int32Array }
const CEL_NOS = 128;
const gradesNos = new WeakMap<GrafoCompacto, GradeNos>();
function gradeNos(G: GrafoCompacto): GradeNos {
  let g = gradesNos.get(G);
  if (g) return g;
  const n = G.nodeIds.length;
  let mnx = Infinity, mnz = Infinity, mxx = -Infinity, mxz = -Infinity;
  for (let i = 0; i < n; i++) { if (G.x[i] < mnx) mnx = G.x[i]; if (G.x[i] > mxx) mxx = G.x[i]; if (G.z[i] < mnz) mnz = G.z[i]; if (G.z[i] > mxz) mxz = G.z[i]; }
  if (!n) { mnx = mnz = 0; mxx = mxz = 1; }
  const nx = Math.floor((mxx - mnx) / CEL_NOS) + 1, nz = Math.floor((mxz - mnz) / CEL_NOS) + 1;
  const ini = new Int32Array(nx * nz + 1), cel = new Int32Array(n);
  for (let i = 0; i < n; i++) { cel[i] = Math.floor((G.z[i] - mnz) / CEL_NOS) * nx + Math.floor((G.x[i] - mnx) / CEL_NOS); ini[cel[i] + 1]++; }
  for (let c = 0; c < nx * nz; c++) ini[c + 1] += ini[c];
  const pos = ini.slice(0, nx * nz), itens = new Int32Array(n);
  for (let i = 0; i < n; i++) itens[pos[cel[i]]++] = i;
  g = { minX: mnx, minZ: mnz, nx, nz, ini, itens };
  gradesNos.set(G, g);
  return g;
}

/**
 * Nó mais próximo de (x, z) a no máximo `maxD` m (-1 se nenhum). Busca em anéis de células da grade (Fase 23: antes era uma
 * varredura de todos os nós por consulta); desempata pelo menor índice, como a varredura linear fazia.
 */
export function noMaisProximo(G: GrafoCompacto, x: number, z: number, maxD = Infinity): number {
  const gr = gradeNos(G);
  let melhor = -1, bd = maxD;
  const ci = Math.floor((x - gr.minX) / CEL_NOS), cj = Math.floor((z - gr.minZ) / CEL_NOS);
  const maxR = Number.isFinite(maxD) ? Math.ceil(maxD / CEL_NOS) + 1 : gr.nx + gr.nz + Math.abs(ci) + Math.abs(cj) + 2;
  for (let r = 0; r <= maxR; r++) {
    for (let j = cj - r; j <= cj + r; j++) {
      if (j < 0 || j >= gr.nz) continue;
      const borda = j === cj - r || j === cj + r;
      for (let i = ci - r; i <= ci + r; i += borda ? 1 : 2 * r || 1) {
        if (i < 0 || i >= gr.nx) continue;
        const c = j * gr.nx + i;
        for (let q = gr.ini[c], f = gr.ini[c + 1]; q < f; q++) {
          const k = gr.itens[q], d = Math.hypot(G.x[k] - x, G.z[k] - z);
          if (d < bd || (d === bd && melhor >= 0 && k < melhor)) { bd = d; melhor = k; }
        }
      }
    }
    // um nó num anel além de r está a pelo menos r × 128 m do ponto
    if (melhor >= 0 && bd <= r * CEL_NOS) break;
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
