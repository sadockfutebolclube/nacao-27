/**
 * Prédios reais com a planta verdadeira (Fase 12): cada contorno do OpenStreetMap/Microsoft vira um
 * prisma extrudado com fachada fotográfica (ambientCG), reboco com janelas desenhadas, telhado de
 * duas águas com telha cerâmica nas casas e laje com brita nos prédios.
 *
 * A geometria é estática por bloco de 512 m e, desde a Fase 13 (Rio com 150 mil prédios), só existe perto
 * da câmera: até 1,5 km a planta completa, até 3,5 km uma caixa simples, até 9 km só os prédios altos
 * (a silhueta da cidade). Os blocos são montados aos poucos, alguns por quadro. O que muda com a simulação — altura, cota do terreno, obra, abandono, cor da camada de informação —
 * vem de uma textura de estado lida no vertex shader (2 texels por prédio). Assim dezenas de milhares
 * de prédios mudam sem remontar nada.
 */
import { medir } from '../medir';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { CAMPOS_PREDIO, contorno, predio, retangulo, type CidadeReal } from '../../data/cidadeReal';
import { arquetipoPorId } from '../../sim/catalog';
import { mundo, useGame, type Camada } from '../../sim/bridge';
import { FLAG, LOT_STATE_STRIDE } from '../../sim/protocol';
import { LOT_STRIDE } from '../../world/lots';
import { useApp } from '../../app/store';
import { useNivel } from '../qualidade';
import { CAMADA, CAMADAS, carregarBiblioteca, type Biblioteca } from '../materiais/biblioteca';
import { ambiente } from './ambiente';
import { clima } from './climaVisual';
import { corCamada, useVersaoLenta } from './Edificios';
import { estiloRegional } from './estilos';
import { usePrediosReais } from './prediosReaisEstado';

const BLOCO = 512;
/** distância (m) da câmera ao centro do bloco para cada nível de detalhe */
const DIST_LOD = [1500, 3500, 9000];
const POR_LINHA = 2048;
const CAMADAS_NEUTRAS: Camada[] = ['nenhuma', 'zonas', 'transito', 'transporte'];

/** estilo das paredes de reboco: janelas desenhadas no shader */
const enum Estilo { Casa = 0, Predio = 1, Loja = 2, Galpao = 3, Liso = 4 }
/** parte da geometria: parede (v pela altura), telhado (uv no plano), oitão (parede triangular), anexo na laje (paredes e teto) */
const enum Parte { Parede = 0, Telhado = 1, Oitao = 2, Anexo = 3, LajeAnexo = 4 }

function hash01(n: number) { const s = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return s - Math.floor(s); }


/** Escolhe materiais e forma do telhado a partir do que o arquivo diz do prédio. */
function aparencia(c: CidadeReal, i: number, sigla: string | undefined) {
  const p = predio(c, i);
  const h = hash01(i * 7919 + 13), h2 = hash01(i * 104729 + 7), h3 = hash01(i * 15485863 + 3);
  const E = estiloRegional(sigla);
  const area = p.w * p.d;
  let estiloTelhado = 0;
  let parede: number, estilo: Estilo = Estilo.Predio, tinta = '#ffffff', telhado = CAMADA.Gravel043, corTelhado = '#d8d4cc', duasAguas = false;
  if (p.tipo === 2) {
    parede = CAMADA.PaintedPlaster017; estilo = Estilo.Galpao; tinta = h < 0.5 ? '#e4e2dc' : '#c9d1d6';
    telhado = CAMADA.Plaster001; estiloTelhado = 3; corTelhado = h2 < 0.5 ? '#cfd3d6' : '#9fb3c4';
  } else if (p.tipo === 0 && p.andares <= 3) {
    parede = h2 < 0.6 ? CAMADA.Plaster001 : CAMADA.PaintedPlaster017; estilo = Estilo.Casa;
    const pal = E.paredesCasa;
    tinta = h3 < E.vivas ? pal[Math.floor(h * pal.length)] : pal[pal.length - 1 - Math.floor(h * Math.min(4, pal.length))];
    duasAguas = h2 < Math.max(0.35, E.telhaEmCasas) && area < 900;
    telhado = duasAguas ? (E.telhas[0] < '#a0' ? CAMADA.RoofingTiles013A : h < 0.5 ? CAMADA.RoofingTiles014A : CAMADA.RoofingTiles006) : CAMADA.Plaster001;
    corTelhado = duasAguas ? '#ffffff' : '#bdb8ae';
  } else if (p.tipo === 4) {
    parede = CAMADA.Plaster001; estilo = Estilo.Predio; tinta = '#f6f2e8';
    duasAguas = area < 2500; telhado = CAMADA.RoofingTiles014A; corTelhado = '#ffffff';
  } else if ((p.tipo === 1 || p.tipo === 3) && p.andares <= 3) {
    parede = h2 < 0.5 ? CAMADA.PaintedPlaster017 : CAMADA.Plaster001; estilo = Estilo.Loja;
    tinta = E.paredesPredio[Math.floor(h * E.paredesPredio.length)];
  } else if (p.tipo === 1 || p.tipo === 3) {
    // comercial alto: pele de vidro e escritórios
    const op = [CAMADA.Facade001, CAMADA.Facade005, CAMADA.Facade014, CAMADA.Facade017, CAMADA.Facade006, CAMADA.Facade019A];
    parede = op[Math.floor(h * op.length)];
  } else {
    // residencial vertical: metade reboco pintado com janelas, metade fachadas fotográficas
    if (h < 0.5) {
      parede = h2 < 0.5 ? CAMADA.PaintedPlaster017 : CAMADA.Plaster001; estilo = Estilo.Predio;
      tinta = E.paredesPredio[Math.floor(h3 * E.paredesPredio.length)];
    } else {
      const op = [CAMADA.Facade018A, CAMADA.Facade019A, CAMADA.Facade020A, CAMADA.Facade006, CAMADA.Facade019A];
      parede = op[Math.floor(h2 * op.length)];
    }
  }
  return { p, parede, estilo, estiloTelhado, tinta: new THREE.Color(tinta), telhado, corTelhado: new THREE.Color(corTelhado), duasAguas, inclinacao: E.inclinacao };
}

