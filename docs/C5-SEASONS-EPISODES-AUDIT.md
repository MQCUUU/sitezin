# C5.0 — Auditoria de Seasons / Episodes

**Data:** 2026-09-27  
**Escopo:** auditoria read-only de produto e arquitetura. Nenhum código de
produto, banco, rota ou comportamento foi alterado. C4.5 está commitada em
`6dc0350 chore(title): close cast and crew phase`; o checkpoint inicial
estava limpo.

## 1. Executive Summary

C5 não parte do zero. A página de título TV já mostra resumo da série,
agenda/próximos episódios, seletor de temporada, lista de episódios,
detalhe de episódio por URL e registro de assistido/diário por episódio.
Há endpoint TMDB dedicado para detalhes de temporada (`seasonTMDB` e
`/api/tv/[id]/season/[season]`) e API autenticada para estado do usuário
(`/api/episodes`). O banco tem `episodes_progress`.

O trabalho futuro é uma consolidação/hardening de contratos e UX existente,
não a criação inicial desses recursos. O sanitizer de detalhes da Title
não normaliza temporadas nem episódios: retira alguns campos específicos,
mas espalha o restante do objeto TMDB. O endpoint de season também devolve
payload cru sem tipo/sanitizer interno dedicado. As interfaces já usam
`any` em vários pontos.

Não há suporte completo a Season 0 na navegação visível (o seletor mostra
1..number_of_seasons), embora endpoints aceitem season 0. O browser de
episódios não distingue erro de lista vazia depois do fetch, nem exibe uma
mensagem vazia explícita. A rota de episódio é deep-link, mas a temporada
selecionada no browser é estado local e não atualiza a URL.

**Recomendação preliminar:** preservar resumo de seasons no detalhe SSR e
buscar episódios da temporada selecionada sob demanda pela rota que já
existe; formalizar contratos e estados de erro/vazio antes de adicionar
qualquer fetch à Title SSR. Não carregar a lista completa de episódios de
todas as temporadas no primeiro render.

### Prioridades consolidadas

| Classe | Achados |
|---|---|
| BLOCKER | Nenhum identificado para iniciar decisões de produto. |
| HIGH | Nenhum confirmado; a estratégia atual já evita carregar todos os episódios no SSR. |
| MEDIUM | Contratos de season/episode não tipados; erro/vazio indistinguíveis no EpisodeBrowser; política de specials não uniforme; estado local e deep-link não sincronizados; verificar compatibilidade da coluna `stopped_episode` citada por um endpoint mas ausente do schema versionado auditado. |
| LOW | Dados ausentes têm fallbacks inconsistentes; critério de “episódio lançado” trata data ausente como lançado; integração Schedule/Browser separada; limites/nomes de temporadas não derivados diretamente do array de summaries. |
| POLISH | Datas/runtime/notas usam formatação local repetida; imagem still usa `<img>` cru; layout/responsividade e acessibilidade merecem QA dedicado. |
| PRODUCT DECISION | Season 0, temporada inicial, persistência da seleção, lista vs grid, spoilers, episódios futuros, deep-link de temporada, e se progresso episódio-a-episódio permanece no escopo C5. |

## 2. Current Architecture

```text
TMDB /tv/{id}?language=...&append_to_response=credits,videos,images
  ├─ getTitleDetails (lib/title-details.ts)
  │    └─ sanitizeTitleDetails ─ SSR page ─ TitleView
  │         ├─ TitleOverviewSection / SeasonProgress
  │         └─ TitleTvSections
  │              ├─ SeriesSchedule ─ /api/tv/{id}/schedule
  │              └─ EpisodeBrowser ─ /api/tv/{id}/season/{season}
  │                                 └─ /api/episodes (se autenticado)
  └─ GET /api/tmdb/{type}/{id} (resposta espelho do detalhe sanitizado)

Season details: seasonTMDB ─ GET /api/tv/{id}/season/{season}
Episode detail URL: /title/tv/{id}/season/{season}/episode/{episode}
  ├─ busca season details, title details e item da biblioteca
  └─ GET/POST /api/episodes para diário/progresso autenticado
```

Detalhes de título são obtidos no Server Component e passados como
`initialDetails`; `TitleView` só faz novo fetch de detalhe se o SSR falhar.
Dados da biblioteca são client-side. A página de episódio é client-side e
busca seus dados depois de montar. Schedule é outro endpoint, que carrega
detalhes TV e pode requisitar seasons relevantes para próximos episódios.

## 3. Existing TV Data

### Fetch e raw fields

`detailsTMDB("tv", id)` solicita `/tv/{id}?language=${TMDB_LANGUAGE ||
"pt-BR"}&append_to_response=credits,videos,images`. O repositório não
contém fixture de resposta TMDB nem foi feita chamada externa nesta
auditoria; portanto “available” abaixo significa campo do recurso de
detalhes pedido e acessado/repasseado pelo código, não garantia de valor
não-nulo para toda série.

