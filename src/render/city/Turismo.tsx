/**
 * Pontos turísticos 3D (Fase 31), nas coordenadas do OpenStreetMap: Cristo Redentor em escala real (cresce com a distância para ser
 * visto do alto), roda-gigante Rio Star com a roda girando e as cabines ocupadas, bonde de Santa Teresa nos Arcos da Lapa, Igreja da
 * Candelária, Theatro Municipal, Biblioteca Nacional, Escadaria Selarón (azulejos sobre as escadas do OSM), arquibancadas do Sambódromo
 * ao longo da Rua Marquês de Sapucaí e o balizamento vermelho dos arranha-céus do Centro. Os modelos baixados (roda-gigante, bonde)
 * estão em assets/models e creditados em assets/CREDITS.md; o resto é modelado em `monumentos.ts` com proporções reais.
 */
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { CAMPOS_PREDIO, predio } from '../../data/cidadeReal';
import { mundo } from '../../sim/bridge';
import { sampleHeight, type Heightmap } from '../../world/terrain';
import { ocupacaoAgora, pontoPorId, TURISMO } from '../../world/turismo';
import { arquivoModelo } from '../modelos/carregar';
import { ambiente } from './ambiente';
import { biblioteca, candelaria, cristo, extrusaoPerfil, texturaMosaico, theatro } from './monumentos';
import { indiceDasVias, type AmostraVia } from './perfilVias';
import { ancoraMarco, IBGE_RIO } from './pontosRio';
import { contextoTurismo, posicaoDoPonto } from './turismoEstado';
import { perfisAtuais } from './Vias';

const smooth = (e0: number, e1: number, x: number) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
const solo = (hm: Heightmap, x: number, z: number, raio = 0) => {
  let m = Infinity;
  for (const [dx, dz] of [[0, 0], [raio, 0], [-raio, 0], [0, raio], [0, -raio]]) m = Math.min(m, Math.max(0, sampleHeight(hm, x + dx, z + dz)));
  return m;
};
const liberar = (o: THREE.Object3D) => o.traverse((c) => { const m = c as THREE.Mesh; if (m.isMesh) { m.geometry.dispose(); const mm = m.material as THREE.Material | THREE.Material[]; (Array.isArray(mm) ? mm : [mm]).forEach((x) => { (x as THREE.MeshStandardMaterial).map?.dispose(); x.dispose(); }); } });

const carregador = new GLTFLoader();
carregador.setMeshoptDecoder(MeshoptDecoder);

// ── Cristo Redentor ───────────────────────────────────────────────────────────────

/** o Cristo tem 38 m (30 + 8); numa cidade de 12 km ele some, então cresce até 1,7× quando a câmera está longe (> 2,5 km) */
const ESCALA_LONGE = 1.7;

function CristoRedentor({ hm }: { hm: Heightmap }) {
  const real = mundo.real;
  const c = useMemo(() => {
    if (!real || real.ibge !== IBGE_RIO) return null;
    const p = pontoPorId('cristo')!, pos = posicaoDoPonto(p)!;
    const k = cristo();
    k.grupo.position.set(pos[0], solo(hm, pos[0], pos[1], 5) - 0.6, pos[1]);
    k.grupo.rotation.y = Math.PI / 2; // olha para leste, a baía
    return k;
  }, [real, hm]);
  useEffect(() => () => { if (c) liberar(c.grupo); }, [c]);
  useFrame(({ camera }) => {
    if (!c) return;
    const d = camera.position.distanceTo(c.grupo.position);
    c.grupo.scale.setScalar(1 + (ESCALA_LONGE - 1) * smooth(700, 2800, d));
    c.estatua.emissiveIntensity = ambiente.noite * 0.9;
  });
  return c ? <primitive object={c.grupo} /> : null;
}

// ── roda-gigante ──────────────────────────────────────────────────────────────────

interface Roda { raiz: THREE.Group; mixer: THREE.AnimationMixer; cabines: THREE.Object3D[]; passageiros: THREE.Mesh[]; luz: THREE.MeshStandardMaterial[] }

