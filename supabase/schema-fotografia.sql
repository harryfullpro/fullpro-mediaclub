-- ============================================================================
-- FullPro Media Club · DDL dos módulos "Atualizações do site" e "Fotografia"
--
-- O que é: todas as tabelas e colunas novas de duas entregas do painel —
--   (A) o popup de novidades que abre no login e guarda por usuário o que já
--       foi visto;
--   (B) a seção Fotografia (Produção, Galeria, Dashboard, Separação e
--       Fotografia em Lote), que espelha o catálogo do Bling e controla a fila
--       de fotos, as notas e os lotes de separação.
--
-- Como rodar: Supabase → SQL Editor → New query → cole o arquivo inteiro →
--   Run. Projeto `fullpro_team` (xgaaocnuqgcwttrljqep). Não precisa de ordem
--   especial nem de nada rodado antes; só depende de `mc_admin_users`, que já
--   existe.
--
-- Reexecutável: tudo é `create table if not exists` / `create index if not
--   exists` / `add column if not exists`, e cada política é derrubada antes de
--   ser criada. **Atenção:** `create table if not exists` não altera tabela que
--   já existe — mudar coluna ou CHECK depois desta primeira aplicação é
--   arquivo de migration novo, não editar este.
--
-- Estado em 25/08/2026 (conferido no banco): o BLOCO A **já está aplicado** —
--   `mc_admin_users.prefs` existe e `mc_updates` já tem linhas publicadas, com
--   as quatro políticas para anon+authenticated. Rodar o arquivo inteiro de
--   novo é inofensivo (nada ali muda tabela existente), mas quem só precisa da
--   Fotografia pode rodar do BLOCO B para baixo.
--
-- Nada aqui apaga ou altera dado existente.
-- ============================================================================


-- ############################################################################
-- BLOCO A · ATUALIZAÇÕES DO SITE
-- ############################################################################

-- ----------------------------------------------------------------------------
-- A1) O que cada usuário já viu — coluna em mc_admin_users, não tabela nova.
--
-- Motivo de ser coluna: o `checkAuth()` do painel já faz `select('*')` em
-- mc_admin_users no login, então o valor chega de graça dentro de CURRENT_USER.
-- Numa tabela à parte seria mais uma consulta em toda abertura de painel — e a
-- leitura de mc_admin_users já foi gargalo antes (25 chamadas em 2 minutos,
-- pico de 3,9s), que é justamente o que a deduplicação de fetch tenta conter.
--
-- Formato gravado (o que o admin.html lê hoje, em fpAvisoPrefs):
--   {"avisos": {"updates_vistos": ["<uuid>", ...],
--               "bugs_ate": "<timestamptz>",
--               "requests_ate": "<timestamptz>"}}
-- `updates_vistos` são ids de mc_updates (a lista é cortada nos 200 últimos pelo
-- painel); `bugs_ate` e `requests_ate` são marcas d'água de tempo — relatos de
-- Manutenção e solicitações novas da landing — mais baratas que guardar id por
-- id.
--
-- Fica jsonb solto de propósito: o popup vai ganhar seções novas e cada uma
-- delas não pode virar uma migration. É preferência de exibição, não dado de
-- negócio — nada aqui precisa ser consultado por outro usuário.
--
-- `add column ... default` já preenche as linhas existentes com '{}', então não
-- há UPDATE de backfill a fazer.
-- ----------------------------------------------------------------------------
alter table public.mc_admin_users
  add column if not exists prefs jsonb default '{}'::jsonb;

comment on column public.mc_admin_users.prefs is
  'Preferências e marcas de "já vi isso" do operador. Hoje: {"avisos":{"updates_vistos":[ids de mc_updates],"bugs_ate":"<timestamptz>","requests_ate":"<timestamptz>"}}.';

-- mc_admin_users não ganha política nova: já existe uma ALL para anon+
-- authenticated ("anon and auth can modify admin_users"), então o painel grava
-- prefs sem mais nada.


