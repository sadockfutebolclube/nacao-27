/** Fase 23: orçamento por passo, LOD da simulação, hash espacial, Dijkstra tipado, nó mais próximo em grade, relevo e cache da extração. */
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import traits from '../data/ufs/traits.json';
import { alvosDesatualizados, EXTRATOR_VERSAO, hashAlvo, type AlvoCidade } from '../scripts/lib/geofabrik';
import { bytesDe, CAMPOS_PREDIO, CidadeReal } from '../src/data/cidadeReal';
import { codificarCidade, decodificarCidade, listaTiles, tileDe } from '../src/data/cidadeBinaria';
import { ArquivoTracos } from '../src/data/schemas';
import { Zone } from '../src/sim/catalog';
import { HashLotes } from '../src/sim/hash';
import { Orcamento } from '../src/sim/orcamento';
import type { SimInit } from '../src/sim/protocol';
import { Simulation, TICKS_POR_DIA } from '../src/sim/simulation';
import { limitarInclinacao } from '../src/world/relevo';
import { arvoreVazia, compactar, dijkstraEm, noMaisProximo, type GrafoCompacto } from '../src/world/rotas';
import { generateTerrain, sampleHeight } from '../src/world/terrain';

const rj = ArquivoTracos.parse(traits).ufs.find((u) => u.sigla === 'RJ')!;
const efeitos = Object.assign({}, ...rj.tracos.map((t) => t.efeitos));
const init: SimInit = { sigla: 'RJ', nomeEstado: 'Rio de Janeiro', cidade: 'Rio de Janeiro', terreno: rj.terreno, bioma: 'mata-atlantica', latitude: rj.capital.lat, efeitos, esgotoUF: 66, festas: rj.festas, regiao: 'Sudeste', seed: 2027, modo: 'mandato' };
const hm = generateTerrain(2027, rj.terreno, 'mata-atlantica');

/** aleatório determinístico para os testes */
const aleatorio = (semente: number) => () => { semente = (semente * 1664525 + 1013904223) >>> 0; return semente / 4294967296; };

function origemSeca(): [number, number] {
  for (let r = 0; r < 1200; r += 40) for (let a = 0; a < Math.PI * 2; a += 0.4) {
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    let ok = true;
    for (let dx = -300; dx <= 300 && ok; dx += 30) for (let dz = -300; dz <= 300 && ok; dz += 30) { const h = sampleHeight(hm, x + dx, z + dz); if (h < 1.2 || h > 40) ok = false; }
    if (ok) return [x, z];
  }
  return [0, -600];
}

function cidadeDeTeste() {
  const sim = new Simulation(init, hm);
  const [ox, oz] = origemSeca();
  const L = 260;
  for (let k = -2; k <= 2; k++) {
    sim.command({ kind: 'road', req: { x0: ox - L, z0: oz + k * 70, cx: ox, cz: oz + k * 70, x1: ox + L, z1: oz + k * 70, type: k === 0 ? 'avenida' : 'rua' } });
    sim.command({ kind: 'road', req: { x0: ox + k * 110, z0: oz - 180, cx: ox + k * 110, cz: oz, x1: ox + k * 110, z1: oz + 180, type: 'rua' } });
  }
  sim.command({ kind: 'zone', x: ox - 120, z: oz, radius: 160, zone: Zone.ResBaixa });
  sim.command({ kind: 'zone', x: ox + 60, z: oz - 60, radius: 90, zone: Zone.ResAlta });
  sim.command({ kind: 'zone', x: ox + 60, z: oz + 90, radius: 80, zone: Zone.Comercial });
  sim.command({ kind: 'zone', x: ox + 220, z: oz + 60, radius: 90, zone: Zone.Industrial });
  for (const eq of ['reservatorio', 'subestacao', 'reservatorio', 'subestacao']) {
    let ok = false;
    for (let dx = -L; dx <= L && !ok; dx += 25) for (const dz of [-200, 200]) if (sim.command({ kind: 'service', eq, x: ox + dx, z: oz + dz }).ok) { ok = true; break; }
  }
  return { sim, ox, oz };
}

