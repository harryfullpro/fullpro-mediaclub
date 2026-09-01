# Ambiente, deploy e integrações

## Onde fica o código

- **Repositório:** `git@github.com:harryfullpro/fullpro-mediaclub.git`, branch `main`
- **Clone de trabalho:** `~/Documents/fullpro-mediaclub` — é o bom, está em dia
- **Não use** as cópias antigas em `~/Documents/Claude/Projects/FullPro Media Club
  Landing Page/` — estão desatualizadas

Arquivos na raiz: `index.html` (landing), `admin.html` (painel, ~15 mil linhas),
`config.js`, `moto-catalog.js`, `sw.js`, `manifest.webmanifest`, `vercel.json`,
`assets/`, `supabase/`.

## Publicar

**Cada push para `main` = deploy automático na Vercel**, em 10–30 segundos, sem build.

Fluxo seguro:

```bash
cd ~/Documents/fullpro-mediaclub && git pull
# editar admin.html com script (Python), nunca digitando no navegador
```

Validar **antes** de commitar — o arquivo é grande e um erro de sintaxe derruba o painel:

```bash
python3 -c "
import re
s=open('admin.html',encoding='utf-8').read()
b=re.findall(r'<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>',s,re.S)
open('/tmp/admin-main.js','w',encoding='utf-8').write(max(b,key=len))
css=re.search(r'<style>(.*?)</style>',s,re.S).group(1)
print('CSS balanceado:', css.count('{')==css.count('}'))
" && node --check /tmp/admin-main.js
```

Confirmar que subiu comparando o hash com produção:

```bash
L=$(shasum -a 256 admin.html | cut -d' ' -f1)
curl -s https://mediaclub.fullpro.com.br/admin | shasum -a 256 | cut -d' ' -f1
```

**Depois do deploy o navegador serve o HTML do cache.** Navegue com uma query nova
(`/admin?v=2#dashboard`) para furar, e cheque com `typeof fpToast === 'function'` se a
versão nova carregou.

### Trocar um arquivo em `assets/` sem mudar a URL não chega em ninguém

A Vercel serve `/assets/*` com `cache-control: public, max-age=31536000,
immutable`. Substituir `logo-mediaclub.png` publica os bytes novos — e o
navegador de quem já abriu o painel continua com o antigo por um ano.

Sempre versionar a URL (`?v=2`) em **todos** os pontos: `<img>`, `<link
rel="icon">`, `apple-touch-icon` e `manifest.webmanifest`. Conferir com:

```bash
curl -s https://mediaclub.fullpro.com.br/assets/logo-mediaclub.png -o /tmp/a.png && sips -g pixelWidth /tmp/a.png
```

Se o servidor devolve o arquivo novo e a tela mostra o velho, é cache do
navegador, não deploy.

### Quando a Vercel simplesmente não publica

Aconteceu em 26/08/2026: commit no `main`, nenhum erro, nenhum build falhando — e
a borda continuou servindo o HTML de **20 minutos antes** por 11 minutos. Um
commit vazio (`git commit --allow-empty`) soltou a fila em ~10 segundos.

O sintoma é idêntico ao de "o código não funcionou". Antes de sair depurando,
confirme que a versão nova saiu, procurando na resposta uma marca que só existe
no commit novo:

```bash
curl -s "https://mediaclub.fullpro.com.br/admin?v=$RANDOM" | grep -c "minha-classe-nova"
curl -sI https://mediaclub.fullpro.com.br/admin | grep -i "x-vercel-cache\|age\|last-modified"
```

`x-vercel-cache: HIT` com `age` alto e `last-modified` velho = borda parada, não
código errado.

### Se o push falhar com "Could not read from remote repository"

O ssh-agent perdeu a chave (costuma acontecer quando o Mac suspende). A chave tem
passphrase e **não está no Keychain**, então só o dono resolve:

```bash
ssh-add --apple-use-keychain ~/.ssh/id_ed25519
```

## Testar

- **Painel logado:** use `mcp__claude-in-chrome__*` — é o Chrome real do dono, com a
  sessão. O navegador interno não tem o login.
- **Largura de celular:** a janela do Chrome não desce abaixo de ~570px. Isso já ativa o
  breakpoint de 600px, mas não o de 480px. Para 390px reais, é o modo dispositivo do
  DevTools (o dono costuma deixar aberto).
- **Servidor local:** `python3 -m http.server` falha no sandbox (`os.getcwd` sem
  permissão). Use um servidor em node.
