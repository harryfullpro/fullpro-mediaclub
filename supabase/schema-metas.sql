-- ============================================================================
-- METAS — o modelo novo (27/08/2026)
--
-- O que havia antes: mc_performance_goals com QUATRO colunas de alvo
-- (volume_long_target, volume_short_target, views_target, clicks_target) e o
-- realizado contado em JavaScript sobre o array PROJECTS em memória. Três
-- defeitos medidos no código antes de trocar:
--
--   1. Contagem em dobro — getPublishedThisMonth varria p.destinations e, logo
--      abaixo, varria os MESMOS dados via getAllProjectPosts somando de novo.
--   2. O segundo laço não filtrava mês: somava o histórico inteiro numa tela
--      chamada "Metas da equipe — <mês>".
--   3. A data era `production_date`, a data da GRAVAÇÃO. Vídeo gravado em julho
--      e publicado em agosto contava em julho.
--
-- mc_performance_goals CONTINUA existindo e continua mandando no dinheiro
-- (pool_per_goal e os três percentuais de rateio). O que saiu de lá foi a
-- definição das metas.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- mc_pecas — uma linha por peça que foi ao ar.
--
-- `publicado_em` vem da PLATAFORMA, não da gravação. É a correção que faz
-- qualquer meta mensal fechar honestamente.
--
-- `bruto` guarda o que a API respondeu. Não é preguiça de modelar: a regra de
-- classificação vai mudar (a faixa "10-15 min" foi decidida antes de alguém
-- medir o canal), e com o bruto guardado reclassificar é reprocessar. Sem ele
-- seria refazer a coleta — e story não volta: a API do Instagram só devolve as
-- últimas 24 horas.
--
-- O índice único é PARCIAL porque peça manual não tem `externo_id`, e várias
-- linhas com NULL não podem colidir entre si.
-- ---------------------------------------------------------------------------
create table if not exists public.mc_pecas (
  id            uuid        primary key default gen_random_uuid(),
  fonte         text        not null check (fonte in ('instagram','youtube','tiktok','clip','manual')),
  externo_id    text,
  tipo          text        not null check (tipo in ('short','longo','longo_10_15','pure_sound',
                                                     'carrossel','story','repost','clip','outro')),
  plataforma    text,
  titulo        text,
  link          text,
  publicado_em  timestamptz not null,
  duracao_seg   integer,
  -- Nenhuma API diz se uma peça é recompartilhamento. Vem marcado à mão, num
  -- toque, sobre a lista que o coletor já trouxe.
  eh_repost     boolean     not null default false,
  repost_por    uuid        references public.mc_admin_users(id) on delete set null,
  repost_em     timestamptz,
  metricas      jsonb       not null default '{}'::jsonb,
  bruto         jsonb       not null default '{}'::jsonb,
  project_id    uuid,
  sku           text,
  criado_por    uuid        references public.mc_admin_users(id) on delete set null,
  coletado_em   timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

/* NÃO volte a pôr `where externo_id is not null` aqui. [31/08/2026]
   O índice era parcial, e por isso o coletor NUNCA gravou: o painel escreve
   pelo PostgREST, com upsert(onConflict:'fonte,externo_id'), e o PostgREST não
   tem como mandar o predicado junto. Sem ele o Postgres não acha árbitro e
   responde "there is no unique or exclusion constraint matching the ON CONFLICT
   specification" — toda coleta terminava em "gravadas: 0". Em SQL à mão
   funcionava, repetindo o WHERE, e foi assim que as linhas de teste entraram:
   o furo só aparecia pelo caminho de verdade.
   O parcial também não protegia nada: índice único comum já trata NULL como
   distinto de NULL, que era a intenção do WHERE. */
create unique index if not exists mc_pecas_externo_uidx
  on public.mc_pecas (fonte, externo_id);
create index if not exists mc_pecas_periodo_idx
  on public.mc_pecas (publicado_em desc, tipo);

-- ---------------------------------------------------------------------------
-- mc_metas_alvo — o alvo de cada meta, por mês.
--
-- Tabela filha em vez de mais colunas: setembro tem sete metas e agosto tinha
-- três. Cada meta nova viraria uma coluna, uma migração e um campo no modal.
-- Como linha, o dono cria e apaga meta sem ninguém tocar no schema.
--
-- `modo`:
--   contagem — bateu quando o total do mês alcança o alvo (30 stories).
--   cadencia — bateu no DIA em que houve pelo menos `alvo` peças; o mês é
--              medido em dias cumpridos sobre dias corridos. "Reposts diários"
--              com 30 num dia só e nada no resto do mês não é repost diário.
-- ---------------------------------------------------------------------------
create table if not exists public.mc_metas_alvo (
  id        uuid    primary key default gen_random_uuid(),
  mes       text    not null check (mes ~ '^\d{4}-\d{2}$'),
  chave     text    not null,
  rotulo    text    not null,
  detalhe   text,
  alvo      integer not null check (alvo > 0),
  modo      text    not null default 'contagem' check (modo in ('contagem','cadencia')),
  -- Quais `tipo` de mc_pecas contam. Array porque "vídeo curto" é a soma de
  -- três plataformas e o dono pensa nelas como uma coisa só.
  tipos     text[]  not null default '{}',
  ordem     integer not null default 0,
  criado_em timestamptz not null default now()
);

create unique index if not exists mc_metas_alvo_mes_chave_uidx
  on public.mc_metas_alvo (mes, chave);

-- O painel grava as metas com `upsert ... on conflict (month)`. Antes era
-- `update` pelo id da linha carregada com o mês DENTRO do payload: escolher
-- outro mês no modal RENOMEAVA a linha existente em vez de criar uma nova, e as
-- metas do mês anterior desapareciam.
create unique index if not exists mc_performance_goals_mes_uidx
  on public.mc_performance_goals (month);

alter table public.mc_pecas      enable row level security;
alter table public.mc_metas_alvo enable row level security;

drop policy if exists mc_pecas_operador on public.mc_pecas;
create policy mc_pecas_operador on public.mc_pecas
  for all to authenticated using (true) with check (true);

drop policy if exists mc_metas_alvo_operador on public.mc_metas_alvo;
create policy mc_metas_alvo_operador on public.mc_metas_alvo
  for all to authenticated using (true) with check (true);
