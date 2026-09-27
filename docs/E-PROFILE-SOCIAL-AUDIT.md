# E0 — Auditoria de Profile & Social

**Data:** 2026-09-27
**Escopo:** auditoria read-only de produto e arquitetura. Nenhum código de
produto, banco, rota ou comportamento foi alterado. Fase D encerrada em
`224e2a8 feat(library): complete library and organization`; checkpoint
inicial estava limpo.

> **Status: E0 = DONE.** Proposta de implementação em § 36 (E1). Decisões
> de produto necessárias em § 37.

## 1. Executive Summary

Profile & Social já é uma feature **substancialmente implementada**, não
uma lacuna — ao contrário de Lists/Tags na Fase D, aqui não há geração
abandonada nem confusão sobre "o que é canônico". O que existe:

- Perfil próprio (`/profile` → redirect) e público (`/u/[username]`) numa
  única página client-side que se adapta por `relationship`.
- Follow system completo com pending/accepted, follow policy por perfil
  (`profile`/`approval`/`nobody`), followers/following/incoming/outgoing.
- Modelo de privacidade granular por seção (8 colunas de visibilidade em
  `profiles`).
- Busca de usuários, avatar (Vercel Blob), Top 5 showcase, listas
  públicas (recém-consolidadas em D1).

O que a auditoria encontrou como problemas reais, não hipotéticos:

1. **Duas UIs de follow paralelas** fazendo a mesma coisa — a aba
   "Conexões" do perfil (`app/u/[username]/page.tsx`) e
   `components/SocialSettings.tsx` (dentro de Settings → Conta) — ambas
   chamam `/api/follows`, ambas renderizam followers/following/incoming/
   outgoing, independentemente uma da outra.
2. **Duas fontes de "atividade"** que não se falam:
   `public.activity_events` (tabela real, escrita por library/watch-
   history/import, servindo Home/Diário/Retrospectiva via
   `/api/activity`) vs. a aba "Atividade" do perfil público, que deriva
   um feed ad-hoc de `library_items` na própria query do
   `/api/public-profile/[username]`, sem tocar `activity_events`.
3. **Queries sem paginação real** em followers/following (tanto
   `/api/follows` quanto `/api/public-profile/[username]`) — mesmo
   padrão de risco que a Library tinha antes da D1, aqui ainda não
   corrigido.
4. **Regex de username triplicada** (trigger SQL, `/api/profile/username`,
   `/api/auth/profile`) — mesma regra, três lugares, risco de divergência
   silenciosa.
5. **Drift de schema confirmado**: `public.username_changes` é usada em
   produção (INSERT/SELECT reais em `/api/profile/username`) mas **não
   existe** em `supabase/schema.sql` — o arquivo versionado está
   desatualizado nesse ponto (mesma classe de achado que `stopped_episode`
   na C5.2 e `media_id` na mesma fase).
6. **Fronteira Account/Profile já borrada hoje**: a aba "Conta e
   privacidade" de Settings renderiza `<AccountPrivacy/>` (email/senha/
   exportar/excluir conta) + `<SocialSettings/>` (follow list + privacidade
   social) + `<DataBackup/>` juntas, sem separação visual ou de rota.
7. **Block/mute/report não existem** — nenhuma tabela, rota ou UI. Não é
   uma lacuna "esquecida"; simplesmente nunca foi construída.
8. **`/api/search/users` não filtra por privacidade** — retorna perfis
   privados igualmente (diferente de `/api/public-profile/[username]`,
   que respeita `visibility`).
9. **Dependência viva numa tabela "abandonada"**: `app/api/lists/route.ts`
   ainda faz `LEFT JOIN public.lists` (comentada no schema como segunda
   geração abandonada) só para ler `is_public` — já documentado na D1,
   citado aqui porque toca Profile (perfil público lê `custom_lists`, que
   por sua vez depende dessa junção em `/api/lists`).

Nada disso exige decisão de produto complexa — são principalmente
consolidações e correções mecânicas, no mesmo espírito da D1.

## 2. Rotas relacionadas

