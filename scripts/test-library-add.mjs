// Fase 0 — "Adicionar à biblioteca" nunca apaga dados (P0-01) e o login não aplica a
// política de força de senha (P1-02): node scripts/test-library-add.mjs (ou npm test).
// A semântica real do endpoint (banco + sessão) é coberta por tests/library-integrity.spec.ts.
import test from "node:test";
import assert from "node:assert/strict";

import { addLibraryItem, newLibraryItemValues } from "../lib/library/add.ts";
import { fetchLibraryState } from "../lib/library/lookup.ts";
import { authFormPasswordError, passwordValidationError } from "../lib/auth-client.ts";

/**
 * Banco falso de `library_items` com a semântica do Postgres para a chave única
 * (user_id, media_id): conflito + DO NOTHING → nenhuma linha; conflito + DO UPDATE →
 * sobrescreve os campos pessoais (o comportamento antigo); conflito sem cláusula → erro.
 */
function fakeLibraryDb(seed = []) {
  const rows = new Map(seed.map((row) => [`${row.user_id}|${row.media_id}`, { ...row }]));
  let nextId = 1;

  const sql = async (strings, ...values) => {
    const text = strings.join("$");
    await Promise.resolve(); // deixa requisições concorrentes se intercalarem

    if (/INSERT INTO public\.library_items/.test(text)) {
      const [user_id, media_id, status, favorite, personal_rating, review, rewatch_count, current_season, completed_seasons, stopped_season] = values;
      const key = `${user_id}|${media_id}`;
      const current = rows.get(key);

      if (current) {
        if (/DO NOTHING/.test(text)) return [];
        if (/DO UPDATE/.test(text)) {
          Object.assign(current, { favorite, personal_rating, review });
          return [{ ...current }];
        }
        throw new Error('duplicate key value violates unique constraint "library_items_user_media_unique"');
      }

      const row = { id: `item-${nextId++}`, user_id, media_id, status, favorite, personal_rating, review, rewatch_count, current_season, completed_seasons, stopped_season };
      rows.set(key, row);
      return [{ ...row }];
    }

    if (/FROM public\.library_items/.test(text)) {
      const [user_id, media_id] = values;
      const row = rows.get(`${user_id}|${media_id}`);
      return row ? [{ ...row }] : [];
    }

    throw new Error(`consulta inesperada: ${text.slice(0, 80)}`);
  };

  return { sql, rows };
}

const USER = "user-a";
const MOVIE = { id: 10, media_type: "movie", seasons_count: null };
const SHOW = { id: 20, media_type: "tv", seasons_count: 4 };
/** O que as telas enviavam quando achavam que o título não estava na biblioteca. */
const DEFAULTS = { status: "want", favorite: false, personal_rating: null, review: "" };
const SAVED = { user_id: USER, media_id: MOVIE.id, id: "item-saved", status: "watched", favorite: true, personal_rating: 9, review: "Resenha que não pode sumir.", rewatch_count: 0, current_season: null, completed_seasons: 0, stopped_season: null };

/* ---------------------------------------------------------------- Caso A — item novo */

test("A: item inexistente é criado com o status escolhido (padrão: Quero assistir)", async () => {
  const { sql, rows } = fakeLibraryDb();
  const { item, created } = await addLibraryItem(sql, { userId: USER, media: MOVIE, body: { status: "want", favorite: false } });

  assert.equal(created, true);
  assert.equal(item.status, "want");
  assert.equal(item.favorite, false);
  assert.equal(item.personal_rating, null);
  assert.equal(rows.size, 1);

  const draft = await addLibraryItem(fakeLibraryDb().sql, { userId: USER, media: MOVIE, body: { status: "watched", favorite: true } });
  assert.equal(draft.item.status, "watched", "rascunho de status escolhido antes de adicionar entra no item novo");
  assert.equal(draft.item.favorite, true);
});

test("A: valores iniciais de série e reassistida (mesmas regras de antes para item novo)", () => {
  assert.deepEqual(
    { s: newLibraryItemValues({}, SHOW).current_season, c: newLibraryItemValues({}, SHOW).completed_seasons },
    { s: 1, c: 0 }
  );
  const rewatched = newLibraryItemValues({ status: "rewatched" }, SHOW);
  assert.equal(rewatched.completed_seasons, 4);
  assert.equal(rewatched.current_season, 4);
  assert.equal(rewatched.rewatch_count, 1);
  assert.equal(newLibraryItemValues({ status: "rewatching" }, MOVIE).rewatch_count, 1);
  assert.equal(newLibraryItemValues({ status: "watched" }, MOVIE).rewatch_count, 0);
  assert.equal(newLibraryItemValues({}, MOVIE).current_season, null);
  assert.equal(newLibraryItemValues({ favorite: "sim" }, MOVIE).favorite, false, "só true explícito curte");
});

/* ---------------------------------------------------------------- Caso B — item existente */

