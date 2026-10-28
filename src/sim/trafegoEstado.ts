/**
 * Estado do tráfego no lado do desenho (Fase 29): os dois últimos snapshots do Worker (20 Hz) para interpolar a posição dos veículos
 * entre eles, o relógio dos semáforos (o MESMO do Worker, para as lâmpadas e a simulação concordarem) e as estatísticas para o F4.
 */
import { Trafego } from './trafego/trafego';

export interface Snap { dados: Float32Array; n: number; mapa: Map<number, number>; tempo: number }
export const STRIDE = Trafego.STRIDE;

export const trafegoEstado = {
  prev: null as Snap | null,
  curr: null as Snap | null,
  /** relógio do tráfego (s) do último snapshot, para as fases do semáforo */
  tempo: -1,
  chegouMs: 0,
  intervaloMs: 50,
  rotulos: [] as string[],
  stats: { ativos: 0, ms: 0, parados: 0, trocas: 0, ultrapassagens: 0, emergencias: 0 },
  /** snapshots recebidos por segundo (média) */
  taxa: 0,
};

export function receberTrafego(m: { tempo: number; dados: Float32Array; n: number; rotulos: string[]; stats: typeof trafegoEstado.stats }) {
  const e = trafegoEstado;
  const agora = performance.now();
  const mapa = new Map<number, number>();
  for (let k = 0; k < m.n; k++) mapa.set(m.dados[k * STRIDE], k);
  if (e.chegouMs > 0) { const dt = agora - e.chegouMs; e.intervaloMs += (Math.max(20, Math.min(200, dt)) - e.intervaloMs) * 0.2; e.taxa += (1000 / Math.max(1, dt) - e.taxa) * 0.1; }
  e.prev = e.curr;
  e.curr = { dados: m.dados, n: m.n, mapa, tempo: m.tempo };
  e.tempo = m.tempo; e.chegouMs = agora; e.rotulos = m.rotulos; e.stats = m.stats;
}

export function limparTrafego() {
  const e = trafegoEstado;
  e.prev = e.curr = null; e.tempo = -1; e.chegouMs = 0; e.rotulos = [];
}

/** fração 0–1 entre o snapshot anterior e o último, para o instante atual do desenho */
export function alfaTrafego(): number {
  const e = trafegoEstado;
  if (!e.curr) return 1;
  return Math.max(0, Math.min(1, (performance.now() - e.chegouMs) / e.intervaloMs));
}
