/**
 * Pedestres nas calçadas (LOD visual): pessoas low-poly instanciadas (~146 triângulos) andando nos
 * dois sentidos, só perto do ponto que a câmera olha. Passada de pernas/braços e balanço do corpo
 * no vertex shader (sem esqueleto); na chuva, parte do povo abre o guarda-chuva. Nas pontas da
 * calçada atravessam em linha reta para o próximo trecho (às vezes cruzando a rua).
 * A quantidade acompanha a população simulada, a hora do dia e a chuva, com teto fixo.
 */
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { Rng } from '../../sim/core/rng';
import { mundo, useGame } from '../../sim/bridge';
import { ROAD_SPECS } from '../../world/roads';
import { acessibilidade } from '../acessibilidade';
import { ambiente } from './ambiente';
import { alvoCamera } from './Camera';
import { clima } from './climaVisual';
import { amostrarPerfil, type Perfil } from './perfilVias';
import { mergeGeos, perfisAtuais } from './Vias';

const MAX = 1500;
/** altura do topo da calçada sobre o perfil do leito (igual à malha das vias) */
export const ALTURA_CALCADA = 0.17;
/** acima desta distância câmera→alvo as pessoas viram poeira: nem simula */
const DIST_MAX = 950;
/** habitantes por pedestre visível no pico */
const HAB_POR_PEDESTRE = 18;

// ── funções puras (testadas) ────────────────────────────────────────────────

const HORARIO: [number, number][] = [[0, 0.06], [5, 0.08], [7, 0.85], [8, 1], [10, 0.7], [12.5, 0.9], [15, 0.7], [18, 1], [20, 0.45], [22, 0.18], [24, 0.06]];

/** Fração do povo na rua por hora (0–24): picos de manhã e fim de tarde, quase ninguém de madrugada. */
export function fatorHorario(hora: number): number {
  const h = ((hora % 24) + 24) % 24;
  for (let i = 1; i < HORARIO.length; i++) {
    const [h1, f1] = HORARIO[i];
    if (h <= h1) {
      const [h0, f0] = HORARIO[i - 1];
      return f0 + (f1 - f0) * ((h - h0) / (h1 - h0));
    }
  }
  return HORARIO[0][1];
}

/** Trecho caminhável da calçada (s em metros), sem a área do cruzamento; null se curto demais. */
export function trechoCaminhavel(pf: Perfil): [number, number] | null {
  const ini = pf.cortaA + 0.5, fim = pf.comprimento - pf.cortaB - 0.5;
  return fim - ini > 1 ? [ini, fim] : null;
}

/**
 * Ponto na calçada: `lado` (±1) segue a normal do perfil (−tz, tx); `frac` (0–1) vai do meio-fio
 * à borda externa da calçada. Devolve também a tangente do trecho.
 */
export function pontoCalcada(pf: Perfil, s: number, lado: 1 | -1, frac: number, out: { x: number; y: number; z: number; tx: number; tz: number }) {
  amostrarPerfil(pf, s, out);
  const spec = ROAD_SPECS[pf.edge.type];
  const d = lado * (spec.width / 2 + spec.sidewalk * frac);
  out.x += -out.tz * d;
  out.z += out.tx * d;
  out.y += ALTURA_CALCADA;
  return out;
}

// ── geometria ───────────────────────────────────────────────────────────────

/** partes animadas (aParte) */
const P = { fixo: 0, pernaE: 1, pernaD: 2, bracoE: 3, bracoD: 4, guardaChuva: 5 } as const;
/** fonte da cor (aCor) */
const C = { pele: 0, camisa: 1, calca: 2, cabelo: 3, sapato: 4, lona: 5, cabo: 6 } as const;

interface ParteP { g: THREE.BufferGeometry; parte: number; cor: number | ((x: number, y: number, z: number) => number) }

