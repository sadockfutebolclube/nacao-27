/**
 * Terreno em blocos (chunks) para culling por frustum, com cores por bioma, declividade,
 * altitude e mata. Mais um contorno discreto da área do município.
 */
import { Line } from '@react-three/drei';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { Bioma } from '../../data/schemas';
import { mundo } from '../../sim/bridge';
import { BUILD_HALF, HM_RES, HM_STEP, HM_VERTS, MAP_SIZE } from '../../world/constants';
import { sampleHeight, type Heightmap } from '../../world/terrain';
import { uniformsTerreno } from './climaVisual';
import { texturasPiso } from '../materiais/biblioteca';
import { GLSL_DETALHE } from '../materiais/detalhe';

interface Paleta { grama: string; grama2: string; mata: string; solo: string; areia: string; rocha: string; fundo: string }

export const PALETAS: Record<Bioma, Paleta> = {
  'mata-atlantica': { grama: '#6f9a3c', grama2: '#8aa84a', mata: '#2b5424', solo: '#8a6a44', areia: '#e6d6ac', rocha: '#7b7a74', fundo: '#c7b98f' },
  cerrado: { grama: '#a6a04e', grama2: '#c0ab5c', mata: '#56692d', solo: '#a9512f', areia: '#dcc08f', rocha: '#8b7461', fundo: '#b79a73' },
  caatinga: { grama: '#b2a46c', grama2: '#c6b583', mata: '#7a7a4d', solo: '#b38b5c', areia: '#e0caa0', rocha: '#a29377', fundo: '#c4ae88' },
  amazonia: { grama: '#4f8f30', grama2: '#66a03c', mata: '#1d4a1b', solo: '#7c4f2e', areia: '#d9c89a', rocha: '#6e6a5e', fundo: '#8a7a55' },
  pampa: { grama: '#86ab47', grama2: '#9cbc5a', mata: '#3e6c2b', solo: '#6d5a3c', areia: '#d8c9a2', rocha: '#7e7b72', fundo: '#b9ab86' },
  pantanal: { grama: '#7ea34a', grama2: '#94b45a', mata: '#3e6b2b', solo: '#6c5a3a', areia: '#d6c69c', rocha: '#7a776e', fundo: '#8f8662' },
};

/**
 * Mapa de normais do terreno (Fase 19): 1536² texels (10,7 m) com a normal do relevo interpolado em bicúbica
 * (Catmull-Rom), calculada DEPOIS do relevo filtrado e escavado. As normais por vértice vêm de diferenças de 16 m e
 * dão facetas nas encostas; o mapa suaviza o sombreado entre os vértices. RGB = (nx, nz, ny)·0,5 + 0,5, em mundo.
 */
const TEX_NORMAIS = 1536; // um texel por célula da grade de 10,7 m (era 2048 sobre a de 16 m: 1 s de carga com a grade nova)
function cr(p0: number, p1: number, p2: number, p3: number, t: number): [number, number] {
  const a = -p0 + p2, b = 2 * p0 - 5 * p1 + 4 * p2 - p3, c = -p0 + 3 * p1 - 3 * p2 + p3;
  return [0.5 * (2 * p1 + a * t + b * t * t + c * t * t * t), 0.5 * (a + 2 * b * t + 3 * c * t * t)];
}
export function texturaNormaisTerreno(hm: Heightmap): THREE.DataTexture {
  const n = TEX_NORMAIS, dados = new Uint8Array(n * n * 4);
  const h = hm.h, passo = MAP_SIZE / (n - 1);
  const at = (i: number, j: number) => h[Math.min(HM_RES, Math.max(0, j)) * HM_VERTS + Math.min(HM_RES, Math.max(0, i))];
  const vx = [0, 0, 0, 0], dx = [0, 0, 0, 0];
  for (let ty = 0; ty < n; ty++) {
    const fz = (ty * passo) / HM_STEP, j = Math.min(HM_RES - 1, Math.floor(fz)), tz = fz - j;
    for (let tx = 0; tx < n; tx++) {
      const fx = (tx * passo) / HM_STEP, i = Math.min(HM_RES - 1, Math.floor(fx)), tt = fx - i;
      for (let r = 0; r < 4; r++) {
        const jj = j - 1 + r;
        const [v, d] = cr(at(i - 1, jj), at(i, jj), at(i + 1, jj), at(i + 2, jj), tt);
        vx[r] = v; dx[r] = d;
      }
      const gx = cr(dx[0], dx[1], dx[2], dx[3], tz)[0] / HM_STEP, gz = cr(vx[0], vx[1], vx[2], vx[3], tz)[1] / HM_STEP;
      const l = Math.hypot(gx, 1, gz), o = (ty * n + tx) * 4;
      dados[o] = Math.round((-gx / l * 0.5 + 0.5) * 255);
      dados[o + 1] = Math.round((-gz / l * 0.5 + 0.5) * 255);
      dados[o + 2] = Math.round((1 / l * 0.5 + 0.5) * 255);
      dados[o + 3] = 255;
    }
  }
  const t = new THREE.DataTexture(dados, n, n, THREE.RGBAFormat);
  t.colorSpace = THREE.NoColorSpace; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.needsUpdate = true;
  return t;
}

