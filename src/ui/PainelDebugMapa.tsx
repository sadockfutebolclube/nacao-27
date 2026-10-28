/** Painel do modo de depuração do mapa (F3): problemas das vias e rotatórias descartadas; "ir" leva a câmera até o ponto. */
import { debugMapa, useDebugMapa, type Problema } from '../render/city/estadoDebug';
import { irPara } from '../render/city/Camera';

const COR: Record<Problema['tipo'], string> = { enterrada: '#ff9a62', flutuando: '#6ab7ff', ingreme: '#ffd45e', rotatoria: '#c79bff' };
const ROTULO: Record<Problema['tipo'], string> = { enterrada: 'enterrada', flutuando: 'flutuando', ingreme: 'íngreme', rotatoria: 'rotatória descartada' };

export function PainelDebugMapa() {
  const d = useDebugMapa();
  if (!d.modo) return null;
  const c = d.contagem;
  return (
    <div
      style={{ position: 'fixed', right: 12, top: 96, width: 340, maxHeight: '58vh', display: 'flex', flexDirection: 'column', background: 'rgba(12,14,18,0.88)', color: '#e6e8ec', font: '12px/1.4 system-ui, sans-serif', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 8, padding: 10, zIndex: 60 }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <b>F3 · mapa — {d.modo === 1 ? 'wireframe' : 'wireframe + normais'}</b>
        <button onClick={() => debugMapa.modo(0)} style={{ background: 'none', border: 0, color: '#9aa', cursor: 'pointer' }} aria-label="Fechar">✕</button>
      </div>
      <div style={{ marginBottom: 6, opacity: 0.85 }}>
        {c.trechos} trechos · {c.enterrada} enterradas · {c.flutuando} flutuando · {c.ingreme} íngremes · {c.rotatoria} rotatórias descartadas
      </div>
      <div style={{ overflowY: 'auto' }}>
        {d.problemas.length === 0 && <div style={{ opacity: 0.7 }}>Nenhum problema encontrado.</div>}
        {d.problemas.slice(0, 120).map((p, i) => (
          <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'baseline', padding: '2px 0', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <span style={{ color: COR[p.tipo], minWidth: 74 }}>{ROTULO[p.tipo].split(' ')[0]}</span>
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={`${p.nome} — ${p.detalhe}`}>{p.nome} — {p.detalhe}</span>
            <button onClick={() => irPara(p.x, p.z)} style={{ background: 'rgba(255,255,255,0.1)', border: 0, color: '#fff', borderRadius: 4, cursor: 'pointer', padding: '1px 6px' }}>ir</button>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 6, opacity: 0.6 }}>F3 alterna: wireframe → wireframe + normais → desligado</div>
    </div>
  );
}
