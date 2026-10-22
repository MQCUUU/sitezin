import { randomBytes } from "node:crypto";

import { expect, test } from "@playwright/test";

import { credentialsB, guestContext, json, loginContext } from "./api-helpers";

/*
 * Fase 6 — contratos de endurecimento das APIs, direto na API:
 *  - Origin/Content-Type/tamanho (proxy, lib/api-guard.ts);
 *  - JSON malformado ou vazio → 400, nunca 500;
 *  - DELETE da biblioteca: 200 ao remover, 404 quando não há o que remover;
 *  - importação (formato, versão, tamanho, repetição) e avatar (sem gravar arquivo);
 *  - limite por IP no endpoint público de checagem de @;
 *  - excluir a conta (conta descartável criada e apagada aqui).
 * Títulos 239/240/242 só deste arquivo.
 */

test.describe.configure({ mode: "serial" });

test.describe("Origin e Content-Type nas mutações", () => {
  test("corpo text/plain ou formulário → 415", async ({ request }) => {
    for (const [method, path] of [["POST", "/api/lists"], ["PATCH", "/api/library/x"], ["POST", "/api/watch-history"]] as const) {
      const response = await request.fetch(path, { method, headers: { "Content-Type": "text/plain" }, data: "x" });
      expect(response.status(), `${method} ${path}`).toBe(415);
    }
    const form = await request.post("/api/lists", { headers: { "Content-Type": "application/x-www-form-urlencoded" }, data: "name=x" });
    expect(form.status()).toBe(415);
  });

  test("Origin de outro site → 403; Sec-Fetch-Site cross-site → 403; mesma origem passa", async ({ request, baseURL }) => {
    const evil = await request.post("/api/lists", { headers: { Origin: "https://mal.example" }, data: { name: "x" } });
    expect(evil.status()).toBe(403);
    const crossSite = await request.post("/api/lists", { headers: { "Sec-Fetch-Site": "cross-site" }, data: { name: "x" } });
    expect(crossSite.status()).toBe(403);

    const same = await request.post("/api/lists", { headers: { Origin: new URL(baseURL!).origin }, data: { name: "F6 mesma origem" } });
    expect(same.status()).toBe(201);
    await request.delete(`/api/lists?id=${(await json(same)).id}`);
  });

  test("leitura (GET) nunca é bloqueada por Origin", async ({ request }) => {
    expect((await request.get("/api/lists", { headers: { Origin: "https://mal.example" } })).status()).toBe(200);
  });

  test("JSON malformado ou vazio → 400 (nunca 500)", async ({ request }) => {
    const malformed = await request.post("/api/lists", { headers: { "Content-Type": "application/json" }, data: "{nome:" });
    expect(malformed.status()).toBe(400);
    const empty = await request.post("/api/lists", { headers: { "Content-Type": "application/json" }, data: "" });
    expect(empty.status()).toBe(400);
    const patch = await request.patch("/api/library/00000000-0000-0000-0000-000000000000", { headers: { "Content-Type": "application/json" }, data: "{x" });
    expect([400, 404]).toContain(patch.status());
  });

  test("corpo acima do limite da rota → 413 antes de ler", async ({ request }) => {
    const big = "x".repeat(1024 * 1024 + 10);
    const response = await request.post("/api/lists", { headers: { "Content-Type": "application/json" }, data: JSON.stringify({ name: big }) });
    expect(response.status()).toBe(413);
  });
});

test.describe("DELETE da biblioteca", () => {
  test("remove (200) e, sem nada para remover, 404 — mesmo formato de erro", async ({ request }) => {
    const item = await json(await request.post("/api/library", { data: { media: { id: 242, media_type: "movie" } } }));
    expect((await request.delete(`/api/library/${item.id}`)).status()).toBe(200);
    const again = await request.delete(`/api/library/${item.id}`);
    expect(again.status()).toBe(404);
    expect(typeof (await json(again)).error).toBe("string");
  });
});

