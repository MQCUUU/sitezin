# MyCatalog Premium UI V2 — Design Bible

Fonte oficial de design da V2. Documento operacional — feito para ser lido
por outra IA/agente antes de tocar em UI, não um manifesto de marketing.

Status: **Fase A1 (fundação)**. Nenhuma página foi redesenhada ainda.

## 1. Princípios visuais

1. Premium vem de hierarquia, proporção e acabamento — não de efeitos.
2. Uma decisão visual por vez: se um componente já resolve algo (cor, raio,
   sombra), não inventar uma segunda solução ao lado.
3. Tokens antes de valores literais. Nenhum componente novo escreve um hex,
   um px de espaçamento ou uma sombra "à mão".
4. Consistência entre páginas é mais importante do que qualquer tela
   individual ficar "impressionante".
5. Todo efeito precisa de motivo. Motion e glass são tempero, não prato
   principal.

## 2. Personalidade

Cinematográfica, editorial, sóbria, digital. Referências conceituais:
interfaces de streaming premium, produtos editoriais modernos, SaaS de alto
acabamento. **Não** é: visual gamer, neon, glow generalizado, glassmorphism
em tudo, gradiente em todo componente, cópia direta de Netflix/Letterboxd.

## 3. Hierarquia

- Uma única cor de destaque (`--mc-color-accent`) por tela — usada para a
  ação primária e pouco mais.
- Texto secundário (`--mc-color-text-secondary`) e muted
  (`--mc-color-text-muted`) fazem o trabalho de hierarquia antes de
  recorrer a peso de fonte ou tamanho.
- Superfícies em camadas (`bg` → `surface` → `surface-muted`/`elevated`)
  comunicam profundidade sem depender de sombra pesada.

## 4. Sistema de cores

Definido em [`styles/tokens.css`](../styles/tokens.css). Todos os tokens de
cor são **aliases** sobre as variáveis de tema já existentes em
`app/globals.css` (`--bg`, `--panel`, `--text`, `--muted`, `--line`,
`--accent`, `--good`, `--danger`) — isso significa que dark/light/oled e o
`AppearanceProvider` continuam sendo a única fonte de verdade sobre o tema;
os tokens `--mc-color-*` apenas dão nome semântico a eles.

| Token | Uso |
|---|---|
| `--mc-color-bg` | fundo da página |
| `--mc-color-bg-elevated` | fundo de header/áreas elevadas |
| `--mc-color-surface` | painéis, cards |
| `--mc-color-surface-hover` / `-active` | estados interativos de superfície |
| `--mc-color-surface-muted` | inputs, áreas de baixo contraste |
| `--mc-color-text` / `-secondary` / `-muted` / `-disabled` | escala de texto |
| `--mc-color-border` / `-subtle` / `-strong` | escala de borda |
| `--mc-color-accent` / `-hover` / `-active` / `-soft` | ação primária |
| `--mc-color-success` / `-warning` / `-danger` / `-info` (+ `-soft`) | status |

Não criar uma nova cor fora dessa tabela sem antes checar se um token
existente já resolve.

## 5. Superfícies

Três níveis: `bg` (página) → `surface` (painel/card) → `surface-elevated`
(coisas acima do fluxo normal: popovers, headers fixos). `surface-muted`
é para áreas de menor destaque dentro de um painel (inputs, linhas
secundárias). Ver `Surface`/`Card` em `components/ui/`.

## 6. Typography

Fonte única: **Inter** via `next/font` (`app/layout.tsx`), exposta como
`--mc-font-sans`. Nenhuma fonte nova nesta fase.

Escala formal (`styles/tokens.css`):

| Papel | Tamanho | Peso | Uso |
|---|---|---|---|
| `display` | 44px | 650 | hero, número de destaque |
| `h1` | 34px | 650 | título de página |
| `h2` | 27px | 600 | seção principal |
| `h3` | 22px | 600 | subseção |
| `h4` | 18px | 600 | título de card |
| `title` | 16px | 600 | título de item de lista |
| `body` | 15px | 400 | texto corrido |
| `body-small` | 13px | 400 | texto secundário |
| `label` | 13px | 600 | rótulo de campo |
| `caption` | 12px | 400 | legenda, metadado |
| `overline` | 11px | 600, +0.08em | categoria acima de um título |

Cada papel tem `--mc-text-<papel>-size/-line/-weight/-tracking`.

## 7. Spacing

Escala fixa em `--mc-space-*`: `2 4 6 8 12 16 20 24 32 40 48 64 80 96`.
Nenhum componente novo usa um valor de espaçamento fora dessa escala.
`[data-density="compact"]` reduz uma parte da escala (12/16/24/32) sem
mexer na base — compatível com a preferência de densidade já existente.

