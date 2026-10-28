/**
 * Ônibus do Rio nas linhas reais (Fase 17), do GTFS da SMTR: cada ônibus segue o itinerário de uma linha,
 * com a cor da linha, na frequência do horário (viagens por hora de um dia útil), e é encaixado no eixo da
 * rua mais próxima (cota certa em túnel e viaduto). O BRT (MOBI-Rio) usa o articulado. As paradas viram
 * abrigos de ponto de ônibus. Na camada "Transporte" os itinerários aparecem desenhados no mapa.
 * Dados: Prefeitura do Rio (SMTR) via Data.Rio — public/data/rio/onibus.json (npm run fetch-gtfs).
 */
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { mundo, useGame } from '../../sim/bridge';
import { roadBaseY, sampleHeight, type Heightmap } from '../../world/terrain';
import { ambiente } from './ambiente';
import { alvoCamera } from './Camera';
import { indiceDasVias, type AmostraVia } from './perfilVias';
import { geoBrt, geoOnibus, materialVeiculo } from './Veiculos';
import { onibusEstado } from './onibusEstado';
import { registro } from '../../entidades/registro';
import { perfisAtuais } from './Vias';

interface LinhaDados { id: string; nome: string; longo: string; cor: string; tipo: number; porHora: number[]; trechos: number[][] }
interface DadosOnibus { linhas: LinhaDados[]; nomesParadas: string[]; paradas: number[] }

/** trecho de itinerário pronto para andar: pontos, distâncias acumuladas e caixa */
interface Trecho { linha: number; tipo: number; cor: THREE.Color; xs: Float32Array; zs: Float32Array; cum: Float32Array; comp: number; minx: number; maxx: number; minz: number; maxz: number }
interface Onibus { ativo: boolean; trecho: number; s: number; v: number; cor: THREE.Color; tipo: number; id: number; semente: number }

const MAX = 160;
const RAIO = 1500;

/** Peso de uma linha na hora: viagens por hora (com um mínimo para as de madrugada não sumirem à noite). */
const pesoHora = (l: LinhaDados, hora: number) => Math.max(0.15, l.porHora[Math.floor(hora) % 24] ?? 0);

function preparar(d: DadosOnibus): Trecho[] {
  const out: Trecho[] = [];
  d.linhas.forEach((l, li) => {
    const cor = new THREE.Color(l.cor);
    for (const t of l.trechos) {
      const n = t.length / 2;
      const xs = new Float32Array(n), zs = new Float32Array(n), cum = new Float32Array(n);
      let minx = Infinity, maxx = -Infinity, minz = Infinity, maxz = -Infinity;
      for (let i = 0; i < n; i++) {
        xs[i] = t[i * 2]; zs[i] = t[i * 2 + 1];
        if (i) cum[i] = cum[i - 1] + Math.hypot(xs[i] - xs[i - 1], zs[i] - zs[i - 1]);
        minx = Math.min(minx, xs[i]); maxx = Math.max(maxx, xs[i]); minz = Math.min(minz, zs[i]); maxz = Math.max(maxz, zs[i]);
      }
      if (cum[n - 1] < 80) continue;
      out.push({ linha: li, tipo: l.tipo, cor, xs, zs, cum, comp: cum[n - 1], minx, maxx, minz, maxz });
    }
  });
  return out;
}

/** Posição e rumo (unitário) a `s` metros do começo do trecho. */
function ponto(t: Trecho, s: number, out: { x: number; z: number; hx: number; hz: number }) {
  let lo = 0, hi = t.cum.length - 1;
  while (lo < hi - 1) { const m = (lo + hi) >> 1; if (t.cum[m] <= s) lo = m; else hi = m; }
  const seg = Math.max(1e-6, t.cum[hi] - t.cum[lo]), f = Math.min(1, Math.max(0, (s - t.cum[lo]) / seg));
  out.x = t.xs[lo] + (t.xs[hi] - t.xs[lo]) * f; out.z = t.zs[lo] + (t.zs[hi] - t.zs[lo]) * f;
  const dx = t.xs[hi] - t.xs[lo], dz = t.zs[hi] - t.zs[lo], l = Math.hypot(dx, dz) || 1;
  out.hx = dx / l; out.hz = dz / l;
}

