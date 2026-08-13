# Diário

Registro do que foi feito e por quê. Mais recente primeiro.

---

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