test("B: 'Adicionar' com os padrões da tela NÃO apaga status, curtida, nota nem resenha", async () => {
  const { sql, rows } = fakeLibraryDb([SAVED]);
  const { item, created } = await addLibraryItem(sql, { userId: USER, media: MOVIE, body: DEFAULTS });

  assert.equal(created, false);
  const stored = rows.get(`${USER}|${MOVIE.id}`);
  for (const target of [item, stored]) {
    assert.equal(target.status, "watched");
    assert.equal(target.favorite, true);
    assert.equal(target.personal_rating, 9);
    assert.equal(target.review, "Resenha que não pode sumir.");
  }
});

test("B/E: cards (Discover/Busca/Para você) e corpo vazio também devolvem o item intacto", async () => {
  for (const body of [{ status: "want", favorite: false }, { status: "want" }, {}]) {
    const { sql, rows } = fakeLibraryDb([SAVED]);
    const { item, created } = await addLibraryItem(sql, { userId: USER, media: MOVIE, body });

    assert.equal(created, false);
    assert.equal(item.id, "item-saved");
    assert.deepEqual(rows.get(`${USER}|${MOVIE.id}`), SAVED);
  }
});

test("idempotente: dois 'Adicionar' simultâneos criam UM item; o segundo recebe o mesmo", async () => {
  const { sql, rows } = fakeLibraryDb();
  const [a, b] = await Promise.all([
    addLibraryItem(sql, { userId: USER, media: MOVIE, body: { status: "watched" } }),
    addLibraryItem(sql, { userId: USER, media: MOVIE, body: DEFAULTS }),
  ]);

  assert.equal(rows.size, 1);
  assert.deepEqual([a.created, b.created].sort(), [false, true]);
  assert.equal(a.item.id, b.item.id);
  assert.equal(rows.get(`${USER}|${MOVIE.id}`).status, "watched", "o perdedor não sobrescreve o vencedor");
});

test("itens de outro usuário não interferem", async () => {
  const { sql, rows } = fakeLibraryDb([SAVED]);
  const { created } = await addLibraryItem(sql, { userId: "user-b", media: MOVIE, body: DEFAULTS });

  assert.equal(created, true);
  assert.equal(rows.size, 2);
  assert.deepEqual(rows.get(`${USER}|${MOVIE.id}`), SAVED);
});

/* ---------------------------------------------------------------- Caso C — leitura do estado */

const respond = (status, body) => async () =>
  new Response(body === undefined ? "" : typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: { "Content-Type": typeof body === "string" ? "text/html" : "application/json" },
  });

test("C: só 200+null (ausente) e 401 (visitante) significam 'não está na biblioteca'", async () => {
  assert.equal(await fetchLibraryState("movie", 10, { fetcher: respond(200, null) }), null);
  assert.equal(await fetchLibraryState("movie", 10, { fetcher: respond(401, { error: "Não autenticado" }) }), null);
  assert.deepEqual(await fetchLibraryState("movie", 10, { fetcher: respond(200, { id: "x", status: "watched" }) }), { id: "x", status: "watched" });
});

test("C: 5xx, 4xx, HTML, corpo inválido, rede e tempo esgotado LANÇAM erro (nunca viram 'ausente')", async () => {
  const failures = {
    "503": respond(503, { error: "indisponível" }),
    "500 HTML": respond(500, "<html>erro</html>"),
    "404": respond(404, { error: "x" }),
    "200 com erro": respond(200, { error: "Biblioteca indisponível" }),
    "200 HTML": respond(200, "<html></html>"),
    "200 sem id": respond(200, {}),
    rede: async () => {
      throw new TypeError("Failed to fetch");
    },
    "tempo esgotado": (_url, init) =>
      new Promise((_resolve, reject) => init.signal.addEventListener("abort", () => reject(init.signal.reason))),
  };

  for (const [label, fetcher] of Object.entries(failures)) {
    await assert.rejects(fetchLibraryState("movie", 10, { fetcher, timeoutMs: 20 }), undefined, label);
  }
});

test("C: a consulta vai para o endpoint do título, sem cache", async () => {
  let seen;
  await fetchLibraryState("tv", 1399, {
    fetcher: async (url, init) => {
      seen = { url, cache: init.cache, signal: Boolean(init.signal) };
      return new Response("null", { status: 200 });
    },
  });
  assert.deepEqual(seen, { url: "/api/library?tmdb_id=1399&type=tv", cache: "no-store", signal: true });
});

/* ---------------------------------------------------------------- P1-02 — login */

test("P1-02: login aceita senha antiga fora da política (o provedor decide); só exige preenchida", () => {
  for (const legacy of ["senha12345", "abcdefgh", "SENHA", "1234", "semsimbolo1A"]) {
    assert.equal(authFormPasswordError("login", legacy), null, legacy);
  }
  assert.equal(authFormPasswordError("login", ""), "Digite sua senha.");
});

test("P1-02: cadastro continua exigindo a política de força", () => {
  assert.match(authFormPasswordError("signup", "senha12345"), /maiúscula/);
  assert.match(authFormPasswordError("signup", "abc"), /8 ou mais/);
  assert.equal(authFormPasswordError("signup", "Senha!2026"), null);
  assert.equal(authFormPasswordError("signup", "senha12345"), passwordValidationError("senha12345"));
});
