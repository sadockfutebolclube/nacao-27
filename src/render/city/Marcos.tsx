/**
 * Marcos 3D do Rio (Fase 15), modelados no código e postos nas coordenadas reais: Cristo Redentor (com a
 * escala exagerada para ser visto do alto), bondinho do Pão de Açúcar com as cabines em movimento, Maracanã,
 * Arcos da Lapa, Museu do Amanhã e a Catedral Metropolitana. Só no Rio.
 */
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { mundo } from '../../sim/bridge';
import { projetar } from '../../world/cidadeReal';
import { sampleHeight, type Heightmap } from '../../world/terrain';
import { ambiente } from './ambiente';
import { ancoraMarco, IBGE_RIO, LATLON } from './pontosRio';

/** o Cristo tem 38 m; numa cidade de 12 km ele some, então aparece 1,7× maior */
const ESCALA_CRISTO = 1.7;

const mat = (cor: string, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) => new THREE.MeshStandardMaterial({ color: cor, roughness: 0.8, ...extra });

function malha(g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const o = new THREE.Mesh(g, m);
  o.position.set(x, y, z);
  o.castShadow = o.receiveShadow = true;
  return o;
}

// ── Cristo Redentor ──────────────────────────────────────────────────────────────

function cristo(materiais: { pedra: THREE.Material; estatua: THREE.Material }): THREE.Group {
  const g = new THREE.Group();
  // pedestal em dois degraus de pedra
  g.add(malha(new THREE.BoxGeometry(10, 4, 10), materiais.pedra, 0, 2, 0));
  g.add(malha(new THREE.BoxGeometry(6.4, 4, 6.4), materiais.pedra, 0, 6, 0));
  // túnica: tronco que afina para cima, com a barra mais aberta
  g.add(malha(new THREE.CylinderGeometry(2.1, 3.3, 22, 14), materiais.estatua, 0, 19, 0));
  g.add(malha(new THREE.CylinderGeometry(3.1, 3.7, 3, 14), materiais.estatua, 0, 9.5, 0));
  // braços abertos (28 m de ponta a ponta), um pouco mais finos nas mãos
  g.add(malha(new THREE.BoxGeometry(24, 2.7, 2.5), materiais.estatua, 0, 26.6, 0));
  for (const lado of [-1, 1]) g.add(malha(new THREE.BoxGeometry(5, 1.9, 1.9), materiais.estatua, lado * 13.4, 26.6, 0));
  // cabeça e pescoço
  g.add(malha(new THREE.CylinderGeometry(1.2, 1.4, 1.8, 10), materiais.estatua, 0, 30.2, 0));
  g.add(malha(new THREE.SphereGeometry(1.95, 14, 10), materiais.estatua, 0, 32.4, 0));
  return g;
}

// ── Bondinho do Pão de Açúcar ────────────────────────────────────────────────────

interface Bondinho { grupo: THREE.Group; pontos: THREE.Vector3[]; cabines: { m: THREE.Mesh; seg: number; inverso: boolean }[] }

function bondinho(hm: Heightmap, c: NonNullable<typeof mundo.real>): Bondinho {
  const g = new THREE.Group();
  const alturaEm = (x: number, z: number) => Math.max(0, sampleHeight(hm, x, z));
  const base = (ll: readonly [number, number], sobe: number) => { const [x, z] = projetar(c, ll[0], ll[1]); return new THREE.Vector3(x, alturaEm(x, z) + sobe, z); };
  const pontos = [base(LATLON.bondinhoA, 16), base(LATLON.bondinhoUrca, 9), base(LATLON.bondinhoPao, 9)];
  const cabo = mat('#3a3d40', { metalness: 0.6, roughness: 0.4 });
  const estacao = mat('#d9d6cd');
  for (let i = 0; i < pontos.length - 1; i++) {
    const a = pontos[i], b = pontos[i + 1];
    const d = b.clone().sub(a);
    const cil = malha(new THREE.CylinderGeometry(0.12, 0.12, d.length(), 5), cabo);
    cil.position.copy(a).addScaledVector(d, 0.5);
    cil.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize());
    cil.castShadow = false;
    g.add(cil);
  }
  for (const p of pontos) g.add(malha(new THREE.BoxGeometry(14, 7, 10), estacao, p.x, p.y - 4, p.z));
  // duas cabines por trecho, em sentidos opostos
  const cab = new THREE.BoxGeometry(5.5, 3.4, 3.4);
  const vermelho = mat('#d8352b'), branco = mat('#f1f0ec');
  const cabines: Bondinho['cabines'] = [];
  for (let seg = 0; seg < pontos.length - 1; seg++) for (const inverso of [false, true]) {
    const m = new THREE.Group();
    m.add(malha(cab, vermelho, 0, -2.6, 0));
    m.add(malha(new THREE.BoxGeometry(5.6, 0.7, 3.5), branco, 0, -1.2, 0));
    g.add(m);
    cabines.push({ m: m as unknown as THREE.Mesh, seg, inverso });
  }
  return { grupo: g, pontos, cabines };
}

