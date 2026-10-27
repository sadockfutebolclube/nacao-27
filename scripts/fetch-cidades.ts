/**
 * NAÇÃO 27 — cidades reais (Fase 11).
 *
 *   npm run fetch-cidades                 # as 27 capitais
 *   npm run fetch-cidades -- 2507507 …    # municípios pelo código IBGE
 *   npm run fetch-cidades -- --todos      # os 216 municípios jogáveis
 *
 * Para cada município, centrado na sede:
 *  - relevo: tiles Terrarium z14 (~9,5 m/px), grade de 16 m cobrindo o mapa inteiro (6.144 m);
 *  - OpenStreetMap via Overpass (© colaboradores do OSM, ODbL): ruas e prédios na área construível
 *    (3.072 m), água, vegetação e uso do solo no mapa inteiro;
 *  - ruas viram o grafo do jogo (nós nos cruzamentos, arestas curvas de até ~140 m, nomes reais);
 *  - prédios viram retângulos orientados (menor retângulo envolvente) de frente para a rua mais
 *    próxima, com andares do OSM (building:levels/height) ou estimados pelo tipo.
 *
 * Saída: public/data/cidades/{IBGE}.json · Cache: data/osm-cache/, data/cache/terrarium/
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CidadeReal, CAMPOS_PREDIO } from '../src/data/cidadeReal.ts';
import { Terrarium } from './lib/terrarium.ts';
import { extrairRegiao, REGIAO_UF, type AlvoCidade } from './lib/geofabrik.ts';
import { prediosMS } from './lib/msbuildings.ts';
import { existsSync } from 'node:fs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'data', 'cidades');
const CACHE_OSM = join(ROOT, 'data', 'osm-cache');
const MAP = 6144, HALF = MAP / 2, BUILD = 1536, PASSO = 16, RES = MAP / PASSO + 1, VERDE_RES = 192;
const ESPELHOS = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const r1 = (v: number) => Math.round(v * 10) / 10;

interface ElOSM { type: 'way' | 'relation' | 'node'; id: number; tags?: Record<string, string>; nodes?: number[]; geometry?: { lat: number; lon: number }[]; members?: { type: string; role: string; geometry?: { lat: number; lon: number }[] }[] }
type P = [number, number];

// ── Overpass ───────────────────────────────────────────────────────────────────

async function overpass(nome: string, q: string): Promise<ElOSM[]> {
  const arq = join(CACHE_OSM, `${nome}.json`);
  try { return JSON.parse(await readFile(arq, 'utf8')) as ElOSM[]; } catch { /* baixa */ }
  for (let t = 0; t < 12; t++) {
    const url = ESPELHOS[t % ESPELHOS.length];
    try {
      const r = await fetch(url, { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'nacao27-fetch-cidades (jogo educativo)' }, signal: AbortSignal.timeout(300_000) });
      if (r.status === 429 || r.status >= 500) { console.log(`    ${url.split('/')[2]}: HTTP ${r.status}, tentando de novo…`); await sleep(15_000 * (1 + (t >> 1))); continue; }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = (await r.json()) as { elements: ElOSM[]; remark?: string };
      if (j.remark?.includes('runtime error')) throw new Error(j.remark);
      await mkdir(CACHE_OSM, { recursive: true });
      await writeFile(arq, JSON.stringify(j.elements));
      return j.elements;
    } catch (e) {
      console.log(`    ${url.split('/')[2]}: ${String(e).slice(0, 90)}`);
      await sleep(10_000);
    }
  }
  throw new Error(`Overpass indisponível para ${nome}`);
}

// ── geometria ──────────────────────────────────────────────────────────────────

function projetor(lat0: number, lon0: number) {
  const kx = 111_320 * Math.cos(lat0 * Math.PI / 180), kz = 110_574;
  return {
    xz: (lat: number, lon: number): P => [(lon - lon0) * kx, -(lat - lat0) * kz],
    latlon: (x: number, z: number): P => [lat0 - z / kz, lon0 + x / kx],
  };
}