/** Acumulador de vértices em arrays tipados que crescem (blocos densos têm dezenas de milhares de vértices). */
class Acumulador {
  n = 0; ni = 0;
  pos = new Float32Array(3 * 4096); nor = new Float32Array(3 * 4096); info = new Float32Array(4 * 4096);
  uv = new Float32Array(2 * 4096); cor = new Uint8Array(4 * 4096); idx = new Uint32Array(6 * 4096);
  private crescer() {
    const f32 = (a: Float32Array) => { const b = new Float32Array(a.length * 2); b.set(a); return b; };
    const u8 = new Uint8Array(this.cor.length * 2); u8.set(this.cor); this.cor = u8;
    this.pos = f32(this.pos); this.nor = f32(this.nor); this.info = f32(this.info); this.uv = f32(this.uv);
  }
  vert(i: number, x: number, topo: number, z: number, nx: number, ny: number, nz: number, camada: number, estilo: number, parte: Parte, extra: number, u: number, v: number, c: THREE.Color): number {
    if ((this.n + 1) * 3 > this.pos.length) this.crescer();
    const k = this.n;
    this.pos[k * 3] = x; this.pos[k * 3 + 1] = topo; this.pos[k * 3 + 2] = z;
    this.nor[k * 3] = nx; this.nor[k * 3 + 1] = ny; this.nor[k * 3 + 2] = nz;
    this.info[k * 4] = i; this.info[k * 4 + 1] = camada; this.info[k * 4 + 2] = estilo + parte * 8; this.info[k * 4 + 3] = extra;
    this.uv[k * 2] = u; this.uv[k * 2 + 1] = v;
    this.cor[k * 4] = Math.round(c.r * 255); this.cor[k * 4 + 1] = Math.round(c.g * 255); this.cor[k * 4 + 2] = Math.round(c.b * 255); this.cor[k * 4 + 3] = 255;
    return this.n++;
  }
  tri(a: number, b: number, c: number) {
    if (this.ni + 3 > this.idx.length) { const b2 = new Uint32Array(this.idx.length * 2); b2.set(this.idx); this.idx = b2; }
    this.idx[this.ni++] = a; this.idx[this.ni++] = b; this.idx[this.ni++] = c;
  }
  /** Triângulo com a face voltada para `n` (corrige a ordem dos vértices se preciso). */
  triVoltado(a: number, b: number, c: number, n: [number, number, number]) {
    const P = this.pos, I = this.info;
    // y de referência: topo a 10 m + extra (telhados)
    const y = (k: number) => P[k * 3 + 1] * 10 + I[k * 4 + 3];
    const ux = P[b * 3] - P[a * 3], uy = y(b) - y(a), uz = P[b * 3 + 2] - P[a * 3 + 2];
    const vx = P[c * 3] - P[a * 3], vy = y(c) - y(a), vz = P[c * 3 + 2] - P[a * 3 + 2];
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
    if (cx * n[0] + cy * n[1] + cz * n[2] >= 0) this.tri(a, b, c); else this.tri(a, c, b);
  }
  geometria(bx: number, bz: number): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos.slice(0, this.n * 3), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(this.nor.slice(0, this.n * 3), 3));
    g.setAttribute('aInfo', new THREE.BufferAttribute(this.info.slice(0, this.n * 4), 4));
    g.setAttribute('aUV', new THREE.BufferAttribute(this.uv.slice(0, this.n * 2), 2));
    g.setAttribute('color', new THREE.BufferAttribute(this.cor.slice(0, this.n * 4), 4, true));
    g.setIndex(this.n > 65535 ? new THREE.BufferAttribute(this.idx.slice(0, this.ni), 1) : new THREE.BufferAttribute(Uint16Array.from(this.idx.subarray(0, this.ni)), 1));
    // a altura real vem do estado: caixa generosa no Y para o recorte por câmera
    g.boundingBox = new THREE.Box3(new THREE.Vector3(bx * BLOCO - 300, -200, bz * BLOCO - 300), new THREE.Vector3((bx + 1) * BLOCO + 300, 1800, (bz + 1) * BLOCO + 300));
    g.boundingSphere = g.boundingBox.getBoundingSphere(new THREE.Sphere());
    return g;
  }
}

