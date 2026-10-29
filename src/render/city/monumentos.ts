/**
 * Monumentos modelados no código (Fase 31), com as proporções reais, porque nenhum modelo gratuito serve (ver docs/turismo-modelos.md):
 * Cristo Redentor (estátua de 30 m sobre pedestal de 8 m, 28 m de braço a braço), cabine do bondinho, Igreja da Candelária,
 * Theatro Municipal e Biblioteca Nacional. Cada construtor devolve um Group com UMA malha por material (poucas draw calls); a frente do
 * prédio é +Z e o centro da base fica na origem. Unidades em metros.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const mat = (cor: string, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) => new THREE.MeshStandardMaterial({ color: cor, roughness: 0.85, ...extra });

/** Junta as geometrias de um material numa malha só (descarta o que não tem posição/normal/uv em comum). */
class Montador {
  private readonly porMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
  add(g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    const c = g.index ? g.toNonIndexed() : g.clone();
    for (const n of Object.keys(c.attributes)) if (n !== 'position' && n !== 'normal' && n !== 'uv') c.deleteAttribute(n);
    if (!c.getAttribute('normal')) c.computeVertexNormals();
    if (!c.getAttribute('uv')) c.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(c.getAttribute('position').count * 2), 2));
    c.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), new THREE.Vector3(sx, sy, sz)));
    (this.porMat.get(m) ?? this.porMat.set(m, []).get(m)!).push(c);
    g.dispose();
  }
  /** colunas em fileira ao longo de x, de x0 a x1, em (y0, z) */
  colunas(m: THREE.Material, n: number, x0: number, x1: number, y0: number, z: number, h: number, r: number) {
    for (let i = 0; i < n; i++) this.add(new THREE.CylinderGeometry(r * 0.88, r, h, 10), m, x0 + ((x1 - x0) * i) / Math.max(1, n - 1), y0 + h / 2, z);
  }
  /** cúpula: tambor (cilindro) + calota + lanterna */
  cupula(mTambor: THREE.Material, mCalota: THREE.Material, mOuro: THREE.Material, x: number, y: number, z: number, r: number, hTambor: number) {
    this.add(new THREE.CylinderGeometry(r, r * 1.04, hTambor, 20), mTambor, x, y + hTambor / 2, z);
    this.add(new THREE.CylinderGeometry(r * 1.1, r * 1.1, 0.35, 20), mTambor, x, y + hTambor + 0.17, z);
    this.add(new THREE.SphereGeometry(r * 1.02, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), mCalota, x, y + hTambor + 0.3, z);
    this.add(new THREE.CylinderGeometry(r * 0.16, r * 0.2, r * 0.5, 8), mTambor, x, y + hTambor + 0.3 + r * 1.02 + r * 0.2, z);
    this.add(new THREE.ConeGeometry(r * 0.18, r * 0.4, 8), mOuro, x, y + hTambor + 0.3 + r * 1.02 + r * 0.65, z);
  }
  /** janelas altas e escuras em grade na face +Z (e nas laterais pela mesma função com ry) */
  janelas(m: THREE.Material, nx: number, ny: number, largura: number, y0: number, dy: number, z: number, hj: number, wj: number, ry = 0, cx = 0, cz = 0) {
    const c = Math.cos(ry), s = Math.sin(ry);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const x = -largura / 2 + (largura * (i + 0.5)) / nx;
      this.add(new THREE.BoxGeometry(wj, hj, 0.25), m, cx + x * c + z * s, y0 + j * dy + hj / 2, cz - x * s + z * c, ry);
    }
  }
  grupo(nome: string, sombra = true): THREE.Group {
    const g = new THREE.Group();
    g.name = nome;
    for (const [m, gs] of this.porMat) {
      const geo = mergeGeometries(gs, false);
      if (!geo) continue;
      geo.computeBoundingSphere();
      const o = new THREE.Mesh(geo, m);
      o.castShadow = sombra; o.receiveShadow = true;
      g.add(o);
    }
    return g;
  }
}

// ── texturas ──────────────────────────────────────────────────────────────────────

