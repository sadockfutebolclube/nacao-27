/**
 * Detector de defeitos visuais das vias (Fase 33): roda sobre a malha que o jogo de fato gera (relevo escavado, perfis das ruas,
 * geometria de `construir()` das vias) e pontua, por categoria, o que aparece na tela como lasca, cunha, rua que entra sob o morro,
 * via que acaba de repente, casa enfiada na encosta ou poste fora do chão.
 *
 *   node node_modules/tsx/dist/cli.mjs tools/detectar-defeitos-vias.ts --rotulo=antes
 *   npm run detectar-defeitos -- --rotulo=depois
 *
 * Saídas: docs/auditoria-vias/<rotulo>.json (contagens, 30 piores locais com x, z e bairro) e public/data/debug/defeitos-vias.json
 * (os pontos que a camada "defeitos" do F3 desenha no mapa). Categorias e limites estão em `LIMITES` abaixo.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CAMPOS_PREDIO, CidadeReal, predio } from '../src/data/cidadeReal.ts';
import { ArquivoTracos } from '../src/data/schemas.ts';
import { construir, perfisAtuais } from '../src/render/city/Vias.tsx';
import { mundo } from '../src/sim/bridge.ts';
import { grafoReal, lotesFixos, terrenoReal } from '../src/world/cidadeReal.ts';
import * as lotsMod from '../src/world/lots.ts';
const { computeLots } = lotsMod;
const estatLotes = (lotsMod as unknown as { estatLotes?: { descartadosPorDesnivel: number; comMuroDeArrimo: number; comBaseMaciça: number; removidosPorDesnivel?: number } }).estatLotes ?? { descartadosPorDesnivel: 0, comMuroDeArrimo: 0, comBaseMaciça: 0 };
import { RASTER_RES } from '../src/world/constants.ts';
import { Classe } from '../src/world/regrade.ts';
import { calcadaVia, larguraVia, nodeDegree } from '../src/world/roads.ts';
import { sampleHeight } from '../src/world/terrain.ts';

export const LIMITES = {
  /** triângulo de talude/muro: área mínima (m²) e razão de aspecto máxima (maior aresta ÷ altura do triângulo) */
  areaMin: 0.5, aspectoMax: 15,
  /** vértice de talude/muro sem vizinho a menos de tantos metros */
  vizinhoMax: 8,
  /** terreno renderizado ao lado da calçada: acima da calçada (cobre) ou abaixo dela (queda) */
  morroAoLado: 0.8, quedaLateral: 2.5,
  /** ponta de via a quanto de outro nó (m) conta como "quase conectada" */
  pontaDe: 2, pontaAte: 10,
  /** salto de cota entre trechos que chegam no mesmo nó (m) */
  saltoNo: 1.5,
  /** prédio: inclinação do terreno sob a planta (graus) e desnível sob ela (m) */
  predioGraus: 8, predioDesnivel: 3,
  /** poste ou palmeira em relação à superfície final (m) */
  propDesvio: 0.3,
} as const;

