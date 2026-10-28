/**
 * Painel de desempenho (F4): quadros do desenho (performance.now por quadro, via requestAnimationFrame), o passo da simulação
 * no worker (último, mediana, p95, p99, pior), o orçamento por passo, a fila do trabalho do dia e o custo de cada fase.
 */
import { useEffect, useRef, useState } from 'react';
import { definirOrcamento } from '../sim/bridge';
import { usePerfSim } from '../sim/estadoPerf';
import { trafegoEstado } from '../sim/trafegoEstado';

const f1 = (v: number) => v.toFixed(1);
const cor = (ms: number, lim: number) => (ms <= lim ? '#8fe08f' : ms <= lim * 2 ? '#ffd45e' : '#ff7a7a');

/** quadros do desenho dos últimos ~2 s */
function useQuadros(ativo: boolean) {
  const [q, setQ] = useState({ fps: 0, p95: 0, max: 0 });
  const bufRef = useRef<number[]>([]);
  useEffect(() => {
    if (!ativo) return;
    let raf = 0, ultimo = performance.now(), ultimoRelatorio = ultimo;
    const buf = bufRef.current;
    const tick = (t: number) => {
      buf.push(t - ultimo); ultimo = t;
      if (buf.length > 240) buf.shift();
      if (t - ultimoRelatorio > 500) {
        ultimoRelatorio = t;
        const s = [...buf].sort((a, b) => a - b);
        setQ({ fps: 1000 / (s.reduce((a, b) => a + b, 0) / Math.max(1, s.length)), p95: s[Math.floor(s.length * 0.95)] ?? 0, max: s[s.length - 1] ?? 0 });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [ativo]);
  return q;
}

export function PainelPerformance() {
  const [aberto, setAberto] = useState(false);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key !== 'F4' || (e.target as HTMLElement)?.tagName === 'INPUT') return;
      e.preventDefault();
      setAberto((a) => !a);
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);
  const q = useQuadros(aberto);
  const p = usePerfSim();
  if (!aberto) return null;
  const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
  const fases = (p?.trabalhos ?? []).filter((t) => t.nome.includes('/')).sort((a, b) => b.ms - a.ms);
  const dia = p?.trabalhos.find((t) => t.nome === 'diario');
  const linha = { display: 'flex', justifyContent: 'space-between', gap: 8 } as const;
  return (
    <div
      style={{ position: 'fixed', left: 12, top: 96, width: 360, maxHeight: '70vh', overflowY: 'auto', background: 'rgba(12,14,18,0.88)', color: '#e6e8ec', font: '12px/1.45 system-ui, sans-serif', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 8, padding: 10, zIndex: 60 }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <b>F4 · desempenho</b>
        <button onClick={() => setAberto(false)} style={{ background: 'none', border: 0, color: '#9aa', cursor: 'pointer' }} aria-label="Fechar">✕</button>
      </div>
      <div style={linha}><span>Desenho</span><span><b style={{ color: cor(1000 / Math.max(1, q.fps), 16.7) }}>{q.fps.toFixed(0)} fps</b> · p95 {f1(q.p95)} ms · pior {f1(q.max)} ms</span></div>
      {mem && <div style={linha}><span>Memória JS (página)</span><span>{(mem.usedJSHeapSize / 1048576).toFixed(0)} MB</span></div>}
      <div style={linha}><span>Tráfego (worker, IDM + MOBIL)</span><span style={{ color: cor(trafegoEstado.stats.ms, 8) }}>{trafegoEstado.stats.ativos} veíc. · {f1(trafegoEstado.stats.ms)} ms/passo · {trafegoEstado.taxa.toFixed(0)} Hz · {trafegoEstado.stats.parados} parados</span></div>
      {!p && <div style={{ opacity: 0.7, marginTop: 6 }}>Aguardando o primeiro estado da simulação…</div>}
      {p && (
        <>
          <div style={{ marginTop: 8, opacity: 0.75 }}>Passo da simulação (worker) — meta &lt; 16 ms</div>
          <div style={linha}><span>último / mediana</span><span style={{ color: cor(p.passoMs.ultimo, 16) }}>{f1(p.passoMs.ultimo)} / {f1(p.passoMs.p50)} ms</span></div>
          <div style={linha}><span>p95 / p99</span><span style={{ color: cor(p.passoMs.p99, 16) }}>{f1(p.passoMs.p95)} / {f1(p.passoMs.p99)} ms</span></div>
          <div style={linha}><span>pior dos últimos 240</span><span style={{ color: cor(p.passoMs.max, 16) }}>{f1(p.passoMs.max)} ms</span></div>
          <div style={{ ...linha, alignItems: 'center', marginTop: 4 }}>
            <span>Orçamento por passo</span>
            <select value={p.orcamentoMs} onChange={(e) => definirOrcamento(Number(e.target.value))} style={{ background: '#1b1f27', color: '#e6e8ec', border: '1px solid #333', borderRadius: 4 }}>
              <option value={2}>2 ms</option><option value={4}>4 ms</option><option value={8}>8 ms</option><option value={0}>síncrono (sem orçamento)</option>
            </select>
          </div>
          <div style={linha}><span>Lotes no foco da câmera</span><span>{p.lotesPerto.toLocaleString('pt-BR')} de {p.lotes.toLocaleString('pt-BR')} (raio {Math.round(p.raioFoco)} m)</span></div>
          <div style={linha}><span>Fila do dia</span><span>{p.fila.length ? `${p.fila.length} pendente(s)` : 'vazia'} · dias engolidos {p.diasPulados}</span></div>
          {dia && <div style={linha}><span>Dia inteiro (média / pior fatia)</span><span>{f1(dia.ms / Math.max(1, p.concluidos))} ms · {f1(dia.pior)} ms</span></div>}
          <div style={{ marginTop: 8, opacity: 0.75 }}>Custo por fase (acumulado, ms/dia = total ÷ dias)</div>
          {fases.map((t) => (
            <div key={t.nome} style={{ ...linha, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <span>{t.nome.split('/')[1]}</span>
              <span>{f1(t.ms / Math.max(1, p.concluidos))} ms/dia · pior fatia <span style={{ color: cor(t.pior, 8) }}>{f1(t.pior)}</span></span>
            </div>
          ))}
        </>
      )}
      <div style={{ marginTop: 6, opacity: 0.6 }}>F4 abre/fecha · fatias = trechos do trabalho do dia que cabem no orçamento</div>
    </div>
  );
}
