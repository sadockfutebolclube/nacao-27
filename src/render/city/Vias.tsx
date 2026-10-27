/**
 * Malha das vias: leito com sinalização, meio-fio, calçadas (pedra portuguesa nas avenidas),
 * talude/lateral de ponte, cruzamentos, pilares, postes com luz de sódio ou LED e palmeiras
 * no canteiro central das avenidas.
 */
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { mundo, useGame } from '../../sim/bridge';
import { ROAD_SPECS, type RoadType } from '../../world/roads';
import { roadBaseY, sampleHeight, type Heightmap } from '../../world/terrain';
import { ambiente } from './ambiente';
import { clima } from './climaVisual';
import { construirPerfis, type Perfil } from './perfilVias';
import { texturaAvenida, texturaCalcada, texturaCalcadao, texturaHalo, texturaRua } from './texturas';

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

interface MalhaVias {
  leitos: Record<RoadType, THREE.BufferGeometry>;
  calcadas: THREE.BufferGeometry;
  calcadoes: THREE.BufferGeometry;
  laterais: THREE.BufferGeometry;
  cruzamentos: THREE.BufferGeometry;
  postes: THREE.Matrix4[];
  pilares: THREE.Matrix4[];
  palmeiras: THREE.Matrix4[];
}

function construir(hm: Heightmap): MalhaVias {
  const g = mundo.roads;
  const perfis = construirPerfis(g, hm);
  perfisAtuais = perfis;
  const leitos: Record<RoadType, Buffers> = { rua: novo(), avenida: novo() };
  const calc = novo(), calcadao = novo(), lat = novo(), cruz = novo();
  const postes: THREE.Matrix4[] = [], pilares: THREE.Matrix4[] = [], palmeiras: THREE.Matrix4[] = [];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pos = new THREE.Vector3();
  const eixoY = new THREE.Vector3(0, 1, 0);

  for (const p of perfis.values()) {
    const spec = ROAD_SPECS[p.edge.type];
    const hw = spec.width / 2, sw = spec.sidewalk;
    const i0 = indiceDoCorte(p, p.cortaA, false), i1 = indiceDoCorte(p, p.cortaB, true);
    if (i1 - i0 < 1) continue;
    faixa(leitos[p.edge.type], p, i0, i1, -hw, hw, 0.02, 0.02, 0, 1, p.edge.type === 'avenida' ? 20 : 10);
    const destino = p.edge.type === 'avenida' ? calcadao : calc;
    const escalaV = p.edge.type === 'avenida' ? 8 : 4;
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
    // palmeiras imperiais no canteiro da avenida
    if (p.edge.type === 'avenida') {
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

  // cruzamentos e emendas
  for (const n of g.nodes.values()) {
    let grau = 0, hwMax = 0, swMax = 0;
    for (const e of g.edges.values()) if (e.a === n.id || e.b === n.id) {
      grau++;
      hwMax = Math.max(hwMax, ROAD_SPECS[e.type].width / 2);
      swMax = Math.max(swMax, ROAD_SPECS[e.type].sidewalk);
    }
    if (!grau) continue;
    const y = roadBaseY(hm, n.x, n.z);
    if (grau >= 3) {
      disco(calc, n.x, y + 0.16, n.z, hwMax + 1.5 + swMax, 28);
      disco(cruz, n.x, y + 0.19, n.z, hwMax + 1.5, 28);
    } else {
      disco(cruz, n.x, y + 0.03, n.z, hwMax, 20);
    }
  }

  return {
    leitos: { rua: geometria(leitos.rua), avenida: geometria(leitos.avenida) },
    calcadas: geometria(calc), calcadoes: geometria(calcadao), laterais: geometria(lat), cruzamentos: geometria(cruz),
    postes, pilares, palmeiras,
  };
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
  return <instancedMesh key={cap} ref={ref} args={[geometria, material, cap]} castShadow={sombra} receiveShadow frustumCulled={false} />;
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
  const malha = useMemo(() => construir(hm), [hm, versao]);
  useEffect(() => () => {
    Object.values(malha.leitos).forEach((g) => g.dispose());
    malha.calcadas.dispose(); malha.calcadoes.dispose(); malha.laterais.dispose(); malha.cruzamentos.dispose();
  }, [malha]);

  const mats = useMemo(() => {
    const comum = { roughness: 0.92, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 };
    return {
      rua: new THREE.MeshStandardMaterial({ ...comum, map: texturaRua() }),
      avenida: new THREE.MeshStandardMaterial({ ...comum, map: texturaAvenida() }),
      calcada: new THREE.MeshStandardMaterial({ ...comum, map: texturaCalcada(), roughness: 0.85 }),
      calcadao: new THREE.MeshStandardMaterial({ ...comum, map: texturaCalcadao(), roughness: 0.7 }),
      lateral: new THREE.MeshStandardMaterial({ color: '#9b958a', roughness: 0.95 }),
      cruz: new THREE.MeshStandardMaterial({ ...comum, color: '#3e4042', roughness: 0.9 }),
      poste: new THREE.MeshStandardMaterial({ color: '#5d6266', roughness: 0.6, metalness: 0.4 }),
      lampada: new THREE.MeshStandardMaterial({ color: '#2b2b2b', emissive: new THREE.Color('#ffb04a'), emissiveIntensity: 0 }),
      pilar: new THREE.MeshStandardMaterial({ color: '#a8a39a', roughness: 0.9 }),
      halo: new THREE.MeshBasicMaterial({ map: texturaHalo(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: '#ffb04a', opacity: 0, toneMapped: false }),
      tronco: new THREE.MeshStandardMaterial({ color: '#8d8478', roughness: 0.9 }),
      folha: new THREE.MeshStandardMaterial({ color: '#4b7d2e', roughness: 0.8, side: THREE.DoubleSide }),
    };
  }, []);
  useEffect(() => () => Object.values(mats).forEach((m) => { (m as THREE.MeshStandardMaterial).map?.dispose(); m.dispose(); }), [mats]);

  const geos = useMemo(() => {
    const poste = geoPoste();
    const palm = geoPalmeira();
    return {
      ...poste,
      pilar: new THREE.BoxGeometry(1, 1, 1),
      halo: new THREE.PlaneGeometry(16, 16).rotateX(-Math.PI / 2),
      ...palm,
    };
  }, []);
  useEffect(() => () => Object.values(geos).forEach((g) => g.dispose()), [geos]);

  const halos = useMemo(() => malha.postes.map((m) => {
    const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    m.decompose(p, q, s);
    const off = new THREE.Vector3(0, 0, 1.7).applyQuaternion(q);
    return new THREE.Matrix4().makeTranslation(p.x + off.x, p.y + 0.05, p.z + off.z);
  }), [malha]);

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
  });

  return (
    <group>
      <mesh geometry={malha.leitos.rua} material={mats.rua} receiveShadow />
      <mesh geometry={malha.leitos.avenida} material={mats.avenida} receiveShadow />
      <mesh geometry={malha.calcadas} material={mats.calcada} receiveShadow />
      <mesh geometry={malha.calcadoes} material={mats.calcadao} receiveShadow />
      <mesh geometry={malha.laterais} material={mats.lateral} receiveShadow castShadow />
      <mesh geometry={malha.cruzamentos} material={mats.cruz} receiveShadow />
      <Instancias matrizes={malha.postes} geometria={geos.haste} material={mats.poste} />
      <Instancias matrizes={malha.postes} geometria={geos.lampada} material={mats.lampada} sombra={false} />
      <Instancias matrizes={halos} geometria={geos.halo} material={mats.halo} sombra={false} />
      <Instancias matrizes={malha.pilares} geometria={geos.pilar} material={mats.pilar} />
      <Instancias matrizes={malha.palmeiras} geometria={geos.tronco} material={mats.tronco} />
      <Instancias matrizes={malha.palmeiras} geometria={geos.copa} material={mats.folha} />
    </group>
  );
}
