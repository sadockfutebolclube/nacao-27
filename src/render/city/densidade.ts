/**
 * Densidade de pedestres dirigida por dados (Fase 24). Tudo que decide "quanta gente" vem de `src/data/pedestres.json`:
 *
 *   densidade(célula, hora, dia) = Σ classes [ peso da classe na célula × pico da classe × Σ personas (mistura × fração visível) ]
 *                                  + reforço dos pontos de interesse (parada de ônibus, estação)
 *
 * A fração visível de cada persona vem da ROTINA dela (casa → trabalho/escola → comércio → casa, com horários, em dia útil
 * e em fim de semana): quem dorme, está em casa, no trabalho ou na escola está dentro de um prédio e não conta. A classe da
 * célula sai do uso do solo (prédios reais por tipo e área de piso), da distância da água (orla), dos bairros do centro e das
 * praças (vegetação de parque). Funções puras: nada aqui toca o Three.js nem o Worker.
 */
import { bytesDe, CAMPOS_PREDIO, type CidadeReal } from '../../data/cidadeReal';
import config from '../../data/pedestres.json';
import { BUILD_HALF } from '../../world/constants';

export type Classe = 'centro' | 'comercial' | 'residencial' | 'industrial' | 'servico' | 'orla' | 'praca' | 'vazio';
export const CLASSES: Classe[] = ['centro', 'comercial', 'residencial', 'industrial', 'servico', 'orla', 'praca', 'vazio'];
export type Atividade = 'dorme' | 'casa' | 'desloca' | 'trabalha' | 'estuda' | 'compra' | 'passeia' | 'corre';
export const ATIVIDADES: Atividade[] = ['dorme', 'casa', 'desloca', 'trabalha', 'estuda', 'compra', 'passeia', 'corre'];
export type Persona = 'trabalhador' | 'estudante' | 'aposentado' | 'turista' | 'esportista' | 'ambulante';
export const PERSONAS: Persona[] = ['trabalhador', 'estudante', 'aposentado', 'turista', 'esportista', 'ambulante'];

export type Config = typeof config;
export const CONFIG: Config = config;

const mod24 = (h: number) => ((h % 24) + 24) % 24;
const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** interpolação linear de uma curva [[hora, valor], …] (0–24, circular) */
export function curva(pts: readonly (readonly number[])[], hora: number): number {
  const h = mod24(hora);
  for (let i = 1; i < pts.length; i++) {
    if (h <= pts[i][0]) { const [h0, f0] = pts[i - 1], [h1, f1] = pts[i]; return f0 + (f1 - f0) * ((h - h0) / Math.max(1e-6, h1 - h0)); }
  }
  return pts[pts.length - 1][1];
}

// ── rotina das personas ──────────────────────────────────────────────────────────────

const PASSOS = 144; // 10 em 10 minutos
/** fração do tempo em cada atividade por persona, dia (0 útil, 1 fim de semana) e passo de 10 min, já suavizada em ±40 min */
const ROTINA = new Map<string, Float32Array>();

function blocoEm(blocos: readonly (readonly (number | string)[])[], h: number): Atividade {
  let atual = blocos[blocos.length - 1][1] as Atividade; // o último bloco atravessa a meia-noite
  for (const b of blocos) if ((b[0] as number) <= h) atual = b[1] as Atividade;
  return atual;
}

function rotina(p: Persona, fds: boolean): Float32Array {
  const chave = `${p}${fds ? 1 : 0}`;
  let r = ROTINA.get(chave);
  if (r) return r;
  const blocos = (config.personas[p] as { util: (number | string)[][]; fds: (number | string)[][] })[fds ? 'fds' : 'util'];
  const bruto = new Uint8Array(PASSOS);
  for (let k = 0; k < PASSOS; k++) bruto[k] = ATIVIDADES.indexOf(blocoEm(blocos, k / 6));
  r = new Float32Array(PASSOS * ATIVIDADES.length);
  const J = 4; // ±40 min
  for (let k = 0; k < PASSOS; k++) {
    for (let j = -J; j <= J; j++) r[k * ATIVIDADES.length + bruto[(k + j + PASSOS) % PASSOS]] += 1 / (2 * J + 1);
  }
  ROTINA.set(chave, r);
  return r;
}

