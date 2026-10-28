/**
 * Ponte entre a thread principal e o Worker. Dados volumosos (lotes, estado por lote) ficam
 * em `mundo` (mutável, sem re-render); a UI assina só versões e estatísticas via Zustand.
 */
import { medir } from '../render/medir';
import type { CidadeReal } from '../data/cidadeReal';
import { create } from 'zustand';
import { emptyGraph, graphFromJSON, type RoadGraph, type RoadType } from '../world/roads';
import type { Heightmap } from '../world/terrain';
import type { CidadeRender, Command, FromWorker, Noticia, SaveData, ServiceInst, SimInit, Stats, ToWorker } from './protocol';
import type { TipoLinha } from './city/transporte';

export const mundo = {
  hm: null as Heightmap | null,
  init: null as SimInit | null,
  /** Fase 11: dados da cidade real em jogo (nomes e andares dos prédios para a interface) */
  real: null as CidadeReal | null,
  roads: emptyGraph() as RoadGraph,
  lots: new Float32Array(0) as Float32Array<ArrayBufferLike>,
  lotState: new Float32Array(0) as Float32Array<ArrayBufferLike>,
  services: [] as ServiceInst[],
  pollution: new Float32Array(0) as Float32Array<ArrayBufferLike>,
  lotCount: 0,
  // ── Fase 4 (atualizados só quando a versão muda) ──
  territorioF: new Float32Array(0) as Float32Array<ArrayBufferLike>,
  territorioM: new Float32Array(0) as Float32Array<ArrayBufferLike>,
  favelasCasas: new Float32Array(0) as Float32Array<ArrayBufferLike>,
  favelasMeta: [] as NonNullable<CidadeRender['favelas']>['meta'],
  linhas: [] as NonNullable<CidadeRender['linhas']>['linhas'],
  /** congestionamento (volume/capacidade) por aresta */
  transito: new Map<number, number>(),
};

export type Ferramenta =
  | { tipo: 'nenhuma' }
  | { tipo: 'via'; via: RoadType; curva: boolean }
  | { tipo: 'zona'; zona: number }
  | { tipo: 'equipamento'; eq: string }
  | { tipo: 'demolir' }
  | { tipo: 'linha'; linha: TipoLinha }
  | { tipo: 'operacao' };

export type Camada = 'nenhuma' | 'zonas' | 'agua' | 'energia' | 'esgoto' | 'valor' | 'poluicao' | 'densidade'
  | 'saude' | 'educacao' | 'seguranca' | 'crime' | 'territorio' | 'transito' | 'transporte' | 'bairros';

export interface Toast { id: number; texto: string; tom: 'erro' | 'ok' | 'info' }

interface GameState {
  pronto: boolean;
  worldVersion: number;
  stateVersion: number;
  stats: Stats | null;
  noticias: Noticia[];
  velocidade: number;
  ferramenta: Ferramenta;
  camada: Camada;
  raioPincel: number;
  loteSelecionado: number;
  favelaSelecionada: number;
  /** paradas da linha sendo traçada (ferramenta de transporte) */
  linhaParadas: { x: number; z: number }[];
  territorioVersion: number;
  favelasVersion: number;
  linhasVersion: number;
  transitoVersion: number;
  hora: number;
  horaAuto: boolean;
  luzSodio: boolean;
  tiltShift: boolean;
  modoFoto: boolean;
  painel: 'nenhum' | 'financas' | 'redes' | 'noticias' | 'transporte' | 'seguranca' | 'habitacao';
  /** Palácio do Governo (painel do Estado) aberto em qual aba */
  governo: null | 'geral' | 'eleicao' | 'gabinete' | 'assembleia' | 'relacoes' | 'orcamento' | 'receitas' | 'pessoal' | 'divida' | 'secretarias' | 'obras';
  toasts: Toast[];
  erroFatal: string | null;
  set: (p: Partial<GameState>) => void;
  toast: (texto: string, tom?: Toast['tom']) => void;
}

let toastId = 1;
export const useGame = create<GameState>((set) => ({
  pronto: false,
  worldVersion: 0,
  stateVersion: 0,
  stats: null,
  noticias: [],
  velocidade: 1,
  ferramenta: { tipo: 'nenhuma' },
  camada: 'nenhuma',
  raioPincel: 36,
  loteSelecionado: -1,
  favelaSelecionada: -1,
  linhaParadas: [],
  territorioVersion: 0,
  favelasVersion: 0,
  linhasVersion: 0,
  transitoVersion: 0,
  hora: 15.5,
  horaAuto: true,
  luzSodio: true,
  tiltShift: false,
  modoFoto: false,
  painel: 'nenhum',
  governo: null,
  toasts: [],
  erroFatal: null,
  set: (p) => set(p),
  toast: (texto, tom = 'info') => {
    const t = { id: toastId++, texto, tom };
    set((s) => ({ toasts: [...s.toasts.slice(-3), t] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== t.id) })), 3200);
  },
}));

let worker: Worker | null = null;
let nextCmd = 1;
const pendentes = new Map<number, (r: { ok: boolean; msg?: string; custo?: number }) => void>();
const savesPendentes = new Map<number, (s: SaveData) => void>();

