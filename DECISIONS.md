# DECISIONS

Registro de decisões técnicas e de design (formato: contexto → decisão → consequência).

## D-001 · React 19 + R3F 9 em vez de React 18 + R3F 8
A stack pedia React 18. Em out/2026 o three.js está na 0.186; o par React 18 / R3F 8 / drei 9 está em manutenção e o drei 9 não acompanha as mudanças recentes do three. **Decisão:** React 19.3, @react-three/fiber 9.8, drei 10.7, @react-three/postprocessing 3.2. Motivo forte: compatibilidade com o three atual e correções de bugs. O código não usa nada específico do React 19 além do que o R3F 9 exige.

## D-002 · WebGL2 agora, WebGPU depois
O `WebGPURenderer` do three exige materiais em TSL; os shaders deste projeto usam `onBeforeCompile` (GLSL) e o pós-processamento pmndrs é só WebGL. **Decisão:** WebGL2 na Fase 2; migrar materiais para TSL e ligar WebGPU com fallback na Fase 10 (polimento), quando a direção de arte estiver estável.

## D-003 · Simulação em Web Worker, tick fixo
1 tick = 6 h de jogo; 1× = 1 dia a cada 2 s (500 ms/tick). O Worker envia snapshots `Float32Array` transferidos sem cópia. `SharedArrayBuffer` está habilitado (cabeçalhos COOP/COEP no Vite) mas ainda não é necessário: o volume por tick é pequeno (~9 floats por lote). O relógio visual (dia/noite) é desacoplado do calendário — um dia visual ≈ 6 min a 1×, como no Cities: Skylines — senão a cidade piscaria entre dia e noite a cada 2 s.

## D-004 · Nada de código GPL/AGPL no repositório
Micropolis, OpenTTD e Citybound foram usados só como estudo de conceitos. Nenhuma linha copiada. Isso mantém a opção de licenciar o jogo como quiser.

## D-005 · Dados empacotados em `public/data`
O prompt pedia `/data/ufs/*.json`. Os dados **editáveis à mão** ficam em `data/ufs/` (traits e indicadores curados); o script gera os arquivos finais em `public/data/` para o Vite servir estaticamente (sem inflar o bundle JS). O jogo não acessa a internet em runtime.

## D-006 · Arrays SoA tipados na Fase 2; bitECS na Fase 4
O estado da cidade é por lote (zona, arquétipo, obra, ocupação, flags, valor do solo…) em `TypedArray`s — já é o layout de um ECS e é transferível para a renderização sem conversão. Entidades com comportamento (cidadãos, veículos, linhas) chegam na Fase 4; aí entra o bitECS (MPL-2.0, SoA, o mais rápido dos três avaliados). koota foi considerado, mas seu forte é estado reativo na UI, não a simulação no Worker.

## D-007 · Escala do mapa da cidade
Terreno de 6,1 × 6,1 km (heightmap 769², 8 m) com **área edificável de 3 × 3 km**; o restante é paisagem (morros, mar, serra). O prompt sugeria ~10 × 10 km; 3 km comportam ~100 mil+ habitantes com torres e mantêm 60 fps com sombras. Ampliar para 10 km exige streaming de chunks e LOD de prédios (Fase 8).

## D-008 · Lotes ao longo da via (estilo Cities) + raster de ocupação
Cada lado de cada trecho gera lotes de 12 × 24 m (ou 12 × 14 m quando não cabe) orientados para a rua. Um raster de 2 m resolve conflitos: cruzamentos, curvas internas, água, encostas > 7 m de desnível e equipamentos. Ao redesenhar vias, lotes antigos são reconciliados com os novos por posição (≤ 3 m) — zonas e prédios sobrevivem a divisões de aresta.

## D-009 · Vias como Bézier quadrática
Reta = controle no ponto médio. Snap a nós (7 m) e a arestas (divide a aresta via De Casteljau). Cruzamentos detectados por interseção de polilinhas e resolvidos iterativamente. As mesmas funções puras fazem o preview na thread principal e a aplicação no Worker — o que o jogador vê é o que será construído.

