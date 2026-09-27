# F0 — Auditoria de Premium Features

**Data:** 2026-09-27
**Escopo:** auditoria read-only de produto e arquitetura. Nenhum código de
produto, banco, rota ou comportamento foi alterado. Fase E encerrada em
`7426af1 feat(profile): complete profile and social`; checkpoint inicial
estava limpo.

> **Status: F0 = DONE, F1 = DONE. Fase F encerrada.** A implementação de
> F1 (consolidação a partir da proposta da seção 30) está documentada em
> [`docs/PREMIUM-UI-V2.md` § 29](./PREMIUM-UI-V2.md#29-fase-f1--premium-features-consolidation-done).
> As seções abaixo permanecem como registro fiel do estado encontrado
> **antes** de F1.

## 1. Definição real da Fase F no roadmap

`docs/PREMIUM-UI-V2.md` § 20 (Roadmap) **não define** o escopo de F — é
uma única linha, `**F — Premium Features** = NEXT`, sem lista de
features, sem critérios, sem seção dedicada (diferente de B, C, D, E, que
têm subseções detalhadas). Não há nenhuma outra menção a "Premium
Features" como conceito de produto em nenhum outro ponto do documento.

Isso significa que "Premium" **não é definido pelo nome da fase** — foi
necessário auditar o código para descobrir quais features substanciais
já existem e ainda não foram cobertas por nenhuma fase anterior (A-E
cobriram: fundação visual, Discover/Search, Media/Title experience,
Library/Lists, Profile/Social/Follow). O que sobra — e que esta auditoria
mapeia — é: Stats, Calendário, Diário, Retrospectiva, Pick for Me, For
You, Notificações, Export/Backup.

## 2. PREMIUM MEANS

**Advanced features do produto, não um sistema pago.** Ver § 6.

## 3. Busca app-wide (termos reais + candidatos do enunciado)

Buscados: `premium`, `stats`, `analytics`, `calendar`, `diary`,
`retrospective`, `pick for me`, `recommendations`, `achievements`,
`notifications`, `export`, `backup`, `sharing`, `achievement`, `badge`,
`streak`, `milestone`, `stripe`, `subscription`, `paywall`, `billing`,
`checkout`, `plan`.

Classificação dos matches relevantes:

| Área | Classificação |
|---|---|
| `app/stats/page.tsx` | PRODUCT/UI |
| `app/calendar/page.tsx` + `app/api/calendar/route.ts` | PRODUCT/UI + API |
| `app/diary/page.tsx` | PRODUCT/UI (sem API própria — reusa `/api/activity`) |
| `app/retrospective/page.tsx` | PRODUCT/UI (sem API própria — reusa `/api/activity`) |
| `components/PickForMe.tsx` + `app/api/pick-for-me/route.ts` | PRODUCT/UI + API |
| `app/for-you/page.tsx` + `app/api/for-you/route.ts` | PRODUCT/UI + API |
| `app/api/notifications/route.ts`, `app/api/profile/notifications/route.ts`, `components/NotificationCenter.tsx`, `components/NotificationSettings.tsx` | API + PRODUCT/UI |
| `public.notifications`, `public.notification_preferences` (schema.sql) | DB |
| `components/DataBackup.tsx`, `app/api/account/export/route.ts`, `app/api/account/import/route.ts`, `app/api/account/import/letterboxd/route.ts` | PRODUCT/UI + API |
| "sharing" (share URL/imagem/card) | **ausente** — nenhum match real |
| "achievement"/"streak"/"milestone" | **ausente** — nenhum match real |
| "badge" | apenas componente de UI (`components/ui/Badge.tsx`, chips de status) — não é gamificação |
| "stripe"/"subscription"/"paywall"/"billing"/"checkout"/"plan" | **ausente** — único hit é `AuthSubscription` do better-auth (`unsubscribe()` de listener de sessão), não é assinatura paga |

## 4. Mapa de Features F

### Stats — EXISTS

- **ROUTE**: `/stats` (`app/stats/page.tsx`, 786 linhas).
- **UI**: página própria, sem componente compartilhado dedicado.
- **API**: nenhuma própria — reusa `GET /api/library` (sem `paginated=true`, ou seja, o modo que devolve a biblioteca inteira sem filtro).
- **DB**: indiretamente `library_items`/`media` via `/api/library`.
- **AUTH**: autenticado (herdado de `/api/library`).
- **DATA SOURCE**: `fetch("/api/library", { cache: "no-store" })` — biblioteca inteira do usuário, sem paginação.
- **MAIN GAPS**: toda agregação (contagem de filmes/séries, nota média, gêneros, anos, distribuição de notas, horas assistidas, reassistidos, maior nota) é feita em `useMemo` sobre o array completo em JS — nenhuma agregação SQL. Distribuição de notas itera o array 10 vezes (uma por faixa). Sem paginação, sem limite — cresce linearmente com o tamanho da biblioteca. Sem biblioteca de gráficos — barras são `<div style={{width: pct+"%"}}>`.

### Calendar — EXISTS

- **ROUTE**: `/calendar` (`app/calendar/page.tsx`) + `GET /api/calendar` (`app/api/calendar/route.ts`, 702 linhas).
- **UI**: página própria.
- **API**: `/api/calendar?scope=library|all`.
- **DB**: `library_items`/`media` via SQL direta (`SELECT li.id, li.status, ... FROM library_items li JOIN media m ...`).
- **AUTH**: autenticado.
- **DATA SOURCE**: híbrida — SQL para os itens elegíveis da biblioteca, depois uma chamada TMDB por título elegível em paralelo (`Promise.allSettled(eligible.map(...))`) para buscar próximos episódios/lançamentos, mais `upcomingDiscoveriesTMDB(120)` quando `scope=all`.
- **MAIN GAPS**: padrão N+1 real (uma chamada TMDB por título elegível), mitigado por `next: {revalidate}` no `lib/tmdb.ts` e pelo modo `scope=library` mais leve — mas ainda N chamadas externas por requisição em `scope=all`. Filtra episódios anteriores à temporada atual do usuário com lógica própria (linhas 393-406), duplicando conceitualmente parte do raciocínio de progresso de C5 (`lib/episode-progress.ts`) em vez de importar de lá. `Cache-Control: private, max-age=30`.

### Diary — EXISTS

- **ROUTE**: `/diary` (`app/diary/page.tsx`).
- **UI**: página própria, timeline agrupada por dia.
- **API**: nenhuma própria — reusa `GET /api/activity?limit=500`.
- **DB**: `public.activity_events` (a mesma tabela canônica da Fase E1), não `watch_entries`.
- **AUTH**: autenticado (só o próprio usuário — `/api/activity` é own-only).
- **DATA SOURCE**: `fetch("/api/activity?limit=500", { cache: "no-store" })` — limitado server-side a 1000 no máximo, então bounded, não full-fetch.
- **MAIN GAPS**: nenhuma edição (é um render read-only do log de eventos). "Paginação" é só o único fetch de até 500 itens — sem "carregar mais" real. Sobreposição de conceito com a aba "Atividade" do perfil (Fase E1) é esperada e correta — ambas já usam `activity_events` como fonte única, exatamente o que E1 estabeleceu.

### Retrospective — EXISTS

- **ROUTE**: `/retrospective` (`app/retrospective/page.tsx`).
- **UI**: página própria, por ano.
- **API**: nenhuma própria — reusa `GET /api/activity?year=${year}&limit=1000`.
- **DB**: `public.activity_events`.
- **AUTH**: autenticado.
- **DATA SOURCE**: `/api/activity` com filtro de ano, capado em 1000 — bounded.
- **MAIN GAPS**: cálculo de "highlights" com pesos arbitrários no client (+1 adicionado, +2 temporada completa, +3 reassistido, +5 série completa) — não documentado como fórmula de produto em nenhum lugar, só existe no código. Sem captura de tela/compartilhamento (nenhum `html2canvas`/exportação encontrado). Sem estado dedicado para "ano sem nenhuma atividade" confirmado nesta leitura (candidato a checagem em runtime na F1).

### Pick for Me — EXISTS

- **UI**: `components/PickForMe.tsx` (3669 linhas), modal/roleta.
- **API**: `POST /api/pick-for-me` (`app/api/pick-for-me/route.ts`, 1461 linhas) + `/api/not-interested` + `/api/discover/filters`.
- **DB**: não consulta a biblioteca do usuário para o algoritmo em si (só para os filtros "excluir já assistidos"/"excluir da biblioteca") — o universo de candidatos vem do TMDB `/discover`.
- **AUTH**: autenticado (para excluir biblioteca/hidden e registrar "não tenho interesse").
- **DATA SOURCE**: TMDB `/discover/{movie|tv}` sobre um pool de páginas aleatorizado, pontuado por `confidenceScore()` (nota × confiança de votos + popularidade, ajustado por modo: seguro/popular/descoberta/joias raras), escolhido por sorteio ponderado (`weightedPick`) entre os 45–70 melhores candidatos.
- **MAIN GAPS**: componente standalone, não reaproveitado em outras telas. Filtros: tipo de mídia, gênero (com ponte de IDs filme/TV), provedores de streaming, país, década, nota mínima, duração, excluir assistidos, excluir da biblioteca, modo "me surpreenda".

### For You (Personalização) — EXISTS

- **ROUTE**: `/for-you` (`app/for-you/page.tsx`, 2618 linhas) + `GET /api/for-you` (`app/api/for-you/route.ts`, 1604 linhas).
- **UI**: feed de prateleiras (`Shelf[]`) com paginação/"carregar mais", cada prateleira com `based_on` (explicação) e chips de `profile.favorite_genres`.
- **DB**: consulta SQL da biblioteca/hidden do usuário, combinada com chamadas TMDB por prateleira.
- **AUTH**: autenticado.
- **DATA SOURCE**: híbrida SQL + TMDB, mesmo padrão do Calendar.
- **MAIN GAPS**: nunca foi auditado como feature própria em nenhuma fase anterior — só teve sua *preview dialog* migrada durante a consolidação C2 (Quick Peek). A lógica do feed em si (algoritmo de prateleiras, paginação, N+1 potencial das chamadas TMDB por prateleira) é território novo para esta auditoria. Distinto de Discover (Fase B, navegação geral) e de Pick for Me (sorteio único) por ser um feed persistente e explicado.

### Notifications — EXISTS (PARTIAL na prática)

- **UI**: `components/NotificationCenter.tsx` (sino, dropdown, poll a cada 20s com `visibilitychange`), `components/NotificationSettings.tsx` (preferências).
- **API**: `GET/PATCH /api/notifications` (lista + marcar lido), `GET/PUT /api/profile/notifications` (preferências).
- **DB**: `public.notifications` (`type` restrito por CHECK a `('new_season','new_episode')` apenas!) e `public.notification_preferences` (8 colunas `_site`/`_email`, incluindo `new_follower_*`, `follow_request_*`, `review_like_*`, `product_updates_email`).
- **AUTH**: autenticado, RLS própria (`own notifications`/`own notification preferences`).
- **DATA SOURCE**: `SELECT ... WHERE user_id ORDER BY created_at DESC LIMIT 30` + contagem de não lidos.
- **MAIN GAPS — achado concreto, não especulativo**:
  1. A tabela `notifications` só aceita `type IN ('new_season','new_episode')` por CHECK constraint no banco. As preferências de `new_follower`/`follow_request`/`review_like` **não têm como se materializar em uma notificação real** hoje — a Fase E1 implementou o follow system inteiro sem nunca escrever em `notifications` (confirmado: único produtor de linhas em `notifications` é `app/api/library/sync-seasons/route.ts`, que só escreve `new_season`/`new_episode`).
  2. `review_like` não tem NENHUMA feature de "curtir review" por trás — nenhuma tabela, rota ou UI de like em reviews existe em lugar nenhum do código. A preferência é para uma feature que nunca foi construída.
  3. Toggles `_email` existem no schema e na UI de preferências, mas **nenhum código de envio de e-mail existe** (busca por `nodemailer`/`resend`/`sendgrid`/`sendEmail` no repo: zero resultados). O toggle é armazenado mas inerte.
  4. Sem paginação real além do `LIMIT 30` fixo, sem "carregar mais".

### Export/Backup — EXISTS

- **UI**: `components/DataBackup.tsx` (740 linhas).
- **API**: `GET /api/account/export` (JSON ou CSV via `?format=csv`), `POST /api/account/import` (591 linhas), `POST /api/account/import/letterboxd` (270 linhas, casamento fuzzy título+ano contra TMDB).
- **DB**: `library`, `watch_entries`, `user_hidden_titles`, `activity_events`, todos `WHERE user_id = ...` (escopo do próprio usuário).
- **AUTH**: autenticado, dono only.
- **DATA SOURCE**: export lê tudo do próprio usuário (aceitável, escopo individual). Import é **aditivo/upsert, nunca destrutivo** — todo INSERT usa `ON CONFLICT`, nenhum `DELETE`/`TRUNCATE` encontrado.
- **MAIN GAPS**: limite de 10 MB (`MAX_BACKUP_BYTES`) já aplicado via `readJsonWithLimit`. Nenhum risco destrutivo identificado — não é um gap, é uma confirmação de que já está seguro.

### Sharing — MISSING

Nenhuma geração de URL compartilhável, imagem/card, ou captura de tela
encontrada em nenhuma página (Retrospective incluído, onde seria mais
esperado). Único hit de "share" no repo é o atributo `allow="web-share"`
de um iframe do YouTube em `components/title/TitleTrailer.tsx` —
permissão de embed, não uma feature do produto.

### Achievements — MISSING

**ACHIEVEMENTS EXIST = NÃO.** Nenhuma tabela, rota, componente ou termo
(`achievement`, `streak`, `milestone`) encontrado em lugar nenhum do
código. Não há gamificação de nenhum tipo hoje.

### Personalization — PARTIAL/EXISTS

Três conceitos distintos, todos reais, nenhum deles um "motor de
recomendação com IA":

1. **For You** (`app/for-you`) — prateleiras explicadas por gênero/perfil.
2. **Pick for Me** (`components/PickForMe.tsx`) — sorteio ponderado avulso.
3. **`lib/preferences.ts`** — preferências de aparência/tema, não de conteúdo.

Nenhum dos três usa um modelo de ML/IA — são heurísticas determinísticas
(pontuação + sorteio ponderado, ou filtro por gênero favorito). `lib/
title-related.ts` (Fase C6) é relacionado apenas a um título específico,
não a personalização de perfil — categoria diferente, já coberta.

## 5. Reuso de foundations A-E (não reconstruir)

Confirmado disponível e já reaproveitado nas features acima:

- `components/media/MediaCard.tsx`, `components/PosterGrid.tsx`, `components/media/preview/MediaPreviewDialog.tsx` — usados por For You e (indiretamente) por Discover/Library.
- `lib/tmdb.ts` — `img`, `calendarTMDB`, `upcomingDiscoveriesTMDB`, `searchTMDB` — já compartilhado entre Calendar, Pick for Me, For You, import do Letterboxd.
- `app/api/activity/route.ts` (`activity_events`, Fase E1) — já é a fonte única para Diário E Retrospectiva (nenhuma reimplementação paralela encontrada — ponto positivo, confirma que a consolidação da E1 está de fato sendo respeitada por essas duas features).
- `app/lists/` (Fase D1) — não tocado por nenhuma Premium Feature auditada aqui; não há necessidade de integração nova identificada.
- `components/ToastProvider.tsx`, `components/ConfirmProvider.tsx` — já usados por Pick for Me, For You, NotificationCenter, NotificationSettings.

## 6. Premium sem paywall inventado

**PAID PREMIUM SYSTEM EXISTS = NÃO.**

Busca completa por `stripe`, `subscription`, `paywall`, `billing`,
`checkout`, `plan` não encontrou nenhum sistema de pagamento, assinatura
ou plano. O único hit (`AuthSubscription` em `components/AccountMenu.tsx`)
é o tipo de callback `unsubscribe()` de um listener de sessão do
better-auth — nada a ver com cobrança. "Premium" no nome da fase refere-se
a features avançadas do produto, não a monetização. Esta auditoria **não
propõe** Stripe, assinatura ou paywall — não há evidência no roadmap para
isso.

## 7. Ownership por feature

| Feature | Data | Rendering | Mutations | Cálculos derivados | Cache |
|---|---|---|---|---|---|
| Stats | `/api/library` (full) | `app/stats/page.tsx` | nenhuma | client (`useMemo`) | `no-store` |
| Calendar | `/api/calendar` (SQL+TMDB) | `app/calendar/page.tsx` | nenhuma | server (parcial) | `private, max-age=30` |
| Diary | `/api/activity` | `app/diary/page.tsx` | nenhuma | client (agrupamento por dia) | `no-store` |
| Retrospective | `/api/activity` | `app/retrospective/page.tsx` | nenhuma | client (`highlights`, pesos) | `no-store` |
| Pick for Me | `/api/pick-for-me` (TMDB) | `components/PickForMe.tsx` | `/api/not-interested` | server (scoring) | por chamada |
| For You | `/api/for-you` (SQL+TMDB) | `app/for-you/page.tsx` | ações de biblioteca inline | server (prateleiras) | por chamada |
| Notifications | `/api/notifications` | `NotificationCenter.tsx` | PATCH (marcar lido) | nenhum | poll 20s |
| Export/Backup | `/api/account/export|import` | `DataBackup.tsx` | export/import | nenhum | nenhum |

Nenhuma duplicação de ownership encontrada entre essas features — cada
uma tem uma única fonte de dados e um único ponto de mutação.
Duplicação real está DENTRO de Calendar (lógica de progresso paralela a
C5) e na ausência de escrita em `notifications` para os tipos que a
Fase E1 já preparou nas preferências.

## 8-17. (Ver mapa de features acima — Stats/Calendar/Diary/Retrospective/
Pick for Me/Notifications/Export/Sharing/Achievements/Personalization já
cobertos em detalhe na § 4.)

