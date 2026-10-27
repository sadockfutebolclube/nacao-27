/** Painel da nuvem (Fase 9): login, saves no Supabase e ranking de legados. Usado no Planalto e no menu. */
import { useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { useApp } from '../../app/store';
import { aoMudarSessao, apagarNuvem, baixarNuvem, entrarConvidado, entrarEmail, lerRanking, listarNuvem, nuvemConfigurada, publicarRanking, sairNuvem, salvarNuvem, sessao, type EntradaRanking, type SaveNuvem } from '../../cloud/nuvem';
import { carregarMacro } from '../../data/loader';
import { PARTIDOS } from '../../sim/politica/dados';
import type { Presidencia } from '../../sim/presidente/presidencia';
import { usePres } from '../../sim/presidente/store';
import { Botao } from '../governo/comum';
import { num, Secao } from './comum';

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

export function Ranking({ modo }: { modo: 'governador' | 'presidente' }) {
  const [r, setR] = useState<EntradaRanking[] | null>(null);
  const [erro, setErro] = useState('');
  useEffect(() => { if (nuvemConfigurada()) lerRanking(modo).then(setR).catch((e) => setErro(String(e.message ?? e))); }, [modo]);
  if (!nuvemConfigurada()) return null;
  return (
    <div>
      {erro && <div className="text-xs text-perigo">{erro}</div>}
      {r && r.length === 0 && <div className="text-xs text-suave">Ninguém publicou ainda. Seja o primeiro.</div>}
      {r && r.length > 0 && (
        <table className="w-full text-xs">
          <tbody>{r.map((x, i) => <tr key={i} className="border-b border-white/5"><td className="num text-suave w-6">{i + 1}</td><td><b>{x.apelido}</b> <span className="text-suave">{[x.partido, x.uf].filter(Boolean).join(' · ')}</span></td><td className="text-suave">{x.desfecho}</td><td className="num">{num(x.aprovacao, 0)}%</td><td className="num font-semibold text-acento text-right">{x.nota}</td></tr>)}</tbody>
        </table>
      )}
    </div>
  );
}

const DESFECHO: Record<string, string> = { mandato: 'fim do mandato', derrota: 'derrotado(a)', impeachment: 'impeachment', 'sucessor-eleito': 'elegeu o sucessor', 'sucessor-derrotado': '2 mandatos' };

export function PainelNuvem({ p }: { p: Presidencia }) {
  const s = useSessao();
  const restaurar = usePres((st) => st.restaurar);
  const [lista, setLista] = useState<SaveNuvem[] | null>(null);
  const [msg, setMsg] = useState('');
  const [apelido, setApelido] = useState(p.init.nome.split(' ')[0]);
  const [publicado, setPublicado] = useState(false);
  const atualizar = () => listarNuvem('presidente').then(setLista).catch((e) => setMsg(String(e.message ?? e)));
  useEffect(() => { if (s) atualizar(); }, [s]);
  const rotulo = `${p.init.nome} (${PARTIDOS[p.init.partido].sigla}) — ${p.dataTexto()}`;
  return (
    <div>
      <Login s={s}>
        <Secao titulo="Saves na nuvem">
          <Botao tom="primario" onClick={() => { setMsg('Enviando…'); salvarNuvem('presidente', rotulo, p.serializar()).then(() => { setMsg('Salvo na nuvem.'); atualizar(); }).catch((e) => setMsg(String(e.message ?? e))); }}>Salvar este governo na nuvem</Botao>
          <div className="flex flex-col gap-1 mt-2">
            {lista?.map((x) => (
              <div key={x.id} className="flex items-center justify-between gap-2 text-xs rounded-lg bg-white/[0.04] px-2 py-1.5">
                <span className="truncate">{x.rotulo} <span className="text-suave">· {new Date(x.criado_em).toLocaleString('pt-BR')} · {Math.round(x.tamanho / 1024)} KB</span></span>
                <span className="flex gap-2 shrink-0">
                  <button className="text-acento hover:underline" onClick={async () => { try { await restaurar(await baixarNuvem(x.id), await carregarMacro()); setMsg('Governo carregado.'); } catch (e) { setMsg(String(e)); } }}>carregar</button>
                  <button className="text-perigo hover:underline" onClick={() => apagarNuvem(x.id).then(atualizar)}>apagar</button>
                </span>
              </div>
            ))}
          </div>
        </Secao>
        {p.fim && !publicado && (
          <Secao titulo="Publicar o legado no ranking">
            <div className="flex gap-2">
              <input value={apelido} onChange={(e) => setApelido(e.target.value)} maxLength={24} className="flex-1 bg-white/5 border border-borda rounded-lg px-2 py-1.5 text-xs" aria-label="Apelido público no ranking" />
              <Botao tom="primario" desativado={apelido.trim().length < 2} onClick={() => publicarRanking({ apelido, modo: 'presidente', uf: p.init.origem, partido: PARTIDOS[p.init.partido].sigla, nota: p.nota(), aprovacao: p.aprovacao, desfecho: DESFECHO[p.fim!.motivo] ?? p.fim!.motivo, anos: Math.round(p.t / 365) }).then(() => { setPublicado(true); setMsg('Publicado!'); }).catch((e) => setMsg(String(e.message ?? e)))}>Publicar (nota {p.nota()})</Botao>
            </div>
            <div className="text-[10px] text-suave mt-1">O apelido aparece para todos os jogadores.</div>
          </Secao>
        )}
      </Login>
      {msg && <div className="text-xs text-acento-2 mt-2">{msg}</div>}
      <Secao titulo="Ranking — Presidentes"><Ranking modo="presidente" /></Secao>
      {p.fim && <div className="mt-4"><Botao onClick={() => { usePres.getState().sair(); useApp.getState().irPara('menu'); }}>Voltar ao menu</Botao></div>}
    </div>
  );
}
