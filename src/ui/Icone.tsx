/** Ícones lineares próprios (24×24, traço 1.7). */
const PATHS: Record<string, string> = {
  estrada: 'M7 21 10 3M17 21 14 3M12 6v2M12 11v2M12 16v2',
  curva: 'M4 20C4 10 10 4 20 4M4 20h3M20 4v3',
  reta: 'M4 20 20 4M4 20h3M20 4v3',
  zona: 'M3 3h8v8H3zM13 3h8v8h-8zM3 13h8v8H3zM13 13h8v8h-8z',
  agua: 'M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z',
  energia: 'M13 2 4 14h7l-1 8 9-12h-7z',
  esgoto: 'M4 8h16M6 8v8a6 6 0 0 0 12 0V8M9 12h6',
  lazer: 'M12 22V12M12 12c-4 0-6-3-6-6 3 0 6 2 6 6zm0 0c4 0 6-3 6-6-3 0-6 2-6 6zM7 22h10',
  demolir: 'M3 21h18M5 21V10l7-5 7 5v11M9 13l6 6M15 13l-6 6',
  camadas: 'M12 3 2 8l10 5 10-5zM2 13l10 5 10-5M2 17.5l10 5 10-5',
  play: 'M7 4v16l13-8z',
  pausa: 'M7 4h3v16H7zM14 4h3v16h-3z',
  rapido: 'M3 5v14l8-7zM12 5v14l8-7z',
  muitoRapido: 'M2 5v14l6-7zM9 5v14l6-7zM16 5v14l6-7z',
  olho: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  salvar: 'M5 3h11l3 3v15H5zM8 3v5h7V3M8 21v-7h8v7',
  menu: 'M4 6h16M4 12h16M4 18h16',
  sol: 'M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM12 1v3M12 20v3M1 12h3M20 12h3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1',
  lua: 'M20 14A8 8 0 1 1 10 4a6 6 0 0 0 10 10z',
  pessoas: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21v-1a7 7 0 0 1 14 0v1M17 11a3 3 0 1 0 0-6M22 21v-1a5 5 0 0 0-4-5',
  dinheiro: 'M2 6h20v12H2zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM6 12h.01M18 12h.01',
  aprovacao: 'M7 22V11M2 13v7a2 2 0 0 0 2 2h13.4a2 2 0 0 0 2-1.7l1.4-8A2 2 0 0 0 18.8 10H14V5a3 3 0 0 0-3-3L7 11',
  casa: 'M3 11 12 3l9 8M5 9v12h14V9M10 21v-6h4v6',
  predio: 'M5 21V3h10v18M15 9h4v12M8 7h4M8 11h4M8 15h4M3 21h18',
  loja: 'M3 9l2-5h14l2 5M3 9v12h18V9M3 9c0 2 4 2 4 0 0 2 5 2 5 0 0 2 5 2 5 0 0 2 4 2 4 0M9 21v-6h6v6',
  fabrica: 'M2 21V10l6 4V10l6 4V4h4v17zM2 21h20',
  x: 'M5 5l14 14M19 5 5 19',
  info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-5M12 8h.01',
  camera: 'M3 7h4l2-3h6l2 3h4v13H3zM12 10a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
  grafico: 'M3 3v18h18M7 15l4-4 3 3 6-7',
  jornal: 'M4 4h13v16H6a2 2 0 0 1-2-2zM17 8h3v10a2 2 0 0 1-2 2M8 8h5M8 12h5M8 16h3',
  voltar: 'M15 18l-6-6 6-6',
  carregar: 'M12 3v12M7 10l5 5 5-5M4 21h16',
  exportar: 'M12 21V9M7 14l5-5 5 5M4 3h16',
  lampada: 'M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7V16h8v-1.3A7 7 0 0 0 12 2z',
  cursor: 'M4 3l7 18 2-8 8-2z',
};

export function Icone({ nome, tamanho = 20, className = '' }: { nome: keyof typeof PATHS | string; tamanho?: number; className?: string }) {
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d={PATHS[nome] ?? PATHS.info} />
    </svg>
  );
}
