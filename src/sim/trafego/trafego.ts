/**
 * Tráfego microscópico (Fase 29), puro e determinístico — roda no Worker (src/sim/worker.ts) e nos testes.
 *
 *  • Seguir o líder: IDM (Treiber). a = a_max · [1 − (v/v0)⁴ − (s_desejado/s)²], s_desejado = s0 + v·T + v·Δv / (2·√(a·b)).
 *  • Troca de faixa: MOBIL (Kesting) — incentivo a' − a + p·(Δa dos seguidores) > Δa_th, com a segurança do novo seguidor ≥ −b_safe e
 *    um viés para a direita (mantenha a direita). Em via de mão dupla de uma faixa por sentido, ultrapassagem simples pela contramão
 *    quando o lado oposto está livre numa janela de 150 m.
 *  • Faixas: n por sentido, das `lanes` do OSM ou estimadas pelo tipo (rede.ts). Líder pelo vizinho ordenado da MESMA faixa
 *    (lista ordenada por faixa) e, na ponta do trecho, pelo primeiro da faixa seguinte; uma grade espacial de 16 m serve às consultas
 *    radiais (abrir passagem à ambulância, conflitos no cruzamento).
 *  • Cruzamentos: semáforo com as fases de semaforo.ts; sem semáforo, prioridade da via maior, regra da direita entre iguais,
 *    quem vira à esquerda cede ao que vem de frente; rotatória: quem entra cede a quem circula; ninguém para dentro do cruzamento
 *    sem espaço na saída.
 *  • Emergência: o veículo vai pela faixa da esquerda, passa no vermelho devagar; quem está à frente encosta à direita (ou muda de faixa
 *    à direita) e os que chegam ao cruzamento esperam.
 */
import { Rede, LARGURA_FAIXA, type Link } from './rede';
import { eixoSemaforo, faseSemaforo } from './semaforo';

/** comprimento (m) dos 12 tipos da frota (índices de Veiculos.tsx) */
export const COMPRIMENTO_TIPO = [4.5, 12.2, 2.2, 4.1, 4.7, 8.5, 4.8, 5.4, 5.3, 18.2, 4.8, 9.2];
const ONIBUS = new Set([1, 9]);
const PESADOS = new Set([1, 5, 9, 11]);
/** limites de aceleração/frenagem confortáveis (m/s²) e tempo de avanço (s) por tipo */
const A_MAX = [1.5, 0.9, 2.2, 1.5, 1.4, 0.8, 1.4, 1.2, 1.1, 0.8, 2.0, 0.8];
const T_AVANCO = [1.3, 1.6, 1.0, 1.3, 1.3, 1.7, 1.3, 1.4, 1.4, 1.6, 1.0, 1.6];
const B_CONF = 2.0, S0 = 2.0, DELTA = 4;
const MOBIL = { p: 0.3, limiar: 0.15, segura: 3.0, direita: 0.12 };
const CAP_FAIXA = 4;
export const F = { EMERG: 1, SIRENE: 2, PISCA_E: 4, PISCA_D: 8, FREIO: 16, PARADO: 32, ABRIU: 64, ULT: 128 } as const;

export interface FocoTrafego { x: number; z: number; raio: number }
export interface PedidoEmergencia {
  cena: number; x: number; z: number;
  /** veículos de resposta: índice na tabela de rótulos (`rotulos`), quantos, e segundos até chegarem */
  veiculos: { rotulo: string; n: number; chegadaS: number }[];
}

class Rng {
  constructor(private s: number) {}
  next() { this.s = (Math.imul(this.s, 1664525) + 1013904223) >>> 0; return this.s / 4294967296; }
  range(a: number, b: number) { return a + (b - a) * this.next(); }
  int(a: number, b: number) { return a + Math.floor(this.next() * (b - a + 1)); }
}

interface Pendente { t: number; cena: number; rotulo: string; caminho: number[]; sAlvo: number; lanePos: number }

export class Trafego {
  readonly rede: Rede;
  readonly cap: number;
  tempo = 0;
  foco: FocoTrafego = { x: 0, z: 0, raio: 1600 };
  alvo = 0;
  /** a frota genérica inclui ônibus e BRT? (não, quando os ônibus reais do GTFS estão ligados) */
  comOnibus = false;
  rotulos: string[] = [];

  // veículos (SoA)
  n = 0;
  ativo: Uint8Array; id: Int32Array; link: Int32Array; lane: Uint8Array; s: Float32Array; v: Float32Array; a: Float32Array;
  lat: Float32Array; latAlvo: Float32Array; tipo: Uint8Array; cor: Uint16Array; comp: Float32Array; v0: Float32Array; prox: Int32Array;
  flags: Uint16Array; espera: Float32Array; cd: Float32Array; emerg: Uint8Array; cena: Int32Array; rotuloIdx: Int16Array; sAlvo: Float32Array;
  fator: Float32Array; ultAlvo: Int32Array; longe: Float32Array;
  private rotaE = new Map<number, number[]>();
  private proxId = 1;
  private rng: Rng;
  private pendentes: Pendente[] = [];
  private cenasLiberadas = new Set<number>();
  private cenaXZ = new Map<number, { x: number; z: number }>();

  // listas por faixa
  private ord: Int32Array;
  private chave: Float64Array;
  private lider: Int32Array;
  private blocoIni = new Map<number, number>();
  private blocoFim = new Map<number, number>();
  private nOrd = 0;
  // grade espacial
  private grade = new Map<number, number[]>();
  private emergMov: number[] = [];
  /** reserva da entrada de um trecho/faixa: quem entra primeiro segura os outros por ~0,8 s (sem fusão simultânea) */
  private reservas = new Map<number, { t: number; i: number }>();
  private ultimos: number[] = [];

