/**
 * NAÇÃO 27 — municípios jogáveis (Fase 8).
 *
 *   npm run fetch-municipios
 *
 * Para as maiores cidades de cada UF (lista do IBGE em public/data/ufs/{UF}.json):
 *  - coordenadas da sede: base aberta kelvins/municipios-brasileiros (MIT), dados do IBGE;
 *  - relevo e litoral: grade 11×11 de altitudes num quadrado de 6 km centrado na sede, amostrada dos
 *    tiles de terreno "Terrarium" (Mapzen/Tilezen no AWS Open Data: SRTM + GMTED + ETOPO1, z11 ≈ 76 m/px)
 *    — o mar tem altitude ≤ 0 (batimetria);
 *  - distância da costa: contorno do Brasil (malha do IBGE) menos as fronteiras internacionais;
 *  - bioma: regras geográficas a partir dos biomas da UF (ver DECISIONS D-045);
 *  - clima: ajuste estimado das normais da capital (altitude e continentalidade).
 * A capital mantém o terreno e o bioma curados em data/ufs/traits.json.
 *
 * Saída: public/data/municipios/{UF}.json · Cache: data/cache/
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { inflateSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MunicipiosUF, type MunicipioJogavel } from '../src/data/municipios.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'data', 'municipios');
const CACHE = join(ROOT, 'data', 'cache');
const CSV = 'https://raw.githubusercontent.com/kelvins/municipios-brasileiros/main/csv/municipios.csv';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

type Bioma = MunicipioJogavel['bioma'];
type Terreno = MunicipioJogavel['terreno'];
interface Traco { sigla: string; capital: { nome: string; lat: number; lon: number }; biomas: Bioma[]; terreno: Terreno }

async function cacheTexto(nome: string, url: string): Promise<string> {
  const arq = join(CACHE, nome);
  try { return await readFile(arq, 'utf8'); } catch { /* baixa */ }
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status} em ${url}`);
  const t = await r.text();
  await mkdir(CACHE, { recursive: true });
  await writeFile(arq, t);
  return t;
}

/** Decodifica um PNG RGB/RGBA de 8 bits (os tiles Terrarium) — só o necessário, sem dependências. */
function decodePng(buf: Buffer): { w: number; h: number; px: Uint8Array; canais: number } {
  let p = 8, w = 0, h = 0, canais = 3;
  const idat: Buffer[] = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), tipo = buf.toString('ascii', p + 4, p + 8), dado = buf.subarray(p + 8, p + 8 + len);
    if (tipo === 'IHDR') { w = dado.readUInt32BE(0); h = dado.readUInt32BE(4); canais = dado[9] === 6 ? 4 : 3; if (dado[8] !== 8 || dado[12] !== 0) throw new Error('PNG não suportado'); }
    else if (tipo === 'IDAT') idat.push(dado);
    else if (tipo === 'IEND') break;
    p += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat)), linha = w * canais, px = new Uint8Array(w * h * canais);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (linha + 1)], src = raw.subarray(y * (linha + 1) + 1, (y + 1) * (linha + 1));
    for (let x = 0; x < linha; x++) {
      const a = x >= canais ? px[y * linha + x - canais] : 0, b = y > 0 ? px[(y - 1) * linha + x] : 0, c = x >= canais && y > 0 ? px[(y - 1) * linha + x - canais] : 0;
      let v = src[x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      px[y * linha + x] = v & 255;
    }
  }
  return { w, h, px, canais };
}

const ZOOM = 11;
const tiles = new Map<string, ReturnType<typeof decodePng>>();
async function tile(x: number, y: number) {
  const chave = `${ZOOM}_${x}_${y}`;
  const t0 = tiles.get(chave);
  if (t0) return t0;
  const arq = join(CACHE, 'terrarium', `${chave}.png`);
  let buf: Buffer;
  try { buf = await readFile(arq); } catch {
    for (let t = 0; ; t++) {
      const r = await fetch(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${ZOOM}/${x}/${y}.png`);
      if (r.ok) { buf = Buffer.from(await r.arrayBuffer()); break; }
      if (t > 4) throw new Error(`terrarium: HTTP ${r.status}`);
      await sleep(2000);
    }
    await mkdir(dirname(arq), { recursive: true });
    await writeFile(arq, buf);
  }
  const d = decodePng(buf);
  tiles.set(chave, d);
  return d;
}

