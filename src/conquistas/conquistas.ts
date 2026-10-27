/**
 * Conquistas permanentes (Fase 10): valem entre partidas e ficam no navegador (`nacao27:conquistas`).
 * São checadas a cada poucos segundos a partir do estado do jogo. As conquistas de cada mandato continuam na
 * tela de legado. Desde a Fase 13 o jogo é só o Rio: saíram as da Presidência e as de "Brasil" (estados, biomas).
 */
import type { Stats } from '../sim/protocol';

export type Categoria = 'cidade' | 'estado';
export interface Registro { ufs: string[]; regioes: string[]; biomas: string[]; interior: boolean; carreira: boolean }
export interface CtxConquista { stats?: Stats; registro: Registro }
export interface DefConquista { id: string; nome: string; desc: string; cat: Categoria; icone: string; teste: (c: CtxConquista) => boolean; progresso?: (c: CtxConquista) => [number, number] }

const e = (c: CtxConquista) => c.stats?.estado ?? null;

export const CONQUISTAS: DefConquista[] = [
  // ── cidade
  { id: 'mil', nome: 'Primeiro mil', desc: 'Chegue a 1.000 moradores na cidade.', cat: 'cidade', icone: '🏘', teste: (c) => (c.stats?.populacao ?? 0) >= 1000 },
  { id: 'dez-mil', nome: 'Cidade média', desc: 'Chegue a 10.000 moradores.', cat: 'cidade', icone: '🏙', teste: (c) => (c.stats?.populacao ?? 0) >= 10_000 },
  { id: 'cem-mil', nome: 'Metrópole', desc: 'Chegue a 100.000 moradores.', cat: 'cidade', icone: '🌆', teste: (c) => (c.stats?.populacao ?? 0) >= 100_000 },
  { id: 'saneamento', nome: 'Água limpa', desc: 'Trate 90% do esgoto de uma cidade com mais de 5 mil habitantes.', cat: 'cidade', icone: '💧', teste: (c) => !!c.stats && c.stats.populacao >= 5000 && c.stats.esgoto.tratadoPct >= 0.9 },
  { id: 'urbanizou', nome: 'Favela urbanizada', desc: 'Conclua a urbanização de uma comunidade.', cat: 'cidade', icone: '🏗', teste: (c) => !!c.stats?.cidade.favelas.lista.some((f) => f.status === 'urbanizada') },
  { id: 'metro', nome: 'Embaixo da terra', desc: 'Ponha uma linha de metrô para operar.', cat: 'cidade', icone: '🚇', teste: (c) => !!c.stats?.cidade.transporte.linhas.some((l) => l.tipo === 'metro' && l.status === 'operando') },
  { id: 'teleferico', nome: 'Pelo alto', desc: 'Inaugure um teleférico.', cat: 'cidade', icone: '🚡', teste: (c) => !!c.stats?.cidade.transporte.linhas.some((l) => l.tipo === 'teleferico' && l.status === 'operando') },
  { id: 'paz', nome: 'Território do Estado', desc: 'Cidade com mais de 5 mil moradores sem área dominada por facção ou milícia.', cat: 'cidade', icone: '🕊', teste: (c) => !!c.stats && c.stats.populacao >= 5000 && c.stats.cidade.territorio.estado >= 0.98 },
  // ── governo estadual
  { id: 'loa', nome: 'Orçamento aprovado', desc: 'Aprove uma LOA na Assembleia.', cat: 'estado', icone: '📜', teste: (c) => !!e(c)?.pol.votacoes.some((v) => v.titulo.includes('LOA') && v.aprovado) },
  { id: 'previdencia', nome: 'Reforma da Previdência', desc: 'Aprove a reforma da Previdência estadual.', cat: 'estado', icone: '👵', teste: (c) => !!e(c)?.previdencia.reformada },
  { id: 'cpi', nome: 'Sobrevivi à CPI', desc: 'Atravesse uma CPI até o relatório final.', cat: 'estado', icone: '🔍', teste: (c) => !!e(c)?.pol.cpis.some((x) => x.status === 'concluida') },
  { id: 'ideb', nome: 'Educação em alta', desc: 'Melhore o IDEB do ensino médio em 0,3 ponto.', cat: 'estado', icone: '🎓', teste: (c) => { const s = e(c); return !!s?.idebDivulgado && s.idebDivulgado.valor >= s.indicadoresIniciais.ideb + 0.3; } },
  { id: 'reeleito-gov', nome: 'Mais quatro anos', desc: 'Seja reeleito(a) governador(a).', cat: 'estado', icone: '🗳', teste: (c) => (e(c)?.mandato ?? 1) >= 2 },
  { id: 'legado-gov', nome: 'Missão cumprida', desc: 'Termine o governo estadual elegendo o sucessor ou completando os dois mandatos.', cat: 'estado', icone: '🏅', teste: (c) => { const m = e(c)?.legado?.motivo; return m === 'sucessor-eleito' || m === 'fim-mandatos'; } },
  { id: 'popular-gov', nome: 'Querido(a) pelo povo', desc: 'Chegue a 65% de aprovação como governador(a).', cat: 'estado', icone: '❤', teste: (c) => (e(c)?.aprovacao ?? 0) >= 65 },
];

// ── armazenamento ────────────────────────────────────────────────────────────────

const CHAVE = 'nacao27:conquistas';
export interface Salvo { desbloqueadas: Record<string, string>; registro: Registro }
const vazio = (): Salvo => ({ desbloqueadas: {}, registro: { ufs: [], regioes: [], biomas: [], interior: false, carreira: false } });

export function lerConquistas(): Salvo {
  try {
    const j = JSON.parse(localStorage.getItem(CHAVE) ?? 'null') as Salvo | null;
    return j ? { desbloqueadas: j.desbloqueadas ?? {}, registro: { ...vazio().registro, ...j.registro } } : vazio();
  } catch { return vazio(); }
}
function gravar(s: Salvo) { try { localStorage.setItem(CHAVE, JSON.stringify(s)); } catch { /* modo privado */ } }

/** Registra uma partida (UF, região, bioma, interior, carreira). */
export function registrarPartida(p: { uf?: string; regiao?: string; bioma?: string; interior?: boolean; carreira?: boolean }) {
  const s = lerConquistas();
  const r = s.registro;
  const add = (l: string[], v?: string) => { if (v && !l.includes(v)) l.push(v); };
  add(r.ufs, p.uf); add(r.regioes, p.regiao); add(r.biomas, p.bioma);
  if (p.interior) r.interior = true;
  if (p.carreira) r.carreira = true;
  gravar(s);
}

/** Checa todas as conquistas; devolve as recém-desbloqueadas. */
export function checarConquistas(ctx: Omit<CtxConquista, 'registro'>): DefConquista[] {
  const s = lerConquistas();
  const c: CtxConquista = { ...ctx, registro: s.registro };
  const novas: DefConquista[] = [];
  for (const d of CONQUISTAS) {
    if (s.desbloqueadas[d.id]) continue;
    let ok = false;
    try { ok = d.teste(c); } catch { ok = false; }
    if (ok) { s.desbloqueadas[d.id] = new Date().toISOString(); novas.push(d); }
  }
  if (novas.length) gravar(s);
  return novas;
}