function RodaGigante({ hm }: { hm: Heightmap }) {
  const real = mundo.real;
  const [roda, setRoda] = useState<Roda | null>(null);
  useEffect(() => {
    const url = arquivoModelo('animado/roda-gigante.glb');
    if (!real || real.ibge !== IBGE_RIO || !url) return;
    const p = pontoPorId('roda-gigante')!, pos = posicaoDoPonto(p)!;
    let vivo = true, atual: Roda | null = null;
    carregador.loadAsync(url).then((gltf) => {
      if (!vivo) return;
      const raiz = new THREE.Group();
      const cena = gltf.scene;
      // escala: o modelo mede ~6,2 de altura (roda + base) e a roda real tem 88 m
      const caixa = new THREE.Box3().setFromObject(cena);
      const esc = (p.h ?? 88) / (caixa.max.y - caixa.min.y);
      cena.scale.setScalar(esc);
      cena.position.y = -caixa.min.y * esc;
      raiz.add(cena);
      raiz.position.set(pos[0], solo(hm, pos[0], pos[1], 10), pos[1]);
      raiz.rotation.y = -0.5;
      const cabines: THREE.Object3D[] = [], luz: THREE.MeshStandardMaterial[] = [];
      cena.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        m.castShadow = true; m.receiveShadow = true;
        if (/^Plane/i.test(o.name)) cabines.push(o);
        const mt = m.material as THREE.MeshStandardMaterial;
        if (mt && 'emissive' in mt) luz.push(mt);
      });
      const mixer = new THREE.AnimationMixer(cena);
      const dur = Math.max(...gltf.animations.map((a) => a.duration), 1);
      for (const a of gltf.animations) { const ac = mixer.clipAction(a); ac.play(); ac.timeScale = dur / 150; }
      // passageiros: duas cabeças e ombros escuros em cada cabine ocupada (coordenadas locais da cabine)
      const passageiros: THREE.Mesh[] = [];
      raiz.updateMatrixWorld(true);
      for (const cb of cabines) {
        const cx = new THREE.Box3().setFromObject(cb);
        const tam = cx.getSize(new THREE.Vector3()).length();
        const geo = new THREE.SphereGeometry(0.1, 6, 4);
        const g = mergePar(geo);
        const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: '#2b2118', roughness: 0.9 }));
        cb.add(m);
        const loc = cb.worldToLocal(cx.getCenter(new THREE.Vector3()));
        m.position.copy(loc); m.position.y -= tam * 0.05;
        m.scale.setScalar((tam / esc) * 0.8);
        m.visible = false; m.castShadow = false;
        passageiros.push(m);
      }
      atual = { raiz, mixer, cabines, passageiros, luz };
      setRoda(atual);
    }).catch((e) => console.error('[roda-gigante]', e));
    return () => { vivo = false; if (atual) { liberar(atual.raiz); } };
  }, [real, hm]);
  useFrame((_, dt) => {
    if (!roda) return;
    roda.mixer.update(Math.min(dt, 0.1));
    const p = pontoPorId('roda-gigante')!, ctx = contextoTurismo();
    const frac = Math.min(1, (ocupacaoAgora(p, ctx) / Math.max(0.01, p.ocupacaoPico)) * 0.8);
    const n = roda.passageiros.length;
    roda.passageiros.forEach((m, i) => { m.visible = ((i * 7919) % n) / n < frac; });
    for (const m of roda.luz) { m.emissive.set('#ffd9a0'); m.emissiveIntensity = ambiente.noite * 0.35; }
  });
  return roda ? <primitive object={roda.raiz} /> : null;
}
/** duas cabeças com ombros, para os passageiros */
function mergePar(cabeca: THREE.SphereGeometry): THREE.BufferGeometry {
  const a = cabeca.clone().translate(-0.14, 0.17, 0), b = cabeca.clone().translate(0.14, 0.17, 0);
  const ombroA = new THREE.CapsuleGeometry(0.09, 0.1, 2, 6).rotateZ(Math.PI / 2).translate(-0.14, 0.02, 0);
  const ombroB = new THREE.CapsuleGeometry(0.09, 0.1, 2, 6).rotateZ(Math.PI / 2).translate(0.14, 0.02, 0);
  const todos = [a, b, ombroA, ombroB].map((g) => { const x = g.toNonIndexed(); x.deleteAttribute('uv'); return x; });
  const r = new THREE.BufferGeometry();
  const pos: number[] = [], nor: number[] = [];
  for (const g of todos) { pos.push(...(g.getAttribute('position').array as Float32Array)); nor.push(...(g.getAttribute('normal').array as Float32Array)); }
  r.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); r.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return r;
}

