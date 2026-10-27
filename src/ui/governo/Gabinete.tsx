/**
 * Aba Gabinete (Fase 5): secretários com nome, currículo, atributos e bordão; troca por um de três
 * candidatos (técnico, político da base, pessoa de confiança); escândalos e CPIs em andamento.
 */
import { useState } from 'react';
import { comando, useGame } from '../../sim/bridge';
import { CARGOS, PARTIDOS, type Cargo } from '../../sim/politica/dados';
import type { Secretario } from '../../sim/politica/politica';
import type { EstadoSnapshot } from '../../sim/estado/tipos';
import { Botao } from './comum';
import { Retrato } from './Retrato';

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export const dataMes = (mi: number) => `${MESES[((mi % 12) + 12) % 12]}/${2027 + Math.floor(mi / 12)}`;
const nivel = (v: number) => (v >= 0.75 ? 'alta' : v >= 0.5 ? 'média' : v >= 0.3 ? 'baixa' : 'muito baixa');
const PERFIL = { tecnico: 'Técnico(a)', politico: 'Indicação política', confianca: 'Confiança pessoal' };

function Barra({ v, cor, rotulo, texto }: { v: number; cor: string; rotulo: string; texto?: string }) {
  return (
    <div className="text-[11px]">
      <div className="flex items-center gap-2"><span className="text-suave w-20 shrink-0">{rotulo}</span>
      <div className="h-1.5 bg-white/8 rounded flex-1"><div className="h-full rounded" style={{ width: `${Math.round(v * 100)}%`, background: cor }} /></div>
      <span className="w-16 text-right shrink-0">{texto ?? nivel(v)}</span></div>
    </div>
  );
}

function corPessoa(s: Secretario) {
  return s.partido ? PARTIDOS[s.partido].cor : s.perfil === 'confianca' ? '#f5b942' : '#3ee0b0';
}

function Ficha({ s, candidato }: { s: Secretario; candidato?: boolean }) {
  return (
    <div className="flex gap-3">
      <Retrato semente={s.retrato} genero={s.genero} idade={s.idade} cor={corPessoa(s)} tamanho={candidato ? 48 : 60} titulo={s.nome} />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold leading-tight">{s.nome}</div>
        <div className="text-[11px] text-suave">{s.idade} anos · {s.cidade} · {s.formacao}</div>
        <div className="flex gap-1 mt-1 flex-wrap">
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/8">{PERFIL[s.perfil]}</span>
          {s.partido && <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: `${PARTIDOS[s.partido].cor}33`, color: PARTIDOS[s.partido].cor }}>{PARTIDOS[s.partido].sigla}</span>}
          {s.interino && <span className="text-[10px] px-1.5 py-0.5 rounded bg-acento-2/20 text-acento-2">interino(a)</span>}
        </div>
      </div>
    </div>
  );
}