## D-010 · Redes de água/energia/esgoto pela malha viária
Sem traçado de canos (decisão de jogabilidade): cada componente conexo do grafo viário é uma rede. Equipamentos somam capacidade à rede em que estão ligados; a falta é distribuída por uma ordem estável por lote (os mesmos imóveis ficam sem água — mais legível que aleatório). Canos/linhas de transmissão podem virar opção avançada.

## D-011 · Terreno procedural "fiel ao tipo"
Relevo real (SRTM/Copernicus) fica para a Fase 8. Agora cada capital tem um tipo (`litoral-morros`, `litoral-plano`, `planalto`, `planicie`, `varzea`, `serra`), lado da água, rio interno e intensidade de relevo em `traits.json`. O gerador é puro e determinístico (seed por UF): Worker e renderização geram o mesmo mapa sem trafegar o heightmap.

## D-012 · Valores iniciais a partir de dados reais
- Poluição inicial da água deriva do % de esgoto coletado da UF (SNIS).
- Caixa inicial cai com o traço `dividaInicial` (RJ, RS, MG começam apertados).
- Traços (`efeitos`) alteram demanda, ICMS, custo de obra, royalties etc. A Fase 3 troca o caixa simplificado pelo orçamento estadual real (LOA/LDO, folha, LRF, mínimos de saúde/educação).

## D-013 · Arte 100% procedural na fatia vertical
Para manter um estilo consistente e licença limpa, prédios, telhados, caixas d'água, muros, toldos, gruas, árvores, palmeiras, postes e equipamentos são geometria + shader, e as texturas (asfalto, calçada, pedra portuguesa, halo de poste) são geradas em canvas. Fachadas: shader que deriva janelas, faixas de laje, vitrines e luzes acesas da escala da instância (sem texturas).

## D-014 · Scripts npm chamam `node node_modules/...`
O caminho do projeto contém `&` e parênteses; os shims `.cmd` do npm no Windows quebram com isso. Os scripts chamam os binários via `node` explicitamente.

## D-015 · Ganchos de depuração só em desenvolvimento
`window.__n27` (estado do R3F) e `window.__n27sim` (comandos da simulação) existem só com `import.meta.env.DEV`, para automação de testes visuais. `?uf=XX&modo=sandbox` é um deep link permanente.

## D-016 · Fase 3: o Estado é mensal, a cidade é a "vitrine" com repasse da LOA
O orçamento estadual opera em bilhões; a Visão Cidade, em milhões. Em vez de pagar obras de rua com o caixa do Tesouro (o que tornaria a cidade "de graça"), a cidade é o **Programa Estadual de Desenvolvimento Urbano da Capital**: uma dotação da LOA (padrão 0,08% da RCL, mín. R$ 18 mi/ano) repassada mês a mês para um fundo próprio. O jogador decide quanto vai para lá na LOA. Royalties e dívida saem do caixa da cidade e passam ao Tesouro.

## D-017 · Calibração por resíduo em vez de mapear contas uma a uma
A contabilização varia entre estados (ex.: SP lança a cota-parte municipal como despesa; RJ deduz da receita). Mapear cada conta levaria a orçamentos furados. Decisão: receitas, pessoal, previdência, dívida e investimento vêm direto do SICONFI; o **custeio** é o resíduo que fecha a identidade orçamentária com um resultado-alvo plausível. Os testes garantem RCL e % de pessoal da LRF iguais ao real no início.

## D-018 · Exercício-base 2024 projetado para 2027
2024 é o último exercício completo e homologado no SICONFI em out/2026 (2025 ainda tem entes pendentes). Fator único de 1,20 nos fluxos (IPCA 2024–26 + ~2% de crescimento real a.a.) e 1,10 no estoque de dívida. Simples, documentado e fácil de trocar por `npm run fetch-fiscal -- 2025`.

## D-019 · Regime da dívida inferido dos dados
Não hardcodamos quem está no RRF: se o serviço pago em 2024 foi menos de 55% do teórico e a dívida com a União passa de 50% da RCL, o estado começa no RRF (é o caso do RJ). PROPAG (LC 212/2025) entra como opção do jogador, com regras simplificadas e sinalizadas na interface.

