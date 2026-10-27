/**
 * Aba Relações (Fase 6): prefeitos das maiores cidades, Presidente da República, imprensa e a
 * pesquisa mensal do Instituto Pulso — todos fictícios — com convênios, pedidos a Brasília,
 * verba de publicidade e entrevista coletiva.
 */
import { useState } from 'react';
import { fmt } from '../../app/store';
import { comando, useGame } from '../../sim/bridge';
import { PARTIDOS } from '../../sim/politica/dados';
import type { EstadoSnapshot } from '../../sim/estado/tipos';
import { bi, Botao } from './comum';
import { Retrato } from './Retrato';

const relTxt = (r: number) => (r > 0.45 ? 'aliado' : r > 0.15 ? 'próximo' : r > -0.15 ? 'neutro' : r > -0.45 ? 'distante' : 'hostil');
const corRel = (r: number) => (r > 0.15 ? '#3ee0b0' : r > -0.15 ? '#f5b942' : '#ff6b5b');
const humorTxt = (h: number) => (h > 0.35 ? 'simpático ao governo' : h > 0.05 ? 'equilibrado' : h > -0.3 ? 'crítico' : 'hostil');
const TIPO_VEICULO = { tv: 'TV aberta', jornal: 'Jornal', portal: 'Portal', blog: 'Blog investigativo', influencer: 'Influenciador', zap: 'WhatsApp' };

function BarraRel({ r }: { r: number }) {
  return (
    <div className="h-1.5 bg-white/8 rounded relative">
      <div className="absolute top-0 bottom-0 rounded" style={{ left: r >= 0 ? '50%' : `${50 + r * 50}%`, width: `${Math.abs(r) * 50}%`, background: corRel(r) }} />
      <div className="absolute top-0 bottom-0 w-px bg-white/30 left-1/2" />
    </div>
  );
}

