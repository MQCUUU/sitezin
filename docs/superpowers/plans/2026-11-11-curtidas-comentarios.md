# Curtidas e comentários em avaliações — plano de implementação

> **Para agentes:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para executar tarefa por tarefa. Passos com caixas (`- [ ]`).

**Objetivo:** permitir curtir e comentar avaliações. A lista do título mostra só os números, e a página `/review/[id]` mostra a avaliação com os comentários.

**Arquitetura:**
- Duas tabelas novas: `review_likes` e `review_comments`.
- Uma regra de acesso pura, em `lib/reviews/access.ts`, decide quem vê, curte e comenta, reaproveitando `canViewSection`.
- Rotas em `app/api/reviews/[id]/…`.
- Avisos em `lib/notifications/reviews.ts`.
- A página nova usa `TitleBand`.

**Stack:** Next 16, React 19, TypeScript, Neon (`getDb`), CSS com tokens `--mc-*`, `node:test` e Playwright.

**Spec:** `docs/superpowers/specs/2026-11-11-direcao-curtidas-indicacoes-design.md`, seção 2.

## Restrições globais

- PT-BR. Sem commit, push, deploy ou SQL no PROD sem pedido explícito; as migrations rodam só no TEST (`npm run db:migrate`, que usa `DATABASE_URL` = TEST).
- Nunca imprimir valores de `.env*`, tokens ou cookies.
- Antes de editar `app/`, `components/` ou `styles/`, carregar `frontend-design:frontend-design` e `mycatalog-design-system`. Para as rotas e o banco, carregar `security-review`.
- Identidade Projeção:
  - sem cards, eyebrows, "·" ou "→";
  - âmbar só no que é seu ou está selecionado (coração curtido, nota);
  - botão principal branco;
  - fio entre blocos.
- Respostas pessoais com `Cache-Control: private, no-store`. Recurso alheio ou inexistente responde 404, nunca 403 (mesma política de `tests/api-authz.spec.ts`).
- Sessão nas rotas: `getRouteSession()` + `sessionUnavailableResponse()` + `naoAutenticado()`, como em `app/api/follows/route.ts`. Erros com `respostaDeErro` e `entradaInvalida` de `lib/api-error.ts`.
- `lib/` sem import de valor `.ts` entre arquivos (TS5097).
- Comentário: de 1 a 500 caracteres após `trim`. Curtir: 60 por minuto. Comentar: 10 por minuto, com `takeToken(\`reviewLike:${userId}\`, 60, 60_000)` e `takeToken(\`reviewComment:${userId}\`, 10, 60_000)`; quando bloquear, 429 com `Retry-After`.
- Os E2E usam a conta A (fixture `request`) e a conta B (`credentialsB()` + `loginContext()` de `tests/api-helpers.ts`). O título 389 é exclusivo deste plano.

## Foco da revisão

1. **Visibilidade herdada.** Uma avaliação com `reviews_visibility = 'followers'` vista por quem não segue o autor responde 404 em `/api/reviews/[id]`, `/like` e `/comments`, e os números não vazam. Teste: E2E com B depois de deixar de seguir A.
2. **Nota sem texto.** Uma avaliação só com nota e `ratings_visibility = 'private'` não existe para os outros (404). A regra de acesso pura cobre esse caso.
3. **Repetição.** Curtir duas vezes conta uma; descurtir sem ter curtido responde `liked: false` sem erro.
4. **Comentário vazio ou só com espaços.** A API responde 400 e o CHECK do banco também barra.
5. **O dono apaga o comentário de outra pessoa.** É permitido. Uma terceira pessoa tentando apagar recebe 404.

---

### Tarefa 1: migration `0009_review_social`

**Arquivos:**
- Criar: `db/migrations/0009_review_social.sql`.
- Modificar: `scripts/test-db-migrations.mjs`.

- [ ] **Passo 1: escrever os testes que falham** em `scripts/test-db-migrations.mjs`
  - `"0009 cria review_likes e review_comments com cascata"`. Verifica no texto das migrations:
    - `CREATE TABLE` das duas tabelas;
    - `ON DELETE CASCADE` em `library_item_id` e `user_id` das duas;
    - o CHECK `BETWEEN 1 AND 500`.
  - `"notifications aceita os tipos sociais novos"`. O último `notifications_type_check` contém `review_like`, `review_comment`, `recommendation_received` e `recommendation_result`, sem perder os seis tipos anteriores.
  - `"notification_preferences ganha review_comment_site"`.
