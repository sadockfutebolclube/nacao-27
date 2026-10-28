/**
 * Estádio de São Januário (Estádio Vasco da Gama), Vasco da Gama (Fase 28). Geometria do OpenStreetMap (src/data/marcos/sao-januario.json):
 * o contorno de 62 pontos do estádio, o campo de treino e a quadra. Funções puras — a projeção vem de fora (a do arquivo da cidade) — para
 * o desenho (`SaoJanuario.tsx`), a ficha e o filtro dos prédios do OSM que o estádio substitui usarem a mesma geometria.
 */
import dados from '../data/marcos/sao-januario.json';

export type Projecao = (lat: number, lon: number) => [number, number];

export interface GeometriaSJ {
  /** contorno do estádio em metros do jogo (x leste, z sul) */
  contorno: [number, number][];
  centro: [number, number];
  /** rumo (rad) do eixo longo do estádio: ângulo de (sen, cos) em (x, z) */
  eixo: number;
  /** comprimento e largura da menor caixa orientada (m) */
  compr: number; larg: number;
  /** retângulos do campo de treino e da quadra (centro, rumo, comprimento, largura) */
  treino: { x: number; z: number; yaw: number; compr: number; larg: number }[];
}

const area = (p: [number, number][]) => { let a = 0; for (let i = 0; i < p.length; i++) { const [x0, z0] = p[i], [x1, z1] = p[(i + 1) % p.length]; a += x0 * z1 - x1 * z0; } return a / 2; };

/** menor caixa orientada pelo rumo (varre 0–180°) */
export function caixaOrientada(p: [number, number][]) {
  let melhor = { yaw: 0, compr: 0, larg: 0, cx: 0, cz: 0, a: Infinity };
  for (let g = 0; g < 180; g += 1) {
    const r = (g * Math.PI) / 180, s = Math.sin(r), c = Math.cos(r);
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const [x, z] of p) { const u = x * s + z * c, v = x * c - z * s; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
    const A = (u1 - u0) * (v1 - v0);
    if (A < melhor.a) { const uc = (u0 + u1) / 2, vc = (v0 + v1) / 2; melhor = { yaw: r, compr: u1 - u0, larg: v1 - v0, cx: uc * s + vc * c, cz: uc * c - vc * s, a: A }; }
  }
  // o eixo longo é o do comprimento
  if (melhor.larg > melhor.compr) melhor = { ...melhor, yaw: melhor.yaw + Math.PI / 2, compr: melhor.larg, larg: melhor.compr };
  return melhor;
}

export function geometriaSaoJanuario(proj: Projecao): GeometriaSJ {
  let contorno = dados.contorno.map(([la, lo]) => proj(la, lo));
  if (area(contorno) < 0) contorno = contorno.reverse();
  if (contorno.length > 1 && contorno[0][0] === contorno[contorno.length - 1][0] && contorno[0][1] === contorno[contorno.length - 1][1]) contorno.pop();
  const cx = caixaOrientada(contorno);
  const ret = (poly: number[][]) => {
    const p = poly.map(([la, lo]) => proj(la, lo)).slice(0, -1) as [number, number][];
    const k = caixaOrientada(p);
    return { x: k.cx, z: k.cz, yaw: k.yaw, compr: k.compr, larg: k.larg };
  };
  return { contorno, centro: [cx.cx, cx.cz], eixo: cx.yaw, compr: cx.compr, larg: cx.larg, treino: [ret(dados.campoAuxiliar), ret(dados.campo), ret(dados.tenis)] };
}

/** ponto dentro do polígono (par-ímpar) */
export function dentroDoPoligono(x: number, z: number, p: [number, number][]): boolean {
  let d = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [xi, zi] = p[i], [xj, zj] = p[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) d = !d;
  }
  return d;
}

export const FICHA_SJ = { capacidade: dados.capacidade, inauguracao: dados.inauguracao };
export const LATLON_SJ: [number, number] = (() => {
  const n = dados.contorno.length - 1;
  let la = 0, lo = 0;
  for (let i = 0; i < n; i++) { la += dados.contorno[i][0]; lo += dados.contorno[i][1]; }
  return [la / n, lo / n];
})();
