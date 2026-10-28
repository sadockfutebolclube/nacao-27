/**
 * Entrada do jogador no mundo 3D: traçado de vias (reta/curva, encadeado, snap em nós e
 * arestas, Shift = ângulos de 15°), pincel de zoneamento, posicionamento de equipamentos,
 * demolição e inspeção de lotes. Pré-visualização usa as MESMAS funções puras do Worker.
 */
import { Html, Line } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { fmt } from '../../app/store';
import { equipamento } from '../../sim/catalog';
import { comando, concluirLinha, mundo, useGame } from '../../sim/bridge';
import { TIPOS_LINHA, Transporte } from '../../sim/city/transporte';
import { BUILD_HALF } from '../../world/constants';
import { LOT_STRIDE } from '../../world/lots';
import { edgeEnds, findEdgeNear, planRoad, resolveEndpoint, ROAD_SPECS, sampleCurve, type RoadRequest, type V2 } from '../../world/roads';
import { insideFootprint, serviceFootprint } from '../../world/services';
import { garantirEstaticos } from '../../entidades/contexto';
import { registro } from '../../entidades/registro';
import { selecao } from '../../entidades/selecao';
import { raycastTerrain, roadBaseY, sampleHeight, sampleWaterDist, type Heightmap } from '../../world/terrain';

/** Favela (id) cuja casa contém o ponto, pelos dados de renderização. */
export function favelaEm(x: number, z: number): number {
  const C = mundo.favelasCasas;
  for (let o = 0; o < C.length; o += 8) {
    if (Math.abs(C[o] - x) > 6 || Math.abs(C[o + 1] - z) > 6) continue;
    if (insideFootprint({ x: C[o], z: C[o + 1], angle: C[o + 2], w: C[o + 3], d: C[o + 4] }, x, z, 0.5)) return mundo.favelasMeta[C[o + 7]]?.id ?? -1;
  }
  return -1;
}

export function loteEm(x: number, z: number): number {
  const L = mundo.lots;
  const n = L.length / LOT_STRIDE;
  for (let i = 0; i < n; i++) {
    const o = i * LOT_STRIDE;
    if (Math.abs(L[o] - x) > 20 || Math.abs(L[o + 1] - z) > 20) continue;
    if (insideFootprint({ x: L[o], z: L[o + 1], angle: L[o + 2], w: L[o + 3], d: L[o + 4] }, x, z)) return i;
  }
  return -1;
}

