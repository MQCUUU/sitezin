// Indicações: estado de quem recebe, retorno, faro, agrupamento e bilhete.
// node --experimental-strip-types --test scripts/test-recommendations.mjs (ou npm test).
import { register } from "node:module";
import { pathToFileURL } from "node:url";

const ROOT = pathToFileURL(new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")).href;
register(
  "data:text/javascript," +
    encodeURIComponent(
      `const ROOT = ${JSON.stringify(ROOT)};
       export async function resolve(s, c, n) {
         if (s.startsWith("@/")) s = ROOT + s.slice(2) + (s.endsWith(".ts") ? "" : ".ts");
         try { return await n(s, c); } catch (e) { if (s.startsWith(".") && !s.endsWith(".ts")) return n(s + ".ts", c); throw e; }
       }`
    )
);

const test = (await import("node:test")).default;
const assert = (await import("node:assert/strict")).default;
const R = await import("../lib/recommendations/rules.ts");

test("recipientState: biblioteca vence dispensa", () => {
  assert.equal(R.recipientState({ dismissed_at: null }, null), "pending");
  assert.equal(R.recipientState({ dismissed_at: "x" }, null), "dismissed");
  assert.equal(R.recipientState({ dismissed_at: "x" }, { status: "want" }), "saved");
  assert.equal(R.recipientState({ dismissed_at: null }, { status: "watching" }), "saved");
  assert.equal(R.recipientState({ dismissed_at: null }, { status: "watched" }), "watched");
});

test("senderStatusLabel esconde a dispensa", () => {
  assert.equal(R.senderStatusLabel("pending", null), "ainda não viu");
  assert.equal(R.senderStatusLabel("dismissed", null), "ainda não viu");
  assert.equal(R.senderStatusLabel("saved", null), "pôs na Watchlist");
  assert.equal(R.senderStatusLabel("watched", 9.5), "assistiu e deu 9,5");
  assert.equal(R.senderStatusLabel("watched", 8), "assistiu e deu 8,0");
  assert.equal(R.senderStatusLabel("watched", null), "assistiu");
});

test("resultCopy com e sem nota visível", () => {
  assert.equal(R.resultCopy("Bruno", "Interestelar", 9.5), "Bruno assistiu Interestelar, que você indicou, e deu 9,5");
  assert.equal(R.resultCopy("Bruno", "Interestelar", null), "Bruno assistiu Interestelar, que você indicou");
});

test("faro conta só notas visíveis; 7,0 acerta", () => {
  assert.deepEqual(R.faro([]), { hits: 0, rated: 0 });
  assert.deepEqual(R.faro([7, 6.9, null]), { hits: 1, rated: 2 });
  assert.deepEqual(R.faro([7.0]), { hits: 1, rated: 1 });
});

test("faroLabel com mínimo e singular", () => {
  assert.equal(R.faroLabel({ hits: 2, rated: 2 }, 3), null);
  assert.equal(R.faroLabel({ hits: 0, rated: 0 }, 1), null);
  assert.equal(R.faroLabel({ hits: 1, rated: 1 }, 1), "1 de 1 indicação acertou");
  assert.equal(R.faroLabel({ hits: 7, rated: 9 }, 3), "7 de 9 indicações acertaram");
});

test("groupByTitle agrupa e ordena pelo mais recente", () => {
  const groups = R.groupByTitle([
    { media_id: 1, created_at: "2026-01-01T00:00:00Z" },
    { media_id: 2, created_at: "2026-01-03T00:00:00Z" },
    { media_id: 1, created_at: "2026-01-05T00:00:00Z" },
  ]);
  assert.deepEqual(groups.map((g) => g.media_id), [1, 2]);
  assert.equal(groups[0].recs.length, 2);
});

test("sendersLine", () => {
  assert.equal(R.sendersLine(["Ana"]), "Ana indicou");
  assert.equal(R.sendersLine(["Ana", "Bruno"]), "Ana e Bruno indicaram");
  assert.equal(R.sendersLine(["Ana", "Bruno", "Caio", "Dani"]), "Ana, Bruno e mais 2 indicaram");
  assert.equal(R.sendersLine(["Ana", "Bruno", "Caio"]), "Ana, Bruno e mais 1 indicaram");
});

test("normalizeNote", () => {
  assert.equal(R.normalizeNote(undefined), null);
  assert.equal(R.normalizeNote(null), null);
  assert.equal(R.normalizeNote("  "), null);
  assert.equal(R.normalizeNote("  oi  "), "oi");
  assert.equal(R.normalizeNote("a".repeat(140)), "a".repeat(140));
  assert.equal(R.normalizeNote("a".repeat(141)), false);
  assert.equal(R.normalizeNote(42), false);
});

test("joinNames junta nomes para toast e linha do título", () => {
  assert.equal(R.joinNames(["Ana"]), "Ana");
  assert.equal(R.joinNames(["Ana", "Bruno"]), "Ana e Bruno");
  assert.equal(R.joinNames(["Ana", "Bruno", "Marina"]), "Ana, Bruno e Marina");
  assert.equal(R.joinNames(["Ana", "Bruno", "Caio", "Dani", "Eva"]), "Ana, Bruno, Caio e mais 2");
});

test("timeAgo em português", () => {
  const now = Date.parse("2026-11-11T12:00:00Z");
  const ago = (ms) => new Date(now - ms).toISOString();
  const day = 86_400_000;
  assert.equal(R.timeAgo(ago(3_600_000), now), "hoje");
  assert.equal(R.timeAgo(ago(day + 1000), now), "ontem");
  assert.equal(R.timeAgo(ago(2 * day + 1000), now), "há 2 dias");
  assert.equal(R.timeAgo(ago(7 * day + 1000), now), "há 1 semana");
  assert.equal(R.timeAgo(ago(15 * day), now), "há 2 semanas");
  assert.equal(R.timeAgo(ago(40 * day), now), "há 1 mês");
  assert.equal(R.timeAgo(ago(100 * day), now), "há 3 meses");
  assert.equal(R.timeAgo(ago(800 * day), now), "há 2 anos");
  assert.equal(R.timeAgo("lixo", now), "");
});

test("nota do amigo só aparece se quem indicou ainda o segue (amizade desfeita esconde nota de seguidores)", () => {
  const base = { personal_rating: 9, visibility: "private", is_public: false, activity_visibility: "followers", ratings_visibility: "followers" };
  assert.equal(R.recipientRating({ ...base, sender_follows: true }), 9);
  assert.equal(R.recipientRating({ ...base, sender_follows: false }), null);
  assert.equal(R.recipientRating({ ...base, visibility: "public", is_public: true, ratings_visibility: "profile", sender_follows: false }), 9);
  assert.equal(R.recipientRating({ ...base, personal_rating: null, sender_follows: true }), null);
});
