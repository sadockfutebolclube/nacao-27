/**
 * Pontos turísticos do Rio (Fase 31): carrega e VALIDA `src/data/turismo/pontos.json` (zod) e calcula, com funções puras, quantas pessoas
 * há em cada ponto agora (capacidade × ocupação de pico × curva do dia × fim de semana × chuva, ou o evento do dia — jogo, desfile),
 * o contador do dia, a nota e o horário de pico. Quem desenha (Visitantes.tsx, Turismo.tsx, Orla.tsx) e quem mostra (painel de clique)
 * usam o MESMO cálculo, então o número do painel e a multidão na tela concordam. Nada aqui lê o Three.js.
 */
import { z } from 'zod';
import json from '../data/turismo/pontos.json';

const num = z.number().finite();
const par = z.tuple([num, num]);

const Zona = z.object({
  atividade: z.string(),
  forma: z.enum(['anel', 'caixa', 'linha', 'caminho', 'gramado', 'fluxo']),
  n: z.number().int().min(1).max(200),
  ref: par.optional(),
  rotAncora: z.boolean().optional(),
  olhar: z.union([z.literal('centro'), z.literal('fora'), num]).optional(),
  // anel
  r: par.optional(), arco: par.optional(),
  // caixa / linha
  c: par.optional(), t: par.optional(), a: par.optional(), b: par.optional(),
  // caminho / gramado
  raio: num.positive().optional(), tipos: z.array(z.number().int().min(0).max(6)).optional(),
  // fluxo
  de: par.optional(), para: par.optional(), vel: num.positive().optional(),
});

const Evento = z.object({
  rotulo: z.string(), diasSemana: z.array(z.number().int().min(0).max(6)), meses: z.array(z.number().int().min(1).max(12)).optional(),
  inicio: num, fim: num, ocupacao: num.min(0).max(1),
});

const Ponto = z.object({
  id: z.string(), nome: z.string(), chave: z.string(),
  categoria: z.enum(['mirante', 'praia', 'parque', 'estadio', 'monumento', 'religioso', 'cultural', 'atracao', 'transporte']),
  construtor: z.string().nullable(), orla: z.string().optional(), foraDoMapa: z.boolean().optional(),
  lat: num.min(-90).max(90), lon: num.min(-180).max(180),
  w: num.positive().optional(), d: num.positive().optional(), h: num.positive().optional(),
  capacidade: z.number().int().positive(), ocupacaoPico: num.min(0).max(1), pico: z.array(par), nota: num.min(3).max(5), fimDeSemana: num.positive(),
  fonte: z.string().min(3), historia: z.string().min(60),
  /** eixo [lat, lon] de uma obra linear (Escadaria Selarón) e a largura em metros */
  trajeto: z.array(par).min(2).optional(), larguraM: num.positive().optional(),
  eventos: z.array(Evento).optional(), visitaDiaria: num.min(0).max(1).optional(),
  zonas: z.array(Zona),
});

const Atividade = z.object({ rotulo: z.string(), clipe: z.enum(['foto', 'pose', 'sentar', 'parado', 'correr', 'andar', 'pular', 'palmas']), vel: num.positive().optional(), extra: z.string().optional() });

const Esquema = z.object({
  atividades: z.record(z.string(), Atividade),
  pontos: z.array(Ponto).min(1),
  orla: z.object({
    praias: z.record(z.string(), z.object({ eixo: z.array(par).min(2), quiosquesPorKm: num, postosPorKm: num, voleiPorKm: num, surfistasPorKm: num, ambulantesPorKm: num, barcos: num })),
    quiosques: z.object({ nomes: z.array(z.string()).min(3) }),
    barcosFundeados: z.array(z.object({ lat: num, lon: num, modelo: z.string(), rot: num })),
  }),
  arranhaCeus: z.object({ alturaMinM: num.positive(), luzBalizamento: z.boolean(), nota: z.string() }),
}).superRefine((d, ctx) => {
  const ids = new Set<string>();
  for (const p of d.pontos) {
    if (ids.has(p.id)) ctx.addIssue({ code: 'custom', message: `ponto repetido: ${p.id}` });
    ids.add(p.id);
    for (const zn of p.zonas) if (!d.atividades[zn.atividade]) ctx.addIssue({ code: 'custom', message: `${p.id}: atividade desconhecida "${zn.atividade}"` });
    if (p.categoria === 'praia' && (!p.orla || !d.orla.praias[p.orla])) ctx.addIssue({ code: 'custom', message: `${p.id}: praia sem orla` });
  }
});

export type Zona = z.infer<typeof Zona>;
export type PontoTuristico = z.infer<typeof Ponto>;
export type Atividade = z.infer<typeof Atividade>;
export type Turismo = z.infer<typeof Esquema>;
export const TURISMO: Turismo = Esquema.parse(json);
export const PONTOS = TURISMO.pontos;
export const pontoPorId = (id: string) => PONTOS.find((p) => p.id === id);

// ── ocupação ──────────────────────────────────────────────────────────────────────

export interface Contexto { hora: number; diaSemana: number; mes: number; chuva: number; temp?: number }

