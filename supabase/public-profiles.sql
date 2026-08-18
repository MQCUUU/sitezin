-- Perfil público inicial: username, bio e 5 filmes + 5 séries.

-- Migração sem perda: library_items.favorite passa a representar "Curtido".
-- O Top 5 novo usa exclusivamente profile_favorites, portanto os curtidos antigos
-- permanecem intactos e não ocupam automaticamente posições da vitrine.
comment on column public.library_items.favorite is
  'Compatibilidade: true significa que o usuário curtiu o título; não representa o Top 5 do perfil.';

alter table public.profiles add column if not exists username text;
alter table public.profiles add column if not exists bio text;
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists is_public boolean not null default false;
alter table public.profiles add column if not exists visibility text not null default 'friends';
alter table public.profiles add column if not exists follow_policy text not null default 'profile';
alter table public.profiles add column if not exists followers_visibility text not null default 'profile';
alter table public.profiles add column if not exists following_visibility text not null default 'profile';
alter table public.profiles add column if not exists activity_visibility text not null default 'profile';
alter table public.profiles add column if not exists diary_visibility text not null default 'profile';
alter table public.profiles add column if not exists lists_visibility text not null default 'profile';
alter table public.profiles add column if not exists likes_visibility text not null default 'profile';

alter table public.profiles drop constraint if exists profiles_visibility_check;

update public.profiles set visibility = 'private' where visibility = 'friends';

alter table public.profiles add constraint profiles_visibility_check
  check (visibility in ('public', 'private'));

alter table public.profiles drop constraint if exists profiles_follow_policy_check;
alter table public.profiles add constraint profiles_follow_policy_check
  check (follow_policy in ('profile', 'approval', 'nobody'));
alter table public.profiles drop constraint if exists profiles_followers_visibility_check;
alter table public.profiles add constraint profiles_followers_visibility_check
  check (followers_visibility in ('profile', 'followers', 'private'));
alter table public.profiles drop constraint if exists profiles_following_visibility_check;
alter table public.profiles add constraint profiles_following_visibility_check
  check (following_visibility in ('profile', 'followers', 'private'));
alter table public.profiles drop constraint if exists profiles_activity_visibility_check;
alter table public.profiles add constraint profiles_activity_visibility_check check (activity_visibility in ('profile', 'followers', 'private'));
alter table public.profiles drop constraint if exists profiles_diary_visibility_check;
alter table public.profiles add constraint profiles_diary_visibility_check check (diary_visibility in ('profile', 'followers', 'private'));
alter table public.profiles drop constraint if exists profiles_lists_visibility_check;
alter table public.profiles add constraint profiles_lists_visibility_check check (lists_visibility in ('profile', 'followers', 'private'));
alter table public.profiles drop constraint if exists profiles_likes_visibility_check;
alter table public.profiles add constraint profiles_likes_visibility_check check (likes_visibility in ('profile', 'followers', 'private'));

create unique index if not exists profiles_username_unique
  on public.profiles (lower(username)) where username is not null;

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  requested_username text := lower(trim(new.raw_user_meta_data ->> 'username'));
begin
  if requested_username is null or requested_username !~ '^[a-z0-9_]{3,24}$' then
    raise exception 'username_invalid';
  end if;

  insert into public.profiles (
    id, display_name, username, avatar_url, visibility, is_public
  ) values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', requested_username),
    requested_username,
    new.raw_user_meta_data ->> 'avatar_url',
    'private',
    false
  )
  on conflict (id) do update set
    display_name = excluded.display_name,
    username = excluded.username;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row execute function public.handle_new_user_profile();

create table if not exists public.profile_favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  media_id integer not null references public.media(id) on delete cascade,
  media_type text not null check (media_type in ('movie', 'tv')),
  position smallint not null check (position between 1 and 5),
  primary key (user_id, media_type, position),
  unique (user_id, media_id)
);

create table if not exists public.friendships (
  requester_id uuid not null references auth.users(id) on delete cascade,
  addressee_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (requester_id, addressee_id),
  check (requester_id <> addressee_id)
);

create table if not exists public.follows (
  follower_id uuid not null references auth.users(id) on delete cascade,
  following_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);

-- Preserva conexões criadas pela versão antiga do sistema de amigos.
insert into public.follows (follower_id, following_id, status, created_at, updated_at)
select requester_id, addressee_id, status, created_at, updated_at from public.friendships
on conflict (follower_id, following_id) do nothing;
insert into public.follows (follower_id, following_id, status, created_at, updated_at)
select addressee_id, requester_id, 'accepted', created_at, updated_at
from public.friendships where status = 'accepted'
on conflict (follower_id, following_id) do nothing;

create table if not exists public.username_changes (
  id bigint generated by default as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  old_username text not null,
  new_username text not null,
  changed_at timestamptz not null default now()
);

alter table public.follows replica identity full;
do $$ begin
  alter publication supabase_realtime add table public.follows;
