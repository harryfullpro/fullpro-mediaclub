# Diário

## 28/08/2026 · Instagram e YouTube saem do config.js e viram botão

> *"mude aqui nas integrações esses que estão no config.js pra eu poder
> reconectar manualmente"*

As duas linhas eram um rótulo fixo: "Configurado pelo sistema" se a string
existisse em `window.FULLPRO_CONFIG`. Duas mentiras nisso — dizia "configurado"
com o token vencido há semanas, e trocar a credencial exigia editar o
`config.js` e redeployar o site, que não é coisa que se faça às onze da noite.

**O botão só vale se ele mudar alguma coisa.** Por isso o trabalho foi maior do
que a tela:

- **`mc_integrations`** (RLS ligada, zero policies: só as edge functions leem)
  passa a guardar as duas credenciais. Quem grava é uma função que **valida na
  origem antes** — token errado colado por engano não derruba o que funcionava.
- **`instagram-proxy` v4**: resolve o token em `mc_integrations` → secret, e
  ganhou `status`, `verificar`, `salvar` e `desconectar`. Salvar e desconectar
  exigem administrador, com a mesma regra do `isUserAdmin` do painel.
- **`youtube-proxy`, nova**: mesmo molde. O `salvar` testa a chave **do
  servidor**, porque chave restrita por referenciador HTTP passa no navegador e
  falha na edge function — melhor descobrir colando do que de madrugada, e a
  mensagem já diz o que mudar no console do Google.
- **`coletor-pecas`** lê as duas de `mc_integrations`. Sem isso, reconectar no
  painel não mudaria nada no único lugar que não pode parar: story vive 24h.
- **O navegador parou de falar com a Meta e com o Google.** Sete pontos do
  painel usavam o token do `config.js` direto — e um deles pedia `me/accounts`,
  recebia o **token de página** de volta e passava a usar esse também. Agora
  tudo passa por quatro portas (`fpIgMidias`, `fpIgInsights`, `fpIgDescoberta`,
  `fpYtStats`), que falam com as functions.

Duas coisas que só apareceram porque um agente foi conferir antes de eu mexer:

- A ação `descoberta` da proxy devolvia **só as mídias** e descartava
  `followers_count`/`media_count` — exatamente os dois campos de que o
  Influencer Hub vive. Eu teria derrubado seguidores, engajamento e a
  classificação nano/micro/macro da base inteira. Agora ela devolve `perfil`.
- `resolveIGPageToken` não tinha substituto 1:1, porque a proxy **recusa** por
  princípio devolver o token de página. O caminho certo era o front deixar de
  precisar dele: `ig_id` vai na chamada e o token de página fica no servidor.

**A reserva.** Enquanto ninguém tiver conectado pelo painel, o caminho velho
continua valendo, com aviso no console — derrubar as métricas de todo mundo até
alguém colar um token seria trocar um problema por outro. A linha da tela diz
isso na cara: *"Não conectado — ainda usando a chave pública do config.js"*.

Medido no navegador, pela reserva (que é o estado de hoje): lista de mídias,
insights (1.151 views), `fetchIGStats` completo com thumb, `business_discovery`
com 21.962 seguidores, e o YouTube devolvendo 7.574/367/14 num vídeo e `null`
num id inexistente. As duas functions respondem `versao: ig4` e `versao: yt1` no
`health`, que é como se confere de fora qual código está no ar.

E o que **não** está resolvido: guardar no servidor a MESMA credencial que já é
pública não protege nada. A ordem certa — gerar nova, colar, revogar a antiga,
esvaziar o `config.js` — está em `pendencias.md`.

### O "só administrador" era enfeite, e o revisor achou

Um agente pago para derrubar o desenho encontrou o que eu não teria olhado:
`mc_admin_users` tinha **uma** policy, `FOR ALL TO authenticated`, com USING e
WITH CHECK iguais a `mc_eh_operador()` — que só pergunta "é operador?". E
`role` é editável pela própria pessoa em Meu perfil. Ou seja: qualquer operador
logado dava um PATCH em si mesmo, virava "Administrador" e então trocava a
credencial da empresa. **Toda a checagem de admin que eu tinha acabado de
escrever era decorativa.**

Conferido no banco antes de acreditar, e corrigido com um gatilho
(`mc_admin_users_sem_autopromocao`): cargo que começa com "admin" chegando pelo
cliente é recusado, e `auth_uid` também não muda por ali. Testado em transação
que fez rollback — promoção recusada, `auth_uid` recusado, perfil normal passa,
admin editando o próprio perfil passa.

Junto, duas coisas que a RLS não segurava:

- **`TRUNCATE` ignora RLS.** O GRANT padrão dava TRUNCATE a `anon` e
  `authenticated` em todas as tabelas do schema — qualquer usuário logado podia
  esvaziar uma tabela. Revogado (com REFERENCES e TRIGGER, que o PostgREST nunca
  usa).
- **`mc_integrations` perdeu todo privilégio** de `anon`/`authenticated`, mais
  `FORCE ROW LEVEL SECURITY`. Antes o que segurava era só "RLS ligada sem
  policy" — uma policy permissiva criada por engano meses depois exporia as
  credenciais das quatro plataformas de uma vez, com 200 OK e sem alarme.

E um vazamento que não vinha do `console.error`: a Graph API exige o token na
**query string**, e quando o `fetch` em si falha (DNS, TLS, timeout) o Deno
lança um TypeError cuja mensagem traz a **URL inteira** — com o token dentro —
que ia para o log da função. Pior no `salvar`, que é a chamada com credencial
recém-colada e maior chance de erro. Agora o erro de rede é reescrito sem URL,
nas duas functions.

De quebra, a linha do TikTok parou de mentir: a `tiktok-proxy` já devolvia
`expires_at` e ninguém olhava — a tela dizia "Conectado" em verde com o token
**vencido desde 18/08**. Agora diz "Token vencido em 18/08/2026 — reconecte",
em vermelho.

## 28/08/2026 · A cor das metas virou a própria distância até a régua

> *"eu quero que a cor dos gráficos seja de acordo com a progressão da meta"* /
> *"na verdade, vamos fazer em forma de gradiente, de vermelho para amarelo e
> amarelo para verde"*

Antes eram três estados fixos — verde se bateu, azul se está no ritmo, âmbar no
resto. Agora a cor é contínua: `fpMetaCor(razao)` interpola em **oklab** entre
três âncoras (`--meta-ruim`, `--meta-meio`, `--meta-boa`) via `color-mix`, que
resolve o token na hora — trocar de tema repinta sozinho, sem redesenhar.

**O amarelo não fica no meio da escala, fica em 0,8.** Amarelo é o "ok" dele, e
ok é estar perto do ritmo. Com o amarelo em 0,5, agosto (37% do ritmo nos
curtos) apareceria quase amarelo logo abaixo de um "0 de 7 no ritmo" — a cor
desmentindo o número ao lado.

**O gráfico é um degradê ao longo do tempo, não uma cor só.** Em cada dia o
stop tem a cor da distância entre a linha cheia e a régua pontilhada *naquele
dia*. Um mês que começou mal e recuperou aparece como é: vermelho à esquerda,
verde à direita. São 28 stops num `<linearGradient gradientUnits="userSpaceOnUse">`
com `x2` no último dia desenhado — com `objectBoundingBox` o degradê se
esticaria pela largura inteira do SVG e as cores sairiam do dia em que
aconteceram.

Duas decisões que não estavam no pedido, mas sem elas a cor mentiria:

- **Começo de mês não é atraso.** Enquanto a meta não cobrou nem uma peça
  (`alvo * corridos/dias < 1`), a razão é `null` e a linha sai cinza. Uma meta
  de 4 carrosséis em 31 dias só passa a cobrar a primeira no dia 8; pintar de
  vermelho antes disso é acusar quem não deve.
- **A linha da cadência passou a contar DIAS, não peças.** Desenhando peças,
  dez reposts num sábado subiam a curva como se fossem dez dias cumpridos,
  enquanto o "0 de 28 dias" ao lado dizia o contrário.

Medido na página, nos dois temas, com os dados reais de agosto: nenhum ponto da
rampa fica abaixo de 3:1 contra o fundo (mínimo para elemento gráfico). No
escuro o pior é 6,05:1 (o vermelho); no claro é 3,50:1 — e é por isso que o
"amarelo" do tema claro é o âmbar `#a67c00` e não amarelo de verdade: amarelo
sobre `#f5f5f7` dá 2,8:1 num traço de 2px.

Onze cenários conferidos rodando a apuração de verdade no navegador: mês
futuro, mês fechado, alvo zero, dia 1 com e sem peça, meta estourada (45 de 30),
27 de 30 no dia 28, cadência perfeita e cadência com dez reposts em três dias.

**Segunda passada, depois de um painel de agentes tentar derrubar o desenho.**
Quatro frentes em paralelo (paleta/contraste, consumidores no código, os números
reais de agosto, e um agente pago para achar furo). O que era furo de verdade e
foi corrigido:

- **A guarda de começo de mês não cobria cadência.** Como a meta É o número de
  dias, o esperado dava sempre os dias corridos e `esperado < 1` era
  aritmeticamente inalcançável: dia 1, 00h05, sem repost, linha vermelha.
  Cadência agora tem conta própria — e o dia de hoje só entra no denominador
  depois de cumprido, porque não ter repostado às 9 da manhã não é um dia
  perdido.
- **Dia 1 com alvo grande também escapava:** 40 clips em 31 dias já cobram 1,29
  peça no primeiro dia. Agora dia 1 sem nada feito é neutro para qualquer alvo.
- **`color-mix` em atributo de apresentação SVG falha para o preto.** Navegador
  que não entenda a função descarta a declaração e volta ao valor inicial: fill
  preto, stroke nenhum — o gráfico some sem erro no console. `CSS.supports` é
  perguntado uma vez e a rampa cai para a âncora mais próxima.
- **Mês fechado dizia "proj. 24".** Agora diz "fechou em 24": num mês que
  acabou, aquilo é resultado, não promessa.
- **Mês futuro tinha placar.** Setembro visto em agosto marcava "0 de 7 no
  ritmo" — acusação de atraso em quem ainda não teve o dia 1. Vira "—".
- **Termo morto no contador:** `modo === 'cadencia' && pct >= 90` nunca mudava
  o resultado (pct≥90 implica pct≥80, que já é o noRitmo da cadência). Saiu
  agora, para não virar bug na próxima vez que alguém mexer no limite.

O que o painel apontou e ficou como está, de propósito: a rampa vermelho-verde
é justamente o eixo que o daltônico não separa — mas cada linha traz "X de Y" e
"proj. N" em texto, então a cor não é o único portador; e no tema claro
"laranja" e "amarelo" saem como ocre e âmbar, que é física do fundo claro, não
escolha (dito ao dono).

## 28/08/2026 · O cabeçalho das Metas passou a ser o cabeçalho de Meus Posts

> *"arrume esses botoes de cima de atualizar e configurar para os padrões de
> design do site. E também o seletor de mês"*

Metas tinha inventado três controles próprios. Do lado, dentro da mesma
Performance, **Meus Posts** já tinha a linha pronta: `select.proj-sort-select`
+ botão de ícone, `gap:8px`, tudo no mesmo eixo do título. Agora Metas usa
essa linha — inclusive o **mesmo SVG** de atualizar, porque é a mesma ação e
dois desenhos para a mesma coisa é como uma das duas fica errada depois.

Três detalhes que só apareceram medindo:

- O `#perfMetasAdminBtn` era um bloco embrulhando outra `div` flex. Virou ele
  mesmo a linha de controles, como em Meus Posts — um nível a menos e o mesmo
  comportamento de wrap.
- A engrenagem é o último elemento da direita: a dica dela vazava 27px para
  fora da tela. Ganhou `.fp-tip-left`, que é o que o resto do painel já usa
  nessa posição.
- Em ≤900px a regra geral do `.page-head` deixa o seletor encolher até sobrar
  só a seta — e aí o operador não sabe de que mês são os números na frente
  dele. `min-width:128px` (largura natural de "Setembro 2026").

Medido nos dois temas: select 30px de altura e os dois botões 34px, todos no
eixo y=74, folgas de 8px; no escuro os dois botões de atualizar — o de Metas e
o de Meus Posts — devolvem exatamente a mesma cor, tamanho, raio e path.

## 27/08/2026 · Metas, segunda passada: fora os cards, fora o caixa

> *"remova agora esse caixa coletivo que não tem porque estar ai. Também não
> gostei desse design que tu fez. repensa algo mais próximo de gráficos
> atualizados em tempo real e mais parecido com o resto do padrão do site sem
> container em volta"*

Ele estava certo e a regra já estava escrita: **"eu não quero CONTAINERS NESSA
MERDA"** está em `contexto.md` desde sempre, e eu tinha feito um card por meta —
moldura, raio e fundo. Refeito no idioma que Produção e Projetos já usam: linhas
encostadas no fundo da página, separadas por fios de 1px, com a faixa de hover
sangrando até a borda da tela.

O **caixa coletivo saiu**. Dinheiro é assunto da tela de Bonificação; um banner
de projeção de pagamento no meio do acompanhamento de produção rouba a leitura
do que a tela existe para responder. O valor por meta e o rateio continuam em
`mc_performance_goals`, intocados.

O gráfico ganhou **área** embaixo da linha: com 210px de largura e 40 de altura,
um traço de 2px sozinho some no meio de uma listagem sem moldura. E o cabeçalho
passou a dizer **"atualizado há X"** — sem isso, "tempo real" é palavra: o
operador não tem como saber se está vendo o de agora ou o de ontem, e story tem
24h de vida.

### Um defeito que só apareceu com dado real

Agosto foi cadastrado com as mesmas sete metas, a pedido do dono, para ver a
tela com número de verdade. Aí ficou visível: **"Reposts diários: 0 de 28 dias"
saía em AZUL** — a cor de quem está indo bem, contradizendo o próprio número. A
cadência não tinha noção de ritmo, só de "bateu tudo ou não". Agora ela também
compara com os dias corridos.

### A escala do gráfico é compartilhada de propósito

Com 10 de 30, a linha fica rente ao chão e a régua tracejada sobe longe dela.
Escalar pelo próprio máximo mostraria melhor a forma da curva — e apagaria a
única coisa que a tela existe para responder: quanto falta.

## 27/08/2026 · Metas: modelo novo, coletor das redes e o painel refeito

> *"vamos repaginar essas metas (…) quero um dashboard de metas completo e que
> acompanhe em tempo real como anda o cumprimento delas ao longo do tempo"*
> *"tem como a gente buscar isso automaticamente via api?"*

### O que a leitura do código achou antes de eu tocar em nada

Três defeitos na tela antiga, todos confirmados linha a linha:

1. **Contagem em dobro.** `getPublishedThisMonth` varria `p.destinations` e,
   sob o comentário *"Also add from project posts"*, varria os MESMOS dados de
   novo somando nos mesmos contadores. O "9L + 23S" da tela era o dobro.
2. **O segundo laço não filtrava mês** — somava o histórico inteiro numa tela
   que se anuncia como "do mês".
3. **A data era `production_date`**, a data da GRAVAÇÃO. Vídeo gravado em julho
   e publicado em agosto contava em julho.

E uma armadilha que teria custado caro: `savePerfGoals` fazia
`update(payload).eq('id', PERF_GOALS.id)` com o `month` DENTRO do payload, e
`PERF_GOALS` é sempre a linha do mês corrente. **Cadastrar setembro não criaria
linha nova — renomearia a de agosto.** Virou `upsert` por mês, com índice único
em `month` para o conflito existir de verdade.

O módulo também estava praticamente sem uso: `mc_performance_posts` tinha **1
post** (de junho) e `mc_performance_goals`, **1 linha** (junho). Os números que
apareciam vinham de `mc_projects`.

### A pergunta certa do dono

Ele perguntou se dava para buscar por API em vez de digitar. **Testei contra as
contas reais antes de desenhar em cima disso:**

| endpoint | resultado |
|---|---|
| `/{ig}/stories` | 4 stories nas últimas 24h — funciona |
| `/{ig}/media` | 21 REELS e 4 CAROUSEL_ALBUM nas 25 últimas |
| YouTube `contentDetails` | a duração que o painel nunca teve |

Cinco das sete metas que eu tinha dado como "manuais" viraram automáticas. A
regra do "pure sound" sai do título, como ele pediu — a equipe já escreve
`| PURE SOUND |`.

**Repost é a única que nenhuma API sabe dizer.** Nem Instagram nem TikTok marcam
recompartilhamento. Ficou como marca manual, mas o trabalho é RECONHECER e não
registrar: a lista vem pronta do coletor e o operador só aponta quais foram.

### O modelo

- **`mc_pecas`** — uma linha por peça que foi ao ar, com `publicado_em` vindo da
  plataforma. `bruto` guarda a resposta da API: a regra de classificação vai
  mudar, e reclassificar tem que ser reprocessar, não recoletar — story não
  volta.
- **`mc_metas_alvo`** — uma linha por meta, por mês. Setembro tem sete e agosto
  tinha três, sem migração nenhuma.
- **`mc_performance_goals` continua mandando no dinheiro.** A bonificação não
  mudou.

`eh_repost` é uma CAMADA, não um tipo: a peça marcada sai do balde de origem e
entra no de repost. Guardar assim (e não trocando `tipo`) mantém o coletor
idempotente — ele reescreve `tipo` a cada passada e apagaria a marca.

### Por que o coletor precisa de cron

Story vive 24h e `/stories` só devolve o que está no ar AGORA. Sem agendamento,
story de sexta à noite não existe na segunda — e não há como buscar depois.
`pg_cron` e `pg_net` estão disponíveis no projeto.

### O que ficou honesto na tela

- Um gráfico **por meta** (acumulado contra o ritmo ideal), e não um com sete
  linhas, que viraria novelo.
- **Peça fora de meta aparece embaixo.** Um vídeo de 9 minutos não é curto nem
  10-15; sumir da vista faria a equipe achar que o trabalho não foi contado.
- No canal inteiro há **10 vídeos** na faixa de 10-15 min; a maioria tem 4 a 9.
  E "Pure Sound Triumph Speed 1200" tem **20 minutos** — conta como pure sound
  pelo título, e o painel mostra a duração ao lado para o dono decidir.
- O caixa mudou de escala: 7 metas × R$ 850 = R$ 5.950, contra R$ 2.550 com 3.
  Não mexi no `pool_per_goal`; avisei.

### Um erro meu, pego no teste

`formatBRL` devolve só o número — todo chamador do arquivo põe o "R$" na frente.
Esqueci, e o caixa saía "3.400,00": parece dinheiro, não é moeda nenhuma.

## 27/08/2026 · Dia selecionado do calendário: azul no lugar do amarelo

> *"vamos alterar esse hover select e hover do mouse na data selecionada para a
> cor azul ao invés do amarelo"*

Duas regras (`.cal-day.selected` e o hover dela) trocaram `--accent` e os
`rgba(255,207,51,…)` cravados por `--azul`. O token, que nascera `--novo-azul`
no botão "novo", virou `--azul` — nome preso a um dos usos é o tipo de coisa que
faz o próximo inventar um segundo azul. Junto veio `--azul-rgb`, porque `rgba()`
precisa dos canais soltos e não há como extraí-los de um hex em CSS puro.

Medido depois da transição terminar: número do dia sobre o azul **14,1:1** no
claro e **13,7:1** no escuro; a borda azul contra o card, **4,02:1** e **4,95:1**
(o piso de elemento gráfico é 3:1).

### Nem a seleção pode recolorir o dia

> *"ainda ta pintando o quadrado de azul cara, eu quero só a borda em azul, um
> select"*

O mesmo princípio do hover, aplicado à seleção — e eu só tinha aplicado metade
dele. O dia selecionado ainda pintava o fundo de azul, e o fundo é o canal do
ESTADO: um dia APROVADO, ao ser clicado, deixava de parecer aprovado.

Agora o quadradinho tem **dois canais separados**:

| canal | o que diz |
|---|---|
| fundo | o estado — verde aprovado, vermelho bloqueado, cinza livre |
| borda | a seleção — azul |
| contorno externo | o ponteiro está aqui — cinza neutro |

Nenhum pisa no outro, e os três podem aparecer ao mesmo tempo: um dia aprovado,
selecionado e sob o mouse mostra fundo verde, borda azul e contorno cinza.

O `inset` de 1px continua, mas agora em azul cheio: é a mesma borda engrossada
por dentro, porque 1px de linha num quadrado de 32px quase não se vê. É sombra e
não `border-width: 2px` porque largura de borda mexe no espaço interno e faria o
número dançar 1px ao selecionar.

Medido nos dois temas: a borda azul passa de 3:1 contra TODOS os fundos (pior
caso 3,01 no vermelho do tema claro e 3,03 no verde do escuro) e dá 4,02/4,49
contra o card em volta.

O token `--azul-rgb`, que existia só para os fundos com alfa, ficou órfão e saiu
junto.

### E o hover não pode recolorir o dia

> *"o hover que eu quero é só um contorno no quadradinho da data, sem alterar a
> cor que ele já tem, isso pode confundir o operador"*

Certíssimo, e o problema era maior do que o dia selecionado: a regra **geral** de
hover trocava `border-color` para `--primary`. Ou seja, passar o mouse num dia
APROVADO deixava ele com a borda de BLOQUEADO enquanto o ponteiro estivesse em
cima. O quadradinho mentia sobre o próprio estado.

No calendário, `background` e `border-color` **carregam significado** — verde é
aprovado, vermelho é bloqueado, azul é o selecionado. O hover não pode encostar
em nenhum dos dois. Agora ele é só um contorno por `box-shadow`, numa cor neutra
derivada do texto (`--contorno`), nunca verde/vermelho/azul: cor própria voltaria
a dizer algo sobre o estado.

Duas sutilezas:

- `box-shadow` **não se acumula entre regras** — a que vence substitui a outra
  inteira. Por isso o dia selecionado repete o próprio anel interno azul dentro
  da regra de hover; sem isso o anel sumiria justo quando o mouse chegasse.
- Contorno por `box-shadow`, e não por `outline`: o `outline` é do anel de foco
  de teclado, e as duas coisas precisam poder aparecer juntas.

Conferido nos dois temas com os quatro estados (comum, aprovado, bloqueado e
selecionado): fundo e borda idênticos com e sem o mouse, só o contorno entra.

### Dois enganos de medição meus, nenhum era defeito do código

**O servidor local tinha caído.** O service worker fez o certo — rede primeiro,
cache como rede de segurança — e me serviu uma cópia de 1.516.339 bytes contra
1.530.039 em disco. Passei um tempo procurando uma regra CSS que estivesse
vencendo a minha; não havia nenhuma. Antes de caçar especificidade, conferir se
o arquivo servido é o arquivo editado.

**`.cal-day` tem `transition: all .15s`.** Trocar `data-theme` e ler
`getComputedStyle` na mesma avaliação devolve a cor **no meio da transição**.
Cheguei a medir 1,14:1 e a tirar uma captura com os números do calendário
invisíveis — os dois eram o quadro intermediário, não o resultado. Esperando
2s, 13,73:1. `void offsetHeight` força layout, não conclui transição.

## 27/08/2026 · O "+" virou um segundo símbolo de bloqueio

> *"ta de brincadeira, né / o botão novo agendamento ta com simbolo de bloquear"*

Renomear `.fp-new-btn.ghost` para `.vermelho` quebrou o botão de novo
agendamento: ele passou a mostrar o ⊘ do botão vizinho.

**O código-fonte estava certo** — o HTML dos dois botões nunca mudou. Quem
trocava era o painel de ícones da Manutenção, em tempo de execução. No registro
dele havia:

```js
{ chave: 'btn-novo', sel: '.fp-new-btn:not(.ghost) > svg' }
```

Com `.ghost` extinto, esse seletor passou a casar com **os dois** botões. E
`fpIconesMarcar` guarda como "desenho de fábrica" de cada chave o **primeiro que
encontra em ordem de documento** — que é o de bloquear. Daí em diante todo
`btn-novo` era pintado com o ⊘.

