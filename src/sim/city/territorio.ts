/**
 * Controle territorial: dois grupos criminosos fictícios disputam a cidade com o Estado numa
 * grade de 64 m. Crescem onde há pobreza e pouca presença policial, nascem nas favelas,
 * guerreiam entre si e recuam diante de delegacias, batalhões, bases comunitárias e operações.
 */
import { BUILD_HALF } from '../../world/constants';
import { equipamento } from '../catalog';
import type { Rng } from '../core/rng';
import type { Simulation } from '../simulation';

export const TERR_CELL = 64;
export const TERR_RES = (BUILD_HALF * 2) / TERR_CELL; // 192

/** Nomes fictícios — nenhum grupo real. */
export const GRUPOS = {
  1: { nome: 'Comando da Laje', sigla: 'CDL', tipo: 'facção', cor: '#e5484d' },
  2: { nome: 'Liga do Asfalto', sigla: 'LDA', tipo: 'milícia', cor: '#9b5de5' },
} as const;

export type Doutrina = 'confronto' | 'inteligencia' | 'prevencao';
export type PoliticaVans = 'combater' | 'tolerar' | 'regularizar';

export interface ResumoTerritorio {
  /** fração da população (formal + informal) por situação */
  estado: number; disputado: number; faccao: number; milicia: number;
  guerra: boolean;
  operacoes: { data: string; local: string; mortos: number; presos: number }[];
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

export class Territorio {
  F = new Float32Array(TERR_RES * TERR_RES);
  M = new Float32Array(TERR_RES * TERR_RES);
  /** presença policial (0–1) recalculada todo dia */
  P = new Float32Array(TERR_RES * TERR_RES);
  /** ocupação temporária após operação (decai) */
  ocupacao = new Float32Array(TERR_RES * TERR_RES);
  pop = new Float32Array(TERR_RES * TERR_RES);
  pobreza = new Float32Array(TERR_RES * TERR_RES);
  resumo: ResumoTerritorio = { estado: 1, disputado: 0, faccao: 0, milicia: 0, guerra: false, operacoes: [] };
  versao = 0;
  private ultimaOperacao = new Map<number, number>();

  idx(x: number, z: number): number {
    const i = clamp(Math.floor((x + BUILD_HALF) / TERR_CELL), 0, TERR_RES - 1);
    const j = clamp(Math.floor((z + BUILD_HALF) / TERR_CELL), 0, TERR_RES - 1);
    return j * TERR_RES + i;
  }

  /** Força do domínio criminoso no ponto (0 = Estado, 1 = domínio total). */
  controleEm(x: number, z: number): number {
    const k = this.idx(x, z);
    return Math.max(this.F[k], this.M[k]);
  }

  situacaoEm(x: number, z: number): { grupo: 0 | 1 | 2; forca: number; rotulo: string } {
    const k = this.idx(x, z);
    const f = this.F[k], m = this.M[k];
    const forca = Math.max(f, m);
    const grupo: 0 | 1 | 2 = forca < 0.3 ? 0 : f >= m ? 1 : 2;
    const rotulo = forca < 0.3 ? 'Presença do Estado' : forca < 0.6 ? `Disputado (${GRUPOS[grupo as 1 | 2].sigla})` : `Dominado: ${GRUPOS[grupo as 1 | 2].nome}`;
    return { grupo, forca, rotulo };
  }