## 18. Banco de dados — tabelas usadas pelas Premium Features

| Tabela | Uso | PK/FK/unique relevantes |
|---|---|---|
| `public.activity_events` | Diary, Retrospective (leitura via `/api/activity`) | já mapeada na E1 |
| `public.notifications` | Notifications | PK `id`, unique `(user_id, event_key)`, CHECK `type IN ('new_season','new_episode')`, índice parcial `(user_id, created_at desc) WHERE read_at IS NULL` |
| `public.notification_preferences` | Notifications (preferências) | PK `user_id`, 8 colunas boolean `_site`/`_email` |
| `public.watch_entries` | Export/Backup (não usada por Diary, ao contrário do que o nome sugeriria) | já referenciada em D1/E1 |
| `public.user_hidden_titles` | Export/Backup, Pick for Me (excluir) | já existente, não auditada em profundidade aqui |
| `public.library_items`/`public.media` | Stats, Calendar, For You | já mapeadas em D0/D1 |

Nenhum drift de schema novo encontrado nesta auditoria (diferente de
`username_changes` na E1). Nenhuma consulta a produção — leitura só do
`supabase/schema.sql` versionado, conforme instrução da fase.

## 19. Performance

| Risco | Classificação |
|---|---|
| Stats: fetch completo da biblioteca + agregação 100% client-side | **HIGH** |
| Calendar: uma chamada TMDB por título elegível em `scope=all` (N+1 externo) | **MEDIUM** (mitigado por cache de 6h no `lib/tmdb.ts` e por `scope=library`) |
| For You: chamadas TMDB por prateleira, não medido em profundidade nesta leitura | **MEDIUM** (candidato a runtime check em F1) |
| Notifications: poll de 20s, mas já traz só `LIMIT 30` + contagem — não é full fetch | **LOW** |
| Diary/Retrospective: já bounded por `LIMIT` no servidor | **LOW** |
| Pick for Me: chamadas TMDB pontuais por sorteio, não recorrentes | **LOW** |

