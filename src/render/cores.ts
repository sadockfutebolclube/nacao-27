/** Paleta das camadas de informação da cidade (água, valor do solo, crime…). */

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

