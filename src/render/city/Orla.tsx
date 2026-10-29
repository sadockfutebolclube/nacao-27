/**
 * Orla das praias (Fase 31): guarda-sóis e cadeiras com modelo 3D e cores variadas (nos lugares que Praia.tsx sorteia pela lotação),
 * quiosques (modelo + dono + faturamento na ficha de clique), redes de vôlei com jogadores e bola, postos de salva-vidas com guarda,
 * surfistas pegando onda, banhistas na água, ambulantes e caminhantes na beira, barcos fundeados na enseada. A geometria da costa vem do
 * relevo (`orlaDados.ts`); as pessoas usam o personagem animado de Visitantes.tsx (via `fontesVisitantes`). Jetskis e botes rápidos ficam
 * em VeiculosEspeciais.tsx (Fase 27).
 */
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { mundo } from '../../sim/bridge';
import { sampleHeight, type Heightmap } from '../../world/terrain';
import { TURISMO } from '../../world/turismo';
import { projetar } from '../../world/cidadeReal';
import { carregarModelo } from '../modelos/carregar';
import { carregarProp, Prop } from '../modelos/props';
import { MEDIR } from '../../dev/medir';
import { ambiente } from './ambiente';
import { dadosDaOrla, type AmostraCosta } from './orlaDados';
import { estadoPraia, lotacaoPraia, SOIS } from './Praia';
import { contextoTurismo, turismoDebug } from './turismoEstado';
import { fontesVisitantes, type Emitir } from './Visitantes';

const RAIO = 650;
const hash = (i: number, j: number, k: number) => { const s = Math.sin(i * 127.1 + j * 311.7 + k * 74.7) * 43758.5453; return s - Math.floor(s); };
const CAD = ['#ffffff', '#e63946', '#118ab2', '#ffd166', '#06d6a0', '#f4a261'].map((c) => new THREE.Color(c));
const yawDe = (dx: number, dz: number) => Math.atan2(dx, dz);
/** pranchas e isopores pedidos pela fonte de pessoas (que roda dentro de Visitantes.tsx): [x, y, z, yaw, …]; o desenho consome no quadro seguinte */
const pedidoPranchas: number[] = [], pedidoIsopores: number[] = [];

/** posição ao longo da costa, indo e voltando (`u` em metros desde a amostra 0, ~12 m por amostra) */
function naCosta(c: AmostraCosta[], u: number, out: { x: number; z: number; nx: number; nz: number; tx: number; tz: number }) {
  const per = 2 * (c.length - 1) * 12;
  let v = ((u % per) + per) % per, sentido = 1;
  if (v > per / 2) { v = per - v; sentido = -1; }
  const f = v / 12, i = Math.min(c.length - 2, Math.floor(f)), k = f - i, a = c[i], b = c[i + 1];
  out.x = a.x + (b.x - a.x) * k; out.z = a.z + (b.z - a.z) * k;
  out.nx = a.nx + (b.nx - a.nx) * k; out.nz = a.nz + (b.nz - a.nz) * k;
  const tx = b.x - a.x, tz = b.z - a.z, l = Math.hypot(tx, tz) || 1;
  out.tx = (tx / l) * sentido; out.tz = (tz / l) * sentido;
}