  /** Passo diário. */
  atualizar(sim: Simulation, doutrina: Doutrina, vans: PoliticaVans) {
    const R = TERR_RES, N = R * R;
    const pop = this.pop, pob = this.pobreza;
    pop.fill(0); pob.fill(0);
    // população e pobreza (1 − valor do solo) por célula
    for (let i = 0; i < sim.lots.length; i++) {
      if (!sim.arch[i] || !sim.occ[i]) continue;
      const k = this.idx(sim.lots[i].x, sim.lots[i].z);
      pop[k] += sim.occ[i];
      pob[k] += sim.occ[i] * (1 - sim.lv[i] / 100);
    }
    const fonteF = new Float32Array(N), fonteM = new Float32Array(N);
    for (const f of sim.favelas.ativas()) {
      const informal = f.status === 'informal' || f.status === 'removendo';
      for (const c of f.casas) {
        const k = this.idx(c.x, c.z);
        const p = 3.3 * c.andares;
        pop[k] += p;
        pob[k] += p * (informal ? 0.95 : 0.55);
        if (informal) { if (f.grupo === 1) fonteF[k] += 0.0009; else fonteM[k] += 0.0009; }
        else if (f.status === 'urbanizando') { if (f.grupo === 1) fonteF[k] += 0.0003; else fonteM[k] += 0.0003; }
      }
    }
    for (let k = 0; k < N; k++) pob[k] = pop[k] > 0 ? pob[k] / pop[k] : 0;

    // presença policial
    const P = this.P;
    P.fill(0);
    for (const s of sim.services) {
      const eq = equipamento(s.eq);
      if (eq.rede !== 'seguranca' || !eq.raio) continue;
      const forca = s.eq === 'base' ? 1 : s.eq === 'batalhao' ? 0.85 : 0.7;
      const r = eq.raio;
      const i0 = Math.floor((s.x - r + BUILD_HALF) / TERR_CELL), i1 = Math.floor((s.x + r + BUILD_HALF) / TERR_CELL);
      const j0 = Math.floor((s.z - r + BUILD_HALF) / TERR_CELL), j1 = Math.floor((s.z + r + BUILD_HALF) / TERR_CELL);
      for (let j = Math.max(0, j0); j <= Math.min(R - 1, j1); j++) for (let i = Math.max(0, i0); i <= Math.min(R - 1, i1); i++) {
        const cx = -BUILD_HALF + (i + 0.5) * TERR_CELL, cz = -BUILD_HALF + (j + 0.5) * TERR_CELL;
        const d = Math.hypot(cx - s.x, cz - s.z);
        if (d < r) P[j * R + i] = Math.max(P[j * R + i], forca * (1 - (d / r) ** 2));
      }
    }
    for (let k = 0; k < N; k++) {
      this.ocupacao[k] *= 0.975;
      P[k] = Math.min(1, P[k] + this.ocupacao[k]);
    }

    const F = this.F, M = this.M;
    const nF = new Float32Array(N), nM = new Float32Array(N);
    for (let j = 0; j < R; j++) for (let i = 0; i < R; i++) {
      const k = j * R + i;
      let sf = 0, sm = 0, c = 0;
      if (i > 0) { sf += F[k - 1]; sm += M[k - 1]; c++; }
      if (i < R - 1) { sf += F[k + 1]; sm += M[k + 1]; c++; }
      if (j > 0) { sf += F[k - R]; sm += M[k - R]; c++; }
      if (j < R - 1) { sf += F[k + R]; sm += M[k + R]; c++; }
      nF[k] = sf / c; nM[k] = sm / c;
    }
    const prev = doutrina === 'prevencao' ? 0.6 : 1;
    const decF = doutrina === 'confronto' ? 1.15 : 1;
    const decM = doutrina === 'inteligencia' ? 1.7 : 1;
    const vansM = vans === 'tolerar' ? 1.5 : vans === 'combater' ? 0.8 : 1;
    let guerra = 0;
    for (let k = 0; k < N; k++) {
      if (pop[k] < 1 && !fonteF[k] && !fonteM[k]) { F[k] *= 0.97; M[k] *= 0.97; continue; }
      const livre = Math.max(0, 1 - F[k] - M[k]);
      const sem = 1 - P[k];
      const gF = 0.025 * (0.35 * F[k] + 0.65 * nF[k]) * pob[k] * sem * livre * prev;
      const gM = 0.018 * (0.35 * M[k] + 0.65 * nM[k]) * (0.35 + 0.65 * pob[k]) * sem * livre * vansM * (doutrina === 'inteligencia' ? 0.7 : 1);
      let f = F[k] + gF - (0.035 * P[k] + 0.002) * F[k] * decF + fonteF[k] * sem;
      let m = M[k] + gM - (0.035 * P[k] + 0.002) * M[k] * decM + fonteM[k] * sem;
      if (f > 0.2 && m > 0.2) { f -= 0.006; m -= 0.006; guerra++; }
      F[k] = clamp(f, 0, 1); M[k] = clamp(m, 0, 1);
    }

    // resumo por população
    let tot = 0, est = 0, dis = 0, fac = 0, mil = 0;
    for (let k = 0; k < N; k++) {
      const p = pop[k];
      if (p <= 0) continue;
      tot += p;
      const forca = Math.max(F[k], M[k]);
      if (forca < 0.3) est += p;
      else if (forca < 0.6) dis += p;
      else if (F[k] >= M[k]) fac += p;
      else mil += p;
    }
    this.resumo = {
      ...this.resumo,
      estado: tot ? est / tot : 1, disputado: tot ? dis / tot : 0, faccao: tot ? fac / tot : 0, milicia: tot ? mil / tot : 0,
      guerra: guerra > 3,
    };
    if (guerra > 3) sim.noticia(`Guerra entre o ${GRUPOS[1].nome} e a ${GRUPOS[2].nome}: tiroteio fecha escolas e postos de saúde em ${guerra} quarteirões.`, 'ruim', 'guerra', 30);
    if (this.resumo.milicia > 0.08 && vans === 'tolerar') sim.noticia(`Vans piratas da ${GRUPOS[2].nome} dominam o transporte nos bairros da zona norte; "taxa de segurança" vira regra no comércio.`, 'alerta', 'milVans', 60);
    this.versao++;
  }