/** peso de visibilidade de uma atividade para uma persona (ambulante trabalha na rua; o resto, não) */
const visAtividade = (p: Persona, a: Atividade): number => ((config.personas[p] as { visivel?: Record<string, number> }).visivel?.[a]) ?? (config.atividades as Record<string, number>)[a];

/** Fração da persona que está na rua (visível) à `hora`, em dia útil ou fim de semana. */
export function visivelDe(p: Persona, hora: number, fds: boolean, out?: Float64Array): number {
  const r = rotina(p, fds);
  const x = (mod24(hora) * 6) % PASSOS, k0 = Math.floor(x), k1 = (k0 + 1) % PASSOS, f = x - k0;
  let v = 0;
  for (let a = 0; a < ATIVIDADES.length; a++) {
    const frac = r[k0 * ATIVIDADES.length + a] * (1 - f) + r[k1 * ATIVIDADES.length + a] * f;
    const w = frac * visAtividade(p, ATIVIDADES[a]);
    if (out) out[a] = w;
    v += w;
  }
  return v;
}

/** Densidade típica (por 100 m de via) de uma classe pura à `hora`: pico × Σ personas (mistura × visível) × fator de fim de semana. */
export function densidadeClasse(c: Classe, hora: number, fds: boolean): number {
  const cl = config.classes[c], mist = cl.mistura as Record<Persona, number>;
  let v = 0;
  for (const p of PERSONAS) if (mist[p]) v += mist[p] * visivelDe(p, hora, fds);
  return cl.pico * v * (fds ? (config.fimDeSemana as Record<string, number>)[c] ?? 1 : 1);
}

/** Sorteia a persona e a atividade de quem está visível agora numa célula (u1, u2 em [0, 1)). */
export function sortearPersonaAtividade(pesosClasse: ArrayLike<number>, hora: number, fds: boolean, u1: number, u2: number): { persona: Persona; atividade: Atividade } {
  const w = new Float64Array(PERSONAS.length);
  let tot = 0;
  for (let c = 0; c < CLASSES.length; c++) {
    if (!pesosClasse[c]) continue;
    const mist = config.classes[CLASSES[c]].mistura as Record<Persona, number>;
    for (let i = 0; i < PERSONAS.length; i++) { const x = pesosClasse[c] * (mist[PERSONAS[i]] ?? 0) * visivelDe(PERSONAS[i], hora, fds); w[i] += x; tot += x; }
  }
  let r = u1 * (tot || 1), i = 0;
  for (; i < PERSONAS.length - 1; i++) { r -= w[i]; if (r <= 0) break; }
  const persona = PERSONAS[i];
  const at = new Float64Array(ATIVIDADES.length);
  const total = visivelDe(persona, hora, fds, at) || 1;
  let q = u2 * total, a = 0;
  for (; a < ATIVIDADES.length - 1; a++) { q -= at[a]; if (q <= 0) break; }
  return { persona, atividade: ATIVIDADES[a] };
}

// ── grade de células ──────────────────────────────────────────────────────────────────

export interface Grade {
  n: number;
  cel: number;
  /** pesos das 8 classes por célula (somam 1) */
  peso: Float32Array;
  /** reforço de POI por célula: [paradas, estações] (contagem) */
  poi: Float32Array;
  /** comprimento de via (m) por célula, preenchido por `somarVias` */
  via: Float32Array;
  /** índice de construção (área de piso / área da célula) */
  far: Float32Array;
}

