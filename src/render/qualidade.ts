/**
 * Qualidade gráfica (Fase 10). A preferência do jogador fica em useApp ('auto' por padrão); no modo
 * automático o PerformanceMonitor da cena desce um nível quando o FPS cai e sobe quando sobra folga.
 *
 *  alta  — DPR até 1,75, sombras 4096, AO + bloom + SMAA (+ tilt-shift opcional)
 *  media — DPR até 1,25, sombras 2048, bloom + SMAA
 *  baixa — DPR 1, sem sombras, só tone mapping e vinheta
 */
import { create } from 'zustand';
import { useApp } from '../app/store';

export type Nivel = 'alta' | 'media' | 'baixa';
export type PrefQualidade = 'auto' | Nivel;
const ORDEM: Nivel[] = ['baixa', 'media', 'alta'];

export const useAutoQualidade = create<{ nivel: Nivel; baixar: () => void; subir: () => void; fixar: (n: Nivel) => void }>((set, get) => ({
  nivel: 'alta',
  baixar: () => set({ nivel: ORDEM[Math.max(0, ORDEM.indexOf(get().nivel) - 1)] }),
  subir: () => set({ nivel: ORDEM[Math.min(2, ORDEM.indexOf(get().nivel) + 1)] }),
  fixar: (nivel) => set({ nivel }),
}));

/** Nível efetivo: a preferência fixa ou o automático. */
export function useNivel(): Nivel {
  const pref = useApp((s) => s.qualidade);
  const auto = useAutoQualidade((s) => s.nivel);
  return pref === 'auto' ? auto : pref;
}

export const DPR: Record<Nivel, [number, number]> = { alta: [1, 1.75], media: [1, 1.25], baixa: [1, 1] };
export const SOMBRA: Record<Nivel, number> = { alta: 4096, media: 2048, baixa: 0 };