// ── Maracanã ─────────────────────────────────────────────────────────────────────

/** Faixa inclinada entre duas elipses concêntricas (arquibancada, teto): (a, b, y) de dentro e de fora. */
function faixaElipse(a0: number, b0: number, y0: number, a1: number, b1: number, y1: number, seg = 96): THREE.BufferGeometry {
  const pos: number[] = [], idx: number[] = [];
  for (let i = 0; i <= seg; i++) {
    const t = (i / seg) * Math.PI * 2, c = Math.cos(t), s = Math.sin(t);
    pos.push(a0 * c, y0, b0 * s, a1 * c, y1, b1 * s);
  }
  for (let i = 0; i < seg; i++) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Parede vertical numa elipse, de y0 a y1, com a normal para fora. */
function paredeElipse(a: number, b: number, y0: number, y1: number, seg = 96): THREE.BufferGeometry {
  const pos: number[] = [], nor: number[] = [], idx: number[] = [];
  for (let i = 0; i <= seg; i++) {
    const t = (i / seg) * Math.PI * 2, c = Math.cos(t), s = Math.sin(t);
    const nx = c / a, nz = s / b, l = Math.hypot(nx, nz);
    pos.push(a * c, y0, b * s, a * c, y1, b * s);
    nor.push(nx / l, 0, nz / l, nx / l, 0, nz / l);
  }
  for (let i = 0; i < seg; i++) { const k = i * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
}

function texturaGramado(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 330;
  const x = c.getContext('2d')!;
  for (let k = 0; k < 14; k++) { x.fillStyle = k % 2 ? '#3f8c3a' : '#4a9a44'; x.fillRect((c.width / 14) * k, 0, c.width / 14 + 1, c.height); }
  x.strokeStyle = '#eef3e6'; x.lineWidth = 3;
  x.strokeRect(6, 6, c.width - 12, c.height - 12);
  x.beginPath(); x.moveTo(c.width / 2, 6); x.lineTo(c.width / 2, c.height - 6); x.stroke();
  x.beginPath(); x.arc(c.width / 2, c.height / 2, 44, 0, Math.PI * 2); x.stroke();
  for (const lado of [0, 1]) { const px = lado ? c.width - 6 : 6, dir = lado ? -1 : 1; x.strokeRect(lado ? px - 84 : px, c.height / 2 - 100, 84, 200); x.strokeRect(lado ? px - 28 : px, c.height / 2 - 44, 28, 88); void dir; }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function maracana(): THREE.Group {
  const g = new THREE.Group();
  const concreto = mat('#cfcbc2'), arquib = mat('#4f6f93', { roughness: 0.7 }), teto = mat('#c9cac5', { roughness: 0.85, side: THREE.DoubleSide });
  const a = 150, b = 128;
  // parede externa, do chão (enterrada) até a borda
  g.add(malha(paredeElipse(a, b, -8, 27), concreto));
  // anel de arquibancada: desce da borda externa para o gramado
  g.add(malha(faixaElipse(a - 3, b - 3, 27, 78, 58, 3), arquib));
  const arq2 = faixaElipse(a - 3, b - 3, 27, 78, 58, 3);
  arq2.scale(1, 1, 1);
  // teto em anel, mais alto na ponta externa e vazado no meio
  g.add(malha(faixaElipse(a + 8, b + 8, 30, 92, 72, 25), teto));
  g.add(malha(paredeElipse(a + 8, b + 8, 28, 31), teto));
  // gramado 105 × 68 m
  const campo = malha(new THREE.PlaneGeometry(105, 68).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: texturaGramado(), roughness: 0.9 }), 0, 3.2, 0);
  campo.castShadow = false;
  g.add(campo);
  // pistas de acesso ao redor (rampas) para o estádio não flutuar
  g.add(malha(faixaElipse(a, b, -2, a + 22, b + 22, 0), mat('#a9a69e')));
  return g;
}

// ── Arcos da Lapa ────────────────────────────────────────────────────────────────

function arcos(comprimento: number): THREE.Group {
  const g = new THREE.Group();
  const H = 17.6, esp = 4.6;
  // elevação do aqueduto (u ao longo, v em altura) com os arcos como furos: 27 embaixo, 20 menores em cima
  const forma = new THREE.Shape();
  forma.moveTo(-comprimento / 2, 0); forma.lineTo(comprimento / 2, 0); forma.lineTo(comprimento / 2, H); forma.lineTo(-comprimento / 2, H); forma.closePath();
  const arco = (cx: number, semi: number, mola: number) => {
    const p = new THREE.Path();
    p.moveTo(cx - semi, 0); p.lineTo(cx - semi, mola);
    p.absarc(cx, mola, semi, Math.PI, 0, true);
    p.lineTo(cx + semi, 0); p.closePath();
    return p;
  };
  const nBaixo = 27, vao = comprimento / nBaixo;
  for (let i = 0; i < nBaixo; i++) { const p = arco(-comprimento / 2 + vao * (i + 0.5), vao * 0.36, 6.4); forma.holes.push(p); }
  const nAlto = 20, vaoAlto = comprimento / nAlto;
  for (let i = 0; i < nAlto; i++) {
    const cx = -comprimento / 2 + vaoAlto * (i + 0.5), semi = vaoAlto * 0.3, mola = 13.2;
    const p = new THREE.Path();
    p.moveTo(cx - semi, 11.6); p.lineTo(cx - semi, mola);
    p.absarc(cx, mola, semi, Math.PI, 0, true);
    p.lineTo(cx + semi, 11.6); p.closePath();
    forma.holes.push(p);
  }
  const geo = new THREE.ExtrudeGeometry(forma, { depth: esp, bevelEnabled: false });
  geo.translate(0, 0, -esp / 2);
  // a forma está no plano (u, v) → u vira Z (ao longo do aqueduto), v vira Y
  geo.rotateY(Math.PI / 2);
  g.add(malha(geo, mat('#e9e2d1', { roughness: 0.9 })));
  // trilho do bondinho de Santa Teresa por cima
  g.add(malha(new THREE.BoxGeometry(2.6, 0.5, comprimento), mat('#3b3b3d'), 0, H + 0.25, 0));
  return g;
}

// ── Museu do Amanhã ──────────────────────────────────────────────────────────────

function museuDoAmanha(comprimento: number, largura: number): THREE.Group {
  const g = new THREE.Group();
  // píer de concreto (a cota do chão aqui é o mar: o píer cria o terreno)
  g.add(malha(new THREE.BoxGeometry(comprimento, 3.4, largura), mat('#a9a69e'), 0, 0.5, 0));
  const branco = mat('#f4f4f1', { roughness: 0.55 }), vidro = mat('#7d98ab', { metalness: 0.3, roughness: 0.2 });
  // corpo baixo e comprido
  g.add(malha(new THREE.BoxGeometry(comprimento * 0.46, 11, largura * 0.62), branco, 0, 7.7, 0));
  g.add(malha(new THREE.BoxGeometry(comprimento * 0.46 + 0.4, 3.2, largura * 0.62 - 6), vidro, 0, 6.4, 0));
  // as duas asas-painel em balanço, levantadas nas pontas
  for (const lado of [-1, 1]) {
    const asa = malha(new THREE.BoxGeometry(comprimento * 0.27, 0.9, largura * 0.7), branco, lado * comprimento * 0.36, 16.5, 0);
    asa.rotation.z = lado * -0.16;
    g.add(asa);
    for (let k = 0; k < 6; k++) g.add(malha(new THREE.BoxGeometry(0.6, 6, largura * 0.62), branco, lado * (comprimento * 0.25 + k * comprimento * 0.045), 12.5, 0));
  }
  return g;
}

// ── Catedral Metropolitana ───────────────────────────────────────────────────────

function catedral(): THREE.Group {
  const g = new THREE.Group();
  const concreto = mat('#b9b4a8', { roughness: 0.9 });
  g.add(malha(new THREE.CylinderGeometry(15, 50, 82, 28, 1, true), concreto, 0, 41, 0));
  g.add(malha(new THREE.CircleGeometry(15, 24).rotateX(-Math.PI / 2), mat('#8d8a82'), 0, 82, 0));
  // quatro faixas de vitral verticais, do chão ao topo
  const cores = ['#3d7fd1', '#d94a3a', '#e6b72e', '#3fa066'];
  cores.forEach((cor, k) => {
    const v = malha(new THREE.PlaneGeometry(5, 82), mat(cor, { emissive: cor, emissiveIntensity: 0.25, side: THREE.DoubleSide }), 0, 0, 0);
    const ang = (k / 4) * Math.PI * 2 + Math.PI / 4, r = 32.5;
    v.position.set(Math.cos(ang) * r, 41, Math.sin(ang) * r);
    v.rotation.y = -ang + Math.PI / 2;
    v.rotation.x = Math.atan2(35, 82) * 0; // cone fino: o plano fica quase vertical
    g.add(v);
  });
  return g;
}

// ── componente ───────────────────────────────────────────────────────────────────

export function Marcos({ hm }: { hm: Heightmap }) {
  const real = mundo.real;
  const grupoNoite = useRef<THREE.MeshStandardMaterial[]>([]);
  const cabinesRef = useRef<Bondinho | null>(null);

  const cena = useMemo(() => {
    if (!real || real.ibge !== IBGE_RIO) return null;
    const raiz = new THREE.Group();
    const solo = (x: number, z: number, raio = 0) => {
      let m = Infinity;
      for (const [dx, dz] of [[0, 0], [raio, 0], [-raio, 0], [0, raio], [0, -raio]]) m = Math.min(m, Math.max(0, sampleHeight(hm, x + dx, z + dz)));
      return m;
    };

    // Cristo Redentor, olhando para o leste (a baía)
    const [cx, cz] = projetar(real, ...LATLON.cristo);
    const pedra = mat('#8a857b'), estatua = mat('#b9c3bb', { roughness: 0.75, emissive: '#fff1cf', emissiveIntensity: 0 });
    grupoNoite.current = [estatua];
    const cr = cristo({ pedra, estatua });
    cr.scale.setScalar(ESCALA_CRISTO);
    cr.position.set(cx, solo(cx, cz, 4) - 0.5, cz);
    cr.rotation.y = Math.PI / 2;
    raiz.add(cr);

    // bondinho
    const bd = bondinho(hm, real);
    raiz.add(bd.grupo);
    cabinesRef.current = bd;

    // Maracanã
    const [mx, mz] = projetar(real, ...LATLON.maracana);
    const ma = maracana();
    ma.position.set(mx, solo(mx, mz, 120), mz);
    ma.rotation.y = 0.35;
    raiz.add(ma);

    // Arcos da Lapa (no lugar do prédio do OSM, na mesma orientação)
    const arc = ancoraMarco(real, 'Arcos da Lapa');
    if (arc) {
      const A = arcos(Math.min(280, Math.max(200, arc.d)));
      const dz = Math.min(280, Math.max(200, arc.d)) / 2;
      let baixo = Infinity;
      for (const t of [-1, -0.5, 0, 0.5, 1]) baixo = Math.min(baixo, Math.max(0, sampleHeight(hm, arc.x + Math.sin(arc.angle) * dz * t, arc.z + Math.cos(arc.angle) * dz * t)));
      A.position.set(arc.x, baixo - 0.6, arc.z);
      A.rotation.y = arc.angle;
      raiz.add(A);
    }

    // Museu do Amanhã (no píer do OSM: a maior dimensão do prédio vira o comprimento)
    const mu = ancoraMarco(real, 'Museu do Amanhã');
    if (mu) {
      const M = museuDoAmanha(mu.w, Math.min(mu.d, 52));
      M.position.set(mu.x, 1.4, mu.z);
      M.rotation.y = mu.angle;
      raiz.add(M);
    }

    // Catedral Metropolitana
    const ca = ancoraMarco(real, 'Catedral de São Sebastião');
    if (ca) {
      const C = catedral();
      C.position.set(ca.x, solo(ca.x, ca.z, 30), ca.z);
      raiz.add(C);
    }
    return raiz;
  }, [real, hm]);

  useEffect(() => () => {
    cena?.traverse((o) => { if (o instanceof THREE.Mesh) { o.geometry.dispose(); const m = o.material as THREE.Material | THREE.Material[]; (Array.isArray(m) ? m : [m]).forEach((x) => x.dispose()); } });
  }, [cena]);

  useFrame(() => {
    // Cristo iluminado à noite
    for (const m of grupoNoite.current) m.emissiveIntensity = ambiente.noite * 0.9;
    // cabines do bondinho: 90 s ida e volta em cada trecho
    const bd = cabinesRef.current;
    if (!bd) return;
    const t = (ambiente.tempo % 90) / 90;
    const f = t < 0.5 ? t * 2 : 2 - t * 2; // 0 → 1 → 0
    for (const c of bd.cabines) {
      const u = c.inverso ? 1 - f : f;
      const a = bd.pontos[c.seg], b = bd.pontos[c.seg + 1];
      c.m.position.lerpVectors(a, b, u);
    }
  });

  return cena ? <primitive object={cena} /> : null;
}
