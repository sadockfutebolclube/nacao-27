/**
 * Terraplenagem das vias (Fases 19 e 20): o relevo não conhece as ruas, então uma rua em encosta ficava com o morro
 * por cima do asfalto de um lado e o ar embaixo do outro. A rede é regradada (`regrade.ts`: rampa ≤ 25%, cotas dos
 * nós concordantes) e o terreno numa faixa de pista + calçada + 1,5 m de cada lado (e nunca menos que uma célula) vai
 * para 35 cm abaixo do perfil, com transição suave de `BLEND` m.
 *
 * Onde a diferença rua × morro passa de 4 m (muro de arrimo) a transição é seca e a faixa é estreita: o corte vira um
 * degrau que o muro cobre, em vez de uma rampa gigante. Pontes e túneis (os do OSM e os que o regrade criou) não
 * escavam: o morro fica por cima do túnel e o vale por baixo do viaduto. O resultado do regrade fica registrado
 * contra `h` para o desenho das vias.
 */
import { HM_RES, HM_STEP, HM_VERTS, MAP_SIZE } from './constants';
import { regradarVias, registrarRegrade, Classe, TALUDE_H_POR_V, type Regrade } from './regrade';
import { calcadaVia, edgeEnds, larguraVia, sampleByLength, type RoadGraph } from './roads';

const BLEND = 8;
const MARGEM = 1.5;
const FOLGA = 0.35;
/** abaixo disto (m) a célula é água ou praia: não se mexe */
const COTA_MIN = 0.5;
const REBAIXO_MAX = 14;
/** peso bilinear mínimo do vértice num ponto da rua para o teto e o piso valerem (Fase 33) */
const PESO_TETO = 0.05;
/** Aterro (Fase 33): o terreno sobe em torno de cada rua que está acima dele, em talude de 1 V : 1,5 H, até no máximo tantos metros para fora do núcleo */
const ATERRO_ALCANCE = 70;
const ATERRO_MAX = 60;

const sm = (e0: number, e1: number, x: number) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

export interface ResumoEscavacao { trechos: number; celulas: number; maxCorte: number; maxAterro: number; regrade: Regrade['resumo'] }

export function escavarVias(h: Float32Array, g: RoadGraph): ResumoEscavacao {
  const reg = regradarVias(h, g);
  registrarRegrade(h, reg);
  const h0 = reg.h0;
  const half = MAP_SIZE / 2;
  // cada célula obedece à rua que a puxa com mais força (peso maior; empate: a mais perto): a média entre ruas vizinhas de cotas
  // diferentes deixava o morro ~1 m acima do eixo das duas
  const alvoDe = new Float32Array(h.length), wmax = new Float32Array(h.length), dmin = new Float32Array(h.length).fill(1e9);
  // aterro: nível que o talude de qualquer rua pede para a célula (união das ruas: vale o mais alto); -1e9 = nenhum
  const aterro = new Float32Array(h.length).fill(-1e9);
  let trechos = 0;
  for (const e of g.edges.values()) {
    const t = reg.trechos.get(e.id);
    if (!t || t.nivel) continue; // OSM (nivel) e regrade (ponte/túnel): o chão fica como está
    const [p0, c, p1] = edgeEnds(g, e);
    const { pts } = sampleByLength(p0, c, p1, 3);
    const n = pts.length;
    if (n < 2 || t.y.length !== n) continue;
    const meia = larguraVia(e) / 2 + calcadaVia(e);
    // núcleo cobre pelo menos uma célula + 1 m: as duas linhas de células que cercam a rua vão inteiras para o perfil
    const nucleoN = Math.max(meia + MARGEM, HM_STEP + 1), raioN = nucleoN + BLEND;
    const R = Math.ceil(raioN / HM_STEP) + 1;
    trechos++;
    // uma amostra sim, outra não: basta para varrer uma faixa de uma célula; a última entra sempre
    for (let s = 0; s < n; s += s + 2 >= n && s < n - 1 ? n - 1 - s : 2) {
      if (t.classe[s] === Classe.Ponte || t.classe[s] === Classe.Tunel) continue; // vale por baixo do viaduto, morro por cima do túnel
      const muro = t.classe[s] === Classe.Muro;
      // zona de muro: mesma faixa, transição curta (4 m) — o degrau seco deixava cunhas de morro sobre a pista
      const nucleo = nucleoN, raio = muro ? nucleoN + 4 : raioN;
      const raioC2 = (raio / HM_STEP) ** 2;
      const alvo = t.y[s] - FOLGA;
      if (!muro) {
        // talude de aterro: a célula a d m do eixo (além do núcleo) pede alvo − (d − núcleo) / 1,5; muro de arrimo (corte ou aterro > 4 m) não aterra: o muro cobre
        const Ra = Math.ceil((nucleo + ATERRO_ALCANCE) / HM_STEP) + 1, fa = (pts[s].x + half) / HM_STEP, fb = (pts[s].z + half) / HM_STEP, ca = Math.round(fa), cb = Math.round(fb);
        for (let dj = -Ra; dj <= Ra; dj++) {
          const j = cb + dj;
          if (j < 0 || j > HM_RES) continue;
          for (let di = -Ra; di <= Ra; di++) {
            const i = ca + di;
            if (i < 0 || i > HM_RES) continue;
            const d = Math.hypot(i - fa, j - fb) * HM_STEP;
            if (d > nucleo + ATERRO_ALCANCE) continue;
            const k = j * HM_VERTS + i;
            const nivel = alvo - Math.max(0, d - nucleo) / TALUDE_H_POR_V;
            if (nivel > aterro[k] && nivel > h0[k] + 0.1) aterro[k] = nivel;
          }
        }
      }
      const fi = (pts[s].x + half) / HM_STEP, fj = (pts[s].z + half) / HM_STEP;
      const ci = Math.round(fi), cj = Math.round(fj);
      for (let dj = -R; dj <= R; dj++) {
        const j = cj + dj;
        if (j < 0 || j > HM_RES) continue;
        for (let di = -R; di <= R; di++) {
          const i = ci + di;
          if (i < 0 || i > HM_RES) continue;
          const dc = (i - fi) * (i - fi) + (j - fj) * (j - fj);
          if (dc > raioC2) continue;
          const d = Math.sqrt(dc) * HM_STEP;
          const k = j * HM_VERTS + i;
          if (h0[k] < COTA_MIN) continue;
          const w = d <= nucleo ? 1 : 1 - sm(nucleo, raio, d);
          if (w <= 0) continue;
          if (w > wmax[k] + 1e-4 || (w > wmax[k] - 1e-4 && d < dmin[k])) { wmax[k] = w; dmin[k] = d; alvoDe[k] = alvo; }
        }
      }
    }
  }
  let celulas = 0, maxCorte = 0, maxAterro = 0, celulasAterro = 0, maxAlturaAterro = 0;
  for (let k = 0; k < h.length; k++) {
    // base: o relevo original ou o aterro que o talude de alguma rua pede (nunca em água/praia nem acima de ATERRO_MAX m sobre o original)
    let base = h0[k];
    if (aterro[k] > base + 0.1 && h0[k] >= COTA_MIN) { base = Math.min(aterro[k], h0[k] + ATERRO_MAX); celulasAterro++; maxAlturaAterro = Math.max(maxAlturaAterro, base - h0[k]); h[k] = base; }
    if (wmax[k] <= 0) continue;
    const alvo = alvoDe[k];
    const novo = base + (alvo - base) * wmax[k];
    h[k] = novo;
    celulas++;
    maxCorte = Math.max(maxCorte, h0[k] - novo); maxAterro = Math.max(maxAterro, novo - h0[k]);
  }
  celulas += rebaixarSobreAsfalto(h, h0, g, reg);
  reg.aterro = { celulas: celulasAterro, maxAltura: maxAlturaAterro };
  return { trechos, celulas, maxCorte, maxAterro, regrade: reg.resumo };
}


