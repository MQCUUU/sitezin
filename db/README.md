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

## Fase 7 — tabelas provavelmente obsoletas (evidência, 2026-10-22, TEST)

Consulta somente leitura (`pg_constraint`, `pg_depend`/`pg_rewrite`, `pg_trigger`,
`pg_proc.prosrc`) + busca no código (`app`, `lib`, `components`, `hooks`, `scripts`)
+ `git log -G`. **Nada foi apagado.** Toda FK listada é `ON DELETE CASCADE`, então
nenhuma delas trava a exclusão de conta ou de item.

| Tabela | Linhas (TEST) | Uso no código hoje | Última referência no git | FK sai → / entra ← | View / trigger / função | Risco de remover | Recomendação |
|---|---|---|---|---|---|---|---|
| list_items | 0 | nenhum | 224e2a8 (2026-09-27, Listas V2.7 trocou por custom_list_items) | → lists, neon_auth.user | — | baixo | remover junto com `lists` quando o espelho for desligado |
| category_ratings | 0 | nenhum | nunca | → rating_categories, library_items | — | baixo | remover (com rating_categories) |
| rating_categories | 0 | nenhum | 48209df (V3.4) | → neon_auth.user · ← category_ratings | — | baixo | remover depois de category_ratings |
| library_tags | 0 | nenhum | 48209df (V3.4 removeu /api/tags) | → library_items, personal_tags | — | baixo | remover |
| personal_tags | 0 | nenhum | 48209df (V3.4) | → neon_auth.user · ← library_tags | — | baixo | remover depois de library_tags |
| movie_tags | 0 | nenhum | 48209df (V3.4) | → tags, neon_auth.user | — | baixo | remover |
| tags | 0 | nenhum | 48209df (V3.4) | → neon_auth.user · ← movie_tags | — | baixo | remover depois de movie_tags |
| tmdb_cache | 0 | nenhum | nunca | — | — | baixo | remover |
| friendships | 1 | nenhum (substituída por `follows`) | 48209df (V3.4) | → neon_auth.user ×2 | — | baixo (conferir a linha em PROD antes) | exportar a(s) linha(s) e remover |
| characters | 870 | nenhum (índice antigo) | nunca | ← character_media | — | médio (dados de índice; regeneráveis) | backup e remover com character_media |
| character_media | 1032 | nenhum | nunca | → characters, media, people | — | médio | backup e remover |
| people | 1414 | nenhum (substituída por search_people) | nunca | ← character_media, people_media | — | médio | backup e remover por último do grupo |
| people_media | 1454 | nenhum | nunca | → media, people | — | médio | backup e remover |
| playing_with_neon | 10 | nenhum (exemplo da Neon) | nunca | — | — | nenhum | remover |

Ordem segura para uma futura limpeza (só com backup e autorização): filhas antes
das mães — category_ratings → rating_categories; library_tags → personal_tags;
movie_tags → tags; character_media e people_media → characters e people;
list_items (junto com a decisão sobre `lists`); tmdb_cache; friendships;
playing_with_neon. Em PROD, repetir esta consulta antes (contagens podem diferir).

## Fase 7 — adoção da baseline em PROD (preparado, NÃO executado)

Objetivo: registrar em PROD que o schema atual corresponde à `0001_baseline.sql`,
para que migrations futuras rodem pelo runner. Não altera nenhuma tabela do app:
cria `public.schema_migrations` (com RLS) e insere uma linha.

Antes:
1. `npm run db:drift -- --a TEST_DATABASE_URL --b PROD_DATABASE_URL` — esperado: só
   a diferença conhecida de nome de constraint em `user_events`. Qualquer outra
   diferença: parar e investigar.
2. Backup/branch do PROD na Neon (branch a partir do ponto atual).
3. Confirmar que não há deploy em andamento.

Comando (uma vez, revisado, com as duas travas do runner):
```
MIGRATE_ALLOW_PROD=1 npm run db:migrate -- --env PROD_DATABASE_URL --baseline --allow-prod
```

Conferir:
- `npm run db:migrate -- --env PROD_DATABASE_URL --status` → 0001 registrada, 0 pendentes.
- `SELECT filename, checksum FROM public.schema_migrations` → uma linha, checksum igual ao do repositório.
- `SELECT relrowsecurity FROM pg_class WHERE relname = 'schema_migrations'` → `true`.

Rollback (se algo der errado): `DROP TABLE public.schema_migrations;` — volta ao
estado anterior; nenhuma tabela do app é tocada pela baseline.

## Fase 7 — modelo de autorização (RLS)

- RLS está ligado nas tabelas do app, sem policies.
- O app conecta como **dono** das tabelas (papel com `bypassrls`): o RLS **não**
  filtra nada para o app. Ele só impede que outros papéis (ex.: `anon`,
  `authenticated`, `PUBLIC`) leiam ou escrevam.
- A autorização real é a camada da API: cada rota obtém a sessão
  (`auth.getSession()`), usa o `user_id` dela e filtra/valida a posse em todas as
  queries (`WHERE user_id = …`, checagem de dono antes de alterar/apagar). Os testes
  de autorização com duas contas (`tests/api-authz.spec.ts`) cobrem isso.
- Consequência: uma rota nova que esquecer o filtro por `user_id` vaza dados —
  o banco não protege. Toda rota nova precisa do mesmo padrão e de teste de posse.
