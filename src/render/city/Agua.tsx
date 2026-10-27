/**
 * Água: shader próprio com ondas procedurais, fresnel, brilho do sol, espuma na costa
 * (profundidade lida do heightmap) e cor que muda com a poluição simulada.
 */
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { HM_VERTS, MAP_SIZE } from '../../world/constants';
import type { Heightmap } from '../../world/terrain';
import { ambiente } from './ambiente';
import { uniformsAgua } from './climaVisual';

const vert = /* glsl */ `
#include <common>
#include <fog_pars_vertex>
varying vec3 vMundo;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vMundo = w.xyz;
  vec4 mvPosition = viewMatrix * w;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const frag = /* glsl */ `
#include <common>
#include <fog_pars_fragment>
uniform float uTempo, uPoluicao, uNoite, uRessaca, uLama;
uniform vec3 uSol, uCorSol, uCorCeu;
uniform sampler2D uProf;
uniform float uMapa;
varying vec3 vMundo;

float h21(vec2 p) { p = fract(p * vec2(234.34, 435.345)); p += dot(p, p + 34.23); return fract(p.x * p.y); }
float vn(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), u.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), u.x), u.y); }
float ondas(vec2 p) {
  float t = uTempo;
  return vn(p * 0.045 + vec2(t * 0.05, t * 0.03)) * 0.5
       + vn(p * 0.11 - vec2(t * 0.07, -t * 0.04)) * 0.3
       + vn(p * 0.31 + vec2(-t * 0.12, t * 0.1)) * 0.2;
}

void main() {
  vec2 uv = (vMundo.xz + uMapa * 0.5) / uMapa;
  float dentro = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
  float prof = mix(30.0, texture2D(uProf, uv).r * 30.0, dentro);

  float e = 0.6;
  float hC = ondas(vMundo.xz);
  float hX = ondas(vMundo.xz + vec2(e, 0.0));
  float hZ = ondas(vMundo.xz + vec2(0.0, e));
  float forca = mix(0.55, 0.25, uPoluicao) * (1.0 + 1.8 * uRessaca);
  vec3 n = normalize(vec3((hC - hX) * forca / e * 6.0, 1.0, (hC - hZ) * forca / e * 6.0));

  vec3 V = normalize(cameraPosition - vMundo);
  float fres = 0.03 + 0.97 * pow(1.0 - max(dot(n, V), 0.0), 5.0);

  vec3 fundo = mix(vec3(0.015, 0.13, 0.19), vec3(0.08, 0.10, 0.045), uPoluicao);
  vec3 raso = mix(vec3(0.07, 0.48, 0.50), vec3(0.30, 0.31, 0.15), uPoluicao);
  vec3 col = mix(raso, fundo, smoothstep(0.0, 9.0, prof));
  float luz = 0.25 + 0.75 * clamp(uSol.y * 2.0, 0.0, 1.0);
  col *= mix(luz, 0.12, uNoite);
  col = mix(col, uCorCeu * 0.95, fres * 0.85);

  vec3 H = normalize(uSol + V);
  float spec = pow(max(dot(n, H), 0.0), 420.0) * (1.0 - uPoluicao * 0.7);
  col += uCorSol * spec * 7.0 * step(0.0, uSol.y);
  col += uCorSol * pow(max(dot(n, H), 0.0), 40.0) * 0.08 * step(0.0, uSol.y);

  float espuma = smoothstep(1.3, 0.15, prof) * (0.55 + 0.45 * vn(vMundo.xz * 0.35 + uTempo * 0.6));
  espuma += smoothstep(2.6, 1.6, prof) * smoothstep(0.62, 0.8, vn(vMundo.xz * 0.12 - uTempo * 0.25)) * 0.5;
  espuma *= 1.0 + 1.5 * uRessaca;
  // água barrenta depois de enchente (sedimento descendo dos rios)
  col = mix(col, vec3(0.32, 0.25, 0.15) * mix(1.0, 0.3, uNoite), uLama * 0.55 * smoothstep(12.0, 0.0, prof));
  vec3 corEspuma = mix(vec3(0.95), vec3(0.7, 0.66, 0.5), uPoluicao);
  col = mix(col, corEspuma * mix(1.0, 0.25, uNoite), clamp(espuma, 0.0, 1.0) * 0.75);

  float alpha = mix(0.5, 0.97, smoothstep(0.0, 3.5, prof));
  gl_FragColor = vec4(col, alpha);
  #include <fog_fragment>
}`;

export function Agua({ hm }: { hm: Heightmap }) {
  const tex = useMemo(() => {
    const data = new Uint8Array(HM_VERTS * HM_VERTS);
    for (let k = 0; k < data.length; k++) data[k] = Math.round(Math.min(1, Math.max(0, -hm.h[k] / 30)) * 255);
    const t = new THREE.DataTexture(data, HM_VERTS, HM_VERTS, THREE.RedFormat, THREE.UnsignedByteType);
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearFilter;
    t.needsUpdate = true;
    return t;
  }, [hm]);

  const mat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: vert,
    fragmentShader: frag,
    transparent: true,
    fog: true,
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uTempo: { value: 0 }, uPoluicao: { value: 0.2 }, uNoite: { value: 0 },
        uSol: { value: new THREE.Vector3(0, 1, 0) }, uCorSol: { value: new THREE.Color() }, uCorCeu: { value: new THREE.Color() },
        uProf: { value: null }, uMapa: { value: MAP_SIZE },
      },
    ]),
  }), []);
  mat.uniforms.uProf.value = tex;
  mat.uniforms.uRessaca = uniformsAgua.uRessaca;
  mat.uniforms.uLama = uniformsAgua.uLama;

  useEffect(() => () => { tex.dispose(); }, [tex]);
  useEffect(() => () => { mat.dispose(); }, [mat]);

  useFrame((_, dt) => {
    const u = mat.uniforms;
    u.uTempo.value += dt;
    u.uPoluicao.value += (ambiente.poluicaoAgua - u.uPoluicao.value) * Math.min(1, dt * 0.5);
    u.uNoite.value = ambiente.noite;
    u.uSol.value.copy(ambiente.sol);
    u.uCorSol.value.copy(ambiente.corSol).multiplyScalar(Math.min(1.4, ambiente.intensidadeSol / 2.4 + 0.1));
    u.uCorCeu.value.copy(ambiente.corCeu);
  });

  return (
    <mesh rotation-x={-Math.PI / 2} position-y={0} material={mat} renderOrder={1}>
      <planeGeometry args={[40000, 40000, 1, 1]} />
    </mesh>
  );
}
