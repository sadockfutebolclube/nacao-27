/**
 * Visitantes dos pontos turísticos (Fase 31). Cada ponto de `src/data/turismo/pontos.json` tem ZONAS de atividade (anel, caixa, linha,
 * caminho, gramado, fluxo) com N lugares ("slots") e uma atividade por zona: tirar foto, posar de braços abertos, sentar, olhar a vista,
 * correr, caminhar, trilha, bicicleta, patins, passear com cachorro, piquenique, fila, torcida a caminho do estádio, vendedor, comemorar.
 * Os lugares nascem uma vez por ponto (sementeados pelo id) quando a câmera chega a menos de RAIO_ATIVO; quem está andando segue
 * um caminho REAL do OpenStreetMap (calçadas, ciclovias, trilhas) de ida e volta. Quantos lugares aparecem vem da MESMA ocupação que o
 * painel mostra (`world/turismo.ts`): lotação, evento do dia (jogo, desfile), chuva. Tudo é um InstancedMesh só (personagem com
 * esqueleto em textura, Fase 30) mais um conjunto por adereço (bicicleta, cachorro, toalha, isopor). A orla (praias) usa o mesmo motor
 * através de `fontesVisitantes`.
 */
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { mundo } from '../../sim/bridge';
import { sampleForest, sampleHeight, sampleSlope, sampleWaterDist, type Heightmap } from '../../world/terrain';
import { eventoAgora, ocupacaoAgora, TURISMO, type Contexto, type PontoTuristico, type Zona } from '../../world/turismo';
import { carregarPessoaVAT, materialPessoaVAT, type PessoaVAT } from '../modelos/pessoaVAT';
import { carregarProp, type Prop } from '../modelos/props';
import { alvoCamera } from './Camera';
import { indiceDasVias, type AmostraVia } from './perfilVias';
import { ocupado } from './ocupacaoSolo';
import { ancoraMarco } from './pontosRio';
import { contextoTurismo, posicaoDoPonto, turismoDebug } from './turismoEstado';
import { perfisAtuais } from './Vias';

/** a menos desta distância (m) da câmera o ponto "acorda" */
const RAIO_ATIVO = 900;
const MAX_PESSOAS = 900;

export const CAMISAS = ['#e63946', '#f4a261', '#2a9d8f', '#118ab2', '#ffd166', '#ef476f', '#ffffff', '#06d6a0', '#9b5de5', '#f15bb5', '#264653', '#e9c46a', '#1d3557', '#8ecae6'].map((c) => new THREE.Color(c));
const TORCIDA = ['#d71920', '#1b1b1b', '#ffffff', '#d71920', '#e5e5e5', '#8b1a1a'].map((c) => new THREE.Color(c));
export const CALCAS = ['#1d2a3a', '#2b2b2b', '#3b4a5a', '#5a4632', '#8a8f98', '#1a3a5c', '#c9b79c', '#222233'].map((c) => new THREE.Color(c));

/** código do clipe (iAnim.y): negativo = especial do personagem (pessoaVAT.ts) */
const CLIPE = { parado: 0, sentar: 0, andar: 1, correr: 2, palmas: -1, pular: -2, pose: -3, foto: -4 } as const;
const ritmoAndando = (v: number) => Math.min(9.4, Math.max(2.2, 3.86 * v));
const ritmoCorrendo = (v: number) => Math.max(9.8, 3.33 * v);

/** Uma pessoa a desenhar neste quadro (a orla e os pontos usam o mesmo formato). */
export type Emitir = (x: number, y: number, z: number, yaw: number, esc: number, ritmo: number, fase: number, pele: number, sentado: boolean, camisa: number, calca: number, guardaChuva?: boolean) => boolean;
export type FonteVisitantes = (emitir: Emitir, ctx: Contexto, dt: number, cam: THREE.Vector3) => void;
/** outras camadas (Orla.tsx) registram aqui o que querem ver desenhado com o personagem animado */
export const fontesVisitantes = new Set<FonteVisitantes>();

