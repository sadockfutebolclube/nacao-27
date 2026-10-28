# CHANGELOG

## 1.15.0 — Fase 26: facções, instituições, ocorrências e despacho (28/10/2026)

Print em `docs/auditoria-faccoes/`. **Tudo é dado em `src/data/seguranca/*.json`** (validado por zod; erro de digitação vira mensagem com o campo).

### O que é
- **Facções** (Milícia, CV, ADA, TCP): poder, armamento, dinheiro, influência política, rivais/aliados/neutros e quatro fontes de renda (tráfico, "taxas", gatonet, transporte alternativo). A renda é população controlada × taxa por fonte; o custo é armamento + propina + pessoal; parte do caixa repõe armas.
- **Territórios por polígono**: as 63 unidades do Censo/IPP (bairros) guardam a parcela de cada facção (sem Censo, setores de 1 km). Mudam por **conflito** (pressão = rivalidade × diferença de poder + ruído, com baixas), **expansão** para vizinhas, **operações policiais** (apreendem armas/dinheiro e derrubam o domínio) e **acordos** (trégua entre rivais cansados, ruptura de aliança). Tecla **T**: overlay colorido + painel com 4 abas (Facções, Territórios, Instituições, Ocorrências).
- **Estado**: PM (com BOPE), Polícia Civil, PF, Guarda Municipal, Exército, Marinha, Aeronáutica, Bombeiros, SAMU. Delegacias, batalhões, bases, hospitais e UPAs que o jogador constrói viram bases de despacho.
- **Ocorrências** (operação, confronto, blitz, roubo, incêndio, acidente, resgate, enchente): sorteadas por dia (Poisson × condições do local), despachadas (incêndio → Bombeiros; ferido → SAMU; tiroteio → PM/BOPE; crime → Civil) com ETA = preparo + distância/velocidade + escolta em área dominada. Quanto mais demora a chegada, mais mortes.
- **No mapa**: cenas com efeitos (tiros, fogo, alarme, água), faixa de sirene e rótulo com 1ª viatura/ETA; **viaturas** (modelos reaproveitados, cor por instituição) percorrem as ruas; carros **cedem passagem**; **pedestres fogem, se escondem ou ficam curiosos**; o **comércio fecha** e o **trânsito afunila** no raio da cena.

### Limites (honestos)
- Os nomes das facções são reais, mas **distribuição inicial, alianças, rivalidades, rendas e armamento são parâmetros ilustrativos do jogo**, não dados sobre organizações reais; a distribuição é sorteada pela semente. Nenhuma fonte externa nova (ver `data/SOURCES.md`).
- "Comunidade" = polígono de **bairro** do Censo; favelas não têm polígono próprio.
- Ambulância e caminhão de bombeiros reutilizam os modelos de van e de caminhão; no máximo 4 cenas desenhadas (a menos de 900 m da câmera), as demais só contam nos números.
- O fechamento do comércio aparece na ficha do estabelecimento e no desenho; não há efeito econômico separado.
- Economia: custos escalam com a população da cidade (`populacaoReferencia`), senão cidades pequenas quebram as facções; o perdedor de uma guerra pode colapsar (CV na cidade de teste) — balanceie em `faccoes.json`.
- Testes: `tests/fase26.test.ts` (16).


## 1.14.0 — Fase 25: seleção por clique e fichas das entidades (28/10/2026)

Prints em `docs/auditoria-entidades/`.

### O que é
- **Clique** em pessoa, carro, ônibus, casa, prédio, estabelecimento ou ponto turístico abre um painel lateral. Duplo clique: a câmera passa a seguir a entidade (e se aproxima, se for pequena). Botões **Seguir** e **Travar câmera** (travada: acompanha e não deixa arrastar); arrastar a câmera ou usar WASD cancela o "seguir". Esc fecha.
- **Contorno**: as arestas da caixa da entidade em amarelo (por cima de tudo), anel no chão e, nas pequenas, um marcador flutuante que cresce com a distância.
- **Minimapa** na ficha: o mapa de 12 km (relevo, mar, ruas) com o **polígono do bairro do Censo/IPP destacado** e um alfinete na posição.

### Arquitetura
- **Registro de entidades (ECS leve)** em `src/entidades/registro.ts`: IDs numéricos, componentes por nome, "fontes" vivas e o picking. Quem desenha (`Pedestres`, `Veiculos`, `Onibus`) só **publica a caixa** de cada entidade a cada quadro e registra uma fonte de dados vivos; o painel pergunta ao registro, não ao Three.js. Dinâmicas (pessoas, carros, ônibus) em typed arrays por grupo; estáticas (122 mil prédios + marcos) num índice em grade (CSR) montado por mundo.
- **Picking por raio**: raio contra caixas orientadas (método das placas); prédios por varredura da grade (DDA). Pessoas e carros ganham margem que cresce com a distância. O que está atrás do relevo não é clicável.
- **Fichas** (`src/entidades/geracao.ts`, funções puras, dados em `src/data/entidades.json`): a mesma semente dá sempre a mesma pessoa. `contexto.ts` levanta os fatos do mundo (lotes, ruas, bairros do Censo, território, hora, chuva).

### Fichas
- **Pessoa**: nome, idade, profissão, renda aproximada e classe (A–E por múltiplos do salário mínimo), humor com o motivo, onde mora (rua, número, bairro, região), onde trabalha, o que está fazendo agora, afiliação a facção/milícia se houver, **flag de criminoso oculta**, revelada pelo botão **Investigar** (3 s; 60% de chance, senão "inconclusivo" e dá para tentar de novo) e histórico recente.
- **Casa/prédio**: endereço, bairro, região (Zona Sul/Norte/Centro/Oeste pela AP/RA do Censo), tipo, andares, moradores e idades, classe predominante, nível de segurança, quem domina o território, valor estimado do imóvel.
- **Estabelecimento**: tipo (pelo nome do OSM), dono, funcionários, clientes agora, horário, faturamento, taxa a facção/milícia.
- **Carro/ônibus**: modelo, tipo (civil, táxi, ônibus, viatura, serviço), motorista, velocidade real, destino estimado, passageiros; ônibus reais mostram a linha do GTFS ("455 — Méier - Copacabana").
- **Ponto turístico** (Cristo Redentor, Bondinho, Maracanã, Arcos da Lapa, Museu do Amanhã, Catedral): visitantes agora, nota e história curta.

### Limites (honestos)
- Renda, faturamento, dono, funcionários, nota e visitantes são **estimativas do jogo**, não dados oficiais; a ficha diz isso.
- O destino do carro é **estimado**: o tráfego visual não calcula a rota inteira.
- A frota não tem ambulância (só viatura da PM, ônibus, táxi, coleta…): o tipo "ambulância" não aparece.
- Prédios sem estrutura no OSM caem em "Comércio (sem nome no mapa)"; casas/prédios construídos pelo jogador aparecem a cada ~20 s no índice.
- A pessoa selecionada não some enquanto o jogador a olha; se mesmo assim sair de cena, o painel mostra a última ficha e avisa.
- Testes: `tests/fase25.test.ts` (20).

## 1.13.0 — Fase 24: pedestres dirigidos por dados (28/10/2026)

Prints antes/depois em `docs/auditoria-pedestres/`.

### Causa raiz
- A quantidade de pedestres era `população ÷ 18 × curva horária única`, limitada só pelo comprimento de calçada ÷ 3: toda calçada perto da câmera enchia igual, em qualquer lugar. Numa rua residencial do Laranjeiras às 3h apareciam ~15 pessoas em 47 m de rua (`antes-residencial-3h.jpg`).
- Nas pontas da calçada, 40% dos becos sem saída e 20% das esquinas mandavam o pedestre atravessar o asfalto em linha reta, com ou sem faixa.

### Mudanças
- **Densidade por dados** (`src/render/city/densidade.ts` + `src/data/pedestres.json`): densidade(célula, hora, dia) = Σ classes (peso × pico × Σ personas mistura × fração visível) + reforço de POIs. Classes: centro, comercial, residencial, industrial, serviço, orla, praça, vazio — vindas dos prédios reais (tipo × área de piso por célula de 64 m), da distância da água, dos bairros do centro (OSM) e da vegetação de parque; dentro da água o peso é zero. POIs: paradas de ônibus (GTFS) e estações. Tudo editável no JSON.
- **Rotina**: 6 personas (trabalhador, estudante, aposentado, turista, esportista, ambulante) com horários em dia útil e fim de semana (casa → trabalho/escola → comércio → casa). Dormir, ficar em casa, no trabalho ou na escola = dentro de um prédio: não é desenhado, só conta no modelo agregado.
- **Estados** visíveis: andando, esperando ônibus (na parada), sentado (praça; pose nova no shader), comprando (na frente das lojas) e trabalhando (ambulante).
- **Só em calçada**: a travessia da rua só acontece em nó com semáforo (que desenha a zebra); sem semáforo, se o trecho reto entre as duas calçadas passa sobre o asfalto da boca da rua, o pedestre dá meia-volta pela mesma calçada; beco sem saída: meia-volta, nunca atravessa.
- **Câmera**: nasce e some por proximidade (raio 120–380 m); ao passar para uma zona mais vazia, parte do povo entra num prédio (a densidade manda, não o acaso). A contagem da cidade inteira vive no **modelo agregado** (Σ densidade × metros de via ÷ 100).
- **F3**: slider de densidade global (0–3×), dia da semana forçado, mapa de calor (azul → vermelho, 0 → 40 pessoas / 100 m de via; o wireframe sai do caminho enquanto ele está ligado) e o modelo agregado (total na rua, desenhados, por estado). Dev: `window.__n27ped`.
- Testes: `tests/fase24.test.ts` (18).

