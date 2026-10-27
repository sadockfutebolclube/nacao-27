/**
 * Altitudes dos tiles "Terrarium" (Mapzen/Tilezen no AWS Open Data: SRTM + GMTED + ETOPO1),
 * com cache local em data/cache/terrarium e um decodificador de PNG sem dependências.
 * h = R·256 + G + B/256 − 32768 (m); o mar tem altitude ≤ 0 (batimetria).
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { inflateSync } from 'node:zlib';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Decodifica um PNG RGB/RGBA de 8 bits. */
export function decodePng(buf: Buffer): { w: number; h: number; px: Uint8Array; canais: number } {
  let p = 8, w = 0, h = 0, canais = 3;
  const idat: Buffer[] = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), tipo = buf.toString('ascii', p + 4, p + 8), dado = buf.subarray(p + 8, p + 8 + len);
    if (tipo === 'IHDR') { w = dado.readUInt32BE(0); h = dado.readUInt32BE(4); canais = dado[9] === 6 ? 4 : 3; if (dado[8] !== 8 || dado[12] !== 0) throw new Error('PNG não suportado'); }
    else if (tipo === 'IDAT') idat.push(dado);
    else if (tipo === 'IEND') break;
    p += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat)), linha = w * canais, px = new Uint8Array(w * h * canais);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (linha + 1)], src = raw.subarray(y * (linha + 1) + 1, (y + 1) * (linha + 1));
    for (let x = 0; x < linha; x++) {
      const a = x >= canais ? px[y * linha + x - canais] : 0, b = y > 0 ? px[(y - 1) * linha + x] : 0, c = x >= canais && y > 0 ? px[(y - 1) * linha + x - canais] : 0;
      let v = src[x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      px[y * linha + x] = v & 255;
    }
  }
  return { w, h, px, canais };
}

export class Terrarium {
  private tiles = new Map<string, ReturnType<typeof decodePng>>();
  constructor(private cache: string, private zoom: number) {}

  private async tile(x: number, y: number) {
    const chave = `${this.zoom}_${x}_${y}`;
    const t0 = this.tiles.get(chave);
    if (t0) return t0;
    const arq = join(this.cache, `${chave}.png`);
    let buf: Buffer;
    try { buf = await readFile(arq); } catch {
      for (let t = 0; ; t++) {
        const r = await fetch(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${this.zoom}/${x}/${y}.png`);
        if (r.ok) { buf = Buffer.from(await r.arrayBuffer()); break; }
        if (t > 4) throw new Error(`terrarium: HTTP ${r.status}`);
        await sleep(2000);
      }
      await mkdir(dirname(arq), { recursive: true });
      await writeFile(arq, buf);
    }
    const d = decodePng(buf);
    this.tiles.set(chave, d);
    return d;
  }

  /** Altitude (m) por interpolação bilinear. */
  async altitude(lat: number, lon: number): Promise<number> {
    const n = 2 ** this.zoom;
    const la = lat * Math.PI / 180;
    const fx = ((lon + 180) / 360) * n * 256 - 0.5, fy = ((1 - Math.log(Math.tan(la) + 1 / Math.cos(la)) / Math.PI) / 2) * n * 256 - 0.5;
    const x0 = Math.floor(fx), y0 = Math.floor(fy), ax = fx - x0, ay = fy - y0;
    const amostra = async (px: number, py: number) => {
      const tx = Math.floor(px / 256), ty = Math.floor(py / 256), t = await this.tile(tx, ty);
      const i = ((py - ty * 256) * t.w + (px - tx * 256)) * t.canais;
      return t.px[i] * 256 + t.px[i + 1] + t.px[i + 2] / 256 - 32768;
    };
    const [a, b, c, d] = [await amostra(x0, y0), await amostra(x0 + 1, y0), await amostra(x0, y0 + 1), await amostra(x0 + 1, y0 + 1)];
    return (a * (1 - ax) + b * ax) * (1 - ay) + (c * (1 - ax) + d * ax) * ay;
  }
}
