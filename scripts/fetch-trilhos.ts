/**
 * NAÇÃO 27 — metrô, trem, VLT, bonde e cremalheira do Rio (Fase 18).
 *
 *   npm run fetch-trilhos        (depois de `npm run fetch-cidades -- --refazer`, que extrai os trilhos do OSM)
 *
 * Lê data/osm-cache/3304557-trilhos.json (vias `railway=subway|light_rail|rail|tram|rack|funicular` e estações do
 * OpenStreetMap, © colaboradores do OSM, ODbL), agrupa as vias por linha, encadeia os trechos pelas pontas em
 * trajetos contínuos e grava public/data/rio/trilhos.json: por linha, tipo, nome, cor e trajetos em metros do jogo
 * com o nível de cada ponto (−1 túnel, 0 chão, 1 viaduto), mais as estações com o tipo definido pela linha mais perto.
 */
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const r1 = (v: number) => Math.round(v * 10) / 10;

type Tipo = 'metro' | 'trem' | 'vlt' | 'bonde' | 'cremalheira';
interface Via { id: number; tags: Record<string, string>; nodes: number[]; geometry: { lat: number; lon: number }[] }
interface EstacaoOSM { lat: number; lon: number; tags: Record<string, string> }

const COR: Record<Tipo, string> = { metro: '#f58220', trem: '#1d4e89', vlt: '#2e9e5b', bonde: '#c0392b', cremalheira: '#8e44ad' };

/** Tipo pela etiqueta da via; o bonde e o VLT (ambos `railway=tram`, quase sem nome) se separam depois pela parada mais perto. */
function tipoDaVia(t: Record<string, string>): Tipo | null {
  const texto = `${t.name ?? ''} ${t.operator ?? ''} ${t.network ?? ''} ${t.line ?? ''}`.toLowerCase();
  if (/corcovado/.test(texto)) return 'cremalheira';
  switch (t.railway) {
    case 'subway': return 'metro';
    case 'rack': case 'funicular': case 'monorail': return 'cremalheira';
    case 'tram': return /santa teresa|bonde/.test(texto) ? 'bonde' : 'vlt';
    case 'light_rail': return /vlt/.test(texto) ? 'vlt' : /metr/.test(texto) ? 'metro' : 'trem';
    // MRS é carga (sem passageiro); o resto da bitola larga na cidade é SuperVia
    case 'rail': return /\bmrs\b/.test(texto) ? null : /metr[oô]/.test(texto) ? 'metro' : /vlt/.test(texto) ? 'vlt' : 'trem';
    default: return null;
  }
}

/** Nome da linha dentro do tipo: o metrô separa as linhas 1, 2 e 4; o trem é uma rede só (as "Vias" A–N são trilhos). */
function nomeDaLinha(tipo: Tipo, t: Record<string, string>): string {
  if (tipo === 'metro') { const m = /linha (\d)/i.exec(t.name ?? '') ?? /linha (\d)/i.exec(t.ref ?? ''); return m ? `Linha ${m[1]}` : 'Metrô'; }
  if (tipo === 'trem') return 'SuperVia';
  if (tipo === 'vlt') return 'VLT Carioca';
  if (tipo === 'bonde') return 'Bonde de Santa Teresa';
  return t.name ?? 'Cremalheira e planos inclinados';
}
const COR_METRO: Record<string, string> = { 'Linha 1': '#f58220', 'Linha 2': '#00a651', 'Linha 4': '#fdb913' };

const nivelDaVia = (t: Record<string, string>) => (t.tunnel && t.tunnel !== 'no' ? -1 : t.bridge && t.bridge !== 'no' ? 1 : 0);

/** metade do mapa do Rio (16 384 m) menos uma margem */
const LIMITE_MAPA = 8150;