/** Posto de salva-vidas: quatro pernas, plataforma com guarda-corpo, telhado e bandeira. Cor por vértice (uma só malha). */
function geoPosto(): THREE.BufferGeometry {
  const peca = (g: THREE.BufferGeometry, cor: string, x: number, y: number, z: number) => {
    const n = g.index ? g.toNonIndexed() : g;
    n.deleteAttribute('uv');
    n.translate(x, y, z);
    const c = new THREE.Color(cor), a = new Float32Array(n.getAttribute('position').count * 3);
    for (let i = 0; i < a.length; i += 3) { a[i] = c.r; a[i + 1] = c.g; a[i + 2] = c.b; }
    n.setAttribute('color', new THREE.BufferAttribute(a, 3));
    return n;
  };
  const gs: THREE.BufferGeometry[] = [];
  for (const [x, z] of [[-1.1, -1.1], [1.1, -1.1], [-1.1, 1.1], [1.1, 1.1]]) gs.push(peca(new THREE.BoxGeometry(0.16, 2.6, 0.16), '#8a6a45', x, 1.3, z));
  gs.push(peca(new THREE.BoxGeometry(2.8, 0.14, 2.8), '#a8844f', 0, 2.62, 0));
  for (const [x, z, w, d] of [[0, -1.35, 2.8, 0.06], [0, 1.35, 2.8, 0.06], [-1.35, 0, 0.06, 2.8], [1.35, 0, 0.06, 2.8]]) gs.push(peca(new THREE.BoxGeometry(w, 0.7, d), '#e8e2d2', x, 3.0, z));
  gs.push(peca(new THREE.BoxGeometry(3.3, 0.12, 3.3), '#d8352b', 0, 4.55, 0));
  for (const [x, z] of [[-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5], [1.5, 1.5]]) gs.push(peca(new THREE.BoxGeometry(0.1, 1.8, 0.1), '#8a6a45', x, 3.65, z));
  gs.push(peca(new THREE.BoxGeometry(0.05, 2.2, 0.05), '#cccccc', 1.5, 5.7, -1.5));
  gs.push(peca(new THREE.BoxGeometry(0.9, 0.6, 0.03), '#e63946', 1.95, 6.5, -1.5));
  // escada
  for (let k = 0; k < 6; k++) gs.push(peca(new THREE.BoxGeometry(1, 0.08, 0.3), '#a8844f', 0, 0.4 + k * 0.4, 1.6 + k * 0.28 - 1.0));
  const g = new THREE.BufferGeometry();
  const pos: number[] = [], nor: number[] = [], col: number[] = [];
  for (const x of gs) { x.computeVertexNormals(); pos.push(...(x.getAttribute('position').array as Float32Array)); nor.push(...(x.getAttribute('normal').array as Float32Array)); col.push(...(x.getAttribute('color').array as Float32Array)); x.dispose(); }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

/** rede e postes de vôlei: dois postes de 2,43 m e a rede (plano com textura de malha, transparente) a 9 m de comprimento */
function texturaRede(): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = 128; c.height = 32;
  const x = c.getContext('2d')!;
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, 128, 3); x.fillRect(0, 29, 128, 3);
  x.strokeStyle = 'rgba(255,255,255,0.9)'; x.lineWidth = 1;
  for (let i = 0; i <= 128; i += 6) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 32); x.stroke(); }
  for (let j = 0; j <= 32; j += 6) { x.beginPath(); x.moveTo(0, j); x.lineTo(128, j); x.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function Orla({ hm }: { hm: Heightmap }) {
  const { camera } = useThree();
  const real = mundo.real;
  const dados = useMemo(() => (real ? dadosDaOrla(hm, real) : null), [hm, real]);
  if (MEDIR && dados) (window as unknown as { __n27orla: unknown }).__n27orla = dados;
  const [props, setProps] = useState<{ sol: Prop; cad: Prop; prancha: Prop; quiosque: Prop } | null>(null);
  const [barcos, setBarcos] = useState<{ prop: Prop; itens: { x: number; z: number; rot: number }[] }[]>([]);

  useEffect(() => {
    let vivo = true;
    Promise.all([carregarProp('guardaSol', 900), carregarProp('cadeira', 1500), carregarProp('prancha', 40), carregarProp('quiosque', 30)])
      .then(([sol, cad, prancha, quiosque]) => { if (vivo) setProps({ sol, cad, prancha, quiosque }); }).catch((e) => console.error('[orla props]', e));
    return () => { vivo = false; };
  }, []);

  // barcos fundeados: um conjunto por modelo (Kenney Watercraft, CC0)
  useEffect(() => {
    if (!real) return;
    let vivo = true;
    const porModelo = new Map<string, { x: number; z: number; rot: number }[]>();
    for (const b of TURISMO.orla.barcosFundeados) {
      const [x, z] = projetar(real, b.lat, b.lon);
      (porModelo.get(b.modelo) ?? porModelo.set(b.modelo, []).get(b.modelo)!).push({ x, z, rot: b.rot });
    }
    const comprimento: Record<string, number> = { 'boat-sail-a': 11, 'boat-sail-b': 13, 'boat-fishing-small': 8, 'boat-speed-b': 7 };
    Promise.all([...porModelo.entries()].map(async ([nome, itens]) => {
      const m = await carregarModelo(`orla-${nome}`, { arquivo: `navio/${nome}.glb`, comprimentoM: comprimento[nome] ?? 9, frenteGraus: 'proa' });
      return { prop: new Prop(m, { capacidade: itens.length }), itens };
    })).then((r) => { if (vivo) setBarcos(r); }).catch((e) => console.error('[orla barcos]', e));
    return () => { vivo = false; };
  }, [real]);

  const extras = useMemo(() => {
    const posto = new THREE.InstancedMesh(geoPosto(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }), 24);
    posto.frustumCulled = false; posto.castShadow = true; posto.receiveShadow = true; posto.count = 0;
    const poste = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.045, 0.045, 2.43, 6).translate(0, 1.215, 0), new THREE.MeshStandardMaterial({ color: '#d8d8d4', roughness: 0.6 }), 130);
    poste.frustumCulled = false; poste.castShadow = true; poste.count = 0;
    const rede = new THREE.InstancedMesh(new THREE.PlaneGeometry(9.0, 0.9).translate(0, 1.95, 0), new THREE.MeshStandardMaterial({ map: texturaRede(), transparent: true, side: THREE.DoubleSide, alphaTest: 0.25, roughness: 1 }), 65);
    rede.frustumCulled = false; rede.count = 0;
    const quadra = new THREE.InstancedMesh(new THREE.PlaneGeometry(9.5, 18).rotateX(-Math.PI / 2).translate(0, 0.045, 0), new THREE.MeshStandardMaterial({ color: '#efe3bd', roughness: 1, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }), 65);
    quadra.frustumCulled = false; quadra.receiveShadow = true; quadra.count = 0;
    const bola = new THREE.InstancedMesh(new THREE.SphereGeometry(0.11, 8, 6), new THREE.MeshStandardMaterial({ color: '#fff8e0', roughness: 0.6 }), 65);
    bola.frustumCulled = false; bola.count = 0;
    const isopor = new THREE.InstancedMesh(new THREE.BoxGeometry(0.6, 0.38, 0.4).translate(0, 0.85, 0.3), new THREE.MeshStandardMaterial({ color: '#f2f5f7', roughness: 0.7 }), 40);
    isopor.frustumCulled = false; isopor.castShadow = true; isopor.count = 0;
    return { posto, poste, rede, quadra, bola, isopor };
  }, []);
  useEffect(() => () => { for (const o of Object.values(extras)) { o.geometry.dispose(); (o.material as THREE.Material).dispose(); o.dispose(); } }, [extras]);

  const tmp = useMemo(() => ({ m: new THREE.Matrix4(), q: new THREE.Quaternion(), p: new THREE.Vector3(), s: new THREE.Vector3(1, 1, 1), eixo: new THREE.Vector3(0, 1, 0), c: new THREE.Color(), r: { x: 0, z: 0, nx: 0, nz: 0, tx: 0, tz: 0 } }), []);

  // pessoas da orla, desenhadas pelo personagem animado de Visitantes.tsx
  useEffect(() => {
    if (!dados) return;
    const { r } = tmp;
    const fonte = (emitir: Emitir, ctx: ReturnType<typeof contextoTurismo>, _dt: number, cam: THREE.Vector3) => {
      const lot = lotacaoPraia(ctx.hora, ctx.chuva, ctx.temp ?? 27, ctx.diaSemana);
      if (lot <= 0.02) return;
      const t = performance.now() / 1000;
      for (const [id, cfg] of Object.entries(TURISMO.orla.praias)) {
        const c = dados.costa[id];
        if (!c || c.length < 4) continue;
        const comp = c[c.length - 1].s - c[0].s, km = comp / 1000;
        const perto = (x: number, z: number) => Math.hypot(x - cam.x, z - cam.z) < RAIO;
        // banhistas: na água, na altura da cintura (o fundo daqui é < −0,3 m)
        for (let i = 0; i < c.length; i++) {
          if (!perto(c[i].x, c[i].z)) continue;
          if (hash(i, 11, 1) > 0.35 * lot) continue;
          const d = 2.5 + hash(i, 12, 1) * 11, x = c[i].x + c[i].nx * d + c[i].nz * (hash(i, 13, 1) - 0.5) * 8, z = c[i].z + c[i].nz * d - c[i].nx * (hash(i, 13, 1) - 0.5) * 8;
          const y = sampleHeight(hm, x, z);
          if (y > -0.15 || y < -1.3) continue;
          const bob = Math.sin(t * 1.3 + i) * 0.05;
          if (!emitir(x, y + bob, z, hash(i, 14, 1) * 6.28, 0.97 + hash(i, 15, 1) * 0.08, 0, hash(i, 16, 1) * 8, hash(i, 17, 1), false, Math.floor(hash(i, 18, 1) * 14), Math.floor(hash(i, 19, 1) * 8))) return;
        }
        // caminhantes na beira d'água (ida e volta pela areia molhada) e ambulantes com isopor
        const nCam = Math.round(30 * lot * km), nAmb = Math.round(cfg.ambulantesPorKm * km * Math.min(1, lot * 1.5));
        for (let k = 0; k < nCam + nAmb; k++) {
          const amb = k >= nCam, v = amb ? 0.9 : 1.25;
          naCosta(c, hash(k, 21, 1) * 2 * (c.length - 1) * 12 + t * v * (hash(k, 22, 1) < 0.5 ? 1 : -1), r);
          if (!perto(r.x, r.z)) continue;
          const dentro = amb ? 9 : 2.2, x = r.x - r.nx * dentro, z = r.z - r.nz * dentro;
          const y = Math.max(0, sampleHeight(hm, x, z)), dir = hash(k, 22, 1) < 0.5 ? 1 : -1;
          if (!emitir(x, y, z, yawDe(r.tx * dir, r.tz * dir), 1, 4.6, hash(k, 23, 1) * 8, hash(k, 24, 1), false, amb ? 6 : Math.floor(hash(k, 25, 1) * 14), Math.floor(hash(k, 26, 1) * 8))) return;
          if (amb) pedidoIsopores.push(x, y, z, yawDe(r.tx * dir, r.tz * dir));
        }
        // surfistas: de pé na prancha, descendo a onda em direção à praia e remando de volta (ciclo de 16 s)
        const nSurf = Math.round(cfg.surfistasPorKm * km * Math.min(1, 0.3 + lot));
        for (let k = 0; k < nSurf; k++) {
          const i = Math.floor(hash(k, 31, 1) * (c.length - 1)), a = c[i];
          if (!perto(a.x, a.z)) continue;
          const ph = ((t + hash(k, 32, 1) * 16) % 16) / 16, pegando = ph < 0.55;
          const d = pegando ? 62 - 50 * (ph / 0.55) : 12 + 50 * ((ph - 0.55) / 0.45);
          const x = a.x + a.nx * d + a.nz * Math.sin(t * 0.3 + k) * 3, z = a.z + a.nz * d - a.nx * Math.sin(t * 0.3 + k) * 3;
          const bob = Math.sin(t * 1.6 + k * 2) * 0.12;
          const dirx = pegando ? -a.nx : a.nx, dirz = pegando ? -a.nz : a.nz, yaw = yawDe(dirx, dirz);
          if (!emitir(x, 0.12 + bob, z, yaw, 1, 0, k * 1.7, hash(k, 33, 1), false, Math.floor(hash(k, 34, 1) * 14), 1)) return;
          pedidoPranchas.push(x, 0.04 + bob, z, yaw);
        }
      }
      // jogadores de vôlei (4 por rede): um pula a cada poucos segundos, a bola cruza a rede
      let ib = 0;
      for (const rd of dados.redes) {
        if (Math.hypot(rd.x - cam.x, rd.z - cam.z) > RAIO || ib >= 60) continue;
        const cx = Math.cos(rd.yaw), sx = Math.sin(rd.yaw);
        // eixo da rede: (cos, 0, sin) em rotação Y — o campo é perpendicular
        const n1x = -sx, n1z = -cx;
        const jog = [[-1.6, 5.2], [1.6, 5.2], [-1.6, -5.2], [1.6, -5.2]];
        jog.forEach(([lx, lz], k) => {
          const x = rd.x + cx * lx + n1x * lz, z = rd.z - sx * lx + n1z * lz;
          const pula = Math.sin(t * 1.1 + ib * 1.9 + k * 1.3) > 0.82;
          const y = Math.max(0, sampleHeight(hm, x, z));
          emitir(x, y, z, yawDe(-n1x * Math.sign(lz), -n1z * Math.sign(lz)), 1, pula ? -2 : 0, k * 2, hash(ib, k, 41), false, Math.floor(hash(ib, k, 42) * 14), Math.floor(hash(ib, k, 43) * 8));
        });
        ib++;
      }
      // postos: o guarda-vidas de camisa vermelha no mirante
      for (const po of dados.postos) {
        if (Math.hypot(po.x - cam.x, po.z - cam.z) > RAIO) continue;
        emitir(po.x, Math.max(0, sampleHeight(hm, po.x, po.z)) + 2.72, po.z, po.yaw, 1, 0, po.numero * 0.7, 0.35, false, 0, 1);
      }
    };
    fontesVisitantes.add(fonte);
    return () => { fontesVisitantes.delete(fonte); };
  }, [dados, hm, tmp]);

  useFrame(() => {
    if (!dados || !props) return;
    const tIni = performance.now();
    const { m, q, p, s, eixo, c } = tmp;
    const cam = camera.position;
    const ctx = contextoTurismo();
    const lot = lotacaoPraia(ctx.hora, ctx.chuva, ctx.temp ?? 27, ctx.diaSemana);
    for (const o of [props.sol, props.cad, props.prancha, props.quiosque]) o.inicio();
    for (const b of barcos) b.prop.inicio();

    // guarda-sóis do grupo (lugares sorteados por Praia.tsx) com duas cadeiras ao lado
    for (const it of estadoPraia.sois) {
      if (lot <= 0.02) break;
      const cor = c.set(SOIS[it.cor % SOIS.length]);
      props.sol.poe(it.x, it.y, it.z, it.rot, 1.0 + hash(it.cor, 1, 5) * 0.12, cor);
      const ca = Math.cos(it.rot), sa = Math.sin(it.rot);
      for (const lado of [-1, 1]) props.cad.poe(it.x + ca * lado * 1.15 + sa * 0.35, it.y, it.z - sa * lado * 1.15 + ca * 0.35, it.rot + lado * 0.25, 1, CAD[(it.cor + lado + 3) % CAD.length]);
    }

    // quiosques com mesas e guarda-sóis
    let nq = 0;
    for (const k of dados.quiosques) {
      if (Math.hypot(k.x - cam.x, k.z - cam.z) > RAIO) continue;
      const y = Math.max(0, sampleHeight(hm, k.x, k.z));
      props.quiosque.poe(k.x, y, k.z, k.yaw, 1);
      nq++;
      if (lot > 0.03) {
        const ca = Math.cos(k.yaw), sa = Math.sin(k.yaw);
        for (let j = 0; j < 4; j++) {
          const lx = (j % 2 ? 1 : -1) * (2.6 + Math.floor(j / 2) * 1.7), lz = 3.4 + Math.floor(j / 2) * 2.4;
          const x = k.x + ca * lx + sa * lz, z = k.z - sa * lx + ca * lz;
          props.sol.poe(x, Math.max(0, sampleHeight(hm, x, z)), z, j * 1.3, 1.1, c.set(SOIS[(k.id + j) % SOIS.length]));
          for (let w = 0; w < 2; w++) props.cad.poe(x + (w ? 0.9 : -0.9), Math.max(0, sampleHeight(hm, x, z)), z + 0.3, (w ? 1 : -1) * 0.3 + j, 1, CAD[(k.id + j + w) % CAD.length]);
        }
      }
    }

    // redes de vôlei: postes, rede, quadra e bola
    const { posto, poste, rede, quadra, bola } = extras;
    let nr = 0;
    for (const rd of dados.redes) {
      if (Math.hypot(rd.x - cam.x, rd.z - cam.z) > RAIO || nr >= 60) continue;
      const y = Math.max(0, sampleHeight(hm, rd.x, rd.z));
      q.setFromAxisAngle(eixo, rd.yaw);
      m.compose(p.set(rd.x, y, rd.z), q, s); quadra.setMatrixAt(nr, m); rede.setMatrixAt(nr, m);
      for (const lado of [-1, 1]) { const ca = Math.cos(rd.yaw), sa = Math.sin(rd.yaw); m.compose(p.set(rd.x + ca * lado * 4.6, y, rd.z - sa * lado * 4.6), q, s); poste.setMatrixAt(nr * 2 + (lado > 0 ? 1 : 0), m); }
      const tb = performance.now() / 1000 + nr, f = (tb % 2.2) / 2.2, lado = Math.floor(tb / 2.2) % 2 ? 1 : -1;
      const ca = Math.cos(rd.yaw), sa = Math.sin(rd.yaw), n1x = -sa, n1z = -ca;
      const lz = lado * (5.2 - 10.4 * f);
      m.compose(p.set(rd.x + n1x * lz, y + 1.1 + Math.sin(f * Math.PI) * 3.2, rd.z + n1z * lz), q, s); bola.setMatrixAt(nr, m);
      nr++;
    }
    quadra.count = rede.count = bola.count = nr; poste.count = nr * 2;
    // postos de salva-vidas
    let np = 0;
    for (const po of dados.postos) {
      if (Math.hypot(po.x - cam.x, po.z - cam.z) > RAIO * 1.4 || np >= 24) continue;
      q.setFromAxisAngle(eixo, po.yaw);
      m.compose(p.set(po.x, Math.max(0, sampleHeight(hm, po.x, po.z)), po.z), q, s); posto.setMatrixAt(np++, m);
    }
    posto.count = np;
    for (const o of [quadra, rede, bola, poste, posto]) o.instanceMatrix.needsUpdate = true;

    // barcos fundeados: balançam suave, virados para o vento
    const t = performance.now() / 1000;
    for (const b of barcos) {
      b.itens.forEach((it, i) => b.prop.poe(it.x, 0.1 + Math.sin(t * 0.8 + i * 2.1) * 0.08, it.z, (it.rot * Math.PI) / 180 + Math.sin(t * 0.15 + i) * 0.12, 1, undefined, Math.sin(t * 0.7 + i) * 0.02, Math.sin(t * 0.9 + i * 3) * 0.03));
    }
    // pranchas dos surfistas e isopores dos ambulantes (pedidos pela fonte de pessoas no quadro anterior)
    for (let i = 0; i + 3 < pedidoPranchas.length; i += 4) props.prancha.poe(pedidoPranchas[i], pedidoPranchas[i + 1], pedidoPranchas[i + 2], pedidoPranchas[i + 3], 1, c.set(SOIS[(i / 4) % SOIS.length]));
    let ni = 0;
    for (let i = 0; i + 3 < pedidoIsopores.length && ni < 40; i += 4, ni++) { q.setFromAxisAngle(eixo, pedidoIsopores[i + 3]); m.compose(p.set(pedidoIsopores[i], pedidoIsopores[i + 1], pedidoIsopores[i + 2]), q, s); extras.isopor.setMatrixAt(ni, m); }
    extras.isopor.count = ni; extras.isopor.instanceMatrix.needsUpdate = true;
    pedidoPranchas.length = 0; pedidoIsopores.length = 0;
    for (const o of [props.sol, props.cad, props.prancha, props.quiosque]) o.fim();
    for (const b of barcos) b.prop.fim();
    turismoDebug.propsDesenhados = props.sol.quantos + props.cad.quantos + props.quiosque.quantos + nr + np;
    turismoDebug.ms.orla += (performance.now() - tIni - turismoDebug.ms.orla) * 0.05;
    void ambiente; void nq;
  });

  return (
    <>
      {props && [props.sol, props.cad, props.prancha, props.quiosque].map((o, i) => <primitive key={i} object={o.grupo} />)}
      {barcos.map((b, i) => <primitive key={`b${i}`} object={b.prop.grupo} />)}
      {Object.entries(extras).map(([k, o]) => <primitive key={k} object={o} />)}
    </>
  );
}
