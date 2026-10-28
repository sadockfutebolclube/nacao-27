import { describe, expect, it } from 'vitest';
import traits from '../data/ufs/traits.json';
import { ArquivoTracos } from '../src/data/schemas';
import { Zone } from '../src/sim/catalog';
import { Rng } from '../src/sim/core/rng';
import type { SimInit } from '../src/sim/protocol';
import { Simulation, somaDespesas, somaReceitas, TICKS_POR_DIA } from '../src/sim/simulation';
import { generateTerrain, sampleHeight } from '../src/world/terrain';
import { applyRoad, emptyGraph, nodeDegree, planRoad } from '../src/world/roads';
import { initDe } from './helpers';

const ufs = ArquivoTracos.parse(traits).ufs;
const rj = ufs.find((u) => u.sigla === 'RJ')!;
const efeitos = Object.assign({}, ...rj.tracos.map((t) => t.efeitos));

const init = (modo: SimInit['modo'] = 'mandato'): SimInit => ({
  sigla: 'RJ', nomeEstado: 'Rio de Janeiro', cidade: 'Rio de Janeiro', terreno: rj.terreno, bioma: 'mata-atlantica',
  latitude: rj.capital.lat, efeitos, esgotoUF: 66, festas: rj.festas, regiao: 'Sudeste', seed: 2027, modo,
});

const hm = generateTerrain(2027, rj.terreno, 'mata-atlantica');

/** Encontra um ponto seco e plano perto do centro para montar a malha de testes. */
function origemSeca(): [number, number] {
  for (let r = 0; r < 1200; r += 40) {
    for (let a = 0; a < Math.PI * 2; a += 0.4) {
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      let ok = true;
      for (let dx = -300; dx <= 300 && ok; dx += 30) for (let dz = -300; dz <= 300 && ok; dz += 30) {
        const h = sampleHeight(hm, x + dx, z + dz);
        if (h < 1.2 || h > 40) ok = false;
      }
      if (ok) return [x, z];
    }
  }
  return [0, -600];
}

describe('RNG determinístico', () => {
  it('mesma seed → mesma sequência; estado restaurável', () => {
    const a = new Rng(42), b = new Rng(42);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
    const c = new Rng(a.state());
    expect(c.next()).toBe(a.next());
  });
});

describe('Dados das UFs', () => {
  it('27 UFs com traços válidos', () => {
    expect(ufs).toHaveLength(27);
    expect(new Set(ufs.map((u) => u.sigla)).size).toBe(27);
  });
  it('terreno de todas as UFs gera alturas finitas', () => {
    for (const u of ufs.slice(0, 27)) {
      const h = generateTerrain(1, u.terreno, u.biomas[0]);
      let finitos = true;
      for (let i = 0; i < h.h.length; i += 997) if (!Number.isFinite(h.h[i])) finitos = false;
      expect(finitos, u.sigla).toBe(true);
    }
  }, 180_000);
});

describe('Grafo viário', () => {
  it('duas vias que se cruzam geram um cruzamento de grau 4', () => {
    const g = emptyGraph();
    const [ox, oz] = origemSeca();
    const r1 = { x0: ox - 100, z0: oz, cx: ox, cz: oz, x1: ox + 100, z1: oz, type: 'rua' as const };
    expect(planRoad(g, hm, r1).ok).toBe(true);
    applyRoad(g, r1, () => 'Rua A');
    const r2 = { x0: ox, z0: oz - 100, cx: ox, cz: oz, x1: ox, z1: oz + 100, type: 'rua' as const };
    const plan = planRoad(g, hm, r2);
    expect(plan.ok).toBe(true);
    expect(plan.cruzamentos).toBe(1);
    applyRoad(g, r2, () => 'Rua B');
    expect(g.edges.size).toBe(4);
    const centro = [...g.nodes.values()].find((n) => Math.hypot(n.x - ox, n.z - oz) < 1)!;
    expect(nodeDegree(g, centro.id)).toBe(4);
  });

  it('ponta perto de outra via faz snap e divide a aresta (T)', () => {
    const g = emptyGraph();
    const [ox, oz] = origemSeca();
    applyRoad(g, { x0: ox - 100, z0: oz, cx: ox, cz: oz, x1: ox + 100, z1: oz, type: 'rua' }, () => 'A');
    applyRoad(g, { x0: ox + 10, z0: oz + 120, cx: ox + 5, cz: oz + 61, x1: ox, z1: oz + 3, type: 'rua' }, () => 'B');
    expect(g.edges.size).toBe(3);
  });
});

