/** Painéis do Planalto (Fase 9). Cada um lê a instância da Presidência e age via `usePres().acao`. */
import { useState } from 'react';
import { PARTIDOS, type IdPartido } from '../../sim/politica/dados';
import { MEDIDAS, MINISTERIOS, type TipoProposta } from '../../sim/presidente/dados';
import { COPOM, despesaTotal, type Programa } from '../../sim/presidente/economia';
import type { Presidencia } from '../../sim/presidente/presidencia';
import { usePres } from '../../sim/presidente/store';
import { Botao } from '../governo/comum';
import { Retrato } from '../governo/Retrato';
import { BarraPlacar, corRel, Hemiciclo, Kpi, Linha, num, pp, relTexto, rsBi, Secao } from './comum';
import { rotuloIdeologia } from './Setup';

const TIPO_NOME: Record<TipoProposta, string> = { MP: 'Medida provisória', PL: 'Projeto de lei', PLP: 'Lei complementar', PEC: 'Emenda constitucional' };
const TIPO_REGRA: Record<TipoProposta, string> = {
  MP: 'vale na hora; caduca em 120 dias sem votação; maioria simples',
  PL: 'maioria simples nas duas Casas',
  PLP: 'maioria absoluta (257 deputados, 41 senadores)',
  PEC: '3/5 em dois turnos em cada Casa (308 e 49)',
};

// ── Planalto ─────────────────────────────────────────────────────────────────────

export function PainelPlanalto({ p }: { p: Presidencia }) {
  const acao = usePres((s) => s.acao);
  const s = p.serie;
  return (
    <div>
      <div className="grid grid-cols-3 gap-2">
        <Kpi rotulo="Aprovação" valor={pp(p.aprovacao, 0)} cor={p.aprovacao >= 45 ? 'text-acento' : p.aprovacao >= 30 ? 'text-acento-2' : 'text-perigo'} sub={p.mandato === 2 ? '2º mandato' : 'ótimo + bom'} />
        <Kpi rotulo="Base na Câmara" valor={pp(p.base_() * 100, 0)} sub={`capital político ${Math.round(p.capital)}`} />
        <Kpi rotulo="Risco fiscal" valor={pp(p.eco.risco * 100, 0)} cor={p.eco.risco > 0.65 ? 'text-perigo' : p.eco.risco > 0.45 ? 'text-acento-2' : 'text-acento'} sub={`BC: credibilidade ${Math.round(p.eco.credibilidade * 100)}`} />
      </div>
      <Secao titulo="Aprovação mês a mês"><Linha valores={s.map((x) => x.aprovacao)} rotulos={[s[0]?.data ?? '', s[s.length - 1]?.data ?? '']} formato={(v) => pp(v, 0)} /></Secao>
      <Decisoes p={p} onDecidir={(uid, i) => acao((x) => x.decidir(uid, i))} />
      <Secao titulo="Notícias">
        <div className="flex flex-col gap-1.5">
          {p.noticias.slice(0, 25).map((n, i) => (
            <div key={i} className={`text-xs border-l-2 pl-2 ${n.tom === 'bom' ? 'border-acento' : n.tom === 'ruim' ? 'border-perigo' : n.tom === 'alerta' ? 'border-acento-2' : 'border-white/20'}`}>
              <span className="text-suave num">{n.data}</span> {n.texto}
            </div>
          ))}
        </div>
      </Secao>
    </div>
  );
}

