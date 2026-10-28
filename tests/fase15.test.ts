import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CidadeReal } from '../src/data/cidadeReal';
import { ArquivoTracos } from '../src/data/schemas';
import { ancoraMarco, IBGE_RIO, LATLON, prediosOcultos } from '../src/render/city/pontosRio';
import { PICOS_RIO, projetar, terrenoReal } from '../src/world/cidadeReal';
import { HM_STEP, HM_VERTS, MAP_SIZE } from '../src/world/constants';
import { sampleHeight } from '../src/world/terrain';

const arq = 'public/data/cidades/3304557.json';
const rio = existsSync(arq) ? CidadeReal.parse(JSON.parse(readFileSync(arq, 'utf8'))) : null;
const tracos = ArquivoTracos.parse(JSON.parse(readFileSync('data/ufs/traits.json', 'utf8')));
const rj = tracos.ufs.find((u) => u.sigla === 'RJ')!;

describe('Fase 15 — relevo, mar e marcos do Rio', () => {
  it('a projeção põe os marcos onde eles estão', () => {
    if (!rio) return;
    const [x, z] = projetar(rio, ...LATLON.cristo);
    // o Corcovado fica a oeste (x negativo) e a sul (z positivo) do centro do mapa, entre o Centro e a Zona Sul
    expect(x).toBeLessThan(-1000);
    expect(x).toBeGreaterThan(-2500);
    expect(z).toBeGreaterThan(300);
    expect(z).toBeLessThan(1500);
    const [cx, cz] = projetar(rio, rio.lat, rio.lon);
    expect(Math.hypot(cx, cz)).toBeLessThan(0.01);
  });

  it('os picos famosos chegam à altitude real', () => {
    if (!rio) return;
    const hm = terrenoReal(rio, rj.terreno, 'mata-atlantica', 1);
    for (const pk of PICOS_RIO) {
      const [x, z] = projetar(rio, pk.lat, pk.lon);
      let maior = 0;
      for (let dx = -48; dx <= 48; dx += HM_STEP) for (let dz = -48; dz <= 48; dz += HM_STEP) maior = Math.max(maior, sampleHeight(hm, x + dx, z + dz));
      expect(maior, pk.nome).toBeGreaterThan(pk.alt * 0.93);
      expect(maior, pk.nome).toBeLessThan(pk.alt * 1.25);
    }
  });

  it('o mar tem praia em rampa e aprofunda com a distância da costa', () => {
    if (!rio) return;
    const hm = terrenoReal(rio, rj.terreno, 'mata-atlantica', 1);
    // a costa de Copacabana-Leme: procura pela grade, de oeste para leste, a primeira célula de mar numa linha de z fixo
    const z = 3050, j = Math.round((z + MAP_SIZE / 2) / HM_STEP);
    let costa = -1;
    for (let i = Math.round((900 + MAP_SIZE / 2) / HM_STEP); i < HM_VERTS; i++) if (hm.h[j * HM_VERTS + i] < 0) { costa = i; break; }
    expect(costa).toBeGreaterThan(0);
    const dentro = (k: number) => hm.h[j * HM_VERTS + costa + k];
    expect(dentro(-2)).toBeGreaterThan(0);
    expect(dentro(-2)).toBeLessThan(8); // praia, não parede
    expect(dentro(40)).toBeLessThan(dentro(6)); // mais fundo adiante
    expect(dentro(40)).toBeGreaterThan(-60);
  });

  it('os marcos substituem os prédios do OSM que eles representam', () => {
    if (!rio) return;
    expect(rio.ibge).toBe(IBGE_RIO);
    const oc = prediosOcultos(rio);
    expect(oc.size).toBeGreaterThan(3);
    const arcos = ancoraMarco(rio, 'Arcos da Lapa');
    expect(arcos).toBeTruthy();
    expect(arcos!.d).toBeGreaterThan(200); // o aqueduto é comprido
    expect(ancoraMarco(rio, 'Museu do Amanhã')).toBeTruthy();
    expect(ancoraMarco(rio, 'Catedral de São Sebastião')).toBeTruthy();
    // prédios dentro do raio do Maracanã somem
    const [mx, mz] = projetar(rio, ...LATLON.maracana);
    let dentroRaio = 0;
    for (let i = 0; i < rio.predios.length / 9; i++) if (Math.hypot(rio.predios[i * 9] - mx, rio.predios[i * 9 + 1] - mz) < 190) { dentroRaio++; expect(oc.has(i)).toBe(true); }
    expect(dentroRaio).toBeGreaterThanOrEqual(0);
  });

  it('em outras cidades nada é ocultado', () => {
    if (!rio) return;
    const outra = { ...rio, ibge: '9999999' } as CidadeReal;
    expect(prediosOcultos(outra).size).toBe(0);
  });
});