### Limites conhecidos
- Prédios que o jogador constrói não entram na classe da célula (só os prédios reais do arquivo); as personas não são rastreadas fora da câmera (o modelo é por densidade, não por agente).
- Escadarias, trilhas e calçadões do OSM (`caminhos`) ainda não são rede de caminhada; na areia, quem anda/deita é o `Praia.tsx` (que já seguia fim de semana e calor).
- Ainda sobram travessias sem semáforo em esquinas largas onde o trecho reto fica fora do asfalto das pernas medidas (1–8 de ~450 pedestres ativos nas medições de auditoria; antes: 13 de 17 travessias eram assim).

## 1.12.0 — Fase 23: simulação em orçamento e geração em 22 s (28/10/2026)

Medições antes/depois em `docs/fase23-medicoes.md`.

### Simulação
- O trabalho pesado do dia (redes, serviços sociais, território, favelas, transporte semanal, poluição, valor do solo, demanda, crescimento, agregados) virou **gerador** sob `Orcamento` (`src/sim/orcamento.ts`): cada `step()` gasta no máximo ~4 ms nele e o worker termina a fila em fatias de 4 ms entre um tick e o próximo. Se o dia anterior ainda não acabou, o novo dia é engolido por ele (contado em "dias engolidos"). `orcamentoMs = Infinity` mantém o modo síncrono e completo (testes, "avançar N dias", salvar).
- **LOD pela câmera**: o worker recebe o foco e os lotes fora do raio (900–3000 m, conforme o zoom) rodam valor do solo e crime a cada 4º dia, escalonados por índice, com a taxa de alisamento dos dias parados.
- **Tipado e sem alocação**: Dijkstra em CSR com heap tipado (`dijkstraEm`), nó mais próximo em grade, `HashLotes` (hash espacial) nos laços equipamento × lote, tabelas por arquétipo, posições em `Float64Array`, caches por versão do mundo (redes, grafo compacto, manutenção das vias).
- **Painel F4** (`PainelPerformance`): fps e p95 do desenho, passo da simulação (último, mediana, p95, p99, pior), orçamento ajustável, fila, lotes no foco e custo por fase.
- Resultado no Rio (139 mil lotes): passo mediano 5 ms, p99 12 ms, pior 17 ms (antes: 8,2 s no pior); CPU por dia 1.179 → 127 ms. O pior passo ainda passa de 16 ms em algumas rodadas.

### Geração de dados
- Relevo 138,7 → 10,8 s (`limitarInclinacao` só reconfere o que mudou) e prédios 55 → 5 s (grades numéricas, caixa dos polígonos de uso): **201 → 22 s** com saída idêntica.
- Extração do OSM: `data/osm-cache/manifesto.json` guarda o hash (caixas + `EXTRATOR_VERSAO`) de cada cidade e só extrai o que o hash não reconhece; a 1ª leitura grava um **recorte por caixa** (32 MB, NDJSON gzip) do PBF de 862 MB e as seguintes leem só ele (3,5 s). Com `osmium` no PATH o pré-filtro usa `osmium extract` (**não está instalado aqui: esse ramo não foi executado**). A 1ª leitura do PBF continua levando minutos.
- Saída em **binário** (`src/data/cidadeBinaria.ts`): núcleo + 104 tiles de 1 km, ida e volta idêntica à `CidadeReal` do JSON; o carregador usa o binário e cai no JSON. 11,1 MB contra 16,2 MB; decodificar leva o mesmo que JSON + zod. O carregamento **sob demanda por tile ainda não está ligado**: hoje o jogo busca todos os tiles.
- Testes: `tests/fase23.test.ts` (16).

## 1.11.1 — Correção: tela cinza ao dar zoom (28/10/2026)

### Causa raiz
- O modo de qualidade automático (`PerformanceMonitor`) troca o nível quando o FPS cai — o que acontece ao dar zoom, com mais detalhe na tela. A troca remontava o CSM da Fase 21, e `csm.dispose()` faz `delete material.onBeforeCompile` em cada material que passou por `setupMaterial`: apagava o **shader próprio do terreno (splat, normais, estação do ano) e dos prédios**. O chão voltava a ser a cor do vértice (branco), a água e as ruas ficavam sobre um mundo branco-acinzentado, e, como a chave do programa continuava a mesma, em outros casos o programa em cache rodava sem os uniformes (manchas vermelhas e pretas).
- Reproduzido nas mesmas câmeras em 3 alturas (900, 150 e 30 m) depois de trocar de nível: `docs/auditoria-zoom/antes-*`.

### Correção
- `desligarCSM(csm, scene)` (`CeuLuz.tsx`): antes do `dispose()`, devolve a cada material o `onBeforeCompile` e a chave de programa originais, tira os defines e **esvazia `csm.shaders`** para o `dispose()` não apagar nada. Verificado trocando alta → média → baixa → média → alta: o terreno mantém o gancho próprio (`hasOwnProperty`) e a chave certa em todas as voltas; prints `depois-*`.
- 4 testes de regressão (`tests/fase22.test.ts`), incluindo o que mostra a causa (o `dispose()` apaga o gancho) e o encadeamento sem duplicar o shader em 4 trocas seguidas.

### O que a investigação descartou (medido)
- **near/far**: near 3 m e far 30 km; resolução de profundidade de 24 bits em 30 m / 150 m / 900 m / 3 km = 0,0004 / 0,01 / 0,016 / 0,18 m — sem corte de geometria e o z-fighting é contido por `polygonOffset`; `logarithmicDepthBuffer` e near dinâmico não foram necessários (mexer neles não mudaria o cinza).
- **névoa**: `FogExp2` de 0,00022: 0,00% a 30 m, 0,11% a 150 m, 3,8% a 900 m, 35% a 3 km — não cobre a tela de perto. Com a névoa desligada o cinza continuava.
- **globo/nuvens**: não há Globe.GL nem camada de nuvens/atmosfera na cena (as "nuvens" do código são os saves na nuvem). O céu é o `<Sky>`.
- **culling/LOD**: o terreno tem 144 blocos, todos construídos na carga e todos visíveis; nenhum é descarregado, então a cor de limpeza não aparece.
- **controles**: `minDistance` 25 m e a câmera nunca desce a menos de 8 m do chão (`Camera.tsx`).

## 1.11.0 — Fase 21: o chão, os trilhos, os muros e a luz (28/10/2026)

Cada problema foi reproduzido com print antes de mexer; os 7 pontos de câmera estão em `docs/auditoria-visual/` (antes-N / depois-N), com as medições e o log de geração.

### 1. Chão em 4 camadas
- O chão deixou de ser uma cor chapada: **splat map** (um texel por vértice do relevo) com **terra** (Ground103), **grama** (Grass004), **mato** (Moss001, nova) e **rocha** (Rock064, em três projeções), todas CC0 do ambientCG (registradas em `assets/CREDITS.md`).
- Pesos por inclinação e uso do solo: rocha exposta acima de 35°; terra onde há gente (cobertura de prédios suavizada em ~30 m); mato onde o OSM mapeia mata ou a encosta passa de ~16°; grama no resto. O OSM não mapeia toda a vegetação do Rio, então "sem dado" virou verde, não solo exposto.
- Cada camada usa duas escalas (a segunda girada) misturadas por ruído e há variação de tom em escala de centenas de metros: sem repetição de ladrilho. A cor do vértice só leva a areia da praia.

### 2. Calçadão só na orla
- A pedra portuguesa em ondas saía em toda avenida a menos de 320 m da água (Niemeyer, Vidigal…). Agora só nas calçadas das ruas listadas em `src/data/orla.json` (Atlântica, Vieira Souto, Delfim Moreira…) e nos `highway=pedestrian` a menos de 250 m da água. Avenida comum e ferrovia nunca.

### 3. Via férrea
- Leito de **brita cinza-escura** (e não o concreto claro que parecia calçada) com **um dormente de madeira a cada 60 cm**, mais comprido que os trilhos; trilhos de aço por cima; nada de calçada ao lado. Só a estação tem plataforma.

### 4. Vias soltas e 7. prédios sobre a pista
- **Vias soltas**: ponte, túnel ou avenida (inclui as alças) cuja ponta tem grau 1, fica a mais de 40 m da borda e sem outra via a menos de 10 m. 5 saíram (Rua Uberaba, uma sem nome, Rua Teodoro da Silva, Estrada da Gávea, Avenida Rio de Janeiro); repete até não sobrar ponta.
- **Prédios**: o retângulo que passa a menos de 30% da meia largura do eixo da pista é empurrado para fora (até 3 vezes); se ainda invade, sai. **5.752 deslocados e 1.188 removidos** (0,8%) de 153.886; a planta (contorno) anda junto. Fora de viaduto e de túnel; prédio com nome (Arcos da Lapa, igrejas, estações) fica onde está. Sobra menos de 0,5% invadindo.

