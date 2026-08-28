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

### Listagem é tabela: `.fp-lista` — e é a página inteira

O padrão das listagens é o **conjunto** da tela de Solicitações, não só a tabela:

1. **Métricas em cima** — `.stats-grid` com `.stat-card` (rótulo miúdo, número grande,
   sem caixa). Leem o **universo inteiro**, nunca a aba aberta: em Solicitações o "Total"
   não muda ao clicar em "Pendentes".
2. **Barra de abas** — `.filter-bar` com `.filter-btn` (texto neutro, sublinhado vermelho
   na ativa, contagem em `.fp-conta`), campo `.fp-busca` e `.fp-lista-contagem` à direita,
   tudo sobre um fio que atravessa a linha. Uma escolha por vez.
3. **A tabela dentro de `<div class="table-wrap fp-lista-wrap">`** — cartão com fio,
   canto de 14px e **cabeçalho cinza que gruda no topo** ao rolar.
4. **Status em pílula**, ações em ícone na última coluna.

> Erro cometido em 27/08/2026, e o dono viu na hora: adotei só a tabela e nem ela por
> inteiro. Fora do `.table-wrap`, o `<th>` pega `--bg-soft` em vez de `--bg-elev` — no tema
> claro isso é **branco**, ou seja, o cabeçalho perde a faixa cinza e deixa de grudar.
> Somado a status em `<select>` com borda e seta, chips coloridos na barra de filtro e
> nenhuma métrica, o resultado era *parecido* com a referência e diferente dela em tudo o
> que se vê primeiro. **Comparar medindo, não de memória**: `getComputedStyle` das duas
> telas lado a lado mostrou os sete deltas em um minuto.

Regras que já custaram defeito:

- **Sem recuo próprio: vale o padrão `14px 16px` de `th, td`.** A primeira versão trocou
  por 12px com zero nas pontas para caber sete colunas — foi raspar pixel para não mexer
  no conteúdo, e custou a faixa do cabeçalho. Largura que falta se ganha **tirando tralha
  da linha**, não do recuo.
- **Nenhuma célula quebra em três linhas.** Uma linha de 79px no meio de linhas de 63px
  acaba com a cadência que faz a varredura funcionar. Título e nome de moto cortam com
  reticências (`.fp-1l`), com o texto inteiro em `data-tip`; a observação vira uma linha
  só (`.fp-sub-1l`). Placa e telefone vão para a `.sub`, nunca entre parênteses no meio
  da frase.
- **A coluna de ações gruda na direita** (`position: sticky; right: 0`), com fundo próprio
  e o do hover. A largura útil muda quando o dono recolhe a barra lateral: medido a 1280px,
  1146 com a barra recolhida e **954 com ela aberta**. Sete colunas de projeto pedem 1138 —
  sem a coluna grudada, os botões da linha ficam fora da área visível e só aparecem
  arrastando, que foi o defeito da primeira conversão. Grudar resolve sem raspar recuo nem
  tirar ação da linha. Medido a 954: Agenda cabe em 954, Edição pede 1038, Clips 1057 e
  Projetos 1138 — nos três que rolam, as ações continuam visíveis.
- **Largura de coluna por CLASSE, nunca por `nth-child`** (`.fp-col-tit`, `.fp-col-moto`,
  `.fp-col-prod`). A mesma posição é uma coluna diferente em cada tela.
- **Nada de busca de rede por linha.** Os produtos compatíveis do Bling eram uma chamada
  por projeto a cada re-render, e o bloco mudava a altura da linha quando a resposta
  chegava. Isso mora no resumo, que só abre quando alguém pede.
- **Máximo dois selos de destino na linha**, o resto em "+N": empilhados, três levavam a
  linha de 63px para 109px.
- **Conteúdo longo e painel de interação vão para o detalhe.** O painel de cinco estrelas
  com o botão "avaliar" virou nota compacta na sublinha (`.fp-nota`) — e não um sexto
  ícone de ação, porque cada ícone custa 34px de coluna.
- **Nada de patch que procure o cartão no DOM.** Se a decisão depende do dado (qual modal
  abrir, por exemplo), ela mora no renderizador.

Abaixo de 600px a tabela vira lista de blocos com o rótulo da coluna antes do valor — daí
o `data-rotulo` em cada `<td>`; e `.fp-lista-wrap` perde a moldura no `@media` de 900px.

**Especificidade de classe atravessa `@media`.** Ao pôr as tabelas novas dentro do
`.table-wrap` elas herdaram duas regras de computador que a regra de celular não conseguia
desfazer: `.table-wrap table { min-width: 640px }` (0,1,1) vencia `.fp-lista { min-width: 0 }`
(0,1,0), e `td:last-child { width: 1% }` deixava a célula de ação com 3,5px na linha flex do
celular — com o botão "…" 11px fora da tela. Solicitações escapava dos dois por usar id
(`#reqTable`, 1,0,1). **Regra de celular precisa de especificidade igual ou maior que a de
computador**, senão não pega nada e não dá erro. Medir a 375px, não confiar no `@media`.

**Duas interfaces para o mesmo filtro precisam da mesma regra.** Em Projetos os chips do
computador eram múltipla escolha e o `<select>` do celular era escolha única — a mesma tela
com duas lógicas. As abas unificaram na escolha única, que é a do celular. O filtro de
destino continua múltiplo porque é outro eixo, e mora fora da barra.

