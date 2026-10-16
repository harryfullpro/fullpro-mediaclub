-- =====================================================================
-- BACKUP da rotina semanal de mc_planner_grade, tirado em 16/10/2026
-- imediatamente ANTES de zerar a tabela a pedido do dono.
--
-- POR QUE ESTE ARQUIVO EXISTE: estas 31 linhas eram o único registro do
-- combinado com o analista de social media. Zerar sem guardar deixaria a
-- informação sem nenhuma cópia — e "o operador configura do zero" é uma
-- decisão de produto, não um descarte do histórico.
--
-- Os ids são os ORIGINAIS de propósito: mc_publicacoes.slot_id aponta para
-- eles. Restaurar com os mesmos ids devolve o vínculo das publicações que
-- cumpriram cada horário; restaurar com ids novos não devolveria.
--
-- PARA RESTAURAR (apaga o que estiver lá e devolve este estado):
--   delete from public.mc_planner_grade;
--   e então rode o insert abaixo.
-- =====================================================================

insert into public.mc_planner_grade (id, dia_semana, hora, rotulo, tipo, plataformas, ativo) values
  ('1619c1e9-1662-42f3-a38c-3c2f2e8ee85d', 0, '09:30:00', 'Reel do dia · colab', 'short', '{instagram,facebook}', true),
  ('e2750619-8794-4852-8ff0-830767f68187', 0, '11:00:00', 'O mesmo vídeo', 'short', '{tiktok,youtube}', true),
  ('9518159f-33dc-49ae-be26-c490861c1c9b', 0, '13:00:00', 'Story', 'story', '{instagram}', true),
  ('c39d9010-fa33-4a08-9126-5cd09eefbea6', 0, '19:00:00', 'Story · repost', 'repost', '{instagram}', true),
  ('69c766d2-8c44-464d-8fd0-5c66e9a80319', 1, '10:00:00', 'Reel do dia', 'short', '{instagram,facebook}', true),
  ('fda8d263-110a-4658-bf40-b993fd98f7ec', 1, '11:00:00', 'O mesmo vídeo', 'short', '{tiktok,youtube}', true),
  ('d8d045ee-9030-4f58-a5bf-4c2ebc95ef6f', 1, '13:00:00', 'Story', 'story', '{instagram}', true),
  ('48ae811f-9748-4740-8729-36b489f61ec5', 1, '18:00:00', 'Vídeo longo', 'longo', '{youtube}', true),
  ('44b2bb5f-4ea6-4470-8ca0-173e1605cdd3', 1, '19:00:00', 'Story · repost', 'repost', '{instagram}', true),
  ('2b1ba670-667b-46b8-aeac-2198a8f6166a', 2, '10:00:00', 'Reel do dia', 'short', '{instagram,facebook}', true),
  ('08ae533f-b630-49fd-b730-ef9565876faf', 2, '11:00:00', 'O mesmo vídeo', 'short', '{tiktok,youtube}', true),
  ('c17afcb0-67d8-4a81-9177-5231af4e5c02', 2, '13:00:00', 'Story', 'story', '{instagram}', true),
  ('d51e2925-9a10-4c5c-9b64-3fd5e51982d5', 2, '19:00:00', 'Story · repost', 'repost', '{instagram}', true),
  ('ced00db1-b510-43f3-b879-7944a4bf3ff4', 3, '10:00:00', 'Reel do dia', 'short', '{instagram,facebook}', true),
  ('595abac1-54bb-4d46-933f-f5eb3eef81e7', 3, '11:00:00', 'O mesmo vídeo', 'short', '{tiktok,youtube}', true),
  ('c94aaaf4-90d1-4465-8c57-ae6d14568e9d', 3, '13:00:00', 'Story', 'story', '{instagram}', true),
  ('67eb8b08-25b1-46da-9623-ffbbacfcaa13', 3, '19:00:00', 'Story · repost', 'repost', '{instagram}', true),
  ('8bb6d9d9-38c3-4c17-bc27-ddcc5b4829c5', 4, '10:00:00', 'Reel do dia · colab', 'short', '{instagram,facebook}', true),
  ('f916d816-a9ca-4f90-b6eb-9ca5986695d7', 4, '11:00:00', 'O mesmo vídeo', 'short', '{tiktok,youtube}', true),
  ('20cb25e8-6a4b-4641-b503-2c8faeccbaa1', 4, '13:00:00', 'Story', 'story', '{instagram}', true),
  ('62bd2e8d-954f-45b3-8677-10c268f56161', 4, '18:00:00', 'Vídeo longo', 'longo', '{youtube}', true),
  ('a60d4f1b-d40c-4fab-8d6a-f50ca8dcdc1d', 4, '19:00:00', 'Story · repost', 'repost', '{instagram}', true),
  ('93ef887b-e2e9-4b1a-ada3-f3a71ea4589e', 5, '10:00:00', 'Reel do dia', 'short', '{instagram,facebook}', true),
  ('8890fd6f-e3b5-40e1-bf40-01ef3b193329', 5, '11:00:00', 'O mesmo vídeo', 'short', '{tiktok,youtube}', true),
  ('9578a33f-c00e-4960-bcad-6326a6de0755', 5, '13:00:00', 'Story', 'story', '{instagram}', true),
  ('a63ca5c3-f907-4955-9d5f-8d6e2b79646d', 5, '19:00:00', 'Story · repost', 'repost', '{instagram}', true),
  ('d3a0fc18-e307-422e-a664-6ac98e404c1e', 6, '10:00:00', 'Carrossel', 'carrossel', '{instagram,facebook}', true),
  ('3797c6b7-d72b-41b7-b15a-f1c518849c72', 6, '11:00:00', 'Vídeo do dia', 'short', '{tiktok,youtube}', true),
  ('b95a7689-bf03-4a5d-b4e8-95ebf79affee', 6, '13:00:00', 'Story', 'story', '{instagram}', true),
  ('506e521e-f4a2-4ca8-9f78-5fc65e37b99e', 6, '19:00:00', 'Reel · o mesmo vídeo das 11h', 'short', '{instagram,facebook}', true),
  ('d18062a8-208c-49ce-bc1b-9014c95c1c40', 6, '19:00:00', 'Story · repost', 'repost', '{instagram}', true)
on conflict (id) do nothing;