-- ----------------------------------------------------------------------------
-- A2) mc_updates — o changelog que o popup mostra.
-- Escrita à mão por quem publica a novidade; o operador só lê.
-- ----------------------------------------------------------------------------
create table if not exists public.mc_updates (
  id            uuid        primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),

  -- separado de created_at porque a novidade pode ser cadastrada depois de ter
  -- ido ao ar: quem ordena o popup é a data de publicação, não a de digitação.
  publicado_em  date        not null default current_date,

  tipo          text        not null default 'funcionalidade'
                constraint mc_updates_tipo_check
                check (tipo in ('design','funcionalidade','correcao')),

  titulo        text        not null,
  descricao     text,
  modulo        text,       -- tela a que a novidade pertence, para agrupar no popup

  -- default true porque o editor do painel (fpUpdSalvar) não manda esta coluna:
  -- publicar é o caminho normal. Guardar rascunho — cadastrar a novidade antes
  -- de o código subir, sem o popup anunciar o que ainda não existe — hoje só dá
  -- para fazer com um update manual pondo false.
  publicado     boolean     not null default true
);

create index if not exists mc_updates_publicado_em_idx
  on public.mc_updates (publicado_em desc);

alter table public.mc_updates enable row level security;

-- ATENÇÃO — vale para TODAS as tabelas deste arquivo: as políticas liberam
-- `anon`. O painel não usa Supabase Auth: o login é um select em
-- mc_admin_users comparando hash de senha e o cliente Supabase segue anônimo
-- para sempre. Política só para `authenticated` derruba a tela inteira com
-- "new row violates row-level security policy" — foi o que aconteceu na
-- primeira versão de mc_bug_reports. Se um dia o painel migrar para Supabase
-- Auth, estas políticas são reescritas juntas, não uma de cada vez.
drop policy if exists "painel le updates"      on public.mc_updates;
drop policy if exists "painel cria update"     on public.mc_updates;
drop policy if exists "painel atualiza update" on public.mc_updates;
drop policy if exists "painel apaga update"    on public.mc_updates;

create policy "painel le updates"      on public.mc_updates for select to anon, authenticated using (true);
create policy "painel cria update"     on public.mc_updates for insert to anon, authenticated with check (true);
create policy "painel atualiza update" on public.mc_updates for update to anon, authenticated using (true) with check (true);
create policy "painel apaga update"    on public.mc_updates for delete to anon, authenticated using (true);


-- ############################################################################
-- BLOCO B · FOTOGRAFIA
-- ############################################################################

