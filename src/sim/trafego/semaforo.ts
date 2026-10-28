/**
 * Fases do semáforo (Fases 14 e 29), puras para o Worker e o desenho usarem o MESMO relógio: ciclo de 40 s; cada eixo tem 16 s de verde,
 * 4 de amarelo e 20 de vermelho, defasados em 20 s (quando um eixo está no verde o outro está no vermelho).
 */
export const CICLO_SEM = 40;
/** eixo da aproximação pela direção (a rua que cruza tem o outro eixo) */
export const eixoSemaforo = (tx: number, tz: number) => (Math.abs(tx) > Math.abs(tz) ? 0 : 1);
/** 0 verde, 1 amarelo, 2 vermelho */
export function faseSemaforo(eixo: number, t: number): 0 | 1 | 2 {
  const u = (t + eixo * (CICLO_SEM / 2)) % CICLO_SEM;
  return u < 16 ? 0 : u < 20 ? 1 : 2;
}
