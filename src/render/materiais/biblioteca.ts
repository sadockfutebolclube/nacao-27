/**
 * Biblioteca de materiais PBR fotográficos (Fase 12): fachadas, rebocos, telhados e pisos do ambientCG
 * (CC0, baixados por `npm run fetch-assets` para public/assets/materiais) empilhados em duas
 * DataArrayTexture — uma chamada de desenho serve qualquer prédio, só muda a camada:
 *
 *   tCor  (RGBA): cor em sRGB + rugosidade no alfa
 *   tNor  (RGBA): normal OpenGL + emissão (janelas acesas) no alfa
 *
 * `escala` diz quantos metros a imagem cobre (largura × altura) para que janelas e andares tenham
 * o tamanho real; `andares` é o número de pavimentos que cada repetição da fachada mostra.
 */
import * as THREE from 'three';

export type TipoCamada = 'fachada' | 'parede' | 'telhado' | 'laje';

export interface CamadaMaterial {
  id: string;
  tipo: TipoCamada;
  /** metros cobertos por uma repetição: [largura, altura] */
  escala: [number, number];
  /** arquivo do mapa de emissão (outra variante da mesma fachada), quando houver */
  emis?: string;
}

/** Ordem = índice da camada nos arrays (o shader dos prédios usa estes números). */
export const CAMADAS: CamadaMaterial[] = [
  // 0–7 fachadas fotográficas (≈3 m por andar)
  { id: 'Facade018A', tipo: 'fachada', escala: [16, 15], emis: 'Facade018B' }, // tijolinho, 5 andares
  { id: 'Facade019A', tipo: 'fachada', escala: [18, 18], emis: 'Facade019B' }, // residencial claro, 6
  { id: 'Facade020A', tipo: 'fachada', escala: [18, 18], emis: 'Facade020B' }, // pilares de tijolo, 6
  { id: 'Facade001', tipo: 'fachada', escala: [13.5, 12] }, // pele de vidro
  { id: 'Facade005', tipo: 'fachada', escala: [18, 18] }, // vidro verde em pastilhas
  { id: 'Facade006', tipo: 'fachada', escala: [24, 24] }, // fitas de janela, 8 andares
  { id: 'Facade014', tipo: 'fachada', escala: [30, 36], emis: 'Facade014' }, // escritório em grade, 12
  { id: 'Facade017', tipo: 'fachada', escala: [30, 30], emis: 'Facade017' }, // escritório com luzes, 10
  // 8–10 paredes lisas (janelas desenhadas no shader)
  { id: 'Plaster001', tipo: 'parede', escala: [4, 4] },
  { id: 'PaintedPlaster017', tipo: 'parede', escala: [4, 4] },
  { id: 'Concrete034', tipo: 'parede', escala: [5, 5] },
  // 11–13 telhas, 14 laje com brita
  { id: 'RoofingTiles014A', tipo: 'telhado', escala: [3, 3] },
  { id: 'RoofingTiles006', tipo: 'telhado', escala: [3, 3] },
  { id: 'RoofingTiles013A', tipo: 'telhado', escala: [3, 3] },
  { id: 'Gravel043', tipo: 'laje', escala: [3, 3] },
];
export const CAMADA = Object.fromEntries(CAMADAS.map((c, i) => [c.id, i])) as Record<string, number>;
export const N_FACHADAS = 8;

/** Materiais de chão (texturas comuns com repetição): terreno, ruas e calçadas. */
export const PISOS = ['Grass004', 'Ground103', 'Rock064', 'Asphalt033', 'PavingStones046', 'PavingStones128'] as const;
export type Piso = (typeof PISOS)[number];

const BASE = `${import.meta.env.BASE_URL}assets/materiais/`;

async function imagem(url: string): Promise<ImageBitmap | null> {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    return await createImageBitmap(await r.blob());
  } catch {
    return null;
  }
}

