/**
 * Gerador de terreno procedural "fiel ao tipo" de cada capital (ver traits.json → terreno).
 * Puro e determinístico: o Worker e a renderização geram exatamente o mesmo relevo a partir
 * da mesma seed, então o heightmap nunca precisa trafegar entre threads.
 *
 * Tipos: litoral-morros (Rio, Vitória, Floripa, Salvador), litoral-plano (Recife, Fortaleza…),
 * planalto (SP, Curitiba, Brasília), planície (Cuiabá, Teresina…), várzea (Manaus, Belém…),
 * serra (BH, cercada de montanhas).
 */
import { createNoise2D } from 'simplex-noise';
import type { Bioma, Lado, Terreno } from '../data/schemas';
import { Rng } from '../sim/core/rng';
import { HM_RES, HM_STEP, HM_VERTS, MAP_SIZE, ROAD_MIN_Y } from './constants';

export interface Heightmap {
  /** Altitudes (m) em grade (HM_VERTS × HM_VERTS), linha = z, coluna = x. */
  h: Float32Array;
  /** Densidade de mata nativa 0–255 por vértice. */
  forest: Uint8Array;
  /** Distância aproximada (m) até a água, por vértice (saturada em 2 km). */
  waterDist: Float32Array;
  bioma: Bioma;
  terreno: Terreno;
  seed: number;
}

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Coordenadas (s, a): s cresce em direção à água; a corre ao longo da costa. */
function axes(lado: Lado, x: number, z: number): [number, number] {
  switch (lado) {
    case 'S': return [z, x];
    case 'N': return [-z, -x];
    case 'E': return [x, -z];
    case 'W': return [-x, z];
  }
}

const DENSIDADE_MATA: Record<Bioma, number> = {
  'amazonia': 1.0, 'mata-atlantica': 0.85, 'cerrado': 0.5, 'caatinga': 0.38, 'pampa': 0.18, 'pantanal': 0.45,
};

interface Morro { x: number; z: number; h: number; rx: number; rz: number; rot: number; pico: number }

