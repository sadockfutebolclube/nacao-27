# SIMULATION

Duas escalas: **Visão Cidade** (Fase 2, diária) e **Governo Estadual** (Fase 3, mensal). A cidade é o *Programa Estadual de Desenvolvimento Urbano da Capital*: recebe um repasse definido na LOA do Estado.

# Parte I — Visão Cidade (Fase 2)

Código: `src/sim/simulation.ts` (classe pura, roda no Worker e nos testes). Catálogo: `src/sim/catalog.ts`.

## Tempo
- 1 tick = 6 h. Passo diário a cada 4 ticks. Fechamento mensal no dia 1º.
- Calendário começa em **01/01/2027** (posse dos governadores eleitos em 2026). Ano de 365 dias.
- Velocidades: pausa, 1× (1 dia/2 s), 2×, 4×.
- RNG determinístico `sfc32` com estado salvo — mesma seed + mesmos comandos = mesma cidade.

## Passo diário (ordem)
1. **Redes** (água, energia, esgoto)
2. **Poluição** (grade 96 × 96, células de 32 m)
3. **Valor do solo**
4. **Demanda RCI**
5. **Crescimento** (novas obras, obras em andamento, ocupação, evolução, abandono)
6. **Agregados** (população, empregos)
7. **Notícias**
8. (dia 1º) **Fechamento mensal**

### 1. Redes
- Componentes conexos do grafo viário (union-find). Equipamento liga na aresta mais próxima (≤ maior lado + 16 m).
- Consumo por imóvel pronto: água = moradores·1 + empregos·0,5; energia = moradores·1 + empregos·(1 comércio | 1,6 indústria); esgoto = 0,8·água.
- Razão de atendimento por componente `r = capacidade / demanda`. Lote atendido se `ordem_lote < r`, com `ordem_lote ∈ [0,1)` estável (hash da posição).
- **Poluição da água** (0–1): `alvo = 0,06 + (1 − esgotoUF/100)·0,3 + E/(E + 25 000)·0,6 + 0,03·termelétricas`, onde E = esgoto in natura. Converge 1%/dia (inércia de baía).

### 2. Poluição do ar/solo
- Emissão: galpão 0,25, fábrica 0,5 por dia; equipamento com poluição p emite 0,25·p (termelétrica p = 6).
- `P' = emissão + 0,9 · (0,6·P + 0,4·média_4_vizinhos)`.
- No lote: `pol = P/(P + 1,5)`.

### 3. Valor do solo (0–100)
```
v = 24
  + orla · (30 + 10·turismo) · (1 − 0,7·poluiçãoÁgua)      orla = clamp(1 − (dÁgua − 30)/480)
  + Σ lazer: bônus · (1 − d/raio)                         praça 10 @140 m, parque 16 @280 m
  − Σ equipamento incômodo (termelétrica/ETE/subestação): 12 · (1 − d/160)
  + 7·água + 7·energia + 7·esgoto
  − 50 · poluiçãoLote
  + 15·qualidadeVida + 6·renda                            (traços da UF)
  + clamp((cota − 6)·0,15, 0, 6)                          vista
lv ← lv + (clamp(v) − lv)·0,15
```

### 4. Demanda RCI (−1 a 1, suavizada 25%/dia)
- R = max(população, 0,9·capacidade residencial incluindo obras); força de trabalho W = 0,5·R; J = empregos (com + ind).
- `r = 0,45 + 1,25·(J − W)/max(300, W) + (aprovação − 50)/120 + 0,08·qualidadeVida`
- `c = 1,5·(C* − Ccap)/max(120, C*)`, com `C* = 0,22·R·(1 + 0,5·turismo + 0,3·serviços)`
- `i = 1,5·(I* − Icap)/max(150, I*) + 0,2·[desemprego > 12%]`, com `I* = 0,16·R·(1 + 0,6·indústria + 0,3·agro) + 60`

### 5. Crescimento
- Lote zoneado vazio constrói nível 1 com prob. `(0,01 + 0,06·d)·(0,45 + lv/90)`, limitado a `2 + 26·d` (R), `1 + 14·d` (C), `1 + 10·d` (I) novas obras/dia.
- Obra avança `1/dias_de_obra` por dia (casa 12 d … torre 160 d).
- Ocupação alvo = capacidade · (1 se água+energia, senão 0,35) · (empresas: 0,35 + 0,65·preenchimento de vagas). Move 20%/dia (mín. 1 pessoa).
- **Evolução** para nível n+1 se `lv ≥ [—, —, 32, 50, 68][n+1]`, água+energia, esgoto para nível ≥ 3 e demanda > −0,05; prob. diária `0,004 + 0,01·d`. Reconstrução com nova obra.
- **Abandono**: > 150 dias sem água/energia (2%/dia) ou demanda < −0,6 (0,15%/dia). Volta se o serviço for restabelecido (3%/dia).
- Mudar a zona de um lote construído demole o prédio.

### Arquétipos (resumo)
| Zona | Nível | Nome | Andares | Capacidade |
|---|---|---|---|---|
| R baixa | 1–3 | casa com laje → sobrado → casa de 3 andares | 1–3 | 4 / 8 / 15 moradores |
| R alta | 1–4 | prédio 4 andares → edifício → caixote anos 70 → torre | 3–26 | 32 / 70 / 140 / 230 |
| Comercial | 1–3 | loja → galeria → escritórios | 1–20 | 8 / 30 / 140 empregos |
| Industrial | 1–2 | galpão → fábrica | 1–2 | 25 / 70 empregos |

## Finanças do Programa da Capital
Mensal, R$:
- **ICMS** = 0,075 · (VA_com + VA_ind) · (1 + receitaICMS); VA_com = vagas_com·preench.·5 500·(1 + 0,5·serviços + 0,3·turismo + 0,3·tecnologia); VA_ind = vagas_ind·preench.·8 000·(1 + 0,5·indústria)
- **ICMS consumo** = população · 38 · (1 + 0,5·renda)
- **Tarifas** água 20 e esgoto 11 por unidade atendida
- **Repasse do Tesouro** = dotação `programaCapital` da LOA ÷ 12 (sem dados fiscais: 1,6 mi · (1 + transferênciasFederais) e royalties = 4 mi · receitaRoyalties)
- **Despesas**: manutenção de vias (R$ 2,2/m rua, 5/m avenida), custeio de equipamentos (a dívida é do Tesouro estadual; sem dados fiscais: 0,9 mi · dividaInicial)
- **Investimentos** saem do caixa na hora (vias R$ 2 400/m rua, 6 500/m avenida, pontes ×4; equipamentos pelo catálogo), × (1 + custoObras).
- **Invariante testada**: Δcaixa do mês = receitas − despesas − investimentos.
- Caixa inicial: 60 mi · (1 − 0,4·dividaInicial). Sandbox: ilimitado.

## Satisfação nos bairros (entra com peso 8% na aprovação geral)
- Poluição da água usa o **atendimento de esgoto do Estado** (que melhora com investimento e obras), não mais o valor fixo da UF.

`alvo = 22 + 18·cob_água + 18·cob_energia + 8·cob_esgoto + 22·(1 − desemprego) − 25·poluição_casas − 8·poluição_água − 8·[caixa < 0]`, aproximação de 35%/mês.

## Traços das UFs usados nesta fase
`custoObras, receitaICMS, receitaRoyalties, transferenciasFederais, dividaInicial, turismo, industria, agro, servicos, tecnologia, renda, qualidadeVida` + `esgotoUF` (dado real). Os demais (riscos, criminalidade, pressão ambiental…) já estão no schema e entram nas Fases 3–6.

## Testes (`tests/simulation.test.ts`)
- RNG determinístico e restaurável
- 27 UFs válidas; terreno de todas gera alturas finitas
- Cruzamento em X gera nó de grau 4; T faz snap e divide aresta
- 20 anos acelerados: orçamento fecha em todos os 240 meses, nenhuma variável NaN/∞, aprovação em [5, 95]
- Save/load: mesmo estado e evolução idêntica depois de carregar
- Sem água/energia, nada passa do nível 1

# Parte II — Governo Estadual (Fase 3)

Código: `src/sim/estado/` (`calibracao.ts`, `estado.ts`, `obras.ts`, `tipos.ts`). Passo **mensal**, chamado pela cidade no dia 1º. Testes: `tests/estado.test.ts`.

## Ponto de partida: SICONFI 2024 → jan/2027
`scripts/fetch-fiscal.ts` baixa, para as 27 UFs, RREO (anexos 1, 2, 3, 4 e 14) e RGF (anexos 1 e 2) do 6º bimestre / 3º quadrimestre de 2024. Fluxos × 1,20 (inflação + crescimento 2024–2027); dívida × 1,10.

Calibrações (todas reproduzem o dado real no instante zero):
| Constante | Como |
|---|---|
| Salários do Executivo S | RGF pessoal ativo bruto ÷ (1 + 2·14%) (tira a patronal) |
| Benefícios B | RREO-4: despesas de todos os fundos (repartição, capitalização, militares, Tesouro) |
| Divisão por carreira/área | RREO-2 por função × fração de pessoal típica (educação 72%, segurança 82%, saúde 42%, demais 35%) |
| Servidores | folha da carreira ÷ (salário-base regional × 13,33) — **estimado** |
| kMunicípios, kFUNDEB | repasses reais ÷ regra (25% ICMS + 50% IPVA; 20% da cesta do FUNDEB) |
| fracInativosDTP | (DTP do RGF − ativos) ÷ B |
| Custeio total | **resíduo** que fecha RCL − pessoal − aporte RPPS − investimento − poderes − dívida − programa − emendas − resultado-alvo (alvo: +1% RCL, menos 3%·dividaInicial). Necessário porque alguns estados (ex.: SP) lançam repasses municipais como despesa |
| fracPagamento da dívida | serviço pago ÷ serviço teórico (IPCA + 4% em 30 anos com a União; IPCA + 4,5% em 12 anos demais). Se < 55% com dívida da União > 50% RCL → **RRF** |
| kSaúde, kEducação | % aplicado real (RREO-14) ÷ % do modelo |
| Alíquota modal ICMS / IPVA | tabela por UF (2025/26, aproximada) |

## Receitas (mês)
- `ICMS = base/12 · índicePIB · (aliq/aliq₀)^0,45 · (1 − incentivos)` (elasticidade: +10% de alíquota ≈ +4,4% de receita); dezembro +12%.
- `IPVA = base · sazonalidade(jan 26%, fev 20%, mar 16%…) · índicePIB · (aliq/aliq₀)^0,85`; `ITCMD … ^0,7`.
- `IRRF = taxa · (salários + benefícios)`.
- Patrimonial/royalties: fração de royalties (traço da UF) × índice do petróleo (passeio aleatório).
- FPE e transferências: índice nominal nacional. FUNDEB: formação 20% da cesta (com kFUNDEB), retorno calibrado.
- RCL do mês = receitas − cota-parte dos municípios − formação do FUNDEB.

## Despesas (mês)
- **Pessoal**: Σ servidores·salário·1,0278 (1/3 de férias) e 13º em dezembro; patronal 2·alíquota.
- **Previdência**: aporte = max(0, B/13 (13º em dez.) − contribuições·kContrib).
- **Custeio e investimento** por secretaria = LOA ÷ 12 · (1 − contingenciamento); duodécimos ⇒ sem investimento.
- **Obras** consomem a dotação de investimento da área; se faltar, o Tesouro paga até 2× a dotação em medições atrasadas; ritmo < 40% por 3 meses ⇒ **obra parada**.
- **Poderes** (ALE, TJ, MP, Defensoria) = participação calibrada × RCL.
- **Dívida**: juros (real + IPCA) e amortização × fracPagamento; no RRF a parte não paga capitaliza e a fração sobe 11,1 p.p./ano até 100%.
- `Δcaixa = receitas + operações de crédito − despesas` (testado mês a mês). Caixa < 0 ⇒ atraso a fornecedores; < −25% da folha mensal ⇒ **salários atrasados**.

