/**
 * Ocorrências e despacho (Fase 26). Todo dia o Worker sorteia as ocorrências da cidade (operação, confronto, blitz, roubo,
 * incêndio, acidente, resgate, enchente) pelas taxas de `ocorrencias.json`, escolhe onde elas caem, despacha a instituição
 * certa (incêndio → Bombeiros, ferido → SAMU, tiroteio → PM/BOPE, crime → Civil), calcula o tempo de chegada pela base mais
 * próxima e resolve o desfecho: quanto mais demora a resposta, mais mortos. O desenho (cenas, viaturas com sirene, reação dos
 * pedestres) só encena as ocorrências perto da câmera; o resultado vale para a cidade inteira.
 */
import type { Simulation } from '../simulation';
import { BUILD_HALF } from '../../world/constants';
import { sampleWaterDist } from '../../world/terrain';
import { TERR_RES } from '../city/territorio';
import { DADOS, IDS_FACCAO, NF } from './dados';
import type { Faccoes } from './faccoes';
import type { Ocorrencia, RespostaOcorrencia } from './tipos';
import { SEM_UNIDADE } from './unidades';

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

export interface Base { inst: string; esp?: string; nome: string; x: number; z: number; viaturas: number; jogador: boolean }
export interface EstadoBases { lista: Base[]; versao: number }

/** Bases das instituições: as do JSON (centro do bairro) + os equipamentos que o jogador construiu. */
export function montarBases(sim: Simulation, fac: Faccoes): Base[] {
  const out: Base[] = [];
  const I = DADOS.instituicoes;
  const U = fac.unidades;
  for (const id of I.ordem) {
    const inst = I.instituicoes[id];
    inst.bases.forEach((b, i) => {
      // sem polígonos de bairro (mapa procedural) as bases se espalham por igual entre os setores (posição fixa: não depende da população do dia)
      const un = U.fonte === 'censo' ? U.porNome(b.bairro) : U.lista[Math.floor(((i + 0.5 + (id.length % 3) * 0.17) * U.n) / inst.bases.length) % U.n] ?? null;
      if (!un) return; // o bairro está fora do mapa construível: a base não existe neste mapa
      out.push({ inst: id, nome: `${b.nome}`, x: un.cx, z: un.cz, viaturas: inst.viaturasPorBase, jogador: false });
      if (inst.especializacao && id === 'pm' && i === 0) for (const [eid, e] of Object.entries(inst.especializacao)) out.push({ inst: id, esp: eid, nome: e.nome, x: un.cx, z: un.cz, viaturas: e.viaturasPorBase, jogador: false });
    });
  }
  for (const s of sim.services) {
    const map = I.equipamentos[s.eq];
    if (!map || typeof map === 'string') continue;
    out.push({ inst: map.instituicao, nome: `${s.eq === 'hospital' ? 'Hospital' : s.eq === 'upa' ? 'UPA' : s.eq === 'delegacia' ? 'Delegacia' : s.eq === 'batalhao' ? 'Batalhão' : 'Base comunitária'} (construído)`, x: s.x, z: s.z, viaturas: map.viaturas, jogador: true });
  }
  return out;
}

const poisson = (sim: Simulation, lambda: number): number => {
  if (lambda <= 0) return 0;
  const L = Math.exp(-Math.min(lambda, 12));
  let k = 0, p = 1;
  do { k++; p *= sim.rng.next(); } while (p > L && k < 12);
  return k - 1;
};

