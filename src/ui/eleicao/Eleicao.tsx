/**
 * Aba Eleição (Fase 7): candidatos e coligações, pesquisas, convenção (reeleição ou sucessor),
 * horário eleitoral, agenda pelo mapa dos municípios, debate ao vivo, apoios no 2º turno e apuração.
 */
import { useEffect, useMemo, useState } from 'react';
import { fmt } from '../../app/store';
import { comando, mundo, useGame } from '../../sim/bridge';
import { corCandidato, primeiroTurno, segundoTurno, TEMAS, type Candidato, type EstadoEleicao, type Resultado, type Tema } from '../../sim/eleicao/eleicao';
import { PARTIDOS } from '../../sim/politica/dados';
import type { EstadoSnapshot } from '../../sim/estado/tipos';
import { Botao } from '../governo/comum';
import { Retrato } from '../governo/Retrato';
import { MapaMunicipios } from './MapaMunicipios';
import type { SiglaUF } from '../../data/schemas';

const FASE: Record<EstadoEleicao['fase'], string> = { pre: 'Pré-campanha', campanha: 'Campanha do 1º turno', segundoTurno: 'Campanha do 2º turno', apurado: 'Eleição decidida', encerrada: 'Encerrada' };
const pct = (v: number) => `${v.toFixed(1).replace('.', ',')}%`;

function CardCandidato({ c, e, intencao, rejeicao }: { c: Candidato; e: EstadoEleicao; intencao?: number; rejeicao?: number }) {
  const cor = corCandidato(e, c.id);
  return (
    <div className={`rounded-xl p-2.5 border ${c.doJogador ? 'border-acento bg-acento/5' : 'border-borda bg-white/[0.03]'} ${c.ativo ? '' : 'opacity-50'}`}>
      <div className="flex gap-2 items-center">
        {c.origem === 'governador'
          ? <div className="w-11 h-11 rounded-full flex items-center justify-center titulo font-bold text-tinta shrink-0" style={{ background: cor }}>VOCÊ</div>
          : <Retrato semente={c.pessoa.retrato} genero={c.pessoa.genero} idade={c.pessoa.idade} cor={cor} tamanho={44} titulo={c.urna} />}
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold leading-tight truncate">{c.origem === 'governador' ? 'Você (governador)' : c.urna}</div>
          <div className="text-[10px] text-suave truncate">{PARTIDOS[c.partido].sigla} · {{ governador: 'reeleição', sucessor: 'candidato(a) do governo', prefeito: 'prefeito(a) da capital', deputado: 'líder da oposição', outsider: 'de fora da política', nanico: 'candidatura ideológica' }[c.origem]}{c.ativo ? '' : ' · eliminado(a)'}</div>
        </div>
        {intencao !== undefined && <div className="num text-xl font-bold" style={{ color: cor }}>{Math.round(intencao)}%</div>}
      </div>
      <div className="flex items-center gap-1.5 mt-1.5 text-[10px] text-suave">
        <span className="whitespace-nowrap">TV {Math.round(c.tempoTV * 100)}%</span>
        <div className="flex-1 h-1 bg-white/8 rounded"><div className="h-full rounded" style={{ width: `${c.tempoTV * 100}%`, background: cor }} /></div>
        {rejeicao !== undefined && <span className="whitespace-nowrap">rejeição {Math.round(rejeicao)}%</span>}
      </div>
      <div className="text-[10px] text-suave mt-0.5 truncate" title={c.coligacao.map((p) => PARTIDOS[p].nome).join(', ')}>Coligação: {c.coligacao.map((p) => PARTIDOS[p].sigla).join(' · ')}</div>
    </div>
  );
}

function GraficoPesquisas({ e }: { e: EstadoEleicao }) {
  const ps = e.pesquisas.filter((p) => p.turno === (e.fase === 'segundoTurno' || e.resultado2 ? 2 : 1));
  if (ps.length < 2) return <div className="text-xs text-suave">As pesquisas registradas começam em março do ano eleitoral.</div>;
  const W = 420, H = 140;
  const x = (i: number) => (i / (ps.length - 1)) * W;
  const max = Math.max(50, ...ps.flatMap((p) => Object.values(p.intencao))) * 1.05;
  const y = (v: number) => H - (v / max) * H;
  const ids = Object.keys(ps[ps.length - 1].intencao).map(Number);
  return (
    <svg viewBox={`0 0 ${W} ${H + 14}`} className="w-full">
      {[10, 20, 30, 40, 50].filter((v) => v < max).map((v) => <line key={v} x1="0" x2={W} y1={y(v)} y2={y(v)} stroke="#ffffff14" />)}
      {ids.map((id) => (
        <polyline key={id} fill="none" stroke={corCandidato(e, id)} strokeWidth={e.candidatos.find((c) => c.id === id)?.doJogador ? 2.6 : 1.6}
          points={ps.map((p, i) => (p.intencao[id] !== undefined ? `${x(i)},${y(p.intencao[id])}` : '')).filter(Boolean).join(' ')} />
      ))}
      <text x="0" y={H + 12} fontSize="9" fill="#9fb5ae">{ps[0].data}</text>
      <text x={W} y={H + 12} fontSize="9" fill="#9fb5ae" textAnchor="end">{ps[ps.length - 1].data}</text>
    </svg>
  );
}

