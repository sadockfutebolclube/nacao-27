/** Composição da Visão Cidade: mundo, ferramentas e pós-processamento cinematográfico. */
import { Canvas, useFrame } from '@react-three/fiber';
import { PerformanceMonitor } from '@react-three/drei';
import { useApp } from '../../app/store';
import { DPR, useAutoQualidade, useNivel } from '../qualidade';
import { Bloom, EffectComposer, N8AO, SMAA, TiltShift2, ToneMapping, Vignette, HueSaturation } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import { Suspense, useRef } from 'react';
import * as THREE from 'three';
import { useGame } from '../../sim/bridge';
import type { Heightmap } from '../../world/terrain';
import { Agua } from './Agua';
import { Arvores } from './Arvores';
import { CameraRig } from './Camera';
import { CeuLuz } from './CeuLuz';
import { ClimaFx } from './ClimaFx';
import { Edificios } from './Edificios';
import { PrediosReais } from './PrediosReais';
import { Marcos } from './Marcos';
import { Turismo } from './Turismo';
import { Praia } from './Praia';
import { Orla } from './Orla';
import { TourTurismo } from './TourTurismo';
import { Bairros } from './Bairros';
import { Onibus } from './Onibus';
import { Trilhos } from './Trilhos';
import { Caminhos } from './Caminhos';
import { DebugMapa } from './DebugMapa';
import { Equipamentos } from './Equipamentos';
import { Ferramentas } from './Ferramentas';
import { Terreno } from './Terreno';
import { Favelas } from './Favelas';
import { Pedestres } from './Pedestres';
import { Visitantes } from './Visitantes';
import { MapaCalorPedestres } from './MapaCalorPedestres';
import { Selecao } from './Selecao';
import { Ocorrencias } from './Ocorrencias';
import { VeiculosEspeciais } from './VeiculosEspeciais';
import { SaoJanuario } from './SaoJanuario';
import { TerritorioOverlay } from './TerritorioOverlay';
import { TransporteRender } from './TransporteRender';
import { Veiculos } from './Veiculos';
import { Vias } from './Vias';

function PosProcesso() {
  const tilt = useGame((s) => s.tiltShift);
  const nivel = useNivel();
  // a composição é remontada por nível (o EffectComposer não lida bem com passes que somem)
  if (nivel === 'baixa') return (
    <EffectComposer key="baixa" multisampling={0} enableNormalPass={false}>
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <Vignette offset={0.3} darkness={0.55} />
    </EffectComposer>
  );
  if (nivel === 'media') return (
    <EffectComposer key={`media${tilt}`} multisampling={0} enableNormalPass={false}>
      <N8AO halfRes aoRadius={5} distanceFalloff={1.2} intensity={1.5} quality="performance" />
      <Bloom mipmapBlur intensity={0.75} luminanceThreshold={1.05} luminanceSmoothing={0.2} />
      <HueSaturation saturation={0.08} />
      {tilt ? <TiltShift2 blur={0.22} taper={0.55} /> : <></>}
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <Vignette offset={0.3} darkness={0.55} />
      <SMAA />
    </EffectComposer>
  );
  return (
    <EffectComposer key={`alta${tilt}`} multisampling={0} enableNormalPass={false}>
      <N8AO halfRes aoRadius={7} distanceFalloff={1.2} intensity={2.4} quality="medium" />
      <Bloom mipmapBlur intensity={0.85} luminanceThreshold={1.05} luminanceSmoothing={0.2} />
      <HueSaturation saturation={0.08} />
      {tilt ? <TiltShift2 blur={0.22} taper={0.55} /> : <></>}
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <Vignette offset={0.3} darkness={0.55} />
      <SMAA />
    </EffectComposer>
  );
}

/** Modo automático: desce um nível quando o FPS cai, sobe com folga; depois de 3 trocas, fixa. */
function MonitorDesempenho() {
  const pref = useApp((s) => s.qualidade);
  const { baixar, subir } = useAutoQualidade.getState();
  if (pref !== 'auto') return null;
  return <PerformanceMonitor bounds={() => [38, 58]} flipflops={3} onDecline={baixar} onIncline={subir} onFallback={() => useAutoQualidade.getState().fixar('media')} />;
}