function areaPoli(p: P[]) { let a = 0; for (let i = 0; i < p.length; i++) { const [x1, z1] = p[i], [x2, z2] = p[(i + 1) % p.length]; a += x1 * z2 - x2 * z1; } return Math.abs(a) / 2; }

function dentro(p: P[], x: number, z: number) {
  let c = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [xi, zi] = p[i], [xj, zj] = p[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}

function casco(pts: P[]): P[] {
  const s = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o: P, a: P, b: P) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo: P[] = [], hi: P[] = [];
  for (const p of s) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (let i = s.length - 1; i >= 0; i--) { const p = s[i]; while (hi.length >= 2 && cr(hi[hi.length - 2], hi[hi.length - 1], p) <= 0) hi.pop(); hi.push(p); }
  return lo.slice(0, -1).concat(hi.slice(0, -1));
}

/** Menor retângulo envolvente (rotating calipers simplificado sobre as arestas do casco). */
function obb(pts: P[]): { x: number; z: number; ang: number; w: number; d: number } {
  const h = casco(pts);
  let melhor = { area: Infinity, x: 0, z: 0, ang: 0, w: 0, d: 0 };
  for (let i = 0; i < h.length; i++) {
    const [ax, az] = h[i], [bx, bz] = h[(i + 1) % h.length];
    const th = Math.atan2(bz - az, bx - ax), c = Math.cos(th), s = Math.sin(th);
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const [x, z] of h) { const u = x * c + z * s, v = -x * s + z * c; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
    const area = (u1 - u0) * (v1 - v0);
    if (area < melhor.area) {
      const um = (u0 + u1) / 2, vm = (v0 + v1) / 2;
      melhor = { area, x: um * c - vm * s, z: um * s + vm * c, ang: th, w: u1 - u0, d: v1 - v0 };
    }
  }
  return melhor;
}

// ── ruas → grafo do jogo ───────────────────────────────────────────────────────

const AVENIDAS = /^(motorway|trunk|primary|secondary)(_link)?$/;

