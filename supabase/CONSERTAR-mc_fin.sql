-- =====================================================================
-- mc_fin_* — as seis tabelas financeiras/RH estão abertas à internet
--
-- NÃO APLIQUE SEM FALAR COM O DONO DESSAS TABELAS.
-- Elas são de outro funcionário. Se a ferramenta dele lê com a chave
-- publicável (que é o mais provável, já que as políticas são `using(true)`
-- para anon), este arquivo DERRUBA a ferramenta dele no segundo em que rodar.
-- O objetivo aqui é ter o conserto pronto para o momento em que os dois
-- combinarem, não aplicar de surpresa.
--
-- ---------------------------------------------------------------------
-- O QUE FOI MEDIDO EM 22/09/2026, de fora, sem login, usando apenas a chave
-- publicável que https://mediaclub.fullpro.com.br/config.js serve em HTTP 200:
--
--   GET /rest/v1/mc_fin_rh          -> 200, 6.017 bytes   (1 registro, blob de RH)
--   GET /rest/v1/mc_fin_boletos     -> 206, 216 linhas
--   GET /rest/v1/mc_fin_lancamentos -> 206, 4.870 linhas
--   GET /rest/v1/mc_fin_importacoes -> 206, 85 linhas
--
-- E o estado das políticas, consultado em pg_policy:
--
--   mc_fin_boletos       RLS ligada   | 2 políticas, ambas `using: true` (r e ALL)
--   mc_fin_fornecedores  RLS ligada   | 2 políticas, ambas `using: true` (r e ALL)
--   mc_fin_lancamentos   RLS ligada   | 2 políticas, ambas `using: true` (r e ALL)
--   mc_fin_importacoes   RLS DESLIGADA| nenhuma política
--   mc_fin_renames       RLS DESLIGADA| nenhuma política
--   mc_fin_rh            RLS DESLIGADA| nenhuma política
--
-- Política `ALL` com `using: true` e sem `with_check` herda o using para a
-- escrita. Ou seja: anônimo não só LÊ como ALTERA e APAGA. Isso não foi
-- testado por escrita — a conclusão vem da definição das políticas.
-- ---------------------------------------------------------------------

-- ANTES DE RODAR, responda estas duas perguntas com o dono das tabelas:
--   1. A ferramenta dele autentica com login de usuário, ou usa a chave
--      publicável direto? Se for a chave publicável, ele precisa passar a
--      logar antes — senão o item 2 derruba tudo.
--   2. Quem precisa enxergar isso? Só ele? Ele e o Harry? Todo administrador?
--      A resposta muda o predicado abaixo.

begin;

-- ---------------------------------------------------------------------
-- 1) As três sem RLS. Ligar sem política = ninguém lê, nem ele.
--    Por isso a política vem junto, no mesmo passo.
-- ---------------------------------------------------------------------
alter table public.mc_fin_rh          enable row level security;
alter table public.mc_fin_importacoes enable row level security;
alter table public.mc_fin_renames     enable row level security;

-- ---------------------------------------------------------------------
-- 2) As políticas abertas saem.
-- ---------------------------------------------------------------------
drop policy if exists "anon and auth can read fin_boletos"        on public.mc_fin_boletos;
drop policy if exists "anon and auth can modify fin_boletos"      on public.mc_fin_boletos;
drop policy if exists "anon and auth can read fin_fornecedores"   on public.mc_fin_fornecedores;
drop policy if exists "anon and auth can modify fin_fornecedores" on public.mc_fin_fornecedores;
drop policy if exists "anon and auth can read fin_lancamentos"    on public.mc_fin_lancamentos;
drop policy if exists "anon and auth can modify fin_lancamentos"  on public.mc_fin_lancamentos;

-- ---------------------------------------------------------------------
-- 3) Uma política por tabela, só para quem está logado E é operador.
--
--    `mc_eh_operador()` libera as 7 contas do painel.
--    `mc_eh_admin()`    libera só os 2 Administradores.
--
--    Para dado financeiro e de RH o predicado certo é quase certamente
--    mc_eh_admin(). Trocar a função abaixo é a decisão que vocês dois tomam.
--    Deixei em mc_eh_admin() porque, na dúvida, o anel apertado é o que se
--    consegue afrouxar depois sem susto — o contrário não.
-- ---------------------------------------------------------------------
create policy mc_fin_rh_admin on public.mc_fin_rh
  for all to authenticated using ((select mc_eh_admin())) with check ((select mc_eh_admin()));

create policy mc_fin_importacoes_admin on public.mc_fin_importacoes
  for all to authenticated using ((select mc_eh_admin())) with check ((select mc_eh_admin()));

create policy mc_fin_renames_admin on public.mc_fin_renames
  for all to authenticated using ((select mc_eh_admin())) with check ((select mc_eh_admin()));

create policy mc_fin_boletos_admin on public.mc_fin_boletos
  for all to authenticated using ((select mc_eh_admin())) with check ((select mc_eh_admin()));

create policy mc_fin_fornecedores_admin on public.mc_fin_fornecedores
  for all to authenticated using ((select mc_eh_admin())) with check ((select mc_eh_admin()));

create policy mc_fin_lancamentos_admin on public.mc_fin_lancamentos
  for all to authenticated using ((select mc_eh_admin())) with check ((select mc_eh_admin()));

-- ---------------------------------------------------------------------
-- 4) Tirar o que o schema dá de graça para anon.
--    O schema public tem default ACL anon=arwdDxtm: toda tabela nasce com
--    SELECT/INSERT/UPDATE/DELETE para anônimo. RLS segura, mas grant é cinto.
-- ---------------------------------------------------------------------
revoke all on table public.mc_fin_rh          from anon;
revoke all on table public.mc_fin_importacoes from anon;
revoke all on table public.mc_fin_renames     from anon;
revoke all on table public.mc_fin_boletos     from anon;
revoke all on table public.mc_fin_fornecedores from anon;
revoke all on table public.mc_fin_lancamentos from anon;

commit;

-- ---------------------------------------------------------------------
-- CONFERIR DEPOIS (de fora, sem login). Todas devem deixar de devolver dado:
--
--   K=sb_publishable_...
--   for t in mc_fin_rh mc_fin_boletos mc_fin_lancamentos mc_fin_importacoes \
--            mc_fin_renames mc_fin_fornecedores; do
--     curl -s -o /dev/null -w "$t -> %{http_code}\n" \
--       "https://xgaaocnuqgcwttrljqep.supabase.co/rest/v1/$t?select=*&limit=1" \
--       -H "apikey: $K" -H "Authorization: Bearer $K"
--   done
--
-- E conferir que a ferramenta do outro funcionário continua funcionando —
-- essa parte só ele consegue fazer.
--
-- PARA DESFAZER, se derrubar a ferramenta dele antes de ele ajustar o login:
--   drop policy ... ; e recriar a política antiga `for all to anon, authenticated
--   using (true)`. Guardar este arquivo é o que torna a volta barata.
-- ---------------------------------------------------------------------
