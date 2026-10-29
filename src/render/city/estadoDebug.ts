/**
 * Estado do modo de depuração do mapa (F3): wireframe, normais do terreno e lista de problemas das vias por trecho
 * (morro sobre o asfalto, vão sob a rua, rampa) com a inclinação máxima de cada um, mais o que foi tratado (muros,
 * pontes, túneis) e as rotatórias descartadas na geração. Estado de módulo + `useSyncExternalStore`, para o painel
 * (HTML) e o desenho (dentro do Canvas) conversarem sem passar pelo store do jogo.
 */
import { useSyncExternalStore } from 'react';
import { larguraVia } from '../../world/roads';
import { GRADE_ALVO, regradeDe } from '../../world/regrade';
import { sampleHeight, type Heightmap } from '../../world/terrain';
import type { Perfil } from './perfilVias';

export interface Problema {
  /** morro sobre o asfalto · vão sob a rua · rampa acima do alvo · rotatória descartada */
  tipo: 'morro' | 'vao' | 'rampa' | 'rotatoria' | 'solta' | 'predio' | 'solucao';
  nome: string;
  x: number; z: number;
  /** quanto passa do limite (m para morro/vão, % para rampa); 0 nas rotatórias */
  valor: number;
  /** inclinação máxima do trecho (%) */
  inclinacao: number;
  detalhe: string;
  /** Fase 32: como o trecho resolve o desnível (talude · terraço · muro · viaduto · túnel) e a maior altura (m) dessa solução */
  solucao?: string; alturaMax?: number;
}
/** Fase 28: o que a lateral das vias virou na última construção (talude de grama × face vertical de ponte) e a maior queda do bordo ao chão (m) */
export const estatLateral: { taludes: number; vertical: number; maxQueda: number; patamares: number; maxLance: number; maxParede: number; muroTalude: number } = { taludes: 0, vertical: 0, maxQueda: 0, patamares: 0, maxLance: 0, maxParede: 0, muroTalude: 0 };
export interface Contagem {
  morro: number; vao: number; rampa: number; rotatoria: number; trechos: number; muro: number; ponte: number; tunel: number;
  /** Fase 21: vias soltas que o gerador tirou, prédios deslocados e removidos por invadir a pista, minirrotatórias */
  solta: number; predioDeslocado: number; predioRemovido: number; minirrotatoria: number;
  /** Fase 28: trechos de rua de morro (rampa até 40%), trechos ajustados à falésia, amostras de talude de grama e de lateral vertical, e as maiores alturas (m) */
  ruaDeMorro: number; falesia: number; taludes: number; lateralVertical: number;
  maiorAterro: number; maiorCorte: number; maiorMuro: number; maiorQueda: number;
  /** Fase 32: trechos por solução (talude · terraço · muro · viaduto · túnel), seções de talude em patamares e o maior lance de talude (m) */
  porSolucao: { talude: number; terraco: number; muro: number; viaduto: number; tunel: number }; secoesPatamar: number; maiorLance: number;
  /** maior parede vertical de muro de arrimo desenhada (m) e seções de muro que terminam em talude de grama */
  maiorParede: number; muroTalude: number;
}
export interface EstadoDebug {
  /** 0 desligado · 1 wireframe + painel · 2 também as normais do terreno */
  modo: 0 | 1 | 2;
  problemas: Problema[];
  contagem: Contagem;
}

const vazia = (): Contagem => ({ morro: 0, vao: 0, rampa: 0, rotatoria: 0, trechos: 0, muro: 0, ponte: 0, tunel: 0, solta: 0, predioDeslocado: 0, predioRemovido: 0, minirrotatoria: 0, ruaDeMorro: 0, falesia: 0, taludes: 0, lateralVertical: 0, maiorAterro: 0, maiorCorte: 0, maiorMuro: 0, maiorQueda: 0, porSolucao: { talude: 0, terraco: 0, muro: 0, viaduto: 0, tunel: 0 }, secoesPatamar: 0, maiorLance: 0, maiorParede: 0, muroTalude: 0 });
let estado: EstadoDebug = { modo: 0, problemas: [], contagem: vazia() };
const ouvintes = new Set<() => void>();
const avisar = () => ouvintes.forEach((f) => f());

export const debugMapa = {
  ler: () => estado,
  modo: (m: 0 | 1 | 2) => { estado = { ...estado, modo: m }; avisar(); },
  ciclo: () => debugMapa.modo(((estado.modo + 1) % 3) as 0 | 1 | 2),
  problemas(problemas: Problema[], contagem: Contagem) { estado = { ...estado, problemas, contagem }; avisar(); },
  assinar(f: () => void) { ouvintes.add(f); return () => { ouvintes.delete(f); }; },
};
export const useDebugMapa = () => useSyncExternalStore(debugMapa.assinar, debugMapa.ler);

