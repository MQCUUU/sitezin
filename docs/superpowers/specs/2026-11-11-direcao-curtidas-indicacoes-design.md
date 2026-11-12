# Direção, curtidas e comentários em avaliações, e indicações para amigos — design

Data: 2026-11-11. Status: desenho aprovado pelo usuário (ilustrações na conversa); spec aguardando revisão.

Três recursos independentes, entregues nesta ordem, cada um com seu próprio commit e publicação:

1. **Aba Direção** na página da pessoa (sem banco).
2. **Curtidas e comentários em avaliações** (migration `0009`).
3. **Indicações para amigos** (migration `0010`).

Tudo segue a identidade Projeção:

- sem cards, eyebrows, "·" ou "→";
- âmbar (`--mc-color-accent`) só no que é seu ou está selecionado;
- ação principal em branco;
- controles de texto com sublinhado âmbar;
- blocos separados por fio (`border-top: 1px solid var(--line)`);
- movimento só como resposta a uma ação, sempre respeitando `prefers-reduced-motion`.

---

## 1. Aba Direção

### Comportamento

- **Onde fica.** Na página `app/person/[id]/PersonView.tsx`, que hoje tem as abas Biografia (`bio`), Atuação (`acting`) e Outros trabalhos (`other`), guardadas na URL como `?tab=`. A nova aba **Direção** (`?tab=directing`) entra entre Atuação e Outros trabalhos.
- **O que conta como direção.** Créditos com `credit_kind === "crew"` e `job === "Director"`. Cada título aparece uma vez só, mesmo que o TMDB repita o crédito.
- **Saída de Outros trabalhos.** Os créditos de direção saem de Outros trabalhos, que fica com roteiro, produção e as demais funções. Um título com Direção e Roteiro aparece nas duas abas: em Direção pela direção e em Outros trabalhos pelo roteiro.
- **Quando aparece.** A aba só aparece quando a pessoa tem pelo menos um crédito de direção.
- **Aba inicial.**
  - Sem `?tab` na URL e com `known_for_department === "Directing"`, a página abre em Direção.
  - Nos outros casos, continua abrindo em Biografia.
  - `?tab=directing` numa pessoa sem créditos de direção cai em Biografia.
- **Conteúdo.** Igual à aba Atuação:
  - filmes e séries em blocos separados;
  - agrupados por década ("Anos 2010", "Sem data"), do mais recente ao mais antigo;
  - com o mesmo "ver todos" (`?ver=`).
- **Ficha.** Quando há direção, a ficha ganha "N filmes dirigidos" (no singular, "1 filme dirigido"). Séries dirigidas não entram nessa conta.

### Implementação

- Função pura em `lib/person/split-credits.ts`, `splitCredits(credits) → { acting, directing, other }`, com teste em `node --experimental-strip-types --test`.
- O indicador da aba reaproveita o `layoutId="person-tab-indicator"` que já existe.

### Testes

- **Unitário:** separação, remoção de repetidos, título com Direção e Roteiro, pessoa sem direção.
- **E2E:**
  - `/person/525` (Christopher Nolan) abre em Direção sem `?tab`.
  - "Oppenheimer" aparece em Direção.
  - `/person/287` (ator) não mostra a aba.

---

## 2. Curtidas e comentários em avaliações

### Conceito

- **O que é uma avaliação.** É um `library_items` com nota (`personal_rating`) ou texto (`review`) não vazio. O id da avaliação é `library_items.id`.
- **Quem vê.** Quem pode ver a nota ou o texto pelas regras atuais (`visibleCommunityReviews` + `canViewSection`, com `ratings_visibility` / `reviews_visibility`).
- **Curtidas e comentários.** Herdam essa visibilidade. Quem não vê a avaliação não vê nem os números.

### Banco

Migration `db/migrations/0009_review_social.sql`, rodada primeiro no TEST:

- **`review_likes`**
  - `library_item_id uuid REFERENCES library_items(id) ON DELETE CASCADE`
  - `user_id uuid REFERENCES neon_auth."user"(id) ON DELETE CASCADE`
  - `created_at timestamptz DEFAULT now()`
  - `PRIMARY KEY (library_item_id, user_id)`
  - Índice em `user_id`.
