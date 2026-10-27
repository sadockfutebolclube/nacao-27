/** Peças visuais do Modo Presidente: números, gráfico de linha, hemiciclo grande, placar. */
import { memo, useMemo, type ReactNode } from 'react';
import { PARTIDOS } from '../../sim/politica/dados';
import type { Deputado, Placar } from '../../sim/politica/politica';

export const num = (v: number, d = 1) => v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
export const pp = (v: number, d = 1) => `${num(v, d)}%`;
/** % do PIB → R$ bilhões */
export const rsBi = (pctPib: number, pib: number) => `R$ ${num((pctPib / 100) * pib / 1e9, 0)} bi`;
export const corRel = (r: number) => (r > 0.15 ? '#3ee0b0' : r > -0.15 ? '#f5b942' : '#ff6b5b');
export const relTexto = (r: number) => (r > 0.5 ? 'aliado fiel' : r > 0.15 ? 'governista' : r > -0.15 ? 'independente' : r > -0.5 ? 'crítico' : 'opositor');

export function Secao({ titulo, children, extra }: { titulo: string; children: ReactNode; extra?: ReactNode }) {
  return (
    <section className="mt-4">
      <div className="flex items-center justify-between mb-1.5"><h3 className="titulo text-sm text-suave">{titulo}</h3>{extra}</div>
      {children}
    </section>
  );
}

export function Kpi({ rotulo, valor, sub, cor }: { rotulo: string; valor: ReactNode; sub?: ReactNode; cor?: string }) {
  return (
    <div className="bg-white/[0.04] border border-white/[0.06] rounded-xl px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-suave">{rotulo}</div>
      <div className={`num text-xl font-semibold ${cor ?? ''}`}>{valor}</div>
      {sub && <div className="text-[10px] text-suave">{sub}</div>}
    </div>
  );
}

/** Linha simples com faixa de referência opcional (meta). */
export const Linha = memo(function Linha({ valores, cor = '#3ee0b0', altura = 70, faixa, rotulos, formato = (v: number) => num(v) }: { valores: number[]; cor?: string; altura?: number; faixa?: [number, number]; rotulos?: [string, string]; formato?: (v: number) => string }) {
  if (valores.length < 2) return <div className="text-[11px] text-suave h-[40px]">O gráfico aparece depois do primeiro mês.</div>;
  const lo = Math.min(...valores, ...(faixa ?? [])), hi = Math.max(...valores, ...(faixa ?? []));
  const pad = (hi - lo) * 0.1 || 1;
  const y = (v: number) => altura - 4 - ((v - lo + pad) / (hi - lo + 2 * pad)) * (altura - 8);
  const W = 300, x = (i: number) => (i / (valores.length - 1)) * W;
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${altura}`} className="w-full" style={{ height: altura }} preserveAspectRatio="none">
        {faixa && <rect x={0} width={W} y={y(faixa[1])} height={Math.max(1, y(faixa[0]) - y(faixa[1]))} fill="#3ee0b0" opacity={0.08} />}
        <polyline fill="none" stroke={cor} strokeWidth={2} vectorEffect="non-scaling-stroke" points={valores.map((v, i) => `${x(i)},${y(v)}`).join(' ')} />
      </svg>
      <div className="flex justify-between text-[9px] text-suave"><span>{rotulos?.[0]}</span><span className="num">{formato(valores[valores.length - 1])}</span><span>{rotulos?.[1]}</span></div>
    </div>
  );
});

/** Hemiciclo para casas grandes (Câmara 513, Senado 81). */
function assentos(n: number) {
  const filas = Math.max(3, Math.round(Math.sqrt(n / 4)));
  const r0 = 60, r1 = 155;
  const raios = Array.from({ length: filas }, (_, i) => r0 + ((r1 - r0) * i) / Math.max(1, filas - 1));
  const somaR = raios.reduce((a, b) => a + b, 0);
  const porFila = raios.map((r) => Math.round((n * r) / somaR));
  porFila[filas - 1] += n - porFila.reduce((a, b) => a + b, 0);
  const pts: { x: number; y: number; ang: number }[] = [];
  raios.forEach((r, i) => { for (let j = 0; j < porFila[i]; j++) { const ang = Math.PI - (Math.PI * (j + 0.5)) / porFila[i]; pts.push({ x: 170 + r * Math.cos(ang), y: 165 - r * Math.sin(ang), ang }); } });
  return { pts: pts.sort((a, b) => b.ang - a.ang), raio: Math.min(8, (Math.PI * r1) / porFila[filas - 1] / 2.2) };
}

export const Hemiciclo = memo(function Hemiciclo({ deps, modo, intencoes, presidente }: { deps: Deputado[]; modo: 'partido' | 'relacao' | 'intencao'; intencoes?: Record<number, string> | null; presidente: number }) {
  const { pts, raio } = useMemo(() => assentos(deps.length), [deps.length]);
  const ordem = [...deps].sort((a, b) => a.ideologia - b.ideologia);
  const COR: Record<string, string> = { sim: '#3ee0b0', nao: '#ff6b5b', indeciso: '#f5b942' };
  return (
    <svg viewBox="0 0 340 172" className="w-full">
      {ordem.map((d, i) => {
        const p = pts[i];
        const fill = modo === 'partido' ? PARTIDOS[d.partido].cor : modo === 'relacao' ? corRel(d.relacao) : intencoes ? COR[intencoes[d.id]] : '#666';
        return <circle key={d.id} cx={p.x} cy={p.y} r={raio} fill={fill} stroke={d.id === presidente ? '#ffffff' : 'none'} strokeWidth={1.2}><title>{`${d.urna} (${PARTIDOS[d.partido].sigla}-${d.cidade})`}</title></circle>;
      })}
      <text x="170" y="160" textAnchor="middle" fontSize="12" fill="#9fb5ae">{deps.length} cadeiras</text>
    </svg>
  );
});

export function BarraPlacar({ p, total }: { p: Placar; total: number }) {
  const w = (n: number) => `${(n / total) * 100}%`;
  return (
    <div>
      <div className="relative flex h-3 rounded overflow-hidden bg-white/5">
        <div style={{ width: w(p.aFavor), background: '#3ee0b0' }} />
        <div style={{ width: w(p.indecisos), background: '#f5b942' }} />
        <div style={{ width: w(p.contra), background: '#ff6b5b' }} />
        <div className="absolute inset-y-0 w-0.5 bg-white" style={{ left: w(p.necessarios) }} title={`${p.necessarios} necessários`} />
      </div>
      <div className="flex justify-between text-[10px] text-suave mt-0.5 num">
        <span className="text-acento">{p.aFavor} sim</span><span>{p.indecisos} indecisos · precisa {p.necessarios}</span><span className="text-perigo">{p.contra} não</span>
      </div>
    </div>
  );
}
