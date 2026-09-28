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
- **C — Media Experience** = DONE (C1–C7 completas; ver seções dedicadas
  abaixo e [`docs/C5-SEASONS-EPISODES-AUDIT.md`](./C5-SEASONS-EPISODES-AUDIT.md)
  para C5).
  - **C1 — Premium Title Page** = DONE
  - **C2 — Quick Peek / Preview Unification** = DONE
  - **C3 — Watch Providers Consolidation** = DONE
  - **C4 — Cast/Crew** = DONE (C4.1–C4.5; arquitetura, política,
    polish, regressão e dívidas registradas na seção dedicada abaixo).
  - **C5 — Seasons/Episodes** = DONE (C5.0 auditoria, C5.1 contratos/URL/
    Especiais/estados, C5.2 integridade de progresso + regressão final —
    ver [`docs/C5-SEASONS-EPISODES-AUDIT.md`](./C5-SEASONS-EPISODES-AUDIT.md)
    para o detalhe completo de cada subfase).
  - **C6 — Related/Collections** = DONE (ver seção dedicada abaixo).
  - **C7 — QA/Polish** = DONE (gate final de runtime da Media Experience —
    ver seção dedicada abaixo).
- **D — Library & Organization** = DONE (D0 auditoria + D1 implementação
  consolidada — ver [`docs/D-LIBRARY-ORGANIZATION-AUDIT.md`](./D-LIBRARY-ORGANIZATION-AUDIT.md)
  para o detalhe completo de ambas as subfases).
  - **D0 — Auditoria** = DONE.
  - **D1 — Consolidação** = DONE (paginação/filtro/busca/ordenação real em
    SQL, URL state na Biblioteca, guest/erro/vazio explícitos, Listas
    Personalizadas completas — CRUD, detalhe, privacidade, perfil —,
    sincronização da nota detalhada com `personal_rating`, remoção de
    código morto de Tags/Listas legadas).
- **E — Profile & Social** = DONE (E0 auditoria + E1 implementação
  consolidada — ver [`docs/E-PROFILE-SOCIAL-AUDIT.md`](./E-PROFILE-SOCIAL-AUDIT.md)
  para o detalhe completo de ambas as subfases).
  - **E0 — Auditoria** = DONE.
  - **E1 — Consolidação** = DONE (follow UI única no perfil, paginação
    real de followers/following/solicitações, activity_events como
    fonte canônica da aba Atividade pública, regex de username
    unificada, drift de `username_changes` corrigido no schema
    versionado).
- **F — Premium Features** = DONE (F0 auditoria + F1 implementação
  consolidada — ver [`docs/F-PREMIUM-FEATURES-AUDIT.md`](./F-PREMIUM-FEATURES-AUDIT.md)
  para o detalhe completo de ambas as subfases).
  - **F0 — Auditoria** = DONE.
  - **F1 — Consolidação** = DONE (Stats com agregação SQL server-side +
    bug de gêneros corrigido, Calendar com fan-out TMDB reduzido para
    filmes já assistidos, Notifications sem preferências órfãs visíveis,
    STATUS_LABELS unificado no Diário, Export/Backup confirmado seguro
    sem alteração).
- **G — Motion & React Bits** = DONE (G0 auditoria + G1 implementação
  consolidada — ver [`docs/G-MOTION-REACT-BITS-AUDIT.md`](./G-MOTION-REACT-BITS-AUDIT.md)
  para o detalhe completo de ambas as subfases).
  - **G0 — Auditoria** = DONE.
  - **G1 — Consolidação** = DONE (React Bits avaliado e não adotado,
    duplicação de reduced-motion removida, gap de foco em `.card-actions`
    corrigido, feedback de pressão adicionado aos controles principais,
    menus de status ganharam transição consistente, `CarouselRail`
    respeita reduced-motion em JS).
- **H — Mobile/Accessibility/Performance** = próxima na ordem do
  roadmap, escopo ainda não detalhado (mesma situação que F e G tinham
  antes de suas próprias auditorias — precisa de um H0).
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

## 24. Fase C4 — Cast/Crew (DONE)

Fase C4 encerra a experiência de elenco e créditos editoriais da página de
Título. O escopo ficou restrito à modelagem, apresentação e QA de cast/crew;
não adiciona superfície de produto nova nem altera a política de dados de
Watch Providers.

### Fluxo final e contrato

`sanitizeTitleDetails(value: unknown)` é a fronteira compartilhada entre o
detalhe obtido por SSR e a rota `/api/tmdb/[type]/[id]`. Ela produz o contrato
interno de `lib/title-credits.ts` (`CastCredit`, `CrewCredit` e
`PersonCredit`) para elenco, crew editorial e criadores. A página entrega os
detalhes iniciais ao `TitleView`; este separa os dados e passa-os para
`TitleCastSection`, que mantém os painéis ARIA esperados pela navegação de
conteúdo.

```text
TMDB details + credits
        │
        ▼
sanitizeTitleDetails (limites, projeção e política editorial)
        ├── SSR ──► page ──► TitleView ──► TitleCastSection
        └── API /api/tmdb/[type]/[id]
```

### Políticas finais

- Elenco: usar `credits.cast` e preservar a ordem do provedor; a fronteira
  sanitizada limita a 24 pessoas e a UI apresenta as primeiras 12. A ausência
  de foto não remove, reordena ou substitui uma pessoa: o cartão mantém o
  link de perfil e mostra fallback visual.
- Crew editorial: somente `Director`, `Writer`, `Screenplay` e `Story` são
  projetados. Direção e roteiro são agrupados separadamente, preservando a
  primeira ocorrência e a ordem recebida dentro de cada grupo; o mesmo ID
  pode aparecer nos dois grupos quando tem funções diferentes. Cada grupo é
  limitado a cinco pessoas.
- TV: a UI de título não deriva direção/roteiro do agregado; `created_by`
  continua sendo a fonte de criadores. Não há consulta de `aggregate_credits`
  para essa experiência.
- Grupos sem itens são omitidos. Se não houver elenco, direção, roteiro ou
  criadores, a área correspondente mostra o estado vazio; produtoras podem
  continuar visíveis independentemente.
