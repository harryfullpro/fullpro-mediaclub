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

> A verificação de tabela olha **também a raiz**, não só descendentes: quando o nó
> inserido *é* a tabela, `querySelectorAll('table')` não a encontra.

---

## Rede

`window.fetch` é interceptado: deduplicação de GETs idênticos em voo + cache de 20s para
leituras do Supabase. Qualquer escrita limpa o cache inteiro (`fpLimparCacheRede()`
força). Motivo: `mc_admin_users` era buscada 25× em 2 minutos, com pico de 3,9s.

Use `.maybeSingle()` quando a linha **pode não existir** — `.single()` devolve 406
(PGRST116) e suja o console.

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
