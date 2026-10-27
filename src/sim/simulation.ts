import { Clima } from './clima/clima';
import { STORYLETS } from './eventos/biblioteca';
import { diaDoAnoReal, festaEm, festasDoAno, type Festa } from './eventos/festas';
import { Motor, novoEstadoEventos, sortearStorylet, type Contexto, type Efeitos, type EstadoEventos, type SaidaEfeito } from './eventos/motor';
import { CARGOS } from './politica/dados';
/**
 * Simulação da Visão Cidade (Fase 2). Roda dentro do Worker, mas é uma classe pura:
 * os testes (Vitest) a instanciam diretamente e aceleram décadas em segundos.
 *
 * Tick = 6 horas de jogo. Passo diário a cada 4 ticks; fechamento mensal no dia 1.
 * Fórmulas documentadas em SIMULATION.md.
 */
import { bairroEm, deUF, nomeRua } from '../data/nomes';
import { BUILD_HALF, FIELD_CELL, FIELD_RES, RASTER_RES } from '../world/constants';
import { computeLots, forRectCells, LOT_STRIDE, packLots, rasterizeRoads, type Footprint, type LotGeom, RASTER_INFORMAL } from '../world/lots';
import {
  applyRoad, components, edgeLength, emptyGraph, findEdgeNear, graphFromJSON, graphToJSON, planRoad,
  removeEdge, ROAD_SPECS, type RoadGraph,
} from '../world/roads';
import { insideFootprint, serviceFootprint } from '../world/services';
import { generateTerrain, sampleForest, sampleHeight, sampleWaterDist, type Heightmap } from '../world/terrain';
import { arquetipoReal, grafoReal, lotesFixos, terrenoReal } from '../world/cidadeReal';
import { predio, type CidadeReal } from '../data/cidadeReal';
import { arquetipo, arquetipoPorId, CONSUMO, equipamento, LV_PARA_NIVEL, MAX_LEVEL, Zone } from './catalog';
import { hash01, hash32, Rng } from './core/rng';
import { Estado } from './estado/estado';
import { Favelas } from './city/favelas';
import { ServicosSociais } from './city/servicos';
import { Territorio, type Doutrina } from './city/territorio';
import { TIPOS_LINHA, Transporte } from './city/transporte';
import type { EstadoSnapshot } from './estado/tipos';
import {
  FLAG, LOT_STATE_STRIDE, type Command, type Ledger, type Noticia, type RedeStats, type SaveData,
  type ServiceInst, type SimInit, type Stats,
} from './protocol';

export const TICKS_POR_DIA = 4;
/** No dia 1º o fechamento é do mês anterior. */
const mes0Fechamento = (mesAtual: number) => ((mesAtual + 10) % 12) + 1;
const DIAS_MES = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
/** Início do mandato: 1º de janeiro de 2027 (posse dos governadores eleitos em 2026). */
const ANO_INICIAL = 2027;

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const clamp01 = (v: number) => clamp(v, 0, 1);

export const ledgerVazio = (): Ledger => ({
  receitas: { icms: 0, consumo: 0, tarifas: 0, repasse: 0, royalties: 0, passagens: 0 },
  despesas: { vias: 0, equipamentos: 0, divida: 0, transporte: 0 },
  investimentos: 0,
  saldo: 0,
});

export const somaReceitas = (l: Ledger) => Object.values(l.receitas).reduce((a, b) => a + b, 0);
export const somaDespesas = (l: Ledger) => Object.values(l.despesas).reduce((a, b) => a + b, 0);

export interface CmdOutcome { ok: boolean; msg?: string; custo?: number }

export class Simulation {
  readonly init: SimInit;
  readonly hm: Heightmap;
  rng: Rng;
  graph: RoadGraph = emptyGraph();
  services: ServiceInst[] = [];
  nextService = 1;

  lots: LotGeom[] = [];
  raster = new Int32Array(RASTER_RES * RASTER_RES);
  worldVersion = 0;

  // ── Estado por lote (SoA) ────────────────────────────────────────────────────
  zone = new Uint8Array(0);
  arch = new Uint8Array(0);
  progress = new Float32Array(0);
  floors = new Uint8Array(0);
  look = new Float32Array(0);
  flags = new Uint8Array(0);
  lv = new Float32Array(0);
  occ = new Uint16Array(0);
  semUtil = new Uint16Array(0);
  lotPol = new Float32Array(0);
  /** Ordem estável de atendimento das redes (0–1, derivada da posição). */
  ordem = new Float32Array(0);

  pollution = new Float32Array(FIELD_RES * FIELD_RES);
  poluicaoAgua: number;

  tick = 0;
  caixa: number;
  mesCorrente: Ledger = ledgerVazio();
  ultimoBalanco: Ledger | null = null;
  historico: Stats['historico'] = [];
  aprovacao = 52;
  demanda = { r: 0.4, c: 0, i: 0.4 };
  redes = {
    agua: { capacidade: 0, uso: 0, atendidos: 0, total: 0 } as RedeStats,
    energia: { capacidade: 0, uso: 0, atendidos: 0, total: 0 } as RedeStats,
    esgoto: { capacidade: 0, uso: 0, atendidos: 0, total: 0 } as RedeStats,
  };
  populacao = 0;
  empregos = 0;
  empregados = 0;
  noticias: Noticia[] = [];
  noticiasNovas: Noticia[] = [];
  private nextNoticia = 1;
  cooldown = new Map<string, number>();
  marcos = new Set<string>();
  /** Governo estadual (Fase 3). A Visão Cidade é o Programa de Desenvolvimento Urbano da capital. */
  estado: Estado | null = null;
  private estadoSnap: EstadoSnapshot | null = null;

  // ── Fase 4 ──
  servicosSociais = new ServicosSociais();
  territorio = new Territorio();
  favelas = new Favelas();
  transporte = new Transporte();
  /** obra estadual de contenção de encostas concluída */
  contencaoEncostas = false;
  populacaoInformal = 0;
  private rasterVias = new Int32Array(RASTER_RES * RASTER_RES);

  // ── Fase 11: cidade real (OpenStreetMap) ──
  /** dados da cidade real (ruas, prédios, relevo); null = mapa procedural */
  real: CidadeReal | null = null;
  /** prédios reais demolidos pelo jogador (índices no arquivo) */
  reaisDemolidos = new Set<number>();
  /** 1 = o lote ainda é o prédio original da cidade real */
  realLote = new Uint8Array(0);
  /** capacidade das redes que já existiam (companhias estaduais) — abastece os prédios reais */
  herdada: { agua: number; energia: number; esgoto: number } | null = null;

  // ── Fase 6 ──
  clima: Clima;
  eventos: EstadoEventos = novoEstadoEventos();
  motor = new Motor(STORYLETS);
  /** efeitos visuais ativos (enchente, apagão, incêndio…) até o dia indicado */
  visuais: { tipo: string; ate: number; intensidade: number }[] = [];
  /** criminalidade extra por eventos (decai) */
  crimeExtra = 0;
  private festasCache: { ano: number; lista: Festa[] } = { ano: -1, lista: [] };
  /** pior estiagem/enchente do mês (vai para o Estado no fechamento) */
  private climaMes = { estiagem: 0, enchente: 0 };

  constructor(init: SimInit, hm?: Heightmap, real?: CidadeReal | null) {
    this.init = init;
    this.rng = new Rng(init.seed);
    this.real = real ?? null;
    this.hm = hm ?? (this.real ? terrenoReal(this.real, init.terreno, init.bioma, init.seed) : generateTerrain(init.seed, init.terreno, init.bioma));
    if (this.real) this.graph = grafoReal(this.real, (i, av) => nomeRua(init.seed ^ (i * 2654435761), av));
    const divida = Math.max(0, init.efeitos.dividaInicial ?? 0);
    this.caixa = init.modo === 'sandbox' ? 0 : Math.round(60_000_000 * (1 - 0.4 * divida));
    // Água começa tão suja quanto o esgoto real da UF permite.
    this.poluicaoAgua = clamp01(0.08 + (1 - init.esgotoUF / 100) * 0.45);
    this.clima = new Clima({ normais: init.clima ?? null, regiao: init.regiao, bioma: init.bioma, litoral: init.terreno.agua?.tipo === 'mar' || init.terreno.agua?.tipo === 'baia', latitude: init.latitude });
    if (init.estado) {
      this.estado = new Estado(init.estado);
      this.atualizarSnapshotEstado();
    }
    this.rebuildLots();
    if (this.real) this.preencherLacunas();
  }

