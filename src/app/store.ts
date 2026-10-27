/** Estado de navegação e preferências (Zustand). O estado do jogo em si vive em src/sim/bridge.ts. */
import { create } from 'zustand';
import type { FeatureCollection } from 'geojson';
import type { DadosUF, IndiceUFs, ResumoUF, SiglaUF } from '../data/schemas';
import type { ModoJogo, SaveData } from '../sim/protocol';
import type { MunicipioJogavel } from '../data/municipios';
import type { IdPartido } from '../sim/politica/dados';

export type Tela = 'menu' | 'selecao' | 'carregando' | 'jogo' | 'presidente-setup' | 'presidente';

export type Metrica = 'dificuldade' | 'populacao' | 'pib' | 'pibPerCapita' | 'idh' | 'homicidios' | 'idebEM' | 'esgoto' | 'dividaRCL' | 'regiao';

interface AppState {
  tela: Tela;
  indice: IndiceUFs | null;
  malha: FeatureCollection | null;
  erro: string | null;
  metrica: Metrica;
  hover: SiglaUF | null;
  selecionada: SiglaUF | null;
  modo: ModoJogo;
  dadosUF: DadosUF | null;
  saveParaCarregar: SaveData | null;
  escalaUI: number;
  daltonico: boolean;
  /** município onde a cidade será construída (null = capital) */
  municipio: MunicipioJogavel | null;
  volumeMusica: number;
  volumeAmbiente: number;
  /** carreira (Fase 9): governador(a) que disputa a Presidência */
  carreira: { uf: SiglaUF; aprovacao: number; partido: IdPartido; ano: number } | null;
  /** Fase 10: qualidade gráfica, movimento reduzido, dicas do assessor, texto de alto contraste */
  qualidade: 'auto' | 'alta' | 'media' | 'baixa';
  reduzirMovimento: boolean;
  tutorial: boolean;
  altoContraste: boolean;
  setPref: (p: Partial<Pick<AppState, 'qualidade' | 'reduzirMovimento' | 'tutorial' | 'altoContraste'>>) => void;
  irPara: (t: Tela) => void;
  setDados: (indice: IndiceUFs, malha: FeatureCollection) => void;
  setErro: (e: string) => void;
  setMetrica: (m: Metrica) => void;
  setHover: (s: SiglaUF | null) => void;
  setSelecionada: (s: SiglaUF | null) => void;
  setModo: (m: ModoJogo) => void;
  iniciar: (d: DadosUF, save?: SaveData) => void;
  setEscalaUI: (v: number) => void;
  setDaltonico: (v: boolean) => void;
  setMunicipio: (m: MunicipioJogavel | null) => void;
  setVolumes: (musica: number, ambiente: number) => void;
}

interface Prefs { escalaUI?: number; daltonico?: boolean; volumeMusica?: number; volumeAmbiente?: number; qualidade?: AppState['qualidade']; reduzirMovimento?: boolean; tutorial?: boolean; altoContraste?: boolean }

const prefereMenosMovimento = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };

const prefs = (() => {
  try {
    return JSON.parse(localStorage.getItem('nacao27:prefs') ?? '{}') as Prefs;
  } catch {
    return {};
  }
})();
const salvarPrefs = (p: Prefs) => {
  Object.assign(prefs, p);
  try { localStorage.setItem('nacao27:prefs', JSON.stringify(prefs)); } catch { /* modo privado */ }
};

export const useApp = create<AppState>((set) => ({
  tela: 'menu',
  indice: null,
  malha: null,
  erro: null,
  metrica: 'dificuldade',
  hover: null,
  selecionada: null,
  modo: 'mandato',
  dadosUF: null,
  saveParaCarregar: null,
  escalaUI: prefs.escalaUI ?? 1,
  daltonico: prefs.daltonico ?? false,
  irPara: (tela) => set({ tela }),
  setDados: (indice, malha) => set({ indice, malha }),
  setErro: (erro) => set({ erro }),
  setMetrica: (metrica) => set({ metrica }),
  setHover: (hover) => set({ hover }),
  setSelecionada: (selecionada) => set({ selecionada }),
  setModo: (modo) => set({ modo }),
  iniciar: (dadosUF, save) => set({ dadosUF, saveParaCarregar: save ?? null, tela: 'carregando' }),
  setEscalaUI: (escalaUI) => { set({ escalaUI }); salvarPrefs({ escalaUI }); },
  setDaltonico: (daltonico) => { set({ daltonico }); salvarPrefs({ daltonico }); },
  municipio: null,
  volumeMusica: prefs.volumeMusica ?? 0.5,
  volumeAmbiente: prefs.volumeAmbiente ?? 0.6,
  setMunicipio: (municipio) => set({ municipio }),
  carreira: null,
  qualidade: prefs.qualidade ?? 'auto',
  reduzirMovimento: prefs.reduzirMovimento ?? prefereMenosMovimento(),
  tutorial: prefs.tutorial ?? true,
  altoContraste: prefs.altoContraste ?? false,
  setPref: (p) => { set(p); salvarPrefs(p); },
  setVolumes: (volumeMusica, volumeAmbiente) => { set({ volumeMusica, volumeAmbiente }); salvarPrefs({ volumeMusica, volumeAmbiente }); },
}));

export function resumo(indice: IndiceUFs | null, sigla: SiglaUF | null): ResumoUF | null {
  if (!indice || !sigla) return null;
  return indice.ufs.find((u) => u.sigla === sigla) ?? null;
}

/** Formatação PT-BR compacta. */
export const fmt = {
  int: (v: number) => Math.round(v).toLocaleString('pt-BR'),
  dec: (v: number, d = 1) => v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }),
  pct: (v: number, d = 0) => `${(v * 100).toLocaleString('pt-BR', { maximumFractionDigits: d })}%`,
  reais: (v: number) => {
    const a = Math.abs(v);
    const s = v < 0 ? '−' : '';
    if (a >= 1e12) return `${s}R$ ${(a / 1e12).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} tri`;
    if (a >= 1e9) return `${s}R$ ${(a / 1e9).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} bi`;
    if (a >= 1e6) return `${s}R$ ${(a / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`;
    if (a >= 1e3) return `${s}R$ ${(a / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} mil`;
    return `${s}R$ ${Math.round(a)}`;
  },
  pessoas: (v: number) => {
    if (v >= 1e6) return `${(v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`;
    if (v >= 1e3) return `${(v / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} mil`;
    return Math.round(v).toLocaleString('pt-BR');
  },
};