// ── bonde de Santa Teresa nos Arcos da Lapa ───────────────────────────────────────

function BondeSantaTeresa({ hm }: { hm: Heightmap }) {
  const real = mundo.real;
  const [bondes, setBondes] = useState<{ raiz: THREE.Group; arco: { x: number; z: number; y: number; angle: number; comp: number }; bonde: THREE.Object3D[] } | null>(null);
  useEffect(() => {
    const url = arquivoModelo('turismo/bonde.glb');
    const arc = real ? ancoraMarco(real, 'Arcos da Lapa') : undefined;
    if (!real || !url || !arc) return;
    let vivo = true, atual: THREE.Group | null = null;
    const comp = Math.min(280, Math.max(200, arc.d));
    let baixo = Infinity;
    for (const t of [-1, -0.5, 0, 0.5, 1]) baixo = Math.min(baixo, Math.max(0, sampleHeight(hm, arc.x + Math.sin(arc.angle) * (comp / 2) * t, arc.z + Math.cos(arc.angle) * (comp / 2) * t)));
    carregador.loadAsync(url).then((gltf) => {
      if (!vivo) return;
      const raiz = new THREE.Group();
      const lista: THREE.Object3D[] = [];
      // o modelo de bonde (Cable Car, Bruno Oliveira) é vermelho; o de Santa Teresa é amarelo: troca só os vermelhos
      const base = gltf.scene;
      const caixa = new THREE.Box3().setFromObject(base);
      const tam = caixa.getSize(new THREE.Vector3());
      const esc = 8.6 / Math.max(tam.x, tam.z);
      for (let k = 0; k < 2; k++) {
        const g = new THREE.Group(), b = base.clone(true);
        b.scale.setScalar(esc);
        b.position.set(-((caixa.min.x + caixa.max.x) / 2) * esc, -caixa.min.y * esc, -((caixa.min.z + caixa.max.z) / 2) * esc);
        b.traverse((o) => {
          const m = o as THREE.Mesh;
          if (!m.isMesh) return;
          m.castShadow = true; m.receiveShadow = true;
          const mt = (m.material as THREE.MeshStandardMaterial).clone();
          if (mt.color.r > 0.55 && mt.color.g < 0.25) mt.color.set('#e6b422'); // vermelho → amarelo
          m.material = mt;
        });
        // o comprimento do modelo está em x: gira para ele andar ao longo do eixo z do aqueduto
        g.add(b);
        if (tam.x >= tam.z) b.rotation.y = Math.PI / 2;
        raiz.add(g); lista.push(g);
      }
      raiz.position.set(arc.x, baixo - 0.6 + 17.6 + 0.5, arc.z);
      raiz.rotation.y = arc.angle;
      atual = raiz;
      setBondes({ raiz, arco: { x: arc.x, z: arc.z, y: baixo, angle: arc.angle, comp }, bonde: lista });
    }).catch((e) => console.error('[bonde]', e));
    return () => { vivo = false; if (atual) liberar(atual); };
  }, [real, hm]);
  useFrame(() => {
    if (!bondes) return;
    const L = bondes.arco.comp - 20, v = 3.2, per = (2 * L) / v;
    // dois bondes em sentidos opostos, um por pista de ida e volta (o aqueduto tem um par de trilhos)
    bondes.bonde.forEach((g, k) => {
      const t = ((performance.now() / 1000 + k * per * 0.5) % per) / per;
      const ida = t < 0.5, u = ida ? t * 2 : 2 - t * 2;
      g.position.set(k ? 0.9 : -0.9, 0, (u - 0.5) * L);
      g.rotation.y = ida ? 0 : Math.PI;
    });
  });
  return bondes ? <primitive object={bondes.raiz} /> : null;
}

// ── prédios monumentais ───────────────────────────────────────────────────────────

