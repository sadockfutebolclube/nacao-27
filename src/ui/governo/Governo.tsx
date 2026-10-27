/**
 * Palácio do Governo: Tesouro, orçamento (PPA/LDO/LOA), receitas, pessoal e previdência,
 * dívida, secretarias com indicadores e carteira de obras.
 */
import { useState } from 'react';
import { fmt } from '../../app/store';
import { comando, useGame } from '../../sim/bridge';
import { obrasDisponiveis } from '../../sim/estado/estado';
import { defObra } from '../../sim/estado/obras';
import { AREAS, CARREIRAS, type Area, type EstadoSnapshot, type Indicadores, type MetaLDO, type Politicas } from '../../sim/estado/tipos';
import { Icone } from '../Icone';
import { Barras, bi, Botao, Cartao, pct, Regua, Seta } from './comum';
import { LoaEditor } from './LoaEditor';
import { Assembleia } from './Assembleia';
import { Gabinete } from './Gabinete';
import { Relacoes } from './Relacoes';
import { Eleicao } from '../eleicao/Eleicao';
import { Retrato } from './Retrato';
import { PARTIDOS, type Cargo } from '../../sim/politica/dados';

type Aba = 'geral' | 'eleicao' | 'gabinete' | 'assembleia' | 'relacoes' | 'orcamento' | 'receitas' | 'pessoal' | 'divida' | 'secretarias' | 'obras';
const ABAS: { id: Aba; nome: string; icone: string }[] = [
  { id: 'geral', nome: 'Visão geral', icone: 'grafico' },
  { id: 'eleicao', nome: 'Eleição', icone: 'aprovacao' },
  { id: 'gabinete', nome: 'Gabinete', icone: 'pessoas' },
  { id: 'assembleia', nome: 'Assembleia', icone: 'aprovacao' },
  { id: 'relacoes', nome: 'Relações', icone: 'jornal' },
  { id: 'orcamento', nome: 'Orçamento', icone: 'jornal' },
  { id: 'receitas', nome: 'Receitas e despesas', icone: 'dinheiro' },
  { id: 'pessoal', nome: 'Pessoal e Previdência', icone: 'pessoas' },
  { id: 'divida', nome: 'Dívida', icone: 'predio' },
  { id: 'secretarias', nome: 'Secretarias', icone: 'aprovacao' },
  { id: 'obras', nome: 'Obras', icone: 'demolir' },
];

const NOMES_RECEITA: Record<string, string> = {
  icms: 'ICMS', ipva: 'IPVA', itcd: 'ITCMD', irrf: 'IR retido na fonte', royalties: 'Patrimonial e royalties', outras: 'Outras receitas próprias',
  fpe: 'FPE e IPI-exportação', transferencias: 'Transferências (SUS, convênios)', fundeb: 'FUNDEB recebido', municipios: '(−) Cota-parte dos municípios',
  formacaoFundeb: '(−) Contribuição ao FUNDEB', credito: 'Operações de crédito',
};
const NOMES_DESPESA: Record<string, string> = {
  pessoal: 'Pessoal ativo + encargos', previdencia: 'Aporte à previdência', custeio: 'Custeio das secretarias', investimento: 'Investimentos e obras',
  poderes: 'Duodécimos (ALE, TJ, MP, Defensoria)', programaCapital: 'Programa da Capital', emendas: 'Emendas parlamentares', juros: 'Juros da dívida', amortizacao: 'Amortização', politicas: 'Políticas das secretarias', convenios: 'Convênios com prefeituras', publicidade: 'Publicidade oficial',
};

const IND: { k: keyof Indicadores; nome: string; area: Area; fmt: (v: number) => string; menorMelhor: boolean }[] = [
  { k: 'esperaEmergencia', nome: 'Espera na emergência', area: 'saude', fmt: (v) => `${v.toFixed(1).replace('.', ',')} h`, menorMelhor: true },
  { k: 'mortalidadeInfantil', nome: 'Mortalidade infantil (posse: SIM/SINASC)', area: 'saude', fmt: (v) => `${v.toFixed(1).replace('.', ',')} ‰`, menorMelhor: true },
  { k: 'leitos', nome: 'Leitos SUS por mil hab. (posse: CNES)', area: 'saude', fmt: (v) => v.toFixed(2).replace('.', ','), menorMelhor: false },
  { k: 'filaCirurgias', nome: 'Fila de cirurgias eletivas', area: 'saude', fmt: (v) => `${Math.round(v * 1000).toLocaleString('pt-BR')} pessoas`, menorMelhor: true },
  { k: 'ideb', nome: 'IDEB ensino médio (projeção)', area: 'educacao', fmt: (v) => v.toFixed(2).replace('.', ','), menorMelhor: false },
  { k: 'evasao', nome: 'Evasão no ensino médio', area: 'educacao', fmt: (v) => `${v.toFixed(1).replace('.', ',')}%`, menorMelhor: true },
  { k: 'homicidios', nome: 'Mortes violentas /100 mil', area: 'seguranca', fmt: (v) => v.toFixed(1).replace('.', ','), menorMelhor: true },
  { k: 'roubos', nome: 'Roubos /100 mil', area: 'seguranca', fmt: (v) => Math.round(v).toLocaleString('pt-BR'), menorMelhor: true },
  { k: 'letalidade', nome: 'Mortes por intervenção policial /100 mil', area: 'seguranca', fmt: (v) => v.toFixed(1).replace('.', ','), menorMelhor: true },
  { k: 'lotacaoPrisional', nome: 'Lotação do sistema prisional', area: 'seguranca', fmt: (v) => `${Math.round(v)}%`, menorMelhor: true },
  { k: 'pobreza', nome: 'Extrema pobreza (posse: PNAD)', area: 'assistencia', fmt: (v) => `${v.toFixed(1).replace('.', ',')}%`, menorMelhor: true },
  { k: 'deslocamento', nome: 'Deslocamento casa–trabalho', area: 'transporte', fmt: (v) => `${Math.round(v)} min`, menorMelhor: true },
  { k: 'esgoto', nome: 'Atendimento de esgoto', area: 'saneamento', fmt: (v) => `${v.toFixed(1).replace('.', ',')}%`, menorMelhor: false },
  { k: 'desemprego', nome: 'Desemprego (posse: PNAD)', area: 'desenvolvimento', fmt: (v) => pct(v), menorMelhor: true },
  { k: 'crescimentoPIB', nome: 'Crescimento do PIB (a.a.)', area: 'desenvolvimento', fmt: (v) => pct(v), menorMelhor: false },
];

