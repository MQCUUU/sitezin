# Indicações para amigos — plano de implementação

> **Para agentes:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para executar tarefa por tarefa. Passos com caixas (`- [ ]`).

**Objetivo:** permitir indicar um título a amigos com um bilhete. Quem recebe vê a indicação em Para você, e quem indicou fica sabendo o que o amigo achou, com um "faro" de acertos.

**Arquitetura:**
- Uma tabela nova, `recommendations`. O estado do lado de quem recebe sai do `library_items` dele, sem nada guardado.
- Funções puras em `lib/recommendations/`. Rotas em `app/api/recommendations/…`.
- Um gancho nas rotas da biblioteca dispara o retorno.
- Interface em quatro lugares: o painel de indicar no título, as visões novas de `/for-you`, o número na barra e a fileira no Início.

**Stack:** Next 16, React 19, TypeScript, Neon, `motion/react`, `lucide-react`, CSS com tokens `--mc-*`, `node:test` e Playwright.

**Spec:** `docs/superpowers/specs/2026-11-11-direcao-curtidas-indicacoes-design.md`, seção 3.

**Depende de:** `0009` aplicada, porque ela já amplia o CHECK de `notifications` com `recommendation_received` e `recommendation_result`.

## Restrições globais

- PT-BR. Sem commit, push, deploy ou SQL no PROD sem pedido explícito; migrations só no TEST (`npm run db:migrate`). Nunca imprimir valores de `.env*`.
- Antes de editar `app/`, `components/` ou `styles/`, carregar `frontend-design:frontend-design` e `mycatalog-design-system`. Para as rotas, carregar `security-review`.
- Identidade Projeção:
  - sem cards, eyebrows, "·" ou "→";
  - âmbar só no que é seu, no número de não vistas e na aba selecionada;
  - botão principal branco; ações de linha como controles de texto com sublinhado âmbar.
- Amigos são `follows` aceitos nos dois sentidos, como na consulta `friends` de `app/api/follows/route.ts` (linhas ~60–64). `friendships` não é usada.
- Limites:
  - até 20 destinatários por envio;
  - bilhete opcional, de até 140 caracteres após `trim` (vazio vira `null`);
  - envio limitado com `takeToken(\`recommend:${userId}\`, 30, 3_600_000)`.
- Respostas pessoais com `private, no-store`. Recurso alheio ou inexistente responde 404.
- Os E2E usam a conta A (`request`) e a conta B (`credentialsB()`). Os títulos 424 e 129 são exclusivos deste plano.

## Foco da revisão

1. **Amizade desfeita entre abrir o painel e enviar.** O servidor reconfere e devolve o destinatário em `skipped` com `reason: "not_friend"`. Teste: E2E em que B deixa de seguir A antes do envio.
2. **Indicar duas vezes o mesmo título à mesma pessoa.** O segundo envio volta em `skipped` (`already_sent`), sem erro 500, por causa do UNIQUE. Teste no E2E.
3. **Nota privada no retorno.** Se o amigo tem `ratings_visibility = "private"`, o aviso e "Que você indicou" dizem só "assistiu", e a nota não entra no faro. Teste unitário em `resultCopy` e `faro`.
4. **Dispensar e depois pôr na Watchlist.** O estado derivado vira "na Watchlist", porque o item da biblioteca vence `dismissed_at`. Teste unitário em `recipientState`.
5. **Gancho da biblioteca rodando duas vezes.** Marcar como visto e depois dar a nota atualiza o mesmo aviso (`DO UPDATE`), sem duplicar. Teste: E2E que conta os avisos `recommendation_result` de A.

---

### Tarefa 1: migration `0010_recommendations`

**Arquivos:**
- Criar: `db/migrations/0010_recommendations.sql`.
- Modificar: `scripts/test-db-migrations.mjs`.

- [ ] **Passo 1: escrever os testes que falham**
  - `"0010 cria recommendations com cascata, UNIQUE e CHECK"`. No texto das migrations:
    - `ON DELETE CASCADE` em `sender_id` e `recipient_id`;
    - `UNIQUE (sender_id, recipient_id, media_id)`;
    - `CHECK (sender_id <> recipient_id)`;
    - o CHECK de 140 em `note`.
  - `"notification_preferences ganha recommendation_site"`.
- [ ] **Passo 2: rodar e ver falhar**
  - Comando: `node --experimental-strip-types --test scripts/test-db-migrations.mjs`
