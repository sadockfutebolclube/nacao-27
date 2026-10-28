import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CidadeReal } from '../src/data/cidadeReal';
import { ArquivoTracos } from '../src/data/schemas';
import { construirPerfis } from '../src/render/city/perfilVias';
import { chaveLeito, eixoSemaforo, faseSemaforo, CICLO_SEM } from '../src/render/city/Vias';
import { grafoReal, terrenoReal } from '../src/world/cidadeReal';
import { RASTER_RES } from '../src/world/constants';
import { sampleHeight } from '../src/world/terrain';
import { computeLots } from '../src/world/lots';
import { calcadaVia, faixasVia, larguraVia, meiaVia, emptyGraph, type RoadEdge } from '../src/world/roads';

const tracos = ArquivoTracos.parse(JSON.parse(readFileSync('data/ufs/traits.json', 'utf8')));
const rj = tracos.ufs.find((u) => u.sigla === 'RJ')!;

/** Cidade real mínima com ruas de 8 campos: avenida de 4 faixas, mão única, túnel e viaduto em fila, semáforo no cruzamento. */
function cidadeComVias() {
  const res = 385, passo = 16;
  const alt = new Int16Array(res * res).fill(100);
  // um morro de 60 m e 130 m de raio no meio do mapa (o túnel passa por baixo; os portais ficam no chão)
  for (let j = 0; j < res; j++) for (let i = 0; i < res; i++) { const d = Math.hypot(i - 192, j - 192); if (d < 8) alt[j * res + i] = 600; }
  const b64 = (u: Uint8Array) => Buffer.from(u.buffer, u.byteOffset, u.byteLength).toString('base64');
  return CidadeReal.parse({
    versao: 1, ibge: '9999998', nome: 'Cidade Teste', uf: 'RJ', lat: -22.9, lon: -43.2, geradoEm: '2026-10-27', base: 0, litoral: false,
    passo, res, alturas: b64(new Uint8Array(alt.buffer)), verde: b64(new Uint8Array(192 * 192)),
    vias: {
      nos: [-400, 0, -150, 0, 150, 0, 400, 0, 0, -300, 0, 300],
      // a, b, cx, cz, tipo, nome, faixas, flags (1 mão única · 2 ponte · 4 túnel)
      arestas: [
        1, 2, -275, 0, 1, 0, 4, 0,
        2, 3, 0, 0, 1, 0, 4, 4,
        3, 4, 275, 0, 1, 0, 2, 3,
        5, 2, -75, -150, 0, 1, 2, 0,
        2, 6, -75, 150, 0, 1, 1, 1,
      ],
      nomes: ['Avenida Teste', 'Rua Teste'], campos: 8, semaforos: [2], faixasPed: [100, 5, 1571],
    },
    predios: [], nomesPredios: [],
    estat: { predios: 0, comAndares: 0, vias: 5, km: 1 },
  });
}