- **`review_comments`**
  - `id uuid DEFAULT gen_random_uuid() PRIMARY KEY`
  - `library_item_id uuid NOT NULL REFERENCES library_items(id) ON DELETE CASCADE`
  - `user_id uuid NOT NULL REFERENCES neon_auth."user"(id) ON DELETE CASCADE`
  - `body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 500)`
  - `created_at timestamptz DEFAULT now()`
  - Índice em `(library_item_id, created_at)`.
- **`notifications_type_check`** passa a aceitar também `review_like`, `review_comment`, `recommendation_received` e `recommendation_result`. Os dois últimos já entram aqui para a `0010` não precisar mexer de novo no CHECK.
- **`notification_preferences`** ganha `review_comment_site boolean DEFAULT true NOT NULL`. A coluna `review_like_site`, que já existe, passa a ser usada.
- **Remoção.**
  - Remover o item da biblioteca apaga as curtidas e os comentários por cascata, como na regra "remover apaga histórico".
  - Apagar só a nota e o texto faz a avaliação deixar de existir: a página dá 404, e os dados ficam guardados até o item ser removido.

### Regras

- **Curtir e comentar** exige sessão e acesso à avaliação.
  - O dono não curte a própria avaliação, e o botão nem aparece para ele.
  - O dono pode comentar na própria avaliação.
- **Comentários.**
  - Têm de 1 a 500 caracteres depois do `trim` e não podem ser editados.
  - Podem apagar o comentário o autor dele e o dono da avaliação.
  - Aparecem dos mais antigos para os mais novos, de 20 em 20, com "Mais comentários".
- **Limites por usuário.** Usam `takeToken` de `lib/rate-limit-core.ts`, com o id do usuário na chave:
  - curtir e descurtir: 60 por minuto;
  - comentar: 10 por minuto.
- **Visitante sem sessão.**
  - Numa avaliação pública, vê os números e os comentários.
  - No lugar do campo, aparece "Entre para comentar", com link para o login.

### APIs

Respostas pessoais, sempre com `Cache-Control: private, no-store`. A regra de acesso fica numa função só, em `lib/reviews/access.ts`, usada por todas as rotas.

- **`GET /api/reviews/community`**: cada item ganha `id`, `like_count`, `comment_count` e `liked_by_viewer`.
- **`GET /api/reviews/[id]`**:
  - Devolve a avaliação (autor, título com `backdrop_path`, nota e texto visíveis), `like_count`, `comment_count`, `liked_by_viewer`, `can_comment` e `is_owner`.
  - Dá 404 se a avaliação não existe ou se quem pede não pode vê-la. Nunca 403, para não revelar que ela existe.
- **`POST` e `DELETE /api/reviews/[id]/like`**: idempotentes, respondem `{ liked, like_count }`.
- **`GET /api/reviews/[id]/comments?cursor=`**: páginas de 20.
- **`POST /api/reviews/[id]/comments`**: recebe `{ body }` e responde 201 com o comentário criado.
- **`DELETE /api/reviews/[id]/comments/[commentId]`**: responde 204, ou 404 se o comentário não existe ou quem pede não tem permissão.

### Interface

- **Aba Avaliações do título** (`components/title/TitleCommunityReviews.tsx`)
  - Embaixo de cada avaliação ficam um coração e um balão, cada um com seu número.
  - A lista nunca mostra os comentários.
  - Curtir muda na hora. Se der erro, volta atrás com um toast.
  - O coração curtido fica em âmbar.
  - Clicar no balão ou no texto abre `/review/[id]`.
- **Página `/review/[id]`**, de cima para baixo:
  - topo na Tela (`TitleBand`) com o backdrop do título;
  - linha "Avaliação de Ana Lima para Interestelar", com links para o perfil e para o título;
  - nota grande em âmbar e texto inteiro;
  - curtir, com a contagem;
  - comentários, separados por fio;
  - campo "Escreva um comentário" com o botão branco "Comentar".
  - O título da aba do navegador é "Avaliação de Ana para Interestelar".
- **Estados.**
  - Carregando: esqueleto da página.
  - Erro: mensagem com "Tentar de novo".
  - Sem comentários: o próprio campo serve de convite.

### Notificações

- **Comentário** (`review_comment`)
  - Um aviso por comentário, com `event_key = review_comment:<commentId>`, para o dono da avaliação.
  - Não avisa quando o dono comenta na própria avaliação.
  - Respeita `review_comment_site`.
