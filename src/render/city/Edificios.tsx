/**
 * Edificações instanciadas a partir do estado dos lotes: corpo com fachada procedural, telhado
 * colonial ou laje com caixa d'água azul, puxadinho de tijolo, muro chapiscado, toldo de loja,
 * chaminé, obra com andaime e grua. Também as camadas de informação (água, luz, esgoto, valor…).
 */
import { medir } from '../medir';
import { useFrame } from '@react-three/fiber';
import { alvoCamera } from './Camera';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { arquetipoPorId, Zone, ZONES } from '../../sim/catalog';
import { mundo, useGame, type Camada } from '../../sim/bridge';
import { FLAG, LOT_STATE_STRIDE } from '../../sim/protocol';
import { LOT_STRIDE, plintoDoLote } from '../../world/lots';
import { sampleHeight, type Heightmap } from '../../world/terrain';
import { criarMaterialFachada } from '../shaders/fachada';
import { ambiente } from './ambiente';
import { clima } from './climaVisual';
import { corRampa } from '../cores';
import { useApp } from '../../app/store';
import { GRUPOS, TERR_CELL, TERR_RES } from '../../sim/city/territorio';
import { BUILD_HALF } from '../../world/constants';
import { estiloRegional } from './estilos';
import { bairroCensoEm, densidadeBairro } from '../../data/bairros';
import { usePrediosReais } from './prediosReaisEstado';

const VIDRO = ['#7b93a8', '#5f7a8c', '#8aa1a8', '#a7b6bf', '#6d8a99'];
const GALPAO = ['#c8c4bc', '#a8b0b4', '#d0c9b8', '#9fa8a0', '#b9c2c9'];
const TIJOLO = '#b0603d', REBOCO = '#b4ada0';
const TOLDOS = ['#d93b2b', '#f2b134', '#2f8f4e', '#2f6fc0', '#e8742a', '#7b3fa0'];
/** conjuntos habitacionais: cores "de programa habitacional", blocos iguais */
/** camadas que não recolorem os prédios (têm desenho próprio) */
const CAMADAS_NEUTRAS: Camada[] = ['nenhuma', 'zonas', 'transito', 'transporte'];
const ZEIS_CORES = ['#e8c4b8', '#f0d9c4', '#d9b8c4', '#efe0b8'];

type Parte = 'corpo' | 'telhado' | 'caixa' | 'toldo' | 'muro' | 'chamine' | 'mastro' | 'lanca';

class Lote {
  m = new THREE.Matrix4(); q = new THREE.Quaternion(); p = new THREE.Vector3(); s = new THREE.Vector3(); c = new THREE.Color();
}

