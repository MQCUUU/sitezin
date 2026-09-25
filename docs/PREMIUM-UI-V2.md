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
