/**
 * Metrô, trem, VLT, bonde e cremalheira do Rio (Fase 18), do OpenStreetMap: via permanente com dormentes e
 * trilhos, túneis que mergulham no morro (o metrô passa 16 m abaixo do chão), viadutos com pilares, estações
 * com nome e os trens andando para lá e para cá — mais trens quanto mais curto o intervalo da linha. Os trens
 * não entram na simulação (passageiros, caixa): são cenário vivo. © colaboradores do OpenStreetMap (ODbL).
 */
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { mundo, useGame } from '../../sim/bridge';
import { sampleHeight, type Heightmap } from '../../world/terrain';
import { ambiente } from './ambiente';
import { alvoCamera } from './Camera';
import { etiqueta } from './Bairros';

type Tipo = 'metro' | 'trem' | 'vlt' | 'bonde' | 'cremalheira';
interface Linha { id: string; tipo: Tipo; nome: string; cor: string; trajetos: number[][] }
interface Estacao { nome: string; tipo: Tipo; x: number; z: number }
interface Dados { linhas: Linha[]; estacoes: Estacao[] }

/** trajeto reamostrado a cada 8 m, com a cota já suavizada */
interface Trajeto { linha: number; tipo: Tipo; cor: THREE.Color; xs: Float32Array; ys: Float32Array; zs: Float32Array; hs: Float32Array; ns: Int8Array; cum: Float32Array; comp: number }

/** como cada tipo anda: velocidade (m/s), intervalo (min), composição (vagões × comprimento em m), largura e altura do vagão */
const MATERIAL: Record<Tipo, { v: number; intervalo: number; vagoes: number; comp: number; larg: number; alt: number }> = {
  metro: { v: 14, intervalo: 4.5, vagoes: 6, comp: 19, larg: 2.9, alt: 3.5 },
  trem: { v: 15, intervalo: 9, vagoes: 8, comp: 20, larg: 3.0, alt: 3.8 },
  vlt: { v: 7, intervalo: 7, vagoes: 7, comp: 6.5, larg: 2.65, alt: 3.4 },
  bonde: { v: 5, intervalo: 14, vagoes: 1, comp: 8.5, larg: 2.3, alt: 3.2 },
  cremalheira: { v: 4, intervalo: 20, vagoes: 2, comp: 10, larg: 2.6, alt: 3.2 },
};
const PASSO = 8;
const PROFUNDIDADE_TUNEL = 16;
const ALTURA_VIADUTO = 7;
const TIPOS: Tipo[] = ['metro', 'trem', 'vlt', 'bonde', 'cremalheira'];

function preparar(d: Dados, hm: Heightmap): Trajeto[] {
  const out: Trajeto[] = [];
  d.linhas.forEach((l, li) => {
    const cor = new THREE.Color(l.cor);
    for (const t of l.trajetos) {
      const n = t.length / 3;
      // reamostra a cada PASSO m; o nível de um trecho é o do ponto de chegada
      const px: number[] = [], pz: number[] = [], pn: number[] = [];
      for (let i = 0; i + 1 < n; i++) {
        const x0 = t[i * 3], z0 = t[i * 3 + 1], x1 = t[(i + 1) * 3], z1 = t[(i + 1) * 3 + 1], nv = t[(i + 1) * 3 + 2];
        const L = Math.hypot(x1 - x0, z1 - z0), k = Math.max(1, Math.round(L / PASSO));
        for (let s = 0; s < k; s++) { px.push(x0 + ((x1 - x0) * s) / k); pz.push(z0 + ((z1 - z0) * s) / k); pn.push(nv); }
      }
      px.push(t[(n - 1) * 3]); pz.push(t[(n - 1) * 3 + 1]); pn.push(t[(n - 1) * 3 + 2]);
      const m = px.length;
      if (m < 6) continue;
      const xs = Float32Array.from(px), zs = Float32Array.from(pz), ns = Int8Array.from(pn);
      const hs = new Float32Array(m), alvo = new Float32Array(m), ys = new Float32Array(m), cum = new Float32Array(m);
      for (let i = 0; i < m; i++) {
        hs[i] = Math.max(0.5, sampleHeight(hm, xs[i], zs[i]));
        alvo[i] = ns[i] < 0 ? hs[i] - PROFUNDIDADE_TUNEL : ns[i] > 0 ? hs[i] + ALTURA_VIADUTO : hs[i] + 0.3;
        if (i) cum[i] = cum[i - 1] + Math.hypot(xs[i] - xs[i - 1], zs[i] - zs[i - 1]);
      }
      // rampas: perto de uma mudança de nível a cota é a média da vizinhança (72 m); longe, o alvo
      const R = 9;
      for (let i = 0; i < m; i++) {
        let muda = false;
        for (let k = Math.max(0, i - R); k <= Math.min(m - 1, i + R) && !muda; k++) if (ns[k] !== ns[i]) muda = true;
        if (!muda) { ys[i] = alvo[i]; continue; }
        let soma = 0, c = 0;
        for (let k = Math.max(0, i - R); k <= Math.min(m - 1, i + R); k++) { soma += alvo[k]; c++; }
        ys[i] = soma / c;
      }
      out.push({ linha: li, tipo: l.tipo, cor, xs, ys, zs, hs, ns, cum, comp: cum[m - 1] });
    }
  });
  return out;
}

