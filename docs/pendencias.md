# Pendências

Ordenado por impacto. Atualizar sempre que algo for concluído ou aparecer.

---

## Em andamento

### Publicação: o Facebook nunca postou de verdade
O código está no ar (`publicar` v5, 01/09) e o `health` diz `pode_publicar: true`,
mas **isso mede permissão, não resultado**. Testar de verdade é postar na Página
pública da FullPro, e essa é decisão do dono. O teste honesto é um só: agendar um
vídeo qualquer para daqui a 10 minutos marcando **só o Facebook**, ver cair,
apagar. Enquanto isso não acontecer, "Facebook pronto" é uma previsão minha.

Vale para o Instagram também, com uma diferença: lá o contrato foi provado
(`content_publishing_limit` respondeu 200, cota 100/24h, 0 usadas), mas nenhum
post real saiu por aqui ainda.

### YouTube e TikTok: parado na mão do dono, não no código
Os dois passo a passo estão em [`publicar-passo-a-passo.md`](publicar-passo-a-passo.md).

- **YouTube** — a chave de API conectada **só lê**; upload exige OAuth com escopo
  `youtube.upload`. Preciso do Client ID e do Client Secret (redirect
  `https://mediaclub.fullpro.com.br/admin`). Armadilha: app em "modo de teste" tem
  refresh token que **expira em 7 dias**. E cada upload custa 1.600 das 10.000
  unidades diárias — teto real de **6 vídeos/dia** para o projeto inteiro.
- **TikTok** — falta o produto Content Posting API, os escopos `video.publish` e
  `video.upload`, o domínio verificado (TXT na GoDaddy) e a **auditoria**. Antes da
  auditoria passar, todo post por API sai `SELF_ONLY`: publicar e esperar virar
  público não funciona.

### Régua de front-end/design: Metas e Dashboard feitos, faltam as outras
Em 31/08/2026 passaram **Metas** e o **Dashboard** (as duas frentes). As duas
usam o mesmo sistema: `.fp-pgrade` + `.fp-mp`, cromo em cinco tokens.

Regras que saíram do Dashboard e valem para as próximas:

- **Nada de medida de layout inline.** `grid-template-columns` inline não tem
  onde a media query pegar, e com `overflow-x: hidden` no `<main>` o estouro é
  cortado em silêncio: ninguém vê o defeito no computador. Se tem grade, tem
  classe.
- **Vão sem regra é buraco silencioso.** `data-col="3"` não existia no CSS e o
  painel caía no padrão `span 6`, deixando meia fileira vazia. Todos os vãos
  de 2 a 12 estão definidos agora.
- **Marquinha colorida, rótulo neutro.** Texto na cor da categoria sobre a
  própria cor diluída é contraste baixo por construção — deu 2,16:1 no claro.
  Vale para legenda, etiqueta e qualquer chip categórico.
- **Paleta de sequência é ordenada, não arco-íris.** E L constante NÃO serve em
  barra segmentada: medido, dá separação 1,00 entre vizinhos.
- **Número grande é promessa.** Se o valor é 1, 1 e 0, ele não sustenta 26px.

### Telas que ainda faltam na régua
A tela de **Metas** foi a primeira a passar pelo padrão novo em 31/08/2026 (ver
`diario.md`). O que dela vale como regra para as próximas:

> **Atenção:** a grade de **card** vale em **Metas e Dashboard** (ver
> `contexto.md` → "A exceção: telas de painel"). Nas telas de LISTAGEM continua
> a regra de sempre: sem container, fio de 1px. Card é para tela de painel, em
> que cada bloco é um instrumento diferente — não para listagem.

1. **O instrumento tem que ganhar a largura, não o rótulo.** Em Metas era
   542px de nome contra 210px de gráfico.
2. **Um gráfico por natureza do dado, não um gráfico para tudo.** Sete metas
   pediram sete tratamentos, e a escolha virou coluna no banco em vez de `if`
   no código.
3. **Uma pergunta por canal.** Se número, barra, projeção e gráfico dizem a
   mesma razão, três deles são enfeite.