-- ----------------------------------------------------------------------------
-- B1) mc_photo_products — espelho do catálogo do Bling + estado de fotografia.
--
-- A PK é o SKU, não um uuid: o SKU já é a ponte entre Bling, Magis5 e a pasta
-- do Google Drive (`<raiz>/<SKU>/<SKU>-<n>.jpg`). Com uuid, toda sincronização
-- precisaria de um de-para só para reencontrar a mesma linha.
--
-- A sincronização com o Bling é upsert por SKU: sobrescreve os campos do ERP e
-- não encosta nos campos de estado (prioridade, nota, excluido). Produto novo
-- entra com prioridade NULL = PENDENTE, até um operador definir.
--
-- Booleanos são `not null`: em JavaScript um booleano nulo não é false nem
-- true, e é assim que um filtro de listagem passa a esconder linha sem motivo.
-- ----------------------------------------------------------------------------
create table if not exists public.mc_photo_products (
  sku               text        primary key,

  /* ---- vindo do Bling (sobrescrito a cada sincronização) ---- */
  bling_id          text,

  /* NULLABLE de propósito, e não é frescura: quem grava aqui é o upsert em lote
     do bling-sync (PostgREST, `resolution=merge-duplicates` + on_conflict=sku).
       1. `linhaDoBling()` manda literalmente `nome: null` quando o Bling devolve
          o campo vazio;
       2. a ação `drive` manda só sku + tem_foto + drive_folder_id +
          drive_checado_em — sem a coluna `nome` no corpo.
     Num `insert ... on conflict do update` o Postgres valida NOT NULL na LINHA
     PROPOSTA, antes de resolver o conflito. Com `not null` aqui, o lote de 500
     linhas morreria inteiro com "null value in column nome violates not-null
     constraint" mesmo quando todas as linhas já existiam — a sincronização do
     Drive nunca completaria uma vez sequer. Quem exibe resolve com `nome || ''`
     (o índice de busca abaixo também não depende de valor preenchido). */
  nome              text,
  preco             numeric,
  estoque           numeric,    -- numeric, não integer: há item vendido por metro/peso
  imagem_bling      text,
  sincronizado_em   timestamptz,

  /* ---- estado da foto (vem do Drive) ---- */
  tem_foto          boolean     not null default false,
  fotos_qtd         integer     not null default 0,
  drive_folder_id   text,
  drive_checado_em  timestamptz,

  /* ---- fila de produção ----
     NULL = PENDENTE (produto novo que ninguém classificou ainda).
     1 baixa · 2 média · 3 alta · 5 EMERGENCIAL. O 4 não existe de propósito:
     o emergencial tem que ser visivelmente distante da alta, tanto na régua
     quanto na conversa ("prioridade 5" é o vermelho, não "a próxima acima").
     O CHECK precisa aceitar NULL explicitamente para deixar a intenção clara —
     em SQL `prioridade in (...)` com NULL dá UNKNOWN e passa, mas quem lê o
     schema depois não deve ter que lembrar disso. */
  prioridade        smallint
                    constraint mc_photo_products_prioridade_check
                    check (prioridade is null or prioridade in (1, 2, 3, 5)),
  prioridade_por    text,
  prioridade_em     timestamptz,

  status            text        not null default 'fila'
                    constraint mc_photo_products_status_check
                    check (status in ('fila','separacao','fotografado')),

  /* sem foreign key para mc_photo_batches: lote cancelado ou apagado não pode
     levar junto o histórico do produto, e o lote já guarda o snapshot dos
     itens em `itens`. Aqui basta saber de qual lote a linha saiu. */
  lote_id           uuid,
  fotografado_em    timestamptz,

  /* ---- fora de linha (some da listagem, dá para restaurar) ---- */
  excluido          boolean     not null default false,
  excluido_em       timestamptz,
  excluido_por      text,

  /* ---- avaliação, desnormalizada para a listagem ----
     O histórico completo fica em mc_photo_ratings; estas colunas existem para
     a Galeria desenhar 5.500 cards sem um join por linha.
     `nota_anterior` é o que o card mostra depois que a foto é refeita ("era 1,
     agora 4") — por isso mora aqui e não só no histórico. */
  nota              smallint
                    constraint mc_photo_products_nota_check
                    check (nota between 0 and 5),
  nota_anterior     smallint
                    constraint mc_photo_products_nota_anterior_check
                    check (nota_anterior between 0 and 5),
  nota_em           timestamptz,
  nota_por          text,
  nota_comentario   text,

  -- nota abaixo de 2 marca o produto para refazer a foto. É coluna, e não
  -- `nota < 2` calculado na hora, porque um admin pode querer soltar o produto
  -- sem mudar a nota que ele mesmo deu.
  refazer           boolean     not null default false,

  atualizado_em     timestamptz not null default now()
);

-- A tabela tem ~5.500 linhas: nesse tamanho o planner escolhe seq scan boa
-- parte do tempo e os índices abaixo custam pouco. Eles valem para os filtros
-- seletivos (emergenciais em aberto, produtos excluídos) e continuam valendo
-- quando o catálogo crescer — o dono já autorizou varrer o Bling inteiro, além
-- do teto de 2.000 que o painel lê hoje.
--
-- Os parciais em `excluido = false` são o caminho normal das telas: Produção e
-- Galeria nunca mostram produto fora de linha.
create index if not exists mc_photo_products_prioridade_idx
  on public.mc_photo_products (prioridade) where excluido = false;

create index if not exists mc_photo_products_status_idx
  on public.mc_photo_products (status);

create index if not exists mc_photo_products_tem_foto_idx
  on public.mc_photo_products (tem_foto) where excluido = false;

-- invertido de propósito: quem filtra por `excluido = true` é só a tela de
-- restaurar, um punhado de linhas. O outro lado é quase a tabela toda e
-- nenhum índice ajudaria.
create index if not exists mc_photo_products_excluido_idx
  on public.mc_photo_products (excluido) where excluido = true;

create index if not exists mc_photo_products_lote_idx
  on public.mc_photo_products (lote_id) where lote_id is not null;

