/**
 * NAÇÃO 27 — conjuntura macroeconômica do Brasil para o Modo Presidente (Fase 9).
 *
 *   npm run fetch-macro
 *
 * Fontes:
 *  - Banco Central, SGS (https://api.bcb.gov.br/dados/serie/bcdata.sgs.{código}/dados): Selic meta (432),
 *    IPCA 12 meses (13522), câmbio PTAX venda (1), desocupação PNAD Contínua (24369), dívida bruta do governo
 *    geral % PIB (13762), dívida líquida do setor público % PIB (4513), NFSP primária 12 meses % PIB (5793,
 *    positivo = déficit), NFSP nominal 12 meses % PIB (5727), PIB mensal a preços correntes (4380) e
 *    variação real anual do PIB (7326);
 *  - Banco Central, Focus (https://olinda.bcb.gov.br/olinda/servico/Expectativas): medianas de IPCA e Selic;
 *  - eleitorado por UF: soma de public/data/eleitorado/{UF}.json (TSE 2022);
 *  - composição do orçamento primário do governo central: valores aproximados do Resultado do Tesouro
 *    Nacional 2025 (% PIB), curados à mão.
 *
 * Saída: public/data/macro/brasil.json
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DadosMacro } from '../src/data/macro.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'data', 'macro');
const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];

interface Obs { data: string; valor: number }
/** n ≤ 20: últimas n observações; séries diárias longas vão por período (n meses), pois a API limita "ultimos". */
async function sgs(codigo: number, n: number, meses = 0): Promise<Obs[]> {
  const fmt = (d: Date) => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  const ini = new Date(); ini.setMonth(ini.getMonth() - meses);
  const url = meses ? `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${codigo}/dados?formato=json&dataInicial=${fmt(ini)}&dataFinal=${fmt(new Date())}` : `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${codigo}/dados/ultimos/${n}?formato=json`;
  for (let t = 0; ; t++) {
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = (await r.json()) as { data: string; valor: string }[];
      // dd/mm/aaaa → aaaa-mm-dd
      return j.map((o) => ({ data: o.data.split('/').reverse().join('-'), valor: Number(o.valor) })).sort((a, b) => a.data.localeCompare(b.data));
    } catch (e) {
      if (t >= 4) throw new Error(`SGS ${codigo}: ${e}`);
      await new Promise((r) => setTimeout(r, 3000 * (t + 1)));
    }
  }
}
const ultimo = (s: Obs[]) => s[s.length - 1];

/** Média mensal de uma série diária. */
function mensal(s: Obs[]): Obs[] {
  const m = new Map<string, number[]>();
  for (const o of s) { const k = o.data.slice(0, 7); m.set(k, [...(m.get(k) ?? []), o.valor]); }
  return [...m.entries()].map(([k, v]) => ({ data: `${k}-01`, valor: Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 1e4) / 1e4 }));
}