export function Decisoes({ p, onDecidir }: { p: Presidencia; onDecidir: (uid: number, i: number) => void }) {
  if (!p.eventos.pendentes.length) return null;
  return (
    <Secao titulo={`Decisões (${p.eventos.pendentes.length})`}>
      {p.eventos.pendentes.map((d) => (
        <div key={d.uid} className="rounded-xl border border-acento-2/40 bg-acento-2/5 p-3 mb-2">
          <div className="text-[10px] uppercase text-acento-2">{d.categoria} · {Math.max(0, d.prazoDia - p.t)} dia(s) para decidir</div>
          <div className="font-semibold text-sm mt-0.5">{d.titulo}</div>
          <p className="text-xs text-texto/85 mt-1">{d.texto}</p>
          <div className="flex flex-col gap-1 mt-2">
            {d.escolhas.map((e) => (
              <button key={e.i} onClick={() => onDecidir(d.uid, e.i)} className="text-left text-xs rounded-lg px-2.5 py-1.5 bg-white/6 hover:bg-white/12">
                <b>{e.texto}</b>{e.i === d.padrao && <span className="text-suave"> (padrão)</span>}{e.detalhe && <div className="text-[10px] text-suave">{e.detalhe}</div>}
              </button>
            ))}
          </div>
        </div>
      ))}
    </Secao>
  );
}

// ── Economia ─────────────────────────────────────────────────────────────────────

export function PainelEconomia({ p }: { p: Presidencia }) {
  const e = p.eco, s = p.serie;
  const r = [s[0]?.data ?? '', s[s.length - 1]?.data ?? ''] as [string, string];
  const prox = COPOM.map(([m, d]) => ({ m, d })).find(({ m, d }) => m > p.mes || (m === p.mes && d > p.dia)) ?? { m: COPOM[0][0], d: COPOM[0][1] };
  return (
    <div>
      <div className="grid grid-cols-3 gap-2">
        <Kpi rotulo="PIB (12 meses)" valor={pp(e.crescimento)} cor={e.crescimento >= 2 ? 'text-acento' : e.crescimento >= 0 ? 'text-acento-2' : 'text-perigo'} sub={`hiato ${num(e.hiato)} p.p.`} />
        <Kpi rotulo="IPCA (12 meses)" valor={pp(e.inflacao)} cor={Math.abs(e.inflacao - e.metaInflacao) <= 1.5 ? 'text-acento' : 'text-perigo'} sub={`meta ${pp(e.metaInflacao)} ±1,5`} />
        <Kpi rotulo="Selic" valor={pp(e.selic, 2)} sub={`juro real ${pp(e.selic - e.expectativa)}`} />
        <Kpi rotulo="Dólar" valor={`R$ ${num(e.cambio, 2)}`} cor={e.cambio > e.cambio0 * 1.1 ? 'text-perigo' : ''} sub={`posse: R$ ${num(e.cambio0, 2)}`} />
        <Kpi rotulo="Desemprego" valor={pp(e.desemprego)} sub="PNAD Contínua" />
        <Kpi rotulo="Dívida bruta" valor={pp(e.divida)} cor={e.divida > 90 ? 'text-perigo' : ''} sub="do PIB (DBGG)" />
      </div>
      <p className="text-[11px] text-suave mt-2 leading-relaxed">
        Expectativa de inflação em 12 meses (Focus): <b className="text-texto">{pp(e.expectativa)}</b>. Próximo Copom: <b className="text-texto">{String(prox.d).padStart(2, '0')}/{String(prox.m).padStart(2, '0')}</b>.
        Juro alto segura a inflação e o dólar, mas esfria o PIB e encarece a dívida. Risco fiscal alto desvaloriza o real e desancora as expectativas.
      </p>
      <div className="grid grid-cols-2 gap-x-4">
        <Secao titulo="IPCA 12 meses"><Linha valores={s.map((x) => x.inflacao)} cor="#ff8a5b" faixa={[e.metaInflacao - 1.5, e.metaInflacao + 1.5]} rotulos={r} formato={(v) => pp(v)} /></Secao>
        <Secao titulo="Selic"><Linha valores={s.map((x) => x.selic)} cor="#9a7be0" rotulos={r} formato={(v) => pp(v, 2)} /></Secao>
        <Secao titulo="Dólar"><Linha valores={s.map((x) => x.cambio)} cor="#f5b942" rotulos={r} formato={(v) => `R$ ${num(v, 2)}`} /></Secao>
        <Secao titulo="Desemprego"><Linha valores={s.map((x) => x.desemprego)} cor="#4b8fe0" rotulos={r} formato={(v) => pp(v)} /></Secao>
        <Secao titulo="PIB (12 meses)"><Linha valores={s.map((x) => x.crescimento)} cor="#3ee0b0" rotulos={r} formato={(v) => pp(v)} /></Secao>
        <Secao titulo="Dívida bruta / PIB"><Linha valores={s.map((x) => x.divida)} cor="#ff6b5b" rotulos={r} formato={(v) => pp(v)} /></Secao>
      </div>
      <p className="text-[10px] text-suave mt-3">Ponto de partida: dados reais do Banco Central (SGS e Focus) de {p.init.macro.geradoEm.slice(0, 10).split('-').reverse().join('/')}.</p>
    </div>
  );
}