/** Mosaico de pedra-sabão: milhares de pequenos triângulos cinza-esverdeados (o Cristo é revestido assim). */
export function texturaMosaico(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d')!;
  x.fillStyle = '#aab5ad'; x.fillRect(0, 0, 256, 256);
  const lado = 8;
  for (let j = 0; j < 256 / lado; j++) for (let i = 0; i < 256 / lado; i++) for (const sup of [true, false]) {
    const v = 150 + Math.random() * 55, g = v + 8, b = v - 4;
    x.fillStyle = `rgb(${v | 0},${g | 0},${b | 0})`;
    x.beginPath();
    const px = i * lado, py = j * lado;
    if (sup) { x.moveTo(px, py); x.lineTo(px + lado, py); x.lineTo(px, py + lado); } else { x.moveTo(px + lado, py + lado); x.lineTo(px + lado, py); x.lineTo(px, py + lado); }
    x.fill();
  }
  x.strokeStyle = 'rgba(60,70,62,0.35)'; x.lineWidth = 0.6;
  for (let k = 0; k <= 256; k += lado) { x.beginPath(); x.moveTo(k, 0); x.lineTo(k, 256); x.stroke(); x.beginPath(); x.moveTo(0, k); x.lineTo(256, k); x.stroke(); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(5, 6); t.anisotropy = 8;
  return t;
}

// ── Cristo Redentor ───────────────────────────────────────────────────────────────

export const CRISTO = { alturaEstatua: 30, alturaPedestal: 8, envergadura: 28 } as const;

/** Cristo: estátua de 30 m sobre pedestal de 8 m, braços abertos (28 m). Origem na base do pedestal; o rosto olha para +Z. */
export function cristo(): { grupo: THREE.Group; estatua: THREE.MeshStandardMaterial } {
  const mo = new Montador();
  const pedra = mat('#8f8a7f', { roughness: 0.92 });
  const estatua = new THREE.MeshStandardMaterial({ map: texturaMosaico(), color: '#dfe6df', roughness: 0.72, emissive: '#fff1cf', emissiveIntensity: 0 });
  const claro = mat('#b9b4a6', { roughness: 0.9 });
  const P = CRISTO.alturaPedestal;

  // pedestal: base larga, corpo troncopiramidal, friso e plataforma (capela de Nossa Senhora Aparecida lá dentro)
  const quad = (hw: number, hwTopo: number, h: number) => new THREE.CylinderGeometry(hwTopo * Math.SQRT2, hw * Math.SQRT2, h, 4).rotateY(Math.PI / 4);
  mo.add(quad(6.4, 6.0, 1.4), claro, 0, 0.7, 0);
  mo.add(quad(5.2, 4.1, 5.6), pedra, 0, 1.4 + 2.8, 0);
  mo.add(quad(4.5, 4.5, 0.5), claro, 0, 7.05, 0);
  mo.add(quad(4.9, 4.9, 0.45), claro, 0, 7.55 + 0.0, 0);
  // portal da capela e frisos
  mo.add(new THREE.BoxGeometry(1.6, 2.6, 0.3), mat('#2a2622'), 0, 2.7, 4.1);
  for (let k = -1; k <= 1; k += 2) mo.add(new THREE.BoxGeometry(0.5, 4.2, 0.3), claro, k * 3.2, 4, 3.9);

  // túnica: sólido de revolução com pregas verticais
  const perfil: [number, number][] = [[3.5, P], [3.15, P + 1.6], [2.7, P + 4.2], [2.35, P + 8], [2.05, P + 12], [2.0, P + 15], [2.25, P + 17.4], [2.0, P + 19.2], [1.2, P + 20.4], [0.62, P + 20.9]];
  const pts = perfil.map(([r, y]) => new THREE.Vector2(r, y));
  const lathe = new THREE.LatheGeometry(pts, 40);
  const pos = lathe.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), th = Math.atan2(z, x), t = THREE.MathUtils.smoothstep(y, P + 0.5, P + 4) * (1 - THREE.MathUtils.smoothstep(y, P + 16, P + 20));
    const k = 1 + 0.07 * t * Math.sin(th * 7 + y * 0.35) + 0.035 * t * Math.sin(th * 13 - y * 0.2);
    pos.setXYZ(i, x * k, y, z * k);
  }
  lathe.computeVertexNormals();
  mo.add(lathe, estatua);

  // braços: manga larga que afina até o punho, mão e o pano que cai sob o braço
  const yOmbro = P + 19.2;
  for (const lado of [-1, 1]) {
    mo.add(new THREE.CylinderGeometry(0.62, 1.05, CRISTO.envergadura / 2 - 3.2, 12).rotateZ((Math.PI / 2) * -lado), estatua, lado * (1.4 + (CRISTO.envergadura / 2 - 3.2) / 2), yOmbro, 0);
    mo.add(new THREE.CylinderGeometry(0.62, 0.7, 1.5, 10).rotateZ((Math.PI / 2) * -lado), estatua, lado * (CRISTO.envergadura / 2 - 2.6), yOmbro, 0);
    // mão: palma achatada e dedos
    mo.add(new THREE.BoxGeometry(1.5, 0.28, 1.05), estatua, lado * (CRISTO.envergadura / 2 - 1.5), yOmbro - 0.1, 0.05);
    for (let d = 0; d < 4; d++) mo.add(new THREE.BoxGeometry(1.25, 0.2, 0.2), estatua, lado * (CRISTO.envergadura / 2 - 0.65), yOmbro - 0.12, -0.38 + d * 0.27, 0, 0, lado * 0.07);
    // pano sob o braço (triângulo vertical em z = 0, do ombro ao pulso)
    const pano = new THREE.Shape();
    pano.moveTo(0, 0); pano.lineTo(lado * (CRISTO.envergadura / 2 - 3), -0.1); pano.lineTo(lado * (CRISTO.envergadura / 2 - 6.5), -4.6); pano.lineTo(lado * 1.9, -5.2); pano.closePath();
    mo.add(new THREE.ExtrudeGeometry(pano, { depth: 0.55, bevelEnabled: false }), estatua, 0, yOmbro - 0.35, -0.27);
  }
  // pescoço, cabeça, cabelo, barba e nariz
  mo.add(new THREE.CylinderGeometry(0.55, 0.7, 1.4, 10), estatua, 0, P + 21.4, 0);
  mo.add(new THREE.SphereGeometry(1.12, 18, 12), estatua, 0, P + 22.6, 0.05, 0, 0, 0, 0.9, 1.12, 1);
  mo.add(new THREE.SphereGeometry(1.2, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), estatua, 0, P + 22.9, -0.12);
  mo.add(new THREE.ConeGeometry(0.62, 1.3, 8), estatua, 0, P + 21.7, 0.55, 0, Math.PI, 0);
  mo.add(new THREE.BoxGeometry(0.22, 0.5, 0.35), estatua, 0, P + 22.5, 1.05);
  return { grupo: mo.grupo('cristo'), estatua };
}