const arg = (n: string, d: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=')[1] ?? d;
const ROTULO = arg('rotulo', 'antes');
const ROOT = process.cwd();

type Cat = 'lascas' | 'normaisInvertidas' | 'verticesIsolados' | 'taludesSobrepostos' | 'morroAoLado' | 'quedaLateral' | 'pontasQuaseConectadas' | 'saltosNoNo' | 'cruzamentosSemNo' | 'prediosInclinados' | 'prediosEnfiados' | 'propsForaDaSuperficie';
const PESO: Record<Cat, number> = { lascas: 1, normaisInvertidas: 1, verticesIsolados: 2, taludesSobrepostos: 4, morroAoLado: 3, quedaLateral: 2, pontasQuaseConectadas: 8, saltosNoNo: 10, cruzamentosSemNo: 6, prediosInclinados: 1, prediosEnfiados: 1, propsForaDaSuperficie: 2 };
interface Achado { c: Cat; x: number; z: number; v: number }
const achados: Achado[] = [];
const total: Record<Cat, number> = { lascas: 0, normaisInvertidas: 0, verticesIsolados: 0, taludesSobrepostos: 0, morroAoLado: 0, quedaLateral: 0, pontasQuaseConectadas: 0, saltosNoNo: 0, cruzamentosSemNo: 0, prediosInclinados: 0, prediosEnfiados: 0, propsForaDaSuperficie: 0 };
const achar = (c: Cat, x: number, z: number, v: number) => { total[c]++; if (achados.length < 400_000) achados.push({ c, x, z, v }); };

const t00 = performance.now();
const c = CidadeReal.parse(JSON.parse(readFileSync(join(ROOT, 'public/data/cidades/3304557.json'), 'utf8')));
const rj = ArquivoTracos.parse(JSON.parse(readFileSync(join(ROOT, 'data/ufs/traits.json'), 'utf8'))).ufs.find((u) => u.sigla === 'RJ')!;
let t0 = performance.now();
const hm = terrenoReal(c, rj.terreno, 'mata-atlantica', 1);
const msTerreno = performance.now() - t0;
const g = grafoReal(c, () => '');
mundo.roads = g; mundo.real = c; mundo.hm = hm;
t0 = performance.now();
const malha = construir(hm);
const msMalha = performance.now() - t0;
const perfis = perfisAtuais;

// ── 1. triângulos de talude e de muro: lascas, normais invertidas, vértices isolados ─────────────────────────────────
let trianguloTalude = 0;
const vizinhos = new Map<string, number[]>();
const porGeo: Record<string, Record<string, number>> = { banquetas: { lascas: 0, normais: 0 }, muros: { lascas: 0, normais: 0 } };
for (const b of malha) for (const [nomeGeo, geo] of [['banquetas', b.banquetas], ['muros', b.muros]] as const) {
  const P = geo.getAttribute('position'), N = geo.getAttribute('normal'), idx = geo.index!;
  const CEL = LIMITES.vizinhoMax;
  vizinhos.clear();
  for (let i = 0; i < P.count; i++) { const k = `${Math.floor(P.getX(i) / CEL)},${Math.floor(P.getZ(i) / CEL)}`; (vizinhos.get(k) ?? vizinhos.set(k, []).get(k)!).push(i); }
  for (let t = 0; t + 2 < idx.count; t += 3) {
    const a = idx.getX(t), bb = idx.getX(t + 1), cc = idx.getX(t + 2);
    const ax = P.getX(a), ay = P.getY(a), az = P.getZ(a), bx = P.getX(bb), by = P.getY(bb), bz = P.getZ(bb), cx = P.getX(cc), cy = P.getY(cc), cz = P.getZ(cc);
    const ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cy - ay, vz = cz - az;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const dobro = Math.hypot(nx, ny, nz), area = dobro / 2;
    if (dobro < 1e-9) continue; // triângulo degenerado de propósito (segmentos que sobram no pé): não é lasca visível
    trianguloTalude++;
    const maior = Math.max(Math.hypot(ux, uy, uz), Math.hypot(vx, vy, vz), Math.hypot(cx - bx, cy - by, cz - bz));
    const altura = dobro / maior;
    const mx = (ax + bx + cx) / 3, mz = (az + bz + cz) / 3;
    if (area < LIMITES.areaMin || maior / Math.max(1e-6, altura) > LIMITES.aspectoMax) { achar('lascas', mx, mz, area); porGeo[nomeGeo].lascas++; if (process.env.DETALHE && porGeo[nomeGeo].lascas % 9 === 1) console.log(`[lasca ${nomeGeo}] (${Math.round(mx)},${Math.round(mz)}) area ${area.toFixed(2)} maior aresta ${maior.toFixed(2)} altura ${altura.toFixed(3)} v0=(${ax.toFixed(1)},${ay.toFixed(1)},${az.toFixed(1)}) v1=(${bx.toFixed(1)},${by.toFixed(1)},${bz.toFixed(1)}) v2=(${cx.toFixed(1)},${cy.toFixed(1)},${cz.toFixed(1)})`); }
    const dot = nx * (N.getX(a) + N.getX(bb) + N.getX(cc)) + ny * (N.getY(a) + N.getY(bb) + N.getY(cc)) + nz * (N.getZ(a) + N.getZ(bb) + N.getZ(cc));
    if (dot < 0) { achar('normaisInvertidas', mx, mz, area); porGeo[nomeGeo].normais++; }
  }
  // vértice sem outro a menos de 8 m (geometria avulsa)
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), z = P.getZ(i), y = P.getY(i), ci = Math.floor(x / LIMITES.vizinhoMax), cj = Math.floor(z / LIMITES.vizinhoMax);
    let ok = false;
    for (let di = -1; di <= 1 && !ok; di++) for (let dj = -1; dj <= 1 && !ok; dj++) for (const k of vizinhos.get(`${ci + di},${cj + dj}`) ?? []) {
      if (k === i) continue;
      if (Math.hypot(P.getX(k) - x, P.getY(k) - y, P.getZ(k) - z) < LIMITES.vizinhoMax) { ok = true; break; }
    }
    if (!ok) achar('verticesIsolados', x, z, 0);
  }
}

