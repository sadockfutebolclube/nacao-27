import { useRef, useState } from 'react';
import { carregarUF } from '../../data/loader';
import type { SaveData } from '../../sim/protocol';
import { listarSaves, lerArquivoNacao, type SlotInfo } from '../../save/save';
import { baixarNuvem, listarNuvem, nuvemConfigurada, type SaveNuvem } from '../../cloud/nuvem';
import { Login, Ranking, useSessao } from '../../ui/nuvem/Nuvem';
import { novoJogoRio } from '../App';
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
  const iniciar = useApp((s) => s.iniciar);
  const erro = useApp((s) => s.erro);
  const [saves, setSaves] = useState<SlotInfo[] | null>(null);
  const [ranking, setRanking] = useState(false);
  const [conquistas, setConquistas] = useState(false);
  const [opcoes, setOpcoes] = useState(false);
  const sessaoNuvem = useSessao();
  const [nuvem, setNuvem] = useState<SaveNuvem[] | null>(null);
  const abrirSaves = async () => {
    // saves de outros estados (antes da Fase 13) não abrem mais: o jogo é só o Rio
    setSaves((await listarSaves()).filter((x) => x.save.init.sigla === 'RJ'));
    if (nuvemConfigurada()) listarNuvem().then(setNuvem).catch(() => setNuvem([]));
  };
  const carregarNuvem = async (x: SaveNuvem) => {
    try {
      const json = await baixarNuvem(x.id);
      if (x.modo === 'presidente') setMsg('O Modo Presidente saiu do jogo na Fase 13.'); else await carregar(JSON.parse(json) as SaveData);
    } catch (e) { setMsg(String(e)); }
  };
  const [msg, setMsg] = useState<string | null>(null);
  const arquivo = useRef<HTMLInputElement>(null);

  const carregar = async (save: SaveData) => {
    if (save.init.sigla !== 'RJ') { setMsg('Este save é de outro estado: o jogo agora é só o Rio de Janeiro.'); return; }
    const d = await carregarUF(save.init.sigla);
    iniciar(d, save);
  };

  return (
    <div className="absolute inset-0 pointer-events-none">
      <FundoRio />
      <div className="absolute inset-y-0 left-0 w-[min(520px,100%)] bg-gradient-to-r from-black/85 via-black/55 to-transparent pointer-events-auto flex flex-col px-10 sm:px-16 overflow-y-auto py-6 [&>*:first-child]:mt-auto [&>*:last-child]:mb-auto">
        <div className="surgir">
          <div className="text-acento/80 text-xs tracking-[0.35em] uppercase mb-3">Simulador de governo · Rio de Janeiro</div>
          <h1 className="titulo text-7xl sm:text-8xl font-bold leading-[0.85] text-white">
            Nação<span className="text-acento">27</span>
          </h1>
          <p className="mt-5 text-sm text-suave max-w-sm leading-relaxed">
            Você acabou de ganhar a eleição no Rio. Tem 4 anos, um orçamento apertado, uma Alerj que não confia em você,
            uma imprensa faminta e 17 milhões de fluminenses esperando milagre. <span className="text-texto">Boa sorte, Governador(a).</span>
          </p>
        </div>

        <nav className="mt-10 flex flex-col gap-1 max-w-sm surgir" style={{ animationDelay: '0.15s' }}>
          <ItemMenu destaque titulo="Novo mandato" sub="Governe o estado do Rio por 4 anos, a partir da capital real" onClick={() => novoJogoRio('mandato').catch((e) => setMsg(String(e)))} />
          <ItemMenu titulo="Sandbox urbanista" sub="O Rio de verdade, dinheiro infinito. Só construir." onClick={() => novoJogoRio('sandbox').catch((e) => setMsg(String(e)))} />
          <ItemMenu titulo="Carregar jogo" sub="Saves locais, na nuvem ou arquivo .nacao" onClick={abrirSaves} />
          <ItemMenu titulo="Conquistas" sub="Marcos da cidade e do governo do estado" onClick={() => setConquistas(true)} />
          <ItemMenu titulo="Ranking" sub="Os melhores legados de governadores do Rio" onClick={() => setRanking(true)} desativado={!nuvemConfigurada()} />
          <ItemMenu titulo="Opções" sub="Acessibilidade, gráficos e tutorial" onClick={() => setOpcoes(true)} />
        </nav>

        {erro && <div className="mt-6 text-perigo text-sm max-w-sm">{erro}</div>}
        {msg && <div className="mt-4 text-acento-2 text-sm max-w-sm">{msg}</div>}

        <div className="mt-6 text-[11px] text-suave/70 leading-relaxed max-w-sm">
          Dados reais: IBGE, SICONFI/Tesouro, INEP, SNIS, FBSP, TSE; cidade do OpenStreetMap (© colaboradores do OSM).<br />
          Personagens e grupos são fictícios. v{__APP_VERSAO__} · {__APP_FASE__}
        </div>
      </div>

      {conquistas && <GaleriaConquistas onFechar={() => setConquistas(false)} />}
      {opcoes && <TelaOpcoes onFechar={() => setOpcoes(false)} />}
      {ranking && (
        <div className="absolute inset-0 bg-black/60 pointer-events-auto flex items-center justify-center p-4" onClick={() => setRanking(false)}>
          <div className="painel rounded-xl p-6 w-full max-w-lg max-h-[85vh] overflow-auto surgir" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3"><h2 className="titulo text-2xl">Ranking</h2><button onClick={() => setRanking(false)} className="text-suave hover:text-white"><Icone nome="x" /></button></div>
            <Ranking />
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
            {saves.length === 0 && <p className="text-sm text-suave">Nenhum save local ainda.</p>}
            <div className="flex flex-col gap-2 max-h-72 overflow-auto">
              {saves.map((s) => (
                <button key={s.chave} onClick={() => carregar(s.save)} className="text-left px-4 py-3 rounded-lg border border-borda hover:bg-white/5">
                  <div className="font-semibold">{s.save.init.cidade} — {s.save.init.sigla} <span className="text-suave font-normal text-xs">({s.save.init.modo})</span></div>
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
                    {nuvem?.filter((x) => x.modo !== 'presidente').map((x) => <button key={x.id} onClick={() => carregarNuvem(x)} className="text-left text-xs px-3 py-2 rounded-lg border border-borda hover:bg-white/5">{x.rotulo} <span className="text-suave">· {new Date(x.criado_em).toLocaleDateString('pt-BR')}</span></button>)}
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
              try { await carregar(await lerArquivoNacao(f)); } catch (err) { setMsg(String(err)); setSaves(null); }
            }} />
          </div>
        </div>
      )}
    </div>
  );
}

