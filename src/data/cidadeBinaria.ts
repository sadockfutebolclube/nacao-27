/**
 * Formato binário da cidade real (Fase 23): em vez de um JSON de ~16 MB, um NÚCLEO (relevo, vegetação, ruas, nomes, bairros,
 * caminhos, metadados) e um arquivo por TILE de 1 km com os prédios e as plantas deles. `decodificarCidade` devolve exatamente
 * o mesmo objeto `CidadeReal` que o JSON dava — o resto do jogo não muda.
 *
 * Cada arquivo: "N27B" | u32 tamanho do cabeçalho | cabeçalho JSON (utf-8, preenchido até múltiplo de 8) | blocos binários.
 * Um vetor de números vira um bloco com o menor tipo inteiro que o guarda sem perda (i8/u8/i16/i32), com escala 1 ou 10
 * (valores de 0,1 m), ou f64 quando nada disso serve — por isso a ida e a volta são idênticas, bit a bit.
 *
 * Os tiles guardam o índice original de cada prédio: o carregador junta todos (hoje) ou só os que a câmera precisa (carga sob
 * demanda, que entra com a ampliação do mapa), sem reordenar nada — os índices de prédio nos saves continuam valendo.
 */
import { CAMPOS_PREDIO, type CidadeReal } from './cidadeReal';

/** lado do tile em metros (o mapa tem 16.384 m; os prédios cobrem ±6.144 m) */
export const TILE_M = 1024;
const MAGIA = 0x4237324e; // "N27B" em little-endian

type Tipo = 'i8' | 'u8' | 'i16' | 'i32' | 'f64';
interface Bloco { tipo: Tipo; escala: number; n: number; off: number }
const TAM: Record<Tipo, number> = { i8: 1, u8: 1, i16: 2, i32: 4, f64: 8 };

/** menor representação sem perda de um vetor de números */
function escolher(v: ArrayLike<number>): { tipo: Tipo; escala: number } {
  for (const escala of [1, 10]) {
    let mn = Infinity, mx = -Infinity, ok = true;
    for (let i = 0; i < v.length; i++) {
      const s = v[i] * escala;
      if (!Number.isInteger(s) || Math.abs(s) > 2147483647) { ok = false; break; }
      if (s < mn) mn = s; if (s > mx) mx = s;
    }
    if (!ok) continue;
    if (!v.length || (mn >= 0 && mx <= 255)) return { tipo: 'u8', escala };
    if (mn >= -128 && mx <= 127) return { tipo: 'i8', escala };
    if (mn >= -32768 && mx <= 32767) return { tipo: 'i16', escala };
    return { tipo: 'i32', escala };
  }
  return { tipo: 'f64', escala: 1 };
}

class Escritor {
  blocos: Uint8Array[] = [];
  tam = 0;
  adicionar(v: ArrayLike<number>, forcar?: { tipo: Tipo; escala: number }): Bloco {
    const { tipo, escala } = forcar ?? escolher(v);
    const n = v.length, bytes = n * TAM[tipo], pad = (8 - (bytes % 8)) % 8;
    const buf = new ArrayBuffer(bytes + pad), dv = new DataView(buf);
    for (let i = 0; i < n; i++) {
      const x = Math.round(v[i] * escala);
      if (tipo === 'f64') dv.setFloat64(i * 8, v[i], true);
      else if (tipo === 'i32') dv.setInt32(i * 4, x, true);
      else if (tipo === 'i16') dv.setInt16(i * 2, x, true);
      else if (tipo === 'i8') dv.setInt8(i, x);
      else dv.setUint8(i, x);
    }
    const b: Bloco = { tipo, escala, n, off: this.tam };
    this.blocos.push(new Uint8Array(buf)); this.tam += bytes + pad;
    return b;
  }
  /** bytes já prontos (alturas Int16 e vegetação Uint8, que o JSON guardava em base64) */
  adicionarBruto(bytes: Uint8Array, tipo: 'i16' | 'u8'): Bloco {
    const pad = (8 - (bytes.length % 8)) % 8, buf = new Uint8Array(bytes.length + pad);
    buf.set(bytes);
    const b: Bloco = { tipo, escala: 1, n: bytes.length / TAM[tipo], off: this.tam };
    this.blocos.push(buf); this.tam += buf.length;
    return b;
  }
  fechar(cab: unknown): Uint8Array {
    const j = new TextEncoder().encode(JSON.stringify(cab)), padJ = (8 - (j.length % 8)) % 8;
    const out = new Uint8Array(8 + j.length + padJ + this.tam), dv = new DataView(out.buffer);
    dv.setUint32(0, MAGIA, true); dv.setUint32(4, j.length + padJ, true);
    out.set(j, 8);
    out.fill(0x20, 8 + j.length, 8 + j.length + padJ); // espaços: o JSON continua válido
    let o = 8 + j.length + padJ;
    for (const b of this.blocos) { out.set(b, o); o += b.length; }
    return out;
  }
}

