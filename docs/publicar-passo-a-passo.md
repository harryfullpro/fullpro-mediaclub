# Ligar a publicação: o que só o Harry pode fazer

Escrito em 01/09/2026, com os contratos conferidos na documentação oficial de
cada plataforma. O que está aqui é o que **não é código** — é acesso, permissão
e aprovação, e por isso passa pela mão dele.

Estado de hoje, medido pelo `health` da function `publicar`:

| Rede | Publica? | Quem resolve |
|---|---|---|
| Instagram | **sim** — cota 100/24h | pronto |
| Facebook | **sim** — Reel, vídeo de feed, foto e álbum | pronto (falta o 1º post de verdade) |
| YouTube | não | **Harry** — OAuth de upload |
| TikTok | não | **Harry** — auditoria + escopos |

---

## YouTube — o que falta é OAuth, não "outro token"

A chave de API que já está conectada **só lê**. Ela lista vídeos e traz
métricas, e nunca vai subir arquivo: o Google exige OAuth para `videos.insert`.
São coisas diferentes, não uma versão melhor da outra.

**Antes de começar, o número que muda o planejamento:** cada upload custa
**1.600 unidades** da cota diária de **10.000**. Isso dá **6 vídeos por dia**, e
a cota é do PROJETO inteiro — o coletor de hora em hora já consome um pouco dela
(~4 unidades por rodada, ~96/dia). Se a meta for mais que 6 vídeos/dia, o
aumento de cota tem que ser pedido antes, e a Google leva semanas.

### Passo a passo

1. **console.cloud.google.com** → o projeto que já tem a YouTube Data API v3
   ligada (é o mesmo da chave atual).
2. **APIs e serviços → Tela de permissão OAuth**
   - Tipo: **Externo** (mesmo sendo uso interno — "Interno" só existe com Google
     Workspace).
   - Preencha nome do app, e-mail de suporte e e-mail do desenvolvedor.
   - Em **Escopos**, adicione: `https://www.googleapis.com/auth/youtube.upload`
     (e `https://www.googleapis.com/auth/youtube` se quiser também editar
     vídeo já publicado).
   - Em **Usuários de teste**, adicione o e-mail da conta que administra o canal
     FullPro.
3. **Credenciais → Criar credenciais → ID do cliente OAuth**
   - Tipo: **Aplicativo da Web**.
   - Em *URIs de redirecionamento autorizados*, coloque exatamente:
     `https://mediaclub.fullpro.com.br/admin`
   - Guarde o **Client ID** e o **Client Secret**.
4. Me mande **Client ID** e **Client Secret** (ou cole em Integrações quando eu
   subir a tela). Eu monto o fluxo: você clica em *Conectar*, o Google pergunta
   se autoriza, e volta. O refresh token fica no servidor, como os outros.

### Duas armadilhas conhecidas

- **App em "modo de teste"**: o refresh token expira em **7 dias**. Ou seja,
  reconectar toda semana. Para parar de expirar, o app precisa ser **publicado**
  na tela de permissão OAuth (status "Em produção"). Como o escopo de upload é
  sensível, publicar pode pedir verificação da Google — que demora. O caminho
  curto é publicar e ver: para uso no próprio canal, muitas vezes passa sem
  verificação completa.
- **Agendamento**: o YouTube agenda nativamente com `privacyStatus=private` +
  `publishAt`. É a única rede que agenda direito além do Facebook — vale usar o
  nativo dele em vez do nosso cron.

---

## TikTok — o gargalo é auditoria, e ela demora

Hoje o app tem só os escopos de leitura (`user.info.basic`, `user.info.stats`,
`video.list`). Publicar exige mais três coisas, e **uma delas leva dias**.

### Passo a passo

1. **developers.tiktok.com** → seu app → **Add products** → adicionar
   **Content Posting API**.
2. Em **Scopes**, pedir `video.upload` e `video.publish`.
   - `video.upload` = manda o vídeo para os **rascunhos** do app do TikTok, e
     alguém finaliza no celular.
   - `video.publish` = **Direct Post**, publica direto. É o que a gente quer, e
     é o que exige auditoria.
