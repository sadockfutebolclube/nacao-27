/**
 * Calendário das festas de cada UF (Fase 6): datas reais (Carnaval e Festa da Penha pela Páscoa,
 * São João em 24/6, Círio no 2º domingo de outubro…) a partir dos nomes em data/ufs/traits.json.
 */

export type TipoFesta = 'carnaval' | 'junina' | 'reveillon' | 'boi' | 'religiosa' | 'cultural' | 'agro' | 'show';

export interface Festa { nome: string; tipo: TipoFesta; inicio: number; fim: number; /** atrai turistas (0–1) */ turismo: number }

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher) como dia do ano (1–366). */
export function pascoa(ano: number): { mes: number; dia: number } {
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
  return { mes, dia };
}

const ACUM = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
const bissexto = (a: number) => (a % 4 === 0 && a % 100 !== 0) || a % 400 === 0;
export function diaDoAnoReal(ano: number, mes: number, dia: number): number {
  return ACUM[mes - 1] + dia + (mes > 2 && bissexto(ano) ? 1 : 0);
}
/** Segundo domingo de um mês (dia do mês). */
function segundoDomingo(ano: number, mes: number): number {
  const dow = new Date(Date.UTC(ano, mes - 1, 1)).getUTCDay();
  return 1 + ((7 - dow) % 7) + 7;
}

interface Regra { re: RegExp; tipo: TipoFesta; turismo: number; data: (ano: number) => [number, number]; dur: number }
const fixo = (mes: number, dia: number) => () => [mes, dia] as [number, number];
const REGRAS: Regra[] = [
  { re: /carnatal/i, tipo: 'carnaval', turismo: 0.6, data: fixo(12, 5), dur: 4 },
  { re: /fortal/i, tipo: 'carnaval', turismo: 0.6, data: fixo(7, 24), dur: 4 },
  { re: /salinas folia/i, tipo: 'carnaval', turismo: 0.3, data: fixo(7, 10), dur: 3 },
  {
    re: /carnaval/i, tipo: 'carnaval', turismo: 1, dur: 6,
    data: (ano) => { const p = pascoa(ano); const d = diaDoAnoReal(ano, p.mes, p.dia) - 51; const dt = new Date(Date.UTC(ano, 0, d)); return [dt.getUTCMonth() + 1, dt.getUTCDate()]; },
  },
  { re: /parintins/i, tipo: 'boi', turismo: 0.9, data: fixo(6, 27), dur: 3 },
  { re: /bumba/i, tipo: 'boi', turismo: 0.6, data: fixo(6, 20), dur: 10 },
  { re: /são joão|junina|arraial|arraiá|forró caju|pavulagem|flor do maracujá/i, tipo: 'junina', turismo: 0.7, data: fixo(6, 20), dur: 6 },
  { re: /são pedro/i, tipo: 'junina', turismo: 0.4, data: fixo(6, 28), dur: 2 },
  { re: /réveillon/i, tipo: 'reveillon', turismo: 0.8, data: fixo(12, 31), dur: 1 },
  { re: /círio/i, tipo: 'religiosa', turismo: 0.7, data: (ano) => [10, segundoDomingo(ano, 10)], dur: 1 },
  { re: /oktoberfest/i, tipo: 'cultural', turismo: 0.7, data: fixo(10, 8), dur: 10 },
  { re: /festa da uva/i, tipo: 'agro', turismo: 0.5, data: fixo(2, 20), dur: 10 },
  { re: /farroupilha/i, tipo: 'cultural', turismo: 0.3, data: fixo(9, 14), dur: 7 },
  { re: /rock in rio/i, tipo: 'show', turismo: 0.8, data: fixo(9, 13), dur: 7 },
  { re: /lavagem do bonfim/i, tipo: 'religiosa', turismo: 0.4, data: fixo(1, 15), dur: 1 },
  { re: /virada cultural/i, tipo: 'cultural', turismo: 0.4, data: fixo(5, 18), dur: 2 },
  { re: /parada lgbt/i, tipo: 'cultural', turismo: 0.6, data: fixo(6, 14), dur: 1 },
  { re: /festival de inverno/i, tipo: 'cultural', turismo: 0.4, data: fixo(7, 12), dur: 10 },
  { re: /pecuária/i, tipo: 'agro', turismo: 0.4, data: fixo(5, 10), dur: 10 },
  { re: /expoacre/i, tipo: 'agro', turismo: 0.3, data: fixo(7, 27), dur: 8 },
  { re: /expovel/i, tipo: 'agro', turismo: 0.2, data: fixo(8, 20), dur: 5 },
  { re: /cavalhadas/i, tipo: 'cultural', turismo: 0.3, data: fixo(5, 24), dur: 3 },
  { re: /festa do divino/i, tipo: 'religiosa', turismo: 0.3, data: fixo(5, 30), dur: 3 },
  { re: /são josé/i, tipo: 'religiosa', turismo: 0.2, data: fixo(3, 19), dur: 1 },
  { re: /são benedito/i, tipo: 'religiosa', turismo: 0.2, data: fixo(7, 1), dur: 3 },
  { re: /festa da penha/i, tipo: 'religiosa', turismo: 0.3, data: (ano) => { const p = pascoa(ano); const dt = new Date(Date.UTC(ano, p.mes - 1, p.dia + 8)); return [dt.getUTCMonth() + 1, dt.getUTCDate()]; }, dur: 3 },
  { re: /festa das neves/i, tipo: 'religiosa', turismo: 0.2, data: fixo(8, 5), dur: 1 },
  { re: /guaraná/i, tipo: 'cultural', turismo: 0.2, data: fixo(11, 25), dur: 3 },
  { re: /marabaixo/i, tipo: 'cultural', turismo: 0.2, data: fixo(5, 15), dur: 5 },
  { re: /equinócio/i, tipo: 'cultural', turismo: 0.2, data: fixo(3, 20), dur: 1 },
  { re: /aniversário de brasília/i, tipo: 'show', turismo: 0.3, data: fixo(4, 21), dur: 1 },
  { re: /festival de cinema/i, tipo: 'cultural', turismo: 0.3, data: fixo(9, 15), dur: 7 },
  { re: /festival de teatro/i, tipo: 'cultural', turismo: 0.3, data: fixo(3, 28), dur: 12 },
  { re: /festival de praia|temporada de praia/i, tipo: 'cultural', turismo: 0.3, data: fixo(7, 5), dur: 20 },
  { re: /jericoacoara/i, tipo: 'cultural', turismo: 0.4, data: fixo(9, 6), dur: 3 },
  { re: /siriri|cururu/i, tipo: 'cultural', turismo: 0.2, data: fixo(7, 20), dur: 3 },
  { re: /linguiça/i, tipo: 'agro', turismo: 0.2, data: fixo(7, 18), dur: 3 },
  { re: /folia de reis/i, tipo: 'religiosa', turismo: 0.2, data: fixo(1, 6), dur: 1 },
];

