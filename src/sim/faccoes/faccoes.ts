/**
 * Facções (Fase 26): Milícia, CV, ADA e TCP — cada uma com poder, armamento, dinheiro, influência, rivais, aliados e quatro
 * fontes de renda (tráfico, taxas, gatonet, transporte alternativo). Elas disputam UNIDADES territoriais (polígonos de bairro).
 *
 * Como convive com a grade territorial (F/M, 64 m): a grade diz O QUANTO cada pedaço da cidade é dominado (pobreza, ausência
 * do Estado, operações policiais) e continua alimentando lotes, serviços e o Estado; as facções dizem QUEM domina. A parte
 * miliciana de cada unidade vem da grade (M ÷ (F+M)); a parte "facção" é repartida entre CV, ADA e TCP pelo conflito entre elas.
 * Conflitos de milícia contra facção empurram a grade (F↔M). Tudo parametrizado em src/data/seguranca/*.json.
 */
import { hash01 } from '../core/rng';
import type { Simulation } from '../simulation';
import { TERR_RES } from '../city/territorio';
import { DADOS, INDICE_FACCAO, IDS_FACCAO, NF } from './dados';
import { gerarOcorrencias, type EstadoBases } from './ocorrencias';
import type { Ocorrencia, RenderFaccoes, ResumoFaccao, ResumoFaccoes, ResumoUnidade } from './tipos';
import { SEM_UNIDADE, Unidades } from './unidades';
import type { BairroCenso } from '../../data/bairros';

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const MIL = 0;

export interface SaveFaccoes {
  poder: number[]; armamento: number[]; dinheiro: number[]; influencia: number[];
  relacao: number[]; tregua: number[]; desgaste: number[];
  share: number[]; inicializado: boolean;
  ocorrencias: Ocorrencia[]; proximoId: number; totais: Record<string, number>; mortosTotal: number;
}

export class Faccoes {
  unidades: Unidades;
  poder = new Float64Array(NF); armamento = new Float64Array(NF); dinheiro = new Float64Array(NF); influencia = new Float64Array(NF);
  /** relação entre facções: −1 guerra … 0 neutra … +1 aliada (matriz NF×NF, simétrica) */
  relacao = new Float64Array(NF * NF);
  /** dias de trégua restantes entre cada par */
  tregua = new Int16Array(NF * NF);
  /** desgaste recente de cada facção em conflito (0–1): empurra para a trégua */
  desgaste = new Float64Array(NF);
  /** parcela de cada facção na presença criminosa de cada unidade (soma 1 onde há presença) */
  share: Float32Array;
  inicializado = false;
  // por unidade, recalculados a cada dia
  pop: Float64Array; forca: Float64Array; conflito: Float64Array;
  /** dono de cada célula da grade, para o overlay */
  dono = new Uint8Array(TERR_RES * TERR_RES);
  renda: ResumoFaccao['renda'][] = Array.from({ length: NF }, () => ({ trafico: 0, taxas: 0, gatonet: 0, transporteAlternativo: 0, total: 0 }));
  popControlada = new Float64Array(NF);
  ocorrencias: Ocorrencia[] = [];
  proximoId = 1;
  totais: Record<string, number> = {};
  mortosTotal = 0;
  conflitosHoje = 0;
  estadoPop = 1;
  versao = 0;
  bases: EstadoBases = { lista: [], versao: -1 };
  /** save carregado antes do Censo chegar: a distribuição por unidade espera os polígonos certos */
  private pendente: SaveFaccoes | null = null;

  constructor(bairros: BairroCenso[] | null = null) {
    this.unidades = new Unidades(bairros);
    this.share = new Float32Array(this.unidades.n * NF);
    this.pop = new Float64Array(this.unidades.n); this.forca = new Float64Array(this.unidades.n); this.conflito = new Float64Array(this.unidades.n);
    this.zerarRelacoes();
    IDS_FACCAO.forEach((id, k) => {
      const f = DADOS.faccoes.faccoes[id].inicial;
      this.poder[k] = f.poder; this.armamento[k] = f.armamento; this.dinheiro[k] = f.dinheiro; this.influencia[k] = f.influencia;
    });
  }

