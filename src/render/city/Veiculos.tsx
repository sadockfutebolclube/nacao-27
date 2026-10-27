/**
 * Amostra visual do tráfego (LOD de simulação): carros, motos e ônibus andando pela malha,
 * com faróis e lanternas à noite. A quantidade acompanha população e empregos simulados.
 */
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Rng } from '../../sim/core/rng';
import { mundo, useGame } from '../../sim/bridge';
import { ROAD_SPECS } from '../../world/roads';
import { ambiente } from './ambiente';
import { amostrarPerfil } from './perfilVias';
import { perfisAtuais } from './Vias';
import { mergeGeos } from './Vias';

const MAX = 700;
const CORES_CARRO = ['#e8e8e8', '#c9ccd1', '#2b2d30', '#8f969c', '#b0262b', '#1d3f73', '#e8e8e8', '#5a5f63', '#f2f2ee', '#3a5f3a', '#d9c39a'];

interface Carro { edge: number; s: number; dir: 1 | -1; v: number; tipo: 0 | 1 | 2; faixa: number; ativo: boolean }

function geoCarro() {
  const corpo = new THREE.BoxGeometry(1.8, 0.75, 4.2).translate(0, 0.55, 0);
  const cabine = new THREE.BoxGeometry(1.6, 0.6, 2.2).translate(0, 1.2, -0.2);
  return mergeGeos([corpo, cabine]);
}
function geoOnibus() {
  return new THREE.BoxGeometry(2.5, 2.9, 12).translate(0, 1.75, 0);
}
function geoMoto() {
  return mergeGeos([new THREE.BoxGeometry(0.5, 0.9, 1.9).translate(0, 0.7, 0), new THREE.BoxGeometry(0.45, 0.6, 0.4).translate(0, 1.5, -0.1)]);
}