**Onde guardar o estado da ordem:** se a tela já tem um `<select>` de ordem (Projetos), o
clique no cabeçalho **escreve nesse select** — `FP_PROJ_ORD` + `fpProjOrdenar`. Duas fontes
de ordem discordam na primeira troca. Sem select próprio (Edição, Clips, Agenda), o estado
é `FP_ORD[tela]` + `fpThOrd`/`fpOrdAplicar`/`fpOrdTrocar`.

**Status ordena pela etapa do fluxo, não pelo alfabeto:** "A publicar" vem depois de
"Edição" no trabalho e antes no dicionário (`FP_PROJ_ETAPA`).

Telas no formato: Solicitações (referência), Projetos, Edição, Clips e Agenda.

---

### Prancheta animada: `.fp-bp`

O fundo da tela de entrada e da barra lateral virou componente para caber em caixa —
usado no cartão de nota média do Debriefing (27/08/2026, a pedido do dono).

```html
<div class="fp-bp" aria-hidden="true">
  <div class="fp-bp-grade"></div>
  <svg class="fp-bp-tec" viewBox="0 0 900 160" preserveAspectRatio="xMidYMid slice">…</svg>
  <div class="fp-bp-b fp-bp-b1"></div>
  <div class="fp-bp-b fp-bp-b2"></div>
</div>
```

O container precisa de `position: relative`, `overflow: hidden` e **`isolation: isolate`**,
e o conteúdo precisa subir (`> *:not(.fp-bp) { position: relative; z-index: 1 }`): filho
estático perde para camada posicionada.

Três coisas que não se copiam do login:

- **Escala da malha.** 16px/64px, não 24px/120px — na altura de uma caixa, a do login
  daria duas linhas e meia.
- **Peso.** Sobre o branco de `--bg-card` os valores do login viram papel milimetrado de
  verdade e competem com o número. Valem o que valem na barra lateral: um terço.
- **O traçado técnico é desenhado para o formato** (900×160). O do login (1440×900) entra
  cortado. E quadro com X é gráfico demais para um fundo: mira, arcos e cotas bastam.

Os períodos dos brilhos (19s e 27s) **não têm divisor comum** — é o que impede o fundo de
repetir o mesmo quadro. E período curto é o que faz parecer vivo: a primeira versão do
login rodava em 40s/52s, ≈1vw por segundo, e o dono perguntou se a animação tinha ficado
pronta.

### Por que o ícone é inline e não um arquivo referenciado

Pergunta que apareceu quando o upload deu errado três vezes seguidas: *"não tem como
só indexar o svg ali?"*. A resposta é não, e vale registrar o porquê.

Com `<img src="icone.svg">` o navegador desenha o arquivo **isolado**: nenhuma CSS da
página entra. Isso resolveria os conflitos — e quebraria o que importa mais:

- **O ícone deixa de seguir o tema.** Os 21 da barra lateral herdam a cor do menu e
  ficam vermelhos quando o item está ativo. Ícone preto num arquivo isolado some no
  tema escuro.
- **`<use href="externo.svg#id">` não é opção**: navegador nenhum resolve referência
  externa em `use` sem polyfill.
- Custa armazenamento de arquivo e um pedido HTTP por ícone.

Inline mantém `currentColor` funcionando, que é o que liga o ícone ao tema. O preço é
ter de blindar contra a CSS da própria página — resolvido com
`svg[data-ico-estado^="c"]`, e documentado no diário.

### Trocar ícone e cor é do dono, não do código

Dois painéis em Manutenção fazem isso: `mc_theme_colors` (cores) e `mc_icons`
(ícones). A regra que os dois seguem: **preferência visual da casa mora no servidor
e é editável pelo dono**, porque cada troca dessas passando por código é um pedido,
um deploy e uma espera. Só numa tarde foram onze trocas de ícone, uma a uma.

Ao acrescentar um ícone ao catálogo (`FP_ICO_GRUPOS`), escolha o gancho:

- **seletor** quando o ícone tem endereço estável no HTML (barra lateral, botão fixo);
- **assinatura do desenho** quando ele é string montada dentro de um render. A
  assinatura troca todas as aparições de uma vez — `acao-ver` são 171 lugares.

Duas coisas que não são óbvias:

1. **Assinatura tem de passar pelo mesmo serializador das duas pontas.** O navegador
   expande `<path .../>` para `<path ...></path>` no `innerHTML`; comparar com a string
   escrita à mão nunca casa, e não dá erro.
2. **SVG enviado é conteúdo executável.** Higienize antes de guardar: fora `script`,
   `foreignObject`, `image`, `use`, `animate`, todo `on*` e todo `href`. E transfira os
   atributos de traço do `<svg>` de origem para um `<g>`, senão o desenho perde o stroke
   ao ser guardado sem a raiz.

---

### Quando a caixa É permitida

"Fios, não caixas" vale para **linha de listagem** e para container em volta de lista. Não
vale para **painel de consulta**: a moldura da tabela (`.table-wrap`) sempre teve fundo,
fio e canto de 14px, e em 27/08/2026 o dono pediu o mesmo para o calendário e o detalhe do
dia — *"quero que esses dois sejam com fundo branco e dentro de um container assim como tá
a listagem de solicitações"*. Aplicar a regra ali foi o mesmo erro de tirar o `.table-wrap`
da tabela: princípio verdadeiro, lugar errado.