/** Níveis de detalhe: 0 planta real completa, 1 caixa simples, 2 só prédios altos (silhueta da cidade ao longe). */
export type Lod = 0 | 1 | 2;

/** Prédios por bloco de 512 m (calculado uma vez por cidade). */
const cacheBlocos = new WeakMap<CidadeReal, Map<string, number[]>>();
function blocosDe(c: CidadeReal): Map<string, number[]> {
  let m = cacheBlocos.get(c);
  if (m) return m;
  m = new Map();
  const P = c.predios;
  for (let i = 0; i < P.length / CAMPOS_PREDIO; i++) {
    const k = `${Math.floor(P[i * CAMPOS_PREDIO] / BLOCO)},${Math.floor(P[i * CAMPOS_PREDIO + 1] / BLOCO)}`;
    (m.get(k) ?? m.set(k, []).get(k)!).push(i);
  }
  cacheBlocos.set(c, m);
  return m;
}

const BRANCO_CASA = new THREE.Color('#8f8a80');

/** Monta a geometria de um bloco no nível de detalhe pedido (null se não sobrar nenhum prédio). */
function montarBloco(c: CidadeReal, chave: string, lod: Lod, sigla: string | undefined): THREE.BufferGeometry | null {
  const lista = blocosDe(c).get(chave);
  if (!lista) return null;
  const A = new Acumulador();
  for (const i of lista) {
    const ap = aparencia(c, i, sigla);
    const { p } = ap;
    if (lod === 2 && p.andares < 4 && p.w * p.d < 1500) continue;
    const anel = lod === 0 ? contorno(c, i) : retangulo(p);
    // casas retangulares de duas águas: paredes e telhado sobre o retângulo orientado
    const usarRet = lod === 0 && ap.duasAguas && anel.length <= 5;
    const pts = usarRet ? retangulo(p) : anel;

    // paredes
    let u = 0;
    for (let k = 0; k < pts.length; k++) {
      const [x0, z0] = pts[k], [x1, z1] = pts[(k + 1) % pts.length];
      const L = Math.hypot(x1 - x0, z1 - z0);
      if (L < 0.05) continue;
      const tx = (x1 - x0) / L, tz = (z1 - z0) / L;
      const nx = -tz, nz = tx;
      const a = A.vert(i, x0, 0, z0, nx, 0, nz, ap.parede, ap.estilo, Parte.Parede, 0, u, 0, ap.tinta);
      const b = A.vert(i, x1, 0, z1, nx, 0, nz, ap.parede, ap.estilo, Parte.Parede, 0, u + L, 0, ap.tinta);
      const cc = A.vert(i, x1, 1, z1, nx, 0, nz, ap.parede, ap.estilo, Parte.Parede, 0, u + L, 0, ap.tinta);
      const d = A.vert(i, x0, 1, z0, nx, 0, nz, ap.parede, ap.estilo, Parte.Parede, 0, u, 0, ap.tinta);
      A.tri(a, b, cc); A.tri(a, cc, d);
      u += L;
    }

    if (usarRet) {
      // telhado de duas águas: cumeeira no eixo mais longo, beiral de 0,4 m
      const c0 = Math.cos(p.angle), s0 = Math.sin(p.angle);
      const ex: [number, number] = [c0, -s0], ez: [number, number] = [s0, c0];
      const longoX = p.w >= p.d;
      const eL = longoX ? ex : ez, eC = longoX ? ez : ex;
      const hl = (longoX ? p.w : p.d) / 2 + 0.4, hc = (longoX ? p.d : p.w) / 2 + 0.4;
      const alt = Math.max(1.2, Math.min(4.5, (hc - 0.4) * 0.42 * ap.inclinacao));
      const P = (l: number, cc: number): [number, number] => [p.x + eL[0] * l + eC[0] * cc, p.z + eL[1] * l + eC[1] * cc];
      const inc = Math.hypot(hc, alt);
      for (const lado of [-1, 1]) {
        // normal da água: para fora (lado·eC) e para cima
        const nh = alt / inc, nv = hc / inc;
        const nx = eC[0] * lado * nh, nz = eC[1] * lado * nh;
        const q = [P(-hl, lado * hc), P(hl, lado * hc), P(hl, 0), P(-hl, 0)];
        const ids = [
          A.vert(i, q[0][0], 1, q[0][1], nx, nv, nz, ap.telhado, 0, Parte.Telhado, -0.25, -hl, 0, ap.corTelhado),
          A.vert(i, q[1][0], 1, q[1][1], nx, nv, nz, ap.telhado, 0, Parte.Telhado, -0.25, hl, 0, ap.corTelhado),
          A.vert(i, q[2][0], 1, q[2][1], nx, nv, nz, ap.telhado, 0, Parte.Telhado, alt, hl, inc, ap.corTelhado),
          A.vert(i, q[3][0], 1, q[3][1], nx, nv, nz, ap.telhado, 0, Parte.Telhado, alt, -hl, inc, ap.corTelhado),
        ];
        A.triVoltado(ids[0], ids[1], ids[2], [nx, nv, nz]);
        A.triVoltado(ids[0], ids[2], ids[3], [nx, nv, nz]);
      }
      // oitões (paredes triangulares nas pontas)
      for (const lado of [-1, 1]) {
        const l = lado * (hl - 0.4);
        const nx = eL[0] * lado, nz = eL[1] * lado;
        const a = P(l, -(hc - 0.4)), b = P(l, hc - 0.4), t = P(l, 0);
        const ids = [
          A.vert(i, a[0], 1, a[1], nx, 0, nz, ap.parede, ap.estilo, Parte.Oitao, 0, 0, 0, ap.tinta),
          A.vert(i, b[0], 1, b[1], nx, 0, nz, ap.parede, ap.estilo, Parte.Oitao, 0, 2 * (hc - 0.4), 0, ap.tinta),
          A.vert(i, t[0], 1, t[1], nx, 0, nz, ap.parede, ap.estilo, Parte.Oitao, alt * (hc - 0.4) / hc, hc - 0.4, 0, ap.tinta),
        ];
        A.triVoltado(ids[0], ids[1], ids[2], [nx, 0, nz]);
      }
    } else {
      // laje: polígono triangulado (no retângulo, dois triângulos)
      const base = pts.map(([x, z]) => A.vert(i, x, 1, z, 0, 1, 0, ap.telhado, ap.estiloTelhado, Parte.Telhado, 0, x, z, ap.corTelhado));
      const tris = pts.length === 4 ? [[0, 1, 2], [0, 2, 3]] : THREE.ShapeUtils.triangulateShape(pts.map(([x, z]) => new THREE.Vector2(x, z)), []);
      for (const [a, b, cc] of tris) A.triVoltado(base[a], base[b], base[cc], [0, 1, 0]);
      // casa de máquinas e reservatório na laje dos prédios
      if (lod === 0 && p.andares > 3 && p.tipo !== 2) caixaNaLaje(A, i, p.x, p.z, p.angle, Math.min(7, p.w * 0.32), Math.min(6, p.d * 0.3), 3.2);
    }
  }
  if (A.n === 0) return null;
  const [bx, bz] = chave.split(',').map(Number);
  return A.geometria(bx, bz);
}