console.log('[geometria] lascas e normais invertidas por buffer:', JSON.stringify(porGeo));
// 1b. superfícies sobrepostas: amostra cada triângulo de talude/muro (≥ 1 ponto por m²) numa grade de 0,75 m; uma célula com amostras de
// DOIS triângulos não vizinhos a mais de 0,8 m de altura uma da outra é uma faixa passando por cima/baixo de outra
{
  const CELS = 0.75, grade = new Map<string, { ys: number[]; tri: number[] }>();
  let id = 0;
  for (const b of malha) {
    const geo = b.banquetas, P = geo.getAttribute('position'), idx = geo.index!;
    for (let t = 0; t + 2 < idx.count; t += 3, id++) {
      const a = idx.getX(t), bb = idx.getX(t + 1), cc = idx.getX(t + 2);
      const ax = P.getX(a), ay = P.getY(a), az = P.getZ(a), bx = P.getX(bb), by = P.getY(bb), bz = P.getZ(bb), cx = P.getX(cc), cy = P.getY(cc), cz = P.getZ(cc);
      const area = Math.hypot((by - ay) * (cz - az) - (bz - az) * (cy - ay), (bz - az) * (cx - ax) - (bx - ax) * (cz - az), (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)) / 2;
      if (area < 0.3) continue;
      const n = Math.min(60, Math.max(1, Math.ceil(Math.sqrt(area) * 1.4)));
      for (let i = 0; i <= n; i++) for (let j = 0; j <= n - i; j++) {
        const u = (i + 0.33) / (n + 0.66), v = (j + 0.33) / (n + 0.66), w = 1 - u - v;
        if (w < 0) continue;
        const x = ax * w + bx * u + cx * v, y = ay * w + by * u + cy * v, z = az * w + bz * u + cz * v;
        const k = `${Math.floor(x / CELS)},${Math.floor(z / CELS)}`;
        const e = grade.get(k) ?? grade.set(k, { ys: [], tri: [] }).get(k)!;
        e.ys.push(y); e.tri.push(id);
      }
    }
  }
  for (const [k, e] of grade) {
    if (e.ys.length < 2) continue;
    // maior folga vertical entre amostras de triângulos diferentes
    let folga = 0;
    for (let i = 0; i < e.ys.length; i++) for (let j = i + 1; j < e.ys.length; j++) if (e.tri[i] !== e.tri[j] && Math.abs(e.tri[i] - e.tri[j]) > 3) folga = Math.max(folga, Math.abs(e.ys[i] - e.ys[j]));
    if (folga > 0.8) { const [ci, cj] = k.split(',').map(Number); achar('taludesSobrepostos', (ci + 0.5) * CELS, (cj + 0.5) * CELS, folga); }
  }
}

