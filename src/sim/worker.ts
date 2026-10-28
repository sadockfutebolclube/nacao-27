/// <reference lib="webworker" />
/**
 * Worker de simulação: tick fixo independente do FPS. A renderização só recebe snapshots
 * (Float32Array transferidos sem cópia) e manda comandos.
 */
import type { FromWorker, ToWorker } from './protocol';
import { Simulation } from './simulation';
import { deUF } from '../data/nomes';
import { Rede } from './trafego/rede';
import { Trafego } from './trafego/trafego';
import type { BairroCenso } from '../data/bairros';

declare const self: DedicatedWorkerGlobalScope;

/** ms de CPU que o trabalho pesado do dia pode gastar por passo/fatia (Fase 23); o resto espera na fila do próximo */
const ORCAMENTO_MS = 4;

/** 1× = 1 dia de jogo a cada 2 s (4 ticks de 6 h). */
const MS_POR_TICK_1X = 500;

let sim: Simulation | null = null;
let speed = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
let fatias: ReturnType<typeof setTimeout> | null = null;
let lastWorldVersion = -1;
/** versões dos dados de renderização já enviados */
let vistos = { terr: -1, fav: -1, lin: -1, tran: -1 };

/** Fase 29: tráfego microscópico (IDM + MOBIL) a 20 Hz, independente do tick do dia; o mundo só recebe o snapshot dos veículos */
const MS_TRAFEGO = 50;
let trafego: Trafego | null = null;
let trafegoVersao = -1;
let timerTrafego: ReturnType<typeof setInterval> | null = null;
let focoTrafego = { x: 0, z: 0, raio: 1600, alvo: 0, onibus: false };
let pedidosPendentes: import('./trafego/trafego').PedidoEmergencia[] = [];

function garantirTrafego(): Trafego | null {
  if (!sim) return null;
  if (!trafego || trafegoVersao !== sim.worldVersion) {
    if (sim.graph.edges.size === 0) return null;
    trafego = new Trafego(Rede.de(sim.graph), { cap: 3200, seed: 777 });
    trafegoVersao = sim.worldVersion;
    for (const p of pedidosPendentes) trafego.emergencia(p);
  }
  return trafego;
}

function passoTrafego() {
  if (speed <= 0 || !sim) return;
  const t = garantirTrafego();
  if (!t) return;
  t.foco = { x: focoTrafego.x, z: focoTrafego.z, raio: focoTrafego.raio };
  t.alvo = focoTrafego.alvo; t.comOnibus = focoTrafego.onibus;
  t.step((MS_TRAFEGO / 1000) * Math.min(2, 0.6 + speed * 0.4));
  const snap = t.snapshot();
  const { ativos, ms, parados, trocas, ultrapassagens, emergencias } = t.stats;
  post({ type: 'trafego', tempo: t.tempo, dados: snap.dados, n: snap.n, rotulos: t.rotulos.slice(), stats: { ativos, ms, parados, trocas, ultrapassagens, emergencias } }, [snap.dados.buffer]);
}

function ligarTrafego() {
  if (timerTrafego) return;
  timerTrafego = setInterval(() => { try { passoTrafego(); } catch (e) { post({ type: 'error', msg: e instanceof Error ? `tráfego: ${e.message}
${e.stack}` : String(e) }); } }, MS_TRAFEGO);
}

function post(msg: FromWorker, transfer: Transferable[] = []) {
  self.postMessage(msg, transfer);
}

function sendWorld() {
  if (!sim) return;
  const w = sim.worldMessage();
  lastWorldVersion = w.version;
  post({ type: 'world', version: w.version, roads: w.roads, lots: w.lots, services: w.services }, [w.lots.buffer]);
}

function sendState() {
  if (!sim) return;
  if (sim.worldVersion !== lastWorldVersion) sendWorld();
  const lotState = sim.lotState();
  const pollution = sim.pollution.slice();
  const render = sim.renderDados(vistos);
  const transf: Transferable[] = [lotState.buffer, pollution.buffer];
  if (render.territorio) transf.push(render.territorio.F.buffer, render.territorio.M.buffer);
  if (render.favelas) transf.push(render.favelas.casas.buffer);
  if (render.transito) transf.push(render.transito.vias.buffer);
  post({ type: 'state', version: sim.worldVersion, lotState, pollution, stats: sim.stats(speed), news: sim.takeNews(), render, perf: sim.perf() }, transf);
}

/** Fase 13: com o Rio inteiro o estado tem ~7 MB; no relógio, manda no máximo ~4 vezes por segundo. */
const MS_ENTRE_ENVIOS = 250;
let ultimoEnvio = 0;

