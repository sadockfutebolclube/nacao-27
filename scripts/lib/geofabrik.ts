/**
 * Extração local do OpenStreetMap a partir dos arquivos regionais da Geofabrik (.osm.pbf), para quando
 * o Overpass está indisponível. Lê o arquivo uma vez (nós → vias → relações, na ordem do PBF) e grava,
 * para cada cidade, os mesmos arquivos de cache que o Overpass geraria (formato `out geom`).
 *
 * Fonte: https://download.geofabrik.de/south-america/brazil.html — © colaboradores do OpenStreetMap (ODbL).
 */
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync, statSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { Writable } from 'node:stream';
import { createInterface } from 'node:readline';
import { createGunzip, createGzip } from 'node:zlib';

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

/**
 * Versão do que o extrator grava (filtros de tags, campos derivados). Subir quando mudar o que sai em `<ibge>-*.json`: o
 * manifesto (`manifesto.json`) guarda o hash de cada cidade e a extração só refaz o que o hash não reconhece.
 */
export const EXTRATOR_VERSAO = 3;
/** versão do formato do recorte (arquivo intermediário filtrado por caixa) */
const RECORTE_VERSAO = 1;
/** folga (graus, ≈ 9 km) em volta das caixas das cidades no recorte: mudar a caixa dentro dela reaproveita o recorte */
const FOLGA_RECORTE = 0.08;

const arred = (b: BBox) => b.map((v) => Math.round(v * 1e5) / 1e5) as BBox;
const sha = (v: unknown) => createHash('sha1').update(JSON.stringify(v)).digest('hex').slice(0, 12);
/** hash da extração de uma cidade: caixas + versão do extrator */
export const hashAlvo = (a: AlvoCidade) => sha([a.ibge, arred(a.construivel), arred(a.mapa), EXTRATOR_VERSAO]);

/** Quais cidades NÃO têm todos os arquivos de cache com o hash de caixa+versão igual ao do manifesto. */
export async function alvosDesatualizados(alvos: AlvoCidade[], pasta: string): Promise<AlvoCidade[]> {
  let man: Record<string, string> = {};
  try { man = JSON.parse(await readFile(join(pasta, 'manifesto.json'), 'utf8')); } catch { /* sem manifesto: tudo desatualizado */ }
  const arquivos = ['vias-predios', 'natureza', 'sinais', 'bairros', 'trilhos', 'caminhos'];
  return alvos.filter((a) => man[a.ibge] !== hashAlvo(a) || !arquivos.every((n) => existsSync(join(pasta, `${a.ibge}-${n}.json`))));
}

async function gravarManifesto(alvos: AlvoCidade[], pasta: string) {
  let man: Record<string, string> = {};
  try { man = JSON.parse(await readFile(join(pasta, 'manifesto.json'), 'utf8')); } catch { /* novo */ }
  for (const a of alvos) man[a.ibge] = hashAlvo(a);
  await writeFile(join(pasta, 'manifesto.json'), JSON.stringify(man, null, 1));
}

interface Item { type: 'node' | 'way' | 'relation'; id: number; lat?: number; lon?: number; tags?: Record<string, string>; refs?: number[]; members?: { type: string; id: number; role: string }[] }
interface ElOSM { type: 'way' | 'relation'; id: number; tags?: Record<string, string>; nodes?: number[]; geometry?: { lat: number; lon: number }[]; members?: { type: string; role: string; geometry?: { lat: number; lon: number }[] }[] }

const unirCaixas = (cs: BBox[]): BBox => [Math.min(...cs.map((c) => c[0])), Math.min(...cs.map((c) => c[1])), Math.max(...cs.map((c) => c[2])), Math.max(...cs.map((c) => c[3]))];

/** Caminho do recorte desta região: hash da união das caixas (+ folga), do tamanho do PBF e da versão do formato. */
export function caminhoRecorte(pbf: string, alvos: AlvoCidade[], saida: string) {
  const u = arred(expandir(unirCaixas(alvos.map((a) => a.mapa)), FOLGA_RECORTE));
  return { caixa: u, arquivo: join(saida, `recorte-${sha([u, statSync(pbf).size, RECORTE_VERSAO])}.ndjson.gz`) };
}

