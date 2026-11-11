-- 0008 — Fim do reassistir.
--
-- Pedido do produto (2026-11-10): só existem "Assistindo" e "Assistido". Quem
-- estava reassistindo já tinha assistido, então TUDO que era Reassistindo ou
-- Reassistido vira Assistido, e cada título conta UMA vez (tempo nos Insights,
-- contagens, Diário).
--
--   - library_items: status rewatching/rewatched → watched; rewatch_count → 0.
--   - watch_entries: as sessões marcadas como reassistida somem. Se um título só
--     tinha sessões de reassistida, a mais antiga vira a sessão normal (o título
--     não perde a data de quando foi visto).
--   - episodes_progress: uma linha por episódio; a marca de reassistida some.
--   - activity_events: some o `rewatch_started` e o espelho `watch_logged` das
--     sessões apagadas; mudanças de status para/de reassistir viram Assistido, e
--     a que fica "assistido → assistido" (sem mudança real) some.
--   - CHECKs: os status e o tipo de evento antigos deixam de ser aceitos.
--
-- As colunas rewatch_count e is_rewatch ficam (sempre 0/false) para o código
-- que estiver no ar durante o deploy continuar funcionando; nada mais as usa.

-- 1) Sessões: título que só tem reassistidas mantém a mais antiga como normal.
UPDATE public.watch_entries we
SET is_rewatch = false, updated_at = now()
WHERE we.is_rewatch
  AND NOT EXISTS (
    SELECT 1 FROM public.watch_entries o
    WHERE o.user_id = we.user_id AND o.media_id = we.media_id AND NOT o.is_rewatch
  )
  AND we.id = (
    SELECT f.id FROM public.watch_entries f
    WHERE f.user_id = we.user_id AND f.media_id = we.media_id AND f.is_rewatch
    ORDER BY f.watched_at ASC, f.created_at ASC, f.id ASC
    LIMIT 1
  );

-- Espelho no Diário das sessões que vão sumir (metadata.watch_entry_id) e
-- espelhos órfãos que se diziam reassistida.
DELETE FROM public.activity_events ae
WHERE ae.event_type = 'watch_logged'
  AND (
    EXISTS (
      SELECT 1 FROM public.watch_entries we
      WHERE we.is_rewatch AND we.user_id = ae.user_id AND we.id::text = ae.metadata->>'watch_entry_id'
    )
    OR (ae.metadata->>'is_rewatch' = 'true' AND NOT EXISTS (
      SELECT 1 FROM public.watch_entries we2
      WHERE we2.user_id = ae.user_id AND we2.id::text = ae.metadata->>'watch_entry_id'
    ))
  );

DELETE FROM public.watch_entries WHERE is_rewatch;

-- 2) Episódios.
UPDATE public.episodes_progress SET is_rewatch = false WHERE is_rewatch;

-- 3) Biblioteca.
UPDATE public.library_items
SET status = 'watched'
WHERE status IN ('rewatching', 'rewatched');

UPDATE public.library_items SET rewatch_count = 0 WHERE rewatch_count <> 0;

-- 4) Diário (eventos).
DELETE FROM public.activity_events WHERE event_type = 'rewatch_started';

UPDATE public.activity_events
SET metadata = jsonb_set(metadata, '{to}', '"watched"')
WHERE event_type = 'status_changed' AND metadata->>'to' IN ('rewatching', 'rewatched');

UPDATE public.activity_events
SET metadata = jsonb_set(metadata, '{from}', '"watched"')
WHERE event_type = 'status_changed' AND metadata->>'from' IN ('rewatching', 'rewatched');

UPDATE public.activity_events
SET metadata = jsonb_set(metadata, '{status}', '"watched"')
WHERE event_type IN ('library_added', 'library_removed') AND metadata->>'status' IN ('rewatching', 'rewatched');

UPDATE public.activity_events
SET metadata = metadata - 'rewatch_count' - 'rewatch_number' - 'is_rewatch'
WHERE metadata ?| ARRAY['rewatch_count', 'rewatch_number', 'is_rewatch'];

DELETE FROM public.activity_events
WHERE event_type = 'status_changed' AND metadata->>'from' = 'watched' AND metadata->>'to' = 'watched';

-- 5) Restrições.
ALTER TABLE public.library_items DROP CONSTRAINT IF EXISTS library_items_status_check;
ALTER TABLE public.library_items ADD CONSTRAINT library_items_status_check
  CHECK (status = ANY (ARRAY['want'::text, 'watching'::text, 'watched'::text, 'paused'::text, 'dropped'::text]));

ALTER TABLE public.activity_events DROP CONSTRAINT IF EXISTS activity_events_event_type_check;
ALTER TABLE public.activity_events ADD CONSTRAINT activity_events_event_type_check
  CHECK (event_type = ANY (ARRAY['library_added'::text, 'status_changed'::text, 'season_completed'::text, 'series_completed'::text, 'watch_logged'::text, 'library_removed'::text]));