-- Busca por nome: GIN de tsvector, e não btree em lower(nome).
--
-- A EXPRESSÃO TEM QUE SER `to_tsvector('portuguese', nome)`, sem coalesce nem
-- unaccent por cima da coluna. O painel não escreve SQL: ele chama
--   sb.from('mc_photo_products').textSearch('nome', termo, { config: 'portuguese' })
-- que vira `?nome=fts(portuguese).termo` e o PostgREST monta exatamente
-- `to_tsvector('portuguese', nome) @@ to_tsquery('portuguese', ...)`. Qualquer
-- função embrulhando a coluna no índice (coalesce, lower, unaccent) deixa de
-- casar com essa expressão e o índice vira peso morto — a busca continua
-- respondendo, por seq scan, e ninguém percebe até a tabela crescer.
-- Coluna nula não é problema: `to_tsvector` de NULL é NULL e simplesmente não
-- casa com nenhuma consulta.
--
-- Três razões para o tsvector, nesta ordem:
--   1. pg_trgm não está instalado neste projeto (só pgcrypto, uuid-ossp e
--      pg_stat_statements), então busca por substring `%termo%` não tem índice
--      possível sem antes habilitar extensão — decisão que não é deste arquivo.
--   2. O banco está em collation en_US.UTF-8, onde um btree comum nem sequer
--      acelera prefixo: precisaria de `text_pattern_ops`.
--   3. O operador busca por palavra e fora de ordem ("ls2 capacete" achando
--      "Capacete LS2 Vector"), que é exatamente o que o tsvector resolve, com
--      plural e flexão de brinde ('portuguese' faz o stemming).
-- Limitação conhecida: sem a extensão `unaccent`, "valvula" não acha "válvula".
-- Se isso incomodar na prática, é habilitar unaccent, recriar este índice E
-- trocar a chamada do painel por um `.filter()` com a mesma expressão — o
-- `.textSearch()` não sabe embrulhar a coluna.
--
-- Em SQL cru, a consulta precisa repetir a expressão igual para usar o índice:
--   where to_tsvector('portuguese', nome) @@ plainto_tsquery('portuguese', $1)
create index if not exists mc_photo_products_nome_busca_idx
  on public.mc_photo_products
  using gin (to_tsvector('portuguese', nome));

comment on column public.mc_photo_products.prioridade is
  'NULL = PENDENTE (ninguém classificou). 1 baixa (azul) · 2 média (amarelo) · 3 alta (laranja) · 5 EMERGENCIAL (vermelho).';

-- ----------------------------------------------------------------------------
-- atualizado_em precisa de gatilho — não dá para deixar por conta de quem grava.
--
-- Nenhum dos dois escritores de hoje manda a coluna: o upsert do bling-sync
-- envia só os campos do ERP (sku, bling_id, nome, preco, estoque, imagem_bling,
-- sincronizado_em) e a ação `drive` só os campos do Drive. Num
-- `on conflict do update` o PostgREST atualiza SOMENTE as chaves presentes no
-- JSON, então sem gatilho a coluna congela na data do primeiro insert e mente
-- para sempre — e "atualizado há 3 meses" numa tela de fila é o tipo de erro que
-- ninguém desconfia.
--
-- `new is distinct from old` evita o efeito contrário: a varredura do Drive
-- reescreve as ~5.500 linhas de uma vez, e carimbar todas zeraria o valor de
-- "isto mudou agora". Só carimba quando algum campo realmente mudou.
--
-- Frescor de sincronização continua em `sincronizado_em` / `drive_checado_em`;
-- esta coluna é "última mudança de qualquer campo", inclusive as do operador.
-- ----------------------------------------------------------------------------
create or replace function public.mc_photo_products_carimba_atualizado()
returns trigger
language plpgsql
-- search_path vazio: função de gatilho sem esquema fixo é achado do linter do
-- Supabase, e aqui só se usa now(), que vem de pg_catalog.
set search_path = ''
as $$
begin
  if new is distinct from old then
    new.atualizado_em = now();
  end if;
  return new;
end;
$$;

drop trigger if exists mc_photo_products_carimba_atualizado_tg on public.mc_photo_products;
create trigger mc_photo_products_carimba_atualizado_tg
  before update on public.mc_photo_products
  for each row execute function public.mc_photo_products_carimba_atualizado();


