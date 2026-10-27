/** Painéis da Fase 4 na Visão Cidade: transporte, segurança/território, habitação e favela selecionada. */
import { useState } from 'react';
import { fmt } from '../../app/store';
import { comando, concluirLinha, useGame } from '../../sim/bridge';
import { GRUPOS, type PoliticaVans } from '../../sim/city/territorio';
import { TIPOS_LINHA } from '../../sim/city/transporte';
import type { Stats } from '../../sim/protocol';
import type { DoutrinaSeguranca } from '../../sim/estado/tipos';
import { Icone } from '../Icone';

const pct = (v: number) => `${Math.round(v * 100)}%`;

function Barra({ partes }: { partes: { v: number; cor: string; nome: string }[] }) {
  return (
    <div>
      <div className="flex h-2.5 rounded overflow-hidden bg-white/5">
        {partes.map((p) => <div key={p.nome} style={{ width: `${p.v * 100}%`, background: p.cor }} title={`${p.nome}: ${pct(p.v)}`} />)}
      </div>
      <div className="flex flex-wrap gap-x-3 text-[10px] text-suave mt-1">
        {partes.map((p) => <span key={p.nome}><i className="inline-block w-2 h-2 rounded-sm mr-1" style={{ background: p.cor }} />{p.nome} {pct(p.v)}</span>)}
      </div>
    </div>
  );
}

