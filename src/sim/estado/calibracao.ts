/**
 * Calibração do Tesouro estadual a partir do SICONFI (2024) projetado para jan/2027.
 * Todas as constantes "k" fazem o modelo reproduzir os números reais no ponto de partida:
 * RCL, % de pessoal na LRF, % aplicado em saúde e educação, serviço da dívida.
 */
import type { DadosFiscais } from '../../data/fiscal';
import type { SocialUF } from '../../data/social';
import type { EleitoradoUF } from '../../data/eleitorado';
import type { ChaveEfeito } from '../../data/schemas';
import { AREAS, CARREIRAS, type Area, type Carreira, type PropostaLOA, type RegimeDivida } from './tipos';

/** Fator nominal 2024 → 2027 (IPCA ~4,8%, 5,0%, 4,3% e crescimento real ~2% a.a.). */
export const FATOR_2024_2027 = 1.2;
export const FATOR_DIVIDA = 1.1;

/**
 * Alíquota modal de ICMS por UF (2025/2026, aproximada; inclui adicionais de fundos de
 * combate à pobreza quando incidem sobre a modal). Fonte: legislações estaduais/CONFAZ.
 */
export const ALIQUOTA_MODAL_ICMS: Record<string, number> = {
  AC: 0.19, AL: 0.2, AP: 0.18, AM: 0.2, BA: 0.205, CE: 0.2, DF: 0.2, ES: 0.17, GO: 0.19, MA: 0.23, MT: 0.17, MS: 0.17, MG: 0.18,
  PA: 0.19, PB: 0.2, PR: 0.195, PE: 0.205, PI: 0.225, RJ: 0.22, RN: 0.2, RS: 0.17, RO: 0.195, RR: 0.2, SC: 0.17, SP: 0.18, SE: 0.2, TO: 0.2,
};
/** IPVA de automóveis de passeio (aprox.). */
export const ALIQUOTA_IPVA: Record<string, number> = {
  AC: 0.02, AL: 0.03, AP: 0.03, AM: 0.03, BA: 0.025, CE: 0.03, DF: 0.035, ES: 0.02, GO: 0.0375, MA: 0.025, MT: 0.03, MS: 0.035, MG: 0.04,
  PA: 0.025, PB: 0.025, PR: 0.035, PE: 0.03, PI: 0.025, RJ: 0.04, RN: 0.03, RS: 0.03, RO: 0.03, RR: 0.03, SC: 0.02, SP: 0.04, SE: 0.025, TO: 0.02,
};

export interface EstadoInit {
  sigla: string;
  fiscal: DadosFiscais;
  populacao: number;
  pibNominal: number;
  idh: number;
  homicidios: number;
  idebEM: number;
  esgoto: number;
  dificuldade: number;
  efeitos: Partial<Record<ChaveEfeito, number>>;
  /** indicadores reais DATASUS/PNAD (Fase 5); ausentes → estimativa pelo IDH */
  social?: SocialUF;
  /** região (composição das bancadas) e cidades (redutos e naturalidade dos personagens) */
  regiao?: string;
  cidades?: string[];
  /** município onde o jogador constrói a cidade (Fase 8) — reduto eleitoral do governador */
  sede?: string;
  /** população de cada cidade em `cidades` (prefeitos) */
  populacoes?: number[];
  /** eleitorado real por município (TSE 2022) — sem ele não há eleição */
  eleitorado?: EleitoradoUF;
}

export interface Calibracao {
  // receitas (anuais, R$ de 2027)
  icms: number; ipva: number; itcd: number; outrasTrib: number; contribOutras: number; patrimonial: number;
  servicos: number; outrasCorrentes: number; fpe: number; lc61: number; outrasTransf: number;
  fracRoyalties: number;
  irrfTaxa: number;
  kMunicipios: number;
  kFundeb: number;
  fundebRetorno: number;
  compensacao: number;
  aliquotaICMS0: number; aliquotaIPVA0: number; aliquotaITCMD0: number;
  // pessoal e previdência
  servidores: Record<Carreira, number>;
  salario: Record<Carreira, number>;
  aliquotaPrev0: number;
  beneficios: number;
  kContrib: number;
  fracInativosDTP: number;
  // despesas por área (anuais)
  custeio: Record<Area, number>;
  investimento: Record<Area, number>;
  pessoalPorArea: Record<Area, number>;
  shareDuodecimos: number;
  // dívida
  dividaUniao: number;
  dividaOutros: number;
  outrasDividas: number;
  caixa: number;
  regime: RegimeDivida;
  fracPagamento: number;
  // mínimos
  kSaude: number;
  kEducacao: number;
  // referência
  rclAnual: number;
  programaCapital: number;
}