| Campo solicitado/consumido | Raw details atual | Sanitização/Title |
|---|---|---|
| `id`, `name`, `original_name`, `first_air_date`, `last_air_date`, `status`, `type` | Detalhe `/tv/{id}` | Sobrevivem por `...safeDetails`; acessos diretos na UI variam. |
| `number_of_seasons`, `number_of_episodes` | Detalhe `/tv/{id}` | Sobrevivem sem normalização; contagens usadas na Overview, SeasonProgress e biblioteca. |
| `episode_run_time` | Detalhe `/tv/{id}` | Sobrevive cru, mas a Overview usa `details.runtime`, não esse array. |
| `seasons` | Resumo de temporadas do detalhe | Sobrevive cru; há código que lê season number/name/overview/air_date; o seletor do EpisodeBrowser não usa esse array. |
| `last_episode_to_air`, `next_episode_to_air` | Detalhe `/tv/{id}` | Sobrevivem crus e são lidos pelo schedule/calendário/sync; TitleOverview não os apresenta diretamente. |
| `created_by` | Detalhe `/tv/{id}` | Recompactado para no máximo 10 pessoas; o tipo de saída reaproveita shape compacto de pessoa. |
| `networks`, `production_companies` | Detalhe `/tv/{id}` | Sobrevivem por spread; produtoras usadas na seção Cast/Crew, networks não têm uso central identificado na Title TV. |
| `credits` | `append_to_response=credits` | Cast e crew recompactados; crew limitada a cargos editoriais C4. Networks/other credit details não são um contrato season/episode. |
| `videos` | `append_to_response=videos` | Sobrevive pelo spread. |
| `images` | `append_to_response=images` | Explicitamente removido por `sanitizeTitleDetails`; não chega à Title. |
| `watch providers` | Request separada `/tv/{id}/watch/providers` | Campo `watch_providers` separado, raw, sem efeito de região sobre endpoint de seasons/episodes. |

`RAW TV FIELDS AVAILABLE` (solicitados/preservados quando retornados):
`id`, `name`, `original_name`, `first_air_date`, `last_air_date`, `status`,
`type`, `number_of_seasons`, `number_of_episodes`, `episode_run_time`,
`seasons`, `last_episode_to_air`, `next_episode_to_air`, `created_by`,
`networks`, `production_companies`, `credits` (projetado), `videos`, e
`watch_providers` (request paralela). `images` é pedido, mas descartado.

### Sanitized TV fields

`sanitizeTitleDetails(value: unknown)` remove `budget`, `revenue`,
`aggregate_credits`, `images`, `credits` e `created_by` do spread e então
recria `credits`/`created_by` compactos. O restante segue como
`Record<string, unknown>` sem normalização campo a campo. Em consequência:

- `seasons`, `episode_run_time`, `last_episode_to_air` e
  `next_episode_to_air` sobrevivem ao spread;
- episódios só aparecem em campos aninhados (`last/next_episode_to_air`)
  ou em respostas de season; não há `EpisodeSummary`/`SeasonDetails` interno;
- `last_episode_to_air` e `next_episode_to_air` não são validados nem
  compactados pela fronteira da Title;
- SSR e `/api/tmdb/[type]/[id]` compartilham a mesma sanitização.

`SEASON SUMMARY AVAILABLE = SIM`, dentro do detalhe raw repassado. `SEASON
SUMMARY FIELDS` usados/confirmados pelo código: `season_number`, `air_date`,
`name` e `overview` (por `findNextSeason`/schedule). O detalhe também é
consumido como coleção `seasons`. `id`, `poster_path`, `episode_count` e
`vote_average` não foram confirmados como consumidos/normalizados nesta
fronteira; o payload não tem tipo que assegure esse conjunto. Não alegar
que todos existem em cada elemento sem fixture/payload de série real.

## 4. Season Data Available

O endpoint `seasonTMDB(tvId, seasonNumber)` busca
`/tv/{tvId}/season/{seasonNumber}?language=...` com cache de seis horas.
`/api/tv/[id]/season/[season]` retorna o JSON raw da resposta, sem
sanitizer, schema validation ou tipo interno. A UI consome `episodes[]`;
resumos de season vêm do detalhe da série.

`SEASON DETAILS FETCH EXISTS = SIM`  
`EPISODE LIST SOURCE EXISTS = SIM` — `episodes[]` da resposta de season.

Campos de episode efetivamente lidos em diversos consumers: `id`,
`name`, `overview`, `episode_number`, `season_number`, `air_date`,
`runtime`, `still_path`, `vote_average`; o schedule também reduz esses
campos e pode ler valores de `next_episode_to_air`. `vote_count` não foi
localizado como dependência dos cards/detalhe examinados. `crew` é lido na
página detalhe se vier, sem tipo compartilhado.

| Campo para UI mínima | Fonte/status no repositório |
|---|---|
| `id` | Season details raw; consumido como key/metadata. |
| `name`, `overview` | Season episode raw; usados com fallback textual. |
| `episode_number`, `season_number` | Season details raw; usados para navegação/progresso. |
| `air_date` | Season details raw; usada para exibição e regra local de lançamento. |
| `runtime` | Season details raw; renderizado em minutos quando truthy. |
| `still_path` | Season details raw; imagem wide opcional, fallback difere por tela. |
| `vote_average` | Season details raw; detalhe de episódio usa `toFixed(1)`. |
| `vote_count` | Não usado pela UI auditada; disponibilidade não formalizada no contrato. |

Isso é evidência de uso no código, não fixture que garanta a presença de
cada propriedade em todos os episódios.

## 5. Episode Data Available

Não existe tipo interno comum para season/episode. `EpisodeBrowser` e a
página nested mantêm `any`; `SeriesSchedule` declara um tipo local parcial;
`/api/tv/[id]/schedule` cria sua própria projeção de episódio (até 14 itens).
O sanitizer da Title não normaliza `episodes[]`.