| Rota | Arquivo | Tipo |
|---|---|---|
| `/profile` | `app/profile/page.tsx` | Server component — resolve `username` da sessão e redireciona para `/u/[username]`. Se não autenticado, `redirect("/login")`. |
| `/u/[username]` | `app/u/[username]/page.tsx` (206 linhas, client) | Perfil próprio E público na mesma página — comportamento muda por `data.social.relationship`. |
| `/settings` (aba "Conta e privacidade") | `app/settings/page.tsx` | Renderiza `AccountPrivacy` + `SocialSettings` + `DataBackup` juntos. |
| `/settings` (aba "Geral") | `app/settings/page.tsx:166` | Não edita perfil — só um link "Abrir meu perfil" (edição real migrou para `/profile`... na verdade para `/u/[username]`). |
| Followers/following/solicitações | sem rota própria — aba "connections" dentro de `/u/[username]` | |
| Busca de usuários | `app/search/page.tsx` (`SearchUserSection`) | |

### API

| Rota | Método | Auth | Owner/Target | Propósito |
|---|---|---|---|---|
| `/api/public-profile/[username]` | GET | opcional (afeta o que é visível) | target = username da URL | Dados completos do perfil público: favoritos, biblioteca-derivada (activity/reviews/liked), listas, diário, social counts. |
| `/api/follows` | GET/POST/PATCH/DELETE | obrigatória | self | Grafo de follows do usuário logado; seguir/aceitar/recusar/deixar de seguir/remover seguidor/cancelar solicitação. |
| `/api/profile/username` | GET/POST | obrigatória | self | Ler/trocar o próprio username (rate limit 2 trocas/30 dias via `username_changes`). |
| `/api/auth/username` | GET | opcional | — | Checagem de disponibilidade de username **antes** de existir sessão completa (fluxo de signup). |
| `/api/auth/profile` | POST | obrigatória | self | Criação inicial do perfil (username + nome) logo após signup — primeira vez, não edição. |
| `/api/profile/avatar` | POST/DELETE | obrigatória | self | Upload/remoção de avatar via Vercel Blob. |
| `/api/profile/showcase` | (não lido em detalhe) | obrigatória | self | Top 5 filmes/séries do perfil (`profile_favorites`). |
| `/api/profile/social-settings` | GET/PUT | obrigatória | self | As 8 colunas de visibilidade + `follow_policy`. |
| `/api/profile/notifications` | (não lido em detalhe) | obrigatória | self | Preferências de notificação (inclui toggles de `follow_request`/`new_follower`). |
| `/api/activity` | GET | obrigatória | self | Log de eventos (`activity_events`) — usado por Home, Diário, Retrospectiva. **Não** usado pelo perfil público. |
| `/api/search/users` | GET | opcional | — | Busca por username/display_name, sem filtro de privacidade. |

## 3. Perfil próprio vs. perfil público

Não são páginas separadas — é a **mesma** `app/u/[username]/page.tsx`,
que decide o que mostrar via `data.social.relationship` (`"self"` |
`"accepted"` | `"pending"` | `"none"`), vindo de
`/api/public-profile/[username]`.

Diferenças owner vs. visitante, todas condicionadas a
`relationship === "self"`:

- Botão "Editar perfil" (abre `AvatarSettings` + `ProfileShowcaseEditor`
  inline) em vez de botão "Seguir".
- Criação de lista (`createList()`, linha 166) só aparece para o dono.
- Aba "Conexões" mostra painel completo de solicitações recebidas/
  enviadas/seguindo/seguidores quando é o próprio usuário; para visitante,
  mostra só dois botões que abrem modais de contagem.

Se o perfil é privado e o visitante não é seguidor aceito,
`data.locked` vem `true` e a página mostra um estado de bloqueio
(`LockKeyhole`, "Este perfil é privado") em vez do conteúdo.

## 4. Campos reais do perfil (`public.profiles`)

Nenhum campo abaixo foi inventado — todos lidos diretamente de
`supabase/schema.sql`:

| Campo | Tipo | Editável | Público | Validação |
|---|---|---|---|---|
| `id` | uuid PK, FK `auth.users` | não | — | — |
| `display_name` | text | sim (edição inline no perfil) | sim | sem limite visível no schema |
| `username` | text, unique (índice parcial `lower(username)`) | sim, com rate limit | sim | `^[a-z0-9_]{3,24}$`, triplicada (§6) |
| `bio` | text | sim | sim | sem limite visível no schema |
| `avatar_url` | text | sim (upload) | sim | ver §7 |
| `is_public` | boolean, default `false` | via social-settings | — | mantido em sincronia com `visibility` |
| `visibility` | text, `public`/`private`, default `private` | via social-settings | — | check constraint |
| `follow_policy` | text, `profile`/`approval`/`nobody`, default `profile` | via social-settings | — | check constraint |
| `followers_visibility` | text, `profile`/`followers`/`private` | via social-settings | — | check constraint |
| `following_visibility` | idem | via social-settings | — | check constraint |
| `activity_visibility` | idem | via social-settings | — | check constraint |
| `diary_visibility` | idem | via social-settings | — | check constraint |
| `lists_visibility` | idem | via social-settings | — | check constraint |
| `likes_visibility` | idem | via social-settings | — | check constraint |
| `created_at` | timestamptz | não | sim (implícito) | — |

