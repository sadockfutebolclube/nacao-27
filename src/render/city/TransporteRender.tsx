/**
 * Transporte visível: abrigos de ônibus, estações-tubo do BRT, acessos do metrô, teleférico com
 * torres, cabos e gôndolas; ônibus e articulados rodando nas linhas; mapa de calor do trânsito
 * e traçado das linhas nas camadas.
 */
import { Line } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { mundo, useGame } from '../../sim/bridge';
import { TIPOS_LINHA } from '../../sim/city/transporte';
import { larguraVia } from '../../world/roads';
import { roadBaseY, sampleHeight, type Heightmap } from '../../world/terrain';
import { ambiente } from './ambiente';
import { perfisAtuais } from './Vias';

const ALTURA_CABO = 34;

interface Trajeto { pts: Float32Array; cum: Float32Array; L: number }

function trajeto(caminho: number[], alturaY: (x: number, z: number, i: number) => number): Trajeto {
  const n = caminho.length / 2;
  const pts = new Float32Array(n * 3), cum = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = caminho[2 * i], z = caminho[2 * i + 1];
    pts[3 * i] = x; pts[3 * i + 1] = alturaY(x, z, i); pts[3 * i + 2] = z;
    if (i) cum[i] = cum[i - 1] + Math.hypot(x - caminho[2 * i - 2], z - caminho[2 * i - 1]);
  }
  return { pts, cum, L: cum[n - 1] || 1 };
}

function pontoEm(t: Trajeto, s: number, out: THREE.Vector3, dir: THREE.Vector3) {
  const { pts, cum } = t;
  let i = 0;
  // busca binária no comprimento acumulado
  let lo = 0, hi = cum.length - 1;
  while (lo < hi) { const m = (lo + hi) >> 1; if (cum[m] < s) lo = m + 1; else hi = m; }
  i = Math.max(1, lo);
  const a = i - 1, f = (s - cum[a]) / Math.max(1e-6, cum[i] - cum[a]);
  out.set(pts[3 * a] + (pts[3 * i] - pts[3 * a]) * f, pts[3 * a + 1] + (pts[3 * i + 1] - pts[3 * a + 1]) * f, pts[3 * a + 2] + (pts[3 * i + 2] - pts[3 * a + 2]) * f);
  dir.set(pts[3 * i] - pts[3 * a], 0, pts[3 * i + 2] - pts[3 * a + 2]).normalize();
}