// ── cabine do bondinho ────────────────────────────────────────────────────────────

/** Cabine do bondinho do Pão de Açúcar (1972/2008): casco vermelho e branco, faixa de vidro, teto com o carrinho e o cabo. A origem é o cabo. */
export function cabineBondinho(): THREE.Group {
  const mo = new Montador();
  const vermelho = mat('#c92a24', { roughness: 0.45, metalness: 0.2 }), branco = mat('#f2f1ec', { roughness: 0.5 });
  const vidro = new THREE.MeshStandardMaterial({ color: '#8fb4c6', roughness: 0.08, metalness: 0.4, transparent: true, opacity: 0.45, side: THREE.DoubleSide });
  const aco = mat('#3b3e42', { roughness: 0.4, metalness: 0.7 });
  const W = 3.4, L = 5.8;
  // casco em perfil arredondado (extrusão de um retângulo de cantos redondos ao longo de x)
  const forma = new THREE.Shape();
  const r = 0.55, a = L / 2, b = 1.9;
  forma.moveTo(-a + r, 0); forma.lineTo(a - r, 0); forma.quadraticCurveTo(a, 0, a, r); forma.lineTo(a, b - r); forma.quadraticCurveTo(a, b, a - r, b); forma.lineTo(-a + r, b); forma.quadraticCurveTo(-a, b, -a, b - r); forma.lineTo(-a, r); forma.quadraticCurveTo(-a, 0, -a + r, 0);
  const casco = new THREE.ExtrudeGeometry(forma, { depth: W, bevelEnabled: false, curveSegments: 4 }).translate(0, 0, -W / 2);
  mo.add(casco, vermelho, 0, -5.2, 0);
  mo.add(new THREE.BoxGeometry(L - 0.9, 1.45, W + 0.04), vidro, 0, -5.2 + 0.55 + 1.0, 0);
  mo.add(new THREE.BoxGeometry(L - 0.2, 0.18, W + 0.1), branco, 0, -5.2 + 0.4, 0); // soleira
  mo.add(new THREE.BoxGeometry(L + 0.1, 0.34, W + 0.1), branco, 0, -3.28, 0); // teto
  for (let i = -2; i <= 2; i++) mo.add(new THREE.BoxGeometry(0.09, 1.5, W + 0.08), branco, i * 1.05, -4.1, 0); // montantes
  // carrinho e cabo
  mo.add(new THREE.CylinderGeometry(0.07, 0.07, 3.1, 6), aco, 0, -1.5, 0.9);
  mo.add(new THREE.CylinderGeometry(0.07, 0.07, 3.1, 6), aco, 0, -1.5, -0.9);
  mo.add(new THREE.BoxGeometry(1.6, 0.35, 1.3), aco, 0, -0.1, 0);
  for (const dx of [-0.55, 0.55]) mo.add(new THREE.CylinderGeometry(0.34, 0.34, 0.22, 12), aco, dx, 0.2, 0, 0, Math.PI / 2, 0);
  return mo.grupo('cabine', true);
}

