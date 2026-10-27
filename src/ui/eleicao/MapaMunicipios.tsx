/**
 * Mapa dos municípios da UF (malha do IBGE) em SVG: cada município pintado pela cor que o chamador
 * indicar (líder nas pesquisas, vencedor na apuração). Clicável para a agenda de campanha.
 */
import { geoMercator, geoPath } from 'd3-geo';
import type { FeatureCollection } from 'geojson';
import { memo, useEffect, useMemo, useState } from 'react';
import { carregarMalhaMunicipios } from '../../data/loader';
import type { SiglaUF } from '../../data/schemas';

interface Props {
  sigla: SiglaUF;
  cores: Record<string, string>;
  /** opacidade por município (0–1), ex.: margem de vitória */
  forca?: Record<string, number>;
  titulos?: Record<string, string>;
  destaque?: string | null;
  onClique?: (ibge: string) => void;
  altura?: number;
}

export const MapaMunicipios = memo(function MapaMunicipios({ sigla, cores, forca, titulos, destaque, onClique, altura = 340 }: Props) {
  const [malha, setMalha] = useState<FeatureCollection | null>(null);
  useEffect(() => { let vivo = true; carregarMalhaMunicipios(sigla).then((m) => { if (vivo) setMalha(m); }); return () => { vivo = false; }; }, [sigla]);
  const W = 520;
  const paths = useMemo(() => {
    if (!malha) return [];
    const proj = geoMercator().fitSize([W, altura], malha);
    const g = geoPath(proj);
    return malha.features.map((f) => ({ ibge: String((f.properties as { codarea: string }).codarea), nome: String((f.properties as { nome: string }).nome), d: g(f) ?? '' }));
  }, [malha, altura]);
  if (!malha) return <div className="h-40 flex items-center justify-center text-xs text-suave">Carregando o mapa dos municípios…</div>;
  return (
    <svg viewBox={`0 0 ${W} ${altura}`} className="w-full" style={{ maxHeight: altura }}>
      {paths.map((p) => (
        <path key={p.ibge} d={p.d} fill={cores[p.ibge] ?? '#2a3532'} fillOpacity={forca ? 0.35 + 0.65 * (forca[p.ibge] ?? 0) : 0.9}
          stroke={destaque === p.ibge ? '#ffffff' : '#0b1513'} strokeWidth={destaque === p.ibge ? 1.6 : 0.35}
          className={onClique ? 'cursor-pointer hover:brightness-125' : ''} onClick={onClique ? () => onClique(p.ibge) : undefined}>
          <title>{titulos?.[p.ibge] ?? p.nome}</title>
        </path>
      ))}
    </svg>
  );
});