function onMessage(ev: MessageEvent<FromWorker>) {
  medir(`bridge: ${ev.data.type}`, () => tratar(ev));
}

function tratar(ev: MessageEvent<FromWorker>) {
  const m = ev.data;
  const g = useGame.getState();
  switch (m.type) {
    case 'ready':
      mundo.init = m.init;
      g.set({ pronto: true });
      break;
    case 'world':
      mundo.roads = graphFromJSON(m.roads);
      mundo.lots = m.lots;
      mundo.services = m.services;
      mundo.lotCount = m.lots.length / 7;
      g.set({ worldVersion: m.version });
      break;
    case 'state': {
      mundo.lotState = m.lotState;
      mundo.pollution = m.pollution;
      const r = m.render;
      const versoes: Partial<GameState> = {};
      if (r.territorio) { mundo.territorioF = r.territorio.F; mundo.territorioM = r.territorio.M; versoes.territorioVersion = r.territorio.versao; }
      if (r.favelas) { mundo.favelasCasas = r.favelas.casas; mundo.favelasMeta = r.favelas.meta; versoes.favelasVersion = r.favelas.versao; }
      if (r.linhas) { mundo.linhas = r.linhas.linhas; versoes.linhasVersion = r.linhas.versao; }
      if (r.transito) {
        mundo.transito = new Map();
        for (let k = 0; k < r.transito.vias.length; k += 2) mundo.transito.set(r.transito.vias[k], r.transito.vias[k + 1]);
        versoes.transitoVersion = g.transitoVersion + 1;
      }
      const noticias = m.news.length ? [...m.news.slice().reverse(), ...g.noticias].slice(0, 60) : g.noticias;
      useGame.setState((s) => ({ ...versoes, stats: m.stats, noticias, stateVersion: s.stateVersion + 1 }));
      break;
    }
    case 'cmdResult':
      pendentes.get(m.id)?.(m);
      pendentes.delete(m.id);
      break;
    case 'saved':
      savesPendentes.get(m.id)?.(m.save);
      savesPendentes.delete(m.id);
      break;
    case 'error':
      console.error('[sim]', m.msg);
      g.set({ erroFatal: m.msg });
      break;
  }
}

function post(msg: ToWorker) {
  worker?.postMessage(msg);
}

export function iniciarSimulacao(init: SimInit | null, save: SaveData | null, real: CidadeReal | null = null) {
  mundo.real = real;
  pararSimulacao();
  worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module', name: 'simulacao' });
  worker.onmessage = onMessage;
  worker.onerror = (e) => useGame.getState().set({ erroFatal: e.message || 'Falha no Worker de simulação' });
  useGame.setState({ pronto: false, stats: null, noticias: [], worldVersion: 0, stateVersion: 0, loteSelecionado: -1, favelaSelecionada: -1, ferramenta: { tipo: 'nenhuma' }, erroFatal: null });
  mundo.favelasCasas = new Float32Array(0); mundo.favelasMeta = []; mundo.linhas = []; mundo.transito = new Map();
  mundo.territorioF = new Float32Array(0); mundo.territorioM = new Float32Array(0);
  if (save) post({ type: 'load', save, real });
  else if (init) post({ type: 'init', init, real });
  post({ type: 'speed', speed: useGame.getState().velocidade });
}

export function pararSimulacao() {
  worker?.terminate();
  worker = null;
  pendentes.clear();
}

export function setVelocidade(v: number) {
  useGame.getState().set({ velocidade: v });
  post({ type: 'speed', speed: v });
}

export function comando(cmd: Command): Promise<{ ok: boolean; msg?: string; custo?: number }> {
  const id = nextCmd++;
  return new Promise((res) => {
    pendentes.set(id, res);
    post({ type: 'cmd', id, cmd });
  });
}

export function pedirSave(): Promise<SaveData> {
  const id = nextCmd++;
  return new Promise((res) => {
    savesPendentes.set(id, res);
    post({ type: 'save', id });
  });
}

// gancho de depuração/automação só em desenvolvimento
if (import.meta.env.DEV) {
  (globalThis as unknown as { __n27sim: unknown }).__n27sim = { comando, setVelocidade, mundo, useGame, pedirSave, avancar: (dias: number) => post({ type: 'avancar', dias }) };
}

/** Conclui a linha em edição (usado pela tecla Enter e pelo botão da HUD). */
export async function concluirLinha(): Promise<void> {
  const g = useGame.getState();
  const f = g.ferramenta;
  if (f.tipo !== 'linha' || g.linhaParadas.length < 2) { g.toast('Coloque ao menos 2 paradas', 'erro'); return; }
  const r = await comando({ kind: 'linha', tipo: f.linha, paradas: g.linhaParadas });
  if (r.ok) { g.toast(r.msg ? `Linha criada — ${r.msg}` : 'Linha criada', 'ok'); useGame.setState({ linhaParadas: [] }); }
  else g.toast(r.msg ?? 'Não foi possível criar a linha', 'erro');
}
