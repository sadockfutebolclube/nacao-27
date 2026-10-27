/** Saves locais (IndexedDB via idb-keyval) e arquivo exportável .nacao (JSON). */
import { del, entries, set } from 'idb-keyval';
import type { SaveData } from '../sim/protocol';

const PREFIXO = 'nacao27:save:';

export interface SlotInfo { chave: string; rotulo: string; save: SaveData }

export async function salvarLocal(save: SaveData, slot = 'auto'): Promise<string> {
  const chave = `${PREFIXO}${save.init.sigla}:${slot}`;
  await set(chave, save);
  return chave;
}

export async function listarSaves(): Promise<SlotInfo[]> {
  try {
    const todos = await entries<string, SaveData>();
    return todos
      .filter(([k, v]) => typeof k === 'string' && k.startsWith(PREFIXO) && v?.formato === 'nacao27')
      .map(([k, v]) => ({ chave: k, rotulo: `Salvo em ${new Date(v.salvoEm).toLocaleString('pt-BR')} · dia ${Math.floor(v.tick / 4)} de jogo`, save: v }))
      .sort((a, b) => b.save.salvoEm.localeCompare(a.save.salvoEm));
  } catch {
    return [];
  }
}

export async function apagarSave(chave: string) {
  await del(chave);
}

export function exportarArquivo(save: SaveData) {
  const blob = new Blob([JSON.stringify(save)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  const data = new Date().toISOString().slice(0, 10);
  a.download = `${save.init.cidade.replace(/\s+/g, '-').toLowerCase()}-${data}.nacao`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export async function lerArquivoNacao(f: File): Promise<SaveData> {
  const j = JSON.parse(await f.text()) as SaveData;
  if (j.formato !== 'nacao27' || j.versao !== 1) throw new Error('Arquivo .nacao inválido ou de versão incompatível.');
  return j;
}

// ── Modo Presidente (Fase 9) ─────────────────────────────────────────────────────

const PREFIXO_PRES = 'nacao27:pres:';
export interface SavePres { formato: 'nacao27-presidente'; versao: 1; salvoEm: string; rotulo: string; dados: string }
export interface SlotPres { chave: string; rotulo: string; save: SavePres }

export function savePres(dados: string, rotulo: string): SavePres {
  return { formato: 'nacao27-presidente', versao: 1, salvoEm: new Date().toISOString(), rotulo, dados };
}

export async function salvarPresLocal(save: SavePres, slot = 'manual'): Promise<string> {
  const chave = `${PREFIXO_PRES}${slot}`;
  await set(chave, save);
  return chave;
}

export async function listarSavesPres(): Promise<SlotPres[]> {
  try {
    const todos = await entries<string, SavePres>();
    return todos
      .filter(([k, v]) => typeof k === 'string' && k.startsWith(PREFIXO_PRES) && v?.formato === 'nacao27-presidente')
      .map(([k, v]) => ({ chave: k, rotulo: `${v.rotulo} · salvo em ${new Date(v.salvoEm).toLocaleString('pt-BR')}`, save: v }))
      .sort((a, b) => b.save.salvoEm.localeCompare(a.save.salvoEm));
  } catch {
    return [];
  }
}

export function exportarPres(save: SavePres) {
  const blob = new Blob([JSON.stringify(save)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `presidencia-${new Date().toISOString().slice(0, 10)}.nacao`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Lê um .nacao de qualquer modo (cidade/estado ou Presidência). */
export async function lerArquivoQualquer(f: File): Promise<SaveData | SavePres> {
  const j = JSON.parse(await f.text()) as SaveData | SavePres;
  if (j.formato === 'nacao27-presidente' && j.versao === 1) return j;
  if (j.formato === 'nacao27' && j.versao === 1) return j;
  throw new Error('Arquivo .nacao inválido ou de versão incompatível.');
}
