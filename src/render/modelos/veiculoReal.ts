/**
 * Veículos reais no material físico da frota (Fase 30). Carrega o GLB (carregar.ts: escala em metros, nariz em +Z, base em y = 0),
 * classifica cada vértice pela cor que ele tem (a paleta da textura do Kenney ou a cor do material do Poly Pizza) e grava os mesmos
 * atributos que a geometria procedural já usava: `color` (cor fixa), `aPinta` (1 = recebe a cor da instância: a lataria), `aAcab`
 * (0 pintura com verniz · 1 vidro · 2 pneu/plástico · 3 metal · 4 lente · 5 fosco) e `aBrilho` (3 farol, 4 lanterna: acendem à noite).
 * Assim o `materialVeiculo` (MeshPhysicalMaterial com clearcoat, vidro e emissivos) serve aos modelos reais sem mudar.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { carregarModelo, type EntradaModelo } from './carregar';

export interface VeiculoReal {
  geo: THREE.BufferGeometry;
  comp: number; larg: number; alt: number;
  /** lâmpadas: z da frente e da traseira, altura e largura relativa (para as barras de luz instanciadas) */
  luz: { f: number; t: number; y: number; l: number };
  /** quantos vértices viraram lataria, vidro, pneu, lente (diagnóstico) */
  classes: { pintura: number; vidro: number; pneu: number; lente: number; metal: number; outro: number };
}

const cache = new Map<string, Promise<VeiculoReal>>();
const imagens = new WeakMap<object, ImageData>();

function pixels(tex: THREE.Texture): ImageData | null {
  const img = tex.image as (ImageBitmap | HTMLImageElement | HTMLCanvasElement | undefined);
  if (!img) return null;
  const guardado = imagens.get(img as object);
  if (guardado) return guardado;
  const w = (img as { width: number }).width, h = (img as { height: number }).height;
  if (!w || !h) return null;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(img as CanvasImageSource, 0, 0);
  const d = g.getImageData(0, 0, w, h);
  imagens.set(img as object, d);
  return d;
}

const lum = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const sat = (r: number, g: number, b: number) => { const mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx <= 0 ? 0 : (mx - mn) / mx; };
const linear = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

export function carregarVeiculoReal(id: string, e: EntradaModelo): Promise<VeiculoReal> {
  let p = cache.get(id);
  if (!p) { p = montar(id, e); cache.set(id, p); }
  return p;
}

