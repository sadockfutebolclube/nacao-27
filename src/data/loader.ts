/** Carregamento dos dados empacotados em public/data (gerados por scripts/fetch-data.ts). */
import type { FeatureCollection } from 'geojson';
import { DadosFiscais } from './fiscal';
import { DadosSociais, type SocialUF } from './social';
import { DadosClima, type NormaisUF } from './clima';
import { EleitoradoUF } from './eleitorado';
import { MunicipiosUF } from './municipios';
import { DadosMacro } from './macro';
import { CidadeReal } from './cidadeReal';
import { DadosUF, IndiceUFs, type SiglaUF } from './schemas';

const base = `${import.meta.env.BASE_URL}data`;

async function json<T>(path: string): Promise<T> {
  const res = await fetch(`${base}/${path}`);
  if (!res.ok) throw new Error(`Não consegui carregar ${path} (HTTP ${res.status}). Rode "npm run fetch-data".`);
  return (await res.json()) as T;
}

let indiceCache: Promise<IndiceUFs> | null = null;
let geoCache: Promise<FeatureCollection> | null = null;
const malhasMun = new Map<string, Promise<FeatureCollection>>();

/** Malha dos municípios da UF (IBGE). */
export function carregarMalhaMunicipios(sigla: SiglaUF): Promise<FeatureCollection> {
  if (!malhasMun.has(sigla)) malhasMun.set(sigla, json<FeatureCollection>(`geo/municipios/${sigla}.geojson`));
  return malhasMun.get(sigla)!;
}

export function carregarIndice(): Promise<IndiceUFs> {
  indiceCache ??= json<unknown>('ufs/index.json').then((j) => IndiceUFs.parse(j));
  return indiceCache;
}

export function carregarMalhaBrasil(): Promise<FeatureCollection> {
  geoCache ??= json<FeatureCollection>('geo/brasil-ufs.geojson');
  return geoCache;
}

export async function carregarUF(sigla: SiglaUF): Promise<DadosUF> {
  return DadosUF.parse(await json<unknown>(`ufs/${sigla}.json`));
}

/** Dados fiscais reais (SICONFI) da UF — gerados por scripts/fetch-fiscal.ts. */
export async function carregarFiscal(sigla: SiglaUF): Promise<DadosFiscais | null> {
  try {
    return DadosFiscais.parse(await json<unknown>(`fiscal/${sigla}.json`));
  } catch (e) {
    console.warn(`[fiscal] dados de ${sigla} indisponíveis — o jogo segue só com a Visão Cidade.`, e);
    return null;
  }
}

/** Indicadores sociais reais (DATASUS/PNAD) da UF — gerados por scripts/fetch-social.ts. */
export async function carregarSocial(sigla: SiglaUF): Promise<SocialUF | null> {
  try {
    return DadosSociais.parse(await json<unknown>('social/indicadores.json')).valores[sigla] ?? null;
  } catch (e) {
    console.warn('[social] indicadores DATASUS/PNAD indisponíveis — estimativa pelo IDH.', e);
    return null;
  }
}

/** Normais climatológicas da capital (ERA5 1991–2020) — geradas por scripts/fetch-clima.ts. */
export async function carregarClima(sigla: SiglaUF): Promise<NormaisUF | null> {
  try {
    return DadosClima.parse(await json<unknown>('clima/normais.json')).ufs[sigla] ?? null;
  } catch (e) {
    console.warn('[clima] normais indisponíveis — clima sintético pela latitude.', e);
    return null;
  }
}

/** Eleitorado real por município (TSE 2022) — gerado por scripts/fetch-eleitorado.ts. */
let indiceCidades: Promise<string[]> | null = null;
/** Códigos IBGE com cidade real disponível (Fase 11). */
export function cidadesReais(): Promise<string[]> {
  indiceCidades ??= json<string[]>('cidades/index.json').catch(() => []);
  return indiceCidades;
}
/** Ruas, prédios e relevo reais de um município (Fase 11); null = mapa procedural. */
export async function carregarCidadeReal(ibge: string): Promise<CidadeReal | null> {
  if (!(await cidadesReais()).includes(ibge)) return null;
  try {
    return CidadeReal.parse(await json<unknown>(`cidades/${ibge}.json`));
  } catch (e) {
    console.warn('[cidade real] indisponível', e);
    return null;
  }
}

let macroCache: Promise<DadosMacro> | null = null;
/** Conjuntura macroeconômica do Brasil (Fase 9 — Modo Presidente). */
export function carregarMacro(): Promise<DadosMacro> {
  macroCache ??= json<unknown>('macro/brasil.json').then((j) => DadosMacro.parse(j));
  return macroCache;
}

/** Municípios jogáveis da UF (Fase 8); null = só a capital. */
export async function carregarMunicipios(sigla: SiglaUF): Promise<MunicipiosUF | null> {
  try {
    return MunicipiosUF.parse(await json<unknown>(`municipios/${sigla}.json`));
  } catch (e) {
    console.warn('[municipios] indisponível — só a capital é jogável.', e);
    return null;
  }
}

export async function carregarEleitorado(sigla: SiglaUF): Promise<EleitoradoUF | null> {
  try {
    return EleitoradoUF.parse(await json<unknown>(`eleitorado/${sigla}.json`));
  } catch (e) {
    console.warn('[eleitorado] indisponível — sem eleição neste jogo.', e);
    return null;
  }
}