function ribbon(pts: V2[], larg: number, hm: Heightmap, dy = 0.6): THREE.BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    let tx = b.x - a.x, tz = b.z - a.z;
    const l = Math.hypot(tx, tz) || 1;
    tx /= l; tz /= l;
    const y = roadBaseY(hm, pts[i].x, pts[i].z) + dy;
    pos.push(pts[i].x + tz * larg / 2, y, pts[i].z - tx * larg / 2, pts[i].x - tz * larg / 2, y, pts[i].z + tx * larg / 2);
    if (i < pts.length - 1) {
      const k = i * 2;
      idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

const snapAngulo = (from: V2, to: V2): V2 => {
  const dx = to.x - from.x, dz = to.z - from.z;
  const L = Math.hypot(dx, dz);
  const passo = Math.PI / 12;
  const a = Math.round(Math.atan2(dz, dx) / passo) * passo;
  return { x: from.x + Math.cos(a) * L, z: from.z + Math.sin(a) * L };
};

export function Ferramentas({ hm }: { hm: Heightmap }) {
  const { camera, gl, size } = useThree();
  const ferramenta = useGame((s) => s.ferramenta);
  const raio = useGame((s) => s.raioPincel);
  const caixa = useGame((s) => s.stats?.caixa ?? 0);
  const sandbox = useGame((s) => s.stats?.sandbox ?? false);
  const wv = useGame((s) => s.worldVersion);
  const [cursor, setCursor] = useState<THREE.Vector3 | null>(null);
  const [pontos, setPontos] = useState<V2[]>([]);
  const [shift, setShift] = useState(false);
  const pintando = useRef(false);
  const ultimoPincel = useRef(0);
  const down = useRef<{ x: number; y: number; b: number } | null>(null);
  const ray = useMemo(() => new THREE.Raycaster(), []);
  const ndc = useMemo(() => new THREE.Vector2(), []);

  useEffect(() => { setPontos([]); useGame.setState({ linhaParadas: [] }); }, [ferramenta]);

  const picar = (cx: number, cy: number): THREE.Vector3 | null => {
    const r = gl.domElement.getBoundingClientRect();
    ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const o = ray.ray.origin, d = ray.ray.direction;
    const hit = raycastTerrain(hm, o.x, o.y, o.z, d.x, d.y, d.z);
    return hit ? new THREE.Vector3(hit[0], hit[1], hit[2]) : null;
  };

  /** Picking de entidades (pessoa, carro, ônibus, casa, prédio, estabelecimento, marco): raio da câmera contra as caixas do registro. */
  const picarEntidade = (cx: number, cy: number): number | null => {
    const r = gl.domElement.getBoundingClientRect();
    ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const o = ray.ray.origin, d = ray.ray.direction;
    garantirEstaticos();
    const hit = raycastTerrain(hm, o.x, o.y, o.z, d.x, d.y, d.z);
    // o que fica atrás do relevo não é clicável
    const maxT = hit ? Math.hypot(hit[0] - o.x, hit[1] - o.y, hit[2] - o.z) + 30 : 6000;
    const a = registro.picar(o.x, o.y, o.z, d.x, d.y, d.z, maxT);
    return a ? a.id : null;
  };

  // pré-visualização de via
  const previa = useMemo(() => {
    if (ferramenta.tipo !== 'via' || !cursor || pontos.length === 0) return null;
    const ini = resolveEndpoint(mundo.roads, pontos[0].x, pontos[0].z).p;
    let fim: V2 = { x: cursor.x, z: cursor.z };
    if (shift) fim = snapAngulo(ini, fim);
    const endSnap = resolveEndpoint(mundo.roads, fim.x, fim.z);
    fim = endSnap.p;
    const ctrl = ferramenta.curva && pontos.length === 2 ? pontos[1] : { x: (ini.x + fim.x) / 2, z: (ini.z + fim.z) / 2 };
    const req: RoadRequest = { x0: ini.x, z0: ini.z, cx: ctrl.x, cz: ctrl.z, x1: fim.x, z1: fim.z, type: ferramenta.via };
    if (ferramenta.curva && pontos.length === 1) {
      // segundo clique define o ponto de controle: mostra a "corda"
      req.cx = (ini.x + fim.x) / 2; req.cz = (ini.z + fim.z) / 2;
    }
    const plan = planRoad(mundo.roads, hm, req);
    const custo = plan.custo;
    const semCaixa = !sandbox && custo > caixa;
    const pts = sampleCurve(plan.a, ferramenta.curva && pontos.length === 2 ? ctrl : { x: (plan.a.x + plan.b.x) / 2, z: (plan.a.z + plan.b.z) / 2 }, plan.b, 32);
    return { req, plan, ok: plan.ok && !semCaixa, erro: plan.erro ?? (semCaixa ? 'Caixa insuficiente' : undefined), geo: ribbon(pts, ROAD_SPECS[ferramenta.via].width + ROAD_SPECS[ferramenta.via].sidewalk * 2, hm), snapFim: endSnap.kind, fim };
  }, [ferramenta, cursor, pontos, shift, hm, caixa, sandbox, wv]);
  useEffect(() => () => previa?.geo.dispose(), [previa]);

  // pré-visualização de equipamento
  const previaEq = useMemo(() => {
    if (ferramenta.tipo !== 'equipamento' || !cursor) return null;
    const eq = equipamento(ferramenta.eq);
    const fit = serviceFootprint(mundo.roads, cursor.x, cursor.z, eq.w, eq.d);
    if (!fit) return { eq, fp: { x: cursor.x, z: cursor.z, angle: 0, w: eq.w, d: eq.d }, ok: false, erro: 'Coloque de frente para uma via' };
    let erro: string | undefined;
    if (eq.margemAgua && sampleWaterDist(hm, fit.fp.x, fit.fp.z) > 250) erro = 'Precisa ficar a até 250 m da água';
    for (const s of mundo.services) {
      const e2 = equipamento(s.eq);
      if (Math.hypot(s.x - fit.fp.x, s.z - fit.fp.z) < (Math.max(e2.w, e2.d) + Math.max(eq.w, eq.d)) / 2) erro = 'Sobrepõe outro equipamento';
    }
    if (!sandbox && eq.custo > caixa) erro = 'Caixa insuficiente';
    return { eq, fp: fit.fp, ok: !erro, erro };
  }, [ferramenta, cursor, hm, caixa, sandbox, wv]);

  // pré-visualização de linha de transporte
  const paradasLinha = useGame((s) => s.linhaParadas);
  const previaLinha = useMemo(() => {
    if (ferramenta.tipo !== 'linha' || !cursor) return null;
    const pts = [...paradasLinha, { x: cursor.x, z: cursor.z }];
    if (pts.length < 2) return { pts, plano: null as ReturnType<typeof Transporte.planejar> | null };
    return { pts, plano: Transporte.planejar(mundo.roads, ferramenta.linha, pts) };
  }, [ferramenta, cursor ? Math.round(cursor.x / 4) : 0, cursor ? Math.round(cursor.z / 4) : 0, paradasLinha, wv]);

  // alvo da demolição
  const alvoDemolir = useMemo(() => {
    if (ferramenta.tipo !== 'demolir' || !cursor) return null;
    for (const s of mundo.services) {
      const eq = equipamento(s.eq);
      if (insideFootprint({ x: s.x, z: s.z, angle: s.angle, w: eq.w, d: eq.d }, cursor.x, cursor.z, 2)) {
        return { tipo: 'eq' as const, fp: { x: s.x, z: s.z, angle: s.angle, w: eq.w, d: eq.d }, nome: eq.nome };
      }
    }
    const li = loteEm(cursor.x, cursor.z);
    if (li >= 0) {
      const o = li * LOT_STRIDE, L = mundo.lots;
      const S = mundo.lotState;
      if (S[li * 9] || S[li * 9 + 1]) return { tipo: 'lote' as const, fp: { x: L[o], z: L[o + 1], angle: L[o + 2], w: L[o + 3], d: L[o + 4] }, nome: 'Desapropriar lote' };
    }
    const e = findEdgeNear(mundo.roads, cursor.x, cursor.z, 10);
    if (e) {
      const [p0, c, p1] = edgeEnds(mundo.roads, e.edge);
      return { tipo: 'via' as const, geo: ribbon(sampleCurve(p0, c, p1, 24), ROAD_SPECS[e.edge.type].width + 2, hm, 0.8), nome: e.edge.name };
    }
    return null;
  }, [ferramenta, cursor, hm, wv]);
  useEffect(() => () => { if (alvoDemolir?.tipo === 'via') alvoDemolir.geo.dispose(); }, [alvoDemolir]);

  useEffect(() => {
    const el = gl.domElement;
    const g = () => useGame.getState();

    const pincel = (p: THREE.Vector3) => {
      const f = g().ferramenta;
      if (f.tipo !== 'zona') return;
      const agora = performance.now();
      if (agora - ultimoPincel.current < 70) return;
      ultimoPincel.current = agora;
      comando({ kind: 'zone', x: p.x, z: p.z, radius: g().raioPincel, zone: f.zona });
    };

    const onMove = (e: PointerEvent) => {
      const p = picar(e.clientX, e.clientY);
      setCursor(p);
      setShift(e.shiftKey);
      if (pintando.current && p) pincel(p);
    };
    const onDown = (e: PointerEvent) => {
      down.current = { x: e.clientX, y: e.clientY, b: e.button };
      const f = g().ferramenta;
      if (e.button === 0 && f.tipo === 'zona') {
        pintando.current = true;
        const p = picar(e.clientX, e.clientY);
        if (p) { ultimoPincel.current = 0; pincel(p); }
      }
    };
    const onUp = async (e: PointerEvent) => {
      pintando.current = false;
      const d0 = down.current;
      down.current = null;
      if (!d0 || Math.hypot(e.clientX - d0.x, e.clientY - d0.y) > 5) return; // foi arrasto de câmera
      const f = g().ferramenta;
      if (e.button === 2) {
        if (f.tipo === 'via' && pontos.length) setPontos([]);
        else if (f.tipo === 'linha' && useGame.getState().linhaParadas.length) useGame.setState({ linhaParadas: useGame.getState().linhaParadas.slice(0, -1) });
        else if (f.tipo !== 'nenhuma') g().set({ ferramenta: { tipo: 'nenhuma' } });
        return;
      }
      if (e.button !== 0) return;
      if (f.tipo === 'nenhuma') {
        const id = picarEntidade(e.clientX, e.clientY);
        if (id !== null) { g().set({ loteSelecionado: -1, favelaSelecionada: -1 }); selecao.selecionar(id); return; }
        if (selecao.ler().id !== null) selecao.selecionar(null);
      }
      const p = picar(e.clientX, e.clientY);
      if (!p) return;
      if (Math.abs(p.x) > BUILD_HALF || Math.abs(p.z) > BUILD_HALF) {
        if (f.tipo !== 'nenhuma') g().toast('Fora dos limites do município', 'erro');
        return;
      }
      switch (f.tipo) {
        case 'nenhuma': {
          const fav = favelaEm(p.x, p.z);
          if (fav >= 0) g().set({ favelaSelecionada: fav, loteSelecionado: -1 });
          else g().set({ loteSelecionado: loteEm(p.x, p.z), favelaSelecionada: -1 });
          break;
        }
        case 'linha': {
          useGame.setState((s) => ({ linhaParadas: [...s.linhaParadas, { x: p.x, z: p.z }] }));
          break;
        }
        case 'operacao': {
          const r = await comando({ kind: 'operacao', x: p.x, z: p.z });
          g().toast(r.ok ? `Operação concluída: ${r.msg}` : r.msg ?? 'Operação não autorizada', r.ok ? 'info' : 'erro');
          break;
        }
        case 'via': {
          let ponto: V2 = { x: p.x, z: p.z };
          if (e.shiftKey && pontos.length) ponto = snapAngulo(resolveEndpoint(mundo.roads, pontos[0].x, pontos[0].z).p, ponto);
          const necessarios = f.curva ? 3 : 2;
          const novos = [...pontos, ponto];
          if (novos.length < necessarios) { setPontos(novos); break; }
          const ini = novos[0], fim = novos[novos.length - 1];
          const ctrl = f.curva ? novos[1] : { x: (ini.x + fim.x) / 2, z: (ini.z + fim.z) / 2 };
          const req: RoadRequest = { x0: ini.x, z0: ini.z, cx: ctrl.x, cz: ctrl.z, x1: fim.x, z1: fim.z, type: f.via };
          if (!f.curva) { req.cx = (req.x0 + req.x1) / 2; req.cz = (req.z0 + req.z1) / 2; }
          const r = await comando({ kind: 'road', req });
          if (r.ok) setPontos([resolveEndpoint(mundo.roads, fim.x, fim.z).p]);
          else g().toast(r.msg ?? 'Não foi possível construir', 'erro');
          break;
        }
        case 'equipamento': {
          const r = await comando({ kind: 'service', eq: f.eq, x: p.x, z: p.z });
          if (r.ok) g().toast(`${equipamento(f.eq).nome} contratada: ${fmt.reais(r.custo ?? 0)}`, 'ok');
          else g().toast(r.msg ?? 'Não foi possível construir', 'erro');
          break;
        }
        case 'demolir': {
          const r = await comando({ kind: 'bulldoze', x: p.x, z: p.z });
          if (!r.ok) g().toast(r.msg ?? 'Nada para demolir', 'erro');
          break;
        }
        case 'zona':
          break;
      }
    };
    const onKeyUp = (e: KeyboardEvent) => setShift(e.shiftKey);
    const onKey = (e: KeyboardEvent) => {
      setShift(e.shiftKey);
      const lp = useGame.getState().linhaParadas;
      if (g().ferramenta.tipo === 'linha' && e.key === 'Enter') { concluirLinha(); return; }
      if (g().ferramenta.tipo === 'linha' && e.key === 'Backspace' && lp.length) { useGame.setState({ linhaParadas: lp.slice(0, -1) }); return; }
      if (e.key !== 'Escape') return;
      // Esc consumido aqui não abre o menu de pausa (a HUD checa defaultPrevented)
      if (lp.length) { useGame.setState({ linhaParadas: [] }); e.preventDefault(); }
      else if (selecao.ler().id !== null) { selecao.selecionar(null); e.preventDefault(); }
      else if (g().favelaSelecionada >= 0) { g().set({ favelaSelecionada: -1 }); e.preventDefault(); }
      else if (pontos.length) { setPontos([]); e.preventDefault(); }
      else if (g().ferramenta.tipo !== 'nenhuma') { g().set({ ferramenta: { tipo: 'nenhuma' } }); e.preventDefault(); }
      else if (g().loteSelecionado >= 0) { g().set({ loteSelecionado: -1 }); e.preventDefault(); }
    };
    const ctx = (e: Event) => e.preventDefault();
    // duplo clique conclui a linha (descarta a parada duplicada do segundo clique)
    const onDbl = (ev: MouseEvent) => {
      if (g().ferramenta.tipo === 'nenhuma') {
        // duplo clique em uma entidade: a câmera passa a segui-la
        const id = picarEntidade(ev.clientX, ev.clientY);
        if (id !== null) { g().set({ loteSelecionado: -1, favelaSelecionada: -1 }); selecao.selecionar(id, 'seguindo'); }
        return;
      }
      if (g().ferramenta.tipo !== 'linha') return;
      const lp = useGame.getState().linhaParadas;
      const n = lp.length;
      if (n >= 2 && Math.hypot(lp[n - 1].x - lp[n - 2].x, lp[n - 1].z - lp[n - 2].z) < 4) useGame.setState({ linhaParadas: lp.slice(0, -1) });
      concluirLinha();
    };
    el.addEventListener('dblclick', onDbl);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerdown', onDown);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
    el.addEventListener('contextmenu', ctx);
    return () => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKeyUp);
      el.removeEventListener('contextmenu', ctx);
      el.removeEventListener('dblclick', onDbl);
    };
  }, [gl, camera, hm, pontos, size]);

  const anel = useRef<THREE.Mesh>(null);
  useFrame(() => {
    if (anel.current && cursor) anel.current.position.set(cursor.x, Math.max(0, cursor.y) + (ferramenta.tipo === 'operacao' ? 3 : 1), cursor.z);
  });

  const matOk = useMemo(() => new THREE.MeshBasicMaterial({ color: '#3ee0b0', transparent: true, opacity: 0.45, depthWrite: false }), []);
  const matErro = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ff5b4d', transparent: true, opacity: 0.5, depthWrite: false }), []);
  const matAnel = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.8, depthTest: false, toneMapped: false }), []);

  const rotulo = (texto: React.ReactNode, erro?: boolean) => cursor && (
    <Html position={[cursor.x, cursor.y + 6, cursor.z]} style={{ pointerEvents: 'none', transform: 'translate(16px, -36px)' }} zIndexRange={[20, 0]}>
      <div className={`painel rounded-md px-2.5 py-1.5 text-xs whitespace-nowrap ${erro ? 'text-perigo' : 'text-texto'}`}>{texto}</div>
    </Html>
  );

  return (
    <group>
      {/* ponto inicial e snaps */}
      {ferramenta.tipo === 'via' && pontos.map((p, i) => (
        <mesh key={i} position={[p.x, roadBaseY(hm, p.x, p.z) + 1, p.z]} rotation-x={-Math.PI / 2} material={matAnel} renderOrder={10}>
          <ringGeometry args={[3, 4.2, 24]} />
        </mesh>
      ))}
      {previa && <mesh geometry={previa.geo} material={previa.ok ? matOk : matErro} renderOrder={5} />}
      {previa && previa.snapFim && (
        <mesh position={[previa.fim.x, roadBaseY(hm, previa.fim.x, previa.fim.z) + 1.2, previa.fim.z]} rotation-x={-Math.PI / 2} material={matAnel} renderOrder={10}>
          <ringGeometry args={[4.5, 5.6, 24]} />
        </mesh>
      )}
      {previa && rotulo(previa.ok ? (
        <span><b>{ROAD_SPECS[previa.req.type].nome}</b> · {fmt.int(previa.plan.comprimento)} m · <span className="text-acento-2">{fmt.reais(previa.plan.custo)}</span>{previa.plan.ponteM > 1 ? ` · ponte ${fmt.int(previa.plan.ponteM)} m` : ''}{previa.plan.cruzamentos ? ` · ${previa.plan.cruzamentos} cruzamento(s)` : ''}</span>
      ) : previa.erro, !previa.ok)}
      {ferramenta.tipo === 'via' && !pontos.length && cursor && rotulo(ferramenta.curva ? 'Clique: início → ponto de curva → fim' : 'Clique para começar a via (Shift: 15°)')}
      {ferramenta.tipo === 'via' && ferramenta.curva && pontos.length === 1 && cursor && !previa?.erro && rotulo('Agora clique no ponto que define a curva')}

      {/* pincel de zona */}
      {ferramenta.tipo === 'zona' && cursor && (
        <mesh ref={anel} rotation-x={-Math.PI / 2} material={matAnel} renderOrder={10}>
          <ringGeometry args={[raio - 1.2, raio, 48]} />
        </mesh>
      )}

      {/* equipamento */}
      {previaEq && (
        <group position={[previaEq.fp.x, sampleHeight(hm, previaEq.fp.x, previaEq.fp.z) + previaEq.eq.altura / 2 + 0.5, previaEq.fp.z]} rotation-y={previaEq.fp.angle}>
          <mesh material={previaEq.ok ? matOk : matErro}><boxGeometry args={[previaEq.eq.w, Math.max(2, previaEq.eq.altura), previaEq.eq.d]} /></mesh>
        </group>
      )}
      {previaEq && rotulo(previaEq.ok ? <span><b>{previaEq.eq.nome}</b> · <span className="text-acento-2">{fmt.reais(previaEq.eq.custo)}</span></span> : previaEq.erro, !previaEq.ok)}

      {/* linha de transporte */}
      {previaLinha && previaLinha.pts.map((p, i) => (
        <mesh key={`lp${i}`} position={[p.x, roadBaseY(hm, p.x, p.z) + 1.4, p.z]} rotation-x={-Math.PI / 2} material={i < previaLinha.pts.length - 1 ? matAnel : matOk} renderOrder={10}>
          <ringGeometry args={[4, 5.4, 24]} />
        </mesh>
      ))}
      {previaLinha?.plano?.ok && previaLinha.plano.caminho.length >= 4 && (
        <Line points={Array.from({ length: previaLinha.plano.caminho.length / 2 }, (_, i) => [previaLinha.plano!.caminho[2 * i], roadBaseY(hm, previaLinha.plano!.caminho[2 * i], previaLinha.plano!.caminho[2 * i + 1]) + (ferramenta.tipo === 'linha' && ferramenta.linha === 'teleferico' ? 34 : 1.5), previaLinha.plano!.caminho[2 * i + 1]] as [number, number, number])}
          color="#3ee0b0" lineWidth={4} depthTest={false} renderOrder={11} />
      )}
      {ferramenta.tipo === 'linha' && cursor && rotulo(
        previaLinha?.plano
          ? previaLinha.plano.ok
            ? <span><b>{TIPOS_LINHA[ferramenta.linha].nome}</b> · {(previaLinha.plano.comprimento / 1000).toFixed(1).replace('.', ',')} km · {previaLinha.pts.length} paradas · {TIPOS_LINHA[ferramenta.linha].obra ? <span className="text-acento-2">obra estadual {fmt.reais(previaLinha.plano.custoObra)} · {previaLinha.plano.mesesObra} meses</span> : <span className="text-acento-2">{fmt.reais(previaLinha.plano.custoCidade)} · {previaLinha.plano.frota} ônibus</span>}<br /><span className="text-suave">Clique adiciona parada · Enter ou duplo clique conclui · Backspace desfaz</span></span>
            : previaLinha.plano.erro
          : 'Clique para colocar a primeira parada',
        !!previaLinha?.plano && !previaLinha.plano.ok)}
      {ferramenta.tipo === 'operacao' && cursor && (
        <mesh ref={anel} rotation-x={-Math.PI / 2} material={matErro} renderOrder={10}>
          <ringGeometry args={[270, 280, 64]} />
        </mesh>
      )}
      {ferramenta.tipo === 'operacao' && cursor && rotulo('Clique para ordenar a operação policial (raio de 280 m)')}

      {/* demolição */}
      {alvoDemolir && alvoDemolir.tipo === 'via' && <mesh geometry={alvoDemolir.geo} material={matErro} renderOrder={5} />}
      {alvoDemolir && alvoDemolir.tipo !== 'via' && (
        <group position={[alvoDemolir.fp.x, sampleHeight(hm, alvoDemolir.fp.x, alvoDemolir.fp.z) + 6, alvoDemolir.fp.z]} rotation-y={alvoDemolir.fp.angle}>
          <mesh material={matErro}><boxGeometry args={[alvoDemolir.fp.w + 1, 14, alvoDemolir.fp.d + 1]} /></mesh>
        </group>
      )}
      {ferramenta.tipo === 'demolir' && cursor && rotulo(alvoDemolir ? `Demolir: ${alvoDemolir.nome}` : 'Clique numa via, lote ou equipamento', !alvoDemolir)}
    </group>
  );
}