  /** Troca o conjunto de unidades (quando o Censo chega depois da criação da simulação): refaz a distribuição. */
  definirBairros(bairros: BairroCenso[] | null) {
    this.unidades = new Unidades(bairros);
    this.share = new Float32Array(this.unidades.n * NF);
    this.pop = new Float64Array(this.unidades.n); this.forca = new Float64Array(this.unidades.n); this.conflito = new Float64Array(this.unidades.n);
    this.inicializado = false;
    this.bases = { lista: [], versao: -1 };
    if (this.pendente && this.pendente.share.length === this.share.length) { this.share = Float32Array.from(this.pendente.share); this.inicializado = this.pendente.inicializado; this.pendente = null; }
    this.versao++;
  }

  private zerarRelacoes() {
    this.relacao.fill(0); this.tregua.fill(0);
    IDS_FACCAO.forEach((id, a) => {
      const f = DADOS.faccoes.faccoes[id];
      for (const o of f.rivais) this.definirRelacao(a, INDICE_FACCAO[o], DADOS.faccoes.acordos.relacaoGuerra);
      for (const o of f.aliados) this.definirRelacao(a, INDICE_FACCAO[o], 0.7);
    });
  }
  private definirRelacao(a: number, b: number, v: number) { this.relacao[a * NF + b] = v; this.relacao[b * NF + a] = v; }
  relacaoEntre(a: number, b: number) { return this.relacao[a * NF + b]; }

  // ── passo diário ───────────────────────────────────────────────────────────────

  /** Começo do jogo: as comunidades listadas em `presencaInicial` já têm domínio (F ou M na grade, sorteado pela semente). */
  private aplicarPresencaInicial(sim: Simulation) {
    const T = sim.territorio, U = this.unidades, seed = sim.init.seed;
    if (U.fonte !== 'censo') return;
    for (const p of DADOS.faccoes.semeadura.presencaInicial) {
      const u = U.porNome(p.bairro);
      if (!u) continue;
      const milicia = hash01(seed * 977 + u.id * 6151) < DADOS.faccoes.semeadura.pesoMilicia;
      for (const k of u.celulas) {
        if (T.pop[k] <= 0) continue;
        const v = p.forca * (0.65 + 0.35 * hash01(seed + k * 31));
        if (milicia) T.M[k] = Math.max(T.M[k], v); else T.F[k] = Math.max(T.F[k], v);
      }
    }
  }

