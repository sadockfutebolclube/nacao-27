/**
 * Veículos especiais (Fase 27): aviões (Santos Dumont e Galeão), helicópteros (turismo no Cristo e no Pão de Açúcar, imprensa, PM e
 * Bombeiros respondendo às ocorrências), caças da Aeronáutica, navios mercantes, de cruzeiro e da Marinha, barcos de pesca e de
 * passeio, jetskis, botes e as barcas Rio–Niterói. Modelos 3D reais (assets/models), rotas por waypoints (src/data/veiculos/especiais.json),
 * InstancedMesh com LOD por distância e som espacial. Tudo é desenho: o relógio dos veículos só avança com o jogo andando.
 */
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { audioEspacial, type Emissor } from '../../audio/espacial';
import { useGame } from '../../sim/bridge';
import { ESPECIAIS, type DefFrota } from '../../sim/especiais/dados';
import { montarCronograma, novaPosicao, posicaoDoVeiculo, prepararRota, projetarRio, type RotaPronta } from '../../sim/especiais/rotas';
import { sampleHeight, type Heightmap } from '../../world/terrain';
import { Conjunto } from '../modelos/conjunto';
import { carregarModelo } from '../modelos/carregar';
import { ambiente } from './ambiente';
import { cenas, sirenes } from './ocorrenciaEstado';

const MAX_LONGE = 22000;

/** Pistas do catálogo (geometria do OpenStreetMap), projetadas no mapa; só as que caem dentro dele viram laje (o Galeão fica fora). */
const TOPO_PISTA = 3.4;
/** dev: reduz a altura das aeronaves sobre o chão (0–1) para fotografar com a câmera do jogo, que não sobe tanto */
export const depuracao = { alturaK: 1 };
const PISTAS = ESPECIAIS.pistas.map((d) => {
  const [ax, az] = projetarRio(d.a[0], d.a[1]), [bx, bz] = projetarRio(d.b[0], d.b[1]);
  return { id: d.id, x: (ax + bx) / 2, z: (az + bz) / 2, comprimento: Math.hypot(bx - ax, bz - az), largura: d.largura, yaw: Math.atan2(bx - ax, bz - az) };
}).filter((q) => Math.abs(q.x) < 8000 && Math.abs(q.z) < 8000);

