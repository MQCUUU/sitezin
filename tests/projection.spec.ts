import { expect, test } from "@playwright/test";

/*
 * Fase 5 — Projeção: passar o mouse (ou focar) num pôster de Descobrir troca a
 * imagem da faixa; sair volta ao título padrão; sem movimento reduzido a
 * troca é só opacity. Usa a API real (TMDB) pelo servidor local.
 */

const cards = "[data-projection]";

test.describe("Fase 5 — Projeção em Descobrir", () => {
  test("hover num pôster projeta o backdrop dele na faixa e sair desfaz", async ({ page }) => {
    await page.goto("/discover");
    const first = page.locator(cards).first();
    await expect(first).toBeVisible({ timeout: 30_000 });
    // o 2º pôster com backdrop diferente do padrão (o padrão é o do 1º)
    const second = page.locator(cards).nth(2);
    const wanted = await second.getAttribute("data-projection");
    expect(wanted).toBeTruthy();

    const layer = page.locator(".tt-band-projection");
    await expect(layer).toHaveCount(0);

    await second.hover();
    await expect(layer).toHaveCount(1, { timeout: 5_000 });
    await expect(layer).toHaveAttribute("src", new RegExp(wanted!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    await expect(layer).toHaveAttribute("data-ready", "true", { timeout: 15_000 });

    await page.mouse.move(2, 2);
    await expect(layer).toHaveAttribute("data-ready", "false", { timeout: 5_000 });
  });

  test("varrer vários pôsteres rápido não pede uma imagem por pôster", async ({ page }) => {
    await page.goto("/discover");
    await expect(page.locator(cards).first()).toBeVisible({ timeout: 30_000 });
    const requests: string[] = [];
    page.on("request", (request) => {
      if (/image\.tmdb\.org\/t\/p\/w780/.test(request.url())) requests.push(request.url());
    });
    const count = Math.min(8, await page.locator(cards).count());
    // mouse.move direto (sem a espera de actionability do hover): ~30 ms por pôster
    for (let i = 0; i < count; i++) {
      const box = await page.locator(cards).nth(i).boundingBox();
      if (!box) continue;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 3);
      await page.waitForTimeout(30);
    }
    await page.waitForTimeout(600);
    expect(requests.length).toBeLessThanOrEqual(2);
  });

  test("com movimento reduzido a camada entra sem transição e sem RoomLight", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/discover");
    await expect(page.locator(cards).first()).toBeVisible({ timeout: 30_000 });
    await page.locator(cards).nth(2).hover();
    const layer = page.locator(".tt-band-projection");
    await expect(layer).toHaveCount(1, { timeout: 5_000 });
    await expect(layer).toHaveCSS("transition-duration", /^(0s|1e-05s)$/);
    await expect(page.locator(".pj-room")).toBeHidden();
  });
});
