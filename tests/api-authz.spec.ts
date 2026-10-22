import { expect, test, type APIRequestContext, type BrowserContext } from "@playwright/test";

import { credentialsB, guestContext, json, loginContext, RANDOM_UUID } from "./api-helpers";

/*
 * Fase 6 (P2-12) — autorização entre DUAS contas, direto na API (sem UI).
 * A conta A (fixture `request`, do auth.setup) cria recursos privados; a conta B
 * tenta ler, alterar, apagar e inferir. Política do app: recurso de outra pessoa
 * responde como INEXISTENTE (404) — mesma resposta de um id que não existe, para
 * não revelar que o recurso existe. Títulos 238/241 são só deste arquivo.
 */

const MARK = `F6-AUTHZ-${Date.now()}`;
const A_MOVIE = 238;

let B: BrowserContext;
let b: APIRequestContext;
const created: { item?: string; entry?: string; category?: string; privateList?: string; publicList?: string } = {};

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ browser, request }) => {
  const { email, password } = credentialsB();
  B = await loginContext(browser, email, password);
  b = B.request;

  const item = await json(await request.post("/api/library", { data: { media: { id: A_MOVIE, media_type: "movie" }, status: "watched" } }));
  created.item = item.id;
  await request.patch(`/api/library/${created.item}`, { data: { status: "watched", review: `${MARK} resenha` } });

  const entry = await json(
    await request.post("/api/watch-history", {
      data: { library_id: created.item, watched_at: new Date().toISOString(), rating: 8, comment: `${MARK} comentário` },
    })
  );
  created.entry = entry?.entry?.id ?? entry?.id;

  const category = await json(await request.post("/api/reviews/categories", { data: { name: `${MARK}-cat`, weight: 100, position: 0 } }));
  created.category = category.id;
  await request.post("/api/reviews/scores", { data: { library_item_id: created.item, category_id: created.category, score: 7 } });

  const priv = await json(await request.post("/api/lists", { data: { name: `${MARK} privada`, description: `${MARK} segredo`, is_public: false } }));
  created.privateList = priv.id;
  await request.post("/api/lists/items", { data: { list_id: created.privateList, tmdb_id: A_MOVIE, media_type: "movie" } });
  const pub = await json(await request.post("/api/lists", { data: { name: `${MARK} pública`, is_public: true } }));
  created.publicList = pub.id;

  await request.post("/api/not-interested", { data: { tmdb_id: 241, media_type: "movie", reason: "f6" } });

  expect(created.item && created.entry && created.category && created.privateList && created.publicList).toBeTruthy();
});

test.afterAll(async ({ request }) => {
  if (created.privateList) await request.delete(`/api/lists?id=${created.privateList}`);
  if (created.publicList) await request.delete(`/api/lists?id=${created.publicList}`);
  if (created.category) await request.delete(`/api/reviews/categories?id=${created.category}`);
  // A visualização sobrevive à remoção do item (histórico preservado por desenho) — apaga explicitamente.
  if (created.entry) await request.delete(`/api/watch-history/${created.entry}`);
  if (created.item) await request.delete(`/api/library/${created.item}`);
  await request.delete("/api/not-interested?tmdb_id=241&media_type=movie");
  await B?.close();
});

const noLeak = (body: unknown) => expect(JSON.stringify(body)).not.toContain(MARK);

test("biblioteca: B não lê, não altera e não apaga o item de A", async ({ request }) => {
  // O status depende do histórico do título (visualização repetida = "reassistido"); compara com o de antes.
  const before = await json(await request.get(`/api/library?tmdb_id=${A_MOVIE}&type=movie`));
  const lookup = await json(await b.get(`/api/library?tmdb_id=${A_MOVIE}&type=movie`));
  expect(lookup?.id).not.toBe(created.item);
  noLeak(await json(await b.get("/api/library")));

  expect((await b.patch(`/api/library/${created.item}`, { data: { status: "dropped" } })).status()).toBe(404);
  expect((await b.delete(`/api/library/${created.item}`)).status()).toBe(404);
  expect((await b.delete(`/api/library?id=${created.item}`)).status()).toBe(404);

  const mine = await json(await request.get(`/api/library?tmdb_id=${A_MOVIE}&type=movie`));
  expect(mine.id).toBe(created.item);
  expect(mine.status).toBe(before.status);
  expect(mine.review).toBe(before.review);
});

test("recurso alheio e inexistente respondem igual (não revela existência)", async () => {
  const alheio = await b.delete(`/api/library/${created.item}`);
  const inexistente = await b.delete(`/api/library/${RANDOM_UUID}`);
  expect(alheio.status()).toBe(inexistente.status());
  expect(await alheio.text()).toBe(await inexistente.text());

  const listaAlheia = await b.get(`/api/lists/items?list_id=${created.privateList}`);
  const listaInexistente = await b.get(`/api/lists/items?list_id=${RANDOM_UUID}`);
  expect(listaAlheia.status()).toBe(404);
  expect(await listaAlheia.text()).toBe(await listaInexistente.text());
});

test("histórico de visualizações: B não lê, não edita e não apaga", async ({ request }) => {
  const read = await b.get(`/api/watch-history?library_id=${created.item}`);
  expect([200, 404]).toContain(read.status());
  noLeak(await json(read));
  expect((await b.patch(`/api/watch-history/${created.entry}`, { data: { comment: "invasão" } })).status()).toBe(404);
  expect((await b.delete(`/api/watch-history/${created.entry}`)).status()).toBe(404);
  const mine = await json(await request.get(`/api/watch-history?library_id=${created.item}`));
  expect(JSON.stringify(mine)).toContain(`${MARK} comentário`);
});

