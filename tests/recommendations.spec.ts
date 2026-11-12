import { expect, test, type APIRequestContext, type BrowserContext } from "@playwright/test";

import { credentialsB, json, loginContext } from "./api-helpers";
import { follow, unfollow, usernameOf } from "./social-helpers";

/*
 * Indicações para amigos (migration 0010). A e B viram amigos (seguem um ao
 * outro); os títulos 424 e 129 são só deste arquivo. A limpeza roda antes e
 * depois, para uma rodada que caiu no meio não atrapalhar a próxima.
 */

const FIRST = 424;
const SECOND = 129;
const MARK = `RC-${Date.now()}`;

let B: BrowserContext;
let b: APIRequestContext;
let bId = "";

test.describe.configure({ mode: "serial" });

async function removeFromLibrary(ctx: APIRequestContext, tmdbId: number) {
  const found = await json(await ctx.get(`/api/library?tmdb_id=${tmdbId}&type=movie`));
  if (found?.id) await ctx.delete(`/api/library/${found.id}`);
}

async function sentItems(ctx: APIRequestContext) {
  const data = await json(await ctx.get("/api/recommendations?view=sent"));
  return (data?.items ?? []) as { id: string; media: { tmdb_id: number }; recipient: { username: string }; label: string; can_cancel: boolean }[];
}

async function cleanup(a: APIRequestContext) {
  for (const id of [FIRST, SECOND]) {
    await removeFromLibrary(a, id);
    await removeFromLibrary(b, id);
  }
  for (const item of await sentItems(a)) {
    if (item.media.tmdb_id === FIRST || item.media.tmdb_id === SECOND) await a.delete(`/api/recommendations/${item.id}`);
  }
}

/** Avisos de retorno criados (ou reescritos) a partir de `since` — o sino lista só os 30 mais recentes. */
async function resultsSince(a: APIRequestContext, since: number) {
  const data = await json(await a.get("/api/notifications"));
  return ((data?.notifications ?? []) as { id: string; type: string; message: string; created_at: string; read_at: string | null }[]).filter(
    (n) => n.type === "recommendation_result" && Date.parse(n.created_at) >= since
  );
}

function send(a: APIRequestContext, tmdbId: number, note?: string) {
  return a.post("/api/recommendations", { data: { tmdb_id: tmdbId, media_type: "movie", recipient_ids: [bId], note } });
}

test.beforeAll(async ({ browser, request }) => {
  const { email, password } = credentialsB();
  B = await loginContext(browser, email, password);
  b = B.request;
  await unfollow(b, request);
  await unfollow(request, b);
  await follow(b, request);
  await follow(request, b);
  await cleanup(request);
});

test.afterAll(async ({ request }) => {
  if (b) {
    await cleanup(request);
    await unfollow(b, request);
    await unfollow(request, b);
  }
  await B?.close();
});

test("candidatos: B aparece como amigo de A", async ({ request }) => {
  const nameB = await usernameOf(b);
  const data = await json(await request.get(`/api/recommendations/candidates?tmdb_id=${FIRST}&type=movie`));
  const friend = (data.friends ?? []).find((f: { username: string }) => f.username === nameB);
  expect(friend, "B na lista de amigos").toBeTruthy();
  expect(friend.watched).toBe(false);
  expect(friend.already_sent).toBe(false);
  bId = friend.id;
});

test("A indica 424 para B; segundo envio volta already_sent", async ({ request }) => {
  const first = await send(request, FIRST, `${MARK} veja esse`);
  expect(first.status()).toBe(200);
  expect(await json(first)).toEqual({ sent: [bId], skipped: [] });

  const again = await json(await send(request, FIRST));
  expect(again).toEqual({ sent: [], skipped: [{ id: bId, reason: "already_sent" }] });

  const candidates = await json(await request.get(`/api/recommendations/candidates?tmdb_id=${FIRST}&type=movie`));
  expect(candidates.friends.find((f: { id: string }) => f.id === bId).already_sent).toBe(true);
});