## 8. Radius

`--mc-radius-sm` (8px, controles pequenos), `-md` (12px, botões/inputs),
`-lg` (18px, cards grandes), `-panel` (herda `--radius-panel` do sistema
de `data-radius` já existente, para painéis full), `-pill` (999px, badges).

## 9. Shadows

Discretas por padrão — nunca usadas como efeito decorativo, só para
separar camada de sobreposição (popover, modal) do conteúdo abaixo.
`--mc-shadow-sm/md/lg/popover/modal`. Em OLED, sombras ficam mais escuras
e concentradas (`rgba(0,0,0,.6+)`) para não aparecerem como mancha sobre
fundo quase preto.

## 10. Borders

`--mc-border-subtle` (separação leve), `-default` (borda padrão de campo/
card), `-strong` (ênfase, ex. borda ativa). Sempre 1px.

## 11. Motion

Ainda sem biblioteca de animação — apenas linguagem via CSS
(`styles/tokens.css`):

- Duração: `instant` 60ms, `fast` 120ms, `normal` 200ms, `slow` 320ms.
- Easing: `standard` (uso geral), `enter`, `exit`, `spring` (bounce leve,
  usar com moderação).
- Regra de uso: hover ≈ `fast`; menus/dropdown ≈ `fast`/`normal`; modal ≈
  `normal`; transição de página ≈ `normal`/`slow`.