function geoTelhado(): THREE.BufferGeometry {
  // prisma de duas águas: cumeeira ao longo de X, base em y=0
  const v = [
    -0.5, 0, 0.5, 0.5, 0, 0.5, 0.5, 1, 0, -0.5, 0, 0.5, 0.5, 1, 0, -0.5, 1, 0, // água sul
    0.5, 0, -0.5, -0.5, 0, -0.5, -0.5, 1, 0, 0.5, 0, -0.5, -0.5, 1, 0, 0.5, 1, 0, // água norte
    -0.5, 0, -0.5, -0.5, 0, 0.5, -0.5, 1, 0, // oitão oeste
    0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 1, 0, // oitão leste
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.computeVertexNormals();
  return g;
}

interface Dados { mat: THREE.Matrix4[]; cor: THREE.Color[]; fac?: number[] }

/** Versão do estado com no máximo uma atualização a cada `ms` (cidades reais têm dezenas de milhares de prédios). */
export function useVersaoLenta(v: number, ms: number) {
  const [lenta, setLenta] = useState(v);
  const ultimo = useRef(0);
  useEffect(() => {
    const falta = ultimo.current + ms - performance.now();
    if (falta <= 0) { ultimo.current = performance.now(); setLenta(v); return; }
    const t = setTimeout(() => { ultimo.current = performance.now(); setLenta(v); }, falta);
    return () => clearTimeout(t);
  }, [v, ms]);
  return lenta;
}

export function Edificios({ hm }: { hm: Heightmap }) {
  const sv = useVersaoLenta(useGame((s) => s.stateVersion), 700);
  const wv = useGame((s) => s.worldVersion);
  const camada = useGame((s) => s.camada);
  const daltonico = useApp((s) => s.daltonico);
  const reaisProntos = usePrediosReais((s) => s.pronto);
  // Fase 13 (Rio com 130 mil lotes): só os lotes perto da câmera; remonta quando ela anda 400 m
  const [centro, setCentro] = useState<[number, number]>(() => { const a = alvoCamera(); return [a.x, a.z]; });
  const ultimaChecagem = useRef(0);
  useFrame(() => {
    const agora = performance.now();
    if (agora - ultimaChecagem.current < 500) return;
    ultimaChecagem.current = agora;
    const a = alvoCamera();
    if (Math.hypot(a.x - centro[0], a.z - centro[1]) > 400) setCentro([a.x, a.z]);
  });

  const uniforms = useMemo(() => ({ uNoite: { value: 0 }, uTempo: { value: 0 }, uCeu: { value: new THREE.Color() }, uCamada: { value: 0 } }), []);
  const mats = useMemo(() => ({
    corpo: criarMaterialFachada(uniforms),
    liso: new THREE.MeshStandardMaterial({ roughness: 0.85 }),
    caixa: new THREE.MeshStandardMaterial({ color: '#1f63b5', roughness: 0.5 }),
    amarelo: new THREE.MeshStandardMaterial({ color: '#f2b705', roughness: 0.6, metalness: 0.3 }),
  }), [uniforms]);
  const geos = useMemo(() => ({
    caixa: new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0),
    telhado: geoTelhado(),
    cil: new THREE.CylinderGeometry(0.5, 0.5, 1, 10).translate(0, 0.5, 0),
  }), []);
  useEffect(() => () => { Object.values(mats).forEach((m) => m.dispose()); Object.values(geos).forEach((g) => g.dispose()); }, [mats, geos]);

  const refs = {
    corpo: useRef<THREE.InstancedMesh>(null), telhado: useRef<THREE.InstancedMesh>(null), caixa: useRef<THREE.InstancedMesh>(null),
    toldo: useRef<THREE.InstancedMesh>(null), muro: useRef<THREE.InstancedMesh>(null), chamine: useRef<THREE.InstancedMesh>(null),
    mastro: useRef<THREE.InstancedMesh>(null), lanca: useRef<THREE.InstancedMesh>(null),
  } satisfies Record<Parte, React.RefObject<THREE.InstancedMesh | null>>;

  // sv/wv: o estado vive em `mundo` (mutável); as versões disparam a remontagem — mas só se algo visível
  // mudou (assinatura dos lotes do raio), senão reaproveita o que já está montado
  const anterior = useRef<{ chave: string; dados: Record<Parte, Dados> } | null>(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const dados = useMemo(() => medir('edifícios: montar', () => {
    const chave = `${assinatura(centro, reaisProntos)}|${wv}|${camada}|${daltonico}|${reaisProntos}|${centro.join(',')}`;
    if (anterior.current?.chave === chave && CAMADAS_NEUTRAS.includes(camada)) return anterior.current.dados;
    const d = montar(camada, daltonico, reaisProntos, centro);
    anterior.current = { chave, dados: d };
    return d;
  }), [sv, wv, camada, daltonico, reaisProntos, centro]);
  const capacidade = useMemo(() => {
    const cap: Record<Parte, number> = {} as Record<Parte, number>;
    for (const k of Object.keys(dados) as Parte[]) cap[k] = Math.max(64, 2 ** Math.ceil(Math.log2(dados[k].mat.length + 1)));
    return cap;
  }, [dados]);

  useLayoutEffect(() => {
    uniforms.uCamada.value = CAMADAS_NEUTRAS.includes(camada) ? 0 : 1;
    for (const k of Object.keys(dados) as Parte[]) {
      const im = refs[k].current;
      if (!im) continue;
      const d = dados[k];
      const n = Math.min(d.mat.length, im.instanceMatrix.count);
      for (let i = 0; i < n; i++) {
        im.setMatrixAt(i, d.mat[i]);
        im.setColorAt(i, d.cor[i]);
      }
      if (d.fac) {
        const attr = im.geometry.getAttribute('aFachada') as THREE.InstancedBufferAttribute | undefined;
        if (attr && attr.count >= n) {
          (attr.array as Float32Array).set(d.fac.slice(0, n * 4));
          attr.needsUpdate = true;
        }
      }
      im.count = n;
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.computeBoundingSphere();
    }
  });

  // geometria do corpo com atributo por instância (recriada quando a capacidade muda)
  const geoCorpo = useMemo(() => {
    const g = geos.caixa.clone();
    g.setAttribute('aFachada', new THREE.InstancedBufferAttribute(new Float32Array(capacidade.corpo * 4), 4));
    return g;
  }, [geos, capacidade.corpo]);
  useEffect(() => () => geoCorpo.dispose(), [geoCorpo]);

  useFrame((_, dt) => {
    uniforms.uNoite.value = ambiente.noite * (1 - clima.apagao);
    uniforms.uTempo.value += dt;
    uniforms.uCeu.value.copy(ambiente.corCeu);
  });

  const auxVisivel = CAMADAS_NEUTRAS.includes(camada);
  return (
    <group>
      <instancedMesh key={`c${capacidade.corpo}`} ref={refs.corpo} args={[geoCorpo, mats.corpo, capacidade.corpo]} castShadow receiveShadow frustumCulled={false} />
      <instancedMesh key={`t${capacidade.telhado}`} ref={refs.telhado} args={[geos.telhado, mats.liso, capacidade.telhado]} castShadow receiveShadow visible={auxVisivel} frustumCulled={false} />
      <instancedMesh key={`x${capacidade.caixa}`} ref={refs.caixa} args={[geos.cil, mats.caixa, capacidade.caixa]} castShadow visible={auxVisivel} frustumCulled={false} />
      <instancedMesh key={`o${capacidade.toldo}`} ref={refs.toldo} args={[geos.caixa, mats.liso, capacidade.toldo]} castShadow visible={auxVisivel} frustumCulled={false} />
      <instancedMesh key={`m${capacidade.muro}`} ref={refs.muro} args={[geos.caixa, mats.liso, capacidade.muro]} castShadow receiveShadow visible={auxVisivel} frustumCulled={false} />
      <instancedMesh key={`h${capacidade.chamine}`} ref={refs.chamine} args={[geos.cil, mats.liso, capacidade.chamine]} castShadow visible={auxVisivel} frustumCulled={false} />
      <instancedMesh key={`g${capacidade.mastro}`} ref={refs.mastro} args={[geos.caixa, mats.amarelo, capacidade.mastro]} castShadow visible={auxVisivel} frustumCulled={false} />
      <instancedMesh key={`l${capacidade.lanca}`} ref={refs.lanca} args={[geos.caixa, mats.amarelo, capacidade.lanca]} castShadow visible={auxVisivel} frustumCulled={false} />
      <LotesOverlay hm={hm} />
    </group>
  );
}

/** índice da célula territorial do lote correspondente ao estado em st[o…] */
let lotesRef: ArrayLike<number> = [];
function territorioIdx(_st: ArrayLike<number>, o: number): number {
  const i = o / LOT_STATE_STRIDE;
  const lo = i * LOT_STRIDE;
  if (lo + 1 >= lotesRef.length) return -1;
  const x = lotesRef[lo], z = lotesRef[lo + 1];
  const ci = Math.min(TERR_RES - 1, Math.max(0, Math.floor((x + BUILD_HALF) / TERR_CELL)));
  const cj = Math.min(TERR_RES - 1, Math.max(0, Math.floor((z + BUILD_HALF) / TERR_CELL)));
  return cj * TERR_RES + ci;
}

export function corCamada(camada: Camada, st: ArrayLike<number>, o: number, c: THREE.Color, alto: boolean): THREE.Color | null {
  const flags = st[o + 5];
  switch (camada) {
    case 'agua': return c.set(flags & FLAG.AGUA ? '#3fa9f5' : '#ff4d4d');
    case 'energia': return c.set(flags & FLAG.ENERGIA ? '#ffd23f' : '#ff4d4d');
    case 'esgoto': return c.set(flags & FLAG.ESGOTO ? '#4cc36a' : '#8a5a2b');
    // faixa útil do valor do solo (20–80) esticada para dar contraste
    case 'valor': return c.set(corRampa((st[o + 6] - 20) / 60, alto));
    case 'poluicao': return c.set(corRampa(1 - Math.min(1, st[o + 8] * 1.6), alto));
    case 'saude': return c.set(corRampa(st[o + 9], alto));
    case 'educacao': return c.set(corRampa(st[o + 10], alto));
    case 'seguranca': return c.set(corRampa(st[o + 11], alto));
    case 'crime': return c.set(corRampa(1 - st[o + 12], alto));
    case 'territorio': {
      const k = territorioIdx(st, o);
      if (k < 0) return c.set('#9aa3a8');
      const F = mundo.territorioF[k] ?? 0, M = mundo.territorioM[k] ?? 0, forca = Math.max(F, M);
      return forca < 0.3 ? c.set('#cfd8dc') : c.set(F >= M ? GRUPOS[1].cor : GRUPOS[2].cor).lerp(new THREE.Color('#f5b942'), forca < 0.6 ? 0.5 : 0);
    }
    case 'bairros': {
      // Fase 17: densidade demográfica do bairro (Censo 2022), de ~500 a ~40 mil hab./km² em escala logarítmica
      const i = o / LOT_STATE_STRIDE, lo = i * LOT_STRIDE;
      const b = lo + 1 < lotesRef.length ? bairroCensoEm(lotesRef[lo], lotesRef[lo + 1]) : null;
      if (!b) return c.set('#9aa3a8');
      return c.set(corRampa((Math.log10(Math.max(1, densidadeBairro(b))) - 2.7) / 2, alto));
    }
    case 'densidade': {
      const a = st[o + 1] ? arquetipoPorId(st[o + 1]) : null;
      return c.set(corRampa(a ? Math.min(1, Math.log10(1 + st[o + 7]) / Math.log10(250)) : 0, alto));
    }
    default: return null;
  }
}

/** raio (m) em volta da câmera em que os lotes gerados pelo jogo são desenhados */
const RAIO_EDIFICIOS = 2500;
const dentroDoRaio = (x: number, z: number, c: [number, number]) => Math.abs(x - c[0]) < RAIO_EDIFICIOS && Math.abs(z - c[1]) < RAIO_EDIFICIOS;

/** Assinatura do que é visível nos lotes do raio (arquétipo, obra, andares, abandono, aparência). */
function assinatura(centro: [number, number], reaisProntos: boolean): number {
  const L = mundo.lots, S = mundo.lotState;
  const n = Math.min(L.length / LOT_STRIDE, S.length / LOT_STATE_STRIDE);
  let h = 0;
  for (let i = 0; i < n; i++) {
    const lo = i * LOT_STRIDE, o = i * LOT_STATE_STRIDE;
    if (!S[o + 1] || (reaisProntos && L[lo + 7] > 0) || !dentroDoRaio(L[lo], L[lo + 1], centro)) continue;
    h = (Math.imul(h, 31) + S[o + 1] * 7 + Math.round(S[o + 2] * 8) * 131 + S[o + 3] * 977 + (S[o + 5] & FLAG.ABANDONADO) * 3 + i) | 0;
  }
  return h;
}

function montar(camada: Camada, alto: boolean, reaisProntos: boolean, centro: [number, number]): Record<Parte, Dados> {
  const out = Object.fromEntries((['corpo', 'telhado', 'caixa', 'toldo', 'muro', 'chamine', 'mastro', 'lanca'] as Parte[]).map((k) => [k, { mat: [], cor: [] } as Dados])) as Record<Parte, Dados>;
  out.corpo.fac = [];
  const L = mundo.lots, S = mundo.lotState;
  lotesRef = L;
  const n = Math.min(L.length / LOT_STRIDE, S.length / LOT_STATE_STRIDE);
  const t = new Lote();
  const eixoY = new THREE.Vector3(0, 1, 0);
    const cTmp = new THREE.Color();
  const camadaAtiva = !CAMADAS_NEUTRAS.includes(camada);
  const E = estiloRegional(mundo.init?.sigla);

  const push = (parte: Parte, lx: number, ly: number, lz: number, sx: number, sy: number, sz: number, ang: number, cx: number, cz: number, cor: THREE.Color | string, rotExtra = 0) => {
    const c = Math.cos(ang), s = Math.sin(ang);
    t.p.set(cx + c * lx + s * lz, ly, cz - s * lx + c * lz);
    t.q.setFromAxisAngle(eixoY, ang + rotExtra);
    t.m.compose(t.p, t.q, t.s.set(sx, sy, sz));
    out[parte].mat.push(t.m.clone());
    out[parte].cor.push(typeof cor === 'string' ? new THREE.Color(cor) : cor.clone());
  };

  for (let i = 0; i < n; i++) {
    const o = i * LOT_STATE_STRIDE;
    const archId = S[o + 1];
    if (!archId) continue;
    const lo = i * LOT_STRIDE;
    // Fase 12/13: prédios reais (corpo, telhado, casa de máquinas) são todos desenhados por PrediosReais
    if (reaisProntos && L[lo + 7] > 0) continue;
    if (!dentroDoRaio(L[lo], L[lo + 1], centro)) continue;
    const a = arquetipoPorId(archId);
    const x = L[lo], z = L[lo + 1], ang = L[lo + 2], w = L[lo + 3], d = L[lo + 4], baseY = L[lo + 5];
    const prog = S[o + 2], andares = Math.max(1, S[o + 3]), look = S[o + 4], flags = S[o + 5], lv = S[o + 6];
    const abandonado = (flags & FLAG.ABANDONADO) !== 0;
    // Fase 11: prédio real do OpenStreetMap ocupa o próprio contorno (retângulo orientado)
    const real = L[lo + 7] > 0;
    const W = real ? Math.max(3, w * 0.97) : Math.max(5, w * a.frente * (0.94 + 0.06 * look));
    const D = real ? Math.max(3, d * 0.97) : Math.max(5, Math.min(d - a.recuo - 0.5, d * a.fundo * (0.92 + 0.16 * ((look * 7.3) % 1))));
    const H = andares * a.peDireito + (a.estilo === 'galpao' ? 0 : 0.8);
    const frente = real ? d / 2 : d / 2 - a.recuo;
    const lz = real ? 0 : frente - D / 2;
    // Fase 33: base maciça até o ponto mais baixo do terreno sob a planta (a planta nunca é inclinada)
    const pl = mundo.hm ? plintoDoLote(mundo.hm, x, z, ang, w, d, baseY) : 0;
    const y0 = baseY - 0.6 - pl;
    const seed = (look * 1000) % 97;

    // cor base
    let cor: THREE.Color;
    if (a.estilo === 'casa') {
      if (lv < 32 && look < 0.45) cor = new THREE.Color(look < 0.22 ? TIJOLO : REBOCO);
      else {
        // paleta regional: parte das casas em cores vivas, o resto nos tons claros da região
        const pal = E.paredesCasa;
        const k = Math.floor(look * pal.length * 7.1) % pal.length;
        cor = new THREE.Color(((look * 17.3) % 1) < E.vivas ? pal[k] : pal[pal.length - 1 - (k % Math.min(4, pal.length))]);
      }
    } else if (a.zone === Zone.ZEIS) cor = new THREE.Color(ZEIS_CORES[Math.floor(look * 3.7 * ZEIS_CORES.length) % ZEIS_CORES.length]);
    else if (a.estilo === 'predio') cor = new THREE.Color(E.paredesPredio[Math.floor(look * E.paredesPredio.length * 5.3) % E.paredesPredio.length]);
    else if (a.estilo === 'vidro') cor = new THREE.Color(VIDRO[Math.floor(look * VIDRO.length * 3.7) % VIDRO.length]);
    else cor = new THREE.Color(GALPAO[Math.floor(look * GALPAO.length * 4.1) % GALPAO.length]);
    if (camadaAtiva) cor = corCamada(camada, S, o, cTmp, alto)!.clone();

    if (prog < 1) {
      const hObra = Math.max(1.2, H * Math.min(1, prog * 1.15));
      push('corpo', 0, y0, lz, W, hObra + 0.6 + pl, D, ang, x, z, camadaAtiva ? cor : '#9a958c');
      out.corpo.fac!.push(4, a.peDireito, seed, 0);
      if (andares >= 8 && look < 0.6 && !camadaAtiva) {
        // grua de torre
        const hm2 = H + 10;
        push('mastro', W / 2 + 2.5, y0, lz, 1.4, hm2, 1.4, ang, x, z, '#f2b705');
        push('lanca', W / 2 + 2.5, y0 + hm2 - 1, lz, 34, 1, 1, ang, x, z, '#f2b705', look * 6.28);
      }
      continue;
    }

    const loja = a.zone === Zone.Comercial && a.level <= 2 ? 1 : 0;
    push('corpo', 0, y0, lz, W, H + 0.6 + pl, D, ang, x, z, abandonado && !camadaAtiva ? cor.multiplyScalar(0.6) : cor);
    const estiloNum = a.estilo === 'casa' ? 0 : a.estilo === 'predio' ? 1 : a.estilo === 'vidro' ? 2 : 3;
    out.corpo.fac!.push(estiloNum, a.peDireito, seed, abandonado ? -1 : loja);
    const topo = y0 + H + 0.6 + pl;

    if (camadaAtiva) continue;

    // telhado / laje
    const telha = a.telhado === 'telha' || (a.estilo === 'casa' && a.telhado !== 'galpao' && ((look * 29.7) % 1) < E.telhaEmCasas);
    if (telha) {
      push('telhado', 0, topo, lz, W + 0.7, Math.max(1.4, W * 0.24 * E.inclinacao), D + 0.7, ang, x, z, E.telhas[Math.floor(look * 40) % E.telhas.length]);
    } else if (a.telhado === 'galpao') {
      push('telhado', 0, topo, lz, D + 0.6, Math.max(1.6, W * 0.12), W + 0.6, ang, x, z, look < 0.5 ? '#c3c7c9' : '#7f9bb3', Math.PI / 2);
    } else {
      // laje com caixa d'água azul (a Fortlev de todo telhado brasileiro)
      const cx = (look - 0.5) * (W - 3), cz = lz + (((look * 13) % 1) - 0.5) * (D - 3);
      const r = a.estilo === 'casa' ? 1.5 : 2.4;
      push('caixa', cx, topo, cz, r, a.estilo === 'casa' ? 1.2 : 1.8, r, ang, x, z, '#1f63b5');
      if (a.estilo !== 'casa') {
        push('corpo', -cx * 0.5, topo, lz - D * 0.15, Math.min(5, W * 0.4), 2.6, Math.min(5, D * 0.3), ang, x, z, cor.clone().multiplyScalar(0.85));
        out.corpo.fac!.push(5, 3, seed, 0);
      } else if (lv < 34 && look > 0.62 && a.level === 1) {
        // puxadinho de tijolo na laje
        push('corpo', W * 0.18, topo, lz - D * 0.12, W * 0.55, 2.7, D * 0.55, ang, x, z, TIJOLO);
        out.corpo.fac!.push(0, 2.7, seed + 3, 0);
      }
    }

    // muro chapiscado das casas
    if (a.zone === Zone.ResBaixa) {
      const corMuro = E.muros[Math.floor(look * 50) % E.muros.length];
      const yM = baseY - 0.4;
      const hM = 1.9;
      const fz = d / 2 - 0.3;
      push('muro', 0, yM, fz, w - 0.2, hM, 0.22, ang, x, z, corMuro);
      push('muro', -w / 2 + 0.15, yM, 0, 0.2, hM, d - 0.6, ang, x, z, corMuro);
      push('muro', w / 2 - 0.15, yM, 0, 0.2, hM, d - 0.6, ang, x, z, corMuro);
    }
    // toldo de loja
    if (loja && a.level === 1) {
      push('toldo', 0, y0 + pl + 3.3, frente + 0.8, W * 0.9, 0.18, 1.7, ang, x, z, TOLDOS[Math.floor(look * 60) % TOLDOS.length]);
    }
    // chaminé de fábrica
    if (a.zone === Zone.Industrial && a.level === 2) {
      push('chamine', W / 2 - 2.4, y0 + pl, lz - D / 2 + 2.4, 2.0, H + 16, 2.0, ang, x, z, '#8a5a44');
    }
  }
  return out;
}

/** Lotes como "tapete" que acompanha o terreno: zonas no zoneamento, métricas nas camadas. */
function LotesOverlay({ hm }: { hm: Heightmap }) {
  const wv = useGame((s) => s.worldVersion);
  const sv = useGame((s) => s.stateVersion);
  const ferramenta = useGame((s) => s.ferramenta);
  const camada = useGame((s) => s.camada);
  const visivel = ferramenta.tipo === 'zona' || !CAMADAS_NEUTRAS.includes(camada) || camada === 'zonas';
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.6, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }), []);
  useEffect(() => () => mat.dispose(), [mat]);

  // Fase 13: o relevo é de 16 m, então 2 × 3 vértices por lote bastam; e só monta quando aparece (130 mil lotes no Rio)
  const NX = 1, NZ = 2;
  const geo = useMemo(() => {
    if (!visivel) return null;
    const L = mundo.lots;
    const n = L.length / LOT_STRIDE;
    const vpl = (NX + 1) * (NZ + 1);
    const pos = new Float32Array(n * vpl * 3);
    const idx: number[] = [];
    for (let i = 0; i < n; i++) {
      const o = i * LOT_STRIDE;
      const x = L[o], z = L[o + 1], ang = L[o + 2], w = L[o + 3] - 1.2, d = L[o + 4] - 1.2;
      const c = Math.cos(ang), s = Math.sin(ang);
      for (let jz = 0; jz <= NZ; jz++) for (let ix = 0; ix <= NX; ix++) {
        const lx = (ix / NX - 0.5) * w, lz = (jz / NZ - 0.5) * d;
        const wx = x + c * lx + s * lz, wz = z - s * lx + c * lz;
        const k = (i * vpl + jz * (NX + 1) + ix) * 3;
        pos[k] = wx; pos[k + 1] = sampleHeight(hm, wx, wz) + 0.35; pos[k + 2] = wz;
      }
      const b = i * vpl;
      for (let jz = 0; jz < NZ; jz++) for (let ix = 0; ix < NX; ix++) {
        const a0 = b + jz * (NX + 1) + ix;
        idx.push(a0, a0 + NX + 1, a0 + 1, a0 + 1, a0 + NX + 1, a0 + NX + 2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * vpl * 3), 3));
    g.setIndex(idx);
    g.computeBoundingSphere();
    return g;
  }, [hm, wv, visivel]);
  useEffect(() => () => geo?.dispose(), [geo]);

  useLayoutEffect(() => {
    if (!visivel || !geo) return;
    const S = mundo.lotState;
    const col = geo.getAttribute('color') as THREE.BufferAttribute;
    const arr = col.array as Float32Array;
    const vpl = (NX + 1) * (NZ + 1);
    const n = Math.min(arr.length / (vpl * 3), S.length / LOT_STATE_STRIDE);
    const c = new THREE.Color();
    const zonaCores = ZONES.map((zz) => new THREE.Color(zz.cor));
    const vazio = new THREE.Color('#ffffff').multiplyScalar(0.25);
    for (let i = 0; i < n; i++) {
      const o = i * LOT_STATE_STRIDE;
      const zona = S[o];
      if (camada === 'nenhuma' || camada === 'zonas') c.copy(zona ? zonaCores[zona] : vazio);
      else c.copy(corCamada(camada, S, o, c, false) ?? vazio).multiplyScalar(zona ? 1 : 0.4);
      for (let v = 0; v < vpl; v++) {
        const k = (i * vpl + v) * 3;
        arr[k] = c.r; arr[k + 1] = c.g; arr[k + 2] = c.b;
      }
    }
    col.needsUpdate = true;
  }, [geo, sv, camada, visivel]);

  if (!geo) return null;
  return <mesh geometry={geo} material={mat} renderOrder={2} />;
}