function simplificar(pts: [number, number, number][], tol: number): [number, number, number][] {
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
      // um ponto onde o nível muda não pode sumir (é onde o túnel começa)
      const muda = pts[i][2] !== pts[i - 1][2] || pts[i][2] !== pts[i + 1][2];
      const dd = muda ? Infinity : d;
      if (dd > dm) { dm = dd; k = i; }
    }
    if (dm > tol && k > 0) { keep[k] = 1; pilha.push([a, k], [k, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

async function main() {
  const arq = join(ROOT, 'data', 'osm-cache', '3304557-trilhos.json');
  if (!existsSync(arq)) throw new Error('rode antes: npm run fetch-cidades -- --refazer (extrai os trilhos do OSM)');
  const { vias, estacoes } = JSON.parse(readFileSync(arq, 'utf8')) as { vias: Via[]; estacoes: EstacaoOSM[] };
  const cidade = JSON.parse(readFileSync(join(ROOT, 'public', 'data', 'cidades', '3304557.json'), 'utf8')) as { lat: number; lon: number };
  const kx = 111_320 * Math.cos((cidade.lat * Math.PI) / 180), kz = 110_574;
  const proj = (lat: number, lon: number): [number, number] => [(lon - cidade.lon) * kx, -(lat - cidade.lat) * kz];

  // paradas rotuladas de bonde e de VLT: o bonde é a via de bonde cuja parada rotulada mais perto é a do bonde
  const paradasRot: { x: number; z: number; bonde: boolean }[] = [];
  for (const e of estacoes) {
    const rot = `${e.tags.network ?? ''} ${e.tags.operator ?? ''}`.toLowerCase();
    if (e.tags.railway !== 'tram_stop' || !/bonde|vlt/.test(rot)) continue;
    const [x, z] = proj(e.lat, e.lon);
    paradasRot.push({ x, z, bonde: /bonde/.test(rot) });
  }
  const tipoFinal = (v: Via): Tipo | null => {
    const t = tipoDaVia(v.tags);
    if (t !== 'vlt' || !paradasRot.length) return t;
    const [x, z] = proj(v.geometry[v.geometry.length >> 1].lat, v.geometry[v.geometry.length >> 1].lon);
    let melhor = Infinity, bonde = false;
    for (const p of paradasRot) { const d = Math.hypot(p.x - x, p.z - z); if (d < melhor) { melhor = d; bonde = p.bonde; } }
    return bonde ? 'bonde' : 'vlt';
  };

  // agrupa por linha: tipo + nome da linha
  const grupos = new Map<string, { tipo: Tipo; nome: string; cor: string; vias: Via[] }>();
  for (const v of vias) {
    const tipo = tipoFinal(v);
    if (!tipo || v.nodes.length < 2) continue;
    const nome = nomeDaLinha(tipo, v.tags);
    const chave = `${tipo}|${nome}`;
    const g = grupos.get(chave) ?? grupos.set(chave, { tipo, nome, cor: tipo === 'metro' ? COR_METRO[nome] ?? COR.metro : COR[tipo], vias: [] }).get(chave)!;
    g.vias.push(v);
  }

  const linhas: { id: string; tipo: Tipo; nome: string; cor: string; trajetos: number[][] }[] = [];
  let pontosTotal = 0;
  for (const [chave, g] of grupos) {
    // encadeia: junta vias que compartilham o nó da ponta (em qualquer sentido)
    const restantes = g.vias.map((v) => ({ nodes: [...v.nodes], pts: v.geometry.map((p, i) => [...proj(p.lat, p.lon), nivelDaVia(v.tags)] as [number, number, number]).slice(0, v.nodes.length) }));
    const cadeias: { nodes: number[]; pts: [number, number, number][] }[] = [];
    while (restantes.length) {
      let atual = restantes.pop()!;
      let cresceu = true;
      while (cresceu) {
        cresceu = false;
        for (let i = 0; i < restantes.length; i++) {
          const o = restantes[i];
          const fimA = atual.nodes[atual.nodes.length - 1], iniA = atual.nodes[0];
          if (o.nodes[0] === fimA) { atual = { nodes: [...atual.nodes, ...o.nodes.slice(1)], pts: [...atual.pts, ...o.pts.slice(1)] }; }
          else if (o.nodes[o.nodes.length - 1] === fimA) { const r = [...o.nodes].reverse(), rp = [...o.pts].reverse(); atual = { nodes: [...atual.nodes, ...r.slice(1)], pts: [...atual.pts, ...rp.slice(1)] }; }
          else if (o.nodes[o.nodes.length - 1] === iniA) { atual = { nodes: [...o.nodes, ...atual.nodes.slice(1)], pts: [...o.pts, ...atual.pts.slice(1)] }; }
          else if (o.nodes[0] === iniA) { const r = [...o.nodes].reverse(), rp = [...o.pts].reverse(); atual = { nodes: [...r, ...atual.nodes.slice(1)], pts: [...rp, ...atual.pts.slice(1)] }; }
          else continue;
          restantes.splice(i, 1);
          cresceu = true;
          break;
        }
      }
      cadeias.push(atual);
    }
    // só trajetos com extensão útil dentro do mapa
    const trajetos: number[][] = [];
    for (const c0 of cadeias) {
      // o extrato do OSM é maior que o mapa: corta o trajeto onde ele sai do terreno
      const pedacos: [number, number, number][][] = [[]];
      for (const p of c0.pts) {
        if (Math.abs(p[0]) <= LIMITE_MAPA && Math.abs(p[1]) <= LIMITE_MAPA) pedacos[pedacos.length - 1].push(p);
        else if (pedacos[pedacos.length - 1].length) pedacos.push([]);
      }
      for (const pts of pedacos) {
        let comp = 0;
        for (let i = 1; i < pts.length; i++) comp += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
        if (comp < 150) continue;
        const s = simplificar(pts, 4);
        pontosTotal += s.length;
        trajetos.push(s.flatMap(([x, z, n]) => [r1(x), r1(z), n]));
      }
    }
    if (trajetos.length) linhas.push({ id: chave, tipo: g.tipo, nome: g.nome, cor: g.cor, trajetos });
  }

  // estações: tipo = o da linha mais perto (até 140 m); nomes repetidos a menos de 150 m viram uma só
  const pontosLinha: { x: number; z: number; tipo: Tipo }[] = [];
  for (const l of linhas) for (const t of l.trajetos) for (let i = 0; i < t.length; i += 3) pontosLinha.push({ x: t[i], z: t[i + 1], tipo: l.tipo });
  const saidaEst: { nome: string; tipo: Tipo; x: number; z: number }[] = [];
  for (const e of estacoes) {
    if (!e.tags.name) continue;
    const [x, z] = proj(e.lat, e.lon);
    let melhor: { d: number; tipo: Tipo } | null = null;
    for (const p of pontosLinha) { const d = Math.hypot(p.x - x, p.z - z); if (d < 140 && (!melhor || d < melhor.d)) melhor = { d, tipo: p.tipo }; }
    if (!melhor) continue;
    if (saidaEst.some((s) => s.nome === e.tags.name && s.tipo === melhor!.tipo && Math.hypot(s.x - x, s.z - z) < 150)) continue;
    saidaEst.push({ nome: e.tags.name, tipo: melhor.tipo, x: r1(x), z: r1(z) });
  }

  const saida = { versao: 1, fonte: 'OpenStreetMap — © colaboradores do OpenStreetMap (ODbL)', linhas, estacoes: saidaEst };
  const dir = join(ROOT, 'public', 'data', 'rio');
  await mkdir(dir, { recursive: true });
  const json = JSON.stringify(saida);
  await writeFile(join(dir, 'trilhos.json'), json);
  const porTipo = (['metro', 'trem', 'vlt', 'bonde', 'cremalheira'] as Tipo[]).map((t) => `${linhas.filter((l) => l.tipo === t).length} ${t}`).join(', ');
  console.log(`${vias.length} vias de trilho → ${linhas.length} linhas (${porTipo}), ${pontosTotal} pontos, ${saidaEst.length} estações · ${(json.length / 1e3).toFixed(0)} KB`);
  for (const l of linhas) console.log(`  ${l.tipo.padEnd(11)} ${l.nome.padEnd(34)} ${l.trajetos.length} trajeto(s)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
