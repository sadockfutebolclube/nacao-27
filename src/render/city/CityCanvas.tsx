/** Composição da Visão Cidade: mundo, ferramentas e pós-processamento cinematográfico. */
import { Canvas } from '@react-three/fiber';
import { PerformanceMonitor } from '@react-three/drei';
import { useApp } from '../../app/store';
import { DPR, useAutoQualidade, useNivel } from '../qualidade';
import { Bloom, EffectComposer, N8AO, SMAA, TiltShift2, ToneMapping, Vignette, HueSaturation } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import { Suspense } from 'react';
import * as THREE from 'three';
import { useGame } from '../../sim/bridge';
import type { Heightmap } from '../../world/terrain';
import { Agua } from './Agua';
import { Arvores } from './Arvores';
import { CameraRig } from './Camera';
import { CeuLuz } from './CeuLuz';
import { ClimaFx } from './ClimaFx';
import { Edificios } from './Edificios';
import { Equipamentos } from './Equipamentos';
import { Ferramentas } from './Ferramentas';
import { Terreno } from './Terreno';
import { Favelas } from './Favelas';
import { Pedestres } from './Pedestres';
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
      <ToneMapping mode={ToneMappingMode.AGX} />
      <Vignette offset={0.3} darkness={0.55} />
    </EffectComposer>
  );
  if (nivel === 'media') return (
    <EffectComposer key={`media${tilt}`} multisampling={0} enableNormalPass={false}>
      <Bloom mipmapBlur intensity={0.75} luminanceThreshold={1.05} luminanceSmoothing={0.2} />
      <HueSaturation saturation={0.08} />
      {tilt ? <TiltShift2 blur={0.22} taper={0.55} /> : <></>}
      <ToneMapping mode={ToneMappingMode.AGX} />
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
      <ToneMapping mode={ToneMappingMode.AGX} />
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

export function CityCanvas({ hm, latitude, inicio }: { hm: Heightmap; latitude: number; inicio: [number, number] }) {
  const nivel = useNivel();
  return (
    <Canvas
      shadows={{ type: THREE.PCFShadowMap }}
      dpr={DPR[nivel]}
      camera={{ fov: 45, near: 2, far: 30000, position: [0, 400, 600] }}
      gl={{ antialias: false, toneMapping: THREE.NoToneMapping, powerPreference: 'high-performance', logarithmicDepthBuffer: false }}
      onCreated={(estado) => {
        // gancho de depuração só em desenvolvimento
        if (import.meta.env.DEV) (window as unknown as { __n27: unknown }).__n27 = estado;
      }}
    >
      <Suspense fallback={null}>
        <CeuLuz latitude={latitude} />
        <Terreno hm={hm} />
        <Agua hm={hm} />
        <Vias hm={hm} />
        <Edificios hm={hm} />
        <Equipamentos hm={hm} />
        <Arvores hm={hm} />
        <Favelas hm={hm} />
        <TerritorioOverlay hm={hm} />
        <TransporteRender hm={hm} />
        <Veiculos />
        <Pedestres />
        <ClimaFx hm={hm} />
        <Ferramentas hm={hm} />
        <CameraRig hm={hm} inicio={inicio} />
        <PosProcesso />
        <MonitorDesempenho />
      </Suspense>
    </Canvas>
  );
}
