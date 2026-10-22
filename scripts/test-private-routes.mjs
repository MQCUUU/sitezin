// Fase 7 — lista única de rotas privadas (lib/private-routes), usada por proxy, SessionSync e robots.
// node scripts/test-private-routes.mjs (ou npm test).
const test = (await import("node:test")).default;
const assert = (await import("node:assert/strict")).default;
const { isPrivatePath, PRIVATE_ROUTES } = await import("../lib/private-routes.ts");

test("páginas pessoais são privadas, inclusive subcaminhos", () => {
  for (const path of ["/library", "/library/x", "/settings", "/settings/conta", "/for-you", "/insights", "/stats", "/profile"]) {
    assert.equal(isPrivatePath(path), true, path);
  }
});

test("/lists é privada só na página exata; a lista pública individual não", () => {
  assert.equal(isPrivatePath("/lists"), true);
  assert.equal(isPrivatePath("/lists/123e4567-e89b-12d3-a456-426614174000"), false);
});

test("prefixo parecido não conta (/libraryx, /settingsfoo) e páginas públicas ficam públicas", () => {
  for (const path of ["/libraryx", "/settingsfoo", "/", "/discover", "/title/movie/27205", "/u/alguem", "/login", "/search"]) {
    assert.equal(isPrivatePath(path), false, path);
  }
});

test("a lista tem as 12 áreas pessoais conhecidas", () => {
  assert.equal(PRIVATE_ROUTES.length, 12);
});
