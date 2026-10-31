// Avaliações da comunidade: privacidade (mesma regra do perfil) e ordem (quem você segue primeiro).
// node scripts/test-community-reviews.mjs (ou npm test).
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
const { visibleCommunityReviews } = await import("../lib/reviews/community.ts");

let n = 0;
const row = (over) => ({
  user_id: `u${++n}`, username: `pessoa${n}`, display_name: null, avatar_url: null,
  visibility: "public", is_public: true, activity_visibility: "profile",
  followed: false, rating: 8, review: "Bom filme", updated_at: `2026-10-${String(10 + n).padStart(2, "0")}T12:00:00Z`, ...over,
});

test("perfil público com atividade visível aparece para qualquer pessoa (inclusive visitante)", () => {
  const out = visibleCommunityReviews([row({ username: "publico" })], null);
  assert.deepEqual(out.map((r) => r.username), ["publico"]);
});

test("perfil privado: só seguidores aceitos veem", () => {
  const priv = row({ username: "privado", visibility: "private", is_public: false });
  assert.equal(visibleCommunityReviews([priv], null).length, 0, "visitante");
  assert.equal(visibleCommunityReviews([{ ...priv, followed: false }], "leitor").length, 0, "não segue");
  assert.equal(visibleCommunityReviews([{ ...priv, followed: true }], "leitor").length, 1, "segue");
});

test("atividade 'seguidores' esconde de quem não segue; 'privada' esconde de todos", () => {
  const followers = row({ username: "soSeguidores", activity_visibility: "followers" });
  assert.equal(visibleCommunityReviews([followers], "leitor").length, 0);
  assert.equal(visibleCommunityReviews([{ ...followers, followed: true }], "leitor").length, 1);
  const hidden = row({ username: "privada", activity_visibility: "private", followed: true });
  assert.equal(visibleCommunityReviews([hidden], "leitor").length, 0);
});

test("quem você segue vem primeiro; depois resenhas com texto; depois as mais recentes", () => {
  const out = visibleCommunityReviews(
    [
      row({ username: "outroRecente", updated_at: "2026-10-29T10:00:00Z" }),
      row({ username: "outroSoNota", review: null, updated_at: "2026-10-30T10:00:00Z" }),
      row({ username: "amigoAntigo", followed: true, updated_at: "2026-01-01T10:00:00Z" }),
      row({ username: "amigoRecente", followed: true, updated_at: "2026-10-28T10:00:00Z" }),
    ],
    "leitor"
  );
  assert.deepEqual(out.map((r) => r.username), ["amigoRecente", "amigoAntigo", "outroRecente", "outroSoNota"]);
  assert.equal(out[0].followed, true);
  assert.equal(out[2].followed, false);
});

test("o próprio leitor não aparece (a avaliação dele já está acima) e item vazio não entra", () => {
  const out = visibleCommunityReviews([row({ user_id: "leitor", username: "eu" }), row({ username: "vazio", rating: null, review: "   " })], "leitor");
  assert.equal(out.length, 0);
});

test("visitante nunca é tratado como seguidor", () => {
  const out = visibleCommunityReviews([row({ username: "x", followed: true })], null);
  assert.equal(out[0].followed, false);
});
