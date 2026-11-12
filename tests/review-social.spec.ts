import { expect, test, type APIRequestContext, type BrowserContext } from "@playwright/test";

import { credentialsB, guestContext, json, loginContext, RANDOM_UUID } from "./api-helpers";
import { follow, unfollow } from "./social-helpers";

/*
 * Curtidas e comentários em avaliações (migration 0009). A conta A avalia o título
 * 389 (só deste arquivo); B segue A e curte/comenta. Recurso alheio ou inexistente
 * responde 404, como no resto da API.
 */

const MOVIE = 389;
const MARK = `RS-${Date.now()}`;

let B: BrowserContext;
let b: APIRequestContext;
let reviewId = "";

test.describe.configure({ mode: "serial" });

async function removeA(request: APIRequestContext) {
  const found = await json(await request.get(`/api/library?tmdb_id=${MOVIE}&type=movie`));
  if (found?.id) await request.delete(`/api/library/${found.id}`);
}

test.beforeAll(async ({ browser, request }) => {
  const { email, password } = credentialsB();
  B = await loginContext(browser, email, password);
  b = B.request;

  await removeA(request);
  const item = await json(await request.post("/api/library", { data: { media: { id: MOVIE, media_type: "movie" }, status: "watched" } }));
  reviewId = item.id;
  expect(reviewId).toBeTruthy();
  const patched = await request.patch(`/api/library/${reviewId}`, { data: { status: "watched", personal_rating: 8, review: `${MARK} resenha` } });
  expect(patched.ok()).toBe(true);

  await follow(b, request);
});

test.afterAll(async ({ request }) => {
  await removeA(request);
  if (b) await unfollow(b, request);
  await B?.close();
});

test("lista do título traz id e contagens", async () => {
  const data = await json(await b.get(`/api/reviews/community?type=movie&tmdb_id=${MOVIE}`));
  const mine = (data.items ?? []).find((item: { id?: string }) => item.id === reviewId);
  expect(mine, "avaliação de A na lista vista por B").toBeTruthy();
  expect(mine.like_count).toBe(0);
  expect(mine.comment_count).toBe(0);
  expect(mine.liked_by_viewer).toBe(false);
});

test("B curte, curtir de novo não duplica, descurtir volta", async () => {
  expect(await json(await b.post(`/api/reviews/${reviewId}/like`))).toEqual({ liked: true, like_count: 1 });
  expect(await json(await b.post(`/api/reviews/${reviewId}/like`))).toEqual({ liked: true, like_count: 1 });
  expect(await json(await b.delete(`/api/reviews/${reviewId}/like`))).toEqual({ liked: false, like_count: 0 });
  expect(await json(await b.delete(`/api/reviews/${reviewId}/like`))).toEqual({ liked: false, like_count: 0 });
});

test("A não curte a própria avaliação", async ({ request }) => {
  expect((await request.post(`/api/reviews/${reviewId}/like`)).status()).toBe(404);
  const review = await json(await request.get(`/api/reviews/${reviewId}`));
  expect(review.can_like).toBe(false);
  expect(review.is_owner).toBe(true);
});

test("aviso de curtida chega agrupado para A", async ({ request }) => {
  await b.post(`/api/reviews/${reviewId}/like`);
  const notifications = await json(await request.get("/api/notifications"));
  const list = notifications?.items ?? notifications?.notifications ?? notifications;
  const like = (Array.isArray(list) ? list : []).find(
    (n: { type?: string; href?: string }) => n.type === "review_like" && n.href === `/review/${reviewId}`
  );
  expect(like, "aviso review_like").toBeTruthy();
  expect(like.message).toMatch(/curtiu sua avaliação de /);
  await b.delete(`/api/reviews/${reviewId}/like`);
});

