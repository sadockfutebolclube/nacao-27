/**
 * Painel lateral da entidade selecionada (Fase 25): pessoa, carro/ônibus, casa/prédio, estabelecimento ou ponto turístico.
 * Lê o registro (`fichaDe`), não o desenho. Para pessoas e carros que saíram de cena (a pessoa entrou num prédio) mostra a
 * última ficha e avisa. Botões: seguir (a câmera acompanha até o jogador arrastar), travar câmera, investigar (pessoa).
 */
import { useEffect, useRef, useState } from 'react';
import { fmt } from '../../app/store';
import { concluirInvestigacao, fichaDe, limparCachePessoas, type Ficha } from '../../entidades/contexto';
import { registro } from '../../entidades/registro';
import { selecao, useSelecao } from '../../entidades/selecao';
import { useGame } from '../../sim/bridge';
import { Icone } from '../Icone';
import { Minimapa } from './Minimapa';

const T_INVESTIGACAO = 3000;

const Linha = ({ k, v, cor }: { k: string; v: React.ReactNode; cor?: string }) => (
  <div className="flex justify-between gap-3 text-[12px] py-[3px] border-b border-white/5">
    <span className="text-suave shrink-0">{k}</span>
    <span className="text-right" style={cor ? { color: cor } : undefined}>{v}</span>
  </div>
);
const Selo = ({ t, cor }: { t: string; cor: string }) => <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: `${cor}26`, color: cor }}>{t}</span>;
const CLASSE_COR: Record<string, string> = { A: '#7fd1ff', B: '#6ee7a8', C: '#ffd45e', D: '#ffa45e', E: '#ff7a7a' };

const ROTULO: Record<Ficha['tipo'], string> = { pessoa: 'Pessoa', carro: 'Carro', onibus: 'Ônibus', casa: 'Casa', predio: 'Prédio', estabelecimento: 'Estabelecimento', marco: 'Ponto turístico' };
const ICONE: Record<Ficha['tipo'], string> = { pessoa: '🧍', carro: '🚗', onibus: '🚌', casa: '🏠', predio: '🏢', estabelecimento: '🏪', marco: '🗽' };