// ── Orçamento ────────────────────────────────────────────────────────────────────

export function PainelOrcamento({ p }: { p: Presidencia }) {
  const acao = usePres((s) => s.acao);
  const e = p.eco;
  const desp = despesaTotal(e);
  const meta = p.metaPorAno[p.ano] ?? 0;
  const progs = p.programas();
  const editavel = p.mes < 9;
  return (
    <div>
      <div className="grid grid-cols-3 gap-2">
        <Kpi rotulo="Receita líquida" valor={pp(e.receita)} sub={rsBi(e.receita, e.pib)} />
        <Kpi rotulo="Despesa primária" valor={pp(desp)} sub={`limite ${pp(p.limite)}`} cor={desp > p.limite ? 'text-perigo' : ''} />
        <Kpi rotulo={`Primário ${p.ano}`} valor={pp(e.primario, 2)} cor={e.primario >= meta - 0.25 ? 'text-acento' : 'text-perigo'} sub={`meta ${pp(meta, 2)} ± 0,25`} />
      </div>
      {p.gatilhos && <div className="mt-2 text-xs rounded-lg bg-perigo/10 border border-perigo/40 px-3 py-2 text-perigo">Gatilhos do arcabouço acionados (meta descumprida): sem aumento de despesas nem medidas que criem gasto novo.</div>}
      <Secao titulo="Contingenciamento" extra={<span className="text-[11px] text-suave num">{Math.round(p.contingenciamento * 100)}% das discricionárias</span>}>
        <input type="range" min={0} max={0.35} step={0.05} value={p.contingenciamento} onChange={(ev) => acao((x) => x.contingenciar(Number(ev.target.value)))} className="w-full" aria-label="Contingenciamento" />
        <p className="text-[10px] text-suave">Congela investimentos, custeio e emendas do ano corrente para cumprir a meta. Esfria o PIB e irrita o Congresso. Zera em janeiro.</p>
      </Secao>
      <Secao titulo={`Orçamento — executado ${p.ano} e proposta ${p.ano + 1}`} extra={<span className={`text-[11px] num ${p.ploaCabe() ? 'text-acento' : 'text-perigo'}`}>PLOA {pp(p.ploaTotal(), 2)} / limite {pp(p.limite, 2)}</span>}>
        <div className="flex flex-col gap-1.5">
          {progs.map((g) => (
            <div key={g.id} className="text-xs" title={g.dica}>
              <div className="flex justify-between"><span>{g.nome}{g.obrigatoria && <span className="text-suave"> · obrigatória</span>}</span><span className="num">{pp(g.executado, 2)} → <b>{pp(g.ploa, 2)}</b> <span className="text-suave">({rsBi(g.ploa, e.pib)})</span></span></div>
              {!g.obrigatoria && <input type="range" min={Math.max(0, (g.piso || 0) * 0.9)} max={Math.max(g.base * 1.8, 0.3)} step={0.01} value={g.ploa} disabled={!editavel} onChange={(ev) => acao((x) => x.setPloa(g.id as Programa, Number(ev.target.value)))} className="w-full" aria-label={g.nome} />}
            </div>
          ))}
        </div>
        <p className="text-[10px] text-suave mt-1.5">{editavel ? `A proposta do ano que vem (PLOA) vai ao Congresso em 31/08 e é votada em dezembro. Ela precisa caber no limite do arcabouço (LC 200/2023), que cresce 70% da receita real, entre 0,6% e 2,5% ao ano.` : `PLOA ${p.ano + 1} enviada; votação em dezembro.`}</p>
      </Secao>
    </div>
  );
}