function geoPessoa(): THREE.BufferGeometry {
  const caixa = (w: number, h: number, d: number, x: number, y: number, z: number) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
  const partes: ParteP[] = [
    // cabeça facetada: faces de cima/de trás viram cabelo (cor por face, sem degradê)
    { g: new THREE.IcosahedronGeometry(0.115, 0).translate(0, 1.6, 0), parte: P.fixo, cor: C.pele },
    { g: new THREE.CylinderGeometry(0.16, 0.13, 0.52, 6).scale(1, 1, 0.62).translate(0, 1.2, 0), parte: P.fixo, cor: C.camisa },
    { g: caixa(0.3, 0.14, 0.19, 0, 0.93, 0), parte: P.fixo, cor: C.calca },
    { g: caixa(0.12, 0.84, 0.14, 0.08, 0.5, 0), parte: P.pernaE, cor: C.calca },
    { g: caixa(0.12, 0.84, 0.14, -0.08, 0.5, 0), parte: P.pernaD, cor: C.calca },
    { g: caixa(0.12, 0.08, 0.22, 0.08, 0.04, 0.04), parte: P.pernaE, cor: C.sapato },
    { g: caixa(0.12, 0.08, 0.22, -0.08, 0.04, 0.04), parte: P.pernaD, cor: C.sapato },
    // braços: manga em cima, pele embaixo (degradê pelo vértice)
    { g: caixa(0.085, 0.6, 0.1, -0.215, 1.13, 0), parte: P.bracoE, cor: (_x, y) => (y > 1.2 ? C.camisa : C.pele) },
    { g: caixa(0.085, 0.6, 0.1, 0.215, 1.13, 0), parte: P.bracoD, cor: (_x, y) => (y > 1.2 ? C.camisa : C.pele) },
    // guarda-chuva (some quando não chove): lona aberta acima da cabeça e cabo até a mão
    { g: new THREE.ConeGeometry(0.62, 0.28, 6, 1, true).translate(0.2, 2.05, 0.4), parte: P.guardaChuva, cor: C.lona },
    { g: caixa(0.025, 0.95, 0.025, 0.2, 1.55, 0.46), parte: P.guardaChuva, cor: C.cabo },
  ];
  // cabeça não indexada, cor decidida pelo centro de cada face
  const cabeca = partes[0].g.index ? partes[0].g.toNonIndexed() : partes[0].g;
  partes[0] = { ...partes[0], g: cabeca };
  const geo = mergeGeos(partes.map((p) => p.g));
  const n = geo.getAttribute('position').count;
  const aParte = new Float32Array(n), aCor = new Float32Array(n);
  let k = 0;
  for (const [ip, p] of partes.entries()) {
    const pos = p.g.getAttribute('position');
    for (let i = 0; i < pos.count; i++, k++) {
      aParte[k] = p.parte;
      if (ip === 0) {
        const f = i - (i % 3);
        const cy = (pos.getY(f) + pos.getY(f + 1) + pos.getY(f + 2)) / 3;
        const cz = (pos.getZ(f) + pos.getZ(f + 1) + pos.getZ(f + 2)) / 3;
        aCor[k] = cy > 1.63 || (cz < -0.04 && cy > 1.56) ? C.cabelo : C.pele;
      } else aCor[k] = typeof p.cor === 'number' ? p.cor : p.cor(pos.getX(i), pos.getY(i), pos.getZ(i));
    }
    p.g.dispose();
  }
  geo.setAttribute('aParte', new THREE.BufferAttribute(aParte, 1));
  geo.setAttribute('aCor', new THREE.BufferAttribute(aCor, 1));
  geo.setAttribute('iCalca', new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3));
  geo.setAttribute('iAnim', new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4));
  geo.computeBoundingSphere();
  return geo;
}