  atualizar(sim: Simulation) {
    const T = sim.territorio, U = this.unidades, nU = U.n;
    if (!this.inicializado) this.aplicarPresencaInicial(sim);
    const cel = U.celula;
    const F = T.F, M = T.M, pop = T.pop;
    // 1. agregados por unidade (ponderados pela população)
    const popU = this.pop, forcaU = this.forca;
    popU.fill(0); forcaU.fill(0);
    const sF = new Float64Array(nU), sM = new Float64Array(nU), pres = new Float64Array(nU);
    for (let k = 0; k < cel.length; k++) {
      const u = cel[k];
      if (u === SEM_UNIDADE) continue;
      const p = pop[k];
      popU[u] += p;
      if (p > 0) { const fk = Math.max(F[k], M[k]); forcaU[u] += p * fk; sF[u] += p * F[k]; sM[u] += p * M[k]; }
      pres[u] = Math.max(pres[u], F[k], M[k]);
    }
    for (let u = 0; u < nU; u++) forcaU[u] = popU[u] > 0 ? forcaU[u] / popU[u] : 0;
    const limiar = DADOS.faccoes.semeadura.forcaMinimaParaTerDono;
    const seed = sim.init.seed;

    // 2. distribuição entre as facções: semeia o começo e a presença nova; a parte da milícia segue a grade
    const pesos = DADOS.faccoes.semeadura.pesos;
    const naoMil = IDS_FACCAO.map((id, k) => ({ id, k })).filter((x) => x.k !== MIL);
    const semear = (u: number) => {
      const o = u * NF;
      const fracM = sF[u] + sM[u] > 0 ? sM[u] / (sF[u] + sM[u]) : 0;
      // dominante entre as não-milicianas: sorteio ponderado pela semente, o resto reparte o que sobra
      const w = naoMil.map((x) => (pesos[x.id] ?? 0.3) * (0.4 + hash01(seed * 131 + u * 7919 + x.k * 104729)));
      const tot = w.reduce((a, b) => a + b, 0) || 1;
      let melhor = 0;
      w.forEach((v, i) => { if (v > w[melhor]) melhor = i; });
      naoMil.forEach((x, i) => { this.share[o + x.k] = (1 - fracM) * (i === melhor ? 0.72 : (0.28 * w[i]) / Math.max(1e-6, tot - w[melhor])); });
      this.share[o + MIL] = fracM;
    };
    if (!this.inicializado) { for (let u = 0; u < nU; u++) if (forcaU[u] >= limiar * 0.5 && popU[u] > 0) semear(u); this.inicializado = true; }
    for (let u = 0; u < nU; u++) {
      const o = u * NF;
      let soma = 0;
      for (let f = 0; f < NF; f++) soma += this.share[o + f];
      if (forcaU[u] < limiar * 0.5) { if (soma > 0 && forcaU[u] < 0.03) for (let f = 0; f < NF; f++) this.share[o + f] *= 0.9; continue; }
      if (soma < 0.01) {
        // presença nova: herda dos vizinhos fortes; sem vizinho, sorteio pela semente
        const herd = new Float64Array(NF);
        for (const v of U.vizinhas[u]) for (let f = 0; f < NF; f++) herd[f] += this.share[v * NF + f] * Math.max(0.2, forcaU[v]);
        const h = herd.reduce((a, b) => a + b, 0);
        if (h > 1e-6) { for (let f = 0; f < NF; f++) this.share[o + f] = herd[f] / h; } else semear(u);
        continue;
      }
      // milícia: o que a grade diz; as outras ficam com o resto, na proporção em que estavam
      const alvoM = sF[u] + sM[u] > 0 ? sM[u] / (sF[u] + sM[u]) : this.share[o + MIL];
      const mAtual = this.share[o + MIL];
      const m = mAtual + (alvoM - mAtual) * 0.25;
      const resto = soma - mAtual;
      for (let f = 1; f < NF; f++) this.share[o + f] = resto > 1e-6 ? (this.share[o + f] / resto) * (1 - m) : (1 - m) / (NF - 1);
      this.share[o + MIL] = m;
    }

    // 3. conflito entre facções, expansão e baixas
    this.conflito.fill(0);
    this.conflitosHoje = 0;
    const C = DADOS.faccoes.conflito;
    for (let a = 0; a < NF; a++) this.desgaste[a] *= 0.985;
    for (let u = 0; u < nU; u++) {
      if (forcaU[u] < limiar || popU[u] <= 0) continue;
      const o = u * NF;
      for (let a = 0; a < NF; a++) for (let b = a + 1; b < NF; b++) {
        const sa = this.share[o + a], sb = this.share[o + b];
        if (sa < C.limiarPresenca || sb < C.limiarPresenca) continue;
        const r = this.relacao[a * NF + b];
        if (r > -0.25 || this.tregua[a * NF + b] > 0) continue;
        const ag = (DADOS.faccoes.faccoes[IDS_FACCAO[a]].agressividade + DADOS.faccoes.faccoes[IDS_FACCAO[b]].agressividade) / 2;
        const pressao = -r * ag * (this.poder[a] - this.poder[b]) * 4 + (sim.rng.next() - 0.5) * C.ruido * 2;
        const delta = C.taxaMaxima * Math.tanh(pressao * 2);
        const ganha = delta >= 0 ? a : b, perde = delta >= 0 ? b : a;
        const t = Math.abs(delta) * this.share[o + perde];
        this.share[o + ganha] += t; this.share[o + perde] -= t;
        const intens = Math.min(sa, sb) * ag;
        this.conflito[u] = Math.max(this.conflito[u], intens);
        this.conflitosHoje++;
        for (const f of [a, b]) {
          this.armamento[f] = clamp(this.armamento[f] - C.baixaPorConflito.armamento * intens, 0, 100);
          this.dinheiro[f] = Math.max(0, this.dinheiro[f] - C.baixaPorConflito.dinheiro * intens);
          this.desgaste[f] = clamp(this.desgaste[f] + 0.02 * intens * 10, 0, 1);
        }
        // milícia ganhando/perdendo empurra a grade: F ↔ M nas células da unidade
        if (a === MIL || b === MIL) this.empurrarGrade(sim, u, a === MIL ? (ganha === MIL ? t : -t) : (ganha === MIL ? t : -t));
      }
    }
    // expansão para unidades vizinhas com presença criminosa e pouco dono
    for (let u = 0; u < nU; u++) {
      if (forcaU[u] < limiar) continue;
      for (const v of U.vizinhas[u]) {
        if (forcaU[v] < limiar) continue;
        const ov = v * NF, ou = u * NF;
        for (let f = 1; f < NF; f++) {
          if (this.share[ou + f] < 0.5 || this.share[ov + f] > 0.8) continue;
          const exp = DADOS.faccoes.faccoes[IDS_FACCAO[f]].expansao;
          const t = C.expansaoPorVizinho * exp * this.poder[f] * (this.share[ou + f] - this.share[ov + f]);
          if (t <= 0) continue;
          for (let g = 1; g < NF; g++) if (g !== f && this.share[ov + g] > 0) this.share[ov + g] = Math.max(0, this.share[ov + g] - (t * this.share[ov + g]) / Math.max(1e-6, 1 - this.share[ov + MIL] - this.share[ov + f]));
          this.share[ov + f] += t;
        }
      }
    }
    // normaliza (a soma por unidade com presença volta a 1)
    for (let u = 0; u < nU; u++) {
      const o = u * NF;
      let s = 0;
      for (let f = 0; f < NF; f++) { if (this.share[o + f] < 0) this.share[o + f] = 0; s += this.share[o + f]; }
      if (s > 1e-6 && (s > 1.0001 || s < 0.9999)) for (let f = 0; f < NF; f++) this.share[o + f] /= s;
    }

    // 4. economia: renda por fonte × população controlada
    const E = DADOS.faccoes.economia;
    const vans = sim.transporte.vans;
    const fVans = vans === 'combater' ? 0.4 : vans === 'tolerar' ? 1.3 : 1;
    let popTotal = 0, popCrim = 0;
    for (let u = 0; u < nU; u++) popTotal += popU[u];
    this.popControlada.fill(0);
    for (let u = 0; u < nU; u++) for (let f = 0; f < NF; f++) this.popControlada[f] += popU[u] * forcaU[u] * this.share[u * NF + f];
    for (let f = 0; f < NF; f++) popCrim += this.popControlada[f];
    this.estadoPop = popTotal > 0 ? clamp(1 - popCrim / popTotal, 0, 1) : 1;
    // presença do Estado e operações atrapalham a renda (mais "sensibilidade à polícia" = mais perda)
    const presenca = sim.servicosSociais.resumo.seguranca;
    // custos e caixa-alvo escalam com o tamanho da cidade (a renda já escala com a população): uma cidadezinha não "quebra" as facções
    const k = clamp(popTotal / E.populacaoReferencia, 0.02, 1.5);
    for (let f = 0; f < NF; f++) {
      const def = DADOS.faccoes.faccoes[IDS_FACCAO[f]];
      const pc = this.popControlada[f] * (1 - presenca * def.sensibilidadePolicia * 0.5);
      const r = this.renda[f];
      r.trafico = pc * def.fontes.trafico; r.taxas = pc * def.fontes.taxas; r.gatonet = pc * def.fontes.gatonet; r.transporteAlternativo = pc * def.fontes.transporteAlternativo * fVans;
      r.total = r.trafico + r.taxas + r.gatonet + r.transporteAlternativo;
      const nUn = Array.from({ length: nU }).reduce<number>((n, _, u) => n + (this.share[u * NF + f] * forcaU[u] > 0.2 ? 1 : 0), 0);
      const custos = k * (this.armamento[f] * E.custoArmamentoPorPontoDia + this.influencia[f] * E.propinaPorInfluenciaDia + nUn * E.pessoalPorTerritorioDia);
      this.dinheiro[f] = clamp(this.dinheiro[f] + r.total / 1e6 - custos, 0, E.capDinheiro);
      // reposição de armas com parte do caixa; armas se desgastam
      if (this.dinheiro[f] > 15 * k) { const gasto = Math.min(0.6 * k, this.dinheiro[f] * 0.012); this.dinheiro[f] -= gasto; this.armamento[f] = clamp(this.armamento[f] + (gasto * E.reposicaoArmamentoPorMilhao) / k, 0, 100); }
      this.armamento[f] = clamp(this.armamento[f] - 0.02, 0, 100);
      const terr = clamp(this.popControlada[f] / Math.max(1, 0.25 * popTotal), 0, 1);
      this.poder[f] = clamp(0.35 * terr + 0.3 * (this.armamento[f] / 100) + 0.2 * Math.min(1, this.dinheiro[f] / (100 * k)) + 0.15 * (this.influencia[f] / 100), 0.02, 1);
    }

    // 5. trégua e ruptura
    this.acordos(sim);

    // 6. dono de cada célula para o overlay
    for (let k = 0; k < cel.length; k++) {
      const u = cel[k];
      if (u === SEM_UNIDADE || Math.max(F[k], M[k]) < 0.08) { this.dono[k] = 0; continue; }
      if (M[k] >= F[k]) { this.dono[k] = MIL + 1; continue; }
      let m = 1, v = -1;
      for (let f = 1; f < NF; f++) if (this.share[u * NF + f] > v) { v = this.share[u * NF + f]; m = f; }
      this.dono[k] = v > 0 ? m + 1 : 0;
    }

    // 7. ocorrências do dia (despacho, resolução, manchetes)
    gerarOcorrencias(sim, this);
    this.versao++;
  }