// ── Congresso ────────────────────────────────────────────────────────────────────

export function PainelCongresso({ p }: { p: Presidencia }) {
  const acao = usePres((s) => s.acao);
  const [casa, setCasa] = useState<'camara' | 'senado'>('camara');
  const [modo, setModo] = useState<'partido' | 'relacao'>('relacao');
  const c = casa === 'camara' ? p.camara : p.senado;
  const pres = c.deputados.find((d) => d.id === c.presidenteALE)!;
  const tram = p.propostas.filter((x) => x.status === 'tramitando');
  return (
    <div>
      <div className="flex gap-2 items-center">
        {(['camara', 'senado'] as const).map((k) => <Botao key={k} tom={casa === k ? 'primario' : 'neutro'} onClick={() => setCasa(k)}>{k === 'camara' ? 'Câmara (513)' : 'Senado (81)'}</Botao>)}
        <span className="flex-1" />
        <button className="text-[11px] text-suave hover:text-white" onClick={() => setModo(modo === 'partido' ? 'relacao' : 'partido')}>cor: {modo === 'partido' ? 'partido' : 'relação'}</button>
      </div>
      <Hemiciclo deps={c.deputados} modo={modo} presidente={c.presidenteALE} />
      <div className="text-xs text-suave -mt-1">Presidente {casa === 'camara' ? 'da Câmara' : 'do Senado'}: <b className="text-texto">{pres.urna}</b> ({PARTIDOS[pres.partido].sigla}) · <span style={{ color: corRel(pres.relacao) }}>{relTexto(pres.relacao)}</span> · capital político <b className="text-texto num">{Math.round(p.capital)}</b></div>
      <div className="flex flex-wrap gap-1 mt-2">
        {(Object.keys(PARTIDOS) as IdPartido[]).map((k) => {
          const n = c.deputados.filter((d) => d.partido === k).length;
          if (!n) return null;
          return <span key={k} className="text-[10px] rounded px-1.5 py-0.5 bg-white/5" title={PARTIDOS[k].nome}><i className="inline-block w-2 h-2 rounded-full mr-1" style={{ background: PARTIDOS[k].cor }} />{PARTIDOS[k].sigla} {n} · {p.posturas[k] === 'base' ? 'base' : p.posturas[k] === 'oposicao' ? 'oposição' : 'indep.'}</span>;
        })}
      </div>

      <Secao titulo={`Em tramitação (${tram.length})`}>
        {tram.length === 0 && <div className="text-xs text-suave">Nada tramitando. Envie medidas abaixo.</div>}
        {tram.map((x) => {
          const pl = p.placarProposta(x);
          const total = (x.casa === 'camara' ? p.camara : p.senado).cadeiras;
          return (
            <div key={x.uid} className="rounded-xl bg-white/[0.04] border border-white/[0.06] p-3 mb-2">
              <div className="flex justify-between text-xs"><b>{x.tipo} · {x.titulo}</b><span className="text-suave">{x.casa === 'camara' ? 'Câmara' : 'Senado'}{x.tipo === 'PEC' ? ` · ${x.turno}º turno` : ''} · vota em {Math.max(0, x.votaEm - p.t)} d</span></div>
              {x.caducaEm !== undefined && <div className="text-[10px] text-acento-2">MP em vigor · caduca em {Math.max(0, x.caducaEm - p.t)} dias</div>}
              <div className="mt-1.5"><BarraPlacar p={pl} total={total} /></div>
              <div className="text-[11px] mt-1">Chance de aprovar: <b className={pl.chance > 0.6 ? 'text-acento' : pl.chance > 0.35 ? 'text-acento-2' : 'text-perigo'}>{Math.round(pl.chance * 100)}%</b></div>
              <div className="flex flex-wrap gap-1 mt-1.5">
                <Botao onClick={() => acao((q) => q.articular(x.uid, 'lideres'))} titulo="5 de capital político">Café com líderes</Botao>
                <Botao onClick={() => acao((q) => q.articular(x.uid, 'emendas'))} titulo="Gasta ~0,03% do PIB no mês">Liberar emendas</Botao>
                <Botao onClick={() => acao((q) => q.articular(x.uid, 'cargos'))} titulo="8 de capital; risco de escândalo">Cargos</Botao>
                {!x.urgencia && <Botao onClick={() => acao((q) => q.articular(x.uid, 'urgencia'))} titulo="6 de capital">Urgência</Botao>}
                <Botao tom="perigo" onClick={() => acao((q) => q.articular(x.uid, 'retirar'))}>Retirar</Botao>
              </div>
            </div>
          );
        })}
      </Secao>

      <Secao titulo="Enviar ao Congresso">
        <div className="flex flex-col gap-1.5">
          {MEDIDAS.map((m) => {
            const vigente = p.vigentes.some((v) => v.medida === m.id);
            const tramitando = tram.some((x) => x.medida === m.id);
            if (m.unica && vigente) return null;
            const efeitos = [
              m.receita ? `receita ${m.receita > 0 ? '+' : ''}${num(m.receita, 2)}% PIB` : '',
              m.despesa ? `despesa ${num(Object.values(m.despesa).reduce((a, b) => a + (b as number), 0), 2)}% PIB` : '',
              m.aprovacao ? `aprovação ${m.aprovacao > 0 ? '+' : ''}${m.aprovacao}` : '',
              m.credibilidade ? `credibilidade ${m.credibilidade > 0 ? '+' : ''}${Math.round(m.credibilidade * 100)}` : '',
              m.riscoSTF >= 0.3 ? 'risco no STF' : '',
            ].filter(Boolean).join(' · ');
            return (
              <div key={m.id} className="rounded-lg bg-white/[0.03] px-3 py-2 text-xs">
                <div className="flex justify-between gap-2"><b>{m.nome}</b>{vigente && <span className="text-acento text-[10px]">em vigor</span>}{tramitando && <span className="text-acento-2 text-[10px]">tramitando</span>}</div>
                <div className="text-suave text-[11px]">{m.descricao}</div>
                <div className="text-[10px] text-texto/70 mt-0.5">{efeitos}</div>
                {!tramitando && <div className="flex gap-1 mt-1">{m.tipos.map((t) => <Botao key={t} onClick={() => acao((q) => q.enviar(m.id, t))} titulo={TIPO_REGRA[t]}>{TIPO_NOME[t]}</Botao>)}</div>}
              </div>
            );
          })}
        </div>
      </Secao>

      <Secao titulo="Votações">
        {p.votacoes.slice(0, 15).map((v, i) => (
          <div key={i} className="text-xs flex justify-between gap-2 py-0.5 border-b border-white/5"><span><span className="text-suave num">{v.data}</span> {v.casa}: {v.titulo}</span><span className={`num ${v.aprovado ? 'text-acento' : 'text-perigo'}`}>{v.sim}×{v.nao}</span></div>
        ))}
      </Secao>
    </div>
  );
}

