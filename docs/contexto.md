# Contexto e decisões

## O que é

Painel interno do **FullPro Media Club** — o estúdio de filmagem automotiva (motos) da
FullPro. Não é um produto para clientes: é a ferramenta de trabalho da equipe.

- **Landing pública:** `mediaclub.fullpro.com.br/` — onde o público pede agendamento
- **Painel:** `mediaclub.fullpro.com.br/admin` — onde a equipe trabalha

## Quem usa e onde

Isso decide quase toda escolha de interface:

- **No computador**, no escritório: planejamento, edição, acompanhamento de métricas.
  Tela grande, mouse, tempo para navegar.
- **No celular**, na garagem e no pátio: check-in e check-out de moto, conferir agenda.
  Tela pequena, uma mão, às vezes de luva, sinal fraco.

Operadores cadastrados em `mc_admin_users`, com permissão por módulo. Papéis vistos em
uso: Administrador, Filmmaker, Mecânico/Apresentador, **Fotógrafo** e **Assistente
Admin.** (esse último cuida das fotos, não do vídeo).

## Fluxo de trabalho que o painel cobre

```
Solicitação (landing)  →  Agenda  →  Check-in da moto  →  Projeto (roteiro, gravação)
                                                              ↓
                          Debriefing  ←  Publicação  ←  Edição  →  Check-out
                                              ↓
                                     Metas e bonificação
```

Módulos: Dashboard · Solicitações · Agenda · Check-in/Check-out · Projetos · Edição ·
Clips · Debriefing · Metas · Meus Posts · Influenciadores · Bonificação · Templates
WhatsApp · Exportar · Usuários · Manutenção · Atualizações · Integrações · Meu perfil.

Seção **Fotografia**: Panorama · Produção · Galeria · Separação · Fotografia em lote.

---

## Decisões do dono (Harry)

Ordem cronológica. **Estas não são suposições — foram ditas explicitamente.**

### O computador está bom; o problema é o celular
> *"Eu preciso que tu aplique essas alterações recentes somente em dispositivos móveis.
> Olha como tá ficando no pc. Eu quero que volte a versão do pc que tava excelente."*

**A regra mais importante do projeto.** Melhoria de interface entra por padrão só no
celular. Mexer no computador exige pedido explícito. Ver `padroes.md` → duas interfaces.

### Filtros
- Devem ser **caixa suspensa**, não fileira de chips (no celular)
- **Sem container** em volta — direto sobre o fundo da tela
- Ordem fixa: **status → destino → ordenar**, os três na mesma linha
- Rótulo curto ("Destino", não "Filtrar por destino") para os três caberem
- Estilo **nativo do iPhone**, não componente próprio

Consequência aceita: no celular o filtro virou escolha única, porque `<select multiple>`
não abre o seletor nativo do iOS. No computador segue múltipla escolha pelos chips.

### Ações das listagens
- Consolidadas num **menu "…"** por item — mas **só no celular**
- O "…" fica no **canto superior direito do card**, estreito (26px)
- O menu abre **a partir da posição do botão**, nunca como folha na base da tela
- No computador, os botões de ícone continuam à vista
- **Clicar em qualquer lugar da linha seleciona** — a caixa de 16px é alvo
  pequeno demais e o miss click era rotina
- A **barra de ações em massa sobrepõe** a listagem (nunca empurra), gruda no
  topo sem folga ao rolar e **fica sempre visível** no espaço dela

### Botão "novo" (+)
> *"quero que ele pareça mais com o sistema padrão do iphone, e não assim um quadrado
> azul com um + no centro"*

- Canto superior direito, na mesma linha do título
- **Glifo + em azul de sistema, sem caixa** — nada de quadrado preenchido
- Vale só no celular; no computador segue o botão azul

### Agenda = Solicitações + calendário
Fundidos em 27/08/2026, a pedido: *"podemos fundir o módulo Solicitações com Agenda…
as solicitações devem ir direto pra lá com a mesma funcionalidade"*. Eram dois módulos
sobre o mesmo dado.

- A tela é: métricas → **calendário + detalhes do dia em caixa branca** → a listagem de
  Solicitações inteira (abas, busca, oito colunas, detalhe, WhatsApp)
- O **contador de pendentes** ficou no item Agenda do menu: é o motivo de olhar a tela
- `requests` continua valendo como **apelido** de `calendar` (favoritos, aviso de entrada,
  listas de permissão) e implica acesso à Agenda para quem tinha o módulo antigo

### Sessão tem prazo (o auto login saiu)
> *"Sempre que o operador sair, ou depois de um determinado tempo, será necessário inserir
> as credenciais de login novamente"* (27/08/2026)

