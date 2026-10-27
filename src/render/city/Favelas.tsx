/**
 * Favelas: casas de tijolo baiano e reboco cru, lajes com caixa d'água azul, crescendo encosta
 * acima. Urbanizadas, ganham cores vivas (como os mutirões de pintura das comunidades).
 */
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { mundo, useGame } from '../../sim/bridge';
import { GRUPOS } from '../../sim/city/territorio';
import { sampleHeight, type Heightmap } from '../../world/terrain';
import { criarMaterialFachada } from '../shaders/fachada';
import { ambiente } from './ambiente';
import { clima } from './climaVisual';
import { useFrame } from '@react-three/fiber';

const TIJOLO = ['#a9583a', '#b5653f', '#9c5034', '#b86d47'];
const REBOCO = ['#b4ada0', '#a8a196', '#c2bbae'];
const PINTADAS = ['#f2c14e', '#f78154', '#4d9de0', '#e15554', '#3bb273', '#7768ae', '#ff8fab', '#5bc0eb', '#f4f1de', '#9bc53d'];
const MAX = 20_000;

export function Favelas({ hm }: { hm: Heightmap }) {
  const versao = useGame((s) => s.favelasVersion);
  const camada = useGame((s) => s.camada);
  const uniforms = useMemo(() => ({ uNoite: { value: 0 }, uTempo: { value: 0 }, uCeu: { value: new THREE.Color() }, uCamada: { value: 0 } }), []);
  const mat = useMemo(() => criarMaterialFachada(uniforms), [uniforms]);
  const matCaixa = useMemo(() => new THREE.MeshStandardMaterial({ color: '#1f63b5', roughness: 0.5 }), []);
  const geoCorpo = useMemo(() => {
    const g = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    g.setAttribute('aFachada', new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4));
    return g;
  }, []);
  const geoCaixa = useMemo(() => new THREE.CylinderGeometry(0.5, 0.5, 1, 8).translate(0, 0.5, 0), []);
  useEffect(() => () => { mat.dispose(); matCaixa.dispose(); geoCorpo.dispose(); geoCaixa.dispose(); }, [mat, matCaixa, geoCorpo, geoCaixa]);
  const corpo = useRef<THREE.InstancedMesh>(null);
  const caixa = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const cm = corpo.current, cx = caixa.current;
    if (!cm || !cx) return;
    const C = mundo.favelasCasas, meta = mundo.favelasMeta;
    const n = Math.min(MAX, Math.floor(C.length / 8));
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3();
    const eixo = new THREE.Vector3(0, 1, 0);
    const cor = new THREE.Color();
    const fac = geoCorpo.getAttribute('aFachada') as THREE.InstancedBufferAttribute;
    const arr = fac.array as Float32Array;
    let nc = 0;
    const porTerritorio = camada === 'territorio' || camada === 'crime';
    uniforms.uCamada.value = porTerritorio ? 1 : 0;
    for (let i = 0; i < n; i++) {
      const o = i * 8;
      const x = C[o], z = C[o + 1], ang = C[o + 2], w = C[o + 3], d = C[o + 4], andares = C[o + 5], look = C[o + 6];
      const info = meta[C[o + 7]];
      if (!info) continue;
      // base: menor cota sob a casa (enterra no morro do lado de cima)
      const c = Math.cos(ang), s = Math.sin(ang);
      let base = Infinity;
      for (const [u, v] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) base = Math.min(base, sampleHeight(hm, x + c * u * w + s * v * d, z - s * u * w + c * v * d));
      const H = andares * 2.8 + 0.4;
      q.setFromAxisAngle(eixo, ang);
      p.set(x, base - 0.8, z);
      m.compose(p, q, sc.set(w, H + 0.8, d));
      cm.setMatrixAt(i, m);
      if (porTerritorio) cor.set(GRUPOS[info.grupo].cor);
      else if (info.status === 'urbanizada') cor.set(PINTADAS[Math.floor(look * 997) % PINTADAS.length]);
      else if (look < 0.55) cor.set(TIJOLO[Math.floor(look * 97) % TIJOLO.length]);
      else if (look < 0.85) cor.set(REBOCO[Math.floor(look * 89) % REBOCO.length]);
      else cor.set(PINTADAS[Math.floor(look * 991) % PINTADAS.length]).multiplyScalar(0.8);
      if (info.status === 'removendo') cor.multiplyScalar(0.55);
      cm.setColorAt(i, cor);
      arr[i * 4] = 0; arr[i * 4 + 1] = 2.8; arr[i * 4 + 2] = look * 50; arr[i * 4 + 3] = info.status === 'removendo' ? -1 : 0;
      // caixa d'água na laje
      if ((look * 13) % 1 < 0.6) {
        p.set(x + c * (w * 0.2) , base - 0.8 + H + 0.8, z - s * (w * 0.2));
        m.compose(p, q, sc.set(1.1, 1, 1.1));
        cx.setMatrixAt(nc++, m);
      }
    }
    cm.count = n; cx.count = nc;
    fac.needsUpdate = true;
    cm.instanceMatrix.needsUpdate = true; cx.instanceMatrix.needsUpdate = true;
    if (cm.instanceColor) cm.instanceColor.needsUpdate = true;
    cm.computeBoundingSphere(); cx.computeBoundingSphere();
  }, [versao, camada, hm, geoCorpo, uniforms]);

  useFrame((_, dt) => {
    uniforms.uNoite.value = ambiente.noite * (1 - clima.apagao);
    uniforms.uTempo.value += dt;
    uniforms.uCeu.value.copy(ambiente.corCeu);
  });

  return (
    <group>
      <instancedMesh ref={corpo} args={[geoCorpo, mat, MAX]} castShadow receiveShadow frustumCulled={false} />
      <instancedMesh ref={caixa} args={[geoCaixa, matCaixa, MAX]} castShadow frustumCulled={false} />
    </group>
  );
}