/**
 * Splat map de 4 camadas (Fase 21), um texel por vértice do relevo: R terra, G grama, B mato (sub-bosque), A rocha.
 *  - rocha exposta acima de 35° (tangente 0,70);
 *  - terra onde há gente: a cobertura de prédios (área dos prédios por célula, suavizada em ~30 m) vira solo batido;
 *  - fora disso, mato onde o OSM mapeia mata (wood/forest 255, scrub 170) ou onde a encosta passa de ~16°, e grama no plano
 *    (parque/jardim/grama do OSM vêm como cobertura 50–140). O OSM não mapeia toda a vegetação do Rio: o que não tem
 *    nome nem prédio é verde, não solo exposto.
 */
const passo = (a: number, b: number, v: number) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
function coberturaDePredios(predios: ArrayLike<number> | undefined): Float32Array {
  const g = new Float32Array(HM_VERTS * HM_VERTS);
  const half = MAP_SIZE / 2, cel = HM_STEP * HM_STEP;
  if (predios) for (let o = 0; o + 8 < predios.length; o += 9) {
    const i = Math.round((predios[o] + half) / HM_STEP), j = Math.round((predios[o + 1] + half) / HM_STEP);
    if (i < 0 || j < 0 || i > HM_RES || j > HM_RES) continue;
    g[j * HM_VERTS + i] += Math.min(900, predios[o + 3] * predios[o + 4]) / cel;
  }
  // caixa 5×5 (±21 m) duas vezes ≈ gaussiana: o adensamento vira uma mancha suave, não pontos
  const tmp = new Float32Array(g.length), R = 2;
  for (let rep = 0; rep < 2; rep++) {
    for (let j = 0; j < HM_VERTS; j++) for (let i = 0; i < HM_VERTS; i++) { let s = 0; for (let d = -R; d <= R; d++) s += g[j * HM_VERTS + Math.min(HM_RES, Math.max(0, i + d))]; tmp[j * HM_VERTS + i] = s / (2 * R + 1); }
    for (let j = 0; j < HM_VERTS; j++) for (let i = 0; i < HM_VERTS; i++) { let s = 0; for (let d = -R; d <= R; d++) s += tmp[Math.min(HM_RES, Math.max(0, j + d)) * HM_VERTS + i]; g[j * HM_VERTS + i] = s / (2 * R + 1); }
  }
  return g;
}
export function texturaSplat(hm: Heightmap, predios?: ArrayLike<number>): THREE.DataTexture {
  const dados = new Uint8Array(HM_VERTS * HM_VERTS * 4);
  const cobertura = coberturaDePredios(predios);
  for (let j = 0; j < HM_VERTS; j++) for (let i = 0; i < HM_VERTS; i++) {
    const k = j * HM_VERTS + i, o = k * 4;
    const il = Math.max(0, i - 1), ir = Math.min(HM_RES, i + 1), jd = Math.max(0, j - 1), ju = Math.min(HM_RES, j + 1);
    const gx = (hm.h[j * HM_VERTS + ir] - hm.h[j * HM_VERTS + il]) / ((ir - il) * HM_STEP), gz = (hm.h[ju * HM_VERTS + i] - hm.h[jd * HM_VERTS + i]) / ((ju - jd) * HM_STEP);
    const incl = Math.hypot(gx, gz), f = hm.forest[k];
    const rocha = passo(0.62, 0.92, incl);
    const urbano = passo(0.05, 0.3, cobertura[k]);
    const matoBase = Math.max(passo(120, 190, f), passo(0.28, 0.5, incl) * 0.92);
    const verde = 1 - urbano;
    const mato = verde * matoBase * (1 - rocha);
    const grama = verde * (1 - matoBase) * (1 - rocha);
    const terra = Math.max(0, (1 - rocha) * urbano);
    dados[o] = Math.round(terra * 255); dados[o + 1] = Math.round(grama * 255); dados[o + 2] = Math.round(mato * 255); dados[o + 3] = Math.round(rocha * 255);
  }
  const t = new THREE.DataTexture(dados, HM_VERTS, HM_VERTS, THREE.RGBAFormat);
  t.colorSpace = THREE.NoColorSpace; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter; t.generateMipmaps = false;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.needsUpdate = true;
  return t;
}

