import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CidadeReal } from '../src/data/cidadeReal';
import { ArquivoTracos } from '../src/data/schemas';
import { construirPerfis } from '../src/render/city/perfilVias';
import { grafoReal, terrenoReal } from '../src/world/cidadeReal';
import { HM_RES, HM_STEP, HM_VERTS } from '../src/world/constants';
import { escavarVias } from '../src/world/escavar';
import { limitarInclinacao, removerOutliers, suavizarGaussiano, suavizarPerfil } from '../src/world/relevo';
import { calcadaVia, larguraVia } from '../src/world/roads';
import { sampleHeight } from '../src/world/terrain';

const arq = 'public/data/cidades/3304557.json';
const N = 64;
const plano = (v: number) => new Float32Array(N * N).fill(v);
const terraTodo = () => new Uint8Array(N * N).fill(1);

describe('Fase 19 — filtros do relevo', () => {
  it('o filtro de outliers tira o espeto e deixa a rampa em paz', () => {
    const h = plano(20);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) h[j * N + i] = 20 + i * 2; // rampa de 2 m por célula
    h[30 * N + 30] += 90; // espeto
    const trocados = removerOutliers(h, N, terraTodo());
    expect(trocados).toBe(1);
    expect(Math.abs(h[30 * N + 30] - (20 + 30 * 2))).toBeLessThan(3);
    expect(h[10 * N + 40]).toBe(20 + 40 * 2);
  });

  it('a gaussiana alisa a terra mas nunca mistura água na costa', () => {
    const h = plano(30);
    const terra = terraTodo();
    for (let j = 0; j < N; j++) for (let i = 0; i < 20; i++) { h[j * N + i] = 0; terra[j * N + i] = 0; } // mar à esquerda
    h[30 * N + 40] = 80;
    suavizarGaussiano(h, N, terra, 1.5);
    expect(h[30 * N + 40]).toBeLessThan(60);
    expect(h[30 * N + 5]).toBe(0); // água intacta
    expect(h[30 * N + 21]).toBeGreaterThan(29); // a terra da beira não escorreu para 0
  });

  it('o limite de inclinação aplaina o paredão e não mexe na água', () => {
    const h = plano(5);
    const terra = terraTodo();
    for (let j = 0; j < N; j++) for (let i = 0; i < 4; i++) { h[j * N + i] = -3; terra[j * N + i] = 0; } // mar
    for (let j = 0; j < N; j++) for (let i = 4; i < N; i++) h[j * N + i] = i >= 20 ? 190 : 5; // degrau de 185 m
    const { ajustados } = limitarInclinacao(h, N, HM_STEP, 1.2, terra, 400);
    expect(ajustados).toBeGreaterThan(10);
    let maior = 0;
    for (let j = 0; j < N; j++) for (let i = 1; i < N; i++) maior = Math.max(maior, Math.abs(h[j * N + i] - h[j * N + i - 1]) / HM_STEP);
    expect(maior).toBeLessThan(1.25);
    expect(h[10 * N + 1]).toBe(-3);
  });

  it('o perfil da via é suave, liga as pontas, respeita a rampa e nunca foge do terreno além do desvio máximo', () => {
    const bruto = Float32Array.from({ length: 60 }, (_, i) => 10 + (i % 2 ? 3 : 0) + (i >= 28 && i <= 31 ? 12 : 0)); // serrote + calombo de 12 m
    const y = suavizarPerfil(bruto, 3, 6, 0.16, 100);
    expect(y[0]).toBe(bruto[0]);
    expect(y[59]).toBe(bruto[59]);
    let maior = 0;
    for (let i = 1; i < y.length; i++) maior = Math.max(maior, Math.abs(y[i] - y[i - 1]) / 3);
    expect(maior).toBeLessThan(0.17);
    expect(Math.max(...y)).toBeLessThan(18); // o calombo foi aparado
    // com o desvio máximo padrão (4 m) o perfil fica colado no terreno
    const colado = suavizarPerfil(bruto, 3);
    for (let i = 1; i < colado.length - 1; i++) expect(Math.abs(colado[i] - bruto[i])).toBeLessThanOrEqual(4.0001);
  });
});

describe('Fase 19 — terraplenagem das vias', () => {
  it('o terreno acompanha a rua: o morro não cobre o asfalto nem sobra vão embaixo', () => {
    // encosta de 30% de inclinação cruzada com uma rua reta no meio, no mapa inteiro do jogo
    const h = new Float32Array(HM_VERTS * HM_VERTS);
    for (let j = 0; j < HM_VERTS; j++) for (let i = 0; i < HM_VERTS; i++) h[j * HM_VERTS + i] = 20 + (j - HM_RES / 2) * HM_STEP * 0.3;
    const g = { nodes: new Map([[1, { id: 1, x: -300, z: 0 }], [2, { id: 2, x: 300, z: 0 }]]), edges: new Map([[1, { id: 1, a: 1, b: 2, cx: 0, cz: 0, type: 'rua' as const, name: 'Rua Teste', faixas: 2 }]]), nextNode: 3, nextEdge: 2 };
    const antes = Float32Array.from(h);
    const resumo = escavarVias(h, g);
    expect(resumo.celulas).toBeGreaterThan(50);
    const hm = { h } as never, hm0 = { h: antes } as never;
    const e = g.edges.get(1)!;
    const meia = larguraVia(e) / 2 + calcadaVia(e);
    const eixo = sampleHeight(hm, 0, 0);
    // as bordas da calçada ficam a poucos centímetros do eixo (antes: ±0,3 × meia largura = mais de 1,5 m de diferença)
    const dAntes = Math.abs(sampleHeight(hm0, 0, meia) - sampleHeight(hm0, 0, -meia));
    const dDepois = Math.abs(sampleHeight(hm, 0, meia) - sampleHeight(hm, 0, -meia));
    expect(dAntes).toBeGreaterThan(2);
    expect(dDepois).toBeLessThan(dAntes / 3);
    expect(Math.abs(sampleHeight(hm, 0, meia) - eixo)).toBeLessThan(1);
    // longe da rua nada muda
    expect(sampleHeight(hm, 0, 400)).toBeCloseTo(sampleHeight(hm0, 0, 400), 3);
  });

  it('pontes, túneis e água ficam como estão', () => {
    const h = new Float32Array(HM_VERTS * HM_VERTS).fill(30);
    const g = { nodes: new Map([[1, { id: 1, x: -200, z: 0 }], [2, { id: 2, x: 200, z: 0 }]]), edges: new Map([[1, { id: 1, a: 1, b: 2, cx: 0, cz: 0, type: 'rua' as const, name: 'Túnel', faixas: 2, nivel: -1 as const }]]), nextNode: 3, nextEdge: 2 };
    expect(escavarVias(h, g).celulas).toBe(0);
    expect(h.every((v) => v === 30)).toBe(true);
  });
});

