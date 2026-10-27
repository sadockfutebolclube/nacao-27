/** Conquistas permanentes (Fase 10): verificação periódica, aviso na tela e galeria no menu. */
import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { CONQUISTAS, checarConquistas, lerConquistas, type Categoria, type CtxConquista, type DefConquista } from '../../conquistas/conquistas';
import { Icone } from '../Icone';

const useAvisos = create<{ fila: DefConquista[]; push: (d: DefConquista[]) => void; tirar: () => void }>((set) => ({
  fila: [],
  push: (d) => set((s) => ({ fila: [...s.fila, ...d] })),
  tirar: () => set((s) => ({ fila: s.fila.slice(1) })),
}));

/** Checa as conquistas a cada 2 s com o contexto mais recente. */
export function useConquistas(ctx: () => Omit<CtxConquista, 'registro'> | null) {
  useEffect(() => {
    const t = setInterval(() => {
      const c = ctx();
      if (!c) return;
      const novas = checarConquistas(c);
      if (novas.length) useAvisos.getState().push(novas);
    }, 2000);
    return () => clearInterval(t);
  }, [ctx]);
}

/** Aviso de conquista desbloqueada (global, no topo da tela). */
export function AvisoConquista() {
  const atual = useAvisos((s) => s.fila[0]);
  const tirar = useAvisos((s) => s.tirar);
  useEffect(() => {
    if (!atual) return;
    const t = setTimeout(tirar, 4500);
    return () => clearTimeout(t);
  }, [atual, tirar]);
  if (!atual) return null;
  return (
    <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 painel rounded-2xl px-5 py-3 flex items-center gap-3 border-acento-2/60 surgir pointer-events-none" role="status" aria-live="polite" key={atual.id}>
      <span className="text-3xl" aria-hidden>{atual.icone}</span>
      <div>
        <div className="text-[10px] uppercase tracking-[0.25em] text-acento-2">Conquista desbloqueada</div>
        <div className="titulo text-lg leading-tight">{atual.nome}</div>
        <div className="text-xs text-suave">{atual.desc}</div>
      </div>
    </div>
  );
}

const CATS: { id: Categoria; nome: string }[] = [
  { id: 'cidade', nome: 'Cidade' }, { id: 'estado', nome: 'Governo estadual' },
];

/** Galeria de conquistas (menu). */
export function GaleriaConquistas({ onFechar }: { onFechar: () => void }) {
  const [s] = useState(lerConquistas);
  const total = Object.keys(s.desbloqueadas).length;
  const ctx: CtxConquista = { registro: s.registro };
  return (
    <div className="absolute inset-0 bg-black/60 pointer-events-auto flex items-center justify-center p-4 z-30" onClick={onFechar}>
      <div className="painel rounded-xl p-6 w-full max-w-3xl max-h-[88vh] overflow-auto surgir" onClick={(ev) => ev.stopPropagation()} role="dialog" aria-label="Conquistas">
        <div className="flex items-center justify-between mb-1">
          <h2 className="titulo text-2xl">Conquistas</h2>
          <button onClick={onFechar} className="text-suave hover:text-white" aria-label="Fechar"><Icone nome="x" /></button>
        </div>
        <div className="text-xs text-suave mb-3"><b className="text-texto num">{total}</b> de {CONQUISTAS.length} · ficam salvas neste navegador</div>
        <div className="h-1.5 bg-white/8 rounded mb-4"><div className="h-full bg-acento-2 rounded" style={{ width: `${(total / CONQUISTAS.length) * 100}%` }} /></div>
        {CATS.map((cat) => (
          <div key={cat.id} className="mb-4">
            <div className="titulo text-sm text-suave mb-1.5">{cat.nome}</div>
            <div className="grid sm:grid-cols-2 gap-1.5">
              {CONQUISTAS.filter((d) => d.cat === cat.id).map((d) => {
                const quando = s.desbloqueadas[d.id];
                const prog = d.progresso?.(ctx);
                return (
                  <div key={d.id} className={`flex gap-2.5 items-center rounded-lg px-3 py-2 border ${quando ? 'border-acento-2/40 bg-acento-2/5' : 'border-white/5 bg-white/[0.02] opacity-60'}`}>
                    <span className={`text-2xl ${quando ? '' : 'grayscale'}`} aria-hidden>{d.icone}</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold">{d.nome}{!quando && <span className="sr-only"> (bloqueada)</span>}</div>
                      <div className="text-[11px] text-suave">{d.desc}</div>
                      {quando ? <div className="text-[10px] text-acento-2">desbloqueada em {new Date(quando).toLocaleDateString('pt-BR')}</div>
                        : prog && <div className="text-[10px] text-suave num">{prog[0]}/{prog[1]}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