## Folha e previdência
- Aposentadoria 0,22%/mês do quadro (≈ 2,6% a.a.), benefício ≈ 85% do salário; mortalidade de beneficiários 0,14%/mês (0,21% com reforma).
- Crescimento vegetativo +1,2% a.a. (progressões); revisão geral pela LOA.
- Concursos: `quadro ≥ 0` repõe aposentadorias + expande; `< 0` só não repõe (estáveis não são demitidos).
- Greve: chance mensal `(perda real − 4%)·0,25` (+15% com salário atrasado); greve reduz o esforço da área e piora indicadores.

## LRF, mínimos e CAPAG
- DTP = salários + patronal + fracInativosDTP·B (12 meses); limites do Executivo estadual: alerta 44,1%, prudencial 46,55%, máximo 49%.
- Acima do prudencial (ou no RRF): reajuste ≤ IPCA e concursos só reposição — a proposta é cortada.
- DCL/RCL > 200% (Res. Senado 40/2001): operações de crédito vedadas.
- Mínimos apurados no ano civil: saúde ≥ 12% e educação ≥ 25% da receita de impostos líquida (ICMS + IPVA + ITCMD + IRRF + FPE − municípios). Descumprir ⇒ notícia, TCE, queda de aprovação.
- CAPAG (Portaria STN 501/2017, simplificada): endividamento DC/RCL (<60% A, <150% B), poupança corrente (<90% A, <95% B), liquidez (obrigações/caixa < 1). Sem A/B não há aval da União (BNDES, BIRD).

## Ciclo orçamentário
| Quando | O quê |
|---|---|
| jan/2027 | posse com a LOA herdada (aprovada em dez/2026) |
| até 15/abr | LDO: meta austera / equilibrada / expansionista (senão a Casa Civil manda "equilibrada") |
| 1º–31/ago | LOA do ano seguinte (+ PPA no 1º ano: até 3 eixos, +12% de eficiência). Sem envio ⇒ LOA inercial da Fazenda (inflação + 2,5% — 0 no RRF, revisão geral, ajuste para cumprir mínimos e teto do RRF) |
| dezembro | votação na ALE: `logit = 9·(base − 0,5) + (aprovação − 45)/18 + 220·(emendas/RCL − 0,4%) − 0,9·Δp.p.ICMS − 0,6·Δp.p.IPVA − déficit − 0,7·[alíquota previdenciária maior]` |
| jan | aprovada ⇒ vigora (reajustes aplicados); rejeitada ⇒ **duodécimos** (1/12 da última LOA aprovada, metade dos investimentos em contratos), revotação mensal até julho com pressão crescente (+1,3 +0,7/mês no logit) |
| mai/set/jan | RGF quadrimestral: alertas do TCE |
| set (anos pares) | INEP divulga o IDEB do ano ímpar anterior |

## Indicadores das secretarias
Esforço da área `E = gasto real 12m ÷ gasto real da linha de base` (clamp 0,3–3; Δ = E − 1). Alvos com tanh (retornos decrescentes) e aproximação exponencial com constante τ (meses):
| Indicador | Alvo | τ |
|---|---|---|
| Espera na emergência | e₀·(1 − 0,45·tanh(1,3Δsaúde + PPA))·(1 + obras) | 5 |
| Mortalidade infantil | m₀·(1 − 0,12·tanh Δsaúde − 0,004·Δesgoto p.p.)·obras | 24 |
| IDEB EM | i₀ + 0,9·tanh(1,1Δeduc + PPA) + obras − greve | 30 |
| Mortes violentas | h₀·(1 − 0,3·tanh(1,4Δseg) − 0,12·tanh Δassist − 0,08·ΔIDEB + 2,5·Δdesemprego + greve)·obras | 7 |
| Esgoto (%) | +100·(invest. saneamento − 60% da base)/(pop·R$ 2.600) por mês + obras | — |
| Deslocamento | d₀·(1 − 0,08·tanh Δtransp)·obras·(1 + 0,6·crescimento real acumulado) | 18 |
| Extrema pobreza | p₀·(1 − 0,3·tanh(1,2Δassist))·(1 + 3·Δdesemprego)·obras | 10 |
| Desemprego | d₀ − 0,8·(g − 2%) + obras − 1 p.p.·tanh Δdesenv | 8 |
Valores iniciais: IDEB, homicídios e esgoto reais; espera, mortalidade, pobreza e desemprego derivados do IDH (**estimados**).

Crescimento do PIB estadual = ciclo nacional (AR(1) em 2%) + obras − 0,12·(ICMS/ICMS₀ − 1) + 0,06·incentivos + 0,004·ΔIDEB − 0,006·(homicídios/h₀ − 1) + traços agro/indústria − 0,5 p.p. se caixa < 0.

## Aprovação (média ponderada de grupos)
Pesos: baixa renda 55%, classe média 35%, servidores 6%, empresariado 4% (+8% de satisfação dos bairros da capital). Alvos:
- **Servidores**: 50 + 220·ganho real médio − 30·atraso − 12·reforma recente + 4·concursos − 5·RRF
- **Empresariado**: 52 − 260·(ICMS − ICMS₀) + 120·incentivos + 500·(g − 2%) − 12·[caixa < 0] ± 4·CAPAG
- **Classe média**: 50 + 26·(1 − hom/h₀) + 18·(1 − espera/e₀) + 40·(1 − desloc/d₀) + 12·ΔIDEB − 450·ΔIPVA − 100·ΔICMS⁺
- **Baixa renda**: 50 + 25·(1 − pobreza/p₀) + 18·(1 − espera/e₀) + 15·(1 − hom/h₀) − 260·Δdesemprego + 0,5·Δesgoto + 10·(1 − mort/m₀)
- Lua de mel: +10 decaindo a zero em 8 meses; choques (greve, inaugurações, LOA rejeitada, mínimos descumpridos…) decaem com meia-vida própria. Grupos aproximam o alvo 20%/mês.
- Base aliada converge para `0,5 + (aprovação − 50)/220 + 25·(emendas/RCL − 0,4%) − 0,08·complexidadePolítica`.

## Dívida: RRF e PROPAG
- **RRF** (LC 159/2017): parcela com a União suspensa, retomada 11,1 p.p./ano; teto de gastos (custeio + investimento ≤ IPCA), reajuste ≤ IPCA, concursos só reposição; operações de crédito bloqueadas.
- **PROPAG** (LC 212/2025, **simplificado**): entrega ativos = 10% da dívida com a União (−6% da receita patrimonial) e os juros reais caem de 4% para 2% a.a.; sai do RRF e volta a pagar 100%.
- Operação de crédito: até 15% da RCL; BNDES/BIRD exigem CAPAG A/B; libera em 3 (BNDES/bancos) ou 6 meses (BIRD); bancos privados cobram 2% de deságio.

## Testes (`tests/estado.test.ts`)
- 8 UFs: RCL inicial = RCL 2024 × 1,2 (±10%) e pessoal/RCL a menos de 6 p.p. do RGF real
- Mandato de 48 meses com a LOA herdada: Δcaixa = resultado em todos os meses, tudo finito, aprovação em (3, 97)
- Projeção da LOA: ICMS maior ⇒ receita maior; reajuste ⇒ pessoal maior; mínimos plausíveis
- Corte de saúde ⇒ descumprimento noticiado; obra licitada → executada → inaugurada com efeito
- Ciclo orçamentário completo no RJ (no RRF): envio em agosto respeitando o teto, votação em dezembro
- PROPAG reduz os juros pagos
- Integração: cidade + Estado, repasse do programa, save/load determinístico

---

# Parte III — Serviços, território, favelas e mobilidade (Fase 4)

Tudo roda no Worker. Ordem: **diário** (serviços → território → deslizamentos), **semanal** (déficit e favelas → modelo de deslocamentos), **mensal** (Estado: indicadores e políticas).

## Cobertura de saúde, educação e segurança (`src/sim/city/servicos.ts`)
Para cada equipamento com raio `r` e capacidade `cap` (Clínica da Família, UPA 35 mil/1 km, Hospital 140 mil/2,2 km, Colégio 12 mil/650 m, escola integral e técnica, Delegacia 28 mil/750 m, Batalhão 90 mil/1,6 km, Base comunitária 9 mil/380 m…):
- `pop` = moradores formais no raio + moradores de favela no raio
- `eficiência = min(1, cap / pop) × (1 − 0,45 × domínio criminoso no local)`
- cobertura do lote = `max` sobre equipamentos de `eficiência × (1 − (d/r)²)`
- **lotação** da rede = demanda total ÷ capacidade total (painéis)

## Criminalidade por lote (0–1, suavizada 10%/dia)
`alvo = (0,06 + 0,32·(1 − valor/100)^1,5 + 0,3·desemprego + 0,55·domínio + 0,12·abandonado − 0,35·policiamento) × (1 + 0,5·traço_UF)`
- desemprego = (0,5·população − empregos) ÷ (0,5·população)
- Favela: `(0,25 + 0,7·domínio + 0,2·desemprego − 0,3·policiamento) × fatorUF × (0,6 se urbanizada)`
- Efeitos: valor do solo cai até −10 perto de favela informal (−3 urbanizada), crescimento residencial cai com crime, aprovação por bairro entra no estadual.

## Controle territorial (`src/sim/city/territorio.ts`) — grade de 64 m (48×48)
Dois grupos **fictícios**: *Comando da Laje* (facção) e *Liga do Asfalto* (milícia). Por célula: força `F` (facção), `M` (milícia), presença policial `P`.
- `P` = max dos equipamentos de segurança `força × (1 − (d/r)²)` (base 1,0; batalhão 0,85; delegacia 0,7) + ocupação pós-operação (decai 2,5%/dia).
- Difusão: média dos 4 vizinhos (`nF`, `nM`).
- `ΔF = 0,025·(0,35F + 0,65nF)·pobreza·(1−P)·livre·prev − (0,035P + 0,002)·F·decF + fonte`
- `ΔM = 0,018·(0,35M + 0,65nM)·(0,35 + 0,65·pobreza)·(1−P)·livre·vans·intel − (0,035P + 0,002)·M·decM + fonte`
  - livre = 1 − F − M; pobreza = 1 − valor do solo (favela informal 0,95)
  - prev = 0,6 com doutrina **prevenção**; decF = 1,15 com **confronto**; decM = 1,7 e intel = 0,7 com **inteligência**
  - vans: tolerar ×1,5, combater ×0,8 (a milícia vive do transporte clandestino)
  - fonte: +0,0009/dia por casa de favela informal (0,0003 urbanizando)
- **Guerra**: F > 0,2 e M > 0,2 na mesma célula ⇒ ambos −0,006/dia; > 3 células em guerra gera notícia.
- Situação da população: Estado (força < 0,3), disputado (< 0,6), facção ou milícia.

### Operação policial (raio 280 m)
1. Avalia: se a força máxima na área < 0,15, não autoriza (nada muda).
2. Corta F e M por 0,2 (confronto), 0,4 (inteligência) ou 0,5 (prevenção); ocupação +0,6/+0,45; mesma célula bloqueada por 20 dias.
3. Mortos ~ Binomial(12, λ/12), `λ = força_média × (2 + pop/2500) × {1,5; 0,6; 0,8} × (0,55 com câmeras)`; presos ∝ força. Mortos entram na letalidade estadual e na aprovação.
Sem base comunitária depois, o domínio volta pela difusão — é o desenho.

