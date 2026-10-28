/**
 * Hash espacial dos lotes (Fase 23): grade uniforme em formato CSR (`inicio` + `itens`, tudo em typed arrays), montada uma
 * vez por conjunto de lotes. A consulta por raio não aloca: escreve os índices num buffer reaproveitado. Troca os laços
 * "para cada serviço, para cada lote" (O(S·N)) por "para cada serviço, só os lotes da vizinhança".
 */
export class HashLotes {
  readonly n: number;
  private readonly cel: number;
  private readonly minX: number; private readonly minZ: number;
  private readonly nx: number; private readonly nz: number;
  private readonly inicio: Int32Array;
  private readonly itens: Int32Array;
  /** buffer de saída da última consulta (válido até a próxima) */
  saida: Int32Array;

  constructor(x: ArrayLike<number>, z: ArrayLike<number>, n: number, celula = 64) {
    this.n = n; this.cel = celula;
    let mnx = Infinity, mnz = Infinity, mxx = -Infinity, mxz = -Infinity;
    for (let i = 0; i < n; i++) { if (x[i] < mnx) mnx = x[i]; if (x[i] > mxx) mxx = x[i]; if (z[i] < mnz) mnz = z[i]; if (z[i] > mxz) mxz = z[i]; }
    if (!n) { mnx = mnz = 0; mxx = mxz = 1; }
    this.minX = mnx; this.minZ = mnz;
    this.nx = Math.floor((mxx - mnx) / celula) + 1; this.nz = Math.floor((mxz - mnz) / celula) + 1;
    const cont = new Int32Array(this.nx * this.nz + 1);
    const cdl = new Int32Array(n);
    for (let i = 0; i < n; i++) { const c = this.celulaDe(x[i], z[i]); cdl[i] = c; cont[c + 1]++; }
    for (let c = 0; c < this.nx * this.nz; c++) cont[c + 1] += cont[c];
    this.inicio = cont;
    this.itens = new Int32Array(n);
    const pos = cont.slice(0, this.nx * this.nz);
    for (let i = 0; i < n; i++) this.itens[pos[cdl[i]]++] = i;
    this.saida = new Int32Array(Math.max(256, Math.ceil(n / 64)));
  }

  private celulaDe(x: number, z: number) {
    const i = Math.min(this.nx - 1, Math.max(0, Math.floor((x - this.minX) / this.cel))), j = Math.min(this.nz - 1, Math.max(0, Math.floor((z - this.minZ) / this.cel)));
    return j * this.nx + i;
  }

  /**
   * Índices dos lotes em células que tocam o quadrado de lado 2·raio em (x, z) — um superconjunto do círculo; quem chama
   * confere a distância. Devolve quantos são; os índices ficam em `saida[0..n)`.
   */
  consulta(x: number, z: number, raio: number): number {
    const i0 = Math.max(0, Math.floor((x - raio - this.minX) / this.cel)), i1 = Math.min(this.nx - 1, Math.floor((x + raio - this.minX) / this.cel));
    const j0 = Math.max(0, Math.floor((z - raio - this.minZ) / this.cel)), j1 = Math.min(this.nz - 1, Math.floor((z + raio - this.minZ) / this.cel));
    let k = 0;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const c = j * this.nx + i;
      const a = this.inicio[c], b = this.inicio[c + 1];
      if (k + (b - a) > this.saida.length) { const maior = new Int32Array(Math.max(this.saida.length * 2, k + (b - a))); maior.set(this.saida); this.saida = maior; }
      for (let q = a; q < b; q++) this.saida[k++] = this.itens[q];
    }
    return k;
  }
}
