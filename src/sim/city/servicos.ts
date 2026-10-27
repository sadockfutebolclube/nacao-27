/**
 * Cobertura de saúde, educação e segurança por lote (capacidade × distância) e criminalidade.
 * Um equipamento lotado atende pior: eficiência = capacidade ÷ população no raio.
 */
import { arquetipoPorId, equipamento, type Rede } from '../catalog';
import { FLAG } from '../protocol';
import type { Simulation } from '../simulation';

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

export const REDES_SOCIAIS = ['saude', 'educacao', 'seguranca'] as const;
export type RedeSocial = (typeof REDES_SOCIAIS)[number];

export interface ResumoServicos { saude: number; educacao: number; seguranca: number; crime: number; lotacao: Record<RedeSocial, number> }

export class ServicosSociais {
  saude = new Float32Array(0);
  educacao = new Float32Array(0);
  seguranca = new Float32Array(0);
  crime = new Float32Array(0);
  resumo: ResumoServicos = { saude: 0, educacao: 0, seguranca: 0, crime: 0, lotacao: { saude: 0, educacao: 0, seguranca: 0 } };

  /** Lotes foram recalculados: valores recomeçam e se ajustam no próximo dia. */
  redimensionar(n: number) {
    this.saude = new Float32Array(n);
    this.educacao = new Float32Array(n);
    this.seguranca = new Float32Array(n);
    this.crime = new Float32Array(n).fill(0.1);
  }

  /** Cobertura de uma rede num ponto (para favelas e para a interface). */
  coberturaEm(sim: Simulation, rede: Rede, x: number, z: number, eficiencias: Map<number, number>): number {
    let melhor = 0;
    for (const s of sim.services) {
      const eq = equipamento(s.eq);
      if (eq.rede !== rede || !eq.raio) continue;
      const d = Math.hypot(s.x - x, s.z - z);
      if (d >= eq.raio) continue;
      melhor = Math.max(melhor, (eficiencias.get(s.id) ?? 1) * (1 - (d / eq.raio) ** 2));
    }
    return melhor;
  }

  /** @param passo false = só recalcula coberturas (ao carregar um save), sem avançar a criminalidade */
  atualizar(sim: Simulation, passo = true) {
    const n = sim.lots.length;
    if (this.saude.length !== n) this.redimensionar(n);
    const lots = sim.lots;
    const eficiencias = new Map<number, number>();
    const lotacao: Record<RedeSocial, number> = { saude: 0, educacao: 0, seguranca: 0 };

    for (const rede of REDES_SOCIAIS) {
      const arr = this[rede];
      arr.fill(0);
      const facs = sim.services.filter((s) => equipamento(s.eq).rede === rede);
      let capTot = 0, demTot = 0;
      for (const s of facs) {
        const eq = equipamento(s.eq);
        const r = eq.raio!;
        // população atendida no raio (moradores formais + favelas)
        let pop = 0;
        for (let i = 0; i < n; i++) {
          if (!sim.arch[i] || !sim.occ[i]) continue;
          const l = lots[i];
          if (Math.abs(l.x - s.x) > r || Math.abs(l.z - s.z) > r) continue;
          if (arquetipoPorId(sim.arch[i]).moradores && Math.hypot(l.x - s.x, l.z - s.z) < r) pop += sim.occ[i];
        }
        pop += sim.favelas.populacaoNoRaio(s.x, s.z, r);
        // equipamento em área dominada funciona mal (tiroteio, fechamento)
        const dominio = sim.territorio.controleEm(s.x, s.z);
        const ef = Math.min(1, eq.capacidade / Math.max(1, pop)) * (1 - 0.45 * dominio);
        eficiencias.set(s.id, ef);
        capTot += eq.capacidade; demTot += pop;
        for (let i = 0; i < n; i++) {
          const l = lots[i];
          if (Math.abs(l.x - s.x) > r || Math.abs(l.z - s.z) > r) continue;
          const d = Math.hypot(l.x - s.x, l.z - s.z);
          if (d >= r) continue;
          const v = ef * (1 - (d / r) ** 2);
          if (v > arr[i]) arr[i] = v;
        }
      }
      lotacao[rede] = capTot > 0 ? demTot / capTot : 0;
    }

    // criminalidade por lote
    const ef = sim.init.efeitos;
    const W = sim.populacao * 0.5;
    const desemprego = W > 0 ? clamp((W - sim.empregos) / W, 0, 1) : 0;
    const fatorUF = 1 + 0.5 * (ef.criminalidade ?? 0);
    let somaS = 0, somaE = 0, somaSeg = 0, somaC = 0, pesos = 0;
    for (let i = 0; i < n; i++) {
      const l = lots[i];
      const terr = sim.territorio.controleEm(l.x, l.z);
      const abandonado = sim.flags[i] & FLAG.ABANDONADO ? 0.12 : 0;
      const alvo = clamp((0.06 + 0.32 * Math.pow(1 - sim.lv[i] / 100, 1.5) + 0.3 * desemprego + 0.55 * terr + abandonado - 0.35 * this.seguranca[i] + sim.crimeExtra) * fatorUF, 0, 1);
      if (passo) this.crime[i] += (alvo - this.crime[i]) * 0.1;
      if (sim.arch[i] && sim.occ[i] && arquetipoPorId(sim.arch[i]).moradores) {
        const w = sim.occ[i];
        somaS += this.saude[i] * w; somaE += this.educacao[i] * w; somaSeg += this.seguranca[i] * w; somaC += this.crime[i] * w; pesos += w;
      }
    }
    // favelas entram na média com a cobertura do ponto central
    for (const f of sim.favelas.ativas()) {
      const w = sim.favelas.populacao(f);
      if (!w) continue;
      const s = this.coberturaEm(sim, 'saude', f.cx, f.cz, eficiencias);
      const e = this.coberturaEm(sim, 'educacao', f.cx, f.cz, eficiencias);
      const sg = this.coberturaEm(sim, 'seguranca', f.cx, f.cz, eficiencias);
      f.cobertura = { saude: s, educacao: e, seguranca: sg };
      const c = clamp((0.25 + 0.7 * sim.territorio.controleEm(f.cx, f.cz) + 0.2 * desemprego - 0.3 * sg) * fatorUF * (f.status === 'urbanizada' ? 0.6 : 1), 0, 1);
      if (passo) f.crime += (c - f.crime) * 0.1;
      somaS += s * w; somaE += e * w; somaSeg += sg * w; somaC += f.crime * w; pesos += w;
    }
    this.resumo = pesos > 0
      ? { saude: somaS / pesos, educacao: somaE / pesos, seguranca: somaSeg / pesos, crime: somaC / pesos, lotacao }
      : { saude: 0, educacao: 0, seguranca: 0, crime: 0, lotacao };
  }
}
