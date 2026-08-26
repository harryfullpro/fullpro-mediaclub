# Diário

## 26/08/2026 · A tela de entrar virou uma prancheta

> *"No modo claro quero a logo do media club em preto (…) quero uma animação de
> fundo com o gradiente se movendo e quero que se pareça com uma artboard de
> arquitetura no fundo, tipo aquelas blueprint"*

**A logo estava invisível no tema claro** e ninguém tinha reparado: o arquivo é
branco de um tom só (600×575, um único valor de pixel), e o card do tema claro é
branco. `filter: invert(1)` no claro resolve sem duplicar arquivo — o recorte
continua o mesmo, só o tom vira preto.

"Painel administrativo" virou **ADMIN**, a legenda saiu, e o cartão encolheu de
40px de recuo e 380 de largura para 26px e 340.

O fundo tem três camadas:

- **Papel milimetrado** — malha de 24px com a grossa de 120px por cima.
- **Desenho técnico** — círculo com eixos, cota com setas, retângulo com
  diagonais de construção e um arco com raio. Em SVG, `preserveAspectRatio`
  `slice`, tudo `aria-hidden`.
- **Dois brilhos** que passeiam em **40s e 52s**. Períodos primos entre si de
  propósito: sincronizados, o fundo repetiria o mesmo quadro enquanto alguém
  digita a senha.

Detalhes que valem registro:

- **Máscara radial nas duas camadas de fundo.** Grade que morre no corte da tela
  parece papel de parede; morrendo por dentro, parece folha sobre a mesa.
- **A grade sumia no escuro.** As linhas estavam em azul de nanquim nos dois
  temas — escuro sobre quase preto não existe. No escuro elas viram azul claro, e
  os brilhos caíram de .22/.16 para .13/.11, que era o que engolia a malha.
- **A compactação vai em `.login-card .login-input`, não em `.login-input`.**
  Essa classe é o campo de formulário do painel inteiro — perfil, usuários,
  bug, projetos. Mexer nela mudaria vinte telas de uma vez.

---

## 26/08/2026 · Dez ícones do menu trocados

O dono mandou uma referência por módulo. O que entrou:

| Módulo | Antes | Agora | Por quê |
|---|---|---|---|
| Check-in / Check-out | relógio | caixa marcada | era o terceiro relógio da barra |
| Projetos | livro aberto | duas folhas | o único ícone que não falava de arquivo, e Projetos é uma pilha deles |
| Edição | lápis | tira de filme com play e lápis | o lápis sozinho dizia só "editar" |
| Clips | rolo de filme | as duas mãos do Mercado Livre | é para onde os vídeos vão |
| Debriefing | balão com três pontos | balão com interrogação | era idêntico ao de Templates a 18px |
| Fotografia em lote | câmera | camadas empilhadas | a câmera repetia o assunto do bloco FOTOGRAFIA inteiro |
| Metas | relógio | alvo de três anéis | relógio fala de prazo, não de meta |
| Meus Posts | lápis | jornal | lápis diz "editar", não "publicação" |
| Templates WhatsApp | balão com linhas | a marca do WhatsApp | fone **preenchido**: em traço fino vira rabisco a 18px |
| Atualizações | relógio | nuvem com seta | o segundo relógio |
| Integrações | dois elos | núcleo com quatro pontas | elo diz "link", não "integração" |

**Três relógios e dois balões quase iguais** dividiam a mesma barra. Nenhum era
errado sozinho; juntos, metade da coluna era a mesma silhueta.

**A regra que saiu daqui: ícone se aprova a 18px, não no desenho grande.** Cada
candidato foi rasterizado num `<canvas>` de 18×18 e ampliado 12× sem suavização,
para ver o que o operador vê de verdade. O que reprovou assim:

- **Três losangos fechados** (a referência literal do ícone de camadas) viram
  massa: seis traços quase paralelos em 18px. Três camadas abertas leem limpo —
  mesma figura, metade dos traços.
- **O aperto de mão do Mercado Livre sozinho**, em duas tentativas. Mão tem
  curva demais: a 18px vira rabisco, e foi o pior ícone da barra. Uma etiqueta
  com play chegou a entrar no lugar — e o dono cortou: *"o icone do clips
  precisa ser a logotipo do mercado livre"*.

  A elipse da marca chegou a entrar em volta, para o olho reconhecer pela
  silhueta — e o dono cortou de novo: *"tira o circulo em volta do icone e deixa
  só as duas mãos se cumprimentando"*.

  **O que fez as mãos funcionarem sozinhas foi tamanho e peso.** Elas ocupam a
  caixa inteira (antes eram miúdas dentro da elipse) e vão a **2,4 de traço
  contra 1,8 do resto da barra**. O erro das duas primeiras tentativas não foi o
  assunto, foi a escala: desenho pequeno e fino no meio de um `viewBox` sobrando
  vira rabisco no tamanho real.

  Fica como método: **ícone que não lê raramente precisa de outro assunto —
  precisa de mais massa e menos inflexão.**
- **Duas bolhas no Debriefing.** Divididas em 18px, nenhuma das duas sobra espaço
  para a pergunta ser lida. Uma bolha só, com a interrogação grande.
- **A flecha do alvo em Metas.** Empurra o alvo para o canto e vira um risco
  atravessado. Alvo de três anéis, centrado.
- **O quinto nó das Integrações.** A referência tem nós de tamanhos diferentes;
  a 18px assimetria não lê como intenção, lê como desalinho.

**Marca colorida não entra na barra** (o amarelo e o azul do Mercado Livre, o
verde do WhatsApp): a coluna inteira é `currentColor` e um logo colorido seria o
único elemento que não acompanha o tema nem o estado ativo. **O que entra
preenchido** é o fone do WhatsApp, e por legibilidade: nesse tamanho, sólido lê
e traço fino não.

---

## 26/08/2026 · O rodapé da sidebar virou um botão de usuário

> *"vamos copiar esse modelo do airtable. Quero no lugar de todos os botões ali
> na parte inferior da sidebar expandidos para um botão que será o ícone do
> usuário (…) quero exatamente como está no exemplo do airtable"*

Cinco linhas soltas no rodapé (perfil, tema, landing, sair) viraram **um avatar**.
Sem foto, o painel gera iniciais sobre uma cor tirada do próprio nome — sempre a
mesma para a mesma pessoa, nunca sorteada a cada carregamento. Clicando, abre o
popover com nome e e-mail, Conta, Preferências de notificações, Preferências de
linguagem, Tema com chave estilo Apple, um fio e Sair.

O que só apareceu montando:

- **O menu não podia morar dentro da sidebar.** A barra tem `overflow: hidden`
  para os rótulos não vazarem quando recolhida — e cortava o popover pela
  metade. `fpUsrAbrir` move o menu para o `document.body` e o prende à
  viewport; ao fechar, volta para o lugar.
- **`.fp-usr-cab span` pegava o avatar junto**, porque o avatar também é um
  `span`. As iniciais renderizavam como um bloco cinza de 12px no canto. O
  seletor passou a ser `.fp-usr-id`.
- **Notificações abriu como tela em branco de propósito**: a view
  `prefs-notificacoes` existe, é registrada nas sete listas de sempre e mostra
  um card **EM BREVE**. Item de menu que não leva a lugar nenhum é pior que item
  que leva a uma tela honesta.
- **Tema claro virou o padrão** (`fp_theme`), como pedido. Quem já tinha
  escolhido escuro continua no escuro.
- **O "outro preto" da sidebar virou `#151515`** (sRGB 0,082) em `--bg-soft`. O
  fundo da página não mudou — só a barra e os elementos que a acompanham.

---

## 26/08/2026 · Recolhida e expandida passaram a ser a mesma caixa

> *"Preciso garantir que não va mudar a posição x nem y dos icones quando
> estiver recolhido e eu passar o mouse ativando o hover"*

O `«` recolhe direto (não abre mais preferências), o `»` expande, e por padrão a
barra recolhida **abre no hover**. Só que abrir no hover mexia em tudo: a versão
recolhida tinha recuo próprio, itens centrados e 24px de espaço no topo, então
os 22 ícones pulavam de lugar debaixo do cursor.

A correção foi apagar a geometria da versão recolhida inteira: os dois estados
usam **a mesma caixa**, e o que muda é só o rótulo aparecer. Medido em produção,
recolhida contra aberta:

| | recolhida | com hover |
|---|---|---|
| 1º ícone | x=35, y=68 | x=35, y=68 |
| 22º ícone | x=35, y=753 | x=35, y=753 |
| botão `»` | x=35, y=929 | x=35, y=929 |
| avatar | x=35, y=972 | x=35, y=972 |

Dois detalhes que só a medição pegou:

- **O avatar e o `»` estavam centrados na fileira do rodapé** e escorregavam de
  x=34 para x=130 quando a barra ia de 68 para 260px. `align-items: flex-start`
  os traz para a mesma coluna dos ícones.
- **O recuo vertical próprio do modo hover empurrava a lista 24px para baixo** e,
  com 22 módulos, o fim da lista saía da tela. Foi a zero.

Os 22 módulos cabem sem rolagem a partir de **~880px de altura de janela**; em
860px faltam 27px e em 780px faltam 107px. Abaixo disso a lista rola, que é o
comportamento correto — espremer 22 linhas e 4 títulos de seção numa janela
baixa custaria a altura de toque de todo mundo.

**O `»` não volta para o lado do avatar no hover**, só no clique. Botão que se
move sozinho debaixo do cursor é clique errado na certa.

### O emergencial recolhido: quem pisca é o ícone

> *"na versão recolhida da sidebar perdemos a animação de ficar piscando a
> notificação do produto emergencial. Pra resolver isso vamos fazer o próprio
> ícone do módulo ficar piscando"*

Com a barra fechada o número fica `display: none` — e o alarme sumia por
inteiro. Agora `fpFotoBadgePintar` marca o item com `.fp-nav-emerg` e o CSS
pisca **o ícone de Produção**, na mesma `fpPiscaEmerg` de 1,3s do triângulo da
listagem. Quando a barra abre, o ícone para e o número volta a ser o sinal:
dois alarmes ao mesmo tempo é ruído, não ênfase.

> *"esse icone precisa piscar na cor neutra dele igual todos os outros modulos,
> ele só fica vermelho no hover"*

**Pisca na cor neutra**, a mesma dos 21 vizinhos. Quem chama a atenção é o
movimento; vermelho fixo tirava o ícone da coluna e virava um segundo estado
"ativo". O vermelho volta no hover — exatamente o que o número já fazia.

Medido em produção: opacidade oscilando de 0,23 a 1,00 no ícone, igual ao
triângulo, com a cor em `rgb(161,161,170)` — a mesma do vizinho — e `#ff2d2d` no
hover. Com zero emergenciais a classe sai e nada pisca. Desligado junto com as
outras piscadas em `prefers-reduced-motion`.

**O cargo saiu da barra recolhida.** O `#roleBadge` tem 67px de texto e a barra
tem 68px: aparecia "ADMINIST" cortado na vertical. Some por `visibility`, nunca
por `display` — o vão continua reservado, senão o rodapé inteiro pula 28px no
instante em que o hover abre a barra, que é justo o que passamos o dia
consertando.

---

## 26/08/2026 · Barra de ações em massa: sobrepõe, gruda no topo e nunca some

> *"ao invés de abaixar o div das listagens, sobreponha o novo header de ações em
> massa na listagem"* … *"vamos fixar a barra de ações em lote para ficar sempre
> visível nesse espaço"*