- **12h de inatividade** e **7 dias no máximo** desde o login
- Quem renova é toque de gente, não relógio — aba esquecida não se renova sozinha
- Sair pelo menu apaga na hora
- Recarregar **não** mostra mais a tela de login: a decisão é síncrona, antes de pintar

### A listagem de Solicitações
- Ordem padrão: **data de recebimento, da mais recente para a mais antiga**
- Na linha da tabela, só **Ver detalhes** e **WhatsApp** — mudanças de status acontecem
  dentro do detalhe. Cinco ícones na linha ficaram "meio bagunçado".
- O popup de detalhes é **largo, em duas colunas**, e a **rolagem fica só na lista de
  produtos compatíveis** — o resto do popup não rola
- Status **Stand by** além de Aprovada/Rejeitada:

> *"A intenção do stand by é não descartar uma solicitação, pode ser uma moto interessante
> que ainda não temos produtos em estoque para testar com ela, e aí essa solicitação fica
> mais fácil pra gente voltar a falar com esse cara futuramente"*

Ou seja: Stand by é fila de retomada, não é arquivo morto. Rejeitada continua sendo o
descarte.

### Agenda mostra o mês, não só o dia
> *"aqui na agenda vamos aplicar também o mesmo padrão que acabamos de aplicar em
> projetos e etc"* (27/08/2026)

- Métricas do mês em cima: **aprovados, pendentes, bloqueios e dias livres**
- Calendário + detalhes do dia, e abaixo a **agenda do mês em tabela** no formato padrão
- O recorte é o **mês que o calendário mostra** — navegar de mês redesenha a listagem
- **Bloqueio é linha da tabela**, com o motivo no lugar do nome: ele ocupa data igual a um
  agendamento
- "Dias livres" conta **dia útil**: sábado e domingo não entram porque a empresa não opera

### Edição tem abas de etapa
As métricas já falavam de "A publicar" e de "Total no pipeline" sem que houvesse jeito de
ver essas listas. Abas: **Em edição · A publicar · Todos** (todos = o pipeline).

### Projetos: status é escolha única
Os chips do computador eram múltipla escolha e o `<select>` do celular era escolha única —
a mesma tela com duas lógicas. Ficou a do celular. O **filtro de destino continua
múltiplo**, porque é outro eixo, e mora fora da barra de abas.

### Check-in / Check-out gira em torno da data
> *"quero que mostre somente o do dia"*

- Abas **Hoje** e **Outros** — não mais Entrada e Saída
- **Hoje**: motos do dia, com entrada e saída no mesmo card
- **Outros**: lista de datas passadas e futuras, para corrigir registro antigo ou
  adiantar o de outro dia (moto que chega à noite para gravar no dia seguinte)

### Capa de chuva tem cor e tamanho
- **Preto** ou **verde limão**; **P, M, G, GG, G2, G3**
- Só a capa tem variação — pastilhas e mochila não
- Escolhido na landing, junto do brinde; aparece em todo lugar onde o brinde aparece

### Brinde da saída
> *"Precisamos confirmar qual foi o brinde que ele ficou de fato."*

- O agendamento guarda só a **categoria**; a saída confirma o **produto do Bling**
- Campo obrigatório antes de salvar o check-out
- Busca por **nome ou SKU**, com miniatura, nome e **estoque atual** em cada opção
- **Trocar · Adicionar · Remover** — pode ter mais de um brinde, ou nenhum
- Salvar **baixa uma unidade** de cada brinde no estoque do Bling

### Alinhamento
> *"nunca deixar desalinhamentos como esse ocorrer novamente"*

Rótulo e valor centrados entre si. Ele revisa por print e enxerga diferença de poucos
pixels. Ver `padroes.md` → Alinhamento.

### Cards das listagens
- Devem ser o **mais compactos possível** — "otimizar espaço de tela" é pedido recorrente
- Informação organizada, não empilhada em linhas soltas
- **Título de projeto sempre em maiúsculas**
- Status **centralizado com o título**, com uma ou duas linhas

### Menu lateral
- Espaçamento entre itens deve ser **bem reduzido**, para economizar tela
- **O rodapé é um botão de usuário, no modelo do Airtable**: avatar (foto, ou
  iniciais sobre uma cor derivada do nome) abrindo um popover com Conta,
  Notificações, Linguagem, Tema e Sair. Nada de botões soltos empilhados.
- **`«` recolhe na hora** — não abre preferência nenhuma. Recolhida, a barra
  **abre no hover**; `»` fixa aberta.
