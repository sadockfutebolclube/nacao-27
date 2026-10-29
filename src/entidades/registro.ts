/**
 * Registro de entidades (ECS leve, Fase 25): tudo que o jogador pode clicar — pessoas, carros, ônibus, casas, prédios,
 * estabelecimentos, pontos turísticos — tem um ID numérico e componentes. O painel lê o registro, não o Three.js: quem
 * desenha (Pedestres, Veiculos, Onibus…) só PUBLICA aqui a caixa de cada entidade a cada quadro e registra uma "fonte"
 * para os dados vivos; quem desenha a ficha só pergunta pelo ID.
 *
 *  - Entidades dinâmicas (pessoas, carros, ônibus): a caixa de cada uma é reescrita a cada quadro (SoA em typed arrays,
 *    sem alocação); o ID dura enquanto o agente existe na tela.
 *  - Entidades estáticas (prédios, marcos): caixas num índice espacial em grade (CSR) montado uma vez por mundo.
 *  - Componentes: mapas nome → (id → dado). Os dados lentos (ficha gerada, investigação) ficam aqui; os vivos vêm da fonte.
 *  - Picking por raio: caixa orientada (slab) contra TODAS as entidades; os prédios entram por varredura da grade (DDA).
 */

export type TipoEntidade = 'pessoa' | 'carro' | 'onibus' | 'casa' | 'predio' | 'estabelecimento' | 'marco';

/** Caixa orientada: (x, y, z) é o centro da BASE; `yaw` gira em Y como `rotation.y` do Three (x' = c·x + s·z, z' = −s·x + c·z). */
export interface Caixa { x: number; y: number; z: number; yaw: number; w: number; h: number; d: number }

/** faixas de ID: dinâmicos contam de 1; estáticos têm faixa própria (o ID diz de onde veio) */
export const ID_BASE_LOTE = 200_000_000;
/** quiosques da orla (Fase 31): estabelecimentos que não são lotes */
export const ID_BASE_QUIOSQUE = 250_000_000;
export const ID_BASE_MARCO = 300_000_000;
export const ehEstatico = (id: number) => id >= ID_BASE_LOTE;
export const loteDeId = (id: number) => (id >= ID_BASE_LOTE && id < ID_BASE_QUIOSQUE ? id - ID_BASE_LOTE : -1);

export interface Acerto { id: number; t: number; tipo: TipoEntidade }

/** Raio × caixa orientada (método das placas). Devolve o t da entrada ou −1. */
export function raioCaixa(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, b: Caixa, margem = 0): number {
  const c = Math.cos(b.yaw), s = Math.sin(b.yaw);
  const px = ox - b.x, pz = oz - b.z;
  // mundo → local: lx = c·x − s·z ; lz = s·x + c·z
  const o = [c * px - s * pz, oy - b.y, s * px + c * pz];
  const d = [c * dx - s * dz, dy, s * dx + c * dz];
  const mn = [-b.w / 2 - margem, -margem, -b.d / 2 - margem], mx = [b.w / 2 + margem, b.h + margem, b.d / 2 + margem];
  let t0 = 0, t1 = Infinity;
  for (let k = 0; k < 3; k++) {
    if (Math.abs(d[k]) < 1e-9) { if (o[k] < mn[k] || o[k] > mx[k]) return -1; continue; }
    let a = (mn[k] - o[k]) / d[k], bb = (mx[k] - o[k]) / d[k];
    if (a > bb) { const tmp = a; a = bb; bb = tmp; }
    if (a > t0) t0 = a;
    if (bb < t1) t1 = bb;
    if (t0 > t1) return -1;
  }
  return t0;
}

/** Índice espacial das caixas estáticas: grade de células de `cel` m, cada caixa nas células que o retângulo dela toca. */
export class IndiceCaixas {
  readonly n: number;
  private readonly nx: number; private readonly nz: number;
  private readonly x0: number; private readonly z0: number;
  private readonly ini: Int32Array; private readonly itens: Int32Array;
  private readonly cx: Float32Array; private readonly cy: Float32Array; private readonly cz: Float32Array;
  private readonly yaw: Float32Array; private readonly w: Float32Array; private readonly h: Float32Array; private readonly d: Float32Array;
  readonly ids: Int32Array; readonly tipos: Uint8Array;
  private visto: Int32Array; private carimbo = 0;