/** Caixa de concreto liso sobre a laje (paredes do anexo + teto), sumindo junto quando o prédio vira obra. */
function caixaNaLaje(A: Acumulador, i: number, cx: number, cz: number, ang: number, w: number, d: number, h: number) {
  const r = retangulo({ x: cx, z: cz, angle: ang, w, d, andares: 0, tipo: 0, aresta: 0, nome: null });
  let u = 0;
  for (let k = 0; k < 4; k++) {
    const [x0, z0] = r[k], [x1, z1] = r[(k + 1) % 4];
    const L = Math.hypot(x1 - x0, z1 - z0), tx = (x1 - x0) / L, tz = (z1 - z0) / L;
    const a = A.vert(i, x0, 1, z0, -tz, 0, tx, CAMADA.Concrete034, Estilo.Liso, Parte.Anexo, 0, u, 0, BRANCO_CASA);
    const b = A.vert(i, x1, 1, z1, -tz, 0, tx, CAMADA.Concrete034, Estilo.Liso, Parte.Anexo, 0, u + L, 0, BRANCO_CASA);
    const c = A.vert(i, x1, 1, z1, -tz, 0, tx, CAMADA.Concrete034, Estilo.Liso, Parte.Anexo, h, u + L, 0, BRANCO_CASA);
    const dd = A.vert(i, x0, 1, z0, -tz, 0, tx, CAMADA.Concrete034, Estilo.Liso, Parte.Anexo, h, u, 0, BRANCO_CASA);
    A.tri(a, b, c); A.tri(a, c, dd);
    u += L;
  }
  const t = r.map(([x, z]) => A.vert(i, x, 1, z, 0, 1, 0, CAMADA.Concrete034, 0, Parte.LajeAnexo, h, x, z, BRANCO_CASA));
  A.triVoltado(t[0], t[1], t[2], [0, 1, 0]); A.triVoltado(t[0], t[2], t[3], [0, 1, 0]);
}

// ── shader ───────────────────────────────────────────────────────────────────────

const VERT_DECL = /* glsl */ `
uniform highp sampler2D tEstado;
attribute vec4 aInfo;
attribute vec2 aUV;
varying vec2 vUVr;
varying vec4 vInfo;
varying vec4 vEst;
varying vec4 vEst2;
varying float vYr;
varying vec3 vTanV;`;

/** posição: base do terreno + altura do estado (y do atributo = 0 base, 1 topo) */
const VERT_POS = /* glsl */ `
int refP = int(aInfo.x + 0.5);
ivec2 pxE = ivec2((refP % ${POR_LINHA}) * 2, refP / ${POR_LINHA});
vec4 e0 = texelFetch(tEstado, pxE, 0);
vec4 e1 = texelFetch(tEstado, pxE + ivec2(1, 0), 0);
int flagsE = int(e0.z + 0.5);
float parteE = floor(aInfo.z / 8.0);
float extraE = aInfo.w;
// telhado inclinado/oitão só nas casas baixas; anexo da laje some durante a obra
if ((parteE == 1.0 || parteE == 2.0) && (flagsE & 4) != 0) extraE = min(extraE, 0.0);
if (parteE >= 3.0 && (flagsE & 2) != 0) extraE = 0.0;
float yE = position.y > 0.5 ? e0.x + extraE : -1.5;
if (e0.x <= 0.0) yE = -80.0;
transformed = vec3(position.x, e0.y + yE, position.z);`;

