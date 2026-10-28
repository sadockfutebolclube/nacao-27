/**
 * Estado do modo de depuração do mapa (F3): wireframe, normais do terreno e lista de problemas das vias por trecho
 * (morro sobre o asfalto, vão sob a rua, rampa) com a inclinação máxima de cada um, mais o que foi tratado (muros,
 * pontes, túneis) e as rotatórias descartadas na geração. Estado de módulo + `useSyncExternalStore`, para o painel
 * (HTML) e o desenho (dentro do Canvas) conversarem sem passar pelo store do jogo.
 */
import { useSyncExternalStore } from 'react';
import { larguraVia } from '../../world/roads';
import { GRADE_ALVO } from '../../world/regrade';
import { sampleHeight, type Heightmap } from '../../world/terrain';
import type { Perfil } from './perfilVias';

export interface Problema {
  /** morro sobre o asfalto · vão sob a rua · rampa acima do alvo · rotatória descartada */
  tipo: 'morro' | 'vao' | 'rampa' | 'rotatoria' | 'solta' | 'predio';
  nome: string;
  x: number; z: number;
  /** quanto passa do limite (m para morro/vão, % para rampa); 0 nas rotatórias */
  valor: number;
  /** inclinação máxima do trecho (%) */
  inclinacao: number;
  detalhe: string;
}
export interface Contagem {
  morro: number; vao: number; rampa: number; rotatoria: number; trechos: number; muro: number; ponte: number; tunel: number;
  /** Fase 21: vias soltas que o gerador tirou, prédios deslocados e removidos por invadir a pista, minirrotatórias */
  solta: number; predioDeslocado: number; predioRemovido: number; minirrotatoria: number;
}
export interface EstadoDebug {
  /** 0 desligado · 1 wireframe + painel · 2 também as normais do terreno */
  modo: 0 | 1 | 2;
  problemas: Problema[];
  contagem: Contagem;
}

const vazia = (): Contagem => ({ morro: 0, vao: 0, rampa: 0, rotatoria: 0, trechos: 0, muro: 0, ponte: 0, tunel: 0, solta: 0, predioDeslocado: 0, predioRemovido: 0, minirrotatoria: 0 });
let estado: EstadoDebug = { modo: 0, problemas: [], contagem: vazia() };
const ouvintes = new Set<() => void>();
const avisar = () => ouvintes.forEach((f) => f());

export const debugMapa = {
  ler: () => estado,
  modo: (m: 0 | 1 | 2) => { estado = { ...estado, modo: m }; avisar(); },
  ciclo: () => debugMapa.modo(((estado.modo + 1) % 3) as 0 | 1 | 2),
  problemas(problemas: Problema[], contagem: Contagem) { estado = { ...estado, problemas, contagem }; avisar(); },
  assinar(f: () => void) { ouvintes.add(f); return () => { ouvintes.delete(f); }; },
};
export const useDebugMapa = () => useSyncExternalStore(debugMapa.assinar, debugMapa.ler);

/** Limites do diagnóstico (os mesmos de scripts/auditar-mapa.ts): terreno acima do asfalto na pista, vão sob a pista, rampa */
export const LIMITE = { morro: 0.5, vao: 3, rampa: GRADE_ALVO + 0.005 };

/**
 * Varre os perfis das vias e junta, por trecho, o pior caso de cada defeito. Seções de muro de arrimo, pontes e
 * túneis são tratamentos, não defeitos: entram só na contagem.
 */
