-- ============================================================================
-- SOMENTE PARA BANCO DESCARTÁVEL DE VERIFICAÇÃO (scripts/db-rebuild-check.mjs).
-- NUNCA aplicar em TEST/PROD: lá o schema neon_auth é criado e mantido pelo
-- Neon Auth (habilitado no branch).
--
-- Reproduz só o mínimo que as migrations do app exigem: neon_auth."user"(id),
-- alvo das FKs de todas as tabelas de usuário, e neon_auth.session (lida pelo
-- servidor em lib/auth/server.ts). Colunas iguais às do Neon Auth (Better Auth).
-- ============================================================================
CREATE SCHEMA IF NOT EXISTS neon_auth;

CREATE TABLE IF NOT EXISTS neon_auth."user" (
  id uuid PRIMARY KEY,
  name text NOT NULL DEFAULT '',
  email text NOT NULL,
  "emailVerified" boolean NOT NULL DEFAULT false,
  image text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  role text,
  banned boolean,
  "banReason" text,
  "banExpires" timestamptz
);

CREATE TABLE IF NOT EXISTS neon_auth.session (
  id uuid PRIMARY KEY,
  "expiresAt" timestamptz NOT NULL,
  token text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "ipAddress" text,
  "userAgent" text,
  "userId" uuid NOT NULL REFERENCES neon_auth."user"(id) ON DELETE CASCADE,
  "impersonatedBy" text,
  "activeOrganizationId" text
);
