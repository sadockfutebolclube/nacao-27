/**
 * Mapa de controle territorial (camada "Território"): células de 64 m tingidas pelo grupo que
 * domina — vermelho (facção), roxo (milícia), âmbar (disputado). Presença do Estado fica limpa.
 */
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { mundo, useGame } from '../../sim/bridge';
import { GRUPOS, TERR_CELL, TERR_RES } from '../../sim/city/territorio';
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
    const cF = new THREE.Color(GRUPOS[1].cor), cM = new THREE.Color(GRUPOS[2].cor), cD = new THREE.Color('#f5b942');
    const c = new THREE.Color();
    for (let j = 0; j < TERR_RES; j++) for (let i = 0; i < TERR_RES; i++) {
      const k = j * TERR_RES + i;
      const f = F[k], m = M[k], forca = Math.max(f, m);
      if (forca < 0.08) continue;
      if (forca < 0.3) c.copy(cD).multiplyScalar(0.4 + forca);
      else if (forca < 0.6) c.copy(cD).lerp(f >= m ? cF : cM, (forca - 0.3) / 0.3);
      else c.copy(f >= m ? cF : cM);
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

  if (!geo) return null;
  return <mesh geometry={geo} material={mat} renderOrder={3} />;
}