/** Lambert com passada no vertex shader. iAnim = (fase, ritmo rad/s, tom de pele 0–1, guarda-chuva 0/1). */
function materialPessoa(u: { uTempo: { value: number }; uAmp: { value: number } }) {
  const m = new THREE.MeshLambertMaterial();
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTempo = u.uTempo;
    sh.uniforms.uAmp = u.uAmp;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float aParte;
        attribute float aCor;
        attribute vec3 iCalca;
        attribute vec4 iAnim;
        uniform float uTempo;
        uniform float uAmp;
        float angParte() {
          float sw = sin(iAnim.x + uTempo * iAnim.y) * uAmp;
          if (aParte < 0.5 || aParte > 4.5) return 0.0;
          if (aParte < 1.5) return sw * 0.5;
          if (aParte < 2.5) return -sw * 0.5;
          if (aParte < 3.5) return -sw * 0.45;
          return iAnim.w > 0.5 ? -1.0 : sw * 0.45;
        }
        mat3 rotX(float a) { float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }`)
      .replace('#include <color_vertex>', `
        {
          vec3 pele = mix(vec3(0.85, 0.55, 0.38), vec3(0.12, 0.055, 0.03), iAnim.z);
          vec3 c = pele;
          #ifdef USE_INSTANCING_COLOR
            vec3 camisa = instanceColor.rgb;
          #else
            vec3 camisa = vec3(0.8);
          #endif
          if (aCor > 0.5 && aCor < 1.5) c = camisa;
          else if (aCor > 1.5 && aCor < 2.5) c = iCalca;
          else if (aCor > 2.5 && aCor < 3.5) c = mix(vec3(0.01, 0.008, 0.006), vec3(0.09, 0.045, 0.02), fract(iAnim.x * 0.37));
          else if (aCor > 3.5 && aCor < 4.5) c = vec3(0.02);
          else if (aCor > 4.5 && aCor < 5.5) c = fract(iAnim.x * 0.71) > 0.5 ? vec3(0.015) : camisa * 0.8;
          else if (aCor > 5.5) c = vec3(0.03);
          vColor = vec4(c, 1.0);
        }`)
      .replace('#include <beginnormal_vertex>', `
        vec3 objectNormal = rotX(angParte()) * vec3(normal);`)
      .replace('#include <begin_vertex>', `
        vec3 transformed = vec3(position);
        {
          float ang = angParte();
          float piv = aParte < 2.5 ? 0.92 : 1.42;
          transformed.y -= piv;
          transformed = rotX(ang) * transformed;
          transformed.y += piv;
          // sobe e desce duas vezes por ciclo de passada
          transformed.y += abs(cos(iAnim.x + uTempo * iAnim.y)) * 0.035 * uAmp * step(0.01, iAnim.y);
          if (aParte > 4.5 && iAnim.w < 0.5) transformed = vec3(0.0);
        }`);
  };
  m.customProgramCacheKey = () => 'pedestre-passada';
  return m;
}

// ── simulação visual ─────────────────────────────────────────────────────────

const CAMISAS = ['#e8e8e8', '#2b4c8c', '#c0392b', '#f2c418', '#2e8b57', '#1b1b1e', '#f08a24', '#7d3c98', '#87ceeb', '#ff6f91', '#f5f5dc', '#3a3a3a', '#009c3b', '#ffdf00', '#ffffff', '#5d6d7e'].map((c) => new THREE.Color(c));
const CALCAS = ['#1f2d4a', '#2a3b5c', '#1b1b1e', '#5a5f63', '#c2b280', '#f2f2ee', '#3d2b1f', '#2a3b5c', '#1f2d4a'].map((c) => new THREE.Color(c));

interface Pedestre {
  ativo: boolean;
  edge: number; s: number; dir: 1 | -1; lado: 1 | -1; frac: number; v: number;
  /** travessia em linha reta (esquina ou rua) até o próximo trecho */
  cruzando: boolean; t: number; dist: number;
  x0: number; y0: number; z0: number; x1: number; y1: number; z1: number;
  pe: number; ps: number; pdir: 1 | -1; plado: 1 | -1;
  // aparência
  fase: number; pele: number; escala: number; camisa: number; calca: number; limiarChuva: number;
}

const novoPedestre = (): Pedestre => ({
  ativo: false, edge: 0, s: 0, dir: 1, lado: 1, frac: 0.5, v: 1.3,
  cruzando: false, t: 0, dist: 0, x0: 0, y0: 0, z0: 0, x1: 0, y1: 0, z1: 0, pe: 0, ps: 0, pdir: 1, plado: 1,
  fase: 0, pele: 0, escala: 1, camisa: 0, calca: 0, limiarChuva: 1,
});

type Ponto = { x: number; y: number; z: number; tx: number; tz: number };
const ponto = (): Ponto => ({ x: 0, y: 0, z: 0, tx: 0, tz: 1 });

export function Pedestres() {
  const wv = useGame((s) => s.worldVersion);
  const camera = useThree((s) => s.camera);

  const rec = useMemo(() => {
    const uniforms = { uTempo: { value: 0 }, uAmp: { value: 1 } };
    const geo = geoPessoa();
    const mat = materialPessoa(uniforms);
    const mesh = new THREE.InstancedMesh(geo, mat, MAX);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.receiveShadow = true;
    mesh.count = 0;
    return { uniforms, geo, mat, mesh };
  }, []);
  useEffect(() => () => { rec.geo.dispose(); rec.mat.dispose(); rec.mesh.dispose(); }, [rec]);

  const adj = useMemo(() => {
    const m = new Map<number, number[]>();
    for (const e of mundo.roads.edges.values()) {
      (m.get(e.a) ?? m.set(e.a, []).get(e.a)!).push(e.id);
      (m.get(e.b) ?? m.set(e.b, []).get(e.b)!).push(e.id);
    }
    return m;
  }, [wv]);

  const E = useMemo(() => ({
    rng: new Rng(4242),
    lista: [] as Pedestre[],
    // trechos perto do alvo da câmera, sorteados pelo comprimento caminhável
    cand: { ids: [] as number[], acum: [] as number[], total: 0 },
    relogio: 0, ultimaBusca: -1, perfis: null as Map<number, Perfil> | null, cx: 0, cz: 0, R: 0,
    a: ponto(), b1: ponto(), b2: ponto(),
  }), []);

  useEffect(() => {
    // trechos mudaram: quem estava num trecho que sumiu renasce
    for (const p of E.lista) if (!mundo.roads.edges.has(p.edge) || (p.cruzando && !mundo.roads.edges.has(p.pe))) p.ativo = false;
  }, [wv, E]);

  useFrame((_, dtReal) => {
    const { mesh, uniforms } = rec;
    const g = useGame.getState();
    const dt = Math.min(0.05, dtReal) * (g.velocidade > 0 ? 1 : 0);
    uniforms.uTempo.value += dt;
    uniforms.uAmp.value = acessibilidade.reduzirMovimento ? 0.35 : 1;
    E.relogio += dtReal;

    const alvoCam = alvoCamera();
    const dist = camera.position.distanceTo(alvoCam);
    const pop = g.stats?.populacao ?? 0;
    if (dist > DIST_MAX || pop <= 0 || perfisAtuais.size === 0) { mesh.count = 0; return; }
    const R = Math.min(380, Math.max(120, dist * 0.8));
    const cx = alvoCam.x, cz = alvoCam.z;

    // trechos candidatos perto do alvo (2×/s ou quando a malha muda)
    if (E.relogio - E.ultimaBusca > 0.5 || E.perfis !== perfisAtuais) {
      E.ultimaBusca = E.relogio; E.perfis = perfisAtuais; E.cx = cx; E.cz = cz; E.R = R;
      const ids: number[] = [], acum: number[] = [];
      let tot = 0;
      for (const pf of perfisAtuais.values()) {
        const tr = trechoCaminhavel(pf);
        if (!tr) continue;
        const mid = pf.n >> 1;
        const dx = pf.x[mid] - cx, dz = pf.z[mid] - cz, lim = R + pf.comprimento / 2;
        if (dx * dx + dz * dz > lim * lim) continue;
        tot += tr[1] - tr[0];
        ids.push(pf.edge.id); acum.push(tot);
      }
      E.cand = { ids, acum, total: tot };
    }

    const chuva = clima.chuva;
    const alvo = Math.min(MAX, Math.round((pop / HAB_POR_PEDESTRE) * fatorHorario(ambiente.hora) * (1 - 0.35 * chuva)), Math.floor(E.cand.total / 3));
    const lista = E.lista;
    // nasce/some aos poucos
    for (let k = 0; k < 40 && lista.length < alvo; k++) lista.push(novoPedestre());
    if (lista.length > alvo) lista.length = Math.max(alvo, lista.length - 40);

    const rng = E.rng;
    const { a, b1, b2 } = E;
    const R2 = (R * 1.2) * (R * 1.2);

    const nascer = (p: Pedestre): boolean => {
      const cd = E.cand;
      if (cd.total <= 0) return false;
      for (let tentativa = 0; tentativa < 3; tentativa++) {
        const r = rng.next() * cd.total;
        let lo = 0, hi = cd.acum.length - 1;
        while (lo < hi) { const m = (lo + hi) >> 1; if (cd.acum[m] < r) lo = m + 1; else hi = m; }
        const pf = perfisAtuais.get(cd.ids[lo]);
        const tr = pf && trechoCaminhavel(pf);
        if (!pf || !tr) continue;
        p.edge = pf.edge.id;
        p.s = rng.range(tr[0], tr[1]);
        p.lado = rng.chance(0.5) ? 1 : -1;
        p.frac = rng.range(0.25, 0.8);
        pontoCalcada(pf, p.s, p.lado, p.frac, a);
        if ((a.x - cx) ** 2 + (a.z - cz) ** 2 > R * R) continue;
        p.dir = rng.chance(0.5) ? 1 : -1;
        const crianca = rng.chance(0.08);
        p.escala = crianca ? rng.range(0.62, 0.75) : rng.range(0.92, 1.08);
        p.v = rng.range(1.0, 1.6) * (crianca ? 0.9 : 1);
        p.fase = rng.range(0, 100);
        p.pele = rng.next();
        p.camisa = rng.int(0, CAMISAS.length - 1);
        p.calca = rng.int(0, CALCAS.length - 1);
        p.limiarChuva = rng.next();
        p.cruzando = false;
        p.ativo = true;
        return true;
      }
      return false;
    };

    /** Começa a travessia reta de `a` até `b`, assumindo o trecho `edge` ao chegar. */
    const travessia = (p: Pedestre, b: Ponto, edge: number, s: number, dir: 1 | -1, lado: 1 | -1) => {
      p.x0 = a.x; p.y0 = a.y; p.z0 = a.z; p.x1 = b.x; p.y1 = b.y; p.z1 = b.z;
      p.dist = Math.hypot(b.x - a.x, b.z - a.z); p.t = 0;
      p.pe = edge; p.ps = s; p.pdir = dir; p.plado = lado;
      p.cruzando = p.dist > 0.05;
      if (!p.cruzando) { p.edge = edge; p.s = s; p.dir = dir; p.lado = lado; }
    };

    /** Chegou à ponta da calçada: segue para outro trecho do nó (ou volta, às vezes cruzando a rua). */
    const fimDaCalcada = (p: Pedestre, pf: Perfil, tr: [number, number]) => {
      const naA = p.s < tr[0];
      p.s = naA ? tr[0] : tr[1];
      pontoCalcada(pf, p.s, p.lado, p.frac, a);
      const no = naA ? pf.edge.a : pf.edge.b;
      const op = (adj.get(no) ?? []).filter((id) => id !== p.edge && perfisAtuais.has(id));
      const prox = op.length ? op[rng.int(0, op.length - 1)] : -1;
      const np = prox >= 0 ? perfisAtuais.get(prox) : undefined;
      const tr2 = np && trechoCaminhavel(np);
      if (!np || !tr2) {
        // rua sem saída: dá meia-volta; às vezes atravessa para a outra calçada
        const volta: 1 | -1 = p.dir === 1 ? -1 : 1;
        if (rng.chance(0.4)) {
          const outro: 1 | -1 = p.lado === 1 ? -1 : 1;
          pontoCalcada(pf, p.s, outro, p.frac, b1);
          travessia(p, b1, p.edge, p.s, volta, outro);
        } else p.dir = volta;
        return;
      }
      const comecaA = np.edge.a === no;
      const s2 = comecaA ? tr2[0] : tr2[1];
      const dir2: 1 | -1 = comecaA ? 1 : -1;
      pontoCalcada(np, s2, 1, p.frac, b1);
      pontoCalcada(np, s2, -1, p.frac, b2);
      let lado2: 1 | -1 = Math.hypot(b1.x - a.x, b1.z - a.z) <= Math.hypot(b2.x - a.x, b2.z - a.z) ? 1 : -1;
      if (rng.chance(0.2)) lado2 = lado2 === 1 ? -1 : 1; // atravessa a rua de vez em quando
      const b = lado2 === 1 ? b1 : b2;
      if (Math.hypot(b.x - a.x, b.z - a.z) > 60) { p.ativo = false; return; }
      travessia(p, b, prox, s2, dir2, lado2);
    };

    const mat = mesh.instanceMatrix.array as Float32Array;
    const cor = mesh.instanceColor!.array as Float32Array;
    const calca = (mesh.geometry.getAttribute('iCalca') as THREE.InstancedBufferAttribute);
    const anim = (mesh.geometry.getAttribute('iAnim') as THREE.InstancedBufferAttribute);
    const ca = calca.array as Float32Array, an = anim.array as Float32Array;
    let n = 0;

    for (let i = 0; i < lista.length; i++) {
      const p = lista[i];
      if (!p.ativo || (!p.cruzando && !perfisAtuais.has(p.edge))) {
        if (!nascer(p)) { p.ativo = false; continue; }
      }
      let x: number, y: number, z: number, rumo: number;
      if (p.cruzando) {
        p.t += p.v * dt;
        if (p.t >= p.dist) {
          p.cruzando = false;
          p.edge = p.pe; p.s = p.ps; p.dir = p.pdir; p.lado = p.plado;
        }
      }
      if (p.cruzando) {
        const f = p.t / p.dist;
        x = p.x0 + (p.x1 - p.x0) * f; y = p.y0 + (p.y1 - p.y0) * f; z = p.z0 + (p.z1 - p.z0) * f;
        rumo = Math.atan2(p.x1 - p.x0, p.z1 - p.z0);
      } else {
        const pf = perfisAtuais.get(p.edge);
        const tr = pf && trechoCaminhavel(pf);
        if (!pf || !tr) { p.ativo = false; continue; }
        p.s += p.dir * p.v * dt;
        if (p.s < tr[0] || p.s > tr[1]) {
          fimDaCalcada(p, pf, tr);
          if (!p.ativo) continue;
        }
        if (p.cruzando) {
          x = p.x0; y = p.y0; z = p.z0;
          rumo = Math.atan2(p.x1 - p.x0, p.z1 - p.z0);
        } else {
          const pfa = perfisAtuais.get(p.edge)!;
          pontoCalcada(pfa, p.s, p.lado, p.frac, a);
          x = a.x; y = a.y; z = a.z;
          rumo = Math.atan2(a.tx * p.dir, a.tz * p.dir);
        }
      }
      // longe demais do alvo da câmera: renasce perto no próximo quadro
      if ((x - cx) ** 2 + (z - cz) ** 2 > R2) { p.ativo = false; continue; }

      // matriz = translação · rotação em Y · escala uniforme (escrita direta, sem Matrix4)
      const k = p.escala, c = Math.cos(rumo) * k, s = Math.sin(rumo) * k, o = n * 16;
      mat[o] = c; mat[o + 1] = 0; mat[o + 2] = -s; mat[o + 3] = 0;
      mat[o + 4] = 0; mat[o + 5] = k; mat[o + 6] = 0; mat[o + 7] = 0;
      mat[o + 8] = s; mat[o + 9] = 0; mat[o + 10] = c; mat[o + 11] = 0;
      mat[o + 12] = x; mat[o + 13] = y; mat[o + 14] = z; mat[o + 15] = 1;
      const cc = CAMISAS[p.camisa], cl = CALCAS[p.calca];
      cor[n * 3] = cc.r; cor[n * 3 + 1] = cc.g; cor[n * 3 + 2] = cc.b;
      ca[n * 3] = cl.r; ca[n * 3 + 1] = cl.g; ca[n * 3 + 2] = cl.b;
      an[n * 4] = p.fase; an[n * 4 + 1] = (p.v * 4.2) / k; an[n * 4 + 2] = p.pele;
      an[n * 4 + 3] = p.limiarChuva < chuva * 1.3 - 0.05 ? 1 : 0;
      n++;
    }

    mesh.count = n;
    for (const [attr, tam] of [[mesh.instanceMatrix, 16], [mesh.instanceColor!, 3], [calca, 3], [anim, 4]] as const) {
      attr.clearUpdateRanges();
      attr.addUpdateRange(0, Math.max(1, n) * tam);
      attr.needsUpdate = true;
    }
  });

  return <primitive object={rec.mesh} />;
}
