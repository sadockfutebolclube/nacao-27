/**
 * Mapa de calor da densidade de pedestres (F3, Fase 24): uma malha que acompanha o relevo, colorida pela densidade do modelo
 * (pedestres por 100 m de via) na hora e no dia de agora, vezes o slider global. Azul = pouca gente · verde · amarelo · vermelho
 * = multidão. Só existe com o F3 ligado e a caixa "mapa de calor" marcada.
 */
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { BUILD_HALF } from '../../world/constants';
import { sampleHeight, type Heightmap } from '../../world/terrain';
import { ambiente } from './ambiente';
import { diaDaSemana, fimDeSemana } from './densidade';
import { useDebugMapa } from './estadoDebug';
import { pedDebug, usePedDebug } from './estadoPedestres';
import { useGame } from '../../sim/bridge';

/** densidade (por 100 m de via) que vira vermelho */
export const DENSIDADE_VERMELHA = 40;

/** rampa transparente → azul → verde → amarelo → vermelho, t em [0, 1] */
export function corCalor(t: number, out: [number, number, number, number]) {
  const x = Math.min(1, Math.max(0, t));
  if (x < 0.02) { out[0] = 0; out[1] = 0; out[2] = 0; out[3] = 0; return; }
  const seg = x * 3, i = Math.min(2, Math.floor(seg)), f = seg - i;
  const pal = [[40, 90, 220], [40, 200, 90], [250, 220, 40], [230, 40, 30]];
  for (let c = 0; c < 3; c++) out[c] = pal[i][c] + (pal[i + 1][c] - pal[i][c]) * f;
  out[3] = 150 + 70 * x;
}

export function MapaCalorPedestres({ hm }: { hm: Heightmap }) {
  const d = useDebugMapa();
  const ped = usePedDebug();
  const ligado = d.modo > 0 && ped.mapaCalor && !!ped.dens;
  const rec = useMemo(() => {
    const n = ped.dens?.g.n ?? 1;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = n;
    const tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter; tex.colorSpace = THREE.SRGBColorSpace;
    const seg = Math.max(1, Math.min(191, n - 1));
    const geo = new THREE.PlaneGeometry(2 * BUILD_HALF, 2 * BUILD_HALF, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.getAttribute('position');
    for (let i = 0; i < pos.count; i++) pos.setY(i, Math.max(0, sampleHeight(hm, pos.getX(i), pos.getZ(i))) + 1.2);
    geo.computeBoundingSphere();
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = 50; mesh.frustumCulled = false; mesh.userData.semWireframe = true;
    return { canvas, tex, geo, mat, mesh, chave: '' };
  }, [hm, ped.dens]);
  useEffect(() => () => { rec.tex.dispose(); rec.geo.dispose(); rec.mat.dispose(); }, [rec]);

  useFrame(() => {
    rec.mesh.visible = ligado;
    if (!ligado || !ped.dens) return;
    const st = useGame.getState().stats;
    const dow = ped.diaSemana ?? (st ? diaDaSemana(st.ano, st.mes, st.dia) : 6);
    const hora = ambiente.hora;
    const chave = `${hora.toFixed(1)}|${dow}|${ped.escala}`;
    if (chave === rec.chave) return;
    rec.chave = chave;
    const dens = ped.dens, n = dens.g.n;
    dens.preparar(hora, fimDeSemana(dow));
    const ctx = rec.canvas.getContext('2d')!;
    const img = ctx.createImageData(n, n);
    const c: [number, number, number, number] = [0, 0, 0, 0];
    for (let k = 0; k < n * n; k++) {
      corCalor((dens.celula(k) * ped.escala) / DENSIDADE_VERMELHA, c);
      img.data[k * 4] = c[0]; img.data[k * 4 + 1] = c[1]; img.data[k * 4 + 2] = c[2]; img.data[k * 4 + 3] = c[3];
    }
    ctx.putImageData(img, 0, 0);
    rec.tex.needsUpdate = true;
  });

  return <primitive object={rec.mesh} />;
}

// o slider e a caixa do painel mexem em `pedDebug`; reexportado para o painel não importar o Canvas
export { pedDebug };
