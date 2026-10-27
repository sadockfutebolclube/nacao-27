/**
 * Tela de legado (Fase 7): "Seu governo em números" — indicadores da posse ao fim, contas públicas,
 * obras, Assembleia, escândalos, eleição e conquistas.
 */
import type { Indicadores } from '../estado/tipos';

export interface LinhaLegado { nome: string; antes: number; depois: number; unidade: string; menorMelhor: boolean; casas: number }
export interface Conquista { id: string; nome: string; desc: string }
export interface Legado {
  titulo: string;
  texto: string;
  motivo: 'derrota' | 'sucessor-eleito' | 'sucessor-derrotado' | 'fim-mandatos' | 'afastado';
  periodo: string;
  mandatos: number;
  aprovacao: { final: number; media: number; max: number; min: number; serie: number[] };
  indicadores: LinhaLegado[];
  fiscal: { caixa: [number, number]; dcl: [number, number]; pessoal: [number, number]; pib: number; regime: string };
  obras: string[];
  assembleia: { vencidas: number; total: number; cpis: number; escandalos: number; impeachment: boolean };
  eleicoes: { ano: number; texto: string }[];
  conquistas: Conquista[];
}

export interface DadosLegado {
  motivo: Legado['motivo'];
  inicio: string; fim: string;
  mandatos: number;
  serie: number[];
  ind0: Indicadores; ind: Indicadores;
  caixa: [number, number]; dcl: [number, number]; pessoal: [number, number];
  pibReal: number; regime: string;
  obras: string[];
  votacoes: { governoVenceu: boolean }[];
  cpis: number; escandalos: number; afastado: boolean;
  eleicoes: { ano: number; texto: string; venceu: boolean; turno: number; pct: number }[];
  emendas: number;
  imprensaFinal: number;
  reformaPrevidencia: boolean;
}

const TITULOS: Record<Legado['motivo'], string> = {
  derrota: 'Derrotado(a) nas urnas',
  'sucessor-eleito': 'Missão cumprida: o sucessor venceu',
  'sucessor-derrotado': 'O sucessor perdeu a eleição',
  'fim-mandatos': 'Fim do segundo mandato',
  afastado: 'Afastado(a) pela Assembleia',
};

