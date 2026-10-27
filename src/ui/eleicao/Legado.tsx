/**
 * Tela de legado (Fase 7): "Seu governo em números", exibida no fim do jogo — derrota nas urnas,
 * sucessão, fim do segundo mandato ou impeachment.
 */
import { fmt } from '../../app/store';
import type { Legado as TLegado } from '../../sim/eleicao/legado';
import type { Stats } from '../../sim/protocol';
import { useState } from 'react';
import { nuvemConfigurada, publicarRanking } from '../../cloud/nuvem';
import { PARTIDOS } from '../../sim/politica/dados';
import { Login, useSessao } from '../nuvem/Nuvem';

/** Publica o legado de governador(a) no ranking da nuvem. */
function PublicarGovernador({ L, st, nota }: { L: TLegado; st: Stats; nota: number }) {
  const s = useSessao();
  const [apelido, setApelido] = useState('');
  const [msg, setMsg] = useState('');
  const uf = mundo.init?.sigla ?? null;
  const partido = st.estado ? PARTIDOS[st.estado.partidoGov].sigla : null;
  return (
    <div className="mt-4 rounded-xl bg-white/[0.04] p-3">
      <div className="text-[11px] text-suave mb-1">Ranking de governadores · nota do legado <b className="text-acento num">{nota}</b></div>
      <Login s={s}>
        <div className="flex gap-2 mt-2">
          <input value={apelido} onChange={(e) => setApelido(e.target.value)} maxLength={24} placeholder="apelido público" className="flex-1 bg-white/5 border border-borda rounded-lg px-2 py-1.5 text-xs" aria-label="Apelido público no ranking" />
          <button disabled={apelido.trim().length < 2 || !!msg} onClick={() => publicarRanking({ apelido, modo: 'governador', uf, partido, nota, aprovacao: L.aprovacao.final, desfecho: L.titulo.slice(0, 40), anos: L.mandatos * 4 }).then(() => setMsg('Publicado!')).catch((e) => setMsg(String(e.message ?? e)))} className="px-3 py-1.5 rounded-lg bg-acento text-tinta text-xs font-semibold disabled:opacity-40">Publicar</button>
        </div>
      </Login>
      {msg && <div className="text-xs text-acento-2 mt-1">{msg}</div>}
    </div>
  );
}
import { mundo } from '../../sim/bridge';

const num = (v: number, casas: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
const bi = (v: number) => `R$ ${num(v / 1e9, 1)} bi`;
const pct = (v: number) => `${num(v * 100, 1)}%`;

function Serie({ s }: { s: number[] }) {
  if (s.length < 2) return null;
  const W = 300, H = 60;
  const x = (i: number) => (i / (s.length - 1)) * W, y = (v: number) => H - (v / 100) * H;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-16">
      <line x1="0" x2={W} y1={y(50)} y2={y(50)} stroke="#ffffff22" strokeDasharray="3 3" />
      <polyline fill="none" stroke="#3ee0b0" strokeWidth="2" points={s.map((v, i) => `${x(i)},${y(v)}`).join(' ')} />
    </svg>
  );
}

