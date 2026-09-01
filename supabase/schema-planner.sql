-- ============================================================================
-- PLANNER DE PUBLICAÇÕES — cronograma semanal + fila de agendamento
-- (01/09/2026)
--
-- Duas coisas diferentes moram aqui, e é por isso que são tabelas separadas:
--
--   1. mc_planner_grade — o COMBINADO com o analista de social media:
--      "terça 18h sai short no Instagram e no TikTok". É uma REGRA. Não tem
--      arquivo, não tem data, não vira post sozinha, e se repete toda semana.
--   2. mc_publicacoes (+ mc_publicacoes_destino) — o POST de verdade: arquivo,
--      legenda, hora marcada e uma linha por REDE.
--
-- Misturar os dois numa tabela só custaria caro do jeito silencioso: apagar um
-- horário do cronograma apagaria o histórico de tudo que já saiu naquele slot.
-- Por isso `slot_id` é ON DELETE SET NULL — o cronograma muda toda semana, e a
-- publicação que já foi ao ar não pode sumir junto.
--
-- ATENÇÃO AO APLICAR — as três tabelas JÁ EXISTEM no banco (conferido em
-- 01/09/2026, as três com 0 linhas). `create table if not exists` NÃO altera
-- tabela existente: ele simplesmente não faz nada. Por isso cada coluna vem
-- também como `add column if not exists` e cada constraint como
-- `drop constraint if exists` + `add constraint`. Rodar este arquivo por cima
-- do que está no ar CONVERGE o schema em vez de fingir que gravou — que é
-- exatamente a armadilha em que o índice parcial do mc_pecas caiu em 31/08.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1) mc_planner_grade — o cronograma semanal.
--
-- `dia_semana` 0-6 com 0 = domingo, para bater com o getDay() do JavaScript. O
-- painel indexa FP_DIAS direto por esse número; qualquer outra convenção
-- (ISO, 1 = segunda) desalinharia a semana inteira em um dia sem dar erro.
--
-- `hora` é `time`, NÃO timestamptz, e a diferença é a decisão de modelagem mais
-- importante deste arquivo. A grade é uma regra de relógio de parede: "18h" em
-- São Paulo continua sendo 18h depois de qualquer mudança de horário. Já
-- `mc_publicacoes.agendado_para` é um INSTANTE e por isso é timestamptz. Guardar
-- a grade como timestamptz obrigaria a inventar uma data para uma regra que não
-- tem data, e a publicação nasceria com uma hora deslocada.
--
-- `plataformas` é array e não tabela filha porque aqui é só uma lista de
-- rótulos: ninguém precisa de status, erro ou id externo por plataforma numa
-- REGRA. Em mc_publicacoes_destino, onde cada rede tem estado próprio, a
-- escolha se inverte — e é a comparação entre as duas que explica as duas.
-- ---------------------------------------------------------------------------
create table if not exists public.mc_planner_grade (
  id          uuid        primary key default gen_random_uuid(),
  dia_semana  smallint    not null check (dia_semana >= 0 and dia_semana <= 6),
  hora        time        not null,
  rotulo      text,
  tipo        text,
  plataformas text[]      not null default '{}',
  observacao  text,
  ativo       boolean     not null default true,
  criado_em   timestamptz not null default now()
);

alter table public.mc_planner_grade add column if not exists rotulo      text;
alter table public.mc_planner_grade add column if not exists tipo        text;
alter table public.mc_planner_grade add column if not exists plataformas text[] not null default '{}';
alter table public.mc_planner_grade add column if not exists observacao  text;
alter table public.mc_planner_grade add column if not exists ativo       boolean not null default true;
alter table public.mc_planner_grade add column if not exists criado_em   timestamptz not null default now();

-- O painel lê com `.order('dia_semana').order('hora')`. Índice na mesma ordem
-- da consulta — hoje são doze linhas e faz pouca diferença, mas é o que impede
-- a grade de virar sort em memória quando ela crescer.
create index if not exists mc_planner_grade_semana_idx
  on public.mc_planner_grade (dia_semana, hora);


