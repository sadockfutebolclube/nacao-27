/**
 * Ponte entre o mundo do jogo e as fichas (Fase 25): levanta os fatos (lotes, ruas, bairros do Censo, território, hora, chuva)
 * e entrega às funções puras de `geracao.ts`. Também monta o índice espacial das entidades estáticas — um lote por prédio,
 * mais os pontos turísticos — que o `registro` usa no picking. Nada aqui desenha.
 */
import { bairroCensoEm, censo, type BairroCenso } from '../data/bairros';
import { predio as predioReal } from '../data/cidadeReal';
import { bairroEm } from '../data/nomes';
import { ambiente } from '../render/city/ambiente';
import { clima } from '../render/city/climaVisual';
import { pedDebug } from '../render/city/estadoPedestres';
import { comercioFechadoEm } from '../render/city/ocorrenciaEstado';
import { diaDaSemana, fimDeSemana } from '../render/city/densidade';
import { ancoraMarco, prediosOcultos } from '../render/city/pontosRio';
import { posicaoDoPonto } from '../render/city/turismoEstado';
import { indiceDasVias, type AmostraVia } from '../render/city/perfilVias';
import { perfisAtuais } from '../render/city/Vias';
import { mundo, useGame } from '../sim/bridge';
import { Zone } from '../sim/catalog';
import { GRUPOS, TERR_CELL, TERR_RES } from '../sim/city/territorio';
import { DADOS as DADOS_SEG } from '../sim/faccoes/dados';
import { LOT_STATE_STRIDE } from '../sim/protocol';
import { BUILD_HALF } from '../world/constants';
import { LOT_STRIDE } from '../world/lots';
import { sampleHeight } from '../world/terrain';
import { TURISMO } from '../world/turismo';
import {
  gerarCarro, gerarCasa, gerarEstabelecimento, gerarPessoa, MARCOS, regiaoDoBairro, regiaoPorAP, sorteio,
  type Dominio, type Endereco, type FichaCarro, type FichaCasa, type FichaEstab, type FichaPessoa, type MarcoDado, type Persona,
} from './geracao';
import { ID_BASE_LOTE, ID_BASE_MARCO, ID_BASE_QUIOSQUE, IndiceCaixas, registro, type Caixa, type TipoEntidade } from './registro';
import { dadosDaOrla, type Quiosque } from '../render/city/orlaDados';
import { contextoTurismo } from '../render/city/turismoEstado';
import { eventoAgora, notaDoPonto, ocupacaoAgora, textoPico, visitantesDoPonto, visitantesHoje } from '../world/turismo';

// ── fatos do mundo ────────────────────────────────────────────────────────────────

export interface BairroInfo { nome: string; regiao: string; censo: BairroCenso | null; indice: number }

/** Bairro (Censo/IPP quando carregado; senão o nó de bairro do OSM mais perto) e a região do Rio. */
export function bairroInfo(x: number, z: number): BairroInfo {
  const c = bairroCensoEm(x, z);
  if (c) return { nome: c.nome, regiao: regiaoPorAP(c.ap, c.ra), censo: c, indice: censo.bairros ? censo.bairros.indexOf(c) : -1 };
  const r = mundo.real;
  if (r?.bairros && r.nomesBairros) {
    let melhor = -1, dm = Infinity;
    for (let i = 0; i < r.bairros.length; i += 4) { if (r.bairros[i + 2] !== 0) continue; const d = (r.bairros[i] - x) ** 2 + (r.bairros[i + 1] - z) ** 2; if (d < dm) { dm = d; melhor = r.bairros[i + 3]; } }
    if (melhor >= 0 && dm < 3500 * 3500) { const nome = r.nomesBairros[melhor]; return { nome, regiao: regiaoDoBairro(nome, x, z), censo: null, indice: -1 }; }
  }
  const nome = mundo.init ? bairroEm(mundo.init.seed, x, z) : 'Bairro';
  return { nome, regiao: regiaoDoBairro(null, x, z), censo: null, indice: -1 };
}

