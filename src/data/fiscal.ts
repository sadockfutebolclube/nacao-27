/** Esquema dos dados fiscais reais (SICONFI) de cada UF. Valores anuais em R$. */
import { z } from 'zod';

const n = z.number().finite();

export const DadosFiscais = z.object({
  sigla: z.string(),
  ano: z.number().int(),
  receitas: z.object({
    correntes: n, icms: n, ipva: n, itcd: n, irrf: n, outrasTributarias: n, contribuicoes: n, patrimonial: n, servicos: n,
    fpe: n, lc61: n, fundebRecebido: n, outrasTransferencias: n, outrasCorrentes: n,
  }),
  deducoes: z.object({
    total: n, transferenciasMunicipios: n, contribuicaoServidor: n, compensacaoPrevidencia: n, rendimentosPrevidencia: n, formacaoFundeb: n,
  }),
  rcl: n,
  despesas: z.object({ pessoal: n, juros: n, outrasCorrentes: n, investimentos: n, inversoes: n, amortizacao: n }),
  funcoes: z.record(z.string(), n),
  pessoal: z.object({ ativo: n, inativo: n, dtp: n, rcl: n, pctRcl: n }),
  previdencia: z.object({ receitas: n, despesas: n }),
  minimos: z.object({ saudePct: n, saudeValor: n, educacaoPct: n, educacaoValor: n }),
  divida: z.object({ consolidada: n, liquida: n, uniao: n, emprestimos: n, caixa: n, rcl: n }),
  fonte: z.string(),
  coletadoEm: z.string(),
});
export type DadosFiscais = z.infer<typeof DadosFiscais>;