test("envio inválido é recusado", async ({ request }) => {
  expect((await request.post("/api/recommendations", { data: { tmdb_id: FIRST, media_type: "movie", recipient_ids: [] } })).status()).toBe(400);
  const many = Array.from({ length: 21 }, () => bId);
  expect((await request.post("/api/recommendations", { data: { tmdb_id: FIRST, media_type: "movie", recipient_ids: many } })).status()).toBe(400);
  expect((await send(request, FIRST, "x".repeat(141))).status()).toBe(400);
});

test("B vê em Dos amigos com o bilhete e unseen 1", async () => {
  const data = await json(await b.get("/api/recommendations?view=received"));
  const group = (data.groups ?? []).find((g: { media: { tmdb_id: number } }) => g.media.tmdb_id === FIRST);
  expect(group, "424 em Dos amigos").toBeTruthy();
  expect(group.state).toBe("pending");
  expect(group.senders[0].note).toBe(`${MARK} veja esse`);
  const summary = await json(await b.get("/api/recommendations/summary"));
  expect(summary.unseen).toBeGreaterThanOrEqual(1);
  expect(summary.pending).toBeGreaterThanOrEqual(1);
});

test("B põe na Watchlist; A vê 'colocou na Watchlist hoje' numa linha só", async ({ request, page }) => {
  const added = await b.post("/api/library", { data: { media: { id: FIRST, media_type: "movie" }, status: "want" } });
  expect(added.ok()).toBe(true);
  const item = (await sentItems(request)).find((i) => i.media.tmdb_id === FIRST);
  expect(item?.label).toBe("colocou na Watchlist");
  expect((item as { state?: string } | undefined)?.state).toBe("saved");
  expect(item?.can_cancel).toBe(false);
  await page.goto("/for-you?view=enviadas");
  await expect(page.locator(".rc-row-meta").filter({ hasText: "colocou na Watchlist hoje" }).first()).toBeVisible({ timeout: 60_000 });
});

test("B marca como visto com nota 8; A recebe um aviso; trocar a nota depois não reabre o aviso", async ({ request }) => {
  const since = Date.now() - 2000;
  expect(await resultsSince(request, since)).toHaveLength(0);
  const found = await json(await b.get(`/api/library?tmdb_id=${FIRST}&type=movie`));
  expect((await b.patch(`/api/library/${found.id}`, { data: { status: "watched", personal_rating: 8 } })).ok()).toBe(true);
  const first = await resultsSince(request, since);
  expect(first).toHaveLength(1);
  expect(first[0].message).toMatch(/que você indicou/);
  expect((await request.patch("/api/notifications", { data: { id: (first[0] as { id?: string }).id } })).ok()).toBe(true);

  expect((await b.patch(`/api/library/${found.id}`, { data: { personal_rating: 9 } })).ok()).toBe(true);
  const afterRating = (await resultsSince(request, since)) as { read_at?: string | null }[];
  expect(afterRating).toHaveLength(1);
  expect(afterRating[0].read_at, "trocar a nota não deixa o aviso não lido de novo").toBeTruthy();

  const item = (await sentItems(request)).find((i) => i.media.tmdb_id === FIRST);
  expect(item?.label).toMatch(/^assistiu/);
  const sent = await json(await request.get("/api/recommendations?view=sent"));
  expect(sent.faro.rated).toBeGreaterThanOrEqual(0);
});