## 20. Cache

- Stats: `cache: "no-store"` no client, sem cache de servidor.
- Calendar: `Cache-Control: private, max-age=30` no servidor.
- Diary/Retrospective: `cache: "no-store"` no client; `/api/activity` não define `Cache-Control` próprio além do padrão da rota.
- Pick for Me/For You: por chamada, sem cache explícito adicional além do `next: {revalidate}` do `lib/tmdb.ts` para os endpoints TMDB subjacentes.
- Notifications: poll client-side de 20s, sem cache de servidor além do padrão.

## 21. Auth/Privacy

Todas as features desta fase são **autenticadas, escopo do próprio
usuário, sem superfície pública/guest** — diferente de Library (D1) e
Profile (E1), que têm modos público/privado. Nenhuma dessas oito
features tem qualquer noção de visibilidade para terceiros. Isso é
consistente: são todas ferramentas pessoais (estatísticas, calendário,
diário, retrospectiva, recomendação, notificações, backup), não conteúdo
social.

## 22. Responsive (estático)

Não testado em runtime (fica para F1). Superfícies estruturalmente
arriscadas por conterem grids/tabelas/gráficos fixos: Stats (barras e
grids de estatísticas), Calendar (grade de dias), Retrospective
(timeline + destaques), For You (grid de prateleiras).

