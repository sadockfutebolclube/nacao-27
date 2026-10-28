/**
 * NAÇÃO 27 — linhas de ônibus reais do Rio (Fase 17).
 *
 *   npm run fetch-gtfs
 *
 * Fonte: GTFS oficial da Secretaria Municipal de Transportes (SMTR) da Prefeitura do Rio — linhas de ônibus
 * (SPPO), executivos e BRT (MOBI-Rio) —, publicado no portal Data.Rio e espelhado pela Mobility Database
 * (https://mobilitydatabase.org/feeds/gtfs/mdb-1791). Baixa o zip para data/cache/gtfs/ e gera
 * public/data/rio/onibus.json:
 *  - por linha: nome, destino, cor, tipo (0 ônibus · 1 BRT · 2 executivo), viagens por hora num dia útil e os
 *    itinerários (o mais usado de cada sentido) em metros no sistema do jogo, simplificados a 5 m e cortados
 *    na área do mapa;
 *  - as paradas dentro do mapa.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'data', 'cache', 'gtfs');
const URL_GTFS = 'https://files.mobilitydatabase.org/mdb-1791/latest.zip';
const SERVICO_UTIL = 'U_REG';
/** o mapa do jogo vai de −8.192 a +8.192 m; só a parte dentro dele interessa */
const LIM = 8100;
const r1 = (v: number) => Math.round(v * 10) / 10;

type Linha = Record<string, string>;

/** CSV simples com aspas (o GTFS tem vírgulas dentro de nomes). */
function csv(texto: string): Linha[] {
  const linhas = texto.replace(/^﻿/, '').split(/\r?\n/);
  const campos = (l: string) => {
    const out: string[] = [];
    let atual = '', aspas = false;
    for (let i = 0; i < l.length; i++) {
      const c = l[i];
      if (aspas) { if (c === '"') { if (l[i + 1] === '"') { atual += '"'; i++; } else aspas = false; } else atual += c; }
      else if (c === '"') aspas = true;
      else if (c === ',') { out.push(atual); atual = ''; } else atual += c;
    }
    out.push(atual);
    return out;
  };
  const cab = campos(linhas[0]);
  const out: Linha[] = [];
  for (let i = 1; i < linhas.length; i++) {
    if (!linhas[i]) continue;
    const v = campos(linhas[i]);
    const o: Linha = {};
    cab.forEach((c, k) => { o[c] = v[k] ?? ''; });
    out.push(o);
  }
  return out;
}

const ler = (arq: string) => csv(readFileSync(join(CACHE, 'x', arq), 'utf8'));
const segundos = (hms: string) => { const [h, m, s] = hms.split(':').map(Number); return h * 3600 + m * 60 + (s || 0); };