- **Ícone não muda de lugar quando a barra abre.** Recolhida e expandida são a
  mesma caixa; o que aparece é o rótulo. Vale para o avatar e para o `»`, que só
  se muda de lugar no clique — nunca debaixo do cursor.
- **Tema claro é o padrão** para quem nunca escolheu.
- O preto da barra é `#151515` (sRGB 0,082), em `--bg-soft`. O fundo da página é
  outro e não acompanha.
- **O nome do cargo não aparece com a barra recolhida** — não cabe em 68px e
  saía cortado. O cargo já está no menu do usuário.

### Emergencial tem que piscar — recolhido também
Aberta, o que pisca é o número ao lado de "Produção"; recolhida, o número some e
quem pisca é **o próprio ícone do módulo** — na **cor neutra dos outros
módulos**, vermelho só no hover. Sempre um alarme só de cada vez, no mesmo ritmo
do triângulo da listagem. Zero emergenciais não mostra nada — contador
permanente aceso vira paisagem.

### Fotos de produto (Google Drive)
- A foto do **Drive tem prioridade** sobre a do Bling
- Clicar na foto **amplia ali mesmo** (lightbox), não abre o Drive
- A pasta é **privada**, lida por conta de serviço

### Nome de cliente na landing: primeiro nome e mais nada
> *"quero nome do cliente com \*\*\* no sobrenome, mostrando só o primeiro nome para
> proteger identidade"*

Vale para qualquer coisa pública que cite quem emprestou a moto. A máscara é feita **na
view do banco** (`mc_public_gravacoes`), não no JavaScript — assim o nome completo não
chega ao navegador nem pelo endpoint REST. Se um dia aparecer outro lugar público com
nome de cliente, o caminho é o mesmo: view com colunas mínimas, nunca `select` na
`mc_requests`.

Quantidade de asteriscos **igual ao número de letras** do sobrenome real — foi pedido
explícito: a máscara tem que parecer o nome da pessoa, não um `***` genérico.

### Seção FOTOGRAFIA (agosto/2026)
Segunda seção do menu, logo abaixo da primeira. Cinco módulos: **Panorama**, **Produção**
(fila com prioridade), **Galeria** (avaliação por estrelas), **Separação** (lotes) e
**Fotografia em lote** (envio direto para a pasta do SKU no Drive).

Decisões dele, ditas explicitamente:

- A fila é **a listagem inteira do Bling**, com opção de remover produto da listagem
- Produto novo entra como **PENDENTE**; qualquer operador com acesso ao módulo pode
  definir prioridade
- Prioridade 1/2/3 (azul, amarelo, laranja) e **nível 5 EMERGENCIAL** exclusivo,
  vermelho, que **sobrepõe qualquer outra** — slider todo preenchido e triângulo piscando
- **Avaliação de foto é exclusiva do admin**, 0 a 5, começando em 0 cinza; abaixo de 2
  interessa para refazer, e ao reavaliar aparece a nota anterior
- O fotógrafo sobe a foto **já no tamanho e formato certos** (limite de 350 KB) — o painel
  não redimensiona
- Emergenciais entram no lote escolhido pelo operador e o resto é rateado pela lógica
  percentual definida por ele

### Papéis novos: Fotógrafo e Assistente Admin.
O **Assistente Admin.** cuida das fotos, **não do vídeo** — mesmo com "Admin" no nome do
papel. Os dois papéis têm exatamente o mesmo escopo hoje: a seção de Fotografia,
Atualizações e o próprio perfil.

### Nome das seções do menu depende de quem olha
> *"Para administrador as seções devem ter nome de geral > VIDEO, fotografia > FOTOGRAFIA
> (…). Para não administradores a sessão VIDEO vira GERAL e FOTOGRAFIA vira GERAL."*

Administrador vê a casa dividida (VÍDEO · FOTOGRAFIA · PERFORMANCE · CONFIGURAÇÕES); quem
trabalha de um lado só vê **GERAL** e CONFIGURAÇÕES com o que lhe cabe. **Pós-produção
deixou de existir** e o Debriefing passou para a seção de vídeo. Dashboard fica no topo,
fora de qualquer seção.

### Permissão nunca aparece e depois desaparece
> *"de modo algum isso pode aparecer pra ele, nem por meio segundo que seja"*

Menu com módulo que o operador não pode acessar é vazamento, mesmo por meio segundo. O
painel só é revelado depois de filtrado. Ver `padroes.md` → filtrar antes de mostrar.

