/**
 * Biblioteca de storylets: todos os data/events/*.json, validados no carregamento.
 */
import { z } from 'zod';
import { Storylet } from './motor';

const arquivos = import.meta.glob('../../../data/events/*.json', { eager: true, import: 'default' }) as Record<string, unknown>;

export const STORYLETS: Storylet[] = Object.entries(arquivos)
  .sort(([a], [b]) => a.localeCompare(b))
  .flatMap(([nome, conteudo]) => {
    const r = z.array(Storylet).safeParse(conteudo);
    if (!r.success) throw new Error(`Storylets inválidos em ${nome}: ${r.error.message}`);
    return r.data;
  });
