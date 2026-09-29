# Release Runbook — MyCatalog Premium UI V2

**Gerado na fase I1.** Sequência conceitual de release, na ordem em que
deve ser executada. Nenhum passo deste documento foi executado por esta
fase — é o roteiro para quando o release for autorizado.

---

## PRE-DEPLOY

1. **Confirmar variáveis de ambiente de produção** (nomes, nunca
   valores) estão configuradas na Vercel: `DATABASE_URL`,
   `NEON_AUTH_BASE_URL` (ou `NEON_AUTH_URL`), `NEON_AUTH_COOKIE_SECRET`,
   `TMDB_API_KEY`, `TMDB_LANGUAGE`, `NEXT_PUBLIC_TMDB_BASE_URL`,
   `NEXT_PUBLIC_TMDB_IMAGE_BASE`, `GEMINI_API_KEY`, `GEMINI_MODEL`,
   `NEXT_PUBLIC_SITE_URL`, `BLOB_READ_WRITE_TOKEN`/`BLOB_STORE_ID`.
   **Crítico após esta fase:** `NEON_AUTH_COOKIE_SECRET` agora é
   **obrigatória sem fallback** (`lib/auth/cookie-secret.ts`) — se
   ausente, o app falha ao subir (fail-closed, intencional). Confirmar
   que está configurada antes do deploy, não depois.
2. **Rotacionar o segredo HMAC exposto.** O valor hardcoded removido
   nesta fase (`proxy.ts` + `lib/auth/server.ts`) esteve versionado no
   repositório — deve ser considerado comprometido. Se
   `NEON_AUTH_COOKIE_SECRET` em qualquer ambiente (TEST ou produção)
   já foi igual a esse fallback em algum momento, gerar um novo valor
   e atualizar a variável no ambiente correspondente antes do deploy.
   Isso é feito diretamente no provedor (Vercel/Neon), não via código.
3. **Backup/checagem do banco** — confirmar snapshot recente do banco
   de produção (Neon) antes de aplicar qualquer migração.
4. **Aplicar migrações pendentes**, na ordem abaixo (única migração
   nova desta fase):
   - `create unique index if not exists watch_entries_user_dedup_idx
     on public.watch_entries (user_id, library_item_id, watched_at,
     is_rewatch);` — idempotente (`if not exists`), já aplicada e
     validada em TEST nesta fase. Sem dependências. Sem risco de dado
     (não altera linhas existentes, só adiciona um índice único; se
     houver violação de unicidade em produção — não esperada, TEST não
     apresentou nenhuma — a criação falha sem side effect, e precisa
     ser investigada antes de prosseguir).
   - A correção de documentação de `activity_events.event_type`
     (inclusão de `'watch_logged'` no `schema.sql`) **não é uma
     migração** — a constraint real do banco já aceitava esse valor;
     só o arquivo versionado estava desatualizado.
5. **Verificar schema/índices** pós-migração: confirmar
   `watch_entries_user_dedup_idx` existe (`pg_indexes`) e que a
   constraint `activity_events_event_type_check` já inclui
   `'watch_logged'` (deve já ser verdade sem nenhuma ação).

## DEPLOY

6. Deploy da versão via Vercel.
7. Verificar build/runtime: confirmar que o deploy concluiu sem erro e
   que a home carrega.
8. **Smoke crítico** (ver Post-Deploy Smoke Test abaixo).

## POST-DEPLOY

9. Home carrega.
10. Login/logout funcionam.
11. Search retorna resultados.
12. Página de título (filme e série) carrega com metadata correta.
13. Mutação controlada de Library (adicionar 1 item, remover) funciona.
14. Perfil (`/profile` e `/u/[username]` próprio) carrega.
15. Stats carrega.
16. Calendar carrega, cronograma de episódios não aparece com o dia
    errado (validação do fix de fuso horário desta fase).
17. Checar logs/erros da Vercel nas primeiras horas — atenção especial
    a qualquer 401/500 em `/api/account/import` (rota corrigida nesta
    fase) e a qualquer falha de boot relacionada a
    `NEON_AUTH_COOKIE_SECRET` ausente (fail-closed agora derruba o
    processo em vez de usar um fallback silencioso).

---

## Critérios de rollback

Reverter para o deploy anterior (mecanismo padrão da Vercel — não há
automação de rollback própria neste projeto) se, após o deploy:

- a migração do índice falhar (violação de unicidade inesperada em
  produção);
- o app não subir por `NEON_AUTH_COOKIE_SECRET` ausente (é o
  comportamento esperado do fail-closed, mas se acontecer em
  **produção** sem que a env var tenha sido configurada, é uma falha
  de processo do próprio deploy, não do código — corrigir a
  configuração e reimplantar, não reverter o código);
