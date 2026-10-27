/**
 * Tutorial com assessor (Fase 10): um roteiro de passos por modo e dicas de contexto.
 * Cada passo avança sozinho quando `feito` vira verdadeiro (o jogador fez o que foi pedido) ou com o botão.
 * As dicas aparecem uma única vez quando a situação acontece (vistas ficam guardadas no navegador).
 */
import type { Stats } from '../../sim/protocol';
import type { Presidencia } from '../../sim/presidente/presidencia';

export interface CtxCidade {
  stats: Stats;
  governo: string | null;
  equipamentos: string[];
  velocidade: number;
}
export interface CtxPres { p: Presidencia; painel: string; ufSelecionada: string | null; velocidade: number }

export interface Passo<C> { id: string; titulo: string; texto: string; feito?: (c: C) => boolean; botao?: string; so?: (c: C) => boolean }
export interface Dica<C> { id: string; texto: string; quando: (c: C) => boolean; tom?: 'alerta' | 'info' }

export interface Assessor { nome: string; cargo: string; genero: 'f' | 'm'; retrato: number; idade: number }
export const ASSESSOR_CIDADE: Assessor = { nome: 'Celina Rocha', cargo: 'Chefe de gabinete', genero: 'f', retrato: 271828, idade: 54 };
export const ASSESSOR_PRES: Assessor = { nome: 'Otávio Lins', cargo: 'Ministro-chefe da Casa Civil', genero: 'm', retrato: 314159, idade: 61 };

const temEstado = (c: CtxCidade) => !!c.stats.estado;

export const PASSOS_CIDADE: Passo<CtxCidade>[] = [
  { id: 'boas-vindas', titulo: 'Bem-vindo(a) ao governo', texto: 'Sou a Celina, sua chefe de gabinete. Vou te acompanhar nos primeiros dias. Mova a câmera com WASD ou as setas, gire com Q/E e aproxime com a roda do mouse.', botao: 'Vamos lá' },
  { id: 'via', titulo: 'Primeiro, ruas', texto: 'Cidade nasce de rua. Abra "Vias" na barra de baixo (tecla V) e trace uma avenida: clique no começo e no fim. Se passar pela água, vira ponte.', feito: (c) => c.stats.lotes > 0 },
  { id: 'zona', titulo: 'Onde as pessoas vão morar', texto: 'Agora "Zonas" (tecla Z): pinte residencial de baixa densidade ao longo da avenida. Os lotes só aparecem colados nas vias.', feito: (c) => c.stats.lotesZoneados > 0 },
  { id: 'agua-luz', titulo: 'Água e luz', texto: 'Sem água e energia ninguém se muda. Em "Utilidades", ponha um reservatório e uma subestação ligados à mesma malha de ruas.', feito: (c) => c.stats.agua.capacidade > 0 && c.stats.energia.capacidade > 0 },
  { id: 'tempo', titulo: 'Deixe a cidade crescer', texto: 'Solte o tempo: Espaço despausa, 1/2/3 mudam a velocidade. Acompanhe a demanda RCI no canto e zoneie comércio e indústria quando ela pedir.', feito: (c) => c.stats.populacao >= 150 },
  { id: 'servicos', titulo: 'Escola e posto de saúde', texto: 'Bairro bom tem UBS e escola por perto. Estão em "Serviços". Eles valorizam os lotes e seguram a aprovação.', feito: (c) => c.equipamentos.some((e) => e === 'ubs' || e === 'escola' || e === 'upa') },
  { id: 'palacio', titulo: 'O Palácio', texto: 'Você governa o estado inteiro, não só a cidade. Aperte G para abrir o Palácio: Tesouro com os números reais do SICONFI, secretarias, obras e a Assembleia.', feito: (c) => c.governo !== null, so: temEstado },
  { id: 'loa', titulo: 'O calendário que manda', texto: 'Em agosto você manda a LOA do ano seguinte à Assembleia, que vota em dezembro. Fique de olho no limite de pessoal (49% da RCL) e nos mínimos de saúde (12%) e educação (25%).', botao: 'Entendi', so: temEstado },
  { id: 'politica', titulo: 'Política é soma', texto: 'Na aba Assembleia você vê quem vota com você. Emendas, cargos e conversas compram votos — e custam capital político, dinheiro e, às vezes, escândalos.', botao: 'Entendi', so: temEstado },
  { id: 'fim', titulo: 'É com você', texto: 'Decisões urgentes aparecem no canto direito, com prazo. Se quiser rever estas dicas, é só religar o tutorial no menu de pausa (Esc). Boa sorte!', botao: 'Obrigado, Celina' },
];