test("B comenta e A vê; vazio é recusado; a lista do título não traz o texto", async ({ request }) => {
  expect((await b.post(`/api/reviews/${reviewId}/comments`, { data: { body: "   " } })).status()).toBe(400);
  const created = await b.post(`/api/reviews/${reviewId}/comments`, { data: { body: `${MARK} bom` } });
  expect(created.status()).toBe(201);

  const comments = await json(await request.get(`/api/reviews/${reviewId}/comments`));
  expect(comments.items.map((c: { body: string }) => c.body)).toContain(`${MARK} bom`);
  expect((await json(await request.get(`/api/reviews/${reviewId}`))).comment_count).toBe(1);

  const list = await b.get(`/api/reviews/community?type=movie&tmdb_id=${MOVIE}`);
  expect(await list.text()).not.toContain(`${MARK} bom`);
});

test("A apaga o comentário de B", async ({ request }) => {
  const comments = await json(await request.get(`/api/reviews/${reviewId}/comments`));
  const target = comments.items.find((c: { body: string }) => c.body === `${MARK} bom`);
  expect(target.can_delete).toBe(true);
  expect((await request.delete(`/api/reviews/${reviewId}/comments/${target.id}`)).status()).toBe(204);
  expect((await json(await request.get(`/api/reviews/${reviewId}`))).comment_count).toBe(0);
});

test("cursor dos comentários: a página seguinte começa depois do último, sem repetir; cursor ruim não quebra", async ({ request }) => {
  const first = await json(await b.post(`/api/reviews/${reviewId}/comments`, { data: { body: `${MARK} c1` } }));
  const second = await json(await b.post(`/api/reviews/${reviewId}/comments`, { data: { body: `${MARK} c2` } }));
  try {
    const after = await json(await request.get(`/api/reviews/${reviewId}/comments?cursor=${encodeURIComponent(first.id)}`));
    expect(after.items.map((c: { id: string }) => c.id)).toEqual([second.id]);
    for (const bad of ["2026-01-01T00:00:00Z|nao-uuid", "nao-uuid", RANDOM_UUID]) {
      const response = await request.get(`/api/reviews/${reviewId}/comments?cursor=${encodeURIComponent(bad)}`);
      expect(response.status(), `cursor ${bad}`).toBeLessThan(500);
    }
  } finally {
    await b.delete(`/api/reviews/${reviewId}/comments/${first.id}`);
    await b.delete(`/api/reviews/${reviewId}/comments/${second.id}`);
  }
});