## D-020 · Indicadores sociais: reais quando há dado, estimados pelo IDH quando não há
IDEB, homicídios e esgoto partem de dados reais. Espera na emergência, mortalidade infantil, extrema pobreza e desemprego eram **estimados a partir do IDH** até a Fase 5 — agora vêm do DATASUS e da PNAD (D-031); a estimativa fica como reserva se o arquivo faltar.

## D-021 · Chance de aprovação da LOA é uma função pura compartilhada
A tela de orçamento mostra exatamente a probabilidade que o Worker usa na votação (`chanceLOA(snapshot, proposta)`): transparência para o jogador e um só lugar para balancear.

## D-022 · Grupos criminosos 100% fictícios e sem mecânica de "jogar como"
*Comando da Laje* (facção) e *Liga do Asfalto* (milícia) são inventados — nome, sigla e cor. O jogador é sempre o Estado; o crime é um sistema que reage (pobreza, presença policial, vans, doutrina), nunca um lado jogável. Notícias falam de efeitos sociais (escolas fechadas, taxa de segurança), sem glamourizar.

## D-023 · Território como campo contínuo numa grade de 64 m
Em vez de agentes, duas camadas de força (0–1) com crescimento logístico, difusão entre vizinhos e decaimento pela presença policial. É barato (48² células/dia), determinístico, dá fronteiras orgânicas e torna legível o dilema real: operação derruba o domínio na hora, mas sem ocupação permanente (base comunitária) ele volta.

## D-024 · Favelas nascem do déficit de moradia popular, não de um gatilho aleatório
Emprego atrai gente; se a cidade não oferece moradia barata (ZEIS ou solo barato), a diferença vira ocupação informal em encosta ou beira d'água perto dos empregos. Urbanizar é obra estadual (reaproveita a carteira da Fase 3 via obras sob medida, `defObra`), regularizar é barato e da prefeitura, remover é caro e impopular.

## D-025 · Modelo de quatro etapas simplificado, semanal
Gravidade + logit + caminho mínimo com BPR e média sucessiva, em zonas de 256 m. Um passo por semana custa poucos ms e já gera congestionamento crível, divisão modal e demanda por linha. Os carros na tela são amostra visual sorteada pelo volume — não agentes.

## D-026 · Quem paga cada modo segue o Brasil real
Ônibus é concessão municipal (caixa da capital, subsídio tarifário). BRT, metrô e teleférico são obras do Estado (LOA, licitação, aditivos) — o jogador sente o conflito de escala entre prefeitura e governo.

## D-027 · Políticas das secretarias custam em relação à herança
`custosPoliticas()` cobra apenas a diferença para as políticas de posse (ex.: se o estado já tinha 20% de tempo integral, só a expansão custa). Assim a LOA calibrada pelo SICONFI continua valendo no dia 1.

## D-028 · Partidos, bancadas e políticos 100% fictícios
Dez partidos inventados (EPU, ATP, PEV, UPB, CDF, PMU, NLI, PFF, POP, RAÍZES) com siglas que não coincidem com as registradas no TSE; bancadas são arquétipos do debate brasileiro (bala, evangélica, ruralista, sindical, empresarial, ambientalista, oposição raiz, Centrão). Nomes de urna combinam títulos genéricos ("Delegada", "Pastor", "Zé do Café") com prenomes e sobrenomes comuns. Só a geografia é real: os redutos são as maiores cidades da UF (IBGE).

## D-029 · A ALE é um modelo de votação nominal, não uma probabilidade solta
Cada deputado tem uma propensão contínua; o voto é propensão + clima comum + ruído individual. A interface mostra o placar previsto (a favor/indecisos/contra) e a chance, calculada pela mesma função que decide a votação. Assim a negociação é concreta: dá para ver quem falta e o que oferecer. O clima comum (correlação entre votos) evita chances irreais de 0% ou 100%.

## D-030 · Negociação por cartas com custo real
Emendas saem do caixa no mês seguinte; obras no reduto são obras do Estado (concorrem com a dotação de investimento e podem parar); cargos e cessão de pastas não custam dinheiro, custam qualidade técnica e risco de escândalo. A pressão pode vazar. O jogo não premia o fisiologismo de graça: cada carta tem um preço visível e um efeito colateral.