describe('Fase 19 — o Rio depois da auditoria', () => {
  const tracos = ArquivoTracos.parse(JSON.parse(readFileSync('data/ufs/traits.json', 'utf8')));
  const rj = tracos.ufs.find((u) => u.sigla === 'RJ')!;
  const rio = existsSync(arq) ? CidadeReal.parse(JSON.parse(readFileSync(arq, 'utf8'))) : null;

  it('o relevo não tem paredões nem espetos', () => {
    if (!rio) return;
    const hm = terrenoReal(rio, rj.terreno, 'mata-atlantica', 1);
    const h = hm.h;
    let maxIncl = 0, espetos = 0;
    for (let j = 1; j < HM_RES; j++) for (let i = 1; i < HM_RES; i++) {
      const k = j * HM_VERTS + i;
      if (h[k] < 1) continue;
      const viz = [h[k - 1], h[k + 1], h[k - HM_VERTS], h[k + HM_VERTS], h[k - HM_VERTS - 1], h[k - HM_VERTS + 1], h[k + HM_VERTS - 1], h[k + HM_VERTS + 1]].sort((a, b) => a - b);
      if (Math.abs(h[k] - (viz[3] + viz[4]) / 2) > 8) espetos++;
      maxIncl = Math.max(maxIncl, Math.hypot((h[k + 1] - h[k - 1]) / (2 * HM_STEP), (h[k + HM_VERTS] - h[k - HM_VERTS]) / (2 * HM_STEP)));
    }
    expect(maxIncl).toBeLessThan(6); // eixos limitados a 1,2 (1,4 nos picos); os cortes de muro de arrimo (Fase 20) são degraus de até ~4,5
    expect(espetos).toBeLessThan(450); // antes da Fase 19: 2.559, com desvios de até 178 m (grade de 16 m; hoje 10,7 m)
  }, 60000);

  it('as ruas não ficam com o morro sobre a pista nem com vão grande embaixo (fora ponte, túnel e muro)', () => {
    if (!rio) return;
    const hm = terrenoReal(rio, rj.terreno, 'mata-atlantica', 1);
    const perfis = construirPerfis(grafoReal(rio, () => ''), hm);
    let secoes = 0, cobre = 0, vao = 0;
    for (const p of perfis.values()) {
      if (p.nivel) continue;
      const hw = larguraVia(p.edge) / 2;
      for (let i = 0; i < p.n; i += 2) {
        if (p.classe && p.classe[i] >= 1) continue;
        secoes++;
        const nx = -p.tz[i], nz = p.tx[i];
        const t0 = sampleHeight(hm, p.x[i], p.z[i]), t1 = sampleHeight(hm, p.x[i] + nx * hw, p.z[i] + nz * hw), t2 = sampleHeight(hm, p.x[i] - nx * hw, p.z[i] - nz * hw);
        if (Math.max(t0, t1, t2) - (p.y[i] + 0.02) > 1.5) cobre++;
        if (p.y[i] > 3 && p.y[i] - Math.min(t0, t1, t2) > 3) vao++;
      }
    }
    expect(cobre / secoes).toBeLessThan(0.005);
    expect(vao / secoes).toBeLessThan(0.08); // desde a Fase 20 o terreno desce sob o asfalto (até 4 m) e a lateral da pista fecha o vão até o chão
  }, 120000);

  it('só há rotatória onde o OSM diz roundabout: círculo fechado de 8 a 40 m; o resto fica registrado', () => {
    if (!rio) return;
    const r = rio.vias.rotatorias ?? [];
    expect(r.length % 3).toBe(0);
    expect(r.length / 3).toBeGreaterThan(0);
    for (let k = 0; k < r.length; k += 3) {
      expect(r[k + 2]).toBeGreaterThanOrEqual(8);
      expect(r[k + 2]).toBeLessThanOrEqual(40);
    }
    // o que não serve é registrado com o motivo (desde a Fase 20 o junction=circular vira minirrotatória, então pode não sobrar nada)
    for (const x of rio.vias.rotatoriasDescartadas ?? []) expect(x.motivo.length).toBeGreaterThan(3);
  });

  it('a fonte do relevo está registrada em data/SOURCES.md', () => {
    const s = readFileSync('data/SOURCES.md', 'utf8');
    expect(s).toMatch(/copernicus-dem-30m/);
    expect(s).toMatch(/28\/10\/2026/);
  });
});
