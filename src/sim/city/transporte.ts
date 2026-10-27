/**
 * Mobilidade: linhas de ônibus, BRT, metrô e teleférico + modelo agregado de deslocamentos
 * casa–trabalho (gravitacional), escolha modal (logit) e alocação de carros nas vias com
 * congestionamento (BPR). Roda uma vez por semana de jogo no Worker.
 */
import { BUILD_HALF } from '../../world/constants';
import { compactar, comprimentoPolilinha, dijkstra, noMaisProximo, rotaPorVias } from '../../world/rotas';
import type { RoadGraph, V2 } from '../../world/roads';
import { arquetipoPorId } from '../catalog';
import type { PoliticaVans } from './territorio';
import type { Simulation } from '../simulation';

export type TipoLinha = 'onibus' | 'brt' | 'metro' | 'teleferico';

export interface DefLinha {
  nome: string;
  /** velocidade média em movimento (m/s) */
  vel: number;
  /** passageiros por veículo */
  cap: number;
  custoVeiculoMes: number;
  custoKmMes: number;
  /** tempo parado em cada parada (s) */
  parada: number;
  /** intervalo-alvo inicial (s) */
  headway: number;
  /** obra paga pelo Tesouro estadual (null = paga pelo Programa da Capital) */
  obra: { custoKm: number; custoEstacao: number; mesesBase: number; mesesKm: number } | null;
  custoParada: number;
  custoVeiculo: number;
}

export const TIPOS_LINHA: Record<TipoLinha, DefLinha> = {
  onibus: { nome: 'Ônibus', vel: 5, cap: 80, custoVeiculoMes: 38_000, custoKmMes: 0, parada: 25, headway: 600, obra: null, custoParada: 90_000, custoVeiculo: 650_000 },
  brt: { nome: 'BRT', vel: 7.5, cap: 170, custoVeiculoMes: 72_000, custoKmMes: 25_000, parada: 35, headway: 300, obra: { custoKm: 22e6, custoEstacao: 5e6, mesesBase: 10, mesesKm: 2 }, custoParada: 0, custoVeiculo: 0 },
  metro: { nome: 'Metrô', vel: 11, cap: 1200, custoVeiculoMes: 600_000, custoKmMes: 350_000, parada: 30, headway: 240, obra: { custoKm: 480e6, custoEstacao: 150e6, mesesBase: 30, mesesKm: 5 }, custoParada: 0, custoVeiculo: 0 },
  teleferico: { nome: 'Teleférico', vel: 5, cap: 10, custoVeiculoMes: 9_000, custoKmMes: 150_000, parada: 0, headway: 20, obra: { custoKm: 75e6, custoEstacao: 20e6, mesesBase: 14, mesesKm: 4 }, custoParada: 0, custoVeiculo: 0 },
};

const CORES: Record<TipoLinha, string[]> = {
  onibus: ['#f5b942', '#3ee0b0', '#5b8def', '#ff8a3d', '#c77dff', '#9bd85e', '#4dd0e1', '#ff6fa8'],
  brt: ['#e5484d', '#e8742a'],
  metro: ['#2e86de', '#e84118', '#16a085', '#8e44ad', '#f39c12'],
  teleferico: ['#ffd166'],
};
const NOMES_METRO = ['Azul', 'Vermelha', 'Verde', 'Lilás', 'Amarela'];

export interface Linha {
  id: number;
  tipo: TipoLinha;
  nome: string;
  cor: string;
  paradas: V2[];
  caminho: number[];
  comprimento: number;
  frota: number;
  status: 'operando' | 'em_obra';
  obraUid: number | null;
  arestas: number[];
  passageirosDia: number;
  lotacao: number;
  headwayMin: number;
  tempoVoltaMin: number;
}

export interface ResumoMobilidade {
  tempoMedio: number;
  modal: { carro: number; coletivo: number; ape: number; informal: number };
  passageirosDia: number;
  viagensDia: number;
  congestionamento: number;
  vias: { edge: number; vc: number }[];
}

export const ZONA_CELL = 256;
export const ZONA_RES = (BUILD_HALF * 2) / ZONA_CELL; // 12

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const CAP_VIA = { rua: 1400, avenida: 4200 };
const VEL_LIVRE = { rua: 8.3, avenida: 13.9 };

