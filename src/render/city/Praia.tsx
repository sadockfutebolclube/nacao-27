/**
 * Gente na areia (Fase 16): banhistas deitados em toalhas, de pé, guarda-sóis coloridos e ambulantes com
 * a caixa de isopor. Só perto da câmera e só onde o relevo é praia (areia seca perto da água). A lotação
 * segue o calor, o horário, a chuva e o fim de semana: praia cheia num sábado de verão ao meio-dia,
 * vazia na chuva e à noite.
 */
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { sampleHeight, sampleWaterDist, type Heightmap } from '../../world/terrain';
import { alvoCamera } from './Camera';
import { contextoTurismo } from './turismoEstado';
import { ocupado } from './ocupacaoSolo';

const RAIO = 380;
const MAX = 1400;
const PELES = ['#f1c9a5', '#e0ac82', '#c68a5c', '#a96b43', '#7a4a2d', '#4f2f1c', '#f5d6b8'].map((c) => new THREE.Color(c));
const TOALHAS = ['#e63946', '#f4a261', '#2a9d8f', '#118ab2', '#ffd166', '#ef476f', '#ffffff', '#06d6a0', '#9b5de5', '#f15bb5'].map((c) => new THREE.Color(c));
export const SOIS = ['#e63946', '#ffd166', '#118ab2', '#06d6a0', '#f4a261', '#ffffff', '#ef476f', '#9b5de5'].map((c) => new THREE.Color(c));

const hash = (i: number, j: number, k: number) => { const s = Math.sin(i * 127.1 + j * 311.7 + k * 74.7) * 43758.5453; return s - Math.floor(s); };

/** Lotação da praia, 0–1, pelo dia e pelo tempo. */
export function lotacaoPraia(hora: number, chuva: number, temp: number, diaSemana: number): number {
  if (hora < 7.5 || hora > 17.5) return 0;
  const sol = Math.sin(((hora - 7.5) / 10) * Math.PI);
  const calor = Math.min(1, Math.max(0, (temp - 21) / 9));
  const folga = diaSemana === 0 || diaSemana === 6 ? 1 : 0.45;
  return Math.max(0, sol * calor * folga * (1 - Math.min(1, chuva * 2.2)));
}

interface Item { x: number; y: number; z: number; rot: number; cor: number; pele: number; quem: number }

/** Fase 31: os guarda-sóis do grupo não são mais cones aqui — Orla.tsx os desenha com o modelo 3D (guarda-sol e cadeiras) nestes lugares. */
export const estadoPraia: { lot: number; sois: Item[] } = { lot: 0, sois: [] };

/** Candidatos fixos numa grade em volta de (cx, cz): areia seca a até 70 m da água, mais gente perto do mar. */
function candidatos(hm: Heightmap, cx: number, cz: number): Item[] {
  const out: Item[] = [];
  const passo = 3.2;
  const i0 = Math.floor((cx - RAIO) / passo), i1 = Math.ceil((cx + RAIO) / passo);
  const j0 = Math.floor((cz - RAIO) / passo), j1 = Math.ceil((cz + RAIO) / passo);
  for (let j = j0; j <= j1 && out.length < MAX * 3; j++) for (let i = i0; i <= i1 && out.length < MAX * 3; i++) {
    const x = i * passo + (hash(i, j, 1) - 0.5) * passo * 0.8, z = j * passo + (hash(i, j, 2) - 0.5) * passo * 0.8;
    const y = sampleHeight(hm, x, z);
    if (y < 0.55 || y > 4.2) continue;
    if (ocupado(x, z, 2)) continue;
    const wd = sampleWaterDist(hm, x, z);
    if (wd > 70) continue;
    // densidade: alta na beira (faixa de areia firme) e cai com a distância da água
    const dens = 0.42 * Math.exp(-wd / 38);
    if (hash(i, j, 3) > dens) continue;
    out.push({ x, y, z, rot: hash(i, j, 4) * Math.PI * 2, cor: Math.floor(hash(i, j, 5) * 1000), pele: Math.floor(hash(i, j, 6) * 1000), quem: hash(i, j, 7) });
  }
  return out;
}

