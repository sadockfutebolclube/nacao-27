/**
 * Ocupações informais. Surgem quando falta moradia popular perto dos empregos: o déficit
 * habitacional vira barraco na encosta, na beira do rio ou no terreno vazio. Crescem casa a casa,
 * ganham laje e andar, trazem risco de deslizamento, esgoto a céu aberto e domínio territorial.
 * O jogador pode urbanizar (obra do Estado), regularizar a posse ou remover (custo político).
 */
import { hash32 } from '../core/rng';
import { BUILD_HALF, RASTER_CELL, RASTER_RES } from '../../world/constants';
import { forRectCells, RASTER_INFORMAL, type Footprint } from '../../world/lots';
import { sampleHeight, sampleSlope, sampleWaterDist } from '../../world/terrain';
import { arquetipoPorId, Zone } from '../catalog';
import type { Simulation } from '../simulation';

export type StatusFavela = 'informal' | 'urbanizando' | 'urbanizada' | 'removendo';

export interface Casa { x: number; z: number; ang: number; w: number; d: number; andares: number; look: number }

export interface Favela {
  id: number;
  nome: string;
  cx: number;
  cz: number;
  /** grupo criminoso que se instala (1 facção, 2 milícia — fictícios) */
  grupo: 1 | 2;
  casas: Casa[];
  status: StatusFavela;
  regularizada: boolean;
  obraUid: number | null;
  criadaDia: number;
  crime: number;
  risco: number;
  cobertura: { saude: number; educacao: number; seguranca: number };
  removerPorSemana: number;
  mortosDeslizamento: number;
}

const PESSOAS_POR_ANDAR = 3.3;
const PREFIXOS = ['Morro do', 'Morro da', 'Comunidade', 'Vila', 'Parque', 'Favela do', 'Ladeira do', 'Baixada do', 'Beco do'];
const NUCLEOS = ['Urubu', 'Sapo', 'Cantagalo', 'Jacaré', 'Mangue', 'Sossego', 'Pavão', 'Cabrito', 'Juramento', 'Salgueiro', 'Fubá', 'Pinto', 'Timbau', 'Coroa', 'Esperança', 'Cruzeiro', 'Pedreira', 'Cajueiro', 'Rato Molhado', 'Barreira', 'Caixa d\'Água', 'Céu Azul'];

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

export class Favelas {
  lista: Favela[] = [];
  nextId = 1;
  versao = 0;
  deficit = 0;
  demandaPopular = 0;
  private hash = new Map<number, Casa[]>();

  private chave(x: number, z: number) { return (Math.floor(x / 8) + 1000) * 4096 + (Math.floor(z / 8) + 1000); }
  private indexar(c: Casa) { const k = this.chave(c.x, c.z); (this.hash.get(k) ?? this.hash.set(k, []).get(k)!).push(c); }
  private reindexar() { this.hash.clear(); for (const f of this.lista) for (const c of f.casas) this.indexar(c); }

  ativas(): Favela[] { return this.lista; }
  populacao(f: Favela): number { return f.casas.reduce((s, c) => s + c.andares * PESSOAS_POR_ANDAR, 0); }
  populacaoTotal(): number { return this.lista.reduce((s, f) => s + this.populacao(f), 0); }
  /** moradores sem saneamento (informal ou em obra) */
  populacaoSemSaneamento(): number { return this.lista.filter((f) => f.status !== 'urbanizada').reduce((s, f) => s + this.populacao(f), 0); }

  populacaoNoRaio(x: number, z: number, r: number): number {
    let p = 0;
    for (const f of this.lista) {
      if (Math.hypot(f.cx - x, f.cz - z) > r + 200) continue;
      for (const c of f.casas) if (Math.hypot(c.x - x, c.z - z) < r) p += c.andares * PESSOAS_POR_ANDAR;
    }
    return p;
  }

  footprints(): Footprint[] {
    const out: Footprint[] = [];
    for (const f of this.lista) for (const c of f.casas) out.push({ x: c.x, z: c.z, angle: c.ang, w: c.w, d: c.d });
    return out;
  }

  /** Favela cuja casa contém o ponto (ou −1). */
  favelaEm(x: number, z: number): number {
    for (const f of this.lista) {
      if (Math.hypot(f.cx - x, f.cz - z) > 60 + Math.sqrt(f.casas.length) * 10) continue;
      for (const c of f.casas) if (Math.hypot(c.x - x, c.z - z) < Math.max(c.w, c.d) * 0.7) return f.id;
    }
    return -1;
  }

  raioAproximado(f: Favela) { return 20 + Math.sqrt(f.casas.length) * 7; }