test.describe("importação de backup", () => {
  test("arquivo que não é backup, versão errada, malformado, texto → 4xx com motivo", async ({ request }) => {
    const notBackup = await request.post("/api/account/import", { data: { qualquer: true } });
    expect(notBackup.status()).toBe(400);
    expect((await json(notBackup)).error).toMatch(/não é um backup/i);

    const version = await request.post("/api/account/import", { data: { mycatalog_backup: true, version: 99, data: { library: [] } } });
    expect(version.status()).toBe(400);
    expect((await json(version)).error).toMatch(/Versão/);

    const malformed = await request.post("/api/account/import", { headers: { "Content-Type": "application/json" }, data: "{quebrado" });
    expect(malformed.status()).toBe(400);

    const asText = await request.post("/api/account/import", { headers: { "Content-Type": "text/plain" }, data: "{}" });
    expect(asText.status()).toBe(415);
  });

  test("acima de 12 MB → 413", async ({ request }) => {
    const huge = await request.post("/api/account/import", {
      headers: { "Content-Type": "application/json" },
      data: JSON.stringify({ mycatalog_backup: true, version: 2, pad: "x".repeat(12 * 1024 * 1024 + 100) }),
    });
    expect(huge.status()).toBe(413);
  });

  test("importar o mesmo backup 2× não duplica (conta B, título 240)", async ({ browser }) => {
    const { email, password } = credentialsB();
    const B = await loginContext(browser, email, password);
    const backup = { mycatalog_backup: true, version: 2, data: { library: [{ media: { tmdb_id: 240, media_type: "movie" }, status: "want" }] } };
    try {
      const first = await json(await B.request.post("/api/account/import", { data: backup }));
      const second = await json(await B.request.post("/api/account/import", { data: backup }));
      expect(first.restored).toBeTruthy();
      expect(second.restored.library_added || 0).toBe(0);
      const lookup = await json(await B.request.get("/api/library?tmdb_id=240&type=movie"));
      expect(lookup?.id).toBeTruthy();
      await B.request.delete(`/api/library/${lookup.id}`);
    } finally {
      await B.close();
    }
  });
});

test.describe("avatar (sem gravar arquivo no armazenamento)", () => {
  test("sem sessão → 401", async ({ browser }) => {
    const guest = await guestContext(browser);
    const response = await guest.request.post("/api/profile/avatar", { multipart: { avatar: { name: "a.png", mimeType: "image/png", buffer: Buffer.from("x") } } });
    expect(response.status()).toBe(401);
    await guest.close();
  });

  test("bytes que não são imagem, tipo não permitido ou grande demais → recusado", async ({ request }) => {
    const fake = await request.post("/api/profile/avatar", {
      multipart: { avatar: { name: "a.png", mimeType: "image/png", buffer: Buffer.from("isto não é um png de verdade") } },
    });
    expect(fake.status()).toBe(400);

    const svg = await request.post("/api/profile/avatar", {
      multipart: { avatar: { name: "a.svg", mimeType: "image/svg+xml", buffer: Buffer.from("<svg/>") } },
    });
    expect(svg.status()).toBe(400);

    const big = await request.post("/api/profile/avatar", {
      multipart: { avatar: { name: "a.png", mimeType: "image/png", buffer: randomBytes(6 * 1024 * 1024 + 10) } },
    });
    expect([400, 413]).toContain(big.status());
  });
});

test.describe("limite por IP em endpoint público", () => {
  test("checagem de @: 30 por minuto; o 31º → 429 com Retry-After", async ({ browser }) => {
    const guest = await guestContext(browser);
    const ip = `198.51.100.${Math.floor(Math.random() * 200) + 20}`; // balde próprio do teste
    let last = 0;
    let retryAfter: string | undefined;
    for (let i = 0; i < 31; i++) {
      const response = await guest.request.get(`/api/auth/username?username=f6_limite_${i}`, { headers: { "x-forwarded-for": ip } });
      last = response.status();
      retryAfter = response.headers()["retry-after"];
    }
    expect(last).toBe(429);
    expect(Number(retryAfter)).toBeGreaterThan(0);
    await guest.close();
  });
});

test.describe("excluir a conta", () => {
  test("sem sessão → 401; dono: apaga conta, sessão e dados (conta descartável)", async ({ browser }) => {
    const guest = await guestContext(browser);
    expect((await guest.request.delete("/api/account/delete")).status()).toBe(401);
    await guest.close();

    const domain = process.env.E2E_SIGNUP_DOMAIN;
    test.skip(!domain, "E2E_SIGNUP_DOMAIN não definida");
    const tag = randomBytes(4).toString("hex");
    const email = `mycatalog-f6-del-${tag}@${domain}`;
    const password = `Cc1!${randomBytes(12).toString("hex")}`;
    const username = `f6_del_${tag}`;

    const context = await guestContext(browser);
    const page = await context.newPage();
    await page.goto("/signup");
    await page.locator('input[autocomplete="name"]').fill("Conta descartável F6");
    await page.locator('input[autocomplete="username"]').fill(username);
    await page.locator('input[type="email"]').fill(email);
    const pwd = page.locator('input[autocomplete="new-password"]');
    await pwd.nth(0).fill(password);
    if ((await pwd.count()) > 1) await pwd.nth(1).fill(password);
    await page.getByRole("button", { name: "Criar minha conta" }).click();
    await expect.poll(async () => (await context.request.get("/api/profile/showcase")).status(), { timeout: 20_000 }).toBe(200);

    const item = await json(await context.request.post("/api/library", { data: { media: { id: 239, media_type: "movie" } } }));
    expect(item.id).toBeTruthy();

    const deleted = await context.request.delete("/api/account/delete");
    expect(deleted.status()).toBe(200);
    // A sessão morre junto (neon_auth.session em cascata) e o perfil público some.
    expect((await context.request.get("/api/library")).status()).toBe(401);
    expect((await context.request.get(`/api/public-profile/${username}`)).status()).toBe(404);
    await context.close();
  });
});