`STILL IMAGE SUPPORT = SIM`: `still_path` é renderizado por `<img>` usando
`img(path, "w300"/"w780")`. O helper `lib/tmdb.ts:img` monta
`https://image.tmdb.org/t/p/{size}{path}` e retorna `/placeholder.svg` sem
path. O poster foundation é `components/Poster.tsx` (`next/image`, `fill`,
sizes e fallback SVG), mas os stills atuais não o usam. EpisodeBrowser
mostra `E{episode_number}` se faltar still; o detalhe mostra uma área vazia.
Still 16:9 é proporção diferente de poster 2:3: reutilizar o helper de URL
é natural; reutilizar o componente visual requer preservar o container wide.

## 6. Existing Routes/APIs

| Rota | Papel |
|---|---|
| `/title/[type]/[id]` | Title movie/TV; inclui seções TV na aba Info. |
| `/title/tv/[id]/season/[season]/episode/[episode]` | Deep-link e tela de detalhe/diário do episódio. Não foi encontrada tela season-only. |
| `GET /api/tmdb/[type]/[id]` | API genérica de detalhes title + providers; não aceita season number nem serve season details. |
| `GET /api/tv/[id]/season/[season]` | Proxy dedicado de season details/episodes; valida ID numérico e season inteiro `>= 0`. |
| `GET /api/tv/[id]/schedule` | Agrega próximo episódio/próxima temporada e até 14 upcoming episodes. |
| `GET/POST/PUT /api/episodes` | Leitura/gravação do progresso/journal autenticado. |
| `/person/[id]` e `/api/person/[id]/credits` | Rotas de pessoa/créditos, não episode detail. |

Há proxy TMDB reutilizável central em `lib/tmdb.ts` (`tmdb`, `detailsTMDB`,
`seasonTMDB`), com exceções de fetch direto: providers em
`lib/title-details.ts`/API mirror e schedule em sua route handler.
Autenticação da maioria das requests TMDB é centralizada no helper por
`TMDB_API_KEY` em query string; exceções de fetch direto também montam a
chamada no server. Não foi encontrado rate limiter próprio para o TMDB.
Cache fetch/Next existe; não equivale a rate limit.

## 7. Existing UI

### Title TV hoje

- Hero e conteúdo Title comuns, com nome/imagem/data/status/actions.
- Overview: sinopse (`Sem sinopse disponível.`), gêneros, data de estreia,
  runtime apenas quando `details.runtime` existe, contagem de temporadas e
  episódios (TV). Não foi localizada renderização de
  `episode_run_time` na Overview.
- Sidebar: status de coleção e `SeasonProgress` quando a série já está na
  biblioteca; resumo de episódios vistos/lançados por temporada e progresso
  derivado de `episodes_progress`.
- Bloco exclusivo TV na aba Info: `SeriesSchedule` (agenda, próxima exibição
  e próximos episódios) e `EpisodeBrowser` (dropdown de temporadas, lista,
  marcação assistido/completar temporada).
- Episode detail: still/título/data/runtime/nota/sinopse/crew opcional;
  aba de diário com data assistida, reassistida, comentário e ações de
  marcar/desmarcar, condicionadas à série estar na biblioteca.
- Providers e trailer; estatísticas/recomendações da Title seguem suas
  próprias seções. C4 mantém elenco/criadores na aba Cast.
- `status` TV chega cru de TMDB; não há mapeamento localizado nesta tela
  para traduzir `Returning Series`, `Ended`, `Canceled` etc.

### Season / episode interaction & states

`SEASON UI EXISTS = SIM`: `EpisodeBrowser` tem `<select>`, gera opções de
1 a `totalSeasons`, inicia na `current_season` da biblioteca ou 1; não
consome `details.seasons` para compor opções.

`EPISODE UI EXISTS = SIM`: lista em `EpisodeBrowser`; página nested de
detalhe/diário. Não foram encontrados modal/drawer/grid de episódio.

Loading/error/empty atuais:

- EpisodeBrowser tem spinner textual durante fetch. Depois disso, erro HTTP
  é interpretado como `episodes=[]`; erro de rede apenas desliga loading.
  Não há estado de erro nem estado vazio explícito para a lista.
- Página de episódio mostra loading e “Episódio não encontrado”; falha de
  fetch cai no mesmo estado que item inexistente. `saving` desabilita parte
  das ações; não há mensagem dedicada de erro ao salvar em todos os caminhos.
- SeasonProgress tem `saving` e erro inline para PATCH da biblioteca.
- SeriesSchedule tem loading/error/empty próprios. A Title geral tem
  loading/error/missing states próprios, mas esses estados não substituem
  status para cada fetch lazy.
- Shared building blocks disponíveis: `.panel`, `.empty`, `.btn`, `Button`,
  `Badge`, `Skeleton`, `Spinner`, Tabs da Title e ícones. O reuso real mais
  direto para lista é painel/button/spinner; não há componente season/episode
  genérico identificado.

## 8. Existing User / DB State

`EPISODE USER STATE EXISTS = SIM`. `app/api/episodes` exige sessão via
`auth.getSession()`, valida que `library_id` pertence ao usuário e grava em
`public.episodes_progress`. A chave única é user + media + season + episode;
registra `watched`, `watched_at`, `comment` (limite 4000) e `is_rewatch`.
O fluxo está relacionado à biblioteca; episódio não existe como registro
de catálogo próprio.

`EPISODE DB MODEL EXISTS = SIM` — `episodes_progress` no
`supabase/schema.sql`. `library_items` também mantém agregados
title/series-level: `current_season`, `completed_seasons`, `stopped_season`,
status e `rewatch_count`. `media` guarda `seasons_count`/`episodes_count`.
O progresso detalhado permanece na tabela de episódios.

