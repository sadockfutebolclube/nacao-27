/**
 * Marcos do Rio (Fase 15): onde ficam e quais prédios do OpenStreetMap eles substituem.
 * Os prédios reais são caixas extrudadas; um aqueduto, uma pista de estádio ou uma catedral cônica
 * não cabem nisso, então o desenho dos prédios pula os que um marco representa melhor.
 */
import { CAMPOS_PREDIO, predio, type CidadeReal } from '../../data/cidadeReal';
import { projetar } from '../../world/cidadeReal';
import { dentroDoPoligono, geometriaSaoJanuario } from '../../world/saoJanuario';

export const IBGE_RIO = '3304557';

/** Coordenadas dos marcos sem prédio próprio no OSM. */
export const LATLON = {
  cristo: [-22.9519, -43.2105],
  bondinhoA: [-22.9552, -43.1657],
  bondinhoUrca: [-22.9528, -43.1632],
  bondinhoPao: [-22.9487, -43.1566],
  maracana: [-22.9121, -43.2302],
} as const;

/** Prédios do OSM trocados por um modelo de marco, pelo nome. */
const NOMES_SUBSTITUIDOS = new Set(['Arcos da Lapa', 'Museu do Amanhã', 'Catedral de São Sebastião', 'Igreja de Nossa Senhora da Candelária', 'Theatro Municipal', 'Biblioteca Nacional']);
/** Maracanã: o estádio não tem prédio nomeado; tudo num raio de 190 m do centro deixa de ser desenhado. */
const RAIO_MARACANA = 190;

const cache = new WeakMap<CidadeReal, { ocultos: Set<number>; ancoras: Map<string, { x: number; z: number; angle: number; w: number; d: number; andares: number }> }>();

function indice(c: CidadeReal) {
  let r = cache.get(c);
  if (r) return r;
  const ocultos = new Set<number>();
  const ancoras = new Map<string, { x: number; z: number; angle: number; w: number; d: number; andares: number }>();
  if (c.ibge === IBGE_RIO) {
    const [mx, mz] = projetar(c, ...LATLON.maracana);
    const sj = geometriaSaoJanuario((la, lo) => projetar(c, la, lo));
    for (let i = 0; i < c.predios.length / CAMPOS_PREDIO; i++) {
      const o = i * CAMPOS_PREDIO;
      const nomeIdx = c.predios[o + 8];
      const nome = nomeIdx >= 0 ? c.nomesPredios[nomeIdx] : null;
      if (nome && NOMES_SUBSTITUIDOS.has(nome)) {
        ocultos.add(i);
        const p = predio(c, i);
        // vários prédios com o mesmo nome: vale o maior
        const antes = ancoras.get(nome);
        if (!antes || p.w * p.d > antes.w * antes.d) ancoras.set(nome, { x: p.x, z: p.z, angle: p.angle, w: p.w, d: p.d, andares: p.andares });
      }
      if (Math.hypot(c.predios[o] - mx, c.predios[o + 1] - mz) < RAIO_MARACANA) ocultos.add(i);
      // São Januário (Fase 28): o estádio é desenhado por SaoJanuario.tsx a partir do contorno do OSM
      if (dentroDoPoligono(c.predios[o], c.predios[o + 1], sj.contorno)) ocultos.add(i);
    }
  }
  r = { ocultos, ancoras };
  cache.set(c, r);
  return r;
}

/** Prédios do arquivo que um marco já representa. */
export const prediosOcultos = (c: CidadeReal) => indice(c).ocultos;
/** Posição e orientação do prédio do OSM de um marco, pelo nome. */
export const ancoraMarco = (c: CidadeReal, nome: string) => indice(c).ancoras.get(nome);
