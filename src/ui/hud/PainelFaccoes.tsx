/**
 * Painel de facções e instituições (Fase 26), aberto junto com o mapa de território (tecla T). Quatro abas: Facções (poder,
 * armamento, dinheiro, influência, rivais e aliados, fontes de renda), Territórios (polígonos de bairro e quem domina),
 * Instituições (o Estado: PM, Civil, PF, Guarda, Exército, Marinha, Aeronáutica, Bombeiros, SAMU) e Ocorrências (despacho e
 * tempo de chegada). Tom de simulação crítica: a conta humana aparece junto com os números. Os valores vêm de
 * src/data/seguranca/*.json — para balancear, edite lá.
 */
import { useState } from 'react';
import { fmt } from '../../app/store';
import { useGame } from '../../sim/bridge';
import { DADOS, IDS_FACCAO } from '../../sim/faccoes/dados';
import type { Ocorrencia } from '../../sim/faccoes/tipos';
import { Icone } from '../Icone';

const ABAS = ['Facções', 'Territórios', 'Instituições', 'Ocorrências'] as const;
type Aba = (typeof ABAS)[number];

const Barra = ({ v, cor }: { v: number; cor: string }) => (
  <div className="h-1.5 bg-white/10 rounded"><div className="h-full rounded" style={{ width: `${Math.min(100, Math.max(0, v * 100))}%`, background: cor }} /></div>
);

