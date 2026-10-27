import type { ResumoUF } from '../../data/schemas';
import type { Metrica } from '../../app/store';
import { fmt } from '../../app/store';

export interface DefMetrica {
  nome: string;
  valor: (u: ResumoUF) => number;
  /** true: valor alto é bom (cor clara/quente) */
  melhorAlto: boolean;
  formato: (v: number) => string;
  log?: boolean;
  fonte: string;
}

export const METRICAS: Record<Metrica, DefMetrica> = {
  dificuldade: { nome: 'Dificuldade', valor: (u) => u.tracos.dificuldade, melhorAlto: false, formato: (v) => '★'.repeat(v) + '☆'.repeat(5 - v), fonte: 'NAÇÃO 27' },
  populacao: { nome: 'População', valor: (u) => u.populacao.valor, melhorAlto: true, formato: (v) => fmt.pessoas(v), log: true, fonte: 'IBGE, estimativa' },
  pib: { nome: 'PIB', valor: (u) => u.pib.total, melhorAlto: true, formato: (v) => fmt.reais(v), log: true, fonte: 'IBGE, Contas Regionais' },
  pibPerCapita: { nome: 'PIB per capita', valor: (u) => u.pib.perCapita, melhorAlto: true, formato: (v) => fmt.reais(v), fonte: 'IBGE' },
  idh: { nome: 'IDH', valor: (u) => u.indicadores.idh, melhorAlto: true, formato: (v) => v.toFixed(3).replace('.', ','), fonte: 'Atlas Brasil/PNUD 2021' },
  homicidios: { nome: 'Mortes violentas /100 mil', valor: (u) => u.indicadores.homicidios, melhorAlto: false, formato: (v) => fmt.dec(v), fonte: 'Anuário FBSP 2024' },
  idebEM: { nome: 'IDEB Ensino Médio', valor: (u) => u.indicadores.idebEM, melhorAlto: true, formato: (v) => fmt.dec(v), fonte: 'INEP 2023' },
  esgoto: { nome: 'Atendimento de esgoto', valor: (u) => u.indicadores.esgoto, melhorAlto: true, formato: (v) => `${Math.round(v)}%`, fonte: 'SNIS 2022' },
  dividaRCL: { nome: 'Dívida / Receita (DCL/RCL)', valor: (u) => u.indicadores.dividaRCL, melhorAlto: false, formato: (v) => `${Math.round(v)}%`, fonte: 'Tesouro/RGF 2024' },
  regiao: { nome: 'Região', valor: (u) => u.populacao.valor, melhorAlto: true, formato: (v) => fmt.pessoas(v), log: true, fonte: 'IBGE' },
};

export const CORES_REGIAO: Record<string, string> = { N: '#3fa36a', NE: '#e7a43a', CO: '#cf6e3c', SE: '#4b8fe0', S: '#9a7be0' };

/** Paleta sequencial perceptualmente uniforme e segura para daltônicos (inspirada no viridis). */
const RAMPA = ['#5a2f86', '#4f5aa6', '#2f84ad', '#22a39a', '#45c27f', '#9bd85e', '#f4e55c'];
const RAMPA_ALTO_CONTRASTE = ['#0d0887', '#5b02a3', '#9a179b', '#cb4678', '#eb7852', '#fbb32f', '#f0f921'];

function hex(c: string): [number, number, number] {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function corRampa(t: number, altoContraste = false): string {
  const r = altoContraste ? RAMPA_ALTO_CONTRASTE : RAMPA;
  const x = Math.min(0.9999, Math.max(0, t)) * (r.length - 1);
  const i = Math.floor(x), f = x - i;
  const a = hex(r[i]), b = hex(r[i + 1]);
  const m = a.map((v, k) => Math.round(v + (b[k] - v) * f));
  return `#${m.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/** Normaliza todas as UFs para [0,1] na métrica, já invertendo quando "alto é ruim". */
export function normalizar(ufs: ResumoUF[], m: Metrica): Map<string, { t: number; altura: number; valor: number }> {
  const def = METRICAS[m];
  const vals = ufs.map((u) => def.valor(u));
  const tr = (v: number) => (def.log ? Math.log10(Math.max(1, v)) : v);
  const min = Math.min(...vals.map(tr)), max = Math.max(...vals.map(tr));
  const out = new Map<string, { t: number; altura: number; valor: number }>();
  ufs.forEach((u, i) => {
    const raw = (tr(vals[i]) - min) / Math.max(1e-9, max - min);
    const bom = def.melhorAlto ? raw : 1 - raw;
    out.set(u.sigla, { t: bom, altura: 0.25 + raw * 2.4, valor: vals[i] });
  });
  return out;
}