-- ---------------------------------------------------------------------------
-- 2) mc_publicacoes — uma linha por publicação PLANEJADA (o "post").
--
-- `midia_caminho` é a chave no bucket e é ela que manda; `midia_url` é cache da
-- URL pública, guardada porque quem publica é servidor de terceiro (a Meta faz
-- cURL na URL que a gente entrega) e refazer essa URL a cada tentativa é
-- trabalho repetido. Se um dia o bucket virar privado, `midia_caminho` continua
-- válido e só a URL precisa ser regerada — por isso as duas colunas, e não só a
-- URL.
--
-- `agendado_para` é timestamptz: o instante absoluto em que a fila tem que
-- disparar. Vem do `new Date(quando).toISOString()` do painel, então o fuso do
-- operador já entra resolvido.
--
-- `slot_id` é a amarração com o cronograma — de qual linha da grade este post
-- nasceu. Fica nulo em publicação avulsa, que é o caso comum.
-- ---------------------------------------------------------------------------
create table if not exists public.mc_publicacoes (
  id            uuid        primary key default gen_random_uuid(),
  titulo        text,
  legenda       text,
  tipo          text,
  midia_caminho text,
  midia_url     text,
  midia_mime    text,
  agendado_para timestamptz,
  status        text        not null default 'agendada',
  project_id    uuid references public.mc_projects(id)      on delete set null,
  slot_id       uuid references public.mc_planner_grade(id) on delete set null,
  criado_por    uuid,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

alter table public.mc_publicacoes add column if not exists legenda       text;
alter table public.mc_publicacoes add column if not exists tipo          text;
alter table public.mc_publicacoes add column if not exists midia_caminho text;
alter table public.mc_publicacoes add column if not exists midia_url     text;
alter table public.mc_publicacoes add column if not exists midia_mime    text;
alter table public.mc_publicacoes add column if not exists agendado_para timestamptz;
alter table public.mc_publicacoes add column if not exists project_id    uuid;
alter table public.mc_publicacoes add column if not exists slot_id       uuid;
alter table public.mc_publicacoes add column if not exists criado_por    uuid;
alter table public.mc_publicacoes add column if not exists atualizado_em timestamptz not null default now();

-- `criado_por` estava SEM chave estrangeira no banco (conferido 01/09). O
-- painel grava CURRENT_USER.id, que é mc_admin_users.id. Sem a FK, operador
-- removido deixava uuid órfão apontando para lugar nenhum e a tela de fila
-- mostraria autor em branco sem explicação. SET NULL e não CASCADE: demitir
-- alguém não pode apagar o que a pessoa publicou.
alter table public.mc_publicacoes drop constraint if exists mc_publicacoes_criado_por_fkey;
alter table public.mc_publicacoes add  constraint mc_publicacoes_criado_por_fkey
  foreign key (criado_por) references public.mc_admin_users(id) on delete set null;

/* O vocabulário de `tipo` é o MESMO de mc_pecas, de propósito e por inteiro.
   A peça publicada hoje é coletada amanhã pelo coletor-pecas e vai contar meta
   em mc_metas_alvo, que casa por `tipo`. Dois vocabulários seriam duas listas
   para manter em sincronia, e a meta erraria calada no dia em que divergissem.
   Repare que a lista inclui 'longo' E 'longo_10_15': o <select> do painel
   oferece 'longo' (medido em admin.html), e o pedido falava em 'longo_10_15'.
   Aceitar os dois é o que impede o agendamento de morrer com violação de check
   na primeira vez que alguém escolher "vídeo longo". */
alter table public.mc_publicacoes drop constraint if exists mc_publicacoes_tipo_check;
alter table public.mc_publicacoes add  constraint mc_publicacoes_tipo_check
  check (tipo is null or tipo = any (array['short','longo','longo_10_15','pure_sound',
                                           'carrossel','story','repost','clip','outro']));

/* ATENÇÃO — 'publicada', com A. Ver o bloco NÃO RESOLVIDO no fim do arquivo:
   o painel compara com 'publicado' em duas linhas e essa diferença de uma letra
   tem consequência visível. Não mexa aqui sem ler lá. */
alter table public.mc_publicacoes drop constraint if exists mc_publicacoes_status_check;
alter table public.mc_publicacoes add  constraint mc_publicacoes_status_check
  check (status = any (array['rascunho','agendada','enviando','publicada','erro','cancelada']));

-- Índice PARCIAL aqui é o uso legítimo: quem varre esta tabela é o worker da
-- fila, perguntando sempre "o que está agendado e ainda não saiu?". O que já
-- foi publicado é a maior parte da tabela com o tempo e nunca aparece nessa
-- pergunta. (Diferente do caso do mc_pecas, onde o parcial quebrou o upsert do
-- PostgREST: ali o índice era ÚNICO e servia de árbitro de ON CONFLICT. Este
-- não é único e não arbitra nada.)
create index if not exists mc_publicacoes_agenda_idx
  on public.mc_publicacoes (agendado_para)
  where status in ('agendada','enviando');


-- ---------------------------------------------------------------------------
-- 3) mc_publicacoes_destino — uma linha por REDE de cada publicação.
--
-- POR QUE ISTO É TABELA SEPARADA, e não quatro colunas em mc_publicacoes:
--
--   a) Cada rede falha sozinha, e por motivo próprio. Hoje mesmo, com as
--      credenciais que existem: o Instagram publica, o TikTok sai restrito
--      porque falta auditoria do Direct Post, o YouTube nem sobe porque o que
--      temos é CHAVE de API e upload exige OAuth. Uma publicação marcada para
--      as quatro redes termina em três estados diferentes ao mesmo tempo.
--   b) Cada rede devolve um ID e um link PRÓPRIOS. São dados dela, não da
--      publicação.
--   c) Cada rede tem contagem de tentativas própria — o YouTube estourou cota
--      diária e precisa esperar o dia virar; o Instagram falhou por timeout e
--      pode tentar de novo em um minuto. Uma contagem só obrigaria a reenviar
--      para quem já publicou, e reenviar significa post duplicado.
--
-- POR QUE O STATUS FICA AQUI, e não (só) na publicação: com status único, um
-- envio que deu certo em duas de quatro redes obrigaria a escolher entre
-- 'publicada' e 'erro' — as duas mentiras. O status da publicação, se for
-- usado, é resumo dos destinos; a VERDADE é esta tabela.
--
-- A única (publicacao_id, rede) é o que impede post duplicado: se o worker
-- rodar duas vezes, ou o operador marcar Instagram duas vezes na tela, a
-- segunda linha esbarra na constraint em vez de virar segundo post na conta.
-- Ela também é o alvo natural de um `upsert` do worker.
--
-- ON DELETE CASCADE aqui (e SET NULL nas outras FKs): destino não existe sem a
-- publicação — apagou o post, os destinos dele não são nada.
-- ---------------------------------------------------------------------------
create table if not exists public.mc_publicacoes_destino (
  id            uuid        primary key default gen_random_uuid(),
  publicacao_id uuid        not null references public.mc_publicacoes(id) on delete cascade,
  rede          text        not null check (rede in ('instagram','facebook','tiktok','youtube')),
  status        text        not null default 'fila',
  tentativas    smallint    not null default 0,
  erro          text,
  id_externo    text,
  link          text,
  publicado_em  timestamptz,
  atualizado_em timestamptz not null default now(),
  unique (publicacao_id, rede)
);

