-- =====================================================================
-- mc_influencer_candidaturas — candidaturas a patrocínio (landing /influencer)
--
-- Estado real em produção em 09/09/2026. Este arquivo existe porque a primeira
-- versão da tabela foi criada direto no Supabase, sem arquivo no repo — e foi
-- EXATAMENTE por isso que a política larga demais (abaixo, no histórico) passou
-- sem ninguém revisar. Objeto de banco sem arquivo é objeto sem revisão.
--
-- Esta é a ETAPA ANTERIOR ao hub que já existia: aprovar uma candidatura
-- promove a pessoa para mc_performance_influencers. Não há cadastro paralelo.
-- =====================================================================

create table if not exists public.mc_influencer_candidaturas (
  id           uuid        not null default gen_random_uuid(),
  created_at   timestamptz not null default now(),

  -- identificação e contato
  nome         text        not null,
  whatsapp     text        not null,
  email        text        not null,
  instagram    text        not null,
  cidade_uf    text        not null,
  pode_estudio text        not null,   -- sim | nao | talvez

  -- as redes e a prova de alcance
  -- Em 15/09/2026 os quatro números digitados (alcance 30d, salvamentos,
  -- compartilhamentos, retenção) saíram e viraram UM print. Menos digitação
  -- para o candidato, e a imagem carrega contexto que campo numérico não tem.
  tiktok         text,
  facebook       text,
  insights_print text,          -- CAMINHO no bucket, nunca URL (ver constraint)
  reel_1         text not null,
  reel_2         text,
  reel_3         text,

  -- a moto e o conteúdo (é loja de peças: a moto define se o público compra)
  moto         text not null,
  moto_propria text not null,          -- sim | nao
  pecas        text not null,

  -- a mesa: sem entregável e sem preço não existe sim nem não
  posts_por_mes integer not null,
  espera        text    not null,      -- peca | cache | comissao | desconto | combinar
  cache_faixa   text,

  -- risco de marca
  via_publica   text not null,         -- nao_apareco | sim_documentos_ok | sim_sem_documentos
  exclusividade text not null,         -- o campo mais decisivo da análise

  -- opcionais
  publi_link   text,
  outras_redes text,
  motivo       text,

  -- aceites, separados de propósito (aceite empacotado é antipadrão de LGPD)
  aceite_dados  boolean not null,
  aceite_repost boolean not null,
  maior_18      boolean not null,

  -- trilha interna: só administrador escreve
  status           text        not null default 'pending',
  nota_interna     text,
  analisado_em     timestamptz,
  analisado_por    uuid,
  email_enviado_em timestamptz,
  email_erro       text,
  email_decisao    text,
  email_por        uuid,
  email_reenvios   integer     not null default 0,

  constraint mc_influencer_candidaturas_pkey primary key (id),

  constraint mcic_status_check       check (status = any (array['pending','approved','rejected','standby'])),
  constraint mcic_pode_estudio_check check (pode_estudio = any (array['sim','nao','talvez'])),
  constraint mcic_moto_propria_check check (moto_propria = any (array['sim','nao'])),
  constraint mcic_espera_check       check (espera = any (array['peca','cache','comissao','desconto','combinar'])),
  constraint mcic_via_publica_check  check (via_publica = any (array['nao_apareco','sim_documentos_ok','sim_sem_documentos'])),
  constraint mcic_email_decisao_check check (email_decisao is null or email_decisao = any (array['aprovada','recusada'])),
  -- o teto de reenvio mora no banco: o cliente pode ser reescrito, a constraint não
  constraint mcic_reenvios_check     check (email_reenvios between 0 and 2),

  -- anti-lixo. btrim porque '        ' passava por char_length puro.
  constraint mcic_nome_check     check (char_length(btrim(nome)) between 2 and 120),
  constraint mcic_whatsapp_check check (char_length(whatsapp) <= 40
    and length(regexp_replace(whatsapp, '\D', '', 'g')) between 10 and 13),
  constraint mcic_email_check    check (char_length(email) <= 200
    and email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]{2,}$'),
  constraint mcic_instagram_check     check (char_length(btrim(instagram)) between 2 and 60),
  constraint mcic_cidade_check        check (char_length(btrim(cidade_uf)) between 3 and 120),
  constraint mcic_moto_check          check (char_length(btrim(moto)) between 2 and 120),
  constraint mcic_pecas_check         check (char_length(btrim(pecas)) between 2 and 300),
  constraint mcic_exclusividade_check check (char_length(btrim(exclusividade)) between 2 and 500),

  -- número negativo ou fantasioso é lixo, não dado
  constraint mcic_posts_check check (posts_por_mes between 0 and 200),

  constraint mcic_reel1_check  check (char_length(reel_1) between 8 and 300),
  constraint mcic_reel2_check  check (reel_2 is null or char_length(reel_2) <= 300),
  constraint mcic_reel3_check  check (reel_3 is null or char_length(reel_3) <= 300),
  constraint mcic_cache_check  check (cache_faixa is null or char_length(cache_faixa) <= 120),
  constraint mcic_publi_check  check (publi_link is null or char_length(publi_link) <= 300),
  constraint mcic_redes_check  check (outras_redes is null or char_length(outras_redes) <= 300),
  constraint mcic_motivo_check check (motivo is null or char_length(motivo) <= 400),
  constraint mcic_tiktok_check check (tiktok is null or char_length(tiktok) <= 60),
  constraint mcic_facebook_check check (facebook is null or char_length(facebook) <= 80),
  -- URL assinada expira; guardar link no banco é guardar lixo com cara de dado
  constraint mcic_print_check check (insights_print is null
    or (char_length(insights_print) <= 300 and insights_print !~* '^https?://')),
  constraint mcic_nota_check   check (nota_interna is null or char_length(nota_interna) <= 2000),

  -- os três aceites são condição de entrada, não preferência
  constraint mcic_aceites_check check (aceite_dados and aceite_repost and maior_18)
);

