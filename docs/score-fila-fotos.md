# Score automático da fila de fotografia

> **Estado: PROPOSTA / SANDBOX.** Nada aqui foi aplicado ao painel. Nenhuma tabela
> criada, nenhuma linha de `admin.html` alterada. Documento escrito em 28/08/2026 a
> partir de quatro frentes de pesquisa (API do Mercado Livre, API do Bling, dados reais
> do Supabase, metodologia de priorização).

## O problema

A fila de fotografia é ordenada à mão por um operador. Queremos que a ordem venha do
impacto em faturamento, se atualize sozinha todo dia, e que a intervenção humana seja a
exceção registrada — não a regra.

## Por que a matemática é simples e a estimativa é difícil

Isto não é priorização de produto (RICE, ICE, matriz esforço×impacto). É **sequenciamento
numa máquina só**: fila única, capacidade fixa, tempo de serviço praticamente igual por
item, e cada item sangrando dinheiro enquanto espera.

Esse problema tem solução ótima provada — a regra de Smith: **ordene por R$/mês em risco,
decrescente.** Não há framework a escolher.

Todo o trabalho real está em **estimar bem o R$/mês de cada item**, e é disso que trata o
resto do documento.

---

## Decisões já tomadas pelo dono

Ditas explicitamente em 28/08/2026. Não são suposições.

- **Fonte de venda:** Bling, **excluindo as operações entre os 5 CNPJs do grupo**, pela
  lista de CNPJs (não por loja/canal, não por CFOP).
- **Métrica central:** desempenho do anúncio no Mercado Livre, via app de desenvolvedor
  próprio (a ser criado).
- **Sandbox:** tabelas novas no mesmo Supabase, prefixo `sb_`. Sem tocar em
  `mc_photo_products` nem no `admin.html`.
- **Papel do operador:** ordem automática, com **empurrão limitado e justificado**, além
  do emergencial.
- **Item sem histórico** é estimado por: família/produto análogo, capital parado, demanda
  de busca no ML e compatibilidade com motos populares.
- **Refazer foto** considera: alerta técnico do ML, conversão baixa com visitas altas,
  nota humana da Galeria e foto antiga/fora do padrão.

## O tamanho real do problema

Medido no banco em 28/08/2026:

| | |
|---|---|
| Linhas em `mc_photo_products` | 2.566 |
| Ativos (fora os 388 fora de linha) | 2.178 |
| Sem foto | 867 |
| **Sem foto e com estoque > 0** | **461** ← a fila que importa |

Com ~15 itens/dia, 461 itens zeram em cerca de 6 semanas. **Não é um problema de ranquear
milhares de coisas** — é de acertar a ordem de algumas centenas e não deixar entrar item
errado.

---

## O que existe e o que não existe

O painel **ainda não entrou em uso**. Isso não bloqueia o projeto, mas define uma regra
dura: **o score v1 não pode depender de nada que só existe dentro do painel.**

| Insumo | Estado hoje | Papel no v1 |
|---|---|---|
| `estoque`, `preco` | 100% preenchidos | Entram |
| Família do produto | Derivável do SKU (74,5%) | Entra — é o melhor sinal ocioso |
| `excluido` (fora de linha) | 388 marcados | Filtro de exclusão |
| Vendas por SKU | **não existe no banco** | Vem do Bling |
| Custo por SKU | não está no banco | Vem do Bling (`precoCusto`) |
| Estado do anúncio no ML | não existe | Vem do ML (fase 2) |
| Capacidade do estúdio | **não mensurável** (`mc_photo_files` vazia) | Não é insumo. Só dimensiona a janela congelada |
| Nota humana 0–5 | 82 notas, 1 avaliador, 2 dias | **Fora do v1.** Entra depois com peso pequeno |
| Kits | zero cadastrados | Estrutura prevista, inativa |
| `refazer`, `fotografado_em`, `status` | vazios | Não usados |

### Armadilhas nos dados, já confirmadas

