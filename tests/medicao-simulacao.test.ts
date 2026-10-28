/**
 * (rodado por scripts/medir-simulacao.cjs, que liga MEDIR=1; no `npm test` fica pulado) Mede a simulação do Rio real
 * (npm run medir-simulacao [-- --orcamento 4]). Um "passo" é o tick de 6 h; a cada 4 ticks roda o trabalho pesado do dia.
 *
 * Dois modos: síncrono (MEDIR_ORCAMENTO=0: o dia inteiro dentro do `step()`, como antes da Fase 23) e com orçamento
 * (MEDIR_ORCAMENTO=4: `step()` gasta no máximo ~4 ms no trabalho do dia e o worker termina a fila em fatias de 4 ms entre
 * um tick e o próximo). Imprime o tempo por fase, o custo de CPU por dia de jogo e a velocidade de relógio que a máquina aguenta.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'vitest';
import { CidadeReal, CAMPOS_PREDIO } from '../src/data/cidadeReal';
import { ArquivoTracos } from '../src/data/schemas';
import type { SimInit } from '../src/sim/protocol';
import { Simulation } from '../src/sim/simulation';

const ROOT = join(__dirname, '..');
const tracos = ArquivoTracos.parse(JSON.parse(readFileSync(join(ROOT, 'data/ufs/traits.json'), 'utf8')));
const rj = tracos.ufs.find((u) => u.sigla === 'RJ')!;
const c = CidadeReal.parse(JSON.parse(readFileSync(join(ROOT, 'public/data/cidades/3304557.json'), 'utf8')));
const init: SimInit = { sigla: 'RJ', nomeEstado: 'Rio de Janeiro', cidade: 'Rio de Janeiro', terreno: rj.terreno, bioma: 'mata-atlantica', latitude: -22.9, efeitos: {}, esgotoUF: 60, festas: [], regiao: 'Sudeste', seed: 7, modo: 'sandbox', cidadeReal: '3304557' };

const estat = (v: number[]) => {
  const s = [...v].sort((x, y) => x - y);
  const q = (p: number) => +(s[Math.min(s.length - 1, Math.floor(s.length * p))] ?? 0).toFixed(2);
  return { n: s.length, media: +(s.reduce((x, y) => x + y, 0) / Math.max(1, s.length)).toFixed(2), p50: q(0.5), p95: q(0.95), p99: q(0.99), max: +(s[s.length - 1] ?? 0).toFixed(2) };
};

describe.skipIf(!process.env.MEDIR)('medição da simulação do Rio', () => {
  it('mede o passo por fase', () => {
    const DIAS = Number(process.env.MEDIR_DIAS ?? 60);
    const ORC = Number(process.env.MEDIR_ORCAMENTO ?? 0);
    const t0 = performance.now();
    const sim = new Simulation(init, undefined, c);
    const montagem = performance.now() - t0;
    // 3 dias de aquecimento (JIT, caches) fora da medida
    for (let i = 0; i < 12; i++) sim.step();
    sim.orcamentoMs = ORC > 0 ? ORC : Infinity;
    if (ORC > 0) sim.definirFoco(0, 0, 1400);

    // embrulha as fases (funções comuns e geradores) com performance.now
    const tempos = new Map<string, number[]>();
    const embrulhar = (obj: Record<string, unknown>, metodo: string, chave: string) => {
      const original = obj[metodo] as ((...a: unknown[]) => unknown) | undefined;
      if (typeof original !== 'function') return;
      tempos.set(chave, []);
      obj[metodo] = function (this: unknown, ...a: unknown[]) {
        const t = performance.now();
        const r = original.apply(this, a) as Generator<void, void, void> | unknown;
        if (r && typeof (r as Generator).next === 'function') {
          const g = r as Generator<void, void, void>;
          let acc = performance.now() - t;
          return (function* () { for (;;) { const a0 = performance.now(); const x = g.next(); acc += performance.now() - a0; if (x.done) break; yield; } tempos.get(chave)!.push(acc); })();
        }
        tempos.get(chave)!.push(performance.now() - t);
        return r;
      };
    };
    for (const f of ['redesDeServico', 'camposDePoluicao', 'valorDoSolo', 'calcularDemanda', 'crescimento', 'contabilizarAgregados', 'verificarNoticias', 'fechamentoMensal', 'passoEventos']) embrulhar(sim as unknown as Record<string, unknown>, f, f);
    const sub = sim as unknown as Record<string, Record<string, unknown>>;
    for (const [nome, metodo] of [['servicosSociais', 'atualizar'], ['territorio', 'atualizar'], ['favelas', 'diario'], ['favelas', 'semanal'], ['transporte', 'semanalFatiado']] as const) embrulhar(sub[nome], metodo, `${nome}.${metodo}`);

    const fatias: number[] = [];
    const rotulos: string[] = [];
    const dias: number[] = [];
    const fase = () => (sim as unknown as { faseAtual: string }).faseAtual;
    const tInicio = performance.now();
    for (let i = 0; i < DIAS * 4; i++) {
      const a = performance.now();
      sim.step();
      fatias.push(performance.now() - a); rotulos.push(fase()); dias.push(Math.floor(i / 4));
      // o worker usa o tempo livre até o próximo tick para terminar a fila, em fatias do mesmo orçamento
      if (ORC > 0) while (sim.orcamento.pendentes) { const b = performance.now(); sim.trabalhar(ORC); fatias.push(performance.now() - b); rotulos.push(fase()); dias.push(Math.floor(i / 4)); }
    }
    const total = performance.now() - tInicio;
    const cpuPorDia = total / DIAS;
    const lotes = sim.lotState().length / 13;
    const resultado = {
      modo: ORC > 0 ? `orçamento ${ORC} ms` : 'síncrono (como antes da Fase 23)',
      predios: c.predios.length / CAMPOS_PREDIO, lotes, montagemMs: Math.round(montagem), dias: DIAS,
      quadro: estat(fatias),
      cpuPorDiaMs: +cpuPorDia.toFixed(1),
      /** relógio máximo sustentável: 1× = 1 dia a cada 2 s; acima disso a fila cresce e dias são engolidos */
      velocidadeMaxima: +(2000 / cpuPorDia).toFixed(1),
      diasPulados: sim.diasPulados,
      pioresQuadros: fatias.map((ms, i) => ({ ms: +ms.toFixed(1), fase: rotulos[i], dia: dias[i] })).sort((a, b) => b.ms - a.ms).slice(0, 8),
      fases: Object.fromEntries([...tempos].map(([k, v]) => [k, estat(v)]).sort((a, b) => (b[1] as { media: number }).media * (b[1] as { n: number }).n - (a[1] as { media: number }).media * (a[1] as { n: number }).n)),
    };
    console.log(JSON.stringify(resultado, null, 1));
    writeFileSync(join(ROOT, `data/cache/medicao-simulacao-${ORC > 0 ? 'orcamento' : 'sincrono'}.json`), JSON.stringify(resultado, null, 1));
  }, 900_000);
});
