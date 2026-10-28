/**
 * Estado do modo de depuração do mapa (F3): wireframe, normais do terreno e lista de problemas das vias
 * (enterradas, flutuando, íngremes) e das rotatórias descartadas na geração. Estado de módulo + `useSyncExternalStore`,
 * para o painel (HTML) e o desenho (dentro do Canvas) conversarem sem passar pelo store do jogo.
 */
import { useSyncExternalStore } from 'react';
import { calcadaVia, larguraVia } from '../../world/roads';
import { sampleHeight, type Heightmap } from '../../world/terrain';
import type { Perfil } from './perfilVias';

export interface Problema {
  tipo: 'enterrada' | 'flutuando' | 'ingreme' | 'rotatoria';
  nome: string;
  x: number; z: number;
  /** quanto passa do limite (m para enterrada/flutuando, % para íngreme); 0 nas rotatórias */
  valor: number;
  detalhe: string;
}
export interface EstadoDebug {
  /** 0 desligado · 1 wireframe + painel · 2 também as normais do terreno */
  modo: 0 | 1 | 2;
  problemas: Problema[];
  contagem: { enterrada: number; flutuando: number; ingreme: number; rotatoria: number; trechos: number };
}

let estado: EstadoDebug = { modo: 0, problemas: [], contagem: { enterrada: 0, flutuando: 0, ingreme: 0, rotatoria: 0, trechos: 0 } };
const ouvintes = new Set<() => void>();
const avisar = () => ouvintes.forEach((f) => f());

export const debugMapa = {
  ler: () => estado,
  modo: (m: 0 | 1 | 2) => { estado = { ...estado, modo: m }; avisar(); },
  ciclo: () => debugMapa.modo(((estado.modo + 1) % 3) as 0 | 1 | 2),
  problemas(problemas: Problema[], contagem: EstadoDebug['contagem']) { estado = { ...estado, problemas, contagem }; avisar(); },
  assinar(f: () => void) { ouvintes.add(f); return () => { ouvintes.delete(f); }; },
};
export const useDebugMapa = () => useSyncExternalStore(debugMapa.assinar, debugMapa.ler);

/** Limites do diagnóstico (os mesmos de scripts/auditar-mapa.ts) */
export const LIMITE = { enterrada: 1.2, flutuando: 2.5, grade: 0.18 };

/** Varre os perfis das vias e junta, por trecho, o pior caso de cada tipo de defeito. */
export function diagnosticarVias(perfis: Map<number, Perfil>, hm: Heightmap, descartadas: { nome: string; motivo: string; x: number; z: number }[] = []) {
  const achados: Problema[] = [];
  const contagem = { enterrada: 0, flutuando: 0, ingreme: 0, rotatoria: descartadas.length, trechos: 0 };
  for (const p of perfis.values()) {
    if (p.edge.nivel) continue;
    contagem.trechos++;
    const meia = larguraVia(p.edge) / 2 + calcadaVia(p.edge);
    let pEn = 0, pFl = 0, pIn = 0, iEn = 0, iFl = 0, iIn = 0;
    for (let i = 0; i < p.n; i += 2) {
      const nx = -p.tz[i], nz = p.tx[i];
      const a = sampleHeight(hm, p.x[i] + nx * meia, p.z[i] + nz * meia), b = sampleHeight(hm, p.x[i] - nx * meia, p.z[i] - nz * meia), c = sampleHeight(hm, p.x[i], p.z[i]);
      const en = Math.max(a, b, c) - p.y[i], fl = p.y[i] - Math.min(a, b, c);
      if (en > pEn) { pEn = en; iEn = i; }
      if (fl > pFl && p.y[i] > 3) { pFl = fl; iFl = i; }
      if (i > 0) {
        const g = Math.abs(p.y[i] - p.y[i - 2]) / Math.max(0.5, p.s[i] - p.s[i - 2]);
        if (g > pIn) { pIn = g; iIn = i; }
      }
    }
    const nome = p.edge.name || `trecho ${p.edge.id}`;
    if (pEn > LIMITE.enterrada) { contagem.enterrada++; achados.push({ tipo: 'enterrada', nome, x: p.x[iEn], z: p.z[iEn], valor: pEn, detalhe: `morro ${pEn.toFixed(1)} m acima do asfalto` }); }
    if (pFl > LIMITE.flutuando) { contagem.flutuando++; achados.push({ tipo: 'flutuando', nome, x: p.x[iFl], z: p.z[iFl], valor: pFl, detalhe: `${pFl.toFixed(1)} m de vão sob o asfalto` }); }
    if (pIn > LIMITE.grade) { contagem.ingreme++; achados.push({ tipo: 'ingreme', nome, x: p.x[iIn], z: p.z[iIn], valor: pIn * 100, detalhe: `rampa de ${(pIn * 100).toFixed(0)}%` }); }
  }
  for (const d of descartadas) achados.push({ tipo: 'rotatoria', nome: d.nome || 'sem nome', x: d.x, z: d.z, valor: 0, detalhe: d.motivo });
  achados.sort((u, v) => (v.tipo === 'rotatoria' ? 0 : v.valor) - (u.tipo === 'rotatoria' ? 0 : u.valor));
  const lista = achados.filter((a) => a.tipo !== 'rotatoria').slice(0, 300).concat(achados.filter((a) => a.tipo === 'rotatoria'));
  debugMapa.problemas(lista, contagem);
  if (contagem.enterrada + contagem.flutuando + contagem.ingreme + contagem.rotatoria > 0) {
    console.info(`[mapa] vias: ${contagem.trechos} trechos · ${contagem.enterrada} enterradas · ${contagem.flutuando} flutuando · ${contagem.ingreme} íngremes · ${contagem.rotatoria} rotatórias descartadas`);
  }
  return lista;
}
