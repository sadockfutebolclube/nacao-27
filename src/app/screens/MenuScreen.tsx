import { useRef, useState } from 'react';
import { carregarUF } from '../../data/loader';
import type { SaveData } from '../../sim/protocol';
import { listarSaves, listarSavesPres, lerArquivoQualquer, type SavePres, type SlotInfo, type SlotPres } from '../../save/save';
import { carregarMacro } from '../../data/loader';
import { usePres } from '../../sim/presidente/store';
import { baixarNuvem, listarNuvem, nuvemConfigurada, type SaveNuvem } from '../../cloud/nuvem';
import { Login, Ranking, useSessao } from '../../ui/presidente/Nuvem';
import { GaleriaConquistas } from '../../ui/conquistas/Conquistas';
import { TelaOpcoes } from '../../ui/Opcoes';
import { Icone } from '../../ui/Icone';
import { useApp } from '../store';

function ItemMenu({ titulo, sub, onClick, desativado, destaque }: { titulo: string; sub: string; onClick?: () => void; desativado?: boolean; destaque?: boolean }) {
  return (
    <button
      disabled={desativado}
      onClick={onClick}
      className={`group text-left w-full px-5 py-2.5 rounded-lg transition-all border ${
        desativado ? 'opacity-40 cursor-not-allowed border-transparent' : destaque ? 'border-acento/40 bg-acento/10 hover:bg-acento/20 hover:translate-x-1' : 'border-transparent hover:border-borda hover:bg-white/5 hover:translate-x-1'
      }`}
    >
      <div className={`titulo text-2xl font-semibold ${destaque ? 'text-acento' : 'text-texto'}`}>{titulo}</div>
      <div className="text-xs text-suave mt-0.5">{sub}</div>
    </button>
  );
}

