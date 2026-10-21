import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

/*
 * Fase 1 — P1-05: status e Curtir de um título fora da biblioteca ADICIONAM o
 * título e gravam a escolha (sem rascunho invisível), sem reabrir o P0-01:
 * num item existente só o campo pedido muda. Inclui cliques rápidos, clique
 * duplo, falha do servidor (rollback) e 401 (sessão expirada).
 * Título 604 (Matrix Reloaded): exclusivo deste arquivo.
 */

const MEDIA = { id: 604, media_type: "movie" as const };
const TITLE_URL = `/title/movie/${MEDIA.id}`;
const LOOKUP = `/api/library?tmdb_id=${MEDIA.id}&type=movie`;
const REVIEW = "Resenha da Fase 1 — não pode sumir.";

async function current(request: APIRequestContext) {
  const response = await request.get(LOOKUP);
  expect(response.status()).toBe(200);
  return response.json();
}

async function removeIfPresent(request: APIRequestContext) {
  const item = await current(request);
  if (item?.id) expect((await request.delete(`/api/library/${item.id}`)).status()).toBe(200);
}

/** Item existente: Quero assistir, sem curtida, nota 9 e resenha. */
async function seedRated(request: APIRequestContext) {
  await removeIfPresent(request);
  const created = await request.post("/api/library", { data: { media: MEDIA, status: "want" } });
  expect(created.status()).toBe(201);
  const item = await created.json();
  const patched = await request.patch(`/api/library/${item.id}`, { data: { personal_rating: 9, review: REVIEW } });
  expect(patched.status()).toBe(200);
}

async function openTitle(page: Page) {
  await page.goto(TITLE_URL);
  await expect(page.getByRole("button", { name: /Adicionar à biblioteca|Remover da biblioteca/ })).toBeEnabled();
}

/** Espera a fila de mutações esvaziar: o servidor chega ao estado esperado. */
async function settle(request: APIRequestContext, expected: Record<string, unknown>) {
  await expect.poll(async () => {
    const item = await current(request);
    return item && Object.fromEntries(Object.keys(expected).map((key) => [key, key === "personal_rating" ? Number(item[key]) : item[key]]));
  }, { timeout: 15_000 }).toEqual(expected);
}

test.describe.configure({ mode: "serial" });

test.describe("Fase 1 — status e Curtir persistentes", () => {
  test.beforeEach(async ({ request }) => {
    await removeIfPresent(request);
  });

  test.afterAll(async ({ request }) => {
    await removeIfPresent(request);
  });

  test("status num título fora da biblioteca: adiciona e grava (sobrevive ao refresh)", async ({ page }) => {
    await openTitle(page);
    await page.getByLabel("Status na sua biblioteca").selectOption("watched");

    await expect(page.getByRole("button", { name: /Remover da biblioteca/ })).toBeVisible();
    await settle(page.request, { status: "watched", favorite: false });

    await page.reload();
    await expect(page.getByLabel("Status na sua biblioteca")).toHaveValue("watched");
  });

  test("Curtir num título fora da biblioteca: adiciona curtido (sobrevive ao refresh)", async ({ page }) => {
    await openTitle(page);
    await page.getByRole("button", { name: "Curtir" }).click();

    await expect(page.getByRole("button", { name: "Curtido" })).toHaveAttribute("aria-pressed", "true");
    await settle(page.request, { favorite: true, status: "want" });

    await page.reload();
    await expect(page.getByRole("button", { name: "Curtido" })).toHaveAttribute("aria-pressed", "true");
  });

  test("P0: item com nota e resenha — Curtir e status mudam SÓ o próprio campo", async ({ page }) => {
    await seedRated(page.request);
    await openTitle(page);

    await page.getByRole("button", { name: "Curtir" }).click();
    await settle(page.request, { favorite: true, status: "want", personal_rating: 9, review: REVIEW });

    await page.getByLabel("Status na sua biblioteca").selectOption("watching");
    await settle(page.request, { favorite: true, status: "watching", personal_rating: 9, review: REVIEW });
  });

  test("cliques rápidos num título novo: status + Curtir + status — vence o mais recente, nada se perde", async ({ page }) => {
    await openTitle(page);
    const select = page.getByLabel("Status na sua biblioteca");

    await select.selectOption("watched");
    await page.getByRole("button", { name: /^(Curtir|Curtido)$/ }).click();
    await select.selectOption("paused");

    await settle(page.request, { status: "paused", favorite: true });
    await page.reload();
    await expect(select).toHaveValue("paused");
    await expect(page.getByRole("button", { name: "Curtido" })).toHaveAttribute("aria-pressed", "true");
  });

  test("clique duplo em Curtir num item existente: tela e servidor terminam iguais, nota/resenha intactas", async ({ page }) => {
    await seedRated(page.request);
    await openTitle(page);

    await page.getByRole("button", { name: /^(Curtir|Curtido)$/ }).dblclick();
    await page.waitForTimeout(2500);

    const item = await current(page.request);
    const pressed = await page.getByRole("button", { name: /^(Curtir|Curtido)$/ }).getAttribute("aria-pressed");
    expect(String(item.favorite)).toBe(pressed);
    expect(Number(item.personal_rating)).toBe(9);
    expect(item.review).toBe(REVIEW);
  });

  test("falha do servidor ao curtir título novo: a tela volta ao estado anterior e avisa", async ({ page }) => {
    await openTitle(page);
    await page.route("**/api/library", (route) =>
      route.request().method() === "POST"
        ? route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "indisponível" }) })
        : route.continue()
    );

    await page.getByRole("button", { name: "Curtir" }).click();

    await expect(page.locator(".mycatalog-toast").filter({ hasText: "Não foi possível salvar" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Curtir" })).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByRole("button", { name: /Adicionar à biblioteca/ })).toBeVisible();
    expect(await current(page.request)).toBeNull();
  });

  test("401 numa mutação com sessão aparente: 'Sua sessão expirou', nunca 'Não autenticado'", async ({ page }) => {
    await openTitle(page);
    await page.route("**/api/library", (route) =>
      route.request().method() === "POST"
        ? route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: "Não autenticado" }) })
        : route.continue()
    );

    await page.getByLabel("Status na sua biblioteca").selectOption("watched");

    const prompt = page.locator(".mycatalog-toast").filter({ hasText: "Sua sessão expirou" });
    await expect(prompt).toBeVisible();
    await expect(prompt).toContainText("marcar");
    await expect(page.getByText("Não autenticado")).toHaveCount(0);
    await expect(page.getByLabel("Status na sua biblioteca")).toHaveValue("want");
  });
});
