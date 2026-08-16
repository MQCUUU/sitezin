 ============================================================
-- MyCatalog — schema.sql
--
-- Reconstruído a partir do banco REAL em 16/08/2026, já
-- refletindo as limpezas do Lote 1 (índices duplicados
-- removidos, policies consolidadas).
--
-- SUBSTITUI o supabase/schema.sql antigo, que descrevia 11
-- tabelas de uma versão que não existe mais.
--
-- ------------------------------------------------------------
-- O QUE ESTE ARQUIVO **NÃO** CONTÉM
-- ------------------------------------------------------------
-- Foi montado a partir de três consultas ao catálogo do
-- Postgres. Elas não expõem tudo. Continua faltando:
--
--   * triggers e funções (inclusive o handle_new_user que
--     deveria criar a linha em `profiles` no cadastro — veja
--     a nota no fim do arquivo)
--   * extensões instaladas
--   * configuração de Auth e Storage do Supabase
--   * os dados de seed das tabelas search_* (~900 mil linhas,
--     geradas por scripts/build-universal-index-v4.mjs)
--
-- Ou seja: rodar isto num projeto novo cria a ESTRUTURA, não
-- um clone funcional. Para backup de verdade, use
-- `supabase db dump`.
-- ============================================================
 
 
-- ============================================================
-- SEQUÊNCIAS
-- ============================================================
 
create sequence if not exists public.media_id_seq;
create sequence if not exists public.characters_id_seq;
 
 
-- ============================================================
-- 1. CATÁLOGO COMPARTILHADO
-- ============================================================
 
create table if not exists public.media (
  id              integer primary key default nextval('media_id_seq'),
  tmdb_id         integer not null,
  media_type      text not null
                    check (media_type is null
                           or media_type in ('movie', 'tv')),
  title           text not null,
  original_title  text,
  overview        text,
  poster_path     text,
  backdrop_path   text,
  release_date    date,
  first_air_date  date,
  genres          text[] default '{}',
  popularity      double precision,
  tmdb_rating     double precision,
  tmdb_vote_count integer,
  runtime         integer,
  seasons_count   integer,
  episodes_count  integer,
  creator_names   text[] default '{}',
  cast_names      text[] default '{}',
  raw             jsonb default '{}',
  created_at      timestamptz default now(),
  updated_at      timestamptz default now(),
  constraint media_tmdb_id_media_type_key unique (tmdb_id, media_type)
);
 
alter sequence public.media_id_seq owned by public.media.id;
 
create index if not exists idx_media_title on public.media (title);
 
 
-- ============================================================
-- 2. USUÁRIO
-- ============================================================
 
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id),
  display_name text,
  created_at   timestamptz not null default now()
);
 
 
create table if not exists public.library_items (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id),
  media_id           integer not null references public.media(id),
  status             text not null default 'want'
                       check (status in ('want', 'watching', 'watched',
                                         'paused', 'dropped',
                                         'rewatching', 'rewatched')),
  favorite           boolean not null default false,
  personal_rating    numeric check (personal_rating between 0 and 10),
  review             text,
  watched_at         timestamptz,
  rewatch_count      integer not null default 0,
  current_season     integer check (current_season is null
                                    or current_season >= 1),
  completed_seasons  integer not null default 0
                       check (completed_seasons >= 0),
  stopped_season     integer check (stopped_season is null
                                    or stopped_season >= 1),
  added_at           timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
 
-- Um título por usuário. É este índice que o upsert de
-- app/api/library/route.ts resolve com onConflict "user_id,media_id".
create unique index if not exists library_items_user_media_unique
  on public.library_items (user_id, media_id);
 
create index if not exists library_items_media_id_idx
  on public.library_items (media_id);
 
create index if not exists library_items_user_added_idx
  on public.library_items (user_id, added_at desc);
 
create index if not exists library_items_user_updated_idx
  on public.library_items (user_id, updated_at desc);
 
create index if not exists library_items_user_status_added_idx
  on public.library_items (user_id, status, added_at desc);
 