- **257 SKUs com preço zero** e **estoque negativo até −11**. Qualquer fórmula
  multiplicativa quebra sem tratamento. Use `GREATEST(estoque, 0)` e trate preço zero como
  *ausência de valor*, não como valor nulo.
- **A fila sem foto é mais barata que o catálogo** (mediana R$ 99 contra R$ 263). Peso alto
  em preço priorizaria o que **já tem foto**. Preço entra só multiplicado pelo giro ou pelo
  estoque, nunca sozinho.
- **`bling-sync` roda por botão, à mão.** Todas as 2.566 linhas têm o mesmo
  `sincronizado_em`. Um score diário sobre estoque de três semanas atrás prioriza item já
  vendido. **Agendar a sincronização é pré-requisito, não melhoria.**
- **96,6% dos ativos estão sem prioridade**, e o montador de lote ignora quem não tem
  prioridade — hoje a Separação enxerga 75 de 2.178 produtos. O score não é conforto: é o
  que faz a ferramenta de lote funcionar em escala pela primeira vez.

---

## A regra

### Fórmula

```
Score_i = suavizado[ log1p( CoD_i ) × Idade_i ] + Empurrão_i

CoD_i = Déficit_i × [ Valor_i + Capital_i ]        (R$/mês, limitado ao P99)
```

**`Déficit_i`** — quanto há a ganhar com uma foto nova, de 0 a 1. Sem ele o score manda
refotografar o campeão de vendas que já tem foto perfeita. É **`max`**, nunca soma: item
sem foto também tem nota zero e idade infinita, e somar contaria a mesma falha três vezes.

```
Déficit_i = max( 1 se não tem foto,
                 1 se o ML penalizou por imagem,
                 (5 − nota_humana) / 5,
                 idade da foto em dias / 1095,
                 1 se está fora do padrão atual )
```

**`Valor_i`** — R$/mês de margem destravados, em três casos que são a mesma quantidade:

| Caso | Fórmula | Certeza |
|---|---|---|
| **(a)** Sem foto, sem anúncio | `min(demanda estimada, estoque) × preço × margem` | Média — demanda é estimada |
| **(b)** Anúncio penalizado por imagem | `venda recente × preço × margem × fração perdida` | **Alta — a receita perdida é observada** |
| **(c)** Anúncio vivo, conversão abaixo da família | `visitas × déficit de conversão × preço × margem × β` | Baixa — depende de parâmetro sem fonte |

A trava `min(demanda, estoque)` é essencial e costuma ser esquecida: um item cuja família
vende 40/mês mas que tem 1 unidade em estoque **não destrava R$ 4.000/mês**. Sem ela o
score enche a fila de coisa que a operação não consegue vender.

**`Capital_i`** — custo de carregar estoque parado. Aditivo, não substitui o valor:

```
Capital_i = estoque × custo unitário × custo de capital mensal    (só se sem venda há ≥ 90 dias)
```

### Item sem histórico: encolher para a família, não descontar por incerteza

O erro comum é chutar a demanda e depois aplicar um "fator de confiança" arbitrário. O
tratamento correto é **empirical Bayes**: a estimativa nasce colada na média da família e
se descola sozinha conforme o item acumula dado real. O peso é contínuo e sai dos próprios
dados — sem cortes arbitrários, sem penalizar a incerteza duas vezes.

A **família** vem do próprio SKU, que já carrega a taxonomia no padrão
`FP-<FAMÍLIA>-<MODELO+ANOS>-<VARIANTE>`. Cascata: SKU → família+modelo → família →
catálogo, usando o nível mais específico com pelo menos 30 itens.

É aqui que entram os sinais qualitativos que o dono aceitou — **compatibilidade com motos
populares define a família**, não vira bônus solto somado ao score.

> **Ressalva sobre demanda de busca do ML:** o endpoint de tendências devolve só os ~50
> termos mais buscados por categoria, sem volume. A esmagadora maioria dos nossos SKUs
> nunca vai aparecer. É sinal fraco, serve de desempate. Sinal melhor e que é nosso: a
> **busca interna do fullpro.com.br** — termo buscado com zero resultado é ouro.