export class Transporte {
  linhas: Linha[] = [];
  nextId = 1;
  tarifa = 4.9;
  vans: PoliticaVans = 'tolerar';
  versaoLinhas = 0;
  /** volume na hora de pico (veículos/h) por aresta */
  volumes = new Map<number, number>();
  zonaTempo = new Float32Array(ZONA_RES * ZONA_RES).fill(30);
  resumo: ResumoMobilidade = { tempoMedio: 0, modal: { carro: 0, coletivo: 0, ape: 0, informal: 0 }, passageirosDia: 0, viagensDia: 0, congestionamento: 0, vias: [] };

  // ── Linhas ──────────────────────────────────────────────────────────────────────

  /** Planeja uma linha (sem efeitos): traçado, extensão e custos. Usado pelo preview e pela criação. */
  static planejar(g: RoadGraph, tipo: TipoLinha, paradas: V2[]): { ok: boolean; erro?: string; caminho: number[]; comprimento: number; arestas: number[]; custoCidade: number; custoObra: number; mesesObra: number; frota: number } {
    const def = TIPOS_LINHA[tipo];
    const falha = (erro: string) => ({ ok: false, erro, caminho: [], comprimento: 0, arestas: [], custoCidade: 0, custoObra: 0, mesesObra: 0, frota: 0 });
    if (paradas.length < 2) return falha('Coloque ao menos 2 paradas');
    let caminho: number[], comprimento: number, arestas: number[] = [];
    if (tipo === 'onibus' || tipo === 'brt') {
      const r = rotaPorVias(g, paradas, tipo === 'brt');
      if (!r.ok) return falha(r.erro!);
      caminho = r.caminho; comprimento = r.comprimento; arestas = r.arestas;
    } else {
      caminho = paradas.flatMap((p) => [p.x, p.z]);
      comprimento = comprimentoPolilinha(caminho);
      for (let i = 1; i < paradas.length; i++) {
        const d = Math.hypot(paradas[i].x - paradas[i - 1].x, paradas[i].z - paradas[i - 1].z);
        if (tipo === 'metro' && d < 350) return falha('Estações de metrô precisam de pelo menos 350 m entre si');
        if (tipo === 'metro' && d > 2500) return falha('Trecho de metrô longo demais entre estações (máx. 2,5 km)');
        if (tipo === 'teleferico' && d > 1200) return falha('Vão de teleférico longo demais (máx. 1,2 km entre estações)');
      }
      if (tipo === 'teleferico' && comprimento > 4000) return falha('Teleférico de no máximo 4 km');
      if (tipo === 'metro' && comprimento > 15000) return falha('Linha de metrô de no máximo 15 km por fase');
    }
    const km = comprimento / 1000;
    const tempoVolta = (2 * comprimento) / def.vel + paradas.length * 2 * def.parada;
    const frota = Math.max(2, Math.ceil(tempoVolta / def.headway));
    const custoCidade = def.obra ? 0 : paradas.length * def.custoParada + frota * def.custoVeiculo;
    const custoObra = def.obra ? km * def.obra.custoKm + paradas.length * def.obra.custoEstacao : 0;
    const mesesObra = def.obra ? Math.round(def.obra.mesesBase + def.obra.mesesKm * km) : 0;
    return { ok: true, caminho, comprimento, arestas, custoCidade, custoObra, mesesObra, frota };
  }

  criar(g: RoadGraph, tipo: TipoLinha, paradas: V2[], nomeBairro: string): { ok: boolean; erro?: string; linha?: Linha; plano?: ReturnType<typeof Transporte.planejar> } {
    const plano = Transporte.planejar(g, tipo, paradas);
    if (!plano.ok) return { ok: false, erro: plano.erro };
    const doTipo = this.linhas.filter((l) => l.tipo === tipo).length;
    const nome = tipo === 'onibus' ? `Linha ${101 + this.linhas.filter((l) => l.tipo === 'onibus').length}`
      : tipo === 'brt' ? `BRT ${['Orla', 'Centro', 'Norte', 'Oeste', 'Sul'][doTipo % 5]}`
        : tipo === 'metro' ? `Linha ${doTipo + 1} – ${NOMES_METRO[doTipo % NOMES_METRO.length]}`
          : `Teleférico do ${nomeBairro}`;
    const def = TIPOS_LINHA[tipo];
    const linha: Linha = {
      id: this.nextId++, tipo, nome, cor: CORES[tipo][doTipo % CORES[tipo].length], paradas: paradas.map((p) => ({ x: p.x, z: p.z })),
      caminho: plano.caminho, comprimento: plano.comprimento, frota: plano.frota,
      status: def.obra ? 'em_obra' : 'operando', obraUid: null, arestas: plano.arestas,
      passageirosDia: 0, lotacao: 0, headwayMin: 0, tempoVoltaMin: 0,
    };
    this.linhas.push(linha);
    this.versaoLinhas++;
    return { ok: true, linha, plano };
  }

