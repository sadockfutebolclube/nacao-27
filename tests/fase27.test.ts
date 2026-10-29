/** Fase 27: veículos especiais — catálogo em JSON, modelos reais com créditos, rotas por waypoints (ar e mar) e pistas do OSM. */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import especiaisJson from '../src/data/veiculos/especiais.json';
import { CidadeReal } from '../src/data/cidadeReal';
import { ArquivoTracos } from '../src/data/schemas';
import traits from '../data/ufs/traits.json';
import { ESPECIAIS, validarEspeciais } from '../src/sim/especiais/dados';
import { CENTRO_RIO, latLonDoRio, montarCronograma, novaPosicao, posicaoDoVeiculo, prepararRota, projetarRio, estadoNaRota, type RotaPronta } from '../src/sim/especiais/rotas';
import { terrenoReal } from '../src/world/cidadeReal';
import { sampleHeight } from '../src/world/terrain';
import { BUILD_HALF } from '../src/world/constants';

const rj = ArquivoTracos.parse(traits).ufs.find((u) => u.sigla === 'RJ')!;
const arq = 'public/data/cidades/3304557.json';
const rio = existsSync(arq) ? CidadeReal.parse(JSON.parse(readFileSync(arq, 'utf8'))) : null;

const rotas: Record<string, RotaPronta> = {};
for (const [id, d] of Object.entries(ESPECIAIS.rotas)) rotas[id] = prepararRota(id, d);

describe('catálogo em JSON (validado)', () => {
  it('o arquivo do repositório passa e cobre ar, mar e helicópteros de ocorrência', () => {
    const cats = new Set(ESPECIAIS.frotas.map((f) => f.categoria));
    for (const c of ['aviao', 'helicoptero', 'militar', 'navio']) expect(cats.has(c as never), c).toBe(true);
    const ids = ESPECIAIS.frotas.map((f) => f.id);
    for (const id of ['sdu-chegadas', 'sdu-saidas', 'gig-chegadas', 'gig-saidas', 'heli-turismo', 'heli-imprensa', 'aeronautica', 'mercantes', 'marinha', 'pesca', 'passeio', 'jetski', 'barcas']) expect(ids, id).toContain(id);
    expect(ESPECIAIS.ocorrencias.helis.map((h) => h.id)).toEqual(expect.arrayContaining(['pm', 'bombeiros', 'imprensa']));
  });

  it('um erro de digitação vira mensagem com o campo', () => {
    const a = JSON.parse(JSON.stringify(especiaisJson));
    a.frotas[0].rotas = ['rota-fantasma'];
    expect(() => validarEspeciais(a)).toThrow(/rota-fantasma/);
    const b = JSON.parse(JSON.stringify(especiaisJson));
    b.frotas[0].modelos = ['modelo-fantasma'];
    expect(() => validarEspeciais(b)).toThrow(/modelo-fantasma/);
    const c = JSON.parse(JSON.stringify(especiaisJson));
    c.rotas['sdu-pouso'].pontos[0][0] = 123;
    expect(() => validarEspeciais(c)).toThrow(/pontos/);
    const d = JSON.parse(JSON.stringify(especiaisJson));
    d.frotas[0].rotas = ['sdu-pouso', 'barca-ida'];
    expect(() => validarEspeciais(d)).toThrow(/mistura/);
  });
});

describe('modelos 3D reais e créditos (regra de assets)', () => {
  const credits = readFileSync('assets/CREDITS.md', 'utf8');
  const raiz = 'assets/models';

  it('todo modelo do catálogo existe em assets/models e está registrado em assets/CREDITS.md', () => {
    for (const [id, m] of Object.entries(ESPECIAIS.modelos)) {
      expect(existsSync(join(raiz, m.arquivo)), `${id}: ${m.arquivo}`).toBe(true);
      const nome = m.arquivo.split('/').pop()!.replace('.glb', '');
      expect(credits.includes(nome), `${nome} sem crédito`).toBe(true);
    }
  });

  it('os GLB são compactados (meshopt), pequenos e sem textura grande', () => {
    let total = 0;
    for (const cat of readdirSync(raiz)) for (const f of readdirSync(join(raiz, cat))) {
      if (!f.endsWith('.glb')) continue;
      if (cat === 'pessoa' || cat === 'animal' || cat === 'animado') continue; // personagem com esqueleto: sem quantização/meshopt de propósito (a pele precisa das posições em float)
      const b = readFileSync(join(raiz, cat, f));
      total += statSync(join(raiz, cat, f)).size;
      expect(b.readUInt32LE(0), f).toBe(0x46546c67); // "glTF"
      expect(b.toString('latin1', 20, 20 + b.readUInt32LE(12)).includes('EXT_meshopt_compression'), `${f} sem meshopt`).toBe(true);
      expect(b.length, f).toBeLessThan(150 * 1024);
    }
    expect(total).toBeLessThan(1.5 * 1024 * 1024);
  });

  it('só licenças permitidas (CC0, CC-BY, MIT, domínio público) aparecem nos créditos dos modelos', () => {
    const trecho = credits.slice(credits.indexOf('## Modelos 3D'));
    expect(/CC-BY-NC|CC-BY-ND|NonCommercial|NoDerivatives/i.test(trecho)).toBe(false);
  });
});