Quando puser dois painéis lado a lado, **iguale a altura** (`align-items: stretch`) e
centre o conteúdo curto. 397px e 178px lado a lado leem como tela inacabada — em faixa com
fio a diferença não aparecia, em caixa aparece.

E cuidado com o que decide a simetria: no Dashboard de foto as duas colunas já tinham
255px, mas o **retângulo visível** da galeria terminava 15px acima do fim da fila porque os
pontos do carrossel ficam fora do palco. O olho compara as bordas visíveis, não as caixas.

---

### Listagem: fios, não caixas

Pedido explícito do dono, em duas etapas (25/08/2026). Primeiro tirou a caixa de cada
item; depois tirou também o container em volta da lista:

> *"sem esses containers e blocos parecendo muito site de ia. Quero uma estética mais
> moderna baseada em dividers"* · *"quero que a listagem fique diretamente no fundo do
> site, sem containers"*

**A regra:** linha de listagem **não tem moldura própria** — nem borda, nem fundo, nem
canto arredondado. A lista também **não fica dentro de um container**. As linhas ficam
direto sobre o fundo da tela, separadas por um fio de 1px:

```css
.minha-lista > * + * { border-top: 1px solid var(--border); }
.minha-lista-linha { display: flex; align-items: center; gap: 12px; padding: 12px 10px; }
.minha-lista-linha:hover { background: rgba(255,255,255,.03); }
[data-theme="light"] .minha-lista-linha:hover { background: rgba(0,0,0,.022); }
```

Cabeçalho de bloco no meio da lista é **rótulo solto** (11–12px, maiúsculas, `letter-spacing`
de .1em, cor `--text-muted`), sem faixa de fundo. Referência viva: `.fp-prod` / `.fp-prod-linha`
/ `.fp-prod-faixa` (seção Fotografia) e `.fp-aviso-corpo` (aviso de entrada).

Caixa dentro de caixa é o que mais entrega interface montada por template. O `.stat-card`
do topo das telas continua valendo — é cartão de número, não item de lista.

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

**As extremidades laterais da página são uma só.** Cabeçalho, filtros, listagem, rodapé e
barra de seleção compartilham a mesma margem lateral — o olho lê a coluna invisível das
duas bordas e qualquer elemento que "quase" chega nela parece defeito. Valor que precisa
encostar na direita (contagem, prioridade, badge) vai até a margem, não até 6px antes dela.
Coluna cuja largura depende do texto se mede sozinha (`Range.getClientRects()` no rótulo
mais comprido em tela, com piso) em vez de largura fixa chutada.

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

## Um canal visual por informação

O quadradinho do calendário carrega três informações e cada uma tem o SEU canal:

| canal | informação |
|---|---|
| `background` | estado — verde aprovado, vermelho bloqueado, cinza livre |
| `border-color` | seleção |
| `box-shadow` externo | o ponteiro está aqui |

As três podem valer ao mesmo tempo, e valem: um dia aprovado, selecionado e sob
o mouse mostra as três de uma vez. Toda vez que dois estados dividiram o mesmo
canal aqui, um apagou o outro — a seleção pintava o fundo e escondia o "aprovado";
o hover trocava a borda e o dia aprovado ficava com a borda de bloqueado.

Antes de pintar um estado novo, veja qual canal ainda está livre.

---

## Hover não mexe em cor que significa alguma coisa

No calendário da Agenda o `background` e o `border-color` de cada dia dizem o
estado dele: verde é aprovado, vermelho é bloqueado, azul é o selecionado. A
regra de hover trocava a borda para `--primary` — então um dia aprovado ficava
com a borda de bloqueado enquanto o ponteiro estivesse em cima.

Onde a cor carrega significado, o retorno do ponteiro é **contorno**, não troca
de cor: `box-shadow: 0 0 0 2px var(--contorno)`, com `--contorno` derivado da cor
do texto e portanto neutro. Cor própria no contorno voltaria a dizer algo sobre o
estado.

Duas armadilhas na implementação:

- **`box-shadow` não se acumula entre regras.** A regra que vence substitui a
  outra inteira. Um elemento que já usa `box-shadow` para um anel próprio precisa
  repeti-lo dentro da regra de hover, senão o anel some justamente no hover.
- **Contorno por `box-shadow`, não por `outline`.** O `outline` é do anel de foco
  de teclado (`button:focus-visible`), e as duas coisas precisam poder aparecer
  ao mesmo tempo.

---

## Medir cor depois de trocar de tema: espere a transição

Vários componentes têm `transition: all .15s` (`.cal-day`, entre outros). Trocar
`data-theme` e ler `getComputedStyle` na mesma avaliação devolve a cor **do
quadro intermediário** — e uma captura de tela tirada nesse instante mostra a
mesma mentira. Medi 1,14:1 num elemento que tem 13,73:1.

`void el.offsetHeight` força layout, **não** conclui transição. Espere ~200ms, ou
meça um tema por avaliação.

E antes de investigar qualquer coisa no navegador local: confira se o servidor
está de pé. Com ele fora do ar, o `sw.js` (rede primeiro, cache como rede de
segurança) serve a última cópia boa — e a página fica mostrando uma versão
antiga do arquivo enquanto você procura um erro que não existe:

