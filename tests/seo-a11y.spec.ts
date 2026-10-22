import { expect, test, type APIRequestContext, type Browser } from "@playwright/test";

/*
 * Fase 5 — o que crawler/compartilhador/navegador sem JS recebem (HTML cru +
 * status) e os achados de acessibilidade corrigidos (DOM renderizado).
 *
 * SEO: requisições diretas, SEM sessão (contexto novo) — é o que o WhatsApp,
 * o Discord e o Google veem. Lista pública/privada criada aqui e apagada no fim.
 */

const MOVIE_FOR_REVIEW = 680; // só deste arquivo
const SECRET = "F5-SEGREDO-NAO-VAZAR";

function meta(html: string, attr: "name" | "property", key: string): string | null {
  const match = html.match(new RegExp(`<meta[^>]+${attr}="${key.replace(/[:]/g, "\\$&")}"[^>]*content="([^"]*)"`));
  return match ? match[1] : null;
}
const titleOf = (html: string) => html.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? null;

async function guestGet(browser: Browser, baseURL: string | undefined, path: string) {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const response = await context.request.get(`${baseURL}${path}`, { maxRedirects: 0 });
  const html = await response.text();
  await context.close();
  return { status: response.status(), html };
}

async function createList(request: APIRequestContext, isPublic: boolean) {
  const response = await request.post("/api/lists", {
    data: {
      name: isPublic ? "F5 Lista pública E2E" : `${SECRET} nome`,
      description: isPublic ? "Ficção científica para o fim de semana." : `${SECRET} descrição`,
      is_public: isPublic,
    },
  });
  expect(response.ok()).toBeTruthy();
  const { id } = await response.json();
  await request.post("/api/lists/items", { data: { list_id: id, tmdb_id: 603, media_type: "movie" } });
  return id as string;
}