-- Parciais: indexam só as linhas que interessam.
create index if not exists library_items_user_favorite_idx
  on public.library_items (user_id, favorite) where favorite = true;
 
create index if not exists library_items_user_rating_idx
  on public.library_items (user_id, personal_rating desc)
  where personal_rating is not null;
 
 
-- ============================================================
-- 3. AVALIAÇÕES POR CATEGORIA  (geração ATUAL — em uso)
-- ============================================================
 
create table if not exists public.review_categories (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id),
  name       text not null,
  weight     numeric not null default 0,
  position   integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
 
 
create table if not exists public.review_scores (
  id              uuid primary key default gen_random_uuid(),
  library_item_id uuid not null references public.library_items(id),
  category_id     uuid not null references public.review_categories(id),
  score           numeric,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint review_scores_library_item_id_category_id_key
    unique (library_item_id, category_id)
);
 
 
-- ============================================================
-- 4. PROGRESSO E HISTÓRICO
-- ============================================================
 
create table if not exists public.episodes_progress (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id),
  media_id       uuid not null,   -- ver NOTA 2 no fim do arquivo
  season_number  integer not null,
  episode_number integer not null,
  watched        boolean not null default false,
  watched_at     timestamptz,
  constraint episodes_progress_user_id_media_id_season_number_episode_nu_key
    unique (user_id, media_id, season_number, episode_number)
);
 
create index if not exists episodes_progress_user_idx
  on public.episodes_progress (user_id);
 
 
create table if not exists public.watch_entries (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id),
  library_item_id uuid not null references public.library_items(id),
  media_id        uuid not null,   -- ver NOTA 2
  watched_at      timestamptz not null default now(),
  rating          numeric check (rating is null or rating between 0 and 10),
  comment         text check (comment is null or char_length(comment) <= 4000),
  is_rewatch      boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
 
create index if not exists watch_entries_user_watched_at_idx
  on public.watch_entries (user_id, watched_at desc);
 
create index if not exists watch_entries_library_item_idx
  on public.watch_entries (library_item_id, watched_at desc);
 
create index if not exists watch_entries_media_idx
  on public.watch_entries (media_id, watched_at desc);
 
 
create table if not exists public.activity_events (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id),
  library_item_id uuid references public.library_items(id),
  media_id        uuid,            -- ver NOTA 2
  event_type      text not null
                    check (event_type in ('library_added', 'status_changed',
                                          'season_completed',
                                          'series_completed',
                                          'rewatch_started')),
  metadata        jsonb not null default '{}',
  occurred_at     timestamptz not null default now()
);
 
create index if not exists activity_events_user_occurred_idx
  on public.activity_events (user_id, occurred_at desc);
 
 
create table if not exists public.user_hidden_titles (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id),
  tmdb_id    bigint not null,
  media_type text not null check (media_type in ('movie', 'tv')),
  reason     text not null default 'not_interested',
  created_at timestamptz not null default now(),
  constraint user_hidden_titles_user_id_tmdb_id_media_type_key
    unique (user_id, tmdb_id, media_type)
);
 
create index if not exists user_hidden_titles_user_created_idx
  on public.user_hidden_titles (user_id, created_at desc);
 
 
-- ============================================================
-- 5. CACHE
-- ============================================================
 
create table if not exists public.ai_recommendation_cache (
  id          uuid primary key default gen_random_uuid(),
  scope       text not null check (scope in ('global', 'personalized')),
  user_id     uuid references auth.users(id),
  query_key   text not null,
  query_text  text not null,
  profile_key text,
  answer      text not null,
  result_refs jsonb not null default '[]',
  hit_count   integer not null default 0,
  created_at  timestamptz not null default now(),
  last_hit_at timestamptz,
  expires_at  timestamptz not null
);
 
create unique index if not exists ai_recommendation_cache_global_unique
  on public.ai_recommendation_cache (query_key) where scope = 'global';
 
create unique index if not exists ai_recommendation_cache_personal_unique
  on public.ai_recommendation_cache (user_id, query_key, profile_key)
  where scope = 'personalized';
 
