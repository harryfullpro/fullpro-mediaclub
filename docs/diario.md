# Diário

Registro do que foi feito e por quê. Mais recente primeiro.

---

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