alter table public.mc_publicacoes_destino add column if not exists tentativas    smallint not null default 0;
alter table public.mc_publicacoes_destino add column if not exists erro          text;
alter table public.mc_publicacoes_destino add column if not exists id_externo    text;
alter table public.mc_publicacoes_destino add column if not exists link          text;
alter table public.mc_publicacoes_destino add column if not exists publicado_em  timestamptz;
alter table public.mc_publicacoes_destino add column if not exists atualizado_em timestamptz not null default now();

alter table public.mc_publicacoes_destino drop constraint if exists mc_publicacoes_destino_rede_check;
alter table public.mc_publicacoes_destino add  constraint mc_publicacoes_destino_rede_check
  check (rede = any (array['instagram','facebook','tiktok','youtube']));

-- 'cancelado' não estava no pedido e fica: cancelar a publicação inteira tem
-- que deixar rastro em cada rede que ainda não tinha saído, sem apagar as que
-- já saíram.
alter table public.mc_publicacoes_destino drop constraint if exists mc_publicacoes_destino_status_check;
alter table public.mc_publicacoes_destino add  constraint mc_publicacoes_destino_status_check
  check (status = any (array['fila','enviando','publicado','erro','cancelado']));

-- A pergunta do worker é "o que está na fila?", e a do painel é "os destinos
-- desta publicação". Esta ordem (status, publicacao_id) serve as duas.
create index if not exists mc_pub_destino_fila_idx
  on public.mc_publicacoes_destino (status, publicacao_id);

/* A leitura do painel é
     .select('*, destinos:mc_publicacoes_destino(*)')
   e isso só funciona por causa da FK acima: o PostgREST descobre o
   relacionamento pela chave estrangeira, não pelo nome das colunas.
   Apagar a FK derruba a tela com "could not find a relationship".
   https://docs.postgrest.org/en/v12/references/api/resource_embedding.html */


