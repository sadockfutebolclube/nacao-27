# RESEARCH — Fase 0

Pesquisa feita em 25/10/2026. Links verificados via API do GitHub / requisição direta nessa data. "Uso" diz o que aproveitamos; nada de código GPL/AGPL foi copiado (ver regra em DECISIONS D-004).

## 1. Motores e referências de simulação

| Projeto | Link | Licença | Status (out/2026) | Uso no NAÇÃO 27 |
|---|---|---|---|---|
| Micropolis (SimCity original) | https://github.com/SimHacker/micropolis | GPL-3 (+ termos de marca EA) | ativo | **Só estudo de conceitos**: zonas RCI, valor do solo, poluição difusa em grade, crescimento por demanda |
| MicropolisCore (C++) | https://github.com/SimHacker/MicropolisCore | GPL | ativo | idem — referência da separação motor/UI |
| micropolisJS | https://github.com/graememcc/micropolisJS | GPL-3 | ativo | idem — referência de port para o navegador |
| OpenTTD | https://github.com/OpenTTD/OpenTTD | GPL-2 | ativo | estudo de economia de cargas/transporte (Fase 4) |
| Simutrans | https://github.com/simutrans/simutrans | Artistic/GPL | ativo | estudo de linhas e passageiros (Fase 4) |
| Citybound | https://github.com/citybound/citybound | AGPL-3 | parado | estudo de zoneamento por lote ao longo da via |
| A/B Street | https://github.com/a-b-street/abstreet | Apache-2.0 | desacelerado | modelo de cruzamentos e tráfego por agentes (Fase 4); permissivo, pode ser portado com atribuição |
| ProbableTrain/MapGenerator | https://github.com/ProbableTrain/MapGenerator | LGPL-3 | parado | campos tensoriais para malhas viárias procedurais (ideia para gerar municípios vizinhos) |
| WaveFunctionCollapse | https://github.com/mxgmn/WaveFunctionCollapse | MIT (código) | ativo | futuro: favelas/ocupações emergentes em encostas |
| Cimulity | https://github.com/zeikar/cimulity | MIT | ativo | city builder TS (PixiJS) — referência de UX 2D |
| three.js CityGenerator (exemplo oficial) | https://threejs.org/docs/pages/CityGenerator.html | MIT | — | referência de lotes com sementes por prédio |

Conclusão: não existe city builder 3D TS maduro e permissivo para reaproveitar; escrevemos o núcleo do zero, inspirados nos conceitos acima.

## 2. ECS

| Lib | Link | Licença | Notas |
|---|---|---|---|
| bitECS | https://github.com/NateTheGreatt/bitECS | MPL-2.0 | SoA, rapidíssimo; MPL é copyleft por arquivo (ok como dependência) |
| koota | https://github.com/pmndrs/koota | ISC | pmndrs, ótimo com React |
| miniplex | https://github.com/hmans/miniplex | MIT | entidades como objetos |

Decisão: ver D-006 (Fase 2 usa arrays SoA tipados; bitECS entra na Fase 4 para agentes).

## 3. Stack de renderização

| Lib | Link | Licença |
|---|---|---|
| three.js 0.186 | https://github.com/mrdoob/three.js | MIT |
| @react-three/fiber 9 | https://github.com/pmndrs/react-three-fiber | MIT |
| @react-three/drei 10 | https://github.com/pmndrs/drei | MIT |
| postprocessing / @react-three/postprocessing | https://github.com/pmndrs/postprocessing | Zlib / MIT |
| zustand | https://github.com/pmndrs/zustand | MIT |

## 4. Dados reais do Brasil

### Usados agora (automatizados em `scripts/fetch-data.ts`)

| Dado | Endpoint | Observação |
|---|---|---|
| UFs e regiões | `https://servicodados.ibge.gov.br/api/v1/localidades/estados` | ok |
| Municípios (nome, UF) | `https://servicodados.ibge.gov.br/api/v1/localidades/municipios` | 5.570 municípios |
| Malha das UFs (GeoJSON) | `https://servicodados.ibge.gov.br/api/v3/malhas/paises/BR?intrarregiao=UF&formato=application/vnd.geo+json&qualidade=minima` | v3 e v4 respondem; anéis com orientação mista (corrigido no cálculo de área) |
| Malha municipal por UF | `https://servicodados.ibge.gov.br/api/v3/malhas/estados/{id}?intrarregiao=municipio&...` | salva para a Visão Estado (Fase 5/8) |
| População estimada | SIDRA 6579, variável 9324 (`/api/v3/agregados/6579/...`) | último período: **2026** |
| Censo 2022 | SIDRA 4709, variável 93 | |
| PIB | SIDRA 5938, variável 37 | último período: **2023** |
| VAB por setor | SIDRA 5938, variáveis 513/517/6575/525 por município | em UF vem "..."; 2022–2023 ainda "..." na API → usamos **2021** somando municípios |