// ── caminhos reais ────────────────────────────────────────────────────────────────

export interface Trilha { x: Float32Array; z: Float32Array; cum: Float32Array; len: number; tipo: number }
const cacheTrilhas = new WeakMap<object, Trilha[]>();

/** Lê `mundo.real.caminhos` ([tipo, largura×10, n, x, z, …]) em polilinhas com o comprimento acumulado. */
export function trilhasDoMundo(): Trilha[] {
  const real = mundo.real;
  const d = real?.caminhos;
  if (!real || !d) return [];
  let r = cacheTrilhas.get(real);
  if (r) return r;
  r = [];
  for (let o = 0; o < d.length;) {
    const tipo = d[o], n = d[o + 2];
    if (n >= 2) {
      const x = new Float32Array(n), z = new Float32Array(n), cum = new Float32Array(n);
      for (let i = 0; i < n; i++) { x[i] = d[o + 3 + i * 2]; z[i] = d[o + 4 + i * 2]; if (i) cum[i] = cum[i - 1] + Math.hypot(x[i] - x[i - 1], z[i] - z[i - 1]); }
      r.push({ x, z, cum, len: cum[n - 1], tipo });
    }
    o += 3 + n * 2;
  }
  cacheTrilhas.set(real, r);
  return r;
}

/** posição e rumo no trajeto de ida e volta (u em metros desde o início; o trajeto tem `len` de ida e `len` de volta) */
export function noTrilha(t: Trilha, s: number, out: { x: number; z: number; tx: number; tz: number }) {
  const L = t.len, per = 2 * L;
  let u = ((s % per) + per) % per, sentido = 1;
  if (u > L) { u = per - u; sentido = -1; }
  let lo = 0, hi = t.cum.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (t.cum[m] <= u) lo = m; else hi = m; }
  const seg = Math.max(1e-6, t.cum[hi] - t.cum[lo]), f = (u - t.cum[lo]) / seg;
  out.x = t.x[lo] + (t.x[hi] - t.x[lo]) * f; out.z = t.z[lo] + (t.z[hi] - t.z[lo]) * f;
  const dx = t.x[hi] - t.x[lo], dz = t.z[hi] - t.z[lo], l = Math.hypot(dx, dz) || 1;
  out.tx = (dx / l) * sentido; out.tz = (dz / l) * sentido;
}

// ── lugares ───────────────────────────────────────────────────────────────────────

interface Slot {
  x: number; z: number; y: number; yaw: number; zona: number; ativ: string;
  /** limiar de aparição 0–1: o lugar aparece quando a densidade do ponto passa dele */
  lim: number; fase: number; pele: number; camisa: number; calca: number; esc: number;
  clipe: 'parado' | 'sentar' | 'andar' | 'correr' | 'palmas' | 'pular' | 'pose' | 'foto';
  trilha: Trilha | null; s0: number; vel: number;
  /** fluxo: segmento absoluto (ax, az) → (bx, bz) */
  fluxo: boolean; ax: number; az: number; bx: number; bz: number;
  /** 0 nada · 1 bicicleta · 2 cachorro · 3 toalha · 4 isopor */
  extra: 0 | 1 | 2 | 3 | 4;
}

