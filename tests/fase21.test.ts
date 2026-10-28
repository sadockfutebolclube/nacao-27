import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import orla from '../src/data/orla.json';
import { CAMPOS_PREDIO, CidadeReal } from '../src/data/cidadeReal';
import { debugMapa, diagnosticarVias } from '../src/render/city/estadoDebug';
import { texturaSplat } from '../src/render/city/Terreno';
import { HM_RES, HM_STEP, HM_VERTS, MAP_SIZE } from '../src/world/constants';
import { larguraVia } from '../src/world/roads';
import type { Heightmap } from '../src/world/terrain';

const arq = 'public/data/cidades/3304557.json';
const rio = existsSync(arq) ? CidadeReal.parse(JSON.parse(readFileSync(arq, 'utf8'))) : null;

/** Relevo plano de teste, com uma encosta de 45° no quarto leste e mata nos vértices da faixa norte. */
function relevoDeTeste(): Heightmap {
  const h = new Float32Array(HM_VERTS * HM_VERTS), forest = new Uint8Array(HM_VERTS * HM_VERTS);
  for (let j = 0; j < HM_VERTS; j++) for (let i = 0; i < HM_VERTS; i++) {
    h[j * HM_VERTS + i] = 20 + (i > 1200 ? (i - 1200) * HM_STEP : 0); // 45°: 1 m de altura por metro
    if (j < 200) forest[j * HM_VERTS + i] = 255;
  }
  return { h, forest, waterDist: new Float32Array(h.length).fill(2000), bioma: 'mata-atlantica', terreno: {} as never, seed: 1 };
}
const celula = (x: number, z: number) => Math.round((z + MAP_SIZE / 2) / HM_STEP) * HM_VERTS + Math.round((x + MAP_SIZE / 2) / HM_STEP);

describe('Fase 21 — chão em 4 camadas', () => {
  const hm = relevoDeTeste();
  // um quarteirão denso de prédios no centro do mapa: 40 × 40 m cobertos por prédios de 12 × 20 m
  const predios: number[] = [];
  for (let x = -20; x <= 20; x += 13) for (let z = -20; z <= 20; z += 21) predios.push(x, z, 0, 12, 20, 2, 0, 1, -1);
  const dados = texturaSplat(hm, predios).image.data as Uint8Array;
  const peso = (x: number, z: number) => { const o = celula(x, z) * 4; return { terra: dados[o], grama: dados[o + 1], mato: dados[o + 2], rocha: dados[o + 3] }; };

  it('rocha exposta onde a encosta passa de 35° (45° = rocha inteira)', () => {
    const w = peso(MAP_SIZE / 2 - 400, 100);
    expect(w.rocha).toBeGreaterThan(240);
  });
  it('mata densa vira mato; plano sem mata nem prédio vira grama', () => {
    expect(peso(-3000, -MAP_SIZE / 2 + 60).mato).toBeGreaterThan(220); // faixa norte: forest = 255
    const g = peso(-3000, 3000);
    expect(g.grama).toBeGreaterThan(200);
    expect(g.rocha).toBe(0);
  });
  it('onde há gente, o solo é terra batida', () => {
    expect(peso(0, 0).terra).toBeGreaterThan(200);
  });
  it('os pesos de cada texel somam ~255', () => {
    for (const [x, z] of [[0, 0], [-3000, 3000], [MAP_SIZE / 2 - 400, 100], [-3000, -MAP_SIZE / 2 + 60]] as const) {
      const w = peso(x, z);
      expect(Math.abs(w.terra + w.grama + w.mato + w.rocha - 255)).toBeLessThanOrEqual(3);
    }
  });
  it('o relevo do jogo continua com 1.536 células (a grade do splat é a do relevo)', () => {
    expect(HM_RES).toBe(1536);
  });
});

describe('Fase 21 — calçadão só na orla', () => {
  it('a lista de ruas com pedra portuguesa é uma lista curta e nominal (nada de "toda avenida")', () => {
    expect(orla.ruas).toContain('Avenida Atlântica');
    expect(orla.ruas).toContain('Avenida Vieira Souto');
    expect(orla.ruas.length).toBeLessThan(20);
    for (const r of orla.ruas) expect(r).toMatch(/^(Avenida|Rua|Estrada)\s/);
  });
});