- **Fonte de verdade:** print do iPhone do dono. Vários problemas só apareceram assim.
- **O service worker atrapalha o teste local — armadilha real.** O `sw.js` fica
  registrado no escopo de `localhost:<porta>` depois da primeira visita, e o `fetch`
  dele responde navegação com `caches.match('/admin')` quando a rede falha. Resultado:
  você abre uma página de teste sua, o servidor devolve **200**, e o que aparece na tela
  é a **tela de login do painel** — inclusive dentro de `<iframe>`, e sem nenhum erro no
  console. Custou tempo em 31/08. Antes de desconfiar do seu HTML, limpe:

  ```js
  (await navigator.serviceWorker.getRegistrations()).forEach(r => r.unregister());
  (await caches.keys()).forEach(k => caches.delete(k));
  ```

- **Laboratório por varredura transitiva — duas armadilhas.** Quando a tela depende de
  muitas funções (o Dashboard puxou 227), extrair uma a uma é perda de tempo: faça o
  script varrer o grafo a partir das raízes. Mas:
  1. **Função de uma linha** (`function f(x) { return y; }`) **não tem linha `}`**. Se a
     extração procura o `}` na coluna 0, ela corre até a próxima função e engole as
     declarações do caminho — o sintoma foi `Identifier 'EDIT_FILTER' has already been
     declared`, e o bloco inteiro morria. Conte profundidade de chaves.
  2. **Emita em ordem de ARQUIVO, não de grafo.** Uma constante pode usar outra na
     própria declaração (`FP_ETAPA_ROT` faz `reduce` em `FP_ETAPAS`), e a ordem de
     descoberta dava `Cannot access 'FP_ETAPAS' before initialization` — erro que só
     existe no laboratório, e faz procurar bug onde não tem.
  O mesmo vale para declaração multilinha: pare por profundidade de parênteses, não no
  primeiro `;`.
- **Laboratório de medição:** para conferir contraste, alinhamento e altura de linha sem
  login, monte uma página que **extrai** os `<style>` do `<head>` do `admin.html` e o
  trecho de JS da tela, e injeta dados reais lidos do Supabase. Assim o que você mede é o
  CSS de produção, com a mesma cascata. Dois cuidados: pegue só os `<style>` que estão
  **antes** de `<div id="app"`, senão o regex também captura o `<style>` da etiqueta de
  envio (que vive dentro de uma template string de JS, no fim do arquivo) e o
  `body { font-family: Arial }` dele apaga a fonte do painel; e os arquivos `_lab-*.html`
  estão no `.gitignore` porque a Vercel serve a raiz inteira.

---

## Supabase

### `drive-recentes` (edge function)
`GET /functions/v1/drive-recentes?n=20` — as pastas de SKU criadas mais
recentemente no Drive, com a primeira foto de cada. Usa os mesmos secrets do
`drive-proxy` (`GOOGLE_SA_JSON`, `DRIVE_ROOT_FOLDER_ID`) e devolve só URLs; os
bytes saem do `drive-proxy?action=arquivo`. Dez minutos de cache no isolate.
Fonte em `supabase/functions/drive-recentes/index.ts`.

### `mc_guardados`
Peças prontas que saíram do painel e ninguém quer perder. Hoje tem a animação do
fluxo da foto (`anim-fluxo-foto`), que rodava no Dashboard de fotos.

```sql
select titulo, length(conteudo) from public.mc_guardados;
```

### `mc_admin_users.tutoriais`
jsonb com as marcas de tutorial já visto, no formato `"v<versão>:<nome>": 1`.
Para fazer todo mundo rever, o caminho normal é subir `FP_TUT_VERSAO` no
`admin.html`. Para zerar de vez:

```sql
update public.mc_admin_users set tutoriais = '{}'::jsonb;
```

### `mc_theme_colors`
Uma linha por tema (`claro` / `escuro`), coluna `cores` jsonb com `token -> hex`.
Só os realces; mapa vazio = tudo no padrão de fábrica. RLS liberando `anon` para
select/insert/update, como o resto do painel.

Projeto `fullpro_team`, id `xgaaocnuqgcwttrljqep`.

Tabelas principais: `mc_admin_users`, `mc_requests`, `mc_projects`, `mc_project_reviews`,
`mc_notifications`, `mc_clips`, `mc_integrations`, `mc_drive_thumbs`,
`mc_performance_goals` / `_posts` / `_influencers` / `_bonuses`, `mc_blocked_dates`.