`WATCH PROGRESS EXISTS = SIM`, scope episode-level mais agregados por
temporada/título. POST pode cascatar episódios anteriores como assistidos;
PUT marca um conjunto de episódios. Os totais de biblioteca são
sincronizados quando o cliente envia `released_episode_count`/`total_seasons`.
Há helpers para completar/resetar/restaurar série; operações completas podem
buscar todas as temporadas sequencialmente/concorrentemente conforme helper.

Favorites, watchlist/want e ratings/reviews são title-level por
`library_items`/reviews. Não foi encontrado rating pessoal por episódio;
`vote_average` da TMDB é informativo, não avaliação pessoal. Episódio tem
diário/comentário e marcador reassistido, que é diferente de rating.

**Compatibilidade a confirmar:** `app/api/library/sync-seasons/route.ts`
emite SQL que atualiza `stopped_episode`; a busca no schema versionado
`supabase/schema.sql` não encontrou essa coluna (somente `stopped_season`).
Não foi alterado nem consultado banco remoto; pode existir DDL operacional
fora desse schema. Confirmar antes de mexer no fluxo relacionado.

## 9. Reusable Foundations

- Request: `lib/tmdb.ts` monta base URL, query key, language, header JSON,
  timeout padrão 12s, uma tentativa extra para HTTP 429/500/502/503/504,
  `Retry-After` ou backoff curto, Next `revalidate` e tags; mantém dedupe
  in-flight por path+revalidate. Falhas/non-JSON lançam erro.
- Cache: details default 24h; season 6h; calendario 6h; providers no helper
  24h. Title watch providers bypassa helper e configura `next.revalidate`
  de 6h. Season route acrescenta `Cache-Control: public, max-age=300,
  s-maxage=21600, stale-while-revalidate=86400`; schedule usa fetch
  revalidate 6h e response `s-maxage=3600, stale-while-revalidate=21600`.
  `/api/episodes` GET é chamado com `cache: no-store` no client e consulta
  estado autenticado no banco.
- Idioma: `TMDB_LANGUAGE || "pt-BR"` nas funções centralizadas; schedule
  também usa a configuração/env com fallback `pt-BR`. Pode mudar nome,
  overview e outros textos fornecidos pelo TMDB; não mudar nesta fase.
- Região: Title watch providers consulta disponibilidade semântica BR no
  consumidor; season details não adicionam `region`. Não há razão observada
  para tornar seasons/episodes region-specific.
- Imagens: `img()` monta URL; `Poster` usa `next/image` e placeholder local.
  Stills usam `<img>` diretos hoje. Skeleton/Spinner/panel/buttons/tabs/
  empty visual são fundações reais para estados/lista.
- Formatting: Schedule usa `Intl.DateTimeFormat("pt-BR")` local; episódio
  apresenta data raw (`air_date`) sem formatter. Overview formata manualmente
  data e runtime; runtime de episódio imprime minutos e nota com `toFixed(1)`.
  `TitleStatsSection` usa `toLocaleString("pt-BR")` para contagens. Há
  formatação de datas reutilizável em páginas, mas nenhum helper global de
  temporada/episódio identificado. Futuro código deve evitar duplicar outra
  variante sem decidir um helper compartilhado.
- Overview vazio tem fallback; EpisodeBrowser e episode detail repetem
  “Sinopse indisponível.”; ausência de still tem fallback apenas no browser.

## 10. Missing Foundations / Gaps

- Nenhum contrato `SeasonSummary`, `SeasonDetails` ou `EpisodeSummary`
  compartilhado; decisões/types estão espalhados em `any` ou tipos locais.
- Fronteira RAW → `unknown` → sanitizer/normalizer para season details não
  existe. O endpoint serve JSON TMDB sem projeção e consumers assumem shape.
- EpisodeBrowser não verifica `response.ok`, não distingue falha de payload
  vazio e não mostra estado “nenhum episódio”. Se GET progress falhar, não
  há estado visual separado para progresso indisponível.
- URL da temporada não acompanha seleção local; link de episódio tem IDs
  numéricos no path e permite deep-link direto, mas a rota não foi localizada
  usando validação/normalização robusta antes do fetch.
- Seletor deriva quantidade `1..number_of_seasons`, não o array real
  `seasons`; não representa Season 0 nem necessariamente temporadas com
  gaps/ordinais especiais.
- Conteúdo futuro/com data ausente ainda carece de política única: algumas
  telas filtram datas, EpisodeBrowser e details usam regra `!air_date ||
  date <= now`, tratando data desconhecida como lançada.
- Ainda há composição paralela entre Schedule e Browser; pode repetir
  details/season fetch em caminhos próximos. O cache do helper mitiga URL
  igual; schedule tem implementação direta própria.
- `episode_run_time` (array TV) não alimenta runtime de episódio no resumo
  Title, e não foi encontrado helper runtime comum usado por episódio.
- Não há confirmação, nesta auditoria, de suite automatizada dedicada para
  Season/Episode (nenhum teste relacionado foi localizado na busca do repo).

## 11. Edge Cases

- **Season 0 / Specials:** nenhuma política de produto uniforme. O endpoint
  season e API progress aceitam número zero; o seletor limita-se a 1..N e
  helpers de completar todas as temporadas percorrem 1..N. `SPECIALS POLICY
  EXISTS = NÃO`. Season 0 requer decisão, não inclusão silenciosa.
- **Season vazia / episode_count 0:** não há mensagem explícita no
  EpisodeBrowser; pode aparecer painel sem linhas.
- **Sem poster/still:** summary poster não participa do seletor atual;
  EpisodeBrowser usa placeholder textual; detalhe episode deixa bloco de
  imagem vazio.