/** Fundo do menu: baía ao entardecer com as silhuetas do Corcovado, do Morro da Urca e do Pão de Açúcar. */
function FundoRio() {
  return (
    <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_70%_70%,#f2a46b_0%,#b45a5a_22%,#3a2c4a_48%,#0b1220_80%)]">
      <svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMax slice" className="absolute inset-0 w-full h-full" aria-hidden>
        <path d="M0 640 L180 600 L260 520 L300 470 L330 450 L355 470 L380 520 L470 590 L560 610 L640 560 L700 430 L725 405 L745 400 L760 430 L800 560 L880 600 L960 560 L1020 470 L1060 360 L1085 300 L1110 280 L1130 300 L1150 380 L1190 520 L1260 580 L1380 560 L1460 600 L1600 590 L1600 900 L0 900 Z" fill="#0d1424" opacity="0.92" />
        <path d="M0 700 L1600 700 L1600 900 L0 900 Z" fill="#0a101c" opacity="0.85" />
        <line x1="760" y1="430" x2="1085" y2="300" stroke="#f5d6a8" strokeWidth="1.2" opacity="0.5" />
        <rect x="905" y="362" width="10" height="7" rx="2" fill="#f5d6a8" opacity="0.8" />
        <path d="M352 452 L352 432 M342 440 L362 440" stroke="#f5e2c0" strokeWidth="3" opacity="0.85" />
      </svg>
    </div>
  );
}