const amostra: AmostraVia = { x: 0, y: 0, z: 0, tx: 0, tz: 0, largura: 0, edge: 0 };
/** Nome da rua mais perto de (x, z). */
export function ruaEm(x: number, z: number): string {
  if (perfisAtuais.size && indiceDasVias(perfisAtuais).perto(x, z, 60, amostra)) return mundo.roads.edges.get(amostra.edge)?.name ?? 'Rua sem nome';
  return 'Rua sem nome';
}

const numeroEm = (x: number, z: number) => (Math.round(Math.abs(x * 3.1 + z * 1.7)) % 1900) + 10;

export function dominioEm(x: number, z: number): { dominio: Dominio | null; disputado: boolean } {
  const ti = Math.min(TERR_RES - 1, Math.max(0, Math.floor((x + BUILD_HALF) / TERR_CELL))), tj = Math.min(TERR_RES - 1, Math.max(0, Math.floor((z + BUILD_HALF) / TERR_CELL)));
  const tf = mundo.territorioF[tj * TERR_RES + ti] ?? 0, tm = mundo.territorioM[tj * TERR_RES + ti] ?? 0;
  if (Math.max(tf, tm) < 0.25) return { dominio: null, disputado: false };
  // quem domina: a facção dona da célula no sistema de facções (CV, ADA, TCP ou Milícia); sem ele, o grupo da grade
  const k = tj * TERR_RES + ti, d = mundo.faccoesDono[k] ?? 0;
  if (d > 0) { const f = DADOS_SEG.faccoes.faccoes[DADOS_SEG.faccoes.ordem[d - 1]]; return { dominio: { nome: f.nome, tipo: f.tipo }, disputado: tf > 0.25 && tm > 0.25 }; }
  const g = tf >= tm ? GRUPOS[1] : GRUPOS[2];
  return { dominio: { nome: g.nome, tipo: g.tipo }, disputado: tf > 0.25 && tm > 0.25 };
}