describe('Orçamento por passo', () => {
  /** gerador que gasta ~0,3 ms por fatia e cede a vez */
  function* trabalho(fatias: number, log: string[], nome: string): Generator<void, void, void> {
    for (let i = 0; i < fatias; i++) {
      const t = performance.now();
      while (performance.now() - t < 0.3);
      log.push(`${nome}${i}`);
      yield;
    }
  }

  it('rodar respeita o orçamento e o excedente fica na fila, em ordem', () => {
    const o = new Orcamento(), log: string[] = [];
    o.agendar('a', trabalho(40, log, 'a')); o.agendar('b', trabalho(5, log, 'b'));
    let passos = 0;
    while (o.pendentes) {
      const t = performance.now();
      const livre = o.rodar(3);
      const gasto = performance.now() - t;
      passos++;
      expect(gasto).toBeLessThan(3 + 3); // orçamento + uma fatia (folga p/ máquina ocupada)
      if (!livre) expect(o.pendentes).toBeGreaterThan(0);
    }
    expect(passos).toBeGreaterThan(3); // 45 fatias × 0,3 ms não cabem num passo de 3 ms
    expect(log.slice(0, 40).every((x) => x.startsWith('a'))).toBe(true); // a termina antes de b começar
    expect(log.length).toBe(45 + 0);
    expect(o.concluidos).toBe(2);
    expect(o.stats.get('a')!.fatias).toBeGreaterThanOrEqual(40);
  });

  it('com orçamento infinito termina tudo; cancelar descarta; o rótulo da fase entra nas estatísticas', () => {
    const o = new Orcamento(), log: string[] = [];
    let fase = 'x';
    o.rotulo = () => fase;
    o.agendar('a', trabalho(10, log, 'a'));
    expect(o.rodar(Infinity)).toBe(true);
    expect(log.length).toBe(10);
    expect(o.stats.has('a/x')).toBe(true);
    o.agendar('b', trabalho(10, log, 'b'));
    expect(o.emAndamento('b')).toBe(true);
    o.cancelar();
    expect(o.pendentes).toBe(0);
    o.agendar('c', trabalho(3, log, 'c'));
    o.drenar();
    expect(log.filter((x) => x.startsWith('c')).length).toBe(3);
  });
});

describe('Hash espacial dos lotes', () => {
  it('a consulta devolve todos os pontos do círculo (superconjunto do quadrado) e nada fora da caixa', () => {
    const r = aleatorio(5), n = 3000;
    const x = new Float64Array(n), z = new Float64Array(n);
    for (let i = 0; i < n; i++) { x[i] = (r() - 0.5) * 4000; z[i] = (r() - 0.5) * 4000; }
    const h = new HashLotes(x, z, n, 64);
    for (let q = 0; q < 60; q++) {
      const cx = (r() - 0.5) * 4400, cz = (r() - 0.5) * 4400, raio = 20 + r() * 300;
      const k = h.consulta(cx, cz, raio);
      const achados = new Set(Array.from(h.saida.subarray(0, k)));
      expect(achados.size).toBe(k); // sem repetição
      for (let i = 0; i < n; i++) if (Math.hypot(x[i] - cx, z[i] - cz) < raio) expect(achados.has(i), `ponto ${i}`).toBe(true);
      for (const i of achados) expect(Math.abs(x[i] - cx) <= raio + 64 && Math.abs(z[i] - cz) <= raio + 64).toBe(true);
    }
  });
});