## D-031 · Indicadores reais pelo TabNet e pela SIDRA
O DATASUS não tem API JSON para SIM/SINASC/CNES por UF; o coletor envia o mesmo formulário do TabNet (ISO-8859-1, saída "prn") e lê a tabela. Usa-se 2023 para SIM/SINASC (os anos mais recentes ainda são preliminares). Extrema pobreza é interpolada nos percentis da renda per capita da PNAD contra a linha legal do Bolsa Família (R$ 218), já que a Síntese de Indicadores Sociais não está na SIDRA por UF.

## D-032 · Mesma UF, mesma Assembleia
A ALE e o gabinete inicial são gerados com a semente da sigla: quem joga o RJ duas vezes reencontra os mesmos deputados (e aprende quem é quem). A partir daí, os eventos dependem das escolhas.

## D-033 · Efeitos do gabinete relativos à posse
A competência do secretário mexe nos indicadores em relação ao secretário da posse, para não deslocar a calibração do SICONFI no dia 1. Trocar um técnico por um indicado político piora a pasta; o contrário melhora.

## D-034 · Clima a partir de normais reais, sorteado dia a dia
Em vez de estações fixas por calendário, o tempo de cada dia sai das normais 1991–2020 da capital (ERA5/Open-Meteo, mesmo período das normais da OMM). Assim Recife chove em junho, Brasília seca em agosto e Porto Alegre esfria de verdade. Os desastres decorrem do tempo (chuva de 3 dias, déficit de 60 dias), não de dados de calendário. ERA5 é reanálise em grade de ~25 km: suaviza extremos locais e subestima a chuva do litoral nordestino (Recife sai com ~940 mm/ano contra ~2.200 mm nas estações do INMET), mas tem cobertura uniforme para as 27 capitais, licença aberta e acerta o regime sazonal — que é o que o jogo usa. Trocar pelas normais do INMET é um ponto de melhoria.

## D-035 · Storylets como dados, não como código
Os 168 eventos vivem em JSON com uma mini-linguagem de condições sem `eval`. Isso permite que qualquer pessoa escreva eventos (modding) e que um teste valide automaticamente cada condição e variável de texto. Eventos com escolhas não pausam o jogo: entram numa fila com prazo e, sem resposta, vale a escolha padrão — omissão também é decisão.

## D-036 · Festas com datas reais e efeito visual
O calendário usa as festas de cada UF e as datas verdadeiras (Carnaval móvel pela Páscoa, Círio no 2º domingo de outubro). As decisões de festa (patrocínio, policiamento) chegam no primeiro dia, com prazo curto.

## D-037 · Atores fictícios, cidades reais
Prefeitos, Presidente da República, veículos de imprensa, jornalistas e o Instituto Pulso são inventados; as cidades e suas populações são do IBGE. Os veículos têm nomes que não correspondem a empresas reais conhecidas.

## D-038 · Imprensa como amplificador, não como roteiro
A imprensa não inventa crises: ela muda o peso das notícias (choques ruins até +35% com cobertura hostil, bons até −25%). Comprar a imprensa com publicidade funciona com TV e influenciadores, irrita o blog investigativo e pode virar escândalo.

## D-039 · Determinismo do save: o raster das casas informais
Na Fase 6 apareceu uma divergência entre jogo salvo e original: casas de favela surgidas depois da última reconstrução de lotes não estavam no raster de ocupação, mas entravam nele ao carregar. Agora as casas informais têm código próprio no raster (−3), marcado quando surgem e limpo quando somem, e a poluição do ar passou a ser salva sem arredondamento. O save/load volta a ser bit a bit determinístico.

## D-040 · Voto por município com eleitorado real e inclinação suave
O jogo vota município por município com o eleitorado do TSE (2022) e o perfil de idade e escolaridade de cada cidade, o que dá mapas plausíveis e torna a agenda de campanha uma decisão geográfica. A inclinação ideológica regional é propositalmente suave (±0,3) e soma ruído local: o objetivo é que o desempenho do governo, a campanha e as alianças pesem mais que estereótipos regionais.

## D-041 · O incumbente parte na frente, mas o desempenho decide
O governador recebe +0,35 de utilidade (máquina, recall, obras) e o efeito da aprovação local centrado em 45%. Com cerca de 50% de aprovação, a reeleição é provável; abaixo de 40%, o jogador precisa de campanha e alianças. Calibrado em diagnósticos de mandatos inteiros em RJ, BA, SP e AC.

