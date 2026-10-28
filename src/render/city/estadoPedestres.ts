/**
 * Estado de depuração dos pedestres (Fase 24): slider de densidade global, dia da semana forçado, mapa de calor e os números
 * do modelo agregado (a contagem "de verdade" da cidade inteira × os pedestres desenhados perto da câmera). Estado de módulo +
 * `useSyncExternalStore`, como o F3 do mapa: o painel (HTML) e o desenho (Canvas) conversam sem passar pelo store do jogo.
 */
import { useSyncExternalStore } from 'react';
import type { Densidade } from './densidade';

export interface EstadoPed {
  /** multiplicador global da densidade (1 = o que o modelo diz) */
  escala: number;
  /** null = o dia do calendário do jogo; 0 = domingo … 6 = sábado */
  diaSemana: number | null;
  mapaCalor: boolean;
  /** modelo agregado: pedestres ao ar livre na cidade inteira agora */
  agregado: { total: number; hora: number; fimDeSemana: boolean; desenhados: number; porEstado: number[] };
  /** modelo de densidade em uso (o mapa de calor lê dele) */
  dens: Densidade | null;
  /** muda quando o modelo (hora/dia/escala) muda: o mapa de calor se redesenha */
  versao: number;
}

let estado: EstadoPed = { escala: 1, diaSemana: null, mapaCalor: false, agregado: { total: 0, hora: 0, fimDeSemana: false, desenhados: 0, porEstado: [0, 0, 0, 0, 0, 0, 0] }, dens: null, versao: 0 };
const ouvintes = new Set<() => void>();
const avisar = () => ouvintes.forEach((f) => f());

export const NOMES_ESTADO = ['andando', 'esperando ônibus', 'sentado', 'comprando', 'trabalhando', 'fugindo', 'olhando a ocorrência'] as const;

export const pedDebug = {
  ler: () => estado,
  escala(v: number) { estado = { ...estado, escala: v, versao: estado.versao + 1 }; avisar(); },
  diaSemana(d: number | null) { estado = { ...estado, diaSemana: d, versao: estado.versao + 1 }; avisar(); },
  mapaCalor(v: boolean) { estado = { ...estado, mapaCalor: v }; avisar(); },
  modelo(dens: Densidade) { estado = { ...estado, dens, versao: estado.versao + 1 }; avisar(); },
  /** só os números do painel (não troca o objeto se nada mudou de forma visível) */
  agregado(a: EstadoPed['agregado']) { estado = { ...estado, agregado: a }; avisar(); },
  assinar(f: () => void) { ouvintes.add(f); return () => { ouvintes.delete(f); }; },
};
export const usePedDebug = () => useSyncExternalStore(pedDebug.assinar, pedDebug.ler);

// dev: window.__n27ped para os prints (slider, dia da semana)
if (import.meta.env?.DEV && typeof window !== 'undefined') (window as unknown as { __n27ped: typeof pedDebug }).__n27ped = pedDebug;
