# Pendências

Ordenado por impacto. Atualizar sempre que algo for concluído ou aparecer.

---

## Em andamento

### O coletor de metas está no ar mas não roda sozinho — falta secret e cron
`coletor-pecas` (edge function) traz as peças publicadas de Instagram, YouTube e
TikTok para `mc_pecas`, e é ele que alimenta o painel de Metas. Testado contra as
contas reais em 27/08/2026 — `/stories` devolveu 4 stories, `/media` separou 21
REELS de 4 carrosséis, o YouTube devolveu a duração de cada vídeo. **Mas ele
ainda não roda sozinho.** Faltam duas coisas, as duas do dono:

1. **Criar os secrets `IG_ACCESS_TOKEN` e `YOUTUBE_API_KEY`** (Supabase → Edge
   Functions → Secrets), com os valores que hoje estão no `config.js`. Isso
   também tira os dois de um arquivo que o navegador baixa.
2. **Agendar de hora em hora** (Supabase → Integrations → Cron). `pg_cron` e
   `pg_net` estão disponíveis no projeto, não instalados.

**O agendamento não é opcional:** story do Instagram vive 24 horas e `/stories`
só devolve o que está no ar AGORA. Sem cron, story publicado numa sexta à noite
simplesmente não existe na segunda — e não há como buscar depois. O botão
"Atualizar" da tela de Metas cobre o dia a dia de quem está com a aba aberta,
nada mais.

### Três decisões do dono sobre as metas de setembro
- **O valor por meta mudou de escala.** O caixa é `metas no ritmo × valor por
  meta`. Com 3 metas a R$ 850 o teto era R$ 2.550; com 7, é R$ 5.950. O
  `pool_per_goal` ficou como estava — a conta é que mudou.
- **A faixa de 10-15 min quase não existe hoje.** No canal inteiro são 10 vídeos
  nessa faixa; a maioria tem 4 a 9 minutos e não cai em meta nenhuma (aparecem
  em "peças fora das metas", no pé da tela).
- **"Pure Sound Triumph Speed 1200" tem 20 minutos.** Conta como pure sound pela
  regra do título, mas a meta diz "abaixo de 10 min". A tela mostra a duração ao
  lado em vez de decidir sozinha.

### O token do TikTok venceu em 18/08/2026
`mc_integrations.provider = 'tiktok'`, `expires_at = 2026-08-18`. O coletor
detecta e avisa, mas enquanto isso **nenhum vídeo do TikTok entra na contagem de
vídeos curtos**. Reconectar em Integrações.

### Os cinco operadores ainda não fizeram o primeiro acesso
patrik, andre, jose, matheus e yonan continuam com o hash antigo. A primeira
entrada de cada um migra a senha sozinha, pela ponte `mc-login` — a senha é a
mesma. Só vale avisar que é normal.

### `mc_fin_*` continua legível pela chave pública
3.852 lançamentos e 152 boletos. As outras 23 tabelas foram fechadas em
27/08/2026; estas ficaram porque **outra ferramenta do dono usa a mesma chave
anon** e fechá-las derrubaria essa ferramenta. Falta o dono dizer qual é, para
ela ganhar via própria.

### Ligar a checagem de senha vazada
Supabase → Authentication → Password protection. Um clique, nunca dado.

### Os PNGs originais dos logotipos estão parados no repositório
`Instagram.png` (1,3 MB), `yt_shorts.png`, `tiktok_2.png`, `mercado_livre*.png`,
`ads*.png`, `site.png` — ~1,9 MB. Desde 27/08/2026 **ninguém os referencia**: os
logotipos viraram SVG embutido e data URI de 64px em `FP_DEST_ARTE`. Eles são a
fonte das versões reduzidas; apagar é decisão do dono.

### Ligar o módulo de kit do Magis5 (falta a chave e um teste real)
O código está no ar (`magis5-proxy` + aba Produção), mas **nunca falou com o Magis5**.
Para ligar:

1. **Criar a secret `MAGIS5_API_KEY`** na edge function `magis5-proxy` (Supabase →
   Edge Functions → magis5-proxy → Secrets). ⚠️ O token antigo **vazou em texto puro** num
   `readme.txt` público do plugin `woo-magis5-shipping-bridge` (ver
   `06-MAGIS5-FLUXO-ENVIO.md` na base da loja) — gerar um **novo** no painel do Magis5.
