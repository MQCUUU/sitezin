# H0 — Auditoria de Mobile / Accessibility / Performance

**Data:** 2026-09-27
**Escopo:** auditoria read-only transversal de produto e arquitetura.
Nenhum código, CSS, banco ou comportamento foi alterado. Fase G
encerrada em `378aeda feat(motion): consolidate interactions and
reduced motion`; checkpoint inicial estava limpo.

> **Status: H0 = DONE.** Proposta de implementação em § "Proposta H1".
> Decisões de produto necessárias na seção correspondente.

## 1. Definição real de H no roadmap

Igual a E, F e G antes de suas próprias auditorias: `docs/PREMIUM-UI-V2.md`
não tem nenhuma seção dedicada a H — só o bullet `H —
Mobile/Accessibility/Performance`, sem lista de features, sem critérios.
Diferente de E0-G0, porém, H é explicitamente **transversal**: não audita
uma feature nova, audita o produto inteiro já construído (A-G) sob três
lentes (mobile, acessibilidade, performance). Esta auditoria cobre as 16
superfícies reais listadas no enunciado, sem reabrir decisões de produto
de nenhuma fase anterior.

## 2. Escopo

Superfícies auditadas: Home, Discover, Title (movie/tv), Episode detail,
Collection, Library, Lists, Profile, Settings, Stats, Calendar, Diary,
Retrospective, For You, Pick For Me, Notifications. Achados abaixo vêm
de leitura direta de código — nada foi inferido sem evidência.

## 3-4. Mobile estático + estratégia responsiva

**RESPONSIVE FOUNDATION** = mobile-first com breakpoints tokenizados
(`--mc-breakpoint-sm` 480px, `-md` 768px, `-lg` 1024px, `-xl` 1280px,
já confirmados na Fase G). Navegação: sidebar completa no desktop
(`components/Nav.tsx`, 12 itens) vs. bottom nav de 4 itens + overlay
"Mais" no mobile (bottom-sheet com scroll-lock e Escape-to-close, ambos
implementados corretamente).

**Achado real — z-index inconsistente**: `.mobile-more-backdrop` usa
`z-index:70` (hardcoded, legado) enquanto `.mc-topbar-actions` (sino +
avatar) usa `var(--mc-z-dropdown)` = 9000 (escala de tokens). Não
causa bug visual hoje (um é ancorado embaixo, outro em cima), mas é uma
escala de z-index não migrada — dois sistemas de camadas coexistindo.

Nenhum overlap real encontrado entre busca/conta/sino em 360-390px — o
topbar reserva espaço dinamicamente via `ResizeObserver`
(`TopbarActions.tsx`), e os componentes do canto encolhem juntos a
partir de 620px.

## 5. Touch targets

| Elemento | Tamanho | Status |
|---|---|---|
| `.mc-icon-btn` (padrão) | 40×40px | OK (limite) |
| `.mc-icon-btn--sm` | 32×32px | **abaixo de 40px** |
| `.mc-icon-btn--lg` | 48×48px | OK |
| `.notification-bell` | 42×42px | OK |
| botão "marcar como lida" (notificações) | 32×32px | **abaixo de 40px** |
| `.media-carousel-arrow` em mobile (`max-width:700px`) | 34×52px de largura | **abaixo de 40px de largura** |
| itens de `.mobile-nav` | `min-height:44px` | OK |

`IconButton.tsx` usa `size="md"` (40px) por padrão; os 3 casos abaixo do
limite usam variantes/classes menores deliberadamente escolhidas, não
um bug de omissão — mas ainda são targets pequenos em superfícies
tocadas com frequência (setas de carrossel, marcar notificação como
lida).

## 6. Hover-only

Nenhuma ação nova depende exclusivamente de hover — o gap de
`.card-actions` já foi corrigido na Fase G1 (`:focus-within` adicionado)
e nenhuma outra superfície hover-dependente foi encontrada nesta
auditoria transversal.

## 7. Navegação mobile

Já coberto em §3-4. Scroll-lock e Escape corretos na sheet "Mais". Sem
overlap de z-index causando bug visível hoje, mas escala não
consolidada (achado, não bug).

## 8. Diálogos

`.mc-dialog` usa `max-height: calc(100dvh - var(--mc-space-32))` —
`100dvh` (viewport dinâmico) em vez de `100vh`, então já se ajusta
corretamente quando o teclado mobile abre. **Gap real**: `.mc-dialog`/
`.mc-dialog-backdrop` não usam `env(safe-area-inset-*)` (padding fixo
`var(--mc-space-16)`), diferente de `.mobile-nav`, `.mobile-more-sheet`
e `.toast-viewport`, que já são safe-area-aware. Em um iPhone com
notch/home-indicator, o conteúdo do diálogo pode ficar mais perto da
borda física do que o resto do app.