/** Frente do prédio: a das quatro faces cujo ponto 25 m à frente fica mais perto de uma via (as fachadas dão para a rua). */
function frenteParaARua(x: number, z: number, angle: number, w: number, d: number): number {
  const vias = perfisAtuais.size ? indiceDasVias(perfisAtuais) : null;
  if (!vias) return 0;
  const am: AmostraVia = { x: 0, y: 0, z: 0, tx: 0, tz: 0, largura: 0, edge: 0 };
  let melhor = 0, dm = Infinity;
  // face k: normal local (0,0,1) girada por k·90°; distância do ponto da frente até a via
  for (let k = 0; k < 4; k++) {
    const a = k * (Math.PI / 2), lx = Math.sin(a), lz = Math.cos(a);
    const meia = Math.abs(lx) > 0.5 ? w / 2 : d / 2;
    const c = Math.cos(angle), s = Math.sin(angle);
    const fx = (lx * (meia + 25)), fz = (lz * (meia + 25));
    const px = x + fx * c + fz * s, pz = z - fx * s + fz * c;
    let dist = 90;
    for (const r of [10, 20, 40, 70, 90]) if (vias.perto(px, pz, r, am)) { dist = r; break; }
    if (dist < dm) { dm = dist; melhor = a; }
  }
  return melhor;
}

type Construtor = (w: number, d: number) => THREE.Group;
function PredioMonumental({ hm, id, nome, construir }: { hm: Heightmap; id: string; nome: string; construir: Construtor }) {
  const real = mundo.real;
  const g = useMemo(() => {
    if (!real || real.ibge !== IBGE_RIO) return null;
    const p = pontoPorId(id)!;
    const anc = ancoraMarco(real, nome);
    const pos = posicaoDoPonto(p)!;
    const x = anc?.x ?? pos[0], z = anc?.z ?? pos[1], angle = anc?.angle ?? 0;
    const w0 = anc?.w ?? p.w ?? 40, d0 = anc?.d ?? p.d ?? 40;
    const a = frenteParaARua(x, z, angle, w0, d0);
    // se a frente é uma face lateral, a largura da fachada é a outra dimensão
    const lateral = Math.abs(Math.sin(a)) > 0.5;
    const w = lateral ? d0 : w0, d = lateral ? w0 : d0;
    const G = construir(Math.min(w, 90), Math.min(d, 90));
    const raiz = new THREE.Group();
    G.rotation.y = a;
    raiz.add(G);
    raiz.position.set(x, solo(hm, x, z, Math.min(w0, d0) / 2) - 0.4, z);
    raiz.rotation.y = angle;
    return raiz;
  }, [real, hm, id, nome, construir]);
  useEffect(() => () => { if (g) liberar(g); }, [g]);
  return g ? <primitive object={g} /> : null;
}

// ── Escadaria Selarón ─────────────────────────────────────────────────────────────

function texturaAzulejos(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d')!;
  const cores = ['#1f9d3a', '#f4d21f', '#1f6fd0', '#d8352b', '#ffffff', '#f08a24', '#2bb3c0', '#7a3fa0'];
  for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) {
    x.fillStyle = cores[Math.floor(Math.random() * cores.length)]; x.fillRect(i * 8, j * 8, 8, 8);
    if (Math.random() < 0.35) { x.fillStyle = cores[Math.floor(Math.random() * cores.length)]; x.fillRect(i * 8 + 2, j * 8 + 2, 4, 4); }
    x.strokeStyle = 'rgba(255,255,255,0.65)'; x.strokeRect(i * 8 + 0.5, j * 8 + 0.5, 8, 8);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  return t;
}

/** Faixa de azulejos coloridos sobre o eixo da escadaria (trajeto do polígono do OSM w237171010, ~110 m × 5,8 m). */
function EscadariaSelaron({ hm }: { hm: Heightmap }) {
  const real = mundo.real;
  const g = useMemo(() => {
    if (!real || real.ibge !== IBGE_RIO) return null;
    const p = pontoPorId('selaron')!;
    if (!p.trajeto) return null;
    const pts = p.trajeto.map(([la, lo]) => posicaoDoPonto(p, la, lo)!);
    const tex = texturaAzulejos();
    tex.repeat.set(1, 1);
    const mt = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const linha: { x: number; y: number; z: number }[] = [];
    for (let i = 0; i + 1 < pts.length; i++) {
      const L = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]), k = Math.max(2, Math.round(L / 1.2));
      for (let q = 0; q <= k; q++) { const f = q / k, x = pts[i][0] + (pts[i + 1][0] - pts[i][0]) * f, z = pts[i][1] + (pts[i + 1][1] - pts[i][1]) * f; linha.push({ x, y: Math.max(0, sampleHeight(hm, x, z)) + 0.35, z }); }
    }
    const w = (p.larguraM ?? 5.8) / 2;
    const m = extrusaoPerfil(linha, [[-w, 0], [w, 0]], mt, 0.6);
    if (!m) return null;
    m.castShadow = false;
    const raiz = new THREE.Group();
    raiz.add(m);
    // corrimões nas duas bordas
    const corr = new THREE.MeshStandardMaterial({ color: '#3b3b3d', roughness: 0.5, metalness: 0.5, side: THREE.DoubleSide });
    for (const lado of [-1, 1]) { const c = extrusaoPerfil(linha.map((q) => ({ ...q, y: q.y + 0.9 })), [[lado * w, 0], [lado * w + 0.06, 0.05]], corr, 1); if (c) raiz.add(c); }
    return raiz;
  }, [real, hm]);
  useEffect(() => () => { if (g) liberar(g); }, [g]);
  return g ? <primitive object={g} /> : null;
}