  /** Move a grade F↔M numa unidade: `delta` > 0 = a milícia ganha esse tanto da presença criminosa. */
  private empurrarGrade(sim: Simulation, u: number, delta: number) {
    const T = sim.territorio;
    for (const k of this.unidades.lista[u].celulas) {
      const t = delta * (T.F[k] + T.M[k]);
      if (t > 0) { const x = Math.min(T.F[k], t); T.F[k] -= x; T.M[k] += x; } else if (t < 0) { const x = Math.min(T.M[k], -t); T.M[k] -= x; T.F[k] += x; }
    }
  }

  private acordos(sim: Simulation) {
    const A = DADOS.faccoes.acordos;
    for (let a = 0; a < NF; a++) for (let b = a + 1; b < NF; b++) {
      const i = a * NF + b;
      if (this.tregua[i] > 0) {
        this.tregua[i]--; this.tregua[b * NF + a] = this.tregua[i];
        if (this.tregua[i] === 0 && this.relacao[i] < 0.2) {
          this.definirRelacao(a, b, A.relacaoGuerra);
          sim.noticia(`A trégua entre ${this.nome(a)} e ${this.nome(b)} acaba: tiroteios voltam às fronteiras entre as áreas.`, 'ruim', `fimTregua${a}${b}`, 40);
        }
        continue;
      }
      const r = this.relacao[i];
      if (r <= -0.5) {
        // rivais exauridos aceitam trégua
        const cansaco = (this.desgaste[a] + this.desgaste[b]) / 2;
        if (cansaco > A.desgasteParaTregua && sim.rng.chance(A.chanceTreguaPorDia)) {
          const dias = Math.round(A.duracaoTreguaDias[0] + sim.rng.next() * (A.duracaoTreguaDias[1] - A.duracaoTreguaDias[0]));
          this.tregua[i] = dias; this.tregua[b * NF + a] = dias;
          this.definirRelacao(a, b, A.relacaoTregua);
          this.desgaste[a] *= 0.5; this.desgaste[b] *= 0.5;
          sim.noticia(`${this.nome(a)} e ${this.nome(b)} fecham uma trégua de ${dias} dias após semanas de guerra; moradores desconfiam e dizem que "é só para recarregar".`, 'info', `tregua${a}${b}`, 30);
        }
      } else if (r >= 0.5 && Math.abs(this.poder[a] - this.poder[b]) > 0.3 && sim.rng.chance(A.chanceRuptura)) {
        // aliança se rompe quando um fica muito maior que o outro
        this.definirRelacao(a, b, -0.4);
        sim.noticia(`Aliança entre ${this.nome(a)} e ${this.nome(b)} se rompe: o mais forte quer o território do outro.`, 'alerta', `ruptura${a}${b}`, 40);
      }
    }
  }