**Por que meu grep não pegou.** Procurei por `fp-new-btn ghost` e por
`.fp-new-btn.ghost`. A ocorrência estava escrita `:not(.ghost)` — a mesma classe
em outra forma. Procurar pelo seletor montado, e não pelo NOME da classe, é a
falha.

Agora cada botão tem **seletor próprio** (`:not(.vermelho)` e `.vermelho`), em
vez de um definido pela ausência do outro: assim renomear a variante não faz o
seletor de um invadir o outro.

Nada a limpar no banco — `mc_icons` tinha só três ícones de menu, e o padrão de
fábrica vive em memória. O recarregar já corrige.

No mesmo passe, a pedido: o card do calendário perdeu o título "Agenda visual" e
a linha "Selecione um dia para ver detalhes…". A legenda no pé já diz o que verde
e vermelho significam — era a mesma informação duas vezes. Medido depois: os dois
cards continuam com a mesma altura (352,1px, diferença 0) e o ano começa a 19px
do topo, exatamente onde começa o título do card ao lado.

## 27/08/2026 · Cabeçalho do calendário, e o botão "novo" perde a caixa

> *"quero o nome do mês centralizado, o ano encima, e as setas (…) uma de cada
> lado do nome do mês (…) sem container, só o ícone < e > na cor vermelho"*
> *"nos botões de bloquear data e adicionar agendamento (…) remover o container
> de fundo também, deixar padrão só o ícone"*

### O calendário

Era `AGOSTO 2026` à esquerda e duas setas em caixinha à direita. Virou duas
linhas: o ano em cima, miúdo e centrado; embaixo `‹  AGOSTO  ›`.

**Primeira versão errada, pega medindo.** Pus o ano DENTRO do bloco central e as
setas ao lado do bloco inteiro. As setas ficaram **6,2px fora do eixo do nome do
mês** — entre as duas linhas, parecendo não pertencer a nenhuma. Separando as
linhas, o `align-items: center` da fileira põe as setas na altura exata do mês.
Medido depois: mês centrado na linha **0px**, ano e mês entre si **0px**, as duas
setas contra o mês **0px** e **0px**.

As setas ficam nas **pontas**, e não coladas na palavra: coladas, elas mudariam
de lugar a cada mês (MARÇO e SETEMBRO têm larguras bem diferentes) e o alvo de
clique pularia pela tela.

### O botão "novo"

O pedido era para os dois botões da Agenda, mas ele disse **"deixar padrão"** — e
o CSS do celular já dizia, desde a passagem do iPhone: *"o + em azul, sem caixa,
no canto superior direito, não um quadrado preenchido"*. Ou seja, o celular já
era assim e só o desktop mantinha o quadrado azul. Aplicado nos **nove** botões:
as duas larguras de tela deixam de divergir e a regra do celular passou a cuidar
só do alvo de toque.

O alvo de clique **continua com 42px**; o que sumiu foi o fundo. Encolher o alvo
junto com o desenho deixaria um alvo de 26px.

Duas coisas que a retirada da caixa expôs:

- **O "+" de Atualizações era um `+` de TEXTO**, não um SVG. Dentro do quadrado
  azul passava; sem o fundo sairia com o tamanho da fonte do corpo, menor que os
  outros oito. Virou o mesmo SVG.
- **`.fp-new-btn.ghost` virou `.fp-new-btn.vermelho`.** Sem caixa não há mais
  fantasma nenhum, e nome que descreve o que o botão não é mais engana quem ler
  depois.

Vermelho da **marca** (`--primary`), não o de ação destrutiva (`--perigo`):
bloquear uma data não destrói nada, e na mesma tela as setas do calendário já
usam `--primary` — dois vermelhos quase iguais lado a lado leem como erro de
cor, não como significado.

Contraste medido nos dois temas, tudo acima do piso de 3:1 de ícone: setas
4,85/4,87 · bloquear 4,46/5,34 · "+" 3,69/5,43 · ano (que é texto) 5,25/6,02.

## 27/08/2026 · Destino na listagem vira logotipo

> *"vamos mudar aqui a tag destinos que tá como texto e vamos colocar a
> logotipo de cada destino"*

A coluna Destinos era etiqueta de texto em caixa colorida — `SHORTS  TIKTOK
+1`. Virou o logotipo de cada plataforma. Medido no mesmo viewport (1280×760),
com a mesma listagem:

| | antes | depois |
|---|---|---|
| coluna Destinos | 158,3px | **144,2px** |
| destinos visíveis antes do "+N" | 2 | **4** |
| altura da linha | 62,5–63px | 62,5–63px (igual) |
| tabela / sobra para rolagem | 1063,2 / 109px | **1049 / 95px** |

### Três fontes de arte, cada uma por um motivo

- **SVG embutido** para YouTube e Site: desenho simples, nítido em qualquer
  tamanho, 442 e 248 bytes.
- **SVG embutido para o TikTok, por medição.** O `tiktok_2.png` do repositório
  é a variante VAZADA da nota — sem corpo. Comparado lado a lado com o SVG, de
  16 a 40px, nos dois temas: o PNG sai lavado em todos. No SVG a nota tem corpo
  e ele segue o tema (`--dest-nota`: preto no claro, branco no escuro), que é
  exatamente o que um arquivo de imagem não faz.
- **PNG de 64px embutido como data URI** para Shorts, Reels (Instagram), Clips
  (Mercado Livre) e Ads (Google Ads): marcas com gradiente e desenho
  complicado. Redesenhá-las à mão seria errar a marca de alguém. Somam 28 KB.

O `site.png` (globo "www" azul) foi testado e **reprovado**: tem halo claro e
vira um bloco branco no tema escuro. Ficou o globo desenhado, que segue o tema.

### O que já existia, e por que virou um mapa só

Havia **três** conjuntos de logotipo para as mesmas marcas: `DEST_ICONS` (os
cartões de postagem), `platIcons` (Meus Posts) e os `<img>` soltos no HTML
estático. Todos agora leem de `FP_DEST_ARTE`.

Isso derrubou de vez uma bobagem antiga: o `Instagram.png` tem **5001×5001 e
1,3 MB**, e era baixado inteiro para desenhar 14 pixels na barra de filtro de
Meus Posts. Somando os três PNGs que saíram da rede, **1,4 MB a menos** —
contra 33,5 KB a mais no HTML (+2,3%), que não custa requisição e funciona
offline.

De quebra, um defeito que apareceu no caminho: na barra de Meus Posts os botões
**YT e YTS mostravam os dois o logotipo do Shorts** (ambos apontavam para
`yt_shorts.png`). Agora YT é o play do YouTube e YTS é o Shorts.

### Um defeito meu, achado medindo

`.fp-dest-lg` sem `line-height: 0` ficava alguns pixels abaixo do texto ao
lado: a caixa tem o tamanho do logotipo, e a entrelinha do texto ao redor a
empurrava. O mesmo tipo de coisa do selo "KIT" de mais cedo — caixa dentro de
linha de texto pede a entrelinha zerada.

### O que continua igual

A **barra de filtro** por destino segue em texto, e de propósito: ali a palavra
é a coisa certa, e ela ensina qual logotipo é qual na coluna logo abaixo.

Os PNGs originais continuam na raiz do repositório — são a fonte das versões de
64px e ninguém os apaga sem o dono mandar.

## 27/08/2026 · Incluir produto ou kit na Produção, e comentário no item da fila

> *"nesse botão + nós vamos incluir na lista de produção um produto ou um kit
> de produto (…) quero adicionar um aviso caso o usuário tente incluir um sku
> que já está na fila (…) mas mesmo após o aviso, quero que permita"*

### O kit é uma linha de `mc_photo_products`, não uma tabela nova

A fila inteira — listagem, prioridade, seleção em lote, separação, upload para o
Drive, galeria — é indexada por `sku`. Uma tabela paralela obrigaria a bifurcar
cada uma dessas funções. Com o kit sendo uma linha com chave própria
(`KIT-CFP327-FP757`, gerada a partir das peças), ele herda o fluxo inteiro sem
que nada disso saiba que kit existe. A chave é também o nome da pasta dele no
Drive — e tem que ser: a foto do kit é do conjunto montado, não de nenhuma peça.

Colunas novas: `kit_skus text[]`, `manual boolean`, `criado_por`, `criado_em`.
Todas com default, porque o upsert do `bling-sync` não as menciona e o Postgres
valida a tupla proposta antes de resolver o `ON CONFLICT`.

### "Incluir mesmo assim" faz coisas diferentes para kit e para produto

O aviso aparece **enquanto se digita** e o botão passa a se chamar "Incluir mesmo
assim". Daí em diante:

| situação | o que acontece ao insistir |
|---|---|
| kit igual já existe | nasce um **segundo** kit, sufixo na chave, pasta própria |
| produto já na fila | reaplica a prioridade escolhida no modal |
| produto já com foto | volta para a fila marcado como `refazer` |
| produto fora de linha | volta para a listagem e para a fila |

**Não existe segunda linha para o mesmo SKU avulso, e isso é decisão.** O SKU é
a chave da linha *e* o nome da pasta no Drive. Duas linhas do mesmo SKU
apontariam para a mesma pasta, e a reconciliação com o Drive — que casa por SKU —
nunca marcaria a segunda como fotografada: ela ficaria na fila para sempre. Quem
insiste quer o produto fotografado de novo, e é isso que acontece.

### O kit se abre na lista de separação

Um kit é **um** trabalho de foto e **várias** peças na prateleira. `fpSepGerar`
passou a expandir kits em uma linha por peça (`fpSepExpandirKits`) antes da busca
de localização e do PDF: cada peça leva o próprio endereço do Bling, marcada com
`[KIT]`, herdando a urgência do kit e saindo em sequência. Sem isso o estoquista
receberia uma linha escrita `KIT-CFP327-FP757`, sem localização — o kit não tem
endereço no Bling porque não é produto de lá.

### Comentário tem prazo

