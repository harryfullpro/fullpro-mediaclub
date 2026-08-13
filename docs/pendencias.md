# Pendências

Ordenado por impacto. Atualizar sempre que algo for concluído ou aparecer.

---

## Em andamento

### Auditoria mobile — telas que faltam olhar
Já tratadas: Projetos, Clips, Edição, Solicitações, Check-in, Integrações.

**Faltam ver em largura de celular:** Agenda (calendário), Influenciadores (5 tabelas e
abas), Metas, Debriefing, Usuários.

Estado medido: em viewport de 390×844, **nenhuma das 17 telas vaza a largura** e não há
rolagem horizontal na página. O que falta é avaliação de *layout* — densidade, ordem,
o que sobra e o que falta — não de vazamento.

---

## Segurança

### A sessão é o UUID do usuário, sem assinatura
`fp_session` no localStorage é apenas o `id` do operador. Quem tiver o UUID de um
administrador **entra como ele**. Não há assinatura nem validade.

Num painel interno o risco é contido, mas é o tipo de coisa que piora conforme a equipe
cresce. Correção real: token assinado com expiração, ou usar o Supabase Auth de verdade.

**O dono foi avisado três vezes e ainda não priorizou.** Não tratar sem ele pedir.

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
