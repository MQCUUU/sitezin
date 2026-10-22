-- V2.5 — Integridade histórica: remover da Biblioteca NÃO apaga o que aconteceu.
--
-- Biblioteca = estado atual da coleção (library_items).
-- Histórico  = fatos do passado (watch_entries, episodes_progress, activity_events).
--
-- ANTES (auditado em PROD e TEST, idênticos):
--   activity_events.library_item_id → library_items  ON DELETE CASCADE   (apagava o Diário do título)
--   watch_entries.library_item_id   → library_items  ON DELETE CASCADE   (apagava visualizações, notas, comentários, reassistidas)
--   watch_entries.library_item_id   NOT NULL
--   episodes_progress               → só media/user  (NÃO era apagado; continua igual)
--   category_ratings, review_scores, library_tags, custom_list_items → CASCADE (estado do item; continua igual)
--
-- DEPOIS:
--   activity_events.library_item_id → ON DELETE SET NULL
--   watch_entries.library_item_id   → ON DELETE SET NULL, aceita NULL
--   activity_events.event_type      → aceita 'library_removed' (retrato mínimo do item no momento da remoção,
--                                      gravado pelo app novo: status, datas, nota e contadores — nunca texto livre)
--   backfill: activity_events.media_id preenchido a partir do item da biblioteca (identidade exata, sem aproximação)
--
-- A identidade durável do histórico é `media_id` → public.media (catálogo compartilhado; nenhuma rota apaga
-- linhas de media, e as FKs de watch_entries/episodes_progress/activity_events impedem isso).
--
-- ORDEM: aplicar ANTES do deploy do app novo (o app novo grava 'library_removed' na mesma transação da remoção;
-- sem esta migration a remoção falha em vez de perder histórico).
-- COMPATÍVEL com o app atualmente em produção: ele nunca grava library_item_id NULL nem 'library_removed';
-- com SET NULL, uma remoção feita pelo app antigo passa a PRESERVAR eventos e visualizações (o Diário antigo
-- já resolve o título por media_id; o resto do app antigo filtra por library_item_id e simplesmente não as vê).
--
-- Idempotente (pode rodar mais de uma vez) e transacional. Não apaga nem reescreve dado histórico.
--
-- ROLLBACK LÓGICO (só se necessário; o app novo continua funcionando com o schema antigo, exceto a remoção):
--   begin;
--   alter table public.activity_events drop constraint activity_events_library_item_id_fkey;
--   alter table public.activity_events add constraint activity_events_library_item_id_fkey
--     foreign key (library_item_id) references public.library_items(id) on delete cascade;
--   alter table public.watch_entries drop constraint watch_entries_library_item_id_fkey;
--   alter table public.watch_entries add constraint watch_entries_library_item_id_fkey
--     foreign key (library_item_id) references public.library_items(id) on delete cascade;
--   -- NOT NULL e a constraint de event_type antiga só voltam se não houver linhas órfãs/'library_removed';
--   -- NÃO apague histórico para reverter: deixe essas duas como estão.
--   commit;

begin;

-- 1. activity_events: o evento sobrevive à remoção do item.
alter table public.activity_events drop constraint if exists activity_events_library_item_id_fkey;
alter table public.activity_events
  add constraint activity_events_library_item_id_fkey
  foreign key (library_item_id) references public.library_items(id) on delete set null;

-- 2. watch_entries: a visualização (data, precisão, nota, comentário, reassistida) sobrevive.
alter table public.watch_entries alter column library_item_id drop not null;
alter table public.watch_entries drop constraint if exists watch_entries_library_item_id_fkey;
alter table public.watch_entries
  add constraint watch_entries_library_item_id_fkey
  foreign key (library_item_id) references public.library_items(id) on delete set null;

-- 3. Novo tipo: retrato do item no momento da remoção.
alter table public.activity_events drop constraint if exists activity_events_event_type_check;
alter table public.activity_events
  add constraint activity_events_event_type_check
  check (event_type in ('library_added', 'status_changed', 'season_completed', 'series_completed',
                        'rewatch_started', 'watch_logged', 'library_removed'));

-- 4. Backfill seguro: eventos ainda ligados a um item ganham o media_id dele (mesma identidade, sem inferência).
--    Eventos sem item e sem mídia (legado) ficam como estão: registro histórico sem título.
update public.activity_events ae
set media_id = li.media_id
from public.library_items li
where ae.media_id is null
  and ae.library_item_id = li.id
  and li.user_id = ae.user_id;

commit;

-- Verificação (somente leitura):
--   select conrelid::regclass, pg_get_constraintdef(oid) from pg_constraint
--   where conname in ('activity_events_library_item_id_fkey', 'watch_entries_library_item_id_fkey',
--                     'activity_events_event_type_check');
--   select is_nullable from information_schema.columns
--   where table_name = 'watch_entries' and column_name = 'library_item_id';   -- YES
--   select count(*) from public.activity_events where media_id is null and library_item_id is not null;  -- 0