- [ ] **Passo 3: escrever a migration** conforme a spec: os dois índices, RLS no mesmo padrão da `0009` e tudo idempotente.
- [ ] **Passo 4: ver passar e aplicar no TEST**
  - `npm run db:migrate`, depois `npm run db:rebuild-check`.
- [ ] **Passo 5: commit (só se o usuário pedir)**
  - Mensagem: `Indicações: tabela`

### Tarefa 2: regras puras

**Arquivos:**
- Criar: `lib/recommendations/rules.ts`.
- Teste: `scripts/test-recommendations.mjs`.
  - O arquivo `scripts/test-friend-recommendations.mjs` já existe e é de outro recurso; não mexer nele.

**Interfaces:**
- Produz:
  - `export type RecipientState = "pending" | "saved" | "watched" | "dismissed"`
  - `export function recipientState(rec: { dismissed_at: string | null }, item: { status: string } | null): RecipientState`
    - `watched` vem de `status === "watched"`;
    - `saved` vem de `"want"`;
    - qualquer outro status da biblioteca conta como `saved`;
    - sem item: `dismissed` se houver `dismissed_at`, senão `pending`.
  - `export function senderStatusLabel(state: RecipientState, visibleRating: number | null): string`
    - `"ainda não viu"` para `pending` e `dismissed`;
    - `"pôs na Watchlist"` para `saved`;
    - `"assistiu e deu 9,5"` ou `"assistiu"` para `watched`.
  - `export function resultCopy(friendName: string, titleName: string, visibleRating: number | null): string`
    - `"Bruno assistiu Interestelar, que você indicou, e deu 9,5"`, ou sem `", e deu …"` quando a nota é `null`;
    - nota com vírgula e uma casa decimal.
  - `export function faro(ratings: (number | null)[]): { hits: number; rated: number }`
    - `rated` conta as notas não nulas e `hits` as ≥ 7.
  - `export function faroLabel(f: { hits: number; rated: number }, min: number): string | null`
    - `"7 de 9 indicações acertaram"` ou `"1 de 1 indicação acertou"`;
    - `null` quando `rated < min`.
  - `export function groupByTitle<T extends { media_id: number; created_at: string }>(recs: T[]): { media_id: number; recs: T[] }[]`
    - grupos ordenados pelo `created_at` mais recente.
  - `export function sendersLine(names: string[]): string`
    - `"Ana indicou"`, `"Ana e Bruno indicaram"`, `"Ana, Bruno e mais 2 indicaram"`.
  - `export function normalizeNote(raw: unknown): string | null | false`
    - `null` quando vazio;
    - `false` quando tem mais de 140 caracteres ou não é string nem nulo.

- [ ] **Passo 1: escrever os testes que falham.** Cobrir cada função, incluindo:
  - `faro([7, 6.9, null])` → `{ hits: 1, rated: 2 }`;
  - `faroLabel({ hits: 2, rated: 2 }, 3)` → `null`;
  - `recipientState({ dismissed_at: "x" }, { status: "want" })` → `"saved"`;
  - `normalizeNote("  ")` → `null`;
  - `normalizeNote` com 141 caracteres → `false`.
- [ ] **Passo 2: rodar e ver falhar**
  - Comando: `node --experimental-strip-types --test scripts/test-recommendations.mjs`
- [ ] **Passo 3: implementar.**
- [ ] **Passo 4: ver passar.**
- [ ] **Passo 5: commit (só se o usuário pedir)**
  - Mensagem: `Indicações: regras de estado, retorno e faro`

### Tarefa 3: APIs, retorno e avisos

**Arquivos:**
- Criar:
  - `lib/recommendations/db.ts` (SQL: amigos com marcações, envio, listas, faro);
  - `lib/notifications/recommendations.ts`;
  - `app/api/recommendations/route.ts` (`POST` envia; `GET ?view=received|sent`);
  - `app/api/recommendations/candidates/route.ts` (`GET ?tmdb_id=&type=`);
  - `app/api/recommendations/summary/route.ts` (`GET`);
  - `app/api/recommendations/dismiss/route.ts` (`POST { media_id }`).