export function PainelEntidade() {
  const sel = useSelecao();
  const [, tic] = useState(0);
  const ultima = useRef<{ id: number; ficha: Ficha } | null>(null);
  useGame((s) => s.stateVersion);

  // atualiza 4×/s; conclui as investigações no fim do tempo
  useEffect(() => {
    if (sel.id === null) return;
    const t = window.setInterval(() => {
      for (const [id, fim] of Object.entries(selecao.ler().investigando)) {
        if (performance.now() >= fim) { concluirInvestigacao(Number(id)); selecao.terminouInvestigacao(Number(id)); }
      }
      tic((n) => n + 1);
    }, 250);
    return () => window.clearInterval(t);
  }, [sel.id]);
  // ao trocar de pessoa, poda as fichas geradas das que já não estão selecionadas (não deixa o cache crescer sem fim)
  useEffect(() => { if (sel.id === null) { limparCachePessoas(); registro.limpar('fichaPessoa'); registro.limpar('fichaCarro'); registro.limpar('destinoCarro'); } }, [sel.id]);

  if (sel.id === null) return null;
  let f = fichaDe(sel.id, (id) => selecao.ler().investigando[id]);
  const saiu = f ? !f.viva && (f.tipo === 'pessoa' || f.tipo === 'carro' || f.tipo === 'onibus') : false;
  if (f) ultima.current = { id: sel.id, ficha: f };
  else if (ultima.current?.id === sel.id) f = { ...ultima.current.ficha, viva: false } as Ficha;
  if (!f) {
    return (
      <Moldura titulo="Entidade" subtitulo="não está mais no mapa" fechar>
        <div className="text-xs text-suave">Essa pessoa ou veículo saiu de cena (entrou num prédio ou foi embora do campo de visão).</div>
      </Moldura>
    );
  }
  const seguindo = sel.modo === 'seguindo', travado = sel.modo === 'travado';

  const cabecalho = (() => {
    switch (f.tipo) {
      case 'pessoa': return { t: f.ficha.nome, s: `${f.ficha.idade} anos · ${f.ficha.profissao}` };
      case 'carro': case 'onibus': return { t: f.ficha.modelo, s: f.ficha.tipo };
      case 'casa': case 'predio': return { t: f.nome ?? `${f.ficha.tipo}`, s: `${f.ficha.endereco.rua}, ${f.ficha.endereco.numero} — ${f.ficha.endereco.bairro}` };
      case 'estabelecimento': return { t: f.ficha.nome, s: `${f.ficha.tipo} · ${f.endereco.rua}, ${f.endereco.numero}` };
      case 'marco': return { t: f.dado.nome, s: `Ponto turístico · ${f.bairro.nome}` };
    }
  })();

  return (
    <Moldura titulo={cabecalho.t} subtitulo={cabecalho.s} icone={ICONE[f.tipo]} rotulo={ROTULO[f.tipo]} fechar>
      {saiu && <div className="text-[11px] rounded px-2 py-1 mb-2 bg-white/5 text-amber-300">Saiu de vista — mostrando a última ficha{f.tipo === 'pessoa' ? ' (entrou num prédio)' : ''}.</div>}
      <div className="flex gap-1.5 mb-2">
        <button disabled={saiu} onClick={() => selecao.modo(seguindo ? 'livre' : 'seguindo')} className={`flex-1 text-[11px] rounded px-2 py-1.5 border ${seguindo ? 'bg-acento/20 border-acento text-acento' : 'border-borda hover:bg-white/5'} disabled:opacity-40`}>
          {seguindo ? '● Seguindo' : 'Seguir'}
        </button>
        <button disabled={saiu} onClick={() => selecao.modo(travado ? 'livre' : 'travado')} className={`flex-1 text-[11px] rounded px-2 py-1.5 border ${travado ? 'bg-acento/20 border-acento text-acento' : 'border-borda hover:bg-white/5'} disabled:opacity-40`}>
          {travado ? '🔒 Câmera travada' : 'Travar câmera'}
        </button>
      </div>
      <Minimapa x={f.pos.x} z={f.pos.z} bairro={`${f.bairro.nome} · ${f.bairro.regiao}`} indice={f.bairro.indice} atualizar={0} />
      <div className="mt-2">
        {f.tipo === 'pessoa' && <CorpoPessoa f={f} />}
        {(f.tipo === 'carro' || f.tipo === 'onibus') && <CorpoCarro f={f} />}
        {(f.tipo === 'casa' || f.tipo === 'predio') && <CorpoCasa f={f} />}
        {f.tipo === 'estabelecimento' && <CorpoEstab f={f} />}
        {f.tipo === 'marco' && <CorpoMarco f={f} />}
      </div>
    </Moldura>
  );
}

