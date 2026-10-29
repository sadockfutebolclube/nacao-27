/** Fase 32: encostas — talude em patamares, muro de arrimo em até 3 patamares de 5 m, e morro sobre o asfalto zerado no Rio real. */
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CidadeReal } from '../src/data/cidadeReal';
import { ArquivoTracos } from '../src/data/schemas';
import { MURO_PATAMAR_H, patamaresMuro, perfilTalude, TALUDE_BANQUETA, TALUDE_H_POR_V, TALUDE_LANCE_H, TALUDE_QUEDA_PATAMAR } from '../src/render/city/Vias';
import { grafoReal, terrenoReal } from '../src/world/cidadeReal';
import { Classe, regradeDe } from '../src/world/regrade';
import { edgeEnds, larguraVia, sampleByLength } from '../src/world/roads';
import { sampleHeight } from '../src/world/terrain';

const arq = 'public/data/cidades/3304557.json';
const rio = existsSync(arq) ? CidadeReal.parse(JSON.parse(readFileSync(arq, 'utf8'))) : null;
const rj = ArquivoTracos.parse(JSON.parse(readFileSync('data/ufs/traits.json', 'utf8'))).ufs.find((u) => u.sigla === 'RJ')!;

/** terreno plano `queda` m abaixo do bordo (o talude desce até encontrá-lo) */
const ladeira = (queda: number, y0 = 30) => () => y0 - queda;

describe('talude de aterro em patamares', () => {
  it('queda até 12 m: um plano só, 1 V : 1,5 H', () => {
    const { pts, lances } = perfilTalude(30, 8, ladeira(8));
    expect(lances).toBe(1);
    expect(pts.length).toBe(2);
    const [r0, y0] = pts[0], [r1, y1] = pts[1];
    expect((r1 - r0) / (y0 - y1)).toBeCloseTo(TALUDE_H_POR_V, 0);
    expect(y1).toBeLessThanOrEqual(22.1);
  });

  it('queda acima de 12 m: lances de até ~8 m separados por banquetas planas de 2 m, no máximo 3', () => {
    for (const q of [14, 20, 24, 40]) {
      const { pts, lances } = perfilTalude(50, q, ladeira(q, 50));
      expect(lances, `queda ${q}`).toBeGreaterThanOrEqual(2);
      expect(lances).toBeLessThanOrEqual(3);
      // pontos: topo, pé1, fim da banqueta 1, pé2, [fim banqueta 2, pé3]
      for (let k = 1; k + 1 < pts.length; k += 2) {
        expect(pts[k + 1][1], `banqueta ${k}`).toBeCloseTo(pts[k][1], 6); // plana
        expect(pts[k + 1][0] - pts[k][0]).toBeCloseTo(TALUDE_BANQUETA, 6); // 2 m de largura
      }
      // o pé do último lance toca o terreno
      const yf = pts[pts.length - 1][1];
      expect(yf).toBeLessThanOrEqual(ladeira(q, 50)() + 0.06);
      // cada lance (exceto o último, que leva o que sobra) não passa da fração prevista
      for (let j = 0; j + 1 < pts.length - 2; j += 2) expect(pts[j][1] - pts[j + 1][1]).toBeLessThanOrEqual(Math.max(TALUDE_LANCE_H, q / lances) + 1);
    }
  });

  it('cabe em 70 m de recuo e as cotas só descem do bordo ao pé', () => {
    const { pts } = perfilTalude(80, 40, ladeira(40, 80));
    for (let k = 1; k < pts.length; k++) { expect(pts[k][1]).toBeLessThanOrEqual(pts[k - 1][1] + 1e-9); expect(pts[k][0]).toBeGreaterThanOrEqual(pts[k - 1][0]); }
    expect(pts[pts.length - 1][0]).toBeLessThanOrEqual(75);
    expect(TALUDE_QUEDA_PATAMAR).toBe(12);
  });
});

describe('muro de arrimo em patamares', () => {
  it('nenhuma parede passa de 5 m e há no máximo 3 patamares; o que passa de 15 m vira talude', () => {
    for (const h of [3, 5, 8, 12, 15, 16, 25, 32.6, 98]) {
      const { np, hp, resto } = patamaresMuro(h, h);
      expect(hp, `H ${h}`).toBeLessThanOrEqual(MURO_PATAMAR_H + 1e-9);
      expect(np).toBeLessThanOrEqual(3); expect(np).toBeGreaterThanOrEqual(1);
      expect(np * hp + resto).toBeCloseTo(h, 6);
      if (h <= 15) expect(resto).toBeCloseTo(0, 6); else expect(resto).toBeCloseTo(h - 15, 6);
    }
  });

  it('seções vizinhas de alturas diferentes usam o mesmo número de patamares', () => {
    const a = patamaresMuro(20, 20), b = patamaresMuro(20, 12);
    expect(a.np).toBe(b.np);
    expect(b.hp).toBeLessThanOrEqual(MURO_PATAMAR_H);
  });
});

describe('Rio real: terreno sobre o asfalto', () => {
  it('trechos com morro > 1 m acima da pista: 23 antes, no máximo 2 agora', () => {
    if (!rio) return;
    const hm = terrenoReal(rio, rj.terreno, 'mata-atlantica', 1);
    const g = grafoReal(rio, () => '');
    const reg = regradeDe(hm.h);
    expect(reg).toBeTruthy();
    let acima1 = 0, acima03 = 0;
    for (const e of g.edges.values()) {
      const t = reg!.trechos.get(e.id);
      if (!t || t.nivel) continue;
      const [p0, c, p1] = edgeEnds(g, e);
      const { pts } = sampleByLength(p0, c, p1, 3);
      if (pts.length !== t.y.length) continue;
      const meia = larguraVia(e) / 2;
      let pior = 0;
      for (let i = 0; i < pts.length; i += 2) {
        if (t.classe[i] === Classe.Ponte || t.classe[i] === Classe.Tunel) continue;
        const nx = -pts[i].tz, nz = pts[i].tx;
        const alt = Math.max(sampleHeight(hm, pts[i].x, pts[i].z), sampleHeight(hm, pts[i].x + nx * meia, pts[i].z + nz * meia), sampleHeight(hm, pts[i].x - nx * meia, pts[i].z - nz * meia));
        pior = Math.max(pior, alt - (t.y[i] + 0.02));
      }
      if (pior > 1) acima1++;
      if (pior > 0.3) acima03++;
    }
    expect(acima1).toBeLessThanOrEqual(2);
    expect(acima03).toBeLessThanOrEqual(10); // antes: 57
  }, 180000);
});
