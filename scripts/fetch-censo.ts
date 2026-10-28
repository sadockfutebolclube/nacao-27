/**
 * NAÇÃO 27 — Censo 2022 por bairro do Rio (Fase 17).
 *
 *   npm run fetch-censo
 *
 * Fonte: Instituto Pereira Passos (IPP) / Prefeitura do Rio — "Censo 2022: População e domicílios por bairros
 * (dados preliminares)", agregação dos setores censitários da divulgação do IBGE de 21/03/2024, publicada no
 * Data.Rio (https://www.data.rio/datasets/fd354740f1934bf5bf8e9b0e2b509aa9_2/about). Baixa o GeoJSON dos 165
 * bairros do serviço ArcGIS da prefeitura e gera public/data/rio/bairros.json: população 2010 e 2022,
 * domicílios, área e o contorno de cada bairro em metros no sistema do jogo, simplificado a 15 m.
 */
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'data', 'cache', 'censo');
const SERVICO = 'https://pgeo3.rio.rj.gov.br/arcgis/rest/services/Censo/Limites_administrativos_Censo_2022/MapServer/2';
const URL_GEOJSON = `${SERVICO}/query?where=1%3D1&outFields=*&returnGeometry=true&outSR=4326&f=geojson&geometryPrecision=5`;
const r1 = (v: number) => Math.round(v * 10) / 10;

type P = [number, number];

function simplificar(pts: P[], tol: number): P[] {
  if (pts.length < 5) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const pilha: [number, number][] = [[0, pts.length - 1]];
  while (pilha.length) {
    const [a, b] = pilha.pop()!;
    const [ax, az] = pts[a], [bx, bz] = pts[b];
    const L = Math.hypot(bx - ax, bz - az) || 1e-9;
    let dm = 0, k = -1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((bx - ax) * (az - pts[i][1]) - (ax - pts[i][0]) * (bz - az)) / L;
      if (d > dm) { dm = d; k = i; }
    }
    if (dm > tol && k > 0) { keep[k] = 1; pilha.push([a, k], [k, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

/** Anel fechado: a corda primeiro→último tem comprimento zero, então divide no ponto mais distante do primeiro. */
function simplificarAnel(pts: P[], tol: number): P[] {
  const aberto = Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) < 1e-6 ? pts.slice(0, -1) : pts;
  let far = 0, dm = -1;
  for (let i = 1; i < aberto.length; i++) { const d = Math.hypot(aberto[i][0] - aberto[0][0], aberto[i][1] - aberto[0][1]); if (d > dm) { dm = d; far = i; } }
  if (far < 2) return aberto;
  const a = simplificar(aberto.slice(0, far + 1), tol), b = simplificar([...aberto.slice(far), aberto[0]], tol);
  return [...a.slice(0, -1), ...b.slice(0, -1)];
}

interface Feicao { properties: Record<string, string | number>; geometry: { type: string; coordinates: number[][][] | number[][][][] } }

async function main() {
  await mkdir(CACHE, { recursive: true });
  const arq = join(CACHE, 'bairros.geojson');
  if (!existsSync(arq)) {
    console.log('baixando os bairros do Censo 2022 (IPP)…');
    const r = await fetch(URL_GEOJSON);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    await writeFile(arq, Buffer.from(await r.arrayBuffer()));
  }
  const geo = JSON.parse(readFileSync(arq, 'utf8')) as { features: Feicao[] };
  const cidade = JSON.parse(readFileSync(join(ROOT, 'public', 'data', 'cidades', '3304557.json'), 'utf8')) as { lat: number; lon: number };
  const kx = 111_320 * Math.cos((cidade.lat * Math.PI) / 180), kz = 110_574;
  const proj = (lon: number, lat: number): P => [(lon - cidade.lon) * kx, -(lat - cidade.lat) * kz];

  const bairros: { nome: string; ra: string; ap: string; pop: number; pop10: number; dom: number; km2: number; aneis: number[][] }[] = [];
  let somaPop = 0, dentro = 0;
  for (const f of geo.features) {
    const p = f.properties;
    const pop = Number(p.Total_de_pessoas_2022 ?? 0);
    somaPop += pop;
    const partes = (f.geometry.type === 'Polygon' ? [f.geometry.coordinates as number[][][]] : (f.geometry.coordinates as number[][][][]));
    const aneis: number[][] = [];
    for (const poligono of partes) for (const anel of poligono) {
      const pts = simplificarAnel(anel.map(([lo, la]) => proj(lo, la)), 15);
      if (pts.length < 4) continue;
      // fora do mapa de 16 km (Zona Oeste, Baixada): não serve ao jogo
      if (!pts.some(([x, z]) => Math.abs(x) < 9000 && Math.abs(z) < 9000)) continue;
      aneis.push(pts.flatMap(([x, z]) => [r1(x), r1(z)]));
    }
    if (!aneis.length) continue;
    dentro++;
    bairros.push({
      nome: String(p.nome), ra: String(p.regiao_adm ?? ''), ap: String(p.area_plane ?? ''), pop, pop10: Number(p.Total_de_pessoas_2010 ?? 0),
      dom: Number(p.Total_de_domicilios_2022 ?? 0), km2: Math.round(Number(p.Shape_Area ?? 0) / 1e4) / 100, aneis,
    });
  }

  const saida = {
    versao: 1,
    fonte: 'Censo Demográfico 2022 (IBGE, divulgação preliminar de 21/03/2024) agregado por bairro pelo Instituto Pereira Passos — Prefeitura do Rio, via Data.Rio',
    bairros,
  };
  const dir = join(ROOT, 'public', 'data', 'rio');
  await mkdir(dir, { recursive: true });
  const json = JSON.stringify(saida);
  await writeFile(join(dir, 'bairros.json'), json);
  console.log(`${geo.features.length} bairros no serviço (${(somaPop / 1e6).toFixed(2)} milhões de pessoas), ${dentro} dentro do mapa · ${(json.length / 1e3).toFixed(0)} KB`);
}

main().catch((e) => { console.error(e); process.exit(1); });
