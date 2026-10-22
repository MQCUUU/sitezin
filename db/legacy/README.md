# SQL legado (histórico)

**Não aplicar.** Estes arquivos registram como o schema evoluiu até a Fase 6.
Tudo o que eles criaram já está em `db/migrations/0001_baseline.sql`, gerada do
banco real. Ficam aqui porque docs e comentários antigos citam esses caminhos.

Ordem histórica aproximada (pelas datas e dependências):

| Arquivo | O que fez |
|---|---|
| `supabase/schema.sql` | retrato do banco em 2026-08-16 (incompleto: sem funções/triggers/extensões; 1ª linha sem `--`, não roda como está) |
| `supabase/public-profiles.sql` | perfil público, follows, notificações, vitrine |
| `supabase/fix-signup-trigger.sql` | correção do trigger de cadastro (era Supabase; hoje sem trigger) |
| `supabase/audit-hardening.sql` | extensões no schema `extensions`, RLS, índices |
| `supabase/search-v4-rpcs.sql` | funções de busca `search_v4_*` |
| `supabase/v2.1-e-streaming-services.sql` | `user_streaming_services` |
| `supabase/v2.3-insights.sql` (+ `-backfill`) | `user_events`, precisão de horário |
| `migrations/2026-10-14_v2.5-history-integrity.sql` | remover da Biblioteca não apaga histórico (FKs SET NULL) |
| `migrations/2026-10-15_user-preferences.sql` | `user_preferences` |
| `migrations/2026-10-15_v2.7-lists-media.sql` | listas apontam para a mídia |

`api_rate_limits` (usada pelo assistente) **não estava em nenhum** destes
arquivos — só existia no banco. Agora está na baseline.

`supabase/email-templates.md` é texto dos e-mails de autenticação (não é SQL).
