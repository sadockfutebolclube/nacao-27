/**
 * Filtros do relevo (Fase 19), puros e sem dependências: servem ao gerador (scripts/fetch-cidades.ts), ao
 * carregamento no jogo e aos testes. As grades são quadradas (n × n, linha = z). `terra` vale 1 onde há terra
 * firme e 0 na água (mar, lagoa, rio): a água nunca entra na média nem é movida.
 */

/** Remove espetos (Hampel): o valor que difere da mediana 5×5 por mais de 3 MAD (e mais de `minimo` m) vira a mediana. */
export function removerOutliers(h: Float32Array, n: number, terra: Uint8Array, minimo = 5): number {
  const saida = Float32Array.from(h);
  const janela: number[] = [], desv: number[] = [];
  let trocados = 0;
  for (let j = 2; j < n - 2; j++) for (let i = 2; i < n - 2; i++) {
    const k = j * n + i;
    if (!terra[k]) continue;
    janela.length = 0;
    for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) {
      const q = k + dj * n + di;
      if (terra[q]) janela.push(h[q]);
    }
    if (janela.length < 9) continue;
    janela.sort((a, b) => a - b);
    const med = janela[janela.length >> 1];
    if (Math.abs(h[k] - med) <= minimo) continue;
    desv.length = 0;
    for (const v of janela) desv.push(Math.abs(v - med));
    desv.sort((a, b) => a - b);
    const mad = desv[desv.length >> 1];
    if (Math.abs(h[k] - med) > Math.max(minimo, 3 * 1.4826 * mad)) { saida[k] = med; trocados++; }
  }
  h.set(saida);
  return trocados;
}

/** Filtro gaussiano separável (raio 3σ) que só mistura terra com terra: a costa não escorre para dentro d'água. */
export function suavizarGaussiano(h: Float32Array, n: number, terra: Uint8Array, sigma = 1.5) {
  const r = Math.ceil(sigma * 3);
  const w: number[] = [];
  for (let d = -r; d <= r; d++) w.push(Math.exp(-(d * d) / (2 * sigma * sigma)));
  const tmp = new Float32Array(h.length);
  const passada = (origem: Float32Array, destino: Float32Array, passo: number, ao: number) => {
    for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) {
      const k = ao === 1 ? a * n + b : b * n + a;
      if (!terra[k]) { destino[k] = origem[k]; continue; }
      let soma = 0, pesos = 0;
      for (let d = -r; d <= r; d++) {
        const pos = b + d;
        if (pos < 0 || pos >= n) continue;
        const q = k + d * passo;
        if (!terra[q]) continue;
        soma += origem[q] * w[d + r]; pesos += w[d + r];
      }
      destino[k] = pesos ? soma / pesos : origem[k];
    }
  };
  passada(h, tmp, 1, 1);
  passada(tmp, h, n, 0);
}

/**
 * Limita a inclinação entre vértices vizinhos (tangente máxima `max`, em eixos e diagonais): onde passa, o vértice
 * mais alto desce e o mais baixo sobe metade do excesso (ou o alto desce tudo, se o baixo é água). Converge por
 * relaxação; devolve quantas iterações foram preciso e quantos vértices mexeram.
 */
export function limitarInclinacao(h: Float32Array, n: number, passo: number, max: number, terra: Uint8Array, iteracoes = 80, regiao?: { i0: number; i1: number; j0: number; j1: number }): { iteracoes: number; ajustados: number } {
  const i0 = regiao?.i0 ?? 0, i1 = regiao?.i1 ?? n - 1, j0 = regiao?.j0 ?? 0, j1 = regiao?.j1 ?? n - 1;
  const vizinhos: [number, number, number][] = [[1, 0, 1], [0, 1, 1], [1, 1, Math.SQRT2], [-1, 1, Math.SQRT2]];
  const tocados = new Uint8Array(h.length);
  let it = 0;
  for (; it < iteracoes; it++) {
    let mexeu = false;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const k = j * n + i;
      for (const [di, dj, dist] of vizinhos) {
        const ii = i + di, jj = j + dj;
        if (ii < i0 || ii > i1 || jj > j1) continue;
        const q = jj * n + ii;
        const d = h[k] - h[q], lim = max * passo * dist;
        if (Math.abs(d) <= lim + 0.01) continue;
        const excesso = Math.abs(d) - lim;
        const alto = d > 0 ? k : q, baixo = d > 0 ? q : k;
        if (terra[baixo] && terra[alto]) { h[alto] -= excesso / 2; h[baixo] += excesso / 2; tocados[alto] = tocados[baixo] = 1; }
        else if (terra[alto]) { h[alto] -= excesso; tocados[alto] = 1; }
        else if (terra[baixo]) { h[baixo] += excesso; tocados[baixo] = 1; }
        mexeu = true;
      }
    }
    if (!mexeu) break;
  }
  let ajustados = 0;
  for (let k = 0; k < tocados.length; k++) ajustados += tocados[k];
  return { iteracoes: it, ajustados };
}

