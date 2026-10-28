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
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { CSM } from 'three/examples/jsm/csm/CSM.js';

/**
 * Sombras em cascata (CSM, Fase 21): 2 cascatas em "alta" (2048) e em "média" (1024) (a "baixa" não projeta sombra). A luz única de
 * antes cobria até 2 km com o mesmo mapa e as sombras de perto ficavam moles; agora a cascata perto da câmera tem texel
 * de poucos centímetros. As luzes e o shader (`lights_fragment_begin`) são do CSM; cada material do mundo recebe os
 * uniformes dele por `ligarCSM`, encadeado ao `onBeforeCompile` que o material já tinha (terreno, prédios…).
 */
const SEM_CSM = import.meta.env.DEV && (() => { try { return (localStorage.getItem("n27:desligar") ?? "").split(",").includes("CSM"); } catch { return false; } })();
const CASCATAS: Record<string, number> = { alta: 2, media: 2 };
const MAPA_CASCATA: Record<string, number> = { alta: 2048, media: 1024 };

type MatCSM = THREE.Material & { userData: { csmId?: number; csmOriginal?: THREE.Material['onBeforeCompile']; csmChave?: () => string } };
let proximoId = 1;
function ligarCSM(csm: CSM, id: number, material: MatCSM) {
  if (material.userData.csmId === id) return;
  const original = 'csmOriginal' in material.userData ? material.userData.csmOriginal : material.onBeforeCompile;
  const chaveOriginal = material.userData.csmChave ?? material.customProgramCacheKey;
  material.onBeforeCompile = original as THREE.Material['onBeforeCompile'];
  csm.setupMaterial(material);
  const gancho = material.onBeforeCompile;
  material.onBeforeCompile = function (this: THREE.Material, shader, renderer) { (original as THREE.Material['onBeforeCompile'] | undefined)?.call(this, shader, renderer); gancho.call(this, shader, renderer); };
  material.customProgramCacheKey = () => `${chaveOriginal?.call(material) ?? ''}|csm${csm.cascades}`;
  material.userData.csmId = id;
  material.userData.csmOriginal = original as THREE.Material['onBeforeCompile'];
  material.userData.csmChave = chaveOriginal as () => string;
  material.needsUpdate = true;
}

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
  const csmRef = useRef<{ csm: CSM; id: number } | null>(null);
  const ultimoVarre = useRef(0);
  const tamanho = useThree((st) => st.size);
  // dev: localStorage["n27:desligar"] = "CSM" volta à luz única de antes da Fase 21 (para medir o custo das cascatas)
  const usaCSM = nivel in CASCATAS && !SEM_CSM;

  useEffect(() => {
    if (!usaCSM) return;
    const csm = new CSM({
      camera, parent: scene, cascades: CASCATAS[nivel], maxFar: 1800, mode: 'practical', shadowMapSize: MAPA_CASCATA[nivel],
      shadowBias: -0.0004, lightDirection: new THREE.Vector3(-0.4, -1, -0.3).normalize(), lightIntensity: 3, lightNear: 1, lightFar: 5200, lightMargin: 320,
    });
    csm.fade = true;
    for (const l of csm.lights) l.shadow.normalBias = 0.6;
    csmRef.current = { csm, id: proximoId++ };
    ultimoVarre.current = 0;
    return () => { csmRef.current = null; csm.remove(); csm.dispose(); };
  }, [usaCSM, nivel, camera, scene]);
  useEffect(() => { csmRef.current?.csm.updateFrustums(); }, [tamanho]);

  useEffect(() => {
    scene.fog = fog;
    return () => { scene.fog = null; };
  }, [scene, fog]);

  // Fase 12: céu HDRI real (Poly Haven, CC0) como luz ambiente e reflexo de vidro, lataria e água
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    let vivo = true;
    let env: THREE.Texture | null = null;
    const pmrem = new THREE.PMREMGenerator(gl);
    new HDRLoader().load(`${import.meta.env.BASE_URL}assets/hdri/kloofendal_48d_partly_cloudy_puresky.hdr`, (hdr) => {
      if (!vivo) { hdr.dispose(); return; }
      hdr.mapping = THREE.EquirectangularReflectionMapping;
      env = pmrem.fromEquirectangular(hdr).texture;
      hdr.dispose();
      scene.environment = env;
    }, undefined, () => { /* sem HDRI: fica a luz hemisférica */ });
    return () => {
      vivo = false;
      if (scene.environment === env) scene.environment = null;
      env?.dispose();
      pmrem.dispose();
    };
  }, [gl, scene]);

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

    const C = csmRef.current;
    if (C) {
      direcaoLuz(dirTmp);
      C.csm.lightDirection.copy(dirTmp).negate();
      for (const l of C.csm.lights) { l.color.copy(ambiente.corSol); l.intensity = ambiente.intensidadeSol; }
      C.csm.update();
      // materiais que entram depois (blocos de prédios, vias…) recebem o CSM em até meio segundo
      ultimoVarre.current += dt;
      if (ultimoVarre.current > 0.5) {
        ultimoVarre.current = 0;
        scene.traverse((o) => {
          const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
          if (!m || !(o as THREE.Mesh).isMesh) return;
          for (const mat of Array.isArray(m) ? m : [m]) if ((mat as THREE.MeshStandardMaterial).isMeshStandardMaterial) ligarCSM(C.csm, C.id, mat as MatCSM);
        });
      }
    }
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
    // com o HDRI, a hemisférica só tinge (pôr do sol, noite) e o céu real faz o grosso da luz ambiente
    const comEnv = scene.environment !== null;
    scene.environmentIntensity = comEnv ? (0.06 + 0.84 * (1 - ambiente.noite)) * (1 - 0.35 * Math.min(1, ambiente.densidadeExtra * 1500)) : 1;
    if (hemi.current) {
      hemi.current.color.copy(ambiente.hemiCeu);
      hemi.current.groundColor.set('#5c5038').lerp(new THREE.Color('#141820'), ambiente.noite);
      hemi.current.intensity = ambiente.intensidadeHemi * (comEnv ? 0.4 : 1);
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
      {!usaCSM && <directionalLight
        key={nivel}
        ref={sol}
        castShadow={SOMBRA[nivel] > 0}
        intensity={3}
        shadow-mapSize={[Math.max(512, SOMBRA[nivel]), Math.max(512, SOMBRA[nivel])]}
        shadow-bias={-0.00025}
        shadow-normalBias={0.8}
      />}
    </>
  );
}
