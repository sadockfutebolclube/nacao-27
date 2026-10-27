/**
 * Política (Fase 5): partidos e bancadas FICTÍCIOS, tamanho real das Assembleias e cargos do gabinete.
 * Nenhum partido, político ou grupo real é usado — siglas e nomes foram inventados (ver DECISIONS D-028).
 */
import type { Area } from '../estado/tipos';

/** Eixos em que um projeto mexe e em que cada bancada tem preferência. */
export type Eixo = 'impostos' | 'deficit' | 'emendas' | 'servidores' | 'seguranca' | 'social' | 'ambiente' | 'agro' | 'credito';
export type Eixos = Partial<Record<Eixo, number>>;

export type IdPartido = 'ATP' | 'EPU' | 'PEV' | 'UPB' | 'CDF' | 'PMU' | 'NLI' | 'PFF' | 'POP' | 'RAIZ';
export interface Partido { id: IdPartido; sigla: string; nome: string; cor: string; ideologia: number; fisiologismo: number }

export const PARTIDOS: Record<IdPartido, Partido> = {
  EPU: { id: 'EPU', sigla: 'EPU', nome: 'Esquerda Popular Unida', cor: '#c62f3a', ideologia: -0.85, fisiologismo: 0.1 },
  ATP: { id: 'ATP', sigla: 'ATP', nome: 'Aliança Trabalhista do Povo', cor: '#e8603c', ideologia: -0.55, fisiologismo: 0.35 },
  PEV: { id: 'PEV', sigla: 'PEV', nome: 'Partido Ecologia Viva', cor: '#3fae5a', ideologia: -0.4, fisiologismo: 0.2 },
  UPB: { id: 'UPB', sigla: 'UPB', nome: 'União Progressista Brasileira', cor: '#f0a43a', ideologia: -0.2, fisiologismo: 0.45 },
  CDF: { id: 'CDF', sigla: 'CDF', nome: 'Centro Democrático Federal', cor: '#8a8f98', ideologia: 0.1, fisiologismo: 0.9 },
  PMU: { id: 'PMU', sigla: 'PMU', nome: 'Partido Municipalista Unido', cor: '#5d8aa8', ideologia: 0.15, fisiologismo: 0.85 },
  NLI: { id: 'NLI', sigla: 'NLI', nome: 'Nova Livre Iniciativa', cor: '#f2c94c', ideologia: 0.5, fisiologismo: 0.2 },
  PFF: { id: 'PFF', sigla: 'PFF', nome: 'Partido Fé e Família', cor: '#4a6fd1', ideologia: 0.6, fisiologismo: 0.6 },
  POP: { id: 'POP', sigla: 'POP', nome: 'Partido Ordem e Progresso', cor: '#1f3a8a', ideologia: 0.8, fisiologismo: 0.4 },
  RAIZ: { id: 'RAIZ', sigla: 'RAÍZES', nome: 'Movimento Raízes do Campo', cor: '#8a6a2c', ideologia: 0.55, fisiologismo: 0.6 },
};

export type IdBancada = 'bala' | 'evangelica' | 'ruralista' | 'sindical' | 'empresarial' | 'ambientalista' | 'oposicao' | 'centrao';
export interface Bancada {
  id: IdBancada;
  nome: string;
  /** peso de cada eixo de um projeto na propensão a votar sim */
  pesos: Eixos;
  /** partidos de onde a bancada costuma vir (sorteio ponderado) */
  partidos: [IdPartido, number][];
  /** títulos de urna típicos (nome político) */
  titulos: string[];
  bordoes: string[];
  cor: string;
}

