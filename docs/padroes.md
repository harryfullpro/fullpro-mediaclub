# Padrões de código

`admin.html` tem ~15 mil linhas e **três gerações de código empilhadas**. É fácil
reintroduzir um problema já resolvido. Estas são as regras que valem hoje.

---

## A regra das duas interfaces

Melhoria de interface entra **só no celular**, salvo pedido explícito. As duas versões
convivem no HTML e a largura decide qual aparece — sem JavaScript de redimensionamento,
então funciona ao girar o aparelho.

```html
<span class="fp-so-desktop" style="display:contents">  <!-- ≥ 900px -->
  <button class="fp-icon-btn">…</button>
</span>
<span class="fp-so-mobile">                            <!-- ≤ 900px -->
  ${fpMenuHtml([...])}
</span>
```

```css
.fp-so-mobile { display: none !important; }
@media (max-width: 900px) {
  .fp-so-desktop { display: none !important; }
  .fp-so-mobile  { display: inline-flex !important; }
  select.fp-so-mobile { display: block !important; }
}
```

**Antes de mexer em qualquer CSS fora de `@media`, pergunte: isso muda o computador?**
Se muda e não foi pedido, coloque dentro do `@media`.

Pontos de corte: **900px** (tablet e celular deitado) e **600px** (celular em pé).

---

## Feedback: nunca `alert()`, `confirm()` ou `prompt()`

```js
fpToast('Check-in salvo.', 'ok');                    // ok | erro | warn | info
fpToast('Sem conexão.', 'warn', { duracao: 6000 });
fpToast('Envio registrado.', 'info', { acao: { texto: 'Desfazer', onClick: desfazer } });

if (!await fpConfirm({
  titulo: 'Excluir envio',
  mensagem: 'O registro sai do painel.',
  detalhe: 'A baixa de estoque no Bling NÃO é revertida.',
  confirmar: 'Excluir envio',
  perigo: true,
  digitar: 'APAGAR',        // opcional: exige digitação para liberar
})) return;
```

`fpConfirm` é assíncrono — a função que chama precisa ser `async`.

---

## Escape obrigatório em `innerHTML`

Nome, moto, placa, WhatsApp, observações e endereço vêm do **formulário público**. Isso
já foi XSS armazenado real: `<img src=x onerror=…>` no campo nome executava no painel do
operador.

```js
'<td>' + escHtml(r.nome) + '</td>'          // sempre
```

**Exceção:** dentro de atributo `onclick=`, o escape correto é o de string JS, não o de
HTML — escapar para HTML ali faz o parser devolver a aspa e quebrar a chamada.

```js
onclick="fn('${String(v||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'")}')"
```

---

## Navegação: o roteador que roda é `switchToView`

Fica perto do fim do arquivo. Ele **clona cada `.nav-item` e substitui o nó**, o que
descarta listeners registrados pelos roteadores mais antigos (`fpShowView` e o
`addEventListener` do começo do arquivo).

**Qualquer coisa que deva rodar na troca de tela vai em `switchToView`.** Nos outros dois
não executa. Foi assim que o reset de scroll ficou meses sem funcionar.

`fpResetScroll()` zera em três momentos (agora, dois frames e 60ms) porque a view termina
de renderizar depois do clique. Quem rola é o `<main>`, não a janela.

---

## Componentes prontos

### Menu de ações `fpMenuHtml`

```js
${fpMenuHtml([
  { rotulo: 'Ver resumo', icone: 'ver', acao: () => abrir(p.id) },
  { rotulo: 'Abrir no Drive', icone: 'pasta', href: p.drive_link },
  { sep: true },
  { rotulo: 'Excluir', icone: 'excluir', perigo: true, acao: () => excluir(p.id) },
], { rotulo: 'Ações do projeto' })}
```