-- a consulta do painel é status + mais recente primeiro
create index if not exists mcic_status_created_idx on public.mc_influencer_candidaturas (status, created_at desc);
create index if not exists mcic_created_idx        on public.mc_influencer_candidaturas (created_at desc);
-- achar reenvio do mesmo @. NÃO é único de propósito: a pessoa pode se
-- recandidatar depois de melhorar os números.
create index if not exists mcic_instagram_idx      on public.mc_influencer_candidaturas (lower(btrim(instagram)));

alter table public.mc_influencer_candidaturas enable row level security;

-- ---------------------------------------------------------------------
-- INSERT anônimo (a landing). Limita FORMATO e impede o candidato de
-- escrever qualquer coluna de trilha interna.
--
-- A janela de created_at não é zelo: o DEFAULT now() NÃO impede o cliente de
-- mandar a coluna. Medido — passou com created_at = now() + 10 anos.
--
-- ATENÇÃO ao acrescentar coluna de trilha: ela tem que entrar nesta lista.
-- email_decisao/email_por/email_reenvios nasceram depois da política e ficaram
-- de fora por um momento, o que deixava a ficha nascer com cara de respondida.
-- ---------------------------------------------------------------------
drop policy if exists mcic_landing on public.mc_influencer_candidaturas;
create policy mcic_landing on public.mc_influencer_candidaturas
  for insert to anon
  with check (
    status = 'pending'
    and created_at >= (now() - interval '5 minutes')
    and created_at <= (now() + interval '5 minutes')
    and nota_interna     is null
    and analisado_em     is null
    and analisado_por    is null
    and email_enviado_em is null
    and email_erro       is null
    and email_decisao    is null
    and email_por        is null
    and email_reenvios   = 0
    and aceite_dados and aceite_repost and maior_18
  );

-- ---------------------------------------------------------------------
-- Leitura e escrita: mc_eh_admin(), NÃO mc_eh_operador().
--
-- HISTÓRICO, porque é o erro que este arquivo existe para não repetir:
-- a primeira versão usava mc_eh_operador(), que é apenas
--   exists (select 1 from mc_admin_users where auth_uid = auth.uid())
-- e responde true para as 7 contas do painel, em 6 papéis. Ou seja: Filmmaker,
-- Fotógrafo, Mecânico/Apresentador, Assistente Admin. e Auxiliar Admin podiam
-- LER, EDITAR e APAGAR PII de candidato. O módulo estar escondido do menu deles
-- não protege nada — a política é do banco, e qualquer um dos 7 consulta a
-- tabela direto com o próprio token.
--
-- mc_eh_admin() é `lower(role) like 'admin%'`, que dá exatamente os 2
-- "Administrador" ("Auxiliar Admin" e "Assistente Admin." não começam com
-- admin — conferido nos 7 usuários, um por um).
--
-- Se o Marketing for operar isto, o caminho é conceder o papel, não alargar a
-- política de volta.
-- ---------------------------------------------------------------------
drop policy if exists mcic_operador on public.mc_influencer_candidaturas;
drop policy if exists mcic_admin    on public.mc_influencer_candidaturas;
create policy mcic_admin on public.mc_influencer_candidaturas
  for all to authenticated
  using ((select mc_eh_admin()))
  with check ((select mc_eh_admin()));