4. **Veredito em palavra, não só em cor.** Cor sozinha não passa em
   acessibilidade e não consegue dizer duas coisas na mesma linha.
5. **Fração tipográfica alinhada pela linha de base**, com `tabular-nums`.
6. **Subtítulo de `.page-head` que repete o `<h1>` sai.** Em Metas custava 130px
   no celular. Vale checar tela por tela — é candidato a regra global.
7. **Medir com canvas, não a olho:** contraste de cada cor nos dois temas, e
   desvio de linha de base com sonda `inline-block` de altura 0. **Cor com alfa
   tem que ser COMPOSTA sobre o fundo antes de medir** — sem isso os quatro
   degraus de uma escala saem com 1,01:1 entre si e você conclui que a escala
   está quebrada quando é a medição.
8. **`opacity` não serve para hierarquia de texto:** derruba o contraste do
   texto junto com o do fundo. Diga "isso ainda não aconteceu" com forma
   (fundo vazado), não com transparência.

Telas na fila, por uso: Dashboard, Projetos, Produção de fotos, Meus Posts,
Bonificação, Agenda.

### Quatro backups de código estão no repositório e vão para o ar
`admin.html.bak-fp-bling` (1,5 MB, cópia inteira do painel) e três
`supabase/*.ts.bak` estão **rastreados no git**. A Vercel serve a raiz, então
`mediaclub.fullpro.com.br/admin.html.bak-fp-bling` responde. Não há segredo
neles — o painel é estático e público de qualquer forma — mas é código morto
servido, e o `.bak` de uma edge function pode mostrar lógica que a versão atual
já não usa. `git rm --cached` nos quatro resolve; o `.gitignore` já barra novos
(`*.bak-*` entrou em 31/08).

### `mc_clips` está vazio e a meta de 40 clips não tem fonte
`select count(*) from mc_clips where recorded_at is not null` = **0**. Os 6 clips
que aparecem em agosto são as linhas que entraram à mão no teste. O coletor lê
`mc_clips` (fonte interna, não é API), então enquanto ninguém registrar clip
naquela tabela a meta "Produtos com clip" vai ficar parada nos 6. Ou o módulo
Clips passa a gravar lá, ou a meta precisa de outra fonte.

### Promover alguém a administrador agora só pelo Supabase
O gatilho `mc_admin_users_sem_autopromocao` recusa qualquer INSERT/UPDATE vindo
do cliente que ponha um cargo começando com "admin". Efeito prático: **criar um
usuário já como "Administrador" pela tela de Usuários vai dar erro**. Promover é
raro e agora é feito pelo Supabase (SQL ou dashboard) — que é exatamente o
ponto, porque `role` é editável pela própria pessoa em Meu perfil.

### Decisão do dono: o que a meta "Reposts diários" vai medir
A API **não** consegue reconhecer repost, e a limitação é escrita: a borda
`/stories` avisa que *"New stories created when a user reshares a story will not
be returned"* — o repost mais comum da casa (recompartilhar story de cliente)
não chega na coleta. Não há endpoint de arquivo. As opções reais:

1. **Como está hoje:** a máquina descarta o que é claramente story de câmera, e
   o que sobra é confirmado num toque, com a imagem na tela. Honesto, mas
   subconta — o reshare de story continua invisível.
2. **Trocar o que a meta mede** por algo que a API sustenta inteiro, ex. "dias
   com pelo menos um story publicado". 100% automático, significado diferente.
3. **Medir fora da API** (arquivo de stories no app do Instagram, na mão).
4. **Publicar o story PELO PAINEL** — o caminho que resolve de verdade, e que só
   apareceu na revisão. Publicando por `POST /{ig-id}/media?media_type=STORIES`,
   a classificação deixa de ser DETECTADA e passa a ser **declarada no ato**:
   quem publica diz se é próprio ou repost, e o número fica exato, sem visão
   computacional nenhuma. Preço: figurinha de link/enquete/localização não é
   suportada na publicação por API, e o gesto nativo de "recompartilhar story de
   terceiro" não existe por API — então esse caso continuaria fora. É decisão de
   FLUXO DE TRABALHO, não de detecção, e depende do módulo de publicação que ele
   já pediu.