Três pedidos que viraram uma coisa só. A barra deixou de empurrar a listagem
para baixo (a lista inteira dava um pulo a cada seleção), passou a **sobrepor**,
e agora ocupa um espaço reservado o tempo todo — cheia quando há seleção, com
"Nenhum selecionado" quando não há.

- **Ao rolar, ela encosta no topo sem folga.** O espaço de 8px que sobrava vinha
  de cascata: `.fp-lote-slot { top: -40px }` dentro do `@media (min-width:1600px)`
  perdia para a regra base, que vem depois no arquivo. Os dois passaram a sair do
  mesmo token, `--pad-topo`.
- **`[].every()` devolve `true`.** Com a barra sempre visível, seleção vazia
  fazia o botão destrutivo ler "Voltar para a listagem". Agora `n > 0 &&`.
- O `×` de remover virou a **lixeira** padrão, e "Definir prioridade" ficou
  centralizada e mais pesada.

**Clicar em qualquer lugar da linha marca o produto** — a caixa tem 16px de lado
e errar o alvo era o normal. Continuam respondendo por si o menu `…`, o slider
de prioridade e a miniatura. Shift+clique seleciona intervalo, e o
`preventDefault` no `mousedown` mata só o arrasto de seleção de texto, sem tirar
a cópia de um SKU.

---

## 26/08/2026 · Sincronizar catálogo: uma barra de progresso que não mente

> *"quero um loading mais gradual com animação de tempo real (…) pode até usar
> animação de piscando pra ficar bonitinho"*

"Lendo o Bling…" virou **Atualizando** em verde com barra de 0 a 100%, sem caixa
em volta, e a data e hora da última atualização logo abaixo.

O progresso tem **duas camadas**: `real`, que só anda quando uma etapa confirma,
e `mostrado`, que persegue o real com suavização e um creep lento enquanto
espera. O mostrado nunca passa 8 pontos à frente do real nem ultrapassa o teto
da etapa. Barra que salta de 10% para 90% e trava ensina o operador a não
confiar nela.

---

## 26/08/2026 · Acabamento das listagens

- **Galeria não recarrega tudo no "Mostrar mais".** Antes, mais 120 produtos
  repintavam as 1.311 miniaturas e a tela piscava inteira. Agora anexa só as
  novas.
- **Barra de ordenação na Galeria**, na ordem pedida: **Nome · Estoque ·
  Avaliação**, com Nome A-Z por padrão (`FP_GAL_ORDENS`).
- **Estado vazio com moldura**: contorno tracejado, cantos arredondados,
  opacidade reduzida e o aviso centrado com triângulo de exclamação. O triângulo
  original era torto de verdade — a inclinação esquerda corria 8,5 na horizontal
  contra 7,5 da direita, e o ápice ficava em 12,5 com a base em 12. Trocado por
  um caminho simétrico.
- **Métricas sem container**, no padrão de fios da casa, com o vão entre colunas
  saindo de `--fp-col-gap`.
- **O contorno do Tab** ficou em `--foco: var(--primary)`, 1px e **para dentro**
  (`inset`), que é o que o faz parecer fino sem sumir.

---

## 26/08/2026 · O menu "…" que morria ao trocar de aba

> *"as vezes ao trocar de tag lá na fila (…) o menu de ... fica inclicável"*

Bug intermitente, e por isso mesmo o mais caro. `fpMenuColetar()` varria o
registro `FP_MENUS` por `getElementById` **durante** a montagem da string de
HTML: as linhas ainda não estavam no DOM, o `getElementById` voltava `null` e a
varredura apagava os ids delas. Só disparava quando o mapa passava de 400
entradas — daí o "às vezes".

A varredura passou a ser adiada e a respeitar 30s de carência. E o caminho
silencioso agora escreve `console.warn`: bug que não deixa rastro no console
volta.

---

## 26/08/2026 · A Vercel segurou um commit por 11 minutos

Sem erro, sem build falhando: o commit subiu, a Vercel não publicou e a borda
continuou servindo o HTML de 20 minutos antes (`x-vercel-cache: HIT`, `age:
1263`). Um commit vazio soltou a fila em ~10 segundos.

Registrado porque o sintoma é indistinguível de "o código não funcionou".
**Antes de investigar um deploy que parece não ter surtido efeito, confirme que
ele saiu** — ver `pendencias.md`.

---

## 26/08/2026 · Na landing, quem abre a conversa é o cliente

> *"quero que o cliente nos envie uma mensagem para esse whatsapp confirmando o
> agendamento dele (…) Assim a gente evita do whatsapp cair de novo por spam.
> É melhor (…) porque melhora a segurança, o cliente mesmo nos manda mensagem
> primeiro e assim evita de alguém querer se passar por nós"*

Depois de enviar a solicitação, a tela de sucesso traz um botão verde com a
mensagem **já escrita**: nome, moto e data, dizendo que está confirmando o
pedido. O cliente só envia.

Duas razões, as duas do dono: o número do estúdio **não sobrevive** a dezenas de
conversas iniciadas por nós — o WhatsApp lê isso como spam e derruba a conta — e
uma conversa aberta do lado do cliente **é a prova de que o número é nosso**.
Ninguém se passa pela gente dentro de um contato que o próprio cliente iniciou.
A tela diz isso com todas as letras, junto do número.

Detalhes que valem registro:

- **A data é formatada na mão** (`iso.slice`), não com `new Date('2026-09-03')`:
  em fuso negativo isso volta um dia e a mensagem sairia com a data errada.
- **Verde com texto escuro.** Branco sobre `#1fd27a` dá 2:1 e reprova no AA;
  escuro dá 9,7:1. O verde do WhatsApp com texto branco é bonito na marca deles
  e ilegível na nossa régua.
- **O texto do topo do formulário mudou de lado.** Prometia que *nós* entraríamos
  em contato em 24h — agora diz que a confirmação é dele e que respondemos em 24h.
  Copy que contradiz o fluxo é pior que copy feia.
- O `fpTrack` de cliques já pega qualquer `a[href*="wa.me"]`, então a conversão
  `Contact` do Meta passou a contar a confirmação sem uma linha a mais.

**O WhatsApp do rodapé continua o da loja** (47 3466-6977). O do estúdio, que
responde a confirmação, é o 47 93384-0886.

---

## 26/08/2026 · Panorama vira o painel de fotos do Dashboard

O módulo Panorama saiu do menu e o conteúdo dele passou para dentro do próprio
Dashboard, que agora tem duas frentes. Switch de abas para quem tem vídeo e
foto; quem tem uma frente só nem vê o switch.

- **A frente é deduzida dos módulos de trabalho** (`fpFrentes()`), nunca do
  Dashboard, que os dois lados dividem, e nunca da visibilidade das seções do
  menu — a seção de vídeo aparece para quem só tem Debriefing.
- **A escolha é lembrada por navegador e cruzada com a permissão.** A chave não
  carrega o id do operador: sem o cruzamento, o fotógrafo herdaria "vídeo" de
  quem usou a mesma máquina. Testado nos dois sentidos.
- **Mover o conteúdo para dentro da view, em vez de alternar duas views.**
  Existem quatro laços de "esconde tudo" que o switch não controla; com duas
  views, ir a Projetos e voltar apagaria o painel de foto sem caminho de volta —
  e em silêncio.
- **O repintor de fotos passou a decidir pela tela à vista, não pela hash.** Um
  favorito antigo em `#foto-dashboard` faria cada clique de prioridade repintar a
  Produção escondida: nada muda na tela, nada aparece no console.

### O que a revisão adversarial pegou depois

Quatro achados de nove sobreviveram à refutação, e eram dois defeitos:

1. **O Panorama era construído duas vezes por login.** `applyRolePermissions`
   roda duas vezes (é a regra do "filtrar antes de mostrar") e cada passada
   chegava em `fpDashTrocar`. Agora a aplicação automática só pinta se a tela
   estiver vazia; o clique do operador continua atualizando.
2. **O painel de vídeo nunca recarregava.** `refreshViewData` passou a carregar
   só a frente à vista — certo — mas **trocar de aba não é navegar**: quem
   entrava de manhã na frente de foto via, à tarde, os números da hora do login.

### O painel de fotos abre na hora

O panorama esperava **duas rodadas de rede em série** — o catálogo inteiro
(2.566 linhas em três páginas) e só então três consultas — antes de pintar
qualquer coisa. 1,7s de área vazia para mostrar quatro números.

- **Uma chamada só:** `mc_photo_panorama(início do mês)` conta no banco e devolve
  contagens, fila, os oito com mais estoque parado, lotes em aberto e as últimas
  fotos. As contas foram conferidas uma a uma contra as da tela antes de trocar.
- **Esqueleto em duas passadas:** a primeira é síncrona e pinta a forma certa com
  `.fp-skel-txt` (variante em linha do esqueleto que já existia) no lugar de cada
  número. Medido: **0,9ms** para a tela abrir, **212ms** para o dado real, e
  **zero esqueleto** ao reabrir.
- **O catálogo vai depois da pintura, não junto.** Rodando em paralelo, as três
  páginas dividiam banda com a chamada do painel e empurravam o número que o
  operador espera de 0,3s para 1,6s. Medido nas duas ordens.
- **`fpPrioDefinir` carrega o catálogo sob demanda.** A lista do Dashboard vem
  direto do banco; se o clique de prioridade chegasse antes do catálogo, a função
  saía calada.

---

## 26/08/2026 · O menu não podia nascer errado

> *"Quando eu entro como matheus no painel, no menu lateral aparece todos os módulos e
> depois de meio segundo atualiza para só os que ele tem permissão. De modo algum isso
> pode aparecer pra ele, nem por meio segundo que seja."*

A filtragem de permissão era a **última** coisa de `initApp()` — depois de umas quinze
requisições (`loadRequests`, `loadUsers`, `loadProjects`, `loadUpdates`…). E o painel já
tinha sido revelado antes de tudo isso. Resultado: quem tem acesso parcial via os
**24 itens** do menu, com Usuários, Integrações e Manutenção à mostra, até a filtragem
chegar.

O conserto não é adiantar um pedaço da filtragem: é inverter a ordem. Nasceu
`fpRevelarPainel()`, que filtra **enquanto `#app` ainda está `display:none`** e só depois
revela. As duas camadas (papel + módulos do usuário) só precisam de `CURRENT_USER`, que
já está em mãos no login e no `checkAuth()` — nada ali depende de dado carregado.

Os dois únicos lugares que mostravam o painel passaram a chamar essa função. Como filtrar
e revelar acontecem na **mesma tarefa síncrona**, o navegador não tem onde pintar o estado
cru — não é uma corrida ganha por pouco, é uma corrida que deixou de existir.

Trava de segurança por cima: `.sidebar-nav` nasce com `visibility:hidden` e só ganha
visibilidade com a classe `fp-menu-filtrado`, posta pela própria `fpRevelarPainel()`. Se
um dia a filtragem estourar no meio, o menu **não aparece** em vez de aparecer inteiro. O
**rodapé fica fora da trava** de propósito: tema, landing e Sair continuam alcançáveis
num painel quebrado.

Efeito colateral que precisou de cuidado: `applyRolePermissions()` agora roda duas vezes
por sessão (antes de revelar e no fim do `initApp`, que redesenha as telas de Performance).
O aviso de "somente leitura" era criado sem dedupe e duplicaria — ganhou
`data-fp-somente-leitura` e remoção do anterior.

Medido em produção, com a sessão do Matheus: 24 itens no estado cru → filtragem com
`app=none` → revelação com a trava aberta e **8 itens** visíveis. Administrador continua
com os 24 e as quatro seções.

---

## 26/08/2026 · Seções do menu com nome por papel