function VisaoGeral({ s }: { s: EstadoSnapshot }) {
  const res = s.resultadoPrimario12;
  const hist = s.historico.slice(-24).map((h) => ({
    rotulo: h.rotulo,
    receita: Object.values(h.receitas).reduce((a, b) => a + b, 0),
    despesa: Object.values(h.despesas).reduce((a, b) => a + b, 0),
    caixa: h.caixa,
  }));
  const grupos: [keyof EstadoSnapshot['grupos'], string][] = [['baixaRenda', 'Baixa renda'], ['classeMedia', 'Classe média'], ['servidores', 'Servidores'], ['empresariado', 'Empresariado']];
  return (
    <div className="space-y-4">
      {s.alertas.length > 0 && (
        <div className="space-y-1">{s.alertas.map((a) => <div key={a} className="text-xs rounded-lg bg-perigo/10 border border-perigo/30 text-perigo px-3 py-1.5">⚠ {a}</div>)}</div>
      )}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Cartao titulo="Caixa do Tesouro" valor={bi(s.caixa)} cor={s.caixa < 0 ? 'text-perigo' : 'text-acento-2'} sub="disponibilidade da conta única" />
        <Cartao titulo="Resultado primário (12m)" valor={`${res >= 0 ? '+' : ''}${bi(res)}`} cor={res >= 0 ? 'text-acento' : 'text-perigo'} sub={`nominal ${bi(s.resultadoNominal12)}`} />
        <Cartao titulo="Receita corrente líquida" valor={bi(s.rcl12)} sub="últimos 12 meses" />
        <Cartao titulo="CAPAG (Tesouro Nacional)" valor={s.capag} cor={s.capag <= 'B' ? 'text-acento' : 'text-perigo'} sub={s.capag <= 'B' ? 'pode tomar crédito com aval da União' : 'sem aval da União'} />
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-white/[0.03] rounded-xl p-3">
          <div className="text-xs text-suave mb-1">Lei de Responsabilidade Fiscal e mínimos constitucionais</div>
          <Regua rotulo="Despesa com pessoal / RCL" valor={s.pessoalPctRcl} max={0.6} inverso marcas={[{ v: 0.441, nome: '', cor: '#f5b942' }, { v: 0.4655, nome: '', cor: '#ff9a3c' }, { v: 0.49, nome: 'limites 44 · 46,5 · 49%', cor: '#ff6b5b' }]} />
          <Regua rotulo="Dívida consolidada líquida / RCL" valor={Math.max(0, s.dclPctRcl)} max={2.4} inverso marcas={[{ v: 1.8, nome: '', cor: '#f5b942' }, { v: 2, nome: 'limite 200%', cor: '#ff6b5b' }]} />
          <Regua rotulo={`Saúde — ${s.mes === 1 ? `aplicado em ${s.ano - 1}` : `acumulado ${s.ano}`}`} valor={s.saudePct} max={0.25} marcas={[{ v: 0.12, nome: 'mínimo 12%', cor: '#ff6b5b' }]} />
          <Regua rotulo={`Educação (MDE) — ${s.mes === 1 ? `aplicado em ${s.ano - 1}` : `acumulado ${s.ano}`}`} valor={s.educacaoPct} max={0.4} marcas={[{ v: 0.25, nome: 'mínimo 25%', cor: '#ff6b5b' }]} />
          {s.mes > 1 && s.mes <= 5 && <p className="text-[10px] text-suave mt-1">Início do ano: o IPVA de jan–mar infla a receita de impostos, então o percentual acumulado começa baixo e sobe ao longo do ano. O que vale é o fechamento em dezembro.</p>}
        </div>
        <div className="bg-white/[0.03] rounded-xl p-3">
          <div className="text-xs text-suave mb-2">Execução mensal — últimos 24 meses</div>
          <Barras dados={hist} />
        </div>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-white/[0.03] rounded-xl p-3">
          <div className="flex justify-between text-xs"><span className="text-suave">Aprovação por grupo</span><span className="num text-base">{Math.round(s.aprovacao)}% geral</span></div>
          {grupos.map(([k, n]) => (
            <div key={k} className="mt-1.5">
              <div className="flex justify-between text-[11px]"><span>{n}</span><span className="num">{Math.round(s.grupos[k])}%</span></div>
              <div className="h-1.5 bg-white/8 rounded"><div className="h-full rounded" style={{ width: `${s.grupos[k]}%`, background: s.grupos[k] >= 50 ? '#3ee0b0' : s.grupos[k] >= 35 ? '#f5b942' : '#ff6b5b' }} /></div>
            </div>
          ))}
          <div className="mt-3 text-[11px] text-suave">Base aliada na Assembleia: <span className="num text-texto">{Math.round(s.baseAliada * s.pol.cadeiras)} de {s.pol.cadeiras} deputados</span> · capital político <span className="num text-texto">{Math.round(s.pol.capital)}</span></div>
          {s.pol.pauta.length > 0 && <div className="text-[11px] text-acento-2 mt-1">Na pauta da ALE: {s.pol.pauta.map((p) => p.titulo).join(', ')}</div>}
        </div>
        <div className="bg-white/[0.03] rounded-xl p-3">
          <div className="text-xs text-suave mb-2">Calendário fiscal</div>
          {s.calendario.slice(0, 6).map((c) => (
            <div key={c.data + c.titulo} className="flex justify-between text-xs py-1 border-b border-white/5"><span>{c.titulo}</span><span className="num text-suave">{c.data}</span></div>
          ))}
          {s.greves.length > 0 && <div className="mt-2 text-xs text-perigo">Em greve: {s.greves.map((g) => CARREIRAS.find((c) => c.id === g)!.nome).join(', ')}</div>}
        </div>
      </div>
    </div>
  );
}

