/**
 * Tela do Modo Presidente (Fase 9): o mapa do Brasil ao fundo (BrasilScene, tela 'presidente'),
 * barra de indicadores, painéis do Planalto à direita, ficha do estado selecionado e legado no fim.
 */
import { useEffect, useState } from 'react';
import { useApp } from '../../app/store';
import { PARTIDOS } from '../../sim/politica/dados';
import { usePres, type CamadaMapa, type PainelPres } from '../../sim/presidente/store';
import type { Presidencia } from '../../sim/presidente/presidencia';
import { exportarPres, salvarPresLocal, savePres } from '../../save/save';
import { TrilhaSonora } from '../hud/Trilha';
import { OpcoesGerais } from '../Opcoes';
import { Icone } from '../Icone';
import { Botao } from '../governo/comum';
import { Retrato } from '../governo/Retrato';
import { corRel, Linha, num, pp, relTexto } from './comum';
import { PainelBC, PainelCongresso, PainelEconomia, PainelEleicao, PainelEstados, PainelMinisterios, PainelOrcamento, PainelPlanalto, PainelSTF } from './Paineis';
import { PainelNuvem } from './Nuvem';
import { Assessor } from '../assessor/Assessor';
import { useConquistas } from '../conquistas/Conquistas';

const ctxConquistasPres = () => { const pres = usePres.getState().pres; return pres ? { pres } : null; };
import { ASSESSOR_PRES, DICAS_PRES, PASSOS_PRES } from '../assessor/roteiros';

const ABAS: { id: PainelPres; nome: string; icone: string }[] = [
  { id: 'planalto', nome: 'Planalto', icone: 'predio' },
  { id: 'economia', nome: 'Economia', icone: 'grafico' },
  { id: 'orcamento', nome: 'Orçamento', icone: 'jornal' },
  { id: 'congresso', nome: 'Congresso', icone: 'pessoas' },
  { id: 'stf', nome: 'STF', icone: 'info' },
  { id: 'bc', nome: 'Banco Central', icone: 'dinheiro' },
  { id: 'ministerios', nome: 'Ministérios', icone: 'casa' },
  { id: 'estados', nome: 'Estados', icone: 'camadas' },
  { id: 'eleicao', nome: 'Eleição', icone: 'aprovacao' },
  { id: 'nuvem', nome: 'Nuvem', icone: 'salvar' },
];

function Chip({ rotulo, valor, cor, titulo }: { rotulo: string; valor: string; cor?: string; titulo?: string }) {
  return (
    <div className="px-2 leading-tight" title={titulo}>
      <div className="text-[9px] uppercase tracking-wider text-suave">{rotulo}</div>
      <div className={`num text-sm font-semibold ${cor ?? ''}`}>{valor}</div>
    </div>
  );
}

