# FullPro Media Club

Landing page + painel administrativo do programa FullPro Media Club.

Stack: HTML/CSS/JS estático · **Supabase** (banco + auth) · **Vercel** (hospedagem) · **GitHub** (código).

---

## Estrutura

```
.
├── index.html          # Landing pública (form de agendamento + calendário)
├── admin.html          # Painel admin (gerenciar solicitações + bloquear datas)
├── config.js           # URL + anon key do Supabase  ← VOCÊ PREENCHE
├── assets/             # Logo + imagens dos produtos
├── supabase/
│   └── schema.sql      # Rode no SQL Editor do Supabase
├── vercel.json
└── .gitignore
```

---

## Setup — passo a passo

### 1. GitHub
1. Crie um repo novo (privado ou público) em github.com/new, nome sugerido: `fullpro-mediaclub`
2. No seu terminal, dentro desta pasta:
   ```bash
   git init
   git add .
   git commit -m "Initial commit — FullPro Media Club"
   git branch -M main
   git remote add origin https://github.com/<seu-usuario>/fullpro-mediaclub.git
   git push -u origin main
   ```

### 2. Supabase
1. Crie um projeto em [app.supabase.com](https://app.supabase.com) — anote a senha do DB em lugar seguro.
2. Abra **SQL Editor → New query**, cole o conteúdo de `supabase/schema.sql` e rode (botão **Run**). Deve criar 2 tabelas + 1 view + RLS.
3. Vá em **Project Settings → API** e copie:
   - **Project URL** (ex: `https://xxxx.supabase.co`)
   - **anon public key** (começa com `eyJ...`)
4. Abra `config.js` e substitua os dois valores.
5. Crie seu usuário admin em **Authentication → Users → Add user → Create new user** (marcar *Auto Confirm User*). Esse e-mail/senha é o que você usa no `/admin.html`.
6. Commit + push o `config.js` atualizado:
   ```bash
   git add config.js
   git commit -m "Configure Supabase credentials"
   git push
   ```

> **Sobre a anon key:** ela é pública por design. Quem protege os dados são as políticas RLS definidas no `schema.sql`. Apenas usuários autenticados (admin) podem ler/editar — qualquer um pode apenas inserir uma solicitação via formulário.

### 3. Vercel
1. Acesse [vercel.com/new](https://vercel.com/new) e conecte sua conta GitHub.
2. Selecione o repo `fullpro-mediaclub` → **Import**.
3. Framework Preset: **Other** (é site estático, não precisa build).
4. Clique **Deploy**. Em ~30s seu site sobe num domínio `*.vercel.app`.
5. (Opcional) **Domains** → adicione `mediaclub.fullpro.tech` ou outro subdomínio — Vercel orienta no DNS da Hostinger.

A partir daqui, cada `git push` para `main` faz deploy automático.

---

## Testando local

Não abra pelo `file://` — o navegador bloqueia chamadas ao Supabase por CORS. Rode um servidor estático:

```bash
npx serve .
# ou
python3 -m http.server 8000
```

Acesse `http://localhost:8000/`

---

## URLs finais

- **Landing:** `https://<seu-dominio>/`
- **Admin:**   `https://<seu-dominio>/admin.html`

---

## Migração dos dados do Hostinger (opcional)

Se você já tem solicitações no `localStorage` da versão antiga em `fullpro.tech/mediaclub/`, rode isto no DevTools daquela página para exportar:

```js
copy(localStorage.getItem('fullpro_media_requests'));
```

Cole em um arquivo `old.json` e importe via SQL no Supabase convertendo os campos (ou me mande que eu adapto um script).

---

## Próximos passos sugeridos

- Ativar **Email confirmations** no Supabase Auth pra evitar contas com e-mail inválido (opcional, só faz diferença se você for abrir cadastro para mais admins).
- Adicionar **rate limit** no insert de requests (Supabase Edge Function ou policy com função de contagem por IP).
- Criar Edge Function que dispare e-mail/WhatsApp pra você a cada nova solicitação.