export function PainelFaccoes() {
  const camada = useGame((s) => s.camada);
  const st = useGame((s) => s.stats);
  const set = useGame((s) => s.set);
  const [aba, setAba] = useState<Aba>('Facções');
  if (camada !== 'territorio' || !st?.cidade.faccoes) return null;
  const F = st.cidade.faccoes;
  const nomeDe = (id: string) => DADOS.faccoes.faccoes[id]?.nome ?? id;
  const tipoOc = (t: string) => DADOS.ocorrencias.tipos[t]?.nome ?? t;
  const I = DADOS.instituicoes;

  return (
    <div className="absolute right-3 top-24 w-[372px] max-h-[calc(100vh-9rem)] overflow-y-auto painel rounded-xl p-3 pointer-events-auto surgir" style={{ zIndex: 44 }} onPointerDown={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between">
        <div className="titulo text-base font-semibold">Facções e instituições</div>
        <button onClick={() => set({ camada: 'nenhuma' })} className="text-suave hover:text-white" aria-label="Fechar (T)"><Icone nome="x" tamanho={18} /></button>
      </div>
      <div className="text-[11px] text-suave mt-0.5">T liga e desliga o mapa. Sob o Estado: <b className="text-texto">{fmt.pct(F.estado)}</b> da população · {F.conflitosHoje} frentes de conflito hoje · {fmt.int(F.mortosTotal)} mortes em ocorrências desde o início.</div>
      <div className="flex gap-1 mt-2">
        {ABAS.map((a) => <button key={a} onClick={() => setAba(a)} className={`flex-1 text-[11px] rounded px-1.5 py-1 border ${aba === a ? 'bg-acento/20 border-acento text-acento' : 'border-borda hover:bg-white/5'}`}>{a}</button>)}
      </div>

      {aba === 'Facções' && (
        <div className="mt-2 space-y-2">
          {F.faccoes.map((f) => (
            <div key={f.id} className="rounded-lg border p-2" style={{ borderColor: `${f.cor}88` }}>
              <div className="flex items-center justify-between">
                <div className="font-semibold flex items-center gap-1.5"><i className="w-3 h-3 rounded-sm inline-block" style={{ background: f.cor }} />{f.nome} <span className="text-[10px] text-suave font-normal">{f.tipo}</span></div>
                <div className="text-[11px] text-suave">{fmt.pct(f.populacao, 1)} da população · {f.unidades} bairros</div>
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 mt-1.5 text-[11px]">
                <div>Poder <b>{Math.round(f.poder * 100)}</b><Barra v={f.poder} cor={f.cor} /></div>
                <div>Armamento <b>{Math.round(f.armamento)}</b><Barra v={f.armamento / 100} cor={f.cor} /></div>
                <div>Influência política <b>{Math.round(f.influencia)}</b><Barra v={f.influencia / 100} cor={f.cor} /></div>
                <div>Caixa <b>R$ {f.dinheiro.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} mi</b></div>
              </div>
              <div className="text-[10px] text-suave mt-1.5">Renda/dia: tráfico {fmt.reais(f.renda.trafico)} · taxas {fmt.reais(f.renda.taxas)} · gatonet {fmt.reais(f.renda.gatonet)} · transporte alternativo {fmt.reais(f.renda.transporteAlternativo)}</div>
              <div className="text-[11px] mt-1">
                {f.emGuerraCom.length > 0 && <span className="text-red-300">Em guerra: {f.emGuerraCom.map(nomeDe).join(', ')}. </span>}
                {f.emTreguaCom.length > 0 && <span className="text-amber-300">Trégua: {f.emTreguaCom.map(nomeDe).join(', ')}. </span>}
                {f.aliados.length > 0 && <span className="text-emerald-300">Aliada: {f.aliados.map(nomeDe).join(', ')}. </span>}
              </div>
            </div>
          ))}
          <div className="text-[10px] text-suave">A distribuição inicial é sorteada pela semente do jogo; alianças e rivalidades são parâmetros de jogo editáveis, não afirmações sobre organizações reais.</div>
        </div>
      )}

      {aba === 'Territórios' && (
        <div className="mt-2">
          <div className="text-[11px] text-suave mb-1">Polígonos de bairro (Censo/IPP). Fração de cada bairro sob domínio, por facção.</div>
          <div className="space-y-1">
            {[...F.unidades].filter((u) => u.forca > 0.05).sort((a, b) => b.forca * b.populacao - a.forca * a.populacao).slice(0, 24).map((u) => (
              <div key={u.id} className="text-[11px]">
                <div className="flex justify-between"><span>{u.nome}{u.conflito > 0.05 && <span className="text-red-300"> ⚔ em conflito</span>}</span><span className="text-suave">{fmt.int(u.populacao)} hab. · {fmt.pct(u.forca)} dominado</span></div>
                <div className="flex h-1.5 rounded overflow-hidden bg-white/10">
                  {u.controle.map((c, k) => <div key={k} style={{ width: `${c * 100}%`, background: DADOS.faccoes.faccoes[IDS_FACCAO[k]].cor }} title={`${nomeDe(IDS_FACCAO[k])}: ${fmt.pct(c)}`} />)}
                </div>
              </div>
            ))}
            {F.unidades.every((u) => u.forca <= 0.05) && <div className="text-xs text-suave">Nenhum bairro com domínio criminoso relevante.</div>}
          </div>
        </div>
      )}

      {aba === 'Instituições' && (
        <div className="mt-2 space-y-1.5">
          {I.ordem.map((id) => {
            const x = I.instituicoes[id];
            return (
              <div key={id} className="rounded-lg border border-borda p-2">
                <div className="flex items-center justify-between"><div className="font-semibold flex items-center gap-1.5"><i className="w-3 h-3 rounded-sm inline-block" style={{ background: x.cor }} />{x.nome} <span className="text-[10px] text-suave font-normal">{x.sigla} · {x.esfera}</span></div></div>
                <div className="text-[11px] text-suave mt-0.5">{x.funcao}</div>
                <div className="text-[10px] mt-1">Bases: {x.bases.map((b) => b.nome).join(' · ')}. Preparo {x.preparoMin} min · {x.viaturasPorBase} viaturas/base.</div>
              </div>
            );
          })}
          <div className="text-[10px] text-suave">Delegacias, batalhões, bases comunitárias, hospitais e UPAs que você constrói viram bases de despacho (PM, Civil, SAMU).</div>
        </div>
      )}

      {aba === 'Ocorrências' && (
        <div className="mt-2">
          <div className="text-[11px] text-suave mb-1">Despacho: incêndio → Bombeiros · ferido → SAMU · tiroteio → PM/BOPE · crime → Civil. Quanto mais demora a chegada, mais mortes.</div>
          <div className="flex flex-wrap gap-1 mb-2">{Object.entries(F.totais).map(([t, n]) => <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-white/5">{tipoOc(t)} · {n}</span>)}</div>
          <div className="space-y-1.5">
            {F.recentes.length === 0 && <div className="text-xs text-suave">Nenhuma ocorrência ainda.</div>}
            {F.recentes.map((o: Ocorrencia) => (
              <div key={o.id} className="rounded-lg border border-borda p-2 text-[11px]">
                <div className="flex justify-between"><b>{tipoOc(o.tipo)}{o.ordenada ? ' (ordenada por você)' : ''}</b><span className="text-suave">dia {o.dia}</span></div>
                <div className="text-suave">{o.local}{o.faccoes.length ? ` · ${o.faccoes.map((f) => DADOS.faccoes.faccoes[IDS_FACCAO[f]].sigla).join(' × ')}` : ''}</div>
                <div>{o.mortos > 0 && <span className="text-red-300">{o.mortos} morto{o.mortos > 1 ? 's' : ''} · </span>}{o.feridos > 0 && <span className="text-amber-300">{o.feridos} ferido{o.feridos > 1 ? 's' : ''} · </span>}{o.presos > 0 && <span>{o.presos} preso{o.presos > 1 ? 's' : ''}</span>}{o.mortos + o.feridos + o.presos === 0 && <span className="text-suave">sem vítimas</span>}</div>
                <div className="text-suave mt-0.5">{o.resposta.map((r) => `${DADOS.instituicoes.instituicoes[r.inst].sigla}${r.esp ? '/' + r.esp.toUpperCase() : ''} ${r.etaMin} min${r.escolta ? ' (esperou escolta)' : ''}`).join(' · ') || 'nenhuma base alcança o local'}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