/** células por bloco do terreno (precisa dividir HM_RES: 1536 / 128 = 12 × 12 blocos) */
const CHUNK = 128;

function corDoVertice(hm: Heightmap, i: number, j: number, p: Paleta, out: THREE.Color, tmp: THREE.Color) {
  const k = j * HM_VERTS + i;
  const h = hm.h[k];
  if (h < 0.4) {
    // leito submerso: areia clara que escurece com a profundidade
    out.set(p.areia).lerp(tmp.set(p.fundo), Math.min(1, -h / 6));
    return out;
  }
  // Fase 21: o chão de terra firme é o splat de 4 camadas (terra, grama, mato, rocha) no shader; o vértice só leva a areia da praia
  const praia = hm.waterDist[k] < 70 && h < 3.2;
  out.setRGB(1, 1, 1);
  if (praia) out.lerp(tmp.set(p.areia), Math.min(1, (70 - hm.waterDist[k]) / 40));
  return out;
}

function construirChunk(hm: Heightmap, ci: number, cj: number, p: Paleta): THREE.BufferGeometry {
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
      corDoVertice(hm, i, j, p, c, tmp);
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

export function criarMaterialTerreno(normais?: THREE.Texture, splat?: THREE.Texture): THREE.MeshStandardMaterial {
  // polygonOffset positivo: o terreno nunca cobre asfalto, calçada nem faixa (ordem: terreno < água < calçada < asfalto < faixas)
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.94, metalness: 0, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2 });
  // Fase 12: capim, terra e rocha fotográficos (ambientCG, CC0) como detalhe sobre a paleta do bioma
  const grama = texturasPiso('Grass004'), terra = texturasPiso('Ground103'), rocha = texturasPiso('Rock064'), mato = texturasPiso('Moss001');
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniformsTerreno, {
      tMacroN: { value: normais ?? null }, uMacroN: { value: normais ? 1 : 0 }, uMapa: { value: MAP_SIZE },
      tGrama: { value: grama.map }, tTerra: { value: terra.map }, tRocha: { value: rocha.map }, tMato: { value: mato.map },
      tGramaN: { value: grama.normalMap }, tRochaN: { value: rocha.normalMap }, tSplat: { value: splat ?? null },
    });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vMundo;\nvarying float vInclT;\nvarying vec3 vNmT;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvMundo = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvInclT = 1.0 - normalize(objectNormal).y;\nvNmT = normalize(objectNormal);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vMundo;
