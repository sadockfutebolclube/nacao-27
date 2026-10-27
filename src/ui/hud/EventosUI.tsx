/**
 * HUD da Fase 6: tempo agora (com alerta da Defesa Civil), banner da festa em curso e o
 * painel de decisões (storylets com escolha e prazo) com o histórico da agenda.
 */
import { useState } from 'react';
import { comando, useGame } from '../../sim/bridge';
import { TICKS_POR_DIA } from '../../sim/simulation';
import type { Stats } from '../../sim/protocol';

const ALERTAS: Record<string, { txt: string; cor: string }> = {
  enchente: { txt: 'Alerta de enchente', cor: 'bg-perigo text-white' },
  temporal: { txt: 'Temporal', cor: 'bg-acento-2 text-tinta' },
  calor: { txt: 'Onda de calor', cor: 'bg-[#ff8a3d] text-tinta' },
  queimadas: { txt: 'Fumaça de queimadas', cor: 'bg-[#b8936a] text-tinta' },
  estiagem: { txt: 'Estiagem', cor: 'bg-acento-2 text-tinta' },
  ressaca: { txt: 'Ressaca no litoral', cor: 'bg-[#3f8fe0] text-white' },
  frio: { txt: 'Frio intenso', cor: 'bg-[#8fd3ff] text-tinta' },
};

export function iconeTempo(c: Stats['clima'], hora: number): string {
  if (c.fumaca > 0.5) return '🌫️';
  if (c.chuvaHoje >= 25) return '⛈️';
  if (c.chuvaHoje >= 1 && (!c.convectiva || hora >= 13)) return '🌧️';
  if (c.geada > 0.5 && hora < 10) return '❄️';
  if (c.calor > 0.5) return '🥵';
  return hora > 18.5 || hora < 5.5 ? '🌙' : c.chuvaHoje >= 1 ? '⛅' : '☀️';
}

/** Linha compacta de tempo para o cartão do relógio. */
export function TempoAgora({ st }: { st: Stats }) {
  const hora = useGame((s) => (s.horaAuto ? 12 : s.hora));
  const c = st.clima;
  if (!c) return null;
  const al = ALERTAS[c.alerta];
  const enso = c.enso === 'el-nino' ? ' · El Niño' : c.enso === 'la-nina' ? ' · La Niña' : '';
  return (
    <div className="flex items-center gap-1.5 text-[11px] text-suave whitespace-nowrap" title={`${c.estacao[0].toUpperCase()}${c.estacao.slice(1)} (período ${c.periodo})${enso} · chuva hoje ${Math.round(c.chuvaHoje)} mm · últimos 30 dias ${Math.round(c.chuva30d)} mm (normal ${Math.round(c.normal30)} mm) · máx. ${Math.round(c.tMax)}°C, mín. ${Math.round(c.tMin)}°C`}>
      <span>{iconeTempo(c, hora)}</span>
      <span className="num text-texto">{Math.round(c.tMax)}°</span>
      <span className="hidden 2xl:inline">{c.estacao}{enso}</span>
      {al && <span className={`px-1.5 rounded text-[10px] font-semibold ${al.cor}`}>{al.txt}</span>}
    </div>
  );
}

const EMOJI_FESTA: Record<string, string> = { carnaval: '🎭', junina: '🔥', reveillon: '🎆', boi: '🐂', religiosa: '🕯️', cultural: '🎪', agro: '🐄', show: '🎤' };
export function BannerFesta({ st }: { st: Stats }) {
  const f = st.festa;
  if (!f) return null;
  return (
    <div className="absolute top-[5.7rem] left-1/2 -translate-x-1/2 painel rounded-full px-4 py-1 text-xs pointer-events-none surgir whitespace-nowrap">
      {EMOJI_FESTA[f.tipo] ?? '🎉'} <b>{f.nome}</b> <span className="text-suave">· {f.dia}º dia</span>
    </div>
  );
}