describe('Dijkstra tipado e nó mais próximo', () => {
  /** grafo aleatório conexo em CSR (só os campos que dijkstraEm usa) */
  function grafoAleatorio(n: number, r: () => number) {
    const arestas: { a: number; b: number; c: number }[] = [];
    for (let i = 1; i < n; i++) arestas.push({ a: Math.floor(r() * i), b: i, c: 1 + r() * 20 });
    for (let k = 0; k < n * 2; k++) arestas.push({ a: Math.floor(r() * n), b: Math.floor(r() * n), c: 1 + r() * 20 });
    const adj: { viz: number; aresta: number }[][] = Array.from({ length: n }, () => []);
    const custo = new Float64Array(arestas.length * 2);
    arestas.forEach((e, k) => { adj[e.a].push({ viz: e.b, aresta: 2 * k }); adj[e.b].push({ viz: e.a, aresta: 2 * k + 1 }); custo[2 * k] = custo[2 * k + 1] = e.c; });
    const csrInicio = new Int32Array(n + 1);
    for (let u = 0; u < n; u++) csrInicio[u + 1] = csrInicio[u] + adj[u].length;
    const csrViz = new Int32Array(csrInicio[n]), csrAresta = new Int32Array(csrInicio[n]);
    adj.forEach((l, u) => l.forEach((a, q) => { csrViz[csrInicio[u] + q] = a.viz; csrAresta[csrInicio[u] + q] = a.aresta; }));
    return { G: { nodeIds: new Array(n).fill(0), csrInicio, csrViz, csrAresta } as unknown as GrafoCompacto, custo, arestas };
  }

  it('distâncias iguais às de Bellman-Ford; árvore consistente; buffer reaproveitável', () => {
    const r = aleatorio(11), n = 150;
    const { G, custo, arestas } = grafoAleatorio(n, r);
    const arv = arvoreVazia(n);
    for (const origem of [0, 17, 99]) {
      dijkstraEm(G, origem, custo, arv);
      const d = new Float64Array(n).fill(Infinity); d[origem] = 0;
      for (let it = 0; it < n; it++) { let mudou = false; for (const e of arestas) { if (d[e.a] + e.c < d[e.b] - 1e-12) { d[e.b] = d[e.a] + e.c; mudou = true; } if (d[e.b] + e.c < d[e.a] - 1e-12) { d[e.a] = d[e.b] + e.c; mudou = true; } } if (!mudou) break; }
      for (let u = 0; u < n; u++) {
        expect(arv.dist[u]).toBeCloseTo(d[u], 9);
        if (u !== origem) expect(arv.dist[arv.predNo[u]] + custo[arv.pred[u]]).toBeCloseTo(arv.dist[u], 9);
      }
    }
  });

  it('arestas proibidas (Infinity) não são usadas', () => {
    const r = aleatorio(3), n = 40;
    const { G, custo } = grafoAleatorio(n, r);
    const arv = arvoreVazia(n);
    custo.fill(Infinity);
    dijkstraEm(G, 0, custo, arv);
    expect(arv.dist[0]).toBe(0);
    for (let u = 1; u < n; u++) expect(arv.dist[u]).toBe(Infinity);
  });

  it('noMaisProximo em grade dá o mesmo nó da varredura linear (com e sem raio máximo)', () => {
    const { sim } = cidadeDeTeste();
    const G = compactar(sim.graph);
    expect(G.nodeIds.length).toBeGreaterThan(10);
    const r = aleatorio(9);
    for (let q = 0; q < 300; q++) {
      const x = (r() - 0.5) * 3000, z = (r() - 0.5) * 3000, maxD = q % 3 === 0 ? Infinity : 30 + r() * 600;
      let melhor = -1, bd = maxD;
      for (let i = 0; i < G.nodeIds.length; i++) { const d = Math.hypot(G.x[i] - x, G.z[i] - z); if (d < bd) { bd = d; melhor = i; } }
      expect(noMaisProximo(G, x, z, maxD), `consulta ${q}`).toBe(melhor);
    }
  });
});

describe('Relevo: limite de inclinação só reconfere o que mudou', () => {
  /** versão de varredura total (a de antes da Fase 23) */
  function referencia(h: Float32Array, n: number, passo: number, max: number, terra: Uint8Array, iteracoes: number) {
    const viz: [number, number, number][] = [[1, 0, 1], [0, 1, 1], [1, 1, Math.SQRT2], [-1, 1, Math.SQRT2]];
    let it = 0;
    for (; it < iteracoes; it++) {
      let mexeu = false;
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const k = j * n + i;
        for (const [di, dj, dist] of viz) {
          const ii = i + di, jj = j + dj;
          if (ii < 0 || ii > n - 1 || jj > n - 1) continue;
          const q = jj * n + ii;
          const d = h[k] - h[q], lim = max * passo * dist;
          if (Math.abs(d) <= lim + 0.01) continue;
          const exc = Math.abs(d) - lim;
          const alto = d > 0 ? k : q, baixo = d > 0 ? q : k;
          if (terra[baixo] && terra[alto]) { h[alto] -= exc / 2; h[baixo] += exc / 2; }
          else if (terra[alto]) h[alto] -= exc;
          else if (terra[baixo]) h[baixo] += exc;
          mexeu = true;
        }
      }
      if (!mexeu) break;
    }
    return it;
  }

  it('resultado idêntico ao da varredura total, bit a bit', () => {
    const n = 90, r = aleatorio(21);
    const a = new Float32Array(n * n), terra = new Uint8Array(n * n);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const k = j * n + i; terra[k] = r() > 0.12 ? 1 : 0; a[k] = terra[k] ? 60 * Math.sin(i / 7) * Math.cos(j / 9) + r() * 25 : 0; }
    const b = Float32Array.from(a);
    const itB = referencia(b, n, 16, 1.2, terra, 400);
    const res = limitarInclinacao(a, n, 16, 1.2, terra, 400);
    expect(res.iteracoes).toBe(itB);
    expect(res.ajustados).toBeGreaterThan(0);
    expect(Array.from(a)).toEqual(Array.from(b));
  });
});

