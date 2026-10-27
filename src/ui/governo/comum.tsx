/** Peças visuais compartilhadas pelos painéis de governo. */
import type { ReactNode } from 'react';
import { fmt } from '../../app/store';

export const bi = (v: number) => fmt.reais(v);
export const pct = (v: number, d = 1) => `${(v * 100).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d })}%`;

export function Cartao({ titulo, valor, sub, cor, children }: { titulo: string; valor?: ReactNode; sub?: ReactNode; cor?: string; children?: ReactNode }) {
  return (
    <div className="bg-white/[0.04] border border-white/[0.06] rounded-xl p-3">
      <div className="text-[10px] uppercase tracking-wider text-suave">{titulo}</div>
      {valor !== undefined && <div className={`num text-2xl font-semibold mt-0.5 ${cor ?? 'text-texto'}`}>{valor}</div>}
      {sub && <div className="text-[11px] text-suave mt-0.5">{sub}</div>}
      {children}
    </div>
  );
}

/** Régua com marcas de limite (LRF, mínimos constitucionais). */
export function Regua({ valor, max, marcas, inverso = false, rotulo }: { valor: number; max: number; marcas: { v: number; nome: string; cor: string }[]; inverso?: boolean; rotulo: string }) {
  const w = Math.min(100, (valor / max) * 100);
  // inverso: acima da marca é ruim (pessoal, dívida); senão abaixo da marca é ruim (mínimos)
  const ruim = inverso ? marcas.some((m) => valor > m.v && m.cor === '#ff6b5b') : marcas.some((m) => valor < m.v && m.cor === '#ff6b5b');
  const atencao = inverso ? marcas.some((m) => valor > m.v) : false;
  const cor = ruim ? '#ff6b5b' : atencao ? '#f5b942' : '#3ee0b0';
  return (
    <div className="mt-2">
      <div className="flex justify-between text-xs"><span className="text-suave">{rotulo}</span><span className="num text-base" style={{ color: cor }}>{pct(valor)}</span></div>
      <div className="relative h-2.5 bg-white/8 rounded-full mt-1 overflow-visible">
        <div className="absolute inset-y-0 left-0 rounded-full transition-all duration-500" style={{ width: `${w}%`, background: cor }} />
        {marcas.map((m) => (
          <div key={m.v} className="absolute -top-1 -bottom-1 w-0.5" style={{ left: `${(m.v / max) * 100}%`, background: m.cor }} title={`${m.nome}: ${pct(m.v)}`} />
        ))}
      </div>
      <div className="relative h-3.5 text-[9px] text-suave">
        {marcas.filter((m) => m.nome).map((m) => <span key={m.nome} className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${(m.v / max) * 100}%`, color: m.cor }}>{m.nome}</span>)}
      </div>
    </div>
  );
}

export function Barras({ dados, altura = 110 }: { dados: { rotulo: string; receita: number; despesa: number; caixa: number }[]; altura?: number }) {
  if (dados.length < 2) return <div className="text-xs text-suave">O gráfico aparece depois do primeiro mês fechado.</div>;
  const max = Math.max(1, ...dados.flatMap((d) => [d.receita, d.despesa]));
  const minC = Math.min(0, ...dados.map((d) => d.caixa)), maxC = Math.max(1, ...dados.map((d) => d.caixa));
  const W = dados.length * 14;
  const yC = (v: number) => altura - 4 - ((v - minC) / (maxC - minC || 1)) * (altura - 8);
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${altura}`} className="w-full" style={{ height: altura }} preserveAspectRatio="none">
        {dados.map((d, i) => (
          <g key={i}>
            <rect x={i * 14 + 2} width={5} y={altura - (d.receita / max) * altura} height={(d.receita / max) * altura} fill="#3ee0b0" opacity={0.75} />
            <rect x={i * 14 + 7} width={5} y={altura - (d.despesa / max) * altura} height={(d.despesa / max) * altura} fill="#ff6b5b" opacity={0.7} />
          </g>
        ))}
        <polyline fill="none" stroke="#f5b942" strokeWidth={1.5} vectorEffect="non-scaling-stroke" points={dados.map((d, i) => `${i * 14 + 7},${yC(d.caixa)}`).join(' ')} />
      </svg>
      <div className="flex justify-between text-[9px] text-suave mt-0.5"><span>{dados[0].rotulo}</span><span>{dados[dados.length - 1].rotulo}</span></div>
      <div className="flex gap-4 text-[10px] mt-1"><span className="text-acento">■ receitas</span><span className="text-perigo">■ despesas</span><span className="text-acento-2">— caixa</span></div>
    </div>
  );
}

/** Direção = o valor subiu ou desceu; cor = se isso é bom (verde) ou ruim (vermelho). */
export function Seta({ subiu, bom, neutro }: { subiu: boolean; bom: boolean; neutro?: boolean }) {
  if (neutro) return <span className="text-suave">●</span>;
  return <span className={bom ? 'text-acento' : 'text-perigo'}>{subiu ? '▲' : '▼'}</span>;
}

export function Botao({ children, onClick, desativado, tom = 'neutro', titulo }: { children: ReactNode; onClick?: () => void; desativado?: boolean; tom?: 'neutro' | 'primario' | 'perigo'; titulo?: string }) {
  const cls = tom === 'primario' ? 'bg-acento text-tinta font-semibold hover:brightness-110' : tom === 'perigo' ? 'bg-perigo/15 text-perigo hover:bg-perigo/25' : 'bg-white/6 hover:bg-white/12';
  return (
    <button title={titulo} disabled={desativado} onClick={onClick} className={`px-3 py-1.5 rounded-lg text-sm transition ${cls} ${desativado ? 'opacity-40 cursor-not-allowed' : ''}`}>{children}</button>
  );
}