### 5. Minirrotatória e cruzamentos
- O "disco cinza" era o asfalto do cruzamento com UV constante (um texel só): agora a UV vem do mundo (6 m) e o tom e o grão são os da rua. A minirrotatória tem **ilha pintada** (asfalto um tom mais claro, +4,5 cm, `polygonOffset` −5: sem z-fighting) com **meio-fio** circular de 12 cm.

### 6. Muros de arrimo
- Concreto **fosco** (roughness 0,96, sem metal, reflexo do ambiente a 15%) em placas de 3 × 2,5 m com junta e **barbacãs**; o brilho de vidro vinha de metade das faces com o enrolamento do triângulo contrário à normal (agora o enrolamento segue a normal). Acima de 5 m, **patamares de até 5 m** com **banquetas de grama de 2 m** e guarda-corpo no topo (corte) ou na borda da pista (aterro).

### 8. Luz
- **CSM** (`three/addons/csm`): 2 cascatas em "alta" (2048) e em "média" (1024); a "baixa" segue sem sombra. Cada material do mundo recebe os uniformes do CSM encadeados ao `onBeforeCompile` que já tinha (terreno, prédios). **ACES** já era o mapeamento (pós-processamento) e o **N8AO** continua em "alta"; em "média" entra um AO leve (`quality: performance`). O "plano e sem sombra" vinha também do modo automático derrubar a qualidade para "média" no painel de pré-visualização.

### F3 por categoria
- O painel mostra vias soltas removidas, prédios deslocados e removidos (com as posições dos removidos), minirrotatórias, muros, pontes e túneis, além de morro, vão, rampa e rotatórias descartadas.

### Medições (painel do app, mesma máquina, qualidade "alta", 4 pontos)
| | média de fps |
|---|---|
| luz única (antes) | 91,7 |
| CSM, 2 cascatas | 89,2 (−3%; duas séries: 88,6 e 89,7) |
| CSM, 3 cascatas | 82,5 (−10%) — descartado |
| qualidade "média" (3 cascatas na medição) / "baixa" | 83–104 / ~142 |
Carga: mapa de normais do terreno ~0,6 s, construção das vias ~1,0–1,1 s (já eram). Heap JS ~1 GB (sem medição anterior do mesmo ponto).

### Verificado
- 9 testes novos (`tests/fase21.test.ts`: splat por inclinação/mata/prédios, lista da orla, vias soltas e prédios sobre a pista no arquivo do Rio, painel F3); typecheck estrito; build.

### Limitações
- Os prints são de 7 pontos; não percorri todo o mapa. O CSM de 2 cascatas deixa as sombras longínquas (> ~1,8 km) fora.
- A minirrotatória não tem faixas de pedestre próprias nem setas; os muros terraceados ficam em pé sobre o chão escavado (a grade de 10,7 m não representa o degrau).
- Os vãos sob a pista seguem fechados por lateral até o chão, não por talude de grama; `junction=circular` grande vira minirrotatória (sem a ilha elevada).
- O "antes" do fps usa o mesmo código com o CSM desligado (`localStorage['n27:desligar'] = 'CSM'`), não o commit anterior.

## 1.10.0 — Fase 20: encostas — regrade, muros, pontes, túneis e escadarias (28/10/2026)

### O que restava errado
- 715 trechos de rua acima de 30% de rampa (22 acima de 100%, máximo 290%): o perfil seguia o morro.
- Terreno cobrindo o asfalto: 1.302 trechos a mais de 30 cm, 178 a mais de 1 m, 48 a mais de 1,5 m (mesma régua, na pista).
- Escadarias, trilhas e calçadões do OSM nem entravam nos dados; `junction=circular` era descartado.

### Regrade da rede (`src/world/regrade.ts`)
- A rua muda, não o morro: as cotas dos **nós** relaxam trecho a trecho até 25% de rampa (teto 30%) e cada trecho é projetado na restrição com as duas pontas presas (`limitarRampa`). Resultado no Rio: maior rampa 25,7%, nenhum trecho acima de 30%; 984 nós movidos.
- Pela diferença rua × relevo original: **ponte/viaduto** (rua ≥ 3 m acima por ≥ 15 m), **túnel** (≥ 8 m abaixo por ≥ 40 m, com portal de concreto) e **muro de arrimo** (mais de 4 m de diferença), tudo por trecho contínuo. 403 pontes, 100 túneis, 172 trechos com muro.
- O muro (concreto, com guarda-corpo no topo) fica do lado do morro (corte) ou do vale (aterro); a lateral da pista agora desce até o terreno (até 14 m) em vez de parar a 2,2 m.
- A terraplenagem usa o regrade: ponte e túnel não escavam; cada célula obedece à rua que a puxa com mais força (a média deixava o morro 1 m acima do eixo); um teto final (30 cm abaixo do asfalto, no máximo 4 m de rebaixo) tira o morro de cima da pista.

### Relevo de 10,7 m
- A grade do relevo passa de 16 m (1.024 células) para **10,67 m** (1.536): o Copernicus (30 m) é reamostrado em **bicúbico** (preso ao intervalo dos 4 pixels vizinhos), a gaussiana segue em 24 m e entra **detalhe de alta frequência só nas encostas** (ruído simplex de ±0,9 m em 80 m e ±0,45 m em 40 m, ponderado pela inclinação; sem espetos).

### Escadarias, trilhas e minirrotatórias
- **Caminhos** do OSM (`steps`, `footway`, `path`, `track`, `cycleway`, `pedestrian`; sem calçada e faixa de pedestre que já existem nas ruas): 3.616 no Rio (579 escadas, 2.464 calçadas, 173 trilhas, 190 ciclovias, 209 calçadões). Não são asfalto: faixa estreita colada ao terreno, com textura própria (degraus, terra batida, concreto) e **sem escavar** (`Caminhos.tsx`).
- **Minirrotatórias**: `junction=circular` (círculo ajustado por mínimos quadrados) e rotatória de 4 a 8 m com raio ≥ 4 m viram cruzamento com ilha pintada. O resto continua descartado e registrado (hoje nada sobrou para descartar).

### F3 por trecho
- Cada linha do painel traz a classe do problema (morro sobre asfalto, vão, rampa), a inclinação máxima do trecho e o botão "ir"; no topo, as contagens de muros, pontes e túneis tratados.

### Antes → depois (Rio, `docs/auditoria-encostas/`)
| | antes (Fase 19) | depois |
|---|---|---|
| trechos com rampa > 30% | 715 | **0** |
| trechos com rampa > 100% | 22 | **0** |
| maior rampa de rua | 290% | **25,7%** |
| trechos com morro sobre a pista > 1 m | 178 | **21** |
| … > 1,5 m / > 3 m | 48 / 5 | 13 / 3 |
| … > 30 cm | 1.302 | 57 |
| trechos com o morro 1,2 m acima da calçada (régua antiga) | 530 | 72 |
| ponte / túnel / muro | 0 | 403 / 100 / 172 |
| arquivo do Rio | 12,5 MB | 16,3 MB |

### Verificado
- 8 testes novos (`tests/fase20.test.ts`: rampa, vale→ponte, morro→túnel, corte→muro, túnel não escava, rampa do Rio ≤ 30%, caminhos, minirrotatórias); 130 testes no total; typecheck estrito. Prints de Santa Teresa, da favela do Vidigal e da falésia da Avenida Niemeyer antes e depois, mais muro de arrimo, escadarias e o painel F3.
- No navegador (painel do app, GPU de software): 48 a 60 fps nos três casos; `[lento]` de 1,0 s para construir as vias.

### Limitações
- A meta "morro sobre asfalto < 30" vale a partir de 1 m (21 trechos); a 30 cm ainda são 57. A grade de 10,7 m não representa duas ruas paralelas a menos de ~20 m em cotas diferentes: a célula entre elas só obedece a uma.
- Os **vãos sob a pista** (rua > 3 m acima do chão) passaram de 117 para 2.857 trechos: baixar o terreno de cima do asfalto abre espaço embaixo da rua vizinha, mais alta. A lateral agora desce até o chão (até 14 m), então não há buraco aberto, mas é uma parede, não um viaduto com pilares (esses só nascem nos trechos contínuos de ≥ 15 m).
- Cortes de muro chegam a 125 m em um ponto (encosta quase vertical do Dois Irmãos/Vidigal); o muro cobre, mas o corte é irreal.
- A carga do relevo subiu (2,25× mais células, terraplenagem e regrade): `terrenoReal` ~1,9 s a frio no Node, e roda duas vezes (tela e worker). Os trens de rua do Vias e os lotes da simulação não conhecem pontes/túneis criados pelo regrade (só os do OSM).
- Os caminhos ainda não têm pedestres nem entram na simulação.

## 1.9.0 — Fase 19: auditoria do relevo e das ruas (28/10/2026)