function montarVias(ways: ElOSM[], xz: (lat: number, lon: number) => P) {
  const lim = BUILD - 10;
  const uso = new Map<number, number>();
  for (const w of ways) w.nodes!.forEach((n, i) => uso.set(n, (uso.get(n) ?? 0) + (i === 0 || i === w.nodes!.length - 1 ? 2 : 1)));
  const nos: P[] = [];
  const porOsm = new Map<number, number>();
  const novoNo = (p: P, osm?: number) => {
    if (osm !== undefined && porOsm.has(osm)) return porOsm.get(osm)!;
    nos.push(p);
    const id = nos.length;
    if (osm !== undefined) porOsm.set(osm, id);
    return id;
  };
  const nomes: string[] = [];
  const idxNome = new Map<string, number>();
  const arestas: { a: number; b: number; c: P; tipo: number; nome: number }[] = [];

  for (const w of ways) {
    const tipo = AVENIDAS.test(w.tags!.highway) ? 1 : 0;
    const nome = w.tags!.name ?? w.tags!.ref ?? '';
    let ni = -1;
    if (nome) { ni = idxNome.get(nome) ?? nomes.length; if (ni === nomes.length) { nomes.push(nome); idxNome.set(nome, ni); } }
    const pts = w.geometry!.map((g) => xz(g.lat, g.lon));
    const ids = w.nodes!;
    // corridas contínuas dentro da área construível
    let run: { p: P; osm?: number }[] = [];
    const fechar = () => {
      if (run.length >= 2) cortarEmArestas(run);
      run = [];
    };
    const cortarEmArestas = (r: { p: P; osm?: number }[]) => {
      let ini = 0;
      for (let i = 1; i < r.length; i++) {
        const cruz = r[i].osm !== undefined && (uso.get(r[i].osm!) ?? 0) >= 2;
        // comprimento e curvatura acumulados desde o início do trecho
        let len = 0, giro = 0;
        for (let k = ini + 1; k <= i; k++) {
          len += Math.hypot(r[k].p[0] - r[k - 1].p[0], r[k].p[1] - r[k - 1].p[1]);
          if (k > ini + 1) {
            const a1 = Math.atan2(r[k - 1].p[1] - r[k - 2].p[1], r[k - 1].p[0] - r[k - 2].p[0]), a2 = Math.atan2(r[k].p[1] - r[k - 1].p[1], r[k].p[0] - r[k - 1].p[0]);
            giro += Math.abs(Math.atan2(Math.sin(a2 - a1), Math.cos(a2 - a1)));
          }
        }
        if (i === r.length - 1 || cruz || len > 140 || giro > 0.6) {
          const a = novoNo(r[ini].p, r[ini].osm), b = novoNo(r[i].p, r[i].osm);
          if (a !== b) {
            // ponto de controle: a curva passa pelo meio do trecho
            const meio = r[Math.floor((ini + i) / 2)].p;
            const pa = nos[a - 1], pb = nos[b - 1];
            const c: P = i - ini >= 2 ? [2 * meio[0] - (pa[0] + pb[0]) / 2, 2 * meio[1] - (pa[1] + pb[1]) / 2] : [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2];
            arestas.push({ a, b, c, tipo, nome: ni });
          }
          ini = i;
        }
      }
    };
    pts.forEach((p, i) => {
      const fora = Math.abs(p[0]) > lim || Math.abs(p[1]) > lim;
      if (fora) { fechar(); return; }
      run.push({ p, osm: ids[i] });
    });
    fechar();
  }

  // funde nós a menos de 6 m e descarta arestas degeneradas ou repetidas
  const raiz = nos.map((_, i) => i + 1);
  const ach = (i: number): number => (raiz[i - 1] === i ? i : (raiz[i - 1] = ach(raiz[i - 1])));
  const grade = new Map<string, number[]>();
  nos.forEach((p, i) => { const k = `${Math.floor(p[0] / 6)},${Math.floor(p[1] / 6)}`; (grade.get(k) ?? grade.set(k, []).get(k)!).push(i + 1); });
  nos.forEach((p, i) => {
    const cx = Math.floor(p[0] / 6), cz = Math.floor(p[1] / 6);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) for (const j of grade.get(`${cx + dx},${cz + dz}`) ?? []) {
      if (j <= i + 1) continue;
      const q = nos[j - 1];
      if (Math.hypot(p[0] - q[0], p[1] - q[1]) < 6) raiz[ach(j) - 1] = ach(i + 1);
    }
  });
  const usados = new Map<number, number>();
  const nosF: number[] = [];
  const idF = (i: number) => { const r = ach(i); if (!usados.has(r)) { usados.set(r, usados.size + 1); nosF.push(r1(nos[r - 1][0]), r1(nos[r - 1][1])); } return usados.get(r)!; };
  const vistos = new Set<string>();
  const arestasF: number[] = [];
  let km = 0;
  for (const e of arestas) {
    const a = ach(e.a), b = ach(e.b);
    if (a === b) continue;
    const k = a < b ? `${a}-${b}` : `${b}-${a}`;
    if (vistos.has(k)) continue;
    vistos.add(k);
    const ia = idF(a), ib = idF(b);
    km += Math.hypot(nos[a - 1][0] - nos[b - 1][0], nos[a - 1][1] - nos[b - 1][1]) / 1000;
    arestasF.push(ia, ib, r1(e.c[0]), r1(e.c[1]), e.tipo, e.nome);
  }
  return { nos: nosF, arestas: arestasF, nomes, km };
}

// ── prédios ────────────────────────────────────────────────────────────────────

