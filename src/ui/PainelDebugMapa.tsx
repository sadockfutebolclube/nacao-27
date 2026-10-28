/** Painel do modo de depuração do mapa (F3): problemas das vias por trecho (com a inclinação máxima) e rotatórias descartadas; "ir" leva a câmera até o ponto. */
import { debugMapa, useDebugMapa, type Problema } from '../render/city/estadoDebug';
import { irPara } from '../render/city/Camera';

const COR: Record<Problema['tipo'], string> = { morro: '#ff9a62', vao: '#6ab7ff', rampa: '#ffd45e', rotatoria: '#c79bff', solta: '#ff7aa8', predio: '#7ee0c0' };
const ROTULO: Record<Problema['tipo'], string> = { morro: 'morro s/ asfalto', vao: 'vão', rampa: 'rampa', rotatoria: 'rotatória', solta: 'via solta', predio: 'prédio' };

export function PainelDebugMapa() {
  const d = useDebugMapa();
  if (!d.modo) return null;
  const c = d.contagem;
  return (
    <div
      style={{ position: 'fixed', right: 12, top: 96, width: 380, maxHeight: '58vh', display: 'flex', flexDirection: 'column', background: 'rgba(12,14,18,0.88)', color: '#e6e8ec', font: '12px/1.4 system-ui, sans-serif', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 8, padding: 10, zIndex: 60 }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <b>F3 · mapa — {d.modo === 1 ? 'wireframe' : 'wireframe + normais'}</b>
        <button onClick={() => debugMapa.modo(0)} style={{ background: 'none', border: 0, color: '#9aa', cursor: 'pointer' }} aria-label="Fechar">✕</button>
      </div>
      <div style={{ marginBottom: 4, opacity: 0.9 }}>
        {c.trechos} trechos · <span style={{ color: COR.morro }}>{c.morro} morro</span> · <span style={{ color: COR.vao }}>{c.vao} vão</span> · <span style={{ color: COR.rampa }}>{c.rampa} rampa</span> · <span style={{ color: COR.rotatoria }}>{c.rotatoria} rotatórias descartadas</span>
      </div>
      <div style={{ marginBottom: 4, opacity: 0.9 }}>
        <span style={{ color: COR.solta }}>{c.solta} vias soltas removidas</span> · <span style={{ color: COR.predio }}>prédios sobre a pista: {c.predioDeslocado} deslocados, {c.predioRemovido} removidos</span> · {c.minirrotatoria} minirrotatórias
      </div>
      <div style={{ marginBottom: 6, opacity: 0.7 }}>tratados: {c.muro} com muro de arrimo · {c.ponte} pontes · {c.tunel} túneis</div>
      <div style={{ overflowY: 'auto' }}>
        {d.problemas.length === 0 && <div style={{ opacity: 0.7 }}>Nenhum problema encontrado.</div>}
        {d.problemas.slice(0, 150).map((p, i) => (
          <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'baseline', padding: '2px 0', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <span style={{ color: COR[p.tipo], minWidth: 92 }}>{ROTULO[p.tipo]}</span>
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={`${p.nome} — ${p.detalhe}${p.tipo === 'rotatoria' ? '' : ` · inclinação máx ${p.inclinacao}%`}`}>
              {p.nome} — {p.detalhe}{p.inclinacao ? ` · ${p.inclinacao}%` : ''}
            </span>
            <button onClick={() => irPara(p.x, p.z)} style={{ background: 'rgba(255,255,255,0.1)', border: 0, color: '#fff', borderRadius: 4, cursor: 'pointer', padding: '1px 6px' }}>ir</button>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 6, opacity: 0.6 }}>F3 alterna: wireframe → wireframe + normais → desligado · % = inclinação máxima do trecho</div>
    </div>
  );
}