### O que estava errado (medido com `npm run auditar-mapa`)
- 2.559 vértices de terra a mais de 8 m da mediana dos vizinhos (até 178 m!) e declives de até 1.600%: o mar do OSM "vazava" para dentro do continente e abria paredões de 180 m ao lado de morros; rios e canais do OSM rebaixavam encostas a −3 m.
- 18.409 seções de rua (10%) com a pista no ar e 31.914 (18%) com o morro por cima do asfalto.
- 5.062 cruzamentos com um disco de calçada elevado que parecia rotatória no meio de avenida reta.

### Relevo
- Altitude do **Copernicus DEM GLO-30** (AWS Open Data, registrado em `data/SOURCES.md`) no lugar do Terrarium. Mar, baía e lagoas já vêm em 0 m e viram a máscara de água: a linha de costa do OSM deixa de decidir o mar.
- Filtros (`src/world/relevo.ts`, puros e testados): remoção de outliers (Hampel 5×5), gaussiana σ = 1,5 célula só entre terra e terra, limite de inclinação de 50° (1,2) — 1,4 ao redor dos picos famosos. Rio e canal do OSM só rebaixam a baixada (< 8 m).
- Normais calculadas depois do relevo filtrado e escavado; novo **mapa de normais do terreno** (2048², bicúbico) suaviza o sombreado entre os vértices.

### Ruas
- **Terraplenagem** (`src/world/escavar.ts`): cada rua ganha um perfil longitudinal suave (média móvel dupla, a no máximo 4 m do terreno) e o terreno numa faixa de pista + calçada + 1,5 m (e nunca menos que uma célula) vai para 35 cm abaixo do perfil, com transição de 8 m. Pontes, túneis e água ficam como estão. O desenho das vias usa o mesmo perfil.
- Ordem de profundidade: terreno (offset +2) < água < calçada (−2) < asfalto (−3) < faixas (−6); plano próximo da câmera de 2 para 3 m.
- **Rotatórias** só existem onde o OSM diz `junction=roundabout`: anel fechado (juntando ways partidas), círculo (desvio ≤ 20%) de 8 a 40 m. 8 validadas; 30 descartadas e registradas no arquivo (27 `junction=circular`, 3 com raio de 6–7 m). Cruzamento comum é só uma caixa de asfalto rente ao leito.

### Depuração (F3)
- F3 alterna wireframe + painel → wireframe + normais do terreno (verde; vermelho acima de 50°) → desligado. O painel lista trechos enterrados, flutuando e íngremes (maiores primeiro, botão "ir" leva a câmera) e as rotatórias descartadas com o motivo.

### Antes → depois (Rio, `docs/auditoria-mapa/`)
| | antes | depois |
|---|---|---|
| vértices a >8 m da mediana | 2.559 (máx. 178 m) | 334 (máx. 22 m) |
| declive central máximo | 1.608% | 229% (cortes de rua e penhascos do litoral) |
| seções com pista flutuando (>2,5 m) | 18.409 | 1.325 |
| seções com morro sobre o asfalto (>1,2 m) | 31.914 | 2.116 |
| maior vão / maior aterro sobre a rua | 46 m / 39 m | 11 m / 8 m |
| rotatórias | 5.062 discos | 8 validadas, 30 descartadas |

### Verificado
- 10 testes novos (`tests/fase19.test.ts`: filtros, terraplenagem, relevo e ruas do Rio, rotatórias, fonte registrada); typecheck estrito; build ok. Prints antes/depois de Tijuca, Santa Teresa, Aterro do Flamengo e Zona Norte em `docs/auditoria-mapa/`.

### Limitações
- **Madureira não está no mapa**: o Rio do jogo cobre 16 × 16 km a partir do Cristo (lon −43,275 a −43,115) e Madureira fica a ~6 km a oeste da borda. A Zona Norte foi verificada em Vila Isabel/Grajaú. Estendê-lo é a fase "Barra e Zona Oeste".
- O Copernicus é um modelo de superfície; a filtragem tira degraus e espetos, mas o relevo continua sendo o de 30 m (picos famosos ainda vêm da gaussiana de `PICOS_RIO`).
- Restam 530 trechos com morro sobre o asfalto (>1,2 m) e 336 com vão (>2,5 m), na maioria perto de falésias e favelas em encosta; ficam listados no painel F3. Há rampas de rua acima de 100% nas encostas mais íngremes (a rua segue o terreno, que o limite de 50° ainda deixa a 2×).
- O F4 (painel de desempenho) das regras globais ainda não existe.

## 1.8.0 — Fase 18: metrô, trem, VLT e bonde (28/10/2026)

### Trilhos de verdade
- Os trilhos e as estações vêm do OpenStreetMap (extrato Geofabrik, `npm run fetch-cidades -- --refazer` regrava o cache e `npm run fetch-trilhos` gera `public/data/rio/trilhos.json`): 9 linhas e 136 estações dentro do mapa.
- **Metrô** (Linhas 1, 2 e 4, nas cores oficiais), **SuperVia**, **VLT Carioca**, **Bonde de Santa Teresa**, trem do **Corcovado** e monotrilho da Vila Santa Cecília. Trens de carga (MRS) ficam de fora.
- Túneis de verdade: o metrô e o trecho de túnel do trem correm 16 m abaixo do relevo e só aparecem onde saem para a superfície; viadutos sobem 7 m e ganham pilares; as rampas entre os níveis são suaves.
- Via permanente com lastro, dormentes e dois trilhos.

### Estações e trens
- Metrô: quiosque de entrada laranja com cobertura escura. SuperVia: plataforma longa com cobertura azul. VLT, bonde e cremalheira: plataformas e abrigos curtos na cor da linha.
- Nome da estação flutuando perto da câmera (até 16 por vez, a 1,1 km).
- Trens andando de ponta a ponta e voltando, na cor da linha: quanto mais curto o intervalo (metrô ≈4,5 min, SuperVia ≈9, VLT ≈7, bonde ≈14), mais trens por trajeto. Composições de 6 vagões (metrô), 8 (trem), 7 (VLT), 1 (bonde), 2 (cremalheira); velocidades de 4 a 15 m/s; seguem a velocidade do jogo.

### Verificado
- 4 testes novos (`tests/fase18.test.ts`: classificação, níveis, cores, estações perto de trilho, bonde x VLT); typecheck estrito. No navegador: quiosque e nome da estação de Botafogo; via, plataforma e trem azul da SuperVia em Maracanã.

### Limitações
- Os trens são cenário: não carregam passageiros, não têm horário nem entram na simulação (caixa, tarifa, deslocamento da população).
- As composições andam em ida e volta no mesmo trajeto, sem respeitar sinais nem parar nas estações; trajetos soltos do OSM (trechos sem ligação) viram trens separados.
- O metrô não tem plataforma subterrânea desenhada: só a entrada na superfície e o túnel (que fica sob o terreno).
- Mapa de 16 km: a SuperVia além de Deodoro/Realengo e o Metrô da Linha 4 fora do mapa não entram. Dados © colaboradores do OpenStreetMap (ODbL).

## 1.7.0 — Fase 17: ônibus reais e Censo 2022 (27/10/2026)

### Ônibus nas linhas de verdade
- O GTFS oficial da SMTR (Prefeitura) alimenta o jogo: 279 linhas dentro do mapa (248 de ônibus, 6 do BRT e 25 executivos), com o itinerário real de cada sentido, a cor da linha e as viagens por hora de um dia útil.
- Cada ônibus segue o itinerário de uma linha, na cor dela, e é encaixado no eixo da rua mais próxima (na cota certa nos túneis e viadutos). Quanto mais viagens a linha tem na hora, mais ônibus: o movimento muda de madrugada para o horário de pico. O BRT usa o articulado.
- 1.533 paradas viram abrigos de ponto, virados para a rua.
- Camada **Transporte**: os itinerários aparecem desenhados no mapa, na cor de cada linha.
- Os ônibus sorteados saem de cena quando as linhas reais carregam.

### Censo 2022 por bairro
- 165 bairros do Rio (63 dentro do mapa) com população 2010 e 2022, domicílios, área e contorno, do IPP/Prefeitura a partir do IBGE (divulgação preliminar de 21/03/2024; o total da cidade bate com os 6,21 milhões).
- A ficha de um prédio mostra o bairro, os moradores, a variação desde 2010 e a densidade (Copacabana: 129 mil hab., −12% desde 2010, 31 mil hab./km²).
- Nova camada **Bairros (Censo 2022)**: os prédios pintados pela densidade demográfica do bairro.
- Os nomes dos bairros no mapa passam a ser os oficiais, no centro de cada um; os do OSM ficam para as comunidades.

### Scripts
- `npm run fetch-gtfs` e `npm run fetch-censo` baixam e geram `public/data/rio/onibus.json` e `bairros.json`.

### Verificado
- 108 testes (5 novos: linhas e paradas do GTFS, frota sem ônibus sorteados, índice de vias, raster de bairros, Censo); typecheck estrito; build ok. No navegador: ônibus na cor da linha no eixo da avenida, ficha com o Censo, camada de densidade.

