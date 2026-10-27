/**
 * Atores além da Assembleia (Fase 6): prefeitos das maiores cidades da UF, o Presidente da República
 * e a imprensa (TV, jornal, portal, blog, influenciador e grupo de WhatsApp) — todos FICTÍCIOS.
 * Dados puros guardados no Estado; o passo mensal ajusta relações, publica a pesquisa do
 * Instituto Pulso e calcula o "amplificador" que a imprensa aplica sobre as notícias.
 */
import { Rng, seedFromString } from '../core/rng';
import { PARTIDOS, type IdPartido } from '../politica/dados';
import { gerarPessoa, type Pessoa, type Postura } from '../politica/politica';

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

export interface Prefeito extends Pessoa {
  cidadeGov: string;
  populacao: number;
  partido: IdPartido;
  relacao: number;
  ambicao: number;
  capital: boolean;
  /** R$ repassados em convênios no mandato */
  convenios: number;
}

export type Alinhamento = 'aliado' | 'neutro' | 'opositor';
export interface Presidente extends Pessoa {
  partido: IdPartido;
  alinhamento: Alinhamento;
  relacao: number;
  /** popularidade do Presidente na UF (0–100) */
  popularidade: number;
}

export type TipoVeiculo = 'tv' | 'jornal' | 'portal' | 'blog' | 'influencer' | 'zap';
export interface Veiculo {
  id: TipoVeiculo;
  nome: string;
  /** −1 (oposição) a 1 (governista) — linha editorial */
  vies: number;
  alcance: number;
  credibilidade: number;
  /** humor com o governo (−1 a 1) */
  humor: number;
  rosto: Pessoa & { funcao: string };
}

export interface Pesquisa { data: string; aprovacao: number; margem: number; otimoBom: number; regular: number; ruimPessimo: number }

export interface EstadoAtores {
  prefeitos: Prefeito[];
  presidente: Presidente;
  imprensa: Veiculo[];
  pesquisas: Pesquisa[];
  /** verba mensal de publicidade oficial (R$) */
  publicidade: number;
  /** meses restantes de Força Nacional no estado */
  forcaNacional: number;
  /** meses restantes de decreto de calamidade (habilita socorro federal) */
  calamidade: number;
  /** R$ de convênios com prefeituras a pagar no próximo mês */
  conveniosAPagar: number;
  ultimaColetiva: number;
  ultimoConvenioFederal: number;
  /** pedidos à União já atendidos neste mandato (rótulos) */
  pedidos: string[];
  /** relação com o Presidente na posse (as verbas variam a partir dela) */
  relFederal0: number;
}

const VEICULOS: { id: TipoVeiculo; nome: string; vies: number; alcance: number; cred: number; funcao: string; bordoes: string[] }[] = [
  { id: 'tv', nome: 'TV Guará', vies: 0, alcance: 0.9, cred: 0.7, funcao: 'âncora do telejornal da noite', bordoes: ['Boa noite. Começa agora o Guará Notícias.', 'O telespectador quer resposta, governador.'] },
  { id: 'jornal', nome: 'O Pregoeiro', vies: -0.15, alcance: 0.4, cred: 0.85, funcao: 'colunista política', bordoes: ['Fontes do Palácio confirmam à coluna…', 'O governo ainda não disse a que veio.'] },
  { id: 'portal', nome: 'Plantão N27', vies: 0, alcance: 0.75, cred: 0.6, funcao: 'editor-chefe', bordoes: ['Urgente: acompanhe ao vivo.', 'A notícia em primeira mão.'] },
  { id: 'blog', nome: 'Holofote Investiga', vies: -0.5, alcance: 0.25, cred: 0.8, funcao: 'repórter investigativo', bordoes: ['Siga o dinheiro.', 'Temos documentos.'] },
  { id: 'influencer', nome: '@vozdaquebrada', vies: 0, alcance: 0.5, cred: 0.3, funcao: 'influenciador digital', bordoes: ['Gente, vocês não vão acreditar nisso aqui…', 'Compartilha antes que apaguem!'] },
  { id: 'zap', nome: 'Grupo "Família Unida 🇧🇷🙏"', vies: -0.3, alcance: 0.6, cred: 0.15, funcao: 'administradora do grupo', bordoes: ['Recebi de um amigo da polícia, confirmem!!', 'Repassem para todos os grupos 🙏'] },
];

export interface ParamsAtores { sigla: string; cidades: string[]; populacoes: number[]; posturas: Record<IdPartido, Postura> }