-- ---------------------------------------------------------------------------
-- 4) atualizado_em de verdade.
--
-- As duas tabelas nasceram com `default now()` e SEM gatilho (conferido). Um
-- default só vale no INSERT: a coluna diria "atualizado" na hora em que a linha
-- foi CRIADA e nunca mais mudaria. Como é justamente a fila — onde o worker
-- muda status várias vezes — a coluna estaria mentindo exatamente no caso para
-- o qual ela existe.
-- ---------------------------------------------------------------------------
create or replace function public.mc_toca_atualizado_em()
returns trigger
language plpgsql
as $fn$
begin
  new.atualizado_em := now();
  return new;
end;
$fn$;

drop trigger if exists mc_publicacoes_atualizado on public.mc_publicacoes;
create trigger mc_publicacoes_atualizado
  before update on public.mc_publicacoes
  for each row execute function public.mc_toca_atualizado_em();

drop trigger if exists mc_publicacoes_destino_atualizado on public.mc_publicacoes_destino;
create trigger mc_publicacoes_destino_atualizado
  before update on public.mc_publicacoes_destino
  for each row execute function public.mc_toca_atualizado_em();


-- ---------------------------------------------------------------------------
-- 5) Bucket da mídia + política de storage.
--
-- O bucket 'publicacoes' JÁ EXISTE (público, limite de 500 MB, 0 objetos hoje).
-- O `on conflict do nothing` abaixo é deliberado: ele NÃO reescreve o que está
-- lá. Em especial não mexe no `public`, porque o painel monta a URL com
-- getPublicUrl() e virar o flag aqui quebraria o upload em silêncio — o arquivo
-- subiria e a URL gravada em midia_url responderia 400 na hora de publicar.
--
-- POR QUE PÚBLICO, sendo que 'stories' é privado: quem baixa a mídia não é o
-- navegador do operador, é o servidor da rede social. A Meta faz uma requisição
-- à `image_url`/`video_url` que a gente informa, a partir da infra dela, sem
-- cabeçalho nosso.
--   https://developers.facebook.com/docs/instagram-platform/content-publishing
-- O mesmo vale para o PULL_FROM_URL do TikTok
--   https://developers.tiktok.com/doc/content-posting-api-get-started
--
-- O caminho MENOS exposto para o mesmo resultado é bucket privado + URL
-- assinada com validade curta, gerada na hora do envio
--   https://supabase.com/docs/reference/javascript/storage-from-createsignedurl
-- Fica registrado como a evolução: exige o painel parar de chamar getPublicUrl
-- e passar a pedir a URL ao worker. Enquanto for público, vale saber o que isso
-- significa — qualquer pessoa com o link abre o arquivo, sem login. O nome tem
-- carimbo de tempo + 6 caracteres aleatórios, o que evita adivinhação, mas não
-- é controle de acesso.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('publicacoes', 'publicacoes', true, 524288000)
on conflict (id) do nothing;

-- FALTAVA a política de SELECT deste bucket (só INSERT e DELETE existiam).
-- Enquanto o bucket é público a leitura pelo endpoint público funciona assim
-- mesmo, e por isso ninguém percebeu — mas `storage.list()` autenticado
-- devolvia vazio, e no dia em que o bucket virar privado (o parágrafo acima)
-- TODA leitura pararia de uma vez.
--   https://supabase.com/docs/guides/storage/security/access-control
drop policy if exists "operador ve midia" on storage.objects;
create policy "operador ve midia" on storage.objects
  for select to authenticated
  using (bucket_id = 'publicacoes' and (select public.mc_eh_operador()));

drop policy if exists "operador manda midia" on storage.objects;
create policy "operador manda midia" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'publicacoes' and (select public.mc_eh_operador()));

-- Apagar mídia é só administrador, pela mesma regra das tabelas. Isto APERTA a
-- política que está no ar hoje (que deixava qualquer operador apagar). O worker
-- não é afetado: edge function usa service_role, que passa por cima de RLS.
drop policy if exists "operador apaga midia" on storage.objects;
drop policy if exists "admin apaga midia"    on storage.objects;
create policy "admin apaga midia" on storage.objects
  for delete to authenticated
  using (bucket_id = 'publicacoes' and (select public.mc_eh_admin()));