## D-042 · Calendário e regras eleitorais reais
Datas dos turnos pela Constituição (1º domingo e último domingo de outubro), convenções de 20/7 a 5/8, campanha a partir de 16/8, horário eleitoral a partir de 30/8, condutas vedadas nos 3 meses anteriores (sem convênios nem publicidade), uma única reeleição e posse em 6 de janeiro (EC 111/2021). O jogo começa em 1º de janeiro de 2027 por simplicidade.

## D-043 · Debate como escolhas com consequência verificável
As respostas do debate não têm "certa" fixa: "mostrar os números" ganha pontos se os números do jogo melhoraram e perde (checagem ao vivo) se pioraram. O jogador é premiado por conhecer o próprio governo, não por decorar a melhor opção.

## D-044 · Segundo mandato com Assembleia e Presidente novos
Reeleito, o jogador ganha uma nova Assembleia (mesmos partidos na base, novos deputados) e um novo Presidente da República, sorteado na eleição do mesmo dia. Mantém o gabinete, as dívidas e as promessas. No fim do segundo mandato, só resta escolher o sucessor.

## D-045 · Bioma do município por regras geográficas, não por mapa oficial
O IBGE publica o mapa de biomas (1:250.000), mas trazer o shapefile para o jogo custaria megabytes e um passo de geoprocessamento. Usamos regras simples sobre latitude, longitude, altitude e distância do mar, restritas aos biomas que a UF tem em `traits.json`. Acertam os casos emblemáticos (agreste e sertão na Caatinga, norte de MT na Amazônia, Pantanal, Pampa) e erram em transições (Feira de Santana fica na Mata Atlântica). A capital mantém o bioma curado.

## D-046 · Clima do município estimado a partir da capital
As normais ERA5 por município exigiriam centenas de chamadas à API. O jogo ajusta as da capital pelo gradiente térmico (−0,62 °C/100 m) e por um fator de chuva do semiárido. O dado fica marcado como `estimado` e a tela de seleção mostra a diferença. Vitória da Conquista sai ~5 °C mais fria que Salvador (real: ~4,5 °C); Juazeiro com ~35% da chuva de Salvador (real: ~28%).

## D-047 · Altitude dos tiles Terrarium em vez de API de elevação
A primeira versão usava a API de elevação do Open-Meteo (Copernicus DEM 90 m), mas o limite diário estourou com 26 mil pontos. Os tiles Terrarium (Mapzen/Tilezen, AWS Open Data: SRTM + GMTED + ETOPO1) são estáticos, sem cota e ficam em cache local (`data/cache/terrarium`); o PNG é decodificado no próprio script, sem dependências. Diferença típica entre as duas fontes: 1–10 m.

## D-048 · 8 municípios por UF
Os 8 maiores municípios (lista do IBGE já empacotada) cobrem capitais, regiões metropolitanas e polos do interior (Campina Grande, Caruaru, Juazeiro do Norte, Uberlândia, Londrina, Caxias do Sul…). Mais que isso sobrecarrega a escolha e a coleta. O Estado continua o mesmo; a cidade escolhida muda terreno, bioma, clima, o mapa e o reduto eleitoral do governador.

## D-049 · Trilha sonora 100% procedural
Nenhuma gravação: licenças de música regional são caras e arquivos pesariam dezenas de megabytes. Cada gênero é descrito como dados (andamento, escala, padrões rítmicos), e um sintetizador na Web Audio API compõe faixas novas a cada vez. Os timbres são estilizados — remetem à sanfona, ao triângulo, à alfaia — sem pretender soar como instrumentos reais.

## D-050 · Arquitetura regional por paleta, não por modelos novos
Os prédios continuam os mesmos arquétipos; o estilo regional troca as cores das paredes, a fração de casas coloridas, os telhados (telha, zinco, escuro) e a inclinação. Barato para a GPU e suficiente para Salvador não parecer Curitiba. Modelos próprios (casario com sobrado, enxaimel) ficam para o polimento.

## D-051 · Presidência na thread principal
A cidade precisa de um Web Worker; a Presidência não: são escalares mensais e ~600 parlamentares. Rodar na thread principal simplifica a UI (ela lê a instância diretamente) e o save. Se um dia houver cidade e Presidência juntas, a Presidência vai para o Worker.