  /** estatísticas do último passo */
  stats = { ativos: 0, ms: 0, trocas: 0, ultrapassagens: 0, parados: 0, emergencias: 0, passos: 0 };

  constructor(rede: Rede, opts: { cap?: number; seed?: number } = {}) {
    this.rede = rede;
    const c = this.cap = opts.cap ?? 3000;
    this.rng = new Rng(opts.seed ?? 12345);
    this.ativo = new Uint8Array(c); this.id = new Int32Array(c); this.link = new Int32Array(c); this.lane = new Uint8Array(c);
    this.s = new Float32Array(c); this.v = new Float32Array(c); this.a = new Float32Array(c);
    this.lat = new Float32Array(c); this.latAlvo = new Float32Array(c); this.tipo = new Uint8Array(c); this.cor = new Uint16Array(c);
    this.comp = new Float32Array(c); this.v0 = new Float32Array(c); this.prox = new Int32Array(c).fill(-1);
    this.flags = new Uint16Array(c); this.espera = new Float32Array(c); this.cd = new Float32Array(c); this.emerg = new Uint8Array(c);
    this.cena = new Int32Array(c); this.rotuloIdx = new Int16Array(c).fill(-1); this.sAlvo = new Float32Array(c);
    this.fator = new Float32Array(c); this.ultAlvo = new Int32Array(c).fill(-1); this.longe = new Float32Array(c);
    this.ord = new Int32Array(c); this.chave = new Float64Array(c); this.lider = new Int32Array(c);
  }

  // ── faixas ──────────────────────────────────────────────────────────────────────────────────────
  /** deslocamento lateral (m, + à direita no sentido do link) do centro da faixa k (0 = a da direita) */
  latFaixa(l: Link, k: number): number {
    const w = LARGURA_FAIXA;
    return l.maoUnica ? ((l.nL - 1) / 2 - k) * w : (l.nL - k - 0.5) * w;
  }

  private construirFaixas() {
    let m = 0;
    for (let i = 0; i < this.n; i++) {
      if (!this.ativo[i]) continue;
      this.ord[m++] = i;
      this.chave[i] = (this.link[i] * CAP_FAIXA + this.lane[i]) * 1e5 + this.s[i];
    }
    this.nOrd = m;
    const sub = this.ord.subarray(0, m);
    sub.sort((x, y) => this.chave[x] - this.chave[y]);
    this.blocoIni.clear(); this.blocoFim.clear();
    for (let p = 0; p < m; p++) {
      const i = this.ord[p], k = this.link[i] * CAP_FAIXA + this.lane[i];
      if (p + 1 < m) { const j = this.ord[p + 1]; this.lider[i] = this.link[j] * CAP_FAIXA + this.lane[j] === k ? j : -1; } else this.lider[i] = -1;
      if (!this.blocoIni.has(k)) this.blocoIni.set(k, p);
      this.blocoFim.set(k, p + 1);
    }
    // grade espacial (posição aproximada pelo fim do link e s)
    this.grade.clear();
    for (let p = 0; p < m; p++) {
      const i = this.ord[p];
      const c = this.posXZ(i);
      const k = Math.floor(c[0] / 16) * 100003 + Math.floor(c[1] / 16);
      (this.grade.get(k) ?? this.grade.set(k, []).get(k)!).push(i);
    }
  }

  private tmp = { x: 0, z: 0, tx: 0, tz: 0 };
  private tmpXZ: [number, number] = [0, 0];
  posXZ(i: number): [number, number] {
    this.rede.ponto(this.rede.links[this.link[i]], this.s[i], this.tmp);
    this.tmpXZ[0] = this.tmp.x; this.tmpXZ[1] = this.tmp.z;
    return this.tmpXZ;
  }

  /** veículos (índices) a menos de `r` m de (x, z), pela grade espacial */
  perto(x: number, z: number, r: number, out: number[]): number[] {
    out.length = 0;
    const c0 = Math.floor((x - r) / 16), c1 = Math.floor((x + r) / 16), d0 = Math.floor((z - r) / 16), d1 = Math.floor((z + r) / 16);
    for (let cx = c0; cx <= c1; cx++) for (let cz = d0; cz <= d1; cz++) for (const i of this.grade.get(cx * 100003 + cz) ?? []) out.push(i);
    return out;
  }

  private primeiroDe(link: number, lane: number): number {
    const l = this.rede.links[link];
    const k = link * CAP_FAIXA + Math.min(lane, l.nL - 1);
    const p = this.blocoIni.get(k);
    return p === undefined ? -1 : this.ord[p];
  }
  private ultimoDe(link: number, lane: number): number {
    const k = link * CAP_FAIXA + lane;
    const f = this.blocoFim.get(k);
    return f === undefined ? -1 : this.ord[f - 1];
  }

  // ── IDM ─────────────────────────────────────────────────────────────────────────────────────────
  private idm(i: number, gap: number, vLider: number, v0 = this.v0[i]): number {
    const v = this.v[i], tp = this.tipo[i];
    const amax = A_MAX[tp];
    const livre = 1 - Math.pow(v / Math.max(0.1, v0), DELTA);
    if (!isFinite(gap)) return amax * livre;
    const g = Math.max(0.1, gap);
    const sStar = S0 + Math.max(0, v * T_AVANCO[tp] + (v * (v - vLider)) / (2 * Math.sqrt(amax * B_CONF)));
    return Math.max(-9, amax * (livre - (sStar / g) * (sStar / g)));
  }