- Modificar:
  - `app/api/library/route.ts`: depois do INSERT bem-sucedido (antes do `return … 201`, linha ~597), quando `status === "watched"`;
  - `app/api/library/[id]/route.ts`: depois do `UPDATE` (linha ~144), quando o status final é `watched` e o status ou a nota mudou;
  - nos dois casos, chamar `notifyRecommendationResults(sql, { recipientId, mediaId })` dentro de `try/catch` que só registra o erro, para o aviso nunca quebrar a gravação.
- Teste: `tests/recommendations.spec.ts`.

**Interfaces:**
- Consome: a Tarefa 2 inteira.
- Produz:
  - `GET /api/recommendations/candidates`
    - → `{ friends: { id, username, display_name, avatar_url, watched: boolean, already_sent: boolean }[] }`
    - ordenado por nome; lista vazia quando não há amigos.
  - `POST /api/recommendations` com `{ tmdb_id, media_type, recipient_ids, note? }`
    - → 200 `{ sent: string[], skipped: { id: string, reason: "not_friend" | "watched" | "already_sent" }[] }`;
    - 400 para mais de 20 destinatários, lista vazia ou bilhete inválido;
    - 429 no limite;
    - o `media_id` sai do mesmo caminho de "garantir mídia" que o `POST /api/library` usa (reaproveitar a função, não duplicar o SQL);
    - cada envio gera `recommendation_received`, com `event_key = recommendation_received:<recId>` e `href = /for-you?view=amigos`, respeitando `recommendation_site`.
  - `GET /api/recommendations?view=received`
    - → `{ groups: { media: { tmdb_id, media_type, title, poster_path, backdrop_path }, senders: { username, display_name, avatar_url, note, created_at }[], state: RecipientState }[] }`
    - sem `dismissed`; ordem: `pending` primeiro, depois `saved`, depois `watched`, cada grupo pelo mais recente.
  - `GET /api/recommendations?view=sent`
    - → `{ items: { media, recipient: { username, display_name, avatar_url }, label: string, created_at }[], faro: { hits, rated, label: string | null } }`
    - `label` vem de `senderStatusLabel`;
    - a nota visível passa por `canViewSection` com `ratings_visibility ?? activity_visibility`, e quem indicou conta como seguidor aceito.
  - `GET /api/recommendations/summary`
    - → `{ unseen: number, pending: number }`
    - `unseen` = avisos `recommendation_received` não lidos.
  - `POST /api/recommendations/dismiss` com `{ media_id }` → 204. Preenche `dismissed_at` em todas as suas recebidas daquele título.
  - `DELETE /api/recommendations/[id]` → 204.
    - Só quem indicou pode cancelar, e só enquanto o estado for `pending` ou `dismissed`.
    - Nos outros casos responde 404, inclusive para quem não indicou.
    - Também apaga o aviso `recommendation_received` não lido daquela indicação.
    - Arquivo: `app/api/recommendations/[id]/route.ts`.
  - Em `?view=sent`, cada item ganha `id` e `can_cancel: boolean`.
  - `notifyRecommendationResults(sql, { recipientId, mediaId })`
    - um aviso `recommendation_result` por indicação recebida daquele título;
    - `event_key = recommendation_result:<recId>`, com `ON CONFLICT … DO UPDATE SET message, read_at = NULL, created_at = now()`;
    - texto de `resultCopy`; respeita `recommendation_site` de quem indicou.

- [ ] **Passo 1: escrever os E2E que falham** (`tests/recommendations.spec.ts`, `serial`)
  - **`beforeAll`:**
    - A e B se seguem, com aceite se pendente;
    - remover 424 e 129 da biblioteca dos dois.
  - **`afterAll`:**
    - limpar a biblioteca;
    - A cancela as próprias indicações dos títulos 424 e 129 (`DELETE /api/recommendations/[id]`, ids vindos de `?view=sent`);
    - B deixa de seguir A e A deixa de seguir B.
  - O `beforeAll` faz a mesma limpeza antes de começar, para o caso de uma rodada anterior ter caído no meio.
  - **Testes:**
    - `"candidatos: B aparece como amigo de A"`.
    - `"A indica 424 para B; segundo envio volta already_sent"`.
    - `"B vê em Dos amigos com o bilhete e unseen 1"`.
    - `"B põe na Watchlist; A vê 'pôs na Watchlist'"`.
    - `"B marca como visto com nota 8; A recebe um aviso, e com a nota 9 o mesmo aviso é atualizado"`. A conta os itens `recommendation_result` daquele título: 1.
    - `"B dispensa 129 depois de receber; A vê 'ainda não viu'"`.
    - `"A cancela uma indicação pendente; B não a vê mais; B não consegue cancelar a de A (404)"`.
    - `"sem amizade o envio volta not_friend"`. B deixa de seguir A, e A tenta enviar 129 para B.