> *"Para administrador as seções devem ter nome de geral > VIDEO, fotografia >
> FOTOGRAFIA (…). Para não administradores a sessão VIDEO vira GERAL e FOTOGRAFIA vira
> GERAL."*

O administrador vê a casa dividida, porque para ele são duas operações. Quem trabalha só
de um lado não tem por que enxergar a divisão: a única seção que aparece se chama
**GERAL**. Pós-produção deixou de existir e o **Debriefing** foi para a seção de vídeo.

Três coisas que o pedido não previa e apareceram na implementação:

- **O Dashboard morava dentro da seção VÍDEO.** Isso fazia o Assistente ver *duas*
  seções — "VÍDEO" com o Dashboard sozinho e "FOTOGRAFIA" — em vez do GERAL único. Saiu
  de todas as seções e foi para o topo, sem cabeçalho.
- **O teste do papel `assistente` tem que vir antes do de administrador**, porque o nome
  do papel é "Assistente Admin." e contém a palavra *admin*. Na ordem ingênua, ele entrava
  como administrador de verdade.
- **`modules` em branco bloqueia quem não é administrador.** O papel novo foi criado sem
  módulos e, para não-admin, `fpAllowedSet()` devolve só `FP_ALWAYS_ON` — o Matheus não
  veria nada além do próprio perfil. O José Gustavo (Fotógrafo) estava no mesmo buraco,
  preso em `["dashboard"]` de antes da seção existir. Os dois receberam a seção de
  Fotografia inteira.

Regra que ficou: se um dia um não-administrador tiver acesso aos dois lados, os nomes
específicos voltam **para essa pessoa**. Duas seções chamadas GERAL, uma embaixo da outra,
seriam piores que a divisão que estamos escondendo.

Verificado simulando os quatro papéis em produção.

---

## 26/08/2026 · A fonte do site inteiro virou FullPro Sans

Reznik, renomeada. 18 arquivos `.woff2` em `assets/fonts/` (pesos 200–950 + itálicos),
uso interno e não comercial, autorizado pelo dono. Google Fonts saiu do `<head>` das duas
páginas.

**Duas armadilhas, as duas custaram uma rodada:**

1. **`url('assets/fonts/…')` não carrega nada.** O caminho relativo resolve contra a URL
   da página, e o painel é servido em `/admin` (`cleanUrls`) — o navegador pedia
   `/admin/assets/fonts/…`. Sem erro visível: a fonte simplesmente não trocava e o
   fallback assumia. Todo `src` de `@font-face` usa **caminho absoluto** (`/assets/…`).
2. **Bebas Neue não tem minúsculas.** Ela estava *fazendo o papel* de `text-transform:
   uppercase` em 30 regras. Trocar a família revelou textos que sempre foram em caixa
   mista — "Painel administrativo" no lugar de "PAINEL ADMINISTRATIVO". Cada uma das 30
   regras ganhou `text-transform: uppercase` explícito e `font-weight: 800`, porque Bebas
   é condensada de peso único e a FullPro Sans no peso normal ficava magra no lugar dela.

---

## 26/08/2026 · Filtros e busca, e duas colisões de nome no mesmo dia

> *"vamos mudar o formato desses filtros por tags para um modelo mais moderno sem esse
> fundo container que é muito cara de ia (…) e também quero que funcione a busca, porque
> eu digito ali mas o enter não funciona"*

Pílula preenchida virou **aba com sublinhado de 3px** e contagem por aba; a busca ganhou
lupa, Enter, Esc e botão de limpar. Duas correções depois do primeiro corte:

- O primeiro resultado ficou **apagado demais** ("sem nenhum destaque"). Rótulo subiu para
  14px/700 e a aba ativa ganhou contagem em destaque.
- A pílula voltava **só no tema claro**: o tema claro redeclara `.filter-btn.active` com
  fundo azul e texto branco, muito depois da minha regra. Sobrou também um
  `.active:hover` azul e uma regra de celular que forçava 12px em qualquer largura.

**As duas colisões:**

- **`fpProdBuscar` já existia** — é a busca de produto do kit do Magis5. A declaração
  posterior venceu, então o campo de busca da Fotografia chamava a função do Magis5, que
  procura `#prodRes` (inexistente) e **retorna calada, sem erro no console**. Virou
  `fpProdBuscarFila`.
- **`.fp-busca` já existia** — é a busca de Solicitações. Minhas regras vinham *antes* no
  arquivo e perdiam. Em vez de renomear, reescrevi o componente existente (agora os dois
  usam o mesmo). No meio da reescrita perdi `fill:none; stroke:currentColor` e a lupa
  virou um borrão preto sobre preto — achado medindo, não olhando.

Lição que virou padrão: **antes de criar função ou classe, procure o nome no arquivo.**

---

## 26/08/2026 · Acabamento da seção FOTOGRAFIA

Pedidos pequenos do dono, todos aplicados:

- **Extremidades laterais alinhadas** — cabeçalho, filtros, listagem e rodapé passam a
  compartilhar a mesma margem lateral. Elemento que "quase" alinha é pior que elemento
  claramente destacado.
- **Barra de composição do lote** — abaixo de "15 selecionados", uma barra preenchida por
  cor conforme a mistura de prioridades. O texto voltou a dizer só a contagem.
- **Coluna de prioridade que se mede sozinha** — a largura vem do rótulo mais comprido em
  tela (`Range.getClientRects()`), com 78px de piso. Sem isso, "EMERGENCIAL" empurrava a
  coluna e os outros rótulos ficavam soltos da extremidade direita.
- **As listas em PDF ficam salvas no módulo de Separação** — o dono deu F5 e a lista sumiu.
  Agora cada geração é registrada e o histórico aparece na tela.
- **O PDF sai no domínio do Media Club** (`/lista/…`), por *rewrite* no `vercel.json` para
  o Storage do Supabase, em vez do link comprido e aleatório do balde.

---

## 26/08/2026 · Separação vira PDF público, e o que o Bling não conta

O Slack dependia de app e token que não existem. A lista de separação passou a
virar **PDF com link público** — manda-se só o link para quem separa.

### A localização do estoque só existe no detalhe

`estoque.localizacao` (`"M1 (5, C)"`, `"PP"`, `"C3 (2, B) 1"`) **não vem na
listagem** de produtos do Bling, só em `GET /produtos/{id}`. Buscar para os 2.566
produtos levaria quase uma hora, então é sob demanda — só os itens do lote — e
fica guardada em `mc_photo_products.localizacao`.

### Duas armadilhas que custaram uma rodada cada

**1. O Bling limita a ~3 chamadas por segundo.** Disparei cinco de uma vez e
voltou **429 em oito dos dez** produtos. Pior: o erro caía no `catch` e era
gravado como localização vazia — o produto ficaria "sem localização" para sempre.
Agora as chamadas são espaçadas por um relógio compartilhado (~2,8/s), o erro é
repetido três vezes, e **nada é gravado quando a chamada falha**. Vazio no banco
significa "perguntei e não tem", nunca "não consegui perguntar".

**2. O `finally` apagava o próprio resultado.** Depois de gerar, a tela é
redesenhada para tirar do lote os produtos que saíram da fila — e o redesenho
reconstruía o rodapé inteiro, inclusive o container onde o link tinha acabado de
ser escrito. O PDF era gerado, publicado e registrado; só não chegava aos olhos
do operador. O link agora vive fora do render.

### PDF escrito à mão

Sem biblioteca: o painel não carrega script de terceiro e um PDF só de texto são
meia dúzia de objetos. Helvetica é fonte base (não precisa embarcar) e WinAnsi
cobre o português — **com a tabela de 0x80–0x9F**, senão travessão e aspas curvas
viram byte perdido. Emergencial sai em negrito.

Validado fora do navegador antes de subir: 46 itens → 2 páginas, reconhecido como
PDF 1.4 válido, e a renderização confere acento, quebra de página e numeração.

### Armazenamento

Balde `storage/separacao`, **público por necessidade** — quem separa não tem conta
no painel. Teto de 5 MB e só `application/pdf`. Políticas de SELECT e INSERT para
`anon`; **sem DELETE**, e isso foi confirmado na prática: o `remove()` do cliente
**responde sucesso mesmo quando o RLS bloqueia** — a resposta traz os nomes
pedidos, não os apagados. Conferir listando de novo.

**Pendência:** os PDFs se acumulam sem limpeza automática.

---


## 25/08/2026 · Seção FOTOGRAFIA e o aviso de entrada no dialeto do debriefing

### O aviso ficou mais largo e ganhou régua técnica

Pedido do dono: mais largo, com **nome para cada nota** e **patch numerado do dia**, e
o visual do debriefing — "sem esses containers e blocos parecendo muito site de ia".

- 520 → **680px**.
- A pilha de caixinhas dentro da caixa virou **uma superfície só com fios de 1px**.
  Caixa dentro de caixa é o que mais entrega interface montada por template.
- `mc_updates` ganhou `nome` (kebab-case) e `patch` (inteiro). As notas do mesmo dia
  dividem o patch; o código da nota é `patch.posição` (`004.2`).
- **O patch é atribuído por gatilho no banco.** Quem cadastra não deve lembrar do número
  e duas abas abertas escolheriam o mesmo. Nota de um dia que já tem patch herda.
- **O código é calculado sobre o patch inteiro, não sobre o filtrado.** No popup só
  aparecem as não vistas; numerar em cima do que sobrou daria código diferente a cada
  abertura.

### A seção FOTOGRAFIA

Cinco telas (Panorama, Produção, Galeria, Separação, Fotografia em lote), a segunda seção
do menu. Quatro tabelas novas, três edge functions, e o papel **Fotógrafo**, que não
existia para o sistema de permissões — qualquer papel desconhecido caía em `viewer`, o
mais restrito. O fotógrafo estava no papel mais fechado do painel por acidente de
nomenclatura.

**Números reais da primeira sincronização:** 2.575 produtos lidos do Bling em 26 páginas
(o painel lia no máximo 2.000 e truncava ~575), 5.524 pastas no Drive, **1.311 produtos
com foto** e **1.255 sem** — destes, 639 com estoque. E 4.211 pastas do Drive sem produto
correspondente no Bling, resíduo de SKUs antigos.

### Três defeitos que a revisão adversarial pegou

1. **A varredura do Drive devolvia `nextPageToken`; o sincronizador lia `proximo`.**
   Sempre vazio → parava na primeira página de 1.000 → gravava `tem_foto: false` em cima
   de ~4.500 SKUs e reportava sucesso.
2. **`nome text not null`** em `mc_photo_products`. A varredura do Drive faz upsert só com
   `{sku, tem_foto, folder, checado_em}`, e o Postgres valida NOT NULL na linha proposta
   **antes** de resolver o conflito — o lote de 500 morreria inteiro, sempre.
3. **Índice de busca com `coalesce(nome,'')`.** O PostgREST monta `to_tsvector('portuguese', nome)`
   sem o coalesce: expressão diferente, índice nunca usado, varredura completa silenciosa.

### Verificado de verdade

- Upload no Drive **testado contra o Drive real** depois da conta de serviço virar
  administradora de conteúdo: pasta criada, `ZZ-TESTE-UPLOAD-CLAUDE-1.jpg`, segundo envio
  virou `-2` reusando a pasta. **A pasta de teste ficou no Drive e precisa ser apagada.**
- `drive-proxy` v7 comparado antes/depois: `status`, `map` e `img` byte a byte idênticos
  (os mesmos 15.273 bytes na miniatura).
- `prioridade = 4` recusada pelo banco; `5` e `null` aceitas.
- Popup: 680px, fios de 1px, código/nome/tipo com **0px** de diferença entre centros,
  375px sem vazamento, dois temas.