-- ---------------------------------------------------------------------------
-- 6) RLS.
--
-- Ler e escrever = operador; apagar = administrador. Publicar é trabalho da
-- equipe inteira, mas apagar publicação é destruir histórico de meta.
--
-- As duas funções são SECURITY DEFINER e olham `mc_admin_users.auth_uid =
-- auth.uid()`, ou seja: valem só para sessão do Supabase Auth. `anon` nunca
-- satisfaz nenhuma das duas — é por isso que as políticas são TO authenticated
-- e não existe política para anon aqui. Não copie o padrão de mc_bug_reports
-- (que libera anon): aquela tabela é de antes do login por Auth.
--
-- `(select ...)` em volta da chamada não é enfeite: envolvido assim o
-- planejador avalia a função UMA vez por consulta em vez de uma vez por linha.
-- É o mesmo formato usado nas 32 políticas revisadas em 28/08.
--
-- E vale lembrar por que a checagem tem que estar AQUI e não só na tela: o
-- painel já teve "só administrador" que era enfeite — o modal do cronograma
-- pergunta isUserAdmin(), mas quem apaga as doze linhas da grade é um
-- .delete() do navegador. Sem a política de DELETE abaixo, qualquer operador
-- logado apagaria o cronograma inteiro pelo console.
-- ---------------------------------------------------------------------------
alter table public.mc_planner_grade       enable row level security;
alter table public.mc_publicacoes         enable row level security;
alter table public.mc_publicacoes_destino enable row level security;

drop policy if exists mc_planner_grade_le       on public.mc_planner_grade;
drop policy if exists mc_planner_grade_escreve  on public.mc_planner_grade;
drop policy if exists mc_planner_grade_atualiza on public.mc_planner_grade;
drop policy if exists mc_planner_grade_apaga    on public.mc_planner_grade;

create policy mc_planner_grade_le on public.mc_planner_grade
  for select to authenticated using ((select public.mc_eh_operador()));
create policy mc_planner_grade_escreve on public.mc_planner_grade
  for insert to authenticated with check ((select public.mc_eh_operador()));
create policy mc_planner_grade_atualiza on public.mc_planner_grade
  for update to authenticated
  using ((select public.mc_eh_operador())) with check ((select public.mc_eh_operador()));
create policy mc_planner_grade_apaga on public.mc_planner_grade
  for delete to authenticated using ((select public.mc_eh_admin()));

drop policy if exists mc_publicacoes_le       on public.mc_publicacoes;
drop policy if exists mc_publicacoes_escreve  on public.mc_publicacoes;
drop policy if exists mc_publicacoes_atualiza on public.mc_publicacoes;
drop policy if exists mc_publicacoes_apaga    on public.mc_publicacoes;

create policy mc_publicacoes_le on public.mc_publicacoes
  for select to authenticated using ((select public.mc_eh_operador()));
create policy mc_publicacoes_escreve on public.mc_publicacoes
  for insert to authenticated with check ((select public.mc_eh_operador()));
create policy mc_publicacoes_atualiza on public.mc_publicacoes
  for update to authenticated
  using ((select public.mc_eh_operador())) with check ((select public.mc_eh_operador()));
create policy mc_publicacoes_apaga on public.mc_publicacoes
  for delete to authenticated using ((select public.mc_eh_admin()));

drop policy if exists mc_publicacoes_destino_le       on public.mc_publicacoes_destino;
drop policy if exists mc_publicacoes_destino_escreve  on public.mc_publicacoes_destino;
drop policy if exists mc_publicacoes_destino_atualiza on public.mc_publicacoes_destino;
drop policy if exists mc_publicacoes_destino_apaga    on public.mc_publicacoes_destino;

create policy mc_publicacoes_destino_le on public.mc_publicacoes_destino
  for select to authenticated using ((select public.mc_eh_operador()));
create policy mc_publicacoes_destino_escreve on public.mc_publicacoes_destino
  for insert to authenticated with check ((select public.mc_eh_operador()));
create policy mc_publicacoes_destino_atualiza on public.mc_publicacoes_destino
  for update to authenticated
  using ((select public.mc_eh_operador())) with check ((select public.mc_eh_operador()));
create policy mc_publicacoes_destino_apaga on public.mc_publicacoes_destino
  for delete to authenticated using ((select public.mc_eh_admin()));


