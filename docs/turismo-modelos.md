# Pontos turísticos: modelos 3D comparados (Fase 31)

Regra de assets do CLAUDE.md: para cada ponto, procurar em Kenney, Quaternius, Poly Pizza, OpenGameArt e Smithsonian, comparar candidatos
(polígonos, fidelidade, licença) e só então modelar no código. Busca feita em **28/10/2026** no Poly Pizza (a busca do site; os GLB crus de
todos os candidatos ficaram em `data/cache/modelos-origem/turismo/` e dá para vê-los lado a lado em `/galeria-candidatos.html?ids=…` no dev).
Sketchfab não foi usado: não há `SKETCHFAB_TOKEN`. Kenney, Quaternius e OpenGameArt não têm marcos do Rio; o Smithsonian 3D não foi consultado
(acervo de museu, sem monumentos cariocas). **Limite da busca:** o Poly Pizza devolveu uma página de desafio (Cloudflare) em algumas buscas;
as que falharam foram repetidas depois (Museum, Library, Opera house, Baroque church) e deram resultado.

Escolhidos = modelo baixado. "Procedural" = nenhum candidato serve; modelado no código com as medidas reais.

| Ponto | Candidatos comparados (autor · triângulos · licença) | Decisão e motivo |
|---|---|---|
| **Cristo Redentor** | "Statue" (Zsky · 758 · CC-BY); "AngelStatue" (Zsky · 1.673 · CC-BY); "Reclining Figure" (Justin Hsu · 226 · CC-BY); cruzes e estátuas (Quaternius · 560–5.400 · CC0); "Rio de Janeiro" (Alan Zimmerman · 18.244 · CC-BY) | **Procedural** (`monumentos.ts: cristo()`): nenhum tem braços abertos nem a túnica; o "Rio de Janeiro" é uma cena de cidade de ~400 grupos, não um monumento. Medidas reais: estátua de 30 m, pedestal de 8 m, 28 m de braço a braço; manto em sólido de revolução com pregas, panos sob os braços, mãos, cabeça, barba; revestimento em mosaico de pedra-sabão (textura gerada em canvas). |
| **Roda-gigante (Rio Star)** | "Ferris wheel" (Poly by Google · 3.168 · CC-BY); "Ferris wheel" (jeremy · 2.800 · CC-BY); "Ferris Wheel" (CreativeTrio · 10.672 · CC0); "Animated Ferris Wheel" (Arif · 3.804 · CC-BY) | **Arif.** Só ele tem a roda e as cabines como nós separados com animação: o resto é uma malha única (a roda não gira sem girar o suporte). Escalado a 88 m (OSM `height=88`). Texturas: nenhuma. |
| **Bondinho do Pão de Açúcar** (cabine) | "Chairlift" ×2 (Poly by Google · 1.784 e 1.514 · CC-BY); "Tram" (jeremy · 2.724 · CC-BY); "Cable Car" (Bruno Oliveira · 1.908 · CC-BY) | **Procedural** (`monumentos.ts: cabineBondinho()`): são cadeiras de esqui ou bondes de trilho; a cabine fechada, de vidro, pendurada num carrinho, não existe. Casco vermelho/branco, faixa de vidro, montantes, carrinho e cabo. |
| **Bonde de Santa Teresa** | "Cable Car" (Bruno Oliveira · 1.908 · CC-BY); "Tram" (Poly by Google · 1.130 e 3.294 · CC-BY); "Tram" (jeremy · 2.724 · CC-BY) | **Bruno Oliveira**: laterais abertas e estribo, como o bonde carioca. É vermelho; o de Santa Teresa é amarelo, então o jogo troca só os vermelhos do material (a licença permite adaptar, com crédito). |
| **Guarda-sol** | "Red/White Beach Umbrella" e "Blue/White…" (S. Paul Michael · 214 · CC-BY); "Umbrella" (Poly by Google · 196 · CC-BY); "Umbrella and chairs" (Poly by Google · 600 · CC-BY) | **S. Paul Michael, vermelho e branco**: a lona recebe a cor da instância (8 cores), o cabo não. |
| **Cadeira de praia** | "Beach chair" (Poly by Google · 264 · CC-BY); "Orange/Teal Chaise Lounge" (S. Paul Michael · 1.630 · CC-BY); "Umbrella and chairs" (600) | **Poly by Google, 264 tris**: leve para ~1.500 instâncias; as de espreguiçadeira têm 6× mais triângulos. |
| **Quiosque** | "Market Stand" (Quaternius · 1.548 · CC0); "Shop" (Ev Amitay · 1.748 · CC-BY); "Vending Machine" (Don Carson · 3.332 · CC-BY); "Shop" (Shaun Glowa · 9.829 · CC-BY) | **Quaternius, CC0.** Banca de madeira com telhado, parecida com o quiosque de coco; as lojas são fechadas. |
| **Prancha de surfe** | "Surfboard" (jeremy · 424 · CC-BY); "Surfboard" (Poly by Google · 1.280 · CC-BY) | **jeremy**: mais leve; a cor vem da instância. Vem em pé, o jogo a deita. |
| **Cachorro** | "Shiba Inu" (Quaternius · 1.812 · CC0); "Beagle" (Poly by Google · 712 · CC-BY); "Husky" (Quaternius · 1.822 · CC0) | **Shiba, CC0.** Pose do modelo, sem andar (balança o corpo no jogo). |
| **Bicicleta** | "Bicycle" (jeremy · 2.466 · CC-BY, sem textura); "Bicycle" (Poly by Google · 1.714 · CC-BY, textura 2048 px); outras 6 de 2,3–9,9 mil triângulos | **jeremy**: a de Poly by Google foi rejeitada pela regra de textura (≤ 1.024 px). |
| **Maracanã, São Januário, Sambódromo** | "Stadium" (Zsky · 668), "Stadium Seats" (Zsky · 236–594), "Low Poly Sports Stands" (Cole Brenner · 1.020), "Coliseum" (Poly by Google · 4.644 e 24.153), todos CC-BY | **Procedural.** São genéricos e não seguem o contorno real (ver também a Fase 28). O Sambódromo é gerado a partir do eixo da Rua Marquês de Sapucaí no OSM (arquibancadas de 12 m em degraus, 13 setores por lado). |
| **Candelária, Theatro Municipal, Biblioteca Nacional, Catedral** | "Cathedral" (Bruno Oliveira · 1.450 · CC-BY); "Church" (Poly by Google · 1.370 · CC-BY; CreativeTrio · 2.265 · CC0); "Temple" (Quaternius · 317 e 2.292 · CC0); "Theatre V0.1" (Cormac White · 16.588 · CC-BY, é um interior); "Building" (Kay Lousberg · 828 · CC0); "Museum Diorama" (Joshua Johanson · 8.545 · CC-BY) | **Procedural** (`candelaria()`, `theatro()`, `biblioteca()`): são igrejas e prédios genéricos; nenhum tem duas torres e cúpula (Candelária), pórtico com cúpula verde (Theatro) ou pilastras neoclássicas (Biblioteca). A Catedral já era modelada na Fase 15. |
| **Pão de Açúcar, Morro da Urca, Corcovado** | "Mountaintop", "Snowy Hills"… (genéricos); "Rio de Janeiro" (cena) | **Terreno**: o relevo vem do DEM (Copernicus GLO-30/SRTM) com os picos reais (`PICOS_RIO`, Fase 15); modelo de montanha não serve. |
| **Escadaria Selarón, Arcos da Lapa, Museu do Amanhã, Praça Mauá, Aterro, parques** | nenhum candidato relevante | Arcos e Museu: procedurais da Fase 15 (sobre o prédio do OSM). Selarón: faixa de azulejos sobre o eixo do polígono OSM w237171010 (parte dela fica sob as casas que o jogo gera no morro). Parques: o desenho do OSM, mais as zonas de atividade. |
| **Santos Dumont** | nenhum | Aeroporto: pista e terminal do OSM (Fase 27); só ganhou zona de passageiros. |