```js
fetch('/admin.html', {cache:'no-store'}).then(r=>r.text()).then(t=>t.length)
```

---

## Renomear classe: procure o NOME, não o seletor montado

Renomeei `.fp-new-btn.ghost` para `.vermelho` e procurei por `fp-new-btn ghost` e
`.fp-new-btn.ghost`. Passou reto por esta, no registro do painel de ícones:

```js
sel: '.fp-new-btn:not(.ghost) > svg'
```

Com a classe extinta o seletor passou a casar com os DOIS botões do topo da
Agenda, e o painel de ícones — que guarda como desenho de fábrica o primeiro
elemento em ordem de documento — pintou o "+" com o símbolo de bloquear.

```bash
grep -n "ghost" admin.html      # o NOME, sem ponto e sem seletor em volta
```

E a lição de desenho por trás: **seletor definido pela ausência de outra classe
é frágil**. `:not(.ghost)` só funciona enquanto `.ghost` existir. Dois irmãos que
precisam ser distinguidos merecem cada um o próprio seletor positivo.

Isto vale em dobro para o registro do painel de ícones (`FP_ICO_ITENS`): ele
casa por seletor E por assinatura de SVG, roda depois do render e troca innerHTML
— então um seletor errado ali não dá erro nenhum, só desenha a coisa errada.

---

## O botão "novo" é só o glifo — em nove telas

`.fp-new-btn` não tem caixa, fundo nem borda: é o **+ em azul** (`--novo-azul`),
e a variante `.vermelho` é o ícone em `--primary`. O alvo de clique continua com
42px (44px no celular) — o que sumiu foi o fundo, não o alvo. Botão novo herda
tudo disso; não recrie um quadrado preenchido.

O retorno do ponteiro é a **cor esmaecendo** (`opacity`), nunca um fundo no
hover: fundo no hover devolve a caixa que foi tirada.

Duas armadilhas que a retirada da caixa expôs, e que valem para o próximo:

- **O glifo tem que ser SVG.** O botão de Atualizações usava um `+` de texto;
  dentro do quadrado azul passava, sem o fundo saía com o tamanho da fonte do
  corpo, menor que os outros oito.
- **Ícone de área maior vai menor.** O círculo cortado de "bloquear data" ocupa
  mais área que o "+" com o mesmo lado; vai 4px menor para os dois pesarem igual
  ao olho.

---

## Seta ao lado de um título de duas linhas se alinha à LINHA, não ao bloco

No cabeçalho do calendário o ano fica em cima e o mês embaixo. Pôr as setas ao
lado do bloco inteiro (ano + mês) deixou-as **6,2px fora do eixo do nome do
mês** — flutuando entre as duas linhas, sem pertencer a nenhuma.

A estrutura certa é o bloco em coluna e a fileira `seta — palavra — seta` como
uma linha própria: aí o `align-items: center` da fileira resolve sozinho.

E a seta fica na **ponta**, não colada na palavra: colada, ela muda de lugar a
cada troca de mês (MARÇO contra SETEMBRO) e o alvo de clique pula pela tela.

---

## Logotipo de terceiro: quando embutir o arquivo, quando desenhar

Vale para as marcas das plataformas (`FP_DEST_ARTE`, a fonte única).

**Desenhe em SVG** quando a marca for simples (YouTube: retângulo + triângulo)
ou quando alguma parte dela precisar **seguir o tema**. O corpo da nota do
TikTok é preto na marca oficial e some no fundo escuro; só SVG resolve, porque
arquivo de imagem chega com a cor cozida dentro.

**Embuta o arquivo real, em 64px e data URI**, quando a marca tiver gradiente
ou desenho complicado — Instagram, Mercado Livre, Google Ads. Redesenhá-la à
mão é errar a marca de alguém, e ninguém revisa isso. 64px dá 3× de folga para
os 20px em que aparece; os quatro somam 28 KB e não custam requisição.

**Nunca aponte para o arquivo original.** O `Instagram.png` deste repositório
tem 5001×5001 e 1,3 MB, e era baixado inteiro para desenhar 14 pixels.

**Teste no fundo escuro antes de escolher o arquivo.** PNG de linha com halo
claro (o globo "www") vira um bloco branco no tema escuro — não aparece em
nenhuma inspeção de código, só olhando.

**Uma fonte só.** Havia três mapas de logotipo para as mesmas sete marcas.
Antes de criar o quarto, veja `FP_DEST_ARTE` — a regra de procurar o nome antes
de criar vale para dado, não só para função e classe.

---

## Caixa do tamanho do ícone dentro de linha de texto pede `line-height: 0`

`.fp-dest-lg` e `.fp-prod-selo-kit` são caixas com a altura exata do desenho.
Sem `line-height: 0` a entrelinha do texto ao redor empurra a caixa alguns
pixels para baixo, e ela fica fora do eixo do que está ao lado. Não dá erro e
não aparece lendo o código — só medindo os `cy` dos irmãos.

---

## "Apagado" é um número, e o número se mede

