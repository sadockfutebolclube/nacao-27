/**
 * Câmera estilo city-builder: botão direito gira, do meio (ou esquerdo sem ferramenta) arrasta,
 * roda dá zoom; WASD/setas movem, Q/E giram, R/F aproximam/afastam.
 */
import { MapControls } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { MapControls as MapControlsImpl } from 'three-stdlib';
import { enviarFoco, useGame } from '../../sim/bridge';
import { MEDIR } from '../../dev/medir';
import { registro } from '../../entidades/registro';
import { selecao } from '../../entidades/selecao';
import { BUILD_HALF } from '../../world/constants';
import { sampleHeight, type Heightmap } from '../../world/terrain';

let controlsRef: MapControlsImpl | null = null;
let hmRef: Heightmap | null = null;
/** Leva a câmera para um ponto do mapa (painel F3): olha de ~160 m, de sudeste, na altitude do terreno. */
export function irPara(x: number, z: number, dist = 160) {
  const c = controlsRef;
  if (!c) return;
  const y = hmRef ? Math.max(0, sampleHeight(hmRef, x, z)) : 0;
  c.target.set(x, y, z);
  c.object.position.set(x + dist * 0.5, y + dist * 0.6, z + dist * 0.8);
  c.update();
}
const alvoPadrao = new THREE.Vector3();
export const alvoCamera = () => (controlsRef ? controlsRef.target : alvoPadrao);