## 9. Fundação de acessibilidade

`Dialog.tsx` (portal, focus trap, Escape, scroll lock, restore de foco)
e `Popover.tsx` são as primitivas reais de onde a maioria dos
diálogos/menus herda comportamento correto automaticamente.
`IconButton.tsx` obriga `aria-label` via tipo — funciona bem onde é
usado, mas **não é universal**: `components/ReviewPanel.tsx` tem um
botão de remover categoria que é um `<button>` cru (não usa
`IconButton`), com só `title`, sem `aria-label` — é exatamente o tipo de
gap que o guard de tipo do `IconButton` existe para prevenir, mas só
previne onde é de fato usado.

## 10. Landmarks

Exatamente um `<main id="conteudo-principal">`, skip-link aponta
corretamente para ele. Dois `<nav>` (desktop + mobile), cada um com
`aria-label` distinto — sem ambiguidade. Sem `<header>`/`<footer>`
explícitos no layout raiz (não é uma falha — o conteúdo de cabeçalho
vive no topbar de cada página, um padrão aceitável).

## 11. Hierarquia de headings

Spot-check em Home, Library, Stats, Profile: exatamente um `<h1>` por
página (Home tem dois `<h1>` no código-fonte, mas em branches
mutuamente exclusivos — nunca os dois renderizam juntos). Nenhum salto
de nível encontrado (h1→h3 sem h2) nas 4 páginas verificadas.

## 12. Formulários

- `app/library/page.tsx` — campo de ordenação **corretamente** associado
  via `<label>` visível envolvendo o `<select>`.
- `app/settings/page.tsx` — **gaps reais**: o `<select>` de "Ordem da
  biblioteca" não está associado a nenhum label (nem `htmlFor` nem
  `aria-labelledby`); os inputs de nome e peso de categoria de
  avaliação não têm NENHUM nome acessível (nem label, nem placeholder,
  nem aria-label) — pior caso encontrado.
- Nenhum uso de `aria-invalid`/`aria-describedby` em formulário nenhum
  do app, apesar de `components/ui/Input.tsx`/`Textarea.tsx` já
  implementarem esse suporte — adoção baixíssima (só 5 arquivos usam
  esses primitives; Settings/Library/avaliação usam `<input>`/`<select>`
  crus).

## 13. Botões icon-only

Amostra ampla (Notifications, AccountMenu, PosterGrid, CarouselRail,
EpisodeBrowser, AddToListDialog, MediaPreviewDialog) majoritariamente
**GOOD** — `aria-label` presente e correto, `aria-pressed`/
`aria-expanded`/`aria-haspopup` usados onde cabe. **Um gap real
confirmado**: `components/ReviewPanel.tsx` — botão de remover categoria
(`Trash2`) só tem `title`, sem `aria-label` (TOOLTIP-ONLY).

## 14. Teclado

Carrossel: setas são `<button>` reais, Tab+Enter/Espaço funcionam
nativamente — não depende de gesto. **Menu de status**
(`library-card-status-menu` e equivalentes): trigger já tem
`aria-haspopup`/`aria-expanded` corretos (D1), Escape fecha, mas **o
foco não entra automaticamente no menu ao abrir, e não há navegação por
setas entre os itens** — funciona via Tab em ordem de DOM (não é um
bloqueio de teclado), mas não segue o padrão ARIA completo de menu.
`MediaPreviewDialog` — 100% herdado do `Dialog` primitive, já
confirmado sólido na Fase G.

## 15. Foco

Nenhum caso de foco totalmente perdido/inacessível encontrado nesta
rodada (o gap de `.card-actions` já foi fechado em G1). O menu de
status não retorna foco ao trigger ao fechar por Escape — inconsistente
com o `Dialog`, que já faz isso corretamente.

## 16. Live regions

Inventário extenso e consistente: `role="alert"`/`role="status"` +
`aria-live="polite"` usados de forma disciplinada em praticamente toda
página com estado de carregamento/erro (Library, Lists, Diary,
Favorites, Ranking, Retrospective, Stats, AsyncState, EpisodeBrowser,
Discover, Search, Title). `ToastProvider` diferencia corretamente
`alert` (erro) de `status` (demais) dentro de um container sempre
`aria-live="polite"`. Nenhum excesso ou ausência real encontrada.

