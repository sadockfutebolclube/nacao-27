/**
 * Terreno em blocos (chunks) para culling por frustum, com cores por bioma, declividade,
 * altitude e mata. Mais um contorno discreto da área do município.
 */
import { Line } from '@react-three/drei';
import { useEffect, useMemo } from 'react';
import { createNoise2D } from 'simplex-noise';
import * as THREE from 'three';
import type { Bioma } from '../../data/schemas';
import { Rng } from '../../sim/core/rng';
import { BUILD_HALF, HM_RES, HM_STEP, HM_VERTS, MAP_SIZE } from '../../world/constants';
import { sampleHeight, type Heightmap } from '../../world/terrain';
import { uniformsTerreno } from './climaVisual';

interface Paleta { grama: string; grama2: string; mata: string; solo: string; areia: string; rocha: string; fundo: string }

export const PALETAS: Record<Bioma, Paleta> = {
  'mata-atlantica': { grama: '#6f9a3c', grama2: '#8aa84a', mata: '#2b5424', solo: '#8a6a44', areia: '#e6d6ac', rocha: '#7b7a74', fundo: '#c7b98f' },
  cerrado: { grama: '#a6a04e', grama2: '#c0ab5c', mata: '#56692d', solo: '#a9512f', areia: '#dcc08f', rocha: '#8b7461', fundo: '#b79a73' },
  caatinga: { grama: '#b2a46c', grama2: '#c6b583', mata: '#7a7a4d', solo: '#b38b5c', areia: '#e0caa0', rocha: '#a29377', fundo: '#c4ae88' },
  amazonia: { grama: '#4f8f30', grama2: '#66a03c', mata: '#1d4a1b', solo: '#7c4f2e', areia: '#d9c89a', rocha: '#6e6a5e', fundo: '#8a7a55' },
  pampa: { grama: '#86ab47', grama2: '#9cbc5a', mata: '#3e6c2b', solo: '#6d5a3c', areia: '#d8c9a2', rocha: '#7e7b72', fundo: '#b9ab86' },
  pantanal: { grama: '#7ea34a', grama2: '#94b45a', mata: '#3e6b2b', solo: '#6c5a3a', areia: '#d6c69c', rocha: '#7a776e', fundo: '#8f8662' },
};

const CHUNK = 96;

function corDoVertice(hm: Heightmap, i: number, j: number, p: Paleta, nz: (x: number, z: number) => number, out: THREE.Color, tmp: THREE.Color) {
  const k = j * HM_VERTS + i;
  const h = hm.h[k];
  const x = -MAP_SIZE / 2 + i * HM_STEP, z = -MAP_SIZE / 2 + j * HM_STEP;
  const il = Math.max(0, i - 1), ir = Math.min(HM_RES, i + 1), jd = Math.max(0, j - 1), ju = Math.min(HM_RES, j + 1);
  const gx = (hm.h[j * HM_VERTS + ir] - hm.h[j * HM_VERTS + il]) / ((ir - il) * HM_STEP);
  const gz = (hm.h[ju * HM_VERTS + i] - hm.h[jd * HM_VERTS + i]) / ((ju - jd) * HM_STEP);
  const slope = Math.hypot(gx, gz);
  const mata = hm.forest[k] / 255;
  const n1 = nz(x / 90, z / 90), n2 = nz(x / 23 + 50, z / 23 - 20);

  if (h < 0.4) {
    // leito submerso: areia clara que escurece com a profundidade
    out.set(p.areia).lerp(tmp.set(p.fundo), Math.min(1, -h / 6));
    return out;
  }
  const praia = hm.waterDist[k] < 70 && h < 3.2;
  out.set(p.grama).lerp(tmp.set(p.grama2), 0.5 + 0.5 * n1);
  out.lerp(tmp.set(p.solo), Math.max(0, n2 * 0.5 - 0.1) + Math.max(0, 0.25 - mata) * 0.4);
  out.lerp(tmp.set(p.mata), Math.min(1, mata * 1.25));
  out.lerp(tmp.set(p.rocha), Math.min(1, Math.max(0, (slope - 0.75) * 1.6)));
  if (praia) out.lerp(tmp.set(p.areia), Math.min(1, (70 - hm.waterDist[k]) / 40));
  out.multiplyScalar(0.94 + 0.12 * n2);
  return out;
}

