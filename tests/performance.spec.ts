import { expect, test, type Page } from "@playwright/test";

/*
 * Fase 4 — performance: comportamentos medidos na build de produção que não
 * podem voltar a regredir. Usa a série 1418 (só deste arquivo).
 *   - P3-11: a temporada é buscada uma vez, mesmo com o item da biblioteca
 *     chegando depois (antes: /api/tv/{id}/season/1 2×).
 *   - P2-06: o módulo grande do PickForMe só é baixado ao clicar.
 *   - P3-06: /stats e /profile redirecionam (307) antes de renderizar.
 */

const TV = 1418;
const PICK_MODULE_TEXT = "Como combinar os gêneros"; // só existe no PickForMe completo

function countRequests(page: Page, match: (url: string) => boolean) {
  const seen: string[] = [];
  page.on("request", (request) => {
    if (match(request.url())) seen.push(`${request.method()} ${new URL(request.url()).pathname}`);
  });
  return seen;
}

test.describe("temporada sem busca duplicada", () => {
  let createdId: string | null = null;

  test.beforeAll(async ({ request }) => {
    const lookup = await request.get(`/api/library?tmdb_id=${TV}&type=tv`);
    const existing = lookup.ok() ? await lookup.json() : null;
    if (existing?.id) return;
    const response = await request.post("/api/library", { data: { media: { id: TV, media_type: "tv" } } });
    expect(response.ok()).toBeTruthy();
    createdId = (await response.json()).id;
  });

  test.afterAll(async ({ request }) => {
    if (createdId) await request.delete(`/api/library/${createdId}`);
  });

  test("logado com o título na biblioteca: temporada e progresso uma vez cada", async ({ page }) => {
    const seasons = countRequests(page, (url) => url.includes(`/api/tv/${TV}/season/`));
    const progress = countRequests(page, (url) => url.includes("/api/episodes?"));

    await page.goto(`/title/tv/${TV}`);
    await expect(page.getByLabel("Selecionar temporada")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: /Marcar episódio como assistido|Desmarcar episódio/ }).first()).toBeVisible();
    await page.waitForLoadState("networkidle");

    expect(seasons).toEqual([`GET /api/tv/${TV}/season/1`]);
    expect(progress).toHaveLength(1);

    seasons.length = 0;
    await page.getByLabel("Selecionar temporada").selectOption("2");
    await expect.poll(() => seasons.length).toBe(1);
    await page.waitForLoadState("networkidle");
    expect(seasons).toEqual([`GET /api/tv/${TV}/season/2`]);
  });
});

test("PickForMe: módulo completo só é baixado ao clicar", async ({ page }) => {
  let pickLoaded = false;
  page.on("response", async (response) => {
    if (!/\/_next\/static\/.*\.js/.test(response.url())) return;
    const body = await response.text().catch(() => "");
    if (body.includes(PICK_MODULE_TEXT)) pickLoaded = true;
  });

  await page.goto("/discover");
  const trigger = page.getByRole("button", { name: "Escolha pra mim" });
  await expect(trigger).toBeVisible({ timeout: 20_000 });
  await page.waitForLoadState("networkidle");
  expect(pickLoaded).toBe(false);

  await trigger.click();
  await expect(page.locator(".pick-modal[role=dialog]")).toBeVisible({ timeout: 15_000 });
  expect(pickLoaded).toBe(true);

  await page.keyboard.press("Escape");
  await expect(page.locator(".pick-modal[role=dialog]")).toBeHidden();
  await trigger.click();
  await expect(page.locator(".pick-modal[role=dialog]")).toBeVisible();
});

test.describe("redirects antes da renderização", () => {
  test("logado: /stats → /insights e /profile → perfil público (307)", async ({ request }) => {
    const stats = await request.get("/stats", { maxRedirects: 0 });
    expect(stats.status()).toBe(307);
    expect(stats.headers().location).toContain("/insights");

    const profile = await request.get("/profile", { maxRedirects: 0 });
    expect(profile.status()).toBe(307);
    expect(profile.headers().location).toMatch(/\/u\/[^/]+$/);
    expect(profile.headers()["cache-control"]).toContain("no-store");
  });

  test("visitante: /profile → login com retorno", async ({ browser, baseURL }) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const response = await context.request.get(`${baseURL}/profile`, { maxRedirects: 0 });
    expect([307, 308]).toContain(response.status());
    expect(response.headers().location).toContain("/login");
    expect(response.headers().location).toContain("next=%2Fprofile");
    await context.close();
  });
});