test("B dispensa 129 depois de receber; A vê 'ainda não viu'", async ({ request }) => {
  expect(await json(await send(request, SECOND))).toEqual({ sent: [bId], skipped: [] });
  const received = await json(await b.get("/api/recommendations?view=received"));
  const group = received.groups.find((g: { media: { tmdb_id: number } }) => g.media.tmdb_id === SECOND);
  expect((await b.post("/api/recommendations/dismiss", { data: { media_id: group.media.id } })).status()).toBe(204);

  const after = await json(await b.get("/api/recommendations?view=received"));
  expect(after.groups.some((g: { media: { tmdb_id: number } }) => g.media.tmdb_id === SECOND)).toBe(false);
  const item = (await sentItems(request)).find((i) => i.media.tmdb_id === SECOND);
  expect(item?.label).toBe("ainda não viu");
  expect(item?.can_cancel).toBe(true);
});

test("A cancela uma indicação pendente; B não a vê mais; B não consegue cancelar a de A (404)", async ({ request }) => {
  const item = (await sentItems(request)).find((i) => i.media.tmdb_id === SECOND);
  expect(item).toBeTruthy();
  expect((await b.delete(`/api/recommendations/${item!.id}`)).status()).toBe(404);
  expect((await request.delete(`/api/recommendations/${item!.id}`)).status()).toBe(204);
  expect((await sentItems(request)).some((i) => i.media.tmdb_id === SECOND)).toBe(false);

  const watchedItem = (await sentItems(request)).find((i) => i.media.tmdb_id === FIRST);
  expect((await request.delete(`/api/recommendations/${watchedItem!.id}`)).status()).toBe(404);
});

test("sem amizade o envio volta not_friend", async ({ request }) => {
  await unfollow(b, request);
  try {
    expect(await json(await send(request, SECOND))).toEqual({ sent: [], skipped: [{ id: bId, reason: "not_friend" }] });
  } finally {
    await follow(b, request);
  }
});

test("painel: amigo que já viu aparece apagado e o envio confirma", async ({ page, request }) => {
  const nameB = await usernameOf(b);

  // 424: B já viu (teste anterior) — aparece apagado, com o motivo.
  await page.goto(`/title/movie/${FIRST}`);
  await page.locator(".tt-actions").getByRole("button", { name: "Indicar" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { level: 2 })).toContainText("Indicar");
  const watchedBox = dialog.getByRole("checkbox", { name: new RegExp(nameB) });
  await expect(watchedBox).toBeDisabled();
  await expect(dialog.getByText("já viu")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);

  // 129: pode indicar; o toast confirma e o painel fecha.
  await page.goto(`/title/movie/${SECOND}`);
  await page.locator(".tt-actions").getByRole("button", { name: "Indicar" }).click();
  const send = page.getByRole("dialog");
  const box = send.getByRole("checkbox", { name: new RegExp(nameB) });
  await expect(box).toBeEnabled();
  await expect(send.getByRole("button", { name: "Enviar indicação" })).toBeDisabled();
  await box.check();
  await send.getByLabel("Bilhete (opcional)").fill(`${MARK} pelo painel`);
  await send.getByRole("button", { name: "Enviar indicação" }).click();
  await expect(page.getByText(/Indicado para/)).toBeVisible();
  await expect(send).toHaveCount(0);

  const item = (await sentItems(request)).find((i) => i.media.tmdb_id === SECOND);
  expect(item?.recipient.username).toBe(nameB);
});

test("Dos amigos lista o bilhete e as ações", async () => {
  const page = await B.newPage();
  await page.goto("/for-you?view=amigos");
  await expect(page.getByRole("link", { name: "Dos amigos" })).toHaveAttribute("aria-current", "page");
  const row = page.locator(".rc-row", { hasText: `${MARK} pelo painel` });
  await expect(row).toBeVisible();
  await expect(row.getByRole("button", { name: "Pôr na Watchlist" })).toBeVisible();
  await expect(row.getByRole("button", { name: "Já vi" })).toBeVisible();
  await expect(row.getByRole("button", { name: "Dispensar" })).toBeVisible();
  // Abrir a visão marca as indicações como vistas.
  await expect.poll(async () => (await json(await b.get("/api/recommendations/summary"))).unseen).toBe(0);
  await page.close();
});

