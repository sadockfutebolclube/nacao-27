/**
 * Cenas de ocorrência e despacho (Fase 26). As ocorrências que o Worker sorteia perto da câmera viram cena: efeitos no local
 * (tiroteio, incêndio, bloqueio, alarme, colisão, resgate, enchente), um rótulo e as VIATURAS do despacho — cada instituição
 * chamada manda o carro do seu tipo (PM e Civil: viatura; BOPE: blindado; Bombeiros: caminhão; SAMU: ambulância…), que sai da base
 * mais próxima pelas ruas, com SIRENE (barra vermelho/azul piscando) e FURANDO O TRÂNSITO (os carros comuns encostam e param). Na
 * hora em que a cena acaba, as viaturas voltam pelo mesmo caminho. Quem reage à cena (pedestres, carros, comércio) lê de
 * `ocorrenciaEstado`. No máximo 4 cenas ao mesmo tempo: as demais ocorrências valem só nos números do Worker.
 */
import { Html } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { mundo, useGame } from '../../sim/bridge';
import { DADOS } from '../../sim/faccoes/dados';
import type { Ocorrencia } from '../../sim/faccoes/tipos';
import { sampleHeight, type Heightmap } from '../../world/terrain';
import { alvoCamera } from './Camera';
import { novaCena, cenas, sirenes, type Cena } from './ocorrenciaEstado';
import { amostrarPerfil, indiceDasVias, type AmostraVia, type Perfil } from './perfilVias';
import { ESPECIAIS } from '../../sim/especiais/dados';
import { carregarModelo } from '../modelos/carregar';
import { Conjunto } from '../modelos/conjunto';
import { mergeGeos, perfisAtuais } from './Vias';

/** textura de chama (gota amarela no centro, laranja, borda transparente), gerada em canvas */
function texturaChama(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 190, 6, 64, 170, 112);
  grad.addColorStop(0, 'rgba(255,250,200,1)'); grad.addColorStop(0.25, 'rgba(255,200,60,0.95)'); grad.addColorStop(0.6, 'rgba(255,100,20,0.7)'); grad.addColorStop(1, 'rgba(120,20,0,0)');
  g.fillStyle = grad;
  g.beginPath();
  g.moveTo(64, 6); g.bezierCurveTo(100, 80, 126, 130, 112, 190); g.bezierCurveTo(104, 238, 24, 238, 16, 190); g.bezierCurveTo(2, 130, 28, 80, 64, 6); g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const MAX_CENAS = 4;
const RAIO_VISAO = 900;
const MAX_VEIC = 40;
/** modelos 3D reais que ganham a cor da instituição (os demais usam a pintura do modelo) */
const COM_COR = new Set(['police', 'suv', 'truck']);
const chaveConj = (modelo: string, tint?: string) => (tint ? `${modelo}|${tint}` : modelo);

interface Caminho { x: Float32Array; y: Float32Array; z: Float32Array; cum: Float32Array; comp: number }
interface Veic { cena: number; modelo: string; tint?: string; v: number; caminho: Caminho; d: number; estado: 'espera' | 'chega' | 'parado' | 'sai'; inicioS: number; paradaD: number; fase: number; esquerda: boolean; inst: string }

const COR_TIPO: Record<string, string> = { operacao: '#ff7a3c', confronto: '#ff3b3b', blitz: '#4aa3ff', roubo: '#ffd45e', incendio: '#ff8a1f', acidente: '#ffd45e', resgate: '#56d4a0', enchente: '#4aa3ff' };

/** ponto do caminho a `d` metros do começo (posição e rumo) */
function noCaminho(c: Caminho, d: number, out: { x: number; y: number; z: number; hx: number; hz: number }) {
  const dd = Math.min(c.comp, Math.max(0, d));
  let lo = 0, hi = c.cum.length - 1;
  while (lo < hi - 1) { const m = (lo + hi) >> 1; if (c.cum[m] <= dd) lo = m; else hi = m; }
  const seg = Math.max(1e-6, c.cum[hi] - c.cum[lo]), f = (dd - c.cum[lo]) / seg;
  out.x = c.x[lo] + (c.x[hi] - c.x[lo]) * f; out.y = c.y[lo] + (c.y[hi] - c.y[lo]) * f; out.z = c.z[lo] + (c.z[hi] - c.z[lo]) * f;
  const dx = c.x[hi] - c.x[lo], dz = c.z[hi] - c.z[lo], l = Math.hypot(dx, dz) || 1;
  out.hx = dx / l; out.hz = dz / l;
}

