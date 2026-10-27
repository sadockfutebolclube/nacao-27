/**
 * Cidade real no mundo do jogo (Fase 11): relevo, água e verde vindos de dados reais
 * (src/data/cidadeReal.ts), grafo de ruas do OpenStreetMap e os prédios existentes como lotes fixos.
 * Puro e determinístico: o Worker e a renderização montam o mesmo mundo a partir do mesmo arquivo.
 */
import { CAMPOS_ARESTA, CAMPOS_PREDIO, deBase64, type CidadeReal } from '../data/cidadeReal';
import type { Bioma, Terreno } from '../data/schemas';
import { BUILD_HALF, HM_STEP, HM_VERTS, MAP_SIZE } from './constants';
import type { RoadGraph } from './roads';
import { arquetipo, Zone } from '../sim/catalog';
import { DENSIDADE_MATA, waterDistance, type Heightmap } from './terrain';

/** Relevo real: alturas de 16 m interpoladas para a grade de 8 m do jogo, água rebaixada, verde do OSM. */
export function terrenoReal(c: CidadeReal, terreno: Terreno, bioma: Bioma, seed: number): Heightmap {
  const bytes = deBase64(c.alturas);
  const alt = new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2);
  const verde = deBase64(c.verde);
  const vRes = Math.round(Math.sqrt(verde.length));
  const h = new Float32Array(HM_VERTS * HM_VERTS);
  const forest = new Uint8Array(HM_VERTS * HM_VERTS);
  const half = MAP_SIZE / 2;
  const R = c.res, P = c.passo;
  const amostra = (i: number, j: number) => alt[Math.min(R - 1, j) * R + Math.min(R - 1, i)] / 10;
  const fundo = DENSIDADE_MATA[bioma] ?? 0.5;
  for (let j = 0; j < HM_VERTS; j++) {
    const z = -half + j * HM_STEP;
    for (let i = 0; i < HM_VERTS; i++) {
      const x = -half + i * HM_STEP;
      const fx = (x + half) / P, fz = (z + half) / P;
      const i0 = Math.floor(fx), j0 = Math.floor(fz), tx = fx - i0, tz = fz - j0;
      const v = (amostra(i0, j0) * (1 - tx) + amostra(i0 + 1, j0) * tx) * (1 - tz) + (amostra(i0, j0 + 1) * (1 - tx) + amostra(i0 + 1, j0 + 1) * tx) * tz;
      const k = j * HM_VERTS + i;
      h[k] = v;
      if (v < 1.2) continue;
      const vi = Math.min(vRes - 1, Math.floor(((x + half) / MAP_SIZE) * vRes)), vj = Math.min(vRes - 1, Math.floor(((z + half) / MAP_SIZE) * vRes));
      let f = verde[vj * vRes + vi];
      // fora da área construível, campo e mata do bioma onde o OSM não mapeou nada
      if (Math.abs(x) > BUILD_HALF || Math.abs(z) > BUILD_HALF) f = Math.max(f, Math.round(90 * fundo));
      forest[k] = f;
    }
  }
  return { h, forest, waterDist: waterDistance(h), bioma, terreno, seed };
}

/** Grafo de ruas do jogo a partir das vias reais (ids estáveis = índice + 1). */
export function grafoReal(c: CidadeReal, nomeSemNome: (i: number, avenida: boolean) => string): RoadGraph {
  const g: RoadGraph = { nodes: new Map(), edges: new Map(), nextNode: 1, nextEdge: 1 };
  const { nos, arestas, nomes } = c.vias;
  for (let i = 0; i < nos.length / 2; i++) g.nodes.set(i + 1, { id: i + 1, x: nos[i * 2], z: nos[i * 2 + 1] });
  const n = arestas.length / CAMPOS_ARESTA;
  for (let i = 0; i < n; i++) {
    const o = i * CAMPOS_ARESTA, av = arestas[o + 4] === 1;
    g.edges.set(i + 1, { id: i + 1, a: arestas[o], b: arestas[o + 1], cx: arestas[o + 2], cz: arestas[o + 3], type: av ? 'avenida' : 'rua', name: arestas[o + 5] >= 0 ? nomes[arestas[o + 5]] : nomeSemNome(i, av) });
  }
  g.nextNode = nos.length / 2 + 1;
  g.nextEdge = n + 1;
  return g;
}

/** Prédio real como lote fixo: retângulo orientado, aresta de frente e índice no arquivo. */
export interface LoteFixo { x: number; z: number; angle: number; w: number; d: number; edge: number; ref: number }

export function lotesFixos(c: CidadeReal, demolidos: ReadonlySet<number>, arestaExiste: (id: number) => boolean): LoteFixo[] {
  const p = c.predios, out: LoteFixo[] = [];
  for (let i = 0; i < p.length / CAMPOS_PREDIO; i++) {
    if (demolidos.has(i)) continue;
    const o = i * CAMPOS_PREDIO;
    const edge = p[o + 7];
    if (!edge || !arestaExiste(edge)) continue;
    out.push({ x: p[o], z: p[o + 1], angle: p[o + 2] / 1000, w: p[o + 3], d: p[o + 4], edge, ref: i });
  }
  return out;
}

/**
 * Arquétipo do jogo para um prédio real: o tipo (residencial, comercial, industrial, serviço, religioso)
 * e os andares escolhem zona e nível; os andares reais ficam no lote.
 */
export function arquetipoReal(tipo: number, andares: number, area: number): { zone: Zone; arch: number } {
  if (tipo === 2) return { zone: Zone.Industrial, arch: arquetipo(Zone.Industrial, area > 2500 ? 2 : 1).id };
  if (tipo === 1 || tipo === 3 || tipo === 4) {
    const nivel = andares >= 7 ? 3 : andares >= 3 || area > 1500 ? 2 : 1;
    return { zone: Zone.Comercial, arch: arquetipo(Zone.Comercial, nivel).id };
  }
  if (andares <= 3) return { zone: Zone.ResBaixa, arch: arquetipo(Zone.ResBaixa, Math.max(1, andares)).id };
  const nivel = andares >= 17 ? 4 : andares >= 10 ? 3 : andares >= 6 ? 2 : 1;
  return { zone: Zone.ResAlta, arch: arquetipo(Zone.ResAlta, nivel).id };
}

/** Nó de rua mais perto do centro (ponto inicial da câmera). */
export function centroReal(c: CidadeReal): [number, number] {
  let melhor: [number, number] = [0, 0], dm = Infinity;
  for (let i = 0; i < c.vias.nos.length / 2; i++) {
    const x = c.vias.nos[i * 2], z = c.vias.nos[i * 2 + 1], d = Math.hypot(x, z);
    if (d < dm) { dm = d; melhor = [x, z]; }
  }
  return melhor;
}