function Debate({ e }: { e: EstadoEleicao }) {
  const toast = useGame((g) => g.toast);
  const deb = e.debates.find((d) => !d.concluido);
  const [nota, setNota] = useState<string | null>(null);
  if (!deb) return null;
  const q = deb.perguntas.find((p) => p.respondida === undefined);
  const n = deb.perguntas.filter((p) => p.respondida !== undefined).length;
  const responder = async (i: number) => {
    const r = await comando({ kind: 'estado', acao: { tipo: 'debate', opcao: i } });
    setNota(r.msg ?? null);
    if (!r.ok) toast(r.msg ?? 'Erro', 'erro');
  };
  return (
    <div className="rounded-xl border-2 border-perigo/60 bg-perigo/5 p-4">
      <div className="flex justify-between items-center">
        <div className="text-[10px] uppercase tracking-[0.25em] text-perigo flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-perigo pulsar" /> Ao vivo · debate do {deb.turno}º turno</div>
        <div className="text-[11px] text-suave">pergunta {Math.min(4, n + 1)} de 4</div>
      </div>
      {nota && <div className="text-xs text-acento-2 mt-2">↳ {nota}</div>}
      {q && (
        <>
          <div className="text-xs text-suave mt-2">{q.quem}:</div>
          <div className="titulo text-lg leading-snug">{q.texto}</div>
          <div className="mt-2 space-y-1.5">
            {q.opcoes.map((o, i) => (
              <button key={i} onClick={() => responder(i)} className="w-full text-left rounded-lg border border-borda hover:border-acento hover:bg-acento/5 px-3 py-2 text-sm">{o.texto}</button>
            ))}
          </div>
        </>
      )}
      <p className="text-[10px] text-suave mt-2">Números que não batem com os dados do governo são desmentidos pela checagem ao vivo. Se não responder, o debate acontece com a cadeira vazia.</p>
    </div>
  );
}

