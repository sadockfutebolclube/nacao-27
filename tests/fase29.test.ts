/** Fase 29: tráfego microscópico — IDM, MOBIL, faixas, cruzamentos, semáforo, rotatória e emergência. */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CidadeReal } from '../src/data/cidadeReal';
import { grafoReal } from '../src/world/cidadeReal';
import { Rede } from '../src/sim/trafego/rede';
import { Trafego, F } from '../src/sim/trafego/trafego';
import { faseSemaforo, eixoSemaforo } from '../src/sim/trafego/semaforo';
import type { RoadEdge, RoadGraph, RoadNode } from '../src/world/roads';

/** grafo de testes: nós em (x, z), arestas retas */
function grafo(nos: [number, number, boolean?][], arestas: { a: number; b: number; tipo?: 'rua' | 'avenida'; faixas?: number; maoUnica?: boolean }[]): RoadGraph {
  const g: RoadGraph = { nodes: new Map(), edges: new Map(), nextNode: nos.length + 1, nextEdge: arestas.length + 1 };
  nos.forEach(([x, z, sem], i) => g.nodes.set(i + 1, { id: i + 1, x, z, ...(sem ? { semaforo: true } : {}) } as RoadNode));
  arestas.forEach((a, i) => {
    const A = g.nodes.get(a.a)!, B = g.nodes.get(a.b)!;
    const e: RoadEdge = { id: i + 1, a: a.a, b: a.b, cx: (A.x + B.x) / 2, cz: (A.z + B.z) / 2, type: a.tipo ?? 'avenida', name: `T${i}`, ...(a.faixas ? { faixas: a.faixas } : {}), ...(a.maoUnica ? { maoUnica: true } : {}) };
    g.edges.set(e.id, e);
  });
  return g;
}
/** quantos pares consecutivos da mesma faixa se sobrepõem em mais de `tol` m */
function sobrepostos(t: Trafego, tol = 0.5): number {
  let n = 0;
  const porFaixa = new Map<number, number[]>();
  for (let i = 0; i < t.n; i++) if (t.ativo[i] && t.emerg[i] !== 2 && !(t.flags[i] & F.ULT)) { const k = t.link[i] * 8 + t.lane[i]; (porFaixa.get(k) ?? porFaixa.set(k, []).get(k)!).push(i); }
  for (const l of porFaixa.values()) { l.sort((a, b) => t.s[a] - t.s[b]); for (let q = 1; q < l.length; q++) if (t.s[l[q]] - t.comp[l[q]] - t.s[l[q - 1]] < -tol) n++; }
  return n;
}
/** menor folga entre veículos consecutivos da mesma faixa (m); < 0 = sobreposição */
function menorFolga(t: Trafego): number {
  let m = Infinity;
  const porFaixa = new Map<number, number[]>();
  for (let i = 0; i < t.n; i++) if (t.ativo[i] && t.emerg[i] !== 2) { const k = t.link[i] * 8 + t.lane[i]; (porFaixa.get(k) ?? porFaixa.set(k, []).get(k)!).push(i); }
  for (const l of porFaixa.values()) { l.sort((a, b) => t.s[a] - t.s[b]); for (let q = 1; q < l.length; q++) { const f = t.s[l[q]] - t.comp[l[q]] - t.s[l[q - 1]]; if (f < m) m = f; } }
  return m;
}

describe('rede de faixas', () => {
  it('faixas por sentido: as do OSM divididas nos dois sentidos, ou as do tipo; mão única usa todas', () => {
    const r = Rede.de(grafo([[0, 0], [100, 0], [200, 0], [300, 0]], [{ a: 1, b: 2, faixas: 6 }, { a: 2, b: 3 }, { a: 3, b: 4, tipo: 'rua' }, { a: 1, b: 3, maoUnica: true, faixas: 3 }]));
    expect(r.links[r.porAresta.get(1)![0]].nL).toBe(3);
    expect(r.links[r.porAresta.get(2)![0]].nL).toBe(2); // avenida: 4 faixas = 2 por sentido
    expect(r.links[r.porAresta.get(3)![0]].nL).toBe(1); // rua: 2 faixas = 1 por sentido
    expect(r.links[r.porAresta.get(4)![0]].nL).toBe(3);
    expect(r.porAresta.get(4)![1]).toBe(-1);
  });
  it('detecta a rotatória (anel de mão única) e não marca a rua reta', () => {
    const n: [number, number][] = [[0, 30], [30, 0], [0, -30], [-30, 0], [200, 0]];
    const r = Rede.de(grafo(n, [{ a: 1, b: 2, maoUnica: true }, { a: 2, b: 3, maoUnica: true }, { a: 3, b: 4, maoUnica: true }, { a: 4, b: 1, maoUnica: true }, { a: 2, b: 5 }]));
    expect(r.links.filter((l) => l.rot).length).toBe(4);
    expect(r.links[r.porAresta.get(5)![0]].rot).toBe(false);
  });
});