test("respostas: um nível, 'respondendo a', curtida no comentário e apagar com respostas", async ({ request }) => {
  const bName = (await json(await b.get("/api/profile/username"))).username;
  const aName = (await json(await request.get("/api/profile/username"))).username;
  const notices = async (ctx: APIRequestContext, type: string) => {
    const data = await json(await ctx.get("/api/notifications"));
    const list = data?.items ?? data?.notifications ?? data;
    return (Array.isArray(list) ? list : []).filter((n: { type?: string; href?: string }) => n.type === type && n.href === `/review/${reviewId}`);
  };

  const c1 = await json(await b.post(`/api/reviews/${reviewId}/comments`, { data: { body: `${MARK} raiz` } }));
  const r1res = await request.post(`/api/reviews/${reviewId}/comments`, { data: { body: `${MARK} resposta A`, reply_to: c1.id } });
  expect(r1res.status()).toBe(201);
  const r1 = await json(r1res);
  expect(r1.parent_id).toBe(c1.id);
  expect(r1.reply_to?.username).toBe(bName);

  // Responder a uma resposta fica no mesmo nível e marca quem foi respondido.
  const r2 = await json(await b.post(`/api/reviews/${reviewId}/comments`, { data: { body: `${MARK} resposta B`, reply_to: r1.id } }));
  expect(r2.parent_id).toBe(c1.id);
  expect(r2.reply_to?.username).toBe(aName);

  // reply_to de outra avaliação ou inexistente: 404.
  expect((await b.post(`/api/reviews/${reviewId}/comments`, { data: { body: "x", reply_to: RANDOM_UUID } })).status()).toBe(404);

  try {
    const list = await json(await request.get(`/api/reviews/${reviewId}/comments`));
    const root = list.items.find((c: { id: string }) => c.id === c1.id);
    expect(root.replies.map((r: { id: string }) => r.id)).toEqual([r1.id, r2.id]);
    expect(list.items.map((c: { id: string }) => c.id)).not.toContain(r1.id);

    expect((await notices(b, "review_comment_reply")).length).toBeGreaterThanOrEqual(1);

    // Curtir comentário: idempotente; o autor não curte o próprio; aviso para o autor.
    expect(await json(await b.post(`/api/reviews/${reviewId}/comments/${r1.id}/like`))).toEqual({ liked: true, like_count: 1 });
    expect(await json(await b.post(`/api/reviews/${reviewId}/comments/${r1.id}/like`))).toEqual({ liked: true, like_count: 1 });
    expect((await request.post(`/api/reviews/${reviewId}/comments/${r1.id}/like`)).status()).toBe(404);
    expect((await notices(request, "review_comment_like")).length).toBeGreaterThanOrEqual(1);
    const liked = (await json(await b.get(`/api/reviews/${reviewId}/comments`))).items.find((c: { id: string }) => c.id === c1.id).replies[0];
    expect(liked.like_count).toBe(1);
    expect(liked.liked_by_viewer).toBe(true);
    expect(await json(await b.delete(`/api/reviews/${reviewId}/comments/${r1.id}/like`))).toEqual({ liked: false, like_count: 0 });

    // Apagar o comentário de cima com respostas: vira "apagado" e as respostas ficam.
    const before = (await json(await request.get(`/api/reviews/${reviewId}`))).comment_count;
    expect((await request.delete(`/api/reviews/${reviewId}/comments/${c1.id}`)).status()).toBe(204);
    const after = await json(await request.get(`/api/reviews/${reviewId}/comments`));
    const ghost = after.items.find((c: { id: string }) => c.id === c1.id);
    expect(ghost.deleted).toBe(true);
    expect(ghost.body).toBe("");
    expect(ghost.replies).toHaveLength(2);
    expect((await json(await request.get(`/api/reviews/${reviewId}`))).comment_count).toBe(before - 1);

    // Sem respostas, o apagado some de vez.
    await request.delete(`/api/reviews/${reviewId}/comments/${r1.id}`);
    await b.delete(`/api/reviews/${reviewId}/comments/${r2.id}`);
    const gone = await json(await request.get(`/api/reviews/${reviewId}/comments`));
    expect(gone.items.map((c: { id: string }) => c.id)).not.toContain(c1.id);
  } finally {
    await request.delete(`/api/reviews/${reviewId}/comments/${r2.id}`);
    await request.delete(`/api/reviews/${reviewId}/comments/${r1.id}`);
    await request.delete(`/api/reviews/${reviewId}/comments/${c1.id}`);
  }
});

test("na página: responder um comentário mostra a resposta recuada com 'Respondendo a' e dá para curtir", async ({ request }) => {
  const aName = (await json(await request.get("/api/profile/username"))).username;
  const root = await json(await request.post(`/api/reviews/${reviewId}/comments`, { data: { body: `${MARK} pergunta do dono` } }));
  const page = await B.newPage();
  try {
    await page.goto(`/review/${reviewId}`);
    const thread = page.locator(".rv-comment").filter({ hasText: `${MARK} pergunta do dono` });
    await expect(thread).toBeVisible({ timeout: 60_000 });

    await thread.getByRole("button", { name: /Curtir comentário/ }).first().click();
    await expect(thread.locator(".rv-c-like").first()).toHaveAttribute("aria-pressed", "true");

    await thread.getByRole("button", { name: "Responder" }).first().click();
    await thread.getByRole("textbox").fill(`${MARK} resposta pela tela`);
    await thread.getByRole("button", { name: "Responder" }).last().click();

    const reply = thread.locator(".rv-replies .rv-c").filter({ hasText: `${MARK} resposta pela tela` });
    await expect(reply).toBeVisible();
    await expect(reply.locator(".rv-replying")).toHaveText(`Respondendo a @${aName}`);

    if (process.env.SHOT_DIR) {
      await thread.scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${process.env.SHOT_DIR}/thread-1280.png` });
      await page.setViewportSize({ width: 375, height: 812 });
      await thread.scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${process.env.SHOT_DIR}/thread-375.png` });
    }
  } finally {
    await page.close();
    const list = await json(await request.get(`/api/reviews/${reviewId}/comments`));
    const found = list.items.find((c: { id: string }) => c.id === root.id);
    for (const r of found?.replies ?? []) await request.delete(`/api/reviews/${reviewId}/comments/${r.id}`);
    await request.delete(`/api/reviews/${reviewId}/comments/${root.id}`);
  }
});