// ── STF ──────────────────────────────────────────────────────────────────────────

export function PainelSTF({ p }: { p: Presidencia }) {
  const acao = usePres((s) => s.acao);
  return (
    <div>
      <p className="text-xs text-suave">Onze ministros, aposentadoria compulsória aos 75 anos (EC 88/2015). A cada vaga, o Planalto indica e o Senado sabatina: são precisos 41 votos.</p>
      <div className="grid grid-cols-2 gap-2 mt-3">
        {[...p.stf].sort((a, b) => b.idade - a.idade).map((m) => (
          <div key={m.id} className="flex gap-2 items-center rounded-lg bg-white/[0.04] p-2">
            <Retrato semente={m.retrato} genero={m.genero} idade={m.idade} tamanho={38} />
            <div className="text-xs leading-tight">
              <b>{m.genero === 'f' ? 'Min.ª' : 'Min.'} {m.nome}</b>
              <div className="text-[10px] text-suave">{m.idade} anos · {rotuloIdeologia(m.ideologia)}{m.indicadoPorVoce ? ' · sua indicação' : ''}</div>
            </div>
          </div>
        ))}
      </div>
      {p.vagaSTF && (
        <Secao titulo="Vaga aberta — indicar ao Senado">
          {p.vagaSTF.candidatos.map((c, i) => (
            <div key={i} className="flex gap-2 items-center rounded-lg border border-acento-2/30 p-2 mb-1.5">
              <Retrato semente={c.retrato} genero={c.genero} idade={55} tamanho={40} />
              <div className="flex-1 text-xs"><b>{c.nome}</b> <span className="text-suave">· {c.perfil}</span><div className="text-[10px] text-suave">{c.desc}</div></div>
              <Botao tom="primario" onClick={() => acao((q) => q.indicarSTF(i))}>Indicar</Botao>
            </div>
          ))}
        </Secao>
      )}
      <Secao titulo="Ações contra medidas do governo">
        {p.acoes.length === 0 && <div className="text-xs text-suave">Nenhuma. Medidas com risco constitucional costumam ser questionadas pela oposição.</div>}
        {p.acoes.map((a) => {
          const m = MEDIDAS.find((x) => x.id === a.medida)!;
          const prob = p.stf.reduce((s, min) => s + p.pDerrubar(min, m.riscoSTF), 0);
          return (
            <div key={a.uid} className="text-xs py-1 border-b border-white/5">
              <b>{m.nome}</b> <span className="text-suave">· ação do {PARTIDOS[a.autor].sigla}{a.liminar ? ' · liminar suspendeu a lei' : ''}</span>
              <div className="text-[11px]">{a.status === 'pendente' ? <>Julgamento em {Math.max(0, a.julgaEm - p.t)} dias · votos esperados pela derrubada: <b className="num">{num(prob, 1)}</b> de 11</> : a.status === 'derrubada' ? <span className="text-perigo">Derrubada por {a.votos?.[0]} a {a.votos?.[1]}</span> : <span className="text-acento">Mantida por {a.votos?.[1]} a {a.votos?.[0]}</span>}</div>
            </div>
          );
        })}
      </Secao>
    </div>
  );
}