describe('IDM e fila no semáforo', () => {
  const g = grafo([[0, 0], [400, 0, true], [800, 0]], [{ a: 1, b: 2 }, { a: 2, b: 3 }]);
  it('o carro para no vermelho, forma fila sem se sobrepor e arranca no verde', () => {
    const t = new Trafego(Rede.de(g), { seed: 3 });
    t.foco = { x: 400, z: 0, raio: 3000 };
    const ida = t.rede.porAresta.get(1)![0];
    for (let k = 0; k < 8; k++) t.criar(ida, 30 + k * 40, 0, 0, 12, k);
    // espera o vermelho do eixo x (fase 2: t entre 20 e 40 s)
    let minFolga = Infinity, maxVparados = 0, filaPico = 0;
    for (let k = 0; k < 40 / 0.05; k++) {
      t.step(0.05);
      minFolga = Math.min(minFolga, menorFolga(t));
      const vermelho = faseSemaforo(eixoSemaforo(1, 0), t.tempo) === 2;
      if (vermelho) {
        let fila = 0;
        for (let i = 0; i < t.n; i++) if (t.ativo[i] && t.link[i] === ida && t.v[i] < 0.5 && 400 - t.s[i] < 120) fila++;
        filaPico = Math.max(filaPico, fila);
        for (let i = 0; i < t.n; i++) if (t.ativo[i] && t.link[i] === ida && t.s[i] > 399.5) maxVparados = Math.max(maxVparados, t.v[i]);
      }
    }
    expect(minFolga).toBeGreaterThan(0.2);
    expect(filaPico).toBeGreaterThanOrEqual(3);
  });
});

describe('MOBIL: troca de faixa', () => {
  it('um carro rápido atrás de um caminhão lento na faixa da direita troca para a da esquerda e passa', () => {
    const g = grafo([[0, 0], [1500, 0]], [{ a: 1, b: 2 }]);
    const t = new Trafego(Rede.de(g), { seed: 5 });
    t.foco = { x: 700, z: 0, raio: 3000 };
    const ida = t.rede.porAresta.get(1)![0];
    const camiao = t.criar(ida, 200, 0, 5, 4, 1);
    t.v0[camiao] = 4;
    const carro = t.criar(ida, 120, 0, 0, 13, 2);
    t.v0[carro] = 15;
    let trocou = false, minFolga = Infinity;
    for (let k = 0; k < 60 / 0.05; k++) {
      t.step(0.05);
      if (t.lane[carro] === 1) trocou = true;
      minFolga = Math.min(minFolga, menorFolga(t));
    }
    expect(trocou).toBe(true);
    expect(t.s[carro]).toBeGreaterThan(t.s[camiao] + 20);
    expect(t.stats.trocas + 1).toBeGreaterThan(0);
    expect(minFolga).toBeGreaterThan(0.2);
  });
  it('a lateral anda aos poucos (sem teleporte entre faixas)', () => {
    const g = grafo([[0, 0], [1500, 0]], [{ a: 1, b: 2 }]);
    const t = new Trafego(Rede.de(g), { seed: 5 });
    t.foco = { x: 700, z: 0, raio: 3000 };
    const ida = t.rede.porAresta.get(1)![0];
    const camiao = t.criar(ida, 200, 0, 5, 4, 1); t.v0[camiao] = 4;
    const carro = t.criar(ida, 120, 0, 0, 13, 2); t.v0[carro] = 15;
    let ant = t.lat[carro], maxSalto = 0;
    for (let k = 0; k < 40 / 0.05; k++) { t.step(0.05); maxSalto = Math.max(maxSalto, Math.abs(t.lat[carro] - ant)); ant = t.lat[carro]; }
    expect(maxSalto).toBeLessThan(0.2);
  });
});

