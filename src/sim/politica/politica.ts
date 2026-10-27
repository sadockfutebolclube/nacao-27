/**
 * Política estadual (Fase 5): gabinete de secretários, Assembleia Legislativa com deputados e bancadas,
 * votações nominais, negociação de votos por cartas, escândalos → CPI, e pedido de impeachment.
 *
 * Tudo é dado puro (JSON) guardado dentro do Estado: salva/carrega sem reconstrução e o snapshot
 * enviado à interface é o próprio objeto. As funções aqui recebem o RNG da simulação (determinismo).
 */
import { hash01, hash32, Rng, seedFromString } from '../core/rng';
import {
  BANCADAS, BORDOES_SECRETARIO, cadeirasALE, CARGOS, composicaoBancadas, FORMACOES, PARTIDOS,
  type Cargo, type Eixo, type Eixos, type IdBancada, type IdPartido,
} from './dados';

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const sigm = (x: number) => 1 / (1 + Math.exp(-x));

// ── Nomes ────────────────────────────────────────────────────────────────────────

const NOMES_F = ['Maria', 'Ana', 'Francisca', 'Juliana', 'Adriana', 'Márcia', 'Aline', 'Patrícia', 'Sandra', 'Cleide', 'Rosângela', 'Iracema', 'Valdirene', 'Raimunda', 'Luciana', 'Simone', 'Fátima', 'Conceição', 'Tereza', 'Débora', 'Kátia', 'Solange', 'Eliane', 'Socorro', 'Marlene', 'Jaqueline', 'Rita', 'Vera', 'Cristiane', 'Lúcia'];
const NOMES_M = ['José', 'João', 'Antônio', 'Carlos', 'Paulo', 'Edson', 'Severino', 'Jurandir', 'Josué', 'Railson', 'Wesley', 'Marcelo', 'Roberto', 'Sebastião', 'Valdemar', 'Gilberto', 'Reinaldo', 'Ademir', 'Nivaldo', 'Odair', 'Wellington', 'Cláudio', 'Fernando', 'Ronaldo', 'Gerson', 'Otávio', 'Hamilton', 'Raimundo', 'Benedito', 'Altair'];
const SOBRENOMES = ['Silva', 'Santos', 'Oliveira', 'Souza', 'Lima', 'Pereira', 'Ferreira', 'Costa', 'Rodrigues', 'Almeida', 'Nascimento', 'Carvalho', 'Araújo', 'Ribeiro', 'Gomes', 'Barbosa', 'Rocha', 'Moraes', 'Cavalcanti', 'Bezerra', 'Albuquerque', 'Teixeira', 'Campos', 'Macedo', 'Brandão', 'Siqueira', 'Pacheco', 'Fontes', 'Queiroz', 'Medeiros', 'Vasconcelos', 'Andrade', 'Tavares', 'Prado', 'Leitão', 'Bittencourt', 'Coutinho', 'Marinho', 'Nóbrega', 'Pimentel'];
const APELIDOS_AGRO = ['Gado', 'Leite', 'Café', 'Cacau', 'Soja', 'Açude', 'Trator', 'Milho', 'Boi'];
const APELIDOS = ['Tico', 'Bené', 'Dudu', 'Nenê', 'Zezinho', 'Bia', 'Cacá', 'Tuca', 'Neném', 'Juca'];

export interface Pessoa {
  nome: string;
  genero: 'f' | 'm';
  idade: number;
  cidade: string;
  /** semente do retrato procedural */
  retrato: number;
  bordao: string;
}

export function gerarPessoa(rng: Rng, cidades: string[], bordoes: string[], idade: [number, number]): Pessoa {
  const genero: 'f' | 'm' = rng.chance(0.36) ? 'f' : 'm';
  const prenome = (genero === 'f' ? NOMES_F : NOMES_M)[rng.int(0, 29)];
  const s1 = SOBRENOMES[rng.int(0, SOBRENOMES.length - 1)];
  let s2 = SOBRENOMES[rng.int(0, SOBRENOMES.length - 1)];
  if (s2 === s1) s2 = SOBRENOMES[(SOBRENOMES.indexOf(s1) + 7) % SOBRENOMES.length];
  return {
    nome: `${prenome} ${s1} ${s2}`, genero, idade: rng.int(idade[0], idade[1]),
    cidade: cidades[Math.min(cidades.length - 1, Math.floor(Math.pow(rng.next(), 1.6) * cidades.length))],
    retrato: hash32(rng.int(0, 2 ** 30)), bordao: bordoes[rng.int(0, bordoes.length - 1)],
  };
}

/** Nome de urna: título da bancada + prenome (ou apelido). */
function nomeDeUrna(rng: Rng, p: Pessoa, bancada: IdBancada): string {
  const b = BANCADAS[bancada];
  const prenome = p.nome.split(' ')[0], sobrenome = p.nome.split(' ')[1];
  let titulo = b.titulos[rng.int(0, b.titulos.length - 1)];
  // concordância de gênero dos títulos
  const fem: Record<string, string> = { Delegado: 'Delegada', Pastor: 'Pastora', Professor: 'Professora', 'Dr.': 'Dra.', Irmão: 'Irmã', Engenheiro: 'Engenheira', Empresário: 'Empresária', Doutor: 'Doutora', Prefeito: 'Prefeita', Companheiro: 'Companheira', Inspetor: 'Inspetora', Tio: 'Tia' };
  const masc: Record<string, string> = Object.fromEntries(Object.entries(fem).map(([m, f]) => [f, m]));
  if (p.genero === 'f' && fem[titulo]) titulo = fem[titulo];
  if (p.genero === 'm' && masc[titulo]) titulo = masc[titulo];
  if (p.genero === 'f' && ['Coronel', 'Capitão', 'Sargento', 'Cabo', 'Bispo', 'Apóstolo', 'Zé do', 'Tonho do', 'Zé do Sindicato'].includes(titulo)) titulo = bancada === 'bala' ? 'Delegada' : bancada === 'evangelica' ? 'Missionária' : '';
  if (p.genero === 'm' && ['Missionária', 'Enfermeira', 'Bióloga'].includes(titulo)) titulo = bancada === 'evangelica' ? 'Pastor' : 'Dr.';
  if (titulo === 'Zé do' || titulo === 'Tonho do') return `${titulo} ${APELIDOS_AGRO[rng.int(0, APELIDOS_AGRO.length - 1)]}`;
  if (titulo === 'Zé do Sindicato') return titulo;
  if (!titulo) return rng.chance(0.25) ? `${APELIDOS[rng.int(0, APELIDOS.length - 1)]} ${sobrenome}` : `${prenome} ${sobrenome}`;
  return rng.chance(0.5) ? `${titulo} ${prenome}` : `${titulo} ${prenome} ${sobrenome}`;
}

