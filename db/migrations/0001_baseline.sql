-- ============================================================================
-- 0001_baseline.sql — schema completo do MyCatalog (schema public).
--
-- Gerado em 2026-10-22 a partir do catálogo do banco TEST (consulta somente leitura,
-- Fase 6). Substitui como ponto de partida os SQL soltos de supabase/ e as três
-- migrations antigas de db/migrations (hoje em db/legacy/, só como histórico).
--
-- PRÉ-REQUISITO: Neon Auth habilitado no branch (cria o schema neon_auth, dono
-- das contas). As tabelas do app referenciam neon_auth."user"(id).
--
-- O QUE NÃO VEM AQUI (de propósito):
--   * dados — inclusive o índice de busca search_* (~900 mil linhas, gerado por
--     scripts/build-universal-index-v4.mjs);
--   * a tabela de exemplo playing_with_neon (criada pela Neon, sem uso);
--   * o schema neon_auth (gerenciado pelo Neon Auth).
--
-- Aplicar SÓ em banco vazio, via `npm run db:migrate` (registra em
-- public.schema_migrations). Bancos que já existem (TEST/PROD) adotam esta
-- baseline com `npm run db:migrate -- --baseline`, que só a registra.
-- ============================================================================

SET check_function_bodies = off;
SET search_path = public, extensions;

DO $$
BEGIN
  IF to_regclass('neon_auth."user"') IS NULL THEN
    RAISE EXCEPTION 'Pré-requisito ausente: habilite o Neon Auth neste branch (schema neon_auth) antes das migrations.';
  END IF;
END $$;

-- Extensões (fora do schema exposto, como no banco real).
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS fuzzystrmatch WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;

-- Sequências usadas por DEFAULT nextval(...) (as de colunas IDENTITY nascem com a tabela).
CREATE SEQUENCE IF NOT EXISTS public.characters_id_seq AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1;
CREATE SEQUENCE IF NOT EXISTS public.media_id_seq AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1;

-- Funções (antes das tabelas: CHECKs/índices/triggers podem usá-las).
CREATE OR REPLACE FUNCTION public.custom_list_items_fill_media()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if new.media_id is null and new.library_item_id is not null then
    select li.media_id into new.media_id from public.library_items li where li.id = new.library_item_id;
  end if;
  return new;
end
$function$;

CREATE OR REPLACE FUNCTION public.get_database_size_mb()
 RETURNS numeric
 LANGUAGE sql
 SET search_path TO 'pg_catalog'
AS $function$
  SELECT pg_database_size(current_database()) / 1024 / 1024::numeric;
$function$;

CREATE OR REPLACE FUNCTION public.guard_profile_username_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
    BEGIN
      IF new.username IS DISTINCT FROM old.username
         AND current_user NOT IN ('postgres', 'service_role', 'supabase_admin', 'neondb_owner') THEN
        RAISE EXCEPTION 'use_change_my_username';
      END IF;
      RETURN new;
    END;
    $function$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin insert into public.profiles(id,display_name) values(new.id,coalesce(new.raw_user_meta_data->>'display_name',split_part(new.email,'@',1))); return new; end; $function$;

CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  requested_username text := lower(trim(new.raw_user_meta_data ->> 'username'));
begin
  if requested_username is null or requested_username !~ '^[a-z0-9_]{3,24}$' then
    requested_username := 'user_' || substr(replace(new.id::text, '-', ''), 1, 12);
  end if;

  if exists (select 1 from public.profiles p where lower(p.username) = requested_username and p.id <> new.id) then
    requested_username := left(requested_username, 17) || '_' || substr(replace(new.id::text, '-', ''), 1, 6);
  end if;

  begin
    insert into public.profiles (id, display_name, username, avatar_url, visibility, is_public)
    values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', requested_username), requested_username, new.raw_user_meta_data ->> 'avatar_url', 'private', false)
    on conflict (id) do nothing;
  exception when unique_violation then
    requested_username := 'user_' || substr(replace(new.id::text, '-', ''), 1, 18);
    insert into public.profiles (id, display_name, username, avatar_url, visibility, is_public)
    values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', requested_username), requested_username, new.raw_user_meta_data ->> 'avatar_url', 'private', false)
    on conflict (id) do nothing;
  end;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.search_normalize(input text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
  select
    trim(
      regexp_replace(
        lower(
          translate(
            coalesce(
              input,
              ''
            ),

            'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',

            'aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN'
          )
        ),

        '[^a-z0-9]+',

        ' ',

        'g'
      )
    );
$function$;

CREATE OR REPLACE FUNCTION public.search_v4_character_media(target_character_id bigint)
 RETURNS TABLE(media_type text, tmdb_id integer, media_title text, character_name text, person_name text, popularity real)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select distinct on (cm.media_type, cm.tmdb_id)
    cm.media_type, cm.tmdb_id, sm.title, c.name, p.name, sm.popularity
  from public.search_character_media cm
  join public.search_characters c on c.id = cm.character_id
  join public.search_media sm on sm.media_type = cm.media_type and sm.tmdb_id = cm.tmdb_id
  left join public.search_people p on p.person_id = cm.person_id
  where cm.character_id = target_character_id
  order by cm.media_type, cm.tmdb_id, sm.popularity desc;
$function$;

CREATE OR REPLACE FUNCTION public.search_v4_characters(query_text text, result_limit integer DEFAULT 12)
 RETURNS TABLE(character_id bigint, character_name text, normalized_name text, name_similarity real, match_kind text, media_count bigint, max_media_popularity real, avg_media_popularity real, sum_media_popularity real, entity_score double precision)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  with input as (
    select trim(lower(regexp_replace(
      coalesce(query_text, ''), '[^a-zA-Z0-9]+', ' ', 'g'
    )))::text as q
  ),
  plausible_raw as (
    select c.id, c.name, c.normalized_name,
      similarity(c.normalized_name, i.q)::real as sim,
      case
        when c.normalized_name = i.q then 'exact'
        when c.normalized_name like i.q || '%' then 'prefix'
        when c.normalized_name like '%' || i.q || '%' then 'contains'
        else 'fuzzy'
      end as kind,
      case
        when c.normalized_name = i.q then 850.0
        when c.normalized_name like i.q || '%' then 620.0
        when c.normalized_name like '%' || i.q || '%' then 510.0
        else 390.0 + similarity(c.normalized_name, i.q) * 170.0
      end as name_score
    from public.search_characters c cross join input i
    where length(i.q) >= 3 and (
      c.normalized_name = i.q
      or c.normalized_name like i.q || '%'
      or c.normalized_name like '%' || i.q || '%'
      or (length(i.q) >= 5 and similarity(c.normalized_name, i.q) >=
        case when position(' ' in i.q) > 0 then 0.74 else 0.82 end)
      or (length(i.q) >= 5
        and left(c.normalized_name, 3) = left(i.q, 3)
        and levenshtein(c.normalized_name, i.q) = 1)
    )
  ),
  plausible as (
    select * from plausible_raw
    where kind = 'exact'

    union all

    select * from (
      select * from plausible_raw
      where kind <> 'exact'
      order by name_score desc, sim desc
      limit 30
    ) limited
  ),
  stats as (
    select x.id, x.name, x.normalized_name, x.sim, x.kind, x.name_score,
      count(distinct (cm.media_type, cm.tmdb_id)) as media_count,
      coalesce(max(sm.popularity), 0)::real as max_pop,
      coalesce(avg(sm.popularity), 0)::real as avg_pop,
      coalesce(sum(sm.popularity), 0)::real as sum_pop
    from plausible x
    join public.search_character_media cm on cm.character_id = x.id
    join public.search_media sm on sm.media_type = cm.media_type and sm.tmdb_id = cm.tmdb_id
    group by x.id, x.name, x.normalized_name, x.sim, x.kind, x.name_score
  )
  select s.id, s.name, s.normalized_name, s.sim, s.kind,
    s.media_count, s.max_pop, s.avg_pop, s.sum_pop,
    s.name_score + least(250.0,
      ln(1 + s.media_count::numeric) * 30.0 +
      sqrt(greatest(s.max_pop, 0)) * 4.5 +
      ln(1 + greatest(s.avg_pop, 0)) * 7.0 +
      ln(1 + greatest(s.sum_pop, 0)) * 10.0
    ) as entity_score
  from stats s
  order by entity_score desc, s.media_count desc
  limit greatest(1, least(coalesce(result_limit, 12), 200));
$function$;

CREATE OR REPLACE FUNCTION public.search_v4_people(query_text text, result_limit integer DEFAULT 12)
 RETURNS TABLE(person_id integer, person_name text, normalized_name text, name_similarity real, match_kind text, media_count bigint, important_credit_count bigint, max_media_popularity real, avg_media_popularity real, sum_media_popularity real, entity_score double precision)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  with input as (
    select trim(lower(regexp_replace(
      coalesce(query_text, ''), '[^a-zA-Z0-9]+', ' ', 'g'
    )))::text as q
  ),
  plausible_raw as (
    select p.person_id, p.name, p.normalized_name,
      similarity(p.normalized_name, i.q)::real as sim,
      case
        when p.normalized_name = i.q then 'exact'
        when right(p.normalized_name, length(i.q) + 1) = ' ' || i.q then 'surname'
        when (' ' || p.normalized_name || ' ') like '% ' || i.q || ' %' then 'token'
        when p.normalized_name like i.q || '%' then 'prefix'
        when p.normalized_name like '%' || i.q || '%' then 'contains'
        else 'fuzzy'
      end as kind,
      case
        when p.normalized_name = i.q then 800.0
        when right(p.normalized_name, length(i.q) + 1) = ' ' || i.q then 700.0
        when (' ' || p.normalized_name || ' ') like '% ' || i.q || ' %' then 650.0
        when p.normalized_name like i.q || '%' then 590.0
        when p.normalized_name like '%' || i.q || '%' then 500.0
        else 390.0 + similarity(p.normalized_name, i.q) * 180.0
      end as name_score
    from public.search_people p cross join input i
    where length(i.q) >= 3 and (
      p.normalized_name = i.q
      or p.normalized_name like '%' || i.q || '%'
      or (length(i.q) >= 5 and similarity(p.normalized_name, i.q) >=
        case when position(' ' in i.q) > 0 then 0.72 else 0.80 end)
      or (length(i.q) >= 5
        and left(p.normalized_name, 3) = left(i.q, 3)
        and levenshtein(p.normalized_name, i.q) = 1)
    )
  ),
  plausible as (
    select * from plausible_raw
    where kind in ('exact', 'surname', 'token')

    union all

    select * from (
      select * from plausible_raw
      where kind not in ('exact', 'surname', 'token')
      order by name_score desc, sim desc
      limit 30
    ) limited
  ),
  stats as (
    select x.person_id, x.name, x.normalized_name, x.sim, x.kind, x.name_score,
      count(distinct (pm.media_type, pm.tmdb_id)) as media_count,
      count(*) filter (where pm.role in (2, 3, 4, 5)) as important_count,
      count(*) filter (where pm.role = 1) as actor_count,
      count(*) filter (where pm.role = 2) as director_count,
      count(*) filter (where pm.role = 4) as creator_count,
      sum(case pm.role
        when 1 then 10
        when 2 then 9
        when 4 then 8
        when 3 then 4
        when 5 then 2
        else 0
      end) as role_points,
      coalesce(max(sm.popularity), 0)::real as max_pop,
      coalesce(avg(sm.popularity), 0)::real as avg_pop,
      coalesce(sum(sm.popularity), 0)::real as sum_pop
    from plausible x
    join public.search_people_media pm on pm.person_id = x.person_id
    join public.search_media sm on sm.media_type = pm.media_type and sm.tmdb_id = pm.tmdb_id
    group by x.person_id, x.name, x.normalized_name, x.sim, x.kind, x.name_score
  )
  select s.person_id, s.name, s.normalized_name, s.sim, s.kind,
    s.media_count, s.important_count, s.max_pop, s.avg_pop, s.sum_pop,
    s.name_score + least(260.0,
      ln(1 + s.media_count::numeric) * 24.0 +
      ln(1 + s.role_points::numeric) * 7.0 +
      sqrt(greatest(s.max_pop, 0)) * 4.0 +
      ln(1 + greatest(s.avg_pop, 0)) * 6.0 +
      ln(1 + greatest(s.sum_pop, 0)) * 9.0
    ) + case
      when s.media_count <= 3
       and s.actor_count = 0
       and s.director_count = 0
       and s.creator_count = 0
      then -120.0
      else 0.0
    end as entity_score
  from stats s
  order by entity_score desc, s.media_count desc
  limit greatest(1, least(coalesce(result_limit, 12), 200));
$function$;

CREATE OR REPLACE FUNCTION public.search_v4_person_media(target_person_id integer)
 RETURNS TABLE(media_type text, tmdb_id integer, media_title text, role smallint, popularity real)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select distinct on (pm.media_type, pm.tmdb_id)
    pm.media_type, pm.tmdb_id, sm.title, pm.role, sm.popularity
  from public.search_people_media pm
  join public.search_media sm on sm.media_type = pm.media_type and sm.tmdb_id = pm.tmdb_id
  where pm.person_id = target_person_id
  order by pm.media_type, pm.tmdb_id,
    case pm.role when 2 then 5 when 4 then 4 when 1 then 3 when 3 then 2 else 1 end desc,
    sm.popularity desc;
$function$;

-- Tabelas.
CREATE TABLE public.activity_events (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  library_item_id uuid,
  event_type text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
  occurred_at timestamp with time zone DEFAULT now() NOT NULL,
  media_id integer
);

CREATE TABLE public.ai_recommendation_cache (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  scope text NOT NULL,
  user_id uuid,
  query_key text NOT NULL,
  query_text text NOT NULL,
  profile_key text,
  answer text NOT NULL,
  result_refs jsonb DEFAULT '[]'::jsonb NOT NULL,
  hit_count integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  last_hit_at timestamp with time zone,
  expires_at timestamp with time zone NOT NULL
);

CREATE TABLE public.api_rate_limits (
  user_id uuid NOT NULL,
  action text NOT NULL,
  window_started_at timestamp with time zone DEFAULT now() NOT NULL,
  request_count integer DEFAULT 0 NOT NULL
);

CREATE TABLE public.category_ratings (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  library_item_id uuid NOT NULL,
  category_id uuid NOT NULL,
  rating numeric(3,1) NOT NULL
);

CREATE TABLE public.character_media (
  character_id integer NOT NULL,
  media_id integer NOT NULL,
  person_id integer NOT NULL
);

CREATE TABLE public.characters (
  id integer DEFAULT nextval('characters_id_seq'::regclass) NOT NULL,
  name text NOT NULL,
  normalized_name text NOT NULL
);

CREATE TABLE public.custom_list_items (
  list_id uuid NOT NULL,
  library_item_id uuid,
  position integer DEFAULT 0 NOT NULL,
  media_id integer NOT NULL,
  added_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.custom_lists (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  is_public boolean DEFAULT false NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.episodes_progress (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  season_number integer NOT NULL,
  episode_number integer NOT NULL,
  watched boolean DEFAULT false NOT NULL,
  watched_at timestamp with time zone,
  media_id integer NOT NULL,
  comment text,
  is_rewatch boolean DEFAULT false NOT NULL,
  watched_at_precision text
);

CREATE TABLE public.follows (
  follower_id uuid NOT NULL,
  following_id uuid NOT NULL,
  status text DEFAULT 'pending'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.friendships (
  requester_id uuid NOT NULL,
  addressee_id uuid NOT NULL,
  status text DEFAULT 'pending'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.library_items (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  status text DEFAULT 'want'::text NOT NULL,
  favorite boolean DEFAULT false NOT NULL,
  personal_rating numeric(3,1),
  review text,
  watched_at timestamp with time zone,
  rewatch_count integer DEFAULT 0 NOT NULL,
  added_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  current_season integer,
  completed_seasons integer DEFAULT 0 NOT NULL,
  stopped_season integer,
  media_id integer NOT NULL,
  watched_at_precision text
);

CREATE TABLE public.library_tags (
  library_item_id uuid NOT NULL,
  tag_id uuid NOT NULL
);

CREATE TABLE public.list_items (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  list_id uuid NOT NULL,
  movie_id text NOT NULL,
  user_id uuid NOT NULL,
  added_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.lists (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  description text,
  is_public boolean DEFAULT false,
  user_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.media (
  id integer DEFAULT nextval('media_id_seq'::regclass) NOT NULL,
  tmdb_id integer NOT NULL,
  media_type text NOT NULL,
  title text NOT NULL,
  popularity double precision,
  original_title text,
  overview text,
  poster_path text,
  backdrop_path text,
  release_date date,
  first_air_date date,
  genres text[] DEFAULT '{}'::text[],
  tmdb_rating double precision,
  tmdb_vote_count integer,
  runtime integer,
  seasons_count integer,
  episodes_count integer,
  creator_names text[] DEFAULT '{}'::text[],
  cast_names text[] DEFAULT '{}'::text[],
  raw jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.movie_tags (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  movie_id text NOT NULL,
  tag_id uuid NOT NULL,
  user_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.notification_preferences (
  user_id uuid NOT NULL,
  new_follower_site boolean DEFAULT true NOT NULL,
  new_follower_email boolean DEFAULT false NOT NULL,
  follow_request_site boolean DEFAULT true NOT NULL,
  follow_request_email boolean DEFAULT false NOT NULL,
  review_like_site boolean DEFAULT true NOT NULL,
  review_like_email boolean DEFAULT false NOT NULL,
  product_updates_email boolean DEFAULT false NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  new_season_site boolean DEFAULT true NOT NULL,
  new_episode_site boolean DEFAULT true NOT NULL
);

CREATE TABLE public.notifications (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  event_key text NOT NULL,
  type text NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  href text,
  release_at timestamp with time zone,
  release_precision text DEFAULT 'date'::text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
  read_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.people (
  id integer NOT NULL,
  name text NOT NULL,
  normalized_name text NOT NULL
);

CREATE TABLE public.people_media (
  person_id integer NOT NULL,
  media_id integer NOT NULL,
  role text NOT NULL
);

CREATE TABLE public.personal_tags (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  name text NOT NULL
);

CREATE TABLE public.profile_favorites (
  user_id uuid NOT NULL,
  media_id integer NOT NULL,
  media_type text NOT NULL,
  position smallint NOT NULL
);

CREATE TABLE public.profiles (
  id uuid NOT NULL,
  display_name text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  username text,
  bio text,
  avatar_url text,
  is_public boolean DEFAULT false NOT NULL,
  visibility text DEFAULT 'private'::text NOT NULL,
  follow_policy text DEFAULT 'profile'::text NOT NULL,
  followers_visibility text DEFAULT 'profile'::text NOT NULL,
  following_visibility text DEFAULT 'profile'::text NOT NULL,
  activity_visibility text DEFAULT 'profile'::text NOT NULL,
  diary_visibility text DEFAULT 'profile'::text NOT NULL,
  lists_visibility text DEFAULT 'profile'::text NOT NULL,
  likes_visibility text DEFAULT 'profile'::text NOT NULL
);

CREATE TABLE public.rating_categories (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  name text NOT NULL,
  weight numeric(5,2) DEFAULT 0 NOT NULL,
  position integer DEFAULT 0 NOT NULL,
  active boolean DEFAULT true NOT NULL
);

CREATE TABLE public.review_categories (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  name text NOT NULL,
  weight numeric DEFAULT 0 NOT NULL,
  position integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.review_scores (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  library_item_id uuid NOT NULL,
  category_id uuid NOT NULL,
  score numeric,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.search_character_media (
  character_id bigint NOT NULL,
  media_type text NOT NULL,
  tmdb_id integer NOT NULL,
  person_id integer NOT NULL
);

CREATE TABLE public.search_characters (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  name text NOT NULL,
  normalized_name text NOT NULL
);

CREATE TABLE public.search_indexed_media (
  media_type text NOT NULL,
  tmdb_id integer NOT NULL,
  version smallint DEFAULT 43 NOT NULL,
  indexed_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.search_media (
  media_type text NOT NULL,
  tmdb_id integer NOT NULL,
  title text NOT NULL,
  popularity real DEFAULT 0 NOT NULL
);

CREATE TABLE public.search_people (
  person_id integer NOT NULL,
  name text NOT NULL,
  normalized_name text NOT NULL
);

CREATE TABLE public.search_people_media (
  person_id integer NOT NULL,
  media_type text NOT NULL,
  tmdb_id integer NOT NULL,
  role smallint NOT NULL
);

CREATE TABLE public.tags (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  description text,
  color text DEFAULT '#3b82f6'::text,
  user_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.tmdb_cache (
  cache_key text NOT NULL,
  payload jsonb NOT NULL,
  expires_at timestamp with time zone NOT NULL
);

CREATE TABLE public.user_events (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  kind text NOT NULL,
  source text NOT NULL,
  tmdb_id integer NOT NULL,
  media_type text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  exposure_id uuid,
  event_key text NOT NULL
);

CREATE TABLE public.user_hidden_titles (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  tmdb_id bigint NOT NULL,
  media_type text NOT NULL,
  reason text DEFAULT 'not_interested'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.user_preferences (
  user_id uuid NOT NULL,
  appearance jsonb DEFAULT '{}'::jsonb NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.user_streaming_services (
  user_id uuid NOT NULL,
  provider_id integer NOT NULL,
  provider_name text NOT NULL,
  logo_path text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.username_changes (
  id bigint GENERATED BY DEFAULT AS IDENTITY NOT NULL,
  user_id uuid NOT NULL,
  old_username text NOT NULL,
  new_username text NOT NULL,
  changed_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.watch_entries (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  library_item_id uuid,
  watched_at timestamp with time zone DEFAULT now() NOT NULL,
  rating numeric(3,1),
  comment text,
  is_rewatch boolean DEFAULT false NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  media_id integer NOT NULL,
  watched_at_precision text
);

-- Chaves primárias, únicas e CHECKs.
ALTER TABLE public.activity_events ADD CONSTRAINT activity_events_event_type_check CHECK ((event_type = ANY (ARRAY['library_added'::text, 'status_changed'::text, 'season_completed'::text, 'series_completed'::text, 'rewatch_started'::text, 'watch_logged'::text, 'library_removed'::text])));
ALTER TABLE public.activity_events ADD CONSTRAINT activity_events_pkey PRIMARY KEY (id);
ALTER TABLE public.ai_recommendation_cache ADD CONSTRAINT ai_cache_scope_owner_check CHECK ((((scope = 'global'::text) AND (user_id IS NULL) AND (profile_key IS NULL)) OR ((scope = 'personalized'::text) AND (user_id IS NOT NULL) AND (profile_key IS NOT NULL))));
ALTER TABLE public.ai_recommendation_cache ADD CONSTRAINT ai_recommendation_cache_scope_check CHECK ((scope = ANY (ARRAY['global'::text, 'personalized'::text])));
ALTER TABLE public.ai_recommendation_cache ADD CONSTRAINT ai_recommendation_cache_pkey PRIMARY KEY (id);
ALTER TABLE public.api_rate_limits ADD CONSTRAINT api_rate_limits_request_count_check CHECK ((request_count >= 0));
ALTER TABLE public.api_rate_limits ADD CONSTRAINT api_rate_limits_pkey PRIMARY KEY (user_id, action);
ALTER TABLE public.category_ratings ADD CONSTRAINT category_ratings_rating_check CHECK (((rating >= (0)::numeric) AND (rating <= (10)::numeric)));
ALTER TABLE public.category_ratings ADD CONSTRAINT category_ratings_pkey PRIMARY KEY (id);
ALTER TABLE public.category_ratings ADD CONSTRAINT category_ratings_library_item_id_category_id_key UNIQUE (library_item_id, category_id);
ALTER TABLE public.character_media ADD CONSTRAINT character_media_pkey PRIMARY KEY (character_id, media_id, person_id);
ALTER TABLE public.characters ADD CONSTRAINT characters_pkey PRIMARY KEY (id);
ALTER TABLE public.custom_list_items ADD CONSTRAINT custom_list_items_pkey PRIMARY KEY (list_id, media_id);
ALTER TABLE public.custom_lists ADD CONSTRAINT custom_lists_pkey PRIMARY KEY (id);
ALTER TABLE public.episodes_progress ADD CONSTRAINT episodes_progress_comment_check CHECK (((comment IS NULL) OR (char_length(comment) <= 4000)));
ALTER TABLE public.episodes_progress ADD CONSTRAINT episodes_progress_watched_at_precision_check CHECK ((watched_at_precision = ANY (ARRAY['date'::text, 'datetime'::text])));
ALTER TABLE public.episodes_progress ADD CONSTRAINT episodes_progress_pkey PRIMARY KEY (id);
ALTER TABLE public.episodes_progress ADD CONSTRAINT episodes_progress_user_media_season_episode_key UNIQUE (user_id, media_id, season_number, episode_number);
ALTER TABLE public.follows ADD CONSTRAINT follows_check CHECK ((follower_id <> following_id));
ALTER TABLE public.follows ADD CONSTRAINT follows_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text])));
ALTER TABLE public.follows ADD CONSTRAINT follows_pkey PRIMARY KEY (follower_id, following_id);
ALTER TABLE public.friendships ADD CONSTRAINT friendships_check CHECK ((requester_id <> addressee_id));
ALTER TABLE public.friendships ADD CONSTRAINT friendships_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text])));
ALTER TABLE public.friendships ADD CONSTRAINT friendships_pkey PRIMARY KEY (requester_id, addressee_id);
ALTER TABLE public.library_items ADD CONSTRAINT library_items_completed_seasons_check CHECK ((completed_seasons >= 0));
ALTER TABLE public.library_items ADD CONSTRAINT library_items_current_season_check CHECK (((current_season IS NULL) OR (current_season >= 1)));
ALTER TABLE public.library_items ADD CONSTRAINT library_items_personal_rating_check CHECK (((personal_rating >= (0)::numeric) AND (personal_rating <= (10)::numeric)));
ALTER TABLE public.library_items ADD CONSTRAINT library_items_status_check CHECK ((status = ANY (ARRAY['want'::text, 'watching'::text, 'watched'::text, 'paused'::text, 'dropped'::text, 'rewatching'::text, 'rewatched'::text])));
ALTER TABLE public.library_items ADD CONSTRAINT library_items_stopped_season_check CHECK (((stopped_season IS NULL) OR (stopped_season >= 1)));
ALTER TABLE public.library_items ADD CONSTRAINT library_items_watched_at_precision_check CHECK ((watched_at_precision = ANY (ARRAY['date'::text, 'datetime'::text])));
ALTER TABLE public.library_items ADD CONSTRAINT library_items_pkey PRIMARY KEY (id);
ALTER TABLE public.library_tags ADD CONSTRAINT library_tags_pkey PRIMARY KEY (library_item_id, tag_id);
ALTER TABLE public.list_items ADD CONSTRAINT list_items_pkey PRIMARY KEY (id);
ALTER TABLE public.list_items ADD CONSTRAINT list_items_list_id_movie_id_user_id_key UNIQUE (list_id, movie_id, user_id);
ALTER TABLE public.lists ADD CONSTRAINT lists_pkey PRIMARY KEY (id);
ALTER TABLE public.media ADD CONSTRAINT media_media_type_check CHECK (((media_type IS NULL) OR (media_type = ANY (ARRAY['movie'::text, 'tv'::text]))));
ALTER TABLE public.media ADD CONSTRAINT media_pkey PRIMARY KEY (id);
ALTER TABLE public.media ADD CONSTRAINT media_tmdb_id_media_type_key UNIQUE (tmdb_id, media_type);
ALTER TABLE public.movie_tags ADD CONSTRAINT movie_tags_pkey PRIMARY KEY (id);
ALTER TABLE public.movie_tags ADD CONSTRAINT movie_tags_movie_id_tag_id_user_id_key UNIQUE (movie_id, tag_id, user_id);
ALTER TABLE public.notification_preferences ADD CONSTRAINT notification_preferences_pkey PRIMARY KEY (user_id);
ALTER TABLE public.notifications ADD CONSTRAINT notifications_release_precision_check CHECK ((release_precision = ANY (ARRAY['date'::text, 'datetime'::text])));
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK ((type = ANY (ARRAY['new_season'::text, 'new_episode'::text])));
ALTER TABLE public.notifications ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);
ALTER TABLE public.notifications ADD CONSTRAINT notifications_user_id_event_key_key UNIQUE (user_id, event_key);
ALTER TABLE public.people ADD CONSTRAINT people_pkey PRIMARY KEY (id);
ALTER TABLE public.people_media ADD CONSTRAINT people_media_pkey PRIMARY KEY (person_id, media_id, role);
ALTER TABLE public.personal_tags ADD CONSTRAINT personal_tags_pkey PRIMARY KEY (id);
ALTER TABLE public.personal_tags ADD CONSTRAINT personal_tags_user_id_name_key UNIQUE (user_id, name);
ALTER TABLE public.profile_favorites ADD CONSTRAINT profile_favorites_media_type_check CHECK ((media_type = ANY (ARRAY['movie'::text, 'tv'::text])));
ALTER TABLE public.profile_favorites ADD CONSTRAINT profile_favorites_position_check CHECK ((("position" >= 1) AND ("position" <= 5)));
ALTER TABLE public.profile_favorites ADD CONSTRAINT profile_favorites_pkey PRIMARY KEY (user_id, media_type, "position");
ALTER TABLE public.profile_favorites ADD CONSTRAINT profile_favorites_user_id_media_id_key UNIQUE (user_id, media_id);
ALTER TABLE public.profiles ADD CONSTRAINT profiles_activity_visibility_check CHECK ((activity_visibility = ANY (ARRAY['profile'::text, 'followers'::text, 'private'::text])));
ALTER TABLE public.profiles ADD CONSTRAINT profiles_diary_visibility_check CHECK ((diary_visibility = ANY (ARRAY['profile'::text, 'followers'::text, 'private'::text])));
ALTER TABLE public.profiles ADD CONSTRAINT profiles_follow_policy_check CHECK ((follow_policy = ANY (ARRAY['profile'::text, 'approval'::text, 'nobody'::text])));
ALTER TABLE public.profiles ADD CONSTRAINT profiles_followers_visibility_check CHECK ((followers_visibility = ANY (ARRAY['profile'::text, 'followers'::text, 'private'::text])));
ALTER TABLE public.profiles ADD CONSTRAINT profiles_following_visibility_check CHECK ((following_visibility = ANY (ARRAY['profile'::text, 'followers'::text, 'private'::text])));
ALTER TABLE public.profiles ADD CONSTRAINT profiles_likes_visibility_check CHECK ((likes_visibility = ANY (ARRAY['profile'::text, 'followers'::text, 'private'::text])));
ALTER TABLE public.profiles ADD CONSTRAINT profiles_lists_visibility_check CHECK ((lists_visibility = ANY (ARRAY['profile'::text, 'followers'::text, 'private'::text])));
ALTER TABLE public.profiles ADD CONSTRAINT profiles_visibility_check CHECK ((visibility = ANY (ARRAY['public'::text, 'private'::text])));
ALTER TABLE public.profiles ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);
ALTER TABLE public.rating_categories ADD CONSTRAINT rating_categories_pkey PRIMARY KEY (id);
ALTER TABLE public.rating_categories ADD CONSTRAINT rating_categories_user_id_name_key UNIQUE (user_id, name);
ALTER TABLE public.review_categories ADD CONSTRAINT review_categories_pkey PRIMARY KEY (id);
ALTER TABLE public.review_scores ADD CONSTRAINT review_scores_pkey PRIMARY KEY (id);
ALTER TABLE public.review_scores ADD CONSTRAINT review_scores_library_item_id_category_id_key UNIQUE (library_item_id, category_id);
ALTER TABLE public.search_character_media ADD CONSTRAINT search_character_media_pkey PRIMARY KEY (character_id, media_type, tmdb_id, person_id);
ALTER TABLE public.search_characters ADD CONSTRAINT search_characters_pkey PRIMARY KEY (id);
ALTER TABLE public.search_characters ADD CONSTRAINT search_characters_normalized_name_key UNIQUE (normalized_name);
ALTER TABLE public.search_indexed_media ADD CONSTRAINT search_indexed_media_pkey PRIMARY KEY (media_type, tmdb_id);
ALTER TABLE public.search_media ADD CONSTRAINT search_media_media_type_check CHECK ((media_type = ANY (ARRAY['movie'::text, 'tv'::text])));
ALTER TABLE public.search_media ADD CONSTRAINT search_media_pkey PRIMARY KEY (media_type, tmdb_id);
ALTER TABLE public.search_people ADD CONSTRAINT search_people_pkey PRIMARY KEY (person_id);
ALTER TABLE public.search_people_media ADD CONSTRAINT search_people_media_pkey PRIMARY KEY (person_id, media_type, tmdb_id, role);
ALTER TABLE public.tags ADD CONSTRAINT tags_pkey PRIMARY KEY (id);
ALTER TABLE public.tmdb_cache ADD CONSTRAINT tmdb_cache_pkey PRIMARY KEY (cache_key);
ALTER TABLE public.user_events ADD CONSTRAINT user_events_exposure_required CHECK (((kind = 'library_added'::text) OR (exposure_id IS NOT NULL) OR (event_key ~~ 'legacy:%'::text)));
ALTER TABLE public.user_events ADD CONSTRAINT user_events_kind_check CHECK ((kind = ANY (ARRAY['rec_shown'::text, 'rec_opened'::text, 'rec_dismissed'::text, 'library_added'::text])));
ALTER TABLE public.user_events ADD CONSTRAINT user_events_media_type_check CHECK ((media_type = ANY (ARRAY['movie'::text, 'tv'::text])));
ALTER TABLE public.user_events ADD CONSTRAINT user_events_source_check CHECK ((source = ANY (ARRAY['pick'::text, 'smart_queue'::text, 'assistant'::text, 'for_you'::text, 'home'::text, 'discover'::text, 'search'::text, 'title'::text, 'collection'::text, 'person'::text, 'lists'::text, 'profile'::text, 'library'::text, 'calendar'::text, 'other'::text])));
ALTER TABLE public.user_events ADD CONSTRAINT user_events_tmdb_id_positive CHECK ((tmdb_id > 0));
ALTER TABLE public.user_events ADD CONSTRAINT user_events_pkey PRIMARY KEY (id);
ALTER TABLE public.user_hidden_titles ADD CONSTRAINT user_hidden_titles_media_type_check CHECK ((media_type = ANY (ARRAY['movie'::text, 'tv'::text])));
ALTER TABLE public.user_hidden_titles ADD CONSTRAINT user_hidden_titles_pkey PRIMARY KEY (id);
ALTER TABLE public.user_hidden_titles ADD CONSTRAINT user_hidden_titles_user_id_tmdb_id_media_type_key UNIQUE (user_id, tmdb_id, media_type);
ALTER TABLE public.user_preferences ADD CONSTRAINT user_preferences_pkey PRIMARY KEY (user_id);
ALTER TABLE public.user_streaming_services ADD CONSTRAINT user_streaming_services_provider_id_check CHECK ((provider_id > 0));
ALTER TABLE public.user_streaming_services ADD CONSTRAINT user_streaming_services_provider_name_check CHECK (((char_length(provider_name) >= 1) AND (char_length(provider_name) <= 80)));
ALTER TABLE public.user_streaming_services ADD CONSTRAINT user_streaming_services_pkey PRIMARY KEY (user_id, provider_id);
ALTER TABLE public.username_changes ADD CONSTRAINT username_changes_pkey PRIMARY KEY (id);
ALTER TABLE public.watch_entries ADD CONSTRAINT watch_entries_comment_length_check CHECK (((comment IS NULL) OR (char_length(comment) <= 4000)));
ALTER TABLE public.watch_entries ADD CONSTRAINT watch_entries_rating_check CHECK (((rating IS NULL) OR ((rating >= (0)::numeric) AND (rating <= (10)::numeric))));
ALTER TABLE public.watch_entries ADD CONSTRAINT watch_entries_watched_at_precision_check CHECK ((watched_at_precision = ANY (ARRAY['date'::text, 'datetime'::text])));
ALTER TABLE public.watch_entries ADD CONSTRAINT watch_entries_pkey PRIMARY KEY (id);

-- Índices (os de PK/UNIQUE já vêm com a constraint).
CREATE INDEX activity_events_library_item_id_idx ON public.activity_events USING btree (library_item_id);
CREATE INDEX activity_events_media_idx ON public.activity_events USING btree (media_id);
CREATE INDEX activity_events_user_occurred_idx ON public.activity_events USING btree (user_id, occurred_at DESC);
CREATE INDEX ai_recommendation_cache_expires_idx ON public.ai_recommendation_cache USING btree (expires_at);
CREATE UNIQUE INDEX ai_recommendation_cache_global_unique ON public.ai_recommendation_cache USING btree (query_key) WHERE (scope = 'global'::text);
CREATE INDEX ai_recommendation_cache_hits_idx ON public.ai_recommendation_cache USING btree (hit_count DESC);
CREATE UNIQUE INDEX ai_recommendation_cache_personal_unique ON public.ai_recommendation_cache USING btree (user_id, query_key, profile_key) WHERE (scope = 'personalized'::text);
CREATE INDEX category_ratings_category_id_idx ON public.category_ratings USING btree (category_id);
CREATE INDEX category_ratings_library_item_idx ON public.category_ratings USING btree (library_item_id);
CREATE INDEX character_media_media_id_idx ON public.character_media USING btree (media_id);
CREATE INDEX character_media_person_id_idx ON public.character_media USING btree (person_id);
CREATE INDEX idx_characters_normalized ON public.characters USING btree (normalized_name);
CREATE INDEX custom_list_items_library_item_id_idx ON public.custom_list_items USING btree (library_item_id);
CREATE INDEX custom_list_items_list_idx ON public.custom_list_items USING btree (list_id);
CREATE UNIQUE INDEX custom_list_items_list_library_key ON public.custom_list_items USING btree (list_id, library_item_id);
CREATE INDEX custom_list_items_media_idx ON public.custom_list_items USING btree (media_id);
CREATE INDEX custom_list_items_order_idx ON public.custom_list_items USING btree (list_id, "position", added_at, media_id);
CREATE INDEX custom_lists_user_idx ON public.custom_lists USING btree (user_id);
CREATE INDEX episodes_progress_media_idx ON public.episodes_progress USING btree (media_id);
CREATE INDEX episodes_progress_user_idx ON public.episodes_progress USING btree (user_id);
CREATE INDEX follows_following_id_idx ON public.follows USING btree (following_id);
CREATE INDEX friendships_addressee_id_idx ON public.friendships USING btree (addressee_id);
CREATE INDEX library_items_media_id_idx ON public.library_items USING btree (media_id);
CREATE INDEX library_items_user_added_idx ON public.library_items USING btree (user_id, added_at DESC);
CREATE INDEX library_items_user_favorite_idx ON public.library_items USING btree (user_id, favorite) WHERE (favorite = true);
CREATE UNIQUE INDEX library_items_user_media_unique ON public.library_items USING btree (user_id, media_id);
CREATE INDEX library_items_user_rating_idx ON public.library_items USING btree (user_id, personal_rating DESC) WHERE (personal_rating IS NOT NULL);
CREATE INDEX library_items_user_status_added_idx ON public.library_items USING btree (user_id, status, added_at DESC);
CREATE INDEX library_items_user_updated_idx ON public.library_items USING btree (user_id, updated_at DESC);
CREATE INDEX library_tags_library_item_idx ON public.library_tags USING btree (library_item_id);
CREATE INDEX library_tags_tag_id_idx ON public.library_tags USING btree (tag_id);
CREATE INDEX list_items_user_id_idx ON public.list_items USING btree (user_id);
CREATE INDEX lists_user_id_idx ON public.lists USING btree (user_id);
CREATE INDEX idx_media_title ON public.media USING btree (title);
CREATE INDEX movie_tags_tag_id_idx ON public.movie_tags USING btree (tag_id);
CREATE INDEX movie_tags_user_id_idx ON public.movie_tags USING btree (user_id);
CREATE INDEX notifications_user_unread_idx ON public.notifications USING btree (user_id, created_at DESC) WHERE (read_at IS NULL);
CREATE INDEX idx_people_normalized ON public.people USING btree (normalized_name);
CREATE INDEX people_media_media_id_idx ON public.people_media USING btree (media_id);
CREATE INDEX personal_tags_user_idx ON public.personal_tags USING btree (user_id);
CREATE INDEX profile_favorites_media_id_idx ON public.profile_favorites USING btree (media_id);
CREATE UNIQUE INDEX profiles_username_unique ON public.profiles USING btree (lower(username)) WHERE (username IS NOT NULL);
CREATE INDEX rating_categories_user_position_idx ON public.rating_categories USING btree (user_id, "position");
CREATE INDEX review_categories_user_id_idx ON public.review_categories USING btree (user_id);
CREATE INDEX review_scores_category_id_idx ON public.review_scores USING btree (category_id);
CREATE INDEX search_character_media_media_type_tmdb_id_idx ON public.search_character_media USING btree (media_type, tmdb_id);
CREATE INDEX search_character_media_person_id_idx ON public.search_character_media USING btree (person_id);
CREATE INDEX search_characters_normalized_prefix3_idx ON public.search_characters USING btree ("left"(normalized_name, 3));
CREATE INDEX search_characters_normalized_trgm_idx ON public.search_characters USING gin (normalized_name extensions.gin_trgm_ops);
CREATE INDEX search_people_normalized_idx ON public.search_people USING btree (normalized_name);
CREATE INDEX search_people_normalized_prefix3_idx ON public.search_people USING btree ("left"(normalized_name, 3));
CREATE INDEX search_people_normalized_trgm_idx ON public.search_people USING gin (normalized_name extensions.gin_trgm_ops);
CREATE INDEX search_people_media_media_type_tmdb_id_idx ON public.search_people_media USING btree (media_type, tmdb_id);
CREATE INDEX tags_user_id_idx ON public.tags USING btree (user_id);
CREATE INDEX tmdb_cache_expires_idx ON public.tmdb_cache USING btree (expires_at);
CREATE UNIQUE INDEX user_events_event_key ON public.user_events USING btree (user_id, event_key);
CREATE INDEX user_events_user_created_idx ON public.user_events USING btree (user_id, created_at);
CREATE INDEX user_hidden_titles_user_created_idx ON public.user_hidden_titles USING btree (user_id, created_at DESC);
CREATE INDEX username_changes_user_date_idx ON public.username_changes USING btree (user_id, changed_at DESC);
CREATE INDEX watch_entries_library_item_idx ON public.watch_entries USING btree (library_item_id, watched_at DESC);
CREATE INDEX watch_entries_media_idx ON public.watch_entries USING btree (media_id, watched_at DESC);
CREATE UNIQUE INDEX watch_entries_user_dedup_idx ON public.watch_entries USING btree (user_id, library_item_id, watched_at, is_rewatch);
CREATE INDEX watch_entries_user_watched_at_idx ON public.watch_entries USING btree (user_id, watched_at DESC);

-- Chaves estrangeiras (depois de todas as tabelas).
ALTER TABLE public.activity_events ADD CONSTRAINT activity_events_library_item_id_fkey FOREIGN KEY (library_item_id) REFERENCES library_items(id) ON DELETE SET NULL;
ALTER TABLE public.activity_events ADD CONSTRAINT activity_events_media_id_fkey FOREIGN KEY (media_id) REFERENCES media(id);
ALTER TABLE public.activity_events ADD CONSTRAINT activity_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES neon_auth."user"(id) ON DELETE CASCADE;
ALTER TABLE public.ai_recommendation_cache ADD CONSTRAINT ai_recommendation_cache_user_id_fkey FOREIGN KEY (user_id) REFERENCES neon_auth."user"(id) ON DELETE CASCADE;
ALTER TABLE public.api_rate_limits ADD CONSTRAINT api_rate_limits_user_id_fkey FOREIGN KEY (user_id) REFERENCES neon_auth."user"(id) ON DELETE CASCADE;
ALTER TABLE public.category_ratings ADD CONSTRAINT category_ratings_category_id_fkey FOREIGN KEY (category_id) REFERENCES rating_categories(id) ON DELETE CASCADE;
ALTER TABLE public.category_ratings ADD CONSTRAINT category_ratings_library_item_id_fkey FOREIGN KEY (library_item_id) REFERENCES library_items(id) ON DELETE CASCADE;
ALTER TABLE public.character_media ADD CONSTRAINT character_media_character_id_fkey FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE;
ALTER TABLE public.character_media ADD CONSTRAINT character_media_media_id_fkey FOREIGN KEY (media_id) REFERENCES media(id) ON DELETE CASCADE;
ALTER TABLE public.character_media ADD CONSTRAINT character_media_person_id_fkey FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE CASCADE;
ALTER TABLE public.custom_list_items ADD CONSTRAINT custom_list_items_library_item_id_fkey FOREIGN KEY (library_item_id) REFERENCES library_items(id) ON DELETE SET NULL;
ALTER TABLE public.custom_list_items ADD CONSTRAINT custom_list_items_list_id_fkey FOREIGN KEY (list_id) REFERENCES custom_lists(id) ON DELETE CASCADE;
ALTER TABLE public.custom_list_items ADD CONSTRAINT custom_list_items_media_id_fkey FOREIGN KEY (media_id) REFERENCES media(id);
ALTER TABLE public.custom_lists ADD CONSTRAINT custom_lists_user_id_fkey FOREIGN KEY (user_id) REFERENCES neon_auth."user"(id) ON DELETE CASCADE;
ALTER TABLE public.episodes_progress ADD CONSTRAINT episodes_progress_media_id_fkey FOREIGN KEY (media_id) REFERENCES media(id);
ALTER TABLE public.episodes_progress ADD CONSTRAINT episodes_progress_user_id_fkey FOREIGN KEY (user_id) REFERENCES neon_auth."user"(id) ON DELETE CASCADE;
ALTER TABLE public.follows ADD CONSTRAINT follows_follower_id_fkey FOREIGN KEY (follower_id) REFERENCES neon_auth."user"(id) ON DELETE CASCADE;
ALTER TABLE public.follows ADD CONSTRAINT follows_following_id_fkey FOREIGN KEY (following_id) REFERENCES neon_auth."user"(id) ON DELETE CASCADE;
ALTER TABLE public.friendships ADD CONSTRAINT friendships_addressee_id_fkey FOREIGN KEY (addressee_id) REFERENCES neon_auth."user"(id) ON DELETE CASCADE;
ALTER TABLE public.friendships ADD CONSTRAINT friendships_requester_id_fkey FOREIGN KEY (requester_id) REFERENCES neon_auth."user"(id) ON DELETE CASCADE;
ALTER TABLE public.library_items ADD CONSTRAINT library_items_media_id_fkey FOREIGN KEY (media_id) REFERENCES media(id) ON DELETE CASCADE;
ALTER TABLE public.library_items ADD CONSTRAINT library_items_user_id_fkey FOREIGN KEY (user_id) REFERENCES neon_auth."user"(id) ON DELETE CASCADE;
ALTER TABLE public.library_tags ADD CONSTRAINT library_tags_library_item_id_fkey FOREIGN KEY (library_item_id) REFERENCES library_items(id) ON DELETE CASCADE;
ALTER TABLE public.library_tags ADD CONSTRAINT library_tags_tag_id_fkey FOREIGN KEY (tag_id) REFERENCES personal_tags(id) ON DELETE CASCADE;
ALTER TABLE public.list_items ADD CONSTRAINT list_items_list_id_fkey FOREIGN KEY (list_id) REFERENCES lists(id) ON DELETE CASCADE;
ALTER TABLE public.list_items ADD CONSTRAINT list_items_user_id_fkey FOREIGN KEY (user_id) REFERENCES neon_auth."user"(id) ON DELETE CASCADE;
ALTER TABLE public.lists ADD CONSTRAINT lists_user_id_fkey FOREIGN KEY (user_id) REFERENCES neon_auth."user"(id) ON DELETE CASCADE;
ALTER TABLE public.movie_tags ADD CONSTRAINT movie_tags_tag_id_fkey FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE;
ALTER TABLE public.movie_tags ADD CONSTRAINT movie_tags_user_id_fkey FOREIGN KEY (user_id) REFERENCES neon_auth."user"(id) ON DELETE CASCADE;
ALTER TABLE public.notification_preferences ADD CONSTRAINT notification_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES neon_auth."user"(id) ON DELETE CASCADE;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES neon_auth."user"(id) ON DELETE CASCADE;
ALTER TABLE public.people_media ADD CONSTRAINT people_media_media_id_fkey FOREIGN KEY (media_id) REFERENCES media(id) ON DELETE CASCADE;
ALTER TABLE public.people_media ADD CONSTRAINT people_media_person_id_fkey FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE CASCADE;
ALTER TABLE public.personal_tags ADD CONSTRAINT personal_tags_user_id_fkey FOREIGN KEY (user_id) REFERENCES neon_auth."user"(id) ON DELETE CASCADE;
ALTER TABLE public.profile_favorites ADD CONSTRAINT profile_favorites_media_id_fkey FOREIGN KEY (media_id) REFERENCES media(id) ON DELETE CASCADE;
ALTER TABLE public.profile_favorites ADD CONSTRAINT profile_favorites_user_id_fkey FOREIGN KEY (user_id) REFERENCES neon_auth."user"(id) ON DELETE CASCADE;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES neon_auth."user"(id) ON DELETE CASCADE;
ALTER TABLE public.rating_categories ADD CONSTRAINT rating_categories_user_id_fkey FOREIGN KEY (user_id) REFERENCES neon_auth."user"(id) ON DELETE CASCADE;
ALTER TABLE public.review_categories ADD CONSTRAINT review_categories_user_id_fkey FOREIGN KEY (user_id) REFERENCES neon_auth."user"(id) ON DELETE CASCADE;
ALTER TABLE public.review_scores ADD CONSTRAINT review_scores_category_id_fkey FOREIGN KEY (category_id) REFERENCES review_categories(id) ON DELETE CASCADE;
ALTER TABLE public.review_scores ADD CONSTRAINT review_scores_library_item_id_fkey FOREIGN KEY (library_item_id) REFERENCES library_items(id) ON DELETE CASCADE;
ALTER TABLE public.search_character_media ADD CONSTRAINT search_character_media_character_id_fkey FOREIGN KEY (character_id) REFERENCES search_characters(id) ON DELETE CASCADE;
ALTER TABLE public.search_character_media ADD CONSTRAINT search_character_media_media_type_tmdb_id_fkey FOREIGN KEY (media_type, tmdb_id) REFERENCES search_media(media_type, tmdb_id) ON DELETE CASCADE;
ALTER TABLE public.search_character_media ADD CONSTRAINT search_character_media_person_id_fkey FOREIGN KEY (person_id) REFERENCES search_people(person_id) ON DELETE CASCADE;
ALTER TABLE public.search_indexed_media ADD CONSTRAINT search_indexed_media_media_type_tmdb_id_fkey FOREIGN KEY (media_type, tmdb_id) REFERENCES search_media(media_type, tmdb_id) ON DELETE CASCADE;
ALTER TABLE public.search_people_media ADD CONSTRAINT search_people_media_media_type_tmdb_id_fkey FOREIGN KEY (media_type, tmdb_id) REFERENCES search_media(media_type, tmdb_id) ON DELETE CASCADE;
ALTER TABLE public.search_people_media ADD CONSTRAINT search_people_media_person_id_fkey FOREIGN KEY (person_id) REFERENCES search_people(person_id) ON DELETE CASCADE;
ALTER TABLE public.tags ADD CONSTRAINT tags_user_id_fkey FOREIGN KEY (user_id) REFERENCES neon_auth."user"(id) ON DELETE CASCADE;
ALTER TABLE public.user_events ADD CONSTRAINT user_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES neon_auth."user"(id) ON DELETE CASCADE;
ALTER TABLE public.user_hidden_titles ADD CONSTRAINT user_hidden_titles_user_id_fkey FOREIGN KEY (user_id) REFERENCES neon_auth."user"(id) ON DELETE CASCADE;
ALTER TABLE public.user_preferences ADD CONSTRAINT user_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES neon_auth."user"(id) ON DELETE CASCADE;
ALTER TABLE public.user_streaming_services ADD CONSTRAINT user_streaming_services_user_id_fkey FOREIGN KEY (user_id) REFERENCES neon_auth."user"(id) ON DELETE CASCADE;
ALTER TABLE public.username_changes ADD CONSTRAINT username_changes_user_id_fkey FOREIGN KEY (user_id) REFERENCES neon_auth."user"(id) ON DELETE CASCADE;
ALTER TABLE public.watch_entries ADD CONSTRAINT watch_entries_library_item_id_fkey FOREIGN KEY (library_item_id) REFERENCES library_items(id) ON DELETE SET NULL;
ALTER TABLE public.watch_entries ADD CONSTRAINT watch_entries_media_id_fkey FOREIGN KEY (media_id) REFERENCES media(id);
ALTER TABLE public.watch_entries ADD CONSTRAINT watch_entries_user_id_fkey FOREIGN KEY (user_id) REFERENCES neon_auth."user"(id) ON DELETE CASCADE;

-- Donos das sequências.
ALTER SEQUENCE public.characters_id_seq OWNED BY public.characters.id;
ALTER SEQUENCE public.media_id_seq OWNED BY public.media.id;

-- Triggers.
CREATE TRIGGER custom_list_items_fill_media BEFORE INSERT ON public.custom_list_items FOR EACH ROW EXECUTE FUNCTION custom_list_items_fill_media();
CREATE TRIGGER guard_profile_username_change BEFORE UPDATE OF username ON public.profiles FOR EACH ROW EXECUTE FUNCTION guard_profile_username_change();

-- RLS: ligado em todas as tabelas, SEM policies. O app conecta como dono (ignora RLS) e isola por
-- user_id da sessão no servidor; qualquer outro papel (ex.: Data API) fica sem acesso por padrão.
ALTER TABLE public.activity_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_recommendation_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.category_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.character_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.characters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_list_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.episodes_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.library_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.library_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.list_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movie_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.people ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.people_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.personal_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rating_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.search_character_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.search_characters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.search_indexed_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.search_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.search_people ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.search_people_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tmdb_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_hidden_titles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_streaming_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.username_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.watch_entries ENABLE ROW LEVEL SECURITY;

-- Comentários.
COMMENT ON TABLE public.user_events IS 'V2.3 Insights: exposições/aberturas/rejeições de recomendações (por exposure_id) e entradas na biblioteca (por library_item). Sem PII.';
COMMENT ON COLUMN public.library_items.favorite IS 'Compatibilidade: true significa que o usuário curtiu o título; não representa o Top 5 do perfil.';