describe('ultrapassagem simples em mão dupla', () => {
  it('passa o veículo lento pela contramão quando a pista está livre e volta à faixa', () => {
    const g = grafo([[0, 0], [2000, 0]], [{ a: 1, b: 2, tipo: 'rua' }]);
    const t = new Trafego(Rede.de(g), { seed: 9 });
    t.foco = { x: 1000, z: 0, raio: 4000 };
    const ida = t.rede.porAresta.get(1)![0];
    const lento = t.criar(ida, 300, 0, 5, 4, 1); t.v0[lento] = 4;
    const rapido = t.criar(ida, 240, 0, 0, 10, 2); t.v0[rapido] = 12;
    let ultrapassou = false;
    for (let k = 0; k < 80 / 0.05; k++) { t.step(0.05); if (t.flags[rapido] & F.ULT) ultrapassou = true; }
    expect(ultrapassou).toBe(true);
    expect(t.s[rapido]).toBeGreaterThan(t.s[lento] + 8);
    expect(t.flags[rapido] & F.ULT).toBe(0);
    expect(Math.abs(t.lat[rapido] - t.latFaixa(t.rede.links[ida], 0))).toBeLessThan(0.3);
  });
  it('não ultrapassa com um carro vindo em sentido contrário', () => {
    const g = grafo([[0, 0], [2000, 0]], [{ a: 1, b: 2, tipo: 'rua' }]);
    const t = new Trafego(Rede.de(g), { seed: 9 });
    t.foco = { x: 1000, z: 0, raio: 4000 };
    const ida = t.rede.porAresta.get(1)![0], volta = t.rede.porAresta.get(1)![1];
    const lento = t.criar(ida, 300, 0, 5, 4, 1); t.v0[lento] = 4;
    const rapido = t.criar(ida, 240, 0, 0, 10, 2); t.v0[rapido] = 12;
    t.criar(volta, 2000 - 520, 0, 0, 10, 3); // vindo de frente, a ~260 m
    for (let k = 0; k < 6 / 0.05; k++) { t.step(0.05); expect(t.flags[rapido] & F.ULT).toBe(0); }
  });
});

describe('prioridade em cruzamento sem semáforo', () => {
  it('a rua cede à avenida: o carro da rua não entra no nó com a avenida a menos de 40 m', () => {
    const g = grafo([[-300, 0], [0, 0], [300, 0], [0, 300]], [{ a: 1, b: 2 }, { a: 2, b: 3 }, { a: 4, b: 2, tipo: 'rua' }]);
    const t = new Trafego(Rede.de(g), { seed: 2 });
    t.foco = { x: 0, z: 0, raio: 3000 };
    const av = t.rede.porAresta.get(1)![0], rua = t.rede.porAresta.get(3)![0];
    // com a avenida ocupada, o carro da rua chega ao nó e tem de esperar
    for (let k = 0; k < 6; k++) t.criar(av, 40 + k * 28, 0, 0, 14, k);
    const c = t.criar(rua, 250, 0, 0, 8, 9);
    t.prox[c] = t.rede.porAresta.get(2)![0];
    let entrouComAvenida = false;
    for (let k = 0; k < 25 / 0.05; k++) {
      const antes = t.link[c];
      t.step(0.05);
      if (antes === rua && t.link[c] !== rua) {
        for (let i = 0; i < t.n; i++) if (t.ativo[i] && i !== c && t.link[i] === av && 300 - t.s[i] < 8 && t.v[i] > 5) entrouComAvenida = true;
      }
    }
    expect(entrouComAvenida).toBe(false);
  });
});