/** Desenha a imagem num quadrado S×S e devolve os pixels com as linhas invertidas (v = 0 embaixo). */
function pixels(ctx: CanvasRenderingContext2D, img: ImageBitmap | null, S: number, fundo: string): Uint8ClampedArray {
  ctx.fillStyle = fundo;
  ctx.fillRect(0, 0, S, S);
  if (img) ctx.drawImage(img, 0, 0, S, S);
  const d = ctx.getImageData(0, 0, S, S).data;
  const out = new Uint8ClampedArray(d.length);
  const linha = S * 4;
  for (let r = 0; r < S; r++) out.set(d.subarray(r * linha, (r + 1) * linha), (S - 1 - r) * linha);
  return out;
}

export interface Biblioteca {
  tCor: THREE.DataArrayTexture;
  tNor: THREE.DataArrayTexture;
  /** 1 quando a camada tem mapa de emissão de verdade (senão o shader acende janelas pelo vidro) */
  temEmis: number[];
}

let promessa: Promise<Biblioteca> | null = null;
let tamanhoPedido = 0;

/** Carrega (uma vez por tamanho) os arrays de textura dos prédios. `S` = lado da cor (512 ou 1024). */
export function carregarBiblioteca(S: number): Promise<Biblioteca> {
  if (promessa && tamanhoPedido === S) return promessa;
  tamanhoPedido = S;
  promessa = (async () => {
    const N = CAMADAS.length, SN = S / 2;
    const cor = new Uint8Array(S * S * 4 * N), nor = new Uint8Array(SN * SN * 4 * N);
    const cv = document.createElement('canvas');
    cv.width = cv.height = S;
    const ctx = cv.getContext('2d', { willReadFrequently: true })!;
    const temEmis: number[] = [];
    const imgs = await Promise.all(CAMADAS.map(async (c) => Promise.all([
      imagem(`${BASE}${c.id}_cor.jpg`), imagem(`${BASE}${c.id}_rug.jpg`), imagem(`${BASE}${c.id}_normal.jpg`),
      c.emis ? imagem(`${BASE}${c.emis}_emis.jpg`) : Promise.resolve(null),
    ])));
    imgs.forEach(([iCor, iRug, iNor, iEmis], k) => {
      const pc = pixels(ctx, iCor, S, '#9a9a9a');
      const pr = pixels(ctx, iRug, S, '#c8c8c8');
      for (let i = 0; i < S * S; i++) pc[i * 4 + 3] = pr[i * 4];
      cor.set(pc, k * S * S * 4);
      cv.width = cv.height = SN;
      const pn = pixels(ctx, iNor, SN, '#8080ff');
      const pe = pixels(ctx, iEmis, SN, '#000000');
      for (let i = 0; i < SN * SN; i++) pn[i * 4 + 3] = Math.max(pe[i * 4], pe[i * 4 + 1], pe[i * 4 + 2]);
      nor.set(pn, k * SN * SN * 4);
      cv.width = cv.height = S;
      temEmis.push(iEmis ? 1 : 0);
      [iCor, iRug, iNor, iEmis].forEach((b) => b?.close());
    });
    const arr = (dados: Uint8Array, lado: number, srgb: boolean) => {
      const t = new THREE.DataArrayTexture(dados, lado, lado, N);
      t.format = THREE.RGBAFormat;
      t.type = THREE.UnsignedByteType;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.magFilter = THREE.LinearFilter;
      t.minFilter = THREE.LinearMipmapLinearFilter;
      t.generateMipmaps = true;
      t.anisotropy = 8;
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.needsUpdate = true;
      return t;
    };
    return { tCor: arr(cor, S, true), tNor: arr(nor, SN, false), temEmis };
  })();
  return promessa;
}

/** Texturas comuns de piso (cor sRGB, normal e rugosidade), com repetição e anisotropia. */
const cachePiso = new Map<string, { map: THREE.Texture; normalMap: THREE.Texture; roughnessMap: THREE.Texture }>();
export function texturasPiso(id: Piso): { map: THREE.Texture; normalMap: THREE.Texture; roughnessMap: THREE.Texture } {
  const em = cachePiso.get(id);
  if (em) return em;
  const loader = new THREE.TextureLoader();
  const carregar = (m: string, srgb: boolean) => {
    const t = loader.load(`${BASE}${id}_${m}.jpg`);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    return t;
  };
  const r = { map: carregar('cor', true), normalMap: carregar('normal', false), roughnessMap: carregar('rug', false) };
  cachePiso.set(id, r);
  return r;
}
