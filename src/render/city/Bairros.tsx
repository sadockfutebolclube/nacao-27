/**
 * Nomes dos bairros do Rio flutuando sobre o mapa (Fase 16), do OpenStreetMap (place=suburb/neighbourhood/
 * quarter). Os bairros grandes aparecem de longe; as comunidades e sub-bairros só de perto. O texto tem
 * tamanho fixo na tela (sprites sem atenuação) e some quando o prédio ou o morro está na frente.
 */
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { mundo } from '../../sim/bridge';
import { sampleHeight, type Heightmap } from '../../world/terrain';
import { alvoCamera } from './Camera';

/** até que distância (m) da câmera cada tipo de nome aparece */
const ALCANCE = [5200, 1500];
const MAX_VISIVEIS = 36;

function etiqueta(texto: string, tipo: number): { tex: THREE.CanvasTexture; w: number; h: number } {
  const px = tipo === 0 ? 46 : 30;
  const c = document.createElement('canvas');
  const x = c.getContext('2d')!;
  x.font = `600 ${px}px "Barlow Condensed", "Inter", sans-serif`;
  const w = Math.ceil(x.measureText(texto).width) + 24, h = px + 18;
  c.width = w; c.height = h;
  x.font = `600 ${px}px "Barlow Condensed", "Inter", sans-serif`;
  x.textBaseline = 'middle'; x.textAlign = 'center';
  x.lineJoin = 'round'; x.lineWidth = 7; x.strokeStyle = 'rgba(8,16,14,0.85)';
  x.strokeText(texto, w / 2, h / 2 + 1);
  x.fillStyle = tipo === 0 ? '#fff6dc' : '#bfe8d6';
  x.fillText(texto, w / 2, h / 2 + 1);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  return { tex, w, h };
}

export function Bairros({ hm }: { hm: Heightmap }) {
  const real = mundo.real;
  const { camera, size } = useThree();
  const grupo = useRef<THREE.Group>(null);
  const pool = useRef(new Map<number, THREE.Sprite>());
  const relogio = useRef(0);

  const lista = useMemo(() => {
    const b = real?.bairros, nomes = real?.nomesBairros;
    if (!b || !nomes) return [];
    const out: { i: number; x: number; z: number; y: number; tipo: number; nome: string }[] = [];
    for (let k = 0; k < b.length; k += 4) out.push({ i: k / 4, x: b[k], z: b[k + 1], y: Math.max(2, sampleHeight(hm, b[k], b[k + 1])), tipo: b[k + 2], nome: nomes[b[k + 3]] });
    return out;
  }, [real, hm]);

  useEffect(() => () => {
    for (const s of pool.current.values()) { (s.material as THREE.SpriteMaterial).map?.dispose(); s.material.dispose(); }
    pool.current.clear();
  }, [lista]);

  useFrame((_, dt) => {
    relogio.current += dt;
    if (relogio.current < 0.35 || !grupo.current) return;
    relogio.current = 0;
    const alvo = alvoCamera();
    const dc = camera.position.distanceTo(alvo);
    // câmera muito alta (mapa inteiro): só os bairros; perto do chão: bairros e comunidades
    const alcanceBase = Math.max(1800, dc * 1.5);
    const cand: { it: (typeof lista)[number]; d: number }[] = [];
    for (const it of lista) {
      const d = Math.hypot(it.x - alvo.x, it.z - alvo.z);
      if (d < Math.min(ALCANCE[it.tipo] ?? 1200, alcanceBase)) cand.push({ it, d });
    }
    cand.sort((a, b) => a.d - b.d);
    const escolhidos = new Set(cand.slice(0, MAX_VISIVEIS).map((c) => c.it.i));
    for (const [i, s] of pool.current) if (!escolhidos.has(i)) { grupo.current.remove(s); (s.material as THREE.SpriteMaterial).map?.dispose(); s.material.dispose(); pool.current.delete(i); }
    for (const { it } of cand.slice(0, MAX_VISIVEIS)) {
      if (pool.current.has(it.i)) continue;
      const { tex, w, h } = etiqueta(it.nome, it.tipo);
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, sizeAttenuation: false, fog: false });
      const s = new THREE.Sprite(mat);
      // altura em fração da tela: ~3,4% (bairro) ou ~2,3% (comunidade); a largura segue o texto
      const alturaTela = it.tipo === 0 ? 0.034 : 0.023;
      s.scale.set((alturaTela * w) / h, alturaTela, 1);
      s.position.set(it.x, it.y + (it.tipo === 0 ? 55 : 30), it.z);
      s.renderOrder = 20;
      grupo.current.add(s);
      pool.current.set(it.i, s);
    }
    void size;
  });

  return <group ref={grupo} />;
}