## 23. A11y (riscos identificados, não exaustivo)

- Stats: barras CSS sem texto alternativo/`aria-label` com o valor
  numérico (não confirmado se o número aparece como texto visível ao
  lado — candidato a checagem em runtime).
- Calendar: navegação de dias/semanas por teclado não confirmada nesta
  leitura.
- NotificationCenter: dropdown do sino — não confirmado se usa
  `aria-expanded`/`role="menu"` ou fecha por Escape.
- Pick for Me: modal — não confirmado foco/trap nesta leitura (arquivo
  muito grande, não lido por completo).
- DataBackup: ações de export/import (download/upload) — rotulagem de
  botões não confirmada.

## 24. Chart foundation

**Nenhuma biblioteca de gráficos instalada** (`package.json` não tem
recharts/chart.js/visx/d3/nivo/victory). Stats e Retrospective renderizam
barras via `<div style={{width: pct+"%"}}>` puro CSS. Não instalar nada
nesta auditoria — registrado apenas como ausência.

## 25. Empty/Error/Loading

Não auditado em profundidade linha a linha para cada feature nesta
rodada (a pesquisa focou em existência/arquitetura/performance, conforme
prioridade da fase) — candidato a checagem explícita em runtime na F1
para cada uma das 8 features.

## 26. Dead code

