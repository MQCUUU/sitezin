-- V2.3 — Insights: instrumentação de recomendações/descoberta + precisão de horário.
--
-- APLICAR ANTES DO DEPLOY DO APP NOVO (o app novo grava colunas criadas aqui).
-- Idempotente (pode rodar mais de uma vez). Segura com a versão ANTERIOR do app:
-- só cria uma tabela nova e adiciona colunas NULL sem default (alteração só de
-- metadados); a versão anterior não lê nem escreve nada disso.
-- O backfill de precisão é um passo SEPARADO, depois do deploy:
-- supabase/v2.3-insights-backfill.sql.
--
-- ===================== user_events =====================
-- Uma linha por OCORRÊNCIA REAL, nunca por render. A identidade de cada
-- ocorrência é `event_key`, montada NO SERVIDOR conforme a semântica do tipo:
--
--   rec_shown      shown:{origem}:{mídia}:{tmdb}:{exposure_id}
--   rec_opened     opened:{origem}:{mídia}:{tmdb}:{exposure_id}
--   rec_dismissed  dismissed:{origem}:{mídia}:{tmdb}:{exposure_id}
--   library_added  added:{library_item_id}
--
-- exposure_id = uma EXPOSIÇÃO: o título visível numa ferramenta, contínua até
-- 30 min sem ser visto (gerado no navegador, reaproveitado por re-render,
-- refresh, voltar/avançar e Strict Mode). Exposição nova = id novo = linha nova.
-- library_added: 1 por entrada na biblioteca (remover e adicionar de novo gera
-- outra library_item e outro evento); exposure_id liga a adição à exposição
-- que a originou (atribuição last-touch por interação, validada no servidor).
--
-- Segurança: RLS LIGADA SEM policies → nega a qualquer papel que não seja o
-- dono. ATENÇÃO: o app conecta como dono (BYPASSRLS), então a RLS NÃO isola
-- requisições do app — o isolamento real é server-side (user_id sempre da
-- sessão). Ver docs/V2.3-INSIGHTS.md §Segurança (débito técnico registrado).
-- FK com ON DELETE CASCADE: excluir a conta apaga os eventos.
-- Payload mínimo: nenhum texto livre, título, URL, IP ou user agent.

create table if not exists public.user_events (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null,
  kind         text not null check (kind in ('rec_shown', 'rec_opened', 'rec_dismissed', 'library_added')),
  source       text not null check (source in (
                 'pick', 'smart_queue', 'assistant', 'for_you',
                 'home', 'discover', 'search', 'title', 'collection', 'person',
                 'lists', 'profile', 'library', 'calendar', 'other')),
  tmdb_id      integer not null check (tmdb_id > 0),
  media_type   text not null check (media_type in ('movie', 'tv')),
  exposure_id  uuid,
  event_key    text,
  created_at   timestamptz not null default now()
);

-- Upgrade de quem tem a versão anterior desta tabela (TEST).
alter table public.user_events add column if not exists exposure_id uuid;
alter table public.user_events add column if not exists event_key text;

delete from public.user_events where tmdb_id <= 0;
delete from public.user_events e
  where not exists (select 1 from neon_auth."user" u where u.id = e.user_id);

-- Linhas antigas (sem exposição) recebem uma chave "legacy" estável.
update public.user_events
  set event_key = 'legacy:' || kind || ':' || source || ':' || media_type || ':' || tmdb_id || ':' || id
  where event_key is null;

alter table public.user_events alter column event_key set not null;

drop index if exists public.user_events_dedup_key;
drop index if exists public.user_events_user_kind_idx;
drop index if exists public.user_events_user_title_idx;

create unique index if not exists user_events_event_key
  on public.user_events (user_id, event_key);

-- Leitura dos Insights: eventos do usuário em ordem temporal.
create index if not exists user_events_user_created_idx
  on public.user_events (user_id, created_at);

do $$ begin if not exists (select 1 from pg_constraint where conrelid = 'public.user_events'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%tmdb_id > 0%') then alter table public.user_events add constraint user_events_tmdb_id_positive check (tmdb_id > 0); end if; end $$;

do $$ begin if not exists (select 1 from pg_constraint where conname = 'user_events_exposure_required') then alter table public.user_events add constraint user_events_exposure_required check (kind = 'library_added' or exposure_id is not null or event_key like 'legacy:%'); end if; end $$;

do $$ begin if not exists (select 1 from pg_constraint where conname = 'user_events_user_id_fkey') then alter table public.user_events add constraint user_events_user_id_fkey foreign key (user_id) references neon_auth."user"(id) on delete cascade; end if; end $$;

alter table public.user_events enable row level security;

comment on table public.user_events is
  'V2.3 Insights: exposições/aberturas/rejeições de recomendações (por exposure_id) e entradas na biblioteca (por library_item). Sem PII.';

-- ===================== precisão de horário =====================
-- 'datetime' = data E hora registradas de fato (relógio do servidor no
-- momento, ou o usuário escolheu a hora); 'date' = só a data é conhecida
-- (seletor de data, imports) — a hora gravada é convenção e NÃO é hábito.
-- NULL = proveniência desconhecida (registros antigos): nunca entra em
-- "horário em que mais assiste". Um evento real às 21:00 é 'datetime'.

alter table public.library_items add column if not exists watched_at_precision text;
alter table public.episodes_progress add column if not exists watched_at_precision text;
alter table public.watch_entries add column if not exists watched_at_precision text;

-- NOT VALID + VALIDATE: não bloqueia escrita durante a verificação.
do $$ begin if not exists (select 1 from pg_constraint where conname = 'library_items_watched_at_precision_check') then alter table public.library_items add constraint library_items_watched_at_precision_check check (watched_at_precision in ('date', 'datetime')) not valid; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'episodes_progress_watched_at_precision_check') then alter table public.episodes_progress add constraint episodes_progress_watched_at_precision_check check (watched_at_precision in ('date', 'datetime')) not valid; end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'watch_entries_watched_at_precision_check') then alter table public.watch_entries add constraint watch_entries_watched_at_precision_check check (watched_at_precision in ('date', 'datetime')) not valid; end if; end $$;

alter table public.library_items validate constraint library_items_watched_at_precision_check;
alter table public.episodes_progress validate constraint episodes_progress_watched_at_precision_check;
alter table public.watch_entries validate constraint watch_entries_watched_at_precision_check;
