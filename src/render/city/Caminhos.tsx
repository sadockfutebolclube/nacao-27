/**
 * Escadarias, calçadas, trilhas, estradinhas, ciclovias e calçadões do OSM (Fase 20). Não são asfalto: cada caminho é
 * uma faixa estreita colada no terreno (cota do relevo + 6 cm, sem escavar), com textura própria — degraus nas escadas,
 * terra batida nas trilhas, concreto nas calçadas. Desenhado em blocos de 1 km, só perto da câmera.
 */
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { mundo } from '../../sim/bridge';
import { sampleHeight, sampleWaterDist, type Heightmap } from '../../world/terrain';
import { texturaCalcadao } from './texturas';

const BLOCO = 1024;
const DIST = 1800;
/** o 7º é o calçadão da orla (pedestrian a menos de 250 m da água), com a pedra portuguesa em ondas (Fase 21) */
const NOMES = ['escada', 'calçada', 'trilha', 'estradinha', 'ciclovia', 'calçadão', 'calçadão da orla'] as const;

function textura(tipo: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const x = c.getContext('2d')!;
  const base = ['#b9b6ae', '#c3c0b8', '#8a6e4b', '#a88b5e', '#b5584a', '#d2cdc1'][tipo];
  x.fillStyle = base; x.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 220; i++) { x.fillStyle = `rgba(${60 + Math.random() * 120},${60 + Math.random() * 110},${50 + Math.random() * 90},0.22)`; x.fillRect(Math.random() * 64, Math.random() * 64, 2, 2); }
  if (tipo === 0) {
    // degraus: faixa clara (piso) e sombra (espelho) a cada 16 px
    for (let y = 0; y < 64; y += 16) { x.fillStyle = 'rgba(255,255,255,0.35)'; x.fillRect(0, y, 64, 9); x.fillStyle = 'rgba(40,36,30,0.5)'; x.fillRect(0, y + 10, 64, 4); }
    x.fillStyle = 'rgba(60,60,60,0.55)'; x.fillRect(0, 0, 3, 64); x.fillRect(61, 0, 3, 64); // corrimãos
  } else if (tipo === 1 || tipo === 5) {
    x.strokeStyle = 'rgba(70,66,60,0.45)'; x.lineWidth = 1;
    for (let y = 0; y < 64; y += 32) { x.beginPath(); x.moveTo(0, y); x.lineTo(64, y); x.stroke(); }
    x.beginPath(); x.moveTo(32, 0); x.lineTo(32, 64); x.stroke();
  } else if (tipo === 4) {
    x.fillStyle = 'rgba(255,255,255,0.7)'; x.fillRect(30, 6, 4, 22); x.fillRect(30, 38, 4, 22);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.ClampToEdgeWrapping; t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  return t;
}

interface Bloco { cx: number; cz: number; geos: (THREE.BufferGeometry | null)[] }