export function MenuScreen() {
  const irPara = useApp((s) => s.irPara);
  const setModo = useApp((s) => s.setModo);
  const iniciar = useApp((s) => s.iniciar);
  const indice = useApp((s) => s.indice);
  const erro = useApp((s) => s.erro);
  const [saves, setSaves] = useState<SlotInfo[] | null>(null);
  const [savesPres, setSavesPres] = useState<SlotPres[]>([]);
  const [ranking, setRanking] = useState(false);
  const [conquistas, setConquistas] = useState(false);
  const [opcoes, setOpcoes] = useState(false);
  const sessaoNuvem = useSessao();
  const [nuvem, setNuvem] = useState<SaveNuvem[] | null>(null);
  const restaurarPres = usePres((s) => s.restaurar);
  const carregarPres = async (s: SavePres) => { await restaurarPres(s.dados, await carregarMacro()); irPara('presidente'); };
  const abrirSaves = async () => {
    setSavesPres(await listarSavesPres());
    setSaves(await listarSaves());
    if (nuvemConfigurada()) listarNuvem().then(setNuvem).catch(() => setNuvem([]));
  };
  const carregarNuvem = async (x: SaveNuvem) => {
    try {
      const json = await baixarNuvem(x.id);
      if (x.modo === 'presidente') { await restaurarPres(json, await carregarMacro()); irPara('presidente'); } else await carregar(JSON.parse(json) as SaveData);
    } catch (e) { setMsg(String(e)); }
  };
  const [msg, setMsg] = useState<string | null>(null);
  const arquivo = useRef<HTMLInputElement>(null);

  const carregar = async (save: SaveData) => {
    const d = await carregarUF(save.init.sigla);
    iniciar(d, save);
  };

  return (
    <div className="absolute inset-0 pointer-events-none">
      <div className="absolute inset-y-0 left-0 w-[min(520px,100%)] bg-gradient-to-r from-black/85 via-black/55 to-transparent pointer-events-auto flex flex-col px-10 sm:px-16 overflow-y-auto py-6 [&>*:first-child]:mt-auto [&>*:last-child]:mb-auto">
        <div className="surgir">
          <div className="text-acento/80 text-xs tracking-[0.35em] uppercase mb-3">Simulador de governo · Brasil</div>
          <h1 className="titulo text-7xl sm:text-8xl font-bold leading-[0.85] text-white">
            Nação<span className="text-acento">27</span>
          </h1>
          <p className="mt-5 text-sm text-suave max-w-sm leading-relaxed">
            Você acabou de ganhar a eleição. Tem 4 anos, um orçamento apertado, uma Assembleia que não confia em você,
            uma imprensa faminta e milhões de pessoas esperando milagre. <span className="text-texto">Boa sorte, Governador(a).</span>
          </p>
        </div>

        <nav className="mt-10 flex flex-col gap-1 max-w-sm surgir" style={{ animationDelay: '0.15s' }}>
          <ItemMenu destaque titulo="Novo mandato" sub="Escolha um dos 27 estados e governe por 4 anos" onClick={() => { setModo('mandato'); irPara('selecao'); }} desativado={!indice} />
          <ItemMenu titulo="Sandbox urbanista" sub="Dinheiro infinito. Só construir." onClick={() => { setModo('sandbox'); irPara('selecao'); }} desativado={!indice} />
          <ItemMenu titulo="Presidente" sub="Congresso, STF, Banco Central e câmbio — com a economia real de hoje" onClick={() => { useApp.setState({ carreira: null, selecionada: null }); irPara('presidente-setup'); }} desativado={!indice} />
          <ItemMenu titulo="Carregar jogo" sub="Saves locais, na nuvem ou arquivo .nacao" onClick={abrirSaves} />
          <ItemMenu titulo="Conquistas" sub="Marcos de cidade, estado, Presidência e Brasil" onClick={() => setConquistas(true)} />
          <ItemMenu titulo="Ranking" sub="Os melhores legados de governadores e presidentes" onClick={() => setRanking(true)} desativado={!nuvemConfigurada()} />
          <ItemMenu titulo="Opções" sub="Acessibilidade, gráficos e tutorial" onClick={() => setOpcoes(true)} />
        </nav>

        {erro && <div className="mt-6 text-perigo text-sm max-w-sm">{erro}</div>}
        {msg && <div className="mt-4 text-acento-2 text-sm max-w-sm">{msg}</div>}

        <div className="mt-6 text-[11px] text-suave/70 leading-relaxed max-w-sm">
          Dados reais: IBGE (população 2026, PIB 2023, malhas), SICONFI/Tesouro (finanças 2024), INEP, SNIS, FBSP, TSE, Banco Central.<br />
          Personagens e grupos são fictícios. v1.1 · Fase 11
        </div>
      </div>

      {conquistas && <GaleriaConquistas onFechar={() => setConquistas(false)} />}
      {opcoes && <TelaOpcoes onFechar={() => setOpcoes(false)} />}
      {ranking && (
        <div className="absolute inset-0 bg-black/60 pointer-events-auto flex items-center justify-center p-4" onClick={() => setRanking(false)}>
          <div className="painel rounded-xl p-6 w-full max-w-lg max-h-[85vh] overflow-auto surgir" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3"><h2 className="titulo text-2xl">Ranking</h2><button onClick={() => setRanking(false)} className="text-suave hover:text-white"><Icone nome="x" /></button></div>
            <div className="titulo text-sm text-suave mb-1">Presidentes</div>
            <Ranking modo="presidente" />
            <div className="titulo text-sm text-suave mt-4 mb-1">Governadores</div>
            <Ranking modo="governador" />
          </div>
        </div>
      )}
      {saves && (
        <div className="absolute inset-0 bg-black/60 pointer-events-auto flex items-center justify-center p-4" onClick={() => setSaves(null)}>
          <div className="painel rounded-xl p-6 w-full max-w-md surgir" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="titulo text-2xl">Carregar jogo</h2>
              <button onClick={() => setSaves(null)} className="text-suave hover:text-white"><Icone nome="x" /></button>
            </div>
            {saves.length === 0 && savesPres.length === 0 && <p className="text-sm text-suave">Nenhum save local ainda.</p>}
            <div className="flex flex-col gap-2 max-h-72 overflow-auto">
              {saves.map((s) => (
                <button key={s.chave} onClick={() => carregar(s.save)} className="text-left px-4 py-3 rounded-lg border border-borda hover:bg-white/5">
                  <div className="font-semibold">{s.save.init.cidade} — {s.save.init.sigla} <span className="text-suave font-normal text-xs">({s.save.init.modo})</span></div>
                  <div className="text-xs text-suave">{s.rotulo}</div>
                </button>
              ))}
              {savesPres.map((s) => (
                <button key={s.chave} onClick={() => carregarPres(s.save)} className="text-left px-4 py-3 rounded-lg border border-acento-2/30 hover:bg-white/5">
                  <div className="font-semibold">🏛 Presidência</div>
                  <div className="text-xs text-suave">{s.rotulo}</div>
                </button>
              ))}
            </div>
            {nuvemConfigurada() && (
              <div className="mt-4 pt-3 border-t border-borda">
                <div className="text-xs text-suave mb-2">Na nuvem</div>
                <Login s={sessaoNuvem}>
                  <div className="flex flex-col gap-1 mt-2 max-h-40 overflow-auto">
                    {nuvem?.length === 0 && <div className="text-xs text-suave">Nenhum save na nuvem.</div>}
                    {nuvem?.map((x) => <button key={x.id} onClick={() => carregarNuvem(x)} className="text-left text-xs px-3 py-2 rounded-lg border border-borda hover:bg-white/5">{x.modo === 'presidente' ? '🏛 ' : ''}{x.rotulo} <span className="text-suave">· {new Date(x.criado_em).toLocaleDateString('pt-BR')}</span></button>)}
                  </div>
                </Login>
              </div>
            )}
            <button onClick={() => arquivo.current?.click()} className="mt-4 w-full px-4 py-2.5 rounded-lg bg-white/5 hover:bg-white/10 border border-borda text-sm flex items-center justify-center gap-2">
              <Icone nome="carregar" tamanho={16} /> Abrir arquivo .nacao
            </button>
            <input ref={arquivo} type="file" accept=".nacao,.json" className="hidden" onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try { const s = await lerArquivoQualquer(f); if (s.formato === 'nacao27-presidente') await carregarPres(s); else await carregar(s); } catch (err) { setMsg(String(err)); setSaves(null); }
            }} />
          </div>
        </div>
      )}
    </div>
  );
}