  nome(f: number) { return DADOS.faccoes.faccoes[IDS_FACCAO[f]].nome; }

  /**
   * Operação policial (a do jogador ou autônoma): as facções com domínio na área perdem armas e dinheiro (apreensão) e
   * recuam; devolve as afetadas, da mais forte à mais fraca.
   */
  aoOperacao(x: number, z: number, raio: number): { faccao: number; peso: number }[] {
    const U = this.unidades;
    const peso = new Float64Array(NF);
    let tot = 0;
    for (const u of U.lista) {
      if (Math.hypot(u.cx - x, u.cz - z) > raio + 600) continue;
      for (let f = 0; f < NF; f++) { const c = this.share[u.id * NF + f] * this.forca[u.id]; peso[f] += c; tot += c; }
    }
    const out: { faccao: number; peso: number }[] = [];
    if (tot <= 0) return out;
    const ap = DADOS.faccoes.economia.apreensaoPorOperacao;
    for (let f = 0; f < NF; f++) {
      const w = peso[f] / tot;
      if (w < 0.05) continue;
      this.armamento[f] = clamp(this.armamento[f] - ap.armamento * w * 3, 0, 100);
      this.dinheiro[f] = Math.max(0, this.dinheiro[f] - ap.dinheiro * w * 3);
      this.poder[f] = clamp(this.poder[f] - 0.01 * w, 0.02, 1);
      out.push({ faccao: f, peso: w });
    }
    return out.sort((a, b) => b.peso - a.peso);
  }