function Orcamento({ s, abrirLOA }: { s: EstadoSnapshot; abrirLOA: () => void }) {
  const toast = useGame((g) => g.toast);
  const [cont, setCont] = useState(s.contingenciamento);
  const status = {
    vigente: `LOA ${s.loaVigente.ano} em execução.`,
    janela: `Elaboração da LOA ${s.ano + 1} aberta — envie até 31 de agosto.`,
    enviada: `LOA ${(s.loaProposta?.ano ?? s.ano + 1)} na Assembleia. Votação em dezembro.`,
    rejeitada: `A ALE rejeitou a LOA ${s.loaProposta?.ano}. Sem acordo, o ano começa em duodécimos.`,
    duodecimos: 'Regime de duodécimos: envie uma nova proposta para a revotação.',
  }[s.loaStatus];
  const custeio = Object.values(s.loaVigente.custeio).reduce((a, b) => a + b, 0);
  const invest = Object.values(s.loaVigente.investimento).reduce((a, b) => a + b, 0);
  const podeEnviar = s.loaStatus === 'janela' || s.loaStatus === 'duodecimos';
  const metas: { id: MetaLDO; nome: string; desc: string }[] = [
    { id: 'austera', nome: 'Austera', desc: 'Superávit para reduzir dívida. Mercado gosta, servidores não.' },
    { id: 'equilibrada', nome: 'Equilibrada', desc: 'Resultado próximo de zero.' },
    { id: 'expansionista', nome: 'Expansionista', desc: 'Déficit para investir. Agrada a base, preocupa o TCE.' },
  ];
  return (
    <div className="space-y-4">
      <div className={`rounded-xl p-4 border ${podeEnviar ? 'border-acento/40 bg-acento/5' : 'border-borda bg-white/[0.03]'}`}>
        <div className="text-sm">{status}</div>
        <div className="flex gap-2 mt-3">
          <Botao tom={podeEnviar ? 'primario' : 'neutro'} onClick={abrirLOA}>{podeEnviar ? `Elaborar LOA ${s.loaStatus === 'duodecimos' ? s.ano : s.ano + 1}` : 'Simular uma LOA'}</Botao>
        </div>
      </div>
      <div className="grid md:grid-cols-3 gap-2">
        <Cartao titulo={`Custeio ${s.loaVigente.ano}`} valor={bi(custeio)} />
        <Cartao titulo={`Investimentos ${s.loaVigente.ano}`} valor={bi(invest)} />
        <Cartao titulo="Programa da Capital" valor={bi(s.loaVigente.programaCapital)} sub="repassado mês a mês para as obras da cidade" />
      </div>
      <div className="bg-white/[0.03] rounded-xl p-3">
        <div className="text-xs text-suave">Contingenciamento (decreto de programação financeira)</div>
        <p className="text-[11px] text-suave mt-0.5">Congela parte do custeio e dos investimentos já. Ajuda o caixa, mas as secretarias sentem — e os mínimos de saúde e educação podem estourar.</p>
        <div className="flex items-center gap-3 mt-2">
          <input type="range" min={0} max={0.4} step={0.01} value={cont} onChange={(e) => setCont(Number(e.target.value))} className="flex-1" />
          <span className="num w-12 text-right">{pct(cont, 0)}</span>
          <Botao onClick={async () => { await comando({ kind: 'estado', acao: { tipo: 'contingenciar', pct: cont } }); toast(`Contingenciamento em ${pct(cont, 0)}`, 'ok'); }}>Publicar decreto</Botao>
        </div>
      </div>
      <div className="bg-white/[0.03] rounded-xl p-3">
        <div className="text-xs text-suave mb-2">LDO — meta fiscal {s.ldoDefinida ? `(definida: ${s.metaLDO})` : '(defina até 15 de abril)'}</div>
        <div className="grid md:grid-cols-3 gap-2">
          {metas.map((m) => (
            <button key={m.id} onClick={() => comando({ kind: 'estado', acao: { tipo: 'ldo', meta: m.id } })}
              className={`text-left rounded-lg p-2.5 border ${s.metaLDO === m.id ? 'border-acento bg-acento/10' : 'border-borda hover:bg-white/5'}`}>
              <div className="text-sm font-semibold">{m.nome}</div>
              <div className="text-[11px] text-suave">{m.desc}</div>
            </button>
          ))}
        </div>
      </div>
      {s.ppaDefinido && <div className="text-xs text-suave">PPA 2028–2031: eixos {s.ppaEixos.map((e) => AREAS.find((a) => a.id === e)!.nome).join(', ')}.</div>}
    </div>
  );
}