- `review_like_site`/`review_like_email` em `notification_preferences`:
  colunas com UI de toggle funcional, mas **sem nenhum produtor real**
  (nenhuma feature de "curtir review" existe) — não é código morto no
  sentido de "sem chamador", é uma preferência configurável para uma
  feature inexistente. Não remover nesta fase (decisão de produto, não
  auditoria).
- Nenhum componente/hook com `caller = 0` encontrado nas oito features
  auditadas.

## 27. Already/Partial/Missing/Legacy (escopo real de F)

| Status | Itens |
|---|---|
| **ALREADY EXISTS** | Stats, Calendar, Diary, Retrospective, Pick for Me, For You, Export/Backup |
| **PARTIAL** | Notifications (infraestrutura pronta para `new_season`/`new_episode`; preferências para `new_follower`/`follow_request`/`review_like` sem produtor possível hoje) |
| **MISSING** | Sharing, Achievements |
| **LEGACY** | nenhum encontrado — diferente de D0/E0, esta área do código não carrega gerações abandonadas |

## 28. Cross-phase foundations reutilizáveis

Ver § 5 — MediaCard, PosterGrid, MediaPreviewDialog, `lib/tmdb.ts`,
`activity_events`/`/api/activity`, ToastProvider, ConfirmProvider. Lists
(D1) e o follow system (E1) não têm integração pendente identificada com
nenhuma Premium Feature.

