# ASSETS & LICENÇAS

## Assets visuais e sonoros
**Nenhum asset externo na Fase 2.** Tudo é gerado por código neste repositório:

| Asset | Onde | Como |
|---|---|---|
| Terreno, biomas, mata | `src/world/terrain.ts`, `src/render/city/Terreno.tsx` | ruído simplex + paletas por bioma |
| Água (ondas, espuma, poluição) | `src/render/city/Agua.tsx` | shader GLSL próprio |
| Asfalto, calçada, calçadão de pedra portuguesa, halo de poste | `src/render/city/texturas.ts` | canvas 2D |
| Prédios (fachadas, janelas, pastilhas, vitrines, obra) | `src/render/shaders/fachada.ts` | shader sobre `MeshStandardMaterial` |
| Telhado colonial, caixa d'água, muro, toldo, chaminé, grua | `src/render/city/Edificios.tsx` | geometria instanciada |
| Árvores, ipês, palmeiras, coqueiros | `src/render/city/Arvores.tsx`, `Vias.tsx` | geometria procedural |
| Veículos (sedã, hatch, táxi, ônibus, caminhão de entrega, moto com piloto) | `src/render/city/Veiculos.tsx` | geometria procedural instanciada (Fase 11) |
| Pedestres (com guarda-chuva na chuva) | `src/render/city/Pedestres.tsx` | geometria procedural instanciada, animação no shader (Fase 11) |
| Equipamentos (castelo d'água, ETA, ETE, subestação, solar, termelétrica, praça, parque) | `src/render/city/Equipamentos.tsx` | primitivas |
| Ícones da HUD | `src/ui/Icone.tsx` | SVG próprio |
| Céu | `@react-three/drei` `<Sky>` (modelo Preetham do three.js) | MIT |

## Fontes tipográficas (empacotadas via npm, sem CDN)
| Fonte | Pacote | Licença |
|---|---|---|
| Inter (variável) | `@fontsource-variable/inter` | SIL OFL 1.1 |
| Barlow Condensed | `@fontsource/barlow-condensed` | SIL OFL 1.1 |

## Dados
| Dado | Fonte | Licença/termos |
|---|---|---|
| Malhas, população, PIB, municípios | IBGE — API de Serviço de Dados | dados públicos (Lei de Acesso à Informação); citar a fonte |
| IDH, homicídios, IDEB, esgoto, dívida | Atlas Brasil, FBSP, INEP, SNIS, Tesouro | dados públicos; valores aproximados e citados em `data/ufs/indicadores-curados.json` |

## Dependências de código
three (MIT), @react-three/fiber (MIT), @react-three/drei (MIT), @react-three/postprocessing (MIT), postprocessing (Zlib), react/react-dom (MIT), zustand (MIT), zod (MIT), idb-keyval (Apache-2.0), simplex-noise (MIT), tailwindcss (MIT), vite (MIT), vitest (MIT), d3-geo (ISC, só no script de dados), tsx (MIT), typescript (Apache-2.0).

## Planejado (conferir a licença de cada pacote ao importar)
Kenney (CC0), Quaternius (CC0), Freesound (CC0/CC-BY — atribuir aqui).

## Dados geográficos das cidades reais (Fase 11)
| Dado | Fonte | Licença | Atribuição exigida |
|---|---|---|---|
| Ruas, nomes, prédios (tipo, andares, nomes), água, vegetação, uso do solo, trilhos e estações de metrô/trem/VLT/bonde | OpenStreetMap, via extratos regionais da Geofabrik (`scripts/lib/geofabrik.ts`) ou Overpass | ODbL 1.0 | “© colaboradores do OpenStreetMap” — exibida no jogo |
| Contornos de prédios detectados por satélite (onde o OSM não tem) | Microsoft Global ML Building Footprints (`scripts/lib/msbuildings.ts`) | ODbL 1.0 | “© Microsoft” — exibida no jogo |
| Relevo | Tiles Terrarium (Mapzen/Tilezen no AWS Open Data: SRTM, GMTED2010, ETOPO1) | domínio público / atribuição | “SRTM/Mapzen” — exibida no jogo |

Os arquivos derivados em `public/data/cidades/` são uma base derivada do OpenStreetMap e seguem a ODbL. Nenhuma geometria do Google é extraída ou armazenada: os termos do Google proíbem (ver Vista Google 3D abaixo).

## Materiais e céu fotográficos (Fase 12)
| Asset | Fonte | Licença |
|---|---|---|
| Fachadas Facade001, 005, 006, 014, 017, 018A/B, 019A/B, 020A/B; Plaster001, PaintedPlaster017, Concrete034; RoofingTiles006, 013A, 014A; Gravel043; Grass004, Ground103, Rock064; Asphalt033; PavingStones046, 128 (`public/assets/materiais/`, reduzidos a 1024/512 px) | ambientCG — https://ambientcg.com | CC0 1.0 |
| Céu HDRI kloofendal_48d_partly_cloudy_puresky (`public/assets/hdri/`) | Poly Haven — https://polyhaven.com | CC0 1.0 |

## Transporte e Censo do Rio (Fase 17)
| Dado | Fonte | Termos |
|---|---|---|
| Linhas, itinerários, frequências e paradas de ônibus e BRT (`public/data/rio/onibus.json`, 0,65 MB) | GTFS da Secretaria Municipal de Transportes (SMTR) — Prefeitura do Rio, via Data.Rio e Mobility Database (feed mdb-1791) | dados abertos da Prefeitura; **conferir o termo de uso (Data.Rio) antes de distribuir publicamente** |
| População, domicílios e contorno dos bairros (`public/data/rio/bairros.json`, 66 KB) | Censo Demográfico 2022 (IBGE, divulgação preliminar de 21/03/2024) agregado por bairro pelo Instituto Pereira Passos — Prefeitura do Rio, via Data.Rio | dados abertos; IBGE e Prefeitura devem ser citados |

## Vista Google 3D (Fase 12, opcional)
| Item | Fonte | Licença/termos |
|---|---|---|
| Leitor de 3D Tiles | `3d-tiles-renderer` (NASA-AMMOS) | Apache-2.0 |
| Photorealistic 3D Tiles | Google Map Tiles API, com a chave do jogador | Termos do Google Maps Platform: só exibição ao vivo, atribuição do Google na tela, sem baixar/guardar/extrair. Nada do Google fica no repositório. |