- **Sem air_date:** mostra “Sem data”, mas o filtro de “released” em
  EpisodeBrowser considera sem data como released; confirmar semântica.
- **Overview vazio:** fallback textual já existe.
- **Temporada futura:** dropdown permite selecionar qualquer número <= total
  seasons; data futura individual não impede marcação manual, e regra de
  released inclui apenas datas até hoje (ou data ausente).
- **Long-running (10+/20+/30+):** dropdown gera opções numéricas; lista só
  busca uma temporada selecionada. Não há carga inicial SSR de todas as
  listas, o que limita payload inicial; completar/cascatear pode disparar
  muitas chamadas/linhas.
- **Anime/names localizados:** código usa número, não inferência de gênero;
  names e overview vêm da língua TMDB configurada. `number_of_seasons` não
  garante que seasons sejam rótulos consecutivos úteis ao usuário.
- **Future episode/next episode:** `next_episode_to_air` chega cru pelo
  detalhe e schedule consegue mostrar próximo episódio sem fetch de season
  na Title overview. Schedule também busca seasons necessárias para montar
  upcoming, limitado a 14 resultados.

## 12. Risks

### Payload / performance

`ALL-EPISODES SSR PAYLOAD RISK = HIGH`. Séries curtas podem ainda ter
várias dezenas de objetos de episódio; séries longas, anime e séries com
20–30+ temporadas podem alcançar centenas de itens. Enviar tudo no RSC
initial payload custa transferência, parse/hydration e memória, mesmo para
usuário que não abre a lista. Não foi feito benchmark: classe é estrutural,
não medida.

Alternativas futuras:

| Estratégia | Pros | Contras | Cache/UX/complexidade |
|---|---|---|---|
| A — SSR de todas seasons + episodes | Primeira renderização completa; sem fetch ao selecionar. | Payload proporcional ao catálogo; overfetch alto em série longa; custo SSR/API. | Pode aproveitar cache TMDB, mas risco de TTFB/RSC/memória e maior complexidade; não recomendada sem benchmark forte. |
| B — SSR summary + lazy selected-season episodes | SSR mantém contagem/lista de seasons leve; episódio carrega ao selecionar. | Estados loading/error por season e navegação precisam desenho; fetch client adicional. | Compatível com o endpoint/caches atuais e com séries longas; melhor hipótese inicial para validar. |
| C — client-only season summaries + episodes | Menor trabalho SSR/payload; UI encapsula dados TV. | Conteúdo útil aparece mais tarde; duplicaria summary já no SSR; pior SEO/primeiro paint. | Cache do API helper possível; complexidade baixa-média, UX inferior ao resumo SSR existente. |

**RECOMMENDED FETCH STRATEGY:** manter details SSR e não anexar todas as
temporadas completas; reusar summaries do details para opções e lazy-fetch
uma season via endpoint existente. Confirmar se temporada inicial é número
de biblioteca ou escolha de produto e alinhar errors/cache. Essa é
recomendação preliminar apoiada pelo caminho atual, não decisão final.

### Requests, errors e user state

Riscos de request duplication: `getTitleDetails` e fallback client podem
consultar details; EpisodeBrowser solicita season ao abrir/selecionar;
page nested também solicita season e details, schedule monta details + uma
ou duas seasons relevantes, `sync-seasons` pode solicitar details, e
progresso sequencial também busca seasons anteriores. O `inFlight` map e
Next fetch cache reduzem chamadas idênticas no helper, mas schedule/providers
com fetch direto têm caminho próprio. Não se deve buscar `/api/tmdb/tv/{id}`
novamente ao trocar apenas de temporada.

O estado por usuário depende de autenticação + item na biblioteca. Guest
pode navegar e ler seasons/episodes, mas não registrar progresso. Não
expandir favoritos/ratings para episode-level sem decisão de produto.

### Security / configuration

`SECRET CONFIG PRESENT = SIM` — existe `.env.local` no workspace. Seu
conteúdo/valores não foram lidos nem registrados. Requests TMDB são
server-side; tokens não devem ser expostos em payload/log.

## 13. Recommended C5 Roadmap (hipótese para aprovação)

As fases abaixo são proposta baseada apenas no código auditado; não iniciam
implementação nem alteram o roadmap oficial automaticamente. Dependem das
decisões em §14, especialmente Season 0, progress scope, URL e episódio
futuro.