export interface EntradaGrade {
  real: CidadeReal;
  /** distância até a água (m) num ponto */
  distAgua: (x: number, z: number) => number;
  /** [x, z] de cada parada de ônibus (achatado) */
  paradas?: ArrayLike<number>;
  estacoes?: { x: number; z: number }[];
}

export const celulaDe = (g: Pick<Grade, 'n' | 'cel'>, x: number, z: number): number => {
  const i = Math.floor((x + BUILD_HALF) / g.cel), j = Math.floor((z + BUILD_HALF) / g.cel);
  return i < 0 || j < 0 || i >= g.n || j >= g.n ? -1 : j * g.n + i;
};

/** Monta a grade de classes a partir dos prédios reais, da água, dos bairros do centro e das praças. */
export function construirGrade(e: EntradaGrade, cel: number = config.celula): Grade {
  const n = Math.ceil((2 * BUILD_HALF) / cel);
  const N = n * n, nc = CLASSES.length;
  const area = new Float32Array(N * 5); // por tipo de prédio: residencial, comercial, industrial, serviço, religioso
  const R = e.real, P = R.predios;
  for (let i = 0; i < P.length; i += CAMPOS_PREDIO) {
    const k = celulaDe({ n, cel }, P[i], P[i + 1]);
    if (k < 0) continue;
    area[k * 5 + Math.min(4, Math.max(0, P[i + 6]))] += P[i + 3] * P[i + 4] * Math.max(1, P[i + 5]);
  }
  const far = new Float32Array(N), peso = new Float32Array(N * nc), poi = new Float32Array(N * 2), via = new Float32Array(N);
  const rg = config.regiao;
  // bairros do centro: nós do OSM com esses nomes
  const centros: [number, number][] = [];
  if (R.bairros && R.nomesBairros) for (let i = 0; i < R.bairros.length; i += 4) if (rg.centros.includes(R.nomesBairros[R.bairros[i + 3]])) centros.push([R.bairros[i], R.bairros[i + 1]]);
  // praças: vegetação de parque (140) na grade de 32 m do arquivo
  const verde = bytesDe(R, 'verde'), vRes = verde ? Math.round(Math.sqrt(verde.length)) : 0, vCel = vRes ? 16384 / vRes : 1;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const k = j * n + i, x = -BUILD_HALF + (i + 0.5) * cel, z = -BUILD_HALF + (j + 0.5) * cel;
    const dAgua = e.distAgua(x, z);
    if (dAgua <= 2) continue; // dentro da água: ninguém anda ali (peso zero em todas as classes)
    const a = area[k * 5], c = area[k * 5 + 1], ind = area[k * 5 + 2], sv = area[k * 5 + 3] + area[k * 5 + 4];
    const tot = a + c + ind + sv;
    far[k] = tot / (cel * cel);
    const construido = smooth(rg.far0, rg.far1, far[k]);
    // distância ao centro mais perto → peso do centro
    let dc = Infinity;
    for (const [cx, cz] of centros) { const d = Math.hypot(cx - x, cz - z); if (d < dc) dc = d; }
    const wCentro = (1 - smooth(rg.centroRaio * 0.45, rg.centroRaio, dc)) * Math.min(1, construido * 1.3 + 0.2);
    // praça: fração da célula coberta por parque
    let pr = 0;
    if (vRes) {
      const v0 = Math.floor((x + 8192 - cel / 2) / vCel), v1 = Math.floor((x + 8192 + cel / 2) / vCel), u0 = Math.floor((z + 8192 - cel / 2) / vCel), u1 = Math.floor((z + 8192 + cel / 2) / vCel);
      let cnt = 0, tt = 0;
      for (let u = u0; u <= u1; u++) for (let v = v0; v <= v1; v++) { if (u < 0 || v < 0 || u >= vRes || v >= vRes) continue; tt++; if (verde![u * vRes + v] === 140) cnt++; }
      pr = tt ? cnt / tt : 0;
    }
    const wPraca = Math.min(1, pr * rg.pracaPeso * 1.5) * (1 - 0.5 * construido);
    const wOrla = (1 - smooth(rg.orlaDist0, rg.orlaDist1, dAgua)) * rg.orlaPeso;
    // o que sobra de cada célula vai para o uso do solo dominante (ou "vazio" onde quase não há prédio)
    const w = peso.subarray(k * nc, k * nc + nc);
    let resto = 1;
    const tira = (cl: Classe, v: number) => { const q = Math.min(resto, Math.max(0, v)); w[CLASSES.indexOf(cl)] += q; resto -= q; };
    tira('centro', wCentro);
    tira('orla', wOrla);
    tira('praca', wPraca);
    const tt = tot || 1;
    tira('vazio', resto * (1 - construido));
    const r2 = resto;
    tira('residencial', r2 * (a / tt));
    tira('comercial', r2 * (c / tt));
    tira('industrial', r2 * (ind / tt));
    tira('servico', r2 * (sv / tt));
    w[CLASSES.indexOf('vazio')] += resto; // sem nenhum prédio
  }
  const paradas = e.paradas;
  if (paradas) for (let i = 0; i + 1 < paradas.length; i += 3) { const k = celulaDe({ n, cel }, paradas[i], paradas[i + 1]); if (k >= 0) poi[k * 2]++; }
  for (const s of e.estacoes ?? []) { const k = celulaDe({ n, cel }, s.x, s.z); if (k >= 0) poi[k * 2 + 1]++; }
  return { n, cel, peso, poi, via, far };
}

