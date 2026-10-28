/**
 * Auditoria do relevo e das ruas do Rio (Fase 19): mede o que aparece como "espeto", estrada flutuando ou
 * enterrada, pista torta e disco de rotatória em avenida reta, com os mesmos números antes e depois de cada correção.
 *
 *   npm run auditar-mapa            → imprime o relatório
 *   npm run auditar-mapa -- --json  → também grava data/cache/auditoria-mapa.json
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CidadeReal } from '../src/data/cidadeReal.ts';
import { ArquivoTracos } from '../src/data/schemas.ts';
import { construirPerfis } from '../src/render/city/perfilVias.ts';
import { grafoReal, terrenoReal } from '../src/world/cidadeReal.ts';
import { HM_RES, HM_STEP, HM_VERTS, MAP_SIZE } from '../src/world/constants.ts';
import { calcadaVia, larguraVia, nodeDegree } from '../src/world/roads.ts';
import { sampleHeight } from '../src/world/terrain.ts';

const ROOT = join(import.meta.dirname, '..');
const c = CidadeReal.parse(JSON.parse(readFileSync(join(ROOT, 'public/data/cidades/3304557.json'), 'utf8')));
const tracos = ArquivoTracos.parse(JSON.parse(readFileSync(join(ROOT, 'data/ufs/traits.json'), 'utf8')));
const rj = tracos.ufs.find((u) => u.sigla === 'RJ')!;

let t0 = performance.now();
const hm = terrenoReal(c, rj.terreno, 'mata-atlantica', 1);
const msTerreno = performance.now() - t0;
const g = grafoReal(c, () => '');
t0 = performance.now();
const perfis = construirPerfis(g, hm);
const msPerfis = performance.now() - t0;

// ── terreno ──────────────────────────────────────────────────────────────────────
const h = hm.h;
let espetos = 0, maxEspeto = 0, inclinMax = 0, ingremes = 0, terraTotal = 0;
const piores: { x: number; z: number; d: number }[] = [];
for (let j = 1; j < HM_RES; j++) for (let i = 1; i < HM_RES; i++) {
  const k = j * HM_VERTS + i;
  if (h[k] < 1) continue;
  terraTotal++;
  const viz: number[] = [];
  for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) if (di || dj) viz.push(h[k + dj * HM_VERTS + di]);
  viz.sort((a, b) => a - b);
  const med = (viz[3] + viz[4]) / 2;
  const d = h[k] - med;
  if (Math.abs(d) > 8) { espetos++; if (piores.length < 2000) piores.push({ x: -MAP_SIZE / 2 + i * HM_STEP, z: -MAP_SIZE / 2 + j * HM_STEP, d }); }
  maxEspeto = Math.max(maxEspeto, Math.abs(d));
  const gx = (h[k + 1] - h[k - 1]) / (2 * HM_STEP), gz = (h[k + HM_VERTS] - h[k - HM_VERTS]) / (2 * HM_STEP);
  const s = Math.hypot(gx, gz);
  inclinMax = Math.max(inclinMax, s);
  if (s > 1.5) ingremes++;
}
piores.sort((a, b) => Math.abs(b.d) - Math.abs(a.d));

// ── ruas: cada seção transversal (eixo, bordas do asfalto e da calçada) contra o terreno ─────
let amostras = 0, flutua = 0, enterra = 0, torta = 0, cruzTotal = 0;
const arestasFlutua = new Set<number>(), arestasEnterra = new Set<number>(), arestasTortas = new Set<number>();
const exemplos: { tipo: string; x: number; z: number; v: number; nome: string }[] = [];
let maxFlutua = 0, maxEnterra = 0;
for (const p of perfis.values()) {
  if (p.edge.nivel) continue;
  const meia = larguraVia(p.edge) / 2 + calcadaVia(p.edge);
  for (let i = 0; i < p.n; i += 2) {
    amostras++;
    const nx = -p.tz[i], nz = p.tx[i];
    const eixo = p.y[i];
    const a = sampleHeight(hm, p.x[i] + nx * meia, p.z[i] + nz * meia), b = sampleHeight(hm, p.x[i] - nx * meia, p.z[i] - nz * meia);
    const centro = sampleHeight(hm, p.x[i], p.z[i]);
    const baixo = Math.min(a, b, centro), alto = Math.max(a, b, centro);
    const fl = eixo - baixo, en = alto - eixo;
    maxFlutua = Math.max(maxFlutua, fl); maxEnterra = Math.max(maxEnterra, en);
    if (fl > 2.5 && eixo > 3) { flutua++; arestasFlutua.add(p.edge.id); if (exemplos.length < 400) exemplos.push({ tipo: 'flutua', x: p.x[i], z: p.z[i], v: fl, nome: p.edge.name }); }
    if (en > 1.2) { enterra++; arestasEnterra.add(p.edge.id); if (exemplos.length < 400) exemplos.push({ tipo: 'enterra', x: p.x[i], z: p.z[i], v: en, nome: p.edge.name }); }
    // pista torta: inclinação transversal acima de 18% (10°) entre as duas bordas
    const cruzada = Math.abs(a - b) / (2 * meia);
    if (cruzada > 0.18) { torta++; arestasTortas.add(p.edge.id); }
  }
}
// declividade longitudinal
let longMax = 0, longAcima15 = 0, trechos = 0;
for (const p of perfis.values()) {
  if (p.edge.nivel) continue;
  for (let i = 1; i < p.n; i++) {
    const d = Math.abs(p.y[i] - p.y[i - 1]) / Math.max(0.5, p.s[i] - p.s[i - 1]);
    longMax = Math.max(longMax, d);
    trechos++;
    if (d > 0.15) longAcima15++;
  }
}
// discos de cruzamento (o que parece rotatória no meio da avenida)
for (const n of g.nodes.values()) if (nodeDegree(g, n.id) >= 3) cruzTotal++;
const real = (c.vias as { rotatorias?: number[] }).rotatorias;

const r = {
  msTerreno: Math.round(msTerreno), msPerfis: Math.round(msPerfis),
  terreno: { verticesTerra: terraTotal, espetos, maxDesvioDaMediana: +maxEspeto.toFixed(1), inclinMax: +inclinMax.toFixed(2), acima150: ingremes },
  ruas: {
    secoes: amostras, flutuando: flutua, enterradas: enterra, tortas: torta,
    arestasFlutuando: arestasFlutua.size, arestasEnterradas: arestasEnterra.size, arestasTortas: arestasTortas.size,
    maxFlutuaM: +maxFlutua.toFixed(1), maxEnterraM: +maxEnterra.toFixed(1),
    longMaxPct: +(longMax * 100).toFixed(1), trechosAcima15: longAcima15, trechos,
  },
  cruzamentosComDisco: cruzTotal, rotatoriasValidadas: real ? real.length / 3 : null,
};
console.log(JSON.stringify(r, null, 2));
console.log('piores espetos:', piores.slice(0, 5).map((p) => `(${Math.round(p.x)}, ${Math.round(p.z)}) ${p.d.toFixed(1)} m`).join(' · '));
if (process.argv.includes('--json')) writeFileSync(join(ROOT, 'data/cache/auditoria-mapa.json'), JSON.stringify({ ...r, piores: piores.slice(0, 200), exemplos }, null, 1));