test("Que você indicou mostra o faro", async ({ page, request }) => {
  const sent = await json(await request.get("/api/recommendations?view=sent"));
  await page.goto("/for-you?view=enviadas");
  await expect(page.getByRole("link", { name: "Que você indicou" })).toHaveAttribute("aria-current", "page");
  await expect(page.locator(".rc-row").first()).toBeVisible();
  if (sent.faro.label) await expect(page.locator(".rc-faro")).toContainText(sent.faro.label);
  const pending = page.locator(".rc-row", { hasText: "ainda não viu" }).first();
  await expect(pending.getByRole("button", { name: "Cancelar indicação" })).toBeVisible();
});

test("visões vazias têm convite", async ({ page }) => {
  // A conta A nunca recebe indicações neste arquivo.
  await page.goto("/for-you?view=amigos");
  await expect(page.getByText("Quando um amigo te indicar algo, aparece aqui.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Descobrir" }).last()).toBeVisible();
});

test("barra mostra número de indicações novas", async ({ request }) => {
  // Um envio novo: cancela o de 129 (ainda pendente) e manda de novo.
  const old = (await sentItems(request)).find((i) => i.media.tmdb_id === SECOND);
  if (old) expect((await request.delete(`/api/recommendations/${old.id}`)).status()).toBe(204);
  expect(await json(await send(request, SECOND, `${MARK} de novo`))).toEqual({ sent: [bId], skipped: [] });

  const page = await B.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const count = page.locator('.mc-appbar-link[href="/for-you"] .mc-appbar-count');
  await expect(count).toBeVisible();
  await expect(page.locator('.mc-appbar-link[href="/for-you"]')).toHaveAttribute("aria-label", /Para você, \d+ indicaç/);

  await page.goto("/for-you?view=amigos");
  await expect(page.locator(".rc-row").first()).toBeVisible();
  await expect(count).toHaveCount(0);
  await page.close();
});

test("Início mostra Indicados pelos amigos quando há pendentes", async () => {
  const summary = await json(await b.get("/api/recommendations/summary"));
  expect(summary.pending).toBeGreaterThan(0);
  const page = await B.newPage();
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Indicados pelos amigos" })).toBeVisible({ timeout: 20000 });
  await page.close();
});

test("preferência desligada: B não recebe aviso de indicação", async ({ request }) => {
  const current = await json(await b.get("/api/profile/notifications"));
  try {
    expect((await b.put("/api/profile/notifications", { data: { ...current, recommendation_site: false } })).ok()).toBe(true);
    expect((await json(await b.get("/api/profile/notifications"))).recommendation_site).toBe(false);

    const old = (await sentItems(request)).find((i) => i.media.tmdb_id === SECOND);
    if (old) expect((await request.delete(`/api/recommendations/${old.id}`)).status()).toBe(204);
    const since = Date.now() - 2000;
    expect(await json(await send(request, SECOND, `${MARK} sem aviso`))).toEqual({ sent: [bId], skipped: [] });

    const data = await json(await b.get("/api/notifications"));
    const fresh = ((data?.notifications ?? []) as { type: string; created_at: string }[]).filter(
      (n) => n.type === "recommendation_received" && Date.parse(n.created_at) >= since
    );
    expect(fresh).toHaveLength(0);
  } finally {
    await b.put("/api/profile/notifications", { data: { ...current, recommendation_site: true } });
  }
});

test("exportar a conta traz indicações enviadas e recebidas", async ({ request }) => {
  const mine = await json(await request.get("/api/account/export"));
  expect(mine.data.recommendations_sent.some((r: { tmdb_id: number }) => r.tmdb_id === SECOND)).toBe(true);
  const theirs = await json(await b.get("/api/account/export"));
  expect(theirs.data.recommendations_received.some((r: { tmdb_id: number }) => r.tmdb_id === SECOND)).toBe(true);
});
