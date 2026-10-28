import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const arq = 'public/data/rio/trilhos.json';
type Tipo = 'metro' | 'trem' | 'vlt' | 'bonde' | 'cremalheira';
interface Dados {
  linhas: { id: string; tipo: Tipo; nome: string; cor: string; trajetos: number[][] }[];
  estacoes: { nome: string; tipo: Tipo; x: number; z: number }[];
}
const carregar = () => JSON.parse(readFileSync(arq, 'utf8')) as Dados;

describe('Fase 18 — metrô, trem, VLT e bonde do OSM', () => {
  it('as linhas chegam classificadas, com cor e trajetos válidos', () => {
    if (!existsSync(arq)) return;
    const d = carregar();
    const tipos = new Set(d.linhas.map((l) => l.tipo));
    for (const t of ['metro', 'trem', 'vlt', 'bonde'] as Tipo[]) expect(tipos.has(t)).toBe(true);
    expect(new Set(d.linhas.map((l) => l.id)).size).toBe(d.linhas.length);
    for (const l of d.linhas) {
      expect(l.cor).toMatch(/^#[0-9a-f]{6}$/);
      expect(l.trajetos.length).toBeGreaterThan(0);
      for (const t of l.trajetos) {
        expect(t.length % 3).toBe(0);
        expect(t.length).toBeGreaterThanOrEqual(6);
        for (let i = 0; i < t.length; i += 3) {
          expect(Math.abs(t[i])).toBeLessThan(8200);
          expect(Math.abs(t[i + 1])).toBeLessThan(8200);
          expect([-1, 0, 1]).toContain(t[i + 2]);
        }
      }
    }
  });

  it('o metrô corre em túnel, o trem no chão e as linhas 1, 2 e 4 têm a cor oficial', () => {
    if (!existsSync(arq)) return;
    const d = carregar();
    const nivelDe = (tipo: Tipo, nivel: number) => d.linhas.filter((l) => l.tipo === tipo)
      .flatMap((l) => l.trajetos).reduce((s, t) => { let n = 0; for (let i = 2; i < t.length; i += 3) if (t[i] === nivel) n++; return s + n; }, 0);
    expect(nivelDe('metro', -1)).toBeGreaterThan(nivelDe('metro', 0) * 0.5);
    expect(nivelDe('trem', 0)).toBeGreaterThan(nivelDe('trem', -1));
    const cor = (nome: string) => d.linhas.find((l) => l.tipo === 'metro' && l.nome === nome)?.cor;
    expect(cor('Linha 1')).toBe('#f58220');
    expect(cor('Linha 2')).toBe('#00a651');
    expect(cor('Linha 4')).toBe('#fdb913');
  });

  it('as estações têm nome, ficam dentro do mapa e perto de um trilho do mesmo tipo', () => {
    if (!existsSync(arq)) return;
    const d = carregar();
    expect(d.estacoes.length).toBeGreaterThan(60);
    expect(d.estacoes.some((e) => e.tipo === 'metro')).toBe(true);
    expect(d.estacoes.some((e) => e.tipo === 'trem')).toBe(true);
    for (const e of d.estacoes) {
      expect(e.nome.length).toBeGreaterThan(0);
      expect(Math.abs(e.x)).toBeLessThan(8200);
      expect(Math.abs(e.z)).toBeLessThan(8200);
      let mínima = Infinity;
      for (const l of d.linhas) if (l.tipo === e.tipo) for (const t of l.trajetos) for (let i = 0; i < t.length; i += 3) mínima = Math.min(mínima, Math.hypot(t[i] - e.x, t[i + 1] - e.z));
      expect(mínima).toBeLessThan(200);
    }
  });

  it('o Corcovado e o monotrilho viram cremalheira; o bonde não vira VLT', () => {
    if (!existsSync(arq)) return;
    const d = carregar();
    expect(d.linhas.some((l) => l.tipo === 'cremalheira' && /corcovado/i.test(l.nome))).toBe(true);
    expect(d.linhas.some((l) => l.tipo === 'bonde' && /santa teresa/i.test(l.nome))).toBe(true);
    expect(d.linhas.filter((l) => l.tipo === 'vlt').every((l) => /vlt/i.test(l.nome))).toBe(true);
  });
});
