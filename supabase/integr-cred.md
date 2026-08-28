# Onde mora a credencial de cada integração

Resolvido em **28/08/2026**, quando o dono pediu para reconectar Instagram e
YouTube pelo painel em vez de editar o `config.js` e redeployar.

## A ordem, e por que ela é essa

Toda função que precisa de credencial resolve nesta ordem:

1. **`public.mc_integrations`** (`provider` = `instagram` | `youtube` | `tiktok` |
   `bling`). É onde o painel grava quando um administrador reconecta.
2. **Secret da função** (`IG_ACCESS_TOKEN`, `YOUTUBE_API_KEY`). Reserva: mantém
   de pé o que já funcionava antes de alguém reconectar pela primeira vez.

Nunca o `config.js`. O `config.js` é servido em
`https://mediaclub.fullpro.com.br/config.js` — qualquer pessoa baixa. Token da
Meta é credencial de portador: quem tem, age como a conta até expirar.

## Por que uma tabela e não só a secret

Secret só muda no painel do Supabase, com a conta do dono. O token do Instagram
expira a cada ~60 dias — e é o `coletor-pecas` que segura a meta de stories, que
não dá para recuperar depois (story vive 24h). Reconexão que depende de lembrar
uma senha de outro serviço é reconexão que não acontece.

`mc_integrations` tem **RLS ligada e nenhuma policy**: a chave publicável não lê
nem escreve nada ali. Só `service_role`, ou seja, só as edge functions.

## Quem pode gravar

`salvar` e `desconectar` exigem **administrador** — a mesma regra do painel
(`isUserAdmin`: o cargo, sem acento e em minúsculas, começa com `admin`).
As demais ações exigem operador logado. A checagem é feita no corpo da função,
não por `verify_jwt`: a chave publicável do `config.js` é aceita como JWT válido
pelo gateway, então `verify_jwt` sozinho deixaria qualquer um entrar.

## O que a função devolve

Nunca a credencial. Nem inteira, nem em prefixo, nem em mensagem de erro. O
`status` devolve só: conectado, de onde veio (`painel` ou `secret`), o nome da
conta, quando expira e quando foi salvo.

## Ordem segura para tirar as chaves do config.js

1. Reconectar as duas pelo painel (grava em `mc_integrations`).
2. Conferir em Integrações que as duas dizem **"conectado pelo painel"**.
3. Só então apagar `IG_ACCESS_TOKEN` e `YOUTUBE_API_KEY` do `config.js`.

`IG_USER_ID` não é segredo (é um id numérico público) e pode ficar.