- [ ] **Passo 2: rodar e ver falhar**
  - Comando: `node --experimental-strip-types --test scripts/test-db-migrations.mjs`
  - Esperado: FAIL nos três testes novos.
- [ ] **Passo 3: escrever a migration** seguindo a spec (tabelas, índices, CHECK, preferência). Detalhes:
  - Tudo com `IF NOT EXISTS`, idempotente como a `0004`.
  - O CHECK de `notifications` é refeito com `DROP CONSTRAINT IF EXISTS` + `ADD CONSTRAINT`, listando os dez tipos.
  - Se as tabelas `public.*` existentes tiverem RLS habilitado na baseline, habilitar nas novas do mesmo jeito. O teste de RLS do `test-db-migrations` diz o padrão esperado.
- [ ] **Passo 4: rodar e ver passar**
  - Mesmo comando. Esperado: PASS.
- [ ] **Passo 5: aplicar no TEST**
  - Comando: `npm run db:migrate`.
  - Esperado: aplica `0009` e nenhuma menção a PROD na saída.
  - Depois, `npm run db:rebuild-check`. Esperado: TEST igual ao esquema recriado.
- [ ] **Passo 6: commit (só se o usuário pedir)**
  - Mensagem: `Avaliações: tabelas de curtidas e comentários`

### Tarefa 2: regra de acesso e textos (puros)

**Arquivos:**
- Criar: `lib/reviews/access.ts`.
- Teste: `scripts/test-review-social.mjs`.

**Interfaces:**
- Produz:
  - `export type ReviewRow = { owner_id: string; visibility: unknown; is_public: unknown; activity_visibility: unknown; ratings_visibility: unknown; reviews_visibility: unknown; rating: number | null; review: string | null }`
  - `export function reviewAccess(row: ReviewRow, viewer: { id: string | null; followsOwner: boolean }): { visible: boolean; rating: number | null; review: string | null; isOwner: boolean; canComment: boolean; canLike: boolean }`
    - `visible` exige nota ou texto visível pelo `canViewSection` (com o fallback `?? activity_visibility`, igual a `visibleCommunityReviews`).
    - `canComment = visible && viewer.id !== null`.
    - `canLike = canComment && !isOwner`.
    - O dono sempre vê a própria avaliação.
  - `export function canDeleteComment(comment: { user_id: string }, reviewOwnerId: string, viewerId: string | null): boolean`
  - `export function normalizeCommentBody(raw: unknown): string | null` (string após `trim`, com 1 a 500 caracteres, ou `null`).
  - `export function likeNoticeCopy(actorName: string, total: number, titleName: string): string`
    - total 1: `"Caio curtiu sua avaliação de Interestelar"`;
    - total 2: `"Caio e mais 1 pessoa curtiram sua avaliação de Interestelar"`;
    - total 6: `"Caio e mais 5 pessoas curtiram sua avaliação de Interestelar"`.
- `canViewSection` entra com `import { canViewSection } from "@/lib/social/visibility";`, o mesmo import de `lib/reviews/community.ts` (linha 15). O alias `@/`, sem extensão `.ts`, não dispara a TS5097.

- [ ] **Passo 1: escrever os testes que falham**
  - Casos de `reviewAccess`:
    - visitante e perfil público → `visible`, mas não curte nem comenta;
    - logado e perfil público → curte e comenta;
    - dono → `visible`, comenta, não curte;
    - `reviews_visibility = "followers"`, sem seguir → só a nota fica visível, se `ratings_visibility = "profile"`;
    - as duas privadas → `visible: false`;
    - nota `null` e texto `"   "` → `visible: false`.
  - Casos de `canDeleteComment`: autor sim, dono da avaliação sim, terceiro não, visitante não.
  - Casos de `normalizeCommentBody`:
    - `"  oi "` → `"oi"`;
    - `""`, `"   "`, 501 caracteres, `null` e `42` → `null`;
    - exatamente 500 caracteres passa.
  - `likeNoticeCopy`: os três totais acima.