async function focus() {
  const filtro = encodeURIComponent("Indicador eq 'IPCA' or Indicador eq 'Selic'");
  const url = `https://olinda.bcb.gov.br/olinda/servico/Expectativas/versao/v1/odata/ExpectativasMercadoAnuais?$top=40&$orderby=Data%20desc&$filter=${filtro}&$format=json&$select=Indicador,Data,DataReferencia,Mediana`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Focus HTTP ${r.status}`);
  const v = ((await r.json()) as { value: { Indicador: string; Data: string; DataReferencia: string; Mediana: number }[] }).value;
  const data = v[0].Data;
  const ano = Number(data.slice(0, 4));
  const de = (ind: string, ref: number) => v.find((x) => x.Indicador === ind && x.Data === data && Number(x.DataReferencia) === ref)?.Mediana ?? null;
  return { data, ipcaAnoQueVem: de('IPCA', ano + 1) ?? 4, ipcaLongo: de('IPCA', ano + 3) ?? de('IPCA', ano + 2) ?? 3.5, selicFimAno: de('Selic', ano) };
}

async function main() {
  const [selic, ipca, cambio, deso, dbgg, dlsp, nfspPrim, nfspNom, pibMes, pibReal] = await Promise.all([
    sgs(432, 0, 24), sgs(13522, 0, 25), sgs(1, 0, 24), sgs(24369, 0, 25), sgs(13762, 0, 25), sgs(4513, 2), sgs(5793, 2), sgs(5727, 2), sgs(4380, 12), sgs(7326, 2),
  ]);
  const eleitorado: Record<string, number> = {};
  for (const uf of UFS) eleitorado[uf] = (JSON.parse(await readFile(join(ROOT, 'public', 'data', 'eleitorado', `${uf}.json`), 'utf8')) as { total: number }).total;
  const f = await focus();
  const primario = -ultimo(nfspPrim).valor;
  const dados = DadosMacro.parse({
    geradoEm: new Date().toISOString(),
    selicMeta: ultimo(selic).valor,
    ipca12m: ultimo(ipca).valor,
    cambio: ultimo(cambio).valor,
    desemprego: ultimo(deso).valor,
    dividaBruta: ultimo(dbgg).valor,
    dividaLiquida: ultimo(dlsp).valor,
    primario,
    juros: ultimo(nfspNom).valor - ultimo(nfspPrim).valor,
    pibNominal: pibMes.reduce((a, o) => a + o.valor, 0) * 1e6,
    pibReal: ultimo(pibReal).valor,
    focus: f,
    historico: {
      ipca12m: ipca, desemprego: deso, dividaBruta: dbgg,
      selic: mensal(selic).slice(-24), cambio: mensal(cambio).slice(-24),
    },
    orcamento: {
      fonte: 'Resultado do Tesouro Nacional 2025 (aproximado, % do PIB)',
      receitaLiquida: 18.6,
      despesas: {
        previdencia: 8.1, pessoal: 3.2, bpc: 0.95, abonoSeguro: 0.75, bolsa: 1.4, saude: 1.75, educacao: 1.15,
        investimentos: 0.65, emendas: 0.45, custeio: 0.9,
      },
    },
    eleitorado,
    fontes: [
      { nome: 'Banco Central do Brasil — SGS', url: 'https://www3.bcb.gov.br/sgspub' },
      { nome: 'Banco Central do Brasil — Focus', url: 'https://olinda.bcb.gov.br/olinda/servico/Expectativas/versao/v1/aplicacao' },
      { nome: 'Tesouro Nacional — Resultado do Tesouro Nacional', url: 'https://www.tesourotransparente.gov.br/temas/estatisticas-fiscais-e-planejamento/resultado-do-tesouro-nacional-rtn' },
      { nome: 'TSE — eleitorado 2022', url: 'https://dadosabertos.tse.jus.br/dataset/eleitorado-2022' },
    ],
  });
  await mkdir(OUT, { recursive: true });
  await writeFile(join(OUT, 'brasil.json'), JSON.stringify(dados));
  console.log(`Selic ${dados.selicMeta}% · IPCA ${dados.ipca12m}% · US$ R$ ${dados.cambio} · desocupação ${dados.desemprego}% · DBGG ${dados.dividaBruta}% · primário ${dados.primario.toFixed(2)}% · juros ${dados.juros.toFixed(2)}% · PIB R$ ${(dados.pibNominal / 1e12).toFixed(2)} tri (${dados.pibReal}% real) · Focus ${f.data}: IPCA ${f.ipcaAnoQueVem} / ${f.ipcaLongo}, Selic ${f.selicFimAno}`);
  console.log(`eleitorado: ${(Object.values(eleitorado).reduce((a, b) => a + b, 0) / 1e6).toFixed(1)} milhões → public/data/macro/brasil.json`);
}

main().catch((e) => { console.error(e); process.exit(1); });
