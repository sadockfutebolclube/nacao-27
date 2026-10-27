/**
 * Contornos de prédios da Microsoft (Global ML Building Footprints, ODbL), detectados em imagens de
 * satélite — completam o OpenStreetMap onde ele não mapeou os prédios (comum no Brasil).
 * Índice: https://minedbuildings.z5.web.core.windows.net/global-buildings/dataset-links.csv
 * Um arquivo .csv.gz por quadkey de nível 9, uma Feature GeoJSON por linha (propriedade `height` em m, −1 = desconhecida).
 */
import { createReadStream, existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { createGunzip } from 'node:zlib';

const INDICE = 'https://minedbuildings.z5.web.core.windows.net/global-buildings/dataset-links.csv';

export function quadkey(lat: number, lon: number, z: number): string {
  const s = Math.sin((lat * Math.PI) / 180);
  const x = Math.floor(((lon + 180) / 360) * 2 ** z), y = Math.floor((0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * 2 ** z);
  let q = '';
  for (let i = z; i > 0; i--) { let d = 0; const m = 1 << (i - 1); if (x & m) d++; if (y & m) d += 2; q += d; }
  return q;
}

export interface PredioMS { anel: [number, number][]; altura: number }

/** Prédios da Microsoft dentro da caixa [sul, oeste, norte, leste]. */
export async function prediosMS(caixa: [number, number, number, number], cache: string): Promise<PredioMS[]> {
  const arqIdx = join(cache, 'ms-buildings-links.csv');
  if (!existsSync(arqIdx)) {
    const r = await fetch(INDICE);
    if (!r.ok) throw new Error(`índice Microsoft: HTTP ${r.status}`);
    await mkdir(cache, { recursive: true });
    await writeFile(arqIdx, await r.text());
  }
  const linhas = (await readFile(arqIdx, 'utf8')).split('\n').filter((l) => l.startsWith('Brazil,'));
  const [s, w, n, e] = caixa;
  const qks = new Set([quadkey(s, w, 9), quadkey(s, e, 9), quadkey(n, w, 9), quadkey(n, e, 9)]);
  const out: PredioMS[] = [];
  for (const qk of qks) {
    const urls = linhas.filter((l) => l.split(',')[1] === qk).map((l) => l.split(',')[2]);
    for (const [k, url] of urls.entries()) {
      const arq = join(cache, 'ms', `${qk}-${k}.csv.gz`);
      if (!existsSync(arq)) {
        const r = await fetch(url);
        if (!r.ok) throw new Error(`Microsoft ${qk}: HTTP ${r.status}`);
        await mkdir(join(cache, 'ms'), { recursive: true });
        await writeFile(arq, Buffer.from(await r.arrayBuffer()));
      }
      const rl = createInterface({ input: createReadStream(arq).pipe(createGunzip()), crlfDelay: Infinity });
      for await (const linha of rl) {
        // filtro rápido pela primeira coordenada antes de interpretar o JSON
        const m = /"coordinates": \[\[\[(-?[\d.]+), (-?[\d.]+)/.exec(linha);
        if (!m) continue;
        const lon = +m[1], lat = +m[2];
        if (lat < s || lat > n || lon < w || lon > e) continue;
        const f = JSON.parse(linha) as { properties: { height: number }; geometry: { type: string; coordinates: number[][][] } };
        if (f.geometry.type !== 'Polygon') continue;
        out.push({ anel: f.geometry.coordinates[0].map(([lo, la]) => [la, lo]), altura: f.properties.height });
      }
    }
  }
  return out;
}
