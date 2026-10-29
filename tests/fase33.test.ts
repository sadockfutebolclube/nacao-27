/** Fase 33: defeitos das vias — aterro no relevo (talude 1:1,5), saneamento da malha, base maciça sob prédio em encosta e o relatório do detector. */
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CidadeReal } from '../src/data/cidadeReal';
import { ArquivoTracos } from '../src/data/schemas';
import { LASCA_AREA_MIN, LASCA_ASPECTO_MAX, sanearMalha, TALUDE_H_POR_V as TALUDE_VIAS } from '../src/render/city/Vias';
import { construirPerfis } from '../src/render/city/perfilVias';
import { grafoReal, terrenoReal } from '../src/world/cidadeReal';
import { HM_STEP, HM_VERTS } from '../src/world/constants';
import { DESNIVEL_MAX, plintoDoLote } from '../src/world/lots';
import { regradeDe, TALUDE_H_POR_V } from '../src/world/regrade';
import type { Heightmap } from '../src/world/terrain';

const arq = 'public/data/cidades/3304557.json';
const rio = existsSync(arq) ? CidadeReal.parse(JSON.parse(readFileSync(arq, 'utf8'))) : null;
const rj = ArquivoTracos.parse(JSON.parse(readFileSync('data/ufs/traits.json', 'utf8'))).ufs.find((u) => u.sigla === 'RJ')!;

describe('saneamento da malha de talude e muro', () => {
  const buf = (pos: number[], nor: number[], idx: number[]) => ({ pos, nor, uv: [] as number[], idx });

  it('tira a lasca (área < 0,5 m² ou aspecto > 15) e mantém o painel bom', () => {
    // painel de 3 × 3 m (2 triângulos de 4,5 m²) + lasca de 20 m × 0,05 m
    const pos = [0, 0, 0, 3, 0, 0, 0, 0, 3, 3, 0, 3, 10, 0, 10, 30, 0, 10, 10, 0, 10.05];
    const nor = Array.from({ length: 7 }, () => [0, 1, 0]).flat();
    const b = buf(pos, nor, [0, 2, 1, 1, 2, 3, 4, 5, 6]);
    const r = sanearMalha(b);
    expect(r.lascas).toBe(1);
    expect(b.idx.length).toBe(6);
    expect(LASCA_AREA_MIN).toBe(0.5); expect(LASCA_ASPECTO_MAX).toBe(15);
  });

  it('vira o enrolamento de quem está contra a normal gravada e deixa o resto igual', () => {
    const pos = [0, 0, 0, 3, 0, 0, 0, 0, 3];
    const nor = [0, 1, 0, 0, 1, 0, 0, 1, 0];
    // (0,1,2): u = (3,0,0), v = (0,0,3) → u × v = (0, −9, 0): para baixo → vira
    const b = buf(pos, nor, [0, 1, 2]);
    expect(sanearMalha(b)).toEqual({ lascas: 0, viradas: 1 });
    expect(b.idx).toEqual([0, 2, 1]);
    const c = buf(pos, nor, [0, 2, 1]);
    expect(sanearMalha(c)).toEqual({ lascas: 0, viradas: 0 });
    expect(c.idx).toEqual([0, 2, 1]);
  });
});

describe('prédio em encosta: base maciça, planta nunca inclinada', () => {
  it('desnível máximo de 3 m e talude de 1 V : 1,5 H são os valores pedidos', () => {
    expect(DESNIVEL_MAX).toBe(3);
    expect(TALUDE_H_POR_V).toBe(1.5);
    expect(TALUDE_VIAS).toBe(TALUDE_H_POR_V);
  });

  it('a base maciça vai da cota da base até o ponto mais baixo sob a planta', () => {
    // plano que sobe 20% para leste: uma planta de 10 m em x tem 2 m de desnível
    const h = new Float32Array(HM_VERTS * HM_VERTS);
    for (let j = 0; j < HM_VERTS; j++) for (let i = 0; i < HM_VERTS; i++) h[j * HM_VERTS + i] = 5 + i * HM_STEP * 0.2;
    const hm = { h } as unknown as Heightmap;
    const x = 100, z = 100, maxCota = 5 + ((x + 8192) / HM_STEP) * HM_STEP * 0.2 + 1; // cota do canto mais alto
    const plinto = plintoDoLote(hm, x, z, 0, 10, 10, maxCota);
    expect(plinto).toBeGreaterThan(1.8); expect(plinto).toBeLessThan(2.3);
    expect(plintoDoLote(hm, x, z, 0, 10, 10, maxCota - 2)).toBeCloseTo(0, 0); // base já na cota mais baixa: nada a preencher
  });
});

describe('Rio real: aterro no relevo e nós', () => {
  it('o terreno ganha aterro em torno das ruas acima do chão e os trechos de um nó partem da mesma cota', () => {
    if (!rio) return;
    const hm = terrenoReal(rio, rj.terreno, 'mata-atlantica', 1);
    const reg = regradeDe(hm.h)!;
    expect(reg.aterro).toBeTruthy();
    expect(reg.aterro!.celulas).toBeGreaterThan(50_000);
    expect(reg.aterro!.maxAltura).toBeLessThanOrEqual(60 + 1e-3);
    const g = grafoReal(rio, () => '');
    const perfis = construirPerfis(g, hm);
    const emNo = new Map<number, number[]>();
    for (const p of perfis.values()) for (const [id, i] of [[p.edge.a, 0], [p.edge.b, p.n - 1]] as const) (emNo.get(id) ?? emNo.set(id, []).get(id)!).push(p.y[i]);
    let saltos = 0;
    for (const ys of emNo.values()) if (ys.length >= 2 && Math.max(...ys) - Math.min(...ys) > 1.5) saltos++;
    expect(saltos).toBe(0);
  }, 180000);
});

describe('relatório do detector (docs/auditoria-vias)', () => {
  const ler = (n: string) => (existsSync(`docs/auditoria-vias/${n}.json`) ? JSON.parse(readFileSync(`docs/auditoria-vias/${n}.json`, 'utf8')) as { contagem: Record<string, number>; universo: { props: number }; piores_30: unknown[] } : null);

  it('depois: lascas, normais invertidas, saltos de nó e prédios inclinados = 0; postes fora < 1%; 30 piores listados', () => {
    const d = ler('depois');
    expect(d).toBeTruthy();
    expect(d!.contagem.lascas).toBe(0);
    expect(d!.contagem.normaisInvertidas).toBe(0);
    expect(d!.contagem.saltosNoNo).toBe(0);
    expect(d!.contagem.prediosInclinados).toBe(0);
    expect(d!.contagem.propsForaDaSuperficie / d!.universo.props).toBeLessThan(0.01);
    expect(d!.piores_30.length).toBe(30);
  });

  it('antes: o mesmo detector achava lascas, normais invertidas e taludes sobrepostos no código anterior', () => {
    const a = ler('antes'), d = ler('depois');
    expect(a).toBeTruthy();
    expect(a!.contagem.lascas).toBeGreaterThan(1000);
    expect(a!.contagem.normaisInvertidas).toBeGreaterThan(1000);
    expect(a!.contagem.taludesSobrepostos).toBeGreaterThan(10 * d!.contagem.taludesSobrepostos);
  });
});
