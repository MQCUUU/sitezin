// Invariantes estruturais da reforma V2.3 → V3.4: node scripts/test-hardening.mjs
// Puro (lê só o código-fonte). Cada teste trava uma regra que já custou um bug.
// A integridade do catálogo (um único INSERT em `media`) e a guarda de sessão
// revogada ficam em scripts/test-settings.mjs.
import { register } from "node:module";

register(
  "data:text/javascript," +
    encodeURIComponent(
      `export async function resolve(s, c, n) { try { return await n(s, c); } catch (e) { if (s.startsWith(".") && !s.endsWith(".ts")) return n(s + ".ts", c); throw e; } }`
    )
);

const test = (await import("node:test")).default;
const assert = (await import("node:assert/strict")).default;
const fs = (await import("node:fs")).default;
const path = (await import("node:path")).default;
const { isReservedUsername, isValidUsername } = await import("../lib/username.ts");
const { STATUS_LABELS } = await import("../lib/types.ts");

const root = path.resolve(new URL(".", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"), "..");
const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  });
const rel = (file) => path.relative(root, file).split(path.sep).join("/");
const files = [...walk(path.join(root, "app")), ...walk(path.join(root, "components")), ...walk(path.join(root, "lib"))].map((file) => [rel(file), fs.readFileSync(file, "utf8")]);
const routes = files.filter(([file]) => file.startsWith("app/api/") && file.endsWith("/route.ts"));

test("cache: nenhuma rota com sessão responde com cache público/compartilhado", () => {
  const leaking = routes.filter(([, src]) => src.includes("getSession") && /"public,|s-maxage/.test(src)).map(([file]) => file);
  assert.deepEqual(leaking, []);
});

test("isolamento: o cliente nunca escolhe o dono — `user_id` do corpo/URL só identifica a OUTRA ponta em follows", () => {
  const suspicious = routes
    .filter(([, src]) => /(body|searchParams)[?.]*\.?(get\()?["']?(user_id|owner_id)\b/.test(src))
    .map(([file]) => file);
  assert.deepEqual(suspicious, ["app/api/follows/route.ts"]);
});

test("XSS: dangerouslySetInnerHTML só no JSON-LD do título, escapando '<'", () => {
  const uses = files.filter(([, src]) => src.includes("dangerouslySetInnerHTML")).map(([file]) => file);
  assert.deepEqual(uses, ["app/title/[type]/[id]/layout.tsx"]);
  assert.match(files.find(([file]) => file === uses[0])[1], /replace\(\/<\/g, "\\\\u003c"\)/);
});

test("datas: nenhuma API calcula 'hoje' em UTC (usar todayIn de lib/calendar/dates)", () => {
  const utcToday = routes
    .filter(([file]) => file !== "app/api/account/export/route.ts") // só o nome do arquivo de backup
    .filter(([, src]) => /new Date\(\)\.toISOString\(\)\.slice\(0, ?10\)/.test(src))
    .map(([file]) => file);
  assert.deepEqual(utcToday, []);
});

test("terminologia: rótulos de status canônicos (particípio), sem 'Abandonei' em mapas de UI", () => {
  assert.deepEqual(STATUS_LABELS, {
    want: "Quero assistir",
    watching: "Assistindo",
    watched: "Assistido",
    dropped: "Abandonado",
    rewatching: "Reassistindo",
    rewatched: "Reassistido",
  });
  const legacy = files.filter(([, src]) => /\[\s*"dropped",\s*"Abandonei"\s*\]|dropped:\s*"Abandonei"/.test(src)).map(([file]) => file);
  assert.deepEqual(legacy, []);
  const friends = files.filter(([, src]) => /"Perfis de amigos"|somente amigos/i.test(src)).map(([file]) => file);
  assert.deepEqual(friends, [], "o domínio social é seguir, não amizade");
});

test("@ reservado: só nomes de equipe/sistema; @ comuns continuam livres", () => {
  for (const name of ["admin", "Suporte", "mycatalog", "api", "settings", "null"]) assert.equal(isReservedUsername(name), true, name);
  for (const name of ["ana", "mario_01", "adminfan", "supporter_br"]) {
    assert.equal(isReservedUsername(name), false, name);
    assert.equal(isValidUsername(name), true, name);
  }
});

test("rotas removidas na V3.4 não voltam sem consumidor", () => {
  for (const gone of ["activity", "friendships", "rating-categories", "search/index", "stats", "tags", "tags/assign", "tv-progress"]) {
    assert.equal(fs.existsSync(path.join(root, "app/api", gone, "route.ts")), false, gone);
  }
});