// ── Tipos ────────────────────────────────────────────────────────────────────────

export type Carta = 'emenda' | 'obra' | 'cargo' | 'apoio' | 'ameaca' | 'tecnico';
export type Postura = 'base' | 'independente' | 'oposicao';

export interface Favor { projeto: string; valor: number; ate: number }
export interface Promessa { tipo: 'obra' | 'apoio'; desde: number; obraUid?: number; resolvida?: boolean }

export interface Deputado extends Pessoa {
  id: number;
  urna: string;
  partido: IdPartido;
  bancada: IdBancada;
  /** −1 (esquerda) a 1 (direita) */
  ideologia: number;
  /** peso político (líderes, veteranos) 0,3–1 */
  influencia: number;
  /** quanto o voto depende de recursos e cargos 0–1 */
  fisiologismo: number;
  /** abertura a argumentos técnicos 0–1 */
  tecnico: number;
  /** oculto: telhado de vidro (vulnerável a pressão) 0–1 */
  telhado: number;
  /** relação com o governo −1 a 1 */
  relacao: number;
  mandatos: number;
  favores: Favor[];
  /** cartas já usadas: "carta:projeto" (ou "carta:ano" para as gerais) */
  cartas: string[];
  promessas: Promessa[];
}

export type PerfilSecretario = 'tecnico' | 'politico' | 'confianca';
export interface Secretario extends Pessoa {
  cargo: Cargo;
  perfil: PerfilSecretario;
  partido: IdPartido | null;
  formacao: string;
  /** 0–1: multiplica o efeito do gasto da pasta */
  competencia: number;
  /** oculto: 0–1 (baixo = risco de escândalo) */
  honestidade: number;
  lealdade: number;
  /** ambição eleitoral 0–1 (sai em abril do ano de eleição para concorrer) */
  ambicao: number;
  desde: number;
  interino?: boolean;
}

export type TipoProjeto = 'loa' | 'pec-previdencia' | 'credito' | 'cpi' | 'impeachment';
export type Quorum = 'simples' | '3/5' | '2/3' | '1/3';
export interface Projeto {
  id: string;
  tipo: TipoProjeto;
  titulo: string;
  descricao: string;
  quorum: Quorum;
  eixos: Eixos;
  /** o governo quer que a medida passe ('sim') ou caia ('nao') */
  governoQuer: 'sim' | 'nao';
  /** gravidade (CPI/impeachment): aumenta a adesão contra o governo */
  gravidade: number;
  votaEm: number;
  dataVotacao: string;
  ref?: { valor?: number; credor?: string; cargo?: Cargo; escandalo?: number };
}

export interface Votacao { titulo: string; data: string; sim: number; nao: number; aprovado: boolean; governoVenceu: boolean }

export interface Escandalo {
  id: number;
  cargo: Cargo;
  secretario: string;
  tipo: string;
  desde: number;
  fase: 'imprensa' | 'cpi' | 'encerrado';
  gravidade: number;
  /** o secretário ainda estava no cargo quando estourou */
  noCargo: boolean;
}

export interface CPI { id: number; escandalo: number; tema: string; assinaturas: number; inicio: number; fim: number; status: 'instalada' | 'engavetada' | 'concluida'; desfecho?: string }

export interface EstadoPolitico {
  cadeiras: number;
  deputados: Deputado[];
  presidenteALE: number;
  posturas: Record<IdPartido, Postura>;
  secretarios: Record<Cargo, Secretario>;
  /** candidatos oferecidos para um cargo vago/em troca (gerados sob demanda e guardados) */
  candidatos: Partial<Record<Cargo, Secretario[]>>;
  capital: number;
  pauta: Projeto[];
  votacoes: Votacao[];
  escandalos: Escandalo[];
  cpis: CPI[];
  /** cargos de 2º escalão loteados (aumenta risco de escândalo) */
  loteamento: number;
  /** R$ de emendas negociadas ainda por pagar */
  emendasAPagar: number;
  afastado: { data: string; motivo: string } | null;
  nextId: number;
  mesaEleita: number;
}

export const CARTAS: Record<Carta, { nome: string; desc: string; capital: number; porProjeto: boolean }> = {
  emenda: { nome: 'Emenda parlamentar', desc: 'Recurso para a base eleitoral do deputado. Paga pelo Tesouro no mês seguinte.', capital: 0, porProjeto: false },
  obra: { nome: 'Obra no reduto', desc: 'O Estado licita uma obra na cidade do deputado. Se parar, ele cobra.', capital: 0, porProjeto: false },
  cargo: { nome: 'Cargo no 2º escalão', desc: 'Uma diretoria para um indicado. Não custa dinheiro — custa risco de escândalo.', capital: 2, porProjeto: false },
  apoio: { nome: 'Apoio eleitoral', desc: 'Promessa de palanque na próxima eleição. Será cobrada.', capital: 8, porProjeto: true },
  ameaca: { nome: 'Pressão', desc: 'Lembrar o deputado de assuntos que ele prefere esquecer. Pode vazar.', capital: 6, porProjeto: true },
  tecnico: { nome: 'Convencimento técnico', desc: 'A Casa Civil apresenta números e estudos. Funciona com quem lê.', capital: 3, porProjeto: true },
};

// ── Geração ──────────────────────────────────────────────────────────────────────

function sortearPonderado<T>(rng: Rng, itens: [T, number][]): T {
  const tot = itens.reduce((s, [, w]) => s + w, 0);
  let r = rng.next() * tot;
  for (const [v, w] of itens) { r -= w; if (r <= 0) return v; }
  return itens[itens.length - 1][0];
}

