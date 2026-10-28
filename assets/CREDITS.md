# Créditos de assets (texturas, HDRI, modelos)

Só entram assets CC0, CC-BY ou MIT. Cada linha: nome, autor, URL, licença e data do download. Os arquivos que o jogo carrega ficam em
`public/assets/` (texturas JPEG em 1024 px — cor — e 512 px — normal e rugosidade); os zips originais, em `data/cache/acg/` (fora do git).
Baixar de novo: `npm run fetch-assets` (+ `powershell -NoProfile -File scripts/comprimir-materiais.ps1`).

## Texturas PBR — ambientCG (CC0 1.0), autor: Lennart Demes / ambientCG.com

| Material | URL | Uso no jogo | Baixado em |
|---|---|---|---|
| Grass004 | https://ambientcg.com/view?id=Grass004 | camada **grama** do chão (splat), banquetas | 27/10/2026 |
| Ground103 | https://ambientcg.com/view?id=Ground103 | camada **terra** do chão (splat) | 27/10/2026 |
| Rock064 | https://ambientcg.com/view?id=Rock064 | camada **rocha** do chão (splat, em três projeções acima de 35°) | 27/10/2026 |
| Moss001 | https://ambientcg.com/view?id=Moss001 | camada **mato** (sub-bosque e musgo) do chão (splat) — Fase 21 | 28/10/2026 |
| Asphalt033 | https://ambientcg.com/view?id=Asphalt033 | detalhe do asfalto das ruas, cruzamentos e ilhas | 27/10/2026 |
| PavingStones046, PavingStones128 | https://ambientcg.com/view?id=PavingStones046 | detalhe das calçadas | 27/10/2026 |
| Concrete034 | https://ambientcg.com/view?id=Concrete034 | paredes de prédios baixos | 27/10/2026 |
| Plaster001, PaintedPlaster017 | https://ambientcg.com/view?id=Plaster001 | reboco de casas e prédios | 27/10/2026 |
| RoofingTiles006, RoofingTiles013A, RoofingTiles014A, Gravel043 | https://ambientcg.com/view?id=RoofingTiles014A | telhados | 27/10/2026 |
| Facade001, Facade005, Facade006, Facade014, Facade017, Facade018A/B, Facade019A/B, Facade020A/B | https://ambientcg.com/view?id=Facade001 | fachadas de prédios altos (as variantes B trazem as janelas acesas) | 27/10/2026 |

Licença: Creative Commons CC0 1.0 Universal (domínio público; atribuição não exigida, registrada aqui por cortesia).

## HDRI — Poly Haven (CC0 1.0)

| Asset | Autor | URL | Uso | Baixado em |
|---|---|---|---|---|
| kloofendal_48d_partly_cloudy_puresky (1K) | Greg Zaal | https://polyhaven.com/a/kloofendal_48d_partly_cloudy_puresky | luz ambiente e reflexos (HDRI) | 27/10/2026 |

## Modelos 3D

Nenhum modelo externo no jogo: veículos, pessoas, marcos, trens, estações, muros e portais são geometria procedural (ver `ASSETS_LICENSES.md`).
Pendência (regra de assets 3D): trocar carros e pessoas por modelos CC0 (Kenney, Quaternius) — `data/cache/kenney/car-kit.zip` foi baixado numa
tentativa anterior, mas **não** está em uso e **não** foi convertido para GLB/DRACO.

## Texturas procedurais (sem download)

Asfalto, calçada, calçadão de pedra portuguesa, concreto de muro com barbacãs, brita e dormentes da via férrea, grama de banqueta, degraus das
escadarias: desenhados em canvas por código (`src/render/city/texturas.ts`, `Vias.tsx`, `Trilhos.tsx`, `Caminhos.tsx`).