  /** líder da faixa (e a distância livre) — pula veículos que "abriram passagem" quando quem pergunta é uma ambulância */
  private acharLider(i: number, ignoraAbriu: boolean): { gap: number; v: number; j: number } {
    const R = this.rede, l = R.links[this.link[i]];
    let j = this.lider[i];
    while (j >= 0 && ignoraAbriu && (this.flags[j] & F.ABRIU)) j = this.lider[j];
    if (j >= 0 && j !== i) return { gap: this.s[j] - this.comp[j] - this.s[i], v: this.v[j], j };
    const nl = this.prox[i];
    const resto = l.comp - this.s[i];
    if (nl >= 0 && resto < 140) {
      let f = this.primeiroDe(nl, this.lane[i]);
      while (f >= 0 && ignoraAbriu && (this.flags[f] & F.ABRIU)) f = this.lider[f];
      if (f >= 0) return { gap: resto + this.s[f] - this.comp[f], v: this.v[f], j: f };
    }
    return { gap: Infinity, v: 0, j: -1 };
  }

  // ── cruzamentos ─────────────────────────────────────────────────────────────────────────────────
  /** o veículo i tem de parar na linha do cruzamento? */
  private cruzamentoBloqueia(i: number, dEnd: number): boolean {
    const R = this.rede, l = R.links[this.link[i]];
    const v = this.v[i], emerg = this.emerg[i] === 1;
    const paraParar = (v * v) / (2 * B_CONF) + 0.5;
    // ninguém para dentro do cruzamento sem espaço na saída
    const nl = this.prox[i];
    if (nl >= 0 && dEnd < 25 && !emerg) {
      const k = R.links[nl];
      const faixa = Math.min(this.lane[i], k.nL - 1);
      const res = this.reservas.get(nl * CAP_FAIXA + faixa);
      if (res && res.t > this.tempo && res.i !== i && dEnd < 14) return true;
      const f = this.primeiroDe(nl, faixa);
      if (f >= 0) {
        const livre = this.s[f] - this.comp[f];
        if (livre < this.comp[i] + 1 || (livre < this.comp[i] + 3 && this.v[f] < 2)) return true;
      }
    }
    // emergência cruzando: quem chega espera
    if (!emerg && this.emergMov.length && dEnd < 50) {
      for (const e of this.emergMov) {
        const le = R.links[this.link[e]];
        if (le.para !== l.para || e === i) continue;
        if (le.comp - this.s[e] < 45 && this.v[e] > 2) return paraParar < dEnd - 1;
      }
    }
    // semáforo
    if (l.semaforo) {
      const fase = faseSemaforo(eixoSemaforo(l.t1x, l.t1z), this.tempo);
      if (fase !== 0) {
        if (emerg) return false;
        if (fase === 1 && paraParar > dEnd - 1.5) return false; // amarelo e já não dá para parar
        return true;
      }
      return false;
    }
    if ((R.grau.get(l.para) ?? 0) < 3) return false;
    if (emerg) return false;
    if (paraParar > dEnd - 0.5) return false; // já comprometido
    if (this.espera[i] > 12) return false; // quem esperou demais passa: evita impasse
    // prioridade
    const chegam = R.chegam.get(l.para) ?? [];
    const no = R.nos.get(l.para)!;
    const minhaSaida = this.prox[i] >= 0 ? R.links[this.prox[i]] : null;
    const esquerda = minhaSaida ? (l.t1x * minhaSaida.t0z - l.t1z * minhaSaida.t0x) < -0.45 : false;
    for (const o of chegam) {
      if (o === l.id) continue;
      const lo = R.links[o];
      for (let k = 0; k < lo.nL; k++) {
        const j = this.ultimoDe(o, k);
        if (j < 0) continue;
        const dj = lo.comp - this.s[j];
        if (dj > 40 || (dj / Math.max(1.5, this.v[j])) > 4 || this.flags[j] & F.PARADO) continue;
        if (no.rot && !l.rot && lo.rot) return true; // rotatória: quem circula passa
        if (no.rot) continue;
        const deFrente = (lo.t1x * l.t1x + lo.t1z * l.t1z) < -0.8;
        if (lo.prio > l.prio) return true;
        if (lo.prio < l.prio) { if (esquerda && deFrente) return true; continue; }
        // iguais: a da direita; e quem vira à esquerda cede ao que vem de frente
        const direitaX = -l.t1z, direitaZ = l.t1x;
        const daDireita = (lo.t1x * direitaX + lo.t1z * direitaZ) < -0.5;
        if (daDireita && (this.v[j] > 1.5 || this.espera[j] >= this.espera[i])) return true;
        if (esquerda && deFrente) return true;
      }
    }
    return false;
  }

  private escolherSaida(i: number, linkId: number): number {
    const R = this.rede, l = R.links[linkId];
    const rota = this.rotaE.get(i);
    if (rota && rota.length) {
      const prox = rota[0];
      if (l.saidas.includes(prox)) return prox;
    }
    if (!l.saidas.length) return -1;
    if (l.saidas.length === 1) return l.saidas[0];
    let tot = 0;
    const pesos = l.saidas.map((o) => { const k = R.links[o]; const w = 0.5 + Math.max(0, k.t0x * l.t1x + k.t0z * l.t1z) * 2 + (k.prio >= l.prio ? 0.5 : 0) + (k.edge === l.edge ? -10 : 0); tot += Math.max(0.05, w); return Math.max(0.05, w); });
    let r = this.rng.next() * tot;
    for (let q = 0; q < pesos.length; q++) { r -= pesos[q]; if (r <= 0) return l.saidas[q]; }
    return l.saidas[l.saidas.length - 1];
  }

  // ── criação ─────────────────────────────────────────────────────────────────────────────────────
  private livreIndice(): number {
    for (let i = 0; i < this.cap; i++) if (!this.ativo[i]) { if (i >= this.n) this.n = i + 1; return i; }
    return -1;
  }