-- ----------------------------------------------------------------------------
-- B2) mc_photo_ratings — histórico de avaliações.
--
-- mc_photo_products guarda a nota atual e a anterior porque é o que o card
-- mostra; aqui fica a série inteira, que é de onde sai a nota média do
-- dashboard e a resposta para "quem avaliou isso e quando".
--
-- `sku` sem foreign key para mc_photo_products: a avaliação é registro
-- histórico e não pode sumir se o produto for retirado do espelho numa
-- sincronização futura.
--
-- `autor_id`/`autor_nome` também sem FK para mc_admin_users, aqui e em todas as
-- tabelas deste arquivo: o painel grava o nome como texto (é o que aparece no
-- card, sem join) e um usuário desligado da equipe não pode apagar histórico em
-- cascata. É o mesmo desenho de mc_bug_reports.
-- ----------------------------------------------------------------------------
create table if not exists public.mc_photo_ratings (
  id          uuid        primary key default gen_random_uuid(),
  sku         text        not null,
  nota        smallint    not null
              constraint mc_photo_ratings_nota_check
              check (nota between 0 and 5),
  comentario  text,
  autor_id    uuid,
  autor_nome  text,
  created_at  timestamptz not null default now()
);

-- composto: a pergunta é sempre "as avaliações deste SKU, da mais recente para
-- a mais antiga" — o card precisa da última e da penúltima.
create index if not exists mc_photo_ratings_sku_idx
  on public.mc_photo_ratings (sku, created_at desc);


-- ----------------------------------------------------------------------------
-- B3) mc_photo_files — uma linha por foto enviada pelo painel.
--
-- O arquivo em si NÃO passa por aqui: o navegador já entrega a imagem no
-- tamanho certo (limite de ~350 KB) e ela vai direto para a pasta <SKU> do
-- Drive compartilhado. Esta tabela é só o registro que alimenta o dashboard
-- ("fotos feitas este mês") e a galeria.
-- ----------------------------------------------------------------------------
create table if not exists public.mc_photo_files (
  id                uuid        primary key default gen_random_uuid(),
  sku               text        not null,

  -- unique: é o que torna o registro idempotente. Se o upload responder e a
  -- gravação aqui falhar, a repetição não duplica a contagem do dashboard.
  -- Nulo é permitido (upload cujo id do Drive não voltou) e o Postgres aceita
  -- vários nulos num unique.
  drive_file_id     text        unique,

  file_name         text,       -- padrão em produção: <SKU>-<n>.jpg|jpeg
  tamanho_bytes     integer,
  enviado_por_id    uuid,
  enviado_por_nome  text,
  created_at        timestamptz not null default now()
);

create index if not exists mc_photo_files_sku_idx
  on public.mc_photo_files (sku);

-- as 15 fotos recentes e o corte do mês saem daqui; o "quantos produtos foram
-- fotografados no mês" é um count(distinct sku) sobre a mesma janela.
create index if not exists mc_photo_files_criado_idx
  on public.mc_photo_files (created_at desc);


-- ----------------------------------------------------------------------------
-- B4) mc_photo_batches — lote montado pela Separação.
--
-- `itens` é snapshot, não ponteiro: o lote tem que continuar mostrando o que
-- foi pedido mesmo que o produto mude de estoque, de prioridade ou saia de
-- linha depois. Formato: [{"sku","nome","estoque","prioridade"}, ...].
-- ----------------------------------------------------------------------------
create table if not exists public.mc_photo_batches (
  id                  uuid        primary key default gen_random_uuid(),
  created_at          timestamptz not null default now(),
  criado_por_id       uuid,
  criado_por_nome     text,
  tamanho             integer,    -- 10 / 15 / 20 / 30 pedido pelo operador

  itens               jsonb       not null default '[]'::jsonb,

  /* ---- envio por DM no Slack ----
     slack_ok tem três estados de propósito: NULL = ainda não tentou enviar,
     true = entregue, false = falhou (o motivo fica em slack_erro). Com
     `not null default false` não daria para distinguir "não enviado" de
     "deu erro", e é exatamente essa a pergunta na hora de reenviar. */
  slack_destino       text,       -- id do canal/usuário no Slack
  slack_destino_nome  text,       -- nome legível, para o painel não ter que consultar o Slack
  slack_ok            boolean,
  slack_erro          text,

  status              text        not null default 'aberto'
                      constraint mc_photo_batches_status_check
                      check (status in ('aberto','fotografado','cancelado'))
);

-- a tela Fotografia em Lote abre sempre no último lote enviado.
create index if not exists mc_photo_batches_criado_idx
  on public.mc_photo_batches (created_at desc);