/** quanto cada fator do JSON pesa hoje (0–1) */
function condicoes(sim: Simulation, fac: Faccoes) {
  const cl = sim.clima.resumo;
  let popT = 0, crim = 0;
  for (let u = 0; u < fac.pop.length; u++) { popT += fac.pop[u]; crim += fac.pop[u] * fac.forca[u]; }
  // da própria favela (estado restaurado no save), não do agregado do dia anterior: o resultado não depende de salvar e carregar
  const inf = sim.favelas.populacaoTotal(), pop = Math.max(1, sim.populacao + inf);
  return {
    crime: clamp((popT > 0 ? crim / popT : 0) * 2, 0, 1), noite: 0.5, chuva: clamp(cl.chuvaHoje / 30, 0, 1), calor: clamp(cl.calor, 0, 1),
    guerra: clamp(fac.conflitosHoje / 6, 0, 1), semEstado: clamp(1 - sim.servicosSociais.resumo.seguranca, 0, 1), favela: clamp(inf / pop, 0, 1),
    encosta: clamp(cl.chuva3d / 80, 0, 1), doutrinaConfronto: (sim.estado?.politicas.doutrina ?? 'confronto') === 'confronto' ? 1 : 0,
    congestionamento: clamp(sim.transporte.resumo.congestionamento, 0, 1),
  } as Record<string, number>;
}

/** Sorteia um lote ocupado (pesos opcionais por lote). */
function loteAleatorio(sim: Simulation, peso: (i: number) => number, tentativas = 40): number {
  const n = sim.lots.length;
  let melhor = -1, mp = -1;
  for (let t = 0; t < tentativas; t++) {
    const i = sim.rng.int(0, n - 1);
    if (!sim.arch[i] || !sim.occ[i]) continue;
    const p = peso(i) * sim.rng.next();
    if (p > mp) { mp = p; melhor = i; }
  }
  return melhor;
}

function onde(sim: Simulation, fac: Faccoes, local: string): { x: number; z: number; rua?: string } | null {
  const T = sim.territorio, U = fac.unidades;
  const porUnidade = (peso: (u: number) => number) => {
    let tot = 0;
    const w = U.lista.map((u) => { const p = Math.max(0, peso(u.id)); tot += p; return p; });
    if (tot <= 0) return -1;
    let r = sim.rng.next() * tot;
    for (let u = 0; u < w.length; u++) { r -= w[u]; if (r <= 0) return u; }
    return w.length - 1;
  };
  const celulaForte = (u: number) => {
    let melhor = -1, m = -1;
    for (let t = 0; t < 10; t++) { const cs = U.lista[u].celulas; const k = cs[sim.rng.int(0, cs.length - 1)]; const f = Math.max(T.F[k], T.M[k]) + sim.rng.next() * 0.2; if (f > m) { m = f; melhor = k; } }
    if (melhor < 0) return null;
    const i = melhor % TERR_RES, j = Math.floor(melhor / TERR_RES);
    return { x: -BUILD_HALF + (i + 0.3 + sim.rng.next() * 0.4) * 64, z: -BUILD_HALF + (j + 0.3 + sim.rng.next() * 0.4) * 64 };
  };
  if (local === 'dominio' || local === 'disputado') {
    const u = local === 'disputado' && fac.conflito.some((c) => c > 0) ? porUnidade((k) => fac.conflito[k]) : porUnidade((k) => fac.pop[k] * fac.forca[k] ** 2);
    return u >= 0 ? celulaForte(u) : null;
  }
  if (local === 'via') {
    const arestas = [...sim.graph.edges.values()];
    if (!arestas.length) return null;
    const e = arestas[sim.rng.int(0, arestas.length - 1)];
    const a = sim.graph.nodes.get(e.a), b = sim.graph.nodes.get(e.b);
    if (!a || !b) return null;
    const t = 0.25 + sim.rng.next() * 0.5;
    return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, rua: e.name };
  }
  const i = local === 'crime'
    ? loteAleatorio(sim, (l) => 0.2 + (fac.forca[fac.unidades.de(sim.lotX[l], sim.lotZ[l])] ?? 0))
    : local === 'agua'
      ? loteAleatorio(sim, (l) => (sampleWaterDist(sim.hm, sim.lotX[l], sim.lotZ[l]) < 220 ? 1 : 0.02), 80)
      : loteAleatorio(sim, (l) => sim.occ[l]);
  return i >= 0 ? { x: sim.lotX[i], z: sim.lotZ[i] } : null;
}