export function TransporteRender({ hm }: { hm: Heightmap }) {
  const lv = useGame((s) => s.linhasVersion);
  const camada = useGame((s) => s.camada);
  const ferramenta = useGame((s) => s.ferramenta);
  const mostrarTracado = camada === 'transporte' || ferramenta.tipo === 'linha';

  const linhas = useMemo(() => mundo.linhas.map((l) => {
    const aereo = l.tipo === 'teleferico';
    const sub = l.tipo === 'metro';
    const tr = trajeto(l.caminho, (x, z) => (aereo ? Math.max(0, sampleHeight(hm, x, z)) + ALTURA_CABO : sub ? Math.max(0, sampleHeight(hm, x, z)) + 1.2 : roadBaseY(hm, x, z) + 0.4));
    return { ...l, tr };
  }), [lv, hm]);

  // ── infraestrutura estática ──
  const estatico = useMemo(() => {
    const abrigos: THREE.Matrix4[] = [], tubos: THREE.Matrix4[] = [], acessos: THREE.Matrix4[] = [], torres: THREE.Matrix4[] = [], estTel: THREE.Matrix4[] = [];
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(1, 1, 1);
    const eixo = new THREE.Vector3(0, 1, 0);
    for (const l of linhas) {
      const obra = l.status === 'em_obra';
      for (let i = 0; i < l.paradas.length; i++) {
        const pa = l.paradas[i];
        const prox = l.paradas[Math.min(l.paradas.length - 1, i + 1)], ant = l.paradas[Math.max(0, i - 1)];
        const ang = Math.atan2(prox.x - ant.x, prox.z - ant.z);
        q.setFromAxisAngle(eixo, ang);
        if (l.tipo === 'onibus') {
          p.set(pa.x + 6, roadBaseY(hm, pa.x, pa.z) + 0.2, pa.z);
          m.compose(p, q, s); abrigos.push(m.clone());
        } else if (l.tipo === 'brt') {
          p.set(pa.x, roadBaseY(hm, pa.x, pa.z) + 0.2, pa.z);
          m.compose(p, q, s.set(obra ? 0.6 : 1, obra ? 0.4 : 1, 1)); tubos.push(m.clone()); s.set(1, 1, 1);
        } else if (l.tipo === 'metro') {
          p.set(pa.x, Math.max(0, sampleHeight(hm, pa.x, pa.z)), pa.z);
          m.compose(p, q, s); acessos.push(m.clone());
        } else {
          p.set(pa.x, Math.max(0, sampleHeight(hm, pa.x, pa.z)), pa.z);
          m.compose(p, q, s.set(1, obra ? 0.5 : 1, 1)); estTel.push(m.clone()); s.set(1, 1, 1);
        }
      }
      if (l.tipo === 'teleferico' && !obra) {
        // torres a cada ~140 m
        const { tr } = l;
        const v = new THREE.Vector3(), d = new THREE.Vector3();
        for (let sx = 140; sx < tr.L - 60; sx += 140) {
          pontoEm(tr, sx, v, d);
          const chao = Math.max(0, sampleHeight(hm, v.x, v.z));
          p.set(v.x, chao, v.z);
          m.compose(p, q.setFromAxisAngle(eixo, Math.atan2(d.x, d.z)), s.set(1, (v.y - chao + 2) / 30, 1));
          torres.push(m.clone()); s.set(1, 1, 1);
        }
      }
    }
    return { abrigos, tubos, acessos, torres, estTel };
  }, [linhas, hm]);

  const geos = useMemo(() => {
    const abrigo = new THREE.BoxGeometry(3.4, 0.15, 1.6).translate(0, 2.6, 0);
    const poste = new THREE.BoxGeometry(0.12, 2.6, 0.12).translate(1.5, 1.3, 0.6);
    const tubo = new THREE.CylinderGeometry(1.8, 1.8, 16, 14, 1, true).rotateX(Math.PI / 2).translate(0, 2.4, 0);
    const acesso = new THREE.BoxGeometry(5, 3.2, 7).translate(0, 1.6, 0);
    const placa = new THREE.BoxGeometry(1.2, 1.2, 0.2).translate(3.2, 4.6, 0);
    const torre = new THREE.CylinderGeometry(0.5, 1.1, 30, 6).translate(0, 15, 0);
    const estTel = new THREE.BoxGeometry(16, 8, 12).translate(0, ALTURA_CABO - 6, 0);
    const pilar = new THREE.BoxGeometry(3, ALTURA_CABO - 10, 3).translate(0, (ALTURA_CABO - 10) / 2, 0);
    const onibus = new THREE.BoxGeometry(2.5, 3, 12).translate(0, 1.7, 0);
    const articulado = new THREE.BoxGeometry(2.6, 3.2, 20).translate(0, 1.8, 0);
    const gondola = new THREE.BoxGeometry(2.2, 2.2, 2.2).translate(0, -2.4, 0);
    return { abrigo, poste, tubo, acesso, placa, torre, estTel, pilar, onibus, articulado, gondola };
  }, []);
  useEffect(() => () => Object.values(geos).forEach((g) => g.dispose()), [geos]);
  const mats = useMemo(() => ({
    abrigo: new THREE.MeshStandardMaterial({ color: '#d9dee2', roughness: 0.5, metalness: 0.3 }),
    vidro: new THREE.MeshStandardMaterial({ color: '#8fc8e8', roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
    acesso: new THREE.MeshStandardMaterial({ color: '#3b4a57', roughness: 0.6 }),
    placa: new THREE.MeshStandardMaterial({ color: '#2e86de', emissive: new THREE.Color('#2e86de'), emissiveIntensity: 0.6 }),
    torre: new THREE.MeshStandardMaterial({ color: '#b9c0c6', roughness: 0.5, metalness: 0.5 }),
    estTel: new THREE.MeshStandardMaterial({ color: '#e8e2d4', roughness: 0.7 }),
    veiculo: new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.3 }),
    gondola: new THREE.MeshStandardMaterial({ color: '#ffd166', roughness: 0.4, metalness: 0.2 }),
  }), []);
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);

  // ── veículos nas linhas ──
  const refOnibus = useRef<THREE.InstancedMesh>(null), refArt = useRef<THREE.InstancedMesh>(null), refGond = useRef<THREE.InstancedMesh>(null);
  const tmp = useMemo(() => ({ p: new THREE.Vector3(), d: new THREE.Vector3(), m: new THREE.Matrix4(), q: new THREE.Quaternion(), s: new THREE.Vector3(1, 1, 1), c: new THREE.Color(), eixo: new THREE.Vector3(0, 1, 0), t: 0 }), []);
  useFrame((_, dt) => {
    const g = useGame.getState();
    tmp.t += dt * (g.velocidade > 0 ? Math.min(2.5, 0.6 + g.velocidade * 0.5) : 0);
    const on = refOnibus.current, ar = refArt.current, go = refGond.current;
    if (!on || !ar || !go) return;
    let nO = 0, nA = 0, nG = 0;
    const { p, d, m, q, s, c, eixo } = tmp;
    for (const l of linhas) {
      if (l.status !== 'operando' || l.tipo === 'metro') continue;
      const def = TIPOS_LINHA[l.tipo];
      const n = Math.min(l.tipo === 'teleferico' ? 60 : 30, l.frota);
      const L = l.tr.L;
      for (let k = 0; k < n; k++) {
        let sp = (tmp.t * def.vel + (k / n) * 2 * L) % (2 * L);
        const volta = sp > L;
        if (volta) sp = 2 * L - sp;
        pontoEm(l.tr, sp, p, d);
        if (volta) d.multiplyScalar(-1);
        // mão direita para ônibus e BRT
        if (l.tipo !== 'teleferico') { p.x += -d.z * 2.4; p.z += d.x * 2.4; }
        q.setFromAxisAngle(eixo, Math.atan2(d.x, d.z));
        m.compose(p, q, s);
        if (l.tipo === 'teleferico') { go.setMatrixAt(nG++, m); }
        else if (l.tipo === 'brt') { ar.setMatrixAt(nA, m); ar.setColorAt(nA, c.set(l.cor)); nA++; }
        else { on.setMatrixAt(nO, m); on.setColorAt(nO, c.set(l.cor)); nO++; }
      }
    }
    on.count = nO; ar.count = nA; go.count = nG;
    for (const im of [on, ar, go]) { im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; }
    mats.placa.emissiveIntensity = 0.4 + ambiente.noite * 2;
  });

  return (
    <group>
      <Inst m={estatico.abrigos} g={geos.abrigo} mat={mats.abrigo} />
      <Inst m={estatico.abrigos} g={geos.poste} mat={mats.abrigo} />
      <Inst m={estatico.tubos} g={geos.tubo} mat={mats.vidro} />
      <Inst m={estatico.acessos} g={geos.acesso} mat={mats.acesso} />
      <Inst m={estatico.acessos} g={geos.placa} mat={mats.placa} />
      <Inst m={estatico.torres} g={geos.torre} mat={mats.torre} />
      <Inst m={estatico.estTel} g={geos.estTel} mat={mats.estTel} />
      <Inst m={estatico.estTel} g={geos.pilar} mat={mats.estTel} />
      <instancedMesh ref={refOnibus} args={[geos.onibus, mats.veiculo, 400]} castShadow frustumCulled={false} />
      <instancedMesh ref={refArt} args={[geos.articulado, mats.veiculo, 200]} castShadow frustumCulled={false} />
      <instancedMesh ref={refGond} args={[geos.gondola, mats.gondola, 400]} castShadow frustumCulled={false} />
      {/* cabos do teleférico (sempre visíveis) */}
      {linhas.filter((l) => l.tipo === 'teleferico' && l.status === 'operando').map((l) => (
        <Line key={`cabo${l.id}`} points={Array.from({ length: l.tr.pts.length / 3 }, (_, i) => [l.tr.pts[3 * i], l.tr.pts[3 * i + 1] + 0.2, l.tr.pts[3 * i + 2]] as [number, number, number])} color="#2b2b2b" lineWidth={1.2} />
      ))}
      {/* traçado das linhas na camada Transporte */}
      {mostrarTracado && linhas.map((l) => (
        <Line key={`l${l.id}`} points={Array.from({ length: l.tr.pts.length / 3 }, (_, i) => [l.tr.pts[3 * i], l.tr.pts[3 * i + 1] + 1.2, l.tr.pts[3 * i + 2]] as [number, number, number])}
          color={l.cor} lineWidth={l.tipo === 'onibus' ? 3 : 5} dashed={l.status === 'em_obra' || l.tipo === 'metro'} dashSize={14} gapSize={8} depthTest={false} transparent opacity={0.9} renderOrder={8} />
      ))}
      <Transito />
    </group>
  );
}

