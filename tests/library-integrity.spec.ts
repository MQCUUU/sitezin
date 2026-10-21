import { expect, test, type APIRequestContext } from "@playwright/test";

/*
 * Fase 0 — P0-01: "Adicionar à biblioteca" nunca apaga dados.
 *
 * Semântica real do endpoint (sessão + banco de TESTE) e da página do título
 * quando a leitura do estado falha. Usa um título só deste arquivo (603 = Matrix)
 * para não interferir com critical-flow.spec.ts (157336).
 */

const MEDIA = { id: 603, media_type: "movie" as const };
const TITLE_URL = `/title/movie/${MEDIA.id}`;
const LOOKUP = `**/api/library?tmdb_id=${MEDIA.id}&type=movie*`;
const REVIEW = "Resenha da regressão P0-01 — não pode sumir.";

/** O que a tela enviava quando achava (por engano) que o título não estava na biblioteca. */
const TITLE_DEFAULTS = { status: "want", favorite: false, personal_rating: null, review: "" };
/** O que os cards (Discover / Busca / Para você / PickForMe) enviam. */
const CARD_DEFAULTS = { status: "want", favorite: false };

type Item = {
  id: string;
  status: string;
  favorite: boolean;
  personal_rating: number | string | null;
  review: string | null;
  created?: boolean;
};

async function call(request: APIRequestContext, method: string, url: string, data?: unknown) {
  const response = await request.fetch(url, {
    method,
    data,
    headers: data === undefined ? undefined : { "Content-Type": "application/json" },
  });
  const body = await response.json().catch(() => null);
  return { status: response.status(), body };
}

async function current(request: APIRequestContext): Promise<Item | null> {
  const { status, body } = await call(request, "GET", `/api/library?tmdb_id=${MEDIA.id}&type=movie`);
  expect(status, JSON.stringify(body)).toBe(200);
  return body;
}

function expectSaved(item: Item | null, expected = { status: "watched", favorite: true, rating: 9, review: REVIEW }) {
  expect(item, "o item continua na biblioteca").not.toBeNull();
  expect(item!.status).toBe(expected.status);
  expect(item!.favorite).toBe(expected.favorite);
  expect(Number(item!.personal_rating)).toBe(expected.rating);
  expect(item!.review).toBe(expected.review);
}

async function removeIfPresent(request: APIRequestContext) {
  const item = await current(request);
  if (item?.id) {
    const removed = await call(request, "DELETE", `/api/library/${item.id}`);
    expect(removed.status).toBe(200);
  }
}

/** Item com status Assistido, curtido, nota 9 e resenha. */
async function seedSaved(request: APIRequestContext): Promise<Item> {
  let item = await current(request);
  if (!item) {
    const created = await call(request, "POST", "/api/library", { media: MEDIA, ...CARD_DEFAULTS });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    item = created.body;
  }
  const patched = await call(request, "PATCH", `/api/library/${item!.id}`, {
    status: "watched",
    favorite: true,
    personal_rating: 9,
    review: REVIEW,
  });
  expect(patched.status, JSON.stringify(patched.body)).toBe(200);
  expectSaved(patched.body);
  return patched.body;
}

test.describe.configure({ mode: "serial" });