describe('Fase 21 — vias soltas e prédios sobre a pista', () => {
  it('o gerador registra o que tirou (vias soltas, prédios deslocados e removidos)', () => {
    if (!rio) return;
    const r = rio.removidos;
    expect(r).toBeDefined();
    for (const v of r!.vias) { expect(v.motivo).toMatch(/sem ligação/); expect(Math.abs(v.x)).toBeLessThan(6144); }
    expect(r!.prediosDeslocados ?? 0).toBeGreaterThan(100);
    expect(r!.prediosSobreVias).toBeLessThan((r!.prediosDeslocados ?? 0) + 1);
  });

  it('quase nenhum prédio sobra com a pista passando pelo seu retângulo (a menos de 30% da meia largura do eixo)', () => {
    if (!rio) return;
    const { nos, arestas } = rio.vias, K = rio.vias.campos ?? 8;
    const cel = new Map<string, { x: number; z: number; hw: number }[]>();
    for (let i = 0; i < arestas.length / K; i++) {
      const o = i * K, fl = arestas[o + 7];
      if (fl & 6) continue;
      const a = arestas[o] - 1, b = arestas[o + 1] - 1, cx = arestas[o + 2], cz = arestas[o + 3];
      const hw = larguraVia({ type: arestas[o + 4] === 1 ? 'avenida' : 'rua', faixas: arestas[o + 6], maoUnica: !!(fl & 1) }) / 2;
      const ax = nos[a * 2], az = nos[a * 2 + 1], bx = nos[b * 2], bz = nos[b * 2 + 1];
      const n = Math.max(2, Math.ceil(Math.hypot(bx - ax, bz - az) / 5));
      for (let s = 0; s <= n; s++) {
        const t = s / n, u = 1 - t, x = u * u * ax + 2 * u * t * cx + t * t * bx, z = u * u * az + 2 * u * t * cz + t * t * bz;
        const k = `${Math.floor(x / 40)},${Math.floor(z / 40)}`;
        (cel.get(k) ?? cel.set(k, []).get(k)!).push({ x, z, hw });
      }
    }
    const p = rio.predios, n = p.length / CAMPOS_PREDIO;
    let invade = 0;
    for (let i = 0; i < n; i++) {
      const o = i * CAMPOS_PREDIO, x = p[o], z = p[o + 1], a = p[o + 2] / 1000, w = p[o + 3], d = p[o + 4];
      const cu = Math.cos(a), su = Math.sin(a), rc = Math.ceil((Math.max(w, d) / 2 + 24) / 40);
      let dentro = false;
      for (let dx = -rc; dx <= rc && !dentro; dx++) for (let dz = -rc; dz <= rc && !dentro; dz++) for (const s of cel.get(`${Math.floor(x / 40) + dx},${Math.floor(z / 40) + dz}`) ?? []) {
        const ddx = s.x - x, ddz = s.z - z, u = ddx * cu - ddz * su, v = ddx * su + ddz * cu;
        if (Math.hypot(Math.max(Math.abs(u) - w / 2, 0), Math.max(Math.abs(v) - d / 2, 0)) < s.hw * 0.3 - 0.01) { dentro = true; break; }
      }
      if (dentro) invade++;
    }
    expect(invade / n).toBeLessThan(0.005);
  }, 120000);
});

describe('Fase 21 — painel F3 por categoria', () => {
  it('as contagens de vias soltas, prédios e minirrotatórias chegam ao painel', () => {
    const lista = diagnosticarVias(new Map(), { h: new Float32Array(4) } as never, [], {
      vias: [{ nome: 'Rua A', motivo: 'ponte sem ligação', x: 10, z: 20 }], prediosSobreVias: 2, prediosDeslocados: 5, prediosPos: [1, 2, 3, 4],
    }, 8);
    const c = debugMapa.ler().contagem;
    expect([c.solta, c.predioRemovido, c.predioDeslocado, c.minirrotatoria]).toEqual([1, 2, 5, 8]);
    expect(lista.filter((p) => p.tipo === 'predio')).toHaveLength(2);
    expect(lista.find((p) => p.tipo === 'solta')?.detalhe).toMatch(/removida/);
  });
});
