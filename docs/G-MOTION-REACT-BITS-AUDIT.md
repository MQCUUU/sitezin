# G0 — Auditoria de Motion & React Bits

**Data:** 2026-09-27
**Escopo:** auditoria read-only de produto e arquitetura. Nenhum código,
CSS, pacote ou comportamento foi alterado. Fase F encerrada em
`d8c9405 feat(premium): consolidate premium features`; checkpoint
inicial estava limpo.

> **Status: G0 = DONE, G1 = DONE. Fase G encerrada.** A implementação de
> G1 (consolidação a partir da proposta da seção 34) está documentada em
> [`docs/PREMIUM-UI-V2.md` § 30](./PREMIUM-UI-V2.md#30-fase-g1--motion--interaction-consolidation-done).
> As seções abaixo permanecem como registro fiel do estado encontrado
> **antes** de G1.

## 1. Definição real de G no roadmap

Diferente de E e F, a Fase G **não é uma folha em branco** — o roadmap
já tem uma fundação de design escrita nas seções 11-18 (parte dos
princípios visuais da Premium UI V2, não de uma fase específica):

- **§11 Motion**: já declara os tokens de duração/easing e a regra "use
  sempre o token, nunca `ms` literal".
- **§12 Interaction states**: ordem obrigatória `default → hover →
  active → focus-visible → disabled → loading`.
- **§16 Accessibility**: motion sempre condicionado a
  `prefers-reduced-motion`/`data-motion`.
- **§17 Uso correto de efeitos**: regras sobre glass/blur, gradiente,
  glow.
- **§18 Regras futuras para React Bits**: **React Bits não está
  instalado** ("Não instalado nesta fase") — a fase existe para decidir
  SE e ONDE adotar, com 6 critérios já definidos (resolver problema real
  de UX, respeitar reduced-motion, fallback estático em mobile, não
  degradar Core Web Vitals, respeitar tokens de cor/spacing, máximo 1
  efeito "vitrine" por tela).

Ou seja: G não parte do zero. O que falta é auditar o quanto dessa
fundação já escrita está **de fato implementada em código** (verificado
abaixo) versus o que ainda é só intenção, e decidir se/onde React Bits
entra.

## 2. React Bits — não presumir

**REACT BITS INSTALLED = NÃO.** **REACT BITS CODE PRESENT = NÃO.**

Confirmado por `package.json`: nenhuma dependência com nome
"react-bits" ou equivalente. Nenhum componente copiado manualmente
encontrado (buscado por padrões de nomes típicos de React Bits —
Spotlight, Tilt, Marquee, Particles, GradientText — sem match). Nenhuma
menção a componentes React Bits específicos em nenhum doc além do §18
já citado (que é só a regra de adoção futura, não uma lista de
componentes escolhidos).

## 3. Auditoria de pacotes

`package.json` completo:
- **dependencies**: `@neondatabase/auth`, `@neondatabase/serverless`,
  `@vercel/blob`, `dotenv`, `lucide-react`, `next` (16.3.1), `react`/
  `react-dom` (19.2.8).
- **devDependencies**: `@playwright/test`, `@types/node`, `@types/react`,
  `@types/react-dom`, `eslint`, `eslint-config-next`, `typescript`.

**CURRENT MOTION LIBRARIES = NONE.** Nenhuma biblioteca de
animação/gesture/carousel instalada (`framer-motion`, `motion`,
`react-spring`, `gsap`, `anime`, `@formkit/auto-animate`,
`embla-carousel` — todas ausentes). Todo carrossel, modal, popover e
motion é feito à mão (CSS nativo + hooks React pequenos). `lucide-react`
é a única dependência tangencial (ícones, incluindo o ícone `Loader2`
usado como spinner em todo o app).

## 4. Inventário de Motion (real, verificado em código)

| Superfície | Tipo | Implementação | Duração | Reduced motion | Reutilizável |
|---|---|---|---|---|---|
| `components/ui/Dialog.tsx` + `.mc-dialog`/`.mc-dialog-backdrop` | modal open/close | CSS `@keyframes` (`mc-overlay-fade-in`, `mc-dialog-in`) + tokens | `--mc-duration-normal` | SIM (2x, consistente) | SIM — primitive compartilhada |
| `components/ui/Popover.tsx` + `.mc-popover` | popover open | CSS `@keyframes mc-popover-in` + tokens | `--mc-duration-normal` | SIM (2x, consistente) | SIM |
| `components/CarouselRail.tsx` | scroll horizontal | `scrollBy({behavior:"smooth"})` (JS) | nativo do browser | PARCIAL — ver §8 (gap real) | SIM |
| `.mc-title-poster-wrap:hover` (title.css) | hover lift | CSS transition tokenizada | `--mc-duration-normal` | SIM (override próprio) | SIM |
| `.mc-title-tab` (title.css) | troca de aba | CSS transition tokenizada | não especificado | SIM (override próprio, 3ª repetição da regra) | SIM |
| `.mc-media-card-image` (media-card.css) | hover/focus lift | CSS transition tokenizada | `--mc-duration-*` | SIM | SIM |
| `.card-actions` (globals.css, legado) | reveal de ações no hover | CSS `opacity`/`transform`, hardcoded `.2s ease` | `.2s` | Coberta pelo bloqueio global, mas SEM par de `:focus-within` (gap real, §13/§24) | PARCIAL |
| `.spin` (globals.css, legado) + `Loader2` | loading spinner | `@keyframes spin`, `.8s linear infinite` | `.8s` | Coberta pelo bloqueio global (`!important`) | SIM, mas duplicado com `.mc-spinner` |
| `.mc-spinner`/`mc-spin` (primitives.css, novo) | loading spinner | CSS tokenizado, `.7s linear` | `.7s` | SIM (2x) | SIM, ainda sem adoção |
| `.mc-ui-skeleton` (Skeleton.tsx/primitives.css) | loading skeleton | CSS `@keyframes mc-ui-skeleton-sweep` | tokenizado | SIM (2x, troca para cor sólida) | SIM |
| `.mc-skeleton` (AsyncState.tsx/globals.css) | loading skeleton (legado) | CSS `@keyframes mcSkeletonShimmer`, 1.25s | `1.25s` | **NÃO tem override próprio** — só herda o bloqueio global genérico (congela a animação no meio do degradê, não reseta para cor sólida como o #1) | NÃO — documentado no próprio código como propositalmente paralelo |
| `homeShimmer`/`homeSmartPulse` (Home, globals.css) | loading skeleton (Home) | CSS `@keyframes`, page-specific | variável | herda bloqueio global | NÃO |
| `fyPulse` (For You) | loading skeleton | CSS `@keyframes`, page-specific | variável | herda bloqueio global | NÃO |
| `pickPosterPulse`/`pickDot` (PickForMe) | loading | CSS `@keyframes`, page-specific | variável | herda bloqueio global | NÃO |
| `accountMenuIn` (globals.css) | dropdown open | CSS `@keyframes`, translateY+scale | não tokenizado | herda bloqueio global | NÃO |
| `mycatalogToastIn`/`mycatalogToastProgress` (globals.css) | toast entrada/progresso | CSS `@keyframes` | não tokenizado | herda bloqueio global | NÃO |

## 5. Fundação global de motion

**MOTION TOKENS EXIST = SIM**, confirmados em `styles/tokens.css`:

```
--mc-duration-instant: 60ms;
--mc-duration-fast: 120ms;
--mc-duration-normal: 200ms;
--mc-duration-slow: 320ms;
--mc-ease-standard: cubic-bezier(0.4, 0, 0.2, 1);
--mc-ease-enter: cubic-bezier(0, 0, 0.2, 1);
--mc-ease-exit: cubic-bezier(0.4, 0, 1, 1);
--mc-ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
```

Ambos `[data-motion="reduced"]` e `@media (prefers-reduced-motion:
reduce)` zeram os 4 tokens de duração. Isso é real, funcional, e já
usado por ~76% das transições da camada nova (`styles/*.css`, 19 de 25
declarações `transition:` usam os tokens). **Zero penetração na camada
legada**: as 70 declarações `transition:` de `app/globals.css` são
todas valores brutos (`.14s`/`.15s`/`.16s`/`.18s`/`.2s`/`.25s`, todas
com o mesmo `ease` literal) — nenhuma usa os tokens.

## 6. Design tokens — achados

- **6 durações hardcoded distintas** convivendo com os 4 tokens oficiais
  na camada legada (`.14s .15s .16s .18s .2s .25s` vs.
  `60/120/200/320ms`) — nenhuma correspondência limpa 1:1.
- **Easing**: legado usa só a palavra-chave `ease` (CSS nativa); a
  camada nova usa os 4 `cubic-bezier` dos tokens. Divergência real.
- **Animações duplicadas** (achado concreto, não hipotético):
  - `@media (prefers-reduced-motion: reduce) { *, *::before, *::after
    {...} }` aparece **duas vezes, byte-a-byte idêntico**, em
    `app/globals.css` (linhas ~11402-11411 e ~11541-11550) — dois
    "Lotes" de patch diferentes, o segundo comentário explicitamente
    diz "o projeto já respeita isso via `data-motion=\"reduced\"`" sem
    checar que o bloco de mídia OS-level já existia.
  - `.media-carousel-arrow` tem dois blocos de definição separados em
    `globals.css` (um completo com transição/hover, outro só com
    `top`/`opacity`) — mesmo padrão de duplicação por patch.
  - Reduced-motion é reescrito **individualmente** em pelo menos 3
    lugares além do bloqueio global (`overlays.css` para dialog/popover,
    `title.css` para poster hover e para tabs) — funcionalmente
    correto, mas repetitivo; um mixin/classe utilitária resolveria isso
    numa consolidação, não nesta auditoria.
- **Glow**: não encontrado nenhum `box-shadow` colorido animado (a
  auditoria checou os 12 `@keyframes` byte-a-byte — nenhum anima
  `box-shadow`). §17 já proíbe isso e o código respeita.
- **Blur**: `backdrop-filter` aparece 39 vezes (34 no legado, 5 na
  camada nova) e `filter: blur()` dezenas de vezes — concentrado em
  fundos de modal/dropdown e pequenos elementos de chrome (botão de
  fechar preview, pill de nota, setas de carrossel). Nenhum uso como
  fundo de página inteira (§17 já proíbe isso, respeitado).

## 7. Fundação de tokens (redundante com §5-6, ver acima)

## 8. Reduced motion

**REDUCED MOTION FOUNDATION**: duas camadas coexistentes e
complementares —
1. Bloqueio global (`globals.css`, duplicado 2x): `*, *::before,
   *::after { animation-duration:0.01ms!important;
   transition-duration:0.01ms!important; scroll-behavior:auto!important
   }` sob `[data-motion="reduced"]` E sob `@media
   (prefers-reduced-motion: reduce)`. Isso cobre TODO o app, mesmo
   componentes com CSS hardcoded, porque é `!important` e usa seletor
   universal.
2. Tokens zerados (`tokens.css`) para a camada nova, que usa os tokens
   diretamente.

**Gap real encontrado**: `components/CarouselRail.tsx` chama
`rail.scrollBy({ left, behavior: "smooth" })` — um argumento `behavior`
explícito na Scroll API do browser. A propriedade CSS `scroll-behavior:
auto !important` do bloqueio global só afeta rolagens que **não**
especificam `behavior` explicitamente na chamada JS (comportamento
documentado da API) — ou seja, esse scroll específico pode não ser
neutralizado pela regra global em todos os browsers. É a única
superfície com motion que "escapa" da rede de segurança de
reduced-motion já existente.

**Segundo gap menor**: `.mc-skeleton` (legado, `AsyncState.tsx`) não
tem override próprio de reduced-motion — só herda o bloqueio genérico,
que CONGELA o shimmer no meio do degradê (troca de posição de
gradiente) em vez de resetar para uma cor sólida, como a versão nova
(`.mc-ui-skeleton`) já faz corretamente. Efeito residual visível
(gradiente parado), não um crash, mas inconsistente.

## 9. Modais / Diálogos

`components/ui/Dialog.tsx` (117 linhas) é a primitive real: portal via
`createPortal`, scroll lock, Escape, foco em trap completo (Tab
cíclico), restauração de foco ao fechar, backdrop com
`preventDefault()` para proteger o restore de foco. Motion 100% CSS
(`mc-overlay-fade-in` + `mc-dialog-in`), reduced-motion coberto 2x
corretamente dentro do próprio arquivo (`overlays.css`). `Popover.tsx`
segue o mesmo padrão (Escape + outside-click, motion CSS,
reduced-motion 2x). `MediaPreviewDialog`, `AddToListDialog`,
`SearchRemoveDialog`, `DiscoverRemoveDialog`, `ConfirmProvider` — todos
resolvidos sobre essa mesma primitive (migração já registrada no
histórico de C2.x). **Nenhuma transição de modal duplicada ou
divergente encontrada** — esta é a superfície mais consolidada do
motion no app hoje.

## 10. Carrosséis / Rails

`components/CarouselRail.tsx`: scroll nativo assistido por JS
(`scrollBy` com `behavior:"smooth"`), detecção de borda via
`scrollLeft`/`ResizeObserver` + um `requestAnimationFrame` pontual
(não é loop contínuo). Setas prev/next são `<button>` reais com
`aria-label` e `disabled` nas bordas — acessíveis por teclado
nativamente. Gap de reduced-motion já descrito em §8.

## 11. Title Page (motion apenas, produto C1-C7 não reaberto)

`TitleHero.tsx` sem motion (puramente apresentacional, imagem com
`priority` para LCP). `TitleTrailer.tsx` é um `<iframe>` puro, zero
transição, sem skeleton enquanto o iframe carrega. Hover do poster e
troca de aba de conteúdo (`.mc-title-tab`) já tokenizados e com
reduced-motion próprio — mas cada um reescrevendo a mesma regra de
override em vez de herdar um utilitário único (§6).

## 12. Library

`PosterGrid.tsx`/`DiscoverCard.tsx` sobre o sistema `MediaCard`
compartilhado. Hover/foco do card já pareados corretamente
(`:hover`+`:focus-within`) na camada nova (`media-card.css`). **Gaps
reais**: menus de status (`library-card-status-menu`,
`discover-library-status-menu`, `fy-status-menu`, `collection-
status-menu`, `pick-status-menu`) não têm NENHUMA transição de
abertura/fechamento — aparecem/desaparecem com corte seco, ao contrário
do `.account-dropdown` (que tem `accountMenuIn`). Troca de view mode
(grid/compact/list) também não tem nenhuma transição — re-layout
instantâneo.

## 13. Profile / Social (motion apenas, E não reaberto)

Não auditado componente-a-componente nesta rodada (fora do escopo
central desta pesquisa) — usa os mesmos primitives (`Dialog`,
`Popover`, `MediaCard`) já cobertos acima. Sem evidência de motion
divergente específico de Profile.

## 14. Premium Features (motion apenas, F não reaberto)

Cada uma das features da Fase F tem seu **próprio** keyframe de loading
isolado (`fyPulse` para For You, `pickPosterPulse`/`pickDot` para Pick
for Me, `homeShimmer`/`homeSmartPulse` para Home) — nenhuma reutiliza a
skeleton system nova (`.mc-ui-skeleton`) nem a legada compartilhada
(`.mc-skeleton`). Stats/Calendar/Diary/Retrospective (F1, recém
consolidadas) não têm nenhuma animação de gráfico/card própria além do
`Loader2 className="spin"` padrão nos estados de carregamento —
consistente com o resto do app, sem gap novo introduzido pela F1.

## 15. Page Transitions

**PAGE TRANSITIONS EXIST = NÃO.** Nenhum `template.tsx` em nenhuma
rota. `app/layout.tsx` é um shell estático sem motion. `loading.tsx`
(Suspense nativo do App Router) existe em só **5 rotas**: raiz,
`/discover`, `/for-you`, `/library`, `/title/[type]/[id]`. Todas as
outras páginas (busca, coleção, listas, pessoa, stats, perfil, etc.)
não têm um `loading.tsx` próprio — presumivelmente tratam o estado de
carregamento manualmente no client.

**Custo/risco de adicionar transições globais de página no Next.js**:
exigiria ou (a) uma dependência de animação (framer-motion `Layout
Group`/`AnimatePresence`, hoje ausente — instalação nova, contra a
política padrão do projeto de "sem pacote novo sem necessidade real),
ou (b) `template.tsx` por rota com CSS puro, que força **remount
completo da árvore em toda navegação** (Next.js documenta isso
explicitamente) — puro custo de performance sem ganho de produto
comprovado. Não recomendado sem uma decisão de produto explícita (ver
§31).

## 16. Scroll Reveal

**SCROLL REVEAL EXISTS = NÃO.** Busca exaustiva por
`IntersectionObserver`/`useInView`/`data-reveal` no app inteiro: zero
resultados. Não existe nenhum mecanismo de revelar conteúdo ao rolar.

## 17. Hover effects

~85 regras `:hover` no total (53 em `globals.css`, 32 em
`styles/*.css`). Padrões reais: lift+scale de card/poster, mudança de
cor de texto/ícone, fundo de superfície (`--mc-color-surface-hover`),
escurecimento de botão sobre blur, escala de seta de carrossel. A
maioria já pareia `:hover` com `:focus-visible`/`:focus-within` na
camada nova. **A única inconsistência real encontrada**: `.card-actions`
(ações do card — Preview/Favoritar/Status) reveladas só no hover
(corretamente protegidas por `@media(hover:hover)` para touch, e
forçadas visíveis em mobile via `max-width:700px`), mas **sem**
`:focus-within` equivalente — um usuário de teclado em desktop tabula
até um botão que está com `opacity:0` no momento do foco.

## 18. Active / Press feedback

**Praticamente ausente na camada legada.** `:active` tem **zero**
ocorrências em `app/globals.css` e só **3** em `styles/primitives.css`
(`.mc-btn:active`, `.mc-btn--primary:active`,
`.mc-surface--interactive:active`) — todas na camada nova, ainda pouco
adotada pelos botões reais do app (`.btn`, `.card-action`,
`.title-main-btn` não têm nenhum estado `:active` próprio). Gap real e
concreto para consolidação.

## 19. Loading Motion

Ver inventário completo em §4. **Pelo menos 6 implementações de
skeleton/pulse/shimmer independentes** (`.mc-ui-skeleton` novo,
`.mc-skeleton` legado, `homeShimmer`, `homeSmartPulse`, `fyPulse`,
`pickPosterPulse`+`pickDot`) e **2 sistemas de spinner** (`.spin`
legado usado em 34 arquivos, `.mc-spinner` novo ainda sem adoção).
Inconsistente por construção — cada feature escreveu a sua. Reduced
motion: coberto pelo bloqueio global em todos, mas só o `.mc-ui-skeleton`
novo tem um override APROPRIADO (troca para cor sólida em vez de só
congelar a animação).

## 20-22. Performance / Mobile / Hardware

| Risco | Classificação |
|---|---|
| `backdrop-filter`/`blur()` em elementos que também animam hover/entrada (dialogs, popovers, menus, setas) — 39+ ocorrências, sem `will-change` em nenhuma | **MEDIUM** — blur composto + transform pode custar em GPUs modestas, mas nenhum uso é full-screen nem contínuo |
| `scrollBy({behavior:"smooth"})` não neutralizado por reduced-motion em 100% dos browsers | **LOW-MEDIUM** — afeta só quem ativou reduced-motion, não é um risco de performance geral, é um risco de acessibilidade/conforto |
| `requestAnimationFrame` | **LOW** — 5 usos, todos pontuais (pós-paint, posicionamento), nenhum loop contínuo |
| `mousemove` global | **NONE** — zero ocorrências |
| Nenhum blur/parallax/partícula full-screen | **NONE** — §17 já proíbe isso e o código respeita hoje |

Nenhum componente atual usa 3D tilt, parallax ou partículas — não há
o que "degradar em hardware modesto" além do próprio blur composto já
listado. **Touch**: única superfície hover-only real (`.card-actions`)
já tem fallback correto para touch (`@media(hover:hover)` + força
visível em mobile) — o problema ali é foco de teclado, não touch.

## 23. Touch

Coberto em §17/§22 — `.card-actions` é o único padrão hover-revelado e
já tem fallback de touch correto. Nenhuma outra superfície depende de
hover para revelar uma ação.

## 24. Accessibility (motion)

- **Vestibular/flashing/auto-movement**: nenhuma animação contínua
  infinita encontrada além de spinners de loading (que são esperados e
  já cobertos por reduced-motion). Nenhum efeito "sempre em movimento"
  tipo marquee/parallax existe hoje.
- **Focus obscured**: o gap real é o inverso — `.card-actions` fica
  focável mas invisível (§17), não o contrário.
- **Animation blocking interaction**: não encontrado — todas as
  transições são cosméticas (opacity/transform), nenhuma bloqueia
  clique/scroll durante a animação.

## 25. Candidatos React Bits

Dado que **nenhum componente React Bits está instalado ou copiado**, e
que os gaps reais encontrados (menus de status sem transição, dois
sistemas de spinner/skeleton não unificados, `:active` quase ausente,
foco invisível em `.card-actions`, scroll suave não neutralizado) são
todos **resolvíveis com CSS/tokens que já existem**, não há um caso de
negócio real para nenhum componente "vitrine" do React Bits nesta
consolidação:

| Candidato | Target | Benefício real | Custo | Fundação atual | Recomendação |
|---|---|---|---|---|---|
| Spotlight/Glow Card | cards de mídia | Nenhum — já existe hover/lift funcional | pacote novo + risco de contrariar §17 (glow) | `.mc-media-card-image` já cobre | **NO** |
| Animated gradient text | títulos/hero | Nenhum — contraria "minimalista, sem AI template" (§29) | pacote/CSS novo | tokens de cor já definem 1 gradiente por tela | **NO** |
| Marquee | nenhuma superfície identificada que precise | Nenhum | manutenção de loop contínuo, risco a11y (§36 já lista como deferível) | nenhuma | **NO** |
| Tilt 3D | pôsteres | Nenhum problema real resolvido | perf em mobile, contraria §22 | hover simples já funciona | **NO** |
| Particles/background animado | nenhuma | Nenhum | perf + contraria identidade minimalista | nenhuma | **NO** |
| Skeleton/shimmer unificado (**não é React Bits** — é consolidar o que já existe) | loading em geral | Resolve a fragmentação real de 6 implementações | baixo (é refactor CSS interno) | `.mc-ui-skeleton` já é a base certa | fora do escopo de "React Bits", mas é o G1 MUST real |

**REACT BITS RECOMMENDED = NÃO**, com justificativa: todo gap de motion
encontrado nesta auditoria já tem solução dentro da fundação de tokens
existente. Adotar React Bits agora seria "instalar por instalar" — o
próprio §18 do roadmap já exige que o componente "resolva um problema
real de UX", e nenhum dos gaps reais precisa de uma biblioteca externa
para ser corrigido.

## 26-28. Política de adoção / copy vs. pacote / licenciamento

Não aplicável nesta rodada — nenhuma adoção está sendo proposta (§25).
Caso uma decisão de produto futura (fora desta consolidação) decida
adotar algo específico do React Bits, o modelo de integração real da
biblioteca (code-copy via CLI/shadcn-style, não um pacote npm
tradicional) precisa ser confirmado no site oficial na hora — não
verificável aqui sem acesso à documentação externa, e não inventado.
Licenciamento: mesma ressalva, verificar na hora da decisão real, não
presumido aqui.

## 29. Linguagem de design

Nenhuma superfície encontrada destoa da linguagem minimalista
(nenhum glow, gradiente múltiplo, ou efeito "AI template" identificado
— §17 já é respeitado hoje). O risco de destoar está no FUTURO (se G1
decidir adicionar algo sem necessidade), não no estado atual.

## 30. Dark / Light / OLED (estático)

Não testado em runtime (fica para G1). Verificação estática: os
tokens de motion (`--mc-duration-*`/`--mc-ease-*`) não têm valores
por tema — são globais, então motion em si não deveria variar entre
temas. Sombras/gradientes/overlays (`backdrop-filter`, `blur`) usam
`color-mix`/variáveis de cor que já respondem a `data-theme`
(confirmado no padrão usado em `.mc-preview-close:hover{background:
color-mix(in srgb,black 60%,transparent)}` — mistura relativa, não cor
fixa). Não identificado nenhum efeito hardcoded para um tema só.

## 31. Duplicações (catalogadas, não corrigidas)

1. Bloco `@media (prefers-reduced-motion: reduce)` idêntico 2x em
   `app/globals.css` (~11402-11411 e ~11541-11550).
2. `.media-carousel-arrow` definido em 2 blocos separados em
   `globals.css`.
3. Reduced-motion reescrito individualmente em `overlays.css`
   (dialog+popover) e 2x em `title.css` (poster hover, tabs) — 3
   repetições da mesma regra em vez de uma herança única.
4. Dois sistemas de spinner (`.spin` legado x `.mc-spinner` novo) e
   pelo menos 6 implementações de skeleton/shimmer independentes (ver
   §19).

## 32. Código morto de motion

Nenhum keyframe ou classe confirmadamente sem uso foi encontrado nesta
auditoria (os 12 `@keyframes` catalogados em §4/§19 têm pelo menos um
consumidor confirmado cada). `.mc-spinner`/`mc-spin` (novo) é o caso
mais próximo de "não usado ainda" — existe mas nenhum dos 34 call-sites
de `Loader2 className="spin"` foi migrado para ele; não é código morto
no sentido de "zero referência", é uma primitive nova ainda não
adotada. Não remover nesta fase (instrução explícita).

## 33. Gaps de produto (classificação por superfície)

| Superfície | Classificação |
|---|---|
| Dialog/Popover (motion, foco, reduced-motion) | **ALREADY GOOD** |
| Hover de card/poster/tab na camada nova | **ALREADY GOOD** |
| `.card-actions` (foco invisível) | **MISSING FEEDBACK** |
| Menus de status (sem transição) | **MISSING FEEDBACK** (inconsistente com `.account-dropdown`) |
| `:active`/press feedback em geral | **MISSING FEEDBACK** |
| Sistemas de skeleton/spinner (6+ implementações) | **INCONSISTENT** |
| Durações/easings hardcoded na camada legada | **INCONSISTENT** |
| `scrollBy smooth` sem guarda de reduced-motion | **PERFORMANCE/A11Y RISK** (pequeno) |
| Glow/blur/gradiente | **ALREADY GOOD** (dentro das regras do §17, nada excessivo encontrado) |
| Qualquer efeito "vitrine"/partícula/parallax | **N/A** — nenhum existe, não há over-animation para corrigir |

Nenhuma superfície foi classificada como **OVER-ANIMATED** — o problema
do app hoje é fragmentação/inconsistência e alguns gaps de feedback,
não excesso de efeito.

## 34. Proposta G1 — Motion & Interaction Consolidation

### MUST

- Adicionar `.card:focus-within .card-actions` (e equivalentes onde o
  mesmo padrão se repetir) para eliminar o único gap real de foco
  invisível encontrado.
- Adicionar transição de abertura/fechamento consistente nos menus de
  status (`library-card-status-menu`, `discover-library-status-menu`,
  `fy-status-menu`, `collection-status-menu`, `pick-status-menu`),
  reaproveitando o mesmo padrão já usado por `.account-dropdown`
  (`accountMenuIn`) ou pelos tokens de `overlays.css`.
- Adicionar `:active` consistente aos botões reais do app (`.btn`,
  `.card-action`, `.title-main-btn`) usando o mesmo padrão já definido
  em `.mc-btn:active`/`.mc-surface--interactive:active`.
- Corrigir o gap de reduced-motion do `scrollBy({behavior:"smooth"})`
  em `CarouselRail.tsx` — checar `prefers-reduced-motion`/
  `data-motion="reduced"` em JS antes de escolher `behavior`.
- Dar ao `.mc-skeleton` legado um override de reduced-motion próprio
  (trocar para cor sólida, como o `.mc-ui-skeleton` novo já faz) em vez
  de só herdar o congelamento genérico.
- Remover a duplicação exata do bloco `@media (prefers-reduced-motion:
  reduce)` em `globals.css` (2 blocos idênticos → 1).

### SHOULD

- Unificar os 2 sistemas de spinner (`.spin` legado, usado em 34
  arquivos, vs. `.mc-spinner` novo) — migração gradual para o token
  novo, não uma trocas em massa nesta fase.
- Consolidar as 6 implementações de skeleton/shimmer independentes
  (Home ×2, For You, Pick for Me, `.mc-skeleton` legado) na base
  `.mc-ui-skeleton` já existente, quando o custo de migração de cada
  página for baixo.
- Migrar as durações/easings hardcoded da camada legada
  (`app/globals.css`, 70 declarações) para os tokens `--mc-duration-*`/
  `--mc-ease-*`, começando pelas superfícies mais visíveis (cards,
  botões primários).
- Consolidar a regra de reduced-motion reescrita em `overlays.css`/
  `title.css` (3 repetições) num único utilitário compartilhado.

### DEFER

- Qualquer componente React Bits — nenhum candidato passou no critério
  "resolve um problema real" (§25).
- Page transitions globais (framer-motion ou `template.tsx`) — custo
  (remount completo por navegação, ou dependência nova) sem benefício
  de produto demonstrado.
- Scroll reveal — nenhuma evidência de necessidade no roadmap ou no
  código.
- Particles, cursor followers, parallax global, animated backgrounds,
  3D tilt, marquees contínuos, shaders pesados — nenhum tem
  justificativa de produto encontrada nesta auditoria.

## 35. Princípio do MUST

Todos os itens MUST acima priorizam consistência, feedback de
interação, reduced-motion e performance — nenhum "enche o site de
efeito"; todos corrigem um gap real e documentado nesta auditoria.

## 36. Candidatos a DEFER (confirmados, não presumidos)

Particles, cursor followers, parallax global, animated backgrounds, 3D
cards, marquees contínuos, efeitos de texto full-page, shaders pesados
— nenhum desses conceitos tem qualquer presença hoje no código (todos
com 0 ocorrências nas buscas desta auditoria) nem justificativa no
roadmap. Ficam de fora por ausência de caso de uso, não por serem
"chamativos demais" arbitrariamente.

## 37. Decisões de Produto Necessárias

1. **React Bits**: confirmar a decisão desta auditoria de NÃO adotar
   nada agora (§25), ou há algum uso de produto específico em mente
   que não apareceu no roadmap nem no código?
2. **Menus de status sem transição**: aceitável dar a eles a mesma
   animação do `.account-dropdown`, ou é preferível um comportamento
   diferente (ex.: instantâneo é intencional para menus de ação rápida)?
3. **Migração de durações legadas para tokens**: fazer em uma
   passada ampla dentro do G1, ou só nas superfícies tocadas por outros
   MUSTs (mais conservador, menor risco de regressão visual)?
4. **Unificação de spinners/skeletons**: migrar todos os 34 call-sites
   de `.spin` para `.mc-spinner` nesta fase, ou só padronizar os NOVOS
   call-sites e deixar os existentes como estão (menor risco)?
5. **Page transitions**: confirmar definitivamente que ficam de fora
   desta consolidação (nenhuma evidência de necessidade), ou existe um
   requisito de produto não documentado que justificaria o custo?

## Audit closeout

- `PRODUCT CODE DIFF = 0`.
- Nenhum pacote instalado, nenhum CSS alterado, nenhuma migration,
  nenhum commit/push nesta auditoria.
- Inspeção de banco: nenhuma (fase não toca dados).
