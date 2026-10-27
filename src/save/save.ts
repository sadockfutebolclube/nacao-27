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

