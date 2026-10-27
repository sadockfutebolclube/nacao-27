/**
 * Vegetação instanciada: mata nativa pelo mapa de densidade do terreno, ipês que florescem
 * amarelo/roxo entre julho e setembro, coqueiros na orla. Árvores somem sob vias e lotes ocupados.
 * Fase 8: cada bioma tem sua flora — mata alta e densa na Amazônia, árvores baixas e tortas no Cerrado,
 * mandacarus e arbustos ralos na Caatinga, capões esparsos no Pampa, carandás no Pantanal.
 */
import { medir } from '../medir';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Rng } from '../../sim/core/rng';
import { mundo, useGame } from '../../sim/bridge';
import { LOT_STATE_STRIDE } from '../../sim/protocol';
import { BUILD_HALF, MAP_SIZE } from '../../world/constants';
import { LOT_STRIDE } from '../../world/lots';
import { halfRoad, sampleByLength, edgeEnds } from '../../world/roads';
import { sampleForest, sampleHeight, sampleSlope, sampleWaterDist, type Heightmap } from '../../world/terrain';
import { geoPalmeira, mergeGeos } from './Vias';

// Fase 13: o Rio tem 150 km² (com a Floresta da Tijuca); a amostragem é mais espaçada e o teto maior
const MAX_ARVORES = 120_000;
const GRADE = 4; // grade de ocupação (m)
const RES = (BUILD_HALF * 2) / GRADE;

interface Arvore { x: number; y: number; z: number; s: number; sy: number; tipo: 0 | 1 | 2 | 3; cor: number; rot: number }

/** Flora por bioma: densidade, altura e largura das copas, palmeiras, cactos e ipês. */
const FLORA: Record<string, { dens: number; alt: number; larg: number; palmeira: number; cacto: number; ipe: number }> = {
  'mata-atlantica': { dens: 1, alt: 1, larg: 1, palmeira: 0.015, cacto: 0, ipe: 0.035 },
  amazonia: { dens: 1.25, alt: 1.45, larg: 1.15, palmeira: 0.06, cacto: 0, ipe: 0.012 },
  cerrado: { dens: 0.55, alt: 0.62, larg: 1.15, palmeira: 0.03, cacto: 0, ipe: 0.07 },
  caatinga: { dens: 0.68, alt: 0.5, larg: 0.75, palmeira: 0.01, cacto: 0.2, ipe: 0.02 },
  pampa: { dens: 0.28, alt: 1, larg: 0.95, palmeira: 0, cacto: 0, ipe: 0.01 },
  pantanal: { dens: 0.6, alt: 0.9, larg: 1.2, palmeira: 0.2, cacto: 0, ipe: 0.05 },
};

const COPAS: Record<string, string[]> = {
  'mata-atlantica': ['#2f5d26', '#3b6b2a', '#284f22', '#456f2c', '#355f2a'],
  amazonia: ['#1f4d1c', '#2a5a21', '#244f1e', '#356426'],
  cerrado: ['#5d6b2d', '#6f7a34', '#4f5f2a', '#7a7d3a'],
  caatinga: ['#7b7a4d', '#8a875a', '#6c6c45', '#9a9466'],
  pampa: ['#3e6c2b', '#4a7a33', '#36602a'],
  pantanal: ['#3e6b2b', '#4b7a33', '#2f5c25'],
};

function gerar(hm: Heightmap): Arvore[] {
  const rng = new Rng(hm.seed ^ 0xa11ce);
  const F = FLORA[hm.bioma] ?? FLORA['mata-atlantica'];
  const out: Arvore[] = [];
  const half = MAP_SIZE / 2 - 40;
  // primeiro a área do município (densa), depois a moldura de paisagem (mais esparsa, copas maiores)
  const passes: { passo: number; escala: number; dentro: boolean }[] = [
    { passo: 18, escala: 1.25, dentro: true },
    { passo: 30, escala: 1.8, dentro: false },
  ];
  for (const ps of passes) {
  const passo = ps.passo;
  for (let z = -half; z < half && out.length < MAX_ARVORES; z += passo) {
    for (let x = -half; x < half && out.length < MAX_ARVORES; x += passo) {
      const naArea = Math.abs(x) < BUILD_HALF && Math.abs(z) < BUILD_HALF;
      if (naArea !== ps.dentro) continue;
      const px = x + rng.range(-passo * 0.45, passo * 0.45), pz = z + rng.range(-passo * 0.45, passo * 0.45);
      const h = sampleHeight(hm, px, pz);
      if (h < 1.3) continue;
      const wd = sampleWaterDist(hm, px, pz);
      // coqueiros na faixa de praia
      if (wd < 90 && h < 6 && rng.chance(0.18)) {
        out.push({ x: px, y: h, z: pz, s: rng.range(0.8, 1.15), sy: 1, tipo: 2, cor: 0, rot: rng.range(0, 6.28) });
        continue;
      }
      const dens = sampleForest(hm, px, pz);
      // longe do centro a mata é mais rarefeita na renderização (névoa esconde), perto é cheia
      if (!rng.chance(Math.min(1, dens * dens * 1.15 * F.dens))) continue;
      if (sampleSlope(hm, px, pz) > 1.3) continue;
      const r = rng.next();
      if (r < F.cacto) { out.push({ x: px, y: h, z: pz, s: rng.range(0.7, 1.3), sy: 1, tipo: 3, cor: 0, rot: rng.range(0, 6.28) }); continue; }
      if (r < F.cacto + F.palmeira) { out.push({ x: px, y: h, z: pz, s: rng.range(0.8, 1.2), sy: 1, tipo: 2, cor: 0, rot: rng.range(0, 6.28) }); continue; }
      const ipe = rng.chance(F.ipe);
      const sc = rng.range(0.75, 1.35) * (ipe ? 0.9 : 1) * ps.escala;
      out.push({ x: px, y: h, z: pz, s: sc * F.larg, sy: sc * F.alt, tipo: ipe ? 1 : 0, cor: rng.int(0, 9), rot: rng.range(0, 6.28) });
    }
  }
  }
  return out;
}