const suave = (h: number, a: number, b: number) => (h >= a && h <= b ? 1 : Math.exp(-((h < a ? a - h : h - b) ** 2) / (2 * 1.4 * 1.4)));
/** movimento do dia (0–1): 1 dentro das faixas de pico, cai com ~1,4 h de desvio fora delas */
export function curvaDoPonto(p: PontoTuristico, hora: number): number {
  if (!p.pico.length) return curvaGenerica(hora);
  let m = 0;
  for (const [a, b] of p.pico) m = Math.max(m, suave(hora, a, b));
  return m < 0.02 ? 0 : m;
}
/** passeios fora de evento (estádios): manhã e começo da tarde */
function curvaGenerica(hora: number): number {
  const pts: [number, number][] = [[0, 0], [8, 0], [10, 0.7], [13, 1], [16, 0.8], [18, 0.2], [20, 0], [24, 0]];
  for (let i = 1; i < pts.length; i++) if (hora <= pts[i][0]) { const [h0, f0] = pts[i - 1], [h1, f1] = pts[i]; return f0 + ((f1 - f0) * (hora - h0)) / (h1 - h0); }
  return 0;
}

/** evento ativo agora (jogo, desfile): rampa de chegada nos primeiros 35% da janela, plateau, saída nos 25% finais */
export function eventoAgora(p: PontoTuristico, c: Contexto): { rotulo: string; fase: number; ocupacao: number } | null {
  for (const e of p.eventos ?? []) {
    // janelas que passam da meia-noite (fim > 24) continuam no dia seguinte
    const diaOk = (dow: number, mes: number) => e.diasSemana.includes(dow) && (!e.meses || e.meses.includes(mes));
    let h = c.hora, dow = c.diaSemana;
    if (h < e.fim - 24) { h += 24; dow = (dow + 6) % 7; }
    if (!diaOk(dow, c.mes) || h < e.inicio || h > e.fim) continue;
    const u = (h - e.inicio) / (e.fim - e.inicio);
    const f = u < 0.35 ? u / 0.35 : u > 0.75 ? Math.max(0, (1 - u) / 0.25) : 1;
    return { rotulo: e.rotulo, fase: u, ocupacao: e.ocupacao * f };
  }
  return null;
}

/** fração da capacidade ocupada agora (0–1) */
export function ocupacaoAgora(p: PontoTuristico, c: Contexto): number {
  const ev = eventoAgora(p, c);
  if (ev) return ev.ocupacao;
  const fds = c.diaSemana === 0 || c.diaSemana === 6;
  const base = p.eventos ? (p.visitaDiaria ?? 0) : p.ocupacaoPico;
  const clima = 1 - Math.min(0.6, c.chuva * 0.5);
  const calor = p.categoria === 'praia' && c.temp !== undefined ? Math.min(1, Math.max(0.15, (c.temp - 18) / 11)) : 1;
  return Math.min(1, base * curvaDoPonto(p, c.hora) * (fds ? p.fimDeSemana : 1) * clima * calor);
}

/** quantas pessoas estão no ponto agora */
export const visitantesDoPonto = (p: PontoTuristico, c: Contexto): number => Math.round(p.capacidade * ocupacaoAgora(p, c));

/** quantas vezes por hora o público do ponto se renova (inverso da permanência média) */
const GIRO: Record<PontoTuristico['categoria'], number> = { mirante: 0.7, praia: 0.3, parque: 0.35, estadio: 0.8, monumento: 1.2, religioso: 1.0, cultural: 0.6, atracao: 1.0, transporte: 1.5 };

/** contador do dia: quem já passou pelo ponto desde 0h (integra a ocupação, 15 em 15 min; em dia de evento vale o maior público) */
export function visitantesHoje(p: PontoTuristico, c: Contexto): number {
  let total = 0, picoEvento = 0;
  for (let h = 0; h < c.hora; h += 0.25) {
    const cc = { ...c, hora: h };
    const ev = eventoAgora(p, cc);
    if (ev) picoEvento = Math.max(picoEvento, p.capacidade * ev.ocupacao);
    else total += p.capacidade * ocupacaoAgora(p, cc) * GIRO[p.categoria] * 0.25;
  }
  return Math.round(total + picoEvento);
}

/** nota da avaliação simulada: cai com lotação acima de 80% e com chuva forte */
export function notaDoPonto(p: PontoTuristico, c: Contexto): number {
  const o = ocupacaoAgora(p, c);
  const nota = p.nota - 0.5 * Math.max(0, (o - 0.8) / 0.2) - (c.chuva > 0.3 ? 0.15 : 0);
  return Math.round(Math.min(5, Math.max(3, nota)) * 10) / 10;
}

const hh = (h: number) => `${Math.floor(h)}h${h % 1 ? String(Math.round((h % 1) * 60)).padStart(2, '0') : ''}`;
/** "10h às 15h" ou, para pontos com eventos, o calendário ("Jogo de domingo (16h)") */
export function textoPico(p: PontoTuristico): string {
  if (p.eventos?.length && !p.pico.length) return p.eventos.map((e) => e.rotulo).join(' · ');
  return p.pico.map(([a, b]) => `${hh(a)} às ${hh(b)}`).join(' e ');
}
