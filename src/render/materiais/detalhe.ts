/**
 * Detalhe fotográfico (Fase 12) para materiais que já têm cor própria — asfalto, calçadas, terreno:
 * a foto PBR é amostrada em coordenadas do mundo (X/Z, em metros) e entra como *razão* sobre a cor
 * existente (foto ÷ cor média da foto), então a paleta do bioma e as faixas pintadas continuam
 * valendo e só ganham grão, fissuras, pedrinhas e relevo. A cor média sai do último mip da própria
 * textura; de longe a razão tende a 1 e o padrão de repetição some sozinho.
 *
 * Duas escalas misturadas (a segunda girada) quebram a repetição de perto.
 */
import * as THREE from 'three';
import { texturasPiso, type Piso } from './biblioteca';

/** GLSL comum: razão de detalhe com duas escalas e normal em espaço de tangente do plano X/Z. */
export const GLSL_DETALHE = /* glsl */ `
vec3 razaoDetalhe(sampler2D t, vec2 p, float esc) {
  vec2 uvA = p / esc;
  vec2 uvB = mat2(0.8, -0.6, 0.6, 0.8) * p / (esc * 2.7) + 0.37;
  vec3 media = max(textureLod(t, vec2(0.5), 12.0).rgb, vec3(0.04));
  vec3 a = texture(t, uvA).rgb / media, b = texture(t, uvB).rgb / media;
  return sqrt(a * b);
}
vec3 normalDetalhe(sampler2D t, vec2 p, float esc) {
  vec2 uvA = p / esc;
  vec2 uvB = mat2(0.8, -0.6, 0.6, 0.8) * p / (esc * 2.7) + 0.37;
  vec3 a = texture(t, uvA).xyz * 2.0 - 1.0, b = texture(t, uvB).xyz * 2.0 - 1.0;
  // a amostra B foi girada: desgira a inclinação
  b.xy = mat2(0.8, 0.6, -0.6, 0.8) * b.xy;
  return normalize(vec3(a.xy + b.xy, a.z * b.z));
}`;

/**
 * Acrescenta o detalhe fotográfico a um MeshStandardMaterial com mapa/cor próprios.
 * `esc` = metros por repetição; `forca` 0–1 dosa cor e relevo.
 */
export function comDetalhe(m: THREE.MeshStandardMaterial, piso: Piso, esc: number, forca = 1): THREE.MeshStandardMaterial {
  const tx = texturasPiso(piso);
  const anterior = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    anterior?.call(m, sh, r);
    sh.uniforms.tDetCor = { value: tx.map };
    sh.uniforms.tDetNor = { value: tx.normalMap };
    sh.uniforms.tDetRug = { value: tx.roughnessMap };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vMundoD;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvMundoD = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vMundoD;
uniform sampler2D tDetCor, tDetNor, tDetRug;
${GLSL_DETALHE}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
diffuseColor.rgb *= mix(vec3(1.0), razaoDetalhe(tDetCor, vMundoD.xz, ${esc.toFixed(2)}), ${forca.toFixed(2)});`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor *= mix(1.0, texture(tDetRug, vMundoD.xz / ${esc.toFixed(2)}).g / max(textureLod(tDetRug, vec2(0.5), 12.0).g, 0.1), ${forca.toFixed(2)});`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
{
  vec3 nD = normalDetalhe(tDetNor, vMundoD.xz, ${esc.toFixed(2)});
  vec3 tD = normalize((viewMatrix * vec4(1.0, 0.0, 0.0, 0.0)).xyz);
  vec3 bD = normalize((viewMatrix * vec4(0.0, 0.0, 1.0, 0.0)).xyz);
  tD = normalize(tD - dot(tD, normal) * normal);
  bD = normalize(bD - dot(bD, normal) * normal - dot(bD, tD) * tD);
  normal = normalize(normal + (tD * nD.x + bD * nD.y) * ${(0.9 * forca).toFixed(2)});
}`);
  };
  m.customProgramCacheKey = () => `detalhe-${piso}-${esc}-${forca}`;
  return m;
}