## D-052 · Modelo macro pequeno e transparente
Um novo-keynesiano de quatro equações (hiato, inflação, expectativas, câmbio) com regra de Taylor, calibrado na conjuntura real de hoje e com coeficientes à vista em SIMULATION.md. Não prevê a economia; reproduz os trade-offs que um(a) Presidente enfrenta (juro × inflação × dívida × dólar) com ordens de grandeza plausíveis.

## D-053 · Ponto de partida automático e honesto
O jogo começa com a última leitura do SGS e do Focus no momento do `npm run fetch-macro`. O orçamento por programa vem aproximado do RTN 2025 porque o Tesouro não oferece API simples por programa; está marcado como aproximado.

## D-054 · Reaproveitar o plenário da Fase 5
Câmara e Senado usam a mesma propensão de voto da Assembleia (relação, bancada, eixos, humor do plenário). A negociação é por proposta (café, emendas, cargos, urgência), não deputado a deputado: com 513 deputados, voto a voto viraria microgerenciamento.

## D-055 · Carreira simplificada
Governador(a) que termina o mandato sem impeachment e com 40% ou mais pode "Disputar a Presidência": o jogo pula a campanha e começa na posse seguinte, com o estado como reduto. A eleição presidencial jogável fica para o fim do 1º mandato presidencial.

## D-056 · Nuvem opcional e sem segredo no código
Saves locais continuam sendo o padrão. A nuvem só liga com URL e chave pública do Supabase em variáveis de ambiente; a segurança é das políticas RLS (cada um só lê seus saves; o ranking é público para leitura). Não foi criado nenhum projeto Supabase automaticamente: o jogador escolhe onde hospedar.

## D-057 · Pausa automática em momentos-chave
No Modo Presidente o tempo para sozinho quando chega uma decisão, quando a eleição muda de fase e no fim do governo — o jogador não perde prazos por estar em 4×.

## D-058 · Tutorial que observa, não que trava
O assessor nunca bloqueia a tela nem obriga cliques: cada passo descreve o próximo objetivo e avança quando o estado do jogo mostra que ele foi feito. Quem já sabe jogar recolhe ou desliga. As dicas de contexto aparecem uma vez cada e só quando a situação acontece.

## D-059 · Conquistas no navegador, não na nuvem
As conquistas ficam em localStorage para funcionar sem conta e sem internet. Elas não entram no ranking (que segue com a nota do legado): não há como impedir que alguém as edite no próprio navegador.

## D-060 · Qualidade automática com histerese
O jogo começa em "alta" e o PerformanceMonitor só desce depois de uma janela com FPS baixo; após três trocas de nível ele fixa em "média" para não ficar oscilando. Mudar a qualidade remonta o pós-processamento e a luz do sol (o EffectComposer não lida bem com passes que somem).

## D-061 · Balancear por estilo de jogo, não por número mágico
Em vez de ajustar coeficientes isolados, simulamos estilos completos (piloto, gastador, ajuste) em várias sementes e calibramos até o ranking fazer sentido: agir rende mais que não agir, populismo dá algum retorno eleitoral, mas o ajuste responsável é o caminho mais seguro para a reeleição. A meta fiscal continua difícil de propósito — a trajetória real da LDO é ainda mais ambiciosa.

## D-062 · Versão 1.0
Com as dez fases do roteiro entregues, o jogo passa a 1.0.0. "Carreira de vereador a presidente" e "Cenários" (crise hídrica, enchente do século, estado falido) saem do menu até existirem de verdade.

## D-063 · OpenStreetMap, não Google 3D
Extrair a geometria do Google Maps/3D Tiles é proibido pelos termos do Google. A cidade real usa dados abertos e editáveis: OpenStreetMap (ruas, nomes, prédios, água, verde), contornos de satélite da Microsoft (ODbL) e relevo SRTM/Mapzen. A atribuição aparece no jogo.

## D-064 · Extratos regionais em vez de API
O Overpass vive sobrecarregado (502/504 durante toda a coleta). Os cinco extratos regionais da Geofabrik (~2,1 GB) são baixados uma vez e lidos em fluxo, gerando o mesmo cache que o Overpass geraria — sem limite de consultas e reprodutível.