/** Entre um tick e o próximo o worker termina a fila do dia em fatias de ORCAMENTO_MS, devolvendo o controle (mensagens, comandos) a cada uma. */
function agendarFatias() {
  if (fatias || !sim || !sim.orcamento.pendentes) return;
  fatias = setTimeout(() => {
    fatias = null;
    if (!sim) return;
    sim.trabalhar(ORCAMENTO_MS);
    agendarFatias();
  }, 0);
}

function loop() {
  timer = null;
  if (!sim || speed <= 0) return;
  const t0 = performance.now();
  sim.step();
  if (t0 - ultimoEnvio >= MS_ENTRE_ENVIOS) { ultimoEnvio = t0; sendState(); }
  const gasto = performance.now() - t0;
  timer = setTimeout(loop, Math.max(0, MS_POR_TICK_1X / speed - gasto));
  agendarFatias();
}

function setSpeed(s: number) {
  speed = s;
  ligarTrafego();
  if (timer) { clearTimeout(timer); timer = null; }
  if (speed > 0) timer = setTimeout(loop, MS_POR_TICK_1X / speed);
  agendarFatias();
}

function novaSimulacao(s: Simulation) {
  sim = s;
  trafego = null; trafegoVersao = -1; pedidosPendentes = [];
  sim.orcamentoMs = ORCAMENTO_MS;
  // Fase 26: o Censo dá os polígonos de bairro para as facções (cidade real do Rio)
  if (s.real?.ibge === '3304557') {
    fetch(`${import.meta.env.BASE_URL}data/rio/bairros.json`).then((r) => (r.ok ? r.json() : null)).then((j: { bairros: BairroCenso[] } | null) => { if (j && sim === s) s.definirBairros(j.bairros); }).catch(() => { /* sem o arquivo: setores de 1 km */ });
  }
}

self.onmessage = (ev: MessageEvent<ToWorker>) => {
  const msg = ev.data;
  try {
    switch (msg.type) {
      case 'init':
        vistos = { terr: -1, fav: -1, lin: -1, tran: -1 };
        novaSimulacao(new Simulation(msg.init, undefined, msg.real ?? null));
        if (!sim) break;
        sim.noticia(`Posse do novo governo ${deUF(msg.init.sigla, msg.init.nomeEstado)}. Na capital, ${msg.init.cidade}, a expectativa é de obras já no primeiro mês.`, 'info', 'posse', 0);
        post({ type: 'ready', init: msg.init });
        sendState();
        break;
      case 'load':
        vistos = { terr: -1, fav: -1, lin: -1, tran: -1 };
        novaSimulacao(Simulation.deserialize(msg.save, undefined, msg.real ?? null));
        post({ type: 'ready', init: msg.save.init });
        sendState();
        break;
      case 'speed':
        setSpeed(msg.speed);
        break;
      case 'cmd': {
        if (!sim) return;
        const r = sim.command(msg.cmd);
        post({ type: 'cmdResult', id: msg.id, ...r });
        sendState();
        break;
      }
      case 'avancar':
        if (sim) {
          // avançar N dias é completo e síncrono (LOD desligado), como nos testes
          const o = sim.orcamentoMs;
          sim.orcamentoMs = Infinity;
          sim.drenar();
          for (let i = 0; i < msg.dias * 4; i++) sim.step();
          sim.orcamentoMs = o;
          sendState();
        }
        break;
      case 'foco':
        sim?.definirFoco(msg.x, msg.z, msg.raio);
        break;
      case 'trafego':
        focoTrafego = { x: msg.x, z: msg.z, raio: msg.raio, alvo: msg.alvo, onibus: msg.onibus };
        break;
      case 'emergencia':
        pedidosPendentes.push(msg.pedido);
        if (pedidosPendentes.length > 40) pedidosPendentes.shift();
        trafego?.emergencia(msg.pedido);
        break;
      case 'cena-fim':
        trafego?.liberarCena(msg.cena);
        pedidosPendentes = pedidosPendentes.filter((p) => p.cena !== msg.cena);
        break;
      case 'orcamento':
        if (sim) sim.orcamentoMs = msg.ms > 0 ? msg.ms : Infinity;
        break;
      case 'save':
        if (sim) post({ type: 'saved', id: msg.id, save: sim.serialize() });
        break;
    }
  } catch (e) {
    post({ type: 'error', msg: e instanceof Error ? `${e.message}\n${e.stack}` : String(e) });
  }
};
