/**
 * Elaboração da Lei Orçamentária Anual: tributos, pessoal, dotações por secretaria, programa
 * da capital e emendas — com projeção ao vivo (receita, resultado, LRF, mínimos) e a chance
 * real de aprovação na Assembleia.
 */
import { useMemo, useState } from 'react';
import { comando, mundo, useGame } from '../../sim/bridge';
import { projetarLOA, projetoLOA, tetoRRF } from '../../sim/estado/estado';
import { placar } from '../../sim/politica/politica';
import { AREAS, CARREIRAS, type Area, type EstadoSnapshot, type PropostaLOA } from '../../sim/estado/tipos';
import { Icone } from '../Icone';
import { bi, Botao, pct, Regua } from './comum';

function Deslizante({ rotulo, valor, min, max, passo, onChange, formato, dica }: { rotulo: string; valor: number; min: number; max: number; passo: number; onChange: (v: number) => void; formato: (v: number) => string; dica?: string }) {
  return (
    <label className="block py-1" title={dica}>
      <div className="flex justify-between text-xs"><span className="text-suave">{rotulo}</span><span className="num text-sm">{formato(valor)}</span></div>
      <input type="range" min={min} max={max} step={passo} value={valor} onChange={(e) => onChange(Number(e.target.value))} className="w-full" />
    </label>
  );
}

