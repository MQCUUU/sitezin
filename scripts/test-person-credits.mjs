// Pessoa: separa créditos em atuação, direção e outros (aba Direção).
// node scripts/test-person-credits.mjs (ou npm test).
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
const { isDirecting, splitCredits } = await import("../lib/person/split-credits.ts");

test("isDirecting reconhece Director em roles ou em job", () => {
  assert.equal(isDirecting({ roles: ["Director"] }), true);
  assert.equal(isDirecting({ roles: ["Writer"] }), false);
  assert.equal(isDirecting({ job: "Director" }), true);
});

test("splitCredits separa atuação, direção e outros sem perder a ordem", () => {
  const A = { id: 1, credit_kind: "cast", character: "X", roles: ["X"] };
  const B = { id: 2, credit_kind: "crew", roles: ["Director"] };
  const C = { id: 3, credit_kind: "crew", roles: ["Director", "Writer"] };
  const D = { id: 4, credit_kind: "cast", character: "Y", roles: ["Y", "Director"] };
  const out = splitCredits([A, B, C, D]);
  assert.deepEqual(out.acting, [A, D]);
  assert.deepEqual(out.directing, [B, C, D]);
  assert.deepEqual(out.other, [C]);
});

test("crew sem roles com job diferente de Director continua em outros", () => {
  const E = { id: 5, credit_kind: "crew", job: "Producer" };
  assert.deepEqual(splitCredits([E]).other, [E]);
});

test("lista vazia devolve os três grupos vazios", () => {
  assert.deepEqual(splitCredits([]), { acting: [], directing: [], other: [] });
});