- [ ] **Passo 2: rodar e ver falhar**
  - Comando: `PLAYWRIGHT_BASE_URL=http://localhost:3991 npx playwright test tests/recommendations.spec.ts --project=setup --project=chromium`
- [ ] **Passo 3: implementar.**
- [ ] **Passo 4: ver passar.** Rodar também `npm test` e `tests/library-*.spec.ts`, para confirmar que o gancho não quebrou a biblioteca.
- [ ] **Passo 5: commit (só se o usuário pedir)**
  - Mensagem: `Indicações: APIs, retorno e avisos`

### Tarefa 4: botão Indicar e painel no título

**Arquivos:**
- Criar:
  - `components/recommend/RecommendDialog.tsx` (usa `Dialog` de `components/ui/Dialog.tsx`, que já faz modal e folha);
  - `styles/features/recommend.css` (prefixo `rc-`).
- Modificar: `components/title/TitleHero.tsx`.
  - Em `.tt-actions` (linha ~120), um `Button` `tt-quiet tt-icon` com o ícone `Send`, `aria-label="Indicar"` e o texto "Indicar" visualmente oculto.
  - Só aparece com sessão e com pelo menos um amigo, perguntando a `/candidates` na primeira abertura do menu. Na prática: buscar ao montar, com sessão, e esconder o botão se a lista vier vazia.
  - Embaixo de `TitleMeta`, a linha "Indicado por Ana e Bruno" (`sendersLine`) quando `GET /api/recommendations?view=received` tem esse título em `pending` ou `saved`. Uma rota mais leve pode ser `?view=received&tmdb_id=` com o mesmo formato filtrado.
- Teste: em `tests/recommendations.spec.ts`, acrescentar `"painel: amigo que já viu aparece apagado e o envio confirma"`. Como A em `/title/movie/424`:
  - clicar em `getByRole("button", { name: "Indicar" })`;
  - B aparece como checkbox desabilitado com "já viu", se B viu, ou "já indicado";
  - o toast confirma o envio quando possível.

- [ ] **Passo 1: escrever o E2E e ver falhar.**
- [ ] **Passo 2: implementar**
  - **Painel:**
    - título "Indicar {título}";
    - lista de amigos como checkboxes com avatar e nome, com busca (`Input`) quando são mais de 12;
    - `Textarea` com label "Bilhete (opcional)" e contador "n/140";
    - botão branco "Enviar indicação", desabilitado sem ninguém marcado.
  - **Depois de enviar:**
    - toast "Indicado para Bruno e Marina", e os pulados ganham uma frase curta embaixo;
    - o painel fecha.
  - **Marcações:** "já viu" e "já indicado" ficam apagados, com o motivo em texto.
- [ ] **Passo 3: ver passar.**
- [ ] **Passo 4: conferir no navegador**
  - De 320 a 1440 px; no celular, o painel abre como folha.
  - Teclado: o foco entra no painel e Esc fecha.
  - `prefers-reduced-motion` respeitado pelo `Dialog`.
- [ ] **Passo 5: commit (só se o usuário pedir)**
  - Mensagem: `Indicações: indicar a partir do título`

### Tarefa 5: Dos amigos e Que você indicou em `/for-you`

**Arquivos:**
- Criar:
  - `components/for-you/FriendsInbox.tsx` (visão "Dos amigos");
  - `components/for-you/SentRecommendations.tsx` (visão "Que você indicou");
  - estilos em `styles/features/recommend.css`.
- Modificar: `app/for-you/page.tsx`.
  - Ler `view` de `useSearchParams` (`amigos`, `enviadas` ou nenhum).
  - Seletor no topo, antes de `.fy-toolbar`: três controles de texto ("Para você", "Dos amigos", "Que você indicou"), com `role="tablist"` e o número de não vistas ao lado de "Dos amigos".
  - Sem `view`, a página atual continua igual. Com `view`, renderiza só o componente dela, e os filtros Tudo, Filmes e Séries não aparecem.
