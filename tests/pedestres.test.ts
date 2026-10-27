import { describe, expect, it } from 'vitest';
import { ALTURA_CALCADA, fatorHorario, pontoCalcada, trechoCaminhavel } from '../src/render/city/Pedestres';
import type { Perfil } from '../src/render/city/perfilVias';
import { ROAD_SPECS } from '../src/world/roads';

/** Trecho reto ao longo de +x, de 0 a 30 m, em y = 2. */
function perfilReto(tipo: 'rua' | 'avenida', cortaA = 4, cortaB = 4): Perfil {
  const n = 11;
  const x = new Float32Array(n), y = new Float32Array(n), z = new Float32Array(n);
  const tx = new Float32Array(n), tz = new Float32Array(n), s = new Float32Array(n);
  for (let i = 0; i < n; i++) { x[i] = i * 3; y[i] = 2; tx[i] = 1; s[i] = i * 3; }
  return { edge: { id: 1, a: 1, b: 2, cx: 15, cz: 0, type: tipo, name: 'Rua Teste' }, n, x, y, z, tx, tz, s, comprimento: 30, cortaA, cortaB };
}

describe('pedestres — calçadas e horário', () => {
  it('ponto na calçada fica entre o meio-fio e a borda, nos dois lados, sobre a calçada', () => {
    for (const tipo of ['rua', 'avenida'] as const) {
      const pf = perfilReto(tipo);
      const spec = ROAD_SPECS[tipo];
      const out = { x: 0, y: 0, z: 0, tx: 0, tz: 0 };
      // normal do perfil (−tz, tx) = (0, 1): lado +1 → z positivo
      pontoCalcada(pf, 12, 1, 0, out);
      expect(out.z).toBeCloseTo(spec.width / 2);
      expect(out.x).toBeCloseTo(12);
      expect(out.y).toBeCloseTo(2 + ALTURA_CALCADA);
      pontoCalcada(pf, 12, -1, 1, out);
      expect(out.z).toBeCloseTo(-(spec.width / 2 + spec.sidewalk));
      expect(out.tx).toBeCloseTo(1);
    }
  });

  it('trecho caminhável exclui o cruzamento e some em trechos curtos', () => {
    expect(trechoCaminhavel(perfilReto('rua', 4, 6))).toEqual([4.5, 23.5]);
    expect(trechoCaminhavel(perfilReto('rua', 14, 14))).toBeNull();
  });

  it('mais gente nos picos do dia do que de madrugada', () => {
    expect(fatorHorario(3)).toBeLessThan(0.1);
    expect(fatorHorario(8)).toBeCloseTo(1);
    expect(fatorHorario(18)).toBeCloseTo(1);
    expect(fatorHorario(13)).toBeGreaterThan(fatorHorario(23));
    expect(fatorHorario(24 + 8)).toBeCloseTo(1);
    for (let h = 0; h <= 24; h += 0.5) {
      const f = fatorHorario(h);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThanOrEqual(1);
    }
  });
});