Edge functions: `bling-proxy`, `tiktok-proxy`, `drive-proxy`, `ai-roteiro`.
Os proxies têm `verify_jwt: false` — exposição aceita para ferramenta interna.

## Integrações

### Bling ERP e TikTok
Tokens no **servidor** (`mc_integrations`), não no localStorage — resolve "só funciona
para quem conectou". Um administrador conecta uma vez e vale para todos.

### Magis5 — composição de kit

Edge function **`magis5-proxy`** (`verify_jwt: true`), código em
[supabase/magis5-proxy.ts](../supabase/magis5-proxy.ts). A chave fica na secret
**`MAGIS5_API_KEY`** da própria função — nunca no `config.js`, que é público.

Ações (POST, corpo JSON): `health`, `produto {sku}`, `composicao {sku, itens}`.

Três coisas que ditaram o desenho:

1. **A API do Magis5 não busca produto por nome.** Só `GET /v1/products/{sku}` e a
   listagem paginada sem filtro de texto. Por isso quem escolhe o produto é o **Bling**
   (busca em cima do cache que já existe para os brindes) e o **SKU é a ponte** entre os
   dois sistemas.
2. **`PATCH /v1/products/{sku}` substitui `products_composition` inteiro.** O painel
   sempre lê a composição atual antes e envia *ela + o item novo*. A função recusa lista
   vazia — um PATCH com `[]` apagaria a composição de um kit real.
3. **`verify_jwt` sozinho não protege:** ele aceita também a anon key, que é pública.
   Como aqui se escreve no ERP, a função exige `role = authenticated` no token (a
   assinatura já foi validada pelo gateway; só o papel precisa ser lido).

### Google Drive — foto por SKU
Estrutura no Drive: `<raiz>/<SKU>/<fotos>`; a primeira foto em ordem de nome vira a
thumbnail. Hoje são ~5.500 pastas de SKU.

Conta de serviço `image-sync-drive@fullpro-media-club.iam.gserviceaccount.com`, com a
pasta compartilhada como Leitor. Secrets na função `drive-proxy`: `GOOGLE_SA_JSON` e
`DRIVE_ROOT_FOLDER_ID`.

**Pegadinha:** a Drive API precisa estar ativada no projeto Google Cloud. Sem isso o erro
é *"Drive API has not been used in project N before or it is disabled"* — e esperar não
resolve.

Ações do proxy:

| Ação | Para quê |
|---|---|
| `status` | confirma acesso (~0,8s) |
| `status&contar=1` | conta as pastas (~7s) — só no botão Verificar |
| `map` (POST `{skus:[]}`) | quais têm foto — **uma chamada por tela** |
| `img&sku=X[&full=1]` | bytes da imagem, s320/s1600, cache de 1 dia |
| `open&sku=X` | redireciona para a pasta |
| `limpar` (POST `{sku?}`) | descarta o cache após subir fotos novas |

Cache em `mc_drive_thumbs`: mapeamento 7 dias (6h quando não acha), `thumb_link` 1h.

No cliente: `data-drive-sku="<sku>"` no container da imagem + `fpDriveCarregar(skus, raiz)`
depois do render. A imagem só substitui o conteúdo **no `onload`** — trocar antes deixava
um quadrado cinza vazio quando a rede falhava.

### Bling — baixa de estoque
`blingStockOut(idProduto, qtd, obs)` → `bling-proxy?action=stock-move` → `POST /estoques`
com `operacao: 'S'`. Usado por dois fluxos: envio a influenciadores e **brinde do
check-out**.

No check-out a baixa é **idempotente**: `mc_checkouts.gifts_stock_applied` guarda os ids
que já saíram. Salvar o mesmo check-out de novo não tira estoque outra vez. Se o Bling
falhar, o id não entra na lista e a próxima gravação tenta de novo.

### Instagram e YouTube
Configurados por `config.js`, sem OAuth.

## vercel.json

- `cleanUrls: true` — é o que faz `/admin` servir `admin.html`
- `Permissions-Policy: camera=(self)` — **precisa continuar assim**; estava `camera=()` e
  bloquearia a câmera do check-in
- `sw.js` sem cache, com `Service-Worker-Allowed`

## PWA

`manifest.webmanifest` + `sw.js`. O service worker é conservador de propósito: rede
primeiro para HTML/JS (deploy nunca fica preso), cache primeiro só para imagens, e
Supabase nunca passa pelo cache.

## Backup

Antes da auditoria de UX/UI, a versão anterior foi guardada em três lugares:

- Tag `backup-pre-uxui-2026-08-12` no GitHub
- Branch `backup/pre-uxui-2026-08-12` no GitHub
- Cópia dos arquivos em `~/Documents/backups-mediaclub/2026-08-12_pre-uxui/`

Reverter tudo:

```bash
git revert --no-commit ca11e22..HEAD && git commit -m "Reverte auditoria de UX"
git push origin main
```

## Medir contraste no laboratório — duas armadilhas

Custaram uma rodada inteira de conclusões erradas em 01/09. As duas produzem números
plausíveis, não erro visível, e é por isso que enganam.

### 1. Trocar de tema e medir antes de a transição acabar

O CSS anima `color` e `background-color`. Trocar `data-theme` e medir 2,5 s depois pegou
os **tokens do tema antigo sobre o fundo do tema novo** — texto claro sobre fundo já
claro. Deu 1,04:1 num chip que na verdade tem 16,57:1, e a lista de "reprovados" ficou
inteira de fantasma. Antes de medir:

```js
const s = document.createElement('style');
s.textContent = '*,*::before,*::after{transition:none!important;animation:none!important}';
document.head.appendChild(s);
```

Não use `requestAnimationFrame` para esperar: **com o painel do navegador oculto o rAF não
dispara** e a chamada trava até o timeout. Só `setTimeout`.

### 2. Resolver o fundo com `backgroundColor` quando há gradiente

`.post-card-thumb` pinta a plataforma com `background: linear-gradient(...)`. Nesse
elemento `backgroundColor` é `rgba(0,0,0,0)`, então quem sobe a árvore procurando cor
sólida **passa direto pelo gradiente** e mede contra o fundo errado.

Empilhe as camadas de baixo para cima e teste cada parada do gradiente, ficando com a
pior. A ordem importa: a cor de fundo pinta **embaixo** da imagem de fundo. E confira o
medidor contra um caso calculado à mão antes de confiar nele — a primeira versão do meu
empilhamento invertia a ordem e devolvia 3,00 onde o valor real era 5,25.

### Sanidade que sempre vale

Se um seletor de raiz não existe no laboratório (`#ppTabPublicados` é do app), a varredura
cai calada no `body` e mede a página inteira. Confirme quantos nós entraram.

**Duas notas de outra sessão sobre a mesma armadilha de tema** (b3, medindo em 28/08 leu
1,14:1 num elemento que era 13,73:1): `void offsetHeight` **não** termina transição — ele
força layout, não animação; e o caminho mais barato é medir **um tema por avaliação**, em
vez de trocar e esperar dentro da mesma chamada.

## Os jobs do pg_cron são um encadeamento, não quatro coisas soltas

Mudar o horário de um quebra o outro **em silêncio**. Descoberto em 01/09 quando movi o
coletor para 30 em 30 minutos e deixei metade das rodadas sem token de TikTok.

| Minuto | Job | Por que nessa ordem |
|---|---|---|
| `:06,:36` | `tiktok-renovar` | o token do TikTok dura 24h e **só é renovado quando a `tiktok-proxy` é chamada**; o coletor lê `mc_integrations` direto e não passa por ela |
| `:07,:37` | `coletor-pecas-30min` | precisa achar o token já fresco |
| `:12,:42` | `vincular-pecas-projeto` | roda depois do coletor, sobre as peças que ele acabou de gravar |
| `*/5` | `publicar-fila` | independente dos outros |

**Regra: ao mexer no horário do coletor, mexa no `tiktok-renovar` junto**, mantendo-o um
minuto antes. Sem isso o coletor grava "tiktok: token vencido" e o TikTok some do painel
sem ninguém perceber — que é exatamente o que aquele job existe para evitar.

### Cota, com os números conferidos (01/09/2026)

- **YouTube** — o coletor gasta ~4 unidades por rodada (~2 páginas de `playlistItems` +
  ~2 lotes de `videos`) contra teto de 10.000/dia. A 30 min são ~192/dia, ~2%.
  *Armadilha:* o "Page Summary" no topo da página de cota do Google ainda diz que
  `videos.insert` custa 1600 unidades, contradizendo a tabela normativa da mesma página —
  é o resumo que está velho. Desde 01/06/2026 `videos.insert` e `search.list` têm baldes
  próprios de 100/dia, fora do balde comum.
- **TikTok** — `user/info`, `video/query` e `video/list` a 600/minuto. 48 rodadas/dia não
  chegam perto.
- **Meta** — poucas chamadas por rodada, sem limite que morda nessa ordem.
