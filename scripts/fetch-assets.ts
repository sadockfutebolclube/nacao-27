/**
 * NAÇÃO 27 — assets visuais de alta qualidade (Fase 12), todos CC0 (domínio público):
 *  - materiais PBR fotográficos do ambientCG (https://ambientcg.com): fachadas de prédios, reboco, concreto,
 *    telhas, grama, terra, rocha, asfalto, calçadas — mapas de cor, normal (OpenGL), rugosidade e emissão;
 *  - céu HDRI do Poly Haven (https://polyhaven.com) para iluminação e reflexos.
 *
 *   npm run fetch-assets
 *
 * Saída: public/assets/materiais/{id}_{cor|normal|rug|emis}.jpg, public/assets/hdri/{id}.hdr
 * Depois: `powershell -NoProfile -File scripts/comprimir-materiais.ps1` (1024/512 px, ~6 MB no total)
 * Cache: data/cache/acg/*.zip
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'data', 'cache', 'acg');
const OUT = join(ROOT, 'public', 'assets');

/** id → mapas desejados (emis só onde a fachada tem janelas acesas) */
export const MATERIAIS: Record<string, ('cor' | 'normal' | 'rug' | 'emis')[]> = {
  // fachadas de prédios (fotos de fachadas reais, com janelas); as variantes B trazem as janelas acesas
  Facade018A: ['cor', 'normal', 'rug'], Facade018B: ['emis'],
  Facade019A: ['cor', 'normal', 'rug'], Facade019B: ['emis'],
  Facade020A: ['cor', 'normal', 'rug'], Facade020B: ['emis'],
  Facade001: ['cor', 'normal', 'rug', 'emis'], Facade005: ['cor', 'normal', 'rug', 'emis'],
  Facade006: ['cor', 'normal', 'rug', 'emis'], Facade014: ['cor', 'normal', 'rug', 'emis'], Facade017: ['cor', 'normal', 'rug', 'emis'],
  // paredes de casas e prédios baixos
  Plaster001: ['cor', 'normal', 'rug'], PaintedPlaster017: ['cor', 'normal', 'rug'], Concrete034: ['cor', 'normal', 'rug'],
  // telhados
  RoofingTiles014A: ['cor', 'normal', 'rug'], RoofingTiles006: ['cor', 'normal', 'rug'], RoofingTiles013A: ['cor', 'normal', 'rug'], Gravel043: ['cor', 'normal', 'rug'],
  // chão, ruas e calçadas
  Grass004: ['cor', 'normal', 'rug'], Ground103: ['cor', 'normal', 'rug'], Rock064: ['cor', 'normal', 'rug'],
  // Fase 21: mato (sub-bosque e musgo) para a quarta camada do chão
  Moss001: ['cor', 'normal', 'rug'],
  Asphalt033: ['cor', 'normal', 'rug'], PavingStones046: ['cor', 'normal', 'rug'], PavingStones128: ['cor', 'normal', 'rug'],
};
const ARQ: Record<string, string> = { cor: 'Color', normal: 'NormalGL', rug: 'Roughness', emis: 'Emission' };
const HDRIS = ['kloofendal_48d_partly_cloudy_puresky'];

async function baixar(url: string, destino: string) {
  if (existsSync(destino)) return;
  for (let t = 0; t < 4; t++) {
    const r = await fetch(url);
    if (r.ok) { await mkdir(dirname(destino), { recursive: true }); await writeFile(destino, Buffer.from(await r.arrayBuffer())); return; }
    await new Promise((ok) => setTimeout(ok, 3000));
  }
  throw new Error(`falhou: ${url}`);
}

async function main() {
  await mkdir(join(OUT, 'materiais'), { recursive: true });
  for (const [id, mapas] of Object.entries(MATERIAIS)) {
    if (existsSync(join(OUT, 'materiais', `${id}_${mapas[0]}.jpg`))) continue; // já baixado (e comprimido)
    const zip = join(CACHE, `${id}_1K.zip`);
    await baixar(`https://ambientcg.com/get?file=${id}_1K-JPG.zip`, zip);
    const tmp = join(CACHE, `x_${id}`);
    await rm(tmp, { recursive: true, force: true });
    execFileSync('unzip', ['-o', '-q', zip, '*.jpg', '-d', tmp]);
    const arquivos = await readdir(tmp);
    for (const m of mapas) {
      const f = arquivos.find((a) => a.endsWith(`_${ARQ[m]}.jpg`));
      if (!f) { console.log(`  ${id}: sem ${ARQ[m]}`); continue; }
      await rename(join(tmp, f), join(OUT, 'materiais', `${id}_${m}.jpg`));
    }
    await rm(tmp, { recursive: true, force: true });
    console.log(`  ${id}: ${mapas.join(', ')}`);
  }
  for (const h of HDRIS) {
    const info = (await (await fetch(`https://api.polyhaven.com/files/${h}`)).json()) as { hdri: Record<string, { hdr: { url: string } }> };
    await baixar(info.hdri['1k'].hdr.url, join(OUT, 'hdri', `${h}.hdr`));
    console.log(`  HDRI ${h}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
