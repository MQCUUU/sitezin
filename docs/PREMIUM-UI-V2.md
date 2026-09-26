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
- **C — Media Experience** = NEXT
- **D — Library & Organization**
- **E — Profile & Social**
- **F — Premium Features**
- **G — Motion & React Bits**
- **H — Mobile/Accessibility/Performance**
- **I — QA/Polish/Release**

## 21. Fase C — Nota de handoff

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