function CardSecretario({ s, estado }: { s: Secretario; estado: EstadoSnapshot }) {
  const toast = useGame((g) => g.toast);
  const [trocando, setTrocando] = useState(false);
  const cargo = CARGOS.find((c) => c.id === s.cargo)!;
  const cands = estado.pol.candidatos[s.cargo];
  const escandalo = estado.pol.escandalos.find((e) => e.cargo === s.cargo && e.fase !== 'encerrado' && e.secretario === s.nome);
  const abrir = async () => {
    setTrocando(!trocando);
    if (!cands) await comando({ kind: 'estado', acao: { tipo: 'candidatos', cargo: s.cargo } });
  };
  const nomear = async (i: number) => {
    const r = await comando({ kind: 'estado', acao: { tipo: 'nomear', cargo: s.cargo as Cargo, indice: i } });
    toast(r.ok ? r.msg ?? 'Nomeado(a)' : r.msg ?? 'Não foi possível', r.ok ? 'ok' : 'erro');
    if (r.ok) setTrocando(false);
  };
  return (
    <div className={`rounded-xl p-3 border ${escandalo ? 'border-perigo/60 bg-perigo/5' : 'border-borda bg-white/[0.03]'}`}>
      <div className="flex justify-between items-start gap-2 mb-2">
        <div className="text-[10px] uppercase tracking-wider text-acento">{cargo.nome}</div>
        <div className="text-[10px] text-suave">desde {dataMes(s.desde)}</div>
      </div>
      <Ficha s={s} />
      {escandalo && <div className="text-[11px] text-perigo mt-2">⚠ Acusado(a) de {escandalo.tipo}{escandalo.fase === 'cpi' ? ' — CPI em andamento' : ''}</div>}
      <div className="space-y-1 mt-2">
        <Barra v={s.competencia} cor="#3ee0b0" rotulo="Competência" />
        <Barra v={s.lealdade} cor="#f5b942" rotulo="Lealdade" />
        <Barra v={s.ambicao} cor="#c77dff" rotulo="Ambição" />
      </div>
      <div className="text-[11px] mt-1 text-suave" title="Ninguém sabe ao certo — até a Polícia Federal bater na porta.">Honestidade: <span className="text-texto">?</span></div>
      <div className="text-xs italic text-texto/80 mt-1.5">“{s.bordao}”</div>
      <div className="mt-2"><Botao onClick={abrir}>{trocando ? 'Cancelar' : s.interino ? 'Nomear titular' : 'Substituir'}</Botao></div>
      {trocando && (
        <div className="mt-2 space-y-2">
          {!cands && <div className="text-xs text-suave">A Casa Civil está levantando nomes…</div>}
          {cands?.map((c, i) => (
            <div key={c.nome} className="rounded-lg border border-borda p-2">
              <Ficha s={c} candidato />
              <div className="text-[11px] text-suave mt-1">
                Currículo indica competência <b className="text-texto">{nivel(Math.round(c.competencia * 4) / 4)}</b>
                {c.partido ? <> · traz o apoio do <b className="text-texto">{PARTIDOS[c.partido].sigla}</b> na ALE</> : null}
                {c.perfil === 'confianca' ? ' · lealdade garantida' : ''}
              </div>
              <div className="mt-1.5"><Botao tom="primario" onClick={() => nomear(i)} titulo={s.interino ? '' : 'Trocar um secretário custa 3 de capital político'}>Nomear</Botao></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function Gabinete({ s }: { s: EstadoSnapshot }) {
  const pol = s.pol;
  const ativos = pol.escandalos.filter((e) => e.fase !== 'encerrado');
  const cpis = pol.cpis.filter((c) => c.status === 'instalada');
  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-3 gap-2">
        <div className="rounded-xl bg-white/[0.03] p-3">
          <div className="text-[11px] text-suave">Capital político</div>
          <div className="num text-2xl">{Math.round(pol.capital)}<span className="text-xs text-suave">/100</span></div>
          <div className="h-1.5 bg-white/8 rounded mt-1"><div className="h-full rounded bg-acento" style={{ width: `${pol.capital}%` }} /></div>
          <div className="text-[10px] text-suave mt-1">Moeda das negociações. Cresce com aprovação e com uma Casa Civil competente; vitórias no plenário rendem, derrotas custam.</div>
        </div>
        <div className="rounded-xl bg-white/[0.03] p-3">
          <div className="text-[11px] text-suave">Escândalos em curso</div>
          {ativos.length === 0 ? <div className="text-sm mt-1">Nenhum. Por enquanto.</div> : ativos.map((e) => (
            <div key={e.id} className="text-xs mt-1 text-perigo">{e.secretario}: {e.tipo} <span className="text-suave">({e.fase === 'cpi' ? 'CPI' : 'imprensa'})</span></div>
          ))}
        </div>
        <div className="rounded-xl bg-white/[0.03] p-3">
          <div className="text-[11px] text-suave">CPIs</div>
          {pol.cpis.length === 0 ? <div className="text-sm mt-1">Nenhuma CPI no mandato.</div> : pol.cpis.slice(-4).reverse().map((c) => (
            <div key={c.id} className="text-xs mt-1">
              <span className={c.status === 'instalada' ? 'text-perigo' : 'text-suave'}>{c.status === 'instalada' ? 'Em andamento' : c.status === 'engavetada' ? 'Engavetada' : 'Concluída'}</span> · {c.tema}
              {c.desfecho && <div className="text-[10px] text-suave">{c.desfecho}</div>}
            </div>
          ))}
          {cpis.length > 0 && <div className="text-[10px] text-suave mt-1">Demitir o secretário investigado reduz o estrago no relatório final.</div>}
        </div>
      </div>
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
        {CARGOS.map((c) => <CardSecretario key={c.id} s={pol.secretarios[c.id]} estado={s} />)}
      </div>
      <p className="text-[10px] text-suave">Competência multiplica o efeito do gasto de cada pasta (e, na Fazenda, o combate à sonegação). Secretários ambiciosos deixam o cargo em abril do ano eleitoral para concorrer. Todos os personagens são fictícios.</p>
    </div>
  );
}