| Subfase | Tipo / objetivo | Domínios prováveis | Dependências / risco | Critério de DONE |
|---|---|---|---|---|
| C5.1 | FOUNDATION — formalizar RAW → internal contracts para `SeasonSummary`, `SeasonDetails`, `EpisodeSummary`; validar shape/fallbacks compartilhados. | `lib/title-*` ou novo módulo season; rota season; title types. | Decidir campos necessários; médio por compatibilidade de múltiplos consumers. | SSR/API/UI usam contratos explícitos e sanitizer testável; campos não suportados são descartados explicitamente. |
| C5.2 | DATA — consolidar ownership/cache/error da chamada de season e schedule, sem duplicar fetch de details; documentar cache e resposta. | `lib/tmdb.ts`, `app/api/tv/[id]/season/[season]`, `app/api/tv/[id]/schedule`. | C5.1; médio por fetch direto legado do schedule. | Chamadas têm validação, erro e cache deliberados; episode list segue lazy e requests redundantes desnecessárias identificadas/removidas. |
| C5.3 | UI — completar seleção/navegação e estados loading/error/empty com summaries reais, sem alterar semântica sem decisão. | `TitleTvSections`, `EpisodeBrowser`, nested episode page, `TitleView`. | Decidir season 0/default/deep link; médio. | Lista representa seasons suportadas; seleção e estados são acessíveis e testados em dados vazios, faltantes e falhas. |
| C5.4 | USER STATE — auditar/reconciliar progresso por episódio/temporada com biblioteca e semântica de release. | `SeasonProgress`, `EpisodeBrowser`, `/api/episodes`, library APIs, `complete-series-progress`, schema. | Decidir se progresso/journal ficam no escopo C5; risco médio-alto por integridade existente. | Regras idempotentes e documentadas; nenhum campo DB presumido; schema/runtime compatibility conferida; fluxos progressivos cobertos por testes. |
| C5.5 | POLISH — stills 16:9, formato de data/notas/runtime, responsividade, teclado/leitor de tela e conteúdo longo. | `SeriesSchedule`, `EpisodeBrowser`, episode page, estilos globais/UI primitives. | C5.3; baixo-médio. | QA em desktop/mobile, dark/light/OLED, imagens ausentes e nomes/overviews longos sem regressão. |
| C5.6 | CLOSEOUT — regressão independente, build/check, docs/roadmap e dívidas. | docs e áreas tocadas. | C5.1–C5.5 conforme aprovadas. | Matriz validada, check/build/diff-check com códigos conhecidos, nenhum processo próprio, C5 status e próxima fase documentados; sem commit/push sem pedido. |

## 14. Open Product Decisions

1. Season 0 / Specials deve aparecer? Se sim, em que posição e como afeta
   contagens/progresso da série?
2. Qual temporada é selecionada por padrão: próxima incompleta da biblioteca,
   primeira temporada, última assistida, ou outra? Guest deve ter padrão
   diferente?
3. A seleção precisa persistir/reabrir por usuário? Se sim, em estado de URL,
   banco ou apenas sessão local?
4. Episódios ficam em lista (como hoje) ou grid? Overview é spoiler; mostrar
   sempre, truncado, sob demanda, ou respeitar preferência?
5. Episódios futuros aparecem no Browser? Podem ser marcados? Como tratar
   episódio sem `air_date` (desconhecido não deveria ser assumido como
   lançado sem aprovação explícita)?
6. Manter “Próximo episódio”/agenda atual em C5 e qual fonte prevalece quando
   `next_episode_to_air` diverge de season details?
7. Deep link só para episódio é suficiente ou temporada também precisa
   endereço/estado compartilhável? A URL atual do episódio permanece?
8. Progresso/journal por episódio existente é parte do escopo Premium C5
   para manutenção ou deve ficar fora de um trabalho de apresentação?
   Episode rating não existe hoje; qualquer adição precisaria decisão
   separada.
9. Exibir nota, runtime, data, vote count, poster da temporada e networks?
   Nenhuma escolha adicional foi presumida nesta auditoria.

## Catalog / search disposition

Busca app-wide feita para `season`, `seasons`, `season_number`, `episode`,
`episodes`, `episode_number`, `number_of_seasons`, `number_of_episodes`,
`episode_run_time`, `last_episode_to_air`, `next_episode_to_air`, `air_date`,
`still_path`, `runtime`, `tv` e variantes PT-BR. Matches relevantes se
concentram em:

- **PRODUCT/UI:** TitleView, TitleOverviewSection, TitleTvSections,
  EpisodeBrowser, SeasonProgress, SeriesSchedule e página nested de episódio.
- **TYPE:** TitleDetails genérico/LooseTitleDetails; tipo local Episode do
  Schedule; dados Episode/Season em `any`; CalendarTMDBItem.
- **API:** season, schedule, episodes, library, calendar, sync-seasons,
  notifications e title details.
- **SERVER/CLIENT DATA:** `lib/tmdb.ts`, `lib/title-details.ts`,
  `lib/complete-series-progress.ts`, Title SSR e consumers acima.
- **STYLE:** regras ativas `.episode-*` em `app/globals.css` e
  `.series-*` usadas por SeriesSchedule. Nenhum seletor season/episode
  órfão confirmado.
- **DOC:** roadmap C5 NEXT na `docs/PREMIUM-UI-V2.md`; esta auditoria é o
  primeiro inventário dedicado. Nenhuma decisão de TV adicional encontrada
  na área relevante além do C4 “TV usa `created_by`; aggregate credits não
  adotado na Title Cast/Crew”.
- **TEST:** nenhum teste específico Season/Episode foi encontrado na busca
  do repositório. Runtime opcional não foi executado nesta auditoria.
- **DEAD/LEGACY:** nenhum código/CSS de season/episode classificado como
  conclusivamente morto; não removido. Há fluxos legados/concomitantes
  (calendar/schedule e progresso/library) mantidos ativos.

## Audit closeout

- `PRODUCT CODE DIFF = 0`.
- Sem endpoint, migration, pacote, alteração de comportamento, commit ou
  push nesta auditoria.
- `OPTIONAL RUNTIME = NOT RUN` (não necessário para C5.0).
- `npm run check = PASS (exit 0)`.
- `npm run build = PASS (exit 0)`. Avisos não bloqueantes observados:
  lockfile fora do repositório e uso de cookies em `/profile` durante
  geração estática, que permaneceu corretamente dinâmica.
- `git diff --check = PASS (exit 0)`.
- `OWN QA PROCESSES = 0`; nenhum script/log/screenshot/fixture temporário
  foi criado ou ficou no workspace.

## C5.1 — Consolidação (DONE)