  /** Cria um veículo comum; devolve o índice ou −1 (sem vaga ou sem espaço na faixa). */
  criar(link: number, s: number, lane: number, tipo: number, v: number, cor: number): number {
    const R = this.rede, l = R.links[link];
    lane = Math.min(lane, l.nL - 1);
    const comp = COMPRIMENTO_TIPO[tipo];
    // espaço na faixa (veículo à frente e atrás)
    for (let j = 0; j < this.n; j++) {
      if (!this.ativo[j] || this.link[j] !== link || this.lane[j] !== lane) continue;
      if (Math.abs(this.s[j] - s) < comp + this.comp[j] + 6) return -1;
    }
    const i = this.livreIndice();
    if (i < 0) return -1;
    this.ativo[i] = 1; this.id[i] = this.proxId++; this.link[i] = link; this.lane[i] = lane; this.s[i] = Math.min(s, l.comp - 0.5);
    this.v[i] = v; this.a[i] = 0; this.tipo[i] = tipo; this.cor[i] = cor; this.comp[i] = comp;
    this.fator[i] = this.rng.range(0.85, 1.1);
    this.v0[i] = l.vmax * this.fator[i] * (PESADOS.has(tipo) ? 0.85 : 1);
    this.lat[i] = this.latAlvo[i] = this.latFaixa(l, lane);
    this.flags[i] = 0; this.espera[i] = 0; this.cd[i] = this.rng.range(0, 2); this.emerg[i] = 0; this.cena[i] = -1; this.rotuloIdx[i] = -1;
    this.ultAlvo[i] = -1; this.longe[i] = 0; this.rotaE.delete(i);
    this.prox[i] = this.escolherSaida(i, link);
    return i;
  }

  private remover(i: number) { this.ativo[i] = 0; this.rotaE.delete(i); while (this.n > 0 && !this.ativo[this.n - 1]) this.n--; }

  // ── emergência ──────────────────────────────────────────────────────────────────────────────────
  /** Caminho (lista de links) que termina no link mais perto da cena, voltando ~`comp` m contra o sentido (como as viaturas chegam). */
  caminhoAteCena(x: number, z: number, comp: number): { caminho: number[]; sAlvo: number } | null {
    const R = this.rede;
    const alvo = R.maisPerto(x, z, 80);
    if (!alvo) return null;
    const caminho = [alvo.link];
    let total = alvo.s;
    let atual = alvo.link;
    for (let g = 0; g < 40 && total < comp; g++) {
      const l = R.links[atual];
      const vindo = (R.chegam.get(l.de) ?? []).filter((o) => R.links[o].edge !== l.edge && !caminho.includes(o));
      if (!vindo.length) break;
      const o = vindo[this.rng.int(0, vindo.length - 1)];
      caminho.unshift(o); total += R.links[o].comp; atual = o;
    }
    return { caminho, sAlvo: alvo.s };
  }

  /** Registra a chegada de viaturas a uma cena (Fase 26): nascem ~450 m antes e chegam no `chegadaS` pedido. */
  emergencia(p: PedidoEmergencia) {
    this.cenaXZ.set(p.cena, { x: p.x, z: p.z });
    this.cenasLiberadas.delete(p.cena);
    for (const v of p.veiculos) {
      const idx = this.rotulos.indexOf(v.rotulo);
      if (idx < 0) this.rotulos.push(v.rotulo);
      for (let k = 0; k < v.n; k++) {
        const rota = this.caminhoAteCena(p.x, p.z, 380 + this.rng.range(0, 160));
        if (!rota) continue;
        const R = this.rede;
        const dist = rota.caminho.slice(0, -1).reduce((a, id) => a + R.links[id].comp, 0) + rota.sAlvo;
        this.pendentes.push({ t: this.tempo + Math.max(0, v.chegadaS + k * 1.6 - dist / 13), cena: p.cena, rotulo: v.rotulo, caminho: rota.caminho, sAlvo: Math.max(6, rota.sAlvo - 7 * k), lanePos: k });
      }
    }
  }

  /** A cena acabou: as viaturas estacionadas voltam ao trânsito e somem a ~250 m. */
  liberarCena(cena: number) { this.cenasLiberadas.add(cena); }

  private nascerPendentes() {
    for (let q = this.pendentes.length - 1; q >= 0; q--) {
      const p = this.pendentes[q];
      if (this.cenasLiberadas.has(p.cena)) { this.pendentes.splice(q, 1); continue; }
      if (p.t > this.tempo) continue;
      const R = this.rede, primeiro = R.links[p.caminho[0]];
      const i = this.criar(p.caminho[0], 3, 0, 10, 8, 0);
      if (i < 0) { p.t = this.tempo + 1; continue; }
      this.pendentes.splice(q, 1);
      const ldx = this.rotulos.indexOf(p.rotulo);
      this.emerg[i] = 1; this.cena[i] = p.cena; this.rotuloIdx[i] = ldx; this.sAlvo[i] = p.sAlvo;
      this.flags[i] |= F.EMERG | F.SIRENE;
      this.tipo[i] = 10; this.comp[i] = this.rotulos[ldx]?.includes('firetruck') ? 9 : COMPRIMENTO_TIPO[10];
      this.v0[i] = 17; this.fator[i] = 1.3;
      this.rotaE.set(i, p.caminho.slice(1));
      this.prox[i] = p.caminho.length > 1 ? p.caminho[1] : -1;
      this.lane[i] = Math.max(0, primeiro.nL - 1); // faixa da esquerda
      this.latAlvo[i] = this.latFaixa(primeiro, this.lane[i]) - 0.9;
      this.lat[i] = this.latAlvo[i];
    }
  }

  // ── passo ───────────────────────────────────────────────────────────────────────────────────────
  step(dt: number) {
    const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
    // passos pequenos mantêm o IDM estável
    const sub = Math.max(1, Math.ceil(dt / 0.06));
    const h = dt / sub;
    this.stats.trocas = 0;
    for (let k = 0; k < sub; k++) this.passo(h);
    this.stats.passos++;
    this.stats.ms = typeof performance !== 'undefined' ? performance.now() - t0 : 0;
  }