function criarMaterial(bib: Biblioteca, uniforms: Record<string, THREE.IUniform>): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0, envMapIntensity: 1 });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms, {
      tCor: { value: bib.tCor }, tNor: { value: bib.tNor },
      uEsc: { value: CAMADAS.map((c) => new THREE.Vector2(c.escala[0], c.escala[1])) },
      uTemEmis: { value: bib.temEmis },
    });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>${VERT_DECL}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
${VERT_POS}
float parteV = floor(aInfo.z / 8.0);
vYr = yE;
vUVr = parteV == 1.0 || parteV == 4.0 ? aUV : vec2(aUV.x, yE);
vInfo = aInfo; vEst = e0; vEst2 = e1;
vec3 tW = vec3(normal.z, 0.0, -normal.x);
tW = length(tW) < 0.1 ? vec3(1.0, 0.0, 0.0) : normalize(tW);
vTanV = normalize(normalMatrix * tW);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform highp sampler2DArray tCor;
uniform highp sampler2DArray tNor;
uniform vec2 uEsc[${CAMADAS.length}];
uniform float uTemEmis[${CAMADAS.length}];
uniform float uNoite, uTempo, uCamada;
uniform vec3 uCeu;
varying vec2 vUVr;
varying vec4 vInfo;
varying vec4 vEst;
varying vec4 vEst2;
varying float vYr;
varying vec3 vTanV;
float hashR(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
int camR = int(vInfo.y + 0.5);
float estiloR = mod(vInfo.z, 8.0);
float parteR = floor(vInfo.z / 8.0);
int flagsR = int(vEst.z + 0.5);
bool abandR = (flagsR & 1) != 0;
bool obraR = (flagsR & 2) != 0;
float sementeR = vEst.w;
float alturaR = vEst.x;
vec2 uvR = vUVr / uEsc[camR];
vec4 tcR = texture(tCor, vec3(uvR, float(camR)));
vec4 tnR = texture(tNor, vec3(uvR, float(camR)));
float janelaR = 0.0, acesaR = 0.0, rugR = tcR.a;
bool paredeR = parteR != 1.0 && parteR != 4.0;
if (camR < 8 && paredeR) {
  // fachada fotográfica
  diffuseColor.rgb = tcR.rgb * mix(vec3(1.0), diffuseColor.rgb, 0.15);
  janelaR = uTemEmis[camR] > 0.5 ? smoothstep(0.03, 0.2, tnR.a) : smoothstep(0.45, 0.2, tcR.a);
  vec2 celR = floor(vec2(vUVr.x / 3.2, vYr / 3.0));
  float hR = hashR(vec3(celR, sementeR * 97.0));
  float rodR = floor(uTempo / 40.0 + sementeR * 7.0);
  float h2R = hashR(vec3(celR.x + rodR, celR.y, sementeR * 13.0));
  // com mapa de emissão: andares inteiros (trechos de 9 m) acendem juntos, como escritórios
  float hAndarR = hashR(vec3(floor(vYr / 3.0), floor(vUVr.x / 9.0), sementeR * 31.0));
  acesaR = uTemEmis[camR] > 0.5 ? tnR.a * 0.65 * step(hAndarR, 0.35 + 0.3 * h2R) : janelaR * step(hR, 0.3 + 0.25 * h2R);
  // platibanda no topo
  float platR = step(alturaR - 0.7, vYr);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.62, 0.6, 0.57) * (0.9 + 0.1 * tcR.g), platR);
  janelaR *= 1.0 - platR; acesaR *= 1.0 - platR;
} else if (paredeR) {
  // reboco pintado: textura clara tingida pela cor da paleta regional + janelas desenhadas
  diffuseColor.rgb *= tcR.rgb * 1.18;
  float peR = estiloR == 3.0 ? 6.0 : (estiloR == 0.0 ? 3.0 : 2.9);
  float andarR = floor(vYr / peR);
  float fyR = fract(vYr / peR);
  // sujeira: base encardida pela chuva e escorridos verticais
  diffuseColor.rgb *= 0.74 + 0.26 * smoothstep(0.0, 2.2, vYr);
  float escR = hashR(vec3(floor(vUVr.x * 1.7), 5.0, sementeR));
  diffuseColor.rgb *= 1.0 - 0.07 * step(0.72, escR) * smoothstep(alturaR, alturaR * 0.4, vYr);
  vec3 paredeBaseR = diffuseColor.rgb;
  // antisserrilhado: de longe (pixel > ~0,8 m) as janelas viram a média da fachada
  float aaR = clamp(1.6 - (fwidth(vUVr.x) + fwidth(vYr)) * 1.4, 0.0, 1.0);
  if (estiloR < 2.5) {
    // vão de 3,2 m (casa 3,8 m) com janela de 1,4 m × 1,25 m e peitoril
    float espR = estiloR == 0.0 ? 3.8 : 3.2;
    float colR = floor(vUVr.x / espR + 0.5);
    float fxR = fract(vUVr.x / espR + 0.5);
    float meiaR = (estiloR == 0.0 ? 0.65 : 0.7) / espR;
    float y0R = 0.32, y1R = 0.75;
    float dentroR = step(abs(fxR - 0.5), meiaR) * step(y0R, fyR) * step(fyR, y1R) * step(vYr, alturaR - 0.7);
    // esquadria de alumínio: moldura e montante central
    float bxR = (meiaR - abs(fxR - 0.5)) * espR, byR = min(fyR - y0R, y1R - fyR) * peR;
    float caixilhoR = dentroR * max(step(min(bxR, byR), 0.06), step(abs(fxR - 0.5) * espR, 0.025));
    janelaR = dentroR * (1.0 - caixilhoR);
    // peitoril saliente: faixa clara com sombra embaixo
    float peitR = step(abs(fxR - 0.5), meiaR + 0.06 / espR) * step(y0R - 0.035, fyR) * step(fyR, y0R) * step(vYr, alturaR - 0.7);
    float sombraR = step(abs(fxR - 0.5), meiaR + 0.06 / espR) * step(y0R - 0.09, fyR) * step(fyR, y0R - 0.035) * step(vYr, alturaR - 0.7);
    if (estiloR == 0.0 && andarR < 0.5) {
      // porta da casa no meio de cada trecho de 7,6 m
      float pxR = abs(fract(vUVr.x / 7.6) - 0.5) * 7.6;
      float portaR = step(pxR, 0.5) * step(fyR, 0.74);
      janelaR *= step(1.2, pxR); caixilhoR *= step(1.2, pxR);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.3, 0.2, 0.12) * (0.85 + 0.15 * step(0.5, fract(vUVr.x * 8.0))), portaR);
    }
    if (estiloR == 2.0 && andarR < 0.5) {
      // vitrine ou porta de enrolar no térreo
      float vitR = step(0.04, fyR) * step(fyR, 0.82) * step(abs(fract(vUVr.x / 5.0 + 0.5) - 0.5), 0.45);
      janelaR = vitR; caixilhoR = 0.0; peitR = 0.0; sombraR = 0.0;
      float enrolarR = vitR * step(0.62, hashR(vec3(floor(vUVr.x / 5.0), 3.0, sementeR)));
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.5, 0.52, 0.55) * (0.8 + 0.2 * step(0.5, fract(vYr * 7.0))), enrolarR);
      janelaR *= 1.0 - enrolarR;
    }
    if (estiloR == 1.0) diffuseColor.rgb *= mix(0.86, 1.0, step(0.07, fyR));
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93), peitR * 0.8);
    diffuseColor.rgb *= 1.0 - 0.35 * sombraR;
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.78, 0.8, 0.82), caixilhoR);
    float hR = hashR(vec3(colR, andarR, sementeR * 97.0));
    // por dentro do vidro: escuro, cortina clara ou persiana fechada
    float persR = step(0.78, hR) * janelaR;
    vec3 interiorR = mix(vec3(0.025, 0.03, 0.035), vec3(0.42, 0.38, 0.32), step(0.55, hR) * (1.0 - step(0.78, hR)) * 0.45);
    diffuseColor.rgb = mix(diffuseColor.rgb, interiorR, janelaR * (1.0 - persR));
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.72, 0.72, 0.7) * (0.82 + 0.18 * step(0.5, fract(vYr * 14.0))), persR);
    janelaR *= 1.0 - persR;
    float h2R = hashR(vec3(colR + floor(uTempo / 35.0 + sementeR * 7.0), andarR, sementeR * 13.0));
    acesaR = step(hashR(vec3(colR, andarR, sementeR * 41.0)), 0.24 + 0.22 * h2R) * janelaR;
    if (estiloR == 2.0 && andarR < 0.5) acesaR = janelaR;
    // média vista de longe: ~18% da fachada é vidro escuro, ~1/3 dele aceso à noite
    float vidroMedR = estiloR == 0.0 ? 0.12 : 0.18;
    diffuseColor.rgb = mix(mix(paredeBaseR, vec3(0.04, 0.045, 0.05), vidroMedR), diffuseColor.rgb, aaR);
    acesaR = mix(vidroMedR * 0.33 * step(vYr, alturaR - 0.7), acesaR, aaR);
    janelaR *= aaR;
  } else if (estiloR < 3.5) {
    // galpão: chapa ondulada e faixa de janelas altas
    diffuseColor.rgb *= 0.88 + 0.12 * step(0.5, fract(vUVr.x * 1.3));
    janelaR = step(alturaR * 0.72, vYr) * step(vYr, alturaR * 0.88) * step(0.15, fract(vUVr.x / 3.0));
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.1, 0.12, 0.13), janelaR * 0.85);
    acesaR = janelaR * step(0.4, hashR(vec3(floor(vUVr.x / 3.0), 1.0, sementeR))) * 0.6;
  }
} else {
  // telhado / laje (manchas de umidade nas lajes)
  float manchaR = hashR(vec3(floor(vUVr * 0.35), sementeR));
  diffuseColor.rgb *= tcR.rgb * (camR >= 11 && camR <= 13 ? 1.0 : 0.82 - 0.1 * step(0.6, manchaR));
  if (estiloR == 3.0) {
    // galpão: telha metálica ondulada (onda de 0,75 m) com emendas a cada 6 m
    diffuseColor.rgb *= 0.82 + 0.18 * (0.5 + 0.5 * sin(vUVr.x * 8.38)) - 0.12 * step(0.97, fract(vUVr.y / 6.0));
    rugR = 0.42;
  }
}
if (obraR) {
  float gxR = step(0.86, fract(vUVr.x / 2.2));
  float gyR = step(0.84, fract(vYr / 2.9));
  vec3 concR = vec3(0.58, 0.56, 0.52) * (0.8 + 0.3 * tcR.g);
  diffuseColor.rgb = paredeR ? mix(concR, vec3(0.95, 0.42, 0.1), max(gxR, gyR) * 0.85) : concR * 0.8;
  janelaR = 0.0; acesaR = 0.0;
}
if (abandR) { diffuseColor.rgb *= vec3(0.55, 0.52, 0.48); acesaR = 0.0; }
if (uCamada > 0.5) { diffuseColor.rgb = vEst2.rgb * (0.85 + 0.15 * tcR.g); janelaR = 0.0; acesaR = 0.0; }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = camR < 8 && paredeR ? rugR : mix(rugR, 0.05, janelaR);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
{
  vec3 nmR = tnR.xyz * 2.0 - 1.0;
  nmR = normalize(mix(nmR, vec3(0.0, 0.0, 1.0), max(janelaR * step(7.5, float(camR)), uCamada)));
  vec3 tR = normalize(vTanV - dot(vTanV, normal) * normal);
  vec3 bR = cross(normal, tR);
  normal = normalize(tR * nmR.x + bR * nmR.y + normal * nmR.z);
}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
if (uCamada < 0.5) {
  vec3 quenteR = mix(vec3(1.0, 0.72, 0.42), vec3(0.85, 0.9, 1.0), step(0.7, fract(sementeR * 31.0)));
  totalEmissiveRadiance += acesaR * uNoite * quenteR * 1.6;
  vec3 vdirR = normalize(vViewPosition);
  float fresR = pow(1.0 - abs(dot(normal, vdirR)), 4.0);
  totalEmissiveRadiance += janelaR * uCeu * 0.18 * fresR * (1.0 - uNoite);
} else {
  totalEmissiveRadiance += diffuseColor.rgb * 0.25;
}`);
  };
  return m;
}

function criarMaterialSombra(uniforms: Record<string, THREE.IUniform>): THREE.MeshDepthMaterial {
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>${VERT_DECL}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
${VERT_POS}`);
  };
  return m;
}