Cobre contratos tipados, normalização RAW→interno, endpoint de season,
fetch/URL, Specials, estados de loading/erro/vazio, semântica de episódio
futuro/desconhecido e polish básico. **Não** toca integridade de progresso
persistido (`episodes_progress`, `current_season`, `completed_seasons`,
`stopped_season`, cascatas, complete/reset) — isso é C5.2.

### Contrato

`lib/title-seasons.ts` (novo, neutro — sem React/CSS/fetch/DOM):

- `SeasonSummary` — `id, season_number (>=0), name, overview, air_date,
  episode_count, poster_path`.
- `EpisodeSummary` — `id, name, overview, episode_number (>=1),
  season_number (>=0), air_date, runtime, still_path, vote_average, crew`
  (`crew: CrewCredit[]`, reaproveita o tipo da C4 — mesmo conceito,
  granularidade de episódio; só a página de episódio usa esse campo).
- `SeasonDetails` — `id, name, overview, season_number, air_date,
  poster_path, episodes: EpisodeSummary[]`.
- Normalizers puros: `normalizeSeasonSummary(y)`,
  `normalizeSeasonSummaries(raw: unknown)`, `normalizeEpisodeSummary(raw:
  unknown)`, `normalizeSeasonDetails(raw: unknown)`,
  `normalizeEpisodeCrew(raw: unknown)`. Entrada sempre `unknown`; objeto
  inválido → `null`; array → filtra entradas inválidas sem fabricar
  id/season_number/episode_number falso.
- `getEpisodeReleaseStatus(airDate)` → `"released" | "future" |
  "unknown"`, por comparação de data civil (string `YYYY-MM-DD`, sem
  `Date` completo, evitando bug de fuso). **`air_date` ausente/inválida
  nunca é `"released"`** — essa é a decisão de produto da fase.

### Fronteira RAW → interno

`sanitizeTitleDetails` (SSR + `/api/tmdb/[type]/[id]`, compartilhados)
agora normaliza `seasons` → `SeasonSummary[]`, `last_episode_to_air` e
`next_episode_to_air` → `EpisodeSummary | null`, no lugar de espalhar os
três campos crus pelo spread. Comportamento de `movie` intacto (esses
campos nunca existem no payload de filme; os normalizers recebem
`undefined` e devolvem `[]`/`null` de forma defensiva — o único efeito
colateral é que o JSON de filme passa a ter essas três chaves sempre
presentes e vazias, em vez de ausentes; nenhum consumer de filme lê essas
chaves).

`GET /api/tv/[id]/season/[season]` migrou de repassar o JSON cru do TMDB
para devolver `SeasonDetails` normalizado. `seasonTMDB()` continua o único
dono da chamada TMDB (cache ~6h e headers de `Cache-Control`
preservados). Falha HTTP/rede do TMDB e falha de shape num 200 inesperado
caem no mesmo `502` de antes; `episodes: []` dentro de uma resposta 200
válida é o estado "temporada vazia" — os dois nunca se confundem.
Consumers auditados e confirmados compatíveis com o novo shape (só leem
`episodes[]` com os mesmos nomes de campo de antes): `EpisodeBrowser`,
`SeasonProgress` (`completeCurrentSeason`), a página de episódio, e o
widget "Continuar assistindo" da Home (`app/page.tsx`) — nenhum desses
lê campos fora do contrato novo. `/api/episodes` e
`lib/complete-series-progress.ts` chamam `seasonTMDB()` **diretamente**
(não passam pela rota), então não são afetados pela normalização da API.

`SeriesSchedule` **não foi migrado** para o contrato compartilhado: sua
projeção de episódio (`/api/tv/[id]/schedule`) pré-processa fallbacks
diferentes (`name` já vira `"Episódio N"`, `overview` já vira `""`,
`runtime`/`vote_average` zero já colapsam para `null`) — é uma projeção
semanticamente diferente de `EpisodeSummary`, não o mesmo contrato à
força. Tipo local mantido deliberadamente (`KEPT`, não `REMOVED`).

### URL como fonte de verdade

`EpisodeBrowser` não gera mais `1..number_of_seasons` como fonte do
seletor — usa `details.seasons` normalizado (prop `seasons:
SeasonSummary[]`). `totalSeasons` continua sendo passado exatamente como
antes (`Number(details.number_of_seasons || 1)`) só para os cálculos que
já existiam (`total_seasons` enviado a `/api/episodes`) — Season 0 nunca
entra nessa contagem.

A temporada selecionada é derivada de `useSearchParams()` a cada render
(mesmo padrão de `lib/discover/useDiscoverParams.ts` — sem `useState`
espelhado); trocar de temporada faz `router.push` (não `replace`, para
Back/Forward funcionarem como passos de histórico), preservando os
demais parâmetros da URL. Prioridade de resolução: `?season=` válido (e
presente nas temporadas selecionáveis) → temporada atual da biblioteca
(se existir entre as regulares) → primeira regular disponível → Season 0
se for a única opção → nenhuma. `?season=` inválido/inexistente na série
cai no fallback, sem erro de página.

Confirmado por QA runtime (Chromium real, Breaking Bad/1396): selecionar
temporada atualiza a URL; Back/Forward restauram URL e valor do `<select>`
corretamente; refresh com `?season=3` reabre a temporada 3; trocar de
temporada dispara exatamente 1 request de season (nenhum refetch de
`/api/tmdb/tv/[id]`); resposta lenta de uma temporada anterior nunca
sobrescreve a temporada mais nova selecionada (cleanup por `cancelled`
flag, mesmo padrão que o componente já usava antes da fase).

### Specials / Season 0

