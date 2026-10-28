/**
 * Orçamento de tempo por passo (Fase 23): o trabalho pesado da simulação (redes, valor do solo, crescimento, modelo de
 * transporte…) é escrito como GERADORES que cedem a vez (`yield`) entre blocos de lotes ou de zonas. Cada `step()` roda a fila
 * por no máximo `orcamentoMs`; o que não coube continua no passo seguinte. Sem orçamento (Infinity — testes, "avançar N dias")
 * a fila é drenada inteira no mesmo passo e o comportamento é o de antes.
 */

export interface TrabalhoStats {
  nome: string;
  /** soma dos ms gastos e de quantas fatias */
  ms: number; fatias: number; pior: number;
  /** média móvel do custo por fatia (ms) */
  ema: number;
}

export class Orcamento {
  private fila: { nome: string; gerador: Generator<void, void, void> }[] = [];
  readonly stats = new Map<string, TrabalhoStats>();
  /** quantos trabalhos concluíram desde a criação */
  concluidos = 0;
  /** ms do último `rodar` e o pior dos últimos 120 */
  ultimoMs = 0;
  private recentes = new Float64Array(120);
  private ri = 0;

  get pendentes() { return this.fila.length; }
  get nomesPendentes() { return this.fila.map((t) => t.nome); }
  emAndamento(nome: string) { return this.fila.some((t) => t.nome === nome); }

  agendar(nome: string, gerador: Generator<void, void, void>) { this.fila.push({ nome, gerador }); }

  /** Descarta o que está na fila (o mundo mudou por baixo dos geradores). */
  cancelar() { this.fila.length = 0; }

  /** Rótulo da fase em que o gerador estava ao ceder a vez; as fatias entram também em `nome/rotulo` (painel F4). */
  rotulo: (() => string) | null = null;

  private contar(chave: string, gasto: number) {
    const s = this.stats.get(chave) ?? { nome: chave, ms: 0, fatias: 0, pior: 0, ema: 0 };
    s.ms += gasto; s.fatias++; s.pior = Math.max(s.pior, gasto); s.ema = s.fatias === 1 ? gasto : s.ema * 0.9 + gasto * 0.1;
    this.stats.set(chave, s);
  }

  /** Roda a fila até acabar o tempo (ms). Devolve true se a fila esvaziou. Sempre dá pelo menos uma fatia. */
  rodar(orcamentoMs: number): boolean {
    const inicio = performance.now();
    let feitas = 0;
    while (this.fila.length) {
      const t = this.fila[0];
      const a = performance.now();
      const r = t.gerador.next();
      const gasto = performance.now() - a;
      this.contar(t.nome, gasto);
      const r0 = this.rotulo?.();
      if (r0) this.contar(`${t.nome}/${r0}`, gasto);
      feitas++;
      if (r.done) { this.fila.shift(); this.concluidos++; }
      if (performance.now() - inicio >= orcamentoMs && feitas > 0) break;
    }
    const total = performance.now() - inicio;
    this.ultimoMs = total;
    this.recentes[this.ri++ % this.recentes.length] = total;
    return this.fila.length === 0;
  }

  /** Esvazia a fila sem limite de tempo (salvar, avançar N dias, testes). */
  drenar() { while (this.fila.length) this.rodar(Infinity); }

  /** pior passo dos últimos 120 (ms) */
  piorRecente() { let m = 0; for (const v of this.recentes) if (v > m) m = v; return m; }
  /** percentil p (0–1) dos últimos 120 passos */
  percentilRecente(p: number) {
    const v = Array.from(this.recentes).filter((x) => x > 0).sort((a, b) => a - b);
    return v.length ? v[Math.min(v.length - 1, Math.floor(v.length * p))] : 0;
  }
}
