-- Correção isolada para "Database error saving new user".
-- Execute este arquivo inteiro no SQL Editor do Supabase de produção.

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row execute function public.handle_new_user_profile();

-- A funcao e chamada apenas pelo trigger, nunca como RPC publica.
revoke all on function public.handle_new_user_profile() from public, anon, authenticated, service_role;