## O que ficou em TEMP (e por quê)

- **Maracanã**: arquibancada e teto são os da Fase 15 (elipse com teto em anel), sem a cobertura de lona real nem a cobertura de cadeiras.
- **Parque de Madureira**: está em `pontos.json` e na ficha (marcado `foraDoMapa`), mas **fora da área jogável** (x ≈ −16 km). Depende da expansão do mapa para o noroeste, ainda não feita (DECISIONS D-129).
- **Floresta da Tijuca**: só a borda leste está no mapa (a Mesa do Imperador, x ≈ −6,4 km); sem casas nem simulação além de 6,1 km, apenas relevo e vegetação.
- **Roda-gigante**: as cabines ocupadas são duas cabeças com ombros escuros dentro de cada cabine (não pessoas animadas); o modelo tem cabines abertas.
- **Bondinho**: a cabine é nova, mas as estações continuam as caixas da Fase 15 e as cabines não têm passageiros.
- **Pessoas**: sem clipe de "tirar foto" nem "braços abertos" na animação original — as duas poses foram montadas apontando os ossos dos braços e valem para um quadro (sem transição). Só adultos do sexo masculino (o único personagem com esqueleto CC0 do Quaternius com clipes úteis).
- **Cachorro**: pose única do modelo, sem animar as patas; a bicicleta leva a pessoa sentada sem as mãos no guidão.
- **Vôlei, futevôlei e surfe**: o futevôlei usa a mesma rede com jogadores parados e pulando; o surfista fica de pé na prancha sem a animação de remar.
- **Calçadão em ondas**: já existia desde a Fase 21 (Copacabana e Ipanema) e foi mantido.
- **Aterro, Parque Lage, Jardim Botânico, Quinta**: sem modelos próprios; as zonas de gramado, caminho e foto usam os caminhos reais do OSM. A Quinta aparece com a lagoa-praia gerada pelo relevo, onde os banhistas da Fase 16 também entram.
- **Prédios do Centro**: já eram os polígonos do OSM com a altura dos andares; o destaque desta fase é o balizamento vermelho piscante nos mais altos (≥ 100 m).