Tabela relacionada: `profile_favorites` (Top 5), PK
`(user_id, media_type, position)`, unique `(user_id, media_id)`.

## 5. Username

- Regex: `^[a-z0-9_]{3,24}$`, sempre `trim().toLowerCase()` antes de
  validar.
- **Três lugares independentes reimplementam a mesma regex**: o trigger
  `handle_new_user_profile()` (schema.sql), `/api/profile/username`
  (edição pós-signup) e `/api/auth/profile` (criação no signup). Nenhum
  importa de um lugar comum — puro texto duplicado.
- Unicidade: índice único parcial `profiles_username_unique on
  public.profiles (lower(username)) where username is not null` — case
  insensitive de verdade, reforçado no banco, não só na aplicação.
- Trigger `guard_profile_username_change` bloqueia `UPDATE ... username`
  direto por qualquer role exceto `postgres/service_role/supabase_admin`
  — muda de username só passa pela rota server-side, nunca por escrita
  direta.
- Rename: até 2 trocas por janela rolante de 30 dias, contadas em
  `public.username_changes` — **tabela sem CREATE TABLE em
  `supabase/schema.sql`**, ou seja, existe no banco real mas o arquivo
  versionado está desatualizado (drift confirmado, não presumido).
- Sem lista de nomes reservados (`admin`, `api`, etc.) — não encontrada
  em nenhum dos três pontos de validação.
- Roteamento: `/u/[username]` usa o valor cru da URL — não há
  normalização de maiúsculas/minúsculas na própria rota (a comparação
  `lower(username)` acontece só nas queries SQL).

## 6. Avatar

- Vercel Blob (`@vercel/blob`, `put`/`del`).
- Limite: 5 MB (`MAX_AVATAR_BYTES`).
- Tipos aceitos: `webp`, `jpeg`, `png`, validados por assinatura de bytes
  (magic bytes), não só pelo `Content-Type` declarado.
- Caminho: `avatars/${user.id}/avatar-${randomUUID()}.${ext}`, acesso
  público.
- Ao trocar avatar, o blob antigo só é apagado se **também** era um blob
  Vercel (checagem de URL) — avatares antigos hospedados em outro lugar
  (ex.: Supabase Storage de uma geração anterior) não são limpos, ficam
  órfãos indefinidamente.
- DELETE explícito zera `avatar_url` e apaga o blob (se for Vercel Blob).
- UI: `components/AvatarSettings.tsx`, único importador é
  `app/u/[username]/page.tsx`, renderizado só quando
  `relationship === "self" && editingProfile`.

## 7. Bio / edição de perfil

Edição acontece inline na própria `/u/[username]` (bloco
`editingProfile`), não em `/settings` — a aba "Geral" de Settings
explicitamente linka para lá em vez de duplicar o formulário
(`"Avatar, biografia, @, visibilidade e Top 5 agora ficam juntos no seu
perfil"`, texto literal do código). Fronteira limpa nesse ponto
específico. Validação de `bio`/`display_name` não tem limite de tamanho
visível no schema nem, pelo que foi lido, no client — candidato a
decisão de produto se isso importar para E1 (provavelmente não crítico).

## 8. Follow system

**FOLLOW SYSTEM EXISTS = SIM**, completo.

- Tabela `public.follows`: PK composta `(follower_id, following_id)`,
  `status` em `('pending','accepted')`, `check (follower_id <>
  following_id)` (auto-follow impossível no banco). `REVOKE
  INSERT/UPDATE/DELETE` de `anon`/`authenticated` — toda escrita passa
  pelo backend com service role, nunca client-direct.
- POST decide `pending` vs. `accepted` automaticamente:
  `automatic = follow_policy === "profile" && (visibility === "public" ||
  is_public === true)`. Perfil privado, ou `follow_policy` em
  `approval`/`nobody`, cai em pending (ou é rejeitado direto se
  `nobody`).
- PATCH aceita/recusa solicitação pendente.
- DELETE cobre três ações distintas via `mode`: `unfollow`,
  `remove_follower`, `cancel` (cancelar solicitação enviada).
