create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.media (
  id uuid primary key default gen_random_uuid(),
  tmdb_id integer not null,
  media_type text not null check (media_type in ('movie','tv')),
  title text not null,
  original_title text,
  overview text,
  poster_path text,
  backdrop_path text,
  release_date date,
  first_air_date date,
  genres jsonb not null default '[]'::jsonb,
  tmdb_rating numeric(3,1),
  tmdb_vote_count integer,
  runtime integer,
  seasons_count integer,
  episodes_count integer,
  creator_names jsonb not null default '[]'::jsonb,
  cast_names jsonb not null default '[]'::jsonb,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tmdb_id, media_type)
);

create table if not exists public.library_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  media_id uuid not null references public.media(id) on delete cascade,
  status text not null default 'want' check(status in ('want','watching','watched','dropped','rewatching')),
  favorite boolean not null default false,
  personal_rating numeric(3,1) check(personal_rating between 0 and 10),
  review text,
  watched_at timestamptz,
  rewatch_count integer not null default 0,
  added_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, media_id)
);

create table if not exists public.rating_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  weight numeric(5,2) not null default 0,
  position integer not null default 0,
  active boolean not null default true,
  unique(user_id,name)
);

create table if not exists public.category_ratings (
  id uuid primary key default gen_random_uuid(),
  library_item_id uuid not null references public.library_items(id) on delete cascade,
  category_id uuid not null references public.rating_categories(id) on delete cascade,
  rating numeric(3,1) not null check(rating between 0 and 10),
  unique(library_item_id,category_id)
);

create table if not exists public.episodes_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  media_id uuid not null references public.media(id) on delete cascade,
  season_number integer not null,
  episode_number integer not null,
  watched boolean not null default false,
  watched_at timestamptz,
  unique(user_id,media_id,season_number,episode_number)
);

create table if not exists public.personal_tags (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  name text not null, unique(user_id,name)
);

create table if not exists public.library_tags (
  library_item_id uuid not null references public.library_items(id) on delete cascade,
  tag_id uuid not null references public.personal_tags(id) on delete cascade,
  primary key(library_item_id,tag_id)
);

create table if not exists public.custom_lists (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  name text not null, description text, created_at timestamptz not null default now()
);

create table if not exists public.custom_list_items (
  list_id uuid not null references public.custom_lists(id) on delete cascade,
  library_item_id uuid not null references public.library_items(id) on delete cascade,
  position integer not null default 0,
  primary key(list_id,library_item_id)
);

create table if not exists public.tmdb_cache (
  cache_key text primary key,
  payload jsonb not null,
  expires_at timestamptz not null
);

alter table public.profiles enable row level security;
alter table public.media enable row level security;
alter table public.library_items enable row level security;
alter table public.rating_categories enable row level security;
alter table public.category_ratings enable row level security;
alter table public.episodes_progress enable row level security;
alter table public.personal_tags enable row level security;
alter table public.library_tags enable row level security;
alter table public.custom_lists enable row level security;
alter table public.custom_list_items enable row level security;
alter table public.tmdb_cache enable row level security;

create policy "media readable" on public.media for select to authenticated using (true);
create policy "cache server only" on public.tmdb_cache for all to authenticated using (false) with check(false);

create policy "own profile" on public.profiles for all using(auth.uid()=id) with check(auth.uid()=id);
create policy "own library" on public.library_items for all using(auth.uid()=user_id) with check(auth.uid()=user_id);
create policy "own categories" on public.rating_categories for all using(auth.uid()=user_id) with check(auth.uid()=user_id);
create policy "own episodes" on public.episodes_progress for all using(auth.uid()=user_id) with check(auth.uid()=user_id);
create policy "own tags" on public.personal_tags for all using(auth.uid()=user_id) with check(auth.uid()=user_id);
create policy "own lists" on public.custom_lists for all using(auth.uid()=user_id) with check(auth.uid()=user_id);
create policy "own category ratings" on public.category_ratings for all using(exists(select 1 from public.library_items li where li.id=library_item_id and li.user_id=auth.uid())) with check(exists(select 1 from public.library_items li where li.id=library_item_id and li.user_id=auth.uid()));
create policy "own library tags" on public.library_tags for all using(exists(select 1 from public.library_items li where li.id=library_item_id and li.user_id=auth.uid())) with check(exists(select 1 from public.library_items li where li.id=library_item_id and li.user_id=auth.uid()));
create policy "own list items" on public.custom_list_items for all using(exists(select 1 from public.custom_lists l where l.id=list_id and l.user_id=auth.uid())) with check(exists(select 1 from public.custom_lists l where l.id=list_id and l.user_id=auth.uid()));

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
begin insert into public.profiles(id,display_name) values(new.id,coalesce(new.raw_user_meta_data->>'display_name',split_part(new.email,'@',1))); return new; end; $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

insert into public.rating_categories(user_id,name,weight,position) select id,'História',30,0 from auth.users where not exists(select 1 from public.rating_categories c where c.user_id=auth.users.id);