// ── componente ───────────────────────────────────────────────────────────────────

export function PrediosReais() {
  const wv = useGame((s) => s.worldVersion);
  // 150 mil prédios: a textura de estado é refeita no máximo a cada 0,7 s
  const sv = useVersaoLenta(useGame((s) => s.stateVersion), 700);
  const camera = useThree((s) => s.camera);
  const grupo = useRef<THREE.Group>(null);
  const blocos = useRef(new Map<string, { lod: Lod; mesh: THREE.Mesh | null }>());
  const fila = useRef<{ chave: string; lod: Lod; d: number }[]>([]);
  const ultimaAvaliacao = useRef(-1e9);
  const camada = useGame((s) => s.camada);
  const daltonico = useApp((s) => s.daltonico);
  const nivel = useNivel();
  const [bib, setBib] = useState<Biblioteca | null>(null);
  const real = mundo.real;

  useEffect(() => {
    if (!real) return;
    let vivo = true;
    carregarBiblioteca(nivel === 'alta' ? 1024 : 512).then((b) => { if (vivo) setBib(b); }).catch(() => { /* sem texturas: Edificios desenha caixas */ });
    return () => { vivo = false; };
  }, [real, nivel]);


  const nPredios = real ? real.predios.length / CAMPOS_PREDIO : 0;
  const estado = useMemo(() => {
    const linhas = Math.max(1, Math.ceil(nPredios / POR_LINHA));
    const t = new THREE.DataTexture(new Float32Array(POR_LINHA * 2 * linhas * 4), POR_LINHA * 2, linhas, THREE.RGBAFormat, THREE.FloatType);
    t.minFilter = t.magFilter = THREE.NearestFilter;
    t.needsUpdate = true;
    return t;
  }, [nPredios]);
  useEffect(() => () => estado.dispose(), [estado]);

  const uniforms = useMemo(() => ({ tEstado: { value: estado }, uNoite: { value: 0 }, uTempo: { value: 0 }, uCeu: { value: new THREE.Color() }, uCamada: { value: 0 } }), [estado]);
  const mat = useMemo(() => (bib ? criarMaterial(bib, uniforms) : null), [bib, uniforms]);
  const matSombra = useMemo(() => criarMaterialSombra(uniforms), [uniforms]);
  useEffect(() => () => { mat?.dispose(); matSombra.dispose(); }, [mat, matSombra]);

  useEffect(() => {
    usePrediosReais.setState({ pronto: !!(real && mat) });
    return () => usePrediosReais.setState({ pronto: false });
  }, [real, mat]);

  // estado por prédio: [altura, cota, flags, semente] [r, g, b, 0]
  useLayoutEffect(() => {
    if (!real) return;
    const d = estado.image.data as Float32Array;
    d.fill(0);
    const L = mundo.lots, S = mundo.lotState;
    const n = Math.min(L.length / LOT_STRIDE, S.length / LOT_STATE_STRIDE);
    const ativa = !CAMADAS_NEUTRAS.includes(camada);
    uniforms.uCamada.value = ativa ? 1 : 0;
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const lo = i * LOT_STRIDE;
      const ref = L[lo + 7] - 1;
      if (ref < 0 || ref >= nPredios) continue;
      const o = i * LOT_STATE_STRIDE;
      const archId = S[o + 1];
      if (!archId) continue;
      const a = arquetipoPorId(archId);
      const prog = S[o + 2], andares = Math.max(1, S[o + 3]), look = S[o + 4], flags = S[o + 5];
      const H = andares * a.peDireito + (a.estilo === 'galpao' ? 0 : 0.8);
      const obra = prog < 1;
      const k = ((ref / POR_LINHA) | 0) * POR_LINHA * 2 * 4 + (ref % POR_LINHA) * 2 * 4;
      d[k] = obra ? Math.max(1.2, H * Math.min(1, prog * 1.15)) : H;
      d[k + 1] = L[lo + 5];
      d[k + 2] = (flags & FLAG.ABANDONADO ? 1 : 0) | (obra ? 2 : 0) | (obra || andares > 3 ? 4 : 0);
      d[k + 3] = look;
      if (ativa) {
        if (!corCamada(camada, S, o, c, daltonico)) c.set('#9aa3a8');
        d[k + 4] = c.r; d[k + 5] = c.g; d[k + 6] = c.b;
      }
    }
    estado.needsUpdate = true;
  }, [real, estado, sv, wv, camada, daltonico, nPredios, uniforms]);

  // troca de cidade ou de material: descarta os blocos montados
  useEffect(() => {
    const mapa = blocos.current, g = grupo.current;
    return () => {
      for (const b of mapa.values()) if (b.mesh) { g?.remove(b.mesh); b.mesh.geometry.dispose(); }
      mapa.clear();
      fila.current = [];
      ultimaAvaliacao.current = -1e9;
    };
  }, [real, mat, matSombra]);

  useFrame((_, dt) => {
    uniforms.uNoite.value = ambiente.noite * (1 - clima.apagao);
    uniforms.uTempo.value += dt;
    uniforms.uCeu.value.copy(ambiente.corCeu);
    const g = grupo.current;
    if (!real || !mat || !g) return;

    // a cada 0,4 s: que nível de detalhe cada bloco deve ter, pela distância até a câmera
    const agora = performance.now();
    if (agora - ultimaAvaliacao.current > 400) {
      ultimaAvaliacao.current = agora;
      const { x: cx, y: cy, z: cz } = camera.position;
      const desejado = new Map<string, { lod: Lod; d: number }>();
      for (const chave of blocosDe(real).keys()) {
        const sep = chave.indexOf(',');
        const bx = Number(chave.slice(0, sep)), bz = Number(chave.slice(sep + 1));
        const d = Math.hypot((bx + 0.5) * BLOCO - cx, (bz + 0.5) * BLOCO - cz, Math.max(0, cy) * 0.6);
        const lod = d < DIST_LOD[0] ? 0 : d < DIST_LOD[1] ? 1 : d < DIST_LOD[2] ? 2 : -1;
        if (lod >= 0) desejado.set(chave, { lod: lod as Lod, d });
      }
      for (const [chave, b] of blocos.current) {
        if (desejado.has(chave)) continue;
        if (b.mesh) { g.remove(b.mesh); b.mesh.geometry.dispose(); }
        blocos.current.delete(chave);
      }
      fila.current = [...desejado].filter(([k, v]) => blocos.current.get(k)?.lod !== v.lod).map(([chave, v]) => ({ chave, ...v })).sort((a, b) => a.d - b.d);
    }

    // monta os blocos pendentes, do mais perto para o mais longe, uns 6 ms por quadro
    const t0 = performance.now();
    while (fila.current.length && performance.now() - t0 < 6) {
      const { chave, lod } = fila.current.shift()!;
      const geo = medir(`prédios: bloco ${chave} lod ${lod}`, () => montarBloco(real, chave, lod, mundo.init?.sigla), 30);
      const velho = blocos.current.get(chave);
      if (velho?.mesh) { g.remove(velho.mesh); velho.mesh.geometry.dispose(); }
      let mesh: THREE.Mesh | null = null;
      if (geo) {
        mesh = new THREE.Mesh(geo, mat);
        mesh.customDepthMaterial = matSombra;
        mesh.castShadow = lod < 2;
        mesh.receiveShadow = true;
        mesh.matrixAutoUpdate = false;
        g.add(mesh);
      }
      blocos.current.set(chave, { lod, mesh });
    }
  });

  if (!real || !mat) return null;
  return <group ref={grupo} />;
}
