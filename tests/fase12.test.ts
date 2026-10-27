import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CidadeReal, CAMPOS_PREDIO, contorno, predio, retangulo } from '../src/data/cidadeReal';
import { CAMADAS, PISOS } from '../src/render/materiais/biblioteca';

/** soma x1·z2 − x2·z1: negativa = anti-horário visto de cima no plano X/Z do jogo (+Z ao sul) */
const area2 = (p: [number, number][]) => p.reduce((s, [x1, z1], i) => { const [x2, z2] = p[(i + 1) % p.length]; return s + x1 * z2 - x2 * z1; }, 0);

describe('Fase 12 — plantas reais dos prédios', () => {
  const indice = JSON.parse(readFileSync('public/data/cidades/index.json', 'utf8')) as string[];

  it('as 27 capitais trazem o contorno de cada prédio, na mesma ordem', () => {
    expect(indice.length).toBe(27);
    for (const ibge of indice) {
      const c = CidadeReal.parse(JSON.parse(readFileSync(`public/data/cidades/${ibge}.json`, 'utf8')));
      expect(c.contornos, ibge).toBeTruthy();
      const v = new Int16Array(new Uint8Array(Buffer.from(c.contornos!, 'base64')).buffer);
      let o = 0, n = 0;
      while (o < v.length) { o += 1 + v[o] * 2; n++; }
      expect(o, ibge).toBe(v.length);
      expect(n, ibge).toBe(c.predios.length / CAMPOS_PREDIO);
    }
  });

  it('o contorno é um anel anti-horário que cabe no retângulo do prédio', () => {
    const c = CidadeReal.parse(JSON.parse(readFileSync('public/data/cidades/3550308.json', 'utf8')));
    const n = c.predios.length / CAMPOS_PREDIO;
    let reais = 0;
    for (let i = 0; i < n; i += 7) {
      const p = predio(c, i), anel = contorno(c, i);
      expect(anel.length).toBeGreaterThanOrEqual(3);
      expect(area2(anel)).toBeLessThan(0);
      const raio = Math.hypot(p.w, p.d) / 2 + 1;
      for (const [x, z] of anel) expect(Math.hypot(x - p.x, z - p.z)).toBeLessThanOrEqual(raio);
      if (anel.length !== 4) reais++;
    }
    // São Paulo tem muitas plantas que não são retângulos
    expect(reais).toBeGreaterThan(100);
  });

  it('o retângulo orientado é anti-horário e tem a área do prédio', () => {
    const p = { x: 10, z: -5, angle: 0.7, w: 12, d: 20, andares: 3, tipo: 0, aresta: 1, nome: null };
    const r = retangulo(p);
    expect(r).toHaveLength(4);
    expect(area2(r)).toBeLessThan(0);
    expect(Math.abs(area2(r)) / 2).toBeCloseTo(240, 5);
  });
});

describe('Fase 12 — materiais PBR (ambientCG, CC0)', () => {
  it('todas as camadas de prédio e todos os pisos têm cor, normal e rugosidade no repositório', () => {
    for (const c of CAMADAS) {
      for (const m of ['cor', 'normal', 'rug']) expect(existsSync(`public/assets/materiais/${c.id}_${m}.jpg`), `${c.id}_${m}`).toBe(true);
      if (c.emis) expect(existsSync(`public/assets/materiais/${c.emis}_emis.jpg`), `${c.emis}_emis`).toBe(true);
      expect(c.escala[0]).toBeGreaterThan(0);
    }
    for (const p of PISOS) for (const m of ['cor', 'normal', 'rug']) expect(existsSync(`public/assets/materiais/${p}_${m}.jpg`), `${p}_${m}`).toBe(true);
    expect(existsSync('public/assets/hdri/kloofendal_48d_partly_cloudy_puresky.hdr')).toBe(true);
  });

  it('as fachadas fotográficas vêm antes das paredes lisas (o shader usa índice < 8)', () => {
    expect(CAMADAS.slice(0, 8).every((c) => c.tipo === 'fachada')).toBe(true);
    expect(CAMADAS.slice(8).every((c) => c.tipo !== 'fachada')).toBe(true);
  });
});