`mc_photo_comments` guarda o recado que não cabe na prioridade ("fotografar com o
suporte preto", "a peça chegou riscada"). Balão ao lado do nome do produto, com a
contagem e o rosto de quem falou por último; o mouse em cima abre a caixa com o
texto.

Ao finalizar a foto os recados são **fechados** (`fechado_em`), não apagados:
apagar tiraria a única resposta para "por que essa foto foi refeita três vezes".
Quem carimba é `fpLoteMarcarFeito`, o único ponto por onde um item vira
`fotografado`.

O avatar **não** é copiado para o comentário: é um data URI de dezenas de KB e
repeti-lo por linha engordaria a leitura inteira. O rosto é resolvido pelo
`autor_id` com um mapa de operadores lido uma vez.

### Dois defeitos meus, os dois achados medindo

**1. `.fp-prod-kit` já existia.** É a classe do montador de kit do Magis5
(`display:flex` + `margin-top:8px`). Minha regra vinha depois e ganhava no que
declarava, mas herdava a margem: medido, o selo "KIT" descia **4px** em relação ao
nome do produto — os outros dois filhos da linha centravam em 663,6 e ele em
667,6. Virou `.fp-prod-selo-kit`. A regra de procurar o nome antes de criar já
estava escrita em `padroes.md`; eu não a segui.

**2. O balão apagado reprovava em contraste.** `--text-dim` a 50% dava **2,7:1**
no escuro e **2,3:1** no claro, e a contagem de comentários é informação, não
enfeite. Com `--text-dim` só passa a 80%, que já não parece apagado. Medido nos
dois temas, `--text` a **62%** dá 4,7:1 no claro e 7,2:1 no escuro — e continua
visivelmente mais fraco que o nome ao lado.

### O que não deu para testar

O caminho de escrita ponta a ponta (criar de verdade um kit pelo painel logado)
não foi exercitado: as políticas agora exigem `authenticated` e eu não faço
login. Foi conferido de outra forma: o `INSERT` com exatamente as mesmas colunas
rodou no banco e voltou íntegro (e foi apagado depois), e todos os caminhos de
gravação do cliente foram exercitados com o `sb` estubado, conferindo o corpo de
cada chamada. Com a chave pública e sem login, `mc_photo_comments` lê `[]` e
escreve 401.

## 27/08/2026 · Login vira Supabase Auth (e o que a chave pública alcançava)

> *"aplicar algumas melhorias de segurança para não permitir vazamento de dados
> ou ações de bot no meu site"*

Medido **de fora**, com a chave publishable e sem estar logado:

| | resultado |
|---|---|
| `mc_admin_users` | legível inteira, com `password_hash` (SHA-256 **sem sal**) |
| criar/alterar operador | permitido — políticas `ALL … using(true)` para `anon` |
| clientes da landing | nome, WhatsApp e placa legíveis |
| financeiro | 3.852 lançamentos, 152 boletos legíveis |

A raiz não era política mal escrita: **`anon` era a única identidade que
existe**. Qualquer regra que deixasse o painel funcionar deixava um estranho
funcionar igual. Por isso o login veio primeiro — sem ele não há o que fechar.

### Migração preguiçosa, porque não há conversão possível

Os hashes guardados são SHA-256 sem sal; o Auth usa bcrypt. Não dá para
converter um no outro, e ninguém tem as senhas em claro. O único instante em que
a senha em claro existe é **quando a pessoa digita** — então é nesse instante que
a conta do Auth nasce, com a mesma senha. Ninguém troca de senha, ninguém
percebe, e da segunda entrada em diante a ponte nem é chamada.

A ponte (`mc-login`, chave de serviço) **nunca devolve token**: quem autentica é
o navegador. Devolver sessão criaria um segundo caminho de autenticação para
manter em pé.

### Três defeitos meus, os três achados por medição

**1. O limite de tentativas não limitava nada.** A primeira versão contava em
memória, dentro da função. Testado: **14 tentativas seguidas passaram todas** —
cada requisição cai num isolate diferente e o contador nasce zerado em cada um.
Contador de segurança que não conta é pior que nenhum, porque dá a impressão de
proteção. Refeito com contador no banco (`mc_login_tentativa`, upsert atômico):
barra na 13ª, por IP e por conta.

**2. `password_hash` era `NOT NULL`.** A ponte apaga o hash depois de migrar — e
a restrição rejeitava. Resultado na primeira entrada real do dono: a conta do
Auth foi criada **com a senha certa**, a gravação inteira falhou, a conta ficou
órfã e ele não entrava mais. Eu deveria ter conferido a restrição antes de
escrever `null` na coluna.

A correção não foi só derrubar o `NOT NULL`. As duas gravações eram uma só;
agora são **duas**, e por um motivo: o vínculo é essencial, apagar o hash é
faxina. Faxina que falha não pode custar o acesso de ninguém.

**3. Trocar a senha no perfil ia quebrar em silêncio.** Continuava gravando o
`password_hash`, que depois da migração não é mais consultado — a tela diria
"senha alterada" e o login seguiria aceitando só a antiga. Passou a usar
`auth.updateUser`.

### Fechando as políticas

Com o login provado, as políticas viraram `to authenticated`. A permissão de
quem está **dentro** continua a mesma de antes (`using(true)`) — muda só *quem*
é dentro. Assim o painel se comporta idêntico e o risco da migração fica no
mínimo.

A landing mantém exatamente o que usa, que são duas coisas: ler a view de datas
ocupadas e inserir uma solicitação. O `WITH CHECK` dessa inserção é a primeira
barreira contra robô — sem ele, `anon` podia inserir uma solicitação **já com
status `approved`**, ou seja, ocupar a agenda sem passar por ninguém, e mandar
texto de tamanho arbitrário.

Medido de fora depois, com a chave pública:

| | antes | depois |
|---|---|---|
| ler `mc_admin_users` (com hash) | liberado | `[]` |
| ler clientes da landing | liberado | `[]` |
| ler projetos, check-ins, bugs | liberado | `[]` |
| criar administrador | permitido | bloqueado pela política |
| inserir agendamento aprovado | permitido | bloqueado pela política |
| landing: ler datas ocupadas | ok | **ok** (26 datas) |
| landing: gravar solicitação | ok | **ok** (HTTP 201) |

### Três defeitos meus nesta etapa, os três achados por teste

**1. `mc_login_tentativa` ficou chamável por qualquer visitante.** Função em
Postgres nasce com `EXECUTE` para `PUBLIC`, e `anon` herda dali — meu
`revoke ... from anon, authenticated` não adiantou nada. Dava para chamar a RPC
com a chave de outra pessoa e inflar o contador até **trancar a conta dela**: um
controle de força bruta virando arma de negação de serviço.

**2. A ponte era um oráculo de enumeração.** Devolvia `401` para usuário
inexistente e `200` com o e-mail para quem já migrou — testado com senha errada,
o `200` saía igual. Dava para varrer nomes e descobrir quais existem sem acertar
senha nenhuma. Agora a resposta é sempre `{ok:true}`; o e-mail o navegador monta
sozinho, e quem recusa é o Auth, com a mesma mensagem para todo mundo.

**3. `mc_public_blocked_dates` tinha `security_invoker=true`.** Ela rodava com os
privilégios de quem chama; ao fechar as tabelas, a landing parou de enxergar as
datas ocupadas e **o calendário público ficaria todo livre**. Passou a rodar
como dona, igual à view de gravações. É seguro e proposital: ela devolve só a
coluna `date`.

> E um susto que não era: o `HTTP 401` ao inserir uma solicitação era do meu
> teste, não da landing — eu tinha pedido `Prefer: return=representation`, que
> exige leitura. A landing insere sem pedir retorno, e responde 201.

### O que ainda não foi feito

As políticas **continuam abertas**: fechar antes de o login novo estar provado
trancaria todo mundo do lado de fora. E as tabelas `mc_fin_*` são de outra
ferramenta do dono, que usa a mesma chave pública — enquanto ela não tiver via
própria, o financeiro segue legível.

---

## 27/08/2026 · Ajuda em todas as telas, boas-vindas com escolha, painel de ícones

### O "?" saiu da Fotografia

> *"quero expandir o botão de ajuda e tutorial para todas as outras páginas"*

**18 verbetes novos** em `FP_AJUDA`: dashboard de vídeo, Agenda, Check-in,
Projetos, Edição, Clips, Debriefing, as quatro de Performance, Templates,
Exportar, Usuários, Manutenção, Atualizações, Integrações e Meu perfil.

Os seletores dos passos foram **levantados no DOM em produção**, tela por tela,
antes de escrever qualquer coisa — passo que aponta para elemento inexistente é
descartado em silêncio, e um tutorial de dois passos onde deviam ser cinco não
dá erro nenhum.

E `fpAjudaChave()` deixou de ter lista fixa de quatro telas: **a chave é o nome
da view**. Acrescentar um verbete passou a ser o único passo para uma tela nova
ganhar ajuda — a lista fixa ficou desatualizada na primeira tela nova que
apareceu.

### O primeiro acesso agora pergunta antes

> *"no primeiro acesso do usuário, abra um pop-up de boas vindas ao invés de
> abrir direto o tour guiado, e quero dar opção para o usuário iniciar o tour
> guiado ou aprender sozinho"*

Antes o primeiro acesso caía direto no tour: tela escurecida, cartão apontando
para o menu, sem aviso e sem saída clara. Agora abre um pop-up que apresenta o
painel e dá a escolha.

**Escolher "explorar por conta própria" desliga também os tutoriais automáticos
de cada tela** (marca `auto-off`). Deixá-los ligados depois de a pessoa dizer
que prefere explorar seria emboscada em cada módulo novo. O `?` continua na
tela: nada fica inacessível, só deixa de ser imposto. Esc equivale a "sozinho".

`FP_TUT_VERSAO` 2 → 3, para todo mundo ver a nova entrada. Quem não quiser nada
dispensa tudo num clique — que é justamente o ponto da mudança.

### Dois defeitos que a fusão da Agenda tinha deixado

**O botão de abrir o projeto estava morto.** `openProjectDetail` percorre uma
lista de views **escrita à mão** e fazia `.style` no `getElementById` sem
guarda. Com Solicitações fundida na Agenda, `view-requests` deixou de existir, o
`null` derrubava a função inteira e o lápis não abria nada. Guarda nos três
laços crus e `'requests'` fora das listas — a mesma causa derrubaria
`backToProjects` e o roteador antigo do menu.

**A dica do botão ficava atrás do cabeçalho da tabela.** A coluna de ações, ao
virar `position: sticky`, passou a criar **contexto de empilhamento próprio**: o
`z-index: 200` da dica não vale fora da célula, e quem competia com o cabeçalho
era a *célula*, com `z-index: auto` contra os 5 do `<th>`.

De passagem: o aviso de entrada de solicitações pendentes procurava o item de
menu `'requests'`, que não existe mais — nunca mais apareceria.

### Painel de ícones: subir o SVG e escolher a cor

> *"a mesma coisa que tu fez com as cores do site, quero que tu faça com os
> ícones… um painel onde eu mesmo possa subir o svg que quero"*

Vive em `mc_icons`, uma linha por ícone trocado. O motivo é concreto: só numa
tarde foram **onze trocas de ícone da barra lateral, uma a uma**, cada uma
passando por mim.

**Como um ícone é trocado sem editar o HTML de origem.** O catálogo diz onde
cada ícone mora, de duas formas:

- por **seletor** — barra lateral (21), o `+` azul, o besouro flutuante;
- por **assinatura do desenho** — as ações das listagens, que são strings
  montadas dentro de cada render e não têm âncora estável nenhuma.

A assinatura é o que faz uma troca valer em toda aparição de uma vez. Medido em
Projetos: `acao-ver` aparece **171 vezes**, `acao-whatsapp` 104, `acao-excluir`
57, `acao-editar` 54 — inclusive dentro do menu "…" do celular, que usa o mesmo
desenho. Uma troca, 171 lugares.

O desenho de fábrica é **capturado do próprio DOM** na primeira vez que o ícone
aparece: não há uma segunda lista de SVGs para manter em sincronia com o HTML.

**A armadilha que custou uma volta:** comparar a assinatura escrita à mão com o
`innerHTML` do elemento nunca casa — o navegador expande `<path .../>` para
`<path ...></path>` ao ler de volta. As duas pontas têm de passar pelo mesmo
serializador. Medido com o mesmo desenho nas duas pontas: igualdade direta
falsa, igualdade via DOM verdadeira. Sem isso, o grupo "Ações das listagens" não
trocava nada e não dava erro.

**Segurança, porque SVG é conteúdo executável** e este vai para o banco e é
renderizado para a equipe inteira. `fpIcoHigienizar` roda antes de tudo.
Testado com um SVG malicioso bem formado: `script`, `foreignObject`, `image`,
`use`, `<a href="javascript:">`, `animate`, `onclick`, `xlink:href` e
`style="fill:url(#x)"` — **todos removidos**, sobrando só a geometria. Limite de
60 KB.

### O borrão: achatar cor destrói ícone de duas cores

> *"subi um svg personalizado mas olha como ficou"*

A logo do Mercado Livre subiu e virou uma **mancha cinza sem forma**. A causa foi
uma decisão minha: achatar toda cor em `currentColor` por padrão, para o seletor
de cor funcionar em qualquer arquivo.

Parte daquele desenho é **knockout** — uma forma clara POR CIMA da escura, que é
o que desenha as mãos. Achatando as duas na mesma cor, a de cima deixa de
recortar a de baixo e sobra a silhueta maciça. O padrão certo não é uma
preferência fixa: **é o desenho que decide**. `fpIcoCoresDistintas` conta as
cores e, de duas para cima, o ícone nasce com as do arquivo (e o seletor de cor
fica desligado, com a razão na dica).

Duas exportações comuns quebrariam do mesmo jeito, tratadas junto — as duas
verificadas com um arquivo de exemplo de cada:

- **Illustrator** põe as cores numa folha de estilo interna e liga por
  `class="st0"`. A folha não sobrevive à higienização (CSS aceita `url()` e
  `@import`) e o desenho chegaria **sem cor nenhuma**. Agora as cores são lidas
  do navegador e escritas como atributo antes da poda — só em elemento com
  `class`, senão o valor calculado (preto) destruiria a herança de
  `currentColor` de que o resto do sistema depende.
- **Figma com sombra** exporta `filter="url(#f0)"`. O `<filter>` sai na poda, e
  um filtro apontando para o que não existe faz o elemento **não renderizar** —
  é o que a especificação manda. Sumiria o desenho inteiro, sem erro. O atributo
  sai junto com o filtro.

O painel ganhou **prévia no tamanho real de uso (18px)** ao lado da ampliada —
desenho que funciona a 40px vira mancha a 18px, e é a 18px que ele vai viver — e
um "Como exportar o SVG" com as regras que valem.

> E o validador me enganou no meio disso: o comentário que eu tinha escrito
> continha a palavra `style` entre sinais de menor/maior, e a checagem de chaves
> do CSS varre o arquivo por essa marca — acusou um bloco desbalanceado que não
> existia. Mesma armadilha de agosto, mesma correção: não escrever a marca.

Dois detalhes que só aparecem ao fazer:

- Os atributos de traço (`fill`, `stroke`, `stroke-width`…) vivem no `<svg>` de
  origem e se perderiam ao guardar só o conteúdo. Vão para um `<g>` em volta.
- Para o seletor de cor funcionar em **qualquer** arquivo, toda cor fixa vira
  `currentColor`. Logo colorida tem escape: a caixa "cores do arquivo" guarda o
  desenho como veio.

---

## 27/08/2026 · Agenda absorve Solicitações, sessão com prazo, galeria refeita

### O carrossel mostrava pasta nova, não pasta com foto nova

> *"aqui na galeria de fotos recentes não tá sendo bem as fotos mais recentes"*

`drive-recentes` ordenava as pastas por **`createdTime`** — e a pasta de SKU
nasce quando o produto entra no catálogo, meses antes de alguém fotografar.
Agora é **`modifiedTime desc`**: subir foto numa pasta antiga mexe no
`modifiedTime` e não no `createdTime`, então é ele que responde "onde entrou
foto por último". A prova está no próprio dado: **FP-CAR-HAY997-8-1, criada em
2023-09-18 e fotografada em 19/08/2026** — pela ordem antiga nunca apareceria.

Junto veio o pedido de duas fotos por slide (o espaço é retangular): a função
passou a devolver `pastas`, cada uma com a **foto 1 e a foto 2** em ordem
natural de nome. Manteve `fotos` no formato antigo por um ciclo, e o cliente
normaliza os dois — resposta em cache não deixa o painel em branco.
Edge function **versão 2**, `verify_jwt: false`.

### Simetria, chapa e "foto cortada" eram três leituras do mesmo lugar

> *"garantir que a altura da galeria e do div fila por prioridade seja a mesma
> … reduza um pouco a opacidade da sombra … as fotos não estão centralizadas"*

Medindo, dois dos três não eram o que pareciam:

- **As colunas já tinham a mesma altura** (255px cada). O que não fechava era o
  *retângulo visível* da galeria, 15px acima do fim da fila: os pontos do
  carrossel ficam fora do palco e ocupam esses 15px. O olho compara as bordas
  visíveis, não as caixas. A fila passou a reservar essa altura no recuo de
  baixo e as linhas dividem por igual o que sobra — fecha com qualquer número
  de linhas. E o palco subiu de 220 para 252px, porque o pedido foi aumentar a
  galeria, não encurtá-la. Diferença medida depois: **0px**.
- **A foto não estava cortada embaixo.** As miniaturas do proxy são todas
  320×320 (medido em toda a amostra); em `object-fit: cover` numa célula de
  232×240 perdiam **8px na horizontal e zero na vertical**. O "cortado embaixo"
  era a chapa do rótulo a `.72` escurecendo os 50px de baixo. Virou `contain`
  (não corta em nenhuma proporção) e a faixa caiu para `.46`, com sombra na
  letra em vez de chapa forte.

### O corte da foto tinha duas fases

Ele voltou dizendo que a foto continuava cortada e as alturas diferentes. A tela
dele era **anterior ao deploy** do `contain` — medido na largura real dele
(1830px, 1400 úteis): `difBordas: 0` e `object-fit: contain`. Mas ele estava
certo sobre haver problema, só não era o que parecia:

1. `cover` numa célula de **341×252** cortava **89px, 26% da foto** — muito pior
   do que os 8px que eu havia medido a 1280.
2. `contain` com células de `1fr` matou o corte e criou buraco: a foto quadrada
   fica **252×252 centrada em 341**, ou seja 44px de vazio de cada lado e
   **88px de buraco entre as duas**.

Correção: as duas fotos ocupam a **altura** do palco e a largura que a proporção
pedir, coladas por 3px, o par centrado. Nada cortado, e o que sobra vai para as
bordas de fora. Medido: 252 + 3 + 252, margem de 89px simétrica.

E o fundo do palco passou de `--bg-elev` para `--bg-card`: **38 das 40**
miniaturas são 320×320, então essa margem existe quase sempre — em cinza claro
ela virava um retângulo em volta de foto de produto em fundo branco; no branco
do cartão ela é a própria mesa da foto.

### O primeiro acesso tinha dois donos

> *"criei um novo usuário e apareceu o tour guiado de boas vindas. Mas abriu
> imediatamente um pop-up de updates"*

Duas causas, cada uma sozinha suficiente:

**1. O aviso de entrada não sabia do boas-vindas.** `maybeShowMentionPopup` só
checava se já tinha aberto uma vez por carregamento. Agora espera enquanto o
pop-up estiver na tela, o tour rodando, o tutorial da tela na fila, ou o
boas-vindas ainda não visto — dois diálogos ao mesmo tempo é um por cima do
outro. Ele volta no próximo carregamento, quando houver o que dizer.

**2. Para conta nova, todo o changelog contava como novidade.** A peneira agora
é a **data da conta**: nota publicada antes de a conta existir é histórico, não
novidade.

Escolhi a data da conta em vez de "carimbar tudo no primeiro acesso" por dois
motivos concretos: carimbar tem corrida com o `loadUpdates` (o `UPDATES` pode não
ter chegado aos 900ms em que o boas-vindas abre), e não alcança quem já passou
por esse momento — como o usuário que o dono acabou de criar.

Conferido contra as seis contas, no banco e na função, com o mesmo resultado:

| conta | criada | já fechou | publicadas antes | **novidades** |
|---|---|---|---|---|
| harry | 16/04 | 15 | 0 | 0 |
| patrik | 16/04 | 0 | 0 | **15** |
| andre | 05/08 | 15 | 0 | 0 |
| jose | 25/08 | 0 | 12 | **3** |
| matheus | 26/08 | 15 | 15 | 0 |
| **yonan** | **27/08** | **0** | **15** | **0** |

`yonan` é o usuário do relato: eram 15 notas por cima do próprio tour, agora são
zero. `jose` continua vendo as 3 que saíram depois da conta dele, e `patrik`, que
está aqui desde antes de todas, continua vendo as 15.

O contador do menu passou a usar a mesma peneira — contador e conteúdo têm de
contar a mesma coisa, senão o menu promete uma novidade que não existe do outro
lado. O módulo Atualizações continua mostrando tudo: lá o histórico é o assunto.

---

### Usuários no formato padrão

Eram duas caixas lado a lado: a lista numa e um formulário fixo de 340px na
outra. O formulário virou modal no **+** do cabeçalho, como em Projetos, Clips e
Agenda — ele custava largura numa tela que é listagem e ficava na frente o tempo
todo para uma ação que acontece uma vez por contratação.

A métrica que faltava é **"Sem módulo"**: operador criado e sem permissão entra
no painel e não vê nada, e isso só aparecia quando a pessoa reclamava. Tem aba
própria e cor de atenção. "Remover" e "Permissões" viraram ícone na última
coluna, e o acesso ganhou coluna — Total, N módulos ou **Nenhum**.

**O patch de DOM saiu.** `fpInjectPermUI` procurava a última célula de cada linha
e pendurava ali o botão "Permissões" depois do render; com a tabela nova ele
enfiaria o botão dentro da coluna de ações, atrás dos ícones. A decisão passou
para `renderUsers`, onde o dado está — mesma correção da coluna Roteiro na
Edição.

Dois defeitos que a reescrita revelou, os dois escondidos por um `catch`:

- **O roteador apagava a lista logo depois de carregá-la.** `case 'users'` fazia
  `await loadUsers()` (que já renderiza) e em seguida `renderUsers()` **sem
  argumento**. O embrulho que eu removi engolia o `TypeError` em silêncio; sem
  ele, a chamada sem lista limpava a tela.
- **`loadUsers` não trazia `modules`.** A coluna Acesso e a métrica "Sem módulo"
  saem dele — a tela diria "Nenhum" para a equipe inteira.

Medido: 6 colunas, 6 linhas a 62–63px, cabe em 1174px, e as ações certas por
papel (o próprio usuário sem nenhuma, administrador só com a lixeira, operador
com escudo e lixeira).

---

### O ícone "sumido": três causas empilhadas, todas minhas

Ele subiu o arquivo e o ícone ficou irreconhecível. A imagem sugeria máscara de
recorte; **inspecionar o que foi salvo em `mc_icons` mostrou outra coisa**:

| | viewBox guardado | proporção |
|---|---|---|
| `nav-clips` | 681,43 × 470,07 | 1,45 : 1 |
| `nav-debriefing` | 511,02 × 448,96 | 1,14 : 1 |

**1. viewBox retangular numa caixa quadrada.** O ícone vive num quadrado de
18px. Um viewBox 1,45:1 é encaixado por dentro: o desenho ocupa a largura e
sobra faixa vazia em cima e embaixo — ele aparece menor e desalinhado dos
vizinhos. Agora o desenho é medido de verdade (`getBBox`, com o SVG **preso ao
documento**, que é a única forma de o navegador calcular) e o viewBox é
reescrito como um quadrado centrado nele, com 6% de respiro. A espessura do
traço entra na conta — `getBBox` devolve a geometria e ignora o traço, então
metade dele ficaria fora do quadro. Ícone já salvo é enquadrado **na leitura**,
sem novo upload e sem escrita no banco.

**2. `fill: none` herdado da folha de estilo da tela.** `.nav-item svg` manda
`fill: none; stroke: currentColor`. Tirar os *atributos* do `<svg>` de destino ao
aplicar um ícone próprio não basta: **regra de folha vence atributo**, e o valor
desce por herança. Um desenho preenchido chegava com `fill: none` e aparecia só
pelo traço — 1 unidade num viewBox de 763, ou seja **0,02px** na tela. Medido:
`fillCalc: "none"`. A base passou a ser preenchimento na cor do lugar, via
`svg[data-ico-estado^="c"]`; quem tem atributo próprio no `<g>` continua
mandando, porque **atributo do próprio elemento vence valor herdado** — ícone de
traço e logo colorida seguem intactos.

**3. Classe órfã.** A folha de estilo interna nunca sobrevive à higienização,
então um `class="cls-1"` que reste não liga a nada — e o desenho fica sem o fill
que morava lá, caindo no preto padrão do SVG. O atributo morto passou a sair, e
desenho sem nenhuma cor declarada ganha `fill="currentColor"` no `<g>`.

**O que não dá para consertar de fora:** um arquivo subido pelo pipeline antigo
teve as cores perdidas junto com a folha de estilo. Não há o que recuperar — a
logo do Mercado Livre virou silhueta maciça porque a separação entre as duas
cores deixou de existir no que foi guardado. Re-subir resolve; hoje o
Illustrator é tratado na entrada.

---

### Filtro por destino: fixo, no modelo da barra de ações em massa

> *"esse filtro por destino vamos deixar fixo e no mesmo modelo que fizemos com
> a barra de ações em massa lá em produção"*

Era um botão com moldura que abria um painel: duas interações para um filtro que
se usa sempre, e uma caixa branca no meio de uma tela que não tem mais caixas.
Virou barra grudada no topo com fio embaixo e sombra só quando gruda — a mesma
mecânica de `.fp-lote-slot` / `fpLoteSombra`, com o respiro de 54px reservado no
`#projectsList`. O rótulo de cada destino leva **o tom exato da tag da linha**,
agora em token (`--dest-*`).

Um defeito achado aí: **`display: inline-flex` da classe `.fp-lote-link` vence o
`[hidden] { display: none }` do navegador**, então o "Mostrar todos" ficava na
tela sem filtro nenhum aplicado. Precisou de `.fp-lote-link[hidden]`.

> Não deu para observar a sombra aparecendo na rolagem: a aba do painel de
> navegação deste ambiente reporta `document.hidden: true` e não despacha evento
> de `scroll` (mesmo artefato que já tinha derrubado o `requestAnimationFrame`).
> O que ficou verificado é a lógica: com a barra grudada, `fpLoteSombra()` marca
> `grudada` e a sombra entra em transição.

### "Detalhes do dia" até a borda

Os tetos de largura (600/680/820/960px) eram de quando o painel era faixa com
fio. Em caixa, parar antes da borda deixava a tela desalinhada com a tabela
abaixo. Sem teto: borda direita do painel **1745px**, igual à da tabela.

### Solicitações virou a listagem da Agenda

> *"acho que podemos fundir o módulo Solicitações com Agenda… as solicitações
> devem ir direto pra lá com a mesma funcionalidade"*

Eram dois módulos sobre o mesmo dado. A listagem foi inteira e sem perda
(métricas, abas, busca, oito colunas, detalhe, WhatsApp), com o calendário em
cima como visualização. O contador de pendentes foi para o item da Agenda: é o
motivo de olhar a tela.

**Calendário e detalhe do dia em caixa branca**, pedido explícito — mesmos
valores do `.table-wrap`. "Fios, não caixas" vale para **linha de listagem**;
estes dois são painéis de consulta, do mesmo tipo da moldura da tabela. E as
duas caixas ganharam altura igual: 397 e 178px lado a lado leem como tela
inacabada, o que em faixa com fio não aparecia.

`requests` continua valendo como **apelido** de `calendar` em `switchToView` e
`fpShowView` — há favorito de `#requests`, o aviso de entrada aponta para
`'requests'` e as listas de permissão guardam essa chave. E `fpAllowedSet`
passou a implicar `calendar` para quem tem `requests` em `modules`: sem isso,
quem tinha Solicitações e não tinha Agenda perderia a tela na fusão.

Saiu a listagem do mês que eu havia feito horas antes — a de Solicitações a
substitui com mais colunas e o dado inteiro.

### A tela de login piscava em cada F5, e a sessão não vencia nunca

> *"quando dou reload na página ela meio que carrega a tela de login novamente
> … quero remover essa regra [de auto login] também"*

A decisão de mostrar login ou painel só acontecia **depois** de uma consulta ao
banco: meio segundo de tela de entrar em cada recarga, com a sessão já válida no
navegador. Passou para um **script síncrono no fim do `<head>`** — se há sessão
viva, o `<html>` recebe `fp-entrando` e o CSS revela o app na primeira pintura.
A validação contra o banco continua em `checkAuth` e **desfaz** a revelação se o
id não existir mais (`fpVoltarAoLogin`). O menu segue escondido até a filtragem
por papel: adiantar a moldura não pode adiantar a lista de módulos.

E o "fica logado para sempre" saiu. Dois prazos:

| prazo | valor | o que pega |
|---|---|---|
| inatividade | **12h** | o computador do estúdio aberto de um dia para o outro |
| máximo | **7 dias** | quem usa todo dia e nunca mais digitaria a senha |

Quem renova o prazo é **toque de gente** (`pointerdown`, `keydown`, volta de
aba), gravado no máximo a cada 5 min. O relógio de 1 minuto só *confere*: se
fosse ele a renovar, uma aba esquecida se renovaria sozinha para sempre e a
inatividade nunca venceria — que é justamente o caso que ela existe para pegar.

Sessão aberta antes do controle não tem prazo gravado e vale como se começasse
agora: ninguém é deslogado pela atualização em si. `fp_session` continua
guardando só o id (outras oito partes do arquivo leem essa chave direto); os
prazos vão em `fp_sessao_meta`.

Testado nos dois sentidos: com `uso` recuado 13h, `FP_SESSAO.ler()` devolve
`null`, apaga as duas chaves e o F5 seguinte cai na tela de entrar sem
`fp-entrando`.

---

## 27/08/2026 · "Tu fez tudo errado": o padrão era a página, não a tabela

> *"deixa de ser burro cara, olha a primeira imagem que te pedi e olha a segunda
> o que tu fez. Eu quero o mesmo padrão da primeira foto nas paginas projetos,
> edição e clips"*

Eu havia adotado só a tabela — e nem ela por inteiro. Comparando as duas telas
com `getComputedStyle` (não de memória), os deltas:

| | Solicitações | o que eu tinha feito |
|---|---|---|
| moldura | `.table-wrap`: cartão, fio, canto 14px | nenhuma |
| fundo do `<th>` | `--bg-elev` (faixa cinza) | **branco** (`--bg-soft`) |
| `<th>` grudado no topo | sim | não |
| recuo da célula | 14px 16px | 12px, zero nas pontas |
| altura da linha | 63px, constante | 59 a 109px |
| status | pílula | `<select>` com borda e seta |
| barra de filtro | abas neutras + busca + contagem | chips coloridos + 2 selects + botão |
| métricas | quatro, sem caixa | nenhuma |

**A causa raiz do cabeçalho branco:** `.table-wrap thead th` é quem pinta
`--bg-elev`. Fora do wrapper vale `th { background: var(--bg-soft) }`, que no
tema claro é quase branco. Eu tinha tirado o wrapper por causa da regra "sem
containers" — que vale para **linha de listagem**, não para a moldura da tabela
de referência.

E o recuo de 12px era o sintoma: eu raspei pixel do recuo para caber sete
colunas em vez de tirar tralha da linha. Voltou para 14×16 e a largura veio de
onde devia:

- produtos compatíveis do Bling saíram da linha (era **uma busca de rede por
  linha, a cada re-render**) e foram para o resumo do projeto;
- painel de cinco estrelas + botão "avaliar" virou nota compacta na sublinha
  (`.fp-nota`) — não um sexto ícone, porque cada ícone custa 34px de coluna;
- selos de destino: no máximo dois e o resto em "+N" (empilhados, três levavam
  a linha de 63px para 109px);
- placa da moto na sublinha, como o par Moto/placa de Solicitações. Inteira numa
  linha, "Kawasaki Versys 650 2026 (TQF0J92)" quebrava em três linhas.

**Nenhuma célula quebra em três linhas.** Título e nome de moto cortam com
reticências (`.fp-1l`) e o texto inteiro vai em `data-tip`. Foi o que fechou a
conta: 1211px → 1146px, exatamente a largura útil.

Medido em produção a 1280×860, com a barra lateral aberta:

| tela | colunas | linhas | altura | cabe |
|---|---|---|---|---|
| Projetos | 7 | 48 | 63px em todas | 1146/1146 |
| Edição | 7 | 11 | 63px em todas | 1146/1146 |
| Clips | 5 | 6 | 69px (miniatura de 40px) | sim |
| Agenda | 6 | 38 | 63px em todas | 1146/1146 |

### Duas mudanças de comportamento, ditas em voz alta

- **Projetos: status virou aba de escolha única.** Os chips do computador eram
  múltipla escolha e o `<select>` do celular era escolha única — a mesma tela com
  duas lógicas. Unifiquei na do celular. O filtro de destino continua múltiplo,
  porque é outro eixo, e saiu da caixa: virou ação de texto.
- **Edição ganhou as abas Em edição / A publicar / Todos.** As métricas da tela já
  falavam de "A publicar" e de "Total no pipeline" sem que houvesse jeito de ver
  essas listas: o número prometia uma tela que não existia.

### Agenda entrou no mesmo formato

> *"aqui na agenda vamos aplicar também o mesmo padrão que acabamos de aplicar
> em projetos e etc"*

A página respondia **um dia por vez** e a metade de baixo ficava vazia. Agora tem
métricas (aprovados, pendentes, bloqueios, dias livres) e, abaixo do calendário,
a **agenda do mês** em tabela — abas com contagem, busca, cabeçalho ordenável.

Não é o Solicitações de novo: o recorte é o **mês que o calendário está
mostrando**, e os **bloqueios entram como linha**, porque ocupam data igual a um
agendamento (o motivo ocupa o lugar do nome, que é a informação que ele tem).
Navegar de mês redesenha as duas coisas.

"Dias livres" conta **dia útil** sem aprovado e sem bloqueio: contar oito fins de
semana como vagos daria um número que não significa nada.

Uma aba faltava e a conta denunciou: `13 + 0 + 4 + 3 ≠ 38`. As 18 rejeitadas do
mês não tinham como aparecer.

### Prancheta animada virou componente

> *"aqui em debriefing, nesse div da nota média, quero que o fundo seja a mesma
> animação da tela de login e da sidebar"*

`.fp-bp`: papel milimetrado + traçado técnico + dois brilhos que passeiam em 19s
e 27s (períodos sem divisor comum, para o quadro não repetir). Substituiu um
gradiente parado de três cores no cartão da nota do Debriefing.

Três coisas não se copiam do login: a **escala** da malha (16px/64px, não
24px/120px — na altura de uma caixa a do login daria duas linhas e meia), o
**peso** (sobre o branco de `--bg-card` os valores do login viram papel
milimetrado de verdade e competem com o número; valem o da barra lateral, um
terço) e o **traçado**, que é desenhado para 900×160 — o do login entra cortado.

### A largura útil muda quando ele recolhe a barra lateral

Todas as medidas de "cabe em 1146" foram feitas com a **barra recolhida**. Com ela
aberta numa tela de 1280 a largura útil cai para **954px** — e aí Projetos (1138),
Clips (1057) e Edição (1038) rolam de lado. Solicitações cabe porque suas oito
colunas são curtas e encolhem sozinhas; as minhas têm título e nome de moto presos
a um teto que não desce abaixo do min-content.

A saída não foi raspar recuo nem tirar ação: a **coluna de ações gruda na direita**
(`position: sticky; right: 0`). Rola o que precisa rolar e os botões da linha nunca
saem de vista. Medido a 954px: Agenda cabe inteira, e nos outros três as ações
continuam visíveis com a tabela rolada.

### Três defeitos de celular que só apareceram ao medir a 375px

O `.table-wrap` que devolveu a faixa cinza no computador trouxe herança que não
servia para o celular. Todos medidos, nenhum visível "no olho" numa lida rápida:

- **`.table-wrap table { min-width: 640px }`** (regra de tabela que rola de lado)
  vencia `.fp-lista { min-width: 0 }` por especificidade — (0,1,1) contra (0,1,0).
  A tabela virava blocos e mantinha 640px dentro de um `main` de 307px: as
  células da direita ficavam fora da tela **e sem rolagem para alcançá-las**.
  Solicitações escapava por usar id (`#reqTable`, 1,0,1).
- **`width: 1%` na última coluna** é regra de tabela (célula de ação não estica).
  Na linha flex do celular deixava a célula com 3,5px e o botão "…" de 26px
  vazava: de 360 a 386, ou seja, 11px fora da tela — e no celular esse botão é o
  **único** caminho para as ações da linha.
- **A barra recolhida no computador roubava 68px da tela do celular.** `.shell`
  (0,1,0) perdia para `.shell.collapsed` / `.shell.hover-mode` (0,2,0), que são
  preferência de desktop guardada no `localStorage`. Quem recolhia a barra no
  escritório levava para o celular uma faixa morta de 68px — 18% da largura de um
  iPhone — com a barra em si já fora da tela. Esse é **anterior** às tabelas e
  valia para o painel inteiro.

O padrão que os três compartilham: **especificidade de classe atravessa `@media`**.
Regra de celular escrita com menos especificidade que a de computador não pega
nada, e não dá erro.

### A lição, que não é sobre CSS

Quando o dono aponta uma referência, a entrega é **aquela** referência, medida
lado a lado, e não a minha leitura do princípio que ela ilustra. "Sem
containers" era um princípio verdadeiro aplicado no lugar errado — e o custo foi
uma tela que parecia certa em tudo, menos no que se vê primeiro.

---

## 27/08/2026 · Projetos, Edição e Clips viram tabela

> *"eu gostei desse modelo aqui, vamos tornar padrão esse formato de listagem
> para as paginas PROJETOS, EDIÇÃO e CLIPS"*

O formato da tabela de Solicitações virou o padrão: **cabeçalho ordenável, fio
entre as linhas, ações na última coluna**. Classe `.fp-lista`.

| tela | colunas |
|---|---|
| Projetos | Projeto · Destinos · Moto/Produto · Data · Custos · Status · Ações |
| Edição | Projeto · Destinos · Moto/Produto · Data · Roteiro · Status · Ações |
| Clips | Clip · Produto · Gravado · Status · Ações |

**O que era cartão foi para o detalhe.** Observação longa, prévia de roteiro,
PDF embutido e produtos do Bling não cabem numa linha — a listagem existe para
varrer, e o detalhe para ler. Na Edição, a coluna **Roteiro** diz o que ele *é*
em uma palavra ("7 cenas", "PDF", "Texto") e o botão abre o modal certo.

### Ordenação: dois arranjos, de propósito

- **Projetos** já tinha um `<select>` de ordem que o celular usa. O cabeçalho
  **escreve nesse select** e re-renderiza: um estado só. Quatro ordens novas
  (moto, custo, status) entraram apenas para o cabeçalho e **não** estão no
  select — ele ficaria com dez opções.
- **Edição e Clips** não têm select, então ganharam estado próprio com um helper
  compartilhado.

**Status ordena pela etapa do fluxo, não pelo alfabeto:** "A publicar" vem
depois de "Edição" no trabalho real e antes dele no dicionário.

### Três defeitos que a conversão revelou

- **A tabela de Projetos estourava a largura em 96px** e a coluna de ações
  ficava fora da tela — o operador não via os botões sem rolar de lado. Recuo de
  16px para 12px por célula e zero nas pontas, o que também alinha a tabela com
  o resto da página.
- **Largura de coluna por posição vaza.** A regra que estreitava os destinos
  estava escrita como `td:nth-child(2)` e valia para a segunda coluna de
  *qualquer* listagem: no Clips a segunda coluna é o produto, que ficou esmagado
  em 116px — nome, SKU, preço e estoque viraram uma torre de duas letras por
  linha. Agora é por classe.
- **Havia um patch que procurava `.edit-card` no DOM** para repontar o botão do
  roteiro para o modal novo. Sem cartão ele não tinha onde agir — a decisão
  passou para o renderizador, onde o dado está.

Junto: a **barra de filtro do Clips** era seis pílulas com `style` inline
montado em JS e virou aba com sublinhado; e as **métricas da Edição** eram três
caixas com chapa colorida atrás do ícone, o último lugar do painel com isso.

---

## 27/08/2026 · Carrossel das fotos novas, e a animação vai para o banco

> *"acho que aqui no dash faz mais sentido a gente tirar essa animação e colocar
> algo mais útil (…) Guarde essa animação no banco de dados pois vou pensar onde
> podemos usá-la posteriormente"*

O espaço ao lado da Fila por prioridade mostra agora **as 20 pastas de SKU
criadas mais recentemente no Drive**, com a **primeira foto de cada uma** — a
mesma que a listagem usa como miniatura. A ordem é sorteada a cada abertura.

**A animação não foi jogada fora.** O SVG inteiro (8.876 caracteres) está em
`mc_guardados`, chave `anim-fluxo-foto`, com título e descrição do que ela
mostrava. Tabela nova, criada para isso: peça pronta que sai do painel e ninguém
quer perder.

### `drive-recentes`, função nova

Lista as pastas por `createdTime desc` e busca a primeira imagem de cada,
**quatro por vez** — 20 em paralelo levam 429 do Google —, com **dez minutos de
cache** no isolate. Sem o cache, cada operador que abrisse o Dashboard pagaria
21 idas ao Drive.

Os **bytes** continuam saindo do `drive-proxy`: ele já tem a guarda de "só
arquivo de pasta filha da raiz" e o cache de um dia no navegador. A função nova
devolve só URLs.

Por que não uma ação nova no `drive-proxy`: ele tem ~700 linhas e acrescentar
uma leitura ali significa reimplantar tudo. O preço é a duplicação do JWT da
conta de serviço, consciente.

### Quatro decisões do carrossel

- **Todas as `<img>` no DOM de uma vez, trocando opacidade.** Trocar o `src` a
  cada passo fazia a foto sumir e reaparecer, e o navegador rebaixava tudo de
  novo ao voltar.
- **Fisher-Yates, não `sort(() => Math.random() - .5)`.** O segundo parece
  embaralhar e não embaralha: a ordem depende do algoritmo de ordenação e as
  primeiras posições ficam viciadas.
- **Clicar na seta reinicia o relógio**, senão a troca automática pode cair
  200ms depois do clique e passar duas fotos de uma vez.
- **`prefers-reduced-motion` desliga a troca automática.**

Carregado **depois** do painel pintado: a leitura do Drive leva alguns segundos
e o número que o operador espera não pode esperar por foto.

**Pendência que eu criei:** existe uma pasta `ZZ-TESTE-UPLOAD-CLAUDE` no Drive,
de um teste de upload meu, e ela é a mais recente — aparece no carrossel. Apagar
a pasta no Drive resolve.

---

## 26/08/2026 · Fim dos cartões nas telas de vídeo, performance e configurações

`.cal-card`, `.edit-card`, `.proj-card` e `.tpl-card` eram quatro caixas com
fundo, borda e canto arredondado — o padrão antigo. Agora são **seções e itens
separados por fio**, como as listagens da Fotografia, com o mesmo realce de
hover.

Feito **num lugar só**, e não tela a tela: são **85 usos** espalhados por 17
telas. Os títulos de seção desceram de 18px para 13px com espaçamento, o mesmo
desenho das faixas das listagens.

### Projetos: filtro é aba, não pílula

A regra já estava em `contexto.md` e Projetos era a tela que a contrariava —
seis pílulas de cor cheia competindo com a listagem inteira. Agora a cor do
estado vai no **texto e no fio embaixo**.

O mapa de cor virou **um token por chip** (`--chip-cor`) com duas regras de
ativo em cima; eram 50 regras de fundo, borda e cor de texto nos dois temas.
Planejamento, produção e concluído passaram a puxar `--prio-1`, `--warning` e
`--success`, então seguem o seletor de cores da Manutenção. Só a marca das
plataformas fica fixa — é cor de terceiro.

**Selo de destino e pílula de status no tema claro** tinham chapa de cor cheia,
o único lugar do painel onde um rótulo virava bloco solido. Viraram tinta, como
já eram no escuro.

### Integrações

Cada serviço era um cartão **dentro de outro cartão**. Virou listagem com fio,
na largura da página; o recado de como a conexão funciona perdeu a chapa azul; e
saíram 14 blocos de `style` inline, trocados por cinco classes.

**Armadilha:** trocar o container de `.cal-card` por uma classe própria levou o
estilo do título com ele — `h3` e `.sub` eram estilizados **pelo cartão**, e o
subtítulo ficou maior que o título até eu redeclarar.

**O que ainda não foi revisto tela a tela:** Agenda, Edição, Debriefing,
Influenciadores e Bonificação ganharam o fio no lugar do cartão, mas ainda têm
`style` inline e botões com cor própria no HTML gerado por JS. O container era o
que mais entregava idade; o resto é acabamento.

---

## 26/08/2026 · Meu perfil sai do cartão

O cartão de 480px saiu. As seções se separam por **faixa de título e fio**,
como as listagens do painel, e os campos ficam em pares.

- **O verde de largura inteira virou `.action-btn`.** Salvar um formulário não
  precisa de uma barra do tamanho da tela.
- **As ações da foto viraram texto.** Trocar a própria foto não é a ação
  principal da tela — e o azul do "Alterar foto" e a borda vermelha do
  "Remover" eram os dois únicos botões do painel com desenho próprio.
- **720px de largura, escolhido e não chutado:** com coluna mínima de 232px e
  vão de 22, é a largura que fecha **duas** colunas. A 940 cabiam três, e as
  seções de quatro campos ficavam 3+1 — dois buracos por fileira. Formulário lê
  melhor em pares.
- Cada ação ganhou dica no hover e cada rótulo ganhou `for` ligando ao campo.

---

## 26/08/2026 · Tour de boas-vindas, e o motivo de o tutorial voltar

> *"Hoje fui entrar e recebi o tutorial novamente. Quero garantir que seja
> imposto o tour guiado somente na primeira vez que o usuário acessa de fato."*

**A causa: quem já viu estava no `localStorage`.** "Primeira vez" é um fato da
**pessoa**, não do navegador — em outra máquina, em outro navegador ou numa
janela anônima, tudo voltava a ser primeira viagem. A marca passou para a coluna
`tutoriais` de `mc_admin_users`. Subir `FP_TUT_VERSAO` continua sendo o jeito de
fazer todo mundo rever.

**Tour de boas-vindas**, uma vez na vida, antes de qualquer tutorial de tela:

1. o menu lateral e o que ele mostra de acordo com a permissão;
2. as preferências no botão da foto — tema, idioma, notificações;
3. **a Conta, dizendo com todas as letras que é ali que se troca a senha
   padrão**;
4. o besouro, que reporta bug de qualquer tela e até por cima de um popup;
5. o `?`, explicando que os tutoriais das telas podem ser revistos quando quiser.

O painel do `?` ganhou "Rever o tour de boas-vindas", discreto, abaixo do
tutorial da tela.

### Três defeitos que o tour geral revelou

- **O tutorial da tela abria por cima do boas-vindas.** A marca é gravada
  *antes* de abrir (para o tour não recomeçar se a pessoa recarregar no meio),
  e a chamada seguinte de `fpAjudaAtualizar` então via o boas-vindas como "já
  visto" e soltava o da tela. Quem controla a fila agora é uma bandeira própria,
  viva só enquanto o tour geral está pendente ou rodando.
- **`offsetParent` não é teste de visibilidade.** Para elemento
  `position: fixed` ele é **sempre** `null` — e foi o que derrubou o passo do
  besouro: o botão estava na tela, com 42×42, e mesmo assim era descartado. O
  teste virou área real mais `display` e `visibility`.
- **Desistir de abrir um tour não avisava quem esperava.** Sem passo visível,
  sem verbete ou com outro tour já na tela, o da tela ficava preso na fila para
  sempre.

**Passo com preparo.** Os passos ganharam `antes` e `depois`: o da Conta **abre**
o menu do usuário para poder apontar o item, e fecha ao sair — inclusive quando
se sai no meio, senão o menu fica aberto. Esses passos não passam pelo filtro de
alvo visível (o item nem está na tela antes do preparo): são aceitos de antemão
e o próprio `fpTutIr` pula se na hora não houver nada.

**Armadilha de medição, de novo.** O passo do menu lateral aparecia como
descartado nos meus testes: o painel do navegador estava com viewport de
**0×0**, e tudo dimensionado em `vh` computa zero. Com a janela emulada em
1280×860, os cinco passos aparecem e cada recorte casa com seu alvo. Antes de
culpar o código, confira `innerHeight`.

---

## 26/08/2026 · O seletor cobre o painel inteiro, e a Fotografia ganha dicas

> *"amplia esse controle de cores para todas as cores do site com uma descrição
> de onde é usado"*

De dez realces para **33 tokens por tema**, em oito grupos: fundo, linhas,
texto, realce, ação destrutiva, prioridade, os seis selos de status e a seta de
ordenação. **Cada campo diz onde aquilo aparece** — cor sem endereço vira
tentativa e erro.

Duas coisas que o alcance maior exigiu:

- **Chapa com transparência.** Vários tokens de fundo são `rgba` de propósito —
  no tema escuro a alfa pega o tom do cartão por baixo — e o seletor do sistema
  só sabe hex. Entra e sai hex, e a **transparência do padrão daquele token é
  reposta na saída**.
- **Aviso de contraste.** Texto, realce e os pares de selo mostram a razão WCAG
  ao lado do nome, calculada sobre a **cor final**: chapa com alfa é composta
  sobre o cartão antes de medir, senão o número mentiria. Fica amarelo abaixo de
  4,5:1 e **não bloqueia nada** — quem manda na cor é o dono; o número só tira a
  decisão do escuro.

### Dica no hover em tudo que se clica na Fotografia

> *"garanta que todos os elementos da sessão fotografia tenham hover de
> acessibilidade dando uma breve descrição do que cada botão faz"*

Abas das quatro telas, mostrar mais, ordenar da galeria, avaliar foto,
selecionar todos, limpar seleção, os quatro botões de prioridade em massa,
remover/voltar para a listagem, tamanho do lote, ver lógica, gerar lista,
concluir e cancelar lote, ir para Separação, sincronizar catálogo, e a lupa e o
X da busca.

Tudo por **`data-tip`**: o observador de ergonomia já transforma isso em `title`
e `aria-label`, então um atributo serve o mouse e o leitor de tela.

**A armadilha:** vários botões já tinham `aria-label` e mesmo assim não mostravam
nada no hover. **Nome acessível não é dica** — o `title` é outro atributo, e só
o `data-tip` gera os dois.

Conferido em produção: **513 elementos clicáveis** nas três telas (314 na
Produção, 129 na Galeria, 70 na Separação) e **zero sem dica**.

---

## 26/08/2026 · O dono escolhe as cores, não eu

> *"cria um seletor de cores pra eu pickar uma cor no seletor de cores pra cada
> cor de destaque do site. Assim eu personalizo a hora que quero, no tema que
> quero e mudo quando quero da forma mais fácil"*

**As duas tentativas de paleta saíram** e as cores voltaram ao que eram. No
lugar delas, **Manutenção → Cores de destaque**: dez campos com o seletor
nativo do sistema e caixa de hex ao lado, abas para tema claro e escuro, ponto
vermelho no que está fora do padrão, voltar-ao-padrão por linha e restaurar
tudo. A mudança aparece na hora na própria tela; **Salvar** aplica para a
equipe.

Os dez: vermelho da marca, vermelho no hover, amarelo de destaque, verde de
sucesso, laranja de atenção, vermelho de erro, vermelho destrutivo e as três
prioridades.

Decisões que valem registro:

- **Fundo, brancos, cinzas e o preto do texto ficam de fora.** São a base de
  leitura, não realce — abrir isso para escolha livre é o caminho curto para um
  painel ilegível.
- **Guardado em `mc_theme_colors`**: uma linha por tema, mapa `token -> hex`,
  RLS liberando `anon` (o painel não usa Supabase Auth).
- **Aplicado por folha de estilo própria no fim do cabeçalho**, com os **mesmos
  seletores** do arquivo (`:root,[data-theme="dark"]` e `[data-theme="light"]`).
  Mesma especificidade vindo depois ganha — sem `!important`.
- **Cache no navegador junto com o banco.** A leitura leva uns 200ms e sem ele
  o painel abria no vermelho de fábrica e trocava de cor na cara de quem estava
  olhando.
- **Papel desconhecido não limpa a caixa.** No boot com `#manutencao` na URL o
  `renderBugs` roda antes de `CURRENT_USER` existir, e a guarda de admin apagava
  o painel para sempre: a tela ficava sem os campos e **sem erro nenhum**.

Fica dos experimentos descartados: `--prio-1..3` continuam token em vez de três
hex repetidos no CSS **e** no JS, e `fpPrioCor` devolve o token — senão as
barras do Panorama ignoram a cor escolhida.

### A lição

Duas rodadas gastas convertendo paleta por conta própria. O pedido real nunca
foi "acerte a cor" — era **"me dá o controle da cor"**. Ferramenta no lugar de
palpite: quando o dono tem gosto formado sobre algo visual, o que ele quer é o
botão, não a minha versão do gosto dele.

---

## 26/08/2026 · Duas rodas, uma por tema

O dono mandou um PDF com **uma página por tema** — e são paletas diferentes: a
do escuro é mais fechada.

**Como as 24 cores saíram do arquivo.** O PDF é CMYK com perfil FOGRA39, então
não dá para ler o hex do código-fonte. Rasterizei cada página (as duas vinham
no mesmo arquivo; separei reconstruindo um PDF mínimo por stream de conteúdo) e
li a **cor dominante de cada fatia por corrida angular** — varre o anel de grau
em grau e agrupa em corridas, o que ignora borda e antisserrilhado. São os tons
que o visualizador dele mostra, não uma conversão de CMYK inventada por mim.

**105 valores mapeados**: os do tema escuro pela roda escura, os de dentro de
`[data-theme="light"]` pela roda clara.

### A regra e as três travas

Usa o **tom da roda, exatamente**. Três travas impedem que isso quebre o que já
funcionava:

1. **Primeiro plano do tema não recebe tom cheio.** No claro é a cor escura que
   serve de texto; no escuro, a clara. Sem isso o selo "rejeitado" trocava
   vinho-sobre-rosa por vermelho-sobre-rosa e sumia.
2. **Tinta clara e tinta escura mantêm a própria claridade** — são chapa de
   badge, não cor de identidade.
3. **Quem já tinha 3:1 ou mais não pode cair abaixo do que tinha.** Abaixo de
   3:1 é decorativo e recebe o tom cheio.

A trava 3 foi o que **destravou o amarelo**: na primeira tentativa ele voltava
ácido só para preservar 1,7:1 de um rótulo que já era ilegível. Cor que nunca
foi legível não é texto — é enfeite, e enfeite pode ter a cor da paleta.

### Duas classificações corrigidas à mão

- **A segunda fatia do círculo escuro** é um vinho de matiz 1°, praticamente a
  mesma do vermelho (4°). Parece fatia repetida e escurecida no arquivo, não uma
  cor nova. Sem trava, o vermelho da marca cairia nela.
- **O verde de "aprovado"** (155°) cai mais perto do azul-verde na conta. Ia
  virar turquesa e o selo perderia o significado.

### O que mudou de verdade

| token | antes | claro | escuro |
|---|---|---|---|
| `--primary` | `#ff2d2d` / `#dd2222` | `#c64e47` | `#d26359` |
| `--success` | `#1fd27a` / `#18a863` | `#4fa874` | `#46a253` |
| `--warning` | `#ffaa33` / `#e09500` | `#ebbc5b` | `#e3a355` |
| `--prio-1` (baixa) | `#4c8dff` | `#42639c` | `#7590c6` |
| `--prio-2` (média) | `#e8c33c` | `#f1eb74` | `#ede96c` |
| `--prio-3` (alta) | `#ff8a3d` | `#d88051` | `#d87e48` |

Os seis pares de badge do tema claro continuam **todos acima de 4,5:1** sobre a
própria chapa. Fundos, brancos, cinzas e o preto dos textos não foram tocados.

**Vale registrar:** a paleta é mais fechada que a anterior, e isso alcança o
vermelho da marca. `contexto.md` tem a regra "vermelho de destaque é o mesmo
vermelho do hover do menu, nunca um pastel" — a roda nova é menos saturada que
esse vermelho. Foi aplicada porque foi pedida; se for para manter o `#ff2d2d`
da marca, é uma linha.

---

## 26/08/2026 · A roda de cores vira o tema claro

> *"aplique essas cores como padrão do nosso tema claro (…) não vamos modificar
> as cores base de fundo e tons de branco (…) nem as cores neutras e o preto dos
> textos"*

**52 valores mapeados** — os tokens semânticos, os pares de badge, os chips de
projeto, as tags de destino, os tons de ação e as barras de prioridade.

### O método: troca a matiz, mantém a luminosidade

Cada cor de elemento teve a **matiz** levada para a mais próxima das 12 da roda,
com a **luminosidade original preservada**. É o que permite aplicar uma paleta
inteira sem auditar contraste de novo: com o L intacto, todo par que passava
continua passando.

Conferido par a par, antes → depois: **nenhum cruzou o piso de 4,5:1**, e alguns
melhoraram — branco sobre azul foi de 3,68 para 4,13; o texto do chip de Clips
sobre o amarelo, de 7,6 para 9,12.

**Neutro não entra no mapa.** O corte é saturação abaixo de 0,18: pega fundos,
brancos, cinzas, o preto do texto e o cinza-ardósia da tag "site", que
continuam exatamente como estavam.

### Duas correções à mão

A matiz mais próxima nem sempre é a leitura certa:

- **O rosa do Reels** (340°) fica a 18° do Vermelho e a 25° do Vermelho-violeta.
  Pela conta, iria para o vermelho — e viraria a **mesma cor do YouTube**, com a
  tag deixando de distinguir destino. Foi para o Vermelho-violeta.
- **O marrom escuro do Clips** é o texto que fica *em cima* do amarelo do próprio
  chip. Pela matiz iria para o Vermelho-laranja e descolaria da família dele.
  Ficou no Amarelo-laranja.

### Prioridade virou token

Eram três hex soltos repetidos no CSS **e de novo no JS**. Viraram `--prio-1`,
`--prio-2` e `--prio-3`, e `fpPrioCor` passou a devolver o token: as barras do
Panorama são estilo inline e ficavam com a cor do tema escuro dentro do tema
claro.

No claro elas usam a matiz da roda com a **mesma luminância relativa** de antes
— aqui não bastava manter o L do HSL, porque o amarelo puro tem luminância bem
mais alta na mesma altura de HSL e o rótulo "Média" ficaria pior do que já é.
Com a luminância casada, o contraste de cada uma é idêntico ao que era.

**Fica pendente:** "Média" em tema claro dá 1,7:1 sobre branco — já dava antes,
e o mapa não piorou. Se for para corrigir, é escurecer o amarelo, e aí ele vira
oliva.

### A roda usada

| | | | |
|---|---|---|---|
| Vermelho `#DA2128` | Vermelho-laranja `#F26522` | Laranja `#F7941D` | Amarelo-laranja `#FBB040` |
| Amarelo `#FCE81A` | Amarelo-verde `#8CC63E` | Verde `#0DA457` | Azul-verde `#2AB3A6` |
| Azul `#2B57C4` | Azul-violeta `#453F94` | Violeta `#6A3D9A` | Vermelho-violeta `#B8419A` |

O tema escuro **não foi tocado**.

---

## 26/08/2026 · Ajuda da tela e tutorial guiado

> *"Quero adicionar um botão ? logo acima do botão flutuante de reportar bug (…)
> um botão ver tutorial que vai funcionar parecido com o que é nos apps da adobe
> na primeira vez que tu acessa"*

O **`?`** mora logo acima do besouro e **só aparece onde há verbete**: Dashboard
de fotos, Produção, Galeria, Separação e Fotografia em lote. Botão de ajuda que
abre vazio é pior que botão nenhum.

Dentro dele, **Ver tutorial** acende o passo a passo sobre a própria interface —
retângulo vazado no elemento, cartão ao lado, setas e Esc ligados.

**Na primeira vez** que a pessoa entra em cada um desses módulos o tutorial abre
sozinho. A marca fica no navegador com a versão no nome da chave
(`fp_tut_v1:<id do usuário>:<módulo>`), então **todo mundo começou agora como
primeira viagem** — que era o pedido — e subir `FP_TUT_VERSAO` reseta de novo
quando o conteúdo mudar.

Decisões que valem registro:

- **Três ganchos, porque nem toda entrada passa pelo roteador.** `refreshViewData`
  cobre a troca de módulo; `fpDashTrocar`, porque as duas frentes do Dashboard
  são a **mesma view** e trocar de aba não navega; e `fpRevelarPainel`, porque
  quem abre um favorito em `#foto-producao` caía numa tela sem `?`.
- **O `?` é ligado depois do render, não junto.** Os passos apontam para linhas
  da listagem, e elas só existem quando o render termina.
- **Passo com alvo ausente é descartado na abertura, não pulado no meio** — assim
  o contador "2 de 4" nunca mente.
- **Não basta o alvo existir: tem que ter área.** O slot da barra de ações em
  massa tem altura 0 e `offsetParent` válido; o passo abria um retângulo de 12px
  em cima de nada. O alvo virou a barra de dentro (`.fp-prod-lote`).
- **Guardar no navegador e não no banco é escolha consciente.** Quem trocar de
  máquina vê o tutorial de novo. O custo disso é um tutorial repetido; o do
  contrário seria coluna nova, migração e mais uma política de RLS para uma
  preferência que não vale um round-trip.
- **Posicionar síncrono, não só no próximo quadro.** Em aba em segundo plano o
  navegador não chama `requestAnimationFrame` e o retângulo ficava 0×0 no canto.

Conferido em produção, módulo a módulo: os 6 passos da Produção, os 4 do
Dashboard de fotos, os 4 da Galeria, os 4 da Separação e o do lote — todos com o
retângulo casando com o alvo dentro de 1px, o cartão inteiro dentro da janela, o
`?` escondido fora dos módulos de foto e o tutorial **não** reabrindo na segunda
visita.

### Ajustes do dono, no mesmo dia

- **O texto é do operador, não do projeto.** Saíram dos passos as explicações de
  *por que* a interface é assim — o tamanho do alvo de clique, o que recarrega e
  o que não, o que acompanha a rolagem. Isso é conversa de quem constrói; quem
  usa quer saber o que fazer.
- **O `?` virou o símbolo de texto**, sem chapa nem borda. É um sinal, não um
  controle que precise anunciar área de clique — a caixa de 42px continua ali
  para o toque, só não aparece.
- **Durante o tutorial, os únicos alvos vivos são Sair e Próximo.** O fundo
  deixou de avançar o passo ao ser clicado, e `#app` mais os dois botões
  flutuantes ficam `inert` enquanto ele roda. O laço de foco sozinho não
  segurava: chamar `.focus()` de dentro do próprio `focusin` é engolido pelo
  navegador — medido, o foco continuava no botão da listagem, onde Enter
  dispararia a ação.

---

## 26/08/2026 · A prancheta na barra lateral, e três defeitos que ela achou

A mesma malha da tela de entrar passou a rodar atrás do menu, **em voz baixa**:
um terço da opacidade do login, porque aqui ela vive debaixo de texto o tempo
todo. Papel milimetrado de 20px com a grossa de 80px, máscara apagando topo e
base, e um brilho que sobe e desce em 46s.

**`isolation: isolate` na barra é obrigatório.** Sem contexto de empilhamento, o
pseudo-elemento posicionado passa por cima dos itens do menu, que são estáticos.

**No claro tudo pesa mais.** Linha escura sobre branco tem contraste de verdade;
no escuro a mesma alfa vira quase nada. A malha caiu para menos da metade e o
brilho de .075 para .030 — no branco o vermelho pintava a barra de rosa.

### O anel vermelho que contornava a tela inteira

> *"toda vez que eu seguro shift esse div da tela fica com esse contorno
> vermelho"*

O seletor do anel de foco era `[tabindex]` solto, que pega também os
`tabindex="-1"` — elementos que existem para receber foco **por programa**, não
pela navegação. O `<main>` é um deles. E como o seletor de atributo tem
especificidade (0,2,0) contra (0,1,1) de `main:focus-visible`, a regra que
deveria apagar o anel do main **nunca valeu**.

O caminho até o bug é bonito: shift+clique na listagem para selecionar
intervalo → o `preventDefault` que impede o arrasto de texto também impede a
linha de tomar o foco → ele sobe para o `<main>` → a próxima tecla acende o anel
em volta de toda a área de conteúdo.

Agora o anel é só de `[tabindex="0"]` e dos controles de verdade.

### A sombra da barra de ações em massa

Parada dentro do respiro reservado, a sombra era um degrau no meio da página sem
nada embaixo. Ela existe para a barra parecer estar **por cima** da listagem — e
isso só acontece com a página rolada.

**`position: sticky` não avisa quando gruda**, e comparar o topo do elemento com
o `top` da regra não funciona: medido, o slot para em 0 e não nos −32px que a
regra pede — quem manda no ponto de parada é a caixa que o contém, não só a
propriedade. A saída foi uma **sentinela de altura zero** logo acima, que
continua rolando: enquanto os dois estão na mesma altura a barra está no lugar
dela; quando a sentinela sobe e o slot fica para trás, grudou.

Conferido: rolagem 0 e 120 sem sombra, 300 e 900 com sombra, e de volta a 0 sem.

---



---

## 26/08/2026 · A tela de entrar virou uma prancheta

> *"No modo claro quero a logo do media club em preto (…) quero uma animação de
> fundo com o gradiente se movendo e quero que se pareça com uma artboard de
> arquitetura no fundo, tipo aquelas blueprint"*

**A logo estava invisível no tema claro** e ninguém tinha reparado: o arquivo é
branco de um tom só (600×575, um único valor de pixel), e o card do tema claro é
branco. `filter: invert(1)` no claro resolve sem duplicar arquivo — o recorte
continua o mesmo, só o tom vira preto.

"Painel administrativo" virou **ADMIN**, a legenda saiu, e o cartão encolheu de
40px de recuo e 380 de largura para 26px e 340.

O fundo tem três camadas:

- **Papel milimetrado** — malha de 24px com a grossa de 120px por cima.
- **Desenho técnico** — círculo com eixos, cota com setas, retângulo com
  diagonais de construção e um arco com raio. Em SVG, `preserveAspectRatio`
  `slice`, tudo `aria-hidden`.
- **Dois brilhos** que passeiam em **40s e 52s**. Períodos primos entre si de
  propósito: sincronizados, o fundo repetiria o mesmo quadro enquanto alguém
  digita a senha.

Detalhes que valem registro:

- **Máscara radial nas duas camadas de fundo.** Grade que morre no corte da tela
  parece papel de parede; morrendo por dentro, parece folha sobre a mesa.
- **A grade sumia no escuro.** As linhas estavam em azul de nanquim nos dois
  temas — escuro sobre quase preto não existe. No escuro elas viram azul claro, e
  os brilhos caíram de .22/.16 para .13/.11, que era o que engolia a malha.
- **A compactação vai em `.login-card .login-input`, não em `.login-input`.**
  Essa classe é o campo de formulário do painel inteiro — perfil, usuários,
  bug, projetos. Mexer nela mudaria vinte telas de uma vez.

### A logo nova e o cache de um ano

O dono mandou as duas versões desenhadas (branca e preta, 6117px). Entraram
como **dois arquivos**, não como filtro: `invert()` sobre a branca devolve um
preto chapado que perde o contorno interno do capacete. Um `<span role="img">`
segura as duas para o leitor de tela ler um nome só.

**O arquivo novo subiu e ninguém teria visto.** A Vercel serve
`/assets/*` com `cache-control: public, max-age=31536000, immutable`: o
navegador de quem já abriu o painel ficaria com a logo velha **até 2027**.
Conferido que a resposta trazia os bytes novos (900×773) e mesmo assim a página
mostrava 600×575. A correção é `?v=2` na URL — em `<img>`, no `<link
rel="icon">` e no manifest.

**Regra:** trocar um arquivo em `assets/` sem mudar a URL não chega em ninguém.

### O gradiente que existia e não se via

> *"o fundo da tela de login ta pronto? ainda falta a animação do gradiente, né?"*

Estava pronto e rodando — em 40s e 52s, o que dá **1vw por segundo**. Movimento
que existe no papel e some no olho. Agora são três brilhos em **22s, 30s e
17s**, com trajeto maior: medido nos keyframes, o primeiro anda 344px na
horizontal até os 7 segundos.

**Armadilha de medição, de novo:** com a aba em segundo plano o compositor
congela a animação e `getComputedStyle` devolve sempre a matriz identidade —
parece bug e não é. Para conferir sem depender do foco da aba, fixe
`getAnimations()[0].currentTime` e leia o transform em cada instante.

---

## 26/08/2026 · Dez ícones do menu trocados

O dono mandou uma referência por módulo. O que entrou:

| Módulo | Antes | Agora | Por quê |
|---|---|---|---|
| Check-in / Check-out | relógio | caixa marcada | era o terceiro relógio da barra |
| Projetos | livro aberto | duas folhas | o único ícone que não falava de arquivo, e Projetos é uma pilha deles |
| Edição | lápis | tira de filme com play e lápis | o lápis sozinho dizia só "editar" |
| Clips | rolo de filme | as duas mãos do Mercado Livre | é para onde os vídeos vão |
| Debriefing | balão com três pontos | balão com interrogação | era idêntico ao de Templates a 18px |
| Fotografia em lote | câmera | camadas empilhadas | a câmera repetia o assunto do bloco FOTOGRAFIA inteiro |
| Metas | relógio | alvo de três anéis | relógio fala de prazo, não de meta |
| Meus Posts | lápis | jornal | lápis diz "editar", não "publicação" |
| Templates WhatsApp | balão com linhas | a marca do WhatsApp | fone **preenchido**: em traço fino vira rabisco a 18px |
| Atualizações | relógio | nuvem com seta | o segundo relógio |
| Integrações | dois elos | núcleo com quatro pontas | elo diz "link", não "integração" |

**Três relógios e dois balões quase iguais** dividiam a mesma barra. Nenhum era
errado sozinho; juntos, metade da coluna era a mesma silhueta.

**A regra que saiu daqui: ícone se aprova a 18px, não no desenho grande.** Cada
candidato foi rasterizado num `<canvas>` de 18×18 e ampliado 12× sem suavização,
para ver o que o operador vê de verdade. O que reprovou assim:

- **Três losangos fechados** (a referência literal do ícone de camadas) viram
  massa: seis traços quase paralelos em 18px. Três camadas abertas leem limpo —
  mesma figura, metade dos traços.
- **O aperto de mão do Mercado Livre sozinho**, em duas tentativas. Mão tem
  curva demais: a 18px vira rabisco, e foi o pior ícone da barra. Uma etiqueta
  com play chegou a entrar no lugar — e o dono cortou: *"o icone do clips
  precisa ser a logotipo do mercado livre"*.

  A elipse da marca chegou a entrar em volta, para o olho reconhecer pela
  silhueta — e o dono cortou de novo: *"tira o circulo em volta do icone e deixa
  só as duas mãos se cumprimentando"*.

  **O que fez as mãos funcionarem sozinhas foi tamanho e peso.** Elas ocupam a
  caixa inteira (antes eram miúdas dentro da elipse) e vão a **2,4 de traço
  contra 1,8 do resto da barra**. O erro das duas primeiras tentativas não foi o
  assunto, foi a escala: desenho pequeno e fino no meio de um `viewBox` sobrando
  vira rabisco no tamanho real.

  Fica como método: **ícone que não lê raramente precisa de outro assunto —
  precisa de mais massa e menos inflexão.**
- **Duas bolhas no Debriefing.** Divididas em 18px, nenhuma das duas sobra espaço
  para a pergunta ser lida. Uma bolha só, com a interrogação grande.
- **A flecha do alvo em Metas.** Empurra o alvo para o canto e vira um risco
  atravessado. Alvo de três anéis, centrado.
- **O quinto nó das Integrações.** A referência tem nós de tamanhos diferentes;
  a 18px assimetria não lê como intenção, lê como desalinho.

**Marca colorida não entra na barra** (o amarelo e o azul do Mercado Livre, o
verde do WhatsApp): a coluna inteira é `currentColor` e um logo colorido seria o
único elemento que não acompanha o tema nem o estado ativo. **O que entra
preenchido** é o fone do WhatsApp, e por legibilidade: nesse tamanho, sólido lê
e traço fino não.

---

## 26/08/2026 · O rodapé da sidebar virou um botão de usuário

> *"vamos copiar esse modelo do airtable. Quero no lugar de todos os botões ali
> na parte inferior da sidebar expandidos para um botão que será o ícone do
> usuário (…) quero exatamente como está no exemplo do airtable"*

Cinco linhas soltas no rodapé (perfil, tema, landing, sair) viraram **um avatar**.
Sem foto, o painel gera iniciais sobre uma cor tirada do próprio nome — sempre a
mesma para a mesma pessoa, nunca sorteada a cada carregamento. Clicando, abre o
popover com nome e e-mail, Conta, Preferências de notificações, Preferências de
linguagem, Tema com chave estilo Apple, um fio e Sair.

O que só apareceu montando:

- **O menu não podia morar dentro da sidebar.** A barra tem `overflow: hidden`
  para os rótulos não vazarem quando recolhida — e cortava o popover pela
  metade. `fpUsrAbrir` move o menu para o `document.body` e o prende à
  viewport; ao fechar, volta para o lugar.
- **`.fp-usr-cab span` pegava o avatar junto**, porque o avatar também é um
  `span`. As iniciais renderizavam como um bloco cinza de 12px no canto. O
  seletor passou a ser `.fp-usr-id`.
- **Notificações abriu como tela em branco de propósito**: a view
  `prefs-notificacoes` existe, é registrada nas sete listas de sempre e mostra
  um card **EM BREVE**. Item de menu que não leva a lugar nenhum é pior que item
  que leva a uma tela honesta.
- **Tema claro virou o padrão** (`fp_theme`), como pedido. Quem já tinha
  escolhido escuro continua no escuro.
- **O "outro preto" da sidebar virou `#151515`** (sRGB 0,082) em `--bg-soft`. O
  fundo da página não mudou — só a barra e os elementos que a acompanham.

---

## 26/08/2026 · Recolhida e expandida passaram a ser a mesma caixa

> *"Preciso garantir que não va mudar a posição x nem y dos icones quando
> estiver recolhido e eu passar o mouse ativando o hover"*

O `«` recolhe direto (não abre mais preferências), o `»` expande, e por padrão a
barra recolhida **abre no hover**. Só que abrir no hover mexia em tudo: a versão
recolhida tinha recuo próprio, itens centrados e 24px de espaço no topo, então
os 22 ícones pulavam de lugar debaixo do cursor.

A correção foi apagar a geometria da versão recolhida inteira: os dois estados
usam **a mesma caixa**, e o que muda é só o rótulo aparecer. Medido em produção,
recolhida contra aberta:

| | recolhida | com hover |
|---|---|---|
| 1º ícone | x=35, y=68 | x=35, y=68 |
| 22º ícone | x=35, y=753 | x=35, y=753 |
| botão `»` | x=35, y=929 | x=35, y=929 |
| avatar | x=35, y=972 | x=35, y=972 |

Dois detalhes que só a medição pegou:

- **O avatar e o `»` estavam centrados na fileira do rodapé** e escorregavam de
  x=34 para x=130 quando a barra ia de 68 para 260px. `align-items: flex-start`
  os traz para a mesma coluna dos ícones.
- **O recuo vertical próprio do modo hover empurrava a lista 24px para baixo** e,
  com 22 módulos, o fim da lista saía da tela. Foi a zero.

Os 22 módulos cabem sem rolagem a partir de **~880px de altura de janela**; em
860px faltam 27px e em 780px faltam 107px. Abaixo disso a lista rola, que é o
comportamento correto — espremer 22 linhas e 4 títulos de seção numa janela
baixa custaria a altura de toque de todo mundo.

**O `»` não volta para o lado do avatar no hover**, só no clique. Botão que se
move sozinho debaixo do cursor é clique errado na certa.

### O emergencial recolhido: quem pisca é o ícone

> *"na versão recolhida da sidebar perdemos a animação de ficar piscando a
> notificação do produto emergencial. Pra resolver isso vamos fazer o próprio
> ícone do módulo ficar piscando"*

Com a barra fechada o número fica `display: none` — e o alarme sumia por
inteiro. Agora `fpFotoBadgePintar` marca o item com `.fp-nav-emerg` e o CSS
pisca **o ícone de Produção**, na mesma `fpPiscaEmerg` de 1,3s do triângulo da
listagem. Quando a barra abre, o ícone para e o número volta a ser o sinal:
dois alarmes ao mesmo tempo é ruído, não ênfase.

> *"esse icone precisa piscar na cor neutra dele igual todos os outros modulos,
> ele só fica vermelho no hover"*

**Pisca na cor neutra**, a mesma dos 21 vizinhos. Quem chama a atenção é o
movimento; vermelho fixo tirava o ícone da coluna e virava um segundo estado
"ativo". O vermelho volta no hover — exatamente o que o número já fazia.

Medido em produção: opacidade oscilando de 0,23 a 1,00 no ícone, igual ao
triângulo, com a cor em `rgb(161,161,170)` — a mesma do vizinho — e `#ff2d2d` no
hover. Com zero emergenciais a classe sai e nada pisca. Desligado junto com as
outras piscadas em `prefers-reduced-motion`.

**O cargo saiu da barra recolhida.** O `#roleBadge` tem 67px de texto e a barra
tem 68px: aparecia "ADMINIST" cortado na vertical. Some por `visibility`, nunca
por `display` — o vão continua reservado, senão o rodapé inteiro pula 28px no
instante em que o hover abre a barra, que é justo o que passamos o dia
consertando.

---

## 26/08/2026 · Barra de ações em massa: sobrepõe, gruda no topo e nunca some

> *"ao invés de abaixar o div das listagens, sobreponha o novo header de ações em
> massa na listagem"* … *"vamos fixar a barra de ações em lote para ficar sempre
> visível nesse espaço"*

Três pedidos que viraram uma coisa só. A barra deixou de empurrar a listagem
para baixo (a lista inteira dava um pulo a cada seleção), passou a **sobrepor**,
e agora ocupa um espaço reservado o tempo todo — cheia quando há seleção, com
"Nenhum selecionado" quando não há.

- **Ao rolar, ela encosta no topo sem folga.** O espaço de 8px que sobrava vinha
  de cascata: `.fp-lote-slot { top: -40px }` dentro do `@media (min-width:1600px)`
  perdia para a regra base, que vem depois no arquivo. Os dois passaram a sair do
  mesmo token, `--pad-topo`.
- **`[].every()` devolve `true`.** Com a barra sempre visível, seleção vazia
  fazia o botão destrutivo ler "Voltar para a listagem". Agora `n > 0 &&`.
- O `×` de remover virou a **lixeira** padrão, e "Definir prioridade" ficou
  centralizada e mais pesada.

**Clicar em qualquer lugar da linha marca o produto** — a caixa tem 16px de lado
e errar o alvo era o normal. Continuam respondendo por si o menu `…`, o slider
de prioridade e a miniatura. Shift+clique seleciona intervalo, e o
`preventDefault` no `mousedown` mata só o arrasto de seleção de texto, sem tirar
a cópia de um SKU.

---

## 26/08/2026 · Sincronizar catálogo: uma barra de progresso que não mente

> *"quero um loading mais gradual com animação de tempo real (…) pode até usar
> animação de piscando pra ficar bonitinho"*

"Lendo o Bling…" virou **Atualizando** em verde com barra de 0 a 100%, sem caixa
em volta, e a data e hora da última atualização logo abaixo.

O progresso tem **duas camadas**: `real`, que só anda quando uma etapa confirma,
e `mostrado`, que persegue o real com suavização e um creep lento enquanto
espera. O mostrado nunca passa 8 pontos à frente do real nem ultrapassa o teto
da etapa. Barra que salta de 10% para 90% e trava ensina o operador a não
confiar nela.

---

## 26/08/2026 · Acabamento das listagens

- **Galeria não recarrega tudo no "Mostrar mais".** Antes, mais 120 produtos
  repintavam as 1.311 miniaturas e a tela piscava inteira. Agora anexa só as
  novas.
- **Barra de ordenação na Galeria**, na ordem pedida: **Nome · Estoque ·
  Avaliação**, com Nome A-Z por padrão (`FP_GAL_ORDENS`).
- **Estado vazio com moldura**: contorno tracejado, cantos arredondados,
  opacidade reduzida e o aviso centrado com triângulo de exclamação. O triângulo
  original era torto de verdade — a inclinação esquerda corria 8,5 na horizontal
  contra 7,5 da direita, e o ápice ficava em 12,5 com a base em 12. Trocado por
  um caminho simétrico.
- **Métricas sem container**, no padrão de fios da casa, com o vão entre colunas
  saindo de `--fp-col-gap`.
- **O contorno do Tab** ficou em `--foco: var(--primary)`, 1px e **para dentro**
  (`inset`), que é o que o faz parecer fino sem sumir.

---

## 26/08/2026 · O menu "…" que morria ao trocar de aba

> *"as vezes ao trocar de tag lá na fila (…) o menu de ... fica inclicável"*

Bug intermitente, e por isso mesmo o mais caro. `fpMenuColetar()` varria o
registro `FP_MENUS` por `getElementById` **durante** a montagem da string de
HTML: as linhas ainda não estavam no DOM, o `getElementById` voltava `null` e a
varredura apagava os ids delas. Só disparava quando o mapa passava de 400
entradas — daí o "às vezes".

A varredura passou a ser adiada e a respeitar 30s de carência. E o caminho
silencioso agora escreve `console.warn`: bug que não deixa rastro no console
volta.

---

## 26/08/2026 · A Vercel segurou um commit por 11 minutos

Sem erro, sem build falhando: o commit subiu, a Vercel não publicou e a borda
continuou servindo o HTML de 20 minutos antes (`x-vercel-cache: HIT`, `age:
1263`). Um commit vazio soltou a fila em ~10 segundos.

Registrado porque o sintoma é indistinguível de "o código não funcionou".
**Antes de investigar um deploy que parece não ter surtido efeito, confirme que
ele saiu** — ver `pendencias.md`.

---

## 26/08/2026 · Na landing, quem abre a conversa é o cliente

> *"quero que o cliente nos envie uma mensagem para esse whatsapp confirmando o
> agendamento dele (…) Assim a gente evita do whatsapp cair de novo por spam.
> É melhor (…) porque melhora a segurança, o cliente mesmo nos manda mensagem
> primeiro e assim evita de alguém querer se passar por nós"*

Depois de enviar a solicitação, a tela de sucesso traz um botão verde com a
mensagem **já escrita**: nome, moto e data, dizendo que está confirmando o
pedido. O cliente só envia.

Duas razões, as duas do dono: o número do estúdio **não sobrevive** a dezenas de
conversas iniciadas por nós — o WhatsApp lê isso como spam e derruba a conta — e
uma conversa aberta do lado do cliente **é a prova de que o número é nosso**.
Ninguém se passa pela gente dentro de um contato que o próprio cliente iniciou.
A tela diz isso com todas as letras, junto do número.

Detalhes que valem registro:

- **A data é formatada na mão** (`iso.slice`), não com `new Date('2026-09-03')`:
  em fuso negativo isso volta um dia e a mensagem sairia com a data errada.
- **Verde com texto escuro.** Branco sobre `#1fd27a` dá 2:1 e reprova no AA;
  escuro dá 9,7:1. O verde do WhatsApp com texto branco é bonito na marca deles
  e ilegível na nossa régua.
- **O texto do topo do formulário mudou de lado.** Prometia que *nós* entraríamos
  em contato em 24h — agora diz que a confirmação é dele e que respondemos em 24h.
  Copy que contradiz o fluxo é pior que copy feia.
- O `fpTrack` de cliques já pega qualquer `a[href*="wa.me"]`, então a conversão
  `Contact` do Meta passou a contar a confirmação sem uma linha a mais.

**O WhatsApp do rodapé continua o da loja** (47 3466-6977). O do estúdio, que
responde a confirmação, é o 47 93384-0886.

---

## 26/08/2026 · Panorama vira o painel de fotos do Dashboard

O módulo Panorama saiu do menu e o conteúdo dele passou para dentro do próprio
Dashboard, que agora tem duas frentes. Switch de abas para quem tem vídeo e
foto; quem tem uma frente só nem vê o switch.

- **A frente é deduzida dos módulos de trabalho** (`fpFrentes()`), nunca do
  Dashboard, que os dois lados dividem, e nunca da visibilidade das seções do
  menu — a seção de vídeo aparece para quem só tem Debriefing.
- **A escolha é lembrada por navegador e cruzada com a permissão.** A chave não
  carrega o id do operador: sem o cruzamento, o fotógrafo herdaria "vídeo" de
  quem usou a mesma máquina. Testado nos dois sentidos.
- **Mover o conteúdo para dentro da view, em vez de alternar duas views.**
  Existem quatro laços de "esconde tudo" que o switch não controla; com duas
  views, ir a Projetos e voltar apagaria o painel de foto sem caminho de volta —
  e em silêncio.
- **O repintor de fotos passou a decidir pela tela à vista, não pela hash.** Um
  favorito antigo em `#foto-dashboard` faria cada clique de prioridade repintar a
  Produção escondida: nada muda na tela, nada aparece no console.

### O que a revisão adversarial pegou depois

Quatro achados de nove sobreviveram à refutação, e eram dois defeitos:

1. **O Panorama era construído duas vezes por login.** `applyRolePermissions`
   roda duas vezes (é a regra do "filtrar antes de mostrar") e cada passada
   chegava em `fpDashTrocar`. Agora a aplicação automática só pinta se a tela
   estiver vazia; o clique do operador continua atualizando.
2. **O painel de vídeo nunca recarregava.** `refreshViewData` passou a carregar
   só a frente à vista — certo — mas **trocar de aba não é navegar**: quem
   entrava de manhã na frente de foto via, à tarde, os números da hora do login.

### O painel de fotos abre na hora

O panorama esperava **duas rodadas de rede em série** — o catálogo inteiro
(2.566 linhas em três páginas) e só então três consultas — antes de pintar
qualquer coisa. 1,7s de área vazia para mostrar quatro números.

- **Uma chamada só:** `mc_photo_panorama(início do mês)` conta no banco e devolve
  contagens, fila, os oito com mais estoque parado, lotes em aberto e as últimas
  fotos. As contas foram conferidas uma a uma contra as da tela antes de trocar.
- **Esqueleto em duas passadas:** a primeira é síncrona e pinta a forma certa com
  `.fp-skel-txt` (variante em linha do esqueleto que já existia) no lugar de cada
  número. Medido: **0,9ms** para a tela abrir, **212ms** para o dado real, e
  **zero esqueleto** ao reabrir.
- **O catálogo vai depois da pintura, não junto.** Rodando em paralelo, as três
  páginas dividiam banda com a chamada do painel e empurravam o número que o
  operador espera de 0,3s para 1,6s. Medido nas duas ordens.
- **`fpPrioDefinir` carrega o catálogo sob demanda.** A lista do Dashboard vem
  direto do banco; se o clique de prioridade chegasse antes do catálogo, a função
  saía calada.

---

## 26/08/2026 · O menu não podia nascer errado

> *"Quando eu entro como matheus no painel, no menu lateral aparece todos os módulos e
> depois de meio segundo atualiza para só os que ele tem permissão. De modo algum isso
> pode aparecer pra ele, nem por meio segundo que seja."*

A filtragem de permissão era a **última** coisa de `initApp()` — depois de umas quinze
requisições (`loadRequests`, `loadUsers`, `loadProjects`, `loadUpdates`…). E o painel já
tinha sido revelado antes de tudo isso. Resultado: quem tem acesso parcial via os
**24 itens** do menu, com Usuários, Integrações e Manutenção à mostra, até a filtragem
chegar.

O conserto não é adiantar um pedaço da filtragem: é inverter a ordem. Nasceu
`fpRevelarPainel()`, que filtra **enquanto `#app` ainda está `display:none`** e só depois
revela. As duas camadas (papel + módulos do usuário) só precisam de `CURRENT_USER`, que
já está em mãos no login e no `checkAuth()` — nada ali depende de dado carregado.

Os dois únicos lugares que mostravam o painel passaram a chamar essa função. Como filtrar
e revelar acontecem na **mesma tarefa síncrona**, o navegador não tem onde pintar o estado
cru — não é uma corrida ganha por pouco, é uma corrida que deixou de existir.

Trava de segurança por cima: `.sidebar-nav` nasce com `visibility:hidden` e só ganha
visibilidade com a classe `fp-menu-filtrado`, posta pela própria `fpRevelarPainel()`. Se
um dia a filtragem estourar no meio, o menu **não aparece** em vez de aparecer inteiro. O
**rodapé fica fora da trava** de propósito: tema, landing e Sair continuam alcançáveis
num painel quebrado.

Efeito colateral que precisou de cuidado: `applyRolePermissions()` agora roda duas vezes
por sessão (antes de revelar e no fim do `initApp`, que redesenha as telas de Performance).
O aviso de "somente leitura" era criado sem dedupe e duplicaria — ganhou
`data-fp-somente-leitura` e remoção do anterior.

Medido em produção, com a sessão do Matheus: 24 itens no estado cru → filtragem com
`app=none` → revelação com a trava aberta e **8 itens** visíveis. Administrador continua
com os 24 e as quatro seções.

---

## 26/08/2026 · Seções do menu com nome por papel

> *"Para administrador as seções devem ter nome de geral > VIDEO, fotografia >
> FOTOGRAFIA (…). Para não administradores a sessão VIDEO vira GERAL e FOTOGRAFIA vira
> GERAL."*

O administrador vê a casa dividida, porque para ele são duas operações. Quem trabalha só
de um lado não tem por que enxergar a divisão: a única seção que aparece se chama
**GERAL**. Pós-produção deixou de existir e o **Debriefing** foi para a seção de vídeo.

Três coisas que o pedido não previa e apareceram na implementação:

- **O Dashboard morava dentro da seção VÍDEO.** Isso fazia o Assistente ver *duas*
  seções — "VÍDEO" com o Dashboard sozinho e "FOTOGRAFIA" — em vez do GERAL único. Saiu
  de todas as seções e foi para o topo, sem cabeçalho.
- **O teste do papel `assistente` tem que vir antes do de administrador**, porque o nome
  do papel é "Assistente Admin." e contém a palavra *admin*. Na ordem ingênua, ele entrava
  como administrador de verdade.
- **`modules` em branco bloqueia quem não é administrador.** O papel novo foi criado sem
  módulos e, para não-admin, `fpAllowedSet()` devolve só `FP_ALWAYS_ON` — o Matheus não
  veria nada além do próprio perfil. O José Gustavo (Fotógrafo) estava no mesmo buraco,
  preso em `["dashboard"]` de antes da seção existir. Os dois receberam a seção de
  Fotografia inteira.

Regra que ficou: se um dia um não-administrador tiver acesso aos dois lados, os nomes
específicos voltam **para essa pessoa**. Duas seções chamadas GERAL, uma embaixo da outra,
seriam piores que a divisão que estamos escondendo.

Verificado simulando os quatro papéis em produção.

---

## 26/08/2026 · A fonte do site inteiro virou FullPro Sans

Reznik, renomeada. 18 arquivos `.woff2` em `assets/fonts/` (pesos 200–950 + itálicos),
uso interno e não comercial, autorizado pelo dono. Google Fonts saiu do `<head>` das duas
páginas.

**Duas armadilhas, as duas custaram uma rodada:**

1. **`url('assets/fonts/…')` não carrega nada.** O caminho relativo resolve contra a URL
   da página, e o painel é servido em `/admin` (`cleanUrls`) — o navegador pedia
   `/admin/assets/fonts/…`. Sem erro visível: a fonte simplesmente não trocava e o
   fallback assumia. Todo `src` de `@font-face` usa **caminho absoluto** (`/assets/…`).
2. **Bebas Neue não tem minúsculas.** Ela estava *fazendo o papel* de `text-transform:
   uppercase` em 30 regras. Trocar a família revelou textos que sempre foram em caixa
   mista — "Painel administrativo" no lugar de "PAINEL ADMINISTRATIVO". Cada uma das 30
   regras ganhou `text-transform: uppercase` explícito e `font-weight: 800`, porque Bebas
   é condensada de peso único e a FullPro Sans no peso normal ficava magra no lugar dela.

---

## 26/08/2026 · Filtros e busca, e duas colisões de nome no mesmo dia

> *"vamos mudar o formato desses filtros por tags para um modelo mais moderno sem esse
> fundo container que é muito cara de ia (…) e também quero que funcione a busca, porque
> eu digito ali mas o enter não funciona"*

Pílula preenchida virou **aba com sublinhado de 3px** e contagem por aba; a busca ganhou
lupa, Enter, Esc e botão de limpar. Duas correções depois do primeiro corte:

- O primeiro resultado ficou **apagado demais** ("sem nenhum destaque"). Rótulo subiu para
  14px/700 e a aba ativa ganhou contagem em destaque.
- A pílula voltava **só no tema claro**: o tema claro redeclara `.filter-btn.active` com
  fundo azul e texto branco, muito depois da minha regra. Sobrou também um
  `.active:hover` azul e uma regra de celular que forçava 12px em qualquer largura.

**As duas colisões:**

- **`fpProdBuscar` já existia** — é a busca de produto do kit do Magis5. A declaração
  posterior venceu, então o campo de busca da Fotografia chamava a função do Magis5, que
  procura `#prodRes` (inexistente) e **retorna calada, sem erro no console**. Virou
  `fpProdBuscarFila`.
- **`.fp-busca` já existia** — é a busca de Solicitações. Minhas regras vinham *antes* no
  arquivo e perdiam. Em vez de renomear, reescrevi o componente existente (agora os dois
  usam o mesmo). No meio da reescrita perdi `fill:none; stroke:currentColor` e a lupa
  virou um borrão preto sobre preto — achado medindo, não olhando.

Lição que virou padrão: **antes de criar função ou classe, procure o nome no arquivo.**

---

## 26/08/2026 · Acabamento da seção FOTOGRAFIA

Pedidos pequenos do dono, todos aplicados:

- **Extremidades laterais alinhadas** — cabeçalho, filtros, listagem e rodapé passam a
  compartilhar a mesma margem lateral. Elemento que "quase" alinha é pior que elemento
  claramente destacado.
- **Barra de composição do lote** — abaixo de "15 selecionados", uma barra preenchida por
  cor conforme a mistura de prioridades. O texto voltou a dizer só a contagem.
- **Coluna de prioridade que se mede sozinha** — a largura vem do rótulo mais comprido em
  tela (`Range.getClientRects()`), com 78px de piso. Sem isso, "EMERGENCIAL" empurrava a
  coluna e os outros rótulos ficavam soltos da extremidade direita.
- **As listas em PDF ficam salvas no módulo de Separação** — o dono deu F5 e a lista sumiu.
  Agora cada geração é registrada e o histórico aparece na tela.
- **O PDF sai no domínio do Media Club** (`/lista/…`), por *rewrite* no `vercel.json` para
  o Storage do Supabase, em vez do link comprido e aleatório do balde.

---

## 26/08/2026 · Separação vira PDF público, e o que o Bling não conta

O Slack dependia de app e token que não existem. A lista de separação passou a
virar **PDF com link público** — manda-se só o link para quem separa.

### A localização do estoque só existe no detalhe

`estoque.localizacao` (`"M1 (5, C)"`, `"PP"`, `"C3 (2, B) 1"`) **não vem na
listagem** de produtos do Bling, só em `GET /produtos/{id}`. Buscar para os 2.566
produtos levaria quase uma hora, então é sob demanda — só os itens do lote — e
fica guardada em `mc_photo_products.localizacao`.

### Duas armadilhas que custaram uma rodada cada

**1. O Bling limita a ~3 chamadas por segundo.** Disparei cinco de uma vez e
voltou **429 em oito dos dez** produtos. Pior: o erro caía no `catch` e era
gravado como localização vazia — o produto ficaria "sem localização" para sempre.
Agora as chamadas são espaçadas por um relógio compartilhado (~2,8/s), o erro é
repetido três vezes, e **nada é gravado quando a chamada falha**. Vazio no banco
significa "perguntei e não tem", nunca "não consegui perguntar".

**2. O `finally` apagava o próprio resultado.** Depois de gerar, a tela é
redesenhada para tirar do lote os produtos que saíram da fila — e o redesenho
reconstruía o rodapé inteiro, inclusive o container onde o link tinha acabado de
ser escrito. O PDF era gerado, publicado e registrado; só não chegava aos olhos
do operador. O link agora vive fora do render.

### PDF escrito à mão

Sem biblioteca: o painel não carrega script de terceiro e um PDF só de texto são
meia dúzia de objetos. Helvetica é fonte base (não precisa embarcar) e WinAnsi
cobre o português — **com a tabela de 0x80–0x9F**, senão travessão e aspas curvas
viram byte perdido. Emergencial sai em negrito.

Validado fora do navegador antes de subir: 46 itens → 2 páginas, reconhecido como
PDF 1.4 válido, e a renderização confere acento, quebra de página e numeração.

### Armazenamento

Balde `storage/separacao`, **público por necessidade** — quem separa não tem conta
no painel. Teto de 5 MB e só `application/pdf`. Políticas de SELECT e INSERT para
`anon`; **sem DELETE**, e isso foi confirmado na prática: o `remove()` do cliente
**responde sucesso mesmo quando o RLS bloqueia** — a resposta traz os nomes
pedidos, não os apagados. Conferir listando de novo.

**Pendência:** os PDFs se acumulam sem limpeza automática.

---


## 25/08/2026 · Seção FOTOGRAFIA e o aviso de entrada no dialeto do debriefing

### O aviso ficou mais largo e ganhou régua técnica

Pedido do dono: mais largo, com **nome para cada nota** e **patch numerado do dia**, e
o visual do debriefing — "sem esses containers e blocos parecendo muito site de ia".

- 520 → **680px**.
- A pilha de caixinhas dentro da caixa virou **uma superfície só com fios de 1px**.
  Caixa dentro de caixa é o que mais entrega interface montada por template.
- `mc_updates` ganhou `nome` (kebab-case) e `patch` (inteiro). As notas do mesmo dia
  dividem o patch; o código da nota é `patch.posição` (`004.2`).
- **O patch é atribuído por gatilho no banco.** Quem cadastra não deve lembrar do número
  e duas abas abertas escolheriam o mesmo. Nota de um dia que já tem patch herda.
- **O código é calculado sobre o patch inteiro, não sobre o filtrado.** No popup só
  aparecem as não vistas; numerar em cima do que sobrou daria código diferente a cada
  abertura.

### A seção FOTOGRAFIA

Cinco telas (Panorama, Produção, Galeria, Separação, Fotografia em lote), a segunda seção
do menu. Quatro tabelas novas, três edge functions, e o papel **Fotógrafo**, que não
existia para o sistema de permissões — qualquer papel desconhecido caía em `viewer`, o
mais restrito. O fotógrafo estava no papel mais fechado do painel por acidente de
nomenclatura.

**Números reais da primeira sincronização:** 2.575 produtos lidos do Bling em 26 páginas
(o painel lia no máximo 2.000 e truncava ~575), 5.524 pastas no Drive, **1.311 produtos
com foto** e **1.255 sem** — destes, 639 com estoque. E 4.211 pastas do Drive sem produto
correspondente no Bling, resíduo de SKUs antigos.

### Três defeitos que a revisão adversarial pegou

1. **A varredura do Drive devolvia `nextPageToken`; o sincronizador lia `proximo`.**
   Sempre vazio → parava na primeira página de 1.000 → gravava `tem_foto: false` em cima
   de ~4.500 SKUs e reportava sucesso.
2. **`nome text not null`** em `mc_photo_products`. A varredura do Drive faz upsert só com
   `{sku, tem_foto, folder, checado_em}`, e o Postgres valida NOT NULL na linha proposta
   **antes** de resolver o conflito — o lote de 500 morreria inteiro, sempre.
3. **Índice de busca com `coalesce(nome,'')`.** O PostgREST monta `to_tsvector('portuguese', nome)`
   sem o coalesce: expressão diferente, índice nunca usado, varredura completa silenciosa.

### Verificado de verdade

- Upload no Drive **testado contra o Drive real** depois da conta de serviço virar
  administradora de conteúdo: pasta criada, `ZZ-TESTE-UPLOAD-CLAUDE-1.jpg`, segundo envio
  virou `-2` reusando a pasta. **A pasta de teste ficou no Drive e precisa ser apagada.**
- `drive-proxy` v7 comparado antes/depois: `status`, `map` e `img` byte a byte idênticos
  (os mesmos 15.273 bytes na miniatura).
- `prioridade = 4` recusada pelo banco; `5` e `null` aceitas.
- Popup: 680px, fios de 1px, código/nome/tipo com **0px** de diferença entre centros,
  375px sem vazamento, dois temas.

### Pegadinha nova

`.action-btn` é a classe de botão deste painel. **`.btn`, `.btn primary` e `.btn ghost`
não existem** — botão com essas classes nasce sem estilo, 19px de altura e padding zero.

---


## 25/08/2026 · Aviso de entrada e módulo Atualizações do site

**O pedido.** Um popup ao entrar no painel ou recarregar, com as solicitações
pendentes para quem tem acesso a elas (menos o admin), as menções do debriefing e
um resumo das novidades do sistema. Mais um módulo onde esse histórico fica.

**A decisão que mudou o desenho: substituir, não somar.** Já existia um popup no
login — o de menções, uma barra colada na base da tela que reaparecia a cada troca
de módulo. Dois avisos disputando o mesmo canto terminam com o operador fechando
os dois sem ler nenhum. O novo aviso engoliu o antigo; `showMentionPopup`,
`hideMentionPopup`, `dismissMentionPopup`, `openMentionsNow` e
`maybeShowMentionPopup` viraram fachadas finas para não quebrar quem os chamava.

**"Não viu de fato" significa coisa diferente por assunto:**

| Assunto | Como se sabe que já foi visto |
|---|---|
| Menção no debriefing | `mc_notifications.read`, que já existia |
| Solicitação pendente | `prefs.avisos.requests_ate` — só conta o que chegou depois |
| Relato de bug (admin) | `prefs.avisos.bugs_ate` |
| Novidade do painel | `prefs.avisos.updates_vistos`, lista de ids |

`prefs` é **coluna jsonb em `mc_admin_users`**, não tabela nova: `checkAuth()` já faz
`select('*')`, então o valor chega dentro de `CURRENT_USER` sem uma consulta a mais —
e a leitura dessa tabela já foi gargalo antes.

**Regras de exibição:** admin não recebe aviso de solicitação (ele vive nessa tela);
só admin recebe aviso de relato de bug. Menção e solicitação são trabalho pendente e
só somem quando a pessoa passa pela tela; novidade e relato são informação e o
"Entendi" já carimba.

**Abre uma vez por carregamento de página, nunca ao voltar o foco da aba.** O antigo
recarregava e reabria em `focus` e `visibilitychange`; com um modal no centro da tela
isso reapareceria a cada alt-tab. Agora foco só atualiza os contadores.

**Duas correções no caminho:**

1. `class="btn primary"` / `btn ghost` **não existem neste painel** — a classe é
   `.action-btn` (`.approve`, `.reject`, `.view`, `.danger`). Os botões nasceram sem
   estilo nenhum, com 19px de altura e padding zero. Antes de usar uma classe de
   botão, procure a declaração dela no `<style>`.
2. `fpAvisoIr` gravava `requests_ate` numa chamada e o resto noutra. **Duas escritas
   na mesma linha de `mc_admin_users` podem chegar fora de ordem** e a segunda apagaria
   o que a primeira gravou. Virou um patch só.

**De passagem:** `'manutencao'` entrou nas três listas de views que o módulo do besouro
tinha esquecido (`admin.html` tem sete listas de views, herança de três gerações de
roteador). Era por isso que Manutenção continuava visível por baixo do detalhe de projeto.

**Medido no navegador:** selo e data do rodapé da novidade com **0px** de diferença entre
centros; 375px sem rolagem horizontal; os dois temas conferidos. Commit `815d97a`,
no ar em produção.

**Tabelas:** `mc_updates` (changelog) e a coluna `mc_admin_users.prefs`. O DDL completo,
com a seção de Fotografia, está em `supabase/schema-fotografia.sql`.

---


Registro do que foi feito e por quê. Mais recente primeiro.

---

## 20/08/2026 — Os avisos do sistema perderam a tarja colorida

O dono já tinha proibido **barra colorida à esquerda** em caixa de aviso — "cara de site
de IA mal feito" — e o toast do painel estava exatamente assim: `border-left: 3px` na cor
do estado. Refeito:

- **A cor saiu da borda e foi para o ícone**, dentro de um selo arredondado de 24px com o
  tom do estado a 16-18% de opacidade. O aviso inteiro tem uma borda só, uniforme.
- **A caixa encolhe até o tamanho do texto** (`width: fit-content`). Antes esticava até
  390px sempre — três palavras dentro de uma caixa larga é o que mais entrega template
  pronto. "Bug reportado. Obrigado!" agora ocupa 240px.
- **O "x" só aparece no hover** — aviso que some sozinho em 4s não precisa de botão de
  fechar à mostra. Fica sempre visível quando o aviso é fixo, tem ação, ou no celular
  (onde não existe hover). O espaço dele é reservado, então nada pula de lugar.
- **Relevo em vez de tarja:** um branco de 5% por cima do fundo e sombra mais funda.
- **Sombra própria para o tema claro** — preto pesado de tema escuro suja o claro; lá o
  relevo vem de branco sobre o fundo e uma sombra suave.
- **O popup de menção tinha a mesma tarja** (rosa, 3px à esquerda). Saiu junto.

Dois defeitos apareceram no caminho: `.fp-toast-erro` usava `var(--perigo)`, que **não
existe** (o token é `--danger`), então o aviso de erro ficava com a barra cinza padrão; e
a duração era calculada depois do botão de fechar ser criado, o que impedia saber ali se o
aviso era fixo.

**Ainda com tarja, fora do escopo de hoje:** os quatro cartões de KPI do módulo de Envios
(`border-left: 3px`). Se for para limpar, é o mesmo tratamento.

## 20/08/2026 — Botão do besouro e o módulo Manutenção

Qualquer pessoa da equipe agora reporta bug ou melhoria de dentro do painel, e o relato cai
numa fila que só o dono vê.

**O botão fica acima dos modais de propósito** (`z-index` 100050 contra 100 dos modais).
Bug encontrado dentro de um popup precisa poder ser reportado **sem fechar o popup** —
fechar perde o contexto, e o contexto é justamente o que costuma faltar num relato.
Discreto por padrão (55% de opacidade), acende no hover. Atalho: **B**.

**O relato leva o contexto capturado no clique:** tela aberta, qual popup estava por cima,
URL, tamanho da janela, tema, navegador e quem reportou. É o que evita o vaivém de "onde
exatamente isso aconteceu?". Print opcional, redimensionado para 1280px e JPEG 72% no
próprio navegador — a coluna é texto, não bucket.

**O módulo Manutenção** (só para admin; quem reporta usa o besouro) tem os quatro
contadores, filtro por status e cartões com o relato, o contexto e as ações: *estou
resolvendo*, *resolvido*, *descartar*, *reabrir* e apagar. O filtro padrão é **A resolver**
(aberto + em andamento) — abrir na lista completa faria o dono varrer relatos já fechados.

**A notificação é a mesma dos agendamentos:** contador no item do menu, que **desaparece
quando não há nada aberto** em vez de mostrar um zero em cor de alarme.

**A tabela nasceu com RLS só para `authenticated` e não funcionou.** O primeiro relato de
teste voltou com *"new row violates row-level security policy"*. Motivo: **o painel não usa
Supabase Auth.** O login é `select` em `mc_admin_users` comparando hash de senha, e o
cliente Supabase segue **anônimo** do começo ao fim — por isso todas as tabelas antigas
liberam `anon`. Política para `authenticated` bloqueia o painel inteiro. Corrigido para
`anon, authenticated`, testado com `set local role anon` e depois pelo fluxo real da tela.

**O mesmo engano estava no `magis5-proxy`**, esperando para explodir: eu exigia
`role = 'authenticated'` no token, o que rejeitaria todo chamado do painel assim que a
chave do Magis5 fosse configurada. Trocado por uma checagem que faz sentido nesse modelo:
o painel manda o id de `fp_session` e a function confere em `mc_admin_users` com a service
role. Não é criptografia — é um UUID que só quem logou tem — mas fecha a porta que o
`verify_jwt` sozinho deixava aberta (a anon key é pública no `config.js`). Testado: sem
sessão → 401, sessão inventada → 401, sessão real → passa.

**Uma pegadinha do arquivo:** o `admin.html` tem **dois** `<body>` — o real e o do modelo
de etiqueta de transporte, que é gerado como HTML completo para impressão. A classe que
esconde o botão na tela de login foi para o body errado na primeira tentativa e o botão
aparecia antes do login. Ao mexer em `<body>` ou `</style>` por script, confirme qual dos
dois você pegou.

## 20/08/2026 — Foto de produto: carregando, com foto, sem foto

Toda listagem de produto montava a sua própria caixa de foto — brinde, produto compatível
e clip, três marcações diferentes — e nenhuma dizia em que pé a imagem estava. Pior: "sem
foto" usava o **mesmo ícone de caixa** que ilustra "produto", então não havia como saber se
a foto ainda vinha ou se não existia.

Agora existe uma caixa só, `fpFotoProdutoHtml(sku, url, tamanho, raio)`, com o estado numa
classe: **rodinha girando** enquanto a foto vem, **a imagem** quando carrega, **câmera
cortada** quando não há foto. As três listagens passaram a usar ela.

- **`loading="eager"` de propósito nas miniaturas.** O observador de ergonomia marca
  `lazy` em toda imagem injetada, e com lazy uma miniatura fora da tela **nunca começa a
  carregar** — a caixa ficaria girando sem nem ter tentado. São 32-46px e são o conteúdo
  do cartão. Vale também para a imagem do Drive, criada por JS (`img.loading = 'eager'`,
  senão o observador marca lazy).
- **O Drive agora responde "não tem".** `fpDriveAplicar` só saía calado quando o SKU não
  tinha pasta; quem não recebeu foto do Bling ficava girando para sempre. Agora marca
  "sem foto" — e se a imagem do Bling chegar depois, `fpFotoOk` desfaz.
- **Rede lenta não deixa rodinha eterna:** uma varredura 8s depois do último cartão
  desenhado converte o que sobrou em "sem foto". Se a imagem chegar mais tarde, ela volta.

Testado com os cinco casos: foto boa, URL quebrada sem SKU (vira "sem foto" na hora), URL
quebrada com SKU (espera o Drive), sem nada (já nasce "sem foto") e só SKU (espera).

## 20/08/2026 — A busca de compatíveis não achava a Duke 390

Depois de mostrar o produto zerado, a KTM 390 Duke continuou dando "nenhum produto
compatível" — e dessa vez não era estoque, era o casamento de nome.

**A causa:** o catálogo de motos chama o modelo de **"390 Duke"** e a loja cadastra o
produto como **"Retificador KTM Duke 390 (17-21)"**. O algoritmo comparava os nomes
*grudados* — procurava `390duke` dentro de `retificadorktmduke390` — e a ordem invertida
das palavras fazia todo produto da Duke ficar de fora. O mesmo valia para qualquer moto em
que a loja escreve o número antes do nome.

**Agora o casamento é por conjunto de palavras:** toda palavra do modelo precisa aparecer
no nome do produto, **em qualquer ordem**. `390` + `duke` acha `Duke 390` e `390 Duke`.

- **Palavra de uma letra não conta como exigência** — o "R" de "R 1250 GS" casaria com
  qualquer nome. Ela entra só no desempate.
- **Só as palavras do nome do modelo, nunca as do slug.** Juntar as duas listas tornava a
  exigência impossível: "1290 Super Duke R" tem slug `1290SUPERDUKER`, que vira a palavra
  `superduker` — e nenhum produto se chama assim (a loja cadastra "Superduke 1290").
- **A montadora deixou de ser filtro rígido.** Produto que cita **outra** montadora sai;
  produto sem montadora nenhuma no nome fica, porque parte do cadastro só escreve o
  modelo.
- **Ordenação:** com estoque primeiro, depois quem bate o ano, depois quem escreve o
  modelo grudado (costuma ser o produto do modelo, não um multiaplicação).

**Verificado com nomes reais de produto num teste em Node**, com o catálogo de motos de
verdade: KTM 390 Duke → **5 produtos** (era 0, e são exatamente os 5 que a loja lista para
DUKE 390), Duke 200 → 3 sem contaminar a 390, Super Duke 1290 → 2, R 1250 GS → 2 (inclui o
pisca multiaplicação), CG 160 → 2, MT 03 → 1 sem trazer a MT 07.

> A fonte de produto do painel **é e continua sendo só o Bling** (`blingGetAllProducts`
> via `bling-proxy`). A vitrine da loja foi usada apenas para *ler como os produtos são
> nomeados* e montar a amostra do teste — nada no painel consulta o site.

## 20/08/2026 — Estoque zerado aparece, e quatro correções na Agenda

**Produto zerado deixou de sumir da lista.** A busca de compatíveis terminava com
`.filter(p => saldo > 0)`, então uma KTM 390 Duke que *tem* peça no catálogo, mas zerada,
mostrava "Nenhum produto compatível encontrado no estoque" — a mesma frase de quando não
existe peça nenhuma. São respostas diferentes: a segunda decide se vale repor antes da
gravação. Agora o zerado entra na lista, desce para o fim, ganha **moldura vermelha e selo
SEM ESTOQUE** no lugar do número, e a contagem do cabeçalho avisa (*"Produtos compatíveis
(4) · 2 sem estoque"*) — inclusive no botão da versão recolhida, sem precisar abrir.
O `0 un` em laranja que existia antes passava batido.

**Brinde "Outros" (e mais dois) não salvavam.** `requests_brinde_check` só aceitava
`pastilhas`, `mochila` e `capa`, mas o painel oferece seis opções — **três das seis**
(`capa_moto`, `ponteira`, `outros`) estouravam a restrição no salvar. Restrição alinhada
com a interface e testada com os seis valores, inserindo e apagando em seguida.

**O "+" já vem com a data escolhida.** Se o operador clicou num dia do calendário antes de
abrir o agendamento manual, o campo Data vem preenchido.

**Dava para perder de vista o dia selecionado.** `.cal-day.approved` era declarado depois
de `.cal-day.selected` e, com a mesma especificidade, o verde cobria o amarelo: clicar num
dia que tem agendamento aprovado — justamente os que o operador clica — não mudava nada na
tela. A seleção passou para depois das regras de cor e ganhou hover próprio, que reforça o
amarelo em vez de cair na regra geral (que troca a borda para vermelho).

**Ícone de calendário invisível no tema escuro.** O `<input type="date">` desenha o ícone
pela `color-scheme`, e o painel só trocava as variáveis CSS. Agora `:root` declara
`color-scheme: dark` e `[data-theme="light"]` declara `light` — o ícone fica branco no
escuro e preto no claro, e de quebra scrollbars e seletores nativos acompanham o tema.

## 20/08/2026 — Agenda: o confirmado na frente, o resto atrás de um clique

Clicar num dia despejava todos os pedidos daquela data na ordem em que vieram do banco —
no print do dono, uma **rejeitada** aparecia antes da **aprovada**. Agora o aprovado vem
primeiro e inteiro, com borda verde, e o resto desce para um bloco que abre por clique.

**A separação muda conforme o dia esteja resolvido ou não**, e isso é de propósito:

- **Com aprovado**, o dia está fechado: pendente, stand by e rejeitada são todos "não
  deram certo" e vão juntos para o bloco fechado — *"Outros pedidos para este dia (3) · 1
  pendente · 2 rejeitadas"*.
- **Sem aprovado**, pendente e stand by são a fila viva do dia e ficam à vista; só as
  rejeitadas ficam guardadas, sob *"Pedidos rejeitados (2)"*. Esconder um pendente num dia
  sem aprovado seria esconder trabalho.

Dentro do bloco a ordem é pendente → stand by → rejeitada, e o resumo do botão segue a
mesma ordem (os dois saem da mesma lista ordenada). Com um status só, o resumo some — ele
repetiria o rótulo do botão.

**A busca de produtos compatíveis no Bling agora só roda para o que está à vista.** É a
parte mais lenta do painel, e antes ela disparava para todo pedido do dia — inclusive os
que ninguém ia olhar. Os escondidos carregam na primeira vez que o bloco abre.

## 20/08/2026 — Kit do Magis5 editável de dentro do projeto

Pedido: na aba Produção, escolher o produto usado no projeto e ter, ao lado, um botão que
adiciona produto à composição do kit **dentro do Magis5**.

**O que a API do Magis5 permite** (documentação lida em `developers.magis5.com.br`, seção
Product — cinco endpoints, nenhum específico de kit): a composição é um campo do produto,
`products_composition[{id, quantity, unitValue, percentagePriceValue}]`, aceito em `PUT` e
em `PATCH /v1/products/{sku}`. Na leitura ela volta como `productsComposition`, com
`productId` separado do `id` da linha.

**O que ela não permite: buscar produto por nome.** Só `GET /v1/products/{sku}` e a
listagem paginada, sem filtro de texto. Isso decidiu a arquitetura — e por sorte casa com
o pedido: quem busca é o **Bling** (o mesmo cache dos brindes) e o **SKU** é a ponte para
o Magis5. O id do componente que o PATCH exige sai de um `GET` pelo SKU escolhido.

- **Edge function `magis5-proxy`**, `verify_jwt: true` + checagem de `role`. A chave sai
  do navegador. Detalhe que quase passou: `verify_jwt` aceita a **anon key**, que é
  pública no `config.js` — sem a checagem de papel, qualquer um escreveria no ERP.
- **O PATCH substitui a lista inteira.** O painel lê a composição, monta *ela + o novo
  item* e mostra um resumo antes de gravar ("vai passar de 2 para 3 itens… participação
  somada depois: 110%"). A function recusa lista vazia.
- **Guarda de resposta velha (`_kitToken`).** Abrir o formulário já dispara o resumo, e o
  operador pode clicar em "adicionar ao kit" antes de a primeira leitura voltar. Sem o
  token, a resposta que chega por último vence — inclusive uma falha antiga sobre um
  estado novo e bom. Isso apareceu no teste, não em produção.
- **Coluna `produto` (jsonb) em `mc_projects`** guarda `{blingId, sku, nome, imagem}` para
  reabrir a tela sem nova busca.

Testado com dublê da API: busca no Bling → item resolvido para o id do Magis5 → payload
enviado com os dois itens que já existiam (7011, 7042) + o novo (88123). Nada é perdido.

**Ainda não rodou contra o Magis5 de verdade** — falta a secret. Ver `pendencias.md`.

## 20/08/2026 — Moto na landing: marca, modelo e ano um por linha

Print do iPhone: os três seletores da moto lado a lado, com "Selecione a marc…" cortado e
o Ano sozinho em meia coluna. Três coisas erradas ali:

- **O formulário era inconsistente com ele mesmo.** No bloco de 900px, `.form-grid-2` já
  colapsa para uma coluna — mas `.form-grid-3` era *forçado* a `1fr 1fr .7fr !important`.
  Resultado: nome, WhatsApp, e-mail e placa em largura cheia, e só a moto apertada em três.
  Agora `.form-grid-3` empilha no mesmo ponto de corte. Marca → modelo → ano é escolha em
  cadeia; um por linha também casa com a ordem em que se preenche.
- **A regra que tentava consertar isso era código morto.** Em ≤640px havia
  `.form-grid-3 select:last-child { grid-column: 1 / -1 }` para jogar o Ano para a linha
  inteira. Nunca pegou: `initMotoSelects` insere a div `.moto-custom-fields` **depois** do
  select de ano, então o último filho não é um `select`. Era por isso que o Ano aparecia em
  meia coluna. Removida.
- **Todo campo dava zoom ao ser tocado.** No celular os campos estavam em `font-size: 13px`
  e o iOS dá zoom automático em qualquer campo abaixo de 16px — a cada toque o Safari
  aproximava e o usuário tinha que pinçar de volta. Isso, mais do que o layout, era o
  "ruim de preencher". Agora 16px.

O caminho **"Outro (não listada)"** seguiu junto: os três campos de texto que o
`moto-catalog.js` injeta também empilham. Eles nascem com `style` inline, daí o
`!important` para casarem com os selects — medido: 44px de altura, 16px de fonte e 10px de
raio nos seis campos, contra 39px/14px/8px de antes.

Desktop conferido: três colunas (229px, 229px, 161px) na mesma linha, fonte 14px, tudo
como estava — as regras novas vivem todas dentro de `@media (max-width: 900px)`.

## 20/08/2026 — Solicitações no celular: a tabela virou lista de cards

O dono mandou print do iPhone: das 8 colunas da tabela sobravam três na tela e o resto
ficava na rolagem horizontal. Três problemas escondidos nesse print:

- **Moto e Modalidade não apareciam.** A regra genérica de `@media (max-width: 900px)`
  fazia `th/td:nth-child(4), :nth-child(5) { display: none }` para *qualquer* tabela — ou
  seja, escondia justamente a moto, que é o dado principal do negócio.
- **O campo de busca e a contagem estavam fora da tela.** A `.filter-bar` no celular é uma
  fileira rolável (`flex-wrap: nowrap !important`, decisão de 13/08 para os chips). Com
  `flex: 1 0 100%` e `order: 10`, a busca não descia para a linha de baixo: ia para a
  direita da fileira rolável, invisível sem arrastar.
- **Os cinco chips de status não cabiam** — "Rejeitadas" ficava cortado na borda.

Agora, em ≤900px: **a mesma tabela vira lista de cards, sem duplicar marcação.** O `<tr>`
passa a `display: flex` e cada `<td>` recebe `order` e `flex-basis`; o `<thead>` sai. Os
`<td>` de data e brinde ganharam `data-rotulo`, que o CSS de celular imprime com
`::before` — sem cabeçalho, "01/09" e "20/08 12:24" ficariam sem contexto. No desktop o
atributo não pinta nada.

Layout do card: **nome + status + "…"** na primeira linha, **moto + placa** na segunda
(com um filete embaixo), **as duas datas** na terceira e **modalidade + brinde** na quarta.

- **Base de 50% no nome** (`flex: 1 1 50%`) em vez de `auto`: com `auto`, nome comprido
  ("Jorge Enrique Santos de Lima Takao Nishimura") empurrava status e "…" para uma segunda
  linha e o "…" ficava solto no meio do card. Medido a 390px: nome, status e "…" com o
  **mesmo centro vertical** nos três cards de teste.
- **Cor e tamanho da capa entraram na mesma linha do brinde.** Empilhados, o "Preto · G"
  ficava embaixo do rótulo e não do valor.
- **As duas datas dividem uma linha a partir de 381px** e empilham em telas menores
  (iPhone SE, 375px) — sem essa exceção, "RECEBIDA 20/08/2026 12:24" estourava.
- **Chips e ordenação viraram dois `<select>` nativos** no celular, com a contagem na
  opção (`Todas (50)`, `Pendentes (6)`…). A ordenação, que no desktop é clique no
  cabeçalho, no celular não existia — o `<thead>` está oculto. Estado compartilhado: quem
  filtra pelo seletor também acende o chip do desktop.

**O bloco novo fica no fim do `<style>` de propósito** e escopado em `#view-requests` /
`#reqTable`: as regras genéricas de tabela do bloco de 900px vêm antes e, com a mesma
especificidade, venceriam. Desktop conferido depois: 8 colunas, chips, busca e contagem
idênticos, seletores com `display: none`.

**Fica pendente:** as outras tabelas (Influenciadores, histórico) continuam rolando na
horizontal — a `.inf-list-table` ainda esconde da terceira coluna em diante no celular.

## 20/08/2026 — A tag ao vivo virou painel de visor de câmera

A pílula, mesmo grande e piscando, não deu a evidência que o dono queria. Montei uma
página de teste (`lab-tag.html`, já removida) com cinco desenhos no contexto real do topo
— pílula atual, pílula grande, faixa vermelha de largura total, manchete tipográfica e
painel de câmera. **Escolha: painel de câmera.**

- **Como é:** bloco com cantos em L de visor (`::before`/`::after`), linha de cima com
  `● REC · GRAVANDO AGORA` à esquerda e o **dia da gravação** à direita, e embaixo a moto
  + nome mascarado em 15px (13,5px no celular). `display: inline-block`, então o painel
  tem a largura do conteúdo — não vira uma faixa vazia atravessando o hero.
- **O `REC ·` aparece só quando é hoje.** *Próxima gravação* e *Última gravação* usam o
  mesmo painel no estado calmo (`.fp-live-off`): cantos e texto em cinza, ponto pulsando
  em vez de piscando, sem glow.
- **A tag deixou de ser `.badge`.** Virou `.fp-live`, com CSS próprio. Isso desamarrou
  duas regras de `@media` que mexiam em `.badge` (uma tirava fundo e borda no celular, a
  outra remontava padding e fonte) e brigavam entre si.
- **Estado sem dado continua sendo a tag antiga:** `.fp-live-vazio` devolve a pílula
  discreta de uma linha com `FullPro Media Club`. Se o Supabase cair, ninguém vê um visor
  de câmera vazio.
- **Medido:** rótulo e data centrados entre si com 0,01px de diferença no desktop e 0px no
  celular. Nome longo (`José **** ** ******** ******* ******`) quebra em 2 linhas dentro
  do painel, que passa a ocupar a largura toda — sem estourar a viewport (347px de 375).

## 20/08/2026 — A tag ao vivo ganhou peso (e a máscara ficou do tamanho do nome)

Duas correções em cima da tag do mesmo dia:

- **Um `*` por letra real do sobrenome**, com os espaços preservados:
  `José Luis de Oliveira Ossoski Junior` → `José **** ** ******** ******* ******`.
  Continua sendo feito na view, com `regexp_replace(..., '[^ ]', '*', 'g')`.
  Os asteriscos são desenhados num `<span>` com metade da opacidade, senão a parede de
  `*` rouba a atenção do primeiro nome.
- **A tag virou um bloco de verdade**, em vez de texto solto: pílula com fundo em degradê
  vermelho, chip sólido `● GRAVANDO AGORA` estilo REC de câmera (ponto piscando em
  `steps()`, não pulsando) e o texto em branco, 14px. A pílula respira com um glow
  (`box-shadow` animado) **só no estado "gravando agora"**.
- **Próxima/Última gravação usam o estado calmo** (`.fp-live-off`): chip vazado, sem glow,
  sem piscar, texto em cinza. A tag só grita quando está gravando de fato.
- **No celular a pílula ficou** — antes o CSS mobile tirava fundo e borda de `.badge`. É o
  que dá evidência à tag na tela onde a maioria entra.
- **Alinhamento medido, não olhado:** `line-height: 1` no chip faz a altura dele casar com
  a primeira linha do texto ao lado. Centro do chip vs. centro da linha: **0,3px** no
  celular e **0,2px** no desktop, com nome curto ou com nome de 2 linhas.

## 20/08/2026 — A tag do topo da landing virou "Gravando agora"

O `FullPro Media Club` fixo no topo do hero saiu. No lugar entra o que o estúdio está
fazendo de verdade: **GRAVANDO AGORA · Yamaha R15 de Ws \*\*\***.

- **Só o primeiro nome, o resto é `***`.** A máscara é feita **no banco**, não no
  JavaScript: a view `mc_public_gravacoes` devolve `nome_publico` já mascarado, então o
  nome completo nunca sai do Supabase. A view expõe três colunas — `date`, `moto`,
  `nome_publico` — e nada de whatsapp, e-mail, placa ou endereço. `mc_requests` continua
  fechada para o anon (RLS: só insert).
- **A view recorta o tempo também:** só `status = 'approved'` e datas entre −45 e +7 dias,
  no fuso de São Paulo. Não dá para varrer o histórico inteiro pelo endpoint público.
- **Três estados, nessa ordem:** gravação de hoje → *Gravando agora*; senão a próxima
  agendada → *Próxima gravação*; senão a última realizada → *Última gravação*. Sem dado
  ou com erro de rede, o texto original `FullPro Media Club` fica no HTML e ninguém vê
  buraco.
- **Duas ou mais motos no mesmo dia** alternam a cada 6s com fade. Rebusca a cada 60s e
  ao voltar para a aba (`visibilitychange`) — é o "tempo real" honesto para um site
  estático, sem WebSocket.
- **O ano sai do nome da moto e as minúsculas soltas são corrigidas** na exibição:
  `Yamaha r15 2026` → `Yamaha R15`. Palavra que já tem maiúscula não é tocada, senão
  `BMW` viraria `Bmw`.
- **Texto entra por `textContent`**, nunca `innerHTML` — o campo vem de formulário
  público.
- **No celular a tag quebra em até 2 linhas** em vez de cortar o nome com `...`, e o ponto
  vermelho fica alinhado com a **primeira** linha (medido: 1px de diferença do centro do
  rótulo). Nome longo tipo *Harley-Davidson Pan America 1250 Special* cabe sem estourar a
  viewport.

---

## 19/08/2026 — Check-in/out passa a girar em torno da data

As duas abas eram **Entrada** e **Saída** — o eixo era o tipo de formulário, e a lista
despejava as 17 motos de todas as datas nas duas. Agora são **Hoje** e **Outros**.

- **Hoje**: só as motos do dia, e cada card traz **entrada e saída no mesmo lugar**, num
  seletor no topo. O card abre direto na etapa que falta (sem entrada → Entrada; com
  entrada → Saída), e depois de salvar fica na aba onde o operador estava.
- **Outros**: lista compacta em dois grupos, **Próximas datas** e **Datas anteriores**.
  Serve para corrigir um registro antigo ou adiantar o de amanhã — moto que chega no fim
  do dia para gravar no seguinte. Clicar na linha expande o card ali mesmo.
- Selo de etapa concluída só aparece **quando está concluída**. Dois selos apagados em
  toda linha viravam ruído e ainda pareciam as abas do card.

**Os dois formulários convivem no mesmo card sem colisão** porque todo id já era
`${prefix}_${rid}`. Bastou extrair o corpo para `ciFormHtml(prefix, r)` e chamá-lo duas
vezes.

**O card de "Outros" só é montado ao abrir.** Renderizar 17 motos × 2 formulários seria
34 medidores de combustível e 34 grades de foto de uma vez. Medido: a lista fechada monta
**zero** cards; abrir uma linha monta um.

**Vazamento de listener corrigido de passagem.** `initFuelGaugeDrag` registrava quatro
listeners no `document` a cada chamada e nunca removia nenhum — a cada re-render da tela a
conta crescia (17 cards × 4, indefinidamente). Agora é um único par de listeners no
documento apontando para o medidor ativo, e o `svg` marca que já foi ligado.

## 19/08/2026 — Cor e tamanho da capa de chuva

Na landing, escolher **Capa de chuva** abre um bloco com **cor** (Preto, Verde limão) e
**tamanho** (P, M, G, GG, G2, G3). Os outros dois brindes não têm variação, então o bloco
só aparece para a capa.

- Chips com botão de rádio de verdade por baixo: o `FormData` já leva os valores, sem
  campo escondido para sincronizar.
- O `required` é **ligado e desligado junto com o bloco**. Campo obrigatório escondido
  trava o envio num elemento que o navegador não consegue focar — é o mesmo cuidado que o
  campo de endereço já tinha.
- Trocar para outro brinde limpa a seleção, para não mandar cor de capa em quem pediu
  mochila.
- Colunas novas em `mc_requests`: `brinde_cor` e `brinde_tamanho`, com `CHECK` nos valores
  válidos. Testado: `XXG` é recusado pelo banco.

**O dado aparece em todo lugar onde o brinde já aparecia** — senão não serviria para nada:
linha da tabela de Solicitações, detalhe da solicitação, agenda do dia, exportação CSV,
a variável `{brinde}` dos templates de WhatsApp e, o mais útil, a **linha do brinde no
check-out**, que passa a dizer `Capa de chuva · Preto · GG` para quem vai separar a peça.

Conferido em produção: bloco escondido por padrão sem `required`; ao escolher a capa
aparecem os 8 rádios obrigatórios; a marcação acende os chips; voltar para pastilhas
esconde, limpa e tira o `required`. O `FormData` do formulário real carrega
`brinde_cor: verde_limao` e `brinde_tamanho: G3`. Solicitações antigas, sem os campos,
seguem exibindo só o nome do brinde.

## 19/08/2026 — Brinde confirmado na saída, com baixa de estoque no Bling

O agendamento guarda só a **categoria** que o solicitante escolheu (`pastilhas`,
`mochila`, `capa`). Faltava confirmar o que saiu de fato. Agora o check-out tem um bloco
**Brinde entregue**, obrigatório antes de salvar.

- **Busca no Bling por nome ou SKU**, com miniatura, nome e estoque atual em cada opção.
  A busca roda sobre a lista já em cache (2.000 produtos), então responde a cada tecla sem
  ida à rede. SKU exato vem primeiro, depois quem tem estoque.
- A miniatura usa o mesmo gancho `data-drive-sku`, então a foto do Drive tem prioridade
  sobre a do Bling — igual ao resto do painel.
- Ações em **botão de ícone**, no padrão do painel: ✓ confirmar (verde), ⇄ trocar (azul),
  🗑 remover (vermelho), e × para fechar a busca. O grupo de ações caiu de ~230px para
  **74px**. Todos com `data-tip`, que o observador converte em `aria-label` e `title` —
  conferido: zero botões sem nome na tela.
- **+ Adicionar brinde** manteve o rótulo de propósito: é a porta de entrada do bloco, e
  um + solto dentro do card seria difícil de achar.
- Remover tudo é válido: cobre a saída sem brinde.
- Ao salvar, cada brinde confirmado **baixa uma unidade** no Bling
  (`blingStockOut`, operação S).

**A sugestão não se aceita sozinha.** A primeira versão resolvia a categoria num produto
e já entrava confirmada — mas "pastilha" casa com dezenas de itens, e o palpite veio
`PASTILHA DE FREIO (CANAÃ)` quando o brinde de verdade é outro. Baixar estoque de um SKU
adivinhado erra calado. Agora a sugestão aparece marcada como sugestão e alguém clica em
Confirmar.

**Idempotência:** `gifts_stock_applied` guarda os ids que já baixaram. Salvar de novo para
corrigir km ou foto não tira estoque outra vez — verificado: segunda gravação atualizou a
quilometragem e não chamou o Bling.

---

**Bug grave achado no caminho: nenhum check-in ou check-out era gravado.**

`saveCiForm` escrevia em `sb.from('checkins')` e `sb.from('checkouts')`. As tabelas são
`mc_checkins` e `mc_checkouts` — as outras não existem. A própria mensagem de erro
("Você já criou a tabela 'checkouts' no Supabase?") indicava que o autor esperava o nome
sem prefixo.

As duas tabelas tinham **uma linha cada, de 16/04/2026**, e nada depois. Ou seja: desde
que essa função foi escrita, todo check-in e check-out do pátio se perdia — o operador
via um toast de erro e o registro não ficava. Corrigido no mesmo commit; a gravação foi
confirmada em produção (linha criada, lida de volta e depois apagada).

**Como o resto foi verificado:** fluxo completo com `blingStockOut` substituído por um
espião, para não mexer no inventário real como teste. Confirmado que a chamada sai uma vez
por brinde, com quantidade 1 e a observação `Brinde Media Club — <solicitante>`. A baixa
real no Bling usa a mesma função que o módulo de envio a influenciadores já usa em
produção. O registro de teste foi apagado do banco.

## 19/08/2026 — Badge de status fora de linha no detalhe

A etiqueta PENDENTE ficava **3,5px abaixo** do rótulo STATUS. Causa: `.detail-row` é um
grid alinhado pelo topo, e o badge tem `padding: 4px 10px` próprio — o texto dele nasce
mais baixo que o do rótulo. Nas fileiras de texto puro o erro era de 1px e passava
despercebido; com o badge virou visível.

Corrigido com `align-items: center` na fileira, e `align-items: start` só nas de texto
longo (Endereço, Observações), onde o rótulo centrado flutuaria no meio do parágrafo.

Medido depois: **0px** em todas as treze fileiras, badge incluído.

Varredura nas 17 telas, medindo toda `.badge`, `.proj-dest-tag` e `.proj-status-select`
contra os irmãos da mesma fileira: **zero** desalinhamentos restantes no painel.

O dono pediu que isso vire regra permanente — está em `padroes.md` → Alinhamento, e na
memória do agente.

## 19/08/2026 — Rodapé do detalhe em botões de ícone

Pedido do dono: no rodapé do detalhe, os mesmos botões só de ícone que existiam na linha
da tabela. Ficaram `WhatsApp · Aprovar · Stand by · Rejeitar`, na ordem que a linha tinha.
A dica abre para cima, então não é cortada pelo `overflow: hidden` do popup.

Saiu junto o código morto: `reqBotoesStatusTexto`, a chave `botao` de `REQ_ACOES` e a
regra `.action-btn.standby`.

**Bug encontrado ao verificar — e é geral, não só deste rodapé.** Os quatro botões novos
ficaram **sem nome acessível**: `aria-label` e `title` vazios, contra a linha de base de
zero botões sem nome da auditoria.

Causa: `ajustar()` montava suas listas só com `raiz.querySelectorAll(...)`, que enxerga
apenas descendentes. Nas linhas da tabela o botão entra dentro de um `<tr>`, então é
descendente e era coberto; num `innerHTML` que monta os elementos no topo — o caso do
rodapé — **o próprio botão é o nó inserido** e escapava. É a mesma armadilha que já tinha
mordido nas tabelas, agora em `[data-tip]`, `button`, `img` e campos de formulário.

Corrigido com um helper `coletar(raiz, seletor)` que inclui a raiz na lista. Confirmado:
os quatro botões voltaram a ter `aria-label` e `title`, e a tela toda marca **zero**
botões sem nome.

## 19/08/2026 — Detalhe da solicitação em duas colunas

O popup de "Ver detalhes" era estreito (560px) e o popup inteiro rolava, o que empurrava
os produtos compatíveis para fora da vista.

- **920px de largura**, dados do solicitante em **duas colunas**. Doze campos curtos
  fecham exatamente seis fileiras; **Endereço e Observações** ficam em largura total, no
  fim — no meio do grid eles deixavam a célula vizinha vazia.
- **A rolagem acontece só na lista de produtos.** `.modal-content` e `.modal-body` viram
  coluna flex com `overflow: hidden`; a lista é o único item que cede espaço
  (`flex: 1 1 auto` com `max-height: min(380px, 42vh)`). O grid de dados leva
  `flex: 0 0 auto` para nunca ser cortado.
- Cada card de produto passou de ~217px para **433px** — o nome agora cabe inteiro em vez
  de terminar em reticências.
- O `max-height: 200px` da lista vem num `style=` inline compartilhado com os cards de
  Projetos e Clips, por isso o override precisa de `!important` e escopo `#modal`.
- Guarda para janela baixa (`max-height: 660px`): a rolagem volta para o corpo, senão o
  rodapé sairia da tela.

Medido com 42 cards forçados no DOM: a lista rolou 752px, corpo e popup ficaram parados e
o rodapé permaneceu visível. O popup só cresce até 90vh — a lista encolhe de 380 para
294px para caber.

Vale **só no computador** (`min-width: 901px`). No celular o popup segue folha na base,
uma coluna, rolando inteiro.

## 19/08/2026 — Ações da linha reduzidas a Ver e WhatsApp

Com o stand by, a coluna AÇÕES chegava a cinco ícones e ficava confusa. Pedido do dono:
deixar só **Ver detalhes** e **WhatsApp** na linha, e concentrar as mudanças de status
**dentro do detalhe**.

- Linha: 2 ícones em qualquer status. A coluna caiu para 106px e a folga foi para
  Solicitante e Moto, que pararam de quebrar em duas linhas.
- Rodapé do detalhe: `WhatsApp · Rejeitar · Stand by · Aprovar`. A lista de botões é
  invertida de propósito — a ação positiva fica à direita e a destrutiva à esquerda, como
  era antes do stand by existir.
- No celular nada muda: o menu "…" já concentrava tudo numa lista, que não era o problema.
- `.modal-foot` ganhou `flex-wrap` no celular, senão quatro botões espremiam.

**Custo aceito:** aprovar uma pendente passou de 1 clique para 2 (abrir o detalhe e
decidir). Com a fila normalmente em uma ou duas pendentes, vale a troca pela tabela limpa.
Se incomodar, o caminho de um clique é transformar o badge da coluna STATUS num seletor,
como já é em Projetos, Edição e Clips.

## 19/08/2026 — Solicitações: ordem padrão e o status Stand by

**Ordem padrão** passou a ser a data de recebimento, da mais recente para a mais antiga
(era data de agendamento, crescente). Só o valor inicial mudou: se o operador clicar em
outra coluna, a escolha dele continua valendo até recarregar a página.

**Status novo: `standby`.** Solicitação que não foi descartada, só ficou em espera — moto
interessante para a qual ainda não há produto em estoque para testar.

- O banco tinha um `CHECK` que só aceitava `pending/approved/rejected`. Sem migração, a
  gravação falharia. Constraint `requests_status_check` recriada com o quarto valor.
- Badge violeta (`--tx-standby` / `--bg-standby`), medido: **6,95:1** no escuro e
  **7,63:1** no claro.
- Aba **Stand by** entre Aprovadas e Rejeitadas.
- Botões, itens do menu "…" e rodapé do modal passaram a ser montados a partir de uma
  lista (`REQ_ACOES`), mostrando os destinos possíveis menos o status atual. Antes eram
  ternários repetidos em cinco lugares — acrescentar um quinto status agora é uma linha.
- Também no seletor do modal de editar agendamento e na contagem do dashboard.

Conferido em produção com ida e volta numa solicitação já rejeitada: o banco aceitou
`standby`, a linha renderizou o badge certo, a aba filtrou, e o registro voltou ao valor
original (a tabela não tem `updated_at`, então terminou idêntico).

**Bug antigo corrigido de passagem:** o handler das abas de filtro pegava *todo*
`.filter-btn` da página, incluindo as abas de Check-in/Check-out, que não têm
`data-filter`. Clicar nelas zerava o filtro das solicitações e apagava o "active" das
quatro abas. Agora o seletor é restrito a `#view-requests .filter-bar`.

## 17/08/2026 — Verificação de domínio no Meta + campanha montada

Meta tag `facebook-domain-verification` no `<head>` da home. **Status: Verified.**

A tag não pode ser injetada por JS — o rastreador do Meta lê o HTML servido. Por isso
ela fica no `<head>` estático, ao lado do bloco do pixel. Não remover.

Detalhe que confunde: o diálogo de criar domínio afirma que "só pode verificar o domínio
raiz, não um subdomínio", mas o `mediaclub.fullpro.com.br` foi adicionado e verificou
normalmente por meta tag. O `fullpro.com.br` segue **Not Verified** (pendência da loja).

Campanha `FullPro Media Club Ads` (rascunho, conta 834166548630365): segmentação, textos,
URL com UTMs e CTA prontos. Só falta o vídeo. Ver `pendencias.md`.

Um achado que valeu: a prévia mostrava carrossel/coleção com **produtos da loja**
(pastilhas de freio) anexados ao anúncio, porque o aprimoramento "Produtos" e os formatos
Carrossel/Coleção vinham ativos. Desativados — mostrar peça de freio para quem está sendo
convidado a emprestar a moto não faz sentido. Custo: a pontuação da campanha caiu de 77
para 59, porque o Meta estima +10,8% e +6,8% de conversão com esses formatos. Reversível
em um clique se o dono discordar.

---

## 17/08/2026 — Meta Pixel na landing pública

Para a campanha de vídeo no Meta Ads mirando Joinville e região (público: interesse em
motos), a landing precisava rastrear conversão. Bloco `FP-META-PIXEL` no `index.html`.

**Pixel próprio, não o do e-commerce.** Criado o conjunto de dados `Pixel Media Club`
(ID `1794140864938355`) no portfólio FullPro Ltda, conectado à conta de anúncios
`FullPro - Conta de anúncios` (834166548630365). O `Pixel FullPro (Main)`
(`1012196736930876`) continua exclusivo da loja: misturar os dois colocaria quem só quer
emprestar a moto nos públicos de remarketing de quem compra peça, e vice-versa.

Na criação, o checkbox "Adicionar a API de Conversões" vinha marcado e afetaria **todos os
conjuntos, novos e existentes** — desmarcado, porque mexeria também no pixel da loja.

**Só na `index.html`.** O `admin.html` não leva pixel: a equipe usando o painel entraria
no público da campanha.

Eventos:

| Evento | Quando | Tipo |
|---|---|---|
| `PageView` | carga da página | padrão |
| `ClicouAgendar` | clique nas CTAs `#agendar` | custom |
| `Contact` | clique no link do WhatsApp | padrão |
| `Lead` | **depois** do insert em `mc_requests` retornar sem erro | padrão |

`Lead` fica depois do insert de propósito: se o Supabase falha, o evento não dispara e a
métrica do Meta bate com as solicitações reais. O payload não leva nome, WhatsApp nem
e-mail — só modalidade, moto e brinde.

`ClicouAgendar` existe porque `Lead` vai demorar a ter volume (o Meta precisa de ~15-25
por semana para otimizar); serve de sinal de meio de funil nesse período.

**Como desligar:** deixar `window.FP_PIXEL_ID` vazio. O guard (`/^[0-9]{10,}$/`) não
carrega nada e a página segue igual — testado. `window.fpTrack` nasce como no-op, então
nenhuma chamada quebra o fluxo se o pixel não carregar.

O `sw.js` não interfere: ignora requisição cross-origin (linha 60).

## 13/08/2026 — Edição com o mesmo tratamento

Tudo em CSS, sem tocar na marcação — o módulo já tinha o menu "…".

- **Painel de números: 97px → 62px.** Eram dois cartões em cima e um embaixo, cada um com
  ícone de 42px. Agora são três numa fileira de 118px, sem o ícone (não cabe) e com o
  número em 20px. A barra de progresso passou a ocupar a largura do cartão.
- **Cabeçalho numa linha:** título + status + "…", mesmo centro vertical; os chips de
  destino descem para a linha seguinte.
- **Meta: três caixas de 52px → duas fileiras de 15px.** Moto/Produto ocupa a largura
  toda; Data e Links dividem a de baixo.

**Card: 463px → 302px.** Nos oito projetos em edição: 3.597px → 2.521px de rolagem.

**A técnica que destravou o cabeçalho:** os chips de destino ficam *dentro* do bloco do
título, então a ordem natural jogava as ações para uma terceira linha. `display: contents`
no bloco do título e em `.edit-actions` promove título, chips, status e "…" a filhos
diretos do flex — aí basta `order` e `flex-basis: 100%` nos chips para montar as duas
linhas. Sem isso seria preciso mexer na marcação, o que mudaria o computador.

**Nota de verificação:** a janela do Chrome estava em 1546px nesta rodada e o
`resize_window` não pegou, então a conferência foi feita aplicando as regras do próprio
bloco `@media` sem a media query, com a lista limitada a 366px. O computador foi conferido
na largura real: chips, ícones, paddings e margens idênticos aos de antes.

## 13/08/2026 — Clips com o mesmo tratamento de Projetos

Mesmo padrão, aplicado à tela de Clips no celular:

- **Filtro em seletor nativo** com a contagem em cada opção (`Todos (6)`,
  `Planejamento (4)`…). Os quatro chips coloridos vazavam a largura da tela; continuam no
  computador.
- **Ações no menu "…"**: Abrir/editar, Ver anúncio no Mercado Livre e Excluir clip. O
  lápis e o ícone do Mercado Livre ao lado do título ficaram só no computador.
- Título, status e "…" **numa linha só**, com o mesmo centro vertical.
- Caixa do produto e bloco de observações mais justos; a prévia das observações passou de
  5 para 3 linhas.
- O degradê que corta a prévia era de 40px sobre uma caixa de 60px — apagava duas das três
  linhas. Passou a 22px.

**Card: 273px → 210-223px.**

**Erro próprio corrigido:** as classes `.fp-clip-*` são declaradas *depois* do bloco
`@media (max-width: 600px)` no arquivo, então venciam por ordem de fonte e as regras de
celular não pegavam nada (medido: `max-height` continuava 96px). Resolvido com escopo
`#view-clips`, que também isola a tela de Edição — ela usa as mesmas classes
`.edit-card` / `.edit-card-head` e já tinha o layout ajustado.

## 13/08/2026 — Menu ancorado no botão e mais aperto no card

Quatro pedidos do dono, todos no celular:

- **O menu "…" abre colado ao botão**, não mais como folha na base da tela. O JS já
  calculava a posição ancorada e virava para cima quando não cabia — o CSS mobile é que
  jogava tudo para a base com `!important`. Bastou tirar o override. Conferido: no
  primeiro card abre 6px abaixo do botão; no último da lista vira para cima e continua
  inteiro dentro da tela.
- **Botão "…" de 44px para 26px de largura.** A altura do alvo continua 44px, mas com
  `margin: -9px 0` para não esticar a linha do título. Card de título curto: −18px.
- **Títulos de projeto sempre em maiúsculas**, na listagem de Projetos e na de Edição.
- **Status centralizado com o título.** Era `align-items: flex-start`; virou `center`, e
  agora título, status e "…" compartilham o mesmo centro vertical com título de uma ou
  de duas linhas (medido: 214,8px nos três).

## 13/08/2026 — Botão "novo" no padrão do iPhone e card de projeto compacto

**Pedido do dono:** o + no canto superior direito, "parecendo mais com o sistema padrão
do iPhone e não um quadrado azul com um + no centro". Depois: organizar as informações
da listagem, manter o menu "…" no canto superior direito e apertar os cards.

- O botão deixou de ser um quadrado azul preenchido e virou o **glifo + em azul de
  sistema** (`#0A84FF` no escuro, `#007AFF` no claro), sem caixa, alinhado ao canto
  superior direito na mesma linha do título. O alvo continua 44×44; o desenho é só o
  símbolo. Vale para as 5 telas que têm o botão.
- Por que **não** `position: absolute`: na Agenda são dois botões nesse mesmo canto e
  tirar do fluxo empilharia um sobre o outro. Foi `flex-wrap: nowrap` + `margin-left: auto`.
- O `-8px` de margem à direita é metade da folga entre o glifo e a borda do alvo — é o
  que alinha o + com a margem do conteúdo em vez de encostar o alvo na borda da tela.
- **Card de projeto: 188px → 136px** (sem produtos compatíveis). Título, status e o menu
  "…" numa linha só; a fileira de destinos logo abaixo; a meta em duas fileiras, com
  Moto/Produto ocupando a largura toda.
- A meta em duas colunas espremia "BMW R 1300 GS 2026 (0000000)" em **quatro linhas**.
  Virou flex: o texto longo pega a fileira inteira, Data e Custos dividem a de baixo.
- O bloco de produtos compatíveis cobrava 6px de margem mesmo vazio — 31 dos 40 cards.
  Agora `:empty` some.

**Dois erros próprios corrigidos no caminho:**
- `flex: 0 0 auto` no grupo de ações fazia o filtro de período de **Meus Posts** empurrar
  o + para uma segunda linha. Passou a encolher.
- A regra do último filho tem especificidade maior que `.page-head .fp-new-btn`, então o
  botão de **Templates** encolhia para 40px em título longo. Resolvido com `min-width`.

## 13/08/2026 — Menu lateral compacto e avisos do console

- Itens do menu de 44px para **34px**. A causa era uma regra própria de alvo de toque:
  17 itens × 44px = 748px, não cabia. Ali o alvo é a linha inteira (largura toda, sem
  vizinho ao lado), então 34px é seguro. Cabem 15 itens em vez de 11.
- `<meta apple-mobile-web-app-capable>` estava depreciado — aviso introduzido ao montar o
  PWA. Passa a vir junto com `mobile-web-app-capable`.
- Erro **406** nas metas: `.single()` numa consulta que pode não achar linha. Não existem
  metas para agosto/2026, só para junho. Trocado por `.maybeSingle()`.

## 13/08/2026 — Filtros do celular numa linha só

- A caixa em volta dos filtros saiu: os três seletores ficam direto sobre o fundo.
- Ordem: **status → destino → ordenar**. O bloco separado "Filtrar por destino" sumiu no
  celular; virou o seletor do meio, com rótulo curto.
- Altura da área de filtros: de ~90px para **34px**.
- Corrigido: a regra pegava qualquer `.proj-filters`, e **Meus Posts** usa a mesma classe
  com chips — passaram a vazar. Regra restrita a Projetos; as outras rolam.

## 13/08/2026 — Reversão do desktop

**Pedido do dono:** o computador estava bom e não devia ter mudado.

- Restaurados no computador: os 6 chips coloridos de filtro e os botões de ícone.
- O novo (menu "…", seletor nativo) ficou só no celular, via `.fp-so-desktop` /
  `.fp-so-mobile`.
- Conferido que nenhum seletor de CSS que o computador usava se perdeu.
- Limpeza: saiu o painel de filtro próprio que virou código morto — 3,1 KB de CSS e
  122 linhas de JS.

**Lição:** a partir daqui, toda melhoria de interface entra só no celular por padrão.

## 13/08/2026 — Ações em menu "…" e filtro em caixa

- Projetos, Solicitações, Edição e Templates passaram a ter as ações num menu por item.
- Filtro de status virou caixa suspensa.
- (Ambos foram depois restringidos ao celular — ver acima.)

## 13/08/2026 — Correções mobile a partir de prints do iPhone

- `.edit-card-head` e `.edit-actions` não tinham **nenhuma** regra mobile: título quebrava
  em 3 linhas com os botões desalinhados ao lado.
- Card de projeto: de ~600px para **188px** de altura. Uma regra antiga empilhava título
  e ações em coluna — fazia sentido com 5 botões, não com o menu.
- Fileiras de chips passaram a rolar na horizontal.
- Todo input a **16px** (abaixo disso o iOS dá zoom sozinho e desloca a tela).
- `env(safe-area-inset-*)` no header, menu e rodapés.
- Menu lateral passou a rolar, fechar com Esc e devolver o foco.
- Modais viraram folha que sobe da base.
- 8 das 9 tabelas não tinham contêiner de rolagem — o observador passou a envolver
  qualquer tabela. **A verificação precisou olhar a raiz também:** quando o nó inserido
  *é* a tabela, `querySelectorAll` não a encontra.
- **Bug próprio corrigido:** o código do Drive apagava o conteúdo da caixa antes de saber
  se a foto carregava; se falhasse, sobrava um quadrado cinza. Visível só no celular, com
  rede mais lenta. Agora só troca no `onload`.
- **Regressão própria corrigida:** `margin-left:auto` para encostar o botão "novo" pegava
  o próprio bloco do título nas telas sem botão — o cabeçalho de Edição ia para a direita,
  cortado.

## 13/08/2026 — Integração com o Google Drive

Foto de produto pela pasta com o nome do SKU, em Clips e em produtos compatíveis.

- Edge function `drive-proxy` com conta de serviço (JWT RS256 assinado com
  `crypto.subtle`). A credencial nunca chega ao navegador.
- A tela pergunta **uma vez só** quais SKUs têm foto — sem isso cada card geraria um 404.
- Cache em duas camadas: mapeamento no banco, imagem no navegador (1 dia).
- Resultado com dados reais: **23 de 39 produtos** ganharam foto numa tela de check-in —
  e nenhum deles tinha imagem no Bling.
- Otimização: guardar o `thumbnailLink` cortou uma das duas idas ao Google por foto
  (1,5s → 1,0s).
- Corrigida regressão própria: a contagem paginada de 5.493 pastas travava a aba
  Integrações por 8s ao abrir. Virou sob demanda (`?contar=1`).

## 13/08/2026 — Botão do Mercado Livre ao lado do título (Clips)

Ficava numa linha própria abaixo, criando um degrau de altura em todo card.

## 12–13/08/2026 — Auditoria de UX/UI e aplicação

Auditoria das 17 telas com medição no DOM, CSS e rede. 25 achados, todos aplicados.

Antes → depois, medido em produção:

| | Antes | Depois |
|---|---|---|
| Contraste reprovado (tema claro) | 41 de 85 | **0** |
| Contraste reprovado (tema escuro) | 11 de 79 | **0** |
| Requisições para 6 telas | 96 | **1** |
| `mc_admin_users` por sessão | 25× (pico 3,9s) | **1×** |
| Botões sem nome acessível | 115 | **0** |
| Popups nativos | 150 | **0** |
| Scroll ao trocar de tela | 632px | **0px** |

Principais correções: filtro que abria escondendo 35 de 40 projetos; tabela que ordenava
por uma data e destacava outra; check-in com teclado alfabético para quilometragem e sem
`capture` na câmera; "Limpar todos os dados" com o mesmo peso visual de "Baixar CSV";
PWA com modo offline; feedback sem popup nativo.

**Fora do escopo, achado no caminho:** XSS armazenado vindo do formulário público —
nome, moto, placa e WhatsApp entravam sem escape em 23 pontos. Verificado que o padrão
antigo executava o payload e o novo não.

**Dois pedaços de código morto:** o botão "Ver todos" do dashboard chamava
`switchView()`, que não existia; e a tela de Clips ficava em branco porque um erro de
consulta só ia para o console.

**Três problemas que só apareceram testando:** o reset de scroll não funcionava no
roteador que eu havia editado (há três gerações empilhadas); o escape de HTML quebrava um
handler `onclick`; e o `vercel.json` bloqueava a câmera por header, o que teria anulado a
melhoria do check-in.

Backup em três camadas antes de começar — ver `ambiente.md`.