describe('projeção e rotas', () => {
  it('projetarRio é a projeção do gerador e tem inversa', () => {
    if (rio) { expect(rio.lat).toBeCloseTo(CENTRO_RIO.lat, 6); expect(rio.lon).toBeCloseTo(CENTRO_RIO.lon, 6); }
    const [x, z] = projetarRio(-22.9519, -43.2105); // Cristo Redentor
    expect(x).toBeCloseTo(-1589, -1); expect(z).toBeCloseTo(763, -1);
    const [la, lo] = latLonDoRio(x, z);
    expect(la).toBeCloseTo(-22.9519, 5); expect(lo).toBeCloseTo(-43.2105, 5);
  });

  it('a spline passa pelos waypoints, as velocidades são positivas e a duração é finita', () => {
    for (const [id, r] of Object.entries(rotas)) {
      expect(r.duracao, id).toBeGreaterThan(30);
      expect(Number.isFinite(r.comprimento), id).toBe(true);
      expect(r.v.every((v) => v > 0), id).toBe(true);
      for (const [la, lo] of ESPECIAIS.rotas[id].pontos) {
        const [x, z] = projetarRio(la, lo);
        let melhor = Infinity;
        for (let i = 0; i < r.x.length; i++) melhor = Math.min(melhor, Math.hypot(r.x[i] - x, r.z[i] - z));
        expect(melhor, `${id} (${la}, ${lo})`).toBeLessThan(25);
      }
    }
  });

  it('posição no tempo: contínua, determinística e o rumo acompanha o deslocamento', () => {
    const r = rotas['sdu-decolagem'], a = { x: 0, z: 0, alt: 0, v: 0, yaw: 0, pitch: 0, roll: 0 }, b = { ...a };
    let anterior: [number, number] | null = null;
    for (let t = 0; t <= r.duracao; t += 5) {
      estadoNaRota(r, t, a);
      if (anterior) expect(Math.hypot(a.x - anterior[0], a.z - anterior[1])).toBeLessThan(5 * 200); // < 200 m/s
      anterior = [a.x, a.z];
    }
    estadoNaRota(r, 50, a); estadoNaRota(r, 50, b);
    expect(a).toEqual(b);
    estadoNaRota(r, 100, a); estadoNaRota(r, 101, b);
    const rumo = Math.atan2(b.x - a.x, b.z - a.z);
    expect(Math.abs(Math.atan2(Math.sin(rumo - a.yaw), Math.cos(rumo - a.yaw)))).toBeLessThan(0.35);
  });

  it('rota fechada dá a volta; rota aberta fica nas pontas', () => {
    const f = rotas['heli-turismo'], a = { x: 0, z: 0, alt: 0, v: 0, yaw: 0, pitch: 0, roll: 0 }, b = { ...a };
    estadoNaRota(f, 10, a); estadoNaRota(f, 10 + f.duracao, b);
    expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeLessThan(1);
    const o = rotas['sdu-pouso'];
    estadoNaRota(o, o.duracao + 500, a); estadoNaRota(o, o.duracao, b);
    expect(a.x).toBeCloseTo(b.x, 3);
  });
});

