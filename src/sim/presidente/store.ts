/**
 * Estado de interface do Modo Presidente (Fase 9). A simulação é leve (escalares mensais e 600
 * parlamentares) e roda na thread principal: um intervalo avança N dias por segundo conforme a velocidade.
 * A UI lê a instância `pres` diretamente e re-renderiza quando `v` muda.
 */
import { create } from 'zustand';
import type { DadosMacro } from '../../data/macro';
import type { Presidencia, PresInit } from './presidencia';

/** O motor da Presidência e a biblioteca de eventos são carregados sob demanda (Fase 10). */
async function motor() {
  const [{ Presidencia: P }, { STORYLETS_PRES }] = await Promise.all([import('./presidencia'), import('./biblioteca')]);
  return { P, STORYLETS_PRES };
}

export type PainelPres = 'planalto' | 'economia' | 'orcamento' | 'congresso' | 'stf' | 'bc' | 'ministerios' | 'estados' | 'eleicao' | 'nuvem';
export type CamadaMapa = 'aprovacao' | 'governadores' | 'eleicao';

interface PresStore {
  pres: Presidencia | null;
  v: number;
  velocidade: 0 | 1 | 2 | 4;
  painel: PainelPres;
  camada: CamadaMapa;
  toast: { texto: string; tom: 'ok' | 'erro' } | null;
  iniciar: (init: PresInit) => Promise<void>;
  restaurar: (json: string, macro: DadosMacro) => Promise<void>;
  sair: () => void;
  /** Executa uma ação do jogador sobre a Presidência e mostra o resultado. */
  acao: (f: (p: Presidencia) => { ok: boolean; msg: string } | void) => void;
  setVelocidade: (v: 0 | 1 | 2 | 4) => void;
  setPainel: (p: PainelPres) => void;
  setCamada: (c: CamadaMapa) => void;
}

/** dias de jogo por segundo em cada velocidade */
const DIAS_POR_SEG = { 0: 0, 1: 2, 2: 5, 4: 14 } as const;
let timer: ReturnType<typeof setInterval> | null = null;
let acumulado = 0;

export const usePres = create<PresStore>((set, get) => ({
  pres: null, v: 0, velocidade: 0, painel: 'planalto', camada: 'aprovacao', toast: null,
  iniciar: async (init) => { const { P, STORYLETS_PRES } = await motor(); set({ pres: new P(init, STORYLETS_PRES), v: 1, velocidade: 0, painel: 'planalto', camada: 'aprovacao' }); ligar(); },
  restaurar: async (json, macro) => { const { P, STORYLETS_PRES } = await motor(); set({ pres: P.restaurar(json, macro, STORYLETS_PRES), v: 1, velocidade: 0, painel: 'planalto' }); ligar(); },
  sair: () => { if (timer) clearInterval(timer); timer = null; set({ pres: null, velocidade: 0 }); },
  acao: (f) => {
    const p = get().pres;
    if (!p) return;
    const r = f(p);
    set((s) => ({ v: s.v + 1, toast: r && r.msg ? { texto: r.msg, tom: r.ok ? 'ok' : 'erro' } : s.toast }));
    if (r && r.msg) setTimeout(() => set((s) => (s.toast?.texto === r.msg ? { toast: null } : s)), 3500);
  },
  setVelocidade: (velocidade) => set({ velocidade }),
  setPainel: (painel) => set({ painel }),
  setCamada: (camada) => set({ camada }),
}));

function ligar() {
  if (timer) clearInterval(timer);
  acumulado = 0;
  timer = setInterval(() => {
    const s = usePres.getState();
    const p = s.pres;
    if (!p || s.velocidade === 0 || p.fim) return;
    acumulado += DIAS_POR_SEG[s.velocidade] / 10;
    const n = Math.floor(acumulado);
    if (n <= 0) return;
    acumulado -= n;
    const antes = { pend: p.eventos.pendentes.length, fase: p.eleicao?.fase };
    p.avancar(n);
    // pausa automática em momentos que pedem o jogador: decisão nova, resultado da eleição, fim
    const pausa = p.fim || p.eventos.pendentes.length > antes.pend || (p.eleicao && p.eleicao.fase !== antes.fase && p.eleicao.fase !== 'pre');
    usePres.setState((st) => ({ v: st.v + 1, velocidade: pausa ? 0 : st.velocidade }));
  }, 100);
}

if (import.meta.env.DEV) (window as unknown as { __n27pres: typeof usePres }).__n27pres = usePres;