test("id inexistente e malformado dão 404", async () => {
  expect((await b.get(`/api/reviews/${RANDOM_UUID}`)).status()).toBe(404);
  expect((await b.get(`/api/reviews/abc`)).status()).toBe(404);
  expect((await b.post(`/api/reviews/${RANDOM_UUID}/like`)).status()).toBe(404);
});

test("página da avaliação mostra comentários e deixa comentar", async ({ browser }) => {
  const page = await B.newPage();
  await page.goto(`/review/${reviewId}`);
  // Cabeçalho da avaliação: pôster → título, "Avaliação de" quem escreveu, título no h1.
  await expect(page.locator(".rv-byline")).toContainText("Avaliação de");
  await expect(page.locator(".rv-poster")).toHaveAttribute("href", `/title/movie/${MOVIE}`);
  await expect(page.getByRole("heading", { level: 1 }).locator("a")).toHaveAttribute("href", `/title/movie/${MOVIE}`);
  await expect(page.locator(".rv-band")).toHaveCount(0);

  const body = `${MARK} pela página`;
  await page.getByLabel("Escreva um comentário").fill(body);
  await page.getByRole("button", { name: "Comentar" }).click();
  await expect(page.locator(".rv-comments")).toContainText(body);
  await page.close();

  const guest = await guestContext(browser);
  const guestPage = await guest.newPage();
  // A página segue a mesma regra da API: perfil aberto mostra "Entre para comentar";
  // perfil fechado (como pode ser o da conta E2E) dá 404 para visitante.
  const apiStatus = (await guest.request.get(`/api/reviews/${reviewId}`)).status();
  // (Com streaming o status HTTP pode sair 200; vale o conteúdo da tela 404.)
  await guestPage.goto(`/review/${reviewId}`);
  if (apiStatus === 200) {
    await expect(guestPage.getByRole("link", { name: "Entre para comentar" })).toBeVisible();
  } else {
    expect(apiStatus).toBe(404);
    await expect(guestPage.getByText("404").first()).toBeVisible();
    await expect(guestPage.locator(".rv-page")).toHaveCount(0);
    await expect(guestPage.getByText(body)).toHaveCount(0);
  }
  await guest.close();
});

test("desligar aviso de comentário impede o aviso", async ({ request }) => {
  const current = await json(await request.get("/api/profile/notifications"));
  const commentNotices = async () => {
    const data = await json(await request.get("/api/notifications"));
    const list = data?.items ?? data?.notifications ?? data;
    return (Array.isArray(list) ? list : []).filter(
      (n: { type?: string; href?: string }) => n.type === "review_comment" && n.href === `/review/${reviewId}`
    ).length;
  };

  try {
    expect((await request.put("/api/profile/notifications", { data: { ...current, review_comment_site: false } })).ok()).toBe(true);
    expect((await json(await request.get("/api/profile/notifications"))).review_comment_site).toBe(false);
    const before = await commentNotices();
    expect((await b.post(`/api/reviews/${reviewId}/comments`, { data: { body: `${MARK} silencioso` } })).status()).toBe(201);
    expect(await commentNotices()).toBe(before);
  } finally {
    await request.put("/api/profile/notifications", { data: { ...current, review_comment_site: true } });
  }
  expect((await json(await request.get("/api/profile/notifications"))).review_comment_site).toBe(true);
});

test("exportar a conta traz comentários e curtidas", async ({ request }) => {
  const mine = await json(await request.get("/api/account/export"));
  expect(Array.isArray(mine.data?.review_comments)).toBe(true);
  expect(Array.isArray(mine.data?.review_likes)).toBe(true);

  const theirs = await json(await b.get("/api/account/export"));
  const bodies = theirs.data.review_comments.map((c: { body: string }) => c.body);
  expect(bodies).toContain(`${MARK} silencioso`);
});