-- ---------------------------------------------------------------------
-- Grants: REVOKE, não GRANT.
-- O schema public tem default ACL anon=arwdDxtm, então toda tabela nova NASCE
-- com SELECT/UPDATE/DELETE para anônimo. A RLS segura, mas uma política de
-- SELECT acrescentada por engano amanhã vazaria sozinha. Cinto além da RLS.
--
-- Consequência na landing: sem SELECT para anon, o insert tem que ser
-- return=minimal. `.insert(payload)` funciona; `.insert(payload).select()`
-- volta 401 e transformaria sucesso em erro na tela.
-- ---------------------------------------------------------------------
revoke select, update, delete, truncate, references, trigger
  on table public.mc_influencer_candidaturas from anon;
grant insert on table public.mc_influencer_candidaturas to anon;
grant select, insert, update, delete on table public.mc_influencer_candidaturas to authenticated;

-- ---------------------------------------------------------------------
-- E NÃO CRIE VIEW PÚBLICA SOBRE ESTA TABELA.
-- Uma view simples (select ... where) aqui é auto-atualizável e roda com
-- privilégio do dono; o dono é postgres, que tem rolbypassrls = true, e o
-- default ACL dá DELETE a anon também na view. Reproduzido em sandbox: anon
-- rodou DELETE na view e as linhas da tabela base sumiram.
-- As duas mc_public_* que existem escapam disso por ACIDENTE (uma tem UNION,
-- a outra CROSS JOIN LATERAL — construções que desqualificam auto-update).
-- ---------------------------------------------------------------------

comment on table public.mc_influencer_candidaturas is
  'Candidaturas a patrocínio vindas da landing /influencer. Aprovar promove para mc_performance_influencers. anon só INSERT; leitura só mc_eh_admin(). Sem view pública — ver o comentário no fim de supabase/schema-candidaturas.sql.';

-- =====================================================================
-- BUCKET DO PRINT — candidaturas-insights
--
-- PRIVADO. É print do painel de rede social de uma pessoa: tem nome de perfil,
-- às vezes barra de notificação e número que ela não publica. Bucket público
-- aqui seria pasta aberta na internet com dado de terceiro dentro.
--
-- Conferido pela API REST com a chave publicável, os seis comportamentos:
--   enviar              -> 200
--   ler o arquivo       -> 404 (a RLS esconde a existência)
--   listar o bucket     -> [] (filtrado)
--   apagar              -> 403 Access denied
--   URL pública direta  -> 400 (bucket privado)
--   sobrescrever o de outro -> 403 violates row-level security
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('candidaturas-insights','candidaturas-insights', false, 8388608,
        array['image/jpeg','image/png','image/webp','image/heic','image/heif'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "mcic_print_envio_anonimo" on storage.objects;
drop policy if exists "mcic_print_leitura_admin" on storage.objects;
drop policy if exists "mcic_print_admin_gerencia" on storage.objects;

-- o candidato ENVIA e só
create policy "mcic_print_envio_anonimo" on storage.objects
  for insert to anon with check (bucket_id = 'candidaturas-insights');

-- administrador lê — é o que permite gerar a URL assinada de 5 minutos
create policy "mcic_print_leitura_admin" on storage.objects
  for select to authenticated
  using (bucket_id = 'candidaturas-insights' and (select mc_eh_admin()));

-- e apaga, para conseguir cumprir pedido de exclusão da LGPD
create policy "mcic_print_admin_gerencia" on storage.objects
  for delete to authenticated
  using (bucket_id = 'candidaturas-insights' and (select mc_eh_admin()));
