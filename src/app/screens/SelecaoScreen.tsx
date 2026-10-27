import { useEffect, useState } from 'react';
import { carregarMunicipios, carregarUF, cidadesReais } from '../../data/loader';
import type { MunicipioJogavel } from '../../data/municipios';
import { deUF } from '../../data/nomes';
import type { DadosUF, ResumoUF } from '../../data/schemas';
import { CORES_REGIAO, corRampa, METRICAS } from '../../render/brasil/metricas';
import { Icone } from '../../ui/Icone';
import { fmt, resumo, useApp, type Metrica } from '../store';

const BIOMA_NOME: Record<string, string> = {
  'mata-atlantica': 'Mata Atlântica', cerrado: 'Cerrado', caatinga: 'Caatinga', amazonia: 'Amazônia', pampa: 'Pampa', pantanal: 'Pantanal',
};

function Estrelas({ n }: { n: number }) {
  return (
    <span className="tracking-tight" aria-label={`dificuldade ${n} de 5`}>
      {Array.from({ length: 5 }, (_, i) => <span key={i} className={i < n ? 'text-acento-2' : 'text-white/15'}>★</span>)}
    </span>
  );
}

function Linha({ rotulo, valor, fonte }: { rotulo: string; valor: string; fonte?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1 border-b border-white/5" title={fonte}>
      <span className="text-suave text-xs">{rotulo}</span>
      <span className="num text-base text-texto">{valor}</span>
    </div>
  );
}

function Ficha({ uf, completa }: { uf: ResumoUF; completa: DadosUF | null }) {
  const vab = uf.pib.vab;
  const totVab = vab.agro + vab.industria + vab.servicos + vab.adminPublica || 1;
  return (
    <div className="surgir" key={uf.sigla}>
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-[0.25em]" style={{ color: CORES_REGIAO[uf.regiao.sigla] }}>{uf.regiao.nome}</div>
          <h2 className="titulo text-4xl font-bold leading-none mt-1">{uf.nome}</h2>
          <div className="text-xs text-suave mt-1">“{uf.tracos.apelido}” · capital {uf.tracos.capital.nome}</div>
        </div>
        <div className="text-right">
          <div className="num text-3xl font-bold text-white/90">{uf.sigla}</div>
          <Estrelas n={uf.tracos.dificuldade} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-5 mt-4">
        <Linha rotulo={`População (${uf.populacao.ano})`} valor={fmt.pessoas(uf.populacao.valor)} fonte="IBGE — estimativa" />
        <Linha rotulo={`PIB (${uf.pib.ano})`} valor={fmt.reais(uf.pib.total)} fonte="IBGE" />
        <Linha rotulo="PIB per capita" valor={fmt.reais(uf.pib.perCapita)} />
        <Linha rotulo="IDH (2021)" valor={uf.indicadores.idh.toFixed(3).replace('.', ',')} fonte="Atlas Brasil — aproximado" />
        <Linha rotulo="Mortes violentas/100 mil" valor={fmt.dec(uf.indicadores.homicidios)} fonte="Anuário FBSP — aproximado" />
        <Linha rotulo="IDEB Ensino Médio" valor={fmt.dec(uf.indicadores.idebEM)} fonte="INEP — aproximado" />
        <Linha rotulo="Esgoto coletado" valor={`${uf.indicadores.esgoto}%`} fonte="SNIS — aproximado" />
        <Linha rotulo="Dívida / RCL" valor={`${uf.indicadores.dividaRCL}%`} fonte="SICONFI — RGF 2024 (oficial)" />
        <Linha rotulo="Área" valor={`${fmt.int(uf.areaKm2)} km²`} />
        <Linha rotulo="Municípios" valor={fmt.int(uf.numMunicipios)} />
      </div>

      <div className="mt-4">
        <div className="text-[11px] text-suave mb-1">Economia (VAB {vab.ano})</div>
        <div className="flex h-2 rounded overflow-hidden">
          <div style={{ width: `${(vab.agro / totVab) * 100}%`, background: '#7cbf4a' }} title="Agropecuária" />
          <div style={{ width: `${(vab.industria / totVab) * 100}%`, background: '#e0a030' }} title="Indústria" />
          <div style={{ width: `${(vab.servicos / totVab) * 100}%`, background: '#4b8fe0' }} title="Serviços" />
          <div style={{ width: `${(vab.adminPublica / totVab) * 100}%`, background: '#9a7be0' }} title="Administração pública" />
        </div>
        <div className="flex gap-3 text-[10px] text-suave mt-1">
          <span style={{ color: '#7cbf4a' }}>Agro {Math.round((vab.agro / totVab) * 100)}%</span>
          <span style={{ color: '#e0a030' }}>Indústria {Math.round((vab.industria / totVab) * 100)}%</span>
          <span style={{ color: '#4b8fe0' }}>Serviços {Math.round((vab.servicos / totVab) * 100)}%</span>
          <span style={{ color: '#9a7be0' }}>Adm. {Math.round((vab.adminPublica / totVab) * 100)}%</span>
        </div>
      </div>

      <div className="mt-4 text-xs text-suave">
        {uf.tracos.biomas.map((b) => BIOMA_NOME[b]).join(' · ')} — {uf.tracos.clima}
      </div>

      {completa && (
        <div className="mt-3 text-xs text-suave">
          <span className="text-texto/80">Maiores cidades: </span>
          {completa.maioresMunicipios.slice(0, 5).map((m) => `${m.nome} (${fmt.pessoas(m.populacao)})`).join(', ')}
        </div>
      )}
    </div>
  );
}

