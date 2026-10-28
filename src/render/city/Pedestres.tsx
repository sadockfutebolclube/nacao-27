/**
 * Pedestres nas calçadas (LOD visual): pessoas low-poly instanciadas (~146 triângulos), só perto do ponto que a câmera
 * olha. Passada de pernas/braços e balanço do corpo no vertex shader (sem esqueleto); na chuva, parte do povo abre o
 * guarda-chuva; sentado = pernas à frente e corpo mais baixo.
 *
 * Fase 24 — quantos e quem: a densidade vem do modelo de dados `densidade.ts` (uso do solo, hora, dia da semana, POIs,
 * classe da região; parâmetros em `src/data/pedestres.json`), não mais da população total. Cada pedestre nasce com uma
 * persona e uma atividade da rotina dela (andando, esperando ônibus, sentado, comprando, trabalhando; dormir, ficar em casa
 * ou no trabalho = dentro de um prédio, invisível, só no modelo agregado). Só anda em calçada; atravessa a rua só pela
 * faixa do semáforo. Nasce e some pela proximidade da câmera.
 */
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { Rng } from '../../sim/core/rng';
import { mundo, useGame } from '../../sim/bridge';
import { calcadaVia, larguraVia } from '../../world/roads';
import { sampleWaterDist, type Heightmap } from '../../world/terrain';
import { acessibilidade } from '../acessibilidade';
import { ambiente } from './ambiente';
import { alvoCamera } from './Camera';
import { clima } from './climaVisual';
import { amostrarPerfil, type Perfil } from './perfilVias';
import { mergeGeos, perfisAtuais } from './Vias';
import { CLASSES, CONFIG, celulaDe, construirGrade, Densidade, diaDaSemana, fimDeSemana, somarVias, sortearPersonaAtividade, type Atividade, type Persona } from './densidade';
import { pedDebug, NOMES_ESTADO } from './estadoPedestres';
import { registro } from '../../entidades/registro';
import { selecao } from '../../entidades/selecao';

const MAX = 1500;
/** altura do topo da calçada sobre o perfil do leito (igual à malha das vias) */
export const ALTURA_CALCADA = 0.17;
/** acima desta distância câmera→alvo as pessoas viram poeira: nem simula */
const DIST_MAX = 950;

// ── funções puras (testadas) ────────────────────────────────────────────────

/** (curva antiga, só de referência dos testes: a densidade agora vem de densidade.ts) */
const HORARIO: [number, number][] = [[0, 0.06], [5, 0.08], [7, 0.85], [8, 1], [10, 0.7], [12.5, 0.9], [15, 0.7], [18, 1], [20, 0.45], [22, 0.18], [24, 0.06]];

/** Fração do povo na rua por hora (0–24) — curva única de antes da Fase 24, mantida para comparação. */
export function fatorHorario(hora: number): number {
  const h = ((hora % 24) + 24) % 24;
  for (let i = 1; i < HORARIO.length; i++) {
    const [h1, f1] = HORARIO[i];
    if (h <= h1) {
      const [h0, f0] = HORARIO[i - 1];
      return f0 + (f1 - f0) * ((h - h0) / (h1 - h0));
    }
  }
  return HORARIO[0][1];
}

/** Trecho caminhável da calçada (s em metros), sem a área do cruzamento; null se curto demais. */
export function trechoCaminhavel(pf: Perfil): [number, number] | null {
  if (pf.nivel === -1) return null; // túnel não tem calçada
  const ini = pf.cortaA + 0.5, fim = pf.comprimento - pf.cortaB - 0.5;
  return fim - ini > 1 ? [ini, fim] : null;
}

/**
 * Ponto na calçada: `lado` (±1) segue a normal do perfil (−tz, tx); `frac` (0–1) vai do meio-fio
 * à borda externa da calçada. Devolve também a tangente do trecho.
 */
export function pontoCalcada(pf: Perfil, s: number, lado: 1 | -1, frac: number, out: { x: number; y: number; z: number; tx: number; tz: number }) {
  amostrarPerfil(pf, s, out);
  const d = lado * (larguraVia(pf.edge) / 2 + calcadaVia(pf.edge) * frac);
  out.x += -out.tz * d;
  out.z += out.tx * d;
  out.y += ALTURA_CALCADA;
  return out;
}

// ── geometria ───────────────────────────────────────────────────────────────

/** partes animadas (aParte) */
const P = { fixo: 0, pernaE: 1, pernaD: 2, bracoE: 3, bracoD: 4, guardaChuva: 5 } as const;
/** fonte da cor (aCor) */
const C = { pele: 0, camisa: 1, calca: 2, cabelo: 3, sapato: 4, lona: 5, cabo: 6 } as const;

interface ParteP { g: THREE.BufferGeometry; parte: number; cor: number | ((x: number, y: number, z: number) => number) }

