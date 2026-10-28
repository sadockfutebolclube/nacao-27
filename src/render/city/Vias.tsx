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
import { ambiente } from './ambiente';
import { clima } from './climaVisual';
import { amostrarPerfil, construirPerfis, type Perfil } from './perfilVias';
import { texturaAvenida, texturaCalcada, texturaCalcadao, texturaFaixas, texturaHalo, texturaRua, texturaZebra } from './texturas';
import { comDetalhe } from '../materiais/detalhe';

export let perfisAtuais: Map<number, Perfil> = new Map();

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

function disco(b: Buffers, x: number, y: number, z: number, r: number, seg = 20) {
  const base = b.pos.length / 3;
  b.pos.push(x, y, z); b.nor.push(0, 1, 0); b.uv.push(0.5, 0.5);
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    b.pos.push(x + Math.cos(a) * r, y, z + Math.sin(a) * r);
    b.nor.push(0, 1, 0);
    b.uv.push(0.5, 0.5);
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
  postes: THREE.Matrix4[];
  pilares: THREE.Matrix4[];
  palmeiras: THREE.Matrix4[];
  /** faixas de pedestre (zebra), hastes e lâmpadas dos semáforos (eixo 0/1 define a fase) */
  zebras: THREE.Matrix4[];
  hastesSem: THREE.Matrix4[];
  lampSem: { m: THREE.Matrix4; eixo: number }[];
}
type MalhaVias = MalhaBloco[];

/** Fase do semáforo (Fase 14): ciclo de 40 s; cada eixo tem 16 s de verde, 4 de amarelo e 20 de vermelho, defasados em 20 s. */
export const CICLO_SEM = 40;
/** eixo da aproximação pela direção (a rua que cruza tem o outro eixo) */
export const eixoSemaforo = (tx: number, tz: number) => (Math.abs(tx) > Math.abs(tz) ? 0 : 1);
/** 0 verde, 1 amarelo, 2 vermelho */
export function faseSemaforo(eixo: number, t: number): 0 | 1 | 2 {
  const u = (t + eixo * (CICLO_SEM / 2)) % CICLO_SEM;
  return u < 16 ? 0 : u < 20 ? 1 : 2;
}

interface Acum { leitos: Record<string, Buffers>; calc: Buffers; calcadao: Buffers; lat: Buffers; cruz: Buffers; postes: THREE.Matrix4[]; pilares: THREE.Matrix4[]; palmeiras: THREE.Matrix4[]; zebras: THREE.Matrix4[]; hastesSem: THREE.Matrix4[]; lampSem: { m: THREE.Matrix4; eixo: number }[] }
const novoAcum = (): Acum => ({ leitos: {}, calc: novo(), calcadao: novo(), lat: novo(), cruz: novo(), postes: [], pilares: [], palmeiras: [], zebras: [], hastesSem: [], lampSem: [] });