### Limitações
- Metrô, trem e VLT não estão no GTFS da prefeitura (só ônibus e BRT): continuam fora.
- Os ônibus não param nos pontos nem respeitam os semáforos; seguem o itinerário numa velocidade própria.
- Das 498 linhas do feed, 219 ficam fora do mapa de 16 km (Zona Oeste, Baixada). Linhas que entram e saem do mapa usam o trecho contínuo mais longo dentro dele.
- O Censo é a divulgação preliminar, agregada por bairro pelo IPP: pode diferir dos números finais do IBGE. A população simulada do jogo não é calibrada por bairro.
- Licença dos dados: abertos da Prefeitura (Data.Rio) — conferir o termo de uso antes de distribuir o repositório publicamente.

## 1.6.0 — Fase 16: frota carioca, gente e bairros (27/10/2026)

### Frota
- Seis veículos novos: SUV, picape, van, **BRT articulado** (18 m, dois corpos e fole), **viatura da PM** (azul com faixa branca e barra de luz vermelha e azul) e **caminhão da Comlurb** (laranja, compactador). O táxi ganhou a faixa azul nas portas.
- A mistura muda com a via: avenida tem mais ônibus e táxis, e BRT só onde há 4 faixas ou mais; rua tem mais motos, vans e picapes. Viatura e caminhão de lixo são raros.

### Gente
- **Praia**: banhistas deitados em toalhas coloridas, gente de pé, guarda-sóis e ambulantes com caixa de isopor, só na areia perto da câmera. A lotação segue o horário, o calor, a chuva e o fim de semana — cheia num sábado de sol, vazia na chuva e à noite.
- **Corredores** na orla (a menos de 260 m do mar), mais de manhã cedo e no fim da tarde, de regata colorida e passada de 3 m/s.

### Bairros
- 89 nomes de bairro e comunidade do OpenStreetMap flutuam sobre o mapa: os bairros aparecem de longe, as comunidades de perto. A ficha de um prédio mostra o bairro.

### Verificado
- 103 testes (3 novos); typecheck estrito; build ok. No navegador: táxi, ônibus, semáforos e multidão numa avenida da Zona Sul, praia lotada, nomes de bairro.

### Limitações
- **Ônibus reais (GTFS)**: o feed oficial da prefeitura existe (Data.Rio / Mobility Database), mas não consegui um link de download direto neste ambiente; os ônibus circulam pelas avenidas sem seguir as linhas reais.
- **Censo 2022 por bairro** não entrou: os bairros têm nome e posição, não população nem renda.
- Metrô e VLT ainda não existem como veículos; os carros não trocam de faixa; a barra de luz da viatura é fixa (não pisca).
- Banhistas e corredores não são do mesmo modelo dos moradores simulados: a rotina é por horário, não por morador.

## 1.5.0 — Fase 15: relevo, mar e marcos (27/10/2026)

### Relevo
- Os picos famosos sobem à altitude real: o satélite arredondava os cumes (Corcovado 584 m em vez de 704; Pão de Açúcar 290 em vez de 396; Morro da Urca 93 em vez de 224; Dois Irmãos 375 em vez de 533). A rocha íngreme usa textura em três projeções, sem os riscos esticados dos paredões.

### Marcos 3D nas coordenadas reais
- **Cristo Redentor** no Corcovado (1,7× maior para ser visto do alto), iluminado à noite.
- **Bondinho do Pão de Açúcar**: estações em Praia Vermelha, Urca e no cume, cabo e quatro cabines que sobem e descem.
- **Maracanã**: anel de arquibancada, teto e gramado 105 × 68 m com as marcações.
- **Arcos da Lapa**: aqueduto de dois andares (27 arcos embaixo, 20 em cima) com o trilho do bondinho de Santa Teresa, no lugar e na orientação do prédio do OSM; a avenida passa por baixo.
- **Museu do Amanhã** no píer, com as asas em balanço, e **Catedral Metropolitana** cônica com os quatro vitrais.
- Os prédios do OSM que esses marcos substituem (e os do raio do Maracanã) deixam de ser desenhados.

### Mar
- Ondas que quebram em faixas paralelas à praia e avançam para a areia, somadas à espuma da costa.

### Verificado
- 100 testes (5 novos: projeção, picos, praia, marcos, outras cidades); typecheck estrito; build ok. No navegador: Cristo, Maracanã, Arcos, bondinho, Museu do Amanhã e a praia com ondas.

### Limitações
- Os modelos são feitos no código (formas simples), não escultura detalhada. O Cristo tem a escala exagerada.
- Pedra da Gávea, Pico da Tijuca e a Floresta da Tijuca densa ficam em parte fora do mapa de 16 km; Escadaria Selarón, Theatro Municipal e Copacabana Palace ainda usam a caixa do OSM.
- Reflexo e profundidade da Lagoa Rodrigo de Freitas e da Baía de Guanabara seguem o mesmo mar.

## 1.4.0 — Fase 14: ruas fiéis (27/10/2026)

### Ruas do Rio como no OpenStreetMap
- Cada trecho traz o número de faixas, mão única e nível: 14.978 trechos, 8.748 de mão única, 285 de ponte/viaduto e 94 de túnel (Major Rubens Vaz, Rebouças, Santa Bárbara…). A largura vem das faixas (3,2 m cada), a calçada da classe da via.
- Sinalização por faixa: bordas brancas, traços entre faixas do mesmo sentido, eixo amarelo tracejado (2 faixas) ou duplo contínuo (4 ou mais).
- Túneis: a rua entra no morro numa rampa reta entre as bocas, sem calçada, poste nem lotes por cima; pedestres não andam nela. Viadutos: reta sobre o vale, com pilares onde o vão passa de 3,5 m.
- 910 semáforos reais: poste e luz que muda de fase (16 s verde, 4 s amarelo, 20 s vermelho, eixos defasados). Os carros param antes da faixa, formando fila.
- Faixas de pedestre (zebra) nos cruzamentos semaforizados e 495 no meio das quadras.
- Carros: andam só no sentido da mão única, nascem só nos trechos perto da câmera (raio de 1,6 km) e renascem quando ela anda.
- Calçada de pedra portuguesa nas avenidas reais só perto do mar; palmeiras no canteiro só nas avenidas do jogador (nas reais cada pista é uma via).

### Verificado
- 95 testes (7 novos: atributos das vias, ciclo do semáforo, túnel sob o morro, viaduto, lotes sem túnel, arquivo do Rio); typecheck estrito; build ok. No navegador: avenida de 4 faixas com tracejado e zebra, túnel entrando no morro, sem erros no console.

### Limitações
- Ciclovias, rotatórias desenhadas e calçadas de pedestre isoladas (footway) ainda não entram.
- Os carros formam fila no semáforo mas não desviam uns dos outros; não trocam de faixa.
- Viadutos ainda não têm guarda-corpo desenhado, só a lateral e os pilares.

## 1.3.0 — Fase 13: só o Rio de Janeiro (27/10/2026)

### Foco
- O jogo agora é só o Rio: "Novo mandato" e "Sandbox" começam direto no estado do RJ, com a capital real. Saíram a escolha dos 27 estados, a escolha de município e o mapa do Brasil.
- Saiu o Modo Presidente (Planalto, Congresso, STF, Banco Central, câmbio), com seus saves, eventos, dados macroeconômicos e scripts.
- Conquistas: ficam as 15 da cidade e do governo do estado (saíram as da Presidência e as de "Brasil").
- Menu novo, com a silhueta do Corcovado, da Urca e do Pão de Açúcar ao entardecer.
- Dados: só a cidade real do Rio fica no jogo (2 MB, antes 37 MB com as 27 capitais). `npm run fetch-cidades` sem argumentos gera o Rio.
- Saves de outros estados e da Presidência não abrem mais (o menu avisa).

### Rio em larga escala
- O mapa passou de 6 para 16 km, com 12 × 12 km construíveis: Centro, Zona Sul, Tijuca, Maracanã e parte da Zona Norte. São 153 mil prédios reais (38 mil com andares do OSM), 15 mil trechos e 1.000 km de ruas, 12 MB. A câmera começa na orla de Copacabana.
- Prédios, ruas e lotes são desenhados por blocos perto da câmera: prédios em três níveis de detalhe (planta completa até 1,5 km, caixa até 3,5 km, só os altos até 9 km), montados aos poucos (6 ms por quadro); ruas em blocos de 1 km visíveis até 4,5 km; os prédios gerados pelo jogo só num raio de 2,5 km, remontados quando a câmera anda 400 m.
- Corrigidos laços que cresciam com o quadrado do número de ruas (a página travava por mais de 45 s) e a leitura do relevo para um mapa de outro tamanho.
- Mar pela linha de costa do OpenStreetMap: regiões separadas pela costa votam o que é mar, e o mar é nivelado (a batimetria do Terrarium tinha buracos de −30 m); praia em rampa e mar que aprofunda com a distância da costa.
- O Worker manda o estado (7 MB) no máximo 4 vezes por segundo.
- Ferramentas de dev: `localStorage['n27:desligar'] = 'Vias,Arvores'` tira componentes da cena; avisos `[lento]` no console para trechos acima de 50 ms e quadros acima de 1 s.

### Verificado
- 88 testes (saíram os 15 do Modo Presidente; entraram escala do Rio e plantas); typecheck estrito; no navegador, "Novo mandato" abre o Rio real sem erros no console, tela fluida (4 ms de atraso) com a cidade toda carregada.

