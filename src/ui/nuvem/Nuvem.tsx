/** Nuvem (Fase 9): login no Supabase e ranking de legados de governadores. Usado no menu, na HUD e no legado. */
import { useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { aoMudarSessao, entrarConvidado, entrarEmail, lerRanking, nuvemConfigurada, sairNuvem, sessao, type EntradaRanking } from '../../cloud/nuvem';
import { Botao } from '../governo/comum';

export function useSessao() {
  const [s, setS] = useState<Session | null>(null);
  useEffect(() => { sessao().then(setS).catch(() => undefined); return aoMudarSessao(setS); }, []);
  return s;
}

/** Login (convidado ou e-mail) e estado da conexão. */
export function Login({ s, children }: { s: Session | null; children?: ReactNode }) {
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState('');
  if (!nuvemConfigurada()) return <div className="text-xs text-suave rounded-lg bg-white/5 p-3">Nuvem não configurada nesta instalação. Para ativar, crie um projeto Supabase, aplique <code>supabase/migrations/</code> e defina <code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_ANON_KEY</code> no <code>.env</code> (veja o README). Os saves locais continuam funcionando.</div>;
  if (s) return (
    <div>
      <div className="text-xs flex items-center justify-between rounded-lg bg-acento/10 border border-acento/30 px-3 py-2">
        <span>Conectado {s.user.is_anonymous ? 'como convidado(a) neste navegador' : `como ${s.user.email}`}</span>
        <button className="text-suave hover:text-white" onClick={() => sairNuvem()}>sair</button>
      </div>
      {children}
    </div>
  );
  return (
    <div className="text-xs">
      <div className="flex gap-2 items-center">
        <Botao tom="primario" onClick={() => entrarConvidado().catch((e) => setMsg(String(e.message ?? e)))}>Entrar como convidado(a)</Botao>
        <span className="text-suave">ou</span>
      </div>
      <div className="flex gap-2 mt-2">
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="seu@email.com" className="flex-1 bg-white/5 border border-borda rounded-lg px-2 py-1.5" aria-label="E-mail para o link de acesso" />
        <Botao onClick={() => entrarEmail(email).then(() => setMsg('Link enviado: abra o e-mail neste aparelho.')).catch((e) => setMsg(String(e.message ?? e)))} desativado={!email.includes('@')}>Receber link</Botao>
      </div>
      <div className="text-[10px] text-suave mt-1">Convidado: saves só neste navegador. E-mail: os mesmos saves em qualquer aparelho.</div>
      {msg && <div className="text-acento-2 mt-1">{msg}</div>}
    </div>
  );
}

export function Ranking() {
  const [r, setR] = useState<EntradaRanking[] | null>(null);
  const [erro, setErro] = useState('');
  useEffect(() => { if (nuvemConfigurada()) lerRanking('governador').then(setR).catch((e) => setErro(String(e.message ?? e))); }, []);
  if (!nuvemConfigurada()) return null;
  const pct = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
  return (
    <div>
      {erro && <div className="text-xs text-perigo">{erro}</div>}
      {r && r.length === 0 && <div className="text-xs text-suave">Ninguém publicou ainda. Seja o primeiro.</div>}
      {r && r.length > 0 && (
        <table className="w-full text-xs">
          <tbody>{r.map((x, i) => <tr key={i} className="border-b border-white/5"><td className="num text-suave w-6">{i + 1}</td><td><b>{x.apelido}</b> <span className="text-suave">{[x.partido, x.uf].filter(Boolean).join(' · ')}</span></td><td className="text-suave">{x.desfecho}</td><td className="num">{pct(x.aprovacao)}%</td><td className="num font-semibold text-acento text-right">{x.nota}</td></tr>)}</tbody>
        </table>
      )}
    </div>
  );
}
