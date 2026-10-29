/**
 * Estado compartilhado do turismo (Fase 31): o contexto de agora (hora, dia da semana, mês, chuva, calor) que Visitantes, Orla, Turismo e
 * o painel de clique usam para calcular a MESMA ocupação, o ponto de cada marco no mapa e contadores de depuração. Em desenvolvimento,
 * `window.__n27tur.forcar = { hora, diaSemana, mes, chuva }` trava o contexto (dia de jogo, desfile, praia cheia) para tirar prints.
 */
import { useGame } from '../../sim/bridge';
import { MEDIR } from '../../dev/medir';
import { projetar } from '../../world/cidadeReal';
import type { Contexto, PontoTuristico } from '../../world/turismo';
import { ambiente } from './ambiente';
import { clima } from './climaVisual';
import { diaDaSemana } from './densidade';
import { pedDebug } from './estadoPedestres';
import { mundo } from '../../sim/bridge';
import { PONTOS } from '../../world/turismo';
import { irPara } from './Camera';

export const turismoDebug: { hora: (h: number | null) => void;  ms: { visitantes: number; orla: number };  tour: () => void; tourParar: () => void; tourIr: (i: number) => void; tourAtivo: boolean; tourParada: string; ir: (id: string, dist?: number) => boolean; forcar: Partial<Contexto> | null; visitantesDesenhados: number; propsDesenhados: number; pontosAtivos: string[] } = {
  ir: (id, dist) => { const p = PONTOS.find((q) => q.id === id); const pos = p && posicaoDoPonto(p); if (!pos) return false; irPara(pos[0], pos[1], dist); return true; },
  hora: (h) => useGame.getState().set(h === null ? { horaAuto: true } : { horaAuto: false, hora: h }),
  ms: { visitantes: 0, orla: 0 },
  tour: () => {}, tourParar: () => {}, tourIr: () => {}, tourAtivo: false, tourParada: '',
  forcar: null, visitantesDesenhados: 0, propsDesenhados: 0, pontosAtivos: [],
};
if (MEDIR && typeof window !== 'undefined') (window as unknown as { __n27tur: typeof turismoDebug }).__n27tur = turismoDebug;

export function contextoTurismo(): Contexto {
  const st = useGame.getState().stats;
  const dow = pedDebug.ler().diaSemana ?? (st ? diaDaSemana(st.ano, st.mes, st.dia) : 6);
  const base: Contexto = { hora: ambiente.hora, diaSemana: dow, mes: st?.mes ?? 6, chuva: clima.chuva, temp: st?.clima?.temp ?? 27 };
  return turismoDebug.forcar ? { ...base, ...turismoDebug.forcar } : base;
}

const cachePos = new WeakMap<object, Map<string, [number, number]>>();
/** posição (x, z) do ponto no mapa do jogo; null fora do Rio */
export function posicaoDoPonto(p: PontoTuristico, lat = p.lat, lon = p.lon): [number, number] | null {
  const real = mundo.real;
  if (!real) return null;
  let m = cachePos.get(real);
  if (!m) cachePos.set(real, (m = new Map()));
  const k = `${lat},${lon}`;
  let v = m.get(k);
  if (!v) m.set(k, (v = projetar(real, lat, lon)));
  return v;
}