/** Posição, rumo (unitário, com inclinação) e cota a `s` metros do começo. */
function amostra(t: Trajeto, s: number, p: THREE.Vector3, rumo: THREE.Vector3) {
  const c = Math.min(Math.max(s, 0), t.comp);
  let lo = 0, hi = t.cum.length - 1;
  while (lo < hi - 1) { const m = (lo + hi) >> 1; if (t.cum[m] <= c) lo = m; else hi = m; }
  const seg = Math.max(1e-6, t.cum[hi] - t.cum[lo]), f = (c - t.cum[lo]) / seg;
  p.set(t.xs[lo] + (t.xs[hi] - t.xs[lo]) * f, t.ys[lo] + (t.ys[hi] - t.ys[lo]) * f, t.zs[lo] + (t.zs[hi] - t.zs[lo]) * f);
  rumo.set(t.xs[hi] - t.xs[lo], t.ys[hi] - t.ys[lo], t.zs[hi] - t.zs[lo]).normalize();
}

// ── geometrias ───────────────────────────────────────────────────────────────────

/**
 * Leito da via férrea (Fase 21): brita cinza-escura (e não o concreto claro que parecia uma calçada) com um dormente de
 * madeira a cada 60 cm, mais comprido que os trilhos e com a brita aparecendo nas pontas. Ladrilho: 3,4 m × 0,6 m.
 */
function texturaBalastro(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 64;
  const x = c.getContext('2d')!;
  x.fillStyle = '#625d56'; x.fillRect(0, 0, 128, 64);
  for (let i = 0; i < 900; i++) { const v = 40 + Math.random() * 90; x.fillStyle = `rgba(${v},${v * 0.97},${v * 0.92},0.7)`; x.fillRect(Math.random() * 128, Math.random() * 64, 1 + Math.random() * 3, 1 + Math.random() * 2); }
  // dormente: 2,6 m de comprimento (76% da largura) × 26 cm, madeira escura com veio
  x.fillStyle = '#463729'; x.fillRect(15, 20, 98, 17);
  x.fillStyle = 'rgba(20,14,9,0.5)'; for (let i = 0; i < 7; i++) x.fillRect(16 + Math.random() * 96, 21 + Math.random() * 15, 8 + Math.random() * 20, 1);
  x.fillStyle = 'rgba(0,0,0,0.35)'; x.fillRect(15, 37, 98, 2); // sombra sob o dormente
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.ClampToEdgeWrapping; t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  return t;
}

