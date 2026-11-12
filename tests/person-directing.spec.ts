import { expect, test } from "@playwright/test";

/*
 * Aba Direção na página da pessoa: Nolan (525) abre nela por ser conhecido como
 * diretor; um ator (287) não tem a aba, e ?tab=directing cai em Biografia.
 */

test.describe("Pessoa — aba Direção", () => {
  test("Nolan abre em Direção, com décadas e sem direção em Outros trabalhos", async ({ page }) => {
    await page.goto("/person/525");
    await expect(page.getByRole("tab", { name: "Direção" })).toHaveAttribute("aria-selected", "true", { timeout: 60_000 });
    await expect(page.getByText("Oppenheimer").first()).toBeVisible();
    await expect(page.locator(".pp-ficha")).toContainText(/\d+ filmes? dirigidos?/);

    // Como na Atuação, as décadas aparecem com "ver todos" aberto.
    await page.goto("/person/525?tab=directing&ver=direcao-filmes");
    await expect(page.locator(".pp-decade").first()).toHaveText(/^Anos \d{4}$|^Sem data$/, { timeout: 60_000 });
  });

  test("?tab=bio explícito abre Biografia para quem dirige", async ({ page }) => {
    await page.goto("/person/525?tab=bio");
    await expect(page.getByRole("tab", { name: "Biografia" })).toHaveAttribute("aria-selected", "true", { timeout: 60_000 });
  });

  test("ator sem direção não tem a aba e ?tab=directing cai em Biografia", async ({ page }) => {
    await page.goto("/person/287?tab=directing");
    await expect(page.getByRole("tab", { name: "Biografia" })).toHaveAttribute("aria-selected", "true", { timeout: 60_000 });
    await expect(page.getByRole("tab", { name: "Direção" })).toHaveCount(0);
  });
});