  constructor(caixas: ArrayLike<Caixa>, ids: ArrayLike<number>, tipos: ArrayLike<number>, readonly cel = 32) {
    const n = (this.n = caixas.length);
    this.cx = new Float32Array(n); this.cy = new Float32Array(n); this.cz = new Float32Array(n); this.yaw = new Float32Array(n);
    this.w = new Float32Array(n); this.h = new Float32Array(n); this.d = new Float32Array(n);
    this.ids = Int32Array.from(ids as ArrayLike<number>); this.tipos = Uint8Array.from(tipos as ArrayLike<number>);
    let mnx = Infinity, mnz = Infinity, mxx = -Infinity, mxz = -Infinity;
    const meia = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      const b = caixas[i];
      this.cx[i] = b.x; this.cy[i] = b.y; this.cz[i] = b.z; this.yaw[i] = b.yaw; this.w[i] = b.w; this.h[i] = b.h; this.d[i] = b.d;
      const c = Math.abs(Math.cos(b.yaw)), s = Math.abs(Math.sin(b.yaw));
      const ex = c * b.w / 2 + s * b.d / 2, ez = s * b.w / 2 + c * b.d / 2;
      meia[i * 2] = ex; meia[i * 2 + 1] = ez;
      if (b.x - ex < mnx) mnx = b.x - ex; if (b.x + ex > mxx) mxx = b.x + ex;
      if (b.z - ez < mnz) mnz = b.z - ez; if (b.z + ez > mxz) mxz = b.z + ez;
    }
    if (!n) { mnx = mnz = 0; mxx = mxz = 1; }
    this.x0 = mnx; this.z0 = mnz;
    this.nx = Math.floor((mxx - mnx) / cel) + 1; this.nz = Math.floor((mxz - mnz) / cel) + 1;
    const cont = new Int32Array(this.nx * this.nz + 1);
    const faixa = (i: number) => [Math.floor((this.cx[i] - meia[i * 2] - this.x0) / cel), Math.floor((this.cx[i] + meia[i * 2] - this.x0) / cel), Math.floor((this.cz[i] - meia[i * 2 + 1] - this.z0) / cel), Math.floor((this.cz[i] + meia[i * 2 + 1] - this.z0) / cel)];
    for (let i = 0; i < n; i++) { const [a, b, c, d] = faixa(i); for (let j = c; j <= d; j++) for (let k = a; k <= b; k++) cont[j * this.nx + k + 1]++; }
    for (let k = 0; k < this.nx * this.nz; k++) cont[k + 1] += cont[k];
    this.ini = cont; this.itens = new Int32Array(cont[this.nx * this.nz]);
    const pos = cont.slice(0, this.nx * this.nz);
    for (let i = 0; i < n; i++) { const [a, b, c, d] = faixa(i); for (let j = c; j <= d; j++) for (let k = a; k <= b; k++) this.itens[pos[j * this.nx + k]++] = i; }
    this.visto = new Int32Array(n);
  }

  caixa(i: number, out: Caixa): Caixa {
    out.x = this.cx[i]; out.y = this.cy[i]; out.z = this.cz[i]; out.yaw = this.yaw[i]; out.w = this.w[i]; out.h = this.h[i]; out.d = this.d[i];
    return out;
  }

  /** índices das caixas cujas células tocam o quadrado de lado 2·raio em (x, z) (superconjunto; sem repetição) */
  perto(x: number, z: number, raio: number, saida: number[] = []): number[] {
    saida.length = 0;
    const a = Math.max(0, Math.floor((x - raio - this.x0) / this.cel)), b = Math.min(this.nx - 1, Math.floor((x + raio - this.x0) / this.cel));
    const c = Math.max(0, Math.floor((z - raio - this.z0) / this.cel)), d = Math.min(this.nz - 1, Math.floor((z + raio - this.z0) / this.cel));
    const sel = ++this.carimbo;
    for (let j = c; j <= d; j++) for (let k = a; k <= b; k++) {
      for (let q = this.ini[j * this.nx + k], f = this.ini[j * this.nx + k + 1]; q < f; q++) {
        const i = this.itens[q];
        if (this.visto[i] !== sel) { this.visto[i] = sel; saida.push(i); }
      }
    }
    return saida;
  }

  /** Primeiro acerto do raio nas caixas (varredura da grade célula a célula); t em unidades de |dir|. */
  raio(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxT: number, margem = 0): { i: number; t: number } | null {
    const sel = ++this.carimbo;
    const tmp: Caixa = { x: 0, y: 0, z: 0, yaw: 0, w: 0, h: 0, d: 0 };
    let melhor = -1, tm = maxT;
    // DDA em XZ
    let ci = Math.floor((ox - this.x0) / this.cel), cj = Math.floor((oz - this.z0) / this.cel);
    const sx = dx > 0 ? 1 : -1, sz = dz > 0 ? 1 : -1;
    const tDx = Math.abs(dx) < 1e-12 ? Infinity : this.cel / Math.abs(dx), tDz = Math.abs(dz) < 1e-12 ? Infinity : this.cel / Math.abs(dz);
    let tx = Math.abs(dx) < 1e-12 ? Infinity : ((dx > 0 ? this.x0 + (ci + 1) * this.cel : this.x0 + ci * this.cel) - ox) / dx;
    let tz = Math.abs(dz) < 1e-12 ? Infinity : ((dz > 0 ? this.z0 + (cj + 1) * this.cel : this.z0 + cj * this.cel) - oz) / dz;
    for (let passo = 0; passo < 4000; passo++) {
      if (ci >= 0 && cj >= 0 && ci < this.nx && cj < this.nz) {
        for (let q = this.ini[cj * this.nx + ci], f = this.ini[cj * this.nx + ci + 1]; q < f; q++) {
          const i = this.itens[q];
          if (this.visto[i] === sel) continue;
          this.visto[i] = sel;
          const t = raioCaixa(ox, oy, oz, dx, dy, dz, this.caixa(i, tmp), margem);
          if (t >= 0 && t < tm) { tm = t; melhor = i; }
        }
      }
      const proximo = Math.min(tx, tz);
      if (melhor >= 0 && tm <= proximo) break; // o melhor acerto já está antes da próxima célula
      if (proximo > maxT) break;
      if (tx < tz) { ci += sx; tx += tDx; } else { cj += sz; tz += tDz; }
      if ((ci < 0 && sx < 0) || (ci >= this.nx && sx > 0) || (cj < 0 && sz < 0) || (cj >= this.nz && sz > 0)) break; // saiu da grade pelo lado de fora
    }
    return melhor >= 0 ? { i: melhor, t: tm } : null;
  }
}

