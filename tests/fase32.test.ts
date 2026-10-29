/** Fase 32: encostas — muro de arrimo em até 3 patamares de 5 m e morro sobre o asfalto no Rio real. (O talude em patamares da primeira versão virou relevo na Fase 33: ver tests/fase33.test.ts.) */
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CidadeReal } from '../src/data/cidadeReal';
import { ArquivoTracos } from '../src/data/schemas';
import { MURO_PATAMAR_H, patamaresMuro } from '../src/render/city/Vias';
import { grafoReal, terrenoReal } from '../src/world/cidadeReal';
import { Classe, regradeDe } from '../src/world/regrade';
import { edgeEnds, larguraVia, sampleByLength } from '../src/world/roads';
import { sampleHeight } from '../src/world/terrain';

const arq = 'public/data/cidades/3304557.json';
const rio = existsSync(arq) ? CidadeReal.parse(JSON.parse(readFileSync(arq, 'utf8'))) : null;
const rj = ArquivoTracos.parse(JSON.parse(readFileSync('data/ufs/traits.json', 'utf8'))).ufs.find((u) => u.sigla === 'RJ')!;

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