function Moldura({ titulo, subtitulo, icone, rotulo, children, fechar }: { titulo: string; subtitulo?: string; icone?: string; rotulo?: string; children: React.ReactNode; fechar?: boolean }) {
  return (
    <div className="absolute right-3 top-24 w-[340px] max-h-[calc(100vh-8rem)] overflow-y-auto painel rounded-xl p-4 pointer-events-auto surgir" style={{ zIndex: 45 }} onPointerDown={(e) => e.stopPropagation()}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {rotulo && <div className="text-[10px] uppercase tracking-wide text-acento-2">{icone} {rotulo}</div>}
          <div className="titulo text-lg font-semibold leading-tight mt-0.5 break-words">{titulo}</div>
          {subtitulo && <div className="text-xs text-suave mt-0.5">{subtitulo}</div>}
        </div>
        {fechar && <button onClick={() => selecao.selecionar(null)} className="text-suave hover:text-white shrink-0" aria-label="Fechar"><Icone nome="x" tamanho={18} /></button>}
      </div>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function CorpoPessoa({ f }: { f: Extract<Ficha, { tipo: 'pessoa' }> }) {
  const p = f.ficha;
  const inv = f.investigacao;
  const fim = selecao.ler().investigando[f.id];
  const restante = fim ? Math.max(0, (fim - performance.now()) / T_INVESTIGACAO) : 0;
  return (
    <>
      <div className="flex gap-1.5 mb-1 flex-wrap">
        <Selo t={p.classe.nome} cor={CLASSE_COR[p.classe.id]} />
        <Selo t={`${p.humor.emoji} ${p.humor.rotulo}`} cor="#9fb4ff" />
        {p.faccao && <Selo t={`${p.faccao.tipo}: ${p.faccao.nome}`} cor="#ff7a7a" />}
      </div>
      <Linha k="Renda aproximada" v={`${fmt.reais(p.renda)}/mês (${p.classe.sm.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} SM)`} />
      <Linha k="Humor agora" v={`${p.humor.rotulo} — ${p.humor.motivo}`} />
      <Linha k="Fazendo agora" v={p.fazendoAgora} />
      <Linha k="Mora em" v={p.moradia} />
      {p.trabalho && <Linha k="Trabalha em" v={`${p.trabalho.nome} — ${p.trabalho.rua}, ${p.trabalho.bairro}`} />}
      {p.faccao && <Linha k="Afiliação" v={`${p.faccao.nome} (${p.faccao.tipo})`} cor="#ff7a7a" />}
      <div className="mt-2 rounded-lg border border-borda p-2">
        <div className="flex items-center justify-between">
          <div className="text-[11px] text-suave">Investigação</div>
          {inv === 'revelado' ? <Selo t={p.criminoso ? 'CRIMINOSO' : 'sem antecedentes'} cor={p.criminoso ? '#ff7a7a' : '#6ee7a8'} /> : <span className="text-[11px] text-suave">flag oculta</span>}
        </div>
        {inv === 'revelado' && p.criminoso && <div className="text-[11px] mt-1 text-red-300">Ficha: {p.crimes.join('; ')}.</div>}
        {inv === 'revelado' && !p.criminoso && <div className="text-[11px] mt-1 text-suave">A investigação não encontrou nada contra esta pessoa.</div>}
        {inv === 'em_andamento' && (
          <div className="mt-1.5"><div className="text-[11px] text-suave mb-1">Investigando…</div><div className="h-1.5 bg-white/10 rounded"><div className="h-full bg-acento-2 rounded" style={{ width: `${(1 - restante) * 100}%` }} /></div></div>
        )}
        {inv !== 'revelado' && inv !== 'em_andamento' && (
          <button onClick={() => selecao.investigar(f.id, T_INVESTIGACAO)} className="mt-1.5 w-full text-[11px] rounded px-2 py-1.5 border border-borda hover:bg-white/5">
            🔎 Investigar {registro.ler<number>('tentativas', f.id) ? '(tentar de novo — inconclusivo)' : ''}
          </button>
        )}
      </div>
      <div className="mt-2 text-[11px] text-suave">Histórico recente</div>
      <ul className="text-[12px] mt-0.5 space-y-0.5">
        {p.historico.map((h, i) => <li key={i}><span className="text-suave">{h.quando} —</span> {h.texto}</li>)}
        {inv === 'revelado' && p.criminoso && <li className="text-red-300"><span className="opacity-70">registro —</span> investigada(o) por {p.crimes[0]}</li>}
      </ul>
    </>
  );
}

function CorpoCarro({ f }: { f: Extract<Ficha, { tipo: 'carro' | 'onibus' }> }) {
  const c = f.ficha;
  return (
    <>
      <Linha k="Tipo" v={c.tipo} />
      {f.linha && <Linha k="Linha" v={`${f.linha.nome} — ${f.linha.longo}`} />}
      <Linha k="Motorista" v={c.motorista ? `${c.motorista.nome}, ${c.motorista.idade} anos` : '—'} />
      <Linha k="Velocidade" v={`${f.velocidadeKmh} km/h`} />
      <Linha k="Destino (estimado)" v={f.destino} />
      <Linha k={f.tipo === 'onibus' ? 'Passageiros' : 'Ocupantes além do motorista'} v={c.passageiros} />
      <div className="text-[10px] text-suave mt-1">O tráfego do jogo não calcula a rota inteira: o destino é um ponto plausível à frente.</div>
    </>
  );
}

function CorpoCasa({ f }: { f: Extract<Ficha, { tipo: 'casa' | 'predio' }> }) {
  const c = f.ficha;
  const seg = c.seguranca;
  return (
    <>
      <div className="flex gap-1.5 mb-1 flex-wrap"><Selo t={`Classe ${c.classe}`} cor={CLASSE_COR[c.classe]} /><Selo t={`Segurança ${seg.nivel.toLowerCase()}`} cor={seg.nivel === 'Alto' ? '#6ee7a8' : seg.nivel === 'Médio' ? '#ffd45e' : '#ff7a7a'} /></div>
      <Linha k="Endereço" v={`${c.endereco.rua}, ${c.endereco.numero}`} />
      <Linha k="Bairro" v={`${c.endereco.bairro} — ${c.endereco.regiao}`} />
      <Linha k="Tipo" v={c.tipo} />
      <Linha k="Andares" v={c.andares} />
      <Linha k="Moradores" v={c.moradores} />
      <Linha k="Classe predominante" v={`Classe ${c.classe}`} cor={CLASSE_COR[c.classe]} />
      <Linha k="Segurança" v={`${seg.nivel} (${Math.round(seg.valor * 100)}%)`} />
      <Linha k="Território" v={c.dominio} />
      <Linha k="Valor estimado do imóvel" v={`${fmt.reais(c.valor)} (${fmt.int(c.areaPiso)} m²)`} />
      {c.idades.length > 0 && (
        <>
          <div className="mt-2 text-[11px] text-suave">Idades dos moradores</div>
          <div className="text-[12px] mt-0.5">{c.idades.slice(0, 40).join(', ')}{c.idades.length > 40 ? ` … (+${c.idades.length - 40})` : ''}</div>
        </>
      )}
    </>
  );
}

function CorpoEstab({ f }: { f: Extract<Ficha, { tipo: 'estabelecimento' }> }) {
  const e = f.ficha;
  return (
    <>
      <div className="flex gap-1.5 mb-1"><Selo t={e.aberto ? 'Aberto agora' : 'Fechado agora'} cor={e.aberto ? '#6ee7a8' : '#ff7a7a'} />{e.taxa.paga && <Selo t="paga taxa" cor="#ff7a7a" />}</div>
      <Linha k="Tipo" v={e.tipo} />
      <Linha k="Dono(a)" v={e.dono} />
      <Linha k="Funcionários" v={e.funcionarios} />
      <Linha k="Clientes agora" v={e.clientesAgora} />
      <Linha k="Horário" v={e.horario} />
      <Linha k="Faturamento (mês)" v={fmt.reais(e.faturamentoMes)} />
      <Linha k="Taxa a facção/milícia" v={e.taxa.paga ? `Sim — ${e.taxa.para}, ~${fmt.reais(e.taxa.valorMes)}/mês` : 'Não'} cor={e.taxa.paga ? '#ff7a7a' : undefined} />
      <div className="text-[10px] text-suave mt-1">Dono, funcionários e faturamento são estimativas do jogo (geradas a partir do tipo e do tamanho do prédio no OpenStreetMap).</div>
    </>
  );
}

function CorpoMarco({ f }: { f: Extract<Ficha, { tipo: 'marco' }> }) {
  return (
    <>
      <Linha k="Visitantes agora" v={fmt.int(f.visitantes)} />
      <Linha k="Nota (avaliação simulada)" v={`★ ${f.dado.nota.toLocaleString('pt-BR', { minimumFractionDigits: 1 })}`} />
      <div className="mt-2 text-[12px] leading-snug text-texto/90">{f.dado.historia}</div>
    </>
  );
}
