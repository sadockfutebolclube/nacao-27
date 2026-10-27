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