As ações ficam no registro `FP_MENUS`, não viram string dentro de `onclick` — nome com
aspas não quebra nada. Ícones em `FP_ICONES`. Já traz teclado completo, coleta do
registro acima de 400 entradas e **posicionamento ancorado no botão**, virando para cima
ou para a esquerda quando não cabe.

> O painel abre **colado ao botão em qualquer largura**. Houve uma versão que o
> transformava em folha na base da tela no celular, com `!important` por cima do cálculo
> do JS — o dono pediu para tirar: obrigava a atravessar a tela com o polegar e escondia
> justamente o card que estava sendo editado.

**Cuidado:** dentro da interpolação `${fpMenuHtml([...])}` você já está em contexto JS —
usar `${i}` ali é erro de sintaxe, vai `i` direto.

Regras de uso:
- O controle mais usado (o `select` de status) fica **fora** do menu, visível
- Ação destrutiva vem depois de `{ sep: true }` com `perigo: true`
- Listagem com **uma** ação só mantém o botão direto — menu de um item é pior

### Modais

Um `MutationObserver` cobre os 13 modais `.modal.show` e o `#fpSumOverlay.open`: aplica
`role=dialog`/`aria-modal`, move o foco para dentro e devolve ao fechar, prende o Tab,
ativa Esc e clique fora, trava a rolagem do fundo. **Modal novo que siga o padrão
`.modal` + classe `show` herda tudo de graça.**

### Cabeçalho de página e botão "novo"

No celular (≤900px) o `.fp-new-btn` deixa de ser o quadrado azul e vira o **glifo + em
azul de sistema do iOS**, sem caixa, no canto superior direito da mesma linha do título.

Três detalhes que custaram para acertar:

- **Nada de `position: absolute`.** A Agenda tem *dois* botões nesse canto; tirar do fluxo
  empilha um sobre o outro. É `flex-wrap: nowrap` no `.page-head` + `margin-left: auto`.
- **`margin-right: -8px`** = metade da folga entre o glifo e a borda do alvo de 44px. É o
  que alinha o + com a margem do conteúdo, em vez de encostar o alvo na borda da tela.
- **`min-width` no botão, não `flex: 0 0 auto`.** A regra
  `.page-head > :last-child:not(:first-child)` tem especificidade 0,3,0 e vence
  `.page-head .fp-new-btn` (0,2,0) — o botão encolhia em telas de título longo.

Cabeçalho com filtro ao lado do botão (Meus Posts): o `<select>` recebe `flex: 1 1 auto`
para encolher, senão o + cai sozinho numa segunda linha.

### Card de listagem no celular

Alvo: o mínimo de linhas sem esconder informação. O card de projeto é a referência
(188px → 136px).

1. Título, status e o menu "…" **numa linha só**, com `align-items: center` para o status
   ficar na altura do meio do título. O "…" por último, com `order`.
2. Fileira de chips logo abaixo.
3. Meta com rótulo e valor **na mesma linha**, em flex — não em grid de colunas iguais.
   O campo de texto longo pega `flex: 1 1 100%`; os curtos dividem a fileira seguinte.
4. Container que pode vir vazio leva `:empty { display: none }` — senão cobra margem.
5. Filtro de status vira `<select>` nativo com a contagem na opção; os chips coloridos
   ficam no `.fp-so-desktop`.

**`display: contents` é a saída quando a marcação não pode mudar.** Em Edição os chips de
destino ficam dentro do bloco do título, o que empurrava as ações para uma terceira linha.
Aplicar `display: contents` no bloco do título e em `.edit-actions` promove título, chips,
status e "…" a filhos diretos do flex do cabeçalho — daí `order` e `flex-basis: 100%`
montam as duas linhas. Mexer no HTML resolveria também, mas mudaria o computador.

### Tabela → lista de cards, sem duplicar marcação

Solicitações é a referência (`#reqTable`, bloco no fim do `<style>`). Em ≤900px o `<tr>`
vira `display: flex`, o `<thead>` sai e cada `<td>` recebe `order` + `flex-basis` — uma
fonte de dados só, dois layouts. Três detalhes que não são óbvios:

1. **`data-rotulo` no `<td>`** e `::before { content: attr(data-rotulo) }` só dentro do
   `@media`. Sem cabeçalho, duas datas na mesma célula-card ficam sem contexto.
2. **Título com base percentual** (`flex: 1 1 50%`), nunca `auto`: com `auto`, nome
   comprido empurra status e "…" para a linha seguinte e o "…" fica solto no meio do card.
   O status leva `margin-left: auto` para colar os dois à direita.
3. **A regra genérica de 900px esconde `:nth-child(4)` e `(5)` de qualquer tabela.** Se a
   sua tela precisa dessas colunas, devolva explicitamente (`#suaTabela td:nth-child(4)
   { display: block }`).

Quando os chips não caberem numa linha, vire `<select>` nativo com a contagem na opção
(`.fp-lista-select`) e **leve a ordenação junto** — com o `<thead>` oculto, ordenar deixa
de existir no celular.

**Antes de escrever a regra de celular, veja onde a classe base está declarada.** Boa
parte do CSS de módulo (as `.fp-clip-*`, por exemplo) fica **depois** dos blocos `@media`
no arquivo — com a mesma especificidade, a declaração de baixo vence e a regra de celular
não pega nada. Escopar com o id da tela (`#view-clips .fp-clip-prod`) resolve os dois
problemas de uma vez: ganha a especificidade e isola telas que compartilham a classe.

> Grid de duas colunas iguais é a armadilha: espremia "BMW R 1300 GS 2026 (0000000)" em
> quatro linhas enquanto "13/08/2026" sobrava espaço ao lado.

### Ergonomia automática

Um observador aplica, em tudo que é injetado no DOM:

- `aria-label` + `title` a partir de `data-tip`
- rótulo ligado ao campo (`<label>` irmão sem `for`, ou o `placeholder`)
- `loading=lazy` + `alt` nas imagens
- `data-fp-cols` em grids com `style` inline
- envolve toda `<table>` num `.fp-tabela-rola`

**Não crie seletor do tipo `[style*="1fr 340px"]`** — quebra sem erro se um espaço mudar
no JS. Use o marcador `data-fp-cols`, que colapsa de forma adaptativa (`minmax`), não
sempre para uma coluna.

> **Toda verificação olha também a raiz, não só descendentes.** Quando o nó inserido *é*
> o alvo — a tabela, o botão, a imagem — `querySelectorAll` não o encontra. Isso acontece
> sempre que um `innerHTML` monta os elementos no topo, como o rodapé do modal de
> detalhes. Use o helper `coletar(raiz, seletor)`; foi essa falta que deixou quatro botões
> sem `aria-label` mesmo depois da auditoria ter zerado a conta.

---

## Rede

`window.fetch` é interceptado: deduplicação de GETs idênticos em voo + cache de 20s para
leituras do Supabase. Qualquer escrita limpa o cache inteiro (`fpLimparCacheRede()`
força). Motivo: `mc_admin_users` era buscada 25× em 2 minutos, com pico de 3,9s.

Use `.maybeSingle()` quando a linha **pode não existir** — `.single()` devolve 406
(PGRST116) e suja o console.

---

## O painel não usa Supabase Auth — RLS tem que liberar `anon`

O login é `select` em `mc_admin_users` comparando hash de senha, e o cliente Supabase
segue **anônimo** para sempre. Consequências, as duas já cobraram tempo:

1. **Tabela nova com política só para `authenticated` bloqueia o painel inteiro** — o erro
   é `new row violates row-level security policy`. Toda tabela do painel libera
   `anon, authenticated`.
