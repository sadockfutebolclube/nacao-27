/**
 * NAÇÃO 27 — baixa, normaliza e empacota os dados reais das 27 UFs.
 *
 *   npm run fetch-data
 *
 * Fontes (todas públicas, API de Serviço de Dados do IBGE — https://servicodados.ibge.gov.br/api/docs):
 *  - Localidades v1 ............ estados, regiões, municípios
 *  - Malhas v3 ................. GeoJSON das UFs (Brasil) e dos municípios de cada UF
 *  - Agregados v3 (SIDRA) ...... 6579 (estimativa de população), 4709 (Censo 2022), 5938 (PIB e VAB por setor)
 * Indicadores fora do IBGE (IDH, homicídios, IDEB, esgoto, dívida) vêm de data/ufs/indicadores-curados.json.
 *
 * Saída (o jogo NÃO acessa a internet em runtime):
 *  - public/data/ufs/index.json         resumo das 27 UFs
 *  - public/data/ufs/{UF}.json           ficha completa de cada UF
 *  - public/data/geo/brasil-ufs.geojson  contorno das UFs
 *  - public/data/geo/municipios/{UF}.geojson
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { geoArea } from 'd3-geo';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import {
  ArquivoTracos, DadosUF, IndicadoresCurados, IndiceUFs, SiglaUF,
  type DadosUF as TDadosUF,
} from '../src/data/schemas.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'data');
const API = 'https://servicodados.ibge.gov.br/api';
const RAIO_TERRA_KM = 6371.0088;
const GEOJSON = 'application/vnd.geo%2Bjson';
/** Último ano com VAB setorial municipal publicado (2022–2023 ainda vêm como "..." na API). */
const ANO_VAB = 2021;

const skipMunicipios = process.argv.includes('--sem-municipios');

async function getJSON<T>(url: string, tentativas = 4): Promise<T> {
  let ultimoErro: unknown;
  for (let i = 0; i < tentativas; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'nacao27-fetch-data' } });
      if (!res.ok) throw new Error(`HTTP ${res.status} em ${url}`);
      return (await res.json()) as T;
    } catch (e) {
      ultimoErro = e;
      const espera = 1000 * 2 ** i;
      console.warn(`  ! falhou (${String(e)}), tentando de novo em ${espera} ms`);
      await new Promise((r) => setTimeout(r, espera));
    }
  }
  throw ultimoErro;
}

interface Estado { id: number; sigla: string; nome: string; regiao: { sigla: string; nome: string } }
interface Municipio { id: number; nome: string; microrregiao?: { mesorregiao: { UF: { sigla: string } } }; 'regiao-imediata'?: { 'regiao-intermediaria': { UF: { sigla: string } } } }
interface Agregado {
  id: string;
  variavel: string;
  resultados: { series: { localidade: { id: string; nome: string }; serie: Record<string, string> }[] }[];
}

/**
 * Converte a resposta do SIDRA em mapa localidade → { ano, valor }, usando o período mais
 * recente que tenha número (o IBGE publica "..." enquanto um dado não foi divulgado).
 */
function serie(ag: Agregado): Map<string, { ano: number; valor: number }> {
  const m = new Map<string, { ano: number; valor: number }>();
  for (const s of ag.resultados[0].series) {
    const periodos = Object.entries(s.serie).sort(([a], [b]) => Number(b) - Number(a));
    for (const [ano, v] of periodos) {
      const valor = Number(v);
      if (v !== '' && Number.isFinite(valor)) {
        m.set(s.localidade.id, { ano: Number(ano), valor });
        break;
      }
    }
  }
  return m;
}

/**
 * Área esférica (esterradianos) somando os anéis externos. A malha do IBGE mistura orientações
 * de anel; o d3 interpreta um anel "ao contrário" como o resto do globo, então normalizamos.
 */
function areaEsferica(g: Geometry): number {
  const poligonos = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
  let total = 0;
  for (const p of poligonos) {
    let a = geoArea({ type: 'Polygon', coordinates: [p[0]] });
    if (a > 2 * Math.PI) a = 4 * Math.PI - a;
    total += a;
  }
  return total;
}

