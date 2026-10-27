/**
 * Listas de nomes fictícios/genéricos para ruas, bairros e cidadãos. Nada de políticos reais:
 * logradouros usam datas, natureza, ofícios e figuras históricas consagradas em toponímia.
 */
import { hash32 } from '../sim/core/rng';

export const TIPOS_RUA = ['Rua', 'Rua', 'Rua', 'Travessa', 'Ladeira', 'Rua'];
export const TIPOS_AVENIDA = ['Avenida', 'Avenida', 'Boulevard', 'Estrada'];

export const NOMES_LOGRADOURO = [
  'das Laranjeiras', 'dos Ipês', 'das Palmeiras', 'Sete de Setembro', 'Quinze de Novembro', 'Treze de Maio',
  'da Alegria', 'dos Pescadores', 'do Comércio', 'da Matriz', 'Tiradentes', 'das Flores', 'do Sol',
  'São João', 'Santo Antônio', 'Nossa Senhora da Glória', 'dos Andradas', 'Barão do Rio Branco',
  'Marechal Rondon', 'Visconde de Mauá', 'Machado de Assis', 'Carmen Miranda', 'Pixinguinha',
  'Chiquinha Gonzaga', 'Cartola', 'Luiz Gonzaga', 'Clarice Lispector', 'Cândido Portinari',
  'dos Bandeirantes', 'das Acácias', 'dos Coqueiros', 'do Mercado', 'da Feira', 'dos Operários',
  'das Rendeiras', 'dos Jangadeiros', 'do Cais', 'da Estação', 'do Bonde', 'dos Mangues',
  'Brasil', 'Atlântica', 'Beira-Mar', 'das Américas', 'Getúlio Vargas', 'Santos Dumont',
  'Princesa Isabel', 'Dom Pedro II', 'Paulo Freire', 'Zumbi dos Palmares', 'Dandara',
  'Oscar Niemeyer', 'Lina Bo Bardi', 'Villa-Lobos', 'Tom Jobim', 'Ary Barroso', 'do Samba',
  'do Forró', 'da Ciranda', 'Monteiro Lobato', 'Cecília Meireles', 'Jorge Amado', 'Rachel de Queiroz',
];

export function nomeRua(seed: number, avenida: boolean): string {
  const h = hash32(seed);
  const tipos = avenida ? TIPOS_AVENIDA : TIPOS_RUA;
  return `${tipos[h % tipos.length]} ${NOMES_LOGRADOURO[(h >>> 8) % NOMES_LOGRADOURO.length]}`;
}

const PREFIXO_BAIRRO = ['Jardim', 'Vila', 'Parque', 'Recreio', 'Morro', 'Alto', 'Conjunto', 'Cidade', 'Vale', 'Praia'];
const NUCLEO_BAIRRO = [
  'das Mangueiras', 'Esperança', 'São Jorge', 'Bela Vista', 'Primavera', 'dos Coqueiros', 'Santa Luzia',
  'Boa Viagem', 'Novo Horizonte', 'Ipê Amarelo', 'Maravilha', 'das Gaivotas', 'do Cruzeiro', 'Aurora',
  'Paraíso', 'Itapuã', 'Iracema', 'Tabajara', 'Guarani', 'Jacarandá', 'Sereno', 'Cajueiro', 'Imperial',
];

/** Bairro de um ponto: grade de 512 m com nomes estáveis por seed. */
export function bairroEm(seed: number, x: number, z: number): string {
  const i = Math.floor((x + 1536) / 512), j = Math.floor((z + 1536) / 512);
  const h = hash32(seed ^ (i * 73856093) ^ (j * 19349663));
  return `${PREFIXO_BAIRRO[h % PREFIXO_BAIRRO.length]} ${NUCLEO_BAIRRO[(h >>> 7) % NUCLEO_BAIRRO.length]}`;
}

export const PRENOMES = [
  'Maria', 'José', 'Ana', 'João', 'Francisca', 'Antônio', 'Juliana', 'Carlos', 'Adriana', 'Paulo',
  'Márcia', 'Lucas', 'Aline', 'Rafael', 'Patrícia', 'Gabriel', 'Sandra', 'Thiago', 'Luana', 'Wesley',
  'Jéssica', 'Kauã', 'Raimunda', 'Edson', 'Cleide', 'Railson', 'Daiane', 'Josué', 'Valdirene', 'Nicolas',
  'Tainá', 'Severino', 'Iracema', 'Jurandir', 'Rosângela', 'Heitor', 'Vitória', 'Davi', 'Alice', 'Enzo',
];
export const SOBRENOMES = [
  'Silva', 'Santos', 'Oliveira', 'Souza', 'Lima', 'Pereira', 'Ferreira', 'Costa', 'Rodrigues', 'Almeida',
  'Nascimento', 'Carvalho', 'Araújo', 'Ribeiro', 'Gomes', 'Barbosa', 'Rocha', 'Moraes', 'Cavalcanti', 'Bezerra',
];
export const PROFISSOES = [
  'motorista de aplicativo', 'professora da rede estadual', 'pedreiro', 'enfermeira', 'ambulante',
  'caixa de supermercado', 'técnico de TI', 'porteiro', 'cabeleireira', 'auxiliar administrativo',
  'estudante', 'aposentado', 'entregador', 'vendedora', 'eletricista', 'servidor público', 'cozinheira',
  'mecânico', 'diarista', 'garçom', 'programadora', 'motoboy', 'farmacêutica', 'pescador', 'vigilante',
];

export function cidadao(seed: number) {
  const h = hash32(seed);
  const h2 = hash32(h);
  return {
    nome: `${PRENOMES[h % PRENOMES.length]} ${SOBRENOMES[(h >>> 9) % SOBRENOMES.length]}`,
    idade: 18 + (h2 % 62),
    profissao: PROFISSOES[(h2 >>> 8) % PROFISSOES.length],
  };
}

/** "do Rio de Janeiro", "da Bahia", "de São Paulo"… */
const PREPOSICAO: Record<string, string> = {
  AC: 'do', AL: 'de', AP: 'do', AM: 'do', BA: 'da', CE: 'do', DF: 'do', ES: 'do', GO: 'de', MA: 'do', MT: 'de', MS: 'de', MG: 'de',
  PA: 'do', PB: 'da', PR: 'do', PE: 'de', PI: 'do', RJ: 'do', RN: 'do', RS: 'do', RO: 'de', RR: 'de', SC: 'de', SP: 'de', SE: 'de', TO: 'do',
};
export const deUF = (sigla: string, nome: string) => `${PREPOSICAO[sigla] ?? 'de'} ${nome}`;