/**
 * Garantia final: cada célula tem um teto (30 cm abaixo da rua mais baixa que passa por ela — o morro nunca cobre o
 * asfalto) e um piso (2,2 m abaixo da rua mais alta — a lateral da pista esconde o vão). Em cada amostra de terra (eixo e
 * bordas da pista) valem as 4 células que a cercam. A célula obedece ao teto e ao piso; se as ruas vizinhas diferem
 * mais de 1,9 m (dois níveis na mesma encosta) o teto vence: asfalto coberto é pior que degrau. Ponte, túnel e muro de fora.
 */
function rebaixarSobreAsfalto(h: Float32Array, h0: Float32Array, g: RoadGraph, reg: Regrade): number {
  const half = MAP_SIZE / 2;
  const teto = new Float32Array(h.length).fill(1e9), piso = new Float32Array(h.length).fill(-1e9);
  for (const e of g.edges.values()) {
    const t = reg.trechos.get(e.id);
    if (!t || t.nivel) continue;
    const [p0, c, p1] = edgeEnds(g, e);
    const { pts } = sampleByLength(p0, c, p1, 3);
    if (pts.length !== t.y.length) continue;
    const hw = larguraVia(e) / 2;
    for (let s = 0; s < pts.length; s += 2) {
      if (t.classe[s] === Classe.Ponte || t.classe[s] === Classe.Tunel) continue;
      const nx = -pts[s].tz, nz = pts[s].tx, l = Math.hypot(nx, nz) || 1;
      for (const d of [-hw, 0, hw]) {
        const fi = (pts[s].x + (nx / l) * d + half) / HM_STEP, fj = (pts[s].z + (nz / l) * d + half) / HM_STEP;
        const i0 = Math.floor(fi), j0 = Math.floor(fj);
        const fx = fi - i0, fy = fj - j0;
        for (let dj = 0; dj <= 1; dj++) for (let di = 0; di <= 1; di++) {
          const i = i0 + di, j = j0 + dj;
          if (i < 0 || j < 0 || i > HM_RES || j > HM_RES) continue;
          // Fase 33: só os vértices que de fato pesam neste ponto (peso bilinear ≥ 0,3) recebem o teto e o piso; o mínimo sobre os 4 vértices de qualquer ponto
          // puxava o vértice de cima de uma ladeira para a cota do ponto mais baixo e deixava a rua flutuando até 3 m sobre o relevo
          if ((di ? fx : 1 - fx) * (dj ? fy : 1 - fy) < PESO_TETO) continue;
          const k = j * HM_VERTS + i;
          if (h0[k] < COTA_MIN) continue;
          if (t.y[s] - 0.3 < teto[k]) teto[k] = t.y[s] - 0.3;
          if (t.y[s] - 2.2 > piso[k]) piso[k] = t.y[s] - 2.2;
        }
      }
    }
  }
  let mexidas = 0;
  for (let k = 0; k < h.length; k++) {
    if (teto[k] > 1e8) continue;
    let v = Math.min(h[k], teto[k]);
    if (piso[k] <= teto[k]) v = Math.max(v, piso[k]);
    v = Math.max(v, h[k] - REBAIXO_MAX); // no máximo 4 m de rebaixo por célula; o vão que sobra embaixo da rua é fechado pela lateral até o terreno (Vias.tsx)
    if (v !== h[k]) { h[k] = v; mexidas++; }
  }
  return mexidas;
}