const CAT: Record<string, string> = {
  desastre: 'Defesa Civil', clima: 'Tempo', seguranca: 'Segurança', economia: 'Economia', servicos: 'Serviços', politica: 'Política', prefeitos: 'Prefeituras',
  federal: 'Brasília', imprensa: 'Imprensa', cultura: 'Cultura', esporte: 'Esporte', positivo: 'Boa notícia', sociedade: 'Sociedade', festa: 'Festa',
};

/** Decisões pendentes (canto direito) e histórico da agenda. */
export function PainelDecisoes({ st }: { st: Stats }) {
  const toast = useGame((s) => s.toast);
  const [aberto, setAberto] = useState(true);
  const [historico, setHistorico] = useState(false);
  const pend = st.eventos?.pendentes ?? [];
  const hoje = Math.floor(st.tick / TICKS_POR_DIA);
  if (!pend.length && !historico) {
    return st.eventos?.historico.length ? (
      <button onClick={() => setHistorico(true)} className="absolute right-3 bottom-[6.2rem] painel rounded-lg px-2.5 py-1 text-[11px] text-suave hover:text-white pointer-events-auto">Agenda do governo</button>
    ) : null;
  }
  const escolher = async (uid: number, i: number) => {
    const r = await comando({ kind: 'evento', uid, escolha: i });
    toast(r.msg ?? (r.ok ? 'Decisão tomada' : 'Não foi possível'), r.ok ? 'ok' : 'erro');
  };
  const p = pend[0];
  return (
    <div className="absolute right-3 bottom-[6.2rem] w-[340px] max-w-[calc(100vw-1.5rem)] painel rounded-xl pointer-events-auto surgir overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-borda">
        <div className="text-xs">
          {historico ? <b>Agenda do governo</b> : <><b>Decisões</b> <span className="ml-1 px-1.5 rounded-full bg-perigo text-white text-[10px]">{pend.length}</span></>}
        </div>
        <div className="flex gap-2 text-[11px]">
          <button className="text-suave hover:text-white" onClick={() => setHistorico(!historico)}>{historico ? (pend.length ? 'Decisões' : 'Fechar') : 'Agenda'}</button>
          {!historico && <button className="text-suave hover:text-white" onClick={() => setAberto(!aberto)}>{aberto ? 'Minimizar' : 'Abrir'}</button>}
        </div>
      </div>
      {historico ? (
        <div className="max-h-80 overflow-auto px-3 py-2 space-y-1.5">
          {(st.eventos?.historico ?? []).map((h, i) => (
            <div key={i} className="text-[11px]">
              <span className="text-suave num">{h.data}</span> <span className="text-acento-2">{CAT[h.categoria] ?? h.categoria}</span> · {h.titulo}
              {h.escolha && <div className="text-suave pl-2">↳ {h.escolha}</div>}
            </div>
          ))}
        </div>
      ) : aberto && p && (
        <div className="p-3">
          <div className="text-[10px] uppercase tracking-wider text-acento-2">{CAT[p.categoria] ?? p.categoria} · {Math.max(0, p.prazoDia - hoje)} dia(s) para decidir</div>
          <div className="titulo text-base font-semibold leading-tight mt-0.5">{p.titulo}</div>
          <p className="text-xs text-texto/85 mt-1">{p.texto}</p>
          <div className="mt-2 space-y-1.5">
            {p.escolhas.map((e) => (
              <button key={e.i} onClick={() => escolher(p.uid, e.i)} className="w-full text-left rounded-lg border border-borda hover:border-acento hover:bg-acento/5 px-2.5 py-1.5">
                <div className="text-xs font-semibold">{e.texto}{e.i === p.padrao && <span className="ml-1 text-[9px] text-suave font-normal">(se ninguém decidir)</span>}</div>
                {e.detalhe && <div className="text-[10px] text-suave">{e.detalhe}</div>}
              </button>
            ))}
          </div>
          {pend.length > 1 && <div className="text-[10px] text-suave mt-2">+ {pend.length - 1} decisão(ões) na fila</div>}
        </div>
      )}
    </div>
  );
}
