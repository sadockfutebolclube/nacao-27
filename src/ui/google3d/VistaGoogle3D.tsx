/**
 * Vista Google 3D (Fase 12): a cidade de verdade nos Photorealistic 3D Tiles do Google, transmitidos ao
 * vivo pela Map Tiles API com a chave do próprio jogador — o único uso que os termos do Google
 * permitem: nada é baixado, guardado ou convertido em modelo do jogo, e a atribuição fica na tela.
 * Abre no ponto para onde a câmera da cidade está olhando.
 *
 * Chave: VITE_GOOGLE_MAPS_KEY no .env.local, ou digitada aqui (fica só neste navegador).
 */
import { Canvas } from '@react-three/fiber';
import { EnvironmentControls, TilesAttributionOverlay, TilesPlugin, TilesRenderer } from '3d-tiles-renderer/r3f';
import { GoogleCloudAuthPlugin, ReorientationPlugin, TilesFadePlugin } from '3d-tiles-renderer/plugins';
import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import * as THREE from 'three';
import { mundo } from '../../sim/bridge';
import { alvoCamera } from '../../render/city/Camera';

const CHAVE_LOCAL = 'nacao27:googleMapsKey';

function chaveSalva(): string {
  const env = import.meta.env.VITE_GOOGLE_MAPS_KEY as string | undefined;
  if (env) return env;
  try { return localStorage.getItem(CHAVE_LOCAL) ?? ''; } catch { return ''; }
}

export default function VistaGoogle3D({ fechar }: { fechar: () => void }) {
  const [chave, setChave] = useState(chaveSalva);
  const [rascunho, setRascunho] = useState('');
  const real = mundo.real;

  // ponto que a câmera da cidade olha, convertido para latitude/longitude
  const alvo = useMemo(() => {
    if (!real) return null;
    const a = alvoCamera();
    const kx = 111_320 * Math.cos((real.lat * Math.PI) / 180), kz = 110_574;
    return { lat: real.lat - a.z / kz, lon: real.lon + a.x / kx };
  }, [real]);

  // portal: o painel Visual tem transform (animação), que prenderia o position: fixed
  return createPortal(
    <div className="fixed inset-0 z-50 bg-black pointer-events-auto">
      {chave && alvo ? (
        <Canvas camera={{ position: [250, 380, 520], near: 1, far: 200_000, fov: 45 }} gl={{ antialias: true }} onCreated={({ camera }) => camera.lookAt(0, 0, 0)}>
          <color attach="background" args={['#b9d3ea']} />
          <TilesRenderer key={chave} url="https://tile.googleapis.com/v1/3dtiles/root.json">
            <TilesPlugin plugin={GoogleCloudAuthPlugin} args={[{ apiToken: chave, autoRefreshToken: true, useRecommendedSettings: true }]} />
            <TilesPlugin plugin={ReorientationPlugin} args={[{ lat: alvo.lat * THREE.MathUtils.DEG2RAD, lon: alvo.lon * THREE.MathUtils.DEG2RAD, height: 0, up: '+y', recenter: true }]} />
            <TilesPlugin plugin={TilesFadePlugin} />
            <EnvironmentControls enableDamping minDistance={30} maxDistance={8000} />
            <TilesAttributionOverlay />
          </TilesRenderer>
        </Canvas>
      ) : (
        <div className="h-full flex items-center justify-center p-6">
          <div className="painel rounded-xl p-5 max-w-lg text-sm space-y-3">
            <h2 className="titulo text-lg">Vista Google 3D</h2>
            {!real ? (
              <p>Disponível nas cidades reais (OpenStreetMap). Comece um jogo com “cidade real” ligado.</p>
            ) : (
              <>
                <p>
                  Mostra {real.nome} nos <b>Photorealistic 3D Tiles</b> do Google, ao vivo. É preciso uma chave da
                  <b> Map Tiles API</b> (Google Cloud, com faturamento ativo; o Google cobra por sessão acima da cota gratuita).
                </p>
                <p className="text-suave text-xs">
                  Pelos termos do Google, os tiles só podem ser exibidos ao vivo, com a atribuição na tela — o jogo não baixa,
                  não guarda e não transforma os modelos do Google. Os prédios jogáveis continuam vindo do OpenStreetMap.
                </p>
                <p className="text-suave text-xs">Também dá para definir <code>VITE_GOOGLE_MAPS_KEY</code> no arquivo <code>.env.local</code>.</p>
                <div className="flex gap-2">
                  <input type="password" value={rascunho} onChange={(e) => setRascunho(e.target.value)} placeholder="Chave da API (fica só neste navegador)" className="flex-1 bg-black/40 border border-borda rounded px-2 py-1.5" />
                  <button
                    onClick={() => { const k = rascunho.trim(); if (!k) return; try { localStorage.setItem(CHAVE_LOCAL, k); } catch { /* sessão só */ } setChave(k); }}
                    className="px-3 py-1.5 rounded bg-acento text-tinta font-semibold"
                  >Usar chave</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
      <div className="absolute top-3 right-3 flex gap-2">
        {chave && !import.meta.env.VITE_GOOGLE_MAPS_KEY && (
          <button onClick={() => { try { localStorage.removeItem(CHAVE_LOCAL); } catch { /* nada */ } setChave(''); }} className="painel rounded px-3 py-1.5 text-xs">Esquecer chave</button>
        )}
        <button onClick={fechar} className="painel rounded px-3 py-1.5 text-sm font-semibold">Voltar ao jogo (Esc)</button>
      </div>
    </div>,
    document.body,
  );
}
