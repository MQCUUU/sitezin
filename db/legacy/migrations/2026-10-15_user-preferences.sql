-- Preferências de aparência na CONTA (não só no navegador).
--
-- Antes: tema, cor de destaque, densidade, bordas, movimento e ordem padrão da
-- Biblioteca viviam só no localStorage — trocar de navegador/aparelho, abrir
-- janela anônima ou limpar os dados do navegador voltava tudo ao padrão.
-- Agora: uma linha por usuário; o app aplica a versão da conta ao entrar e
-- salva cada mudança nela (o localStorage continua como cache local).
--
-- ORDEM: aplicar ANTES do deploy do app que usa GET/PUT /api/profile/preferences.
-- COMPATÍVEL com o app atual (que não conhece a tabela). Idempotente e transacional.
-- Segurança: mesmo padrão das demais tabelas (RLS ligada sem policies; o app
-- conecta como dono e isola por user_id da sessão no servidor).
-- ROLLBACK: drop table if exists public.user_preferences; (só perde as preferências salvas na conta).

begin;

create table if not exists public.user_preferences (
  user_id    uuid primary key references neon_auth."user"(id) on delete cascade,
  appearance jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_preferences enable row level security;

commit;