const PULAR = /^(roof|carport|garage|garages|shed|construction|ruins|hut|kiosk|container|tent|greenhouse|no|collapsed|transformer_tower|service)$/;
function tipoPredio(b: string, amenity?: string, shop?: string): number {
  if (/^(church|cathedral|chapel|mosque|temple|synagogue|religious)$/.test(b) || amenity === 'place_of_worship') return 4;
  if (/^(industrial|warehouse|factory|manufacture|hangar|storage_tank|silo)$/.test(b)) return 2;
  if (/^(commercial|retail|office|supermarket|hotel|kiosk|mall|shop)$/.test(b) || shop) return 1;
  if (/^(school|hospital|university|college|public|government|civic|fire_station|police|train_station|transportation|stadium|sports_hall|kindergarten)$/.test(b) || /^(school|hospital|clinic|university|college|townhall|police|fire_station|courthouse|library)$/.test(amenity ?? '')) return 3;
  return 0;
}
function andaresPadrao(b: string, tipo: number, area: number): number {
  if (/^(apartments|residential|dormitory)$/.test(b)) return area > 500 ? 8 : area > 200 ? 4 : 2;
  if (b === 'office') return area > 600 ? 10 : 4;
  if (b === 'hotel') return 8;
  if (tipo === 2) return 1;
  if (tipo === 3) return area > 2000 ? 3 : 2;
  if (tipo === 4) return 2;
  if (tipo === 1) return area > 1500 ? 2 : area > 300 ? 2 : 1;
  return area < 110 ? 1 : area < 260 ? 2 : area < 800 ? 3 : 5;
}

// ── principal ──────────────────────────────────────────────────────────────────

interface Mun { ibge: string; nome: string; lat: number; lon: number; capital: boolean; uf: string }

