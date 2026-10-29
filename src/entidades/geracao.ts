/**
 * Geração das fichas (Fase 25): funções PURAS que transformam (semente da entidade + o que o mundo diz dela) em dados
 * para o painel. A mesma semente dá sempre a mesma pessoa. Nada aqui lê o Three.js, o Worker ou o store: quem chama
 * (contexto.ts) levanta os fatos do mundo e entrega como argumento. Dados em `src/data/entidades.json`.
 */
import { PRENOMES, SOBRENOMES } from '../data/nomes';
import dados from '../data/entidades.json';
import { PONTOS, visitantesDoPonto, type Contexto, type PontoTuristico } from '../world/turismo';
import { hash01 } from '../sim/core/rng';

export type Persona = 'trabalhador' | 'estudante' | 'aposentado' | 'turista' | 'esportista' | 'ambulante';
export interface Endereco { rua: string; numero: number; bairro: string; regiao: string }
export interface Dominio { nome: string; tipo: 'facção' | 'milícia' }

/** sorteio determinístico: o k-ésimo número de uma semente */
export const sorteio = (sem: number, k: number): number => hash01(((sem | 0) ^ Math.imul(k + 1, 0x9e3779b1)) >>> 0);
const escolher = <T,>(a: readonly T[], sem: number, k: number): T => a[Math.floor(sorteio(sem, k) * a.length) % a.length];
const faixa = (sem: number, k: number, a: number, b: number) => a + (b - a) * sorteio(sem, k);

export const SALARIO_MINIMO = dados.salarioMinimo.valor;

/** Classe social pela renda (múltiplos do salário mínimo) */
export function classeDaRenda(renda: number): { id: string; nome: string; sm: number } {
  const sm = renda / SALARIO_MINIMO;
  const c = dados.classes.find((k) => sm <= k.ateSM) ?? dados.classes[dados.classes.length - 1];
  return { id: c.id, nome: c.nome, sm };
}

export const nomeCompleto = (sem: number, k = 0) => `${escolher(PRENOMES, sem, k)} ${escolher(SOBRENOMES, sem, k + 1)} ${escolher(SOBRENOMES, sem, k + 2)}`;

// ── região ───────────────────────────────────────────────────────────────────────

const REGIAO_DE_BAIRRO = new Map<string, string>();
for (const [reg, lista] of Object.entries(dados.regioes)) for (const b of lista) REGIAO_DE_BAIRRO.set(b, reg);

/** Zona Sul / Norte / Centro / Oeste do bairro (lista do arquivo; fora dela, pela posição no mapa). */
export function regiaoDoBairro(bairro: string | null, x: number, z: number): string {
  const r = bairro ? REGIAO_DE_BAIRRO.get(bairro) : undefined;
  if (r) return r;
  if (x < dados.regiaoFallback.oeste) return 'Zona Oeste';
  if (z < dados.regiaoFallback.norte) return 'Zona Norte';
  return 'Zona Sul';
}
/** Região pela Área de Planejamento e Região Administrativa do IPP (Censo): AP1 Centro (menos São Cristóvão), AP2 Zona Sul (Tijuca/Vila Isabel = Norte), AP3 Norte, AP4–5 Oeste. */
export function regiaoPorAP(ap: string, ra: string): string {
  if (ap === '1') return ra === 'SAO CRISTOVAO' ? 'Zona Norte' : 'Centro';
  if (ap === '2') return ra === 'TIJUCA' || ra === 'VILA ISABEL' ? 'Zona Norte' : 'Zona Sul';
  if (ap === '3') return 'Zona Norte';
  return 'Zona Oeste';
}
/** fator de preço do m² por região (Zona Sul cara, Norte barata) */
const PRECO_REGIAO: Record<string, number> = { 'Zona Sul': 1.8, Centro: 0.9, 'Zona Norte': 0.75, 'Zona Oeste': 1.0, 'Niterói (outro município)': 1.1 };

// ── pessoa ───────────────────────────────────────────────────────────────────────

