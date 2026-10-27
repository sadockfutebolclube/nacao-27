/**
 * Clima diário (Fase 6): sorteia o tempo de cada dia a partir das normais reais da capital
 * (ERA5 1991–2020) com persistência de chuva, anomalia de temperatura AR(1) e o ciclo El Niño/La Niña.
 * Deriva os estados que alimentam storylets e efeitos visuais: temporal, enchente, estiagem,
 * secura da vegetação, onda de calor, fumaça de queimadas, ressaca e geada.
 */
import type { MesClima, NormaisUF } from '../../data/clima';
import type { Rng } from '../core/rng';

export type Enso = 'neutro' | 'el-nino' | 'la-nina';
export type Alerta = 'nenhum' | 'temporal' | 'enchente' | 'estiagem' | 'calor' | 'frio' | 'queimadas' | 'ressaca';

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const DIAS_MES = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export interface ParamsClima {
  normais: NormaisUF | null;
  regiao: string;
  bioma: string;
  litoral: boolean;
  /** latitude da capital (para o fallback sem dados) */
  latitude: number;
}

export interface ResumoClima {
  estacao: 'verão' | 'outono' | 'inverno' | 'primavera';
  periodo: 'chuvoso' | 'seco' | 'transição';
  temp: number; tMax: number; tMin: number;
  chuvaHoje: number;
  /** chuva concentrada à tarde (convectiva) */
  convectiva: boolean;
  chuva3d: number; chuva7d: number; chuva30d: number;
  /** chuva normal esperada em 30 dias */
  normal30: number;
  enso: Enso;
  /** 0–1: intensidade dos fenômenos (para eventos e visual) */
  enchente: number; estiagem: number; secura: number; calor: number; fumaca: number; ressaca: number; geada: number;
  diasCalor: number;
  alerta: Alerta;
}

export class Clima {
  readonly par: ParamsClima;
  /** chuva dos últimos 60 dias (mm), mais recente no fim */
  hist: number[] = [];
  anomalia = 0;
  enso: Enso = 'neutro';
  diasCalor = 0;
  enchente = 0;
  ressacaDias = 0;
  fumaca = 0;
  ontemChoveu = false;
  resumo: ResumoClima;

  constructor(par: ParamsClima) {
    this.par = par;
    // o jogo começa em 1º de janeiro: os últimos 60 dias "choveram" a normal de novembro/dezembro
    const n11 = this.normais(11), n12 = this.normais(12);
    this.hist = [...Array(30).fill(n11.chuva / 30), ...Array(30).fill(n12.chuva / 31)];
    this.resumo = this.vazio();
  }

  /** Normais do mês (com fallback sintético pela latitude quando não há arquivo). */
  normais(mes: number): MesClima {
    const n = this.par.normais?.meses[mes - 1];
    if (n) return n;
    const lat = Math.abs(this.par.latitude);
    const verao = mes === 12 || mes <= 3;
    const tMed = 27 - lat * 0.3 + (verao ? 1.5 : -2) * (lat / 15);
    const chuva = this.par.regiao === 'Nordeste' ? (mes >= 3 && mes <= 7 ? 180 : 40) : verao ? 200 : mes >= 6 && mes <= 8 ? 40 : 100;
    return { tMed, tMax: tMed + 5, tMin: tMed - 5, chuva, diasChuva: chuva / 12, p99: 70, tMaxP95: tMed + 9 };
  }

  private vazio(): ResumoClima {
    const n = this.normais(1);
    return {
      estacao: 'verão', periodo: 'chuvoso', temp: n.tMed, tMax: n.tMax, tMin: n.tMin, chuvaHoje: 0, convectiva: false,
      chuva3d: 0, chuva7d: 0, chuva30d: n.chuva, normal30: n.chuva, enso: 'neutro',
      enchente: 0, estiagem: 0, secura: 0, calor: 0, fumaca: 0, ressaca: 0, geada: 0, diasCalor: 0, alerta: 'nenhum',
    };
  }

