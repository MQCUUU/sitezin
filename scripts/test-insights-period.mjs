// Hotfix Insights — em que período um título assistido conta (datas controladas, relógio fixo).
// node scripts/test-insights-period.mjs (ou npm test).
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
const { consumptionDay } = await import("../lib/insights/consumption-day.ts");
const { buildInsights } = await import("../lib/insights/compute.ts");
const { INSIGHTS_TZ } = await import("../lib/insights/period.ts");

const TZ = INSIGHTS_TZ;

/* ------------------------------------------------ regra da data (consumptionDay) */

test("status Assistido sem data explícita: usa o evento da transição (o bug: antes ficava sem dia)", () => {
  assert.equal(consumptionDay({ status: "watched", watchedAt: null, watchedEventAt: "2026-03-05T18:00:00Z", rewatchedEventAt: null }, TZ), "2026-03-05");
});

test("data explícita de visualização tem prioridade sobre o evento de status", () => {
  assert.equal(consumptionDay({ status: "watched", watchedAt: "2025-11-10T21:00:00Z", watchedEventAt: "2026-03-05T18:00:00Z", rewatchedEventAt: null }, TZ), "2025-11-10");
});

test("fuso: 31/12 23:30 em Brasília (01/01 02:30 UTC) pertence a 31/12", () => {
  assert.equal(consumptionDay({ status: "watched", watchedAt: null, watchedEventAt: "2026-01-01T02:30:00Z", rewatchedEventAt: null }, TZ), "2025-12-31");
  assert.equal(consumptionDay({ status: "watched", watchedAt: new Date("2026-01-01T03:00:00Z"), watchedEventAt: null, rewatchedEventAt: null }, TZ), "2026-01-01");
});

test("título que saiu de Assistido não ganha dia pelo evento antigo", () => {
  assert.equal(consumptionDay({ status: "want", watchedAt: null, watchedEventAt: "2026-03-05T18:00:00Z", rewatchedEventAt: null }, TZ), null);
});

test("reassistida depois não muda o dia da 1ª conclusão; direto para Reassistido usa esse evento", () => {
  assert.equal(consumptionDay({ status: "rewatched", watchedAt: null, watchedEventAt: "2025-04-01T12:00:00Z", rewatchedEventAt: "2026-02-01T12:00:00Z" }, TZ), "2025-04-01");
  assert.equal(consumptionDay({ status: "rewatched", watchedAt: null, watchedEventAt: null, rewatchedEventAt: "2026-02-01T12:00:00Z" }, TZ), "2026-02-01");
});

test("legado sem data nem evento: nenhuma data inventada", () => {
  assert.equal(consumptionDay({ status: "watched", watchedAt: null, watchedEventAt: null, rewatchedEventAt: null }, TZ), null);
});

/* ------------------------------------------------ períodos no Insights (relógio fixo) */

let nextId = 1;
function movie(over) {
  const id = nextId++;
  return {
    media_id: id, tmdb_id: 1000 + id, type: "movie", title: `Filme ${id}`, poster_path: null,
    status: "watched", favorite: false, rating: null, watched_day: null, added_day: "2026-01-01", updated_day: "2026-01-01",
    rewatch_count: 0, release_year: 2000, runtime: 100, seasons_count: null, episodes_count: null, completed_seasons: 0,
    genres: ["Drama"], tmdb_rating: null, vote_count: null, language: "en", countries: [], cast: [], creators: [], directors: [],
    enriched: true, ...over,
  };
}
function insights(library, period, today) {
  return buildInsights({ library, episodes: [], entries: [], hours: [], hidden: [], events: null, today }, { period });
}

test("adicionado em 2025, assistido em março de 2026: conta em 2026 e não em 2025", () => {
  const lib = [movie({ added_day: "2025-05-01", updated_day: "2026-03-05", watched_day: "2026-03-05" })];
  assert.equal(insights(lib, "year", "2026-03-20").summary.cur.movies, 1);
  assert.equal(insights(lib, "last_year", "2026-03-20").summary.cur.movies, 0);
  assert.equal(insights(lib, "2025", "2026-03-20").summary.cur.movies, 0);
  const march = insights(lib, "year", "2026-03-20").activity.monthly.find((m) => m.month === "2026-03");
  assert.equal(march.movies, 1);
  assert.equal(march.minutes, 100);
});

test("adicionado em 2026, assistido em 2025: não conta em 2026", () => {
  const lib = [movie({ added_day: "2026-02-01", updated_day: "2026-02-01", watched_day: "2025-11-10" })];
  assert.equal(insights(lib, "year", "2026-03-20").summary.cur.movies, 0);
  assert.equal(insights(lib, "2025", "2026-03-20").summary.cur.movies, 1);
});

test("assistido em dezembro, resenha editada em janeiro: continua no ano anterior", () => {
  const lib = [movie({ watched_day: "2025-12-20", updated_day: "2026-01-05", rating: 8 })];
  assert.equal(insights(lib, "2025", "2026-03-20").summary.cur.movies, 1);
  assert.equal(insights(lib, "year", "2026-03-20").summary.cur.movies, 0);
  assert.equal(insights(lib, "year", "2026-03-20").summary.cur.avgRating, null);
});

test("ano atual vem do relógio (sem ano fixo no código)", () => {
  const lib = [movie({ watched_day: "2026-06-01" })];
  assert.equal(insights(lib, "year", "2026-07-01").summary.cur.movies, 1);
  assert.equal(insights(lib, "year", "2027-02-01").summary.cur.movies, 0);
  assert.equal(insights(lib, "last_year", "2027-02-01").summary.cur.movies, 1);
});

test("sem data (legado): só em Todo o período, nunca num ano", () => {
  const lib = [movie({ watched_day: null })];
  assert.equal(insights(lib, "all", "2026-03-20").summary.cur.movies, 1);
  assert.equal(insights(lib, "year", "2026-03-20").summary.cur.movies, 0);
});

test("um título conta uma vez no período, mesmo com nota e status alterados", () => {
  const lib = [movie({ watched_day: "2026-02-10", rating: 9, updated_day: "2026-03-01" })];
  assert.equal(insights(lib, "year", "2026-03-20").summary.cur.movies, 1);
});