// ── Igreja da Candelária ──────────────────────────────────────────────────────────

/** Candelária: nave com fachada de duas torres, frontão, pórticos e a grande cúpula atrás. `w` = largura da fachada, `d` = profundidade. */
export function candelaria(w: number, d: number): THREE.Group {
  const mo = new Montador();
  const pedra = mat('#d9d0ba'), cinza = mat('#9ea6a1', { roughness: 0.7 }), escuro = mat('#2c2a28'), ouro = mat('#d4af37', { metalness: 0.6, roughness: 0.35 }), cobre = mat('#7e8f87', { roughness: 0.6 });
  const Hn = 20;
  mo.add(new THREE.BoxGeometry(w, Hn, d), pedra, 0, Hn / 2, 0);
  mo.add(new THREE.BoxGeometry(w + 0.8, 0.9, d + 0.8), pedra, 0, Hn + 0.45, 0);
  // telhado em duas águas
  const tel = new THREE.Shape(); tel.moveTo(-w / 2, 0); tel.lineTo(w / 2, 0); tel.lineTo(0, 5.5); tel.closePath();
  mo.add(new THREE.ExtrudeGeometry(tel, { depth: d * 0.92, bevelEnabled: false }), mat('#9a6b52', { roughness: 0.8 }), 0, Hn + 0.9, -d * 0.46);
  // fachada: torres, pilastras, portais e frontão
  const zf = d / 2;
  for (const lado of [-1, 1]) {
    const tx = lado * (w / 2 - 3.4);
    mo.add(new THREE.BoxGeometry(6.4, 31, 6.4), pedra, tx, 15.5, zf - 1.2);
    mo.add(new THREE.BoxGeometry(7.0, 0.9, 7.0), pedra, tx, 31.4, zf - 1.2);
    mo.add(new THREE.BoxGeometry(2.4, 5.2, 0.4), escuro, tx, 26.3, zf + 2.1); // arco do sino
    mo.add(new THREE.CylinderGeometry(2.7, 3.2, 3.2, 12), pedra, tx, 33.4, zf - 1.2);
    mo.add(new THREE.SphereGeometry(3.1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), cobre, tx, 35, zf - 1.2);
    mo.add(new THREE.ConeGeometry(0.35, 2, 6), ouro, tx, 39.3, zf - 1.2);
  }
  mo.colunas(pedra, 6, -w / 2 + 8.4, w / 2 - 8.4, 3, zf + 0.5, Hn - 3, 0.55);
  for (let k = -1; k <= 1; k++) mo.add(new THREE.BoxGeometry(2.6, 6.2, 0.35), escuro, k * 4.8, 3.1, zf + 0.15);
  const fr = new THREE.Shape(); fr.moveTo(-w / 2 + 6.4, 0); fr.lineTo(w / 2 - 6.4, 0); fr.lineTo(0, 5.6); fr.closePath();
  mo.add(new THREE.ExtrudeGeometry(fr, { depth: 0.9, bevelEnabled: false }), pedra, 0, Hn + 0.9, zf);
  mo.add(new THREE.CylinderGeometry(0.9, 0.9, 0.5, 14), ouro, 0, Hn + 3.4, zf + 0.9, 0, Math.PI / 2, 0);
  for (let i = 0; i < 3; i++) mo.add(new THREE.BoxGeometry(0.4, 3.3, 0.35), escuro, -3.4 + i * 3.4 + 1.2, 12, zf + 0.2);
  // cúpula sobre o cruzeiro (atrás da fachada)
  mo.cupula(pedra, cinza, ouro, 0, Hn + 0.9, -d * 0.12, Math.min(w, d) * 0.19, 9);
  // degraus
  for (let k = 0; k < 4; k++) mo.add(new THREE.BoxGeometry(w * 0.7 - k * 1.2, 0.3, 1.4), pedra, 0, 0.15 + k * 0.15, zf + 1.4 + (3 - k) * 0.9);
  mo.janelas(escuro, 5, 1, w * 0.8, 8, 0, -zf + 0, 4.2, 1.2, 0);
  return mo.grupo('candelaria');
}