create index if not exists ai_recommendation_cache_expires_idx
  on public.ai_recommendation_cache (expires_at);
 
create index if not exists ai_recommendation_cache_hits_idx
  on public.ai_recommendation_cache (hit_count desc);
 
 
-- Tabela criada mas nunca usada pelo código (0 linhas, 0
-- referências). Mantida só para o schema bater com o banco.
create table if not exists public.tmdb_cache (
  cache_key  text primary key,
  payload    jsonb not null,
  expires_at timestamptz not null
);
 
create index if not exists tmdb_cache_expires_idx
  on public.tmdb_cache (expires_at);
 
 
-- ============================================================
-- 6. ÍNDICE DE BUSCA
--
-- Populado por scripts/build-universal-index-v4.mjs usando a
-- SUPABASE_SERVICE_ROLE_KEY. ~900 mil linhas, 96 MB.
--
-- RLS ligado e SEM policy é PROPOSITAL: só a service_role
-- escreve/lê aqui. Nenhuma rota da API consulta essas tabelas
-- ainda — a busca do app vai direto ao TMDB.
-- ============================================================
 
create table if not exists public.search_media (
  media_type text not null check (media_type in ('movie', 'tv')),
  tmdb_id    integer not null,
  title      text not null,
  popularity real not null default 0,
  primary key (media_type, tmdb_id)
);
 
 
create table if not exists public.search_people (
  person_id       integer primary key,
  name            text not null,
  normalized_name text not null
);
 
create index if not exists search_people_normalized_idx
  on public.search_people (normalized_name);
 
 
create table if not exists public.search_characters (
  id              bigint generated always as identity primary key,
  name            text not null,
  normalized_name text not null unique
);
 
 
create table if not exists public.search_people_media (
  person_id  integer not null references public.search_people(person_id),
  media_type text not null,
  tmdb_id    integer not null,
  role       smallint not null,
  primary key (person_id, media_type, tmdb_id, role),
  foreign key (media_type, tmdb_id)
    references public.search_media(media_type, tmdb_id)
);
 
 
create table if not exists public.search_character_media (
  character_id bigint not null references public.search_characters(id),
  media_type   text not null,
  tmdb_id      integer not null,
  person_id    integer not null references public.search_people(person_id),
  primary key (character_id, media_type, tmdb_id, person_id),
  foreign key (media_type, tmdb_id)
    references public.search_media(media_type, tmdb_id)
);
 
 
create table if not exists public.search_indexed_media (
  media_type text not null,
  tmdb_id    integer not null,
  version    smallint not null default 43,
  indexed_at timestamptz not null default now(),
  primary key (media_type, tmdb_id),
  foreign key (media_type, tmdb_id)
    references public.search_media(media_type, tmdb_id)
);
 
 
-- ============================================================
-- 7. TABELAS LEGADAS  — ver NOTA 1
--
-- Todas com 0 linhas e nenhuma referência no código, exceto
-- people/characters que têm dados de uma versão anterior do
-- índice de busca, hoje superada pelas search_*.
--
-- NÃO APAGUE sem confirmar. Estão aqui para o schema refletir
-- o banco de verdade.
-- ============================================================
 
create table if not exists public.rating_categories (
  id       uuid primary key default gen_random_uuid(),
  user_id  uuid not null references auth.users(id),
  name     text not null,
  weight   numeric not null default 0,
  position integer not null default 0,
  active   boolean not null default true,
  constraint rating_categories_user_id_name_key unique (user_id, name)
);
 
create index if not exists rating_categories_user_position_idx
  on public.rating_categories (user_id, "position");
 
 
create table if not exists public.category_ratings (
  id              uuid primary key default gen_random_uuid(),
  library_item_id uuid not null references public.library_items(id),
  category_id     uuid not null references public.rating_categories(id),
  rating          numeric not null check (rating between 0 and 10),
  constraint category_ratings_library_item_id_category_id_key
    unique (library_item_id, category_id)
);
 