2. **Validar em um kit de teste** duas coisas que a documentação não deixa claras:
   - **O que é `products_composition[].id`** — o painel manda o `productId` do componente
     (é a leitura mais natural da resposta, que separa `id` da linha de `productId`). Se o
     hub reclamar, a alternativa é o id da linha de composição.
   - **A regra da participação** — se o Magis5 exige que `percentagePriceValue` some 100 e
     o que ele faz quando não soma. O painel já mostra a soma e avisa, mas não bloqueia.
3. **Ver se SKU sem composição aceita virar kit** pelo PATCH, ou se o `productType`
   precisa ser mudado antes no hub.

Fazer o primeiro teste com um kit de brincadeira, não com um que está anunciado.


### Ligar o Slack da separação (falta o app e o token)
`fpSepMensagemSlack` e a edge function `slack-proxy` estão no ar e **dormentes**. Falta o
dono criar o app no Slack e fornecer o token `xoxb-`. Enquanto isso, a lista de separação
vai por **PDF de link público** — que resolve o dia a dia e pode muito bem ficar como é.

### Os PDFs de separação se acumulam sem limpeza
Balde `storage/separacao`, público, com políticas de SELECT e INSERT para `anon` e
**sem DELETE**. Cada lote gerado vira um arquivo que fica lá para sempre. Não é urgente
(são alguns KB cada), mas precisa de uma decisão: prazo de validade, limpeza manual pela
aba Manutenção, ou nada.

Cuidado ao mexer: `sb.storage.remove()` **responde sucesso mesmo quando o RLS bloqueia** —
a resposta traz os nomes pedidos, não os apagados. Conferir listando de novo.

### Campanha do Meta Ads — só falta o vídeo
Rascunho `FullPro Media Club Ads` na conta `FullPro - Conta de anúncios` (834166548630365),
conjunto `Landing page`, anúncio `video-joinville-01`. Tudo configurado: Joinville + 40 km,
interesses de moto, 3 textos, 3 títulos, descrição, URL com UTMs, CTA "Agendar agora",
formato travado em Mídia única. **Falta subir o vídeo** (9:16 e 4:5) em Criativo do
anúncio → Mídia → Carregar.

Dois bloqueios que não são meus de resolver:
- **Limite de gastos da conta quase atingido** — avisado no painel; sem resolver, a
  campanha não veicula mesmo publicada. É cobrança, só admin.
- **4 rascunhos pendentes** na conta compartilham o botão "Conferir e publicar" — conferir
  o que vai junto antes de publicar.

### Verificar o domínio fullpro.com.br (loja)
O `mediaclub.fullpro.com.br` já está Verified. O `fullpro.com.br` continua **Not Verified**
— isso degrada a atribuição no iOS dos anúncios da loja. Caminho: meta tag no `<head>` via
Breakdance Custom Code, ou TXT no DNS da GoDaddy. Fora do escopo do Media Club.

### Decidir sobre banner de consentimento (LGPD)
A landing não tem banner e o pixel dispara antes de qualquer opt-in. É o padrão do mercado
para página de captação com formulário, mas a decisão é do dono. Se ele quiser, o
`fpTrack` já é no-op por padrão — basta condicionar o init ao aceite.

### Auditoria mobile — telas que faltam olhar
Já tratadas: Projetos, Clips, Edição, Solicitações, Check-in, Integrações.

Projetos, Clips e Edição já receberam o pacote completo (filtro em seletor quando há
filtro, ações no menu "…", card compacto). **Solicitações ainda está no meio do caminho**
— tem o menu "…", mas não passou pelo aperto de card nem pelo filtro em seletor.

**Faltam ver em largura de celular:** Agenda (calendário), Influenciadores (5 tabelas e
abas), Metas, Debriefing, Usuários.

Estado medido: em viewport de 390×844, **nenhuma das 17 telas vaza a largura** e não há
rolagem horizontal na página. O que falta é avaliação de *layout* — densidade, ordem,
o que sobra e o que falta — não de vazamento.

### Preferências de notificações é uma tela vazia de propósito
A view `prefs-notificacoes` existe no menu do usuário e mostra um card **EM
BREVE**. Falta decidir o que entra: e-mail de solicitação nova, aviso de
emergencial na fila, resumo diário. Nenhum canal está ligado.

### O menu lateral pede ~880px de altura para caber inteiro
Com 22 módulos e 4 títulos de seção, abaixo de ~880px de janela a lista rola (em
860px faltam 27px; em 780px, 107px). Se incomodar em alguma tela, a saída é
reduzir a altura da linha — e **nos dois estados juntos**, senão os ícones
voltam a se mexer quando a barra abre no hover (ver `padroes.md`).