- Fotos de pessoas são decorativas para leitores de tela quando o nome já
  aparece no mesmo link. Fallbacks são ocultados da árvore acessível e não
  introduzem alvo de foco separado; o próprio link mantém o nome visível.
- Os cartões do elenco e os links de produção mantêm composições próprias
  (proporções e densidades diferentes), compartilhando apenas os contratos
  e estilos realmente comuns.

### Dívidas e decisões adiadas (não bloqueantes)

- A sanitização é uma projeção defensiva, não validação runtime exaustiva do
  schema completo do TMDB. `LooseTitleDetails` ainda estende
  `TitleDetails & Record<string, any>`; `TitleView` conserva estado `any`,
  e `companies` também permanece frouxamente tipado.
- `created_by` é tipado como `PersonCredit[]`, mas atualmente reutiliza a
  compactação que também serializa `character: null` e `order: null`. A
  limpeza desse formato foi adiada para uma mudança de contrato explícita.
- Não há deduplicação global entre elenco, crew e criadores. O dedupe da
  crew editorial é apenas por ID dentro de cada grupo.
- `aggregate_credits`, créditos por episódio, múltiplas funções e expansão
  para outros cargos de crew permanecem fora da política da Title page.
  A projeção `CastMember` da rota legada de indexação de personagens é um
  contrato separado, não um segundo contrato de créditos da Title UI.
- `word-break: break-word` junto de `overflow-wrap: anywhere` é redundante,
  mas inofensivo; a remoção foi considerada limpeza cosmética sem impacto.
  A experiência de detalhe de pessoa também continua evoluindo em seu
  próprio escopo.

### Histórico e closeout

Commits de implementação verificados no histórico local:

- C4.1 — `c1e9e04` (`refactor(title): type cast and crew credits`)
- C4.2 — `50b7804` (`feat(title): preserve cast members without photos`)
- C4.3 — `b3033eb` (`feat(title): add editorial crew credits`)
- C4.4 — `ac66f3a` (`polish(title): refine cast and crew presentation`)

C4.5 é este fechamento documental/QA e não tem commit próprio. A checagem
de runtime (desktop/mobile, temas e console) ficou **NOT RUN**: não havia
instância Chromium disponível no Browser integrado nesta sessão. O closeout
estático e os resultados finais de `check`, `build` e `git diff --check`
devem ser registrados no relatório da sessão; não inferir aprovação de
runtime a partir dos testes estáticos.

**Resultado da fase: C4 DONE. Próxima fase: C5 — Seasons/Episodes.**

## 25. Fase C6 — Related/Collections (DONE)

C5 (Seasons/Episodes) está fechada — ver
[`docs/C5-SEASONS-EPISODES-AUDIT.md`](./C5-SEASONS-EPISODES-AUDIT.md) para
o detalhe completo de C5.0–C5.2. C6 transformou "Relacionados" e
"Coleção" de UI morta/desconectada em experiência funcional, 100% TMDB,
sem introduzir recommendation engine próprio.

### Estado encontrado (antes)

A aba "Relacionados" da Title page já existia inteira (`TitleRelatedSection`,
empty state, `CarouselRail`) mas nunca recebia dados: `details.recommendations`
nunca era populado porque `detailsTMDB()` não pedia `recommendations` via
`append_to_response`, e `TitleView` lia `details.recommendations?.results`
de um campo que nunca existia — a aba sempre caía no empty state. O mesmo
filtro por `poster_path` do elenco pré-C4.2 existia aqui (`item.poster_path`
como critério de elegibilidade), nunca corrigido por não ter dado real para
expor o bug.

`belongs_to_collection` (nativo do detalhe de filme, sem precisar de
`append_to_response`) sobrevivia ao spread do sanitizer, mas nunca era lido
por nenhum componente — 0 ocorrências no código antes da C6. A página de
coleção (`app/collection/[id]/page.tsx`) e a API (`/api/collection/[id]`)
já estavam maduras e completas (hero, progresso, filtros, Quick Peek
reaproveitando `MediaPreviewDialog`/`WatchProviderList`, concorrência
limitada e cache na API) — só não havia nenhum caminho de navegação
Title → Collection.

### Fonte e fetch strategy

Recomendações vêm de `recommendations` embutido na MESMA chamada de
`detailsTMDB()` via `append_to_response=credits,videos,images,recommendations`
— nenhum fetch novo, cliente ou servidor. `belongs_to_collection` já vinha
de graça no detalhe de filme (nativo, sem append). **NEW UNNECESSARY
FETCHES = 0**, confirmado por inspeção de rede real (trocar para a aba
Relacionados não gera nenhuma request de API nova).

### Contrato (`lib/title-related.ts`, novo)

- `RelatedItem` — `id, media_type ("movie"|"tv"), title, poster_path,
  backdrop_path, date, vote_average`. `media_type` é carimbado pelo
  chamador (`sanitizeTitleDetails` agora recebe `type` como segundo
  parâmetro) porque a resposta de recomendações por-tipo do TMDB nunca
  inclui esse campo nos itens.
- `CollectionRef` — `id, name, poster_path, backdrop_path`.
- `normalizeRelatedItems(raw, mediaType, excludeId)` — filtra inválidos
  (sem id/título), remove o próprio título (`excludeId`), deduplica por
  `media_type+id` mantendo a primeira ocorrência, limita a 12 itens.
  **Sem foto NÃO é critério de descarte** — mesma política do elenco
  desde a C4.2, corrigindo o bug antigo de usar imagem como elegibilidade.
- `normalizeCollectionRef(raw)` — objeto único ou `null`; nunca fabrica
  coleção para TV (o campo simplesmente não existe no detalhe de série).

`sanitizeTitleDetails` (SSR + `/api/tmdb/[type]/[id]`, compartilhados)
normaliza os dois campos no lugar de espalhar os raws — mesmo padrão de
`seasons`/`last_episode_to_air` da C5.1.

### Related — comportamento

