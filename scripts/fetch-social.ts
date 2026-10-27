/**
 * NAÇÃO 27 — indicadores sociais reais das 27 UFs (Fase 5).
 *
 *   npm run fetch-social
 *
 * DATASUS / TabNet (formulários tabcgi.exe, saída "prn" separada por ;):
 *  - SINASC  nascidos vivos por UF de residência da mãe
 *  - SIM     óbitos infantis (< 1 ano) por UF de residência  → mortalidade infantil = óbitos / nascidos × 1000
 *  - CNES    leitos de internação SUS por UF (competência de dezembro)
 * IBGE / SIDRA (PNAD Contínua):
 *  - 4099  taxa de desocupação (último trimestre disponível)
 *  - 7438  limites dos percentis de rendimento domiciliar per capita → % abaixo da linha de extrema pobreza
 *  - 7435  índice de Gini do rendimento domiciliar per capita
 *
 * Saída: public/data/social/indicadores.json
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DadosSociais, type SocialUF } from '../src/data/social.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'data', 'social');
const TABNET = 'http://tabnet.datasus.gov.br/cgi/tabcgi.exe';
const SIDRA = 'https://apisidra.ibge.gov.br/values';

/** Ano consolidado do SIM/SINASC (os dois anos mais recentes ainda são preliminares). */
const ANO_VITAIS = Number(process.env.ANO_VITAIS ?? 2023);
/** Competência do CNES (AAMM). */
const COMP_CNES = process.env.COMP_CNES ?? '2412';
/** Linha de extrema pobreza do Programa Bolsa Família (Lei 14.601/2023): R$ 218 per capita/mês. */
const LINHA = 218;

const UFS: [string, number][] = [
  ['AC', 12], ['AL', 27], ['AP', 16], ['AM', 13], ['BA', 29], ['CE', 23], ['DF', 53], ['ES', 32], ['GO', 52],
  ['MA', 21], ['MT', 51], ['MS', 50], ['MG', 31], ['PA', 15], ['PB', 25], ['PR', 41], ['PE', 26], ['PI', 22],
  ['RJ', 33], ['RN', 24], ['RS', 43], ['RO', 11], ['RR', 14], ['SC', 42], ['SP', 35], ['SE', 28], ['TO', 17],
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function tentar<T>(f: () => Promise<T>, nome: string): Promise<T> {
  for (let t = 0; ; t++) {
    try { return await f(); } catch (e) {
      if (t >= 4) throw new Error(`${nome}: ${(e as Error).message}`);
      await sleep(2000 * (t + 1));
    }
  }
}

/** O TabNet espera o formulário em ISO-8859-1. */
function urlencodeLatin1(s: string): string {
  return [...Buffer.from(s, 'latin1')].map((b) => {
    const c = String.fromCharCode(b);
    return /[A-Za-z0-9_.\-*]/.test(c) ? c : '%' + b.toString(16).toUpperCase().padStart(2, '0');
  }).join('');
}

/** Consulta uma tabela do TabNet com linha = UF e devolve o valor por código IBGE da UF. */
async function tabnet(def: string, incremento: string, arquivo: string): Promise<Map<number, number>> {
  const campos: [string, string][] = [
    ['Linha', 'Unidade_da_Federação'], ['Coluna', '--Não-Ativa--'], ['Incremento', incremento], ['Arquivos', arquivo],
    ['SRegião', 'TODAS_AS_CATEGORIAS__'], ['SUnidade_da_Federação', 'TODAS_AS_CATEGORIAS__'], ['formato', 'prn'], ['mostre', 'Mostra'],
  ];
  const body = campos.map(([k, v]) => `${urlencodeLatin1(k)}=${urlencodeLatin1(v)}`).join('&');
  return tentar(async () => {
    const r = await fetch(`${TABNET}?${def}`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'nacao27-fetch-social' }, body });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const txt = Buffer.from(await r.arrayBuffer()).toString('latin1');
    const pre = txt.match(/<PRE>([\s\S]*?)<\/PRE>/i);
    if (!pre) throw new Error('resposta sem tabela');
    const out = new Map<number, number>();
    for (const linha of pre[1].split('\n')) {
      const m = linha.match(/^"(\d{2}) [^"]*";(\d+)/);
      if (m) out.set(Number(m[1]), Number(m[2]));
    }
    if (out.size !== 27) throw new Error(`esperava 27 UFs, veio ${out.size}`);
    return out;
  }, `TabNet ${def}`);
}