  /** Uma obra viária ou equipamento passou por cima: as casas no caminho são removidas. */
  removerSobre(rasterVias: Int32Array): number {
    let removidas = 0;
    for (const f of this.lista) {
      const antes = f.casas.length;
      f.casas = f.casas.filter((c) => {
        const i = Math.floor((c.x + BUILD_HALF) / RASTER_CELL), j = Math.floor((c.z + BUILD_HALF) / RASTER_CELL);
        if (i < 0 || j < 0 || i >= RASTER_RES || j >= RASTER_RES) return true;
        return rasterVias[j * RASTER_RES + i] >= 0;
      });
      removidas += antes - f.casas.length;
    }
    if (removidas) { this.lista = this.lista.filter((f) => f.casas.length > 0); this.reindexar(); this.versao++; }
    return removidas;
  }

  /** Déficit de moradia popular: famílias atraídas pelos empregos que não cabem nas moradias baratas. */
  calcularDeficit(sim: Simulation) {
    let popularFormal = 0;
    for (let i = 0; i < sim.lots.length; i++) {
      if (!sim.arch[i] || !sim.occ[i]) continue;
      const a = arquetipoPorId(sim.arch[i]);
      if (!a.moradores) continue;
      if (a.zone === Zone.ZEIS || sim.lv[i] < 36) popularFormal += sim.occ[i];
    }
    const popDesejada = sim.empregos * 1.9;
    this.demandaPopular = popDesejada * 0.45 + 0.01 * sim.populacao;
    this.deficit = Math.max(0, this.demandaPopular - popularFormal - this.populacaoTotal());
  }

  semanal(sim: Simulation) {
    this.calcularDeficit(sim);
    const rng = sim.rng;
    let mudou = false;

    // remoções em andamento
    for (const f of this.lista) {
      if (f.status !== 'removendo') continue;
      for (const c of f.casas.splice(0, f.removerPorSemana)) Favelas.carimbar(sim, c, false);
      this.reindexar();
      mudou = true;
      if (!f.casas.length) sim.noticia(`Remoção concluída: o ${f.nome} deixa de existir. Parte das famílias foi para o aluguel social; outras, para outra encosta.`, 'alerta', `rem${f.id}`, 0);
    }
    const antes = this.lista.length;
    this.lista = this.lista.filter((f) => f.casas.length > 0);
    if (this.lista.length !== antes) mudou = true;

    // crescimento
    if (this.deficit > 40) {
      const alvoPessoas = Math.min(this.deficit * 0.3, 180 + 0.04 * this.populacaoTotal());
      let casasNovas = Math.ceil(alvoPessoas / (PESSOAS_POR_ANDAR * 1.4));
      const informais = this.lista.filter((f) => f.status === 'informal');
      if (!informais.length || (rng.chance(0.12) && this.lista.length < 1 + sim.populacao / 15000)) {
        const nova = this.fundar(sim);
        if (nova) { informais.push(nova); mudou = true; }
      }
      let tentativas = 0;
      while (casasNovas > 0 && informais.length && tentativas < casasNovas * 6) {
        tentativas++;
        // favelas maiores atraem mais (rede de parentes e conhecidos)
        const pesos = informais.map((f) => Math.sqrt(f.casas.length));
        let r = rng.next() * pesos.reduce((a, b) => a + b, 0);
        let f = informais[0];
        for (let k = 0; k < informais.length; k++) { r -= pesos[k]; if (r <= 0) { f = informais[k]; break; } }
        if (this.adicionarCasa(sim, f)) { casasNovas--; mudou = true; }
      }
      // adensamento: a laje vira o segundo, o terceiro andar
      for (const f of informais) for (const c of f.casas) if (c.andares < 4 && rng.chance(0.025)) { c.andares++; mudou = true; }
    }

    for (const f of this.lista) f.risco = this.calcularRisco(sim, f);
    if (mudou) this.versao++;
  }

  private calcularRisco(sim: Simulation, f: Favela): number {
    if (!f.casas.length) return 0;
    let s = 0;
    for (const c of f.casas) s += clamp((sampleSlope(sim.hm, c.x, c.z) - 0.3) * 1.3, 0, 1);
    const base = s / f.casas.length;
    const beiraRio = sampleWaterDist(sim.hm, f.cx, f.cz) < 80 ? 0.25 : 0;
    const fator = f.status === 'urbanizada' ? 0.2 : f.status === 'urbanizando' ? 0.6 : 1;
    return clamp((base + beiraRio) * fator * (sim.contencaoEncostas ? 0.5 : 1), 0, 1);
  }