Suportado **somente** se `season_number = 0` existir de fato no array de
summaries (nunca fabricado). Aparece como opção "Especiais" **depois**
das temporadas regulares no seletor. Não entra na contagem "X
temporadas" nem nos cálculos de conclusão da série (que continuam usando
`totalSeasons`/temporadas regulares, inalterados). Confirmado com
Breaking Bad/1396 (tem season 0 com 9 episódios reais) — selecionar
"Especiais" via UI, via URL direta e via `?season=0` funciona; um título
sem season 0 (`?season=0` nele) cai no fallback seguro em vez de mostrar
uma temporada inexistente.

### Loading / erro / vazio

Estados agora distintos: loading (spinner), erro (`role="alert"` +
mensagem + "Tentar novamente", só re-dispara a mesma temporada via
`retryToken`), vazio (`episodes: []` dentro de uma resposta válida —
mensagem neutra, sem `role="alert"`). Confirmado via fixture controlada
(`page.route`): uma falha HTTP 502 na temporada 2 mostra o estado de erro
(nunca uma lista vazia disfarçada); a temporada 1 com `episodes: []`
mostra o estado vazio (nunca o visual de erro); clicar "Tentar novamente"
depois de trocar a fixture para uma resposta válida repõe a lista.

### Episódio futuro / data desconhecida

`getEpisodeReleaseStatus` alimenta: badge "Futuro" discreto, ocultação de
sinopse por padrão (`"Sinopse oculta até o lançamento." + "Mostrar
sinopse"`, revelação é estado local, não persistida) só para `future`
confirmado (`unknown` mantém a sinopse visível), e desabilitação do botão
individual de assistido (`disabled` real + `aria-label`/`title`
explicando o motivo) para `future` **e** `unknown` — data desconhecida
nunca é tratada como lançada.

**Importante, registrado explicitamente:** essa nova gating cobre só a
ação individual (botão de check por episódio) e a página de episódio.
`released_episode_count`/a lista usada por "Marcar episódios lançados
como assistidos" (`completeSeason`) **continuam com a definição antiga**
(`!air_date || air_date <= hoje`, que trata data ausente como lançada) —
isso é proposital: a fase trava explicitamente cascata/complete-season/
`released_episode_count` como escopo de C5.2 (integridade de progresso).
Efeito prático: um episódio com `air_date` desconhecida não pode ser
marcado individualmente (botão desabilitado), mas teoricamente ainda
entraria na contagem de "lançados" do botão de completar temporada em
lote — essa inconsistência estreita e documentada é intencional nesta
fase e vira item explícito do handoff C5.2 abaixo.

Confirmado com dado real: Lei & Ordem: SVU (id 2734), próximo episódio
real S28E01 com `air_date` futura (2026-10-08) — badge "Futuro" e
sinopse oculta aparecem tanto no `EpisodeBrowser` quanto na página de
episódio; revelar sinopse funciona (mostra "Sinopse indisponível.", já
que o TMDB ainda não publicou overview); nenhum erro novo de console.

### A11y

Foto de still (browser e detalhe) decorativa (`alt=""`) quando o nome já
é texto visível ao lado; fallback sem still usa `aria-hidden="true"`.
Erro tem `role="alert"`; vazio não. Botão de assistido desabilitado tem
`aria-label`/`title` explicando o motivo em vez de só ficar cinza. Tab
order confirmado sequencial (seletor → cards de produção/elenco →
episódios) sem focus trap.

### Não alterado (confirmado, 0 diff)

`lib/complete-series-progress.ts`, `app/api/episodes/route.ts`,
`components/SeriesSchedule.tsx`, `app/api/tv/[id]/schedule/route.ts`,
schema/banco, `stopped_episode` (dívida já catalogada em C5.0, não
tocada).

## C5.2 — Handoff (o que ainda falta auditar/hardenizar)

C5.2 é a única fase seguinte planejada para C5 antes de C6 (herda a
sequência original C5.1→C5.6 da auditoria; as subfases de UI/polish
antes distribuídas em C5.3/C5.5 foram absorvidas pela C5.1 consolidada e
não precisam de subfase própria).

Itens explicitamente NÃO tocados por C5.1 e que C5.2 precisa auditar:

1. **`episodes_progress`** — integridade/idempotência do upsert, cascatas
   de "marcar anteriores como assistidos".
2. **`current_season` / `completed_seasons` / `stopped_season`** — cálculo
   em `/api/episodes` (POST/PUT) e em `SeasonProgress`, hoje inalterado.
3. **`stopped_episode`** — `app/api/library/sync-seasons/route.ts` grava
   essa coluna, mas ela não foi encontrada no `supabase/schema.sql`
   versionado (achado da C5.0, não investigado nem corrigido).
4. **Cascatas/complete/reset de temporada** — `completeSeason` no
   `EpisodeBrowser`, `completeCurrentSeason` no `SeasonProgress`, e os
   helpers de completar/resetar série completa.
5. **`released_episode_count` usando data ausente = lançado** —
   inconsistência documentada acima entre o gating individual (novo,
   correto) e o cálculo em lote (antigo, inalterado); C5.2 decide se
   generaliza a nova semântica para o cálculo em lote/backend ou mantém
   a distinção.
6. **Sync de novas temporadas** — comportamento quando o TMDB adiciona
   temporadas/episódios depois que o usuário já tem progresso salvo.
7. **Compatibilidade schema real vs. versionado** — confirmar
   `stopped_episode` e quaisquer outras colunas usadas em código mas não
   vistas no schema auditado.
8. **Regressão final e closeout de C5** — depois de C5.2, rodar
   regressão independente cobrindo C5.1+C5.2 juntas antes de fechar C5
   inteira e abrir C6.