export function TelaLegado({ L, st, onMenu, onFechar }: { L: TLegado; st: Stats; onMenu: () => void; onFechar: () => void }) {
  const bom = L.motivo === 'sucessor-eleito' || L.motivo === 'fim-mandatos';
  const nota = Math.round(Math.max(0, Math.min(100, 0.6 * L.aprovacao.media + 0.4 * L.aprovacao.final + 5 * L.conquistas.length + (bom ? 10 : 0) - (L.motivo === 'afastado' ? 25 : 0))));
  return (
    <div className="absolute inset-0 z-30 bg-black/80 flex items-center justify-center p-3 pointer-events-auto">
      <div className="painel rounded-2xl w-[min(1000px,100%)] max-h-[94vh] overflow-auto p-6 surgir">
        <div className={`text-[10px] uppercase tracking-[0.25em] ${bom ? 'text-acento' : 'text-perigo'}`}>Fim de governo · {L.periodo} · {L.mandatos} mandato{L.mandatos > 1 ? 's' : ''}</div>
        <h2 className="titulo text-3xl font-bold mt-1">{L.titulo}</h2>
        <p className="text-sm text-suave mt-1">{L.texto}</p>

        <div className="grid md:grid-cols-4 gap-2 mt-4">
          <div className="rounded-xl bg-white/[0.04] p-3 md:col-span-2">
            <div className="flex justify-between text-[11px] text-suave"><span>Aprovação mês a mês</span><span>média {Math.round(L.aprovacao.media)}% · máx. {Math.round(L.aprovacao.max)}% · mín. {Math.round(L.aprovacao.min)}%</span></div>
            <Serie s={L.aprovacao.serie} />
            <div className="text-sm">Aprovação final: <b className="num">{Math.round(L.aprovacao.final)}%</b></div>
          </div>
          <div className="rounded-xl bg-white/[0.04] p-3">
            <div className="text-[11px] text-suave">Urnas</div>
            {L.eleicoes.length ? L.eleicoes.map((e) => <div key={e.ano} className="text-xs mt-1"><b>{e.ano}:</b> {e.texto}</div>) : <div className="text-xs mt-1">Não chegou à eleição.</div>}
          </div>
          <div className="rounded-xl bg-white/[0.04] p-3">
            <div className="text-[11px] text-suave">Assembleia</div>
            <div className="text-xs mt-1">Votações vencidas: <b className="num">{L.assembleia.vencidas}/{L.assembleia.total}</b></div>
            <div className="text-xs">CPIs: <b className="num">{L.assembleia.cpis}</b> · escândalos: <b className="num">{L.assembleia.escandalos}</b></div>
            {L.assembleia.impeachment && <div className="text-xs text-perigo">Impeachment admitido</div>}
          </div>
        </div>

        <div className="grid md:grid-cols-[1.4fr_1fr] gap-3 mt-3">
          <div className="rounded-xl bg-white/[0.04] p-3">
            <div className="text-[11px] text-suave mb-1">Indicadores: da posse ao fim</div>
            <table className="w-full text-sm">
              <tbody>
                {L.indicadores.map((l) => {
                  const melhorou = l.menorMelhor ? l.depois < l.antes * 0.995 : l.depois > l.antes * 1.005;
                  const piorou = l.menorMelhor ? l.depois > l.antes * 1.005 : l.depois < l.antes * 0.995;
                  return (
                    <tr key={l.nome} className="border-t border-white/5">
                      <td className="py-1">{l.nome}</td>
                      <td className="num text-suave text-right">{num(l.antes, l.casas)}{l.unidade}</td>
                      <td className="px-2 text-center">{melhorou ? <span className="text-acento">▲</span> : piorou ? <span className="text-perigo">▼</span> : <span className="text-suave">=</span>}</td>
                      <td className={`num text-right ${melhorou ? 'text-acento' : piorou ? 'text-perigo' : ''}`}>{num(l.depois, l.casas)}{l.unidade}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="space-y-3">
            <div className="rounded-xl bg-white/[0.04] p-3 text-sm space-y-0.5">
              <div className="text-[11px] text-suave mb-1">Contas públicas</div>
              <div className="flex justify-between"><span>Caixa do Tesouro</span><span className="num">{bi(L.fiscal.caixa[0])} → <b className={L.fiscal.caixa[1] >= 0 ? 'text-acento' : 'text-perigo'}>{bi(L.fiscal.caixa[1])}</b></span></div>
              <div className="flex justify-between"><span>Dívida / RCL</span><span className="num">{pct(L.fiscal.dcl[0])} → <b>{pct(L.fiscal.dcl[1])}</b></span></div>
              <div className="flex justify-between"><span>Pessoal / RCL</span><span className="num">{pct(L.fiscal.pessoal[0])} → <b>{pct(L.fiscal.pessoal[1])}</b></span></div>
              <div className="flex justify-between"><span>Crescimento real do PIB</span><span className="num">{pct(L.fiscal.pib)}</span></div>
              <div className="flex justify-between"><span>Regime da dívida</span><span>{L.fiscal.regime}</span></div>
            </div>
            <div className="rounded-xl bg-white/[0.04] p-3 text-sm">
              <div className="text-[11px] text-suave mb-1">{mundo.init?.cidade ?? 'A cidade'}{mundo.init?.capital === false ? '' : ' (capital)'}</div>
              <div className="flex justify-between"><span>Moradores nos novos bairros</span><span className="num">{fmt.int(st.populacao + st.populacaoInformal)}</span></div>
              <div className="flex justify-between"><span>Favelas urbanizadas</span><span className="num">{st.cidade.favelas.lista.filter((f) => f.status === 'urbanizada').length}/{st.cidade.favelas.lista.length}</span></div>
              <div className="flex justify-between"><span>Linhas de transporte</span><span className="num">{st.cidade.transporte.linhas.length}</span></div>
            </div>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-3 mt-3">
          <div className="rounded-xl bg-white/[0.04] p-3">
            <div className="text-[11px] text-suave mb-1">Obras entregues ({L.obras.length})</div>
            {L.obras.length ? <div className="text-xs leading-relaxed">{L.obras.join(' · ')}</div> : <div className="text-xs">Nenhuma grande obra concluída.</div>}
          </div>
          <div className="rounded-xl bg-white/[0.04] p-3">
            <div className="text-[11px] text-suave mb-1">Conquistas ({L.conquistas.length})</div>
            <div className="flex flex-wrap gap-1.5">
              {L.conquistas.length ? L.conquistas.map((c) => (
                <span key={c.id} title={c.desc} className="text-[11px] px-2 py-1 rounded-full bg-acento-2/15 text-acento-2 border border-acento-2/30">🏅 {c.nome}</span>
              )) : <span className="text-xs text-suave">Nenhuma desta vez.</span>}
            </div>
          </div>
        </div>

        {nuvemConfigurada() && <PublicarGovernador L={L} st={st} nota={nota} />}
        <div className="mt-5 flex justify-end gap-2 flex-wrap">
          <button onClick={onFechar} className="px-4 py-2 rounded-lg bg-white/8 hover:bg-white/12 text-sm">Ver a cidade</button>
          <button onClick={onMenu} className="px-4 py-2 rounded-lg bg-acento text-tinta font-semibold text-sm">Voltar ao menu</button>
        </div>
      </div>
    </div>
  );
}
