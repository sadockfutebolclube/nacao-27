/** HUD da Visão Cidade: tudo em PT-BR, cara de jogo de estratégia (painéis translúcidos, números condensados). */
import { useEffect, useMemo, useState } from 'react';
import { fmt, useApp } from '../../app/store';
import type { SiglaUF } from '../../data/schemas';
import { cidadao, bairroEm } from '../../data/nomes';
import { arquetipoPorId, EQUIPAMENTOS, ZONES, type Rede } from '../../sim/catalog';
import { mundo, pedirSave, setVelocidade, useGame, type Camada, type Ferramenta } from '../../sim/bridge';
import { FLAG, LOT_STATE_STRIDE, type Ledger, type Stats } from '../../sim/protocol';
import { somaDespesas, somaReceitas } from '../../sim/simulation';
import { exportarArquivo, salvarLocal } from '../../save/save';
import { LOT_STRIDE } from '../../world/lots';
import { ROAD_SPECS } from '../../world/roads';
import { ambiente } from '../../render/city/ambiente';
import { Icone } from '../Icone';
import { PainelGoverno } from '../governo/Governo';
import { BannerFesta, PainelDecisoes, TempoAgora } from './EventosUI';
import { TelaLegado } from '../eleicao/Legado';
import { TrilhaSonora } from './Trilha';
import { OpcoesGerais } from '../Opcoes';
import { Assessor } from '../assessor/Assessor';
import { predio as predioReal, TIPO_PREDIO } from '../../data/cidadeReal';
import { useConquistas } from '../conquistas/Conquistas';
import { ASSESSOR_CIDADE, DICAS_CIDADE, PASSOS_CIDADE } from '../assessor/roteiros';
import { nuvemConfigurada, salvarNuvem } from '../../cloud/nuvem';
import { Login, useSessao } from '../presidente/Nuvem';
import { BarraLinha, FavelaInfo, PainelHabitacao, PainelSeguranca, PainelTransporte } from './PaineisCidade';
import { TIPOS_LINHA } from '../../sim/city/transporte';
import { GRUPOS as GRUPOS_CRIME, TERR_CELL, TERR_RES } from '../../sim/city/territorio';
import { BUILD_HALF } from '../../world/constants';

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

