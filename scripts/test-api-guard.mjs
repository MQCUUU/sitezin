// Fase 6 — proteção das mutações em /api (lib/api-guard) e remoção idempotente (lib/library/actions):
// node scripts/test-api-guard.mjs (ou npm test). O comportamento ao vivo (proxy + rotas) fica em tests/api-*.spec.ts.
import { register } from "node:module";

register(
  "data:text/javascript," +
    encodeURIComponent(
      `export async function resolve(s, c, n) { try { return await n(s, c); } catch (e) { if (s.startsWith(".") && !s.endsWith(".ts")) return n(s + ".ts", c); throw e; } }`
    )
);

const test = (await import("node:test")).default;
const assert = (await import("node:assert/strict")).default;
const { checkApiMutation, bodyLimitFor, allowedOriginsFromEnv } = await import("../lib/api-guard.ts");
const { removeFromLibrary } = await import("../lib/library/actions.ts");
const { ApiError } = await import("../lib/api-client.ts");

const base = {
  method: "POST",
  pathname: "/api/library",
  origin: "https://catalogmy.vercel.app",
  secFetchSite: "same-origin",
  host: "catalogmy.vercel.app",
  contentType: "application/json",
  contentLength: 40,
  hasBody: true,
  allowedOrigins: [],
};
const check = (patch) => checkApiMutation({ ...base, ...patch });

test("mesma origem com JSON passa; leitura nunca é bloqueada", () => {
  assert.equal(check({}), null);
  assert.equal(check({ method: "GET", origin: "https://mal.example", contentType: "text/plain" }), null);
  assert.equal(check({ method: "OPTIONS", origin: "https://mal.example" }), null);
});

test("Origin de outro site → 403; origem liberada ou URL pública passa", () => {
  assert.deepEqual(check({ origin: "https://mal.example" }), { status: 403, error: "Origem não permitida." });
  assert.equal(check({ origin: "null" })?.status, 403);
  assert.equal(check({ origin: "https://preview-1.vercel.app", allowedOrigins: ["https://preview-1.vercel.app"] }), null);
  assert.equal(check({ origin: "http://localhost:3100", host: "localhost:3100" }), null, "dev/test local");
  assert.equal(check({ origin: "http://localhost:3000", host: "localhost:3100" })?.status, 403, "outra porta = outra origem");
});

test("sem Origin: navegador cross-site → 403; cliente sem navegador passa", () => {
  assert.equal(check({ origin: null, secFetchSite: "cross-site" })?.status, 403);
  assert.equal(check({ origin: null, secFetchSite: null }), null);
  assert.equal(check({ origin: null, secFetchSite: "same-origin" }), null);
});

test("corpo precisa ser JSON ou multipart; sem corpo não exige tipo", () => {
  assert.equal(check({ contentType: "text/plain" })?.status, 415);
  assert.equal(check({ contentType: "application/x-www-form-urlencoded" })?.status, 415);
  assert.equal(check({ contentType: null })?.status, 415);
  assert.equal(check({ contentType: "application/json; charset=utf-8" }), null);
  assert.equal(check({ pathname: "/api/profile/avatar", contentType: "multipart/form-data; boundary=x" }), null);
  assert.equal(check({ method: "DELETE", contentType: null, contentLength: null, hasBody: false }), null, "DELETE sem corpo");
});

test("tamanho: 413 acima do limite da rota", () => {
  assert.equal(bodyLimitFor("/api/library"), 1024 * 1024);
  assert.equal(check({ contentLength: 2 * 1024 * 1024 })?.status, 413);
  assert.equal(check({ pathname: "/api/account/import", contentLength: 9 * 1024 * 1024 }), null);
  assert.equal(check({ pathname: "/api/account/import", contentLength: 13 * 1024 * 1024 })?.status, 413);
});

test("/api/auth/* (Neon Auth) fica de fora — tem a própria checagem", () => {
  assert.equal(check({ pathname: "/api/auth/sign-in/email", origin: "https://mal.example", contentType: "text/plain" }), null);
});

test("origens liberadas por env", () => {
  assert.deepEqual(allowedOriginsFromEnv({ APP_ALLOWED_ORIGINS: " https://a.app , https://b.app", NEXT_PUBLIC_SITE_URL: "https://site.app" }), [
    "https://a.app",
    "https://b.app",
    "https://site.app",
  ]);
  assert.deepEqual(allowedOriginsFromEnv({}), []);
});

test("removeFromLibrary: 404 = já não estava lá (não é erro); o resto sobe", async () => {
  assert.deepEqual(await removeFromLibrary("x", async () => ({ ok: true })), { removed: true });
  assert.deepEqual(
    await removeFromLibrary("x", async () => {
      throw new ApiError("não encontrado", { status: 404 });
    }),
    { removed: false }
  );
  await assert.rejects(
    removeFromLibrary("x", async () => {
      throw new ApiError("sessão", { status: 401 });
    }),
    (e) => e.code === "UNAUTHENTICATED"
  );
});

const { takeToken, resetRateLimits, clientIp } = await import("../lib/rate-limit-core.ts");

test("limite em memória: N dentro da janela, o próximo é barrado com Retry-After; janela nova libera", () => {
  resetRateLimits();
  const t0 = 1_000_000;
  for (let i = 0; i < 3; i++) assert.equal(takeToken("k", 3, 60_000, t0 + i).allowed, true);
  const blocked = takeToken("k", 3, 60_000, t0 + 10);
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterSeconds >= 59 && blocked.retryAfterSeconds <= 60);
  assert.equal(takeToken("outra-chave", 3, 60_000, t0 + 10).allowed, true, "chaves independentes");
  assert.equal(takeToken("k", 3, 60_000, t0 + 60_001).allowed, true, "janela expirada");
});

test("IP do cliente: 1º de x-forwarded-for; depois x-real-ip", () => {
  assert.equal(clientIp(new Request("http://x", { headers: { "x-forwarded-for": "203.0.113.9, 10.0.0.1" } })), "203.0.113.9");
  assert.equal(clientIp(new Request("http://x", { headers: { "x-real-ip": "198.51.100.2" } })), "198.51.100.2");
  assert.equal(clientIp(new Request("http://x")), "desconhecido");
});

const { checkEnv, neonEndpointId } = await import("../lib/env-check.ts");

test("config: Auth e banco no mesmo endpoint Neon; misturados = erro (sem expor valores)", () => {
  const ok = {
    DATABASE_URL: "postgresql://u:p@ep-quiet-lake-a1b2c3-pooler.us-east-2.aws.neon.tech/neondb",
    NEON_AUTH_BASE_URL: "https://ep-quiet-lake-a1b2c3.neonauth.us-east-2.aws.neon.tech/neondb/auth",
    NEON_AUTH_COOKIE_SECRET: "x",
    TMDB_API_KEY: "x",
  };
  assert.equal(neonEndpointId(ok.DATABASE_URL), "ep-quiet-lake");
  assert.deepEqual(checkEnv(ok), []);
  const mixed = checkEnv({ ...ok, NEON_AUTH_BASE_URL: "https://ep-wild-sun-9z.neonauth.us-east-2.aws.neon.tech/neondb/auth" });
  assert.equal(mixed.length, 1);
  assert.equal(mixed[0].level, "error");
  assert.ok(!mixed[0].message.includes("ep-"), "mensagem não carrega ids/URLs");
  assert.deepEqual(checkEnv({}).map((i) => i.message.split(" ")[0]), ["DATABASE_URL", "NEON_AUTH_BASE_URL", "NEON_AUTH_COOKIE_SECRET", "TMDB_API_KEY"]);
});
