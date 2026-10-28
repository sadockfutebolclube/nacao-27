import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CidadeReal } from '../src/data/cidadeReal';
import { ArquivoTracos } from '../src/data/schemas';
import { construirPerfis } from '../src/render/city/perfilVias';
import { grafoReal, terrenoReal } from '../src/world/cidadeReal';
import { HM_RES, HM_STEP, HM_VERTS } from '../src/world/constants';
import { escavarVias } from '../src/world/escavar';
import { limitarRampa } from '../src/world/relevo';
import { Classe, GRADE_ALVO, GRADE_TETO, regradarVias, regradeDe } from '../src/world/regrade';
import type { RoadGraph } from '../src/world/roads';

/** Relevo plano a 20 m com um acidente ao longo do eixo x (cos², de 0 a `altura` m na largura `largura`), em torno de x = 0. */
function relevoCom(altura: number, largura: number): Float32Array {
  const h = new Float32Array(HM_VERTS * HM_VERTS);
  const half = (HM_RES * HM_STEP) / 2;
  for (let j = 0; j < HM_VERTS; j++) for (let i = 0; i < HM_VERTS; i++) {
    const x = -half + i * HM_STEP;
    h[j * HM_VERTS + i] = 20 + (Math.abs(x) < largura / 2 ? altura * Math.cos((Math.PI * x) / largura) ** 2 : 0);
  }
  return h;
}
const rua = (comp: number): RoadGraph => ({
  nodes: new Map([[1, { id: 1, x: -comp / 2, z: 0 }], [2, { id: 2, x: comp / 2, z: 0 }]]),
  edges: new Map([[1, { id: 1, a: 1, b: 2, cx: 0, cz: 0, type: 'rua' as const, name: 'Rua Teste', faixas: 2 }]]),
  nextNode: 3, nextEdge: 2,
});

describe('Fase 20 — regrade da rede viária', () => {
  it('limitarRampa liga as pontas e respeita a inclinação máxima', () => {
    const s = Float32Array.from({ length: 41 }, (_, i) => i * 3);
    const y = Float32Array.from({ length: 41 }, (_, i) => (i === 20 ? 30 : i === 21 ? -10 : 10)); // espeto e buraco
    limitarRampa(y, s, 0.25);
    expect(y[0]).toBe(10);
    expect(y[40]).toBe(10);
    for (let i = 1; i < y.length; i++) expect(Math.abs(y[i] - y[i - 1]) / 3).toBeLessThanOrEqual(0.2501);
  });

  it('o vale vira ponte: a rampa fica em 25% e o trecho sobre o vale é viaduto (por amostra)', () => {
    const h = relevoCom(-20, 100); // vale de 20 m numa rua de 120 m
    const r = regradarVias(h, rua(120)).trechos.get(1)!;
    expect(r.classe.some((c) => c === Classe.Ponte)).toBe(true);
    expect(r.gradeMax).toBeLessThanOrEqual(GRADE_ALVO + 0.001);
    expect(Math.max(...r.dev)).toBeGreaterThan(5); // a rua anda acima do fundo do vale
  });

  it('o morro alto vira túnel; o morro baixo vira corte com muro de arrimo', () => {
    const alto = regradarVias(relevoCom(60, 140), rua(120)).trechos.get(1)!;
    expect(alto.classe.some((c) => c === Classe.Tunel)).toBe(true);
    const baixo = regradarVias(relevoCom(14, 70), rua(120)).trechos.get(1)!;
    expect(baixo.nivel).toBe(0);
    expect(baixo.classe.some((c) => c === Classe.Muro)).toBe(true);
  });

  it('a rampa que o morro pede é mudada: nós com 80 m de desnível em 100 m sobem no máximo 25%', () => {
    const h = new Float32Array(HM_VERTS * HM_VERTS);
    const half = (HM_RES * HM_STEP) / 2;
    for (let j = 0; j < HM_VERTS; j++) for (let i = 0; i < HM_VERTS; i++) h[j * HM_VERTS + i] = 20 + Math.max(0, (-half + i * HM_STEP + 50)) * 0.8; // encosta de 80%
    const g = rua(100);
    const reg = regradarVias(h, g);
    expect(Math.abs(reg.nos.get(1)! - reg.nos.get(2)!)).toBeLessThanOrEqual(GRADE_ALVO * 100 + 0.1);
    expect(reg.resumo.acima30).toBe(0);
  });

  it('o túnel do regrade não escava o morro por cima e o regrade fica registrado', () => {
    const h = relevoCom(60, 140);
    const antes = Float32Array.from(h);
    escavarVias(h, rua(120));
    const meio = (HM_RES / 2) * HM_VERTS + HM_RES / 2; // x = 0, z = 0: o topo do morro, sobre o túnel
    expect(h[meio]).toBe(antes[meio]);
    expect(regradeDe(h)?.trechos.get(1)?.classe.some((c) => c === Classe.Tunel)).toBe(true);
  });
});

