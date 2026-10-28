/**
 * Minimapa da ficha (Fase 25): o mapa de 12 km do jogo (terra e mar pelo relevo, ruas do grafo) com o bairro da entidade
 * destacado — o polígono do bairro do Censo/IPP, pelo raster de 32 m — e um alfinete na posição dela. A base é desenhada uma
 * vez por mundo e por bairro; só o alfinete se move.
 */
import { useEffect, useMemo, useRef } from 'react';
import { censo } from '../../data/bairros';
import { mundo } from '../../sim/bridge';
import { BUILD_HALF } from '../../world/constants';
import { sampleHeight, sampleWaterDist } from '../../world/terrain';

const N = 220;
const META_CENSO = 8192, CEL_CENSO = 32, N_CENSO = (META_CENSO * 2) / CEL_CENSO;

let baseCache: { roads: unknown; lots: number; canvas: HTMLCanvasElement } | null = null;

/** terra, mar e ruas — refeito quando as vias mudam */
function base(): HTMLCanvasElement | null {
  const hm = mundo.hm;
  if (!hm) return null;
  if (baseCache && baseCache.roads === mundo.roads && baseCache.lots === mundo.lotCount) return baseCache.canvas;
  const c = baseCache?.canvas ?? document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d')!;
  const img = g.createImageData(N, N);
  const k = (2 * BUILD_HALF) / N;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = -BUILD_HALF + (i + 0.5) * k, z = -BUILD_HALF + (j + 0.5) * k;
    const h = sampleHeight(hm, x, z), agua = sampleWaterDist(hm, x, z) <= 2 || h < 0.3;
    const o = (j * N + i) * 4;
    if (agua) { img.data[o] = 38; img.data[o + 1] = 70; img.data[o + 2] = 104; }
    else { const t = Math.min(1, h / 320); img.data[o] = 58 + 70 * t; img.data[o + 1] = 92 + 40 * t - 30 * t * t; img.data[o + 2] = 64 + 28 * t; }
    img.data[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const px = (v: number) => ((v + BUILD_HALF) / (2 * BUILD_HALF)) * N;
  g.lineCap = 'round';
  for (const [grossa, cor] of [[false, 'rgba(235,235,225,0.5)'], [true, 'rgba(255,224,150,0.85)']] as const) {
    g.strokeStyle = cor; g.lineWidth = grossa ? 1.4 : 0.6;
    g.beginPath();
    for (const e of mundo.roads.edges.values()) {
      if ((e.type === 'avenida') !== grossa) continue;
      const a = mundo.roads.nodes.get(e.a), b = mundo.roads.nodes.get(e.b);
      if (!a || !b) continue;
      g.moveTo(px(a.x), px(a.z)); g.quadraticCurveTo(px(e.cx), px(e.cz), px(b.x), px(b.z));
    }
    g.stroke();
  }
  baseCache = { roads: mundo.roads, lots: mundo.lotCount, canvas: c };
  return c;
}

/** base + o polígono do bairro `indice` do Censo (−1 = sem destaque) */
function composto(indice: number): HTMLCanvasElement | null {
  const b = base();
  if (!b) return null;
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d')!;
  g.drawImage(b, 0, 0);
  if (indice >= 0 && censo.raster) {
    const img = g.getImageData(0, 0, N, N);
    const k = (2 * BUILD_HALF) / N;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = -BUILD_HALF + (i + 0.5) * k, z = -BUILD_HALF + (j + 0.5) * k;
      const ci = Math.floor((x + META_CENSO) / CEL_CENSO), cj = Math.floor((z + META_CENSO) / CEL_CENSO);
      if (censo.raster[cj * N_CENSO + ci] !== indice + 1) continue;
      const o = (j * N + i) * 4;
      img.data[o] = img.data[o] * 0.45 + 255 * 0.55; img.data[o + 1] = img.data[o + 1] * 0.45 + 196 * 0.55; img.data[o + 2] = img.data[o + 2] * 0.45 + 40 * 0.55;
    }
    g.putImageData(img, 0, 0);
  }
  return c;
}

export function Minimapa({ x, z, bairro, indice, atualizar }: { x: number; z: number; bairro: string; indice: number; atualizar: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const fundo = useMemo(() => composto(indice), [indice, atualizar]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const g = cv.getContext('2d')!;
    g.clearRect(0, 0, N, N);
    if (fundo) g.drawImage(fundo, 0, 0);
    const px = ((x + BUILD_HALF) / (2 * BUILD_HALF)) * N, pz = ((z + BUILD_HALF) / (2 * BUILD_HALF)) * N;
    // alfinete: halo, ponto e cruz
    g.beginPath(); g.arc(px, pz, 8, 0, Math.PI * 2); g.fillStyle = 'rgba(255,60,60,0.25)'; g.fill();
    g.beginPath(); g.arc(px, pz, 3.6, 0, Math.PI * 2); g.fillStyle = '#ff3b3b'; g.fill(); g.lineWidth = 1.4; g.strokeStyle = '#fff'; g.stroke();
  }, [fundo, x, z]);
  return (
    <div className="relative rounded-lg overflow-hidden border border-borda" style={{ width: '100%', aspectRatio: '1 / 1', maxWidth: 220 }}>
      <canvas ref={ref} width={N} height={N} style={{ width: '100%', height: '100%', display: 'block', imageRendering: 'auto' }} />
      <div className="absolute left-1 bottom-1 text-[10px] px-1.5 py-0.5 rounded bg-black/60 text-white">{bairro}</div>
    </div>
  );
}
