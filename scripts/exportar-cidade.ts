/**
 * Converte public/data/cidades/<ibge>.json no formato binário por núcleo + tiles (Fase 23), em public/data/cidades/<ibge>/.
 * Uso: npm run exportar-cidade [-- 3304557]. O gerador (fetch-cidades) já chama isto ao terminar uma cidade.
 */
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CidadeReal } from '../src/data/cidadeReal.ts';
import { codificarCidade } from '../src/data/cidadeBinaria.ts';

export async function exportarCidade(raiz: string, ibge: string): Promise<{ nucleo: number; tiles: number; bytes: number }> {
  const pasta = join(raiz, 'public', 'data', 'cidades');
  const c = CidadeReal.parse(JSON.parse(await readFile(join(pasta, `${ibge}.json`), 'utf8')));
  const { nucleo, tiles } = codificarCidade(c);
  const dir = join(pasta, ibge);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'nucleo.bin'), nucleo);
  let bytes = nucleo.length;
  for (const [t, dados] of tiles) { await writeFile(join(dir, `t${t}.bin`), dados); bytes += dados.length; }
  return { nucleo: nucleo.length, tiles: tiles.size, bytes };
}

if (process.argv[1]?.endsWith('exportar-cidade.ts')) {
  const ibge = process.argv[2] ?? '3304557';
  exportarCidade(process.cwd(), ibge).then((r) => console.log(`${ibge}: núcleo ${(r.nucleo / 1e6).toFixed(2)} MB + ${r.tiles} tiles = ${(r.bytes / 1e6).toFixed(2)} MB`)).catch((e) => { console.error(e); process.exit(1); });
}