function Pesquisas({ s }: { s: EstadoSnapshot }) {
  const ps = [...s.atores.pesquisas].reverse();
  if (!ps.length) return <div className="text-xs text-suave">A primeira pesquisa sai no fim do mês.</div>;
  const W = 300, H = 90;
  const x = (i: number) => (ps.length < 2 ? W / 2 : (i / (ps.length - 1)) * W);
  const y = (v: number) => H - (v / 100) * H;
  const ult = ps[ps.length - 1];
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H + 4}`} className="w-full h-24">
        <line x1="0" x2={W} y1={y(50)} y2={y(50)} stroke="#ffffff22" strokeDasharray="3 3" />
        <polyline fill="none" stroke="#3ee0b0" strokeWidth="2" points={ps.map((p, i) => `${x(i)},${y(p.aprovacao)}`).join(' ')} />
        {ps.map((p, i) => <circle key={i} cx={x(i)} cy={y(p.aprovacao)} r="2.2" fill="#3ee0b0" />)}
      </svg>
      <div className="flex justify-between text-[11px] mt-1">
        <span>Aprova: <b className="num">{Math.round(ult.aprovacao)}%</b> <span className="text-suave">±{ult.margem}</span></span>
        <span className="text-suave">ótimo/bom {Math.round(ult.otimoBom)}% · regular {Math.round(ult.regular)}% · ruim/péssimo {Math.round(ult.ruimPessimo)}%</span>
      </div>
    </div>
  );
}

export function Relacoes({ s }: { s: EstadoSnapshot }) {
  const toast = useGame((g) => g.toast);
  const a = s.atores;
  const [valorConv, setValorConv] = useState(Math.round(s.rcl12 * 0.0003 / 1e6) * 1e6);
  const [pub, setPub] = useState(a.publicidade);
  const acao = async (x: Parameters<typeof comando>[0]) => { const r = await comando(x); toast(r.msg ?? (r.ok ? 'Feito' : 'Não foi possível'), r.ok ? 'ok' : 'erro'); };
  const P = a.presidente;
  const maxPub = 12e6 * Math.min(3, Math.max(0.4, s.rcl12 / 40e9));
  return (
    <div className="space-y-4">
      <div className="grid lg:grid-cols-[1fr_340px] gap-4">
        <div className="rounded-xl bg-white/[0.03] p-3">
          <div className="flex justify-between items-center mb-2">
            <div className="text-xs text-suave">Prefeitos das maiores cidades</div>
            <div className="flex items-center gap-2 text-[11px]">
              <span className="text-suave">Convênio de</span>
              <input type="range" min={1e6} max={Math.max(2e6, s.rcl12 * 0.002)} step={1e6} value={valorConv} onChange={(e) => setValorConv(Number(e.target.value))} className="w-28" />
              <span className="num w-20 text-right">{bi(valorConv)}</span>
            </div>
          </div>
          <div className="space-y-2">
            {a.prefeitos.map((p, i) => (
              <div key={p.cidade} className="flex items-center gap-3">
                <Retrato semente={p.retrato} genero={p.genero} idade={p.idade} cor={PARTIDOS[p.partido].cor} tamanho={38} titulo={p.nome} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm leading-tight"><b>{p.cidade}</b>{p.capital && <span className="ml-1 text-[10px] text-acento-2">capital</span>} <span className="text-[11px] text-suave">· {p.nome} ({PARTIDOS[p.partido].sigla}) · {fmt.int(p.populacao)} hab.</span></div>
                  <div className="flex items-center gap-2"><div className="flex-1"><BarraRel r={p.relacao} /></div><span className="text-[10px] w-14" style={{ color: corRel(p.relacao) }}>{relTxt(p.relacao)}</span></div>
                </div>
                <Botao onClick={() => acao({ kind: 'estado', acao: { tipo: 'convenio', prefeito: i, valor: valorConv } })} titulo="Convênio: obra ou serviço da prefeitura pago pelo Estado (sai do caixa no mês seguinte)">Convênio</Botao>
              </div>
            ))}
          </div>
          {a.prefeitos[0] && a.prefeitos[0].ambicao > 0.65 && <p className="text-[10px] text-suave mt-2">O(A) prefeito(a) da capital tem ambição de chegar ao Palácio — espere oposição a partir de 2029.</p>}
        </div>

        <div className="space-y-3">
          <div className="rounded-xl bg-white/[0.03] p-3">
            <div className="text-xs text-suave mb-2">Presidente da República</div>
            <div className="flex gap-3 items-center">
              <Retrato semente={P.retrato} genero={P.genero} idade={P.idade} cor={PARTIDOS[P.partido].cor} tamanho={52} titulo={P.nome} />
              <div className="min-w-0">
                <div className="text-sm font-semibold leading-tight">{P.nome}</div>
                <div className="text-[11px] text-suave">{PARTIDOS[P.partido].nome} · {P.alinhamento === 'aliado' ? 'aliado do governador' : P.alinhamento === 'opositor' ? 'adversário político' : 'neutro'}</div>
                <div className="text-[11px]">Popularidade no estado: <b className="num">{Math.round(P.popularidade)}%</b></div>
              </div>
            </div>
            <div className="flex items-center gap-2 mt-2"><div className="flex-1"><BarraRel r={P.relacao} /></div><span className="text-[10px]" style={{ color: corRel(P.relacao) }}>{relTxt(P.relacao)}</span></div>
            <p className="text-[10px] text-suave mt-1">A relação mexe nas transferências voluntárias da União (±12%), na Força Nacional e no socorro em desastres.</p>
            <div className="flex flex-wrap gap-1.5 mt-2">
              <Botao onClick={() => acao({ kind: 'estado', acao: { tipo: 'federal', pedido: 'forca-nacional' } })} desativado={a.forcaNacional > 0} titulo="3 de capital político">{a.forcaNacional > 0 ? `Força Nacional (${a.forcaNacional} meses)` : 'Pedir Força Nacional'}</Botao>
              <Botao onClick={() => acao({ kind: 'estado', acao: { tipo: 'federal', pedido: 'convenio' } })} titulo="Uma vez por ano · 3 de capital político">Pedir verba federal</Botao>
              <Botao onClick={() => acao({ kind: 'estado', acao: { tipo: 'federal', pedido: 'socorro' } })} desativado={a.calamidade <= 0} titulo="Só com decreto de calamidade em vigor">Socorro federal</Botao>
            </div>
            <div className="flex gap-1.5 mt-1.5">
              <Botao onClick={() => acao({ kind: 'estado', acao: { tipo: 'presidente', postura: 'apoiar' } })}>Elogiar em público</Botao>
              <Botao tom="perigo" onClick={() => acao({ kind: 'estado', acao: { tipo: 'presidente', postura: 'criticar' } })}>Criticar em público</Botao>
            </div>
          </div>
          <div className="rounded-xl bg-white/[0.03] p-3">
            <div className="text-xs text-suave mb-1">Pesquisa Instituto Pulso</div>
            <Pesquisas s={s} />
          </div>
        </div>
      </div>

      <div className="rounded-xl bg-white/[0.03] p-3">
        <div className="flex flex-wrap justify-between items-center gap-2 mb-2">
          <div className="text-xs text-suave">Imprensa — {s.amplificador > 0.1 ? <span className="text-perigo">a cobertura amplifica as notícias ruins</span> : s.amplificador < -0.1 ? <span className="text-acento">a cobertura suaviza as notícias ruins</span> : 'cobertura equilibrada'}</div>
          <Botao onClick={() => acao({ kind: 'estado', acao: { tipo: 'coletiva' } })} titulo="Uma por mês; o resultado depende da aprovação e da Casa Civil">Entrevista coletiva</Botao>
        </div>
        <div className="grid md:grid-cols-3 gap-2">
          {a.imprensa.map((v) => (
            <div key={v.id} className="rounded-lg border border-borda p-2 flex gap-2">
              <Retrato semente={v.rosto.retrato} genero={v.rosto.genero} idade={v.rosto.idade} tamanho={36} cor={corRel(v.humor)} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold leading-tight truncate">{v.nome}</div>
                <div className="text-[10px] text-suave truncate">{TIPO_VEICULO[v.id]} · alcance {Math.round(v.alcance * 100)}% · {v.rosto.nome}, {v.rosto.funcao}</div>
                <div className="flex items-center gap-2 mt-0.5"><div className="flex-1"><BarraRel r={v.humor} /></div><span className="text-[10px]" style={{ color: corRel(v.humor) }}>{humorTxt(v.humor)}</span></div>
              </div>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-3 mt-3">
          <span className="text-[11px] text-suave whitespace-nowrap">Publicidade oficial</span>
          <input type="range" min={0} max={maxPub} step={2e5} value={pub} onChange={(e) => setPub(Number(e.target.value))} className="flex-1" />
          <span className="num w-24 text-right text-sm">{bi(pub)}/mês</span>
          <Botao onClick={() => acao({ kind: 'estado', acao: { tipo: 'publicidade', valor: pub } })}>Aplicar</Botao>
        </div>
        <p className="text-[10px] text-suave mt-1">Verba alta acalma TV, portal e influenciadores — o blog investigativo fica mais desconfiado, e gastos exagerados viram escândalo.</p>
      </div>
      <p className="text-[10px] text-suave">Prefeitos, Presidente, veículos e jornalistas são fictícios; as cidades e populações são reais (IBGE).</p>
    </div>
  );
}