/** Quem é despachado, de onde, e em quanto tempo chega. */
export function despachar(_sim: Simulation, fac: Faccoes, tipo: string, x: number, z: number, gravidade: number, feridos: boolean, forcaLocal: number): RespostaOcorrencia[] {
  const t = DADOS.ocorrencias.tipos[tipo];
  const I = DADOS.instituicoes.instituicoes;
  const D = DADOS.ocorrencias.despacho;
  const bases = fac.bases.lista;
  const quem: string[] = [...t.despacho.primaria];
  if (t.despacho.especial && gravidade >= 0.3) quem.push(t.despacho.especial);
  if (gravidade >= t.despacho.apoioA || feridos) for (const a of t.despacho.apoio) if (!quem.includes(a)) quem.push(a);
  if (feridos && !quem.includes('samu')) quem.push('samu');
  const out: RespostaOcorrencia[] = [];
  for (const q of quem) {
    const inst = I[q] ? q : Object.keys(I).find((k) => I[k].especializacao?.[q]);
    if (!inst) continue;
    const esp = I[q] ? undefined : q;
    const def = esp ? I[inst].especializacao![esp] : I[inst];
    // base mais próxima (entre as da instituição; a especialização usa as bases que a têm)
    let melhor: Base | null = null, dm = Infinity;
    for (const b of bases) {
      if (b.inst !== inst || (esp ? b.esp !== esp : b.esp)) continue;
      const d = Math.hypot(b.x - x, b.z - z);
      if (d < dm) { dm = d; melhor = b; }
    }
    if (!melhor) continue;
    const escolta = forcaLocal > 0.45 && (inst === 'samu' || inst === 'bombeiros');
    const eta = def.preparoMin + (dm * 1.35) / def.velocidade / 60 + (escolta ? D.atrasoEscoltaMin : 0) + (forcaLocal > 0.6 ? D.atrasoAreaDominadaMin : 0);
    out.push({ inst, esp, base: melhor.nome, baseX: melhor.x, baseZ: melhor.z, viaturas: Math.min(melhor.viaturas, 1 + Math.floor(gravidade * 3)), etaMin: Math.round(eta * 10) / 10, escolta });
  }
  return out;
}

const texto = (m: string, v: Record<string, string | number>) => m.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ''));