function Barra({ p, onMenu }: { p: Presidencia; onMenu: () => void }) {
  const vel = usePres((s) => s.velocidade);
  const setVel = usePres((s) => s.setVelocidade);
  const e = p.eco;
  const meta = p.metaPorAno[p.ano] ?? 0;
  return (
    <div className="absolute top-3 left-3 right-3 flex gap-2 pointer-events-none flex-wrap">
      <div className="painel rounded-xl px-3 py-2 flex items-center gap-3 pointer-events-auto">
        <button onClick={onMenu} className="text-suave hover:text-white" aria-label="Menu"><Icone nome="menu" tamanho={18} /></button>
        <div className="leading-tight">
          <div className="titulo text-sm">{p.init.genero === 'f' ? 'Presidenta' : 'Presidente'} {p.init.nome}</div>
          <div className="text-[11px] text-suave num">{p.dataTexto()} · {PARTIDOS[p.init.partido].sigla}{p.mandato === 2 ? ' · 2º mandato' : ''}</div>
        </div>
        <div className="flex gap-1">
          {([0, 1, 2, 4] as const).map((v) => (
            <button key={v} onClick={() => setVel(v)} aria-label={v === 0 ? 'Pausar' : `Velocidade ${v}×`} aria-pressed={vel === v} className={`p-1.5 rounded-md ${vel === v ? 'bg-acento text-tinta' : 'text-suave hover:text-white'}`} title={v === 0 ? 'Pausar (Espaço)' : `${v}×`}>
              <Icone nome={v === 0 ? 'pausa' : v === 1 ? 'play' : v === 2 ? 'rapido' : 'muitoRapido'} tamanho={14} />
            </button>
          ))}
        </div>
      </div>
      <div className="painel rounded-xl px-1 py-1.5 flex items-center divide-x divide-white/10 pointer-events-auto overflow-x-auto max-w-full">
        <Chip rotulo="Aprovação" valor={pp(p.aprovacao, 0)} cor={p.aprovacao >= 45 ? 'text-acento' : p.aprovacao >= 30 ? 'text-acento-2' : 'text-perigo'} />
        <Chip rotulo="PIB" valor={pp(e.crescimento)} />
        <Chip rotulo="IPCA" valor={pp(e.inflacao)} cor={Math.abs(e.inflacao - e.metaInflacao) > 1.5 ? 'text-perigo' : ''} />
        <Chip rotulo="Selic" valor={pp(e.selic, 2)} />
        <Chip rotulo="Dólar" valor={`R$ ${num(e.cambio, 2)}`} />
        <Chip rotulo="Desemprego" valor={pp(e.desemprego)} />
        <Chip rotulo="Dívida/PIB" valor={pp(e.divida)} cor={e.divida > 90 ? 'text-perigo' : ''} />
        <Chip rotulo="Primário" valor={pp(e.primario, 2)} cor={e.primario >= meta - 0.25 ? 'text-acento' : 'text-perigo'} titulo={`Meta ${pp(meta, 2)} do PIB`} />
        <Chip rotulo="Capital" valor={String(Math.round(p.capital))} titulo="Capital político" />
      </div>
    </div>
  );
}

function FichaUF({ p, uf }: { p: Presidencia; uf: string }) {
  const acao = usePres((s) => s.acao);
  const u = p.init.ufs.find((x) => x.sigla === uf);
  const g = p.governadores.find((x) => x.uf === uf);
  if (!u || !g) return null;
  const sen = p.senado.deputados.filter((d) => d.cidade === uf);
  const dep = p.camara.deputados.filter((d) => d.cidade === uf);
  return (
    <div className="painel rounded-xl p-3 w-72 pointer-events-auto surgir" key={uf}>
      <div className="flex justify-between items-start">
        <div><div className="titulo text-lg leading-none">{u.nome}</div><div className="text-[11px] text-suave">{(p.init.macro.eleitorado[uf] / 1e6).toFixed(1).replace('.', ',')} milhões de eleitores{uf === p.init.origem ? ' · seu estado' : ''}</div></div>
        <div className="num text-2xl font-semibold">{Math.round(p.aprovUF[uf])}%</div>
      </div>
      <div className="flex gap-2 items-center mt-2">
        <Retrato semente={g.retrato} genero={g.genero} idade={56} tamanho={38} />
        <div className="text-xs leading-tight"><div className="text-[10px] text-suave">{g.genero === 'f' ? 'Governadora' : 'Governador'}</div><b>{g.nome}</b> ({PARTIDOS[g.partido].sigla})<div style={{ color: corRel(g.relacao) }}>{relTexto(g.relacao)}</div></div>
      </div>
      <div className="text-[11px] text-suave mt-2">Bancada: {dep.length} deputados ({dep.filter((d) => d.relacao > 0.1).length} governistas) · {sen.length} senadores ({sen.filter((d) => d.relacao > 0.1).length} governistas)</div>
      <div className="flex gap-1 mt-2"><Botao onClick={() => acao((q) => q.visitar(uf))}>Visitar</Botao><Botao onClick={() => acao((q) => q.obraFederal(uf))}>Obra federal</Botao></div>
    </div>
  );
}

