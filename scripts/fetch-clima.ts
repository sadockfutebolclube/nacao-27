/**
 * NAÇÃO 27 — normais climatológicas das 27 capitais (Fase 6).
 *
 *   npm run fetch-clima
 *
 * Fonte: reanálise ERA5 via Open-Meteo Historical Weather API (https://open-meteo.com/en/docs/historical-weather-api),
 * dados diários 1991–2020 no ponto da capital (lat/lon do IBGE em data/ufs/traits.json). Agrega por mês:
 * temperatura média/máxima/mínima, chuva mensal, dias com chuva ≥ 1 mm, P99 da chuva diária e P95 da máxima.
 *
 * Saída: public/data/clima/normais.json
 * Cache: data/clima-cache/{UF}.json (a API tem limite por hora; rodar de novo retoma de onde parou)
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DadosClima, type NormaisUF } from '../src/data/clima.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'data', 'clima');
const CACHE = join(ROOT, 'data', 'clima-cache');
const INICIO = 1991, FIM = 2020;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Diario { time: string[]; temperature_2m_mean: (number | null)[]; temperature_2m_max: (number | null)[]; temperature_2m_min: (number | null)[]; precipitation_sum: (number | null)[] }

async function baixar(lat: number, lon: number): Promise<Diario> {
  const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${INICIO}-01-01&end_date=${FIM}-12-31`
    + '&daily=temperature_2m_mean,temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=America%2FSao_Paulo';
  for (let t = 0; ; t++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'nacao27-fetch-clima' } });
      // limite por hora da API gratuita: espera a próxima janela
      if (r.status === 429) { console.log('  limite da API — aguardando 5 min…'); await sleep(300_000); if (t > 16) throw new Error('limite da API persistente'); continue; }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return ((await r.json()) as { daily: Diario }).daily;
    } catch (e) {
      if (t >= 4) throw e;
      await sleep(5000 * (t + 1));
    }
  }
}

const percentil = (xs: number[], p: number) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
};
const r1 = (v: number) => Math.round(v * 10) / 10;

async function main() {
  const traits = JSON.parse(await readFile(join(ROOT, 'data', 'ufs', 'traits.json'), 'utf8')) as { ufs: { sigla: string; capital: { nome: string; lat: number; lon: number } }[] };
  const ufs: Record<string, NormaisUF> = {};
  for (const u of traits.ufs) {
    process.stdout.write(`${u.sigla} ${u.capital.nome}… `);
    const arqCache = join(CACHE, `${u.sigla}.json`);
    let d: Diario;
    try { d = JSON.parse(await readFile(arqCache, 'utf8')) as Diario; } catch {
      d = await baixar(u.capital.lat, u.capital.lon);
      await mkdir(CACHE, { recursive: true });
      await writeFile(arqCache, JSON.stringify(d));
    }
    const anos = FIM - INICIO + 1;
    const meses = Array.from({ length: 12 }, () => ({ tm: [] as number[], tx: [] as number[], tn: [] as number[], chuva: 0, dias: 0, molhados: [] as number[] }));
    d.time.forEach((t, i) => {
      const m = meses[Number(t.slice(5, 7)) - 1];
      const tm = d.temperature_2m_mean[i], tx = d.temperature_2m_max[i], tn = d.temperature_2m_min[i], p = d.precipitation_sum[i];
      if (tm !== null) m.tm.push(tm);
      if (tx !== null) m.tx.push(tx);
      if (tn !== null) m.tn.push(tn);
      if (p !== null) { m.chuva += p; if (p >= 1) { m.dias++; m.molhados.push(p); } }
    });
    const media = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
    ufs[u.sigla] = {
      capital: u.capital.nome, lat: u.capital.lat, lon: u.capital.lon,
      meses: meses.map((m) => ({
        tMed: r1(media(m.tm)), tMax: r1(media(m.tx)), tMin: r1(media(m.tn)),
        chuva: r1(m.chuva / anos), diasChuva: r1(m.dias / anos), p99: r1(percentil(m.molhados, 0.99)), tMaxP95: r1(percentil(m.tx, 0.95)),
      })),
    };
    const ano = ufs[u.sigla].meses.reduce((a, m) => a + m.chuva, 0);
    console.log(`${Math.round(ano)} mm/ano, jan ${ufs[u.sigla].meses[0].tMed}°C, jul ${ufs[u.sigla].meses[6].tMed}°C`);
    await sleep(1500);
  }
  const dados = DadosClima.parse({
    geradoEm: new Date().toISOString(),
    fonte: 'ERA5 (ECMWF/Copernicus) via Open-Meteo Historical Weather API — ponto da capital',
    periodo: `${INICIO}–${FIM}`,
    ufs,
  });
  await mkdir(OUT, { recursive: true });
  await writeFile(join(OUT, 'normais.json'), JSON.stringify(dados));
  console.log('ok → public/data/clima/normais.json');
}

main().catch((e) => { console.error(e); process.exit(1); });
