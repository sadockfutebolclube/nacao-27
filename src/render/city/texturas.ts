/**
 * Texturas procedurais em canvas (sem download): asfalto com sinalização brasileira,
 * calçada de concreto, calçadão de pedra portuguesa em ondas e brilho de poste.
 */
import * as THREE from 'three';

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')!];
}

function ruido(ctx: CanvasRenderingContext2D, w: number, h: number, base: [number, number, number], amp: number, seed = 1) {
  const img = ctx.createImageData(w, h);
  let s = seed;
  for (let i = 0; i < w * h; i++) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const n = ((s >>> 8) / 16777216 - 0.5) * amp;
    img.data[i * 4] = base[0] + n; img.data[i * 4 + 1] = base[1] + n; img.data[i * 4 + 2] = base[2] + n; img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

function finalizar(c: HTMLCanvasElement, repetir = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.ClampToEdgeWrapping;
  t.wrapT = repetir ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.anisotropy = 8;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

/** Asfalto liso, sem sinalização, igual ao dos leitos (cruzamentos); `claro` = ilha pintada da minirrotatória (um tom acima). */
export function texturaAsfalto(claro = false): THREE.CanvasTexture {
  const W = 128, H = 128;
  const [c, ctx] = canvas(W, H);
  ruido(ctx, W, H, claro ? [86, 88, 90] : [60, 62, 64], 22, claro ? 21 : 7);
  ctx.fillStyle = 'rgba(30,30,30,0.25)';
  for (let i = 0; i < 24; i++) ctx.fillRect(Math.random() * W, Math.random() * H, 2 + Math.random() * 18, 1 + Math.random() * 3);
  const tex = finalizar(c);
  tex.wrapS = THREE.RepeatWrapping; // cobre cruzamentos e ilhas em qualquer direção
  return tex;
}

/** Grama de banqueta e talude (ladrilho de 2 m). */
export function texturaGrama(): THREE.CanvasTexture {
  const W = 128, H = 128;
  const [c, ctx] = canvas(W, H);
  ruido(ctx, W, H, [104, 126, 64], 34, 17);
  for (let i = 0; i < 160; i++) { ctx.fillStyle = `rgba(${40 + Math.random() * 60},${90 + Math.random() * 70},${30 + Math.random() * 40},0.5)`; ctx.fillRect(Math.random() * W, Math.random() * H, 1 + Math.random() * 2, 2 + Math.random() * 5); }
  const tex = finalizar(c);
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}

/** Rua de mão dupla: bordas brancas, eixo amarelo tracejado. v = 10 m por repetição. */
export function texturaRua(): THREE.CanvasTexture {
  const W = 256, H = 256;
  const [c, ctx] = canvas(W, H);
  ruido(ctx, W, H, [62, 64, 66], 22, 7);
  ctx.fillStyle = 'rgba(30,30,30,0.25)';
  for (let i = 0; i < 40; i++) ctx.fillRect(Math.random() * W, Math.random() * H, 2 + Math.random() * 30, 1 + Math.random() * 3);
  ctx.fillStyle = '#e8e6df';
  ctx.fillRect(W * 0.04, 0, 3, H);
  ctx.fillRect(W * 0.96 - 3, 0, 3, H);
  ctx.fillStyle = '#e8b422';
  ctx.fillRect(W / 2 - 3, 0, 6, H * 0.45);
  return finalizar(c);
}

/**
 * Leito de via real (Fase 14) com a sinalização do número de faixas: bordas brancas contínuas, faixas
 * tracejadas entre as faixas do mesmo sentido (4 m de traço, 12 m de vão) e, nas vias de mão dupla, o eixo
 * amarelo — tracejado em duas faixas, duplo contínuo em quatro ou mais. v = 16 m por repetição.
 */
export function texturaFaixas(faixas: number, maoUnica: boolean): THREE.CanvasTexture {
  const W = 64 * Math.max(2, Math.min(8, faixas)), H = 256;
  const [c, ctx] = canvas(W, H);
  ruido(ctx, W, H, [60, 62, 64], 22, 5 + faixas);
  ctx.fillStyle = 'rgba(30,30,30,0.25)';
  for (let i = 0; i < 50; i++) ctx.fillRect(Math.random() * W, Math.random() * H, 2 + Math.random() * 30, 1 + Math.random() * 3);
  const branco = '#e8e6df', amarelo = '#e8b422', lw = 4;
  ctx.fillStyle = branco;
  ctx.fillRect(W * 0.035, 0, lw, H);
  ctx.fillRect(W * 0.965 - lw, 0, lw, H);
  const porSentido = maoUnica ? faixas : Math.max(1, Math.floor(faixas / 2));
  const larg = maoUnica ? W : W / 2;
  const ladoEsq = (ini: number, n: number, larguraTotal: number) => {
    for (let k = 1; k < n; k++) {
      const x = ini + (larguraTotal * k) / n;
      ctx.fillStyle = branco;
      ctx.fillRect(x - lw / 2, 0, lw, H * 0.25);
    }
  };
  if (maoUnica) ladoEsq(0, porSentido, larg);
  else {
    ladoEsq(0, porSentido, larg);
    ladoEsq(W / 2, porSentido, larg);
    ctx.fillStyle = amarelo;
    if (faixas >= 4) { ctx.fillRect(W / 2 - lw - 1, 0, lw, H); ctx.fillRect(W / 2 + 1, 0, lw, H); }
    else ctx.fillRect(W / 2 - lw / 2, 0, lw, H * 0.5);
  }
  return finalizar(c);
}

/** Faixa de pedestre (zebra) para os cruzamentos. Largura u = 1 vira 3 m; as listras correm ao longo da rua. */
export function texturaZebra(): THREE.CanvasTexture {
  const W = 128, H = 128;
  const [c, ctx] = canvas(W, H);
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(236,234,226,0.92)';
  for (let k = 0; k < 6; k++) ctx.fillRect(k * (W / 6) + 4, 0, W / 12, H);
  const t = finalizar(c, false);
  t.wrapS = THREE.ClampToEdgeWrapping;
  return t;
}

/** Avenida com canteiro central gramado e faixas tracejadas. */
export function texturaAvenida(): THREE.CanvasTexture {
  const W = 512, H = 256;
  const [c, ctx] = canvas(W, H);
  ruido(ctx, W, H, [58, 60, 62], 20, 11);
  const med0 = W * 0.445, med1 = W * 0.555;
  ctx.fillStyle = '#b9b5ab';
  ctx.fillRect(med0 - 4, 0, med1 - med0 + 8, H);
  ctx.fillStyle = '#4f7f35';
  ctx.fillRect(med0, 0, med1 - med0, H);
  ctx.fillStyle = 'rgba(30,60,20,0.35)';
  for (let i = 0; i < 300; i++) ctx.fillRect(med0 + Math.random() * (med1 - med0), Math.random() * H, 2, 2);
  ctx.fillStyle = '#e8e6df';
  ctx.fillRect(W * 0.03, 0, 3, H);
  ctx.fillRect(W * 0.97 - 3, 0, 3, H);
  ctx.fillRect(med0 - 10, 0, 2, H);
  ctx.fillRect(med1 + 8, 0, 2, H);
  for (const u of [0.24, 0.76]) ctx.fillRect(W * u - 2, 0, 4, H * 0.4);
  return finalizar(c);
}

/** Calçada comum de concreto com juntas. */
export function texturaCalcada(): THREE.CanvasTexture {
  const W = 128, H = 128;
  const [c, ctx] = canvas(W, H);
  ruido(ctx, W, H, [176, 172, 163], 18, 3);
  ctx.strokeStyle = 'rgba(90,85,78,0.5)';
  ctx.lineWidth = 1;
  for (let y = 0; y < H; y += 32) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  ctx.beginPath(); ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H); ctx.stroke();
  return finalizar(c);
}

/** Calçadão de pedra portuguesa: ondas pretas e brancas (homenagem a Burle Marx). */
export function texturaCalcadao(): THREE.CanvasTexture {
  const W = 256, H = 256;
  const [c, ctx] = canvas(W, H);
  const img = ctx.createImageData(W, H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const v = y / H;
      const onda = Math.sin((v * 2 * Math.PI) * 2 + (x / W) * 0.0) * 0.18;
      const faixa = (x / W + onda) * 3;
      const preto = Math.floor(faixa) % 2 === 0;
      // "pedrinhas": quantização em mosaico com jitter
      const jitter = (((x * 73856093) ^ (y * 19349663)) & 255) / 255;
      const pedra = ((x % 4 === 0) || (y % 4 === 0)) ? 0.75 : 1;
      const base = preto ? 38 + jitter * 18 : 222 + jitter * 25;
      const k = base * pedra;
      img.data[(y * W + x) * 4] = k; img.data[(y * W + x) * 4 + 1] = k * 0.99; img.data[(y * W + x) * 4 + 2] = k * 0.96; img.data[(y * W + x) * 4 + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return finalizar(c);
}

/** Halo radial para o chão iluminado pelos postes. */
export function texturaHalo(): THREE.CanvasTexture {
  const S = 64;
  const [c, ctx] = canvas(S, S);
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
