/** Fase 28: São Januário / Vasco da Gama (geometria do OSM) e continuação da 1B (rua de morro, falésia, talude). */
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PONTOS } from '../src/world/turismo';
import { CidadeReal } from '../src/data/cidadeReal';
import { ArquivoTracos } from '../src/data/schemas';
import { projetar } from '../src/world/cidadeReal';
import { caixaOrientada, dentroDoPoligono, FICHA_SJ, geometriaSaoJanuario, LATLON_SJ } from '../src/world/saoJanuario';
import { FALESIA_DEGRAU, FALESIA_RAIO, GRADE_ALVO, GRADE_MORRO, GRADE_TETO } from '../src/world/regrade';
import { TALUDE_H_POR_V, TALUDE_MIN_QUEDA } from '../src/render/city/Vias';
import { prediosOcultos } from '../src/render/city/pontosRio';
import { CAMPOS_PREDIO } from '../src/data/cidadeReal';
import { grafoReal, terrenoReal } from '../src/world/cidadeReal';
import { regradarVias } from '../src/world/regrade';

const arq = 'public/data/cidades/3304557.json';
const rio = existsSync(arq) ? CidadeReal.parse(JSON.parse(readFileSync(arq, 'utf8'))) : null;
const rj = ArquivoTracos.parse(JSON.parse(readFileSync('data/ufs/traits.json', 'utf8'))).ufs.find((u) => u.sigla === 'RJ')!;

describe('Estádio de São Januário (OpenStreetMap)', () => {
  const proj = (la: number, lo: number): [number, number] => (rio ? projetar(rio, la, lo) : [(lo + 43.195) * 102_550, -(la + 22.945) * 110_574]);
  const G = geometriaSaoJanuario(proj);

  it('o contorno tem ~100–120 × 190–200 m (como o estádio real), eixo longo definido e 61 vértices', () => {
    expect(G.contorno.length).toBe(61);
    expect(G.compr).toBeGreaterThan(180); expect(G.compr).toBeLessThan(215);
    expect(G.larg).toBeGreaterThan(90); expect(G.larg).toBeLessThan(135);
    expect(G.compr).toBeGreaterThan(G.larg);
  });

  it('o gramado de 105 × 68 m cabe dentro do contorno com folga para as arquibancadas', () => {
    expect(G.compr).toBeGreaterThan(105 + 2 * 15);
    expect(G.larg).toBeGreaterThan(68 + 2 * 12);
    const s = Math.sin(G.eixo), c = Math.cos(G.eixo);
    for (const [su, sv] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const x = G.centro[0] + su * 52.5 * s + sv * 34 * c, z = G.centro[1] + su * 52.5 * c - sv * 34 * s;
      expect(dentroDoPoligono(x, z, G.contorno)).toBe(true);
    }
    expect(dentroDoPoligono(G.centro[0] + 400, G.centro[1], G.contorno)).toBe(false);
  });

  it('há campo de treino, campo auxiliar e quadra, e a caixa orientada é mínima (área ≤ caixa alinhada aos eixos)', () => {
    expect(G.treino.length).toBe(3);
    const xs = G.contorno.map((p) => p[0]), zs = G.contorno.map((p) => p[1]);
    const alinhada = (Math.max(...xs) - Math.min(...xs)) * (Math.max(...zs) - Math.min(...zs));
    expect(G.compr * G.larg).toBeLessThanOrEqual(alinhada + 1);
    const q = caixaOrientada([[0, 0], [10, 0], [10, 4], [0, 4]]);
    expect(q.compr).toBeCloseTo(10, 5); expect(q.larg).toBeCloseTo(4, 5);
  });

  it('o ponto turístico "Estádio de São Januário" está na ficha, no centro do contorno, com dados de 1927', () => {
    const m = PONTOS.find((x) => x.chave === 'sao-januario');
    expect(m).toBeTruthy();
    const [mx, mz] = proj(m!.lat!, m!.lon!);
    expect(Math.hypot(mx - G.centro[0], mz - G.centro[1])).toBeLessThan(120);
    expect(Math.abs(LATLON_SJ[0] - m!.lat!)).toBeLessThan(0.002);
    expect(m!.historia).toMatch(/1927/);
    expect(FICHA_SJ.capacidade).toBeGreaterThan(20000);
  });

  it('nenhum prédio do OSM com o centro dentro do estádio continua desenhado', () => {
    if (!rio) return;
    const ocultos = prediosOcultos(rio);
    for (let i = 0; i < rio.predios.length / CAMPOS_PREDIO; i++) {
      const o = i * CAMPOS_PREDIO;
      if (dentroDoPoligono(rio.predios[o], rio.predios[o + 1], G.contorno)) expect(ocultos.has(i)).toBe(true);
    }
  });
});

describe('1B (continuação): falésia, rua de morro e talude', () => {
  it('constantes coerentes: rua de morro 40% > teto 30% > alvo 25%; talude 1 V : 1,5 H', () => {
    expect(GRADE_ALVO).toBeLessThan(GRADE_TETO); expect(GRADE_TETO).toBeLessThan(GRADE_MORRO);
    expect(TALUDE_H_POR_V).toBe(1.5); expect(TALUDE_MIN_QUEDA).toBeGreaterThan(2);
    expect(FALESIA_RAIO).toBeGreaterThan(14); expect(FALESIA_DEGRAU).toBeGreaterThanOrEqual(40);
  });

  it('no Rio: ruas de morro existem, o maior corte caiu abaixo de 125 m e o muro de arrimo não passa de 35 m', () => {
    if (!rio) return;
    const hm = terrenoReal(rio, rj.terreno, 'mata-atlantica', 1);
    const r = regradarVias(hm.h, grafoReal(rio, () => '')).resumo;
    expect(r.trechosDeMorro).toBeGreaterThan(100);
    expect(r.maxCorte).toBeLessThan(110); // antes: 124,7 m
    expect(r.maxMuro).toBeLessThan(35); // antes: 40 m
    expect(r.gradeMax).toBeLessThanOrEqual(GRADE_MORRO + 0.01);
    expect(r.pontes).toBeLessThan(80); // antes: 118
  }, 120000);
});
