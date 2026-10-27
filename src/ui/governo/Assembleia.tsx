/**
 * Aba Assembleia (Fase 5): hemiciclo da ALE, pauta com placar previsto, negociação voto a voto
 * (cartas), bancadas, partidos, presidente da Casa e histórico de votações.
 */
import { useMemo, useState } from 'react';
import { fmt } from '../../app/store';
import { comando, useGame } from '../../sim/bridge';
import { BANCADAS, CARGOS, PARTIDOS, type Cargo, type IdBancada, type IdPartido } from '../../sim/politica/dados';
import { CARTAS, chaveCarta, custoCarta, placar, type Carta, type Deputado, type Intencao, type Projeto } from '../../sim/politica/politica';
import type { EstadoSnapshot } from '../../sim/estado/tipos';
import { Botao } from './comum';
import { Retrato } from './Retrato';

type Modo = 'intencao' | 'partido' | 'relacao';
const COR_INT: Record<Intencao, string> = { sim: '#3ee0b0', nao: '#ff6b5b', indeciso: '#f5b942' };
const QUORUM = { simples: 'maioria simples', '3/5': '3/5 da Casa', '2/3': '2/3 da Casa', '1/3': '1/3 (assinaturas)' };
const relTexto = (r: number) => (r > 0.5 ? 'aliado fiel' : r > 0.15 ? 'governista' : r > -0.15 ? 'independente' : r > -0.5 ? 'crítico' : 'opositor ferrenho');
const corRel = (r: number) => (r > 0.15 ? '#3ee0b0' : r > -0.15 ? '#f5b942' : '#ff6b5b');

/** Cadeiras em arcos concêntricos, ordenadas da esquerda para a direita. */
function assentos(n: number): { x: number; y: number }[] {
  const filas = n <= 30 ? 3 : n <= 50 ? 4 : n <= 75 ? 5 : 6;
  const r0 = 70, r1 = 150;
  const raios = Array.from({ length: filas }, (_, i) => r0 + ((r1 - r0) * i) / Math.max(1, filas - 1));
  const somaR = raios.reduce((a, b) => a + b, 0);
  const porFila = raios.map((r) => Math.round((n * r) / somaR));
  porFila[filas - 1] += n - porFila.reduce((a, b) => a + b, 0);
  const pts: { x: number; y: number; ang: number }[] = [];
  raios.forEach((r, i) => {
    const k = porFila[i];
    for (let j = 0; j < k; j++) {
      const ang = Math.PI - (Math.PI * (j + 0.5)) / k;
      pts.push({ x: 170 + r * Math.cos(ang), y: 165 - r * Math.sin(ang), ang });
    }
  });
  return pts.sort((a, b) => b.ang - a.ang);
}

function Hemiciclo({ deps, modo, intencoes, selecionado, presidente, onSel }: { deps: Deputado[]; modo: Modo; intencoes: Record<number, Intencao> | null; selecionado: number; presidente: number; onSel: (id: number) => void }) {
  const pos = useMemo(() => assentos(deps.length), [deps.length]);
  const ordem = useMemo(() => [...deps].sort((a, b) => a.ideologia - b.ideologia), [deps]);
  const raio = deps.length > 70 ? 5.4 : deps.length > 40 ? 6.4 : 8;
  return (
    <svg viewBox="0 0 340 175" className="w-full max-w-[520px] mx-auto">
      {ordem.map((d, i) => {
        const p = pos[i];
        const fill = modo === 'partido' ? PARTIDOS[d.partido].cor : modo === 'relacao' ? corRel(d.relacao) : intencoes ? COR_INT[intencoes[d.id]] : PARTIDOS[d.partido].cor;
        return (
          <g key={d.id} onClick={() => onSel(d.id)} className="cursor-pointer">
            <circle cx={p.x} cy={p.y} r={raio} fill={fill} stroke={d.id === selecionado ? '#ffffff' : d.id === presidente ? '#f5b942' : '#0b1513'} strokeWidth={d.id === selecionado ? 2.2 : d.id === presidente ? 1.8 : 0.8} />
            <title>{`${d.urna} (${PARTIDOS[d.partido].sigla}) — ${BANCADAS[d.bancada].nome}`}</title>
          </g>
        );
      })}
      <text x="170" y="160" textAnchor="middle" fontSize="11" fill="#9fb5ae">{deps.length} cadeiras</text>
    </svg>
  );
}