-- ---------------------------------------------------------------------------
-- 7) Privilégio, que é a camada por baixo da RLS.
--
-- O GRANT padrão do Supabase deu a `anon` SELECT/INSERT/UPDATE/DELETE nestas
-- três tabelas (conferido 01/09). Hoje isso não abre nada, porque não existe
-- política para anon e RLS nega por omissão. Fica sendo tirado mesmo assim,
-- pelo mesmo motivo que mc_integrations perdeu privilégio em 28/08: uma
-- política permissiva criada por engano daqui a três meses viraria acesso
-- anônimo à fila inteira, com 200 OK e sem alarme nenhum.
--
-- TRUNCATE é o caso mais sério e não tem a ver com anon: TRUNCATE IGNORA RLS.
-- Com ele concedido, qualquer sessão logada esvazia a fila de publicações sem
-- esbarrar em política alguma. REFERENCES e TRIGGER o PostgREST nunca usa.
-- ---------------------------------------------------------------------------
revoke all on public.mc_planner_grade       from anon;
revoke all on public.mc_publicacoes         from anon;
revoke all on public.mc_publicacoes_destino from anon;

revoke truncate, references, trigger on public.mc_planner_grade       from authenticated;
revoke truncate, references, trigger on public.mc_publicacoes         from authenticated;
revoke truncate, references, trigger on public.mc_publicacoes_destino from authenticated;

grant select, insert, update, delete on public.mc_planner_grade       to authenticated;
grant select, insert, update, delete on public.mc_publicacoes         to authenticated;
grant select, insert, update, delete on public.mc_publicacoes_destino to authenticated;


-- ============================================================================
-- NÃO RESOLVIDO — leia antes de caçar bug na tela do planner
--
-- 1) 'publicada' x 'publicado'. O check desta tabela aceita 'publicada' (com A,
--    concordando com "publicação", como 'agendada' e 'cancelada'). O painel
--    compara com 'publicado' em duas linhas do admin.html:
--
--      linha 29656:  ... && p.status !== 'publicado' && p.status !== 'erro'
--      linha 29666:  ... + (p.status === 'publicado' ? '<i>publicado</i>'
--
--    Como o banco nunca vai guardar 'publicado' numa publicação, as duas
--    comparações são sempre falsas: o selo "publicado" nunca aparece, e toda
--    publicação com hora no passado fica marcada como ATRASADA para sempre —
--    inclusive as que saíram certinho. Não é erro visível: é a tela mentindo
--    devagar. São dois caracteres em admin.html, arquivo que eu não podia
--    tocar. Trocar aqui em vez de lá seria pior: 'publicado' no destino e
--    'publicada' na publicação é o que mantém as duas tabelas distinguíveis.
--    (Em mc_publicacoes_destino, 'publicado' está CERTO — concorda com
--    "destino".)
--
-- 2) O status da publicação ainda não é derivado dos destinos. Quem decide se
--    "duas de quatro" vira 'publicada' ou 'erro' é o worker, e essa regra não
--    existe ainda. Enquanto não existir, confie na tabela de destino.
--
-- 3) O que hoje NÃO publica de verdade, e por quê — a fila aceita agendar para
--    as quatro redes, mas:
--      · Instagram: falta acrescentar instagram_content_publish ao token e
--        refazer o OAuth. Não precisa de App Review neste caso.
--        https://developers.facebook.com/docs/instagram-platform/content-publishing
--        E o Instagram não agenda nativamente: quem segura a hora é esta fila.
--        Agendamento nativo só existe em Página do Facebook, via
--        scheduled_publish_time
--        https://developers.facebook.com/docs/graph-api/reference/page/feed/
--      · YouTube: o que está guardado é CHAVE de API, que não sobe vídeo.
--        videos.insert exige OAuth e custa 1600 das 10.000 unidades de cota por
--        dia — seis envios por dia e acabou.
--        https://developers.google.com/youtube/v3/docs/videos/insert
--        https://developers.google.com/youtube/v3/determine_quota_cost
--        Este é o único que agenda sozinho, com privacyStatus=private +
--        publishAt, e por isso pode ser entregue antes da hora.
--        https://developers.google.com/youtube/v3/docs/videos
--      · TikTok: Direct Post exige auditoria do app; antes dela o vídeo sai
--        restrito, mesmo publicando com sucesso.
--        https://developers.tiktok.com/doc/content-posting-api-get-started
--    A nota do modal (fpPubNota) já avisa disso na tela, antes de agendar.
-- ============================================================================