// ── 2. cota da rua contra o terreno renderizado ao lado dela ─────────────────────────────────────────────────────────
let secoes = 0;
for (const p of perfis.values()) {
  if (p.nivel) continue;
  const hw = larguraVia(p.edge) / 2, sw = calcadaVia(p.edge);
  for (let i = Math.ceil(p.cortaA / 3) + 1; i < p.n - Math.ceil(p.cortaB / 3) - 1; i += 2) {
    const k = p.classe?.[i];
    if (k === Classe.Muro || k === Classe.Ponte || k === Classe.Tunel) continue;
    secoes++;
    const nx = -p.tz[i], nz = p.tx[i];
    for (const lado of [-1, 1]) {
      const xx = p.x[i] + nx * lado * (hw + sw + 1.2), zz = p.z[i] + nz * lado * (hw + sw + 1.2);
      const e = sampleHeight(hm, xx, zz) - (p.y[i] + 0.17);
      if (e > LIMITES.morroAoLado) achar('morroAoLado', xx, zz, e);
      else if (-e > LIMITES.quedaLateral) achar('quedaLateral', xx, zz, -e);
    }
  }
}

// ── 3. nós: pontas quase conectadas e saltos de cota ─────────────────────────────────────────────────────────────────
const noPos = [...g.nodes.values()];
const celNo = new Map<string, number[]>();
noPos.forEach((n, i) => { const k = `${Math.floor(n.x / 16)},${Math.floor(n.z / 16)}`; (celNo.get(k) ?? celNo.set(k, []).get(k)!).push(i); });
let pontasDeGrau1 = 0;
const emNo = new Map<number, { y: number; edge: number }[]>();
for (const p of perfis.values()) {
  for (const [id, i] of [[p.edge.a, 0], [p.edge.b, p.n - 1]] as const) (emNo.get(id) ?? emNo.set(id, []).get(id)!).push({ y: p.y[i], edge: p.edge.id });
}
for (const n of noPos) {
  if (nodeDegree(g, n.id) === 1) {
    pontasDeGrau1++;
    const ci = Math.floor(n.x / 16), cj = Math.floor(n.z / 16);
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) for (const k of celNo.get(`${ci + di},${cj + dj}`) ?? []) {
      const o = noPos[k];
      if (o.id === n.id) continue;
      const d = Math.hypot(o.x - n.x, o.z - n.z);
      if (d >= LIMITES.pontaDe && d <= LIMITES.pontaAte && o.id > n.id) achar('pontasQuaseConectadas', n.x, n.z, d);
    }
  }
  const l = emNo.get(n.id);
  if (l && l.length >= 2) {
    const ys = l.map((e) => e.y), salto = Math.max(...ys) - Math.min(...ys);
    if (salto > LIMITES.saltoNo) achar('saltosNoNo', n.x, n.z, salto);
  }
}

// 3b. vias que se cruzam SEM nó em cotas diferentes (camadas): as duas disputam o mesmo terreno se nenhuma for ponte/túnel. Só conta o par
// em que as DUAS são chão (nivel 0, sem classe de ponte/túnel na amostra) e a diferença de cota passa de LIMITES.saltoNo.
{
  const celSeg = new Map<string, { e: number; a: number; b: number; x0: number; z0: number; x1: number; z1: number; y0: number; y1: number }[]>();
  const nosDe = new Map<number, number[]>();
  for (const p of perfis.values()) {
    if (p.nivel) continue;
    nosDe.set(p.edge.id, [p.edge.a, p.edge.b]);
    for (let i = 0; i + 1 < p.n; i++) {
      const k0 = p.classe?.[i], k1 = p.classe?.[i + 1];
      if (k0 === Classe.Ponte || k0 === Classe.Tunel || k1 === Classe.Ponte || k1 === Classe.Tunel) continue;
      const sg = { e: p.edge.id, a: p.edge.a, b: p.edge.b, x0: p.x[i], z0: p.z[i], x1: p.x[i + 1], z1: p.z[i + 1], y0: p.y[i], y1: p.y[i + 1] };
      const k = `${Math.floor(p.x[i] / 6)},${Math.floor(p.z[i] / 6)}`;
      (celSeg.get(k) ?? celSeg.set(k, []).get(k)!).push(sg);
    }
  }
  const vistos = new Set<string>();
  for (const [k, lista] of celSeg) {
    const [ci, cj] = k.split(',').map(Number);
    for (const sg of lista) for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) for (const o of celSeg.get(`${ci + di},${cj + dj}`) ?? []) {
      if (o.e <= sg.e || o.a === sg.a || o.a === sg.b || o.b === sg.a || o.b === sg.b) continue;
      // segmentos que se cruzam em planta (ou passam a menos de 1,5 m): ponto mais próximo entre os dois
      const rx = sg.x1 - sg.x0, rz = sg.z1 - sg.z0, qx = o.x1 - o.x0, qz = o.z1 - o.z0, den = rx * qz - rz * qx;
      if (Math.abs(den) < 1e-6) continue;
      const t = ((o.x0 - sg.x0) * qz - (o.z0 - sg.z0) * qx) / den, u = ((o.x0 - sg.x0) * rz - (o.z0 - sg.z0) * rx) / den;
      if (t < 0 || t > 1 || u < 0 || u > 1) continue;
      const salto = Math.abs(sg.y0 + (sg.y1 - sg.y0) * t - (o.y0 + (o.y1 - o.y0) * u));
      if (salto <= LIMITES.saltoNo) continue;
      const chave = `${sg.e}-${o.e}`;
      if (vistos.has(chave)) continue;
      vistos.add(chave);
      achar('cruzamentosSemNo', sg.x0 + rx * t, sg.z0 + rz * t, salto);
    }
  }
  void nosDe;
}

