# JOGO DO RIO: REGRAS GLOBAIS

## Contexto
Simulação 3D do Rio de Janeiro no navegador (Three.js / R3F). Meta: cidade viva, realista e performática.
Prioridade: fidelidade ao Rio real, 60 fps, dados reais e gratuitos.

## Regras de execução
- Reproduza o bug ANTES (screenshot ou log) e confirme DEPOIS com a mesma câmera/posição.
- Um commit por correção, com mensagem descrevendo a causa raiz.
- Mostre medições (ms, fps, nº de itens rejeitados) em vez de dizer "melhorou". `npm run auditar-mapa` mede relevo e ruas.
- Dados externos (DEM Copernicus GLO-30/SRTM, extratos OSM, Overture, IBGE): baixe de fonte oficial e pública,
  registre URL e data em `data/SOURCES.md`. Se o download falhar, diga o que o usuário precisa baixar manualmente.
- NUNCA use Google Maps/Places/Earth como fonte (termos proíbem armazenar e usar em jogo).
- Nunca invente dados ou resultados em silêncio: se algo falhou, diga.
- Tudo configurável em JSON (data-driven) quando possível.
- Mantenha toggles de qualidade (baixo/médio/alto) e painel de debug (F3 geometria do mapa; F4 performance, ainda por fazer).

## Regra de assets 3D
Antes de criar qualquer modelo 3D proceduralmente, PROCURE e BAIXE assets reais gratuitos. Ordem (pare no primeiro que servir):
1. Kenney.nl, Quaternius, Poly Pizza, OpenGameArt, Smithsonian 3D (download direto, CC0/CC-BY).
2. Sketchfab: só se existir `SKETCHFAB_TOKEN`; senão liste os links dos melhores modelos com licença CC e peça
   para o usuário baixar manualmente em `assets/manual/`.
3. Só se nada servir: modele proceduralmente com detalhe real (nunca caixas e cilindros simples).
Para cada asset: aceite só CC0, CC-BY ou MIT (rejeite NC/ND/editorial); salve em `assets/models/<categoria>/`;
registre em `assets/CREDITS.md` (nome, autor, URL, licença, data); converta para GLB com DRACO/meshopt;
texturas ≤ 1024 px; alvo < 5k tris para carros/pessoas e < 50k para monumentos.
Sem internet ou download bloqueado: liste exatamente o que o usuário precisa baixar, com links, e siga com placeholders marcados TEMP.

## Neste repositório
- O caminho do projeto tem `&` e parênteses: os scripts npm chamam `node node_modules/...`.
- Nomes de arquivo que só diferem na caixa (`Marcos.tsx` × `marcos.ts`) quebram no Windows: dê nomes distintos.
- Os dados do Rio são regerados por `npm run fetch-cidades -- --refazer` (extração do OSM em `data/osm-cache`).