## 17-18. Imagens / payload

`components/Poster.tsx` já documenta no próprio código uma migração
DELIBERADAMENTE gradual: existem ~45 tags `<img>` cruas em ~18 arquivos
pedindo sempre `w500` do TMDB independente do tamanho real exibido na
tela, e `Poster.tsx` é o mecanismo para trocar uma de cada vez, não uma
falha não percebida. Adoção atual: só 5 arquivos usam `<Poster>`.
`next/image` (`<Image>`) real: só 1 uso, dentro do próprio
`Poster.tsx`. Hero da Title page já correto (`priority` só no backdrop,
`sizes` calculado por breakpoint no poster, comentário explícito
explicando por que não duplicar `priority`). `alt` verificado como
não-vazio onde é conteúdo (avatar, poster) e vazio (`alt=""`) onde é
decorativo (avatar do AccountMenu) — nenhum padrão de `alt` incorreto
encontrado nas amostras.

## 19. Fontes

`next/font/google` (Inter) corretamente configurado com
`display:"swap"` — o próprio código documenta que isso corrigiu um bug
anterior real (a fonte era referenciada no CSS mas nunca carregada).
Sem gap.

## 20-21. Bundle / client boundaries

67 arquivos `"use client"`. Os 5 maiores: `PickForMe.tsx` (3668
linhas), `app/for-you/page.tsx` (2617), `app/page.tsx` (2380),
`app/collection/[id]/page.tsx` (2314), `app/library/page.tsx` (2220).
Nenhum é necessariamente "errado" — todos têm interatividade real que
justifica ser client — mas são candidatos naturais a divisão futura se
performance de bundle virar prioridade medida (não medida nesta
auditoria). `lucide-react` já 100% importado por nome (tree-shakeable),
nenhum import de namespace.

## 22-23. Data fetch / full fetch

Todos os full-fetches de `/api/library` já resolvidos/aceitos em D1
(Home, Discover) continuam corretos. **Achados novos, não cobertos por
D1/E1/F1**:

| Consumer | Situação |
|---|---|
| `app/ranking/page.tsx` | busca `/api/library` sem filtro nem paginação — não coberto por nenhuma fase anterior (D1 documentou isso como decisão deliberada de não mexer, mas nunca foi reavaliado desde então) |
| `app/lists/[id]/page.tsx` | busca a biblioteca inteira só para o seletor "adicionar título" |
| `components/ProfileShowcaseEditor.tsx` | idem, para o editor de Top 5 |
| `app/api/public-profile/[username]/route.ts` | query SEM LIMIT em `library_items` — usada para computar stats/reviews/liked_titles do perfil **público**, maior exposição que um export pessoal |
| `app/api/calendar/route.ts` | query sem LIMIT + fan-out N+1 contra TMDB (um `calendarTMDB()` por título elegível restante) |

Classificação: os três primeiros são **OPTIMIZABLE** (uso real, mas
poderiam usar os filtros que já existem na API de Library); os dois
últimos são **HIGH RISK estrutural** (cresce sem limite com o tamanho
da biblioteca do usuário, e o do perfil público expõe isso a qualquer
visitante, não só ao dono).

## 24. Polling

Só 2 pollings em todo o app, ambos já corretos (visibility-aware,
cleanup correto): `NotificationCenter` (20s) e `FollowRequestNotifier`
(30s). Nenhum novo polling encontrado.

## 25. Loops de requisição

Nenhum loop de auto-disparo encontrado. `app/u/[username]/page.tsx` e
`app/library/page.tsx` usam guards por valor primitivo ou por ref
(fingerprint de filtros, comparação de username) para evitar reexecução
indevida — os dois pontos mais complexos do app nesse quesito já são
seguros.

## 26. Cache

TMDB: 100% das chamadas passam por `revalidate` explícito (`lib/tmdb.ts`),
variando de 15 minutos (busca) a 7 dias (gêneros) — nenhuma chamada
"fresca a cada request" encontrada. `AbortController` usado de forma
desigual: busca (o caso de maior risco de corrida) já o usa; vários
outros fetches pontuais (Favorites, Ranking, ProfileShowcaseEditor,
NotificationCenter, FollowRequestNotifier, Profile) não usam, com risco
teórico de resposta antiga sobrescrever uma mais nova em re-disparos
rápidos — não confirmado como bug observado, é um risco estrutural.

## 27-28. Performance de banco / índices

**Sem LIMIT, não-single-row**: `public-profile/[username]/route.ts`
(biblioteca completa), `account/export` (legítimo — export é por
definição tudo do usuário), `calendar` (biblioteca completa do
usuário). `public-profile/[username]/activity` já paginado
corretamente (herda o padrão E1).