export function construir(hm: Heightmap): MalhaVias {
  const g = mundo.roads;
  const perfis = construirPerfis(g, hm);
  perfisAtuais = perfis;
  const blocos = new Map<string, Acum>();
  const bloco = (x: number, z: number) => {
    const k = `${Math.floor(x / BLOCO_VIAS)},${Math.floor(z / BLOCO_VIAS)}`;
    return blocos.get(k) ?? blocos.set(k, novoAcum()).get(k)!;
  };
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pos = new THREE.Vector3();
  const eixoY = new THREE.Vector3(0, 1, 0);

  for (const p of perfis.values()) {
    const meio = p.n >> 1;
    const { leitos, calc, calcadao, lat, postes, pilares, palmeiras } = bloco(p.x[meio], p.z[meio]);
    const hw = larguraVia(p.edge) / 2, sw = calcadaVia(p.edge);
    const i0 = indiceDoCorte(p, p.cortaA, false), i1 = indiceDoCorte(p, p.cortaB, true);
    if (i1 - i0 < 1) continue;
    const chave = chaveLeito(p.edge);
    faixa(leitos[chave] ??= novo(), p, i0, i1, -hw, hw, 0.02, 0.02, 0, 1, p.edge.faixas === undefined ? (p.edge.type === 'avenida' ? 20 : 10) : 16);
    // túnel: só o leito (escondido sob o morro, aparece nos portais); sem calçada, poste nem canteiro
    if (p.edge.nivel === -1) continue;
    // pedra portuguesa: avenidas do jogador e, nas reais, só perto do mar (os calçadões da orla)
    const calcadaoAqui = p.edge.type === 'avenida' && (p.edge.faixas === undefined || sampleWaterDist(hm, p.x[meio], p.z[meio]) < 320);
    const destino = calcadaoAqui ? calcadao : calc;
    const escalaV = calcadaoAqui ? 8 : 4;
    for (const lado of [-1, 1]) {
      const dIn = lado * hw, dOut = lado * (hw + sw);
      // (a ordem dos argumentos garante faces voltadas para fora em ambos os lados)
      // meio-fio (face vertical voltada para o leito) e calçada elevada
      if (lado > 0) faixa(lat, p, i0, i1, dIn, dIn, 0.02, 0.17, 0, 0, 1, -lado);
      else faixa(lat, p, i0, i1, dIn, dIn, 0.17, 0.02, 0, 0, 1, -lado);
      if (lado > 0) faixa(destino, p, i0, i1, dIn, dOut, 0.17, 0.17, 0, 1, escalaV);
      else faixa(destino, p, i0, i1, dOut, dIn, 0.17, 0.17, 0, 1, escalaV);
      // talude / lateral da ponte até abaixo do chão (face voltada para fora)
      if (lado > 0) faixa(lat, p, i0, i1, dOut, dOut, 0.17, -2.2, 0, 0, 1, lado);
      else faixa(lat, p, i0, i1, dOut, dOut, -2.2, 0.17, 0, 0, 1, lado);
    }
    // postes
    const passo = 30;
    const offPoste = hw + sw - 0.6;
    let lado = 1;
    for (let s = Math.max(p.cortaA + 4, 8); s < p.comprimento - Math.max(p.cortaB + 4, 8); s += passo / (p.edge.type === 'avenida' ? 1.5 : 1)) {
      const f = (s / p.comprimento) * (p.n - 1);
      const i = Math.min(p.n - 1, Math.round(f));
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
    // pilares de ponte/viaduto
    for (let s = 12; s < p.comprimento - 12; s += 24) {
      const i = Math.min(p.n - 1, Math.round((s / p.comprimento) * (p.n - 1)));
      const chao = Math.min(sampleHeight(hm, p.x[i], p.z[i]), p.y[i]);
      const vao = p.y[i] - chao;
      if (vao > 3.5) {
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
    if (grau >= 3) {
      disco(calc, n.x, y + 0.16, n.z, hwMax + 1.5 + swMax, 28);
      disco(cruz, n.x, y + 0.19, n.z, hwMax + 1.5, 28);
    } else {
      disco(cruz, n.x, y + 0.03, n.z, hwMax, 20);
    }
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
      if (!p || e.nivel) continue;
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

  return [...blocos].map(([chave, b]) => {
    const [bx, bz] = chave.split(',').map(Number);
    return {
      chave, cx: (bx + 0.5) * BLOCO_VIAS, cz: (bz + 0.5) * BLOCO_VIAS,
      leitos: Object.fromEntries(Object.entries(b.leitos).map(([k, v]) => [k, geometria(v)])),
      calcadas: geometria(b.calc), calcadoes: geometria(b.calcadao), laterais: geometria(b.lat), cruzamentos: geometria(b.cruz),
      postes: b.postes, pilares: b.pilares, palmeiras: b.palmeiras, zebras: b.zebras, hastesSem: b.hastesSem, lampSem: b.lampSem,
    };
  });
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

/** Tempo do semáforo (compartilhado com os carros): ambiente.tempo em segundos. */
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
      b.calcadas.dispose(); b.calcadoes.dispose(); b.laterais.dispose(); b.cruzamentos.dispose();
    }
  }, [malha]);

  const mats = useMemo(() => {
    const comum = { roughness: 0.92, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 };
    return {
      // Fase 12: asfalto e calçada fotográficos (ambientCG) por cima das faixas pintadas
      rua: comDetalhe(new THREE.MeshStandardMaterial({ ...comum, map: texturaRua() }), 'Asphalt033', 4, 0.85),
      avenida: comDetalhe(new THREE.MeshStandardMaterial({ ...comum, map: texturaAvenida() }), 'Asphalt033', 4, 0.85),
      calcada: comDetalhe(new THREE.MeshStandardMaterial({ ...comum, map: texturaCalcada(), roughness: 0.85 }), 'PavingStones046', 2.4, 0.75),
      calcadao: new THREE.MeshStandardMaterial({ ...comum, map: texturaCalcadao(), roughness: 0.7 }),
      lateral: new THREE.MeshStandardMaterial({ color: '#9b958a', roughness: 0.95 }),
      cruz: comDetalhe(new THREE.MeshStandardMaterial({ ...comum, color: '#3e4042', roughness: 0.9 }), 'Asphalt033', 4, 0.85),
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
    const comum = { roughness: 0.92, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 };
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
    uSemTempo.value = ambiente.tempo;
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