export function criarAtores(par: ParamsAtores): EstadoAtores {
  const rng = new Rng(seedFromString(`ATORES:${par.sigla}`));
  const partidos = Object.keys(PARTIDOS) as IdPartido[];
  const prefeitos: Prefeito[] = par.cidades.slice(0, 8).map((cidade, i) => {
    const p = gerarPessoa(rng, [cidade], ['Prefeitura não é palanque.', 'Minha cidade em primeiro lugar.', 'Sem verba, sem obra, governador.', 'O povo daqui não esquece quem ajudou.'], [38, 70]);
    const partido = partidos[rng.int(0, partidos.length - 1)];
    const post = par.posturas[partido];
    // o prefeito da capital costuma ser de outro grupo e sonhar com o Palácio
    const capital = i === 0;
    const rel0 = (post === 'base' ? 0.35 : post === 'independente' ? 0 : -0.35) + (capital ? -0.15 : 0) + rng.range(-0.2, 0.2);
    return { ...p, cidade, cidadeGov: cidade, populacao: par.populacoes[i] ?? 0, partido, relacao: clamp(rel0, -1, 1), ambicao: clamp(rng.range(0.2, 0.9) + (capital ? 0.2 : 0), 0, 1), capital, convenios: 0 };
  });
  const r = rng.next();
  const alinhamento: Alinhamento = r < 0.4 ? 'aliado' : r < 0.75 ? 'neutro' : 'opositor';
  const pres = gerarPessoa(rng, ['Brasília'], ['O Brasil não pode parar.', 'Governo federal é parceiro de quem trabalha.', 'Vou resolver isso pessoalmente.'], [52, 74]);
  const presidente: Presidente = {
    ...pres, cidade: par.cidades[0] ?? 'Brasília', partido: partidos[rng.int(0, partidos.length - 1)], alinhamento,
    relacao: alinhamento === 'aliado' ? 0.5 : alinhamento === 'neutro' ? 0 : -0.45, popularidade: rng.range(35, 60),
  };
  const imprensa: Veiculo[] = VEICULOS.map((v) => {
    const rosto = gerarPessoa(rng, par.cidades.length ? par.cidades : ['Capital'], v.bordoes, [28, 66]);
    const vies = v.id === 'influencer' ? (rng.chance(0.5) ? 0.5 : -0.5) : v.vies;
    return { id: v.id, nome: v.nome, vies, alcance: v.alcance, credibilidade: v.cred, humor: clamp(vies * 0.4 + 0.15, -1, 1), rosto: { ...rosto, funcao: v.funcao } };
  });
  return { prefeitos, presidente, imprensa, pesquisas: [], publicidade: 0, forcaNacional: 0, calamidade: 0, conveniosAPagar: 0, ultimaColetiva: -1, ultimoConvenioFederal: -99, pedidos: [], relFederal0: presidente.relacao };
}

/** Quanto a imprensa amplifica notícias ruins (> 0 = hostil). Média pelo alcance de −humor. */
export function amplificador(a: EstadoAtores): number {
  let s = 0, w = 0;
  for (const v of a.imprensa) { s += -v.humor * v.alcance * (0.5 + v.credibilidade); w += v.alcance * (0.5 + v.credibilidade); }
  return w ? s / w : 0;
}

/** Fator sobre as transferências voluntárias da União (convênios). */
export const fatorFederal = (a: EstadoAtores) => 1 + 0.12 * (a.presidente.relacao - a.relFederal0);

export interface ContextoAtores {
  mesIndex: number; mes: number; ano: number; data: string;
  aprovacao: number;
  escandalos: number;
  /** escala de dinheiro (RCL / R$ 40 bi) */
  escala: number;
  posturas: Record<IdPartido, Postura>;
  rng: Rng;
  noticia: (texto: string, tom: 'bom' | 'ruim' | 'alerta' | 'info', chave: string, cooldownDias: number) => void;
}