export function gerarSecretario(rng: Rng, cargo: Cargo, perfil: PerfilSecretario, cidades: string[], mesIndex: number, partido: IdPartido | null = null): Secretario {
  const p = gerarPessoa(rng, cidades, BORDOES_SECRETARIO[perfil], [34, 68]);
  const forms = FORMACOES[cargo];
  const base = {
    tecnico: { comp: [0.62, 0.92], hon: [0.55, 0.98], leal: [0.35, 0.7], amb: [0.05, 0.4] },
    politico: { comp: [0.3, 0.65], hon: [0.2, 0.85], leal: [0.3, 0.75], amb: [0.4, 0.95] },
    confianca: { comp: [0.42, 0.75], hon: [0.4, 0.9], leal: [0.75, 0.98], amb: [0.15, 0.6] },
  }[perfil];
  return {
    ...p, cargo, perfil, partido,
    formacao: (perfil === 'politico' && partido ? `indicação do ${PARTIDOS[partido].sigla}; ` : '') + forms[rng.int(0, forms.length - 1)][p.genero === 'f' ? 1 : 0],
    competencia: rng.range(base.comp[0], base.comp[1]), honestidade: rng.range(base.hon[0], base.hon[1]),
    lealdade: rng.range(base.leal[0], base.leal[1]), ambicao: rng.range(base.amb[0], base.amb[1]), desde: mesIndex,
  };
}

export interface ParamsPolitica {
  sigla: string; regiao: string; complexidade: number; cidades: string[];
  /** semente (nova legislatura) e posturas herdadas (governo reeleito) */
  semente?: string;
  posturas?: Record<IdPartido, Postura>;
}

/** Monta a ALE e o gabinete inicial. Mesma UF ⇒ mesma Assembleia (semente da UF). */
export function criarPolitica(par: ParamsPolitica): EstadoPolitico {
  const rng = new Rng(seedFromString(par.semente ?? `ALE:${par.sigla}`));
  const n = cadeirasALE(par.sigla);
  const comp = composicaoBancadas(par.regiao, par.complexidade);
  const totComp = Object.values(comp).reduce((a, b) => a + b, 0);
  // cadeiras por bancada (maiores restos)
  const ids = Object.keys(comp) as IdBancada[];
  const quotas = ids.map((b) => (comp[b] / totComp) * n);
  const cad = quotas.map(Math.floor);
  const ordem = ids.map((_, i) => i).sort((a, b) => (quotas[b] - cad[b]) - (quotas[a] - cad[a]));
  for (let k = 0; cad.reduce((a, b) => a + b, 0) < n; k++) cad[ordem[k % ids.length]]++;

  // postura dos partidos na largada: a coligação vencedora é a base; oposição ideológica do outro lado
  const posturas = {} as Record<IdPartido, Postura>;
  const ladoGoverno = rng.chance(0.5) ? -1 : 1; // governo eleito de centro-esquerda ou centro-direita
  for (const pt of Object.values(PARTIDOS)) {
    const dist = Math.abs(pt.ideologia - ladoGoverno * 0.35);
    posturas[pt.id] = par.posturas?.[pt.id] ?? (pt.fisiologismo > 0.75 ? 'base' : dist < 0.45 ? 'base' : dist < 0.85 ? 'independente' : 'oposicao');
  }

  const deputados: Deputado[] = [];
  let id = 1;
  ids.forEach((b, bi) => {
    for (let k = 0; k < cad[bi]; k++) {
      const banc = BANCADAS[b];
      const partido = sortearPonderado(rng, banc.partidos);
      const pt = PARTIDOS[partido];
      const p = gerarPessoa(rng, par.cidades, banc.bordoes, [28, 72]);
      const postura = b === 'oposicao' ? 'oposicao' : posturas[partido];
      const rel0 = postura === 'base' ? 0.45 : postura === 'independente' ? 0.02 : -0.55;
      deputados.push({
        ...p, id: id++, urna: '', partido, bancada: b,
        ideologia: clamp(pt.ideologia + rng.range(-0.25, 0.25), -1, 1),
        influencia: clamp(0.3 + Math.pow(rng.next(), 2) * 0.7, 0.3, 1),
        fisiologismo: clamp(pt.fisiologismo + rng.range(-0.2, 0.2) + (b === 'centrao' ? 0.15 : 0), 0, 1),
        tecnico: clamp(rng.range(0.1, 0.8) + (b === 'empresarial' || b === 'ambientalista' ? 0.15 : 0), 0, 1),
        telhado: rng.next(),
        relacao: clamp(rel0 + rng.range(-0.25, 0.25), -1, 1),
        mandatos: 1 + Math.floor(Math.pow(rng.next(), 2) * 6),
        favores: [], cartas: [], promessas: [],
      });
      const d = deputados[deputados.length - 1];
      d.urna = nomeDeUrna(rng, d, b);
    }
  });
  // presidente da ALE: veterano influente do centrão
  const cand = deputados.filter((d) => d.bancada === 'centrao').sort((a, b) => b.influencia * b.mandatos - a.influencia * a.mandatos);
  const presidente = (cand[0] ?? deputados[0]);
  presidente.influencia = 1;
  presidente.mandatos = Math.max(presidente.mandatos, 4);

  const secretarios = {} as Record<Cargo, Secretario>;
  for (const c of CARGOS) {
    // gabinete de transição: técnicos nas pastas finalísticas, gente de confiança no núcleo político
    const perfil: PerfilSecretario = c.id === 'casaCivil' || c.id === 'cultura' ? 'confianca' : c.id === 'infraestrutura' || c.id === 'transporte' ? 'politico' : 'tecnico';
    const partidoBase = perfil === 'politico' ? (Object.keys(posturas) as IdPartido[]).filter((k) => posturas[k] === 'base')[rng.int(0, 1)] ?? null : null;
    secretarios[c.id] = gerarSecretario(rng, c.id, perfil, par.cidades, 0, partidoBase);
  }

  return {
    cadeiras: n, deputados, presidenteALE: presidente.id, posturas, secretarios, candidatos: {},
    capital: 40, pauta: [], votacoes: [], escandalos: [], cpis: [], loteamento: 0, emendasAPagar: 0,
    afastado: null, nextId: 1, mesaEleita: 0,
  };
}

// ── Votação ──────────────────────────────────────────────────────────────────────

export interface ContextoVoto { aprovacao: number; bonus?: number }

/** Desvio do "humor do dia" no plenário (o voto é u + ruído normal com este desvio). */
const SIGMA = 0.32;
/** Choque comum a todo o plenário (clima do dia, rua cheia, vazamento de última hora). */
const CHOQUE_PLENARIO = 0.3;
const normal = (rng: Rng) => Math.sqrt(-2 * Math.log(Math.max(1e-9, rng.next()))) * Math.cos(2 * Math.PI * rng.next());

function favorEm(d: Deputado, projeto: string): number {
  let f = 0;
  for (const x of d.favores) if (x.projeto === projeto || x.projeto === '*') f += x.valor;
  return f;
}