Enquanto ele não decidir, vale a 1.

Detalhes técnicos que atrapalham qualquer uma delas, e que a revisão achou:
- `/tags` (mídia de terceiros que nos marcou) exigiria a permissão
  `instagram_manage_comments`, que **não** está nos nossos escopos — e mesmo com
  ela, "Mentions on Stories are not supported": nunca traz story.
- Insights por story falham com erro `(#10) Not enough viewers` quando o story
  teve menos de 5 espectadores.
- Desde 30/07/2026 o `media_url` pode ser omitido por configuração de download,
  com orientação de cair para `permalink`/`thumbnail_url` — o coletor já pede
  `thumbnail_url` primeiro, então isso está coberto.

### Rodar a troca das credenciais e esvaziar o config.js
A tela de Integrações já conecta Instagram e YouTube, mas **guardar a MESMA
credencial que já está pública não protege nada**: o `config.js` responde HTTP
200 sem login em `https://mediaclub.fullpro.com.br/config.js` e está commitado
no repositório. A ordem que resolve:

1. **Gerar credencial nova** (token da Meta / chave do Google) — a antiga
   continua valendo até ser revogada.
2. **Colar as novas em Integrações** e conferir que as duas linhas dizem
   "Conectado".
3. **Revogar a antiga** (Meta: invalidar o token; Google: apagar a chave).
4. **Apagar `IG_ACCESS_TOKEN` e `YOUTUBE_API_KEY` do `config.js`** e subir.
   `IG_USER_ID` pode ficar: é um id numérico público.

Detalhe do passo 4: o `sw.js` cacheia `/config.js` no `CACHE_SHELL`, então quem
já abriu o painel continua com a cópia velha até o próximo carregamento com
rede. Não é vazamento novo, mas confunde a conferência.

### Três decisões do dono sobre as metas de setembro
- **O valor por meta mudou de escala.** O caixa é `metas no ritmo × valor por
  meta`. Com 3 metas a R$ 850 o teto era R$ 2.550; com 7, é R$ 5.950. O
  `pool_per_goal` ficou como estava — a conta é que mudou.
- **A faixa de 10-15 min quase não existe hoje.** No canal inteiro são 10 vídeos
  nessa faixa; a maioria tem 4 a 9 minutos e não cai em meta nenhuma (aparecem
  em "peças fora das metas", no pé da tela).
- **"Pure Sound Triumph Speed 1200" tem 20 minutos.** Conta como pure sound pela
  regra do título, mas a meta diz "abaixo de 10 min". A tela mostra a duração ao
  lado em vez de decidir sozinha.

### `bling-proxy`: falta o passo 2 (a function ainda aceita anônimo)
Em 28/08/2026 o painel passou a mandar `Authorization: Bearer <jwt da sessão>`
em todas as chamadas do Bling (commit `7bf2152`), mas **a function ignora esse
cabeçalho**. Ela continua pegando o token do ERP em `mc_integrations`, renovando
sozinha e respondendo a qualquer requisição anônima — inclusive `stock-move`,
que escreve estoque, e `contact`, que lê dado de cliente. A URL está no
`admin.html` e o repositório é público.

O passo 2 é a function passar a exigir operador. A divisão em dois passos foi
deliberada: fazer os dois de uma vez derrubaria as ~780 chamadas/dia na hora.
**Antes de dar o passo 2, conferir no log das edge functions que as chamadas
estão chegando com o cabeçalho.**

⚠️ `bling-proxy.ts` **não está no repositório** — só `bling-sync.ts`. O código
dessa function vive apenas no Supabase. Baixar antes de mexer.

### O token do TikTok venceu em 18/08/2026
`mc_integrations.provider = 'tiktok'`, `expires_at = 2026-08-18`. O coletor
detecta e avisa, mas enquanto isso **nenhum vídeo do TikTok entra na contagem de
vídeos curtos**. Reconectar em Integrações.

### Os cinco operadores ainda não fizeram o primeiro acesso
patrik, andre, jose, matheus e yonan continuam com o hash antigo. A primeira
entrada de cada um migra a senha sozinha, pela ponte `mc-login` — a senha é a
mesma. Só vale avisar que é normal.