export function calcularLegado(d: DadosLegado): Legado {
  const L = (nome: string, k: keyof Indicadores, unidade: string, menorMelhor: boolean, casas = 1, mult = 1): LinhaLegado =>
    ({ nome, antes: d.ind0[k] * mult, depois: d.ind[k] * mult, unidade, menorMelhor, casas });
  const indicadores = [
    L('Mortes violentas /100 mil', 'homicidios', '', true),
    L('Mortalidade infantil', 'mortalidadeInfantil', '‰', true),
    L('Espera na emergência', 'esperaEmergencia', 'h', true),
    L('Fila de cirurgias', 'filaCirurgias', 'mil', true),
    L('IDEB do ensino médio', 'ideb', '', false, 2),
    L('Evasão escolar', 'evasao', '%', true),
    L('Desemprego', 'desemprego', '%', true, 1, 100),
    L('Extrema pobreza', 'pobreza', '%', true),
    L('Esgoto tratado', 'esgoto', '%', false),
    L('Letalidade policial /100 mil', 'letalidade', '', true),
  ];
  const s = d.serie.length ? d.serie : [50];
  const ap = { final: s[s.length - 1], media: s.reduce((a, b) => a + b, 0) / s.length, max: Math.max(...s), min: Math.min(...s), serie: s };
  const melhorou = (k: keyof Indicadores, frac: number, menor = true) => (menor ? d.ind[k] <= d.ind0[k] * (1 - frac) : d.ind[k] >= d.ind0[k] * (1 + frac));
  const c: Conquista[] = [];
  const add = (cond: boolean, id: string, nome: string, desc: string) => { if (cond) c.push({ id, nome, desc }); };
  const reeleito1 = d.eleicoes.find((e) => e.venceu && e.turno === 1 && d.mandatos >= 2);
  add(!!reeleito1, 'primeiro-turno', 'Liquidou no 1º turno', 'Reeleito(a) sem precisar de segundo turno.');
  add(d.mandatos >= 2, 'reeleito', 'Oito anos de Palácio', 'Conquistou a reeleição.');
  add(d.motivo === 'sucessor-eleito', 'sucessor', 'Fez o sucessor', 'Passou a faixa a um aliado eleito.');
  add(melhorou('homicidios', 0.25), 'pacificador', 'Pacificador', 'Reduziu as mortes violentas em 25% ou mais.');
  add(melhorou('filaCirurgias', 0.6), 'fila-sus', 'Zerou a fila do SUS', 'A fila de cirurgias caiu mais de 60%.');
  add(d.ind.ideb - d.ind0.ideb >= 0.4, 'ideb', 'Professor(a) do ano', 'O IDEB subiu 0,4 ponto ou mais.');
  add(melhorou('mortalidadeInfantil', 0.15), 'infancia', 'Primeira infância', 'Mortalidade infantil caiu 15% ou mais.');
  add(d.dcl[1] < d.dcl[0] - 0.1 && d.caixa[1] > 0, 'fiscal', 'Mão de ferro fiscal', 'Reduziu a dívida e deixou caixa positivo.');
  add(d.cpis >= 3 && !d.afastado, 'cpis', 'Sobreviveu a 3 CPIs', 'Três CPIs e o mandato inteiro.');
  add(d.reformaPrevidencia, 'previdencia', 'Reformista', 'Aprovou a PEC da Previdência estadual.');
  add(d.votacoes.length >= 5 && d.votacoes.filter((v) => v.governoVenceu).length / d.votacoes.length >= 0.85, 'rolo', 'Rolo compressor', 'Venceu 85% das votações na Assembleia.');
  add(d.obras.length >= 6, 'obras', 'Tocador de obras', 'Entregou seis grandes obras ou mais.');
  add(d.emendas > 0 && d.votacoes.length > 0 && d.emendas >= 1e9, 'emendas', 'Rei das emendas', 'Gastou mais de R$ 1 bilhão em emendas negociadas.');
  add(d.imprensaFinal > 0.3, 'imprensa', 'Queridinho da imprensa', 'Terminou com a imprensa a favor.');
  add(d.imprensaFinal < -0.4, 'imprensa-hostil', 'Inimigo da imprensa', 'Terminou com a imprensa em pé de guerra.');
  add(ap.final >= 60, 'popular', 'Saiu nos braços do povo', 'Aprovação final de 60% ou mais.');
  const motivoTxt = {
    derrota: 'As urnas encerraram o seu ciclo no Palácio.',
    'sucessor-eleito': 'Você deixa o cargo, mas o projeto continua.',
    'sucessor-derrotado': 'Você deixa o cargo e a oposição assume.',
    'fim-mandatos': 'A Constituição permite uma única reeleição. Oito anos depois, é hora de passar a faixa.',
    afastado: 'A Assembleia admitiu o impeachment e o vice assumiu.',
  }[d.motivo];
  return {
    titulo: TITULOS[d.motivo], texto: motivoTxt, motivo: d.motivo, periodo: `${d.inicio} – ${d.fim}`, mandatos: d.mandatos, aprovacao: ap, indicadores,
    fiscal: { caixa: d.caixa, dcl: d.dcl, pessoal: d.pessoal, pib: d.pibReal - 1, regime: d.regime },
    obras: d.obras,
    assembleia: { vencidas: d.votacoes.filter((v) => v.governoVenceu).length, total: d.votacoes.length, cpis: d.cpis, escandalos: d.escandalos, impeachment: d.afastado },
    eleicoes: d.eleicoes.map((e) => ({ ano: e.ano, texto: e.texto })),
    conquistas: c,
  };
}
