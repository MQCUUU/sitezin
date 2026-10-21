// Fase 1 — visitante, sessão expirada e ações de biblioteca: node scripts/test-auth-intent.mjs (ou npm test).
// O comportamento real (sessão + banco de teste + navegador) fica em tests/guest-and-session.spec.ts.
import { register } from "node:module";

register(
  "data:text/javascript," +
    encodeURIComponent(
      `export async function resolve(s, c, n) { try { return await n(s, c); } catch (e) { if (s.startsWith(".") && !s.endsWith(".ts")) return n(s + ".ts", c); throw e; } }`
    )
);

const test = (await import("node:test")).default;
const assert = (await import("node:assert/strict")).default;
const { safeNextPath } = await import("../lib/safe-next.ts");
const pending = await import("../lib/auth/pending-action.ts");
const { runLibraryAction, createMutationQueue } = await import("../lib/library/actions.ts");
const { ApiError } = await import("../lib/api-client.ts");
const { authErrorMessage } = await import("../lib/auth-client.ts");

const BACKSLASH = String.fromCharCode(92);

/* ---------------------------------------------------------------- next seguro */

test("next: só caminhos internos; bloqueia open redirect (inclusive /\\evil.com)", () => {
  assert.equal(safeNextPath("/title/movie/603"), "/title/movie/603");
  assert.equal(safeNextPath("/search?q=matrix#top"), "/search?q=matrix#top");
  assert.equal(safeNextPath(encodeURIComponent("/title/tv/1399?tab=cast")), "/title/tv/1399?tab=cast");

  for (const bad of [
    "https://evil.com",
    "//evil.com",
    `/${BACKSLASH}evil.com`,
    `/${BACKSLASH}/evil.com`,
    "/%5Cevil.com",
    "javascript:alert(1)",
    "evil.com",
    "/login",
    "/login?next=/x",
    "/signup",
    "/x\u0000y",
    "%E0%A4%A",
    null,
    "",
  ]) {
    assert.equal(safeNextPath(bad), "/", String(bad));
  }
  assert.equal(safeNextPath("/library-x"), "/library-x");
  assert.equal(safeNextPath("/loginx"), "/loginx", "só /login exato ou com / ? #");
});

/* ---------------------------------------------------------------- intenção */

function memoryStore() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k), map };
}

const CURTIR = { kind: "favorite", media_type: "movie", tmdb_id: 603, title: "Matrix" };

test("intenção: só ações conhecidas da biblioteca, com formato válido", () => {
  assert.deepEqual(pending.parseIntent(CURTIR), CURTIR);
  assert.deepEqual(pending.parseIntent({ kind: "status", status: "watched", media_type: "tv", tmdb_id: "1399" }), {
    kind: "status",
    status: "watched",
    media_type: "tv",
    tmdb_id: 1399,
  });
  for (const bad of [
    { kind: "delete", media_type: "movie", tmdb_id: 1 },
    { kind: "remove", media_type: "movie", tmdb_id: 1 },
    { kind: "status", status: "hacked", media_type: "movie", tmdb_id: 1 },
    { kind: "status", media_type: "movie", tmdb_id: 1 },
    { kind: "add", media_type: "person", tmdb_id: 1 },
    { kind: "add", media_type: "movie", tmdb_id: -5 },
    { kind: "add", media_type: "movie", tmdb_id: 1.5 },
    { kind: "add", media_type: "movie" },
    null,
    "add",
  ]) {
    assert.equal(pending.parseIntent(bad), null, JSON.stringify(bad));
  }
  assert.equal(pending.parseIntent({ ...CURTIR, title: "x".repeat(500) }).title.length, 200);
});

test("intenção: salva, é lida para descrever, consumida UMA vez e só na mesma página", () => {
  const store = memoryStore();
  const now = 1_000_000;
  assert.equal(pending.savePendingAction(CURTIR, "/title/movie/603", store, now), true);
  assert.equal(pending.peekPendingAction(store, now).kind, "favorite", "peek não consome");
  assert.equal(pending.peekPendingAction(store, now).kind, "favorite");

  assert.equal(pending.takePendingAction("/discover", store, now), null, "outra página: não executa");
  assert.equal(pending.peekPendingAction(store, now), null, "e é descartada (nunca fica pendurada)");

  pending.savePendingAction(CURTIR, "/title/movie/603", store, now);
  const taken = pending.takePendingAction("/title/movie/603", store, now);
  assert.equal(taken.tmdb_id, 603);
  assert.equal(pending.takePendingAction("/title/movie/603", store, now), null, "segunda leitura: nada (nunca repete)");
});

