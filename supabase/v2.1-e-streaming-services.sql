-- ============================================================
-- V2.1-E — Meus serviços de streaming (ADITIVA)
--
-- Guarda apenas "eu tenho este serviço": provider_id canônico do
-- TMDB (região BR, a mesma usada por Discover/Para Você). Nenhuma
-- credencial, token ou login de serviço é armazenado.
--
-- Ordem de deploy: aplicar ESTE arquivo no banco ANTES de publicar o
-- código da V2.1-E (o código trata a ausência da tabela como "sem
-- serviços", mas Settings não conseguirá salvar sem ela).
-- Idempotente (IF NOT EXISTS) — pode ser reexecutado.
-- Referencia neon_auth."user" (mesmo alvo das demais tabelas de usuário
-- do banco atual, ex.: user_hidden_titles).
-- ============================================================

create table if not exists public.user_streaming_services (
  user_id       uuid    not null references neon_auth."user"(id) on delete cascade,
  provider_id   integer not null check (provider_id > 0),
  provider_name text    not null check (char_length(provider_name) between 1 and 80),
  logo_path     text,
  created_at    timestamptz not null default now(),
  primary key (user_id, provider_id)
);

alter table public.user_streaming_services enable row level security;