/** Grade de bloqueio (-1 via, i+1 lote) para esconder árvores sob a cidade. */
function gradeOcupacao(): Int32Array {
  const g = new Int32Array(RES * RES);
  const marca = (x: number, z: number, v: number) => {
    const i = Math.floor((x + BUILD_HALF) / GRADE), j = Math.floor((z + BUILD_HALF) / GRADE);
    if (i >= 0 && j >= 0 && i < RES && j < RES && g[j * RES + i] !== -1) g[j * RES + i] = v;
  };
  const L = mundo.lots;
  const n = L.length / LOT_STRIDE;
  for (let k = 0; k < n; k++) {
    const o = k * LOT_STRIDE;
    const x = L[o], z = L[o + 1], ang = L[o + 2], w = L[o + 3], d = L[o + 4];
    const c = Math.cos(ang), s = Math.sin(ang);
    for (let lz = -d / 2; lz <= d / 2; lz += GRADE * 0.7) for (let lx = -w / 2; lx <= w / 2; lx += GRADE * 0.7) {
      marca(x + c * lx + s * lz, z - s * lx + c * lz, k + 1);
    }
  }
  const G = mundo.roads;
  for (const e of G.edges.values()) {
    const [p0, cc, p1] = edgeEnds(G, e);
    const hw = halfRoad(e.type) + 2;
    const { pts } = sampleByLength(p0, cc, p1, GRADE * 0.7);
    for (const p of pts) {
      for (let off = -hw; off <= hw; off += GRADE * 0.7) {
        const i = Math.floor((p.x - p.tz * off + BUILD_HALF) / GRADE), j = Math.floor((p.z + p.tx * off + BUILD_HALF) / GRADE);
        if (i >= 0 && j >= 0 && i < RES && j < RES) g[j * RES + i] = -1;
      }
    }
  }
  for (const s of mundo.services) {
    for (let dz = -30; dz <= 30; dz += GRADE) for (let dx = -30; dx <= 30; dx += GRADE) {
      const i = Math.floor((s.x + dx + BUILD_HALF) / GRADE), j = Math.floor((s.z + dz + BUILD_HALF) / GRADE);
      if (i >= 0 && j >= 0 && i < RES && j < RES) g[j * RES + i] = -1;
    }
  }
  return g;
}