Movie e TV funcionam. Card decorativo (`alt=""`, nome já é texto visível
no card — mesma política de a11y do elenco/crew); nota só aparece se
`vote_average` for válido (não mostra "0.0" fantasma). `CarouselRail`
reaproveitado sem alteração — nenhum sexto tipo de card criado. Sem Quick
Peek novo: os cards continuam link direto para `/title/[type]/[id]`
(infra de preview não era trivial de estender aqui sem inflar o escopo,
§22 do prompt permite explicitamente esse caminho). Empty state
(`Nenhum título relacionado disponível.`) preservado sem alteração —
verificado estruturalmente (Title é SSR puro, sem como fixturar
`recommendations=[]` em runtime, mesma limitação já registrada na C3.3/C5.1).

### Collection — comportamento

Movie pertencente a coleção ganha um novo "fact" na aba Visão Geral
("Franquia" + nome da coleção, ícone `Layers3`, link para
`/collection/[id]`) — rótulo deliberadamente diferente de "Minha coleção"
(card de status pessoal já existente na mesma página) para não confundir
os dois conceitos. TV nunca mostra esse CTA (`type === "movie"` explícito).
Página e API de coleção não foram redesenhadas — já maduras; só a conexão
Title → Collection foi adicionada. Collection → Title já existia (cards
da coleção já linkavam para `/title/movie/[id]`).

### Dados reais confirmados

`O Senhor dos Anéis: A Sociedade do Anel` (movie 120) — `belongs_to_collection`
aponta para a coleção 119; CTA renderiza com href/texto corretos; 12
recomendações normalizadas, self-filtro e dedupe confirmados sobre o
payload real (nenhum id duplicado, id 120 nunca aparece nas próprias
recomendações). `Clube da Luta` (movie 550) — sem coleção, CTA ausente,
recomendações funcionam normalmente. `Breaking Bad` (tv 1396) — sem CTA de
coleção (TV), 12 recomendações com `media_type: "tv"` corretas. Página da
coleção 119 renderiza hero/progresso/filmografia com os 3 filmes reais da
trilogia.

### QA runtime

Chromium real, guest, servidor próprio isolado (porta 4210, nunca o do
usuário): CTA de coleção com href/texto corretos e foco por teclado
(`Tab` chega num `<a>` real); Related renderiza 12 cards para movie e TV,
0 para título sem coleção; página de coleção carrega hero e lista de
filmes; mobile 390 (Related) e tablet 768 (Collection) sem overflow
horizontal; tema light aplica cor/fundo corretos no CTA; rede confirma 0
fetch novo de API ao trocar para a aba Relacionados (a única "request"
nova observada foi um beacon de analytics do player de trailer embutido,
pré-existente, sem relação com C6).

### Fora do escopo / dívidas (não bloqueiam DONE)

- Nenhum Quick Peek novo nos cards de Related (link direto é suficiente,
  decisão deliberada do prompt).
- `activity_events`/outras dívidas de schema da C5.2 permanecem como
  estavam — C6 não tocou banco (`DB DIFF = 0`, `MIGRATIONS = 0`).
- Empty state de Related não foi provado via fixture de runtime (Title é
  SSR puro); prova ficou estrutural + dado real (nenhum título testado
  tinha 0 recomendações — TMDB quase sempre devolve algo).
- Ordem/paginação de `parts` na página de coleção não foi alterada
  (já usava `release_date` com fallback seguro, mantido).

**Resultado da fase: C6 DONE.**

## 26. Fase C7 — QA/Polish final da Media Experience (DONE)

Gate final de runtime de toda a Fase C (C1–C6). Auditoria estática já
tinha encontrado e corrigido 1 bug real antes desta execução: a rota
`/api/tmdb/[type]/[id]` (fallback client de title details) tinha sua
própria lógica de fetch de watch providers, sem o mesmo tratamento
defensivo que o SSR (`getTitleDetails`) já tinha — uma falha do TMDB em
`/watch/providers` podia derrubar o endpoint inteiro (título + tudo) em
vez de só degradar para "sem provedores". Corrigido extraindo
`getTitleWatchProviders(type, tmdbId)` (`lib/title-details.ts`) como
função única compartilhada pelos dois caminhos — nunca lança: chave
ausente, falha de rede, status não-ok e JSON malformado todos caem em
`null`, nunca em exceção.

### Runtime executado

Chromium real (Playwright já presente no projeto), guest, servidor
próprio isolado (porta 4220, PID 18748, nunca o do usuário — offline no
início desta fase).

**Matriz de dados reais:** `O Senhor dos Anéis: A Sociedade do Anel`
(movie 120 — collection + related + providers + Direção/Roteiro),
`Clube da Luta` (movie 550 — sem collection), `Breaking Bad` (tv 1396 —
5 temporadas regulares + Especiais/season 0), `Lei & Ordem: SVU` (tv 2734
— episódio real futuro S28E01), coleção 119 (`O Senhor dos Anéis:
Coleção`), navegação Title → Person (`Peter Jackson`, `/person/108`).

**Provider failure (validação específica do bug corrigido):** 5 provas
puras reimplementando `getTitleWatchProviders` com `fetch` mockado
(chave ausente, rede rejeitada, HTTP não-ok, JSON malformado, sucesso) —
todos os 4 cenários de falha resolvem para `null` sem lançar exceção;
sucesso passa os dados adiante inalterados. SSR e API fallback chamam
literalmente a mesma função — semântica idêntica por construção, não só
por teste. Confirmado também end-to-end: `/api/tmdb/movie/120` devolve
`watch_providers` real com resultados BR.

**Quick Peek:** aberto a partir de um card real da página de coleção —
abre, `Escape` fecha, foco retorna exatamente ao botão "Ver rápido" que
abriu (focus trap + restore confirmados), providers renderizados dentro
do dialog.

**Seasons/Episodes:** seletor gera opções a partir dos summaries reais
(`1,2,3,4,5,0`), Especiais aparece por último e navega corretamente;
trocar de temporada atualiza a URL, dispara exatamente 1 request de
season e 0 refetch de title details; Back/Forward restauram URL e
seleção; refresh com `?season=3` reabre a temporada certa; `?season=9999`
cai no fallback seguro (temporada 1) sem erro de página. Episódio futuro
real (SVU S28E01, 2026-10-08) mostra badge "Futuro" e sinopse oculta
tanto na lista quanto na página de episódio, com revelação funcional;
episódio lançado (Breaking Bad "Piloto") mostra still real, metadata e
crédito de direção/roteiro do episódio.

