/** Fase 34: muro e portal só até o relevo renderizado, anel de rotatória contínuo, disco do cruzamento na cota da pista, prédio real em desnível extremo removido. */
import { existsSync, readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { CidadeReal } from '../src/data/cidadeReal';
import { ArquivoTracos } from '../src/data/schemas';
import { construir, perfisAtuais } from '../src/render/city/Vias';
import { mundo } from '../src/sim/bridge';
import { grafoReal, lotesFixos, terrenoReal } from '../src/world/cidadeReal';
import { RASTER_RES } from '../src/world/constants';
import { computeLots, DESNIVEL_MAX, DESNIVEL_REMOVER, estatLotes } from '../src/world/lots';
import { sampleHeight, type Heightmap } from '../src/world/terrain';

const arq = 'public/data/cidades/3304557.json';
const rio = existsSync(arq) ? CidadeReal.parse(JSON.parse(readFileSync(arq, 'utf8'))) : null;
const rj = ArquivoTracos.parse(JSON.parse(readFileSync('data/ufs/traits.json', 'utf8'))).ufs.find((u) => u.sigla === 'RJ')!;

describe.skipIf(!rio)('Rio real: malha das vias da Fase 34', () => {
  let hm: Heightmap, malha: ReturnType<typeof construir>;
  beforeAll(() => {
    hm = terrenoReal(rio!, rj.terreno, 'mata-atlantica', 1);
    const g = grafoReal(rio!, () => '');
    mundo.roads = g; mundo.real = rio!; mundo.hm = hm;
    malha = construir(hm);
  }, 240000);

  it('o muro de arrimo não fica de pé acima do relevo renderizado (era uma "tela" sobre o terreno escavado)', () => {
    let vertices = 0, altos = 0;
    for (const b of malha) {
      const P = b.muros.getAttribute('position');
      for (let i = 0; i < P.count; i++) { vertices++; if (P.getY(i) > sampleHeight(hm, P.getX(i), P.getZ(i)) + 4) altos++; }
    }
    expect(vertices).toBeGreaterThan(1000);
    // patamares e taludes recuam alguns metros e o relevo ali é mais alto; com o relevo original a "tela" passava de dezenas de metros
    expect(altos / vertices).toBeLessThan(0.08); // medido: 5,5%
  });

  it('as rotatórias do OSM têm o anel em asfalto de ponta a ponta (sem vãos de grama entre os arcos)', () => {
    const rot = rio!.vias.rotatorias ?? [];
    expect(rot.length).toBeGreaterThanOrEqual(3);
    let testadas = 0;
    for (let k = 0; k + 2 < rot.length; k += 3) {
      const [rx, rz, rr] = [rot[k], rot[k + 1], rot[k + 2]];
      // cobertura angular: para cada um de 36 ângulos, algum triângulo de cruzamento (qualquer buffer de bloco) contém o ponto do meio do anel
      const px = (a: number) => [rx + Math.cos(a) * (rr + 0.2), rz + Math.sin(a) * (rr + 0.2)] as const;
      let cobertos = 0;
      for (let q = 0; q < 36; q++) {
        const [x, z] = px((q / 36) * Math.PI * 2);
        let dentro = false;
        for (const b of malha) {
          const P = b.cruzamentos.getAttribute('position'), idx = b.cruzamentos.index!;
          for (let t = 0; t + 2 < idx.count && !dentro; t += 3) {
            const a = idx.getX(t), c1 = idx.getX(t + 1), c2 = idx.getX(t + 2);
            const ax = P.getX(a), az = P.getZ(a), bx = P.getX(c1), bz = P.getZ(c1), cx = P.getX(c2), cz = P.getZ(c2);
            if (Math.min(ax, bx, cx) > x || Math.max(ax, bx, cx) < x || Math.min(az, bz, cz) > z || Math.max(az, bz, cz) < z) continue;
            const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
            const l1 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d, l2 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d;
            if (l1 >= -1e-6 && l2 >= -1e-6 && l1 + l2 <= 1 + 1e-6) dentro = true;
          }
          if (dentro) break;
        }
        if (dentro) cobertos++;
      }
      expect(cobertos).toBeGreaterThanOrEqual(34);
      testadas++;
    }
    expect(testadas).toBeGreaterThan(0);
  });

  it('o disco do cruzamento fica na cota da pista, não na do chão (ponte, túnel e muro)', () => {
    // nó de ponte/viaduto: o relevo está abaixo da pista; nenhum vértice de disco pode ficar a mais de 1,5 m da cota do nó
    const porNo = new Map<number, number>();
    for (const p of perfisAtuais.values()) { porNo.set(p.edge.a, p.y[0]); porNo.set(p.edge.b, p.y[p.n - 1]); }
    let nosElevados = 0, errados = 0;
    for (const p of perfisAtuais.values()) {
      if (!p.nivel || p.nivel < 1) continue;
      const y = p.y[0], chao = sampleHeight(hm, p.x[0], p.z[0]);
      if (y - chao < 3) continue;
      nosElevados++;
      for (const b of malha) {
        const P = b.cruzamentos.getAttribute('position');
        for (let i = 0; i < P.count; i++) if (Math.hypot(P.getX(i) - p.x[0], P.getZ(i) - p.z[0]) < 3 && Math.abs(P.getY(i) - y) > 1.5) { errados++; break; }
      }
    }
    expect(nosElevados).toBeGreaterThan(50);
    expect(errados / nosElevados).toBeLessThan(0.04); // medido: 2,5% (disco que alcança um nó vizinho de outra cota)
  });

  it('prédio real com desnível > 8 m sob a planta é removido e contado; o resto fica', () => {
    expect(DESNIVEL_REMOVER).toBe(8);
    expect(DESNIVEL_REMOVER).toBeGreaterThan(DESNIVEL_MAX);
    const g = mundo.roads;
    const lotes = computeLots(g, hm, [], new Int32Array(RASTER_RES * RASTER_RES), [], lotesFixos(rio!, new Set<number>(), (id) => g.edges.has(id)));
    expect(estatLotes.removidosPorDesnivel).toBeGreaterThan(1000);
    expect(estatLotes.removidosPorDesnivel).toBeLessThan(0.15 * lotes.length);
    expect(lotes.length).toBeGreaterThan(100_000);
  });
});

describe('relatório do detector da Fase 34', () => {
  const ler = (n: string) => (existsSync(`docs/auditoria-vias/${n}.json`) ? JSON.parse(readFileSync(`docs/auditoria-vias/${n}.json`, 'utf8')) as { contagem: Record<string, number>; predios_regra_nova: { prediosReaisRemovidosPorDesnivel?: number }; piores_30: unknown[] } : null);

  it('mantém lascas, normais invertidas e saltos de nó em 0 e reduz os taludes sobrepostos e os prédios enfiados', () => {
    const antes = ler('depois'), agora = ler('fase34');
    expect(agora).toBeTruthy();
    expect(agora!.contagem.lascas).toBe(0);
    expect(agora!.contagem.normaisInvertidas).toBe(0);
    expect(agora!.contagem.saltosNoNo).toBe(0);
    expect(agora!.contagem.taludesSobrepostos).toBeLessThan(antes!.contagem.taludesSobrepostos / 3);
    expect(agora!.contagem.prediosEnfiados).toBeLessThan(antes!.contagem.prediosEnfiados * 0.6);
    expect(agora!.predios_regra_nova.prediosReaisRemovidosPorDesnivel).toBeGreaterThan(1000);
    expect(agora!.piores_30.length).toBe(30);
  });
});
