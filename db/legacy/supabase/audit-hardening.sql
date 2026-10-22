-- Endurecimento incremental gerado pela auditoria de producao.
-- Nao remove tabelas, colunas, dados, funcoes de negocio ou indices existentes.

begin;

-- Extensoes fora do schema exposto pela Data API.
create schema if not exists extensions;
do $$
begin
  if exists (
    select 1 from pg_extension e
    join pg_namespace n on n.oid = e.extnamespace
    where e.extname = 'pg_trgm' and n.nspname <> 'extensions'
  ) then
    alter extension pg_trgm set schema extensions;
  end if;

  if exists (
    select 1 from pg_extension e
    join pg_namespace n on n.oid = e.extnamespace
    where e.extname = 'unaccent' and n.nspname <> 'extensions'
  ) then
    alter extension unaccent set schema extensions;
  end if;
end;
$$;

-- O default antigo ('friends') nao satisfazia o CHECK atual ('public'/'private').
alter table public.profiles alter column visibility set default 'private';

-- Impede que a troca de username, limitada pela RPC, seja burlada por UPDATE direto.
create or replace function public.guard_profile_username_change()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  if new.username is distinct from old.username
     and current_user not in ('postgres', 'service_role', 'supabase_admin') then
    raise exception 'use_change_my_username';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_profile_username_change() from public, anon, authenticated;

drop trigger if exists guard_profile_username_change on public.profiles;
create trigger guard_profile_username_change
  before update of username on public.profiles
  for each row execute function public.guard_profile_username_change();

-- Perfil pode ser lido, criado e atualizado pelo dono. Exclusao direta e bloqueada:
-- a remocao da conta deve continuar sendo feita pelo fluxo administrativo do Auth.
drop policy if exists "own profile" on public.profiles;
drop policy if exists "own profile select" on public.profiles;
drop policy if exists "own profile insert" on public.profiles;
drop policy if exists "own profile update" on public.profiles;

create policy "own profile select" on public.profiles
  for select to authenticated
  using ((select auth.uid()) = id);

create policy "own profile insert" on public.profiles
  for insert to authenticated
  with check ((select auth.uid()) = id);

create policy "own profile update" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- Funcoes SECURITY DEFINER: acesso minimo necessario.
revoke all on function public.change_my_username(text) from public, anon, authenticated;
grant execute on function public.change_my_username(text) to authenticated;

revoke all on function public.consume_assistant_rate_limit() from public, anon, authenticated;
grant execute on function public.consume_assistant_rate_limit() to authenticated;

revoke all on function public.handle_new_user() from public, anon, authenticated, service_role;
revoke all on function public.handle_new_user_profile() from public, anon, authenticated, service_role;
revoke all on function public.rls_auto_enable() from public, anon, authenticated, service_role;

revoke all on function public.search_v4_people(text, integer) from public, anon, authenticated;
revoke all on function public.search_v4_characters(text, integer) from public, anon, authenticated;
revoke all on function public.search_v4_character_media(bigint) from public, anon, authenticated;
revoke all on function public.search_v4_person_media(integer) from public, anon, authenticated;
grant execute on function public.search_v4_people(text, integer) to service_role;
grant execute on function public.search_v4_characters(text, integer) to service_role;
grant execute on function public.search_v4_character_media(bigint) to service_role;
grant execute on function public.search_v4_person_media(integer) to service_role;

-- Funcoes auxiliares sem search_path mutavel e sem exposicao desnecessaria.
alter function public.get_database_size_mb() set search_path = pg_catalog;
alter function public.search_normalize(text) set search_path = pg_catalog;
revoke all on function public.get_database_size_mb() from public, anon, authenticated;
grant execute on function public.get_database_size_mb() to service_role;

-- O app altera follows apenas em rotas de servidor autenticadas com service_role.
-- Clientes mantem somente SELECT para receber atualizacoes Realtime submetidas a RLS.
revoke insert, update, delete on table public.follows from anon, authenticated;
revoke insert, update, delete on table public.friendships from anon, authenticated;
grant select on table public.follows, public.friendships to authenticated;

-- Substitui policies legadas por equivalentes com papel explicito e auth.uid() em initplan.
drop policy if exists "Users can view own review categories" on public.review_categories;
drop policy if exists "Users can create own review categories" on public.review_categories;
drop policy if exists "Users can update own review categories" on public.review_categories;
drop policy if exists "Users can delete own review categories" on public.review_categories;
drop policy if exists "own review categories" on public.review_categories;
create policy "own review categories" on public.review_categories
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can view own review scores" on public.review_scores;
drop policy if exists "Users can create own review scores" on public.review_scores;
drop policy if exists "Users can update own review scores" on public.review_scores;
drop policy if exists "Users can delete own review scores" on public.review_scores;
drop policy if exists "own review scores" on public.review_scores;
create policy "own review scores" on public.review_scores
  for all to authenticated
  using (exists (
    select 1 from public.library_items li
    where li.id = library_item_id and li.user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.library_items li
    where li.id = library_item_id and li.user_id = (select auth.uid())
  ));

