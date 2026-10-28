/**
 * Perfil 3D de cada trecho (amostras a cada ~3 m com cota suavizada). Usado pela malha das
 * vias, pelos postes e pelos veículos — todos andam exatamente sobre o mesmo asfalto.
 */
import { edgeEnds, larguraVia, meiaVia, nodeDegree, sampleByLength, type RoadEdge, type RoadGraph } from '../../world/roads';
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
  for (const e of g.edges.values()) if (e.a === nodeId || e.b === nodeId) r = Math.max(r, larguraVia(e) / 2);
  return r + 1.5;
}

/**
 * Cota de cada nó de túnel/viaduto (Fase 14). Os nós "de portal" (tocam alguma via no nível do chão) ficam na
 * cota do terreno; os nós só de túnel ou só de viaduto relaxam por média dos vizinhos entre os portais — o
 * túnel vira uma rampa reta por baixo do morro e o viaduto uma ponte reta sobre o vale.
 */
function cotasDosNos(g: RoadGraph, hm: Heightmap): Map<number, number> {
  const nivelNo = new Map<number, number>(); // 0 = chão (portal), ±1 = só de túnel/viaduto
  for (const e of g.edges.values()) for (const id of [e.a, e.b]) {
    const v = e.nivel ?? 0;
    const atual = nivelNo.get(id);
    nivelNo.set(id, atual === undefined ? v : atual === v ? v : 0);
  }
  const y = new Map<number, number>();
  const livres: number[] = [];
  const viz = new Map<number, number[]>();
  for (const [id, nv] of nivelNo) {
    const n = g.nodes.get(id);
    if (!n) continue;
    y.set(id, roadBaseY(hm, n.x, n.z));
    if (nv !== 0) livres.push(id);
  }
  if (!livres.length) return y;
  for (const e of g.edges.values()) {
    if (!e.nivel) continue;
    (viz.get(e.a) ?? viz.set(e.a, []).get(e.a)!).push(e.b);
    (viz.get(e.b) ?? viz.set(e.b, []).get(e.b)!).push(e.a);
  }
  for (let it = 0; it < 400; it++) {
    let mudou = 0;
    for (const id of livres) {
      const v = viz.get(id) ?? [];
      if (!v.length) continue;
      const m = v.reduce((a, k) => a + (y.get(k) ?? 0), 0) / v.length;
      mudou = Math.max(mudou, Math.abs(m - (y.get(id) ?? 0)));
      y.set(id, m);
    }
    if (mudou < 0.01) break;
  }
  return y;
}

export function construirPerfis(g: RoadGraph, hm: Heightmap): Map<number, Perfil> {
  const out = new Map<number, Perfil>();
  const cotaNo = cotasDosNos(g, hm);
  // raio de cada cruzamento num passe só (raioNo por nó varreria todas as vias: 15 mil no Rio)
  const grau = new Map<number, number>(), meia = new Map<number, number>();
  for (const e of g.edges.values()) for (const id of [e.a, e.b]) {
    grau.set(id, (grau.get(id) ?? 0) + 1);
    meia.set(id, Math.max(meia.get(id) ?? 0, larguraVia(e) / 2));
  }
  const raio = (id: number) => ((grau.get(id) ?? 0) < 3 ? 0 : (meia.get(id) ?? 0) + 1.5);
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
    if (e.nivel) {
      // túnel (−1): rampa reta entre as cotas dos nós, nunca acima do chão; viaduto (+1): reta, nunca abaixo do chão
      const yA = cotaNo.get(e.a) ?? bruto[0], yB = cotaNo.get(e.b) ?? bruto[n - 1];
      for (let i = 0; i < n; i++) {
        const lin = yA + (yB - yA) * (s[i] / Math.max(1e-6, length));
        y[i] = e.nivel < 0 ? Math.min(bruto[i], lin) : Math.max(bruto[i], lin);
      }
      y[0] = yA; y[n - 1] = yB;
      out.set(e.id, { edge: e, n, x, y, z, tx, tz, s, comprimento: length, cortaA: raio(e.a), cortaB: raio(e.b) });
      continue;
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

export const meiaLargura = meiaVia;