test("intenção: expira em 15 min, rejeita storage adulterado e destino externo", () => {
  const store = memoryStore();
  pending.savePendingAction(CURTIR, "/title/movie/603", store, 0);
  assert.equal(pending.peekPendingAction(store, pending.PENDING_ACTION_TTL_MS + 1), null);

  assert.equal(pending.savePendingAction(CURTIR, "//evil.com", store, 0), false);
  assert.equal(pending.savePendingAction({ kind: "rm -rf" }, "/x", store, 0), false);

  store.setItem(pending.PENDING_ACTION_KEY, JSON.stringify({ ...CURTIR, v: 1, return_to: "https://evil.com", created_at: 0 }));
  assert.equal(pending.peekPendingAction(store, 10), null);
  store.setItem(pending.PENDING_ACTION_KEY, "{não é json");
  assert.equal(pending.peekPendingAction(store, 10), null);
  store.setItem(pending.PENDING_ACTION_KEY, JSON.stringify({ kind: "eval", v: 1, return_to: "/", created_at: 0 }));
  assert.equal(pending.peekPendingAction(store, 10), null);
});

test("intenção: login volta para a página e descreve a ação em português", () => {
  assert.equal(pending.loginHref("/title/movie/603", "action"), "/login?next=%2Ftitle%2Fmovie%2F603&reason=action");
  assert.equal(pending.loginHref("//evil.com", "session"), "/login?next=%2F&reason=session");
  const label = (s) => ({ watched: "Assistido" })[s] ?? s;
  assert.equal(pending.describeIntent(CURTIR, label), "curtir “Matrix”");
  assert.equal(pending.describeIntent({ kind: "status", status: "watched", media_type: "movie", tmdb_id: 1, title: "Matrix" }, label), "marcar “Matrix” como Assistido");
  assert.equal(pending.describeIntent({ kind: "add", media_type: "movie", tmdb_id: 1 }, label), "adicionar este título à sua biblioteca");
  assert.deepEqual(pending.intentForMedia({ id: 603, media_type: "movie", title: "Matrix" }, "status", "watched"), {
    kind: "status",
    status: "watched",
    media_type: "movie",
    tmdb_id: 603,
    title: "Matrix",
  });
});

/* ---------------------------------------------------------------- ações de biblioteca */

/** Servidor falso: um item por título, com a semântica da Fase 0 (POST só cria; PATCH só o enviado). */
function fakeServer(existing = null) {
  const calls = [];
  let item = existing ? { ...existing } : null;
  const fetcher = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ method: init.method, url, body });
    if (init.method === "POST") {
      if (item) return { ...item, created: false };
      item = { id: "novo", status: body.status ?? "want", favorite: body.favorite === true, personal_rating: null, review: null };
      return { ...item, created: true };
    }
    if (init.method === "PATCH") {
      for (const key of Object.keys(body)) item[key] = body[key];
      return { ...item };
    }
    throw new Error("método inesperado");
  };
  return { fetcher, calls, get item() { return item; } };
}

const SAVED = { id: "salvo", status: "want", favorite: false, personal_rating: 9, review: "Resenha que não pode sumir." };

test("status fora da biblioteca: cria já com o status (um POST, sem PATCH)", async () => {
  const server = fakeServer();
  const { created, item } = await runLibraryAction({ kind: "status", status: "watched", media_type: "movie", tmdb_id: 603 }, server.fetcher);
  assert.equal(created, true);
  assert.equal(item.status, "watched");
  assert.deepEqual(server.calls.map((c) => c.method), ["POST"]);
});

test("curtir fora da biblioteca: cria curtido", async () => {
  const server = fakeServer();
  await runLibraryAction(CURTIR, server.fetcher);
  assert.equal(server.item.favorite, true);
  assert.equal(server.item.status, "want");
});

