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
| TikTok | rascunho: **sim, sem auditoria** · direto: não | **Harry** — escopo `video.upload` já destrava |

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

## TikTok — existe um caminho que NÃO passa pela auditoria

Levantado na doc oficial em 01/09/2026 e passado por dupla refutação, com as
páginas abertas uma a uma. O que estava escrito aqui antes dizia que publicar no
TikTok dependia da auditoria. **Está errado** — depende para um dos dois modos.

Hoje o app tem só os escopos de leitura (`user.info.basic`, `user.info.stats`,
`video.list`).

### Os dois modos, e por que isso muda o plano

| | `video.upload` — rascunho | `video.publish` — Direct Post |
|---|---|---|
| O que faz | manda o vídeo para a **caixa de entrada** do app do TikTok | publica direto, sem tocar no celular |
| Quem finaliza | o operador, no celular, com dois toques | ninguém |
| Passa por auditoria? | **não** | **sim** |
| Dá para usar quando? | assim que o escopo for aprovado | depois da auditoria, sem prazo |

O caminho do rascunho é legítimo e documentado, não é gambiarra: a restrição de
visibilidade está sob o título *Direct Post API* nas guidelines, e a tabela de
erros do endpoint de rascunho não tem o erro de cliente não auditado.

**Recomendação:** pedir os dois escopos, ligar o rascunho agora e deixar a
auditoria correndo em paralelo. O operador ganha o TikTok esta semana em vez de
esperar sem prazo.

### O que a auditoria trava de verdade

Enquanto o cliente não é auditado, o Direct Post:

- só publica em **`SELF_ONLY`** (só você vê);
- exige que a **conta esteja privada no momento do post**;
- aceita no máximo **5 usuários publicando por 24h**;
- devolve 403 `unaudited_client_can_only_post_to_private_accounts` se a conta
  estiver pública.

**E o mais importante, que quase ninguém sabe:** os vídeos publicados antes da
auditoria **não viram públicos sozinhos** quando ela passa. A doc manda o dono
tornar a conta pública e depois mudar a privacidade **de cada post, na mão**. Ou
seja: nada de "publica agora e conserta depois".

Prazo? A TikTok é explícita em não dar nenhum: *"We do not provide an official
review timeline or any guarantees for approval."*

### Passo a passo

1. **developers.tiktok.com** → seu app → **Add products** → **Content Posting API**.
2. Em **Scopes**, pedir `video.upload` **e** `video.publish`.
3. **Verificar o domínio** — só é necessário para mandar o arquivo por URL
   (`PULL_FROM_URL`), que é como a gente faz. No portal: *URL properties* →
   adicionar `mediaclub.fullpro.com.br` → o TikTok dá um **TXT** → publicar no
   DNS (**GoDaddy**) → voltar e verificar.
4. **Submeter a auditoria** — para o Direct Post. O formulário fica atrás de
   login, então não dá para eu listar os campos daqui.
5. **Refazer o OAuth em Integrações**, para o token novo carregar os escopos
   novos. Escopo marcado no app não muda token já emitido.

### Detalhe de implementação que economiza um bug

Antes de cada Direct Post é obrigatório chamar `creator_info/query`, e a tela
tem que oferecer **só as opções de privacidade que essa chamada devolver** — não
o enum completo da doc. Oferecer a mais dá `privacy_level_option_mismatch`.

---

## TikTok: não existe token que dure mais. E não precisa.

Você perguntou como fazer um token que dure mais tempo. A resposta honesta é que
**não dá** — e o motivo é de projeto, não limitação sua:

| | Validade | Dá para alongar? |
|---|---|---|
| `access_token` | **24 horas** (`expires_in: 86400`) | não, não há parâmetro |
| `refresh_token` | **365 dias** (`refresh_expires_in: 31536000`) | — |
| `client_credentials` | 2 horas | não serve: é para dado do app, não da conta |

Não existe equivalente ao *long-lived token* da Meta. O desenho oficial é o
contrário: token curto + renovação automática em segundo plano — verbatim,
*"can be refreshed without user consent... schedule background jobs"*.

**É exatamente o que está ligado desde 01/09**: o job `tiktok-renovar` roda no
minuto 6 de cada hora, um minuto antes do coletor. Você não precisa mais olhar
para esse token no dia a dia.

### O que sobra para vigiar: os 365 dias

Uma coisa a doc **não** responde, e eu não vou fingir que responde: quando o
refresh devolve um `refresh_token` novo, **os 365 dias reiniciam ou o relógio
original continua correndo?** A própria página do TikTok dá os dois sinais:

- a descrição do campo diz *"valid for 365 days after the **initial**
  issuance"* → relógio fixo;
- o exemplo de resposta do endpoint de refresh mostra `refresh_expires_in:
  31536000` de novo → relógio renovado.

Sem fonte primária para decidir. Mas **é medível**: basta gravar a data de cada
refresh junto com o `refresh_expires_in` devolvido e ver se a data absoluta de
vencimento anda para frente ou fica parada. Duas ou três medições respondem.
Hoje o painel não guarda esse número — vale guardar quando eu mexer na
`tiktok-proxy`.

### O que derruba a autorização antes da hora

Documentado no webhook `authorization.removed`, com código de motivo: usuário
desconecta pelo app (1), conta apagada (2), **idade da conta mudou** (3), conta
banida (4), nós revogarmos (5). O TikTok **avisa** quando isso acontece — existe
callback. Hoje a gente não escuta esse webhook; se o TikTok cair do nada um dia,
é o primeiro lugar a olhar.

Não há na doc nada sobre troca de senha invalidar token, nem sobre expirar por
inatividade, nem limite de refreshes por dia. Ausência de limite documentado não
é o mesmo que ausência de limite.

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