/**
 * Pré-filtro por caixa ANTES do parse completo (Fase 23). Com `osmium` no PATH, `osmium extract` recorta o PBF (não instalado
 * aqui: sem ele, cai no caminho de Node). No caminho de Node a primeira passada grava só o que toca a caixa — nós dentro dela,
 * vias com algum nó nela, relações de água — em NDJSON gzip; as passadas seguintes (outra caixa dentro da folga, versão nova do
 * extrator) leem esse recorte, uma pequena fração do PBF, em vez das centenas de MB do Sudeste.
 */
function osmiumDisponivel() { return spawnSync('osmium', ['--version'], { encoding: 'utf8' }).status === 0; }

async function* itensDoRecorte(arquivo: string): AsyncGenerator<Item[]> {
  const rl = createInterface({ input: createReadStream(arquivo).pipe(createGunzip()), crlfDelay: Infinity });
  for await (const linha of rl) {
    if (!linha) continue;
    const lote = JSON.parse(linha) as unknown[][];
    yield lote.map((c): Item => c[0] === 0 ? { type: 'node', id: c[1] as number, lat: c[2] as number, lon: c[3] as number, ...(c[4] ? { tags: c[4] as Record<string, string> } : {}) }
      : c[0] === 1 ? { type: 'way', id: c[1] as number, tags: c[2] as Record<string, string>, refs: c[3] as number[] }
      : { type: 'relation', id: c[1] as number, tags: c[2] as Record<string, string>, members: c[3] as Item['members'] });
  }
}

export async function extrairRegiao(pbf: string, alvos: AlvoCidade[], saida: string, opcoes: { semRecorte?: boolean } = {}): Promise<void> {
  await mkdir(saida, { recursive: true });
  const rec = caminhoRecorte(pbf, alvos, saida);
  const usarRecorte = !opcoes.semRecorte && existsSync(rec.arquivo);
  const gravarRecorte = !opcoes.semRecorte && !usarRecorte;
  let fontePbf = pbf;
  if (gravarRecorte && osmiumDisponivel()) {
    const [s, w, n, e] = rec.caixa;
    const r = spawnSync('osmium', ['extract', '-b', `${w},${s},${e},${n}`, '--strategy=smart', '--overwrite', '-o', join(saida, 'recorte-osmium.osm.pbf'), pbf], { stdio: 'inherit' });
    if (r.status === 0) { fontePbf = join(saida, 'recorte-osmium.osm.pbf'); console.log('    pré-filtro: osmium extract'); }
  }
  console.log(usarRecorte ? `    fonte: recorte ${rec.arquivo.split(/[\\/]/).pop()}` : `    fonte: ${fontePbf.split(/[\\/]/).pop()}${gravarRecorte && fontePbf === pbf ? ' (gravando o recorte por caixa)' : ''}`);
  // gravação do recorte: nós na caixa, vias com algum nó guardado, relações de água
  const caixaRec = rec.caixa;
  const tmp = rec.arquivo + '.tmp';
  const out = gravarRecorte && fontePbf === pbf ? createGzip({ level: 3 }) : null;
  const fim = out ? new Promise<void>((ok, falha) => { const w = createWriteStream(tmp); out.pipe(w); w.on('finish', ok); w.on('error', falha); }) : null;
  const idxRec = new Set<number>();
  const recortar = (itens: Item[]) => {
    const lote: unknown[][] = [];
    for (const it of itens) {
      if (it.type === 'node') { if (dentroBB(caixaRec, it.lat!, it.lon!)) { idxRec.add(it.id); lote.push(it.tags ? [0, it.id, it.lat, it.lon, it.tags] : [0, it.id, it.lat, it.lon]); } }
      else if (it.type === 'way') { if (it.refs!.some((r) => idxRec.has(r))) lote.push([1, it.id, it.tags ?? {}, it.refs]); }
      else if ((it.tags?.natural === 'water' || it.tags?.water !== undefined) && it.members) lote.push([2, it.id, it.tags, it.members]);
    }
    if (lote.length) out!.write(JSON.stringify(lote) + '\n');
  };
  const tFonte = performance.now();
  await extrairDe(usarRecorte ? itensDoRecorte(rec.arquivo) : null, fontePbf, alvos, saida, out ? recortar : null);
  if (out && fim) { out.end(); await fim; await rename(tmp, rec.arquivo); }
  console.log(`    leitura da fonte: ${((performance.now() - tFonte) / 1000).toFixed(1)} s`);
  await gravarManifesto(alvos, saida);
}

