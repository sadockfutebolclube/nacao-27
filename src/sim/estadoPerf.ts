/**
 * Desempenho da simulação para o painel F4 (Fase 23): o worker manda um resumo a cada envio de estado; estado de módulo +
 * `useSyncExternalStore` para o painel assinar sem passar pelo store do jogo (e sem re-renderizar nada quando fechado).
 */
import { useSyncExternalStore } from 'react';
import type { PerfSim } from './protocol';

let atual: PerfSim | null = null;
const ouvintes = new Set<() => void>();

export function definirPerfSim(p: PerfSim) {
  atual = p;
  ouvintes.forEach((f) => f());
}

const assinar = (f: () => void) => { ouvintes.add(f); return () => { ouvintes.delete(f); }; };
export const usePerfSim = () => useSyncExternalStore(assinar, () => atual);
