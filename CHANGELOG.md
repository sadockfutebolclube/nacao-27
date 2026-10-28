# CHANGELOG

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