describe('Simulação com orçamento e LOD', () => {
  it('em modo orçamento a fila é drenada pelo orçamento e o resultado fica perto do modo síncrono', () => {
    const { sim: a } = cidadeDeTeste();
    const { sim: b } = cidadeDeTeste();
    b.orcamentoMs = 1;
    b.definirFoco(0, 0, 100000); // tudo perto: só a fatia no tempo muda
    const DIAS = 120;
    for (let i = 0; i < DIAS * TICKS_POR_DIA; i++) { a.step(); b.step(); }
    b.drenar();
    expect(b.orcamento.pendentes).toBe(0);
    for (let i = 0; i < b.lots.length; i++) expect(Number.isFinite(b.lv[i])).toBe(true);
    const pa = a.stats().populacao, pb = b.stats().populacao;
    expect(pa).toBeGreaterThan(50);
    expect(Math.abs(pb - pa) / pa).toBeLessThan(0.35);
    expect(b.diasPulados).toBeLessThan(DIAS / 4);
  }, 120_000);

  it('lotes fora do foco seguem evoluindo (valor do solo a cada 4º dia) e perto/longe são marcados', () => {
    const { sim: a } = cidadeDeTeste();
    const { sim: b } = cidadeDeTeste();
    b.orcamentoMs = 4;
    b.definirFoco(-9000, -9000, 500); // nenhum lote perto
    expect(b.perto.every((v) => v === 0)).toBe(true);
    for (let i = 0; i < 80 * TICKS_POR_DIA; i++) { a.step(); b.step(); b.trabalhar(4); }
    b.drenar();
    let da = 0, db = 0, n = 0;
    for (let i = 0; i < a.lots.length; i++) if (a.zone[i]) { da += a.lv[i]; db += b.lv[i]; n++; }
    expect(n).toBeGreaterThan(20);
    expect(Math.abs(da / n - db / n)).toBeLessThan(6); // a média do valor do solo não anda mais que alguns pontos
    // e com o foco em cima da cidade todos os lotes ficam "perto"
    b.definirFoco(0, 0, 100000);
    expect(b.perto.every((v) => v === 1)).toBe(true);
  }, 120_000);

  it('serialize drena o trabalho pendente e o save carrega', () => {
    const { sim } = cidadeDeTeste();
    sim.orcamentoMs = 1;
    for (let i = 0; i < 9 * TICKS_POR_DIA; i++) sim.step();
    const save = JSON.parse(JSON.stringify(sim.serialize()));
    expect(sim.orcamento.pendentes).toBe(0);
    const copia = Simulation.deserialize(save, hm);
    expect(copia.lots.length).toBe(sim.lots.length);
  }, 60_000);

  it('rebuildLots cancela o trabalho em andamento (os lotes mudaram por baixo dele)', () => {
    const { sim, ox, oz } = cidadeDeTeste();
    sim.orcamentoMs = 0.001;
    for (let i = 0; i < TICKS_POR_DIA; i++) sim.step();
    expect(sim.orcamento.pendentes).toBe(1);
    expect(sim.command({ kind: 'road', req: { x0: ox - 100, z0: oz + 300, cx: ox, cz: oz + 300, x1: ox + 100, z1: oz + 300, type: 'rua' } }).ok).toBe(true);
    expect(sim.orcamento.pendentes).toBe(0);
    for (let i = 0; i < 3 * TICKS_POR_DIA; i++) sim.step();
    sim.drenar();
    for (let i = 0; i < sim.lots.length; i++) expect(Number.isFinite(sim.lv[i])).toBe(true);
  }, 60_000);

  it('modelo semanal de transporte em amostra (passo 4) dá números finitos e do mesmo porte que o completo', () => {
    const { sim } = cidadeDeTeste();
    for (let i = 0; i < 200 * TICKS_POR_DIA; i++) sim.step();
    sim.transporte.semanal(sim);
    const cheio = sim.transporte.resumo;
    const g = sim.transporte.semanalFatiado(sim, 4, 1);
    while (!g.next().done);
    const amostra = sim.transporte.resumo;
    expect(Number.isFinite(amostra.tempoMedio) && Number.isFinite(amostra.congestionamento)).toBe(true);
    if (cheio.viagensDia > 200) {
      expect(amostra.viagensDia).toBeGreaterThan(cheio.viagensDia * 0.3);
      expect(amostra.viagensDia).toBeLessThan(cheio.viagensDia * 2.5);
    }
  }, 120_000);
});

