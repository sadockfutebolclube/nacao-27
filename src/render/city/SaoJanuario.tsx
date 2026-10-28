/**
 * Estádio de São Januário e o campo de treino do Vasco da Gama (Fase 28), modelados a partir do contorno do OpenStreetMap
 * (`src/world/saoJanuario.ts`): arquibancada em anel com degraus (parte baixa preta, parte alta branca), muro externo com arcadas,
 * cobertura, quatro torres de refletor (acesas à noite), gramado listrado com marcações e traves, e o pórtico de entrada com a torre e a
 * Cruz de Malta. Procedural de propósito: os modelos gratuitos de estádio (Poly Pizza: "Football stadium", "Stadium Seats"…) são genéricos
 * e não acompanham o contorno real de 120 × 190 m. Os prédios do OSM sob o estádio deixam de ser desenhados (`pontosRio.ts`).
 */
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { mundo } from '../../sim/bridge';
import { projetar } from '../../world/cidadeReal';
import { geometriaSaoJanuario, type GeometriaSJ } from '../../world/saoJanuario';
import { sampleHeight, type Heightmap } from '../../world/terrain';
import { ambiente } from './ambiente';
import { IBGE_RIO } from './pontosRio';

const ALTURA = 21;
const LINHAS = 9;

function canvasTex(w: number, h: number, desenha: (g: CanvasRenderingContext2D) => void, repete = false): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  desenha(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  if (repete) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** gramado listrado de 105 × 68 m com as marcações (textura 2:3, ocupando o plano inteiro) */
function texturaCampo(treino = false): THREE.CanvasTexture {
  return canvasTex(512, 768, (g) => {
    for (let i = 0; i < 14; i++) { g.fillStyle = i % 2 ? '#3f8f3a' : '#47a141'; g.fillRect(0, (i * 768) / 14, 512, 768 / 14 + 1); }
    g.strokeStyle = '#f2f2ea'; g.lineWidth = 4;
    const m = 18; // margem do gramado até a linha
    g.strokeRect(m, m, 512 - 2 * m, 768 - 2 * m);
    if (treino) return;
    g.beginPath(); g.moveTo(m, 384); g.lineTo(512 - m, 384); g.stroke();
    g.beginPath(); g.arc(256, 384, 48, 0, Math.PI * 2); g.stroke();
    for (const y of [m, 768 - m]) {
      const s = y < 384 ? 1 : -1;
      g.strokeRect(256 - 130, y - (s < 0 ? 128 : 0), 260, 128);
      g.strokeRect(256 - 60, y - (s < 0 ? 44 : 0), 120, 44);
    }
  });
}

/** muro externo: arcadas creme sobre base escura */
function texturaMuro(): THREE.CanvasTexture {
  return canvasTex(256, 128, (g) => {
    g.fillStyle = '#e8e2d0'; g.fillRect(0, 0, 256, 128);
    g.fillStyle = '#3b3f46'; g.fillRect(0, 100, 256, 28);
    for (let i = 0; i < 4; i++) {
      const x = 8 + i * 62;
      g.fillStyle = '#4a4f57'; g.fillRect(x, 30, 46, 70); g.beginPath(); g.arc(x + 23, 30, 23, Math.PI, 0); g.fill();
      g.fillStyle = '#b9b3a0'; g.fillRect(x - 4, 22, 54, 4);
    }
    g.fillStyle = '#1a1a1d'; g.fillRect(0, 0, 256, 10);
  }, true);
}

/** Cruz de Malta do Vasco: escudo branco e cruz vermelha, com a faixa preta e branca */
function texturaFachada(): THREE.CanvasTexture {
  return canvasTex(512, 256, (g) => {
    g.fillStyle = '#f4f1e6'; g.fillRect(0, 0, 512, 256);
    g.fillStyle = '#1a1a1d'; g.fillRect(0, 0, 512, 34); g.fillRect(0, 222, 512, 34);
    g.fillStyle = '#ffffff';
    for (let i = 0; i < 16; i++) if (i % 2) g.fillRect(i * 32, 0, 32, 34);
    // cruz
    g.save(); g.translate(256, 128);
    g.fillStyle = '#d4202c';
    const braco = (a: number) => { g.save(); g.rotate(a); g.beginPath(); g.moveTo(-18, 0); g.lineTo(-36, -60); g.lineTo(36, -60); g.lineTo(18, 0); g.closePath(); g.fill(); g.restore(); };
    for (let k = 0; k < 4; k++) braco((k * Math.PI) / 2);
    g.fillStyle = '#f4f1e6'; g.beginPath(); g.arc(0, 0, 10, 0, Math.PI * 2); g.fill();
    g.restore();
    g.fillStyle = '#1a1a1d'; g.font = 'bold 26px sans-serif'; g.textAlign = 'center';
    g.fillText('CLUBE DE REGATAS VASCO DA GAMA', 256, 214);
  });
}

interface Cena { raiz: THREE.Group; luzes: THREE.MeshStandardMaterial[] }

function construir(G: GeometriaSJ, y0: number): Cena {
  const raiz = new THREE.Group();
  const luzes: THREE.MeshStandardMaterial[] = [];
  const [cx, cz] = G.centro;
  const n = G.contorno.length;
  const s = Math.sin(G.eixo), c = Math.cos(G.eixo);
  // contorno no referencial do estádio (u ao longo do eixo longo, v ao través)
  const local = G.contorno.map(([x, z]) => [(x - cx) * s + (z - cz) * c, (x - cx) * c - (z - cz) * s] as [number, number]);
  const A = 52.5 + 9, B = 34 + 9; // meio-campo + faixa de escape
  const interno = local.map(([u, v]) => {
    const d = Math.hypot(u, v) || 1, du = Math.abs(u / d), dv = Math.abs(v / d);
    const t = Math.pow(Math.pow(du / A, 6) + Math.pow(dv / B, 6), -1 / 6);
    const k = Math.min(t, d * 0.55);
    return [(u / d) * k, (v / d) * k] as [number, number];
  });
  const mundoXZ = (u: number, v: number): [number, number] => [cx + u * s + v * c, cz + u * c - v * s];

  // arquibancada: LINHAS fileiras do gramado até o muro, com degraus; cores por fileira (preto embaixo, branco em cima)
  const pos: number[] = [], cor: number[] = [], ind: number[] = [];
  const preto = new THREE.Color('#1c1c20'), branco = new THREE.Color('#ececec'), faixa = new THREE.Color('#d4202c');
  for (let k = 0; k <= LINHAS; k++) {
    const u = k / LINHAS;
    for (let i = 0; i < n; i++) {
      const [iu, iv] = interno[i], [ou, ov] = local[i];
      const t = Math.pow(u, 0.9);
      const [wx, wz] = mundoXZ(iu + (ou - iu) * t, iv + (ov - iv) * t);
      pos.push(wx, y0 + 1.2 + (ALTURA - 1.2) * Math.pow(u, 1.25), wz);
      const base = u < 0.5 ? preto : branco;
      const col = k === Math.round(LINHAS * 0.5) ? faixa : (i % 10 < 5 ? base : base.clone().lerp(u < 0.5 ? branco : preto, 0.35));
      cor.push(col.r, col.g, col.b);
    }
  }
  for (let k = 0; k < LINHAS; k++) for (let i = 0; i < n; i++) {
    const a = k * n + i, b = k * n + ((i + 1) % n), c2 = (k + 1) * n + i, d = (k + 1) * n + ((i + 1) % n);
    ind.push(a, c2, b, b, c2, d);
  }
  const gA = new THREE.BufferGeometry();
  gA.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  gA.setAttribute('color', new THREE.Float32BufferAttribute(cor, 3));
  gA.setIndex(ind); gA.computeVertexNormals();
  const bowl = new THREE.Mesh(gA, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide }));
  bowl.castShadow = bowl.receiveShadow = true;
  raiz.add(bowl);

  // muro externo (do chão à crista) com arcadas; uv.u pela distância percorrida no contorno
  const wp: number[] = [], wu: number[] = [], wi: number[] = [];
  let acc = 0;
  for (let i = 0; i <= n; i++) {
    const [x, z] = G.contorno[i % n];
    if (i > 0) { const [px, pz] = G.contorno[(i - 1) % n]; acc += Math.hypot(x - px, z - pz); }
    wp.push(x, y0 - 3, z, x, y0 + ALTURA + 1, z);
    wu.push(acc / 18, 1, acc / 18, 0);
  }
  for (let i = 0; i < n; i++) { const a = i * 2; wi.push(a, a + 1, a + 2, a + 2, a + 1, a + 3); }
  const gW = new THREE.BufferGeometry();
  gW.setAttribute('position', new THREE.Float32BufferAttribute(wp, 3));
  gW.setAttribute('uv', new THREE.Float32BufferAttribute(wu, 2));
  gW.setIndex(wi); gW.computeVertexNormals();
  const muro = new THREE.Mesh(gW, new THREE.MeshStandardMaterial({ map: texturaMuro(), roughness: 0.9, side: THREE.DoubleSide }));
  muro.castShadow = muro.receiveShadow = true;
  raiz.add(muro);

  // cobertura: anel de laje sobre as fileiras de cima (do muro até 42% do caminho para dentro)
  const rp: number[] = [], ri: number[] = [];
  for (let i = 0; i < n; i++) {
    const [ou, ov] = local[i], [iu, iv] = interno[i];
    const [ax, az] = mundoXZ(ou, ov), [bx, bz] = mundoXZ(ou + (iu - ou) * 0.42, ov + (iv - ov) * 0.42);
    rp.push(ax, y0 + ALTURA + 1.2, az, bx, y0 + ALTURA - 1.8, bz);
  }
  for (let i = 0; i < n; i++) { const a = i * 2, b = ((i + 1) % n) * 2; ri.push(a, a + 1, b, b, a + 1, b + 1); }
  const gR = new THREE.BufferGeometry();
  gR.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3));
  gR.setIndex(ri); gR.computeVertexNormals();
  const teto = new THREE.Mesh(gR, new THREE.MeshStandardMaterial({ color: '#d6d8dc', roughness: 0.7, metalness: 0.15, side: THREE.DoubleSide }));
  teto.castShadow = true;
  raiz.add(teto);

  // base: laje de concreto sob o estádio inteiro (cobre as diferenças do relevo)
  const shape = new THREE.Shape(G.contorno.map(([x, z]) => new THREE.Vector2(x, z)));
  const laje = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshStandardMaterial({ color: '#8d8f93', roughness: 0.95, side: THREE.DoubleSide }));
  laje.rotation.x = Math.PI / 2; laje.position.y = y0 + 0.9;
  // ShapeGeometry fica no plano XY: depois de girar, (x, y) → (x, z=−y)... compensa espelhando z
  laje.scale.set(1, -1, 1);
  raiz.add(laje);

  // gramado
  const campo = new THREE.Mesh(new THREE.PlaneGeometry(68, 105), new THREE.MeshStandardMaterial({ map: texturaCampo(), roughness: 0.95 }));
  campo.rotation.set(-Math.PI / 2, 0, 0);
  const grupoCampo = new THREE.Group();
  grupoCampo.add(campo);
  // traves
  const trave = new THREE.MeshStandardMaterial({ color: '#f2f2f2', roughness: 0.5 });
  for (const sz of [-1, 1]) {
    const gp = new THREE.Group();
    for (const lado of [-1, 1]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.44, 6), trave); p.position.set(lado * 3.66, 1.22, 0); gp.add(p); }
    const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 7.32, 6), trave); tr.rotation.z = Math.PI / 2; tr.position.y = 2.44; gp.add(tr);
    gp.position.set(0, 0, sz * 52.5 * 0.97); grupoCampo.add(gp);
  }
  grupoCampo.position.set(cx, y0 + 1.25, cz);
  grupoCampo.rotation.y = G.eixo + Math.PI / 2; // PlaneGeometry(68, 105): comprimento ao longo de z local depois de girar
  raiz.add(grupoCampo);

  // torres de refletor nos quatro cantos (fora do muro)
  const aco = new THREE.MeshStandardMaterial({ color: '#8c9096', roughness: 0.5, metalness: 0.5 });
  const lampada = new THREE.MeshStandardMaterial({ color: '#fffbe8', emissive: '#fff2b0', emissiveIntensity: 0, roughness: 0.4 });
  luzes.push(lampada);
  const hu = G.compr / 2 + 8, hv = G.larg / 2 + 8;
  for (const [su, sv] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const [tx, tz] = mundoXZ(su * hu * 0.86, sv * hv * 0.9);
    const torre = new THREE.Group();
    const mastro = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.9, 40, 8), aco); mastro.position.y = 20; mastro.castShadow = true; torre.add(mastro);
    const painel = new THREE.Mesh(new THREE.BoxGeometry(9, 5.2, 0.8), lampada); painel.position.y = 41.5; torre.add(painel);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(9.6, 0.5, 1.4), aco); arm.position.y = 38.8; torre.add(arm);
    torre.position.set(tx, y0 - 1, tz);
    torre.rotation.y = Math.atan2(cx - tx, cz - tz);
    raiz.add(torre);
  }

  // pórtico de entrada na extremidade sul do eixo longo (o lado do contorno com z maior): corpo creme, torre central e a Cruz de Malta
  const [px, pz] = mundoXZ(-G.compr / 2 * Math.sign(c || 1) - 3 * Math.sign(c || 1), 0);
  const portico = new THREE.Group();
  const creme = new THREE.MeshStandardMaterial({ color: '#efe9d8', roughness: 0.9 });
  const corpo = new THREE.Mesh(new THREE.BoxGeometry(46, 13, 9), creme); corpo.position.y = 6.5; corpo.castShadow = corpo.receiveShadow = true; portico.add(corpo);
  const torreC = new THREE.Mesh(new THREE.BoxGeometry(9, 30, 9), creme); torreC.position.y = 15; torreC.castShadow = true; portico.add(torreC);
  const telhado = new THREE.Mesh(new THREE.ConeGeometry(7.2, 7, 4), new THREE.MeshStandardMaterial({ color: '#a33a2a', roughness: 0.8 })); telhado.position.y = 33.5; telhado.rotation.y = Math.PI / 4; portico.add(telhado);
  const letreiro = new THREE.Mesh(new THREE.PlaneGeometry(30, 7.5), new THREE.MeshStandardMaterial({ map: texturaFachada(), roughness: 0.8 }));
  letreiro.position.set(0, 7.4, 4.6); portico.add(letreiro);
  const escudo = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 6.4), new THREE.MeshStandardMaterial({ map: texturaFachada(), roughness: 0.8 }));
  escudo.position.set(0, 24, 4.6); portico.add(escudo);
  portico.position.set(px, y0 - 0.5, pz);
  portico.rotation.y = G.eixo + (c >= 0 ? Math.PI : 0);
  raiz.add(portico);

  // campo de treino, campo auxiliar e quadra de tênis
  G.treino.forEach((t, k) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(t.larg, t.compr), new THREE.MeshStandardMaterial({ map: texturaCampo(true), color: k === 2 ? '#c4573b' : '#ffffff', roughness: 0.95 }));
    m.rotation.set(-Math.PI / 2, 0, 0);
    const g = new THREE.Group(); g.add(m); g.position.set(t.x, y0 + 0.35, t.z); g.rotation.y = t.yaw + Math.PI / 2;
    raiz.add(g);
  });
  return { raiz, luzes };
}

export function SaoJanuario({ hm }: { hm: Heightmap }) {
  const real = mundo.real;
  const cena = useMemo<Cena | null>(() => {
    if (!real || real.ibge !== IBGE_RIO) return null;
    const G = geometriaSaoJanuario((la, lo) => projetar(real, la, lo));
    // o estádio assenta na cota média do contorno
    let soma = 0;
    for (const [x, z] of G.contorno) soma += Math.max(0, sampleHeight(hm, x, z));
    return construir(G, soma / G.contorno.length);
  }, [real, hm]);
  const luzes = useRef<THREE.MeshStandardMaterial[]>([]);
  luzes.current = cena?.luzes ?? [];
  useEffect(() => () => {
    cena?.raiz.traverse((o) => { if (o instanceof THREE.Mesh) { o.geometry.dispose(); const m = o.material as THREE.Material | THREE.Material[]; (Array.isArray(m) ? m : [m]).forEach((x) => { (x as THREE.MeshStandardMaterial).map?.dispose(); x.dispose(); }); } });
  }, [cena]);
  useFrame(() => { for (const m of luzes.current) m.emissiveIntensity = ambiente.noite * 3; });
  return cena ? <primitive object={cena.raiz} /> : null;
}
