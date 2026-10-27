/** Diagnóstico do modelo macro do Modo Presidente: roda 4 anos sem intervenção e imprime a trajetória. */
import { readFileSync } from 'node:fs';
import { DadosMacro } from '../src/data/macro.ts';
import { Rng } from '../src/sim/core/rng.ts';
import { COPOM, criarEconomia, decisaoCopom, passoEconomia } from '../src/sim/presidente/economia.ts';

const m = DadosMacro.parse(JSON.parse(readFileSync('public/data/macro/brasil.json', 'utf8')));
for (const semente of [1, 2, 3]) {
  const rng = new Rng(semente);
  const e = criarEconomia(m);
  e.meta = 0.25;
  console.log(`— semente ${semente}`);
  for (let i = 0; i < 48; i++) {
    const mes = (i % 12) + 1;
    passoEconomia(e, rng, { impulso: 0, descumpriuMeta: false }); e.despesas.previdencia += 0.006;
    if (COPOM.some(([cm]) => cm === mes)) e.selic = decisaoCopom(e, 0.2);
    if (mes === 12) console.log(`${2027 + Math.floor(i / 12)}: PIB ${e.crescimento.toFixed(1)}% · IPCA ${e.inflacao.toFixed(1)}% (exp ${e.expectativa.toFixed(1)}) · Selic ${e.selic.toFixed(2)} · US$ ${e.cambio.toFixed(2)} · desemp ${e.desemprego.toFixed(1)}% · dívida ${e.divida.toFixed(1)}% · primário ${e.primario.toFixed(2)}% · risco ${e.risco.toFixed(2)} · hiato ${e.hiato.toFixed(1)}`);
  }
}
