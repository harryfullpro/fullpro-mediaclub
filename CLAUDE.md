# FullPro Media Club — painel interno

Painel de produção do estúdio de filmagem automotiva. `admin.html` tem ~15 mil linhas e
três gerações de código empilhadas — **leia a documentação antes de mexer**.

## Leia primeiro

| Arquivo | Quando |
|---|---|
| [docs/contexto.md](docs/contexto.md) | Sempre. Tem as decisões que o dono já tomou. |
| [docs/padroes.md](docs/padroes.md) | Antes de escrever qualquer código. |
| [docs/ambiente.md](docs/ambiente.md) | Antes de publicar, testar ou mexer em integração. |
| [docs/pendencias.md](docs/pendencias.md) | Ao escolher o que fazer. |
| [docs/diario.md](docs/diario.md) | Para entender por que algo está do jeito que está. |

## As quatro regras que mais economizam retrabalho

1. **Melhoria de interface entra só no celular.** O computador está bom e o dono pediu
   explicitamente para não mexer. Use `.fp-so-desktop` / `.fp-so-mobile`. Antes de tocar
   em CSS fora de `@media`, pergunte: isso muda o computador?

2. **Valide a sintaxe antes de commitar.** O arquivo é grande e um erro derruba o painel
   inteiro. O comando está em `docs/ambiente.md`.

3. **`escHtml()` em todo `innerHTML`** que receba dado do formulário público. Já foi XSS
   real.

4. **O roteador que roda é `switchToView`.** Os outros dois são de gerações anteriores e
   têm os listeners descartados.

## Manter a documentação viva

Ao terminar um trabalho, atualize:

- Decisão nova do dono → `docs/contexto.md`
- Padrão ou componente novo → `docs/padroes.md`
- Mudança em deploy/integração → `docs/ambiente.md`
- O que foi feito → `docs/diario.md`; o que sobrou → `docs/pendencias.md`

## Publicar

Push para `main` = deploy automático na Vercel em 10–30s. Sem build.
Depois do deploy, fure o cache do navegador com uma query nova (`/admin?v=2`).

## Idioma

Interface, comentários de código e mensagens de commit em **português**.
