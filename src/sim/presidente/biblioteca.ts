/** Storylets do Modo Presidente: data/events-presidente/*.json, validados no carregamento. */
import { z } from 'zod';
import { Storylet } from '../eventos/motor';

const arquivos = import.meta.glob('../../../data/events-presidente/*.json', { eager: true, import: 'default' }) as Record<string, unknown>;

export const STORYLETS_PRES: Storylet[] = Object.entries(arquivos)
  .sort(([a], [b]) => a.localeCompare(b))
  .flatMap(([nome, conteudo]) => {
    const r = z.array(Storylet).safeParse(conteudo);
    if (!r.success) throw new Error(`Storylets inválidos em ${nome}: ${r.error.message}`);
    return r.data;
  });
