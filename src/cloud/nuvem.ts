/**
 * Nuvem (Fase 9): saves e ranking de legados no Supabase. Opcional — sem VITE_SUPABASE_URL e
 * VITE_SUPABASE_ANON_KEY o jogo funciona só com saves locais. Esquema em supabase/migrations/.
 * Login: convidado (sessão anônima neste navegador) ou link mágico por e-mail (vários aparelhos).
 * Saves vão comprimidos (gzip + base64).
 */
import type { Session, SupabaseClient } from '@supabase/supabase-js';

const URL_ = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const CHAVE = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

let cli: SupabaseClient | null = null;
export const nuvemConfigurada = () => !!(URL_ && CHAVE);
/** Cliente sob demanda: o pacote do Supabase só é baixado quando a nuvem é usada (Fase 10). */
async function c(): Promise<SupabaseClient> {
  if (!nuvemConfigurada()) throw new Error('Nuvem não configurada (defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY).');
  if (!cli) {
    const { createClient } = await import('@supabase/supabase-js');
    cli ??= createClient(URL_!, CHAVE!, { auth: { persistSession: true, storageKey: 'nacao27:auth' } });
  }
  return cli;
}

export async function sessao(): Promise<Session | null> {
  if (!nuvemConfigurada()) return null;
  return (await (await c()).auth.getSession()).data.session;
}
export function aoMudarSessao(f: (s: Session | null) => void) {
  if (!nuvemConfigurada()) return () => undefined;
  let sair = () => {};
  let ativo = true;
  c().then((cl) => { if (!ativo) return; const { data } = cl.auth.onAuthStateChange((_e, s) => f(s)); sair = () => data.subscription.unsubscribe(); }).catch(() => undefined);
  return () => { ativo = false; sair(); };
}
export async function entrarConvidado() {
  const { error } = await (await c()).auth.signInAnonymously();
  if (error) throw new Error(error.message);
}
export async function entrarEmail(email: string) {
  const { error } = await (await c()).auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname } });
  if (error) throw new Error(error.message);
}
export async function sairNuvem() { await (await c()).auth.signOut(); }

// ── compressão ─────────────────────────────────────────────────────────────────

export async function gzipB64(texto: string): Promise<string> {
  const stream = new Blob([texto]).stream().pipeThrough(new CompressionStream('gzip'));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
export async function gunzipB64(b64: string): Promise<string> {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

// ── saves ──────────────────────────────────────────────────────────────────────

export type ModoSave = 'cidade' | 'presidente';
export interface SaveNuvem { id: string; modo: ModoSave; rotulo: string; tamanho: number; criado_em: string }

export async function salvarNuvem(modo: ModoSave, rotulo: string, json: string): Promise<void> {
  const dados = await gzipB64(json);
  const { error } = await (await c()).from('saves').insert({ modo, rotulo: rotulo.slice(0, 120), dados, tamanho: json.length });
  if (error) throw new Error(error.message);
}
export async function listarNuvem(modo?: ModoSave): Promise<SaveNuvem[]> {
  let q = (await c()).from('saves').select('id, modo, rotulo, tamanho, criado_em').order('criado_em', { ascending: false }).limit(20);
  if (modo) q = q.eq('modo', modo);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data as SaveNuvem[];
}
export async function baixarNuvem(id: string): Promise<string> {
  const { data, error } = await (await c()).from('saves').select('dados').eq('id', id).single();
  if (error) throw new Error(error.message);
  return gunzipB64((data as { dados: string }).dados);
}
export async function apagarNuvem(id: string) {
  const { error } = await (await c()).from('saves').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// ── ranking ────────────────────────────────────────────────────────────────────

export interface EntradaRanking { apelido: string; modo: 'governador' | 'presidente'; uf: string | null; partido: string | null; nota: number; aprovacao: number; desfecho: string; anos: number; criado_em?: string }

export async function publicarRanking(e: EntradaRanking) {
  const { error } = await (await c()).from('ranking').insert({ ...e, apelido: e.apelido.trim().slice(0, 24), aprovacao: Math.round(e.aprovacao * 10) / 10 });
  if (error) throw new Error(error.message);
}
export async function lerRanking(modo: 'governador' | 'presidente', n = 20): Promise<EntradaRanking[]> {
  const { data, error } = await (await c()).from('ranking').select('apelido, modo, uf, partido, nota, aprovacao, desfecho, anos, criado_em').eq('modo', modo).order('nota', { ascending: false }).limit(n);
  if (error) throw new Error(error.message);
  return data as EntradaRanking[];
}