### Normalização

**Winsorizar em P99, depois `log1p`.** Nessa ordem.

- **Não usar percentil/rank:** destrói a magnitude. R$ 8.000/mês e R$ 800/mês viram
  posições vizinhas. Queremos que 10× em dinheiro pese 10×.
- **Não usar log puro:** um erro de cadastro (preço de kit lançado como unitário) vira o
  item nº 1. A winsorização é, na prática, o **detector de erro de dado** — inspecionar
  mensalmente o que foi cortado.

> **Trade-off declarado:** o ótimo estrito seria não normalizar nada. O `log1p` é um desvio
> deliberado — ele achata a cauda para que penalidade, envelhecimento e exploração
> consigam disputar posição. Compramos cobertura e confiança da equipe ao preço de alguns
> pontos percentuais de receita capturada. Se o dono discordar da troca, **este é o
> parâmetro a mexer**, e a fórmula funciona sem o log.

### Estabilidade — a fila não pode dançar

Três camadas, porque são três problemas diferentes:

1. **Suavização do score** contra ruído amostral do dia a dia.
2. **Congelamento dos próximos ~5 dias úteis de trabalho.** O score continua sendo
   recalculado para tudo, mas o lote comprometido só sai por conclusão. É isto que permite
   montar lote, agrupar por setup de estúdio e avisar o fotógrafo na sexta o que vem na
   segunda.
3. **Banda morta** — não reordena por variação cosmética.

**Exceção obrigatória:** penalidade nova do ML entra com valor cheio **no mesmo dia**,
furando a suavização e o congelamento. Receita zerada não é oscilação estatística.

Instrumentar desde o primeiro dia: correlação de ordem entre a fila de hoje e a de ontem
(alvo ≥ 0,90 no topo 200) e rotatividade do topo 100 (alvo ≤ 10%/dia).

### Anti-starvation: cota, não sorteio

Item de cauda longa nunca chegaria ao topo. Três mecanismos possíveis:

| Mecanismo | Custo real |
|---|---|
| Envelhecimento puro | Item de valor ~zero eventualmente sobe e consome capacidade, para sempre |
| **Cota por faixa** | Perde-se ~10–30% da capacidade de maior valor. **Custo conhecido e orçado** |
| Sorteio proporcional | A fila deixa de ser determinística; a equipe não consegue montar lote e não confia no sistema |

**Escolha: cota, com envelhecimento suave dentro de cada faixa. Sorteio descartado.**

A cota da cauda não é caridade — é **orçamento de exploração**. É ela que gera o dado que
melhora a estimativa das famílias mal conhecidas, justamente onde o modelo é pior.

O envelhecimento tem **teto por design**: um item pode subir no máximo o equivalente a
~65% de valor por antiguidade, e nunca mais que isso. Antiguidade nunca inverte uma
diferença de ordem de grandeza. Envelhecimento sem teto transforma fila de prioridade em
loteria.

### Empurrão manual

Bônus **aditivo com prazo de validade**, nunca multiplicador livre — multiplicador livre é
a porta dos fundos para reintroduzir a priorização manual inteira.

- Dois níveis (~1,4× e ~2×), decaindo linearmente até morrer em **30 dias**.
- **Máximo 5 ativos por operador.** Escassez força escolha real; boost ilimitado vale zero.
- **Justificativa de lista fechada** + texto livre: `fornecedor exige` · `campanha em D-15`
  · `erro de dado no score` · `pedido do dono` · `outro`. Grava quem, quando, motivo, item,
  e o score antes e depois.
- **Emergencial é canal separado**, fora da fórmula: no máximo 2 vagas/dia, registrado.
  Misturar emergência com o modelo corrompe o modelo.
- **O log de justificativas é o backlog do modelo.** Se `campanha em D-15` aparecer 40
  vezes num trimestre, isso não é indisciplina do operador — é **sinal faltando no score**.
  Revisar mensalmente e converter motivo recorrente em variável.

