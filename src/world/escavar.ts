/**
 * Terraplenagem das vias (Fase 19): o relevo de 16 m não conhece as ruas, então uma rua em encosta ficava com o
 * morro por cima do asfalto de um lado e o ar embaixo do outro. Cada trecho ganha um perfil longitudinal suave
 * (o mesmo que o desenho usa, `suavizarPerfil`) e o terreno numa faixa de pista + calçada + 1,5 m de cada lado vai
 * para 35 cm abaixo desse perfil (corte e aterro), com transição suave até `BLEND` m adiante. Pontes e túneis
 * (`nivel`) e células de água ficam como estão.
 */
import { HM_RES, HM_STEP, HM_VERTS, MAP_SIZE } from './constants';
import { calcadaVia, edgeEnds, larguraVia, sampleByLength, type RoadGraph } from './roads';
import { suavizarPerfil } from './relevo';
import { roadBaseY, type Heightmap } from './terrain';

const BLEND = 8;
const MARGEM = 1.5;
const FOLGA = 0.35;
/** abaixo disto (m) a célula é água ou praia: não se mexe */
const COTA_MIN = 0.5;
const PASSO_AMOSTRA = 3;

const sm = (e0: number, e1: number, x: number) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

export interface ResumoEscavacao { trechos: number; celulas: number; maxCorte: number; maxAterro: number }

export function escavarVias(h: Float32Array, g: RoadGraph): ResumoEscavacao {
  const h0 = Float32Array.from(h);
  const hm0 = { h: h0 } as unknown as Heightmap;
  const half = MAP_SIZE / 2;
  const acc = new Float32Array(h.length), peso = new Float32Array(h.length), wmax = new Float32Array(h.length);
  let trechos = 0;
  for (const e of g.edges.values()) {
    if (e.nivel) continue;
    const [p0, c, p1] = edgeEnds(g, e);
    const { pts } = sampleByLength(p0, c, p1, PASSO_AMOSTRA);
    const n = pts.length;
    if (n < 2) continue;
    const bruto = new Float32Array(n);
    for (let i = 0; i < n; i++) bruto[i] = roadBaseY(hm0, pts[i].x, pts[i].z);
    const y = suavizarPerfil(bruto, PASSO_AMOSTRA);
    // o núcleo cobre pelo menos uma célula + 1 m: com a grade de 16 m as duas linhas de células que cercam a rua têm de ir inteiras para o perfil, senão a interpolação entre elas deixa a rua inclinada
    const nucleo = Math.max(larguraVia(e) / 2 + calcadaVia(e) + MARGEM, HM_STEP + 1), raio = nucleo + BLEND;
    const R = Math.ceil(raio / HM_STEP) + 1, raioC2 = (raio / HM_STEP) ** 2;
    trechos++;
    // uma amostra sim, outra não (6 m): basta para varrer uma faixa de 16 m de célula; a última entra sempre
    for (let s = 0; s < n; s += s + 2 >= n && s < n - 1 ? n - 1 - s : 2) {
      const alvo = y[s] - FOLGA;
      const fi = (pts[s].x + half) / HM_STEP, fj = (pts[s].z + half) / HM_STEP;
      const ci = Math.round(fi), cj = Math.round(fj);
      for (let dj = -R; dj <= R; dj++) {
        const j = cj + dj;
        if (j < 0 || j > HM_RES) continue;
        for (let di = -R; di <= R; di++) {
          const i = ci + di;
          if (i < 0 || i > HM_RES) continue;
          const dc = (i - fi) * (i - fi) + (j - fj) * (j - fj);
          if (dc >= raioC2) continue;
          const d = Math.sqrt(dc) * HM_STEP;
          const k = j * HM_VERTS + i;
          if (h0[k] < COTA_MIN) continue;
          const w = d <= nucleo ? 1 : 1 - sm(nucleo, raio, d);
          acc[k] += w * alvo; peso[k] += w;
          if (w > wmax[k]) wmax[k] = w;
        }
      }
    }
  }
  let celulas = 0, maxCorte = 0, maxAterro = 0;
  for (let k = 0; k < h.length; k++) {
    if (peso[k] <= 0) continue;
    const alvo = acc[k] / peso[k];
    const novo = h0[k] + (alvo - h0[k]) * wmax[k];
    h[k] = novo;
    celulas++;
    maxCorte = Math.max(maxCorte, h0[k] - novo); maxAterro = Math.max(maxAterro, novo - h0[k]);
  }
  return { trechos, celulas, maxCorte, maxAterro };
}
