/**
 * Equipamentos públicos modelados proceduralmente: castelo d'água de concreto, ETA com
 * decantadores, subestação, usina solar, termelétrica, ETE, praça e parque com quadra.
 */
import { memo, useMemo } from 'react';
import * as THREE from 'three';
import { equipamento } from '../../sim/catalog';
import { mundo, useGame } from '../../sim/bridge';
import type { ServiceInst } from '../../sim/protocol';
import { sampleHeight, type Heightmap } from '../../world/terrain';

const concreto = new THREE.MeshStandardMaterial({ color: '#cfccc4', roughness: 0.9 });
const concretoEsc = new THREE.MeshStandardMaterial({ color: '#9d998f', roughness: 0.9 });
const metal = new THREE.MeshStandardMaterial({ color: '#8c949a', roughness: 0.45, metalness: 0.7 });
const aguaLimpa = new THREE.MeshStandardMaterial({ color: '#2f8fb0', roughness: 0.15 });
const aguaSuja = new THREE.MeshStandardMaterial({ color: '#6b6a3a', roughness: 0.3 });
const grama = new THREE.MeshStandardMaterial({ color: '#5f9440', roughness: 0.95 });
const caminho = new THREE.MeshStandardMaterial({ color: '#d8ccb0', roughness: 0.9 });
const painel = new THREE.MeshStandardMaterial({ color: '#1d2b4a', roughness: 0.2, metalness: 0.6 });
const quadra = new THREE.MeshStandardMaterial({ color: '#2f7d6d', roughness: 0.8 });
const copa = new THREE.MeshStandardMaterial({ color: '#3f6f2a', roughness: 0.85, flatShading: true });
const tijolo = new THREE.MeshStandardMaterial({ color: '#a8583a', roughness: 0.9 });
const amarelo = new THREE.MeshStandardMaterial({ color: '#e6b422', roughness: 0.6 });
const branco = new THREE.MeshStandardMaterial({ color: '#f1f4f6', roughness: 0.6 });
const vermelho = new THREE.MeshStandardMaterial({ color: '#d93b3b', roughness: 0.5, emissive: new THREE.Color('#d93b3b'), emissiveIntensity: 0.3 });
const azulSus = new THREE.MeshStandardMaterial({ color: '#1f6fb5', roughness: 0.5 });
const vidroAzul = new THREE.MeshStandardMaterial({ color: '#7fa7c4', roughness: 0.15, metalness: 0.3 });
const escolaAm = new THREE.MeshStandardMaterial({ color: '#f2d27a', roughness: 0.8 });
const escolaLar = new THREE.MeshStandardMaterial({ color: '#f0b25a', roughness: 0.8 });
const policia = new THREE.MeshStandardMaterial({ color: '#bfc6cc', roughness: 0.7 });
const faixaAzul = new THREE.MeshStandardMaterial({ color: '#2a4c8f', roughness: 0.6 });
const bege = new THREE.MeshStandardMaterial({ color: '#c9b48a', roughness: 0.8 });

function Arvore({ x, z, s = 1 }: { x: number; z: number; s?: number }) {
  return (
    <group position={[x, 0, z]} scale={s}>
      <mesh position-y={1.5} material={concretoEsc} castShadow><cylinderGeometry args={[0.2, 0.3, 3, 5]} /></mesh>
      <mesh position-y={4.2} material={copa} castShadow><icosahedronGeometry args={[2.2, 0]} /></mesh>
    </group>
  );
}