// ── Theatro Municipal ─────────────────────────────────────────────────────────────

/** Theatro Municipal (1909, inspirado na Ópera Garnier): corpo eclético com pórtico de colunas, pavilhões com cúpulas e a cúpula verde central. */
export function theatro(w: number, d: number): THREE.Group {
  const mo = new Montador();
  const pedra = mat('#e4d8b8'), sombra = mat('#c9b88e'), verde = mat('#5f9b86', { roughness: 0.55, metalness: 0.25 }), ouro = mat('#d9b440', { metalness: 0.65, roughness: 0.3 }), escuro = mat('#2b2825'), vidro = mat('#4a6275', { metalness: 0.3, roughness: 0.2 });
  const H = 18, zf = d / 2;
  mo.add(new THREE.BoxGeometry(w, H, d), pedra, 0, H / 2, 0);
  mo.add(new THREE.BoxGeometry(w + 1, 1.2, d + 1), sombra, 0, H + 0.6, 0);
  mo.add(new THREE.BoxGeometry(w + 2, 1.2, 4), sombra, 0, 0.6, zf + 2);
  // pórtico central: 8 colunas em duas fileiras de 4, entablamento e balaústre
  const lw = w * 0.5;
  mo.colunas(pedra, 8, -lw / 2, lw / 2, 1.2, zf + 2.6, 11.5, 0.75);
  mo.add(new THREE.BoxGeometry(lw + 3, 1.6, 4.5), sombra, 0, 13.4, zf + 2);
  for (let i = 0; i < 16; i++) mo.add(new THREE.CylinderGeometry(0.16, 0.2, 1.1, 6), pedra, -lw / 2 - 1 + ((lw + 2) * i) / 15, 14.7, zf + 4);
  // arcos altos entre as colunas
  for (let k = 0; k < 5; k++) mo.add(new THREE.BoxGeometry(2.1, 7.4, 0.3), vidro, -lw / 2 + ((lw) * (k + 0.5)) / 5, 5.6, zf + 0.1);
  // pavilhões laterais com cúpulas pequenas
  for (const lado of [-1, 1]) {
    const px = lado * (w / 2 - 6);
    mo.add(new THREE.BoxGeometry(11, H + 5, 12), pedra, px, (H + 5) / 2, zf - 4);
    mo.add(new THREE.BoxGeometry(11.8, 1.1, 12.8), sombra, px, H + 5.5, zf - 4);
    mo.cupula(sombra, verde, ouro, px, H + 6, zf - 4, 3.6, 2.5);
    mo.colunas(pedra, 3, px - 3.6, px + 3.6, 6, zf + 2.3, 8, 0.45);
  }
  // cúpula central verde (a mais alta) com tambor e nervuras douradas
  mo.cupula(pedra, verde, ouro, 0, H + 1.2, -d * 0.1, Math.min(w, d) * 0.2, 6.5);
  // esculturas douradas no coroamento do pórtico
  for (let i = 0; i < 5; i++) mo.add(new THREE.BoxGeometry(0.7, 2.1, 0.7), ouro, -lw / 2 + (lw * i) / 4, 16.8, zf + 4);
  mo.add(new THREE.BoxGeometry(5, 3.2, 1.2), ouro, 0, 17.2, zf + 2.8, 0, 0, 0);
  mo.janelas(escuro, 7, 2, w * 0.7, 4, 7, -zf - 0.05, 3.2, 1.1, Math.PI);
  return mo.grupo('theatro');
}

// ── Biblioteca Nacional ───────────────────────────────────────────────────────────

