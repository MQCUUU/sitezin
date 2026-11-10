-- 0006 — Remove tabelas órfãs (revisada; única migration com DROP TABLE).
--
-- Nenhuma tela, rota, função ou view usa estas tabelas desde a V3.3/V3.4
-- (as rotas /api/tags, /api/rating-categories e /api/friendships foram
-- removidas; scripts/test-hardening.mjs garante que não voltaram):
--   - tags e movie_tags (movie_tags só referencia tags) — as tags que o app usa
--     são personal_tags + library_tags, que ficam;
--   - rating_categories e category_ratings (notas por categoria do sistema
--     antigo; as notas atuais são review_categories + review_scores, que ficam)
--     — a seção de Configurações que editava rating_categories saiu na V3.3;
--   - friendships — o social usa follows.
-- No TEST estavam vazias. Antes de aplicar em PROD, conte as linhas (somente
-- leitura) e confirme: DROP não tem volta (só pelo restore da Neon).
DROP TABLE IF EXISTS public.movie_tags;
DROP TABLE IF EXISTS public.tags;
DROP TABLE IF EXISTS public.category_ratings;
DROP TABLE IF EXISTS public.rating_categories;
DROP TABLE IF EXISTS public.friendships;