export interface EntradaPessoa {
  semente: number; persona: Persona;
  /** onde a pessoa está agora */
  agora: { rua: string; bairro: string };
  casa: Endereco | null; trabalho: { nome: string; rua: string; bairro: string } | null;
  /** valor do solo (0–100), crime (0–1) e domínio do território do bairro de moradia */
  lvCasa: number; crimeCasa: number; dominioCasa: Dominio | null;
  hora: number; fimDeSemana: boolean; chuva: number;
  /** 'andando' | 'esperando ônibus' | … e a atividade da rotina */
  estado: string; atividade: string;
  /** texto das datas do histórico: i = 0 hoje, 1 ontem… */
  data: (diasAtras: number) => string;
}

export interface FichaPessoa {
  nome: string; idade: number; profissao: string;
  renda: number; classe: { id: string; nome: string; sm: number };
  humor: { id: string; rotulo: string; emoji: string; motivo: string };
  casa: Endereco | null; trabalho: EntradaPessoa['trabalho']; moradia: string;
  fazendoAgora: string;
  faccao: Dominio | null;
  /** flag oculta: só o painel mostra depois de uma investigação */
  criminoso: boolean; crimes: string[];
  historico: { quando: string; texto: string }[];
}

const IDADES: Record<Persona, [number, number]> = { trabalhador: [22, 62], estudante: [12, 24], aposentado: [62, 88], turista: [20, 70], esportista: [18, 55], ambulante: [20, 62] };

const CRIMES = ['furto de celular', 'receptação', 'tráfico de drogas (varejo)', 'porte ilegal de arma', 'assalto a pedestre', 'extorsão de comerciantes', 'roubo de carga', 'agiotagem'];

export function humorDe(e: Pick<EntradaPessoa, 'semente' | 'persona' | 'hora' | 'chuva' | 'crimeCasa' | 'dominioCasa' | 'fimDeSemana' | 'estado'>): FichaPessoa['humor'] {
  // pontuação: 0 = péssimo … 1 = ótimo
  let p = 0.55 + (sorteio(e.semente, 50) - 0.5) * 0.45;
  const motivos: string[] = [];
  if (e.chuva > 0.3) { p -= 0.12; motivos.push('chuva'); }
  if (e.fimDeSemana && e.persona !== 'ambulante') { p += 0.12; motivos.push('fim de semana'); }
  if ((e.hora >= 6 && e.hora < 8) || (e.hora >= 17 && e.hora < 19.5)) { if (e.persona === 'trabalhador' || e.persona === 'estudante') { p -= 0.1; motivos.push('horário de pico'); } }
  if (e.estado === 'esperando ônibus') { p -= 0.1; motivos.push('esperando o ônibus'); }
  if (e.persona === 'turista') { p += 0.15; motivos.push('de passeio'); }
  if (e.persona === 'esportista') { p += 0.1; motivos.push('depois do exercício'); }
  let medo = e.crimeCasa * 0.5 + (e.dominioCasa ? 0.3 : 0);
  if (e.hora >= 22 || e.hora < 5) medo += 0.15;
  p -= medo * 0.25;
  const tabela = dados.humor as { id: string; rotulo: string; emoji: string }[];
  const pick = (id: string, motivo?: string) => { const h = tabela.find((x) => x.id === id)!; return { ...h, motivo: motivo ?? (motivos.join(', ') || 'rotina') }; };
  if (medo > 0.45 && sorteio(e.semente, 51) < 0.6) return pick('com_medo', e.dominioCasa ? `área dominada por ${e.dominioCasa.nome}` : 'a vizinhança é perigosa');
  if (p > 0.75) return pick('animado');
  if (p > 0.55) return pick('tranquilo');
  if (p > 0.42) return pick(e.hora >= 17 ? 'cansado' : 'preocupado');
  if (p > 0.3) return pick('estressado');
  return pick('irritado');
}