function Modelo({ eq, w, d }: { eq: string; w: number; d: number }) {
  switch (eq) {
    case 'reservatorio':
      return (
        <group>
          {[-1, 1].flatMap((a) => [-1, 1].map((b) => (
            <mesh key={`${a}${b}`} position={[a * 3.2, 7, b * 3.2]} material={concreto} castShadow><boxGeometry args={[0.9, 14, 0.9]} /></mesh>
          )))}
          <mesh position-y={17} material={concreto} castShadow receiveShadow><cylinderGeometry args={[6.2, 4.6, 6.5, 20]} /></mesh>
          <mesh position-y={20.6} material={concretoEsc} castShadow><cylinderGeometry args={[1.5, 6.4, 1.2, 20]} /></mesh>
          <mesh position-y={17} material={amarelo}><cylinderGeometry args={[6.25, 6.25, 0.6, 20]} /></mesh>
        </group>
      );
    case 'eta':
    case 'ete': {
      const sujo = eq === 'ete';
      return (
        <group>
          <mesh position={[-w / 2 + 8, 3.5, -d / 2 + 6]} material={concreto} castShadow receiveShadow><boxGeometry args={[14, 7, 10]} /></mesh>
          {[0, 1, 2].map((i) => (
            <group key={i} position={[-w / 2 + 10 + i * 12.5, 0, 6]}>
              <mesh position-y={1.6} material={concretoEsc} castShadow receiveShadow><cylinderGeometry args={[5.4, 5.4, 3.2, 28]} /></mesh>
              <mesh position-y={3.22} material={sujo && i === 0 ? aguaSuja : aguaLimpa}><cylinderGeometry args={[4.9, 4.9, 0.1, 28]} /></mesh>
              <mesh position-y={3.6} material={metal}><boxGeometry args={[10, 0.25, 0.6]} /></mesh>
            </group>
          ))}
          <mesh position={[w / 2 - 6, 0.2, -d / 2 + 8]} material={sujo ? aguaSuja : aguaLimpa}><boxGeometry args={[9, 0.4, 12]} /></mesh>
        </group>
      );
    }
    case 'subestacao':
      return (
        <group>
          <mesh position-y={0.1} material={caminho} receiveShadow><boxGeometry args={[w, 0.2, d]} /></mesh>
          {[-1, 0, 1].map((i) => (
            <group key={i} position={[i * 7, 0, 0]}>
              <mesh position-y={1.8} material={metal} castShadow><boxGeometry args={[3, 3.6, 4]} /></mesh>
              <mesh position-y={6} material={metal} castShadow><boxGeometry args={[0.3, 6, 0.3]} /></mesh>
              <mesh position-y={8.8} material={metal}><boxGeometry args={[5, 0.25, 0.25]} /></mesh>
            </group>
          ))}
          <mesh position={[0, 1.2, d / 2 - 0.2]} material={metal}><boxGeometry args={[w, 2.4, 0.08]} /></mesh>
          <mesh position={[0, 1.2, -d / 2 + 0.2]} material={metal}><boxGeometry args={[w, 2.4, 0.08]} /></mesh>
        </group>
      );
    case 'solar':
      return (
        <group>
          {Array.from({ length: 6 }, (_, r) => (
            <mesh key={r} position={[0, 1.3, -d / 2 + 4 + r * ((d - 8) / 5)]} rotation-x={-0.35} material={painel} castShadow receiveShadow>
              <boxGeometry args={[w - 4, 0.12, 3.4]} />
            </mesh>
          ))}
        </group>
      );
    case 'termeletrica':
      return (
        <group>
          <mesh position={[-6, 8, 0]} material={concreto} castShadow receiveShadow><boxGeometry args={[30, 16, 26]} /></mesh>
          {[0, 1].map((i) => (
            <group key={i} position={[14, 0, -8 + i * 14]}>
              <mesh position-y={22} material={concretoEsc} castShadow><cylinderGeometry args={[1.6, 2.4, 44, 14]} /></mesh>
              <mesh position-y={40} material={tijolo}><cylinderGeometry args={[1.85, 1.85, 3, 14]} /></mesh>
            </group>
          ))}
        </group>
      );
    case 'praca':
      return (
        <group>
          <mesh position-y={0.15} material={grama} receiveShadow><boxGeometry args={[w, 0.3, d]} /></mesh>
          <mesh position-y={0.32} material={caminho} receiveShadow><boxGeometry args={[w, 0.05, 2.6]} /></mesh>
          <mesh position-y={0.32} material={caminho} receiveShadow><boxGeometry args={[2.6, 0.05, d]} /></mesh>
          <mesh position-y={0.6} material={concreto} castShadow><cylinderGeometry args={[2.4, 2.6, 0.6, 18]} /></mesh>
          <Arvore x={-6} z={-6} /><Arvore x={6} z={-6} s={1.1} /><Arvore x={-6} z={6} s={0.9} /><Arvore x={6} z={6} />
        </group>
      );
    case 'parque':
      return (
        <group>
          <mesh position-y={0.15} material={grama} receiveShadow><boxGeometry args={[w, 0.3, d]} /></mesh>
          <mesh position={[w / 4, 0.33, 0]} material={quadra} receiveShadow><boxGeometry args={[18, 0.06, 10]} /></mesh>
          <mesh position={[w / 4, 0.38, 0]} material={caminho}><boxGeometry args={[0.15, 0.04, 10]} /></mesh>
          <mesh position={[-w / 4, 0.32, 0]} rotation-x={-Math.PI / 2} material={caminho} receiveShadow><ringGeometry args={[7, 8.6, 32]} /></mesh>
          {Array.from({ length: 10 }, (_, i) => (
            <Arvore key={i} x={-w / 2 + 4 + ((i * 37) % (w - 8))} z={(i % 2 ? 1 : -1) * (d / 2 - 4 - ((i * 13) % 6))} s={0.8 + (i % 3) * 0.2} />
          ))}
        </group>
      );
    case 'ubs':
      return (
        <group>
          <mesh position-y={2.5} material={branco} castShadow receiveShadow><boxGeometry args={[w - 4, 5, d - 4]} /></mesh>
          <mesh position={[0, 4, d / 2 - 1.9]} material={azulSus}><boxGeometry args={[w - 4, 1.4, 0.2]} /></mesh>
          <mesh position={[-w / 4, 5.4, 0]} material={vermelho}><boxGeometry args={[2.2, 0.6, 0.6]} /></mesh>
          <mesh position={[-w / 4, 5.4, 0]} material={vermelho}><boxGeometry args={[0.6, 0.6, 2.2]} /></mesh>
        </group>
      );
    case 'upa':
      return (
        <group>
          <mesh position-y={3.5} material={branco} castShadow receiveShadow><boxGeometry args={[w - 4, 7, d - 4]} /></mesh>
          <mesh position={[0, 5.8, d / 2 - 1.9]} material={vermelho}><boxGeometry args={[w - 6, 1.6, 0.2]} /></mesh>
          <mesh position={[w / 2 - 6, 3.3, d / 2 + 0.5]} material={concreto} castShadow><boxGeometry args={[8, 0.3, 6]} /></mesh>
        </group>
      );
    case 'hospital':
      return (
        <group>
          <mesh position-y={4} material={branco} castShadow receiveShadow><boxGeometry args={[w - 2, 8, d - 2]} /></mesh>
          <mesh position={[0, 17, -4]} material={vidroAzul} castShadow receiveShadow><boxGeometry args={[w * 0.55, 26, d * 0.45]} /></mesh>
          <mesh position={[0, 30.2, -4]} material={concretoEsc}><cylinderGeometry args={[5, 5, 0.3, 24]} /></mesh>
          <mesh position={[0, 30.4, -4]} material={amarelo}><boxGeometry args={[1, 0.05, 4]} /></mesh>
          <mesh position={[0, 26, d * 0.225 - 4 + 0.1]} material={vermelho}><boxGeometry args={[3, 3, 0.2]} /></mesh>
        </group>
      );
    case 'escola':
    case 'integral':
    case 'tecnica': {
      const m = eq === 'integral' ? escolaLar : eq === 'tecnica' ? bege : escolaAm;
      return (
        <group>
          <mesh position={[0, 4, -d / 2 + 6]} material={m} castShadow receiveShadow><boxGeometry args={[w - 2, 8, 9]} /></mesh>
          <mesh position={[-w / 2 + 5, 4, 2]} material={m} castShadow receiveShadow><boxGeometry args={[8, 8, d - 14]} /></mesh>
          <mesh position={[w / 2 - 9, 0.35, 4]} material={quadra} receiveShadow><boxGeometry args={[14, 0.1, 10]} /></mesh>
          {eq === 'integral' && <mesh position={[w / 2 - 9, 6, 4]} material={concretoEsc} castShadow><boxGeometry args={[15, 0.4, 11]} /></mesh>}
          {eq === 'tecnica' && <mesh position={[w / 2 - 9, 5, -d / 2 + 6]} material={metal} castShadow><boxGeometry args={[14, 10, 8]} /></mesh>}
        </group>
      );
    }
    case 'delegacia':
      return (
        <group>
          <mesh position-y={3.5} material={policia} castShadow receiveShadow><boxGeometry args={[w - 4, 7, d - 4]} /></mesh>
          <mesh position={[0, 5.5, d / 2 - 1.9]} material={faixaAzul}><boxGeometry args={[w - 4, 1.2, 0.2]} /></mesh>
          <mesh position={[w / 2 - 3, 4, d / 2 - 2]} material={metal}><cylinderGeometry args={[0.08, 0.08, 8, 6]} /></mesh>
        </group>
      );
    case 'batalhao':
      return (
        <group>
          <mesh position-y={1.4} material={bege} receiveShadow><boxGeometry args={[w, 2.8, d]} /></mesh>
          <mesh position={[0, 4.5, -d / 4]} material={bege} castShadow receiveShadow><boxGeometry args={[w - 8, 9, d / 2 - 2]} /></mesh>
          <mesh position={[w / 2 - 5, 7, d / 2 - 5]} material={concreto} castShadow><boxGeometry args={[4, 14, 4]} /></mesh>
          <mesh position={[-w / 2 + 4, 6, d / 2 - 3]} material={metal}><cylinderGeometry args={[0.1, 0.1, 12, 6]} /></mesh>
        </group>
      );
    case 'base':
      return (
        <group>
          <mesh position-y={1.6} material={branco} castShadow receiveShadow><boxGeometry args={[w - 2, 3.2, d - 3]} /></mesh>
          <mesh position={[0, 2.6, (d - 3) / 2 + 0.05]} material={faixaAzul}><boxGeometry args={[w - 2, 0.5, 0.1]} /></mesh>
          <mesh position={[0, 3.5, 0]} material={vermelho}><boxGeometry args={[1.2, 0.3, 0.4]} /></mesh>
        </group>
      );
    default:
      return <mesh position-y={4} material={concreto}><boxGeometry args={[w, 8, d]} /></mesh>;
  }
}

const Equip = memo(function Equip({ s, hm }: { s: ServiceInst; hm: Heightmap }) {
  const eq = equipamento(s.eq);
  const y = useMemo(() => {
    let min = Infinity;
    for (const [u, v] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5], [0, 0]]) {
      const c = Math.cos(s.angle), sn = Math.sin(s.angle);
      const lx = u * eq.w, lz = v * eq.d;
      min = Math.min(min, sampleHeight(hm, s.x + c * lx + sn * lz, s.z - sn * lx + c * lz));
    }
    return min;
  }, [s, eq, hm]);
  return (
    <group position={[s.x, y, s.z]} rotation-y={s.angle}>
      {/* base/aterro para assentar no terreno */}
      <mesh position-y={-2} material={concretoEsc} receiveShadow><boxGeometry args={[eq.w, 4.2, eq.d]} /></mesh>
      <Modelo eq={s.eq} w={eq.w} d={eq.d} />
    </group>
  );
});

export function Equipamentos({ hm }: { hm: Heightmap }) {
  useGame((s) => s.worldVersion);
  return (
    <group>
      {mundo.services.map((s) => <Equip key={s.id} s={s} hm={hm} />)}
    </group>
  );
}