### Lista de separação em PDF público
O Slack ficou para depois (falta app e token). A lista sai em **PDF com link público** no
domínio do Media Club (`/lista/…`), com quantidade 1, nome, SKU e localização no estoque —
quem separa não tem conta no painel. As listas geradas **ficam salvas no módulo**; o dono
deu F5 e a lista tinha sumido.

### Tipografia: FullPro Sans em 100% do site
Reznik renomeada como **FullPro Sans**, uso interno e não comercial ("*pode dale irmão,
isso vai tá num uso interno e não comercial*"). Nenhuma outra família — muda peso e
tamanho, nunca a fonte. Bebas Neue saiu de todos os cabeçalhos.

### Container é "cara de IA"
> *"eu não quero CONTAINERS NESSA MERDA"*

Dito várias vezes, sobre filtros, listagens, popups e avisos: nada de caixa em volta,
nada de caixa dentro de caixa. Listagem encostada no fundo da página, separada por fios de
1px. Filtro em aba com sublinhado, não pílula preenchida. Vermelho de destaque é **o
mesmo vermelho do hover do menu lateral**, nunca um pastel.

### Panorama virou o painel de fotos do Dashboard
O Dashboard tem duas frentes. Quem tem vídeo **e** foto troca por um switch de
abas no topo e volta na frente usada por último; quem tem uma frente só não vê o
switch e cai direto no painel dela. A frente vem dos **módulos de trabalho**, não
do Dashboard, que os dois lados dividem.

### Na landing, quem manda a primeira mensagem é o cliente
> *"o cliente mesmo nos manda mensagem primeiro e assim evita de alguém querer se
> passar por nós"*

Nunca puxar conversa com o cliente a partir do número do estúdio: dezenas de
conversas iniciadas por nós fazem o WhatsApp derrubar a conta por spam. Depois de
enviar a solicitação, o cliente ganha um botão com a mensagem pronta (nome, moto
e data) para o **47 98849-7292** — número trocado a pedido do dono em
26/08/2026; o do estúdio (47 93384-0886) fica de reserva. O contato nascer do
lado dele também é o que
impede alguém de se passar pela gente — e a tela avisa isso.

O WhatsApp do rodapé (47 3466-6977) é o da **loja**, e continua como está.

### Tela que espera dado mostra a forma, nunca o vazio
> *"Se tiver dados para carregar coloca uma animação de loading no lugar do texto
> até carregar a informação"*

Área em branco enquanto a rede responde não é aceitável. A tela abre com a
estrutura montada e uma barra em animação no lugar exato de cada número.

### Primeira vez é da pessoa, não do navegador
Quem já viu cada tutorial fica em `mc_admin_users.tutoriais`. Um tour de
boas-vindas roda uma vez na vida, antes do tutorial da tela, e mostra menu,
preferências, Conta (onde se troca a senha padrão), o besouro e o `?`. Depois
disso tudo é opcional: o `?` reabre o tutorial da tela e o tour geral.

### Toda tela de foto explica a si mesma
O `?` flutuante traz as instruções da tela e um tutorial guiado que abre sozinho
na primeira visita de cada pessoa a cada módulo. Hoje cobre Dashboard de fotos,
Produção, Galeria, Separação e Fotografia em lote. Módulo sem verbete não mostra
o botão. Para forçar todo mundo a ver de novo (conteúdo mudou, tela mudou),
suba `FP_TUT_VERSAO` em `admin.html`.

### As cores de destaque são escolhidas no painel
Manutenção → Cores de destaque tem os dez realces (marca, hover, sucesso,
atenção, erro, destrutivo, as três prioridades e o amarelo) com seletor por
tema. Não converter paleta por script: se o dono quiser outra cor, ele troca
ali. Fundo, brancos, cinzas e o preto do texto **não** entram no seletor.

### Modo de trabalho
> *"pode fazer absolutamente tudo por conta, alterações, deploy, debugs e etc"*

Autorização permanente para editar, publicar e depurar sem pedir confirmação a cada
passo. **Continua valendo.** O que ele quer de volta é o resultado e o que mudou.

> *"vamos por etapas"*

Prefere entregas pequenas e verificáveis a uma reforma grande de uma vez. Ele testa no
celular real e manda print.

---

## Como o dono valida

Manda **print do iPhone**. É a fonte de verdade mais confiável do projeto — vários
problemas só apareceram assim (thumbnail vazia por rede lenta, cabeçalho de card
quebrado, filtros ocupando meia tela).

O Chrome do agente não desce abaixo de ~570px de largura de janela; para chegar a 390px
é preciso o modo dispositivo do DevTools. Ver `ambiente.md`.