export function LoaEditor({ s, onFechar }: { s: EstadoSnapshot; onFechar: () => void }) {
  const toast = useGame((g) => g.toast);
  const V = s.loaVigente;
  const anoAlvo = s.loaStatus === 'duodecimos' ? s.ano : s.ano + 1;
  const [p, setP] = useState<PropostaLOA>(() => {
    const base = structuredClone(s.loaProposta ?? V);
    // no RRF o teto só admite correção pela inflação
    const f = 1 + s.calib.ipca + (s.regime === 'RRF' ? 0 : 0.025);
    if (!s.loaProposta) {
      for (const a of AREAS) { base.custeio[a.id] *= f; base.investimento[a.id] *= f; }
      for (const c of CARREIRAS) base.reajuste[c.id] = Math.round(s.calib.ipca * 1000) / 1000;
      base.programaCapital *= f; base.emendas *= f;
    }
    base.ano = anoAlvo;
    return base;
  });
  // fatores relativos à LOA vigente (o que o jogador mexe)
  const [fatC, setFatC] = useState<Record<Area, number>>(() => Object.fromEntries(AREAS.map((a) => [a.id, p.custeio[a.id] / Math.max(1, V.custeio[a.id])])) as Record<Area, number>);
  const [fatI, setFatI] = useState<Record<Area, number>>(() => Object.fromEntries(AREAS.map((a) => [a.id, p.investimento[a.id] / Math.max(1, V.investimento[a.id])])) as Record<Area, number>);
  const [eixos, setEixos] = useState<Area[]>(s.ppaEixos.length ? s.ppaEixos : []);
  const [enviando, setEnviando] = useState(false);
  const precisaPPA = !s.ppaDefinido && s.ano === 2027;

  const proposta = useMemo<PropostaLOA>(() => ({
    ...p,
    custeio: Object.fromEntries(AREAS.map((a) => [a.id, V.custeio[a.id] * fatC[a.id]])) as Record<Area, number>,
    investimento: Object.fromEntries(AREAS.map((a) => [a.id, V.investimento[a.id] * fatI[a.id]])) as Record<Area, number>,
  }), [p, fatC, fatI, V]);
  const proj = useMemo(() => projetarLOA(s, proposta), [s, proposta]);
  const pl = useMemo(() => placar(s.pol, projetoLOA(s, proposta), { aprovacao: s.aprovacao }), [s, proposta]);
  const chance = pl.chance;
  const teto = useMemo(() => tetoRRF(s, proposta), [s, proposta]);
  const travado = s.pessoalPctRcl > 0.4655 || s.regime === 'RRF';

  const enviar = async () => {
    setEnviando(true);
    if (precisaPPA) {
      if (eixos.length === 0) { toast('Escolha ao menos 1 eixo do PPA', 'erro'); setEnviando(false); return; }
      await comando({ kind: 'estado', acao: { tipo: 'ppa', eixos } });
    }
    const r = await comando({ kind: 'estado', acao: { tipo: 'propor-loa', proposta } });
    setEnviando(false);
    if (r.ok) { toast(`LOA ${anoAlvo} enviada à Assembleia`, 'ok'); onFechar(); } else toast(r.msg ?? 'Proposta recusada', 'erro');
  };

  const pctFmt = (v: number) => pct(v, 1);
  return (
    <div className="absolute inset-0 bg-black/70 flex items-center justify-center p-3 pointer-events-auto z-30" onClick={onFechar}>
      <div className="painel rounded-2xl w-[min(1180px,100%)] max-h-[94vh] flex flex-col surgir" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-borda">
          <div>
            <div className="text-[11px] uppercase tracking-[0.25em] text-acento">Secretaria da Fazenda · Projeto de Lei</div>
            <h2 className="titulo text-2xl font-bold">Lei Orçamentária Anual {anoAlvo}</h2>
          </div>
          <button onClick={onFechar} className="text-suave hover:text-white"><Icone nome="x" /></button>
        </div>

        <div className="flex-1 overflow-auto grid lg:grid-cols-[1fr_340px] gap-0">
          <div className="p-5 space-y-5">
            {travado && (
              <div className="text-xs rounded-lg border border-acento-2/40 bg-acento-2/10 px-3 py-2 text-acento-2">
                {s.regime === 'RRF' ? 'Regime de Recuperação Fiscal: ' : 'Pessoal acima do limite prudencial da LRF: '}
                reajustes limitados à inflação e concursos só para reposição. Valores acima disso serão cortados.
              </div>
            )}
            <section>
              <h3 className="titulo text-sm text-suave mb-1">Tributos (vigoram em {anoAlvo}, respeitando a anterioridade)</h3>
              <div className="grid sm:grid-cols-2 gap-x-6">
                <Deslizante rotulo="ICMS — alíquota modal" valor={p.aliquotaICMS} min={0.17} max={0.25} passo={0.0025} formato={pctFmt} onChange={(v) => setP({ ...p, aliquotaICMS: v })} dica="Mais arrecadação, mas o empresariado chia e parte da base foge (elasticidade)." />
                <Deslizante rotulo="IPVA — automóveis" valor={p.aliquotaIPVA} min={0.01} max={0.05} passo={0.0025} formato={pctFmt} onChange={(v) => setP({ ...p, aliquotaIPVA: v })} dica="A classe média sente direto no bolso em janeiro." />
                <Deslizante rotulo="ITCMD — heranças e doações" valor={p.aliquotaITCMD} min={0.02} max={0.08} passo={0.005} formato={pctFmt} onChange={(v) => setP({ ...p, aliquotaITCMD: v })} />
                <Deslizante rotulo="Incentivos fiscais (renúncia de ICMS)" valor={p.incentivos} min={0} max={0.15} passo={0.005} formato={pctFmt} onChange={(v) => setP({ ...p, incentivos: v })} dica="Atrai empresas e acelera o PIB, mas renuncia arrecadação." />
                <Deslizante rotulo="Alíquota previdenciária dos servidores" valor={p.aliquotaPrevidencia} min={0.14} max={0.22} passo={0.005} formato={pctFmt} onChange={(v) => setP({ ...p, aliquotaPrevidencia: v })} dica="Reduz o déficit do RPPS. Servidores e ALE resistem." />
              </div>
            </section>

            <section>
              <h3 className="titulo text-sm text-suave mb-1">Pessoal: reajuste e concursos por carreira</h3>
              <div className="grid sm:grid-cols-2 gap-x-6">
                {CARREIRAS.map((c) => (
                  <div key={c.id} className="border-l-2 border-white/10 pl-3">
                    <div className="text-xs font-semibold">{c.nome} <span className="text-suave font-normal">· {s.folha[c.id].servidores.toLocaleString('pt-BR')} servidores</span></div>
                    <Deslizante rotulo="Reajuste" valor={p.reajuste[c.id]} min={0} max={0.15} passo={0.005} formato={pctFmt} onChange={(v) => setP({ ...p, reajuste: { ...p.reajuste, [c.id]: v } })} dica={`Inflação do ano: ${pct(s.calib.ipca)}. Abaixo dela é perda real — e risco de greve.`} />
                    <Deslizante rotulo="Quadro (concursos / não reposição)" valor={p.quadro[c.id]} min={-0.1} max={0.15} passo={0.01} formato={(v) => `${v > 0 ? '+' : ''}${Math.round(v * 100)}%`} onChange={(v) => setP({ ...p, quadro: { ...p.quadro, [c.id]: v } })} dica="Negativo = não repor aposentadorias (servidor estável não pode ser demitido)." />
                  </div>
                ))}
              </div>
            </section>

            <section>
              <h3 className="titulo text-sm text-suave mb-1">Dotações por secretaria (variação sobre a LOA vigente)</h3>
              <div className="grid gap-1.5">
                {AREAS.map((a) => (
                  <div key={a.id} className="grid grid-cols-[150px_1fr_1fr] gap-3 items-center">
                    <div className="text-xs"><i className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ background: a.cor }} />{a.nome}</div>
                    <label className="text-[11px]">
                      <div className="flex justify-between text-suave"><span>Custeio</span><span className="num text-texto">{bi(V.custeio[a.id] * fatC[a.id])} <span className={fatC[a.id] >= 1 ? 'text-acento' : 'text-perigo'}>({fatC[a.id] >= 1 ? '+' : ''}{Math.round((fatC[a.id] - 1) * 100)}%)</span></span></div>
                      <input type="range" min={0.6} max={1.6} step={0.01} value={fatC[a.id]} onChange={(e) => setFatC({ ...fatC, [a.id]: Number(e.target.value) })} className="w-full" />
                    </label>
                    <label className="text-[11px]">
                      <div className="flex justify-between text-suave"><span>Investimento</span><span className="num text-texto">{bi(V.investimento[a.id] * fatI[a.id])} <span className={fatI[a.id] >= 1 ? 'text-acento' : 'text-perigo'}>({fatI[a.id] >= 1 ? '+' : ''}{Math.round((fatI[a.id] - 1) * 100)}%)</span></span></div>
                      <input type="range" min={0.3} max={3} step={0.02} value={fatI[a.id]} onChange={(e) => setFatI({ ...fatI, [a.id]: Number(e.target.value) })} className="w-full" />
                    </label>
                  </div>
                ))}
              </div>
            </section>

            <section className="grid sm:grid-cols-2 gap-x-6">
              <Deslizante rotulo={`Programa de ${mundo.init?.cidade ?? 'Capital'} (Visão Cidade) — ${bi(p.programaCapital)}/ano`} valor={p.programaCapital} min={0} max={Math.max(V.programaCapital * 6, 50e6)} passo={1e6} formato={(v) => bi(v / 12) + '/mês'} onChange={(v) => setP({ ...p, programaCapital: v })} dica="Dinheiro que chega ao caixa das obras da sua cidade todo mês." />
              <Deslizante rotulo="Emendas parlamentares" valor={p.emendas / Math.max(1, s.rcl12)} min={0} max={0.02} passo={0.0005} formato={(v) => `${pct(v, 2)} da RCL · ${bi(v * s.rcl12)}`} onChange={(v) => setP({ ...p, emendas: v * s.rcl12 })} dica="Cada emenda é um voto mais fácil na ALE — e uma obra no reduto do deputado." />
            </section>

            {precisaPPA && (
              <section>
                <h3 className="titulo text-sm text-suave mb-1">PPA 2028–2031 — até 3 eixos estratégicos</h3>
                <p className="text-[11px] text-suave mb-2">Eixos prioritários ganham eficiência (gestão por metas) durante todo o plano.</p>
                <div className="flex flex-wrap gap-1.5">
                  {AREAS.map((a) => {
                    const on = eixos.includes(a.id);
                    return (
                      <button key={a.id} onClick={() => setEixos((ant) => (ant.includes(a.id) ? ant.filter((x) => x !== a.id) : ant.length < 3 ? [...ant, a.id] : ant))}
                        className={`px-2.5 py-1 rounded-full text-xs border ${on ? 'border-acento bg-acento/15 text-acento' : 'border-borda text-suave hover:text-white'}`}>{a.nome}</button>
                    );
                  })}
                </div>
              </section>
            )}
          </div>

          <aside className="p-5 border-l border-borda bg-black/20 space-y-3 lg:sticky lg:top-0 self-start">
            <h3 className="titulo text-sm text-suave">Projeção {anoAlvo}</h3>
            <div className="text-sm space-y-0.5">
              {[
                ['Receita líquida', proj.receitas], ['ICMS', proj.icms], ['Folha (ativos + patronal)', -proj.folha], ['Aporte à previdência', -proj.previdencia],
                ['Custeio', -proj.custeio], ['Investimento', -proj.investimento], ['Outros poderes', -proj.poderes], ['Serviço da dívida', -proj.divida],
              ].map(([n, v]) => (
                <div key={n as string} className="flex justify-between"><span className="text-suave">{n}</span><span className={`num ${(v as number) < 0 ? 'text-perigo/90' : ''}`}>{bi(v as number)}</span></div>
              ))}
              <div className="flex justify-between border-t border-borda pt-1 mt-1 font-semibold">
                <span>Resultado</span><span className={`num ${proj.resultado >= 0 ? 'text-acento' : 'text-perigo'}`}>{proj.resultado >= 0 ? '+' : ''}{bi(proj.resultado)}</span>
              </div>
            </div>
            <Regua rotulo="Pessoal / RCL (LRF)" valor={proj.pessoalPct} max={0.6} inverso marcas={[{ v: 0.441, nome: '', cor: '#f5b942' }, { v: 0.4655, nome: '', cor: '#ff9a3c' }, { v: 0.49, nome: '49%', cor: '#ff6b5b' }]} />
            <Regua rotulo="Saúde (mín. 12%)" valor={proj.saudePct} max={0.25} marcas={[{ v: 0.12, nome: '12%', cor: '#ff6b5b' }]} />
            <Regua rotulo="Educação (mín. 25%)" valor={proj.educacaoPct} max={0.4} marcas={[{ v: 0.25, nome: '25%', cor: '#ff6b5b' }]} />
            {teto && (
              <div className={`rounded-lg px-3 py-2 text-xs border ${teto.ok ? 'border-acento/30 text-acento' : 'border-perigo/40 bg-perigo/10 text-perigo'}`}>
                Teto do RRF: {bi(teto.proposto)} de {bi(teto.limite)}{teto.ok ? ' — dentro do limite' : ` — corte ${bi(teto.excesso)} para poder enviar`}
              </div>
            )}
            <div className="rounded-xl bg-white/5 p-3 text-center">
              <div className="text-[10px] uppercase tracking-wider text-suave">Chance de aprovação na ALE</div>
              <div className={`num text-4xl font-bold ${chance > 0.65 ? 'text-acento' : chance > 0.4 ? 'text-acento-2' : 'text-perigo'}`}>{Math.round(chance * 100)}%</div>
              <div className="text-[10px] text-suave">Placar previsto: {pl.aFavor} a favor · {pl.indecisos} indecisos · {pl.contra} contra (precisa de {pl.necessarios})</div>
              <div className="text-[10px] text-suave">Depois de enviada, negocie os indecisos na aba Assembleia.</div>
            </div>
            <div className="flex gap-2">
              <Botao onClick={onFechar}>Cancelar</Botao>
              <div className="flex-1" />
              <Botao tom="primario" desativado={enviando || (teto !== null && !teto.ok) || (s.loaStatus !== 'janela' && s.loaStatus !== 'duodecimos')} onClick={enviar}>Enviar à Assembleia</Botao>
            </div>
            {s.loaStatus !== 'janela' && s.loaStatus !== 'duodecimos' && <p className="text-[10px] text-suave">Simulação livre: a proposta só pode ser enviada entre 1º e 31 de agosto.</p>}
          </aside>
        </div>
      </div>
    </div>
  );
}