function BarraPlacar({ p, total }: { p: ReturnType<typeof placar>; total: number }) {
  const w = (v: number) => `${(v / total) * 100}%`;
  return (
    <div className="relative h-3 rounded overflow-hidden flex bg-white/5">
      <div style={{ width: w(p.aFavor), background: '#3ee0b0' }} />
      <div style={{ width: w(p.indecisos), background: '#f5b942' }} />
      <div style={{ width: w(p.contra), background: '#ff6b5b' }} />
      <div className="absolute top-0 bottom-0 w-0.5 bg-white" style={{ left: w(p.necessarios) }} title={`necessários: ${p.necessarios}`} />
    </div>
  );
}

function FichaDeputado({ d, s, projeto, intencao }: { d: Deputado; s: EstadoSnapshot; projeto: Projeto | null; intencao: Intencao | null }) {
  const toast = useGame((g) => g.toast);
  const pol = s.pol;
  const escala = Math.min(3, Math.max(0.4, s.rcl12 / 40e9));
  const usar = async (c: Carta) => {
    const r = await comando({ kind: 'estado', acao: { tipo: 'negociar', deputado: d.id, carta: c, projeto: projeto?.id ?? null } });
    toast(r.msg ?? (r.ok ? 'Feito' : 'Não deu'), r.ok ? 'ok' : 'erro');
  };
  const pt = PARTIDOS[d.partido];
  return (
    <div className="rounded-xl border border-borda bg-white/[0.03] p-3">
      <div className="flex gap-3">
        <Retrato semente={d.retrato} genero={d.genero} idade={d.idade} cor={pt.cor} tamanho={64} titulo={d.urna} />
        <div className="min-w-0">
          <div className="text-base font-semibold leading-tight">{d.urna}{d.id === pol.presidenteALE && <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded bg-acento-2/20 text-acento-2 align-middle">Presidente da ALE</span>}</div>
          <div className="text-[11px] text-suave">{d.nome} · {d.idade} anos · {d.mandatos}º mandato</div>
          <div className="text-[11px]"><span style={{ color: pt.cor }}>{pt.sigla}</span> · {BANCADAS[d.bancada].nome} · reduto: {d.cidade}</div>
        </div>
      </div>
      <div className="text-xs italic text-texto/80 mt-2">“{d.bordao}”</div>
      <div className="grid grid-cols-2 gap-2 mt-2 text-[11px]">
        <div>
          <div className="flex justify-between"><span className="text-suave">Relação com o governo</span><span style={{ color: corRel(d.relacao) }}>{relTexto(d.relacao)}</span></div>
          <div className="h-1.5 bg-white/8 rounded relative"><div className="absolute top-0 bottom-0 rounded" style={{ left: d.relacao >= 0 ? '50%' : `${50 + d.relacao * 50}%`, width: `${Math.abs(d.relacao) * 50}%`, background: corRel(d.relacao) }} /></div>
        </div>
        <div className="text-suave">
          {d.influencia > 0.8 ? 'Liderança · ' : ''}{d.fisiologismo > 0.65 ? 'pragmático(a)' : d.fisiologismo < 0.3 ? 'ideológico(a)' : 'negocia caso a caso'}
          {projeto && intencao && <div>Na votação: <b style={{ color: COR_INT[intencao] }}>{intencao === 'sim' ? (projeto.governoQuer === 'sim' ? 'a favor' : 'assina/vota a favor') : intencao === 'nao' ? 'contra' : 'indeciso(a)'}</b></div>}
        </div>
      </div>
      <div className="text-[10px] uppercase tracking-wider text-suave mt-3 mb-1">Negociar {projeto ? `(${projeto.titulo})` : '(cartas gerais)'}</div>
      <div className="grid grid-cols-2 gap-1.5">
        {(Object.keys(CARTAS) as Carta[]).map((c) => {
          const def = CARTAS[c];
          const usada = d.cartas.includes(chaveCarta(c, projeto?.id ?? null, s.ano));
          const semProjeto = def.porProjeto && !projeto;
          const custo = custoCarta(d, c, escala);
          const off = usada || semProjeto || pol.capital < def.capital;
          return (
            <button key={c} disabled={off} onClick={() => usar(c)} title={def.desc}
              className={`text-left rounded-lg border px-2 py-1.5 text-[11px] ${off ? 'border-borda opacity-40 cursor-not-allowed' : 'border-borda hover:border-acento hover:bg-acento/5'}`}>
              <div className="font-semibold text-xs">{def.nome}</div>
              <div className="text-suave">{usada ? 'já usada' : semProjeto ? 'escolha uma votação' : [custo ? fmt.reais(custo) : '', def.capital ? `${def.capital} de capital` : ''].filter(Boolean).join(' · ') || 'sem custo'}</div>
            </button>
          );
        })}
      </div>
      {d.promessas.length > 0 && <div className="text-[10px] text-suave mt-2">Promessas: {d.promessas.map((p) => (p.tipo === 'obra' ? `obra em ${d.cidade}${p.resolvida ? ' (resolvida)' : ''}` : 'apoio eleitoral')).join(' · ')}</div>}
    </div>
  );
}

export function Assembleia({ s }: { s: EstadoSnapshot }) {
  const toast = useGame((g) => g.toast);
  const pol = s.pol;
  const [projId, setProjId] = useState<string | null>(pol.pauta[0]?.id ?? null);
  const projeto = pol.pauta.find((p) => p.id === projId) ?? pol.pauta[0] ?? null;
  const [modo, setModo] = useState<Modo>('intencao');
  const [sel, setSel] = useState(-1);
  const [cederPartido, setCederPartido] = useState<IdPartido | ''>('');
  const [cederCargo, setCederCargo] = useState<Cargo>('cultura');
  const placares = useMemo(() => Object.fromEntries(pol.pauta.map((p) => [p.id, placar(pol, p, { aprovacao: s.aprovacao })])), [pol, s.aprovacao]);
  const pl = projeto ? placares[projeto.id] : null;
  const dep = pol.deputados.find((d) => d.id === sel) ?? null;
  const pres = pol.deputados.find((d) => d.id === pol.presidenteALE)!;
  const escala = Math.min(3, Math.max(0.4, s.rcl12 / 40e9));

  const bancadas = (Object.keys(BANCADAS) as IdBancada[]).map((b) => {
    const ds = pol.deputados.filter((d) => d.bancada === b);
    return { b, n: ds.length, rel: ds.reduce((a, d) => a + d.relacao, 0) / Math.max(1, ds.length), emenda: ds.filter((d) => !d.cartas.includes(chaveCarta('emenda', null, s.ano))).reduce((a, d) => a + custoCarta(d, 'emenda', escala), 0), sim: pl ? ds.filter((d) => pl.intencoes[d.id] === 'sim').length : 0 };
  }).filter((x) => x.n > 0);
  const partidos = (Object.keys(PARTIDOS) as IdPartido[]).map((p) => ({ p, n: pol.deputados.filter((d) => d.partido === p).length, pastas: Object.values(pol.secretarios).filter((x) => x.partido === p).length })).filter((x) => x.n > 0).sort((a, b) => b.n - a.n);
  const acaoBancada = async (bancada: IdBancada, carta: 'emenda' | 'cargo') => {
    const r = await comando({ kind: 'estado', acao: { tipo: 'negociar-bancada', bancada, carta } });
    toast(r.msg ?? (r.ok ? 'Feito' : 'Não deu'), r.ok ? 'ok' : 'erro');
  };
  const ceder = async () => {
    if (!cederPartido) return;
    const r = await comando({ kind: 'estado', acao: { tipo: 'ceder-secretaria', partido: cederPartido, cargo: cederCargo } });
    toast(r.msg ?? (r.ok ? 'Feito' : 'Não deu'), r.ok ? 'ok' : 'erro');
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <div className="rounded-xl bg-white/[0.03] p-3"><div className="text-[11px] text-suave">Capital político</div><div className="num text-xl">{Math.round(pol.capital)}<span className="text-xs text-suave">/100</span></div></div>
        <div className="rounded-xl bg-white/[0.03] p-3"><div className="text-[11px] text-suave">Base aliada</div><div className="num text-xl">{Math.round(s.baseAliada * pol.cadeiras)}<span className="text-xs text-suave"> de {pol.cadeiras}</span></div></div>
        <div className="rounded-xl bg-white/[0.03] p-3 col-span-2 flex gap-2 items-center cursor-pointer" onClick={() => setSel(pres.id)}>
          <Retrato semente={pres.retrato} genero={pres.genero} idade={pres.idade} cor={PARTIDOS[pres.partido].cor} tamanho={44} />
          <div>
            <div className="text-[11px] text-suave">Presidente da ALE — controla a pauta, engaveta CPIs e pedidos de impeachment</div>
            <div className="text-sm font-semibold">{pres.urna} <span className="text-xs" style={{ color: PARTIDOS[pres.partido].cor }}>{PARTIDOS[pres.partido].sigla}</span> · <span style={{ color: corRel(pres.relacao) }}>{relTexto(pres.relacao)}</span></div>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-[1fr_360px] gap-4">
        <div className="space-y-3">
          <div className="rounded-xl bg-white/[0.03] p-3">
            <div className="flex flex-wrap justify-between gap-2 items-center">
              <div className="text-xs text-suave">Plenário</div>
              <div className="flex gap-1">
                {([['intencao', 'Intenção de voto'], ['partido', 'Partidos'], ['relacao', 'Relação']] as [Modo, string][]).map(([m, n]) => (
                  <button key={m} onClick={() => setModo(m)} className={`text-[11px] px-2 py-1 rounded-md border ${modo === m ? 'border-acento text-acento bg-acento/10' : 'border-borda text-suave'}`}>{n}</button>
                ))}
              </div>
            </div>
            <Hemiciclo deps={pol.deputados} modo={modo} intencoes={pl?.intencoes ?? null} selecionado={sel} presidente={pol.presidenteALE} onSel={setSel} />
            <div className="flex flex-wrap gap-3 justify-center text-[10px] text-suave">
              {modo === 'partido'
                ? partidos.map(({ p, n }) => <span key={p} className="flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: PARTIDOS[p].cor }} />{PARTIDOS[p].sigla} {n}</span>)
                : modo === 'relacao' ? [['#3ee0b0', 'governistas'], ['#f5b942', 'independentes'], ['#ff6b5b', 'oposição']].map(([c, n]) => <span key={n} className="flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: c }} />{n}</span>)
                  : pl ? [['#3ee0b0', 'a favor'], ['#f5b942', 'indecisos'], ['#ff6b5b', 'contra']].map(([c, n]) => <span key={n} className="flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: c }} />{n}</span>) : <span>Sem votação selecionada: cores por partido.</span>}
            </div>
          </div>

          <div className="rounded-xl bg-white/[0.03] p-3">
            <div className="text-xs text-suave mb-2">Pauta</div>
            {pol.pauta.length === 0 && <div className="text-sm text-suave">Nada em votação. A LOA entra em agosto; PEC da Previdência e empréstimos são enviados pelo Palácio.</div>}
            <div className="space-y-2">
              {pol.pauta.map((p) => {
                const x = placares[p.id];
                return (
                  <button key={p.id} onClick={() => setProjId(p.id)} className={`w-full text-left rounded-lg border p-2.5 ${projeto?.id === p.id ? 'border-acento bg-acento/5' : 'border-borda hover:bg-white/5'}`}>
                    <div className="flex justify-between gap-2 text-sm"><span className="font-semibold">{p.titulo}</span><span className={`num ${x.chanceGoverno >= 0.5 ? 'text-acento' : 'text-perigo'}`}>{Math.round(x.chanceGoverno * 100)}% para o governo</span></div>
                    <div className="text-[11px] text-suave mb-1">{QUORUM[p.quorum]} · votação {p.dataVotacao || 'no próximo mês'} · {p.governoQuer === 'sim' ? 'o governo quer aprovar' : 'o governo quer barrar'}</div>
                    <BarraPlacar p={x} total={pol.cadeiras} />
                    <div className="text-[10px] text-suave mt-1">{x.aFavor} a favor · {x.indecisos} indecisos · {x.contra} contra · precisa de {x.necessarios}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-xl bg-white/[0.03] p-3 overflow-x-auto">
            <div className="text-xs text-suave mb-2">Bancadas</div>
            <table className="w-full text-xs">
              <thead><tr className="text-[10px] uppercase text-suave text-left"><th className="py-1">Bancada</th><th>Cadeiras</th><th>Humor</th>{pl && <th>A favor</th>}<th /></tr></thead>
              <tbody>
                {bancadas.map(({ b, n, rel, emenda, sim }) => (
                  <tr key={b} className="border-t border-white/5">
                    <td className="py-1.5"><span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ background: BANCADAS[b].cor }} />{BANCADAS[b].nome}</td>
                    <td className="num">{n}</td>
                    <td style={{ color: corRel(rel) }}>{relTexto(rel)}</td>
                    {pl && <td className="num">{sim}/{n}</td>}
                    <td className="text-right whitespace-nowrap">
                      <button onClick={() => acaoBancada(b, 'emenda')} disabled={!emenda} className="text-[10px] px-1.5 py-0.5 rounded bg-white/6 hover:bg-white/12 disabled:opacity-30 mr-1" title="Emenda para todos os deputados da bancada que ainda não receberam este ano">Emendas {emenda ? fmt.reais(emenda) : '—'}</button>
                      <button onClick={() => acaoBancada(b, 'cargo')} className="text-[10px] px-1.5 py-0.5 rounded bg-white/6 hover:bg-white/12" title="Cargos de 2º escalão para a bancada (2 de capital cada; aumenta o risco de escândalo)">Cargos</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-3">
          {dep ? <FichaDeputado d={dep} s={s} projeto={projeto} intencao={pl?.intencoes[dep.id] ?? null} /> : (
            <div className="rounded-xl border border-dashed border-borda p-4 text-sm text-suave">Clique numa cadeira do plenário para ver o deputado e negociar.</div>
          )}
          <div className="rounded-xl bg-white/[0.03] p-3">
            <div className="text-xs text-suave mb-1">Partidos</div>
            {partidos.map(({ p, n, pastas }) => (
              <div key={p} className="flex justify-between text-xs py-0.5">
                <span><span style={{ color: PARTIDOS[p].cor }}>■</span> {PARTIDOS[p].sigla} <span className="text-suave">{PARTIDOS[p].nome}</span></span>
                <span className="text-suave">{n} · {pol.posturas[p]}{pastas ? ` · ${pastas} pasta${pastas > 1 ? 's' : ''}` : ''}</span>
              </div>
            ))}
            <div className="mt-2 pt-2 border-t border-white/5">
              <div className="text-[11px] text-suave mb-1">Ceder uma secretaria (5 de capital): o partido inteiro se aproxima, a pasta perde qualidade técnica.</div>
              <div className="flex gap-1.5 flex-wrap">
                <select value={cederPartido} onChange={(e) => setCederPartido(e.target.value as IdPartido)} className="bg-black/40 border border-borda rounded px-1.5 py-1 text-xs">
                  <option value="">partido…</option>
                  {partidos.map(({ p }) => <option key={p} value={p}>{PARTIDOS[p].sigla}</option>)}
                </select>
                <select value={cederCargo} onChange={(e) => setCederCargo(e.target.value as Cargo)} className="bg-black/40 border border-borda rounded px-1.5 py-1 text-xs">
                  {CARGOS.filter((c) => c.id !== 'casaCivil').map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
                <Botao desativado={!cederPartido || pol.capital < 5} onClick={ceder}>Ceder</Botao>
              </div>
            </div>
          </div>
          <div className="rounded-xl bg-white/[0.03] p-3">
            <div className="text-xs text-suave mb-1">Votações</div>
            {pol.votacoes.length === 0 && <div className="text-xs text-suave">Nenhuma votação ainda.</div>}
            {pol.votacoes.slice(0, 8).map((v, i) => (
              <div key={i} className="text-xs py-0.5 flex justify-between gap-2">
                <span className="truncate">{v.titulo}</span>
                <span className={v.governoVenceu ? 'text-acento' : 'text-perigo'}>{v.aprovado ? 'aprovado' : 'rejeitado'} {v.sim}×{v.nao} · {v.data}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <p className="text-[10px] text-suave">Partidos, bancadas e deputados são fictícios; o número de cadeiras segue a regra real (CF, art. 27). Quóruns: LOA e empréstimos por maioria simples, PEC por 3/5, CPI com 1/3 de assinaturas, impeachment por 2/3.</p>
    </div>
  );
}
