/**
 * Medição de trechos pesados (Fase 13): só no dev, avisa no console quando um trecho passa de `limite` ms.
 * Serve para achar o que trava a tela com o Rio inteiro carregado.
 */
export function medir<T>(nome: string, fn: () => T, limite = 50): T {
  if (!import.meta.env.DEV) return fn();
  const t0 = performance.now();
  const r = fn();
  const d = performance.now() - t0;
  if (d > limite) console.warn(`[lento] ${nome}: ${d.toFixed(0)} ms`);
  return r;
}