function semente(s: string): () => number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return () => { h = (h + 0x6d2b79f5) >>> 0; let t = h; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const amostraVia: AmostraVia = { x: 0, y: 0, z: 0, tx: 0, tz: 0, largura: 0, edge: 0 };
const yawPara = (dx: number, dz: number) => Math.atan2(dx, dz);
const EXTRA_DE: Record<string, Slot['extra']> = { bicicleta: 1, cachorro: 2, toalha: 3, isopor: 4 };

function gerarSlots(p: PontoTuristico, hm: Heightmap): Slot[] {
  const pos = posicaoDoPonto(p);
  if (!pos || !mundo.real) return [];
  const rnd = semente(p.id);
  const trilhas = trilhasDoMundo();
  const anc = ancoraMarco(mundo.real, p.chave);
  const anguloAncora = anc?.angle ?? 0;
  const vias = perfisAtuais.size ? indiceDasVias(perfisAtuais) : null;
  const slots: Slot[] = [];
  const estadio = p.categoria === 'estadio';
  p.zonas.forEach((z: Zona, zi) => {
    const at = TURISMO.atividades[z.atividade];
    const refPos = z.ref ? posicaoDoPonto(p, z.ref[0], z.ref[1])! : pos;
    const cx0 = refPos[0], cz0 = refPos[1];
    const rot = z.rotAncora ? anguloAncora : 0;
    const co = Math.cos(rot), si = Math.sin(rot);
    const girar = (dx: number, dz: number): [number, number] => [cx0 + dx * co + dz * si, cz0 - dx * si + dz * co];
    const ordem = Array.from({ length: z.n }, (_, i) => (i + rnd()) / z.n).sort(() => rnd() - 0.5);
    const novo = (i: number, x: number, zz: number): Slot => ({
      x, z: zz, y: Math.max(0, sampleHeight(hm, x, zz)), yaw: rnd() * Math.PI * 2, zona: zi, ativ: z.atividade, lim: ordem[i], fase: rnd() * 8, pele: rnd(),
      camisa: estadio ? Math.floor(rnd() * TORCIDA.length) : Math.floor(rnd() * CAMISAS.length), calca: Math.floor(rnd() * CALCAS.length), esc: 0.94 + rnd() * 0.12,
      clipe: at.clipe === 'andar' ? 'andar' : at.clipe === 'correr' ? 'correr' : at.clipe === 'sentar' ? 'sentar' : at.clipe === 'pose' ? 'pose' : at.clipe === 'foto' ? 'foto' : at.clipe === 'pular' ? 'pular' : at.clipe === 'palmas' ? 'palmas' : 'parado',
      trilha: null, s0: 0, vel: 0, fluxo: false, ax: 0, az: 0, bx: 0, bz: 0, extra: at.extra ? EXTRA_DE[at.extra] ?? 0 : 0,
    });
    const olhar = (s: Slot) => {
      if (z.olhar === 'centro') s.yaw = yawPara(cx0 - s.x, cz0 - s.z);
      else if (z.olhar === 'fora') s.yaw = yawPara(s.x - cx0, s.z - cz0);
      else if (typeof z.olhar === 'number') s.yaw = yawPara(Math.cos((z.olhar * Math.PI) / 180), Math.sin((z.olhar * Math.PI) / 180));
    };
    if (z.forma === 'anel') {
      const [r0, r1] = z.r ?? [5, 15], [a0, a1] = z.arco ?? [0, 360];
      for (let i = 0; i < z.n; i++) {
        const r = Math.sqrt(r0 * r0 + rnd() * (r1 * r1 - r0 * r0)), a = ((a0 + (a1 - a0) * (i + rnd() * 0.8) / z.n) * Math.PI) / 180;
        const [x, zz] = girar(Math.cos(a) * r, Math.sin(a) * r);
        const s = novo(i, x, zz); olhar(s); slots.push(s);
      }
    } else if (z.forma === 'caixa') {
      const [w, d] = z.t ?? [10, 10], [dx0, dz0] = z.c ?? [0, 0];
      for (let i = 0; i < z.n; i++) {
        const [x, zz] = girar(dx0 + (rnd() - 0.5) * w, dz0 + (rnd() - 0.5) * d);
        const s = novo(i, x, zz); olhar(s); slots.push(s);
      }
    } else if (z.forma === 'linha') {
      const [ax, az] = z.a ?? [0, 0], [bx, bz] = z.b ?? [10, 0];
      for (let i = 0; i < z.n; i++) {
        const u = (i + 0.5) / z.n;
        const [x, zz] = girar(ax + (bx - ax) * u + (rnd() - 0.5) * 0.8, az + (bz - az) * u + (rnd() - 0.5) * 0.8);
        const s = novo(i, x, zz); olhar(s); slots.push(s);
      }
    } else if (z.forma === 'gramado') {
      const raio = z.raio ?? 150;
      let feitos = 0;
      for (let t = 0; t < z.n * 60 && feitos < z.n; t++) {
        const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * raio, x = cx0 + Math.cos(a) * r, zz = cz0 + Math.sin(a) * r;
        const y = sampleHeight(hm, x, zz);
        if (y < 1.8 || sampleSlope(hm, x, zz) > 0.1 || sampleWaterDist(hm, x, zz) < 25 || sampleForest(hm, x, zz) > 0.35) continue;
        if (vias?.perto(x, zz, 14, amostraVia) || ocupado(x, zz, 3)) continue;
        const s = novo(feitos, x, zz); slots.push(s); feitos++;
      }
    } else if (z.forma === 'caminho') {
      const raio = z.raio ?? 300, tipos = new Set(z.tipos ?? [1]);
      const cand: { t: Trilha; i: number }[] = [];
      for (const t of trilhas) {
        if (!tipos.has(t.tipo) || t.len < 25) continue;
        for (let i = 0; i < t.x.length; i += 2) if (Math.hypot(t.x[i] - cx0, t.z[i] - cz0) < raio) cand.push({ t, i });
      }
      if (!cand.length) return;
      for (let i = 0; i < z.n; i++) {
        const { t, i: v } = cand[Math.floor(rnd() * cand.length)];
        // trecho de até ~140 m para cada lado do vértice sorteado
        let a = v, b = v;
        while (a > 0 && t.cum[v] - t.cum[a] < 140) a--;
        while (b < t.x.length - 1 && t.cum[b] - t.cum[v] < 140) b++;
        if (b - a < 1) continue;
        const n = b - a + 1, x = new Float32Array(n), zz = new Float32Array(n), cum = new Float32Array(n);
        for (let k = 0; k < n; k++) { x[k] = t.x[a + k]; zz[k] = t.z[a + k]; if (k) cum[k] = cum[k - 1] + Math.hypot(x[k] - x[k - 1], zz[k] - zz[k - 1]); }
        const s = novo(i, x[0], zz[0]);
        s.trilha = { x, z: zz, cum, len: cum[n - 1], tipo: t.tipo };
        s.s0 = rnd() * 2 * cum[n - 1];
        const v0 = z.vel ?? at.vel ?? 1.2;
        s.vel = v0 * (0.85 + rnd() * 0.3) * (rnd() < 0.5 ? 1 : -1);
        slots.push(s);
      }
    } else if (z.forma === 'fluxo') {
      const de = z.de ? posicaoDoPonto(p, z.de[0], z.de[1])! : pos;
      const [px, pz] = z.para ?? [0, 0];
      for (let i = 0; i < z.n; i++) {
        const s = novo(i, de[0], de[1]);
        s.fluxo = true; s.ax = de[0] + (rnd() - 0.5) * 8; s.az = de[1] + (rnd() - 0.5) * 8; s.bx = cx0 + px + (rnd() - 0.5) * 10; s.bz = cz0 + pz + (rnd() - 0.5) * 10;
        s.s0 = rnd(); s.vel = (z.vel ?? at.vel ?? 1.3) * (0.85 + rnd() * 0.3);
        slots.push(s);
      }
    }
  });
  return slots;
}

// ── componente ────────────────────────────────────────────────────────────────────

const PROPS = ['bicicleta', 'cachorro'] as const;

export function Visitantes({ hm }: { hm: Heightmap }) {
  const { camera } = useThree();
  const [vat, setVat] = useState<PessoaVAT | null>(null);
  const [props, setProps] = useState<Record<string, Prop>>({});
  const uTempo = useMemo(() => ({ uTempo: { value: 0 } }), []);
  const slotsPorPonto = useRef(new Map<string, Slot[]>());
  const tmp = useMemo(() => ({ m: new THREE.Matrix4(), q: new THREE.Quaternion(), p: new THREE.Vector3(), s: new THREE.Vector3(), eixo: new THREE.Vector3(0, 1, 0), tr: { x: 0, z: 0, tx: 0, tz: 0 } }), []);

  useEffect(() => { let vivo = true; carregarPessoaVAT().then((v) => { if (vivo) setVat(v); }).catch((e) => console.error('[visitantes VAT]', e)); return () => { vivo = false; }; }, []);
  useEffect(() => {
    let vivo = true;
    Promise.all(PROPS.map((n) => carregarProp(n, 60))).then((ps) => { if (vivo) setProps({ bicicleta: ps[0], cachorro: ps[1] }); }).catch((e) => console.error('[visitantes props]', e));
    return () => { vivo = false; };
  }, []);

  const malha = useMemo(() => {
    if (!vat) return null;
    const geo = vat.geo.clone();
    geo.setAttribute('iCalca', new THREE.InstancedBufferAttribute(new Float32Array(MAX_PESSOAS * 3), 3));
    geo.setAttribute('iAnim', new THREE.InstancedBufferAttribute(new Float32Array(MAX_PESSOAS * 4), 4));
    const mat = materialPessoaVAT(vat, uTempo);
    const mesh = new THREE.InstancedMesh(geo, mat, MAX_PESSOAS);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_PESSOAS * 3), 3);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false; mesh.castShadow = true; mesh.receiveShadow = true; mesh.count = 0;
    return { geo, mat, mesh };
  }, [vat, uTempo]);
  useEffect(() => () => { malha?.geo.dispose(); malha?.mat.dispose(); malha?.mesh.dispose(); }, [malha]);

  // toalhas dos piqueniques (um tapete colorido por lugar)
  const toalhas = useMemo(() => {
    const geo = new THREE.BoxGeometry(1.5, 0.03, 1.1).translate(0, 0.015, 0);
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.95 });
    const mesh = new THREE.InstancedMesh(geo, mat, 120);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(120 * 3), 3);
    mesh.frustumCulled = false; mesh.receiveShadow = true; mesh.count = 0;
    return { geo, mat, mesh };
  }, []);
  const isopores = useMemo(() => {
    const geo = new THREE.BoxGeometry(0.6, 0.38, 0.4).translate(0, 0.85, 0.3);
    const mat = new THREE.MeshStandardMaterial({ color: '#f2f5f7', roughness: 0.7 });
    const mesh = new THREE.InstancedMesh(geo, mat, 80); mesh.frustumCulled = false; mesh.castShadow = true; mesh.count = 0;
    return { geo, mat, mesh };
  }, []);
  useEffect(() => () => { for (const o of [toalhas, isopores]) { o.geo.dispose(); o.mat.dispose(); o.mesh.dispose(); } }, [toalhas, isopores]);

  useFrame((_, dtReal) => {
    if (!malha || !mundo.real) return;
    const tIni = performance.now();
    const dt = Math.min(dtReal, 0.1);
    uTempo.uTempo.value += dt;
    const ctx = contextoTurismo();
    const cam = camera.position, alvo = alvoCamera();
    const { mesh } = malha;
    const mat = mesh.instanceMatrix.array as Float32Array, cor = mesh.instanceColor!.array as Float32Array;
    const ca = malha.geo.getAttribute('iCalca') as THREE.InstancedBufferAttribute, an = malha.geo.getAttribute('iAnim') as THREE.InstancedBufferAttribute;
    const caA = ca.array as Float32Array, anA = an.array as Float32Array;
    const { m, q, p, s, eixo, tr } = tmp;
    let n = 0, nTol = 0, nIso = 0;
    for (const o of Object.values(props)) o.inicio();
    const [bike, cao] = [props.bicicleta, props.cachorro];
    const tolMat = toalhas.mesh.instanceMatrix.array as Float32Array, tolCor = toalhas.mesh.instanceColor!.array as Float32Array;
    const isoMat = isopores.mesh.instanceMatrix.array as Float32Array;
    const t = uTempo.uTempo.value;

    const emitir: Emitir = (x, y, z, yaw, esc, ritmo, fase, pele, sentado, camisa, calca, guarda = false) => {
      if (n >= MAX_PESSOAS) return false;
      q.setFromAxisAngle(eixo, yaw);
      m.compose(p.set(x, y, z), q, s.set(esc, esc, esc));
      m.toArray(mat, n * 16);
      const c = CAMISAS[camisa % CAMISAS.length];
      cor[n * 3] = c.r; cor[n * 3 + 1] = c.g; cor[n * 3 + 2] = c.b;
      const k = CALCAS[calca % CALCAS.length];
      caA[n * 3] = k.r; caA[n * 3 + 1] = k.g; caA[n * 3 + 2] = k.b;
      anA[n * 4] = fase; anA[n * 4 + 1] = ritmo; anA[n * 4 + 2] = pele; anA[n * 4 + 3] = (guarda ? 1 : 0) + (sentado ? 2 : 0);
      n++;
      return true;
    };
    const emitirTorcida = (x: number, y: number, z: number, yaw: number, esc: number, ritmo: number, fase: number, pele: number, sentado: boolean, camisa: number, calca: number) => {
      // camisa de torcida: reaproveita as cores do estádio escrevendo direto
      if (!emitir(x, y, z, yaw, esc, ritmo, fase, pele, sentado, 0, calca)) return;
      const c = TORCIDA[camisa % TORCIDA.length];
      cor[(n - 1) * 3] = c.r; cor[(n - 1) * 3 + 1] = c.g; cor[(n - 1) * 3 + 2] = c.b;
    };

    // pontos perto da câmera, do mais perto para o mais longe (o limite de pessoas fica com os mais próximos)
    const ativos: { p: PontoTuristico; d: number }[] = [];
    for (const pt of TURISMO.pontos) {
      if (pt.foraDoMapa) continue;
      const pos = posicaoDoPonto(pt);
      if (!pos) continue;
      const d = Math.min(Math.hypot(cam.x - pos[0], cam.z - pos[1]), Math.hypot(alvo.x - pos[0], alvo.z - pos[1]) * 1.0);
      if (d < RAIO_ATIVO && pt.zonas.length) ativos.push({ p: pt, d });
    }
    ativos.sort((a, b) => a.d - b.d);
    turismoDebug.pontosAtivos = ativos.map((a) => a.p.id);

    for (const { p: pt } of ativos) {
      let slots = slotsPorPonto.current.get(pt.id);
      if (!slots) { slots = gerarSlots(pt, hm); slotsPorPonto.current.set(pt.id, slots); }
      const ev = eventoAgora(pt, ctx);
      const ocup = ocupacaoAgora(pt, ctx);
      const ref = pt.eventos ? Math.max(...pt.eventos.map((e) => e.ocupacao)) : Math.max(0.001, pt.ocupacaoPico);
      const dens = Math.min(1, ocup / ref);
      const estadio = pt.categoria === 'estadio';
      for (const sl of slots) {
        if (sl.lim > dens) continue;
        if (estadio) {
          const fase = ev?.fase ?? -1;
          if (sl.ativ === 'fila' && !(ev && fase < 0.42)) continue;
          if (sl.ativ === 'pular' && !(ev && (pt.id === 'sambodromo' || (fase > 0.4 && fase < 0.85)))) continue;
          if ((sl.ativ === 'torcida' || sl.ativ === 'vendedor') && !ev) continue;
        }
        let x = sl.x, z = sl.z, yaw = sl.yaw, ritmo = 0, sentado = sl.clipe === 'sentar';
        if (sl.trilha) {
          noTrilha(sl.trilha, sl.s0 + sl.vel * t, tr);
          x = tr.x; z = tr.z;
          const dir = Math.sign(sl.vel);
          yaw = yawPara(tr.tx * dir, tr.tz * dir);
          // noTrilha já inverte o rumo na volta; o sinal da velocidade vira o sentido da ida
          ritmo = sl.clipe === 'correr' ? ritmoCorrendo(Math.abs(sl.vel)) : sl.clipe === 'andar' ? ritmoAndando(Math.abs(sl.vel)) : 0;
        } else if (sl.fluxo) {
          // quem vai ao estádio anda do metrô até o portão; depois do jogo faz o caminho de volta
          const volta = ev ? ev.fase > 0.6 : false;
          const L = Math.hypot(sl.bx - sl.ax, sl.bz - sl.az) || 1;
          let u = (sl.s0 + (volta ? -1 : 1) * ((sl.vel * t) / L)) % 1;
          if (u < 0) u += 1;
          x = sl.ax + (sl.bx - sl.ax) * u; z = sl.az + (sl.bz - sl.az) * u;
          yaw = yawPara((sl.bx - sl.ax) * (volta ? -1 : 1), (sl.bz - sl.az) * (volta ? -1 : 1));
          ritmo = ritmoAndando(sl.vel);
        } else if (sl.clipe === 'andar' || sl.clipe === 'correr') {
          ritmo = sl.clipe === 'correr' ? 10 : 4;
        } else ritmo = CLIPE[sl.clipe] < 0 ? CLIPE[sl.clipe] : 0;
        const y = sl.trilha || sl.fluxo ? Math.max(0, sampleHeight(hm, x, z)) : sl.y;
        const noBike = sl.extra === 1 && bike;
        const yP = noBike ? y + 0.42 : y;
        if (sl.ativ === 'torcida' || sl.ativ === 'pular') emitirTorcida(x, yP, z, yaw, sl.esc, ritmo, sl.fase, sl.pele, sentado || !!noBike, sl.camisa, sl.calca);
        else if (!emitir(x, yP, z, yaw, sl.esc, ritmo, sl.fase, sl.pele, sentado || !!noBike, sl.camisa, sl.calca)) break;
        if (noBike) bike.poe(x, y, z, yaw, 1);
        else if (sl.extra === 2 && cao) cao.poe(x - Math.cos(yaw) * 0.9 + Math.sin(yaw) * 0.9, y, z + Math.sin(yaw) * 0.9 + Math.cos(yaw) * 0.9, yaw, 1, undefined, 0, Math.sin(t * 7 + sl.fase) * 0.04);
        else if (sl.extra === 3 && nTol < 120) {
          q.setFromAxisAngle(eixo, sl.yaw); m.compose(p.set(x, y, z), q, s.set(1, 1, 1)); m.toArray(tolMat, nTol * 16);
          const c = CAMISAS[(sl.camisa + 3) % CAMISAS.length]; tolCor[nTol * 3] = c.r; tolCor[nTol * 3 + 1] = c.g; tolCor[nTol * 3 + 2] = c.b; nTol++;
        } else if (sl.extra === 4 && nIso < 80) { q.setFromAxisAngle(eixo, yaw); m.compose(p.set(x, y, z), q, s.set(1, 1, 1)); m.toArray(isoMat, nIso * 16); nIso++; }
      }
    }
    for (const f of fontesVisitantes) f(emitir, ctx, dt, cam);

    mesh.count = n;
    for (const [attr, tam] of [[mesh.instanceMatrix, 16], [mesh.instanceColor!, 3], [ca, 3], [an, 4]] as const) { attr.clearUpdateRanges(); attr.addUpdateRange(0, Math.max(1, n) * tam); attr.needsUpdate = true; }
    for (const [im, k] of [[toalhas.mesh, nTol], [isopores.mesh, nIso]] as [THREE.InstancedMesh, number][]) { im.count = k; im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; }
    for (const o of Object.values(props)) o.fim();
    turismoDebug.visitantesDesenhados = n;
    turismoDebug.ms.visitantes += (performance.now() - tIni - turismoDebug.ms.visitantes) * 0.05;
  });

  return (
    <>
      {malha && <primitive object={malha.mesh} />}
      <primitive object={toalhas.mesh} />
      <primitive object={isopores.mesh} />
      {Object.values(props).map((o, i) => <primitive key={i} object={o.grupo} />)}
    </>
  );
}