### Limitações
- Só a Zona Sul, o Centro e a Zona Norte próxima: Barra, Zona Oeste e subúrbios distantes ficam fora do mapa.
- Passo da simulação com 132 mil lotes: p90 de ~230 ms (mediana baixa); o relógio rápido pode engasgar em máquinas lentas.
- Ruas ainda sem faixas, semáforos, túneis e viadutos de verdade (próximas fases).

## 1.2.0 — Fase 12: visual realista (27/10/2026)

### Prédios com a planta de verdade
- Cada prédio real é desenhado com o contorno verdadeiro do OpenStreetMap/Microsoft (formatos em L, curvas, pátios), não mais como caixa. Os 27 arquivos de cidade foram regerados com as plantas (37 MB no total).
- Fachadas fotográficas (tijolo, pele de vidro, escritórios, residenciais) do ambientCG nas torres, com janelas que acendem à noite; casas e prédios de reboco pintado com a paleta regional, janelas com esquadria, peitoril, persianas, cortinas, portas, vitrines de loja, portas de enrolar e sujeira de chuva na base.
- Telhado cerâmico de duas águas nas casas, laje com brita e casa de máquinas nos prédios, telha metálica nos galpões.
- A geometria é montada uma vez por cidade; altura, obra, abandono e camadas de informação vêm de uma textura de estado na GPU.

### Luz, chão e ruas
- Céu HDRI real (Poly Haven) como luz ambiente e reflexo: vidros, carros e água refletem o céu. Tone mapping filmico (ACES).
- Terreno com fotos de capim, terra e rocha tingidas pelo bioma; asfalto e calçada fotográficos sob as faixas pintadas.
- Carros com lataria envernizada, vidros espelhados, calotas cromadas, pneus foscos e quinas arredondadas; pedestres com material PBR e cabeça/tronco mais redondos.

### Vista Google 3D
- Botão no painel Visual: a cidade real nos Photorealistic 3D Tiles do Google, ao vivo, no ponto para onde a câmera olha. Precisa de uma chave da Map Tiles API do jogador (`VITE_GOOGLE_MAPS_KEY` ou digitada na tela). Nada do Google é baixado, guardado ou convertido em modelo do jogo.

### Verificado
- 102 testes (5 novos: plantas das 27 capitais, retângulo orientado, arquivos de material); typecheck estrito; build ok (a Vista Google 3D fica num pacote separado, carregado só ao abrir).
- No navegador: Rio (Copacabana com fachadas fotográficas, noite com janelas acesas) e São Paulo (plantas irregulares no centro), sem erros no console.

### Limitações
- A Vista Google 3D com tiles não pôde ser testada aqui (exige a chave e o faturamento do jogador).
- Carros e pessoas continuam procedurais (com materiais PBR): não há modelos realistas CC0 de qualidade para baixar automaticamente.
- Prédios construídos pelo jogador ainda usam a fachada procedural antiga.

## 1.1.0 — Fase 11: cidades reais (27/10/2026)

### Cidades reais
- As 27 capitais começam com a cidade real: ruas com os nomes verdadeiros, prédios nos lugares certos (OpenStreetMap + contornos de satélite da Microsoft), relevo real (morros, vales, litoral), rios, lagos e parques.
- Os prédios reais fazem parte da simulação: moradores, empregos, água, luz e esgoto da rede herdada, crime e serviços. Dá para demolir, rezonear e construir em volta.
- Ficha do prédio com nome (quando o OSM tem), tipo e tamanho; selo "🏙 real" na escolha do município; opção de começar no terreno vazio.
- `npm run fetch-cidades` gera qualquer município (`-- <IBGE>` ou `--todos`).

### Ruas vivas
- Veículos 3D novos: sedã, hatch, táxi, ônibus, caminhão de entrega e moto com piloto.
- Pedestres nas calçadas, com guarda-chuva quando chove, mais gente de dia e nos horários de pico.

### Outros
- Projeto no GitHub (repositório privado).
- Redesenho dos prédios limitado a 1×/0,7 s para cidades grandes.
- Atribuição de dados (ODbL) na tela e em ASSETS_LICENSES.md.

### Verificado
- 97 testes (10 novos: cidade real e pedestres); typecheck estrito; build ok.
- Dados das 27 capitais: de 1.235 (Palmas) a 40.049 prédios (Belém); São Paulo com 26.808, 17 mil deles com andares reais do OSM. 32 MB no total.
- No navegador: Aracaju (casario dividido, ficha "Ocupação 1º de Maio (MOTU)" na Rua Amapá), São Paulo (21 mil prédios reais, 460 mil moradores), Rio (Maciço da Tijuca com relevo real), sem erros no console.

### Limitações
- São Luís, Teresina e Palmas têm poucos prédios nas bases abertas; ruas sem prédio mapeado por perto ganham casas e lojas genéricas.
- O mapa cobre 6 km em volta da sede: no Rio e em João Pessoa o mar fica fora.
- Contornos viram retângulos (prédios muito irregulares perdem detalhe).

## 1.0.0 — Fase 10: polimento (27/10/2026)

### Tutorial com assessor
- Celina Rocha (chefe de gabinete) guia os primeiros passos na cidade e no governo estadual; Otávio Lins (Casa Civil) guia o Planalto. Os passos avançam sozinhos quando você faz o que foi pedido.
- Dicas de contexto quando algo pede atenção: falta de luz ou água, LOA, alertas do Tesouro, ano eleitoral, meta fiscal em risco, dólar disparando, MP caducando, vaga no STF e outras.

### Conquistas
- 31 conquistas permanentes (cidade, governo estadual, Presidência e Brasil), com aviso na tela e galeria no menu. "Nação 27": governe os 27 estados.

### Acessibilidade e Opções
- Nova tela de Opções (menu e pausa): tamanho da interface, daltonismo, alto contraste, reduzir movimento (sem clarões de raio), qualidade gráfica e tutorial.
- Foco visível no teclado, rótulos para leitores de tela, avisos acessíveis.

### Performance
- Bundle inicial 31% menor (2,49 → 1,71 MB) (cidade, Presidência, áudio e nuvem carregam sob demanda).
- Qualidade gráfica alta/média/baixa e modo automático que se ajusta ao FPS.

### Balanceamento
- Presidência: crise fiscal derruba a aprovação, transferência de renda pesa mais, reeleição menos automática e metas fiscais alcançáveis com ajuste. Diagnóstico em `scripts/diag-balanceamento.ts`.

### Menu
- Menu rola em telas baixas; saem os itens "Carreira política" e "Cenários" (ainda não existem).

### Verificado
- 87 testes (7 novos da Fase 10); typecheck estrito; build ok.
- No navegador: Opções, galeria de conquistas, tutorial avançando sozinho na cidade (via → zona → água e luz), assessor do Planalto, aviso de conquista, troca de qualidade com sombras 0/2048/4096, sem erros no console.

## 0.9.0 — Fase 9: Modo Presidente e nuvem (26/10/2026)

### Modo Presidente
- Novo modo no menu (e "Disputar a Presidência" na tela de legado do governador): escolha nome, partido fictício e estado de origem; posse em 5 de janeiro.
- Economia real de partida: `npm run fetch-macro` lê Selic, IPCA, dólar, desemprego, dívida, primário e PIB do SGS e as expectativas do Focus (Banco Central). Modelo mensal com hiato, inflação, expectativas, câmbio, dívida e risco fiscal.
- Banco Central autônomo: Copom 8 vezes por ano (regra de Taylor), presidente do BC com mandato defasado, indicação e sabatina, críticas públicas, swap cambial e meta de inflação no CMN.
- Orçamento federal por programa, arcabouço fiscal (limite de despesa, metas de primário, gatilhos), contingenciamento e LOA votada em dezembro.
- Congresso Nacional: Câmara (513) e Senado (81) fictícios, MPs que caducam, PL, PLP e PEC em dois turnos, articulação com emendas, cargos e urgência, 17 medidas.
- STF com 11 ministros: aposentadoria aos 75, indicação e sabatina, ações contra medidas, liminares e julgamentos.
- 12 ministérios para técnicos ou para a coalizão; 27 governadores; viagens e obras federais.
- Mapa do Brasil por aprovação, relação com governadores ou votos; 43 eventos presidenciais (dólar, comida cara, caminhoneiros, CPI, enchente no Sul, seca na Amazônia, tarifaço…).
- Eleição presidencial por UF com pesquisas, 2º turno e reeleição; impeachment; legado com nota.
- Trilha nacional (bossa, samba, MPB, choro, forró, frevo, sertanejo).

### Nuvem (Supabase, opcional)
- Saves na nuvem (cidade/estado e Presidência), login como convidado ou por link no e-mail, ranking público de governadores e presidentes.
- Esquema com RLS em `supabase/migrations/`; configuração por `.env` (`.env.example`).

### Verificado
- 80 testes (12 novos da Fase 9); typecheck estrito; build ok.
- No navegador: montagem, posse, Congresso com MP aprovada, decisão da enchente, orçamento, STF com vaga e sabatina aprovada, BC, eleição de 2030 pintada por UF, segundo mandato, legado, carreira a partir de Pernambuco, salvar e carregar.
- Nuvem: compressão e migração testadas; o fluxo com um projeto Supabase real não foi testado (nenhum projeto criado).

