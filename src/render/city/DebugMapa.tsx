/**
 * Depuração do mapa (F3): 1 = wireframe + painel de problemas das vias; 2 = também as normais do terreno ao redor
 * da câmera (verde: inclinação normal; vermelho: acima de 50°). O painel está em ui/PainelDebugMapa.tsx.
 */
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { mundo } from '../../sim/bridge';
import { HM_RES, HM_STEP, HM_VERTS, MAP_SIZE } from '../../world/constants';
import type { Heightmap } from '../../world/terrain';
import { alvoCamera } from './Camera';
import { debugMapa, diagnosticarVias, useDebugMapa } from './estadoDebug';
import { perfisAtuais } from './Vias';

const RAIO_NORMAIS = 240;

export function DebugMapa({ hm }: { hm: Heightmap }) {
  const { scene } = useThree();
  const d = useDebugMapa();
  const originais = useRef(new Map<THREE.Material, boolean>());
  const linhas = useRef<THREE.LineSegments>(null);
  const t = useRef({ ult: 0, cx: 1e9, cz: 1e9 });

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key !== 'F3' || (e.target as HTMLElement)?.tagName === 'INPUT') return;
      e.preventDefault();
      debugMapa.ciclo();
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, []);

  // diagnóstico das vias só quando alguém liga o modo (varre ~180 mil seções)
  useEffect(() => {
    if (d.modo > 0 && d.contagem.trechos === 0 && perfisAtuais.size) diagnosticarVias(perfisAtuais, hm, mundo.real?.vias.rotatoriasDescartadas, mundo.real?.removidos, (mundo.real?.vias.minirrotatorias?.length ?? 0) / 3);
  }, [d.modo, d.contagem.trechos, hm]);

  // wireframe em todas as malhas (blocos novos entram a cada segundo)
  useEffect(() => {
    const ligar = d.modo > 0;
    const aplicar = () => scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      if (!m || !(o as THREE.Mesh).isMesh || o === linhas.current) return;
      for (const mat of Array.isArray(m) ? m : [m]) {
        if (!('wireframe' in mat)) continue;
        const w = mat as THREE.MeshStandardMaterial;
        if (ligar) { if (!originais.current.has(w)) originais.current.set(w, w.wireframe); w.wireframe = true; }
      }
    });
    const restaurar = () => { for (const [m, v] of originais.current) (m as THREE.MeshStandardMaterial).wireframe = v; originais.current.clear(); };
    if (!ligar) { restaurar(); return; }
    aplicar();
    const id = window.setInterval(aplicar, 1000);
    return () => { window.clearInterval(id); if (!ligar) restaurar(); };
  }, [d.modo, scene]);
  useEffect(() => () => { for (const [m, v] of originais.current) (m as THREE.MeshStandardMaterial).wireframe = v; originais.current.clear(); }, []);

  const geo = useMemo(() => new THREE.BufferGeometry(), []);
  const mat = useMemo(() => new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false, transparent: true, opacity: 0.9 }), []);
  useEffect(() => () => { geo.dispose(); mat.dispose(); }, [geo, mat]);

  useFrame(() => {
    if (d.modo !== 2) return;
    const a = alvoCamera();
    const agora = performance.now();
    if (agora - t.current.ult < 400 || (Math.abs(a.x - t.current.cx) < 8 && Math.abs(a.z - t.current.cz) < 8 && geo.getAttribute('position'))) return;
    t.current = { ult: agora, cx: a.x, cz: a.z };
    const half = MAP_SIZE / 2, r = Math.ceil(RAIO_NORMAIS / HM_STEP);
    const ci = Math.round((a.x + half) / HM_STEP), cj = Math.round((a.z + half) / HM_STEP);
    const pos: number[] = [], cor: number[] = [];
    for (let j = Math.max(1, cj - r); j <= Math.min(HM_RES - 1, cj + r); j++) for (let i = Math.max(1, ci - r); i <= Math.min(HM_RES - 1, ci + r); i++) {
      const k = j * HM_VERTS + i;
      const dx = (hm.h[k + 1] - hm.h[k - 1]) / (2 * HM_STEP), dz = (hm.h[k + HM_VERTS] - hm.h[k - HM_VERTS]) / (2 * HM_STEP);
      const l = Math.hypot(dx, 1, dz), x = -half + i * HM_STEP, z = -half + j * HM_STEP;
      pos.push(x, hm.h[k], z, x - (dx / l) * 9, hm.h[k] + (1 / l) * 9, z - (dz / l) * 9);
      const ingreme = Math.hypot(dx, dz) > 1.2;
      cor.push(ingreme ? 1 : 0.2, ingreme ? 0.2 : 1, 0.2, ingreme ? 1 : 0.2, ingreme ? 0.2 : 1, 0.2);
    }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(cor, 3));
    geo.computeBoundingSphere();
  });

  return <lineSegments ref={linhas} geometry={geo} material={mat} visible={d.modo === 2} frustumCulled={false} renderOrder={30} />;
}