2. **Edge function não pode se apoiar em `role = 'authenticated'`** (rejeita todo mundo)
   nem no `verify_jwt` sozinho (a anon key é pública no `config.js`, então libera todo
   mundo). O que funciona: o painel manda o id de `fp_session` e a function confere em
   `mc_admin_users` usando `SUPABASE_SERVICE_ROLE_KEY`. Ver `magis5-proxy`.

> O consertado de verdade seria migrar o painel para Supabase Auth — daí RLS por usuário e
> papel passa a valer de graça. É projeto à parte, não remendo de tabela.

---

## Dois `<body>` no admin.html

Além do body real, existe o do **modelo de etiqueta de transporte**, que é um documento
HTML completo dentro de uma template string (para abrir em janela de impressão). Script que
procura `<body>` ou o último `</style>` pode acertar o errado — foi o que aconteceu com a
classe `fp-sem-sessao`. Confira qual dos dois foi alterado antes de commitar.

---

## Landing pública: dado de cliente só por view mascarada

A landing (`index.html`) nunca dá `select` em `mc_requests` — o anon só tem permissão de
`insert`. Para mostrar dado de agendamento em público existe a view
**`mc_public_gravacoes`**, que devolve três colunas (`date`, `moto`, `nome_publico`) e
mascara o sobrenome **no banco**, com um `*` por letra. Precisar de outro campo público?
Nova view com o mínimo, nunca abrir a tabela.

A tag ao vivo do topo (`#fpLiveTag`, marca `.fp-live`) tem três estados: `.fp-live-on`
(gravando hoje, com `REC` e glow), `.fp-live-off` (próxima/última, sem alarme) e
`.fp-live-vazio` (sem dado ou rede caída — volta a ser a pílula discreta). Texto sempre
por `textContent`; os asteriscos vão num `<span class="fp-live-mask">`.

---

## Alinhamento — regra do dono

> *"a tag pendente não está alinhada com o header STATUS. Corrija isso e salve como uma
> instrução nesse chat nunca deixar desalinhamentos como esse ocorrer novamente"*

**Rótulo e valor na mesma fileira ficam centrados entre si**, nunca alinhados pelo topo.

```css
.detail-row { align-items: center; }
.detail-row.fp-det-largo { align-items: start; }   /* valor de várias linhas */
```

Alinhar pelo topo só funciona quando os dois lados são texto puro do mesmo tamanho.
Qualquer valor em **badge, pílula, seletor ou botão** tem padding próprio e desce em
relação ao rótulo — foi assim que a etiqueta PENDENTE ficou 3,5px abaixo de STATUS.
A exceção é a fileira cujo valor pode ter várias linhas: ali o rótulo fica no topo, senão
flutua no meio do parágrafo.

**Conferir medindo, não olhando.** Compare o centro da caixa da pílula com o centro do
*texto* do rótulo — `Range.getClientRects()`, não o `getBoundingClientRect()` do elemento
inteiro, que inclui o padding e esconde o erro. Tolerância: **2px**.

Depois de corrigir um caso, **varra as outras telas** atrás do mesmo padrão. A varredura
de 19/08 percorreu as 17 telas medindo toda `.badge`, `.proj-dest-tag` e
`.proj-status-select` contra os irmãos da mesma fileira: zero desalinhamentos restantes.

---

## Cor, tipo e texto

- **Badge é sempre um par de tokens por tema** (`--tx-*` / `--bg-*`), nunca texto
  colorido sobre alfa da própria cor: isso funciona no escuro e dá 2:1 no claro
- Piso de fonte **11px**
- Todo input a **16px** no celular — abaixo disso o iOS dá zoom sozinho ao focar
- `--perigo` é o vermelho de ação destrutiva, **separado** do vermelho da marca (que
  também é cor de menu ativo)
- Contraste medido ao final: **0 reprovados WCAG AA nos dois temas**
- Textos em português, com acento. Nada de *goal*, *pool*, *pace* na interface

## Commits

Mensagem em português, explicando **o porquê** e não só o quê. Terminar com:

```
Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```
