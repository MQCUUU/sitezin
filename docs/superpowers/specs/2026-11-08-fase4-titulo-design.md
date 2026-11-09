# Fase 4 — identidade global + página do Título

Data: 2026-11-08 · Direção aprovada: "Tela 2.39:1" (protótipo https://claude.ai/artifact/BsH8Eq6MiJguZexFd3P82q)

## Decisões do usuário

- **Identidade global agora** (não só no Título): fonte e cores trocadas nos tokens.
- **Cor de destaque só nos detalhes**: indicador da navegação, links, foco, aba ativa. Ação principal clara. Rótulos em caixa alta saem página a página.
- **Abas mantidas** no Título (Visão geral, Elenco e equipe, Avaliações e resenhas, Relacionados e mídia).
- Demais decisões delegadas ("decide aí").

## Identidade (global)

- Fonte única: Schibsted Grotesk via `next/font` (`--font-sans`).
- Escuro: fundo `#1e1e20`, superfícies `#26262a`/`#2c2c30`, texto `#eceae6`, secundário `#a6a39d`, linha `#2e2e32`.
- OLED: fundo `#000`. Claro: fundo `#f4f3f0`, texto `#1e1e20`, ação principal quase preta.
- `.btn.primary` / `.mc-btn--primary` usam `--mc-color-primary*` (claro), não o destaque.
- Superfície de hover neutra (antes misturava o destaque).
- `readableAccent` também clareia em fundo escuro: destaque ≥ 4,5:1 sobre `#2c2c30` (roxo padrão → `#a27df8`).
- Botões cedem ao toque: `scale(.97)`, 120ms, `--mc-ease-out`; sem transform em movimento reduzido.

## Topo do Título

- `TitleBand`: faixa preta de ponta a ponta; tela 2.39:1 limitada a 48vh (bordas pretas laterais). Abre como cortina (`clip-path`, 420ms, CSS) quando a imagem carrega; movimento reduzido = fade.
- Cabeçalho: pôster 168px, título 72px/800, ficha em frases (sem "·"), frase de efeito.
- Ação principal única: `TitleStatusMenu` (status atual; fora da biblioteca "Adicionar à biblioteca"; "Remover" no fim, com a confirmação de sempre). Menu ancorado (Motion, Popover) com setas/Home/End/Escape; no celular, folha inferior.
- Discretas: Curtir (pulso do coração ao curtir), Adicionar a uma lista (logado), Assistir agora (só Modo Sem Censura), Onde assistir.
- "Sua nota": número grande + escala 1–10 (`radiogroup`), só com o título na biblioteca. Resenha completa segue na aba Avaliações.
- Celular: barra fixa (status, curtir, listas) acima da navegação inferior; página ganha espaço no fim.
- Caixa "Minha coleção / Status" saiu da aba Visão geral; `addToLibrary` removido do TitleView (adicionar usa o mesmo caminho do status).

## Verificação

- Contraste medido nos três temas (texto ≥ 5,4:1; destaque ≥ 4,5:1).
- Navegador logado 1440/390/320, teclado no menu e na nota, persistência após recarregar, movimento reduzido.
- E2E dos fluxos de status/Curtir atualizados para o menu (`tests/helpers.ts`: `chooseTitleStatus`, `expectTitleStatus`).

## Fica para depois

- CSS antigo do hero em `styles/features/title-detail.css` (classes `title-hero*` sem uso) — limpar ao dividir o arquivo.
- Próximas páginas da Fase 4: Início → Para você → Biblioteca → Diário → Calendário → Insights → IA → Configurações.
