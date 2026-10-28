/**
 * Rotas por waypoints dos veículos especiais (Fase 27). Funções puras (sem Three): projeta lat/lon no mapa do jogo, suaviza os
 * waypoints com uma spline Catmull-Rom (passa por todos), integra o tempo pelo perfil de velocidade e dá posição, rumo, caturra e
 * rolagem em qualquer instante. Uma FROTA é um conjunto de veículos fazendo a mesma viagem defasados no tempo.
 */
import type { DefFrota, DefRota } from './dados';

/** Centro do mapa do Rio (o mesmo de public/data/cidades/3304557.json) e a projeção do gerador: x leste, z sul, em metros. */
export const CENTRO_RIO = { lat: -22.945, lon: -43.195 } as const;
export function projetarRio(lat: number, lon: number): [number, number] {
  const kx = 111_320 * Math.cos((CENTRO_RIO.lat * Math.PI) / 180), kz = 110_574;
  return [(lon - CENTRO_RIO.lon) * kx, -(lat - CENTRO_RIO.lat) * kz];
}
export function latLonDoRio(x: number, z: number): [number, number] {
  const kx = 111_320 * Math.cos((CENTRO_RIO.lat * Math.PI) / 180), kz = 110_574;
  return [CENTRO_RIO.lat - z / kz, CENTRO_RIO.lon + x / kx];
}

export interface RotaPronta {
  id: string;
  tipo: 'ar' | 'mar';
  fechada: boolean;
  /** pontos amostrados (~40 m) */
  x: Float32Array; z: Float32Array; alt: Float32Array; v: Float32Array;
  /** tempo acumulado em cada ponto (s) */
  t: Float32Array;
  /** distância acumulada (m) */
  s: Float32Array;
  comprimento: number;
  duracao: number;
}

export interface EstadoRota { x: number; z: number; alt: number; v: number; yaw: number; pitch: number; roll: number }

const PASSO = 40;

/** Catmull-Rom uniforme entre p1 e p2 (p0 e p3 vizinhos). */
const cr = (p0: number, p1: number, p2: number, p3: number, u: number) =>
  0.5 * (2 * p1 + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (-p0 + 3 * p1 - 3 * p2 + p3) * u * u * u);

export function prepararRota(id: string, def: DefRota): RotaPronta {
  const fechada = !!def.fechada;
  const P = def.pontos.map(([la, lo, alt, v]) => { const [x, z] = projetarRio(la, lo); return [x, z, alt, v] as [number, number, number, number]; });
  const n = P.length;
  const at = (i: number) => (fechada ? P[((i % n) + n) % n] : P[Math.max(0, Math.min(n - 1, i))]);
  const xs: number[] = [], zs: number[] = [], as: number[] = [], vs: number[] = [];
  const segs = fechada ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const k = Math.max(2, Math.min(240, Math.ceil(len / PASSO)));
    for (let j = 0; j < k; j++) {
      const u = j / k;
      xs.push(cr(p0[0], p1[0], p2[0], p3[0], u)); zs.push(cr(p0[1], p1[1], p2[1], p3[1], u));
      as.push(Math.max(0, cr(p0[2], p1[2], p2[2], p3[2], u))); vs.push(Math.sqrt(Math.max(0.25, cr(p0[3] ** 2, p1[3] ** 2, p2[3] ** 2, p3[3] ** 2, u))));
    }
  }
  if (!fechada) { xs.push(P[n - 1][0]); zs.push(P[n - 1][1]); as.push(P[n - 1][2]); vs.push(Math.max(0.5, P[n - 1][3])); }
  const m = xs.length;
  const s = new Float32Array(m), t = new Float32Array(m);
  for (let i = 1; i < m; i++) {
    const d = Math.hypot(xs[i] - xs[i - 1], zs[i] - zs[i - 1]);
    s[i] = s[i - 1] + d;
    t[i] = t[i - 1] + (2 * d) / (vs[i] + vs[i - 1]);
  }
  let comprimento = s[m - 1], duracao = t[m - 1];
  if (fechada) { // fecha o laço: último ponto → primeiro
    const d = Math.hypot(xs[0] - xs[m - 1], zs[0] - zs[m - 1]);
    comprimento += d; duracao += (2 * d) / (vs[0] + vs[m - 1]);
  }
  return { id, tipo: def.tipo, fechada, x: Float32Array.from(xs), z: Float32Array.from(zs), alt: Float32Array.from(as), v: Float32Array.from(vs), t, s, comprimento, duracao };
}

/* A velocidade varia com o QUADRADO linear na distância (aceleração constante: v² = v0² + 2·a·d), não linear — senão a corrida na pista começaria lenta demais. */

/** índice i com t[i] ≤ tt < t[i+1] */
function achar(r: RotaPronta, tt: number): number {
  let lo = 0, hi = r.t.length - 1;
  while (lo < hi - 1) { const m = (lo + hi) >> 1; if (r.t[m] <= tt) lo = m; else hi = m; }
  return lo;
}

const dAng = (a: number, b: number) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };

/** Posição no instante `tt` (s desde o começo da rota; fora de [0, duracao] fica nas pontas — ou dá a volta, se fechada). */
export function estadoNaRota(r: RotaPronta, tt: number, out: EstadoRota): EstadoRota {
  const m = r.t.length;
  if (r.fechada) tt = ((tt % r.duracao) + r.duracao) % r.duracao; else tt = Math.max(0, Math.min(r.duracao, tt));
  let i = achar(r, tt), j = i + 1;
  let t0 = r.t[i], t1 = r.t[j < m ? j : m - 1];
  let x1: number, z1: number, a1: number, v1: number;
  if (j >= m) {
    if (r.fechada) { j = 0; t1 = r.duracao; x1 = r.x[0]; z1 = r.z[0]; a1 = r.alt[0]; v1 = r.v[0]; } else { j = m - 1; i = Math.max(0, m - 2); t0 = r.t[i]; t1 = r.t[j]; x1 = r.x[j]; z1 = r.z[j]; a1 = r.alt[j]; v1 = r.v[j]; }
  } else { x1 = r.x[j]; z1 = r.z[j]; a1 = r.alt[j]; v1 = r.v[j]; }
  const f = t1 > t0 ? Math.max(0, Math.min(1, (tt - t0) / (t1 - t0))) : 0;
  out.x = r.x[i] + (x1 - r.x[i]) * f; out.z = r.z[i] + (z1 - r.z[i]) * f;
  out.alt = r.alt[i] + (a1 - r.alt[i]) * f; out.v = r.v[i] + (v1 - r.v[i]) * f;
  const dx = x1 - r.x[i], dz = z1 - r.z[i];
  out.yaw = Math.atan2(dx, dz);
  const dist = Math.hypot(dx, dz) || 1;
  out.pitch = Math.atan2(a1 - r.alt[i], dist);
  // rolagem pela taxa de giro do rumo: olha ~3 pontos adiante e atrás
  const k = 3;
  const ia = Math.max(0, i - k), ib = r.fechada ? (i + k) % m : Math.min(m - 1, i + k);
  const ic = r.fechada ? (i + k + 1) % m : Math.min(m - 1, i + k + 1);
  const id = r.fechada ? (i - k + m) % m : ia;
  const h1 = Math.atan2(r.x[ic] - r.x[ib], r.z[ic] - r.z[ib]), h0 = Math.atan2(r.x[(id + 1) % m] - r.x[id], r.z[(id + 1) % m] - r.z[id]);
  const ds = Math.max(1, 2 * k * PASSO);
  const taxa = dAng(h1, h0) / (ds / Math.max(1, out.v)); // rad/s
  out.roll = Math.max(-0.5, Math.min(0.5, (-taxa * out.v) / 9.81));
  return out;
}

/** Viagem de uma frota: as rotas em sequência (com pausa parado entre elas) ou, se todas fechadas, uma rota por veículo. */
export interface Cronograma {
  frota: DefFrota;
  rotas: RotaPronta[];
  /** true: cada veículo faz uma rota fechada só sua (i % n) */
  uma_por_veiculo: boolean;
  viagemS: number;
  cicloS: number;
}

export function montarCronograma(frota: DefFrota, rotas: Record<string, RotaPronta>): Cronograma {
  const rs = frota.rotas.map((id) => rotas[id]);
  const todasFechadas = rs.every((r) => r.fechada);
  const pausa = frota.pausaS ?? 0;
  const viagemS = todasFechadas ? Math.max(...rs.map((r) => r.duracao)) : rs.reduce((s, r) => s + r.duracao, 0) + pausa * (rs.length - 1);
  const cicloS = todasFechadas ? viagemS : Math.max(frota.cicloS, viagemS);
  return { frota, rotas: rs, uma_por_veiculo: todasFechadas, viagemS, cicloS };
}

/** hash determinístico 0..1 (o mesmo veículo sempre começa defasado igual) */
export const hash01 = (n: number) => { let h = (n * 2654435761) >>> 0; h ^= h >>> 15; h = Math.imul(h, 2246822519) >>> 0; h ^= h >>> 13; return (h >>> 0) / 4294967296; };

export interface PosicaoVeiculo extends EstadoRota { ativo: boolean; rota: number; parado: boolean; /** s desde o início da viagem */ tau: number }

/** Onde o veículo `i` da frota está no instante `relogio` (s). `ativo` false = ainda/já fora de cena. */
export function posicaoDoVeiculo(c: Cronograma, i: number, relogio: number, out: PosicaoVeiculo): PosicaoVeiculo {
  const f = c.frota;
  const fase = f.espacamentoS != null ? -i * f.espacamentoS : (i * c.cicloS) / f.quantidade + hash01(i + f.id.length * 31) * (c.cicloS / f.quantidade) * 0.4;
  const tau = (((relogio + fase) % c.cicloS) + c.cicloS) % c.cicloS;
  out.tau = tau; out.parado = false; out.ativo = false; out.rota = 0;
  if (c.uma_por_veiculo) {
    const r = c.rotas[i % c.rotas.length];
    out.ativo = true; out.rota = i % c.rotas.length;
    estadoNaRota(r, tau * (r.duracao / c.cicloS) + (r.fechada ? hash01(i + 7) * r.duracao : 0), out);
    return out;
  }
  if (tau > c.viagemS) return out;
  const pausa = f.pausaS ?? 0;
  let t = tau;
  for (let k = 0; k < c.rotas.length; k++) {
    const r = c.rotas[k];
    if (t <= r.duracao) { out.ativo = true; out.rota = k; estadoNaRota(r, t, out); return out; }
    t -= r.duracao;
    if (k < c.rotas.length - 1) {
      if (t <= pausa) { out.ativo = true; out.rota = k; estadoNaRota(r, r.duracao, out); out.parado = true; out.v = 0; out.pitch = 0; out.roll = 0; return out; }
      t -= pausa;
    }
  }
  return out;
}

export const novaPosicao = (): PosicaoVeiculo => ({ x: 0, z: 0, alt: 0, v: 0, yaw: 0, pitch: 0, roll: 0, ativo: false, rota: 0, parado: false, tau: 0 });
