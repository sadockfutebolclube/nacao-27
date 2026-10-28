/**
 * Extração local do OpenStreetMap a partir dos arquivos regionais da Geofabrik (.osm.pbf), para quando
 * o Overpass está indisponível. Lê o arquivo uma vez (nós → vias → relações, na ordem do PBF) e grava,
 * para cada cidade, os mesmos arquivos de cache que o Overpass geraria (formato `out geom`).
 *
 * Fonte: https://download.geofabrik.de/south-america/brazil.html — © colaboradores do OpenStreetMap (ODbL).
 */
import { createReadStream } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { Writable } from 'node:stream';

const require = createRequire(import.meta.url);
const parser = require('osm-pbf-parser') as () => NodeJS.ReadWriteStream;

export const REGIAO_UF: Record<string, string> = {
  AC: 'norte', AP: 'norte', AM: 'norte', PA: 'norte', RO: 'norte', RR: 'norte', TO: 'norte',
  AL: 'nordeste', BA: 'nordeste', CE: 'nordeste', MA: 'nordeste', PB: 'nordeste', PE: 'nordeste', PI: 'nordeste', RN: 'nordeste', SE: 'nordeste',
  DF: 'centro-oeste', GO: 'centro-oeste', MT: 'centro-oeste', MS: 'centro-oeste',
  ES: 'sudeste', MG: 'sudeste', RJ: 'sudeste', SP: 'sudeste',
  PR: 'sul', RS: 'sul', SC: 'sul',
};

/** [sul, oeste, norte, leste] */
export type BBox = [number, number, number, number];
export interface AlvoCidade { ibge: string; construivel: BBox; mapa: BBox }

const RE_VIA = /^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link)$/;
const dentroBB = (b: BBox, lat: number, lon: number) => lat >= b[0] && lat <= b[2] && lon >= b[1] && lon <= b[3];
const cruza = (b: BBox, s: number, w: number, n: number, e: number) => !(n < b[0] || s > b[2] || e < b[1] || w > b[3]);
const expandir = (b: BBox, graus: number): BBox => [b[0] - graus, b[1] - graus, b[2] + graus, b[3] + graus];

interface Item { type: 'node' | 'way' | 'relation'; id: number; lat?: number; lon?: number; tags?: Record<string, string>; refs?: number[]; members?: { type: string; id: number; role: string }[] }
interface ElOSM { type: 'way' | 'relation'; id: number; tags?: Record<string, string>; nodes?: number[]; geometry?: { lat: number; lon: number }[]; members?: { type: string; role: string; geometry?: { lat: number; lon: number }[] }[] }