// ── Banco Central ────────────────────────────────────────────────────────────────

export function PainelBC({ p }: { p: Presidencia }) {
  const acao = usePres((s) => s.acao);
  const b = p.bc;
  return (
    <div>
      <div className="flex gap-3 items-center rounded-xl bg-white/[0.04] p-3">
        <Retrato semente={b.presidente.retrato} genero={b.presidente.genero} idade={58} tamanho={52} />
        <div className="text-xs">
          <div className="text-[10px] uppercase text-suave">Presidente do Banco Central</div>
          <b className="text-sm">{b.presidente.nome}</b>
          <div className="text-suave">{b.presidente.indicadoPorVoce ? `Sua indicação (${b.presidente.perfil})` : b.presidente.desc}</div>
          <div className="text-suave">Mandato até 31/12/{b.mandatoAte} · autonomia pela LC 179/2021</div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 mt-3">
        <Kpi rotulo="Selic" valor={pp(p.eco.selic, 2)} />
        <Kpi rotulo="Credibilidade" valor={Math.round(p.eco.credibilidade * 100)} cor={p.eco.credibilidade > 0.65 ? 'text-acento' : 'text-acento-2'} sub="ancora as expectativas" />
        <Kpi rotulo="Meta (CMN)" valor={pp(p.eco.metaInflacao)} sub="contínua, ±1,5 p.p." />
      </div>
      {b.indicacao && (
        <Secao titulo="Indicar o novo presidente do BC">
          {b.indicacao.map((c, i) => (
            <div key={i} className="flex gap-2 items-center rounded-lg border border-acento-2/30 p-2 mb-1.5">
              <Retrato semente={c.retrato} genero={c.genero} idade={55} tamanho={40} />
              <div className="flex-1 text-xs"><b>{c.nome}</b> <span className="text-suave">· {c.perfil}</span><div className="text-[10px] text-suave">{c.desc}</div></div>
              <Botao tom="primario" onClick={() => acao((q) => q.indicarBC(i))}>Indicar</Botao>
            </div>
          ))}
        </Secao>
      )}
      <Secao titulo="O que o Planalto pode fazer">
        <div className="flex flex-col gap-1.5 text-xs">
          <div className="flex items-center gap-2"><Botao onClick={() => acao((q) => q.criticarBC())}>Criticar a Selic em público</Botao><span className="text-suave text-[11px]">Agrada a base; tira credibilidade e sobe o dólar.</span></div>
          <div className="flex items-center gap-2"><Botao onClick={() => acao((q) => q.swapCambial())}>Pedir swap cambial</Botao><span className="text-suave text-[11px]">Só quando o dólar dispara.</span></div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-suave">Meta de inflação (CMN):</span>
            {[3, 3.5, 4].map((m) => <Botao key={m} tom={p.eco.metaInflacao === m ? 'primario' : 'neutro'} onClick={() => acao((q) => q.mudarMetaInflacao(m))}>{pp(m)}</Botao>)}
          </div>
        </div>
      </Secao>
      <Secao titulo="Decisões do Copom">
        {b.decisoes.length === 0 && <div className="text-xs text-suave">Primeira reunião no fim de janeiro.</div>}
        {b.decisoes.map((d, i) => (
          <div key={i} className="text-xs flex justify-between py-0.5 border-b border-white/5"><span className="num text-suave">{d.data}</span><span className="num">{pp(d.selic, 2)} <span className={d.mudanca > 0 ? 'text-perigo' : d.mudanca < 0 ? 'text-acento' : 'text-suave'}>{d.mudanca === 0 ? 'manteve' : `${d.mudanca > 0 ? '+' : ''}${Math.round(d.mudanca * 100)} p.b.`}</span></span></div>
        ))}
      </Secao>
    </div>
  );
}

