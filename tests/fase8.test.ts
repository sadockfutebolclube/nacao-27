import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GENEROS, generoDe, generoDeFesta } from '../src/audio/generos';
import { NormaisUF } from '../src/data/clima';
import { ajustarClima, MunicipiosUF } from '../src/data/municipios';
import { estiloRegional } from '../src/render/city/estilos';
import { Estado } from '../src/sim/estado/estado';
import { generateTerrain } from '../src/world/terrain';
import { initDe } from './helpers';

const traits = JSON.parse(readFileSync('data/ufs/traits.json', 'utf8')) as { ufs: { sigla: string; capital: { nome: string }; terreno: unknown; biomas: string[]; trilha: string[] }[] };
const mun = (uf: string) => MunicipiosUF.parse(JSON.parse(readFileSync(`public/data/municipios/${uf}.json`, 'utf8')));
const achar = (uf: string, nome: string) => mun(uf).municipios.find((m) => m.nome === nome)!;

describe('Fase 8 — municípios jogáveis', () => {
  it('as 27 UFs têm municípios jogáveis com a capital curada', () => {
    let total = 0;
    for (const t of traits.ufs) {
      const d = mun(t.sigla);
      total += d.municipios.length;
      const caps = d.municipios.filter((m) => m.capital);
      expect(caps.length, t.sigla).toBe(1);
      expect(caps[0].nome).toBe(t.capital.nome);
      expect(caps[0].terreno).toEqual(t.terreno);
      expect(caps[0].bioma).toBe(t.biomas[0]);
      for (const m of d.municipios) {
        expect(t.biomas, `${m.nome}/${t.sigla}`).toContain(m.bioma);
        expect(m.ibge.startsWith(String(d.municipios[0].ibge).slice(0, 2))).toBe(true);
      }
    }
    expect(total).toBeGreaterThan(200);
  });

  it('relevo e bioma derivados de dados reais fazem sentido', () => {
    expect(achar('PB', 'Campina Grande').bioma).toBe('caatinga');
    expect(achar('PE', 'Petrolina').bioma).toBe('caatinga');
    expect(achar('MS', 'Corumbá').bioma).toBe('pantanal');
    expect(achar('RS', 'Pelotas').bioma).toBe('pampa');
    expect(achar('MT', 'Sinop').bioma).toBe('amazonia');
    const conquista = achar('BA', 'Vitória da Conquista');
    expect(conquista.terreno.tipo).toBe('planalto');
    expect(conquista.elevacao).toBeGreaterThan(800);
    expect(conquista.clima.dTemp).toBeLessThan(-4); // ~5 °C mais frio que Salvador
    expect(achar('BA', 'Juazeiro').clima.fChuva).toBeLessThan(0.5); // semiárido
    expect(achar('RJ', 'Niterói').terreno.tipo).toMatch(/^litoral/);
    expect(achar('AM', 'Parintins').terreno.tipo).toBe('varzea');
  });

  it('clima do município ajusta as normais da capital', () => {
    const clima = JSON.parse(readFileSync('public/data/clima/normais.json', 'utf8')) as { ufs: Record<string, unknown> };
    const ba = NormaisUF.parse(clima.ufs.BA);
    const c = ajustarClima(ba, achar('BA', 'Juazeiro'));
    expect(c.capital).toBe('Juazeiro');
    const chuvaBa = ba.meses.reduce((a, m) => a + m.chuva, 0), chuvaJ = c.meses.reduce((a, m) => a + m.chuva, 0);
    expect(chuvaJ / chuvaBa).toBeCloseTo(achar('BA', 'Juazeiro').clima.fChuva, 5);
    expect(ajustarClima(ba, achar('BA', 'Salvador'))).toBe(ba);
  });

  it('o terreno de qualquer município jogável é gerado sem buracos', () => {
    for (const [uf, nome] of [['PB', 'Campina Grande'], ['AM', 'Parintins'], ['MG', 'Juiz de Fora'], ['SC', 'Florianópolis'], ['GO', 'Anápolis']]) {
      const m = achar(uf, nome);
      const hm = generateTerrain(12345, m.terreno, m.bioma);
      let ok = true;
      for (let i = 0; i < hm.h.length; i += 97) if (!Number.isFinite(hm.h[i])) ok = false;
      expect(ok, nome).toBe(true);
    }
    // Fase 13: o mapa tem 16 km (era 6 km); cinco terrenos procedurais levam mais tempo
  }, 60_000);

  it('a cidade construída vira o reduto eleitoral do governador', () => {
    const e = new Estado({ ...initDe('PB'), sede: 'Campina Grande' });
    const ctx = e.ctxEleitoral();
    expect(ctx.sedeIbge).toBe(achar('PB', 'Campina Grande').ibge);
    expect(ctx.capitalIbge).not.toBe(ctx.sedeIbge);
  });
});

describe('Fase 8 — identidade regional', () => {
  it('arquitetura: cada UF tem estilo, o Sul tem telhado íngreme', () => {
    for (const t of traits.ufs) expect(estiloRegional(t.sigla).paredesCasa.length).toBeGreaterThan(3);
    expect(estiloRegional('SC').inclinacao).toBeGreaterThan(1.4);
    expect(estiloRegional('BA').id).toBe('colonial');
    expect(estiloRegional('AM').id).toBe('amazonico');
  });

  it('trilha: as palavras da trilha de cada UF viram gêneros diferentes', () => {
    for (const t of traits.ufs) {
      const ids = new Set(t.trilha.map((p) => generoDe(p).id));
      expect(ids.size, t.sigla).toBeGreaterThanOrEqual(2);
    }
    expect(generoDe('frevo').id).toBe('frevo');
    expect(generoDe('forró pé de serra').id).toBe('forro');
    expect(generoDe('samba de roda').id).toBe('coco');
    expect(generoDe('bossa nova').id).toBe('bossa');
    expect(generoDe('toada de boi-bumbá').id).toBe('boi');
    expect(generoDe('boi-de-mamão').id).toBe('valsa');
    expect(generoDeFesta('carnaval', 'PE')?.id).toBe('frevo');
    expect(generoDeFesta('carnaval', 'BA')?.id).toBe('axe');
    expect(generoDeFesta('junina', 'MA')?.id).toBe('boi');
  });

  it('gêneros bem formados: padrões no compasso, graus dentro da escala', () => {
    for (const g of Object.values(GENEROS)) {
      expect([8, 12, 16]).toContain(g.passos);
      expect(g.baixo.length, g.id).toBe(g.passos);
      if (g.acomp) expect(g.acomp.padrao.length, g.id).toBe(g.passos);
      for (const b of g.bateria) if (b.padrao) expect(b.padrao.length, `${g.id}/${b.voz}`).toBe(g.passos);
      for (const p of g.progressoes) {
        expect(p.length).toBe(4);
        for (const d of p) expect(d >= 0 && d < g.escala.length).toBe(true);
      }
      expect(g.escala.length).toBe(7);
    }
  });
});