## 29. Product Decisions Needed

1. **Stats — agregação SQL vs. manter client-side**: a biblioteca típica
   ainda é pequena o suficiente para tolerar fetch completo + agregação
   em JS, ou já vale mover para `COUNT`/`GROUP BY` no servidor (mesmo
   padrão da correção feita em Library na D1)?
2. **Notifications — implementar `new_follower`/`follow_request` de
   verdade**: alterar o CHECK constraint de `notifications.type` para
   aceitar esses tipos e fazer o follow system (E1) escrever essas
   linhas, ou remover essas colunas de preferência por enquanto (feature
   nunca vai existir)?
3. **`review_like` — remover a preferência ou é sinal de uma feature
   futura fora do escopo de F1**? Não inventar "curtir review" na F1 sem
   decisão explícita.
4. **Toggles de e-mail (`_email`)**: manter armazenados e inertes (sem
   envio real) como estão, ou é preciso deixar isso explícito na UI
   ("em breve") para não prometer algo que não acontece?
5. **Calendar — reusar `lib/episode-progress.ts`** para a lógica de
   "não mostrar episódios atrás de onde o usuário está" em vez de manter
   a versão local duplicada, ou é aceitável a duplicação por serem
   contextos ligeiramente diferentes (progresso vs. calendário)?
