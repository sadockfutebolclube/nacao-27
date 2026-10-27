/**
 * Esquemas zod dos dados do jogo. Usados tanto pelo script de dados (Node)
 * quanto pelo jogo (navegador) — qualquer mod que altere os JSONs passa por aqui.
 */
import { z } from 'zod';

export const SiglaUF = z.enum([
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA',
  'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
]);
export type SiglaUF = z.infer<typeof SiglaUF>;

export const Bioma = z.enum(['mata-atlantica', 'cerrado', 'caatinga', 'amazonia', 'pampa', 'pantanal']);
export type Bioma = z.infer<typeof Bioma>;

export const TipoTerreno = z.enum(['litoral-morros', 'litoral-plano', 'planalto', 'planicie', 'varzea', 'serra']);
export type TipoTerreno = z.infer<typeof TipoTerreno>;

export const Lado = z.enum(['N', 'S', 'E', 'W']);
export type Lado = z.infer<typeof Lado>;

export const Terreno = z.object({
  tipo: TipoTerreno,
  agua: z.object({ lado: Lado, tipo: z.enum(['mar', 'baia', 'rio', 'lago']) }).nullable(),
  rio: z.boolean().optional(),
  relevo: z.number().min(0).max(1),
});
export type Terreno = z.infer<typeof Terreno>;

/** Chaves de efeito reconhecidas pela simulação. Valores são deltas relativos (0.2 = +20%). */
export const ChaveEfeito = z.enum([
  'custoObras', 'logistica', 'riscoEnchente', 'riscoDeslizamento', 'riscoSeca', 'riscoGeologico',
  'riscoBarragem', 'riscoQueimada', 'riscoApagao', 'riscoCalor', 'receitaVerde', 'receitaICMS',
  'receitaRoyalties', 'transferenciasFederais', 'pressaoAmbiental', 'turismo', 'agro', 'industria',
  'servicos', 'tecnologia', 'energiaLimpa', 'educacao', 'demandaSocial', 'criminalidade',
  'custoSeguranca', 'custoPessoal', 'renda', 'volatilidadePolitica', 'credito', 'dividaInicial',
  'complexidadePolitica', 'qualidadeVida', 'transporte', 'transito',
]);
export type ChaveEfeito = z.infer<typeof ChaveEfeito>;

export const Traco = z.object({
  id: z.string(),
  nome: z.string(),
  tipo: z.enum(['buff', 'nerf', 'neutro']),
  descricao: z.string(),
  efeitos: z.partialRecord(ChaveEfeito, z.number()),
});
export type Traco = z.infer<typeof Traco>;

export const TracosUF = z.object({
  sigla: SiglaUF,
  apelido: z.string(),
  dificuldade: z.number().int().min(1).max(5),
  capital: z.object({ nome: z.string(), ibge: z.number().int(), lat: z.number(), lon: z.number() }),
  biomas: z.array(Bioma).min(1),
  terreno: Terreno,
  clima: z.string(),
  sotaque: z.string(),
  saudacao: z.string(),
  trilha: z.array(z.string()),
  festas: z.array(z.string()),
  arquitetura: z.string(),
  tracos: z.array(Traco).min(1),
  desafios: z.array(z.string()),
});
export type TracosUF = z.infer<typeof TracosUF>;

export const ArquivoTracos = z.object({
  versao: z.number(),
  ufs: z.array(TracosUF).length(27),
});

export const Fonte = z.object({ nome: z.string(), url: z.string(), ano: z.number(), aproximado: z.boolean() });
export type Fonte = z.infer<typeof Fonte>;

export const IndicadoresCurados = z.object({
  fontes: z.object({ idh: Fonte, homicidios: Fonte, idebEM: Fonte, esgoto: Fonte, dividaRCL: Fonte }),
  valores: z.record(SiglaUF, z.object({
    idh: z.number(), homicidios: z.number(), idebEM: z.number(), esgoto: z.number(), dividaRCL: z.number(),
  })),
});

/** Arquivo final gerado por scripts/fetch-data.ts para cada UF: public/data/ufs/{UF}.json */
export const DadosUF = z.object({
  id: z.number().int(),
  sigla: SiglaUF,
  nome: z.string(),
  regiao: z.object({ sigla: z.string(), nome: z.string() }),
  populacao: z.object({ valor: z.number(), ano: z.number(), censo2022: z.number() }),
  pib: z.object({
    ano: z.number(),
    total: z.number(), // R$ (não mil)
    perCapita: z.number(),
    vab: z.object({ agro: z.number(), industria: z.number(), servicos: z.number(), adminPublica: z.number(), ano: z.number() }),
  }),
  areaKm2: z.number(),
  numMunicipios: z.number().int(),
  maioresMunicipios: z.array(z.object({ id: z.number().int(), nome: z.string(), populacao: z.number() })),
  indicadores: z.object({ idh: z.number(), homicidios: z.number(), idebEM: z.number(), esgoto: z.number(), dividaRCL: z.number() }),
  tracos: TracosUF,
  fontes: z.array(z.object({ campo: z.string(), fonte: z.string(), url: z.string(), ano: z.number(), aproximado: z.boolean() })),
  geradoEm: z.string(),
});
export type DadosUF = z.infer<typeof DadosUF>;

export const IndiceUFs = z.object({
  geradoEm: z.string(),
  ufs: z.array(DadosUF.omit({ fontes: true, maioresMunicipios: true })),
});
export type IndiceUFs = z.infer<typeof IndiceUFs>;
export type ResumoUF = IndiceUFs['ufs'][number];