### Pegadinha nova

`.action-btn` é a classe de botão deste painel. **`.btn`, `.btn primary` e `.btn ghost`
não existem** — botão com essas classes nasce sem estilo, 19px de altura e padding zero.

---


## 25/08/2026 · Aviso de entrada e módulo Atualizações do site

**O pedido.** Um popup ao entrar no painel ou recarregar, com as solicitações
pendentes para quem tem acesso a elas (menos o admin), as menções do debriefing e
um resumo das novidades do sistema. Mais um módulo onde esse histórico fica.

**A decisão que mudou o desenho: substituir, não somar.** Já existia um popup no
login — o de menções, uma barra colada na base da tela que reaparecia a cada troca
de módulo. Dois avisos disputando o mesmo canto terminam com o operador fechando
os dois sem ler nenhum. O novo aviso engoliu o antigo; `showMentionPopup`,
`hideMentionPopup`, `dismissMentionPopup`, `openMentionsNow` e
`maybeShowMentionPopup` viraram fachadas finas para não quebrar quem os chamava.

**"Não viu de fato" significa coisa diferente por assunto:**

| Assunto | Como se sabe que já foi visto |
|---|---|
| Menção no debriefing | `mc_notifications.read`, que já existia |
| Solicitação pendente | `prefs.avisos.requests_ate` — só conta o que chegou depois |
| Relato de bug (admin) | `prefs.avisos.bugs_ate` |
| Novidade do painel | `prefs.avisos.updates_vistos`, lista de ids |

`prefs` é **coluna jsonb em `mc_admin_users`**, não tabela nova: `checkAuth()` já faz
`select('*')`, então o valor chega dentro de `CURRENT_USER` sem uma consulta a mais —
e a leitura dessa tabela já foi gargalo antes.

**Regras de exibição:** admin não recebe aviso de solicitação (ele vive nessa tela);
só admin recebe aviso de relato de bug. Menção e solicitação são trabalho pendente e
só somem quando a pessoa passa pela tela; novidade e relato são informação e o
"Entendi" já carimba.

**Abre uma vez por carregamento de página, nunca ao voltar o foco da aba.** O antigo
recarregava e reabria em `focus` e `visibilitychange`; com um modal no centro da tela
isso reapareceria a cada alt-tab. Agora foco só atualiza os contadores.

**Duas correções no caminho:**

1. `class="btn primary"` / `btn ghost` **não existem neste painel** — a classe é
   `.action-btn` (`.approve`, `.reject`, `.view`, `.danger`). Os botões nasceram sem
   estilo nenhum, com 19px de altura e padding zero. Antes de usar uma classe de
   botão, procure a declaração dela no `<style>`.
2. `fpAvisoIr` gravava `requests_ate` numa chamada e o resto noutra. **Duas escritas
   na mesma linha de `mc_admin_users` podem chegar fora de ordem** e a segunda apagaria
   o que a primeira gravou. Virou um patch só.

**De passagem:** `'manutencao'` entrou nas três listas de views que o módulo do besouro
tinha esquecido (`admin.html` tem sete listas de views, herança de três gerações de
roteador). Era por isso que Manutenção continuava visível por baixo do detalhe de projeto.

**Medido no navegador:** selo e data do rodapé da novidade com **0px** de diferença entre
centros; 375px sem rolagem horizontal; os dois temas conferidos. Commit `815d97a`,
no ar em produção.

**Tabelas:** `mc_updates` (changelog) e a coluna `mc_admin_users.prefs`. O DDL completo,
com a seção de Fotografia, está em `supabase/schema-fotografia.sql`.

---


Registro do que foi feito e por quê. Mais recente primeiro.

---

## 20/08/2026 — Os avisos do sistema perderam a tarja colorida

O dono já tinha proibido **barra colorida à esquerda** em caixa de aviso — "cara de site
de IA mal feito" — e o toast do painel estava exatamente assim: `border-left: 3px` na cor
do estado. Refeito:

- **A cor saiu da borda e foi para o ícone**, dentro de um selo arredondado de 24px com o
  tom do estado a 16-18% de opacidade. O aviso inteiro tem uma borda só, uniforme.
- **A caixa encolhe até o tamanho do texto** (`width: fit-content`). Antes esticava até
  390px sempre — três palavras dentro de uma caixa larga é o que mais entrega template
  pronto. "Bug reportado. Obrigado!" agora ocupa 240px.
- **O "x" só aparece no hover** — aviso que some sozinho em 4s não precisa de botão de
  fechar à mostra. Fica sempre visível quando o aviso é fixo, tem ação, ou no celular
  (onde não existe hover). O espaço dele é reservado, então nada pula de lugar.
- **Relevo em vez de tarja:** um branco de 5% por cima do fundo e sombra mais funda.
- **Sombra própria para o tema claro** — preto pesado de tema escuro suja o claro; lá o
  relevo vem de branco sobre o fundo e uma sombra suave.
- **O popup de menção tinha a mesma tarja** (rosa, 3px à esquerda). Saiu junto.

Dois defeitos apareceram no caminho: `.fp-toast-erro` usava `var(--perigo)`, que **não
existe** (o token é `--danger`), então o aviso de erro ficava com a barra cinza padrão; e
a duração era calculada depois do botão de fechar ser criado, o que impedia saber ali se o
aviso era fixo.

**Ainda com tarja, fora do escopo de hoje:** os quatro cartões de KPI do módulo de Envios
(`border-left: 3px`). Se for para limpar, é o mesmo tratamento.

## 20/08/2026 — Botão do besouro e o módulo Manutenção

Qualquer pessoa da equipe agora reporta bug ou melhoria de dentro do painel, e o relato cai
numa fila que só o dono vê.

**O botão fica acima dos modais de propósito** (`z-index` 100050 contra 100 dos modais).
Bug encontrado dentro de um popup precisa poder ser reportado **sem fechar o popup** —
fechar perde o contexto, e o contexto é justamente o que costuma faltar num relato.
Discreto por padrão (55% de opacidade), acende no hover. Atalho: **B**.

**O relato leva o contexto capturado no clique:** tela aberta, qual popup estava por cima,
URL, tamanho da janela, tema, navegador e quem reportou. É o que evita o vaivém de "onde
exatamente isso aconteceu?". Print opcional, redimensionado para 1280px e JPEG 72% no
próprio navegador — a coluna é texto, não bucket.

**O módulo Manutenção** (só para admin; quem reporta usa o besouro) tem os quatro
contadores, filtro por status e cartões com o relato, o contexto e as ações: *estou
resolvendo*, *resolvido*, *descartar*, *reabrir* e apagar. O filtro padrão é **A resolver**
(aberto + em andamento) — abrir na lista completa faria o dono varrer relatos já fechados.

**A notificação é a mesma dos agendamentos:** contador no item do menu, que **desaparece
quando não há nada aberto** em vez de mostrar um zero em cor de alarme.

**A tabela nasceu com RLS só para `authenticated` e não funcionou.** O primeiro relato de
teste voltou com *"new row violates row-level security policy"*. Motivo: **o painel não usa
Supabase Auth.** O login é `select` em `mc_admin_users` comparando hash de senha, e o
cliente Supabase segue **anônimo** do começo ao fim — por isso todas as tabelas antigas
liberam `anon`. Política para `authenticated` bloqueia o painel inteiro. Corrigido para
`anon, authenticated`, testado com `set local role anon` e depois pelo fluxo real da tela.

**O mesmo engano estava no `magis5-proxy`**, esperando para explodir: eu exigia
`role = 'authenticated'` no token, o que rejeitaria todo chamado do painel assim que a
chave do Magis5 fosse configurada. Trocado por uma checagem que faz sentido nesse modelo:
o painel manda o id de `fp_session` e a function confere em `mc_admin_users` com a service
role. Não é criptografia — é um UUID que só quem logou tem — mas fecha a porta que o
`verify_jwt` sozinho deixava aberta (a anon key é pública no `config.js`). Testado: sem
sessão → 401, sessão inventada → 401, sessão real → passa.

**Uma pegadinha do arquivo:** o `admin.html` tem **dois** `<body>` — o real e o do modelo
de etiqueta de transporte, que é gerado como HTML completo para impressão. A classe que
esconde o botão na tela de login foi para o body errado na primeira tentativa e o botão
aparecia antes do login. Ao mexer em `<body>` ou `</style>` por script, confirme qual dos
dois você pegou.

## 20/08/2026 — Foto de produto: carregando, com foto, sem foto

Toda listagem de produto montava a sua própria caixa de foto — brinde, produto compatível
e clip, três marcações diferentes — e nenhuma dizia em que pé a imagem estava. Pior: "sem
foto" usava o **mesmo ícone de caixa** que ilustra "produto", então não havia como saber se
a foto ainda vinha ou se não existia.

Agora existe uma caixa só, `fpFotoProdutoHtml(sku, url, tamanho, raio)`, com o estado numa
classe: **rodinha girando** enquanto a foto vem, **a imagem** quando carrega, **câmera
cortada** quando não há foto. As três listagens passaram a usar ela.

- **`loading="eager"` de propósito nas miniaturas.** O observador de ergonomia marca
  `lazy` em toda imagem injetada, e com lazy uma miniatura fora da tela **nunca começa a
  carregar** — a caixa ficaria girando sem nem ter tentado. São 32-46px e são o conteúdo
  do cartão. Vale também para a imagem do Drive, criada por JS (`img.loading = 'eager'`,
  senão o observador marca lazy).
- **O Drive agora responde "não tem".** `fpDriveAplicar` só saía calado quando o SKU não
  tinha pasta; quem não recebeu foto do Bling ficava girando para sempre. Agora marca
  "sem foto" — e se a imagem do Bling chegar depois, `fpFotoOk` desfaz.
- **Rede lenta não deixa rodinha eterna:** uma varredura 8s depois do último cartão
  desenhado converte o que sobrou em "sem foto". Se a imagem chegar mais tarde, ela volta.

Testado com os cinco casos: foto boa, URL quebrada sem SKU (vira "sem foto" na hora), URL
quebrada com SKU (espera o Drive), sem nada (já nasce "sem foto") e só SKU (espera).

## 20/08/2026 — A busca de compatíveis não achava a Duke 390

Depois de mostrar o produto zerado, a KTM 390 Duke continuou dando "nenhum produto
compatível" — e dessa vez não era estoque, era o casamento de nome.

**A causa:** o catálogo de motos chama o modelo de **"390 Duke"** e a loja cadastra o
produto como **"Retificador KTM Duke 390 (17-21)"**. O algoritmo comparava os nomes
*grudados* — procurava `390duke` dentro de `retificadorktmduke390` — e a ordem invertida
das palavras fazia todo produto da Duke ficar de fora. O mesmo valia para qualquer moto em
que a loja escreve o número antes do nome.

**Agora o casamento é por conjunto de palavras:** toda palavra do modelo precisa aparecer
no nome do produto, **em qualquer ordem**. `390` + `duke` acha `Duke 390` e `390 Duke`.

- **Palavra de uma letra não conta como exigência** — o "R" de "R 1250 GS" casaria com
  qualquer nome. Ela entra só no desempate.
- **Só as palavras do nome do modelo, nunca as do slug.** Juntar as duas listas tornava a
  exigência impossível: "1290 Super Duke R" tem slug `1290SUPERDUKER`, que vira a palavra
  `superduker` — e nenhum produto se chama assim (a loja cadastra "Superduke 1290").
- **A montadora deixou de ser filtro rígido.** Produto que cita **outra** montadora sai;
  produto sem montadora nenhuma no nome fica, porque parte do cadastro só escreve o
  modelo.
