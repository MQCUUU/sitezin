-- V2.7 — Listas independentes da Biblioteca.
--
-- Lista = seleção intencional de títulos. A identidade durável de um item é a MÍDIA
-- (public.media), não o item da Biblioteca. Remover da Biblioteca não tira da lista;
-- um título pode estar numa lista sem nunca ter estado na Biblioteca.
--
-- ANTES:  custom_list_items (list_id, library_item_id, position)
--           PK (list_id, library_item_id); library_item_id → library_items ON DELETE CASCADE
--         is_public só no espelho public.lists
-- DEPOIS: custom_list_items (list_id, media_id, position, added_at, library_item_id opcional)
--           PK (list_id, media_id)  → o mesmo título nunca duas vezes na mesma lista
--           media_id → media(id) (sem cascade: o catálogo não é apagado)
--           library_item_id → library_items ON DELETE SET NULL (vínculo legado, opcional)
--         custom_lists.is_public + updated_at (canônicos; o espelho segue sincronizado pelo app)
--
-- BACKFILL determinístico: media_id = library_items.media_id do library_item_id gravado.
-- Nunca por nome. Se alguma linha não resolver, a migration ABORTA (nada é alterado).
--
-- ORDEM SEGURA: migration ANTES do app novo. Compatível com o app atual:
--   - ele insere (list_id, library_item_id, position) → o gatilho preenche media_id;
--   - o ON CONFLICT (list_id, library_item_id) dele continua tendo índice único;
--   - ele lê itens com JOIN library_items → segue funcionando para os itens que têm vínculo.
-- Idempotente e transacional.
--
-- ROLLBACK LÓGICO: reverter o deploy do app basta (o schema novo atende o app antigo).
-- Não volte a PK antiga: itens adicionados pelo app novo não têm library_item_id.

begin;

-- 1. custom_lists: privacidade e data de atualização canônicas
do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'custom_lists' and column_name = 'is_public') then
    alter table public.custom_lists add column is_public boolean not null default false;
    update public.custom_lists cl set is_public = coalesce(l.is_public, false) from public.lists l where l.id = cl.id;
  end if;

  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'custom_lists' and column_name = 'updated_at') then
    alter table public.custom_lists add column updated_at timestamptz not null default now();
    update public.custom_lists cl set updated_at = coalesce(l.updated_at, cl.created_at) from public.lists l where l.id = cl.id;
  end if;
end $$;

-- Descrição gravada como o texto "null" (bug do PATCH antigo) ou vazia → NULL de verdade.
update public.custom_lists set description = null where description is not null and (btrim(description) = '' or description = 'null');
update public.lists set description = null where description is not null and (btrim(description) = '' or description = 'null');

-- 2. custom_list_items: mídia como identidade
alter table public.custom_list_items add column if not exists media_id integer;
alter table public.custom_list_items add column if not exists added_at timestamptz not null default now();

update public.custom_list_items cli
set media_id = li.media_id
from public.library_items li
where cli.media_id is null and li.id = cli.library_item_id;

do $$
begin
  if exists (select 1 from public.custom_list_items where media_id is null) then
    raise exception 'custom_list_items com media_id não resolvido — migration abortada sem alterações';
  end if;
end $$;

alter table public.custom_list_items alter column media_id set not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'custom_list_items_media_id_fkey') then
    alter table public.custom_list_items
      add constraint custom_list_items_media_id_fkey foreign key (media_id) references public.media(id);
  end if;

  -- PK passa de (list_id, library_item_id) para (list_id, media_id)
  if exists (
    select 1 from pg_constraint
    where conname = 'custom_list_items_pkey' and pg_get_constraintdef(oid) like '%library_item_id%'
  ) then
    alter table public.custom_list_items drop constraint custom_list_items_pkey;
    alter table public.custom_list_items add constraint custom_list_items_pkey primary key (list_id, media_id);
  end if;
end $$;

-- Vínculo com a Biblioteca vira opcional e nunca apaga o item da lista.
alter table public.custom_list_items alter column library_item_id drop not null;
alter table public.custom_list_items drop constraint if exists custom_list_items_library_item_id_fkey;
alter table public.custom_list_items
  add constraint custom_list_items_library_item_id_fkey
  foreign key (library_item_id) references public.library_items(id) on delete set null;

-- Compatibilidade com o app atual (ON CONFLICT (list_id, library_item_id)).
create unique index if not exists custom_list_items_list_library_key
  on public.custom_list_items (list_id, library_item_id);

-- Ordem estável (position, added_at, media_id) e busca por mídia.
create index if not exists custom_list_items_order_idx
  on public.custom_list_items (list_id, position, added_at, media_id);
create index if not exists custom_list_items_media_idx on public.custom_list_items (media_id);

-- 3. Gatilho de compatibilidade: insert sem media_id (app atual) resolve pela Biblioteca.
create or replace function public.custom_list_items_fill_media()
returns trigger
language plpgsql
as $fn$
begin
  if new.media_id is null and new.library_item_id is not null then
    select li.media_id into new.media_id from public.library_items li where li.id = new.library_item_id;
  end if;
  return new;
end
$fn$;

drop trigger if exists custom_list_items_fill_media on public.custom_list_items;
create trigger custom_list_items_fill_media
  before insert on public.custom_list_items
  for each row execute function public.custom_list_items_fill_media();

commit;