export function generateTerrain(seed: number, terreno: Terreno, bioma: Bioma): Heightmap {
  const rng = new Rng(seed);
  const n = createNoise2D(() => rng.next());
  const n2 = createNoise2D(() => rng.next());
  const fbm = (x: number, z: number, oct = 4) => {
    let s = 0, amp = 0.5, f = 1;
    for (let i = 0; i < oct; i++) { s += amp * n(x * f, z * f); amp *= 0.5; f *= 2.03; }
    return s;
  };
  const ridged = (x: number, z: number) => {
    let s = 0, amp = 0.55, f = 1;
    for (let i = 0; i < 4; i++) { s += amp * (1 - Math.abs(n2(x * f, z * f))); amp *= 0.5; f *= 2.1; }
    return s;
  };

  const R = terreno.relevo;
  const tipo = terreno.tipo;
  const agua = terreno.agua;
  const half = MAP_SIZE / 2;

  // ── Morros isolados (pães de açúcar, morros cariocas, inselbergs) ────────────────
  const morros: Morro[] = [];
  const nMorros = tipo === 'litoral-morros' ? Math.round(4 + 8 * R) : tipo === 'litoral-plano' ? Math.round(2 * R) : tipo === 'serra' ? 3 : 0;
  for (let i = 0; i < nMorros; i++) {
    let x = 0, z = 0;
    for (let t = 0; t < 30; t++) {
      x = rng.range(-2400, 2400); z = rng.range(-2400, 2400);
      if (Math.hypot(x, z) > 650) break;
    }
    const r = rng.range(150, 360);
    morros.push({ x, z, h: R * rng.range(80, 300) + 30, rx: r, rz: r * rng.range(0.55, 1), rot: rng.range(0, Math.PI), pico: rng.range(0.55, 0.9) });
  }
  if (tipo === 'litoral-morros' && agua) {
    // O "Pão de Açúcar": granito na beira d'água, visível da orla.
    const a0 = rng.range(500, 900) * (rng.chance(0.5) ? 1 : -1);
    const [px, pz] = fromAxes(agua.lado, 900, a0);
    morros.push({ x: px, z: pz, h: 160 + 120 * R, rx: 170, rz: 120, rot: rng.range(0, Math.PI), pico: 0.62 });
  }

  // Afluente que corta o mapa (Capibaribe, Tietê, Poti…) ou córrego para mapas sem água.
  const temRioInterno = terreno.rio === true || agua === null;
  const rioLargura = agua === null ? 34 : 60;
  const rioOff = rng.range(-500, 500);

  const h = new Float32Array(HM_VERTS * HM_VERTS);
  const forest = new Uint8Array(HM_VERTS * HM_VERTS);

  for (let j = 0; j < HM_VERTS; j++) {
    const z = -half + j * HM_STEP;
    for (let i = 0; i < HM_VERTS; i++) {
      const x = -half + i * HM_STEP;
      const r = Math.hypot(x, z);
      let e: number;

      switch (tipo) {
        case 'litoral-morros':
          e = 3.5 + 3 * fbm(x / 700, z / 700);
          break;
        case 'litoral-plano':
          e = 3 + 2.5 * fbm(x / 650, z / 650);
          break;
        case 'planalto':
          e = 20 + 26 * R * (fbm(x / 1500, z / 1500) * 0.5 + 0.5) + 6 * fbm(x / 380, z / 380);
          break;
        case 'planicie':
          e = 6 + 7 * R * (fbm(x / 1700, z / 1700) * 0.5 + 0.5) + 1.2 * fbm(x / 300, z / 300);
          break;
        case 'varzea':
          e = 2.6 + 3 * (fbm(x / 1300, z / 1300) * 0.5 + 0.5) + 0.7 * fbm(x / 220, z / 220);
          break;
        case 'serra':
          e = 30 + 22 * fbm(x / 900, z / 900)
            + 420 * R * smooth(1100, 2700, r) * (0.5 + 0.5 * ridged(x / 800, z / 800))
            + 140 * R * smooth(500, 1400, r) * Math.max(0, ridged(x / 520, z / 520) - 0.55);
          break;
      }

      let s = 0, a = 0, costa = Infinity;
      if (agua) {
        [s, a] = axes(agua.lado, x, z);
        // Maciço florestado no fundo do mapa (Tijuca, Serra do Mar…)
        if (tipo === 'litoral-morros') e += R * 300 * smooth(-500, -2300, s) * (0.45 + 0.55 * ridged(a / 900, s / 900));
        if (tipo === 'litoral-plano') e += R * 40 * smooth(-600, -2200, s) * (0.5 + 0.5 * fbm(a / 800, s / 800));
      }

      // Morros
      for (const m of morros) {
        const dx = x - m.x, dz = z - m.z;
        const c = Math.cos(m.rot), sn = Math.sin(m.rot);
        const u = (dx * c - dz * sn) / m.rx, v = (dx * sn + dz * c) / m.rz;
        const d2 = u * u + v * v;
        if (d2 < 1.6) {
          const ruido = 1 + 0.12 * n2(x / 90, z / 90);
          const f = Math.max(0, 1 - d2 * ruido);
          e += m.h * Math.pow(f, m.pico);
        }
      }

      // Rio interno / córrego com vale suave
      if (temRioInterno) {
        const along = agua ? axes(agua.lado, x, z)[0] : z;
        const across = (agua ? axes(agua.lado, x, z)[1] : x) - (rioOff + 380 * n(along / 1400, 7.3) + 90 * n(along / 380, 1.7));
        const d = Math.abs(across);
        const vale = smooth(520, 50, d);
        e = lerp(e, 1.6, vale * 0.85);
        if (d < rioLargura / 2 + 14) e = lerp(e, -3.2, smooth(rioLargura / 2 + 14, rioLargura / 2 - 6, d));
      }

      // Corpo d'água principal
      if (agua) {
        if (agua.tipo === 'mar' || agua.tipo === 'baia') {
          costa = 820 + 230 * n(a / 1000, 0.5) + 60 * n(a / 260, 3.1);
          if (agua.tipo === 'baia') costa += 260 * Math.max(0, n(a / 1600, 9.1));
          const terra = smooth(costa + 15, costa - 320, s);
          e = 1.1 + (e - 1.1) * Math.max(terra, morroFactor(morros, x, z));
          if (s > costa) e = Math.min(e, lerp(1.1, -18, smooth(costa, costa + 300, s)) + morroAdd(morros, x, z));
          // Dunas no litoral plano
          if (tipo === 'litoral-plano') e += 9 * R * smooth(costa - 420, costa - 120, s) * smooth(costa + 10, costa - 60, s) * Math.max(0, fbm(x / 140, z / 140) + 0.2);
        } else if (agua.tipo === 'rio') {
          const largura = tipo === 'varzea' ? 640 : 260;
          costa = 1000 + 160 * n(a / 1500, 2.2);
          const d = Math.abs(s - (costa + largura / 2));
          e = lerp(e, 1.4, smooth(largura / 2 + 260, largura / 2, d) * 0.8);
          if (d < largura / 2 + 30) e = lerp(e, -7, smooth(largura / 2 + 30, largura / 2 - 30, d));
        } else {
          // lago (Paranoá, Guaíba, lago de Palmas)
          const lx = s - 1350, ly = a - 200 * n(s / 900, 4.4);
          const borda = 1 + 0.18 * n(x / 400, z / 400);
          const d = Math.hypot(lx / 820, ly / 1250) / borda;
          e = lerp(e, 1.6, smooth(1.35, 1.0, d) * 0.8);
          if (d < 1.06) e = lerp(e, -8, smooth(1.06, 0.92, d));
        }
      }

      const k = j * HM_VERTS + i;
      h[k] = e;

      // Mata nativa: manchas de ruído, mais densa nas encostas e longe da orla
      let mata = 0.5 + 0.9 * fbm(x / 520 + 11, z / 520 - 7, 3);
      mata += 0.012 * Math.max(0, e - 8);
      if (agua && (agua.tipo === 'mar' || agua.tipo === 'baia')) mata *= smooth(costa - 40, costa - 260, s);
      mata *= DENSIDADE_MATA[bioma];
      forest[k] = Math.max(0, Math.min(255, Math.round(mata * 255)));
    }
  }

  // Rocha exposta nos paredões (granito carioca): sem mata onde a encosta é muito íngreme.
  for (let j = 1; j < HM_RES; j++) {
    for (let i = 1; i < HM_RES; i++) {
      const k = j * HM_VERTS + i;
      const gx = (h[k + 1] - h[k - 1]) / (2 * HM_STEP);
      const gz = (h[k + HM_VERTS] - h[k - HM_VERTS]) / (2 * HM_STEP);
      const slope = Math.hypot(gx, gz);
      if (slope > 1.1) forest[k] = Math.round(forest[k] * Math.max(0, 1 - (slope - 1.1) * 2));
      if (h[k] < 1.2) forest[k] = 0;
    }
  }

  return { h, forest, waterDist: waterDistance(h), bioma, terreno, seed };

  function fromAxes(lado: Lado, s: number, a: number): [number, number] {
    switch (lado) {
      case 'S': return [a, s];
      case 'N': return [-a, -s];
      case 'E': return [s, -a];
      case 'W': return [-s, a];
    }
  }
}