export function Onibus({ hm }: { hm: Heightmap }) {
  const real = mundo.real;
  const [dados, setDados] = useState<DadosOnibus | null>(null);
  const camada = useGame((s) => s.camada);
  const camera = useThree((s) => s.camera);
  void camera;

  useEffect(() => {
    if (!real || real.ibge !== '3304557') return;
    let vivo = true;
    fetch(`${import.meta.env.BASE_URL}data/rio/onibus.json`).then((r) => (r.ok ? r.json() : null)).then((j) => {
      if (vivo && j) { setDados(j as DadosOnibus); onibusEstado.ativo = true; }
    }).catch(() => { /* sem o arquivo, ficam os ônibus sorteados */ });
    return () => { vivo = false; onibusEstado.ativo = false; };
  }, [real]);

  const trechos = useMemo(() => (dados ? preparar(dados) : []), [dados]);
  const geos = useMemo(() => ({ onibus: geoOnibus(), brt: geoBrt(), abrigo: geoAbrigo() }), []);
  const uNoite = useMemo(() => ({ value: 0 }), []);
  const mats = useMemo(() => ({ corpo: materialVeiculo(uNoite), abrigo: new THREE.MeshStandardMaterial({ color: '#2f6db5', roughness: 0.6, metalness: 0.2 }) }), [uNoite]);
  useEffect(() => () => { Object.values(geos).forEach((g) => g.dispose()); Object.values(mats).forEach((m) => m.dispose()); }, [geos, mats]);

  const refs = { onibus: useRef<THREE.InstancedMesh>(null), brt: useRef<THREE.InstancedMesh>(null), abrigo: useRef<THREE.InstancedMesh>(null) };
  const E = useRef({ pool: [] as Onibus[], rng: 12345, centro: [1e9, 1e9] as [number, number], cand: [] as number[], pesoTotal: 0, acum: [] as number[], horaCand: -1, perfis: null as null | typeof perfisAtuais, relogio: 0 });
  const tmp = useMemo(() => ({ m: new THREE.Matrix4(), q: new THREE.Quaternion(), v: new THREE.Vector3(), s: new THREE.Vector3(1, 1, 1), eixo: new THREE.Vector3(0, 1, 0), p: { x: 0, z: 0, hx: 0, hz: 1 }, am: { x: 0, y: 0, z: 0, tx: 0, tz: 0, largura: 8, edge: 0 } as AmostraVia }), []);
  const rand = () => { const e = E.current; e.rng = (e.rng * 1664525 + 1013904223) >>> 0; return e.rng / 4294967296; };

  // camada Transporte: os itinerários desenhados no mapa, na cor de cada linha
  const linhasGeo = useMemo(() => {
    if (!dados || camada !== 'transporte') return null;
    const pos: number[] = [], cor: number[] = [];
    const c = new THREE.Color();
    for (const l of dados.linhas) {
      c.set(l.cor);
      for (const t of l.trechos) for (let i = 2; i < t.length; i += 2) {
        for (const k of [i - 2, i]) { pos.push(t[k], Math.max(0, sampleHeight(hm, t[k], t[k + 1])) + 7, t[k + 1]); cor.push(c.r, c.g, c.b); }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(cor, 3));
    return g;
  }, [dados, camada, hm]);
  useEffect(() => () => linhasGeo?.dispose(), [linhasGeo]);

  // dados vivos para a ficha do ônibus clicado: linha real do GTFS (número e nome "origem - destino")
  useEffect(() => registro.fonte('onibus', (id) => {
    for (const b of E.current.pool) if (b.ativo && b.id === id) {
      const l = dados?.linhas[trechos[b.trecho]?.linha ?? -1];
      return { semente: b.semente, tipoVeiculo: b.tipo === 1 ? 9 : 1, velocidade: b.v, rumo: 0, linha: l ? { nome: l.nome, longo: l.longo } : null, lotacao: Math.round(10 + ((b.semente % 100) / 100) * 45) };
    }
    return null;
  }), [dados, trechos]);

  useFrame((_, dtReal) => {
    registro.iniciarQuadro('onibus');
    const e = E.current;
    const [oni, brt, abr] = [refs.onibus.current, refs.brt.current, refs.abrigo.current];
    if (!dados || !oni || !brt || !abr || !trechos.length || !perfisAtuais.size) return;
    uNoite.value = ambiente.noite;
    const indice = indiceDasVias(perfisAtuais);
    const { m, q, v, s, eixo, p, am } = tmp;

    // abrigos de ponto: refeitos quando a malha de vias muda (viram de frente para a rua mais próxima)
    if (e.perfis !== perfisAtuais) {
      e.perfis = perfisAtuais;
      let n = 0;
      for (let i = 0; i + 2 < dados.paradas.length && n < 5000; i += 3) {
        const x = dados.paradas[i], z = dados.paradas[i + 1];
        let y = roadBaseY(hm, x, z) - 0.13, yaw = (i * 0.37) % 6.28;
        if (indice.perto(x, z, 28, am)) { y = am.y - 0.13; yaw = Math.atan2(am.x - x, am.z - z); }
        q.setFromAxisAngle(eixo, yaw);
        m.compose(v.set(x, y, z), q, s.set(1, 1, 1));
        abr.setMatrixAt(n++, m);
      }
      abr.count = n;
      abr.instanceMatrix.needsUpdate = true;
      abr.computeBoundingSphere();
    }

    const g = useGame.getState();
    const dt = Math.min(0.05, dtReal) * (g.velocidade > 0 ? Math.min(2, 0.6 + g.velocidade * 0.4) : 0);
    const hora = ambiente.hora;
    const a = alvoCamera();
    // candidatos: trechos de itinerário que passam perto da câmera, com o peso da frequência na hora
    if (Math.hypot(a.x - e.centro[0], a.z - e.centro[1]) > 350 || Math.floor(hora) !== e.horaCand) {
      e.centro = [a.x, a.z]; e.horaCand = Math.floor(hora);
      e.cand = []; e.acum = []; e.pesoTotal = 0;
      trechos.forEach((t, i) => {
        if (t.maxx < a.x - RAIO || t.minx > a.x + RAIO || t.maxz < a.z - RAIO || t.minz > a.z + RAIO) return;
        e.pesoTotal += pesoHora(dados.linhas[t.linha], hora);
        e.cand.push(i); e.acum.push(e.pesoTotal);
      });
    }
    if (!e.cand.length) { oni.count = 0; brt.count = 0; return; }

    // quantos ônibus: a frequência da hora nas linhas por perto (cada viagem leva ~1 h) × fração do trajeto no raio
    const alvo = Math.max(8, Math.min(MAX, Math.round(e.pesoTotal * 0.3)));
    while (e.pool.length < alvo) e.pool.push({ ativo: false, trecho: 0, s: 0, v: 8, cor: new THREE.Color(), tipo: 0, id: 0, semente: 0 });
    if (e.pool.length > alvo) e.pool.length = alvo;

    const sorteia = (b: Onibus) => {
      const r = rand() * e.pesoTotal;
      let lo = 0, hi = e.acum.length - 1;
      while (lo < hi) { const mm = (lo + hi) >> 1; if (e.acum[mm] < r) lo = mm + 1; else hi = mm; }
      const ti = e.cand[lo], t = trechos[ti];
      // posição inicial: um vértice do itinerário dentro do raio da câmera
      for (let k = 0; k < 12; k++) {
        const vi = Math.floor(rand() * t.xs.length);
        if (Math.hypot(t.xs[vi] - a.x, t.zs[vi] - a.z) < RAIO) {
          b.trecho = ti; b.s = Math.max(0, t.cum[vi] - rand() * 20); b.tipo = t.tipo; b.cor.copy(t.cor);
          b.v = t.tipo === 1 ? 7 + rand() * 4 : 5 + rand() * 4; b.ativo = true;
          b.id = registro.novoId(); b.semente = 1 + Math.floor(rand() * 1_000_000_000);
          return;
        }
      }
    };

    let nO = 0, nB = 0;
    for (const b of e.pool) {
      if (b.ativo) {
        const t = trechos[b.trecho];
        b.s += b.v * dt;
        ponto(t, Math.min(b.s, t.comp), p);
        if (b.s >= t.comp || Math.hypot(p.x - a.x, p.z - a.z) > RAIO * 1.6) b.ativo = false;
      }
      if (!b.ativo) { sorteia(b); if (!b.ativo) continue; }
      const t = trechos[b.trecho];
      ponto(t, b.s, p);
      // encaixa no eixo da rua: só o deslocamento lateral (o ônibus segue suave pelo itinerário)
      let y = Math.max(0, sampleHeight(hm, p.x, p.z)) + 0.3, x = p.x, z = p.z, off = 2;
      if (indice.perto(p.x, p.z, 14, am)) {
        const nx = -am.tz, nz = am.tx;
        const d = (am.x - p.x) * nx + (am.z - p.z) * nz;
        x = p.x + nx * d; z = p.z + nz * d; y = am.y + 0.02; off = am.largura * 0.27;
      }
      // mão direita em relação ao sentido da linha
      x += -p.hz * off; z += p.hx * off;
      q.setFromAxisAngle(eixo, Math.atan2(p.hx, p.hz));
      m.compose(v.set(x, y, z), q, s);
      const im = b.tipo === 1 ? brt : oni;
      const k = b.tipo === 1 ? nB++ : nO++;
      im.setMatrixAt(k, m);
      im.setColorAt(k, b.cor);
      registro.publicar('onibus', b.id, 'onibus', x, y, z, Math.atan2(p.hx, p.hz), 2.5, 3.1, b.tipo === 1 ? 18.2 : 12.2);
    }
    oni.count = nO; brt.count = nB;
    for (const im of [oni, brt]) { im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; }
  });

  if (!dados) return null;
  return (
    <group>
      <instancedMesh ref={refs.onibus} args={[geos.onibus, mats.corpo, MAX]} castShadow frustumCulled={false} />
      <instancedMesh ref={refs.brt} args={[geos.brt, mats.corpo, MAX / 4]} castShadow frustumCulled={false} />
      <instancedMesh ref={refs.abrigo} args={[geos.abrigo, mats.abrigo, 5000]} castShadow frustumCulled={false} />
      {linhasGeo && <lineSegments geometry={linhasGeo} renderOrder={5}><lineBasicMaterial vertexColors transparent opacity={0.9} depthTest={false} /></lineSegments>}
    </group>
  );
}

/** Abrigo de ponto: poste com a placa azul e um teto curto. */
function geoAbrigo(): THREE.BufferGeometry {
  const parts = [
    new THREE.CylinderGeometry(0.05, 0.06, 3, 6).translate(0, 1.5, 0),
    new THREE.BoxGeometry(0.55, 0.55, 0.05).translate(0, 2.7, 0.05),
    new THREE.BoxGeometry(2.4, 0.08, 1.1).translate(0, 2.55, 0.9),
    new THREE.BoxGeometry(2.4, 1.2, 0.04).translate(0, 1.8, 1.42),
  ];
  let nv = 0, ni = 0;
  for (const g of parts) { nv += g.getAttribute('position').count; ni += g.index!.count; }
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), ind = new Uint32Array(ni);
  let ov = 0, oi = 0;
  for (const g of parts) {
    pos.set(g.getAttribute('position').array as Float32Array, ov * 3);
    nor.set(g.getAttribute('normal').array as Float32Array, ov * 3);
    for (let i = 0; i < g.index!.count; i++) ind[oi + i] = g.index!.getX(i) + ov;
    ov += g.getAttribute('position').count; oi += g.index!.count;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setIndex(new THREE.BufferAttribute(ind, 1));
  return out;
}
