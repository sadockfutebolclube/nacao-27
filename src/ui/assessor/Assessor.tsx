/**
 * Cartão do assessor (Fase 10): mostra o passo atual do tutorial ou uma dica de contexto.
 * O progresso fica no navegador (`nacao27:tutorial`), separado por modo; o jogador pode recolher,
 * pular o tutorial ou religá-lo nas opções.
 */
import { useEffect, useState } from 'react';
import { useApp } from '../../app/store';
import { Retrato } from '../governo/Retrato';
import type { Assessor as TAssessor, Dica, Passo } from './roteiros';

const CHAVE = 'nacao27:tutorial';
interface Progresso { passos: Record<string, string[]>; dicas: string[] }
function ler(): Progresso {
  try { return { passos: {}, dicas: [], ...(JSON.parse(localStorage.getItem(CHAVE) ?? '{}') as Partial<Progresso>) }; } catch { return { passos: {}, dicas: [] }; }
}
function gravar(p: Progresso) { try { localStorage.setItem(CHAVE, JSON.stringify(p)); } catch { /* modo privado */ } }
export function reiniciarTutorial() { gravar({ passos: {}, dicas: [] }); }

export function Assessor<C>({ modo, quem, passos, dicas, ctx, className }: { modo: string; quem: TAssessor; passos: Passo<C>[]; dicas: Dica<C>[]; ctx: C | null; className?: string }) {
  const ligado = useApp((s) => s.tutorial);
  const setPref = useApp((s) => s.setPref);
  const [prog, setProg] = useState<Progresso>(ler);
  const [recolhido, setRecolhido] = useState(false);
  const [dica, setDica] = useState<Dica<C> | null>(null);
  useEffect(() => { if (ligado) setProg(ler()); }, [ligado]);

  const feitos = prog.passos[modo] ?? [];
  const visiveis = ctx ? passos.filter((p) => !p.so || p.so(ctx)) : passos;
  const atual = visiveis.find((p) => !feitos.includes(p.id)) ?? null;

  const concluir = (id: string) => {
    const novo = { ...prog, passos: { ...prog.passos, [modo]: [...feitos, id] } };
    setProg(novo); gravar(novo);
  };

  // avanço automático quando o jogador faz o que o passo pede
  useEffect(() => {
    if (!ligado || !ctx || !atual?.feito) return;
    if (atual.feito(ctx)) concluir(atual.id);
  });

  // dicas de contexto: só quando o roteiro acabou ou está esperando uma ação, e uma por vez
  useEffect(() => {
    if (!ligado || !ctx || dica) return;
    const d = dicas.find((x) => !prog.dicas.includes(x.id) && x.quando(ctx));
    if (d) setDica(d);
  });

  if (!ligado || !ctx) return null;
  const fecharDica = () => {
    if (!dica) return;
    const novo = { ...prog, dicas: [...prog.dicas, dica.id] };
    setProg(novo); gravar(novo); setDica(null);
  };
  const mostrando = dica ?? atual;
  if (!mostrando) return null;
  const titulo = dica ? 'Uma dica' : atual!.titulo;
  const texto = dica ? dica.texto : atual!.texto;

  if (recolhido) {
    return (
      <button onClick={() => setRecolhido(false)} className={`${className ?? ''} painel rounded-full p-1 pr-3 flex items-center gap-2 pointer-events-auto text-xs`} aria-label={`Abrir conselho de ${quem.nome}`}>
        <Retrato semente={quem.retrato} genero={quem.genero} idade={quem.idade} tamanho={30} />
        <span className={dica?.tom === 'alerta' ? 'text-acento-2' : 'text-suave'}>{quem.nome.split(' ')[0]} quer falar</span>
      </button>
    );
  }
  return (
    <div className={`${className ?? ''} painel rounded-xl p-3 w-80 pointer-events-auto surgir ${dica?.tom === 'alerta' ? 'border-acento-2/50' : ''}`} role="status" aria-live="polite" key={dica?.id ?? atual?.id}>
      <div className="flex gap-2 items-start">
        <Retrato semente={quem.retrato} genero={quem.genero} idade={quem.idade} tamanho={42} />
        <div className="flex-1 min-w-0">
          <div className="text-[10px] uppercase tracking-wider text-suave">{quem.nome} · {quem.cargo}</div>
          <div className="font-semibold text-sm leading-tight">{titulo}</div>
        </div>
        <button onClick={() => setRecolhido(true)} className="text-suave hover:text-white text-xs" aria-label="Recolher">—</button>
      </div>
      <p className="text-xs text-texto/90 mt-2 leading-relaxed">{texto}</p>
      <div className="flex items-center gap-2 mt-2">
        {dica ? (
          <button onClick={fecharDica} className="px-3 py-1 rounded-lg bg-acento text-tinta text-xs font-semibold">Entendi</button>
        ) : atual!.botao ? (
          <button onClick={() => concluir(atual!.id)} className="px-3 py-1 rounded-lg bg-acento text-tinta text-xs font-semibold">{atual!.botao}</button>
        ) : (
          <span className="text-[10px] text-acento-2">Esperando você…</span>
        )}
        {!dica && <span className="text-[10px] text-suave num">{visiveis.indexOf(atual!) + 1}/{visiveis.length}</span>}
        <button onClick={() => setPref({ tutorial: false })} className="text-[10px] text-suave hover:text-white ml-auto">desligar dicas</button>
      </div>
    </div>
  );
}
