import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { densidadeBairro, montarRaster, type BairroCenso } from '../src/data/bairros';
import { indiceDasVias, type AmostraVia, type Perfil } from '../src/render/city/perfilVias';
import { sortearTipo } from '../src/render/city/Veiculos';
import type { RoadEdge } from '../src/world/roads';

const arqOnibus = 'public/data/rio/onibus.json';
const arqBairros = 'public/data/rio/bairros.json';

interface Linha { id: string; nome: string; longo: string; cor: string; tipo: number; porHora: number[]; trechos: number[][] }

describe('Fase 17 — ônibus reais (GTFS da SMTR) e Censo 2022', () => {
  it('as linhas do GTFS chegam com itinerário, cor, tipo e frequência', () => {
    if (!existsSync(arqOnibus)) return;
    const d = JSON.parse(readFileSync(arqOnibus, 'utf8')) as { linhas: Linha[]; paradas: number[]; nomesParadas: string[] };
    expect(d.linhas.length).toBeGreaterThan(200);
    expect(d.linhas.filter((l) => l.tipo === 1).length).toBeGreaterThanOrEqual(3); // BRT (MOBI-Rio)
    expect(d.linhas.filter((l) => l.tipo === 2).length).toBeGreaterThan(5); // executivos
    expect(new Set(d.linhas.map((l) => l.id)).size).toBe(d.linhas.length);
    for (const l of d.linhas) {
      expect(l.cor).toMatch(/^#[0-9a-f]{6}$/);
      expect(l.porHora).toHaveLength(24);
      expect(l.trechos.length).toBeGreaterThan(0);
      for (const t of l.trechos) {
        expect(t.length % 2).toBe(0);
        expect(t.length).toBeGreaterThanOrEqual(4);
        for (let i = 0; i < t.length; i++) expect(Math.abs(t[i])).toBeLessThan(8200);
      }
    }
    // uma linha comum tem viagens de dia útil em algum horário
    expect(d.linhas.filter((l) => l.porHora.some((v) => v > 0)).length).toBeGreaterThan(150);
    expect(d.paradas.length / 3).toBeGreaterThan(1000);
    for (let i = 0; i < d.paradas.length; i += 3) expect(d.nomesParadas[d.paradas[i + 2]]).toBeTypeOf('string');
  });

  it('sem sorteio de ônibus, a frota não tem ônibus nem BRT', () => {
    const tipos = new Set<number>();
    for (let i = 0; i < 5000; i++) tipos.add(sortearTipo((i + 0.5) / 5000, true, 4, true));
    expect(tipos.has(1)).toBe(false);
    expect(tipos.has(9)).toBe(false);
    expect(tipos.has(4)).toBe(true);
    const com = new Set<number>();
    for (let i = 0; i < 5000; i++) com.add(sortearTipo((i + 0.5) / 5000, true, 4));
    expect(com.has(1) && com.has(9)).toBe(true);
  });

  it('o índice de vias acha a amostra mais perto e respeita o raio', () => {
    const edge: RoadEdge = { id: 7, a: 1, b: 2, cx: 0, cz: 0, type: 'rua', name: 'R', faixas: 2 };
    const f = (...v: number[]) => Float32Array.from(v);
    const perfil: Perfil = { edge, n: 3, x: f(0, 3, 6), y: f(5, 6, 7), z: f(100, 100, 100), tx: f(1, 1, 1), tz: f(0, 0, 0), s: f(0, 3, 6), comprimento: 6, cortaA: 0, cortaB: 0 };
    const idx = indiceDasVias(new Map([[7, perfil]]));
    const out: AmostraVia = { x: 0, y: 0, z: 0, tx: 0, tz: 0, largura: 0, edge: 0 };
    expect(idx.perto(2.5, 103, 10, out)).toBe(true);
    expect(out.x).toBe(3);
    expect(out.y).toBe(6);
    expect(out.edge).toBe(7);
    expect(out.largura).toBeGreaterThan(5);
    expect(idx.perto(2.5, 140, 10, out)).toBe(false);
    expect(idx.perto(300, 100, 10, out)).toBe(false);
  });

  it('o raster de bairros põe cada ponto no bairro certo (anéis com buraco incluídos)', () => {
    const quadrado = (x0: number, z0: number, x1: number, z1: number) => [x0, z0, x1, z0, x1, z1, x0, z1];
    const bairros: BairroCenso[] = [
      { nome: 'A', ra: 'X', ap: '1', pop: 1000, pop10: 900, dom: 400, km2: 0.5, aneis: [quadrado(0, 0, 400, 400), quadrado(100, 100, 200, 200)] }, // com buraco
      { nome: 'B', ra: 'X', ap: '1', pop: 3000, pop10: 3300, dom: 1200, km2: 0.1, aneis: [quadrado(500, 0, 700, 200)] },
    ];
    const { raster, centros } = montarRaster(bairros);
    const em = (x: number, z: number) => raster[Math.floor((z + 8192) / 32) * 512 + Math.floor((x + 8192) / 32)];
    expect(em(300, 300)).toBe(1);
    expect(em(150, 150)).toBe(0); // o buraco
    expect(em(600, 100)).toBe(2);
    expect(em(1000, 1000)).toBe(0);
    expect(centros[1]![0]).toBeGreaterThan(550);
    expect(centros[1]![0]).toBeLessThan(650);
    expect(densidadeBairro(bairros[1])).toBe(30000);
  });

  it('o Censo 2022 do Rio traz população e contorno dos bairros dentro do mapa', () => {
    if (!existsSync(arqBairros)) return;
    const d = JSON.parse(readFileSync(arqBairros, 'utf8')) as { bairros: BairroCenso[] };
    expect(d.bairros.length).toBeGreaterThan(50);
    const nomes = new Map(d.bairros.map((b) => [b.nome, b]));
    for (const n of ['Copacabana', 'Botafogo', 'Tijuca', 'Ipanema', 'Centro']) expect(nomes.has(n), n).toBe(true);
    const copa = nomes.get('Copacabana')!;
    expect(copa.pop).toBeGreaterThan(100_000);
    expect(copa.pop).toBeLessThan(160_000);
    expect(copa.pop10).toBeGreaterThan(copa.pop); // Copacabana perdeu gente desde 2010
    expect(densidadeBairro(copa)).toBeGreaterThan(20_000);
    for (const b of d.bairros) { expect(b.km2).toBeGreaterThan(0); expect(b.aneis.length).toBeGreaterThan(0); }
    // o raster acha Copacabana no centro dela
    const { raster, centros } = montarRaster(d.bairros);
    const k = d.bairros.indexOf(copa);
    const [cx, cz] = centros[k]!;
    expect(raster[Math.floor((cz + 8192) / 32) * 512 + Math.floor((cx + 8192) / 32)]).toBe(k + 1);
  });
});