export function gerarPessoa(e: EntradaPessoa): FichaPessoa {
  const s = e.semente;
  const [a, b] = IDADES[e.persona];
  const idade = Math.round(faixa(s, 2, a, b));
  const prof = escolher((dados.profissoes as unknown as Record<string, { nome: string; renda: [number, number] }[]>)[e.persona], s, 3);
  // o valor do solo do bairro puxa a renda: bairro nobre, renda maior (±15%)
  const renda = Math.round((prof.renda[0] + (prof.renda[1] - prof.renda[0]) * sorteio(s, 4)) * (0.85 + e.lvCasa / 330) / 10) * 10;
  const faccao = e.dominioCasa && idade >= 16 && idade <= 45 && sorteio(s, 5) < 0.055 ? e.dominioCasa : null;
  const criminoso = faccao ? sorteio(s, 6) < 0.75 : sorteio(s, 6) < 0.012 + e.crimeCasa * 0.03;
  const crimes = criminoso ? [escolher(CRIMES, s, 7), ...(sorteio(s, 8) < 0.4 ? [escolher(CRIMES, s, 9)] : [])] : [];
  const humor = humorDe(e);
  const moradia = e.persona === 'turista' ? 'Hospedado(a) em hotel da região' : e.casa ? `${e.casa.rua}, ${e.casa.numero} — ${e.casa.bairro} (${e.casa.regiao})` : 'sem endereço fixo';
  const agoraTexto = (() => {
    switch (e.estado) {
      case 'esperando ônibus': return `Esperando o ônibus na ${e.agora.rua}`;
      case 'sentado': return `Sentado(a) descansando, ${e.agora.bairro}`;
      case 'comprando': return `Parado(a) em frente a uma loja na ${e.agora.rua}`;
      case 'trabalhando': return e.persona === 'ambulante' ? `Vendendo na calçada da ${e.agora.rua}` : `Trabalhando na ${e.agora.rua}`;
      default:
        if (e.atividade === 'corre') return `Correndo pela ${e.agora.rua}`;
        if (e.atividade === 'desloca') return e.hora < 12 ? `A caminho do ${e.persona === 'estudante' ? 'colégio' : 'trabalho'}, pela ${e.agora.rua}` : `Voltando para casa, pela ${e.agora.rua}`;
        if (e.atividade === 'compra') return `Indo às compras pela ${e.agora.rua}`;
        return `Passeando pela ${e.agora.rua}`;
    }
  })();
  const base = (dados.historico as Record<string, string[]>)[e.persona];
  const hist: { quando: string; texto: string }[] = [];
  const horasBase = [7.2, 12.4, 18.5, 19.8];
  for (let i = 0; i < 4; i++) {
    const dia = i < 2 ? 0 : i - 1;
    const h = horasBase[i] + sorteio(s, 20 + i) * 0.8;
    hist.push({ quando: `${e.data(dia)}, ${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`, texto: escolher(base, s, 30 + i) });
  }
  return {
    nome: nomeCompleto(s, 10), idade, profissao: prof.nome, renda, classe: classeDaRenda(renda), humor,
    casa: e.casa, trabalho: e.persona === 'trabalhador' || e.persona === 'ambulante' ? e.trabalho : null, moradia,
    fazendoAgora: agoraTexto, faccao, criminoso, crimes, historico: hist,
  };
}

// ── casa / prédio ─────────────────────────────────────────────────────────────────

export interface EntradaCasa {
  semente: number; endereco: Endereco; tipoPredio: 'residencial' | 'comercial' | 'industrial' | 'serviço' | 'religioso';
  andares: number; w: number; d: number; moradores: number; lv: number; cobSeg: number; crime: number; dominio: Dominio | null; disputado: boolean;
  /** renda média do bairro (do Censo/IPP) se houver — senão a classe sai do valor do solo */
  nome: string | null;
}
export interface FichaCasa {
  tipo: string; endereco: Endereco; andares: number; moradores: number; idades: number[]; classe: string; seguranca: { nivel: string; valor: number };
  dominio: string; valor: number; areaPiso: number;
}

/** bônus ao valor do solo pela região (o Rio é desigual: o mesmo valor do solo pesa mais na Zona Sul) */
const BONUS_CLASSE: Record<string, number> = { 'Zona Sul': 25, 'Niterói (outro município)': 10, Centro: 0, 'Zona Norte': -5, 'Zona Oeste': 5 };
const classePorLv = (lv: number) => (lv > 78 ? 'A' : lv > 62 ? 'B' : lv > 42 ? 'C' : lv > 25 ? 'D' : 'E');