  /**
   * Operação policial num raio de 280 m: derruba o domínio na hora e deixa ocupação temporária.
   * Retorna mortos e presos; o custo político e a letalidade dependem da doutrina e das câmeras.
   */
  operacao(x: number, z: number, dia: number, rng: Rng, doutrina: Doutrina, cameras: boolean, data: string, local: string): { ok: boolean; msg?: string; mortos: number; presos: number } {
    const chave = this.idx(x, z);
    const ultima = this.ultimaOperacao.get(chave) ?? -999;
    if (dia - ultima < 20) return { ok: false, msg: 'A tropa ainda está na área: aguarde algumas semanas antes de outra operação aqui', mortos: 0, presos: 0 };
    const R = TERR_RES, raio = 280;
    let forca = 0, popArea = 0, maxForca = 0, dominadas = 0;
    const corte = doutrina === 'confronto' ? 0.2 : doutrina === 'inteligencia' ? 0.4 : 0.5;
    const area: number[] = [];
    // 1ª passada: avalia a área
    for (let j = 0; j < R; j++) for (let i = 0; i < R; i++) {
      const cx = -BUILD_HALF + (i + 0.5) * TERR_CELL, cz = -BUILD_HALF + (j + 0.5) * TERR_CELL;
      if (Math.hypot(cx - x, cz - z) > raio) continue;
      const k = j * R + i;
      area.push(k);
      const fk = Math.max(this.F[k], this.M[k]);
      maxForca = Math.max(maxForca, fk);
      if (fk > 0.1) { forca += fk; dominadas++; popArea += this.pop[k]; }
    }
    if (!area.length) return { ok: false, msg: 'Fora da área do município', mortos: 0, presos: 0 };
    if (maxForca < 0.15) return { ok: false, msg: 'Não há presença criminosa relevante aqui', mortos: 0, presos: 0 };
    // 2ª passada: a tropa entra
    for (const k of area) {
      this.F[k] *= corte; this.M[k] *= corte;
      this.ocupacao[k] = Math.min(0.8, this.ocupacao[k] + (doutrina === 'confronto' ? 0.6 : 0.45));
      this.ultimaOperacao.set(k, dia);
    }
    const media = forca / Math.max(1, dominadas);
    const fatorD = doutrina === 'confronto' ? 1.5 : doutrina === 'inteligencia' ? 0.6 : 0.8;
    const lambda = media * (2 + popArea / 2500) * fatorD * (cameras ? 0.55 : 1);
    let mortos = 0;
    for (let t = 0; t < 12; t++) if (rng.chance(lambda / 12)) mortos++;
    const presos = Math.round(media * (doutrina === 'inteligencia' ? 22 : 12) * (0.6 + rng.next()));
    this.resumo.operacoes.unshift({ data, local, mortos, presos });
    this.resumo.operacoes = this.resumo.operacoes.slice(0, 12);
    this.versao++;
    return { ok: true, mortos, presos };
  }

  /** Semeia domínio inicial onde nasce uma favela. */
  semear(x: number, z: number, grupo: 1 | 2, forca = 0.25) {
    const k = this.idx(x, z);
    if (grupo === 1) this.F[k] = Math.max(this.F[k], forca); else this.M[k] = Math.max(this.M[k], forca);
  }

  serializar() {
    // sem arredondar: save/load precisa ser determinístico
    const r = (a: Float32Array) => [...a];
    return { F: r(this.F), M: r(this.M), ocupacao: r(this.ocupacao), operacoes: this.resumo.operacoes, ultima: [...this.ultimaOperacao] };
  }

  restaurar(s: ReturnType<Territorio['serializar']>) {
    this.F = Float32Array.from(s.F); this.M = Float32Array.from(s.M); this.ocupacao = Float32Array.from(s.ocupacao);
    this.resumo.operacoes = s.operacoes;
    this.ultimaOperacao = new Map(s.ultima);
  }
}
