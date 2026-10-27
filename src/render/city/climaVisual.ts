/**
 * Tempo e eventos no visual (Fase 6): converte o resumo do clima diário (Worker) em estado de
 * renderização — nuvens e chuva na hora certa (temporal de fim de tarde no verão), raios, fumaça de
 * queimadas, calor, enchente, ressaca, secura/geada da vegetação, apagão e festas.
 * Mutável e atualizado 1×/frame (sem re-render do React).
 */
import * as THREE from 'three';
import type { Stats } from '../../sim/protocol';
import { ambiente } from './ambiente';
import { acessibilidade } from '../acessibilidade';

export const clima = {
  /** 0–1 chuva caindo agora */
  chuva: 0,
  nublado: 0,
  /** flash de raio (decai) */
  flash: 0,
  raio: null as null | { x: number; z: number; ate: number },
  fumaca: 0,
  calor: 0,
  /** nível da enchente (m acima do terreno baixo) */
  enchente: 0,
  ressaca: 0,
  secura: 0,
  geada: 0,
  molhado: 0,
  apagao: 0,
  incendio: 0,
  festa: null as null | 'carnaval' | 'junina' | 'fogos',
  vento: new THREE.Vector2(0.15, 0.05),
};

/** Uniforms compartilhados com os shaders de terreno e água. */
export const uniformsTerreno = { uSecura: { value: 0 }, uMolhado: { value: 0 }, uGeada: { value: 0 } };
export const uniformsAgua = { uRessaca: { value: 0 }, uLama: { value: 0 } };

const CINZA_CEU = new THREE.Color('#7f8a94');
const CINZA_NEVOA = new THREE.Color('#8e979e');
const FUMACA_NEVOA = new THREE.Color('#c99a62');
const FUMACA_SOL = new THREE.Color('#ff8a4a');
const CALOR_CEU = new THREE.Color('#d8dfe2');
const aprox = (a: number, b: number, k: number) => a + (b - a) * k;

/** Chamado pelo CeuLuz depois de `atualizarAmbiente`. */
export function aplicarClima(st: Stats | null, dt: number) {
  const k = Math.min(1, dt * 1.5);
  const cl = st?.clima;
  const hora = ambiente.hora;
  let chuvaAlvo = 0, nubAlvo = 0;
  if (cl && cl.chuvaHoje >= 1) {
    const forca = Math.min(1, 0.2 + cl.chuvaHoje / 30);
    // temporal de verão: céu limpo de manhã, pancada no fim da tarde
    const naHora = cl.convectiva ? (hora >= 14 && hora <= 20 ? 1 : hora >= 12 && hora < 14 ? 0.4 : 0) : 1;
    chuvaAlvo = forca * naHora;
    nubAlvo = Math.max(chuvaAlvo, cl.convectiva ? 0.25 : 0.55) * Math.min(1, 0.4 + cl.chuvaHoje / 20);
  }
  const vis = st?.visuais ?? [];
  const tem = (t: string) => vis.some((v) => v.tipo === t);
  clima.chuva = aprox(clima.chuva, chuvaAlvo, k);
  clima.nublado = aprox(clima.nublado, nubAlvo, k * 0.6);
  clima.fumaca = aprox(clima.fumaca, Math.max(cl?.fumaca ?? 0, tem('fumaca') ? 0.75 : 0, tem('incendio') ? 0.35 : 0), k * 0.3);
  clima.calor = aprox(clima.calor, cl?.calor ?? 0, k * 0.3);
  clima.enchente = aprox(clima.enchente, Math.max((cl?.enchente ?? 0) > 0.3 ? 0.4 + 3 * (cl!.enchente) : 0, tem('alagamento') ? 1.6 : 0), k * 0.15);
  clima.ressaca = aprox(clima.ressaca, cl?.ressaca ?? 0, k * 0.3);
  clima.secura = aprox(clima.secura, cl?.secura ?? 0, k * 0.05);
  clima.geada = aprox(clima.geada, (cl?.geada ?? 0) * (hora > 4 && hora < 9 ? 1 : 0.2), k * 0.3);
  clima.molhado = aprox(clima.molhado, chuvaAlvo > 0.05 ? 1 : 0, k * (chuvaAlvo > 0.05 ? 0.8 : 0.05));
  clima.apagao = tem('apagao') ? 1 : aprox(clima.apagao, 0, k);
  clima.incendio = aprox(clima.incendio, tem('incendio') ? 1 : 0, k * 0.5);
  const f = st?.festa;
  clima.festa = tem('carnaval') || f?.tipo === 'carnaval' ? 'carnaval' : tem('junina') || f?.tipo === 'junina' || f?.tipo === 'boi' ? 'junina' : tem('fogos') || f?.tipo === 'reveillon' || f?.tipo === 'show' ? 'fogos' : null;

  // raios nos temporais
  clima.flash = Math.max(0, clima.flash - dt * 6);
  if (clima.chuva > 0.6 && (cl?.chuvaHoje ?? 0) > 25 && Math.random() < dt * 0.25) {
    clima.flash = acessibilidade.reduzirMovimento ? 0.12 : 1;
    clima.raio = { x: (Math.random() - 0.5) * 2400, z: (Math.random() - 0.5) * 2400, ate: ambiente.tempo + 0.18 };
  }
  if (clima.raio && ambiente.tempo > clima.raio.ate) clima.raio = null;

  // céu, névoa e luz
  const n = clima.nublado;
  ambiente.corCeu.lerp(CINZA_CEU.clone().multiplyScalar(0.25 + 0.75 * (1 - ambiente.noite)), n * 0.75);
  ambiente.corNevoa.lerp(CINZA_NEVOA.clone().multiplyScalar(0.25 + 0.75 * (1 - ambiente.noite)), n * 0.7);
  ambiente.intensidadeSol *= 1 - 0.8 * n;
  ambiente.intensidadeHemi *= 1 - 0.25 * n;
  if (clima.fumaca > 0.01) {
    ambiente.corNevoa.lerp(FUMACA_NEVOA, clima.fumaca * 0.7);
    ambiente.corSol.lerp(FUMACA_SOL, clima.fumaca * 0.6);
    ambiente.intensidadeSol *= 1 - 0.45 * clima.fumaca;
  }
  if (clima.calor > 0.01) ambiente.corCeu.lerp(CALOR_CEU, clima.calor * 0.25 * (1 - ambiente.noite));
  ambiente.intensidadeHemi += clima.flash * 2.5;
  ambiente.densidadeExtra = 0.00025 * n + 0.00032 * clima.fumaca + 0.00006 * clima.calor;

  uniformsTerreno.uSecura.value = clima.secura;
  uniformsTerreno.uMolhado.value = clima.molhado;
  uniformsTerreno.uGeada.value = clima.geada;
  uniformsAgua.uRessaca.value = clima.ressaca;
  uniformsAgua.uLama.value = Math.min(1, clima.enchente / 2);
}
