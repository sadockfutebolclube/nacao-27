/**
 * Malha das vias: leito com sinalização, meio-fio, calçadas (pedra portuguesa nas avenidas),
 * talude/lateral de ponte, cruzamentos, pilares, postes com luz de sódio ou LED e palmeiras
 * no canteiro central das avenidas.
 *
 * Fase 13: o Rio tem ~1.000 km de ruas. A malha é dividida em blocos de 1 km (cada bloco com as suas
 * faixas, postes, pilares e palmeiras) e os blocos longe da câmera ficam ocultos — sem isso a cena
 * desenhava milhões de vértices de rua a cada quadro, inclusive na sombra.
 */
import { medir } from '../medir';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { mundo, useGame } from '../../sim/bridge';
import { calcadaVia, larguraVia, type RoadEdge } from '../../world/roads';
import { roadBaseY, sampleHeight, sampleWaterDist, type Heightmap } from '../../world/terrain';
import { alturaOriginal, Classe, regradeDe } from '../../world/regrade';
import { ambiente } from './ambiente';
import { CICLO_SEM, eixoSemaforo, faseSemaforo } from '../../sim/trafego/semaforo';
import { trafegoEstado } from '../../sim/trafegoEstado';
import { estatLateral } from './estadoDebug';
import { clima } from './climaVisual';
import { amostrarPerfil, construirPerfis, type Perfil } from './perfilVias';
import orla from '../../data/orla.json';
import { texturaAsfalto, texturaAvenida, texturaCalcada, texturaCalcadao, texturaFaixas, texturaGrama, texturaHalo, texturaRua, texturaZebra } from './texturas';
import { comDetalhe } from '../materiais/detalhe';

export let perfisAtuais: Map<number, Perfil> = new Map();
const ruasOrla = new Set<string>(orla.ruas);

/**
 * Concreto de muro de arrimo (Fase 21): placas de 3 × 2,5 m com junta, manchas de umidade e dois barbacãs (furos de
 * drenagem) rente ao pé de cada placa; fosco (sem brilho) — uv em metros ÷ placa.
 */
function texturaConcreto(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const x = c.getContext('2d')!;
  x.fillStyle = '#a7a49b'; x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1800; i++) { x.fillStyle = `rgba(${70 + Math.random() * 120},${70 + Math.random() * 115},${64 + Math.random() * 105},0.2)`; x.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 4, 1 + Math.random() * 8); }
  // escorrimento de umidade, mais escuro embaixo
  const g = x.createLinearGradient(0, 0, 0, 256); g.addColorStop(0, 'rgba(60,70,55,0)'); g.addColorStop(1, 'rgba(50,60,45,0.30)');
  x.fillStyle = g; x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 9; i++) { x.fillStyle = 'rgba(48,52,44,0.16)'; x.fillRect(20 + Math.random() * 216, Math.random() * 120, 3 + Math.random() * 6, 80 + Math.random() * 120); }
  // juntas da placa
  x.strokeStyle = 'rgba(52,50,46,0.85)'; x.lineWidth = 4; x.strokeRect(2, 2, 252, 252);
  // barbacãs
  x.fillStyle = 'rgba(30,30,28,0.92)';
  for (const px of [64, 192]) { x.beginPath(); x.arc(px, 226, 7, 0, Math.PI * 2); x.fill(); x.fillStyle = 'rgba(95,90,82,0.9)'; x.fillRect(px - 9, 219, 18, 2); x.fillStyle = 'rgba(30,30,28,0.92)'; }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  return t;
}

interface Buffers { pos: number[]; nor: number[]; uv: number[]; idx: number[] }
const novo = (): Buffers => ({ pos: [], nor: [], uv: [], idx: [] });

function geometria(b: Buffers): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(b.nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
  g.setIndex(b.idx);
  g.computeBoundingSphere();
  return g;
}

/** Faixa (ribbon) entre deslocamentos laterais d0→d1, com alturas relativas y0/y1. */
function faixa(b: Buffers, p: Perfil, i0: number, i1: number, d0: number, d1: number, y0: number, y1: number, u0: number, u1: number, vEscala: number, normalLateral = 0) {
  const base = b.pos.length / 3;
  let cont = 0;
  for (let i = i0; i <= i1; i++) {
    const nx = -p.tz[i], nz = p.tx[i];
    const v = p.s[i] / vEscala;
    b.pos.push(p.x[i] + nx * d0, p.y[i] + y0, p.z[i] + nz * d0);
    b.pos.push(p.x[i] + nx * d1, p.y[i] + y1, p.z[i] + nz * d1);
    if (normalLateral) {
      b.nor.push(nx * normalLateral, 0, nz * normalLateral, nx * normalLateral, 0, nz * normalLateral);
    } else {
      b.nor.push(0, 1, 0, 0, 1, 0);
    }
    b.uv.push(u0, v, u1, v);
    cont++;
  }
  for (let k = 0; k < cont - 1; k++) {
    const a = base + k * 2, c = a + 2;
    // orientação: d0→d1 da esquerda p/ direita da tangente
    b.idx.push(a, a + 1, c, a + 1, c + 1, c);
  }
}

/**
 * Lateral da pista (Fases 20 e 28): do alto da calçada até o terreno embaixo. Em ponte e viaduto continua sendo a face vertical (a lateral
 * do tabuleiro, de 2,2 até 14 m). Na rua em aterro ou com vão (fora de ponte), a face vertical virou TALUDE DE GRAMA: um plano de 1 V : 1,5 H
 * que desce do bordo da calçada e vai até encontrar o terreno (no máximo 40 m para fora), no buffer das banquetas (material de grama).
 * Cada trecho contínuo de amostras do mesmo modo vira uma faixa; a face fica voltada para fora.
 */