function morroFactor(morros: Morro[], x: number, z: number): number {
  let f = 0;
  for (const m of morros) {
    const d = Math.hypot((x - m.x) / m.rx, (z - m.z) / m.rz);
    f = Math.max(f, smooth(1.2, 0.6, d));
  }
  return f;
}
function morroAdd(morros: Morro[], x: number, z: number): number {
  let e = 0;
  for (const m of morros) {
    const d2 = ((x - m.x) / m.rx) ** 2 + ((z - m.z) / m.rz) ** 2;
    if (d2 < 1) e += m.h * Math.pow(1 - d2, m.pico) - 6;
  }
  return e;
}

/** Transformada de distância em 2 passadas (chamfer) até a água (h < 0). */
function waterDistance(h: Float32Array): Float32Array {
  const N = HM_VERTS;
  const d = new Float32Array(N * N);
  const INF = 2000;
  for (let k = 0; k < d.length; k++) d[k] = h[k] < 0 ? 0 : INF;
  const D1 = HM_STEP, D2 = HM_STEP * Math.SQRT2;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const k = j * N + i;
    let v = d[k];
    if (i > 0) v = Math.min(v, d[k - 1] + D1);
    if (j > 0) {
      v = Math.min(v, d[k - N] + D1);
      if (i > 0) v = Math.min(v, d[k - N - 1] + D2);
      if (i < N - 1) v = Math.min(v, d[k - N + 1] + D2);
    }
    d[k] = v;
  }
  for (let j = N - 1; j >= 0; j--) for (let i = N - 1; i >= 0; i--) {
    const k = j * N + i;
    let v = d[k];
    if (i < N - 1) v = Math.min(v, d[k + 1] + D1);
    if (j < N - 1) {
      v = Math.min(v, d[k + N] + D1);
      if (i < N - 1) v = Math.min(v, d[k + N + 1] + D2);
      if (i > 0) v = Math.min(v, d[k + N - 1] + D2);
    }
    d[k] = v;
  }
  return d;
}

