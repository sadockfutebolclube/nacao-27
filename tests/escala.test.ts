/**
 * Escala do Rio (Fase 13): montagem do mundo real, custo do passo da simulação e tamanho do estado que o
 * Worker manda para a tela a cada passo. Imprime as medidas e falha se o Rio atual ficar lento demais.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CidadeReal, CAMPOS_PREDIO } from '../src/data/cidadeReal';
import { ArquivoTracos } from '../src/data/schemas';
import { LOT_STATE_STRIDE, type SimInit } from '../src/sim/protocol';
import { Simulation } from '../src/sim/simulation';

const tracos = ArquivoTracos.parse(JSON.parse(readFileSync('data/ufs/traits.json', 'utf8')));
const rj = tracos.ufs.find((u) => u.sigla === 'RJ')!;

describe('Fase 13 — escala do Rio', () => {
  it('monta e simula o Rio real dentro do orçamento de tempo', () => {
    const c = CidadeReal.parse(JSON.parse(readFileSync('public/data/cidades/3304557.json', 'utf8')));
    const init: SimInit = {
      sigla: 'RJ', nomeEstado: 'Rio de Janeiro', cidade: 'Rio de Janeiro', terreno: rj.terreno, bioma: 'mata-atlantica', latitude: -22.9,
      efeitos: {}, esgotoUF: 60, festas: [], regiao: 'Sudeste', seed: 7, modo: 'sandbox', cidadeReal: '3304557',
    };
    const t0 = performance.now();
    const sim = new Simulation(init, undefined, c);
    const montagem = performance.now() - t0;
    const passos: number[] = [];
    for (let i = 0; i < 30; i++) { const a = performance.now(); sim.step(); passos.push(performance.now() - a); }
    passos.sort((a, b) => a - b);
    const est = sim.lotState();
    console.log(`[escala] prédios ${c.predios.length / CAMPOS_PREDIO} · lotes ${est.length / LOT_STATE_STRIDE} · montagem ${montagem.toFixed(0)} ms · passo mediana ${passos[15].toFixed(1)} ms / p90 ${passos[27].toFixed(1)} ms · estado ${(est.byteLength / 1e6).toFixed(2)} MB`);
    expect(passos[15]).toBeLessThan(250);
  }, 120_000);
});
