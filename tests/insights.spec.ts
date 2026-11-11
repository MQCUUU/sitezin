import { expect, test, type APIRequestContext } from "@playwright/test";

/*
 * Projeção, Fase 7 — Insights clean. Título exclusivo deste arquivo (550, Clube da Luta),
 * limpo antes e depois: nenhum outro spec usa esse id.
 */

const MEDIA = { id: 550, media_type: "movie" as const };

async function remove(request: APIRequestContext) {
  const found = await request.get(`/api/library?tmdb_id=${MEDIA.id}&type=${MEDIA.media_type}`);
  const item = await found.json();
  if (item?.id) await request.delete(`/api/library/${item.id}`);
}

test.describe("Fase 7 — Insights clean", () => {
  test.afterEach(async ({ request }) => {
    await remove(request);
  });

  test("abre na frase do período, sem painéis, dicas nem índice", async ({ page, request }) => {
    await remove(request);
    const created = await request.post("/api/library", { data: { media: MEDIA, status: "watched" } });
    expect(created.status()).toBe(201);
    const item = await created.json();
    const rated = await request.patch(`/api/library/${item.id}`, { data: { personal_rating: 10 } });
    expect(rated.ok()).toBe(true);

    await page.goto("/insights?period=all");
    await expect(page.locator("h1.ix-title")).toContainText(/\d.* (horas?|minutos?) no total/, { timeout: 60_000 });
    await expect(page.locator(".ix-ficha")).toContainText("filme");
    await expect(page.locator(".ix-ficha")).toContainText("sua média");
    await expect(page.locator(".ins-nav, .ins-panel, .ins-how")).toHaveCount(0);
    await expect(page.locator('.ix-top a[href="/title/movie/550"]').first()).toBeVisible();
  });

  test("filtro Filmes vai para a URL e a ficha não fala de episódios", async ({ page, request }) => {
    await remove(request);
    expect((await request.post("/api/library", { data: { media: MEDIA, status: "watched" } })).status()).toBe(201);

    await page.goto("/insights?period=all");
    await expect(page.locator("h1.ix-title")).toBeVisible({ timeout: 60_000 });
    await page.getByRole("radio", { name: "Filmes" }).click();
    await expect(page).toHaveURL(/type=movie/);
    await expect(page.locator(".ix-ficha")).toContainText("filme", { timeout: 30_000 });
    await expect(page.locator(".ix-ficha")).not.toContainText("episódio");
  });

  test("período sem nada mostra o vazio com ação", async ({ page }) => {
    await page.goto("/insights?period=2001");
    await expect(page.locator("h1.ix-title")).toContainText("Nada assistido em 2001", { timeout: 60_000 });
    await page.getByRole("button", { name: "Ver todo o histórico" }).click();
    await expect(page).toHaveURL(/period=all/);
    await expect(page.locator(".ix-ficha")).toBeVisible({ timeout: 30_000 });
  });

  test("320 px sem rolagem horizontal", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto("/insights?period=all");
    await expect(page.locator("h1.ix-title")).toBeVisible({ timeout: 60_000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});