type Fonte = (id: number) => Record<string, unknown> | null;

/** Caixas dinâmicas de um grupo (pessoas, carros, ônibus): reescritas a cada quadro, sem alocação. */
class Dinamicos {
  n = 0;
  private cap = 2048;
  id = new Int32Array(this.cap); tipo = new Uint8Array(this.cap);
  cx = new Float32Array(this.cap); cy = new Float32Array(this.cap); cz = new Float32Array(this.cap);
  yaw = new Float32Array(this.cap); w = new Float32Array(this.cap); h = new Float32Array(this.cap); d = new Float32Array(this.cap);
  publicar(id: number, tipo: number, x: number, y: number, z: number, yaw: number, w: number, h: number, d: number) {
    if (this.n >= this.cap) this.crescer();
    const k = this.n++;
    this.id[k] = id; this.tipo[k] = tipo; this.cx[k] = x; this.cy[k] = y; this.cz[k] = z; this.yaw[k] = yaw; this.w[k] = w; this.h[k] = h; this.d[k] = d;
  }
  private crescer() {
    const c2 = this.cap * 2;
    const f = <T extends Float32Array | Int32Array | Uint8Array>(a: T): T => { const b = new (a.constructor as new (n: number) => T)(c2); b.set(a); return b; };
    this.id = f(this.id); this.tipo = f(this.tipo); this.cx = f(this.cx); this.cy = f(this.cy); this.cz = f(this.cz);
    this.yaw = f(this.yaw); this.w = f(this.w); this.h = f(this.h); this.d = f(this.d);
    this.cap = c2;
  }
  achar(id: number): number { for (let k = 0; k < this.n; k++) if (this.id[k] === id) return k; return -1; }
}

export class Registro {
  private contador = 0;
  /** componentes: nome → (id → dado) */
  private readonly comps = new Map<string, Map<number, unknown>>();
  private readonly fontes = new Map<string, Fonte[]>();
  private readonly grupos = new Map<string, Dinamicos>();

  // estáticos
  estatico: IndiceCaixas | null = null;
  estaticoVersao = -1;
  /** id estático → índice no `estatico` */
  indiceEstatico = new Map<number, number>();

  static readonly TIPOS: TipoEntidade[] = ['pessoa', 'carro', 'onibus', 'casa', 'predio', 'estabelecimento', 'marco'];

  novoId(): number { return ++this.contador; }

  // ── componentes ──
  definir<T>(comp: string, id: number, dado: T) { (this.comps.get(comp) ?? this.comps.set(comp, new Map()).get(comp)!).set(id, dado); }
  ler<T>(comp: string, id: number): T | undefined { return this.comps.get(comp)?.get(id) as T | undefined; }
  tem(comp: string, id: number) { return !!this.comps.get(comp)?.has(id); }
  remover(id: number) { for (const m of this.comps.values()) m.delete(id); }
  /** Poda um componente (as fichas das pessoas que saíram de cena, por exemplo). */
  limpar(comp: string, manter?: (id: number) => boolean) {
    const m = this.comps.get(comp);
    if (!m) return;
    if (!manter) m.clear(); else for (const id of [...m.keys()]) if (!manter(id)) m.delete(id);
  }