**Error/empty distintos:** fixture real via interceptação client-side
(`page.route`) confirma `role="alert"` visível no estado de erro do
`EpisodeBrowser`.

**Rotas inválidas:** `/title/movie/abc` → 404 nativo do Next
(`notFound()`); `/collection/abc` → "ID de coleção inválido" (erro
client, sem crash); `/title/tv/.../season/abc/episode/1` e
`.../episode/abc` → tratados sem request absurdo. Nenhum loop, nenhum
crash, todos HTTP 200 com estado apropriado renderizado no client (SPA),
exceto o 404 nativo de `/title/movie/abc`.

**Viewports (5 casos distribuídos):** 360×800 (TV), 390×844 (movie),
430×932 (collection), 768×1024 (episode detail), 1440×900 (movie) — todos
com overflow horizontal = 0.

**Temas:** dark, light e **oled** confirmados na Title page completa
(background, texto e CTA de coleção com cor correta e distinta em cada
tema — OLED não ficou `NOT RUN`).

**Reduced motion:** troca de temporada funciona normalmente sob
`prefers-reduced-motion: reduce`, sem depender de animação.

**Keyboard/Focus/A11y:** CTA de coleção focável via teclado; tabs da
Title com `role="tab"`/`aria-selected` corretos; seletor de temporada com
`aria-label`; foco permanece no `<select>` depois de trocar de temporada
(nunca cai para `<body>`); estado de erro com `role="alert"` confirmado.
Touch target de um botão de ação da página de coleção mediu 31×44px
(levemente abaixo de ~40px de largura) — página pré-existente, não
tocada por C6/C7, registrado como observação, não como bug novo.

**Network:** confirmado `DUPLICATE TITLE FETCH = NÃO`,
`DUPLICATE SEASON FETCH = NÃO` (exatamente 1 por troca),
`RECOMMENDATIONS EXTRA CLIENT REQUEST = NÃO` (recomendações vêm do SSR).

**Console:** únicos erros observados em todas as páginas testadas foram
CSP de inline style (pré-existente, documentado desde C2) e 401 guest em
rotas autenticadas (esperado, sem sessão). `CONSOLE ERRORS NEW = 0`,
nenhum `pageerror` novo em nenhuma página testada.

### Bugs

Encontrados nesta execução (além do já corrigido na auditoria estática
prévia): **0**. Todo resultado inicialmente suspeito (ex.: badge/spoiler
"ausente" ou still "ausente" em alguns runs de script combinado) foi
re-verificado isoladamente e confirmado como artefato do próprio script
de teste (reuso de `page`/timing entre passos), não do produto — mesmo
padrão já registrado em C4.2–C5.2.

### Fora do escopo (não bloqueiam DONE)

- Touch target de 31px de largura na página de coleção (pré-existente).
- Todas as dívidas já documentadas em C4/C5/C6 permanecem como estavam —
  C7 não reabriu nenhuma.

**Resultado da fase: C7 DONE. FASE C — MEDIA EXPERIENCE ENCERRADA.
Próxima fase: D — Library & Organization.**

## 27. Fase D1 — Library & Organization Consolidation (DONE)

**Escopo:** implementação consolidada da Fase D a partir do diagnóstico do
D0 (ver [`docs/D-LIBRARY-ORGANIZATION-AUDIT.md`](./D-LIBRARY-ORGANIZATION-AUDIT.md)).

### O que mudou

- **`app/api/library/route.ts` (GET)** — reescrito para filtro/ordenação/
  busca/paginação reais em SQL (WHERE dinâmico via `sql.query()` com
  parâmetros, `ORDER BY` mapeado por opção de sort, `LIMIT`/`OFFSET` real).
  Antes, o modo `paginated=true` buscava a biblioteca inteira do usuário e
  filtrava/ordenava/paginava inteiramente em memória no Node — o maior
  risco de performance apontado pelo D0. Contagens por status e opções de
  gênero/ano agora vêm de duas queries leves e específicas, não de um
  scan completo em JS.
- **`app/favorites/page.tsx`** — passou a chamar `/api/library?favorite=true`
  e confiar no filtro do servidor, em vez de buscar a biblioteca inteira e
  filtrar no cliente.
- **`app/ranking/page.tsx`** — mantido de propósito como busca completa: a
  regra de elegibilidade (`personal_rating !== null AND status !== "want"`)
  não mapeia em um filtro de igualdade único sem mudar comportamento (nota
  0 seria descartada por um `min_rating` de limiar). Documentado como
  exceção deliberada, não como pendência.
- **`components/ReviewPanel.tsx`** — a nota calculada do modo detalhado
  (`computeWeightedRating`, mesma fórmula de antes — média ponderada por
  peso, ou média simples se a soma dos pesos for zero) agora sincroniza com
  `library_items.personal_rating` a cada edição de nota por categoria e a
  cada remoção de categoria. Antes, o cálculo só existia para exibição —
  o banco nunca via essa nota, então Ranking/Stats/badges/Pick for Me/Quick
  Peek liam um `personal_rating` desatualizado sempre que o modo detalhado
  era usado.
- **`app/library/page.tsx`** — migrado para `useSearchParams`/`useRouter`
  (padrão App Router, dentro de `<Suspense>`): os filtros (`page`, `type`,
  `status`, `favorite`, `genre`, `year`, `min_rating`, `min_tmdb_rating`,
  `sort`, `search`) agora vivem na URL nos dois sentidos — nascem dela no
  primeiro render e voltam a ela via `router.replace` a cada mudança, sem
  empilhar histórico. `view mode` continua fora da URL, só em
  `localStorage` (`mycatalog_library_view_mode`), por decisão de produto.
  Reset de página ao mudar filtro foi centralizado em um único efeito
  (fingerprint dos filtros), substituindo `resetPage()` espalhado em cada
  handler. Adicionados estados explícitos de sessão expirada (401 →
  "Entrar", reaproveitando o padrão `/login?reason=session&next=`) e de
  erro de rede com retry, distintos do estado vazio.
