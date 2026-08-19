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
uso: Administrador, Filmmaker, Mecânico/Apresentador.

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
WhatsApp · Exportar · Usuários · Integrações · Meu perfil.

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

### Botão "novo" (+)
> *"quero que ele pareça mais com o sistema padrão do iphone, e não assim um quadrado
> azul com um + no centro"*

- Canto superior direito, na mesma linha do título
- **Glifo + em azul de sistema, sem caixa** — nada de quadrado preenchido
- Vale só no celular; no computador segue o botão azul

### Solicitações
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

### Fotos de produto (Google Drive)
- A foto do **Drive tem prioridade** sobre a do Bling
- Clicar na foto **amplia ali mesmo** (lightbox), não abre o Drive
- A pasta é **privada**, lida por conta de serviço

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