export function gerarCasa(e: EntradaCasa): FichaCasa {
  const area = Math.round(e.w * e.d * Math.max(1, e.andares) * 0.82);
  const tipo = e.tipoPredio === 'residencial' ? (e.andares <= 3 ? 'Casa' : `Prédio residencial (${e.andares} andares)`) : `Prédio ${e.tipoPredio}`;
  const preco = (3200 + e.lv * 150) * (PRECO_REGIAO[e.endereco.regiao] ?? 1);
  // moradores em domicílios de 1–5 pessoas, com adultos e crianças
  const idades: number[] = [];
  let sobra = e.moradores, dom = 0;
  while (sobra > 0 && idades.length < 400) {
    const tam = Math.min(sobra, 1 + Math.floor(sorteio(e.semente, 100 + dom) * 4.6));
    const adultos = Math.max(1, Math.min(tam, 1 + Math.floor(sorteio(e.semente, 200 + dom) * 2)));
    for (let k = 0; k < tam; k++) idades.push(k < adultos ? Math.round(faixa(e.semente, 300 + dom * 7 + k, 22, 72)) : Math.round(faixa(e.semente, 300 + dom * 7 + k, 1, 17)));
    sobra -= tam; dom++;
  }
  const valorSeg = Math.max(0, Math.min(1, e.cobSeg * 0.6 + (1 - e.crime) * 0.4 - (e.dominio ? 0.25 : 0)));
  return {
    tipo, endereco: e.endereco, andares: e.andares, moradores: e.moradores, idades, classe: classePorLv(e.lv + (BONUS_CLASSE[e.endereco.regiao] ?? 0)),
    seguranca: { nivel: valorSeg > 0.62 ? 'Alto' : valorSeg > 0.4 ? 'Médio' : 'Baixo', valor: valorSeg },
    dominio: e.disputado ? 'Área em disputa entre facção e milícia' : e.dominio ? `${e.dominio.nome} (${e.dominio.tipo})` : 'Estado (sem domínio criminoso)',
    valor: Math.round((area * preco) / 1000) * 1000, areaPiso: area,
  };
}

// ── estabelecimento ───────────────────────────────────────────────────────────────

export interface EntradaEstab {
  semente: number; nome: string | null; tipoPredio: string; endereco: Endereco; w: number; d: number; andares: number; lv: number;
  hora: number; fimDeSemana: boolean; chuva: number; dominio: Dominio | null;
}
export interface FichaEstab {
  nome: string; tipo: string; dono: string; funcionarios: number; clientesAgora: number; horario: string; aberto: boolean;
  faturamentoMes: number; taxa: { paga: boolean; para: string | null; valorMes: number };
}

const REGEX_ESTAB = (dados.estabelecimentos as { re: string }[]).map((x) => new RegExp(x.re, 'i'));

export function tipoDeEstabelecimento(nome: string | null) {
  if (nome) for (let i = 0; i < REGEX_ESTAB.length; i++) if (REGEX_ESTAB[i].test(nome)) return dados.estabelecimentos[i];
  return dados.estabelecimentoPadrao;
}

const fmtHora = (h: number) => (h >= 24 ? '24h' : `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`);

