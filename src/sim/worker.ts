/// <reference lib="webworker" />
/**
 * Worker de simulação: tick fixo independente do FPS. A renderização só recebe snapshots
 * (Float32Array transferidos sem cópia) e manda comandos.
 */
import type { FromWorker, ToWorker } from './protocol';
import { Simulation } from './simulation';
import { deUF } from '../data/nomes';

declare const self: DedicatedWorkerGlobalScope;

/** 1× = 1 dia de jogo a cada 2 s (4 ticks de 6 h). */
const MS_POR_TICK_1X = 500;

let sim: Simulation | null = null;
let speed = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
let lastWorldVersion = -1;
/** versões dos dados de renderização já enviados */
let vistos = { terr: -1, fav: -1, lin: -1, tran: -1 };

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
  post({ type: 'state', version: sim.worldVersion, lotState, pollution, stats: sim.stats(speed), news: sim.takeNews(), render }, transf);
}

/** Fase 13: com o Rio inteiro o estado tem ~7 MB; no relógio, manda no máximo ~4 vezes por segundo. */
const MS_ENTRE_ENVIOS = 250;
let ultimoEnvio = 0;

function loop() {
  timer = null;
  if (!sim || speed <= 0) return;
  const t0 = performance.now();
  sim.step();
  if (t0 - ultimoEnvio >= MS_ENTRE_ENVIOS) { ultimoEnvio = t0; sendState(); }
  const gasto = performance.now() - t0;
  timer = setTimeout(loop, Math.max(0, MS_POR_TICK_1X / speed - gasto));
}

function setSpeed(s: number) {
  speed = s;
  if (timer) { clearTimeout(timer); timer = null; }
  if (speed > 0) timer = setTimeout(loop, MS_POR_TICK_1X / speed);
}

self.onmessage = (ev: MessageEvent<ToWorker>) => {
  const msg = ev.data;
  try {
    switch (msg.type) {
      case 'init':
        vistos = { terr: -1, fav: -1, lin: -1, tran: -1 };
        sim = new Simulation(msg.init, undefined, msg.real ?? null);
        sim.noticia(`Posse do novo governo ${deUF(msg.init.sigla, msg.init.nomeEstado)}. Na capital, ${msg.init.cidade}, a expectativa é de obras já no primeiro mês.`, 'info', 'posse', 0);
        post({ type: 'ready', init: msg.init });
        sendState();
        break;
      case 'load':
        vistos = { terr: -1, fav: -1, lin: -1, tran: -1 };
        sim = Simulation.deserialize(msg.save, undefined, msg.real ?? null);
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
        if (sim) { for (let i = 0; i < msg.dias * 4; i++) sim.step(); sendState(); }
        break;
      case 'save':
        if (sim) post({ type: 'saved', id: msg.id, save: sim.serialize() });
        break;
    }
  } catch (e) {
    post({ type: 'error', msg: e instanceof Error ? `${e.message}\n${e.stack}` : String(e) });
  }
};