export function Arvores({ hm }: { hm: Heightmap }) {
  const wv = useGame((s) => s.worldVersion);
  const sv = useGame((s) => s.stateVersion);
  const mes = useGame((s) => s.stats?.mes ?? 1);
  const arvores = useMemo(() => medir('árvores: gerar', () => gerar(hm)), [hm]);
  const refs = { tronco: useRef<THREE.InstancedMesh>(null), copa: useRef<THREE.InstancedMesh>(null), ptronco: useRef<THREE.InstancedMesh>(null), pcopa: useRef<THREE.InstancedMesh>(null), cacto: useRef<THREE.InstancedMesh>(null) };

  const geos = useMemo(() => {
    const tronco = new THREE.CylinderGeometry(0.22, 0.35, 4, 5).translate(0, 2, 0);
    const c1 = new THREE.IcosahedronGeometry(3.2, 0).scale(1, 0.8, 1).translate(0, 5.6, 0);
    const c2 = new THREE.IcosahedronGeometry(2.2, 0).translate(1.4, 6.8, 0.6);
    const copa = mergeGeos([c1, c2]);
    copa.computeVertexNormals();
    const palm = geoPalmeira();
    // mandacaru: tronco com braços em candelabro
    const cacto = mergeGeos([
      new THREE.CylinderGeometry(0.32, 0.4, 5, 7).translate(0, 2.5, 0),
      new THREE.CylinderGeometry(0.22, 0.25, 1.4, 6).rotateZ(Math.PI / 2).translate(0.75, 2.2, 0),
      new THREE.CylinderGeometry(0.22, 0.24, 2.2, 6).translate(1.4, 3.2, 0),
      new THREE.CylinderGeometry(0.2, 0.22, 1.2, 6).rotateZ(Math.PI / 2).translate(-0.65, 2.9, 0),
      new THREE.CylinderGeometry(0.2, 0.22, 1.8, 6).translate(-1.2, 3.7, 0),
    ]);
    return { tronco, copa, ptronco: palm.tronco.clone().scale(0.75, 0.85, 0.75), pcopa: palm.copa.clone().scale(0.8, 0.85, 0.8), cacto };
  }, []);
  const mats = useMemo(() => ({
    tronco: new THREE.MeshStandardMaterial({ color: '#5a4632', roughness: 0.95 }),
    copa: new THREE.MeshStandardMaterial({ roughness: 0.85, flatShading: true }),
    pcopa: new THREE.MeshStandardMaterial({ color: '#5a8a33', roughness: 0.8, side: THREE.DoubleSide }),
    ptronco: new THREE.MeshStandardMaterial({ color: '#8c7d68', roughness: 0.9 }),
    cacto: new THREE.MeshStandardMaterial({ color: '#4f7a4a', roughness: 0.7, flatShading: true }),
  }), []);
  useEffect(() => () => { Object.values(geos).forEach((g) => g.dispose()); Object.values(mats).forEach((m) => m.dispose()); }, [geos, mats]);

  const ocupacao = useMemo(() => medir('árvores: ocupação', gradeOcupacao), [wv]);

  const assinatura = useRef('');
  useLayoutEffect(() => {
    const S = mundo.lotState;
    // só refaz quando muda o conjunto de lotes ocupados (não a cada tick)
    let h = 0;
    for (let o = 0, i = 1; o < S.length; o += LOT_STATE_STRIDE, i++) if (S[o] || S[o + 1]) h = (h * 31 + i) | 0;
    const chave = `${h}:${ocupacao.length}:${wv}:${mes >= 7 && mes <= 9}`;
    if (chave === assinatura.current) return;
    assinatura.current = chave;
    const florada = mes >= 7 && mes <= 9;
    const paleta = COPAS[hm.bioma] ?? COPAS['mata-atlantica'];
    const coresCopa = paleta.map((c) => new THREE.Color(c));
    const amarelo = new THREE.Color('#f2c230'), roxo = new THREE.Color('#b05cc0'), ipeVerde = new THREE.Color('#4f7a2f');
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
    const eixo = new THREE.Vector3(0, 1, 0);
    let nA = 0, nP = 0, nC = 0;
    const tr = refs.tronco.current!, cp = refs.copa.current!, pt = refs.ptronco.current!, pc = refs.pcopa.current!, ct = refs.cacto.current!;
    if (!tr || !cp || !pt || !pc || !ct) return;
    for (const a of arvores) {
      if (Math.abs(a.x) < BUILD_HALF && Math.abs(a.z) < BUILD_HALF) {
        const i = Math.floor((a.x + BUILD_HALF) / GRADE), j = Math.floor((a.z + BUILD_HALF) / GRADE);
        const v = ocupacao[j * RES + i];
        if (v === -1) continue;
        if (v > 0) {
          const o = (v - 1) * LOT_STATE_STRIDE;
          if (o < S.length && (S[o] || S[o + 1])) continue;
        }
      }
      q.setFromAxisAngle(eixo, a.rot);
      p.set(a.x, a.y - 0.3, a.z);
      m.compose(p, q, s.set(a.s, a.sy, a.s));
      if (a.tipo === 3) { ct.setMatrixAt(nC, m); nC++; } else if (a.tipo === 2) {
        pt.setMatrixAt(nP, m); pc.setMatrixAt(nP, m); nP++;
      } else {
        tr.setMatrixAt(nA, m); cp.setMatrixAt(nA, m);
        const c = a.tipo === 1 ? (florada ? (a.cor % 2 ? amarelo : roxo) : ipeVerde) : coresCopa[a.cor % coresCopa.length];
        cp.setColorAt(nA, c);
        nA++;
      }
    }
    tr.count = nA; cp.count = nA; pt.count = nP; pc.count = nP; ct.count = nC;
    for (const im of [tr, cp, pt, pc, ct]) {
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.computeBoundingSphere();
    }
  }, [arvores, ocupacao, sv, wv, mes, hm.bioma]);

  return (
    <group>
      <instancedMesh ref={refs.tronco} args={[geos.tronco, mats.tronco, MAX_ARVORES]} castShadow frustumCulled={false} />
      <instancedMesh ref={refs.copa} args={[geos.copa, mats.copa, MAX_ARVORES]} castShadow receiveShadow frustumCulled={false} />
      <instancedMesh ref={refs.ptronco} args={[geos.ptronco, mats.ptronco, MAX_ARVORES / 4]} castShadow frustumCulled={false} />
      <instancedMesh ref={refs.pcopa} args={[geos.pcopa, mats.pcopa, MAX_ARVORES / 4]} castShadow frustumCulled={false} />
      <instancedMesh ref={refs.cacto} args={[geos.cacto, mats.cacto, MAX_ARVORES / 4]} castShadow frustumCulled={false} />
    </group>
  );
}