export function gerarEstabelecimento(e: EntradaEstab): FichaEstab {
  const t = tipoDeEstabelecimento(e.nome);
  const area = e.w * e.d * Math.max(1, Math.min(2, e.andares));
  const [abre, fecha] = t.abre as [number, number];
  const hora = e.hora;
  const aberto = fecha >= 24 && abre === 0 ? true : hora >= abre && hora < fecha && (e.fimDeSemana ? t.tipo !== 'Banco' && t.tipo !== 'Escola' : true);
  const funcionarios = Math.max(1, Math.round(area * t.func * (0.8 + sorteio(e.semente, 1) * 0.5)));
  // clientes agora: ocupação por m² × movimento da hora (pico no almoço e fim da tarde), só se estiver aberto
  const movimento = aberto ? 0.35 + 0.65 * Math.max(Math.exp(-((hora - 12.5) ** 2) / 3), Math.exp(-((hora - 18) ** 2) / 4)) : 0;
  const clientes = Math.round((area / 18) * movimento * (e.fimDeSemana ? (t.tipo === 'Bar/Restaurante' ? 1.4 : 0.8) : 1) * (1 - e.chuva * 0.25) * (0.8 + sorteio(e.semente, 2) * 0.4));
  const fat = Math.round((area * t.porM2 * (0.7 + e.lv / 120)) / 100) * 100;
  const taxaProb = e.dominio ? (e.dominio.tipo === 'milícia' ? 0.9 : 0.6) : 0.02;
  const paga = sorteio(e.semente, 3) < taxaProb && t.tipo !== 'Escola' && t.tipo !== 'Saúde' && t.tipo !== 'Templo religioso';
  const tipoNome = t.tipo;
  return {
    nome: e.nome ?? `${tipoNome} (sem nome no mapa)`, tipo: tipoNome, dono: nomeCompleto(e.semente, 40),
    funcionarios, clientesAgora: clientes, horario: abre === 0 && fecha >= 24 ? '24 horas' : `${fmtHora(abre)} às ${fmtHora(fecha)}`, aberto,
    faturamentoMes: fat, taxa: { paga, para: paga && e.dominio ? e.dominio.nome : paga ? 'grupo local' : null, valorMes: paga ? Math.round((fat * (e.dominio?.tipo === 'milícia' ? 0.1 : 0.06)) / 10) * 10 : 0 },
  };
}

// ── carro ─────────────────────────────────────────────────────────────────────────

export interface FichaCarro { modelo: string; tipo: string; motorista: { nome: string; idade: number } | null; passageiros: number }

export function gerarCarro(semente: number, tipoVeiculo: number, lotacaoOnibus = 0): FichaCarro {
  const modelos = (dados.modelos as Record<string, string[]>)[String(tipoVeiculo)] ?? ['Veículo'];
  const rotulo = (dados.tiposVeiculo as Record<string, string>)[String(tipoVeiculo)] ?? 'civil';
  const motorista = { nome: nomeCompleto(semente, 60), idade: Math.round(faixa(semente, 63, 21, 64)) };
  return { modelo: escolher(modelos, semente, 61), tipo: rotulo, motorista, passageiros: tipoVeiculo === 1 || tipoVeiculo === 9 ? lotacaoOnibus : tipoVeiculo === 2 ? Math.floor(sorteio(semente, 64) * 1.6) : Math.floor(sorteio(semente, 64) * 3.2) };
}

// ── ponto turístico ───────────────────────────────────────────────────────────────

export type MarcoDado = PontoTuristico;
/** pontos turísticos (Fase 31: `src/data/turismo/pontos.json`, com capacidade, horário de pico, eventos e zonas de atividade) */
export const MARCOS: MarcoDado[] = PONTOS;

/** movimento do dia de um ponto turístico (0–1): manhã e começo da tarde */
export const curvaTurismo = (hora: number) => {
  const pts: [number, number][] = [[0, 0], [6, 0], [7.5, 0.1], [9, 0.65], [11, 1], [14, 0.9], [17, 0.45], [19, 0.12], [22, 0], [24, 0]];
  for (let i = 1; i < pts.length; i++) if (hora <= pts[i][0]) { const [h0, f0] = pts[i - 1], [h1, f1] = pts[i]; return f0 + ((f1 - f0) * (hora - h0)) / (h1 - h0); }
  return 0;
};

/** pessoas no ponto agora: capacidade × ocupação (evento do dia, curva de pico, fim de semana, chuva); `semente` dá ±10% de variação entre pontos */
export function visitantesAgora(m: MarcoDado, hora: number, fimDeSemana: boolean, chuva: number, semente: number, extra: Partial<Contexto> = {}): number {
  const v = visitantesDoPonto(m, { hora, diaSemana: fimDeSemana ? 6 : 2, mes: 6, chuva, ...extra });
  return Math.round(v * (0.9 + sorteio(semente, 70) * 0.2));
}