Documentação: https://servicodados.ibge.gov.br/api/docs (malhas: https://servicodados.ibge.gov.br/api/docs/malhas?versao=4).

### Finanças estaduais — SICONFI (Fase 3, automatizado em `scripts/fetch-fiscal.ts`)

API de dados abertos do Tesouro: `https://apidatalake.tesouro.gov.br/ords/siconfi/tt/` (docs: https://apidatalake.tesouro.gov.br/docs/siconfi/). `id_ente` = código IBGE da UF. Exercício 2024 (6º bimestre / 3º quadrimestre).

| Demonstrativo | Endpoint | Usado para |
|---|---|---|
| RREO Anexo 01 | `rreo?…&no_anexo=RREO-Anexo 01` | despesa por grupo (pessoal, juros, custeio, investimento, amortização) |
| RREO Anexo 02 | `RREO-Anexo 02` | despesa por função (saúde, educação, segurança…) |
| RREO Anexo 03 | `RREO-Anexo 03` | RCL e composição: ICMS, IPVA, ITCD, IRRF, FPE, cota-parte municipal, FUNDEB |
| RREO Anexo 04 | `RREO-Anexo 04` | RPPS: receitas e despesas dos fundos e militares |
| RREO Anexo 14 | `RREO-Anexo 14` | % aplicado em saúde (mín. 12%) e MDE (mín. 25%) |
| RGF Anexo 01 | `rgf?…&co_poder=E&no_anexo=RGF-Anexo 01` | despesa total com pessoal e limites da LRF |
| RGF Anexo 02 | `RGF-Anexo 02` | dívida consolidada, DCL, dívida com a União, disponibilidade de caixa |

Achados: (1) o Anexo 08/12 isolados não respondem para estados em 2024; o Anexo 14 (simplificado) traz os mínimos; (2) o AP informa percentuais como fração (0,18 = 18%) — normalizado; (3) a classificação de repasses municipais difere entre estados (ver D-017); (4) códigos de conta do Anexo 14 são longos — casamento por prefixo.

### Curados manualmente (aproximados, marcados no JSON)

| Indicador | Fonte | Ano |
|---|---|---|
| IDHM | Atlas do Desenvolvimento Humano (PNUD/IPEA/FJP) — http://www.atlasbrasil.org.br/ | 2021 |
| Mortes violentas/100 mil | Anuário Brasileiro de Segurança Pública (FBSP) — https://forumseguranca.org.br/anuario-brasileiro-seguranca-publica/ | 2023 |
| IDEB Ensino Médio | INEP | 2023 |
| Atendimento de esgoto | SNIS/SINISA | 2022 |
| DCL/RCL | **agora automático** via SICONFI (RGF Anexo 2) | 2024 |

### Próximas fontes (Fases 3–8)

- INEP (Censo Escolar), IPEA Atlas da Violência
- INPE PRODES/DETER/Queimadas, ANP royalties, TSE eleitorado por município
- OpenStreetMap/Overpass (malha viária real, opcional), Copernicus GLO-30/SRTM (relevo real — hoje é procedural "fiel ao tipo")
- GeoJSON alternativos: https://github.com/tbrugz/geodata-br (CC0), https://github.com/codeforgermany/click_that_hood (MIT)

## 5. Assets livres (para fases futuras)

Kenney.nl (CC0), Quaternius (CC0), Poly Haven (CC0: HDRIs, texturas, modelos), ambientCG (CC0), Freesound (CC0/CC-BY por arquivo). Licenças conferidas em guias agregadores; **conferir a página de cada pacote antes de importar** (registrar em ASSETS_LICENSES.md). Na Fase 2 nenhum asset externo foi usado: tudo é procedural (ver ASSETS_LICENSES.md).

## 6. Referências da Fase 4 (modelagem; números usados como ordem de grandeza)
- **Favelas e Comunidades Urbanas** — IBGE, Censo 2022: ~16 milhões de pessoas (cerca de 8% da população) vivem nesses territórios; ocupação em encostas e margens de rios. Inspira o déficit de moradia popular e o sítio das ocupações.
- **Anuário Brasileiro de Segurança Pública** (FBSP): ordem de grandeza de mortes violentas intencionais, roubos e mortes por intervenção policial por UF; superlotação do sistema prisional. Usados para os indicadores iniciais e para a letalidade das operações.
- **Câmeras corporais** — avaliações do programa da PM de São Paulo (2020–2022) mostraram queda expressiva da letalidade nos batalhões com câmeras; o jogo usa −40% a −45%.
- **Curva BPR** (Bureau of Public Roads, 1964): `t = t0·(1 + 0,15·(v/c)^4)`.
- **Modelo de quatro etapas / logit multinomial**: formulação clássica de planejamento de transportes (geração, distribuição gravitacional, divisão modal, alocação), simplificada.
- **Custos de referência** (ordem de grandeza de projetos brasileiros recentes): BRT ~R$ 20–30 mi/km; metrô subterrâneo ~R$ 400–600 mi/km; teleférico urbano ~R$ 60–90 mi/km; urbanização de favelas ~R$ 8–15 mil/morador.
- Grupos criminosos do jogo são **fictícios**; nenhum nome real é usado.

## 7. Fase 5 — indicadores sociais e regras políticas
### Automatizados em `scripts/fetch-social.ts`
- **DATASUS / TabNet** (http://tabnet.datasus.gov.br): formulários `sinasc/cnv/nvuf.def` (nascidos vivos por residência da mãe), `sim/cnv/inf10uf.def` (óbitos infantis por residência), `cnes/cnv/leiintbr.def` (leitos de internação, quantidade SUS). POST em ISO-8859-1, `formato=prn`.
- **IBGE / SIDRA — PNAD Contínua** (https://apisidra.ibge.gov.br): tabela 4099 (taxa de desocupação, trimestral), 7438 (limites superiores dos percentis P5…P99 da renda domiciliar per capita), 7435 (Gini).
- **Linha de extrema pobreza**: R$ 218 per capita/mês, Lei 14.601/2023 (Programa Bolsa Família).
### Regras institucionais usadas
- Constituição Federal, art. 27 (tamanho das Assembleias) e LC 78/1993 (513 deputados federais por UF).
- CF art. 58 §3º, reproduzido nas constituições estaduais: CPI com 1/3 de assinaturas e prazo certo.
- Emendas às constituições estaduais: 3/5 em dois turnos (simplificado para uma votação).
- Lei 1.079/1950 e constituições estaduais: admissão de processo contra governador por 2/3 da Assembleia.
- Lei 9.504/1997 e LC 64/1990: secretários que vão disputar eleição deixam o cargo até 6 meses antes (abril).
- Mesa Diretora: mandato de dois anos, eleição no início de cada biênio da legislatura.

## 8. Fase 6 — clima, festas e calendário
- **Normais climatológicas**: ERA5 (ECMWF/Copernicus) via Open-Meteo Historical Weather API (https://open-meteo.com/en/docs/historical-weather-api), diário 1991–2020, ponto da capital. O INMET publica as normais 1991–2020 por estação (https://portal.inmet.gov.br/normais); usamos a reanálise pela cobertura uniforme e pelo acesso automatizável.
- **ENSO no Brasil** (padrões clássicos, CPTEC/INPE): El Niño — seca no Norte e Nordeste e chuva excessiva no Sul; La Niña — o inverso. Frequências aproximadas de 25% para cada fase.
- **Datas**: Páscoa pelo algoritmo de Meeus/Jones/Butcher; Carnaval 47 dias antes (terça); Círio de Nazaré no 2º domingo de outubro; São João em 24 de junho.
- **Calendário político real usado nos eventos**: eleições municipais em outubro de 2028; janela partidária em março/abril de 2030; transição do ICMS para o IBS a partir de 2029 (EC 132/2023); Jogos Olímpicos de Los Angeles em julho/agosto de 2028; Copa do Mundo de 2030 em junho/julho.
- Desastres inspirados em ocorrências típicas brasileiras (enchentes urbanas, deslizamentos em encostas, estiagens no semiárido, queimadas no Cerrado/Amazônia/Pantanal, ressacas no litoral Sul/Sudeste, ciclones extratropicais no Sul, cheias e vazantes na Amazônia, barragens de rejeitos em estados mineradores), sem reproduzir casos reais nominalmente.

## 9. Fase 7 — eleições
- **Eleitorado**: TSE, Portal de Dados Abertos, "Perfil do eleitorado" 2022 (https://dadosabertos.tse.jus.br/dataset/eleitorado-2022; arquivo `perfil_eleitorado_2022.zip`, CSV por UF com eleitores por município, zona, gênero, faixa etária e escolaridade). Dois municípios têm nome diferente no TSE e no IBGE (Boa Saúde/RN = Januário Cicco; São Luiz/RR = São Luiz do Anauá).
- **Regras**: CF art. 28 (governador: 1º domingo de outubro, 2º turno no último domingo, maioria absoluta dos válidos) e art. 14 §5º (uma reeleição); EC 111/2021 (posse dos governadores em 6 de janeiro a partir de 2027); Lei 9.504/1997 — convenções de 20/7 a 5/8 (art. 8º), propaganda a partir de 16/8 (art. 36), horário eleitoral nos 35 dias anteriores à antevéspera (art. 47) com 90% do tempo pela bancada e 10% igualitário, condutas vedadas nos 3 meses anteriores (art. 73: transferências voluntárias e publicidade institucional).
- **Ordens de grandeza**: abstenção de ~20% e brancos/nulos de ~6–8% nas eleições para governador de 2022 (TSE).

## 10. Fase 8 — municípios, biomas e música
- **Coordenadas das sedes municipais**: kelvins/municipios-brasileiros (https://github.com/kelvins/municipios-brasileiros, MIT), compilada de dados do IBGE.
- **Altitude**: tiles "Terrarium" do projeto Mapzen/Tilezen Joerd no AWS Open Data Registry (https://registry.opendata.aws/terrain-tiles/), mistura de SRTM, GMTED2010 e ETOPO1; codificação h = R·256 + G + B/256 − 32768. Primeira tentativa com a API de elevação do Open-Meteo (Copernicus GLO-90), abandonada pelo limite diário.
- **Biomas**: referência do mapa de Biomas do Brasil do IBGE (2019, 1:250.000) para validar as regras; Caatinga no agreste (Campina Grande, Caruaru), Cerrado no norte de MG e leste do MA.
- **Gradiente térmico**: −0,6 a −0,65 °C por 100 m (atmosfera padrão); Vitória da Conquista (~880 m) tem média anual ~20 °C contra ~25,5 °C em Salvador (INMET, normais 1991–2020).
- **Ritmos**: padrões baseados em descrições didáticas clássicas — baião (zabumba em colcheia pontuada + semicolcheia, bacalhau, triângulo aberto/abafado), maracatu de baque virado (alfaias, gonguê, caixa), ijexá (agogô), samba (surdo de segunda no 2º tempo, tamborim, ganzá), frevo (caixa em semicolcheias, andamento ~140–150), milonga (3-3-2), reggae (one drop), tamborzão; escala "nordestina" = modo mixolídio com 4ª aumentada (lídio-dominante), comum no forró e no baião.

## 11. Fase 9 — Presidência, Banco Central e nuvem
- **Banco Central — SGS** (https://api.bcb.gov.br/dados/serie/bcdata.sgs.{código}/dados): 432 Selic meta; 13522 IPCA 12 meses; 1 PTAX venda; 24369 desocupação PNAD; 13762 DBGG % PIB; 4513 DLSP % PIB; 5793 NFSP primária 12 meses % PIB (positivo = déficit); 5727 NFSP nominal 12 meses % PIB; 4380 PIB mensal corrente; 7326 PIB real anual. Séries diárias por período: o parâmetro "ultimos" aceita no máximo 20 observações.
- **Focus** (Olinda, ExpectativasMercadoAnuais): medianas de IPCA e Selic.
- **Leitura de 26/10/2026**: Selic 13,75%; IPCA 12m 4,58%; PTAX R$ 5,50 (alta de ~9% no dia seguinte ao 2º turno de 2026); desocupação 5,3%; DBGG 82,9%; déficit primário 0,62% do PIB; juros nominais 8,9% do PIB; PIB R$ 13,4 tri; Focus IPCA 2027 4,34%.
- **Regras**: CF arts. 46 (3 senadores por UF), 47 (maioria), 52 (sabatina), 60 (PEC 3/5 em dois turnos), 62 (MP, 120 dias), 69 (lei complementar, maioria absoluta), 77 (eleição presidencial), 85–86 (impeachment: 2/3 na Câmara e no Senado), 101 (STF, 11 ministros), EC 88/2015 (compulsória aos 75), EC 111/2021 (posse em 5 de janeiro), LC 78/1993 (513 deputados por UF), LC 179/2021 (autonomia do BC, mandatos defasados), LC 200/2023 (arcabouço: despesa cresce 70% da receita real, 0,6%–2,5%, metas com banda de 0,25 p.p.), meta de inflação contínua de 3% ±1,5 p.p. (CMN 2024).
- **Orçamento** (aproximado, RTN 2025, % PIB): receita líquida 18,6; Previdência 8,1; pessoal 3,2; BPC 0,95; abono e seguro 0,75; transferência de renda 1,4; saúde 1,75; educação 1,15; investimentos 0,65; emendas 0,45; demais custeio 0,9.
- **Macro**: regra de Taylor com juro neutro real ~5% (estimativas recentes do BC entre 4,75% e 5,25%); repasse cambial de ~10% em 12 meses; lei de Okun com coeficiente ~0,45.
- **Supabase**: Row Level Security com `(select auth.uid())` nas políticas; login anônimo (`signInAnonymously`) e OTP por e-mail.
