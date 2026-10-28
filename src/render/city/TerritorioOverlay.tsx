/**
 * Mapa de controle territorial (camada "Território", tecla T): células de 64 m tingidas pela facção que domina (Milícia, CV, ADA,
 * TCP — cores em src/data/seguranca/faccoes.json), âmbar onde o domínio ainda é fraco/disputado, e os contornos dos polígonos de
 * bairro do Censo por cima. Presença do Estado fica limpa.
 */
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { mundo, useGame } from '../../sim/bridge';
import { censo } from '../../data/bairros';
import { DADOS } from '../../sim/faccoes/dados';
import { TERR_CELL, TERR_RES } from '../../sim/city/territorio';
import { BUILD_HALF } from '../../world/constants';
import { sampleHeight, type Heightmap } from '../../world/terrain';

const SUB = 8; // subdivisões por célula (8 m, a resolução do relevo) para não afundar nas encostas

export function TerritorioOverlay({ hm }: { hm: Heightmap }) {
  const camada = useGame((s) => s.camada);
  const versao = useGame((s) => s.territorioVersion);
  const visivel = camada === 'territorio';
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 }), []);
  useEffect(() => () => mat.dispose(), [mat]);

  const geo = useMemo(() => {
    if (!visivel) return null;
    const F = mundo.territorioF, M = mundo.territorioM;
    if (!F.length) return null;
    const pos: number[] = [], col: number[] = [], idx: number[] = [];
    const cores = DADOS.faccoes.ordem.map((id) => new THREE.Color(DADOS.faccoes.faccoes[id].cor));
    const dono = mundo.faccoesDono;
    const cD = new THREE.Color('#f5b942');
    const c = new THREE.Color();
    for (let j = 0; j < TERR_RES; j++) for (let i = 0; i < TERR_RES; i++) {
      const k = j * TERR_RES + i;
      const f = F[k], m = M[k], forca = Math.max(f, m);
      if (forca < 0.08) continue;
      if (forca < 0.3) c.copy(cD).multiplyScalar(0.4 + forca);
      else {
        const d = dono[k] ? dono[k] - 1 : (f >= m ? 1 : 0);
        const cf = cores[d] ?? cores[0];
        if (forca < 0.6) c.copy(cD).lerp(cf, (forca - 0.3) / 0.3); else c.copy(cf);
      }
      const x0 = -BUILD_HALF + i * TERR_CELL, z0 = -BUILD_HALF + j * TERR_CELL;
      const base = pos.length / 3;
      for (let b = 0; b <= SUB; b++) for (let a = 0; a <= SUB; a++) {
        const x = x0 + (a / SUB) * TERR_CELL, z = z0 + (b / SUB) * TERR_CELL;
        // afasta da superfície ao longo da normal: em paredões, um deslocamento só vertical some
        const h = sampleHeight(hm, x, z);
        const gx = (sampleHeight(hm, x + 4, z) - sampleHeight(hm, x - 4, z)) / 8, gz = (sampleHeight(hm, x, z + 4) - sampleHeight(hm, x, z - 4)) / 8;
        const inv = 3 / Math.hypot(gx, 1, gz);
        pos.push(x - gx * inv, Math.max(0.2, h) + inv, z - gz * inv);
        col.push(c.r, c.g, c.b);
      }
      for (let b = 0; b < SUB; b++) for (let a = 0; a < SUB; a++) {
        const v = base + b * (SUB + 1) + a;
        idx.push(v, v + SUB + 1, v + 1, v + 1, v + SUB + 1, v + SUB + 2);
      }
    }
    if (!pos.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeBoundingSphere();
    return g;
  }, [visivel, versao, hm]);
  useEffect(() => () => geo?.dispose(), [geo]);

  // contornos dos polígonos de bairro (Censo/IPP), seguindo o relevo
  const bordas = useMemo(() => {
    if (!visivel || !censo.bairros) return null;
    const pos: number[] = [];
    const lim = BUILD_HALF + 300;
    for (const b of censo.bairros) for (const anel of b.aneis) {
      const n = anel.length / 2;
      for (let i = 0; i < n; i++) {
        const x0 = anel[i * 2], z0 = anel[i * 2 + 1], x1 = anel[((i + 1) % n) * 2], z1 = anel[((i + 1) % n) * 2 + 1];
        if (Math.abs(x0) > lim || Math.abs(z0) > lim) continue;
        const passos = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 40));
        for (let s = 0; s < passos; s++) {
          const a0 = s / passos, a1 = (s + 1) / passos;
          const xa = x0 + (x1 - x0) * a0, za = z0 + (z1 - z0) * a0, xb = x0 + (x1 - x0) * a1, zb = z0 + (z1 - z0) * a1;
          pos.push(xa, Math.max(0.3, sampleHeight(hm, xa, za)) + 4, za, xb, Math.max(0.3, sampleHeight(hm, xb, zb)) + 4, zb);
        }
      }
    }
    if (!pos.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    return g;
  }, [visivel, hm, versao]);
  useEffect(() => () => bordas?.dispose(), [bordas]);
  const matBorda = useMemo(() => new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.55, depthWrite: false }), []);
  useEffect(() => () => matBorda.dispose(), [matBorda]);

  if (!geo && !bordas) return null;
  return (
    <group>
      {geo && <mesh geometry={geo} material={mat} renderOrder={3} />}
      {bordas && <lineSegments geometry={bordas} material={matBorda} renderOrder={4} />}
    </group>
  );
}