3. **Verificar o domínio** (necessário para mandar o arquivo por URL em vez de
   subir em pedaços): no portal, *URL properties* → adicionar
   `mediaclub.fullpro.com.br` → o TikTok dá um registro **TXT** → publicar esse
   TXT no DNS (**GoDaddy**, que é onde o domínio mora) → voltar e verificar.
4. **Submeter a auditoria**. É aqui que trava: verbatim na doc, *"to lift the
   restrictions on content visibility, your API client must undergo an audit"*.
   **Antes da auditoria passar, todo vídeo publicado pela API sai como
   `SELF_ONLY`** — só você vê. Não adianta publicar e esperar virar público.
5. Refazer o OAuth do TikTok em Integrações, para o token novo carregar os
   escopos novos.

### O que já sabemos que vai aparecer

- O `access_token` do TikTok vale **24 horas** e é renovado pelo `refresh_token`
  — o painel já guarda os dois e renova sozinho.
- Antes de cada Direct Post é **obrigatório** chamar `creator_info/query` — o
  TikTok recusa a publicação sem isso. Já está previsto no código.

---

## Facebook — ligado em 01/09; falta você olhar o primeiro post

Seu token já veio com `pages_show_list`, `pages_read_engagement` e
`pages_manage_posts`, e o envio está escrito e no ar. A função escolhe sozinha
o formato:

| O que você manda | Onde cai no Facebook |
|---|---|
| 1 vídeo com tipo reel/short/story/clip | **Reel** (upload em 3 fases pelo rupload) |
| 1 vídeo de outro tipo | **vídeo do feed** (`/videos` com `file_url`) |
| 1 foto | **foto no feed** |
| 2+ fotos | **álbum** (sobem despublicadas, o post do feed junta) |
| só texto | post de texto |

**Qual Página?** A que estiver vinculada ao nosso Instagram. Se um dia o token
enxergar duas Páginas e nenhuma casar com o Instagram, a função **para e
reclama** em vez de chutar — publicar na Página errada é o tipo de erro que
ninguém desfaz. Para fixar, grave o id em `mc_integrations` (provider
`facebook`, `meta.page_id`).

**O que ainda não dá para eu afirmar:** que o primeiro post sai bonito. Testar
de verdade é postar de verdade na Página pública da FullPro, e isso é sua
decisão, não minha. Sugestão: agende um vídeo qualquer para daqui a 10 minutos
só no Facebook, veja cair, apague. Aí a rede está provada.

Duas coisas dessa rede que valem no planejamento:

- **Agenda nativamente** — vídeo de feed aceita `scheduled_publish_time` entre
  10 minutos e 75 dias; Reels, entre 10 minutos e 29 dias. **Não estou usando**:
  quem marca a hora é o nosso cron, para as quatro redes seguirem uma fila só.
  Metade das publicações com horário no Facebook e metade no painel seria um
  jeito garantido de perder post de vista.
- **Aceita rascunho** (`video_state=DRAFT`): dá para revisar no Meta Business
  Suite antes de subir. O Instagram não tem isso — se você quiser esse fluxo
  para o Facebook, é uma linha, me peça.

---

## Uma decisão que vale a pena tomar cedo

"Publicar simultaneamente nas quatro" é **quatro uploads separados**, não um. Não
existe cross-posting entre redes diferentes — só entre Páginas do mesmo Facebook
Business. Então cada plataforma marcada no planner é um envio do arquivo inteiro,
com a cota, o tempo e as falhas dela.

A consequência prática: um vídeo de 300 MB marcado para as quatro sobe 300 MB
quatro vezes. Vale considerar publicar **primeiro no Instagram** (que é o que
funciona hoje e é o principal) e deixar as outras para quando a fila estiver
tranquila — o planner já trata cada rede como um destino independente, então isso
é escolha de horário, não mudança de código.