/**
 * Perfil longitudinal de uma via: cotas brutas do terreno (uma por amostra) viram uma curva suave (duas passadas de
 * média móvel de ±`raio` amostras), com as pontas fixas para casar com os nós. O terreno manda: a curva nunca se afasta
 * mais de `maxDesvio` m do bruto (senão uma rua numa encosta íngreme abriria cortes de dezenas de metros) e a rampa
 * entre amostras fica abaixo de `maxGrade` (m/m) só onde o terreno deixa. A terraplenagem do relevo e o desenho das
 * vias usam esta mesma conta.
 */
export function suavizarPerfil(bruto: ArrayLike<number>, passo: number, raio = 6, maxGrade = 0.35, maxDesvio = 4): Float32Array {
  const n = bruto.length;
  const ref = Float32Array.from(bruto as ArrayLike<number> as number[]);
  let y = Float32Array.from(ref);
  if (n < 3) return y;
  for (let rep = 0; rep < 2; rep++) {
    const novo = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      if (i === 0 || i === n - 1) { novo[i] = y[i]; continue; }
      const r = Math.min(raio, i, n - 1 - i);
      let soma = 0;
      for (let d = -r; d <= r; d++) soma += y[i + d];
      novo[i] = soma / (2 * r + 1);
    }
    y = novo;
  }
  const lim = maxGrade * passo;
  for (let it = 0; it < 4; it++) {
    for (let i = 1; i < n - 1; i++) { if (y[i] - y[i - 1] > lim) y[i] = y[i - 1] + lim; else if (y[i - 1] - y[i] > lim) y[i] = y[i - 1] - lim; }
    for (let i = n - 2; i > 0; i--) { if (y[i] - y[i + 1] > lim) y[i] = y[i + 1] + lim; else if (y[i + 1] - y[i] > lim) y[i] = y[i + 1] - lim; }
  }
  for (let i = 1; i < n - 1; i++) y[i] = Math.min(ref[i] + maxDesvio, Math.max(ref[i] - maxDesvio, y[i]));
  return y;
}

/**
 * Projeta o perfil de uma via na restrição de rampa (|dy/ds| ≤ g) com as duas pontas fixas: primeiro o cone que as
 * pontas permitem, depois uma passada para frente e outra para trás (cada cota fica a no máximo g·ds da vizinha). As
 * pontas têm de ser compatíveis (|y₀ − yₙ| ≤ g·L); a regra da rede (`regrade.ts`) garante isso nos nós.
 */
export function limitarRampa(y: Float32Array, s: ArrayLike<number>, g: number): Float32Array {
  const n = y.length;
  if (n < 3) return y;
  const y0 = y[0], yn = y[n - 1], s0 = s[0], sn = s[n - 1];
  const lo = (i: number) => Math.max(y0 - g * (s[i] - s0), yn - g * (sn - s[i]));
  const hi = (i: number) => Math.min(y0 + g * (s[i] - s0), yn + g * (sn - s[i]));
  const prende = (v: number, a: number, b: number) => (a > b ? (a + b) / 2 : Math.min(b, Math.max(a, v)));
  for (let i = 1; i < n - 1; i++) y[i] = prende(y[i], lo(i), hi(i));
  for (let i = 1; i < n - 1; i++) { const d = g * (s[i] - s[i - 1]); y[i] = prende(y[i], Math.max(lo(i), y[i - 1] - d), Math.min(hi(i), y[i - 1] + d)); }
  for (let i = n - 2; i >= 1; i--) { const d = g * (s[i + 1] - s[i]); y[i] = prende(y[i], Math.max(lo(i), y[i + 1] - d), Math.min(hi(i), y[i + 1] + d)); }
  return y;
}
