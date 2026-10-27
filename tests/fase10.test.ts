import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';

// localStorage mínimo para o ambiente node (conquistas, tutorial e preferências usam o navegador)
const mem = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, String(v)); }, removeItem: (k: string) => { mem.delete(k); },
  clear: () => mem.clear(), key: () => null, length: 0,
} as Storage;

const { CONQUISTAS, checarConquistas, lerConquistas, registrarPartida } = await import('../src/conquistas/conquistas');
const { DICAS_CIDADE, DICAS_PRES, PASSOS_CIDADE, PASSOS_PRES } = await import('../src/ui/assessor/roteiros');
const { useAutoQualidade, DPR, SOMBRA } = await import('../src/render/qualidade');
const { DadosMacro } = await import('../src/data/macro');
const { IndiceUFs } = await import('../src/data/schemas');
const { Presidencia } = await import('../src/sim/presidente/presidencia');
const { STORYLETS_PRES } = await import('../src/sim/presidente/biblioteca');

const macro = DadosMacro.parse(JSON.parse(readFileSync('public/data/macro/brasil.json', 'utf8')));
const indice = IndiceUFs.parse(JSON.parse(readFileSync('public/data/ufs/index.json', 'utf8')));
const ufs = indice.ufs.map((u) => ({ sigla: u.sigla, nome: u.nome, regiao: u.regiao.nome, populacao: u.populacao.valor, cidades: [u.tracos.capital.nome] }));
const pres = (semente: string) => new Presidencia({ partido: 'UPB', origem: 'MG', nome: 'Teste', genero: 'f', anoInicio: 2027, semente, macro, ufs }, STORYLETS_PRES);

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
  it('catálogo com ids únicos nas quatro categorias', () => {
    expect(CONQUISTAS.length).toBeGreaterThanOrEqual(30);
    expect(new Set(CONQUISTAS.map((c) => c.id)).size).toBe(CONQUISTAS.length);
    for (const cat of ['cidade', 'estado', 'presidente', 'brasil']) expect(CONQUISTAS.some((c) => c.cat === cat)).toBe(true);
  });

  it('desbloqueia uma vez e guarda entre partidas', () => {
    expect(checarConquistas({ stats: stats(500) }).map((c) => c.id)).not.toContain('mil');
    expect(checarConquistas({ stats: stats(1200) }).map((c) => c.id)).toContain('mil');
    expect(checarConquistas({ stats: stats(1500) }).map((c) => c.id)).not.toContain('mil');
    expect(lerConquistas().desbloqueadas.mil).toBeTruthy();
  });

  it('registro de partidas: regiões, estados, biomas, interior e carreira', () => {
    for (const [uf, regiao, bioma] of [['AM', 'Norte', 'amazonia'], ['PE', 'Nordeste', 'caatinga'], ['GO', 'Centro-Oeste', 'cerrado'], ['SP', 'Sudeste', 'mata-atlantica'], ['RS', 'Sul', 'pampa']]) registrarPartida({ uf, regiao, bioma });
    registrarPartida({ uf: 'PB', interior: true });
    const novas = checarConquistas({}).map((c) => c.id);
    expect(novas).toContain('regioes');
    expect(novas).toContain('interior');
    expect(novas).not.toContain('biomas');
    expect(lerConquistas().registro.ufs).toHaveLength(6);
    registrarPartida({ carreira: true });
    expect(checarConquistas({}).map((c) => c.id)).toEqual(['carreira']);
  });

  it('conquistas da Presidência saem do estado do jogo', () => {
    const p = pres('conq');
    expect(checarConquistas({ pres: p }).map((c) => c.id)).not.toContain('stf');
    p.stf[0].indicadoPorVoce = true;
    p.mandato = 2;
    const ids = checarConquistas({ pres: p }).map((c) => c.id);
    expect(ids).toContain('stf');
    expect(ids).toContain('reeleito-pres');
  });
});

describe('Fase 10 — assessor', () => {
  it('roteiros com ids únicos e passos que avançam pelo que o jogador faz', () => {
    for (const lista of [PASSOS_CIDADE, PASSOS_PRES, DICAS_CIDADE, DICAS_PRES]) expect(new Set(lista.map((x) => x.id)).size).toBe(lista.length);
    const vazio = { stats: stats(0), governo: null, equipamentos: [], velocidade: 0 };
    const zona = PASSOS_CIDADE.find((x) => x.id === 'zona')!;
    expect(zona.feito!(vazio)).toBe(false);
    expect(zona.feito!({ ...vazio, stats: { ...(vazio.stats as object), lotesZoneados: 4 } as never })).toBe(true);
    // passos do Palácio só aparecem quando há governo estadual (não no sandbox)
    expect(PASSOS_CIDADE.find((x) => x.id === 'palacio')!.so!(vazio)).toBe(false);
    for (const d of DICAS_CIDADE) expect(typeof d.quando(vazio)).toBe('boolean');
    const p = pres('tut');
    const ctx = { p, painel: 'economia', ufSelecionada: null, velocidade: 0 };
    expect(PASSOS_PRES.find((x) => x.id === 'economia')!.feito!(ctx)).toBe(true);
    expect(PASSOS_PRES.find((x) => x.id === 'congresso')!.feito!(ctx)).toBe(false);
    p.enviar('pac', 'PL');
    expect(PASSOS_PRES.find((x) => x.id === 'congresso')!.feito!(ctx)).toBe(true);
    for (const d of DICAS_PRES) expect(typeof d.quando(ctx)).toBe('boolean');
  });
});

describe('Fase 10 — qualidade e balanceamento', () => {
  it('qualidade automática desce e sobe dentro dos limites', () => {
    const q = useAutoQualidade.getState();
    q.fixar('alta'); q.subir();
    expect(useAutoQualidade.getState().nivel).toBe('alta');
    q.baixar(); q.baixar(); q.baixar();
    expect(useAutoQualidade.getState().nivel).toBe('baixa');
    expect(SOMBRA.baixa).toBe(0);
    expect(DPR.alta[1]).toBeGreaterThan(DPR.baixa[1]);
  });

  it('governar com ajuste rende mais aprovação que deixar no piloto automático', () => {
    let piloto = 0, ajuste = 0;
    for (const s of ['x', 'y', 'z']) {
      const a = pres(s), b = pres(s);
      b.contingenciar(0.2); b.capital = 60; b.enviar('dividendos', 'PL');
      for (let ano = 0; ano < 3; ano++) {
        a.avancar(365); b.avancar(365);
        b.contingenciar(0.2);
      }
      piloto += a.aprovacao; ajuste += b.aprovacao;
      expect(b.eco.divida).toBeLessThan(a.eco.divida);
    }
    expect(ajuste).toBeGreaterThan(piloto);
  });
});
