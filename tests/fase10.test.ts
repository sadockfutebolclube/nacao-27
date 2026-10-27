import { beforeEach, describe, expect, it } from 'vitest';

// localStorage mínimo para o ambiente node (conquistas, tutorial e preferências usam o navegador)
const mem = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, String(v)); }, removeItem: (k: string) => { mem.delete(k); },
  clear: () => mem.clear(), key: () => null, length: 0,
} as Storage;

const { CONQUISTAS, checarConquistas, lerConquistas } = await import('../src/conquistas/conquistas');
const { DICAS_CIDADE, PASSOS_CIDADE } = await import('../src/ui/assessor/roteiros');
const { useAutoQualidade, DPR, SOMBRA } = await import('../src/render/qualidade');

/** Estatísticas mínimas de uma cidade para os testes de conquista e tutorial. */
function stats(pop: number) {
  const rede = { capacidade: 0, uso: 0, atendidos: 0, total: 0 };
  return {
    populacao: pop, lotes: 0, lotesZoneados: 0, caixa: 1, sandbox: false, agua: { ...rede }, energia: { ...rede }, esgoto: { ...rede, tratadoPct: 0 },
    estado: null, eventos: { pendentes: [], historico: [] },
    cidade: { favelas: { lista: [] }, transporte: { linhas: [] }, territorio: { estado: 1 } },
  } as never;
}

beforeEach(() => mem.clear());

describe('Fase 10 — conquistas', () => {
  it('catálogo com ids únicos, só da cidade e do governo do estado (Fase 13: só o Rio)', () => {
    expect(CONQUISTAS.length).toBeGreaterThanOrEqual(14);
    expect(new Set(CONQUISTAS.map((c) => c.id)).size).toBe(CONQUISTAS.length);
    for (const cat of ['cidade', 'estado']) expect(CONQUISTAS.some((c) => c.cat === cat)).toBe(true);
    expect(CONQUISTAS.every((c) => c.cat === 'cidade' || c.cat === 'estado')).toBe(true);
  });

  it('desbloqueia uma vez e guarda entre partidas', () => {
    expect(checarConquistas({ stats: stats(500) }).map((c) => c.id)).not.toContain('mil');
    expect(checarConquistas({ stats: stats(1200) }).map((c) => c.id)).toContain('mil');
    expect(checarConquistas({ stats: stats(1500) }).map((c) => c.id)).not.toContain('mil');
    expect(lerConquistas().desbloqueadas.mil).toBeTruthy();
  });
});

describe('Fase 10 — assessor', () => {
  it('roteiros com ids únicos e passos que avançam pelo que o jogador faz', () => {
    for (const lista of [PASSOS_CIDADE, DICAS_CIDADE]) expect(new Set(lista.map((x) => x.id)).size).toBe(lista.length);
    const vazio = { stats: stats(0), governo: null, equipamentos: [], velocidade: 0 };
    const zona = PASSOS_CIDADE.find((x) => x.id === 'zona')!;
    expect(zona.feito!(vazio)).toBe(false);
    expect(zona.feito!({ ...vazio, stats: { ...(vazio.stats as object), lotesZoneados: 4 } as never })).toBe(true);
    // passos do Palácio só aparecem quando há governo estadual (não no sandbox)
    expect(PASSOS_CIDADE.find((x) => x.id === 'palacio')!.so!(vazio)).toBe(false);
    for (const d of DICAS_CIDADE) expect(typeof d.quando(vazio)).toBe('boolean');
  });
});

describe('Fase 10 — qualidade', () => {
  it('qualidade automática desce e sobe dentro dos limites', () => {
    const q = useAutoQualidade.getState();
    q.fixar('alta'); q.subir();
    expect(useAutoQualidade.getState().nivel).toBe('alta');
    q.baixar(); q.baixar(); q.baixar();
    expect(useAutoQualidade.getState().nivel).toBe('baixa');
    expect(SOMBRA.baixa).toBe(0);
    expect(DPR.alta[1]).toBeGreaterThan(DPR.baixa[1]);
  });
});