// ── Sambódromo ────────────────────────────────────────────────────────────────────

/** Arquibancadas de concreto dos dois lados da Rua Marquês de Sapucaí (perfil escalonado de 12 m), com faixas de setores coloridas. */
function Sambodromo({ hm }: { hm: Heightmap }) {
  const real = mundo.real;
  const g = useMemo(() => {
    if (!real || real.ibge !== IBGE_RIO || !perfisAtuais.size) return null;
    const p = pontoPorId('sambodromo')!, pos = posicaoDoPonto(p)!;
    // a avenida: os trechos "Marquês de Sapucaí" a até 500 m do ponto, encadeados pela ordem de x ao longo do eixo dominante
    const pts: { x: number; z: number }[] = [];
    for (const pf of perfisAtuais.values()) {
      if (!/Marqu[êe]s de Sapuca[ií]/i.test(pf.edge.name)) continue;
      for (let i = 0; i < pf.n; i += 2) if (Math.hypot(pf.x[i] - pos[0], pf.z[i] - pos[1]) < 520) pts.push({ x: pf.x[i], z: pf.z[i] });
    }
    if (pts.length < 6) return null;
    // eixo principal e ordenação
    let sx = 0, sz = 0; for (const q of pts) { sx += q.x; sz += q.z; }
    sx /= pts.length; sz /= pts.length;
    let cxx = 0, cxz = 0, czz = 0; for (const q of pts) { cxx += (q.x - sx) ** 2; cxz += (q.x - sx) * (q.z - sz); czz += (q.z - sz) ** 2; }
    const ang = 0.5 * Math.atan2(2 * cxz, cxx - czz), ex = Math.cos(ang), ez = Math.sin(ang);
    pts.sort((a, b) => (a.x - sx) * ex + (a.z - sz) * ez - ((b.x - sx) * ex + (b.z - sz) * ez));
    // reamostra a cada ~6 m, suavizando
    const linha: { x: number; y: number; z: number }[] = [];
    let ult = pts[0]; linha.push({ x: ult.x, z: ult.z, y: Math.max(0, sampleHeight(hm, ult.x, ult.z)) });
    for (const q of pts) if (Math.hypot(q.x - ult.x, q.z - ult.z) > 6) { linha.push({ x: q.x, z: q.z, y: Math.max(0, sampleHeight(hm, q.x, q.z)) }); ult = q; }
    for (let k = 0; k < 3; k++) for (let i = 1; i + 1 < linha.length; i++) { linha[i].x = (linha[i - 1].x + linha[i].x * 2 + linha[i + 1].x) / 4; linha[i].z = (linha[i - 1].z + linha[i].z * 2 + linha[i + 1].z) / 4; }
    const concreto = new THREE.MeshStandardMaterial({ color: '#cfcac0', roughness: 0.92, side: THREE.DoubleSide });
    const cores = ['#d94a3a', '#2f78c8', '#e6b72e', '#3fa066', '#f0f0ec', '#8f4fb0'];
    const raiz = new THREE.Group();
    // degraus: perfil (lateral a partir do eixo, altura): sobe 12 m em 11 degraus de 1,1 m
    const lado = (s: number) => {
      const perf: [number, number][] = [[s * 9.5, 0]];
      for (let k = 0; k < 11; k++) { perf.push([s * (9.5 + k * 1.6), 1.1 * (k + 1)]); perf.push([s * (9.5 + (k + 1) * 1.6), 1.1 * (k + 1)]); }
      perf.push([s * (9.5 + 18), 0]);
      return perf;
    };
    for (const s of [-1, 1]) {
      const m = extrusaoPerfil(linha.map((q) => ({ x: q.x, y: q.y + 0.2, z: q.z })), lado(s), concreto, 0.05);
      if (m) raiz.add(m);
      // faixas de setor coloridas (13 setores por lado) sobre o último degrau
      const setores = 13, passo = Math.floor(linha.length / setores);
      for (let k = 0; k < setores; k++) {
        const trecho = linha.slice(k * passo, Math.min(linha.length, (k + 1) * passo + 1)).map((q) => ({ x: q.x, y: q.y + 0.2 + 12.3, z: q.z }));
        const f = extrusaoPerfil(trecho, [[s * 27.1, 0], [s * 28.7, 0]], new THREE.MeshStandardMaterial({ color: cores[(k + (s > 0 ? 3 : 0)) % cores.length], roughness: 0.7, side: THREE.DoubleSide }), 1);
        if (f) { f.castShadow = false; raiz.add(f); }
      }
    }
    return raiz;
  }, [real, hm]);
  useEffect(() => () => { if (g) liberar(g); }, [g]);
  return g ? <primitive object={g} /> : null;
}

