/**
 * Material de fachada procedural para prédios instanciados: janelas por andar, faixa de laje
 * (pastilha dos anos 70), vitrine no térreo comercial, galpão com telha ondulada, andaime de
 * obra, reflexo do céu no vidro e janelas acesas à noite. Tudo derivado da escala da instância,
 * sem texturas.
 *
 * Atributo por instância `aFachada` (vec4):
 *   x = estilo (0 casa, 1 prédio, 2 vidro, 3 galpão, 4 obra, 5 liso/telhado)
 *   y = pé-direito (m)
 *   z = semente
 *   w = 1 loja no térreo, -1 abandonado, 0 normal
 */
import * as THREE from 'three';

export interface UniformsFachada {
  uNoite: { value: number };
  uTempo: { value: number };
  uCeu: { value: THREE.Color };
  uCamada: { value: number };
}

export function criarMaterialFachada(uniforms: UniformsFachada): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.82, metalness: 0.0 });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec4 aFachada;
varying vec3 vFac;
varying vec4 vPar;
varying vec3 vEsc;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
#ifdef USE_INSTANCING
vec3 esc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
#else
vec3 esc = vec3(1.0);
#endif
vec3 lp = position * esc;
float lateralX = step(0.5, abs(normal.x));
vFac = vec3(mix(lp.x, lp.z, lateralX), lp.y, step(0.5, normal.y));
vPar = aFachada;
vEsc = esc;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uNoite, uTempo, uCamada;
uniform vec3 uCeu;
varying vec3 vFac;
varying vec4 vPar;
varying vec3 vEsc;
float hashF(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float janela = 0.0;
float acesa = 0.0;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
if (uCamada < 0.5) {
  float estilo = vPar.x;
  float pe = max(vPar.y, 2.5);
  float semente = vPar.z;
  bool teto = vFac.z > 0.5;
  float andar = floor(vFac.y / pe);
  float fy = fract(vFac.y / pe);
  if (!teto && estilo < 2.5) {
    float esp = estilo < 0.5 ? 3.4 : (estilo < 1.5 ? 2.8 : 1.5);
    float col = floor(vFac.x / esp + 0.5);
    float fx = fract(vFac.x / esp + 0.5);
    float lx = estilo < 0.5 ? 0.36 : (estilo < 1.5 ? 0.44 : 0.47);
    float y0 = estilo < 1.5 ? 0.32 : 0.06, y1 = estilo < 1.5 ? 0.8 : 0.96;
    janela = step(abs(fx - 0.5), lx) * step(y0, fy) * step(fy, y1);
    // sem janela no topo (platibanda)
    janela *= step(vFac.y, vEsc.y - 0.4);
    if (estilo > 0.5 && estilo < 1.5) {
      // faixa de laje + pastilhas
      diffuseColor.rgb *= mix(0.78, 1.0, step(0.09, fy));
      float pastilha = step(0.5, fract(vFac.x * 4.0)) * step(0.5, fract(vFac.y * 4.0));
      diffuseColor.rgb *= 0.96 + 0.05 * pastilha;
    }
    if (vPar.w > 0.5 && andar < 0.5) {
      // vitrine no térreo
      janela = step(0.06, fy) * step(fy, 0.78) * step(abs(fract(vFac.x / 4.0 + 0.5) - 0.5), 0.46);
    }
    float h = hashF(vec3(col, andar, semente * 97.0));
    float rodizio = floor(uTempo / 35.0 + semente * 7.0);
    float h2 = hashF(vec3(col + rodizio, andar, semente * 13.0));
    acesa = step(h, 0.22 + 0.22 * h2) * janela;
    if (vPar.w > 0.5 && andar < 0.5) acesa = janela;
    if (vPar.w < -0.5) acesa = 0.0;
    vec3 vidro = estilo > 1.5 ? vec3(0.035, 0.06, 0.08) : vec3(0.025, 0.03, 0.035);
    // moldura/peitoril: borda clara em volta do vidro
    float moldura = step(abs(fx - 0.5), lx + 0.04) * step(y0 - 0.05, fy) * step(fy, y1 + 0.03) * (1.0 - janela);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.92), moldura * 0.55 * step(estilo, 1.5));
    diffuseColor.rgb = mix(diffuseColor.rgb, vidro, janela * 0.94);
  } else if (!teto && estilo > 2.5 && estilo < 3.5) {
    // galpão: telha ondulada na parede + faixa de janelas altas
    diffuseColor.rgb *= 0.9 + 0.1 * step(0.5, fract(vFac.x * 1.4));
    janela = step(vEsc.y * 0.7, vFac.y) * step(vFac.y, vEsc.y * 0.88) * step(0.15, fract(vFac.x / 3.0));
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.1, 0.12, 0.13), janela * 0.85);
    acesa = janela * step(0.4, hashF(vec3(floor(vFac.x / 3.0), 1.0, semente))) * 0.6;
  } else if (estilo > 3.5 && estilo < 4.5) {
    // obra: estrutura de concreto, andaime e tela laranja
    float gx = step(0.86, fract(vFac.x / 2.2));
    float gy = step(0.84, fract(vFac.y / 2.9));
    vec3 conc = vec3(0.58, 0.56, 0.52);
    diffuseColor.rgb = mix(conc, vec3(0.95, 0.42, 0.1), max(gx, gy) * 0.85);
    if (teto) diffuseColor.rgb = conc * 0.8;
  }
  if (vPar.w < -0.5) diffuseColor.rgb *= vec3(0.55, 0.52, 0.48);
}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = mix(roughnessFactor, 0.12, janela);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
if (uCamada < 0.5) {
  vec3 vdir = normalize(vViewPosition);
  float fres = pow(1.0 - abs(dot(normal, vdir)), 3.0);
  totalEmissiveRadiance += janela * uCeu * (0.03 + 0.32 * fres) * (1.0 - uNoite);
  vec3 quente = mix(vec3(1.0, 0.72, 0.42), vec3(0.85, 0.9, 1.0), step(0.7, fract(vPar.z * 31.0)));
  totalEmissiveRadiance += acesa * uNoite * quente * 1.35;
} else {
  totalEmissiveRadiance += diffuseColor.rgb * 0.25;
}`);
  };
  return m;
}