/** Caminho de chegada: da ponta mais distante (~`comp` m) até o ponto mais perto da cena, pelas ruas. */
function montarCaminho(x: number, z: number, comp: number, adj: Map<number, number[]>, rnd: () => number): Caminho | null {
  const am: AmostraVia = { x: 0, y: 0, z: 0, tx: 0, tz: 0, largura: 0, edge: 0 };
  if (!perfisAtuais.size || !indiceDasVias(perfisAtuais).perto(x, z, 140, am)) return null;
  let pf: Perfil | undefined = perfisAtuais.get(am.edge);
  if (!pf) return null;
  // posição s do ponto mais perto da cena nesse trecho
  let s0 = 0, bd = Infinity;
  for (let i = 0; i < pf.n; i++) { const d = (pf.x[i] - x) ** 2 + (pf.z[i] - z) ** 2; if (d < bd) { bd = d; s0 = pf.s[i]; } }
  // caminha "para fora" a partir da cena e depois inverte
  const px: number[] = [], py: number[] = [], pz: number[] = [];
  const p = { x: 0, y: 0, z: 0, tx: 0, tz: 0 };
  let dir: 1 | -1 = rnd() < 0.5 ? 1 : -1, s = s0, total = 0;
  const visitados = new Set<number>();
  for (let guarda = 0; guarda < 14 && total < comp && pf; guarda++) {
    visitados.add(pf.edge.id);
    const fim = dir === 1 ? pf.comprimento : 0;
    for (let q = s; dir === 1 ? q <= fim : q >= fim; q += dir * 4) {
      amostrarPerfil(pf, q, p);
      px.push(p.x); py.push(p.y + 0.05); pz.push(p.z);
      total += px.length > 1 ? Math.hypot(px[px.length - 1] - px[px.length - 2], pz[pz.length - 1] - pz[pz.length - 2]) : 0;
      if (total >= comp) break;
    }
    if (total >= comp) break;
    const no: number = dir === 1 ? pf.edge.b : pf.edge.a;
    const op: number[] = (adj.get(no) ?? []).filter((id) => !visitados.has(id) && perfisAtuais.has(id));
    if (!op.length) break;
    const prox: Perfil = perfisAtuais.get(op[Math.floor(rnd() * op.length)])!;
    dir = prox.edge.a === no ? 1 : -1;
    s = dir === 1 ? 0 : prox.comprimento;
    pf = prox;
  }
  if (px.length < 3) return null;
  // inverte: começa longe e termina na cena
  px.reverse(); py.reverse(); pz.reverse();
  const n = px.length, cum = new Float32Array(n);
  for (let i = 1; i < n; i++) cum[i] = cum[i - 1] + Math.hypot(px[i] - px[i - 1], pz[i] - pz[i - 1]);
  return { x: Float32Array.from(px), y: Float32Array.from(py), z: Float32Array.from(pz), cum, comp: cum[n - 1] };
}