async function montar(id: string, e: EntradaModelo): Promise<VeiculoReal> {
  const m = await carregarModelo(id, e);
  const alt = m.tam.y, comp = m.tam.z, larg = m.tam.x;
  // 1) cor de cada vértice (sRGB 0–1)
  interface Peca { geo: THREE.BufferGeometry; cor: Float32Array }
  const pecas: Peca[] = [];
  for (const pc of m.pecas) {
    const g = pc.geo.clone();
    const n = g.getAttribute('position').count;
    const cor = new Float32Array(n * 3);
    const px = pc.mat.map ? pixels(pc.mat.map) : null;
    const uv = g.getAttribute('uv');
    const base = new THREE.Color().copy(pc.mat.color).getRGB({ r: 0, g: 0, b: 0 } as THREE.RGB, THREE.SRGBColorSpace);
    for (let i = 0; i < n; i++) {
      let r = base.r, gg = base.g, b = base.b;
      if (px && uv) {
        const x = Math.min(px.width - 1, Math.max(0, Math.floor(uv.getX(i) * px.width))), y = Math.min(px.height - 1, Math.max(0, Math.floor(uv.getY(i) * px.height)));
        const o = (y * px.width + x) * 4;
        r = px.data[o] / 255; gg = px.data[o + 1] / 255; b = px.data[o + 2] / 255;
      }
      cor[i * 3] = r; cor[i * 3 + 1] = gg; cor[i * 3 + 2] = b;
    }
    pecas.push({ geo: g, cor });
  }
  // 2) cor da lataria = a mais comum entre os vértices acima da soleira (histograma de 4 bits por canal)
  const hist = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (const pc of pecas) {
    const pos = pc.geo.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      if (pos.getY(i) < alt * 0.1) continue;
      const r = pc.cor[i * 3], g = pc.cor[i * 3 + 1], b = pc.cor[i * 3 + 2], l = lum(r, g, b);
      if (l < 0.12 || (b > r + 0.04 && b >= g - 0.03 && pos.getY(i) > alt * 0.3)) continue; // pneu e vidro não são lataria
      const k = (Math.round(r * 15) << 8) | (Math.round(g * 15) << 4) | Math.round(b * 15);
      const h = hist.get(k) ?? { n: 0, r: 0, g: 0, b: 0 };
      h.n++; h.r += r; h.g += g; h.b += b; hist.set(k, h);
    }
  }
  let melhor = { n: 0, r: 1, g: 1, b: 1 };
  for (const h of hist.values()) if (h.n > melhor.n) melhor = { n: h.n, r: h.r / h.n, g: h.g / h.n, b: h.b / h.n };
  const matiz = (r: number, g: number, b: number) => { const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; if (d < 1e-6) return 0; const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return ((h / 6) + 1) % 1; };
  const lDom = Math.max(0.05, lum(melhor.r, melhor.g, melhor.b)), sDom = sat(melhor.r, melhor.g, melhor.b), hDom = matiz(melhor.r, melhor.g, melhor.b);
  /** lataria: mesma matiz da cor dominante (sombras e brilhos da paleta incluídos); em carro branco/cinza, qualquer tom neutro parecido */
  const ehPintura = (r: number, g: number, b: number) => {
    const l = lum(r, g, b), s = sat(r, g, b);
    if (sDom > 0.25) { const dh = Math.abs(matiz(r, g, b) - hDom); return s > 0.2 && Math.min(dh, 1 - dh) < 0.06; }
    return s < 0.2 && Math.abs(l - lDom) < 0.3;
  };

  // 3) classe de cada vértice
  const classes = { pintura: 0, vidro: 0, pneu: 0, lente: 0, metal: 0, outro: 0 };
  const lampF = { n: 0, y: 0, x: 0, z: 0 }, lampT = { n: 0, y: 0, x: 0, z: 0 };
  const saida: THREE.BufferGeometry[] = [];
  for (const pc of pecas) {
    const pos = pc.geo.getAttribute('position');
    const n = pos.count;
    const color = new Float32Array(n * 3), pinta = new Float32Array(n), brilho = new Float32Array(n), acab = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const r = pc.cor[i * 3], g = pc.cor[i * 3 + 1], b = pc.cor[i * 3 + 2];
      const l = lum(r, g, b), s = sat(r, g, b);
      const y = pos.getY(i), z = pos.getZ(i), x = pos.getX(i);
      let cr = r, cg = g, cb = b, ac = 5, pin = 0, bri = 0;
      if (l < 0.14) { ac = 2; classes.pneu++; }
      else if (ehPintura(r, g, b) && y > alt * 0.12) { pin = 1; ac = 0; cr = cg = cb = Math.min(1.1, Math.max(0.55, l / lDom)); classes.pintura++; }
      else if (b > r + 0.04 && b >= g - 0.03 && l < 0.75 && y > alt * 0.3) { ac = 1; cr = 0.02; cg = 0.03; cb = 0.045; classes.vidro++; }
      else if (s > 0.4 && l > 0.3 && y > alt * 0.15 && y < alt * 0.75 && Math.abs(z) > comp * 0.36) {
        ac = 4; classes.lente++;
        if (z > 0) { bri = 3; lampF.n++; lampF.y += y; lampF.x += Math.abs(x); lampF.z += z; } else { bri = 4; lampT.n++; lampT.y += y; lampT.x += Math.abs(x); lampT.z += z; }
      }
      else if (s < 0.2 && l > 0.45) { ac = 3; classes.metal++; }
      else classes.outro++;
      // cor fixa em espaço linear
      color[i * 3] = linear(cr); color[i * 3 + 1] = linear(cg); color[i * 3 + 2] = linear(cb);
      pinta[i] = pin; brilho[i] = bri; acab[i] = ac;
    }
    pc.geo.deleteAttribute('uv');
    pc.geo.setAttribute('color', new THREE.BufferAttribute(color, 3));
    pc.geo.setAttribute('aPinta', new THREE.BufferAttribute(pinta, 1));
    pc.geo.setAttribute('aBrilho', new THREE.BufferAttribute(brilho, 1));
    pc.geo.setAttribute('aAcab', new THREE.BufferAttribute(acab, 1));
    saida.push(pc.geo.index ? pc.geo.toNonIndexed() : pc.geo);
  }
  const geo = mergeGeometries(saida, false)!;
  geo.computeBoundingSphere();
  const luz = {
    f: lampF.n ? lampF.z / lampF.n : comp * 0.48, t: lampT.n ? lampT.z / lampT.n : -comp * 0.48,
    y: lampF.n ? lampF.y / lampF.n : alt * 0.4, l: Math.max(0.3, (lampF.n ? lampF.x / lampF.n : larg * 0.3) * 2 / 1.5),
  };
  return { geo, comp, larg, alt, luz, classes };
}
