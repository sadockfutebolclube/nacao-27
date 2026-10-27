/**
 * Gêneros da trilha procedural (Fase 8). Cada gênero é só dado: andamento, compasso, escala,
 * progressões e padrões rítmicos em texto (um caractere por semicolcheia):
 *   bateria  'x' forte · 'o' fraco · 'a'/'b' variações (agogô agudo/grave, triângulo aberto/abafado)
 *   baixo    'R' fundamental · '3' terça · '5' quinta · '7' sétima · '8' oitava (soa até a próxima nota)
 *   acomp.   'x' acorde curto · 'X' acorde longo · 'r' arpejo ascendente
 * O motor em musica.ts sorteia tom, motivos e variações a cada faixa.
 */

export type Timbre =
  | 'sanfona' | 'flauta' | 'pifano' | 'metais' | 'guitarra' | 'guitarra-dist' | 'viola' | 'violao' | 'cavaco'
  | 'piano' | 'teclado' | 'pad' | 'sintetizador' | 'harpa' | 'violino' | 'melodica';

export type VozBateria =
  | 'bumbo' | 'surdo' | 'zabumba' | 'bacalhau' | 'caixa' | 'aro' | 'tamborim' | 'ganza' | 'triangulo' | 'agogo'
  | 'chimbal' | 'palmas' | 'alfaia' | 'gongue' | 'pandeiro' | 'atabaque' | 'maraca' | 'matraca';

export interface Genero {
  id: string;
  nome: string;
  bpm: number;
  /** semicolcheias por compasso (16 = 4/4, 12 = 3/4, 8 = 2/4) */
  passos: number;
  /** atraso das semicolcheias pares (0–0.3) — o "molho" */
  swing: number;
  escala: number[];
  /** escala da melodia, se diferente da harmonia (pentatônicas) */
  escalaMelodia?: number[];
  setimas: boolean;
  /** progressões de 4 compassos em graus da escala (0 = I) */
  progressoes: number[][];
  baixo: string;
  acomp: { timbre: Timbre; padrao: string } | null;
  lead: { timbre: Timbre; oitava: number; densidade: number; tercas?: boolean };
  bateria: { voz: VozBateria; padrao: string; vol?: number }[];
}

const MAIOR = [0, 2, 4, 5, 7, 9, 11];
const MENOR = [0, 2, 3, 5, 7, 8, 10];
const DORICO = [0, 2, 3, 5, 7, 9, 10];
const MIXO = [0, 2, 4, 5, 7, 9, 10];
/** modo nordestino: mixolídio com quarta aumentada (lídio-dominante) */
const NORDESTINO = [0, 2, 4, 6, 7, 9, 10];
const HARMONICA = [0, 2, 3, 5, 7, 8, 11];
const PENTA_MAIOR = [0, 2, 4, 7, 9];
const PENTA_MENOR = [0, 3, 5, 7, 10];