function MenuPausa({ p, onFechar }: { p: Presidencia; onFechar: () => void }) {
  const irPara = useApp((s) => s.irPara);
  const sair = usePres((s) => s.sair);
  const [msg, setMsg] = useState('');
  const save = () => savePres(p.serializar(), `${p.init.nome} (${PARTIDOS[p.init.partido].sigla}) — ${p.dataTexto()}`);
  return (
    <div className="absolute inset-0 bg-black/55 flex items-center justify-center pointer-events-auto z-30" onClick={onFechar}>
      <div className="painel rounded-2xl p-6 w-80 surgir" onClick={(ev) => ev.stopPropagation()}>
        <h2 className="titulo text-3xl font-bold">Pausa</h2>
        <div className="flex flex-col gap-2 mt-4">
          <button onClick={onFechar} className="px-4 py-2.5 rounded-lg bg-acento text-tinta font-semibold">Voltar ao Planalto</button>
          <button onClick={async () => { await salvarPresLocal(save()); setMsg('Jogo salvo neste navegador.'); }} className="px-4 py-2.5 rounded-lg bg-white/5 hover:bg-white/10 flex items-center gap-2"><Icone nome="salvar" tamanho={16} /> Salvar</button>
          <button onClick={() => { exportarPres(save()); setMsg('Arquivo .nacao exportado.'); }} className="px-4 py-2.5 rounded-lg bg-white/5 hover:bg-white/10 flex items-center gap-2"><Icone nome="exportar" tamanho={16} /> Exportar .nacao</button>
          <button onClick={() => { sair(); irPara('menu'); }} className="px-4 py-2.5 rounded-lg bg-white/5 hover:bg-perigo/20 text-perigo">Sair para o menu</button>
        </div>
        {msg && <div className="text-xs text-acento mt-3">{msg}</div>}
        <details className="mt-3">
          <summary className="cursor-pointer text-xs text-suave hover:text-white">Opções (acessibilidade, gráficos, tutorial, som)</summary>
          <OpcoesGerais />
        </details>
      </div>
    </div>
  );
}