  private fundar(sim: Simulation): Favela | null {
    const rng = sim.rng;
    const empregos: [number, number][] = [];
    for (let i = 0; i < sim.lots.length && empregos.length < 400; i++) {
      if (sim.arch[i] && arquetipoPorId(sim.arch[i]).empregos) empregos.push([sim.lots[i].x, sim.lots[i].z]);
    }
    if (!empregos.length) return null;
    let melhor: { x: number; z: number; nota: number } | null = null;
    const lim = BUILD_HALF - 80;
    for (let t = 0; t < 240; t++) {
      const x = rng.range(-lim, lim), z = rng.range(-lim, lim);
      const h = sampleHeight(sim.hm, x, z);
      if (h < 1.6) continue;
      const slope = sampleSlope(sim.hm, x, z);
      if (slope > 1.1) continue;
      if (!this.livre(sim, x, z, 14)) continue;
      if (this.lista.some((f) => Math.hypot(f.cx - x, f.cz - z) < 160)) continue;
      let dJob = Infinity;
      for (const [jx, jz] of empregos) dJob = Math.min(dJob, Math.hypot(jx - x, jz - z));
      if (dJob > 1100 || dJob < 60) continue;
      const dAgua = sampleWaterDist(sim.hm, x, z);
      const nota = 0.8 * clamp(slope / 0.45, 0, 1) + (dAgua < 140 && h < 6 ? 0.7 : 0) + (1 - dJob / 1100) + 0.3 * rng.next();
      if (!melhor || nota > melhor.nota) melhor = { x, z, nota };
    }
    if (!melhor) return null;
    const h = hash32(this.nextId * 7919 + sim.init.seed);
    const pMilicia = sim.init.sigla === 'RJ' ? 0.45 : 0.2;
    const f: Favela = {
      id: this.nextId++,
      nome: `${PREFIXOS[h % PREFIXOS.length]} ${NUCLEOS[(h >>> 6) % NUCLEOS.length]}`,
      cx: melhor.x, cz: melhor.z,
      grupo: rng.chance(pMilicia) ? 2 : 1,
      casas: [], status: 'informal', regularizada: false, obraUid: null, criadaDia: sim.dia,
      crime: 0.3, risco: 0, cobertura: { saude: 0, educacao: 0, seguranca: 0 }, removerPorSemana: 0, mortosDeslizamento: 0,
    };
    // primeiros barracos no ponto escolhido
    const primeira: Casa = { x: melhor.x, z: melhor.z, ang: rng.range(0, Math.PI), w: 5, d: 5.5, andares: 1, look: rng.next() };
    f.casas.push(primeira);
    this.indexar(primeira);
    for (let k = 0; k < 8; k++) this.adicionarCasa(sim, f);
    this.lista.push(f);
    sim.territorio.semear(f.cx, f.cz, f.grupo, 0.2);
    const onde = sampleWaterDist(sim.hm, f.cx, f.cz) < 140 && sampleHeight(sim.hm, f.cx, f.cz) < 6 ? 'na beira do rio' : sampleSlope(sim.hm, f.cx, f.cz) > 0.3 ? 'na encosta' : 'num terreno vazio';
    sim.noticia(`Ocupação irregular surge ${onde} e ganha nome: ${f.nome}. Famílias sem condição de pagar aluguel perto do trabalho erguem os primeiros barracos.`, 'alerta', `fav${f.id}`, 0);
    return f;
  }