## Favelas (`src/sim/city/favelas.ts`)
- **Demanda por moradia popular** = 0,45 × (empregos × 1,9) + 1% da população.
- **Déficit** = demanda − moradia popular formal (ZEIS ou valor do solo < 36) − moradores de favela.
- Semanal, com déficit > 40: chegam `min(0,3·déficit, 180 + 4%·pop. informal)` pessoas; nova ocupação quando não há nenhuma (ou 12% de chance, até 1 por 15 mil hab.).
- **Local**: sorteio de 240 pontos; nota = 0,8·declividade + 0,7 (beira d'água baixa) + proximidade de empregos (≤ 1,1 km) + ruído. Precisa estar livre de vias, lotes, equipamentos e de outra favela (160 m).
- **Casas**: 3,3 pessoas/andar; crescem em contorno a partir do núcleo; 2,5%/semana de chance de ganhar um andar (até 4). O grupo dominante nasce do sorteio (no RJ, 45% milícia).
- **Risco de deslizamento** = média de `(declividade − 0,3)·1,3` + 0,25 se beira-rio; × 0,6 urbanizando, × 0,2 urbanizada, × 0,5 com contenção de encostas.
- **Deslizamento** (chuvas: dez–mar; no Nordeste abr–jul): chance diária `risco × 0,0018 × (1 + 2·traço_UF)`; soterra as casas num raio de 9–16 m da casa mais íngreme.
- **Ações**: urbanizar (R$ 11 mil/morador, obra estadual de 10 + pop/450 meses, custeio R$ 120/morador/ano), regularizar posse (R$ 350/morador, prefeitura), remover (R$ 28 mil/família, 1/7 das casas por semana, choque de aprovação).
- **ZEIS**: zona de habitação de interesse social — conjuntos populares que abatem o déficit.

## Mobilidade (`src/sim/city/transporte.ts`) — semanal
1. **Zonas de 256 m** (12×12): moradores, empregos, valor médio do solo.
2. **Vias**: capacidade rua 1.400 / avenida 4.200 veíc./h (−25% com BRT); velocidade livre 30/50 km/h; tempo com **BPR**: `t = t0·(1 + 0,15·(v/c)^4)`.
3. **Coletivo**: um nó por parada; intervalo = tempo de volta ÷ frota (ônibus herda a lentidão do trânsito; BRT/metrô/teleférico não); baldeação a pé até 220 m.
4. **Escolha modal (logit, θ = 0,15/min)** para cada par origem–destino, com custos generalizados em minutos:
   carro `t + 6`; coletivo `t + 2×tarifa`; a pé `1,4·t` (até 2,5 km); vans `1,25·t_carro + 6 min + 11` (9 se regularizadas; indisponível se combatidas).
   Posse de carro = `0,12 + 0,7·valor/100` (0,08–0,85); quem não tem carro escolhe entre os outros três.
5. **Distribuição gravitacional**: viagens ∝ empregos × e^(−0,055·custo composto); trabalhadores = 50% dos moradores.
6. **Alocação**: carros (1,25 pessoa/veículo) e vans (12) no caminho mínimo; 40% no pico; **média sucessiva** com a semana anterior.
7. Saídas: tempo médio, divisão modal, passageiros por linha, lotação, congestionamento (v/c médio por km) → camada Trânsito e carros na tela (sorteados ∝ volume, mais lentos pela BPR).

### Tipos de linha
| | velocidade | capacidade | quem paga | custo |
|---|---|---|---|---|
| Ônibus | 18 km/h | 80 | prefeitura | R$ 90 mil/parada + R$ 650 mil/veículo; R$ 38 mil/veículo-mês |
| BRT (só avenida) | 27 km/h | 170 | Estado (obra) | R$ 22 mi/km + 5 mi/estação; 10 + 2/km meses |
| Metrô | 40 km/h | 1.200 | Estado (obra) | R$ 480 mi/km + 150 mi/estação; 30 + 5/km meses |
| Teleférico | 18 km/h | 10 (cabine a cada 20 s) | Estado (obra) | R$ 75 mi/km + 20 mi/estação |
Receita tarifária = passageiros/dia × 30 × tarifa × 0,8 (gratuidades e integração); o subsídio sai do caixa da capital.

## Políticas das secretarias (Estado, mensal)
| Política | Custo | Efeito principal |
|---|---|---|
| Hospitais por OS | −3% do custeio da saúde | espera −; risco de escândalo (0,6%/mês) |
| Mutirão de cirurgias | R$ 2.500/paciente em 3 meses | fila −13%/mês |
| Tempo integral (0–100%) | R$ 5.500/aluno/ano extra (EM ≈ 4,5% da pop.) | IDEB + e evasão − com atraso |
| Bônus de professores | +3% na folha da educação | IDEB +0,12 |
| Doutrina: confronto / inteligência / prevenção | prevenção: R$ 25/hab/ano na Assistência | ver território e letalidade |
| Câmeras corporais | R$ 5/hab/ano | letalidade policial −40% |
| Integração de dados | R$ 4/hab/ano | roubos − |
| Renda estadual | R$ 150/família na extrema pobreza | pobreza × 0,75 |

Novos indicadores: leitos SUS/mil, fila de cirurgias, evasão no EM, letalidade policial/100 mil, lotação prisional, roubos/100 mil. Saúde, educação e segurança da cidade (cobertura, crime, território) entram nos indicadores estaduais com peso proporcional à população da capital.

## Testes (`tests/fase4.test.ts`)
- Bairro de empregos sem moradia ⇒ favela surge, cresce e semeia domínio
- Operação derruba o domínio; repetir no mesmo lugar é bloqueado; área sem crime não autoriza
- Urbanização vira obra estadual e, concluída, a favela fica urbanizada
- ZEIS cresce e reduz o déficit; cobertura de serviços aparece nos lotes
- Linha de ônibus: passageiros, divisão modal e volumes nas vias
- BRT só em avenida; metrô vira obra e passa a operar
- Save/load determinístico com favelas, território e linhas

---

# Parte IV — Política e personagens (Fase 5)

Código: `src/sim/politica/` (dados puros guardados no `Estado`; o passo político roda todo mês depois do calendário orçamentário).

## Indicadores reais na posse (`npm run fetch-social`)
| Indicador | Fonte | Cálculo |
|---|---|---|
| Mortalidade infantil (‰) | DATASUS: SIM (óbitos < 1 ano) e SINASC (nascidos vivos), 2023, por residência | óbitos ÷ nascidos × 1000 |
| Leitos SUS por mil hab. | DATASUS: CNES, leitos de internação "quantidade SUS", dez/2024 | leitos ÷ população estimada × 1000 |
| Desemprego | PNAD Contínua, SIDRA 4099 (último trimestre) | taxa de desocupação |
| Extrema pobreza (%) | PNAD Contínua, SIDRA 7438 (limites dos percentis da renda domiciliar per capita) | interpolação linear da fração abaixo de R$ 218/mês (linha do Bolsa Família, Lei 14.601/2023) |
| Gini | PNAD Contínua, SIDRA 7435 | — |
Espera na emergência continua estimada pelo IDH, agora corrigida pelos leitos: `3 + (0,82 − IDH)·40 + (1,6 − leitos)·1,5`. Sem o arquivo, tudo volta à estimativa pelo IDH (D-020).

## Assembleia
- **Cadeiras**: CF art. 27 — 3 × deputados federais até 36; acima, 36 + (federais − 12). SP 94, MG 77, RJ 70… UFs com 8 federais: 24.
- **Bancadas** (fração das cadeiras): Centrão 30%, evangélica 12%, bala 11%, empresarial 9%, sindical 8%, ruralista 7% (Sul 11%, Norte/Centro-Oeste 16%), ambientalista 4%, oposição raiz 10% + 5% × complexidade política da UF. Partido sorteado conforme a bancada.
- **Deputado**: ideologia, influência, fisiologismo, abertura técnica, telhado de vidro (oculto), relação com o governo (−1 a 1), reduto (cidade real da UF).
- **Postura inicial**: o governo eleito é de centro-esquerda ou centro-direita (sorteio da UF); partidos próximos e fisiológicos começam na base (relação ≈ +0,45), os de média distância independentes (≈ 0), os distantes na oposição (≈ −0,55).
- Mesma UF ⇒ mesma Assembleia (semente da sigla).

## Propensão a votar com o governo
`u = 1,6·relação + 0,15 + fisiologismo·(aprovação − 50)/40 + Σ pesos_bancada·eixos_projeto − 0,3·max(0, impostos) − 0,2·max(0, déficit) + 0,35·min(0, servidores) − 0,35 (oposição) + favores + 0,15·relação_presidente_ALE + ruído fixo (±0,25)`
- Voto: `u + clima + N(0; 0,32) > 0`, com `clima ~ N(0; 0,3)` comum a todo o plenário.
- **Placar previsto**: P(sim) = σ(1,7u/0,32); intenção "sim" > 0,7, "não" < 0,3, senão indeciso. **Chance** = aproximação normal da soma, integrada no clima (Gauss–Hermite, 3 pontos). É o mesmo número que o editor da LOA mostra.
- CPI: `u = 1,3·relação − 0,7·gravidade + 0,35 + …`; impeachment: `u = 1,5·relação + (aprovação − 40)/22 − 0,8·gravidade + 0,7`.

| Projeto | Quórum | Eixos |
|---|---|---|
| LOA | maioria simples | impostos (pp ponderados), déficit projetado, emendas (% RCL − 0,4%)·150, servidores (reajuste real·10 − reforma) |
| PEC da Previdência | 3/5 | servidores −1,5; déficit −0,8 |
| Operação de crédito | maioria simples | crédito +1; déficit +0,3; emendas +0,25 |
| CPI | 1/3 (assinaturas) | gravidade do escândalo |
| Impeachment | 2/3 | gravidade da crise |

Pesos das bancadas: bala (segurança +1,2, impostos −0,4), evangélica (emendas +0,5, segurança +0,4), ruralista (agro +1,2, ambiente −0,8, impostos −0,8), sindical (servidores +1,4, social +0,6), empresarial (impostos −1,2, déficit −0,6), ambientalista (ambiente +1,3), Centrão (emendas +1,5).

## Negociação (cartas)
| Carta | Custo | Efeito |
|---|---|---|
| Emenda parlamentar | R$ (1,5 + 4·influência) mi × escala | favor geral 0,3 + 0,6·fisiologismo por 12 meses; paga no mês seguinte |
| Obra no reduto | R$ (12 + 30·influência) mi × escala (obra estadual) | favor 0,45 + 0,5·fis. por 18 meses; inaugurada: relação +0,25; parada > 8 meses: −0,35 |
| Cargo no 2º escalão | 2 de capital | favor 0,35 + 0,6·fis.; +1 no loteamento (risco de escândalo +15% cada) |
| Apoio eleitoral | 8 de capital | favor 0,55 na votação; promessa registrada |
| Pressão | 6 de capital | se telhado > 0,55: favor 1,2 (relação −0,2); senão vaza (relação −0,5, aprovação −3) |
| Convencimento técnico | 3 de capital | chance 0,15 + 0,45·Casa Civil + 0,35·abertura técnica; favor 0,6 |
| Ceder secretaria | 5 de capital | partido inteiro: relação +0,3 e favor 0,35; pasta vai para um indicado político |
Escala = RCL ÷ R$ 40 bi (0,4–3). Emendas e cargos podem ser dados à bancada inteira; ≥ 4 cargos de uma vez rendem notícia de "porteira fechada".

## Capital político
Mensal: `+1 + (aprovação − 45)/15 + 2·(competência da Casa Civil − 0,5)`, de 0 a 100. Votação vencida +4, perdida −6. Trocar secretário −3.

## Relação dos deputados (mensal)
Converge 4%/mês para `postura + (0,5 + fisiologismo)·(aprovação − 50)/120 + 0,12·pastas do partido` (base 0,4; independente 0; oposição −0,5).

## Secretários
- 11 cargos: Casa Civil + uma pasta por área. Perfis: técnico (competência 0,62–0,92), indicação política (0,3–0,65, honestidade 0,2–0,85, traz o partido), confiança (lealdade 0,75–0,98).
- **Competência**: soma `0,35·(competência − competência na posse)` ao esforço de gasto da pasta; na Fazenda, ICMS × `1 + 0,05·Δcompetência`.
- **Escândalo**: chance mensal `(1 − honestidade)²·0,012·(1 + 0,15·loteamento)·(1,4 se político)`. Cadeia: imprensa → no mês seguinte, pedido de CPI (assinaturas ≥ 1/3; o presidente da ALE aliado engaveta com 50%) → CPI de 4 meses → indiciamento se gravidade > 0,95. Gravidade > 1,25: 25%/mês de operação da PF. Demitir o acusado antes do pedido de CPI corta pela metade o peso do escândalo nas assinaturas e reduz o choque de uma eventual prisão ou indiciamento.
- Lealdade < 0,35: vazamentos (−4 de capital). Lealdade < 0,3 com aprovação < 30: pedido de demissão. Ambição > 0,6: deixa o cargo em abril do ano eleitoral (desincompatibilização). Cargo vago: interino técnico (competência 0,45).

## Mesa Diretora e impeachment
- Fevereiro do 3º ano da legislatura: nova eleição da Mesa; o candidato do Palácio vence com probabilidade 0,2 + base aliada.
- Crise = `(25 − aprovação)/8` (se < 25) + 0,35 por escândalo ativo + 0,8 (salários atrasados) + 0,4 (pessoal acima de 49% da RCL). Com crise > 1, a oposição protocola (12%/mês); o presidente aceita se a relação dele < −0,1 ou crise > 2,2. Votação no mês seguinte; 2/3 ⇒ governador afastado (fim de jogo).

## Testes (`tests/fase5.test.ts`)
Indicadores reais na posse; cadeiras pela CF; Assembleia determinística por UF; PEC na pauta, negociação aumenta a chance, votação no mês seguinte e emendas pagas; crédito precisa de autorização; LOA na pauta e votada em dezembro; obra no reduto vira obra estadual; nomeação e cessão de pasta; escândalo → CPI; impeachment com presidente hostil; quórum de CPI; save/load da política.

---

# Parte V — Eventos, clima, festas e atores (Fase 6)

## Clima diário (`src/sim/clima/clima.ts`)
Normais mensais da capital (ERA5 1991–2020 via Open-Meteo; `npm run fetch-clima`): temperatura média/máx./mín., chuva do mês, dias com chuva ≥ 1 mm, P99 da chuva diária, P95 da máxima. Sem o arquivo, há um clima sintético pela latitude e pela região.
- Normais interpoladas entre o mês e o vizinho (transição suave).
- **Chuva**: cadeia de Markov de 2 estados com a mesma frequência estacionária das normais (p₁ = 1,35p após dia chuvoso; p₀ = p(1−p₁)/(1−p)). Volume exponencial com média ajustada para que os temporais (3,5% dos dias chuvosos, até 1,5×P99) não inflem a chuva do mês.
- **Temperatura**: anomalia AR(1) (0,82·a + 0,9·N(0,1)); dia chuvoso é mais fresco.
- **ENSO** (sorteado em 1º de julho: 25% El Niño, 25% La Niña): El Niño → Sul chuva ×1,35; Norte/Nordeste ×0,6 na estação chuvosa e mais calor. La Niña → Sul ×0,65; Norte/Nordeste ×1,25.
- **Enchente** (0–1): pico = max(chuva/P99, chuva3d/(1,7·P99)); `(pico − 0,75)·1,4·(1 − 0,6·drenagem)`, decai 32%/dia. Contenção de encostas concluída conta como drenagem 0,35.
- **Estiagem**: déficit de 60 dias contra 75% do normal (só quando o normal é chuvoso). **Secura** visual: chuva de 30 dias < 70 mm, pesada pelo bioma (Caatinga 1,3; Cerrado/Pantanal 1,15; Amazônia 0,6).
- **Onda de calor**: dias seguidos com máxima > P95 − 0,5°C. **Fumaça**: biomas de fogo, julho a outubro, cresce com a secura (+50% no El Niño), chuva > 5 mm lava. **Ressaca**: litoral Sul/Sudeste, maio–setembro, 3,5%/dia, dura 2–4 dias. **Geada**: mínima abaixo de 3°C.
- No primeiro dia, o histórico de 60 dias começa com a chuva normal de novembro/dezembro.
- Efeitos na cidade: estiagem tira até 35% da capacidade de água; calor tira até 18% da de energia; deslizamentos passam a depender da chuva de 3 dias (`20·max(0, chuva3d/P99 − 0,4)²`); dengue com chuva de 30 dias > 90 mm e temperatura > 22°C. No Estado: estiagem reduz o PIB (−2 p.p. × (0,5 + traço agro)).

## Festas (`src/sim/eventos/festas.ts`)
Datas reais a partir dos nomes em `data/ufs/traits.json`: Carnaval começa na sexta, 51 dias antes da Páscoa (algoritmo de Meeus); Festa da Penha 8 dias depois da Páscoa; Círio no 2º domingo de outubro; São João 20–25/6; Parintins no último fim de semana de junho; Réveillon em 31/12 para todos; Nordeste sempre tem São João; quem não tem Carnaval famoso tem "Carnaval de rua". Cada festa tem tipo (carnaval, junina, boi, réveillon, religiosa, cultural, agro, show) e peso turístico.

## Storylets (`data/events/*.json`, motor em `src/sim/eventos/motor.ts`)
168 eventos em 14 categorias. Cada um tem condições (`se`), texto com variáveis, efeitos imediatos e/ou escolhas com efeitos e consequências atrasadas (`depois`: meses, chance, condição).
- **Condições** (mini-linguagem): `var >= n`, `<=`, `>`, `<`, `==`, `!=`, `var in a,b`, `var notin a,b`, `lista has x`, `var` (verdadeiro), `!var`, `flag nome`, `!flag nome`. Variável ausente ⇒ falso (eventos do Estado não disparam no sandbox).
- **Variáveis** (`Simulation.contextoEventos`): tempo (mes, ano, dia, anoMandato, eleicao), UF (uf, regiao, bioma, litoral, rio, relevo, tracos), clima (chuvaHoje, chuva3d/7d/30d, temp, tMax, tMin, diasCalor, enchente, estiagem, secura, calor, fumaca, ressaca, geada, enso, alerta, periodo, estacao), festa (festa, festaComeca, festaTurismo), capital (pop, aprovCidade, caixaCidade, desempCidade, crime, cobSaude/Edu/Seg, favelas, favelaRisco, popInformal, territorio, guerra, esgoto, agua, energia, congest, desloc, linhas, metro, poluicaoAgua), Estado (aprovacao, caixaRcl, pessoalPct, dclPct, regime, capag, rrf, duodecimos, base, capitalPol, homicidiosRel, esperaRel, filaRel, desemprego, pobreza, ideb, greve, escandalos, cpi, reformada, petroleo), atores (prefeitoRel, prefeitosRel, presidenteRel, alinhamento, presidentePop, imprensa, publicidade, forcaNacional, calamidade) e flags.
- **Efeitos**: aprovacao (choque estadual, ou da capital sem Estado), grupos, aprovacaoCidade, caixa (fração da RCL), caixaCidade (R$, entra no balanço do mês), capital, base, bancadas, prefeito, prefeitos, presidente, imprensa, indicadores (choque relativo: desloca 25%·c por mês e decai 20%/mês), pib (decai 15%/mês), crime (soma na criminalidade dos lotes, decai 3%/dia), flag/limparFlag, greve, calamidade, forcaNacional, visual (tipo + dias).
- **Disparo**: diários (tempo, desastres, festas) com `chance` por dia, no máximo um por dia; mensais: 0 (15%), 1 (51%) ou 2 (34%) sorteados por peso entre os elegíveis. Cooldown em meses; `unico` dispara uma vez.
- **Decisões**: eventos com escolhas viram pendências com prazo (`prazoDias`, padrão 20); sem resposta, aplica-se a escolha `padrao` e o histórico registra "(sem resposta)".

## Prefeitos, União e imprensa (`src/sim/atores/atores.ts`)
- **Prefeitos** das 8 maiores cidades (nomes e populações reais das cidades; pessoas fictícias). Relação converge 5%/mês para: postura do partido (base +0,35; oposição −0,35) + (aprovação − 50)/150 + convênios recebidos. O prefeito ambicioso da capital vira rival a partir de 2029 (−0,35).
- **Convênio**: até 0,4% da RCL, pago no mês seguinte (despesa "convênios"); relação + valor/(R$ 25 mi × escala), limitada a +0,3.
- **Presidente**: aliado (40%), neutro (35%) ou opositor (25%); relação converge para +0,45/0/−0,4. Transferências voluntárias × `1 + 0,12·(relação − relação na posse)`. Pedidos (3 de capital): Força Nacional (4 meses, homicídios −10%; só com violência acima da posse ou enchente), verba federal (1×/ano, 0,3% da RCL), socorro com calamidade decretada (0,5% da RCL × (0,6 + 0,8·chance)); chance = σ(3·(relação ± 0,25 pelo alinhamento + 0,1)). Elogiar/criticar: ±0,25/0,3 de relação e choque de aprovação proporcional à popularidade do Presidente no estado.
- **Imprensa**: TV Guará, O Pregoeiro, Plantão N27, Holofote Investiga, @vozdaquebrada e um grupo de WhatsApp — alcance, credibilidade, viés e humor. Humor converge 10%/mês para `viés·0,4 + (aprovação − 50)/80 − escândalos·(0,12; blog 0,25) + efeito da publicidade` (TV/portal/influenciador +0,3 com verba máxima; blog −0,15). **Amplificador** = média ponderada de −humor; choques ruins × (1 + 0,35·amp), bons × (1 − 0,25·amp). Verba acima de R$ 4 mi × escala por mês: 8%/mês de virar escândalo.
- **Coletiva** (1×/mês): chance de ir bem = 0,35 + (aprovação − 40)/60 + 0,3·(Casa Civil − 0,5); ±0,06 no humor de todos.
- **Pesquisa Instituto Pulso** mensal: aprovação + N(0; 1,3), margem 2,5 pontos; variação ≥ 4 pontos vira notícia.
- As notícias saem atribuídas a um veículo: as ruins tendem aos mais críticos.

## Visual (`src/render/city/climaVisual.ts`, `ClimaFx.tsx`)
Chuva convectiva só entre 14h e 20h no verão (fora do Nordeste); céu e névoa acinzentam com as nuvens; raios com clarão; fumaça tinge a névoa e o sol; secura amarela o capim e a geada embranquece de manhã (shader do terreno); ressaca aumenta ondas e espuma e a enchente deixa a água barrenta (shader da água); a enchente cobre de água barrenta as células de terra abaixo do nível; apagão desliga janelas e postes; Carnaval com confete e fogos à noite; São João com bandeirinhas sobre as ruas; Réveillon e shows com fogos.

## Testes (`tests/fase6.test.ts`)
Biblioteca (≥150, ids únicos, todas as condições compilam e só usam variáveis do contexto, todos os textos só usam variáveis conhecidas); mini-linguagem; clima (verão mais quente, chuva anual a ±35–45% da normal); datas de festas (Páscoa 2027 e 2030, Carnaval, Círio); motor (prazo e escolha padrão, consequência agendada); um ano no RJ (festa, decisão por comando, fontes das notícias, pesquisas, save/load determinístico); clima sintético; atores (prefeitos, convênio e publicidade como despesa, amplificador da imprensa).

---

# Parte VI — Eleição e fim de mandato (Fase 7)

Código: `src/sim/eleicao/eleicao.ts` (motor), `legado.ts` (fim de jogo); o calendário roda todo dia em `Estado.diario`.

## Eleitorado (`npm run fetch-eleitorado`)
TSE, perfil do eleitorado da eleição de 2022 (CSV por UF): soma por município o total de eleitores e as frações de 16–29 anos, 60+, ensino superior, baixa escolaridade (analfabeto, lê e escreve, fundamental incompleto) e mulheres. Os nomes são casados com a malha do IBGE (exatos primeiro, depois a grafia mais parecida e dois apelidos oficiais). 5.570 municípios, 156,5 milhões de eleitores.

## Calendário (ano eleitoral: 2030, 2034…)
| Data | O que acontece |
|---|---|
| março | pré-candidatos; pesquisa mensal no dia 15 até julho |
| 3 meses antes do 1º turno | condutas vedadas (Lei 9.504, art. 73): sem convênios com prefeituras e sem publicidade institucional |
| 20/7 – 5/8 | convenções: reeleição (só no 1º mandato) ou sucessor; sem decisão, o partido registra a reeleição (ou o primeiro nome da sucessão) |
| 5/8 | coligações e tempo de TV |
| 16/8 | campanha oficial: semana a semana, pesquisa semanal |
| 30/8 até a antevéspera | horário eleitoral gratuito |
| 1º turno − 10 dias | debate na TV (resposta até 2 dias depois; senão, cadeira vazia) |
| 1º domingo de outubro | 1º turno; maioria absoluta dos válidos elege |
| último domingo de outubro | 2º turno (debate 5 dias antes); eleição presidencial no mesmo dia |
| 6 de janeiro | posse (EC 111/2021): 2º mandato com Assembleia e Presidente novos, ou fim de jogo |

## Candidatos
O governador (ou o sucessor escolhido na convenção), o prefeito da capital se for ambicioso e distante do governo, o líder da oposição na ALE, um nome de fora da política e uma candidatura ideológica. Ideologias de candidatos = 0,75 × a do partido.

## Coligações e horário eleitoral
Partidos sem candidato: os fisiológicos vão com quem lidera em 5/8 (ou com o governo se a aprovação ≥ 45%); a base vai com o governo (se a aprovação > 30%); os demais, com o candidato de ideologia mais próxima. Tempo de TV = 10% dividido igualmente + 90% proporcional às cadeiras da coligação (a ALE faz o papel da Câmara na regra da Lei 9.504).

## Voto por município
Utilidade de cada candidato no município:
`u = 0,8·carisma + 0,2·ln(TV + 0,05) + ímpeto − 0,45·|ideologia − inclinação| − desgaste + força local + agenda + incumbência + cabos eleitorais + ruído fixo`
- Inclinação do município = inclinação regional suave (Nordeste −0,25; Norte +0,05; Sudeste +0,05; Sul +0,25; Centro-Oeste +0,3) ± 0,25 de ruído local.
- Força local: reduto +0,25; prefeito da capital +0,25 na capital.
- **Incumbência**: governador +0,35 + desempenho; sucessor +0,12 + 0,6·desempenho. Desempenho = (aprovação local − 45)/18 − 0,05·crises, com a aprovação local ponderando baixa renda (0,35 + 0,8·baixa escolaridade), classe média (0,25 + 1,2·superior), servidores (0,05) e empresariado (0,03); crises = escândalos ativos + ½·greves + salários atrasados.
- Prefeitos das 8 maiores cidades: aliado (> 0,3) +0,22 para o governo na cidade, hostil (< −0,3) −0,15.
- Agenda: cada visita +0,16 no município (até 0,45), decai 6%/semana; 3 visitas por semana.
- 2º turno: +0,12 por apoio de eliminado.
- Escolha: logit com τ = 0,5. Pesquisas usam a parte determinística (+ ruído do instituto, indecisos de 4% a 28% conforme a distância da eleição).
- **Urna**: erro das pesquisas N(0; 0,07) por candidato + ruído local; abstenção 17% + 12%·(idosos − 20%) (+1,5 p.p. no 2º turno); brancos e nulos 6,5% do comparecimento (+2 p.p. no 2º turno).

## Campanha
- Semana: ímpeto × 0,9 + N(0; 0,025). Horário eleitoral do jogador: efeito do tema × (0,6 + 2·TV): obras (+0,012 por obra entregue), saúde (−0,25·Δespera − 0,12·Δfila), segurança (−0,3·Δhomicídios), educação (+0,15·ΔIDEB), emprego (−2,5·Δdesemprego), emoção (+0,025), ataque (−0,06 no rival, +0,025 de desgaste próprio). Tema que contradiz os dados tira votos.
- Adversários: quem está atrás ataca o líder (45%/semana), o líder faz propostas; visitam reduto e grandes cidades.
- **Debate**: 4 perguntas (jornalista sobre o indicador que mais piorou, ataque do principal adversário, pergunta de eleitor, considerações finais), 3 respostas cada com efeito oculto (dados que não batem com a realidade são desmentidos). Soma vai para o ímpeto; cadeira vazia: −0,08.
- **Apoios no 2º turno**: eliminados apoiam o finalista mais próximo se a distância ideológica < 0,45; o jogador pode pedir (6 de capital; chance 0,75 − 0,9·distância).

## Rejeição (pesquisas)
`18 + 30·|ideologia| + 25·desgaste − 10·carisma` + (55 − aprovação)·0,6 para o governador (0,35 para o sucessor), entre 8% e 75%.

## Fim de jogo e legado
Derrota do governador, eleição ou derrota do sucessor, fim do segundo mandato (CF art. 14 §5: uma reeleição) ou impeachment encerram o governo. O legado compara indicadores da posse ao fim, contas (caixa, dívida/RCL, pessoal/RCL, crescimento real do PIB), obras entregues, votações vencidas, CPIs, escândalos, eleições e conquistas (16 critérios: reeleito no 1º turno, fez o sucessor, pacificador, zerou a fila do SUS, IDEB +0,4, mão de ferro fiscal, sobreviveu a 3 CPIs, reformista, rolo compressor, tocador de obras…).

## Testes (`tests/fase7.test.ts`)
Eleitorado casado com as malhas; datas dos turnos (2030 e 2034); mandato completo no AC (candidatos, pesquisas, convenção, debates, apuração com contabilidade da urna, 2º turno, posse ou legado); voto cresce com a aprovação e com a agenda; condutas vedadas; debate; sucessor obrigatório no 2º mandato; reeleição renova a ALE e o Presidente; save/load da eleição; legado após impeachment.

---

# Parte VII — Os 27 estados: municípios, biomas, arquitetura e trilha (Fase 8)

## Municípios jogáveis (`npm run fetch-municipios`)
Para os 8 maiores municípios de cada UF (216 no total), `scripts/fetch-municipios.ts` gera `public/data/municipios/{UF}.json`:
- **Sede**: coordenadas da base aberta kelvins/municipios-brasileiros (dados do IBGE).
- **Relevo**: grade 11×11 de altitudes num quadrado de 6 km centrado na sede, por interpolação bilinear nos tiles Terrarium z11 (~76 m/px). Mar = altitude ≤ 0.
- **Distância do mar**: pontos do contorno do Brasil (malha do IBGE) que não são fronteira internacional.
- **Terreno**: mais de 4% de mar na grade → litoral (com morros se o desnível P90−P10 passar de ~117 m; mar aberto se mais de 45% é água, senão baía; o lado da água é o centróide dos pontos de mar). Senão: relevo forte → serra; altitude média > 520 m → planalto; Norte abaixo de 90 m → várzea; senão planície com rio. A capital mantém o terreno curado em `traits.json`.
- **Bioma** (D-045): Pantanal (MT/MS na planície baixa), Pampa (sul do RS), Amazônia (Norte exceto TO, norte de MT, oeste e Ilha de São Luís no MA), semiárido → Caatinga (interior do NE a mais de 110 km do mar, agreste acima de 300 m a mais de 80 km, litoral norte potiguar) ou Cerrado (oeste do NE, MA, norte de MG), Mata Atlântica (faixa costeira, Sul/Sudeste, MG ao sul de 19° S), senão Cerrado.
- **Clima** (D-046): as normais ERA5 da capital ajustadas — temperatura −0,62 °C a cada 100 m acima da capital; chuva × fator do semiárido (cai com a distância do mar no interior do Nordeste). `ajustarClima` (src/data/municipios.ts) soma a temperatura e escala a chuva (dias de chuva × f^0,7, temporal P99 × f^0,5).

## Na partida
A seleção de estado mostra os municípios jogáveis; a escolha define nome da cidade, terreno, bioma, latitude (sol), semente do mapa e clima. O Estado continua o mesmo (orçamento, ALE, prefeitos — o prefeito da capital ainda é o rival natural). A cidade escolhida vira o **reduto eleitoral do governador** (+0,25 de utilidade no voto daquele município). Saves antigos não têm `capital` no init e são tratados como capital.

## Flora por bioma (`render/city/Arvores.tsx`)
| Bioma | densidade | altura | copa | palmeiras | cactos | ipês |
|---|---|---|---|---|---|---|
| Mata Atlântica | 1 | 1 | 1 | 1,5% | — | 3,5% |
| Amazônia | 1,25 | 1,45 | 1,15 | 6% | — | 1,2% |
| Cerrado | 0,55 | 0,62 | 1,15 (baixas e largas) | 3% | — | 7% |
| Caatinga | 0,68 | 0,5 | 0,75 | 1% | 20% (mandacaru) | 2% |
| Pampa | 0,28 | 1 | 0,95 | — | — | 1% |
| Pantanal | 0,6 | 0,9 | 1,2 | 20% (carandá/acuri) | — | 5% |
O mandacaru é um tronco com dois braços em candelabro (malha instanciada própria). As cores das copas por bioma e a secura sazonal (Fase 6) continuam valendo.

## Arquitetura regional (`render/city/estilos.ts`)
Sete estilos aplicados às casas, prédios, telhados e muros: casario colonial colorido (BA, MA, PE, AL, SE, PB, MG), sertão com varandas (CE, RN, PI), amazônico de madeira e zinco (Norte), modernista (DF, TO), agro (GO, MT, MS), metrópole (SP, RJ, ES) e europeu do Sul com tijolo à vista e telhados escuros 1,7× mais íngremes (PR, SC, RS). Cada estilo define a fração de casas com cores vivas e com telhado de telha.

## Trilha sonora procedural (`src/audio/`)
Tudo sintetizado na Web Audio API — sem arquivos de áudio. Os termos de `traits.trilha` são mapeados para 29 gêneros (samba, bossa, ijexá, axé, forró, xote, frevo, maracatu, manguebeat, carimbó, guitarrada, tecnobrega, boi, sertanejo, moda de viola, rasqueado, chamamé, polca paraguaia, milonga, reggae, rock, MPB, choro, funk, rap, coco, ciranda, batuque, valsa/polca de colônia, flautas e maracás). Cada gênero é dado: andamento, compasso (2/4, 3/4, 4/4), swing, escala (inclui o modo nordestino mixolídio com 4ª aumentada), progressões e padrões de bateria/baixo/acompanhamento em texto.
- **Composição**: a cada faixa o motor sorteia tom, duas progressões e dois motivos de 2 compassos (passeio na escala puxado para notas do acorde nos tempos fortes, fim na tônica). Forma: intro 4 · A 8 · B 8 · A 8 · respiro 4 · B 8 · A ≥4 · acorde final (44–52 compassos), depois troca para o próximo gênero da UF.
- **Síntese**: sanfona (2 serrotes desafinados + vibrato), flauta/pífano (seno + sopro filtrado), metais (filtro que abre no ataque), cordas dedilhadas (viola com cordas em oitava, violão, cavaco, harpa, piano), guitarra limpa e distorcida (waveshaper), pads; 18 vozes de percussão (zabumba e bacalhau, triângulo aberto/abafado, agogô, alfaia, gonguê, pandeiro, matraca…). Reverb por convolução e compressor no mestre.
- **Contexto**: à noite −8% de andamento, melodia uma oitava abaixo e filtro mais escuro; o Carnaval toca o ritmo da terra (frevo em PE, axé na BA, carimbó no Norte, samba nos demais) e o São João toca forró (boi no MA/AM/PA); chuva vira ruído filtrado no canal de ambiente.
- O áudio só começa no primeiro clique/tecla (política de autoplay). Volumes no menu de pausa, salvos nas preferências.

## Testes (`tests/fase8.test.ts`)
As 27 UFs com municípios e capital curada; biomas e relevo plausíveis (Campina Grande e Petrolina na Caatinga, Corumbá no Pantanal, Pelotas no Pampa, Sinop na Amazônia, Vitória da Conquista em planalto 5 °C mais fria que Salvador, Juazeiro semiárido); ajuste de clima; terreno gerado para municípios variados; reduto eleitoral na cidade construída; estilos por UF; gêneros por UF e festas; padrões de todos os gêneros bem formados.

---

# Parte VIII — Modo Presidente e nuvem (Fase 9)

Código: `src/sim/presidente/` — `economia.ts` (macro), `presidencia.ts` (Planalto), `dados.ts` (medidas, ministérios, inclinação das UFs), `biblioteca.ts` (storylets em `data/events-presidente/`), `store.ts` (loop na thread principal). A Presidência é só dados (serializa em JSON); um passo = um dia; no dia 1 de cada mês roda a economia, a aprovação, as relações, os eventos e a série histórica.

## Ponto de partida real (`npm run fetch-macro`)
SGS do Banco Central: Selic meta, IPCA 12 meses, PTAX, desocupação (PNAD), dívida bruta (DBGG) e líquida, NFSP primária e nominal em 12 meses, PIB mensal e crescimento anual; Focus: IPCA do ano seguinte e de longo prazo. Composição do orçamento primário do governo central curada do RTN 2025 (% do PIB). Eleitorado por UF somado dos arquivos do TSE.

## Economia (mensal)
| Variável | Equação |
|---|---|
| Hiato h | h' = 0,93h − 0,03(Selic − πᵉ − 5,25) + 0,3·Δdespesa + 0,06·commodities − 0,6·Δrisco + choques + ruído |
| Crescimento | potencial 2% + (h − h de 12 meses atrás) |
| Inflação π (12m) | π' = π + 0,12(πᵉ − π) + 0,035h + 0,1·Δcâmbio(%) + choques |
| Expectativa πᵉ | πᵉ' = πᵉ + 0,08(π − πᵉ) + 0,06·cred·(meta − πᵉ) + 0,4·Δrisco + 0,01·Δcâmbio(%) |
| Câmbio | ln e' = ln e + 0,08(ln e* − ln e) + 0,022ε; e* = e₀·exp(0,4(risco − 0,45) − 0,025(Selic − Fed − 10) − 0,5·commodities) |
| Desemprego | u' = u + 0,12(6,2 − 0,45h − u) |
| Receita | 18,6 + medidas + 0,12h + 0,6·commodities (% PIB) |
| Dívida bruta | d' = d + [d(i − g)/(1 + g) − primário]/12; i = juro implícito inicial (juros nominais ÷ dívida) + 0,55·ΔSelic; g = PIB real + IPCA + 0,8 |
| Risco fiscal | logística de 0,07(d − 82) − 0,9(primário + 0,6) + 1,2·desvio da meta − 1,5(cred − 0,72) |
| Copom (8×/ano) | alvo = 5,25 + πᵉ + 1,5(πᵉ − meta) + 0,5h + 0,8·viés do presidente do BC + 2(risco − 0,45); anda metade da distância, em passos de 0,25 p.p. (máx. 1 p.p.) |

Sem jogador, quatro anos levam a PIB de 1–2,5%, IPCA perto de 4%, Selic caindo para 10–11% e dívida bruta de 83% para ~95% do PIB (`scripts/diag-economia.ts`).

## Orçamento e arcabouço (LC 200/2023)
Despesa executada = orçamento base por programa + medidas em vigor − contingenciamento (investimentos, custeio e emendas) + gastos extras. A Previdência cresce 0,07 p.p. do PIB por ano; o seguro-desemprego segue o desemprego. O PLOA do ano seguinte é editável até 31/08, precisa caber no limite (que cresce 70% do crescimento real, entre 0,6% e 2,5%) e respeitar pisos de saúde e educação; o Congresso vota em dezembro (sem LOA, duodécimos). Metas de primário: 0; 0,25; 0,5; 1,0% do PIB, com tolerância de 0,25 p.p. Meta descumprida aciona gatilhos (sem despesa nova no ano), tira credibilidade e conta como crime de responsabilidade em potencial.

## Congresso
Câmara com 513 deputados por UF (LC 78/1993) e Senado com 81 (3 por UF), bancadas temáticas como na Assembleia (Fase 5), ajustadas pela inclinação da UF. A postura dos partidos nasce da distância ideológica ao partido do(a) Presidente; ministérios cedidos trazem partidos para a base. As votações usam a mesma propensão e placar da Fase 5. Formas: MP (vale na hora, caduca em 120 dias, até 6 por ano; presidente da Câmara hostil pode engavetar), PL (maioria), PLP (maioria absoluta), PEC (3/5 em dois turnos em cada Casa). Articulação por proposta: café com líderes, emendas, cargos (risco de escândalo), urgência, retirada. 17 medidas com efeitos fiscais, macro, de aprovação, regionais e de risco constitucional.

## STF
11 ministros com idade e ideologia; aposentadoria aos 75 abre vaga; o Planalto escolhe entre três perfis e o Senado sabatina (41 votos). Medidas com risco constitucional sofrem ação da oposição (chance 0,2 + 0,8·risco); liminar suspende a lei se o risco passa de 0,35. No julgamento, cada ministro vota pela derrubada com p = σ(5(risco − 0,4) − 1,4(afinidade − 0,5) − 0,7·[indicado por você]); 6 votos derrubam.

## Banco Central
Autônomo (LC 179/2021): o presidente herdado tem mandato até o fim do 2º ano do governo; em outubro desse ano o Planalto indica entre ortodoxo, moderado e desenvolvimentista (efeitos na credibilidade, nas expectativas e no viés do Copom). O Planalto pode criticar a Selic, pedir swap cambial (só com o dólar disparado) e mudar a meta no CMN (3%, 3,5% ou 4%).

## Aprovação
Núcleo nacional = 47 + lua de mel − 2,4(π − 4,5) − 2(u − 6) + 1,2(PIB − 2) + 6(transferência de renda − 1,4% PIB) − 3·escândalos + choques − penalidade por desvalorização forte. Por UF: + 10·inclinação·ideologia do governo − 4·inclinação·"lado" das medidas + 3·relação com o governador + visitas/obras + 6 no estado de origem. A nacional é a média ponderada pelo eleitorado.

## Eleição presidencial
Ano 4 de cada mandato; 1º turno no 1º domingo e 2º turno no último domingo de outubro; posse em 5 de janeiro (EC 111/2021). Candidatos: o(a) Presidente ou sucessor(a), a oposição ideológica, um nome de centro e um outsider. Voto por UF em logit multinomial (τ = 0,5): carisma − 1,3·|ideologia − 0,8·inclinação| e, para o governo, 0,05(aprovação na UF − 45) + 0,18·visitas de campanha + 0,3 no estado de origem. Reeleito: novo Congresso. Impeachment: aprovação < 22%, crime (2 metas descumpridas ou escândalos) e presidente da Câmara hostil; 342 votos na Câmara e 54 no Senado.

## Nota do legado (ranking)
0,45·aprovação + 6(2 − |π − meta|) + 2,5·PIB − 1,2(u − 6) − 0,8·Δdívida + 4·Δprimário − 3·metas descumpridas + 20; +10 pelo 2º mandato, +8 pelo sucessor eleito, −25 por impeachment.

## Nuvem (Supabase)
Opcional: `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`. Tabelas `saves` (do jogador, RLS por `auth.uid()`) e `ranking` (leitura pública, escrita do dono), em `supabase/migrations/`. Login anônimo (convidado) ou link mágico por e-mail. Saves vão em gzip + base64.

## Testes (`tests/fase9.test.ts`)
Dados do BC e do TSE; Copom e risco fiscal; trajetória de 4 anos plausível; instituições na posse; MP que caduca; PEC em 4 votações; vaga e sabatina no STF; gatilhos do arcabouço; calendário e eleição por UF em 2030; biblioteca de 43 storylets (condições e variáveis); save/load determinístico; compressão dos saves e políticas RLS da migração.

---

# Parte IX — Polimento, tutorial, conquistas e balanceamento (Fase 10)

## Performance
- **Carregamento sob demanda**: a cidade (render + simulação), a Presidência (motor e 43 eventos), a trilha sonora e o cliente do Supabase viram pedaços separados do bundle. Bundle inicial: 2,49 MB → 1,71 MB (−31%); o menu e o mapa do Brasil abrem antes.
- **Qualidade gráfica** (`src/render/qualidade.ts`): alta (DPR até 1,75, sombras 4096, AO + bloom + SMAA), média (DPR até 1,25, sombras 2048, bloom + SMAA), baixa (DPR 1, sem sombras, só tone mapping e vinheta). No modo automático, o `PerformanceMonitor` do drei desce um nível quando o FPS cai abaixo de ~38 e sobe acima de ~58; depois de 3 trocas, fixa em média.

## Tutorial com assessor (`src/ui/assessor/`)
- Dois personagens fictícios: **Celina Rocha**, chefe de gabinete (cidade e governo estadual), e **Otávio Lins**, ministro-chefe da Casa Civil (Presidência).
- Roteiro em passos que **avançam sozinhos** quando o jogador faz o que foi pedido (traçar uma via → lotes existem; zonear → lotes zoneados; água e luz → capacidade nas duas redes; abrir o Palácio; enviar uma medida; clicar num estado…) ou com um botão nos passos informativos. Os passos do Palácio só aparecem com governo estadual (não no sandbox).
- **Dicas de contexto**, uma vez cada: falta de luz ou água, esgoto sem tratamento, caixa negativo, janela da LOA, alertas do Tesouro, decisões acumuladas, ano eleitoral, aprovação baixa; na Presidência, meta fiscal em risco, dólar disparando, base fraca, MP caducando, vaga no STF, indicação do BC, gatilhos e ameaça de impeachment.
- Progresso no navegador (`nacao27:tutorial`); pode ser recolhido, desligado ou recomeçado nas Opções.

## Conquistas permanentes (`src/conquistas/`)
31 conquistas em quatro categorias — cidade (8), governo estadual (7), Presidência (11) e Brasil (5) — checadas a cada 2 s a partir do estado do jogo e guardadas no navegador (`nacao27:conquistas`). As de "Brasil" vêm do registro de partidas: UFs, regiões e biomas jogados, cidade no interior e carreira até o Planalto. Aviso no topo da tela ao desbloquear; galeria no menu com progresso. As conquistas por mandato da tela de legado continuam.

## Acessibilidade
Tamanho da interface (80–150%), paleta para daltonismo, **alto contraste** (painéis opacos, textos secundários mais claros, sem desfoque), **reduzir movimento** (respeita `prefers-reduced-motion`: sem animações de interface, câmera parada no menu, raios sem clarão), foco visível no teclado, rótulos para leitores de tela nos controles de velocidade e menu, avisos com `aria-live` e interruptores com `role="switch"`. Tudo na tela **Opções** (menu e menus de pausa).

## Balanceamento (`scripts/diag-balanceamento.ts`)
Três estilos de jogo na Presidência × 8 sementes, um mandato:
| Estilo | Metas cumpridas | Aprovação final | Reeleição | Dívida/PIB final |
|---|---|---|---|---|
| Piloto automático | 0/4 | 40% | 1/8 | 96% |
| Gastador (renda, investimentos, isenção do IR) | 0/4 | 44% | 3/8 | 99% |
| Ajuste (contingenciamento, PLOA enxuta, dividendos, PEC fiscal) | 1,6/4 | 48% | 7/8 | 90% |
Ajustes da Fase 10: a crise fiscal pesa na aprovação (−6 por ponto de risco acima de 0,55 e −1 por meta descumprida), a transferência de renda vale mais (10 pontos por p.p. do PIB), o carisma de quem busca a reeleição caiu de 0,35 para 0,3 e a trajetória de metas ficou 0; 0,25; 0,5; 0,75% do PIB.

## Testes (`tests/fase10.test.ts`)
Catálogo e armazenamento de conquistas, registro de partidas, conquistas da Presidência; roteiros do assessor (ids, avanço por ação, passos só com Estado, dicas que avaliam); qualidade automática nos limites; regressão de balanceamento (ajuste rende mais aprovação e menos dívida que o piloto automático).

---

# Parte X — Cidades reais (Fase 11)

## Dados (`npm run fetch-cidades`)
`scripts/fetch-cidades.ts` gera `public/data/cidades/{IBGE}.json` para as 27 capitais (ou qualquer município jogável com `-- <IBGE…>` / `--todos`), centrado na sede:
- **Relevo**: tiles Terrarium z14 (~9,5 m/px), grade de 16 m sobre o mapa inteiro (6.144 m). No litoral o mar fica ≤ 0; no interior subtrai-se a altitude da parte mais baixa (−4 m), e rios, lagos e represas do OSM são rebaixados abaixo de 0.
- **OpenStreetMap**: dos extratos regionais da Geofabrik (`data/osm-cache/{regiao}.osm.pbf`, lidos uma vez em fluxo por `scripts/lib/geofabrik.ts`) ou, se não estiverem lá, pelo Overpass. Ruas e prédios na área construível (3.072 m); água, mata, parques e uso do solo no mapa inteiro.
- **Ruas → grafo do jogo**: nós nos cruzamentos e pontas; cada via é cortada a cada ~140 m ou 35° de curva em arestas curvas (ponto de controle passando pelo meio do trecho); nós a menos de 6 m são fundidos. Tronco/primária/secundária viram avenida; o resto, rua. Os nomes são os reais.
- **Prédios**: OSM primeiro (tipo pela etiqueta `building`/`amenity`/`shop` ou pelo uso do solo; andares de `building:levels` ou `height`/3,1, senão estimados); depois os contornos de satélite da Microsoft onde o OSM não tem prédio (sem altura = casa ou sobrado). Cada contorno vira o menor retângulo envolvente, virado para a rua mais próxima. Quadras de casas geminadas que o satélite enxerga como um polígono só (residencial/comercial baixo, > 380 m²) são divididas em lotes de 8–12 m de frente, em uma a três fileiras.
- Formato compacto (arrays planos, alturas em Int16 base64): ~1 MB por capital média.

## No jogo
- Na escolha do município, "🏙 real" marca as cidades disponíveis; a opção "Começar com a cidade real" vem ligada.
- O relevo (`world/cidadeReal.ts → terrenoReal`) substitui o gerador procedural; a mata vem do OSM (e do bioma fora da área construível).
- O grafo de ruas real é o ponto de partida: o jogador pode construir, demolir e zonear normalmente.
- **Prédios reais são lotes fixos** (`computeLots` os coloca antes dos lotes gerados ao longo das ruas, se ≥ 60% do terreno estiver livre e seco). Nascem construídos e ocupados (85% da capacidade) com o arquétipo escolhido por tipo e andares (casa térrea → torre residencial; loja → escritórios; galpão/fábrica) e os andares reais. A simulação não os reconstrói; o jogador pode demolir (permanente, sai do arquivo no save) ou rezonear.
- **Lacunas de dados**: onde nem o OSM nem o satélite têm prédio num raio de ~60 m, 80% dos lotes ao longo das ruas reais ganham casas (ruas) ou lojas (avenidas) na fundação, fora das áreas de mata. Contam como cidade existente (rede herdada, sem reconstrução automática). Caso típico: São Luís, quase sem cobertura de satélite.
- **Rede herdada**: água, luz e esgoto que já existiam atendem os prédios originais. A capacidade é fixada na fundação (demanda inicial dos prédios reais + 5%; esgoto só na cobertura real da UF) e repartida entre os trechos da malha conforme a demanda deles. Crescimento novo precisa de rede nova.
- Desenho: o prédio real ocupa o retângulo inteiro (97%), com a altura dos andares reais; a ficha mostra nome (quando o OSM tem), tipo e tamanho.
- Saves guardam só o código IBGE, os prédios demolidos e a rede herdada; ruas, prédios e relevo são relidos do arquivo.
- Desempenho: Aracaju (11 mil prédios, 12 mil lotes) monta em < 1 s e simula a ~7 ms por passo; o redesenho dos prédios é limitado a uma vez a cada 0,7 s.

## Ruas vivas (Fase 11)
Veículos procedurais detalhados (sedã, hatch, táxi, ônibus com letreiro, caminhão de entrega, moto com piloto; 216–296 triângulos) e pedestres instanciados nas calçadas (146 triângulos, animação de caminhada no shader, guarda-chuva na chuva), em quantidade proporcional à população e à hora do dia, só perto da câmera (até 1.500).

## Testes (`tests/fase11.test.ts`, `tests/pedestres.test.ts`)
Relevo/água/verde a partir do arquivo; grafo com nomes; arquétipos por tipo e andares; cidade que nasce construída, habitada e abastecida pela rede herdada; demolição permanente que sobrevive ao save; prédios sem rua de frente ficam de fora; arquivos gerados seguem o esquema; matemática da calçada dos pedestres.

# Parte XI — Visual realista (Fase 12)

## Plantas reais (`scripts/fetch-cidades.ts`, `src/data/cidadeReal.ts`)
Cada prédio do arquivo da cidade ganha o contorno real em `contornos` (Int16 base64: n e n×(dx, dz) em decímetros a partir do centro; anel anti-horário visto de cima). Contornos que já são praticamente o retângulo (casas de quadra dividida) gravam n = 0. `contorno(c, i)` devolve a planta em coordenadas do mundo, ou o retângulo orientado (`retangulo`).

## Renderização (`src/render/city/PrediosReais.tsx`)
- Geometria estática em blocos de 512 m: paredes por aresta (u = metros ao longo do perímetro), laje triangulada ou, nas casas retangulares de duas águas, telhado com beiral de 0,4 m e oitões.
- Estado por prédio numa textura RGBA32F (2 texels: altura, cota, flags obra/abandono/sem-telhado, semente; cor da camada). O vertex shader posiciona a base em cota − 1,5 m e o topo em cota + altura (+ cumeeira nas casas baixas); prédio demolido ou vazio desce para baixo do chão.
- Materiais (`src/render/materiais/biblioteca.ts`): 8 fachadas fotográficas com escala real (≈3 m por andar), 3 paredes lisas, 3 telhas e brita. Escolha por tipo, andares e sorteio estável: casas em reboco pintado com a paleta regional (e telha cerâmica), prédios residenciais metade reboco, metade fachada fotográfica, comerciais altos em vidro/escritório, galpões com telha metálica.
- Janelas desenhadas no reboco: vão de 3,2 m (casa 3,8 m), janela de 1,4 × 1,25 m com esquadria, peitoril e sombra, vidro escuro reflexivo, cortina ou persiana; porta nas casas, vitrine ou porta de enrolar nas lojas; de longe viram a média da fachada (sem serrilhado). À noite ~1/3 acende, com rodízio.
- `Edificios.tsx` deixa de desenhar o corpo e o telhado dos prédios reais quando as texturas carregam (sem elas, volta às caixas).

## Luz e chão
- Céu HDRI do Poly Haven em `scene.environment` (luz ambiente e reflexos), intensidade pela hora e pelo tempo; a luz hemisférica fica como tingimento. Tone mapping ACES Filmic.
- Terreno: capim, terra e rocha fotográficos (pesos pela cor do bioma e pela declividade), como razão sobre a cor do vértice, em duas escalas para quebrar a repetição; mesmo esquema no asfalto e nas calçadas (`src/render/materiais/detalhe.ts`).

## Vista Google 3D (`src/ui/google3d/VistaGoogle3D.tsx`)
Vista à parte com os Photorealistic 3D Tiles transmitidos pela Map Tiles API (chave do jogador), centrada no ponto que a câmera da cidade olha. Não interage com a simulação.

## Testes (`tests/fase12.test.ts`)
Contornos das 27 capitais na ordem dos prédios; anéis anti-horários dentro do retângulo; retângulo orientado; arquivos de material e HDRI presentes.

# Parte XII — Rio em larga escala (Fase 13)

- **Mundo**: `MAP_SIZE` 16.384 m, `BUILD_HALF` 6.144 m (12,3 km), relevo de 16 m (1.024 células), raster de ocupação de 4 m (3.072²), campos agregados de 32 m (384²), território de 64 m (192²).
- **Arquivo da cidade** (`public/data/cidades/3304557.json`): mapa centrado entre o Centro e a Zona Sul (−22,945; −43,195); a câmera começa em Copacabana (`PONTO_INICIAL` em `world/cidadeReal.ts`). `terrenoReal` lê o arquivo pela própria extensão e, no litoral, faz praia em rampa e mar que aprofunda com a distância.
- **Prédios reais** (`render/city/PrediosReais.tsx`): blocos de 512 m montados sob demanda por `montarBloco` em três níveis de detalhe; a textura de estado continua única (150 mil prédios × 2 texels) e é refeita no máximo a cada 0,7 s.
- **Ruas** (`render/city/Vias.tsx`): blocos de 1.024 m com leitos, calçadas, postes, pilares e palmeiras; só os de até 4,5 km da câmera ficam visíveis.
- **Prédios gerados pelo jogo** (`Edificios.tsx`): só num raio de 2,5 km da câmera, com assinatura dos lotes do raio para não remontar sem mudança visível.
- **Worker**: estado enviado no máximo a cada 250 ms; `tests/escala.test.ts` mede montagem (≈2,4 s), passo e tamanho do estado (6,9 MB).

# Parte XIII — Ruas fiéis (Fase 14)

- **Dados** (`scripts/fetch-cidades.ts`, `geofabrik.ts`): por aresta, faixas (etiqueta `lanes` ou padrão da classe), flags (1 mão única — `oneway`, rotatória, via expressa —, 2 `bridge`, 4 `tunnel`); semáforos (`highway=traffic_signals`, associados ao nó mais próximo até 22 m) e faixas de pedestre no meio de quarteirão (`highway=crossing`, 14 m da rua mais próxima, uma por 12 m).
- **Modelo** (`world/roads.ts`): `RoadEdge.faixas/maoUnica/nivel`, `RoadNode.semaforo`; `larguraVia` = faixas × 3,2 m (+0,6 m de mão única, +1,4 m de mão dupla; 5–34 m), `calcadaVia` 3,5 m (avenida) / 2,2 m / 1,6 m (uma faixa).
- **Cotas** (`render/city/perfilVias.ts`): nós de portal na cota do terreno; nós só de túnel/viaduto relaxam (400 iterações); túnel = min(terreno, rampa), viaduto = max(terreno, reta).
- **Desenho** (`Vias.tsx`): leito por sinalização (`chaveLeito`: 'rua' | 'avenida' | '4d' | '3u'…), textura gerada por número de faixas; zebra e semáforos instanciados por bloco de 1 km; lâmpada com cor da fase no shader (`uSemTempo` = `ambiente.tempo`).
- **Tráfego** (`Veiculos.tsx`): mão única respeitada na escolha do próximo trecho e no nascimento; parada antes do semáforo vermelho/amarelo a 7 + (cor mod 4) × 5,5 m do nó; nascimento em trechos a até 1,6 km da câmera.
- **Testes** (`tests/fase14.test.ts`).

# Parte XIV — Relevo, mar e marcos (Fase 15)

- **Picos** (`world/cidadeReal.ts → PICOS_RIO`): `h = max(h, alt · exp(−d² / 2σ²))` em terra (> 1,2 m), raio de 3σ; Corcovado 704 m (σ 240), Pão de Açúcar 396 (150), Urca 224 (130), Dois Irmãos 533 (230).
- **Marcos** (`render/city/Marcos.tsx`, `pontosRio.ts`): âncoras por nome no arquivo do Rio e por lat/lon; `prediosOcultos` lista os prédios que um marco substitui (por nome e os num raio de 190 m do Maracanã); o desenho dos prédios pula esses índices.
- **Bondinho**: cabo reto entre três pontos, cabines com 90 s de ida e volta, ligadas ao `ambiente.tempo`.
- **Rocha**: sombreador do terreno mistura três projeções (zy, xz, xy) pelos pesos |n|⁴.
- **Ondas**: faixas de espuma em `sin(prof × 3,2 − t × 1,1)`, onde `prof` cresce com a distância da costa; avançam para a praia.
- **Testes** (`tests/fase15.test.ts`).

# Parte XV — Frota, gente e bairros (Fase 16)

- **Frota** (`render/city/Veiculos.tsx`): 12 tipos; `sortearTipo(r, avenida, faixas)` define a mistura; `GRANDES` (ônibus, caminhões, van, BRT) andam na faixa da direita. Táxi tem faixa azul por parte fixa; viatura tem barra de luz emissiva.
- **Praia** (`Praia.tsx`): candidatos numa grade de 3,2 m em 380 m da câmera onde a cota está entre 0,55 e 4,2 m e a água a menos de 70 m, com densidade 0,42·exp(−distância/38 m); cada candidato tem um limiar estável (`quem`) e aparece quando `lotacaoPraia` o passa. Quatro formas: grupo (guarda-sol + toalha + corpo), deitado, de pé, ambulante.
- **Corredores** (`Pedestres.tsx`): 34% (horário de correr) ou 10% dos pedestres a menos de 260 m da água, com `v` de 2,6 a 3,6 m/s.
- **Bairros** (`Bairros.tsx`): sprites de tamanho fixo na tela, até 36 por vez, escolhidos por distância (bairros até 5,2 km, comunidades até 1,5 km); `bairroMaisPerto` alimenta a ficha do prédio. Dados: `place=suburb|neighbourhood|quarter` do OSM em `bairros`/`nomesBairros` do arquivo.
- **Dev**: `localStorage['n27:praia'] = '0.9'` força a lotação da praia.
- **Testes** (`tests/fase16.test.ts`).

# Parte XVI — Ônibus reais e Censo (Fase 17)

- **GTFS** (`scripts/fetch-gtfs.ts` → `public/data/rio/onibus.json`): por linha, nome, destino, cor, tipo (702 = BRT/MOBI-Rio → 1; 200 = executivo → 2; resto 0), `porHora[24]` (viagens de dia útil `U_REG` contadas nas frequências) e um trecho por sentido; paradas dentro do mapa.
- **Ônibus** (`render/city/Onibus.tsx`): até 160 ônibus nos trechos que passam a 1,5 km da câmera, sorteados pelo peso `porHora[hora]`; quantidade ≈ 0,3 × soma dos pesos; velocidade 5–9 m/s (BRT 7–11); `indiceDasVias` (célula de 24 m sobre as amostras de via) encaixa no eixo e dá a cota.
- **Paradas**: abrigos instanciados, virados para a amostra de via mais próxima.
- **Camada Transporte**: `LineSegments` com a cor de cada linha, 7 m acima do relevo.
- **Censo** (`scripts/fetch-censo.ts`, `data/bairros.ts` → `bairros.json`): contornos simplificados a 15 m (anéis fechados divididos no ponto mais distante antes do Douglas–Peucker); `bairroCensoEm(x, z)`, `densidadeBairro`; camada `bairros` pinta os prédios por log10(hab./km²) de 2,7 a 4,7.
- **Testes** (`tests/fase17.test.ts`).

# Parte XVII — Metrô, trem e VLT (Fase 18)

- **Dados** (`scripts/lib/geofabrik.ts` → cache `-trilhos.json`; `scripts/fetch-trilhos.ts` → `public/data/rio/trilhos.json`): vias `railway` (menos pátios, desvios e ramais de serviço) e estações (`railway=station|halt|tram_stop|subway_entrance`, `public_transport=station`). As vias se encadeiam pelos nós em comum, cadeias com menos de 150 m caem, cada trajeto é cortado onde sai do terreno (±8150 m) e simplificado a 4 m mantendo as mudanças de nível. Formato: `linhas[{id,tipo,nome,cor,trajetos:[[x,z,nivel,…]]}]` (nível −1 túnel, 0 chão, 1 viaduto; vale o do ponto de chegada) e `estacoes[{nome,tipo,x,z}]` (tipo = o da linha mais perto, a 140 m; nomes repetidos a menos de 150 m viram um).
- **Desenho** (`render/city/Trilhos.tsx`): trajetos reamostrados a cada 8 m com a cota de D-087; fitas de lastro (textura de dormente) e trilhos só fora do túnel fundo; pilares nos viadutos; estações em instâncias, orientadas ao trilho; nomes (`etiqueta`, tipo 2) até 16 por vez a 1,1 km.
- **Trens**: `MATERIAL` por tipo (velocidade, intervalo em min, vagões, comprimento); número de trens por trajeto = comprimento ÷ (v × intervalo), de 1 a 6, só em trajetos ≥ 500 m; ida e volta com fase deslocada; cada vagão acompanha o trajeto pela posição e inclinação; cor da linha clareada por `instanceColor`.
- **Testes** (`tests/fase18.test.ts`).

# Parte XVIII — Auditoria do relevo e das ruas (Fase 19)

- **DEM** (`scripts/lib/copernicus.ts`): ladrilhos GeoTIFF de 1° do bucket `copernicus-dem-30m` lidos com `geotiff`, interpolação bilinear; `scripts/fetch-cidades.ts` amostra a grade de 16 m, marca terra (> 0,3 m), filtra (`removerOutliers`, `suavizarGaussiano`, `limitarInclinacao` de `src/world/relevo.ts`) e grava terra ≥ 0,8 m / água em −3 m.
- **Carga** (`world/cidadeReal.ts`): grade do arquivo → picos famosos (gaussianas, com `limitarInclinacao` 1,4 na vizinhança) → `escavarVias` → distância à água.
- **Terraplenagem** (`world/escavar.ts`): para cada trecho sem `nivel`, amostras de 3 m, `suavizarPerfil` (±6 amostras, duas passadas, ≤ 4 m do bruto, rampa ≤ 35% onde der); células a < núcleo recebem peso 1, a < núcleo + 8 m peso decrescente (smoothstep); média ponderada dos alvos de várias ruas × peso máximo. Água/praia (< 0,5 m) intocadas. ~190 ms por chamada (roda no worker e na tela).
- **Mapa de normais** (`Terreno.tsx`): 2048² RGB = (nx, nz, ny), Catmull-Rom nas duas direções; o fragment shader troca a normal facetada pela do mapa antes do detalhe PBR.
- **Rotatórias**: `rotatoriasValidas` em `fetch-cidades.ts` → `vias.rotatorias` [x, z, raio] e `vias.rotatoriasDescartadas`; ilha desenhada em `Vias.tsx` na cota média do anel.
- **Depuração**: `render/city/DebugMapa.tsx` (F3: wireframe, normais), `estadoDebug.ts` (`diagnosticarVias`: enterrada > 1,2 m, flutuando > 2,5 m, rampa > 18%), `ui/PainelDebugMapa.tsx`.
- **Medição**: `npm run auditar-mapa [-- --json]` (relevo e ruas, mesmos números antes e depois); `docs/auditoria-mapa/{antes,depois}.json` e prints.
- **Testes** (`tests/fase19.test.ts`).

# Parte XIX — Encostas (Fase 20)

- **Grade**: `HM_RES = 1536` (10,67 m); o arquivo do Rio tem a mesma (`res` = 1537, `passo` = 10,667). Gerador: Copernicus em bicúbico (`altitudeBicubica`), Hampel, gaussiana σ = 24 m, detalhe nas encostas (`detalharEncostas`: simplex ±0,9 m/80 m + ±0,45 m/40 m × smoothstep da inclinação 12–50%), limite de inclinação 1,2, água em −3 m.
- **Regrade** (`world/regrade.ts`): `regradarVias(h0, grafo)` → cotas dos nós (relaxação, ≤ 1.500 iterações, ~220 no Rio) e, por trecho, `y`, `dev` (y − relevo original), `classe` por amostra (0 normal · 1 ponte · 2 túnel · 3 muro), `nivel` efetivo (≥ 60% do trecho em ponte/túnel), `gradeMax`. `registrarRegrade(h, r)` associa o resultado ao `Float32Array` do relevo; `regradeDe(hm.h)` o devolve ao desenho. `limitarRampa` (em `relevo.ts`) projeta o perfil: cone das pontas + passada para frente e para trás.
- **Terraplenagem** (`world/escavar.ts`): núcleo = max(pista + calçada + 1,5 m, célula + 1 m), transição de 8 m (4 m nas amostras de muro), cada célula leva o alvo da rua de maior peso (empate: a mais perto); ponte e túnel não escavam; `rebaixarSobreAsfalto` aplica teto/piso por célula (rebaixo ≤ 4 m).
- **Desenho** (`Vias.tsx`): `perfilVias.ts` usa o perfil do regrade (`Perfil.nivel`, `classe`, `gradeMax`); calçadas só fora do túnel por amostra; `lateralAteTerreno`; muros (concreto por 3 × 2,5 m, normal para fora, cortes e aterros não se ligam) com fita e balaústres de guarda-corpo; portais (2 pilares + verga) por corrida de túnel; minirrotatórias (disco pintado 1,1–2,6 m); `Caminhos.tsx` (blocos de 1 km a 1,8 km da câmera).
- **Dados**: `vias.minirrotatorias` [x, z, r]; `caminhos` [tipo, largura × 10, n, x₀, z₀, …] (cache OSM `-caminhos.json`, regerado com a extração do PBF).
- **F3** (`estadoDebug.ts`): por trecho, morro sobre o asfalto (> 0,5 m na pista), vão (> 3 m), rampa (> 25%) com a inclinação máxima; contagens de muros, pontes e túneis.
- **Auditoria**: `npm run auditar-mapa` agora imprime trechos com morro sobre a pista por limiar, vãos e o resumo do regrade.
- **Testes** (`tests/fase20.test.ts`).

# Parte XX — O chão, os trilhos, os muros e a luz (Fase 21)

- **Chão** (`Terreno.tsx`): `texturaSplat(hm, predios)` — DataTexture RGBA8 de 1.537² (um texel por vértice): R terra, G grama, B mato, A rocha; `coberturaDePredios` (área dos prédios por célula, caixa 5×5 duas vezes). Shader: `albedoMix` (duas escalas, a segunda girada), rocha em 3 projeções só onde `sp.a > 0.01`, variação de tom por ruído, normais da grama e da rocha; o vértice só carrega a areia (`firme` = quanto a cor do vértice é branca).
- **Orla** (`data/orla.json`, `Vias.tsx`, `Caminhos.tsx`): `calcadaoAqui` = rua da lista e água a < 250 m; caminhos `pedestrian` a < 250 m da água usam a pedra portuguesa (tipo interno 6).
- **Via férrea** (`Trilhos.tsx`): `texturaBalastro` (128 × 64 px = 3,4 × 0,6 m), `fita(... vEsc = 0,6)`.
- **Gerador** (`fetch-cidades.ts`): `removerSoltas` (nó de grau 1 de ponte/túnel/avenida, > 40 m da borda, nada a < 10 m; até 6 rodadas) e `sobrePista` (retângulo × amostras de via a cada 5 m, limite 30% da meia largura, empurrão = invasão + 1,2 m, 3 tentativas); saída `removidos: { vias, prediosSobreVias, prediosDeslocados, prediosPos }`.
- **Cruzamentos e minirrotatórias** (`Vias.tsx`): `disco` com UV do mundo (÷ 6); `texturaAsfalto(claro)`; `meioFioCircular`.
- **Muros** (`Vias.tsx`): por par de amostras de mesmo tipo (corte/aterro), `np = ceil(H / 5)` patamares; cada um recua 2 m; face de concreto (`texturaConcreto`, 256 px por 3 × 2,5 m, barbacãs a 64/192 px), banqueta de grama (`texturaGrama`), guarda-corpo (fita + balaústres a cada 3 m); o enrolamento dos índices segue a normal.
- **Luz** (`CeuLuz.tsx`): `CSM` com `CASCATAS` e `MAPA_CASCATA` por nível, `maxFar` 1.800 m, `ligarCSM(csm, id, material)` (varredura a cada 0,5 s para materiais novos), luzes do CSM com a cor e a intensidade do sol; `SEM_CSM` (dev) volta à luz única.
- **F3** (`estadoDebug.ts`): `Contagem` ganha `solta`, `predioDeslocado`, `predioRemovido`, `minirrotatoria`; `Problema.tipo` ganha `solta` e `predio`.
- **Testes** (`tests/fase21.test.ts`).