- [ ] **Passo 2: rodar e ver falhar**
  - Comando: `node --experimental-strip-types --test scripts/test-review-social.mjs`
  - Esperado: FAIL, porque o módulo não existe.
- [ ] **Passo 3: implementar** `lib/reviews/access.ts`.
- [ ] **Passo 4: rodar e ver passar**
  - Mesmo comando. Esperado: PASS.
- [ ] **Passo 5: commit (só se o usuário pedir)**
  - Mensagem: `Avaliações: regra de acesso para curtir e comentar`

### Tarefa 3: rotas e avisos

**Arquivos:**
- Criar:
  - `lib/reviews/load.ts` (SQL: carrega a avaliação com o perfil do dono e a relação com quem pede);
  - `lib/notifications/reviews.ts`;
  - `app/api/reviews/[id]/route.ts`;
  - `app/api/reviews/[id]/like/route.ts`;
  - `app/api/reviews/[id]/comments/route.ts`;
  - `app/api/reviews/[id]/comments/[commentId]/route.ts`.
- Modificar:
  - `lib/reviews/community.ts`: o SELECT traz `li.id`, `like_count`, `comment_count` e `liked_by_viewer` (subconsultas `count(*)` e `EXISTS`), e os itens expõem esses campos;
  - `scripts/test-community-reviews.mjs`: o `row()` passa a ter `id`, e um teste confere que `id` e as contagens chegam aos itens.
- Teste: `tests/review-social.spec.ts`.

**Interfaces:**
- Consome: `reviewAccess`, `canDeleteComment`, `normalizeCommentBody` e `likeNoticeCopy` (Tarefa 2).
- Produz:
  - `loadReview(sql, id: string, viewerId: string | null): Promise<{ row: ReviewRow & { id: string; media: { media_type: "movie" | "tv"; tmdb_id: number; title: string; backdrop_path: string | null }; owner: { username: string; display_name: string | null; avatar_url: string | null } }; followsOwner: boolean } | null>`
    - Devolve `null` se o id não for um uuid válido ou não existir.
  - Respostas da API:
    - `GET /api/reviews/[id]` → `{ id, owner, media, rating, review, like_count, comment_count, liked_by_viewer, can_comment, can_like, is_owner }`
    - `POST` e `DELETE /api/reviews/[id]/like` → `{ liked: boolean, like_count: number }`
    - `GET /api/reviews/[id]/comments?cursor=<iso>` → `{ items: Comment[], next_cursor: string | null }`
      - `Comment = { id, body, created_at, author: { username, display_name, avatar_url }, can_delete }`
      - Páginas de 20, `ORDER BY created_at ASC, id ASC`, com o cursor em `created_at`.
    - `POST /api/reviews/[id]/comments` com `{ body }` → 201 `Comment`.
    - `DELETE /api/reviews/[id]/comments/[commentId]` → 204.
  - `notifyReviewLike(sql, { reviewId, ownerId, actorId, actorName, titleName })` usa `ON CONFLICT (user_id, event_key) DO UPDATE SET message = EXCLUDED.message, title = EXCLUDED.title, read_at = NULL, created_at = now()`. Com `review_like_site = false`, não grava nada.
  - `notifyReviewComment(sql, { commentId, reviewId, ownerId, actorId, actorName, titleName })` usa `DO NOTHING`, respeita `review_comment_site` e não roda quando `actorId === ownerId`.