export const BANCADAS: Record<IdBancada, Bancada> = {
  bala: {
    id: 'bala', nome: 'Bancada da bala', cor: '#5b6b8c',
    pesos: { seguranca: 1.2, impostos: -0.4, social: -0.25, servidores: 0.3 },
    partidos: [['POP', 6], ['PFF', 2], ['CDF', 2], ['RAIZ', 1]],
    titulos: ['Delegado', 'Delegada', 'Coronel', 'Sargento', 'Capitão', 'Cabo', 'Inspetor'],
    bordoes: ['Bandido bom é bandido preso!', 'Aqui é ordem e ponto final.', 'Polícia na rua, família em casa.', 'Com vagabundo não se negocia.'],
  },
  evangelica: {
    id: 'evangelica', nome: 'Bancada evangélica', cor: '#7a7fd6',
    pesos: { social: 0.25, seguranca: 0.4, impostos: -0.3, emendas: 0.5 },
    partidos: [['PFF', 7], ['CDF', 2], ['PMU', 2], ['POP', 1]],
    titulos: ['Pastor', 'Pastora', 'Bispo', 'Missionária', 'Irmão', 'Irmã', 'Apóstolo'],
    bordoes: ['A família é a base de tudo, governador.', 'Deus no comando e o povo na frente.', 'Vou orar pelo senhor — e votar conforme a consciência.'],
  },
  ruralista: {
    id: 'ruralista', nome: 'Bancada ruralista', cor: '#8a6a2c',
    pesos: { agro: 1.2, ambiente: -0.8, impostos: -0.8, credito: 0.2 },
    partidos: [['RAIZ', 7], ['CDF', 2], ['PMU', 2], ['NLI', 1]],
    titulos: ['Zé do', 'Tonho do', 'Dr.', 'Coronel', ''],
    bordoes: ['O agro segura este estado nas costas.', 'Sem estrada vicinal, a safra apodrece.', 'Licença ambiental não pode travar o progresso.'],
  },
  sindical: {
    id: 'sindical', nome: 'Bancada sindical', cor: '#e8603c',
    pesos: { servidores: 1.4, social: 0.6, impostos: 0.2, deficit: 0.2 },
    partidos: [['ATP', 6], ['EPU', 3], ['UPB', 2]],
    titulos: ['Professora', 'Professor', 'Enfermeira', 'Companheiro', 'Zé do Sindicato', ''],
    bordoes: ['Servidor não é despesa, é serviço!', 'Nenhum direito a menos.', 'A greve é o último recurso — mas é recurso.'],
  },
  empresarial: {
    id: 'empresarial', nome: 'Bancada empresarial', cor: '#f2c94c',
    pesos: { impostos: -1.2, deficit: -0.6, servidores: -0.4, credito: -0.2 },
    partidos: [['NLI', 6], ['CDF', 2], ['UPB', 2], ['PMU', 1]],
    titulos: ['Dr.', 'Dra.', 'Engenheiro', 'Empresário', ''],
    bordoes: ['Quem gera emprego é a iniciativa privada.', 'Imposto alto é convite à sonegação.', 'Gestão, gestão e gestão.'],
  },
  ambientalista: {
    id: 'ambientalista', nome: 'Bancada ambientalista', cor: '#3fae5a',
    pesos: { ambiente: 1.3, agro: -0.4, social: 0.3, seguranca: -0.2 },
    partidos: [['PEV', 6], ['EPU', 2], ['UPB', 2]],
    titulos: ['Professora', 'Bióloga', 'Dr.', ''],
    bordoes: ['Não existe planeta B.', 'Saneamento é saúde pública.', 'Floresta em pé vale mais.'],
  },
  oposicao: {
    id: 'oposicao', nome: 'Oposição raiz', cor: '#c62f3a',
    pesos: { social: 0.4, impostos: -0.2 },
    partidos: [['EPU', 3], ['POP', 3], ['ATP', 2], ['NLI', 1]],
    titulos: ['', '', 'Professor', 'Delegado', 'Dra.'],
    bordoes: ['Esse governo é um desastre anunciado.', 'Vou votar contra e explicar nas redes.', 'Cadê o dinheiro, governador?'],
  },
  centrao: {
    id: 'centrao', nome: 'Centrão', cor: '#8a8f98',
    pesos: { emendas: 1.5, deficit: -0.1 },
    partidos: [['CDF', 5], ['PMU', 5], ['UPB', 2], ['PFF', 1]],
    titulos: ['', '', 'Dr.', 'Prefeito', 'Tio', 'Doutor'],
    bordoes: ['Política é a arte do possível.', 'Estou com o governo — enquanto o governo estiver comigo.', 'Minha base precisa ver obra.'],
  },
};

/** Composição típica da ALE (fração das cadeiras por bancada), ajustada pela UF. */
export function composicaoBancadas(regiao: string, complexidade: number): Record<IdBancada, number> {
  const agro = regiao === 'Centro-Oeste' || regiao === 'Norte' ? 0.16 : regiao === 'Sul' ? 0.11 : 0.07;
  return {
    centrao: 0.3, bala: 0.11, evangelica: 0.12, ruralista: agro, sindical: 0.08, empresarial: 0.09,
    ambientalista: 0.04, oposicao: 0.1 + 0.05 * complexidade,
  };
}

/** Deputados federais por UF (LC 78/1993, distribuição de 513 cadeiras). */
export const DEP_FEDERAIS: Record<string, number> = {
  SP: 70, MG: 53, RJ: 46, BA: 39, RS: 31, PR: 30, PE: 25, CE: 22, MA: 18, GO: 17, PA: 17, SC: 16, PB: 12,
  ES: 10, PI: 10, AL: 9, AC: 8, AM: 8, AP: 8, DF: 8, MS: 8, MT: 8, RN: 8, RO: 8, RR: 8, SE: 8, TO: 8,
};

/** CF art. 27: o triplo da bancada federal até 36; acima disso, +1 por deputado federal além de 12. */
export function cadeirasALE(sigla: string): number {
  const f = DEP_FEDERAIS[sigla] ?? 8;
  return f <= 12 ? 3 * f : 36 + (f - 12);
}