  private passo(dt: number) {
    this.tempo += dt;
    if (this.reservas.size > 4000) for (const [k, r] of this.reservas) if (r.t < this.tempo) this.reservas.delete(k);
    this.construirFaixas();
    this.nascerPendentes();
    const R = this.rede;
    this.emergMov.length = 0;
    this.ultimos.length = 0;
    for (let q = 0; q < this.nOrd; q++) {
      const i = this.ord[q];
      this.flags[i] &= ~(F.ABRIU | F.FREIO);
      if (this.emerg[i] === 2) this.flags[i] |= F.ABRIU; // viatura estacionada no meio-fio: as outras viaturas passam por ela
      if (this.emerg[i] === 1 && this.v[i] > 1) this.emergMov.push(i);
      if (this.flags[i] & F.ULT) this.ultimos.push(i);
    }
    // abrir passagem: quem está à frente de uma ambulância em movimento (70 m) encosta à direita
    const tmpP: number[] = [];
    for (const e of this.emergMov) {
      const le = R.links[this.link[e]];
      const sE = this.s[e];
      for (let k = 0; k < le.nL; k++) {
        let p = this.blocoIni.get(this.link[e] * CAP_FAIXA + k);
        const fim = this.blocoFim.get(this.link[e] * CAP_FAIXA + k);
        if (p === undefined || fim === undefined) continue;
        for (; p < fim; p++) { const j = this.ord[p]; if (j !== e && this.s[j] > sE - 4 && this.s[j] < sE + 70 && this.emerg[j] === 0) this.flags[j] |= F.ABRIU; }
      }
      const resto = le.comp - sE;
      if (resto < 70 && this.prox[e] >= 0) {
        const nl = R.links[this.prox[e]];
        for (let k = 0; k < nl.nL; k++) {
          const p = this.blocoIni.get(this.prox[e] * CAP_FAIXA + k), fim = this.blocoFim.get(this.prox[e] * CAP_FAIXA + k);
          if (p === undefined || fim === undefined) continue;
          for (let q = p; q < fim; q++) { const j = this.ord[q]; if (this.s[j] < 70 - resto && this.emerg[j] === 0) this.flags[j] |= F.ABRIU; }
        }
      }
    }
    void tmpP;

    // acelerações
    let parados = 0;
    for (let q = 0; q < this.nOrd; q++) {
      const i = this.ord[q];
      const l = R.links[this.link[i]];
      let v0 = this.v0[i];
      if (l.rot) v0 = Math.min(v0, 7);
      const dEnd = l.comp - this.s[i];
      // curva fechada à frente: reduz
      if (this.prox[i] >= 0 && dEnd < 35) {
        const o = R.links[this.prox[i]];
        const cos = o.t0x * l.t1x + o.t0z * l.t1z;
        if (cos < 0.75) v0 = Math.min(v0, (cos < 0.2 ? 4.5 : 7) + 0.4 * dEnd);
      }
      if (this.flags[i] & F.ABRIU) v0 = Math.min(v0, this.lane[i] === 0 ? 4 : 7);
      const lid = this.acharLider(i, this.emerg[i] === 1);
      let acc = this.idm(i, lid.gap, lid.v, v0);
      // ultrapassagem pela contramão: ignora o líder que está passando e enxerga quem vem de frente
      if (this.flags[i] & F.ULT) {
        const alvo = this.ultAlvo[i];
        if (alvo >= 0 && this.ativo[alvo] && this.id[alvo] > 0) {
          const outro = this.acharLider(i, false);
          if (outro.j === alvo) { const l2 = this.lider[alvo]; acc = l2 >= 0 ? this.idm(i, this.s[l2] - this.comp[l2] - this.s[i], this.v[l2], v0 * 1.15) : this.idm(i, Infinity, 0, v0 * 1.15); }
        }
      }
      // oposto: quem vem de frente em ultrapassagem
      if (l.oposto >= 0 && this.ultimos.length) {
        for (const u of this.ultimos) {
          if (this.link[u] !== l.oposto || u === i) continue;
          const pos = l.comp - this.s[u];
          const gap = pos - this.comp[u] - this.s[i] - 0;
          if (gap > -2 && gap < 120) acc = Math.min(acc, this.idm(i, Math.max(0.5, gap), -this.v[u], v0));
        }
      }
      // fim de linha sem saída: é uma parede (a fila para antes dela) e quem fica parado lá some em alguns segundos
      if (this.prox[i] < 0 && dEnd < 120) {
        acc = Math.min(acc, this.idm(i, Math.max(0.1, dEnd + 1), 0, v0));
        if (this.v[i] < 0.3 && dEnd < 6) this.espera[i] += dt;
      }
      // cruzamento
      if (dEnd < 70) {
        if (this.cruzamentoBloqueia(i, dEnd)) {
          acc = Math.min(acc, this.idm(i, Math.max(0.1, dEnd - 2.2), 0, v0));
          if (this.v[i] < 0.3 && dEnd < 6) this.espera[i] += dt;
        } else {
          this.espera[i] = Math.max(0, this.espera[i] - dt * 2);
        }
      }
      // ambulância estacionando na cena
      if (this.emerg[i] === 1 && (this.rotaE.get(i)?.length ?? 0) === 0) {
        const falta = this.sAlvo[i] - this.s[i];
        if (falta < 120) acc = Math.min(acc, this.idm(i, Math.max(0.1, falta + 1.5), 0, Math.min(v0, 8)));
        if (falta < 1.2 && this.v[i] < 0.5) { this.emerg[i] = 2; this.flags[i] |= F.PARADO; this.flags[i] &= ~F.EMERG; this.flags[i] |= F.SIRENE; this.latAlvo[i] = this.latFaixa(l, this.lane[i]) + 1.1; }
      }
      // cena liberada: a viatura sai
      if (this.emerg[i] === 2 && this.cenasLiberadas.has(this.cena[i])) { this.emerg[i] = 3; this.flags[i] &= ~(F.PARADO | F.SIRENE); this.latAlvo[i] = this.latFaixa(l, this.lane[i]); this.prox[i] = this.escolherSaida(i, this.link[i]); this.v0[i] = 11; }
      if (this.emerg[i] === 2) acc = 0;
      this.a[i] = acc;
      if (acc < -1.5) this.flags[i] |= F.FREIO;
      if (this.v[i] < 0.3) parados++;
    }
    this.stats.parados = parados;

    // integração e passagem de trecho
    for (let q = 0; q < this.nOrd; q++) {
      const i = this.ord[q];
      let v = Math.max(0, this.v[i] + this.a[i] * dt);
      if (this.emerg[i] === 2) v = 0;
      const ds = (this.v[i] + v) * 0.5 * dt;
      this.v[i] = v;
      this.s[i] += ds;
      let l = R.links[this.link[i]];
      // lateral
      const alvoLat = this.latAlvo[i];
      const dl = alvoLat - this.lat[i];
      this.lat[i] += Math.max(-1.7 * dt, Math.min(1.7 * dt, dl));
      if (this.s[i] >= l.comp) {
        const nl = this.prox[i];
        if (nl < 0) { // fim de linha sem saída
          this.s[i] = l.comp - 0.3; this.v[i] = 0;
          if (this.emerg[i] === 0 && this.espera[i] > 4) this.remover(i);
          continue;
        }
        const resto = this.s[i] - l.comp;
        const rota = this.rotaE.get(i);
        if (rota && rota[0] === nl) rota.shift();
        this.link[i] = nl; this.s[i] = resto;
        l = R.links[nl];
        this.lane[i] = Math.min(this.lane[i], l.nL - 1);
        this.reservas.set(nl * CAP_FAIXA + this.lane[i], { t: this.tempo + 0.8, i });
        this.latAlvo[i] = this.latFaixa(l, this.lane[i]) + (this.emerg[i] === 1 ? -0.9 : 0);
        this.lat[i] = this.latAlvo[i]; // o desenho cruza o nó sem teleporte porque a lateral é do próprio trecho
        this.v0[i] = this.emerg[i] ? this.v0[i] : l.vmax * this.fator[i] * (PESADOS.has(this.tipo[i]) ? 0.85 : 1);
        this.prox[i] = this.escolherSaida(i, nl);
        this.flags[i] &= ~(F.PISCA_E | F.PISCA_D);
      }
    }

    // troca de faixa (MOBIL) e ultrapassagem
    for (let q = 0; q < this.nOrd; q++) {
      const i = this.ord[q];
      if (!this.ativo[i] || this.emerg[i] === 2) continue;
      this.cd[i] -= dt;
      if (this.cd[i] > 0) continue;
      this.cd[i] = 0.7 + ((i * 7) % 5) * 0.1;
      this.decidirFaixa(i);
    }

    // despawn / spawn
    this.povoar(dt);
  }