### `mc_fin_*` continua legível pela chave pública
3.852 lançamentos e 152 boletos. As outras 23 tabelas foram fechadas em
27/08/2026; estas ficaram porque **outra ferramenta do dono usa a mesma chave
anon** e fechá-las derrubaria essa ferramenta. Falta o dono dizer qual é, para
ela ganhar via própria.

### Ligar a checagem de senha vazada
Supabase → Authentication → Password protection. Um clique, nunca dado.

### Os PNGs originais dos logotipos estão parados no repositório
`Instagram.png` (1,3 MB), `yt_shorts.png`, `tiktok_2.png`, `mercado_livre*.png`,
`ads*.png`, `site.png` — ~1,9 MB. Desde 27/08/2026 **ninguém os referencia**: os
logotipos viraram SVG embutido e data URI de 64px em `FP_DEST_ARTE`. Eles são a
fonte das versões reduzidas; apagar é decisão do dono.

### Ligar o módulo de kit do Magis5 (falta a chave e um teste real)
O código está no ar (`magis5-proxy` + aba Produção), mas **nunca falou com o Magis5**.
Para ligar:

1. **Criar a secret `MAGIS5_API_KEY`** na edge function `magis5-proxy` (Supabase →
   Edge Functions → magis5-proxy → Secrets). ⚠️ O token antigo **vazou em texto puro** num
   `readme.txt` público do plugin `woo-magis5-shipping-bridge` (ver
   `06-MAGIS5-FLUXO-ENVIO.md` na base da loja) — gerar um **novo** no painel do Magis5.
2. **Validar em um kit de teste** duas coisas que a documentação não deixa claras:
   - **O que é `products_composition[].id`** — o painel manda o `productId` do componente
     (é a leitura mais natural da resposta, que separa `id` da linha de `productId`). Se o
     hub reclamar, a alternativa é o id da linha de composição.
   - **A regra da participação** — se o Magis5 exige que `percentagePriceValue` some 100 e
     o que ele faz quando não soma. O painel já mostra a soma e avisa, mas não bloqueia.
3. **Ver se SKU sem composição aceita virar kit** pelo PATCH, ou se o `productType`
   precisa ser mudado antes no hub.

Fazer o primeiro teste com um kit de brincadeira, não com um que está anunciado.


### Ligar o Slack da separação (falta o app e o token)
`fpSepMensagemSlack` e a edge function `slack-proxy` estão no ar e **dormentes**. Falta o
dono criar o app no Slack e fornecer o token `xoxb-`. Enquanto isso, a lista de separação
vai por **PDF de link público** — que resolve o dia a dia e pode muito bem ficar como é.

### Os PDFs de separação se acumulam sem limpeza
Balde `storage/separacao`, público, com políticas de SELECT e INSERT para `anon` e
**sem DELETE**. Cada lote gerado vira um arquivo que fica lá para sempre. Não é urgente
(são alguns KB cada), mas precisa de uma decisão: prazo de validade, limpeza manual pela
aba Manutenção, ou nada.

Cuidado ao mexer: `sb.storage.remove()` **responde sucesso mesmo quando o RLS bloqueia** —
a resposta traz os nomes pedidos, não os apagados. Conferir listando de novo.

### Campanha do Meta Ads — só falta o vídeo
Rascunho `FullPro Media Club Ads` na conta `FullPro - Conta de anúncios` (834166548630365),
conjunto `Landing page`, anúncio `video-joinville-01`. Tudo configurado: Joinville + 40 km,
interesses de moto, 3 textos, 3 títulos, descrição, URL com UTMs, CTA "Agendar agora",
formato travado em Mídia única. **Falta subir o vídeo** (9:16 e 4:5) em Criativo do
anúncio → Mídia → Carregar.

Dois bloqueios que não são meus de resolver:
- **Limite de gastos da conta quase atingido** — avisado no painel; sem resolver, a
  campanha não veicula mesmo publicada. É cobrança, só admin.
- **4 rascunhos pendentes** na conta compartilham o botão "Conferir e publicar" — conferir
  o que vai junto antes de publicar.