describe('Simulação', () => {
  function cidadeDeTeste(modo: SimInit['modo'] = 'mandato') {
    const sim = new Simulation(init(modo), hm);
    const [ox, oz] = origemSeca();
    const L = 260;
    for (let k = -2; k <= 2; k++) {
      expect(sim.command({ kind: 'road', req: { x0: ox - L, z0: oz + k * 70, cx: ox, cz: oz + k * 70, x1: ox + L, z1: oz + k * 70, type: k === 0 ? 'avenida' : 'rua' } }).ok).toBe(true);
      expect(sim.command({ kind: 'road', req: { x0: ox + k * 110, z0: oz - 180, cx: ox + k * 110, cz: oz, x1: ox + k * 110, z1: oz + 180, type: 'rua' } }).ok).toBe(true);
    }
    expect(sim.lots.length).toBeGreaterThan(50);
    sim.command({ kind: 'zone', x: ox - 120, z: oz, radius: 160, zone: Zone.ResBaixa });
    sim.command({ kind: 'zone', x: ox + 60, z: oz - 60, radius: 90, zone: Zone.ResAlta });
    sim.command({ kind: 'zone', x: ox + 60, z: oz + 90, radius: 80, zone: Zone.Comercial });
    sim.command({ kind: 'zone', x: ox + 220, z: oz + 60, radius: 90, zone: Zone.Industrial });
    // equipamentos: tenta pontos ao longo da borda da malha até encaixar
    for (const eq of ['reservatorio', 'subestacao', 'reservatorio', 'subestacao']) {
      let ok = false;
      for (let dx = -L; dx <= L && !ok; dx += 25) {
        for (const dz of [-200, 200]) {
          if (sim.command({ kind: 'service', eq, x: ox + dx, z: oz + dz }).ok) { ok = true; break; }
        }
      }
      expect(ok, eq).toBe(true);
    }
    return sim;
  }

  it('cresce, o orçamento fecha todo mês e nada vira NaN em 20 anos', () => {
    const sim = cidadeDeTeste();
    expect(sim.services.length).toBeGreaterThan(0);
    // as obras iniciais já saíram do caixa, mas entram no balanço do 1º mês
    let caixaInicioMes = sim.caixa + sim.mesCorrente.investimentos;
    let mesesFechados = 0;
    let ultimo = sim.ultimoBalanco;
    const dias = 20 * 365;
    for (let d = 0; d < dias; d++) {
      for (let t = 0; t < TICKS_POR_DIA; t++) sim.step();
      if (sim.ultimoBalanco !== ultimo) {
        const L = sim.ultimoBalanco!;
        // Δcaixa do mês = receitas − despesas − investimentos
        expect(sim.caixa - caixaInicioMes).toBeCloseTo(somaReceitas(L) - somaDespesas(L) - L.investimentos, 0);
        expect(L.saldo).toBeCloseTo(somaReceitas(L) - somaDespesas(L) - L.investimentos, 0);
        caixaInicioMes = sim.caixa;
        ultimo = L;
        mesesFechados++;
      }
      if (d % 365 === 0) {
        const s = sim.stats();
        for (const v of [s.populacao, s.caixa, s.aprovacao, s.demanda.r, s.demanda.c, s.demanda.i, s.poluicaoAgua, s.valorSoloMedio]) {
          expect(Number.isFinite(v)).toBe(true);
        }
        for (let i = 0; i < sim.lots.length; i++) expect(Number.isFinite(sim.lv[i])).toBe(true);
      }
    }
    const s = sim.stats();
    expect(mesesFechados).toBeGreaterThanOrEqual(239);
    expect(s.populacao).toBeGreaterThan(200);
    expect(s.edificios).toBeGreaterThan(20);
    expect(s.aprovacao).toBeGreaterThanOrEqual(5);
    expect(s.aprovacao).toBeLessThanOrEqual(95);
    expect(s.ano).toBe(2047);
  }, 120_000);

  it('save/load reproduz o estado', () => {
    const sim = cidadeDeTeste();
    for (let i = 0; i < 400 * TICKS_POR_DIA; i++) sim.step();
    const save = JSON.parse(JSON.stringify(sim.serialize()));
    const copia = Simulation.deserialize(save, hm);
    expect(copia.lots.length).toBe(sim.lots.length);
    expect(copia.populacao).toBe(sim.populacao);
    expect(copia.caixa).toBe(sim.caixa);
    expect([...copia.arch]).toEqual([...sim.arch]);
    // e segue idêntica depois de carregar (determinismo)
    for (let i = 0; i < 60 * TICKS_POR_DIA; i++) { sim.step(); copia.step(); }
    expect(copia.populacao).toBe(sim.populacao);
    expect(copia.caixa).toBe(sim.caixa);
  }, 60_000);

  it('com o Estado: repasse do Programa da Capital, snapshot e save/load completo', () => {
    const base = cidadeDeTeste();
    const comEstado = new Simulation({ ...base.init, estado: initDe('RJ') }, hm);
    expect(comEstado.estado).not.toBeNull();
    for (let i = 0; i < 70 * TICKS_POR_DIA; i++) comEstado.step();
    const st = comEstado.stats();
    expect(st.estado).not.toBeNull();
    expect(st.ultimoBalanco!.receitas.repasse).toBeGreaterThan(1e6);
    expect(st.ultimoBalanco!.despesas.divida).toBe(0);
    const r = comEstado.command({ kind: 'estado', acao: { tipo: 'iniciar-obra', id: 'upas' } });
    expect(r.ok).toBe(true);
    const save = JSON.parse(JSON.stringify(comEstado.serialize()));
    const copia = Simulation.deserialize(save, hm);
    expect(copia.estado!.caixa).toBeCloseTo(comEstado.estado!.caixa, 0);
    expect(copia.estado!.obras.length).toBe(1);
    for (let i = 0; i < 40 * TICKS_POR_DIA; i++) { comEstado.step(); copia.step(); }
    expect(copia.estado!.caixa).toBeCloseTo(comEstado.estado!.caixa, 0);
    expect(copia.estado!.aprovacao).toBeCloseTo(comEstado.estado!.aprovacao, 6);
  }, 60_000);

  it('sem rede de água/energia a cidade não passa do nível 1', () => {
    const sim = new Simulation(init(), hm);
    const [ox, oz] = origemSeca();
    sim.command({ kind: 'road', req: { x0: ox - 200, z0: oz, cx: ox, cz: oz, x1: ox + 200, z1: oz, type: 'rua' } });
    sim.command({ kind: 'zone', x: ox, z: oz, radius: 220, zone: Zone.ResAlta });
    for (let i = 0; i < 365 * TICKS_POR_DIA; i++) sim.step();
    let max = 0;
    for (let i = 0; i < sim.lots.length; i++) if (sim.arch[i]) max = Math.max(max, sim.arch[i]);
    expect(max).toBeLessThanOrEqual(4);
  }, 60_000);
});