6. **Sharing**: entra no escopo de F1 como feature nova (ex.: card de
   Retrospectiva compartilhável), ou fica de fora por não haver nenhuma
   base de código para partir?
7. **Achievements**: confirmar que fica fora do escopo de F1 (gamificação
   é uma feature grande e nova, não uma consolidação).
8. **For You vs. Pick for Me vs. Discover**: as três já são
   suficientemente diferentes e intencionais, ou alguma sobreposição
   deveria ser resolvida nesta fase?

## 30. Proposta F1 — Premium Features Consolidation

### MUST

- Runtime QA completo das 7 features já existentes (Stats, Calendar,
  Diary, Retrospective, Pick for Me, For You, Export/Backup):
  loading/error/empty, responsivo, a11y — nada disso foi testado em
  runtime nesta auditoria read-only.
- Corrigir o full-fetch + agregação 100% client-side do Stats (HIGH) —
  mover para SQL, mesmo padrão já estabelecido na D1 para Library.
- Resolver a lacuna de Notifications: ou (a) ligar `new_follower`/
  `follow_request` de verdade ao follow system da E1, ou (b) remover as
  preferências que não podem se materializar — uma das duas, não deixar
  como está (preferência configurável que nunca faz nada é uma UI
  enganosa).

### SHOULD

- Investigar e, se necessário, reduzir o padrão N+1 externo do Calendar
  em `scope=all` (ele já tem mitigação de cache, mas vale confirmar em
  runtime que não vira um risco real).
- Reaproveitar `lib/episode-progress.ts` no Calendar em vez de manter a
  lógica de "episódios atrás do progresso" duplicada, se a decisão de
  produto (§29.5) confirmar que são o mesmo conceito.
- A11y dos itens identificados em § 23 (dropdown de notificações, modal
  de Pick for Me, rótulos de export/import).

### DEFER

- Sharing (feature nova, sem base de código).
- Achievements/gamificação (feature nova, grande, fora de consolidação).
- Biblioteca de gráficos para Stats/Retrospective — CSS bars continuam
  aceitáveis; introduzir uma dependência nova é uma decisão de produto
  maior, não uma correção.
- Envio real de e-mail para os toggles `_email` — infraestrutura de
  e-mail é uma feature nova (provider, templates, fila), não uma
  consolidação.

**Resultado da fase: F0 DONE. Próxima etapa: F1 — implementação
consolidada (aguardando decisões de produto acima).**
