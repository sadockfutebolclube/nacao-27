# NAÇÃO 27

> *Você acabou de ganhar a eleição no Rio. Tem 4 anos, um orçamento apertado, uma Alerj que não confia em você, uma imprensa faminta e 17 milhões de fluminenses esperando milagre. Boa sorte, Governador(a).*

City-builder e simulador de governo no navegador, **focado no Rio de Janeiro** (desde a Fase 13): você governa o estado do RJ a partir da capital real — ruas, prédios e relevo do OpenStreetMap, orçamento real do SICONFI, Alerj, eleição e a cidade que cresce por demanda.

**Estado atual: Fases 0 a 3 jogáveis** (pesquisa + dados reais, mapa 3D do Brasil e seleção, fatia vertical do city-builder, orçamento estadual real com LRF, mínimos e ciclo PPA/LDO/LOA). Ver [CHANGELOG.md](CHANGELOG.md).

## Como rodar

Requisitos: Node 20+ (testado no 24) e um navegador com WebGL2.

```bash
npm install
```

```bash
npm run dev
```

Abra http://localhost:5173. Atalho para cair direto no jogo: `http://localhost:5173/?uf=RJ` (ou `?uf=MG&modo=sandbox`).

Outros comandos:

| Comando | O que faz |
|---|---|
| `npm test` | Testes da simulação (Vitest): orçamento fecha todo mês, 20 anos sem NaN, save/load determinístico, grafo viário |
| `npm run typecheck` | TypeScript estrito |
| `npm run build` | Build estático em `dist/` (GitHub Pages / Vercel) |
| `npm run fetch-data` | Baixa de novo os dados do IBGE para `public/data/` (já vêm empacotados; o jogo não usa internet em runtime) |
| `npm run fetch-fiscal` | Baixa RREO/RGF de 2024 das 27 UFs no SICONFI (Tesouro Nacional) para `public/data/fiscal/` |
| `npm run fetch-clima` | Baixa as normais climatológicas 1991–2020 das 27 capitais (ERA5 via Open-Meteo) para `public/data/clima/` |
| `npm run fetch-eleitorado` | Baixa o perfil do eleitorado 2022 do TSE (77 MB, em cache) e gera o eleitorado por município em `public/data/eleitorado/` |
| `npm run fetch-social` | Baixa mortalidade infantil, leitos SUS (DATASUS/TabNet) e desemprego, extrema pobreza e Gini (PNAD/SIDRA) para `public/data/social/` |

> Os scripts chamam `node node_modules/...` diretamente porque a pasta do projeto tem `&` e parênteses no caminho, o que quebra os atalhos `.cmd` do npm no Windows.

## Controles

| Ação | Comando |
|---|---|
| Mover câmera | WASD / setas, ou arrastar com botão do meio (ou esquerdo sem ferramenta) |
| Girar | Q / E ou arrastar com botão direito |
| Zoom | roda do mouse, R / F |
| Pausa / velocidade | Espaço, 1, 2, 3 |
| Vias / Zonas / Demolir | V, Z, B |
| Tamanho do pincel de zona | [ e ] |
| Travar via em 15° | segurar Shift |
| Cancelar | Esc ou clique direito |
| Modo foto (esconde HUD) | H |
| Inspecionar lote | clique sem ferramenta |
| Palácio do Governo | G (ou botão Governo) |
| Linha de transporte | clique = parada · Enter ou duplo clique conclui · Backspace desfaz |
| Inspecionar favela | clique numa casa sem ferramenta |

## Como jogar (fatia atual)

1. Trace ruas e avenidas (reta ou curva; elas se conectam sozinhas em cruzamentos e viram ponte sobre a água).
2. Zoneie residencial (baixa/alta), comercial e industrial ao longo delas.
3. Ligue **água** (reservatório/ETA) e **energia** (subestação/solar/termelétrica) na mesma malha viária — cada malha conectada é uma rede.
4. Sem **ETE**, o esgoto vai in natura para o mar: a água fica turva, a orla desvaloriza e a imprensa cai em cima.
5. Acompanhe a demanda RCI, o caixa, a aprovação e o Plantão N27.

