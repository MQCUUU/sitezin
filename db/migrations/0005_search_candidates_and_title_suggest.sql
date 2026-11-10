-- 0005 — Busca: candidatos por índice (pessoas e personagens) e sugestão de título.
--
-- 1. search_v4_people / search_v4_characters: o filtro de candidatos era um OR
--    com similarity() >= x e levenshtein() = 1 — nenhum usa índice, então cada
--    busca lia as tabelas inteiras (0,7–1,5 s no banco). Agora os candidatos
--    vêm de ramos indexáveis (LIKE '%q%' e % no trigram GIN; prefixo de 3
--    letras no btree) e o filtro/pontuação de antes é aplicado por cima, sem
--    mudar o resultado (40 buscas comparadas no TEST: 0 diferenças, ~6,5x mais
--    rápido). O limiar do % fica um milésimo abaixo do filtro original (o %
--    do pg_trgm é "maior que"; o filtro é "maior ou igual").
-- 2. search_v4_title_suggest: título mais parecido no índice local (trigram),
--    usado pela busca quando o TMDB não acha nada ("intrestellar" →
--    "Interestelar").
--
-- Carrega o módulo do pg_trgm na sessão: sem isso o SET pg_trgm.* das funções
-- é recusado na criação ("permission denied to set parameter").
SELECT extensions.similarity('a', 'a');

CREATE OR REPLACE FUNCTION public.search_v4_people(query_text text, result_limit integer DEFAULT 12)
 RETURNS TABLE(person_id integer, person_name text, normalized_name text, name_similarity real, match_kind text, media_count bigint, important_credit_count bigint, max_media_popularity real, avg_media_popularity real, sum_media_popularity real, entity_score double precision)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
 SET pg_trgm.similarity_threshold TO '0.719'
AS $function$
  with input as (
    select trim(lower(regexp_replace(
      coalesce(query_text, ''), '[^a-zA-Z0-9]+', ' ', 'g'
    )))::text as q
  ),
  cand as (
    select p.person_id from public.search_people p, input i
      where length(i.q) >= 3 and p.normalized_name like '%' || i.q || '%'
    union
    select p.person_id from public.search_people p, input i
      where length(i.q) >= 5 and p.normalized_name operator(extensions.%) i.q
    union
    select p.person_id from public.search_people p, input i
      where length(i.q) >= 5 and left(p.normalized_name, 3) = left(i.q, 3)
        and levenshtein(p.normalized_name, i.q) = 1
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
    from public.search_people p join cand using (person_id) cross join input i
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

CREATE OR REPLACE FUNCTION public.search_v4_characters(query_text text, result_limit integer DEFAULT 12)
 RETURNS TABLE(character_id bigint, character_name text, normalized_name text, name_similarity real, match_kind text, media_count bigint, max_media_popularity real, avg_media_popularity real, sum_media_popularity real, entity_score double precision)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
 SET pg_trgm.similarity_threshold TO '0.739'
AS $function$
  with input as (
    select trim(lower(regexp_replace(
      coalesce(query_text, ''), '[^a-zA-Z0-9]+', ' ', 'g'
    )))::text as q
  ),
  cand as (
    select c.id from public.search_characters c, input i
      where length(i.q) >= 3 and c.normalized_name like '%' || i.q || '%'
    union
    select c.id from public.search_characters c, input i
      where length(i.q) >= 5 and c.normalized_name operator(extensions.%) i.q
    union
    select c.id from public.search_characters c, input i
      where length(i.q) >= 5 and left(c.normalized_name, 3) = left(i.q, 3)
        and levenshtein(c.normalized_name, i.q) = 1
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
    from public.search_characters c join cand using (id) cross join input i
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

CREATE INDEX IF NOT EXISTS search_media_title_trgm_idx
  ON public.search_media USING gin (lower(title) extensions.gin_trgm_ops);

CREATE OR REPLACE FUNCTION public.search_v4_title_suggest(query_text text, result_limit integer DEFAULT 3)
 RETURNS TABLE(tmdb_id integer, media_type text, title text, similarity real, popularity real)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
 SET pg_trgm.similarity_threshold TO '0.399'
AS $function$
  with input as (
    select trim(lower(coalesce(query_text, '')))::text as q
  )
  select m.tmdb_id, m.media_type, m.title,
    extensions.similarity(lower(m.title), i.q)::real as similarity,
    m.popularity
  from public.search_media m cross join input i
  where length(i.q) >= 4
    and lower(m.title) operator(extensions.%) i.q
  order by similarity desc, m.popularity desc
  limit greatest(1, least(coalesce(result_limit, 3), 10));
$function$;