### Verificar o domínio fullpro.com.br (loja)
O `mediaclub.fullpro.com.br` já está Verified. O `fullpro.com.br` continua **Not Verified**
— isso degrada a atribuição no iOS dos anúncios da loja. Caminho: meta tag no `<head>` via
Breakdance Custom Code, ou TXT no DNS da GoDaddy. Fora do escopo do Media Club.

### Decidir sobre banner de consentimento (LGPD)
A landing não tem banner e o pixel dispara antes de qualquer opt-in. É o padrão do mercado
para página de captação com formulário, mas a decisão é do dono. Se ele quiser, o
`fpTrack` já é no-op por padrão — basta condicionar o init ao aceite.

### Auditoria mobile — telas que faltam olhar
Já tratadas: Projetos, Clips, Edição, Solicitações, Check-in, Integrações.

Projetos, Clips e Edição já receberam o pacote completo (filtro em seletor quando há
filtro, ações no menu "…", card compacto). **Solicitações ainda está no meio do caminho**
— tem o menu "…", mas não passou pelo aperto de card nem pelo filtro em seletor.

**Faltam ver em largura de celular:** Agenda (calendário), Influenciadores (5 tabelas e
abas), Metas, Debriefing, Usuários.

Estado medido: em viewport de 390×844, **nenhuma das 17 telas vaza a largura** e não há
rolagem horizontal na página. O que falta é avaliação de *layout* — densidade, ordem,
o que sobra e o que falta — não de vazamento.

### Preferências de notificações é uma tela vazia de propósito
A view `prefs-notificacoes` existe no menu do usuário e mostra um card **EM
BREVE**. Falta decidir o que entra: e-mail de solicitação nova, aviso de
emergencial na fila, resumo diário. Nenhum canal está ligado.

### O menu lateral pede ~880px de altura para caber inteiro
Com 22 módulos e 4 títulos de seção, abaixo de ~880px de janela a lista rola (em
860px faltam 27px; em 780px, 107px). Se incomodar em alguma tela, a saída é
reduzir a altura da linha — e **nos dois estados juntos**, senão os ícones
voltam a se mexer quando a barra abre no hover (ver `padroes.md`).

### Logo recolhida: a versão com ® está de fora
`assets/logo-short.png` é o "F" vermelho que o dono mandou. A variante dele traz
o ® ao lado, que a 32px vira borrão — trocar só se ele pedir.

### Ajuda e tutorial só existem nos módulos de foto
Falta escrever o verbete de Solicitações, Agenda, Check-in, Projetos, Edição,
Clips, Debriefing e das telas de Performance. O motor já está pronto: é
acrescentar a entrada em `FP_AJUDA` com `titulo`, `intro`, `itens` e `passos`.

---

## Segurança

### `tiktok-proxy` atende qualquer pessoa da internet, sem autenticação nenhuma
Medido em 01/09/2026, do meu terminal, **sem um único cabeçalho**:

```
curl "https://xgaaocnuqgcwttrljqep.supabase.co/functions/v1/tiktok-proxy?action=user-info"
→ HTTP 200 {"data":{"user":{"follower_count":560,...}}}
```

`verify_jwt` está desligado e a função **não confere nada no corpo** — ao
contrário da `instagram-proxy`, que exige JWT de operador. Três consequências,
em ordem de gravidade:

1. **`?action=disconnect` apaga a integração e não pede nada.** Um POST de
   qualquer lugar do mundo derruba o TikTok do painel. É destrutivo e anônimo.
2. **As leituras (`videos`, `user-info`, `video-query`) usam o NOSSO token** e
   servem nossa métrica para quem pedir, gastando nossa cota da API.
3. O `client_secret` do app está **escrito em texto dentro da função**. Não
   vazou (não está no repositório nem no histórico — conferido com `git log -S`),
   mas devia ser secret do Supabase, não literal no código.

**Por que ainda não consertei:** fechar isso exige mudar os ~7 `fetch` do
`admin.html` que hoje chamam sem `Authorization` (o Instagram usa
`sb.functions.invoke()`, que já manda o JWT sozinho) — e o `admin.html` estava
em edição na outra sessão. Precisa de combinação, não de pressa.