- Prevenção de duplicata: PK composta no banco — impossível duas linhas
  para o mesmo par.
- Sem "block" — só os 3 níveis de `follow_policy`.
- **Dois consumidores de UI independentes**: aba "Conexões" do perfil
  (`app/u/[username]/page.tsx`) e `components/SocialSettings.tsx`
  (Settings → Conta) — cada um faz seu próprio `fetch("/api/follows")` e
  desenha sua própria lista, sem compartilhar componente.

## 9. Friends

Não existe como conceito. "Social" é só follow assimétrico
(seguir/seguidor), sem amizade bilateral — coerente com o texto do
usuário pedindo para não inventar isso.

## 10. Activity

Duas coisas com o mesmo nome, desconectadas:

1. **`public.activity_events`** — tabela real, `event_type` em
   `('library_added','status_changed','season_completed',
   'series_completed','rewatch_started')`, índice
   `(user_id, occurred_at desc)`. Escrita confirmada em: `app/api/library/
   route.ts`, `app/api/library/[id]/route.ts`, `app/api/watch-history/
   route.ts`, `app/api/account/import/route.ts`,
   `app/api/account/import/letterboxd/route.ts`. Lida só por
   `/api/activity` (GET, só o próprio usuário, `LIMIT` 1–1000, sem
   `OFFSET`, filtro opcional por `?year=`). Consumida por `app/page.tsx`
   (Home), `app/diary/page.tsx`, `app/retrospective/page.tsx` — todas
   telas do PRÓPRIO usuário, nunca do perfil público.
2. **Aba "Atividade" do perfil público** — não toca `activity_events` em
   nenhum momento. `/api/public-profile/[username]/route.ts` deriva
   `activity` ordenando as próprias linhas de `library_items` por
   `updated_at`, fatiado em 12. É um feed reconstruído ad-hoc, paralelo
   ao log de eventos real.

Nenhuma das duas tem paginação — `/api/activity` tem só um teto (`LIMIT`
sem `OFFSET`), a do perfil público corta em 12/6/500 conforme quem
chama.

## 11. Social feed

**SOCIAL FEED EXISTS = NÃO** (no sentido de "atividade de quem eu sigo").
O que existe é atividade do PRÓPRIO usuário (Home/Diário/Retrospectiva) e
a atividade do usuário sendo VISITADO (aba do perfil). Não há nenhuma
tela que agregue atividade de múltiplas pessoas que o usuário segue —
não presumir que deveria existir, só registrar que não existe hoje.

## 12. Profile Stats

Todas derivadas ao vivo em `/api/public-profile/[username]`, uma única
query grande sobre `library_items` (server-side aggregation, não
client-side): `favorites` (JOIN `profile_favorites`+`media`), `library`/
`activity`/`reviews`/`recent_reviews`/`liked_titles` (todas do mesmo
resultado de `library_items`), `lists` (`custom_lists` + contagem),
`diary` (`watch_entries`, LIMIT 12), `followers`/`following` (JOIN
`follows`+`profiles`, sem LIMIT).

Não há duplicação de cálculo com `/stats` (a página de estatísticas
pessoais) — são endpoints e propósitos diferentes; não foi auditado em
profundidade se os números batem entre si (fora do escopo read-only
desta seção específica, mas nenhuma bandeira de inconsistência apareceu
na leitura).

## 13. Public Library

| Superfície | Visível a visitante | Regra |
|---|---|---|
| Biblioteca completa | NÃO | Não há endpoint que exponha a biblioteca inteira de outro usuário. |
| Favoritos (Top 5 + curtidos) | PARTIAL | Top 5 sempre visível (não tem coluna de visibilidade própria); "curtidos" (favoritos gerais) gated por `likes_visibility`. |
| Ratings/reviews | SIM, gated | Reviews (texto) e "atividade" (que inclui rating implícito) gated por `activity_visibility`. |
| Listas | SIM, gated | Gated por `lists_visibility` **e** por `is_public` de cada lista individualmente (D1) — duas camadas independentes. |
| Diário | SIM, gated | Gated por `diary_visibility`. |

## 14. Lists no perfil (integração com D1)

- `/u/[username]` já linka cada card de lista para `/lists/[id]`
  (mudança feita na própria D1).
- A aba "Listas" só mostra `custom_lists` do dono — consistente com a
  D1 ter confirmado essa como a geração canônica.
