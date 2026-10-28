/**
 * Dados do sistema de facções e instituições (Fase 26): carrega e VALIDA os três JSON de `src/data/seguranca/` (zod). Um erro de
 * digitação ao balancear derruba o carregamento com a mensagem do campo errado, em vez de virar NaN no meio da simulação.
 */
import { z } from 'zod';
import faccoesJson from '../../data/seguranca/faccoes.json';
import instituicoesJson from '../../data/seguranca/instituicoes.json';
import ocorrenciasJson from '../../data/seguranca/ocorrencias.json';

const num = z.number().finite();
const cor = z.string().regex(/^#[0-9a-fA-F]{6}$/);

const Fontes = z.object({ trafico: num.min(0), taxas: num.min(0), gatonet: num.min(0), transporteAlternativo: num.min(0) });
const Faccao = z.object({
  nome: z.string(), sigla: z.string(), tipo: z.enum(['facção', 'milícia']), cor, descricao: z.string(),
  inicial: z.object({ poder: num.min(0).max(1), armamento: num.min(0).max(100), dinheiro: num.min(0), influencia: num.min(0).max(100) }),
  fontes: Fontes,
  agressividade: num.min(0).max(1), expansao: num.min(0).max(1), sensibilidadePolicia: num.min(0).max(1),
  rivais: z.array(z.string()), aliados: z.array(z.string()), neutros: z.array(z.string()),
});
export const SchemaFaccoes = z.object({
  ordem: z.array(z.string()).min(2),
  faccoes: z.record(z.string(), Faccao),
  semeadura: z.object({ pesos: z.record(z.string(), num.min(0)), forcaMinimaParaTerDono: num.min(0).max(1), pesoMilicia: num.min(0).max(1), presencaInicial: z.array(z.object({ bairro: z.string(), forca: num.min(0).max(1) })) }),
  economia: z.object({ populacaoReferencia: num.positive(), custoArmamentoPorPontoDia: num, propinaPorInfluenciaDia: num, pessoalPorTerritorioDia: num, capDinheiro: num.positive(), reposicaoArmamentoPorMilhao: num, apreensaoPorOperacao: z.object({ armamento: num, dinheiro: num }) }),
  conflito: z.object({ limiarPresenca: num, taxaMaxima: num.min(0).max(1), ruido: num, baixaPorConflito: z.object({ armamento: num, dinheiro: num }), contagioVizinho: num, expansaoPorVizinho: num, recuoSobOperacao: num.min(0).max(1) }),
  acordos: z.object({ chanceTreguaPorDia: num, desgasteParaTregua: num, duracaoTreguaDias: z.tuple([num, num]), chanceRuptura: num, relacaoTregua: num.min(-1).max(1), relacaoGuerra: num.min(-1).max(1) }),
}).superRefine((d, ctx) => {
  for (const id of d.ordem) if (!d.faccoes[id]) ctx.addIssue({ code: 'custom', message: `ordem cita "${id}", que não está em faccoes` });
  for (const [id, f] of Object.entries(d.faccoes)) for (const o of [...f.rivais, ...f.aliados, ...f.neutros]) if (!d.faccoes[o]) ctx.addIssue({ code: 'custom', message: `${id} cita a facção desconhecida "${o}"` });
});

const Base = z.object({ nome: z.string(), bairro: z.string() });
const Instituicao = z.object({
  nome: z.string(), sigla: z.string(), esfera: z.enum(['estadual', 'federal', 'municipal']), cor, veiculo: z.string(), velocidade: num.positive(), preparoMin: num.min(0), viaturasPorBase: num.int().min(1),
  funcao: z.string(), bases: z.array(Base).min(1),
  especializacao: z.record(z.string(), z.object({ nome: z.string(), cor, veiculo: z.string(), velocidade: num.positive(), preparoMin: num.min(0), viaturasPorBase: num.int().min(1) })).optional(),
});
export const SchemaInstituicoes = z.object({
  ordem: z.array(z.string()).min(1),
  instituicoes: z.record(z.string(), Instituicao),
  equipamentos: z.record(z.string(), z.object({ instituicao: z.string(), viaturas: num.int().min(1) }).or(z.string())),
  veiculos: z.record(z.string(), z.object({ modelo: z.string(), cor }).or(z.string())),
}).superRefine((d, ctx) => {
  for (const id of d.ordem) if (!d.instituicoes[id]) ctx.addIssue({ code: 'custom', message: `ordem cita a instituição "${id}", que não existe` });
  for (const [id, i] of Object.entries(d.instituicoes)) if (!d.veiculos[i.veiculo] || typeof d.veiculos[i.veiculo] === 'string') ctx.addIssue({ code: 'custom', message: `${id}: veículo "${i.veiculo}" não está em veiculos` });
  for (const [eq, v] of Object.entries(d.equipamentos)) if (typeof v !== 'string' && !d.instituicoes[v.instituicao]) ctx.addIssue({ code: 'custom', message: `equipamento ${eq} aponta para a instituição desconhecida "${v.instituicao}"` });
});

export const FX = ['tiros', 'fogo', 'bloqueio', 'alarme', 'colisao', 'resgate', 'agua'] as const;
export const REACOES = ['fogem', 'escondem', 'curiosos'] as const;
const Tipo = z.object({
  nome: z.string(), taxaDia: num.min(0), local: z.enum(['dominio', 'disputado', 'via', 'crime', 'populacao', 'agua']), fatores: z.record(z.string(), num),
  despacho: z.object({ primaria: z.array(z.string()), especial: z.string().optional(), apoio: z.array(z.string()), apoioA: num }),
  cena: z.object({ duracaoS: z.tuple([num, num]), raioReacao: num.positive(), comercioFecha: num.min(0).max(1), transito: num.min(0).max(1), pedestres: z.enum(REACOES), fx: z.enum(FX) }),
  resolucao: z.object({ mortos: num.min(0), feridos: num.min(0), presos: num.min(0), tomaTerritorio: num.min(0).max(1) }),
  manchete: z.string(),
});
export const SchemaOcorrencias = z.object({
  tipos: z.record(z.string(), Tipo),
  gravidade: z.object({ media: num.min(0).max(1), variacao: num.min(0).max(1) }),
  despacho: z.object({ atrasoEscoltaMin: num, atrasoAreaDominadaMin: num, limiteChegadaBomMin: num, limiteChegadaRuimMin: num, mortosPorMinutoAtraso: num, maximoOcorrenciasGuardadas: num.int().positive() }),
  reacao: z.object({ velocidadeFuga: num.positive(), fracaoQueEscondeNoRaio: num.min(0).max(1), viaturaCedePassagemM: num.positive(), sirene: z.object({ frequenciaHz: num.positive() }) }),
});

export type DadosFaccoes = z.infer<typeof SchemaFaccoes>;
export type DadosInstituicoes = z.infer<typeof SchemaInstituicoes>;
export type DadosOcorrencias = z.infer<typeof SchemaOcorrencias>;
export type TipoOcorrencia = z.infer<typeof Tipo>;

/** Valida os três arquivos; devolve os dados tipados ou lança com o caminho do campo errado. */
export function validarDados(f: unknown = faccoesJson, i: unknown = instituicoesJson, o: unknown = ocorrenciasJson) {
  const rotulo = (arq: string, r: z.ZodError) => new Error(`${arq}: ${r.issues.slice(0, 4).map((x) => `${x.path.join('.')}: ${x.message}`).join(' | ')}`);
  const pf = SchemaFaccoes.safeParse(f), pi = SchemaInstituicoes.safeParse(i), po = SchemaOcorrencias.safeParse(o);
  if (!pf.success) throw rotulo('faccoes.json', pf.error);
  if (!pi.success) throw rotulo('instituicoes.json', pi.error);
  if (!po.success) throw rotulo('ocorrencias.json', po.error);
  // despacho de cada ocorrência só cita instituições que existem
  for (const [id, t] of Object.entries(po.data.tipos)) {
    for (const inst of [...t.despacho.primaria, ...t.despacho.apoio, ...(t.despacho.especial ? [t.despacho.especial] : [])]) {
      const base = inst.split(':')[0];
      const ok = pi.data.instituicoes[base] || Object.values(pi.data.instituicoes).some((x) => x.especializacao && x.especializacao[base]);
      if (!ok) throw new Error(`ocorrencias.json: ${id} despacha "${inst}", que não é uma instituição nem uma especialização`);
    }
  }
  return { faccoes: pf.data, instituicoes: pi.data, ocorrencias: po.data };
}

export const DADOS = validarDados();
export const IDS_FACCAO = DADOS.faccoes.ordem;
export const NF = IDS_FACCAO.length;
/** índice 0..NF−1 de cada facção; 0 = milícia */
export const INDICE_FACCAO: Record<string, number> = Object.fromEntries(IDS_FACCAO.map((id, k) => [id, k]));