/** textura da pista: asfalto, faixa central tracejada, cabeceiras listradas */
function texturaPista(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 1024;
  const g = c.getContext('2d')!;
  g.fillStyle = '#3a3b3f'; g.fillRect(0, 0, 128, 1024);
  g.fillStyle = '#e9e9e2';
  for (let y = 120; y < 900; y += 50) g.fillRect(61, y, 6, 28);
  for (const y0 of [18, 966]) for (let i = 0; i < 8; i++) g.fillRect(16 + i * 13, y0, 7, 36);
  g.fillRect(2, 0, 3, 1024); g.fillRect(123, 0, 3, 1024);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

/** y do chão de uma aeronave na pista (dentro do retângulo dela) ou do relevo */
const naPista = (x: number, z: number) => PISTAS.some((q) => Math.hypot(x - q.x, z - q.z) < q.comprimento * 0.6);
const chave = (modelo: string, tint?: string) => (tint ? `${modelo}|${tint}` : modelo);

/** textura do disco do rotor: duas pás borradas sobre um disco translúcido */
function texturaRotor(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  grad.addColorStop(0, 'rgba(40,40,44,0.35)'); grad.addColorStop(1, 'rgba(60,60,66,0.10)');
  g.fillStyle = grad; g.beginPath(); g.arc(64, 64, 62, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgba(20,20,24,0.55)'; g.lineWidth = 5; g.lineCap = 'round';
  g.beginPath(); g.moveTo(4, 64); g.lineTo(124, 64); g.stroke();
  return new THREE.CanvasTexture(c);
}

interface HeliOc { cena: number; def: (typeof ESPECIAIS.ocorrencias.helis)[number]; x: number; y: number; z: number; yaw: number; ang: number; estado: 'indo' | 'orbita' | 'volta'; vida: number; id: number }

export function VeiculosEspeciais({ hm }: { hm: Heightmap }) {
  const camera = useThree((s) => s.camera);
  const [conjuntos, setConjuntos] = useState<Map<string, Conjunto> | null>(null);

  const { rotas, cron } = useMemo(() => {
    const rotas: Record<string, RotaPronta> = {};
    for (const [id, d] of Object.entries(ESPECIAIS.rotas)) rotas[id] = prepararRota(id, d);
    return { rotas, cron: ESPECIAIS.frotas.map((f) => montarCronograma(f, rotas)) };
  }, []);

  // carrega os modelos usados e monta um Conjunto (InstancedMesh + silhueta) por modelo/cor
  useEffect(() => {
    let vivo = true;
    const feitos: Conjunto[] = [];
    (async () => {
      const uso = new Map<string, { modelo: string; tint?: string; n: number }>();
      const conta = (modelo: string, tint: string | undefined, n: number) => { const k = chave(modelo, tint); const u = uso.get(k) ?? { modelo, tint, n: 0 }; u.n += n; uso.set(k, u); };
      for (const f of ESPECIAIS.frotas) for (let i = 0; i < f.quantidade; i++) conta(f.modelos[i % f.modelos.length], f.tint, 1);
      for (const h of ESPECIAIS.ocorrencias.helis) conta(h.modelo, undefined, 4);
      const mapa = new Map<string, Conjunto>();
      for (const [k, u] of uso) {
        const def = ESPECIAIS.modelos[u.modelo];
        const m = await carregarModelo(u.modelo, { arquivo: def.arquivo, comprimentoM: def.comprimentoM, frenteGraus: def.frenteGraus });
        if (!vivo) return;
        const c = new Conjunto(m, { capacidade: u.n + 2, detalheM: def.detalheM, lod: def.lod, tint: u.tint, sombra: def.lod === 'caixa' && def.comprimentoM < 30 });
        feitos.push(c); mapa.set(k, c);
      }
      if (vivo) setConjuntos(mapa);
    })().catch((e) => console.error('[veículos especiais]', e));
    return () => { vivo = false; for (const c of feitos) c.dispose(); };
  }, []);

  const pista = useMemo(() => {
    const tex = texturaPista();
    const lado = new THREE.MeshStandardMaterial({ color: '#2d2e31', roughness: 0.95 });
    const topo = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const geos = PISTAS.map((q) => new THREE.BoxGeometry(q.largura, 8, q.comprimento));
    return { geos, mats: [lado, lado, topo, lado, lado, lado], tex };
  }, []);
  useEffect(() => () => { pista.geos.forEach((g) => g.dispose()); pista.tex.dispose(); new Set(pista.mats).forEach((m) => m.dispose()); }, [pista]);
  const rotorGeo = useMemo(() => new THREE.CircleGeometry(1, 28).rotateX(-Math.PI / 2), []);
  const rotorMat = useMemo(() => new THREE.MeshBasicMaterial({ map: texturaRotor(), transparent: true, depthWrite: false, side: THREE.DoubleSide }), []);
  const luzGeo = useMemo(() => new THREE.SphereGeometry(0.5, 6, 4), []);
  const luzMat = useMemo(() => new THREE.MeshBasicMaterial({ toneMapped: false }), []);
  const feixeGeo = useMemo(() => new THREE.CylinderGeometry(0.4, 1, 1, 14, 1, true).translate(0, -0.5, 0), []);
  const feixeMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#fff4c8', transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false }), []);
  const refRotor = useRef<THREE.InstancedMesh>(null), refLuz = useRef<THREE.InstancedMesh>(null), refFeixe = useRef<THREE.InstancedMesh>(null);
  useEffect(() => () => { rotorGeo.dispose(); rotorMat.map?.dispose(); rotorMat.dispose(); luzGeo.dispose(); luzMat.dispose(); feixeGeo.dispose(); feixeMat.dispose(); }, [rotorGeo, rotorMat, luzGeo, luzMat, feixeGeo, feixeMat]);

  const E = useRef({ relogio: 0, helis: [] as HeliOc[], proxId: 1, rng: 4242 });
  const T = useMemo(() => ({ p: novaPosicao(), m: new THREE.Matrix4(), q: new THREE.Quaternion(), v: new THREE.Vector3(), s: new THREE.Vector3(), c: new THREE.Color(), dir: new THREE.Vector3(), fw: new THREE.Vector3(), eixo: new THREE.Vector3(0, -1, 0), e: new THREE.Euler(0, 0, 0, 'YXZ') }), []);
  const stats = useRef({ detalhe: 0, silhueta: 0, ativos: 0, emissores: 0, msCpu: 0 });

  // dev: window.__n27esp — estado, estatísticas de LOD e validação das rotas contra o relevo
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as unknown as { __n27esp: unknown }).__n27esp = {
      stats: stats.current,
      depuracao,
      relogio: () => E.current.relogio,
      alt: (x: number, z: number) => sampleHeight(hm, x, z),
      saltar: (s: number) => { E.current.relogio += s; },
      cron,
      rotas,
      /** altura do terreno em cada waypoint (rotas de mar devem dar ≤ 0; pistas, ~terra) */
      validar: () => Object.fromEntries(Object.entries(ESPECIAIS.rotas).map(([id, r]) => [id, r.pontos.map(([la, lo]) => { const [x, z] = projetarRio(la, lo); return +sampleHeight(hm, x, z).toFixed(1); })])),
      helis: E.current.helis,
      /** rotas de mar: quantos pontos amostrados caem em terra (altura > -1 m) e onde */
      terraNaRota: (id: string) => { const r = rotas[id]; const out: string[] = []; for (let i = 0; i < r.x.length; i++) { const h = sampleHeight(hm, r.x[i], r.z[i]); if (h > -1) out.push(`${i}:${r.x[i].toFixed(0)},${r.z[i].toFixed(0)} h=${h.toFixed(1)}`); } return out; },
      /** água mais perto de (lat, lon) até `raio` m: devolve lat/lon e a profundidade */
      aguaPerto: (lat: number, lon: number, raio = 1500) => { const [x0, z0] = projetarRio(lat, lon); let melhor: [number, number, number] | null = null; for (let r = 0; r <= raio; r += 20) for (let a = 0; a < 6.283; a += 0.2) { const x = x0 + Math.cos(a) * r, z = z0 + Math.sin(a) * r; const h = sampleHeight(hm, x, z); if (h < -3) { const ok = [60, -60].every((d) => sampleHeight(hm, x + d, z) < -1 && sampleHeight(hm, x, z + d) < -1); if (ok) return [x, z, h, r]; if (!melhor) melhor = [x, z, h]; } } return melhor; },
    };
  });

  useFrame((_, dtReal) => {
    if (!conjuntos) return;
    const t0 = performance.now();
    const e = E.current, g = useGame.getState();
    const dt = Math.min(0.05, dtReal) * (g.velocidade > 0 ? 1 : 0);
    e.relogio += dt;
    const { p, m, q, v, s, c, dir, fw } = T;
    const cam = camera.position;
    camera.getWorldDirection(fw);
    const hora = ambiente.hora, noite = ambiente.noite;
    for (const cj of conjuntos.values()) cj.inicio();
    const rotores: { x: number; y: number; z: number; r: number; giro: number }[] = [];
    const luzes: { x: number; y: number; z: number; cor: string }[] = [];
    const emissores: Emissor[] = [];
    let ativos = 0, feixes = 0;
    const t = e.relogio;

    const desenha = (f: DefFrota, i: number, idBase: number) => {
      const modelo = f.modelos[i % f.modelos.length];
      const cj = conjuntos.get(chave(modelo, f.tint));
      if (!cj) return;
      const d = ESPECIAIS.modelos[modelo];
      const ar = cron[ESPECIAIS.frotas.indexOf(f)].rotas[0].tipo === 'ar';
      const gy = Math.max(0, sampleHeight(hm, p.x, p.z));
      let y: number, pitch = p.pitch, roll = p.roll;
      if (ar) y = p.alt <= 2 ? (naPista(p.x, p.z) ? TOPO_PISTA : gy) : gy + (Math.max(p.alt, gy + 25) - gy) * depuracao.alturaK;
      else { y = -0.25 + Math.sin(t * 1.3 + i * 1.7) * 0.12; pitch = p.pitch * 0.2 + Math.sin(t * 0.9 + i) * 0.015; roll = Math.sin(t * 1.1 + i * 2.1) * 0.03; if (p.parado) roll *= 0.4; }
      const dist = Math.hypot(p.x - cam.x, y - cam.y, p.z - cam.z);
      if (dist > MAX_LONGE) return;
      const det = cj.poe(p.x, y, p.z, p.yaw, pitch, roll, dist);
      ativos++;
      // luzes de navegação à noite/entardecer: vermelho (esq.), verde (dir.), pisca branco/vermelho
      if (det || dist < 6000) {
        if (noite > 0.15 || hora < 6 || hora > 18) {
          const w = cj.modelo.tam.x * 0.5, h = cj.modelo.tam.y;
          const sy = Math.sin(p.yaw), cy = Math.cos(p.yaw);
          const aeronave = d.lod !== 'caixa';
          const wx = aeronave ? w : w * 0.8, wy = aeronave ? h * 0.35 : h * 0.5;
          luzes.push({ x: p.x - cy * wx, y: y + wy, z: p.z + sy * wx, cor: '#ff2a2a' });
          luzes.push({ x: p.x + cy * wx, y: y + wy, z: p.z - sy * wx, cor: '#25ff6a' });
          if (Math.sin(t * 6 + i * 3) > 0.7) luzes.push({ x: p.x, y: y + h * 0.9, z: p.z, cor: aeronave ? '#ffffff' : '#ffd070' });
        }
      }
      if (d.rotor && det) rotores.push({ x: p.x + Math.sin(p.yaw) * d.rotor.z * d.comprimentoM, y: y + d.rotor.y * cj.modelo.tam.y, z: p.z + Math.cos(p.yaw) * d.rotor.z * d.comprimentoM, r: d.rotor.raio, giro: t * 28 + i });
      if (dist < 4500) emissores.push({ id: idBase + i, x: p.x, y, z: p.z, tipo: f.som });
    };

    for (let fi = 0; fi < ESPECIAIS.frotas.length; fi++) {
      const f = ESPECIAIS.frotas[fi];
      if (hora < f.horario[0] || hora >= f.horario[1]) continue;
      for (let i = 0; i < f.quantidade; i++) {
        posicaoDoVeiculo(cron[fi], i, t, p);
        if (p.ativo) desenha(f, i, 1000 + fi * 100);
      }
    }

    // helicópteros que respondem às ocorrências (cenas perto da câmera, Fase 26)
    const helis = e.helis;
    for (const cena of cenas) {
      for (const def of ESPECIAIS.ocorrencias.helis) {
        if (!def.tipos.includes(cena.oc.tipo) || cena.oc.gravidade < def.gravidadeMin) continue;
        if (helis.some((h) => h.cena === cena.id && h.def.id === def.id)) continue;
        const [bx, bz] = projetarRio(def.base[0], def.base[1]);
        helis.push({ cena: cena.id, def, x: bx, y: 60, z: bz, yaw: 0, ang: Math.atan2(bz - cena.z, bx - cena.x), estado: 'indo', vida: 0, id: e.proxId++ });
      }
    }
    for (let k = helis.length - 1; k >= 0; k--) {
      const h = helis[k];
      const cena = cenas.find((c) => c.id === h.cena);
      if (!cena && h.estado !== 'volta') h.estado = 'volta';
      h.vida += dt;
      const gy = Math.max(0, sampleHeight(hm, h.x, h.z));
      let alvoX: number, alvoZ: number;
      if (h.estado === 'volta') { [alvoX, alvoZ] = projetarRio(h.def.base[0], h.def.base[1]); }
      else { alvoX = cena!.x + Math.cos(h.ang) * h.def.raio; alvoZ = cena!.z + Math.sin(h.ang) * h.def.raio; }
      const dx = alvoX - h.x, dz = alvoZ - h.z, dd = Math.hypot(dx, dz);
      let roll = 0;
      if (h.estado === 'orbita') {
        h.ang += (h.def.velocidade * 0.5 / h.def.raio) * dt;
        const nx = cena!.x + Math.cos(h.ang) * h.def.raio, nz = cena!.z + Math.sin(h.ang) * h.def.raio;
        h.yaw = Math.atan2(nx - h.x, nz - h.z) || h.yaw; h.x = nx; h.z = nz; roll = -0.22;
      } else {
        const passo = Math.min(dd, h.def.velocidade * dt);
        if (dd > 1) { h.x += (dx / dd) * passo; h.z += (dz / dd) * passo; h.yaw = Math.atan2(dx, dz); }
        if (h.estado === 'indo' && dd < h.def.raio * 0.6) h.estado = 'orbita';
        if (h.estado === 'volta' && dd < 60) { helis.splice(k, 1); continue; }
      }
      const alvoY = h.estado === 'volta' && dd < 400 ? Math.max(gy + 15, 25) : Math.max(gy, cena ? Math.max(0, sampleHeight(hm, cena.x, cena.z)) : gy) + h.def.altura;
      h.y += Math.max(-14, Math.min(14, alvoY - h.y)) * Math.min(1, dt * 1.5);
      const cj = conjuntos.get(chave(h.def.modelo));
      if (!cj) continue;
      const dist = Math.hypot(h.x - cam.x, h.y - cam.y, h.z - cam.z);
      const dm = ESPECIAIS.modelos[h.def.modelo];
      const det = cj.poe(h.x, h.y, h.z, h.yaw, 0.05, roll, dist);
      ativos++;
      if (dm.rotor && det) rotores.push({ x: h.x + Math.sin(h.yaw) * dm.rotor.z * dm.comprimentoM, y: h.y + dm.rotor.y * cj.modelo.tam.y, z: h.z + Math.cos(h.yaw) * dm.rotor.z * dm.comprimentoM, r: dm.rotor.raio, giro: t * 30 + h.id });
      if (Math.sin(t * 2.2 + h.id) > 0.6) luzes.push({ x: h.x, y: h.y + cj.modelo.tam.y * 0.5, z: h.z, cor: '#ff2a2a' });
      if (dist < 4500) emissores.push({ id: 80000 + h.id, x: h.x, y: h.y, z: h.z, tipo: 'helicoptero' });
      // holofote sobre a cena (de noite/entardecer)
      if (h.def.holofote && cena && (noite > 0.12 || hora < 6 || hora > 18) && refFeixe.current && feixes < refFeixe.current.instanceMatrix.count) {
        dir.set(cena.x - h.x, Math.max(0, sampleHeight(hm, cena.x, cena.z)) - h.y, cena.z - h.z);
        const len = dir.length();
        q.setFromUnitVectors(T.eixo, dir.normalize());
        m.compose(v.set(h.x, h.y - 1, h.z), q, s.set(len * 0.12, len, len * 0.12));
        refFeixe.current.setMatrixAt(feixes++, m);
      }
    }

    for (const cj of conjuntos.values()) cj.fim();
    const somaDet = [...conjuntos.values()].reduce((a, cj) => a + cj.ultimo.detalhe, 0), somaSil = [...conjuntos.values()].reduce((a, cj) => a + cj.ultimo.silhueta, 0);
    stats.current.detalhe = somaDet; stats.current.silhueta = somaSil; stats.current.ativos = ativos;

    // rotores, luzes e feixes
    const rm = refRotor.current, lm = refLuz.current, fm = refFeixe.current;
    if (rm) {
      let n = 0;
      for (const r of rotores) { if (n >= rm.instanceMatrix.count) break; T.e.set(0, r.giro, 0); q.setFromEuler(T.e); m.compose(v.set(r.x, r.y, r.z), q, s.set(r.r, 1, r.r)); rm.setMatrixAt(n++, m); }
      rm.count = n; rm.instanceMatrix.needsUpdate = true;
    }
    if (lm) {
      let n = 0;
      for (const l of luzes) { if (n >= lm.instanceMatrix.count) break; m.compose(v.set(l.x, l.y, l.z), q.identity(), s.set(1, 1, 1)); lm.setMatrixAt(n, m); lm.setColorAt(n, c.set(l.cor)); n++; }
      lm.count = n; lm.instanceMatrix.needsUpdate = true; if (lm.instanceColor) lm.instanceColor.needsUpdate = true;
    }
    if (fm) { fm.count = feixes; fm.instanceMatrix.needsUpdate = true; }

    // sirenes do Fase 26 também soam; as fontes mais perto ganham as vozes
    sirenes.forEach((si, k) => { if (Math.hypot(si.x - cam.x, si.z - cam.z) < 900) emissores.push({ id: 90000 + k, x: si.x, y: 2, z: si.z, tipo: 'sirene' }); });
    stats.current.emissores = emissores.length;
    audioEspacial.atualizar({ x: cam.x, y: cam.y, z: cam.z, fx: fw.x, fy: fw.y, fz: fw.z }, emissores);
    stats.current.msCpu += (performance.now() - t0 - stats.current.msCpu) * 0.05;
  });

  useEffect(() => () => audioEspacial.silenciar(), []);
  if (!conjuntos) return null;
  return (
    <group>
      {[...conjuntos.values()].map((cj, k) => <primitive key={k} object={cj.grupo} />)}
      {PISTAS.map((q, k) => <mesh key={q.id} geometry={pista.geos[k]} material={pista.mats} position={[q.x, TOPO_PISTA - 4, q.z]} rotation={[0, q.yaw, 0]} receiveShadow />)}
      <instancedMesh ref={refRotor} args={[rotorGeo, rotorMat, 24]} frustumCulled={false} renderOrder={6} />
      <instancedMesh ref={refLuz} args={[luzGeo, luzMat, 400]} frustumCulled={false} />
      <instancedMesh ref={refFeixe} args={[feixeGeo, feixeMat, 8]} frustumCulled={false} renderOrder={5} />
    </group>
  );
}