  /** Dados vivos de um tipo de entidade (posição, estado, velocidade…): quem desenha registra, o painel consulta. */
  fonte(tipo: string, f: Fonte): () => void {
    const l = this.fontes.get(tipo) ?? this.fontes.set(tipo, []).get(tipo)!;
    l.push(f);
    return () => { const i = l.indexOf(f); if (i >= 0) l.splice(i, 1); };
  }
  vivo(tipo: string, id: number): Record<string, unknown> | null {
    for (const f of this.fontes.get(tipo) ?? []) { const r = f(id); if (r) return r; }
    return null;
  }

  // ── dinâmicos: cada desenhista cuida do seu grupo ──
  private grupo(g: string) { return this.grupos.get(g) ?? this.grupos.set(g, new Dinamicos()).get(g)!; }
  iniciarQuadro(grupo: string) { this.grupo(grupo).n = 0; }
  publicar(grupo: string, id: number, tipo: TipoEntidade, x: number, y: number, z: number, yaw: number, w: number, h: number, d: number) {
    this.grupo(grupo).publicar(id, Registro.TIPOS.indexOf(tipo), x, y, z, yaw, w, h, d);
  }
  /** quantas entidades dinâmicas estão publicadas (todos os grupos) */
  get n() { let t = 0; for (const g of this.grupos.values()) t += g.n; return t; }

  tipoDinamico(id: number): TipoEntidade | null {
    for (const g of this.grupos.values()) { const k = g.achar(id); if (k >= 0) return Registro.TIPOS[g.tipo[k]]; }
    return null;
  }

  /** Caixa de qualquer entidade (dinâmica ou estática); null se não existe mais. */
  caixaDe(id: number, out: Caixa = { x: 0, y: 0, z: 0, yaw: 0, w: 0, h: 0, d: 0 }): Caixa | null {
    if (!ehEstatico(id)) {
      for (const g of this.grupos.values()) {
        const k = g.achar(id);
        if (k >= 0) { out.x = g.cx[k]; out.y = g.cy[k]; out.z = g.cz[k]; out.yaw = g.yaw[k]; out.w = g.w[k]; out.h = g.h[k]; out.d = g.d[k]; return out; }
      }
      return null;
    }
    const i = this.indiceEstatico.get(id);
    return i === undefined || !this.estatico ? null : this.estatico.caixa(i, out);
  }

  definirEstaticos(idx: IndiceCaixas, versao: number) {
    this.estatico = idx; this.estaticoVersao = versao;
    this.indiceEstatico = new Map();
    for (let i = 0; i < idx.n; i++) this.indiceEstatico.set(idx.ids[i], i);
  }

  /**
   * Picking: o acerto mais próximo do raio entre as pessoas, os carros, os ônibus e os prédios/marcos. `dir` unitário.
   * Pessoas e carros ganham margem (são pequenos para o clique); `filtro` limita os tipos aceitos.
   */
  picar(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxT: number, filtro?: (t: TipoEntidade) => boolean): Acerto | null {
    let melhor: Acerto | null = null;
    const b: Caixa = { x: 0, y: 0, z: 0, yaw: 0, w: 0, h: 0, d: 0 };
    for (const g of this.grupos.values()) {
      for (let k = 0; k < g.n; k++) {
        const tipo = Registro.TIPOS[g.tipo[k]];
        if (filtro && !filtro(tipo)) continue;
        b.x = g.cx[k]; b.y = g.cy[k]; b.z = g.cz[k]; b.yaw = g.yaw[k]; b.w = g.w[k]; b.h = g.h[k]; b.d = g.d[k];
        // margem cresce com a distância (fica clicável mesmo de longe)
        const dist = Math.hypot(b.x - ox, b.y - oy, b.z - oz);
        const margem = (tipo === 'pessoa' ? 0.45 : 0.3) + dist * 0.008;
        const t = raioCaixa(ox, oy, oz, dx, dy, dz, b, margem);
        if (t >= 0 && t < maxT && (!melhor || t < melhor.t)) melhor = { id: g.id[k], t, tipo };
      }
    }
    const e = this.estatico;
    if (e) {
      const h = e.raio(ox, oy, oz, dx, dy, dz, melhor ? melhor.t : maxT);
      if (h) {
        const tipo = Registro.TIPOS[e.tipos[h.i]];
        if (!filtro || filtro(tipo)) melhor = { id: e.ids[h.i], t: h.t, tipo };
      }
    }
    return melhor;
  }
}

/** O registro do jogo (um só; o Worker não o enxerga: é do lado do desenho). */
export const registro = new Registro();

if (import.meta.env?.DEV && typeof window !== 'undefined') (window as unknown as { __n27reg: Registro }).__n27reg = registro;
