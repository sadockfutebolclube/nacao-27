/**
 * NAÇÃO 27 — dados fiscais reais das 27 UFs a partir do SICONFI (Tesouro Nacional).
 *
 *   npm run fetch-fiscal            (exercício padrão: 2024, último completo homologado)
 *   npm run fetch-fiscal -- 2023    (outro exercício)
 *
 * API: https://apidatalake.tesouro.gov.br/docs/siconfi/
 *  - RREO Anexo 01  despesa por grupo de natureza (pessoal, juros, custeio, investimento, amortização)
 *  - RREO Anexo 02  despesa por função (saúde, educação, segurança…)
 *  - RREO Anexo 03  receita corrente líquida e composição (ICMS, IPVA, ITCD, FPE, deduções)
 *  - RREO Anexo 04  previdência (RPPS: fundos em repartição e capitalização, militares)
 *  - RREO Anexo 14  mínimos constitucionais (saúde 12%, MDE 25%)
 *  - RGF  Anexo 01  despesa total com pessoal (LRF)
 *  - RGF  Anexo 02  dívida consolidada e disponibilidade de caixa
 *
 * Saída: public/data/fiscal/{UF}.json e public/data/fiscal/index.json
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DadosFiscais, type DadosFiscais as TDadosFiscais } from '../src/data/fiscal.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'data', 'fiscal');
const API = 'https://apidatalake.tesouro.gov.br/ords/siconfi/tt';
const ANO = Number(process.argv[2] ?? 2024);

const UFS: [string, number][] = [
  ['AC', 12], ['AL', 27], ['AP', 16], ['AM', 13], ['BA', 29], ['CE', 23], ['DF', 53], ['ES', 32], ['GO', 52],
  ['MA', 21], ['MT', 51], ['MS', 50], ['MG', 31], ['PA', 15], ['PB', 25], ['PR', 41], ['PE', 26], ['PI', 22],
  ['RJ', 33], ['RN', 24], ['RS', 43], ['RO', 11], ['RR', 14], ['SC', 42], ['SP', 35], ['SE', 28], ['TO', 17],
];

interface Item { cod_conta: string; conta: string; coluna: string; valor: number }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function itens(url: string): Promise<Item[]> {
  for (let t = 0; t < 5; t++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'nacao27-fetch-fiscal' } });
      if (res.status === 429) { await sleep(3000 * (t + 1)); continue; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = (await res.json()) as { items: Item[] };
      return j.items ?? [];
    } catch (e) {
      if (t === 4) throw e;
      await sleep(1500 * (t + 1));
    }
  }
  return [];
}

const rreo = (ano: number, anexo: string, id: number) =>
  itens(`${API}/rreo?an_exercicio=${ano}&nr_periodo=6&co_tipo_demonstrativo=RREO&no_anexo=${encodeURIComponent(anexo)}&id_ente=${id}`);
const rgf = (ano: number, anexo: string, id: number) =>
  itens(`${API}/rgf?an_exercicio=${ano}&in_periodicidade=Q&nr_periodo=3&co_tipo_demonstrativo=RGF&no_anexo=${encodeURIComponent(anexo)}&co_esfera=E&co_poder=E&id_ente=${id}`);

/** Valor de uma conta numa coluna (primeira ocorrência). Código terminado em "*" casa por prefixo. */
function v(its: Item[], cod: string, coluna: RegExp, conta?: string): number {
  const casa = (c: string) => (cod.endsWith('*') ? c.startsWith(cod.slice(0, -1)) : c === cod);
  const r = its.find((i) => casa(i.cod_conta) && coluna.test(i.coluna) && (!conta || i.conta.trim() === conta));
  return r ? Number(r.valor) : 0;
}

const FUNCOES: Record<string, string> = {
  legislativa: 'Legislativa', judiciaria: 'Judiciária', essencialJustica: 'Essencial à Justiça', administracao: 'Administração',
  seguranca: 'Segurança Pública', assistencia: 'Assistência Social', previdencia: 'Previdência Social', saude: 'Saúde',
  trabalho: 'Trabalho', educacao: 'Educação', cultura: 'Cultura', direitosCidadania: 'Direitos da Cidadania', urbanismo: 'Urbanismo',
  habitacao: 'Habitação', saneamento: 'Saneamento', gestaoAmbiental: 'Gestão Ambiental', cienciaTecnologia: 'Ciência e Tecnologia',
  agricultura: 'Agricultura', industria: 'Indústria', comercioServicos: 'Comércio e Serviços', energia: 'Energia',
  transporte: 'Transporte', desporto: 'Desporto e Lazer', encargosEspeciais: 'Encargos Especiais',
};