- [ ] **Passo 1: escrever os E2E que falham** (`tests/review-social.spec.ts`, `serial`)
  - **`beforeAll`:**
    - A cria o título 389 `watched` com resenha `MARK` e nota 8.
    - B segue A (`POST /api/follows { username }`). Se a resposta indicar pendente, A aceita (`PATCH /api/follows { follower_id, action: "accept" }`).
  - **`afterAll`:** remove o item de A (a cascata limpa curtidas e comentários) e B deixa de seguir A.
  - **Testes:**
    - `"lista do título traz id e contagens"`: o item de A em `GET /api/reviews/community?type=movie&tmdb_id=389`, visto por B, tem `id`, `like_count: 0` e `comment_count: 0`.
    - `"B curte, curtir de novo não duplica, descurtir volta"`: `like_count` vai de 1 para 1 e depois para 0.
    - `"A não curte a própria avaliação"`: `POST like` como A → 404 ou 400, e `can_like: false` no GET.
    - `"B comenta e A vê; vazio é recusado"`:
      - `POST` com `"   "` → 400;
      - `POST` com `"bom"` → 201;
      - o GET de A lista o comentário, com `comment_count: 1`;
      - a lista do título não traz o texto do comentário.
    - `"A apaga o comentário de B"` → 204, e `comment_count` volta para 0.
    - `"id inexistente e uuid malformado dão 404"`: `RANDOM_UUID` e `"abc"`.
    - `"aviso de curtida agrupado"`: depois de B curtir, `GET /api/notifications` de A contém um item `type: "review_like"` com a mensagem de `likeNoticeCopy`.
- [ ] **Passo 2: rodar e ver falhar**
  - Comando: `PLAYWRIGHT_BASE_URL=http://localhost:3991 npx playwright test tests/review-social.spec.ts --project=setup --project=chromium`
  - Esperado: FAIL, porque as rotas não existem.
- [ ] **Passo 3: implementar**
  - `loadReview`, as rotas e os avisos.
  - O nome usado nos avisos é `display_name ?? @username`.
  - O `href` dos avisos é `/review/<id>`.
  - O `community.ts` passa a expor os campos novos.
- [ ] **Passo 4: rodar e ver passar**
  - O comando do Passo 2 → 7 passed.
  - `npm test` → verde, incluindo `test-community-reviews`.
- [ ] **Passo 5: commit (só se o usuário pedir)**
  - Mensagem: `Avaliações: APIs de curtir e comentar, com avisos`

### Tarefa 4: coração e balão na aba Avaliações do título

**Arquivos:**
- Modificar: `components/title/TitleCommunityReviews.tsx`:
  - `ReviewCard` (linhas ~133–185);
  - a `key`, que passa a ser `r.id`;
  - o tipo `CommunityReview`.
- Modificar: o CSS onde estão as classes `title-community-*` (procurar com `grep -rn "title-community-card" styles app`).

**Interfaces:**
- Consome: os campos novos de `/api/reviews/community` (Tarefa 3) e `POST`/`DELETE /api/reviews/[id]/like`.

- [ ] **Passo 1: implementar**
  - **Ações** embaixo de cada avaliação, numa linha `title-community-actions`:
    - Botão de curtir: `aria-pressed`, `aria-label="Curtir avaliação de {nome}"`, ícone `Heart` do lucide e o número.
    - Link do balão: `MessageCircle` e o número, `href="/review/{id}"`, `aria-label="{n} comentários, abrir avaliação"`.
    - O texto da resenha também vira link para a página.
  - **Curtir:**
    - é otimista e, no erro, volta atrás com `useToast()` dizendo "Não foi possível curtir agora.";
    - sem sessão, o botão leva a `/login` com o retorno, como os outros pedidos de login do título.
  - **Âmbar** só quando curtido: coração preenchido (`fill="currentColor"`) em `var(--mc-color-accent)`.
  - **Movimento:** um `scale` de 0.9 para 1 no coração em 160 ms `cubic-bezier(0.23, 1, 0.32, 1)`, só ao curtir, e nenhum com `prefers-reduced-motion`. Os comentários nunca aparecem na lista.
- [ ] **Passo 2: conferir no navegador**
  - Página `/title/movie/389`, logado como a conta E2E.
  - Curtir e descurtir mudam o número sem recarregar.
  - O balão abre `/review/{id}` (página da Tarefa 5).
  - Larguras de 320 a 1440 px sem rolagem horizontal; foco visível no teclado.
- [ ] **Passo 3: `npm run check`** → verde.
- [ ] **Passo 4: commit (só se o usuário pedir)**
  - Mensagem: `Avaliações: curtir e contar comentários na lista do título`

### Tarefa 5: página `/review/[id]`