Elemento secundário com `opacity` reduzida é pedido recorrente do dono ("com opacidade
reduzida"). O que **não** pode é o texto dentro dele deixar de ser legível: contagem,
rótulo e valor são informação e valem AA (4,5:1), mesmo apagados.

A conta é a cor MISTURADA com o fundo, não a cor declarada:

```
efetiva = cor × opacidade + fundo × (1 − opacidade)
```

Medido no balão de comentário da Produção, nos dois temas:

| cor base | opacidade | claro | escuro |
|---|---|---|---|
| `--text-dim` | 50% | 2,33:1 ✗ | 2,71:1 ✗ |
| `--text-dim` | 80% | 4,83:1 ✓ | 4,93:1 ✓ (mas já não parece apagado) |
| `--text` | **62%** | **4,74:1 ✓** | **7,21:1 ✓** |

A saída é **cor mais forte com opacidade menor**, não o contrário: fica mais apagado aos
olhos e mais legível na medida. Opacidade de ancestral multiplica — some `opacity` de
todos os pais antes de concluir.

---

## Drive: dois endereços para o mesmo arquivo

`?action=img&sku=X` e `?action=arquivo&id=Y` devolvem **o mesmo JPEG**, mas são URLs
diferentes — então o cache do navegador não vale entre as duas. A miniatura da listagem
usa a primeira; a tira do visor usa a segunda.

Quem quiser prévia instantânea tem que reusar **exatamente** a url que já foi baixada
(`fpDriveImgUrl(sku, false)`). Foi essa troca que fez o visor da Galeria abrir em 2ms em
vez de esperar a rede.

Ordem de carregamento que funciona, no visor: prévia em cache → leitura da pasta → foto
grande da posição atual, sozinha → tira de miniaturas → adiantamento das seguintes, **em
série**. Desenhar a tira antes dispara 12 pedidos ao mesmo tempo e a foto que o operador
quer ver fica atrás deles na fila.

---

## Filtrar antes de mostrar — o menu não nasce errado

> *"de modo algum isso pode aparecer pra ele, nem por meio segundo que seja"*

Permissão aplicada depois de o painel aparecer é **vazamento**, não atraso de interface.
Quem revela o painel é **`fpRevelarPainel()`**, e ela faz nesta ordem:

1. filtra o menu (`applyRolePermissions()`, que já embute os módulos por usuário e o nome
   das seções) — com `#app` ainda em `display:none`;
2. marca `document.body` com `fp-menu-filtrado`;
3. só então mostra o painel.

As duas camadas de permissão dependem **apenas de `CURRENT_USER`**, que existe desde o
login. Nada ali precisa de dado carregado — então não há motivo para esperar o `initApp()`.

Filtrar e revelar na **mesma tarefa síncrona** é o que dá a garantia: o navegador não pinta
no meio de uma função. Por cima disso, `.sidebar-nav` nasce `visibility:hidden` e só abre
com a classe — se a filtragem estourar, o menu não aparece em vez de aparecer inteiro. O
**rodapé do menu fica fora da trava**: num painel quebrado, Sair tem que continuar
clicável.

**Consequência:** `applyRolePermissions()` roda **duas vezes por sessão**. Tudo que ela
insere no DOM precisa ser idempotente — remover o anterior por id/atributo antes de criar
(foi o caso do aviso de "somente leitura", que duplicava).

Tela nova que apareça antes da permissão? Mesmo caminho: esconder por padrão, revelar
depois de decidir.

---

## `modules` em branco bloqueia quem não é administrador

`mc_admin_users.modules` é a segunda camada de permissão, cruzada com o papel:

- **Administrador:** `fpAllowedSet()` devolve `null` — vê tudo, `modules` é ignorado.
- **Qualquer outro papel com `modules` nulo ou `[]`:** sobra só `FP_ALWAYS_ON`
  (`profile`, `project-detail`). O operador entra e **não vê nada**.

Papel novo criado no banco sem preencher `modules` nasce, portanto, mudo. Já aconteceu
duas vezes (Fotógrafo e Assistente Admin.). Ao criar papel ou operador, preencher os
módulos no mesmo movimento.

**Papel se testa por conteúdo, e a ordem dos testes importa.** `getUserRole()` compara
`role` em minúsculas com `includes` — e "Assistente Admin." **contém** *admin*. O teste de
`assistente` vem **antes** do de administrador; inverter a ordem promove o assistente a
administrador.

**Registrar uma tela nova custa sete listas.** Três arrays legados de "esconder tudo",
`FP_ALL_VIEWS`, `FP_NAV_ORDER`, `ALL_VIEWS` e `FP_MODULE_GROUPS` — mais o mapa `access`, o
`refreshViewData` e o `initApp`. Esquecer uma dá tela que abre mas não some, ou módulo que
não aparece na tela de permissões.

---

## Antes de criar função ou classe, procure o nome

O `admin.html` tem 22 mil linhas e três gerações de código empilhadas. Nome repetido não
dá erro: **o último vence, calado**.

Dois casos no mesmo dia:

- `fpProdBuscar` já era a busca de kit do Magis5. A busca da Fotografia passou a chamar a
  função do Magis5, que procura um elemento inexistente e **retorna sem console.error**.
  Sintoma: campo de busca que não faz absolutamente nada.
- `.fp-busca` já era o componente de busca de Solicitações. Minhas regras estavam antes no
  arquivo e perdiam para as antigas — estilo aplicado "pela metade", sem aviso nenhum.

E um terceiro, em 27/08, com o agravante de a regra já estar escrita aqui: `.fp-prod-kit`
é do montador de kit do Magis5 (`display:flex` + `margin-top:8px`). A regra nova vinha
DEPOIS no arquivo e ganhou no que declarava, mas **herdou a margem**: o selo "KIT" da
listagem de Produção desceu 4px em relação ao nome do produto. Não dá erro, não dá aviso,
e só aparece medindo — os outros dois filhos da linha centravam em 663,6 e ele em 667,6.
Virou `.fp-prod-selo-kit`.

Perder para uma regra que vem DEPOIS é o caso óbvio. O caso traiçoeiro é este: ganhar a
disputa e ainda assim herdar tudo o que a sua regra não declarou.

```bash
grep -n "function fpMinhaFuncao\|\.minha-classe\b" admin.html
```

Classe que já existe: **reescreva o componente existente** para os dois usos, não crie um
paralelo. E ao reescrever SVG inline, confira `fill="none"` e `stroke="currentColor"` —
foi assim que a lupa virou um borrão preto sobre preto.

---

## Tipografia: FullPro Sans e nada mais

Uma família no site inteiro (`assets/fonts/`, pesos 200–950 + itálicos). Varia **peso e
tamanho**, nunca a família. Não há Google Fonts em nenhuma das duas páginas.

- **`src` de `@font-face` sempre com caminho absoluto** — `url('/assets/fonts/…')`. O
  painel é servido em `/admin` e o caminho relativo vira `/admin/assets/…`: 404 silencioso,
  fallback assumindo, nenhuma pista no console.
- **Caixa alta é declarada, não herdada da fonte.** As regras que eram Bebas Neue (fonte
  sem minúsculas) carregam `text-transform: uppercase` + `font-weight: 800` explícitos.
  Trocar de família sem isso revela caixa mista onde sempre se leu caixa alta.

---

## Tela que espera dado abre com a forma, não com o vazio

Regra do dono: **nada de área em branco enquanto a rede responde.** A tela pinta a
estrutura na hora e põe `.fp-skel-txt` — a variante em linha do esqueleto — no
lugar exato de cada número que falta. Quando o dado chega, a barra vira o número
**sem mexer no layout**: o esqueleto tem que ocupar o mesmo espaço do conteúdo
final, senão a página salta.

Duas passadas na mesma função de render: a primeira é **síncrona**, antes do
primeiro `await`, e só acontece se a tela estiver vazia — repintar depois de uma
ação (clique de prioridade) não pode piscar a tela inteira. Um contador de
versão (`_panoramaVez`) descarta a passada de quem chegou atrasado.

**Contar é trabalho do banco.** O panorama baixava 2.566 linhas em três páginas
para contar quantas tinham foto: 1,7s. Uma função SQL (`mc_photo_panorama`) faz as
contagens, o top 8 e as listas curtas numa ida só — 0,2s. Antes de trocar, cada
número foi conferido contra o que a tela mostrava.

**Ordem importa mais do que paralelismo.** Disparar o catálogo junto com a
consulta do painel parecia mais rápido e era pior: as três páginas dividem banda
e empurraram o número que o operador espera de 0,3s para 1,6s. O que ninguém está
esperando vai **depois** da pintura.

**`.fp-skel-txt` usa o tom da borda** (`--border` → `--border-hi`), não o do
cartão: dentro de um `.stat-card` o cinza do fundo é invisível. E entra na
exceção de `prefers-reduced-motion`.

---

## Toda tela que roda em `applyRolePermissions` roda duas vezes

Já está dito na seção do filtro, mas o custo aparece aqui: `fpDashAplicar` é
chamada nas duas passadas, e sem guarda ela reconstruía o painel de fotos inteiro
duas vezes por login — consulta, `innerHTML` e miniaturas do Drive.

O padrão que resolve é distinguir **aplicação automática** de **ação do
operador**. `fpDashTrocar(frente, gravar)` usa `gravar === false` como marca da
aplicação automática: nesse caso só pinta se a tela estiver vazia; no clique,
sempre atualiza.

E o simétrico, que passou batido na primeira versão: se o carregamento passa a
ser **por frente**, trocar de frente tem que carregar. `refreshViewData` só roda
ao navegar, e **trocar de aba não é navegar** — sem isso o painel de vídeo
congelava na hora do login.

---

## `.action-btn` é a classe de botão — `.btn` não existe

`.btn`, `.btn primary` e `.btn ghost` **não existem no `admin.html`**. Botão com essas
classes nasce sem estilo nenhum: 19px de altura, padding zero, some no rodapé.

O que existe: `.action-btn` (neutro), `.action-btn.approve` (confirmar, verde),
`.action-btn.view` (primário, azul), `.action-btn.reject` (destrutivo, contorno vermelho),
`.action-btn.danger` (destrutivo, preenchido). Declaradas perto do topo do `<style>`.

**Antes de usar uma classe de botão, procure a declaração dela no arquivo.**

---

## Ícone de menu se aprova a 18px

`.nav-item svg` renderiza a **18px com traço 1,8** — e é aí que o ícone tem que
funcionar, não no preview grande. O que decide nesse tamanho é o **vão entre os
traços**, não o desenho: acima de uns 4 traços paralelos vira massa cinza.

Como conferir antes de commitar (roda no console da própria página):

```js
const img = new Image();
img.src = 'data:image/svg+xml;utf8,' + svgComOsPaths;  // width/height 18
await img.decode();
const c = document.createElement('canvas'); c.width = c.height = 18;
c.getContext('2d').drawImage(img, 0, 0, 18, 18);
// depois: drawImage(c, 0, 0, 216, 216) com imageSmoothingEnabled = false
```

Regras que saíram das reprovações:

- **Nada de detalhe menor que 1 unidade** do `viewBox` — some ou vira borrão.
- **Curva orgânica não sobrevive.** Mão, rosto, qualquer contorno com muitas
  inflexões vira rabisco. Troque o desenho pelo conceito: "vídeo de anúncio"
  virou etiqueta + play, que são três traços retos.
- **Um assunto por ícone.** Duas bolhas, ou alvo + flecha, dividem os 18px em
  dois e nenhum dos dois lê. Escolha o que carrega o significado.
- **Simetria quando houver dúvida.** A 18px, assimetria não lê como intenção;
  lê como desalinho.
- **Silhueta única na coluna.** Antes desta rodada havia três relógios e dois
  balões quase iguais — nenhum errado sozinho, e metade da barra igual.

Ícone é sempre traço em `currentColor`, `fill: none`, pontas redondas. **Marca
colorida não entra na barra**: seria o único elemento que não acompanha o tema
nem o estado ativo.

---

## Realce de linha sangra até a borda: `--pad-lado`

O realce da linha da listagem **não é o fundo dela** — é uma faixa
(`::before`) atrás, que sangra o recuo do `<main>` para os dois lados e
encosta na borda da tela. O conteúdo continua alinhado com o resto da página;
só a marca de "estou aqui" vai até o fim, que é onde o olho corre.

A sangria tem de ser **exatamente** o recuo lateral, e ele muda em quatro
pontos de corte — por isso `--pad-lado` é token e `main` o usa. Ao mexer no
recuo de `main`, mexa no token.

Duas coisas obrigatórias:

- **`.fp-prod-linha > * { position: relative; z-index: 1 }`** — sem isso o
  conteúdo da linha fica debaixo da faixa.
- **Cancelar a sangria onde a listagem não ocupa a largura da página**
  (`.fp-dash-duo`, no Dashboard): lá ela invadiria a coluna vizinha.

`main` já tem `overflow-x: hidden`, então a sangria é cortada ali e não inventa
rolagem horizontal.

---

## Tokens de espaço: `--pad-topo` e `--fp-col-gap`

O recuo do topo da página e o vão entre colunas de métrica saem de token, não de
número solto. Quem gruda no topo (a barra de ações em massa) **tem que derivar do
mesmo token** — o `top` negativo dela é a contrapartida exata do recuo.

**Armadilha de cascata, já paga:** `.fp-lote-slot { top: -40px }` escrito dentro
de `@media (min-width: 1600px)` perde para a regra base se a base vier **depois**
no arquivo. Media query não ganha especificidade; ganha ordem. Sobraram 8px de
listagem aparecendo acima da barra.

---

## Cor nova não se converte por script — se escolhe na Manutenção

Manutenção → Cores do painel tem os 33 tokens de cor, por tema, com seletor e
campo de hex. Se o dono quiser outra cor, ele troca ali; não escrever conversor
de paleta.

Ao acrescentar um token de cor ao CSS, acrescente também o verbete em
`FP_CORES_GRUPOS` (nome, onde aparece, e `contra` quando houver par de
contraste) e o valor de fábrica em `FP_CORES_PADRAO` — nos dois temas.

---

## Dica no hover: `data-tip`, não `aria-label`

`aria-label` dá **nome acessível**; não gera `title` e não aparece no hover. O
observador de ergonomia lê `data-tip` e escreve os dois de uma vez — então todo
controle que precise de explicação leva `data-tip`, e só ele.

Como conferir uma tela inteira:

```js
[...document.querySelectorAll('#view-x button, #view-x label[for], #view-x a[href]')]
  .filter(e => e.offsetParent !== null && !e.getAttribute('title'))
```

---

## Anel de foco: `[tabindex="0"]`, nunca `[tabindex]`

O seletor largo pega também os `tabindex="-1"`, que existem para receber foco
**por programa** — o `<main>` do "pular para o conteúdo" é um deles. Pior: um
seletor de atributo (0,2,0) ganha de `main:focus-visible` (0,1,1), então a regra
que deveria apagar o anel do main nunca valia, e ele contornava a área de
conteúdo inteira.

Anel só onde o Tab chega. Foco programático não desenha nada.

---

## Sticky não avisa quando gruda — use uma sentinela

Comparar o topo do elemento com o `top` da regra **não funciona**: medido, um
slot com `top: calc(-1 * var(--pad-topo))` para em 0, não nos −32px pedidos.
Quem manda no ponto de parada é a caixa que o contém, não só a propriedade.

O que funciona é uma marca de altura zero imediatamente acima, que continua
rolando normalmente:

```js
grudou = sentinela.getBoundingClientRect().top < alvo.getBoundingClientRect().top - 1;
```

Vale para sombra, borda, qualquer coisa que só deva existir no estado grudado.
E lembre: **quem rola é o `<main>`**, não a janela.

---

## Camada decorativa atrás de conteúdo pede `isolation: isolate`

Pseudo-elemento posicionado passa por cima de filhos estáticos. Para pintar
**atrás** do conteúdo (a malha de blueprint da barra lateral, por exemplo):
`isolation: isolate` no pai, `z-index: 0` no pseudo e `position: relative;
z-index: 1` nos filhos.

E calibre por tema: linha escura sobre branco tem contraste de verdade, no
escuro a mesma alfa vira quase nada. A barra lateral usa **menos da metade** da
opacidade no claro.

---

## Botão redondo se alinha por margem, nunca por recuo interno

`border-radius: 50%` num botão que não é quadrado desenha uma **elipse**, e o
anel de foco/hover desenha junto. Aconteceu com o botão da foto do usuário:
`padding: 3px 3px 3px 8px` para alinhar com a coluna de ícones deixou a caixa
em **41×36**, com a foto 2,5px fora do centro do próprio anel.

Regra: o que desloca é `margin`; a caixa fica quadrada e o anel concêntrico.
Confira medindo os dois retângulos:

```js
const b = btn.getBoundingClientRect(), f = foto.getBoundingClientRect();
b.width === b.height                                   // redondo
Math.abs((b.x + b.width/2) - (f.x + f.width/2)) < 0.5  // concêntrico
```

---

## Foco de teclado: 1px, `--foco`, e para dentro

O contorno do Tab existe e não se apaga — mas é **1px**, na cor `--foco`
(= `--primary`, o vermelho vibrante da casa) e **`inset`**. Para fora ele engorda
visualmente e briga com o vizinho; para dentro parece fino sem sumir.

---

## Piscar é um padrão, não um enfeite: `fpPiscaEmerg`

Só o **emergencial** pisca, sempre com a mesma animação (`fpPiscaEmerg`, 1,3s,
opacidade 1 → 0,22). Hoje em três lugares: o triângulo da listagem, o número no
menu lateral e — com a barra recolhida — o ícone do módulo.

Duas regras:

1. **Um alarme de cada vez.** Quando a barra abre e o número reaparece, o ícone
   para de piscar. Dois elementos piscando pela mesma causa viram ruído.
2. **A piscada é movimento, não cor.** O elemento mantém a cor neutra dos
   vizinhos e só vai a `--primary` no hover. Cor fixa de alarme num ícone de
   menu compete com o estado "ativo" e desalinha a coluna inteira.
3. **Desligar em `prefers-reduced-motion`.** Todo seletor que ganhar
   `fpPiscaEmerg` entra também no bloco `@media (prefers-reduced-motion: reduce)`
   logo abaixo do `@keyframes`.

Quem liga é o JS que já sabe a contagem (`fpFotoBadgePintar` marca
`.fp-nav-emerg` no `.nav-item`); o CSS decide **onde** piscar conforme o estado
da barra.

---

## A sidebar recolhida não tem geometria própria

Recolhida, expandida e aberta-no-hover compartilham o mesmo `padding`, o mesmo
`justify-content` e a mesma altura de linha. A única diferença é `.nav-label`,
`.brand-txt`, `.count` e `.fp-tema-est` sumirem.

Isso não é preferência estética: com o hover abrindo a barra, **qualquer**
diferença de caixa faz os 22 ícones se moverem debaixo do cursor no instante do
clique. Se precisar mexer no recuo, mexa nos dois estados juntos e **meça** —
`getBoundingClientRect()` dos ícones extremos, do botão de controle e do avatar,
antes e depois do `hover-open`.

`.fp-foot-linha` precisa de `align-items: flex-start` no estado recolhido: com
`center`, o avatar e o `»` escorregam de x=34 para x=130 quando a barra vai de
68 para 260px.

Pelo mesmo motivo, **o que some com a barra recolhida some por `visibility`**,
não por `display`: `#roleBadge` escondido com `display: none` faria o rodapé
inteiro subir 28px no instante do hover.

---

## "Mostrar mais" anexa; nunca repinta a lista inteira

Na Galeria, repintar para mostrar mais 120 produtos recarregava as 1.311
miniaturas e piscava a tela. O botão **anexa só as novas**.

Consequência para quem liga eventos por linha: a volta passa de novo pelas
linhas antigas. `addEventListener` empilharia um ouvinte a cada clique em
"Mostrar mais" — use `onclick` (propriedade, reatribuir substitui) ou marque a
linha com `dataset` e ligue uma vez só. As duas coisas convivem no
`renderFotoProducao`, e por motivos diferentes: o `onclick` **precisa** ser
reatribuído, porque o closure guarda a lista de caixas daquele render.

---

## Barra de progresso: duas camadas, senão ela mente

`fpSincIniciar` / `fpSincAndar(real, teto)` / `fpSincEncerrar` mantêm dois
números: `real`, que só anda quando uma etapa confirma, e `mostrado`, que
persegue o real com suavização e um creep lento enquanto espera.

O mostrado **nunca** passa 8 pontos à frente do real nem ultrapassa o teto da
etapa. Barra que salta para 90% e trava ensina o operador a não confiar nela — e
depois disso nenhuma barra do painel funciona.

## Commits

Mensagem em português, explicando **o porquê** e não só o quê. Terminar com:

```
Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```