- login/autenticação falhar em massa (5xx crítico no fluxo de sessão);
- houver qualquer indício de vazamento de dado entre contas (privacy
  leak) — especialmente em `/api/account/import` ou
  `/api/public-profile/[username]`, as duas rotas com fix de
  segurança nesta fase;
- o fluxo de import corromper dados de biblioteca/diário de qualquer
  conta;
- houver crash de hidratação/client generalizado;
- qualquer uma das jornadas críticas (`§ Jornadas Críticas` no
  [`docs/I-QA-POLISH-RELEASE-AUDIT.md`](./I-QA-POLISH-RELEASE-AUDIT.md))
  falhar no smoke pós-deploy.

## Post-Deploy Smoke Test (checklist)

- [ ] Home
- [ ] Login/logout
- [ ] Search
- [ ] Título (filme e série)
- [ ] Mutação controlada de Library
- [ ] Perfil próprio e perfil público de outro usuário
- [ ] Stats
- [ ] Calendar
- [ ] Import de backup (com atenção redobrada ao fix do IDOR)

## Dívida deliberadamente adiada (não é bloqueador deste release)

React Bits (não adotado), Sharing, Achievements, Email notifications,
Social feed, Friends/block/mute/report, Tags UI, Bulk Library actions,
TV progress badge na Library (a Home já mostra o próximo episódio desde a V2.1-E), índices trigram (ainda sem evidência de
necessidade real), instrumentação de web vitals, reescritas de
arquitetura, upgrade de `@neondatabase/auth` para fora do beta,
consolidação dos `.sql` avulsos de `supabase/` num sistema de migração
formal, resíduo de nomenclatura "Supabase" em comentários/testes,
duplicidade `NEON_AUTH_URL`/`NEON_AUTH_BASE_URL`, `loading.tsx` de segmento nas rotas que ainda não têm, os 3
pontos residuais de `new Date()`/`getFullYear()` no corpo de componente
em `app/page.tsx`/`discover`/`retrospective` (mesma classe do fix de
hidratação da Library, mas não nomeados no escopo explícito desta
fase), e o bug de duplicação de `activity_events` (`season_completed`
inserido múltiplas vezes com timestamp idêntico) descoberto durante
esta fase — root cause não investigada, provavelmente na cascata de
conclusão de temporada; não corrigido para não expandir o escopo de
segurança/hidratação/timezone desta fase.

## Estado atual do banco de produção

Projeto Neon: Bisnaga MyCatalog

Branch usada pela aplicação em produção:
- `import`

A branch Neon chamada `production` NÃO é atualmente utilizada pela aplicação
e está sem o schema principal.

Regra operacional:
- Toda migration/deploy que envolva banco deve confirmar primeiro que o
  `DATABASE_URL` da Vercel Production aponta para a branch `import`.
- Não usar a branch `production` apenas pelo nome ou por estar marcada
  como default no Neon.

## Estado da V2.1 (A–E) e migrations

- V2.1-A, B, C, D e E **concluídas** (gate final da E aprovado). Favicon/ícone PWA e
  manifest **já existem** (`app/icon.svg`, `app/manifest.ts`, V2.1-C) — não são mais dívida.
- **Migration da V2.1-E já aplicada em PROD** (branch `import`): tabela
  `public.user_streaming_services` (PK `(user_id, provider_id)`, FK
  `neon_auth."user"(id)` `ON DELETE CASCADE`, RLS ligada, 0 rows na aplicação). Arquivo:
  `supabase/v2.1-e-streaming-services.sql`. Ela era **pré-deploy obrigatória**: sem a
  tabela, `/api/streaming-services`, `provider=mine` (Discover/Para você) e
  `/api/smart-queue` retornam 500. Como já está aplicada, o código da V2.1-E pode ser
  publicado sem esse risco.
- Fechamento da V2.1: `DELETE /api/watch-history/[id]` deixou de recalcular
  `personal_rating`/`rewatch_count` (ver `V2.1-A-DATA-INTEGRITY.md` §9). **Sem migration.**
- Este documento não registra se o deploy do código da V2.1 já ocorreu: confirmar na Vercel
  antes de assumir.

## Segurança pós-release

Durante o release, uma connection string completa do Neon foi exibida
acidentalmente no terminal local.

A credencial correspondente deve ser considerada exposta e rotacionada.

Após a rotação:
1. atualizar `DATABASE_URL` em Vercel Production;
2. redeployar;
3. executar smoke de conexão/auth;
4. nunca registrar o valor da credencial neste documento.