/** Altitude (m) por interpolação bilinear nos tiles Terrarium: h = R·256 + G + B/256 − 32768. */
async function elevacoes(lats: number[], lons: number[]): Promise<number[]> {
  const n = 2 ** ZOOM, out: number[] = [];
  const amostra = async (px: number, py: number) => {
    const tx = Math.floor(px / 256), ty = Math.floor(py / 256), t = await tile(tx, ty);
    const i = ((py - ty * 256) * t.w + (px - tx * 256)) * t.canais;
    return t.px[i] * 256 + t.px[i + 1] + t.px[i + 2] / 256 - 32768;
  };
  for (let k = 0; k < lats.length; k++) {
    const lat = lats[k] * Math.PI / 180;
    const fx = ((lons[k] + 180) / 360) * n * 256 - 0.5, fy = ((1 - Math.log(Math.tan(lat) + 1 / Math.cos(lat)) / Math.PI) / 2) * n * 256 - 0.5;
    const x0 = Math.floor(fx), y0 = Math.floor(fy), ax = fx - x0, ay = fy - y0;
    const [a, b, c, d] = await Promise.all([amostra(x0, y0), amostra(x0 + 1, y0), amostra(x0, y0 + 1), amostra(x0 + 1, y0 + 1)]);
    out.push(Math.round((a * (1 - ax) + b * ax) * (1 - ay) + (c * (1 - ax) + d * ax) * ay));
  }
  return out;
}