/** Propensão (contínua) do deputado a votar COM o governo neste projeto. */
export function propensao(pol: EstadoPolitico, d: Deputado, p: Projeto, ctx: ContextoVoto): number {
  const b = BANCADAS[d.bancada];
  const pres = pol.deputados.find((x) => x.id === pol.presidenteALE);
  const pauta = 0.15 * (pres?.relacao ?? 0); // presidente controla a pauta e o ritmo
  const humor = d.fisiologismo * (ctx.aprovacao - 50) / 40; // o centrão segue a popularidade
  const ruido = (hash01(d.id * 92821 + hash32(seedFromString(p.id))) - 0.5) * 0.5;
  let u: number;
  if (p.tipo === 'cpi') u = 1.3 * d.relacao - 0.7 * p.gravidade + 0.35 + 0.5 * humor + (d.bancada === 'oposicao' ? -0.6 : 0);
  else if (p.tipo === 'impeachment') u = 1.5 * d.relacao + (ctx.aprovacao - 40) / 22 - 0.8 * p.gravidade + 0.7;
  else {
    u = 1.6 * d.relacao + 0.15 + humor;
    for (const e of Object.keys(p.eixos) as Eixo[]) u += (b.pesos[e] ?? 0) * (p.eixos[e] ?? 0);
    // ninguém quer a digital num aumento de imposto, num rombo ou num corte de direitos de servidor
    u -= 0.3 * Math.max(0, p.eixos.impostos ?? 0) + 0.2 * Math.max(0, p.eixos.deficit ?? 0) - 0.35 * Math.min(0, p.eixos.servidores ?? 0);
    if (d.bancada === 'oposicao') u -= 0.35;
  }
  const fav = favorEm(d, p.id) * (d.bancada === 'oposicao' ? 0.5 : 1);
  return u + fav + pauta + ruido + (ctx.bonus ?? 0);
}

export function votosNecessarios(q: Quorum, n: number): number {
  return q === '3/5' ? Math.ceil(0.6 * n) : q === '2/3' ? Math.ceil((2 * n) / 3) : q === '1/3' ? Math.ceil(n / 3) : Math.floor(n / 2) + 1;
}

export type Intencao = 'sim' | 'nao' | 'indeciso';
export interface Placar {
  /** votos (ou assinaturas) a favor da MEDIDA */
  aFavor: number; contra: number; indecisos: number;
  necessarios: number;
  /** probabilidade de a medida passar */
  chance: number;
  /** probabilidade de o governo sair vencedor */
  chanceGoverno: number;
  intencoes: Record<number, Intencao>;
}

/** Placar previsto e chance (aproximação normal da soma de Bernoullis). Puro. */
export function placar(pol: EstadoPolitico, p: Projeto, ctx: ContextoVoto): Placar {
  const us = pol.deputados.map((d) => propensao(pol, d, p, ctx));
  let aFavor = 0, contra = 0, ind = 0;
  const intencoes: Record<number, Intencao> = {};
  pol.deputados.forEach((d, i) => {
    const pg = sigm((1.7 * us[i]) / SIGMA);
    const pm = p.governoQuer === 'sim' ? pg : 1 - pg;
    const it: Intencao = pm > 0.7 ? 'sim' : pm < 0.3 ? 'nao' : 'indeciso';
    intencoes[d.id] = it;
    if (it === 'sim') aFavor++; else if (it === 'nao') contra++; else ind++;
  });
  const need = votosNecessarios(p.quorum, pol.cadeiras);
  // o clima do plenário é comum a todos: integra sobre ele (Gauss–Hermite, 3 pontos)
  let chance = 0;
  for (const [z, w] of [[-1.7320508, 1 / 6], [0, 2 / 3], [1.7320508, 1 / 6]] as const) {
    let mu = 0, v = 0;
    for (const u of us) {
      const pg = sigm((1.7 * (u + z * CHOQUE_PLENARIO)) / SIGMA);
      const pm = p.governoQuer === 'sim' ? pg : 1 - pg;
      mu += pm; v += pm * (1 - pm);
    }
    const zz = (mu - (need - 0.5)) / Math.sqrt(Math.max(0.25, v));
    chance += w / (1 + Math.exp(-1.702 * zz));
  }
  return { aFavor, contra, indecisos: ind, necessarios: need, chance, chanceGoverno: p.governoQuer === 'sim' ? chance : 1 - chance, intencoes };
}

/** Votação nominal: sorteia o voto de cada deputado. */
export function votar(pol: EstadoPolitico, p: Projeto, ctx: ContextoVoto, rng: Rng): { aFavor: number; contra: number; aprovado: boolean; governoVenceu: boolean } {
  let aFavor = 0;
  const clima = CHOQUE_PLENARIO * normal(rng);
  for (const d of pol.deputados) {
    const u = propensao(pol, d, p, ctx) + clima;
    const comGoverno = u + SIGMA * normal(rng) > 0;
    if (comGoverno === (p.governoQuer === 'sim')) aFavor++;
  }
  const aprovado = aFavor >= votosNecessarios(p.quorum, pol.cadeiras);
  const governoVenceu = aprovado === (p.governoQuer === 'sim');
  const contra = pol.cadeiras - aFavor;
  pol.votacoes.unshift({ titulo: p.titulo, data: p.dataVotacao, sim: aFavor, nao: contra, aprovado, governoVenceu });
  pol.votacoes = pol.votacoes.slice(0, 30);
  pol.capital = clamp(pol.capital + (governoVenceu ? 4 : -6), 0, 100);
  // quem votou contra o governo numa derrota se fortalece; favores daquele projeto se consomem
  for (const d of pol.deputados) d.favores = d.favores.filter((f) => f.projeto !== p.id);
  pol.pauta = pol.pauta.filter((x) => x.id !== p.id);
  return { aFavor, contra, aprovado, governoVenceu };
}

// ── Negociação ───────────────────────────────────────────────────────────────────

export interface ContextoNegociacao { mesIndex: number; ano: number; rng: Rng; escala: number; competenciaCasaCivil: number }
export interface ResultadoCarta {
  ok: boolean;
  msg: string;
  /** R$ a pagar (emenda) */
  custo?: number;
  /** obra a licitar no reduto */
  obra?: { nome: string; custo: number; meses: number; deputado: number };
  /** escândalo de pressão vazada: choque de aprovação */
  vazou?: boolean;
}

