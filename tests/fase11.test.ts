import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CidadeReal, CAMPOS_PREDIO, predio } from '../src/data/cidadeReal';
import { ArquivoTracos } from '../src/data/schemas';
import { FLAG } from '../src/sim/protocol';
import type { SimInit } from '../src/sim/protocol';
import { Simulation } from '../src/sim/simulation';
import { arquetipoReal, grafoReal, lotesFixos, terrenoReal } from '../src/world/cidadeReal';
import { Zone } from '../src/sim/catalog';
import { LOT_STRIDE } from '../src/world/lots';

const tracos = ArquivoTracos.parse(JSON.parse(readFileSync('data/ufs/traits.json', 'utf8')));
const se = tracos.ufs.find((u) => u.sigla === 'SE')!;

/** Cidade real sintética: chão a 10 m, um rio a leste, uma avenida e uma rua em cruz, quatro prédios. */
function cidadeFalsa(): CidadeReal {
  const res = 385, passo = 16;
  const alt = new Int16Array(res * res);
  for (let j = 0; j < res; j++) for (let i = 0; i < res; i++) alt[j * res + i] = i > 330 ? -25 : 100;
  const verde = new Uint8Array(192 * 192).fill(0);
  verde[96 * 192 + 96] = 255;
  const b64 = (u: Uint8Array) => Buffer.from(u.buffer, u.byteOffset, u.byteLength).toString('base64');
  return CidadeReal.parse({
    versao: 1, ibge: '9999999', nome: 'Cidade Teste', uf: 'SE', lat: -10.9, lon: -37.06, geradoEm: '2026-10-27', base: 0, litoral: true,
    passo, res, alturas: b64(new Uint8Array(alt.buffer)), verde: b64(verde),
    vias: { nos: [-300, 0, 0, 0, 300, 0, 0, -300, 0, 300], arestas: [1, 2, -150, 0, 1, 0, 2, 3, 150, 0, 1, 0, 4, 2, 0, -150, 0, -1, 2, 5, 0, 150, 0, 1], nomes: ['Avenida Ivo do Prado', 'Rua João Pessoa'] },
    predios: [
      // [x, z, ângulo×1000, largura, profundidade, andares, tipo, aresta, nome]
      -100, 20, 3142, 12, 20, 2, 0, 1, -1,
      -60, 30, 3142, 22, 30, 14, 0, 1, 0,
      100, -25, 0, 30, 24, 3, 1, 2, -1,
      20, 120, 1571, 40, 60, 1, 2, 4, -1,
    ],
    nomesPredios: ['Edifício Atalaia'],
    estat: { predios: 4, comAndares: 2, vias: 4, km: 1.2 },
  });
}

const init = (): SimInit => ({
  sigla: 'SE', nomeEstado: 'Sergipe', cidade: 'Cidade Teste', terreno: se.terreno, bioma: 'mata-atlantica', latitude: -10.9,
  efeitos: {}, esgotoUF: 30, festas: [], regiao: 'Nordeste', seed: 7, modo: 'mandato', cidadeReal: '9999999',
});