-- parcial: "lotes em aberto" é um número do dashboard e os fechados só crescem.
create index if not exists mc_photo_batches_aberto_idx
  on public.mc_photo_batches (created_at desc) where status = 'aberto';


-- ############################################################################
-- RLS — as quatro tabelas de Fotografia
--
-- De novo, porque já derrubou tabela antes: TEM que liberar `anon`. O painel
-- não usa Supabase Auth, o cliente Supabase é anônimo e política restrita a
-- `authenticated` rejeita todo mundo. Quem separa admin de operador é o painel
-- (só admin avalia, por exemplo), não a RLS.
--
-- O preço disso, dito por extenso porque ninguém deve descobrir sozinho depois:
-- com a anon key pública no config.js, qualquer um que a copie escreve nestas
-- cinco tabelas. É a mesma exposição do resto do painel — a raiz está em
-- docs/padroes.md ("O painel não usa Supabase Auth") e a correção de verdade é
-- migrar para o Supabase Auth, projeto à parte, irmão da pendência "a sessão é
-- o UUID do usuário, sem assinatura" (docs/pendencias.md). Não é remendo de
-- tabela e NÃO se resolve trocando estas políticas por `authenticated`.
-- ############################################################################

alter table public.mc_photo_products enable row level security;
alter table public.mc_photo_ratings  enable row level security;
alter table public.mc_photo_files    enable row level security;
alter table public.mc_photo_batches  enable row level security;

/* ---- mc_photo_products ---- */
drop policy if exists "painel le produtos foto"      on public.mc_photo_products;
drop policy if exists "painel cria produto foto"     on public.mc_photo_products;
drop policy if exists "painel atualiza produto foto" on public.mc_photo_products;
drop policy if exists "painel apaga produto foto"    on public.mc_photo_products;

create policy "painel le produtos foto"      on public.mc_photo_products for select to anon, authenticated using (true);
create policy "painel cria produto foto"     on public.mc_photo_products for insert to anon, authenticated with check (true);
create policy "painel atualiza produto foto" on public.mc_photo_products for update to anon, authenticated using (true) with check (true);
create policy "painel apaga produto foto"    on public.mc_photo_products for delete to anon, authenticated using (true);

/* ---- mc_photo_ratings ---- */
drop policy if exists "painel le avaliacoes"      on public.mc_photo_ratings;
drop policy if exists "painel cria avaliacao"     on public.mc_photo_ratings;
drop policy if exists "painel atualiza avaliacao" on public.mc_photo_ratings;
drop policy if exists "painel apaga avaliacao"    on public.mc_photo_ratings;

create policy "painel le avaliacoes"      on public.mc_photo_ratings for select to anon, authenticated using (true);
create policy "painel cria avaliacao"     on public.mc_photo_ratings for insert to anon, authenticated with check (true);
create policy "painel atualiza avaliacao" on public.mc_photo_ratings for update to anon, authenticated using (true) with check (true);
create policy "painel apaga avaliacao"    on public.mc_photo_ratings for delete to anon, authenticated using (true);

/* ---- mc_photo_files ---- */
drop policy if exists "painel le fotos"      on public.mc_photo_files;
drop policy if exists "painel cria foto"     on public.mc_photo_files;
drop policy if exists "painel atualiza foto" on public.mc_photo_files;
drop policy if exists "painel apaga foto"    on public.mc_photo_files;

create policy "painel le fotos"      on public.mc_photo_files for select to anon, authenticated using (true);
create policy "painel cria foto"     on public.mc_photo_files for insert to anon, authenticated with check (true);
create policy "painel atualiza foto" on public.mc_photo_files for update to anon, authenticated using (true) with check (true);
create policy "painel apaga foto"    on public.mc_photo_files for delete to anon, authenticated using (true);

/* ---- mc_photo_batches ---- */
drop policy if exists "painel le lotes"      on public.mc_photo_batches;
drop policy if exists "painel cria lote"     on public.mc_photo_batches;
drop policy if exists "painel atualiza lote" on public.mc_photo_batches;
drop policy if exists "painel apaga lote"    on public.mc_photo_batches;

create policy "painel le lotes"      on public.mc_photo_batches for select to anon, authenticated using (true);
create policy "painel cria lote"     on public.mc_photo_batches for insert to anon, authenticated with check (true);
create policy "painel atualiza lote" on public.mc_photo_batches for update to anon, authenticated using (true) with check (true);
create policy "painel apaga lote"    on public.mc_photo_batches for delete to anon, authenticated using (true);