- **A11y** — `aria-label`/`aria-pressed`/`aria-expanded` nos botões
  icon-only da Biblioteca e do `PosterGrid` (modo de visualização,
  curtir, alterar status, filtros, paginação); menu de status ganhou
  `role="menu"`/`role="menuitem"`, `aria-haspopup`/`aria-expanded` no
  gatilho e fechamento por Escape.
- **Rótulo de status único** — `PosterGrid`'s `getStatus()` parava de
  hardcodar texto próprio em maiúsculas e passou a derivar de
  `STATUS_LABELS` (`lib/types.ts`), a única fonte do texto dos status.
- **Listas Personalizadas** — implementadas por completo nesta fase:
  - Geração canônica confirmada em runtime (não redesenhada, apenas
    identificada): `custom_lists`/`custom_list_items` é a única geração
    que um consumidor real já lia (`/api/public-profile/[username]`).
    `public.lists` sobrevive só como espelho de `is_public` (criado junto
    em POST/PATCH `/api/lists`); `public.list_items` (a segunda geração,
    por `movie_id`) não tinha nenhum leitor ou escritor real — os dois
    branches mortos que existiam em `POST/DELETE /api/lists/items` foram
    removidos (a tabela em si não foi apagada).
  - `app/lists/page.tsx` — lista as listas do usuário, cria (nome +
    descrição + público/privado), exclui com confirmação; estados de
    carregando/sessão expirada/erro/vazio.
  - `app/lists/[id]/page.tsx` — detalhe de uma lista: visualização pública
    (se `is_public`) ou privada (403 → estado dedicado); dono pode editar
    metadados, excluir a lista, adicionar títulos da própria biblioteca
    (busca + clique) e remover itens. Grade de itens é própria, não
    reaproveita `PosterGrid` — o botão de remover do `PosterGrid` apaga o
    título da biblioteca inteira via `DELETE /api/library/[id]`, o que
    seria um bug perigoso se reusado num contexto de lista.
  - `PosterGrid` ganhou uma prop opcional `onAddToList` — quando presente
    (só a Biblioteca passa), o menu de status ganha "Adicionar à
    lista..."; sem ela, o item de menu não aparece (zero risco de
    regressão para Discover/Favorites/Ranking/Search).
  - `components/lists/AddToListDialog.tsx` — diálogo reaproveitado entre
    o gatilho da Biblioteca, listando as listas do usuário com estado de
    pertencimento (`GET /api/lists?library_item_id=`) e alternando
    adicionar/remover por lista.
  - Prevenção de duplicata já era garantida pela chave primária composta
    `(list_id, library_item_id)` em `custom_list_items` — nenhum código
    novo foi necessário para isso, só UI que reflete o estado real.
  - Perfil público (`/u/[username]`) — cada card de lista agora linka
    para `/lists/[id]`.
  - Navegação principal (`components/Nav.tsx`) — item "Listas" adicionado
    ao final do array (para não deslocar os índices fixos usados pelo
    menu "Mais" do mobile).
- **`hooks/useLists.ts`, `hooks/useTags.ts`** — removidos (0 chamadores
  reais confirmados; ambos chamavam um padrão de rota
  `PUT/DELETE /api/{lists,tags}/[id]` que nunca existiu — as rotas reais
  são `PATCH /api/lists`/`PATCH /api/tags` com `id` no corpo). As páginas
  novas de Listas usam fetch direto, no mesmo padrão do resto do app.
- **Código morto confirmado e removido** (0 chamadores, verificado por
  busca completa no repositório antes de cada remoção):
  `components/ListForm.tsx`, `components/ListList.tsx`,
  `components/TagForm.tsx`, `components/TagList.tsx`, `types/index.ts`
  (só continha as interfaces `Tag`/`List` da geração abandonada,
  consumidas exclusivamente pelos arquivos acima),
  `app/api/reviews/route.ts` (duplicata exata de
  `app/api/reviews/scores/route.ts` — até as mensagens de erro internas
  ainda diziam "GET /api/reviews/scores").
- **Fora do escopo, por decisão de produto (D1):** ações em massa, badge
  de progresso de temporada/episódio na Biblioteca (C5 continua dona
  dessa UX) e UI de Tags — nada disso foi implementado ou removido.
- **Banco de dados:** nenhuma migração, nenhuma tabela apagada. `MIGRATIONS
  = 0`, `DB SCHEMA DIFF = 0`. `public.list_items` ficou sem nenhum
  leitor/escritor no código (candidata a uma decisão futura de remoção de
  tabela, não tomada nesta fase).

**Resultado da fase: D1 DONE. FASE D — LIBRARY & ORGANIZATION ENCERRADA.
Próxima fase: E — Profile & Social.**

## 28. Fase E1 — Profile & Social Consolidation (DONE)

**Escopo:** implementação consolidada da Fase E a partir do diagnóstico do
E0 (ver [`docs/E-PROFILE-SOCIAL-AUDIT.md`](./E-PROFILE-SOCIAL-AUDIT.md)).

### O que mudou

- **`lib/username.ts` (novo)** — fonte única da regra de username
  (`^[a-z0-9_]{3,24}$`, normalização minúscula). Antes triplicada em
  `app/api/profile/username/route.ts`, `app/api/auth/profile/route.ts` e
  `app/api/auth/username/route.ts`; os três agora importam daqui. O
  trigger SQL `handle_new_user_profile()` continua com sua própria cópia
  (não dá para importar TS no Postgres) — documentado como exceção
  necessária, não esquecimento.
- **`supabase/schema.sql`** — `public.username_changes` estava em uso real
  (INSERT/SELECT confirmados em `/api/profile/username`) mas ausente do
  schema versionado. Confirmado via introspecção read-only do
  `TEST_DATABASE_URL` (`information_schema`, sem tocar produção):
  classificação A (tabela existia, schema.sql incompleto). Adicionada a
  definição real (colunas, PK, índice) — `MIGRATIONS = 0`, documentação
  apenas.
