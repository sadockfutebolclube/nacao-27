/**
 * Balanceamento do Modo Presidente (Fase 10): três estilos de jogo × várias sementes, um mandato inteiro.
 *   piloto   — não faz nada (decisões padrão)
 *   ajuste   — contingencia todo ano, corta a PLOA, taxa dividendos e tenta a PEC fiscal
 *   gastador — amplia a transferência de renda, lança o programa de investimentos e isenta o IR
 * Saída: metas cumpridas, aprovação final, reeleição, dívida e nota.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { z } from 'zod';
import { DadosMacro } from '../src/data/macro.ts';
import { IndiceUFs } from '../src/data/schemas.ts';
import { Storylet } from '../src/sim/eventos/motor.ts';
import { Presidencia } from '../src/sim/presidente/presidencia.ts';

const macro = DadosMacro.parse(JSON.parse(readFileSync('public/data/macro/brasil.json', 'utf8')));
const indice = IndiceUFs.parse(JSON.parse(readFileSync('public/data/ufs/index.json', 'utf8')));
const storylets = readdirSync('data/events-presidente').flatMap((f) => z.array(Storylet).parse(JSON.parse(readFileSync(`data/events-presidente/${f}`, 'utf8'))));
const ufs = indice.ufs.map((u) => ({ sigla: u.sigla, nome: u.nome, regiao: u.regiao.nome, populacao: u.populacao.valor, cidades: [u.tracos.capital.nome] }));

type Estilo = 'piloto' | 'ajuste' | 'gastador';
function jogar(estilo: Estilo, semente: string) {
  const p = new Presidencia({ partido: semente.length % 2 ? 'UPB' : 'NLI', origem: 'MG', nome: 'Teste', genero: 'f', anoInicio: 2027, semente, macro, ufs }, storylets);
  const metas: boolean[] = [];
  let ultimoAno = p.ano;
  while (!p.fim && p.ano < 2031) {
    if (p.mes === 1 && p.dia === 6) {
      if (estilo === 'ajuste') {
        p.contingenciar(0.2);
        if (p.ano === 2027) { p.capital = Math.max(p.capital, 30); p.enviar('dividendos', 'PL'); }
        if (p.ano === 2028) p.enviar('corte-gastos', 'PEC');
        for (const x of p.propostas.filter((q) => q.status === 'tramitando')) { p.articular(x.uid, 'lideres'); p.articular(x.uid, 'cargos'); }
      }
      if (estilo === 'gastador' && p.ano === 2027) { p.enviar('renda-ampliada', 'MP'); p.enviar('pac', 'PL'); p.enviar('isencao-ir', 'PL'); }
    }
    if (estilo === 'ajuste' && p.mes === 6 && p.dia === 1) { p.setPloa('investimentos', p.base.investimentos * 0.85); p.setPloa('custeio', p.base.custeio * 0.85); }
    p.passoDia();
    if (p.ano !== ultimoAno) { metas.push(!p.gatilhos); ultimoAno = p.ano; }
  }
  const el = p.eleicao;
  const reeleito = p.mandato === 2 || (el?.vencedor !== undefined && el.candidatos[el.vencedor].doJogador);
  return { metas: metas.filter(Boolean).length, aprov: p.aprovacao, reeleito, divida: p.eco.divida, nota: p.nota(), impeachment: p.fim?.motivo === 'impeachment', ipca: p.eco.inflacao, dolar: p.eco.cambio };
}

for (const estilo of ['piloto', 'ajuste', 'gastador'] as Estilo[]) {
  const rs = ['a', 'bb', 'c', 'dd', 'e', 'ff', 'g', 'hh'].map((s) => jogar(estilo, s));
  const m = (f: (r: (typeof rs)[number]) => number) => (rs.reduce((a, r) => a + f(r), 0) / rs.length).toFixed(1);
  console.log(`${estilo.padEnd(9)} metas ${m((r) => r.metas)}/4 · aprov ${m((r) => r.aprov)}% · reeleição ${rs.filter((r) => r.reeleito).length}/${rs.length} · impeachment ${rs.filter((r) => r.impeachment).length} · dívida ${m((r) => r.divida)}% · IPCA ${m((r) => r.ipca)} · dólar ${m((r) => r.dolar)} · nota ${m((r) => r.nota)}`);
}