// ── Ministérios ──────────────────────────────────────────────────────────────────

export function PainelMinisterios({ p }: { p: Presidencia }) {
  const acao = usePres((s) => s.acao);
  return (
    <div>
      <p className="text-xs text-suave">Ceder um ministério a um partido traz a bancada para a base (e o fisiologismo junto). Técnicos são mais competentes — e a Fazenda técnica dá credibilidade.</p>
      <div className="flex flex-col gap-1.5 mt-3">
        {MINISTERIOS.map((m) => {
          const t = p.ministros[m.id];
          return (
            <div key={m.id} className="flex gap-2 items-center rounded-lg bg-white/[0.04] p-2">
              <Retrato semente={t.retrato} genero={t.genero} idade={55} tamanho={36} />
              <div className="flex-1 text-xs leading-tight">
                <div className="text-[10px] uppercase text-suave">{m.nome}</div>
                <b>{t.nome}</b> <span className="text-suave">· {t.partido ? `cota do ${PARTIDOS[t.partido].sigla}` : 'técnico(a)'} · competência {Math.round(t.competencia * 100)}</span>
              </div>
              <select aria-label={`Trocar titular de ${m.nome}`} className="bg-white/5 border border-borda rounded text-xs px-1 py-1" value="" onChange={(ev) => { const v = ev.target.value; if (v) acao((q) => q.nomearMinistro(m.id, v === 'tecnico' ? null : (v as IdPartido))); }}>
                <option value="">trocar…</option>
                <option value="tecnico">nome técnico</option>
                {(Object.keys(PARTIDOS) as IdPartido[]).map((k) => <option key={k} value={k}>cota {PARTIDOS[k].sigla} ({p.posturas[k]})</option>)}
              </select>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Estados ──────────────────────────────────────────────────────────────────────

export function PainelEstados({ p }: { p: Presidencia }) {
  const acao = usePres((s) => s.acao);
  const ufs = [...p.init.ufs].sort((a, b) => (p.init.macro.eleitorado[b.sigla] ?? 0) - (p.init.macro.eleitorado[a.sigla] ?? 0));
  return (
    <div>
      <p className="text-xs text-suave">Até 3 viagens por mês. Uma obra federal por estado por ano. Clique num estado no mapa para ver detalhes.</p>
      <table className="w-full text-xs mt-2">
        <thead><tr className="text-[10px] text-suave text-left"><th>UF</th><th>Aprov.</th><th>Governador(a)</th><th /></tr></thead>
        <tbody>
          {ufs.map((u) => {
            const g = p.governadores.find((x) => x.uf === u.sigla)!;
            return (
              <tr key={u.sigla} className="border-b border-white/5">
                <td className="py-1"><b>{u.sigla}</b></td>
                <td className="num">{Math.round(p.aprovUF[u.sigla])}%</td>
                <td className="truncate max-w-[150px]"><span style={{ color: corRel(g.relacao) }}>●</span> {g.nome} <span className="text-suave">({PARTIDOS[g.partido].sigla})</span></td>
                <td className="text-right whitespace-nowrap"><button className="text-acento hover:underline mr-2" onClick={() => acao((q) => q.visitar(u.sigla))}>visitar</button><button className="text-acento-2 hover:underline" onClick={() => acao((q) => q.obraFederal(u.sigla))}>obra</button></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Eleição ──────────────────────────────────────────────────────────────────────

export function PainelEleicao({ p }: { p: Presidencia }) {
  const el = p.eleicao;
  if (!el) return <div className="text-sm text-suave">A próxima eleição presidencial é em outubro de {p.init.anoInicio + (p.mandato === 1 ? 3 : 7)}. A pré-campanha começa em março.</div>;
  const ult = el.pesquisas[0];
  const fmtC = (id: number) => { const c = el.candidatos[id]; return `${c.nome} (${PARTIDOS[c.partido].sigla})`; };
  return (
    <div>
      <div className="text-xs text-suave">1º turno em {String(el.dia1 || '?').padStart(2, '0')}/10 · 2º turno no último domingo de outubro · posse em 5 de janeiro (EC 111/2021). Durante a campanha, cada viagem a um estado vale votos lá.</div>
      <Secao titulo={ult ? `Pesquisa ${'Instituto Pulso'} — ${ult.data}` : 'Candidatos'}>
        {el.candidatos.map((c) => (
          <div key={c.id} className={`flex items-center gap-2 py-1 ${c.ativo ? '' : 'opacity-40'}`}>
            <Retrato semente={c.retrato} genero={c.genero} idade={58} tamanho={34} />
            <div className="flex-1 text-xs"><b>{c.nome}</b> <span className="text-suave">· {PARTIDOS[c.partido].sigla} · {rotuloIdeologia(c.ideologia)}{c.doJogador ? (p.mandato === 1 ? ' · você' : c.genero === 'f' ? ' · sua sucessora' : ' · seu sucessor') : ''}</span></div>
            {ult && <span className="num text-sm">{pp((ult.v[c.id] ?? 0) * 100, 0)}</span>}
          </div>
        ))}
      </Secao>
      {el.primeiro && <Secao titulo="Resultado do 1º turno">{el.candidatos.map((c) => <div key={c.id} className="text-xs flex justify-between"><span>{fmtC(c.id)}</span><span className="num">{pp(el.primeiro!.total[c.id] * 100)}</span></div>)}</Secao>}
      {el.segundo && <Secao titulo="Resultado do 2º turno">{el.segundo.ids.map((id, i) => <div key={id} className="text-xs flex justify-between"><span>{fmtC(id)}</span><span className="num">{pp(el.segundo!.total[i] * 100)}</span></div>)}</Secao>}
      {el.vencedor !== undefined && <div className={`mt-3 rounded-xl p-3 text-sm ${el.candidatos[el.vencedor].doJogador ? 'bg-acento/10 text-acento' : 'bg-perigo/10 text-perigo'}`}>Eleito(a): <b>{fmtC(el.vencedor)}</b>. Posse em 5 de janeiro.</div>}
    </div>
  );
}