  private lateralVizinho(i: number, lane2: number): { fLead: number; fFollow: number } {
    // vizinhos na faixa lane2: o primeiro à frente e o primeiro atrás de s[i]
    const k = this.link[i] * CAP_FAIXA + lane2;
    const p0 = this.blocoIni.get(k), p1 = this.blocoFim.get(k);
    let lead = -1, follow = -1;
    if (p0 === undefined || p1 === undefined) return { fLead: -1, fFollow: -1 };
    for (let p = p0; p < p1; p++) {
      const j = this.ord[p];
      if (j === i) continue;
      if (this.s[j] >= this.s[i]) { lead = j; break; }
      follow = j;
    }
    return { fLead: lead, fFollow: follow };
  }

  private acelCom(i: number, lider: number, v0 = this.v0[i]): number {
    if (lider < 0) return this.idm(i, Infinity, 0, v0);
    return this.idm(i, this.s[lider] - this.comp[lider] - this.s[i], this.v[lider], v0);
  }
  private acelSegue(seg: number, lider: number): number {
    if (seg < 0) return 0;
    if (lider < 0) return this.idm(seg, Infinity, 0);
    return this.idm(seg, this.s[lider] - this.comp[lider] - this.s[seg], this.v[lider]);
  }

  private decidirFaixa(i: number) {
    const R = this.rede, l = R.links[this.link[i]];
    const dEnd = l.comp - this.s[i];
    if (this.flags[i] & F.ULT) { this.verUltrapassagem(i); return; }
    // ambulância: faixa da esquerda
    const emerg = this.emerg[i] === 1;
    // quem abre passagem: tenta passar à direita
    const forcar = !!(this.flags[i] & F.ABRIU) && !emerg;
    if (l.nL >= 2 && dEnd > 18 && this.emerg[i] < 2) {
      const atual = this.lane[i];
      const lid = this.lider[i];
      const aAtual = this.acelCom(i, lid);
      let melhor = -1, melhorGanho = MOBIL.limiar;
      const candidatas = emerg ? [atual + 1] : forcar ? [atual - 1] : [atual - 1, atual + 1];
      for (const c of candidatas) {
        if (c < 0 || c >= l.nL) continue;
        const { fLead, fFollow } = this.lateralVizinho(i, c);
        // geometria: sem sobreposição
        if (fLead >= 0 && this.s[fLead] - this.comp[fLead] - this.s[i] < 1.5) continue;
        if (fFollow >= 0 && this.s[i] - this.comp[i] - this.s[fFollow] < 1.5) continue;
        // segurança do novo seguidor
        const aSegDepois = fFollow >= 0 ? this.idm(fFollow, this.s[i] - this.comp[i] - this.s[fFollow], this.v[i]) : 0;
        if (aSegDepois < -MOBIL.segura) continue;
        const aNova = this.acelCom(i, fLead);
        // regra assimétrica (mantenha a direita): só vai para a esquerda quem ganha com isso, não por "gentileza" com o de trás
        if (c > atual && !emerg && aNova - aAtual < 0.1) continue;
        const aSegAntes = this.acelSegue(fFollow, fLead);
        // antigo seguidor passa a seguir o meu antigo líder
        let antigoSeg = -1;
        { const k = this.link[i] * CAP_FAIXA + atual, p0 = this.blocoIni.get(k); if (p0 !== undefined) { for (let p = p0; p < (this.blocoFim.get(k) ?? p0); p++) { if (this.ord[p] === i) { antigoSeg = p > p0 ? this.ord[p - 1] : -1; break; } } } }
        const aAntSegAntes = antigoSeg >= 0 ? this.idm(antigoSeg, this.s[i] - this.comp[i] - this.s[antigoSeg], this.v[i]) : 0;
        const aAntSegDepois = antigoSeg >= 0 ? this.acelSegue(antigoSeg, lid) : 0;
        const viesDireita = c < atual ? MOBIL.direita : -MOBIL.direita;
        const ganho = emerg ? 1 : aNova - aAtual + MOBIL.p * ((aSegDepois - aSegAntes) + (aAntSegDepois - aAntSegAntes)) + viesDireita;
        if (forcar || emerg || ganho > melhorGanho) { if (ganho > melhorGanho || forcar || emerg) { melhor = c; melhorGanho = Math.max(melhorGanho, ganho); } }
      }
      if (melhor >= 0 && melhor !== atual) {
        this.lane[i] = melhor;
        this.latAlvo[i] = this.latFaixa(l, melhor) + (emerg ? -0.9 : 0);
        this.flags[i] = (this.flags[i] & ~(F.PISCA_E | F.PISCA_D)) | (melhor > atual ? F.PISCA_E : F.PISCA_D);
        this.cd[i] = 2.2;
        this.stats.trocas++;
        return;
      }
    } else if (l.nL === 1 && !l.maoUnica && l.oposto >= 0 && !emerg) {
      this.tentarUltrapassar(i);
    }
    // pisca-pisca apaga
    if (Math.abs(this.latAlvo[i] - this.lat[i]) < 0.15) this.flags[i] &= ~(F.PISCA_E | F.PISCA_D);
    // quem abre passagem na faixa da direita encosta no meio-fio
    if (forcar && this.lane[i] === 0) this.latAlvo[i] = this.latFaixa(l, 0) + 1.1;
    else if (!emerg && !(this.flags[i] & F.ULT) && this.emerg[i] === 0) this.latAlvo[i] = this.latFaixa(l, this.lane[i]);
  }