create index if not exists category_ratings_library_item_idx
  on public.category_ratings (library_item_id);
 
 
create table if not exists public.personal_tags (
  id      uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  name    text not null,
  constraint personal_tags_user_id_name_key unique (user_id, name)
);
 
create index if not exists personal_tags_user_idx
  on public.personal_tags (user_id);
 
 
create table if not exists public.library_tags (
  library_item_id uuid not null references public.library_items(id),
  tag_id          uuid not null references public.personal_tags(id),
  primary key (library_item_id, tag_id)
);
 
create index if not exists library_tags_library_item_idx
  on public.library_tags (library_item_id);
 
 
create table if not exists public.custom_lists (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id),
  name        text not null,
  description text,
  created_at  timestamptz not null default now()
);
 
create index if not exists custom_lists_user_idx
  on public.custom_lists (user_id);
 
 
create table if not exists public.custom_list_items (
  list_id         uuid not null references public.custom_lists(id),
  library_item_id uuid not null references public.library_items(id),
  position        integer not null default 0,
  primary key (list_id, library_item_id)
);
 
create index if not exists custom_list_items_list_idx
  on public.custom_list_items (list_id);
 
 
-- Segunda geração de tags/listas, também abandonada.
create table if not exists public.tags (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id),
  name        text not null,
  description text,
  color       text default '#3b82f6',
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);
 
 
create table if not exists public.movie_tags (
  id         uuid primary key default gen_random_uuid(),
  movie_id   text not null,
  tag_id     uuid not null references public.tags(id),
  user_id    uuid not null references auth.users(id),
  created_at timestamptz default now(),
  constraint movie_tags_movie_id_tag_id_user_id_key
    unique (movie_id, tag_id, user_id)
);
 
 
create table if not exists public.lists (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id),
  name        text not null,
  description text,
  is_public   boolean default false,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);
 
 
create table if not exists public.list_items (
  id       uuid primary key default gen_random_uuid(),
  list_id  uuid not null references public.lists(id),
  movie_id text not null,
  user_id  uuid not null references auth.users(id),
  added_at timestamptz default now(),
  constraint list_items_list_id_movie_id_user_id_key
    unique (list_id, movie_id, user_id)
);
 
 
-- Primeira geração do índice de busca, superada pelas search_*.
create table if not exists public.people (
  id              integer primary key,
  name            text not null,
  normalized_name text not null
);
 
create index if not exists idx_people_normalized
  on public.people (normalized_name);
 
 
create table if not exists public.characters (
  id              integer primary key default nextval('characters_id_seq'),
  name            text not null,
  normalized_name text not null
);
 
alter sequence public.characters_id_seq owned by public.characters.id;
 
create index if not exists idx_characters_normalized
  on public.characters (normalized_name);
 
 
create table if not exists public.people_media (
  person_id integer not null references public.people(id),
  media_id  integer not null references public.media(id),
  role      text not null,
  primary key (person_id, media_id, role)
);
 
 
create table if not exists public.character_media (
  character_id integer not null references public.characters(id),
  media_id     integer not null references public.media(id),
  person_id    integer not null references public.people(id),
  primary key (character_id, media_id, person_id)
);
 
 
-- ============================================================
-- 8. ROW LEVEL SECURITY
-- ============================================================
 
alter table public.media                   enable row level security;
alter table public.profiles                enable row level security;
alter table public.library_items           enable row level security;
alter table public.review_categories       enable row level security;
alter table public.review_scores           enable row level security;
alter table public.episodes_progress       enable row level security;
alter table public.watch_entries           enable row level security;
alter table public.activity_events         enable row level security;
alter table public.user_hidden_titles      enable row level security;
alter table public.ai_recommendation_cache enable row level security;
alter table public.tmdb_cache              enable row level security;
alter table public.rating_categories       enable row level security;
alter table public.category_ratings        enable row level security;
alter table public.personal_tags           enable row level security;
alter table public.library_tags            enable row level security;
alter table public.custom_lists            enable row level security;
alter table public.custom_list_items       enable row level security;
alter table public.tags                    enable row level security;
alter table public.movie_tags              enable row level security;
alter table public.lists                   enable row level security;
alter table public.list_items              enable row level security;
alter table public.people                  enable row level security;
alter table public.characters              enable row level security;
alter table public.people_media            enable row level security;
alter table public.character_media         enable row level security;
alter table public.search_media            enable row level security;
alter table public.search_people           enable row level security;
alter table public.search_characters       enable row level security;
alter table public.search_people_media     enable row level security;
alter table public.search_character_media  enable row level security;
alter table public.search_indexed_media    enable row level security;
 