- Criação de lista está disponível **direto no perfil** (`createList()`),
  além de existir a página dedicada `/lists`. Dois pontos de entrada
  para a mesma ação — não é um bug, mas vale registrar como superfície
  duplicada.
- Privacidade: gated tanto pela visibilidade da seção
  (`lists_visibility`) quanto pelo `is_public` por lista — um visitante
  pode ter a ABA inteira escondida mesmo que uma lista individual seja
  pública, ou ver a aba mas encontrar listas privadas dentro dela
  filtradas (checar em `custom_lists` query se filtra por `is_public`
  quando não é o dono — **não confirmado nesta auditoria**, candidato a
  checagem direta em E1).

Não foi proposta nem cogitada nenhuma reimplementação de Lists aqui —
D1 está fechada e correta.

## 15. Reviews social

Reviews (`library_items.review`, texto livre) aparecem na aba "Reviews"
do perfil, gated por `activity_visibility`. Não são comentáveis nem
curtíveis por terceiros — nenhuma tabela de likes/comments em reviews
encontrada no schema. Puramente informativo/read-only para o visitante.

## 16. Favoritos públicos

Top 5 (`profile_favorites`) sempre visível a quem pode ver o perfil (sem
coluna de visibilidade própria — herda a visibilidade geral do perfil).
"Curtidos" (favoritos gerais, `library_items.favorite = true`) gated por
`likes_visibility`, INDEPENDENTE do Top 5. Duas noções de "favorito"
coexistindo com regras de privacidade diferentes — não é bug, mas é uma
sutileza que vale documentar para quem for desenhar E1.

## 17. Privacy model

Já listado por completo na §4. Resumo dos valores possíveis:

- `visibility`: `public` | `private` (perfil como um todo).
- `follow_policy`: `profile` (segue automático se perfil público) |
  `approval` (sempre pede aprovação) | `nobody` (ninguém pode seguir).
- `followers_visibility` / `following_visibility` /
  `activity_visibility` / `diary_visibility` / `lists_visibility` /
  `likes_visibility`: cada uma `profile` (quem pode ver o perfil vê a
  seção) | `followers` (só seguidores aceitos) | `private` (só o dono).

`is_public` (boolean) e `visibility` (enum) representam a mesma coisa em
paralelo — mantidos sincronizados manualmente no PUT de
social-settings, checados com `OR` em vários pontos
(`visibility === "public" || is_public === true`). Redundância real, não
inventada.

## 18. Fronteira Account vs. Profile

Hoje **misturada** na aba "Conta e privacidade" de `/settings`:

- `AccountPrivacy.tsx` = domínio ACCOUNT de verdade (email, senha,
  exportar dados, excluir conta) — mas também chama `/api/auth/profile`
  para alguma sincronização de username/nome.
- `SocialSettings.tsx` = domínio PROFILE/SOCIAL (as 8 visibilidades +
  follow list) — renderizado imediatamente ao lado, sem separação de
  aba ou rota.
- `DataBackup.tsx` = backup/export, mais próximo de ACCOUNT.

Este documento não prescreve uma separação — só registra que ela não
existe hoje, para que a decisão de mexer ou não nisso em E1 seja
consciente.

## 19. Profile nav (abas)

Da `app/u/[username]/page.tsx`, `type Tab = "activity" | "reviews" |
"likes" | "lists" | "connections"`:

| Aba | Fonte de dados | Owner-only | Pública |
|---|---|---|---|
| Atividade | `library_items` derivado (não `activity_events`) | não | gated por `activity_visibility` |
| Reviews | `library_items.review` não vazio | não | gated por `activity_visibility` |
| Curtidos | `library_items.favorite = true` | não | gated por `likes_visibility` |
| Listas | `custom_lists` | criação é owner-only | gated por `lists_visibility` |
| Conexões | `/api/follows` (self) ou `social.followers/following` (visitante) | conteúdo completo (solicitações) é owner-only | contadores sempre visíveis, listas completas via modal |

## 20. Busca de usuários

Existe: `app/api/search/users/route.ts`. `q` com mínimo 2 caracteres,
`ILIKE` em `username`/`display_name`, `LIMIT 20`, sem `OFFSET`,
reordenado no próprio handler por score de match exato/prefixo. **Não
filtra por `visibility`/`is_public`** — perfis privados aparecem
igualmente na busca (só o CONTEÚDO fica bloqueado ao abrir o perfil, não
a descoberta em si).

## 21. Social counts