describe('pistas e voos reais', () => {
  it('as pistas do Santos Dumont e do Galeão vêm do OpenStreetMap, com comprimento e rumo conferidos', () => {
    const p = Object.fromEntries(ESPECIAIS.pistas.map((q) => [q.id, q]));
    const dim = (id: string) => {
      const [ax, az] = projetarRio(p[id].a[0], p[id].a[1]), [bx, bz] = projetarRio(p[id].b[0], p[id].b[1]);
      return { len: Math.hypot(bx - ax, bz - az), rumo: ((Math.atan2(bx - ax, -(bz - az)) * 180) / Math.PI + 360) % 360 };
    };
    expect(dim('sdu-02r-20l').len).toBeGreaterThan(1260); expect(dim('sdu-02r-20l').len).toBeLessThan(1360);
    expect(dim('sdu-02l-20r').len).toBeGreaterThan(1200); expect(dim('sdu-02l-20r').len).toBeLessThan(1300);
    expect(Math.abs(dim('sdu-02r-20l').rumo - 356.6)).toBeLessThan(2); // rumo verdadeiro (018° magnético)
    expect(dim('gig-10-28').len).toBeGreaterThan(3800);
    for (const q of ESPECIAIS.pistas) expect(q.fonte).toMatch(/OpenStreetMap/);
  });

  it('pouso: desce até a cabeceira, toca a pista em baixa velocidade e termina dentro da pista', () => {
    const r = rotas['sdu-pouso'];
    const s = { x: 0, z: 0, alt: 0, v: 0, yaw: 0, pitch: 0, roll: 0 };
    estadoNaRota(r, 0, s); expect(s.alt).toBeGreaterThan(500);
    let tocou = -1;
    for (let t = 0; t <= r.duracao; t += 1) { estadoNaRota(r, t, s); if (s.alt < 3) { tocou = t; break; } }
    expect(tocou).toBeGreaterThan(0);
    estadoNaRota(r, tocou, s);
    const [bx, bz] = projetarRio(-22.9046, -43.1632); // cabeceira norte (20)
    expect(Math.hypot(s.x - bx, s.z - bz)).toBeLessThan(150);
    expect(s.v).toBeLessThan(80);
    estadoNaRota(r, r.duracao, s);
    expect(s.alt).toBe(0); expect(s.v).toBeLessThan(20);
  });

  it('decolagem: sai parado da cabeceira sul e acelera pela pista antes de subir', () => {
    const r = rotas['sdu-decolagem'], s = { x: 0, z: 0, alt: 0, v: 0, yaw: 0, pitch: 0, roll: 0 };
    estadoNaRota(r, 0, s); expect(s.v).toBeLessThan(5); expect(s.alt).toBe(0);
    estadoNaRota(r, 30, s); expect(s.alt).toBe(0); expect(s.v).toBeGreaterThan(30);
    estadoNaRota(r, r.duracao, s); expect(s.alt).toBeGreaterThan(1500);
  });
});

describe('frotas', () => {
  const cron = ESPECIAIS.frotas.map((f) => montarCronograma(f, rotas));

  it('a barca para no cais entre a ida e a volta; os mercantes esperam atracados', () => {
    const c = cron.find((x) => x.frota.id === 'barcas')!;
    const idaS = rotas['barca-ida'].duracao;
    const p = novaPosicao();
    let parado = 0;
    for (let t = 0; t < c.cicloS; t += 5) { posicaoDoVeiculo(c, 0, t, p); if (p.ativo && p.parado) { parado++; expect(p.v).toBe(0); } }
    expect(parado).toBeGreaterThan(5);
    expect(c.viagemS).toBeCloseTo(2 * idaS + (c.frota.pausaS ?? 0), 0);
    const m = cron.find((x) => x.frota.id === 'mercantes')!;
    expect(m.cicloS).toBeGreaterThanOrEqual(m.viagemS);
  });

  it('os veículos de uma frota estão defasados e a frota inteira é reprodutível', () => {
    const c = cron.find((x) => x.frota.id === 'jetski')!;
    const a = novaPosicao(), b = novaPosicao(), a2 = novaPosicao();
    posicaoDoVeiculo(c, 0, 100, a); posicaoDoVeiculo(c, 1, 100, b); posicaoDoVeiculo(c, 0, 100, a2);
    expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(50);
    expect(a2).toEqual(a);
  });

  it('há aeronaves em cena em algum instante do dia e nenhuma posição sai NaN', () => {
    const p = novaPosicao();
    let vistos = 0;
    for (const c of cron) for (let i = 0; i < c.frota.quantidade; i++) for (let t = 0; t < c.cicloS * 2; t += 37) {
      posicaoDoVeiculo(c, i, t, p);
      if (!p.ativo) continue;
      vistos++;
      expect(Number.isFinite(p.x + p.z + p.alt + p.yaw + p.pitch + p.roll)).toBe(true);
    }
    expect(vistos).toBeGreaterThan(200);
  });
});

describe('rotas de mar sobre o relevo real do Rio', () => {
  it('as rotas de mar ficam na água (≥ 98% das amostras abaixo de 0,3 m) e as de ar passam sobre a área mapeada', () => {
    if (!rio) return;
    const hm = terrenoReal(rio, rj.terreno, 'mata-atlantica', 1);
    for (const [id, r] of Object.entries(rotas)) {
      if (r.tipo !== 'mar') continue;
      let terra = 0;
      for (let i = 0; i < r.x.length; i++) if (sampleHeight(hm, r.x[i], r.z[i]) > 0.3) terra++;
      expect(terra / r.x.length, `${id}: ${terra}/${r.x.length} amostras em terra`).toBeLessThan(0.02);
    }
    // o Santos Dumont está dentro da área edificável; o Galeão, não (limite honesto do mapa de 16 km)
    const [sx, sz] = projetarRio(-22.9105, -43.1630), [, gz] = projetarRio(-22.8100, -43.2506);
    expect(Math.abs(sx) < BUILD_HALF && Math.abs(sz) < BUILD_HALF).toBe(true);
    expect(Math.abs(gz) > BUILD_HALF).toBe(true);
  }, 60000);
});
