# Fase 23 — desempenho da simulação e da geração (medições)

Máquina de desenvolvimento (Windows 11), Rio real: 139.264 lotes, 152.698 prédios. Brutos: `medicao-simulacao-antes.json`, `medicao-simulacao-depois-*.json`, `geracao-antes.log`, `geracao-depois.log`, `geracao-osm-antes-depois.log`. Reproduzir: `npm run medir-simulacao [-- --dias=60 --orcamento=4]`. Os números variam de uma rodada para outra (±15%): a máquina estava com o navegador aberto nas últimas.

## Simulação (60 dias de jogo)

| | antes | depois, síncrono | depois, orçamento 4 ms |
|---|---|---|---|
| CPU por dia de jogo (média) | 1.179 ms | 325 ms | 127 ms |
| Relógio máximo que a máquina sustenta (1× = 1 dia / 2 s) | ~1,7× | ~6× | ~16× |
| Pior passo (`step()`) | 8.160 ms (modelo semanal de transporte) | 1.811 ms (idem, sem fatiar) | **17,3 ms** (p99 12,1; p95 8,5; mediana 5,0) |
| Modelo semanal de transporte | 7.692 ms | 1.627 ms | 427 ms por semana, em fatias (amostra de 1/4 das origens, × 4) |
| `redesDeServico` | 61 ms | 18 ms | 17 ms (em fatias) |
| `valorDoSolo` | 40 ms | 17 ms | 7 ms (LOD) |
| `servicosSociais.atualizar` | 14 ms | 16 ms | 8 ms (LOD do crime) |
| `camposDePoluicao` | 12 ms | 3 ms | 3 ms |

No navegador (F4, Rio, relógio 8×, ~4 anos de jogo): passo mediano 4,6 ms, p99 7,6 ms, pior 8,3 ms, 64 fps, 15 dias engolidos em ~1.400.

O que mudou: Dijkstra com CSR e heap tipado, sem alocar por busca (o gargalo do modelo semanal); nó mais próximo por grade (270 ms → ~0 por semana); componentes do grafo e equipamento→rede em cache por versão do mundo; tabelas por arquétipo e posições em `Float64Array` (`lotX/lotZ/lotY`) no lugar de objetos por lote; hash espacial (`HashLotes`) nos laços equipamento × lote; trabalho do dia em geradores sob `Orcamento` (fatias, excedente na fila, coalescência: um dia só entra na fila se o anterior terminou); LOD pelo foco da câmera (lotes longe: valor do solo e crime a cada 4º dia, escalonados, com a taxa de alisamento acumulada).

Fora da meta: o pior passo (17 ms) ainda passa de 16 ms em algumas rodadas (fatias atômicas de serviços sociais e território, ~12–15 ms); o p99 está dentro.

## Geração do Rio

| etapa | antes | depois |
|---|---|---|
| relevo (filtros) | 138,7 s | 10,8 s |
| prédios do OSM + Microsoft + serialização | 55,4 s | 4,9 s |
| total, caches do OSM prontos | **201 s** | **22 s** (saída idêntica, byte a byte, exceto `geradoEm`) |
| extração do `sudeste.osm.pbf` (862 MB) | 105 s | 1ª vez 171 s (lê e grava o recorte de 32 MB); depois 3,5 s; com o manifesto em dia, 0 s |

Causa do relevo: `limitarInclinacao` varria a grade inteira (2,4 M células) 400 vezes para ajustar 11 mil vértices; agora só reconfere vizinhanças que mudaram (mesma ordem de varredura, resultado idêntico). Causa dos prédios: grades de ruas e de uso do solo indexadas por string e varredura linear de todos os polígonos de uso por prédio.

A meta de 60 s vale com o extrato do OSM já recortado/em cache (22 s). A primeira leitura de um extrato regional novo continua custando minutos (sem `osmium`, é leitura completa do PBF em Node).

## Binário
`public/data/cidades/3304557/` (núcleo + 104 tiles de 1 km): 11,1 MB contra 16,2 MB do JSON (gzip: 4,9 × 5,4 MB). Decodificação ~170 ms contra ~150 ms de JSON.parse + zod: não carrega mais rápido, só pesa menos e já vem em tiles. O carregamento sob demanda por tile não está ligado.