// ── 4. prédios: a planta nunca é inclinada; o defeito é o prédio ENFIADO no morro (lado de cima enterrado) ───────────────────────────
// Regra da Fase 33 (lots.ts): base na cota mais alta; com mais de DESNIVEL_MAX de desnível, base 3 m acima do ponto mais baixo (muro de arrimo) e o
// que sobra do lado de cima fica dentro do morro. Medimos sobre TODOS os prédios reais do OSM (152 mil), com o terreno já escavado.
const nPred = c.predios.length / CAMPOS_PREDIO;
const REMOVER = (lotsMod as unknown as { DESNIVEL_REMOVER?: number }).DESNIVEL_REMOVER ?? Infinity; // Fase 34: prédio real acima disso é removido
const REGRA_NOVA = typeof (lotsMod as unknown as { DESNIVEL_MAX?: number }).DESNIVEL_MAX === 'number';
let removidosPorDesnivel = 0, desnivelBruto3 = 0, comMuro = 0, comBase = 0, terrenoGraus8 = 0;
for (let i = 0; i < nPred; i++) {
  const p = predio(c, i);
  const cs = Math.cos(p.angle), sn = Math.sin(p.angle);
  const h = (u: number, v: number) => { const lx = u * p.w, lz = v * p.d; return sampleHeight(hm, p.x + cs * lx + sn * lz, p.z - sn * lx + cs * lz); };
  const hs = [h(-0.5, -0.5), h(0.5, -0.5), h(-0.5, 0.5), h(0.5, 0.5), h(0, 0)];
  const mn = Math.min(...hs), mx = Math.max(...hs);
  if (Math.min(hs[0], hs[1], hs[2], hs[3]) < 0.3) continue; // no mar/praia: fora do critério
  const desn = mx - mn;
  if (desn > REMOVER) { removidosPorDesnivel++; continue; } // o gerador de lotes não o coloca no mapa (contado, não escondido)
  const sx = ((hs[1] + hs[3]) - (hs[0] + hs[2])) / 2 / Math.max(1, p.w), sz = ((hs[2] + hs[3]) - (hs[0] + hs[1])) / 2 / Math.max(1, p.d);
  if ((Math.atan(Math.hypot(sx, sz)) * 180) / Math.PI > LIMITES.predioGraus) terrenoGraus8++;
  if (desn > LIMITES.predioDesnivel) desnivelBruto3++;
  const base = Math.min(mx, mn + LIMITES.predioDesnivel);
  if (desn > LIMITES.predioDesnivel) comMuro++; else if (desn > 0.4) comBase++;
  // regra antiga (antes da Fase 33): base na cota mais baixa, então o desnível inteiro entra no morro
  const enfiado = REGRA_NOVA ? mx - base : desn; // lado de cima dentro do morro
  if (enfiado > LIMITES.predioDesnivel) achar('prediosEnfiados', p.x, p.z, enfiado);
}
// prédios inclinados: o modelo só gira em torno de Y (planta nivelada); a contagem existe para o relatório provar que continua 0
total.prediosInclinados = 0;
// lotes gerados (as casas de enchimento ao longo das ruas) e os fixos do OSM, pelo mesmo gerador que a simulação usa
const raster = new Int32Array(RASTER_RES * RASTER_RES);
const lotes = computeLots(g, hm, [], raster, [], lotesFixos(c, new Set<number>(), (id) => g.edges.has(id)));
const lotesGerados = lotes.filter((l) => l.real === undefined).length;