function construirChunk(hm: Heightmap, ci: number, cj: number, p: Paleta, nz: (x: number, z: number) => number): THREE.BufferGeometry {
  const n = CHUNK + 1;
  const pos = new Float32Array(n * n * 3);
  const nor = new Float32Array(n * n * 3);
  const col = new Float32Array(n * n * 3);
  const c = new THREE.Color(), tmp = new THREE.Color();
  for (let jj = 0; jj < n; jj++) {
    for (let ii = 0; ii < n; ii++) {
      const i = ci * CHUNK + ii, j = cj * CHUNK + jj;
      const k = j * HM_VERTS + i;
      const o = (jj * n + ii) * 3;
      pos[o] = -MAP_SIZE / 2 + i * HM_STEP;
      pos[o + 1] = hm.h[k];
      pos[o + 2] = -MAP_SIZE / 2 + j * HM_STEP;
      const il = Math.max(0, i - 1), ir = Math.min(HM_RES, i + 1), jd = Math.max(0, j - 1), ju = Math.min(HM_RES, j + 1);
      const dx = (hm.h[j * HM_VERTS + ir] - hm.h[j * HM_VERTS + il]) / ((ir - il) * HM_STEP);
      const dz = (hm.h[ju * HM_VERTS + i] - hm.h[jd * HM_VERTS + i]) / ((ju - jd) * HM_STEP);
      const l = Math.hypot(dx, 1, dz);
      nor[o] = -dx / l; nor[o + 1] = 1 / l; nor[o + 2] = -dz / l;
      corDoVertice(hm, i, j, p, nz, c, tmp);
      col[o] = c.r; col[o + 1] = c.g; col[o + 2] = c.b;
    }
  }
  const idx = new Uint32Array(CHUNK * CHUNK * 6);
  let t = 0;
  for (let jj = 0; jj < CHUNK; jj++) for (let ii = 0; ii < CHUNK; ii++) {
    const a = jj * n + ii, b = a + 1, d = a + n, e = d + 1;
    idx[t++] = a; idx[t++] = d; idx[t++] = b;
    idx[t++] = b; idx[t++] = d; idx[t++] = e;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}

export function criarMaterialTerreno(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.94, metalness: 0 });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniformsTerreno);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vMundo;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvMundo = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vMundo;
uniform float uSecura, uMolhado, uGeada;
float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
// detalhe em várias escalas: manchas de capim, terra batida e "grão" fino
float d1 = vn(vMundo.xz * 0.045);
float d2 = vn(vMundo.xz * 0.21);
float d3 = vn(vMundo.xz * 0.9);
float d4 = vn(vMundo.xz * 3.1);
diffuseColor.rgb *= 0.72 + 0.2 * d1 + 0.22 * d2 + 0.14 * d3 + 0.1 * d4;
float seco = smoothstep(0.62, 0.8, vn(vMundo.xz * 0.08 + 17.0));
diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.18, 1.05, 0.78), seco * 0.5);
// estação seca: o capim amarela (só onde é verde); chuva escurece o chão; geada embranquece de manhã
float verde = clamp((diffuseColor.g - max(diffuseColor.r, diffuseColor.b)) * 9.0, 0.0, 1.0);
diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.32, 1.04, 0.58), uSecura * verde * (0.55 + 0.45 * d1));
diffuseColor.rgb *= 1.0 - 0.2 * uMolhado;
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.9, 0.93), uGeada * verde * 0.6 * d2);`);
  };
  return m;
}

export function Terreno({ hm }: { hm: Heightmap }) {
  const material = useMemo(criarMaterialTerreno, []);
  const chunks = useMemo(() => {
    const rng = new Rng(hm.seed ^ 0x5eed);
    const noise = createNoise2D(() => rng.next());
    const p = PALETAS[hm.bioma];
    const out: THREE.BufferGeometry[] = [];
    const nc = HM_RES / CHUNK;
    for (let cj = 0; cj < nc; cj++) for (let ci = 0; ci < nc; ci++) out.push(construirChunk(hm, ci, cj, p, noise));
    return out;
  }, [hm]);
  useEffect(() => () => { chunks.forEach((c) => c.dispose()); material.dispose(); }, [chunks, material]);

  const contorno = useMemo(() => {
    const pts: [number, number, number][] = [];
    const H = BUILD_HALF;
    const lado = (x0: number, z0: number, x1: number, z1: number) => {
      for (let s = 0; s <= 1; s += 1 / 96) {
        const x = x0 + (x1 - x0) * s, z = z0 + (z1 - z0) * s;
        pts.push([x, Math.max(0.3, sampleHeight(hm, x, z)) + 1.2, z]);
      }
    };
    lado(-H, -H, H, -H); lado(H, -H, H, H); lado(H, H, -H, H); lado(-H, H, -H, -H);
    return pts;
  }, [hm]);

  return (
    <group>
      {chunks.map((g, i) => (
        <mesh key={i} geometry={g} material={material} receiveShadow castShadow />
      ))}
      <Line points={contorno} color="#ffe7a3" lineWidth={1.5} transparent opacity={0.35} dashed dashSize={12} gapSize={8} />
    </group>
  );
}