export const GENEROS: Record<string, Genero> = {
  samba: {
    id: 'samba', nome: 'Samba', bpm: 98, passos: 16, swing: 0.1, escala: MAIOR, setimas: true,
    progressoes: [[0, 5, 1, 4], [0, 3, 1, 4], [1, 4, 0, 5], [3, 3, 0, 4]],
    baixo: 'R......5R......5', acomp: { timbre: 'cavaco', padrao: 'x.xx.x.x.xx.x.x.' },
    lead: { timbre: 'flauta', oitava: 5, densidade: 0.55 },
    bateria: [
      { voz: 'surdo', padrao: 'o.......x.......' }, { voz: 'tamborim', padrao: 'x.x.x..x.x.x..x.', vol: 0.7 },
      { voz: 'ganza', padrao: 'xoooxoooxoooxooo', vol: 0.6 }, { voz: 'pandeiro', padrao: 'x..ox..ox..ox..o', vol: 0.5 },
      { voz: 'agogo', padrao: 'a.b.a.b...a.b...', vol: 0.4 },
    ],
  },
  bossa: {
    id: 'bossa', nome: 'Bossa nova', bpm: 70, passos: 16, swing: 0.05, escala: MAIOR, setimas: true,
    progressoes: [[0, 0, 1, 4], [3, 3, 2, 5], [1, 4, 0, 0], [0, 6, 2, 5]],
    baixo: 'R.....5.R.....5.', acomp: { timbre: 'violao', padrao: 'x..x..x...x..x..' },
    lead: { timbre: 'flauta', oitava: 5, densidade: 0.35 },
    bateria: [
      { voz: 'aro', padrao: 'x..x..x...x..x..', vol: 0.5 }, { voz: 'chimbal', padrao: 'oooooooooooooooo', vol: 0.25 },
      { voz: 'bumbo', padrao: 'x.....o.x.....o.', vol: 0.5 },
    ],
  },
  ijexa: {
    id: 'ijexa', nome: 'Ijexá', bpm: 100, passos: 16, swing: 0.06, escala: MIXO, setimas: true,
    progressoes: [[0, 0, 6, 6], [0, 3, 0, 4], [3, 6, 0, 0]],
    baixo: 'R..5..R.R..5..8.', acomp: { timbre: 'guitarra', padrao: '..x..x.x..x..x..' },
    lead: { timbre: 'metais', oitava: 5, densidade: 0.4 },
    bateria: [
      { voz: 'agogo', padrao: 'a.a.b.b.a.b.b...' }, { voz: 'atabaque', padrao: 'x..o..x.x..o..o.' },
      { voz: 'ganza', padrao: 'xoxoxoxoxoxoxoxo', vol: 0.5 }, { voz: 'bumbo', padrao: 'x.......x.......', vol: 0.6 },
    ],
  },
  axe: {
    id: 'axe', nome: 'Axé', bpm: 118, passos: 16, swing: 0.04, escala: MAIOR, setimas: false,
    progressoes: [[0, 4, 5, 3], [0, 3, 4, 4], [5, 3, 0, 4]],
    baixo: 'R..R..5.R..R..5.', acomp: { timbre: 'guitarra', padrao: 'x.xx.xx.x.xx.xx.' },
    lead: { timbre: 'metais', oitava: 5, densidade: 0.5 },
    bateria: [
      { voz: 'surdo', padrao: 'x...o...x...o...' }, { voz: 'caixa', padrao: 'x.xxx.xxx.xxx.xx', vol: 0.45 },
      { voz: 'atabaque', padrao: '..x..x....x..x..', vol: 0.7 },
      { voz: 'chimbal', padrao: '..x...x...x...x.', vol: 0.4 },
    ],
  },
  forro: {
    id: 'forro', nome: 'Forró pé de serra', bpm: 116, passos: 16, swing: 0.03, escala: NORDESTINO, setimas: false,
    progressoes: [[0, 0, 4, 0], [0, 3, 4, 0], [3, 3, 0, 4], [0, 6, 3, 4]],
    baixo: 'R..5....R..5....', acomp: { timbre: 'sanfona', padrao: 'x..x....x..x....' },
    lead: { timbre: 'sanfona', oitava: 5, densidade: 0.6 },
    bateria: [
      { voz: 'zabumba', padrao: 'x..x....x..x....' }, { voz: 'bacalhau', padrao: '....x.x.....x.x.', vol: 0.7 },
      { voz: 'triangulo', padrao: 'baxabaxabaxabaxa', vol: 0.5 },
    ],
  },
  xote: {
    id: 'xote', nome: 'Xote', bpm: 86, passos: 16, swing: 0.12, escala: MAIOR, setimas: false,
    progressoes: [[0, 3, 4, 0], [0, 0, 4, 4], [3, 0, 4, 0]],
    baixo: 'R.....5.R.......', acomp: { timbre: 'violao', padrao: '..x...x...x...x.' },
    lead: { timbre: 'sanfona', oitava: 5, densidade: 0.45, tercas: true },
    bateria: [
      { voz: 'zabumba', padrao: 'x.....x.x.......' }, { voz: 'bacalhau', padrao: '....x.......x...', vol: 0.6 },
      { voz: 'triangulo', padrao: 'baxabaxabaxabaxa', vol: 0.45 },
    ],
  },
  frevo: {
    id: 'frevo', nome: 'Frevo', bpm: 148, passos: 16, swing: 0, escala: MAIOR, setimas: false,
    progressoes: [[0, 4, 4, 0], [3, 0, 4, 0], [5, 1, 4, 0]],
    baixo: 'R.5.R.5.R.5.8.5.', acomp: { timbre: 'metais', padrao: '..x...x...x.x...' },
    lead: { timbre: 'metais', oitava: 5, densidade: 0.75 },
    bateria: [
      { voz: 'caixa', padrao: 'xoxxxoxxxoxxxoxx', vol: 0.55 }, { voz: 'surdo', padrao: 'x...x...x...x...' },
      { voz: 'chimbal', padrao: 'x.x.x.x.x.x.x.x.', vol: 0.3 },
    ],
  },
  maracatu: {
    id: 'maracatu', nome: 'Maracatu', bpm: 92, passos: 16, swing: 0.04, escala: DORICO, setimas: false,
    progressoes: [[0, 0, 6, 6], [0, 3, 6, 0], [5, 6, 0, 0]],
    baixo: 'R..R..5.R.......', acomp: { timbre: 'pad', padrao: 'X...............' },
    lead: { timbre: 'metais', oitava: 4, densidade: 0.35 },
    bateria: [
      { voz: 'alfaia', padrao: 'x..x..x.x..x..o.' }, { voz: 'alfaia', padrao: '....o.....o....x', vol: 0.6 },
      { voz: 'gongue', padrao: 'x.x.x..xx.x.x..x', vol: 0.55 }, { voz: 'caixa', padrao: 'x.xx.xx.x.xx.xx.', vol: 0.35 },
      { voz: 'ganza', padrao: 'xoxoxoxoxoxoxoxo', vol: 0.4 },
    ],
  },
  mangue: {
    id: 'mangue', nome: 'Manguebeat', bpm: 96, passos: 16, swing: 0.02, escala: DORICO, escalaMelodia: PENTA_MENOR, setimas: false,
    progressoes: [[0, 0, 3, 3], [0, 6, 3, 0]],
    baixo: 'R..R..R.R..5..7.', acomp: { timbre: 'guitarra-dist', padrao: 'x..x..x.x..x....' },
    lead: { timbre: 'guitarra-dist', oitava: 4, densidade: 0.4 },
    bateria: [
      { voz: 'alfaia', padrao: 'x..x..x.x..x..o.' }, { voz: 'caixa', padrao: '....x.......x...', vol: 0.6 },
      { voz: 'gongue', padrao: 'x.x.x..xx.x.x..x', vol: 0.45 }, { voz: 'chimbal', padrao: 'x.x.x.x.x.x.x.x.', vol: 0.3 },
    ],
  },
  carimbo: {
    id: 'carimbo', nome: 'Carimbó', bpm: 112, passos: 16, swing: 0.06, escala: MAIOR, setimas: false,
    progressoes: [[0, 4, 4, 0], [0, 3, 4, 0], [3, 4, 0, 0]],
    baixo: 'R...5...R...5...', acomp: { timbre: 'cavaco', padrao: 'x.x.x.x.x.x.x.x.' },
    lead: { timbre: 'guitarra', oitava: 5, densidade: 0.55 },
    bateria: [
      { voz: 'atabaque', padrao: 'x..x..x.x..x..x.' }, { voz: 'atabaque', padrao: '..o...o...o...o.', vol: 0.5 },
      { voz: 'maraca', padrao: 'xoxoxoxoxoxoxoxo', vol: 0.55 }, { voz: 'bumbo', padrao: 'x.......x.......', vol: 0.5 },
    ],
  },
  guitarrada: {
    id: 'guitarrada', nome: 'Guitarrada', bpm: 124, passos: 16, swing: 0.03, escala: HARMONICA, setimas: false,
    progressoes: [[0, 0, 4, 4], [3, 0, 4, 0], [5, 3, 4, 0]],
    baixo: 'R..5..R.R..5..8.', acomp: { timbre: 'violao', padrao: 'x..x..x.x..x..x.' },
    lead: { timbre: 'guitarra', oitava: 5, densidade: 0.75 },
    bateria: [
      { voz: 'bumbo', padrao: 'x..x....x..x....' }, { voz: 'caixa', padrao: '....x.......x...', vol: 0.5 },
      { voz: 'chimbal', padrao: 'x.x.x.x.x.x.x.x.', vol: 0.35 }, { voz: 'maraca', padrao: 'oooooooooooooooo', vol: 0.4 },
    ],
  },
  tecnobrega: {
    id: 'tecnobrega', nome: 'Tecnobrega', bpm: 132, passos: 16, swing: 0, escala: MENOR, setimas: false,
    progressoes: [[0, 5, 2, 6], [0, 3, 6, 4]],
    baixo: 'R.R.R.R.R.R.R.R.', acomp: { timbre: 'pad', padrao: 'X.......X.......' },
    lead: { timbre: 'sintetizador', oitava: 5, densidade: 0.6 },
    bateria: [
      { voz: 'bumbo', padrao: 'x...x...x...x...' }, { voz: 'palmas', padrao: '....x.......x...', vol: 0.6 },
      { voz: 'chimbal', padrao: '..x...x...x...x.', vol: 0.45 },
    ],
  },
  boi: {
    id: 'boi', nome: 'Toada de boi', bpm: 126, passos: 16, swing: 0.02, escala: MAIOR, setimas: false,
    progressoes: [[0, 3, 4, 0], [5, 3, 4, 0], [0, 4, 5, 4]],
    baixo: 'R...5...R...5...', acomp: { timbre: 'teclado', padrao: 'x.xx.xx.x.xx.xx.' },
    lead: { timbre: 'metais', oitava: 5, densidade: 0.5 },
    bateria: [
      { voz: 'surdo', padrao: 'x...x...x...x...' }, { voz: 'caixa', padrao: 'x.xxx.xxx.xxx.xx', vol: 0.4 },
      { voz: 'matraca', padrao: 'x.x.x.x.x.x.x.x.', vol: 0.55 }, { voz: 'palmas', padrao: '..x...x...x...x.', vol: 0.35 },
    ],
  },
  sertanejo: {
    id: 'sertanejo', nome: 'Sertanejo', bpm: 92, passos: 16, swing: 0.05, escala: MAIOR, setimas: false,
    progressoes: [[0, 3, 4, 0], [0, 0, 4, 4], [3, 4, 0, 0], [5, 3, 4, 0]],
    baixo: 'R...5...R...5...', acomp: { timbre: 'violao', padrao: 'x..x..x.x..x..x.' },
    lead: { timbre: 'viola', oitava: 5, densidade: 0.5, tercas: true },
    bateria: [
      { voz: 'bumbo', padrao: 'x.......x.......', vol: 0.6 }, { voz: 'caixa', padrao: '....x.......x...', vol: 0.4 },
      { voz: 'chimbal', padrao: 'x.x.x.x.x.x.x.x.', vol: 0.25 },
    ],
  },
  moda: {
    id: 'moda', nome: 'Moda de viola', bpm: 78, passos: 12, swing: 0, escala: MAIOR, setimas: false,
    progressoes: [[0, 0, 4, 0], [3, 0, 4, 0]],
    baixo: 'R.......5...', acomp: { timbre: 'violao', padrao: '....x...x...' },
    lead: { timbre: 'viola', oitava: 5, densidade: 0.5, tercas: true },
    bateria: [{ voz: 'palmas', padrao: '', vol: 0.4 }],
  },
  rasqueado: {
    id: 'rasqueado', nome: 'Rasqueado', bpm: 112, passos: 12, swing: 0, escala: MAIOR, setimas: false,
    progressoes: [[0, 4, 4, 0], [0, 3, 4, 0]],
    baixo: 'R...5...5...', acomp: { timbre: 'viola', padrao: 'x...x.x.x.x.' },
    lead: { timbre: 'viola', oitava: 5, densidade: 0.5, tercas: true },
    bateria: [{ voz: 'ganza', padrao: 'xoxoxoxoxoxo', vol: 0.5 }, { voz: 'atabaque', padrao: 'x.....x.o...', vol: 0.6 }],
  },
  chamame: {
    id: 'chamame', nome: 'Chamamé', bpm: 96, passos: 12, swing: 0, escala: MAIOR, setimas: false,
    progressoes: [[0, 4, 4, 0], [0, 3, 4, 0], [3, 0, 4, 0]],
    baixo: 'R.......5...', acomp: { timbre: 'violao', padrao: '....x.x.x.x.' },
    lead: { timbre: 'sanfona', oitava: 5, densidade: 0.55, tercas: true },
    bateria: [],
  },
  polca: {
    id: 'polca', nome: 'Polca paraguaia', bpm: 132, passos: 12, swing: 0, escala: MAIOR, setimas: false,
    progressoes: [[0, 4, 4, 0], [3, 0, 4, 0], [0, 5, 4, 0]],
    baixo: 'R...5...R...', acomp: { timbre: 'harpa', padrao: 'r.r.r.r.r.r.' },
    lead: { timbre: 'harpa', oitava: 5, densidade: 0.6 },
    bateria: [],
  },
  milonga: {
    id: 'milonga', nome: 'Milonga', bpm: 88, passos: 16, swing: 0, escala: HARMONICA, setimas: false,
    progressoes: [[0, 0, 4, 4], [3, 0, 4, 0], [5, 3, 4, 0]],
    baixo: 'R..5..R.R..5..R.', acomp: { timbre: 'violao', padrao: 'x..x..x.x..x..x.' },
    lead: { timbre: 'violao', oitava: 4, densidade: 0.5 },
    bateria: [{ voz: 'bumbo', padrao: 'x..o..o.x..o..o.', vol: 0.35 }],
  },
  reggae: {
    id: 'reggae', nome: 'Reggae', bpm: 76, passos: 16, swing: 0.08, escala: DORICO, setimas: true,
    progressoes: [[0, 0, 3, 3], [0, 6, 3, 6], [0, 3, 4, 0]],
    baixo: 'R..R..5.....3.R.', acomp: { timbre: 'teclado', padrao: '....x.......x...' },
    lead: { timbre: 'melodica', oitava: 5, densidade: 0.35 },
    bateria: [
      { voz: 'bumbo', padrao: '........x.......' }, { voz: 'aro', padrao: '........x.......', vol: 0.6 },
      { voz: 'chimbal', padrao: 'o.o.o.o.o.o.o.o.', vol: 0.35 },
    ],
  },
  rock: {
    id: 'rock', nome: 'Rock', bpm: 124, passos: 16, swing: 0, escala: MENOR, escalaMelodia: PENTA_MENOR, setimas: false,
    progressoes: [[0, 5, 6, 0], [0, 3, 5, 6], [5, 6, 0, 0]],
    baixo: 'R.R.R.R.R.R.R.R.', acomp: { timbre: 'guitarra-dist', padrao: 'x.x.x.x.x.x.x.x.' },
    lead: { timbre: 'guitarra-dist', oitava: 5, densidade: 0.45 },
    bateria: [
      { voz: 'bumbo', padrao: 'x.....x.x.......' }, { voz: 'caixa', padrao: '....x.......x...', vol: 0.7 },
      { voz: 'chimbal', padrao: 'x.x.x.x.x.x.x.x.', vol: 0.4 },
    ],
  },
  mpb: {
    id: 'mpb', nome: 'MPB', bpm: 86, passos: 16, swing: 0.06, escala: MIXO, setimas: true,
    progressoes: [[0, 3, 2, 5], [0, 6, 3, 4], [3, 2, 1, 4]],
    baixo: 'R.....5.R...3...', acomp: { timbre: 'piano', padrao: 'x..x..x...x.....' },
    lead: { timbre: 'flauta', oitava: 5, densidade: 0.35 },
    bateria: [
      { voz: 'bumbo', padrao: 'x.....x.........', vol: 0.5 }, { voz: 'aro', padrao: '....x.......x...', vol: 0.45 },
      { voz: 'chimbal', padrao: 'x.x.x.x.x.x.x.x.', vol: 0.2 },
    ],
  },
  choro: {
    id: 'choro', nome: 'Choro', bpm: 100, passos: 16, swing: 0.05, escala: MAIOR, setimas: true,
    progressoes: [[0, 4, 4, 0], [0, 5, 1, 4], [3, 3, 0, 4]],
    baixo: 'R.3.5.3.R.3.5.8.', acomp: { timbre: 'cavaco', padrao: 'x.xx.x.xx.xx.x.x' },
    lead: { timbre: 'flauta', oitava: 5, densidade: 0.9 },
    bateria: [{ voz: 'pandeiro', padrao: 'xoxxxoxxxoxxxoxx', vol: 0.55 }],
  },
  funk: {
    id: 'funk', nome: 'Funk', bpm: 130, passos: 16, swing: 0, escala: MENOR, setimas: false,
    progressoes: [[0, 0, 5, 6], [0, 3, 0, 4]],
    baixo: 'R.....R...R.....', acomp: { timbre: 'pad', padrao: 'X...............' },
    lead: { timbre: 'sintetizador', oitava: 5, densidade: 0.35 },
    bateria: [
      { voz: 'bumbo', padrao: 'x..x......x..x..' }, { voz: 'atabaque', padrao: '..x..x.x..x..x.x', vol: 0.6 },
      { voz: 'palmas', padrao: '....x.......x...', vol: 0.55 },
    ],
  },
  rap: {
    id: 'rap', nome: 'Rap', bpm: 88, passos: 16, swing: 0.12, escala: MENOR, setimas: true,
    progressoes: [[0, 0, 5, 5], [0, 3, 0, 4]],
    baixo: 'R......R..R.....', acomp: { timbre: 'piano', padrao: 'x.......x.....x.' },
    lead: { timbre: 'piano', oitava: 5, densidade: 0.25 },
    bateria: [
      { voz: 'bumbo', padrao: 'x......x..x.....' }, { voz: 'caixa', padrao: '....x.......x...', vol: 0.7 },
      { voz: 'chimbal', padrao: 'x.x.x.x.x.x.x.x.', vol: 0.35 },
    ],
  },
  coco: {
    id: 'coco', nome: 'Coco de roda', bpm: 108, passos: 16, swing: 0.05, escala: MIXO, setimas: false,
    progressoes: [[0, 0, 4, 0], [0, 3, 4, 0]],
    baixo: 'R..5..R.R..5..R.', acomp: null,
    lead: { timbre: 'pifano', oitava: 6, densidade: 0.55 },
    bateria: [
      { voz: 'zabumba', padrao: 'x..x..x.x..x..x.' }, { voz: 'ganza', padrao: 'xoxoxoxoxoxoxoxo', vol: 0.55 },
      { voz: 'pandeiro', padrao: 'x...x.x.x...x.x.', vol: 0.5 }, { voz: 'palmas', padrao: '..x...x...x...x.', vol: 0.45 },
    ],
  },
  ciranda: {
    id: 'ciranda', nome: 'Ciranda', bpm: 84, passos: 16, swing: 0.04, escala: MAIOR, setimas: false,
    progressoes: [[0, 4, 4, 0], [3, 0, 4, 0]],
    baixo: 'R.......5.......', acomp: { timbre: 'violao', padrao: 'x...x...x...x...' },
    lead: { timbre: 'metais', oitava: 5, densidade: 0.4 },
    bateria: [{ voz: 'bumbo', padrao: 'x...............' }, { voz: 'ganza', padrao: 'x.o.x.o.x.o.x.o.', vol: 0.45 }, { voz: 'caixa', padrao: '....o...o...o...', vol: 0.3 }],
  },
  batuque: {
    id: 'batuque', nome: 'Batuque', bpm: 104, passos: 16, swing: 0.07, escala: MIXO, setimas: false,
    progressoes: [[0, 0, 6, 0], [0, 3, 0, 4]],
    baixo: 'R..R..5.R.......', acomp: { timbre: 'violao', padrao: 'x..x..x...x..x..' },
    lead: { timbre: 'flauta', oitava: 5, densidade: 0.45 },
    bateria: [
      { voz: 'atabaque', padrao: 'x.ox.ox.x.oxx.o.' }, { voz: 'alfaia', padrao: 'x.......x.......', vol: 0.7 },
      { voz: 'maraca', padrao: 'xoxoxoxoxoxoxoxo', vol: 0.5 }, { voz: 'palmas', padrao: '..x..x....x..x..', vol: 0.4 },
    ],
  },
  valsa: {
    id: 'valsa', nome: 'Valsa e polca de colônia', bpm: 138, passos: 12, swing: 0, escala: MAIOR, setimas: false,
    progressoes: [[0, 4, 4, 0], [0, 3, 4, 0], [3, 0, 4, 0]],
    baixo: 'R...........', acomp: { timbre: 'sanfona', padrao: '....x...x...' },
    lead: { timbre: 'violino', oitava: 5, densidade: 0.6 },
    bateria: [{ voz: 'bumbo', padrao: 'x...........', vol: 0.5 }],
  },
  indigena: {
    id: 'indigena', nome: 'Flautas e maracás', bpm: 80, passos: 16, swing: 0, escala: MAIOR, escalaMelodia: PENTA_MAIOR, setimas: false,
    progressoes: [[0, 0, 0, 0], [0, 0, 4, 0]],
    baixo: 'R...............', acomp: { timbre: 'pad', padrao: 'X...............' },
    lead: { timbre: 'flauta', oitava: 5, densidade: 0.35 },
    bateria: [{ voz: 'bumbo', padrao: 'x...x...x...x...', vol: 0.55 }, { voz: 'maraca', padrao: 'x.x.x.x.x.x.x.x.', vol: 0.5 }],
  },
};