test("avaliação: B não lê notas nem mexe nas categorias de A", async () => {
  const scores = await b.get(`/api/reviews/scores?library_item_id=${created.item}`);
  expect([200, 404]).toContain(scores.status());
  noLeak(await json(scores));
  expect((await b.post("/api/reviews/scores", { data: { library_item_id: created.item, category_id: created.category, score: 1 } })).status()).toBe(404);
  expect((await b.patch("/api/reviews/categories", { data: { id: created.category, name: "invasão" } })).status()).toBe(404);
  expect((await b.delete(`/api/reviews/categories?id=${created.category}`)).status()).toBe(404);
  noLeak(await json(await b.get("/api/reviews/categories")));
});

test("listas: privada de A é inexistente para B; pública é só leitura", async () => {
  expect((await b.patch("/api/lists", { data: { id: created.privateList, name: "invasão" } })).status()).toBe(404);
  expect((await b.delete(`/api/lists?id=${created.privateList}`)).status()).toBe(404);
  expect((await b.post("/api/lists/items", { data: { list_id: created.privateList, tmdb_id: 603, media_type: "movie" } })).status()).toBe(404);
  noLeak(await json(await b.get("/api/lists")));

  expect((await b.get(`/api/lists/items?list_id=${created.publicList}`)).status()).toBe(200);
  expect((await b.post("/api/lists/items", { data: { list_id: created.publicList, tmdb_id: 603, media_type: "movie" } })).status()).toBe(404);
  expect((await b.patch("/api/lists", { data: { id: created.publicList, name: "invasão" } })).status()).toBe(404);
});

test("episódios: B não lê nem marca episódio no item de A", async () => {
  const read = await b.get(`/api/episodes?library_id=${created.item}&season=1`);
  expect([200, 404]).toContain(read.status());
  expect(JSON.stringify(await json(read))).not.toContain(created.item!);
  const write = await b.post("/api/episodes", {
    data: { library_id: created.item, season_number: 1, episode_number: 1, watched: true, released_episode_count: 1, total_seasons: 1 },
  });
  expect(write.status()).toBe(404);
});

test("exportação e ocultos: B só recebe os próprios dados", async () => {
  const exported = await b.get("/api/account/export?format=json");
  expect(exported.status()).toBe(200);
  const text = await exported.text();
  expect(text).not.toContain(MARK);
  expect(text).not.toContain(created.item!);
  const hidden = await json(await b.get("/api/not-interested"));
  expect(JSON.stringify(hidden)).not.toMatch(/"tmdb_id":\s*241\b/);
});

test("perfil privado de A visto por B: bloqueado, sem bio, listas ou atividade", async ({ request }) => {
  const me = String((await request.get("/profile", { maxRedirects: 0 })).headers().location || "");
  const username = me.split("/u/")[1];
  test.skip(!username, "conta A sem @");
  const profile = await json(await b.get(`/api/public-profile/${username}`));
  if (profile.locked) {
    expect(profile.profile.bio).toBeNull();
    expect(profile.lists).toEqual([]);
    expect(profile.activity).toEqual([]);
    expect(profile.diary).toEqual([]);
  }
  noLeak(profile);
});

test("follows: B não aceita/recusa solicitação que não é dele", async () => {
  expect((await b.patch("/api/follows", { data: { follower_id: RANDOM_UUID, action: "accept" } })).status()).toBe(404);
});

/* Sem sessão: toda rota privada responde 401 (JSON), nunca dado nem 500. */
const PRIVATE: [string, string][] = [
  ["GET", "/api/library"], ["POST", "/api/library"], ["PATCH", `/api/library/${RANDOM_UUID}`], ["DELETE", `/api/library/${RANDOM_UUID}`],
  ["DELETE", `/api/library?id=${RANDOM_UUID}`], ["POST", "/api/library/state"], ["GET", "/api/lists"], ["POST", "/api/lists"],
  ["PATCH", "/api/lists"], ["DELETE", `/api/lists?id=${RANDOM_UUID}`], ["POST", "/api/lists/items"], ["GET", "/api/watch-history"],
  ["POST", "/api/watch-history"], ["PATCH", `/api/watch-history/${RANDOM_UUID}`], ["DELETE", `/api/watch-history/${RANDOM_UUID}`],
  ["GET", "/api/episodes?library_id=x&season=1"], ["POST", "/api/episodes"], ["GET", "/api/reviews/categories"], ["POST", "/api/reviews/scores"],
  ["GET", "/api/account/export"], ["POST", "/api/account/import"], ["POST", "/api/account/import/letterboxd"], ["DELETE", "/api/account/delete"],
  ["GET", "/api/account/hidden-titles"], ["POST", "/api/profile/avatar"], ["DELETE", "/api/profile/avatar"], ["GET", "/api/profile/preferences"],
  ["PUT", "/api/profile/preferences"], ["GET", "/api/profile/showcase"], ["PUT", "/api/profile/showcase"], ["PUT", "/api/profile/social-settings"],
  ["POST", "/api/profile/username"], ["GET", "/api/follows"], ["POST", "/api/follows"], ["GET", "/api/notifications"], ["PUT", "/api/streaming-services"],
  ["POST", "/api/not-interested"], ["POST", "/api/assistant"], ["GET", "/api/insights"], ["GET", "/api/diary"], ["GET", "/api/home"],
];

test("sem sessão: rotas privadas → 401 em JSON", async ({ browser }) => {
  const guest = await guestContext(browser);
  const wrong: string[] = [];
  for (const [method, path] of PRIVATE) {
    const response = await guest.request.fetch(path, { method, data: method === "GET" || method === "DELETE" ? undefined : {} });
    const body = await json(response);
    if (response.status() !== 401 || typeof body !== "object" || !body?.error) wrong.push(`${method} ${path} → ${response.status()}`);
  }
  await guest.close();
  expect(wrong).toEqual([]);
});
