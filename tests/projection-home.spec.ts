import { expect, test, type APIRequestContext } from "@playwright/test";

/*
 * Fase 5 — Projeção no Início logado: com biblioteca, os pôsteres de
 * "Continuar assistindo" e "Na sua fila" projetam o backdrop na faixa.
 * Títulos 27205 e 157336: exclusivos deste arquivo; removidos no fim.
 */

const WATCHING = { id: 27205, media_type: "movie" as const };
const WANT = { id: 157336, media_type: "movie" as const };

async function remove(request: APIRequestContext, media: { id: number; media_type: string }) {
  const found = await request.get(`/api/library?tmdb_id=${media.id}&type=${media.media_type}`);
  const item = await found.json();
  if (item?.id) await request.delete(`/api/library/${item.id}`);
}

test.describe("Fase 5 — Projeção no Início", () => {
  test.afterEach(async ({ request }) => {
    await remove(request, WATCHING);
    await remove(request, WANT);
  });

  test("hover num pôster da fila troca a faixa do destaque e sair desfaz", async ({ page, request }) => {
    await remove(request, WATCHING);
    await remove(request, WANT);
    expect((await request.post("/api/library", { data: { media: WATCHING, status: "watching" } })).status()).toBe(201);
    expect((await request.post("/api/library", { data: { media: WANT, status: "want" } })).status()).toBe(201);

    await page.goto("/");
    const cards = page.locator("[data-projection]");
    await expect(cards.first()).toBeVisible({ timeout: 30_000 });
    // o destaque do Início tem uma faixa; o pôster da fila tem backdrop diferente dele
    await expect(page.locator(".hm-feature .tt-band-screen")).toBeVisible();

    const count = await cards.count();
    let swapped = false;
    for (let i = 0; i < count && !swapped; i++) {
      await cards.nth(i).scrollIntoViewIfNeeded();
      await cards.nth(i).hover();
      await page.waitForTimeout(400);
      swapped = (await page.locator(".tt-band-projection").count()) > 0;
    }
    expect(swapped).toBe(true);
    await expect(page.locator(".tt-band-projection")).toHaveAttribute("data-ready", "true", { timeout: 15_000 });

    await page.mouse.move(2, 2);
    await expect(page.locator(".tt-band-projection")).toHaveAttribute("data-ready", "false", { timeout: 5_000 });
  });
});
