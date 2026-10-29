/**
 * Onde há prédio (Fase 31): grade de 16 m com os lotes do jogo e os prédios reais do OSM, para a orla e os parques não porem guarda-sol,
 * quiosque ou pessoa em cima de uma casa. `ocupado(x, z)` testa o retângulo orientado de cada prédio da célula (com uma margem).
 * Reconstrói quando o conjunto de lotes muda.
 */
import { CAMPOS_PREDIO } from '../../data/cidadeReal';
import { mundo } from '../../sim/bridge';
import { LOT_STRIDE } from '../../world/lots';

const CEL = 16;
interface Caixa { x: number; z: number; c: number; s: number; hw: number; hd: number }
let chave: unknown = null;
let tamanho = -1;
let grade = new Map<number, Caixa[]>();

function reconstruir() {
  grade = new Map();
  const add = (x: number, z: number, ang: number, w: number, d: number) => {
    const caixa: Caixa = { x, z, c: Math.cos(ang), s: Math.sin(ang), hw: w / 2, hd: d / 2 };
    const r = Math.hypot(w, d) / 2;
    for (let i = Math.floor((x - r) / CEL); i <= Math.floor((x + r) / CEL); i++) for (let j = Math.floor((z - r) / CEL); j <= Math.floor((z + r) / CEL); j++) {
      const k = i * 100003 + j;
      (grade.get(k) ?? grade.set(k, []).get(k)!).push(caixa);
    }
  };
  const L = mundo.lots;
  for (let i = 0; i + LOT_STRIDE <= L.length; i += LOT_STRIDE) add(L[i], L[i + 1], L[i + 2], L[i + 3], L[i + 4]);
  const P = mundo.real?.predios;
  if (P) for (let i = 0; i + CAMPOS_PREDIO <= P.length; i += CAMPOS_PREDIO) add(P[i], P[i + 1], P[i + 2] / 1000, P[i + 3], P[i + 4]);
  chave = mundo.lots; tamanho = L.length;
}

/** há um prédio (lote ou OSM) a menos de `margem` metros do ponto? */
export function ocupado(x: number, z: number, margem = 1.5): boolean {
  if (chave !== mundo.lots || tamanho !== mundo.lots.length) reconstruir();
  const lista = grade.get(Math.floor(x / CEL) * 100003 + Math.floor(z / CEL));
  if (!lista) return false;
  for (const b of lista) {
    const dx = x - b.x, dz = z - b.z;
    // mesma convenção de PrediosReais: rotação em Y de `ang`
    const lx = dx * b.c - dz * b.s, lz = dx * b.s + dz * b.c;
    if (Math.abs(lx) < b.hw + margem && Math.abs(lz) < b.hd + margem) return true;
  }
  return false;
}
