/**
 * Estado compartilhado das cenas de ocorrência (Fase 26): quem desenha as cenas (`Ocorrencias.tsx`) publica aqui onde elas estão
 * e o que os NPCs devem fazer perto delas; pedestres, carros, estabelecimentos e a ficha leem daqui. Funções puras e estado de
 * módulo — nada de Three.js — para o resto do jogo reagir sem conhecer o desenho das cenas.
 */
import { DADOS } from '../../sim/faccoes/dados';
import type { Ocorrencia } from '../../sim/faccoes/tipos';

export type Reacao = 'fogem' | 'escondem' | 'curiosos';

export interface Cena {
  /** id da ocorrência */
  id: number;
  oc: Ocorrencia;
  x: number; z: number;
  /** segundos de cena já passados e duração total */
  t: number; dur: number;
  raio: number; reacao: Reacao;
  /** 0–1: o quanto o trânsito anda (1 = livre) e se o comércio está fechado */
  transito: number; comercioFechado: boolean;
  fx: string;
}

export const cenas: Cena[] = [];

/** posição das sirenes ligadas neste quadro (carros e pedestres cedem passagem) */
export const sirenes: { x: number; z: number; yaw: number }[] = [];

export function novaCena(oc: Ocorrencia, rnd: () => number): Cena {
  const t = DADOS.ocorrencias.tipos[oc.tipo];
  const [a, b] = t.cena.duracaoS;
  return { id: oc.id, oc, x: oc.x, z: oc.z, t: 0, dur: a + (b - a) * rnd(), raio: t.cena.raioReacao, reacao: t.cena.pedestres, transito: t.cena.transito, comercioFechado: t.cena.comercioFecha >= 0.5, fx: t.cena.fx };
}

/** A cena mais forte (mais perto, relativo ao raio) que alcança o ponto, ou null. */
export function cenaEm(x: number, z: number): { cena: Cena; d: number; forca: number } | null {
  let melhor: { cena: Cena; d: number; forca: number } | null = null;
  for (const c of cenas) {
    const d = Math.hypot(c.x - x, c.z - z);
    if (d > c.raio) continue;
    const forca = 1 - d / c.raio;
    if (!melhor || forca > melhor.forca) melhor = { cena: c, d, forca };
  }
  return melhor;
}

/** Multiplicador de quanta gente nasce perto das cenas em que o povo foge ou se esconde (1 = normal). */
export function supressaoDeSpawn(x: number, z: number): number {
  let f = 1;
  for (const c of cenas) {
    if (c.reacao === 'curiosos') continue;
    const d = Math.hypot(c.x - x, c.z - z);
    if (d < c.raio * 1.2) f = Math.min(f, 0.05 + 0.95 * (d / (c.raio * 1.2)));
  }
  return f;
}

/** O comércio perto de uma ocorrência grave fecha (a ficha do estabelecimento mostra). */
export function comercioFechadoEm(x: number, z: number): boolean {
  for (const c of cenas) if (c.comercioFechado && Math.hypot(c.x - x, c.z - z) < c.raio) return true;
  return false;
}

/** Há uma sirene ligada a menos de `m` metros de (x, z)? Devolve a distância ou −1. */
export function sireneAte(x: number, z: number, m: number): number {
  let melhor = -1;
  for (const s of sirenes) {
    const d = Math.hypot(s.x - x, s.z - z);
    if (d < m && (melhor < 0 || d < melhor)) melhor = d;
  }
  return melhor;
}

/** fator de velocidade do trânsito comum em (x, z) por causa das cenas (1 = livre) */
export function fatorTransito(x: number, z: number): number {
  let f = 1;
  for (const c of cenas) {
    const d = Math.hypot(c.x - x, c.z - z);
    if (d < c.raio) f = Math.min(f, c.transito + (1 - c.transito) * (d / c.raio));
  }
  return f;
}

if (import.meta.env?.DEV && typeof window !== 'undefined') (window as unknown as { __n27cenas: Cena[] }).__n27cenas = cenas;