-- As tabelas search_*, people, characters, people_media e
-- character_media ficam SEM policy de propósito: só a
-- service_role acessa.
 
 
-- ------------------------------------------------------------
-- Catálogo: leitura livre para quem está logado; escrita
-- liberada porque app/api/library/route.ts faz upsert aqui
-- com o cliente comum.
--
-- PENDÊNCIA CONHECIDA (Lote 4): mover essa escrita para a
-- service_role ou uma função SECURITY DEFINER, para que um
-- usuário não possa alterar o catálogo compartilhado.
-- ------------------------------------------------------------
 
create policy "media legivel" on public.media
  for select to authenticated using (true);
 
create policy "media inserivel" on public.media
  for insert to authenticated with check (true);
 
create policy "media atualizavel" on public.media
  for update to authenticated using (true) with check (true);
 
 
-- ------------------------------------------------------------
-- Dono direto. (select auth.uid()) em vez de auth.uid() faz o
-- Postgres avaliar a função uma vez por consulta, não uma vez
-- por linha.
-- ------------------------------------------------------------
 
create policy "own profile" on public.profiles
  for all to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);
 
create policy "own library" on public.library_items
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
 
create policy "own episodes" on public.episodes_progress
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
 
create policy "own activity" on public.activity_events
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
 
create policy "own categories" on public.rating_categories
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
 
create policy "own tags" on public.personal_tags
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
 
create policy "own lists" on public.custom_lists
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
 
 
-- watch_entries e user_hidden_titles: policies separadas por
-- comando. user_hidden_titles PRECISA da de UPDATE — o upsert
-- de app/api/not-interested/route.ts vira UPDATE em caso de
-- conflito.
 
create policy "watch_entries_select_own" on public.watch_entries
  for select to authenticated using ((select auth.uid()) = user_id);
 
create policy "watch_entries_insert_own" on public.watch_entries
  for insert to authenticated with check ((select auth.uid()) = user_id);
 
create policy "watch_entries_update_own" on public.watch_entries
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
 
create policy "watch_entries_delete_own" on public.watch_entries
  for delete to authenticated using ((select auth.uid()) = user_id);
 
 
create policy "hidden_select_own" on public.user_hidden_titles
  for select to authenticated using ((select auth.uid()) = user_id);
 
create policy "hidden_insert_own" on public.user_hidden_titles
  for insert to authenticated with check ((select auth.uid()) = user_id);
 
create policy "hidden_update_own" on public.user_hidden_titles
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
 
create policy "hidden_delete_own" on public.user_hidden_titles
  for delete to authenticated using ((select auth.uid()) = user_id);
 
 
-- ------------------------------------------------------------
-- Dono indireto: a permissão vem da library_items dona.
-- ------------------------------------------------------------
 
create policy "own review categories" on public.review_categories
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
 
create policy "own review scores" on public.review_scores
  for all to authenticated
  using (exists (
    select 1 from public.library_items li
    where li.id = library_item_id
      and li.user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.library_items li
    where li.id = library_item_id
      and li.user_id = (select auth.uid())
  ));
 
create policy "own category ratings" on public.category_ratings
  for all to authenticated
  using (exists (
    select 1 from public.library_items li
    where li.id = library_item_id
      and li.user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.library_items li
    where li.id = library_item_id
      and li.user_id = (select auth.uid())
  ));
 