describe('Cache da extração do OSM por hash de caixa + versão', () => {
  const alvo: AlvoCidade = { ibge: '9999999', construivel: [-23.0, -43.3, -22.8, -43.1], mapa: [-23.1, -43.4, -22.7, -43.0] };

  it('o hash muda com a caixa, não com a ordem de grandeza do arredondamento, e depende da versão do extrator', () => {
    expect(hashAlvo(alvo)).toBe(hashAlvo({ ...alvo, mapa: [-23.100001, -43.4, -22.7, -43.0] })); // abaixo de 1e-5°
    expect(hashAlvo(alvo)).not.toBe(hashAlvo({ ...alvo, mapa: [-23.1, -43.4, -22.7, -42.9] }));
    expect(EXTRATOR_VERSAO).toBeGreaterThan(0);
  });

  it('sem manifesto ou sem algum arquivo a cidade está desatualizada; com tudo e o hash igual, não', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'osm-cache-'));
    expect((await alvosDesatualizados([alvo], dir)).length).toBe(1);
    for (const n of ['vias-predios', 'natureza', 'sinais', 'bairros', 'trilhos', 'caminhos']) writeFileSync(join(dir, `${alvo.ibge}-${n}.json`), '[]');
    writeFileSync(join(dir, 'manifesto.json'), JSON.stringify({ [alvo.ibge]: hashAlvo(alvo) }));
    expect((await alvosDesatualizados([alvo], dir)).length).toBe(0);
    // a caixa mudou: refaz
    expect((await alvosDesatualizados([{ ...alvo, mapa: [-23.2, -43.4, -22.6, -43.0] }], dir)).length).toBe(1);
  });
});

describe('Formato binário da cidade (núcleo + tiles)', () => {
  const jsonRio = join(__dirname, '../public/data/cidades/3304557.json');

  it('ida e volta devolve a mesma CidadeReal, campo a campo e sem perda', () => {
    const c = CidadeReal.parse(JSON.parse(readFileSync(jsonRio, 'utf8')));
    const { nucleo, tiles } = codificarCidade(c);
    expect(tiles.size).toBeGreaterThan(20);
    expect(listaTiles(nucleo).length).toBe(tiles.size);
    const d = decodificarCidade(nucleo, tiles);
    const iguais = (a: unknown, b: unknown, caminho: string) => {
      if (Array.isArray(a) && Array.isArray(b)) {
        expect(a.length, `${caminho}.length`).toBe(b.length);
        if (typeof a[0] === 'number') { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) throw new Error(`${caminho}[${i}]: ${a[i]} ≠ ${b[i]}`); }
        else a.forEach((x, i) => iguais(x, b[i], `${caminho}[${i}]`));
      } else if (a && b && typeof a === 'object') {
        const ka = Object.keys(a as object).filter((k) => (a as Record<string, unknown>)[k] !== undefined).sort(), kb = Object.keys(b as object).filter((k) => (b as Record<string, unknown>)[k] !== undefined).sort();
        expect(kb, `${caminho} chaves`).toEqual(ka);
        for (const k of ka) iguais((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], `${caminho}.${k}`);
      } else expect(b, caminho).toBe(a);
    };
    // alturas, verde e contornos voltam como bytes (o JSON os guardava em base64): compara os bytes
    for (const k of ['alturas', 'verde', 'contornos'] as const) expect(Array.from(bytesDe(d, k)!), k).toEqual(Array.from(bytesDe(c, k)!));
    const semBytes = (x: CidadeReal) => { const o: Record<string, unknown> = { ...x }; for (const k of ['alturas', 'verde', 'contornos', 'alturasBytes', 'verdeBytes', 'contornosBytes']) delete o[k]; return o; };
    iguais(semBytes(c), semBytes(d), 'cidade');
    // a volta ainda passa pelo esquema
    expect(CidadeReal.safeParse(d).success).toBe(true);
  }, 120_000);

  it('o tile só contém prédios da própria área e a união dos tiles cobre todos os prédios uma vez só', () => {
    const c = CidadeReal.parse(JSON.parse(readFileSync(jsonRio, 'utf8')));
    const { tiles, nucleo } = codificarCidade(c);
    const N = c.predios.length / CAMPOS_PREDIO;
    const nT = 12;
    const vistos = new Uint8Array(N);
    for (const [t, dados] of tiles) {
      const d = decodificarCidade(nucleo, new Map([[t, dados]]));
      for (let i = 0; i < N; i++) {
        const x = d.predios[i * CAMPOS_PREDIO];
        if (x === undefined) continue;
        expect(tileDe(x, d.predios[i * CAMPOS_PREDIO + 1], nT)).toBe(t);
        vistos[i]++;
      }
    }
    expect(vistos.every((v) => v === 1)).toBe(true);
  }, 120_000);
});