function Legado({ p }: { p: Presidencia }) {
  const irPara = useApp((s) => s.irPara);
  const sair = usePres((s) => s.sair);
  const setPainel = usePres((s) => s.setPainel);
  const s0 = p.serie[0], s1 = p.serie[p.serie.length - 1];
  const fim = p.fim!;
  const titulo = { mandato: 'Fim do governo', derrota: 'Derrotado(a) nas urnas', impeachment: 'Impeachment', 'sucessor-eleito': 'Missão cumprida', 'sucessor-derrotado': 'A oposição volta ao poder' }[fim.motivo];
  const linhas: [string, number, number, (v: number) => string, boolean][] = [
    ['Aprovação', s0.aprovacao, s1.aprovacao, (v) => pp(v, 0), true],
    ['PIB (12 meses)', s0.crescimento, s1.crescimento, (v) => pp(v), true],
    ['IPCA (12 meses)', s0.inflacao, s1.inflacao, (v) => pp(v), false],
    ['Desemprego', s0.desemprego, s1.desemprego, (v) => pp(v), false],
    ['Selic', s0.selic, s1.selic, (v) => pp(v, 2), false],
    ['Dólar', s0.cambio, s1.cambio, (v) => `R$ ${num(v, 2)}`, false],
    ['Dívida bruta/PIB', s0.divida, s1.divida, (v) => pp(v), false],
    ['Resultado primário', s0.primario, s1.primario, (v) => pp(v, 2), true],
  ];
  return (
    <div className="absolute inset-0 bg-black/70 flex items-center justify-center pointer-events-auto z-40 p-4">
      <div className="painel rounded-2xl p-6 w-full max-w-2xl max-h-full overflow-auto surgir">
        <div className="text-acento/80 text-[11px] tracking-[0.3em] uppercase">Seu governo em números</div>
        <h2 className="titulo text-4xl font-bold mt-1">{titulo}</h2>
        <p className="text-sm text-suave mt-1">{fim.texto}</p>
        <div className="flex items-center gap-4 mt-4">
          <div className="text-center"><div className="num text-5xl font-bold text-acento">{p.nota()}</div><div className="text-[10px] text-suave uppercase">nota do legado</div></div>
          <div className="flex-1"><Linha valores={p.serie.map((x) => x.aprovacao)} altura={80} rotulos={[s0.data, s1.data]} formato={(v) => pp(v, 0)} /></div>
        </div>
        <table className="w-full text-sm mt-4">
          <thead><tr className="text-[10px] text-suave text-left"><th>Indicador</th><th>Na posse</th><th>No fim</th></tr></thead>
          <tbody>{linhas.map(([n, a, b, f, altoBom]) => <tr key={n} className="border-b border-white/5"><td className="py-1">{n}</td><td className="num">{f(a)}</td><td className={`num font-semibold ${(b > a) === altoBom ? 'text-acento' : 'text-perigo'}`}>{f(b)}</td></tr>)}</tbody>
        </table>
        <div className="text-xs text-suave mt-3">{p.vigentes.length} medidas em vigor · {p.votacoes.filter((v) => v.aprovado).length} votações vencidas de {p.votacoes.length} · {p.stf.filter((m) => m.indicadoPorVoce).length} ministro(s) do STF indicados · {p.descumprimentos} meta(s) fiscal(is) descumprida(s)</div>
        <div className="flex gap-2 mt-5">
          <Botao tom="primario" onClick={() => setPainel('nuvem')}>Publicar no ranking</Botao>
          <Botao onClick={() => { sair(); irPara('menu'); }}>Voltar ao menu</Botao>
        </div>
      </div>
    </div>
  );
}

