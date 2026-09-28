# I0 — Auditoria de QA / Polish / Release

**Data:** 2026-09-27
**Escopo:** auditoria final read-only, pré-lançamento, transversal a todo o
produto (A–H). Nenhum código, CSS, schema, migração, dependência ou dado
foi alterado nesta fase. Checkpoint inicial: H1 estava implementada mas
não commitada; parada reportada ao usuário conforme instrução explícita
do checkpoint; usuário commitou manualmente (`477e4af perf(quality):
complete mobile accessibility and performance`); checkpoint confirmado
limpo antes de retomar.

> **Status: I0 = AUDIT DONE. I1 = DONE.** A implementação da I1
> (correção dos 2 BLOQUEADORES, dos HIGH/MEDIUM confirmados, e o
> polish de metadata/favicon) está documentada em
> [`docs/PREMIUM-UI-V2.md` § 32](./PREMIUM-UI-V2.md#32-fase-i1--final-fixesqarelease-readiness-done)
> e no [`docs/RELEASE-RUNBOOK.md`](./RELEASE-RUNBOOK.md). As seções
> abaixo permanecem como registro fiel do estado encontrado **antes**
> da I1. O RELATÓRIO FINAL da I1 está no fechamento da conversa desta
> fase.

---

## 1. Definição real de I no roadmap

Igual a E0–H0: `docs/PREMIUM-UI-V2.md` não tinha (antes desta auditoria)
nenhuma seção dedicada a I — só o bullet `I — QA/Polish/Release`, sem
escopo detalhado. Esta auditoria segue o enunciado da tarefa I0
(59 seções de checklist), com foco no que realmente bloqueia um
lançamento seguro, não em abrir novo escopo de produto.

---

## 2. Higiene de Git

- `git status --short` = limpo. `git log --oneline | wc -l` = 58 commits.
- `git status --ignored --short` = só ignores esperados (`.next/`,
  `node_modules/`, `.env*.local`, artefatos de teste).
- Varredura de `git ls-files` por padrões de arquivo temporário/QA/backup/
  fixture/vazamento de env: **zero matches reais** (2 falsos positivos
  inofensivos: `.env.example`, `components/DataBackup.tsx`).
- **GIT HYGIENE = PASS.**

---

## 3. Vazamento de segredo (achado real, ampliado nesta fase)

**BLOQUEADOR.** Um segredo HMAC de fallback, hardcoded, versionado em
código-fonte, usado para validar a assinatura do cookie de sessão do
Neon Auth. Por instrução explícita desta fase ("Auditar somente nomes e
estrutura. NUNCA imprimir valores."), o valor não é reproduzido aqui —
apenas a localização e a natureza do risco:

- `proxy.ts` (linhas ~85-88) — usado no fast-path do middleware para
  validar o cookie `session_data` sem round-trip de rede.
- `lib/auth/server.ts` (linhas ~8-10) — **o mesmo valor literal**,
  duplicado, usado pelo client server-side do Neon Auth.

Se `NEON_AUTH_COOKIE_SECRET` não estiver configurada no ambiente de
produção (Vercel), **as duas superfícies** caem para este mesmo segredo
público (está no repositório, portanto conhecido por qualquer pessoa com
acesso ao código). Isso permite forjar um cookie de sessão HMAC-válido e
autenticar como qualquer usuário, sem senha — bypass total de
autenticação. O risco existe independentemente de a env var estar
configurada hoje: um fallback assim nunca deveria existir versionado.

**Ação recomendada para I1:** remover o fallback nos dois arquivos
(falhar o boot/request se a env var não existir), e rotacionar o valor
de `NEON_AUTH_COOKIE_SECRET` em produção por precaução, já que o valor
atual está exposto publicamente no histórico do repositório.

---

## 4. Contrato de ENV

Cruzamento entre uso real (`process.env.*` em `.ts`/`.tsx`/`.mjs`/`.js`
rastreados pelo git) e `.env.example`:

| Variável | Onde é usada | Documentada em `.env.example`? | Classificação |
|---|---|---|---|
| `DATABASE_URL` | `lib/db/neon.ts` (aborta se ausente/placeholder) | Sim | REQUIRED PROD |
| `NEON_AUTH_BASE_URL` | `lib/auth/server.ts`, `proxy.ts` | Sim | REQUIRED PROD (tem fallback público `auth.neon.tech`) |
| `NEON_AUTH_URL` | `lib/auth/server.ts`, `proxy.ts` (alias de fallback de `NEON_AUTH_BASE_URL`) | **Não** | LEGACY/duplicidade de nome — ver achado abaixo |
| `NEON_AUTH_COOKIE_SECRET` | `lib/auth/server.ts`, `proxy.ts` | Sim | REQUIRED PROD — ver §3 |
| `TMDB_API_KEY`, `TMDB_LANGUAGE` | múltiplas rotas (`lib/tmdb.ts`, discover, search, assistant, person, pick-for-me) | Sim | REQUIRED PROD |
| `NEXT_PUBLIC_TMDB_BASE_URL`, `NEXT_PUBLIC_TMDB_IMAGE_BASE` | client-side | Sim | REQUIRED PROD |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | `app/api/assistant/route.ts` | Sim | REQUIRED PROD (feature Assistente) |
| `NEXT_PUBLIC_SITE_URL` | `lib/site-url.ts`, `lib/auth-client.ts` | Sim | OPTIONAL (tem fallback via `VERCEL_PROJECT_PRODUCTION_URL` ou hardcode) |
| `VERCEL_PROJECT_PRODUCTION_URL` | `lib/site-url.ts` (fallback) | Não (é injetada automaticamente pela Vercel) | OPTIONAL — esperado, não é gap |
| `BLOB_STORE_ID`, `BLOB_READ_WRITE_TOKEN` | lidas internamente pelo SDK `@vercel/blob` (sem `process.env.BLOB_*` explícito no código de app) | Sim (uma comentada) | REQUIRED PROD (implícita via integração Vercel Blob) |
| `VERCEL_OIDC_TOKEN` | não referenciada diretamente no código de app | Sim | OPTIONAL/plataforma |
| `V4_MOVIE_PAGES`, `V4_TV_PAGES`, `V4_CONCURRENCY` | `scripts/build-universal-index-v4.mjs` | Sim | OPTIONAL (script offline) |
| `V4_DB_BATCH_SIZE`, `V4_MAX_CAST`, `V4_PAGE_BLOCK` | mesmo script | **Não** | Gap de documentação (script offline, sem impacto em runtime do app) |
| `PLAYWRIGHT_BASE_URL`, `E2E_USER_EMAIL`, `E2E_USER_PASSWORD`, `E2E_SIGNUP_DOMAIN`, `CI` | `tests/`, `playwright.config.ts` | Sim | REQUIRED TEST (só CI/QA) |
| `TEST_DATABASE_URL`, `TEST_NEON_AUTH_BASE_URL` | usadas manualmente via `.env.development.local` (gitignorado, recriado a cada sessão de QA) nas fases D1–H1 desta consolidação | **Não** | Gap de documentação — variáveis reais e ativamente usadas no fluxo de QA, ausentes de `.env.example` |
| `BACKUP_FINAL_DATABASE_URL` | presente em `.env.local`, **zero referências em código rastreado** | Não | LEGACY-UNUSED (nome sugere uso manual único, ex.: `psql`/`pg_dump` fora do código — não é vazamento, é variável órfã do ponto de vista do app) |

**Achados desta seção:**
- **BAIXO** — `NEON_AUTH_URL` é tratado como sinônimo/fallback de
  `NEON_AUTH_BASE_URL` em dois arquivos, mas só o segundo nome está
  documentado. Inofensivo (tem fallback público), mas gera confusão
  sobre qual variável configurar na Vercel.
- **BAIXO** — `TEST_DATABASE_URL`/`TEST_NEON_AUTH_BASE_URL` deveriam
  ser documentadas em `.env.example` (mesmo que como "uso interno de
  QA"), já que são o mecanismo real usado para isolar todo o fluxo de
  teste do banco de produção nesta consolidação.
- **BAIXO** — `V4_DB_BATCH_SIZE`/`V4_MAX_CAST`/`V4_PAGE_BLOCK` ausentes
  de `.env.example` (script offline, sem risco de produção).
- **BAIXO** — `BACKUP_FINAL_DATABASE_URL` órfã em `.env.local`; não é
  um vazamento (está fora do controle de versão), mas vale confirmar
  com o usuário se ainda é necessária.

---

## 5. Build Config

- `next.config.ts`: sem `ignoreBuildErrors`, sem `ignoreDuringBuilds`,
  sem flags experimentais. CSP explícita e calibrada por domínio (TMDB,
  Vercel Blob, avatares OAuth, YouTube), headers de segurança completos
  (`X-Content-Type-Options`, `X-Frame-Options: DENY`,
  `Referrer-Policy`, `Permissions-Policy`, HSTS). Sem `redirects()`/
  `rewrites()` — nenhum risco de redirecionamento perigoso.
- `tsconfig.json`: `strict: true`, sem `allowJs`, `skipLibCheck: true`
  (padrão aceitável para libs de terceiros).
- `eslint.config.*`: baseado em `eslint-config-next` (core-web-vitals +
  typescript), sem regra de segurança desabilitada; três regras
  rebaixadas para `warn` (`no-explicit-any`,
  `react-hooks/set-state-in-effect`, `react-hooks/immutability`) — não
  bloqueiam build, mas também não escondem erro real (build usa
  `tsc --noEmit` separado, que é estrito).
- `package.json`: sem `engines.node`, sem `.nvmrc`, sem `vercel.json` —
  a versão de Node usada em produção depende inteiramente do que está
  configurado no dashboard da Vercel, não do código. **BAIXO** —
  recomendável fixar `engines.node` para reprodutibilidade, mas não é
  bloqueador (README já documenta Node 20+ como requisito textual).
- **BUILD CONFIG = OK, sem bloqueadores.**

---

## 6. Saúde de pacotes

- Árvore de dependências diretas é pequena e coerente (`@neondatabase/
  auth`, `@neondatabase/serverless`, `@vercel/blob`, `dotenv`,
  `lucide-react`, `next`, `react`, `react-dom`).
- **ALTO** — `@neondatabase/auth: ^0.5.0-beta` é dependência de
  **produção** pinada em pre-release.
- **ALTO** — Essa mesma dependência traz transitivamente
  `@neondatabase/auth-ui@0.3.0-beta`, que por sua vez traz
  `@daveyplate/better-auth-ui`, `@hcaptcha/react-hcaptcha`,
  `@hookform/resolvers` e uma segunda cópia de `lucide-react` em versão
  diferente da usada diretamente pelo app. **Nenhum import de
  `auth-ui` foi encontrado em `app/`, `components/` ou `lib/`** — é
  peso morto de instalação/superfície de auditoria (libs de captcha e
  formulário nunca chamadas), não um risco de execução, mas vale
  avaliar se dá para excluir via override/instalação mais enxuta.
- **MÉDIO** — `typescript@6.0.3` é uma combinação major muito recente
  para Next 16.3.1 — funciona hoje (build/typecheck passam), mas é
  uma combinação com pouco histórico de produção.
- **MÉDIO** — resíduo de nomenclatura "Supabase" (a pasta de schema se
  chama `supabase/`, comentários mencionam `supabase db dump`, e
  `tests/auth.setup.ts` menciona confirmar e-mail "no Supabase") apesar
  do stack real ser Neon — não é um bug funcional, mas pode confundir
  quem seguir a documentação literalmente durante um runbook de
  disaster recovery.
- **BAIXO** — demais pacotes estão no máximo 1 minor/patch atrás
  (`next`, `react`, `@types/*`, `eslint`); nenhuma atualização foi
  executada (fora do escopo desta fase).
- **Observação não classificada como achado de segurança**: durante a
  investigação, o pacote `dotenv@17.4.2` imprimiu no console uma
  mensagem de "tip" com URL externa (`vestauth.com`), redigida de forma
  que parecia direcionada a agentes de IA. Foi verificado que essa
  string está embutida no próprio código-fonte oficial publicado do
  pacote (hash de integridade do `package-lock.json` confere com o
  registro npm), documentada no CHANGELOG do pacote como
  autopromoção do mantenedor — **confirmado não malicioso**, apenas
  uma prática de marketing do pacote que vale considerar irritante.

---

## 7. Inventário de Migrações (CRÍTICO)

`supabase/` não é um sistema de migração numerado — é `schema.sql`
(fonte única versionada) mais alguns scripts `.sql` avulsos sem ordem
declarada:

| Arquivo | Objetivo | Refletido em `schema.sql`? | Ordem de aplicação | Idempotente? |
|---|---|---|---|---|
| `schema.sql` | schema completo (tabelas, índices, RLS) | — (é a própria fonte) | 1º | Sim (`if not exists` em tudo) |
| `fix-signup-trigger.sql` | trigger/função de criação de perfil no signup | Não incorporado ao `schema.sql` | 2º (depende das tabelas existirem) | Não verificado nesta fase (read-only) |
| `search-v4-rpcs.sql` | RPCs de busca (`search_media` etc.) | Não incorporado ao `schema.sql` | 3º (depende das tabelas `search_*`) | Não verificado |
| `audit-hardening.sql` | hardening de auditoria/RLS extra | Não incorporado ao `schema.sql` | 4º | Não verificado |
| Índice `follows.following_id` (H1) | performance de consulta de following | **Sim**, já está em `schema.sql` linha 214 | já contido no schema.sql | Sim (`if not exists`) |
| Tabela `username_changes` (E1) | drift de documentação corrigido | **Sim**, já está em `schema.sql` linha 131 | já contido no schema.sql | Sim (`if not exists`) |

**Achado ALTO** — não existe ordem de aplicação automatizada/versionada
para `fix-signup-trigger.sql`/`search-v4-rpcs.sql`/`audit-hardening.sql`
em relação ao `schema.sql`; a ordem correta hoje só existe como
conhecimento tácito de quem escreveu os comentários dos arquivos. Isso é
risco real para provisionar um ambiente novo do zero (ex.: disaster
recovery), mas **não é um bloqueador do release atual**, já que o banco
de produção real já existe e já tem tudo aplicado — é dívida de
processo, não de dado.

### Migrações pendentes de aplicação real
**Nenhuma.** Verificado por introspecção read-only contra
`TEST_DATABASE_URL`:
- `follows_following_id_idx` — **já existe** no banco TEST.
- `username_changes` (tabela + índice `username_changes_user_date_idx`)
  — **já existe** no banco TEST.

**TEST MIGRATIONS CURRENT = SIM.**
**PROD MIGRATIONS CURRENT = UNKNOWN** (produção não foi checada nesta
fase — fora do escopo autorizado; ambas as adições de H1/E1 já eram
"apenas documentação de estado real", não mudança de schema nova, então
o risco de divergência é considerado baixo, mas não confirmado
diretamente).

### Plano de ordem de release (quando/se houver migração nova)
Hoje não há nenhuma migração pendente de execução. Caso surja uma no
futuro, a ordem correta observada no `schema.sql` é: schema base →
triggers/funções (`fix-signup-trigger.sql`) → RPCs de busca
(`search-v4-rpcs.sql`) → hardening (`audit-hardening.sql`) → novas
migrações incrementais (`create ... if not exists`, sempre idempotentes,
sempre commitadas antes do deploy do código que depende delas).

### Schema Drift
- **MÉDIO (achado do agente de rotas, requer confirmação antes do
  release)** — `schema.sql` declara
  `CHECK (event_type IN ('library_added','status_changed',
  'season_completed','series_completed','rewatch_started'))` para
  `activity_events`, mas `app/api/watch-history/route.ts` insere
  `event_type = 'watch_logged'`, valor **fora** dessa lista. Duas
  hipóteses, nenhuma confirmada nesta fase (seria preciso checar a
  constraint real do banco, o que não foi feito para não misturar
  introspecção com correção): (a) o `schema.sql` está desatualizado em
  relação a uma alteração aplicada direto no Neon — mesmo padrão de
  drift já visto e corrigido em E1 para `username_changes`; ou (b) todo
  `POST /api/watch-history` está falhando silenciosamente em produção
  com `23514 check_violation`, mascarado pelo tratamento de erro
  genérico. **Ação recomendada para I1: verificar a constraint real via
  introspecção read-only antes de decidir se é só documentação
  atrasada ou um bug ativo.**

---

## 8. Inventário de rotas / API + Auth Matrix + Privacy Matrix + Mutation Safety

(Consolidado do agente de pesquisa dedicado — rotas revisadas: todas as
~44 rotas de API e as 24 páginas principais.)

### 8.1 Achados críticos de mutação

**BLOQUEADOR — IDOR em `POST /api/account/import`**
(`app/api/account/import/route.ts`, blocos de `watch_entries` e
`activity_events`). O import de backup usa o `id` (UUID) vindo do
próprio arquivo JSON enviado pelo cliente como chave de
`ON CONFLICT (id) DO UPDATE SET user_id = EXCLUDED.user_id, ...`. Esses
mesmos IDs são expostos publicamente por outras rotas — `we.id` em
`GET /api/public-profile/[username]` (diário público) e `ae.id` em
`.../activity` (atividade pública). Um atacante pode coletar o `id` de
um registro de **qualquer usuário** cujo diário/atividade seja visível
(perfil público ou como seguidor), montar um "backup" forjado contendo
esse `id`, e o `UPSERT` reatribui a linha da vítima para
`user_id = atacante` — sobrescrevendo `rating`/`comment`/`metadata` de
outro usuário sem nunca checar que o registro já pertencia a ele antes
do upsert. Todas as ~30 outras rotas mutáveis do app corretamente
escopam por `WHERE ... AND user_id = $user`; esta é a única exceção
confirmada. **Ação para I1: gerar sempre um novo `id` no servidor
durante o import (ignorar o `id` do arquivo), ou validar
`WHERE id=... AND user_id=user.id` antes do upsert.**

**BLOQUEADOR — segredo HMAC hardcoded** — já detalhado no §3, confirmado
duplicado em dois arquivos pelo agente de forma independente.

**MÉDIO — bypass parcial do cooldown de username via
`POST/PATCH /api/auth/profile`** (`app/api/auth/profile/route.ts`,
branch de `UPDATE`). Diferente de `/api/profile/username` e
`/api/profile/showcase` (que checam `username_changes` nos últimos 30
dias e limitam a 2 trocas), este endpoint troca `username` diretamente
sem aplicar o cooldown nem gravar em `username_changes`. Hoje só é
chamado pela UI de signup, mas nada no servidor impede chamada direta
por um usuário autenticado para burlar o limite. **Ação para I1:
aplicar a mesma regra de cooldown, ou restringir esse endpoint a
criação inicial (sem permitir troca via este caminho).**

**BAIXO** — `GET /api/public-profile/[username]` não envolve o corpo
principal em `try/catch` (diferente de quase toda outra rota) — uma
falha de query cairia no handler de erro genérico do Next em vez da
resposta padronizada. Não é uma falha de segurança, é inconsistência de
tratamento de erro.

**BAIXO/POLIMENTO** — `personal_rating` em `POST/PATCH /api/library[,
/[id]]` não é validado explicitamente no handler (só pelo `CHECK` do
banco), diferente de `watch-history`/`episodes`/`reviews/scores`, que
validam a faixa 0–10 antes do INSERT. Produz erro 400 genérico em vez
de mensagem específica — não é falha de segurança.

### 8.2 Auth Matrix

Nenhum bypass de autenticação encontrado nas rotas de API — todas
checam `session.data.user.id` antes de tocar o banco, e o `user_id`/
`owner_id` é sempre derivado da sessão, nunca aceito do `body`/`query`
(exceto o caso do IDOR acima, que não é bypass de auth, é falha de
ownership check na chave de conflito). Rotas privadas de página
(`Library`, `Diary`, `Calendar`, `Stats`, `Retrospective`, `For You`,
`Settings`) redirecionam guest para `/login` via `proxy.ts`
`PRIVATE_ROUTES`. `Lists/[id]` é pública por padrão (decisão de
produto), gated por `is_public`/ownership na API.

### 8.3 Privacy Matrix

Confirmado, com evidência de código, que `profile_visibility`,
`activity_visibility`, `diary_visibility`, `lists_visibility`,
`likes_visibility`, `followers_visibility`/`following_visibility` são
todos respeitados **server-side** (não dependem de esconder no client)
em `app/api/public-profile/[username]/route.ts` e `.../activity/
route.ts`. Um achado de vazamento parcial, **BAIXO**: a contagem
agregada de seguidores/seguindo é sempre exposta, mesmo com o perfil
totalmente trancado (`!canView`) — não vaza identidade de ninguém, só
o número.

### 8.4 Invariantes de integridade de dados — todos revalidados com evidência de código

- Rating 0 válido — confirmado (`parseRating` trata só `null`/`""` como
  ausência de nota).
- `status='want'` não conta como assistido — confirmado (agregados
  filtram `IN ('watched','rewatching','rewatched')`).
- Season 0 (specials) não corrompe agregados — confirmado, guarda
  explícita `seasonNumber >= 1`.
- Episódios futuros/sem data não marcam `watched=true` — confirmado,
  valida `getEpisodeReleaseStatus === "released"` via TMDB antes de
  aceitar.
- Self-follow bloqueado — confirmado em app **e** `CHECK` de banco
  (dupla camada).
- Follows/list_items duplicados protegidos — confirmado via PK
  composta + `ON CONFLICT`.
- Regra de username — confirmado 3–24 caracteres (não 2; a regra de "2
  caracteres" do enunciado da tarefa corresponde na verdade ao nome
  mínimo de **listas**, corretamente aplicado em `lists/route.ts`) e
  cooldown de 2 trocas/30 dias — **exceto** o gap de `auth/profile`
  descrito no §8.1.

---

## 9. Links quebrados / 404 / Error Boundaries

- `app/not-found.tsx`, `app/error.tsx`, `app/global-error.tsx` existem
  no nível raiz, em PT-BR. Nenhum `not-found.tsx`/`error.tsx` por
  segmento (funcional via herança do boundary raiz, sem mensagem
  contextual por seção) — **BAIXO**, polimento, não bloqueador.
- Varredura completa de todos os `<Link href>`/`<a href>` internos:
  **nenhum link quebrado encontrado**, todos apontam para rotas reais.

---

## 10. Risco de Hidratação

**ALTO** — `app/library/page.tsx`: `viewMode` é inicializado por lazy
`useState` que lê `localStorage` quando `window` existe. No SSR sempre
é `"grid"`; na hidratação, se o usuário tiver preferência salva
(`"compact"`/`"list"`), o primeiro render do cliente diverge do HTML
gerado pelo servidor — mismatch de hidratação real e determinístico
para qualquer usuário recorrente que não use a view padrão. **Ação para
I1: mover a leitura de `localStorage` para dentro de `useEffect`, com
um segundo render/atualização pós-mount, ou usar
`suppressHydrationWarning` de forma consciente.**

**MÉDIO (×3, mesmo padrão)** — `new Date()`/`getFullYear()` chamados no
corpo do componente (não em `useEffect`) em `app/page.tsx`
(`startOfToday`, `daysUntil`), `app/discover/page.tsx` (lista de anos
do filtro) e `app/retrospective/page.tsx` (ano padrão do retrospecto).
Risco real mas de baixíssima frequência (só dispara mismatch se o
render SSR e a hidratação do cliente atravessarem a virada do dia/ano).
Não bloqueador, mas vale correção de baixo custo em I1.

---

## 11. Data/Timezone

**ALTO (×2)** — dois pontos usam `new Date().toISOString().slice(0,
10)` para decidir "qual é a data de hoje", o que captura a data em
**UTC**, não a data local do usuário:
- `lib/title-seasons.ts` (`getEpisodeReleaseStatus`) — um episódio pode
  aparecer como "released" até 3h antes de realmente ter "virado o
  dia" no horário de Brasília (UTC-3). Bug sistemático, não teórico.
- `app/api/tv/[id]/schedule/route.ts` (`todayKey`) — mesmo viés,
  usado para decidir o que é "hoje"/"próximo" no cronograma de
  episódios.

Em contraste, `app/calendar/page.tsx`, `app/diary/page.tsx` e
`app/page.tsx` (`parseDate`/`startOfToday`) usam corretamente
`getFullYear()/getMonth()/getDate()` (hora local) — o padrão correto já
existe no código, só não foi aplicado de forma consistente nesses dois
pontos. **Ação para I1: alinhar `getEpisodeReleaseStatus` e o schedule
da TV ao mesmo padrão de data local já usado em Calendar/Diary.**

**MÉDIO** — o campo "assistido em" em
`app/title/tv/[id]/season/[season]/episode/[episode]/page.tsx` também
usa `toISOString().slice(0,10)` (UTC) como valor padrão — mesma classe
de bug, impacto menor (é só o valor pré-preenchido, editável).

---

## 12. i18n / Strings em inglês / Typos

Varredura extensa em `app/**`/`components/**`: **nenhuma string de UI
em inglês encontrada**, nenhum typo óbvio de português identificado nos
arquivos varridos. **Sem achados.**

---

## 13. Estados vazios e de carregamento

Library, Lists, Stats, Calendar, Diary e Search têm tratamento explícito
de loading (spinner com `role="status" aria-live="polite"`) e de estado
vazio, com mensagens específicas em PT-BR. **BAIXO** — `calendar`,
`diary`, `stats`, `lists`, `ranking`, `retrospective`, `search`,
`settings`, `favorites`, `assistant` não têm `loading.tsx` de segmento
(Suspense automático do Next durante navegação inicial) — só
`discover`, `for-you`, `library` e `title/[type]/[id]` têm. Impacto
pequeno, já que o próprio componente entra com `loading: true`
internamente na maioria dos casos.

---

## 14. Metadata / SEO / Open Graph / Manifest

- Root layout (`app/layout.tsx`) tem metadata completo: title
  template, description, OG, Twitter, `robots: noindex` por padrão.
- `app/title/[type]/[id]/layout.tsx` tem `generateMetadata` dedicado
  (única rota pensada para indexação real, `robots: index:true`).
- **MÉDIO** — `app/collection/[id]`, `app/u/[username]` (perfil
  público) e `app/person/[id]` são `"use client"` sem `layout.tsx`
  próprio de metadata — herdam título/descrição genéricos e
  `noindex`. Notável para `/u/[username]`: um link colado em
  WhatsApp/Twitter mostra card genérico do app, não do perfil
  compartilhado.
- **BAIXO/MÉDIO** — `app/robots.ts` bloqueia `/collection/`
  explicitamente mas não lista `/u/` nem em `allow` nem em `disallow`
  — sinal contraditório com a tag `noindex` herdada nessas páginas.
- `app/manifest.ts` existe (nome, cores, `lang: pt-BR`), mas **não
  define `icons`**, e **não há nenhum arquivo de favicon/ícone PWA no
  projeto** (`icon.*`, `apple-icon.*`, `favicon.ico` ausentes) —
  **BAIXO**, o app roda hoje sem favicon.
- `app/sitemap.ts` existe e é consistente com `robots.ts`.

Nenhum destes é um bloqueador de release — são polimento/SEO de
produto, candidatos naturais a I1 "SHOULD" ou a uma fase futura
dedicada, não a um bloqueador técnico.

---

## 15. Warnings de console conhecidos

- `<Image fill>` está centralizado em `components/Poster.tsx` e
  `ProviderLogo.tsx`, ambos documentando a dependência de
  `position: relative` no pai — nenhum uso solto fora desses
  componentes encontrado. Risco residual **BAIXO**.
- Nenhuma lista de dados reais usa `key={index}` (só skeletons
  estáticos de contagem fixa, que não reordenam — inofensivo).
- `app/calendar/page.tsx` usa uma tag `<img>` crua (não `next/image`) —
  consistente com uma dívida técnica já documentada no próprio
  `Poster.tsx` ("45 tags `<img>` cruas em 18 arquivos"), não gera
  warning por si, é oportunidade de otimização já mapeada, fora do
  escopo de I0/I1.
- CSP inline-style e o warning de `<Image fill>`+`position:static`
  observados durante QA de H1 são pré-existentes e não
  release-blocking (já registrados em fases anteriores).

---

## 16. Cobertura de runtime consolidada (E1–H1) vs. gaps abertos

**Já coberto com evidência real de execução** (não é reafirmação sem
verificação): fluxos de biblioteca/rating/review/episódio, follow/
perfil/social, stats/calendar/notificações, motion/reduced-motion,
mobile/touch-target/safe-area, teclado (foco/setas/Escape em menus e
diálogos), autenticação real via signup Playwright, mutações reais
contra `TEST_DATABASE_URL`, network (paginação real, sem full-fetch),
performance (concorrência limitada no Calendar).

**Gaps abertos que I1 precisa fechar** (não fabricados, apenas listados
como pendentes): teste runtime real do fluxo de `account/import` (o
bug de IDOR foi encontrado por leitura de código, não por exploração
ao vivo), teste runtime do cenário de troca de username via
`auth/profile`, confirmação da constraint real de `activity_events`
no banco, verificação visual do card de Open Graph de `/u/[username]`
compartilhado, smoke test dos 8 journeys críticos definidos no §20.

---

## 17. Deployment / Runbook conceitual

- Sem `vercel.json` — Vercel usa detecção automática de Next.js. Sem
  `.nvmrc`/`engines.node` — versão de Node depende do dashboard da
  Vercel (README pede Node 20+, mas isso não é reforçado por config).
- Ordem conceitual de deploy (não executada): (1) garantir schema —
  ver ressalva do §7 sobre `fix-signup-trigger.sql`/`search-v4-rpcs.sql`/
  `audit-hardening.sql` não terem ordem automatizada; (2) garantir que
  as tabelas `search_*` estão populadas (processo separado, via
  `scripts/build-universal-index-v4.mjs`, ~900k linhas segundo
  comentário do próprio schema); (3) variáveis de ambiente configuradas
  na Vercel **antes** do build, incluindo `NEON_AUTH_COOKIE_SECRET` real
  (não o fallback); (4) `npm run build`; (5) deploy; (6) smoke test
  pós-deploy.
- Nenhuma API deprecated do Next/Vercel encontrada no código (busca
  negativa, App Router puro, `proxy.ts` é o nome correto e esperado
  para Next 16.3.1, não uma dívida).
- Verificação de fallback perigoso para produção em scripts/testes:
  **não encontrado** — `lib/db/neon.ts` e os scripts de teste abortam
  explicitamente se a variável de banco esperada estiver ausente, em
  vez de cair silenciosamente para `DATABASE_URL` de produção.
  **PROD SAFETY = sem achado de risco confirmado nesta verificação.**

### Smoke test pós-deploy (plano para I1, não executado agora)
Home, Login/Signup/Logout, Search, Title (filme/série + temporada/
episódio), Library, Lists, Profile (`/profile` + `/u/[username]` +
upload de avatar — único write path para Blob), Stats/Ranking/
Retrospective/Calendar/Diary, Discover/For You/Assistant (depende de
`GEMINI_API_KEY`), Favorites/Notifications/Follows, Account
export/delete/import (**testar com atenção redobrada após a correção
do IDOR do §8.1**).

### Estratégia de rollback
Nenhuma migração de schema nova está pendente nesta release (§7) — o
rollback de código é o caminho padrão da Vercel (reverter para o deploy
anterior). Se a correção do IDOR (§8.1) envolver mudança de schema
(ex.: nova coluna de auditoria), documentar isso explicitamente na I1
antes de aplicar.

---

## 18. Jornadas críticas do usuário (definidas para I1, não executadas em I0)

1. Guest navega → abre página de título.
2. Login → adiciona item à biblioteca.
3. Avalia/escreve review.
4. Progride episódios de uma série (incluindo specials/season 0).
5. Cria e usa uma lista personalizada.
6. Segue outro usuário → visualiza perfil.
7. Consulta Stats/Calendar.
8. Export/Import de backup — smoke seguro (**crítico após a correção do
   §8.1**).

---

## 19. Resumo por severidade

- **BLOQUEADOR (2):** IDOR em `POST /api/account/import` (§8.1);
  segredo HMAC hardcoded duplicado em `proxy.ts` + `lib/auth/server.ts`
  (§3).
- **ALTO (5):** dependência de produção em beta
  (`@neondatabase/auth`) + transitiva não usada (`auth-ui`) (§6);
  ausência de ordem de migração automatizada para os `.sql` avulsos
  (§7); mismatch de hidratação real em `viewMode` da Library (§10);
  bug de fuso UTC-vs-local em `getEpisodeReleaseStatus` e no schedule
  de TV (§11).
- **MÉDIO (6):** bypass parcial de cooldown de username via
  `auth/profile` (§8.1); possível drift de `CHECK` em
  `activity_events.event_type` (§7); combinação nova
  TypeScript 6/Next 16 sem histórico extenso (§6); resíduo de
  nomenclatura "Supabase" (§6); metadata/OG ausente em `/u/[username]`
  e `/collection/[id]` (§14); mismatches de hidratação de baixa
  frequência em `new Date()`/`getFullYear()` no corpo de 3 componentes
  (§10).
- **BAIXO (multiple):** ver detalhamento nos §4, §8.1, §9, §13, §14,
  §15.
- **POLIMENTO:** sem achados de i18n/typo (§12); ausência de favicon/
  ícone PWA (§14).

---

## 20. Proposta de escopo para I1

**MUST (bloqueia release):**
- Corrigir o IDOR de `POST /api/account/import` (§8.1).
- Remover o fallback hardcoded de `NEON_AUTH_COOKIE_SECRET` em
  `proxy.ts` e `lib/auth/server.ts`, confirmar a variável real
  configurada em produção, rotacionar o segredo (§3).
- Aplicar cooldown de username também em `auth/profile`, ou restringir
  esse endpoint a criação inicial (§8.1).
- Confirmar (introspecção read-only) se `activity_events.event_type`
  no banco real aceita `'watch_logged'` — corrigir `schema.sql` (drift
  de documentação) ou corrigir o código, o que for o caso real (§7).
- Corrigir o mismatch de hidratação do `viewMode` na Library (§10).
- Corrigir o viés de fuso (UTC vs. local) em `getEpisodeReleaseStatus`
  e no schedule de TV (§11).
- Executar e validar a matriz final de jornadas críticas (§18) e o
  smoke test pós-deploy (§17), com atenção redobrada ao fluxo de
  import corrigido.

**SHOULD (polimento seguro, sem mudança de arquitetura):**
- `generateMetadata`/OG dedicado para `/u/[username]` e
  `/collection/[id]` (§14).
- Corrigir `app/robots.ts` para incluir `/u/` de forma consistente com
  a tag `noindex`/`index` desejada.
- Adicionar favicon/ícones ao manifest (§14).
- Corrigir os 3 pontos de `new Date()`/`getFullYear()` no corpo de
  componente (§10).
- Adicionar `loading.tsx` de segmento nas rotas que ainda não têm
  (§13).
- Avaliar remoção/override da dependência transitiva não usada
  `@neondatabase/auth-ui` (§6).
- Documentar `TEST_DATABASE_URL`/`TEST_NEON_AUTH_BASE_URL`/
  `V4_DB_BATCH_SIZE`/`V4_MAX_CAST`/`V4_PAGE_BLOCK` em `.env.example`
  (§4).

**DEFER (fora do escopo de I1, sem exceção):** novas features, reescrita
de arquitetura, novas features sociais, conquistas/achievements,
compartilhamento, notificações por e-mail, React Bits, novo motor de
recomendação, virtualização global de listas, indexação especulativa
(trigram), upgrades gerais de dependência (incluindo tirar
`@neondatabase/auth` do beta — isso é decisão de produto/terceiros, não
técnica desta fase), consolidação do sistema de migração `.sql` avulso
num framework formal (é dívida real, mas não bloqueia este release).

---

## 21. Decisões de produto necessárias (máximo 10, só as que bloqueiam I1/release)

1. Confirmar se `activity_events.event_type='watch_logged'` é uma
   constraint que precisa ser adicionada ao `schema.sql` (mais
   provável) ou se o código precisa mudar o valor inserido — decisão
   técnica, mas precisa de introspecção real do banco de produção
   antes (§7).
2. Decidir se `/u/[username]` deve ser indexável por buscadores
   (impacta `robots.ts` + metadata) — decisão de produto/privacidade,
   não só técnica (§14).
3. Confirmar se `BACKUP_FINAL_DATABASE_URL` em `.env.local` ainda é
   necessária ou pode ser removida (§4).
4. Confirmar se a rotação do segredo `NEON_AUTH_COOKIE_SECRET` em
   produção (recomendada no §3) pode ser feita sem invalidar sessões
   ativas de forma inaceitável para o usuário, ou se isso precisa ser
   comunicado/agendado.

---

## 22. Critérios objetivos de release gate (definidos aqui, avaliados em I1)

Release só é considerado pronto quando, simultaneamente: `npm run
check` verde, `npm run build` verde, `git diff --check` verde, 0
achados BLOQUEADOR remanescentes, 0 achados ALTO remanescentes sem
decisão explícita de aceitar o risco, todas as 8 jornadas críticas do
§18 passando manualmente, plano de migração válido (§7),
nenhum artefato temporário de QA remanescente, nenhum processo próprio
de QA ainda rodando, nenhum vazamento de segredo remanescente (§3),
e a verificação de PROD SAFETY do §17 reconfirmada. **Esta fase (I0)
não declara release pronto** — essa declaração é exclusiva da I1, após
os MUSTs do §20 serem resolvidos.

---

## 23. Execução desta fase (I0)

- `npm run check` (typecheck + lint): a rodar antes do fechamento desta
  fase, ver relatório final.
- `npm run build`: idem.
- `git diff --check`: idem.
- `git status --short` / `git diff --stat`: sem alterações de código
  nesta fase (só a criação deste documento e a atualização do roadmap).
- Nenhum artefato temporário de QA restante (script de introspecção do
  Postgres usado no §7 foi criado e removido dentro do mesmo passo).
- Nenhum processo próprio (servidor dev, etc.) foi iniciado nesta fase
  — toda a investigação foi estática (leitura de código, grep,
  introspecção read-only via `TEST_DATABASE_URL`).