  /** Ultrapassagem simples em via de mão dupla (uma faixa por sentido): só com a faixa oposta livre numa janela de 150 m. */
  private tentarUltrapassar(i: number) {
    const R = this.rede, l = R.links[this.link[i]];
    const lid = this.lider[i];
    if (lid < 0 || this.emerg[lid] === 2) return;
    if (this.v[i] < 3 || this.s[i] < 25 || l.comp - this.s[i] < 160) return;
    const gap = this.s[lid] - this.comp[lid] - this.s[i];
    if (gap > 22 || this.v[lid] > this.v0[i] * 0.6 || this.v0[i] - this.v[lid] < 3 || this.comp[lid] > 13) return;
    // faixa oposta livre: ninguém vindo de frente (posição mapeada para o meu sentido) entre s−15 e s+150
    const op = this.rede.links[l.oposto];
    for (let k = 0; k < op.nL; k++) {
      const p0 = this.blocoIni.get(l.oposto * CAP_FAIXA + k), p1 = this.blocoFim.get(l.oposto * CAP_FAIXA + k);
      if (p0 === undefined || p1 === undefined) continue;
      for (let p = p0; p < p1; p++) { const j = this.ord[p]; const pos = l.comp - this.s[j]; if (pos > this.s[i] - 18 && pos < this.s[i] + 150 + this.v[j] * 4) return; }
    }
    // não ultrapassa se outro já está ultrapassando aqui
    for (const u of this.ultimos) if (this.link[u] === this.link[i] || this.link[u] === l.oposto) return;
    this.flags[i] |= F.ULT; this.ultAlvo[i] = lid;
    this.latAlvo[i] = -0.5 * LARGURA_FAIXA - 0.2;
    this.flags[i] |= F.PISCA_E;
    this.stats.ultrapassagens++;
  }
  private verUltrapassagem(i: number) {
    const lid = this.ultAlvo[i];
    const l = this.rede.links[this.link[i]];
    const ok = lid >= 0 && this.ativo[lid] && this.link[lid] === this.link[i];
    // passou do líder com folga, ou o líder saiu do trecho, ou chegou perto do fim
    if (!ok || this.s[i] - this.comp[i] > this.s[lid] + 9 || l.comp - this.s[i] < 35) {
      this.flags[i] &= ~(F.ULT | F.PISCA_E); this.flags[i] |= F.PISCA_D; this.ultAlvo[i] = -1;
      this.latAlvo[i] = this.latFaixa(l, this.lane[i]);
      this.cd[i] = 1.5;
    }
  }