create policy "own library tags" on public.library_tags
  for all to authenticated
  using (exists (
    select 1 from public.library_items li
    where li.id = library_item_id
      and li.user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.library_items li
    where li.id = library_item_id
      and li.user_id = (select auth.uid())
  ));
 
create policy "own list items" on public.custom_list_items
  for all to authenticated
  using (exists (
    select 1 from public.custom_lists l
    where l.id = list_id and l.user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.custom_lists l
    where l.id = list_id and l.user_id = (select auth.uid())
  ));
 
 
-- Tabelas legadas de segunda geração.
create policy "own tags v2" on public.tags
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
 
create policy "own movie tags" on public.movie_tags
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
 
create policy "own lists v2" on public.lists
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
 
create policy "own list items v2" on public.list_items
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
 
 
-- ------------------------------------------------------------
-- Cache da IA
-- ------------------------------------------------------------
 
create policy "ai cache read global" on public.ai_recommendation_cache
  for select to authenticated using (scope = 'global');
 
create policy "ai cache read own personalized" on public.ai_recommendation_cache
  for select to authenticated
  using (scope = 'personalized' and user_id = (select auth.uid()));
 
create policy "ai cache insert own personalized" on public.ai_recommendation_cache
  for insert to authenticated
  with check (scope = 'personalized' and user_id = (select auth.uid()));
 
create policy "ai cache update own personalized" on public.ai_recommendation_cache
  for update to authenticated
  using (scope = 'personalized' and user_id = (select auth.uid()))
  with check (scope = 'personalized' and user_id = (select auth.uid()));
 
create policy "ai cache delete expired" on public.ai_recommendation_cache
  for delete to authenticated
  using (expires_at < now()
         and (scope = 'global' or user_id = (select auth.uid())));
 
-- Escrita no escopo GLOBAL fica só para a service_role — sem
-- policy. Antes qualquer usuário logado podia sobrescrever
-- linhas globais servidas a todo mundo.
-- Se você NÃO rodou a Parte C do 03-policies-limpeza.sql,
-- o banco ainda tem as duas policies antigas.
 
 
-- Cache do TMDB: bloqueado para todos. Só a service_role entra.
create policy "cache server only" on public.tmdb_cache
  for all to authenticated using (false) with check (false);
 
 
-- ============================================================
-- NOTAS
-- ============================================================
--
-- NOTA 1 — TABELAS LEGADAS
--   15 das 30 tabelas estão sem uso: três gerações do mesmo
--   recurso convivendo (avaliações, tags, listas, índice de
--   busca). Todas com 0 linhas, exceto people/characters/
--   people_media/character_media, que guardam dados de uma
--   versão anterior da busca.
--
--   Antes de apagar qualquer uma, rode a consulta 5 do
--   00-diagnostico.sql e confirme que ninguém as lê.
--
--
-- NOTA 2 — media_id COM TIPO INCOMPATÍVEL
--   media.id é INTEGER. Mas as colunas media_id de
--   episodes_progress, watch_entries e activity_events são
--   UUID, e nenhuma tem foreign key para media.
--
--   Do jeito que está, essas colunas não conseguem apontar
--   para media. Todas as três tabelas estão com 0 linhas
--   (activity_events tem 248, mas via library_item_id).
--
--   Precisa ser investigado antes de essas funcionalidades
--   entrarem em uso de verdade.
--
--
-- NOTA 3 — profiles NUNCA É PREENCHIDA
--   A tabela está com 0 linhas mesmo havendo contas criadas.
--   Falta o trigger padrão do Supabase que insere a linha
--   quando alguém se cadastra. Algo como:
--
--     create function public.handle_new_user()
--     returns trigger language plpgsql security definer as $$
--     begin
--       insert into public.profiles (id, display_name)
--       values (new.id, new.raw_user_meta_data->>'display_name');
--       return new;
--     end; $$;
--
--     create trigger on_auth_user_created
--       after insert on auth.users
--       for each row execute function public.handle_new_user();
--
--   NÃO rode isso sem antes verificar como a página /profile
--   lê os dados hoje — ela pode estar usando auth.users direto.
-- ============================================================
 