test.describe("P0-01 — biblioteca: adicionar nunca apaga dados", () => {
  test.beforeAll(async ({ request }) => {
    await removeIfPresent(request);
  });

  test.afterAll(async ({ request }) => {
    await removeIfPresent(request);
  });

  test("A: título fora da biblioteca é criado (201)", async ({ request }) => {
    const { status, body } = await call(request, "POST", "/api/library", { media: MEDIA, ...TITLE_DEFAULTS });

    expect(status, JSON.stringify(body)).toBe(201);
    expect(body.created).toBe(true);
    expect(body.status).toBe("want");
    expect(body.favorite).toBe(false);
    expect((await current(request))?.id).toBe(body.id);
  });

  test("B: 'Adicionar' de novo com os padrões da tela não apaga status, curtida, nota nem resenha", async ({ request }) => {
    const saved = await seedSaved(request);
    const { status, body } = await call(request, "POST", "/api/library", { media: MEDIA, ...TITLE_DEFAULTS });

    expect(status, JSON.stringify(body)).toBe(200);
    expect(body.created).toBe(false);
    expect(body.id).toBe(saved.id);
    expectSaved(body);
    expectSaved(await current(request));
  });

  test("E: 'Adicionar' dos cards (Discover/Busca) e repetido em sequência não muda nada", async ({ request }) => {
    await seedSaved(request);

    const results = await Promise.all([
      call(request, "POST", "/api/library", { media: MEDIA, ...CARD_DEFAULTS }),
      call(request, "POST", "/api/library", { media: MEDIA, ...CARD_DEFAULTS }),
      call(request, "POST", "/api/library", { media: MEDIA }),
    ]);

    for (const { status, body } of results) {
      expect(status, JSON.stringify(body)).toBe(200);
      expect(body.created).toBe(false);
      expectSaved(body);
    }
    expectSaved(await current(request));
  });

  test("D: PATCH parcial altera só o campo enviado, inclusive em pedidos simultâneos", async ({ request }) => {
    const saved = await seedSaved(request);

    const rating = await call(request, "PATCH", `/api/library/${saved.id}`, { personal_rating: 8.5 });
    expect(rating.status).toBe(200);
    expectSaved(rating.body, { status: "watched", favorite: true, rating: 8.5, review: REVIEW });

    const [unlike, review] = await Promise.all([
      call(request, "PATCH", `/api/library/${saved.id}`, { favorite: false }),
      call(request, "PATCH", `/api/library/${saved.id}`, { review: "Resenha nova" }),
    ]);
    expect(unlike.status).toBe(200);
    expect(review.status).toBe(200);
    expectSaved(await current(request), { status: "watched", favorite: false, rating: 8.5, review: "Resenha nova" });
  });

  test("C: com a leitura do estado falhando, a página não oferece 'Adicionar' e nada é perdido", async ({ page }) => {
    await seedSaved(page.request);

    const posts: string[] = [];
    page.on("request", (request) => {
      if (request.method() === "POST" && new URL(request.url()).pathname === "/api/library") posts.push(request.url());
    });

    for (const failure of ["503", "rede"] as const) {
      await page.route(LOOKUP, (route) =>
        failure === "503"
          ? route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "indisponível" }) })
          : route.abort("failed")
      );
      await page.goto(TITLE_URL);

      await expect(page.getByRole("button", { name: "Tentar de novo" })).toBeVisible();
      await expect(page.getByText("Não foi possível verificar se este título está na sua biblioteca.")).toBeVisible();
      await expect(page.getByRole("button", { name: /Adicionar à biblioteca/ })).toHaveCount(0);
      await expect(page.getByRole("button", { name: /^(Curtir|Curtido)$/ })).toBeDisabled();
      await expect(page.getByLabel("Status na sua biblioteca")).toBeDisabled();

      await page.unroute(LOOKUP);
    }

    // Tentar de novo com a API de volta: o estado real aparece.
    await page.getByRole("button", { name: "Tentar de novo" }).click();
    await expect(page.getByRole("button", { name: /Remover da biblioteca/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Curtido" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByLabel("Status na sua biblioteca")).toHaveValue("watched");

    expect(posts, "nenhum 'Adicionar' foi enviado").toEqual([]);
    expectSaved(await current(page.request));

    // Refresh depois das operações: o estado continua o mesmo.
    await page.reload();
    await expect(page.getByRole("button", { name: /Remover da biblioteca/ })).toBeVisible();
    expectSaved(await current(page.request));
  });

  test("C: enquanto a leitura não termina, 'Adicionar' fica indisponível", async ({ page }) => {
    await removeIfPresent(page.request);

    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    await page.route(LOOKUP, async (route) => {
      await gate;
      await route.continue();
    });

    await page.goto(TITLE_URL);
    const pending = page.getByRole("button", { name: /Verificando biblioteca/ });
    await expect(pending).toBeVisible();
    await expect(pending).toBeDisabled();
    await expect(page.getByRole("button", { name: /^Curtir$/ })).toBeDisabled();

    release();
    await expect(page.getByRole("button", { name: /Adicionar à biblioteca/ })).toBeEnabled();
    await page.unroute(LOOKUP);
  });

  test("A (UI): adicionar pela página do título funciona e sobrevive ao refresh", async ({ page }) => {
    await removeIfPresent(page.request);
    await page.goto(TITLE_URL);

    await page.getByRole("button", { name: /Adicionar à biblioteca/ }).click();
    await expect(page.getByRole("button", { name: /Remover da biblioteca/ })).toBeVisible();

    await page.reload();
    await expect(page.getByRole("button", { name: /Remover da biblioteca/ })).toBeVisible();
    expect((await current(page.request))?.status).toBe("want");
  });
});