/** Apuração com contagem progressiva e mapa que vai sendo pintado. */
function Apuracao({ e, r }: { e: EstadoEleicao; r: Resultado }) {
  const sigla = mundo.init!.sigla as SiglaUF;
  const [prog, setProg] = useState(0);
  useEffect(() => {
    setProg(0);
    const t0 = performance.now();
    let id = 0;
    const passo = () => { const p = Math.min(1, (performance.now() - t0) / 7000); setProg(p); if (p < 1) id = requestAnimationFrame(passo); };
    id = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(id);
  }, [r]);
  // ordem de chegada das urnas: municípios embaralhados (as capitais costumam demorar)
  const ordem = useMemo(() => r.municipios.map((m, i) => ({ m, k: ((Number(m.ibge) * 2654435761) >>> 0) / 4294967296 + (i === 0 ? 0.6 : 0) })).sort((a, b) => a.k - b.k).map((x) => x.m), [r]);
  const ate = Math.floor(prog * ordem.length);
  const parc = r.ids.map(() => 0);
  let val = 0, elei = 0;
  const cores: Record<string, string> = {}, forca: Record<string, number> = {};
  for (let i = 0; i < ate; i++) {
    const m = ordem[i];
    m.votos.forEach((v, k) => { parc[k] += v; });
    const s = m.votos.reduce((a, b) => a + b, 0);
    val += s;
    let k = 0;
    for (let j = 1; j < m.votos.length; j++) if (m.votos[j] > m.votos[k]) k = j;
    cores[m.ibge] = corCandidato(e, r.ids[k]);
    forca[m.ibge] = Math.min(1, (m.votos[k] / Math.max(1, s) - 0.25) * 2);
  }
  for (let i = 0; i < ate; i++) elei += ordem[i].votos.reduce((a, b) => a + b, 0) + ordem[i].brancosNulos + ordem[i].abstencao;
  const fim = prog >= 1;
  const ordemC = r.ids.map((_, i) => i).sort((a, b) => parc[b] - parc[a]);
  return (
    <div className="rounded-xl bg-white/[0.03] p-3">
      <div className="flex justify-between items-center">
        <div className="titulo text-lg">Apuração do {r.turno}º turno · {r.data}</div>
        {!fim && <button className="text-[11px] text-suave hover:text-white" onClick={() => setProg(1)}>Pular</button>}
      </div>
      <div className="text-[11px] text-suave">Seções apuradas: <span className="num text-texto">{pct((elei / r.eleitores) * 100)}</span> · abstenção {pct((r.abstencao / r.eleitores) * 100)} · brancos e nulos {pct((r.brancosNulos / Math.max(1, r.eleitores - r.abstencao)) * 100)}</div>
      <div className="grid md:grid-cols-[1fr_260px] gap-3 mt-2">
        <MapaMunicipios sigla={sigla} cores={cores} forca={forca} altura={300} />
        <div className="space-y-2">
          {ordemC.map((i) => {
            const c = e.candidatos.find((x) => x.id === r.ids[i])!;
            const v = val ? (parc[i] / val) * 100 : 0;
            return (
              <div key={c.id}>
                <div className="flex justify-between text-sm"><span className={c.doJogador ? 'font-semibold text-acento' : ''}>{c.origem === 'governador' ? 'Você' : c.urna}</span><span className="num">{pct(v)}</span></div>
                <div className="h-2 bg-white/8 rounded"><div className="h-full rounded transition-all" style={{ width: `${v}%`, background: corCandidato(e, c.id) }} /></div>
                <div className="text-[10px] text-suave num">{fmt.int(parc[i])} votos</div>
              </div>
            );
          })}
          {fim && (() => {
            const lider = e.candidatos.find((x) => x.id === r.ids[ordemC[0]])!;
            const p = (r.totais[ordemC[0]] / r.validos) * 100;
            const decidido = r.turno === 2 || p > 50;
            return <div className={`rounded-lg p-2 text-sm ${lider.doJogador ? 'bg-acento/15 text-acento' : 'bg-perigo/15 text-perigo'}`}>{decidido ? `${lider.origem === 'governador' ? 'Você foi reeleito(a)' : `${lider.urna} está eleito(a)`} com ${pct(p)} dos válidos.` : 'Ninguém passou de 50% dos válidos: haverá 2º turno.'}</div>;
          })()}
        </div>
      </div>
    </div>
  );
}