exception when duplicate_object then null;
end $$;

create table if not exists public.notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  new_follower_site boolean not null default true,
  new_follower_email boolean not null default false,
  follow_request_site boolean not null default true,
  follow_request_email boolean not null default false,
  review_like_site boolean not null default true,
  review_like_email boolean not null default false,
  product_updates_email boolean not null default false,
  new_season_site boolean not null default true,
  new_episode_site boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_key text not null,
  type text not null check (type in ('new_season', 'new_episode')),
  title text not null,
  message text not null,
  href text,
  release_at timestamptz,
  release_precision text not null default 'date' check (release_precision in ('date', 'datetime')),
  metadata jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, event_key)
);
alter table public.notification_preferences add column if not exists new_season_site boolean not null default true;
alter table public.notification_preferences add column if not exists new_episode_site boolean not null default true;
create index if not exists notifications_user_unread_idx on public.notifications (user_id, created_at desc) where read_at is null;

create index if not exists username_changes_user_date_idx
  on public.username_changes (user_id, changed_at desc);

alter table public.profile_favorites enable row level security;
alter table public.friendships enable row level security;
alter table public.follows enable row level security;
alter table public.username_changes enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.notifications enable row level security;

drop policy if exists "own profile favorites" on public.profile_favorites;
create policy "own profile favorites" on public.profile_favorites
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "friendships participants" on public.friendships;
create policy "friendships participants" on public.friendships
  for select to authenticated
  using ((select auth.uid()) in (requester_id, addressee_id));

drop policy if exists "friendships request" on public.friendships;
create policy "friendships request" on public.friendships
  for insert to authenticated
  with check ((select auth.uid()) = requester_id and status = 'pending');

drop policy if exists "friendships respond" on public.friendships;
create policy "friendships respond" on public.friendships
  for update to authenticated
  using ((select auth.uid()) = addressee_id)
  with check ((select auth.uid()) = addressee_id);

drop policy if exists "follow participants read" on public.follows;
create policy "follow participants read" on public.follows
  for select to authenticated
  using ((select auth.uid()) in (follower_id, following_id));

drop policy if exists "follow own insert" on public.follows;
create policy "follow own insert" on public.follows
  for insert to authenticated
  with check ((select auth.uid()) = follower_id);

drop policy if exists "follow participants update" on public.follows;
create policy "follow participants update" on public.follows
  for update to authenticated
  using ((select auth.uid()) in (follower_id, following_id))
  with check ((select auth.uid()) in (follower_id, following_id));

drop policy if exists "follow participants delete" on public.follows;
create policy "follow participants delete" on public.follows
  for delete to authenticated
  using ((select auth.uid()) in (follower_id, following_id));

drop policy if exists "own username changes" on public.username_changes;
create policy "own username changes" on public.username_changes
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "own notification preferences" on public.notification_preferences;
create policy "own notification preferences" on public.notification_preferences
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
drop policy if exists "own notifications" on public.notifications;
create policy "own notifications" on public.notifications for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

alter table public.notifications replica identity full;
do $$ begin
  alter publication supabase_realtime add table public.notifications;
exception when duplicate_object then null;
end $$;

create or replace function public.change_my_username(requested_username text)
returns table (username text, changes_used bigint, changes_remaining bigint)
language plpgsql
security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  old_name text;
  clean_name text := lower(trim(requested_username));
  used bigint;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if clean_name !~ '^[a-z0-9_]{3,24}$' then raise exception 'username_invalid'; end if;

  select p.username into old_name from public.profiles p where p.id = uid for update;
  if old_name is null then raise exception 'username_missing'; end if;
  if old_name = clean_name then
    select count(*) into used from public.username_changes c where c.user_id = uid and c.changed_at >= now() - interval '30 days';
    return query select clean_name, used, greatest(0::bigint, 2 - used);
    return;
  end if;

  select count(*) into used from public.username_changes c where c.user_id = uid and c.changed_at >= now() - interval '30 days';
  if used >= 2 then raise exception 'username_change_limit'; end if;
  if exists (select 1 from public.profiles p where lower(p.username) = clean_name and p.id <> uid) then raise exception 'username_taken'; end if;

  update public.profiles set username = clean_name where id = uid;
  insert into public.username_changes (user_id, old_username, new_username) values (uid, old_name, clean_name);
  used := used + 1;
  return query select clean_name, used, greatest(0::bigint, 2 - used);
end;
$$;

revoke all on function public.change_my_username(text) from public;
grant execute on function public.change_my_username(text) to authenticated;

-- Avatares públicos; cada usuário só pode gravar dentro da própria pasta.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "public avatar read" on storage.objects;
create policy "public avatar read" on storage.objects for select to public using (bucket_id = 'avatars');
drop policy if exists "own avatar insert" on storage.objects;
create policy "own avatar insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "own avatar update" on storage.objects;
create policy "own avatar update" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "own avatar delete" on storage.objects;
create policy "own avatar delete" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