async function coletar(sigla: string, id: number, ano: number): Promise<TDadosFiscais> {
  const [a01, a02, a03, a04, a14, g01, g02] = [
    await rreo(ano, 'RREO-Anexo 01', id), await rreo(ano, 'RREO-Anexo 02', id), await rreo(ano, 'RREO-Anexo 03', id),
    await rreo(ano, 'RREO-Anexo 04', id), await rreo(ano, 'RREO-Anexo 14', id),
    await rgf(ano, 'RGF-Anexo 01', id), await rgf(ano, 'RGF-Anexo 02', id),
  ];
  if (!a03.length || !g01.length) throw new Error(`sem RREO/RGF para ${sigla} em ${ano}`);
  const T12 = /TOTAL \(ÚLTIMOS 12 MESES\)/;
  const LIQ = /LIQUIDADAS ATÉ O BIMESTRE/;
  const Q3 = /Até o 3º Quadrimestre/;
  const REAL = /REALIZADAS ATÉ O BIMESTRE/;

  const funcoes: Record<string, number> = {};
  for (const [k, nome] of Object.entries(FUNCOES)) funcoes[k] = v(a02, 'RREO2TotalDespesas', LIQ, nome);

  const pessoalAtivo = v(g01, 'DespesaComPessoalAtivoBruta', /TOTAL/);
  const pessoalInativo = v(g01, 'DespesaComPessoalInativoEPensionistasBruta', /TOTAL/);
  const dtp = v(g01, 'DespesaComPessoalTotal', /Valor/);
  const rclPessoal = v(g01, 'ReceitaCorrenteLiquidaAjustada', /Valor/) || v(g01, 'ReceitaCorrenteLiquidaLimiteLegal', /Valor/);

  // alguns entes (ex.: AP) informam o percentual como fração (0,18 em vez de 18)
  const pct = (x: number) => (x > 0 && x < 1 ? x * 100 : x);
  return DadosFiscais.parse({
    sigla, ano,
    receitas: {
      correntes: v(a03, 'ReceitasCorrentesLiquidasExcetoTransferenciasEFUNDEB', T12),
      icms: v(a03, 'ICMSLiquidoExcetoTransferenciasEFUNDEB', T12),
      ipva: v(a03, 'IPVALiquidoExcetoTransferenciasEFUNDEB', T12),
      itcd: v(a03, 'ITCDLiquidoExcetoTransferenciasEFUNDEB', T12),
      irrf: v(a03, 'IRRFLiquidoExcetoTransferenciasEFUNDEB', T12),
      outrasTributarias: v(a03, 'OutrasReceitasTributarias', T12),
      contribuicoes: v(a03, 'RREO3ReceitaDeContribuicoes', T12),
      patrimonial: v(a03, 'RREO3ReceitaPatrimonial', T12),
      servicos: v(a03, 'RREO3ReceitaDeServicos', T12) + v(a03, 'RREO3ReceitaIndustrial', T12) + v(a03, 'RREO3ReceitaAgropecuaria', T12),
      fpe: v(a03, 'RREO3CotaParteDoFPE', T12),
      lc61: v(a03, 'RREO3TransferenciasDaLC611989', T12),
      fundebRecebido: v(a03, 'RREO3TransferenciasDoFUNDEB', T12),
      outrasTransferencias: v(a03, 'RREO3OutrasTransferenciasCorrentes', T12),
      outrasCorrentes: v(a03, 'RREO3OutrasReceitasCorrentes', T12),
    },
    deducoes: {
      total: v(a03, 'DeducoesDaReceitaCorrenteLiquida', T12),
      transferenciasMunicipios: v(a03, 'ReceitaDeTransferenciasConstitucionaisELegais', T12),
      contribuicaoServidor: v(a03, 'ContribuicaoDoServidorParaOPlanoDePrevidencia', T12),
      compensacaoPrevidencia: v(a03, 'CompensacaoFinanceiraEntreRegimesPrevidencia', T12),
      rendimentosPrevidencia: v(a03, 'RendimentosDeAplicacoesDeRecursosPrevidenciarios', T12),
      formacaoFundeb: v(a03, 'DeducaoDeReceitaParaFormacaoDoFUNDEB', T12),
    },
    rcl: v(a03, 'RREO3ReceitaCorrenteLiquida', T12),
    despesas: {
      pessoal: v(a01, 'PessoalEEncargosSociais', LIQ),
      juros: v(a01, 'JurosEEncargosDaDivida', LIQ),
      outrasCorrentes: v(a01, 'OutrasDespesasCorrentes', LIQ),
      investimentos: v(a01, 'Investimentos', LIQ),
      inversoes: v(a01, 'InversoesFinanceiras', LIQ),
      amortizacao: v(a01, 'AmortizacaoDaDivida', LIQ),
    },
    funcoes,
    pessoal: { ativo: pessoalAtivo, inativo: pessoalInativo, dtp, rcl: rclPessoal, pctRcl: rclPessoal ? (dtp / rclPessoal) * 100 : 0 },
    previdencia: {
      receitas: v(a04, 'TotalReceitasRPPSFinanceiro', REAL) + v(a04, 'TotalReceitasRPPSPrevidenciario', REAL) + v(a04, 'TotalDasContribucoesDosMilirares', REAL),
      despesas: v(a04, 'TotalDasDespesasRPPSFinanceiro', LIQ) + v(a04, 'TotalDasDespesasRPPSPrevidenciario', LIQ)
        + v(a04, 'TotalDasDespesasComInativosEPensionistasMilirares', LIQ) + v(a04, 'TotalDasDespesasBeneficiosMantidosPeloTesouro', LIQ),
    },
    minimos: {
      saudePct: pct(v(a14, 'AplicacaoTotalDasDespesasComAcoesEServicosPublicosDeSaude*', /% Aplicado/)),
      saudeValor: v(a14, 'AplicacaoTotalDasDespesasComAcoesEServicosPublicosDeSaude*', /Valor Apurado/),
      educacaoPct: pct(v(a14, 'MinimoAnualDasReceitasDeImpostosNaManutencaoEDesenvolvimento*', /% Aplicado/)),
      educacaoValor: v(a14, 'MinimoAnualDasReceitasDeImpostosNaManutencaoEDesenvolvimento*', /Valor Apurado/),
    },
    divida: {
      consolidada: v(g02, 'DividaConsolidada', Q3),
      liquida: v(g02, 'DividaConsolidadaLiquida', Q3),
      uniao: v(g02, 'RGF2ReestruturacaoDaDividaDeEstadosEMunicipios', Q3),
      emprestimos: v(g02, 'RGF2Emprestimos', Q3),
      caixa: v(g02, 'RGF2DisponibilidadeDeCaixa', Q3),
      rcl: v(g02, 'RGF2ReceitaCorrenteLiquida', Q3),
    },
    fonte: `SICONFI/Tesouro Nacional — RREO 6º bimestre e RGF 3º quadrimestre de ${ano}`,
    coletadoEm: new Date().toISOString(),
  });
}