function geoPessoa(): THREE.BufferGeometry {
  const caixa = (w: number, h: number, d: number, x: number, y: number, z: number) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
  const partes: ParteP[] = [
    // cabeça facetada: faces de cima/de trás viram cabelo (cor por face, sem degradê)
    { g: new THREE.IcosahedronGeometry(0.115, 1).translate(0, 1.6, 0), parte: P.fixo, cor: C.pele },
    { g: new THREE.CylinderGeometry(0.16, 0.13, 0.52, 10).scale(1, 1, 0.62).translate(0, 1.2, 0), parte: P.fixo, cor: C.camisa },
    { g: caixa(0.3, 0.14, 0.19, 0, 0.93, 0), parte: P.fixo, cor: C.calca },
    { g: caixa(0.12, 0.84, 0.14, 0.08, 0.5, 0), parte: P.pernaE, cor: C.calca },
    { g: caixa(0.12, 0.84, 0.14, -0.08, 0.5, 0), parte: P.pernaD, cor: C.calca },
    { g: caixa(0.12, 0.08, 0.22, 0.08, 0.04, 0.04), parte: P.pernaE, cor: C.sapato },
    { g: caixa(0.12, 0.08, 0.22, -0.08, 0.04, 0.04), parte: P.pernaD, cor: C.sapato },
    // braços: manga em cima, pele embaixo (degradê pelo vértice)
    { g: caixa(0.085, 0.6, 0.1, -0.215, 1.13, 0), parte: P.bracoE, cor: (_x, y) => (y > 1.2 ? C.camisa : C.pele) },
    { g: caixa(0.085, 0.6, 0.1, 0.215, 1.13, 0), parte: P.bracoD, cor: (_x, y) => (y > 1.2 ? C.camisa : C.pele) },
    // guarda-chuva (some quando não chove): lona aberta acima da cabeça e cabo até a mão
    { g: new THREE.ConeGeometry(0.62, 0.28, 6, 1, true).translate(0.2, 2.05, 0.4), parte: P.guardaChuva, cor: C.lona },
    { g: caixa(0.025, 0.95, 0.025, 0.2, 1.55, 0.46), parte: P.guardaChuva, cor: C.cabo },
  ];
  // cabeça não indexada, cor decidida pelo centro de cada face
  const cabeca = partes[0].g.index ? partes[0].g.toNonIndexed() : partes[0].g;
  partes[0] = { ...partes[0], g: cabeca };
  const geo = mergeGeos(partes.map((p) => p.g));
  const n = geo.getAttribute('position').count;
  const aParte = new Float32Array(n), aCor = new Float32Array(n);
  let k = 0;
  for (const [ip, p] of partes.entries()) {
    const pos = p.g.getAttribute('position');
    for (let i = 0; i < pos.count; i++, k++) {
      aParte[k] = p.parte;
      if (ip === 0) {
        const f = i - (i % 3);
        const cy = (pos.getY(f) + pos.getY(f + 1) + pos.getY(f + 2)) / 3;
        const cz = (pos.getZ(f) + pos.getZ(f + 1) + pos.getZ(f + 2)) / 3;
        aCor[k] = cy > 1.63 || (cz < -0.04 && cy > 1.56) ? C.cabelo : C.pele;
      } else aCor[k] = typeof p.cor === 'number' ? p.cor : p.cor(pos.getX(i), pos.getY(i), pos.getZ(i));
    }
    p.g.dispose();
  }
  geo.setAttribute('aParte', new THREE.BufferAttribute(aParte, 1));
  geo.setAttribute('aCor', new THREE.BufferAttribute(aCor, 1));
  geo.setAttribute('iCalca', new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3));
  geo.setAttribute('iAnim', new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4));
  geo.computeBoundingSphere();
  return geo;
}