- **Curtida** (`review_like`)
  - Um aviso por avaliação, com `event_key = review_like:<libraryItemId>` e `ON CONFLICT (user_id, event_key) DO UPDATE`.
  - Cada curtida nova reescreve a mensagem ("Caio curtiu sua avaliação de Interestelar" ou "Caio e mais 5 pessoas curtiram…"), volta `read_at` para NULL e atualiza `created_at`.
  - Descurtir não mexe no aviso.
  - Respeita `review_like_site`.
- Os dois avisos levam a `/review/[id]`.
- As preferências de notificação ganham "Curtidas nas suas avaliações" e "Comentários nas suas avaliações".

### Testes

- **Unitário:** regras de acesso (dono, seguidor, visitante, avaliação privada) e o texto agrupado do aviso de curtida.
- **E2E (com uma conta):**
  - curtir e descurtir mudam a contagem, e repetir a ação não muda nada;
  - comentar a própria avaliação, ver o comentário na página e apagar;
  - o comentário não aparece na lista do título;
  - um id inexistente dá 404.

---

## 3. Indicações para amigos

### Conceito

- **Amigos** são duas pessoas que se seguem com `follows.status = 'accepted'` nos dois sentidos. A tabela `friendships` é legada e não é usada.
- **Indicação** é um título que alguém manda para um amigo, com um bilhete opcional.

### Banco

Migration `db/migrations/0010_recommendations.sql`, rodada primeiro no TEST:

- **`recommendations`**
  - `id uuid DEFAULT gen_random_uuid() PRIMARY KEY`
  - `sender_id uuid NOT NULL REFERENCES neon_auth."user"(id) ON DELETE CASCADE`
  - `recipient_id uuid NOT NULL REFERENCES neon_auth."user"(id) ON DELETE CASCADE`
  - `media_id integer NOT NULL REFERENCES media(id)`
  - `note text CHECK (note IS NULL OR char_length(note) <= 140)`
  - `dismissed_at timestamptz`
  - `created_at timestamptz DEFAULT now()`
  - `UNIQUE (sender_id, recipient_id, media_id)` e `CHECK (sender_id <> recipient_id)`
  - Índices em `(recipient_id, created_at DESC)` e `(sender_id, created_at DESC)`.
- **`notification_preferences`** ganha `recommendation_site boolean DEFAULT true NOT NULL`.
- **Estado de quem recebe.** Não fica guardado: sai do `library_items` dessa pessoa para aquele `media_id`.

| Estado | Quando |
|---|---|
| pendente | sem item na biblioteca e não dispensada |
| na Watchlist | item com status `want` |
| assistiu | item com status `watched`, com a nota se houver |
| dispensada | `dismissed_at` preenchido e sem item na biblioteca |

### Envio

- **Botão Indicar** na página do título, ao lado da ação de Watchlist. Só aparece para quem está logado e tem pelo menos um amigo.
- **Painel de envio.** No desktop abre como modal, no celular como folha que sobe de baixo, nos padrões que o projeto já usa. Tem:
  - a lista de amigos, com avatar e nome, e uma busca quando forem mais de 12;
  - o bilhete opcional, de até 140 caracteres, com contador;
  - o botão branco "Enviar indicação".
- **Amigos que não podem ser marcados.**
  - Quem já viu o título aparece apagado, com "já viu".
  - Quem já recebeu a sua indicação desse título aparece com "já indicado".
- **`POST /api/recommendations`**
  - Recebe `{ tmdb_id, media_type, recipient_ids, note? }`, com 1 a 20 destinatários.
  - Confere a amizade de cada destinatário no momento do envio.
  - Pula quem já viu o título ou já recebeu a indicação.
  - Responde `{ sent: [...], skipped: [{ id, reason }] }`.
  - Limite de 30 envios por hora por usuário.
- **Confirmação.** O toast diz "Indicado para Bruno e Marina".

### Onde fica

- **`/for-you`** ganha um seletor de visão no topo, guardado na URL como `?view=amigos|enviadas`:
  - "Para você" (a página atual);
  - "Dos amigos";
  - "Que você indicou".

  Os filtros Tudo, Filmes e Séries continuam só na visão "Para você".
- **Dos amigos**
  - Cada título mostra pôster, nome, quem indicou ("Ana indicou, há 2 dias" ou "Ana e Bruno indicaram", agrupando por título) e o bilhete entre aspas.
  - Ações, como controles de texto:
    - "Pôr na Watchlist" cria o item `want`;
    - "Já vi" abre o fluxo atual de marcar como visto e avaliar;
    - "Dispensar" preenche `dismissed_at` em todas as indicações daquele título para você.
  - Ordem: primeiro as pendentes, depois as que estão na Watchlist. As dispensadas não aparecem.
