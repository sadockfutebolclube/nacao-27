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

Baixados em 28/10/2026 (Fase 27: veículos especiais), convertidos por `npm run converter-modelos` (weld, quantização e compressão **meshopt**; texturas ≤ 1024 px) e
gravados em `assets/models/<categoria>/`. Os originais ficam em `data/cache/modelos-origem/` (fora do git). Escala e orientação de cada um estão em
`src/data/veiculos/especiais.json`. Carros, pessoas, prédios e marcos do jogo continuam procedurais (pendência antiga da regra de assets).

### Kenney (CC0 1.0) — https://kenney.nl

| Arquivo | Pacote | URL | Uso |
|---|---|---|---|
| navio/ship-cargo-a, ship-cargo-b, ship-cargo-c, ship-large | Watercraft Kit 2.1 | https://kenney.nl/assets/watercraft-kit | navios mercantes; ship-large (tingido de cinza) é o navio da Marinha |
| navio/ship-ocean-liner, ship-ocean-liner-small | Watercraft Kit 2.1 | idem | navio de cruzeiro; barca Rio–Niterói |
| navio/ship-small, boat-sail-a, boat-sail-b | Watercraft Kit 2.1 | idem | escunas e veleiros de passeio |
| navio/boat-fishing-small, boat-tug-a, boat-speed-a, boat-speed-b, boat-speed-d | Watercraft Kit 2.1 | idem | pesca, rebocador, jetskis e botes |
| navio/boat-row-small, boat-tow-a, boat-sail-a | Watercraft Kit 2.1 | idem | convertidos, ainda sem uso (reserva) |
| terrestre/police, ambulance, firetruck, truck, suv, van | Car Kit 3.1 | https://kenney.nl/assets/car-kit | viaturas (PM, Civil, Federal, Guarda), SAMU, Bombeiros, blindado do BOPE |

### Poly Pizza (https://poly.pizza)

| Arquivo | Título e autor | Licença | URL | Uso |
|---|---|---|---|---|
| aviao/aviao-linha-a | "Airplane", Poly by Google | CC-BY 3.0 | https://poly.pizza/m/a3XrQkLNna9 | jato de linha grande |
| aviao/aviao-linha-b | "Airplane", Poly by Google | CC-BY 3.0 | https://poly.pizza/m/8ciDd9k8wha | jato de linha (Santos Dumont, Galeão) |
| aviao/aviao-pequeno | "Small Airplane", Vojtěch Balák | CC-BY 3.0 | https://poly.pizza/m/7cvx6ex-xfL | aviação leve |
| aviao/caca | "Jet", jeremy | CC-BY 3.0 | https://poly.pizza/m/6fyLMORhgGK | caça da Aeronáutica |
| helicoptero/heli-escuro | "Helicopter", kazuma | Domínio público (CC0) | https://poly.pizza/m/EQJ2MECUbx | helicóptero da PM |
| helicoptero/heli-amarelo | "Helicopter", Poly by Google | CC-BY 3.0 | https://poly.pizza/m/cTzINMr0WdS | turismo (Cristo e Pão de Açúcar) |
| helicoptero/heli-branco | "Helicopter", jeremy | CC-BY 3.0 | https://poly.pizza/m/eb7b31pjGtQ | turismo |
| helicoptero/heli-grande | "Helicopter", Poly by Google | CC-BY 3.0 | https://poly.pizza/m/6U2H_0VSAXY | imprensa |
| helicoptero/heli-militar | "Helicopter", Zsky | CC-BY 3.0 | https://poly.pizza/m/hG2Qr0A3zR | Bombeiros (resgate aéreo) |
| terrestre/humvee | "Humvee", madtrollstudio | CC-BY 3.0 | https://poly.pizza/m/Ebryot9iKM | veículo do Exército |

Atribuição CC-BY 3.0: modelos de "Poly by Google", Vojtěch Balák, jeremy, Zsky e madtrollstudio, via Poly Pizza, sem alterações além da conversão/compressão e de
escala/cor no jogo. O jato executivo "Jet" (Poly by Google, bgUY8zN2Bq9) foi baixado mas **não** usado (textura de 2048 px, acima do limite de 1024).
Sketchfab não foi usado (sem `SKETCHFAB_TOKEN`).

### Estádio de São Januário (Fase 28)
Procurei estádios gratuitos no Poly Pizza ("Football stadium" e "Ballpark", Poly by Google; "Stadium Seats" e "Stadium", Zsky — CC-BY 3.0): são genéricos e não seguem o contorno real de 100 × 195 m, então o estádio é modelado no código a partir do contorno do OpenStreetMap (ODbL). Nenhum modelo externo foi usado.

## Texturas procedurais (sem download)

Asfalto, calçada, calçadão de pedra portuguesa, concreto de muro com barbacãs, brita e dormentes da via férrea, grama de banqueta, degraus das
escadarias: desenhados em canvas por código (`src/render/city/texturas.ts`, `Vias.tsx`, `Trilhos.tsx`, `Caminhos.tsx`).