export function Eleicao({ s }: { s: EstadoSnapshot }) {
  const toast = useGame((g) => g.toast);
  const e = s.eleicao;
  const [ver, setVer] = useState<'campanha' | 'apuracao1' | 'apuracao2'>('campanha');
  const sigla = mundo.init!.sigla as SiglaUF;
  const acao = async (a: Parameters<typeof comando>[0]) => { const r = await comando(a); toast(r.msg ?? (r.ok ? 'Feito' : 'Não foi possível'), r.ok ? 'ok' : 'erro'); };
  const ultima = e?.pesquisas[e.pesquisas.length - 1];
  const mapa = useMemo(() => {
    if (!e) return { cores: {}, forca: {}, titulos: {} };
    const cores: Record<string, string> = {}, forca: Record<string, number> = {}, titulos: Record<string, string> = {};
    for (const [ibge, [id, sh]] of Object.entries(e.mapa)) {
      cores[ibge] = corCandidato(e, id);
      forca[ibge] = Math.min(1, (sh - 0.2) * 2);
      const c = e.candidatos.find((x) => x.id === id);
      titulos[ibge] = `${c?.origem === 'governador' ? 'Você' : c?.urna} lidera (${Math.round(sh * 100)}%)`;
    }
    return { cores, forca, titulos };
  }, [e]);
  useEffect(() => { if (e?.resultado2) setVer('apuracao2'); else if (e?.resultado1) setVer('apuracao1'); }, [e?.resultado1?.data, e?.resultado2?.data]);

  if (!e) {
    return (
      <div className="space-y-3 text-sm">
        <div className="rounded-xl bg-white/[0.03] p-4">
          <div className="titulo text-lg">Próxima eleição: outubro de {s.ano <= 2030 ? 2030 : 2034}</div>
          <p className="text-xs text-suave mt-1">1º turno no primeiro domingo de outubro, 2º turno no último. A pré-campanha começa em março do ano eleitoral; as convenções, em 20 de julho; a campanha, em 16 de agosto; o horário eleitoral, em 30 de agosto.</p>
          <p className="text-xs text-suave mt-1">{s.mandato >= 2 ? 'Você está no segundo mandato: não pode concorrer de novo, mas pode lançar um sucessor.' : 'Você pode disputar uma reeleição.'}</p>
        </div>
        {s.historicoEleicoes.map((h) => <div key={h.ano} className="text-xs">{h.ano}: {h.texto}</div>)}
      </div>
    );
  }
  const jog = e.candidatos.find((c) => c.doJogador)!;
  const ativos = e.candidatos.filter((c) => c.ativo);
  const conv = e.opcoesSucessor.length > 0 && (e.decisao === null || (e.decisao === 'sucessor' && jog.origem !== 'sucessor'));
  const t1 = primeiroTurno(e.ano), t2 = segundoTurno(e.ano);
  const vedado = s.mes >= 7 && s.mes <= 10 && e.fase !== 'apurado';
  const elimin = e.candidatos.filter((c) => !c.ativo);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div>
          <div className="titulo text-xl">Eleição {e.ano} · {FASE[e.fase]}</div>
          <div className="text-[11px] text-suave">1º turno em {t1}/10 · 2º turno em {t2}/10{vedado ? ' · condutas vedadas em vigor: sem convênios nem publicidade do governo' : ''}</div>
        </div>
        <div className="flex gap-1">
          {(['campanha', e.resultado1 ? 'apuracao1' : null, e.resultado2 ? 'apuracao2' : null].filter(Boolean) as ('campanha' | 'apuracao1' | 'apuracao2')[]).map((v) => (
            <button key={v} onClick={() => setVer(v)} className={`text-xs px-2.5 py-1 rounded-md border ${ver === v ? 'border-acento text-acento bg-acento/10' : 'border-borda text-suave'}`}>{v === 'campanha' ? 'Campanha' : v === 'apuracao1' ? 'Apuração 1º turno' : 'Apuração 2º turno'}</button>
          ))}
        </div>
      </div>

      <Debate e={e} />
      {ver === 'apuracao1' && e.resultado1 && <Apuracao e={e} r={e.resultado1} />}
      {ver === 'apuracao2' && e.resultado2 && <Apuracao e={e} r={e.resultado2} />}

      {ver === 'campanha' && (
        <>
          {conv && (
            <div className="rounded-xl border-2 border-acento-2/60 bg-acento-2/5 p-4">
              <div className="titulo text-lg">Convenção partidária</div>
              <p className="text-xs text-suave">Até 5 de agosto o partido registra a chapa. {s.mandato >= 2 ? 'A Constituição permite uma única reeleição: escolha quem vai defender o governo.' : 'Concorrer à reeleição ou lançar alguém do grupo?'}</p>
              <div className="grid md:grid-cols-2 gap-2 mt-2">
                {s.mandato < 2 && (
                  <button onClick={() => acao({ kind: 'estado', acao: { tipo: 'convencao', decisao: 'reeleicao' } })} className="text-left rounded-lg border border-acento p-3 hover:bg-acento/10">
                    <div className="font-semibold">Disputar a reeleição</div>
                    <div className="text-[11px] text-suave">Você na urna: o eleitor vai julgar o seu governo.</div>
                  </button>
                )}
                {e.opcoesSucessor.map((o, i) => (
                  <button key={o.nome} onClick={() => acao({ kind: 'estado', acao: { tipo: 'convencao', decisao: 'sucessor', sucessor: i } })} className="text-left rounded-lg border border-borda p-3 hover:bg-white/5">
                    <div className="font-semibold">Lançar {o.nome}</div>
                    <div className="text-[11px] text-suave">{o.perfil} · {PARTIDOS[o.partido].sigla} · carisma {o.carisma >= 0.6 ? 'alto' : o.carisma >= 0.45 ? 'médio' : 'baixo'}</div>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="grid md:grid-cols-3 gap-2">
            {[...e.candidatos].sort((a, b) => (ultima?.intencao[b.id] ?? 0) - (ultima?.intencao[a.id] ?? 0)).map((c) => (
              <CardCandidato key={c.id} c={c} e={e} intencao={ultima?.intencao[c.id]} rejeicao={ultima?.rejeicao[c.id]} />
            ))}
          </div>
          <div className="grid lg:grid-cols-[1fr_1fr] gap-3">
            <div className="rounded-xl bg-white/[0.03] p-3">
              <div className="flex justify-between text-xs text-suave mb-1"><span>Pesquisas ({ultima?.instituto ?? '—'}, margem ±{ultima?.margem ?? 0})</span><span>indecisos {Math.round(ultima?.indecisos ?? 0)}%</span></div>
              <GraficoPesquisas e={e} />
              {ultima?.segundo && e.fase !== 'segundoTurno' && (
                <div className="text-[11px] mt-1">Simulação de 2º turno: <b style={{ color: corCandidato(e, ultima.segundo.a) }}>{pct(ultima.segundo.pa)}</b> × <b style={{ color: corCandidato(e, ultima.segundo.b) }}>{pct(ultima.segundo.pb)}</b> ({e.candidatos.find((c) => c.id === ultima.segundo!.b)?.urna})</div>
              )}
            </div>
            <div className="rounded-xl bg-white/[0.03] p-3">
              <div className="flex justify-between text-xs text-suave mb-1">
                <span>Mapa: quem lidera em cada município {Object.keys(e.mapa).length ? '' : '(após a 1ª pesquisa)'}</span>
                {(e.fase === 'campanha' || e.fase === 'segundoTurno') && <span className="text-acento-2">{e.visitas} visita(s) nesta semana — clique num município</span>}
              </div>
              <MapaMunicipios sigla={sigla} cores={mapa.cores} forca={mapa.forca} titulos={mapa.titulos} altura={260}
                onClique={(e.fase === 'campanha' || e.fase === 'segundoTurno') && jog.ativo ? (ibge) => acao({ kind: 'estado', acao: { tipo: 'campanha-visita', ibge } }) : undefined} />
            </div>
          </div>
          {(e.fase === 'campanha' || e.fase === 'segundoTurno') && jog.ativo && (
            <div className="rounded-xl bg-white/[0.03] p-3">
              <div className="text-xs text-suave mb-2">Horário eleitoral gratuito — tema da semana (no ar de 30/8 até a antevéspera; quanto mais tempo de TV, maior o efeito)</div>
              <div className="grid md:grid-cols-4 gap-1.5">
                {(Object.keys(TEMAS) as Tema[]).map((t) => (
                  <button key={t} onClick={() => acao({ kind: 'estado', acao: { tipo: 'campanha-tema', tema: t } })} title={TEMAS[t].desc}
                    className={`text-left rounded-lg border px-2.5 py-1.5 ${e.tema === t ? 'border-acento bg-acento/10' : 'border-borda hover:bg-white/5'}`}>
                    <div className="text-xs font-semibold">{TEMAS[t].nome}</div>
                    <div className="text-[10px] text-suave">{TEMAS[t].desc}</div>
                  </button>
                ))}
              </div>
            </div>
          )}
          {e.fase === 'segundoTurno' && jog.ativo && elimin.length > 0 && (
            <div className="rounded-xl bg-white/[0.03] p-3">
              <div className="text-xs text-suave mb-2">Apoios no 2º turno (6 de capital político por conversa)</div>
              <div className="flex flex-wrap gap-2">
                {elimin.map((c) => {
                  const com = ativos.find((f) => f.apoios.includes(c.id));
                  return (
                    <div key={c.id} className="rounded-lg border border-borda px-2.5 py-1.5 text-xs flex items-center gap-2">
                      <span>{c.urna} <span className="text-suave">({PARTIDOS[c.partido].sigla})</span></span>
                      {com ? <span className={com.doJogador ? 'text-acento' : 'text-perigo'}>apoia {com.doJogador ? 'você' : com.urna}</span>
                        : <Botao onClick={() => acao({ kind: 'estado', acao: { tipo: 'apoio-2turno', candidato: c.id } })} desativado={s.pol.capital < 6}>Pedir apoio</Botao>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {e.log.length > 0 && (
            <div className="rounded-xl bg-white/[0.03] p-3">
              <div className="text-xs text-suave mb-1">Diário de campanha</div>
              {e.log.slice(0, 8).map((l, i) => <div key={i} className="text-[11px]"><span className="text-suave num">{l.data}</span> {l.texto}</div>)}
            </div>
          )}
        </>
      )}
      <p className="text-[10px] text-suave">Eleitorado real por município (TSE, perfil do eleitorado 2022) e malha do IBGE. Candidatos, partidos e institutos de pesquisa são fictícios. Ver SIMULATION.md, Parte VI.</p>
    </div>
  );
}
