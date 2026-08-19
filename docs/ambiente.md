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

---

## Supabase

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