**ILIKE sem índice de padrão (trigram/GIN)**: `library.title`/
`original_title`, `search/users` (`username`/`display_name`),
`search/suggest` (mesmas colunas) — nenhuma tem índice trigram/GIN no
`schema.sql`; só `idx_media_title` (btree simples, não serve `ILIKE
'%...%'`) e o índice único de `lower(username)` (não serve padrão).
Existe uma tabela de busca dedicada (`search_media`/`search_people`,
~900k linhas) já preparada no schema, mas nenhuma rota consulta essas
tabelas ainda (comentário do próprio schema confirma isso).

**Índice faltando confirmado**: `public.follows` só tem a PK composta
`(follower_id, following_id)` — sem índice dedicado para `following_id`
sozinho, usado repetidamente (seguidores de um perfil, solicitações
recebidas). PK composta serve bem buscas por `follower_id` (prefixo
esquerdo), não por `following_id` isolado.

Todos os índices relacionados a `library_items`/`activity_events`/
`notifications` (as tabelas mais consultadas) já existem e cobrem os
padrões de query reais (confirmado, não hipotético).

## 29-30. Render / listas

Nenhum `.filter()/.sort()` não memoizado encontrado dentro do corpo JSX
de `for-you/page.tsx` ou `PosterGrid.tsx` — as transformações
encontradas vivem em handlers/updaters de estado, não no render.
`library/page.tsx`/`PickForMe.tsx` não foram auditados linha a linha
nesta rodada (não gargalos óbvios detectados por amostragem). Listas já
bounded: Library (27), Followers/Following (24), Activity (500-1000),
Stats genres/years (8-10). Sem bound confirmado: Ranking e List-detail
(mesmos achados de §22-23), Related titles na Title page (bounded pelo
próprio TMDB, não é um problema local).

## 31. Carrosséis

Scroll nativo assistido, arrows acessíveis, sem loop de animação
contínuo, reduced-motion já corrigido em G1. Nenhum novo achado.

## 32. Performance de CSS

`backdrop-filter`/`blur` combinados: ~41 ocorrências entre
`globals.css` e `styles/*.css` (variação pequena em relação à contagem
aproximada da auditoria de Motion, não uma regressão — só imprecisão de
contagem entre rodadas). Nenhuma ocorrência confirmada aplicando blur a
um elemento do tamanho da viewport inteira — todas em chrome pequeno
(modais, menus, botões). Confirmação completa por seletor fica como
follow-up se necessário, não bloqueante.

## 33. Regressão de Motion

Reduced-motion, Skeleton, Dialog, Carousel e foco/pressão da Fase G1
não foram tocados nem teriam motivo para regredir nesta auditoria
read-only — nenhuma alteração de código ocorreu.

## 34-35. Temas / dependência de cor

Não medido numericamente (fora do escopo de uma auditoria estática sem
ferramenta de contraste instalada — não instalada nesta fase, conforme
regra). Nenhum estado encontrado que dependa SÓ de cor sem
texto/ícone/rótulo acompanhando (status da biblioteca, notas, favoritos
já usam ícone+texto, confirmado em fases anteriores).

## 36. Gráficos

Stats/Retrospective já usam barras CSS com valor numérico textual ao
lado (confirmado nas Fases F1/G0) — sem gap novo.

## 37. Nomes acessíveis

Cobertos em §5/§13 — amostra ampla majoritariamente correta, com os 2
gaps já listados (ReviewPanel delete, formulários de Settings).

## 38-39. Erros de rota / loading UX

`app/error.tsx`, `app/global-error.tsx` e `app/not-found.tsx` (raiz)
existem — cobertura de erro global real. `loading.tsx` (Suspense nativo
do Next) só em 5 rotas (raiz, `/discover`, `/for-you`, `/library`,
`/title/[type]/[id]`) — as outras 11+ rotas fazem loading manual via
estado local (já com `role="status"` correto, per §16), não via
Suspense — não é um bug de UX per se, mas é uma inconsistência de
mecanismo (algumas rotas mostram um fallback antes mesmo do JS
carregar, outras só depois de hidratar).

## 40. Web Vitals

**WEB VITALS INSTRUMENTATION = NÃO.** Nenhuma ferramenta de medição
(web-vitals, Vercel Analytics, etc.) encontrada instalada. Não
recomendado instalar nesta fase (regra explícita) — registrado como
lacuna, não como ação.

## 41-42. SEO / Segurança