export function custoCarta(d: Deputado, carta: Carta, escala: number): number {
  if (carta === 'emenda') return Math.round((1.5 + 4 * d.influencia) * 1e6 * escala / 1e5) * 1e5;
  if (carta === 'obra') return Math.round((12 + 30 * d.influencia) * 1e6 * escala / 1e6) * 1e6;
  return 0;
}

export function chaveCarta(carta: Carta, projeto: string | null, ano: number): string {
  return CARTAS[carta].porProjeto ? `${carta}:${projeto}` : `${carta}:${ano}`;
}

/** Aplica uma carta de negociação a um deputado. Muta `pol`; dinheiro e obra ficam a cargo do Estado. */
export function negociar(pol: EstadoPolitico, depId: number, carta: Carta, projeto: string | null, ctx: ContextoNegociacao): ResultadoCarta {
  const d = pol.deputados.find((x) => x.id === depId);
  if (!d) return { ok: false, msg: 'Deputado não encontrado' };
  const def = CARTAS[carta];
  if (def.porProjeto && !projeto) return { ok: false, msg: 'Escolha a votação para esta negociação' };
  if (def.porProjeto && !pol.pauta.some((p) => p.id === projeto)) return { ok: false, msg: 'Essa votação não está mais na pauta' };
  const chave = chaveCarta(carta, projeto, ctx.ano);
  if (d.cartas.includes(chave)) return { ok: false, msg: def.porProjeto ? 'Já usou essa carta com este deputado nesta votação' : `Já usou essa carta com ${d.urna} este ano` };
  if (pol.capital < def.capital) return { ok: false, msg: `Capital político insuficiente (precisa de ${def.capital})` };
  pol.capital -= def.capital;
  d.cartas.push(chave);
  const ate = ctx.mesIndex + 12;
  const fis = d.fisiologismo;
  switch (carta) {
    case 'emenda': {
      const custo = custoCarta(d, 'emenda', ctx.escala);
      d.favores.push({ projeto: '*', valor: 0.3 + 0.6 * fis, ate });
      d.relacao = clamp(d.relacao + 0.04 + 0.1 * fis, -1, 1);
      pol.emendasAPagar += custo;
      return { ok: true, msg: `${d.urna} agradece a emenda para ${d.cidade}.`, custo };
    }
    case 'obra': {
      const custo = custoCarta(d, 'obra', ctx.escala);
      d.favores.push({ projeto: '*', valor: 0.45 + 0.5 * fis, ate: ctx.mesIndex + 18 });
      d.relacao = clamp(d.relacao + 0.12, -1, 1);
      d.promessas.push({ tipo: 'obra', desde: ctx.mesIndex });
      const tipos = ['Pavimentação', 'Hospital regional', 'Escola técnica', 'Ponte', 'Ginásio poliesportivo', 'Adutora'];
      const t = tipos[hash32(d.id + ctx.ano) % tipos.length];
      return { ok: true, msg: `${t} em ${d.cidade}: ${d.urna} já marcou a inauguração na agenda.`, obra: { nome: `${t} em ${d.cidade} (pedido de ${d.urna})`, custo, meses: 8 + Math.round(custo / ctx.escala / 4e6), deputado: d.id } };
    }
    case 'cargo': {
      d.favores.push({ projeto: '*', valor: 0.35 + 0.6 * fis, ate });
      d.relacao = clamp(d.relacao + 0.08, -1, 1);
      pol.loteamento++;
      return { ok: true, msg: `Indicado de ${d.urna} assume uma diretoria no Detran.` };
    }
    case 'apoio': {
      d.favores.push({ projeto: projeto!, valor: 0.55, ate });
      d.relacao = clamp(d.relacao + 0.08, -1, 1);
      d.promessas.push({ tipo: 'apoio', desde: ctx.mesIndex });
      return { ok: true, msg: `Acordo fechado: ${d.urna} terá o governador no palanque.` };
    }
    case 'ameaca': {
      if (d.telhado > 0.55) {
        d.favores.push({ projeto: projeto!, valor: 1.2, ate });
        d.relacao = clamp(d.relacao - 0.2, -1, 1);
        return { ok: true, msg: `${d.urna} entendeu o recado.` };
      }
      d.relacao = clamp(d.relacao - 0.5, -1, 1);
      return { ok: false, msg: `${d.urna} gravou a conversa e foi à imprensa.`, vazou: true };
    }
    case 'tecnico': {
      const chance = clamp(0.15 + 0.45 * ctx.competenciaCasaCivil + 0.35 * d.tecnico - (d.bancada === 'oposicao' ? 0.25 : 0), 0.05, 0.9);
      if (ctx.rng.chance(chance)) {
        d.favores.push({ projeto: projeto!, valor: 0.6, ate });
        d.relacao = clamp(d.relacao + 0.03, -1, 1);
        return { ok: true, msg: `${d.urna} se convenceu com os números da Casa Civil.` };
      }
      return { ok: false, msg: `${d.urna} ouviu, agradeceu e não mudou de ideia.` };
    }
  }
}

/** Entrega uma secretaria a um partido: o bloco inteiro se aproxima, mas a pasta perde qualidade técnica. */
export function cederSecretaria(pol: EstadoPolitico, partido: IdPartido, cargo: Cargo, rng: Rng, mesIndex: number, cidades: string[]): { ok: boolean; msg: string } {
  if (cargo === 'casaCivil') return { ok: false, msg: 'A Casa Civil não se negocia' };
  if (pol.secretarios[cargo].partido === partido) return { ok: false, msg: 'O partido já comanda essa pasta' };
  if (pol.capital < 5) return { ok: false, msg: 'Capital político insuficiente (precisa de 5)' };
  pol.capital -= 5;
  const antigo = pol.secretarios[cargo];
  pol.secretarios[cargo] = gerarSecretario(rng, cargo, 'politico', cidades, mesIndex, partido);
  for (const d of pol.deputados) if (d.partido === partido) {
    d.relacao = clamp(d.relacao + 0.3, -1, 1);
    d.favores.push({ projeto: '*', valor: 0.35, ate: mesIndex + 12 });
  }
  if (pol.posturas[partido] !== 'base') pol.posturas[partido] = pol.posturas[partido] === 'oposicao' ? 'independente' : 'base';
  return { ok: true, msg: `${PARTIDOS[partido].nome} assume a pasta de ${CARGOS.find((c) => c.id === cargo)!.nome}. ${antigo.nome} deixa o governo.` };
}

