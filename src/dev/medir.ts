/** Ganchos de medição (window.__n27…): no dev sempre; em produção só com `?medir` na URL (scripts/medir-fps.ts mede o build de verdade). */
export const MEDIR: boolean = import.meta.env.DEV || (typeof location !== 'undefined' && new URLSearchParams(location.search).has('medir'));