interface LinhaSidra { D1C: string; V: string; [k: string]: string }
async function sidra(caminho: string): Promise<LinhaSidra[]> {
  return tentar(async () => {
    const r = await fetch(`${SIDRA}/${caminho}`, { headers: { 'User-Agent': 'nacao27-fetch-social' } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = (await r.json()) as LinhaSidra[];
    return j.slice(1);
  }, `SIDRA ${caminho}`);
}

/**
 * % da população abaixo de `linha`, interpolando linearmente entre os limites dos percentis
 * (0 → P5 → P10 → P20…). Limites em R$ de rendimento domiciliar per capita.
 */
export function fracaoAbaixo(limites: [number, number][], linha: number): number {
  const pts: [number, number][] = [[0, 0], ...limites.sort((a, b) => a[0] - b[0])];
  for (let i = 1; i < pts.length; i++) {
    const [p0, v0] = pts[i - 1], [p1, v1] = pts[i];
    if (linha <= v1) return p0 + ((linha - v0) / Math.max(1e-9, v1 - v0)) * (p1 - p0);
  }
  return pts[pts.length - 1][0];
}

async function main() {
  const aa = String(ANO_VITAIS).slice(2);
  console.log(`DATASUS: SINASC/SIM ${ANO_VITAIS}, CNES ${COMP_CNES}…`);
  const nascidos = await tabnet('sinasc/cnv/nvuf.def', 'Nascim_p/resid.mãe', `nvuf${aa}.dbf`);
  const obitos = await tabnet('sim/cnv/inf10uf.def', 'Óbitos_p/Residênc', `infuf${aa}.dbf`);
  const leitos = await tabnet('cnes/cnv/leiintbr.def', 'Quantidade_SUS', `ltbr${COMP_CNES}.dbf`);

  console.log('SIDRA: PNAD Contínua…');
  const desoc = await sidra('t/4099/n3/all/v/4099/p/last%201');
  const periodoDesoc = desoc[0]?.D3N ?? '';
  const perc = await sidra('t/7438/n3/all/v/10769/p/last%201/c1019/allxt');
  const anoPerc = perc[0]?.D3N ?? '';
  const gini = await sidra('t/7435/n3/all/v/10681/p/last%201');

  const pop = new Map<string, number>();
  for (const [s] of UFS) {
    const uf = JSON.parse(await readFile(join(ROOT, 'public', 'data', 'ufs', `${s}.json`), 'utf8')) as { populacao: { valor: number } };
    pop.set(s, uf.populacao.valor);
  }

  const valores: Record<string, SocialUF> = {};
  for (const [s, c] of UFS) {
    const n = nascidos.get(c)!, o = obitos.get(c)!, l = leitos.get(c)!;
    const limites: [number, number][] = perc.filter((r) => Number(r.D1C) === c && /^P\d+$/.test(r.D4N ?? ''))
      .map((r) => [Number(r.D4N.slice(1)), Number(r.V)]);
    const d = desoc.find((r) => Number(r.D1C) === c);
    const g = gini.find((r) => Number(r.D1C) === c);
    if (!d || !g || limites.length < 5) throw new Error(`PNAD incompleta para ${s}`);
    valores[s] = {
      nascidos: n,
      obitosInfantis: o,
      mortalidadeInfantil: Math.round((o / n) * 1000 * 10) / 10,
      leitosSUS: l,
      leitosPorMil: Math.round((l / pop.get(s)!) * 1000 * 100) / 100,
      desemprego: Number(d.V) / 100,
      extremaPobreza: Math.round(fracaoAbaixo(limites, LINHA) * 10) / 10,
      gini: Number(g.V),
      rendaMediana: limites.find(([p]) => p === 50)?.[1] ?? 0,
    };
  }

  const dados = DadosSociais.parse({
    geradoEm: new Date().toISOString(),
    linhaExtremaPobreza: LINHA,
    fontes: {
      mortalidadeInfantil: { nome: 'SIM (óbitos < 1 ano) e SINASC (nascidos vivos), por residência — DATASUS/TabNet', url: 'http://tabnet.datasus.gov.br/', periodo: String(ANO_VITAIS) },
      leitos: { nome: 'CNES — leitos de internação, quantidade SUS — DATASUS/TabNet', url: 'http://tabnet.datasus.gov.br/cgi/deftohtm.exe?cnes/cnv/leiintbr.def', periodo: `${COMP_CNES.slice(2)}/20${COMP_CNES.slice(0, 2)}` },
      desemprego: { nome: 'PNAD Contínua — taxa de desocupação (SIDRA 4099)', url: 'https://sidra.ibge.gov.br/tabela/4099', periodo: periodoDesoc },
      extremaPobreza: { nome: `PNAD Contínua — % abaixo de R$ ${LINHA}/mês per capita (interpolado nos percentis da SIDRA 7438; linha do Bolsa Família)`, url: 'https://sidra.ibge.gov.br/tabela/7438', periodo: anoPerc },
      gini: { nome: 'PNAD Contínua — Gini do rendimento domiciliar per capita (SIDRA 7435)', url: 'https://sidra.ibge.gov.br/tabela/7435', periodo: anoPerc },
    },
    valores,
  });
  await mkdir(OUT, { recursive: true });
  await writeFile(join(OUT, 'indicadores.json'), JSON.stringify(dados, null, 1));
  console.log('UF  mort.inf  leitos/mil  desemp  ext.pobreza  gini');
  for (const [s] of UFS) {
    const x = valores[s];
    console.log(`${s}  ${x.mortalidadeInfantil.toFixed(1).padStart(7)}  ${x.leitosPorMil.toFixed(2).padStart(9)}  ${(x.desemprego * 100).toFixed(1).padStart(5)}%  ${x.extremaPobreza.toFixed(1).padStart(10)}%  ${x.gini.toFixed(3)}`);
  }
  console.log(`ok → public/data/social/indicadores.json`);
}

main().catch((e) => { console.error(e); process.exit(1); });
