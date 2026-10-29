/**
 * Camada "defeitos" do F3 (Fase 33): marca no mapa os piores pontos que o detector (`tools/detectar-defeitos-vias.ts`) achou, uma coluna
 * colorida por categoria. Os pontos vêm de `public/data/debug/defeitos-vias.json`, gerado pelo detector (o arquivo é do mapa de 28/10/2026:
 * rode `npm run detectar-defeitos` depois de mexer em relevo, vias ou prédios). Só carrega com o F3 ligado e a caixa "defeitos" marcada.
 */
import { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { sampleHeight, type Heightmap } from '../../world/terrain';
import { useDebugMapa } from './estadoDebug';

export const CORES_DEFEITO: Record<string, string> = {
  lascas: '#ffffff', normaisInvertidas: '#ff3df2', verticesIsolados: '#b5ff3d', taludesSobrepostos: '#ffe03d', morroAoLado: '#ff8a3d', quedaLateral: '#3dd6ff',
  pontasQuaseConectadas: '#ff3d3d', saltosNoNo: '#ff0000', cruzamentosSemNo: '#ff5500', prediosInclinados: '#8a6bff', prediosEnfiados: '#6bffb0', propsForaDaSuperficie: '#ffa6c9',
};
export const ROTULO_DEFEITO: Record<string, string> = {
  lascas: 'lascas de talude', normaisInvertidas: 'normais invertidas', verticesIsolados: 'vértices soltos', taludesSobrepostos: 'taludes sobrepostos', morroAoLado: 'morro ao lado da rua',
  quedaLateral: 'queda lateral', pontasQuaseConectadas: 'pontas quase conectadas', saltosNoNo: 'saltos de cota em nó', cruzamentosSemNo: 'cruzamentos sem nó em cotas diferentes', prediosInclinados: 'prédios inclinados', prediosEnfiados: 'prédios enfiados no morro', propsForaDaSuperficie: 'postes fora da superfície',
};
export interface DadosDefeitos { rotulo: string; contagem: Record<string, number>; pontos: Record<string, { x: number; z: number; v: number }[]> }

/** ligado pelo painel F3 (caixa "defeitos"); módulo à parte do estado do F3 para não recompilar o painel inteiro */
export const camadaDefeitos = { ligada: false, ouvintes: new Set<() => void>(), ligar(v: boolean) { this.ligada = v; this.ouvintes.forEach((f) => f()); } };

export function DefeitosVias({ hm }: { hm: Heightmap }) {
  const d = useDebugMapa();
  const [ligada, setLigada] = useState(camadaDefeitos.ligada);
  const [dados, setDados] = useState<DadosDefeitos | null>(null);
  useEffect(() => { const f = () => setLigada(camadaDefeitos.ligada); camadaDefeitos.ouvintes.add(f); return () => { camadaDefeitos.ouvintes.delete(f); }; }, []);
  useEffect(() => {
    if (!(d.modo > 0 && ligada) || dados) return;
    fetch('./data/debug/defeitos-vias.json').then((r) => r.json()).then((j: DadosDefeitos) => setDados(j)).catch((e) => console.warn('[defeitos]', e));
  }, [d.modo, ligada, dados]);
  const malha = useMemo(() => {
    if (!dados) return null;
    const lista: { x: number; y: number; z: number; c: THREE.Color }[] = [];
    for (const [cat, pts] of Object.entries(dados.pontos)) {
      const cor = new THREE.Color(CORES_DEFEITO[cat] ?? '#ffffff');
      for (const p of pts.slice(0, 200)) lista.push({ x: p.x, y: Math.max(0, sampleHeight(hm, p.x, p.z)), z: p.z, c: cor });
    }
    const geo = new THREE.CylinderGeometry(0.6, 0.6, 30, 5).translate(0, 15, 0);
    const mat = new THREE.MeshBasicMaterial({ toneMapped: false });
    const im = new THREE.InstancedMesh(geo, mat, Math.max(1, lista.length));
    const m = new THREE.Matrix4();
    lista.forEach((l, i) => { im.setMatrixAt(i, m.makeTranslation(l.x, l.y, l.z)); im.setColorAt(i, l.c); });
    im.count = lista.length; im.frustumCulled = false;
    return im;
  }, [dados, hm]);
  useEffect(() => () => { malha?.geometry.dispose(); (malha?.material as THREE.Material | undefined)?.dispose(); malha?.dispose(); }, [malha]);
  return malha && d.modo > 0 && ligada ? <primitive object={malha} /> : null;
}
