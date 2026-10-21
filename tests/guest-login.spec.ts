import { expect, test, type Browser, type Page } from "@playwright/test";

/*
 * Fase 1 — visitante e sessão expirada (projeto "signup": começa deslogado).
 *  - visitante nunca recebe "Não autenticado": a ação convida a entrar;
 *  - a intenção sobrevive ao login e é concluída ao voltar para o título;
 *  - páginas públicas não disparam requisições autenticadas (401);
 *  - sessão revogada vira "Sua sessão expirou", não erro técnico;
 *  - `next` não permite open redirect; erros de login em português.
 * Usa o título 603 (Matrix) da conta E2E, limpo antes e depois de cada teste.
 */

const TITLE_URL = "/title/movie/603";
const LOOKUP = "/api/library?tmdb_id=603&type=movie";

function credentials() {
  const email = process.env.E2E_USER_EMAIL;
  const password = process.env.E2E_USER_PASSWORD;
  if (!email || !password) throw new Error("Defina E2E_USER_EMAIL e E2E_USER_PASSWORD.");
  return { email, password };
}

async function fillLogin(page: Page) {
  const { email, password } = credentials();
  await page.getByLabel("E-mail").fill(email);
  await page.locator('input[autocomplete="current-password"]').fill(password);
  await page.getByRole("button", { name: /^Entrar$/ }).click();
}

/** Contexto logado à parte, só para preparar/limpar dados da conta E2E. */
async function withAccount<T>(browser: Browser, run: (page: Page) => Promise<T>): Promise<T> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/login");
  await fillLogin(page);
  await expect(page).not.toHaveURL(/\/login/);
  try {
    return await run(page);
  } finally {
    await context.close();
  }
}

async function removeMatrix(page: Page) {
  const item = await (await page.request.get(LOOKUP)).json();
  if (item?.id) expect((await page.request.delete(`/api/library/${item.id}`)).status()).toBe(200);
}

function toast(page: Page, title: string | RegExp) {
  return page.locator(".mycatalog-toast").filter({ hasText: title });
}

function track(page: Page) {
  const unauthorized: string[] = [];
  const libraryPosts: string[] = [];
  page.on("response", (response) => {
    if (response.url().includes("/api/") && response.status() === 401) unauthorized.push(response.url());
  });
  page.on("request", (request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname === "/api/library") libraryPosts.push(request.url());
  });
  return { unauthorized, libraryPosts };
}

test.describe.configure({ mode: "serial" });