describe('Fase 11 — cidade real', () => {
  it('relevo, água e verde vêm do arquivo', () => {
    const c = cidadeFalsa();
    const hm = terrenoReal(c, se.terreno, 'mata-atlantica', 1);
    const meio = Math.floor(hm.h.length / 2);
    expect(hm.h[meio]).toBeCloseTo(10, 0);
    expect(hm.h.reduce((a, v) => Math.min(a, v), Infinity)).toBeLessThan(0); // o rio ficou abaixo do nível da água
    expect(hm.forest.some((v) => v > 200)).toBe(true);
    expect(hm.waterDist[meio]).toBeGreaterThan(100);
  });

  it('ruas reais viram o grafo do jogo com nomes', () => {
    const g = grafoReal(cidadeFalsa(), () => 'Rua Fictícia');
    expect(g.nodes.size).toBe(5);
    expect(g.edges.size).toBe(4);
    expect(g.edges.get(1)!.type).toBe('avenida');
    expect(g.edges.get(1)!.name).toBe('Avenida Ivo do Prado');
    expect(g.edges.get(3)!.name).toBe('Rua Fictícia');
    expect(g.edges.get(4)!.name).toBe('Rua João Pessoa');
    expect(g.nextEdge).toBe(5);
  });

  it('arquétipos: casas, torres, comércio e galpões pelos andares e pelo tipo', () => {
    expect(arquetipoReal(0, 1, 80).zone).toBe(Zone.ResBaixa);
    expect(arquetipoReal(0, 20, 600)).toMatchObject({ zone: Zone.ResAlta, arch: 7 });
    expect(arquetipoReal(1, 12, 900).arch).toBe(10);
    expect(arquetipoReal(2, 1, 4000).arch).toBe(12);
  });

  it('a cidade já nasce construída, habitada e abastecida pela rede herdada', () => {
    const c = cidadeFalsa();
    const sim = new Simulation(init(), undefined, c);
    const reais = sim.lots.map((l, i) => [l, i] as const).filter(([l]) => l.real !== undefined);
    expect(reais.length).toBe(4);
    for (const [, i] of reais) { expect(sim.realLote[i]).toBe(1); expect(sim.progress[i]).toBe(1); expect(sim.arch[i]).toBeGreaterThan(0); }
    const torre = reais.find(([l]) => l.real === 1)![1];
    expect(sim.floors[torre]).toBe(14);
    // lotes comuns ao longo das ruas continuam disponíveis para o jogador
    expect(sim.lots.length).toBeGreaterThan(4);
    // trechos de rua sem nenhum prédio mapeado por perto ganham casas e lojas na fundação
    const preenchidos = [...sim.realLote].map((v, i) => [v, i]).filter(([v]) => v === 2);
    expect(preenchidos.length).toBeGreaterThan(0);
    for (const [, i] of preenchidos) expect(sim.arch[i]).toBeGreaterThan(0);
    expect(preenchidos.every(([, i]) => sim.lots[i].real === undefined)).toBe(true);
    // o pacote de renderização marca os prédios reais
    const L = sim.worldMessage().lots;
    expect(L[torre * LOT_STRIDE + 7]).toBe(2);
    for (let d = 0; d < 10; d++) for (let t = 0; t < 4; t++) sim.step();
    expect(sim.herdada).not.toBeNull();
    expect(sim.flags[torre] & FLAG.AGUA).toBeTruthy();
    expect(sim.flags[torre] & FLAG.ENERGIA).toBeTruthy();
    expect(sim.stats(1).populacao).toBeGreaterThan(50);
    // prédio real não é reconstruído pela simulação
    expect(sim.arch[torre]).toBe(arquetipoReal(0, 14, 660).arch);
  });

  it('demolir um prédio real é permanente e sobrevive ao save', () => {
    const c = cidadeFalsa();
    const sim = new Simulation(init(), undefined, c);
    const i = sim.lots.findIndex((l) => l.real === 2);
    const l = sim.lots[i];
    expect(sim.command({ kind: 'bulldoze', x: l.x, z: l.z }).ok).toBe(true);
    expect(sim.lots.some((x) => x.real === 2)).toBe(false);
    for (let t = 0; t < 4; t++) sim.step();
    const b = Simulation.deserialize(JSON.parse(JSON.stringify(sim.serialize())), undefined, c);
    expect(b.lots.some((x) => x.real === 2)).toBe(false);
    expect(b.lots.filter((x) => x.real !== undefined)).toHaveLength(3);
    expect(b.herdada).toEqual(sim.herdada);
    expect(b.realLote.filter((v) => v === 1).length).toBe(3);
  });

  it('prédios ficam de fora quando a rua de frente some', () => {
    const c = cidadeFalsa();
    expect(lotesFixos(c, new Set(), () => true)).toHaveLength(4);
    expect(lotesFixos(c, new Set([0]), (id) => id !== 4)).toHaveLength(2);
    expect(predio(c, 1).nome).toBe('Edifício Atalaia');
    expect(c.predios.length / CAMPOS_PREDIO).toBe(4);
  });

  it('arquivos gerados (quando existem) seguem o esquema', () => {
    const idx = 'public/data/cidades/index.json';
    if (!existsSync(idx)) return;
    const lista = JSON.parse(readFileSync(idx, 'utf8')) as string[];
    for (const ibge of lista.slice(0, 3)) {
      const c = CidadeReal.parse(JSON.parse(readFileSync(`public/data/cidades/${ibge}.json`, 'utf8')));
      expect(c.predios.length % CAMPOS_PREDIO).toBe(0);
      const g = grafoReal(c, () => '');
      for (const e of g.edges.values()) { expect(g.nodes.has(e.a)).toBe(true); expect(g.nodes.has(e.b)).toBe(true); }
    }
  });
});
