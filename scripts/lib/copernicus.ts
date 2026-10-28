/**
 * Altitudes do Copernicus DEM GLO-30 (ESA/Airbus, 1 arco-segundo ≈ 30 m), pelo bucket público do AWS Open Data
 * `copernicus-dem-30m` (sem chave; licença Copernicus DEM: uso livre com atribuição). Cada ladrilho é um GeoTIFF
 * de 1° × 1° (3601 × 3601, float32, nome pelo canto sudoeste) e fica em data/cache/dem. Mar e lagoas vêm em 0 m.
 * É um modelo de SUPERFÍCIE: prédios e copas aparecem como degraus e espetos (o gerador filtra isso depois).
 */
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fromFile } from 'geotiff';

interface Ladrilho { w: number; h: number; dado: Float32Array; lat0: number; lon0: number }

const nome = (lat: number, lon: number) => {
  const ns = lat >= 0 ? 'N' : 'S', ew = lon >= 0 ? 'E' : 'W';
  return `Copernicus_DSM_COG_10_${ns}${String(Math.abs(lat)).padStart(2, '0')}_00_${ew}${String(Math.abs(lon)).padStart(3, '0')}_00_DEM`;
};

export class Copernicus {
  private ladrilhos = new Map<string, Ladrilho | null>();
  constructor(private cache: string) {}

  /** URL pública de um ladrilho (para registrar em data/SOURCES.md). */
  static url(lat: number, lon: number) {
    const n = nome(Math.floor(lat), Math.floor(lon));
    return `https://copernicus-dem-30m.s3.amazonaws.com/${n}/${n}.tif`;
  }

  private async ladrilho(latSul: number, lonOeste: number): Promise<Ladrilho | null> {
    const n = nome(latSul, lonOeste);
    if (this.ladrilhos.has(n)) return this.ladrilhos.get(n)!;
    const arq = join(this.cache, `${n}.tif`);
    if (!existsSync(arq)) {
      const r = await fetch(Copernicus.url(latSul, lonOeste));
      if (!r.ok) { this.ladrilhos.set(n, null); return null; }
      await mkdir(dirname(arq), { recursive: true });
      await writeFile(arq, Buffer.from(await r.arrayBuffer()));
    }
    const tif = await fromFile(arq);
    const img = await tif.getImage();
    const dado = (await img.readRasters({ interleave: true })) as Float32Array;
    const l: Ladrilho = { w: img.getWidth(), h: img.getHeight(), dado, lat0: latSul, lon0: lonOeste };
    this.ladrilhos.set(n, l);
    return l;
  }

  /** Carrega de antemão os ladrilhos que cobrem a caixa (graus). */
  async preparar(la0: number, la1: number, lo0: number, lo1: number) {
    for (let la = Math.floor(Math.min(la0, la1)); la <= Math.floor(Math.max(la0, la1)); la++)
      for (let lo = Math.floor(Math.min(lo0, lo1)); lo <= Math.floor(Math.max(lo0, lo1)); lo++) await this.ladrilho(la, lo);
  }

  /**
   * Altitude (m) por interpolação bicúbica (Catmull-Rom 4×4), presa ao intervalo dos 4 pixels vizinhos para não
   * "tocar" (ringing) na beira do mar e dos degraus. NaN fora do ladrilho; perto da borda do ladrilho cai no bilinear.
   */
  altitudeBicubica(lat: number, lon: number): number {
    const la = Math.floor(lat), lo = Math.floor(lon);
    const t = this.ladrilhos.get(nome(la, lo));
    if (!t) return NaN;
    const fx = (lon - lo) * (t.w - 1), fy = (1 - (lat - la)) * (t.h - 1);
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    if (x0 < 1 || y0 < 1 || x0 > t.w - 3 || y0 > t.h - 3) return this.altitude(lat, lon);
    const ax = fx - x0, ay = fy - y0;
    const cr = (p0: number, p1: number, p2: number, p3: number, u: number) => p1 + 0.5 * u * (p2 - p0 + u * (2 * p0 - 5 * p1 + 4 * p2 - p3 + u * (3 * (p1 - p2) + p3 - p0)));
    const linha = (y: number) => { const k = y * t.w + x0; return cr(t.dado[k - 1], t.dado[k], t.dado[k + 1], t.dado[k + 2], ax); };
    const v = cr(linha(y0 - 1), linha(y0), linha(y0 + 1), linha(y0 + 2), ay);
    const k0 = y0 * t.w + x0, a = t.dado[k0], b = t.dado[k0 + 1], c = t.dado[k0 + t.w], d = t.dado[k0 + t.w + 1];
    return Math.min(Math.max(a, b, c, d), Math.max(Math.min(a, b, c, d), v));
  }

  /** Altitude (m) por interpolação bilinear; NaN onde não há ladrilho (mar aberto sem arquivo). Precisa de `preparar` antes. */
  altitude(lat: number, lon: number): number {
    const la = Math.floor(lat), lo = Math.floor(lon);
    const t = this.ladrilhos.get(nome(la, lo));
    if (!t) return NaN;
    // pixel (0,0) é o canto noroeste; o ladrilho tem pixels centrados em múltiplos de 1/(w−1)
    const fx = (lon - lo) * (t.w - 1), fy = (1 - (lat - la)) * (t.h - 1);
    const x0 = Math.min(t.w - 2, Math.max(0, Math.floor(fx))), y0 = Math.min(t.h - 2, Math.max(0, Math.floor(fy)));
    const ax = fx - x0, ay = fy - y0, k = y0 * t.w + x0;
    return (t.dado[k] * (1 - ax) + t.dado[k + 1] * ax) * (1 - ay) + (t.dado[k + t.w] * (1 - ax) + t.dado[k + t.w + 1] * ax) * ay;
  }
}