**Arquivos:**
- Criar:
  - `app/review/[id]/page.tsx`: servidor, `generateMetadata` com "Avaliação de {nome} para {título}" e 404 com `notFound()` quando `loadReview` + `reviewAccess` negam;
  - `components/review/ReviewView.tsx`: cliente, com curtir, a lista de comentários, "Mais comentários", o campo e o apagar;
  - `styles/features/review.css`: prefixo `rv-`.
- Teste: em `tests/review-social.spec.ts`, acrescentar `"página da avaliação mostra comentários e deixa comentar"`.
  - Como B:
    - `page.goto("/review/{id}")`;
    - `h1` contém "Avaliação de";
    - `.rv-band .tt-band-screen` visível;
    - preencher `getByLabel("Escreva um comentário")` e clicar em `getByRole("button", { name: "Comentar" })`;
    - o comentário aparece em `.rv-comments`.
  - Como visitante (`guestContext`): vê "Entre para comentar".

**Interfaces:**
- Consome: `loadReview` e `reviewAccess` (no servidor), e as rotas da Tarefa 3 (no cliente). `TitleBand` vem de `@/components/title/hero/TitleBand`, com `path={media.backdrop_path}`.

- [ ] **Passo 1: escrever o E2E que falha.** Rodar e ver FAIL (página 404).
- [ ] **Passo 2: implementar**
  - **Página, em ordem:**
    - `.rv-band` com `TitleBand`;
    - `h1` "Avaliação de {nome} para {título}", com links para `/u/{username}` e `/title/{type}/{tmdb_id}`;
    - nota grande em âmbar, condensada (`font-weight: 770; font-variation-settings: "wdth" 70`);
    - texto inteiro;
    - linha de curtir;
    - `.rv-comments` com os itens separados por fio;
    - formulário com `<textarea>` com label "Escreva um comentário", contador "n/500" e o botão branco (`Button` do projeto) "Comentar".
  - **Comportamento:**
    - Enviar desabilita o botão até a resposta; em erro, mostra a mensagem embaixo do campo.
    - "Apagar" é um controle de texto, aparece só com `can_delete` e pede confirmação com o `ConfirmProvider`.
  - **Estados:** esqueleto ao carregar a lista; erro com "Tentar de novo".
- [ ] **Passo 3: rodar o E2E e ver passar.**
- [ ] **Passo 4: conferir no navegador**
  - 320, 375, 768, 1024 e 1440 px.
  - Teclado: Tab chega ao curtir, ao campo, ao Comentar e ao Apagar.
  - Console sem erro novo.
  - `prefers-reduced-motion` sem animação do coração.
- [ ] **Passo 5: commit (só se o usuário pedir)**
  - Mensagem: `Avaliações: página da avaliação com comentários`

### Tarefa 6: preferências de aviso e exportação

**Arquivos:**
- Modificar:
  - `app/api/profile/notifications/route.ts`: `review_comment_site` nos defaults, no SELECT e no UPSERT;
  - `components/NotificationSettings.tsx`: interruptores "Curtidas nas suas avaliações" (`review_like_site`) e "Comentários nas suas avaliações" (`review_comment_site`), no padrão dos que já existem;
  - `app/api/account/export/route.ts`: acrescentar `review_comments` (os seus) e `review_likes` (as suas) ao JSON exportado.
- Teste: em `tests/review-social.spec.ts`, acrescentar `"desligar aviso de comentário impede o aviso"`.
  - A faz `PATCH /api/profile/notifications { review_comment_site: false }`.
  - B comenta.
  - A não recebe `review_comment` novo.
  - No fim, a preferência volta para `true`.

- [ ] **Passo 1: escrever o E2E e ver falhar.**
- [ ] **Passo 2: implementar.**
- [ ] **Passo 3: ver passar.**
  - Conferir também `GET /api/account/export` como A: contém a chave `review_comments`.
- [ ] **Passo 4: commit (só se o usuário pedir)**
  - Mensagem: `Avaliações: preferências de aviso e exportação`

### Tarefa 7: verificação final

- [ ] `npm run check`, `npm test`, E2E completo e `npm run build` (apagar `.next` antes).
- [ ] Esperado: tudo verde e um único teste ignorado.
- [ ] A migration no PROD fica para quando o usuário pedir a publicação.