/** Festas do ano para a UF (inclui Réveillon para todos e São João no Nordeste). */
export function festasDoAno(nomes: string[], ano: number, regiao: string): Festa[] {
  const out: Festa[] = [];
  const lista = [...nomes];
  if (!lista.some((n) => /réveillon/i.test(n))) lista.push('Réveillon');
  if (regiao === 'Nordeste' && !lista.some((n) => /são joão|junin|arraial|bumba/i.test(n))) lista.push('São João');
  if (!lista.some((n) => /carnaval/i.test(n))) lista.push('Carnaval de rua');
  for (const nome of lista) {
    const r = REGRAS.find((x) => x.re.test(nome));
    if (!r) continue;
    const [mes, dia] = r.data(ano);
    const inicio = diaDoAnoReal(ano, mes, dia);
    const peq = nome === 'Carnaval de rua';
    out.push({ nome, tipo: r.tipo, inicio, fim: inicio + r.dur - 1, turismo: peq ? 0.3 : r.turismo });
  }
  return out;
}

/** Festa em andamento no dia do ano (a de maior turismo, se houver mais de uma). */
export function festaEm(festas: Festa[], diaAno: number): Festa | null {
  let melhor: Festa | null = null;
  for (const f of festas) if (diaAno >= f.inicio && diaAno <= f.fim && (!melhor || f.turismo > melhor.turismo)) melhor = f;
  return melhor;
}
