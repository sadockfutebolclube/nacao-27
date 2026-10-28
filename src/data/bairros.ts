/**
 * Bairros do Rio com o Censo 2022 (Fase 17): contorno, população 2010 e 2022, domicílios e área de cada um,
 * do Instituto Pereira Passos (Prefeitura) a partir do IBGE — public/data/rio/bairros.json (npm run fetch-censo).
 * Um raster de 32 m diz em que bairro cai qualquer ponto do mapa, para a ficha do prédio e a camada de densidade.
 */
export interface BairroCenso {
  nome: string; ra: string; ap: string;
  /** moradores em 2022 e em 2010, domicílios em 2022 */
  pop: number; pop10: number; dom: number;
  km2: number;
  /** contornos em metros do jogo, [x, z, x, z…] por anel */
  aneis: number[][];
}

const CEL = 32, META = 8192, N = (META * 2) / CEL;

export const censo = {
  bairros: null as BairroCenso[] | null,
  /** índice + 1 do bairro por célula (0 = nenhum) */
  raster: null as Uint16Array | null,
  /** centro (x, z) dos bairros dentro do mapa, na ordem de `bairros`; null se não tem célula no mapa */
  centros: [] as ([number, number] | null)[],
};

/** Preenche o raster por varredura de linhas (regra par-ímpar, então buracos e ilhas funcionam). */
export function montarRaster(bairros: BairroCenso[]): { raster: Uint16Array; centros: ([number, number] | null)[] } {
  const raster = new Uint16Array(N * N);
  const centros: ([number, number] | null)[] = [];
  bairros.forEach((b, k) => {
    const linhas = new Map<number, number[]>();
    for (const anel of b.aneis) {
      const n = anel.length / 2;
      for (let i = 0; i < n; i++) {
        const x0 = anel[i * 2], z0 = anel[i * 2 + 1], x1 = anel[((i + 1) % n) * 2], z1 = anel[((i + 1) % n) * 2 + 1];
        if (z0 === z1) continue;
        const zmin = Math.min(z0, z1), zmax = Math.max(z0, z1);
        const j0 = Math.max(0, Math.ceil((zmin + META) / CEL - 0.5)), j1 = Math.min(N - 1, Math.floor((zmax + META) / CEL - 0.5));
        for (let j = j0; j <= j1; j++) {
          const zc = -META + (j + 0.5) * CEL;
          if (zc < zmin || zc >= zmax) continue;
          const x = x0 + ((zc - z0) * (x1 - x0)) / (z1 - z0);
          (linhas.get(j) ?? linhas.set(j, []).get(j)!).push(x);
        }
      }
    }
    let sx = 0, sz = 0, cnt = 0;
    for (const [j, xs] of linhas) {
      xs.sort((a, b2) => a - b2);
      for (let q = 0; q + 1 < xs.length; q += 2) {
        const i0 = Math.max(0, Math.ceil((xs[q] + META) / CEL - 0.5)), i1 = Math.min(N - 1, Math.floor((xs[q + 1] + META) / CEL - 0.5));
        for (let i = i0; i <= i1; i++) { raster[j * N + i] = k + 1; sx += -META + (i + 0.5) * CEL; sz += -META + (j + 0.5) * CEL; cnt++; }
      }
    }
    centros.push(cnt ? [sx / cnt, sz / cnt] : null);
  });
  return { raster, centros };
}

let promessa: Promise<void> | null = null;

/** Carrega (uma vez) os bairros do Censo e monta o raster. */
export function carregarCenso(): Promise<void> {
  promessa ??= fetch(`${import.meta.env.BASE_URL}data/rio/bairros.json`)
    .then((r) => (r.ok ? r.json() : null))
    .then((j: { bairros: BairroCenso[] } | null) => {
      if (!j) return;
      const { raster, centros } = montarRaster(j.bairros);
      censo.bairros = j.bairros; censo.raster = raster; censo.centros = centros;
    })
    .catch(() => { /* sem o arquivo, a ficha usa só os nomes do OSM */ });
  return promessa;
}

/** Bairro do Censo em (x, z), ou null (mar, fora do mapa, ou dados ainda não carregados). */
export function bairroCensoEm(x: number, z: number): BairroCenso | null {
  if (!censo.raster || !censo.bairros) return null;
  const i = Math.floor((x + META) / CEL), j = Math.floor((z + META) / CEL);
  if (i < 0 || j < 0 || i >= N || j >= N) return null;
  const k = censo.raster[j * N + i];
  return k ? censo.bairros[k - 1] : null;
}

/** Habitantes por km² em 2022. */
export const densidadeBairro = (b: BairroCenso) => (b.km2 > 0 ? b.pop / b.km2 : 0);