function abrir(entrada: Uint8Array): { cab: Record<string, unknown>; bloco: (b: Bloco) => number[]; bruto: (b: Bloco) => Uint8Array } {
  // visões tipadas exigem endereço alinhado: copia se o arquivo veio de um buffer desalinhado
  const bytes = entrada.byteOffset % 8 === 0 ? entrada : entrada.slice();
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (dv.getUint32(0, true) !== MAGIA) throw new Error('arquivo da cidade não é N27B');
  const tj = dv.getUint32(4, true);
  const cab = JSON.parse(new TextDecoder().decode(bytes.subarray(8, 8 + tj))) as Record<string, unknown>;
  const base = bytes.byteOffset + 8 + tj;
  return {
    cab,
    bloco: (b) => {
      const o = base + b.off;
      const v = b.tipo === 'f64' ? new Float64Array(bytes.buffer, o, b.n) : b.tipo === 'i32' ? new Int32Array(bytes.buffer, o, b.n) : b.tipo === 'i16' ? new Int16Array(bytes.buffer, o, b.n) : b.tipo === 'i8' ? new Int8Array(bytes.buffer, o, b.n) : new Uint8Array(bytes.buffer, o, b.n);
      return b.escala === 1 ? Array.from(v) : Array.from(v, (x) => x / b.escala);
    },
    bruto: (b) => new Uint8Array(bytes.buffer, base + b.off, b.n * TAM[b.tipo]),
  };
}

