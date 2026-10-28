/**
 * Perfil 3D de cada trecho (amostras a cada ~3 m com cota suavizada). Usado pela malha das
 * vias, pelos postes e pelos veículos — todos andam exatamente sobre o mesmo asfalto.
 */
import { edgeEnds, larguraVia, meiaVia, nodeDegree, sampleByLength, type RoadEdge, type RoadGraph } from '../../world/roads';
import { roadBaseY, type Heightmap } from '../../world/terrain';
import { suavizarPerfil } from '../../world/relevo';
import { regradeDe, type Regrade } from '../../world/regrade';

export interface Perfil {
  edge: RoadEdge;
  n: number;
  x: Float32Array; y: Float32Array; z: Float32Array;
  tx: Float32Array; tz: Float32Array;
  s: Float32Array;
  comprimento: number;
  /** nível efetivo (Fase 20): −1 túnel · 0 chão · +1 ponte/viaduto, do OSM ou criado pelo regrade */
  nivel?: -1 | 0 | 1;
  /** classe de cada amostra (`Classe` de regrade.ts): 0 normal · 1 ponte · 2 túnel · 3 muro de arrimo; ausente fora do regrade */
  classe?: Uint8Array;
  gradeMax?: number;
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
function cotasDosNos(g: RoadGraph, hm: Heightmap, reg?: Regrade): Map<number, number> {
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
    y.set(id, reg?.nos.get(id) ?? roadBaseY(hm, n.x, n.z));
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
  const reg = regradeDe(hm.h);
  const cotaNo = cotasDosNos(g, hm, reg);
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
    const rg = reg?.trechos.get(e.id);
    if (rg && rg.y.length === n) {
      // Fase 20: perfil regradado (rampa ≤ 25%), com ponte/túnel onde o morro pede
      out.set(e.id, { edge: e, n, x, y: Float32Array.from(rg.y), z, tx, tz, s, comprimento: length, cortaA: raio(e.a), cortaB: raio(e.b), nivel: rg.nivel, classe: rg.classe, gradeMax: rg.gradeMax });
      continue;
    }
    if (e.nivel) {
      // túnel (−1): rampa reta entre as cotas dos nós, nunca acima do chão; viaduto (+1): reta, nunca abaixo do chão
      const yA = cotaNo.get(e.a) ?? bruto[0], yB = cotaNo.get(e.b) ?? bruto[n - 1];
      for (let i = 0; i < n; i++) {
        const lin = yA + (yB - yA) * (s[i] / Math.max(1e-6, length));
        y[i] = e.nivel < 0 ? Math.min(bruto[i], lin) : Math.max(bruto[i], lin);
      }
      y[0] = yA; y[n - 1] = yB;
      out.set(e.id, { edge: e, n, x, y, z, tx, tz, s, comprimento: length, cortaA: raio(e.a), cortaB: raio(e.b), nivel: e.nivel });
      continue;
    }
    // perfil longitudinal suave (o mesmo que a terraplenagem do relevo usou), pontas fixas para casar com os nós
    const liso = suavizarPerfil(bruto, 3);
    for (let i = 0; i < n; i++) {
      // nunca abaixo do terreno (evita asfalto enterrado)
      y[i] = i === 0 || i === n - 1 ? bruto[i] : Math.max(liso[i], bruto[i] - 0.15);
    }
    out.set(e.id, { edge: e, n, x, y, z, tx, tz, s, comprimento: length, cortaA: raio(e.a), cortaB: raio(e.b), nivel: 0 });
  }
  return out;
}

export interface AmostraVia { x: number; y: number; z: number; tx: number; tz: number; largura: number; edge: number }

/**
 * Índice espacial das amostras de via (célula de 24 m) — para encaixar coisas que andam fora do grafo (ônibus
 * do GTFS, paradas) no eixo da rua mais próxima, com a cota certa em túnel e viaduto.
 */
export interface IndiceVias { perto(x: number, z: number, raio: number, out: AmostraVia): boolean }
const cacheIndice = new WeakMap<Map<number, Perfil>, IndiceVias>();

export function indiceDasVias(perfis: Map<number, Perfil>): IndiceVias {
  const emCache = cacheIndice.get(perfis);
  if (emCache) return emCache;
  const CEL = 24;
  const px: number[] = [], py: number[] = [], pz: number[] = [], ptx: number[] = [], ptz: number[] = [], plarg: number[] = [], ped: number[] = [];
  const celulas = new Map<number, number[]>();
  const chave = (i: number, j: number) => i * 40009 + j;
  for (const p of perfis.values()) {
    const larg = larguraVia(p.edge);
    for (let i = 0; i < p.n; i++) {
      const k = px.length;
      px.push(p.x[i]); py.push(p.y[i]); pz.push(p.z[i]); ptx.push(p.tx[i]); ptz.push(p.tz[i]); plarg.push(larg); ped.push(p.edge.id);
      const c = chave(Math.floor(p.x[i] / CEL), Math.floor(p.z[i] / CEL));
      (celulas.get(c) ?? celulas.set(c, []).get(c)!).push(k);
    }
  }
  const idx: IndiceVias = {
    perto(x, z, raio, out) {
      const r = Math.ceil(raio / CEL), ci = Math.floor(x / CEL), cj = Math.floor(z / CEL);
      let melhor = -1, dm = raio * raio;
      for (let di = -r; di <= r; di++) for (let dj = -r; dj <= r; dj++) {
        const lista = celulas.get(chave(ci + di, cj + dj));
        if (!lista) continue;
        for (const k of lista) {
          const d = (px[k] - x) ** 2 + (pz[k] - z) ** 2;
          if (d < dm) { dm = d; melhor = k; }
        }
      }
      if (melhor < 0) return false;
      out.x = px[melhor]; out.y = py[melhor]; out.z = pz[melhor]; out.tx = ptx[melhor]; out.tz = ptz[melhor]; out.largura = plarg[melhor]; out.edge = ped[melhor];
      return true;
    },
  };
  cacheIndice.set(perfis, idx);
  return idx;
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