### Transparência

A explicação é a **decomposição da própria fórmula em reais**, não uma narrativa gerada
depois. Se um termo não sabe se explicar em uma linha de português com um número em reais,
ele não deveria estar no score.

```
#3   BOLHA KAWASAKI ZX10R (16-20) FUMÊ CLARO           R$ 4.240/mês
──────────────────────────────────────────────────────────────────
  R$ 3.800/mês   anúncio pausado pelo ML há 6 dias — foto sem fundo branco
  R$   310/mês   38 un. paradas há 214 dias (R$ 21.400 de capital)
  R$   130/mês   entra em alta sazonal em setembro

  Confiança: ALTA — 14 meses de venda própria, não estimado por família
  Empurrão: nenhum
```

Regras: sempre em R$/mês, nunca em pontos ("score 0,73" não permite discussão; "R$
4.240/mês" permite alguém dizer *esse preço está errado*, que é a discussão que queremos).
No máximo 3 linhas. **Marcar visualmente o que é medido e o que é estimado** — é a
distinção que mais gera desconfiança quando escondida, e o oposto quando exposta. Guardar
um retrato diário do score e de cada componente: "por que esse item estava em 3º na terça?"
aparece na primeira semana.

E oferecer a **contra-explicação**: busca por SKU que responde *por que este item NÃO está
no topo*. É o recurso que encerra discussão de corredor.

---

## Fontes de dados

### Bling — vendas, custo e estoque

A listagem de pedidos **já traz o CNPJ e o id do cliente**, então o filtro do grupo
acontece antes de gastar a chamada cara do detalhe. Custo do filtro: 5 chamadas de setup.

- Itens só existem no **detalhe** do pedido (`codigo` = nosso SKU, `quantidade`, `valor`).
- Carga de 12 meses: entre ~35 min e ~5 h de relógio conforme o volume. O teto diário
  (120 mil chamadas por conta) nem é tocado. Atualização diária: ~100 chamadas.
- **Janela de filtro por período não pode passar de 1 ano** — quebra em 400. Fatiar por mês.
- `precoCusto` vem na mesma varredura de catálogo que já rodamos: 55 chamadas e passamos a
  ter margem por SKU. **Não existe custo médio** — é o custo do fornecedor padrão, e num
  catálogo com compras em câmbios diferentes a diferença é material. Dizer isso no relatório.
- **Não existe data da última venda por produto.** "Estoque parado há 214 dias" não é um
  dado que se lê — é subproduto da série histórica que vamos construir. Reforça persistir.
- **Devolução não se liga ao pedido de origem.** Dá para aproximar por SKU + cliente +
  janela, mas é heurística. Aceitável para ordenar fila de fotos; não seria para relatório
  financeiro.

**Multi-empresa:** um token enxerga **uma** empresa. As 5 do grupo são 5 autorizações. A
demanda de um SKU é a **soma das contas que o vendem**, menos as transferências internas —
a foto é uma só e serve a todas.

**Risco em produção:** o Bling descontinuou o tipo de token que o `bling-proxy` usa hoje,
com data de bloqueio "em definição". Migrar antes de aumentar o volume de chamadas.

**Suspeita a testar (independente deste projeto):** o parâmetro de saldo de estoque tem
padrão "somente positivo". Se o Bling aplicar esse padrão quando omitimos o parâmetro — e
omitimos — o `bling-sync` atual pode estar escondendo os SKUs com estoque zerado.

### Mercado Livre — estado do anúncio

- Detectar anúncio penalizado por foto custa **~10 chamadas para o catálogo inteiro**
  (filtros de status e tag). Barato demais para não fazer.
- Com moderação aberta, a API devolve **qual foto reprovou**, o motivo e o remédio, em
  português.
- Existe **histórico de infrações filtrável por "qualidade da foto"** — dá para reconstruir
  o passado sem esperar acumular dado novo.
- Qualidade do anúncio: score 0–100 com a dimensão de fotos isolada, distinguindo
  **penalidade** de **oportunidade**. Endpoint no singular (`/item/...`), não no plural —
  o plural devolve 404. A rota antiga de saúde ainda responde, mas está descontinuada; não
  construir em cima dela.
- **Diagnóstico preventivo:** dá para mandar a foto **antes** de publicar e receber se tem
  fundo não-branco, logo, texto, marca d'água ou tamanho insuficiente. Ver "QA na origem".
- **Visitas e qualidade não aceitam lote** — uma chamada por SKU. Varredura ingênua diária
  seriam ~11 mil chamadas contra um limite que o ML **não publica** e que é compartilhado
  por toda a conta (Magis5, sync de fotos). Solução: camadas — ~500 SKUs de maior
  faturamento diariamente, resto semanal, penalizado fura a fila. Cai para ~2.000/dia.
- **O ML só retém 12 meses de pedidos.** O que não copiarmos, evapora.
- **Anúncio de catálogo pode ter a foto gerenciada pelo catálogo**, não por nós.
  Refotografar não resolve. Verificar antes de o item entrar na fila, senão o estúdio
  trabalha à toa.
- Múltiplas contas vendedoras autorizam o **mesmo app** — não multiplica integração,
  multiplica cliques. Mas o limite de chamadas é por app: é orçamento compartilhado.

### O que não usamos, e por quê

Os números que dominam a busca sobre impacto de foto na conversão — +94%, +63%, +27% —
vêm de blogs de empresas que **vendem** fotografia, retoque e IA de imagem. Sem
metodologia, sem grupo de controle, com conflito de interesse. Não entram na fórmula nem
em apresentação.

O único estudo causal sério encontrado (Management Science, 2022, sobre o Airbnb) mede
**+8,98%**. É outro mercado — hospedagem é decisão visual, bolha de CBR é decisão de
compatibilidade; a elasticidade em peça de reposição é provavelmente menor. Serve para uma
coisa só: a ordem de grandeza do ganho **estético** é um dígito percentual, não noventa.

**O efeito grande no ML não é estético, é de estado.** Anúncio pausado por moderação tem
receita zero. Isso não é elasticidade, é interruptor — e é por isso que o caso (b) é ao
mesmo tempo o de maior valor e o de menor incerteza.

---

## QA na origem — a oportunidade de estar começando agora

O estúdio está entrando em operação. É o único momento em que dá para instalar a
conferência automática **sem ter que consertar nada retroativamente**.

Toda foto que sai do estúdio passa pelo diagnóstico do ML antes de virar anúncio: fundo,
logo, texto, marca d'água, tamanho. Reprovou, volta na hora — enquanto a peça ainda está
montada na bancada, não três semanas depois quando o anúncio for pausado.

Isso não ordena a fila. **Impede que a fila de "refazer" nasça**, que é melhor.

---

## Tabelas do sandbox

Prefixo `sb_`, no mesmo projeto Supabase. Nenhuma altera nada existente.

| Tabela | Guarda |
|---|---|
| `sb_empresas` | Mapa CNPJ ↔ empresa do Bling ↔ conta do ML; se vende ao consumidor |
| `sb_vendas_fatos` | A série histórica. Chave `(empresa, pedido, sku)` — reprocessar é idempotente |
| `sb_produto_dim` | Espelho de catálogo com o que falta hoje: custo, família, modelo, variante |
| `sb_ml_anuncios` | SKU ↔ anúncio, status, penalidades, se é catálogo, qualidade |
| `sb_ml_visitas` | Série diária de visitas |
| `sb_ml_moderacoes` | Penalidade aberta, foto culpada, motivo, quando abriu e fechou |
| `sb_familia_prior` | Parâmetros da família, recalculados mensalmente |
| `sb_score_diario` | Retrato do dia: score, R$, cada componente, posição, faixa |
| `sb_score_boost` | Empurrões: quem, motivo, validade, score antes e depois |
| `sb_score_params` | Todo parâmetro calibrável, para ajustar sem tocar em código |

---

## Ordem de implementação

**Fase 0 — fundação (não depende do ML).**
Série de vendas do Bling com o filtro do grupo; custo por SKU; família derivada do SKU;
sincronização agendada. Entrega: o caso **(a)** funcionando — produto sem foto, ordenado
por R$ destravados. Já resolve os 461 itens da fila real.

**Fase 1 — o ML entra.**
Detecção de anúncio penalizado (~10 chamadas/dia) e o QA na origem. Entrega o caso **(b)**,
que é o de maior valor e menor incerteza, e o mecanismo que impede a fila de refação de
nascer.

**Fase 2 — conversão.**
Só depois de medir, com dados próprios, quanto do déficit de conversão é atribuível à foto.
**Até lá o caso (c) fica desligado.** Não vamos lançar um chute vestido de medida.

As camadas de estabilidade (suavização, congelamento, cota) entram **junto com a fase 0**,
não depois — a confiança da equipe se forma na primeira semana e não se recupera.

---

## Como saber se ficou bom

O backtest histórico clássico **não é possível**: o banco tem três dias de vida, zero venda
por SKU registrada, e 96,6% dos itens sem prioridade manual — não há fila humana com que
comparar.

O que dá para fazer, em ordem:

1. **Rodar em paralelo, sem afetar nada.** O objetivo aqui **não é medir acurácia** — é
   **achar erro de cadastro antes de expor a operação**. Preço de kit lançado como
   unitário, estoque fantasma, margem negativa por custo velho, item descontinuado ainda
   ativo. Com 257 preços zerados e estoque negativo já visíveis, vai aparecer coisa.
2. **Sortear a ordem entre itens de valor parecido.** Gerar os 30 melhores do dia e sortear
   os que vão. Quase nenhum valor é sacrificado, e isso cria a variação que permite medir
   **causalmente** o efeito da foto. É o mesmo experimento que calibra o parâmetro da
   fase 2 — não são dois projetos.
3. **Reservar uma fatia pequena da capacidade para a escolha humana**, permanentemente.
   Custa pouco e dá uma métrica viva de "score contra humano", em vez de uma foto de um mês
   que envelhece.

**Métricas.** Principal: margem incremental por SKU fotografado, 60 dias, score contra
humano. Guarda-corpos, que reprovam o teste se piorarem: cobertura da cauda (SKUs
distintos fotografados no trimestre), estabilidade da fila, e **número de empurrões manuais
por semana** — o melhor termômetro de aceitação que existe. Se subir, a equipe não confia
no score, e a causa raiz é sinal faltando, não indisciplina.

**Não usar** "SKUs fotografados por dia": é a capacidade, é constante por construção, e
otimizá-la incentiva escolher o item mais fácil de fotografar.

---

## Pendências com o dono

1. **Custo de capital mensal** — quanto custa ter R$ 1 parado por mês (CDI + armazenagem).
   Decisão financeira dele, não estimativa do modelo. É o que converte "38 unidades paradas
   há 214 dias" em reais.
2. **Mapa empresa ↔ conta do ML** — quais dos 5 CNPJs vendem ao consumidor final e qual
   conta do ML corresponde a cada um. Os puramente internos/B2B entram só como cliente a
   excluir.
3. **App de desenvolvedor no ML** — criação e autorização são dele (envolvem login e
   credenciais).
4. **Aval para agendar o `bling-sync`** — pré-requisito, e mexe em algo que já está no ar.

## Fora do escopo, mas achado no caminho

- **`mc_fin_rh` e `mc_fin_renames` estão com RLS desabilitado.** Quem tiver a chave anon
  (pública por design, está no `config.js`) lê e escreve. Uma delas guarda dado de RH.
  Merece janela própria — ativar RLS sem política bloqueia o acesso legítimo na hora.
- **Token do TikTok expirado** desde 18/08/2026.