export function Caminhos({ hm }: { hm: Heightmap }) {
  const dados = mundo.real?.caminhos;
  const blocos = useMemo<Bloco[]>(() => {
    if (!dados || !dados.length) return [];
    const mapa = new Map<string, { pos: number[][]; nor: number[][]; uv: number[][]; idx: number[][] }>();
    const acum = (k: string) => mapa.get(k) ?? mapa.set(k, { pos: NOMES.map(() => []), nor: NOMES.map(() => []), uv: NOMES.map(() => []), idx: NOMES.map(() => []) }).get(k)!;
    for (let o = 0; o < dados.length;) {
      let tipo = dados[o];
      const larg = dados[o + 1] / 10, n = dados[o + 2];
      const pts: [number, number][] = [];
      for (let i = 0; i < n; i++) pts.push([dados[o + 3 + i * 2], dados[o + 4 + i * 2]]);
      o += 3 + n * 2;
      // reamostra a cada ~2 m para a faixa acompanhar o relevo
      const xs: number[] = [], zs: number[] = [], ss: number[] = [];
      let acc = 0;
      for (let i = 0; i + 1 < pts.length; i++) {
        const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
        const L = Math.hypot(bx - ax, bz - az), k = Math.max(1, Math.round(L / 2));
        for (let s = 0; s < k; s++) { xs.push(ax + ((bx - ax) * s) / k); zs.push(az + ((bz - az) * s) / k); ss.push(acc + (L * s) / k); }
        acc += L;
      }
      xs.push(pts[pts.length - 1][0]); zs.push(pts[pts.length - 1][1]); ss.push(acc);
      const m = xs.length;
      if (m < 2) continue;
      const meio = m >> 1;
      if (tipo === 5 && sampleWaterDist(hm, xs[meio], zs[meio]) < 250) tipo = 6;
      const A = acum(`${Math.floor(xs[meio] / BLOCO)},${Math.floor(zs[meio] / BLOCO)}`);
      const pos = A.pos[tipo], nor = A.nor[tipo], uv = A.uv[tipo], idx = A.idx[tipo];
      const base = pos.length / 3;
      for (let i = 0; i < m; i++) {
        const a = Math.max(0, i - 1), b = Math.min(m - 1, i + 1);
        const tx = xs[b] - xs[a], tz = zs[b] - zs[a], l = Math.hypot(tx, tz) || 1;
        const nx = -tz / l, nz = tx / l, w = larg / 2;
        for (const lado of [-1, 1]) {
          const x = xs[i] + nx * w * lado, z = zs[i] + nz * w * lado;
          pos.push(x, Math.max(0.2, sampleHeight(hm, x, z)) + 0.07, z);
          nor.push(0, 1, 0);
          uv.push(lado < 0 ? 0 : 1, ss[i] / (tipo === 0 ? 4 : tipo === 6 ? 10 : 3));
        }
      }
      for (let i = 0; i + 1 < m; i++) { const a = base + i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    return [...mapa].map(([chave, A]) => {
      const [bx, bz] = chave.split(',').map(Number);
      return {
        cx: (bx + 0.5) * BLOCO, cz: (bz + 0.5) * BLOCO,
        geos: NOMES.map((_, t) => {
          if (!A.pos[t].length) return null;
          const g = new THREE.BufferGeometry();
          g.setAttribute('position', new THREE.Float32BufferAttribute(A.pos[t], 3));
          g.setAttribute('normal', new THREE.Float32BufferAttribute(A.nor[t], 3));
          g.setAttribute('uv', new THREE.Float32BufferAttribute(A.uv[t], 2));
          g.setIndex(A.idx[t]);
          g.computeBoundingSphere();
          return g;
        }),
      };
    });
  }, [dados, hm]);

  const mats = useMemo(() => NOMES.map((_, t) => new THREE.MeshStandardMaterial({ map: t === 6 ? texturaCalcadao() : textura(t), roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: THREE.DoubleSide })), []);
  useEffect(() => () => {
    mats.forEach((m) => { m.map?.dispose(); m.dispose(); });
    blocos.forEach((b) => b.geos.forEach((g) => g?.dispose()));
  }, [mats, blocos]);

  const camera = useThree((st) => st.camera);
  const grupos = useRef<(THREE.Group | null)[]>([]);
  const ultimo = useRef(0);
  useFrame(() => {
    const agora = performance.now();
    if (agora - ultimo.current < 300) return;
    ultimo.current = agora;
    const { x, y, z } = camera.position;
    blocos.forEach((b, i) => { const g = grupos.current[i]; if (g) g.visible = Math.hypot(b.cx - x, b.cz - z, Math.max(0, y) * 0.6) < DIST; });
  });

  if (!blocos.length) return null;
  return (
    <group>
      {blocos.map((b, i) => (
        <group key={`${b.cx},${b.cz}`} ref={(g) => { grupos.current[i] = g; }} visible={false}>
          {b.geos.map((g, t) => (g ? <mesh key={t} geometry={g} material={mats[t]} receiveShadow /> : null))}
        </group>
      ))}
    </group>
  );
}