function dataTexto(diasAtras: number): string {
  const st = useGame.getState().stats;
  if (!st) return 'hoje';
  if (diasAtras === 0) return 'hoje';
  if (diasAtras === 1) return 'ontem';
  const d = new Date(st.ano, st.mes - 1, st.dia - diasAtras);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function agoraDoJogo() {
  const st = useGame.getState().stats;
  const dow = pedDebug.ler().diaSemana ?? (st ? diaDaSemana(st.ano, st.mes, st.dia) : 6);
  return { hora: ambiente.hora, fds: fimDeSemana(dow), dow, chuva: clima.chuva };
}

// ── lotes → entidades estáticas ───────────────────────────────────────────────────

/** tipo de prédio do arquivo (0 residencial · 1 comercial · 2 industrial · 3 serviço · 4 religioso) */
const NOMES_TIPO = ['residencial', 'comercial', 'industrial', 'serviço', 'religioso'] as const;

export interface MetaLote { lote: number; tipoPredio: 0 | 1 | 2 | 3 | 4; nome: string | null; andares: number; ref: number }
export interface Estaticos { versao: number; construidoEm: number; idx: IndiceCaixas; meta: Map<number, MetaLote>; marcos: Map<number, number>; quiosques: Map<number, Quiosque>; porIndiceKind: Uint8Array }
let estaticos: Estaticos | null = null;

/** Monta (ou reaproveita) o índice de caixas dos prédios e marcos; refaz quando o mundo mudou ou passaram 20 s. */
export function garantirEstaticos(): Estaticos | null {
  const L = mundo.lots, S = mundo.lotState, hm = mundo.hm;
  if (!L.length || !hm) return null;
  const agora = performance.now();
  const wv = useGame.getState().worldVersion;
  if (estaticos && estaticos.versao === wv && agora - estaticos.construidoEm < 20_000) return estaticos;
  const n = Math.min(L.length / LOT_STRIDE, S.length / LOT_STATE_STRIDE);
  const caixas: Caixa[] = [], ids: number[] = [], tipos: number[] = [], kinds: number[] = [];
  const meta = new Map<number, MetaLote>();
  const ocultos = mundo.real ? prediosOcultos(mundo.real) : new Set<number>();
  const nomesMarco = new Set(MARCOS.map((m) => m.chave));
  const tIdx = (t: TipoEntidade) => ['pessoa', 'carro', 'onibus', 'casa', 'predio', 'estabelecimento', 'marco'].indexOf(t);
  for (let i = 0; i < n; i++) {
    const o = i * LOT_STRIDE, so = i * LOT_STATE_STRIDE;
    const arch = S[so + 1];
    if (!arch) continue; // lote vazio: não é entidade (fica com a ficha antiga do lote)
    const ref = L[o + 7] - 1;
    if (ref >= 0 && ocultos.has(ref)) continue; // o marco 3D já representa este prédio
    const pr = ref >= 0 && mundo.real ? predioReal(mundo.real, ref) : null;
    if (pr?.nome && nomesMarco.has(pr.nome)) continue; // vira a entidade do marco, abaixo
    const zona = S[so];
    const tp = (pr ? pr.tipo : zona === Zone.Comercial ? 1 : zona === Zone.Industrial ? 2 : 0) as 0 | 1 | 2 | 3 | 4;
    const andares = Math.max(1, S[so + 3] || pr?.andares || 1);
    const ent: TipoEntidade = tp === 1 || tp === 3 || tp === 4 ? 'estabelecimento' : tp === 2 ? 'predio' : andares <= 3 ? 'casa' : 'predio';
    const h = andares * 3.1 + (andares <= 3 ? 2 : 0.8);
    caixas.push({ x: L[o], y: L[o + 5], z: L[o + 1], yaw: L[o + 2], w: L[o + 3], h, d: L[o + 4] });
    ids.push(ID_BASE_LOTE + i); tipos.push(tIdx(ent)); kinds.push(tp);
    meta.set(ID_BASE_LOTE + i, { lote: i, tipoPredio: tp, nome: pr?.nome ?? null, andares, ref });
  }
  // pontos turísticos: o prédio do OSM (Arcos, Museu, Catedral) ou a coordenada (Cristo, Bondinho, Maracanã)
  const marcos = new Map<number, number>();
  MARCOS.forEach((m, k) => {
    const id = ID_BASE_MARCO + k;
    let caixa: Caixa | null = null;
    if (mundo.real) {
      const an = ancoraMarco(mundo.real, m.chave);
      if (an) caixa = { x: an.x, y: Math.max(0, sampleHeight(hm, an.x, an.z)), z: an.z, yaw: an.angle, w: Math.max(an.w, 12), h: m.h ?? an.andares * 3.1, d: Math.max(an.d, 12) };
      else {
        const pos = posicaoDoPonto(m);
        if (pos) caixa = { x: pos[0], y: Math.max(0, sampleHeight(hm, pos[0], pos[1])), z: pos[1], yaw: 0, w: m.w ?? 30, h: m.h ?? 30, d: m.d ?? 30 };
      }
    }
    if (!caixa) return;
    caixas.push(caixa); ids.push(id); tipos.push(tIdx('marco')); kinds.push(9);
    marcos.set(id, k);
  });
  // quiosques da orla (Fase 31): estabelecimentos com ficha própria (dono, funcionários, faturamento)
  const quiosques = new Map<number, Quiosque>();
  if (mundo.real) for (const q of dadosDaOrla(hm, mundo.real).quiosques) {
    const id = ID_BASE_QUIOSQUE + q.id;
    caixas.push({ x: q.x, y: Math.max(0, sampleHeight(hm, q.x, q.z)), z: q.z, yaw: q.yaw, w: 4, h: 3.4, d: 4 });
    ids.push(id); tipos.push(tIdx('estabelecimento')); kinds.push(1);
    quiosques.set(id, q);
  }
  const idx = new IndiceCaixas(caixas, ids, tipos, 32);
  registro.definirEstaticos(idx, wv);
  estaticos = { versao: wv, construidoEm: agora, idx, meta, marcos, quiosques, porIndiceKind: Uint8Array.from(kinds) };
  return estaticos;
}

// ── fichas ────────────────────────────────────────────────────────────────────────

export interface Posicao { x: number; z: number }
interface Base { id: number; pos: Posicao; bairro: BairroInfo; viva: boolean }
export type Ficha =
  | (Base & { tipo: 'pessoa'; ficha: FichaPessoa; investigacao: 'nao' | 'em_andamento' | 'revelado' | 'inconclusivo'; persona: Persona })
  | (Base & { tipo: 'carro' | 'onibus'; ficha: FichaCarro; velocidadeKmh: number; destino: string; linha: { nome: string; longo: string } | null })
  | (Base & { tipo: 'casa' | 'predio'; ficha: FichaCasa; titulo: string; nome: string | null })
  | (Base & { tipo: 'estabelecimento'; ficha: FichaEstab; endereco: Endereco })
  | (Base & { tipo: 'marco'; dado: MarcoDado; visitantes: number; turismo: DadosTurismo });

/** o que o painel de um ponto turístico mostra além do texto: tudo calculado por `world/turismo.ts` (o mesmo cálculo que decide quantas pessoas aparecem) */
export interface DadosTurismo { ocupacao: number; capacidade: number; hoje: number; nota: number; evento: string | null; pico: string; foraDoMapa: boolean; atividades: { id: string; rotulo: string; n: number }[] }

function enderecoLote(li: number): Endereco {
  const L = mundo.lots, o = li * LOT_STRIDE;
  const b = bairroInfo(L[o], L[o + 1]);
  return { rua: mundo.roads.edges.get(L[o + 6])?.name ?? 'Rua sem nome', numero: numeroEm(L[o], L[o + 1]), bairro: b.nome, regiao: b.regiao };
}

/** Casa de uma pessoa: um prédio residencial ocupado num raio de 700 m, escolhido pela semente. */
function procurarCasa(e: Estaticos, x: number, z: number, sem: number): Endereco | null {
  const lista = e.idx.perto(x, z, 700);
  const S = mundo.lotState;
  const bons: number[] = [];
  for (const i of lista) {
    if (e.porIndiceKind[i] !== 0) continue;
    const m = e.meta.get(e.idx.ids[i]);
    if (m && S[m.lote * LOT_STATE_STRIDE + 7] > 0) bons.push(m.lote);
  }
  if (!bons.length) return null;
  return enderecoLote(bons[Math.floor(sorteio(sem, 90) * bons.length) % bons.length]);
}

function procurarTrabalho(e: Estaticos, x: number, z: number, sem: number): { nome: string; rua: string; bairro: string } | null {
  const lista = e.idx.perto(x, z, 2200);
  const bons: MetaLote[] = [];
  for (const i of lista) { const k = e.porIndiceKind[i]; if (k === 1 || k === 3) { const m = e.meta.get(e.idx.ids[i]); if (m) bons.push(m); } }
  if (!bons.length) return null;
  const m = bons[Math.floor(sorteio(sem, 91) * bons.length) % bons.length];
  const end = enderecoLote(m.lote);
  return { nome: m.nome ?? (m.tipoPredio === 3 ? 'Estabelecimento de serviços' : 'Estabelecimento comercial'), rua: end.rua, bairro: end.bairro };
}

const cachePessoa = new Map<number, FichaPessoa>();

/** Ficha da entidade `id` (null se não existe mais e não há o que mostrar). `snap` = o que já se sabia, para entidades que saíram de cena. */
export function fichaDe(id: number, investigacao: (id: number) => number | undefined = () => undefined): Ficha | null {
  const ag = agoraDoJogo();
  const L = mundo.lots, S = mundo.lotState;
  const est = garantirEstaticos();

  if (id >= ID_BASE_QUIOSQUE && id < ID_BASE_MARCO) {
    const q = est?.quiosques.get(id);
    if (!q) return null;
    const b = bairroInfo(q.x, q.z);
    const end: Endereco = { rua: q.praia === 'ipanema' ? 'Avenida Vieira Souto' : 'Avenida Atlântica', numero: numeroEm(q.x, q.z), bairro: b.nome, regiao: b.regiao };
    // área de atendimento (balcão + mesas na areia) de ~12 × 12 m: a conta de faturamento parte dela
    const f = gerarEstabelecimento({ semente: id, nome: q.nome, tipoPredio: 'comercial', endereco: end, w: 12, d: 12, andares: 1, lv: 75, hora: ag.hora, fimDeSemana: ag.fds, chuva: ag.chuva, dominio: dominioEm(q.x, q.z).dominio });
    return { id, tipo: 'estabelecimento', pos: { x: q.x, z: q.z }, bairro: b, viva: true, ficha: f, endereco: end };
  }
  if (id >= ID_BASE_MARCO) {
    const k = id - ID_BASE_MARCO, m = MARCOS[k];
    const cx = registro.caixaDe(id);
    if (!m || !cx) return null;
    const ct = contextoTurismo();
    const por = new Map<string, number>();
    for (const z of m.zonas) por.set(z.atividade, (por.get(z.atividade) ?? 0) + z.n);
    const ocup = ocupacaoAgora(m, ct), ref = m.eventos ? Math.max(...m.eventos.map((e) => e.ocupacao)) : Math.max(0.001, m.ocupacaoPico);
    const atividades = [...por.entries()].map(([a, n]) => ({ id: a, rotulo: TURISMO.atividades[a]?.rotulo ?? a, n: Math.round(n * Math.min(1, ocup / ref)) })).filter((a) => a.n > 0);
    return {
      id, tipo: 'marco', pos: { x: cx.x, z: cx.z }, bairro: bairroInfo(cx.x, cx.z), viva: true, dado: m, visitantes: visitantesDoPonto(m, ct),
      turismo: { ocupacao: ocup, capacidade: m.capacidade, hoje: visitantesHoje(m, ct), nota: notaDoPonto(m, ct), evento: eventoAgora(m, ct)?.rotulo ?? null, pico: textoPico(m), foraDoMapa: !!m.foraDoMapa, atividades },
    };
  }
  if (id >= ID_BASE_LOTE) {
    const meta = est?.meta.get(id);
    if (!meta) return null;
    const li = meta.lote, o = li * LOT_STRIDE, so = li * LOT_STATE_STRIDE;
    const x = L[o], z = L[o + 1];
    const b = bairroInfo(x, z);
    const end = enderecoLote(li);
    const { dominio, disputado } = dominioEm(x, z);
    const lv = S[so + 6], cobSeg = S[so + 11], crime = S[so + 12], occ = S[so + 7];
    const tipoNome = NOMES_TIPO[meta.tipoPredio];
    const base = { id, pos: { x, z }, bairro: b, viva: true };
    const kind = meta.tipoPredio;
    if (kind === 1 || kind === 3 || kind === 4) {
      const f0 = gerarEstabelecimento({ semente: id, nome: meta.nome, tipoPredio: tipoNome, endereco: end, w: L[o + 3], d: L[o + 4], andares: meta.andares, lv, hora: ag.hora, fimDeSemana: ag.fds, chuva: ag.chuva, dominio });
      // ocorrência grave por perto: o comércio fecha (cena ativa na tela)
      const fechado = comercioFechadoEm(x, z);
      const f = fechado ? { ...f0, aberto: false, clientesAgora: 0, horario: `${f0.horario} (fechado por causa de uma ocorrência na região)` } : f0;
      return { ...base, tipo: 'estabelecimento', ficha: f, endereco: end };
    }
    const f = gerarCasa({ semente: id, endereco: end, tipoPredio: tipoNome, andares: meta.andares, w: L[o + 3], d: L[o + 4], moradores: kind === 0 ? occ : 0, lv, cobSeg, crime, dominio, disputado, nome: meta.nome });
    const casa = kind === 0 && meta.andares <= 3;
    return { ...base, tipo: casa ? 'casa' : 'predio', ficha: f, titulo: f.tipo, nome: meta.nome };
  }

  // dinâmicas: dados vivos do desenho (posição, estado…) + ficha gerada pela semente
  const tipoDin = registro.tipoDinamico(id);
  const cx = registro.caixaDe(id);
  const pessoa = tipoDin === 'pessoa' || registro.tem('fichaPessoa', id) ? 'pessoa' : null;
  if (pessoa) {
    const vivo = registro.vivo('pessoa', id) as { semente: number; persona: Persona; estado: string; atividade: string } | null;
    let ficha = cachePessoa.get(id);
    const ultimo = registro.ler<{ x: number; z: number }>('ultimaPos', id);
    const x = cx?.x ?? ultimo?.x ?? 0, z = cx?.z ?? ultimo?.z ?? 0;
    if (cx) registro.definir('ultimaPos', id, { x, z });
    if (!ficha) {
      if (!vivo || !est) return null;
      const b0 = bairroInfo(x, z);
      const casa = vivo.persona === 'turista' ? null : procurarCasa(est, x, z, vivo.semente);
      // o ambulante trabalha na própria calçada; o trabalhador num comércio/serviço num raio de ~2 km
      const trabalho = vivo.persona === 'trabalhador' ? procurarTrabalho(est, x, z, vivo.semente) : vivo.persona === 'ambulante' ? { nome: 'Barraca ambulante', rua: ruaEm(x, z), bairro: b0.nome } : null;
      // valor do solo, crime e domínio do ponto da casa (ou de onde a pessoa está)
      const ref = casa ? casaPos(casa, est) : { x, z, lv: 40, crime: 0.2 };
      const d = dominioEm(ref.x, ref.z).dominio;
      ficha = gerarPessoa({
        semente: vivo.semente, persona: vivo.persona, agora: { rua: ruaEm(x, z), bairro: b0.nome }, casa, trabalho,
        lvCasa: ref.lv, crimeCasa: ref.crime, dominioCasa: d, hora: ag.hora, fimDeSemana: ag.fds, chuva: ag.chuva,
        estado: vivo.estado, atividade: vivo.atividade, data: dataTexto,
      });
      cachePessoa.set(id, ficha);
      registro.definir('fichaPessoa', id, true);
    }
    // "o que está fazendo agora" muda com o tempo: refaz só o texto e o humor com os dados vivos
    const f = vivo ? { ...ficha, fazendoAgora: textoAgora(ficha, vivo, ruaEm(x, z), bairroInfo(x, z).nome, ag.hora) } : ficha;
    const fim = investigacao(id);
    const inv = registro.ler<'revelado' | 'inconclusivo'>('investigacao', id);
    return { id, tipo: 'pessoa', pos: { x, z }, bairro: bairroInfo(x, z), viva: !!cx && !!vivo, ficha: f, persona: vivo?.persona ?? 'trabalhador', investigacao: inv ?? (fim ? 'em_andamento' : 'nao') };
  }
  if (tipoDin === 'carro' || tipoDin === 'onibus' || registro.tem('fichaCarro', id)) {
    const vivo = (registro.vivo('carro', id) ?? registro.vivo('onibus', id)) as { semente: number; tipoVeiculo: number; velocidade: number; rumo: number; linha?: { nome: string; longo: string } | null; lotacao?: number } | null;
    const ultimo = registro.ler<{ x: number; z: number }>('ultimaPos', id);
    const x = cx?.x ?? ultimo?.x ?? 0, z = cx?.z ?? ultimo?.z ?? 0;
    if (cx) registro.definir('ultimaPos', id, { x, z });
    let ficha = registro.ler<FichaCarro>('fichaCarro', id);
    if (!ficha) {
      if (!vivo) return null;
      ficha = gerarCarro(vivo.semente, vivo.tipoVeiculo, vivo.lotacao ?? 0);
      registro.definir('fichaCarro', id, ficha);
    }
    const sem = vivo?.semente ?? id;
    let destino = registro.ler<string>('destinoCarro', id);
    if (!destino) {
      destino = vivo ? destinoDe(est, x, z, vivo.rumo, sem, vivo.linha) : 'desconhecido';
      registro.definir('destinoCarro', id, destino);
    }
    return { id, tipo: tipoDin === 'onibus' || vivo?.linha ? 'onibus' : 'carro', pos: { x, z }, bairro: bairroInfo(x, z), viva: !!cx && !!vivo, ficha, velocidadeKmh: Math.round((vivo?.velocidade ?? 0) * 3.6), destino, linha: vivo?.linha ?? null };
  }
  return null;
}

function casaPos(end: Endereco, est: Estaticos): { x: number; z: number; lv: number; crime: number } {
  // acha o lote pelo endereço (mesma rua/número entre os candidatos) — só para o valor do solo e o crime do entorno
  const S = mundo.lotState, L = mundo.lots;
  for (const m of est.meta.values()) {
    const o = m.lote * LOT_STRIDE;
    if (numeroEm(L[o], L[o + 1]) === end.numero && (mundo.roads.edges.get(L[o + 6])?.name ?? 'Rua sem nome') === end.rua) return { x: L[o], z: L[o + 1], lv: S[m.lote * LOT_STATE_STRIDE + 6], crime: S[m.lote * LOT_STATE_STRIDE + 12] };
  }
  return { x: 0, z: 0, lv: 40, crime: 0.2 };
}

function textoAgora(f: FichaPessoa, vivo: { estado: string; atividade: string; persona: Persona }, rua: string, bairro: string, hora: number): string {
  void f;
  switch (vivo.estado) {
    case 'esperando ônibus': return `Esperando o ônibus na ${rua}`;
    case 'sentado': return `Sentado(a) descansando — ${bairro}`;
    case 'fugindo': return `Fugindo de uma ocorrência (tiros ou perigo) pela ${rua}`;
    case 'olhando a ocorrência': return `Parado(a), olhando uma ocorrência na ${rua}`;
    case 'comprando': return `Parado(a) em frente a uma loja na ${rua}`;
    case 'trabalhando': return vivo.persona === 'ambulante' ? `Vendendo na calçada da ${rua}` : `Trabalhando na ${rua}`;
    default:
      if (vivo.atividade === 'corre') return `Correndo pela ${rua}`;
      if (vivo.atividade === 'desloca') return hora < 12 ? `A caminho do ${vivo.persona === 'estudante' ? 'colégio' : 'trabalho'}, pela ${rua}` : `Voltando para casa, pela ${rua}`;
      if (vivo.atividade === 'compra') return `Indo às compras pela ${rua}`;
      return `Passeando pela ${rua}`;
  }
}

/** Destino estimado: o tráfego visual não calcula rota, então escolhe um comércio/serviço à frente, na direção em que o veículo anda. */
function destinoDe(est: Estaticos | null, x: number, z: number, rumo: number, sem: number, linha?: { nome: string; longo: string } | null): string {
  if (linha) { const partes = linha.longo.split(/\s+-\s+/); return `${partes[partes.length - 1]} (terminal da linha ${linha.nome})`; }
  if (!est) return 'desconhecido';
  const dx = Math.sin(rumo), dz = Math.cos(rumo), dist = 800 + sorteio(sem, 80) * 1800;
  const cx = x + dx * dist, cz = z + dz * dist;
  const lista = est.idx.perto(cx, cz, 500);
  const bons: MetaLote[] = [];
  for (const i of lista) { const k = est.porIndiceKind[i]; if (k === 1 || k === 3) { const m = est.meta.get(est.idx.ids[i]); if (m) bons.push(m); } }
  if (!bons.length) return `${ruaEm(cx, cz)} — ${bairroInfo(cx, cz).nome}`;
  const m = bons[Math.floor(sorteio(sem, 81) * bons.length) % bons.length];
  const end = enderecoLote(m.lote);
  return `${m.nome ? m.nome + ' — ' : ''}${end.rua}, ${end.numero} — ${end.bairro}`;
}

/** Aplica o resultado de uma investigação (60% de chance de revelar; senão fica inconclusiva e dá para tentar de novo). */
export function concluirInvestigacao(id: number): 'revelado' | 'inconclusivo' {
  const res = sorteio(id, 500 + (registro.ler<number>('tentativas', id) ?? 0)) < 0.6 ? 'revelado' : 'inconclusivo';
  registro.definir('tentativas', id, (registro.ler<number>('tentativas', id) ?? 0) + 1);
  if (res === 'revelado') registro.definir('investigacao', id, 'revelado');
  return res;
}

export const limparCachePessoas = () => { cachePessoa.clear(); };