// ── 5. postes e palmeiras contra a superfície final ──────────────────────────────────────────────────────────────────
// A superfície sob o prop é a da via mais perto, interpolada ao longo do segmento (em ladeira de 40% duas amostras de 3 m diferem 1,2 m: comparar com a
// amostra mais próxima daria falso defeito), ou o terreno se ele estiver mais alto.
interface Seg { x0: number; z0: number; x1: number; z1: number; y0: number; y1: number; r: number }
const segCel = new Map<string, Seg[]>();
for (const p of perfis.values()) {
  if (p.nivel === -1) continue;
  const r = larguraVia(p.edge) / 2 + calcadaVia(p.edge);
  for (let i = 0; i + 1 < p.n; i++) {
    const sg: Seg = { x0: p.x[i], z0: p.z[i], x1: p.x[i + 1], z1: p.z[i + 1], y0: p.y[i] + 0.17, y1: p.y[i + 1] + 0.17, r };
    const k = `${Math.floor(p.x[i] / 8)},${Math.floor(p.z[i] / 8)}`;
    (segCel.get(k) ?? segCel.set(k, []).get(k)!).push(sg);
  }
}
let props = 0;
for (const b of malha) for (const lista of [b.postes, b.palmeiras]) for (const m of lista) {
  props++;
  const x = m.elements[12], y = m.elements[13], z = m.elements[14];
  let sup = sampleHeight(hm, x, z);
  const ci = Math.floor(x / 8), cj = Math.floor(z / 8);
  let dm = 1e9, deck = -1e9, apoiado = false;
  for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) for (const sg of segCel.get(`${ci + di},${cj + dj}`) ?? []) {
    const dx = sg.x1 - sg.x0, dz = sg.z1 - sg.z0, l2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - sg.x0) * dx + (z - sg.z0) * dz) / l2));
    const d = Math.hypot(sg.x0 + dx * t - x, sg.z0 + dz * t - z);
    if (d > sg.r + 0.5) continue;
    const yd = sg.y0 + (sg.y1 - sg.y0) * t;
    // o poste pode estar na calçada de qualquer via que o alcance (curvas e cruzamentos juntam várias): basta uma casar com a altura dele
    if (Math.abs(yd - y) <= LIMITES.propDesvio) apoiado = true;
    if (d < dm) { dm = d; deck = yd; }
  }
  if (deck > sup) sup = deck;
  const d = apoiado && sampleHeight(hm, x, z) <= y + LIMITES.propDesvio ? 0 : y - sup;
  if (Math.abs(d) > LIMITES.propDesvio) { achar('propsForaDaSuperficie', x, z, d); if (process.env.DETALHE && total.propsForaDaSuperficie % 400 === 1) console.log(`[prop] (${Math.round(x)},${Math.round(z)}) y=${y.toFixed(1)} terreno=${sampleHeight(hm, x, z).toFixed(1)} via=${deck.toFixed(1)} dist=${dm.toFixed(1)} d=${d.toFixed(2)}`); }
}