export function PainelTransporte({ st }: { st: Stats }) {
  const toast = useGame((g) => g.toast);
  const set = useGame((g) => g.set);
  const t = st.cidade.transporte, m = st.cidade.mobilidade;
  const [tarifa, setTarifa] = useState(t.tarifa);
  const politica = async (p: { tarifa?: number; vans?: PoliticaVans }) => { const r = await comando({ kind: 'transporte-politica', ...p }); if (!r.ok) toast(r.msg ?? 'Erro', 'erro'); };
  return (
    <div className="w-[440px] max-w-full space-y-4">
      <div>
        <h3 className="titulo text-xl">Mobilidade da capital</h3>
        <p className="text-xs text-suave mt-1">Modelo semanal de deslocamentos casa–trabalho: quem tem carro escolhe entre carro, coletivo, a pé e van; quem não tem depende do coletivo, das pernas e das vans.</p>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="bg-white/5 rounded-lg p-2"><div className="text-[10px] text-suave">Tempo médio</div><div className="num text-xl">{m.tempoMedio ? `${Math.round(m.tempoMedio)} min` : '—'}</div></div>
        <div className="bg-white/5 rounded-lg p-2"><div className="text-[10px] text-suave">Passageiros/dia</div><div className="num text-xl">{fmt.int(m.passageirosDia)}</div></div>
        <div className="bg-white/5 rounded-lg p-2"><div className="text-[10px] text-suave">Congestionamento</div><div className={`num text-xl ${m.congestionamento > 0.8 ? 'text-perigo' : m.congestionamento > 0.5 ? 'text-acento-2' : 'text-acento'}`}>{pct(m.congestionamento)}</div></div>
      </div>
      <div>
        <div className="text-xs text-suave mb-1">Divisão modal ({fmt.int(m.viagensDia)} viagens/dia)</div>
        <Barra partes={[{ v: m.modal.carro, cor: '#9aa3a8', nome: 'Carro' }, { v: m.modal.coletivo, cor: '#3ee0b0', nome: 'Coletivo' }, { v: m.modal.ape, cor: '#f5b942', nome: 'A pé' }, { v: m.modal.informal, cor: '#c77dff', nome: 'Vans/mototáxi' }]} />
      </div>
      <div className="rounded-lg border border-borda p-3 space-y-3">
        <div>
          <div className="flex justify-between text-xs"><span className="text-suave">Tarifa</span><span className="num text-base">R$ {tarifa.toFixed(2).replace('.', ',')}</span></div>
          <div className="flex gap-2 items-center">
            <input type="range" min={0} max={9} step={0.05} value={tarifa} onChange={(e) => setTarifa(Number(e.target.value))} className="flex-1" />
            <button onClick={() => politica({ tarifa })} className="px-2 py-1 rounded bg-white/8 hover:bg-white/15 text-xs">Aplicar</button>
          </div>
          <div className="text-[10px] text-suave">Receita {fmt.reais(t.receitaMes)}/mês · operação {fmt.reais(t.custoMes)}/mês · {t.receitaMes >= t.custoMes ? 'superávit' : `subsídio de ${fmt.reais(t.custoMes - t.receitaMes)}`}</div>
        </div>
        <div>
          <div className="text-xs text-suave mb-1">Vans e mototáxis</div>
          <div className="flex gap-1">
            {([['combater', 'Combater'], ['tolerar', 'Tolerar'], ['regularizar', 'Regularizar']] as const).map(([v, n]) => (
              <button key={v} onClick={() => politica({ vans: v })} className={`flex-1 px-2 py-1 rounded text-xs ${t.vans === v ? 'bg-acento text-tinta font-semibold' : 'bg-white/5 hover:bg-white/10'}`}>{n}</button>
            ))}
          </div>
          <div className="text-[10px] text-suave mt-1">Tolerar alimenta a milícia; combater deixa quem não tem ônibus a pé; regularizar exige placa, seguro e vistoria.</div>
        </div>
      </div>
      <div>
        <div className="flex justify-between items-center mb-1">
          <span className="text-xs text-suave">Linhas ({t.linhas.length})</span>
          <button onClick={() => set({ ferramenta: { tipo: 'linha', linha: 'onibus' }, painel: 'nenhum' })} className="text-xs text-acento hover:underline">+ nova linha</button>
        </div>
        {t.linhas.length === 0 && <p className="text-xs text-suave">Nenhuma linha. Use o grupo Transporte na barra de ferramentas.</p>}
        <div className="space-y-1.5 max-h-60 overflow-auto pr-1">
          {t.linhas.map((l) => (
            <div key={l.id} className="rounded-lg bg-white/[0.04] px-2.5 py-2 text-xs">
              <div className="flex items-center gap-2">
                <i className="w-3 h-3 rounded-full" style={{ background: l.cor }} />
                <span className="font-semibold flex-1">{l.nome}</span>
                <span className="text-suave">{TIPOS_LINHA[l.tipo].nome}</span>
                {l.status === 'em_obra' && <span className="text-acento-2">em obra</span>}
                <button title="Desativar linha" onClick={() => comando({ kind: 'linha-remover', id: l.id })} className="text-suave hover:text-perigo"><Icone nome="x" tamanho={14} /></button>
              </div>
              {l.status === 'operando' && (
                <div className="flex items-center gap-3 mt-1 text-suave">
                  <span>{fmt.int(l.passageirosDia)} pass./dia</span>
                  <span>intervalo {l.headwayMin < 1 ? `${Math.round(l.headwayMin * 60)} s` : `${Math.round(l.headwayMin)} min`}</span>
                  <span className={l.lotacao > 1.1 ? 'text-perigo' : l.lotacao > 0.8 ? 'text-acento-2' : ''}>lotação {pct(l.lotacao)}</span>
                  <span className="flex-1" />
                  <button onClick={() => comando({ kind: 'linha-frota', id: l.id, frota: l.frota - 1 })} className="px-1.5 rounded bg-white/5 hover:bg-white/10">−</button>
                  <span className="num text-texto">{l.frota}</span>
                  <button onClick={async () => { const r = await comando({ kind: 'linha-frota', id: l.id, frota: l.frota + 1 }); if (!r.ok) toast(r.msg ?? 'Erro', 'erro'); }} className="px-1.5 rounded bg-white/5 hover:bg-white/10">+</button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function PainelSeguranca({ st }: { st: Stats }) {
  const set = useGame((g) => g.set);
  const toast = useGame((g) => g.toast);
  const t = st.cidade.territorio, s = st.cidade.servicos;
  const pol = st.estado?.politicas;
  const doutrinas: { id: DoutrinaSeguranca; nome: string; desc: string }[] = [
    { id: 'confronto', nome: 'Confronto', desc: 'Operações rápidas e manchetes; letalidade alta e o crime volta.' },
    { id: 'inteligencia', nome: 'Inteligência', desc: 'Investigação e asfixia financeira; lento, sufoca a milícia.' },
    { id: 'prevencao', nome: 'Prevenção', desc: 'Policiamento comunitário e social; o mais lento e o mais duradouro.' },
  ];
  return (
    <div className="w-[440px] max-w-full space-y-4">
      <div>
        <h3 className="titulo text-xl">Segurança e território</h3>
        <p className="text-xs text-suave mt-1">Grupos fictícios disputam a cidade com o Estado. Crescem com pobreza e ausência de polícia; recuam com delegacias, batalhões, bases comunitárias e operações.</p>
      </div>
      <div>
        <div className="text-xs text-suave mb-1">Onde vivem os moradores</div>
        <Barra partes={[{ v: t.estado, cor: '#3ee0b0', nome: 'Estado' }, { v: t.disputado, cor: '#f5b942', nome: 'Disputado' }, { v: t.faccao, cor: GRUPOS[1].cor, nome: GRUPOS[1].nome }, { v: t.milicia, cor: GRUPOS[2].cor, nome: GRUPOS[2].nome }]} />
        {t.guerra && <div className="text-xs text-perigo mt-2">⚠ Guerra entre facção e milícia em andamento</div>}
      </div>
      <div className="grid grid-cols-4 gap-2 text-center">
        {[['Saúde', s.saude], ['Educação', s.educacao], ['Policiamento', s.seguranca], ['Criminalidade', s.crime]].map(([n, v]) => (
          <div key={n as string} className="bg-white/5 rounded-lg p-2"><div className="text-[10px] text-suave">{n}</div><div className={`num text-lg ${n === 'Criminalidade' ? ((v as number) > 0.4 ? 'text-perigo' : 'text-acento-2') : ''}`}>{pct(v as number)}</div></div>
        ))}
      </div>
      {pol && (
        <div className="rounded-lg border border-borda p-3 space-y-2">
          <div className="text-xs text-suave">Doutrina da Secretaria de Segurança (vale para o estado todo)</div>
          <div className="grid grid-cols-3 gap-1.5">
            {doutrinas.map((d) => (
              <button key={d.id} onClick={() => comando({ kind: 'estado', acao: { tipo: 'politica', politicas: { doutrina: d.id } } })}
                className={`text-left rounded-lg p-2 border ${pol.doutrina === d.id ? 'border-acento bg-acento/10' : 'border-borda hover:bg-white/5'}`}>
                <div className="text-xs font-semibold">{d.nome}</div>
                <div className="text-[10px] text-suave leading-snug">{d.desc}</div>
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={pol.cameras} onChange={(e) => comando({ kind: 'estado', acao: { tipo: 'politica', politicas: { cameras: e.target.checked } } })} /> Câmeras corporais nas fardas (−40% de letalidade; associações policiais chiam)</label>
        </div>
      )}
      <div className="flex gap-2">
        <button onClick={() => { set({ ferramenta: { tipo: 'operacao' }, painel: 'nenhum', camada: 'territorio' }); toast('Escolha a área da operação no mapa', 'info'); }} className="flex-1 px-3 py-2 rounded-lg bg-perigo/15 text-perigo hover:bg-perigo/25 text-sm">Ordenar operação policial</button>
        <button onClick={() => set({ camada: 'territorio' })} className="px-3 py-2 rounded-lg bg-white/6 hover:bg-white/12 text-sm">Ver mapa</button>
      </div>
      {t.operacoes.length > 0 && (
        <div>
          <div className="text-xs text-suave mb-1">Operações recentes</div>
          <div className="space-y-1 text-xs">
            {t.operacoes.map((o, i) => (
              <div key={i} className="flex justify-between border-b border-white/5 py-1"><span>{o.local}</span><span className="text-suave num">{o.data} · <span className={o.mortos ? 'text-perigo' : 'text-acento'}>{o.mortos} mortos</span> · {o.presos} presos</span></div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function PainelHabitacao({ st }: { st: Stats }) {
  const set = useGame((g) => g.set);
  const f = st.cidade.favelas;
  const status = { informal: 'informal', urbanizando: 'em urbanização', urbanizada: 'urbanizada', removendo: 'em remoção' };
  return (
    <div className="w-[420px] max-w-full space-y-4">
      <div>
        <h3 className="titulo text-xl">Habitação</h3>
        <p className="text-xs text-suave mt-1">Empregos atraem famílias. Quem não consegue pagar o aluguel perto do trabalho ocupa encostas, beiras de rio e terrenos vazios. Zoneie ZEIS (habitação de interesse social) para dar alternativa.</p>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="bg-white/5 rounded-lg p-2"><div className="text-[10px] text-suave">Déficit popular</div><div className={`num text-xl ${f.deficit > 500 ? 'text-perigo' : ''}`}>{fmt.int(f.deficit)}</div><div className="text-[10px] text-suave">pessoas</div></div>
        <div className="bg-white/5 rounded-lg p-2"><div className="text-[10px] text-suave">Em ocupações</div><div className="num text-xl">{fmt.int(st.populacaoInformal)}</div><div className="text-[10px] text-suave">moradores</div></div>
        <div className="bg-white/5 rounded-lg p-2"><div className="text-[10px] text-suave">Demanda popular</div><div className="num text-xl">{fmt.int(f.demandaPopular)}</div><div className="text-[10px] text-suave">pessoas</div></div>
      </div>
      <div className="space-y-1.5 max-h-72 overflow-auto pr-1">
        {f.lista.length === 0 && <p className="text-xs text-suave">Nenhuma ocupação informal (por enquanto).</p>}
        {f.lista.map((x) => (
          <button key={x.id} onClick={() => set({ favelaSelecionada: x.id, painel: 'nenhum' })} className="w-full text-left rounded-lg bg-white/[0.04] hover:bg-white/[0.08] px-3 py-2">
            <div className="flex justify-between text-sm"><span className="font-semibold">{x.nome}</span><span className="num">{fmt.int(x.populacao)} hab.</span></div>
            <div className="text-[11px] text-suave">{status[x.status]}{x.regularizada ? ' · regularizada' : ''} · risco {pct(x.risco)} · crime {pct(x.crime)}{x.mortosDeslizamento ? ` · ${x.mortosDeslizamento} mortos em deslizamentos` : ''}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

export function FavelaInfo() {
  const sel = useGame((g) => g.favelaSelecionada);
  const st = useGame((g) => g.stats);
  const set = useGame((g) => g.set);
  const toast = useGame((g) => g.toast);
  if (sel < 0 || !st) return null;
  const f = st.cidade.favelas.lista.find((x) => x.id === sel);
  if (!f) return null;
  const custoUrb = f.populacao * 11_000, custoReg = f.populacao * 350, custoRem = (f.populacao / 3.5) * 28_000;
  const acao = async (a: 'urbanizar' | 'regularizar' | 'remover') => {
    const r = await comando({ kind: 'favela', id: f.id, acao: a });
    toast(r.ok ? { urbanizar: 'Urbanização contratada', regularizar: 'Títulos de posse entregues', remover: 'Remoção iniciada' }[a] : r.msg ?? 'Não foi possível', r.ok ? 'ok' : 'erro');
  };
  const status = { informal: 'Ocupação informal', urbanizando: 'Em urbanização (obra estadual)', urbanizada: 'Urbanizada', removendo: 'Em remoção' };
  return (
    <div className="absolute left-3 top-24 w-80 painel rounded-xl p-4 pointer-events-auto surgir">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[11px] text-suave">{status[f.status]}{f.regularizada ? ' · posse regularizada' : ''}</div>
          <div className="titulo text-xl font-semibold mt-0.5">{f.nome}</div>
          <div className="text-xs text-suave">{fmt.int(f.populacao)} moradores · {f.casas} casas</div>
        </div>
        <button onClick={() => set({ favelaSelecionada: -1 })} className="text-suave hover:text-white"><Icone nome="x" tamanho={18} /></button>
      </div>
      <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
        <div className="bg-white/5 rounded-lg p-2"><div className="text-[10px] text-suave">Risco de deslizamento</div><div className={`num text-lg ${f.risco > 0.4 ? 'text-perigo' : ''}`}>{pct(f.risco)}</div></div>
        <div className="bg-white/5 rounded-lg p-2"><div className="text-[10px] text-suave">Criminalidade</div><div className={`num text-lg ${f.crime > 0.5 ? 'text-perigo' : ''}`}>{pct(f.crime)}</div></div>
      </div>
      <div className="text-[11px] text-suave mt-2">Atendimento: saúde {pct(f.cobertura.saude)} · escola {pct(f.cobertura.educacao)} · polícia {pct(f.cobertura.seguranca)}</div>
      <div className="text-[11px] mt-1" style={{ color: GRUPOS[f.grupo].cor }}>Grupo presente: {GRUPOS[f.grupo].nome} ({GRUPOS[f.grupo].tipo})</div>
      {f.mortosDeslizamento > 0 && <div className="text-[11px] text-perigo mt-1">{f.mortosDeslizamento} mortos em deslizamentos</div>}
      <div className="mt-3 pt-3 border-t border-borda space-y-1.5">
        <button disabled={f.status !== 'informal'} onClick={() => acao('urbanizar')} className="w-full text-left px-3 py-2 rounded-lg bg-acento/10 hover:bg-acento/20 disabled:opacity-40 text-sm">
          <b>Urbanizar</b> <span className="text-[11px] text-suave">— saneamento, escadarias, contenção · obra estadual {fmt.reais(custoUrb)}</span>
        </button>
        <button disabled={f.regularizada} onClick={() => acao('regularizar')} className="w-full text-left px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-40 text-sm">
          <b>Regularizar a posse</b> <span className="text-[11px] text-suave">— títulos para as famílias · {fmt.reais(custoReg)}</span>
        </button>
        <button disabled={f.status === 'removendo'} onClick={() => acao('remover')} className="w-full text-left px-3 py-2 rounded-lg bg-perigo/10 hover:bg-perigo/20 text-perigo disabled:opacity-40 text-sm">
          <b>Remover</b> <span className="text-[11px] opacity-80">— indenizações e aluguel social · {fmt.reais(custoRem)}</span>
        </button>
        <p className="text-[10px] text-suave">Encosta íngreme? Um teleférico (grupo Transporte) liga o morro ao asfalto.</p>
      </div>
    </div>
  );
}

/** Barra flutuante enquanto o jogador traça uma linha. */
export function BarraLinha() {
  const f = useGame((g) => g.ferramenta);
  const paradas = useGame((g) => g.linhaParadas);
  const set = useGame((g) => g.set);
  if (f.tipo !== 'linha') return null;
  return (
    <div className="absolute bottom-[8.5rem] left-1/2 -translate-x-1/2 painel rounded-xl px-4 py-2 flex items-center gap-3 pointer-events-auto text-sm surgir">
      <span><b>{TIPOS_LINHA[f.linha].nome}</b> · {paradas.length} parada{paradas.length === 1 ? '' : 's'}</span>
      <button disabled={!paradas.length} onClick={() => useGame.setState({ linhaParadas: paradas.slice(0, -1) })} className="px-2 py-1 rounded bg-white/6 hover:bg-white/12 disabled:opacity-40">Desfazer</button>
      <button disabled={paradas.length < 2} onClick={() => concluirLinha()} className="px-3 py-1 rounded bg-acento text-tinta font-semibold disabled:opacity-40">Concluir</button>
      <button onClick={() => set({ ferramenta: { tipo: 'nenhuma' } })} className="px-2 py-1 rounded text-suave hover:text-white">Cancelar</button>
    </div>
  );
}