### Governando o estado (tecla G)
- O Tesouro começa com os números reais de 2024 da sua UF (SICONFI) projetados para 2027.
- **Agosto**: elabore a LOA do ano seguinte — alíquotas, reajustes, concursos, dotação de cada secretaria, repasse para a capital e emendas. A tela mostra a projeção e a chance de aprovação na ALE. No 1º ano, escolha os eixos do PPA.
- **Dezembro**: a Assembleia vota. Rejeitou? O ano começa em duodécimos.
- Cuidado com a LRF (pessoal até 49% da RCL), os mínimos de saúde (12%) e educação (25%), o caixa e as greves.
- Lance obras (hospitais, escolas, metrô, saneamento…), contingencie, faça reforma da Previdência, contrate crédito ou adira ao PROPAG/RRF.

### Cidades reais (Fase 11)
- O Rio começa com a cidade de verdade, em larga escala (12 × 12 km: Centro, Zona Sul, Tijuca, Maracanã): 153 mil prédios, 1.000 km de ruas, relevo, mar e parques do OpenStreetMap, completados com contornos de satélite da Microsoft.
- Clique num prédio para ver o nome e o tipo; demolir um prédio real é permanente.
- Para regerar o Rio: baixe o extrato do Sudeste da Geofabrik em `data/osm-cache/` (o script usa o Overpass se não estiver lá) e rode `npm run fetch-cidades`.

### Visual realista e Vista Google 3D (Fase 12)
- Prédios reais com a planta verdadeira, fachadas fotográficas, telhas, laje e janelas que acendem à noite; céu HDRI, asfalto, calçadas e terreno fotográficos (materiais CC0 do ambientCG e do Poly Haven, em `public/assets/`; para baixar de novo: `npm run fetch-assets` e depois `scripts/comprimir-materiais.ps1`).
- **Vista Google 3D** (painel Visual): mostra a cidade nos Photorealistic 3D Tiles do Google, ao vivo. Precisa de uma chave sua da Map Tiles API (Google Cloud, com faturamento): ponha `VITE_GOOGLE_MAPS_KEY=...` no `.env.local` ou digite na tela (fica só no navegador). O jogo não baixa nem guarda nada do Google.

### Ônibus reais e Censo (Fase 17)
- Os ônibus e o BRT circulam nas **linhas de verdade** (GTFS da prefeitura), na cor de cada linha, com mais viagens nas horas de pico; as paradas viram abrigos. Na camada **Transporte** os itinerários aparecem no mapa.
- A ficha de cada prédio traz o **Censo 2022** do bairro (moradores, variação desde 2010, densidade) e a camada **Bairros (Censo 2022)** pinta a cidade pela densidade. Para atualizar: `npm run fetch-gtfs` e `npm run fetch-censo`.

### Gente e frota do Rio (Fase 16)
- A praia lota num sábado de sol (guarda-sóis, toalhas, ambulantes) e esvazia na chuva; há corredores na orla; a frota tem táxi com faixa azul, SUV, picape, van, BRT articulado, viatura da PM e caminhão da Comlurb; os nomes dos bairros aparecem sobre o mapa.

### Marcos do Rio (Fase 15)
- O Rio tem o Cristo Redentor, o bondinho do Pão de Açúcar (com as cabines em movimento), o Maracanã, os Arcos da Lapa, o Museu do Amanhã e a Catedral Metropolitana nas coordenadas reais, com os picos do Corcovado e do Pão de Açúcar na altitude de verdade e ondas quebrando na praia.

### Primeiros passos, opções e conquistas (Fase 10)
- Na primeira partida, a assessora explica o que fazer e avança sozinha quando você faz. Recolha, desligue ou recomece em **Opções**.
- **Opções** (menu ou Esc): tamanho da interface, daltonismo, alto contraste, reduzir movimento, qualidade gráfica (automática por padrão) e som.
- **Conquistas** (menu): 15 marcos da cidade e do governo do estado, que valem entre partidas.

### Nuvem (opcional)
1. Crie um projeto no Supabase e rode o SQL de `supabase/migrations/` (SQL Editor ou `supabase db push`).
2. Em Authentication, habilite *Anonymous sign-ins* (e, se quiser, e-mail com link mágico).
3. Copie `.env.example` para `.env` e preencha `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` (chave pública/publishable).
Sem isso o jogo usa só saves locais.

### Trilha e arquitetura regional (Fase 8)
- A trilha sonora é composta na hora com os ritmos do estado; ajuste o volume ou pule a faixa no menu de pausa (Esc). Precisa de um clique para começar.