test("item existente: POST não altera nada e o PATCH leva SÓ o campo pedido (nota/resenha nunca são enviadas)", async () => {
  for (const [intent, expected] of [
    [CURTIR, { favorite: true }],
    [{ kind: "status", status: "watched", media_type: "movie", tmdb_id: 603 }, { status: "watched" }],
  ]) {
    const server = fakeServer(SAVED);
    const { created } = await runLibraryAction(intent, server.fetcher);
    assert.equal(created, false);
    assert.deepEqual(server.calls.map((c) => c.method), ["POST", "PATCH"]);
    assert.equal(server.calls[1].url, "/api/library/salvo");
    assert.deepEqual(server.calls[1].body, expected);
    for (const call of server.calls) {
      assert.equal("personal_rating" in call.body, false);
      assert.equal("review" in call.body, false);
    }
    assert.equal(server.item.personal_rating, 9);
    assert.equal(server.item.review, "Resenha que não pode sumir.");
  }
});

test("adicionar item existente: só o POST (que devolve intacto), sem PATCH", async () => {
  const server = fakeServer(SAVED);
  const { created, item } = await runLibraryAction({ kind: "add", media_type: "movie", tmdb_id: 603 }, server.fetcher);
  assert.equal(created, false);
  assert.deepEqual(server.calls.map((c) => c.method), ["POST"]);
  assert.equal(item.personal_rating, 9);
});

test("401 chega como ApiError com status (quem chama mostra 'entre para salvar')", async () => {
  const fetcher = async () => {
    throw new ApiError("Sua sessão expirou ou você não está conectado.", { status: 401 });
  };
  await assert.rejects(runLibraryAction(CURTIR, fetcher), (error) => error instanceof ApiError && error.status === 401);
});

/* ---------------------------------------------------------------- concorrência */

test("fila: a ação mais recente roda por último, mesmo quando a anterior é mais lenta ou falha", async () => {
  const enqueue = createMutationQueue();
  const order = [];
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  const a = enqueue(async () => { await wait(30); order.push("status:watched"); });
  const b = enqueue(async () => { order.push("favorite:true"); throw new Error("falhou"); });
  const c = enqueue(async () => { await wait(5); order.push("status:paused"); return "ok"; });

  await a;
  await assert.rejects(b);
  assert.equal(await c, "ok");
  assert.deepEqual(order, ["status:watched", "favorite:true", "status:paused"]);
});

test("curtir + status rápidos num título novo: um cria, o outro só aplica o seu campo — nada se perde", async () => {
  const server = fakeServer();
  const enqueue = createMutationQueue();
  await Promise.all([
    enqueue(() => runLibraryAction({ kind: "status", status: "watched", media_type: "movie", tmdb_id: 603 }, server.fetcher)),
    enqueue(() => runLibraryAction(CURTIR, server.fetcher)),
    enqueue(() => runLibraryAction({ kind: "status", status: "paused", media_type: "movie", tmdb_id: 603 }, server.fetcher)),
  ]);
  assert.equal(server.item.status, "paused", "a intenção mais recente vence");
  assert.equal(server.item.favorite, true, "e a curtida independente não se perde");
});

/* ---------------------------------------------------------------- P2-02 */

test("P2-02: erros do provedor em português, pelo código (nunca o texto em inglês)", () => {
  assert.equal(authErrorMessage({ code: "INVALID_EMAIL_OR_PASSWORD", message: "Invalid email or password", status: 401 }), "E-mail ou senha incorretos.");
  assert.match(authErrorMessage({ code: "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL", message: "User already exists. Use another email." }), /Já existe uma conta/);
  assert.match(authErrorMessage({ code: "EMAIL_NOT_VERIFIED" }), /Confirme seu e-mail/);
  assert.match(authErrorMessage({ status: 429, message: "Too many requests" }), /Muitas tentativas/);
  assert.equal(authErrorMessage({ code: "ALGO_NOVO", message: "Something new" }, "Fallback."), "Fallback.");
  assert.equal(authErrorMessage(null), "Não foi possível continuar. Tente novamente.");
});

test("P2-02: códigos já normalizados pelo cliente do Neon Auth (minúsculas) também são traduzidos", () => {
  assert.equal(authErrorMessage({ code: "invalid_credentials", status: 401 }), "E-mail ou senha incorretos.");
  assert.match(authErrorMessage({ code: "user_already_exists", status: 422 }), /Já existe uma conta/);
  assert.match(authErrorMessage({ code: "email_not_confirmed" }), /Confirme seu e-mail/);
  assert.equal(authErrorMessage({}, "Mensagem nossa."), "Mensagem nossa.", "erro sem código: mantém a mensagem do app");
});