- **`app/api/follows/route.ts` (GET reescrito)** — antes devolvia o grafo
  inteiro de follows do usuário numa query sem `LIMIT`, filtrado em JS
  em 4 arrays (E0, HIGH). Agora: `GET /api/follows?type=followers|
  following|incoming|outgoing&page=&limit=` pagina de verdade
  (COUNT dedicado + `LIMIT`/`OFFSET`, página padrão 24, máx. 50).
  `GET /api/follows` sem `type` vira modo resumo — contagens via
  `count(*) FILTER` e só o item mais recente de incoming/accepted — o
  único formato que o polling de 30s do `FollowRequestNotifier`
  precisa.
- **`components/FollowRequestNotifier.tsx`** — trocou o diff de sets
  sobre o grafo inteiro pelo modo resumo acima; compara apenas o ID do
  item mais recente de incoming/accepted a cada poll.
- **`components/SocialSettings.tsx` (reescrito)** — parou de reimplementar
  a lista de followers/following/solicitações (a segunda UI de follow
  que o E0 encontrou). Ficou só com: visibilidade do perfil, política de
  quem pode seguir, as 8 visibilidades por seção, e um link para
  gerenciar conexões no perfil (`/u/[username]?tab=connections`).
- **`app/u/[username]/page.tsx`** — a aba "Conexões" do dono virou a
  única superfície real de gerenciar follow: sub-abas (Solicitações/
  Enviadas/Seguidores/Seguindo), cada uma paginada com "carregar mais"
  contra o novo contrato de `/api/follows`. O modal de followers/
  following para quem não é dono continua existindo (leitura rápida,
  com busca local) mas a query que o alimenta
  (`/api/public-profile/[username]/route.ts`) ganhou um `LIMIT 200` —
  não é cursor completo como a aba do dono, é um teto documentado,
  suficiente para o caso de uso (navegar/pesquisar uma lista, não
  paginar infinitamente a rede social de outra pessoa).
- **`app/api/public-profile/[username]/activity/route.ts` (novo)** —
  `activity_events` (a mesma tabela real que já alimenta Home/Diário/
  Retrospectiva via `/api/activity`, intocado) virou a fonte canônica
  da aba "Atividade" do perfil público, paginada (`LIMIT`/`OFFSET`,
  página padrão 10), com a mesma checagem de privacidade server-side
  (`activity_visibility` + relação de follow) que o resto da rota de
  perfil público já usa. Antes, essa aba reconstruía um feed ad-hoc a
  partir de `library_items` ordenado por `updated_at`, sem paginação —
  uma segunda noção de "atividade" desconectada do log real.
- **`app/u/[username]/page.tsx` — aba Atividade** — trocou o carrossel de
  pôsteres recém-atualizados por um feed de eventos de verdade (ícone +
  texto por `event_type`, com fallback neutro para qualquer tipo fora
  do mapa conhecido — nunca quebra em um tipo desconhecido), com
  "carregar mais".
  - **Bug real encontrado e corrigido durante o QA desta mesma
    implementação**: o efeito de carregamento inicial e o clique de
    "carregar mais" tinham uma corrida de closure — em React 18 Strict
    Mode (dev), o efeito de montagem roda duas vezes, e um segundo
    efeito (reset ao trocar de `username`) também rodava no mount
    inicial e podia resetar a guarda de "já carregado" bem depois do
    primeiro efeito tê-la marcado, disparando uma segunda carga real da
    página 1. Corrigido com refs (`activityPageRef`/`activityLoadedRef`)
    em vez de ler o estado React diretamente dentro do closure
    assíncrono, e o reset por troca de usuário passou a comparar com o
    último username visto (só reseta em navegação real entre perfis,
    não no mount). Verificado em runtime contra dados reais do
    `TEST_DATABASE_URL` (perfil fixture com 361 eventos) até confirmar
    20 linhas renderizadas após dois cliques em "carregar mais".
- **A11y** — `role="tablist"`/`role="tab"`/`aria-selected` nas abas
  principais do perfil e nas sub-abas de conexões; `aria-haspopup`/
  `aria-expanded` e fechamento por Escape no modal de followers/
  following; `aria-label` nos botões icon-only restantes.

### Decisões já resolvidas, sem mudança de código

- **Bio**: limite de 280 já era aplicado no client (`maxLength`) E no
  servidor (`.slice(0, 280)`) em `app/api/profile/showcase/route.ts` —
  já PASS, nada para espelhar.
- **Avatar replace/failure**: cleanup do blob anterior já só acontecia
  para blobs Vercel próprios (preservando avatares legados de outro
  storage), e falha de upload já não perdia o avatar atual (rollback do
  blob novo se o banco falhasse) — ambos já PASS.
- **`/api/search/users`**: já retornava só `id, username, display_name,
  avatar_url` (nenhum campo privado) e já limitava a 20 resultados —
  decisão de produto #4 confirmou que perfis privados continuam
  pesquisáveis por design; nada para mudar.
- **Profile vs. Settings**: `/u/[username]` já era o único lugar de
  edição de perfil; Settings "Geral" já só linkava para lá. `Account
  Privacy` ainda toca `/api/auth/profile` (fronteira Account/Profile
  ligeiramente borrada) — não mexido nesta fase, fora do escopo
  MUST/SHOULD fechado.

### Fora do escopo, por decisão de produto (E1)

Feed social (atividade de quem se segue), friends, block/mute/report —
nenhum implementado ou removido, conforme decisões #49–51.

### Banco de dados

Nenhuma tabela apagada. `MIGRATIONS = 0` (a correção de
`username_changes` foi documentação de uma tabela já existente, não uma
migration nova). `DB SCHEMA DIFF` = só a adição documentada acima.

**Resultado da fase: E1 DONE. FASE E — PROFILE & SOCIAL ENCERRADA.
Próxima fase: F — Premium Features.**

## 29. Fase F1 — Premium Features Consolidation (DONE)

**Escopo:** implementação consolidada da Fase F a partir do diagnóstico do
F0 (ver [`docs/F-PREMIUM-FEATURES-AUDIT.md`](./F-PREMIUM-FEATURES-AUDIT.md)).