  remover(id: number) {
    this.linhas = this.linhas.filter((l) => l.id !== id);
    this.versaoLinhas++;
  }

  /** As vias mudaram: refaz traçados de ônibus/BRT; linhas sem caminho são suspensas. */
  revalidar(g: RoadGraph): string[] {
    const suspensas: string[] = [];
    for (const l of this.linhas) {
      if (l.tipo !== 'onibus' && l.tipo !== 'brt') continue;
      const r = rotaPorVias(g, l.paradas, l.tipo === 'brt');
      if (r.ok) { l.caminho = r.caminho; l.comprimento = r.comprimento; l.arestas = r.arestas; }
      else suspensas.push(l.nome);
    }
    if (suspensas.length) this.linhas = this.linhas.filter((l) => !suspensas.includes(l.nome));
    this.versaoLinhas++;
    return suspensas;
  }

  financasMes(): { receita: number; custo: number } {
    let custo = 0;
    for (const l of this.linhas) {
      if (l.status !== 'operando') continue;
      const d = TIPOS_LINHA[l.tipo];
      custo += l.frota * d.custoVeiculoMes + (l.comprimento / 1000) * d.custoKmMes;
    }
    const passageiros = this.linhas.reduce((s, l) => s + l.passageirosDia, 0);
    return { receita: passageiros * 30 * this.tarifa * 0.8, custo };
  }

  // ── Modelo semanal ──────────────────────────────────────────────────────────────