const haversine = (a: [number, number], b: [number, number]) => {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b[1] - a[1]) * rad, dLon = (b[0] - a[0]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

/** Pontos da costa: arestas do contorno do Brasil que não são fronteira com outro país. */
async function costa(): Promise<[number, number][]> {
  const g = JSON.parse(await readFile(join(ROOT, 'public', 'data', 'geo', 'brasil-ufs.geojson'), 'utf8')) as { features: { geometry: { type: string; coordinates: unknown } }[] };
  const cont = new Map<string, number>();
  const arestas: [[number, number], [number, number]][] = [];
  const k = (p: number[]) => `${p[0].toFixed(3)},${p[1].toFixed(3)}`;
  for (const f of g.features) {
    const polis = (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates) as number[][][][];
    for (const poli of polis) for (const anel of poli) for (let i = 1; i < anel.length; i++) {
      const a = anel[i - 1], b = anel[i];
      const chave = [k(a), k(b)].sort().join('|');
      cont.set(chave, (cont.get(chave) ?? 0) + 1);
      arestas.push([[a[0], a[1]], [b[0], b[1]]]);
    }
  }
  const pts: [number, number][] = [];
  for (const [a, b] of arestas) {
    const chave = [k(a), k(b)].sort().join('|');
    if (cont.get(chave)! > 1) continue;
    const lon = (a[0] + b[0]) / 2, lat = (a[1] + b[1]) / 2;
    // fronteiras internacionais ficam a oeste; Amapá–Guiana e Rio Grande do Sul–Uruguai têm recortes próprios
    if (lon < -53.2) continue;
    if (lat > 1.2 && lon < -51.4) continue;
    if (lat < -31.5 && lon < -53.0) continue;
    pts.push([lon, lat]);
  }
  return pts;
}

function bioma(t: Traco, regiao: string, lat: number, lon: number, elev: number, distCosta: number): Bioma {
  const tem = (b: Bioma) => t.biomas.includes(b);
  if (tem('pantanal') && lat > -22 && lat < -15.5 && lon < -54.8 && elev < 250) return 'pantanal';
  if (tem('pampa') && lat < -29.6 && lon < -51.0) return 'pampa';
  if (tem('amazonia') && (regiao === 'Norte' && t.sigla !== 'TO' || (t.sigla === 'MT' && lat > -12.8) || (t.sigla === 'MA' && (lon < -45.6 || lat > -2.8)))) return 'amazonia';
  // semiárido: interior do Nordeste, o agreste acima de 300 m e o litoral norte potiguar (Mossoró)
  const semiarido = distCosta > 110 || (distCosta > 80 && elev > 300) || (t.sigla === 'RN' && lon < -35.6);
  if (tem('caatinga') && semiarido && (regiao === 'Nordeste' || lat > -16.3)) {
    if (tem('cerrado') && (lon < -44.2 || t.sigla === 'MA' || (t.sigla === 'MG' && lat < -16))) return 'cerrado';
    return 'caatinga';
  }
  if (tem('mata-atlantica') && (distCosta < 160 || ['SP', 'RJ', 'ES', 'PR', 'SC'].includes(t.sigla) || (t.sigla === 'MG' && lon > -44.6 && lat < -19) || (t.sigla === 'RS' && lat > -29.6))) return 'mata-atlantica';
  if (tem('cerrado')) return 'cerrado';
  return t.biomas[0];
}

function terreno(el: number[], N: number, regiao: string): { terreno: Terreno; desnivel: number } {
  const ord = [...el].filter((v) => v > 0).sort((a, b) => a - b);
  const q = (p: number) => ord[Math.min(ord.length - 1, Math.floor(p * ord.length))] ?? 0;
  const desnivel = q(0.9) - q(0.1);
  const media = ord.reduce((a, b) => a + b, 0) / Math.max(1, ord.length);
  // mar: pontos com altitude 0; o lado é a direção do centróide da água
  let sx = 0, sz = 0, n = 0;
  el.forEach((v, i) => { if (v <= 0) { sx += (i % N) - (N - 1) / 2; sz += Math.floor(i / N) - (N - 1) / 2; n++; } });
  const relevo = clamp(desnivel / 260, 0.12, 0.95);
  if (n / el.length > 0.04) {
    // grade: i cresce para leste, j cresce para o sul (latitude decrescente)
    const lado = Math.abs(sx) > Math.abs(sz) ? (sx > 0 ? 'E' : 'W') : (sz > 0 ? 'S' : 'N');
    const tipoAgua = n / el.length > 0.45 ? 'mar' : 'baia';
    return { terreno: { tipo: relevo > 0.45 ? 'litoral-morros' : 'litoral-plano', agua: { lado, tipo: tipoAgua }, relevo }, desnivel };
  }
  if (relevo > 0.6) return { terreno: { tipo: 'serra', agua: null, relevo }, desnivel };
  if (media > 520) return { terreno: { tipo: 'planalto', agua: null, relevo }, desnivel };
  if (regiao === 'Norte' && media < 90) {
    // várzea amazônica: o rio corre pelo lado mais baixo
    let bx = 0, bz = 0;
    el.forEach((v, i) => { const w = Math.max(0, media - v); bx += w * ((i % N) - (N - 1) / 2); bz += w * (Math.floor(i / N) - (N - 1) / 2); });
    const lado = Math.abs(bx) > Math.abs(bz) ? (bx > 0 ? 'E' : 'W') : (bz > 0 ? 'S' : 'N');
    return { terreno: { tipo: 'varzea', agua: { lado, tipo: 'rio' }, relevo }, desnivel };
  }
  return { terreno: { tipo: 'planicie', agua: null, rio: true, relevo }, desnivel };
}

function descricao(m: { terreno: Terreno; bioma: Bioma; elevacao: number; distCostaKm: number; capital: boolean }): string {
  const t = { 'litoral-morros': 'litoral com morros', 'litoral-plano': 'litoral plano', planalto: 'planalto', planicie: 'planície', varzea: 'várzea de rio', serra: 'serra' }[m.terreno.tipo];
  const b = { 'mata-atlantica': 'Mata Atlântica', cerrado: 'Cerrado', caatinga: 'Caatinga', amazonia: 'Amazônia', pampa: 'Pampa', pantanal: 'Pantanal' }[m.bioma];
  return `${t[0].toUpperCase()}${t.slice(1)} · ${b} · ${Math.round(m.elevacao)} m de altitude${m.distCostaKm > 30 ? ` · ${Math.round(m.distCostaKm)} km do mar` : ''}`;
}

async function main() {
  const traits = JSON.parse(await readFile(join(ROOT, 'data', 'ufs', 'traits.json'), 'utf8')) as { ufs: Traco[] };
  const csv = (await cacheTexto('municipios-coordenadas.csv', CSV)).split('\n').slice(1).map((l) => l.split(','));
  const coord = new Map(csv.filter((c) => c.length > 4).map((c) => [c[0], { lat: Number(c[2]), lon: Number(c[3]) }]));
  const pontosCosta = await costa();
  const distCosta = (lon: number, lat: number) => Math.min(...pontosCosta.map((p) => haversine([lon, lat], p)));
  await mkdir(OUT, { recursive: true });
  const N = 11, PASSO_KM = 0.6;
  for (const t of traits.ufs) {
    const uf = JSON.parse(await readFile(join(ROOT, 'public', 'data', 'ufs', `${t.sigla}.json`), 'utf8')) as { regiao: { nome: string }; maioresMunicipios: { id: number; nome: string; populacao: number }[] };
    const regiao = uf.regiao.nome;
    const lista = [...uf.maioresMunicipios];
    if (!lista.some((m) => m.nome === t.capital.nome)) console.warn(`  ${t.sigla}: capital fora da lista`);
    const cap = lista.find((m) => m.nome === t.capital.nome);
    const out: MunicipioJogavel[] = [];
    let elevCap = 0;
    for (const m of lista) {
      const c = coord.get(String(m.id)) ?? { lat: t.capital.lat, lon: t.capital.lon };
      const capital = m.nome === t.capital.nome;
      const lats: number[] = [], lons: number[] = [];
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        lats.push(c.lat + ((N - 1) / 2 - j) * PASSO_KM / 111);
        lons.push(c.lon + (i - (N - 1) / 2) * PASSO_KM / (111 * Math.cos(c.lat * Math.PI / 180)));
      }
      const el = (await elevacoes(lats, lons)).map((v) => Math.max(0, v));
      const elevacao = el[Math.floor(el.length / 2)];
      if (capital) elevCap = elevacao;
      const dc = distCosta(c.lon, c.lat);
      const tr = terreno(el, N, regiao);
      const b = capital ? t.biomas[0] : bioma(t, regiao, c.lat, c.lon, elevacao, dc);
      const ter = capital ? t.terreno : tr.terreno;
      const reg = { ibge: String(m.id), nome: m.nome, populacao: m.populacao, capital, lat: c.lat, lon: c.lon, elevacao, desnivel: Math.round(tr.desnivel), distCostaKm: Math.round(dc), terreno: ter, bioma: b, clima: { dTemp: 0, fChuva: 1, estimado: !capital }, descricao: '' };
      reg.descricao = descricao(reg);
      out.push(reg);
    }
    // clima: a partir das normais da capital — gradiente de altitude e semiárido longe da costa
    const capReg = out.find((x) => x.capital);
    for (const x of out) {
      if (x.capital) continue;
      x.clima.dTemp = Math.round(-0.0062 * (x.elevacao - elevCap) * 10) / 10;
      let f = 1;
      if (x.bioma === 'caatinga' && capReg?.bioma !== 'caatinga') f = clamp(1 - (x.distCostaKm - 60) / 450, 0.35, 0.8);
      else if (regiao === 'Nordeste' && x.distCostaKm > 60) f = clamp(1 - (x.distCostaKm - 60) / 700, 0.5, 1);
      x.clima.fChuva = Math.round(f * 100) / 100;
    }
    if (!cap) console.warn(`  ${t.sigla}: sem capital`);
    const dados = MunicipiosUF.parse({ sigla: t.sigla, geradoEm: new Date().toISOString(), municipios: out });
    await writeFile(join(OUT, `${t.sigla}.json`), JSON.stringify(dados, null, 1));
    console.log(`${t.sigla}: ${out.map((x) => `${x.nome} [${x.terreno.tipo}${x.terreno.agua ? '/' + x.terreno.agua.tipo + x.terreno.agua.lado : ''}, ${x.bioma}, ${Math.round(x.elevacao)} m, ${x.distCostaKm} km]`).join('; ')}`);
  }
  console.log('ok → public/data/municipios/');
}

main().catch((e) => { console.error(e); process.exit(1); });