export const TALUDE_H_POR_V = 1.5;
export const TALUDE_MIN_QUEDA = 2.2;
/** dev: localStorage['n27:semTalude']='1' volta à face vertical em tudo (para comparar tempo e visual) */
const SEM_TALUDE = (() => { try { return import.meta.env.DEV && localStorage.getItem('n27:semTalude') === '1'; } catch { return false; } })();
function lateralAteTerreno(b: Buffers, tal: Buffers, p: Perfil, i0: number, i1: number, d: number, lado: number, hm: Heightmap, estat?: { taludes: number; vertical: number; maxQueda: number }) {
  let modoAtual: 0 | 1 | -1 = -1, base = 0, cont = 0, buf = b;
  const fecha = () => {
    for (let k = 0; k < cont - 1; k++) { const a = base + k * 2, c = a + 2; buf.idx.push(a, a + 1, c, a + 1, c + 1, c); }
    cont = 0;
  };
  const inv = 1 / TALUDE_H_POR_V, nl = Math.hypot(inv, 1);
  for (let i = i0; i <= i1; i++) {
    const nx = -p.tz[i], nz = p.tx[i];
    const x = p.x[i] + nx * d, z = p.z[i] + nz * d;
    const terreno = sampleHeight(hm, x, z);
    const queda = p.y[i] + 0.17 - terreno;
    const ponte = p.nivel === 1 || p.classe?.[i] === Classe.Ponte;
    const modo: 0 | 1 = !SEM_TALUDE && !ponte && queda > TALUDE_MIN_QUEDA + 0.25 ? 1 : 0;
    if (modo !== modoAtual) { fecha(); modoAtual = modo; buf = modo ? tal : b; base = buf.pos.length / 3; }
    const topo = 0.17, v = p.s[i];
    if (modo === 1) {
      // sobe do pé do talude (onde o plano encontra o terreno) ao bordo da calçada
      const ox = nx * lado, oz = nz * lado;
      let r = 0;
      for (; r < 40; r += 2.5) { const ys = p.y[i] + topo - r * inv; if (ys <= sampleHeight(hm, x + ox * r, z + oz * r) + 0.05) break; }
      const yPe = p.y[i] + topo - r * inv;
      const [ya, yb, ra, rb] = lado > 0 ? [p.y[i] + topo, yPe, 0, r] : [yPe, p.y[i] + topo, r, 0];
      buf.pos.push(x + ox * ra, ya, z + oz * ra, x + ox * rb, yb, z + oz * rb);
      const sx = (ox * inv) / nl, sz = (oz * inv) / nl, sy = 1 / nl;
      buf.nor.push(sx, sy, sz, sx, sy, sz);
      buf.uv.push(v / 3, 0, v / 3, r / 3);
      if (estat) { estat.taludes++; estat.maxQueda = Math.max(estat.maxQueda, queda); }
    } else {
      const fundo = Math.max(-14, Math.min(-2.2, terreno - p.y[i] - 0.25));
      // lado > 0: (alto, baixo); lado < 0: (baixo, alto) — inverte o enrolamento para a face apontar sempre para fora
      const [y0, y1] = lado > 0 ? [topo, fundo] : [fundo, topo];
      buf.pos.push(x, p.y[i] + y0, z, x, p.y[i] + y1, z);
      buf.nor.push(nx * lado, 0, nz * lado, nx * lado, 0, nz * lado);
      buf.uv.push(0, v, 0, v);
      if (estat && queda > TALUDE_MIN_QUEDA + 0.25) { estat.vertical++; estat.maxQueda = Math.max(estat.maxQueda, queda); }
    }
    cont++;
  }
  fecha();
}

/** Meio-fio circular: topo (anel de 22 cm) e face externa vertical, da pista (y) até y + alto. */
function meioFioCircular(b: Buffers, x: number, y: number, z: number, r: number, alto: number, seg = 24) {
  const base = b.pos.length / 3;
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a);
    b.pos.push(x + c * (r - 0.22), y + alto, z + sn * (r - 0.22), x + c * r, y + alto, z + sn * r, x + c * r, y, z + sn * r);
    b.nor.push(0, 1, 0, 0, 1, 0, c, 0, sn);
    b.uv.push(0.5, i, 0.6, i, 0.6, i);
  }
  for (let i = 0; i < seg; i++) {
    const a = base + i * 3, n = a + 3;
    b.idx.push(a, n, a + 1, a + 1, n, n + 1); // topo
    b.idx.push(a + 1, n + 1, a + 2, a + 2, n + 1, n + 2); // face externa
  }
}

function disco(b: Buffers, x: number, y: number, z: number, r: number, seg = 20) {
  const base = b.pos.length / 3;
  // uv pelas coordenadas do mundo (6 m por repetição): o asfalto do cruzamento tem o mesmo grão e o mesmo tom do leito
  b.pos.push(x, y, z); b.nor.push(0, 1, 0); b.uv.push(x / 6, z / 6);
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
    b.pos.push(px, y, pz);
    b.nor.push(0, 1, 0);
    b.uv.push(px / 6, pz / 6);
  }
  for (let i = 0; i < seg; i++) b.idx.push(base, base + 2 + i, base + 1 + i);
}

function indiceDoCorte(p: Perfil, s: number, doFim: boolean): number {
  if (!doFim) {
    for (let i = 0; i < p.n; i++) if (p.s[i] >= s) return i;
    return p.n - 1;
  }
  for (let i = p.n - 1; i >= 0; i--) if (p.s[i] <= p.comprimento - s) return i;
  return 0;
}

/** chave de sinalização do leito */
export const chaveLeito = (e: Pick<RoadEdge, 'type' | 'faixas' | 'maoUnica'>) => (e.faixas === undefined ? e.type : `${Math.max(1, Math.min(8, e.faixas))}${e.maoUnica ? 'u' : 'd'}`);

/** lado do bloco de vias (m) e distância (m) até onde um bloco aparece */
const BLOCO_VIAS = 1024;
const DIST_VIAS = 4500;

interface MalhaBloco {
  chave: string;
  /** centro do bloco */
  cx: number; cz: number;
  /** leitos por tipo de sinalização: 'rua' · 'avenida' (vias do jogador) ou `${faixas}${d|u}` (vias reais) */
  leitos: Record<string, THREE.BufferGeometry>;
  calcadas: THREE.BufferGeometry;
  calcadoes: THREE.BufferGeometry;
  laterais: THREE.BufferGeometry;
  cruzamentos: THREE.BufferGeometry;
  /** Fase 20: muros de arrimo, guarda-corpo (fita) e tinta da minirrotatória */
  muros: THREE.BufferGeometry;
  /** banquetas de grama dos patamares (Fase 21) */
  banquetas: THREE.BufferGeometry;
  guardas: THREE.BufferGeometry;
  ilhas: THREE.BufferGeometry;
  /** balaústres do guarda-corpo e peças (pilares e verga) dos portais de túnel */
  balaustres: THREE.Matrix4[];
  portais: THREE.Matrix4[];
  postes: THREE.Matrix4[];
  pilares: THREE.Matrix4[];
  palmeiras: THREE.Matrix4[];
  /** faixas de pedestre (zebra), hastes e lâmpadas dos semáforos (eixo 0/1 define a fase) */
  zebras: THREE.Matrix4[];
  hastesSem: THREE.Matrix4[];
  lampSem: { m: THREE.Matrix4; eixo: number }[];
}
type MalhaVias = MalhaBloco[];

