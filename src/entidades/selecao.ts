/**
 * Seleção de entidades (Fase 25): qual ID está selecionado e como a câmera o acompanha. Estado de módulo +
 * `useSyncExternalStore`, como o F3: o painel (HTML), o contorno e a câmera (dentro do Canvas) conversam sem o store do jogo.
 */
import { useSyncExternalStore } from 'react';

export type ModoCamera = 'livre' | 'seguindo' | 'travado';

export interface EstadoSelecao {
  id: number | null;
  /** livre = a câmera é do jogador · seguindo = acompanha até o jogador mexer · travado = acompanha e não deixa arrastar */
  modo: ModoCamera;
  /** investigações em andamento: id → instante (ms) em que terminam */
  investigando: Record<number, number>;
  /** o duplo clique pediu para chegar perto (entidades pequenas): a câmera aproxima uma vez */
  aproximar: boolean;
  /** muda a cada seleção: o painel recomeça a ficha */
  versao: number;
}

let estado: EstadoSelecao = { id: null, modo: 'livre', investigando: {}, aproximar: false, versao: 0 };
const ouvintes = new Set<() => void>();
const avisar = () => ouvintes.forEach((f) => f());

export const selecao = {
  ler: () => estado,
  selecionar(id: number | null, modo: ModoCamera = 'livre') { estado = { ...estado, id, modo: id === null ? 'livre' : modo, aproximar: id !== null && modo === 'seguindo', versao: estado.versao + 1 }; avisar(); },
  aproximado() { if (estado.aproximar) { estado = { ...estado, aproximar: false }; avisar(); } },
  modo(m: ModoCamera) { if (estado.id !== null && estado.modo !== m) { estado = { ...estado, modo: m }; avisar(); } },
  /** liga a investigação de `id` por `ms` e devolve quando acaba */
  investigar(id: number, ms: number): number { const fim = performance.now() + ms; estado = { ...estado, investigando: { ...estado.investigando, [id]: fim } }; avisar(); return fim; },
  terminouInvestigacao(id: number) { const { [id]: _x, ...resto } = estado.investigando; void _x; estado = { ...estado, investigando: resto }; avisar(); },
  assinar(f: () => void) { ouvintes.add(f); return () => { ouvintes.delete(f); }; },
};
export const useSelecao = () => useSyncExternalStore(selecao.assinar, selecao.ler);

if (import.meta.env?.DEV && typeof window !== 'undefined') (window as unknown as { __n27sel: typeof selecao }).__n27sel = selecao;
