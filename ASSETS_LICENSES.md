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
| Veículos (carro, moto, ônibus) | `src/render/city/Veiculos.tsx` | caixas instanciadas |
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
Kenney (CC0), Quaternius (CC0), Poly Haven (CC0), ambientCG (CC0), Freesound (CC0/CC-BY — atribuir aqui).