/** Sorteia, despacha e resolve as ocorrências do dia. */
export function gerarOcorrencias(sim: Simulation, fac: Faccoes) {
  const O = DADOS.ocorrencias;
  const T = sim.territorio;
  if (fac.bases.versao !== sim.worldVersion || !fac.bases.lista.length) fac.bases = { lista: montarBases(sim, fac), versao: sim.worldVersion };
  const cond = condicoes(sim, fac);
  const escala = clamp(Math.sqrt(Math.max(1, sim.populacao + sim.favelas.populacaoTotal()) / 500_000), 0.15, 3);
  const dia = sim.dia;
  for (const [tipo, t] of Object.entries(O.tipos)) {
    let mult = 1;
    for (const [fk, peso] of Object.entries(t.fatores)) mult *= 1 + (peso - 1) * (cond[fk] ?? 0);
    const n = Math.min(6, poisson(sim, t.taxaDia * mult * escala));
    for (let k = 0; k < n; k++) {
      const pos = onde(sim, fac, t.local);
      if (!pos) continue;
      const u = fac.unidades.de(pos.x, pos.z);
      const forcaLocal = u === SEM_UNIDADE ? 0 : fac.forca[u];
      const gravidade = clamp(O.gravidade.media + (sim.rng.next() - 0.5) * 2 * O.gravidade.variacao, 0, 1);
      const r = t.resolucao;
      // facções envolvidas: as de maior controle na unidade (confronto: duas rivais)
      const envolvidas: number[] = [];
      if (u !== SEM_UNIDADE) {
        const ord = IDS_FACCAO.map((_, f) => f).sort((a, b) => fac.share[u * NF + b] - fac.share[u * NF + a]).filter((f) => fac.share[u * NF + f] > 0.12);
        if (tipo === 'confronto') {
          let par: number[] | null = null;
          for (let i = 0; i < ord.length && !par; i++) for (let j = i + 1; j < ord.length && !par; j++) if (fac.relacaoEntre(ord[i], ord[j]) <= -0.25 && fac.tregua[ord[i] * NF + ord[j]] === 0) par = [ord[i], ord[j]];
          if (par) envolvidas.push(...par); else envolvidas.push(...ord.slice(0, 2));
        } else if (t.local === 'dominio' || t.local === 'disputado' || tipo === 'roubo') envolvidas.push(...ord.slice(0, 1));
      }
      const mortosEsp = r.mortos * (0.4 + gravidade * 1.6);
      let feridos = poisson(sim, r.feridos * (0.4 + gravidade * 1.6));
      const resposta = despachar(sim, fac, tipo, pos.x, pos.z, gravidade, feridos > 0 && t.despacho.primaria.indexOf('samu') < 0, forcaLocal);
      // demora da resposta principal: cada minuto além do limite "bom" custa vidas (e a ausência total custa mais)
      const primaria = resposta.filter((x) => t.despacho.primaria.includes(x.esp ?? x.inst));
      const eta = primaria.length ? Math.min(...primaria.map((x) => x.etaMin)) : 999;
      const atraso = Math.max(0, Math.min(60, eta) - O.despacho.limiteChegadaBomMin);
      let mortos = poisson(sim, mortosEsp + atraso * O.despacho.mortosPorMinutoAtraso * (0.5 + gravidade) * (r.mortos > 0 || r.feridos > 1 ? 1 : 0.3));
      const presos = poisson(sim, r.presos * (0.5 + gravidade) * (eta < O.despacho.limiteChegadaRuimMin ? 1 : 0.4));
      if (!resposta.some((x) => x.inst === 'samu')) { mortos += feridos > 2 && sim.rng.chance(0.5) ? 1 : 0; } // ferido sem SAMU morre mais
      feridos = Math.max(feridos, mortos > 0 && tipo === 'acidente' ? 1 : 0);
      const ocupante = u === SEM_UNIDADE ? 'a cidade' : fac.unidades.lista[u].nome;
      const local = pos.rua ? `${pos.rua} (${ocupante})` : ocupante;
      const g = (i: number) => (envolvidas[i] !== undefined ? fac.nome(envolvidas[i]) : 'um grupo armado');
      const inst = primaria[0] ? DADOS.instituicoes.instituicoes[primaria[0].inst].sigla : 'PM';
      const desfecho = mortos > 0 ? 'morre' : feridos > 0 ? 'fica ferida' : 'escapa ilesa';
      const oc: Ocorrencia = {
        id: fac.proximoId++, tipo, x: pos.x, z: pos.z, unidade: u === SEM_UNIDADE ? -1 : u, local, dia, hora: Math.round(sim.rng.next() * 24 * 10) / 10, gravidade,
        faccoes: envolvidas, resposta, mortos, feridos, presos, ordenada: false,
        manchete: texto(t.manchete, { local, mortos, feridos, presos, grupoA: g(0), grupoB: g(1), inst, eta: Math.round(eta === 999 ? 0 : eta), desfecho }),
      };
      fac.ocorrencias.push(oc);
      fac.totais[tipo] = (fac.totais[tipo] ?? 0) + 1;
      fac.mortosTotal += mortos;
      aplicarEfeitos(sim, fac, oc, tipo, r.tomaTerritorio);
      if (fac.ocorrencias.length > O.despacho.maximoOcorrenciasGuardadas) fac.ocorrencias.splice(0, fac.ocorrencias.length - O.despacho.maximoOcorrenciasGuardadas);
    }
  }
  void T;
}