/** Biblioteca Nacional (1910, neoclássica): corpo de pilastras, pórtico central com frontão e a lanterna sobre o saguão. */
export function biblioteca(w: number, d: number): THREE.Group {
  const mo = new Montador();
  const pedra = mat('#cfc9bb'), sombra = mat('#b2ab9a'), cinza = mat('#8e9694', { roughness: 0.7 }), escuro = mat('#2a2825'), ouro = mat('#cfae45', { metalness: 0.6, roughness: 0.35 });
  const H = 21, zf = d / 2;
  mo.add(new THREE.BoxGeometry(w, H, d), pedra, 0, H / 2, 0);
  mo.add(new THREE.BoxGeometry(w + 1, 1.4, d + 1), sombra, 0, H + 0.7, 0);
  mo.add(new THREE.BoxGeometry(w - 2, 1.6, d - 2), sombra, 0, H + 2.2, 0);
  // pilastras ao longo da fachada
  const n = Math.max(8, Math.round(w / 4.2));
  for (let i = 0; i < n; i++) mo.add(new THREE.BoxGeometry(1, H - 2, 0.7), sombra, -w / 2 + 2 + ((w - 4) * i) / (n - 1), H / 2 + 0.5, zf + 0.3);
  for (let j = 0; j < 2; j++) for (let i = 0; i < n - 1; i++) mo.add(new THREE.BoxGeometry(2, 4.2, 0.3), escuro, -w / 2 + 2 + ((w - 4) * (i + 0.5)) / (n - 1), 5.4 + j * 8.2, zf + 0.12);
  // pórtico central avançado com seis colunas e frontão
  const pw = w * 0.34;
  mo.add(new THREE.BoxGeometry(pw + 2, 1.2, 6), sombra, 0, 0.6, zf + 3);
  mo.colunas(pedra, 6, -pw / 2, pw / 2, 1.2, zf + 4.6, 15.5, 0.8);
  mo.add(new THREE.BoxGeometry(pw + 2.4, 1.7, 6.4), sombra, 0, 17.65, zf + 3);
  const fr = new THREE.Shape(); fr.moveTo(-pw / 2 - 1.2, 0); fr.lineTo(pw / 2 + 1.2, 0); fr.lineTo(0, 4.2); fr.closePath();
  mo.add(new THREE.ExtrudeGeometry(fr, { depth: 0.7, bevelEnabled: false }), pedra, 0, 18.5, zf + 5.8);
  mo.add(new THREE.BoxGeometry(2.8, 2.2, 0.2), ouro, 0, 19.6, zf + 6.6);
  for (let k = 0; k < 4; k++) mo.add(new THREE.BoxGeometry(pw + 2 - k * 1.6, 0.3, 1.2), sombra, 0, 0.15 + k * 0.15, zf + 6.6 + (3 - k) * 0.9);
  // lanterna sobre o saguão
  mo.add(new THREE.CylinderGeometry(4.2, 4.6, 3.6, 16), pedra, 0, H + 4.8, 0);
  mo.add(new THREE.SphereGeometry(4.3, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), cinza, 0, H + 6.6, 0);
  return mo.grupo('biblioteca');
}

/** Faixa de degraus coloridos (Escadaria Selarón e arquibancadas): extrusão de um perfil 2D (x = lateral, y = altura) ao longo de uma polilinha. */
export function extrusaoPerfil(linha: { x: number; y: number; z: number }[], perfil: [number, number][], cor: THREE.Material, uvEscala = 1): THREE.Mesh | null {
  if (linha.length < 2) return null;
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  let acc = 0;
  for (let i = 0; i < linha.length; i++) {
    const a = linha[Math.max(0, i - 1)], b = linha[Math.min(linha.length - 1, i + 1)];
    let tx = b.x - a.x, tz = b.z - a.z; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
    const nx = -tz, nz = tx;
    if (i) acc += Math.hypot(linha[i].x - linha[i - 1].x, linha[i].z - linha[i - 1].z);
    perfil.forEach(([px, py], k) => {
      pos.push(linha[i].x + nx * px, linha[i].y + py, linha[i].z + nz * px);
      uv.push(acc * uvEscala, k / (perfil.length - 1));
    });
  }
  const m = perfil.length;
  for (let i = 0; i + 1 < linha.length; i++) for (let k = 0; k + 1 < m; k++) {
    const a = i * m + k, b = a + 1, c = a + m, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const o = new THREE.Mesh(g, cor);
  o.castShadow = o.receiveShadow = true;
  return o;
}