function bilinear(arr: ArrayLike<number>, x: number, z: number): number {
  const fx = (x + MAP_SIZE / 2) / HM_STEP;
  const fz = (z + MAP_SIZE / 2) / HM_STEP;
  const i = Math.min(HM_RES - 1, Math.max(0, Math.floor(fx)));
  const j = Math.min(HM_RES - 1, Math.max(0, Math.floor(fz)));
  const tx = Math.min(1, Math.max(0, fx - i));
  const tz = Math.min(1, Math.max(0, fz - j));
  const k = j * HM_VERTS + i;
  const a = arr[k], b = arr[k + 1], c = arr[k + HM_VERTS], d = arr[k + HM_VERTS + 1];
  return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
}

export function sampleHeight(hm: Heightmap, x: number, z: number): number {
  return bilinear(hm.h, x, z);
}

export function sampleWaterDist(hm: Heightmap, x: number, z: number): number {
  return bilinear(hm.waterDist, x, z);
}

export function sampleForest(hm: Heightmap, x: number, z: number): number {
  return bilinear(hm.forest, x, z) / 255;
}

/** Inclinação (tangente) do terreno no ponto. */
export function sampleSlope(hm: Heightmap, x: number, z: number): number {
  const e = 4;
  const gx = (sampleHeight(hm, x + e, z) - sampleHeight(hm, x - e, z)) / (2 * e);
  const gz = (sampleHeight(hm, x, z + e) - sampleHeight(hm, x, z - e)) / (2 * e);
  return Math.hypot(gx, gz);
}

/** Cota de uma via no ponto (sobre a água vira ponte). Função pura → nós sempre casam. */
export function roadBaseY(hm: Heightmap, x: number, z: number): number {
  return Math.max(sampleHeight(hm, x, z), ROAD_MIN_Y) + 0.3;
}

/** Interseção raio × terreno por ray-marching no heightmap (rápido, sem BVH). */
export function raycastTerrain(
  hm: Heightmap,
  ox: number, oy: number, oz: number,
  dx: number, dy: number, dz: number,
  maxDist = 9000,
): [number, number, number] | null {
  let t = 0;
  let step = 6;
  let prevT = 0;
  const groundAt = (px: number, pz: number) => Math.max(sampleHeight(hm, px, pz), 0);
  while (t < maxDist) {
    const px = ox + dx * t, py = oy + dy * t, pz = oz + dz * t;
    if (Math.abs(px) > MAP_SIZE / 2 || Math.abs(pz) > MAP_SIZE / 2) {
      if (dy >= 0) return null;
    }
    if (py <= groundAt(px, pz)) {
      // refinamento binário
      let lo = prevT, hi = t;
      for (let i = 0; i < 12; i++) {
        const mid = (lo + hi) / 2;
        const qx = ox + dx * mid, qy = oy + dy * mid, qz = oz + dz * mid;
        if (qy <= groundAt(qx, qz)) hi = mid; else lo = mid;
      }
      const qx = ox + dx * hi, qz = oz + dz * hi;
      return [qx, groundAt(qx, qz), qz];
    }
    prevT = t;
    t += step;
    step = Math.min(24, step * 1.02);
  }
  return null;
}