function simplificar(pts: [number, number][], tol: number): [number, number][] {
  if (pts.length < 3) return pts;
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

async function main() {
  await mkdir(CACHE, { recursive: true });
  const zip = join(CACHE, 'gtfs.zip');
  if (!existsSync(zip)) {
    console.log('baixando o GTFS da SMTR…');
    const r = await fetch(URL_GTFS);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    await writeFile(zip, Buffer.from(await r.arrayBuffer()));
  }
  if (!existsSync(join(CACHE, 'x', 'routes.txt'))) execFileSync('unzip', ['-o', '-q', zip, '-d', join(CACHE, 'x')]);

  // projeção do jogo: a mesma do arquivo da cidade (centro do mapa do Rio)
  const cidade = JSON.parse(readFileSync(join(ROOT, 'public', 'data', 'cidades', '3304557.json'), 'utf8')) as { lat: number; lon: number };
  const kx = 111_320 * Math.cos((cidade.lat * Math.PI) / 180), kz = 110_574;
  const proj = (lat: number, lon: number): [number, number] => [(lon - cidade.lon) * kx, -(lat - cidade.lat) * kz];

  const rotas = ler('routes.txt');
  const viagens = ler('trips.txt');
  const freq = ler('frequencies.txt');
  const pontosShape = new Map<string, [number, number, number][]>();
  for (const p of ler('shapes.txt')) {
    const a = pontosShape.get(p.shape_id) ?? pontosShape.set(p.shape_id, []).get(p.shape_id)!;
    a.push([Number(p.shape_pt_sequence), Number(p.shape_pt_lat), Number(p.shape_pt_lon)]);
  }

  // viagens de dia útil por rota → viagens por hora (frequências) e o itinerário mais usado de cada sentido
  const tripInfo = new Map(viagens.map((t) => [t.trip_id, t]));
  const porHora = new Map<string, number[]>();
  for (const f of freq) {
    const t = tripInfo.get(f.trip_id);
    if (!t || t.service_id !== SERVICO_UTIL) continue;
    const h = porHora.get(t.route_id) ?? porHora.set(t.route_id, new Array(24).fill(0)).get(t.route_id)!;
    const ini = segundos(f.start_time), fim = segundos(f.end_time), passo = Number(f.headway_secs) || 3600;
    for (let s = ini; s < fim; s += passo) h[Math.floor(s / 3600) % 24] += 1;
  }
  const usoShape = new Map<string, Map<string, number>>(); // rota|sentido → shape → viagens
  for (const t of viagens) {
    if (t.service_id !== SERVICO_UTIL || !t.shape_id) continue;
    const k = `${t.route_id}|${t.direction_id}`;
    const m = usoShape.get(k) ?? usoShape.set(k, new Map()).get(k)!;
    m.set(t.shape_id, (m.get(t.shape_id) ?? 0) + 1);
  }

  const linhas: { id: string; nome: string; longo: string; cor: string; tipo: number; porHora: number[]; trechos: number[][] }[] = [];
  let pontosTotal = 0;
  for (const r of rotas) {
    const trechos: number[][] = [];
    for (const sentido of ['0', '1']) {
      const m = usoShape.get(`${r.route_id}|${sentido}`);
      if (!m) continue;
      const shapeId = [...m.entries()].sort((a, b) => b[1] - a[1])[0][0];
      const brutos = (pontosShape.get(shapeId) ?? []).sort((a, b) => a[0] - b[0]).map(([, la, lo]) => proj(la, lo));
      // só a parte dentro do mapa: a corrida contínua mais longa
      let melhor: [number, number][] = [], atual: [number, number][] = [];
      const fecha = () => { if (atual.length > melhor.length) melhor = atual; atual = []; };
      for (const p of brutos) { if (Math.abs(p[0]) < LIM && Math.abs(p[1]) < LIM) atual.push(p); else fecha(); }
      fecha();
      if (melhor.length < 2) continue;
      const s = simplificar(melhor, 5);
      if (s.length < 2) continue;
      trechos.push(s.flatMap(([x, z]) => [r1(x), r1(z)]));
      pontosTotal += s.length;
    }
    if (!trechos.length) continue;
    const tipoGtfs = Number(r.route_type);
    linhas.push({
      id: r.route_id, nome: r.route_short_name, longo: r.route_long_name,
      cor: `#${(r.route_color || '888888').toLowerCase()}`,
      tipo: tipoGtfs === 702 ? 1 : tipoGtfs === 200 ? 2 : 0,
      porHora: porHora.get(r.route_id) ?? new Array(24).fill(0), trechos,
    });
  }

  // paradas dentro do mapa
  const nomes: string[] = [], idxNome = new Map<string, number>();
  const paradas: number[] = [];
  for (const s of ler('stops.txt')) {
    if (s.location_type && s.location_type !== '0') continue;
    const [x, z] = proj(Number(s.stop_lat), Number(s.stop_lon));
    if (Math.abs(x) > LIM || Math.abs(z) > LIM) continue;
    const n = s.stop_name || '';
    const i = idxNome.get(n) ?? nomes.length;
    if (i === nomes.length) { nomes.push(n); idxNome.set(n, i); }
    paradas.push(r1(x), r1(z), i);
  }

  const feed = ler('feed_info.txt')[0] ?? {};
  const saida = {
    versao: 1,
    fonte: 'GTFS da Secretaria Municipal de Transportes (SMTR) — Prefeitura do Rio de Janeiro, via Data.Rio / Mobility Database',
    validade: `${feed.feed_start_date ?? ''}–${feed.feed_end_date ?? ''}`,
    linhas, nomesParadas: nomes, paradas,
  };
  const dir = join(ROOT, 'public', 'data', 'rio');
  await mkdir(dir, { recursive: true });
  const json = JSON.stringify(saida);
  await writeFile(join(dir, 'onibus.json'), json);
  const porTipo = [0, 1, 2].map((t) => linhas.filter((l) => l.tipo === t).length);
  console.log(`${linhas.length} linhas (${porTipo[0]} ônibus, ${porTipo[1]} BRT, ${porTipo[2]} executivo), ${pontosTotal} pontos de itinerário, ${paradas.length / 3} paradas no mapa · ${(json.length / 1e6).toFixed(2)} MB`);
}

main().catch((e) => { console.error(e); process.exit(1); });