async function gerar(m: Mun, terr: Terrarium) {
  const { xz, latlon } = projetor(m.lat, m.lon);
  const [la0, lo0] = latlon(-BUILD, BUILD), [la1, lo1] = latlon(BUILD, -BUILD);
  const bbB = `${la0.toFixed(5)},${lo0.toFixed(5)},${la1.toFixed(5)},${lo1.toFixed(5)}`;
  const [ma0, mo0] = latlon(-HALF, HALF), [ma1, mo1] = latlon(HALF, -HALF);
  const bbM = `${ma0.toFixed(5)},${mo0.toFixed(5)},${ma1.toFixed(5)},${mo1.toFixed(5)}`;
  const vias = await overpass(`${m.ibge}-vias-predios`, `[out:json][timeout:240];(way["building"](${bbB});way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link)$"](${bbB});way["landuse"~"^(residential|commercial|retail|industrial)$"](${bbB}););out geom;`);
  await sleep(4000);
  const natureza = await overpass(`${m.ibge}-natureza`, `[out:json][timeout:240];(way["natural"~"^(water|wood|scrub)$"](${bbM});relation["natural"="water"](${bbM});way["waterway"~"^(river|canal|riverbank)$"](${bbM});way["landuse"~"^(forest|reservoir|basin|grass|meadow)$"](${bbM});way["leisure"~"^(park|nature_reserve|garden)$"](${bbM}););out geom;`);

  // ── relevo
  const alt = new Float32Array(RES * RES);
  for (let j = 0; j < RES; j++) for (let i = 0; i < RES; i++) {
    const [la, lo] = latlon(-HALF + i * PASSO, -HALF + j * PASSO);
    alt[j * RES + i] = await terr.altitude(la, lo);
  }
  const mar = alt.filter((v) => v <= 0.5).length / alt.length;
  const litoral = mar > 0.02;
  const terra = [...alt].filter((v) => v > 0.5).sort((a, b) => a - b);
  const base = litoral ? 0 : Math.max(0, (terra[Math.floor(terra.length * 0.01)] ?? 0) - 4);

  // água do OSM: polígonos e rios (faixas) rebaixados
  const agua = new Uint8Array(RES * RES);
  const rasterPoli = (p: P[], f: (k: number) => void, passo: number, res: number) => {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const [x, z] of p) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    const i0 = Math.max(0, Math.floor((x0 + HALF) / passo)), i1 = Math.min(res - 1, Math.ceil((x1 + HALF) / passo));
    const j0 = Math.max(0, Math.floor((z0 + HALF) / passo)), j1 = Math.min(res - 1, Math.ceil((z1 + HALF) / passo));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (dentro(p, -HALF + i * passo, -HALF + j * passo)) f(j * res + i);
  };
  const aneis = (e: ElOSM): P[][] => e.type === 'way' ? (e.geometry && e.geometry.length > 3 ? [e.geometry.map((g) => xz(g.lat, g.lon))] : []) : (e.members ?? []).filter((mm) => mm.role === 'outer' && mm.geometry && mm.geometry.length > 3).map((mm) => mm.geometry!.map((g) => xz(g.lat, g.lon)));
  for (const e of natureza) {
    const t = e.tags ?? {};
    const ehAguaArea = t.natural === 'water' || t.waterway === 'riverbank' || t.landuse === 'reservoir' || t.landuse === 'basin';
    if (ehAguaArea) for (const anel of aneis(e)) rasterPoli(anel, (k) => { agua[k] = 1; }, PASSO, RES);
    if ((t.waterway === 'river' || t.waterway === 'canal') && e.geometry) {
      const larg = t.waterway === 'river' ? 26 : 12;
      const pts = e.geometry.map((g) => xz(g.lat, g.lon));
      for (let k = 1; k < pts.length; k++) {
        const [ax, az] = pts[k - 1], [bx, bz] = pts[k];
        const n = Math.ceil(Math.hypot(bx - ax, bz - az) / (PASSO / 2));
        for (let s = 0; s <= n; s++) {
          const x = ax + ((bx - ax) * s) / n, z = az + ((bz - az) * s) / n;
          const r = Math.ceil(larg / 2 / PASSO);
          const ci = Math.round((x + HALF) / PASSO), cj = Math.round((z + HALF) / PASSO);
          for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
            const i = ci + di, j = cj + dj;
            if (i >= 0 && j >= 0 && i < RES && j < RES && Math.hypot(di, dj) * PASSO <= larg / 2 + PASSO / 2) agua[j * RES + i] = 1;
          }
        }
      }
    }
  }
  const alturas = new Int16Array(RES * RES);
  for (let k = 0; k < alt.length; k++) {
    let h = alt[k] - base;
    if (litoral && alt[k] <= 0.5) h = Math.min(h, -3);
    else if (!litoral) h = Math.max(h, 2);
    if (agua[k]) h = Math.min(h, -2.5);
    alturas[k] = Math.round(Math.max(-30, Math.min(3200, h)) * 10);
  }

  // ── vegetação (32 m)
  const verde = new Uint8Array(VERDE_RES * VERDE_RES);
  for (const e of natureza) {
    const t = e.tags ?? {};
    const v = t.natural === 'wood' || t.landuse === 'forest' || t.leisure === 'nature_reserve' ? 255 : t.natural === 'scrub' ? 170 : t.leisure === 'park' || t.leisure === 'garden' ? 140 : t.landuse === 'grass' || t.landuse === 'meadow' ? 50 : 0;
    if (!v) continue;
    for (const anel of aneis(e)) rasterPoli(anel, (k) => { verde[k] = Math.max(verde[k], v); }, MAP / VERDE_RES, VERDE_RES);
  }

  // ── uso do solo (para prédios sem tipo)
  const usos: { p: P[]; tipo: number }[] = [];
  for (const e of vias) if (e.tags?.landuse && e.geometry && e.geometry.length > 3) usos.push({ p: e.geometry.map((g) => xz(g.lat, g.lon)), tipo: e.tags.landuse === 'industrial' ? 2 : e.tags.landuse === 'residential' ? 0 : 1 });

  // ── ruas
  const ways = vias.filter((e) => e.type === 'way' && e.tags?.highway && e.geometry && e.nodes && e.geometry.length >= 2);
  const g = montarVias(ways, xz);
  // amostras das arestas para achar a rua mais próxima de cada prédio
  const amostras = new Map<string, { x: number; z: number; e: number }[]>();
  const nA = g.arestas.length / 6;
  for (let k = 0; k < nA; k++) {
    const a = g.arestas[k * 6] - 1, b = g.arestas[k * 6 + 1] - 1, cx = g.arestas[k * 6 + 2], cz = g.arestas[k * 6 + 3];
    const ax = g.nos[a * 2], az = g.nos[a * 2 + 1], bx = g.nos[b * 2], bz = g.nos[b * 2 + 1];
    const n = Math.max(2, Math.ceil(Math.hypot(bx - ax, bz - az) / 5));
    for (let s = 0; s <= n; s++) {
      const t = s / n, u = 1 - t;
      const x = u * u * ax + 2 * u * t * cx + t * t * bx, z = u * u * az + 2 * u * t * cz + t * t * bz;
      const key = `${Math.floor(x / 40)},${Math.floor(z / 40)}`;
      (amostras.get(key) ?? amostras.set(key, []).get(key)!).push({ x, z, e: k + 1 });
    }
  }
  const ruaProxima = (x: number, z: number) => {
    let melhor = { d: Infinity, x: 0, z: 0, e: 0 };
    for (let raio = 1; raio <= 4 && melhor.e === 0; raio++) {
      const cx = Math.floor(x / 40), cz = Math.floor(z / 40);
      for (let dx = -raio; dx <= raio; dx++) for (let dz = -raio; dz <= raio; dz++) for (const s of amostras.get(`${cx + dx},${cz + dz}`) ?? []) {
        const d = Math.hypot(s.x - x, s.z - z);
        if (d < melhor.d) melhor = { d, ...s };
      }
    }
    return melhor;
  };

  // ── prédios
  const predios: number[] = [];
  const nomesPredios: string[] = [];
  let comAndares = 0;
  const alturaEm = (x: number, z: number) => {
    const i = Math.round((x + HALF) / PASSO), j = Math.round((z + HALF) / PASSO);
    return alturas[Math.max(0, Math.min(RES - 1, j)) * RES + Math.max(0, Math.min(RES - 1, i))] / 10;
  };
  // retângulo orientado de frente para a rua mais próxima
  const ocupado = new Map<string, P[][]>();
  const celula = (x: number, z: number) => `${Math.floor(x / 25)},${Math.floor(z / 25)}`;
  let deMS = 0;
  let origemMS = false;
  const adicionar = (pts: P[], tipo: number, andares: number, nome: string | null, origemOSM: boolean) => {
    origemMS = !origemOSM;
    const area = areaPoli(pts);
    if (area < 18 || area > 60_000) return;
    const r = obb(pts);
    if (Math.abs(r.x) > BUILD - 12 || Math.abs(r.z) > BUILD - 12 || alturaEm(r.x, r.z) < 0.5) return;
    if (!origemOSM) {
      // não duplica prédio que o OSM já tem: centro dentro de algum contorno do OSM por perto
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) for (const p of ocupado.get(`${Math.floor(r.x / 25) + dx},${Math.floor(r.z / 25) + dz}`) ?? []) if (dentro(p, r.x, r.z)) return;
      for (const u of usos) if (dentro(u.p, r.x, r.z)) { tipo = u.tipo; break; }
      // satélite sem altura: casa ou sobrado (área grande é quadra geminada, não prédio alto)
      if (andares <= 0) andares = tipo === 2 ? 1 : area < 110 ? 1 : 1 + (hashN(r.x, r.z) % 2);
    } else {
      const k = celula(r.x, r.z);
      (ocupado.get(k) ?? ocupado.set(k, []).get(k)!).push(pts);
    }
    andares = Math.max(1, Math.min(70, Math.round(andares)));
    // quadra de casas geminadas vista do satélite (um polígono só): divide em lotes de 8–12 m de frente,
    // em uma ou duas fileiras costas com costas, cada casa virada para a sua rua
    if ((tipo === 0 || (tipo === 1 && !origemOSM)) && andares <= 3 && area > 380 && (!origemOSM || !nome)) {
      const longo = r.w >= r.d, L = longo ? r.w : r.d, C = longo ? r.d : r.w;
      const nL = Math.max(1, Math.round(L / (8 + (hashN(r.x, r.z) % 5)))), nC = C > 70 ? 3 : C > 30 ? 2 : 1;
      const th = longo ? r.ang : r.ang + Math.PI / 2;
      const cu = Math.cos(th), su = Math.sin(th);
      for (let a = 0; a < nL; a++) for (let b = 0; b < nC; b++) {
        const u = -L / 2 + (a + 0.5) * (L / nL), v = -C / 2 + (b + 0.5) * (C / nC);
        const cx = r.x + u * cu - v * su, cz = r.z + u * su + v * cu;
        const and = Math.max(1, Math.min(3, andares + ((hashN(cx, cz) % 3) - 1)));
        emitir({ x: cx, z: cz, ang: th, w: (L / nL) * 0.96, d: (C / nC) * 0.96 }, tipo, and, null);
      }
      return;
    }
    emitir(r, tipo, andares, nome);
  };
  const hashN = (x: number, z: number) => Math.abs(Math.round(x * 73.1 + z * 19.7)) % 997;
  /** Grava um retângulo (centro, eixo θ, w ao longo de θ, d perpendicular) virado para a rua mais próxima. */
  const emitir = (r: { x: number; z: number; ang: number; w: number; d: number }, tipo: number, andares: number, nome: string | null) => {
    const rua = ruaProxima(r.x, r.z);
    let ang = -r.ang, w = r.w, d = r.d;
    if (rua.e) {
      const dx = rua.x - r.x, dz = rua.z - r.z;
      let melhor = -Infinity;
      for (let k = 0; k < 4; k++) {
        // ângulo do jogo cujo +Z local coincide com o eixo v do retângulo: a = −θ (+ k·90°); +Z local = (sin a, cos a)
        const a = -r.ang + (k * Math.PI) / 2;
        const dot = Math.sin(a) * dx + Math.cos(a) * dz;
        if (dot > melhor) { melhor = dot; ang = a; w = k % 2 ? r.d : r.w; d = k % 2 ? r.w : r.d; }
      }
    }
    ang = Math.atan2(Math.sin(ang), Math.cos(ang));
    let ni = -1;
    if (nome) { ni = nomesPredios.length; nomesPredios.push(nome); }
    if (origemMS) deMS++;
    predios.push(r1(r.x), r1(r.z), Math.round(ang * 1000), r1(Math.max(3, w)), r1(Math.max(3, d)), andares, tipo, rua.e, ni);
  };

  // 1) OpenStreetMap: tipo, nome e andares quando mapeados
  for (const e of vias) {
    const t = e.tags;
    if (e.type !== 'way' || !t?.building || PULAR.test(t.building) || !e.geometry || e.geometry.length < 4) continue;
    const pts = e.geometry.slice(0, -1).map((gg) => xz(gg.lat, gg.lon));
    let tipo = tipoPredio(t.building, t.amenity, t.shop);
    const r0 = obb(pts);
    if (t.building === 'yes' && tipo === 0) for (const u of usos) if (dentro(u.p, r0.x, r0.z)) { tipo = u.tipo; break; }
    let andares = 0;
    if (t['building:levels']) andares = parseFloat(t['building:levels']);
    else if (t.height) andares = parseFloat(t.height) / 3.1;
    if (andares > 0 && Number.isFinite(andares)) comAndares++;
    else andares = andaresPadrao(t.building, tipo, areaPoli(pts));
    adicionar(pts, tipo, andares, t.name ?? null, true);
  }
  // 2) Microsoft (satélite): completa onde o OSM não mapeou prédios
  if (!process.argv.includes('--so-osm')) {
    const [la0, lo0] = latlon(-BUILD, BUILD), [la1, lo1] = latlon(BUILD, -BUILD);
    for (const p of await prediosMS([la0, lo0, la1, lo1], join(ROOT, 'data', 'osm-cache'))) {
      adicionar(p.anel.slice(0, -1).map(([la, lo]) => xz(la, lo)), 0, p.altura > 0 ? p.altura / 3.1 : 0, null, false);
    }
  }

  const toB64 = (u: Uint8Array) => Buffer.from(u.buffer, u.byteOffset, u.byteLength).toString('base64');
  const dados = CidadeReal.parse({
    versao: 1, ibge: m.ibge, nome: m.nome, uf: m.uf, lat: m.lat, lon: m.lon, geradoEm: new Date().toISOString(), base: Math.round(base * 10) / 10, litoral,
    passo: PASSO, res: RES, alturas: toB64(new Uint8Array(alturas.buffer)), verde: toB64(verde),
    vias: { nos: g.nos, arestas: g.arestas, nomes: g.nomes }, predios, nomesPredios,
    estat: { predios: predios.length / CAMPOS_PREDIO, comAndares, vias: g.arestas.length / 6, km: Math.round(g.km * 10) / 10 },
  });
  await mkdir(OUT, { recursive: true });
  const json = JSON.stringify(dados);
  await writeFile(join(OUT, `${m.ibge}.json`), json);
  console.log(`  ${m.nome}/${m.uf}: ${dados.estat.predios} prédios (${dados.estat.predios - deMS} do OSM, ${deMS} da Microsoft; ${dados.estat.comAndares} com andares no OSM), ${dados.estat.vias} trechos de rua (${dados.estat.km} km), ${litoral ? 'litoral' : `base ${base.toFixed(0)} m`} · ${(json.length / 1e6).toFixed(1)} MB`);
}