function Tabela({ linhas, total }: { linhas: [string, number][]; total: number }) {
  return (
    <div className="space-y-1">
      {linhas.map(([n, v]) => (
        <div key={n}>
          <div className="flex justify-between text-sm"><span className="text-suave">{n}</span><span className={`num ${v < 0 ? 'text-perigo/90' : ''}`}>{bi(v)}</span></div>
          <div className="h-1 bg-white/5 rounded"><div className="h-full rounded" style={{ width: `${Math.min(100, (Math.abs(v) / Math.max(1, total)) * 100)}%`, background: v < 0 ? '#ff6b5b' : '#3ee0b0' }} /></div>
        </div>
      ))}
    </div>
  );
}

function Receitas({ s }: { s: EstadoSnapshot }) {
  const linhas = Object.entries(s.receitas12).filter(([, v]) => Math.abs(v) > 1).sort((a, b) => b[1] - a[1]).map(([k, v]) => [NOMES_RECEITA[k] ?? k, v] as [string, number]);
  const total = Object.values(s.receitas12).reduce((a, b) => a + b, 0);
  const L = s.loaVigente;
  const despesas = Object.entries(s.despesas12).filter(([, v]) => v > 1).sort((a, b) => b[1] - a[1]).map(([k, v]) => [NOMES_DESPESA[k] ?? k, v] as [string, number]);
  const totalD = Object.values(s.despesas12).reduce((a, b) => a + b, 0);
  const maxAbs = Math.max(...linhas.map((l) => Math.abs(l[1])), ...despesas.map((d) => d[1]));
  return (
    <div className="grid md:grid-cols-[1fr_240px] gap-4">
      <div className="space-y-4">
        <div className="bg-white/[0.03] rounded-xl p-3">
          <div className="text-xs text-suave mb-2">Receitas dos últimos 12 meses · líquida {bi(total)}</div>
          <Tabela linhas={linhas} total={maxAbs} />
        </div>
        <div className="bg-white/[0.03] rounded-xl p-3">
          <div className="text-xs text-suave mb-2">Despesas dos últimos 12 meses · total {bi(totalD)}</div>
          <Tabela linhas={despesas.map(([n, v]) => [n, -v])} total={maxAbs} />
        </div>
      </div>
      <div className="space-y-2">
        <Cartao titulo="ICMS modal" valor={pct(L.aliquotaICMS)} sub={`referência ${pct(s.calib.aliquotaICMS0)}`} />
        <Cartao titulo="IPVA" valor={pct(L.aliquotaIPVA)} />
        <Cartao titulo="ITCMD" valor={pct(L.aliquotaITCMD)} />
        <Cartao titulo="Incentivos fiscais" valor={pct(L.incentivos)} sub="renúncia de ICMS" />
        <p className="text-[11px] text-suave">Alíquotas só mudam pela LOA/lei aprovada na ALE e valem no ano seguinte (anterioridade). Fonte da base: SICONFI 2024 projetado.</p>
      </div>
    </div>
  );
}