### Ficou de fora
- Campanha presidencial com debate e horário eleitoral (a do governador continua completa)
- Câmbio com fluxo de capitais e reservas explícitas; política monetária com diretoria colegiada

## 0.8.0 — Fase 8: os 27 estados (26/10/2026)

### Municípios jogáveis
- 216 municípios (os 8 maiores de cada UF) com relevo real (altitudes Terrarium), distância do mar, terreno, bioma e clima próprios — `npm run fetch-municipios` → `public/data/municipios/{UF}.json`.
- Na escolha do estado, escolha também a cidade: Campina Grande no planalto da Borborema, Juiz de Fora na serra, Parintins na várzea, Caxias do Sul no planalto gaúcho… A cidade construída é o reduto eleitoral do governador.
- Deep link: `?uf=PB&mun=Campina Grande`.

### Biomas e arquitetura
- Flora por bioma: mata alta e densa na Amazônia, árvores baixas e largas no Cerrado, mandacarus e arbustos ralos na Caatinga, capões esparsos no Pampa, palmeiras no Pantanal.
- Sete estilos de arquitetura por região: casario colonial colorido, sertão, amazônico (zinco), modernista, agro, metrópole e europeu do Sul (tijolo e telhados íngremes).

### Trilha sonora
- Trilha regional procedural na Web Audio API: 29 gêneros (forró, frevo, maracatu, carimbó, boi, axé, ijexá, samba, bossa, choro, milonga, chamamé, sertanejo, moda de viola, reggae maranhense, tecnobrega, rock…) compostos na hora, com sanfona, triângulo, zabumba, alfaia, pífano, viola caipira e cia.
- Muda à noite, no Carnaval (frevo em PE, axé na BA) e no São João; chuva com som ambiente. Volumes e "próxima faixa" no menu de pausa.

### Verificado
- 68 testes (8 novos da Fase 8); typecheck estrito.
- No navegador: seleção de município (BA), Campina Grande e Vitória da Conquista (Caatinga, casario colonial, clima ajustado), Caxias do Sul (estilo europeu), trilha da PB tocando com nível de sinal medido e todos os gêneros sem erro.

### Ficou de fora
- Modelos 3D próprios por região (sobrados, enxaimel, palafitas) e vegetação urbana regional
- Mapa oficial de biomas do IBGE e normais climáticas medidas por município

## 0.7.0 — Fase 7: eleição e fim de mandato (26/10/2026)

### Dados reais
- `npm run fetch-eleitorado`: perfil do eleitorado 2022 do TSE (idade, escolaridade, gênero por município) casado com a malha do IBGE — 5.570 municípios, 156,5 milhões de eleitores → `public/data/eleitorado/{UF}.json`.

### Eleição
- Calendário real: pré-campanha em março, convenções (reeleição ou sucessor), coligações e tempo de TV, campanha a partir de 16/8, horário eleitoral a partir de 30/8, condutas vedadas, 1º turno no 1º domingo de outubro, 2º turno no último domingo, posse em 6 de janeiro.
- Candidatos fictícios: o prefeito ambicioso da capital, o líder da oposição, um nome de fora da política e uma candidatura ideológica; coligações pelas posturas dos partidos.
- Pesquisas de dois institutos fictícios com indecisos, rejeição e simulação de 2º turno.
- Campanha: tema do horário eleitoral (que rende ou não conforme os dados do governo), agenda de 3 visitas por semana pelo mapa dos municípios, ataques dos adversários.
- Debate na TV com quatro perguntas e respostas cujo efeito depende da realidade do governo; cadeira vazia se não responder.
- Votação município a município, apuração animada com o mapa sendo pintado, 2º turno com apoios dos eliminados e eleição presidencial no mesmo dia.

### Fim de mandato
- Reeleito: segundo mandato com Assembleia e Presidente novos; no segundo mandato, só sucessor.
- Tela de legado "Seu governo em números": aprovação mês a mês, indicadores da posse ao fim, contas públicas, obras, Assembleia, urnas, a capital e conquistas — também após impeachment.

### Verificado
- 60 testes (8 novos da Fase 7); typecheck estrito; build ok.
- No navegador (SE): pré-campanha, convenção, coligações, campanha com mapa de 75 municípios e visita, debate, apuração do 1º turno (governo com 37% de aprovação em 4º lugar), 2º turno e tela de legado.

### Ficou de fora
- Eleição de deputados estaduais voto a voto (a nova ALE é sorteada) e mapa de votos do Presidente
- Tutoriais, conquistas permanentes e balanceamento fino → Fases 8–10

## 0.6.0 — Fase 6: eventos, clima, festas e atores (26/10/2026)

### Clima e estações
- `npm run fetch-clima`: normais 1991–2020 das 27 capitais (ERA5 via Open-Meteo) → `public/data/clima/normais.json`.
- Tempo diário com chuva, temperatura, El Niño/La Niña, temporais, enchentes, estiagem, ondas de calor, fumaça de queimadas, ressacas e geada; estiagem tira água da rede, calor pesa na energia, chuva forte derruba encostas.
- Visual: chuva animada, céu fechado, raios, temporal de fim de tarde no verão, capim amarelo na seca, geada de manhã, mar de ressaca, água barrenta e baixadas alagadas, fumaça alaranjada, apagão que desliga janelas e postes.

### Storylets
- 168 eventos em JSON (desastres, segurança, economia, serviços, política, prefeitos, Brasília, imprensa, cultura, esporte, festas, sociedade e boas notícias) com condições, escolhas, prazos e consequências atrasadas.
- Painel de decisões com prazo e escolha padrão; agenda do governo com o histórico.

### Festas
- Calendário real de cada UF: Carnaval pela Páscoa, São João, Parintins, Círio de Nazaré, Oktoberfest, Festa da Uva, Réveillon… com banner, decisões e efeitos (confete e fogos no Carnaval, bandeirinhas no São João, fogos no Réveillon).

### Prefeitos, União e imprensa
- Prefeitos das 8 maiores cidades (pessoas fictícias, cidades reais), Presidente da República, seis veículos de imprensa e pesquisa mensal do Instituto Pulso — aba Relações no Palácio.
- Convênios com prefeituras, pedidos a Brasília (Força Nacional, verba, socorro com calamidade), elogiar ou criticar o Presidente, verba de publicidade e entrevista coletiva.
- Notícias atribuídas aos veículos; imprensa hostil amplifica notícias ruins.

### Correções
- Save/load: casas de favela no raster de ocupação e poluição do ar sem arredondamento (divergência antiga que só aparecia em jogos longos).
- Gastos de eventos na capital entram no balanço mensal.

### Verificado
- 52 testes (11 novos da Fase 6); typecheck estrito; build ok.
- No navegador (RJ e BA): Carnaval com confete e fogos à noite, temporal com chuva e enchente na baixada, fumaça de queimada com capim seco, decisões com prazo, aba Relações.

### Ficou de fora
- Campanha, debate e eleição de 2030 (as promessas de apoio e a rivalidade do prefeito da capital já estão registradas) → Fase 7

## 0.5.0 — Fase 5: política, personagens e dados sociais reais (26/10/2026)

### Dados reais
- `npm run fetch-social`: DATASUS/TabNet (SIM, SINASC, CNES) e PNAD Contínua/SIDRA (desocupação, percentis de renda, Gini) das 27 UFs → `public/data/social/indicadores.json`.
- Mortalidade infantil, leitos SUS por mil, desemprego e extrema pobreza da posse passam a ser os números reais da UF (antes: estimados pelo IDH).

### Gabinete
- 11 secretários fictícios com nome, retrato procedural, idade, cidade natal, currículo, perfil (técnico, indicação política, confiança), competência, lealdade, ambição e honestidade oculta.
- Troca por um de três candidatos; competência melhora (ou piora) a pasta; a Fazenda combate a sonegação.
- Escândalos com cadeia imprensa → CPI → indiciamento ou operação da PF; vazamentos, pedidos de demissão e desincompatibilização em abril do ano eleitoral.

### Assembleia Legislativa
- Número real de cadeiras por UF (CF art. 27); deputados fictícios com partido, bancada, reduto, bordão e relação com o governo; presidente da ALE com poder de pauta.
- Hemiciclo com intenção de voto, partidos ou relação; pauta com placar previsto e chance.
- LOA, PEC da Previdência (3/5) e empréstimos (maioria) passam por votação nominal; CPIs por 1/3 de assinaturas; pedido de impeachment (2/3) com tela de fim de mandato.
- Negociação: emenda, obra no reduto, cargo, apoio eleitoral, pressão, convencimento técnico, ceder secretaria — por deputado ou por bancada; capital político como moeda.
- Eleição da Mesa Diretora no 3º ano.

### Verificado
- 41 testes (10 novos da Fase 5); typecheck estrito; build ok.
- No navegador (RJ): PEC da Previdência rejeitada por 35 × 35 (precisava de 42) mesmo com R$ 235 mi em emendas ao Centrão; em dois anos, escândalo na Infraestrutura virou CPI com pedido de indiciamento e interino; LOAs 2028 e 2029 aprovadas (42 × 28, 41 × 29).