// ── balizamento dos arranha-céus do Centro ────────────────────────────────────────

/** Luzes vermelhas piscantes no topo dos prédios mais altos (>= `alturaMinM`), como na aviação civil. A altura vem das andares do OSM. */
function Balizamento({ hm }: { hm: Heightmap }) {
  const real = mundo.real;
  const lista = useMemo(() => {
    if (!real || real.ibge !== IBGE_RIO || !TURISMO.arranhaCeus.luzBalizamento) return [];
    const r: { x: number; y: number; z: number }[] = [];
    const n = real.predios.length / CAMPOS_PREDIO;
    for (let i = 0; i < n; i++) {
      const b = predio(real, i), h = b.andares * 3.1;
      if (h < TURISMO.arranhaCeus.alturaMinM) continue;
      r.push({ x: b.x, y: Math.max(0, sampleHeight(hm, b.x, b.z)) + h + 1.2, z: b.z });
    }
    return r;
  }, [real, hm]);
  const ref = useRef<THREE.InstancedMesh>(null);
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ff2a1a', toneMapped: false }), []);
  const geo = useMemo(() => new THREE.SphereGeometry(1.1, 8, 6), []);
  useEffect(() => { const im = ref.current; if (!im) return; const m = new THREE.Matrix4(); lista.forEach((l, i) => im.setMatrixAt(i, m.makeTranslation(l.x, l.y, l.z))); im.count = lista.length; im.instanceMatrix.needsUpdate = true; }, [lista]);
  useFrame(() => { mat.color.set('#ff2a1a').multiplyScalar(((Math.sin(performance.now() / 480) + 1) / 2) * (0.25 + ambiente.noite * 2.2)); });
  useEffect(() => () => { geo.dispose(); mat.dispose(); }, [geo, mat]);
  return lista.length ? <instancedMesh ref={ref} args={[geo, mat, Math.max(1, lista.length)]} frustumCulled={false} /> : null;
}

export const NUMERO_ARRANHA_CEUS = (): number => {
  const real = mundo.real;
  if (!real) return 0;
  let k = 0;
  const n = real.predios.length / CAMPOS_PREDIO;
  for (let i = 0; i < n; i++) if (predio(real, i).andares * 3.1 >= TURISMO.arranhaCeus.alturaMinM) k++;
  return k;
};

export function Turismo({ hm }: { hm: Heightmap }) {
  void texturaMosaico;
  return (
    <>
      <CristoRedentor hm={hm} />
      <RodaGigante hm={hm} />
      <BondeSantaTeresa hm={hm} />
      <PredioMonumental hm={hm} id="candelaria" nome="Igreja de Nossa Senhora da Candelária" construir={candelaria} />
      <PredioMonumental hm={hm} id="theatro" nome="Theatro Municipal" construir={theatro} />
      <PredioMonumental hm={hm} id="biblioteca" nome="Biblioteca Nacional" construir={biblioteca} />
      <EscadariaSelaron hm={hm} />
      <Sambodromo hm={hm} />
      <Balizamento hm={hm} />
    </>
  );
}
