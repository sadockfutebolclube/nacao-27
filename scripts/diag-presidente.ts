/** Diagnóstico do Modo Presidente: mandatos inteiros sem jogador (decisões padrão) — trajetória e eleição. */
import { readdirSync, readFileSync } from 'node:fs';
import { z } from 'zod';
import { DadosMacro } from '../src/data/macro.ts';
import { IndiceUFs } from '../src/data/schemas.ts';
import { Storylet } from '../src/sim/eventos/motor.ts';
import type { IdPartido } from '../src/sim/politica/dados.ts';
import { Presidencia, type UFBasica } from '../src/sim/presidente/presidencia.ts';

const macro = DadosMacro.parse(JSON.parse(readFileSync('public/data/macro/brasil.json', 'utf8')));
const indice = IndiceUFs.parse(JSON.parse(readFileSync('public/data/ufs/index.json', 'utf8')));
const storylets = readdirSync('data/events-presidente').flatMap((f) => z.array(Storylet).parse(JSON.parse(readFileSync(`data/events-presidente/${f}`, 'utf8'))));
const ufs: UFBasica[] = indice.ufs.map((u) => ({ sigla: u.sigla, nome: u.nome, regiao: u.regiao.nome, populacao: u.populacao.valor, cidades: [u.tracos.capital.nome] }));

const partidos = (process.argv[2] ?? 'ATP,NLI,CDF').split(',') as IdPartido[];
for (const partido of partidos) {
  for (const semente of ['a', 'b']) {
    const p = new Presidencia({ partido, origem: 'MG', nome: 'Fulana de Tal', genero: 'f', anoInicio: 2027, semente, macro, ufs }, storylets);
    if (process.argv[3] === 'ajuste') { p.enviar('dividendos', 'PL'); p.contingenciar(0.15); }
    console.log(`— ${partido}/${semente}: base ${(p.base_() * 100).toFixed(0)}% · aprov ${p.aprovacao.toFixed(0)}%`);
    while (!p.fim && p.ano < 2035) {
      const ano = p.ano;
      p.avancar(1);
      if (p.ano !== ano) {
        const e = p.eco;
        console.log(`  ${ano}: aprov ${p.aprovacao.toFixed(0)}% · PIB ${e.crescimento.toFixed(1)} · IPCA ${e.inflacao.toFixed(1)} · Selic ${e.selic.toFixed(2)} · US$ ${e.cambio.toFixed(2)} · desemp ${e.desemprego.toFixed(1)} · dívida ${e.divida.toFixed(1)} · prim ${e.primario.toFixed(2)} (meta ${p.metaPorAno[ano]}) · base ${(p.base_() * 100).toFixed(0)}% · STF ${p.stf.length}${p.vagaSTF ? '+vaga' : ''} · mandato ${p.mandato}`);
      }
      if (p.eleicao?.fase === 'encerrada' && p.mes === 10 && p.dia === 31) {
        const el = p.eleicao;
        console.log(`  eleição ${el.ano}: 1º turno ${el.primeiro?.total.map((x, i) => `${el.candidatos[i].partido} ${(x * 100).toFixed(0)}%`).join(', ')}${el.segundo ? ` · 2º turno ${el.segundo.ids.map((id, i) => `${el.candidatos[id].partido} ${(el.segundo!.total[i] * 100).toFixed(0)}%`).join(' × ')}` : ''} → ${el.candidatos[el.vencedor!].doJogador ? 'GOVERNO' : 'oposição'}`);
      }
    }
    console.log(`  fim: ${p.fim?.motivo ?? '—'} · nota ${p.nota()} · notícias ${p.noticias.length} · votações ${p.votacoes.length}`);
  }
}
