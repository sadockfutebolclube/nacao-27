/** Painel do modo de depuração do mapa (F3): problemas das vias por trecho (com a inclinação máxima) e rotatórias descartadas; "ir" leva a câmera até o ponto. */
import { debugMapa, useDebugMapa, type Problema } from '../render/city/estadoDebug';
import { irPara } from '../render/city/Camera';
import { NOMES_ESTADO, pedDebug, usePedDebug } from '../render/city/estadoPedestres';
import { DENSIDADE_VERMELHA } from '../render/city/MapaCalorPedestres';

const COR: Record<Problema['tipo'], string> = { morro: '#ff9a62', vao: '#6ab7ff', rampa: '#ffd45e', rotatoria: '#c79bff', solta: '#ff7aa8', predio: '#7ee0c0' };
const ROTULO: Record<Problema['tipo'], string> = { morro: 'morro s/ asfalto', vao: 'vão', rampa: 'rampa', rotatoria: 'rotatória', solta: 'via solta', predio: 'prédio' };

/** Pedestres (Fase 24): slider de densidade global, dia da semana, mapa de calor e o modelo agregado */
function SecaoPedestres() {
  const p = usePedDebug();
  const a = p.agregado;
  const dias = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  return (
    <div style={{ borderTop: '1px solid rgba(255,255,255,0.14)', marginTop: 6, paddingTop: 6 }}>
      <b>Pedestres</b>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>densidade global ×{p.escala.toFixed(2)}
        <input type="range" min={0} max={3} step={0.05} value={p.escala} onChange={(e) => pedDebug.escala(Number(e.target.value))} style={{ flex: 1 }} />
      </label>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 2 }}>dia da semana
        <select value={p.diaSemana ?? -1} onChange={(e) => pedDebug.diaSemana(Number(e.target.value) < 0 ? null : Number(e.target.value))} style={{ background: '#1b1f27', color: '#e6e8ec', border: '1px solid #333', borderRadius: 4 }}>
          <option value={-1}>do calendário</option>
          {dias.map((n, i) => <option key={n} value={i}>{n}</option>)}
        </select>
      </label>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 2 }}>
        <input type="checkbox" checked={p.mapaCalor} onChange={(e) => pedDebug.mapaCalor(e.target.checked)} /> mapa de calor (azul → vermelho = 0 → {DENSIDADE_VERMELHA} pessoas / 100 m de via)
      </label>
      <div style={{ opacity: 0.85, marginTop: 4 }}>
        modelo agregado: <b>{Math.round(a.total).toLocaleString('pt-BR')}</b> na rua às {Math.floor(a.hora)}h{String(Math.round((a.hora % 1) * 60)).padStart(2, '0')} ({a.fimDeSemana ? 'fim de semana' : 'dia útil'}) · desenhados perto da câmera: <b>{a.desenhados}</b>
      </div>
      <div style={{ opacity: 0.7 }}>{NOMES_ESTADO.map((n, i) => `${n} ${a.porEstado[i]}`).join(' · ')}</div>
    </div>
  );
}

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
      <SecaoPedestres />
      <div style={{ marginTop: 6, opacity: 0.6 }}>F3 alterna: wireframe → wireframe + normais → desligado · % = inclinação máxima do trecho</div>
    </div>
  );
}