/** Cargos do primeiro escalão: uma secretaria por área + Casa Civil (articulação política). */
export type Cargo = Area | 'casaCivil';
export const CARGOS: { id: Cargo; nome: string; titulo: string }[] = [
  { id: 'casaCivil', nome: 'Casa Civil', titulo: 'Chefe da Casa Civil' },
  { id: 'administracao', nome: 'Fazenda', titulo: 'Secretário(a) da Fazenda' },
  { id: 'saude', nome: 'Saúde', titulo: 'Secretário(a) de Saúde' },
  { id: 'educacao', nome: 'Educação', titulo: 'Secretário(a) de Educação' },
  { id: 'seguranca', nome: 'Segurança Pública', titulo: 'Secretário(a) de Segurança' },
  { id: 'transporte', nome: 'Transportes', titulo: 'Secretário(a) de Transportes' },
  { id: 'infraestrutura', nome: 'Obras e Habitação', titulo: 'Secretário(a) de Infraestrutura' },
  { id: 'saneamento', nome: 'Meio Ambiente', titulo: 'Secretário(a) do Ambiente' },
  { id: 'assistencia', nome: 'Assistência Social', titulo: 'Secretário(a) de Assistência' },
  { id: 'cultura', nome: 'Cultura', titulo: 'Secretário(a) de Cultura' },
  { id: 'desenvolvimento', nome: 'Desenvolvimento', titulo: 'Secretário(a) de Desenvolvimento' },
];

/** Perfis de formação por cargo (texto do currículo), em [masculino, feminino]. */
export const FORMACOES: Record<Cargo, [string, string][]> = {
  casaCivil: [['ex-deputado de cinco mandatos', 'ex-deputada de cinco mandatos'], ['advogado e articulador de bastidor', 'advogada e articuladora de bastidor'], ['ex-prefeito do interior', 'ex-prefeita do interior']],
  administracao: [['economista, ex-Tesouro Nacional', 'economista, ex-Tesouro Nacional'], ['auditor fiscal de carreira', 'auditora fiscal de carreira'], ['ex-diretor de banco estadual', 'ex-diretora de banco estadual']],
  saude: [['médico sanitarista', 'médica sanitarista'], ['ex-diretor de hospital universitário', 'ex-diretora de hospital universitário'], ['enfermeiro e gestor do SUS', 'enfermeira e gestora do SUS']],
  educacao: [['professor da rede há 25 anos', 'professora da rede há 25 anos'], ['pesquisador em políticas educacionais', 'pesquisadora em políticas educacionais'], ['ex-secretário municipal de Educação', 'ex-secretária municipal de Educação']],
  seguranca: [['delegado da Polícia Federal', 'delegada da Polícia Federal'], ['coronel da reserva da PM', 'coronel da reserva da PM'], ['promotor de Justiça licenciado', 'promotora de Justiça licenciada']],
  transporte: [['engenheiro de tráfego', 'engenheira de tráfego'], ['ex-presidente de companhia de metrô', 'ex-presidente de companhia de metrô'], ['consultor de mobilidade', 'consultora de mobilidade']],
  infraestrutura: [['engenheiro civil', 'engenheira civil'], ['ex-diretor do DER', 'ex-diretora do DER'], ['arquiteto urbanista', 'arquiteta urbanista']],
  saneamento: [['biólogo e ex-diretor de parque estadual', 'bióloga e ex-diretora de parque estadual'], ['engenheiro sanitarista', 'engenheira sanitarista'], ['ex-presidente da companhia de águas', 'ex-presidente da companhia de águas']],
  assistencia: [['assistente social de carreira', 'assistente social de carreira'], ['líder comunitário', 'líder comunitária'], ['ex-coordenador do Cadastro Único', 'ex-coordenadora do Cadastro Único']],
  cultura: [['produtor cultural', 'produtora cultural'], ['sambista e compositor', 'sambista e compositora'], ['ex-diretor de teatro municipal', 'ex-diretora de teatro municipal']],
  desenvolvimento: [['empresário do setor industrial', 'empresária do setor industrial'], ['economista de federação de indústrias', 'economista de federação de indústrias'], ['ex-secretário de Agricultura', 'ex-secretária de Agricultura']],
};

/** Ditos dos secretários, por perfil. */
export const BORDOES_SECRETARIO = {
  tecnico: ['Os números não mentem, governador.', 'Me dê doze meses e um orçamento honesto.', 'Política pública se faz com evidência.'],
  politico: ['Deixa que eu converso com o pessoal da Assembleia.', 'Uma mão lava a outra, governador.', 'Isso aí se resolve num café.'],
  confianca: ['Tô com o senhor desde a campanha.', 'Pode contar comigo pro que der e vier.', 'Lealdade não se compra, governador.'],
};
