/**
 * Escala do mundo da Visão Cidade. Unidades em metros; origem no centro do mapa;
 * +X = leste, +Z = sul, +Y = altitude. Ver DECISIONS.md (D-007).
 */

/** Extensão total do terreno (inclui a moldura de paisagem fora da área edificável). */
export const MAP_SIZE = 16384;
/** Células do heightmap por lado → (HM_RES + 1)² vértices. */
export const HM_RES = 1024;
export const HM_STEP = MAP_SIZE / HM_RES; // 16 m (a grade de relevo real do Rio também é de 16 m)
export const HM_VERTS = HM_RES + 1;

/** Metade do lado da área edificável (Fase 13: 12,3 × 12,3 km — Centro, Zona Sul, Tijuca e Maracanã). */
export const BUILD_HALF = 6144;

export const SEA_LEVEL = 0;
/** Cota mínima de uma via: abaixo disso vira ponte. */
export const ROAD_MIN_Y = SEA_LEVEL + 2.6;

/** Raster de ocupação (vias, lotes, equipamentos) dentro da área edificável. */
export const RASTER_CELL = 4;
export const RASTER_RES = (BUILD_HALF * 2) / RASTER_CELL; // 3072

/** Lote padrão: frente × profundidade (m). */
export const LOT_W = 12;
export const LOT_D = 24;
export const LOT_D_SHALLOW = 14;

/** Grade de poluição / valor do solo agregados. */
export const FIELD_CELL = 32;
export const FIELD_RES = (BUILD_HALF * 2) / FIELD_CELL; // 384

export const SNAP_DIST = 7;