- **Que você indicou**
  - Mostra cada envio e, para cada amigo, um destes estados:
    - "ainda não viu" (inclui as dispensadas, por gentileza);
    - "pôs na Watchlist";
    - "assistiu e deu 9,5". A nota só aparece se o amigo deixa você vê-la.
  - Enquanto o amigo ainda não viu, aparece "Cancelar indicação", com confirmação. Cancelar apaga a indicação e o aviso dela que ainda não foi lido.
  - O faro fica no topo.
- **Barra de navegação** (`components/Nav.tsx)`
  - "Para você" ganha um número em âmbar com as indicações recebidas ainda não vistas, isto é, as notificações `recommendation_received` não lidas.
  - Abrir "Dos amigos" marca essas notificações como lidas e o número some. As indicações pendentes continuam na lista.
- **Sino.** O aviso `recommendation_received` diz "Ana te indicou Duna: Parte Dois" e leva a `/for-you?view=amigos`.
- **Início.** Uma fileira "Indicados pelos amigos", com até 10 títulos, que só aparece quando há indicações pendentes.
- **Página do título.** Uma linha "Indicado por Ana e Bruno", para quem tem uma indicação pendente ou na Watchlist daquele título.

### Retorno

- **Quando avisa.** Quando quem recebeu marca o título como visto, ou dá a nota pela primeira vez depois disso, cada pessoa que indicou recebe `recommendation_result`.
- **Chave.** `event_key = recommendation_result:<recommendationId>`, com `DO UPDATE` para acrescentar a nota se ela vier depois.
- **Texto.** "Bruno assistiu Interestelar, que você indicou, e deu 9,5". A nota fica de fora se `ratings_visibility` não deixa quem indicou vê-la.
- **Onde roda.** Nas rotas da biblioteca (`app/api/library`), depois de gravar.
- **Preferência.** Respeita `recommendation_site` de quem indicou.

### Faro

- **O que é.** Quantas indicações com nota visível tiveram nota 7 ou mais, sobre todas as que têm nota visível: "7 de 9 indicações acertaram".
- **Onde aparece.**
  - Em "Que você indicou", a partir de 1 indicação com nota.
  - No perfil público, a partir de 3. É um número agregado e não expõe nenhuma nota individual.
- **Cálculo.** Função pura em `lib/recommendations/`.

### Privacidade e conta

- Quem indicou nunca vê que a indicação foi dispensada.
- Desfazer a amizade não apaga as indicações já feitas. Só impede as novas.
- Excluir a conta apaga as indicações enviadas e recebidas, por cascata.
- A exportação de dados (`app/api/account/export`) passa a incluir:
  - os comentários feitos;
  - as curtidas dadas;
  - as indicações enviadas e recebidas.

### Testes

- **Unitário:**
  - cálculo do estado;
  - faro: zero indicações, menos de 3, e nota exatamente 7,0;
  - agrupamento por título;
  - texto do retorno, com e sem nota visível.
- **E2E:**
  - Usa a conta A e a conta B, que viram amigas durante o teste.
  - Cobre o envio, a recepção, o retorno, o cancelamento e as visões vazias de `/for-you`.

---

## Fora do escopo

- Editar comentários, responder a comentários, curtir comentários e mencionar pessoas.
- Indicar para quem não é amigo e indicar por link externo.
- E-mail para esses avisos (só avisos no site).
- Ranking público de faro.

## Decisões abertas

1. **Segunda conta E2E:** resolvido. A conta B já existe (`E2E_USER2_EMAIL` e `E2E_USER2_PASSWORD`, `credentialsB()` em `tests/api-helpers.ts`). Os testes fazem A e B se seguirem no `beforeAll` e desfazem tudo no `afterAll`.
2. **Migrations no PROD.** A `0009` e a `0010` rodam primeiro no TEST. No PROD, só com pedido explícito, no momento de publicar cada recurso.

## Verificação antes de publicar cada recurso

- `npm run check`, `npm test`, E2E completo no TEST e `npm run build`.
- Telas vistas no navegador em 320, 375, 768, 1024 e 1440 px.
- Console sem erro novo.
- Teclado e `prefers-reduced-motion` conferidos.