- Teste: em `tests/recommendations.spec.ts`, acrescentar:
  - `"Dos amigos lista o bilhete e as ações"`: B em `/for-you?view=amigos`;
  - `"Que você indicou mostra o faro"`: A em `/for-you?view=enviadas`;
  - `"visões vazias têm convite"`: com uma conta sem indicações, "Dos amigos" diz "Quando um amigo te indicar algo, aparece aqui." com link para Descobrir.

- [ ] **Passo 1: escrever o E2E e ver falhar.**
- [ ] **Passo 2: implementar**
  - **Dos amigos:**
    - linhas separadas por fio: pôster (`Poster`, num contêiner com `aspect-ratio`), título com link, `sendersLine` e "há 2 dias", bilhete entre aspas;
    - controles de texto:
      - "Pôr na Watchlist": `POST /api/library` com `status: "want"`;
      - "Já vi": `POST /api/library` com `status: "watched"`, depois leva ao título para avaliar;
      - "Dispensar": `POST /dismiss`.
    - A linha some com uma transição curta de opacidade (180 ms), e nenhuma com `prefers-reduced-motion`.
    - Ao montar, `PATCH /api/notifications` marca como lidos os avisos `recommendation_received`. Usar o campo `type` se a rota aceitar; se não, acrescentar `{ type: "recommendation_received" }` à rota, com o filtro `AND type = …`.
  - **Que você indicou:**
    - faro no topo, como linha condensada grande, quando `label` não é nulo;
    - linhas com pôster, título, "para Bruno" e o `label` do estado;
    - controle de texto "Cancelar indicação" quando `can_cancel`, com confirmação do `ConfirmProvider`.
- [ ] **Passo 3: ver passar e conferir no navegador** (de 320 a 1440 px, teclado, console limpo).
- [ ] **Passo 4: commit (só se o usuário pedir)**
  - Mensagem: `Indicações: Dos amigos e Que você indicou`

### Tarefa 6: número na barra, fileira no Início e faro no perfil

**Arquivos:**
- Modificar:
  - `components/Nav.tsx`:
    - com sessão, buscar `/api/recommendations/summary` ao montar e a cada troca de rota;
    - quando `unseen > 0`, "Para você" mostra o número em âmbar (`.mc-appbar-count`) na barra, no menu "Mais" e na navegação do celular;
    - nome acessível "Para você, 2 indicações novas".
  - `components/HomeClient.tsx`: com sessão e `pending > 0`, uma fileira "Indicados pelos amigos" com `CarouselRail` (até 10, de `GET /api/recommendations?view=received`), posicionada depois da primeira fileira pessoal que já existe.
  - `app/api/public-profile/[username]/route.ts`: acrescentar `faro: { hits, rated }` quando `rated >= 3`.
  - O componente do perfil público mostra "Faro: 7 de 9 indicações acertaram" na ficha. Achar onde `profile-v2-counts` é renderizado.
- Teste: em `tests/recommendations.spec.ts`, acrescentar `"barra mostra número de indicações novas"`. Como B, logo depois de um envio novo de A (a limpeza do `beforeAll` garante que o envio é novo):
  - `.mc-appbar-link[href="/for-you"] .mc-appbar-count` visível;
  - depois de abrir `/for-you?view=amigos`, o número some.

- [ ] **Passo 1: escrever o E2E e ver falhar.**
- [ ] **Passo 2: implementar.**
- [ ] **Passo 3: ver passar e conferir no navegador:** barra em 320 e 1440 px, Início logado com e sem pendentes, perfil público.
- [ ] **Passo 4: commit (só se o usuário pedir)**
  - Mensagem: `Indicações: número na barra, fileira no Início e faro`

### Tarefa 7: preferência, exportação e verificação final

**Arquivos:**
- Modificar:
  - `app/api/profile/notifications/route.ts` e `components/NotificationSettings.tsx`: `recommendation_site` ("Indicações de amigos e o que acharam");
  - `app/api/account/export/route.ts`: `recommendations_sent` e `recommendations_received`.

- [ ] **Passo 1: implementar e conferir**
  - `GET /api/account/export` contém as duas chaves.
  - Com a preferência desligada, B não recebe `recommendation_received`. Cobrir com um teste E2E curto no mesmo spec.
- [ ] **Passo 2: verificação final**
  - `npm run check`, `npm test`, E2E completo e `npm run build` (apagar `.next` antes).
  - Esperado: tudo verde e um único teste ignorado.
- [ ] **Passo 3:** a migration `0010` no PROD fica para quando o usuário pedir a publicação.
