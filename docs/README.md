# Documentação do painel — FullPro Media Club

Esta pasta guarda o que **não está no código**: decisões que foram tomadas e por quê,
regras que valem para o projeto todo, e o que ainda está em aberto. Serve para retomar
o trabalho sem depender do histórico de uma conversa.

## Por onde começar

| Arquivo | O que tem dentro |
|---|---|
| [contexto.md](contexto.md) | O que é o produto, quem usa, e as decisões que o dono já tomou |
| [padroes.md](padroes.md) | Como escrever código aqui — o que usar e o que nunca fazer |
| [ambiente.md](ambiente.md) | Deploy, como testar, integrações e onde ficam as credenciais |
| [pendencias.md](pendencias.md) | O que falta, em ordem de prioridade |
| [diario.md](diario.md) | Registro do que foi feito, por data |

## Como manter isto vivo

Estes arquivos só valem se estiverem em dia. A regra:

- **Nova decisão do dono** (preferência, regra de produto) → `contexto.md`
- **Novo padrão de código ou componente** → `padroes.md`
- **Mudança em deploy, integração ou credencial** → `ambiente.md`
- **Trabalho concluído ou novo problema encontrado** → `diario.md` e `pendencias.md`

O `CLAUDE.md` na raiz do repositório aponta para cá, então qualquer sessão nova do
Claude Code lê isto automaticamente antes de mexer no código.

Última revisão completa: **26/08/2026**
