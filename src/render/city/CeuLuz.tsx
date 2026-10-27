/**
 * Céu com espalhamento atmosférico (Preetham), sol/lua com sombra que acompanha a câmera,
 * luz hemisférica e névoa (maresia) que mudam com a hora.
 */
import { Sky, Stars } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useGame } from '../../sim/bridge';
import { ambiente, atualizarAmbiente, diaDoAno, direcaoLuz } from './ambiente';
import { aplicarClima } from './climaVisual';
import { alvoCamera } from './Camera';
import { SOMBRA, useNivel } from '../qualidade';

/** Relógio visual: um dia completo ≈ 6 min a 1× (desacoplado do calendário, como no Cities). */
const HORAS_POR_SEGUNDO = 24 / 360;

export function CeuLuz({ latitude }: { latitude: number }) {
  const sol = useRef<THREE.DirectionalLight>(null);
  const nivel = useNivel();
  const hemi = useRef<THREE.HemisphereLight>(null);
  const { scene, camera } = useThree();
  const [noite, setNoite] = useState(false);
  const [posSol, setPosSol] = useState<[number, number, number]>([0, 1, 0]);
  const fog = useMemo(() => new THREE.FogExp2('#bfd3e3', 0.00022), []);
  const dirTmp = useMemo(() => new THREE.Vector3(), []);
  const ultimoSky = useRef(0);

  useEffect(() => {
    scene.fog = fog;
    return () => { scene.fog = null; };
  }, [scene, fog]);

  useFrame((_, dt) => {
    const g = useGame.getState();
    const st = g.stats;
    // modo automático: o relógio vive em `ambiente.hora` (sem re-render); manual: slider da HUD
    let hora = g.horaAuto ? ambiente.hora : g.hora;
    if (g.horaAuto && g.velocidade > 0) hora = (hora + dt * HORAS_POR_SEGUNDO * g.velocidade) % 24;
    const doy = st ? diaDoAno(st.dia, st.mes) : 1;
    atualizarAmbiente(latitude, doy, hora);
    ambiente.tempo += dt;
    ambiente.luzSodio = g.luzSodio;
    if (st) ambiente.poluicaoAgua = st.poluicaoAgua;
    aplicarClima(st, dt);

    const L = sol.current;
    if (L) {
      direcaoLuz(dirTmp);
      const alvo = alvoCamera();
      const dist = camera.position.distanceTo(alvo);
      const meia = THREE.MathUtils.clamp(dist * 0.85, 140, 1100);
      // ajusta o frustum de sombra ao zoom e "trava" no texel para não tremer
      const cam = L.shadow.camera as THREE.OrthographicCamera;
      if (Math.abs(cam.right - meia) > 1) {
        cam.left = -meia; cam.right = meia; cam.top = meia; cam.bottom = -meia;
        cam.updateProjectionMatrix();
      }
      const texel = (meia * 2) / L.shadow.mapSize.x;
      const ax = Math.round(alvo.x / texel) * texel, az = Math.round(alvo.z / texel) * texel;
      L.target.position.set(ax, alvo.y, az);
      L.target.updateMatrixWorld();
      L.position.set(ax + dirTmp.x * 1500, alvo.y + dirTmp.y * 1500, az + dirTmp.z * 1500);
      L.color.copy(ambiente.corSol);
      L.intensity = ambiente.intensidadeSol;
      cam.far = 3500;
    }
    if (hemi.current) {
      hemi.current.color.copy(ambiente.hemiCeu);
      hemi.current.groundColor.set('#5c5038').lerp(new THREE.Color('#141820'), ambiente.noite);
      hemi.current.intensity = ambiente.intensidadeHemi;
    }
    fog.color.copy(ambiente.corNevoa);
    fog.density = 0.00016 + 0.00008 * ambiente.noite + ambiente.densidadeExtra;

    // o shader do céu só precisa atualizar de vez em quando
    ultimoSky.current += dt;
    if (ultimoSky.current > 0.2) {
      ultimoSky.current = 0;
      setPosSol([ambiente.sol.x, ambiente.sol.y, ambiente.sol.z]);
      const n = ambiente.noite > 0.5;
      if (n !== noite) setNoite(n);
    }
  });

  return (
    <>
      <Sky distance={30000} sunPosition={posSol} turbidity={6} rayleigh={1.4} mieCoefficient={0.006} mieDirectionalG={0.86} />
      {noite && <Stars radius={9000} depth={500} count={4000} factor={60} saturation={0} fade speed={0.3} />}
      <hemisphereLight ref={hemi} args={['#c6dbf2', '#5c5038', 0.9]} />
      <directionalLight
        key={nivel}
        ref={sol}
        castShadow={SOMBRA[nivel] > 0}
        intensity={3}
        shadow-mapSize={[Math.max(512, SOMBRA[nivel]), Math.max(512, SOMBRA[nivel])]}
        shadow-bias={-0.00025}
        shadow-normalBias={0.8}
      />
    </>
  );
}
