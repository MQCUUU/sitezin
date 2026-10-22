// Fase 6 — contrato do cliente HTTP padrão (lib/api-client): node scripts/test-api-client.mjs (ou npm test).
// fetch simulado: o que importa é o contrato (códigos, abort, JSON, retry), não a rede.
import { register } from "node:module";

register(
  "data:text/javascript," +
    encodeURIComponent(
      `export async function resolve(s, c, n) { try { return await n(s, c); } catch (e) { if (s.startsWith(".") && !s.endsWith(".ts")) return n(s + ".ts", c); throw e; } }`
    )
);

const test = (await import("node:test")).default;
const assert = (await import("node:assert/strict")).default;
const { apiFetch, ApiError, isApiError, isAbortError, codeForStatus } = await import("../lib/api-client.ts");

function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
function mockFetch(handler) {
  const calls = [];
  globalThis.fetch = async (input, init = {}) => {
    calls.push({ input, init });
    return handler(calls.length, input, init);
  };
  return calls;
}

test("status → código estável", () => {
  assert.equal(codeForStatus(401), "UNAUTHENTICATED");
  assert.equal(codeForStatus(403), "FORBIDDEN");
  assert.equal(codeForStatus(404), "NOT_FOUND");
  assert.equal(codeForStatus(400), "VALIDATION_ERROR");
  assert.equal(codeForStatus(415), "VALIDATION_ERROR");
  assert.equal(codeForStatus(409), "CONFLICT");
  assert.equal(codeForStatus(429), "RATE_LIMITED");
  assert.equal(codeForStatus(503), "SERVER_ERROR");
  assert.equal(codeForStatus(418), "HTTP_ERROR");
  assert.equal(new ApiError("x", { status: 401 }).code, "UNAUTHENTICATED", "construtor deriva o código (compat. com quem passa só status)");
});

test("json: serializa o corpo e define Content-Type", async () => {
  const calls = mockFetch(() => json(200, { ok: true }));
  const data = await apiFetch("/api/x", { method: "POST", json: { a: 1 } });
  assert.deepEqual(data, { ok: true });
  assert.equal(calls[0].init.body, '{"a":1}');
  assert.equal(calls[0].init.headers["Content-Type"], "application/json");
});

test("erros HTTP viram ApiError com código; 400 usa a frase do servidor", async () => {
  mockFetch(() => json(400, { error: "Dê um nome com pelo menos 2 caracteres." }));
  await assert.rejects(apiFetch("/api/x", { method: "POST" }), (e) => isApiError(e, "VALIDATION_ERROR") && e.message.includes("2 caracteres"));
  mockFetch(() => json(401, { error: "Não autenticado" }));
  await assert.rejects(apiFetch("/api/x", { method: "POST" }), (e) => isApiError(e, "UNAUTHENTICATED") && !e.message.includes("Não autenticado"));
  mockFetch(() => json(429, {}));
  await assert.rejects(apiFetch("/api/x", { method: "POST" }), (e) => isApiError(e, "RATE_LIMITED"));
});

test("GET repete uma vez em 5xx; mutação não repete", async () => {
  let calls = mockFetch((n) => (n === 1 ? json(503, {}) : json(200, { ok: 1 })));
  assert.deepEqual(await apiFetch("/api/x", { retryDelay: 1 }), { ok: 1 });
  assert.equal(calls.length, 2);
  calls = mockFetch(() => json(503, {}));
  await assert.rejects(apiFetch("/api/x", { method: "PATCH", retryDelay: 1 }), (e) => isApiError(e, "SERVER_ERROR"));
  assert.equal(calls.length, 1);
});

test("resposta HTML ou JSON quebrado nunca vira dado", async () => {
  mockFetch(() => new Response("<html>erro</html>", { status: 200, headers: { "content-type": "text/html" } }));
  await assert.rejects(apiFetch("/api/x", { method: "POST" }), (e) => isApiError(e, "INVALID_RESPONSE"));
  mockFetch(() => new Response("{quebrado", { status: 200, headers: { "content-type": "application/json" } }));
  await assert.rejects(apiFetch("/api/x", { method: "POST" }), (e) => isApiError(e, "INVALID_RESPONSE"));
});

test("falha de rede → NETWORK_ERROR (não null)", async () => {
  mockFetch(() => {
    throw new TypeError("fetch failed");
  });
  await assert.rejects(apiFetch("/api/x", { method: "POST" }), (e) => isApiError(e, "NETWORK_ERROR"));
});

test("timeout → TIMEOUT", async () => {
  globalThis.fetch = (_input, init) =>
    new Promise((_resolve, reject) => init.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError"))));
  await assert.rejects(apiFetch("/api/x", { method: "POST", timeout: 20 }), (e) => isApiError(e, "TIMEOUT"));
});

test("abort de quem chama: AbortError, sem retry e sem virar erro de rede", async () => {
  let calls = 0;
  globalThis.fetch = (_input, init) => {
    calls++;
    return new Promise((_resolve, reject) => init.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError"))));
  };
  const controller = new AbortController();
  const pending = apiFetch("/api/x", { signal: controller.signal, retryDelay: 1 });
  controller.abort();
  await assert.rejects(pending, (e) => isAbortError(e) && !(e instanceof ApiError));
  assert.equal(calls, 1);
  await assert.rejects(apiFetch("/api/x", { signal: controller.signal }), (e) => isAbortError(e), "já abortado: nem chama");
  assert.equal(calls, 1);
});

test("204 e corpo vazio → null (sucesso sem conteúdo, não erro)", async () => {
  mockFetch(() => new Response(null, { status: 204 }));
  assert.equal(await apiFetch("/api/x", { method: "DELETE" }), null);
});