/** Três nomes para um cargo: um técnico, um político da base e alguém de confiança. */
export function candidatosPara(pol: EstadoPolitico, cargo: Cargo, rng: Rng, mesIndex: number, cidades: string[]): Secretario[] {
  const ja = pol.candidatos[cargo];
  if (ja) return ja;
  const base = (Object.keys(pol.posturas) as IdPartido[]).filter((k) => pol.posturas[k] === 'base');
  const lista = [
    gerarSecretario(rng, cargo, 'tecnico', cidades, mesIndex),
    gerarSecretario(rng, cargo, 'politico', cidades, mesIndex, base[rng.int(0, Math.max(0, base.length - 1))] ?? 'CDF'),
    gerarSecretario(rng, cargo, 'confianca', cidades, mesIndex),
  ];
  pol.candidatos[cargo] = lista;
  return lista;
}

export function nomear(pol: EstadoPolitico, cargo: Cargo, indice: number, mesIndex: number): { ok: boolean; msg: string } {
  const c = pol.candidatos[cargo]?.[indice];
  if (!c) return { ok: false, msg: 'Candidato indisponível' };
  const atual = pol.secretarios[cargo];
  const custo = atual.interino ? 0 : 3;
  if (pol.capital < custo) return { ok: false, msg: `Capital político insuficiente (trocar um secretário custa ${custo})` };
  pol.capital -= custo;
  // demitir alguém indicado por um partido irrita a bancada do partido
  if (atual.partido && !atual.interino && c.partido !== atual.partido) for (const d of pol.deputados) if (d.partido === atual.partido) d.relacao = clamp(d.relacao - 0.15, -1, 1);
  if (c.partido) for (const d of pol.deputados) if (d.partido === c.partido) { d.relacao = clamp(d.relacao + 0.2, -1, 1); d.favores.push({ projeto: '*', valor: 0.25, ate: mesIndex + 12 }); }
  pol.secretarios[cargo] = { ...c, desde: mesIndex };
  delete pol.candidatos[cargo];
  // um escândalo ainda na imprensa perde força quando o secretário cai
  for (const e of pol.escandalos) if (e.cargo === cargo && e.fase === 'imprensa') e.noCargo = false;
  return { ok: true, msg: `${c.nome} assume ${CARGOS.find((x) => x.id === cargo)!.nome}.` };
}

// ── Passo mensal ─────────────────────────────────────────────────────────────────

export interface ContextoPoliticoMes {
  mesIndex: number; ano: number; mes: number; data: string;
  aprovacao: number;
  rng: Rng;
  noticia: (texto: string, tom: 'bom' | 'ruim' | 'alerta' | 'info', chave: string, cooldownDias: number) => void;
  cidades: string[];
  /** fatores para o pedido de impeachment */
  atrasoSalarial: boolean; pessoalAcimaLRF: boolean;
  /** obras de deputados: concluídas e paradas neste mês */
  obrasConcluidas: number[]; obrasParadas: number[];
}

const TIPOS_ESCANDALO = [
  'superfaturamento em contrato emergencial',
  'nomeação de parentes em cargos comissionados',
  'uso do helicóptero oficial para ir a uma festa',
  'fura-fila de cirurgia para aliados',
  'áudio vazado negociando "comissão" com empreiteira',
  'contrato sem licitação com empresa de fachada',
];

export interface SaidaMensal {
  choques: { valor: number; meia: number; grupo?: 'servidores' | 'empresariado' | 'classeMedia' | 'baixaRenda' }[];
  /** projetos que foram a voto neste mês e seu resultado */
  resolvidos: { projeto: Projeto; aprovado: boolean; governoVenceu: boolean; aFavor: number; contra: number }[];
}