### O que mudou

- **`app/api/stats/route.ts` (novo)** — Stats parou de buscar a
  biblioteca inteira via `/api/library` e agregar tudo em `useMemo` no
  browser (F0, HIGH). Agora `GET /api/stats` faz toda a agregação em
  SQL — `COUNT`/`AVG`/`SUM`/`GROUP BY` — e devolve um `StatsSummary` já
  pronto (contagens, médias, distribuição de notas, gêneros, anos,
  tempo assistido, maior nota). A página só renderiza o resumo; nunca
  vê as linhas da biblioteca. Confirmado em runtime contra dados reais
  seedados no `TEST_DATABASE_URL`: zero chamadas a `/api/library` a
  partir de `/stats`.
- **Bug real encontrado e corrigido**: o painel "Gêneros mais
  presentes" em `app/stats/page.tsx` renderizava `years.map(...)` em
  vez de `genres.map(...)` (cópia-e-cola) — mostrava anos duas vezes e
  a lista de gêneros nunca aparecia. `genres` era uma variável
  calculada e nunca usada. Corrigido junto da reescrita.
- **`app/api/calendar/route.ts`** — reduzido o fan-out de chamadas TMDB:
  filmes já com status `watched`/`rewatching`/`rewatched` são excluídos
  do fan-out (`eligible`) porque nunca podem ter um evento de
  lançamento futuro — `calendarTMDB` fazia duas chamadas TMDB por
  título (detalhes + datas de lançamento) só para devolver uma data que
  já passou. Séries continuam sempre elegíveis (podem sempre ganhar
  novo episódio/temporada). Resto do Calendar preservado — mesmo
  `Promise.allSettled` (resiliente a falha parcial), mesmo `scope=all`/
  `scope=library`, mesmo cache de 30s.
- **`components/NotificationSettings.tsx`** — preferências sem produtor
  real (`new_follower_*`, `follow_request_*`, `review_like_*`) e
  toggles de e-mail (incluindo `product_updates_email`) removidos da UI
  ativa — nenhum sender de e-mail existe, e o follow system (E1) nunca
  escreve em `notifications` (a tabela só aceita `type IN
  ('new_season','new_episode')` por CHECK constraint). Só os dois
  toggles com produtor real confirmado continuam visíveis. Colunas do
  banco preservadas — nenhuma migration, os valores continuam sendo
  lidos/gravados pela API, só não aparecem mais como se funcionassem.
- **`app/diary/page.tsx`** — `STATUS_LABELS` local duplicado (idêntico
  ao de `lib/types.ts`, a fonte única estabelecida na D1) substituído
  pelo import compartilhado.
- **A11y**: `role="status"`/`aria-live` nos estados de carregamento e
  `role="alert"` + botão "Tentar de novo" nos estados de erro de Diário
  e Retrospectiva (antes só mostravam a mensagem, sem ação de retry);
  `aria-pressed` nos filtros de tipo do Calendar.
- **Notifications API** (`/api/notifications`, `/api/profile/notifications`)
  — auditados, já corretos: `LIMIT 30` + contagem de não lidos via SQL
  (não `.length`), sem mudança necessária.
- **Export/Backup** — auditado, confirmado seguro (aditivo/upsert, sem
  `DELETE`/`TRUNCATE`, limite de 10 MB já aplicado) — nenhuma mudança de
  código, decisão de produto foi preservar como está.
- **Pick for Me / For You** — algoritmos preservados integralmente
  (nenhuma linha de lógica de recomendação alterada), confirmado que
  cada um consulta `library_items` uma única vez por requisição (sem
  fetch duplicado). O fetch client-side de `/api/library` completo que
  `app/for-you/page.tsx` faz para estado local dos cards (favorito/
  status) é o MESMO padrão já usado por Discover (Fase B, já encerrada)
  — não é uma duplicação introduzida por Premium Features, é um padrão
  cross-page preexistente fora do escopo desta consolidação.

### Fora do escopo, por decisão de produto (F1)

Sharing e Achievements — nenhum implementado. Nenhuma IA/motor de
recomendação novo criado. Pick for Me e For You continuam features
distintas, não fundidas. Nenhum sender de e-mail implementado.

### QA em runtime

Conta descartável criada via `/signup` no `TEST_NEON_AUTH_BASE_URL` +
`TEST_DATABASE_URL` (nenhuma credencial de produção usada). Estados
vazios verificados nas 5 páginas (Stats/Calendar/Diary/Retrospective/
For You) sem erros de console. Dados de biblioteca controlados
inseridos diretamente no TEST DB (2 filmes + 1 série, com notas/status/
gêneros/eventos de atividade) para verificar agregação real: números do
`/api/stats` conferidos linha a linha contra o que foi seedado (nota
média 8.5, TMDB 7.27, 16h de tempo estimado, gêneros deduplicados
corretamente). Sem overflow horizontal em 360/390/430/768/1440 nas 5
páginas + aba de notificações em Settings. Dados de fixture e conta
removidos do TEST DB ao final.

### Banco de dados

Nenhuma tabela apagada, nenhuma migration. `MIGRATIONS = 0`, `DB SCHEMA
DIFF = 0` — as colunas de `notification_preferences` sem produtor real
foram preservadas, só escondidas da UI ativa.

**Resultado da fase: F1 DONE. FASE F — PREMIUM FEATURES ENCERRADA.
Próxima fase: G — Motion & React Bits (nome definido no roadmap, escopo
ainda não detalhado).**

## 30. Fase G1 — Motion & Interaction Consolidation (DONE)

**Escopo:** implementação consolidada da Fase G a partir do diagnóstico
do G0 (ver [`docs/G-MOTION-REACT-BITS-AUDIT.md`](./G-MOTION-REACT-BITS-AUDIT.md)).

### Decisão de React Bits

**Não adotado.** Os 5 candidatos avaliados no G0 (Spotlight/Glow Card,
Animated gradient text, Marquee, Tilt 3D, Particles/background) foram
todos classificados `NO` — nenhum resolve um problema real que a
fundação de tokens já existente (`styles/tokens.css`) não resolvesse
com menor custo. `REACT BITS ADDED = 0`. Nenhuma dependência nova
instalada (`package.json`/lockfile inalterados).

