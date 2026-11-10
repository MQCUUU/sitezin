-- 0007 — Sugestão de título mais tolerante (search_v4_title_suggest).
--
-- A 0005 só usava semelhança trigram com o título inteiro: letras trocadas
-- ("matirx") não achavam nada e "vingadors" virava a série "Vingadora". Agora:
--   - candidatos também por semelhança por palavra (<%) e por distância de
--     edição (1 letra até 5 digitadas, 2 a partir de 6);
--   - busca de uma palavra compara com cada palavra do título e sugere a
--     palavra ("vingadors" → "Vingadores", que traz todos os filmes);
--   - desempate pela popularidade.
-- A coluna `title` passa a ser o texto sugerido (título ou palavra); o formato
-- de saída é o mesmo, então a rota não muda. Só roda quando a busca volta vazia.
--
-- Carrega o módulo do pg_trgm na sessão (o SET pg_trgm.* exige, ver 0005).
SELECT extensions.similarity('a', 'a');

CREATE OR REPLACE FUNCTION public.search_v4_title_suggest(query_text text, result_limit integer DEFAULT 3)
 RETURNS TABLE(tmdb_id integer, media_type text, title text, similarity real, popularity real)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
 SET pg_trgm.similarity_threshold TO '0.399'
 SET pg_trgm.word_similarity_threshold TO '0.599'
AS $function$
  with input as (
    select trim(lower(coalesce(query_text, '')))::text as q
  ),
  -- Título inteiro: trigram (%), por palavra (<%) ou poucas letras de distância
  -- (1 até 5 letras digitadas, 2 a partir de 6 — "abcd" não vira título nenhum).
  cand as (
    select m.tmdb_id, m.media_type from public.search_media m, input i
      where lower(m.title) operator(extensions.%) i.q
    union
    select m.tmdb_id, m.media_type from public.search_media m, input i
      where i.q operator(extensions.<%) lower(m.title)
    union
    select m.tmdb_id, m.media_type from public.search_media m, input i
      where length(i.q) between 4 and 24
        and abs(length(m.title) - length(i.q)) <= 2
        and levenshtein(lower(m.title), i.q) <= case when length(i.q) <= 5 then 1 else 2 end
  ),
  by_title as (
    select m.tmdb_id, m.media_type, m.title as suggestion, m.popularity,
      greatest(
        extensions.similarity(lower(m.title), i.q),
        extensions.word_similarity(i.q, lower(m.title)),
        case when length(i.q) between 4 and 24 and abs(length(m.title) - length(i.q)) <= 2
          and levenshtein(lower(m.title), i.q) <= case when length(i.q) <= 5 then 1 else 2 end
          then 1 - levenshtein(lower(m.title), i.q)::real / greatest(length(i.q), 1)
          else 0 end
      )::real as score
    from public.search_media m join cand using (tmdb_id, media_type) cross join input i
    where length(i.q) >= 4
  ),
  -- Busca de uma palavra: compara com cada palavra do título e sugere a palavra
  -- ("vingadors" → "Vingadores", não o título inteiro de um dos filmes).
  by_word as (
    select m.tmdb_id, m.media_type, w.word as suggestion, m.popularity,
      (1 - levenshtein(lower(w.word), i.q)::real / greatest(length(i.q), 1))::real as score
    from public.search_media m
      cross join input i
      cross join lateral regexp_split_to_table(m.title, '[^[:alnum:]]+') as w(word)
    where position(' ' in i.q) = 0
      and length(i.q) between 4 and 24
      and abs(length(w.word) - length(i.q)) <= 2
      and lower(left(w.word, 1)) = left(i.q, 1)
      and levenshtein(lower(w.word), i.q) <= case when length(i.q) <= 5 then 1 else 2 end
  ),
  ranked as (
    select distinct on (lower(suggestion)) tmdb_id, media_type, suggestion, popularity, score
    from (select * from by_title union all select * from by_word) all_rows
    order by lower(suggestion), score desc, popularity desc
  )
  select r.tmdb_id, r.media_type, r.suggestion as title, r.score as similarity, r.popularity
  from ranked r
  order by r.score + ln(1 + greatest(r.popularity, 0)) * 0.02 desc, r.popularity desc
  limit greatest(1, least(coalesce(result_limit, 3), 10));
$function$;