/** PBR (reage ao céu HDRI) com passada no vertex shader. iAnim = (fase, ritmo rad/s — 0 = parado —, tom de pele 0–1, guarda-chuva 0/1 + 2 se sentado). */
function materialPessoa(u: { uTempo: { value: number }; uAmp: { value: number } }) {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.82, metalness: 0 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTempo = u.uTempo;
    sh.uniforms.uAmp = u.uAmp;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float aParte;
        attribute float aCor;
        attribute vec3 iCalca;
        attribute vec4 iAnim;
        uniform float uTempo;
        uniform float uAmp;
        float sentado() { return step(1.5, iAnim.w); }
        float guardaChuva() { return iAnim.w - 2.0 * step(1.5, iAnim.w); }
        float angParte() {
          float sw = sin(iAnim.x + uTempo * iAnim.y) * uAmp * step(0.01, iAnim.y);
          if (aParte < 0.5 || aParte > 4.5) return 0.0;
          if (aParte < 2.5) return sentado() > 0.5 ? -1.45 : (aParte < 1.5 ? sw * 0.5 : -sw * 0.5);
          if (sentado() > 0.5) return -0.5;
          if (aParte < 3.5) return -sw * 0.45;
          return guardaChuva() > 0.5 ? -1.0 : sw * 0.45;
        }
        mat3 rotX(float a) { float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }`)
      .replace('#include <color_vertex>', `
        {
          vec3 pele = mix(vec3(0.85, 0.55, 0.38), vec3(0.12, 0.055, 0.03), iAnim.z);
          vec3 c = pele;
          #ifdef USE_INSTANCING_COLOR
            vec3 camisa = instanceColor.rgb;
          #else
            vec3 camisa = vec3(0.8);
          #endif
          if (aCor > 0.5 && aCor < 1.5) c = camisa;
          else if (aCor > 1.5 && aCor < 2.5) c = iCalca;
          else if (aCor > 2.5 && aCor < 3.5) c = mix(vec3(0.01, 0.008, 0.006), vec3(0.09, 0.045, 0.02), fract(iAnim.x * 0.37));
          else if (aCor > 3.5 && aCor < 4.5) c = vec3(0.02);
          else if (aCor > 4.5 && aCor < 5.5) c = fract(iAnim.x * 0.71) > 0.5 ? vec3(0.015) : camisa * 0.8;
          else if (aCor > 5.5) c = vec3(0.03);
          vColor = vec4(c, 1.0);
        }`)
      .replace('#include <beginnormal_vertex>', `
        vec3 objectNormal = rotX(angParte()) * vec3(normal);`)
      .replace('#include <begin_vertex>', `
        vec3 transformed = vec3(position);
        {
          float ang = angParte();
          float piv = aParte < 2.5 ? 0.92 : 1.42;
          transformed.y -= piv;
          transformed = rotX(ang) * transformed;
          transformed.y += piv;
          // sobe e desce duas vezes por ciclo de passada
          transformed.y += abs(cos(iAnim.x + uTempo * iAnim.y)) * 0.035 * uAmp * step(0.01, iAnim.y);
          if (aParte > 4.5 && guardaChuva() < 0.5) transformed = vec3(0.0);
          transformed.y -= 0.42 * sentado();
        }`);
  };
  m.customProgramCacheKey = () => 'pedestre-passada';
  return m;
}

// ── simulação visual ─────────────────────────────────────────────────────────

const CAMISAS = ['#e8e8e8', '#2b4c8c', '#c0392b', '#f2c418', '#2e8b57', '#1b1b1e', '#f08a24', '#7d3c98', '#87ceeb', '#ff6f91', '#f5f5dc', '#3a3a3a', '#009c3b', '#ffdf00', '#ffffff', '#5d6d7e'].map((c) => new THREE.Color(c));
const CALCAS = ['#1f2d4a', '#2a3b5c', '#1b1b1e', '#5a5f63', '#c2b280', '#f2f2ee', '#3d2b1f', '#2a3b5c', '#1f2d4a'].map((c) => new THREE.Color(c));

/** estados visíveis (dormindo, em casa e no trabalho/escola o pedestre está dentro de um prédio: não é desenhado, só conta no modelo agregado) */
export const E_ANDANDO = 0, E_ESPERANDO = 1, E_SENTADO = 2, E_COMPRANDO = 3, E_TRABALHANDO = 4;

interface Pedestre {
  ativo: boolean;
  edge: number; s: number; dir: 1 | -1; lado: 1 | -1; frac: number; v: number;
  /** 0 andando · 1 esperando ônibus · 2 sentado · 3 comprando · 4 trabalhando (parados: `dwell` s e `rumo` fixos) */
  estado: number; dwell: number; rumo: number;
  /** Fase 25: identidade para o clique (ID do registro, semente da ficha, persona e atividade da rotina) */
  id: number; semente: number; persona: Persona; atividade: Atividade;
  /** travessia em linha reta (esquina ou faixa do semáforo) até o próximo trecho */
  cruzando: boolean; t: number; dist: number;
  x0: number; y0: number; z0: number; x1: number; y1: number; z1: number;
  pe: number; ps: number; pdir: 1 | -1; plado: 1 | -1;
  // aparência
  fase: number; pele: number; escala: number; camisa: number; calca: number; limiarChuva: number;
}

const novoPedestre = (): Pedestre => ({
  ativo: false, edge: 0, s: 0, dir: 1, lado: 1, frac: 0.5, v: 1.3, estado: 0, dwell: 0, rumo: 0, id: 0, semente: 0, persona: 'trabalhador', atividade: 'desloca',
  cruzando: false, t: 0, dist: 0, x0: 0, y0: 0, z0: 0, x1: 0, y1: 0, z1: 0, pe: 0, ps: 0, pdir: 1, plado: 1,
  fase: 0, pele: 0, escala: 1, camisa: 0, calca: 0, limiarChuva: 1,
});

type Ponto = { x: number; y: number; z: number; tx: number; tz: number };
const ponto = (): Ponto => ({ x: 0, y: 0, z: 0, tx: 0, tz: 1 });

/** Paradas de ônibus e estações (arquivos de public/data/rio), para o reforço de densidade e para quem espera o ônibus. */
function usePOIs() {
  const [poi, setPoi] = useState<{ paradas: number[]; estacoes: { x: number; z: number }[] }>({ paradas: [], estacoes: [] });
  useEffect(() => {
    let vivo = true;
    const base = import.meta.env.BASE_URL;
    Promise.all([
      fetch(`${base}data/rio/onibus.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch(`${base}data/rio/trilhos.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]).then(([o, t]) => { if (vivo) setPoi({ paradas: (o?.paradas as number[]) ?? [], estacoes: ((t?.estacoes as { x: number; z: number }[]) ?? []).map(({ x, z }) => ({ x, z })) }); });
    return () => { vivo = false; };
  }, []);
  return poi;
}

export function Pedestres({ hm }: { hm: Heightmap }) {
  const wv = useGame((s) => s.worldVersion);
  const camera = useThree((s) => s.camera);
  const poi = usePOIs();

  const rec = useMemo(() => {
    const uniforms = { uTempo: { value: 0 }, uAmp: { value: 1 } };
    const geo = geoPessoa();
    const mat = materialPessoa(uniforms);
    const mesh = new THREE.InstancedMesh(geo, mat, MAX);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.receiveShadow = true;
    mesh.count = 0;
    return { uniforms, geo, mat, mesh };
  }, []);
  useEffect(() => () => { rec.geo.dispose(); rec.mat.dispose(); rec.mesh.dispose(); }, [rec]);

  const adj = useMemo(() => {
    const m = new Map<number, number[]>();
    for (const e of mundo.roads.edges.values()) {
      (m.get(e.a) ?? m.set(e.a, []).get(e.a)!).push(e.id);
      (m.get(e.b) ?? m.set(e.b, []).get(e.b)!).push(e.id);
    }
    return m;
  }, [wv]);

  // modelo de densidade: classes por célula (uso do solo, orla, centro, praças) a partir dos prédios reais; pedestres.json manda no resto
  const dens = useMemo(() => {
    if (!mundo.real) return null;
    const g = construirGrade({ real: mundo.real, distAgua: (x, z) => sampleWaterDist(hm, x, z), paradas: poi.paradas, estacoes: poi.estacoes });
    return new Densidade(g);
  }, [hm, poi]);
  useEffect(() => { if (dens) pedDebug.modelo(dens); }, [dens]);
  /** paradas por célula (para quem espera o ônibus) */
  const paradasCel = useMemo(() => {
    const m = new Map<number, number[]>();
    if (!dens) return m;
    for (let i = 0; i + 1 < poi.paradas.length; i += 3) {
      const k = celulaDe(dens.g, poi.paradas[i], poi.paradas[i + 1]);
      if (k >= 0) (m.get(k) ?? m.set(k, []).get(k)!).push(poi.paradas[i], poi.paradas[i + 1]);
    }
    return m;
  }, [dens, poi]);

  const E = useMemo(() => ({
    rng: new Rng(4242),
    lista: [] as Pedestre[],
    // trechos perto do alvo da câmera, sorteados pela densidade × comprimento caminhável
    cand: { ids: [] as number[], acum: [] as number[], total: 0 },
    relogio: 0, ultimaBusca: -1, perfis: null as Map<number, Perfil> | null, cx: 0, cz: 0, R: 0, ultimoAgregado: -1, viasDe: null as Map<number, Perfil> | null, viasDens: null as Densidade | null,
    a: ponto(), b1: ponto(), b2: ponto(), c3: ponto(),
  }), []);

  // fonte dos dados vivos para a ficha da pessoa clicada
  useEffect(() => registro.fonte('pessoa', (id) => {
    for (const p of E.lista) if (p.ativo && p.id === id) return { semente: p.semente, persona: p.persona, atividade: p.atividade, estado: NOMES_ESTADO[p.estado] };
    return null;
  }), [E]);

  useEffect(() => {
    // trechos mudaram: quem estava num trecho que sumiu renasce
    for (const p of E.lista) if (!mundo.roads.edges.has(p.edge) || (p.cruzando && !mundo.roads.edges.has(p.pe))) p.ativo = false;
  }, [wv, E]);

  useFrame((_, dtReal) => {
    const { mesh, uniforms } = rec;
    registro.iniciarQuadro('pessoa');
    const g = useGame.getState();
    const dt = Math.min(0.05, dtReal) * (g.velocidade > 0 ? 1 : 0);
    uniforms.uTempo.value += dt;
    uniforms.uAmp.value = acessibilidade.reduzirMovimento ? 0.35 : 1;
    E.relogio += dtReal;

    const selId = selecao.ler().id; // a pessoa selecionada não some enquanto o jogador a olha
    const alvoCam = alvoCamera();
    const dist = camera.position.distanceTo(alvoCam);
    if (!dens || dist > DIST_MAX || perfisAtuais.size === 0) { mesh.count = 0; return; }
    const dbg = pedDebug.ler();
    const st = g.stats;
    const dow = dbg.diaSemana ?? (st ? diaDaSemana(st.ano, st.mes, st.dia) : 6);
    const fds = fimDeSemana(dow);
    const hora = ambiente.hora;
    dens.preparar(hora, fds);
    const R = Math.min(380, Math.max(120, dist * 0.8));
    const cx = alvoCam.x, cz = alvoCam.z;
    const chuva = clima.chuva;
    const fatorGlobal = dbg.escala * (1 - CONFIG.comportamento.chuva * chuva);

    // comprimento de via por célula (modelo agregado): refeito quando a malha muda
    if (E.viasDe !== perfisAtuais || E.viasDens !== dens) {
      E.viasDe = perfisAtuais; E.viasDens = dens;
      somarVias(dens.g, (function* () { for (const pf of perfisAtuais.values()) { if (pf.nivel === -1) continue; const mid = pf.n >> 1; yield [pf.x[mid], pf.z[mid], pf.comprimento] as [number, number, number]; } })());
    }

    // trechos candidatos perto do alvo (2×/s ou quando a malha / o modelo muda): peso = densidade × comprimento caminhável
    if (E.relogio - E.ultimaBusca > 0.5 || E.perfis !== perfisAtuais) {
      E.ultimaBusca = E.relogio; E.perfis = perfisAtuais; E.cx = cx; E.cz = cz; E.R = R;
      const ids: number[] = [], acum: number[] = [];
      let tot = 0;
      for (const pf of perfisAtuais.values()) {
        const tr = trechoCaminhavel(pf);
        if (!tr) continue;
        const mid = pf.n >> 1;
        const dx = pf.x[mid] - cx, dz = pf.z[mid] - cz, lim = R + pf.comprimento / 2;
        if (dx * dx + dz * dz > lim * lim) continue;
        // pedestres por 100 m de via × metros de calçada caminhável / 100 = quantos cabem neste trecho agora
        const q = dens.em(pf.x[mid], pf.z[mid]) * (tr[1] - tr[0]) / 100;
        if (q <= 0.0005) continue;
        tot += q;
        ids.push(pf.edge.id); acum.push(tot);
      }
      E.cand = { ids, acum, total: tot };
    }

    // quantos desenhar: a soma da densidade dos trechos ao redor (nasce/some aos poucos)
    const rng = E.rng;
    const alvo = Math.min(MAX, Math.floor(E.cand.total * fatorGlobal + rng.next()));
    const lista = E.lista;
    for (let k = 0; k < 40 && lista.length < alvo; k++) lista.push(novoPedestre());
    if (lista.length > alvo) lista.length = Math.max(alvo, lista.length - 40);

    if (import.meta.env.DEV) (window as unknown as { __n27pedLista: unknown }).__n27pedLista = lista; // auditoria nos prints
    const { a, b1, b2, c3 } = E;
    const R2 = (R * 1.2) * (R * 1.2);
    const nc = CLASSES.length;
    const cmp = CONFIG.comportamento;

    /** Define o estado do recém-nascido a partir da persona/atividade sorteada para a célula. */
    const comportamento = (p: Pedestre, pf: Perfil, tr: [number, number], k: number, persona: Persona, atividade: Atividade) => {
      const w = dens.g.peso;
      const pCom = w[k * nc + CLASSES.indexOf('comercial')] + w[k * nc + CLASSES.indexOf('centro')] + w[k * nc + CLASSES.indexOf('servico')] + w[k * nc + CLASSES.indexOf('orla')] * 0.6;
      const pPraca = w[k * nc + CLASSES.indexOf('praca')];
      p.estado = E_ANDANDO; p.dwell = 0;
      const crianca = persona === 'estudante' && rng.chance(0.1);
      p.escala = crianca ? rng.range(0.62, 0.75) : rng.range(0.92, 1.08);
      p.v = (atividade === 'desloca' ? rng.range(1.15, 1.6) : rng.range(0.8, 1.25)) * (crianca ? 0.9 : 1);
      p.frac = rng.range(0.25, 0.8);
      const parar = (estado: number, frac: number, voltadoParaRua: boolean, seg: { min: number; max: number }) => {
        p.estado = estado; p.frac = frac; p.v = 0; p.dwell = rng.range(seg.min, seg.max);
        pontoCalcada(pf, p.s, p.lado, p.frac, a);
        // normal para fora da via (em direção aos prédios): lado × (−tz, tx)
        const nx = -a.tz * p.lado, nz = a.tx * p.lado;
        const sinal = voltadoParaRua ? -1 : 1;
        p.rumo = Math.atan2(nx * sinal, nz * sinal);
      };
      if (atividade === 'corre' || persona === 'esportista') { p.v = rng.range(2.6, 3.6); p.escala = rng.range(0.98, 1.06); return; }
      if (atividade === 'desloca' || atividade === 'estuda' || atividade === 'passeia') {
        // parada de ônibus por perto: parte de quem se desloca espera o ônibus ali
        const lis = paradasCel.get(k);
        if (lis && atividade === 'desloca' && rng.chance(CONFIG.pois.parada.espera)) {
          let melhor = -1, bd = 45;
          for (let i = 0; i < lis.length; i += 2) for (let q = 0; q <= 12; q++) for (const lado of [1, -1] as const) {
            const s = tr[0] + ((tr[1] - tr[0]) * q) / 12;
            pontoCalcada(pf, s, lado, 0.9, b1);
            const d = Math.hypot(b1.x - lis[i], b1.z - lis[i + 1]);
            if (d < bd) { bd = d; melhor = s; p.lado = lado; }
          }
          if (melhor >= 0) { p.s = melhor; parar(E_ESPERANDO, 0.88, true, cmp.espera); return; }
        }
        if (atividade === 'passeia' && pPraca > 0.25 && rng.chance(0.55)) { parar(E_SENTADO, 0.9, true, cmp.sentado); return; }
      }
      if (atividade === 'compra' && pCom > 0.25 && rng.chance(0.8)) { parar(E_COMPRANDO, 0.9, false, cmp.compra); return; }
      if (atividade === 'trabalha' && pCom > 0.2) { parar(E_TRABALHANDO, 0.86, true, cmp.trabalhando); return; }
    };

    const nascer = (p: Pedestre): boolean => {
      const cd = E.cand;
      if (cd.total <= 0) return false;
      for (let tentativa = 0; tentativa < 3; tentativa++) {
        const r = rng.next() * cd.total;
        let lo = 0, hi = cd.acum.length - 1;
        while (lo < hi) { const m = (lo + hi) >> 1; if (cd.acum[m] < r) lo = m + 1; else hi = m; }
        const pf = perfisAtuais.get(cd.ids[lo]);
        const tr = pf && trechoCaminhavel(pf);
        if (!pf || !tr) continue;
        p.edge = pf.edge.id;
        p.s = rng.range(tr[0], tr[1]);
        p.lado = rng.chance(0.5) ? 1 : -1;
        pontoCalcada(pf, p.s, p.lado, 0.5, a);
        if ((a.x - cx) ** 2 + (a.z - cz) ** 2 > R * R) continue;
        const k = celulaDe(dens.g, a.x, a.z);
        const { persona, atividade } = sortearPersonaAtividade(dens.g.peso.subarray(k * nc, k * nc + nc), hora, fds, rng.next(), rng.next());
        p.dir = rng.chance(0.5) ? 1 : -1;
        comportamento(p, pf, tr, k, persona, atividade);
        p.id = registro.novoId(); p.semente = Math.floor(rng.next() * 1_000_000_000) + 1; p.persona = persona; p.atividade = atividade;
        p.fase = rng.range(0, 100);
        p.pele = rng.next();
        p.camisa = p.v > 2.4 ? [3, 6, 9, 12, 13, 2, 8][rng.int(0, 6)] : rng.int(0, CAMISAS.length - 1);
        p.calca = rng.int(0, CALCAS.length - 1);
        p.limiarChuva = rng.next();
        p.cruzando = false;
        p.ativo = true;
        return true;
      }
      return false;
    };

    /** Começa a travessia reta de `a` até `b`, assumindo o trecho `edge` ao chegar. */
    const travessia = (p: Pedestre, b: Ponto, edge: number, s: number, dir: 1 | -1, lado: 1 | -1) => {
      p.x0 = a.x; p.y0 = a.y; p.z0 = a.z; p.x1 = b.x; p.y1 = b.y; p.z1 = b.z;
      p.dist = Math.hypot(b.x - a.x, b.z - a.z); p.t = 0;
      p.pe = edge; p.ps = s; p.pdir = dir; p.plado = lado;
      p.cruzando = p.dist > 0.05;
      if (!p.cruzando) { p.edge = edge; p.s = s; p.dir = dir; p.lado = lado; }
    };

    /** O trecho reto a→b passa por cima do asfalto de alguma via do nó (boca de rua sem faixa)? Confere 3 pontos contra o eixo de cada perna. */
    const sobreAsfalto = (no: number, ax: number, az: number, bx: number, bz: number): boolean => {
      for (const f of [0.25, 0.5, 0.75]) {
        const x = ax + (bx - ax) * f, z = az + (bz - az) * f;
        for (const id of adj.get(no) ?? []) {
          const pf = perfisAtuais.get(id);
          if (!pf) continue;
          const noA = pf.edge.a === no, meia = larguraVia(pf.edge) / 2 - 0.15;
          for (let m = 0; m <= 14 && m <= pf.comprimento; m += 2) {
            amostrarPerfil(pf, noA ? m : pf.comprimento - m, c3);
            if (Math.hypot(c3.x - x, c3.z - z) < meia) return true;
          }
        }
      }
      return false;
    };

    /**
     * Chegou à ponta da calçada: segue para outro trecho do nó pela esquina (calçada com calçada). Só atravessa a rua onde há
     * faixa — nó com semáforo, que desenha a zebra em cada perna; em nó sem semáforo fica do mesmo lado. Sem saída: meia-volta
     * pela mesma calçada (nunca atravessa o asfalto fora da faixa).
     */
    const fimDaCalcada = (p: Pedestre, pf: Perfil, tr: [number, number]) => {
      const naA = p.s < tr[0];
      p.s = naA ? tr[0] : tr[1];
      pontoCalcada(pf, p.s, p.lado, p.frac, a);
      const no = naA ? pf.edge.a : pf.edge.b;
      const op = (adj.get(no) ?? []).filter((id) => id !== p.edge && perfisAtuais.has(id));
      const prox = op.length ? op[rng.int(0, op.length - 1)] : -1;
      const np = prox >= 0 ? perfisAtuais.get(prox) : undefined;
      const tr2 = np && trechoCaminhavel(np);
      if (!np || !tr2) { p.dir = p.dir === 1 ? -1 : 1; return; }
      const comecaA = np.edge.a === no;
      const s2 = comecaA ? tr2[0] : tr2[1];
      const dir2: 1 | -1 = comecaA ? 1 : -1;
      pontoCalcada(np, s2, 1, p.frac, b1);
      pontoCalcada(np, s2, -1, p.frac, b2);
      let lado2: 1 | -1 = Math.hypot(b1.x - a.x, b1.z - a.z) <= Math.hypot(b2.x - a.x, b2.z - a.z) ? 1 : -1;
      if (mundo.roads.nodes.get(no)?.semaforo && rng.chance(0.25)) lado2 = lado2 === 1 ? -1 : 1; // atravessa na faixa do semáforo
      const b = lado2 === 1 ? b1 : b2;
      if (Math.hypot(b.x - a.x, b.z - a.z) > 60) { p.ativo = false; return; }
      // sem semáforo (sem zebra) o pedestre não pisa no asfalto da boca da rua: dá meia-volta pela mesma calçada
      if (!mundo.roads.nodes.get(no)?.semaforo && sobreAsfalto(no, a.x, a.z, b.x, b.z)) { p.dir = p.dir === 1 ? -1 : 1; return; }
      // a densidade manda: ao entrar numa zona mais vazia, parte do povo entra num prédio (não há gente demais em rua vazia)
      const dAntes = dens.em(a.x, a.z), dDepois = dens.em(b.x, b.z);
      if (p.id !== selId && dDepois < dAntes && rng.next() > dDepois / Math.max(1e-6, dAntes)) { p.ativo = false; return; }
      travessia(p, b, prox, s2, dir2, lado2);
    };

    const mat = mesh.instanceMatrix.array as Float32Array;
    const cor = mesh.instanceColor!.array as Float32Array;
    const calca = (mesh.geometry.getAttribute('iCalca') as THREE.InstancedBufferAttribute);
    const anim = (mesh.geometry.getAttribute('iAnim') as THREE.InstancedBufferAttribute);
    const ca = calca.array as Float32Array, an = anim.array as Float32Array;
    let n = 0;
    const porEstado = [0, 0, 0, 0, 0];

    for (let i = 0; i < lista.length; i++) {
      const p = lista[i];
      if (!p.ativo || (!p.cruzando && !perfisAtuais.has(p.edge))) {
        if (!nascer(p)) { p.ativo = false; continue; }
      }
      let x: number, y: number, z: number, rumo: number;
      if (p.estado !== E_ANDANDO) {
        // parado: espera o ônibus, sentado, comprando ou trabalhando; ao fim do tempo segue a vida ou entra num prédio
        p.dwell -= dt;
        const pf = perfisAtuais.get(p.edge);
        if (!pf) { p.ativo = false; continue; }
        if (p.dwell <= 0) {
          if (p.id !== selId && (p.estado === E_ESPERANDO || rng.chance(0.4))) { p.ativo = false; continue; }
          p.estado = E_ANDANDO; p.v = rng.range(0.9, 1.3); p.frac = rng.range(0.25, 0.8);
        } else {
          pontoCalcada(pf, p.s, p.lado, p.frac, a);
          x = a.x; y = a.y; z = a.z; rumo = p.rumo;
          if ((x - cx) ** 2 + (z - cz) ** 2 > R2) { p.ativo = false; continue; }
          const k = p.escala, c = Math.cos(rumo) * k, s = Math.sin(rumo) * k, o = n * 16;
          mat[o] = c; mat[o + 1] = 0; mat[o + 2] = -s; mat[o + 3] = 0;
          mat[o + 4] = 0; mat[o + 5] = k; mat[o + 6] = 0; mat[o + 7] = 0;
          mat[o + 8] = s; mat[o + 9] = 0; mat[o + 10] = c; mat[o + 11] = 0;
          mat[o + 12] = x; mat[o + 13] = y; mat[o + 14] = z; mat[o + 15] = 1;
          const cc = CAMISAS[p.camisa], cl = CALCAS[p.calca];
          cor[n * 3] = cc.r; cor[n * 3 + 1] = cc.g; cor[n * 3 + 2] = cc.b;
          ca[n * 3] = cl.r; ca[n * 3 + 1] = cl.g; ca[n * 3 + 2] = cl.b;
          an[n * 4] = p.fase; an[n * 4 + 1] = 0; an[n * 4 + 2] = p.pele;
          // w: 0/1 guarda-chuva · +2 sentado
          an[n * 4 + 3] = (p.limiarChuva < chuva * 1.3 - 0.05 ? 1 : 0) + (p.estado === E_SENTADO ? 2 : 0);
          porEstado[p.estado]++;
          registro.publicar('pessoa', p.id, 'pessoa', x, y, z, rumo, 0.6 * k, 1.8 * k, 0.5 * k);
          n++;
          continue;
        }
      }
      if (p.cruzando) {
        p.t += p.v * dt;
        if (p.t >= p.dist) {
          p.cruzando = false;
          p.edge = p.pe; p.s = p.ps; p.dir = p.pdir; p.lado = p.plado;
        }
      }
      if (p.cruzando) {
        const f = p.t / p.dist;
        x = p.x0 + (p.x1 - p.x0) * f; y = p.y0 + (p.y1 - p.y0) * f; z = p.z0 + (p.z1 - p.z0) * f;
        rumo = Math.atan2(p.x1 - p.x0, p.z1 - p.z0);
      } else {
        const pf = perfisAtuais.get(p.edge);
        const tr = pf && trechoCaminhavel(pf);
        if (!pf || !tr) { p.ativo = false; continue; }
        p.s += p.dir * p.v * dt;
        if (p.s < tr[0] || p.s > tr[1]) {
          fimDaCalcada(p, pf, tr);
          if (!p.ativo) continue;
        }
        if (p.cruzando) {
          x = p.x0; y = p.y0; z = p.z0;
          rumo = Math.atan2(p.x1 - p.x0, p.z1 - p.z0);
        } else {
          const pfa = perfisAtuais.get(p.edge)!;
          pontoCalcada(pfa, p.s, p.lado, p.frac, a);
          x = a.x; y = a.y; z = a.z;
          rumo = Math.atan2(a.tx * p.dir, a.tz * p.dir);
        }
      }
      // longe demais do alvo da câmera: renasce perto no próximo quadro (o modelo agregado segue contando)
      if ((x - cx) ** 2 + (z - cz) ** 2 > R2) { p.ativo = false; continue; }

      // matriz = translação · rotação em Y · escala uniforme (escrita direta, sem Matrix4)
      const k = p.escala, c = Math.cos(rumo) * k, s = Math.sin(rumo) * k, o = n * 16;
      mat[o] = c; mat[o + 1] = 0; mat[o + 2] = -s; mat[o + 3] = 0;
      mat[o + 4] = 0; mat[o + 5] = k; mat[o + 6] = 0; mat[o + 7] = 0;
      mat[o + 8] = s; mat[o + 9] = 0; mat[o + 10] = c; mat[o + 11] = 0;
      mat[o + 12] = x; mat[o + 13] = y; mat[o + 14] = z; mat[o + 15] = 1;
      const cc = CAMISAS[p.camisa], cl = CALCAS[p.calca];
      cor[n * 3] = cc.r; cor[n * 3 + 1] = cc.g; cor[n * 3 + 2] = cc.b;
      ca[n * 3] = cl.r; ca[n * 3 + 1] = cl.g; ca[n * 3 + 2] = cl.b;
      an[n * 4] = p.fase; an[n * 4 + 1] = (p.v * 4.2) / k; an[n * 4 + 2] = p.pele;
      an[n * 4 + 3] = p.limiarChuva < chuva * 1.3 - 0.05 ? 1 : 0;
      porEstado[E_ANDANDO]++;
      registro.publicar('pessoa', p.id, 'pessoa', x, y, z, rumo, 0.6 * k, 1.8 * k, 0.5 * k);
      n++;
    }

    mesh.count = n;
    for (const [attr, tam] of [[mesh.instanceMatrix, 16], [mesh.instanceColor!, 3], [calca, 3], [anim, 4]] as const) {
      attr.clearUpdateRanges();
      attr.addUpdateRange(0, Math.max(1, n) * tam);
      attr.needsUpdate = true;
    }

    // modelo agregado: a contagem de verdade da cidade inteira (a que o desenho amostra perto da câmera), 2×/s
    if (E.relogio - E.ultimoAgregado > 0.5) {
      E.ultimoAgregado = E.relogio;
      pedDebug.agregado({ total: dens.total() * fatorGlobal, hora, fimDeSemana: fds, desenhados: n, porEstado });
    }
  });

  return <primitive object={rec.mesh} />;
}