/** Soma o comprimento de via (m) de cada célula (para o modelo agregado). `pontos` = [x, z, comprimento] de cada trecho. */
export function somarVias(g: Grade, trechos: Iterable<[number, number, number]>) {
  g.via.fill(0);
  for (const [x, z, L] of trechos) { const k = celulaDe(g, x, z); if (k >= 0) g.via[k] += L; }
}

/** Densidade na célula `k` (pedestres por 100 m de via) à `hora`. `cache` evita recalcular as classes a cada célula. */
export class Densidade {
  private hora = NaN; private fds = false;
  private porClasse = new Float64Array(CLASSES.length);
  private reforco = [0, 0];
  constructor(readonly g: Grade) {}

  preparar(hora: number, fds: boolean) {
    if (hora === this.hora && fds === this.fds) return;
    this.hora = hora; this.fds = fds;
    for (let c = 0; c < CLASSES.length; c++) this.porClasse[c] = densidadeClasse(CLASSES[c], hora, fds);
    const p = config.pois;
    this.reforco = [p.parada.pico * curva(p.parada.curva, hora), p.estacao.pico * curva(p.estacao.curva, hora)];
  }

  celula(k: number): number {
    if (k < 0) return 0;
    const { peso, poi } = this.g, nc = CLASSES.length;
    let d = 0;
    for (let c = 0; c < nc; c++) d += peso[k * nc + c] * this.porClasse[c];
    d += this.reforco[0] * Math.min(1, poi[k * 2] / 2) + this.reforco[1] * Math.min(1, poi[k * 2 + 1]);
    return d;
  }

  em(x: number, z: number): number { return this.celula(celulaDe(this.g, x, z)); }

  /** Pedestres ao ar livre na cidade inteira (modelo agregado): Σ densidade × comprimento de via ÷ 100. */
  total(): number {
    let t = 0;
    for (let k = 0; k < this.g.via.length; k++) if (this.g.via[k] > 0) t += this.celula(k) * this.g.via[k] / 100;
    return t;
  }
}

/** Dia da semana (0 = domingo) de uma data do jogo. */
export const diaDaSemana = (ano: number, mes: number, dia: number) => new Date(ano, mes - 1, dia).getDay();
export const fimDeSemana = (dow: number) => dow === 0 || dow === 6;
