/**
 * Motor de storylets (Fase 6). Cada evento é dado puro (data/events/*.json): condições em
 * mini-linguagem ("chuva3d >= 120", "regiao in Sul,Sudeste", "flag carnaval-patrocinado", "!temEstado"),
 * texto com variáveis ({cidade}, {prefeito}, {tv}…), escolhas com efeitos e consequências atrasadas.
 * Eventos com escolhas viram decisões pendentes (com prazo); sem resposta, vale a escolha padrão.
 */
import { z } from 'zod';
import type { Rng } from '../core/rng';

// ── Esquema dos dados ────────────────────────────────────────────────────────────

const Grupos = z.object({ servidores: z.number(), empresariado: z.number(), classeMedia: z.number(), baixaRenda: z.number() }).partial();

export const Efeitos = z.object({
  /** choque na aprovação estadual (pontos; na Visão Cidade sem Estado, vai para a aprovação da capital) */
  aprovacao: z.number().optional(),
  grupos: Grupos.optional(),
  /** aprovação da capital (Visão Cidade) */
  aprovacaoCidade: z.number().optional(),
  /** caixa do Tesouro como fração da RCL anual (−0,001 = gasto de 0,1% da RCL) */
  caixa: z.number().optional(),
  /** caixa da capital em R$ */
  caixaCidade: z.number().optional(),
  capital: z.number().optional(),
  /** relação de todos os deputados */
  base: z.number().optional(),
  bancadas: z.record(z.string(), z.number()).optional(),
  prefeito: z.number().optional(),
  prefeitos: z.number().optional(),
  presidente: z.number().optional(),
  imprensa: z.number().optional(),
  /** choque relativo em indicadores do Estado (+0,1 = 10% acima do que seria), decai em meses */
  indicadores: z.record(z.string(), z.number()).optional(),
  /** choque no crescimento do PIB estadual (fração anual, decai) */
  pib: z.number().optional(),
  /** crime na capital (pontos 0–1 somados à criminalidade dos lotes, decai) */
  crime: z.number().optional(),
  flag: z.string().optional(),
  limparFlag: z.string().optional(),
  /** decreto de calamidade pública (meses) — habilita o socorro federal */
  calamidade: z.number().optional(),
  /** Força Nacional no estado (meses) */
  forcaNacional: z.number().optional(),
  greve: z.enum(['educacao', 'saude', 'seguranca', 'demais']).optional(),
  /** efeito visual na cidade (dias) */
  visual: z.object({ tipo: z.string(), dias: z.number() }).optional(),
  // ── Modo Presidente (Fase 9) ──
  /** choques macro: inflação (p.p.), hiato (p.p.), câmbio (log, 0,05 ≈ +5%), receita (% PIB, decai) */
  inflacao: z.number().optional(),
  hiato: z.number().optional(),
  cambio: z.number().optional(),
  receita: z.number().optional(),
  credibilidade: z.number().optional(),
  /** dívida bruta (p.p. do PIB) e gasto extra (% PIB no mês) */
  divida: z.number().optional(),
  despesaExtra: z.number().optional(),
  /** relação com a Câmara, o Senado e os governadores */
  camara: z.number().optional(),
  senado: z.number().optional(),
  governadores: z.number().optional(),
  /** aprovação em UFs específicas */
  ufs: z.record(z.string(), z.number()).optional(),
  escandalo: z.number().optional(),
});
export type Efeitos = z.infer<typeof Efeitos>;

export const Consequencia = z.object({
  meses: z.number(),
  chance: z.number().default(1),
  texto: z.string(),
  tom: z.enum(['bom', 'ruim', 'alerta', 'info']).default('info'),
  se: z.array(z.string()).default([]),
  efeitos: Efeitos.default({}),
});

export const Escolha = z.object({
  texto: z.string(),
  detalhe: z.string().optional(),
  /** condições para a escolha aparecer */
  se: z.array(z.string()).default([]),
  efeitos: Efeitos.default({}),
  resultado: z.string().optional(),
  tomResultado: z.enum(['bom', 'ruim', 'alerta', 'info']).default('info'),
  depois: z.array(Consequencia).default([]),
});
export type Escolha = z.infer<typeof Escolha>;

export const Storylet = z.object({
  id: z.string(),
  categoria: z.enum(['desastre', 'clima', 'seguranca', 'economia', 'servicos', 'politica', 'prefeitos', 'federal', 'imprensa', 'cultura', 'esporte', 'positivo', 'sociedade', 'festa', 'congresso', 'stf', 'bc', 'internacional', 'governadores']),
  titulo: z.string(),
  texto: z.string(),
  tom: z.enum(['bom', 'ruim', 'alerta', 'info']).default('info'),
  se: z.array(z.string()).default([]),
  /** "diario" para gatilhos do tempo/desastres; "mensal" para o resto */
  quando: z.enum(['diario', 'mensal']).default('mensal'),
  peso: z.number().default(1),
  /** chance por checagem quando elegível (diário) — os mensais usam o sorteio ponderado */
  chance: z.number().default(1),
  cooldown: z.number().default(12),
  unico: z.boolean().default(false),
  prazoDias: z.number().default(20),
  padrao: z.number().default(0),
  efeitos: Efeitos.default({}),
  escolhas: z.array(Escolha).default([]),
});
export type Storylet = z.infer<typeof Storylet>;