### Eleição (Fase 7)
- Em 2030 (e 2034) há eleição: o aviso aparece abaixo do relógio e a aba Palácio → **Eleição** mostra candidatos, pesquisas e o mapa de quem lidera em cada município.
- Em julho, a **convenção**: disputar a reeleição ou lançar um sucessor (no 2º mandato, só sucessor).
- Na campanha, escolha o tema do horário eleitoral e clique no mapa para fazer até 3 visitas por semana. Responda o **debate** na TV — números que não batem com a realidade são desmentidos.
- Acompanhe a apuração município a município; no 2º turno, peça apoio aos eliminados. O fim do governo mostra o legado: "Seu governo em números".

### Tempo, eventos e relações (Fase 6)
- O tempo de cada dia segue as normais reais da capital: temporais, enchentes, estiagem, calor, fumaça e frio aparecem na tela e na simulação. O alerta da Defesa Civil fica ao lado do relógio.
- Eventos com escolha aparecem no painel **Decisões** (canto inferior direito) com prazo; sem resposta, vale a opção padrão. A **Agenda** guarda o histórico.
- Festas reais de cada estado (Carnaval, São João, Parintins, Círio, Réveillon…) mudam a cidade e trazem decisões.
- Palácio → **Relações**: prefeitos, Presidente, imprensa e pesquisa Instituto Pulso; convênios, pedidos a Brasília, publicidade e coletiva.

### Gabinete e Assembleia (Fase 5)
- Palácio → **Gabinete**: conheça (e troque) os 11 secretários. Técnicos melhoram as pastas; indicados políticos trazem votos e risco de escândalo.
- Palácio → **Assembleia**: clique nas cadeiras do hemiciclo para ver cada deputado e negociar — emenda, obra no reduto, cargo, apoio eleitoral, pressão, convencimento técnico. Emendas e cargos podem ir para uma bancada inteira; pastas podem ser cedidas a partidos.
- LOA, PEC da Previdência e empréstimos passam por votação nominal; a pauta mostra o placar previsto e a chance. Cuidado com CPIs (1/3 de assinaturas) e com o impeachment (2/3 afastam o governador).

### Serviços, segurança e favelas (Fase 4)
- **Serviços** e **Segurança** na barra: clínicas da família, UPAs, hospitais, escolas, delegacias, batalhões e bases comunitárias. Equipamento lotado atende pior.
- Muito emprego e pouca moradia barata? Surge uma **favela**. Clique nela para urbanizar (obra do Estado), regularizar ou remover. Zoneie **ZEIS** para moradia popular formal.
- Camada **Território** mostra onde a facção e a milícia mandam. **Operação policial** derruba o domínio na hora; uma base comunitária impede que ele volte.
- Palácio → **Secretarias**: doutrina de segurança, câmeras corporais, tempo integral, OS na saúde, renda estadual.

### Transporte (Fase 4)
- Grupo **Transporte**: ônibus (prefeitura), BRT (só em avenidas), metrô e teleférico (obras do Estado). Clique as paradas e conclua com Enter.
- Chip **Deslocamento** abre o painel de mobilidade: divisão modal, tarifa, vans e frota de cada linha. A camada **Trânsito** mostra os engarrafamentos.

## Estrutura

```
src/app       telas (menu, seleção, carregamento, jogo) e estado de navegação
src/render    R3F: mapa do Brasil, cidade (terreno, água, vias, prédios, árvores, veículos), shaders
src/world     terreno procedural, grafo viário Bézier, lotes, equipamentos (puro, compartilhado com o Worker)
src/sim       simulação no Web Worker (crescimento, redes, valor do solo, poluição, finanças, notícias)
src/ui        HUD e ícones
src/data      esquemas zod, carregamento, nomes
src/save      IndexedDB + arquivo .nacao
data/ufs      traits.json (27 UFs) e indicadores curados — editáveis/modáveis
scripts       fetch-data.ts (IBGE)
tests         Vitest
```

Documentação: [RESEARCH.md](RESEARCH.md) · [DECISIONS.md](DECISIONS.md) · [SIMULATION.md](SIMULATION.md) · [ASSETS_LICENSES.md](ASSETS_LICENSES.md)

Personagens, grupos e logradouros são fictícios ou genéricos. Tom: sátira aos vícios da política em geral, sem partidarismo.