async function extrairDe(fonte: AsyncGenerator<Item[]> | null, pbf: string, alvos: AlvoCidade[], saida: string, aoLer: ((itens: Item[]) => void) | null): Promise<void> {
  // nós guardados: dentro do mapa de alguma cidade, com 1 km de folga (polígonos que cruzam a borda)
  const caixas = alvos.map((a) => expandir(a.mapa, 0.01));
  const idx = new Map<number, number>();
  let coords = new Float64Array(1 << 20);
  let n = 0;
  const viasPredios = new Map<string, ElOSM[]>(alvos.map((a) => [a.ibge, []]));
  const natureza = new Map<string, ElOSM[]>(alvos.map((a) => [a.ibge, []]));
  /** Fase 14: semáforos (s) e faixas de pedestre (c) dentro da área construível de cada cidade */
  const sinais = new Map<string, { lat: number; lon: number; t: 's' | 'c' }[]>(alvos.map((a) => [a.ibge, []]));
  /** Fase 16: bairros (place=suburb/neighbourhood/quarter) dentro do mapa de cada cidade */
  const bairros = new Map<string, { nome: string; lat: number; lon: number; t: number }[]>(alvos.map((a) => [a.ibge, []]));
  /** Fase 18: trilhos (metrô, trem, VLT, bonde, cremalheira) e estações no mapa de cada cidade */
  const trilhos = new Map<string, ElOSM[]>(alvos.map((a) => [a.ibge, []]));
  /** Fase 20: escadarias, trilhas e calçadões (vias que não são de carro) */
  const caminhos = new Map<string, ElOSM[]>(alvos.map((a) => [a.ibge, []]));
  const estacoes = new Map<string, { lat: number; lon: number; tags: Record<string, string> }[]>(alvos.map((a) => [a.ibge, []]));
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

  const processar = (itens: Item[]) => {
      for (const it of itens) {
        lidos++;
        if (it.type === 'node') {
          const lat = it.lat!, lon = it.lon!;
          if (!caixas.some((b) => dentroBB(b, lat, lon))) continue;
          if (n * 2 + 2 > coords.length) { const c2 = new Float64Array(coords.length * 2); c2.set(coords); coords = c2; }
          idx.set(it.id, n); coords[n * 2] = lat; coords[n * 2 + 1] = lon; n++;
          const nt = it.tags;
          if (nt?.name && /^(suburb|neighbourhood|quarter)$/.test(nt.place ?? '')) {
            for (const a of alvos) if (dentroBB(a.mapa, lat, lon)) bairros.get(a.ibge)!.push({ nome: nt.name, lat, lon, t: nt.place === 'suburb' ? 0 : 1 });
          }
          if (nt && (/^(station|halt|tram_stop|subway_entrance)$/.test(nt.railway ?? '') || nt.public_transport === 'station' || nt.station)) {
            const dica: Record<string, string> = {};
            for (const k of ['name', 'railway', 'station', 'network', 'operator', 'public_transport', 'subway', 'light_rail', 'train', 'tram', 'colour', 'ref']) if (nt[k]) dica[k] = nt[k];
            for (const a of alvos) if (dentroBB(a.mapa, lat, lon)) estacoes.get(a.ibge)!.push({ lat, lon, tags: dica });
          }
          if (nt && (nt.highway === 'traffic_signals' || nt.highway === 'crossing' || nt.crossing)) {
            for (const a of alvos) if (dentroBB(a.construivel, lat, lon)) sinais.get(a.ibge)!.push({ lat, lon, t: nt.highway === 'traffic_signals' ? 's' : 'c' });
          }
        } else if (it.type === 'way') {
          const t = it.tags ?? {};
          const temTag = Object.keys(t).length > 0;
          const viaPredio = !!t.building || (!!t.highway && RE_VIA.test(t.highway)) || /^(residential|commercial|retail|industrial)$/.test(t.landuse ?? '');
          const nat = /^(water|wood|scrub|coastline)$/.test(t.natural ?? '') || /^(river|canal|riverbank)$/.test(t.waterway ?? '') || /^(forest|reservoir|basin|grass|meadow)$/.test(t.landuse ?? '') || /^(park|nature_reserve|garden)$/.test(t.leisure ?? '');
          const trilho = /^(subway|light_rail|rail|tram|rack|funicular|monorail)$/.test(t.railway ?? '') && !/^(yard|siding|spur|crossover)$/.test(t.service ?? '');
          // calçada (footway=sidewalk) e faixa de pedestre já existem no desenho das ruas; área (area=yes) não é linha
          const caminho = /^(steps|footway|path|pedestrian|track|cycleway)$/.test(t.highway ?? '') && t.area !== 'yes' && !/^(sidewalk|crossing|traffic_island)$/.test(t.footway ?? '');
          if (!viaPredio && !nat && !trilho && !caminho && temTag) continue;
          if (!it.refs!.some((r) => idx.has(r))) continue;
          if (!temTag) { contornos.set(it.id, it.refs!); continue; }
          const g = geometria(it.refs!);
          if (g.geometry.length < 2) continue;
          const el: ElOSM = { type: 'way', id: it.id, tags: t, nodes: g.nodes, geometry: g.geometry };
          for (const a of alvos) {
            if (viaPredio && cruza(a.construivel, ...g.bb)) viasPredios.get(a.ibge)!.push(el);
            if (nat && cruza(a.mapa, ...g.bb)) natureza.get(a.ibge)!.push(el);
            if (caminho && cruza(a.construivel, ...g.bb)) {
              const dica: Record<string, string> = {};
              for (const k of ['highway', 'name', 'surface', 'width', 'incline', 'bridge', 'tunnel', 'footway', 'step_count', 'handrail']) if (t[k]) dica[k] = t[k];
              caminhos.get(a.ibge)!.push({ ...el, tags: dica });
            }
            if (trilho && cruza(a.mapa, ...g.bb)) {
              const dica: Record<string, string> = {};
              for (const k of ['railway', 'name', 'ref', 'colour', 'operator', 'network', 'tunnel', 'bridge', 'layer', 'usage', 'electrified', 'line', 'route']) if (t[k]) dica[k] = t[k];
              trilhos.get(a.ibge)!.push({ ...el, tags: dica });
            }
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
  };
  if (fonte) { for await (const lote of fonte) processar(lote); }
  else {
    await new Promise<void>((ok, falha) => {
      createReadStream(pbf).pipe(parser()).pipe(new Writable({
        objectMode: true,
        write(itens: Item[], _enc, prox) { aoLer?.(itens); processar(itens); prox(); },
      })).on('finish', ok).on('error', falha);
    });
  }

  await mkdir(saida, { recursive: true });
  for (const a of alvos) {
    await writeFile(join(saida, `${a.ibge}-vias-predios.json`), JSON.stringify(viasPredios.get(a.ibge)));
    await writeFile(join(saida, `${a.ibge}-natureza.json`), JSON.stringify(natureza.get(a.ibge)));
    await writeFile(join(saida, `${a.ibge}-sinais.json`), JSON.stringify(sinais.get(a.ibge)));
    await writeFile(join(saida, `${a.ibge}-bairros.json`), JSON.stringify(bairros.get(a.ibge)));
    await writeFile(join(saida, `${a.ibge}-caminhos.json`), JSON.stringify(caminhos.get(a.ibge)));
    await writeFile(join(saida, `${a.ibge}-trilhos.json`), JSON.stringify({ vias: trilhos.get(a.ibge), estacoes: estacoes.get(a.ibge) }));
  }
}