export interface Removidos { vias: { nome: string; motivo: string; x: number; z: number }[]; prediosSobreVias: number; prediosDeslocados?: number; prediosPos: number[] }
export function diagnosticarVias(perfis: Map<number, Perfil>, hm: Heightmap, descartadas: { nome: string; motivo: string; x: number; z: number }[] = [], removidos?: Removidos, minirrotatorias = 0) {
  const achados: Problema[] = [];
  const contagem = vazia();
  contagem.rotatoria = descartadas.length;
  contagem.minirrotatoria = minirrotatorias;
  contagem.solta = removidos?.vias.length ?? 0;
  contagem.predioRemovido = removidos?.prediosSobreVias ?? 0;
  contagem.predioDeslocado = removidos?.prediosDeslocados ?? 0;
  for (const p of perfis.values()) {
    if (p.nivel === 1) { contagem.ponte++; continue; }
    if (p.nivel === -1) { contagem.tunel++; continue; }
    contagem.trechos++;
    const meia = larguraVia(p.edge) / 2; // só a pista: é nela que o morro "cobre o asfalto"
    let pMo = 0, pVa = 0, iMo = 0, iVa = 0, grade = 0, iGr = 0, temMuro = false;
    for (let i = 0; i < p.n; i += 2) {
      if (i > 0) {
        const g = Math.abs(p.y[i] - p.y[i - 2]) / Math.max(0.5, p.s[i] - p.s[i - 2]);
        if (g > grade) { grade = g; iGr = i; }
      }
      if (p.classe && p.classe[i] === 3) temMuro = true;
      if (p.classe && (p.classe[i] === 1 || p.classe[i] === 2)) continue; // ponte/túnel por trecho contínuo: tratamento, não defeito
      const nx = -p.tz[i], nz = p.tx[i];
      const a = sampleHeight(hm, p.x[i] + nx * meia, p.z[i] + nz * meia), b = sampleHeight(hm, p.x[i] - nx * meia, p.z[i] - nz * meia), c = sampleHeight(hm, p.x[i], p.z[i]);
      const mo = Math.max(a, b, c) - (p.y[i] + 0.02), va = p.y[i] - Math.min(a, b, c);
      if (mo > pMo) { pMo = mo; iMo = i; }
      if (va > pVa && p.y[i] > 3) { pVa = va; iVa = i; }
    }
    if (temMuro) contagem.muro++;
    const incl = Math.round(Math.max(grade, p.gradeMax ?? 0) * 100);
    const nome = p.edge.name || `trecho ${p.edge.id}`;
    if (pMo > LIMITE.morro) { contagem.morro++; achados.push({ tipo: 'morro', nome, x: p.x[iMo], z: p.z[iMo], valor: pMo, inclinacao: incl, detalhe: `morro ${pMo.toFixed(1)} m acima do asfalto` }); }
    if (pVa > LIMITE.vao) { contagem.vao++; achados.push({ tipo: 'vao', nome, x: p.x[iVa], z: p.z[iVa], valor: pVa, inclinacao: incl, detalhe: `${pVa.toFixed(1)} m de vão sob a rua${pVa <= 14 ? " (lateral fecha até o chão)" : " — acima do que a lateral cobre"}` }); }
    if (grade > LIMITE.rampa) { contagem.rampa++; achados.push({ tipo: 'rampa', nome, x: p.x[iGr], z: p.z[iGr], valor: grade * 100, inclinacao: incl, detalhe: `rampa de ${(grade * 100).toFixed(0)}%` }); }
  }
  const roundabouts: Problema[] = descartadas.map((d) => ({ tipo: 'rotatoria' as const, nome: d.nome || 'sem nome', x: d.x, z: d.z, valor: 0, inclinacao: 0, detalhe: d.motivo }));
  // o que é defeito de verdade primeiro: morro sobre o asfalto, depois rampa, depois vão (que a lateral até o chão já fecha até 14 m)
  const ordem = { morro: 0, rampa: 1, vao: 2, solta: 3, rotatoria: 4, predio: 5 } as const;
  achados.sort((u, v) => ordem[u.tipo] - ordem[v.tipo] || v.valor - u.valor);
  const soltas: Problema[] = (removidos?.vias ?? []).map((v) => ({ tipo: 'solta' as const, nome: v.nome || 'sem nome', x: v.x, z: v.z, valor: 0, inclinacao: 0, detalhe: `${v.motivo} — removida` }));
  const predios: Problema[] = [];
  for (let k = 0; removidos && k + 1 < removidos.prediosPos.length && predios.length < 150; k += 2) predios.push({ tipo: 'predio', nome: 'prédio', x: removidos.prediosPos[k], z: removidos.prediosPos[k + 1], valor: 0, inclinacao: 0, detalhe: 'invadia a pista e não coube fora dela — removido' });
  const lista = achados.slice(0, 300).concat(soltas, roundabouts, predios);
  debugMapa.problemas(lista, contagem);
  console.info(`[mapa] vias: ${contagem.trechos} trechos · morro ${contagem.morro} · vão ${contagem.vao} · rampa ${contagem.rampa} · tratados: ${contagem.muro} com muro, ${contagem.ponte} pontes, ${contagem.tunel} túneis · ${contagem.solta} vias soltas removidas · prédios sobre a pista: ${contagem.predioDeslocado} deslocados, ${contagem.predioRemovido} removidos · ${contagem.minirrotatoria} minirrotatórias · ${contagem.rotatoria} rotatórias descartadas`);
  return lista;
}