// ── Condições ────────────────────────────────────────────────────────────────────

export type Valor = number | string | boolean | string[];
export type Contexto = Record<string, Valor>;
type Pred = (c: Contexto) => boolean;

const cache = new Map<string, Pred>();
/** Variáveis citadas numa condição (para validação nos testes). */
export function variaveisDe(cond: string): string[] {
  const s = cond.trim().replace(/^!/, '');
  if (s.startsWith('flag ')) return [];
  return [s.split(/\s+/)[0]];
}

export function compilar(cond: string): Pred {
  const hit = cache.get(cond);
  if (hit) return hit;
  let p: Pred;
  const s = cond.trim();
  if (/^!?flag\s+\S+$/.test(s)) {
    const nome = s.replace(/^!?flag\s+/, '');
    const quer = !s.startsWith('!');
    p = (c) => ((c.flags as string[]) ?? []).includes(nome) === quer;
    cache.set(cond, p);
    return p;
  }
  const m = s.match(/^(!?)(\S+)(?:\s+(>=|<=|==|!=|>|<|in|has|notin)\s+(.+))?$/);
  if (!m) throw new Error(`Condição inválida: "${cond}"`);
  const [, neg, v, op, rhs] = m;
  if (v === 'flag') throw new Error(`Use "flag nome": "${cond}"`);
  if (!op) {
    p = (c) => !!c[v] !== !!neg;
  } else {
    const lista = rhs.split(',').map((x) => x.trim());
    const num = Number(rhs);
    p = (c) => {
      const x = c[v];
      if (x === undefined) return false;
      switch (op) {
        case '>=': return (x as number) >= num;
        case '<=': return (x as number) <= num;
        case '>': return (x as number) > num;
        case '<': return (x as number) < num;
        case '==': return typeof x === 'number' ? x === num : String(x) === rhs;
        case '!=': return typeof x === 'number' ? x !== num : String(x) !== rhs;
        case 'in': return lista.includes(String(x));
        case 'notin': return !lista.includes(String(x));
        case 'has': return Array.isArray(x) && x.includes(rhs);
      }
      return false;
    };
  }
  cache.set(cond, p);
  return p;
}

export const atende = (conds: string[], c: Contexto) => conds.every((k) => compilar(k)(c));

/** Substitui {variavel} pelos textos do contexto. */
export function preencher(t: string, textos: Record<string, string>): string {
  return t.replace(/\{([a-zA-Z0-9_:]+)\}/g, (_, k: string) => textos[k] ?? `{${k}}`);
}

// ── Estado do motor ──────────────────────────────────────────────────────────────

export interface Pendente {
  uid: number;
  id: string;
  titulo: string;
  texto: string;
  categoria: Storylet['categoria'];
  tom: Storylet['tom'];
  criadoDia: number;
  prazoDia: number;
  data: string;
  /** índices das escolhas visíveis no momento do disparo */
  escolhas: { i: number; texto: string; detalhe?: string }[];
  padrao: number;
  /** textos usados (para preencher resultados) */
  textos: Record<string, string>;
}

export interface Agendado { dia: number; texto: string; tom: Consequencia['tom']; se: string[]; efeitos: Efeitos; chance: number; textos: Record<string, string> }
type Consequencia = z.infer<typeof Consequencia>;

export interface Registro { data: string; titulo: string; escolha?: string; categoria: string }

export interface EstadoEventos {
  pendentes: Pendente[];
  agendados: Agendado[];
  /** último dia em que cada storylet disparou */
  ultimo: Record<string, number>;
  flags: string[];
  historico: Registro[];
  nextUid: number;
}

export const novoEstadoEventos = (): EstadoEventos => ({ pendentes: [], agendados: [], ultimo: {}, flags: [], historico: [], nextUid: 1 });

export interface Disparo { st: Storylet; textos: Record<string, string> }
export interface SaidaEfeito { efeitos: Efeitos; texto: string; tom: Storylet['tom']; chave: string }

export class Motor {
  readonly lista: Storylet[];
  readonly porId: Map<string, Storylet>;
  constructor(lista: Storylet[]) {
    this.lista = lista;
    this.porId = new Map(lista.map((s) => [s.id, s]));
  }