describe('Fase 14 — ruas fiéis', () => {
  it('o grafo real traz faixas, mão única, ponte/túnel e semáforos', () => {
    const g = grafoReal(cidadeComVias(), () => 'Rua');
    expect(g.edges.size).toBe(5);
    expect(g.edges.get(1)).toMatchObject({ faixas: 4 });
    expect(g.edges.get(1)!.maoUnica).toBeUndefined();
    expect(g.edges.get(2)).toMatchObject({ faixas: 4, nivel: -1 });
    expect(g.edges.get(3)).toMatchObject({ faixas: 2, nivel: 1, maoUnica: true });
    expect(g.edges.get(5)).toMatchObject({ faixas: 1, maoUnica: true });
    expect(g.nodes.get(2)!.semaforo).toBe(true);
    expect(g.nodes.get(1)!.semaforo).toBeUndefined();
  });

  it('arquivos antigos (6 campos por aresta) continuam valendo', () => {
    const c = cidadeComVias();
    const antigo = { ...c, vias: { ...c.vias, campos: undefined, semaforos: undefined, arestas: [1, 2, -275, 0, 1, 0, 2, 3, 150, 0, 0, 1] } };
    const g = grafoReal(CidadeReal.parse(antigo), () => 'Rua');
    expect(g.edges.size).toBe(2);
    expect(g.edges.get(1)!.faixas).toBeUndefined();
    expect(g.edges.get(2)!.type).toBe('rua');
  });

  it('largura, calçada e sinalização seguem as faixas; vias do jogador mantêm o tipo', () => {
    const real: RoadEdge = { id: 1, a: 1, b: 2, cx: 0, cz: 0, type: 'avenida', name: 'A', faixas: 4 };
    expect(larguraVia(real)).toBeCloseTo(14.2, 5);
    expect(larguraVia({ ...real, maoUnica: true })).toBeCloseTo(13.4, 5);
    expect(larguraVia({ ...real, faixas: 1, maoUnica: true })).toBe(5);
    expect(calcadaVia(real)).toBe(3.5);
    expect(calcadaVia({ ...real, type: 'rua', faixas: 1 })).toBe(1.6);
    expect(meiaVia(real)).toBeCloseTo(7.1 + 3.5, 5);
    const jogador: RoadEdge = { id: 2, a: 1, b: 2, cx: 0, cz: 0, type: 'rua', name: 'R' };
    expect(larguraVia(jogador)).toBe(8);
    expect(faixasVia(jogador)).toBe(2);
    expect(chaveLeito(jogador)).toBe('rua');
    expect(chaveLeito(real)).toBe('4d');
    expect(chaveLeito({ ...real, maoUnica: true, faixas: 3 })).toBe('3u');
  });

  it('o semáforo tem ciclo de 40 s e os dois eixos nunca abrem juntos', () => {
    for (let t = 0; t < CICLO_SEM * 2; t += 0.5) {
      const a = faseSemaforo(0, t), b = faseSemaforo(1, t);
      expect(a === 0 && b === 0).toBe(false);
      expect(faseSemaforo(0, t + CICLO_SEM)).toBe(a);
    }
    expect(faseSemaforo(0, 0)).toBe(0);
    expect(faseSemaforo(0, 17)).toBe(1);
    expect(faseSemaforo(0, 25)).toBe(2);
    expect(faseSemaforo(1, 25)).toBe(0);
    expect(eixoSemaforo(1, 0.2)).toBe(0);
    expect(eixoSemaforo(-0.1, -1)).toBe(1);
  });

  it('o túnel passa por baixo do morro e o viaduto não afunda no chão', () => {
    const c = cidadeComVias();
    const hm = terrenoReal(c, rj.terreno, 'mata-atlantica', 1);
    const g = grafoReal(c, () => 'Rua');
    const perfis = construirPerfis(g, hm);
    const tunel = perfis.get(2)!, ponte = perfis.get(3)!, chao = perfis.get(1)!;
    // no meio do morro (60 m) o túnel fica bem abaixo do terreno e liga as duas bocas sem degrau
    const meio = tunel.n >> 1;
    const topoMorro = sampleHeight(hm, tunel.x[meio], tunel.z[meio]);
    expect(topoMorro).toBeGreaterThan(40);
    expect(tunel.y[meio]).toBeLessThan(topoMorro - 20);
    expect(Math.abs(tunel.y[0] - chao.y[chao.n - 1])).toBeLessThan(0.01);
    expect(Math.abs(ponte.y[0] - tunel.y[tunel.n - 1])).toBeLessThan(0.01);
    for (let i = 0; i < ponte.n; i++) expect(Number.isFinite(ponte.y[i])).toBe(true);
  });

  it('túneis e viadutos não ganham lotes ao lado', () => {
    const c = cidadeComVias();
    const hm = terrenoReal(c, rj.terreno, 'mata-atlantica', 1);
    const g = grafoReal(c, () => 'Rua');
    const lots = computeLots(g, hm, [], new Int32Array(RASTER_RES * RASTER_RES));
    const arestas = new Set(lots.map((l) => l.edge));
    expect(arestas.has(2)).toBe(false);
    expect(arestas.has(3)).toBe(false);
    expect(arestas.has(1) || arestas.has(4) || arestas.has(5)).toBe(true);
    expect(emptyGraph().edges.size).toBe(0);
  });

  it('o Rio gerado traz faixas, pontes, túneis, semáforos e faixas de pedestre', () => {
    const arq = 'public/data/cidades/3304557.json';
    if (!existsSync(arq)) return;
    const c = CidadeReal.parse(JSON.parse(readFileSync(arq, 'utf8')));
    expect(c.vias.campos).toBe(8);
    const k = 8, n = c.vias.arestas.length / k;
    let tuneis = 0, pontes = 0, mao = 0;
    for (let i = 0; i < n; i++) {
      const faixas = c.vias.arestas[i * k + 6], flags = c.vias.arestas[i * k + 7];
      expect(faixas).toBeGreaterThanOrEqual(1);
      expect(faixas).toBeLessThanOrEqual(8);
      if (flags & 4) tuneis++;
      if (flags & 2) pontes++;
      if (flags & 1) mao++;
    }
    expect(tuneis).toBeGreaterThan(20);
    expect(pontes).toBeGreaterThan(100);
    expect(mao).toBeGreaterThan(n * 0.3);
    expect((c.vias.semaforos ?? []).length).toBeGreaterThan(300);
    expect((c.vias.faixasPed ?? []).length / 3).toBeGreaterThan(100);
  });
});