### O que mudou

- **`app/globals.css` — duplicação de reduced-motion removida**: dois
  blocos `@media (prefers-reduced-motion: reduce) { *, *::before,
  *::after {...} }` idênticos (dois "Lotes" de patch independentes que
  não sabiam um do outro) viraram um só. Efeito visual idêntico — é a
  mesma regra universal `!important`, a posição no arquivo não muda o
  resultado.
- **`.mc-skeleton::after` (skeleton legado) ganhou reduced-motion
  explícito** — antes só herdava o congelamento genérico (que podia
  deixar uma faixa de brilho parada em vez de um fundo estático limpo).
  Agora esconde a faixa (`display:none`) sob `[data-motion="reduced"]`
  e `prefers-reduced-motion: reduce`, igualando o comportamento que
  `.mc-ui-skeleton` (sistema novo) já tinha.
- **`components/CarouselRail.tsx`** — `scrollBy({behavior:"smooth"})` é
  um argumento JS da Scroll API, não uma propriedade CSS; a regra
  global `scroll-behavior:auto!important` não é garantida a sobrepor
  esse argumento em todos os browsers. Agora o componente checa
  `prefers-reduced-motion` (SO) e `data-motion="reduced"` (preferência
  do app, já configurável em Configurações → Aparência) antes de rolar,
  e usa `behavior:"auto"` quando qualquer um estiver ativo.
- **Gap real de foco corrigido**: `.card-actions` (ações do card —
  Preview/Favoritar/Status) eram reveladas só no hover
  (`@media(hover:hover)`, já corretamente protegido para touch) mas sem
  `:focus-within` equivalente — um usuário de teclado tabulava até um
  botão com `opacity:0`. Adicionado `.card:focus-within .card-actions`
  ao lado de `.card:hover .card-actions`. Verificado em runtime: o
  botão atinge `opacity:1` ao receber foco via teclado.
- **Feedback de pressão (`:active`) adicionado** aos controles
  principais que não tinham nenhum — `.btn`, `.card-action` (2
  variantes), `.view-switcher button`, `.library-quick-filter`,
  `.discover-favorite-button`, `.library-page-btn` — todos com
  transform/background sutis (ex.: `scale(0.96)`,
  `translateY(0.5px)`), guardados por `:not(:disabled)` onde aplicável,
  sem alterar layout. Verificado em runtime: `.card-action` aplica
  `matrix(0.96,0,0,0.96,0,0)` durante o clique.
- **Menus de status ganharam transição de abertura consistente** —
  `library-card-status-menu`, `discover-library-status-menu`,
  `fy-status-menu`, `collection-status-menu`, `pick-status-menu` agora
  usam `animation: mc-popover-in var(--mc-duration-fast)
  var(--mc-ease-enter)` (o mesmo keyframe tokenizado, já
  reduced-motion-safe, que `Popover.tsx` usa) em vez de aparecer com
  corte seco. Comportamento funcional (abrir/fechar, ações) preservado
  — só a transição visual foi adicionada.
- **Achado durante a implementação, corrigido junto**: `.account-dropdown`
  tinha DUAS regras de `animation` competindo no mesmo elemento — a
  própria (`accountMenuIn`, legada) e `mc-popover-in` (herdada de
  `.mc-popover`, a classe que `<Popover>` sempre aplica). Quem vencia
  dependia só da ordem de importação das folhas de estilo. Removida a
  duplicata local (`accountMenuIn` e seu `@keyframes`, 0 outros
  consumidores confirmados) — o menu de conta passa a usar só a
  animação tokenizada compartilhada.
- **`.media-carousel-arrow` (2 blocos aparentemente duplicados no G0)**
  — investigado e confirmado que **não são duplicatas reais**: o
  segundo bloco é uma sobrescrita deliberada em cascata (muda posição,
  opacidade padrão para hover-reveal, e o comportamento em mobile de
  "esconder" para "mostrar menor"). Preservado sem alteração, conforme
  instrução de não quebrar cascata intencional.

### Fora do escopo, por decisão de produto (G1)

React Bits, page transitions, scroll reveal global, partículas, cursor
follower, parallax global, tilt 3D, marquee contínuo, backgrounds
animados, shaders pesados, efeitos de texto decorativos globais —
nenhum implementado.

### QA em runtime

Conta descartável criada via `/signup` no `TEST_NEON_AUTH_BASE_URL` +
`TEST_DATABASE_URL`, com 2 títulos seedados para exercitar Quick Peek,
menu de status e feedback de pressão. Verificado com motion normal E
com `prefers-reduced-motion: reduce`: Title, Library, Profile, Stats,
Retrospective, Home — zero erros de console novos, zero overflow
horizontal em 360/390/430/768/1440. Quick Peek (`MediaPreviewDialog`)
abre e fecha corretamente por Escape em ambos os modos de motion — sem
regressão no `Dialog` primitive (não reescrito, conforme instrução).
Menu de status abre corretamente com a nova animação. Foco por teclado
em `.card-actions` confirmado revelando as ações
(`opacity:1`). Feedback de pressão confirmado (`transform:
scale(0.96)`) no clique real. `CarouselRail`: a correção de
reduced-motion foi verificada por revisão de código e build (sem
erro de tipo/lint) — o fixture de QA não tinha conteúdo suficiente
para produzir uma trilha com overflow real em nenhuma superfície
disponível na conta descartável, então o comportamento visual do
scroll em si não foi observado diretamente no browser desta vez;
documentado como limitação, não como pendência de código.

### Banco de dados

Nenhuma tabela tocada — Fase G é puramente CSS/motion, sem contato com
banco. `MIGRATIONS = 0`, `DB SCHEMA DIFF = 0`.

**Resultado da fase: G1 DONE. FASE G — MOTION & REACT BITS ENCERRADA.
Próxima fase: H — Mobile/Accessibility/Performance (nome definido no
roadmap, escopo ainda não detalhado).**