varying float vInclT;
varying vec3 vNmT;
uniform float uSecura, uMolhado, uGeada;
uniform sampler2D tGrama, tTerra, tRocha, tMato, tGramaN, tRochaN, tSplat, tMacroN;
uniform float uMacroN, uMapa;
${GLSL_DETALHE}
float wGramaT = 0.0, wRochaT = 0.0;
float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
vec3 albedoMix(sampler2D t, vec2 p, float esc, float n) {
  vec3 a = texture(t, p / esc).rgb;
  vec3 b = texture(t, mat2(0.8, -0.6, 0.6, 0.8) * p / (esc * 2.7) + 0.37).rgb;
  return mix(a, b, 0.25 + 0.5 * n);
}
float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
// splat de 4 camadas (terra, grama, mato, rocha) por inclinação e cobertura do solo; a cor de vértice só leva areia e leito
vec2 uvS = (vMundo.xz + uMapa * 0.5) / uMapa;
vec2 desvio = (vec2(vn(vMundo.xz * 0.35), vn(vMundo.xz * 0.35 + 9.7)) - 0.5) * 0.0012; // borda irregular (±7 m)
vec4 sp = texture2D(tSplat, uvS + desvio);
float nB = vn(vMundo.xz * 0.011), nM = vn(vMundo.xz * 0.05 + 3.1);
vec3 cT = albedoMix(tTerra, vMundo.xz, 3.6, nM);
vec3 cG = albedoMix(tGrama, vMundo.xz, 2.8, nM);
vec3 cM = albedoMix(tMato, vMundo.xz, 3.2, nB);
// rocha em três projeções: nos paredões (Pão de Açúcar, Corcovado) a textura de cima esticaria em riscos
vec3 wTri = pow(abs(vNmT), vec3(4.0)); wTri /= (wTri.x + wTri.y + wTri.z);
vec3 cR = vec3(0.0);
if (sp.a > 0.01) cR = texture(tRocha, vMundo.zy / 7.0).rgb * wTri.x + texture(tRocha, vMundo.xz / 7.0).rgb * wTri.y + texture(tRocha, vMundo.xy / 7.0).rgb * wTri.z;
vec3 albT = cT * sp.r + cG * sp.g + cM * sp.b + cR * sp.a;
albT *= 0.84 + 0.32 * nB; // variação de tom em escala de centenas de metros (anti-repetição)
albT *= mix(vec3(1.0), vec3(1.10, 1.0, 0.84), smoothstep(0.55, 0.85, nM) * (sp.g + sp.r) * 0.55);
float firme = clamp((min(diffuseColor.r, min(diffuseColor.g, diffuseColor.b)) - 0.7) / 0.3, 0.0, 1.0);
diffuseColor.rgb *= mix(vec3(1.0), albT, firme);
wGramaT = sp.g; wRochaT = sp.a;
// detalhe em várias escalas: manchas de capim, terra batida e "grão" fino
float d1 = vn(vMundo.xz * 0.045);
float d2 = vn(vMundo.xz * 0.21);
float d3 = vn(vMundo.xz * 0.9);
float d4 = vn(vMundo.xz * 3.1);
diffuseColor.rgb *= 0.8 + 0.2 * d1 + 0.18 * d2 + 0.08 * d3 + 0.04 * d4;
float seco = smoothstep(0.62, 0.8, vn(vMundo.xz * 0.08 + 17.0));
diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.18, 1.05, 0.78), seco * 0.5);
// estação seca: o capim amarela (só onde é verde); chuva escurece o chão; geada embranquece de manhã
float verde = clamp((diffuseColor.g - max(diffuseColor.r, diffuseColor.b)) * 9.0, 0.0, 1.0);
diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.32, 1.04, 0.58), uSecura * verde * (0.55 + 0.45 * d1));
diffuseColor.rgb *= 1.0 - 0.2 * uMolhado;
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.9, 0.93), uGeada * verde * 0.6 * d2);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
if (uMacroN > 0.5) {
  // normal do relevo bicúbico (mundo → vista) no lugar da normal facetada por vértice
  vec3 mn = texture2D(tMacroN, (vMundo.xz + uMapa * 0.5) / uMapa).xzy * 2.0 - 1.0;
  normal = normalize((viewMatrix * vec4(normalize(mn), 0.0)).xyz);
}
{
  vec3 nT = normalize(mix(normalDetalhe(tGramaN, vMundo.xz, 2.8), normalDetalhe(tRochaN, vMundo.xz, 7.0), wRochaT * pow(abs(vNmT.y), 4.0)));
  vec3 tT = normalize((viewMatrix * vec4(1.0, 0.0, 0.0, 0.0)).xyz);
  vec3 bT = normalize((viewMatrix * vec4(0.0, 0.0, 1.0, 0.0)).xyz);
  tT = normalize(tT - dot(tT, normal) * normal);
  bT = normalize(bT - dot(bT, normal) * normal - dot(bT, tT) * tT);
  normal = normalize(normal + (tT * nT.x + bT * nT.y) * 0.8);
}`);
  };
  m.customProgramCacheKey = () => 'terreno-pbr';
  return m;
}

export function Terreno({ hm }: { hm: Heightmap }) {
  const normais = useMemo(() => {
    const t0 = performance.now();
    const t = texturaNormaisTerreno(hm);
    const ms = Math.round(performance.now() - t0);
    if (ms > 250) console.warn(`[lento] terreno: mapa de normais: ${ms} ms`);
    return t;
  }, [hm]);
  const splat = useMemo(() => texturaSplat(hm, mundo.real?.predios), [hm]);
  const material = useMemo(() => criarMaterialTerreno(normais, splat), [normais, splat]);
  const chunks = useMemo(() => {
    const p = PALETAS[hm.bioma];
    const out: THREE.BufferGeometry[] = [];
    const nc = HM_RES / CHUNK;
    for (let cj = 0; cj < nc; cj++) for (let ci = 0; ci < nc; ci++) out.push(construirChunk(hm, ci, cj, p));
    return out;
  }, [hm]);
  useEffect(() => () => { chunks.forEach((c) => c.dispose()); material.dispose(); normais.dispose(); splat.dispose(); }, [chunks, material, normais, splat]);

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
