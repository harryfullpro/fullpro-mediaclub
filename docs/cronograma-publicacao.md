# Cronograma de publicação

Definido pelo Harry com um analista de social media, **medido sobre 170
publicações reais da conta** — não sobre média de mercado. Gravado como padrão
da grade (`mc_planner_grade`) em 01/09/2026.

Horários de Brasília. A coluna `hora` é `time` sem fuso de propósito: a grade é
regra de relógio de parede, e "18h" continua sendo 18h depois de qualquer
mudança de horário de verão.

---

## As regras que não mudam

Estas valem acima da grade. Se um dia a grade e uma regra discordarem, a regra
ganha — ela é o motivo, a grade é só o horário.

1. **É o mesmo vídeo nas três redes, no mesmo dia.** Uma produção, três
   publicações. Não escalonar por dia. **TikTok e Shorts sempre às 11h, juntos.**
2. **Exportar limpo do projeto de edição.** Nunca baixar de uma rede para subir
   em outra: marca d'água derruba a entrega.
3. **Nome do modelo da moto na legenda, na tela e falado.** 71,7% do tráfego do
   TikTok vem de busca por modelo.
4. **Nada novo às 20h nem às 10h no story.** São os dois piores horários medidos.
5. **Facebook é só espelho automático do Instagram.** Nenhuma produção própria,
   nenhum story.
6. **Grave em lote, publique do banco.** O que sai esta semana foi gravado na
   anterior.

---

## A grade gravada — 31 horários fixos

`dia_semana` é 0 = domingo. Não é preferência: o painel indexa `FP_DIAS` direto
por esse número e usa `getDay()` do JavaScript para marcar "hoje". Outra
convenção desalinharia a semana inteira em um dia **sem dar erro nenhum**.

| Dia | 09:30 / 10:00 | 11:00 | 13:00 | 18:00 | 19:00 |
|---|---|---|---|---|---|
| **Domingo** *(melhor dia de reel)* | Reel · colab `ig fb` | o mesmo vídeo `tt yt` | Story `ig` | — | Story · repost `ig` |
| **Segunda** | Reel `ig fb` | o mesmo vídeo `tt yt` | Story `ig` | Vídeo longo `yt` | Story · repost `ig` |
| **Terça** | Reel `ig fb` | o mesmo vídeo `tt yt` | Story `ig` | — | Story · repost `ig` |
| **Quarta** | Reel `ig fb` | o mesmo vídeo `tt yt` | Story `ig` | — | Story · repost `ig` |
| **Quinta** *(melhor dia de story)* | Reel · colab `ig fb` | o mesmo vídeo `tt yt` | Story `ig` | Vídeo longo `yt` | Story · repost `ig` |
| **Sexta** | Reel `ig fb` | o mesmo vídeo `tt yt` | Story `ig` | — | Story · repost `ig` |
| **Sábado** | Carrossel `ig fb` | Vídeo do dia `tt yt` | Story `ig` | — | Reel (o mesmo das 11h) `ig fb` + Story · repost `ig` |

**O sábado é o único dia fora do padrão** e não é engano: o vídeo do dia sai no
TikTok e no Shorts às 11h e só chega ao Instagram às 19h. O rótulo do slot diz
isso na tela justamente para ninguém "consertar" achando que está errado.

---

## Duas coisas que ficaram de fora, e por quê

**A coluna PRODUÇÃO.** "Gravação em lote" (ter e qua) e "10 clipes Mercado
Livre" (sexta) não estão na grade porque o cronograma **não diz a que horas**, e
`mc_planner_grade.hora` é `not null`. Inventar um horário seria transformar
palpite em dado. Basta dizer a hora e viram dois inserts.

**A divisão dos stories.** O mês fecha em 60 stories = 30 próprios + 30 reposts,
com dois slots por dia. A leitura óbvia é um de cada por dia, mas o cronograma
**não diz qual dos dois horários é qual**. Ficou 13h = próprio e 19h = repost,
que é chute meu — inverter é um clique no editor da grade.

---

## Os totais do mês são de setembro/2026, não de qualquer mês

Conferi os oito contra o calendário real e todos batem. Mas eles só batem
**neste mês**:

| | Calendário de set/2026 | Cronograma |
|---|---|---|
| reels/shorts | 30 | 30 |
| publicações (30 × 3 redes) | 90 | 90 |
| vídeos longos (seg + qui) | 8 | 8 |
| colabs (qui + dom) | 8 | 8 |
| carrosséis (sábados) | 4 | 4 |
| stories | 60 | 60 |
| clipes ML (10 por sexta) | 40 | 40 |
| diárias (ter + qua) | 10 | 10 |

O "10 diárias" é o que denuncia: ter + qua em quatro semanas dá 8. Só fecha em
10 porque **setembro de 2026 começa numa terça e tem 5 terças e 5 quartas**. A
grade semanal continua valendo todo mês; a coluna "o mês fecha em" precisa ser
recontada a cada virada.

---

## Armadilha do editor da grade

`mc_planner_grade.observacao` existe na tabela e **não deve ser usada**. O editor
do painel apaga todas as linhas e reinsere ao salvar, e não repassa esse campo:
qualquer coisa escrita nele morre no primeiro clique em Salvar. O que precisa
sobreviver vai no `rotulo`, que o editor preserva.

O editor também não tem campo para `tipo` — ele repassa o que já estava. Mexer no
`tipo` de um slot é por SQL, ou some na próxima edição pela tela.