async function main() {
  const args = process.argv.slice(2);
  const ufs = (await import('node:fs')).readdirSync(join(ROOT, 'public', 'data', 'municipios')).filter((f) => f.endsWith('.json'));
  const todos: Mun[] = [];
  for (const f of ufs) {
    const j = JSON.parse(await readFile(join(ROOT, 'public', 'data', 'municipios', f), 'utf8')) as { sigla: string; municipios: Omit<Mun, 'uf'>[] };
    for (const m of j.municipios) todos.push({ ...m, uf: j.sigla });
  }
  const ids = args.filter((a) => !a.startsWith('--'));
  const alvo = args.includes('--todos') ? todos : ids.length ? todos.filter((m) => ids.includes(m.ibge)) : todos.filter((m) => m.capital);
  const terr = new Terrarium(join(ROOT, 'data', 'cache', 'terrarium'), 14);
  // Overpass sobrecarregado? Se os extratos regionais da Geofabrik estiverem em data/osm-cache/{regiao}.osm.pbf,
  // extrai tudo localmente de uma vez (mesmo formato de cache do Overpass).
  const porRegiao = new Map<string, Mun[]>();
  for (const m of alvo) {
    if (existsSync(join(CACHE_OSM, `${m.ibge}-natureza.json`)) && existsSync(join(CACHE_OSM, `${m.ibge}-vias-predios.json`))) continue;
    const r = REGIAO_UF[m.uf];
    porRegiao.set(r, [...(porRegiao.get(r) ?? []), m]);
  }
  for (const [regiao, ms] of porRegiao) {
    const pbf = join(CACHE_OSM, `${regiao}.osm.pbf`);
    if (!existsSync(pbf)) { console.log(`(sem ${regiao}.osm.pbf: usa o Overpass para ${ms.length} cidade(s))`); continue; }
    console.log(`Extraindo ${ms.length} cidade(s) de ${regiao}.osm.pbf…`);
    const alvos: AlvoCidade[] = ms.map((m) => {
      const { latlon } = projetor(m.lat, m.lon);
      const caixa = (h: number): [number, number, number, number] => { const [s0, w0] = latlon(-h, h), [n0, e0] = latlon(h, -h); return [s0, w0, n0, e0]; };
      return { ibge: m.ibge, construivel: caixa(BUILD), mapa: caixa(HALF) };
    });
    await extrairRegiao(pbf, alvos, CACHE_OSM);
  }
  for (const m of alvo) {
    try { await readFile(join(OUT, `${m.ibge}.json`)); if (!args.includes('--refazer')) { console.log(`  ${m.nome}: já existe`); continue; } } catch { /* gera */ }
    console.log(`${m.nome}/${m.uf} (${m.ibge})…`);
    try { await gerar(m, terr); } catch (e) { console.log(`  FALHOU ${m.nome}: ${e}`); }
  }
  // índice das cidades disponíveis (o jogo só tenta carregar as que existem)
  const fsx = await import('node:fs');
  const lista = fsx.existsSync(OUT) ? fsx.readdirSync(OUT).filter((f) => /^\d+\.json$/.test(f)).map((f) => f.replace('.json', '')) : [];
  await writeFile(join(OUT, 'index.json'), JSON.stringify(lista));
  console.log(`índice: ${lista.length} cidades reais`);
}

main().catch((e) => { console.error(e); process.exit(1); });
