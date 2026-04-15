-- ============================================================
-- FullPro Media Club · Supabase schema
-- Rode este script inteiro em: Supabase → SQL Editor → New query
-- ============================================================

-- ---------- 1) TABELAS ----------

create table if not exists public.requests (
  id             uuid        primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  date           date        not null,
  nome           text        not null,
  whatsapp       text        not null,
  email          text,
  moto           text        not null,
  placa          text        not null,
  modalidade     text        not null check (modalidade in ('estudio','retirada')),
  endereco       text,
  brinde         text        not null check (brinde in ('pastilhas','mochila','capa')),
  obs            text,
  aceite_termo   boolean     not null default true,
  aceite_imagem  boolean     not null default true,
  status         text        not null default 'pending' check (status in ('pending','approved','rejected'))
);

create index if not exists requests_date_idx   on public.requests (date);
create index if not exists requests_status_idx on public.requests (status);

create table if not exists public.blocked_dates (
  date        date        primary key,
  created_at  timestamptz not null default now()
);

-- ---------- 2) VIEW PÚBLICA (datas já ocupadas) ----------
-- A landing precisa saber quais dias estão bloqueados para desenhar o calendário,
-- mas NÃO pode ver os dados dos solicitantes. A view expõe só as datas.

create or replace view public.public_blocked_dates as
  select date from public.requests where status = 'approved'
  union
  select date from public.blocked_dates;

-- permite leitura anônima da view
grant select on public.public_blocked_dates to anon, authenticated;

-- ---------- 3) ROW LEVEL SECURITY ----------

alter table public.requests      enable row level security;
alter table public.blocked_dates enable row level security;

-- requests: qualquer um pode INSERIR (form da landing)
drop policy if exists "anon can insert requests" on public.requests;
create policy "anon can insert requests"
  on public.requests for insert
  to anon, authenticated
  with check (true);

-- requests: SOMENTE autenticados podem ler / atualizar / apagar (admin)
drop policy if exists "auth can read requests" on public.requests;
create policy "auth can read requests"
  on public.requests for select
  to authenticated
  using (true);

drop policy if exists "auth can update requests" on public.requests;
create policy "auth can update requests"
  on public.requests for update
  to authenticated
  using (true) with check (true);

drop policy if exists "auth can delete requests" on public.requests;
create policy "auth can delete requests"
  on public.requests for delete
  to authenticated
  using (true);

-- blocked_dates: SOMENTE autenticados podem criar / apagar
drop policy if exists "auth can read blocked" on public.blocked_dates;
create policy "auth can read blocked"
  on public.blocked_dates for select
  to authenticated
  using (true);

drop policy if exists "auth can insert blocked" on public.blocked_dates;
create policy "auth can insert blocked"
  on public.blocked_dates for insert
  to authenticated
  with check (true);

drop policy if exists "auth can delete blocked" on public.blocked_dates;
create policy "auth can delete blocked"
  on public.blocked_dates for delete
  to authenticated
  using (true);
