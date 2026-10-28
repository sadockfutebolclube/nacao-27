# Fontes de dados externos

Cada fonte: o que é, de onde vem (URL oficial e pública), quando foi baixada, licença e onde é usada. O Google Maps/Places/Earth
**não** é fonte de nada aqui (os termos proíbem armazenar e usar em jogo). Dados brutos ficam em `data/cache/` e `data/osm-cache/`
(fora do git); os derivados que o jogo carrega ficam em `public/data/`.

| Fonte | URL | Baixado em | Licença | Uso |
|---|---|---|---|---|
| **Copernicus DEM GLO-30** (altitude, 30 m, modelo de superfície) | `https://copernicus-dem-30m.s3.amazonaws.com/Copernicus_DSM_COG_10_S23_00_W044_00_DEM/Copernicus_DSM_COG_10_S23_00_W044_00_DEM.tif` e `…S24_00_W044_00…` (bucket público AWS Open Data `copernicus-dem-30m`, sem chave) | 28/10/2026 | Copernicus DEM: uso livre com atribuição — © DLR e.V. 2010–2014 e © Airbus Defence and Space GmbH 2014–2018, fornecido sob COPERNICUS pela União Europeia e pela ESA | Relevo do Rio (`scripts/lib/copernicus.ts` → `scripts/fetch-cidades.ts` → `public/data/cidades/3304557.json`); filtrado em `src/world/relevo.ts` |
| Terrarium (SRTM/GMTED/ETOPO1 em tiles) | `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png` | 27/10/2026 | AWS Open Data (Mapzen/Tilezen) | Só de reserva, onde faltar ladrilho do Copernicus (`scripts/lib/terrarium.ts`) |
| OpenStreetMap — extrato Sudeste (ruas, prédios, água, verde, rotatórias, trilhos, escadarias e trilhas) | `https://download.geofabrik.de/south-america/brazil/sudeste-latest.osm.pbf` | 27/10/2026 | ODbL 1.0 — © colaboradores do OpenStreetMap | `scripts/lib/geofabrik.ts` → cache `data/osm-cache/3304557-*.json` → `public/data/cidades/3304557.json`, `public/data/rio/trilhos.json` |
| Microsoft Global ML Building Footprints | `https://minedbuildings.z5.web.core.windows.net/global-buildings/dataset-links.csv` | 27/10/2026 | ODbL 1.0 — © Microsoft | Prédios que o OSM não tem (`scripts/lib/msbuildings.ts`) |
| GTFS da SMTR (ônibus e BRT), feed mdb-1791 | `https://files.mobilitydatabase.org/mdb-1791/latest.zip` | 27/10/2026 | dados abertos da Prefeitura do Rio (Data.Rio) — conferir o termo de uso antes de distribuir | `scripts/fetch-gtfs.ts` → `public/data/rio/onibus.json` |
| Censo 2022 por bairro (IPP/Prefeitura a partir do IBGE) | `https://pgeo3.rio.rj.gov.br/arcgis/rest/services/Censo/Limites_administrativos_Censo_2022/MapServer/2` | 27/10/2026 | dados abertos da Prefeitura/IBGE | `scripts/fetch-censo.ts` → `public/data/rio/bairros.json` |

Texturas, HDRI e modelos estão em `ASSETS_LICENSES.md`.

## Observações sobre o relevo (Copernicus GLO-30)

- Desde a Fase 20 o relevo é amostrado em **bicúbico** numa grade de 10,67 m (1.536 células; antes bilinear a 16 m), com detalhe de alta frequência só nas encostas. Mesmos ladrilhos `S23_W044` e `S24_W044`, baixados em 28/10/2026.

- É um modelo de **superfície**: prédios, copas e pedreiras aparecem como degraus e espetos. O gerador remove outliers (Hampel 5×5), aplica gaussiana de σ = 1,5 célula (16 m) só entre terra e terra e limita a inclinação a 50° (tangente 1,2).
- Mar, baía e lagoas já vêm em 0 m no Copernicus; o jogo usa isso como máscara de água (terra = acima de 0,3 m) e deixa de usar a linha de costa do OSM (que "vazava" mar para dentro do continente).
- Para refazer: `npm run fetch-cidades -- --refazer` (os ladrilhos ficam em `data/cache/dem/`, ~47 MB).

## Fase 23 — extração e cache
- Nenhuma fonte nova. O extrato do Sudeste (Geofabrik, mesma URL acima) agora gera `data/osm-cache/recorte-<hash>.ndjson.gz` (caixa do Rio + 0,08°) e `manifesto.json`; ambos são derivados e ficam fora do git. Saída binária em `public/data/cidades/<ibge>/`.

## Fase 26 — facções e instituições
- Nenhuma fonte externa nova. `src/data/seguranca/*.json` são **parâmetros de jogo ilustrativos** (relações, rendas, armamento, tempos de resposta); a distribuição inicial é sorteada pela semente. Polígonos de bairro: os do Censo 2022/IPP já listados acima. Bases (batalhões, delegacias, quartéis) são posições de jogo ancoradas em bairros, não endereços oficiais.

## Fase 27 — veículos especiais
- **Pistas do Santos Dumont e do Galeão**: OpenStreetMap via Overpass API (https://overpass-api.de/api/interpreter), `aeroway=runway`, ways 510811286, 12292143 (SDU), 12291112, 12291116 (GIG), baixado em 28/10/2026; licença ODbL (© colaboradores do OpenStreetMap). Guardadas em `src/data/veiculos/especiais.json` → `pistas`.
- **Modelos 3D**: Kenney Watercraft Kit 2.1 e Car Kit 3.1 (CC0, https://kenney.nl) e 10 modelos do Poly Pizza (CC-BY 3.0 / domínio público), 28/10/2026 — lista completa em `assets/CREDITS.md`.
- **Rotas e horários**: parâmetros de jogo aproximados (não são procedimentos oficiais). Posições de bases (Lagoa, Arsenal, heliportos) são locais de jogo, não endereços oficiais.

## Fase 28 — São Januário
- **Estádio de São Januário (Estádio Vasco da Gama)**: OpenStreetMap via Overpass API, `leisure=stadium` way 353439809 (contorno), `leisure=pitch` ways 353439806 e 353439812, tênis way 353439811, baixado em 28/10/2026; ODbL (© colaboradores do OpenStreetMap). Guardado em `src/data/marcos/sao-januario.json`. Capacidade e data de inauguração: Wikipédia/Wikidata Q721419 (conferir antes de publicar).
- Expansão noroeste (planejada, não executada): o DEM Copernicus GLO-30 já em `data/cache/dem` (tile S23 W044) cobre Madureira (-22,87; -43,34), Penha e o Galeão; o OSM exigiria novo recorte do extrato do Sudeste (Geofabrik).