// ── relatório ───────────────────────────────────────────────────────────────────────────────────────────────────────────
const bn = c.bairros ?? [], nomes = c.nomesBairros ?? [];
const bairroDe = (x: number, z: number) => { let m = Infinity, r = '?'; for (let i = 0; i + 3 < bn.length; i += 4) { if (bn[i + 2] !== 0) continue; const d = (bn[i] - x) ** 2 + (bn[i + 1] - z) ** 2; if (d < m) { m = d; r = nomes[bn[i + 3]] ?? '?'; } } return r; };
const CEL = 40;
const celulas = new Map<string, { x: number; z: number; pontos: number; score: number; por: Partial<Record<Cat, number>> }>();
for (const a of achados) {
  const k = `${Math.floor(a.x / CEL)},${Math.floor(a.z / CEL)}`;
  const e = celulas.get(k) ?? celulas.set(k, { x: 0, z: 0, pontos: 0, score: 0, por: {} }).get(k)!;
  e.x += a.x; e.z += a.z; e.pontos++; e.score += PESO[a.c]; e.por[a.c] = (e.por[a.c] ?? 0) + 1;
}
const piores = [...celulas.values()].sort((u, v) => v.score - u.score).slice(0, 30).map((e, i) => ({ posto: i + 1, x: Math.round(e.x / e.pontos), z: Math.round(e.z / e.pontos), bairro: bairroDe(e.x / e.pontos, e.z / e.pontos), pontuacao: e.score, defeitos: e.por }));
const relatorio = {
  rotulo: ROTULO, data: new Date().toISOString(),
  tempos_ms: { terreno: Math.round(msTerreno), malhaDasVias: Math.round(msMalha), total: Math.round(performance.now() - t00) },
  predios_regra: REGRA_NOVA ? 'nova (Fase 33): base na cota mais alta, até 3 m sobre o ponto mais baixo' : 'antiga: base na cota mais baixa',
  predios_regra_nova: { desnivelBruto_maior3m: desnivelBruto3, comMuroDeArrimo: comMuro, comBaseMaciça: comBase, terrenoMaior8Graus: terrenoGraus8, lotesTotal: lotes.length, lotesGerados, lotesGeradosDescartadosPorDesnivel: estatLotes.descartadosPorDesnivel, lotesFixosComMuro: estatLotes.comMuroDeArrimo, lotesComBaseMaciça: estatLotes.comBaseMaciça, prediosReaisRemovidosPorDesnivel: estatLotes.removidosPorDesnivel ?? 0, desnivelParaRemover_m: Number.isFinite(REMOVER) ? REMOVER : null },
  universo: { trechos: perfis.size, secoesDeRuaVerificadas: secoes, triangulosDeTaludeEMuro: trianguloTalude, predios: nPred, props, nos: noPos.length, pontasDeGrau1 },
  limites: LIMITES,
  contagem: total,
  piores_30: piores,
};
const dirDoc = join(ROOT, 'docs/auditoria-vias'); mkdirSync(dirDoc, { recursive: true });
writeFileSync(join(dirDoc, `${ROTULO}.json`), JSON.stringify(relatorio, null, 1));
// camada do F3: no máximo 600 pontos por categoria, os maiores primeiro
const camada: Record<string, { x: number; z: number; v: number }[]> = {};
for (const cat of Object.keys(total) as Cat[]) camada[cat] = achados.filter((a) => a.c === cat).sort((u, v) => v.v - u.v).slice(0, 600).map((a) => ({ x: Math.round(a.x), z: Math.round(a.z), v: Math.round(a.v * 10) / 10 }));
mkdirSync(join(ROOT, 'public/data/debug'), { recursive: true });
writeFileSync(join(ROOT, 'public/data/debug/defeitos-vias.json'), JSON.stringify({ rotulo: ROTULO, contagem: total, piores: piores.slice(0, 30), pontos: camada }));
console.log(JSON.stringify({ contagem: total, tempos_ms: relatorio.tempos_ms, universo: relatorio.universo }, null, 1));
{ const pr = achados.filter((a) => a.c === 'propsForaDaSuperficie'); const acima = pr.filter((a) => a.v > 0).length; console.log(`props fora da superfície: ${acima} acima do chão (flutuando) · ${pr.length - acima} abaixo (enterrados) · mediana |desvio| ${[...pr].map((a) => Math.abs(a.v)).sort((u, v) => u - v)[Math.floor(pr.length / 2)]?.toFixed(2)} m`); }
console.log('piores:', piores.slice(0, 8).map((p) => `#${p.posto} ${p.bairro} (${p.x}, ${p.z}) ${p.pontuacao}`).join(' | '));