/** O que a ocorrência faz com o resto do jogo: mortes, território, desgaste das facções, notícia. */
export function aplicarEfeitos(sim: Simulation, fac: Faccoes, oc: Ocorrencia, tipo: string, tomaTerritorio: number) {
  const T = sim.territorio;
  // só a tragédia de verdade (4+ mortos) abala a aprovação do governo; as mortes do dia a dia entram no crime e nos números
  if (oc.mortos >= 4) sim.estado?.registrarTragedia(oc.mortos);
  if (oc.mortos > 0) sim.crimeExtra += 0.004 * oc.mortos;
  if (tipo === 'operacao') {
    // a polícia entra: derruba o domínio ao redor (menos que a operação ordenada pelo jogador), apreende, mata e prende
    const raio = 260;
    const R = TERR_RES;
    for (let j = 0; j < R; j++) for (let i = 0; i < R; i++) {
      const cx = -BUILD_HALF + (i + 0.5) * 64, cz = -BUILD_HALF + (j + 0.5) * 64;
      if (Math.hypot(cx - oc.x, cz - oc.z) > raio) continue;
      const k = j * R + i;
      T.F[k] *= 1 - tomaTerritorio * oc.gravidade; T.M[k] *= 1 - tomaTerritorio * oc.gravidade;
      T.ocupacao[k] = Math.min(0.8, T.ocupacao[k] + 0.25);
    }
    const afetadas = fac.aoOperacao(oc.x, oc.z, raio);
    if (afetadas.length) oc.faccoes = afetadas.slice(0, 2).map((a) => a.faccao);
    if (oc.mortos > 0) sim.estado?.registrarOperacao(oc.mortos, oc.presos);
  }
  if (tipo === 'confronto') for (const f of oc.faccoes) fac.desgaste[f] = clamp(fac.desgaste[f] + 0.03, 0, 1);
  // notícia: só o que pesa (mortos, operações, enchentes, incêndios) e com intervalo por tipo e local
  const relevante = oc.mortos >= 3 || (tipo === 'enchente' && oc.feridos >= 2) || (tipo === 'operacao' && oc.mortos >= 2);
  if (relevante) sim.noticia(oc.manchete, oc.mortos > 1 || tipo === 'confronto' ? 'ruim' : 'alerta', `oc-${tipo}`, 25);
}

/** Operação ordenada pelo jogador: vira uma ocorrência com despacho (PM/BOPE, SAMU, Civil) para ser encenada perto da câmera. */
export function registrarOperacaoOrdenada(sim: Simulation, fac: Faccoes, x: number, z: number, mortos: number, presos: number, local: string): Ocorrencia {
  if (fac.bases.versao !== sim.worldVersion || !fac.bases.lista.length) fac.bases = { lista: montarBases(sim, fac), versao: sim.worldVersion };
  const u = fac.unidades.de(x, z);
  const forcaLocal = u === SEM_UNIDADE ? 0 : fac.forca[u];
  const gravidade = clamp(0.35 + mortos * 0.08, 0, 1);
  const feridos = Math.max(0, Math.round(mortos * 2.2));
  const resposta = despachar(sim, fac, 'operacao', x, z, gravidade, feridos > 0, forcaLocal);
  const envolvidas = fac.aoOperacao(x, z, 280).slice(0, 2).map((a) => a.faccao);
  const oc: Ocorrencia = { id: fac.proximoId++, tipo: 'operacao', x, z, unidade: u === SEM_UNIDADE ? -1 : u, local, dia: sim.dia, hora: 6, gravidade, faccoes: envolvidas, resposta, mortos, feridos, presos, ordenada: true, manchete: '' };
  fac.ocorrencias.push(oc);
  fac.totais.operacao = (fac.totais.operacao ?? 0) + 1;
  fac.mortosTotal += mortos;
  fac.versao++;
  return oc;
}
