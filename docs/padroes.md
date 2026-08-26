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