/** Vagão: corpo claro, faixa de janelas escura, saia e teto cinza; cor da linha na instância. */
function geoVagao(comp: number, larg: number, alt: number): THREE.BufferGeometry {
  const partes: { g: THREE.BufferGeometry; cor: [number, number, number] }[] = [
    { g: new THREE.BoxGeometry(larg, alt * 0.72, comp).translate(0, alt * 0.5, 0), cor: [1, 1, 1] },
    { g: new THREE.BoxGeometry(larg + 0.04, alt * 0.3, comp * 0.94).translate(0, alt * 0.62, 0), cor: [0.06, 0.09, 0.12] },
    { g: new THREE.BoxGeometry(larg * 0.9, alt * 0.12, comp * 0.96).translate(0, alt * 0.9, 0), cor: [0.72, 0.74, 0.76] },
    { g: new THREE.BoxGeometry(larg * 0.9, alt * 0.14, comp * 0.98).translate(0, alt * 0.12, 0), cor: [0.14, 0.14, 0.15] },
  ];
  const pos: number[] = [], nor: number[] = [], col: number[] = [], idx: number[] = [];
  let base = 0;
  for (const { g, cor } of partes) {
    const p = g.getAttribute('position'), n = g.getAttribute('normal');
    for (let i = 0; i < p.count; i++) { pos.push(p.getX(i), p.getY(i), p.getZ(i)); nor.push(n.getX(i), n.getY(i), n.getZ(i)); col.push(...cor); }
    for (let i = 0; i < g.index!.count; i++) idx.push(g.index!.getX(i) + base);
    base += p.count;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  out.setIndex(idx);
  return out;
}

/** Fita de via entre dois deslocamentos laterais, sobre os pontos [i0, i1] do trajeto. */
function fita(t: Trajeto, i0: number, i1: number, d0: number, d1: number, dy: number, pos: number[], nor: number[], uv: number[], idx: number[], vEsc: number) {
  const base = pos.length / 3;
  for (let i = i0; i <= i1; i++) {
    const a = Math.max(0, i - 1), b = Math.min(t.xs.length - 1, i + 1);
    const tx = t.xs[b] - t.xs[a], tz = t.zs[b] - t.zs[a], l = Math.hypot(tx, tz) || 1;
    const nx = -tz / l, nz = tx / l;
    pos.push(t.xs[i] + nx * d0, t.ys[i] + dy, t.zs[i] + nz * d0, t.xs[i] + nx * d1, t.ys[i] + dy, t.zs[i] + nz * d1);
    nor.push(0, 1, 0, 0, 1, 0);
    uv.push(0, t.cum[i] / vEsc, 1, t.cum[i] / vEsc);
  }
  for (let k = 0; k < i1 - i0; k++) { const a = base + k * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
}

export function Trilhos({ hm }: { hm: Heightmap }) {
  const real = mundo.real;
  const [dados, setDados] = useState<Dados | null>(null);
  const grupoEtq = useRef<THREE.Group>(null);
  const pool = useRef(new Map<number, THREE.Sprite>());
  const relogio = useRef({ t: 0, etq: 0 });
  const camada = useGame((s) => s.camada);
  void camada;
  useThree();

  useEffect(() => {
    if (!real || real.ibge !== '3304557') return;
    let vivo = true;
    fetch(`${import.meta.env.BASE_URL}data/rio/trilhos.json`).then((r) => (r.ok ? r.json() : null)).then((j) => { if (vivo && j) setDados(j as Dados); }).catch(() => { /* sem o arquivo, sem trilhos */ });
    return () => { vivo = false; };
  }, [real]);

  const trajetos = useMemo(() => (dados ? preparar(dados, hm) : []), [dados, hm]);

  // via permanente: lastro com dormentes + dois trilhos; só onde ela aparece (fora do túnel fundo)
  const via = useMemo(() => {
    const lp: number[] = [], ln: number[] = [], lu: number[] = [], li: number[] = [];
    const rp: number[] = [], rn: number[] = [], ru: number[] = [], ri: number[] = [];
    const pilares: THREE.Matrix4[] = [];
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3(1, 1, 1), eixo = new THREE.Vector3(0, 1, 0);
    for (const t of trajetos) {
      const n = t.xs.length;
      let i = 0;
      while (i < n) {
        if (t.ys[i] < t.hs[i] - 3.5) { i++; continue; }
        let j = i;
        while (j + 1 < n && t.ys[j + 1] >= t.hs[j + 1] - 3.5) j++;
        if (j > i) {
          fita(t, i, j, -1.7, 1.7, 0, lp, ln, lu, li, 0.6);
          fita(t, i, j, -0.78, -0.62, 0.14, rp, rn, ru, ri, 40);
          fita(t, i, j, 0.62, 0.78, 0.14, rp, rn, ru, ri, 40);
        }
        for (let k = i; k <= j; k += 3) {
          const vao = t.ys[k] - t.hs[k];
          if (vao > 3.2) {
            const a = Math.max(0, k - 1), b = Math.min(n - 1, k + 1);
            q.setFromAxisAngle(eixo, Math.atan2(t.xs[b] - t.xs[a], t.zs[b] - t.zs[a]));
            m.compose(v.set(t.xs[k], t.hs[k] + (vao - 0.6) / 2 - 0.4, t.zs[k]), q, s.set(3.2, vao + 0.5, 2.0));
            pilares.push(m.clone());
          }
        }
        i = j + 1;
      }
    }
    const geo = (pos: number[], nor: number[], uv: number[], idx: number[]) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx);
      g.computeBoundingSphere();
      return g;
    };
    return { lastro: geo(lp, ln, lu, li), trilhos: geo(rp, rn, ru, ri), pilares };
  }, [trajetos]);

  const mats = useMemo(() => ({
    lastro: new THREE.MeshStandardMaterial({ map: texturaBalastro(), roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }),
    trilho: new THREE.MeshStandardMaterial({ color: '#b8bcc0', roughness: 0.35, metalness: 0.8, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }),
    pilar: new THREE.MeshStandardMaterial({ color: '#b6b1a6', roughness: 0.9 }),
    vagao: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.25 }),
    plataforma: new THREE.MeshStandardMaterial({ color: '#bdb9b0', roughness: 0.9 }),
    telhado: new THREE.MeshStandardMaterial({ roughness: 0.6 }),
    cabine: new THREE.MeshStandardMaterial({ color: '#f58220', roughness: 0.6, emissive: '#f58220', emissiveIntensity: 0 }),
  }), []);
  const geos = useMemo(() => ({
    pilar: new THREE.BoxGeometry(1, 1, 1),
    caixa: new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0),
    vagao: Object.fromEntries(TIPOS.map((t) => [t, geoVagao(MATERIAL[t].comp, MATERIAL[t].larg, MATERIAL[t].alt)])) as Record<Tipo, THREE.BufferGeometry>,
  }), []);
  useEffect(() => () => {
    via.lastro.dispose(); via.trilhos.dispose();
    mats.lastro.map?.dispose();
    Object.values(mats).forEach((m) => m.dispose()); geos.pilar.dispose(); geos.caixa.dispose(); Object.values(geos.vagao).forEach((g) => g.dispose());
  }, [via, mats, geos]);

  // estações: plataforma e cobertura viradas para o trilho mais perto; no metrô, a entrada na superfície
  const estacoes = useMemo(() => {
    if (!dados) return { plat: [] as THREE.Matrix4[], teto: [] as { m: THREE.Matrix4; cor: THREE.Color }[], cab: [] as THREE.Matrix4[], pontos: [] as { x: number; y: number; z: number; nome: string; tipo: Tipo }[] };
    const plat: THREE.Matrix4[] = [], teto: { m: THREE.Matrix4; cor: THREE.Color }[] = [], cab: THREE.Matrix4[] = [], pontos: { x: number; y: number; z: number; nome: string; tipo: Tipo }[] = [];
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3(), eixo = new THREE.Vector3(0, 1, 0);
    const corTipo: Record<Tipo, string> = { metro: '#f58220', trem: '#1d4e89', vlt: '#2e9e5b', bonde: '#c0392b', cremalheira: '#8e44ad' };
    for (const e of dados.estacoes) {
      // trilho do mesmo tipo mais perto
      let melhor: { d: number; t: Trajeto; i: number } | null = null;
      for (const t of trajetos) {
        if (t.tipo !== e.tipo) continue;
        for (let i = 0; i < t.xs.length; i += 2) { const d = Math.hypot(t.xs[i] - e.x, t.zs[i] - e.z); if (d < (melhor?.d ?? 160)) melhor = { d, t, i }; }
      }
      const h = Math.max(0.5, sampleHeight(hm, e.x, e.z));
      let ang = 0;
      if (melhor) { const a = Math.max(0, melhor.i - 1), b = Math.min(melhor.t.xs.length - 1, melhor.i + 1); ang = Math.atan2(melhor.t.xs[b] - melhor.t.xs[a], melhor.t.zs[b] - melhor.t.zs[a]); }
      q.setFromAxisAngle(eixo, ang);
      pontos.push({ x: e.x, y: h, z: e.z, nome: e.nome, tipo: e.tipo });
      if (e.tipo === 'metro') {
        // entrada da estação: quiosque laranja com cobertura escura, de frente para a rua
        m.compose(v.set(e.x, h - 0.1, e.z), q, s.set(5.5, 3.2, 4.2)); cab.push(m.clone());
        m.compose(v.set(e.x, h + 3.2, e.z), q, s.set(6.4, 0.3, 5.0)); teto.push({ m: m.clone(), cor: new THREE.Color('#33373b') });
        continue;
      }
      const grande = e.tipo === 'trem';
      const comp = grande ? 120 : e.tipo === 'cremalheira' ? 14 : 36, lado = grande ? 5 : 3.2;
      const px = melhor ? melhor.t.xs[melhor.i] : e.x, pz = melhor ? melhor.t.zs[melhor.i] : e.z, py = melhor ? melhor.t.ys[melhor.i] : h;
      const nx = Math.cos(ang), nz = -Math.sin(ang); // normal (direita) do rumo
      m.compose(v.set(px + nx * lado, py - 0.1, pz + nz * lado), q, s.set(grande ? 4.5 : 2.6, 1.0, comp)); plat.push(m.clone());
      m.compose(v.set(px + nx * lado, py + 3.6, pz + nz * lado), q, s.set(grande ? 6 : 3.6, 0.25, comp * (grande ? 0.85 : 0.5))); teto.push({ m: m.clone(), cor: new THREE.Color(corTipo[e.tipo]) });
    }
    return { plat, teto, cab, pontos };
  }, [dados, trajetos, hm]);

  const refs = {
    plat: useRef<THREE.InstancedMesh>(null), teto: useRef<THREE.InstancedMesh>(null), cab: useRef<THREE.InstancedMesh>(null), pil: useRef<THREE.InstancedMesh>(null),
    vagoes: useRef<Partial<Record<Tipo, THREE.InstancedMesh | null>>>({}),
  };
  useEffect(() => {
    const aplica = (im: THREE.InstancedMesh | null, ms: THREE.Matrix4[], cores?: THREE.Color[]) => {
      if (!im) return;
      ms.forEach((m, i) => { im.setMatrixAt(i, m); if (cores) im.setColorAt(i, cores[i]); });
      im.count = ms.length; im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; im.computeBoundingSphere();
    };
    aplica(refs.plat.current, estacoes.plat);
    aplica(refs.teto.current, estacoes.teto.map((t) => t.m), estacoes.teto.map((t) => t.cor));
    aplica(refs.cab.current, estacoes.cab);
    aplica(refs.pil.current, via.pilares);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estacoes, via, dados]);

  // trens: quantos por trajeto vem do intervalo da linha; ida e volta no mesmo trilho
  const frota = useMemo(() => {
    const trens: { traj: number; fase: number; tipo: Tipo }[] = [];
    trajetos.forEach((t, ti) => {
      const M = MATERIAL[t.tipo];
      if (t.comp < 500) return;
      const n = Math.max(1, Math.min(6, Math.round(t.comp / (M.v * M.intervalo * 60))));
      for (let k = 0; k < n; k++) trens.push({ traj: ti, fase: (k / n) * 2 * t.comp + ((ti * 137) % 100), tipo: t.tipo });
    });
    return trens;
  }, [trajetos]);
  const cap = useMemo(() => Object.fromEntries(TIPOS.map((t) => [t, Math.max(4, frota.filter((f) => f.tipo === t).length * MATERIAL[t].vagoes)])) as Record<Tipo, number>, [frota]);

  const tmp = useMemo(() => ({ m: new THREE.Matrix4(), q: new THREE.Quaternion(), p: new THREE.Vector3(), r: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0), c: new THREE.Color(), e: new THREE.Euler() }), []);
  useFrame((_, dtReal) => {
    const R = relogio.current;
    const g = useGame.getState();
    R.t += Math.min(0.05, dtReal) * (g.velocidade > 0 ? Math.min(2, 0.6 + g.velocidade * 0.4) : 0);
    mats.cabine.emissiveIntensity = ambiente.noite * 1.2;
    const { m, q, p, r, up, c } = tmp;
    const cont: Record<Tipo, number> = { metro: 0, trem: 0, vlt: 0, bonde: 0, cremalheira: 0 };
    for (const tr of frota) {
      const t = trajetos[tr.traj], M = MATERIAL[tr.tipo];
      const im = refs.vagoes.current[tr.tipo];
      if (!im) continue;
      const u = (R.t * M.v + tr.fase) % (2 * t.comp);
      const ida = u < t.comp, sCab = ida ? u : 2 * t.comp - u;
      c.copy(t.cor).lerp(new THREE.Color('#ffffff'), tr.tipo === 'metro' || tr.tipo === 'trem' ? 0.55 : 0.35);
      for (let k = 0; k < M.vagoes; k++) {
        const s = sCab - (ida ? 1 : -1) * (k * (M.comp + 0.6) + M.comp / 2);
        amostra(t, s, p, r);
        if (!ida) r.negate();
        // olha para onde o vagão anda (com a inclinação) e fica em pé
        m.lookAt(new THREE.Vector3(0, 0, 0), r, up);
        q.setFromRotationMatrix(m);
        m.compose(p.clone().add(new THREE.Vector3(0, 0.25, 0)), q, new THREE.Vector3(1, 1, 1));
        const n = cont[tr.tipo]++;
        if (n < cap[tr.tipo]) { im.setMatrixAt(n, m); im.setColorAt(n, c); }
      }
    }
    for (const tp of TIPOS) {
      const im = refs.vagoes.current[tp];
      if (!im) continue;
      im.count = Math.min(cont[tp], cap[tp]);
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.computeBoundingSphere();
    }

    // nomes das estações perto da câmera (3×/s)
    R.etq += dtReal;
    if (R.etq > 0.4 && grupoEtq.current) {
      R.etq = 0;
      const a = alvoCamera();
      const cand = estacoes.pontos.map((e, i) => ({ e, i, d: Math.hypot(e.x - a.x, e.z - a.z) })).filter((x) => x.d < 1100).sort((x, y) => x.d - y.d).slice(0, 16);
      const manter = new Set(cand.map((x) => x.i));
      for (const [i, sp] of pool.current) if (!manter.has(i)) { grupoEtq.current.remove(sp); (sp.material as THREE.SpriteMaterial).map?.dispose(); sp.material.dispose(); pool.current.delete(i); }
      for (const { e, i } of cand) {
        if (pool.current.has(i)) continue;
        const { tex, w, h } = etiqueta(e.nome, 2);
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, sizeAttenuation: false, fog: false }));
        sp.scale.set((0.022 * w) / h, 0.022, 1);
        sp.position.set(e.x, e.y + 16, e.z);
        sp.renderOrder = 21;
        grupoEtq.current.add(sp);
        pool.current.set(i, sp);
      }
    }
  });
  useEffect(() => () => { for (const sp of pool.current.values()) { (sp.material as THREE.SpriteMaterial).map?.dispose(); sp.material.dispose(); } pool.current.clear(); }, []);

  if (!dados) return null;
  return (
    <group>
      <mesh geometry={via.lastro} material={mats.lastro} receiveShadow />
      <mesh geometry={via.trilhos} material={mats.trilho} />
      <instancedMesh ref={refs.pil} args={[geos.pilar, mats.pilar, Math.max(1, via.pilares.length)]} castShadow receiveShadow frustumCulled={false} />
      <instancedMesh ref={refs.plat} args={[geos.caixa, mats.plataforma, Math.max(1, estacoes.plat.length)]} castShadow receiveShadow frustumCulled={false} />
      <instancedMesh ref={refs.teto} args={[geos.caixa, mats.telhado, Math.max(1, estacoes.teto.length)]} castShadow frustumCulled={false} />
      <instancedMesh ref={refs.cab} args={[geos.caixa, mats.cabine, Math.max(1, estacoes.cab.length)]} castShadow frustumCulled={false} />
      {TIPOS.map((t) => (
        <instancedMesh key={`${t}${cap[t]}`} ref={(im) => { refs.vagoes.current[t] = im; }} args={[geos.vagao[t], mats.vagao, cap[t]]} castShadow frustumCulled={false} />
      ))}
      <group ref={grupoEtq} />
    </group>
  );
}