## D-065 · Prédios reais como lotes fixos da simulação
Em vez de uma "camada decorativa", cada prédio real é um lote do jogo, com zona, arquétipo, ocupação, água, luz, crime e serviços. A cidade existe de verdade para a simulação: o jogador herda população, empregos e problemas, e pode demolir ou transformar quarteirões. Um retângulo orientado aproxima o contorno; contornos muito irregulares perdem detalhe em troca de instanciamento barato.

## D-066 · Completar o OSM com satélite e quebrar quadras
O OSM brasileiro tem poucos prédios mapeados em muitas cidades (Aracaju: ~600 no centro). Os contornos da Microsoft preenchem o resto; como o satélite funde casas geminadas em polígonos de quadra, polígonos baixos e grandes são divididos em lotes de 8–12 m. Prédios sem altura conhecida viram casas ou sobrados — melhor errar para baixo do que encher a cidade de blocos de 5 andares.

## D-067 · Rede herdada
A cidade real já tem água, luz e esgoto (das companhias estaduais). Exigir que o jogador construa reservatórios para 100 mil pessoas no primeiro dia seria injogável; a rede herdada atende só os prédios originais, com a cobertura de esgoto real da UF, e o crescimento novo depende das obras do jogador.

## D-068 · Agente para veículos e pedestres
A pedido do usuário, um agente separado criou os modelos procedurais de veículos e os pedestres, em arquivos próprios (`Veiculos.tsx`, `Pedestres.tsx`), enquanto a importação da cidade real era feita em paralelo. Tudo procedural: nenhum modelo 3D baixado.

## D-069 · Planta real extrudada, estado na GPU
O retângulo orientado da Fase 11 fazia toda cidade parecer maquete. O gerador agora grava o contorno simplificado (Douglas–Peucker, 0,4 m, até 48 vértices) e a renderização extruda a planta verdadeira. Como são dezenas de milhares de prédios, a geometria é estática (blocos de 512 m) e tudo o que a simulação muda — altura, cota do terreno, obra, abandono, cor da camada — vai numa textura de estado lida no vertex shader. A simulação continua usando o retângulo para lotes e ocupação; só o desenho mudou.

## D-070 · Materiais fotográficos CC0 em array de texturas
Fachadas, rebocos, telhas e pisos vêm do ambientCG (CC0) e o céu do Poly Haven (CC0): fotos reais, sem atribuição obrigatória e sem risco de licença. As 15 camadas dos prédios ficam em duas DataArrayTexture (cor+rugosidade, normal+emissão), então um único material desenha qualquer prédio. Texturas reduzidas para 1024/512 px (6 MB no repositório). No chão e nas ruas a foto entra como razão sobre a cor existente, preservando a paleta do bioma e as faixas pintadas.

## D-071 · Google 3D só ao vivo, com a chave do jogador
O pedido de "usar bastante o Google Maps" é atendido do único jeito que os termos permitem: os Photorealistic 3D Tiles são transmitidos ao vivo (3d-tiles-renderer, Apache-2.0) numa vista à parte, com a atribuição do Google na tela, usando a chave da Map Tiles API do próprio jogador. Nada é baixado, guardado ou misturado aos prédios jogáveis, que continuam vindo de dados abertos (D-063). A chave nunca vai para o repositório.

## D-072 · Carros e pessoas: PBR em vez de modelos baixados
Não há modelos realistas de carros e pessoas brasileiros com licença livre e download automatizável (os pacotes CC0 conhecidos — Kenney, Quaternius — são estilizados). Os modelos procedurais da Fase 11 ganharam materiais físicos (verniz, vidro, cromo, borracha) e quinas arredondadas, que com o céu HDRI dão o salto maior de realismo pelo menor custo.

## D-073 · Só o Rio de Janeiro
A pedido do usuário, o jogo deixa de cobrir o Brasil inteiro para fazer uma cidade só, em larga escala e com detalhe. O jogador continua governador(a) — agora do estado do RJ —, porque orçamento, Alerj, eleição e segurança pública estaduais são o coração do jogo e o Rio é a capital. Saíram a escolha de UF e de município, o mapa do Brasil, o Modo Presidente e as 26 outras cidades reais. O código genérico (simulação de estado, eleição, dados por UF) e os dados das outras UFs usados nos testes do motor ficam; os scripts de dados continuam aceitando outros municípios.

