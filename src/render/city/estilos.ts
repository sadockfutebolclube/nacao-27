/**
 * Arquitetura regional (Fase 8): paleta de fachadas, telhados e muros por UF, inspirada nas
 * descrições de data/ufs/traits.json — casario colonial colorido no Nordeste e em MG, madeira e zinco
 * na Amazônia, modernismo branco em Brasília, telhados escuros e íngremes no Sul, concreto no Sudeste.
 */

export interface EstiloRegional {
  id: string;
  nome: string;
  paredesCasa: string[];
  paredesPredio: string[];
  telhas: string[];
  /** altura relativa do telhado de telha (1 = padrão; o Sul usa telhados mais íngremes) */
  inclinacao: number;
  /** fração das casas de laje que ganham telhado de telha */
  telhaEmCasas: number;
  muros: string[];
  /** fração das casas pintadas de cores vivas (o resto usa a paleta clara) */
  vivas: number;
}

const BRANCOS = ['#f4f1ea', '#ece7dc', '#f8f6f0', '#e6e1d5'];
const ESTILOS: Record<string, EstiloRegional> = {
  colonial: {
    id: 'colonial', nome: 'Casario colonial',
    paredesCasa: ['#f2c94c', '#e2725b', '#4a90c2', '#7dbb7a', '#f6efe0', '#c94f3d', '#e6a23c', '#8e6bbf', '#f28fb0', '#2f9e9e', ...BRANCOS],
    paredesPredio: ['#f0e6d0', '#e8dcc0', '#d6c7a8', '#efe3c8', '#c7d3d8', '#f3eadb', '#e9c46a'],
    telhas: ['#a5502f', '#b8623b', '#9c4628', '#b5583a'], inclinacao: 1, telhaEmCasas: 0.65, muros: ['#f4ead5', '#e9d8b5', '#f7f2e6'], vivas: 0.7,
  },
  sertao: {
    id: 'sertao', nome: 'Casas de varanda do sertão e prédios de orla',
    paredesCasa: ['#f7f3e8', '#f3e4c2', '#e9d3a8', '#d7e6e9', '#f0c987', '#e7b98f', '#cfe0c6', ...BRANCOS],
    paredesPredio: ['#f2f0ea', '#e5e2da', '#dfe7ea', '#ece4d4', '#cfd8dc'],
    telhas: ['#b0613c', '#a5502f', '#c06a43'], inclinacao: 0.9, telhaEmCasas: 0.45, muros: ['#f6efe0', '#ece0c8'], vivas: 0.35,
  },
  amazonico: {
    id: 'amazonico', nome: 'Madeira, zinco e belle époque da borracha',
    paredesCasa: ['#2f7fb5', '#3fa37a', '#e8c547', '#d9534f', '#8e5a3c', '#a9744f', '#f4efe2', '#5bc0be', '#c97b4a', '#7b5a3a'],
    paredesPredio: ['#efe8d8', '#e0d7c2', '#cfe3e6', '#f2e3c6', '#d8c3a5'],
    telhas: ['#8d99a6', '#9aa6b2', '#7f8b96', '#a5502f'], inclinacao: 0.8, telhaEmCasas: 0.75, muros: ['#e7dcc6', '#cbbd9e'], vivas: 0.75,
  },
  modernista: {
    id: 'modernista', nome: 'Modernismo de concreto',
    paredesCasa: [...BRANCOS, '#e3e0d8', '#d8dcd8', '#f1e9d2', '#cfd6d9'],
    paredesPredio: ['#f5f5f0', '#ecece6', '#e1e3df', '#d3d7d6', '#f2efe6'],
    telhas: ['#9a9a95', '#b0603d'], inclinacao: 0.8, telhaEmCasas: 0.15, muros: ['#efefea', '#dcdcd5'], vivas: 0.15,
  },
  agro: {
    id: 'agro', nome: 'Casas térreas largas e galpões do agro',
    paredesCasa: ['#f1e2c4', '#e8cfa1', '#d9b98c', '#f5ead2', '#e3c3a0', '#c9b79a', '#f3dcc0', ...BRANCOS],
    paredesPredio: ['#ede4d3', '#e2d4bb', '#d9cbb1', '#f1e9da'],
    telhas: ['#b5643d', '#a65a35', '#c27448'], inclinacao: 0.85, telhaEmCasas: 0.6, muros: ['#e9dcc1', '#d8c4a0'], vivas: 0.3,
  },
  metropole: {
    id: 'metropole', nome: 'Concreto, tijolo e prédios caixote',
    paredesCasa: ['#f2e6c9', '#f7d9a8', '#e8b4a0', '#cfe3d4', '#f4c2c2', '#fff4d6', '#d9e7f2', '#f0d58c', '#e6a57e', '#bcd9a0', '#fbfaf5'],
    paredesPredio: ['#e9e4d8', '#d8d2c4', '#c9c1b0', '#e8dcc8', '#b8c4c8', '#f0ece4', '#d5c3a5', '#8fb3c9', '#9cbfa7', '#d9a35b', '#c4cfd6'],
    telhas: ['#a5502f', '#b8623b', '#8f4a2e'], inclinacao: 1, telhaEmCasas: 0.25, muros: ['#e8e2d6', '#cfc8ba', '#f3eee4', '#b9b4aa'], vivas: 0.5,
  },
  europeu: {
    id: 'europeu', nome: 'Enxaimel, madeira polonesa e casario açoriano',
    paredesCasa: ['#f4efe2', '#efe2c6', '#e8d2b0', '#f6f0e6', '#d9c7a7', '#c9d6c8', '#e7c9a9', '#b55a3c', '#f3e9d2'],
    paredesPredio: ['#b5653f', '#a95a37', '#e9e2d4', '#d7cdbd', '#c8beb0', '#efe9df'],
    telhas: ['#5a3328', '#6b3a2a', '#4a3530', '#7a4232'], inclinacao: 1.7, telhaEmCasas: 0.85, muros: ['#efe7d8', '#d9cfbd'], vivas: 0.25,
  },
};

const POR_UF: Record<string, string> = {
  BA: 'colonial', MA: 'colonial', PE: 'colonial', AL: 'colonial', SE: 'colonial', PB: 'colonial', MG: 'colonial',
  CE: 'sertao', RN: 'sertao', PI: 'sertao',
  AM: 'amazonico', PA: 'amazonico', AC: 'amazonico', AP: 'amazonico', RR: 'amazonico', RO: 'amazonico',
  DF: 'modernista', TO: 'modernista',
  GO: 'agro', MT: 'agro', MS: 'agro',
  SP: 'metropole', RJ: 'metropole', ES: 'metropole',
  PR: 'europeu', SC: 'europeu', RS: 'europeu',
};

export function estiloRegional(sigla: string | undefined): EstiloRegional {
  return ESTILOS[POR_UF[sigla ?? ''] ?? 'metropole'];
}