/**
 * Depuração (só no dev): `localStorage['n27:desligar'] = 'Vias,Arvores'` tira componentes da cena para achar
 * o que pesa. Em produção tudo fica ligado.
 */
const DESLIGADOS = new Set(import.meta.env.DEV ? (() => { try { return (localStorage.getItem('n27:desligar') ?? '').split(',').map((x) => x.trim()).filter(Boolean); } catch { return []; } })() : []);
const liga = (nome: string) => !DESLIGADOS.has(nome);

/** Só no dev: avisa quando um quadro demora mais de 1 s (e quantos shaders já foram compilados). */
function VigiaQuadros() {
  const ultimo = useRef(0);
  useFrame(({ gl }) => {
    const agora = performance.now();
    if (ultimo.current && agora - ultimo.current > 1000) console.warn(`[lento] quadro: ${Math.round(agora - ultimo.current)} ms · shaders ${gl.info.programs?.length ?? '?'}`);
    ultimo.current = agora;
  });
  return null;
}

export function CityCanvas({ hm, latitude, inicio }: { hm: Heightmap; latitude: number; inicio: [number, number] }) {
  const nivel = useNivel();
  return (
    <Canvas
      shadows={{ type: THREE.PCFShadowMap }}
      dpr={DPR[nivel]}
      camera={{ fov: 45, near: 3, far: 30000, position: [0, 400, 600] }}
      gl={{ antialias: false, toneMapping: THREE.NoToneMapping, powerPreference: 'high-performance', logarithmicDepthBuffer: false }}
      onCreated={(estado) => {
        // gancho de depuração só em desenvolvimento
        if (import.meta.env.DEV) (window as unknown as { __n27: unknown }).__n27 = estado;
      }}
    >
      <Suspense fallback={null}>
        <CeuLuz latitude={latitude} />
        {liga('Terreno') && <Terreno hm={hm} />}
        {liga('Agua') && <Agua hm={hm} />}
        {liga('Vias') && <Vias hm={hm} />}
        {liga('Caminhos') && <Caminhos hm={hm} />}
        {liga('Edificios') && <Edificios hm={hm} />}
        {liga('PrediosReais') && <PrediosReais />}
        {liga('Marcos') && <Marcos hm={hm} />}
        {liga('Turismo') && <Turismo hm={hm} />}
        {liga('SaoJanuario') && <SaoJanuario hm={hm} />}
        {liga('Praia') && <Praia hm={hm} />}
        {liga('Orla') && <Orla hm={hm} />}
        {liga('Bairros') && <Bairros hm={hm} />}
        {liga('Equipamentos') && <Equipamentos hm={hm} />}
        {liga('Arvores') && <Arvores hm={hm} />}
        {liga('Favelas') && <Favelas hm={hm} />}
        {liga('TerritorioOverlay') && <TerritorioOverlay hm={hm} />}
        {liga('TransporteRender') && <TransporteRender hm={hm} />}
        {liga('Veiculos') && <Veiculos />}
        {liga('Onibus') && <Onibus hm={hm} />}
        {liga('Trilhos') && <Trilhos hm={hm} />}
        <DebugMapa hm={hm} />
        <MapaCalorPedestres hm={hm} />
        <Selecao />
        <Ocorrencias hm={hm} />
        {liga('VeiculosEspeciais') && <VeiculosEspeciais hm={hm} />}
        {liga('Pedestres') && <Pedestres hm={hm} />}
        {liga('Visitantes') && <Visitantes hm={hm} />}
        {liga('ClimaFx') && <ClimaFx hm={hm} />}
        {liga('Ferramentas') && <Ferramentas hm={hm} />}
        <CameraRig hm={hm} inicio={inicio} />
        <TourTurismo hm={hm} />
        {liga('PosProcesso') && <PosProcesso />}
        <MonitorDesempenho />
        {import.meta.env.DEV && <VigiaQuadros />}
      </Suspense>
    </Canvas>
  );
}