/** Limites do diagnóstico (os mesmos de scripts/auditar-mapa.ts): terreno acima do asfalto na pista, vão sob a pista, rampa */
export const LIMITE = { morro: 0.5, vao: 3, rampa: GRADE_ALVO + 0.005 };

/**
 * Varre os perfis das vias e junta, por trecho, o pior caso de cada defeito. Seções de muro de arrimo, pontes e
 * túneis são tratamentos, não defeitos: entram só na contagem.
 */
export interface Removidos { vias: { nome: string; motivo: string; x: number; z: number }[]; prediosSobreVias: number; prediosDeslocados?: number; prediosPos: number[] }
export function diagnosticarVias(perfis: Map<number, Perfil>, hm: Heightmap, descartadas: { nome: string; motivo: string; x: number; z: number }[] = [], removidos?: Removidos, minirrotatorias = 0) {
  const achados: Problema[] = [];
  const contagem = vazia();
  contagem.rotatoria = descartadas.length;
  contagem.minirrotatoria = minirrotatorias;
  contagem.solta = removidos?.vias.length ?? 0;
  contagem.predioRemovido = removidos?.prediosSobreVias ?? 0;
  contagem.predioDeslocado = removidos?.prediosDeslocados ?? 0;
  const reg = regradeDe(hm.h);
  if (reg) { const r = reg.resumo; contagem.ruaDeMorro = r.trechosDeMorro; contagem.falesia = r.trechosComFalesia; contagem.maiorAterro = r.maxAterro; contagem.maiorCorte = r.maxCorte; contagem.maiorMuro = r.maxMuro; }
  contagem.taludes = estatLateral.taludes; contagem.lateralVertical = estatLateral.vertical; contagem.maiorQueda = estatLateral.maxQueda; contagem.secoesPatamar = estatLateral.patamares; contagem.maiorLance = estatLateral.maxLance; contagem.maiorParede = estatLateral.maxParede; contagem.muroTalude = estatLateral.muroTalude;
  const solucoes: Problema[] = [];
  for (const p of perfis.values()) {
    if (p.nivel === 1 || p.nivel === -1) {
      if (p.nivel === 1) { contagem.ponte++; contagem.porSolucao.viaduto++; } else { contagem.tunel++; contagem.porSolucao.tunel++; }
      const k = Math.floor(p.n / 2), nm = p.edge.name || `trecho ${p.edge.id}`;
      solucoes.push({ tipo: 'solucao', nome: nm, x: p.x[k], z: p.z[k], valor: reg?.trechos.get(p.edge.id)?.devMax ?? 0, inclinacao: Math.round((p.gradeMax ?? 0) * 100), detalhe: p.nivel === 1 ? 'viaduto com pilares' : 'túnel', solucao: p.nivel === 1 ? 'viaduto' : 'túnel', alturaMax: reg?.trechos.get(p.edge.id)?.devMax ?? 0 });
      continue;
    }
    contagem.trechos++;
    const meia = larguraVia(p.edge) / 2; // só a pista: é nela que o morro "cobre o asfalto"
    let pMo = 0, pVa = 0, iMo = 0, iVa = 0, grade = 0, iGr = 0, temMuro = false;
    for (let i = 0; i < p.n; i += 2) {
      if (i > 0) {
        const g = Math.abs(p.y[i] - p.y[i - 2]) / Math.max(0.5, p.s[i] - p.s[i - 2]);
        if (g > grade) { grade = g; iGr = i; }
      }
      if (p.classe && p.classe[i] === 3) temMuro = true;
      if (p.classe && (p.classe[i] === 1 || p.classe[i] === 2)) continue; // ponte/túnel por trecho contínuo: tratamento, não defeito
      const nx = -p.tz[i], nz = p.tx[i];
      const a = sampleHeight(hm, p.x[i] + nx * meia, p.z[i] + nz * meia), b = sampleHeight(hm, p.x[i] - nx * meia, p.z[i] - nz * meia), c = sampleHeight(hm, p.x[i], p.z[i]);
      const mo = Math.max(a, b, c) - (p.y[i] + 0.02), va = p.y[i] - Math.min(a, b, c);
      if (mo > pMo) { pMo = mo; iMo = i; }
      if (va > pVa && p.y[i] > 3) { pVa = va; iVa = i; }
    }
    if (temMuro) contagem.muro++;
    // solução do trecho: muro (com patamares se passa de 5 m), terraço (queda > 12 m: talude em lances com banquetas), talude simples ou nenhuma
    const muroMax = reg?.trechos.get(p.edge.id)?.muroMax ?? 0;
    const solucao = temMuro ? 'muro' : pVa > 12 ? 'terraço' : pVa > 2.45 ? 'talude' : '';
    const alturaMax = temMuro ? muroMax : pVa;
    if (solucao === 'muro') contagem.porSolucao.muro++; else if (solucao === 'terraço') contagem.porSolucao.terraco++; else if (solucao === 'talude') contagem.porSolucao.talude++;
    if (solucao) solucoes.push({ tipo: 'solucao', nome: p.edge.name || `trecho ${p.edge.id}`, x: p.x[iVa], z: p.z[iVa], valor: alturaMax, inclinacao: Math.round(Math.max(grade, p.gradeMax ?? 0) * 100), detalhe: `${solucao}${solucao === 'muro' && muroMax > 5 ? ` em ${Math.min(3, Math.ceil(muroMax / 5))} patamares de ≤ 5 m${muroMax > 15 ? ' + talude de grama' : ''}` : solucao === 'terraço' ? ` em ${Math.min(3, Math.ceil(pVa / 8))} lances com banquetas de 2 m` : ''} · altura máx ${alturaMax.toFixed(1)} m`, solucao, alturaMax });
    const incl = Math.round(Math.max(grade, p.gradeMax ?? 0) * 100);
    const nome = p.edge.name || `trecho ${p.edge.id}`;
    if (pMo > LIMITE.morro) { contagem.morro++; achados.push({ tipo: 'morro', nome, x: p.x[iMo], z: p.z[iMo], valor: pMo, inclinacao: incl, detalhe: `morro ${pMo.toFixed(1)} m acima do asfalto` }); }
    if (pVa > LIMITE.vao) { contagem.vao++; achados.push({ tipo: 'vao', nome, x: p.x[iVa], z: p.z[iVa], valor: pVa, inclinacao: incl, detalhe: `${pVa.toFixed(1)} m de vão sob a rua${pVa <= 12 ? " (talude de grama 1:1,5 até o chão)" : pVa <= 40 ? " (talude em patamares com banquetas de 2 m)" : " — acima do que o talude em patamares cobre"}` }); }
    const alvoT = reg?.trechos.get(p.edge.id)?.alvo ?? GRADE_ALVO;
    if (grade > alvoT + 0.005) { contagem.rampa++; achados.push({ tipo: 'rampa', nome, x: p.x[iGr], z: p.z[iGr], valor: grade * 100, inclinacao: incl, detalhe: `rampa de ${(grade * 100).toFixed(0)}%${alvoT > GRADE_ALVO ? ' (rua de morro, até 40%)' : ''}` }); }
  }
  const roundabouts: Problema[] = descartadas.map((d) => ({ tipo: 'rotatoria' as const, nome: d.nome || 'sem nome', x: d.x, z: d.z, valor: 0, inclinacao: 0, detalhe: d.motivo }));
  // o que é defeito de verdade primeiro: morro sobre o asfalto, depois rampa, depois vão (que a lateral até o chão já fecha até 14 m)
  const ordem = { morro: 0, rampa: 1, vao: 2, solta: 3, rotatoria: 4, predio: 5, solucao: 6 } as const;
  achados.sort((u, v) => ordem[u.tipo] - ordem[v.tipo] || v.valor - u.valor);
  const soltas: Problema[] = (removidos?.vias ?? []).map((v) => ({ tipo: 'solta' as const, nome: v.nome || 'sem nome', x: v.x, z: v.z, valor: 0, inclinacao: 0, detalhe: `${v.motivo} — removida` }));
  const predios: Problema[] = [];
  for (let k = 0; removidos && k + 1 < removidos.prediosPos.length && predios.length < 150; k += 2) predios.push({ tipo: 'predio', nome: 'prédio', x: removidos.prediosPos[k], z: removidos.prediosPos[k + 1], valor: 0, inclinacao: 0, detalhe: 'invadia a pista e não coube fora dela — removido' });
  solucoes.sort((u, v) => v.valor - u.valor);
  const lista = achados.slice(0, 100).concat(solucoes.slice(0, 40), soltas, roundabouts, predios, achados.slice(100, 300));
  debugMapa.problemas(lista, contagem);
  console.info(`[mapa] vias: ${contagem.trechos} trechos · morro ${contagem.morro} · vão ${contagem.vao} · rampa ${contagem.rampa} · tratados: ${contagem.muro} com muro, ${contagem.ponte} pontes, ${contagem.tunel} túneis · ${contagem.solta} vias soltas removidas · prédios sobre a pista: ${contagem.predioDeslocado} deslocados, ${contagem.predioRemovido} removidos · ${contagem.minirrotatoria} minirrotatórias · ${contagem.rotatoria} rotatórias descartadas`);
  return lista;
}