  // ── resumos ────────────────────────────────────────────────────────────────────

  resumoUnidades(): ResumoUnidade[] {
    const U = this.unidades;
    return U.lista.map((u) => {
      const o = u.id * NF;
      const controle: number[] = [];
      let dono = -1, m = 0.05;
      for (let f = 0; f < NF; f++) { const c = this.share[o + f] * this.forca[u.id]; controle.push(c); if (c > m) { m = c; dono = f; } }
      return { id: u.id, nome: u.nome, populacao: Math.round(this.pop[u.id]), forca: this.forca[u.id], controle, dono, conflito: this.conflito[u.id] };
    });
  }

  resumo(): ResumoFaccoes {
    const un = this.resumoUnidades();
    const faccoes: ResumoFaccao[] = IDS_FACCAO.map((id, f) => {
      const d = DADOS.faccoes.faccoes[id];
      let popTot = 0;
      for (let u = 0; u < this.pop.length; u++) popTot += this.pop[u];
      const nome = (k: number) => IDS_FACCAO[k];
      const rel = (cond: (r: number, t: number) => boolean) => IDS_FACCAO.filter((_, g) => g !== f && cond(this.relacao[f * NF + g], this.tregua[f * NF + g]));
      void nome;
      return {
        id, nome: d.nome, sigla: d.sigla, cor: d.cor, tipo: d.tipo,
        poder: this.poder[f], armamento: this.armamento[f], dinheiro: this.dinheiro[f], influencia: this.influencia[f],
        populacao: popTot > 0 ? this.popControlada[f] / popTot : 0,
        unidades: un.filter((u) => u.dono === f).length,
        renda: { ...this.renda[f] },
        rivais: rel((r) => r <= -0.25).concat(), aliados: rel((r) => r >= 0.5), emGuerraCom: rel((r, t) => r <= -0.5 && t === 0), emTreguaCom: rel((_, t) => t > 0),
      };
    });
    return { faccoes, unidades: un, estado: this.estadoPop, conflitosHoje: this.conflitosHoje, recentes: this.ocorrencias.slice(-12).reverse(), totais: { ...this.totais }, mortosTotal: this.mortosTotal };
  }

  renderDados(): RenderFaccoes {
    return { versao: this.versao, dono: this.dono.slice(), ocorrencias: this.ocorrencias.slice(-DADOS.ocorrencias.despacho.maximoOcorrenciasGuardadas), ultimoId: this.proximoId - 1 };
  }

  // ── save ───────────────────────────────────────────────────────────────────────

  serializar(): SaveFaccoes {
    return {
      poder: [...this.poder], armamento: [...this.armamento], dinheiro: [...this.dinheiro], influencia: [...this.influencia],
      relacao: [...this.relacao], tregua: [...this.tregua], desgaste: [...this.desgaste],
      share: [...this.share], inicializado: this.inicializado,
      ocorrencias: this.ocorrencias, proximoId: this.proximoId, totais: this.totais, mortosTotal: this.mortosTotal,
    };
  }

  restaurar(s: SaveFaccoes) {
    this.poder = Float64Array.from(s.poder); this.armamento = Float64Array.from(s.armamento); this.dinheiro = Float64Array.from(s.dinheiro); this.influencia = Float64Array.from(s.influencia);
    this.relacao = Float64Array.from(s.relacao); this.tregua = Int16Array.from(s.tregua); this.desgaste = Float64Array.from(s.desgaste);
    if (s.share.length === this.share.length) this.share = Float32Array.from(s.share); else this.pendente = s;
    this.inicializado = s.inicializado && s.share.length === this.share.length;
    this.ocorrencias = s.ocorrencias; this.proximoId = s.proximoId; this.totais = s.totais; this.mortosTotal = s.mortosTotal;
    this.versao++;
  }
}