export function Praia({ hm }: { hm: Heightmap }) {
  const refs = { toalha: useRef<THREE.InstancedMesh>(null), corpo: useRef<THREE.InstancedMesh>(null), sol: useRef<THREE.InstancedMesh>(null), pe: useRef<THREE.InstancedMesh>(null), isopor: useRef<THREE.InstancedMesh>(null) };
  const geos = useMemo(() => ({
    toalha: new THREE.BoxGeometry(0.95, 0.025, 1.9).translate(0, 0.0125, 0),
    // corpo deitado: tronco + cabeça (a cor da instância é o tom de pele; o maiô vem do tronco fixo escuro não: fica a pele)
    corpo: (() => { const g = new THREE.BoxGeometry(0.36, 0.2, 1.05).translate(0, 0.13, 0.1); const cab = new THREE.SphereGeometry(0.13, 8, 6).translate(0, 0.15, -0.55); const pern = new THREE.BoxGeometry(0.3, 0.14, 0.7).translate(0, 0.1, 0.9); return mergeSimples([g, cab, pern]); })(),
    sol: (() => { const mastro = new THREE.CylinderGeometry(0.02, 0.025, 2.1, 5).translate(0, 1.05, 0); const copa = new THREE.ConeGeometry(1.05, 0.38, 10).translate(0, 2.15, 0); return mergeSimples([mastro, copa]); })(),
    pe: (() => { const t = new THREE.CylinderGeometry(0.16, 0.19, 0.75, 7).translate(0, 1.0, 0); const p = new THREE.CylinderGeometry(0.1, 0.12, 0.7, 6).translate(0, 0.37, 0); const c = new THREE.SphereGeometry(0.13, 8, 6).translate(0, 1.55, 0); return mergeSimples([t, p, c]); })(),
    isopor: new THREE.BoxGeometry(0.62, 0.4, 0.4).translate(0, 0.82, 0),
  }), []);
  const mats = useMemo(() => ({
    toalha: new THREE.MeshStandardMaterial({ roughness: 0.95 }),
    corpo: new THREE.MeshStandardMaterial({ roughness: 0.75 }),
    sol: new THREE.MeshStandardMaterial({ roughness: 0.8, side: THREE.DoubleSide }),
    pe: new THREE.MeshStandardMaterial({ roughness: 0.8 }),
    isopor: new THREE.MeshStandardMaterial({ color: '#f2f5f7', roughness: 0.7 }),
  }), []);
  useEffect(() => () => { Object.values(geos).forEach((g) => g.dispose()); Object.values(mats).forEach((m) => m.dispose()); }, [geos, mats]);

  const estado = useRef({ cx: 1e9, cz: 1e9, itens: [] as Item[], ultimaLotacao: -1, relogio: 0 });
  const tmp = useMemo(() => ({ m: new THREE.Matrix4(), q: new THREE.Quaternion(), p: new THREE.Vector3(), s: new THREE.Vector3(1, 1, 1), eixo: new THREE.Vector3(0, 1, 0), c: new THREE.Color() }), []);

  useFrame((_, dt) => {
    const E = estado.current;
    E.relogio += dt;
    const a = alvoCamera();
    const meshes = [refs.toalha.current, refs.corpo.current, refs.sol.current, refs.pe.current, refs.isopor.current];
    if (meshes.some((m) => !m)) return;
    if (Math.hypot(a.x - E.cx, a.z - E.cz) > RAIO * 0.35) { E.cx = a.x; E.cz = a.z; E.itens = candidatos(hm, a.x, a.z); E.ultimaLotacao = -1; }
    const ctx = contextoTurismo();
    // dev: `localStorage['n27:praia'] = '0.9'` força a lotação (para ver a praia cheia)
    const forcada = import.meta.env.DEV ? Number(localStorage.getItem('n27:praia') ?? NaN) : NaN;
    const lot = Number.isFinite(forcada) ? forcada : lotacaoPraia(ctx.hora, ctx.chuva, ctx.temp ?? 27, ctx.diaSemana);
    estadoPraia.lot = lot;
    const nivel = Math.round(lot * 40);
    if (nivel === E.ultimaLotacao) return;
    E.ultimaLotacao = nivel;
    estadoPraia.sois.length = 0;

    const { m, q, p, s, eixo, c } = tmp;
    const [tl, co, so, pe, is] = meshes as THREE.InstancedMesh[];
    let nT = 0, nC = 0, nS = 0, nP = 0, nI = 0;
    for (const it of E.itens) {
      // cada candidato aparece quando a lotação passa do seu "limiar" (estável: a praia enche e esvazia sem trocar de lugar)
      if (it.quem > lot) continue;
      q.setFromAxisAngle(eixo, it.rot);
      p.set(it.x, it.y, it.z);
      if (it.quem < 0.55 * lot && nS < MAX / 4) {
        // grupo: guarda-sol com toalha e um banhista deitado
        estadoPraia.sois.push(it);
        p.set(it.x + 1.3, it.y, it.z); m.compose(p, q, s); tl.setMatrixAt(nT, m); tl.setColorAt(nT, TOALHAS[it.cor % TOALHAS.length]); nT++;
        m.compose(p, q, s); co.setMatrixAt(nC, m); co.setColorAt(nC, PELES[it.pele % PELES.length]); nC++;
      } else if (it.quem < 0.8 * lot) {
        m.compose(p, q, s.set(1, 1, 1)); tl.setMatrixAt(nT, m); tl.setColorAt(nT, TOALHAS[it.cor % TOALHAS.length]); nT++;
        co.setMatrixAt(nC, m); co.setColorAt(nC, PELES[it.pele % PELES.length]); nC++;
      } else if (it.quem < 0.96 * lot || lot < 0.1) {
        const k = 0.9 + hash(it.cor, 1, 9) * 0.2;
        m.compose(p, q, s.set(k, k, k)); pe.setMatrixAt(nP, m); pe.setColorAt(nP, c.copy(TOALHAS[it.cor % TOALHAS.length]).lerp(PELES[it.pele % PELES.length], 0.35)); nP++;
      } else {
        // ambulante: de pé com a caixa de isopor (mate, biscoito Globo)
        m.compose(p, q, s.set(1, 1, 1)); pe.setMatrixAt(nP, m); pe.setColorAt(nP, PELES[it.pele % PELES.length]); nP++;
        is.setMatrixAt(nI, m); is.setColorAt(nI, c.set('#ffffff')); nI++;
      }
      if (nT >= MAX || nP >= MAX || nC >= MAX) break;
    }
    for (const [im, n] of [[tl, nT], [co, nC], [so, nS], [pe, nP], [is, nI]] as [THREE.InstancedMesh, number][]) {
      im.count = n;
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.computeBoundingSphere();
    }
  });

  return (
    <group>
      <instancedMesh ref={refs.toalha} args={[geos.toalha, mats.toalha, MAX]} receiveShadow frustumCulled={false} />
      <instancedMesh ref={refs.corpo} args={[geos.corpo, mats.corpo, MAX]} castShadow frustumCulled={false} />
      <instancedMesh ref={refs.sol} args={[geos.sol, mats.sol, 1]} frustumCulled={false} visible={false} />
      <instancedMesh ref={refs.pe} args={[geos.pe, mats.pe, MAX]} castShadow frustumCulled={false} />
      <instancedMesh ref={refs.isopor} args={[geos.isopor, mats.isopor, MAX / 8]} castShadow frustumCulled={false} />
    </group>
  );
}

/** Junta geometrias simples (posição e normal) numa só. */
function mergeSimples(gs: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let nv = 0, ni = 0;
  const idx = gs.map((g) => g.index ?? null);
  for (const g of gs) { nv += g.getAttribute('position').count; ni += g.index ? g.index.count : g.getAttribute('position').count; }
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), ind = new Uint32Array(ni);
  let ov = 0, oi = 0;
  gs.forEach((g, k) => {
    const p = g.getAttribute('position'), n = g.getAttribute('normal');
    pos.set(p.array as Float32Array, ov * 3);
    nor.set(n.array as Float32Array, ov * 3);
    const ix = idx[k];
    if (ix) for (let i = 0; i < ix.count; i++) ind[oi + i] = ix.getX(i) + ov;
    else for (let i = 0; i < p.count; i++) ind[oi + i] = ov + i;
    ov += p.count; oi += ix ? ix.count : p.count;
    g.dispose();
  });
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setIndex(new THREE.BufferAttribute(ind, 1));
  return out;
}