  /** O terreno (raster de 2 m) está livre num raio? */
  private livre(sim: Simulation, x: number, z: number, r: number): boolean {
    for (const [dx, dz] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r], [r * 0.7, r * 0.7], [-r * 0.7, -r * 0.7]]) {
      const i = Math.floor((x + dx + BUILD_HALF) / RASTER_CELL), j = Math.floor((z + dz + BUILD_HALF) / RASTER_CELL);
      if (i < 0 || j < 0 || i >= RASTER_RES || j >= RASTER_RES) return false;
      const v = sim.raster[j * RASTER_RES + i];
      if (v !== 0 && v !== RASTER_INFORMAL) return false;
    }
    return true;
  }

  private adicionarCasa(sim: Simulation, f: Favela): boolean {
    const rng = sim.rng;
    const base = f.casas[rng.int(0, f.casas.length - 1)];
    const ang0 = rng.range(0, Math.PI * 2);
    const dist = rng.range(6.2, 9.2);
    const x = base.x + Math.cos(ang0) * dist, z = base.z + Math.sin(ang0) * dist;
    if (Math.hypot(x - f.cx, z - f.cz) > 30 + Math.sqrt(f.casas.length) * 9) return false;
    if (Math.abs(x) > BUILD_HALF - 12 || Math.abs(z) > BUILD_HALF - 12) return false;
    const h = sampleHeight(sim.hm, x, z);
    if (h < 1.0) return false;
    if (sampleSlope(sim.hm, x, z) > 1.45) return false;
    if (!this.livre(sim, x, z, 2.4)) return false;
    const k0 = this.chave(x, z);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const arr = this.hash.get(k0 + dx * 4096 + dz);
      if (arr) for (const c of arr) if (Math.hypot(c.x - x, c.z - z) < 5.3) return false;
    }
    // alinhada às curvas de nível, como as casas de encosta de verdade
    const gx = sampleHeight(sim.hm, x + 3, z) - sampleHeight(sim.hm, x - 3, z);
    const gz = sampleHeight(sim.hm, x, z + 3) - sampleHeight(sim.hm, x, z - 3);
    const ang = Math.atan2(gx, gz) + rng.range(-0.25, 0.25);
    const c: Casa = { x, z, ang, w: rng.range(4.6, 6.6), d: rng.range(4.6, 7.2), andares: rng.chance(0.35) ? 2 : 1, look: rng.next() };
    f.casas.push(c);
    this.indexar(c);
    Favelas.carimbar(sim, c, true);
    return true;
  }

  /** Marca (ou limpa) a casa no raster de ocupação da Simulation. */
  static carimbar(sim: Simulation, c: Casa, ocupar: boolean) {
    forRectCells({ x: c.x, z: c.z, angle: c.ang, w: c.w, d: c.d }, (idx) => {
      if (ocupar) { if (sim.raster[idx] === 0) sim.raster[idx] = RASTER_INFORMAL; }
      else if (sim.raster[idx] === RASTER_INFORMAL) sim.raster[idx] = 0;
    });
  }

  /** Deslizamentos na estação das chuvas (diário). */
  /** @param fatorChuva intensidade da chuva recente vinda do clima (1 ≈ temporal); ausente = calendário fixo */
  diario(sim: Simulation, mes: number, nordeste: boolean, fatorChuva?: number): { mortos: number; desabrigados: number } | null {
    const chuvoso = fatorChuva !== undefined ? fatorChuva > 0.05 : nordeste ? mes >= 4 && mes <= 7 : mes === 12 || mes <= 3;
    if (!chuvoso) return null;
    const fc = fatorChuva ?? 1;
    const rng = sim.rng;
    const fatorUF = 1 + 2 * (sim.init.efeitos.riscoDeslizamento ?? 0);
    for (const f of this.lista) {
      if (f.risco < 0.05 || !rng.chance(f.risco * 0.0018 * fatorUF * fc)) continue;
      // escolhe uma casa íngreme como epicentro
      let alvo = f.casas[0], maior = -1;
      for (let t = 0; t < 12; t++) {
        const c = f.casas[rng.int(0, f.casas.length - 1)];
        const s = sampleSlope(sim.hm, c.x, c.z);
        if (s > maior) { maior = s; alvo = c; }
      }
      const antes = f.casas.length;
      const raio = rng.range(9, 16);
      for (const c of f.casas) if (Math.hypot(c.x - alvo.x, c.z - alvo.z) <= raio) Favelas.carimbar(sim, c, false);
      f.casas = f.casas.filter((c) => Math.hypot(c.x - alvo.x, c.z - alvo.z) > raio);
      const perdidas = antes - f.casas.length;
      if (!perdidas) continue;
      const mortos = rng.int(0, Math.round(perdidas * 1.5));
      f.mortosDeslizamento += mortos;
      this.reindexar();
      this.versao++;
      const desabrigados = Math.round(perdidas * PESSOAS_POR_ANDAR * 1.5);
      sim.noticia(mortos > 0
        ? `Tragédia no ${f.nome}: deslizamento soterra ${perdidas} casas após temporal. ${mortos} morto${mortos > 1 ? 's' : ''} e ${desabrigados} desabrigados. Defesa Civil diz que a área era de risco.`
        : `Deslizamento no ${f.nome} destrói ${perdidas} casas durante o temporal. Ninguém morreu, mas ${desabrigados} pessoas estão desabrigadas.`, 'ruim', `desl${f.id}`, 20);
      this.lista = this.lista.filter((x) => x.casas.length > 0);
      return { mortos, desabrigados };
    }
    return null;
  }

  serializar() {
    return { lista: this.lista, nextId: this.nextId, deficit: this.deficit };
  }

  restaurar(s: ReturnType<Favelas['serializar']>) {
    this.lista = s.lista.map((f) => ({ ...f, casas: f.casas.map((c) => ({ ...c })) }));
    this.nextId = s.nextId;
    this.deficit = s.deficit;
    this.reindexar();
    this.versao++;
  }
}