`followers_count`/`following_count` — não confirmado nesta auditoria se
vêm de `COUNT(*)` SQL ou de agregação em JS sobre o array já buscado
(a query de `/api/public-profile/[username]` busca as listas completas
de followers/following e o count provavelmente vem do `.length` desse
mesmo resultado, já que não há LIMIT separado) — **risco de performance
igual ao de Library antes da D1**: contar por `.length` de um array sem
LIMIT significa que o "count" fica cada vez mais caro conforme a rede
social cresce, mesmo que a UI só mostre um número.

## 22. Paginação

| Superfície | Paginada? |
|---|---|
| `/api/follows` (GET) | NÃO — busca todo o grafo do usuário, sem LIMIT/OFFSET |
| Followers/following em `/api/public-profile/[username]` | NÃO — mesma coisa, para o perfil sendo visitado |
| `/api/activity` | Parcial — `LIMIT` (padrão 300, máx. 1000), sem `OFFSET` |
| `/api/search/users` | Parcial — `LIMIT 20`, sem `OFFSET` |
| Listas no perfil | Parcial — `LIMIT 20`, sem `OFFSET` |
| Diário no perfil | Parcial — `LIMIT 12`, sem `OFFSET` |

Nenhuma dessas superfícies tem "carregar mais"/paginação real hoje.

## 23. Auth / Ownership

Toda mutation social conferida nesta auditoria (`/api/follows` POST/
PATCH/DELETE, `/api/profile/username`, `/api/profile/avatar`,
`/api/profile/social-settings`) exige sessão e opera só sobre o próprio
`user.id` — nenhuma mutation aceita um "target user id" arbitrário vindo
do client sem revalidar contra a sessão. `/api/follows` POST recebe
`username` do alvo (não um ID direto), resolvido para `id` no servidor.

## 24. Blocking / Safety

**Não existem** block, mute ou report. Confirmado por busca completa —
nenhuma tabela, rota ou componente. Não é um requisito novo sendo
proposto aqui, só uma constatação factual para a decisão de produto em
E1 decidir se entra ou fica de fora.

## 25. API Map (consolidado)

| Método | Rota | Auth | Owner/Target | R/W |
|---|---|---|---|---|
| GET | `/api/public-profile/[username]` | opcional | target = URL | R |
| GET/POST/PATCH/DELETE | `/api/follows` | obrigatória | self | R/W |
| GET/POST | `/api/profile/username` | obrigatória | self | R/W |
| GET | `/api/auth/username` | opcional | — | R |
| POST | `/api/auth/profile` | obrigatória | self | W |
| POST/DELETE | `/api/profile/avatar` | obrigatória | self | W |
| ? | `/api/profile/showcase` | obrigatória | self | R/W |
| GET/PUT | `/api/profile/social-settings` | obrigatória | self | R/W |
| ? | `/api/profile/notifications` | obrigatória | self | R/W |
| GET | `/api/activity` | obrigatória | self | R |
| GET | `/api/search/users` | opcional | — | R |

## 26. DB Map

Tabelas de Profile/Social em `supabase/schema.sql` (versionado):

- `public.profiles` — ver §4.
- `public.profile_favorites` — Top 5, PK `(user_id, media_type,
  position)`, unique `(user_id, media_id)`.
- `public.follows` — PK `(follower_id, following_id)`, check
  `follower_id <> following_id`, `status` check.
- `public.activity_events` — PK `id`, FK `library_item_id`, índice
  `(user_id, occurred_at desc)`.
- `public.notification_preferences`/`notifications` — inclui toggles
  `follow_request_site/email`, `new_follower_site/email`.

**Não presente no schema versionado, mas usada em produção**:
`public.username_changes` (referenciada em INSERT/SELECT reais em
`/api/profile/username`) — drift confirmado, mesma classe de achado que
`stopped_episode`/`media_id` na C5.2. Não consultado banco de produção
para confirmar a estrutura real — só a evidência de uso no código.

## 27. Shared Foundations

Reuso confirmado disponível:

- `components/media/MediaCard.tsx` (+ Actions/Image/Meta/Skeleton)
- `components/media/preview/MediaPreviewDialog.tsx`
- `components/PosterGrid.tsx`
- `components/ConfirmProvider.tsx` (`useConfirm`) — já usado no perfil
- `components/ToastProvider.tsx` (`useToast`) — já usado no perfil
- `components/Search.tsx` (topbar) e `components/search/` (busca)
- Fundação de Listas da D1 (`app/lists/[id]`, `AddToListDialog`)