**Bônus achado no caminho:** em `atualizarMetricasInfluenciadores` o painel manda
`x-tk-token` com o token *do influenciador*, mas `resolveToken()` prefere o do
banco e **ignora o cabeçalho**. Ou seja, a métrica "do influenciador" é a nossa.

### `tiktok-proxy` não tem código-fonte no repositório
Está no ar na versão 6 e não existe em `supabase/`. Não dá para revisar, nem
para saber o que mudou entre as versões. Só descobri o conteúdo pedindo o fonte
ao Supabase.


### A sessão é o UUID do usuário, sem assinatura
`fp_session` no localStorage é apenas o `id` do operador. Quem tiver o UUID de um
administrador **entra como ele**. Não há assinatura nem validade.

Num painel interno o risco é contido, mas é o tipo de coisa que piora conforme a equipe
cresce. Correção real: token assinado com expiração, ou usar o Supabase Auth de verdade.

**O dono foi avisado três vezes e ainda não priorizou.** Não tratar sem ele pedir.

### `mc_fin_renames` e `mc_fin_rh` estão com RLS desligado
Qualquer pessoa com a anon key — que é pública, está no `config.js` — lê e escreve nessas
duas tabelas. São dados de pessoal e de renomeação financeira, o tipo de coisa que não
devia estar aberta.

Correção: `alter table … enable row level security` e políticas para `anon, authenticated`
como nas demais tabelas do painel (o painel não usa Supabase Auth — ver `padroes.md`).

**Levantado duas vezes, sem resposta do dono.** Ligar RLS sem política derruba a tela que
usa a tabela, então não fazer solto: é uma migração com teste na mesma sessão.

### Campos de senha fora de `<form>`
Gera três avisos no console (`Password field is not contained in a form`) e atrapalha o
gerenciador de senhas do navegador a oferecer preenchimento. Não quebra nada. Rápido de
arrumar.

---

## Dados

### Cinco projetos com "…" no título, salvos assim no banco
`cb 500…`, `pure sound cb500f + sprint cinza…`, `pure sound mt03 c/ Remap + pops and
bang…`, `troca de escapamento cb500f…`, `Video carburador…`

Não é corte de CSS — as reticências fazem parte do texto em `mc_projects.title`. O código
atual **não trunca títulos em lugar nenhum**, então é resíduo de algo antigo.

Aguardando o dono informar os nomes corretos. Não alterar dados sem isso.

---

## Não reproduzido

### Erro 400 no console
Apareceu num print do DevTools do dono (`xgaaocnuqgcwttrljqep_on&orde…`). As quatro
consultas de performance foram testadas e todas passam.

Para fechar: pegar a URL completa da requisição que falha, clicando nela no console.

---

## Dívida técnica conhecida

Nenhuma destas é urgente. Todas foram levantadas na auditoria e conscientemente adiadas.

### Consolidar os 12 breakpoints em 3
Hoje: 480, 560, 600, 720, 768, 900, 1000, 1200, 1400, 1600, 1920, 2000. Não é uma escala,
é uma coleção de valores adicionados conforme a necessidade.

Ganho é só de manutenção. Risco alto: exigiria testar as 17 telas em cada largura. Fazer
em sessão dedicada, tela por tela.

### Fatiar o `admin.html`
15 mil linhas, 1.001 `style=` inline, 262 `onclick=` inline, três gerações de código de
navegação empilhadas.

Foi essa sobreposição que fez o reset de scroll não funcionar — o roteador mais novo
clona os botões do menu e descarta os listeners dos antigos.

Caminho: extrair um módulo por tela, começando pelas que mais mudam (Projetos, Check-in).
É refatoração de dias, não item de checklist.

### As 31 views ficam montadas no DOM o tempo todo
~6 mil nós, 1,4 MB de HTML serializado, 18 `<h1>` simultâneos. Trocar de tela só alterna
`display`.

### Capa de post depende de URL que expira (13 de 22 posts sem imagem)

