# D0 — Auditoria de Library & Organization

**Data:** 2026-09-27
**Escopo:** auditoria read-only de produto e arquitetura. Nenhum código de
produto, banco, rota ou comportamento foi alterado. Fase C encerrada em
`cb3985a fix(title): close final media experience QA`; checkpoint inicial
estava limpo.

> **Status: D0 = DONE, D1 = DONE. Fase D encerrada.** A implementação de
> D1 (consolidação completa a partir da proposta da seção 35) está
> documentada em
> [`docs/PREMIUM-UI-V2.md` § 27](./PREMIUM-UI-V2.md#27-fase-d1--library--organization-consolidation-done).
> As seções abaixo permanecem como registro fiel do estado encontrado
> **antes** de D1 — não foram reescritas para refletir o pós-D1, exceto
> onde indicado.

## 1. Executive Summary

A Library não parte do zero — é uma experiência já bem desenvolvida:
página dedicada com paginação real server-side, filtros, busca, sort,
três modos de visualização, favoritos, status, nota pessoal e Quick Peek
compartilhado, tudo isso reaproveitando a fundação `PosterGrid`/
`MediaPreviewDialog` da Fase C sem duplicar card/modal.

O achado mais importante desta auditoria não é sobre a página de
biblioteca em si, mas sobre **organização (Lists/Tags/Reviews)**: existe
uma quantidade significativa de **schema drift** — até três gerações
diferentes de tabelas para o mesmo conceito (tags, listas, avaliações por
categoria) — e duas features inteiras (**Custom Lists** e **Tags**) com
backend completo (CRUD, ownership, RLS) e **zero UI real** para
adicionar um título a uma lista ou aplicar uma tag a qualquer coisa. O
sistema de avaliação por categoria (`ReviewPanel`) tem UI real e rica,
mas seu resultado calculado nunca é persistido de volta em
`personal_rating` — divergindo silenciosamente do valor usado em
Ranking/Stats/badges em todo o resto do app.

Performance: **quatro páginas** (Home, Favorites, Ranking, Discover)
buscam a biblioteca inteira via `GET /api/library` sem paginação — a
própria rota, mesmo no modo `paginated=true`, busca todas as linhas do
Postgres e filtra/ordena/pagina inteiramente em memória no servidor. Isso
já está documentado nos comentários do próprio código (`app/favorites/
page.tsx`) como uma dívida conhecida e deliberadamente não resolvida.

### Prioridades consolidadas

| Classe | Achados |
|---|---|
| BLOCKER | Nenhum. |
| HIGH | `GET /api/library` sem `paginated=true` devolve a biblioteca inteira sempre (Home/Favorites/Ranking/Discover) — filtro/sort/paginação nunca viram SQL, sempre memória no servidor. |
| MEDIUM | Lists e Tags: backend completo, 0 UI para adicionar item/tag a nada; hooks `useLists`/`useTags` mortos e quebrados (chamam endpoint `[id]` inexistente); `ReviewPanel` modo "Detalhada" nunca escreve `personal_rating`, divergindo de Ranking/Stats/badges; `/library` (a página principal) não distingue erro de vazio, o mesmo bug que `/favorites` e `/ranking` já corrigiram explicitamente nos comentários do próprio código; URL state da Library é parcial e usa `window.history` manual em vez do padrão `useSearchParams` já estabelecido no Discover (Fase B). |
| LOW | Três gerações de tags/listas na tabela versionada, uma marcada "abandonada" no próprio comentário do schema mas ainda escrita pela API viva; `/api/reviews/route.ts` é cópia morta e idêntica de `/api/reviews/scores/route.ts`; `/api/rating-categories` (uma quarta geração de rating-by-category) tem 0 callers; `review_scores.category_id` sem `ON DELETE CASCADE` pode falhar ao apagar categoria com notas; status badge do card duplica `STATUS_LABELS` com wording divergente. |
| PRODUCT DECISION | Ver §36. |

## 2. Rotas reais mapeadas

| Rota | Server/Client | Fonte de dados | Auth | Estado |
|---|---|---|---|---|
| `/library` | Client (`"use client"`) | `GET /api/library?paginated=true&...` | Sessão exigida pela API; página não trata 401 distintamente | `useState` local, filtros parcialmente em URL |
| `/favorites` | Client | `GET /api/library` (sem params, biblioteca inteira, filtro `favorite` client-side) | idem | `useState` local |
| `/ranking` | Client | `GET /api/library` (sem params) | idem | `useState` local |
| `/u/[username]` (aba "lists") | Client | `GET /api/lists` (via ação `createList`; leitura vem de outro fetch da página, não auditado linha a linha) | Sessão para criar; leitura pode ser pública/perfil | `useState` local |
| `/collection/[id]` | Client | `GET /api/collection/[id]` + `GET /api/library` (para status de cada item) | Guest lê; ações exigem sessão | `useState` local |
| Title page, aba "Reviews" (`ReviewPanel`) | Client, montado condicionalmente | `GET/POST/PATCH/DELETE /api/reviews/categories`, `GET/POST/DELETE /api/reviews/scores`, `PATCH /api/library/[id]` | Só monta se `libraryItem` existir (implica sessão) | `useState` local |

Não existe página dedicada para: listas individuais (`/lists/[id]` ou
similar), tags (nenhuma rota), bulk actions.

## 3. Biblioteca atual (`app/library/page.tsx`, 2117 linhas)

- **Existe página dedicada**: sim, `/library`.
- **Títulos**: movie + tv, misturados, com filtro de tipo.
- **Grid/list**: três modos — `grid`, `compact`, `list` (`ViewMode`,
  `app/library/page.tsx:53-56`) — estado vive em `page.tsx`, mas a UI do
  seletor e a persistência em `localStorage` vivem dentro de
  `PosterGrid.tsx` (`components/PosterGrid.tsx:139`), não na página.
- **Paginação**: real, numerada, `PER_PAGE = 27`
  (`app/library/page.tsx:81-82`), com builder de páginas/ellipsis
  (`buildPages`, linhas 84-160). Não é infinite scroll.
- **Search**: existe, server-side (delegada à API), debounce 250ms
  (linhas 458-480), reseta para página 1.
- **Filters reais**: tipo (movie/tv/all), status, favorito, gênero, ano,
  nota pessoal mínima, nota TMDB mínima. Não existem filtros de
  progresso, rewatch, tags ou listas.
- **Sort real**: `added` (padrão), `updated`, `rating`, `rating-low`,
  `tmdb`, `az`, `za`, `newest`, `oldest` — 9 opções, `<select>`
  duplicado literalmente duas vezes no arquivo (toolbar rápida e painel
  avançado).
- **Empty state**: não tratado explicitamente — `data=[]` (seja por
  filtro sem resultado OU por falha de fetch) renderiza o mesmo grid
  vazio.
- **Loading**: um spinner único substituindo o grid inteiro.
- **Error**: **não existe estado de erro distinto** — falha de fetch cai
  em `setData([])`/`setTotalResults(0)` silenciosamente (só
  `console.error`), indistinguível de "nenhum resultado". Isso é
  exatamente o bug que os comentários de `app/favorites/page.tsx` e
  `app/ranking/page.tsx` descrevem ter corrigido nessas duas páginas —
  a página principal da Library nunca recebeu a mesma correção.
- **Responsive**: nenhuma lógica de breakpoint no arquivo — depende
  inteiramente de CSS externo (não auditado nesta D0, fica para D1
  runtime).
- **Quick Peek**: sim, via `PosterGrid` → `MediaPreviewDialog` (mesma
  infraestrutura compartilhada da Fase C, `components/media/preview/*`).
- **Actions inline**: favoritar, mudar status (menu com as 6 opções de
  `STATUS_LABELS` + remover), remover (com confirmação e "desfazer" via
  toast), nota pessoal (só dentro do Quick Peek). Todas implementadas em
  `PosterGrid.tsx`, não em `page.tsx`.

## 4. Status

Valores reais (`lib/types.ts:5-11`, `Status` type + `STATUS_LABELS`):

| Valor DB | Label UI | Observação |
|---|---|---|
| `want` | Quero assistir | |
| `watching` | Assistindo | |
| `watched` | Assistido | |
| `dropped` | Abandonei | |
| `rewatching` | Reassistindo | |
| `rewatched` | Reassistido | |

Não há distinção de status permitido por movie vs. tv no código —
os 6 valores estão disponíveis para qualquer tipo. Mudança é sempre
manual pelo menu de status em `PosterGrid`; não há transição automática
de status a partir de progresso de episódio nesta camada (isso é
tratado nas rotas `/api/episodes` da Fase C5, fora do escopo D0).

**Duplicação encontrada**: o badge de status no card
(`getStatus()`, `components/PosterGrid.tsx:1324-1377`) tem seu próprio
mapeamento hardcoded de label/ícone/classe por status, independente de
`STATUS_LABELS` — com wording diferente (`"ASSISTINDO"` maiúsculo vs.
`"Assistindo"` do menu). Duas fontes de verdade para o mesmo conceito.

## 5. Favorite

- Vive como coluna booleana em `library_items.favorite` (não é
  estrutura separada).
- Endpoint: `PATCH /api/library/[id]` com `{ favorite: boolean }`.
- UI: botão coração em `PosterGrid` (grid/list/compact) e dentro do
  Quick Peek (`extraActions`, injetado pelo `PosterGrid`, não parte do
  contrato genérico do `MediaPreviewDialog` — decisão deliberada da C2.4).
- Optimistic: sim — atualiza local antes do PATCH, reverte no erro,
  oferece "Desfazer" no sucesso.
- Filtro: `favorite=true` na Library (via API) e filtro client-side na
  página `/favorites` (que busca a biblioteca inteira, ver §27).

## 6. Watchlist / "Quero assistir"

`want`, "Quero assistir" e "watchlist" são **o mesmo conceito** — um dos
seis valores de `status` (`want`), não uma estrutura separada. Não há
tabela nem endpoint dedicado a "watchlist"; é só um filtro de status
como qualquer outro. Nenhuma reconciliação necessária — já é um único
conceito.

## 7. Personal Rating

- Coluna: `library_items.personal_rating numeric check (between 0 and
  10)`, nullable, sem default. Índice parcial
  `library_items_user_rating_idx (user_id, personal_rating desc) WHERE
  personal_rating IS NOT NULL`.
- Movie e TV: mesma coluna, sem distinção.
- Editado em pelo menos duas superfícies reais: `ReviewPanel` (modo
  "simples", Title page) e `PosterGrid` (Quick Peek, grids da Library/
  Collection) — ambas via `PATCH /api/library/[id]`.
- Sem exclusão dedicada — só `PATCH` com `personal_rating: null`
  (via `ReviewPanel`'s campo, não confirmado um botão "resetar" explícito
  no `PosterGrid`).
- Diferença de `vote_average` (TMDB): `personal_rating` é 0-10 pessoal
  do usuário; `vote_average` é a nota pública do TMDB, sempre exibida
  separadamente (ex. Related cards da C6, `TitleHero`).
- **Consumida amplamente**: Ranking (sort+display), Stats (agregação),
  PosterGrid (badge), PickForMe (lógica de escolha), for-you/discover/
  search (dados repassados), export/import de conta, public profile.

## 8. Reviews (avaliação por categoria)

- **Tabelas atuais** (`review_categories`, `review_scores`) — comentário
  no próprio `schema.sql` diz "geração ATUAL — em uso".
- Categorias são **por usuário, criadas pelo próprio usuário** — não há
  seed/categoria padrão em nenhuma migration; a primeira categoria criada
  recebe peso 100%, as seguintes 0% (sem UI para editar peso depois de
  criada, embora o endpoint PATCH suporte).
- `ReviewPanel.tsx` (835 linhas) tem dois modos: "simples" (edita
  `personal_rating` direto) e "detalhada" (sliders por categoria,
  `POST /api/reviews/scores`, upsert por `(library_item_id,
  category_id)`).
- **Achado real, não apenas dívida documentada**: o modo "detalhada"
  calcula uma média ponderada client-side (`calculatedRating`) e mostra
  como número grande no topo do painel, mas **nunca escreve esse valor em
  `personal_rating`** — só o modo "simples" faz o PATCH. Um usuário que só
  usa categorias vê uma nota "geral" na tela que nunca aparece no
  Ranking, no Stats "mais bem avaliados" nem nos badges de nota pelo
  resto do app, porque todos esses lugares só leem `personal_rating`
  (nunca `review_scores`/`review_categories`).
- `/api/reviews/route.ts` e `/api/reviews/scores/route.ts` são **cópias
  idênticas linha-a-linha**; só `/scores` tem caller real
  (`ReviewPanel`). `/api/reviews/route.ts` é código morto.
- `review_scores.category_id` referencia `review_categories.id` sem
  `ON DELETE CASCADE` — apagar uma categoria com notas associadas
  provavelmente falha por violação de FK (não testado em runtime nesta
  D0, comportamento inferido do DDL).
- Integrada à biblioteca? Só indiretamente — `ReviewPanel` só monta se
  `libraryItem` existe, mas o subsistema de categorias em si é
  desacoplado (não aparece em nenhuma tela de Library/Ranking/Stats).

## 9. Custom Lists

`CUSTOM LISTS EXIST = SIM`, mas com UI **drasticamente incompleta**.

- **Schema**: duas gerações vivas simultaneamente, mantidas em sync pela
  mesma API: `custom_lists`/`custom_list_items` (referencia
  `library_items`, exige que o título já esteja na biblioteca do
  usuário) e `lists`/`list_items` (referencia `movie_id` como texto cru,
  não depende de `library_items`). `POST /api/lists` escreve nas duas
  tabelas ao mesmo tempo; `GET` lê e mescla as duas.
- **APIs**: `GET/POST/PATCH/DELETE /api/lists` (CRUD completo da lista
  em si) e `GET/POST/DELETE /api/lists/items` (adicionar/remover/listar
  itens, com validação de ownership e privacidade — lista privada só
  visível ao dono, `403` se não for pública nem dono).
- **Ordering**: `custom_list_items.position` (inteiro, definido no
  insert); `list_items` ordena por `added_at`.
- **Public/private**: `lists.is_public` existe e é respeitado no GET de
  items (`403` se privada e não-dono); `custom_lists` não tem essa
  coluna.
- **Cover/description**: `description` existe em ambas as tabelas; não
  há coluna de capa/imagem dedicada em nenhuma — a UI do perfil não
  mostra nenhuma imagem de capa para a lista.
- **UI real encontrada**: só na aba "Listas" do perfil público
  (`/u/[username]`) — criar lista (nome, só o dono) e ver um card por
  lista (nome, descrição, contagem de itens). **Os cards não são
  clicáveis** (`<article>` puro, sem `<Link>`) — não existe página de
  detalhe de lista em lugar nenhum do app.
- **Adicionar um título a uma lista**: **não existe em NENHUM lugar da
  UI.** `POST /api/lists/items` tem zero callers confirmados fora da
  própria rota. Não há botão "Adicionar à lista" no Title page, no Quick
  Peek, na Library ou na Collection.
- **Editar/excluir lista**: o backend suporta (`PATCH`/`DELETE
  /api/lists`), mas não há UI que chame isso — o hook que tentaria fazer
  isso (`hooks/useLists.ts`) está morto e além disso quebrado: chama
  `PUT /api/lists/${id}` e `DELETE /api/lists/${id}`, mas a rota real é
  `PATCH /api/lists` (corpo com `id`, não path param) e não existe
  `app/api/lists/[id]/route.ts`.
- **Duplicatas**: `custom_list_items` tem PK composta
  `(list_id, library_item_id)` — inserir duas vezes faz
  `ON CONFLICT DO UPDATE position`, não duplica.
- **Ownership**: validado em toda escrita (`user_id = ${user.id}` em
  todas as queries).

## 10. Tags

`TAGS EXIST = SIM`, com UI **inexistente** (pior que Lists — nem
criação tem UI real).

- **Schema**: três gerações. `personal_tags`+`library_tags` (gen 1,
  referencia `library_items`); `tags`+`movie_tags` (o comentário do
  schema chama de "segunda geração, também abandonada" — mas a API
  VIVA `/api/tags` e `/api/tags/assign` escrevem ativamente nas DUAS
  gerações ao mesmo tempo, o que contradiz o rótulo "abandonada" do
  comentário — ver §32).
- **APIs**: `GET/POST/PATCH/DELETE /api/tags` (CRUD da tag),
  `POST/DELETE /api/tags/assign` (associar/desassociar tag a um
  `movie_id` cru ou a um `library_item_id`, com checagem de ownership da
  tag e do item).
- **UI**: **zero**. Nenhum componente em `app/` ou `components/`
  referencia `/api/tags` ou `/api/tags/assign` fora das próprias rotas
  e do hook morto `hooks/useTags.ts` (mesmo defeito do `useLists`: chama
  `PUT/DELETE /api/tags/${id}`, rota real é `PATCH /api/tags` sem
  `[id]`).
- **Filtering**: não existe filtro por tag em nenhuma tela (não poderia
  existir, já que não há como aplicar uma tag primeiro).

## 11. Filters (consolidado)

Únicos filtros reais confirmados, todos na Library:
`type (movie/tv/all)`, `status`, `favorite`, `genre`, `year`,
`min_rating` (pessoal), `min_tmdb_rating`. `genre`/`year` são
populados dinamicamente a partir do dataset completo do usuário
(computado em memória a cada request, ver §26).

## 12. Sort (consolidado)

`added` (padrão), `updated`, `rating`, `rating-low`, `tmdb`, `az`, `za`,
`newest`, `oldest` — só na Library. Ranking usa sort fixo (nota pessoal
decrescente, sem opção de trocar). Favorites não ordena (usa a ordem
que vier de `added_at DESC` da API).

## 13. Search

Só existe dentro da Library (`app/library/page.tsx`). Server-side
(delegado à API — o matching real de texto acontece em
`app/api/library/route.ts`, sobre `media.title`/`media.original_title`
em memória, case-insensitive, substring). Debounce 250ms client-side.
Não existe busca em Favorites, Ranking, nem nas listas/tags (que não
têm UI para isso de qualquer forma).

## 14. URL State

Inconsistente e parcial — nenhuma das páginas usa `useSearchParams`
(o padrão já estabelecido no Discover desde a Fase B,
`lib/discover/useDiscoverParams.ts`):

- Library: lê `status`/`favorite`/`type` da URL só na montagem inicial
  (via `window.location.search` manual, não `useSearchParams`), e só os
  botões de status-rápido e favorito-rápido escrevem de volta na URL
  (via `window.history.replaceState` manual). Genre/year/rating/sort/
  search/tipo (fora dos atalhos) nunca tocam a URL.
- Favorites/Ranking: nenhum estado na URL — filtro de tipo do Ranking é
  `useState` puro, perdido em qualquer refresh/compartilhamento de link.
- View mode e "não perguntar de novo ao remover": `localStorage`, dentro
  de `PosterGrid.tsx`, não na página.

## 15. View Modes

`grid`, `compact`, `list` — existem, confirmados em `PosterGrid.tsx`.
Estado vive na página que usa `PosterGrid` (ex. `/library`); a UI do
seletor e a persistência em `localStorage` vivem dentro do próprio
`PosterGrid`. Favorites/Ranking não expõem esse seletor (Favorites usa
`PosterGrid` sem passar `onViewModeChange`, então o seletor não
aparece; Ranking nem usa `PosterGrid`, tem sua própria lista `<ol>`
sem view mode).

## 16. Media Card Foundation

`PosterGrid` (usado por Home/Library/Favorites) é a fundação real,
construída sobre `MediaCard`/`Poster`/`MediaPreviewDialog` da Fase C —
sem card ou modal reimplementado. `Ranking` é a exceção: tem sua própria
lista `<ol>` com `<img>` cru, não usa `PosterGrid` nem `MediaCard`
(item é simples o bastante — linha com posição/poster/título/nota — que
provavelmente não justifica trocar, mas é uma implementação paralela
real). `Collection` (Fase C6) usa seu próprio `CollectionCard`, também
fora de `PosterGrid`, mas reaproveita `MediaPreviewDialog`/
`WatchProviderList` para o Quick Peek.

## 17. Quick Peek

Confirmado: `PosterGrid` monta `MediaPreviewDialog` com o adapter
`fromLibraryItem`, e ainda faz um fetch próprio de
`/api/tmdb/{type}/{id}` só para alimentar `WatchProviderList` dentro do
preview (mesmo padrão dos outros consumers da Fase C2/C3). `Ranking` não
tem Quick Peek — items só linkam direto para `/title/[type]/[id]`.

## 18. Library Actions (inline, consolidado)

| Ação | Onde existe |
|---|---|
| Favoritar | `PosterGrid` (grid + Quick Peek) |
| Mudar status | `PosterGrid` (menu, 6 valores) |
| Remover | `PosterGrid` (confirmação + desfazer) |
| Nota pessoal | `PosterGrid` (só dentro do Quick Peek) e `ReviewPanel` (Title page) |
| Quick Peek | `PosterGrid` |
| Editar progresso (season/episode) | Não existe na Library — só no Title page (Fase C5) |
| Adicionar a lista | **Não existe em lugar nenhum** |
| Aplicar tag | **Não existe em lugar nenhum** |

## 19. Bulk Actions

`BULK ACTIONS EXIST = NÃO`. Nenhuma seleção múltipla, nenhum checkbox de
item, nenhuma ação em lote (status/remover/favoritar/lista/tag) em
nenhuma tela auditada.

## 20. Progresso de TV na Library

Não exibido no grid/list/compact — `current_season`/`completed_seasons`
não aparecem em `page.tsx` nem em `PosterGrid.tsx` (zero ocorrências
confirmadas por busca). O único lugar onde uma contagem de temporadas
aparece perto da Library é dentro do próprio Quick Peek, via
`number_of_seasons` alimentando o payload de restauração pós-remoção —
não é um badge visível de progresso. Progresso de episódio/temporada
detalhado só existe no Title page (`SeasonProgress`, Fase C5),
fora do escopo desta D0.

## 21. Movie vs. TV — diferenças deliberadas

Muito pouca diferenciação na Library: só o badge "FILME"/"SÉRIE" e qual
campo de data usar (`release_date` vs. `first_air_date`). Os 6 status
estão disponíveis para ambos sem restrição. Nenhuma UI de progresso
específica de TV na Library (fica só no Title page). Não há indício de
forçar unificação indevida — a distinção mínima parece intencional.

## 22. Auth

- Todas as rotas de escrita (`/api/library*`, `/api/lists*`,
  `/api/tags*`, `/api/reviews*`) exigem `auth.getSession()` server-side
  e retornam 401 sem sessão.
- `GET /api/library` também exige sessão (é sempre "minha biblioteca").
- Nenhuma das páginas (`/library`, `/favorites`, `/ranking`) faz
  redirect explícito de guest para login — um guest que acessa essas
  rotas recebe 401 da API, cai no mesmo catch genérico, e vê o mesmo
  "vazio"/mesma ausência de erro distinto já descrito em §3.
- `/api/lists/items` GET permite leitura sem sessão SE a lista for
  pública (`is_public = true`), com checagem de ownership só quando
  privada.

## 23. API Routes (catálogo)

| Method | Rota | Propósito | Auth | R/W |
|---|---|---|---|---|
| GET | `/api/library` | Listar (paginado ou completo) | Sim | R |
| POST | `/api/library` | Adicionar título | Sim | W |
| DELETE | `/api/library?id=` | Remover item | Sim | W |
| PATCH | `/api/library/[id]` | Editar status/favorito/nota/review/progresso | Sim | W |
| POST | `/api/library/sync-seasons` | Sincronizar novas temporadas (Fase C5) | Sim | W |
| GET/POST/PATCH/DELETE | `/api/lists` | CRUD de lista (`custom_lists`+`lists` em sync) | Sim (leitura própria) | R/W |
| GET/POST/DELETE | `/api/lists/items` | Itens de uma lista | Condicional (pública/dono) | R/W |
| GET/POST/PATCH/DELETE | `/api/tags` | CRUD de tag (`tags`+`personal_tags` em sync) | Sim | R/W |
| POST/DELETE | `/api/tags/assign` | Associar/desassociar tag | Sim | W |
| GET/POST/DELETE | `/api/reviews/scores` | Notas por categoria (rota real usada) | Sim | R/W |
| GET/POST/DELETE | `/api/reviews` | Cópia morta idêntica de `/scores` | Sim | R/W (não chamada) |
| GET/POST/PATCH/DELETE | `/api/reviews/categories` | CRUD de categoria de avaliação | Sim | R/W |
| GET/POST/PATCH/DELETE | `/api/rating-categories` | Quarta geração de rating-by-category, 0 callers | Sim | R/W (morta) |

## 24. DB Model

Tabelas relevantes (`supabase/schema.sql`), nomes reais:

- `library_items` — PK `id` uuid, FK `user_id`→auth.users, `media_id`→media (int),
  unique `(user_id, media_id)`; colunas: `status`, `favorite`,
  `personal_rating`, `review`, `watched_at`, `rewatch_count`,
  `current_season`, `completed_seasons`, `stopped_season`, `added_at`,
  `updated_at`.
- `media` — cache local de metadados TMDB (`title`, `poster_path`,
  `genres text[]`, `tmdb_rating`, `seasons_count`, `episodes_count`,
  `raw jsonb`, etc.), unique `(tmdb_id, media_type)`.
- `review_categories` / `review_scores` — geração atual de avaliação por
  categoria (§8). Sem unique em `(user_id, name)` de categoria; unique
  em `(library_item_id, category_id)` de score.
- `custom_lists` / `custom_list_items` — geração de listas ligada a
  `library_items` (§9).
- `lists` / `list_items` — geração paralela de listas ligada a
  `movie_id` texto cru (§9), mantida em sync pela mesma API.
- `personal_tags` / `library_tags` — geração 1 de tags, ligada a
  `library_items`.
- `tags` / `movie_tags` — geração 2 de tags (rotulada "abandonada" no
  comentário do schema, mas escrita ativamente pela API viva — §32).
- `rating_categories` / `category_ratings` — geração adicional de
  rating-by-category, API própria (`/api/rating-categories`), 0
  callers confirmados.

## 25. Optimistic Updates

Confirmados em `PosterGrid.tsx`: favoritar, mudar status e nota pessoal
— todos atualizam o estado local antes do PATCH, revertem no `catch`, e
oferecem toast de "Desfazer" no sucesso (reversão manual pelo usuário).
Remover é **pessimista** — só atualiza a lista local depois da resposta
do `DELETE` confirmar sucesso (sem rollback necessário, já que nada
mudou antes). `ReviewPanel` (nota por categoria) também é otimista
local antes do POST.

## 26. Cache / Fetch

- `/library`: client fetch com `cache: "no-store"`, SEMPRE
  `paginated=true`, recarrega a cada mudança de filtro/sort/busca/página
  (sem cache entre navegações).
- `/favorites`, `/ranking`, Home: `GET /api/library` sem parâmetros,
  sem paginação — a API busca TODAS as linhas do usuário do Postgres
  (`SELECT ... WHERE user_id=... ORDER BY added_at DESC`, sem `LIMIT`)
  e devolve tudo de uma vez. Home ao menos cacheia em `sessionStorage`
  entre navegações (`homeCacheKey`); Favorites/Ranking recarregam do
  zero a cada montagem.
- Mesmo no modo `paginated=true`, a API busca **as mesmas linhas
  inteiras** e só filtra/ordena/pagina depois, em memória, no processo
  Node — não existe `WHERE`/`ORDER BY`/`LIMIT` no SQL para os filtros
  reais (só o `WHERE user_id=...` inicial). Contagens de gênero/ano/
  status também são computadas varrendo o array inteiro a cada request.
- Nenhum N+1 de card individual encontrado — `PosterGrid` não faz fetch
  por item (só um fetch único para o item em preview no Quick Peek).

## 27. Performance Risks

| Risco | Classe | Evidência |
|---|---|---|
| `GET /api/library` sem paginação real no SQL — toda a biblioteca do usuário trafega do Postgres a cada request, em qualquer modo | **HIGH** | `app/api/library/route.ts:213-214` (`allRows`, sem LIMIT), confirmado explicitamente nos comentários de `app/favorites/page.tsx:9-30` |
| Home/Favorites/Ranking/Discover chamam `/api/library` sem `paginated=true` — sempre o dataset completo, mesmo quando só um subconjunto é exibido (ex. Favoritos, Ranking com filtro) | **HIGH** | grep confirmado nos 4 arquivos |
| Filtros/sort/contagens de gênero/ano recomputados em memória a cada request paginado, sobre o array inteiro | MEDIUM | `app/api/library/route.ts:250-421` |
| Nenhum N+1 por card | — | não encontrado |

## 28. Empty / Error / Loading (consolidado)

| Página | Loading | Error | Empty |
|---|---|---|---|
| `/library` | Spinner único | **Não distinto do empty** | Não distinto do error |
| `/favorites` | `role="status"` com texto | `role="alert"` com retry | Distinto, com CTA para `/discover` |
| `/ranking` | `role="status"` com texto | `role="alert"` com retry | Distinto, com CTA para `/library` |

## 29. Mobile / Responsive (estático)

Nenhuma lógica de breakpoint em JS em `page.tsx`/`PosterGrid.tsx` —
tudo via classes CSS externas não auditadas nesta D0 (`library-*`,
`mc-media-grid`, etc.). Sem larguras fixas em px suspeitas no JSX
revisado. Risco de overflow/quebra fica para validação runtime em D1.

## 30. A11y (riscos identificados, não exaustivo)

- Vários botões só-ícone dependem de `title` (não `aria-label`): limpar
  busca, fechar painel de filtros, paginação anterior/próxima.
- Painel de filtros avançados não usa `aria-expanded`/`aria-controls`
  no botão que o abre.
- Botões de filtro rápido/status/rating não usam `aria-pressed`/
  `aria-current` para comunicar seleção (só classe visual `active`) —
  `Ranking`, ao contrário, já faz isso certo (`aria-pressed`
  confirmado).
- Menu de status (`PosterGrid`) é `<div>` customizado, fechamento só por
  clique-fora (`mousedown`), sem navegação por seta/roving tabindex.

## 31. Design Consistency vs. Fase C

- **Reaproveitado corretamente**: `PosterGrid` → `MediaCard`/`Poster`/
  `MediaPreviewDialog`/`WatchProviderList` — nenhum card ou modal
  duplicado na Library/Favorites.
- **Duplicações reais**: `Ranking` reimplementa uma lista própria com
  `<img>` cru (não usa `Poster`/`MediaCard`); `Collection` (C6) usa seu
  próprio `CollectionCard` em vez de `PosterGrid`/`MediaCard` — ambos já
  existiam antes desta auditoria, registrados aqui como fato, não como
  bug novo.
- **Padrão de URL state divergente**: Discover (Fase B) estabeleceu
  `useSearchParams`/hook dedicado como padrão; Library usa
  `window.location`/`window.history` manual e parcial. Season selector
  da Fase C5 também segue o padrão `useSearchParams` do Discover — a
  Library é a exceção, não a regra.
- **Status label duplicado**: `STATUS_LABELS` (`lib/types.ts`) vs.
  mapeamento hardcoded em `getStatus()` (`PosterGrid.tsx`).

## 32. Dead Code (identificado, não removido nesta fase)

- `hooks/useLists.ts`, `hooks/useTags.ts` — zero callers reais; ambos
  quebrados contra a API real (`PUT/DELETE /api/{lists,tags}/${id}`,
  rota `[id]` não existe).
- `types/index.ts` (`Tag`, `List`) — só consumido pelos hooks acima.
- `app/api/reviews/route.ts` — cópia idêntica de `/api/reviews/scores`,
  sem caller.
- `app/api/rating-categories/route.ts` (+ tabelas `rating_categories`/
  `category_ratings`) — sem caller.
- **Discrepância a registrar, não resolver agora**: o comentário do
  schema chama `tags`/`movie_tags` de "segunda geração, também
  abandonada", mas `/api/tags` (POST) e `/api/tags/assign` (POST/DELETE)
  — rotas com caller real confirmado (via `/api/tags` sendo alcançável
  por `createList`-equivalente? **não** — na verdade nenhum caller de UI
  foi confirmado para `/api/tags` em si; a única "prova de vida" é a
  própria rota escrever nas duas gerações). Ou seja: tags como um todo
  (ambas as gerações) não têm consumer de UI — a "contradição" é só
  entre o comentário do schema e o código da rota, não uma prova de que
  tags estão em uso real.

## 33. Product Gaps

**ALREADY EXISTS**: página de biblioteca paginada com filtros/sort/
busca reais; favoritos; status (6 valores); nota pessoal simples;
avaliação por categoria (Title page); Quick Peek compartilhado; três
view modes; ranking por nota; CRUD completo de listas e tags no
backend.

**PARTIAL**: Custom Lists (criar + ver nome/contagem, sem adicionar
item nem ver conteúdo); avaliação por categoria (rica, mas isolada de
`personal_rating`); URL state da Library (só 2 de 7 filtros);
error/empty da Library (existe em Favorites/Ranking, falta na própria
Library).

**MISSING**: adicionar título a uma lista (UI); tags (UI inteira);
bulk actions; progresso de TV na Library; busca fora da Library;
detalhe/página de uma lista específica; filtro/sort persistente entre
sessões (fora de `defaultSort`).

## 34. Não inventado

Esta auditoria não decide criar tags, criar listas do zero (elas já
existem, só faltam de UI), bulk actions, novo ranking, smart
collections, IA ou recommendation engine — nenhuma dessas features é
proposta aqui; só o estado real é descrito.

## 35. Proposta D1 — Library & Organization Consolidation

Fase única, sem microfases.

### MUST

1. Corrigir `/api/library` (modo não-paginado) para não ser chamado
   sem necessidade por Home/Favorites/Ranking/Discover — ou aceitar o
   padrão atual e aplicar paginação real no SQL (`WHERE`/`LIMIT`) no
   modo `paginated=true` pelo menos, reduzindo o HIGH de §27.
2. Unificar error/empty na Library principal (mesma correção já feita
   em Favorites/Ranking).
3. Dar UI real para "adicionar título a uma lista" a partir de pelo
   menos um ponto natural (Title page e/ou Quick Peek) — sem isso,
   Custom Lists continua um backend morto.
4. Remover/consertar `hooks/useLists.ts`/`useTags.ts` (ou apagar, já
   que não têm caller e estão quebrados contra a API real).
5. Decidir e corrigir a divergência `ReviewPanel` detalhado vs.
   `personal_rating` (§8) — pelo menos documentar visivelmente que são
   independentes, ou sincronizar.

### SHOULD

6. Levar filtros/sort/busca da Library para `useSearchParams` (mesmo
   padrão do Discover), com deep-link completo.
7. Página/rota de detalhe de uma lista (ver itens, remover item).
8. Consolidar `tags`/`personal_tags`/`movie_tags`/`library_tags` numa
   única geração antes de construir UI de tags (evitar herdar a
   duplicação de Lists).
9. Remover código comprovadamente morto (`/api/reviews/route.ts`,
   `/api/rating-categories`, tabelas de gerações abandonadas — decisão
   de produto antes de qualquer DROP).

### DEFER

10. Tags — UI completa (criar/aplicar/filtrar) — feature grande,
    melhor como trabalho dedicado após a consolidação de Lists.
11. Bulk actions.
12. Badge de progresso de TV na Library.
13. `ON DELETE CASCADE` em `review_scores.category_id` (mudança de
    schema — fora do "sem migration" desta fase).

## 36. Decisões de Produto Necessárias

1. **Lists — MVP mínimo para D1**: só "ver o que já existe" (lista
   clicável com conteúdo) ou já incluir "adicionar item" nesta fase?
2. **Tags**: entram no escopo de D1 de alguma forma, ou ficam
   inteiramente para depois (dado que Lists já é grande o suficiente)?
3. **`personal_rating` vs. avaliação por categoria**: a média ponderada
   deve passar a escrever `personal_rating` automaticamente, ou os dois
   devem continuar explicitamente independentes (com copy deixando isso
   claro na UI)?
4. **`/api/library` sem paginação**: aceitável manter enquanto a
   biblioteca típica for pequena, ou já vale a pena adicionar
   `WHERE`/`LIMIT` reais no SQL agora?
5. **Qual geração de tags/listas vira a única fonte de verdade** —
   migrar dados das abandonadas ou simplesmente não usá-las mais (elas
   têm 0 linhas hoje, segundo os comentários do próprio schema)?
6. **Ranking deve migrar para `PosterGrid`/`MediaCard`**, ou a lista
   simples atual é aceitável como está?
7. **Progresso de TV na Library**: vale um badge, ou fica só no Title
   page como hoje?
8. **URL state da Library**: migrar todos os filtros para
   `useSearchParams` agora, ou só os que já estão parcialmente lá
   (status/favorito)?

## Audit closeout

- `PRODUCT CODE DIFF = 0`.
- Nenhum endpoint, migration, pacote, alteração de comportamento,
  commit ou push nesta auditoria.
- Inspeção de banco: nenhuma — toda a análise de schema veio de
  `supabase/schema.sql` versionado, conforme preferência da fase.