export function atoresMensal(a: EstadoAtores, ctx: ContextoAtores): { choques: { valor: number; meia: number }[] } {
  const out: { choques: { valor: number; meia: number }[] } = { choques: [] };
  const { rng, noticia } = ctx;
  // prefeitos
  for (const p of a.prefeitos) {
    const post = ctx.posturas[p.partido];
    let alvo = (post === 'base' ? 0.35 : post === 'independente' ? 0 : -0.35) + (ctx.aprovacao - 50) / 150 + Math.min(0.3, p.convenios / (40e6 * ctx.escala) * 0.1);
    // ano pré-eleitoral: o prefeito ambicioso da capital vira rival
    if (p.capital && p.ambicao > 0.65 && ctx.ano >= 2029) alvo -= 0.35;
    p.relacao = clamp(p.relacao + (alvo - p.relacao) * 0.05, -1, 1);
  }
  const capital = a.prefeitos[0];
  if (capital && capital.ambicao > 0.65 && ctx.ano === 2029 && ctx.mes === 3) {
    noticia(`${capital.nome}, prefeito(a) de ${capital.cidadeGov}, não esconde: "Em 2030 o povo vai escolher quem trabalha". Bastidores dão como certa a candidatura ao governo.`, 'alerta', 'prefRival', 0);
  }
  // Presidente
  const P = a.presidente;
  const base = P.alinhamento === 'aliado' ? 0.45 : P.alinhamento === 'neutro' ? 0 : -0.4;
  P.relacao = clamp(P.relacao + (base - P.relacao) * 0.04, -1, 1);
  P.popularidade = clamp(P.popularidade + rng.range(-1.5, 1.5) + (50 - P.popularidade) * 0.02, 10, 85);
  if (a.forcaNacional > 0) {
    a.forcaNacional--;
    if (a.forcaNacional === 0) noticia('Tropas da Força Nacional deixam o estado ao fim da missão. Especialistas cobram plano de longo prazo.', 'info', `fnFim${ctx.mesIndex}`, 0);
  }
  if (a.calamidade > 0) a.calamidade--;
  // imprensa: linha editorial + popularidade + escândalos + verba de publicidade (não compra o blog)
  const pub = clamp(a.publicidade / (3e6 * ctx.escala), 0, 1);
  for (const v of a.imprensa) {
    const compra = v.id === 'blog' ? -0.15 * pub : v.id === 'jornal' ? 0.05 * pub : 0.3 * pub;
    const alvo = v.vies * 0.4 + (ctx.aprovacao - 50) / 80 - (v.id === 'blog' ? 0.25 : 0.12) * ctx.escandalos + compra;
    v.humor = clamp(v.humor + (alvo - v.humor) * 0.1, -1, 1);
  }
  if (a.publicidade > 4e6 * ctx.escala && rng.chance(0.08)) {
    noticia(`${a.imprensa.find((v) => v.id === 'blog')!.nome} revela: governo gastou milhões com propaganda em perfis e portais amigos. "Publicidade ou compra de apoio?", pergunta o blog.`, 'ruim', 'publiEsc', 120);
    out.choques.push({ valor: -2.5, meia: 4 });
  }
  // pesquisa do Instituto Pulso (mensal; margem de 2,5 pontos)
  const g = Math.sqrt(-2 * Math.log(Math.max(1e-9, rng.next()))) * Math.cos(2 * Math.PI * rng.next());
  const ap = clamp(ctx.aprovacao + g * 1.3, 1, 99);
  const otimo = clamp(ap * 0.62, 1, 90), ruim = clamp((100 - ap) * 0.72, 1, 95);
  const pq: Pesquisa = { data: ctx.data, aprovacao: ap, margem: 2.5, otimoBom: otimo, ruimPessimo: ruim, regular: Math.max(0, 100 - otimo - ruim) };
  const ant = a.pesquisas[0];
  a.pesquisas.unshift(pq);
  a.pesquisas = a.pesquisas.slice(0, 24);
  if (ant && Math.abs(pq.aprovacao - ant.aprovacao) >= 4) {
    const subiu = pq.aprovacao > ant.aprovacao;
    noticia(`Pesquisa Instituto Pulso: aprovação do governador ${subiu ? 'sobe' : 'cai'} para ${Math.round(pq.aprovacao)}% (antes ${Math.round(ant.aprovacao)}%; margem de 2,5 pontos).`, subiu ? 'bom' : 'ruim', `pulso${ctx.mesIndex}`, 0);
  }
  return out;
}

/** Presidente eleito em outubro (toma posse em 1º de janeiro). */
export function novoPresidente(sigla: string, ano: number, cidade: string): Presidente {
  const rng = new Rng(seedFromString(`PRES:${sigla}:${ano}`));
  const partidos = Object.keys(PARTIDOS) as IdPartido[];
  const r = rng.next();
  const alinhamento: Alinhamento = r < 0.4 ? 'aliado' : r < 0.75 ? 'neutro' : 'opositor';
  const p = gerarPessoa(rng, ['Brasília'], ['O Brasil voltou a sonhar.', 'Governo de todos os brasileiros.', 'Reconstruir o país, estado por estado.'], [50, 72]);
  return { ...p, cidade, partido: partidos[rng.int(0, partidos.length - 1)], alinhamento, relacao: alinhamento === 'aliado' ? 0.4 : alinhamento === 'neutro' ? 0 : -0.35, popularidade: rng.range(48, 62) };
}