/** Fases do semáforo: as mesmas do Worker de tráfego (Fase 29), em src/sim/trafego/semaforo.ts */
export { CICLO_SEM, eixoSemaforo, faseSemaforo };

interface Acum { leitos: Record<string, Buffers>; calc: Buffers; calcadao: Buffers; lat: Buffers; cruz: Buffers; muro: Buffers; banqueta: Buffers; guarda: Buffers; ilha: Buffers; balaustres: THREE.Matrix4[]; portais: THREE.Matrix4[]; postes: THREE.Matrix4[]; pilares: THREE.Matrix4[]; palmeiras: THREE.Matrix4[]; zebras: THREE.Matrix4[]; hastesSem: THREE.Matrix4[]; lampSem: { m: THREE.Matrix4; eixo: number }[] }
const novoAcum = (): Acum => ({ leitos: {}, calc: novo(), calcadao: novo(), lat: novo(), cruz: novo(), muro: novo(), banqueta: novo(), guarda: novo(), ilha: novo(), balaustres: [], portais: [], postes: [], pilares: [], palmeiras: [], zebras: [], hastesSem: [], lampSem: [] });

export function construir(hm: Heightmap): MalhaVias {
  const t0 = performance.now();
  const g = mundo.roads;
  const perfis = construirPerfis(g, hm);
  perfisAtuais = perfis;
  estatLateral.taludes = 0; estatLateral.vertical = 0; estatLateral.maxQueda = 0;
  const blocos = new Map<string, Acum>();
  const bloco = (x: number, z: number) => {
    const k = `${Math.floor(x / BLOCO_VIAS)},${Math.floor(z / BLOCO_VIAS)}`;
    return blocos.get(k) ?? blocos.set(k, novoAcum()).get(k)!;
  };
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pos = new THREE.Vector3();
  const eixoY = new THREE.Vector3(0, 1, 0);

  for (const p of perfis.values()) {
    const meio = p.n >> 1;
    const { leitos, calc, calcadao, lat, banqueta, postes, pilares, palmeiras } = bloco(p.x[meio], p.z[meio]);
    const regrade = regradeDe(hm.h);
    const hw = larguraVia(p.edge) / 2, sw = calcadaVia(p.edge);
    const i0 = indiceDoCorte(p, p.cortaA, false), i1 = indiceDoCorte(p, p.cortaB, true);
    if (i1 - i0 < 1) continue;
    const chave = chaveLeito(p.edge);
    faixa(leitos[chave] ??= novo(), p, i0, i1, -hw, hw, 0.02, 0.02, 0, 1, p.edge.faixas === undefined ? (p.edge.type === 'avenida' ? 20 : 10) : 16);
    // túnel: só o leito (escondido sob o morro, aparece nos portais); sem calçada, poste nem canteiro
    if (p.nivel === -1) continue;
    // pedra portuguesa: avenidas do jogador e, nas reais, só perto do mar (os calçadões da orla)
    // trechos fora de túnel (a rua pode ter só uma parte em túnel): calçada, meio-fio e lateral só neles
    const segs: [number, number][] = [];
    { let a = -1; for (let i = i0; i <= i1; i++) { const tun = p.classe?.[i] === Classe.Tunel; if (!tun && a < 0) a = i; if ((tun || i === i1) && a >= 0) { const b = tun ? i - 1 : i; if (b > a) segs.push([a, b]); a = -1; } } }
    // Fase 21: pedra portuguesa só nas avenidas do jogador e nas ruas da orla (src/data/orla.json) a menos de 250 m da água
    const calcadaoAqui = p.edge.faixas === undefined ? p.edge.type === 'avenida' : ruasOrla.has(p.edge.name) && sampleWaterDist(hm, p.x[meio], p.z[meio]) < 250;
    const destino = calcadaoAqui ? calcadao : calc;
    const escalaV = calcadaoAqui ? 8 : 4;
    for (const [sa, sb] of segs) for (const lado of [-1, 1]) {
      const dIn = lado * hw, dOut = lado * (hw + sw);
      // (a ordem dos argumentos garante faces voltadas para fora em ambos os lados)
      // meio-fio (face vertical voltada para o leito) e calçada elevada
      if (lado > 0) faixa(lat, p, sa, sb, dIn, dIn, 0.02, 0.17, 0, 0, 1, -lado);
      else faixa(lat, p, sa, sb, dIn, dIn, 0.17, 0.02, 0, 0, 1, -lado);
      if (lado > 0) faixa(destino, p, sa, sb, dIn, dOut, 0.17, 0.17, 0, 1, escalaV);
      else faixa(destino, p, sa, sb, dOut, dIn, 0.17, 0.17, 0, 1, escalaV);
      // talude / lateral da ponte até abaixo do chão (face voltada para fora)
      lateralAteTerreno(lat, banqueta, p, sa, sb, dOut, lado, hm, estatLateral);
    }
    // postes
    const passo = 30;
    const offPoste = hw + sw - 0.6;
    let lado = 1;
    for (let s = Math.max(p.cortaA + 4, 8); s < p.comprimento - Math.max(p.cortaB + 4, 8); s += passo / (p.edge.type === 'avenida' ? 1.5 : 1)) {
      const f = (s / p.comprimento) * (p.n - 1);
      const i = Math.min(p.n - 1, Math.round(f));
      if (p.classe?.[i] === Classe.Tunel) { lado = -lado; continue; }
      const nx = -p.tz[i], nz = p.tx[i];
      for (const ld of p.edge.type === 'avenida' ? [-1, 1] : [lado]) {
        pos.set(p.x[i] + nx * offPoste * ld, p.y[i] + 0.17, p.z[i] + nz * offPoste * ld);
        q.setFromAxisAngle(eixoY, Math.atan2(-nx * ld, -nz * ld));
        m.compose(pos, q, sc.set(1, 1, 1));
        postes.push(m.clone());
      }
      lado = -lado;
    }
    // palmeiras imperiais no canteiro da avenida (só as do jogador: nas reais cada pista é uma via)
    if (p.edge.type === 'avenida' && p.edge.faixas === undefined) {
      for (let s = p.cortaA + 10; s < p.comprimento - p.cortaB - 10; s += 16) {
        const i = Math.min(p.n - 1, Math.round((s / p.comprimento) * (p.n - 1)));
        pos.set(p.x[i], p.y[i] + 0.1, p.z[i]);
        q.setFromAxisAngle(eixoY, (s * 1.7) % (Math.PI * 2));
        const k = 0.9 + ((s * 13.7) % 1) * 0.25;
        m.compose(pos, q, sc.set(k, k, k));
        palmeiras.push(m.clone());
      }
    }
    // Fase 20/21: muro de arrimo onde o terreno original difere da rua em mais de 4 m — do lado do morro (corte) ou do vale
    // (aterro). Acima de 5 m vira patamares de até 5 m com banquetas de grama de 2 m (cada patamar recua 2 m); guarda-corpo
    // no topo (corte) ou na borda da pista (aterro). A parede fica logo depois da calçada e vai até o relevo ORIGINAL.
    if (regrade && p.classe && !p.nivel) {
      type PontoMuro = { x: number; z: number; nx: number; nz: number; via: number; terr: number; s: number; corte: boolean };
      for (const lado of [-1, 1]) {
        const d = lado * (hw + sw + 0.35);
        let ant = null as PontoMuro | null;
        let proximoBal = 0;
        for (let i = i0; i <= i1; i++) {
          let atual = null as PontoMuro | null;
          if (p.classe[i] === Classe.Muro) {
            const nx = -p.tz[i] * lado, nz = p.tx[i] * lado; // para fora da pista
            const x = p.x[i] + nx * (hw + sw + 0.35), z = p.z[i] + nz * (hw + sw + 0.35);
            const terr = alturaOriginal(regrade, hm, x, z), via = p.y[i] + 0.17;
            if (terr > via + 0.6 && terr - via < 40) atual = { x, z, nx, nz, via, terr: terr + 0.25, s: p.s[i], corte: true };
            else if (terr < via - 0.6 && via - terr < 40) atual = { x, z, nx, nz, via, terr: terr - 0.3, s: p.s[i], corte: false };
          }
          if (atual && ant && atual.corte === ant.corte) { // corte e aterro não se ligam (a parede se torceria)
            const B = bloco(atual.x, atual.z);
            const H = Math.max(Math.abs(ant.terr - ant.via), Math.abs(atual.terr - atual.via));
            const np = Math.max(1, Math.ceil(H / 5));
            const nivelK = (pt: PontoMuro, k: number) => pt.via + (pt.terr - pt.via) * (k / np);
            for (let k = 0; k < np; k++) {
              const off = k * 2, off2 = off + (k === np - 1 ? 2.5 : 2);
              const ax = ant.x + ant.nx * off, az = ant.z + ant.nz * off, bx = atual.x + atual.nx * off, bz = atual.z + atual.nz * off;
              const ya0 = nivelK(ant, k), ya1 = nivelK(ant, k + 1), yb0 = nivelK(atual, k), yb1 = nivelK(atual, k + 1);
              // face do patamar: no corte olha para a pista; no aterro, para fora
              const sg = atual.corte ? -1 : 1, fnx = atual.nx * sg, fnz = atual.nz * sg;
              const r0 = B.muro.pos.length / 3;
              B.muro.pos.push(ax, ya0, az, ax, ya1, az, bx, yb0, bz, bx, yb1, bz);
              for (let q4 = 0; q4 < 4; q4++) B.muro.nor.push(fnx, 0, fnz);
              B.muro.uv.push(ant.s / 3, ya0 / 2.5, ant.s / 3, ya1 / 2.5, atual.s / 3, yb0 / 2.5, atual.s / 3, yb1 / 2.5);
              // frente do triângulo (anti-horário) = a normal pretendida: tangente t = (b − a); a frente de (v0, v1, v2) olha para (tz, −tx)
              const tgx = bx - ax, tgz = bz - az;
              if (fnx * tgz - fnz * tgx >= 0) B.muro.idx.push(r0, r0 + 1, r0 + 2, r0 + 1, r0 + 3, r0 + 2);
              else B.muro.idx.push(r0, r0 + 2, r0 + 1, r0 + 1, r0 + 2, r0 + 3);
              // banqueta de grama no alto do patamar (corte) ou no pé dele (aterro): 2 m de largura, no nível seguinte
              const cx0 = ant.x + ant.nx * off2, cz0 = ant.z + ant.nz * off2, dx0 = atual.x + atual.nx * off2, dz0 = atual.z + atual.nz * off2;
              const b0 = B.banqueta.pos.length / 3;
              B.banqueta.pos.push(ax, ya1 + 0.01, az, cx0, ya1 + 0.01, cz0, bx, yb1 + 0.01, bz, dx0, yb1 + 0.01, dz0);
              for (let q4 = 0; q4 < 4; q4++) B.banqueta.nor.push(0, 1, 0);
              B.banqueta.uv.push(ant.s / 2, 0, ant.s / 2, 1, atual.s / 2, 0, atual.s / 2, 1);
              // topo da banqueta: a frente olha para cima quando (para fora × tangente).y > 0
              if (atual.nz * tgx - atual.nx * tgz >= 0) B.banqueta.idx.push(b0, b0 + 1, b0 + 2, b0 + 1, b0 + 3, b0 + 2);
              else B.banqueta.idx.push(b0, b0 + 2, b0 + 1, b0 + 1, b0 + 2, b0 + 3);
              // guarda-corpo: no alto do último patamar do corte; na borda da pista, no aterro
              if ((atual.corte && k === np - 1) || (!atual.corte && k === 0)) {
                const gy = (atual.corte ? yb1 : yb0), gya = (atual.corte ? ya1 : ya0);
                const gb = B.guarda.pos.length / 3;
                B.guarda.pos.push(ax, gya + 0.8, az, ax, gya + 1.0, az, bx, gy + 0.8, bz, bx, gy + 1.0, bz);
                for (let q4 = 0; q4 < 4; q4++) B.guarda.nor.push(fnx, 0, fnz);
                B.guarda.uv.push(0, 0, 0, 1, 1, 0, 1, 1);
                if (fnx * tgz - fnz * tgx >= 0) B.guarda.idx.push(gb, gb + 1, gb + 2, gb + 1, gb + 3, gb + 2);
                else B.guarda.idx.push(gb, gb + 2, gb + 1, gb + 1, gb + 2, gb + 3);
                if (atual.s >= proximoBal) {
                  pos.set(bx, gy, bz);
                  q.setFromAxisAngle(eixoY, Math.atan2(p.tx[i], p.tz[i]));
                  m.compose(pos, q, sc.set(1, 1, 1));
                  B.balaustres.push(m.clone());
                  proximoBal = atual.s + 3;
                }
              }
            }
          }
          ant = atual;
        }
        void d;
      }
    }
    // pilares de ponte/viaduto
    for (let s = 12; s < p.comprimento - 12; s += 24) {
      const i = Math.min(p.n - 1, Math.round((s / p.comprimento) * (p.n - 1)));
      const chao = Math.min(sampleHeight(hm, p.x[i], p.z[i]), p.y[i]);
      const vao = p.y[i] - chao;
      if (vao > 3) {
        const base = Math.min(chao, -6);
        const alt = p.y[i] - 1.2 - base;
        pos.set(p.x[i], base + alt / 2, p.z[i]);
        q.setFromAxisAngle(eixoY, Math.atan2(p.tx[i], p.tz[i]));
        m.compose(pos, q, sc.set(Math.min(hw * 1.4, 12), alt, 2.2));
        pilares.push(m.clone());
      }
    }
  }

  // cruzamentos e emendas (grau e larguras por nó num passe só: o Rio tem 15 mil trechos)
  const porNo = new Map<number, { grau: number; hw: number; sw: number }>();
  for (const e of g.edges.values()) for (const id of [e.a, e.b]) {
    const r = porNo.get(id) ?? porNo.set(id, { grau: 0, hw: 0, sw: 0 }).get(id)!;
    r.grau++;
    r.hw = Math.max(r.hw, larguraVia(e) / 2);
    r.sw = Math.max(r.sw, calcadaVia(e));
  }
  for (const n of g.nodes.values()) {
    const r = porNo.get(n.id);
    const grau = r?.grau ?? 0, hwMax = r?.hw ?? 0, swMax = r?.sw ?? 0;
    if (!grau) continue;
    const y = roadBaseY(hm, n.x, n.z);
    const { calc, cruz } = bloco(n.x, n.z);
    // Fase 19: cruzamento é só a caixa de asfalto rente ao leito (antes: disco de calçada elevado, que parecia
    // rotatória no meio de avenida reta). Rotatória de verdade vem do OSM (`junction=roundabout`), abaixo.
    void calc; void swMax;
    disco(cruz, n.x, y + 0.03, n.z, grau >= 3 ? hwMax + 1.5 : hwMax, grau >= 3 ? 28 : 20);
  }

  // rotatórias validadas (anel fechado de 8–40 m do OSM): ilha central em calçada, na cota média do anel
  const rot = mundo.real?.vias.rotatorias ?? [];
  for (let k = 0; k + 2 < rot.length; k += 3) {
    const [rx, rz, rr] = [rot[k], rot[k + 1], rot[k + 2]];
    let soma = 0, cont = 0, hwAnel = 3.5;
    for (const p of perfis.values()) {
      for (let i = 0; i < p.n; i += 2) {
        const d = Math.hypot(p.x[i] - rx, p.z[i] - rz);
        if (Math.abs(d - rr) < 3) { soma += p.y[i]; cont++; hwAnel = Math.max(hwAnel, larguraVia(p.edge) / 2); }
      }
    }
    if (!cont) continue;
    const { calc } = bloco(rx, rz);
    const raioIlha = rr - hwAnel - 0.4;
    if (raioIlha > 1.5) disco(calc, rx, soma / cont + 0.17, rz, raioIlha, 32);
  }

  // semáforos nos cruzamentos marcados e faixas de pedestre (nas esquinas e no meio das quadras)
  const arestasDoNo = new Map<number, RoadEdge[]>();
  for (const e of g.edges.values()) for (const id of [e.a, e.b]) if (g.nodes.get(id)?.semaforo) (arestasDoNo.get(id) ?? arestasDoNo.set(id, []).get(id)!).push(e);
  const pAux = { x: 0, y: 0, z: 0, tx: 0, tz: 0 };
  for (const [id, es] of arestasDoNo) {
    const n = g.nodes.get(id)!;
    const { zebras, hastesSem, lampSem } = bloco(n.x, n.z);
    for (const e of es) {
      const p = perfis.get(e.id);
      if (!p || p.nivel) continue;
      const noA = e.a === id;
      const dist = noA ? p.cortaA + 2.2 : p.comprimento - p.cortaB - 2.2;
      if (dist < 2 || dist > p.comprimento - 2) continue;
      amostrarPerfil(p, dist, pAux);
      // tangente apontando para o cruzamento
      const sgn = noA ? -1 : 1;
      const tx = pAux.tx * sgn, tz = pAux.tz * sgn;
      const lw = larguraVia(e);
      q.setFromAxisAngle(eixoY, Math.atan2(tx, tz));
      // zebra atravessando o leito
      m.compose(pos.set(pAux.x, pAux.y + 0.045, pAux.z), q, sc.set(lw, 1, 3.2));
      zebras.push(m.clone());
      // haste na calçada do lado direito de quem chega, antes da faixa
      const nx = -tz, nz = tx;
      const recuo = 3;
      const px = pAux.x - tx * recuo + nx * (lw / 2 + 0.6), pz = pAux.z - tz * recuo + nz * (lw / 2 + 0.6);
      m.compose(pos.set(px, pAux.y + 0.17, pz), q, sc.set(1, 1, 1));
      hastesSem.push(m.clone());
      m.compose(pos.set(px, pAux.y + 0.17 + 5.1, pz), q, sc.set(1, 1, 1));
      lampSem.push({ m: m.clone(), eixo: eixoSemaforo(tx, tz) });
    }
  }
  const ped = mundo.real?.vias.faixasPed ?? [];
  for (let k = 0; k + 2 < ped.length; k += 3) {
    const x = ped[k], z = ped[k + 1], ang = ped[k + 2] / 1000;
    const y = roadBaseY(hm, x, z);
    q.setFromAxisAngle(eixoY, ang);
    m.compose(pos.set(x, y + 0.045, z), q, sc.set(8, 1, 3.2));
    bloco(x, z).zebras.push(m.clone());
  }

  // portais dos túneis (os do OSM e as corridas criadas pelo regrade): pilares e verga de concreto onde o túnel encontra o chão
  // ou acaba. Nas pontas de trecho, só se alguma outra rua que chega ao nó não segue em túnel.
  const grauNo = new Map<number, number>(), tunelNo = new Map<number, number>();
  const corridasTunel = (p: Perfil): [number, number][] => {
    if (p.nivel === -1) return [[0, p.n - 1]];
    const r: [number, number][] = [];
    if (!p.classe) return r;
    let ini = -1;
    for (let i = 0; i < p.n; i++) {
      if (p.classe[i] === Classe.Tunel && ini < 0) ini = i;
      if ((p.classe[i] !== Classe.Tunel || i === p.n - 1) && ini >= 0) { r.push([ini, p.classe[i] === Classe.Tunel ? i : i - 1]); ini = -1; }
    }
    return r.filter(([x, y]) => y - x >= 2);
  };
  const corridas = new Map<number, [number, number][]>();
  for (const p of perfis.values()) {
    for (const id of [p.edge.a, p.edge.b]) grauNo.set(id, (grauNo.get(id) ?? 0) + 1);
    const cs = corridasTunel(p);
    if (!cs.length) continue;
    corridas.set(p.edge.id, cs);
    for (const [x, y] of cs) { if (x === 0) tunelNo.set(p.edge.a, (tunelNo.get(p.edge.a) ?? 0) + 1); if (y === p.n - 1) tunelNo.set(p.edge.b, (tunelNo.get(p.edge.b) ?? 0) + 1); }
  }
  const regradePortal = regradeDe(hm.h);
  for (const [id, cs] of corridas) {
    const p = perfis.get(id)!;
    for (const [x0, x1] of cs) for (const fim of [0, 1]) {
      const i = fim === 0 ? x0 : x1;
      const noPonta = fim === 0 ? x0 === 0 : x1 === p.n - 1;
      if (noPonta) {
        const nid = fim === 0 ? p.edge.a : p.edge.b;
        if ((grauNo.get(nid) ?? 0) > 1 && (tunelNo.get(nid) ?? 0) >= (grauNo.get(nid) ?? 0)) continue; // todas seguem em túnel
      }
      const sg = fim === 0 ? -1 : 1; // para fora do túnel
      const ia = Math.max(0, Math.min(p.n - 1, i + (fim === 0 ? 1 : -1)));
      const tx = (p.x[ia] - p.x[i]) * (fim === 0 ? -1 : 1), tz = (p.z[ia] - p.z[i]) * (fim === 0 ? -1 : 1), tl = Math.hypot(tx, tz) || 1;
      const ox = tx / tl, oz = tz / tl;
      void sg;
      const larg = larguraVia(p.edge) + 1.6;
      const topo = (regradePortal ? alturaOriginal(regradePortal, hm, p.x[i] + ox * 2, p.z[i] + oz * 2) : sampleHeight(hm, p.x[i], p.z[i])) + 0.4;
      const alto = Math.max(5.6, Math.min(topo - p.y[i], 16));
      q.setFromAxisAngle(eixoY, Math.atan2(ox, oz));
      const dir = new THREE.Vector3(oz, 0, -ox); // à direita de quem sai
      const { portais } = bloco(p.x[i], p.z[i]);
      for (const lado of [-1, 1]) {
        pos.set(p.x[i] + dir.x * lado * (larg / 2 + 0.5), p.y[i] + 2.8, p.z[i] + dir.z * lado * (larg / 2 + 0.5));
        m.compose(pos, q, sc.set(1.0, 5.6, 1.6)); portais.push(m.clone());
      }
      pos.set(p.x[i], p.y[i] + 5.6 + (alto - 5.6) / 2 + 0.6, p.z[i]);
      m.compose(pos, q, sc.set(larg + 2.0, alto - 5.6 + 1.2, 1.6)); portais.push(m.clone());
    }
  }

  // minirrotatórias (junction=circular ou rotatória de 4–8 m): ilha pintada rente ao asfalto, na cota média do cruzamento
  const mini = mundo.real?.vias.minirrotatorias ?? [];
  for (let k = 0; k + 2 < mini.length; k += 3) {
    const [mx, mz, mr] = [mini[k], mini[k + 1], mini[k + 2]];
    let soma = 0, cont = 0;
    for (const p of perfis.values()) for (let i = 0; i < p.n; i += 2) if (!p.nivel && Math.hypot(p.x[i] - mx, p.z[i] - mz) < mr + 6) { soma += p.y[i]; cont++; }
    if (!cont) continue;
    // ilha central: asfalto um tom mais claro rente à pista (+4,5 cm, polygonOffset −5: sem z-fighting) e meio-fio de 12 cm na borda
    const B = bloco(mx, mz), yi = soma / cont, ri = Math.min(2.6, Math.max(1.1, mr * 0.3));
    disco(B.ilha, mx, yi + 0.045, mz, ri, 24);
    meioFioCircular(B.calc, mx, yi, mz, ri, 0.12);
  }

  const malha = [...blocos].map(([chave, b]) => {
    const [bx, bz] = chave.split(',').map(Number);
    return {
      chave, cx: (bx + 0.5) * BLOCO_VIAS, cz: (bz + 0.5) * BLOCO_VIAS,
      leitos: Object.fromEntries(Object.entries(b.leitos).map(([k, v]) => [k, geometria(v)])),
      calcadas: geometria(b.calc), calcadoes: geometria(b.calcadao), laterais: geometria(b.lat), cruzamentos: geometria(b.cruz),
      muros: geometria(b.muro), banquetas: geometria(b.banqueta), guardas: geometria(b.guarda), ilhas: geometria(b.ilha), balaustres: b.balaustres, portais: b.portais,
      postes: b.postes, pilares: b.pilares, palmeiras: b.palmeiras, zebras: b.zebras, hastesSem: b.hastesSem, lampSem: b.lampSem,
    };
  });
  if (import.meta.env.DEV) console.info(`[vias] malha construída em ${(performance.now() - t0).toFixed(0)} ms · ${estatLateral.taludes} amostras de talude de grama, ${estatLateral.vertical} de face vertical`);
  return malha;
}

