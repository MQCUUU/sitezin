-- Resolvedor universal v4 em duas fases.
-- Não remove, não reindexa e não modifica nenhuma linha search_*.

create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists fuzzystrmatch with schema extensions;
set search_path = public, extensions;

create index if not exists search_people_normalized_trgm_idx
  on public.search_people using gin (normalized_name gin_trgm_ops);

create index if not exists search_characters_normalized_trgm_idx
  on public.search_characters using gin (normalized_name gin_trgm_ops);

create index if not exists search_people_normalized_prefix3_idx
  on public.search_people ((left(normalized_name, 3)));

create index if not exists search_characters_normalized_prefix3_idx
  on public.search_characters ((left(normalized_name, 3)));

drop function if exists public.search_v4_people(text, integer);

create function public.search_v4_people(
  query_text text,
  result_limit integer default 12
)
returns table (
  person_id integer, person_name text, normalized_name text,
  name_similarity real, match_kind text, media_count bigint,
  important_credit_count bigint, max_media_popularity real,
  avg_media_popularity real, sum_media_popularity real,
  entity_score double precision
)
language sql stable security definer
set search_path = public, extensions
as $$
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
$$;

drop function if exists public.search_v4_characters(text, integer);

create function public.search_v4_characters(
  query_text text,
  result_limit integer default 12
)
returns table (
  character_id bigint, character_name text, normalized_name text,
  name_similarity real, match_kind text, media_count bigint,
  max_media_popularity real, avg_media_popularity real,
  sum_media_popularity real, entity_score double precision
)
language sql stable security definer
set search_path = public, extensions
as $$
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
$$;

create or replace function public.search_v4_character_media(target_character_id bigint)
returns table (
  media_type text, tmdb_id integer, media_title text,
  character_name text, person_name text, popularity real
)
language sql stable security definer set search_path = public
as $$
  select distinct on (cm.media_type, cm.tmdb_id)
    cm.media_type, cm.tmdb_id, sm.title, c.name, p.name, sm.popularity
  from public.search_character_media cm
  join public.search_characters c on c.id = cm.character_id
  join public.search_media sm on sm.media_type = cm.media_type and sm.tmdb_id = cm.tmdb_id
  left join public.search_people p on p.person_id = cm.person_id
  where cm.character_id = target_character_id
  order by cm.media_type, cm.tmdb_id, sm.popularity desc;
$$;

create or replace function public.search_v4_person_media(target_person_id integer)
returns table (
  media_type text, tmdb_id integer, media_title text,
  role smallint, popularity real
)
language sql stable security definer set search_path = public
as $$
  select distinct on (pm.media_type, pm.tmdb_id)
    pm.media_type, pm.tmdb_id, sm.title, pm.role, sm.popularity
  from public.search_people_media pm
  join public.search_media sm on sm.media_type = pm.media_type and sm.tmdb_id = pm.tmdb_id
  where pm.person_id = target_person_id
  order by pm.media_type, pm.tmdb_id,
    case pm.role when 2 then 5 when 4 then 4 when 1 then 3 when 3 then 2 else 1 end desc,
    sm.popularity desc;
$$;

revoke all on function public.search_v4_people(text, integer) from public;
revoke all on function public.search_v4_characters(text, integer) from public;
revoke all on function public.search_v4_character_media(bigint) from public;
revoke all on function public.search_v4_person_media(integer) from public;
grant execute on function public.search_v4_people(text, integer) to service_role;
grant execute on function public.search_v4_characters(text, integer) to service_role;
grant execute on function public.search_v4_character_media(bigint) to service_role;
grant execute on function public.search_v4_person_media(integer) to service_role;