Fora do escopo desta auditoria — nenhum achado incidental de
segurança/privacidade encontrado durante a pesquisa (nada que
justifique registro).

## 43. Dívida técnica de A-G relevante a H

- D0/D1: Ranking permanece full-fetch, decisão antiga nunca revisitada.
- E0: índice de `follows.following_id` nunca endereçado.
- F0/F1: nenhuma pendência nova de mobile/a11y/performance introduzida.
- G0/G1: nenhuma pendência nova.

## 44. Classificação por prioridade

| Achado | Severidade | Tipo |
|---|---|---|
| `public-profile` biblioteca sem LIMIT, exposta a visitantes | HIGH | STRUCTURAL |
| Calendar N+1 + sem LIMIT | HIGH | STRUCTURAL |
| `follows.following_id` sem índice | MEDIUM | STRUCTURAL |
| ILIKE sem índice de padrão (4 rotas) | MEDIUM | STRUCTURAL |
| Ranking/List-detail/ProfileShowcaseEditor full-fetch | MEDIUM | STRUCTURAL |
| Formulários de Settings sem nome acessível | MEDIUM | MEASURED (confirmado em código) |
| `.mc-dialog` sem safe-area | LOW | MEASURED |
| Touch targets abaixo de 40px (3 casos) | LOW | MEASURED |
| Menu de status sem foco automático/setas | LOW | MEASURED |
| `ReviewPanel` botão sem aria-label | LOW | MEASURED |
| z-index legado vs. tokenizado | POLISH | MEASURED |
| AbortController ausente em fetches pontuais | LOW | INFERRED (risco teórico, não bug observado) |
| `loading.tsx` só em 5 rotas | POLISH | MEASURED |

## Proposta H1 — Mobile / Accessibility / Performance Consolidation

### MUST

- Adicionar `LIMIT`/paginação real à query de biblioteca em
  `public-profile/[username]/route.ts` — é a exposição mais ampla
  (perfil público) do padrão que D1 já corrigiu em Library.
- Reduzir/paginar a query de Calendar e reconfirmar o fan-out N+1 contra
  TMDB (já parcialmente mitigado, mas ainda sem teto).
- Adicionar índice em `follows(following_id)`.
- Corrigir os formulários de Settings sem nome acessível (select de
  ordenação, inputs de categoria de avaliação).
- Adicionar `aria-label` ao botão de remover categoria em
  `ReviewPanel.tsx`.

### SHOULD

- Migrar Ranking e List-detail para os filtros já existentes de
  `/api/library` (não é preciso "consertar", é preciso usar o que já
  existe).
- Avaliar índice trigram/GIN para as 4 rotas ILIKE, ou migrar para as
  tabelas `search_media`/`search_people` já preparadas.
- Adicionar `env(safe-area-inset-*)` ao `Dialog` primitive.
- Aumentar os 3 touch targets abaixo de 40px.
- Adicionar `AbortController` aos fetches pontuais de maior risco de
  corrida (Favorites, Ranking, ProfileShowcaseEditor).

### DEFER

- Web Vitals instrumentation (decisão de produto, não uma correção).
- Virtualização de listas (nenhuma lista hoje é grande o suficiente para
  justificar, exceto os full-fetches já listados como MUST/SHOULD).
- Migração completa das 45 tags `<img>` para `<Poster>`/`next/image`
  (já é uma migração deliberadamente gradual, não uma falha).
- `loading.tsx` para as 11 rotas restantes (cosmético, sem bug real).
- Reescrita de arquitetura de bundle/client-boundary dos 5 maiores
  arquivos (sem medição real de impacto).

## Product Decisions Needed

1. **Ranking**: migrar para filtro real agora (SHOULD) ou manter a
   decisão original da D1 de não mexer?
2. **Índice trigram/GIN vs. tabelas de busca dedicadas**: qual caminho
   para as 4 rotas ILIKE — adicionar índice nas tabelas atuais, ou
   finalmente conectar as rotas às tabelas `search_media`/`search_people`
   já existentes?
3. **Safe-area no Dialog**: aplicar globalmente (afeta todo modal do
   app) ou só nas superfícies mobile mais críticas?
4. **Web Vitals**: instalar alguma instrumentação em fase futura, ou
   ficar de fora do roadmap por ora?

## Audit closeout

- `PRODUCT CODE DIFF = 0`.
- Nenhuma alteração de código, CSS, pacote ou banco nesta auditoria.
- Inspeção de banco: nenhuma consulta a produção; leitura só de
  `supabase/schema.sql` versionado.