### Logo recolhida: a versão com ® está de fora
`assets/logo-short.png` é o "F" vermelho que o dono mandou. A variante dele traz
o ® ao lado, que a 32px vira borrão — trocar só se ele pedir.

### Ajuda e tutorial só existem nos módulos de foto
Falta escrever o verbete de Solicitações, Agenda, Check-in, Projetos, Edição,
Clips, Debriefing e das telas de Performance. O motor já está pronto: é
acrescentar a entrada em `FP_AJUDA` com `titulo`, `intro`, `itens` e `passos`.

---

## Segurança

### A sessão é o UUID do usuário, sem assinatura
`fp_session` no localStorage é apenas o `id` do operador. Quem tiver o UUID de um
administrador **entra como ele**. Não há assinatura nem validade.

Num painel interno o risco é contido, mas é o tipo de coisa que piora conforme a equipe
cresce. Correção real: token assinado com expiração, ou usar o Supabase Auth de verdade.

**O dono foi avisado três vezes e ainda não priorizou.** Não tratar sem ele pedir.

### `mc_fin_renames` e `mc_fin_rh` estão com RLS desligado
Qualquer pessoa com a anon key — que é pública, está no `config.js` — lê e escreve nessas
duas tabelas. São dados de pessoal e de renomeação financeira, o tipo de coisa que não
devia estar aberta.

Correção: `alter table … enable row level security` e políticas para `anon, authenticated`
como nas demais tabelas do painel (o painel não usa Supabase Auth — ver `padroes.md`).

**Levantado duas vezes, sem resposta do dono.** Ligar RLS sem política derruba a tela que
usa a tabela, então não fazer solto: é uma migração com teste na mesma sessão.

### Campos de senha fora de `<form>`
Gera três avisos no console (`Password field is not contained in a form`) e atrapalha o
gerenciador de senhas do navegador a oferecer preenchimento. Não quebra nada. Rápido de
arrumar.

---

## Dados

### Cinco projetos com "…" no título, salvos assim no banco
`cb 500…`, `pure sound cb500f + sprint cinza…`, `pure sound mt03 c/ Remap + pops and
bang…`, `troca de escapamento cb500f…`, `Video carburador…`

Não é corte de CSS — as reticências fazem parte do texto em `mc_projects.title`. O código
atual **não trunca títulos em lugar nenhum**, então é resíduo de algo antigo.

Aguardando o dono informar os nomes corretos. Não alterar dados sem isso.

---

## Não reproduzido

### Erro 400 no console
Apareceu num print do DevTools do dono (`xgaaocnuqgcwttrljqep_on&orde…`). As quatro
consultas de performance foram testadas e todas passam.

Para fechar: pegar a URL completa da requisição que falha, clicando nela no console.

---

## Dívida técnica conhecida

Nenhuma destas é urgente. Todas foram levantadas na auditoria e conscientemente adiadas.

### Consolidar os 12 breakpoints em 3
Hoje: 480, 560, 600, 720, 768, 900, 1000, 1200, 1400, 1600, 1920, 2000. Não é uma escala,
é uma coleção de valores adicionados conforme a necessidade.

Ganho é só de manutenção. Risco alto: exigiria testar as 17 telas em cada largura. Fazer
em sessão dedicada, tela por tela.

### Fatiar o `admin.html`
15 mil linhas, 1.001 `style=` inline, 262 `onclick=` inline, três gerações de código de
navegação empilhadas.

Foi essa sobreposição que fez o reset de scroll não funcionar — o roteador mais novo
clona os botões do menu e descarta os listeners dos antigos.

Caminho: extrair um módulo por tela, começando pelas que mais mudam (Projetos, Check-in).
É refatoração de dias, não item de checklist.

### As 31 views ficam montadas no DOM o tempo todo
~6 mil nós, 1,4 MB de HTML serializado, 18 `<h1>` simultâneos. Trocar de tela só alterna
`display`.

---

## Ideias levantadas e não pedidas

Não implementar sem o dono pedir.

- Botão "Atualizar fotos do Drive" na aba Integrações, para forçar `action=limpar` sem
  usar terminal (o cache do mapeamento dura 7 dias)
- Filtro de destino no computador também virar caixa suspensa, para as duas telas ficarem
  iguais — hoje é um bloco recolhível separado