  // ── população ───────────────────────────────────────────────────────────────────────────────────
  private povoar(dt: number) {
    const R = this.rede, f = this.foco;
    let ativos = 0, emergs = 0;
    for (let q = 0; q < this.nOrd; q++) {
      const i = this.ord[q];
      if (!this.ativo[i]) continue;
      if (this.emerg[i] === 0 || this.emerg[i] === 3) {
        const c = this.posXZ(i);
        const d = Math.hypot(c[0] - f.x, c[1] - f.z);
        if (d > f.raio * 1.5) { this.longe[i] += dt; if (this.longe[i] > 2) { this.remover(i); continue; } } else this.longe[i] = 0;
        if (this.emerg[i] === 3) {
          const cena = this.cenaXZ.get(this.cena[i]);
          if (!cena || Math.hypot(c[0] - cena.x, c[1] - cena.z) > 260) { this.remover(i); continue; }
        }
      } else emergs++;
      ativos++;
    }
    this.stats.ativos = ativos; this.stats.emergencias = emergs;
    // alvo menor que o que há: os mais longe do foco saem, aos poucos
    if (ativos > this.alvo + 8) {
      for (let r = 0; r < 4; r++) {
        let pior = -1, dPior = 0;
        for (let k = 0; k < 14; k++) {
          const i = this.rng.int(0, Math.max(0, this.n - 1));
          if (!this.ativo[i] || this.emerg[i] === 1 || this.emerg[i] === 2) continue;
          const c = this.posXZ(i), d = Math.hypot(c[0] - f.x, c[1] - f.z);
          if (d > dPior) { dPior = d; pior = i; }
        }
        if (pior >= 0 && dPior > f.raio * 0.4) this.remover(pior);
      }
    }
    // nasce até o alvo, poucos por passo, só dentro do raio do foco
    let tentativas = Math.min(6, Math.max(0, this.alvo - ativos));
    while (tentativas-- > 0) {
      const l = this.sortearLink();
      if (!l) break;
      const tipo = this.sortearTipo(l);
      const lane = this.rng.int(0, l.nL - 1);
      const s = this.rng.range(2, Math.max(3, l.comp - 2));
      const c = this.pontoDoLink(l, s);
      if (Math.hypot(c[0] - f.x, c[1] - f.z) > f.raio) continue;
      // mais perto do foco que o limite de nascimento fora de vista: ok (a câmera vê de cima; o render não depende disso)
      this.criar(l.id, s, lane, tipo, l.vmax * this.rng.range(0.4, 0.9), this.rng.int(0, 9999));
    }
    void R;
  }

  private linksNoFoco: number[] = [];
  private focoVisto = '';
  private sortearLink(): Link | null {
    const R = this.rede, f = this.foco;
    const chaveFoco = `${Math.round(f.x / 150)},${Math.round(f.z / 150)},${Math.round(f.raio)}`;
    if (chaveFoco !== this.focoVisto || !this.linksNoFoco.length) {
      this.focoVisto = chaveFoco;
      this.linksNoFoco = [];
      for (const l of R.links) {
        const no = R.nos.get(l.para);
        if (!no) continue;
        if (Math.hypot(no.x - f.x, no.z - f.z) < f.raio) this.linksNoFoco.push(l.id);
      }
    }
    if (!this.linksNoFoco.length) return null;
    // peso: avenida e trecho longo
    for (let k = 0; k < 6; k++) {
      const l = R.links[this.linksNoFoco[this.rng.int(0, this.linksNoFoco.length - 1)]];
      if (this.rng.next() < (l.prio ? 1 : 0.55) * Math.min(1, l.comp / 60)) return l;
    }
    return R.links[this.linksNoFoco[this.rng.int(0, this.linksNoFoco.length - 1)]];
  }
  private pontoDoLink(l: Link, s: number): [number, number] { this.rede.ponto(l, s, this.tmp); return [this.tmp.x, this.tmp.z]; }
  private sortearTipo(l: Link): number {
    const r = this.rng.next();
    if (this.comOnibus && r < (l.prio ? 0.14 : 0.04)) return l.prio && l.nL >= 2 && this.rng.next() < 0.3 ? 9 : 1;
    if (l.prio && l.nL >= 2) return r < 0.04 ? 5 : r < 0.1 ? 6 : r < 0.18 ? 2 : r < 0.24 ? 8 : r < 0.5 ? 0 : r < 0.74 ? 3 : r < 0.9 ? 4 : 7;
    return r < 0.03 ? 5 : r < 0.1 ? 6 : r < 0.2 ? 2 : r < 0.27 ? 8 : r < 0.27 + 0.05 ? 11 : r < 0.55 ? 0 : r < 0.78 ? 3 : r < 0.92 ? 4 : 7;
  }

  // ── saída para o desenho ────────────────────────────────────────────────────────────────────────
  /** Stride do snapshot (floats por veículo). */
  static readonly STRIDE = 10;
  /** id, aresta·2+(dir<0), s, lat, v, a, tipo, cor, flags, rótulo(+1)/cena. */
  snapshot(out?: Float32Array): { dados: Float32Array; n: number } {
    let m = 0;
    for (let i = 0; i < this.n; i++) if (this.ativo[i]) m++;
    const dados = out && out.length >= m * Trafego.STRIDE ? out : new Float32Array(m * Trafego.STRIDE);
    let k = 0;
    for (let i = 0; i < this.n; i++) {
      if (!this.ativo[i]) continue;
      const l = this.rede.links[this.link[i]], o = k * Trafego.STRIDE;
      dados[o] = this.id[i]; dados[o + 1] = l.edge * 2 + (l.dir < 0 ? 1 : 0); dados[o + 2] = this.s[i]; dados[o + 3] = this.lat[i];
      dados[o + 4] = this.v[i]; dados[o + 5] = this.a[i]; dados[o + 6] = this.tipo[i]; dados[o + 7] = this.cor[i];
      dados[o + 8] = this.flags[i]; dados[o + 9] = this.emerg[i] ? this.rotuloIdx[i] + 1 : 0;
      k++;
    }
    return { dados, n: m };
  }
}

export { ONIBUS };