O painel guarda o **link** da thumbnail no CDN da plataforma, não a imagem. São URLs
assinadas: as do Instagram (`oe=`/`_nc_ohc`) já respondem 403 e as do TikTok venceram em
09 e 18/ago. O card hoje cai num placeholder honesto ("sem capa"), que resolve a
aparência mas não traz a imagem de volta — e a proporção só piora com o tempo, porque
toda capa nova também vence.

Correção durável: copiar a imagem para bucket nosso **no momento da coleta**, e guardar a
referência local. É o padrão que já roda para story (`bruto.thumb` + `fpTriAssinar`) —
falta aplicar a posts. Só o YouTube não precisa: `img.youtube.com` é estável (mas devolve
HTTP 200 com um cinza 120×90 quando não há capa, então continua precisando da checagem
por `naturalWidth`).


### Meus Posts mostra 24 de 81 publicações — três fontes para a mesma coisa

Medido em 01/09/2026:

| Fonte | O que é | Publicações |
|---|---|---|
| `mc_pecas` | registro real de publicação, com `publicado_em` | 81 (fora story) |
| `mc_projects.posts` | lista mantida à mão dentro do projeto | 23 |
| `mc_performance_posts` | post avulso digitado no painel | 1 |

Meus Posts é alimentado pelas **duas últimas** e usa `mc_pecas` só para descobrir a data.
Ou seja: a tela de performance mostra menos de um terço do que foi publicado, e o que ela
mostra depende de alguém ter registrado à mão.

O dono já disse que **nem toda publicação vai ter projeto para vincular**, o que confirma
que a unidade certa é a publicação, não o projeto — projeto vira atributo opcional dela.
Consolidar em `mc_pecas` como fonte única resolveria de uma vez o alcance, a data e o
vínculo. É decisão dele, não conserto de tela: muda o que a tela mostra (24 → 81).

Falta também `mc_pecas.project_id`, que existe na tabela e está **100% vazio** — se
passasse a ser preenchido na coleta, o casamento por link viraria desnecessário.


### Erro ao entrar numa tela vira tela vazia silenciosa

`switchToView` chama o carregamento assim:

```js
Promise.resolve(refreshViewData(viewName))
  .catch(e => console.warn('refreshViewData', e))
```

Qualquer erro dentro de `refreshViewData` — de qualquer tela — some num `console.warn`.
A tela abre, fica vazia, e nada indica que houve falha. Foi exatamente o que escondeu o
`ReferenceError` do Planner em 01/09: um `view` em vez de `viewName` deixou a aba visível
e vazia por dias, e ela só enchia no clique.

O `.catch` existe por um motivo bom (um erro numa tela não pode derrubar a navegação), mas
hoje ele é indistinguível de sucesso.

Caminho: manter o `.catch` e acrescentar sinal — um estado de erro na área de conteúdo da
tela que falhou, com a mensagem. Enquanto isso vale a regra de diagnóstico: **se algo não
aparece ao entrar na tela mas aparece ao clicar, olhe esse `.catch` primeiro.**

Vale para todos os `case` do switch, não só para Meus Posts.


### O editor do cronograma pode criar horários ambíguos

A marcação automática casa publicação com horário por `(dia_semana, tipo, plataforma)`.
Medido em 01/09: essa chave é **única** nos 31 horários atuais — os dois `short` do mesmo
dia têm plataformas disjuntas.

Nada garante que continue assim. Se alguém cadastrar dois horários no mesmo dia com o
mesmo tipo e plataforma sobreposta, uma única publicação marcaria os dois, ou marcaria o
errado.

Caminho: o editor da grade avisar ao salvar quando a combinação já existir naquele dia.
Não é bloqueio — pode haver motivo para dois —, é o editor dizendo que a marcação
automática não vai saber distinguir.


---

## Ideias levantadas e não pedidas

Não implementar sem o dono pedir.

- Botão "Atualizar fotos do Drive" na aba Integrações, para forçar `action=limpar` sem
  usar terminal (o cache do mapeamento dura 7 dias)
- Filtro de destino no computador também virar caixa suspensa, para as duas telas ficarem
  iguais — hoje é um bloco recolhível separado