  /**
   * Cidade real: onde nem o OSM nem o satélite mapearam prédios (nenhum num raio de ~60 m), os lotes ao longo
   * das ruas reais ganham casas (ruas) e lojas (avenidas) na fundação — rua existe porque tem gente morando.
   * Áreas verdes (mata do OSM) e trechos já mapeados ficam como estão. Valor 2 em realLote = preenchimento.
   */
  private preencherLacunas() {
    const grade = new Map<number, number>();
    const k = (x: number, z: number) => (Math.floor(x / 60) + 100) * 1000 + (Math.floor(z / 60) + 100);
    for (const l of this.lots) if (l.real !== undefined) grade.set(k(l.x, l.z), (grade.get(k(l.x, l.z)) ?? 0) + 1);
    const perto = (x: number, z: number) => {
      let n = 0;
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) n += grade.get(k(x + dx * 60, z + dz * 60)) ?? 0;
      return n;
    };
    for (let i = 0; i < this.lots.length; i++) {
      const l = this.lots[i];
      if (l.real !== undefined || this.arch[i] || perto(l.x, l.z) > 0) continue;
      if (sampleForest(this.hm, l.x, l.z) > 90 || !this.rng.chance(0.8)) continue;
      const av = this.graph.edges.get(l.edge)?.type === 'avenida';
      const zone = av ? Zone.Comercial : Zone.ResBaixa;
      const a = arquetipo(zone, av ? 1 : this.rng.chance(0.35) ? 2 : 1);
      this.zone[i] = zone; this.arch[i] = a.id; this.progress[i] = 1;
      this.floors[i] = this.rng.int(a.andaresMin, a.andaresMax);
      this.look[i] = this.rng.next();
      this.occ[i] = Math.round((a.moradores || a.empregos) * 0.85);
      this.realLote[i] = 2;
    }
  }

  private atualizarSnapshotEstado() {
    if (!this.estado) return;
    const { mes, ano } = this.data();
    this.estadoSnap = this.estado.snapshot(ano, mes);
  }

  private noticiaEstado = (texto: string, tom: Noticia['tom'], chave: string, cooldownDias: number) => this.noticia(texto, tom, chave, cooldownDias);

  get sandbox() { return this.init.modo === 'sandbox'; }
  get dia() { return Math.floor(this.tick / TICKS_POR_DIA); }

  data(): { dia: number; mes: number; ano: number } {
    let d = this.dia;
    let ano = ANO_INICIAL;
    while (d >= 365) { d -= 365; ano++; }
    let mes = 0;
    while (d >= DIAS_MES[mes]) { d -= DIAS_MES[mes]; mes++; }
    return { dia: d + 1, mes: mes + 1, ano };
  }

  dataTexto(): string {
    const { dia, mes, ano } = this.data();
    return `${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')}/${ano}`;
  }

  // ── Mundo: lotes e reconciliação ────────────────────────────────────────────────

  private footprintsEquip(): Footprint[] {
    return this.services.map((s) => {
      const eq = equipamento(s.eq);
      return { x: s.x, z: s.z, angle: s.angle, w: eq.w, d: eq.d };
    });
  }

  /** Recalcula lotes e transfere o estado dos antigos para os novos coincidentes. */
  rebuildLots() {
    const old = this.lots;
    const oldState = {
      zone: this.zone, arch: this.arch, progress: this.progress, floors: this.floors, look: this.look,
      flags: this.flags, lv: this.lv, occ: this.occ, semUtil: this.semUtil, realLote: this.realLote,
    };
    // vias e equipamentos passam por cima das casas informais (remoção forçada pela obra)
    this.rasterVias.fill(0);
    rasterizeRoads(this.graph, this.rasterVias);
    for (const fp of this.footprintsEquip()) forRectCells(fp, (idx) => { this.rasterVias[idx] = -2; });
    const removidas = this.favelas.removerSobre(this.rasterVias);
    if (removidas > 0) this.noticia(`Obra do governo derruba ${removidas} casas em área de ocupação. Moradores denunciam remoção sem aviso.`, 'alerta', 'remObra', 15);
    const fixos = this.real ? lotesFixos(this.real, this.reaisDemolidos, (id) => this.graph.edges.has(id)) : [];
    const lots = computeLots(this.graph, this.hm, this.footprintsEquip(), this.raster, this.favelas.footprints(), fixos);
    const n = lots.length;
    this.zone = new Uint8Array(n); this.arch = new Uint8Array(n); this.progress = new Float32Array(n);
    this.floors = new Uint8Array(n); this.look = new Float32Array(n); this.flags = new Uint8Array(n);
    this.lv = new Float32Array(n); this.occ = new Uint16Array(n); this.semUtil = new Uint16Array(n);
    this.lotPol = new Float32Array(n); this.ordem = new Float32Array(n); this.realLote = new Uint8Array(n);

    // hash espacial dos lotes antigos (células de 8 m)
    const grid = new Map<number, number[]>();
    const key = (x: number, z: number) => (Math.floor(x / 8) + 1000) * 4096 + (Math.floor(z / 8) + 1000);
    old.forEach((l, i) => {
      const k = key(l.x, l.z);
      (grid.get(k) ?? grid.set(k, []).get(k)!).push(i);
    });
    for (let i = 0; i < n; i++) {
      const l = lots[i];
      this.ordem[i] = hash01(Math.round(l.x * 10) * 7919 + Math.round(l.z * 10));
      this.lv[i] = 30;
      let match = -1;
      const cx = Math.floor(l.x / 8), cz = Math.floor(l.z / 8);
      for (let dx = -1; dx <= 1 && match < 0; dx++) for (let dz = -1; dz <= 1 && match < 0; dz++) {
        const arr = grid.get((cx + dx + 1000) * 4096 + (cz + dz + 1000));
        if (!arr) continue;
        for (const j of arr) {
          const o = old[j];
          const da = Math.abs(Math.atan2(Math.sin(o.angle - l.angle), Math.cos(o.angle - l.angle)));
          if (Math.hypot(o.x - l.x, o.z - l.z) < 3 && da < 0.35 && Math.abs(o.d - l.d) < 1) { match = j; break; }
        }
      }
      if (match >= 0) {
        this.zone[i] = oldState.zone[match]; this.arch[i] = oldState.arch[match];
        this.progress[i] = oldState.progress[match]; this.floors[i] = oldState.floors[match];
        this.look[i] = oldState.look[match]; this.flags[i] = oldState.flags[match];
        this.lv[i] = oldState.lv[match]; this.occ[i] = oldState.occ[match]; this.semUtil[i] = oldState.semUtil[match];
        this.realLote[i] = oldState.realLote[match] ?? 0;
      } else if (l.real !== undefined && this.real) this.ocuparPredioReal(i, l.real);
    }
    this.lots = lots;
    this.worldVersion++;
    this.servicosSociais.redimensionar(n);
    if (n && this.dia > 0) this.servicosSociais.atualizar(this, false);
  }

  /** Lote novo de um prédio real: já construído e ocupado (a cidade existe antes do jogador). */
  private ocuparPredioReal(i: number, ref: number) {
    const p = predio(this.real!, ref);
    const { zone, arch } = arquetipoReal(p.tipo, p.andares, p.w * p.d);
    const a = arquetipoPorId(arch);
    this.zone[i] = zone; this.arch[i] = arch; this.progress[i] = 1;
    this.floors[i] = Math.min(255, p.andares);
    this.look[i] = hash01(ref * 7919 + 13);
    this.occ[i] = Math.round((a.moradores || a.empregos) * 0.85);
    this.lv[i] = 30 + Math.min(40, p.andares * 2);
    this.realLote[i] = 1;
  }

  // ── Comandos do jogador ─────────────────────────────────────────────────────────

  private podePagar(custo: number) { return this.sandbox || this.caixa >= custo; }
  private pagar(custo: number) {
    if (this.sandbox) return;
    this.caixa -= custo;
    this.mesCorrente.investimentos += custo;
  }

  command(cmd: Command): CmdOutcome {
    switch (cmd.kind) {
      case 'road': {
        const fator = 1 + (this.init.efeitos.custoObras ?? 0);
        const plan = planRoad(this.graph, this.hm, cmd.req);
        if (!plan.ok) return { ok: false, msg: plan.erro };
        const custo = Math.round(plan.custo * fator);
        if (!this.podePagar(custo)) return { ok: false, msg: 'Caixa insuficiente para a obra' };
        const seed = this.rng.nextU32();
        applyRoad(this.graph, cmd.req, () => nomeRua(seed, cmd.req.type === 'avenida'));
        this.pagar(custo);
        this.rebuildLots();
        this.transporte.revalidar(this.graph);
        if (this.rng.chance(0.08)) this.noticia(`Obra entregue: trecho da ${this.graph.edges.get(this.graph.nextEdge - 1)?.name ?? 'nova via'} é inaugurado com fita, banda e discurso.`, 'bom', 'inauguracao', 20);
        return { ok: true, custo };
      }
      case 'zone': {
        let n = 0;
        const r2 = cmd.radius * cmd.radius;
        for (let i = 0; i < this.lots.length; i++) {
          const l = this.lots[i];
          if ((l.x - cmd.x) ** 2 + (l.z - cmd.z) ** 2 > r2) continue;
          if (this.zone[i] === cmd.zone) continue;
          this.zone[i] = cmd.zone;
          if (this.arch[i]) this.demolir(i);
          n++;
        }
        return { ok: n > 0, msg: n ? undefined : 'Nenhum lote aqui' };
      }
      case 'service': {
        const eq = equipamento(cmd.eq);
        const fit = serviceFootprint(this.graph, cmd.x, cmd.z, eq.w, eq.d);
        if (!fit) return { ok: false, msg: 'Precisa ficar de frente para uma via' };
        const { fp } = fit;
        if (!this.areaLivreParaEquipamento(fp)) return { ok: false, msg: 'Área ocupada ou terreno impróprio' };
        if (eq.margemAgua && sampleWaterDist(this.hm, fp.x, fp.z) > 250) return { ok: false, msg: 'Precisa ficar a até 250 m da água' };
        const custo = Math.round(eq.custo * (1 + (this.init.efeitos.custoObras ?? 0)));
        if (!this.podePagar(custo)) return { ok: false, msg: 'Caixa insuficiente' };
        this.pagar(custo);
        this.services.push({ id: this.nextService++, eq: eq.id, x: fp.x, z: fp.z, angle: fp.angle, conectado: true });
        // lotes sob o equipamento são desapropriados
        this.rebuildLots();
        return { ok: true, custo };
      }
      case 'evento': {
        const { mes } = this.data();
        void mes;
        const r = this.motor.resolver(this.eventos, cmd.uid, cmd.escolha, this.dia, this.dataTexto());
        if (!r) return { ok: false, msg: 'Essa decisão já foi tomada' };
        this.aplicarSaida(r);
        this.atualizarSnapshotEstado();
        return { ok: true, msg: r.texto || 'Decisão tomada' };
      }
      case 'estado': {
        if (!this.estado) return { ok: false, msg: 'Governo estadual indisponível' };
        const { mes, ano } = this.data();
        const r = this.estado.acao(cmd.acao, { ano, mes, rng: this.rng, noticia: this.noticiaEstado });
        this.atualizarSnapshotEstado();
        return r;
      }
      case 'operacao': {
        const { mes, ano } = this.data();
        const doutrina = (this.estado?.politicas.doutrina ?? 'confronto') as Doutrina;
        const cameras = this.estado?.politicas.cameras ?? false;
        const local = this.favelas.favelaEm(cmd.x, cmd.z) >= 0 ? this.favelas.ativas().find((f) => f.id === this.favelas.favelaEm(cmd.x, cmd.z))!.nome : this.bairro(cmd.x, cmd.z);
        const r = this.territorio.operacao(cmd.x, cmd.z, this.dia, this.rng, doutrina, cameras, this.dataTexto(), local);
        if (!r.ok) return { ok: false, msg: r.msg };
        void mes; void ano;
        this.estado?.registrarOperacao(r.mortos, r.presos);
        this.atualizarSnapshotEstado();
        this.noticia(r.mortos === 0
          ? `Operação policial no ${local} termina sem mortos: ${r.presos} presos e armas apreendidas. ${cameras ? 'Imagens das câmeras corporais foram divulgadas.' : ''}`
          : r.mortos >= 6
            ? `Operação no ${local} deixa ${r.mortos} mortos e ${r.presos} presos. Moradores denunciam execuções; ONGs pedem investigação. ${doutrina === 'confronto' ? 'Governo defende a "política de enfrentamento".' : ''}`
            : `Operação no ${local}: ${r.mortos} morto${r.mortos > 1 ? 's' : ''} e ${r.presos} presos. Escolas e postos ficam fechados durante o tiroteio.`,
          r.mortos >= 6 ? 'ruim' : r.mortos === 0 ? 'bom' : 'alerta', `op${this.dia}`, 0);
        return { ok: true, msg: `${r.mortos} mortos, ${r.presos} presos` };
      }
      case 'favela': {
        const fav = this.favelas.ativas().find((x) => x.id === cmd.id);
        if (!fav) return { ok: false, msg: 'Comunidade não encontrada' };
        const pop = this.favelas.populacao(fav);
        const { mes, ano } = this.data();
        if (cmd.acao === 'urbanizar') {
          if (fav.status !== 'informal') return { ok: false, msg: 'Só comunidades informais podem entrar no programa' };
          const custo = Math.round(pop * 11_000 * (1 + (this.init.efeitos.custoObras ?? 0)));
          if (this.estado) {
            fav.obraUid = this.estado.iniciarObraCustom({ nome: `Urbanização do ${fav.nome}`, area: 'infraestrutura', custo, meses: 10 + Math.ceil(pop / 450), custeioAnual: pop * 120, ref: { tipo: 'favela', id: fav.id } }, { ano, mes, rng: this.rng, noticia: this.noticiaEstado });
            this.atualizarSnapshotEstado();
          } else {
            if (!this.podePagar(custo)) return { ok: false, msg: 'Caixa insuficiente' };
            this.pagar(custo);
          }
          fav.status = this.estado ? 'urbanizando' : 'urbanizada';
          this.favelas.versao++;
          this.noticia(`${fav.nome} entra no programa de urbanização: saneamento, escadarias, iluminação e contenção de encostas para ${Math.round(pop).toLocaleString('pt-BR')} moradores.`, 'bom', `urb${fav.id}`, 0);
          return { ok: true, custo };
        }
        if (cmd.acao === 'regularizar') {
          if (fav.regularizada) return { ok: false, msg: 'Já regularizada' };
          const custo = Math.round(pop * 350);
          if (!this.podePagar(custo)) return { ok: false, msg: 'Caixa insuficiente' };
          this.pagar(custo);
          fav.regularizada = true;
          this.favelas.versao++;
          this.noticia(`Regularização fundiária: famílias do ${fav.nome} recebem o título de posse das casas. "Agora é nosso de verdade", comemora moradora.`, 'bom', `reg${fav.id}`, 0);
          return { ok: true, custo };
        }
        if (fav.status === 'removendo') return { ok: false, msg: 'Remoção já em andamento' };
        const custo = Math.round((pop / 3.5) * 28_000);
        if (!this.podePagar(custo)) return { ok: false, msg: 'Caixa insuficiente para indenizações e aluguel social' };
        this.pagar(custo);
        fav.status = 'removendo';
        fav.removerPorSemana = Math.max(1, Math.ceil(fav.casas.length / 7));
        this.favelas.versao++;
        this.estado?.registrarTragedia(4);
        this.noticia(`Governo anuncia a remoção do ${fav.nome}. Moradores bloqueiam a avenida em protesto; Defensoria pede suspensão.`, 'ruim', `remo${fav.id}`, 0);
        return { ok: true, custo };
      }
      case 'linha': {
        const tipo = cmd.tipo;
        const def = TIPOS_LINHA[tipo];
        if (def.obra && !this.estado) return { ok: false, msg: 'BRT, metrô e teleférico são obras do Tesouro estadual (indisponível)' };
        const plano = Transporte.planejar(this.graph, tipo, cmd.paradas);
        if (!plano.ok) return { ok: false, msg: plano.erro };
        if (!def.obra && !this.podePagar(plano.custoCidade)) return { ok: false, msg: 'Caixa insuficiente para paradas e frota' };
        const perto = this.favelas.ativas().find((fv) => cmd.paradas.some((p) => Math.hypot(p.x - fv.cx, p.z - fv.cz) < 250));
        const r = this.transporte.criar(this.graph, tipo, cmd.paradas, perto?.nome ?? this.bairro(cmd.paradas[0].x, cmd.paradas[0].z));
        if (!r.ok || !r.linha) return { ok: false, msg: r.erro };
        if (def.obra) {
          const { mes, ano } = this.data();
          r.linha.obraUid = this.estado!.iniciarObraCustom({ nome: `${def.nome}: ${r.linha.nome}`, area: 'transporte', custo: Math.round(plano.custoObra * (1 + (this.init.efeitos.custoObras ?? 0))), meses: plano.mesesObra, custeioAnual: 0, ambiental: tipo === 'metro', ref: { tipo: 'linha', id: r.linha.id } }, { ano, mes, rng: this.rng, noticia: this.noticiaEstado });
          this.atualizarSnapshotEstado();
          return { ok: true, custo: plano.custoObra, msg: `Obra estadual de ${plano.mesesObra} meses` };
        }
        this.pagar(plano.custoCidade);
        this.noticia(`Nova linha de ônibus: a ${r.linha.nome} começa a rodar com ${r.linha.frota} veículos e ${cmd.paradas.length} paradas.`, 'bom', `lin${r.linha.id}`, 0);
        return { ok: true, custo: plano.custoCidade };
      }
      case 'linha-remover': {
        this.transporte.remover(cmd.id);
        return { ok: true };
      }
      case 'linha-frota': {
        const l = this.transporte.linhas.find((x) => x.id === cmd.id);
        if (!l) return { ok: false, msg: 'Linha não encontrada' };
        const nova = Math.max(1, Math.min(400, Math.round(cmd.frota)));
        const extra = Math.max(0, nova - l.frota) * TIPOS_LINHA[l.tipo].custoVeiculo;
        if (!this.podePagar(extra)) return { ok: false, msg: 'Caixa insuficiente para comprar veículos' };
        this.pagar(extra);
        l.frota = nova;
        this.transporte.versaoLinhas++;
        return { ok: true, custo: extra };
      }
      case 'transporte-politica': {
        if (cmd.tarifa !== undefined) {
          const antes = this.transporte.tarifa;
          this.transporte.tarifa = clamp(Math.round(cmd.tarifa * 20) / 20, 0, 12);
          if (this.transporte.tarifa > antes + 0.2) this.noticia(`Passagem sobe para R$ ${this.transporte.tarifa.toFixed(2).replace('.', ',')}. Estudantes convocam ato contra o aumento.`, 'ruim', 'tarifa', 30);
          if (this.transporte.tarifa === 0) this.noticia('Tarifa zero! Ônibus, BRT e metrô passam a ser gratuitos na capital.', 'bom', 'tarifa0', 90);
        }
        if (cmd.vans) {
          this.transporte.vans = cmd.vans;
          this.noticia({ combater: 'Governo declara guerra às vans piratas: blitz apreende dezenas de veículos.', tolerar: 'Governo volta a fazer vista grossa para as vans e mototáxis.', regularizar: 'Vans e mototáxis serão regularizados com placa, seguro e vistoria.' }[cmd.vans], 'info', 'vans', 15);
        }
        return { ok: true };
      }
      case 'bulldoze': {
        const si = this.services.findIndex((s) => {
          const eq = equipamento(s.eq);
          return insideFootprint({ x: s.x, z: s.z, angle: s.angle, w: eq.w, d: eq.d }, cmd.x, cmd.z, 2);
        });
        if (si >= 0) {
          this.services.splice(si, 1);
          this.rebuildLots();
          return { ok: true };
        }
        const li = this.lotAt(cmd.x, cmd.z);
        // prédio real: a demolição é permanente e libera o terreno
        if (li >= 0 && this.lots[li].real !== undefined) {
          this.reaisDemolidos.add(this.lots[li].real!);
          this.rebuildLots();
          return { ok: true };
        }
        if (li >= 0 && (this.arch[li] || this.zone[li])) {
          this.demolir(li);
          this.zone[li] = Zone.None;
          return { ok: true };
        }
        const near = findEdgeNear(this.graph, cmd.x, cmd.z, 10);
        if (near) {
          removeEdge(this.graph, near.edge.id);
          this.rebuildLots();
          const suspensas = this.transporte.revalidar(this.graph);
          if (suspensas.length) this.noticia(`Demolição da via corta o trajeto e suspende: ${suspensas.join(', ')}.`, 'alerta', 'susp', 5);
          return { ok: true };
        }
        return { ok: false, msg: 'Nada para demolir aqui' };
      }
    }
  }

  private areaLivreParaEquipamento(fp: Footprint): boolean {
    let ok = true;
    forRectCells(fp, (idx) => {
      const v = this.raster[idx];
      if (v === -1 || v === -2 || v === RASTER_INFORMAL) { ok = false; return false; }
      if (v > 0 && this.arch[v - 1] && arquetipoPorId(this.arch[v - 1]).level >= 3) { ok = false; return false; }
    });
    if (!ok) return false;
    const c = Math.cos(fp.angle), s = Math.sin(fp.angle);
    const hs: number[] = [];
    for (const [u, v] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5], [0, 0]]) {
      const lx = u * fp.w, lz = v * fp.d;
      hs.push(sampleHeight(this.hm, fp.x + c * lx + s * lz, fp.z - s * lx + c * lz));
    }
    return Math.min(...hs) > 0.8 && Math.max(...hs) - Math.min(...hs) < 9;
  }

  lotAt(x: number, z: number): number {
    const i = Math.floor((x + BUILD_HALF) / 2), j = Math.floor((z + BUILD_HALF) / 2);
    if (i < 0 || j < 0 || i >= RASTER_RES || j >= RASTER_RES) return -1;
    const v = this.raster[j * RASTER_RES + i];
    return v > 0 ? v - 1 : -1;
  }

  private demolir(i: number) {
    this.arch[i] = 0; this.progress[i] = 0; this.floors[i] = 0; this.occ[i] = 0;
    this.realLote[i] = 0;
    this.flags[i] &= ~FLAG.ABANDONADO;
    this.semUtil[i] = 0;
  }

  // ── Passo de simulação ──────────────────────────────────────────────────────────

  step() {
    this.tick++;
    if (this.tick % TICKS_POR_DIA === 0) this.passoDiario();
  }

  private passoDiario() {
    {
      const { mes, dia } = this.data();
      const cl = this.clima.diario(mes, dia, this.rng, this.contencaoEncostas ? 0.35 : 0);
      this.climaMes.estiagem = Math.max(this.climaMes.estiagem, cl.estiagem);
      this.climaMes.enchente = Math.max(this.climaMes.enchente, cl.enchente);
      this.crimeExtra *= 0.97;
    }
    this.redesDeServico();
    this.servicosSociais.atualizar(this);
    this.territorio.atualizar(this, (this.estado?.politicas.doutrina ?? 'confronto') as Doutrina, this.transporte.vans);
    {
      const { mes } = this.data();
      // deslizamentos seguem a chuva real dos últimos 3 dias (com o clima) ou o calendário (sem ele)
      const p99 = Math.max(25, this.clima.normais(mes).p99);
      const fc = 20 * Math.pow(clamp(this.clima.resumo.chuva3d / p99 - 0.4, 0, 2), 2);
      const desl = this.favelas.diario(this, mes, this.init.regiao === 'Nordeste', fc);
      if (desl) this.estado?.registrarTragedia(desl.mortos);
    }
    if (this.dia % 7 === 0) {
      this.favelas.semanal(this);
      this.transporte.semanal(this);
    }
    this.camposDePoluicao();
    this.valorDoSolo();
    this.calcularDemanda();
    this.crescimento();
    this.contabilizarAgregados();
    this.verificarNoticias();
    const { dia } = this.data();
    if (dia === 1) this.fechamentoMensal();
    if (this.estado) {
      // calendário eleitoral (Fase 7)
      const { mes, ano } = this.data();
      const tv = this.estado.atores.imprensa.find((v) => v.id === 'tv')!;
      this.estado.diario({ ano, mes, dia, rng: this.rng, noticia: this.noticiaEstado, tv: { ancora: tv.rosto.nome, nome: tv.nome } });
      if (ano % 4 === 2 || (mes === 1 && dia === 6)) this.atualizarSnapshotEstado();
    }
    this.passoEventos(dia === 1);
  }

  // ── Eventos (storylets), festas e efeitos visuais ───────────────────────────────

  festaHoje(): Festa | null {
    const { dia, mes, ano } = this.data();
    if (this.festasCache.ano !== ano) this.festasCache = { ano, lista: festasDoAno(this.init.festas, ano, this.init.regiao) };
    return festaEm(this.festasCache.lista, diaDoAnoReal(ano, mes, dia));
  }

  private passoEventos(novoMes: boolean) {
    const { dia: diaMes, mes, ano } = this.data();
    const data = this.dataTexto();
    this.visuais = this.visuais.filter((v) => v.ate > this.dia);
    // efeitos visuais derivados do tempo
    const cl = this.clima.resumo;
    const { ctx, textos } = this.contextoEventos();
    for (const r of this.motor.vencidos(this.eventos, ctx, this.dia, data, this.rng)) this.aplicarSaida(r);
    // gatilhos diários (tempo, desastres, festas)
    const diarios = this.motor.elegiveis(this.eventos, ctx, 'diario', this.dia).filter((st) => this.rng.chance(st.chance));
    if (diarios.length) {
      const st = sortearStorylet(diarios, this.rng)!;
      const r = this.motor.disparar(this.eventos, st, ctx, textos, this.dia, data);
      if (r.imediato) this.aplicarSaida(r.imediato);
      if (r.pendente) this.noticia(`${r.pendente.titulo}: ${r.pendente.texto}`, st.tom, `ev-${st.id}`, 0);
    }
    // mensais: de zero a dois por mês
    if (novoMes && this.dia > 20) {
      const n = this.rng.next() < 0.15 ? 0 : this.rng.next() < 0.6 ? 1 : 2;
      for (let k = 0; k < n; k++) {
        const { ctx: c2, textos: t2 } = this.contextoEventos();
        const st = sortearStorylet(this.motor.elegiveis(this.eventos, c2, 'mensal', this.dia), this.rng);
        if (!st) break;
        const r = this.motor.disparar(this.eventos, st, c2, t2, this.dia, data);
        if (r.imediato) this.aplicarSaida(r.imediato);
        if (r.pendente) this.noticia(`${r.pendente.titulo}: ${r.pendente.texto}`, st.tom, `ev-${st.id}`, 0);
      }
    }
    void diaMes; void mes; void ano; void cl;
  }

  private aplicarSaida(r: SaidaEfeito) {
    if (r.texto) this.noticia(r.texto, r.tom, r.chave, 0);
    this.aplicarEfeitos(r.efeitos);
  }

  aplicarEfeitos(ef: Efeitos) {
    if (this.estado) {
      this.estado.aplicarEfeitos(ef);
      this.atualizarSnapshotEstado();
    } else if (ef.aprovacao) this.aprovacao = clamp(this.aprovacao + ef.aprovacao, 0, 100);
    if (ef.aprovacaoCidade) this.aprovacao = clamp(this.aprovacao + ef.aprovacaoCidade, 0, 100);
    // gasto de evento entra no balanço do mês como investimento (receita, como repasse)
    if (ef.caixaCidade) {
      this.caixa += ef.caixaCidade;
      if (ef.caixaCidade < 0) this.mesCorrente.investimentos -= ef.caixaCidade;
      else this.mesCorrente.receitas.repasse += ef.caixaCidade;
    }
    if (ef.crime) this.crimeExtra = clamp(this.crimeExtra + ef.crime, 0, 0.5);
    if (ef.flag && !this.eventos.flags.includes(ef.flag)) this.eventos.flags.push(ef.flag);
    if (ef.limparFlag) this.eventos.flags = this.eventos.flags.filter((x) => x !== ef.limparFlag);
    if (ef.visual) this.visuais.push({ tipo: ef.visual.tipo, ate: this.dia + ef.visual.dias, intensidade: 1 });
  }

  /** Variáveis que as condições dos storylets podem ler, e os textos dos templates. */
  contextoEventos(): { ctx: Contexto; textos: Record<string, string> } {
    const { dia, mes, ano } = this.data();
    const cl = this.clima.resumo;
    const festa = this.festaHoje();
    const diaAno = diaDoAnoReal(ano, mes, dia);
    const ss = this.servicosSociais.resumo;
    const terr = this.territorio.resumo;
    const cob = (r: RedeStats) => (r.total > 0 ? r.atendidos / r.total : 1);
    const fav = this.favelas.ativas();
    const favRisco = fav.reduce((m, x) => (x.risco > (m?.risco ?? -1) ? x : m), null as (typeof fav)[number] | null);
    const W = this.populacao * 0.5;
    const e = this.estado;
    const ctx: Contexto = {
      mes, ano, dia, diaAno, anoMandato: ano - 2026, eleicao: ano % 4 === 2,
      uf: this.init.sigla, regiao: this.init.regiao, bioma: this.init.bioma,
      litoral: this.init.terreno.agua?.tipo === 'mar' || this.init.terreno.agua?.tipo === 'baia', rio: this.init.terreno.agua?.tipo === 'rio' || !!this.init.terreno.rio,
      relevo: this.init.terreno.relevo, tracos: Object.keys(this.init.efeitos).filter((k) => (this.init.efeitos[k as keyof typeof this.init.efeitos] ?? 0) > 0),
      sandbox: this.sandbox,
      // tempo
      chuvaHoje: cl.chuvaHoje, chuva3d: cl.chuva3d, chuva7d: cl.chuva7d, chuva30d: cl.chuva30d, temp: cl.temp, tMax: cl.tMax, tMin: cl.tMin,
      diasCalor: cl.diasCalor, enchente: cl.enchente, estiagem: cl.estiagem, secura: cl.secura, calor: cl.calor, fumaca: cl.fumaca,
      ressaca: cl.ressaca, geada: cl.geada, enso: cl.enso, alerta: cl.alerta, periodo: cl.periodo, estacao: cl.estacao,
      // festas
      festa: festa?.tipo ?? 'nenhuma', festaComeca: !!festa && festa.inicio === diaAno, festaTurismo: festa?.turismo ?? 0,
      // capital
      pop: this.populacao + this.populacaoInformal, aprovCidade: this.aprovacao, caixaCidade: this.caixa,
      desempCidade: W > 0 ? clamp01((W - this.empregos) / W) : 0, crime: ss.crime, cobSaude: ss.saude, cobEdu: ss.educacao, cobSeg: ss.seguranca,
      favelas: fav.length, favelaRisco: favRisco?.risco ?? 0, popInformal: this.populacaoInformal,
      territorio: terr.faccao + terr.milicia, guerra: terr.guerra, esgoto: cob(this.redes.esgoto), agua: cob(this.redes.agua), energia: cob(this.redes.energia),
      congest: this.transporte.resumo.congestionamento, desloc: this.transporte.resumo.tempoMedio, linhas: this.transporte.linhas.length,
      metro: this.transporte.linhas.some((l) => l.tipo === 'metro' && l.status === 'operando'),
      poluicaoAgua: this.poluicaoAgua, edificios: this.lots.length ? this.arch.reduce((a, v) => a + (v ? 1 : 0), 0) : 0,
      temEstado: !!e, flags: this.eventos.flags,
    };
    const textos: Record<string, string> = {
      cidade: this.init.cidade, estado: this.init.nomeEstado, uf: this.init.sigla, deUF: deUF(this.init.sigla, this.init.nomeEstado),
      bairro: this.bairroAleatorio(), favela: favRisco?.nome ?? this.bairroAleatorio(), festa: festa?.nome ?? 'a festa',
      time: 'Cometa F.C.', rival: 'Estrela Real',
    };
    if (e) {
      const s = e.snapshot(ano, mes);
      const ind = s.indicadores, ind0 = s.indicadoresIniciais;
      Object.assign(ctx, {
        aprovacao: s.aprovacao, caixaRcl: s.caixa / Math.max(1, s.rcl12), pessoalPct: s.pessoalPctRcl, dclPct: s.dclPctRcl, regime: s.regime, capag: s.capag,
        rrf: s.regime === 'RRF', duodecimos: s.duodecimos, base: s.baseAliada, capitalPol: s.pol.capital,
        homicidiosRel: ind.homicidios / Math.max(0.1, ind0.homicidios), esperaRel: ind.esperaEmergencia / Math.max(0.1, ind0.esperaEmergencia),
        desemprego: ind.desemprego, pobreza: ind.pobreza, ideb: ind.ideb, filaRel: ind.filaCirurgias / Math.max(0.01, ind0.filaCirurgias),
        greve: s.greves.length > 0, escandalos: s.pol.escandalos.filter((x) => x.fase !== 'encerrado').length, cpi: s.pol.cpis.some((c) => c.status === 'instalada'),
        prefeitoRel: s.atores.prefeitos[0]?.relacao ?? 0, prefeitosRel: s.atores.prefeitos.reduce((a, p) => a + p.relacao, 0) / Math.max(1, s.atores.prefeitos.length),
        presidenteRel: s.atores.presidente.relacao, alinhamento: s.atores.presidente.alinhamento, presidentePop: s.atores.presidente.popularidade,
        imprensa: -s.amplificador, publicidade: s.atores.publicidade > 0, forcaNacional: s.atores.forcaNacional > 0, calamidade: s.atores.calamidade > 0,
        petroleo: (this.init.efeitos.receitaRoyalties ?? 0) > 0, reformada: s.previdencia.reformada, ppa: s.ppaDefinido,
      });
      const p0 = s.atores.prefeitos[0], p1 = s.atores.prefeitos[1 + (this.dia % Math.max(1, s.atores.prefeitos.length - 1))] ?? p0;
      const opos = s.pol.deputados.filter((d) => d.relacao < -0.2), aliados = s.pol.deputados.filter((d) => d.relacao > 0.3);
      const pick = <T,>(xs: T[]) => xs[this.dia % Math.max(1, xs.length)];
      const im = (id: string) => s.atores.imprensa.find((v) => v.id === id)!;
      Object.assign(textos, {
        prefeito: p0?.nome ?? 'o prefeito', cidade2: p1?.cidade ?? this.init.cidade, prefeito2: p1?.nome ?? 'o prefeito',
        presidente: s.atores.presidente.nome, presidentePartido: s.atores.presidente.partido,
        tv: im('tv').nome, jornal: im('jornal').nome, portal: im('portal').nome, blog: im('blog').nome, influencer: im('influencer').nome, zap: im('zap').nome,
        ancora: im('tv').rosto.nome, colunista: im('jornal').rosto.nome, reporter: im('blog').rosto.nome,
        deputado: pick(opos)?.urna ?? 'um deputado da oposição', deputadoBase: pick(aliados)?.urna ?? 'um deputado governista',
        presidenteALE: s.pol.deputados.find((d) => d.id === s.pol.presidenteALE)?.urna ?? 'o presidente da ALE',
      });
      for (const c of CARGOS) textos[`sec_${c.id}`] = s.pol.secretarios[c.id].nome;
    } else {
      Object.assign(textos, { prefeito: 'o prefeito', cidade2: this.init.cidade, prefeito2: 'o prefeito', presidente: 'o Presidente', tv: 'TV Guará', jornal: 'O Pregoeiro', portal: 'Plantão N27', blog: 'Holofote Investiga', influencer: '@vozdaquebrada', zap: 'grupo de WhatsApp', ancora: 'a âncora', colunista: 'a colunista', reporter: 'o repórter', deputado: 'um vereador da oposição', deputadoBase: 'um aliado', presidenteALE: 'o presidente da Câmara' });
      for (const c of CARGOS) textos[`sec_${c.id}`] = 'o secretário';
    }
    return { ctx, textos };
  }

  /** Redes de água, energia e esgoto: componentes conexos do grafo viário. */
  private redesDeServico() {
    const comp = components(this.graph);
    const edgeComp = new Map<number, number>();
    for (const e of this.graph.edges.values()) edgeComp.set(e.id, comp.get(e.a)!);

    type Cap = { agua: number; energia: number; esgoto: number };
    const capPorComp = new Map<number, Cap>();
    for (const s of this.services) {
      const eq = equipamento(s.eq);
      const near = findEdgeNear(this.graph, s.x, s.z, Math.max(eq.w, eq.d) + 16);
      s.conectado = !!near;
      if (!near || (eq.rede !== 'agua' && eq.rede !== 'energia' && eq.rede !== 'esgoto')) continue;
      const c = edgeComp.get(near.edge.id)!;
      const cap = capPorComp.get(c) ?? { agua: 0, energia: 0, esgoto: 0 };
      const cl = this.clima.resumo;
      cap[eq.rede] += eq.capacidade * (eq.rede === 'agua' ? 1 - 0.35 * cl.estiagem : eq.rede === 'energia' ? 1 - 0.18 * cl.calor : 1);
      capPorComp.set(c, cap);
    }

    // demanda por componente
    const dem = new Map<number, Cap>();
    const n = this.lots.length;
    const consumo = (i: number): Cap => {
      if (!this.arch[i] || this.progress[i] < 1) return { agua: 0, energia: 0, esgoto: 0 };
      const a = arquetipoPorId(this.arch[i]);
      const cap = a.moradores + a.empregos;
      const ind = a.zone === Zone.Industrial;
      const agua = a.moradores * CONSUMO.aguaMorador + a.empregos * CONSUMO.aguaEmprego;
      const energia = a.moradores * CONSUMO.energiaMorador + a.empregos * (ind ? CONSUMO.energiaIndustria : CONSUMO.energiaComercio);
      return cap ? { agua, energia, esgoto: agua * CONSUMO.esgotoFator } : { agua: 0, energia: 0, esgoto: 0 };
    };
    const cons: Cap[] = new Array(n);
    for (let i = 0; i < n; i++) {
      cons[i] = consumo(i);
      const c = edgeComp.get(this.lots[i].edge);
      if (c === undefined) continue;
      const d = dem.get(c) ?? { agua: 0, energia: 0, esgoto: 0 };
      d.agua += cons[i].agua; d.energia += cons[i].energia; d.esgoto += cons[i].esgoto;
      dem.set(c, d);
    }

    // Fase 11: as redes que já existiam na cidade real atendem os prédios originais, proporcionalmente
    if (this.real) {
      const demReal = new Map<number, Cap>();
      const totReal = { agua: 0, energia: 0, esgoto: 0 };
      for (let i = 0; i < n; i++) {
        if (!this.realLote[i]) continue;
        const c = edgeComp.get(this.lots[i].edge);
        if (c === undefined) continue;
        const d = demReal.get(c) ?? { agua: 0, energia: 0, esgoto: 0 };
        d.agua += cons[i].agua; d.energia += cons[i].energia; d.esgoto += cons[i].esgoto;
        totReal.agua += cons[i].agua; totReal.energia += cons[i].energia; totReal.esgoto += cons[i].esgoto;
        demReal.set(c, d);
      }
      // dimensionada uma vez, na fundação: 5% de folga; esgoto só na cobertura real da UF
      this.herdada ??= { agua: totReal.agua * 1.05, energia: totReal.energia * 1.05, esgoto: totReal.esgoto * 1.05 * this.init.esgotoUF / 100 };
      for (const [c, d] of demReal) {
        const cap = capPorComp.get(c) ?? { agua: 0, energia: 0, esgoto: 0 };
        for (const k of ['agua', 'energia', 'esgoto'] as const) if (totReal[k] > 0) cap[k] += this.herdada[k] * (d[k] / totReal[k]);
        capPorComp.set(c, cap);
      }
    }

    const tot = { agua: [0, 0, 0, 0], energia: [0, 0, 0, 0], esgoto: [0, 0, 0, 0] };
    for (const cap of capPorComp.values()) { tot.agua[0] += cap.agua; tot.energia[0] += cap.energia; tot.esgoto[0] += cap.esgoto; }
    let esgotoBruto = 0;
    for (let i = 0; i < n; i++) {
      const c = edgeComp.get(this.lots[i].edge);
      const cap = c !== undefined ? capPorComp.get(c) : undefined;
      const d = c !== undefined ? dem.get(c) : undefined;
      let f = this.flags[i] & FLAG.ABANDONADO;
      const ratio = (k: keyof Cap) => (cap && d && d[k] > 0 ? cap[k] / d[k] : cap && cap[k] > 0 ? 1 : 0);
      const ord = this.ordem[i];
      if (ord < ratio('agua')) f |= FLAG.AGUA;
      if (ord < ratio('energia')) f |= FLAG.ENERGIA;
      if (ord < ratio('esgoto')) f |= FLAG.ESGOTO;
      this.flags[i] = f;
      const ci = cons[i];
      if (ci.agua > 0) {
        tot.agua[1] += ci.agua; tot.agua[3]++; if (f & FLAG.AGUA) { tot.agua[2]++; }
        tot.energia[1] += ci.energia; tot.energia[3]++; if (f & FLAG.ENERGIA) tot.energia[2]++;
        tot.esgoto[1] += ci.esgoto; tot.esgoto[3]++;
        if (f & FLAG.ESGOTO) tot.esgoto[2]++; else esgotoBruto += ci.esgoto;
      }
    }
    const pack = (t: number[]): RedeStats => ({ capacidade: t[0], uso: t[1], atendidos: t[2], total: t[3] });
    this.redes.agua = pack(tot.agua);
    this.redes.energia = pack(tot.energia);
    this.redes.esgoto = pack(tot.esgoto);

    // Poluição da água: esgoto in natura + indústria + memória do passado (dados reais da UF)
    let indDespejo = 0;
    for (const s of this.services) if (s.eq === 'termeletrica') indDespejo += 0.03;
    esgotoBruto += this.favelas.populacaoSemSaneamento() * CONSUMO.esgotoFator;
    const esgotoRef = this.estado ? this.estado.esgotoPct : this.init.esgotoUF;
    const alvo = clamp01(0.06 + (1 - esgotoRef / 100) * 0.3 + esgotoBruto / (esgotoBruto + 25_000) * 0.6 + indDespejo);
    this.poluicaoAgua += (alvo - this.poluicaoAgua) * 0.01;
  }

  private camposDePoluicao() {
    const R = FIELD_RES;
    const p = this.pollution;
    const next = new Float32Array(R * R);
    const add = (x: number, z: number, v: number) => {
      const i = Math.floor((x + BUILD_HALF) / FIELD_CELL), j = Math.floor((z + BUILD_HALF) / FIELD_CELL);
      if (i >= 0 && j >= 0 && i < R && j < R) next[j * R + i] += v;
    };
    for (let i = 0; i < this.lots.length; i++) {
      if (!this.arch[i] || this.progress[i] < 1) continue;
      const a = arquetipoPorId(this.arch[i]);
      if (a.zone === Zone.Industrial) add(this.lots[i].x, this.lots[i].z, a.level === 2 ? 0.5 : 0.25);
    }
    for (const s of this.services) {
      const eq = equipamento(s.eq);
      if (eq.poluicao) add(s.x, s.z, eq.poluicao * 0.25);
    }
    for (let j = 0; j < R; j++) for (let i = 0; i < R; i++) {
      const k = j * R + i;
      let viz = 0, nv = 0;
      if (i > 0) { viz += p[k - 1]; nv++; }
      if (i < R - 1) { viz += p[k + 1]; nv++; }
      if (j > 0) { viz += p[k - R]; nv++; }
      if (j < R - 1) { viz += p[k + R]; nv++; }
      next[k] += (p[k] * 0.6 + (viz / nv) * 0.4) * 0.9;
    }
    this.pollution = next;
    for (let i = 0; i < this.lots.length; i++) {
      const l = this.lots[i];
      const fi = Math.floor((l.x + BUILD_HALF) / FIELD_CELL), fj = Math.floor((l.z + BUILD_HALF) / FIELD_CELL);
      const v = next[clamp(fj, 0, R - 1) * R + clamp(fi, 0, R - 1)];
      this.lotPol[i] = v / (v + 1.5);
    }
  }

  private valorDoSolo() {
    const ef = this.init.efeitos;
    const lazer = this.services.filter((s) => equipamento(s.eq).rede === 'lazer');
    const sujos = this.services.filter((s) => ['termeletrica', 'ete', 'subestacao'].includes(s.eq));
    for (let i = 0; i < this.lots.length; i++) {
      const l = this.lots[i];
      const dAgua = sampleWaterDist(this.hm, l.x, l.z);
      const orla = clamp01(1 - (dAgua - 30) / 480);
      let v = 24;
      v += orla * (30 + 10 * (ef.turismo ?? 0)) * (1 - this.poluicaoAgua * 0.7);
      for (const s of lazer) {
        const eq = equipamento(s.eq);
        const d = Math.hypot(s.x - l.x, s.z - l.z);
        if (d < eq.raio!) v += eq.bonus! * (1 - d / eq.raio!);
      }
      for (const s of sujos) {
        const d = Math.hypot(s.x - l.x, s.z - l.z);
        if (d < 160) v -= 12 * (1 - d / 160);
      }
      const f = this.flags[i];
      if (f & FLAG.AGUA) v += 7;
      if (f & FLAG.ENERGIA) v += 7;
      if (f & FLAG.ESGOTO) v += 7;
      v -= 50 * this.lotPol[i];
      v += 15 * (ef.qualidadeVida ?? 0) + 6 * (ef.renda ?? 0);
      // Fase 4: serviços sociais, crime, domínio territorial, vizinhança informal e acessibilidade
      const ss = this.servicosSociais;
      v += 8 * ss.saude[i] + 8 * ss.educacao[i] + 5 * ss.seguranca[i] - 30 * ss.crime[i] - 12 * this.territorio.controleEm(l.x, l.z);
      for (const fv of this.favelas.ativas()) {
        const R = this.favelas.raioAproximado(fv) + 90;
        const d = Math.hypot(fv.cx - l.x, fv.cz - l.z);
        if (d < R) v -= (fv.status === 'urbanizada' ? 3 : 10) * (1 - d / R);
      }
      if (this.transporte.resumo.viagensDia > 0) v += 8 * clamp((40 - this.transporte.tempoEm(l.x, l.z)) / 30, -1, 1);
      // mora alto, mora bem: vista nas encostas suaves
      v += clamp((l.baseY - 6) * 0.15, 0, 6);
      this.lv[i] += (clamp(v, 0, 100) - this.lv[i]) * 0.15;
    }
  }

  private calcularDemanda() {
    const ef = this.init.efeitos;
    let resCap = 0, comCap = 0, indCap = 0;
    for (let i = 0; i < this.lots.length; i++) {
      if (!this.arch[i] || (this.flags[i] & FLAG.ABANDONADO)) continue;
      const a = arquetipoPorId(this.arch[i]);
      resCap += a.moradores; // inclui obras: evita superoferta
      if (a.zone === Zone.Comercial) comCap += a.empregos;
      if (a.zone === Zone.Industrial) indCap += a.empregos;
    }
    const R = Math.max(this.populacao, resCap * 0.9) + this.populacaoInformal;
    const W = 0.5 * R;
    const jobs = comCap + indCap;
    const atrat = (this.aprovacao - 50) / 120 + 0.08 * (ef.qualidadeVida ?? 0);
    const r = 0.45 + 1.25 * (jobs - W) / Math.max(300, W) + atrat;
    const alvoC = 0.22 * R * (1 + 0.5 * (ef.turismo ?? 0) + 0.3 * (ef.servicos ?? 0));
    const c = 1.5 * (alvoC - comCap) / Math.max(120, alvoC);
    const alvoI = 0.16 * R * (1 + 0.6 * (ef.industria ?? 0) + 0.3 * (ef.agro ?? 0)) + 60;
    const desemprego = W > 0 ? clamp01((W - jobs) / W) : 0;
    const i = 1.5 * (alvoI - indCap) / Math.max(150, alvoI) + (desemprego > 0.12 ? 0.2 : 0);
    const s = 0.25; // suavização
    this.demanda.r += (clamp(r, -1, 1) - this.demanda.r) * s;
    this.demanda.c += (clamp(c, -1, 1) - this.demanda.c) * s;
    this.demanda.i += (clamp(i, -1, 1) - this.demanda.i) * s;
  }

  private crescimento() {
    const n = this.lots.length;
    const novosMax = { r: Math.ceil(2 + 26 * Math.max(0, this.demanda.r)), c: Math.ceil(1 + 14 * Math.max(0, this.demanda.c)), i: Math.ceil(1 + 10 * Math.max(0, this.demanda.i)) };
    const novos = { r: 0, c: 0, i: 0 };
    const demandaDe = (z: number) => (z === Zone.Comercial ? 'c' : z === Zone.Industrial ? 'i' : 'r') as 'r' | 'c' | 'i';
    const fill = this.empregos > 0 ? clamp01(this.empregados / this.empregos) : 0;
    // ordem de varredura varia por dia para não favorecer sempre os mesmos lotes
    const start = this.rng.int(0, Math.max(0, n - 1));
    for (let k = 0; k < n; k++) {
      const i = (start + k) % n;
      const z = this.zone[i] as Zone;
      const a = this.arch[i] ? arquetipoPorId(this.arch[i]) : null;
      if (a && a.zone !== z) { this.demolir(i); continue; }
      if (!z) continue;
      const tipo = demandaDe(z);
      // ZEIS responde também ao déficit habitacional popular
      const d = z === Zone.ZEIS ? Math.max(this.demanda.r, clamp(this.favelas.deficit / 2000, 0, 1)) : this.demanda[tipo];
      if (!a) {
        if (d <= 0.02 || novos[tipo] >= novosMax[tipo]) continue;
        const p = (0.01 + 0.06 * d) * (0.45 + this.lv[i] / 90);
        if (!this.rng.chance(p)) continue;
        this.construir(i, z, 1);
        novos[tipo]++;
        continue;
      }
      if (this.progress[i] < 1) {
        this.progress[i] = Math.min(1, this.progress[i] + 1 / a.obra);
        continue;
      }
      const f = this.flags[i];
      const basico = (f & FLAG.AGUA) && (f & FLAG.ENERGIA);
      const cap = a.moradores || a.empregos;
      if (f & FLAG.ABANDONADO) {
        this.occ[i] = 0;
        if (basico && this.rng.chance(0.03)) { this.flags[i] &= ~FLAG.ABANDONADO; this.semUtil[i] = 0; }
        continue;
      }
      if (!basico) {
        this.semUtil[i] = Math.min(65535, this.semUtil[i] + 1);
        if (this.semUtil[i] > 150 && a.level >= 1 && this.rng.chance(0.02)) { this.flags[i] |= FLAG.ABANDONADO; this.occ[i] = 0; continue; }
      } else this.semUtil[i] = 0;
      const alvo = cap * (basico ? 1 : 0.35) * (a.moradores ? 1 : 0.35 + 0.65 * fill);
      // mudança gradual (20%/dia), mas sempre ao menos 1 pessoa — evita travar no arredondamento
      const diff = Math.round(alvo) - this.occ[i];
      if (diff !== 0) this.occ[i] += Math.sign(diff) * Math.max(1, Math.round(Math.abs(diff) * 0.2));
      // prédios reais não são reconstruídos pela simulação (só por decisão do jogador)
      if (this.realLote[i]) continue;
      // evolução
      const prox = a.level + 1;
      const ss = this.servicosSociais;
      const social = prox < 3 || (a.moradores ? ss.saude[i] >= 0.2 && ss.educacao[i] >= 0.2 : ss.seguranca[i] >= 0.15);
      const seguro = prox < 4 || ss.seguranca[i] >= 0.2;
      if (ss.crime[i] > 0.7 && this.rng.chance(0.002)) { this.flags[i] |= FLAG.ABANDONADO; this.occ[i] = 0; continue; }
      if (prox <= MAX_LEVEL[z] && (z === Zone.ZEIS || this.lv[i] >= LV_PARA_NIVEL[prox]) && basico && (prox < 3 || f & FLAG.ESGOTO) && social && seguro && d > -0.05) {
        if (this.rng.chance(0.004 + 0.01 * Math.max(0, d))) this.construir(i, z, prox);
      } else if (d < -0.6 && this.rng.chance(0.0015)) {
        this.flags[i] |= FLAG.ABANDONADO;
      }
    }
  }

  private construir(i: number, z: Zone, level: number) {
    const a = arquetipo(z, level);
    this.arch[i] = a.id;
    this.progress[i] = 0;
    this.floors[i] = this.rng.int(a.andaresMin, a.andaresMax);
    this.look[i] = this.rng.next();
    this.occ[i] = Math.round(this.occ[i] * 0.5); // parte dos moradores segue durante a reforma
  }

  private contabilizarAgregados() {
    let pop = 0, jobs = 0, jobsCom = 0, jobsInd = 0;
    for (let i = 0; i < this.lots.length; i++) {
      if (!this.arch[i] || this.progress[i] < 1) continue;
      const a = arquetipoPorId(this.arch[i]);
      if (a.moradores) pop += this.occ[i];
      else {
        const cap = (this.flags[i] & FLAG.ABANDONADO) ? 0 : a.empregos;
        jobs += cap;
        if (a.zone === Zone.Comercial) jobsCom += cap; else jobsInd += cap;
      }
    }
    this.populacao = pop;
    this.populacaoInformal = Math.round(this.favelas.populacaoTotal());
    this.empregos = jobs;
    this.empregados = Math.min(jobs, Math.round((pop + this.populacaoInformal) * 0.5));
    this.jobsCom = jobsCom;
    this.jobsInd = jobsInd;
  }
  private jobsCom = 0;
  private jobsInd = 0;

  /** Fechamento do mês: receitas, despesas, aprovação e histórico. */
  private fechamentoMensal() {
    if (this.dia === 0) return;
    const ef = this.init.efeitos;
    const L = this.mesCorrente;
    // o Estado fecha o mês dele primeiro: dele vem o repasse do Programa da Capital
    let repasse = 1_600_000 * (1 + (ef.transferenciasFederais ?? 0));
    if (this.estado) {
      const { mes, ano } = this.data();
      const terr = this.territorio.resumo;
      this.estado.climaMes = { ...this.climaMes };
      this.climaMes = { estiagem: 0, enchente: 0 };
      const r = this.estado.mes({
        ano, mes, rng: this.rng, aprovacaoCidade: this.populacao > 500 ? this.aprovacao : null, noticia: this.noticiaEstado,
        cidade: { populacao: this.populacao + this.populacaoInformal, territorioCriminoso: terr.faccao + terr.milicia + 0.5 * terr.disputado, tempoDeslocamento: this.transporte.resumo.tempoMedio },
      });
      repasse = r.repasseCapital;
      for (const o of r.concluidas) {
        const ref = o.custom!.ref;
        if (ref.tipo === 'favela') {
          const fv = this.favelas.ativas().find((x) => x.id === ref.id);
          if (fv) { fv.status = 'urbanizada'; this.favelas.versao++; }
        } else if (ref.tipo === 'linha') {
          const l = this.transporte.linhas.find((x) => x.id === ref.id);
          if (l) { l.status = 'operando'; this.transporte.versaoLinhas++; this.noticia(`Inaugurada a ${l.nome}! Primeiro dia de operação tem fila para a foto e elogio ao ar-condicionado.`, 'bom', `inauL${l.id}`, 0); }
        }
      }
      if (this.estado.obras.some((o) => o.id === 'encostas' && o.fase === 'concluida')) this.contencaoEncostas = true;
      this.atualizarSnapshotEstado();
    }
    const fill = this.empregos > 0 ? this.empregados / this.empregos : 0;
    const vaCom = this.jobsCom * fill * 5_500 * (1 + 0.5 * (ef.servicos ?? 0) + 0.3 * (ef.turismo ?? 0) + 0.3 * (ef.tecnologia ?? 0));
    const vaInd = this.jobsInd * fill * 8_000 * (1 + 0.5 * (ef.industria ?? 0));
    L.receitas.icms = Math.round(0.075 * (vaCom + vaInd) * (1 + (ef.receitaICMS ?? 0)));
    L.receitas.consumo = Math.round(this.populacao * 38 * (1 + 0.5 * (ef.renda ?? 0)));
    L.receitas.tarifas = Math.round(this.redes.agua.atendidos > 0 ? (this.redes.agua.uso * (this.redes.agua.atendidos / Math.max(1, this.redes.agua.total))) * 20 + (this.redes.esgoto.uso * this.redes.esgoto.atendidos / Math.max(1, this.redes.esgoto.total)) * 11 : 0);
    L.receitas.repasse = Math.round(repasse);
    // com o Estado ativo, royalties e dívida são contabilizados no Tesouro estadual
    L.receitas.royalties = this.estado ? 0 : Math.round(4_000_000 * Math.max(0, ef.receitaRoyalties ?? 0));
    let vias = 0;
    for (const e of this.graph.edges.values()) vias += edgeLength(this.graph, e) * ROAD_SPECS[e.type].manutencaoM;
    L.despesas.vias = Math.round(vias);
    L.despesas.equipamentos = this.services.reduce((s, x) => s + equipamento(x.eq).manutencao, 0);
    L.despesas.divida = this.estado ? 0 : Math.round(900_000 * Math.max(0, ef.dividaInicial ?? 0));
    const tr = this.transporte.financasMes();
    L.receitas.passagens = Math.round(tr.receita);
    L.despesas.transporte = Math.round(tr.custo);
    const resultado = somaReceitas(L) - somaDespesas(L);
    L.saldo = resultado - L.investimentos;
    if (!this.sandbox) this.caixa += resultado;
    this.ultimoBalanco = L;
    this.mesCorrente = ledgerVazio();

    // aprovação (prévia da Fase 3): serviços, emprego, poluição
    const cobertura = (r: RedeStats) => (r.total > 0 ? r.atendidos / r.total : 1);
    const W = this.populacao * 0.5;
    const desemprego = W > 0 ? clamp01((W - this.empregos) / W) : 0;
    let polCasa = 0, nCasa = 0;
    for (let i = 0; i < this.lots.length; i++) if (this.arch[i] && arquetipoPorId(this.arch[i]).moradores) { polCasa += this.lotPol[i]; nCasa++; }
    const pol = nCasa ? polCasa / nCasa : 0;
    const ss = this.servicosSociais.resumo;
    const mob = this.transporte.resumo;
    const penDesloc = mob.viagensDia > 0 ? clamp((mob.tempoMedio - 30) / 30, 0, 1) : 0;
    const formal = 12 + 15 * cobertura(this.redes.agua) + 15 * cobertura(this.redes.energia) + 7 * cobertura(this.redes.esgoto)
      + 18 * (1 - desemprego) + 7 * ss.saude + 7 * ss.educacao + 7 * ss.seguranca - 20 * ss.crime - 20 * pol - 6 * this.poluicaoAgua
      - 10 * penDesloc + 4 * mob.modal.coletivo - 3 * Math.max(0, this.transporte.tarifa - 4.9) + (this.caixa < 0 ? -8 : 0);
    let informal = 0, popInf = 0;
    for (const fv of this.favelas.ativas()) {
      const p = this.favelas.populacao(fv);
      informal += p * (25 + (fv.status === 'urbanizada' ? 20 : fv.status === 'urbanizando' ? 8 : 0) + (fv.regularizada ? 8 : 0) + 12 * fv.cobertura.saude - 25 * fv.crime - 10 * fv.risco - (fv.status === 'removendo' ? 25 : 0));
      popInf += p;
    }
    const totalPop = this.populacao + popInf;
    const alvo = totalPop < 50 ? 52 : (formal * this.populacao + informal) / totalPop;
    this.aprovacao += (clamp(alvo, 5, 95) - this.aprovacao) * 0.35;
    this.dengue(mes0Fechamento(this.data().mes));

    const { mes, ano } = this.data();
    const mAnterior = (mes + 10) % 12;
    this.historico.push({ rotulo: `${MESES[mAnterior]}/${String(mes === 1 ? ano - 1 : ano).slice(2)}`, populacao: this.populacao, caixa: this.caixa, aprovacao: Math.round(this.aprovacao) });
    if (this.historico.length > 48) this.historico.shift();

    if (!this.sandbox && L.saldo < 0 && this.caixa < 5_000_000) this.noticia('Caixa no vermelho: Secretaria da Fazenda atrasa pagamento a fornecedores de obras.', 'ruim', 'caixa', 60);
    this.festas(mes);
  }

  /** Surtos de dengue no verão chuvoso: lixo, esgoto a céu aberto e pouca atenção básica. */
  private dengue(mes: number) {
    const cl = this.clima.resumo;
    const chuvoso = this.init.clima ? cl.chuva30d > 90 && cl.temp > 22 : this.init.regiao === 'Nordeste' ? mes >= 3 && mes <= 7 : mes <= 4 || mes === 12;
    const total = this.populacao + this.populacaoInformal;
    if (!chuvoso || total < 2000) return;
    const semEsg = this.redes.esgoto.total > 0 ? 1 - this.redes.esgoto.atendidos / this.redes.esgoto.total : 1;
    const risco = (0.5 * semEsg + this.favelas.populacaoSemSaneamento() / total) * (1 - this.servicosSociais.resumo.saude);
    if (this.rng.chance(clamp(risco, 0, 1) * 0.5)) {
      const fv = this.favelas.ativas().find((x) => x.status !== 'urbanizada');
      const onde = fv ? fv.nome : this.bairroAleatorio();
      this.noticia(`Surto de dengue no ${onde}: postos lotados e fumacê nas ruas. Infectologistas culpam o esgoto a céu aberto e o lixo acumulado.`, 'ruim', 'dengue', 60);
      this.aprovacao -= 3;
      this.estado?.registrarTragedia(0);
    }
  }

  // ── Notícias ────────────────────────────────────────────────────────────────────

  noticia(texto: string, tom: Noticia['tom'], chave: string, cooldownDias: number) {
    const ate = this.cooldown.get(chave) ?? -1;
    if (this.dia < ate) return;
    this.cooldown.set(chave, this.dia + cooldownDias);
    const n: Noticia = { id: this.nextNoticia++, data: this.dataTexto(), texto, tom, fonte: this.fonteNoticia(tom, this.nextNoticia) };
    this.noticias.unshift(n);
    if (this.noticias.length > 60) this.noticias.pop();
    this.noticiasNovas.push(n);
  }

  /** Veículo que dá a notícia: notícias ruins tendem a sair nos veículos mais críticos. */
  private fonteNoticia(tom: Noticia['tom'], id: number): string {
    const im = this.estado?.atores.imprensa;
    if (!im) return 'Plantão N27';
    const h = hash32(id * 2654435761 + 17) / 4294967296;
    const pesos = im.map((v) => v.alcance * (tom === 'ruim' || tom === 'alerta' ? 1.3 - v.humor : tom === 'bom' ? 1 + v.humor : 1));
    let r = h * pesos.reduce((a, b) => a + b, 0);
    for (let i = 0; i < im.length; i++) { r -= pesos[i]; if (r <= 0) return im[i].nome; }
    return im[0].nome;
  }

  private bairroAleatorio(filtro?: (i: number) => boolean): string {
    const n = this.lots.length;
    if (!n) return 'Centro';
    for (let t = 0; t < 40; t++) {
      const i = this.rng.int(0, n - 1);
      if (!filtro || filtro(i)) return bairroEm(this.init.seed, this.lots[i].x, this.lots[i].z);
    }
    return bairroEm(this.init.seed, this.lots[0].x, this.lots[0].z);
  }

  private verificarNoticias() {
    const pop = this.populacao;
    for (const m of [500, 2_000, 5_000, 10_000, 25_000, 50_000, 100_000, 150_000, 250_000]) {
      const k = `pop${m}`;
      if (pop >= m && !this.marcos.has(k)) {
        this.marcos.add(k);
        this.noticia(`${this.init.cidade} passa de ${m.toLocaleString('pt-BR')} moradores nos novos bairros. Cartórios e padarias comemoram.`, 'bom', k, 0);
      }
    }
    const faltaAgua = this.redes.agua.total - this.redes.agua.atendidos;
    if (this.redes.agua.total > 10 && faltaAgua > this.redes.agua.total * 0.05) {
      const b = this.bairroAleatorio((i) => !!this.arch[i] && !(this.flags[i] & FLAG.AGUA));
      this.noticia(`Falta d'água em ${faltaAgua} imóveis. Moradores do ${b} enchem baldes de madrugada e cobram o governo.`, 'ruim', 'agua', 25);
    }
    const faltaLuz = this.redes.energia.total - this.redes.energia.atendidos;
    if (this.redes.energia.total > 10 && faltaLuz > this.redes.energia.total * 0.05) {
      const b = this.bairroAleatorio((i) => !!this.arch[i] && !(this.flags[i] & FLAG.ENERGIA));
      this.noticia(`Apagão no ${b}: ${faltaLuz} imóveis sem luz. Vizinhos improvisam churrasco à luz de vela.`, 'ruim', 'luz', 25);
    }
    const esg = this.redes.esgoto;
    if (esg.total > 40 && esg.atendidos / esg.total < 0.4) {
      const pct = Math.round(100 * (1 - esg.atendidos / esg.total));
      this.noticia(`${pct}% do esgoto dos novos bairros vai in natura para a água. Banhistas reclamam do cheiro na orla.`, 'alerta', 'esgoto', 60);
    }
    if (this.poluicaoAgua > 0.45) this.noticia('Água imprópria para banho em vários pontos; biólogos alertam para mortandade de peixes.', 'alerta', 'baia', 90);
    if (this.poluicaoAgua < 0.15 && this.dia > 200) this.noticia('Água limpa de novo! Boletim de balneabilidade dá praia própria em todos os pontos.', 'bom', 'baiaLimpa', 180);
    const W = pop * 0.5;
    if (pop > 2000 && this.empregos < W * 0.82) {
      const pct = Math.round(100 * (1 - this.empregos / W));
      this.noticia(`Desemprego chega a ${pct}%: fila do SINE dobra o quarteirão. Faltam áreas comerciais e industriais.`, 'ruim', 'desemprego', 45);
    }
    if (this.demanda.c > 0.6 && pop > 800) this.noticia('Comerciantes reclamam: "Tem cliente, falta ponto!". Associação pede novas zonas comerciais.', 'info', 'demC', 50);
    if (this.demanda.i > 0.6 && this.dia > 30) this.noticia('Federação das Indústrias cobra áreas industriais: empresa de embalagens ameaça ir para o estado vizinho.', 'info', 'demI', 50);
    if (this.demanda.r > 0.7 && this.dia > 20) this.noticia('Aluguel dispara e famílias procuram onde morar. Mercado pede novas zonas residenciais.', 'info', 'demR', 50);
    for (let i = 0; i < this.lots.length; i++) {
      if (this.arch[i] === 7 && this.progress[i] >= 1 && !this.marcos.has('torre')) {
        this.marcos.add('torre');
        this.noticia(`Primeira torre de ${this.floors[i]} andares muda o horizonte do ${bairroEm(this.init.seed, this.lots[i].x, this.lots[i].z)}.`, 'info', 'torre', 0);
        break;
      }
    }
    if (this.rng.chance(0.02) && pop > 300) {
      const b = this.bairroAleatorio();
      const flavor = [
        `Feira livre do ${b} vira point no domingo: pastel, caldo de cana e muita conversa.`,
        `Pagode na laje no ${b} vai até tarde; vizinhança se divide entre o samba e o sono.`,
        `Moradores do ${b} fazem mutirão para pintar a pracinha.`,
        `Time de várzea do ${b} vence o clássico do bairro de virada.`,
        `Nova padaria no ${b} tem fila às 6h: "o pão sai quentinho", garante dona Cida.`,
        `Ambulantes de mate e biscoito de polvilho garantem o lanche na orla.`,
        `Mototaxistas do ${b} pedem regularização ao governo.`,
      ];
      this.noticia(this.rng.pick(flavor), 'info', `flavor${this.rng.int(0, 999)}`, 0);
    }
  }

  private festas(mes: number) {
    const f = this.init.festas.join(' ').toLowerCase();
    if (mes === 2 && f.includes('carnaval')) this.noticia(`É Carnaval! Blocos tomam as ruas de ${this.init.cidade}; hotelaria comemora ocupação recorde.`, 'bom', 'carnaval', 300);
    if (mes === 6 && (f.includes('são joão') || ['Nordeste'].includes(this.init.regiao))) this.noticia('Arraiá oficial começa com quadrilha, fogueira e milho assado. Forró até o sol raiar!', 'bom', 'saojoao', 300);
    if (mes === 12) this.noticia('Réveillon: prefeitura e governo preparam fogos e reforço no transporte para a virada.', 'info', 'reveillon', 300);
  }

  // ── Serialização para a thread principal e para saves ───────────────────────────

  worldMessage() {
    return { roads: graphToJSON(this.graph), lots: packLots(this.lots), services: this.services.map((s) => ({ ...s })), version: this.worldVersion };
  }

  lotState(): Float32Array {
    const n = this.lots.length;
    const out = new Float32Array(n * LOT_STATE_STRIDE);
    for (let i = 0; i < n; i++) {
      const o = i * LOT_STATE_STRIDE;
      out[o] = this.zone[i];
      out[o + 1] = this.arch[i];
      out[o + 2] = this.progress[i];
      out[o + 3] = this.floors[i];
      out[o + 4] = this.look[i];
      out[o + 5] = this.flags[i];
      out[o + 6] = this.lv[i];
      out[o + 7] = this.occ[i];
      out[o + 8] = this.lotPol[i];
      out[o + 9] = this.servicosSociais.saude[i];
      out[o + 10] = this.servicosSociais.educacao[i];
      out[o + 11] = this.servicosSociais.seguranca[i];
      out[o + 12] = this.servicosSociais.crime[i];
    }
    return out;
  }

  stats(speed = 1): Stats {
    void speed;
    const { dia, mes, ano } = this.data();
    let edif = 0, obra = 0, zon = 0, lvSum = 0, lvN = 0;
    for (let i = 0; i < this.lots.length; i++) {
      if (this.zone[i]) zon++;
      if (this.arch[i]) { if (this.progress[i] >= 1) edif++; else obra++; lvSum += this.lv[i]; lvN++; }
    }
    const W = this.populacao * 0.5;
    const tratado = this.redes.esgoto.total > 0 ? this.redes.esgoto.atendidos / this.redes.esgoto.total : 0;
    return {
      dia, mes, ano, tick: this.tick,
      populacao: this.populacao, empregos: this.empregos, empregados: this.empregados,
      desemprego: W > 0 ? clamp01((W - this.empregos) / W) : 0,
      demanda: { ...this.demanda },
      caixa: this.caixa, sandbox: this.sandbox,
      ultimoBalanco: this.ultimoBalanco, mesCorrente: this.mesCorrente,
      aprovacao: this.aprovacao,
      agua: { ...this.redes.agua }, energia: { ...this.redes.energia },
      esgoto: { ...this.redes.esgoto, tratadoPct: tratado },
      poluicaoAgua: this.poluicaoAgua,
      edificios: edif, emObra: obra, lotes: this.lots.length, lotesZoneados: zon,
      valorSoloMedio: lvN ? lvSum / lvN : 0,
      historico: this.historico,
      aprovacaoCidade: this.aprovacao,
      estado: this.estadoSnap,
      populacaoInformal: this.populacaoInformal,
      cidade: this.cidadeStats(),
      clima: { ...this.clima.resumo },
      festa: (() => { const f = this.festaHoje(); return f ? { nome: f.nome, tipo: f.tipo, dia: diaDoAnoReal(ano, mes, dia) - f.inicio + 1 } : null; })(),
      eventos: { pendentes: this.eventos.pendentes.map((p) => ({ ...p })), historico: this.eventos.historico.slice(0, 20) },
      visuais: this.visuais.map((v) => ({ tipo: v.tipo, intensidade: v.intensidade })),
    };
  }

  cidadeStats(): Stats['cidade'] {
    const { vias: _v, ...mob } = this.transporte.resumo;
    void _v;
    const fin = this.transporte.financasMes();
    return {
      servicos: this.servicosSociais.resumo,
      territorio: this.territorio.resumo,
      mobilidade: mob,
      transporte: {
        tarifa: this.transporte.tarifa, vans: this.transporte.vans, receitaMes: fin.receita, custoMes: fin.custo,
        linhas: this.transporte.linhas.map((l) => ({ id: l.id, nome: l.nome, tipo: l.tipo, cor: l.cor, status: l.status, passageirosDia: l.passageirosDia, lotacao: l.lotacao, headwayMin: l.headwayMin, frota: l.frota, comprimento: l.comprimento, paradas: l.paradas.length })),
      },
      favelas: {
        deficit: this.favelas.deficit, demandaPopular: this.favelas.demandaPopular,
        lista: this.favelas.ativas().map((fv) => ({ id: fv.id, nome: fv.nome, status: fv.status, grupo: fv.grupo, cx: fv.cx, cz: fv.cz, populacao: Math.round(this.favelas.populacao(fv)), casas: fv.casas.length, regularizada: fv.regularizada, risco: fv.risco, crime: fv.crime, cobertura: fv.cobertura, mortosDeslizamento: fv.mortosDeslizamento })),
      },
    };
  }

  /** Dados de renderização com controle de versão (o Worker só manda o que mudou). */
  renderDados(vistos: { terr: number; fav: number; lin: number; tran: number }) {
    const out: import('./protocol').CidadeRender = {};
    if (this.territorio.versao !== vistos.terr) { out.territorio = { versao: this.territorio.versao, F: this.territorio.F.slice(), M: this.territorio.M.slice() }; vistos.terr = this.territorio.versao; }
    if (this.favelas.versao !== vistos.fav) {
      const casas: number[] = [];
      const meta = this.favelas.ativas().map((fv, idx) => {
        for (const c of fv.casas) casas.push(c.x, c.z, c.ang, c.w, c.d, c.andares, c.look, idx);
        return { id: fv.id, status: fv.status, grupo: fv.grupo, regularizada: fv.regularizada };
      });
      out.favelas = { versao: this.favelas.versao, casas: Float32Array.from(casas), meta };
      vistos.fav = this.favelas.versao;
    }
    if (this.transporte.versaoLinhas !== vistos.lin) {
      out.linhas = { versao: this.transporte.versaoLinhas, linhas: this.transporte.linhas.map((l) => ({ id: l.id, tipo: l.tipo, cor: l.cor, status: l.status, caminho: l.caminho, paradas: l.paradas, frota: l.frota, headwayMin: l.headwayMin })) };
      vistos.lin = this.transporte.versaoLinhas;
    }
    const tv = this.transporte.resumo.viagensDia + this.transporte.resumo.vias.length * 1e-6;
    if (tv !== vistos.tran) {
      const vias = new Float32Array(this.transporte.resumo.vias.length * 2);
      this.transporte.resumo.vias.forEach((v, k) => { vias[2 * k] = v.edge; vias[2 * k + 1] = v.vc; });
      out.transito = { versao: tv, vias };
      vistos.tran = tv;
    }
    return out;
  }

  takeNews(): Noticia[] {
    const n = this.noticiasNovas;
    this.noticiasNovas = [];
    return n;
  }

  serialize(): SaveData {
    return {
      formato: 'nacao27', versao: 1, salvoEm: new Date().toISOString(),
      init: this.init,
      roads: graphToJSON(this.graph),
      services: this.services.map((s) => ({ ...s })),
      nextService: this.nextService,
      lots: {
        zone: [...this.zone], arch: [...this.arch], progress: [...this.progress], floors: [...this.floors],
        look: [...this.look], semUtil: [...this.semUtil], occ: [...this.occ], lv: [...this.lv], abandonado: [...this.flags].map((f) => (f & FLAG.ABANDONADO ? 1 : 0)),
      },
      tick: this.tick, rng: this.rng.state(), caixa: this.caixa,
      mesCorrente: this.mesCorrente, ultimoBalanco: this.ultimoBalanco, historico: this.historico,
      aprovacao: this.aprovacao, poluicaoAgua: this.poluicaoAgua, noticias: this.noticias, marcos: [...this.marcos],
      estado: this.estado?.serialize(),
      demanda: { ...this.demanda }, cooldown: [...this.cooldown],
      cidade: {
        territorio: this.territorio.serializar(), favelas: this.favelas.serializar(), transporte: this.transporte.serializar(), contencao: this.contencaoEncostas, crime: [...this.servicosSociais.crime],
        clima: { ...this.clima.serializar(), climaMes: this.climaMes, crimeExtra: this.crimeExtra }, eventos: JSON.parse(JSON.stringify(this.eventos)), visuais: this.visuais.map((v) => ({ ...v })),
        real: this.real ? { demolidos: [...this.reaisDemolidos], herdada: this.herdada, realLote: [...this.realLote] } : undefined,
      },
      pollution: [...this.pollution], lotPol: [...this.lotPol],
    };
  }

  static deserialize(s: SaveData, hm?: Heightmap, real?: CidadeReal | null): Simulation {
    const sim = new Simulation(s.init, hm, real);
    sim.graph = graphFromJSON(s.roads);
    const sr = s.cidade?.real as { demolidos: number[]; herdada: Simulation['herdada']; realLote: number[] } | undefined;
    if (sr) { sim.reaisDemolidos = new Set(sr.demolidos); sim.herdada = sr.herdada; }
    sim.services = s.services.map((x) => ({ ...x }));
    sim.nextService = s.nextService;
    if (s.cidade) {
      sim.favelas.restaurar(s.cidade.favelas as ReturnType<Favelas['serializar']>);
      sim.territorio.restaurar(s.cidade.territorio as ReturnType<Territorio['serializar']>);
      sim.transporte.restaurar(s.cidade.transporte as ReturnType<Transporte['serializar']>);
      sim.contencaoEncostas = s.cidade.contencao;
      if (s.cidade.clima) {
        const c = s.cidade.clima as ReturnType<Clima['serializar']> & { climaMes: { estiagem: number; enchente: number }; crimeExtra: number };
        sim.clima.restaurar(c);
        sim.climaMes = { ...c.climaMes };
        sim.crimeExtra = c.crimeExtra;
      }
      if (s.cidade.eventos) sim.eventos = JSON.parse(JSON.stringify(s.cidade.eventos)) as EstadoEventos;
      if (s.cidade.visuais) sim.visuais = (s.cidade.visuais as Simulation['visuais']).map((v) => ({ ...v }));
    }
    sim.rebuildLots(); // determinístico: mesma ordem de lotes do save
    const n = Math.min(sim.lots.length, s.lots.zone.length);
    for (let i = 0; i < n; i++) {
      sim.zone[i] = s.lots.zone[i]; sim.arch[i] = s.lots.arch[i]; sim.progress[i] = s.lots.progress[i];
      sim.floors[i] = s.lots.floors[i]; sim.look[i] = s.lots.look[i]; sim.semUtil[i] = s.lots.semUtil[i];
      sim.occ[i] = s.lots.occ[i];
      if (sr) sim.realLote[i] = sr.realLote[i] ?? 0;
      if (s.lots.abandonado[i]) sim.flags[i] |= FLAG.ABANDONADO;
    }
    sim.tick = s.tick; sim.rng = new Rng(s.rng); sim.caixa = s.caixa;
    sim.mesCorrente = s.mesCorrente; sim.ultimoBalanco = s.ultimoBalanco; sim.historico = s.historico;
    sim.aprovacao = s.aprovacao; sim.poluicaoAgua = s.poluicaoAgua; sim.noticias = s.noticias;
    sim.nextNoticia = (s.noticias[0]?.id ?? 0) + 1;
    sim.marcos = new Set(s.marcos);
    if (s.estado && s.init.estado) {
      sim.estado = Estado.deserialize(s.init.estado, s.estado);
      sim.atualizarSnapshotEstado();
    }
    // recalcula redes, serviços e agregados (derivados do estado salvo)
    sim.redesDeServico();
    sim.poluicaoAgua = s.poluicaoAgua; // redesDeServico avança a poluição um passo: desfaz
    sim.contabilizarAgregados();
    // a criminalidade é suavizada no tempo: restaura antes de recalcular
    const crime = (s.cidade as { crime?: number[] } | undefined)?.crime;
    if (crime) for (let i = 0; i < n; i++) sim.servicosSociais.crime[i] = crime[i];
    sim.servicosSociais.atualizar(sim, false);
    sim.demanda = { ...s.demanda };
    for (let i = 0; i < n; i++) sim.lv[i] = s.lots.lv[i];
    sim.cooldown = new Map(s.cooldown);
    sim.pollution = Float32Array.from(s.pollution);
    for (let i = 0; i < n; i++) sim.lotPol[i] = s.lotPol[i];
    return sim;
  }

  /** Utilitário para notícias/inspeção. */
  bairro(x: number, z: number) { return bairroEm(this.init.seed, x, z); }
  seedLote(i: number) { return hash32(i * 2654435761 + this.init.seed); }
}

export { LOT_STRIDE };