/** Palavras da trilha de data/ufs/traits.json → gênero (a primeira regra que casa vence). */
const REGRAS: [RegExp, string][] = [
  [/samba de roda|samba de pareia|coco|zambe|xaxado/, 'coco'],
  [/bossa/, 'bossa'],
  [/samba/, 'samba'],
  [/ijexa/, 'ijexa'],
  [/axe/, 'axe'],
  [/xote/, 'xote'],
  [/forro|baiao/, 'forro'],
  [/frevo/, 'frevo'],
  [/manguebeat/, 'mangue'],
  [/maracatu/, 'maracatu'],
  [/tecnobrega/, 'tecnobrega'],
  [/guitarrada/, 'guitarrada'],
  [/carimbo|beiradao/, 'carimbo'],
  [/boi-de-mamao|acoriana|polonesa|fandango/, 'valsa'],
  [/boi/, 'boi'],
  [/moda de viola|viola caipira|catira|violao caboclo|cururu/, 'moda'],
  [/sertanejo|pequi/, 'sertanejo'],
  [/rasqueado|siriri/, 'rasqueado'],
  [/polca/, 'polca'],
  [/chamame/, 'chamame'],
  [/milonga/, 'milonga'],
  [/reggae/, 'reggae'],
  [/rock/, 'rock'],
  [/choro/, 'choro'],
  [/funk/, 'funk'],
  [/rap/, 'rap'],
  [/ciranda/, 'ciranda'],
  [/marabaixo|batuque|tambor de crioula|congo|congado/, 'batuque'],
  [/indigena|macuxi/, 'indigena'],
  [/mpb|clube da esquina/, 'mpb'],
];

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function generoDe(palavra: string): Genero {
  const p = semAcento(palavra);
  for (const [re, id] of REGRAS) if (re.test(p)) return GENEROS[id];
  return GENEROS.mpb;
}

/** Trilha de festa: o Carnaval toca o ritmo da terra; o São João, forró (ou boi no Norte/MA). */
export function generoDeFesta(festa: 'carnaval' | 'junina' | 'fogos', sigla: string): Genero | null {
  if (festa === 'carnaval') {
    if (sigla === 'PE') return GENEROS.frevo;
    if (sigla === 'BA') return GENEROS.axe;
    if (['AM', 'PA', 'AP'].includes(sigla)) return GENEROS.carimbo;
    return GENEROS.samba;
  }
  if (festa === 'junina') return ['MA', 'AM', 'PA'].includes(sigla) ? GENEROS.boi : GENEROS.forro;
  return null;
}