function arred(fc: FeatureCollection, casas = 4): FeatureCollection {
  const f = 10 ** casas;
  const r = (c: unknown): unknown => (typeof c === 'number' ? Math.round(c * f) / f : Array.isArray(c) ? c.map(r) : c);
  return {
    type: 'FeatureCollection',
    features: fc.features.map((ft) => ({ ...ft, geometry: { ...ft.geometry, coordinates: r((ft.geometry as { coordinates: unknown }).coordinates) } as Geometry })),
  };
}

async function main() {
  console.log('NAÇÃO 27 · coletando dados reais do IBGE…');
  await mkdir(join(OUT, 'ufs'), { recursive: true });
  await mkdir(join(OUT, 'geo', 'municipios'), { recursive: true });

  const tracos = ArquivoTracos.parse(JSON.parse(await readFile(join(ROOT, 'data/ufs/traits.json'), 'utf8')));
  const curados = IndicadoresCurados.parse(JSON.parse(await readFile(join(ROOT, 'data/ufs/indicadores-curados.json'), 'utf8')));

  console.log('· estados');
  const estados = await getJSON<Estado[]>(`${API}/v1/localidades/estados`);

  console.log('· municípios (nomes)');
  const municipios = await getJSON<Municipio[]>(`${API}/v1/localidades/municipios`);
  const ufDoMunicipio = (m: Municipio) =>
    m.microrregiao?.mesorregiao.UF.sigla ?? m['regiao-imediata']?.['regiao-intermediaria'].UF.sigla ?? String(m.id).slice(0, 2);

  console.log('· população estimada (SIDRA 6579), Censo 2022 (SIDRA 4709), PIB (SIDRA 5938)');
  const [popEst, censo, pibVars, vabMun, popMun] = await Promise.all([
    getJSON<Agregado[]>(`${API}/v3/agregados/6579/periodos/-1/variaveis/9324?localidades=N3[all]`),
    getJSON<Agregado[]>(`${API}/v3/agregados/4709/periodos/-1/variaveis/93?localidades=N3[all]`),
    getJSON<Agregado[]>(`${API}/v3/agregados/5938/periodos/-1/variaveis/37?localidades=N3[all]`),
    // O VAB setorial só é publicado por município (em UF vem "..."): somamos os 5.570 municípios.
    getJSON<Agregado[]>(`${API}/v3/agregados/5938/periodos/${ANO_VAB}/variaveis/513|517|6575|525?localidades=N6[all]`),
    getJSON<Agregado[]>(`${API}/v3/agregados/6579/periodos/-1/variaveis/9324?localidades=N6[all]`),
  ]);
  const pop = serie(popEst[0]);
  const pop22 = serie(censo[0]);
  const pibUF = serie(pibVars[0]);
  /** VAB por setor somado por UF (2 primeiros dígitos do código do município). */
  const vabUF = new Map<string, Record<string, number>>();
  for (const v of vabMun) {
    for (const [cod, { valor }] of serie(v)) {
      const uf = cod.slice(0, 2);
      const acc = vabUF.get(uf) ?? {};
      acc[v.id] = (acc[v.id] ?? 0) + valor;
      vabUF.set(uf, acc);
    }
  }
  const popMunicipio = serie(popMun[0]);

  console.log('· malha das UFs (Malhas v3)');
  const brasil = await getJSON<FeatureCollection>(
    `${API}/v3/malhas/paises/BR?intrarregiao=UF&formato=${GEOJSON}&qualidade=minima`,
  );
  const idParaSigla = new Map(estados.map((e) => [String(e.id), e.sigla]));
  for (const f of brasil.features) {
    const cod = String(f.properties?.codarea);
    f.properties = { codarea: cod, sigla: idParaSigla.get(cod) ?? '??' };
  }
  await writeFile(join(OUT, 'geo', 'brasil-ufs.geojson'), JSON.stringify(arred(brasil)));

  const gerado = new Date().toISOString();
  const resultado: TDadosUF[] = [];

  for (const e of [...estados].sort((a, b) => a.sigla.localeCompare(b.sigla))) {
    const sigla = SiglaUF.parse(e.sigla);
    const id = String(e.id);
    const feat = brasil.features.find((f) => f.properties?.codarea === id) as Feature | undefined;
    if (!feat) throw new Error(`Malha ausente para ${sigla}`);
    const areaKm2 = Math.round(areaEsferica(feat.geometry) * RAIO_TERRA_KM ** 2);

    const munis = municipios.filter((m) => ufDoMunicipio(m) === sigla || String(m.id).slice(0, 2) === id);
    const maiores = munis
      .map((m) => ({ id: m.id, nome: m.nome, populacao: popMunicipio.get(String(m.id))?.valor ?? 0 }))
      .sort((a, b) => b.populacao - a.populacao)
      .slice(0, 8);

    const p = pop.get(id)!;
    const pib = pibUF.get(id)!;
    const vab = vabUF.get(id) ?? {};
    const pibReais = pib.valor * 1000;
    const tr = tracos.ufs.find((t) => t.sigla === sigla)!;
    const ind = curados.valores[sigla];

    const dados = DadosUF.parse({
      id: e.id,
      sigla,
      nome: e.nome,
      regiao: { sigla: e.regiao.sigla, nome: e.regiao.nome },
      populacao: { valor: p.valor, ano: p.ano, censo2022: pop22.get(id)?.valor ?? p.valor },
      pib: {
        ano: pib.ano,
        total: pibReais,
        perCapita: Math.round(pibReais / p.valor),
        vab: {
          agro: (vab['513'] ?? 0) * 1000,
          industria: (vab['517'] ?? 0) * 1000,
          servicos: (vab['6575'] ?? 0) * 1000,
          adminPublica: (vab['525'] ?? 0) * 1000,
          ano: ANO_VAB,
        },
      },
      areaKm2,
      numMunicipios: munis.length,
      maioresMunicipios: maiores,
      indicadores: ind,
      tracos: tr,
      fontes: [
        { campo: 'populacao', fonte: 'IBGE — Estimativas de População (SIDRA 6579)', url: 'https://sidra.ibge.gov.br/tabela/6579', ano: p.ano, aproximado: false },
        { campo: 'pib', fonte: 'IBGE — PIB dos Municípios/Contas Regionais (SIDRA 5938)', url: 'https://sidra.ibge.gov.br/tabela/5938', ano: pib.ano, aproximado: false },
        { campo: 'areaKm2', fonte: 'Calculada da malha IBGE (qualidade mínima)', url: `${API}/docs/malhas?versao=3`, ano: 2022, aproximado: true },
        ...Object.entries(curados.fontes).map(([campo, f]) => ({ campo, fonte: f.nome, url: f.url, ano: f.ano, aproximado: f.aproximado })),
      ],
      geradoEm: gerado,
    });
    resultado.push(dados);
    await writeFile(join(OUT, 'ufs', `${sigla}.json`), JSON.stringify(dados, null, 1));
    console.log(`  ✓ ${sigla} ${e.nome.padEnd(20)} pop ${p.valor.toLocaleString('pt-BR')} (${p.ano}) · PIB R$ ${(pibReais / 1e9).toFixed(1)} bi (${pib.ano}) · ${munis.length} municípios`);

    const arqMun = join(OUT, 'geo', 'municipios', `${sigla}.geojson`);
    if (!skipMunicipios && !existsSync(arqMun)) {
      const malha = await getJSON<FeatureCollection>(
        `${API}/v3/malhas/estados/${id}?intrarregiao=municipio&formato=${GEOJSON}&qualidade=minima`,
      );
      const nomes = new Map(munis.map((m) => [String(m.id), m.nome]));
      for (const f of malha.features) {
        const cod = String(f.properties?.codarea);
        f.properties = { codarea: cod, nome: nomes.get(cod) ?? '' };
      }
      await writeFile(arqMun, JSON.stringify(arred(malha)));
    }
  }

  const indice = IndiceUFs.parse({
    geradoEm: gerado,
    ufs: resultado.map(({ fontes: _f, maioresMunicipios: _m, ...resto }) => resto),
  });
  await writeFile(join(OUT, 'ufs', 'index.json'), JSON.stringify(indice));
  const popTotal = resultado.reduce((s, u) => s + u.populacao.valor, 0);
  console.log(`\nPronto: 27 UFs, ${popTotal.toLocaleString('pt-BR')} habitantes. Dados em public/data/.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
