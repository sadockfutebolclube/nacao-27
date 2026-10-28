/**
 * Rede de faixas do tráfego (Fase 29). Cada trecho (aresta) do grafo viário vira até dois SENTIDOS ("links"): a→b e, se não for
 * mão única, b→a. Cada link tem n faixas (as `lanes` do OSM quando há, senão as do tipo da via, divididas entre os dois sentidos),
 * comprimento, velocidade, tangentes nas pontas (para a regra da direita e as fases do semáforo) e os links de saída no nó final.
 * Puro: roda no Worker e nos testes.
 */
import { edgeEnds, faixasVia, larguraVia, ROAD_SPECS, sampleByLength, type RoadGraph } from '../../world/roads';

/** largura de uma faixa (m) */
export const LARGURA_FAIXA = 3.2;
export const MAX_FAIXAS = 4;

export interface Link {
  id: number;
  /** id da aresta no grafo e sentido (+1: a→b, −1: b→a) */
  edge: number; dir: 1 | -1;
  de: number; para: number;
  comp: number;
  nL: number;
  vmax: number;
  /** 0 rua, 1 avenida: quem vem pela de maior prioridade passa primeiro nos cruzamentos sem semáforo */
  prio: number;
  maoUnica: boolean;
  /** faz parte de uma rotatória (anel de mão única de ≤ 12 trechos e ≤ 300 m) */
  rot: boolean;
  /** tangente unitária no início e no fim, no sentido do link */
  t0x: number; t0z: number; t1x: number; t1z: number;
  /** ponto final (para consultas radiais) */
  fx: number; fz: number;
  /** semáforo no nó final */
  semaforo: boolean;
  /** link no sentido contrário da mesma aresta (−1 se mão única) */
  oposto: number;
  /** links que saem do nó final */
  saidas: number[];
  /** velocidade/offset: distância do centro da via ao centro da faixa k (m, positivo à direita no sentido do link) */
  largura: number;
}

export class Rede {
  links: Link[] = [];
  /** aresta → [link a→b, link b→a ou −1] */
  porAresta = new Map<number, [number, number]>();
  /** nó → links que chegam / saem */
  chegam = new Map<number, number[]>();
  partem = new Map<number, number[]>();
  grau = new Map<number, number>();
  nos = new Map<number, { x: number; z: number; semaforo: boolean; rot: boolean }>();
  /** índice espacial dos links para achar o mais perto de um ponto (células de 64 m) */
  private grade = new Map<number, number[]>();
  private comprimentos = new Map<number, { xs: Float32Array; zs: Float32Array; s: Float32Array }>();

  static de(g: RoadGraph): Rede {
    const r = new Rede();
    for (const n of g.nodes.values()) r.nos.set(n.id, { x: n.x, z: n.z, semaforo: !!n.semaforo, rot: false });
    for (const e of g.edges.values()) {
      if (!g.nodes.has(e.a) || !g.nodes.has(e.b)) continue;
      const [p0, c, p1] = edgeEnds(g, e);
      const { pts, length } = sampleByLength(p0, c, p1, 6);
      if (length < 1.5 || pts.length < 2) continue;
      const xs = new Float32Array(pts.length), zs = new Float32Array(pts.length), ss = new Float32Array(pts.length);
      pts.forEach((p, i) => { xs[i] = p.x; zs[i] = p.z; ss[i] = p.s; });
      r.comprimentos.set(e.id, { xs, zs, s: ss });
      const total = faixasVia(e);
      const nL = Math.max(1, Math.min(MAX_FAIXAS, e.maoUnica ? total : Math.floor(total / 2)));
      const vmax = ROAD_SPECS[e.type].velocidade;
      const prio = e.type === 'avenida' ? 1 : 0;
      const t0 = pts[0], t1 = pts[pts.length - 1];
      const lg = larguraVia(e);
      const mk = (dir: 1 | -1): Link => {
        const f = dir > 0 ? t1 : t0, i = dir > 0 ? t0 : t1;
        const k = dir;
        return {
          id: r.links.length, edge: e.id, dir, de: dir > 0 ? e.a : e.b, para: dir > 0 ? e.b : e.a, comp: length, nL, vmax, prio, maoUnica: !!e.maoUnica, rot: false,
          t0x: i.tx * k, t0z: i.tz * k, t1x: f.tx * k, t1z: f.tz * k, fx: f.x, fz: f.z,
          semaforo: !!g.nodes.get(dir > 0 ? e.b : e.a)?.semaforo, oposto: -1, saidas: [], largura: lg,
        };
      };
      const ida = mk(1);
      r.links.push(ida);
      let volta = -1;
      if (!e.maoUnica) { const v = mk(-1); r.links.push(v); volta = v.id; ida.oposto = v.id; v.oposto = ida.id; }
      r.porAresta.set(e.id, [ida.id, volta]);
    }
    for (const l of r.links) {
      (r.chegam.get(l.para) ?? r.chegam.set(l.para, []).get(l.para)!).push(l.id);
      (r.partem.get(l.de) ?? r.partem.set(l.de, []).get(l.de)!).push(l.id);
    }
    for (const [n, ls] of r.partem) r.grau.set(n, (ls.length) + (r.chegam.get(n)?.length ?? 0));
    for (const l of r.links) {
      l.saidas = (r.partem.get(l.para) ?? []).filter((o) => r.links[o].edge !== l.edge || (r.partem.get(l.para)?.length ?? 0) === 1);
    }
    r.marcarRotatorias();
    r.indexar();
    return r;
  }