const TERRENO_NOME: Record<string, string> = {
  'litoral-morros': 'litoral com morros', 'litoral-plano': 'litoral plano', planicie: 'planície', planalto: 'planalto', serra: 'serra', varzea: 'várzea de rio',
};

/** Fase 8: escolha do município onde a cidade será construída — terreno, bioma e clima próprios. */
function EscolhaMunicipio({ lista, escolhido, onEscolher }: { lista: MunicipioJogavel[]; escolhido: MunicipioJogavel | null; onEscolher: (m: MunicipioJogavel) => void }) {
  const atual = escolhido ?? lista.find((m) => m.capital) ?? lista[0];
  const [reais, setReais] = useState<string[]>([]);
  useEffect(() => { cidadesReais().then(setReais).catch(() => undefined); }, []);
  const querReal = useApp((s) => s.cidadeReal);
  const temReal = reais.includes(atual.ibge);
  return (
    <div className="painel rounded-xl p-3 w-[min(760px,calc(100vw-2rem))] surgir">
      <div className="flex items-baseline justify-between gap-3 mb-2">
        <div className="titulo text-sm">Onde construir a sua cidade?</div>
        <div className="text-[11px] text-suave truncate">{atual.descricao}{atual.clima.estimado && atual.clima.dTemp !== 0 ? ` · clima ~${atual.clima.dTemp > 0 ? '+' : ''}${atual.clima.dTemp.toFixed(1).replace('.', ',')} °C${atual.clima.fChuva < 0.95 ? `, ${Math.round(atual.clima.fChuva * 100)}% da chuva` : ''} vs. capital` : ''}</div>
      </div>
      {temReal && (
        <label className="flex items-center gap-2 text-xs mb-2 cursor-pointer">
          <input type="checkbox" checked={querReal} onChange={(e) => useApp.setState({ cidadeReal: e.target.checked })} />
          Começar com a cidade real: ruas, prédios, relevo e rios de {atual.nome} (© OpenStreetMap). Desmarque para um terreno vazio.
        </label>
      )}
      <div className="flex flex-wrap gap-1.5">
        {lista.map((m) => (
          <button key={m.ibge} onClick={() => onEscolher(m)} title={m.descricao}
            className={`text-left rounded-lg px-2.5 py-1.5 border text-xs transition-colors ${m.ibge === atual.ibge ? 'border-acento bg-acento/15 text-white' : 'border-white/10 bg-white/5 text-suave hover:text-white hover:bg-white/10'}`}>
            <div className="font-semibold">{m.nome}{m.capital && <span className="text-acento-2 font-normal"> ★ capital</span>}{reais.includes(m.ibge) && <span className="text-acento font-normal" title="Ruas e prédios reais do OpenStreetMap"> 🏙 real</span>}</div>
            <div className="text-[10px] opacity-80">{fmt.pessoas(m.populacao)} · {TERRENO_NOME[m.terreno.tipo] ?? m.terreno.tipo} · {BIOMA_NOME[m.bioma]}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

function Tracos({ uf }: { uf: ResumoUF }) {
  return (
    <div className="surgir" key={uf.sigla}>
      <div className="titulo text-sm text-suave mb-2">Traços do estado</div>
      <div className="flex flex-col gap-2">
        {uf.tracos.tracos.map((t) => (
          <div key={t.id} className={`rounded-lg px-3 py-2 border ${t.tipo === 'buff' ? 'border-acento/30 bg-acento/5' : t.tipo === 'nerf' ? 'border-perigo/30 bg-perigo/5' : 'border-acento-2/30 bg-acento-2/5'}`}>
            <div className="flex items-center gap-2">
              <span className={`text-[10px] font-bold uppercase ${t.tipo === 'buff' ? 'text-acento' : t.tipo === 'nerf' ? 'text-perigo' : 'text-acento-2'}`}>
                {t.tipo === 'buff' ? '▲ vantagem' : t.tipo === 'nerf' ? '▼ problema' : '◆ faca de dois gumes'}
              </span>
              <span className="text-sm font-semibold">{t.nome}</span>
            </div>
            <div className="text-xs text-suave mt-0.5">{t.descricao}</div>
          </div>
        ))}
      </div>
      <div className="titulo text-sm text-suave mt-4 mb-1">Desafios do mandato</div>
      <ul className="text-xs text-texto/85 list-disc pl-4 space-y-0.5">
        {uf.tracos.desafios.map((d) => <li key={d}>{d}</li>)}
      </ul>
      <div className="mt-4 italic text-sm text-acento/90">“{uf.tracos.saudacao}”</div>
    </div>
  );
}

export function SelecaoScreen() {
  const indice = useApp((s) => s.indice);
  const metrica = useApp((s) => s.metrica);
  const setMetrica = useApp((s) => s.setMetrica);
  const hover = useApp((s) => s.hover);
  const selecionada = useApp((s) => s.selecionada);
  const modo = useApp((s) => s.modo);
  const setModo = useApp((s) => s.setModo);
  const irPara = useApp((s) => s.irPara);
  const iniciar = useApp((s) => s.iniciar);
  const daltonico = useApp((s) => s.daltonico);
  const [completa, setCompleta] = useState<DadosUF | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [municipios, setMunicipios] = useState<MunicipioJogavel[] | null>(null);
  const municipio = useApp((s) => s.municipio);
  const setMunicipio = useApp((s) => s.setMunicipio);

  const mostrada = resumo(indice, hover ?? selecionada);
  const sel = resumo(indice, selecionada);

  useEffect(() => {
    let vivo = true;
    setCompleta(null);
    const s = hover ?? selecionada;
    if (s) carregarUF(s).then((d) => vivo && setCompleta(d)).catch(() => undefined);
    return () => { vivo = false; };
  }, [hover, selecionada]);

  useEffect(() => {
    let vivo = true;
    setMunicipios(null);
    setMunicipio(null);
    if (selecionada) carregarMunicipios(selecionada).then((d) => vivo && setMunicipios(d?.municipios ?? null)).catch(() => undefined);
    return () => { vivo = false; };
  }, [selecionada, setMunicipio]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') irPara('menu'); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [irPara]);

  const assumir = async () => {
    if (!sel) return;
    setCarregando(true);
    const d = await carregarUF(sel.sigla);
    iniciar(d);
  };

  const def = METRICAS[metrica];
  return (
    <div className="absolute inset-0 pointer-events-none">
      {/* topo */}
      <div className="absolute top-0 inset-x-0 flex items-center justify-between p-4 pointer-events-auto">
        <button onClick={() => irPara('menu')} className="painel rounded-lg px-3 py-2 flex items-center gap-1 text-sm hover:bg-white/10">
          <Icone nome="voltar" tamanho={16} /> Menu
        </button>
        <div className="titulo text-lg text-white/85">Escolha seu estado</div>
        <div className="painel rounded-lg p-1 flex text-sm">
          {(['mandato', 'sandbox'] as const).map((m) => (
            <button key={m} onClick={() => setModo(m)} className={`px-3 py-1.5 rounded-md ${modo === m ? 'bg-acento text-tinta font-semibold' : 'text-suave hover:text-white'}`}>
              {m === 'mandato' ? 'Mandato' : 'Sandbox'}
            </button>
          ))}
        </div>
      </div>

      {/* métricas */}
      <div className="absolute left-4 top-20 painel rounded-xl p-3 w-56 pointer-events-auto max-h-[calc(100%-7rem)] overflow-auto">
        <div className="titulo text-xs text-suave mb-2">Ver o Brasil por</div>
        {(Object.keys(METRICAS) as Metrica[]).map((m) => (
          <button key={m} onClick={() => setMetrica(m)} className={`w-full text-left text-sm px-2.5 py-1.5 rounded-md ${metrica === m ? 'bg-white/10 text-white' : 'text-suave hover:text-white hover:bg-white/5'}`}>
            {METRICAS[m].nome}
          </button>
        ))}
        <div className="mt-3 pt-3 border-t border-borda">
          {metrica === 'regiao' ? (
            <div className="grid grid-cols-2 gap-1 text-[11px]">
              {Object.entries({ N: 'Norte', NE: 'Nordeste', CO: 'Centro-Oeste', SE: 'Sudeste', S: 'Sul' }).map(([k, v]) => (
                <span key={k} className="flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: CORES_REGIAO[k] }} />{v}</span>
              ))}
            </div>
          ) : (
            <>
              <div className="h-2 rounded" style={{ background: `linear-gradient(90deg, ${[0, 0.25, 0.5, 0.75, 1].map((t) => corRampa(t, daltonico)).join(',')})` }} />
              <div className="flex justify-between text-[10px] text-suave mt-1"><span>pior</span><span>melhor</span></div>
              <div className="text-[10px] text-suave/70 mt-1">Altura = valor. Fonte: {def.fonte}</div>
            </>
          )}
        </div>
      </div>

      {/* ficha */}
      {mostrada ? (
        <div className={`absolute right-4 top-20 ${sel && municipios ? 'bottom-[17rem]' : 'bottom-24'} w-[min(420px,calc(100%-2rem))] painel rounded-xl p-5 pointer-events-auto overflow-auto`}>
          <Ficha uf={mostrada} completa={completa?.sigla === mostrada.sigla ? completa : null} />
          <div className="mt-5 pt-4 border-t border-borda"><Tracos uf={mostrada} /></div>
        </div>
      ) : (
        <div className="absolute right-6 top-1/2 -translate-y-1/2 text-right text-suave text-sm max-w-xs pulsar">
          Passe o mouse sobre um estado para ver a ficha.<br />Clique para escolher.
        </div>
      )}

      {/* rodapé */}
      <div className="absolute bottom-4 inset-x-0 flex flex-col items-center gap-2 pointer-events-auto px-4">
        {sel && municipios && municipios.length > 1 && <EscolhaMunicipio lista={municipios} escolhido={municipio} onEscolher={setMunicipio} />}
        <button
          disabled={!sel || carregando}
          onClick={assumir}
          className={`rounded-xl px-8 py-3.5 titulo text-xl font-semibold transition-all ${sel ? 'bg-acento text-tinta hover:scale-[1.03] shadow-[0_0_40px_rgba(62,224,176,0.35)]' : 'painel text-suave'}`}
        >
          {carregando ? 'Preparando a posse…' : sel ? `Assumir o governo ${deUF(sel.sigla, sel.nome)}${municipio && !municipio.capital ? ` em ${municipio.nome}` : ''} →` : 'Selecione um estado no mapa'}
        </button>
      </div>
    </div>
  );
}