describe('Fase 20 — o Rio depois do regrade', () => {
  const arq = 'public/data/cidades/3304557.json';
  const tracos = ArquivoTracos.parse(JSON.parse(readFileSync('data/ufs/traits.json', 'utf8')));
  const rj = tracos.ufs.find((u) => u.sigla === 'RJ')!;
  const rio = existsSync(arq) ? CidadeReal.parse(JSON.parse(readFileSync(arq, 'utf8'))) : null;

  it('nenhuma rua passa de 30% de rampa (alvo 25%) e há ponte, túnel e muro onde o morro pede', () => {
    if (!rio) return;
    const hm = terrenoReal(rio, rj.terreno, 'mata-atlantica', 1);
    const r = regradeDe(hm.h)!.resumo;
    expect(r.gradeMax).toBeLessThanOrEqual(GRADE_TETO);
    expect(r.acima30).toBe(0);
    expect(r.pontes).toBeGreaterThan(0);
    expect(r.tuneis).toBeGreaterThan(0);
    expect(r.trechosComMuro).toBeGreaterThan(0);
    const perfis = construirPerfis(grafoReal(rio, () => ''), hm);
    let maior = 0;
    for (const p of perfis.values()) if (!p.nivel || p.classe) for (let i = 1; i < p.n; i++) maior = Math.max(maior, Math.abs(p.y[i] - p.y[i - 1]) / Math.max(0.5, p.s[i] - p.s[i - 1]));
    expect(maior).toBeLessThanOrEqual(GRADE_TETO);
  }, 120000);

  it('o relevo é de ~10,7 m e as escadarias e trilhas do OSM chegam ao jogo', () => {
    if (!rio) return;
    expect(rio.res).toBe(HM_RES + 1);
    expect(rio.passo).toBeCloseTo(HM_STEP, 3);
    const cam = rio.caminhos ?? [];
    expect(cam.length).toBeGreaterThan(300);
    const n = [0, 0, 0, 0, 0, 0];
    for (let o = 0; o < cam.length; o += 3 + cam[o + 2] * 2) { n[cam[o]]++; expect(cam[o + 2]).toBeGreaterThanOrEqual(2); }
    expect(n[0]).toBeGreaterThan(10); // escadas
    expect(n[2] + n[1]).toBeGreaterThan(10); // trilhas e calçadas
  });

  it('minirrotatórias: junction=circular com raio de 4 m ou mais; o resto segue descartado', () => {
    if (!rio) return;
    const mini = rio.vias.minirrotatorias ?? [];
    expect(mini.length / 3).toBeGreaterThan(0);
    for (let k = 0; k < mini.length; k += 3) expect(mini[k + 2]).toBeGreaterThanOrEqual(4);
    const grandes = rio.vias.rotatorias ?? [];
    for (let k = 0; k < grandes.length; k += 3) { expect(grandes[k + 2]).toBeGreaterThanOrEqual(8); expect(grandes[k + 2]).toBeLessThanOrEqual(40); }
    for (const d of rio.vias.rotatoriasDescartadas ?? []) expect(d.motivo).not.toMatch(/junction=circular não é rotatória/);
  });
});