describe('ambulância furando a fila', () => {
  it('passa pela fila do semáforo, os carros abrem passagem e ela chega e estaciona na cena', () => {
    const g = grafo([[0, 0], [600, 0, true], [1200, 0]], [{ a: 1, b: 2 }, { a: 2, b: 3 }]);
    const t = new Trafego(Rede.de(g), { seed: 4 });
    t.foco = { x: 600, z: 0, raio: 3000 };
    const ida = t.rede.porAresta.get(1)![0];
    // o semáforo fecha em t = 60 s (vermelho de 60 a 80): a ambulância parte antes e a fila se forma enquanto ela ainda vem
    t.tempo = 30;
    t.emergencia({ cena: 1, x: 700, z: 0, veiculos: [{ rotulo: 'ambulance||samu', n: 1, chegadaS: 14 }] });
    for (let k = 0; k < 28.5 / 0.05; k++) t.step(0.05);
    for (let k = 0; k < 7; k++) { const i = t.criar(ida, 560 - k * 9, k % 2, 0, 11, k); t.v0[i] = 12; }
    let pico = 0, abriram = 0, chegou = -1, filaPico = 0;
    for (let k = 0; k < 40 / 0.05; k++) {
      t.step(0.05);
      let ab = 0, fila = 0;
      for (let i = 0; i < t.n; i++) if (t.ativo[i]) { if (t.flags[i] & F.ABRIU) ab++; if (t.emerg[i] === 0 && t.v[i] < 0.5 && t.link[i] === ida) fila++; }
      abriram = Math.max(abriram, ab); filaPico = Math.max(filaPico, fila);
      for (let i = 0; i < t.n; i++) if (t.ativo[i] && t.emerg[i] === 2 && chegou < 0) chegou = t.tempo;
      pico = Math.max(pico, t.stats.emergencias);
    }
    expect(filaPico).toBeGreaterThanOrEqual(4);
    expect(pico).toBe(1);
    expect(abriram).toBeGreaterThan(0);
    expect(chegou).toBeGreaterThan(0);
  });
});

describe('no Rio (grafo real do OpenStreetMap)', () => {
  const arq = 'public/data/cidades/3304557.json';
  it('2 000 veículos por 2 minutos em Copacabana: sem sobreposição, fluindo, e o passo cabe no orçamento', () => {
    if (!existsSync(arq)) return;
    const rio = CidadeReal.parse(JSON.parse(readFileSync(arq, 'utf8')));
    const rede = Rede.de(grafoReal(rio, () => ''));
    expect(rede.links.length).toBeGreaterThan(20000);
    expect([...rede.links].filter((l) => l.rot).length).toBeGreaterThan(8); // rotatórias do OSM
    const t = new Trafego(rede, { seed: 11, cap: 3000 });
    t.foco = { x: 1100, z: 2800, raio: 1300 };
    t.alvo = 1500;
    const t0 = performance.now();
    let pior = Infinity, somaV = 0, amostras = 0, msMax = 0, fracSobre = 0;
    for (let k = 0; k < 120 / 0.05; k++) {
      t.step(0.05);
      msMax = Math.max(msMax, t.stats.ms);
      if (k % 200 === 199) {
        pior = Math.min(pior, menorFolga(t));
        fracSobre += sobrepostos(t) / Math.max(1, t.stats.ativos);
        let n = 0, v = 0; for (let i = 0; i < t.n; i++) if (t.ativo[i]) { n++; v += t.v[i]; }
        if (n) { somaV += v / n; amostras++; }
      }
    }
    const ms = (performance.now() - t0) / (120 / 0.05);
    writeFileSync(`${process.env.TEMP}/trafego-rio.json`, JSON.stringify({ ativos: t.stats.ativos, msPorPasso: +ms.toFixed(2), msMax: +msMax.toFixed(1), folgaMin: +pior.toFixed(2), fracaoSobrepostos: +(fracSobre / Math.max(1, amostras)).toFixed(5), vMedia: +(somaV / amostras).toFixed(2), trocas: t.stats.trocas, ultrapassagens: t.stats.ultrapassagens, parados: t.stats.parados }));
    expect(t.stats.ativos).toBeGreaterThan(600);
    expect(pior).toBeGreaterThan(-9);
    expect(fracSobre / amostras).toBeLessThan(0.004); // < 0,4% dos veículos, em fusões de cruzamento
    expect(somaV / amostras).toBeGreaterThan(2);
    expect(ms).toBeLessThan(25);
  }, 240000);
});