- `prefers-reduced-motion` e a preferência `data-motion="reduced"] já
  existente colapsam todas as durações para `0ms` — qualquer componente
  novo deve usar os tokens de duração (nunca um valor de `ms` literal) para
  herdar isso automaticamente.

## 12. Interaction states

Todo elemento interativo novo define, nesta ordem de prioridade:
`default` → `hover` → `active` → `focus-visible` → `disabled` →
`loading` (quando aplicável). Foco visível usa `--mc-focus-ring` (anel de
3px na cor de destaque) via a classe utilitária `.mc-focusable`
(`styles/base.css`) — nunca remover `outline` sem substituir por esse
anel.

## 13. Breakpoints

`--mc-breakpoint-sm` 480px, `-md` 768px, `-lg` 1024px, `-xl` 1280px.
Mobile-first: estilo base é mobile, `min-width` adiciona complexidade.

## 14. Containers

`--mc-container-reading` 720px (texto longo), `-content` 1120px (grids
padrão), `-wide` 1440px (telas com muita densidade visual, ex. discover).
Gutter lateral: `--mc-gutter-desktop` 40px, `-tablet` 24px, `-mobile` 16px.

## 15. Density

`data-density="compact"` (já existente via `AppearanceProvider`) reduz a
escala de espaçamento consumida pelos tokens `--mc-space-12/16/24/32`.
Primitives que usam esses tokens ficam compactas automaticamente; não é
necessário nenhum código condicional no componente React.

## 16. Accessibility

- Todo elemento clicável tem estado `focus-visible` via `.mc-focusable`.
- Botões somente-ícone (`IconButton`) exigem `aria-label` (tipado como
  obrigatório em `components/ui/IconButton.tsx`).
- Inputs inválidos usam `aria-invalid` + `data-invalid`, nunca só cor.
- Motion sempre condicionado a `prefers-reduced-motion`/`data-motion`.
- Zoom/touch target mínimo de 40px de altura nos controles padrão (`md`).

## 17. Uso correto de efeitos

- Glass/blur: só em elementos flutuantes sobre conteúdo (popover, menu),
  nunca como fundo de página ou de card comum.
- Gradiente: no máximo um por tela, e só onde já existe hoje (ex. hero).
- Glow: evitar. Se necessário, usar `--mc-color-accent-soft` como
  background suave, não como `box-shadow` colorido espalhado.
- Sombra nunca substitui borda — usar as duas junto quando a superfície
  precisa se destacar de verdade (popover, modal).

## 18. Regras futuras para React Bits

Não instalado nesta fase. Quando for adotado:

1. O componente precisa resolver um problema real de UX, não só decorar.
2. Precisa respeitar `prefers-reduced-motion`/`data-motion="reduced"`.
3. Precisa ter fallback estático razoável em mobile (sem WebGL pesado por
   padrão em telas pequenas).
4. Não pode degradar Core Web Vitals (LCP/CLS/INP) — medir antes/depois.
5. Não pode competir com a identidade visual do MyCatalog — usa os tokens
   de cor/spacing/radius definidos aqui, nunca uma paleta própria do
   efeito.
6. Máximo de um efeito "vitrine" por tela.

## Convenção de nomenclatura

Todo token novo desta fundação usa o prefixo `--mc-` e toda classe CSS
nova usa o prefixo `mc-` (`mc-btn`, `mc-surface`, `mc-field`...). Isso é
proposital: `app/globals.css` já tem tokens (`--space-4`, `--radius-md`,
`--shadow-popover`) e classes (`.btn`, `.card`, `.badge`) legados, usados
em quase todas as páginas atuais. Reaproveitar esses nomes redesenharia
páginas inteiras sem querer. `mc-`/`--mc-` garante que o sistema novo só
afeta quem optar entrando (`components/ui/*`), até a migração incremental
de cada página.

**Exceção conhecida:** `globals.css` já usa `mc-` para um sistema próprio
de loading/erro (`.mc-skeleton`, `.mc-error-state`, `.mc-route-error`,
`.mc-page-skeleton`...), criado antes desta fundação. Por isso o
`Skeleton` de `components/ui/` usa a classe `mc-ui-skeleton` (não
`mc-skeleton`) para não colidir. **Antes de nomear uma classe/token novo,
sempre `grep` `mc-<nome>` em `app/globals.css` primeiro.**

## Estrutura de arquivos

```
styles/
  tokens.css      # tokens --mc-* (cor, tipografia, spacing, radius, shadow, motion, z-index, container)
  base.css        # utilitários .mc-focusable / .mc-visually-hidden / .mc-disabled
  primitives.css  # estilos dos componentes de components/ui/
components/ui/
  Button.tsx, IconButton.tsx, Surface.tsx, Card.tsx,
  Input.tsx, Textarea.tsx, Badge.tsx, Skeleton.tsx,
  Divider.tsx, Spinner.tsx, cx.ts, index.ts
```

`app/globals.css` continua sendo o entrypoint de estilos legados e não foi
alterado. A migração de páginas/componentes existentes para os novos
tokens/primitives é trabalho de fase futura (ver roadmap da A0).

## 19. Fase B — Discover & Search

**Objetivo:** transformar Discover e Search em experiências premium
compartilhadas, com estado sincronizado pela URL, filtros ricos,
Quick Peek/Preview integrado e acessibilidade de combobox/listbox real.
Encerrada e aprovada no gate final (B4.9): 0 blocker/high/medium/low/polish
em aberto, `npm run check` e `npm run build` limpos, working tree limpa.

### Arquitetura final — Discover

- **URL como fonte da verdade.** `lib/discover/useDiscoverParams.ts` lê
  `useSearchParams()` a cada render (sem `useState` espelhado) e expõe um
  único `setParams(patch)`; Back/Forward re-renderiza naturalmente porque
  não há estado local para dessincronizar.
- `lib/discover/params.ts` centraliza parse/serialize/defaults e
  `countActiveFilters`; `setParams` reseta `page` para `1` em qualquer
  patch que não seja explicitamente sobre página.
- Componentes: `DiscoverToolbar` (tabs de tipo + sort + botão Filtros),
  `DiscoverShortcuts` (atalhos rápidos, scroll horizontal interno em
  telas estreitas), `DiscoverFilters` (genre/year/rating/country/provider
  + toggles pessoais `hideWatched`/`onlyNew`), `DiscoverActiveFilters`
  (chips removíveis + "Limpar tudo"), `DiscoverGrid`/`DiscoverCard`
  (usa os primitivos de `components/media`), `DiscoverPagination`
  (variante compacta em `<=480px`), `DiscoverGridSkeleton`,
  `DiscoverEmptyState`, `DiscoverErrorState` (`role="alert"` + retry),
  `DiscoverPreviewModal` (Quick Peek).
- Confirmado por QA runtime (B4.5R–B4.9, Chromium/Playwright real):
  genre/year atualizam URL e chips imediatamente, coexistem sem se
  apagar, refresh e URL compartilhada reconstroem o estado, Back/Forward
  mantém tudo sincronizado, page reset funciona, remove-chip/clear-all
  funcionam, foco pós-remoção estabiliza (~1.2s) no chip restante (nunca
  em `<body>`), loading mostra skeleton mantendo a toolbar montada, error
  state é distinto de empty e o retry recupera resultados reais.

### Arquitetura final — Search

**Search global (dropdown, `components/Search.tsx` +
`components/search/*`):**
- Mínimo de 2 caracteres, debounce de 260ms, estado `pending` distinto de
  `loading`/`results`.
- Cache em memória (15min) + `sessionStorage` (15min) para reduzir
  refetch entre navegações; `AbortController` cancela buscas obsoletas.
- Resultados agrupados por tipo (mídia, pessoa, personagem, franquia,
  usuário) com `visibleResults` filtrado pela tab ativa
  (Todos/Filmes/Atores/Usuários).
- Combobox/listbox ARIA real: `role="combobox"` no input,
  `aria-expanded`/`aria-autocomplete="list"`/`aria-controls` (só quando
  há `role="listbox"` de verdade — idle/Recent Searches não conta),
  `aria-activedescendant` sincronizado a cada ArrowUp/ArrowDown/Home/End.
  Um `@` no início da query força busca só de usuários.
- Recent Searches em `localStorage`
  (`lib/search/recentSearches.ts`, chave `mycatalog:recent-searches:v1`,
  máx. 8 entradas), com remoção individual e "Limpar".
- Estados idle/loading/results/no-results/error são visualmente
  distintos; flash falso de "no-results" (B3.7) permanece corrigido —
  revalidado com polling ~20ms em B4.7 e B4.9, 0ms detectado.

**Search page (`app/search/page.tsx` +
`components/search/page/*`):**
- `q` na URL é a fonte da verdade (sem tab própria na URL — a
  segmentação Filmes/Séries/Atores/Usuários é local ao dropdown, não à
  página).
- Busca avançada (`/api/search/advanced`), resolução de pessoa
  (`/api/person/[id]/credits`), seções de usuários/franquias, e mesmo
  sistema de MediaCard/Preview do Discover.
- Estados idle/loading/error/no-results com `role="alert"` no erro,
  distinto de "nenhum resultado".

### Sistema compartilhado (`components/media/*`)

- `MediaCard` + `MediaCardImage`/`MediaCardActions`/`MediaCardMeta`/
  `MediaCardSkeleton` são os primitivos reais que `DiscoverCard` e
  `SearchMediaCard` compõem — não há card "legado" incompatível em
  nenhuma superfície da Fase B.
- `WatchProviderList`/`WatchProviderRow` são reutilizados por
  `DiscoverPreviewModal` e `SearchPagePreviewModal` para a lista de
  onde assistir.

### Acessibilidade — guarantees finais

**Discover:** tabs de tipo com `role="tablist"`/`role="tab"` reais;
shortcuts como `role="group"` + `aria-pressed`; filtros agrupados em
`fieldset`/`legend` (`mc-visually-hidden` quando só o agrupamento visual
já é suficiente); toggles pessoais com `aria-pressed`; paginação com
`aria-current="page"`; foco restaurado após remover chip/limpar
filtros/retry (nunca preso em `<body>` após estabilizar).

**Search:** input `role="combobox"` com `aria-expanded`/
`aria-autocomplete`/`aria-controls`/`aria-activedescendant`; opções
`role="option"` com `id` estável (`search-option-<kind>-<key>`); tabs
filtram `visibleResults` mantendo o item ativo sempre pertencente à tab
atual; Recent Searches com foco coerente após remover um item; Preview
(Discover e Search) fecha por botão/Escape/backdrop e devolve o foco ao
elemento que abriu.

### Responsive — breakpoints comprovados

- **Discover:** 360, 390, 430, 480, 481, 700, 720, 740, 768, 800, 820,
  900, 1024+. Overflow horizontal = 0px em todos; shortcuts com scroll
  interno próprio (nunca a página); paginação compacta ativa em
  `<=480px`.
- **Search:** 360, 390, 430, 768, 1024, 1280, 1440. Dropdown sem
  clipping mesmo aberto dentro do Discover; z-index correto sobre
  filtros.

### Temas e movimento

- **Dark**, **Light** e **OLED**: aprovados em Discover, Search global,
  Search page e Preview.
- **Reduced motion** (`prefers-reduced-motion`/`data-motion="reduced"`):
  aprovado — Search, filtros e Preview permanecem funcionais sem
  depender de animação para revelar estado.

### Componentização e duplicação residual

Auditoria estática (B5) não encontrou arquivo órfão, export de barrel
sem uso, nem CSS morto — `styles/discover.css` e `styles/search.css`
estão de fato importados em `app/layout.tsx`. Duplicação intencional e
já documentada em código, registrada aqui como dívida não-bloqueante:

- `DiscoverPreviewModal` e `SearchPagePreviewModal` reaproveitam
  `WatchProviderList`, mas reimplementam paralelamente backdrop, botão
  de fechar, meta, chips de gênero e nota pessoal — cada um adaptado ao
  formato de item da sua própria página.
- `DiscoverCard` e `SearchMediaCard` compõem os mesmos primitivos de
  `components/media`, mas o corpo do card (botões de ação, menu de
  status, título, meta) é replicado quase linha a linha entre os dois
  arquivos, por design, para não acoplar Discover e Search a uma única
  variante de card.

Nenhuma nova abstração foi criada para "resolver" isso — fica registrado
como dívida a considerar só se voltar a doer.

### Performance smoke

Sem evidência de regressão introduzida pela Fase B: nenhum fetch
duplicado, nenhum listener global duplicado, nenhuma request por hover
ou por Recent Search encontrada nas passadas de QA runtime (B4.5R–B4.9),
e os posters usam `next/image` com `sizes` responsivo
(`DiscoverCard.tsx`).

### Dívidas conhecidas (não bloqueiam o fechamento da Fase B)

1. **`/discover?page=999999`** — seguro, cai em empty state, mas a
   página não é clampada ao total real de páginas.
2. **`release_date=""` do backend** — bug pré-existente (não introduzido
   pela Fase B); um payload sintético pode gerar 500. Fora do escopo de
   Discover/Search.
3. **CSP** — warnings de `style-src 'self'`/inline style presentes em
   todas as superfícies da Fase B; sem impacto funcional confirmado até
   agora. Precisa de investigação própria (não é dívida só da Fase B).
4. **Auth pre-hydration** — em `next dev` com compilação fria, um
   submit de signup/login antes da hidratação completa pode cair em
   submissão HTML nativa (`GET /signup?`), descartando os dados
   digitados sem mensagem de erro. **Confirmado apenas em dev sob
   compilação fria; não reproduzido em build de produção local**
   (hidratação em produção é quase instantânea). Classificado como
   dívida de dev tooling, não bug de produto.
5. **Contas QA órfãs no ambiente TEST** — resíduo de higiene de
   ambiente de fases anteriores de QA (nenhuma criada via SQL manual).
   Não afeta produto; candidata a limpeza na Fase B5/futura, sem
   prioridade de bloqueio.

### Status final

Fase B **encerrada e aprovada**. `CHECK = PASS`, `BUILD = PASS`,
`working tree` limpa. Nenhuma alteração de código foi necessária nesta
fase de fechamento (B5) — apenas esta documentação.

## 20. Roadmap

- **A — Foundation Premium** = DONE
- **B — Discover & Search** = DONE
- **C — Media Experience**
  - **C1 — Premium Title Page** = DONE
  - **C2 — Quick Peek / Preview Unification** = DONE
  - **C3 — Watch Providers Consolidation** = DONE
  - **C4 — Cast/Crew** = IN PROGRESS (C4.1 — contrato tipado de
    cast/crew/created_by, `lib/title-credits.ts` — DONE; C4.2 — elenco
    completo (foto deixou de determinar quem aparece no elenco; só
    decide foto vs. fallback dentro do card) — DONE; C4.3 — crew
    editorial (Movie: até 5 pessoas únicas em Direção = Director e até 5
    em Roteiro = Writer/Screenplay/Story; dedupe por pessoa dentro de
    cada grupo, sem dedupe entre grupos; TV: só Criador(es) via
    `created_by`, sem Direção/Roteiro — `aggregate_credits`
    deliberadamente não adotado) — DONE; C4.4 = NEXT.
    Seção dedicada de fase fica para o closeout de C4.)
  - **C5 — Seasons/Episodes**
  - **C6 — Related/Collections**
  - **C7 — QA/Polish**
- **D — Library & Organization**
- **E — Profile & Social**
- **F — Premium Features**
- **G — Motion & React Bits**
- **H — Mobile/Accessibility/Performance**
- **I — QA/Polish/Release**

## 21. Fase C — Nota de handoff (histórico)

A nota original abaixo (pré-C1/C2) listava as superfícies fora do
escopo da Fase B para uma futura "Fase C — Media Experience". Essa fase
foi dividida em C1 (title page, DONE), C2 (Quick Peek, DONE — ver §22)
e C3 (Watch Providers, NEXT). Mantida como registro histórico:

A Fase C deve **começar por uma auditoria** (sem alterar nada ainda) das
seguintes superfícies, hoje fora do escopo revisado pela Fase B:

- `title/movie` page
- `title/tv` page
- Quick Peek / Preview (o mesmo modal usado por Discover/Search, mas
  auditado agora como página completa, não só popup)
- Watch Providers (páginas de título, não só o preview)
- Cast/crew
- Seasons/episodes
- Related content

Nenhum desses sistemas foi alterado pela Fase B; o handoff é apenas
apontar onde a Fase C deve olhar primeiro.

## 22. Fase C2 — Quick Peek / Preview Unification (DONE)

Cinco implementações independentes de "Quick Peek" (modal de prévia de
mídia) existiam no início da C2, cada uma reimplementando manualmente
backdrop, botão de fechar, poster, título/metadata, sinopse, providers,
nota pessoal e link para a página completa. Todas foram unificadas numa
única fundação compartilhada.

### Arquitetura final

- **`components/media/preview/MediaPreviewDialog.tsx`** — única
  implementação de Quick Peek do produto. Constrói sobre
  `components/ui/Dialog.tsx` (o mesmo primitivo genérico usado por
  `ConfirmProvider`) e não reimplementa focus trap, Escape, scroll lock,
  focus restore ou backdrop click — tudo isso vem do `Dialog` sem
  segunda implementação.
- **Modelo normalizado** (`components/media/preview/types.ts`) —
  `MediaPreviewData`/`MediaPreviewLibraryState` tipados, sem `any`. Só
  contém campos que pelo menos uma superfície real usa.
- **Adapters por shape** (`components/media/preview/adapters.ts`) — cada
  superfície tem o adapter que corresponde ao shape real dos seus
  dados; nenhum adapter foi forçado a servir uma superfície cujo
  shape não é o dele (ver mapa abaixo).
- **Providers via slot** — o core nunca conhece `WatchProviderList` nem
  nenhuma implementação de provider; cada superfície passa seu próprio
  conteúdo de provider pronto via a prop `providers` (`ReactNode`).
- **`extraActions` genérico** — único ponto de extensão para uma ação
  que pertence a uma única superfície (hoje: o botão de favorito do
  PosterGrid). O core recebe `ReactNode` pronto e não sabe o que
  significa — nenhum "if (source === 'posterGrid')" existe em lugar
  nenhum do core.
- **Core sem fetch, sem mutation, sem rota de API conhecida** — todo
  fetch de `details`, toda mutation de biblioteca/rating/favorito
  continua na superfície/container que já fazia isso antes da migração.

### As 7 superfícies

| Superfície | Componente/página | Adapter usado | Fonte real dos dados |
|---|---|---|---|
| Discover | `app/discover/page.tsx` | `fromDiscoverItem` | Item da listagem + `genre_ids` resolvidos contra o lookup de gêneros do filtro |
| Search | `app/search/page.tsx` | `fromSearchItem` | Item da listagem, com fallback campo-a-campo para `details` quando ausente no item |
| For You | `app/for-you/page.tsx` | `fromLooseMediaItem` (sem 5º argumento) | **`details`-only** para runtime/genres — o preview antigo nunca usava o item da lista para esses dois campos, só para o resto |
| Collection | `app/collection/[id]/page.tsx` | `fromLooseMediaItem` (`fallbackToListWhenDetailsUnavailable: true`) | **`details \|\| movie`** — semântica do preview legado preservada exatamente: quando `details` existe, ele vence até para runtime/genres; quando ausente, o item da lista fornece esses campos (inclusive `genres: []` de `details` continua `[]`, nunca cai para o item) |
| Home | `components/PosterGrid.tsx` (consumer: `app/page.tsx`) | `fromLibraryItem` | `LibraryItem` diretamente — nenhum merge com `details`; `details` só alimenta o slot de providers |
| Library | idem (consumer: `app/library/page.tsx`) | `fromLibraryItem` | idem |
| Favorites | idem (consumer: `app/favorites/page.tsx`) | `fromLibraryItem` | idem |

Home, Library e Favorites são três *consumers* de uma única
implementação de superfície (`PosterGrid`), não três migrações
separadas — o próprio `PosterGrid` é quem decide dado, mutation e
processing; as três páginas só passam `items` (e, quando aplicável,
`onChanged`/`viewMode`).

### Provider debt — NÃO resolvida nesta fase

As implementações de provider continuam deliberadamente duplicadas:

- Discover/Search usam `WatchProviderList` (compartilhado entre os
  dois desde a Fase B).
- For You usa `PreviewProviders` (helper local).
- Collection usa `CollectionProviders` (helper local).
- PosterGrid usa `PreviewWatchProviders` (helper local).

As quatro implementações resolvem a mesma lógica (`watch_providers.
results.BR`, streaming/aluguel/compra) de formas quase idênticas, mas
não foram unificadas — isso é **C3 — Watch Providers Consolidation**,
que também vai olhar cast/crew, seasons/episodes e related content na
página de título.

> **Nota (C3, DONE):** essa dívida foi resolvida. `PreviewProviders`,
> `CollectionProviders` e `PreviewWatchProviders` (helpers locais)
> foram removidos; For You, Collection e PosterGrid agora usam
> `WatchProviderList` como Discover/Search, todos consumindo
> `normalizeWatchProviders` da fundação compartilhada
> `components/media/providers/`. Detalhes completos em
> [§23 — Fase C3](#23-fase-c3--watch-providers-consolidation-done).

### CSS

**Removido** (`app/globals.css`) — órfão confirmado por busca app-wide
antes da remoção, 0 consumidores restantes em `.tsx`:
- `.discover-preview-*` (backdrop, modal, close, poster, content, meta,
  genres, overview, actions, incluindo os dois `@media` exclusivos)
- `.library-preview-*` (mesmo conjunto, incluindo um bloco de correção
  de ~250 linhas com comentários explicativos e uma variante alternativa
  comentada, ambos só sobre o modal antigo)
- `.preview-personal-rating` / `.preview-personal-rating-head` /
  `.preview-rating-options`
- Duas listas de seletores compartilhados (`:focus-visible` e um bloco
  de design system) tiveram só os dois tokens órfãos removidos —
  `.mycatalog-confirm-modal`, `.watch-register-modal`, `.pick-modal` e
  as demais classes daquelas listas continuam ativas e foram
  preservadas.
- Um `@media` que misturava `.library-preview-*` com
  `.library-card-status-menu` (menu de status do PosterGrid, ainda
  ativo) teve só as regras órfãs removidas — `.library-card-status-menu`
  permanece com sua regra de breakpoint intacta.

**Preservado intencionalmente** — ainda em uso pelos quatro helpers de
provider listados acima: `.preview-watch-box`, `.preview-watch-head`,
`.preview-watch-row` e correlatas. Tratamento fica para C3.

Remoção validada por: busca app-wide pós-remoção (0 ocorrências de
`.discover-preview-*`/`.preview-personal-rating*`/
`.preview-rating-options*`; 1 ocorrência de `.library-preview-` restante,
que é só um comentário explicativo), `npm run build` (CSS parseia sem
erro), e QA runtime confirmando visual/layout intactos em Discover,
Collection, Home, Library e Favorites (ver §"QA final" abaixo).

### Dívida de UX pré-existente (não corrigida nesta fase)

Em **Favorites**, descurtir um item de dentro do Quick Peek não remove
o card da lista imediatamente — o dialog atualiza corretamente
("Curtido" → "Curtir"), mas a página `/favorites` nunca passou
`onChanged` para `PosterGrid`, então a lista só reflete a mudança após
recarregar. Esse comportamento já existia antes da unificação (mesma
função `toggleFavorite`, inalterada); registrado aqui como dívida
conhecida, não como regressão da C2.

### QA final (C2.5)

Smoke runtime com Chromium real após a remoção de CSS: Discover e
Collection (guest, com foco em restore X/Escape/backdrop, ARIA, mobile
390px e os três temas — dark/light/oled, todos com background distinto
e correto); Home, Library e Favorites (conta de teste descartável em
ambiente `TEST_DATABASE_URL`/`TEST_NEON_AUTH_BASE_URL` isolado, nunca
produção) — todos com layout/CSS intactos, favorito funcional, nenhum
erro novo de console. `npm run check`, `npm run build` e
`git diff --check` limpos.

## 23. Fase C3 — Watch Providers Consolidation (DONE)

### Objetivo

Unificar a lógica de parsing/dedupe de `watch_providers` (streaming,
aluguel, compra), até então duplicada em 6 pontos diferentes do app,
em uma única fundação de dados compartilhada — preservando, de forma
deliberada, 3 composições visuais distintas onde o layout realmente
difere (Quick Peek, Pick for Me, Title).

### Fundação de dados compartilhada

`components/media/providers/`:

- **`types.ts`** — `WatchProviderKind` (`"streaming" | "rent" | "buy"`),
  `WATCH_PROVIDER_KIND_LABELS`, `WatchProviderItem`, `WatchProviderGroup`,
  `WatchProviderData`, e os tipos "crus" de entrada (`RawWatchProviderItem`,
  `RawWatchProviderRegion`, `RawWatchProviders`) que espelham o formato do
  TMDB.
- **`normalize.ts`** — `normalizeWatchProviders(raw, region)`: função pura,
  sem fetch, sem estado, sem região default (região é sempre um argumento
  explícito do chamador). Produz `{ groups: WatchProviderGroup[],
  attributionUrl?: string | null }`.
- **`ProviderLogo.tsx`** — primitivo visual único para o logo/fallback de
  um provider, usado pelos 3 renderizadores finais.
- **`index.ts`** — barrel público da fundação.

### Regra de dedupe

`flatrate + free + ads` são concatenados nessa ordem e deduplicados por
`provider_id`, mantendo a primeira ocorrência (ou seja: `flatrate` vence
sobre `free`, que vence sobre `ads`). `rent` e `buy` nunca são
deduplicados entre si nem contra o grupo de streaming. Grupos vazios são
omitidos do `groups[]` final — nenhum renderizador precisa checar
`.length` manualmente.

### Modelo de região

Região é sempre um input explícito de quem chama `normalizeWatchProviders`
— nunca um default embutido na fundação. Todos os 3 renderizadores finais
passam `"BR"` literalmente no próprio call site (Quick Peek, Pick for Me,
Title).

**Dívida de UX pré-existente, documentada e não corrigida nesta fase:**
em Pick for Me, o seletor "País" envia `country` para `/api/pick-for-me`,
que o usa como filtro `with_origin_country` do TMDB (país de origem/
produção dos títulos candidatos) — sem nenhuma relação com a caixa
"Onde assistir no Brasil", que sempre lê `results.BR` independente do
país escolhido. Confirmado empiricamente (request real inspecionada,
`country=BR` no GET) e no código
(`app/api/pick-for-me/route.ts` → `params.with_origin_country`).

### As 3 composições visuais finais (deliberadamente não unificadas)

1. **`WatchProviderList`** (`components/media/preview/WatchProviderList.tsx`)
   — renderizador compacto do Quick Peek, consumido por Discover, Search,
   For You, Collection e PosterGrid (Home/Library/Favorites). Usa o
   primitivo `WatchProviderRow` (`components/media/preview/WatchProviderRow.tsx`).
2. **`PickForMeWatchProviders`** (dentro de `components/PickForMe.tsx`) —
   composição compacta específica do Pick for Me.
3. **`TitleWatchProviders`** (`components/title/TitleWatchProviders.tsx`) —
   composição rica da página de Título, com descrição por grupo, contagem
   e link de atribuição (`attributionUrl`) — o único consumidor da
   atribuição; Quick Peek e Pick for Me não a exibem.

Todas as três chamam a mesma `normalizeWatchProviders` e renderizam o
mesmo `ProviderLogo`; a diferença entre elas é puramente de composição/
layout (o que cada superfície precisa mostrar), não de lógica de dados —
por isso permanecem 3 implementações visuais sobre 1 única fundação, em
vez de serem forçadas a virar 1 componente genérico.

### Fetch ownership

Nenhum renderizador, nem a normalização, nem os primitivos fazem fetch —
cada superfície continua dona do próprio fetch de `details` (SWR/estado
local/SSR), exatamente como antes da consolidação; C3 tocou apenas a
etapa de parsing/renderização dos dados já carregados.

### Dívidas de tipo pré-existentes (documentadas, não resolvidas)

- A maioria das superfícies passa `details?.watch_providers` como `any`
  (herdado de tipagem solta pré-existente) para `normalizeWatchProviders`
  sem cast — o TS permite `any` → parâmetro tipado sem asserção.
- `LooseTitleDetails` (`components/title/types.ts`) é
  `TitleDetails & Record<string, any>`, dívida documentada desde a C1.2.
- `details.watch_providers` na página de Título é, na verdade, tipado
  `unknown` (`lib/title-details.ts`: `let watchProviders: unknown = null`),
  não `any` — exigiu o único cast especificamente tipado do módulo,
  `as RawWatchProviders | null | undefined` (nunca `as any`), em
  `TitleWatchProviders.tsx`.

### Correções deliberadas feitas durante a migração (MIGRATION FIX)

- **For You / Collection** — os renderizadores locais antigos
  (`PreviewProviders`, `CollectionProviders`) mostravam uma caixa/cabeçalho
  vazio quando `rent`/`buy` eram arrays vazios (checavam `Array.isArray`,
  não `.length`). A omissão de grupos vazios do `normalizeWatchProviders`
  corrigiu isso "de graça" durante a migração.
- **`ProviderLogo` — acessibilidade do fallback:** o branch sem
  `logoPath` (letra-fallback) passou a usar `role="img"` + `aria-label`
  no wrapper (antes era uma div sem nome acessível).
  `provider.name` vazio/só-espaço agora cai para o rótulo acessível
  "Provedor" (antes gerava `aria-label`/`alt` vazio).

### CSS

Órfãos confirmados e removidos em `app/globals.css`: `.title-watch-provider-fallback`
e a parte órfã do seletor combinado `.title-watch-provider img,
.title-watch-provider-fallback{...}` (a parte referente a
`.title-watch-provider img` foi preservada onde ainda ativa). CSS novo,
auto-contido, para `.mc-title-provider-logo` (dimensão/posição/overflow)
e `.mc-title-provider-logo span[aria-hidden]` (estilo da letra-fallback),
reproduzindo os dois estados visuais originais sob a única classe que o
contrato de `ProviderLogo` permite.

### Dead code

`PreviewProviders`, `CollectionProviders`, `PreviewWatchProviders` e seus
`ProviderRow`/`PreviewWatchRow` locais foram removidos por completo — 0
ocorrências restantes.

### Escopo explicitamente fora da C3

Não alterado nesta fase: comportamento de região (Pick for Me continua
com a mesma ambiguidade País × Onde-assistir, só documentada), UX de
`onChanged` em Favorites, layout da página de Título, dívidas de tipo
pré-existentes fora do necessário para compilar (`LooseTitleDetails`,
`any` nos demais call sites). Nenhuma feature nova foi introduzida.