export function CameraRig({ hm, inicio }: { hm: Heightmap; inicio: [number, number] }) {
  const ref = useRef<MapControlsImpl>(null);
  const { camera, gl } = useThree();
  const teclas = useRef(new Set<string>());
  const ferramenta = useGame((s) => s.ferramenta.tipo);
  const tmp = useMemo(() => ({ f: new THREE.Vector3(), r: new THREE.Vector3(), off: new THREE.Vector3() }), []);

  useEffect(() => { hmRef = hm; return () => { hmRef = null; }; }, [hm]);

  useEffect(() => {
    const [x, z] = inicio;
    const y = Math.max(0, sampleHeight(hm, x, z));
    camera.position.set(x - 240, y + 170, z - 380);
    if (ref.current) {
      ref.current.target.set(x, y, z);
      ref.current.update();
    }
  }, [hm, inicio, camera]);

  useEffect(() => {
    controlsRef = ref.current;
    // gancho de depuração só em desenvolvimento (screenshots com câmera posicionada)
    if (MEDIR) (window as unknown as { __n27cam: unknown }).__n27cam = ref.current;
    const down = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      teclas.current.add(e.key.toLowerCase());
    };
    const up = (e: KeyboardEvent) => teclas.current.delete(e.key.toLowerCase());
    const blur = () => teclas.current.clear();
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
      controlsRef = null;
    };
  }, []);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    c.mouseButtons = {
      LEFT: (ferramenta === 'nenhuma' ? THREE.MOUSE.PAN : -1) as THREE.MOUSE,
      MIDDLE: THREE.MOUSE.PAN,
      RIGHT: THREE.MOUSE.ROTATE,
    };
  }, [ferramenta]);

  // Fase 25: arrastar a câmera (esquerdo/meio) cancela o "seguir"; o botão direito só gira e não cancela
  useEffect(() => {
    const el = gl.domElement;
    let ini: { x: number; y: number; b: number } | null = null;
    const down = (e: PointerEvent) => { ini = { x: e.clientX, y: e.clientY, b: e.button }; };
    const move = (e: PointerEvent) => { if (ini && ini.b !== 2 && e.buttons && Math.hypot(e.clientX - ini.x, e.clientY - ini.y) > 6 && selecao.ler().modo === 'seguindo') selecao.modo('livre'); };
    const up = () => { ini = null; };
    el.addEventListener('pointerdown', down); el.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
    return () => { el.removeEventListener('pointerdown', down); el.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  }, [gl]);

  const foco = useRef({ x: 1e9, z: 1e9, raio: 0, t: 0 });
  useFrame((_, dt) => {
    // Fase 23: avisa o worker onde a câmera olha (a cada 0,5 s, se andou > 150 m ou o zoom mudou o raio) — LOD da simulação
    const agora = performance.now();
    if (agora - foco.current.t > 500 && ref.current) {
      foco.current.t = agora;
      const a = ref.current.target;
      const raio = Math.round(Math.min(3000, Math.max(900, camera.position.distanceTo(a) * 3)) / 200) * 200;
      if (Math.hypot(a.x - foco.current.x, a.z - foco.current.z) > 150 || raio !== foco.current.raio) { foco.current.x = a.x; foco.current.z = a.z; foco.current.raio = raio; enviarFoco(a.x, a.z, raio); }
    }
    const c = ref.current;
    if (!c) return;
    const k = teclas.current;
    const dist = camera.position.distanceTo(c.target);
    const vel = dist * 1.1 * dt;
    const { f, r, off } = tmp;
    camera.getWorldDirection(f);
    f.y = 0; f.normalize();
    r.crossVectors(f, camera.up).normalize();
    off.set(0, 0, 0);
    if (k.has('w') || k.has('arrowup')) off.add(f);
    if (k.has('s') || k.has('arrowdown')) off.sub(f);
    if (k.has('d') || k.has('arrowright')) off.add(r);
    if (k.has('a') || k.has('arrowleft')) off.sub(r);
    if (off.lengthSq() > 0) {
      off.normalize().multiplyScalar(vel);
      c.target.add(off);
      camera.position.add(off);
      if (selecao.ler().modo === 'seguindo') selecao.modo('livre'); // andou com o teclado: a câmera volta a ser do jogador
    }
    const giro = (k.has('q') ? 1 : 0) - (k.has('e') ? 1 : 0);
    if (giro) {
      const ang = giro * dt * 1.4;
      camera.position.sub(c.target).applyAxisAngle(camera.up, ang).add(c.target);
    }
    const zoom = (k.has('f') ? 1 : 0) - (k.has('r') ? 1 : 0);
    if (zoom) {
      const v = camera.position.clone().sub(c.target).multiplyScalar(1 + zoom * dt * 1.5);
      if (v.length() > c.minDistance && v.length() < c.maxDistance) camera.position.copy(c.target).add(v);
    }
    // Fase 25: acompanha a entidade selecionada (seguindo/travado); travado também não deixa arrastar
    const sel = selecao.ler();
    c.enablePan = sel.modo !== 'travado';
    if (sel.id !== null && sel.modo !== 'livre') {
      const cx = registro.caixaDe(sel.id);
      if (cx) {
        const kf = 1 - Math.exp(-dt * 7);
        const ddx = (cx.x - c.target.x) * kf, ddz = (cx.z - c.target.z) * kf;
        c.target.x += ddx; c.target.z += ddz; camera.position.x += ddx; camera.position.z += ddz;
        if (sel.aproximar) {
          // pessoas e carros são pequenos: aproxima uma vez até ~35 m
          const dd = camera.position.distanceTo(c.target), alvoD = cx.w * cx.d > 40 ? 90 : 35;
          if (dd > alvoD * 1.08) { const v = camera.position.clone().sub(c.target).multiplyScalar(1 - (1 - alvoD / dd) * (1 - Math.exp(-dt * 4))); camera.position.copy(c.target).add(v); } else selecao.aproximado();
        }
      }
    }
    // mantém o alvo no chão e dentro do mapa
    const lim = BUILD_HALF + 500;
    const tx = THREE.MathUtils.clamp(c.target.x, -lim, lim), tz = THREE.MathUtils.clamp(c.target.z, -lim, lim);
    const ty = Math.max(0, sampleHeight(hm, tx, tz));
    const dx = tx - c.target.x, dz = tz - c.target.z, dy = (ty - c.target.y) * Math.min(1, dt * 4);
    if (dx || dz || Math.abs(dy) > 0.001) {
      c.target.x += dx; c.target.z += dz; c.target.y += dy;
      camera.position.x += dx; camera.position.z += dz; camera.position.y += dy;
    }
    // não deixa a câmera entrar no morro
    const chao = Math.max(0, sampleHeight(hm, camera.position.x, camera.position.z)) + 8;
    if (camera.position.y < chao) camera.position.y = chao;
    c.update();
  });

  return (
    <MapControls
      ref={ref}
      makeDefault
      enableDamping
      dampingFactor={0.12}
      minDistance={25}
      maxDistance={6000}
      minPolarAngle={0.12}
      maxPolarAngle={1.38}
      screenSpacePanning={false}
      zoomSpeed={1.1}
      panSpeed={1.2}
      rotateSpeed={0.6}
    />
  );
}