test.describe("Fase 1 — visitante", () => {
  test.beforeEach(async ({ browser }) => {
    await withAccount(browser, removeMatrix);
  });

  test.afterAll(async ({ browser }) => {
    await withAccount(browser, removeMatrix);
  });

  test("páginas públicas não fazem requisições autenticadas (sem 401)", async ({ page }) => {
    test.setTimeout(120_000);
    const { unauthorized } = track(page);

    for (const path of ["/", "/discover", "/search?q=matrix", TITLE_URL, "/collection/2344"]) {
      await page.goto(path);
      await page.waitForLoadState("load");
      // tempo para a sessão resolver e os efeitos do cliente dispararem
      await page.waitForTimeout(3000);
    }

    expect(unauthorized).toEqual([]);
  });

  test("Curtir como visitante: convida a entrar, preserva a intenção e conclui depois do login", async ({ page }) => {
    const { unauthorized, libraryPosts } = track(page);
    await page.goto(TITLE_URL);

    await page.getByRole("button", { name: "Curtir" }).click();

    const prompt = toast(page, "Entre para salvar");
    await expect(prompt).toBeVisible();
    await expect(prompt).toContainText("curtir “Matrix”");
    await expect(page.getByRole("button", { name: "Curtir" })).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByText(/Não autenticado|Unauthorized|401/)).toHaveCount(0);
    expect(libraryPosts, "visitante não chama a API").toEqual([]);

    await prompt.getByRole("button", { name: "Entrar" }).click();
    await expect(page).toHaveURL(/\/login\?next=%2Ftitle%2Fmovie%2F603&reason=action/);
    await expect(page.getByText("Depois do login, vamos curtir “Matrix”")).toBeVisible();

    await fillLogin(page);
    await expect(page).toHaveURL(new RegExp(`${TITLE_URL}$`));
    await expect(page.getByRole("button", { name: "Curtido" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("button", { name: /Remover da biblioteca/ })).toBeVisible();

    await page.reload();
    await expect(page.getByRole("button", { name: "Curtido" })).toHaveAttribute("aria-pressed", "true");
    const saved = await (await page.request.get(LOOKUP)).json();
    expect(saved).toMatchObject({ favorite: true, status: "want" });
    expect(unauthorized).toEqual([]);

    // Intenção consumida: um novo login não repete a ação.
    expect(await page.evaluate(() => sessionStorage.getItem("mycatalog:pending-action:v1"))).toBeNull();
  });

  test("status como visitante: login conclui e o título fica com o status escolhido", async ({ page }) => {
    await page.goto(TITLE_URL);
    await page.getByLabel("Status na sua biblioteca").selectOption("watched");

    const prompt = toast(page, "Entre para salvar");
    await expect(prompt).toContainText("marcar “Matrix” como Assistido");
    await expect(page.getByLabel("Status na sua biblioteca")).toHaveValue("want");

    await prompt.getByRole("button", { name: "Entrar" }).click();
    await fillLogin(page);

    await expect(page).toHaveURL(new RegExp(`${TITLE_URL}$`));
    await expect(page.getByLabel("Status na sua biblioteca")).toHaveValue("watched");
    expect(await (await page.request.get(LOOKUP)).json()).toMatchObject({ status: "watched", favorite: false });
  });

  test("'+' de card como visitante (Busca): convida a entrar sem chamar a API", async ({ page }) => {
    const { libraryPosts, unauthorized } = track(page);
    await page.goto("/search?q=matrix");

    const card = page.getByRole("group", { name: "Ações para Matrix" }).first();
    await page.locator('a.poster-link[href="/title/movie/603"]').first().hover();
    await card.getByRole("button", { name: "Adicionar Matrix como Quero assistir" }).click();

    await expect(toast(page, "Entre para salvar")).toContainText("adicionar “Matrix” à sua biblioteca");
    expect(libraryPosts).toEqual([]);
    expect(unauthorized).toEqual([]);
  });
});

test.describe("Fase 1 — sessão expirada e login", () => {
  test.afterAll(async ({ browser }) => {
    await withAccount(browser, removeMatrix);
  });

  test("sessão revogada: 'Sua sessão expirou', intenção preservada, conclui depois de entrar de novo", async ({ page, browser }) => {
    await withAccount(browser, removeMatrix);

    await page.goto("/login");
    await fillLogin(page);
    await expect(page).not.toHaveURL(/\/login/);

    // Outro aparelho com a MESMA sessão sai (revoga a sessão no servidor).
    const other = await browser.newContext({ storageState: await page.context().storageState() });
    const otherPage = await other.newPage();
    await otherPage.goto("/");
    expect((await otherPage.request.post("/api/auth/sign-out", { data: {} })).ok()).toBeTruthy();
    await other.close();

    await page.goto(TITLE_URL);
    await expect(page.getByRole("button", { name: "Curtir" })).toBeEnabled();
    await page.getByRole("button", { name: "Curtir" }).click();

    const prompt = toast(page, "Sua sessão expirou");
    await expect(prompt).toBeVisible();
    await expect(page.getByText(/Não autenticado|Unauthorized/)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Curtir" })).toHaveAttribute("aria-pressed", "false");

    await prompt.getByRole("button", { name: "Entrar" }).click();
    await expect(page).toHaveURL(/\/login\?next=%2Ftitle%2Fmovie%2F603&reason=session/);
    await fillLogin(page);

    await expect(page).toHaveURL(new RegExp(`${TITLE_URL}$`));
    await expect(page.getByRole("button", { name: "Curtido" })).toHaveAttribute("aria-pressed", "true");
  });

  test("next não permite open redirect (barra invertida)", async ({ page }) => {
    await page.goto("/login?next=%2F%5Cevil.com");
    await fillLogin(page);
    await expect(page).not.toHaveURL(/\/login/);
    expect(new URL(page.url()).host).toBe(new URL(test.info().project.use.baseURL || "http://localhost:3000").host);
    expect(new URL(page.url()).pathname).toBe("/");
  });

  test("P2-02: senha errada mostra mensagem em português", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("E-mail").fill(credentials().email);
    await page.locator('input[autocomplete="current-password"]').fill("SenhaErrada!123");
    await page.getByRole("button", { name: /^Entrar$/ }).click();
    await expect(page.locator(".auth-error")).toHaveText("E-mail ou senha incorretos.");
  });
});