### Ficou de fora
- Prefeitos, governo federal, imprensa e redes como personagens; corrupção como escolha do jogador → Fase 6
- Campanha, debate e eleição de 2030 (as promessas de apoio eleitoral ficam registradas) → Fase 7

## 0.4.0 — Fase 4: serviços, território, transporte e favelas (25/10/2026)

### Saúde, educação e segurança
- Cobertura por capacidade e distância (equipamento lotado atende pior): Clínica da Família, UPA, hospital, colégio, escola integral e técnica, delegacia, batalhão, base comunitária.
- Criminalidade por lote (valor do solo, desemprego, domínio, policiamento) e camadas Saúde, Educação, Policiamento e Crime.
- Palácio → Secretarias: hospitais por OS, mutirão de cirurgias, tempo integral, bônus de professores, doutrina de segurança, câmeras corporais, integração de dados, renda estadual. Novos indicadores: leitos, fila de cirurgias, evasão, letalidade policial, lotação prisional, roubos.

### Controle territorial
- Mapa de domínio (grade de 64 m) com uma facção e uma milícia fictícias: crescem com pobreza e ausência do Estado, guerreiam entre si e recuam diante da polícia.
- Operação policial (raio de 280 m) com mortos e presos conforme doutrina e câmeras; ocupação temporária; painel de Segurança com histórico.

### Favelas
- Surgem do déficit de moradia popular, em encostas e beiras d'água perto dos empregos; casas crescem em contorno e ganham lajes.
- Deslizamentos na estação chuvosa (Nordeste: abril–julho), com vítimas e desabrigados.
- Urbanizar (obra estadual), regularizar a posse ou remover; zona ZEIS para habitação popular formal; painel de Habitação.

### Transporte
- Linhas de ônibus (prefeitura), BRT (só avenidas), metrô e teleférico (obras do Estado), traçadas parada a parada sobre a malha.
- Modelo semanal de deslocamentos: gravidade, escolha modal logit (carro, coletivo, a pé, vans), alocação com curva BPR.
- Trânsito visível: carros sorteados pelo volume e mais lentos no congestionamento, camada Trânsito, ônibus/BRT/metrô animados nas linhas.
- Tarifa, política de vans/mototáxis (combater, tolerar, regularizar) e painel de Mobilidade.

### Verificado
- 31 testes (8 novos da Fase 4); typecheck estrito; build ok.
- No navegador (RJ, sandbox): bairro de empregos gera a "Vila Urubu" na encosta do morro, dominada pela milícia, com deslizamento noticiado; linha de ônibus com passageiros; políticas aplicadas com custo mensal.

### Ficou de fora
- Indicadores a partir de DATASUS/PNAD microdados (ainda estimados pelo IDH) → Fase 5
- Secretários com nome, ALE com bancadas, negociação → Fase 5
- Tráfego por agentes individuais e semáforos (hoje é amostra visual do modelo agregado)

## 0.3.0 — Fase 3: orçamento estadual real (25/10/2026)

### Dados
- `npm run fetch-fiscal`: RREO (anexos 1, 2, 3, 4, 14) e RGF (anexos 1, 2) de 2024 das 27 UFs via API SICONFI → `public/data/fiscal/`.
- Dívida/RCL das fichas passa a ser o dado oficial do RGF (antes: aproximado).

### Governo estadual (Worker, passo mensal)
- Tesouro calibrado com dados reais: receitas (ICMS, IPVA sazonal, ITCMD, IRRF, royalties, FPE, FUNDEB, cota-parte municipal), RCL, folha por carreira, RPPS, duodécimos dos poderes, dívida com a União.
- LRF: pessoal/RCL (alerta, prudencial, máximo) com travas automáticas; DCL/RCL ≤ 200%; CAPAG.
- Mínimos constitucionais de saúde (12%) e educação (25%) apurados no ano civil.
- Ciclo PPA/LDO/LOA com prazos reais, votação na ALE (chance visível), duodécimos e revotação; LOA inercial da Fazenda.
- Contingenciamento, reforma da Previdência, operações de crédito (BNDES, BIRD, bancos), RRF e PROPAG.
- 10 secretarias com indicadores que respondem ao gasto com atraso; greves; 19 grandes obras com licitação, aditivos, liminares, TCE e obra parada.
- Aprovação por grupo (baixa renda, classe média, servidores, empresariado) e base aliada.
- Visão Cidade vira o Programa da Capital, financiado pela LOA; poluição da água segue o esgoto do Estado.

### Interface
- Palácio do Governo (tecla G): visão geral, orçamento, receitas e despesas, pessoal e previdência, dívida, secretarias, obras.
- Editor da LOA com projeção ao vivo (resultado, LRF, mínimos, teto do RRF) e chance de aprovação.
- Chip do Tesouro, aprovação estadual na barra, alertas da LRF e chamada para a LOA.

### Verificado
- 23 testes (inclui 8 UFs calibradas contra o SICONFI, mandato inteiro e ciclo orçamentário completo); typecheck estrito; build ok.
- No navegador (RJ): LOA 2028 enviada em agosto, aprovada pela ALE (58%) em dezembro, vigente em janeiro; obras licitadas e em execução.

### Ficou de fora (vai para as próximas fases)
- Secretários com nome, ALE com bancadas e deputados, negociação de votos → Fase 5
- Indicadores de saúde/pobreza/desemprego a partir de DATASUS e PNAD (hoje estimados pelo IDH) → Fase 4
- Eleição e efeito da aprovação → Fase 7


## 0.2.0 — Fases 0, 1 e 2 (25/10/2026)

### Fase 0 — Pesquisa e fundação
- `RESEARCH.md` com referências verificadas (licença e status), endpoints do IBGE testados e fontes de indicadores.
- `scripts/fetch-data.ts`: 27 UFs com população 2026, Censo 2022, PIB 2023, VAB setorial 2021, área calculada da malha, nº de municípios e os 8 maiores municípios; GeoJSON das UFs e malhas municipais de cada UF.
- `data/ufs/traits.json`: 27 UFs com dificuldade, capital (lat/lon), biomas, tipo de terreno, clima, sotaque e saudação, trilha, festas, arquitetura, traços com efeitos mecânicos e desafios. Validado por zod.
- Scaffold Vite 8 + React 19 + R3F 9 + Tailwind 4 + Worker; Vitest.

### Fase 1 — Menu e seleção
- Menu cinematográfico sobre o Brasil 3D extrudado (malha real do IBGE).
- Seleção: 10 visões (dificuldade, população, PIB, PIB per capita, IDH, violência, IDEB, esgoto, dívida, região); altura e cor pela métrica; paleta segura para daltônicos.
- Ficha completa com dados reais, economia por setor, maiores cidades, traços e desafios. Modos Mandato e Sandbox.
- Carregar jogo (IndexedDB e arquivo `.nacao`).

### Fase 2 — Fatia vertical do city-builder
- Terreno procedural por tipo de capital (RJ: morros de granito, "Pão de Açúcar", maciço florestado, praia) e bioma.
- Vias em Bézier (rua/avenida, reta/curva), snap, cruzamentos automáticos, pontes, calçadão de pedra portuguesa, palmeiras no canteiro, postes de sódio/LED.
- Zoneamento por pincel (R baixa, R alta, C, I); lotes ao longo das vias.
- 12 arquétipos de prédio brasileiros (casa com laje e caixa d'água azul, puxadinho, sobrado de telha colonial, muro chapiscado, prédio caixote, torre, loja com toldo, galpão, fábrica com chaminé), obras com andaime e grua.
- Água, energia e esgoto por rede viária; ETE ou esgoto in natura (água muda de cor); praça e parque.
- Valor do solo, poluição, demanda RCI, finanças, aprovação (prévia), notícias "Plantão N27", Carnaval/São João/Réveillon.
- Céu atmosférico, sol pela latitude real e dia do ano, sombras, AO, bloom, tone mapping AgX, tilt-shift, modo foto, ipês floridos em jul–set, tráfego visual com faróis.
- Inspeção de lote com endereço, cidadão fictício e "pensamento".
- Camadas: zonas, água, energia, esgoto, valor do solo, poluição, densidade.
- Save/load determinístico.

### Verificado
- Typecheck estrito sem erros; 8/8 testes (inclui 20 anos acelerados); build de produção ok.
- Rodando no navegador sem erros de console; ~144 fps com 5,5 mil habitantes e ~450 prédios na máquina de desenvolvimento.

### Ficou de fora (próximas fases)
- Orçamento estadual real (LOA/LDO/PPA, folha, previdência, LRF, mínimos constitucionais, FPE real) → **Fase 3**
- Saúde, educação, segurança com território, transporte público, tráfego por fluxos OD, favelas emergentes → Fase 4
- Gabinete, ALE, prefeitos, Brasília, imprensa, escândalos → Fase 5
- 150+ eventos/storylets, clima e desastres → Fase 6; eleição → Fase 7
- Visão Estado com municípios reais, relevo real (SRTM), múltiplas cidades por UF → Fase 8
- Áudio (Howler + trilha regional), WebGPU, tutorial, conquistas → Fases 9–10
- Bundle JS de 1,7 MB (563 kB gzip): fazer code-splitting da Visão Cidade.