async function main() {
  await mkdir(OUT, { recursive: true });
  console.log(`NAÇÃO 27 · dados fiscais do SICONFI (${ANO})`);
  const resumo: Record<string, unknown>[] = [];
  for (const [sigla, id] of UFS) {
    let d: TDadosFiscais | null = null;
    for (const ano of [ANO, ANO - 1]) {
      try { d = await coletar(sigla, id, ano); break; } catch (e) { console.warn(`  ! ${sigla} ${ano}: ${String(e)}`); }
    }
    if (!d) throw new Error(`Falha ao coletar ${sigla}`);
    await writeFile(join(OUT, `${sigla}.json`), JSON.stringify(d, null, 1));
    const bi = (x: number) => (x / 1e9).toFixed(1);
    console.log(`  ✓ ${sigla} ${d.ano} · RCL ${bi(d.rcl)} bi · pessoal ${d.pessoal.pctRcl.toFixed(1)}% RCL · DCL ${bi(d.divida.liquida)} bi · saúde ${d.minimos.saudePct}% · MDE ${d.minimos.educacaoPct}%`);
    resumo.push({ sigla, ano: d.ano, rcl: d.rcl, pessoalPct: d.pessoal.pctRcl, dclPct: d.divida.rcl ? (d.divida.liquida / d.divida.rcl) * 100 : 0 });
  }
  await writeFile(join(OUT, 'index.json'), JSON.stringify({ geradoEm: new Date().toISOString(), ufs: resumo }));
  console.log('Pronto.');
}

main().catch((e) => { console.error(e); process.exit(1); });