export const DICAS_CIDADE: Dica<CtxCidade>[] = [
  { id: 'sem-energia', texto: 'A energia não dá conta: tem gente sem luz. Ponha outra subestação ou uma usina na malha.', quando: (c) => c.stats.populacao > 100 && c.stats.energia.uso > c.stats.energia.capacidade * 1.02, tom: 'alerta' },
  { id: 'sem-agua', texto: 'Falta água nos bairros. Mais um reservatório — ou uma ETA, se estiver perto de um rio ou do mar.', quando: (c) => c.stats.populacao > 100 && c.stats.agua.uso > c.stats.agua.capacidade * 1.02, tom: 'alerta' },
  { id: 'esgoto', texto: 'O esgoto está indo in natura para a água. Uma ETE resolve, e a orla volta a valer alguma coisa.', quando: (c) => c.stats.populacao > 2500 && c.stats.esgoto.tratadoPct < 0.3 },
  { id: 'caixa', texto: 'O caixa das obras da cidade ficou negativo. Segure novas construções ou aumente o repasse na LOA.', quando: (c) => !c.stats.sandbox && c.stats.caixa < 0, tom: 'alerta' },
  { id: 'loa-janela', texto: 'Chegou agosto: hora de elaborar a LOA do ano que vem. O aviso está no canto direito.', quando: (c) => c.stats.estado?.loaStatus === 'janela' },
  { id: 'alerta-lrf', texto: 'O Tesouro acendeu um alerta. Abra o Palácio (G) para ver o que está fora da linha antes que vire crise.', quando: (c) => (c.stats.estado?.alertas.length ?? 0) > 0, tom: 'alerta' },
  { id: 'decisoes', texto: 'Há várias decisões esperando. Sem resposta, vale a opção padrão quando o prazo vence — nem sempre é a melhor.', quando: (c) => c.stats.eventos.pendentes.length >= 2 },
  { id: 'eleicao', texto: 'Ano eleitoral! A partir de julho vêm as condutas vedadas: nada de convênios nem publicidade. Planeje as obras antes.', quando: (c) => !!c.stats.estado?.eleicao },
  { id: 'aprovacao-baixa', texto: 'A aprovação está perigosamente baixa. Abaixo de 25%, a Assembleia começa a falar em impeachment.', quando: (c) => !!c.stats.estado && c.stats.estado.aprovacao < 28, tom: 'alerta' },
];

export const PASSOS_PRES: Passo<CtxPres>[] = [
  { id: 'boas-vindas', titulo: 'Bem-vindo(a) ao Planalto', texto: 'Sou o Otávio, da Casa Civil. A economia que você recebeu é a real de hoje, segundo o Banco Central. O tempo está parado: nada acontece até você soltá-lo.', botao: 'Vamos lá' },
  { id: 'economia', titulo: 'Os números que derrubam governos', texto: 'Abra "Economia" à direita. Inflação, dólar e desemprego mexem direto na aprovação. A Selic é do Banco Central, não sua.', feito: (c) => c.painel === 'economia' },
  { id: 'orcamento', titulo: 'A meta fiscal', texto: 'Em "Orçamento" está a meta de primário. O governo começa abaixo dela: contingenciar ou aprovar receita nova é o caminho. Descumprir aciona gatilhos — e vira munição para impeachment.', feito: (c) => c.painel === 'orcamento' },
  { id: 'congresso', titulo: 'Nada passa sem o Congresso', texto: 'Em "Congresso", envie sua primeira medida. MP vale na hora mas caduca em 120 dias; PEC exige 3/5 em dois turnos. Veja a chance de aprovação antes de gastar capital político.', feito: (c) => c.p.propostas.length > 0 },
  { id: 'mapa', titulo: 'O país é grande', texto: 'Clique num estado do mapa: aprovação, governador e bancada. Viagens e obras federais compram apoio regional.', feito: (c) => c.ufSelecionada !== null },
  { id: 'tempo', titulo: 'Solte o tempo', texto: 'Espaço despausa; 1, 2 e 3 mudam a velocidade. O jogo pausa sozinho quando chega uma decisão.', feito: (c) => c.velocidade > 0 },
  { id: 'fim', titulo: 'Conte comigo', texto: 'Copom, STF, governadores: eu aviso quando algo pedir sua atenção. Boa sorte, Presidente.', botao: 'Obrigado, Otávio' },
];

export const DICAS_PRES: Dica<CtxPres>[] = [
  { id: 'meta-risco', texto: 'Pelo andar das contas, a meta fiscal deste ano não fecha. Contingenciar agora dói menos que os gatilhos em janeiro.', quando: ({ p }) => p.mes >= 6 && p.eco.primario < (p.metaPorAno[p.ano] ?? 0) - 0.3 && p.contingenciamento === 0, tom: 'alerta' },
  { id: 'dolar', texto: 'O dólar disparou. Vai bater na inflação em alguns meses. Sinalizar compromisso fiscal costuma acalmar mais que bronca no BC.', quando: ({ p }) => p.eco.cambio > p.eco.cambio0 * 1.12, tom: 'alerta' },
  { id: 'base-fraca', texto: 'Menos de 45% da Câmara está com a gente. Um ministério para um partido de centro muda isso — a um preço.', quando: ({ p }) => p.base_() < 0.45, tom: 'alerta' },
  { id: 'mp-caducando', texto: 'Uma MP está perto de caducar. Peça urgência ou converse com os líderes, senão os efeitos acabam.', quando: ({ p }) => p.propostas.some((x) => x.status === 'tramitando' && x.caducaEm !== undefined && x.caducaEm - p.t < 25), tom: 'alerta' },
  { id: 'vaga-stf', texto: 'Abriu vaga no STF. Uma indicação aliada pesa nos julgamentos por décadas — mas a sabatina é mais dura.', quando: ({ p }) => !!p.vagaSTF },
  { id: 'indicar-bc', texto: 'Está na hora de indicar o próximo presidente do Banco Central. O mercado vai ler o nome como um recado.', quando: ({ p }) => !!p.bc.indicacao },
  { id: 'gatilhos', texto: 'A meta foi descumprida e os gatilhos estão ligados: nada de despesa nova este ano. Duas metas perdidas viram argumento para impeachment.', quando: ({ p }) => p.gatilhos, tom: 'alerta' },
  { id: 'ano-eleitoral', texto: 'Ano de eleição. Na campanha (de agosto em diante), cada viagem a um estado vale votos lá.', quando: ({ p }) => p.anoEleitoral() && p.mes >= 3 },
  { id: 'aprovacao-baixa', texto: 'Aprovação abaixo de 25%. Com crise fiscal ou escândalo, o presidente da Câmara pode aceitar um pedido de impeachment.', quando: ({ p }) => p.aprovacao < 25, tom: 'alerta' },
];
