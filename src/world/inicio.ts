/** Escolhe um ponto inicial bonito e construível: plano, seco e, se houver, perto da orla. */
import { BUILD_HALF } from './constants';
import { sampleHeight, sampleSlope, sampleWaterDist, type Heightmap } from './terrain';

export function pontoInicial(hm: Heightmap): [number, number] {
  let melhor: [number, number] = [0, 0];
  let nota = -Infinity;
  const lim = BUILD_HALF - 300;
  for (let z = -lim; z <= lim; z += 48) {
    for (let x = -lim; x <= lim; x += 48) {
      const h = sampleHeight(hm, x, z);
      if (h < 1.5 || h > 40) continue;
      let plano = 0;
      for (const [dx, dz] of [[0, 0], [60, 0], [-60, 0], [0, 60], [0, -60], [100, 100], [-100, -100]]) {
        plano += sampleSlope(hm, x + dx, z + dz) < 0.07 && sampleHeight(hm, x + dx, z + dz) > 1.2 ? 1 : 0;
      }
      const wd = sampleWaterDist(hm, x, z);
      const orla = wd < 2000 ? Math.exp(-((wd - 320) ** 2) / (2 * 220 ** 2)) : 0;
      const centro = -Math.hypot(x, z) / 3000;
      const n = plano * 1.2 + orla * 4 + centro;
      if (n > nota) { nota = n; melhor = [x, z]; }
    }
  }
  return melhor;
}