export async function extrairRegiao(pbf: string, alvos: AlvoCidade[], saida: string): Promise<void> {
  // nós guardados: dentro do mapa de alguma cidade, com 1 km de folga (polígonos que cruzam a borda)
  const caixas = alvos.map((a) => expandir(a.mapa, 0.01));
  const idx = new Map<number, number>();
  let coords = new Float64Array(1 << 20);
  let n = 0;
  const viasPredios = new Map<string, ElOSM[]>(alvos.map((a) => [a.ibge, []]));
  const natureza = new Map<string, ElOSM[]>(alvos.map((a) => [a.ibge, []]));
  /** Fase 14: semáforos (s) e faixas de pedestre (c) dentro da área construível de cada cidade */
  const sinais = new Map<string, { lat: number; lon: number; t: 's' | 'c' }[]>(alvos.map((a) => [a.ibge, []]));
  /** vias sem etiqueta dentro de algum mapa (podem ser contornos de lagos em relações) */
  const contornos = new Map<number, number[]>();
  let lidos = 0;

  const geometria = (refs: number[]) => {
    const nodes: number[] = [], geometry: { lat: number; lon: number }[] = [];
    let s = 90, w = 180, nn = -90, e = -180;
    for (const r of refs) {
      const k = idx.get(r);
      if (k === undefined) continue;
      const lat = coords[k * 2], lon = coords[k * 2 + 1];
      nodes.push(r); geometry.push({ lat, lon });
      s = Math.min(s, lat); nn = Math.max(nn, lat); w = Math.min(w, lon); e = Math.max(e, lon);
    }
    return { nodes, geometry, bb: [s, w, nn, e] as BBox };
  };

  await new Promise<void>((ok, falha) => {
    createReadStream(pbf).pipe(parser()).pipe(new Writable({
      objectMode: true,
      write(itens: Item[], _enc, prox) {
        for (const it of itens) {
          lidos++;
          if (it.type === 'node') {
            const lat = it.lat!, lon = it.lon!;
            if (!caixas.some((b) => dentroBB(b, lat, lon))) continue;
            if (n * 2 + 2 > coords.length) { const c2 = new Float64Array(coords.length * 2); c2.set(coords); coords = c2; }
            idx.set(it.id, n); coords[n * 2] = lat; coords[n * 2 + 1] = lon; n++;
            const nt = it.tags;
            if (nt && (nt.highway === 'traffic_signals' || nt.highway === 'crossing' || nt.crossing)) {
              for (const a of alvos) if (dentroBB(a.construivel, lat, lon)) sinais.get(a.ibge)!.push({ lat, lon, t: nt.highway === 'traffic_signals' ? 's' : 'c' });
            }
          } else if (it.type === 'way') {
            const t = it.tags ?? {};
            const temTag = Object.keys(t).length > 0;
            const viaPredio = !!t.building || (!!t.highway && RE_VIA.test(t.highway)) || /^(residential|commercial|retail|industrial)$/.test(t.landuse ?? '');
            const nat = /^(water|wood|scrub|coastline)$/.test(t.natural ?? '') || /^(river|canal|riverbank)$/.test(t.waterway ?? '') || /^(forest|reservoir|basin|grass|meadow)$/.test(t.landuse ?? '') || /^(park|nature_reserve|garden)$/.test(t.leisure ?? '');
            if (!viaPredio && !nat && temTag) continue;
            if (!it.refs!.some((r) => idx.has(r))) continue;
            if (!temTag) { contornos.set(it.id, it.refs!); continue; }
            const g = geometria(it.refs!);
            if (g.geometry.length < 2) continue;
            const el: ElOSM = { type: 'way', id: it.id, tags: t, nodes: g.nodes, geometry: g.geometry };
            for (const a of alvos) {
              if (viaPredio && cruza(a.construivel, ...g.bb)) viasPredios.get(a.ibge)!.push(el);
              if (nat && cruza(a.mapa, ...g.bb)) natureza.get(a.ibge)!.push(el);
            }
            // contorno etiquetado também pode ser membro de relação
            contornos.set(it.id, it.refs!);
          } else if (it.type === 'relation') {
            const t = it.tags ?? {};
            if (t.natural !== 'water' && t.water === undefined) continue;
            const membros = (it.members ?? []).filter((m) => m.type === 'way' && m.role === 'outer' && contornos.has(m.id));
            if (!membros.length) continue;
            const geoms = membros.map((m) => ({ type: 'way', role: 'outer', ...geometria(contornos.get(m.id)!) }));
            const s = Math.min(...geoms.map((g) => g.bb[0])), w = Math.min(...geoms.map((g) => g.bb[1])), nn = Math.max(...geoms.map((g) => g.bb[2])), e = Math.max(...geoms.map((g) => g.bb[3]));
            const el: ElOSM = { type: 'relation', id: it.id, tags: t, members: geoms.map((g) => ({ type: g.type, role: g.role, geometry: g.geometry })) };
            for (const a of alvos) if (cruza(a.mapa, s, w, nn, e)) natureza.get(a.ibge)!.push(el);
          }
        }
        if (lidos % 5_000_000 < itens.length) process.stdout.write(`    ${(lidos / 1e6).toFixed(0)} M elementos lidos, ${(n / 1e6).toFixed(2)} M nós guardados\n`);
        prox();
      },
    })).on('finish', ok).on('error', falha);
  });

  await mkdir(saida, { recursive: true });
  for (const a of alvos) {
    await writeFile(join(saida, `${a.ibge}-vias-predios.json`), JSON.stringify(viasPredios.get(a.ibge)));
    await writeFile(join(saida, `${a.ibge}-natureza.json`), JSON.stringify(natureza.get(a.ibge)));
    await writeFile(join(saida, `${a.ibge}-sinais.json`), JSON.stringify(sinais.get(a.ibge)));
  }
}