**Não existe** um componente `Avatar` de exibição reutilizável — só
`AvatarSettings.tsx` (widget de upload/edição). Onde o avatar é só
exibido (ex.: dentro da própria `/u/[username]`, ou em listas de
followers dentro de `SocialSettings.tsx`), cada lugar desenha seu
próprio `<img>`/iniciais inline, duplicando a mesma lógica de fallback
(`display_name?.slice(0,2).toUpperCase()`) em pelo menos dois arquivos.

## 28. Fetch / N+1

Nenhum N+1 clássico (query dentro de loop) encontrado nas rotas lidas —
`/api/public-profile/[username]` usa `Promise.all` para paralelizar as
queries independentes. O risco real não é N+1, é **fetch sem limite**
(§22/§21): followers/following buscados por inteiro a cada carregamento
de perfil e a cada 30s pelo `FollowRequestNotifier` (polling).

## 29. Performance Risks

- **HIGH**: followers/following sem LIMIT em `/api/follows` (polled a
  cada 30s por `FollowRequestNotifier`) e em
  `/api/public-profile/[username]` — mesmo padrão que era HIGH em
  Library antes da D1.
- **MEDIUM**: `followers_count`/`following_count` prováveis via
  `.length` de array completo em vez de `COUNT(*)` dedicado (não
  100% confirmado, ver §21).
- **LOW**: `/api/search/users` sem paginação, mas já limitado a 20
  resultados — baixo risco na escala atual.

## 30. Loading / Error / Empty

- **Own profile / Public profile** (`/u/[username]`): tem estado de
  loading (`"Carregando perfil..."`) e estado "não existe ou é privado"
  combinado num só (`if (!data) return ... "Este perfil não existe ou é
  privado"`) — **não distingue 404 de 403**, mesma classe de problema
  que Library tinha antes da D1 (embora aqui o risco de UX seja menor,
  já que ambos os casos realmente merecem uma resposta genérica por
  motivos de privacidade — não dá para revelar se um username existe ou
  não para quem não tem permissão, então a ambiguidade pode ser
  intencional).
- **Social lists/connections**: sem estado de erro dedicado visível na
  leitura — falha de fetch não tratada explicitamente em
  `SocialSettings.tsx`/aba connections além do padrão genérico.

## 31. Responsive Risks (estático)

Não testado em runtime (fica para E1). Pontos estruturais que merecem
atenção por serem grids/flex fixos: cabeçalho do perfil (avatar +
nome + contadores), `profile-top5-row` (grid de 5 colunas fixas),
`profile-list-grid` (2 colunas fixas com breakpoint único em 700px).

## 32. A11y Risks

- Botões de seguir/aceitar/recusar em `SocialSettings.tsx` e na aba de
  conexões usam ícone + texto (melhor que icon-only), mas não foram
  auditados por `aria-label`/`aria-pressed` explícitos.
- Avatar upload (`AvatarSettings.tsx`) não auditado em profundidade
  nesta rodada — candidato a checagem direta em E1.
- Tabs do perfil (`role`/`aria-selected` em `.profile-tabs button`) —
  não confirmado se usa semântica de tabs real (`role="tablist"`) ou só
  botões estilizados.
- Modal de followers/following (`profile-connections-modal`) — tem
  `onMouseDown` para fechar ao clicar fora, mas fechamento por Escape
  não confirmado nesta leitura.

## 33. Dead Code

Nenhum componente ou hook de Profile/Social com zero importadores foi
encontrado — diferente da situação de `useLists`/`useTags` na D1, aqui
tudo que existe tem pelo menos um consumidor real. O único candidato a
"código morto" é conceitual, não um arquivo: a aba "Atividade" do perfil
público **poderia** ter usado `activity_events` e não usa — não é morto,
é uma segunda implementação paralela (§10).

## 34. Product Capabilities

| Capacidade | Status |
|---|---|
| Perfil próprio | ALREADY EXISTS |
| Edição de perfil (nome/bio/avatar/@) | ALREADY EXISTS |
| Avatar upload | ALREADY EXISTS |
| Perfil público | ALREADY EXISTS |
| Follow (seguir/aceitar/recusar/deixar de seguir) | ALREADY EXISTS |
| Followers/following (listagem) | ALREADY EXISTS, sem paginação |
| Activity log pessoal | ALREADY EXISTS (`activity_events` + `/api/activity`) |
| Activity no perfil público | PARTIAL (existe, mas não usa o log real) |
| Feed social (de quem eu sigo) | MISSING |
| Listas públicas | ALREADY EXISTS (D1) |
| Reviews públicas | ALREADY EXISTS |
| Favoritos públicos | ALREADY EXISTS |
| Busca de usuários | ALREADY EXISTS, sem filtro de privacidade |
| Privacidade granular por seção | ALREADY EXISTS |
| Block/mute/report | MISSING |