  semanal(sim: Simulation) {
    const ZR = ZONA_RES, NZ = ZR * ZR;
    const res = new Float64Array(NZ), jobs = new Float64Array(NZ), lvSum = new Float64Array(NZ), sx = new Float64Array(NZ), sz = new Float64Array(NZ), peso = new Float64Array(NZ);
    const zonaDe = (x: number, z: number) => {
      const i = clamp(Math.floor((x + BUILD_HALF) / ZONA_CELL), 0, ZR - 1), j = clamp(Math.floor((z + BUILD_HALF) / ZONA_CELL), 0, ZR - 1);
      return j * ZR + i;
    };
    for (let i = 0; i < sim.lots.length; i++) {
      if (!sim.arch[i] || !sim.occ[i]) continue;
      const l = sim.lots[i];
      const k = zonaDe(l.x, l.z);
      const a = arquetipoPorId(sim.arch[i]);
      if (a.moradores) { res[k] += sim.occ[i]; lvSum[k] += sim.lv[i] * sim.occ[i]; }
      else jobs[k] += sim.occ[i];
      sx[k] += l.x * sim.occ[i]; sz[k] += l.z * sim.occ[i]; peso[k] += sim.occ[i];
    }
    for (const f of sim.favelas.ativas()) {
      const p = sim.favelas.populacao(f);
      const k = zonaDe(f.cx, f.cz);
      res[k] += p; lvSum[k] += p * (f.status === 'urbanizada' ? 30 : 12);
      sx[k] += f.cx * p; sz[k] += f.cz * p; peso[k] += p;
    }
    const cx = new Float64Array(NZ), cz = new Float64Array(NZ), lvZ = new Float64Array(NZ);
    for (let k = 0; k < NZ; k++) {
      const i = k % ZR, j = Math.floor(k / ZR);
      cx[k] = peso[k] > 0 ? sx[k] / peso[k] : -BUILD_HALF + (i + 0.5) * ZONA_CELL;
      cz[k] = peso[k] > 0 ? sz[k] / peso[k] : -BUILD_HALF + (j + 0.5) * ZONA_CELL;
      lvZ[k] = res[k] > 0 ? lvSum[k] / res[k] : 30;
    }

    const G = compactar(sim.graph);
    const nE = G.arestaIds.length;
    // capacidade e tempo de cada aresta (BRT ocupa uma faixa da avenida)
    const brtArestas = new Set<number>();
    for (const l of this.linhas) if (l.tipo === 'brt' && l.status === 'operando') for (const e of l.arestas) brtArestas.add(e);
    const cap = new Float64Array(nE), t0 = new Float64Array(nE), tc = new Float64Array(nE), volAnt = new Float64Array(nE);
    for (let k = 0; k < nE; k++) {
      const av = G.avenida[k] ? 'avenida' : 'rua';
      cap[k] = CAP_VIA[av] * (brtArestas.has(G.arestaIds[k]) ? 0.75 : 1);
      t0[k] = G.comprimento[k] / VEL_LIVRE[av];
      volAnt[k] = this.volumes.get(G.arestaIds[k]) ?? 0;
      tc[k] = t0[k] * (1 + 0.15 * Math.pow(volAnt[k] / cap[k], 4));
    }
    // nó de acesso de cada zona
    const noZona = new Int32Array(NZ).fill(-1), acessoZona = new Float64Array(NZ);
    for (let k = 0; k < NZ; k++) {
      if (res[k] <= 0 && jobs[k] <= 0) continue;
      const n = G.nodeIds.length ? noMaisProximo(G, cx[k], cz[k], 450) : -1;
      noZona[k] = n;
      if (n >= 0) acessoZona[k] = Math.hypot(G.x[n] - cx[k], G.z[n] - cz[k]) / 8;
    }

    // rede de transporte coletivo: um nó por (linha, parada)
    const operando = this.linhas.filter((l) => l.status === 'operando');
    const fatorTransito = new Map<number, number>();
    for (let k = 0; k < nE; k++) fatorTransito.set(G.arestaIds[k], t0[k] / tc[k]);
    interface NoTP { linha: number; x: number; z: number; headway: number }
    const nos: NoTP[] = [];
    const viz: { para: number; t: number }[][] = [];
    for (let li = 0; li < operando.length; li++) {
      const l = operando[li];
      const def = TIPOS_LINHA[l.tipo];
      let vel = def.vel;
      if (l.tipo === 'onibus' && l.arestas.length) {
        let f = 0;
        for (const e of l.arestas) f += fatorTransito.get(e) ?? 1;
        vel *= f / l.arestas.length;
      }
      const tempoVolta = (2 * l.comprimento) / vel + l.paradas.length * 2 * def.parada;
      const headway = Math.max(def.headway * 0.2, tempoVolta / Math.max(1, l.frota));
      l.headwayMin = headway / 60;
      l.tempoVoltaMin = tempoVolta / 60;
      // distância de cada parada ao longo do traçado
      const cum = [0];
      for (let i = 2; i < l.caminho.length; i += 2) cum.push(cum[cum.length - 1] + Math.hypot(l.caminho[i] - l.caminho[i - 2], l.caminho[i + 1] - l.caminho[i - 1]));
      const sParada = l.paradas.map((p) => {
        let melhor = 0, bd = Infinity;
        for (let i = 0; i < cum.length; i++) {
          const d = Math.hypot(l.caminho[2 * i] - p.x, l.caminho[2 * i + 1] - p.z);
          if (d < bd) { bd = d; melhor = i; }
        }
        return cum[melhor];
      });
      const base = nos.length;
      l.paradas.forEach((p) => { nos.push({ linha: li, x: p.x, z: p.z, headway }); viz.push([]); });
      for (let s = 0; s < l.paradas.length - 1; s++) {
        const t = Math.abs(sParada[s + 1] - sParada[s]) / vel + def.parada;
        viz[base + s].push({ para: base + s + 1, t });
        viz[base + s + 1].push({ para: base + s, t });
      }
    }
    // baldeações a pé (até 220 m)
    for (let a = 0; a < nos.length; a++) for (let b = 0; b < nos.length; b++) {
      if (nos[a].linha === nos[b].linha) continue;
      const d = Math.hypot(nos[a].x - nos[b].x, nos[a].z - nos[b].z);
      if (d < 220) viz[a].push({ para: b, t: d / 1.3 + nos[b].headway / 2 + 120 });
    }

    const viagens = new Float64Array(operando.length);
    const volNovo = new Float64Array(nE);
    const tempoZona = new Float64Array(NZ), pesoZona = new Float64Array(NZ);
    let somaTempo = 0, somaViagens = 0, mCarro = 0, mTP = 0, mPe = 0, mInf = 0;
    const teta = 0.15;
    const vansOk = this.vans !== 'combater';

    for (let i = 0; i < NZ; i++) {
      const trabalhadores = res[i] * 0.5;
      if (trabalhadores < 1) continue;
      // árvore de carros
      const arv = noZona[i] >= 0 ? dijkstra(G, noZona[i], (k) => tc[k]) : null;
      // árvore do coletivo
      const distTP = new Float64Array(nos.length).fill(Infinity);
      const predTP = new Int32Array(nos.length).fill(-1);
      if (nos.length) {
        const fila: [number, number][] = [];
        for (let s = 0; s < nos.length; s++) {
          const d = Math.hypot(nos[s].x - cx[i], nos[s].z - cz[i]);
          if (d < 750) { distTP[s] = d / 1.3 + nos[s].headway / 2; fila.push([distTP[s], s]); }
        }
        // Dijkstra simples (rede pequena)
        const feito = new Uint8Array(nos.length);
        for (;;) {
          let u = -1, bd = Infinity;
          for (let s = 0; s < nos.length; s++) if (!feito[s] && distTP[s] < bd) { bd = distTP[s]; u = s; }
          if (u < 0) break;
          feito[u] = 1;
          for (const { para, t } of viz[u]) if (distTP[u] + t < distTP[para]) { distTP[para] = distTP[u] + t; predTP[para] = u; }
        }
      }
      const own = clamp(0.12 + 0.7 * lvZ[i] / 100, 0.08, 0.85);
      // custos generalizados para cada destino
      const dest: { j: number; f: number; tCar: number; tTP: number; tPe: number; tInf: number; sTP: number; sh: number[]; tMed: number }[] = [];
      let A = 0;
      for (let j = 0; j < NZ; j++) {
        if (jobs[j] <= 0) continue;
        const dEuc = Math.hypot(cx[j] - cx[i], cz[j] - cz[i]);
        const tCar = arv && noZona[j] >= 0 && Number.isFinite(arv.dist[noZona[j]]) ? acessoZona[i] + arv.dist[noZona[j]] + acessoZona[j] + 180 : Infinity;
        let tTP = Infinity, sTP = -1;
        for (let s = 0; s < nos.length; s++) {
          if (!Number.isFinite(distTP[s])) continue;
          const d = Math.hypot(nos[s].x - cx[j], nos[s].z - cz[j]);
          if (d < 750 && distTP[s] + d / 1.3 < tTP) { tTP = distTP[s] + d / 1.3; sTP = s; }
        }
        const tPe = dEuc < 2500 ? Math.max(120, dEuc / 1.3) : Infinity;
        const tInf = vansOk && Number.isFinite(tCar) ? tCar * 1.25 + 360 : Infinity;
        const C = [tCar / 60 + 6, tTP / 60 + this.tarifa * 2, (1.4 * tPe) / 60, tInf / 60 + (this.vans === 'regularizar' ? 9 : 11)];
        const logit = (disp: boolean[]) => {
          const e = C.map((c, m) => (disp[m] && Number.isFinite(c) ? Math.exp(-teta * c) : 0));
          const s = e.reduce((a, b) => a + b, 0);
          return { sh: s > 0 ? e.map((x) => x / s) : [0, 0, 0, 0], cstar: s > 0 ? -Math.log(s) / teta : Infinity };
        };
        const comCarro = logit([true, true, true, true]);
        const semCarro = logit([false, true, true, true]);
        const cstar = own * comCarro.cstar + (1 - own) * semCarro.cstar;
        if (!Number.isFinite(cstar)) continue;
        const sh = [0, 1, 2, 3].map((m) => own * comCarro.sh[m] + (1 - own) * semCarro.sh[m]);
        const tempos = [tCar, tTP, tPe, tInf];
        let tMed = 0;
        for (let m = 0; m < 4; m++) if (sh[m] > 0) tMed += sh[m] * tempos[m];
        const f = jobs[j] * Math.exp(-0.055 * cstar);
        A += f;
        dest.push({ j, f, tCar, tTP, tPe, tInf, sTP, sh, tMed });
      }
      if (A <= 0) continue;
      for (const d of dest) {
        const T = (trabalhadores * d.f) / A;
        somaTempo += T * d.tMed; somaViagens += T;
        tempoZona[i] += T * d.tMed; pesoZona[i] += T;
        mCarro += T * d.sh[0]; mTP += T * d.sh[1]; mPe += T * d.sh[2]; mInf += T * d.sh[3];
        // carros e vans na hora de pico (40% das viagens da manhã)
        const veiculos = (T * d.sh[0]) / 1.25 + (T * d.sh[3]) / 12;
        if (veiculos > 0 && arv && noZona[d.j] >= 0) {
          let u = noZona[d.j];
          let guarda = 0;
          while (u !== noZona[i] && arv.pred[u] >= 0 && guarda++ < 5000) { volNovo[arv.pred[u]] += veiculos * 0.4; u = arv.predNo[u]; }
        }
        // embarques por linha (ida e volta)
        if (d.sh[1] > 0 && d.sTP >= 0) {
          const pass = T * d.sh[1] * 2;
          let s = d.sTP, linhaAtual = -1, guarda = 0;
          while (s >= 0 && guarda++ < 500) {
            if (nos[s].linha !== linhaAtual) { viagens[nos[s].linha] += pass; linhaAtual = nos[s].linha; }
            s = predTP[s];
          }
        }
      }
    }

    // média sucessiva dos volumes (equilíbrio aproximado)
    this.volumes.clear();
    const vias: { edge: number; vc: number }[] = [];
    let somaVC = 0, somaL = 0;
    for (let k = 0; k < nE; k++) {
      const v = 0.5 * volAnt[k] + 0.5 * volNovo[k];
      this.volumes.set(G.arestaIds[k], v);
      const vc = v / cap[k];
      vias.push({ edge: G.arestaIds[k], vc });
      somaVC += vc * G.comprimento[k]; somaL += G.comprimento[k];
    }
    operando.forEach((l, li) => {
      l.passageirosDia = Math.round(viagens[li]);
      const capHora = (60 / Math.max(0.2, l.headwayMin)) * TIPOS_LINHA[l.tipo].cap;
      l.lotacao = capHora > 0 ? (viagens[li] / 2) * 0.35 / capHora : 0;
    });
    for (let k = 0; k < NZ; k++) this.zonaTempo[k] = pesoZona[k] > 0 ? tempoZona[k] / pesoZona[k] / 60 : 30;
    const tot = mCarro + mTP + mPe + mInf || 1;
    this.resumo = {
      tempoMedio: somaViagens > 0 ? somaTempo / somaViagens / 60 : 0,
      modal: { carro: mCarro / tot, coletivo: mTP / tot, ape: mPe / tot, informal: mInf / tot },
      passageirosDia: Math.round(viagens.reduce((a, b) => a + b, 0)),
      viagensDia: Math.round(somaViagens * 2),
      congestionamento: somaL > 0 ? somaVC / somaL : 0,
      vias,
    };
  }

  tempoEm(x: number, z: number): number {
    const i = clamp(Math.floor((x + BUILD_HALF) / ZONA_CELL), 0, ZONA_RES - 1), j = clamp(Math.floor((z + BUILD_HALF) / ZONA_CELL), 0, ZONA_RES - 1);
    return this.zonaTempo[j * ZONA_RES + i];
  }

  serializar() {
    return { linhas: this.linhas, nextId: this.nextId, tarifa: this.tarifa, vans: this.vans, volumes: [...this.volumes], zonaTempo: [...this.zonaTempo], resumo: this.resumo };
  }

  restaurar(s: ReturnType<Transporte['serializar']>) {
    this.linhas = s.linhas.map((l) => ({ ...l }));
    this.nextId = s.nextId; this.tarifa = s.tarifa; this.vans = s.vans;
    this.volumes = new Map(s.volumes);
    this.zonaTempo = Float32Array.from(s.zonaTempo);
    this.resumo = s.resumo;
    this.versaoLinhas++;
  }
}