## D-074 · Rio em blocos, sem WebGPU por enquanto
Para o Rio caber no navegador, a renderização passou a montar e mostrar só o que está perto da câmera (prédios em três níveis de detalhe, ruas em blocos de 1 km, prédios gerados em raio de 2,5 km) em vez de trocar de renderizador. Os gargalos medidos eram laços quadráticos e remontagens inteiras a cada atualização, não a contagem de triângulos; WebGPU só entra se, depois disso, os triângulos virarem o limite.

## D-075 · A costa do OSM manda no mar
A altitude do Terrarium (SRTM/GMTED) tem terra falsa e buracos no mar perto da costa. O gerador usa a linha de costa do OSM para dividir a grade em regiões (terra × mar, por voto das sementes de cada lado), nivela o mar em −3 m e deixa a própria linha de costa como areia a 0,6 m. O jogo aprofunda o mar pela distância da costa.

## D-076 · Atributos na via, não um tipo novo por classe
As 33 referências a `ROAD_SPECS` ficaram: o tipo continua sendo `rua` ou `avenida` (as vias do jogador não mudam) e as vias reais ganham campos opcionais — faixas, mão única, nível. Helpers (`larguraVia`, `calcadaVia`, `meiaVia`) devolvem o padrão do tipo quando o campo falta, então saves e testes antigos continuam valendo. O arquivo da cidade tem `campos: 8` por aresta (6 nos antigos).

## D-077 · Túnel e viaduto por relaxamento de cotas
Em vez de modelar túneis e viadutos como objetos, a cota de cada nó que só toca túnel (ou só viaduto) vira a média dos vizinhos até os portais, que ficam na cota do terreno. O túnel é uma rampa reta que o relevo cobre sozinho; o viaduto é uma reta que nunca afunda no chão e ganha pilares pelo código que já existia.

## D-078 · Semáforo com fase por eixo, sem estado
A fase é função do tempo e do eixo da aproximação (|tx| > |tz|), igual no desenho da lâmpada (shader) e nos carros: nada para sincronizar nem salvar. As filas se formam porque cada carro para a uma distância diferente da faixa.

## D-079 · Marcos procedurais ancorados nos dados
Os marcos são formas feitas no código (extrusões, cones, anéis), sem baixar modelos: licença limpa, peso zero e orientação certa. Quando o OSM tem o prédio (Arcos da Lapa, Museu do Amanhã, Catedral), o modelo usa a posição, o tamanho e o ângulo dele e o prédio sai do desenho; quando não tem (Cristo, bondinho, Maracanã), vale a latitude/longitude. O Cristo é 1,7× maior que o real porque numa cidade de 12 km 38 m não aparecem.

## D-080 · Picos por gaussiana em vez de outro relevo
Trocar a fonte de altitude por uma de maior resolução (LiDAR da prefeitura) exigiria baixar e processar gigabytes. Uma gaussiana por pico, com a altitude real e um raio por morro, resolve o que aparece no jogo (silhueta do Pão de Açúcar, do Corcovado) e só vale onde o satélite é mais baixo.

## D-081 · Gente da praia fora da simulação de moradores
Os banhistas são uma camada visual com lotação calculada por hora, temperatura, chuva e dia da semana, em posições fixas por hash da grade. Ligar cada um a um morador simulado exigiria agendas por pessoa para 6 milhões de cariocas; a camada visual dá o efeito (praia que enche e esvazia) sem custo na simulação. Os candidatos são fixos para a praia encher e esvaziar sem as pessoas trocarem de lugar.

## D-082 · Ônibus sem GTFS por enquanto
O GTFS oficial da prefeitura é a fonte certa para linhas, itinerários e paradas, mas o download não é scriptável aqui (páginas dinâmicas, sem link direto). Em vez de inventar linhas, os ônibus e o BRT nascem nas avenidas, que são onde o OSM os põe. Quando o arquivo estiver em `data/cache/gtfs/`, um script lê `shapes.txt` e liga cada linha às arestas.