function Inst({ m, g, mat }: { m: THREE.Matrix4[]; g: THREE.BufferGeometry; mat: THREE.Material }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const cap = Math.max(8, m.length);
  useEffect(() => {
    const im = ref.current;
    if (!im) return;
    m.forEach((x, i) => im.setMatrixAt(i, x));
    im.count = m.length;
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere();
  }, [m]);
  return <instancedMesh key={cap} ref={ref} args={[g, mat, cap]} castShadow receiveShadow frustumCulled={false} />;
}

/** Camada "Trânsito": vias pintadas de verde a vermelho pela relação volume/capacidade no pico. */
function Transito() {
  const camada = useGame((s) => s.camada);
  const tv = useGame((s) => s.transitoVersion);
  const wv = useGame((s) => s.worldVersion);
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -8, polygonOffsetUnits: -8 }), []);
  useEffect(() => () => mat.dispose(), [mat]);
  const geo = useMemo(() => {
    if (camada !== 'transito') return null;
    const pos: number[] = [], col: number[] = [], idx: number[] = [];
    const c = new THREE.Color();
    const verde = new THREE.Color('#3ee0b0'), amarelo = new THREE.Color('#f5d142'), laranja = new THREE.Color('#ff8a3d'), vermelho = new THREE.Color('#e5484d');
    for (const p of perfisAtuais.values()) {
      const vc = mundo.transito.get(p.edge.id) ?? 0;
      if (vc < 0.5) c.copy(verde).lerp(amarelo, vc / 0.5);
      else if (vc < 0.85) c.copy(amarelo).lerp(laranja, (vc - 0.5) / 0.35);
      else c.copy(laranja).lerp(vermelho, Math.min(1, (vc - 0.85) / 0.4));
      const hw = larguraVia(p.edge) / 2 * 0.8;
      const base = pos.length / 3;
      for (let i = 0; i < p.n; i++) {
        const nx = -p.tz[i], nz = p.tx[i];
        pos.push(p.x[i] - nx * hw, p.y[i] + 0.35, p.z[i] - nz * hw, p.x[i] + nx * hw, p.y[i] + 0.35, p.z[i] + nz * hw);
        col.push(c.r, c.g, c.b, c.r, c.g, c.b);
        if (i < p.n - 1) { const a = base + i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      }
    }
    if (!pos.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeBoundingSphere();
    return g;
  }, [camada, tv, wv]);
  useEffect(() => () => geo?.dispose(), [geo]);
  if (!geo) return null;
  return <mesh geometry={geo} material={mat} renderOrder={6} />;
}