const soma = (o: Record<string, number>, ks: string[]) => ks.reduce((s, k) => s + (o[k] ?? 0), 0);
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** Juros nominais anuais (IPCA ~4% + real) por credor. */
export const JUROS_REAL_UNIAO = 0.04;
export const JUROS_REAL_OUTROS = 0.045;
export const PRAZO_UNIAO_ANOS = 30;
export const PRAZO_OUTROS_ANOS = 12;

export function servicoTeorico(du: number, dout: number, ipca = 0.04): number {
  return du * (JUROS_REAL_UNIAO + ipca + 1 / PRAZO_UNIAO_ANOS) + dout * (JUROS_REAL_OUTROS + ipca + 1 / PRAZO_OUTROS_ANOS);
}

export function calibrar(ini: EstadoInit): Calibracao {
  const f = ini.fiscal;
  const F = FATOR_2024_2027;
  const r = f.receitas;
  const d = f.deducoes;
  const c0 = 0.14;

  // ── Pessoal e previdência ──
  const ativo = f.pessoal.ativo > 0 ? f.pessoal.ativo : f.despesas.pessoal * 0.5;
  const S = (ativo / (1 + 2 * c0)) * F; // salários brutos do Executivo
  const B = (f.previdencia.despesas > 0 ? f.previdencia.despesas : Math.max(f.pessoal.inativo, ativo * 0.5)) * F;
  const contribModelo = c0 * S + 2 * c0 * S + 0.15 * c0 * B + d.compensacaoPrevidencia * F;
  const kContrib = f.previdencia.receitas > 0 ? clamp((f.previdencia.receitas * F) / contribModelo, 0.4, 2.5) : 1;
  const fracInativosDTP = B > 0 ? clamp((f.pessoal.dtp * F - ativo * F) / B, 0, 1) : 0.5;

  // ── Divisão por áreas ──
  const fn = f.funcoes;
  const bruto: Record<Area, number> = {} as Record<Area, number>;
  for (const a of AREAS) bruto[a.id] = Math.max(1, soma(fn, a.funcoes) * F);
  const totalFuncoes = AREAS.reduce((s, a) => s + bruto[a.id], 0);
  const peso: Record<Carreira, number> = {
    educacao: bruto.educacao * CARREIRAS[0].pessoalNaFuncao,
    saude: bruto.saude * CARREIRAS[1].pessoalNaFuncao,
    seguranca: bruto.seguranca * CARREIRAS[2].pessoalNaFuncao,
    demais: (totalFuncoes - bruto.educacao - bruto.saude - bruto.seguranca) * CARREIRAS[3].pessoalNaFuncao,
  };
  const somaPeso = Object.values(peso).reduce((a, b) => a + b, 0) || 1;
  const folhaCarreira = {} as Record<Carreira, number>;
  for (const c of CARREIRAS) folhaCarreira[c.id] = (S * peso[c.id]) / somaPeso;

  const pessoalPorArea = {} as Record<Area, number>;
  const outrasAreas = AREAS.filter((a) => !['educacao', 'saude', 'seguranca'].includes(a.id));
  const somaOutras = outrasAreas.reduce((s, a) => s + bruto[a.id], 0) || 1;
  for (const a of AREAS) {
    if (a.id === 'educacao' || a.id === 'saude' || a.id === 'seguranca') pessoalPorArea[a.id] = folhaCarreira[a.id];
    else pessoalPorArea[a.id] = (folhaCarreira.demais * bruto[a.id]) / somaOutras;
  }

  const duod = (soma(fn, ['legislativa', 'judiciaria', 'essencialJustica'])) * F;
  const investimentoTotal = (f.despesas.investimentos + f.despesas.inversoes) * F;
  const dividaServ = (f.despesas.juros + f.despesas.amortizacao) * F;
  const pesoInvest: Record<Area, number> = {
    saude: 0.6, educacao: 0.7, seguranca: 0.6, assistencia: 0.4, transporte: 2.4, infraestrutura: 2.8, saneamento: 2.2, cultura: 0.8, desenvolvimento: 1.2, administracao: 0.6,
  };
  // ── Receitas ──
  const contribServ = d.contribuicaoServidor;
  const contribOutras = Math.max(0, r.contribuicoes - contribServ);
  const regraMun = 0.25 * r.icms + 0.5 * r.ipva + 0.25 * r.lc61;
  const kMunicipios = regraMun > 0 ? clamp(d.transferenciasMunicipios / regraMun, 0.6, 1.6) : 1;
  const baseFundeb = r.icms + r.ipva + r.itcd + r.fpe + r.lc61 - d.transferenciasMunicipios;
  const kFundeb = baseFundeb > 0 ? clamp(d.formacaoFundeb / (0.2 * baseFundeb), 0.5, 1.6) : 1;
  const fundebRetorno = d.formacaoFundeb > 0 ? r.fundebRecebido / d.formacaoFundeb : 1;
  const rclModelo = r.icms + r.ipva + r.itcd + r.irrf + r.outrasTributarias + contribOutras + r.patrimonial + r.servicos + r.outrasCorrentes
    + r.fpe + r.lc61 + r.fundebRecebido + r.outrasTransferencias - d.transferenciasMunicipios - d.formacaoFundeb
    - d.compensacaoPrevidencia - d.rendimentosPrevidencia;
  const ajuste = f.rcl - rclModelo; // resíduos de classificação contábil

  // ── Dívida ──
  const dividaUniao = Math.max(0, f.divida.uniao) * FATOR_DIVIDA;
  const dividaOutros = Math.max(0, f.divida.consolidada - f.divida.uniao) * FATOR_DIVIDA * 0.75;
  const outrasDividas = Math.max(0, f.divida.consolidada - f.divida.uniao) * FATOR_DIVIDA * 0.25; // precatórios etc.
  const teorico = servicoTeorico(dividaUniao, dividaOutros);
  const fracPagamento = teorico > 0 ? clamp(dividaServ / teorico, 0.05, 1.3) : 1;
  const regime: RegimeDivida = fracPagamento < 0.55 && dividaUniao > 0.5 * f.rcl ? 'RRF' : 'normal';

  // ── Custeio como resíduo da identidade orçamentária ──
  // Alguns estados (ex.: SP) lançam os repasses aos municípios como despesa; outros deduzem da
  // receita. Em vez de confiar no "outras despesas correntes" bruto, o custeio do Executivo é o
  // que fecha o orçamento com um resultado plausível para o perfil fiscal da UF.
  const rcl = f.rcl * F;
  const programaCapital = Math.max(18e6, rcl * 0.0008);
  const emendas = rcl * 0.004;
  const contribPrev = Math.min(B, (f.previdencia.receitas > 0 ? f.previdencia.receitas * F : 3 * c0 * S));
  const aporte = Math.max(0, B - contribPrev);
  const servicoPago = teorico * fracPagamento;
  const resultadoAlvo = clamp(0.01 - 0.03 * Math.max(0, ini.efeitos.dividaInicial ?? 0), -0.025, 0.012) * rcl;
  const custeioTotal = Math.max(rcl * 0.05,
    rcl - S * (1 + 2 * c0) - aporte - investimentoTotal - duod - servicoPago - programaCapital - emendas - resultadoAlvo);

  const resto = {} as Record<Area, number>;
  for (const a of AREAS) resto[a.id] = Math.max(bruto[a.id] * 0.12, bruto[a.id] - pessoalPorArea[a.id] * (1 + 2 * c0));
  const somaResto = AREAS.reduce((s, a) => s + resto[a.id], 0);
  const somaInvW = AREAS.reduce((s, a) => s + resto[a.id] * pesoInvest[a.id], 0);
  const custeio = {} as Record<Area, number>;
  const investimento = {} as Record<Area, number>;
  for (const a of AREAS) {
    investimento[a.id] = (investimentoTotal * resto[a.id] * pesoInvest[a.id]) / somaInvW;
    custeio[a.id] = Math.max(0, (custeioTotal * resto[a.id]) / somaResto);
  }

  // ── Mínimos constitucionais ──
  const ril = (r.icms + r.ipva + r.itcd + r.irrf + r.fpe + r.lc61 - d.transferenciasMunicipios) * F;
  const gastoSaude = pessoalPorArea.saude * (1 + 2 * c0) + custeio.saude + investimento.saude;
  const gastoEduc = pessoalPorArea.educacao * (1 + 2 * c0) + custeio.educacao + investimento.educacao;
  const kSaude = f.minimos.saudePct > 0 && ril > 0 ? clamp(f.minimos.saudePct / 100 / (gastoSaude / ril), 0.25, 3) : 0.12 / (gastoSaude / ril);
  const kEducacao = f.minimos.educacaoPct > 0 && ril > 0 ? clamp(f.minimos.educacaoPct / 100 / (gastoEduc / ril), 0.25, 3) : 0.25 / (gastoEduc / ril);

  const servidores = {} as Record<Carreira, number>;
  const salario = {} as Record<Carreira, number>;
  // RCL per capita da UF contra a média dos estados (~R$ 5,6 mil em 2024) ajusta o salário regional
  const fatorRenda = clamp(0.75 + 0.25 * (f.rcl / Math.max(1, ini.populacao)) / 5600, 0.8, 1.45);
  for (const c of CARREIRAS) {
    salario[c.id] = Math.round(c.salarioBase * fatorRenda);
    servidores[c.id] = Math.round(folhaCarreira[c.id] / (salario[c.id] * 13.33));
  }

  return {
    icms: r.icms * F, ipva: r.ipva * F, itcd: r.itcd * F, outrasTrib: r.outrasTributarias * F, contribOutras: contribOutras * F,
    patrimonial: r.patrimonial * F, servicos: r.servicos * F, outrasCorrentes: (r.outrasCorrentes + ajuste) * F,
    fpe: r.fpe * F, lc61: r.lc61 * F, outrasTransf: r.outrasTransferencias * F,
    fracRoyalties: clamp((ini.efeitos.receitaRoyalties ?? 0) * 3.2, 0, 0.9),
    irrfTaxa: S + B > 0 ? (r.irrf * F) / (S + B) : 0.1,
    kMunicipios, kFundeb, fundebRetorno, compensacao: d.compensacaoPrevidencia * F,
    aliquotaICMS0: ALIQUOTA_MODAL_ICMS[ini.sigla] ?? 0.19,
    aliquotaIPVA0: ALIQUOTA_IPVA[ini.sigla] ?? 0.03,
    aliquotaITCMD0: 0.04,
    servidores, salario, aliquotaPrev0: c0, beneficios: B, kContrib, fracInativosDTP,
    custeio, investimento, pessoalPorArea,
    shareDuodecimos: rcl > 0 ? duod / rcl : 0.12,
    dividaUniao, dividaOutros, outrasDividas, caixa: Math.max(0, f.divida.caixa), regime, fracPagamento,
    kSaude, kEducacao, rclAnual: rcl,
    programaCapital,
  };
}

/** LOA herdada do governo anterior (2027), já aprovada pela ALE em dezembro de 2026. */
export function loaInicial(c: Calibracao): PropostaLOA {
  const zero = { educacao: 0, saude: 0, seguranca: 0, demais: 0 };
  return {
    ano: 2027,
    aliquotaICMS: c.aliquotaICMS0,
    aliquotaIPVA: c.aliquotaIPVA0,
    aliquotaITCMD: c.aliquotaITCMD0,
    incentivos: 0,
    reajuste: { ...zero },
    quadro: { ...zero },
    custeio: { ...c.custeio },
    investimento: { ...c.investimento },
    programaCapital: c.programaCapital,
    emendas: c.rclAnual * 0.004, // mesmo valor usado na calibração do custeio
    aliquotaPrevidencia: c.aliquotaPrev0,
  };
}