test.describe("SEO e compartilhamento (HTML de produção, sem sessão)", () => {
  const lists: string[] = [];
  let publicId = "";
  let privateId = "";

  test.beforeAll(async ({ request }) => {
    publicId = await createList(request, true);
    privateId = await createList(request, false);
    lists.push(publicId, privateId);
  });

  test.afterAll(async ({ request }) => {
    for (const id of lists) await request.delete(`/api/lists?id=${id}`);
  });

  test("lista pública: título, descrição, imagem, URL e canonical próprios", async ({ browser, baseURL }) => {
    const { status, html } = await guestGet(browser, baseURL, `/lists/${publicId}`);
    expect(status).toBe(200);
    expect(titleOf(html)).toContain("F5 Lista pública E2E");
    expect(meta(html, "property", "og:title")).toBe("F5 Lista pública E2E");
    expect(meta(html, "property", "og:description")).toBe("Ficção científica para o fim de semana.");
    expect(meta(html, "property", "og:image")).toMatch(/^https:\/\/image\.tmdb\.org\//);
    expect(meta(html, "property", "og:url")).toMatch(new RegExp(`/lists/${publicId}$`));
    expect(html).toMatch(new RegExp(`<link rel="canonical" href="[^"]*/lists/${publicId}"`));
    expect(meta(html, "name", "robots")).toContain("noindex");
  });

  test("lista privada: visitante recebe 404 e nada da lista no HTML", async ({ browser, baseURL }) => {
    const { status, html } = await guestGet(browser, baseURL, `/lists/${privateId}`);
    expect(status).toBe(404);
    expect(html).not.toContain(SECRET);
  });

  test("lista privada: o dono abre (200) e a metadata não carrega o nome", async ({ request }) => {
    const response = await request.get(`/lists/${privateId}`);
    expect(response.status()).toBe(200);
    const html = await response.text();
    expect(titleOf(html)).toContain("Lista privada");
    expect(meta(html, "property", "og:title")).not.toContain(SECRET);
    expect(html.slice(0, html.indexOf("</head>"))).not.toContain(SECRET);
  });

  test("episódio: título com série/temporada/episódio, og:image e canonical; continua noindex", async ({ browser, baseURL }) => {
    const { status, html } = await guestGet(browser, baseURL, "/title/tv/1399/season/1/episode/1");
    expect(status).toBe(200);
    expect(titleOf(html)).toMatch(/^T1:E01 — .+ \| Game of Thrones/);
    expect(meta(html, "property", "og:type")).toBe("video.episode");
    expect(meta(html, "property", "og:image")).toMatch(/^https:\/\/image\.tmdb\.org\//);
    expect(meta(html, "property", "og:url")).toMatch(/\/title\/tv\/1399\/season\/1\/episode\/1$/);
    expect(meta(html, "name", "robots")).toContain("noindex");
  });

  test("pessoa: nome, descrição, foto e canonical; continua noindex", async ({ browser, baseURL }) => {
    const { status, html } = await guestGet(browser, baseURL, "/person/6193");
    expect(status).toBe(200);
    expect(titleOf(html)).toContain("Leonardo DiCaprio");
    expect(meta(html, "property", "og:title")).toBe("Leonardo DiCaprio");
    expect(meta(html, "property", "og:description")?.length).toBeGreaterThan(20);
    expect(meta(html, "property", "og:image")).toMatch(/^https:\/\/image\.tmdb\.org\//);
    expect(meta(html, "name", "robots")).toContain("noindex");
  });

  test("perfil: metadata só com dados públicos (conta E2E é privada: sem bio, noindex)", async ({ browser, baseURL, request }) => {
    const me = await (await request.get("/profile", { maxRedirects: 0 })).headers().location;
    const username = String(me).split("/u/")[1];
    expect(username).toBeTruthy();
    const { status, html } = await guestGet(browser, baseURL, `/u/${username}`);
    expect(status).toBe(200);
    expect(meta(html, "property", "og:title")).toContain(`@${username}`);
    expect(meta(html, "property", "og:image")).toBeTruthy();
    if (meta(html, "name", "robots")?.includes("noindex")) {
      expect(meta(html, "property", "og:description")).toBe("Este perfil é privado.");
    }
  });

  test("título continua como estava: SSR, canonical, OG e JSON-LD", async ({ browser, baseURL }) => {
    const { status, html } = await guestGet(browser, baseURL, "/title/movie/603");
    expect(status).toBe(200);
    expect(titleOf(html)).toMatch(/^Matrix \(1999\)/);
    expect(meta(html, "name", "robots")).toBe("index, follow");
    expect(html).toMatch(/<link rel="canonical" href="[^"]*\/title\/movie\/603"/);
    expect(meta(html, "property", "og:image")).toBeTruthy();
    expect(html).toContain('"@type":"Movie"');
  });

  for (const path of [
    "/title/movie/999999999",
    "/title/xyz/603",
    "/title/tv/1399/season/1/episode/999",
    "/person/999999999",
    "/u/nao_existe_f5_e2e",
    "/lists/00000000-0000-0000-0000-000000000000",
    "/lists/nao-e-uuid",
  ]) {
    test(`inexistente → 404 real: ${path}`, async ({ browser, baseURL }) => {
      const { status, html } = await guestGet(browser, baseURL, path);
      expect(status).toBe(404);
      expect(html).toContain("Essa página não existe");
    });
  }
});

test.describe("acessibilidade (DOM renderizado)", () => {
  let createdId: string | null = null;

  test.beforeAll(async ({ request }) => {
    const lookup = await request.get(`/api/library?tmdb_id=${MOVIE_FOR_REVIEW}&type=movie`);
    const existing = lookup.ok() ? await lookup.json() : null;
    if (existing?.id) return;
    const response = await request.post("/api/library", { data: { media: { id: MOVIE_FOR_REVIEW, media_type: "movie" } } });
    createdId = (await response.json()).id;
  });

  test.afterAll(async ({ request }) => {
    if (createdId) await request.delete(`/api/library/${createdId}`);
  });

  test("assistente: o campo tem nome (título visível) e descrição", async ({ page }) => {
    await page.goto("/assistant");
    const box = page.getByRole("textbox", { name: "O que você quer assistir?" });
    await expect(box).toBeVisible();
    await expect(box).toHaveAccessibleDescription(/Enter para enviar/);
  });

  test("avaliação: nota e opinião com nome acessível", async ({ page }) => {
    await page.goto(`/title/movie/${MOVIE_FOR_REVIEW}`);
    await page.getByRole("tab", { name: "Avaliações e resenhas" }).click();
    await expect(page.getByRole("spinbutton", { name: "Sua nota, de 0 a 10" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Minha opinião" })).toBeVisible();
  });

  test("episódios: cada botão diz qual episódio (nomes únicos)", async ({ page, request }) => {
    const lookup = await request.get("/api/library?tmdb_id=1399&type=tv");
    let created: string | null = null;
    if (!(lookup.ok() && (await lookup.json())?.id)) {
      created = (await (await request.post("/api/library", { data: { media: { id: 1399, media_type: "tv" } } })).json()).id;
    }
    try {
      await page.goto("/title/tv/1399");
      const first = page.getByRole("button", { name: /^Marcar episódio 1 da temporada 1 como (não )?assistido$/ });
      await expect(first).toBeVisible({ timeout: 20_000 });
      const names = await page.locator(".episode-check").evaluateAll((els) => els.map((el) => el.getAttribute("aria-label")));
      expect(names.length).toBeGreaterThan(3);
      expect(new Set(names).size).toBe(names.length);
    } finally {
      if (created) await request.delete(`/api/library/${created}`);
    }
  });

  for (const path of ["/for-you", "/u/__me__"]) {
    test(`um único <main>: ${path}`, async ({ page, request }) => {
      let target = path;
      if (path === "/u/__me__") target = String((await request.get("/profile", { maxRedirects: 0 })).headers().location).replace(/^https?:\/\/[^/]+/, "");
      await page.goto(target);
      await page.waitForLoadState("networkidle");
      await expect(page.locator("main")).toHaveCount(1);
      await expect(page.getByRole("main")).toHaveCount(1);
    });
  }
});