-- ----------------------------------------------------------------------------
-- Permissões de tabela (o andar de baixo da RLS)
--
-- O Supabase concede isso por default privilege quando a tabela nasce, mas o
-- default privilege é por papel criador: rodando este arquivo com um papel
-- diferente do esperado, a política liberaria a linha e o GRANT continuaria
-- faltando — o painel tomaria "permission denied for table", que não se parece
-- em nada com um problema de RLS. Explicitar é barato e não amplia nada além
-- do que as políticas acima já permitem.
-- ----------------------------------------------------------------------------
grant select, insert, update, delete on public.mc_updates        to anon, authenticated;
grant select, insert, update, delete on public.mc_photo_products to anon, authenticated;
grant select, insert, update, delete on public.mc_photo_ratings  to anon, authenticated;
grant select, insert, update, delete on public.mc_photo_files    to anon, authenticated;
grant select, insert, update, delete on public.mc_photo_batches  to anon, authenticated;


-- ----------------------------------------------------------------------------
-- O PostgREST responde por um cache de esquema. O Supabase costuma recarregá-lo
-- sozinho por event trigger de DDL, mas quando não recarrega o painel devolve
-- "Could not find the table 'public.mc_photo_products' in the schema cache"
-- (PGRST205) — erro que parece tabela inexistente e manda o próximo a rodar o
-- arquivo de novo à toa. Este NOTIFY custa nada e fecha a porta.
-- ----------------------------------------------------------------------------
notify pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────────────────────
-- Panorama do Dashboard em uma ida só (2026-08-26)
--
-- O painel baixava o catálogo inteiro (2.566 linhas, três páginas de 1.000) só
-- para contar, e depois disparava mais três consultas. Perto de dois segundos
-- de área vazia. Agora o banco conta e devolve tudo junto.
-- security invoker (padrão): a RLS de quem chama continua valendo.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.mc_photo_panorama(p_inicio_mes timestamptz)
returns json
language sql
stable
as $$
  select json_build_object(
    'ativos',     (select count(*) from mc_photo_products where excluido is not true),
    'com_foto',   (select count(*) from mc_photo_products where excluido is not true and tem_foto is true),
    'sem_foto',   (select count(*) from mc_photo_products where excluido is not true and tem_foto is not true),
    'avaliados',  (select count(*) from mc_photo_products where excluido is not true and nota is not null),
    'nota_media', (select avg(nota) from mc_photo_products where excluido is not true and nota is not null),
    'p5',   (select count(*) from mc_photo_products where excluido is not true and tem_foto is not true and prioridade = 5),
    'p3',   (select count(*) from mc_photo_products where excluido is not true and tem_foto is not true and prioridade = 3),
    'p2',   (select count(*) from mc_photo_products where excluido is not true and tem_foto is not true and prioridade = 2),
    'p1',   (select count(*) from mc_photo_products where excluido is not true and tem_foto is not true and prioridade = 1),
    'pend', (select count(*) from mc_photo_products where excluido is not true and tem_foto is not true and prioridade is null),
    -- o início do mês vem do navegador, para respeitar o fuso de quem olha
    'fotos_mes',    (select count(*) from mc_photo_files where created_at >= p_inicio_mes),
    'produtos_mes', (select count(distinct sku) from mc_photo_files where created_at >= p_inicio_mes),
    'recentes', (select coalesce(json_agg(t), '[]'::json) from (
        select sku, drive_file_id, file_name, created_at
          from mc_photo_files order by created_at desc limit 15) t),
    'lotes', (select coalesce(json_agg(t), '[]'::json) from (
        select id, created_at, criado_por_nome, slack_destino_nome, tamanho
          from mc_photo_batches where status = 'aberto' order by created_at desc limit 5) t),
    'sem_foto_estoque', (select coalesce(json_agg(t), '[]'::json) from (
        select sku, nome, estoque, prioridade, imagem_bling
          from mc_photo_products
         where excluido is not true and tem_foto is not true
         order by estoque desc nulls last limit 8) t)
  );
$$;

grant execute on function public.mc_photo_panorama(timestamptz) to anon, authenticated;
