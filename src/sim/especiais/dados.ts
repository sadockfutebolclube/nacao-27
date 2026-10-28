/**
 * Catálogo dos veículos especiais (Fase 27): modelos, rotas por waypoints, frotas e helicópteros de ocorrência.
 * Vem de src/data/veiculos/especiais.json e é validado (zod): erro de digitação vira mensagem com o campo.
 */
import { z } from 'zod';
import especiaisJson from '../../data/veiculos/especiais.json';

const num = z.number().finite();
const cor = z.string().regex(/^#[0-9a-fA-F]{6}$/);

const Modelo = z.object({
  arquivo: z.string().regex(/\.glb$/),
  comprimentoM: num.positive(),
  frenteGraus: z.union([num, z.literal('proa')]),
  lod: z.enum(['ar', 'helicoptero', 'caixa']),
  /** acima desta distância da câmera entra a silhueta simples */
  detalheM: num.positive(),
  rotor: z.object({ y: num, z: num, raio: num.positive() }).optional(),
});
const Ponto = z.tuple([num.min(-90).max(90), num.min(-180).max(180), num.min(0), num.min(0)]);
const Rota = z.object({ tipo: z.enum(['ar', 'mar']), fechada: z.boolean().optional(), nota: z.string(), pontos: z.array(Ponto).min(2) });
const Frota = z.object({
  id: z.string(), nome: z.string(), categoria: z.enum(['aviao', 'helicoptero', 'militar', 'navio']),
  rotas: z.array(z.string()).min(1), modelos: z.array(z.string()).min(1),
  quantidade: num.int().min(1),
  /** ciclo completo (viagem + espera) em s; 0 = só a viagem (circuito fechado = sem espera) */
  cicloS: num.min(0),
  pausaS: num.min(0).optional(),
  horario: z.tuple([num.min(0), num.max(24)]),
  espacamentoS: num.min(0).optional(),
  tint: cor.optional(),
  som: z.enum(['jato', 'helice', 'helicoptero', 'navio', 'lancha']),
});
const Pista = z.object({ id: z.string(), nome: z.string(), a: z.tuple([num, num]), b: z.tuple([num, num]), largura: num.positive(), fonte: z.string() });
const HeliOcorrencia = z.object({
  id: z.string(), nome: z.string(), modelo: z.string(), tipos: z.array(z.string()), gravidadeMin: num.min(0).max(1),
  base: z.tuple([num, num]), altura: num.positive(), raio: num.positive(), velocidade: num.positive(), holofote: z.boolean(), som: z.enum(['helicoptero']),
});
export const SchemaEspeciais = z.object({
  modelos: z.record(z.string(), Modelo),
  rotas: z.record(z.string(), Rota),
  pistas: z.array(Pista),
  frotas: z.array(Frota),
  ocorrencias: z.object({ helis: z.array(HeliOcorrencia) }),
}).superRefine((d, ctx) => {
  for (const f of d.frotas) {
    for (const r of f.rotas) if (!d.rotas[r]) ctx.addIssue({ code: 'custom', message: `frota ${f.id} usa a rota desconhecida "${r}"` });
    for (const m of f.modelos) if (!d.modelos[m]) ctx.addIssue({ code: 'custom', message: `frota ${f.id} usa o modelo desconhecido "${m}"` });
    const tipos = new Set(f.rotas.map((r) => d.rotas[r]?.tipo));
    if (tipos.size > 1) ctx.addIssue({ code: 'custom', message: `frota ${f.id} mistura rotas de ar e mar` });
  }
  for (const h of d.ocorrencias.helis) if (!d.modelos[h.modelo]) ctx.addIssue({ code: 'custom', message: `heli de ocorrência ${h.id}: modelo desconhecido "${h.modelo}"` });
});

export type DadosEspeciais = z.infer<typeof SchemaEspeciais>;
export type DefModelo = z.infer<typeof Modelo>;
export type DefFrota = z.infer<typeof Frota>;
export type DefRota = z.infer<typeof Rota>;

export function validarEspeciais(j: unknown = especiaisJson): DadosEspeciais {
  const r = SchemaEspeciais.safeParse(j);
  if (!r.success) throw new Error(`especiais.json: ${r.error.issues.slice(0, 4).map((x) => `${x.path.join('.')}: ${x.message}`).join(' | ')}`);
  return r.data;
}

export const ESPECIAIS = validarEspeciais();