export function TelaPresidente() {
  const p = usePres((s) => s.pres);
  usePres((s) => s.v);
  const painel = usePres((s) => s.painel);
  const setPainel = usePres((s) => s.setPainel);
  const camada = usePres((s) => s.camada);
  const setCamada = usePres((s) => s.setCamada);
  const toast = usePres((s) => s.toast);
  const sel = useApp((s) => s.selecionada);
  const irPara = useApp((s) => s.irPara);
  const [pausa, setPausa] = useState(false);
  const [aberto, setAberto] = useState(true);
  useConquistas(ctxConquistasPres);

  useEffect(() => {
    const k = (ev: KeyboardEvent) => {
      if ((ev.target as HTMLElement)?.tagName === 'INPUT') return;
      const st = usePres.getState();
      if (ev.key === ' ') { ev.preventDefault(); st.setVelocidade(st.velocidade > 0 ? 0 : 1); }
      if (ev.key === 'Escape') setPausa((x) => !x);
      if (ev.key === '1') st.setVelocidade(1);
      if (ev.key === '2') st.setVelocidade(2);
      if (ev.key === '3') st.setVelocidade(4);
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);

  useEffect(() => { if (!p) irPara('menu'); }, [p, irPara]);
  if (!p) return null;
  const Painel = { planalto: PainelPlanalto, economia: PainelEconomia, orcamento: PainelOrcamento, congresso: PainelCongresso, stf: PainelSTF, bc: PainelBC, ministerios: PainelMinisterios, estados: PainelEstados, eleicao: PainelEleicao, nuvem: PainelNuvem }[painel];
  const pend = p.eventos.pendentes.length;
  const badge: Partial<Record<PainelPres, number>> = { planalto: pend, stf: p.vagaSTF ? 1 : 0, bc: p.bc.indicacao ? 1 : 0, congresso: p.propostas.filter((x) => x.status === 'tramitando').length };

  return (
    <div className="absolute inset-0 pointer-events-none z-20">
      <Barra p={p} onMenu={() => setPausa(true)} />

      {/* painel do Planalto */}
      <div className={`absolute top-[5.2rem] bottom-3 right-3 flex gap-2 pointer-events-none transition-transform ${aberto ? '' : 'translate-x-[calc(100%-3rem)]'}`}>
        <nav className="painel rounded-xl p-1 flex flex-col gap-0.5 self-start pointer-events-auto">
          <button onClick={() => setAberto(!aberto)} className="p-2 text-suave hover:text-white" title={aberto ? 'Recolher' : 'Abrir'}><Icone nome={aberto ? 'x' : 'menu'} tamanho={16} /></button>
          {ABAS.filter((a) => a.id !== 'eleicao' || p.eleicao || p.anoEleitoral()).map((a) => (
            <button key={a.id} onClick={() => { setPainel(a.id); setAberto(true); }} title={a.nome} className={`relative px-2 py-1.5 rounded-lg text-[11px] text-left w-28 flex items-center gap-1.5 ${painel === a.id ? 'bg-acento text-tinta font-semibold' : 'text-suave hover:text-white hover:bg-white/5'}`}>
              <Icone nome={a.icone} tamanho={14} />{a.nome}
              {!!badge[a.id] && <span className={`ml-auto num text-[10px] rounded-full px-1.5 ${painel === a.id ? 'bg-tinta/20' : 'bg-acento-2 text-tinta'}`}>{badge[a.id]}</span>}
            </button>
          ))}
        </nav>
        <div className="painel rounded-xl p-4 w-[min(540px,calc(100vw-11rem))] overflow-auto pointer-events-auto">
          <h2 className="titulo text-2xl mb-2">{ABAS.find((a) => a.id === painel)?.nome}</h2>
          <Painel p={p} />
        </div>
      </div>

      {/* camada do mapa e estado selecionado */}
      <div className="absolute left-3 bottom-3 flex flex-col gap-2 items-start pointer-events-none">
        {sel && <FichaUF p={p} uf={sel} />}
        <div className="painel rounded-xl p-1 flex gap-1 pointer-events-auto">
          {([['aprovacao', 'Aprovação'], ['governadores', 'Governadores'], ['eleicao', 'Eleição']] as [CamadaMapa, string][]).filter(([c]) => c !== 'eleicao' || p.eleicao).map(([c, n]) => (
            <button key={c} onClick={() => setCamada(c)} className={`px-2.5 py-1 rounded-lg text-xs ${camada === c ? 'bg-acento text-tinta font-semibold' : 'text-suave hover:text-white'}`}>{n}</button>
          ))}
        </div>
      </div>

      <div className="absolute left-3 top-[7.6rem] pointer-events-none">
        <Assessor modo="presidente" quem={ASSESSOR_PRES} passos={PASSOS_PRES} dicas={DICAS_PRES} ctx={{ p, painel, ufSelecionada: sel, velocidade: usePres.getState().velocidade }} />
      </div>
      {pend > 0 && painel !== 'planalto' && (
        <button onClick={() => setPainel('planalto')} className="absolute top-[5.4rem] left-3 painel rounded-full px-3 py-1.5 text-xs text-acento-2 pointer-events-auto pulsar">⚑ {pend} decisão(ões) esperando o Planalto</button>
      )}
      {toast && <div className={`absolute bottom-16 left-1/2 -translate-x-1/2 painel rounded-full px-4 py-2 text-sm pointer-events-none ${toast.tom === 'erro' ? 'text-perigo' : 'text-acento'}`}>{toast.texto}</div>}
      {pausa && <MenuPausa p={p} onFechar={() => setPausa(false)} />}
      {p.fim && painel !== 'nuvem' && <Legado p={p} />}
      <TrilhaSonora sigla="BR" trilha={['bossa nova', 'samba', 'MPB', 'choro', 'forró', 'frevo', 'sertanejo']} />
    </div>
  );
}