  elegiveis(e: EstadoEventos, c: Contexto, quando: 'diario' | 'mensal', dia: number): Storylet[] {
    return this.lista.filter((s) => {
      if (s.quando !== quando) return false;
      const ult = e.ultimo[s.id];
      if (ult !== undefined && (s.unico || dia - ult < s.cooldown * 30)) return false;
      if (e.pendentes.some((p) => p.id === s.id)) return false;
      return atende(s.se, c);
    });
  }

  /** Dispara um storylet: cria a decisão pendente ou devolve os efeitos imediatos. */
  disparar(e: EstadoEventos, st: Storylet, c: Contexto, textos: Record<string, string>, dia: number, data: string): { pendente?: Pendente; imediato?: SaidaEfeito } {
    e.ultimo[st.id] = dia;
    const titulo = preencher(st.titulo, textos), texto = preencher(st.texto, textos);
    const escolhas = st.escolhas.map((x, i) => ({ x, i })).filter(({ x }) => atende(x.se, c));
    if (!escolhas.length) {
      e.historico.unshift({ data, titulo, categoria: st.categoria });
      e.historico = e.historico.slice(0, 80);
      return { imediato: { efeitos: st.efeitos, texto: `${titulo}: ${texto}`, tom: st.tom, chave: `ev-${st.id}` } };
    }
    const padrao = escolhas.some((x) => x.i === st.padrao) ? st.padrao : escolhas[escolhas.length - 1].i;
    const p: Pendente = {
      uid: e.nextUid++, id: st.id, titulo, texto, categoria: st.categoria, tom: st.tom, criadoDia: dia, prazoDia: dia + st.prazoDias, data,
      escolhas: escolhas.map(({ x, i }) => ({ i, texto: preencher(x.texto, textos), detalhe: x.detalhe ? preencher(x.detalhe, textos) : undefined })),
      padrao, textos,
    };
    e.pendentes.push(p);
    return { pendente: p, imediato: Object.keys(st.efeitos).length ? { efeitos: st.efeitos, texto: '', tom: st.tom, chave: `ev-${st.id}` } : undefined };
  }

  /** Aplica a escolha de uma decisão pendente: devolve efeitos e agenda consequências. */
  resolver(e: EstadoEventos, uid: number, escolha: number, dia: number, data: string, automatico = false): SaidaEfeito | null {
    const p = e.pendentes.find((x) => x.uid === uid);
    if (!p) return null;
    const st = this.porId.get(p.id);
    if (!st) { e.pendentes = e.pendentes.filter((x) => x.uid !== uid); return null; }
    const idx = p.escolhas.some((x) => x.i === escolha) ? escolha : p.padrao;
    const esc = st.escolhas[idx];
    e.pendentes = e.pendentes.filter((x) => x.uid !== uid);
    for (const d of esc.depois) {
      e.agendados.push({ dia: dia + Math.round(d.meses * 30), texto: preencher(d.texto, p.textos), tom: d.tom, se: d.se, efeitos: d.efeitos, chance: d.chance, textos: p.textos });
    }
    e.historico.unshift({ data, titulo: p.titulo, escolha: (automatico ? '(sem resposta) ' : '') + preencher(esc.texto, p.textos), categoria: p.categoria });
    e.historico = e.historico.slice(0, 80);
    const res = esc.resultado ? preencher(esc.resultado, p.textos) : '';
    return { efeitos: esc.efeitos, texto: res, tom: esc.tomResultado, chave: `res-${p.uid}` };
  }

  /** Consequências que vencem hoje e decisões cujo prazo expirou. */
  vencidos(e: EstadoEventos, c: Contexto, dia: number, data: string, rng: Rng): SaidaEfeito[] {
    const out: SaidaEfeito[] = [];
    const hoje = e.agendados.filter((a) => a.dia <= dia);
    e.agendados = e.agendados.filter((a) => a.dia > dia);
    for (const a of hoje) {
      if (!atende(a.se, c) || !rng.chance(a.chance)) continue;
      out.push({ efeitos: a.efeitos, texto: a.texto, tom: a.tom, chave: `cons-${dia}-${out.length}` });
    }
    for (const p of [...e.pendentes]) {
      if (p.prazoDia > dia) continue;
      const r = this.resolver(e, p.uid, p.padrao, dia, data, true);
      if (r) out.push({ ...r, texto: r.texto ? `Sem decisão do Palácio sobre "${p.titulo}". ${r.texto}` : `Sem decisão do Palácio sobre "${p.titulo}".` });
    }
    return out;
  }
}

/** Sorteio ponderado de um storylet entre os elegíveis. */
export function sortearStorylet(lista: Storylet[], rng: Rng): Storylet | null {
  const tot = lista.reduce((s, x) => s + x.peso, 0);
  if (tot <= 0) return null;
  let r = rng.next() * tot;
  for (const s of lista) { r -= s.peso; if (r <= 0) return s; }
  return lista[lista.length - 1];
}
