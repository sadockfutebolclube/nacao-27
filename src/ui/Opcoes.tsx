/**
 * Opções (Fase 10): acessibilidade, gráficos, tutorial e som — no menu e nos menus de pausa.
 * As preferências ficam no navegador (useApp → localStorage).
 */
import { useEffect } from 'react';
import { useApp } from '../app/store';
import { acessibilidade } from '../render/acessibilidade';
import { reiniciarTutorial } from './assessor/Assessor';
import { ControlesSom } from './hud/Trilha';
import { Icone } from './Icone';

function Opcao({ rotulo, dica, children }: { rotulo: string; dica?: string; children: React.ReactNode }) {
  return (
    <div className="py-2 border-b border-white/5">
      <div className="flex items-center justify-between gap-3 text-sm"><span>{rotulo}</span>{children}</div>
      {dica && <div className="text-[10px] text-suave mt-0.5">{dica}</div>}
    </div>
  );
}

function Alternar({ ligado, onChange, rotulo }: { ligado: boolean; onChange: (v: boolean) => void; rotulo: string }) {
  return (
    <button role="switch" aria-checked={ligado} aria-label={rotulo} onClick={() => onChange(!ligado)} className={`w-10 h-5 rounded-full relative transition-colors ${ligado ? 'bg-acento' : 'bg-white/15'}`}>
      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${ligado ? 'left-[1.3rem]' : 'left-0.5'}`} />
    </button>
  );
}

export function OpcoesGerais({ som = true }: { som?: boolean }) {
  const a = useApp();
  return (
    <div>
      <div className="titulo text-xs text-suave mt-1">Acessibilidade</div>
      <Opcao rotulo={`Tamanho da interface: ${Math.round(a.escalaUI * 100)}%`}>
        <input type="range" min={0.8} max={1.5} step={0.05} value={a.escalaUI} onChange={(e) => a.setEscalaUI(Number(e.target.value))} className="w-32" aria-label="Tamanho da interface" />
      </Opcao>
      <Opcao rotulo="Paleta para daltonismo" dica="Mapas e camadas com cores distinguíveis por quem não diferencia verde e vermelho."><Alternar rotulo="Paleta para daltonismo" ligado={a.daltonico} onChange={a.setDaltonico} /></Opcao>
      <Opcao rotulo="Alto contraste" dica="Painéis opacos e textos secundários mais claros."><Alternar rotulo="Alto contraste" ligado={a.altoContraste} onChange={(v) => a.setPref({ altoContraste: v })} /></Opcao>
      <Opcao rotulo="Reduzir movimento" dica="Sem animações de interface, câmera parada no menu e sem clarões de raio."><Alternar rotulo="Reduzir movimento" ligado={a.reduzirMovimento} onChange={(v) => a.setPref({ reduzirMovimento: v })} /></Opcao>
      <div className="titulo text-xs text-suave mt-3">Gráficos</div>
      <Opcao rotulo="Qualidade" dica="Automática ajusta resolução, sombras e efeitos ao desempenho do seu computador.">
        <select value={a.qualidade} onChange={(e) => a.setPref({ qualidade: e.target.value as typeof a.qualidade })} className="bg-white/5 border border-borda rounded px-2 py-1 text-xs" aria-label="Qualidade gráfica">
          <option value="auto">Automática</option><option value="alta">Alta</option><option value="media">Média</option><option value="baixa">Baixa</option>
        </select>
      </Opcao>
      <div className="titulo text-xs text-suave mt-3">Tutorial</div>
      <Opcao rotulo="Dicas do assessor"><Alternar rotulo="Dicas do assessor" ligado={a.tutorial} onChange={(v) => a.setPref({ tutorial: v })} /></Opcao>
      <Opcao rotulo="Recomeçar o tutorial"><button onClick={() => { reiniciarTutorial(); a.setPref({ tutorial: false }); setTimeout(() => a.setPref({ tutorial: true }), 0); }} className="text-xs px-2 py-1 rounded bg-white/8 hover:bg-white/12">Recomeçar</button></Opcao>
      {som && <><div className="titulo text-xs text-suave mt-3">Som</div><ControlesSom /></>}
    </div>
  );
}

export function TelaOpcoes({ onFechar }: { onFechar: () => void }) {
  return (
    <div className="absolute inset-0 bg-black/60 pointer-events-auto flex items-center justify-center p-4 z-30" onClick={onFechar}>
      <div className="painel rounded-xl p-6 w-full max-w-md max-h-[88vh] overflow-auto surgir" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Opções">
        <div className="flex items-center justify-between mb-2"><h2 className="titulo text-2xl">Opções</h2><button onClick={onFechar} className="text-suave hover:text-white" aria-label="Fechar"><Icone nome="x" /></button></div>
        <OpcoesGerais som={false} />
        <p className="text-[10px] text-suave mt-3">Teclado: Tab navega pelos botões, Enter/Espaço ativa, Esc fecha janelas e abre o menu de pausa.</p>
      </div>
    </div>
  );
}

/** Aplica alto contraste e movimento reduzido no documento e nos efeitos 3D. */
export function AplicarAcessibilidade() {
  const alto = useApp((s) => s.altoContraste);
  const reduzir = useApp((s) => s.reduzirMovimento);
  const escala = useApp((s) => s.escalaUI);
  const tela = useApp((s) => s.tela);
  useEffect(() => {
    document.documentElement.classList.toggle('alto-contraste', alto);
    document.documentElement.classList.toggle('reduzir-movimento', reduzir);
    acessibilidade.reduzirMovimento = reduzir;
  }, [alto, reduzir]);
  // fora da cidade (que escala o HUD), a escala vale como tamanho de fonte da página
  const cidade = tela === 'jogo' || tela === 'carregando';
  useEffect(() => { document.documentElement.style.fontSize = cidade ? '16px' : `${16 * escala}px`; }, [escala, cidade]);
  return null;
}