- **Ordenação:** com estoque primeiro, depois quem bate o ano, depois quem escreve o
  modelo grudado (costuma ser o produto do modelo, não um multiaplicação).

**Verificado com nomes reais de produto num teste em Node**, com o catálogo de motos de
verdade: KTM 390 Duke → **5 produtos** (era 0, e são exatamente os 5 que a loja lista para
DUKE 390), Duke 200 → 3 sem contaminar a 390, Super Duke 1290 → 2, R 1250 GS → 2 (inclui o
pisca multiaplicação), CG 160 → 2, MT 03 → 1 sem trazer a MT 07.

> A fonte de produto do painel **é e continua sendo só o Bling** (`blingGetAllProducts`
> via `bling-proxy`). A vitrine da loja foi usada apenas para *ler como os produtos são
> nomeados* e montar a amostra do teste — nada no painel consulta o site.

## 20/08/2026 — Estoque zerado aparece, e quatro correções na Agenda

**Produto zerado deixou de sumir da lista.** A busca de compatíveis terminava com
`.filter(p => saldo > 0)`, então uma KTM 390 Duke que *tem* peça no catálogo, mas zerada,
mostrava "Nenhum produto compatível encontrado no estoque" — a mesma frase de quando não
existe peça nenhuma. São respostas diferentes: a segunda decide se vale repor antes da
gravação. Agora o zerado entra na lista, desce para o fim, ganha **moldura vermelha e selo
SEM ESTOQUE** no lugar do número, e a contagem do cabeçalho avisa (*"Produtos compatíveis
(4) · 2 sem estoque"*) — inclusive no botão da versão recolhida, sem precisar abrir.
O `0 un` em laranja que existia antes passava batido.

**Brinde "Outros" (e mais dois) não salvavam.** `requests_brinde_check` só aceitava
`pastilhas`, `mochila` e `capa`, mas o painel oferece seis opções — **três das seis**
(`capa_moto`, `ponteira`, `outros`) estouravam a restrição no salvar. Restrição alinhada
com a interface e testada com os seis valores, inserindo e apagando em seguida.

**O "+" já vem com a data escolhida.** Se o operador clicou num dia do calendário antes de
abrir o agendamento manual, o campo Data vem preenchido.

**Dava para perder de vista o dia selecionado.** `.cal-day.approved` era declarado depois
de `.cal-day.selected` e, com a mesma especificidade, o verde cobria o amarelo: clicar num
dia que tem agendamento aprovado — justamente os que o operador clica — não mudava nada na
tela. A seleção passou para depois das regras de cor e ganhou hover próprio, que reforça o
amarelo em vez de cair na regra geral (que troca a borda para vermelho).

**Ícone de calendário invisível no tema escuro.** O `<input type="date">` desenha o ícone
pela `color-scheme`, e o painel só trocava as variáveis CSS. Agora `:root` declara
`color-scheme: dark` e `[data-theme="light"]` declara `light` — o ícone fica branco no
escuro e preto no claro, e de quebra scrollbars e seletores nativos acompanham o tema.

## 20/08/2026 — Agenda: o confirmado na frente, o resto atrás de um clique

Clicar num dia despejava todos os pedidos daquela data na ordem em que vieram do banco —
no print do dono, uma **rejeitada** aparecia antes da **aprovada**. Agora o aprovado vem
primeiro e inteiro, com borda verde, e o resto desce para um bloco que abre por clique.

**A separação muda conforme o dia esteja resolvido ou não**, e isso é de propósito:

- **Com aprovado**, o dia está fechado: pendente, stand by e rejeitada são todos "não
  deram certo" e vão juntos para o bloco fechado — *"Outros pedidos para este dia (3) · 1
  pendente · 2 rejeitadas"*.
- **Sem aprovado**, pendente e stand by são a fila viva do dia e ficam à vista; só as
  rejeitadas ficam guardadas, sob *"Pedidos rejeitados (2)"*. Esconder um pendente num dia
  sem aprovado seria esconder trabalho.

Dentro do bloco a ordem é pendente → stand by → rejeitada, e o resumo do botão segue a
mesma ordem (os dois saem da mesma lista ordenada). Com um status só, o resumo some — ele
repetiria o rótulo do botão.

**A busca de produtos compatíveis no Bling agora só roda para o que está à vista.** É a
parte mais lenta do painel, e antes ela disparava para todo pedido do dia — inclusive os
que ninguém ia olhar. Os escondidos carregam na primeira vez que o bloco abre.

## 20/08/2026 — Kit do Magis5 editável de dentro do projeto

Pedido: na aba Produção, escolher o produto usado no projeto e ter, ao lado, um botão que
adiciona produto à composição do kit **dentro do Magis5**.

**O que a API do Magis5 permite** (documentação lida em `developers.magis5.com.br`, seção
Product — cinco endpoints, nenhum específico de kit): a composição é um campo do produto,
`products_composition[{id, quantity, unitValue, percentagePriceValue}]`, aceito em `PUT` e
em `PATCH /v1/products/{sku}`. Na leitura ela volta como `productsComposition`, com
`productId` separado do `id` da linha.

**O que ela não permite: buscar produto por nome.** Só `GET /v1/products/{sku}` e a
listagem paginada, sem filtro de texto. Isso decidiu a arquitetura — e por sorte casa com
o pedido: quem busca é o **Bling** (o mesmo cache dos brindes) e o **SKU** é a ponte para
o Magis5. O id do componente que o PATCH exige sai de um `GET` pelo SKU escolhido.

- **Edge function `magis5-proxy`**, `verify_jwt: true` + checagem de `role`. A chave sai
  do navegador. Detalhe que quase passou: `verify_jwt` aceita a **anon key**, que é
  pública no `config.js` — sem a checagem de papel, qualquer um escreveria no ERP.
- **O PATCH substitui a lista inteira.** O painel lê a composição, monta *ela + o novo
  item* e mostra um resumo antes de gravar ("vai passar de 2 para 3 itens… participação
  somada depois: 110%"). A function recusa lista vazia.
- **Guarda de resposta velha (`_kitToken`).** Abrir o formulário já dispara o resumo, e o
  operador pode clicar em "adicionar ao kit" antes de a primeira leitura voltar. Sem o
  token, a resposta que chega por último vence — inclusive uma falha antiga sobre um
  estado novo e bom. Isso apareceu no teste, não em produção.
- **Coluna `produto` (jsonb) em `mc_projects`** guarda `{blingId, sku, nome, imagem}` para
  reabrir a tela sem nova busca.

Testado com dublê da API: busca no Bling → item resolvido para o id do Magis5 → payload
enviado com os dois itens que já existiam (7011, 7042) + o novo (88123). Nada é perdido.

**Ainda não rodou contra o Magis5 de verdade** — falta a secret. Ver `pendencias.md`.

## 20/08/2026 — Moto na landing: marca, modelo e ano um por linha

Print do iPhone: os três seletores da moto lado a lado, com "Selecione a marc…" cortado e
o Ano sozinho em meia coluna. Três coisas erradas ali:

- **O formulário era inconsistente com ele mesmo.** No bloco de 900px, `.form-grid-2` já
  colapsa para uma coluna — mas `.form-grid-3` era *forçado* a `1fr 1fr .7fr !important`.
  Resultado: nome, WhatsApp, e-mail e placa em largura cheia, e só a moto apertada em três.
  Agora `.form-grid-3` empilha no mesmo ponto de corte. Marca → modelo → ano é escolha em
  cadeia; um por linha também casa com a ordem em que se preenche.
- **A regra que tentava consertar isso era código morto.** Em ≤640px havia
  `.form-grid-3 select:last-child { grid-column: 1 / -1 }` para jogar o Ano para a linha
  inteira. Nunca pegou: `initMotoSelects` insere a div `.moto-custom-fields` **depois** do
  select de ano, então o último filho não é um `select`. Era por isso que o Ano aparecia em
  meia coluna. Removida.
- **Todo campo dava zoom ao ser tocado.** No celular os campos estavam em `font-size: 13px`
  e o iOS dá zoom automático em qualquer campo abaixo de 16px — a cada toque o Safari
  aproximava e o usuário tinha que pinçar de volta. Isso, mais do que o layout, era o
  "ruim de preencher". Agora 16px.

O caminho **"Outro (não listada)"** seguiu junto: os três campos de texto que o
`moto-catalog.js` injeta também empilham. Eles nascem com `style` inline, daí o
`!important` para casarem com os selects — medido: 44px de altura, 16px de fonte e 10px de
raio nos seis campos, contra 39px/14px/8px de antes.

Desktop conferido: três colunas (229px, 229px, 161px) na mesma linha, fonte 14px, tudo
como estava — as regras novas vivem todas dentro de `@media (max-width: 900px)`.

## 20/08/2026 — Solicitações no celular: a tabela virou lista de cards

O dono mandou print do iPhone: das 8 colunas da tabela sobravam três na tela e o resto
ficava na rolagem horizontal. Três problemas escondidos nesse print:

- **Moto e Modalidade não apareciam.** A regra genérica de `@media (max-width: 900px)`
  fazia `th/td:nth-child(4), :nth-child(5) { display: none }` para *qualquer* tabela — ou
  seja, escondia justamente a moto, que é o dado principal do negócio.
- **O campo de busca e a contagem estavam fora da tela.** A `.filter-bar` no celular é uma
  fileira rolável (`flex-wrap: nowrap !important`, decisão de 13/08 para os chips). Com
  `flex: 1 0 100%` e `order: 10`, a busca não descia para a linha de baixo: ia para a
  direita da fileira rolável, invisível sem arrastar.
- **Os cinco chips de status não cabiam** — "Rejeitadas" ficava cortado na borda.

Agora, em ≤900px: **a mesma tabela vira lista de cards, sem duplicar marcação.** O `<tr>`
passa a `display: flex` e cada `<td>` recebe `order` e `flex-basis`; o `<thead>` sai. Os
`<td>` de data e brinde ganharam `data-rotulo`, que o CSS de celular imprime com
`::before` — sem cabeçalho, "01/09" e "20/08 12:24" ficariam sem contexto. No desktop o
atributo não pinta nada.

Layout do card: **nome + status + "…"** na primeira linha, **moto + placa** na segunda
(com um filete embaixo), **as duas datas** na terceira e **modalidade + brinde** na quarta.

- **Base de 50% no nome** (`flex: 1 1 50%`) em vez de `auto`: com `auto`, nome comprido
  ("Jorge Enrique Santos de Lima Takao Nishimura") empurrava status e "…" para uma segunda
  linha e o "…" ficava solto no meio do card. Medido a 390px: nome, status e "…" com o
  **mesmo centro vertical** nos três cards de teste.
- **Cor e tamanho da capa entraram na mesma linha do brinde.** Empilhados, o "Preto · G"
  ficava embaixo do rótulo e não do valor.
- **As duas datas dividem uma linha a partir de 381px** e empilham em telas menores
  (iPhone SE, 375px) — sem essa exceção, "RECEBIDA 20/08/2026 12:24" estourava.
- **Chips e ordenação viraram dois `<select>` nativos** no celular, com a contagem na
  opção (`Todas (50)`, `Pendentes (6)`…). A ordenação, que no desktop é clique no
  cabeçalho, no celular não existia — o `<thead>` está oculto. Estado compartilhado: quem
  filtra pelo seletor também acende o chip do desktop.

**O bloco novo fica no fim do `<style>` de propósito** e escopado em `#view-requests` /
`#reqTable`: as regras genéricas de tabela do bloco de 900px vêm antes e, com a mesma
especificidade, venceriam. Desktop conferido depois: 8 colunas, chips, busca e contagem
idênticos, seletores com `display: none`.

**Fica pendente:** as outras tabelas (Influenciadores, histórico) continuam rolando na
horizontal — a `.inf-list-table` ainda esconde da terceira coluna em diante no celular.

## 20/08/2026 — A tag ao vivo virou painel de visor de câmera

A pílula, mesmo grande e piscando, não deu a evidência que o dono queria. Montei uma
página de teste (`lab-tag.html`, já removida) com cinco desenhos no contexto real do topo
— pílula atual, pílula grande, faixa vermelha de largura total, manchete tipográfica e
painel de câmera. **Escolha: painel de câmera.**

- **Como é:** bloco com cantos em L de visor (`::before`/`::after`), linha de cima com
  `● REC · GRAVANDO AGORA` à esquerda e o **dia da gravação** à direita, e embaixo a moto
  + nome mascarado em 15px (13,5px no celular). `display: inline-block`, então o painel
  tem a largura do conteúdo — não vira uma faixa vazia atravessando o hero.
- **O `REC ·` aparece só quando é hoje.** *Próxima gravação* e *Última gravação* usam o
  mesmo painel no estado calmo (`.fp-live-off`): cantos e texto em cinza, ponto pulsando
  em vez de piscando, sem glow.
- **A tag deixou de ser `.badge`.** Virou `.fp-live`, com CSS próprio. Isso desamarrou
  duas regras de `@media` que mexiam em `.badge` (uma tirava fundo e borda no celular, a
  outra remontava padding e fonte) e brigavam entre si.
- **Estado sem dado continua sendo a tag antiga:** `.fp-live-vazio` devolve a pílula
  discreta de uma linha com `FullPro Media Club`. Se o Supabase cair, ninguém vê um visor
  de câmera vazio.
- **Medido:** rótulo e data centrados entre si com 0,01px de diferença no desktop e 0px no
  celular. Nome longo (`José **** ** ******** ******* ******`) quebra em 2 linhas dentro
  do painel, que passa a ocupar a largura toda — sem estourar a viewport (347px de 375).

## 20/08/2026 — A tag ao vivo ganhou peso (e a máscara ficou do tamanho do nome)

Duas correções em cima da tag do mesmo dia:

- **Um `*` por letra real do sobrenome**, com os espaços preservados:
  `José Luis de Oliveira Ossoski Junior` → `José **** ** ******** ******* ******`.
  Continua sendo feito na view, com `regexp_replace(..., '[^ ]', '*', 'g')`.
  Os asteriscos são desenhados num `<span>` com metade da opacidade, senão a parede de
  `*` rouba a atenção do primeiro nome.
- **A tag virou um bloco de verdade**, em vez de texto solto: pílula com fundo em degradê
  vermelho, chip sólido `● GRAVANDO AGORA` estilo REC de câmera (ponto piscando em
  `steps()`, não pulsando) e o texto em branco, 14px. A pílula respira com um glow
  (`box-shadow` animado) **só no estado "gravando agora"**.
- **Próxima/Última gravação usam o estado calmo** (`.fp-live-off`): chip vazado, sem glow,
  sem piscar, texto em cinza. A tag só grita quando está gravando de fato.
- **No celular a pílula ficou** — antes o CSS mobile tirava fundo e borda de `.badge`. É o
  que dá evidência à tag na tela onde a maioria entra.
- **Alinhamento medido, não olhado:** `line-height: 1` no chip faz a altura dele casar com
  a primeira linha do texto ao lado. Centro do chip vs. centro da linha: **0,3px** no
  celular e **0,2px** no desktop, com nome curto ou com nome de 2 linhas.

## 20/08/2026 — A tag do topo da landing virou "Gravando agora"

O `FullPro Media Club` fixo no topo do hero saiu. No lugar entra o que o estúdio está
fazendo de verdade: **GRAVANDO AGORA · Yamaha R15 de Ws \*\*\***.

- **Só o primeiro nome, o resto é `***`.** A máscara é feita **no banco**, não no
  JavaScript: a view `mc_public_gravacoes` devolve `nome_publico` já mascarado, então o
  nome completo nunca sai do Supabase. A view expõe três colunas — `date`, `moto`,
  `nome_publico` — e nada de whatsapp, e-mail, placa ou endereço. `mc_requests` continua
  fechada para o anon (RLS: só insert).
- **A view recorta o tempo também:** só `status = 'approved'` e datas entre −45 e +7 dias,
  no fuso de São Paulo. Não dá para varrer o histórico inteiro pelo endpoint público.
- **Três estados, nessa ordem:** gravação de hoje → *Gravando agora*; senão a próxima
  agendada → *Próxima gravação*; senão a última realizada → *Última gravação*. Sem dado
  ou com erro de rede, o texto original `FullPro Media Club` fica no HTML e ninguém vê
  buraco.
- **Duas ou mais motos no mesmo dia** alternam a cada 6s com fade. Rebusca a cada 60s e
  ao voltar para a aba (`visibilitychange`) — é o "tempo real" honesto para um site
  estático, sem WebSocket.
- **O ano sai do nome da moto e as minúsculas soltas são corrigidas** na exibição:
  `Yamaha r15 2026` → `Yamaha R15`. Palavra que já tem maiúscula não é tocada, senão
  `BMW` viraria `Bmw`.
- **Texto entra por `textContent`**, nunca `innerHTML` — o campo vem de formulário
  público.
- **No celular a tag quebra em até 2 linhas** em vez de cortar o nome com `...`, e o ponto
  vermelho fica alinhado com a **primeira** linha (medido: 1px de diferença do centro do
  rótulo). Nome longo tipo *Harley-Davidson Pan America 1250 Special* cabe sem estourar a
  viewport.

---

## 19/08/2026 — Check-in/out passa a girar em torno da data

As duas abas eram **Entrada** e **Saída** — o eixo era o tipo de formulário, e a lista
despejava as 17 motos de todas as datas nas duas. Agora são **Hoje** e **Outros**.

- **Hoje**: só as motos do dia, e cada card traz **entrada e saída no mesmo lugar**, num
  seletor no topo. O card abre direto na etapa que falta (sem entrada → Entrada; com
  entrada → Saída), e depois de salvar fica na aba onde o operador estava.
- **Outros**: lista compacta em dois grupos, **Próximas datas** e **Datas anteriores**.
  Serve para corrigir um registro antigo ou adiantar o de amanhã — moto que chega no fim
  do dia para gravar no seguinte. Clicar na linha expande o card ali mesmo.
- Selo de etapa concluída só aparece **quando está concluída**. Dois selos apagados em
  toda linha viravam ruído e ainda pareciam as abas do card.

**Os dois formulários convivem no mesmo card sem colisão** porque todo id já era
`${prefix}_${rid}`. Bastou extrair o corpo para `ciFormHtml(prefix, r)` e chamá-lo duas
vezes.

**O card de "Outros" só é montado ao abrir.** Renderizar 17 motos × 2 formulários seria
34 medidores de combustível e 34 grades de foto de uma vez. Medido: a lista fechada monta
**zero** cards; abrir uma linha monta um.

**Vazamento de listener corrigido de passagem.** `initFuelGaugeDrag` registrava quatro
listeners no `document` a cada chamada e nunca removia nenhum — a cada re-render da tela a
conta crescia (17 cards × 4, indefinidamente). Agora é um único par de listeners no
documento apontando para o medidor ativo, e o `svg` marca que já foi ligado.

## 19/08/2026 — Cor e tamanho da capa de chuva

Na landing, escolher **Capa de chuva** abre um bloco com **cor** (Preto, Verde limão) e
**tamanho** (P, M, G, GG, G2, G3). Os outros dois brindes não têm variação, então o bloco
só aparece para a capa.

- Chips com botão de rádio de verdade por baixo: o `FormData` já leva os valores, sem
  campo escondido para sincronizar.
- O `required` é **ligado e desligado junto com o bloco**. Campo obrigatório escondido
  trava o envio num elemento que o navegador não consegue focar — é o mesmo cuidado que o
  campo de endereço já tinha.
- Trocar para outro brinde limpa a seleção, para não mandar cor de capa em quem pediu
  mochila.
- Colunas novas em `mc_requests`: `brinde_cor` e `brinde_tamanho`, com `CHECK` nos valores
  válidos. Testado: `XXG` é recusado pelo banco.

**O dado aparece em todo lugar onde o brinde já aparecia** — senão não serviria para nada:
linha da tabela de Solicitações, detalhe da solicitação, agenda do dia, exportação CSV,
a variável `{brinde}` dos templates de WhatsApp e, o mais útil, a **linha do brinde no
check-out**, que passa a dizer `Capa de chuva · Preto · GG` para quem vai separar a peça.

Conferido em produção: bloco escondido por padrão sem `required`; ao escolher a capa
aparecem os 8 rádios obrigatórios; a marcação acende os chips; voltar para pastilhas
esconde, limpa e tira o `required`. O `FormData` do formulário real carrega
`brinde_cor: verde_limao` e `brinde_tamanho: G3`. Solicitações antigas, sem os campos,
seguem exibindo só o nome do brinde.

## 19/08/2026 — Brinde confirmado na saída, com baixa de estoque no Bling

O agendamento guarda só a **categoria** que o solicitante escolheu (`pastilhas`,
`mochila`, `capa`). Faltava confirmar o que saiu de fato. Agora o check-out tem um bloco
**Brinde entregue**, obrigatório antes de salvar.

- **Busca no Bling por nome ou SKU**, com miniatura, nome e estoque atual em cada opção.
  A busca roda sobre a lista já em cache (2.000 produtos), então responde a cada tecla sem
  ida à rede. SKU exato vem primeiro, depois quem tem estoque.
- A miniatura usa o mesmo gancho `data-drive-sku`, então a foto do Drive tem prioridade
  sobre a do Bling — igual ao resto do painel.
- Ações em **botão de ícone**, no padrão do painel: ✓ confirmar (verde), ⇄ trocar (azul),
  🗑 remover (vermelho), e × para fechar a busca. O grupo de ações caiu de ~230px para
  **74px**. Todos com `data-tip`, que o observador converte em `aria-label` e `title` —
  conferido: zero botões sem nome na tela.
- **+ Adicionar brinde** manteve o rótulo de propósito: é a porta de entrada do bloco, e
  um + solto dentro do card seria difícil de achar.
- Remover tudo é válido: cobre a saída sem brinde.
- Ao salvar, cada brinde confirmado **baixa uma unidade** no Bling
  (`blingStockOut`, operação S).

**A sugestão não se aceita sozinha.** A primeira versão resolvia a categoria num produto
e já entrava confirmada — mas "pastilha" casa com dezenas de itens, e o palpite veio
`PASTILHA DE FREIO (CANAÃ)` quando o brinde de verdade é outro. Baixar estoque de um SKU
adivinhado erra calado. Agora a sugestão aparece marcada como sugestão e alguém clica em
Confirmar.

**Idempotência:** `gifts_stock_applied` guarda os ids que já baixaram. Salvar de novo para
corrigir km ou foto não tira estoque outra vez — verificado: segunda gravação atualizou a
quilometragem e não chamou o Bling.

---

**Bug grave achado no caminho: nenhum check-in ou check-out era gravado.**

`saveCiForm` escrevia em `sb.from('checkins')` e `sb.from('checkouts')`. As tabelas são
`mc_checkins` e `mc_checkouts` — as outras não existem. A própria mensagem de erro
("Você já criou a tabela 'checkouts' no Supabase?") indicava que o autor esperava o nome
sem prefixo.

As duas tabelas tinham **uma linha cada, de 16/04/2026**, e nada depois. Ou seja: desde
que essa função foi escrita, todo check-in e check-out do pátio se perdia — o operador
via um toast de erro e o registro não ficava. Corrigido no mesmo commit; a gravação foi
confirmada em produção (linha criada, lida de volta e depois apagada).

**Como o resto foi verificado:** fluxo completo com `blingStockOut` substituído por um
espião, para não mexer no inventário real como teste. Confirmado que a chamada sai uma vez
por brinde, com quantidade 1 e a observação `Brinde Media Club — <solicitante>`. A baixa
real no Bling usa a mesma função que o módulo de envio a influenciadores já usa em
produção. O registro de teste foi apagado do banco.

## 19/08/2026 — Badge de status fora de linha no detalhe

A etiqueta PENDENTE ficava **3,5px abaixo** do rótulo STATUS. Causa: `.detail-row` é um
grid alinhado pelo topo, e o badge tem `padding: 4px 10px` próprio — o texto dele nasce
mais baixo que o do rótulo. Nas fileiras de texto puro o erro era de 1px e passava
despercebido; com o badge virou visível.

Corrigido com `align-items: center` na fileira, e `align-items: start` só nas de texto
longo (Endereço, Observações), onde o rótulo centrado flutuaria no meio do parágrafo.

Medido depois: **0px** em todas as treze fileiras, badge incluído.

Varredura nas 17 telas, medindo toda `.badge`, `.proj-dest-tag` e `.proj-status-select`
contra os irmãos da mesma fileira: **zero** desalinhamentos restantes no painel.

O dono pediu que isso vire regra permanente — está em `padroes.md` → Alinhamento, e na
memória do agente.

## 19/08/2026 — Rodapé do detalhe em botões de ícone

Pedido do dono: no rodapé do detalhe, os mesmos botões só de ícone que existiam na linha
da tabela. Ficaram `WhatsApp · Aprovar · Stand by · Rejeitar`, na ordem que a linha tinha.
A dica abre para cima, então não é cortada pelo `overflow: hidden` do popup.

Saiu junto o código morto: `reqBotoesStatusTexto`, a chave `botao` de `REQ_ACOES` e a
regra `.action-btn.standby`.

**Bug encontrado ao verificar — e é geral, não só deste rodapé.** Os quatro botões novos
ficaram **sem nome acessível**: `aria-label` e `title` vazios, contra a linha de base de
zero botões sem nome da auditoria.

Causa: `ajustar()` montava suas listas só com `raiz.querySelectorAll(...)`, que enxerga
apenas descendentes. Nas linhas da tabela o botão entra dentro de um `<tr>`, então é
descendente e era coberto; num `innerHTML` que monta os elementos no topo — o caso do
rodapé — **o próprio botão é o nó inserido** e escapava. É a mesma armadilha que já tinha
mordido nas tabelas, agora em `[data-tip]`, `button`, `img` e campos de formulário.

Corrigido com um helper `coletar(raiz, seletor)` que inclui a raiz na lista. Confirmado:
os quatro botões voltaram a ter `aria-label` e `title`, e a tela toda marca **zero**
botões sem nome.

## 19/08/2026 — Detalhe da solicitação em duas colunas

O popup de "Ver detalhes" era estreito (560px) e o popup inteiro rolava, o que empurrava
os produtos compatíveis para fora da vista.

- **920px de largura**, dados do solicitante em **duas colunas**. Doze campos curtos
  fecham exatamente seis fileiras; **Endereço e Observações** ficam em largura total, no
  fim — no meio do grid eles deixavam a célula vizinha vazia.
- **A rolagem acontece só na lista de produtos.** `.modal-content` e `.modal-body` viram
  coluna flex com `overflow: hidden`; a lista é o único item que cede espaço
  (`flex: 1 1 auto` com `max-height: min(380px, 42vh)`). O grid de dados leva
  `flex: 0 0 auto` para nunca ser cortado.
- Cada card de produto passou de ~217px para **433px** — o nome agora cabe inteiro em vez
  de terminar em reticências.
- O `max-height: 200px` da lista vem num `style=` inline compartilhado com os cards de
  Projetos e Clips, por isso o override precisa de `!important` e escopo `#modal`.
- Guarda para janela baixa (`max-height: 660px`): a rolagem volta para o corpo, senão o
  rodapé sairia da tela.

Medido com 42 cards forçados no DOM: a lista rolou 752px, corpo e popup ficaram parados e
o rodapé permaneceu visível. O popup só cresce até 90vh — a lista encolhe de 380 para
294px para caber.

Vale **só no computador** (`min-width: 901px`). No celular o popup segue folha na base,
uma coluna, rolando inteiro.

## 19/08/2026 — Ações da linha reduzidas a Ver e WhatsApp

Com o stand by, a coluna AÇÕES chegava a cinco ícones e ficava confusa. Pedido do dono:
deixar só **Ver detalhes** e **WhatsApp** na linha, e concentrar as mudanças de status
**dentro do detalhe**.

- Linha: 2 ícones em qualquer status. A coluna caiu para 106px e a folga foi para
  Solicitante e Moto, que pararam de quebrar em duas linhas.
- Rodapé do detalhe: `WhatsApp · Rejeitar · Stand by · Aprovar`. A lista de botões é
  invertida de propósito — a ação positiva fica à direita e a destrutiva à esquerda, como
  era antes do stand by existir.
- No celular nada muda: o menu "…" já concentrava tudo numa lista, que não era o problema.
- `.modal-foot` ganhou `flex-wrap` no celular, senão quatro botões espremiam.

**Custo aceito:** aprovar uma pendente passou de 1 clique para 2 (abrir o detalhe e
decidir). Com a fila normalmente em uma ou duas pendentes, vale a troca pela tabela limpa.
Se incomodar, o caminho de um clique é transformar o badge da coluna STATUS num seletor,
como já é em Projetos, Edição e Clips.

## 19/08/2026 — Solicitações: ordem padrão e o status Stand by

**Ordem padrão** passou a ser a data de recebimento, da mais recente para a mais antiga
(era data de agendamento, crescente). Só o valor inicial mudou: se o operador clicar em
outra coluna, a escolha dele continua valendo até recarregar a página.

**Status novo: `standby`.** Solicitação que não foi descartada, só ficou em espera — moto
interessante para a qual ainda não há produto em estoque para testar.

- O banco tinha um `CHECK` que só aceitava `pending/approved/rejected`. Sem migração, a
  gravação falharia. Constraint `requests_status_check` recriada com o quarto valor.
- Badge violeta (`--tx-standby` / `--bg-standby`), medido: **6,95:1** no escuro e
  **7,63:1** no claro.
- Aba **Stand by** entre Aprovadas e Rejeitadas.
- Botões, itens do menu "…" e rodapé do modal passaram a ser montados a partir de uma
  lista (`REQ_ACOES`), mostrando os destinos possíveis menos o status atual. Antes eram
  ternários repetidos em cinco lugares — acrescentar um quinto status agora é uma linha.
- Também no seletor do modal de editar agendamento e na contagem do dashboard.

Conferido em produção com ida e volta numa solicitação já rejeitada: o banco aceitou
`standby`, a linha renderizou o badge certo, a aba filtrou, e o registro voltou ao valor
original (a tabela não tem `updated_at`, então terminou idêntico).

**Bug antigo corrigido de passagem:** o handler das abas de filtro pegava *todo*
`.filter-btn` da página, incluindo as abas de Check-in/Check-out, que não têm
`data-filter`. Clicar nelas zerava o filtro das solicitações e apagava o "active" das
quatro abas. Agora o seletor é restrito a `#view-requests .filter-bar`.

## 17/08/2026 — Verificação de domínio no Meta + campanha montada

Meta tag `facebook-domain-verification` no `<head>` da home. **Status: Verified.**

A tag não pode ser injetada por JS — o rastreador do Meta lê o HTML servido. Por isso
ela fica no `<head>` estático, ao lado do bloco do pixel. Não remover.

Detalhe que confunde: o diálogo de criar domínio afirma que "só pode verificar o domínio
raiz, não um subdomínio", mas o `mediaclub.fullpro.com.br` foi adicionado e verificou
normalmente por meta tag. O `fullpro.com.br` segue **Not Verified** (pendência da loja).

Campanha `FullPro Media Club Ads` (rascunho, conta 834166548630365): segmentação, textos,
URL com UTMs e CTA prontos. Só falta o vídeo. Ver `pendencias.md`.

Um achado que valeu: a prévia mostrava carrossel/coleção com **produtos da loja**
(pastilhas de freio) anexados ao anúncio, porque o aprimoramento "Produtos" e os formatos
Carrossel/Coleção vinham ativos. Desativados — mostrar peça de freio para quem está sendo
convidado a emprestar a moto não faz sentido. Custo: a pontuação da campanha caiu de 77
para 59, porque o Meta estima +10,8% e +6,8% de conversão com esses formatos. Reversível
em um clique se o dono discordar.

---

## 17/08/2026 — Meta Pixel na landing pública

Para a campanha de vídeo no Meta Ads mirando Joinville e região (público: interesse em
motos), a landing precisava rastrear conversão. Bloco `FP-META-PIXEL` no `index.html`.

**Pixel próprio, não o do e-commerce.** Criado o conjunto de dados `Pixel Media Club`
(ID `1794140864938355`) no portfólio FullPro Ltda, conectado à conta de anúncios
`FullPro - Conta de anúncios` (834166548630365). O `Pixel FullPro (Main)`
(`1012196736930876`) continua exclusivo da loja: misturar os dois colocaria quem só quer
emprestar a moto nos públicos de remarketing de quem compra peça, e vice-versa.

Na criação, o checkbox "Adicionar a API de Conversões" vinha marcado e afetaria **todos os
conjuntos, novos e existentes** — desmarcado, porque mexeria também no pixel da loja.

**Só na `index.html`.** O `admin.html` não leva pixel: a equipe usando o painel entraria
no público da campanha.

Eventos:

| Evento | Quando | Tipo |
|---|---|---|
| `PageView` | carga da página | padrão |
| `ClicouAgendar` | clique nas CTAs `#agendar` | custom |
| `Contact` | clique no link do WhatsApp | padrão |
| `Lead` | **depois** do insert em `mc_requests` retornar sem erro | padrão |

`Lead` fica depois do insert de propósito: se o Supabase falha, o evento não dispara e a
métrica do Meta bate com as solicitações reais. O payload não leva nome, WhatsApp nem
e-mail — só modalidade, moto e brinde.

`ClicouAgendar` existe porque `Lead` vai demorar a ter volume (o Meta precisa de ~15-25
por semana para otimizar); serve de sinal de meio de funil nesse período.

**Como desligar:** deixar `window.FP_PIXEL_ID` vazio. O guard (`/^[0-9]{10,}$/`) não
carrega nada e a página segue igual — testado. `window.fpTrack` nasce como no-op, então
nenhuma chamada quebra o fluxo se o pixel não carregar.

O `sw.js` não interfere: ignora requisição cross-origin (linha 60).

## 13/08/2026 — Edição com o mesmo tratamento

Tudo em CSS, sem tocar na marcação — o módulo já tinha o menu "…".

- **Painel de números: 97px → 62px.** Eram dois cartões em cima e um embaixo, cada um com
  ícone de 42px. Agora são três numa fileira de 118px, sem o ícone (não cabe) e com o
  número em 20px. A barra de progresso passou a ocupar a largura do cartão.
- **Cabeçalho numa linha:** título + status + "…", mesmo centro vertical; os chips de
  destino descem para a linha seguinte.
- **Meta: três caixas de 52px → duas fileiras de 15px.** Moto/Produto ocupa a largura
  toda; Data e Links dividem a de baixo.

**Card: 463px → 302px.** Nos oito projetos em edição: 3.597px → 2.521px de rolagem.

**A técnica que destravou o cabeçalho:** os chips de destino ficam *dentro* do bloco do
título, então a ordem natural jogava as ações para uma terceira linha. `display: contents`
no bloco do título e em `.edit-actions` promove título, chips, status e "…" a filhos
diretos do flex — aí basta `order` e `flex-basis: 100%` nos chips para montar as duas
linhas. Sem isso seria preciso mexer na marcação, o que mudaria o computador.

**Nota de verificação:** a janela do Chrome estava em 1546px nesta rodada e o
`resize_window` não pegou, então a conferência foi feita aplicando as regras do próprio
bloco `@media` sem a media query, com a lista limitada a 366px. O computador foi conferido
na largura real: chips, ícones, paddings e margens idênticos aos de antes.

## 13/08/2026 — Clips com o mesmo tratamento de Projetos

Mesmo padrão, aplicado à tela de Clips no celular:

- **Filtro em seletor nativo** com a contagem em cada opção (`Todos (6)`,
  `Planejamento (4)`…). Os quatro chips coloridos vazavam a largura da tela; continuam no
  computador.
- **Ações no menu "…"**: Abrir/editar, Ver anúncio no Mercado Livre e Excluir clip. O
  lápis e o ícone do Mercado Livre ao lado do título ficaram só no computador.
- Título, status e "…" **numa linha só**, com o mesmo centro vertical.
- Caixa do produto e bloco de observações mais justos; a prévia das observações passou de
  5 para 3 linhas.
- O degradê que corta a prévia era de 40px sobre uma caixa de 60px — apagava duas das três
  linhas. Passou a 22px.

**Card: 273px → 210-223px.**

**Erro próprio corrigido:** as classes `.fp-clip-*` são declaradas *depois* do bloco
`@media (max-width: 600px)` no arquivo, então venciam por ordem de fonte e as regras de
celular não pegavam nada (medido: `max-height` continuava 96px). Resolvido com escopo
`#view-clips`, que também isola a tela de Edição — ela usa as mesmas classes
`.edit-card` / `.edit-card-head` e já tinha o layout ajustado.

## 13/08/2026 — Menu ancorado no botão e mais aperto no card

Quatro pedidos do dono, todos no celular:

- **O menu "…" abre colado ao botão**, não mais como folha na base da tela. O JS já
  calculava a posição ancorada e virava para cima quando não cabia — o CSS mobile é que
  jogava tudo para a base com `!important`. Bastou tirar o override. Conferido: no
  primeiro card abre 6px abaixo do botão; no último da lista vira para cima e continua
  inteiro dentro da tela.
- **Botão "…" de 44px para 26px de largura.** A altura do alvo continua 44px, mas com
  `margin: -9px 0` para não esticar a linha do título. Card de título curto: −18px.
- **Títulos de projeto sempre em maiúsculas**, na listagem de Projetos e na de Edição.
- **Status centralizado com o título.** Era `align-items: flex-start`; virou `center`, e
  agora título, status e "…" compartilham o mesmo centro vertical com título de uma ou
  de duas linhas (medido: 214,8px nos três).

## 13/08/2026 — Botão "novo" no padrão do iPhone e card de projeto compacto

**Pedido do dono:** o + no canto superior direito, "parecendo mais com o sistema padrão
do iPhone e não um quadrado azul com um + no centro". Depois: organizar as informações
da listagem, manter o menu "…" no canto superior direito e apertar os cards.

- O botão deixou de ser um quadrado azul preenchido e virou o **glifo + em azul de
  sistema** (`#0A84FF` no escuro, `#007AFF` no claro), sem caixa, alinhado ao canto
  superior direito na mesma linha do título. O alvo continua 44×44; o desenho é só o
  símbolo. Vale para as 5 telas que têm o botão.
- Por que **não** `position: absolute`: na Agenda são dois botões nesse mesmo canto e
  tirar do fluxo empilharia um sobre o outro. Foi `flex-wrap: nowrap` + `margin-left: auto`.
- O `-8px` de margem à direita é metade da folga entre o glifo e a borda do alvo — é o
  que alinha o + com a margem do conteúdo em vez de encostar o alvo na borda da tela.
- **Card de projeto: 188px → 136px** (sem produtos compatíveis). Título, status e o menu
  "…" numa linha só; a fileira de destinos logo abaixo; a meta em duas fileiras, com
  Moto/Produto ocupando a largura toda.
- A meta em duas colunas espremia "BMW R 1300 GS 2026 (0000000)" em **quatro linhas**.
  Virou flex: o texto longo pega a fileira inteira, Data e Custos dividem a de baixo.
- O bloco de produtos compatíveis cobrava 6px de margem mesmo vazio — 31 dos 40 cards.
  Agora `:empty` some.

**Dois erros próprios corrigidos no caminho:**
- `flex: 0 0 auto` no grupo de ações fazia o filtro de período de **Meus Posts** empurrar
  o + para uma segunda linha. Passou a encolher.
- A regra do último filho tem especificidade maior que `.page-head .fp-new-btn`, então o
  botão de **Templates** encolhia para 40px em título longo. Resolvido com `min-width`.

## 13/08/2026 — Menu lateral compacto e avisos do console

- Itens do menu de 44px para **34px**. A causa era uma regra própria de alvo de toque:
  17 itens × 44px = 748px, não cabia. Ali o alvo é a linha inteira (largura toda, sem
  vizinho ao lado), então 34px é seguro. Cabem 15 itens em vez de 11.
- `<meta apple-mobile-web-app-capable>` estava depreciado — aviso introduzido ao montar o
  PWA. Passa a vir junto com `mobile-web-app-capable`.
- Erro **406** nas metas: `.single()` numa consulta que pode não achar linha. Não existem
  metas para agosto/2026, só para junho. Trocado por `.maybeSingle()`.

## 13/08/2026 — Filtros do celular numa linha só

- A caixa em volta dos filtros saiu: os três seletores ficam direto sobre o fundo.
- Ordem: **status → destino → ordenar**. O bloco separado "Filtrar por destino" sumiu no
  celular; virou o seletor do meio, com rótulo curto.
- Altura da área de filtros: de ~90px para **34px**.
- Corrigido: a regra pegava qualquer `.proj-filters`, e **Meus Posts** usa a mesma classe
  com chips — passaram a vazar. Regra restrita a Projetos; as outras rolam.

## 13/08/2026 — Reversão do desktop

**Pedido do dono:** o computador estava bom e não devia ter mudado.

- Restaurados no computador: os 6 chips coloridos de filtro e os botões de ícone.
- O novo (menu "…", seletor nativo) ficou só no celular, via `.fp-so-desktop` /
  `.fp-so-mobile`.
- Conferido que nenhum seletor de CSS que o computador usava se perdeu.
- Limpeza: saiu o painel de filtro próprio que virou código morto — 3,1 KB de CSS e
  122 linhas de JS.

**Lição:** a partir daqui, toda melhoria de interface entra só no celular por padrão.

## 13/08/2026 — Ações em menu "…" e filtro em caixa

- Projetos, Solicitações, Edição e Templates passaram a ter as ações num menu por item.
- Filtro de status virou caixa suspensa.
- (Ambos foram depois restringidos ao celular — ver acima.)

## 13/08/2026 — Correções mobile a partir de prints do iPhone

- `.edit-card-head` e `.edit-actions` não tinham **nenhuma** regra mobile: título quebrava
  em 3 linhas com os botões desalinhados ao lado.
- Card de projeto: de ~600px para **188px** de altura. Uma regra antiga empilhava título
  e ações em coluna — fazia sentido com 5 botões, não com o menu.
- Fileiras de chips passaram a rolar na horizontal.
- Todo input a **16px** (abaixo disso o iOS dá zoom sozinho e desloca a tela).
- `env(safe-area-inset-*)` no header, menu e rodapés.
- Menu lateral passou a rolar, fechar com Esc e devolver o foco.
- Modais viraram folha que sobe da base.
- 8 das 9 tabelas não tinham contêiner de rolagem — o observador passou a envolver
  qualquer tabela. **A verificação precisou olhar a raiz também:** quando o nó inserido
  *é* a tabela, `querySelectorAll` não a encontra.
- **Bug próprio corrigido:** o código do Drive apagava o conteúdo da caixa antes de saber
  se a foto carregava; se falhasse, sobrava um quadrado cinza. Visível só no celular, com
  rede mais lenta. Agora só troca no `onload`.
- **Regressão própria corrigida:** `margin-left:auto` para encostar o botão "novo" pegava
  o próprio bloco do título nas telas sem botão — o cabeçalho de Edição ia para a direita,
  cortado.

## 13/08/2026 — Integração com o Google Drive

Foto de produto pela pasta com o nome do SKU, em Clips e em produtos compatíveis.

- Edge function `drive-proxy` com conta de serviço (JWT RS256 assinado com
  `crypto.subtle`). A credencial nunca chega ao navegador.
- A tela pergunta **uma vez só** quais SKUs têm foto — sem isso cada card geraria um 404.
- Cache em duas camadas: mapeamento no banco, imagem no navegador (1 dia).
- Resultado com dados reais: **23 de 39 produtos** ganharam foto numa tela de check-in —
  e nenhum deles tinha imagem no Bling.
- Otimização: guardar o `thumbnailLink` cortou uma das duas idas ao Google por foto
  (1,5s → 1,0s).
- Corrigida regressão própria: a contagem paginada de 5.493 pastas travava a aba
  Integrações por 8s ao abrir. Virou sob demanda (`?contar=1`).

## 13/08/2026 — Botão do Mercado Livre ao lado do título (Clips)

Ficava numa linha própria abaixo, criando um degrau de altura em todo card.

## 12–13/08/2026 — Auditoria de UX/UI e aplicação

Auditoria das 17 telas com medição no DOM, CSS e rede. 25 achados, todos aplicados.

Antes → depois, medido em produção:

| | Antes | Depois |
|---|---|---|
| Contraste reprovado (tema claro) | 41 de 85 | **0** |
| Contraste reprovado (tema escuro) | 11 de 79 | **0** |
| Requisições para 6 telas | 96 | **1** |
| `mc_admin_users` por sessão | 25× (pico 3,9s) | **1×** |
| Botões sem nome acessível | 115 | **0** |
| Popups nativos | 150 | **0** |
| Scroll ao trocar de tela | 632px | **0px** |

Principais correções: filtro que abria escondendo 35 de 40 projetos; tabela que ordenava
por uma data e destacava outra; check-in com teclado alfabético para quilometragem e sem
`capture` na câmera; "Limpar todos os dados" com o mesmo peso visual de "Baixar CSV";
PWA com modo offline; feedback sem popup nativo.

**Fora do escopo, achado no caminho:** XSS armazenado vindo do formulário público —
nome, moto, placa e WhatsApp entravam sem escape em 23 pontos. Verificado que o padrão
antigo executava o payload e o novo não.

**Dois pedaços de código morto:** o botão "Ver todos" do dashboard chamava
`switchView()`, que não existia; e a tela de Clips ficava em branco porque um erro de
consulta só ia para o console.

**Três problemas que só apareceram testando:** o reset de scroll não funcionava no
roteador que eu havia editado (há três gerações empilhadas); o escape de HTML quebrava um
handler `onclick`; e o `vercel.json` bloqueava a câmera por header, o que teria anulado a
melhoria do check-in.

Backup em três camadas antes de começar — ver `ambiente.md`.