// base64 → bytes (só o codificador usa: o JSON antigo guardava assim)
function deBase64(b64: string): Uint8Array {
  const s = atob(b64), out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export const nomeTile = (ibge: string, t: number) => `cidades/${ibge}/t${t}.bin`;
export const nomeNucleo = (ibge: string) => `cidades/${ibge}/nucleo.bin`;

/** tile (índice linear) de um ponto do mapa */
export function tileDe(x: number, z: number, n: number): number {
  const i = Math.min(n - 1, Math.max(0, Math.floor(x / TILE_M) + n / 2)), j = Math.min(n - 1, Math.max(0, Math.floor(z / TILE_M) + n / 2));
  return j * n + i;
}

export interface CidadeBinaria { nucleo: Uint8Array; tiles: Map<number, Uint8Array> }

export function codificarCidade(c: CidadeReal, nTiles = 12): CidadeBinaria {
  const N = c.predios.length / CAMPOS_PREDIO;
  // tile de cada prédio e lista de prédios por tile (na ordem original)
  const porTile = new Map<number, number[]>();
  for (let i = 0; i < N; i++) {
    const t = tileDe(c.predios[i * CAMPOS_PREDIO], c.predios[i * CAMPOS_PREDIO + 1], nTiles);
    (porTile.get(t) ?? porTile.set(t, []).get(t)!).push(i);
  }
  // contornos: registros de tamanho variável (1 + 2n valores); onde cada prédio começa
  const cont = c.contornos ? new Int16Array(deBase64(c.contornos).slice().buffer) : new Int16Array(0);
  const iniCont = new Int32Array(N + 1);
  if (cont.length) for (let i = 0, p = 0; i < N; i++) { iniCont[i] = p; p += 1 + 2 * cont[p]; iniCont[i + 1] = p; }

  const tiles = new Map<number, Uint8Array>();
  for (const [t, ids] of porTile) {
    const w = new Escritor();
    const cab: Record<string, Bloco> = {};
    cab.idx = w.adicionar(ids);
    for (let f = 0; f < CAMPOS_PREDIO; f++) cab[`c${f}`] = w.adicionar(ids.map((i) => c.predios[i * CAMPOS_PREDIO + f]));
    if (cont.length) {
      const reg: number[] = [], tam: number[] = [];
      for (const i of ids) { tam.push(iniCont[i + 1] - iniCont[i]); for (let p = iniCont[i]; p < iniCont[i + 1]; p++) reg.push(cont[p]); }
      cab.contTam = w.adicionar(tam); cab.cont = w.adicionar(reg, { tipo: 'i16', escala: 1 });
    }
    tiles.set(t, w.fechar({ tile: t, blocos: cab }));
  }

  const w = new Escritor();
  const blocos: Record<string, Bloco> = {};
  blocos.alturas = w.adicionarBruto(deBase64(c.alturas), 'i16');
  blocos.verde = w.adicionarBruto(deBase64(c.verde), 'u8');
  blocos.nos = w.adicionar(c.vias.nos);
  blocos.arestas = w.adicionar(c.vias.arestas);
  for (const k of ['semaforos', 'faixasPed', 'rotatorias', 'minirrotatorias'] as const) if (c.vias[k]) blocos[`vias.${k}`] = w.adicionar(c.vias[k]!);
  if (c.bairros) blocos.bairros = w.adicionar(c.bairros);
  if (c.caminhos) blocos.caminhos = w.adicionar(c.caminhos);
  if (c.removidos) blocos.prediosPos = w.adicionar(c.removidos.prediosPos);
  const { alturas: _a, verde: _v, predios: _p, contornos: _c, bairros: _b, caminhos: _ca, ...resto } = c;
  void _a; void _v; void _p; void _c; void _b; void _ca;
  const { nos: _n, arestas: _ar, semaforos: _s, faixasPed: _f, rotatorias: _r, minirrotatorias: _m, ...viasResto } = c.vias;
  void _n; void _ar; void _s; void _f; void _r; void _m;
  const { prediosPos: _pp, ...removidosResto } = c.removidos ?? { prediosPos: [] };
  void _pp;
  const nucleo = w.fechar({
    cidade: { ...resto, vias: viasResto, removidos: c.removidos ? removidosResto : undefined },
    blocos, nTiles, nPredios: N, temContornos: cont.length > 0, tiles: [...porTile.keys()].sort((a, b) => a - b),
  });
  return { nucleo, tiles };
}

/** Junta o núcleo e os tiles (todos, hoje) na `CidadeReal` original, com os prédios na ordem de sempre. */
export function decodificarCidade(nucleo: Uint8Array, tiles: Map<number, Uint8Array>): CidadeReal {
  const { cab, bloco, bruto } = abrir(nucleo);
  const B = cab.blocos as Record<string, Bloco>;
  const N = cab.nPredios as number;
  const base = cab.cidade as Record<string, unknown>;
  const predios = new Array<number>(N * CAMPOS_PREDIO);
  const registros: (number[] | null)[] = cab.temContornos ? new Array(N).fill(null) : [];
  for (const dados of tiles.values()) {
    const t = abrir(dados);
    const tb = t.cab.blocos as Record<string, Bloco>;
    const idx = t.bloco(tb.idx);
    const cols: number[][] = [];
    for (let f = 0; f < CAMPOS_PREDIO; f++) cols.push(t.bloco(tb[`c${f}`]));
    idx.forEach((i, q) => { for (let f = 0; f < CAMPOS_PREDIO; f++) predios[i * CAMPOS_PREDIO + f] = cols[f][q]; });
    if (tb.cont) {
      const tam = t.bloco(tb.contTam), reg = t.bloco(tb.cont);
      let p = 0;
      idx.forEach((i, q) => { registros[i] = reg.slice(p, p + tam[q]); p += tam[q]; });
    }
  }
  const vias = { ...(base.vias as object), nos: bloco(B.nos), arestas: bloco(B.arestas) } as CidadeReal['vias'];
  for (const k of ['semaforos', 'faixasPed', 'rotatorias', 'minirrotatorias'] as const) if (B[`vias.${k}`]) vias[k] = bloco(B[`vias.${k}`]);
  // alturas, verde e contornos seguem em bytes (sem passar por base64 e voltar)
  const c: Record<string, unknown> = { ...base, vias, predios, alturas: '', verde: '', alturasBytes: bruto(B.alturas), verdeBytes: bruto(B.verde) };
  if (cab.temContornos) {
    const todos = new Int16Array(registros.reduce((s, r) => s + (r?.length ?? 0), 0));
    let p = 0;
    for (const r of registros) if (r) { todos.set(r, p); p += r.length; }
    c.contornos = ''; c.contornosBytes = new Uint8Array(todos.buffer);
  }
  if (B.bairros) c.bairros = bloco(B.bairros);
  if (B.caminhos) c.caminhos = bloco(B.caminhos);
  if (B.prediosPos) c.removidos = { ...(base.removidos as object), prediosPos: bloco(B.prediosPos) };
  return c as CidadeReal;
}

/** Índices dos tiles que o núcleo declara (para o carregador buscar os arquivos). */
export function listaTiles(nucleo: Uint8Array): number[] {
  return abrir(nucleo).cab.tiles as number[];
}