function Chip({ icone, rotulo, valor, cor, onClick, titulo }: { icone: string; rotulo: string; valor: string; cor?: string; onClick?: () => void; titulo?: string }) {
  return (
    <button onClick={onClick} title={titulo} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${onClick ? 'hover:bg-white/10' : 'cursor-default'}`}>
      <Icone nome={icone} tamanho={17} className="text-suave" />
      <div className="text-left leading-none">
        <div className="text-[9px] uppercase tracking-wider text-suave">{rotulo}</div>
        <div className={`num text-lg font-semibold ${cor ?? 'text-texto'}`}>{valor}</div>
      </div>
    </button>
  );
}

function Relogio() {
  const [h, setH] = useState(ambiente.hora);
  useEffect(() => {
    const t = setInterval(() => setH(ambiente.hora), 400);
    return () => clearInterval(t);
  }, []);
  const hh = Math.floor(h), mm = Math.floor((h - hh) * 60);
  return <span className="num text-suave">{String(hh).padStart(2, '0')}:{String(mm).padStart(2, '0')}</span>;
}

function BarraDemanda({ v, cor, letra }: { v: number; cor: string; letra: string }) {
  const pos = Math.max(0, v), neg = Math.max(0, -v);
  return (
    <div className="flex flex-col items-center gap-1" title={`Demanda ${letra}: ${Math.round(v * 100)}%`}>
      <div className="relative w-3 h-14 bg-white/5 rounded-sm overflow-hidden">
        <div className="absolute left-0 right-0 bottom-1/2 transition-all duration-500" style={{ height: `${pos * 50}%`, background: cor }} />
        <div className="absolute left-0 right-0 top-1/2 transition-all duration-500 opacity-50" style={{ height: `${neg * 50}%`, background: cor }} />
        <div className="absolute left-0 right-0 top-1/2 h-px bg-white/30" />
      </div>
      <span className="num text-xs font-semibold" style={{ color: cor }}>{letra}</span>
    </div>
  );
}

function BarraSuperior({ st, onMenu }: { st: Stats; onMenu: () => void }) {
  const velocidade = useGame((s) => s.velocidade);
  const set = useGame((s) => s.set);
  const init = mundo.init!;
  const saldo = st.ultimoBalanco ? st.ultimoBalanco.saldo : null;
  return (
    <div className="absolute top-3 inset-x-3 flex items-start justify-between gap-3 pointer-events-none">
      <div className="painel rounded-xl flex items-center gap-1 p-1.5 pointer-events-auto">
        <button onClick={onMenu} className="p-2 rounded-lg hover:bg-white/10" title="Menu (Esc)" aria-label="Menu (Esc)"><Icone nome="menu" /></button>
        <div className="px-2 leading-tight">
          <div className="titulo text-base font-semibold whitespace-nowrap">{init.cidade} <span className="text-acento">· {init.sigla}</span></div>
          <div className="text-[11px] text-suave whitespace-nowrap">{st.dia} de {MESES[st.mes - 1]} de {st.ano} · <Relogio /></div>
          <TempoAgora st={st} />
        </div>
        <div className="flex ml-1 bg-black/25 rounded-lg p-0.5">
          {[{ v: 0, i: 'pausa', t: 'Pausar (Espaço)' }, { v: 1, i: 'play', t: '1× (1)' }, { v: 2, i: 'rapido', t: '2× (2)' }, { v: 4, i: 'muitoRapido', t: '4× (3)' }].map((b) => (
            <button key={b.v} title={b.t} aria-label={b.t} aria-pressed={velocidade === b.v} onClick={() => setVelocidade(b.v)} className={`p-1.5 rounded-md ${velocidade === b.v ? 'bg-acento text-tinta' : 'text-suave hover:text-white'}`}>
              <Icone nome={b.i} tamanho={16} />
            </button>
          ))}
        </div>
      </div>

      <div className="painel rounded-xl flex items-center p-1 pointer-events-auto min-w-0 overflow-hidden">
        <Chip icone="pessoas" rotulo="População" valor={fmt.int(st.populacao + st.populacaoInformal)} onClick={() => set({ painel: 'habitacao' })} titulo={`${fmt.int(st.populacao)} em moradias formais e ${fmt.int(st.populacaoInformal)} em ocupações informais · déficit popular de ${fmt.int(st.cidade.favelas.deficit)} pessoas`} />
        <span className="hidden lg:block"><Chip icone="predio" rotulo="Empregos" valor={`${fmt.int(st.empregos)}`} titulo={`Desemprego: ${fmt.pct(st.desemprego)}`} /></span>
        {st.estado && <Chip icone="predio" rotulo="Tesouro" valor={fmt.reais(st.estado.caixa)} cor={st.estado.caixa < 0 ? 'text-perigo' : 'text-acento-2'} onClick={() => set({ governo: 'geral' })} titulo="Palácio do Governo (G)" />}
        <Chip icone="dinheiro" rotulo={st.estado ? (mundo.init?.capital === false ? 'Obras da cidade' : 'Obras da capital') : 'Caixa'} valor={st.sandbox ? 'ilimitado' : fmt.reais(st.caixa)} cor={!st.sandbox && st.caixa < 0 ? 'text-perigo' : 'text-acento-2'} onClick={() => set({ painel: 'financas' })} titulo={`Fundo do Programa de ${mundo.init?.cidade ?? 'Capital'} (Ctrl+F)`} />
        {saldo !== null && !st.sandbox && <span className="hidden xl:block"><Chip icone="grafico" rotulo="Último mês" valor={`${saldo >= 0 ? '+' : ''}${fmt.reais(saldo)}`} cor={saldo >= 0 ? 'text-acento' : 'text-perigo'} onClick={() => set({ painel: 'financas' })} /></span>}
        {(() => {
          const ap = st.estado ? st.estado.aprovacao : st.aprovacao;
          return <Chip icone="aprovacao" rotulo="Aprovação" valor={`${Math.round(ap)}%`} cor={ap >= 50 ? 'text-acento' : ap >= 35 ? 'text-acento-2' : 'text-perigo'} onClick={st.estado ? () => set({ governo: 'geral' }) : undefined} titulo={st.estado ? `Média ponderada de baixa renda, classe média, servidores e empresariado. Satisfação nos bairros da capital: ${Math.round(st.aprovacaoCidade)}%` : 'Satisfação nos novos bairros'} />;
        })()}
        <Chip icone="agua" rotulo="Redes" valor={`${cobertura(st)}%`} onClick={() => set({ painel: 'redes' })} titulo="Água, energia e esgoto (R)" />
        <span className="hidden xl:block"><Chip icone="rapido" rotulo="Deslocamento" valor={st.cidade.mobilidade.tempoMedio ? `${Math.round(st.cidade.mobilidade.tempoMedio)} min` : '—'} onClick={() => set({ painel: 'transporte' })} titulo="Mobilidade e transporte" /></span>
        <span className="hidden xl:block"><Chip icone="aprovacao" rotulo="Crime" valor={`${Math.round(st.cidade.servicos.crime * 100)}%`} cor={st.cidade.servicos.crime > 0.4 ? 'text-perigo' : 'text-texto'} onClick={() => set({ painel: 'seguranca' })} titulo="Segurança e território" /></span>
      </div>

      <div className="painel rounded-xl p-2.5 flex items-end gap-2 pointer-events-auto" title="Demanda RCI">
        <BarraDemanda v={st.demanda.r} cor="#5fbf4a" letra="R" />
        <BarraDemanda v={st.demanda.c} cor="#3f8fe0" letra="C" />
        <BarraDemanda v={st.demanda.i} cor="#e0b030" letra="I" />
      </div>
    </div>
  );
}

function cobertura(st: Stats) {
  const t = st.agua.total + st.energia.total;
  if (!t) return 100;
  return Math.round(((st.agua.atendidos + st.energia.atendidos) / t) * 100);
}

interface ItemFerramenta { id: string; nome: string; icone: string; f: Ferramenta; custo?: string; tecla?: string; cor?: string }

const GRUPOS: { id: string; nome: string; icone: string; itens: ItemFerramenta[] }[] = [
  {
    id: 'vias', nome: 'Vias', icone: 'estrada', itens: [
      { id: 'rua', nome: 'Rua', icone: 'reta', f: { tipo: 'via', via: 'rua', curva: false }, custo: `R$ ${fmt.int(ROAD_SPECS.rua.custoM)}/m` },
      { id: 'ruaC', nome: 'Rua em curva', icone: 'curva', f: { tipo: 'via', via: 'rua', curva: true }, custo: `R$ ${fmt.int(ROAD_SPECS.rua.custoM)}/m` },
      { id: 'av', nome: 'Avenida', icone: 'reta', f: { tipo: 'via', via: 'avenida', curva: false }, custo: `R$ ${fmt.int(ROAD_SPECS.avenida.custoM)}/m` },
      { id: 'avC', nome: 'Avenida em curva', icone: 'curva', f: { tipo: 'via', via: 'avenida', curva: true }, custo: `R$ ${fmt.int(ROAD_SPECS.avenida.custoM)}/m` },
    ],
  },
  {
    id: 'zonas', nome: 'Zonas', icone: 'zona', itens: [
      ...ZONES.slice(1).map((z) => ({ id: `z${z.id}`, nome: z.nome, icone: z.id === 3 ? 'loja' : z.id === 4 ? 'fabrica' : z.id === 2 ? 'predio' : 'casa', f: { tipo: 'zona', zona: z.id } as Ferramenta, cor: z.cor })),
      { id: 'z0', nome: 'Remover zona', icone: 'x', f: { tipo: 'zona', zona: 0 } },
    ],
  },
  grupoEquip('utilidades', 'Utilidades', 'agua', ['agua', 'energia', 'esgoto']),
  grupoEquip('servicos', 'Serviços', 'info', ['saude', 'educacao', 'lazer']),
  {
    ...grupoEquip('seguranca', 'Segurança', 'aprovacao', ['seguranca']),
    itens: [...grupoEquip('seguranca', 'Segurança', 'aprovacao', ['seguranca']).itens, { id: 'operacao', nome: 'Operação policial', icone: 'demolir', f: { tipo: 'operacao' }, cor: '#e5484d' }],
  },
  {
    id: 'transporte', nome: 'Transporte', icone: 'rapido',
    itens: (['onibus', 'brt', 'metro', 'teleferico'] as const).map((t) => ({
      id: t, nome: `Linha de ${TIPOS_LINHA[t].nome.toLowerCase()}`, icone: t === 'teleferico' ? 'curva' : 'estrada', f: { tipo: 'linha', linha: t } as Ferramenta,
      custo: TIPOS_LINHA[t].obra ? `obra estadual · R$ ${fmt.int(TIPOS_LINHA[t].obra!.custoKm / 1e6)} mi/km` : 'R$ 650 mil/ônibus',
    })),
  },
];

function grupoEquip(id: string, nome: string, icone: string, redes: Rede[]): { id: string; nome: string; icone: string; itens: ItemFerramenta[] } {
  const iconeRede: Record<Rede, string> = { agua: 'agua', energia: 'energia', esgoto: 'esgoto', lazer: 'lazer', saude: 'info', educacao: 'jornal', seguranca: 'aprovacao' };
  return { id, nome, icone, itens: EQUIPAMENTOS.filter((e) => redes.includes(e.rede)).map((e) => ({ id: e.id, nome: e.nome, icone: iconeRede[e.rede], f: { tipo: 'equipamento', eq: e.id } as Ferramenta, custo: fmt.reais(e.custo) })) };
}

function mesmaFerramenta(a: Ferramenta, b: Ferramenta) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function BarraFerramentas() {
  const ferramenta = useGame((s) => s.ferramenta);
  const camada = useGame((s) => s.camada);
  const raio = useGame((s) => s.raioPincel);
  const set = useGame((s) => s.set);
  const [grupo, setGrupo] = useState<string | null>(null);
  const [camadasAbertas, setCamadasAbertas] = useState(false);
  const [visualAberto, setVisualAberto] = useState(false);
  const g = GRUPOS.find((x) => x.id === grupo);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      const mapa: Record<string, string> = { v: 'vias', z: 'zonas' };
      if (mapa[e.key.toLowerCase()]) setGrupo((x) => (x === mapa[e.key.toLowerCase()] ? null : mapa[e.key.toLowerCase()]));
      if (e.key.toLowerCase() === 'b') set({ ferramenta: { tipo: 'demolir' } });
      if (e.key === '[') set({ raioPincel: Math.max(12, useGame.getState().raioPincel - 6) });
      if (e.key === ']') set({ raioPincel: Math.min(140, useGame.getState().raioPincel + 6) });
      if (e.key === 'Escape') setGrupo(null);
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [set]);

  const camadas: { id: Camada; nome: string }[] = [
    { id: 'nenhuma', nome: 'Nenhuma' }, { id: 'zonas', nome: 'Zonas' }, { id: 'agua', nome: 'Água' }, { id: 'energia', nome: 'Energia' },
    { id: 'esgoto', nome: 'Esgoto' }, { id: 'valor', nome: 'Valor do solo' }, { id: 'poluicao', nome: 'Poluição' }, { id: 'densidade', nome: 'Densidade' },
    { id: 'saude', nome: 'Saúde' }, { id: 'educacao', nome: 'Educação' }, { id: 'seguranca', nome: 'Policiamento' }, { id: 'crime', nome: 'Crime' },
    { id: 'territorio', nome: 'Território' }, { id: 'transito', nome: 'Trânsito' }, { id: 'transporte', nome: 'Transporte' },
  ];

  return (
    <div className="absolute bottom-12 inset-x-0 flex flex-col items-center gap-2 pointer-events-none px-3">
      {g && (
        <div className="painel rounded-xl p-2 flex gap-1.5 pointer-events-auto surgir flex-wrap justify-center max-w-full">
          {g.itens.map((it) => {
            const ativo = mesmaFerramenta(ferramenta, it.f);
            return (
              <button key={it.id} onClick={() => set({ ferramenta: ativo ? { tipo: 'nenhuma' } : it.f })}
                className={`w-28 rounded-lg p-2 text-left border transition-colors ${ativo ? 'border-acento bg-acento/15' : 'border-transparent hover:bg-white/8 hover:border-borda'}`}>
                <div className="flex items-center gap-1.5">
                  <Icone nome={it.icone} tamanho={18} className={ativo ? 'text-acento' : 'text-texto'} />
                  {it.cor && <i className="w-2.5 h-2.5 rounded-sm" style={{ background: it.cor }} />}
                </div>
                <div className="text-[11px] font-medium mt-1 leading-tight">{it.nome}</div>
                {it.custo && <div className="num text-xs text-acento-2 mt-0.5">{it.custo}</div>}
              </button>
            );
          })}
          {g.id === 'zonas' && (
            <div className="w-36 rounded-lg p-2 text-[11px] text-suave">
              Pincel: <span className="num text-texto">{raio} m</span>
              <input type="range" min={12} max={140} value={raio} onChange={(e) => set({ raioPincel: Number(e.target.value) })} className="w-full" />
              <div className="text-[10px]">Teclas [ e ] ajustam</div>
            </div>
          )}
        </div>
      )}
      {camadasAbertas && (
        <div className="painel rounded-xl p-2 flex gap-1 pointer-events-auto surgir flex-wrap justify-center">
          {camadas.map((c) => (
            <button key={c.id} onClick={() => set({ camada: c.id })} className={`px-3 py-1.5 rounded-md text-xs ${camada === c.id ? 'bg-acento text-tinta font-semibold' : 'text-suave hover:text-white hover:bg-white/5'}`}>{c.nome}</button>
          ))}
        </div>
      )}
      {visualAberto && <PainelVisual />}
      <div className="painel rounded-2xl p-1.5 flex gap-1 pointer-events-auto">
        {GRUPOS.map((gr) => (
          <button key={gr.id} onClick={() => { setGrupo(grupo === gr.id ? null : gr.id); setCamadasAbertas(false); setVisualAberto(false); }}
            className={`flex flex-col items-center w-16 py-1.5 rounded-xl ${grupo === gr.id ? 'bg-white/12 text-acento' : 'text-texto hover:bg-white/6'}`}>
            <Icone nome={gr.icone} tamanho={22} />
            <span className="text-[10px] mt-0.5">{gr.nome}</span>
          </button>
        ))}
        <div className="w-px bg-borda mx-1" />
        <button onClick={() => set({ governo: 'geral' })} className="flex flex-col items-center w-16 py-1.5 rounded-xl text-acento-2 hover:bg-white/6" title="Palácio do Governo (G)">
          <Icone nome="predio" tamanho={22} /><span className="text-[10px] mt-0.5">Governo</span>
        </button>
        <button onClick={() => set({ ferramenta: ferramenta.tipo === 'demolir' ? { tipo: 'nenhuma' } : { tipo: 'demolir' } })}
          className={`flex flex-col items-center w-16 py-1.5 rounded-xl ${ferramenta.tipo === 'demolir' ? 'bg-perigo/25 text-perigo' : 'text-texto hover:bg-white/6'}`} title="Demolir (B)">
          <Icone nome="demolir" tamanho={22} /><span className="text-[10px] mt-0.5">Demolir</span>
        </button>
        <button onClick={() => { setCamadasAbertas(!camadasAbertas); setGrupo(null); setVisualAberto(false); }}
          className={`flex flex-col items-center w-16 py-1.5 rounded-xl ${camada !== 'nenhuma' || camadasAbertas ? 'bg-white/12 text-acento' : 'text-texto hover:bg-white/6'}`}>
          <Icone nome="camadas" tamanho={22} /><span className="text-[10px] mt-0.5">Camadas</span>
        </button>
        <button onClick={() => { setVisualAberto(!visualAberto); setGrupo(null); setCamadasAbertas(false); }}
          className={`flex flex-col items-center w-16 py-1.5 rounded-xl ${visualAberto ? 'bg-white/12 text-acento' : 'text-texto hover:bg-white/6'}`}>
          <Icone nome="sol" tamanho={22} /><span className="text-[10px] mt-0.5">Visual</span>
        </button>
      </div>
    </div>
  );
}

function PainelVisual() {
  const horaAuto = useGame((s) => s.horaAuto);
  const hora = useGame((s) => s.hora);
  const luzSodio = useGame((s) => s.luzSodio);
  const tilt = useGame((s) => s.tiltShift);
  const set = useGame((s) => s.set);
  return (
    <div className="painel rounded-xl p-3 pointer-events-auto surgir w-80 text-sm">
      <div className="flex items-center justify-between">
        <span className="text-suave text-xs">Hora do dia</span>
        <label className="text-xs flex items-center gap-1.5"><input type="checkbox" checked={horaAuto} onChange={(e) => { if (!e.target.checked) set({ hora: ambiente.hora }); set({ horaAuto: e.target.checked }); }} /> automática</label>
      </div>
      <input type="range" min={0} max={23.9} step={0.1} value={horaAuto ? ambiente.hora : hora} disabled={horaAuto} onChange={(e) => set({ hora: Number(e.target.value) })} className="w-full" />
      <div className="flex gap-1.5 mt-2">
        {[{ h: 6.2, n: 'Amanhecer' }, { h: 12, n: 'Meio-dia' }, { h: 17.4, n: 'Golden hour' }, { h: 21, n: 'Noite' }].map((p) => (
          <button key={p.n} onClick={() => set({ horaAuto: false, hora: p.h })} className="flex-1 text-[11px] px-1.5 py-1 rounded bg-white/5 hover:bg-white/10">{p.n}</button>
        ))}
      </div>
      <div className="mt-3 text-suave text-xs mb-1">Iluminação pública</div>
      <div className="flex gap-1.5">
        <button onClick={() => set({ luzSodio: true })} className={`flex-1 px-2 py-1.5 rounded text-xs ${luzSodio ? 'bg-[#ffa63d] text-tinta font-semibold' : 'bg-white/5'}`}>Vapor de sódio</button>
        <button onClick={() => set({ luzSodio: false })} className={`flex-1 px-2 py-1.5 rounded text-xs ${!luzSodio ? 'bg-[#e9f1ff] text-tinta font-semibold' : 'bg-white/5'}`}>LED branco</button>
      </div>
      <div className="flex gap-1.5 mt-3">
        <button onClick={() => set({ tiltShift: !tilt })} className={`flex-1 px-2 py-1.5 rounded text-xs ${tilt ? 'bg-acento text-tinta font-semibold' : 'bg-white/5'}`}>Modo maquete (tilt-shift)</button>
        <button onClick={() => set({ modoFoto: true })} className="flex-1 px-2 py-1.5 rounded text-xs bg-white/5 flex items-center justify-center gap-1"><Icone nome="camera" tamanho={14} /> Modo foto (H)</button>
      </div>
    </div>
  );
}

function Ticker() {
  const noticias = useGame((s) => s.noticias);
  const set = useGame((s) => s.set);
  const itens = noticias.slice(0, 8);
  const texto = itens.length ? itens : [{ id: 0, data: '', texto: 'Bem-vindo(a) ao Palácio. Trace ruas, zoneie bairros e garanta água, luz e esgoto.', tom: 'info' as const }];
  const cor = { bom: 'text-acento', ruim: 'text-perigo', alerta: 'text-acento-2', info: 'text-texto' };
  const dur = Math.max(30, texto.reduce((s, n) => s + n.texto.length, 0) / 7);
  return (
    <div className="absolute bottom-0 inset-x-0 h-9 flex items-stretch bg-black/70 border-t border-borda pointer-events-auto overflow-hidden">
      <button onClick={() => set({ painel: 'noticias' })} className="titulo bg-perigo text-white px-3 text-sm font-bold flex items-center gap-1.5 shrink-0">
        <span className="w-2 h-2 rounded-full bg-white pulsar" /> Plantão N27
      </button>
      <div className="flex-1 overflow-hidden relative">
        <div className="ticker-run absolute whitespace-nowrap flex items-center h-full" style={{ animationDuration: `${dur}s` }} key={texto[0].id}>
          {[...texto, ...texto].map((n, i) => (
            <span key={i} className={`text-sm mx-6 ${cor[n.tom]}`}>
              {n.data && <span className="num text-suave mr-2">{n.data}</span>}{n.fonte && <span className="text-acento-2/80 mr-1.5">{n.fonte}:</span>}{n.texto}<span className="text-suave/40 ml-6">●</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Legenda das camadas novas (território e trânsito). */
function LegendaCamada() {
  const camada = useGame((s) => s.camada);
  if (camada !== 'territorio' && camada !== 'transito') return null;
  const itens = camada === 'territorio'
    ? [['#f5b942', 'Disputado'], [GRUPOS_CRIME[1].cor, `${GRUPOS_CRIME[1].nome} (facção)`], [GRUPOS_CRIME[2].cor, `${GRUPOS_CRIME[2].nome} (milícia)`], ['transparent', 'sem cor = presença do Estado']]
    : [['#3ee0b0', 'Livre'], ['#f5d142', 'Moderado'], ['#ff8a3d', 'Lento'], ['#e5484d', 'Parado']];
  return (
    <div className="painel rounded-lg px-3 py-2 text-[11px] pointer-events-none space-y-0.5 self-start">
      <div className="titulo text-xs text-suave">{camada === 'territorio' ? 'Controle territorial' : 'Trânsito no pico da manhã'}</div>
      {itens.map(([c, n]) => <div key={n} className="flex items-center gap-1.5"><i className="w-3 h-3 rounded-sm inline-block border border-white/20" style={{ background: c }} />{n}</div>)}
    </div>
  );
}

function InfoLote() {
  const sel = useGame((s) => s.loteSelecionado);
  useGame((s) => s.stateVersion);
  const set = useGame((s) => s.set);
  if (sel < 0) return null;
  const S = mundo.lotState, L = mundo.lots;
  const o = sel * LOT_STATE_STRIDE;
  if (o >= S.length) return null;
  const zona = S[o], arch = S[o + 1], prog = S[o + 2], andares = S[o + 3], flags = S[o + 5], lv = S[o + 6], occ = S[o + 7], pol = S[o + 8];
  const cobSaude = S[o + 9], cobEdu = S[o + 10], cobSeg = S[o + 11], crime = S[o + 12];
  const x = L[sel * LOT_STRIDE], z = L[sel * LOT_STRIDE + 1];
  const a = arch ? arquetipoPorId(arch) : null;
  const bairro = bairroEm(mundo.init!.seed, x, z);
  const edgeId = L[sel * LOT_STRIDE + 6];
  const rua = mundo.roads.edges.get(edgeId)?.name ?? 'Rua sem nome';
  const numero = (Math.round(Math.abs(x * 3.1 + z * 1.7)) % 1900) + 10;
  // Fase 11: prédio da cidade real (OpenStreetMap)
  const refReal = L[sel * LOT_STRIDE + 7] - 1;
  const pReal = refReal >= 0 && mundo.real ? predioReal(mundo.real, refReal) : null;
  const nomeReal = pReal?.nome ?? null;
  const pessoa = cidadao(sel * 7919 + Math.round(S[o + 4] * 1000));
  // controle territorial na célula do lote
  const ti = Math.min(TERR_RES - 1, Math.max(0, Math.floor((x + BUILD_HALF) / TERR_CELL)));
  const tj = Math.min(TERR_RES - 1, Math.max(0, Math.floor((z + BUILD_HALF) / TERR_CELL)));
  const tf = mundo.territorioF[tj * TERR_RES + ti] ?? 0, tm = mundo.territorioM[tj * TERR_RES + ti] ?? 0;
  const dominio = Math.max(tf, tm) < 0.25 ? null : tf >= tm ? GRUPOS_CRIME[1] : GRUPOS_CRIME[2];
  const disputado = tf > 0.25 && tm > 0.25;
  const abandonado = (flags & FLAG.ABANDONADO) !== 0;
  const pensamento = (() => {
    if (!a) return null;
    if (abandonado) return 'Prédio abandonado. Até os gatos foram embora.';
    if (prog < 1) return 'Obra em andamento — barulho de betoneira às 7h da manhã.';
    if (!(flags & FLAG.AGUA)) return 'Três dias sem água! Já liguei pra companhia umas vinte vezes. 😤';
    if (!(flags & FLAG.ENERGIA)) return 'Caiu a luz de novo. A geladeira não aguenta mais.';
    if (!(flags & FLAG.ESGOTO)) return 'O esgoto corre a céu aberto aqui na frente. Cadê o saneamento, governador?';
    if (dominio && dominio.tipo === 'milícia') return 'Aqui a gente paga taxa até pro gás e pra internet. Quem reclama some.';
    if (dominio) return 'Quando tem tiroteio, as crianças ficam sem aula. Ninguém fala nada, todo mundo sabe.';
    if (crime > 0.45) return 'Já me roubaram duas vezes no ponto de ônibus este ano.';
    if (a.moradores && cobSaude < 0.3) return 'O posto de saúde mais perto fica a uma hora de ônibus. Quando tem médico.';
    if (pol > 0.35) return 'Essa fumaceira das fábricas tá acabando com a minha rinite.';
    if (lv > 65) return 'Bairro valorizou demais. Meu aluguel subiu, mas a vista compensa.';
    if (a.moradores) return 'Tá tudo funcionando, graças a Deus. Agora só falta um metrô aqui perto.';
    return 'Movimento bom hoje. Se o governo baixar o ICMS, contrato mais gente!';
  })();
  const Selo = ({ ok, n }: { ok: boolean; n: string }) => <span className={`text-[10px] px-1.5 py-0.5 rounded ${ok ? 'bg-acento/15 text-acento' : 'bg-perigo/15 text-perigo'}`}>{n}</span>;
  return (
    <div className="absolute left-3 top-24 w-80 painel rounded-xl p-4 pointer-events-auto surgir">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[11px] text-suave">{rua}, {numero} — {bairro}</div>
          <div className="titulo text-xl font-semibold mt-0.5">{nomeReal ?? (a ? (abandonado ? `${a.nome} (abandonado)` : a.nome) : 'Lote vazio')}</div>
          <div className="text-xs text-suave">{ZONES[zona]?.nome ?? 'Sem zona'}{a ? ` · nível ${a.level} · ${andares} andar${andares > 1 ? 'es' : ''}` : ''}</div>
          {pReal && <div className="text-[10px] text-acento-2 mt-0.5">Prédio real · {TIPO_PREDIO[pReal.tipo]} · {Math.round(pReal.w)}×{Math.round(pReal.d)} m · © OpenStreetMap</div>}
        </div>
        <button onClick={() => set({ loteSelecionado: -1 })} className="text-suave hover:text-white"><Icone nome="x" tamanho={18} /></button>
      </div>
      {a && prog < 1 && (
        <div className="mt-3">
          <div className="text-[11px] text-suave mb-1">Obra {Math.round(prog * 100)}%</div>
          <div className="h-1.5 bg-white/10 rounded"><div className="h-full bg-acento-2 rounded" style={{ width: `${prog * 100}%` }} /></div>
        </div>
      )}
      {a && prog >= 1 && (
        <>
          <div className="grid grid-cols-2 gap-2 mt-3">
            <div className="bg-white/5 rounded-lg p-2"><div className="text-[10px] text-suave">{a.moradores ? 'Moradores' : 'Empregos'}</div><div className="num text-xl">{fmt.int(occ)} <span className="text-xs text-suave">/ {a.moradores || a.empregos}</span></div></div>
            <div className="bg-white/5 rounded-lg p-2"><div className="text-[10px] text-suave">Valor do solo</div><div className="num text-xl">{Math.round(lv)}<span className="text-xs text-suave">/100</span></div></div>
          </div>
          <div className="flex gap-1.5 mt-2 flex-wrap">
            <Selo ok={!!(flags & FLAG.AGUA)} n="Água" /><Selo ok={!!(flags & FLAG.ENERGIA)} n="Energia" /><Selo ok={!!(flags & FLAG.ESGOTO)} n="Esgoto tratado" /><Selo ok={pol < 0.25} n={`Poluição ${Math.round(pol * 100)}%`} />
          </div>
          <div className="grid grid-cols-4 gap-1.5 mt-2 text-center">
            {([['Saúde', cobSaude, false], ['Educação', cobEdu, false], ['Polícia', cobSeg, false], ['Crime', crime, true]] as [string, number, boolean][]).map(([n, v, inv]) => (
              <div key={n} className="bg-white/5 rounded-md py-1">
                <div className="text-[9px] text-suave">{n}</div>
                <div className={`num text-sm ${(inv ? v > 0.4 : v < 0.35) ? 'text-perigo' : (inv ? v < 0.2 : v > 0.7) ? 'text-acento' : 'text-acento-2'}`}>{Math.round(v * 100)}%</div>
              </div>
            ))}
          </div>
          {(dominio || disputado) && (
            <div className="mt-2 text-[11px] rounded-md px-2 py-1 border" style={{ borderColor: disputado ? '#f5b942' : dominio!.cor, color: disputado ? '#f5b942' : dominio!.cor }}>
              {disputado ? 'Área em disputa entre facção e milícia' : `Área dominada: ${dominio!.nome} (${dominio!.tipo}) · ${Math.round(Math.max(tf, tm) * 100)}%`}
            </div>
          )}
        </>
      )}
      {!a && <div className="text-xs text-suave mt-3">Valor do solo {Math.round(lv)}/100. {zona ? 'Aguardando demanda para construir.' : 'Use a ferramenta de Zonas para liberar construção.'}</div>}
      {pensamento && (
        <div className="mt-3 border-t border-borda pt-3 flex gap-2.5">
          <div className="w-9 h-9 rounded-full shrink-0 flex items-center justify-center titulo text-sm font-bold" style={{ background: `hsl(${(sel * 47) % 360} 45% 35%)` }}>{pessoa.nome.split(' ').map((p) => p[0]).join('')}</div>
          <div>
            <div className="text-xs"><b>{pessoa.nome}</b>, {pessoa.idade}, {pessoa.profissao}</div>
            <div className="text-xs text-texto/85 mt-0.5 italic">“{pensamento}”</div>
          </div>
        </div>
      )}
    </div>
  );
}

function LinhaLedger({ n, v, neg }: { n: string; v: number; neg?: boolean }) {
  return <div className="flex justify-between text-sm py-0.5"><span className="text-suave">{n}</span><span className={`num ${neg ? 'text-perigo/90' : 'text-texto'}`}>{neg ? '−' : ''}{fmt.reais(v)}</span></div>;
}

function PainelFinancas({ st }: { st: Stats }) {
  const L: Ledger | null = st.ultimoBalanco;
  const hist = st.historico;
  const max = Math.max(1, ...hist.map((h) => Math.abs(h.caixa)));
  return (
    <div className="w-[420px] max-w-full">
      <h3 className="titulo text-xl">Programa de Desenvolvimento Urbano da Capital</h3>
      <p className="text-xs text-suave mt-1">Fundo das obras da Visão Cidade. Recebe o repasse definido na LOA estadual e as receitas geradas pelos novos bairros. O orçamento do Estado inteiro fica no Palácio (tecla G). Valores mensais em R$.</p>
      {st.sandbox && <p className="text-acento mt-2 text-sm">Modo sandbox: caixa ilimitado.</p>}
      {L ? (
        <div className="grid grid-cols-2 gap-5 mt-4">
          <div>
            <div className="titulo text-xs text-acento mb-1">Receitas</div>
            <LinhaLedger n="ICMS (comércio/indústria)" v={L.receitas.icms} />
            <LinhaLedger n="ICMS consumo (energia, telecom)" v={L.receitas.consumo} />
            <LinhaLedger n="Tarifas água/esgoto" v={L.receitas.tarifas} />
            <LinhaLedger n={st.estado ? 'Repasse do Tesouro (LOA)' : 'Repasses (FPE)'} v={L.receitas.repasse} />
            <LinhaLedger n="Royalties" v={L.receitas.royalties} />
            <div className="border-t border-borda mt-1 pt-1"><LinhaLedger n="Total" v={somaReceitas(L)} /></div>
          </div>
          <div>
            <div className="titulo text-xs text-perigo mb-1">Despesas</div>
            <LinhaLedger n="Manutenção de vias" v={L.despesas.vias} neg />
            <LinhaLedger n="Custeio de equipamentos" v={L.despesas.equipamentos} neg />
            <LinhaLedger n="Serviço da dívida" v={L.despesas.divida} neg />
            <LinhaLedger n="Investimentos (obras)" v={L.investimentos} neg />
            <div className="border-t border-borda mt-1 pt-1"><LinhaLedger n="Total" v={somaDespesas(L) + L.investimentos} neg /></div>
          </div>
        </div>
      ) : <p className="text-sm text-suave mt-4">O primeiro balanço sai no dia 1º do próximo mês.</p>}
      {L && <div className={`mt-3 text-center titulo text-lg ${L.saldo >= 0 ? 'text-acento' : 'text-perigo'}`}>Resultado do mês: {L.saldo >= 0 ? '+' : ''}{fmt.reais(L.saldo)}</div>}
      <div className="mt-2 text-xs text-suave">Investido no mês corrente: <span className="num text-texto">{fmt.reais(st.mesCorrente.investimentos)}</span></div>
      {hist.length > 1 && (
        <div className="mt-4">
          <div className="text-[11px] text-suave mb-1">Caixa e população — últimos {hist.length} meses</div>
          <svg viewBox={`0 0 ${hist.length * 10} 60`} className="w-full h-24" preserveAspectRatio="none">
            <line x1="0" x2={hist.length * 10} y1="30" y2="30" stroke="rgba(255,255,255,0.15)" strokeWidth="0.5" />
            {hist.map((h, i) => <rect key={i} x={i * 10 + 2} width="6" y={h.caixa >= 0 ? 30 - (h.caixa / max) * 28 : 30} height={Math.abs(h.caixa / max) * 28} fill={h.caixa >= 0 ? '#3ee0b0' : '#ff6b5b'} opacity="0.7" />)}
            <polyline fill="none" stroke="#f5b942" strokeWidth="1.2" vectorEffect="non-scaling-stroke"
              points={hist.map((h, i) => `${i * 10 + 5},${58 - (h.populacao / Math.max(1, ...hist.map((x) => x.populacao))) * 54}`).join(' ')} />
          </svg>
          <div className="flex gap-4 text-[10px] text-suave"><span className="text-acento">■ caixa</span><span className="text-acento-2">— população</span></div>
        </div>
      )}
    </div>
  );
}

function BarraRede({ nome, r, cor, extra }: { nome: string; r: Stats['agua']; cor: string; extra?: string }) {
  const uso = r.capacidade > 0 ? r.uso / r.capacidade : r.uso > 0 ? 1.5 : 0;
  const cobertura = r.total ? r.atendidos / r.total : 1;
  return (
    <div className="mt-3">
      <div className="flex justify-between text-sm"><span>{nome}</span><span className="num text-suave">{fmt.int(r.uso)} / {fmt.int(r.capacidade)} un.</span></div>
      <div className="h-2 bg-white/10 rounded mt-1 overflow-hidden"><div className="h-full rounded transition-all" style={{ width: `${Math.min(100, uso * 100)}%`, background: uso > 1 ? '#ff6b5b' : cor }} /></div>
      <div className="text-[11px] text-suave mt-0.5">{fmt.pct(cobertura)} dos imóveis atendidos{uso > 1 ? ' — capacidade estourada!' : ''}{extra ? ` · ${extra}` : ''}</div>
    </div>
  );
}

function PainelRedes({ st }: { st: Stats }) {
  return (
    <div className="w-[380px] max-w-full">
      <h3 className="titulo text-xl">Redes de serviço</h3>
      <p className="text-xs text-suave mt-1">As redes seguem as vias. Cada malha viária conectada é uma rede; equipamentos só atendem a malha em que estão ligados.</p>
      <BarraRede nome="Água" r={st.agua} cor="#3fa9f5" />
      <BarraRede nome="Energia" r={st.energia} cor="#ffd23f" />
      <BarraRede nome="Esgoto tratado" r={st.esgoto} cor="#4cc36a" extra={`${fmt.pct(1 - st.esgoto.tratadoPct)} vai in natura para a água`} />
      <div className="mt-4">
        <div className="flex justify-between text-sm"><span>Poluição da água (praias/baía)</span><span className="num">{fmt.pct(st.poluicaoAgua)}</span></div>
        <div className="h-2 rounded mt-1" style={{ background: 'linear-gradient(90deg,#2f8fb0,#6b6a3a)' }}>
          <div className="w-1 h-full bg-white" style={{ marginLeft: `${st.poluicaoAgua * 100}%` }} />
        </div>
        <div className="text-[11px] text-suave mt-1">Começa no nível real de saneamento da UF ({mundo.init?.esgotoUF}% de esgoto coletado, SNIS).</div>
      </div>
    </div>
  );
}

function PainelNoticias() {
  const noticias = useGame((s) => s.noticias);
  const cor = { bom: 'border-acento', ruim: 'border-perigo', alerta: 'border-acento-2', info: 'border-white/20' };
  return (
    <div className="w-[440px] max-w-full">
      <h3 className="titulo text-xl">Plantão N27 — últimas notícias</h3>
      <div className="mt-3 flex flex-col gap-2 max-h-[55vh] overflow-auto pr-1">
        {noticias.length === 0 && <p className="text-sm text-suave">Nada no ar ainda.</p>}
        {noticias.map((n) => (
          <div key={n.id} className={`border-l-2 ${cor[n.tom]} pl-3 py-1`}>
            <div className="num text-[11px] text-suave">{n.data}{n.fonte && <span className="text-acento-2/80"> · {n.fonte}</span>}</div>
            <div className="text-sm">{n.texto}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Toasts() {
  const toasts = useGame((s) => s.toasts);
  return (
    <div className="absolute top-24 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 pointer-events-none">
      {toasts.map((t) => (
        <div key={t.id} className={`painel rounded-lg px-4 py-2 text-sm surgir ${t.tom === 'erro' ? 'text-perigo' : t.tom === 'ok' ? 'text-acento' : 'text-texto'}`}>{t.texto}</div>
      ))}
    </div>
  );
}

function MenuPausa({ onFechar }: { onFechar: () => void }) {
  const irPara = useApp((s) => s.irPara);
  const toast = useGame((s) => s.toast);
  const salvar = async (exportar: boolean) => {
    const save = await pedirSave();
    await salvarLocal(save, 'manual');
    if (exportar) exportarArquivo(save);
    toast(exportar ? 'Jogo salvo e exportado (.nacao)' : 'Jogo salvo', 'ok');
    onFechar();
  };
  return (
    <div className="absolute inset-0 bg-black/55 flex items-center justify-center pointer-events-auto" onClick={onFechar}>
      <div className="painel rounded-2xl p-6 w-80 surgir" onClick={(e) => e.stopPropagation()}>
        <h2 className="titulo text-3xl font-bold">Pausa</h2>
        <div className="flex flex-col gap-2 mt-4">
          <button onClick={onFechar} className="px-4 py-2.5 rounded-lg bg-acento text-tinta font-semibold">Voltar ao jogo</button>
          <button onClick={() => salvar(false)} className="px-4 py-2.5 rounded-lg bg-white/5 hover:bg-white/10 flex items-center gap-2"><Icone nome="salvar" tamanho={16} /> Salvar</button>
          <button onClick={() => salvar(true)} className="px-4 py-2.5 rounded-lg bg-white/5 hover:bg-white/10 flex items-center gap-2"><Icone nome="exportar" tamanho={16} /> Salvar e exportar .nacao</button>
          <button onClick={() => irPara('menu')} className="px-4 py-2.5 rounded-lg bg-white/5 hover:bg-perigo/20 text-perigo">Sair para o menu</button>
        </div>
        <div className="mt-5 pt-4 border-t border-borda text-sm">
          <details>
            <summary className="cursor-pointer text-xs text-suave hover:text-white">Opções (acessibilidade, gráficos, tutorial, som)</summary>
            <OpcoesGerais />
          </details>
          <NuvemCidade />
        </div>
        <div className="mt-4 text-[10px] text-suave leading-relaxed">
          Atalhos: WASD/setas mover · Q/E girar · R/F zoom · Espaço pausa · 1/2/3 velocidade · V vias · Z zonas · B demolir · [ ] pincel · H modo foto · Esc cancelar
        </div>
      </div>
    </div>
  );
}

/** Tutorial e dicas da chefe de gabinete (Fase 10). */
function AssessorCidade({ st }: { st: Stats }) {
  const governo = useGame((s) => s.governo);
  const velocidade = useGame((s) => s.velocidade);
  const ctx = { stats: st, governo, equipamentos: mundo.services.map((x) => x.eq), velocidade };
  return <Assessor modo={st.estado ? 'estado' : 'cidade'} quem={ASSESSOR_CIDADE} passos={PASSOS_CIDADE} dicas={DICAS_CIDADE} ctx={ctx} />;
}

/** Save da cidade/estado na nuvem (Fase 9). */
function NuvemCidade() {
  const s = useSessao();
  const [msg, setMsg] = useState('');
  if (!nuvemConfigurada()) return null;
  return (
    <div className="mt-3 pt-3 border-t border-borda text-xs">
      <div className="text-suave mb-1">Nuvem</div>
      <Login s={s}>
        <button className="mt-2 w-full px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10" onClick={async () => { setMsg('Enviando…'); try { const sv = await pedirSave(); await salvarNuvem('cidade', `${sv.init.cidade} — ${sv.init.sigla} (${new Date().toLocaleDateString('pt-BR')})`, JSON.stringify(sv)); setMsg('Salvo na nuvem.'); } catch (e) { setMsg(String(e)); } }}>Salvar na nuvem</button>
      </Login>
      {msg && <div className="text-acento-2 mt-1">{msg}</div>}
    </div>
  );
}

/** Faixa de alertas do Estado (LRF, mínimos, caixa) e chamada para a LOA. */
function AlertasEstado() {
  const e = useGame((s) => s.stats?.estado ?? null);
  const set = useGame((s) => s.set);
  if (!e) return null;
  const janela = e.loaStatus === 'janela' || e.loaStatus === 'duodecimos';
  if (!janela && e.alertas.length === 0) return null;
  return (
    <div className="absolute top-[5.5rem] right-3 flex flex-col items-end gap-1.5 pointer-events-auto max-w-sm">
      {janela && (
        <button onClick={() => set({ governo: 'orcamento' })} className="painel rounded-lg px-3 py-2 text-sm text-acento-2 border-acento-2/40 flex items-center gap-2 pulsar">
          <Icone nome="jornal" tamanho={16} /> {e.loaStatus === 'duodecimos' ? 'Sem orçamento: envie nova LOA à ALE' : `Elabore a LOA ${e.ano + 1} até 31/08`}
        </button>
      )}
      {e.alertas.slice(0, 3).map((a) => (
        <button key={a} onClick={() => set({ governo: 'geral' })} className="painel rounded-lg px-3 py-1.5 text-xs text-perigo text-left">⚠ {a}</button>
      ))}
    </div>
  );
}

export function Hud() {
  const st = useGame((s) => s.stats);
  const painel = useGame((s) => s.painel);
  const modoFoto = useGame((s) => s.modoFoto);
  const set = useGame((s) => s.set);
  const escalaUI = useApp((s) => s.escalaUI);
  const [pausa, setPausa] = useState(false);
  const governo = useGame((s) => s.governo);
  const velAntes = useMemo(() => ({ v: 1 }), []);
  const ctxConquistas = useMemo(() => () => { const s = useGame.getState().stats; return s ? { stats: s } : null; }, []);
  useConquistas(ctxConquistas);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      const g = useGame.getState();
      if (e.key === ' ') { e.preventDefault(); if (g.velocidade > 0) { velAntes.v = g.velocidade; setVelocidade(0); } else setVelocidade(velAntes.v || 1); }
      if (e.key === '1') setVelocidade(1);
      if (e.key === '2') setVelocidade(2);
      if (e.key === '3') setVelocidade(4);
      if (e.key.toLowerCase() === 'h') g.set({ modoFoto: !g.modoFoto });
      if (e.key.toLowerCase() === 'g' && !e.ctrlKey) g.set({ governo: g.governo ? null : 'geral' });
      if (e.key.toLowerCase() === 'f' && e.ctrlKey) g.set({ painel: g.painel === 'financas' ? 'nenhum' : 'financas' });
      if (e.key === 'Escape' && !e.defaultPrevented && g.ferramenta.tipo === 'nenhuma' && g.loteSelecionado < 0) {
        if (g.governo) g.set({ governo: null });
        else if (g.painel !== 'nenhum') g.set({ painel: 'nenhum' });
        else setPausa((p) => !p);
      }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [velAntes]);

  if (!st || !mundo.init) return null;
  if (modoFoto) {
    return (
      <div className="absolute bottom-4 right-4 text-xs text-white/60 pointer-events-auto">
        <button onClick={() => set({ modoFoto: false })} className="painel rounded-lg px-3 py-1.5">Sair do modo foto (H)</button>
      </div>
    );
  }
  return (
    <div className="absolute inset-0 pointer-events-none origin-top-left" style={{ transform: `scale(${escalaUI})`, width: `${100 / escalaUI}%`, height: `${100 / escalaUI}%` }}>
      <BarraSuperior st={st} onMenu={() => setPausa(true)} />
      <InfoLote />
      <FavelaInfo />
      <BarraLinha />
      {/* canto inferior esquerdo: legenda da camada e o assessor (Fase 10) */}
      <div className="absolute left-3 bottom-[3.2rem] flex flex-col gap-2 items-start pointer-events-none">
        <LegendaCamada />
        <AssessorCidade st={st} />
      </div>
      <BannerFesta st={st} />
      {mundo.init?.cidadeReal && (
        <div className="absolute right-2 bottom-10 text-[9px] text-white/55 pointer-events-none" style={{ textShadow: '0 1px 2px #000' }}>
          Ruas e prédios © colaboradores do OpenStreetMap (ODbL) · contornos de satélite © Microsoft (ODbL) · relevo SRTM/Mapzen
        </div>
      )}
      {painel === 'nenhum' && !governo && <PainelDecisoes st={st} />}
      {painel !== 'nenhum' && (
        <div className="absolute right-3 top-24 painel rounded-xl p-5 pointer-events-auto surgir max-h-[calc(100%-12rem)] overflow-auto">
          <button onClick={() => set({ painel: 'nenhum' })} className="absolute top-3 right-3 text-suave hover:text-white"><Icone nome="x" tamanho={18} /></button>
          {painel === 'financas' && <PainelFinancas st={st} />}
          {painel === 'redes' && <PainelRedes st={st} />}
          {painel === 'noticias' && <PainelNoticias />}
          {painel === 'transporte' && <PainelTransporte st={st} />}
          {painel === 'seguranca' && <PainelSeguranca st={st} />}
          {painel === 'habitacao' && <PainelHabitacao st={st} />}
        </div>
      )}
      <AlertasEstado />
      <BarraFerramentas />
      <Toasts />
      <Ticker />
      {governo && <PainelGoverno key={governo} abaInicial={governo} onFechar={() => set({ governo: null })} />}
      {pausa && <MenuPausa onFechar={() => setPausa(false)} />}
      <TrilhaSonora />
      <AvisoEleicao />
      <FimDeMandato />
    </div>
  );
}

/** Fim de jogo (derrota, sucessão, fim dos mandatos ou impeachment): tela de legado. */
function FimDeMandato() {
  const L = useGame((s) => s.stats?.estado?.legado ?? null);
  const st = useGame((s) => s.stats);
  const irPara = useApp((s) => s.irPara);
  const [fechado, setFechado] = useState(false);
  useEffect(() => { if (L) setVelocidade(0); }, [L?.motivo]);
  if (!L || !st || fechado) return null;
  const presidencia = () => {
    const e = st.estado;
    if (!e) return;
    const fimAno = Number(L.periodo.match(/(\d{4})\D*$/)?.[1] ?? e.ano);
    useApp.setState({ carreira: { uf: (mundo.init?.sigla ?? 'DF') as SiglaUF, aprovacao: L.aprovacao.final, partido: e.partidoGov, ano: fimAno + 1 }, selecionada: null });
    irPara('presidente-setup');
  };
  return <TelaLegado L={L} st={st} onMenu={() => irPara('menu')} onFechar={() => setFechado(true)} onPresidencia={st.estado ? presidencia : undefined} />;
}

/** Aviso de eleição: convenção aberta, debate ao vivo ou dias até a urna. */
function AvisoEleicao() {
  const e = useGame((s) => s.stats?.estado?.eleicao ?? null);
  const mes = useGame((s) => s.stats?.mes ?? 1);
  const set = useGame((s) => s.set);
  if (!e || e.fase === 'encerrada' || mes < 3 && e.fase === 'pre') return null;
  const jog = e.candidatos.find((c) => c.doJogador);
  const conv = e.opcoesSucessor.length > 0 && (e.decisao === null || (e.decisao === 'sucessor' && jog?.origem !== 'sucessor'));
  const deb = e.debates.some((d) => !d.concluido);
  const txt = deb ? '🔴 Debate ao vivo — responder' : conv ? 'Convenção: reeleição ou sucessor?' : e.fase === 'apurado' ? 'Eleição decidida — ver apuração' : e.fase === 'segundoTurno' ? 'Campanha do 2º turno' : e.fase === 'campanha' ? 'Campanha eleitoral' : `Pré-campanha ${e.ano}`;
  return (
    <button onClick={() => set({ governo: 'eleicao' })} className={`absolute left-3 top-[5.6rem] painel rounded-lg px-3 py-1.5 text-xs pointer-events-auto ${deb || conv ? 'text-perigo border-perigo/50 pulsar' : 'text-acento-2'}`}>{txt}</button>
  );
}
