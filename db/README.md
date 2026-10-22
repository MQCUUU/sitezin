# Banco de dados do MyCatalog

Postgres na Neon. O app conecta como dono do schema (`neondb_owner`) e isola os
dados por `user_id` da sessão no servidor. As contas vivem no schema `neon_auth`,
criado e mantido pelo **Neon Auth** no mesmo banco.

## Estrutura

```
db/
  migrations/          fonte ÚNICA do schema — aplicada em ordem pelo runner
    0001_baseline.sql  schema completo (gerado do TEST em 2026-10-22, Fase 6)
  dev/
    neon-auth-stub.sql só para o banco descartável do db:rebuild-check (nunca TEST/PROD)
  legacy/              SQL antigo, só como histórico (ver legacy/README.md)
```

Controle: `public.schema_migrations` (nome do arquivo, checksum, data). Uma
migration aplicada **nunca é editada** — o runner recusa se o checksum mudar.

## Comandos

| Comando | O que faz | Escreve? |
|---|---|---|
| `npm run db:migrate -- --status` | o que já foi aplicado e o que falta | não |
| `npm run db:migrate` | aplica o que falta (cada arquivo numa transação) | sim |
| `npm run db:migrate -- --baseline` | banco que **já existe**: registra a 0001 sem executá-la | só a tabela de controle |
| `npm run db:drift -- --a X --b Y` | compara o schema de dois bancos (nomes das variáveis) | não |
| `npm run db:rebuild-check` | cria banco descartável no TEST, aplica tudo do zero, compara com o TEST, smoke de integridade, apaga | só o banco descartável |
| `npm run test:db` | migrations em dia, tabelas críticas com RLS, sem acesso anônimo | não |

Todos leem `.env.local` e **nunca imprimem connection strings**. Padrão:
`DATABASE_URL`; outra variável com `--env NOME` (ex.: `--env TEST_DATABASE_URL`).

## Criar um banco TEST do zero

1. Na Neon, crie um branch novo **vazio** e habilite o **Neon Auth** nele
   (cria `neon_auth`; a baseline exige isso e para com mensagem clara se faltar).
2. Ponha a connection string em `TEST_DATABASE_URL` (e o par `NEON_AUTH_BASE_URL`
   do MESMO branch — o servidor avisa no log se forem de endpoints diferentes).
3. `npm run db:migrate -- --env TEST_DATABASE_URL`
4. (Opcional) índice de busca: `scripts/build-universal-index-v4.mjs` popula as
   tabelas `search_*` (dados, não schema; sem eles a busca de personagens/pessoas
   fica vazia, o resto funciona).
5. `npm run test:db -- --env TEST_DATABASE_URL`

## Criar uma migration nova

1. Arquivo `db/migrations/NNNN_descricao.sql` (próximo número, minúsculas).
2. SQL puro, transacional (o runner envolve em BEGIN/COMMIT) e, sempre que der,
   idempotente (`IF NOT EXISTS`). Nada de `DROP TABLE`/`TRUNCATE` sem revisão
   (o teste `scripts/test-db-migrations.mjs` barra).
3. Tabela nova: `ENABLE ROW LEVEL SECURITY` (padrão do projeto: RLS ligado, sem
   policies) e FK para `neon_auth."user"(id) ON DELETE CASCADE` se for dado do
   usuário (excluir a conta apaga tudo).
4. Aplique no TEST, rode `npm run db:rebuild-check` e `npm test`.

## Verificar drift

- Repositório × TEST: `npm run db:rebuild-check` (só deve sobrar a tabela de
  exemplo `playing_with_neon`).
- TEST × PROD (somente leitura): `npm run db:drift -- --a TEST_DATABASE_URL --b PROD_DATABASE_URL`.
  Em 2026-10-22: 1 diferença de **nome** de constraint em `user_events`
  (`…_tmdb_id_positive` × `…_tmdb_id_check`, mesma regra `tmdb_id > 0`).

## O que NÃO executar em PROD sem revisão

- `npm run db:migrate` (o runner **recusa** o host de `PROD_DATABASE_URL`; só passa
  com revisão + `MIGRATE_ALLOW_PROD=1` + `--allow-prod`).
- Adoção da baseline em PROD (`--baseline`): segura (só cria a tabela de controle e
  registra a 0001), mas é uma escrita em produção — fazer junto com o deploy, revisado.
- Qualquer remoção de tabela (ver inventário abaixo): exige backup e evidência de
  que nada usa (código, funções, views, dashboards, integrações).

## Segurança (RLS)

- RLS ligado em todas as tabelas do app, **sem policies**: o app (dono, com
  `bypassrls`) não é afetado; qualquer outro papel fica sem acesso.
- Nenhum privilégio para `anon`/`authenticated`/`PUBLIC` no schema `public`
  (verificado por `npm run test:db`).
- `playing_with_neon` (exemplo da Neon) é a única sem RLS: sem dados do app e sem
  privilégio para outros papéis.

## Inventário (2026-10-22, TEST)

42 tabelas no `public` (41 na baseline + `playing_with_neon`).

**Ativas** (usadas pelo app): activity_events, ai_recommendation_cache,
api_rate_limits, custom_list_items, custom_lists, episodes_progress, follows,
library_items, lists (espelho de escrita de custom_lists, mantido por
compatibilidade), media, notification_preferences, notifications,
profile_favorites, profiles, review_categories, review_scores,
search_character_media, search_characters, search_indexed_media, search_media,
search_people, search_people_media, user_events, user_hidden_titles,
user_preferences, user_streaming_services, username_changes, watch_entries.

**Provavelmente obsoletas** (nenhum uso no código, funções ou triggers — NÃO
apagadas; remover só com backup e confirmação): list_items, category_ratings,
rating_categories, library_tags, personal_tags, movie_tags, tags, tmdb_cache,
friendships (substituída por follows), characters, character_media, people,
people_media (índice antigo, substituído por search_*), playing_with_neon.

Funções sem trigger no banco: `handle_new_user`, `handle_new_user_profile`
(herança do Supabase; o perfil hoje é criado por `POST /api/auth/profile`).