  /** Rotatória: anel fechado de links de mão única (≤ 12 trechos, ≤ 300 m). */
  private marcarRotatorias() {
    for (const l of this.links) {
      if (!l.maoUnica || l.rot) continue;
      // caminha só por links de mão única, voltando ao nó inicial
      const pilha: { no: number; total: number; passos: number; via: number[] }[] = [{ no: l.para, total: l.comp, passos: 1, via: [l.id] }];
      let achou: number[] | null = null;
      while (pilha.length && !achou) {
        const it = pilha.pop()!;
        if (it.no === l.de) { achou = it.via; break; }
        if (it.passos >= 12) continue;
        for (const o of this.partem.get(it.no) ?? []) {
          const k = this.links[o];
          if (!k.maoUnica || it.via.includes(o) || it.total + k.comp > 300) continue;
          pilha.push({ no: k.para, total: it.total + k.comp, passos: it.passos + 1, via: [...it.via, o] });
        }
      }
      if (achou) for (const id of achou) { this.links[id].rot = true; this.nos.get(this.links[id].para)!.rot = true; }
    }
  }

  private indexar() {
    const CEL = 64;
    for (const l of this.links) {
      if (l.dir < 0) continue; // um por aresta basta
      const g = this.comprimentos.get(l.edge)!;
      const vistos = new Set<number>();
      for (let i = 0; i < g.xs.length; i++) {
        const k = Math.floor(g.xs[i] / CEL) * 100003 + Math.floor(g.zs[i] / CEL);
        if (!vistos.has(k)) { vistos.add(k); (this.grade.get(k) ?? this.grade.set(k, []).get(k)!).push(l.id); }
      }
    }
  }

  /** Posição e tangente de um link a `s` metros do começo (no sentido do link). */
  ponto(l: Link, s: number, out: { x: number; z: number; tx: number; tz: number }) {
    const g = this.comprimentos.get(l.edge)!;
    const ss = l.dir > 0 ? s : l.comp - s;
    const n = g.s.length;
    let lo = 0, hi = n - 1;
    while (lo < hi - 1) { const m = (lo + hi) >> 1; if (g.s[m] <= ss) lo = m; else hi = m; }
    const f = Math.min(1, Math.max(0, (ss - g.s[lo]) / Math.max(1e-6, g.s[hi] - g.s[lo])));
    out.x = g.xs[lo] + (g.xs[hi] - g.xs[lo]) * f; out.z = g.zs[lo] + (g.zs[hi] - g.zs[lo]) * f;
    const dx = (g.xs[hi] - g.xs[lo]) * l.dir, dz = (g.zs[hi] - g.zs[lo]) * l.dir, d = Math.hypot(dx, dz) || 1;
    out.tx = dx / d; out.tz = dz / d;
  }

  /** Link (sentido) mais perto de (x, z) dentro de `raio` m, com o `s` do ponto mais perto. */
  maisPerto(x: number, z: number, raio: number, sentido?: { tx: number; tz: number }): { link: number; s: number; d: number } | null {
    const CEL = 64, r = Math.ceil(raio / CEL);
    const cx = Math.floor(x / CEL), cz = Math.floor(z / CEL);
    let melhor: { link: number; s: number; d: number } | null = null;
    for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) {
      for (const id of this.grade.get((cx + i) * 100003 + (cz + j)) ?? []) {
        const l = this.links[id];
        const g = this.comprimentos.get(l.edge)!;
        for (let k = 0; k < g.xs.length - 1; k++) {
          const ax = g.xs[k], az = g.zs[k], bx = g.xs[k + 1], bz = g.zs[k + 1];
          const vx = bx - ax, vz = bz - az, ll = vx * vx + vz * vz || 1;
          const u = Math.min(1, Math.max(0, ((x - ax) * vx + (z - az) * vz) / ll));
          const d = Math.hypot(ax + vx * u - x, az + vz * u - z);
          if (d < raio && (!melhor || d < melhor.d)) {
            const s0 = g.s[k] + (g.s[k + 1] - g.s[k]) * u;
            let link = l.id, s = s0;
            if (sentido && l.oposto >= 0 && vx * sentido.tx + vz * sentido.tz < 0) { link = l.oposto; s = l.comp - s0; }
            else if (!sentido && l.oposto >= 0) { /* sem direção: o sentido a→b */ }
            melhor = { link, s, d };
          }
        }
      }
    }
    return melhor;
  }
}