function Instancias({ matrizes, geometria, material, sombra = true }: { matrizes: THREE.Matrix4[]; geometria: THREE.BufferGeometry; material: THREE.Material; sombra?: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const cap = Math.max(16, Math.ceil(matrizes.length * 1.3));
  useEffect(() => {
    const im = ref.current;
    if (!im) return;
    matrizes.forEach((m, i) => im.setMatrixAt(i, m));
    im.count = matrizes.length;
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere();
  }, [matrizes]);
  return <instancedMesh key={cap} ref={ref} args={[geometria, material, cap]} castShadow={sombra} receiveShadow />;
}

/** Tempo do semáforo: o do Worker de tráfego (as lâmpadas e os carros concordam); sem ele, ambiente.tempo. */
const uSemTempo = { value: 0 };

/** Lâmpada de semáforo: um bloco emissivo cuja cor (verde, amarelo, vermelho) sai da fase do eixo, calculada no shader. */
function materialLampSem(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color: '#1a1a1a', roughness: 0.4 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uSemTempo = uSemTempo;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aEixo;\nvarying float vEixo;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvEixo = aEixo;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uSemTempo;\nvarying float vEixo;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float uSem = mod(uSemTempo + vEixo * ${(CICLO_SEM / 2).toFixed(1)}, ${CICLO_SEM.toFixed(1)});
        vec3 corSem = uSem < 16.0 ? vec3(0.1, 1.0, 0.3) : (uSem < 20.0 ? vec3(1.0, 0.8, 0.1) : vec3(1.0, 0.1, 0.08));
        totalEmissiveRadiance += corSem * 3.0;`);
  };
  m.customProgramCacheKey = () => 'lampada-semaforo';
  return m;
}

function LampadasSemaforo({ itens, geo, mat }: { itens: { m: THREE.Matrix4; eixo: number }[]; geo: THREE.BufferGeometry; mat: THREE.Material }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const cap = Math.max(1, itens.length);
  const g = useMemo(() => {
    const c = geo.clone();
    c.setAttribute('aEixo', new THREE.InstancedBufferAttribute(Float32Array.from(itens.map((i) => i.eixo)), 1));
    return c;
  }, [geo, itens]);
  useEffect(() => () => g.dispose(), [g]);
  useEffect(() => {
    const im = ref.current;
    if (!im) return;
    itens.forEach((it, i) => im.setMatrixAt(i, it.m));
    im.count = itens.length;
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere();
  }, [itens, g]);
  if (!itens.length) return null;
  return <instancedMesh key={cap} ref={ref} args={[g, mat, cap]} />;
}

/** Geometria de poste: haste + braço + luminária (y=0 na calçada). */
function geoPoste(): { haste: THREE.BufferGeometry; lampada: THREE.BufferGeometry } {
  const haste = new THREE.CylinderGeometry(0.09, 0.13, 7.5, 6).translate(0, 3.75, 0);
  const braco = new THREE.BoxGeometry(0.1, 0.1, 1.8).translate(0, 7.4, 0.85);
  const h = mergeGeos([haste, braco]);
  const lampada = new THREE.BoxGeometry(0.45, 0.16, 0.8).translate(0, 7.3, 1.7);
  return { haste: h, lampada };
}

export function mergeGeos(gs: THREE.BufferGeometry[]): THREE.BufferGeometry {
  // junção simples (posição/normal/uv) sem dependências extras
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], idx: number[] = [];
  let base = 0;
  for (const g0 of gs) {
    const g = g0.index ? g0 : g0;
    const p = g.getAttribute('position'), n = g.getAttribute('normal'), u = g.getAttribute('uv');
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
      nor.push(n ? n.getX(i) : 0, n ? n.getY(i) : 1, n ? n.getZ(i) : 0);
      uv.push(u ? u.getX(i) : 0, u ? u.getY(i) : 0);
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) idx.push(g.index.getX(i) + base);
    else for (let i = 0; i < p.count; i++) idx.push(i + base);
    base += p.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  out.setIndex(idx);
  return out;
}

/** Palmeira imperial: tronco alto e coroa de folhas pendentes. */
export function geoPalmeira(): { tronco: THREE.BufferGeometry; copa: THREE.BufferGeometry } {
  const tronco = new THREE.CylinderGeometry(0.22, 0.32, 11, 6).translate(0, 5.5, 0);
  const folhas: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 9; i++) {
    const f = new THREE.PlaneGeometry(0.9, 4.2, 1, 3);
    const p = f.getAttribute('position');
    for (let k = 0; k < p.count; k++) {
      const y = p.getY(k) + 2.1; // 0..4.2 ao longo da folha
      const curva = -0.11 * y * y;
      p.setXYZ(k, p.getX(k) * (1 - y / 6), curva, y);
    }
    f.computeVertexNormals();
    f.rotateX(-0.35);
    f.rotateY((i / 9) * Math.PI * 2);
    f.translate(0, 11, 0);
    folhas.push(f);
  }
  return { tronco, copa: mergeGeos(folhas) };
}

export function Vias({ hm }: { hm: Heightmap }) {
  const versao = useGame((s) => s.worldVersion);
  const malha = useMemo(() => medir('vias: construir', () => construir(hm)), [hm, versao]);
  useEffect(() => () => {
    for (const b of malha) {
      Object.values(b.leitos).forEach((g) => g.dispose());
      b.calcadas.dispose(); b.calcadoes.dispose(); b.laterais.dispose(); b.cruzamentos.dispose(); b.muros.dispose(); b.banquetas.dispose(); b.guardas.dispose(); b.ilhas.dispose();
    }
  }, [malha]);

  const mats = useMemo(() => {
    // ordem de profundidade (Fase 19): terreno (+2) < água < calçada (−2) < asfalto (−3) < faixas (−6)
    const comum = { roughness: 0.92, metalness: 0, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 };
    const comumCalcada = { ...comum, polygonOffsetFactor: -2, polygonOffsetUnits: -2 };
    return {
      // Fase 12: asfalto e calçada fotográficos (ambientCG) por cima das faixas pintadas
      rua: comDetalhe(new THREE.MeshStandardMaterial({ ...comum, map: texturaRua() }), 'Asphalt033', 4, 0.85),
      avenida: comDetalhe(new THREE.MeshStandardMaterial({ ...comum, map: texturaAvenida() }), 'Asphalt033', 4, 0.85),
      calcada: comDetalhe(new THREE.MeshStandardMaterial({ ...comumCalcada, map: texturaCalcada(), roughness: 0.85 }), 'PavingStones046', 2.4, 0.75),
      calcadao: new THREE.MeshStandardMaterial({ ...comumCalcada, map: texturaCalcadao(), roughness: 0.7 }),
      lateral: new THREE.MeshStandardMaterial({ color: '#9b958a', roughness: 0.95 }),
      muro: new THREE.MeshStandardMaterial({ map: texturaConcreto(), roughness: 0.96, metalness: 0, envMapIntensity: 0.15, side: THREE.DoubleSide }),
      guarda: new THREE.MeshStandardMaterial({ color: '#4a4f54', roughness: 0.5, metalness: 0.5, side: THREE.DoubleSide }),
      ilha: comDetalhe(new THREE.MeshStandardMaterial({ map: texturaAsfalto(true), roughness: 0.92, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5 }), 'Asphalt033', 4, 0.85),
      grama: new THREE.MeshStandardMaterial({ map: texturaGrama(), roughness: 0.98, metalness: 0, side: THREE.DoubleSide }),
      // Fase 21: o cruzamento usa o mesmo asfalto liso dos leitos (era um disco cinza chapado)
      cruz: comDetalhe(new THREE.MeshStandardMaterial({ ...comum, map: texturaAsfalto(), roughness: 0.92 }), 'Asphalt033', 4, 0.85),
      poste: new THREE.MeshStandardMaterial({ color: '#5d6266', roughness: 0.6, metalness: 0.4 }),
      lampada: new THREE.MeshStandardMaterial({ color: '#2b2b2b', emissive: new THREE.Color('#ffb04a'), emissiveIntensity: 0 }),
      pilar: new THREE.MeshStandardMaterial({ color: '#a8a39a', roughness: 0.9 }),
      zebra: new THREE.MeshStandardMaterial({ map: texturaZebra(), transparent: true, roughness: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 }),
      lampSem: materialLampSem(),
      halo: new THREE.MeshBasicMaterial({ map: texturaHalo(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: '#ffb04a', opacity: 0, toneMapped: false }),
      tronco: new THREE.MeshStandardMaterial({ color: '#8d8478', roughness: 0.9 }),
      folha: new THREE.MeshStandardMaterial({ color: '#4b7d2e', roughness: 0.8, side: THREE.DoubleSide }),
    };
  }, []);
  useEffect(() => () => Object.values(mats).forEach((m) => { (m as THREE.MeshStandardMaterial).map?.dispose(); m.dispose(); }), [mats]);

  // um material por tipo de sinalização presente na cidade (faixas × mão única), criado quando aparece
  const leitoMats = useMemo(() => {
    const m = new Map<string, THREE.MeshStandardMaterial>([['rua', mats.rua], ['avenida', mats.avenida]]);
    const comum = { roughness: 0.92, metalness: 0, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 };
    for (const b of malha) for (const k of Object.keys(b.leitos)) {
      if (m.has(k)) continue;
      const faixas = Number(k.slice(0, -1)), mao = k.endsWith('u');
      m.set(k, comDetalhe(new THREE.MeshStandardMaterial({ ...comum, map: texturaFaixas(faixas, mao) }), 'Asphalt033', 4, 0.85));
    }
    return m;
  }, [malha, mats]);
  useEffect(() => () => { for (const [k, m] of leitoMats) if (k !== 'rua' && k !== 'avenida') { m.map?.dispose(); m.dispose(); } }, [leitoMats]);

  const geos = useMemo(() => {
    const poste = geoPoste();
    const palm = geoPalmeira();
    return {
      ...poste,
      pilar: new THREE.BoxGeometry(1, 1, 1),
      balaustre: new THREE.BoxGeometry(0.08, 1.0, 0.08).translate(0, 0.5, 0),
      zebra: new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      hasteSem: mergeGeos([new THREE.CylinderGeometry(0.07, 0.1, 5.1, 6).translate(0, 2.55, 0), new THREE.BoxGeometry(0.28, 0.9, 0.22).translate(0, 4.9, 0.1)]),
      lampSem: new THREE.BoxGeometry(0.16, 0.16, 0.06).translate(0, 5.1, 0.24),
      halo: new THREE.PlaneGeometry(16, 16).rotateX(-Math.PI / 2),
      ...palm,
    };
  }, []);
  useEffect(() => () => Object.values(geos).forEach((g) => g.dispose()), [geos]);

  const halos = useMemo(() => malha.map((b) => b.postes.map((m) => {
    const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    m.decompose(p, q, s);
    const off = new THREE.Vector3(0, 0, 1.7).applyQuaternion(q);
    return new THREE.Matrix4().makeTranslation(p.x + off.x, p.y + 0.05, p.z + off.z);
  })), [malha]);

  // blocos longe da câmera ficam ocultos (checado a cada ~0,3 s)
  const camera = useThree((st) => st.camera);
  const grupos = useRef<(THREE.Group | null)[]>([]);
  const ultimo = useRef(0);
  useFrame(() => {
    const agora = performance.now();
    if (agora - ultimo.current < 300) return;
    ultimo.current = agora;
    const { x, y, z } = camera.position;
    malha.forEach((b, i) => {
      const g = grupos.current[i];
      if (g) g.visible = Math.hypot(b.cx - x, b.cz - z, Math.max(0, y) * 0.6) < DIST_VIAS;
    });
  });

  const sodio = useMemo(() => new THREE.Color('#ffa63d'), []);
  const led = useMemo(() => new THREE.Color('#e9f1ff'), []);
  useFrame(() => {
    const n = ambiente.noite * (1 - clima.apagao);
    const cor = ambiente.luzSodio ? sodio : led;
    mats.lampada.emissive.copy(cor);
    mats.lampada.emissiveIntensity = n * (ambiente.luzSodio ? 5 : 6);
    mats.halo.color.copy(cor);
    mats.halo.opacity = n * (ambiente.luzSodio ? 0.5 : 0.42);
    mats.halo.visible = n > 0.02;
    uSemTempo.value = trafegoEstado.tempo >= 0 ? trafegoEstado.tempo : ambiente.tempo;
  });

  return (
    <group>
      {malha.map((b, i) => (
        <group key={b.chave} ref={(g) => { grupos.current[i] = g; }} visible={false}>
          {Object.entries(b.leitos).map(([k, geo]) => <mesh key={k} geometry={geo} material={leitoMats.get(k)} receiveShadow />)}
          <mesh geometry={b.calcadas} material={mats.calcada} receiveShadow />
          <mesh geometry={b.calcadoes} material={mats.calcadao} receiveShadow />
          <mesh geometry={b.laterais} material={mats.lateral} receiveShadow castShadow />
          <mesh geometry={b.cruzamentos} material={mats.cruz} receiveShadow />
          <mesh geometry={b.muros} material={mats.muro} receiveShadow castShadow />
          <mesh geometry={b.banquetas} material={mats.grama} receiveShadow />
          <mesh geometry={b.guardas} material={mats.guarda} />
          <mesh geometry={b.ilhas} material={mats.ilha} receiveShadow />
          <Instancias matrizes={b.balaustres} geometria={geos.balaustre} material={mats.guarda} sombra={false} />
          <Instancias matrizes={b.portais} geometria={geos.pilar} material={mats.muro} />
          <Instancias matrizes={b.postes} geometria={geos.haste} material={mats.poste} />
          <Instancias matrizes={b.postes} geometria={geos.lampada} material={mats.lampada} sombra={false} />
          <Instancias matrizes={halos[i]} geometria={geos.halo} material={mats.halo} sombra={false} />
          <Instancias matrizes={b.pilares} geometria={geos.pilar} material={mats.pilar} />
          <Instancias matrizes={b.zebras} geometria={geos.zebra} material={mats.zebra} sombra={false} />
          <Instancias matrizes={b.hastesSem} geometria={geos.hasteSem} material={mats.poste} />
          <LampadasSemaforo itens={b.lampSem} geo={geos.lampSem} mat={mats.lampSem} />
          <Instancias matrizes={b.palmeiras} geometria={geos.tronco} material={mats.tronco} />
          <Instancias matrizes={b.palmeiras} geometria={geos.copa} material={mats.folha} />
        </group>
      ))}
    </group>
  );
}