export function politicaMensal(pol: EstadoPolitico, ctx: ContextoPoliticoMes): SaidaMensal {
  const out: SaidaMensal = { choques: [], resolvidos: [] };
  if (pol.afastado) return out;
  const { rng, noticia } = ctx;
  const nomeCargo = (c: Cargo) => CARGOS.find((x) => x.id === c)!.nome;

  // favores vencem; relação deriva para a postura do partido, a popularidade e as pastas que o partido tem
  const pastas: Partial<Record<IdPartido, number>> = {};
  for (const s of Object.values(pol.secretarios)) if (s.partido) pastas[s.partido] = (pastas[s.partido] ?? 0) + 1;
  for (const d of pol.deputados) {
    d.favores = d.favores.filter((f) => f.ate > ctx.mesIndex);
    const post = d.bancada === 'oposicao' ? 'oposicao' : pol.posturas[d.partido];
    const alvo = (post === 'base' ? 0.4 : post === 'independente' ? 0 : -0.5) + (0.5 + d.fisiologismo) * (ctx.aprovacao - 50) / 120 + 0.12 * Math.min(2, pastas[d.partido] ?? 0);
    d.relacao = clamp(d.relacao + (alvo - d.relacao) * 0.04, -1, 1);
    for (const pr of d.promessas) {
      if (pr.resolvida || pr.obraUid === undefined) continue;
      if (ctx.obrasConcluidas.includes(pr.obraUid)) {
        pr.resolvida = true;
        d.relacao = clamp(d.relacao + 0.25, -1, 1);
        noticia(`${d.urna} inaugura obra em ${d.cidade} ao lado do governador: "Promessa feita, promessa cumprida!"`, 'bom', `inaug${pr.obraUid}`, 0);
      } else if (ctx.obrasParadas.includes(pr.obraUid) && ctx.mesIndex - pr.desde > 8) {
        pr.resolvida = true;
        d.relacao = clamp(d.relacao - 0.35, -1, 1);
        noticia(`${d.urna} sobe à tribuna para cobrar a obra parada em ${d.cidade}: "O governo me enganou".`, 'ruim', `cobra${pr.obraUid}`, 0);
      }
    }
  }

  // capital político: popularidade e Casa Civil
  const cc = pol.secretarios.casaCivil;
  pol.capital = clamp(pol.capital + 1 + (ctx.aprovacao - 45) / 15 + (cc.competencia - 0.5) * 2, 0, 100);
  // emendas negociadas são pagas no mês seguinte (o Estado lê e zera)

  // ── gabinete ──
  for (const s of Object.values(pol.secretarios)) {
    if (s.interino) continue;
    const meses = ctx.mesIndex - s.desde;
    // escândalo
    const temEsc = pol.escandalos.some((e) => e.cargo === s.cargo && e.fase !== 'encerrado');
    const pEsc = Math.pow(1 - s.honestidade, 2) * 0.012 * (1 + 0.15 * pol.loteamento) * (s.perfil === 'politico' ? 1.4 : 1);
    if (!temEsc && meses > 2 && rng.chance(pEsc)) {
      const tipo = TIPOS_ESCANDALO[rng.int(0, TIPOS_ESCANDALO.length - 1)];
      const grav = 0.6 + (1 - s.honestidade) * 0.9;
      pol.escandalos.push({ id: pol.nextId++, cargo: s.cargo, secretario: s.nome, tipo, desde: ctx.mesIndex, fase: 'imprensa', gravidade: grav, noCargo: true });
      noticia(`EXCLUSIVO: ${s.nome}, secretário(a) de ${nomeCargo(s.cargo)}, é acusado(a) de ${tipo}. Oposição fala em CPI.`, 'ruim', `esc${s.cargo}${ctx.mesIndex}`, 0);
      out.choques.push({ valor: -3 * grav, meia: 4 });
      continue;
    }
    // vazamentos de quem não é leal
    if (s.lealdade < 0.35 && rng.chance(0.03)) {
      noticia(`Bastidores: ${s.nome} (${nomeCargo(s.cargo)}) reclama do governo em conversa vazada — "ninguém me ouve no Palácio".`, 'alerta', `vaz${s.cargo}`, 90);
      pol.capital = clamp(pol.capital - 4, 0, 100);
    }
    // secretário competente rende boas notícias
    if (s.competencia > 0.78 && meses > 6 && rng.chance(0.02)) {
      noticia(`${s.nome}, de ${nomeCargo(s.cargo)}, é elogiado(a) por especialistas: "${s.bordao}"`, 'bom', `elog${s.cargo}`, 120);
      out.choques.push({ valor: 1, meia: 3 });
    }
    // pedido de demissão por desgaste
    if (s.lealdade < 0.3 && ctx.aprovacao < 30 && rng.chance(0.02)) {
      noticia(`${s.nome} pede demissão de ${nomeCargo(s.cargo)} e critica o governo na saída.`, 'ruim', `dem${s.cargo}${ctx.mesIndex}`, 0);
      vagar(pol, s.cargo, rng, ctx);
      out.choques.push({ valor: -1.5, meia: 3 });
    }
  }
  // desincompatibilização: quem vai disputar a eleição deixa o cargo até o início de abril do ano eleitoral
  if (ctx.mes === 4 && ctx.ano % 4 === 2) {
    for (const s of Object.values(pol.secretarios)) if (!s.interino && s.ambicao > 0.6) {
      noticia(`${s.nome} deixa ${nomeCargo(s.cargo)} para disputar a eleição de outubro (desincompatibilização).`, 'info', `desinc${s.cargo}${ctx.ano}`, 0);
      vagar(pol, s.cargo, rng, ctx);
    }
  }

  // ── escândalos → CPI ──
  for (const e of pol.escandalos) {
    if (e.fase !== 'imprensa') continue;
    const sec = pol.secretarios[e.cargo];
    if (e.noCargo && sec.nome !== e.secretario) e.noCargo = false;
    if (ctx.mesIndex - e.desde < 1) continue;
    // prisão pela PF quando a coisa é grave
    if (e.gravidade > 1.25 && rng.chance(0.25)) {
      noticia(`Operação da Polícia Federal prende ${e.secretario}${e.noCargo ? `, secretário(a) de ${nomeCargo(e.cargo)},` : ', ex-secretário(a),'} por ${e.tipo}.`, 'ruim', `pf${e.id}`, 0);
      out.choques.push({ valor: e.noCargo ? -6 : -2, meia: 5 });
      if (e.noCargo) vagar(pol, e.cargo, rng, ctx);
      e.fase = 'encerrado';
      continue;
    }
    // a oposição recolhe assinaturas (1/3 da Casa)
    const proj: Projeto = { id: `cpi-${e.id}`, tipo: 'cpi', titulo: `CPI: ${e.tipo}`, descricao: '', quorum: '1/3', eixos: {}, governoQuer: 'nao', gravidade: e.gravidade * (e.noCargo ? 1 : 0.5), votaEm: ctx.mesIndex, dataVotacao: ctx.data };
    const pl = placar(pol, proj, { aprovacao: ctx.aprovacao });
    const assin = Math.round(pl.aFavor + pl.indecisos * 0.5);
    if (assin >= pl.necessarios) {
      const pres = pol.deputados.find((d) => d.id === pol.presidenteALE)!;
      if (pres.relacao > 0.45 && rng.chance(0.5)) {
        pol.cpis.push({ id: pol.nextId++, escandalo: e.id, tema: e.tipo, assinaturas: assin, inicio: ctx.mesIndex, fim: ctx.mesIndex, status: 'engavetada' });
        noticia(`${pres.urna}, presidente da ALE, engaveta o pedido de CPI sobre ${e.tipo}, apesar de ${assin} assinaturas.`, 'alerta', `gav${e.id}`, 0);
        out.choques.push({ valor: -1, meia: 3, grupo: 'classeMedia' });
        e.fase = 'encerrado';
      } else {
        pol.cpis.push({ id: pol.nextId++, escandalo: e.id, tema: e.tipo, assinaturas: assin, inicio: ctx.mesIndex, fim: ctx.mesIndex + 4, status: 'instalada' });
        noticia(`ALE instala CPI para investigar ${e.tipo} (${assin} assinaturas). Sessões serão transmitidas ao vivo.`, 'ruim', `cpi${e.id}`, 0);
        out.choques.push({ valor: -2, meia: 4 });
        e.fase = 'cpi';
      }
    } else if (ctx.mesIndex - e.desde >= 3) {
      noticia(`Pedido de CPI sobre ${e.tipo} não atinge as ${pl.necessarios} assinaturas e é arquivado.`, 'info', `cpino${e.id}`, 0);
      e.fase = 'encerrado';
    }
  }
  for (const c of pol.cpis) {
    if (c.status !== 'instalada') continue;
    const e = pol.escandalos.find((x) => x.id === c.escandalo)!;
    if (ctx.mesIndex < c.fim) {
      if (rng.chance(0.5)) noticia(`CPI: depoimento tenso sobre ${c.tema} domina o noticiário; governistas tentam esvaziar a sessão.`, 'ruim', `cpis${c.id}`, 25);
      out.choques.push({ valor: -0.8, meia: 2 });
      continue;
    }
    c.status = 'concluida';
    e.fase = 'encerrado';
    const sec = pol.secretarios[e.cargo];
    const aindaLa = sec.nome === e.secretario;
    if (e.gravidade > 0.95) {
      c.desfecho = `Relatório final pede o indiciamento de ${e.secretario}.`;
      noticia(`CPI aprova relatório que pede o indiciamento de ${e.secretario}${aindaLa ? ', que deixa o governo' : ''}.`, 'ruim', `cpif${c.id}`, 0);
      out.choques.push({ valor: aindaLa ? -5 : -2, meia: 5 });
      if (aindaLa) vagar(pol, e.cargo, rng, ctx);
    } else {
      c.desfecho = 'Relatório final não aponta responsáveis ("acabou em pizza", diz a oposição).';
      noticia(`CPI sobre ${c.tema} termina sem indiciados. Oposição apresenta relatório paralelo.`, 'info', `cpif${c.id}`, 0);
    }
  }

  // ── Mesa Diretora: eleição no início do 3º ano da legislatura (fevereiro) ──
  if (ctx.mes === 2 && ctx.ano % 4 === 1 && pol.mesaEleita !== ctx.ano) {
    pol.mesaEleita = ctx.ano;
    const base = pol.deputados.filter((d) => d.relacao > 0.15).length / pol.cadeiras;
    const gov = pol.deputados.filter((d) => d.bancada === 'centrao' && d.relacao > 0.2).sort((a, b) => b.influencia - a.influencia)[0];
    const ind = pol.deputados.filter((d) => d.bancada !== 'oposicao' && d.relacao < 0.1).sort((a, b) => b.influencia - a.influencia)[0];
    if (gov && (!ind || rng.chance(clamp(0.2 + base, 0.1, 0.95)))) {
      pol.presidenteALE = gov.id; gov.influencia = 1;
      noticia(`${gov.urna} (${PARTIDOS[gov.partido].sigla}) é eleito presidente da ALE com apoio do Palácio.`, 'bom', `mesa${ctx.ano}`, 0);
    } else if (ind) {
      pol.presidenteALE = ind.id; ind.influencia = 1;
      noticia(`Derrota do governo: ${ind.urna} (${PARTIDOS[ind.partido].sigla}) vence a eleição para a presidência da ALE.`, 'ruim', `mesa${ctx.ano}`, 0);
      pol.capital = clamp(pol.capital - 8, 0, 100);
    }
  }

  // ── pedido de impeachment ──
  const crise = (ctx.aprovacao < 25 ? (25 - ctx.aprovacao) / 8 : 0) + 0.35 * pol.escandalos.filter((e) => e.fase !== 'encerrado' && e.noCargo).length
    + (ctx.atrasoSalarial ? 0.8 : 0) + (ctx.pessoalAcimaLRF ? 0.4 : 0);
  if (crise > 1 && !pol.pauta.some((p) => p.tipo === 'impeachment') && rng.chance(0.12)) {
    const pres = pol.deputados.find((d) => d.id === pol.presidenteALE)!;
    if (pres.relacao < -0.1 || crise > 2.2) {
      pol.pauta.push({
        id: `imp-${ctx.mesIndex}`, tipo: 'impeachment', titulo: 'Abertura de processo de impeachment do governador',
        descricao: 'Crime de responsabilidade alegado pela oposição. Admissão exige 2/3 da Assembleia; aprovada, o governador é afastado.',
        quorum: '2/3', eixos: {}, governoQuer: 'nao', gravidade: crise, votaEm: ctx.mesIndex + 1, dataVotacao: '',
      });
      noticia(`${pres.urna}, presidente da ALE, aceita pedido de impeachment do governador. Votação em plenário no próximo mês.`, 'ruim', `imp${ctx.mesIndex}`, 0);
      out.choques.push({ valor: -2, meia: 3 });
    } else {
      noticia(`Oposição protocola pedido de impeachment; ${pres.urna} segura o pedido na gaveta.`, 'alerta', 'impgav', 120);
    }
  }

  // ── votações agendadas para este mês ──
  for (const p of [...pol.pauta]) {
    if (p.votaEm > ctx.mesIndex || p.tipo === 'loa') continue; // a LOA é votada pelo calendário orçamentário
    p.dataVotacao = ctx.data;
    const r = votar(pol, p, { aprovacao: ctx.aprovacao }, rng);
    out.resolvidos.push({ projeto: p, ...r });
    if (p.tipo === 'impeachment') {
      if (r.aprovado) {
        pol.afastado = { data: ctx.data, motivo: `A Assembleia admitiu o processo de impeachment por ${r.aFavor} votos a ${r.contra}.` };
        noticia(`Governador é afastado: ALE admite o impeachment por ${r.aFavor} a ${r.contra}. O vice assume.`, 'ruim', 'afastado', 0);
      } else {
        noticia(`Governo derruba o pedido de impeachment: só ${r.aFavor} deputados votaram pela abertura (precisava de ${votosNecessarios('2/3', pol.cadeiras)}).`, 'bom', `impno${ctx.mesIndex}`, 0);
        out.choques.push({ valor: 2, meia: 3 });
      }
    }
  }
  return out;
}

/** Cargo vago: assume um interino técnico até o governador nomear alguém. */
function vagar(pol: EstadoPolitico, cargo: Cargo, rng: Rng, ctx: { mesIndex: number; cidades: string[] }) {
  const s = gerarSecretario(rng, cargo, 'tecnico', ctx.cidades, ctx.mesIndex);
  pol.secretarios[cargo] = { ...s, competencia: 0.45, lealdade: 0.5, ambicao: 0.1, honestidade: 0.8, interino: true, formacao: `interino(a); ${s.formacao}` };
  delete pol.candidatos[cargo];
}

/** Fração da Casa alinhada ao governo (para a "base aliada" dos painéis). */
export function baseAliada(pol: EstadoPolitico): number {
  return pol.deputados.filter((d) => d.relacao > 0.15).length / Math.max(1, pol.cadeiras);
}

/** Bônus no efeito do gasto de uma área pela competência do secretário (−0,15 a +0,15). */
export function bonusCompetencia(pol: EstadoPolitico, cargo: Cargo): number {
  const s = pol.secretarios[cargo];
  return s ? (s.competencia - 0.55) * 0.35 : 0;
}

export type { Cargo, IdBancada, IdPartido } from './dados';