## 35. Não inventado

Nada nesta auditoria presume uma capacidade que não foi encontrada em
código. Toda linha de "MISSING" (§34) e toda lacuna citada nas seções
anteriores foi confirmada por ausência de tabela/rota/componente, não
por suposição do nome da fase.

## 36. Proposta E1 — Profile & Social Consolidation

### MUST

- Unificar a UI de follow: escolher **um** lugar canônico (aba
  "Conexões" do perfil é o candidato natural, já que é onde o visitante
  também vê a informação) e fazer `SocialSettings.tsx` reaproveitar esse
  mesmo componente/lógica em vez de reimplementar do zero, ou linkar
  para lá.
- Adicionar paginação real (LIMIT/OFFSET) em followers/following, tanto
  em `/api/follows` quanto em `/api/public-profile/[username]` — mesmo
  padrão de correção aplicado à Library na D1.
- Consolidar a regex de username num único lugar (constante
  compartilhada ou pelo menos comentário cruzado apontando as 3 cópias),
  reduzindo risco de divergência futura.
- Corrigir o drift de schema: adicionar `public.username_changes` ao
  `supabase/schema.sql` versionado (documentação, não migration nova —
  a tabela já existe em produção).
- Adicionar filtro de privacidade em `/api/search/users` (não expor
  perfis privados na busca, ou decidir explicitamente que é aceitável
  hoje e documentar o porquê).

### SHOULD

- Extrair um componente `Avatar` de exibição reutilizável (hoje
  duplicado como `<img>`/iniciais inline em pelo menos dois lugares).
- Decidir se a aba "Atividade" do perfil público passa a ler
  `activity_events` (unificando com Home/Diário/Retrospectiva) ou se as
  duas implementações continuam paralelas por serem semanticamente
  diferentes (uma é "o que mudou no meu status", outra é "o que está na
  minha biblioteca agora") — decisão de produto, não só técnica.
- Separar visualmente (ou por aba) Account de Social dentro de
  `/settings`, já que hoje `AccountPrivacy` + `SocialSettings` +
  `DataBackup` estão todos empilhados na mesma aba "Conta e privacidade".
- Confirmar (e corrigir se necessário) se `followers_count`/
  `following_count` vêm de `COUNT(*)` ou de `.length` sobre array
  completo.

### DEFER

- Feed social (atividade de quem eu sigo) — feature nova, não um bug;
  fora do escopo de consolidação.
- Block/mute/report — feature nova de segurança, decisão de produto
  maior, não cabe como parte de uma consolidação.
- Limite de tamanho para `bio`/`display_name` — baixo risco, não
  bloqueante.
- Reduzir a redundância `is_public`/`visibility` para um único campo —
  tocaria todas as queries que hoje checam os dois com `OR`; risco maior
  que o benefício numa fase de consolidação.

## 37. Product Decisions Needed

1. **Follow UI duplicada**: consolidar em um único componente
   reutilizado, ou manter as duas implementações por serem contextos
   diferentes (perfil vs. settings)?
2. **Activity do perfil público**: migrar para `activity_events` (unifica
   com Home/Diário/Retrospectiva) ou manter a derivação atual de
   `library_items` (mais simples, já funciona)?
3. **Fronteira Account/Social em `/settings`**: separar em abas
   distintas agora, ou aceitar que continuem juntas por ora?
4. **`/api/search/users` sem filtro de privacidade**: adicionar filtro
   agora (perfis privados somem da busca) ou é intencional (busca
   sempre encontra o perfil, só o conteúdo fica bloqueado)?
5. **`username_changes` fora do schema.sql**: só documentar o drift
   (adicionar ao arquivo versionado) ou investigar se há outras tabelas
   na mesma situação antes de fechar E1?

## Audit closeout

- `PRODUCT CODE DIFF = 0`.
- Nenhum endpoint, migration, pacote, alteração de comportamento,
  commit ou push nesta auditoria.
- Inspeção de banco: nenhuma — toda a análise de schema veio de
  `supabase/schema.sql` versionado, conforme instrução da fase.