export function Ocorrencias({ hm }: { hm: Heightmap }) {
  const wv = useGame((s) => s.worldVersion);
  const camera = useThree((st) => st.camera);
  const geos = useMemo(() => ({ sirene: new THREE.BoxGeometry(1.15, 0.24, 0.5), chama: mergeGeos([new THREE.PlaneGeometry(2.6, 4).translate(0, 2, 0), new THREE.PlaneGeometry(2.6, 4).rotateY(Math.PI / 2).translate(0, 2, 0), new THREE.PlaneGeometry(2.6, 4).rotateY(Math.PI / 4).translate(0, 2, 0)]), fumaca: new THREE.IcosahedronGeometry(1, 1), lampejo: new THREE.BoxGeometry(0.5, 0.5, 0.5), cone: new THREE.ConeGeometry(0.28, 0.7, 8).translate(0, 0.35, 0), disco: new THREE.CylinderGeometry(1, 1, 0.12, 40) }), []);
  const mats = useMemo(() => ({
    sirene: new THREE.MeshBasicMaterial({ toneMapped: false }),
    chama: new THREE.MeshBasicMaterial({ map: texturaChama(), toneMapped: false, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
    fumaca: new THREE.MeshBasicMaterial({ color: '#4a4a4e', transparent: true, opacity: 0.4, depthWrite: false }),
    lampejo: new THREE.MeshBasicMaterial({ color: '#ffe9a0', toneMapped: false }),
    cone: new THREE.MeshStandardMaterial({ color: '#ff7a1a', roughness: 0.6 }),
    disco: new THREE.MeshBasicMaterial({ color: '#4aa3ff', transparent: true, opacity: 0.35, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }),
  }), []);
  useEffect(() => () => { Object.values(geos).forEach((g) => g.dispose()); Object.values(mats).forEach((m) => m.dispose()); }, [geos, mats]);

  // viaturas: modelos 3D reais (GLB) por modelo/cor, criados sob demanda e guardados
  const [conjuntos, setConjuntos] = useState<Map<string, Conjunto>>(() => new Map());
  const pedidos = useRef(new Set<string>());
  const criados = useRef<Conjunto[]>([]);
  const pedir = (modelo: string, tint?: string) => {
    const k = chaveConj(modelo, tint);
    if (pedidos.current.has(k)) return;
    pedidos.current.add(k);
    const def = ESPECIAIS.modelos[modelo];
    if (!def) return;
    carregarModelo(modelo, { arquivo: def.arquivo, comprimentoM: def.comprimentoM, frenteGraus: def.frenteGraus }).then((m) => {
      const c = new Conjunto(m, { capacidade: MAX_VEIC, detalheM: def.detalheM, lod: def.lod, tint, sombra: true });
      criados.current.push(c);
      setConjuntos((antes) => new Map(antes).set(k, c));
    }).catch((e) => console.error('[ocorrências] modelo', modelo, e));
  };
  useEffect(() => () => { criados.current.forEach((c) => c.dispose()); criados.current = []; }, []);
  const refs = useRef<Record<string, THREE.InstancedMesh | null>>({});
  const adj = useMemo(() => {
    const m = new Map<number, number[]>();
    for (const e of mundo.roads.edges.values()) { (m.get(e.a) ?? m.set(e.a, []).get(e.a)!).push(e.id); (m.get(e.b) ?? m.set(e.b, []).get(e.b)!).push(e.id); }
    return m;
  }, [wv]);
  const E = useRef({ visto: -1, veic: [] as Veic[], relogio: 0, rng: 9091, inicio: true });
  const [rotulos, setRotulos] = useState<{ id: number; x: number; y: number; z: number; texto: string; cor: string }[]>([]);
  const tmp = useMemo(() => ({ m: new THREE.Matrix4(), q: new THREE.Quaternion(), v: new THREE.Vector3(), s: new THREE.Vector3(1, 1, 1), e: new THREE.Euler(), c: new THREE.Color(), eixo: new THREE.Vector3(0, 1, 0), p: { x: 0, y: 0, z: 0, hx: 0, hz: 1 } }), []);
  const rnd = () => { const e = E.current; e.rng = (e.rng * 1664525 + 1013904223) >>> 0; return e.rng / 4294967296; };

  useEffect(() => () => { cenas.length = 0; sirenes.length = 0; }, []);

  /** Cria a cena (e as viaturas) de uma ocorrência. */
  const iniciar = (oc: Ocorrencia) => {
    const e = E.current;
    const cena = novaCena(oc, rnd);
    cenas.push(cena);
    const veiculos = DADOS.instituicoes.veiculos;
    for (const r of oc.resposta) {
      const inst = DADOS.instituicoes.instituicoes[r.inst];
      const def = r.esp && inst.especializacao?.[r.esp] ? inst.especializacao[r.esp] : inst;
      const ve = veiculos[def.veiculo];
      if (!ve || typeof ve === 'string') continue;
      const modelo = ve.modelo;
      const tint = COM_COR.has(modelo) ? `#${new THREE.Color(def.cor).lerp(new THREE.Color('#ffffff'), 0.5).getHexString()}` : undefined;
      pedir(modelo, tint);
      const caminho = montarCaminho(oc.x, oc.z, 360 + rnd() * 160, adj, rnd);
      if (!caminho) continue;
      const v = Math.min(20, Math.max(13, def.velocidade));
      for (let k = 0; k < Math.min(2, r.viaturas); k++) {
        // a chegada na cena acontece perto de eta × 2 s (compressão do tempo) — quem demora mais, chega depois
        const chegada = Math.min(32, Math.max(3, r.etaMin * 2.2)) + k * 1.4;
        const inicioS = Math.max(0, chegada - caminho.comp / v);
        e.veic.push({ cena: oc.id, modelo, tint, v, caminho, d: 0, estado: 'espera', inicioS, paradaD: Math.max(8, caminho.comp - 11 - k * 6.5), fase: rnd() * 6, esquerda: k % 2 === 1, inst: r.inst });
      }
    }
    const nomeTipo = DADOS.ocorrencias.tipos[oc.tipo].nome;
    const eta = oc.resposta.length ? Math.min(...oc.resposta.map((r) => r.etaMin)) : 0;
    setRotulos((l) => [...l, { id: oc.id, x: oc.x, y: Math.max(0, sampleHeight(hm, oc.x, oc.z)) + 14 + l.length * 4.5, z: oc.z, texto: `${nomeTipo}${eta ? ` · 1ª viatura em ${eta.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} min` : ''}`, cor: COR_TIPO[oc.tipo] ?? '#fff' }]);
  };

  // dev: window.__n27cena('incendio') cria uma cena de teste onde a câmera olha (despacho de mentira, ETA 3–7 min)
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as unknown as { __n27cena: (tipo: string) => void }).__n27cena = (tipo: string) => {
      const al = alvoCamera(), t = DADOS.ocorrencias.tipos[tipo];
      if (!t) return;
      const resposta = [...t.despacho.primaria, ...(t.despacho.especial ? [t.despacho.especial] : []), ...t.despacho.apoio.slice(0, 2)].map((q, i) => {
        const inst = DADOS.instituicoes.instituicoes[q] ? q : 'pm';
        return { inst, esp: DADOS.instituicoes.instituicoes[q] ? undefined : q, base: 'Base de teste', baseX: al.x, baseZ: al.z, viaturas: 2, etaMin: 3 + i * 1.5, escolta: false };
      });
      const oc: Ocorrencia = { id: 900000 + Math.floor(Math.random() * 90000), tipo, x: al.x, z: al.z, unidade: -1, local: 'teste', dia: 0, hora: 12, gravidade: 0.6, faccoes: [], resposta, mortos: 0, feridos: 1, presos: 0, ordenada: true, manchete: '' };
      iniciar(oc);
    };
  });

  useFrame(({ clock }, dtReal) => {
    const e = E.current;
    const g = useGame.getState();
    const dt = Math.min(0.05, dtReal) * (g.velocidade > 0 ? 1 : 0);
    e.relogio += dt;
    const a = alvoCamera();
    // ocorrências novas perto da câmera viram cena (a primeira leitura só marca o que já existia)
    const novos = mundo.ocorrencias.filter((o) => o.id > e.visto);
    if (novos.length) {
      if (!e.inicio) {
        for (const oc of novos) {
          if (cenas.length >= MAX_CENAS) break;
          if (Math.hypot(oc.x - a.x, oc.z - a.z) > RAIO_VISAO && !oc.ordenada) continue;
          if (cenas.some((c) => Math.hypot(c.x - oc.x, c.z - oc.z) < 80)) continue;
          iniciar(oc);
        }
      }
      e.visto = Math.max(e.visto, mundo.ultimaOcorrencia);
    }
    if (mundo.ocorrencias.length) e.inicio = false;

    // avança as cenas; quando acabam, saem do estado compartilhado (a reação dos NPCs termina) e as viaturas vão embora
    for (let i = cenas.length - 1; i >= 0; i--) {
      cenas[i].t += dt;
      if (cenas[i].t > cenas[i].dur) { const id = cenas[i].id; cenas.splice(i, 1); setRotulos((l) => l.filter((r) => r.id !== id)); }
    }
    sirenes.length = 0;
    const ativos = new Set(cenas.map((c) => c.id));
    const cenaDe = (id: number): Cena | undefined => cenas.find((c) => c.id === id);

    const { m, q, v, s, e: eu, c, eixo, p } = tmp;
    for (const cj of conjuntos.values()) cj.inicio();
    const cam = camera.position;
    const cont: Record<string, number> = { sirene: 0, chama: 0, fumaca: 0, lampejo: 0, cone: 0, disco: 0 };
    const poe = (nome: string, pos: [number, number, number], esc: [number, number, number], yaw = 0, cor?: THREE.Color) => {
      const im = refs.current[nome];
      if (!im || cont[nome] >= (im.instanceMatrix.count)) return;
      q.setFromAxisAngle(eixo, yaw); m.compose(v.set(...pos), q, s.set(...esc));
      im.setMatrixAt(cont[nome], m);
      if (cor) im.setColorAt(cont[nome], cor);
      cont[nome]++;
    };
    const t = clock.elapsedTime;

    // viaturas
    for (let i = e.veic.length - 1; i >= 0; i--) {
      const ve = e.veic[i];
      const cena = cenaDe(ve.cena);
      const t0 = cena ? cena.t : 1e9;
      if (!ativos.has(ve.cena) && ve.estado !== 'sai') ve.estado = 'sai';
      if (ve.estado === 'espera') { if (cena && cena.t >= ve.inicioS) ve.estado = 'chega'; else if (!cena) { e.veic.splice(i, 1); continue; } else continue; }
      void t0;
      if (ve.estado === 'chega') { ve.d += ve.v * dt; if (ve.d >= ve.paradaD) { ve.d = ve.paradaD; ve.estado = 'parado'; } }
      else if (ve.estado === 'sai') { ve.d -= ve.v * dt; if (ve.d <= 0) { e.veic.splice(i, 1); continue; } }
      noCaminho(ve.caminho, ve.d, p);
      const yaw = Math.atan2(p.hx, p.hz) + (ve.estado === 'sai' ? Math.PI : 0);
      // mão direita; parado: de lado, como estacionado no local
      const lado = ve.estado === 'parado' ? (ve.esquerda ? -3.2 : 3) : 2.4;
      const x = p.x - p.hz * lado, z = p.z + p.hx * lado;
      const y = p.y;
      const cj = conjuntos.get(chaveConj(ve.modelo, ve.tint));
      if (cj) cj.poe(x, y, z, yaw, 0, 0, Math.hypot(x - cam.x, y - cam.y, z - cam.z));
      const alt = cj ? cj.modelo.tam.y : 1.9;
      const meia = cj ? cj.modelo.tam.x * 0.22 : 0.38;
      const fase = Math.sin((t * DADOS.ocorrencias.reacao.sirene.frequenciaHz + ve.fase) * Math.PI * 2) > 0;
      // barra de luz: vermelho/azul alternando (cada lado de um tom); a sirene só quando está em movimento ou no local de atendimento
      c.set(fase ? '#ff2a2a' : '#1a0000'); poe('sirene', [x - Math.cos(yaw) * meia, y + alt, z + Math.sin(yaw) * meia], [1, 1, 1], yaw, c);
      c.set(fase ? '#001a40' : '#2a7bff'); poe('sirene', [x + Math.cos(yaw) * meia, y + alt, z - Math.sin(yaw) * meia], [1, 1, 1], yaw, c);
      if (ve.estado !== 'parado') sirenes.push({ x, z, yaw });
    }

    // efeitos de cada cena
    for (const cena of cenas) {
      const y0 = Math.max(0, sampleHeight(hm, cena.x, cena.z));
      const vivo = Math.min(1, cena.t / 3) * Math.min(1, (cena.dur - cena.t) / 3);
      switch (cena.fx) {
        case 'tiros':
          for (let k = 0; k < 7; k++) {
            const ang = k * 2.4 + Math.floor(t * 2 + k) * 1.3, r = 6 + (k % 4) * 6;
            if (Math.sin(t * 31 + k * 7.7) > 0.55) poe('lampejo', [cena.x + Math.cos(ang) * r, y0 + 1.4 + (k % 3) * 0.6, cena.z + Math.sin(ang) * r], [0.8, 0.8, 0.8], t, c.set('#ffe9a0'));
          }
          for (let k = 0; k < 4; k++) poe('fumaca', [cena.x + Math.cos(k * 1.7) * 9, y0 + 2 + ((t * 0.9 + k) % 4) * 1.8, cena.z + Math.sin(k * 1.7) * 9], [1.4 + k * 0.1, 1.4, 1.4]);
          break;
        case 'fogo':
          for (let k = 0; k < 8; k++) {
            const f = 0.7 + 0.5 * Math.abs(Math.sin(t * 7 + k * 2.1));
            poe('chama', [cena.x + Math.cos(k * 0.9) * 5, y0 + 0.2, cena.z + Math.sin(k * 0.9) * 5], [f * vivo, (1.1 + 0.9 * Math.abs(Math.sin(t * 5 + k))) * vivo, f * vivo], t * 2 + k);
          }
          for (let k = 0; k < 14; k++) { const h = ((t * 1.6 + k * 0.7) % 9); poe('fumaca', [cena.x + Math.sin(k) * 4 + h * 0.5, y0 + 4 + h * 2.2, cena.z + Math.cos(k * 1.3) * 4], [1.5 + h * 0.35, 1.5 + h * 0.35, 1.5 + h * 0.35]); }
          break;
        case 'bloqueio':
          for (let k = 0; k < 5; k++) poe('cone', [cena.x - 8 + k * 4, y0, cena.z + 2 + Math.sin(k) * 0.8], [1, 1, 1], 0, c.set('#ff7a1a'));
          if (Math.sin(t * 6) > 0) poe('sirene', [cena.x, y0 + 1.2, cena.z], [3, 1.4, 1.5], 0, c.set('#ffb020'));
          break;
        case 'alarme': case 'colisao': case 'resgate':
          if (Math.sin(t * 7) > 0) poe('sirene', [cena.x, y0 + 2.4, cena.z], [3.2, 1.6, 2], 0, c.set(cena.fx === 'alarme' ? '#ff2a2a' : '#ffb020'));
          if (cena.fx === 'resgate') for (let k = 0; k < 6; k++) poe('cone', [cena.x + Math.cos(k * 1.05) * 7, y0, cena.z + Math.sin(k * 1.05) * 7], [1, 1, 1], 0, c.set('#ffe34d'));
          break;
        case 'agua':
          poe('disco', [cena.x, y0 + 0.25, cena.z], [cena.raio * 0.55 * vivo + 1, 1, cena.raio * 0.55 * vivo + 1]);
          if (Math.sin(t * 5) > 0) poe('sirene', [cena.x, y0 + 2.4, cena.z], [3, 1.6, 2], 0, c.set('#ffb020'));
          break;
      }
    }
    void eu;
    for (const cj of conjuntos.values()) cj.fim();
    for (const nome of Object.keys(cont)) {
      const im = refs.current[nome];
      if (!im) continue;
      im.count = cont[nome];
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
    }
  });

  const R = (nome: string) => (im: THREE.InstancedMesh | null) => { refs.current[nome] = im; };
  return (
    <group>
      {[...conjuntos.values()].map((cj, k) => <primitive key={k} object={cj.grupo} />)}
      <instancedMesh ref={R('sirene')} args={[geos.sirene, mats.sirene, MAX_VEIC * 3]} frustumCulled={false} />
      <instancedMesh ref={R('chama')} args={[geos.chama, mats.chama, 40]} frustumCulled={false} />
      <instancedMesh ref={R('fumaca')} args={[geos.fumaca, mats.fumaca, 80]} frustumCulled={false} renderOrder={4} />
      <instancedMesh ref={R('lampejo')} args={[geos.lampejo, mats.lampejo, 40]} frustumCulled={false} />
      <instancedMesh ref={R('cone')} args={[geos.cone, mats.cone, 60]} frustumCulled={false} />
      <instancedMesh ref={R('disco')} args={[geos.disco, mats.disco, 8]} frustumCulled={false} renderOrder={3} />
      {rotulos.map((r) => (
        <Html key={r.id} position={[r.x, r.y, r.z]} center distanceFactor={90} zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
          <div style={{ background: 'rgba(12,14,18,0.82)', color: '#fff', border: `1px solid ${r.cor}`, borderRadius: 6, padding: '2px 7px', font: '600 11px system-ui', whiteSpace: 'nowrap' }}>⚠ {r.texto}</div>
        </Html>
      ))}
    </group>
  );
}