function Pessoal({ s }: { s: EstadoSnapshot }) {
  const toast = useGame((g) => g.toast);
  const p = s.previdencia;
  return (
    <div className="space-y-4">
      <div className="bg-white/[0.03] rounded-xl p-3 overflow-x-auto">
        <div className="text-xs text-suave mb-2">Carreiras do Executivo · inflação acumulada no mandato {pct(s.inflacaoAcumulada)}</div>
        <table className="w-full text-sm">
          <thead><tr className="text-[10px] uppercase text-suave text-left"><th className="py-1">Carreira</th><th>Servidores</th><th>Salário médio</th><th>Ganho real</th><th /></tr></thead>
          <tbody>
            {CARREIRAS.map((c) => {
              const f = s.folha[c.id];
              return (
                <tr key={c.id} className="border-t border-white/5">
                  <td className="py-1.5">{c.nome}</td>
                  <td className="num">{f.servidores.toLocaleString('pt-BR')}</td>
                  <td className="num">{fmt.reais(f.salarioMedio)}</td>
                  <td className={`num ${f.ganhoReal >= 0 ? 'text-acento' : 'text-perigo'}`}>{f.ganhoReal >= 0 ? '+' : ''}{pct(f.ganhoReal)}</td>
                  <td>{s.greves.includes(c.id) && <span className="text-[10px] px-1.5 py-0.5 rounded bg-perigo/20 text-perigo">em greve</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="grid md:grid-cols-4 gap-2">
        <Cartao titulo="Benefícios (12m)" valor={bi(p.beneficios12)} sub="aposentadorias e pensões" />
        <Cartao titulo="Contribuições" valor={bi(p.contribuicoes12)} sub={`servidor ${pct(p.aliquota)} + patronal`} />
        <Cartao titulo="Déficit do RPPS" valor={bi(Math.max(0, p.deficit12))} cor="text-perigo" sub="coberto pelo Tesouro" />
        <Cartao titulo="Reforma" valor={p.reformada ? 'Aprovada' : 'Não feita'} cor={p.reformada ? 'text-acento' : 'text-suave'} />
      </div>
      {!p.reformada && (
        <div className="rounded-xl border border-borda p-3 text-sm">
          <div>Reforma da Previdência estadual (idade mínima + alíquota progressiva até 16%)</div>
          <p className="text-[11px] text-suave mt-1">Reduz o déficit no longo prazo. Precisa de maioria na ALE — galerias lotadas e greve garantidas.</p>
          {s.pol.pauta.some((p) => p.tipo === 'pec-previdencia')
            ? <div className="mt-2 text-xs text-acento-2">PEC na pauta da ALE — negocie os votos na aba Assembleia (precisa de 3/5).</div>
            : <div className="mt-2"><Botao tom="perigo" onClick={async () => { const r = await comando({ kind: 'estado', acao: { tipo: 'reforma-previdencia' } }); toast(r.msg ?? (r.ok ? 'Enviada' : 'Não foi possível'), r.ok ? 'ok' : 'erro'); }}>Enviar PEC à Assembleia</Botao></div>}
        </div>
      )}
    </div>
  );
}

function Divida({ s }: { s: EstadoSnapshot }) {
  const toast = useGame((g) => g.toast);
  const [valor, setValor] = useState(Math.round(s.rcl12 * 0.03 / 1e8) * 1e8);
  const [credor, setCredor] = useState<'bndes' | 'bird' | 'bancos'>('bndes');
  const servico = (s.despesas12.juros ?? 0) + (s.despesas12.amortizacao ?? 0);
  const regime = { normal: 'Contrato padrão (IPCA + 4%)', RRF: 'Regime de Recuperação Fiscal', PROPAG: 'PROPAG (juros reduzidos)' }[s.regime];
  const acao = async (a: Parameters<typeof comando>[0]) => { const r = await comando(a); toast(r.msg ?? (r.ok ? 'Feito' : 'Não foi possível'), r.ok ? 'ok' : 'erro'); };
  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-4 gap-2">
        <Cartao titulo="Dívida consolidada" valor={bi(s.dividaConsolidada)} />
        <Cartao titulo="DCL / RCL" valor={pct(Math.max(0, s.dclPctRcl), 0)} cor={s.dclPctRcl > 2 ? 'text-perigo' : s.dclPctRcl > 1.8 ? 'text-acento-2' : 'text-texto'} sub="limite: 200% (Senado)" />
        <Cartao titulo="Serviço pago (12m)" valor={bi(servico)} sub={`${pct(servico / Math.max(1, s.rcl12))} da RCL`} />
        <Cartao titulo="Regime" valor={s.regime} sub={regime} />
      </div>
      {s.regime === 'RRF' && <p className="text-xs text-suave">No RRF o estado paga {pct(s.pagamentoDivida, 0)} das parcelas com a União; a parte suspensa vai para o saldo devedor. Em troca: teto de gastos, reajustes travados e concursos só para reposição.</p>}
      <div className="grid md:grid-cols-2 gap-3">
        <div className="rounded-xl border border-borda p-3">
          <div className="text-sm font-semibold">Aderir ao PROPAG</div>
          <p className="text-[11px] text-suave mt-1">Programa de Pleno Pagamento de Dívidas dos Estados (LC 212/2025, simplificado): entrega ativos equivalentes a 10% da dívida com a União e os juros reais caem de 4% para 2% a.a. Sai do RRF, se estiver nele.</p>
          <div className="mt-2"><Botao desativado={s.regime === 'PROPAG'} onClick={() => acao({ kind: 'estado', acao: { tipo: 'regime', regime: 'PROPAG' } })}>Aderir</Botao></div>
        </div>
        <div className="rounded-xl border border-borda p-3">
          <div className="text-sm font-semibold">Regime de Recuperação Fiscal</div>
          <p className="text-[11px] text-suave mt-1">Suspende a dívida com a União e retoma 11% ao ano. Só para estados em desequilíbrio grave. Custo político alto.</p>
          <div className="mt-2"><Botao tom="perigo" desativado={s.regime === 'RRF'} onClick={() => acao({ kind: 'estado', acao: { tipo: 'regime', regime: 'RRF' } })}>Pedir adesão</Botao></div>
        </div>
      </div>
      <div className="rounded-xl border border-borda p-3">
        <div className="text-sm font-semibold">Operação de crédito</div>
        <p className="text-[11px] text-suave mt-1">Exige DCL abaixo de 200% da RCL; BNDES e Banco Mundial exigem CAPAG A ou B (aval da União). Precisa de autorização da ALE (votação no mês seguinte); aprovado, o recurso cai no caixa em 3 a 6 meses.</p>
        <div className="flex flex-wrap items-center gap-3 mt-2">
          <select value={credor} onChange={(e) => setCredor(e.target.value as typeof credor)} className="bg-black/40 border border-borda rounded-lg px-2 py-1.5 text-sm">
            <option value="bndes">BNDES</option><option value="bird">Banco Mundial (BIRD)</option><option value="bancos">Bancos privados</option>
          </select>
          <input type="range" min={1e8} max={Math.max(2e8, s.rcl12 * 0.15)} step={1e8} value={valor} onChange={(e) => setValor(Number(e.target.value))} className="flex-1 min-w-40" />
          <span className="num w-24 text-right">{bi(valor)}</span>
          <Botao onClick={() => acao({ kind: 'estado', acao: { tipo: 'emprestimo', valor, credor } })}>Contratar</Botao>
        </div>
        {s.emprestimosPendentes.length > 0 && <div className="text-[11px] text-suave mt-2">A liberar: {s.emprestimosPendentes.map((e) => `${bi(e.valor)} (${e.credor})`).join(', ')}</div>}
      </div>
    </div>
  );
}

function Opcoes<T extends string>({ valor, opcoes, onChange }: { valor: T; opcoes: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="flex gap-1 flex-wrap">
      {opcoes.map(([v, n]) => (
        <button key={v} onClick={() => onChange(v)} className={`text-[11px] px-2 py-1 rounded-md border ${valor === v ? 'border-acento bg-acento/10 text-acento' : 'border-borda text-suave hover:text-white'}`}>{n}</button>
      ))}
    </div>
  );
}

function Chave({ ligado, rotulo, desc, onChange }: { ligado: boolean; rotulo: string; desc: string; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start gap-2 text-xs mt-2 cursor-pointer">
      <input type="checkbox" checked={ligado} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 accent-[#3ee0b0]" />
      <span><span className="text-texto">{rotulo}</span><br /><span className="text-[10px] text-suave">{desc}</span></span>
    </label>
  );
}

/** Políticas de cada secretaria (Fase 4): mudam indicadores, custos e aprovação. */
function PoliticasArea({ s, area }: { s: EstadoSnapshot; area: Area }) {
  const toast = useGame((g) => g.toast);
  const p = s.politicas;
  const [ti, setTi] = useState(p.tempoIntegral);
  const mudar = (pol: Partial<Politicas>) => comando({ kind: 'estado', acao: { tipo: 'politica', politicas: pol } });
  if (area === 'saude') return (
    <div className="mt-2 pt-2 border-t border-white/5">
      <div className="text-[10px] uppercase tracking-wider text-suave mb-1">Gestão dos hospitais</div>
      <Opcoes valor={p.gestaoSaude} opcoes={[['direta', 'Administração direta'], ['os', 'Organizações Sociais']]} onChange={(v) => mudar({ gestaoSaude: v })} />
      <p className="text-[10px] text-suave mt-1">OS: custeio ~3% menor e espera mais curta, com risco de escândalo de contrato.</p>
      <div className="mt-2"><Botao onClick={async () => { const r = await comando({ kind: 'estado', acao: { tipo: 'mutirao' } }); toast(r.ok ? 'Mutirão de cirurgias iniciado (3 meses)' : r.msg ?? 'Erro', r.ok ? 'ok' : 'erro'); }}>Mutirão de cirurgias (3 meses)</Botao></div>
    </div>
  );
  if (area === 'educacao') return (
    <div className="mt-2 pt-2 border-t border-white/5">
      <div className="text-[10px] uppercase tracking-wider text-suave mb-1">Ensino médio em tempo integral</div>
      <div className="flex items-center gap-2">
        <input type="range" min={0} max={1} step={0.05} value={ti} onChange={(e) => setTi(Number(e.target.value))} className="flex-1" />
        <span className="num w-10 text-right text-sm">{Math.round(ti * 100)}%</span>
        <Botao desativado={Math.abs(ti - p.tempoIntegral) < 0.001} onClick={() => mudar({ tempoIntegral: ti })}>Aplicar</Botao>
      </div>
      <p className="text-[10px] text-suave mt-1">≈ R$ 5.500 a mais por aluno/ano. Sobe o IDEB e derruba a evasão em 2–3 anos.</p>
      <Chave ligado={p.bonusProfessor} rotulo="Bônus por resultado para professores" desc="+3% na folha da educação; melhora o IDEB, sindicato reclama." onChange={(v) => mudar({ bonusProfessor: v })} />
    </div>
  );
  if (area === 'seguranca') return (
    <div className="mt-2 pt-2 border-t border-white/5">
      <div className="text-[10px] uppercase tracking-wider text-suave mb-1">Doutrina das polícias</div>
      <Opcoes valor={p.doutrina} opcoes={[['confronto', 'Confronto'], ['inteligencia', 'Inteligência'], ['prevencao', 'Prevenção']]} onChange={(v) => mudar({ doutrina: v })} />
      <p className="text-[10px] text-suave mt-1">
        {{ confronto: 'Operações recuperam território rápido, mas a letalidade e o risco de tragédia sobem; o domínio volta se o Estado não ocupa.',
          inteligencia: 'Investigação e asfixia financeira: operações menos letais, efeito mais lento e duradouro contra a milícia.',
          prevencao: 'Policiamento comunitário e programas sociais (pagos pela Assistência): crime cai devagar e a facção perde recrutas.' }[p.doutrina]}
      </p>
      <Chave ligado={p.cameras} rotulo="Câmeras corporais nas fardas" desc="Letalidade policial cai ~40%. R$ 5/hab/ano." onChange={(v) => mudar({ cameras: v })} />
      <Chave ligado={p.integracaoDados} rotulo="Integração de dados e cerco eletrônico" desc="Roubos caem e operações acertam mais. R$ 4/hab/ano." onChange={(v) => mudar({ integracaoDados: v })} />
    </div>
  );
  if (area === 'assistencia') return (
    <div className="mt-2 pt-2 border-t border-white/5">
      <Chave ligado={p.rendaEstadual} rotulo="Programa estadual de renda (R$ 150/família)" desc="Complementa o Bolsa Família para quem está na extrema pobreza. Caro, mas popular." onChange={(v) => mudar({ rendaEstadual: v })} />
    </div>
  );
  return null;
}

function Secretarias({ s }: { s: EstadoSnapshot }) {
  return (
    <div className="space-y-3">
    <div className="text-xs text-suave">Custo mensal das políticas em relação às herdadas: <span className={`num ${s.custoPoliticasMes > 0 ? 'text-acento-2' : 'text-acento'}`}>{s.custoPoliticasMes >= 0 ? '' : '−'}{bi(Math.abs(s.custoPoliticasMes))}</span> · entra no custeio de cada pasta.</div>
    <div className="grid md:grid-cols-2 gap-3">
      {AREAS.map((a) => {
        const ex = s.execucao[a.id];
        const gastoMes = ex.custeio + ex.investimento + ex.pessoal;
        const inds = IND.filter((i) => i.area === a.id);
        return (
          <div key={a.id} className="rounded-xl bg-white/[0.03] p-3 border-l-2" style={{ borderColor: a.cor }}>
            <div className="flex justify-between">
              <div className="flex items-center gap-2">
                {(() => { const sec = s.pol.secretarios[a.id as Cargo]; return sec ? <Retrato semente={sec.retrato} genero={sec.genero} idade={sec.idade} tamanho={30} cor={sec.partido ? PARTIDOS[sec.partido].cor : '#3ee0b0'} /> : null; })()}
                <div>
                  <div className="text-sm font-semibold">{a.secretaria}</div>
                  <div className="text-[10px] text-suave">{s.pol.secretarios[a.id as Cargo]?.nome}{s.pol.secretarios[a.id as Cargo]?.interino ? ' (interino)' : ''}</div>
                </div>
              </div>
              {s.ppaEixos.includes(a.id) && <span className="text-[10px] px-1.5 py-0.5 rounded bg-acento/15 text-acento h-fit">eixo do PPA</span>}
            </div>
            <div className="text-[11px] text-suave">Gasto no mês: <span className="num text-texto">{bi(gastoMes)}</span> · pessoal {bi(ex.pessoal)} · custeio {bi(ex.custeio)} · invest. {bi(ex.investimento)}</div>
            {inds.map((i) => {
              const v = s.indicadores[i.k], v0 = s.indicadoresIniciais[i.k];
              const delta = Math.abs(v - v0) / Math.max(1e-6, Math.abs(v0));
              return (
                <div key={i.k} className="flex justify-between text-sm mt-1.5">
                  <span>{i.nome}</span>
                  <span className="num"><Seta neutro={delta < 0.005} subiu={v > v0} bom={i.menorMelhor ? v < v0 : v > v0} /> {i.fmt(v)} <span className="text-[10px] text-suave">(posse: {i.fmt(v0)})</span></span>
                </div>
              );
            })}
            {a.id === 'educacao' && s.idebDivulgado && <div className="text-[11px] text-suave mt-1">IDEB oficial {s.idebDivulgado.ano}: {s.idebDivulgado.valor.toFixed(1).replace('.', ',')}</div>}
            <PoliticasArea s={s} area={a.id} />
          </div>
        );
      })}
    </div>
    </div>
  );
}

function Obras({ s }: { s: EstadoSnapshot }) {
  const toast = useGame((g) => g.toast);
  const ativas = s.obras.filter((o) => o.fase !== 'concluida');
  const prontas = s.obras.filter((o) => o.fase === 'concluida');
  const fase = { licitacao: 'Licitação', execucao: 'Em execução', paralisada: 'Paralisada', concluida: 'Concluída' };
  return (
    <div className="space-y-4">
      <div>
        <div className="text-xs text-suave mb-2">Carteira em andamento ({ativas.length})</div>
        {ativas.length === 0 && <div className="text-sm text-suave">Nenhuma obra em andamento. Escolha abaixo — elas consomem a dotação de investimento da secretaria responsável.</div>}
        <div className="space-y-2">
          {ativas.map((o) => {
            const d = defObra(o);
            return (
              <div key={o.uid} className="rounded-xl bg-white/[0.03] p-3">
                <div className="flex justify-between text-sm"><span className="font-semibold">{d.nome}</span><span className={`text-xs ${o.fase === 'paralisada' ? 'text-perigo' : o.fase === 'licitacao' ? 'text-acento-2' : 'text-acento'}`}>{fase[o.fase]}{o.mesesRuins >= 3 ? ' · obra parada' : ''}</span></div>
                <div className="h-2 bg-white/8 rounded mt-1.5"><div className="h-full bg-acento rounded transition-all" style={{ width: `${o.progresso * 100}%` }} /></div>
                <div className="text-[11px] text-suave mt-1">{Math.round(o.progresso * 100)}% · gasto {bi(o.gasto)} de {bi(o.custoTotal)}{o.custoTotal > d.custo * 1.01 ? ` (aditivos +${Math.round((o.custoTotal / d.custo - 1) * 100)}%)` : ''} · desde {o.iniciadaEm}</div>
              </div>
            );
          })}
        </div>
      </div>
      <div>
        <div className="text-xs text-suave mb-2">Carteira de projetos</div>
        <div className="grid md:grid-cols-2 gap-2">
          {obrasDisponiveis(s.populacao).map((d) => {
            const andamento = ativas.some((o) => o.id === d.id);
            const area = AREAS.find((a) => a.id === d.area)!;
            return (
              <div key={d.id} className="rounded-xl border border-borda p-3 flex flex-col">
                <div className="flex justify-between gap-2"><span className="text-sm font-semibold">{d.nome}</span><span className="num text-acento-2 whitespace-nowrap">{bi(d.custo)}</span></div>
                <div className="text-[11px] text-suave mt-0.5">{area.nome} · {d.meses} meses{d.ambiental ? ' · licença ambiental' : ''} · custeio depois de pronta {bi(d.custeioAnual)}/ano</div>
                <div className="text-xs mt-1 flex-1">{d.descricao}</div>
                <div className="mt-2"><Botao desativado={andamento || s.duodecimos} onClick={async () => { const r = await comando({ kind: 'estado', acao: { tipo: 'iniciar-obra', id: d.id } }); toast(r.ok ? 'Edital publicado' : r.msg ?? 'Erro', r.ok ? 'ok' : 'erro'); }}>{andamento ? 'Em andamento' : 'Publicar edital'}</Botao></div>
              </div>
            );
          })}
        </div>
      </div>
      {prontas.length > 0 && <div className="text-xs text-suave">Entregues: {prontas.map((o) => `${defObra(o).nome} (${o.concluidaEm})`).join(' · ')}</div>}
    </div>
  );
}

export function PainelGoverno({ onFechar, abaInicial = 'geral' }: { onFechar: () => void; abaInicial?: Aba }) {
  const s = useGame((g) => g.stats?.estado ?? null);
  const [aba, setAba] = useState<Aba>(abaInicial);
  const [loa, setLoa] = useState(false);
  if (!s) {
    return (
      <div className="absolute inset-0 bg-black/60 flex items-center justify-center pointer-events-auto" onClick={onFechar}>
        <div className="painel rounded-xl p-6 text-sm">Dados fiscais indisponíveis para esta UF. Rode <code>npm run fetch-fiscal</code>.</div>
      </div>
    );
  }
  return (
    <div className="absolute inset-0 bg-black/55 flex items-center justify-center p-3 pointer-events-auto z-20" onClick={onFechar}>
      <div className="painel rounded-2xl w-[min(1150px,100%)] h-[min(820px,92vh)] flex flex-col md:flex-row overflow-hidden surgir" onClick={(e) => e.stopPropagation()}>
        <nav className="md:w-52 shrink-0 border-b md:border-b-0 md:border-r border-borda p-2 flex md:flex-col gap-1 overflow-x-auto">
          <div className="hidden md:block px-2 pt-1 pb-3">
            <div className="text-[10px] uppercase tracking-[0.25em] text-acento">Palácio do Governo</div>
            <div className="titulo text-lg font-bold leading-tight">Gabinete</div>
          </div>
          {ABAS.map((a) => (
            <button key={a.id} onClick={() => setAba(a.id)} className={`flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm whitespace-nowrap ${aba === a.id ? 'bg-white/10 text-acento' : 'text-suave hover:text-white hover:bg-white/5'}`}>
              <Icone nome={a.icone} tamanho={16} /> {a.nome}
              {a.id === 'orcamento' && (s.loaStatus === 'janela' || s.loaStatus === 'duodecimos') && <span className="w-2 h-2 rounded-full bg-acento-2 pulsar" />}
            </button>
          ))}
        </nav>
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="flex items-center justify-between px-5 py-3 border-b border-borda">
            <h2 className="titulo text-xl font-semibold">{ABAS.find((a) => a.id === aba)!.nome}</h2>
            <button onClick={onFechar} className="text-suave hover:text-white"><Icone nome="x" /></button>
          </div>
          <div className="flex-1 overflow-auto p-5">
            {aba === 'geral' && <VisaoGeral s={s} />}
            {aba === 'eleicao' && <Eleicao s={s} />}
            {aba === 'gabinete' && <Gabinete s={s} />}
            {aba === 'assembleia' && <Assembleia s={s} />}
            {aba === 'relacoes' && <Relacoes s={s} />}
            {aba === 'orcamento' && <Orcamento s={s} abrirLOA={() => setLoa(true)} />}
            {aba === 'receitas' && <Receitas s={s} />}
            {aba === 'pessoal' && <Pessoal s={s} />}
            {aba === 'divida' && <Divida s={s} />}
            {aba === 'secretarias' && <Secretarias s={s} />}
            {aba === 'obras' && <Obras s={s} />}
            <p className="text-[10px] text-suave/70 mt-6">Ponto de partida: SICONFI/Tesouro Nacional (RREO e RGF 2024 de cada UF), projetado para 2027. Modelo simplificado — ver SIMULATION.md.</p>
          </div>
        </div>
      </div>
      {loa && <LoaEditor s={s} onFechar={() => setLoa(false)} />}
    </div>
  );
}

export type { Aba };
