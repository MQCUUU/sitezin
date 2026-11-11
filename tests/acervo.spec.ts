import { expect, test, type APIRequestContext } from "@playwright/test";

/*
 * Projeção, Fase 6 — Seu acervo. Títulos exclusivos deste arquivo (680 e 13),
 * limpos antes e depois: nenhum outro spec usa esses ids.
 */

const WATCHED = { id: 680, media_type: "movie" as const };
const WANT = { id: 13, media_type: "movie" as const };

async function remove(request: APIRequestContext, media: { id: number; media_type: string }) {
  const found = await request.get(`/api/library?tmdb_id=${media.id}&type=${media.media_type}`);
  const item = await found.json();
  if (item?.id) await request.delete(`/api/library/${item.id}`);
}

test.describe("Fase 6 — acervo", () => {
  test.afterEach(async ({ request }) => {
    await remove(request, WATCHED);
    await remove(request, WANT);
  });

  test("Biblioteca abre com contagem e horas e projeta o pôster em foco", async ({ page, request }) => {
    await remove(request, WATCHED);
    await remove(request, WANT);
    expect((await request.post("/api/library", { data: { media: WATCHED, status: "watched" } })).status()).toBe(201);
    expect((await request.post("/api/library", { data: { media: WANT, status: "want" } })).status()).toBe(201);

    await page.goto("/library");
    await expect(page.locator(".lb-head h1")).toHaveText(/^\d[\d.]* títulos?(, (cerca de \d+ horas?|menos de 1 hora))?$/, { timeout: 30_000 });
    await expect(page.locator(".lb-band .tt-band-screen")).toBeVisible();

    const cards = page.locator("[data-projection]");
    await expect(cards.first()).toBeVisible();
    let swapped = false;
    const count = await cards.count();
    for (let i = 0; i < count && !swapped; i++) {
      await cards.nth(i).scrollIntoViewIfNeeded();
      await cards.nth(i).hover();
      await page.waitForTimeout(400);
      swapped = (await page.locator(".lb-band .tt-band-projection").count()) > 0;
    }
    expect(swapped).toBe(true);
    await expect(page.locator(".lb-band .tt-band-projection")).toHaveAttribute("data-ready", "true", { timeout: 15_000 });
    await page.mouse.move(2, 2);
    await expect(page.locator(".lb-band .tt-band-projection")).toHaveAttribute("data-ready", "false", { timeout: 5_000 });
  });
});

test.describe("Fase 6 — Watchlist", () => {
  test.afterEach(async ({ request }) => {
    await remove(request, WANT);
  });

  test("Watchlist mostra o total com horas e o número como alça", async ({ page, request }) => {
    await remove(request, WANT);
    expect((await request.post("/api/library", { data: { media: WANT, status: "want" } })).status()).toBe(201);

    await page.goto("/watchlist");
    await expect(page.locator(".wl-head-total")).toHaveText(/^\d[\d.]* títulos?(, (cerca de \d+ horas?|menos de 1 hora))?$/, { timeout: 30_000 });
    await expect(page.locator(".wl-grip")).toHaveCount(0);
    await expect(page.locator(".wl-rank").first()).toBeVisible();
  });
});

test.describe("Fase 6 — Listas", () => {
  let listId: string | null = null;

  test.afterEach(async ({ request }) => {
    if (listId) await request.delete(`/api/lists?id=${listId}`);
    listId = null;
  });

  test("Lista abre na Tela do primeiro item e o índice é feito de linhas", async ({ page, request }) => {
    const created = await request.post("/api/lists", { data: { name: "E2E Fase 6" } });
    expect(created.status()).toBe(201);
    listId = (await created.json()).id;
    expect((await request.post("/api/lists/items", { data: { list_id: listId, tmdb_id: 680, media_type: "movie" } })).ok()).toBe(true);

    await page.goto(`/lists/${listId}`);
    await expect(page.locator("h1")).toHaveText("E2E Fase 6", { timeout: 30_000 });
    await expect(page.locator(".lst-band .tt-band-screen img").first()).toBeVisible({ timeout: 30_000 });

    await page.goto("/lists");
    await expect(page.locator(".lst-row-title", { hasText: "E2E Fase 6" })).toBeVisible({ timeout: 30_000 });
  });
});