drop policy if exists "Users can view their own tags" on public.tags;
drop policy if exists "Users can insert their own tags" on public.tags;
drop policy if exists "Users can update their own tags" on public.tags;
drop policy if exists "Users can delete their own tags" on public.tags;
drop policy if exists "own tags v2" on public.tags;
create policy "own tags v2" on public.tags
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can view their own lists" on public.lists;
drop policy if exists "Users can insert their own lists" on public.lists;
drop policy if exists "Users can update their own lists" on public.lists;
drop policy if exists "Users can delete their own lists" on public.lists;
drop policy if exists "own lists v2" on public.lists;
create policy "own lists v2" on public.lists
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can view their own movie_tags" on public.movie_tags;
drop policy if exists "Users can insert their own movie_tags" on public.movie_tags;
drop policy if exists "Users can delete their own movie_tags" on public.movie_tags;
drop policy if exists "own movie tags" on public.movie_tags;
create policy "own movie tags" on public.movie_tags
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can view their own list_items" on public.list_items;
drop policy if exists "Users can insert their own list_items" on public.list_items;
drop policy if exists "Users can delete their own list_items" on public.list_items;
drop policy if exists "own list items v2" on public.list_items;
create policy "own list items v2" on public.list_items
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "own activity" on public.activity_events;
create policy "own activity" on public.activity_events
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "watch_entries_select_own" on public.watch_entries;
drop policy if exists "watch_entries_insert_own" on public.watch_entries;
drop policy if exists "watch_entries_update_own" on public.watch_entries;
drop policy if exists "watch_entries_delete_own" on public.watch_entries;
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

drop policy if exists "ai cache read global" on public.ai_recommendation_cache;
drop policy if exists "ai cache read own personalized" on public.ai_recommendation_cache;
drop policy if exists "ai cache read allowed" on public.ai_recommendation_cache;
create policy "ai cache read allowed" on public.ai_recommendation_cache
  for select to authenticated
  using (scope = 'global' or (scope = 'personalized' and user_id = (select auth.uid())));

drop policy if exists "ai cache insert own personalized" on public.ai_recommendation_cache;
create policy "ai cache insert own personalized" on public.ai_recommendation_cache
  for insert to authenticated
  with check (scope = 'personalized' and user_id = (select auth.uid()));

drop policy if exists "ai cache update own personalized" on public.ai_recommendation_cache;
create policy "ai cache update own personalized" on public.ai_recommendation_cache
  for update to authenticated
  using (scope = 'personalized' and user_id = (select auth.uid()))
  with check (scope = 'personalized' and user_id = (select auth.uid()));

drop policy if exists "ai cache delete expired" on public.ai_recommendation_cache;
create policy "ai cache delete expired" on public.ai_recommendation_cache
  for delete to authenticated
  using (expires_at < now() and (scope = 'global' or user_id = (select auth.uid())));

-- Indices de apoio para FKs, joins, cascatas e contagens sociais.
create index if not exists activity_events_library_item_id_idx on public.activity_events (library_item_id);
create index if not exists category_ratings_category_id_idx on public.category_ratings (category_id);
create index if not exists character_media_media_id_idx on public.character_media (media_id);
create index if not exists character_media_person_id_idx on public.character_media (person_id);
create index if not exists custom_list_items_library_item_id_idx on public.custom_list_items (library_item_id);
create index if not exists follows_following_id_idx on public.follows (following_id);
create index if not exists friendships_addressee_id_idx on public.friendships (addressee_id);
create index if not exists library_tags_tag_id_idx on public.library_tags (tag_id);
create index if not exists list_items_user_id_idx on public.list_items (user_id);
create index if not exists lists_user_id_idx on public.lists (user_id);
create index if not exists movie_tags_tag_id_idx on public.movie_tags (tag_id);
create index if not exists movie_tags_user_id_idx on public.movie_tags (user_id);
create index if not exists people_media_media_id_idx on public.people_media (media_id);
create index if not exists profile_favorites_media_id_idx on public.profile_favorites (media_id);
create index if not exists review_categories_user_id_idx on public.review_categories (user_id);
create index if not exists review_scores_category_id_idx on public.review_scores (category_id);
create index if not exists search_character_media_media_type_tmdb_id_idx on public.search_character_media (media_type, tmdb_id);
create index if not exists search_character_media_person_id_idx on public.search_character_media (person_id);
create index if not exists search_people_media_media_type_tmdb_id_idx on public.search_people_media (media_type, tmdb_id);
create index if not exists tags_user_id_idx on public.tags (user_id);

commit;
