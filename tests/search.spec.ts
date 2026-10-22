import { expect, test, type Page } from "@playwright/test";

/*
 * Fase 2 — busca: relevância das sugestões (P2-04), termo da URL no campo
 * (P2-05), teclado, histórico, corrida de respostas e estado de erro.
 * Usa a API real (TMDB) pelo servidor local.
 */

const options = (page: Page) => page.locator(".universal-search-results [role=option]");

async function openSuggestions(page: Page, query: string) {
  await page.goto("/discover");
  // sugestões guardadas de execuções anteriores não podem mascarar a ordem atual
  await page.evaluate(() => {
    for (const key of Object.keys(sessionStorage)) if (key.startsWith("mycatalog:suggest")) sessionStorage.removeItem(key);
  });
  const box = page.getByRole("combobox").first();
  await box.click();
  await box.fill(query);
  await expect(options(page).first()).toBeVisible({ timeout: 20_000 });
  return box;
}

const optionTitle = async (page: Page, index = 0) => (await options(page).nth(index).innerText()).split("\n")[0];

test.describe("Fase 2 — busca", () => {
  test("'interst': Interestelar é a 1ª sugestão, ↓ a destaca e Enter abre ela; nenhuma empresa em Pessoas", async ({ page }) => {
    const box = await openSuggestions(page, "interst");

    expect(await optionTitle(page)).toBe("Interestelar");
    await expect(page.locator(".universal-search-results")).not.toContainText("Intersect");

    await box.press("ArrowDown");
    const active = await box.getAttribute("aria-activedescendant");
    expect(active).toBeTruthy();
    await expect(page.locator(`[id="${active}"]`)).toContainText("Interestelar");
    await expect(page.locator(`[id="${active}"]`)).toHaveAttribute("aria-selected", "true");

    await box.press("Enter");
    await expect(page).toHaveURL(/\/title\/movie\/157336/);
  });

  test("pessoa exata conhecida vem primeiro ('Christopher Nolan')", async ({ page }) => {
    await openSuggestions(page, "Christopher Nolan");
    const first = options(page).first();
    await expect(first).toContainText("Christopher Nolan");
    // o 1º grupo exibido é Pessoas
    const firstGroup = page.locator(".universal-search-results [role=listbox] > *").first();
    await expect(firstGroup).toContainText("Pessoas");
  });

  test("ordem dos grupos segue a relevância: matrix mostra Títulos antes do personagem Matrix", async ({ page }) => {
    await openSuggestions(page, "matrix");
    const groups = page.locator(".universal-search-results [role=listbox] > *");
    await expect(groups.first()).toContainText("Títulos");
    await expect(page.locator(".universal-search-results [role=listbox]")).toContainText("Personagem");
    expect(await optionTitle(page)).toBe("Matrix");
  });

  test("teclado: ↓↓↑ + Enter abre exatamente o item destacado; digitar mais zera a seleção", async ({ page }) => {
    let box = await openSuggestions(page, "interst");
    await box.press("ArrowDown");
    await box.press("ArrowDown");
    await box.press("ArrowUp");
    const active = await box.getAttribute("aria-activedescendant");
    const highlighted = (await page.locator(`[id="${active}"]`).innerText()).split("\n")[0];
    expect(highlighted).toBe(await optionTitle(page, 0));

    box = await openSuggestions(page, "matr");
    await box.press("ArrowDown");
    await expect(box).toHaveAttribute("aria-activedescendant", /.+/);
    await box.pressSequentially("ix", { delay: 30 });
    await expect(box).not.toHaveAttribute("aria-activedescendant", /.+/);

    await box.press("Escape");
    await expect(box).toHaveAttribute("aria-expanded", "false");
  });

  test("/search?q=matrix abre com 'matrix' no campo e o termo uma vez no topo", async ({ page }) => {
    await page.goto("/search?q=matrix");
    await expect(page.getByRole("combobox").first()).toHaveValue("matrix");
    await expect(page.locator("h1")).toHaveText("Resultados para “matrix”");
    await expect(page.locator(".mc-discover-results-summary")).toHaveText(/^\d+ resultados$/);

    // focar o campo com o termo da URL não mostra "nenhum resultado" nem busca sugestões de novo
    const suggestCalls: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/api/search/suggest")) suggestCalls.push(request.url());
    });
    await page.getByRole("combobox").first().focus();
    await page.waitForTimeout(800);
    expect(suggestCalls).toEqual([]);
    await expect(page.getByText(/^Buscar “matrix”/)).toHaveCount(0);
  });

  test("histórico: buscar matrix → alien → voltar → avançar; campo, título e URL sempre iguais", async ({ page }) => {
    await page.goto("/search?q=matrix");
    const box = page.getByRole("combobox").first();
    await expect(box).toHaveValue("matrix");

    await box.fill("alien");
    await box.press("Escape");
    await box.press("Enter");
    await expect(page).toHaveURL(/\/search\?q=alien$/);
    await expect(box).toHaveValue("alien");
    await expect(page.locator("h1")).toHaveText("Resultados para “alien”");

    await page.goBack();
    await expect(page).toHaveURL(/\/search\?q=matrix$/);
    await expect(box).toHaveValue("matrix");
    await expect(page.locator("h1")).toHaveText("Resultados para “matrix”");

    await page.goForward();
    await expect(page).toHaveURL(/\/search\?q=alien$/);
    await expect(box).toHaveValue("alien");
    await expect(page.locator("h1")).toHaveText("Resultados para “alien”");
  });

  test("corrida: resposta antiga ('mat', lenta) não substitui a nova ('matrix')", async ({ page }) => {
    await page.addInitScript(() => {
      const original = window.fetch;
      window.fetch = async (...args) => {
        const response = await original(...args);
        if (String(args[0]).endsWith("/api/search/suggest?q=mat")) await new Promise((ok) => setTimeout(ok, 2000));
        return response;
      };
    });
    await page.goto("/discover");
    const box = page.getByRole("combobox").first();
    await box.click();
    await box.fill("mat");
    await page.waitForTimeout(450);
    await box.fill("matrix");
    await expect(options(page).first()).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(2500);
    expect((await optionTitle(page)).toLowerCase()).toContain("matrix");
  });

  test("erro da API de sugestões não vira 'nenhum resultado'", async ({ page }) => {
    await page.route("**/api/search/suggest*", (route) => route.fulfill({ status: 503, contentType: "application/json", body: "{}" }));
    await page.goto("/discover");
    const box = page.getByRole("combobox").first();
    await box.click();
    await box.fill("qualquer coisa");
    await expect(page.getByText("Não foi possível buscar agora")).toBeVisible();
    await expect(page.getByText(/Nenhum resultado/)).toHaveCount(0);
  });

  // Fase 6: a página /search completa também diz a causa (antes: sempre "Verifique sua conexão").
  test("/search com 429: 'muitas buscas'; com 503: indisponível — nunca 'conexão'", async ({ page }) => {
    await page.route("**/api/search/advanced*", (route) => route.fulfill({ status: 429, contentType: "application/json", body: '{"error":"x"}' }));
    await page.route("**/api/search?*", (route) => route.fulfill({ status: 429, contentType: "application/json", body: '{"error":"x"}' }));
    await page.goto(`/search?q=f6limite${Date.now()}`);
    await expect(page.getByText("Muitas buscas em pouco tempo.")).toBeVisible();
    await expect(page.getByText(/Verifique sua conexão/)).toHaveCount(0);

    await page.unroute("**/api/search/advanced*");
    await page.unroute("**/api/search?*");
    await page.route("**/api/search/advanced*", (route) => route.fulfill({ status: 503, contentType: "application/json", body: '{"error":"x"}' }));
    await page.route("**/api/search?*", (route) => route.fulfill({ status: 503, contentType: "application/json", body: '{"error":"x"}' }));
    await page.goto(`/search?q=f6indisp${Date.now()}`);
    await expect(page.getByText(/A busca está indisponível no momento/)).toBeVisible();
    await expect(page.getByText(/Verifique sua conexão/)).toHaveCount(0);
  });

  // Fase 5: limite de buscas (429) não é falha de conexão.
  test("429 nas sugestões: 'muitas buscas', nunca 'verifique sua conexão'", async ({ page }) => {
    await page.route("**/api/search/suggest*", (route) => route.fulfill({ status: 429, contentType: "application/json", body: "{}" }));
    await page.goto("/discover");
    const box = page.getByRole("combobox").first();
    await box.click();
    await box.fill("limite de busca");
    await expect(page.getByText("Muitas buscas em pouco tempo")).toBeVisible();
    await expect(page.getByText("Aguarde um momento e tente novamente.")).toBeVisible();
    await expect(page.getByText(/Verifique sua conexão/)).toHaveCount(0);
  });
});
