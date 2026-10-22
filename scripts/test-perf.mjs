// Fase 4 — performance: node scripts/test-perf.mjs (ou npm test).
// Puro (lê código-fonte). Trava as decisões medidas na build de produção:
// prioridade dos pôsteres, PickForMe fora do JS inicial, CSS de página fora do
// layout global, redirects antes da renderização e temporada sem busca dupla.
// O comportamento ao vivo (chunks, 307, contagem de requisições) fica no E2E
// tests/performance.spec.ts.
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
const { posterLoading, EAGER_POSTERS } = await import("../lib/poster-loading.ts");

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

test("pôsteres: 1º eager+high, resto da 1ª linha eager, demais lazy", () => {
  assert.equal(EAGER_POSTERS, 6);
  assert.deepEqual(posterLoading(0), { loading: "eager", fetchPriority: "high" });
  for (let i = 1; i < EAGER_POSTERS; i++) assert.deepEqual(posterLoading(i), { loading: "eager" });
  for (const i of [EAGER_POSTERS, 7, 40]) assert.deepEqual(posterLoading(i), { loading: "lazy" });
  // sem posição (carrosséis, listas, cards fora de grade) continua lazy
  assert.deepEqual(posterLoading(undefined), { loading: "lazy" });
  assert.deepEqual(posterLoading(-1), { loading: "lazy" });
});

test("pôsteres: grades passam a posição; Busca só na primeira seção", () => {
  assert.match(read("components/discover/DiscoverGrid.tsx"), /position=\{position\}/);
  assert.match(read("components/PosterGrid.tsx"), /posterLoading\(position\)/);
  const search = read("app/search/page.tsx");
  assert.equal((search.match(/<SearchMediaSection[^>]*\bpriority\b/g) || []).length, 2, "uma seção prioritária por ramo");
});

test("PickForMe: só o lançador leve é importado estaticamente", () => {
  for (const file of ["components/HomeClient.tsx", "components/discover/DiscoverToolbar.tsx"]) {
    const src = read(file);
    assert.doesNotMatch(src, /from "@\/components\/PickForMe"/, file);
    assert.match(src, /PickForMeLauncher/, file);
  }
  const launcher = read("components/PickForMeLauncher.tsx");
  assert.match(launcher, /import\("@\/components\/PickForMe"\)/);
  assert.match(launcher, /ssr: false/);
  assert.doesNotMatch(launcher, /^import \{ PickForMe \}/m);
});

test("CSS de página fora do layout global e importado na rota", () => {
  const layout = read("app/layout.tsx");
  for (const css of ["insights.css", "calendar.css", "diary.css"]) {
    assert.doesNotMatch(layout, new RegExp(`import "@/styles/${css}"`), css);
  }
  const routes = {
    "app/insights/page.tsx": "insights.css",
    "app/ranking/page.tsx": "insights.css",
    "app/retrospective/page.tsx": "insights.css",
    "app/calendar/page.tsx": "calendar.css",
    "app/diary/page.tsx": "diary.css",
    "app/library/page.tsx": "diary.css",
  };
  for (const [file, css] of Object.entries(routes)) {
    assert.match(read(file), new RegExp(`import "@/styles/${css}"`), file);
  }
});

test("redirects: /stats no next.config, /profile como Route Handler", () => {
  assert.match(read("next.config.ts"), /source: "\/stats",\s*destination: "\/insights"/);
  assert.equal(fs.existsSync(new URL("../app/profile/page.tsx", import.meta.url)), false);
  const route = read("app/profile/route.ts");
  assert.match(route, /export async function GET/);
  assert.match(route, /307/);
  assert.match(route, /no-store/);
});

test("temporada: a busca não depende do item da biblioteca", () => {
  const src = read("components/EpisodeBrowser.tsx");
  // Fase 6: a chamada passou a ser apiFetch — procura a URL, não o nome da função.
  const seasonFetch = src.indexOf("`/api/tv/${tvId}/season/${season}`");
  assert.ok(seasonFetch > 0);
  const deps = src.slice(seasonFetch).match(/\}, \[([^\]]*)\]\);/);
  assert.ok(deps, "deps do efeito da temporada");
  assert.doesNotMatch(deps[1], /library/i);
});