export function Veiculos() {
  const wv = useGame((s) => s.worldVersion);
  const tv = useGame((s) => s.transitoVersion);
  const refs = { carro: useRef<THREE.InstancedMesh>(null), onibus: useRef<THREE.InstancedMesh>(null), moto: useRef<THREE.InstancedMesh>(null), luzF: useRef<THREE.InstancedMesh>(null), luzT: useRef<THREE.InstancedMesh>(null) };
  const geos = useMemo(() => ({ carro: geoCarro(), onibus: geoOnibus(), moto: geoMoto(), luz: new THREE.BoxGeometry(1.5, 0.18, 0.12) }), []);
  const mats = useMemo(() => ({
    carro: new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.5 }),
    luzF: new THREE.MeshBasicMaterial({ color: '#fff3d0', toneMapped: false }),
    luzT: new THREE.MeshBasicMaterial({ color: '#ff2a1a', toneMapped: false }),
  }), []);
  useEffect(() => () => { Object.values(geos).forEach((g) => g.dispose()); Object.values(mats).forEach((m) => m.dispose()); }, [geos, mats]);

  const rng = useMemo(() => new Rng(777), []);
  const carros = useRef<Carro[]>([]);
  const adj = useMemo(() => {
    const m = new Map<number, number[]>();
    for (const e of mundo.roads.edges.values()) {
      (m.get(e.a) ?? m.set(e.a, []).get(e.a)!).push(e.id);
      (m.get(e.b) ?? m.set(e.b, []).get(e.b)!).push(e.id);
    }
    return m;
  }, [wv]);

  // sorteio de arestas proporcional ao volume do modelo de tráfego (com piso para ruas vazias)
  const sorteio = useMemo(() => {
    const ids: number[] = [], acum: number[] = [];
    let t = 0;
    for (const e of mundo.roads.edges.values()) {
      const vc = mundo.transito.get(e.id) ?? 0;
      t += 0.15 + vc * (e.type === 'avenida' ? 3 : 1);
      ids.push(e.id); acum.push(t);
    }
    return { ids, acum, total: t };
  }, [wv, tv]);

  useEffect(() => {
    // trechos mudaram: reposiciona carros cuja aresta sumiu
    for (const c of carros.current) if (!mundo.roads.edges.has(c.edge)) c.ativo = false;
  }, [wv]);

  const tmp = useMemo(() => ({ p: { x: 0, y: 0, z: 0, tx: 0, tz: 0 }, m: new THREE.Matrix4(), q: new THREE.Quaternion(), v: new THREE.Vector3(), s: new THREE.Vector3(1, 1, 1), off: new THREE.Vector3(), eixo: new THREE.Vector3(0, 1, 0), c: new THREE.Color() }), []);

  useFrame((_, dtReal) => {
    const g = useGame.getState();
    const dt = Math.min(0.05, dtReal) * (g.velocidade > 0 ? Math.min(2, 0.6 + g.velocidade * 0.4) : 0);
    const st = g.stats;
    const edges = [...mundo.roads.edges.keys()];
    const viagens = st?.cidade.mobilidade.viagensDia ?? 0;
    const porModelo = viagens > 0 ? 8 + (viagens * (st!.cidade.mobilidade.modal.carro + st!.cidade.mobilidade.modal.informal)) / 45 : 0;
    const alvo = edges.length ? Math.min(MAX, Math.round(porModelo || 6 + (st ? st.populacao / 90 + st.empregos / 160 : 0)), edges.length * 8) : 0;
    const lista = carros.current;
    // nasce/morre gradualmente
    while (lista.length < alvo) lista.push({ edge: 0, s: 0, dir: 1, v: 0, tipo: 0, faixa: 0, ativo: false });
    if (lista.length > alvo) lista.length = alvo;

    const { p, m, q, v, s, off, eixo } = tmp;
    let nC = 0, nO = 0, nM = 0, nL = 0;
    const carro = refs.carro.current, onibus = refs.onibus.current, moto = refs.moto.current, lf = refs.luzF.current, lt = refs.luzT.current;
    if (!carro || !onibus || !moto || !lf || !lt) return;
    const noite = ambiente.noite;

    for (let i = 0; i < lista.length; i++) {
      const c = lista[i];
      if (!c.ativo || !perfisAtuais.has(c.edge)) {
        if (!edges.length) break;
        {
          const r = rng.next() * sorteio.total;
          let lo = 0, hi = sorteio.acum.length - 1;
          while (lo < hi) { const m = (lo + hi) >> 1; if (sorteio.acum[m] < r) lo = m + 1; else hi = m; }
          c.edge = sorteio.ids[lo] ?? edges[0];
        }
        const pf = perfisAtuais.get(c.edge);
        if (!pf) continue;
        c.s = rng.range(0, pf.comprimento);
        c.dir = rng.chance(0.5) ? 1 : -1;
        const r = rng.next();
        c.tipo = r < 0.08 ? 1 : r < 0.3 ? 2 : 0;
        c.v = c.tipo === 1 ? 9 : rng.range(9, 15);
        c.faixa = rng.int(0, 1);
        c.ativo = true;
      }
      const pf = perfisAtuais.get(c.edge);
      if (!pf) { c.ativo = false; continue; }
      const lim = ROAD_SPECS[pf.edge.type].velocidade;
      // congestionamento: curva BPR (1 + 0,15·(v/c)^4) — engarrafamento visível
      const vc = mundo.transito.get(c.edge) ?? 0;
      const lento = Math.max(0.12, 1 / (1 + 0.15 * Math.pow(vc, 4)));
      c.s += c.dir * Math.min(c.v, lim) * lento * dt;
      if (c.s < 0 || c.s > pf.comprimento) {
        // chegou ao nó: escolhe o próximo trecho (evita retorno se houver opção)
        const no = c.s < 0 ? pf.edge.a : pf.edge.b;
        const op = (adj.get(no) ?? []).filter((id) => id !== c.edge);
        const prox = op.length ? op[rng.int(0, op.length - 1)] : c.edge;
        const np = perfisAtuais.get(prox);
        if (!np) { c.ativo = false; continue; }
        c.edge = prox;
        if (np.edge.a === no) { c.dir = 1; c.s = 0.5; } else { c.dir = -1; c.s = np.comprimento - 0.5; }
        continue;
      }
      amostrarPerfil(pf, c.s, p);
      const largura = ROAD_SPECS[pf.edge.type].width;
      const faixaOff = pf.edge.type === 'avenida' ? (c.faixa ? largura * 0.38 : largura * 0.2) : largura * 0.25;
      // mão direita
      const nx = -p.tz * c.dir, nz = p.tx * c.dir;
      v.set(p.x + nx * faixaOff, p.y + 0.02, p.z + nz * faixaOff);
      q.setFromAxisAngle(eixo, Math.atan2(p.tx * c.dir, p.tz * c.dir));
      m.compose(v, q, s);
      const cor = tmp.c.set(c.tipo === 1 ? (i % 3 ? '#f2f2ee' : '#e0b030') : CORES_CARRO[i % CORES_CARRO.length]);
      if (c.tipo === 1) { onibus.setMatrixAt(nO, m); onibus.setColorAt(nO, cor); nO++; }
      else if (c.tipo === 2) { moto.setMatrixAt(nM, m); moto.setColorAt(nM, cor); nM++; }
      else { carro.setMatrixAt(nC, m); carro.setColorAt(nC, cor); nC++; }
      if (noite > 0.05 && nL < MAX) {
        const comp = c.tipo === 1 ? 6 : c.tipo === 2 ? 1 : 2.12;
        off.set(0, 0.6, comp).applyQuaternion(q).add(v);
        m.compose(off, q, s.set(c.tipo === 2 ? 0.3 : c.tipo === 1 ? 1.6 : 1, 1, 1));
        lf.setMatrixAt(nL, m);
        off.set(0, 0.7, -comp).applyQuaternion(q).add(v);
        m.compose(off, q, s);
        lt.setMatrixAt(nL, m);
        s.set(1, 1, 1);
        nL++;
      }
    }
    carro.count = nC; onibus.count = nO; moto.count = nM; lf.count = nL; lt.count = nL;
    for (const im of [carro, onibus, moto, lf, lt]) {
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
    }
    mats.luzF.color.setScalar(1).multiplyScalar(1 + noite * 3);
    mats.luzT.color.setRGB(1 + noite * 2, 0.12, 0.08);
  });

  return (
    <group>
      <instancedMesh ref={refs.carro} args={[geos.carro, mats.carro, MAX]} castShadow frustumCulled={false} />
      <instancedMesh ref={refs.onibus} args={[geos.onibus, mats.carro, MAX]} castShadow frustumCulled={false} />
      <instancedMesh ref={refs.moto} args={[geos.moto, mats.carro, MAX]} castShadow frustumCulled={false} />
      <instancedMesh ref={refs.luzF} args={[geos.luz, mats.luzF, MAX]} frustumCulled={false} />
      <instancedMesh ref={refs.luzT} args={[geos.luz, mats.luzT, MAX]} frustumCulled={false} />
    </group>
  );
}