  /** Multiplicador de chuva do ENSO por região (efeitos clássicos no Brasil). */
  private fatorEnso(mes: number): { chuva: number; temp: number } {
    const r = this.par.regiao;
    if (this.enso === 'el-nino') {
      if (r === 'Sul') return { chuva: 1.35, temp: 0.2 };
      if (r === 'Nordeste' || r === 'Norte') return { chuva: mes >= 2 && mes <= 6 ? 0.6 : 0.8, temp: 0.8 };
      return { chuva: 1, temp: 0.6 };
    }
    if (this.enso === 'la-nina') {
      if (r === 'Sul') return { chuva: 0.65, temp: -0.2 };
      if (r === 'Nordeste' || r === 'Norte') return { chuva: 1.25, temp: -0.3 };
      return { chuva: 1, temp: -0.3 };
    }
    return { chuva: 1, temp: 0 };
  }

  /** Passo diário. `drenagem` (0–1) reduz a enchente na capital; `contencao` não entra aqui. */
  diario(mes: number, diaMes: number, rng: Rng, drenagem = 0): ResumoClima {
    // ENSO muda no meio do ano (frequências aproximadas: 25% El Niño, 25% La Niña, 50% neutro)
    if (mes === 7 && diaMes === 1) {
      const r = rng.next();
      const ant = this.enso;
      this.enso = r < 0.25 ? 'el-nino' : r < 0.5 ? 'la-nina' : 'neutro';
      if (ant === this.enso && this.enso !== 'neutro' && rng.chance(0.5)) this.enso = 'neutro'; // raramente dura 2 anos
    }
    // normais interpoladas entre o mês atual e o vizinho (transição suave)
    const n0 = this.normais(mes);
    const viz = diaMes > 15 ? (mes % 12) + 1 : ((mes + 10) % 12) + 1;
    const n1 = this.normais(viz);
    const w = Math.abs(diaMes - 15.5) / 31;
    const mix = (k: keyof MesClima) => n0[k] * (1 - w) + n1[k] * w;
    const enso = this.fatorEnso(mes);

    // chuva: cadeia de Markov (persistência) + volume exponencial com cauda de temporal
    const dias = DIAS_MES[mes - 1];
    // persistência (Markov de 2 estados) com a mesma frequência estacionária das normais
    const p = clamp((mix('diasChuva') / dias) * Math.sqrt(enso.chuva), 0.01, 0.9);
    const p1 = Math.min(0.95, p * 1.35);
    const p0 = (p * (1 - p1)) / (1 - p);
    let chuva = 0;
    if (rng.chance(this.ontemChoveu ? p1 : p0)) {
      const mediaDia = (mix('chuva') / Math.max(0.5, mix('diasChuva'))) * Math.sqrt(enso.chuva);
      const p99 = mix('p99');
      // os temporais (3,5% dos dias chuvosos) saem da conta para conservar a chuva média
      const k = clamp((mediaDia - 0.041 * p99) / (0.965 * mediaDia), 0.3, 1);
      chuva = -Math.log(Math.max(1e-6, 1 - rng.next())) * mediaDia * k;
      if (rng.chance(0.035)) chuva = Math.max(chuva, p99 * rng.range(0.85, 1.5)); // temporal
      chuva = Math.max(1, chuva);
    }
    this.ontemChoveu = chuva >= 1;
    this.hist.push(chuva);
    if (this.hist.length > 60) this.hist.shift();
    const soma = (k: number) => this.hist.slice(-k).reduce((a, b) => a + b, 0);
    const c3 = soma(3), c7 = soma(7), c30 = soma(30), c60 = soma(60);

    // temperatura: anomalia AR(1); dia chuvoso é mais fresco
    const g = Math.sqrt(-2 * Math.log(Math.max(1e-9, rng.next()))) * Math.cos(2 * Math.PI * rng.next());
    this.anomalia = 0.82 * this.anomalia + 0.9 * g + 0.1 * enso.temp;
    const frescor = chuva > 10 ? 2.2 : chuva > 1 ? 1 : -0.4;
    const temp = mix('tMed') + this.anomalia - frescor * 0.5;
    const tMax = mix('tMax') + this.anomalia * 1.2 - frescor;
    const tMin = mix('tMin') + this.anomalia * 0.8;

    // onda de calor: máxima acima do P95 do mês por dias seguidos
    const p95 = mix('tMaxP95');
    this.diasCalor = tMax > p95 - 0.5 ? this.diasCalor + 1 : 0;
    const calor = clamp((tMax - p95 + 1.5) / 4, 0, 1) * (this.diasCalor >= 2 ? 1 : 0.5);

    // enchente: chuva intensa em 1–3 dias contra a drenagem
    const p99 = Math.max(25, mix('p99'));
    const pico = Math.max(chuva / p99, c3 / (1.7 * p99));
    const novo = clamp((pico - 0.75) * 1.4 * (1 - 0.6 * drenagem), 0, 1);
    this.enchente = Math.max(novo, this.enchente * 0.68);

    // estiagem: déficit de 60 dias contra o normal — só conta quando o normal é chuvoso
    const normal60 = (mix('chuva') / dias) * 60;
    const estiagem = normal60 > 70 ? clamp(1 - c60 / (normal60 * 0.75), 0, 1) : 0;
    // secura visual da vegetação (estação seca ou estiagem): pouca chuva em 30 dias
    const bioSeco = this.par.bioma === 'caatinga' ? 1.3 : this.par.bioma === 'cerrado' || this.par.bioma === 'pantanal' ? 1.15 : this.par.bioma === 'amazonia' ? 0.6 : 0.8;
    const secura = clamp((1 - c30 / 70) * bioSeco, 0, 1);

    // fumaça de queimadas: seca + biomas de fogo + julho a outubro
    const fogo = ['cerrado', 'amazonia', 'pantanal', 'caatinga'].includes(this.par.bioma) && mes >= 7 && mes <= 10;
    this.fumaca = clamp(this.fumaca * 0.93 + (fogo ? 0.06 * secura * (1 + (this.enso === 'el-nino' ? 0.5 : 0)) : 0) - (chuva > 5 ? 0.25 : 0), 0, 1);

    // ressaca: frentes frias no litoral Sul/Sudeste (maio a setembro)
    if (this.ressacaDias > 0) this.ressacaDias--;
    else if (this.par.litoral && (this.par.regiao === 'Sul' || this.par.regiao === 'Sudeste') && mes >= 5 && mes <= 9 && rng.chance(0.035)) this.ressacaDias = rng.int(2, 4);
    const ressaca = this.ressacaDias > 0 ? 1 : 0;

    const geada = clamp((3 - tMin) / 4, 0, 1);
    const convectiva = chuva > 0 && (mes >= 10 || mes <= 3) && this.par.regiao !== 'Nordeste';
    const estacao = mes === 12 || mes <= 2 ? 'verão' : mes <= 5 ? 'outono' : mes <= 8 ? 'inverno' : 'primavera';
    const normalMes = n0.chuva;
    const anual = this.par.normais ? this.par.normais.meses.reduce((a, m) => a + m.chuva, 0) / 12 : 100;
    const periodo = normalMes > anual * 1.25 ? 'chuvoso' : normalMes < anual * 0.6 ? 'seco' : 'transição';

    let alerta: Alerta = 'nenhum';
    if (this.enchente > 0.35) alerta = 'enchente';
    else if (chuva > p99 * 0.7) alerta = 'temporal';
    else if (calor > 0.5) alerta = 'calor';
    else if (this.fumaca > 0.5) alerta = 'queimadas';
    else if (estiagem > 0.6) alerta = 'estiagem';
    else if (ressaca) alerta = 'ressaca';
    else if (geada > 0.5) alerta = 'frio';

    this.resumo = {
      estacao, periodo, temp, tMax, tMin, chuvaHoje: chuva, convectiva, chuva3d: c3, chuva7d: c7, chuva30d: c30, normal30: (mix('chuva') / dias) * 30,
      enso: this.enso, enchente: this.enchente, estiagem, secura, calor, fumaca: this.fumaca, ressaca, geada, diasCalor: this.diasCalor, alerta,
    };
    return this.resumo;
  }

  serializar() {
    return { hist: this.hist, anomalia: this.anomalia, enso: this.enso, diasCalor: this.diasCalor, enchente: this.enchente, ressacaDias: this.ressacaDias, fumaca: this.fumaca, ontemChoveu: this.ontemChoveu, resumo: this.resumo };
  }

  restaurar(s: ReturnType<Clima['serializar']>) {
    Object.assign(this, { ...s, hist: [...s.hist], resumo: { ...s.resumo } });
  }
}
