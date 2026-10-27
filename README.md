# NAÇÃO 27

> *Você acabou de ganhar a eleição. Tem 4 anos, um orçamento apertado, uma Assembleia que não confia em você, uma imprensa faminta e milhões de pessoas esperando milagre. Boa sorte, Governador(a).*

City-builder e simulador de governo 100% brasileiro, no navegador. Escolha uma das 27 UFs (com dados reais do IBGE) e construa a capital: vias em curva, zoneamento, prédios que crescem por demanda, água, energia e esgoto, ciclo dia/noite com o sol na latitude certa.

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

### Primeiros passos, opções e conquistas (Fase 10)
- Na primeira partida, a assessora (ou o assessor, no Planalto) explica o que fazer e avança sozinha quando você faz. Recolha, desligue ou recomece em **Opções**.
- **Opções** (menu ou Esc): tamanho da interface, daltonismo, alto contraste, reduzir movimento, qualidade gráfica (automática por padrão) e som.
- **Conquistas** (menu): 31 marcos que valem entre partidas, inclusive governar os 27 estados.

### Modo Presidente (Fase 9)
- Menu → **Presidente**: escolha nome, partido e estado de origem. Ou, ao fim de um bom governo estadual, **Disputar a Presidência**.
- A economia começa com os números reais do Banco Central (`npm run fetch-macro` atualiza).
- Abas à direita: **Planalto** (decisões e notícias), **Economia**, **Orçamento** (PLOA até 31/08, contingenciamento, metas), **Congresso** (envie MPs, PLs, PLPs e PECs e articule os votos), **STF**, **Banco Central**, **Ministérios**, **Estados** e **Eleição**.
- O mapa mostra a aprovação por estado, a relação com os governadores ou os votos. Clique num estado para visitar ou lançar obra.
- Espaço pausa; 1/2/3 velocidade; Esc menu (salvar, exportar).

### Nuvem (opcional)
1. Crie um projeto no Supabase e rode o SQL de `supabase/migrations/` (SQL Editor ou `supabase db push`).
2. Em Authentication, habilite *Anonymous sign-ins* (e, se quiser, e-mail com link mágico).
3. Copie `.env.example` para `.env` e preencha `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` (chave pública/publishable).
Sem isso o jogo usa só saves locais.

### Os 27 estados (Fase 8)
- Ao escolher o estado, escolha também a **cidade** entre as 8 maiores: cada uma tem relevo real, bioma, clima e um mapa próprio. A cidade que você constrói é o seu reduto eleitoral.
- Prédios seguem a arquitetura da região e a vegetação segue o bioma (repare nos mandacarus).
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
