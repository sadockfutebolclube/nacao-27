# Passo da simulação: quem estoura 16 ms e como cortar (proposta, nada implementado)

Medido em 28/10/2026 com `npm run medir-simulacao -- --dias=60 --orcamento=4` (Rio real, 139.237 lotes, 152.698 prédios; Node, Ryzen 7 5700G).
Bruto: `docs/medicoes/2026-10-28-simulacao.json`. O "passo" é o `step()` do Worker com **orçamento de 4 ms**: ele roda fatias do trabalho
pesado do dia até gastar 4 ms, mas **sempre roda pelo menos uma fatia inteira**, então o pior passo é a maior fatia que não cede a vez.

## Resultado

| | |
|---|---|
| Passos medidos | 1.858 (60 dias) |
| Passo: média / p50 / p95 / p99 / **máximo** | 5,2 / 5,1 / 9,3 / 13,4 / **25,7 ms** |
| Passos acima de 16 ms | **5 de 1.858 (0,27%)**: 3 em *serviços sociais* (pior 25,7 ms) e 2 em *território* (pior 20,4 ms) |
| Em outra rodada idêntica | 8 passos ≥ 17 ms: 7 em *serviços sociais* (até 19,4) e 1 em *território* (20,8) |
| Custo por dia de jogo | 159 ms → o relógio sustenta ~12× (1× = 1 dia a cada 2 s) |

Os passos acima de 16 ms **só vêm de duas fases que ainda rodam inteiras, sem `yield`**. As outras fases já são geradores fatiados e ficam
dentro do quadro (o total delas por dia pode ser grande, mas se espalha por vários passos).

## Fases do dia (ordem de `trabalhoPesado` em `src/sim/simulation.ts`)

| Fase | Fatiada? | Custo por dia: média / p99 / máx | Estoura 16 ms num passo? |
|---|---|---|---|
| redes de serviço | sim | 20,6 / 50,5 / 50,5 ms (soma das fatias) | não |
| **serviços sociais** (`servicosSociais.atualizar`) | **não (1 bloco)** | **10,1 / 21,8 / 21,8** | **sim: até 25,7 ms** |
| **território** (`territorio.atualizar`) | **não (1 bloco)** | **8,0 / 20,3 / 20,3** | **sim: até 20,8 ms** |
| facções (`faccoes.atualizar`) | não | não aparece na medição (sem rótulo próprio) | não observado; **sem instrumentação** |
| favelas (diário) | não | 0,01 / 0,06 | não |
| favelas (semanal) | não | 4,4 / 5,4 | não |
| transporte (semanal) | sim | 533 / 620 por semana, em fatias | não |
| poluição | sim | 3,6 / 14,4 | não (fatias menores) |
| valor do solo | sim | 8,8 / 25,3 (soma) | não |
| demanda | não | 5,5 / 9,6 | não (mas é 60% do orçamento de 16 ms sozinho) |
| crescimento | sim | 14,3 / 22,7 (soma) | não |
| agregados | não | 1,0 / 3,0 | não |
| eventos, notícias, fechamento mensal | não | 1,7 · 0,4 · 3,5 | não |

(O tráfego microscópico da Fase 29 não entra aqui: roda no Worker a 20 Hz num laço próprio, 1,4–2,8 ms por passo com 1.500 veículos.)

## Proposta de corte (para uma fase futura)

1. **Serviços sociais: fatiar por blocos de lotes**, como `valorDoSolo` já faz (`yield` a cada N lotes), e acumular num buffer que só é
   publicado no fim. Os indicadores (crime, saúde, educação) mudam devagar: dá para atualizar **1/4 dos lotes por dia em rodízio** (custo
   ~2,5 ms por dia, mesma média ao longo de 4 dias) com LOD pelo foco da câmera, como o crime já tem (Fase 23). Alvo: nenhuma fatia > 4 ms.
2. **Território: fatiar por linhas da grade** (`TERR_RES`) com `yield` a cada ~16 linhas, e rodar as células longe do foco a cada 2–3 dias.
   (Não investiguei por que o pior caso varia de dia para dia; é a primeira coisa a medir.)
3. **Dar rótulo e medida às facções** (`faseAtual = 'facções'` já existe, mas a medição não a lista): sem número não dá para saber se é a
   próxima a estourar, já que a Fase 26 a pôs no mesmo gerador.
4. **Rede de segurança no `Orcamento`**: se uma fatia passar de 2× o orçamento, registrar o nome da fase e o dia (hoje só o painel F4 mostra o
   pior por fase) e, em testes, falhar com um limite de 16 ms por passo. Hoje o teste só *mede*.
5. **Demanda**: 5,5 ms em bloco; fatiável com o mesmo padrão se, depois dos itens 1 e 2, o pior passo continuar acima de 8 ms.

Meta proposta: p99 ≤ 8 ms e máximo ≤ 16 ms em 60 dias, a mesma medição. Sem mudança de comportamento: os resultados da simulação não mudam,
só quando cada fatia roda (determinismo por semente preservado se a ordem das fatias for fixa).

## Limites desta medição
- É o passo em Node, sem o resto do Worker (tráfego, snapshot para a thread principal, mensagens). No navegador o F4 mostra o passo real.
- Uma rodada de 60 dias tem poucos passos acima de 16 ms (5 a 8): a contagem varia de rodada para rodada; o mais confiável é o nome das fases culpadas.
