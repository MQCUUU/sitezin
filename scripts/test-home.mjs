// Testes de domínio da Home (V3.0): node scripts/test-home.mjs
// Node 24 executa os .ts puros direto; o hook abaixo só completa a extensão dos imports relativos.
import { register } from "node:module";

register(
  "data:text/javascript," +
    encodeURIComponent(
      `export async function resolve(s, c, n) { try { return await n(s, c); } catch (e) { if (s.startsWith(".") && !s.endsWith(".ts")) return n(s + ".ts", c); throw e; } }`
    )
);

const test = (await import("node:test")).default;
const assert = (await import("node:assert/strict")).default;
const home = await import("../lib/home/home.ts");
const { attachSeriesProgress } = await import("../lib/library/attach-progress.ts");
const { computeTvProgress, tvStructureFromRaw } = await import("../lib/tv-progress.ts");
const { libraryProgress } = await import("../lib/library/progress.ts");
const { recentMoments, loadRecentMoments } = await import("../lib/diary/recent.ts");
const { buildDays } = await import("../lib/diary/moments.ts");
const { headline } = await import("../lib/diary/copy.ts");
const { buildEvents } = await import("../lib/calendar/build.ts");

const {
  activeHero, heroKind, homeAgenda, homeMetrics, homeSections, isActionable, isActiveStatus, pickHeroItem,
  statusTotals, summaryCards, watchingSummaryLine, formatRuntime, ACTIVE_STATUSES,
} = home;

/* ---------- fábricas: linhas no formato do SQL de /api/home e /api/library ---------- */
let seq = 0;
const raw = (seasons, last, status = "Returning Series") => ({
  _seasons: seasons.map(([n, c]) => ({ season_number: n, episode_count: c })),
  _last_episode: last ? { season_number: last[0], episode_number: last[1] } : null,
  _series_status: status,
});
const eps = (list) => list.flatMap(([s, from, to]) => Array.from({ length: to - from + 1 }, (_, i) => [s, from + i]));

function tvRow({ title, status = "watching", seasons = [[1, 10], [2, 10]], last = [2, 10], showStatus = "Ended", watched = [], completed = 0, counts = {} }) {
  const id = ++seq;
  return {
    row: {
      id: `li-${id}`,
      status,
      completed_seasons: completed,
      media: { id, tmdb_id: 1000 + id, media_type: "tv", title, backdrop_path: `/b${id}.jpg`, seasons_count: counts.seasons ?? null, episodes_count: counts.episodes ?? null },
      ...raw(seasons, last, showStatus),
    },
    watched: watched.map(([s, e]) => ({ media_id: id, season_number: s, episode_number: e })),
  };
}

function movieRow({ title, status = "watching", runtime = 135 }) {
  const id = ++seq;
  return { row: { id: `li-${id}`, status, completed_seasons: 0, media: { id, tmdb_id: 1000 + id, media_type: "movie", title, runtime } }, watched: [] };
}

/** `sql` falso: conta consultas e devolve o progresso das séries pedidas. */
function fakeSql(all) {
  const calls = [];
  const sql = async (strings, ...values) => {
    calls.push(strings.join("?"));
    const ids = values.find(Array.isArray) ?? [];
    return all.filter((p) => ids.includes(p.media_id));
  };
  return { sql, calls };
}

/** Pipeline real da Home: progresso em lote + achatamento igual ao client. */
async function homeItems(specs) {
  const rows = specs.map((s) => structuredClone(s.row));
  const { sql, calls } = fakeSql(specs.flatMap((s) => s.watched));
  await attachSeriesProgress(sql, "user-a", rows, { tvProgress: true });
  return { items: rows.map((r) => ({ ...r, library_id: r.id, ...r.media })), calls };
}

const one = async (spec) => (await homeItems([spec])).items[0];

/* ================================================================ HERO */

test("hero: uma série no meio da temporada → próximo episódio factual + link do episódio", async () => {
  const item = await one(tvRow({ title: "The Chosen", watched: eps([[1, 1, 10], [2, 1, 3]]) }));
  const h = activeHero(item);
  assert.equal(h.eyebrow, "CONTINUE DE ONDE PAROU");
  assert.equal(h.description, "Próximo episódio: T2:E04");
  assert.equal(h.href, `/title/tv/${item.tmdb_id}/season/2/episode/4`);
  assert.equal(h.action, "Continuar");
});

test("hero: transição de temporada (T1 completa) → T2:E01", async () => {
  const item = await one(tvRow({ title: "Série", watched: eps([[1, 1, 10]]) }));
  assert.equal(activeHero(item).description, "Próximo episódio: T2:E01");
});

test("hero: buraco nunca é pulado (E1 ✓ E2 ✗ E3 ✓ → E2)", async () => {
  const item = await one(tvRow({ title: "Buraco", watched: [[1, 1], [1, 3]] }));
  assert.equal(activeHero(item).description, "Próximo episódio: T1:E02");
});

test("hero: várias séries ativas — ganha a 1ª (última atividade) com algo a fazer agora", async () => {
  const { items } = await homeItems([
    tvRow({ title: "Em dia", showStatus: "Returning Series", watched: eps([[1, 1, 10], [2, 1, 10]]) }),
    tvRow({ title: "Supernatural", watched: eps([[1, 1, 5]]) }),
    movieRow({ title: "Filme" }),
  ]);
  assert.equal(items[0].library_progress.state, "caught_up");
  assert.equal(isActionable(items[0]), false);
  assert.equal(pickHeroItem(items).title, "Supernatural");
});

test("hero selection é determinística: mesma entrada → mesmo vencedor; ordem decide entre acionáveis", async () => {
  const { items } = await homeItems([movieRow({ title: "A" }), tvRow({ title: "B", watched: [[1, 1]] })]);
  for (let i = 0; i < 5; i++) assert.equal(pickHeroItem(items).title, "A");
  assert.equal(pickHeroItem([...items].reverse()).title, "B");
  assert.equal(pickHeroItem([]), null);
});

test("hero: só ativos sem nada para ver → o mais recente, sem 'Continuar' nem barra", async () => {
  const { items } = await homeItems([
    tvRow({ title: "Em dia", showStatus: "Returning Series", watched: eps([[1, 1, 10], [2, 1, 10]]) }),
    tvRow({ title: "Encerrada", showStatus: "Ended", watched: eps([[1, 1, 10], [2, 1, 10]]) }),
  ]);
  const hero = pickHeroItem(items);
  assert.equal(hero.title, "Em dia");
  const h = activeHero(hero);
  assert.equal(h.eyebrow, "EM ANDAMENTO");
  assert.equal(h.action, "Ver série");
  assert.equal(h.bar, null);
  assert.match(h.description, /Você está em dia/);
  assert.match(activeHero(items[1]).description, /^Série concluída/);
});

test("hero kind: ativo acionável > agenda urgente > ativo sem ação > fila > descobrir", async () => {
  const active = await one(tvRow({ title: "X", watched: [[1, 1]] }));
  const idle = await one(tvRow({ title: "Y", showStatus: "Returning Series", watched: eps([[1, 1, 10], [2, 1, 10]]) }));
  assert.equal(heroKind({ hero: active, urgentEvent: true, queue: true }), "watching");
  assert.equal(heroKind({ hero: idle, urgentEvent: true, queue: true }), "calendar");
  assert.equal(heroKind({ hero: idle, urgentEvent: false, queue: true }), "watching");
  assert.equal(heroKind({ hero: null, urgentEvent: false, queue: true }), "queue");
  assert.equal(heroKind({ hero: null, urgentEvent: false, queue: false }), "discover");
});

test("hero: filme Assistindo — sem campos de episódio, sem % inventado, com duração", async () => {
  const item = await one(movieRow({ title: "Homem-Aranha", runtime: 135 }));
  const h = activeHero(item);
  assert.equal(isActionable(item), true);
  assert.equal(h.bar, null);
  assert.equal(h.meta, "Filme · 2h 15min");
  assert.doesNotMatch(`${h.description} ${h.meta}`, /epis|T\d+:E|%/i);
  assert.equal(h.href, `/title/movie/${item.tmdb_id}`);
  assert.equal(activeHero(await one(movieRow({ title: "Sem duração", runtime: null }))).meta, "Filme");
  assert.equal(formatRuntime(90), "1h 30min");
  assert.equal(formatRuntime(120), "2h");
  assert.equal(formatRuntime(45), "45 min");
});

test("hero: Reassistindo — acionável, sem próximo e sem barra inventados", async () => {
  const item = await one(tvRow({ title: "Rewatch", status: "rewatching", watched: eps([[1, 1, 10], [2, 1, 10]]) }));
  const h = activeHero(item);
  assert.equal(h.eyebrow, "CONTINUE REASSISTINDO");
  assert.equal(h.bar, null);
  assert.doesNotMatch(h.description, /T\d+:E/);
  assert.equal(h.href, `/title/tv/${item.tmdb_id}`);
  const movie = await one(movieRow({ title: "Filme de novo", status: "rewatching" }));
  assert.equal(activeHero(movie).eyebrow, "CONTINUE REASSISTINDO");
});

test("elegibilidade: só Assistindo e Reassistindo (Pausado/Abandonado/fila/concluídos não)", () => {
  assert.deepEqual([...ACTIVE_STATUSES], ["watching", "rewatching"]);
  for (const s of ["watching", "rewatching"]) assert.equal(isActiveStatus(s), true);
  for (const s of ["paused", "dropped", "want", "watched", "rewatched", "legacy", ""]) assert.equal(isActiveStatus(s), false);
});

test("hero: série sem episodes_progress → 'Ainda não começou', começa em T1:E01, barra 0 de N", async () => {
  const item = await one(tvRow({ title: "Nova" }));
  const h = activeHero(item);
  assert.equal(h.description, "Ainda não começou · começa em T1:E01");
  assert.equal(h.action, "Começar");
  assert.equal(h.bar.percent, 0);
  assert.equal(h.bar.label, "0 de 20 episódios exibidos");
});

test("hero: série sem estrutura conhecida e sem episódios → não inventa próximo nem barra", async () => {
  const item = await one(tvRow({ title: "Sem dados", seasons: [], last: null }));
  const h = activeHero(item);
  assert.equal(h.bar, null);
  assert.doesNotMatch(h.description, /T\d+:E/);
});

test("hero: episódio futuro não conta como disponível (série em exibição em dia)", async () => {
  const item = await one(tvRow({ title: "No ar", seasons: [[1, 10], [2, 8]], last: [2, 4], showStatus: "Returning Series", watched: eps([[1, 1, 10], [2, 1, 4]]) }));
  assert.equal(item.library_progress.state, "caught_up");
  assert.equal(item.library_progress.next, null);
  assert.equal(isActionable(item), false);
});

test("hero: Season 0 nunca é próximo nem entra no total", async () => {
  const item = await one(tvRow({ title: "Especiais", seasons: [[0, 5], [1, 10]], last: [1, 10], watched: [[0, 1], [0, 2], [1, 1]] }));
  assert.equal(item.progress.total, 10);
  assert.equal(item.progress.watched, 1);
  assert.equal(activeHero(item).description, "Próximo episódio: T1:E02");
});

test("hero: estrutura stale — sem barra/percentual; tudo visto + stale = fato, sem 'em dia'", async () => {
  const partial = await one(tvRow({ title: "Stale", watched: [[1, 1]], counts: { seasons: 3, episodes: 30 } }));
  assert.equal(partial.library_progress.state, "in_progress");
  assert.equal(activeHero(partial).bar, null);
  const all = await one(tvRow({ title: "Stale tudo", watched: eps([[1, 1, 10], [2, 1, 10]]), counts: { seasons: 3, episodes: 30 } }));
  const h = activeHero(all);
  assert.equal(all.library_progress.state, "unknown");
  assert.equal(h.bar, null);
  assert.equal(isActionable(all), true);
  assert.doesNotMatch(h.description, /em dia|concluída/i);
});

test("hero: importado como assistido sem histórico de episódios (legado) → só a temporada registrada", async () => {
  const item = await one(tvRow({ title: "Legado", completed: 2, seasons: [[1, 10], [2, 10], [3, 10]], last: [3, 10] }));
  const h = activeHero(item);
  assert.equal(item.library_progress.state, "legacy");
  assert.equal(h.description, "Temporadas 1–2 concluídas");
  assert.equal(h.bar, null);
});

/* ================================================================ BARRA */

test("barra: numerador/denominador e barra são a MESMA grandeza (episódios exibidos da série)", async () => {
  const item = await one(tvRow({ title: "32 de 40", seasons: [[1, 10], [2, 10], [3, 10], [4, 10]], last: [4, 10], watched: eps([[1, 1, 10], [2, 1, 10], [3, 1, 10], [4, 1, 2]]) }));
  const h = activeHero(item);
  assert.equal(h.bar.label, "32 de 40 episódios exibidos");
  assert.equal(h.bar.percent, 80);
  assert.equal(h.bar.percent, Math.round((item.progress.watched / item.progress.total) * 100));
  assert.ok(h.meta.startsWith(h.bar.label), "a linha de contexto é exatamente o que a barra mede");
});

test("barra: duração por episódio entra como complemento explícito, não como unidade da barra", async () => {
  const spec = tvRow({ title: "Com duração", watched: [[1, 1]] });
  const item = await one(spec);
  item.episode_runtime = 45;
  const h = activeHero(item);
  assert.equal(h.meta, `${h.bar.label} · ~45 min por episódio`);
});

/* ================================================================ HOME × LIBRARY */

test("Home × Library: mesmo título → mesmo progresso e mesmo próximo episódio (mesmo helper)", async () => {
  const specs = [
    tvRow({ title: "The Chosen", seasons: [[1, 8], [2, 8], [3, 8], [4, 8], [5, 8]], last: [5, 8], showStatus: "Returning Series", watched: eps([[1, 1, 8], [2, 1, 8], [3, 1, 8], [4, 1, 3]]) }),
    tvRow({ title: "Supernatural", seasons: Array.from({ length: 15 }, (_, i) => [i + 1, 20]), last: [15, 20], watched: eps([[1, 1, 20], [2, 1, 7]]) }),
    tvRow({ title: "Início", watched: [[1, 1]] }),
    tvRow({ title: "Quase", watched: eps([[1, 1, 10], [2, 1, 9]]) }),
    tvRow({ title: "Em dia", showStatus: "Returning Series", watched: eps([[1, 1, 10], [2, 1, 10]]) }),
    tvRow({ title: "Encerrada", watched: eps([[1, 1, 10], [2, 1, 10]]) }),
  ];
  const { items } = await homeItems(specs);
  // Biblioteca: mesmas linhas, sem a contagem global (formato de /api/library).
  const libRows = specs.map((s) => structuredClone(s.row));
  const { sql } = fakeSql(specs.flatMap((s) => s.watched));
  await attachSeriesProgress(sql, "user-a", libRows);

  items.forEach((item, i) => {
    assert.deepEqual(item.library_progress, libRows[i].library_progress, item.title);
    // e ambos = regra canônica direta
    const spec = specs[i];
    const structure = tvStructureFromRaw({ seasons: spec.row._seasons, last_episode_to_air: spec.row._last_episode, status: spec.row._series_status });
    const watched = spec.watched.map(({ season_number, episode_number }) => ({ season_number, episode_number }));
    const progress = computeTvProgress(structure, watched);
    assert.deepEqual(item.progress, progress, item.title);
    assert.deepEqual(item.library_progress, libraryProgress({ status: "watching", progress, structure, watched, completedSeasons: 0 }));
    if (item.library_progress.next) assert.match(activeHero(item).description, new RegExp(`T${item.library_progress.next.season}:E0?${item.library_progress.next.episode}$`));
  });
  assert.equal(items[0].library_progress.card, "Próximo: T4:E04 · 3/8");
  assert.equal(items[1].library_progress.card, "Próximo: T2:E08 · 7/20");
  assert.equal(items[4].library_progress.state, "caught_up");
  assert.equal(items[5].library_progress.state, "completed");
  assert.ok(!("_seasons" in items[0]) && !("_last_episode" in items[0]) && !("_series_status" in items[0]), "colunas auxiliares nunca vão ao client");
  assert.ok(!("progress" in libRows[0]), "a Biblioteca não recebe a contagem global");
});

test("sem N+1: progresso de N séries em UMA consulta; nenhuma consulta sem séries", async () => {
  const specs = Array.from({ length: 12 }, (_, i) => tvRow({ title: `S${i}`, watched: [[1, 1]] }));
  const { calls } = await homeItems([...specs, movieRow({ title: "M" })]);
  assert.equal(calls.length, 1);
  const none = await homeItems([movieRow({ title: "Só filme" })]);
  assert.equal(none.calls.length, 0);
});

/* ================================================================ RETOMAR / RESUMO */

test("Retomar: aparece com 2+ ativos; com 1 ativo que já é o destaque, não repete", () => {
  const base = { homeState: "ready", agendaState: "ready", activityState: "ready", totals: { library: 3 }, want: 0, best: 0, agendaCount: 0, moments: 0 };
  assert.equal(homeSections({ ...base, watching: 1, kind: "watching" }).resume, false);
  assert.equal(homeSections({ ...base, watching: 2, kind: "watching" }).resume, true);
  assert.equal(homeSections({ ...base, watching: 1, kind: "calendar" }).resume, true);
});

test("card 'Em andamento' não repete o destaque", async () => {
  const { items } = await homeItems([tvRow({ title: "Hero", watched: [[1, 1]] }), tvRow({ title: "Outra", watched: eps([[1, 1, 3]]) })]);
  const hero = pickHeroItem(items);
  assert.equal(watchingSummaryLine(items, hero), "Outra · T1:E04");
  assert.equal(watchingSummaryLine([items[0]], items[0]), "Ver na Biblioteca");
  const movies = await homeItems([movieRow({ title: "H" }), movieRow({ title: "M2" })]);
  assert.equal(watchingSummaryLine(movies.items, movies.items[0]), "Também: M2");
});

/* ================================================================ DIÁRIO */

const MOVIE = { id: 1, tmdb_id: 558, media_type: "movie", title: "Homem-Aranha", poster_path: null };
const SHOW = { id: 3, tmdb_id: 95480, media_type: "tv", title: "Slow Horses", poster_path: null };
const GONE = { id: 9, tmdb_id: 99, media_type: "movie", title: "Removido da Biblioteca", poster_path: null };
const at = (day, hm) => new Date(`${day}T${hm}:00-03:00`).toISOString();
const ev = (type, day, hm, media, meta = {}) => ({ id: `e${++seq}`, source: "event", type, at: at(day, hm), day, time: hm, media, meta });
const watch = (day, hm, media, o = {}) => ({ id: `w${++seq}`, source: "watch", at: at(day, hm), day, time: o.time === undefined ? hm : o.time, media, rating: o.rating ?? null, comment: null, is_rewatch: Boolean(o.is_rewatch), watch_number: o.watch_number ?? 1 });
const ep = (day, hm, media, season, episode) => ({ id: `p${++seq}`, source: "episode", at: at(day, hm), day, time: hm, media, season, episode, season_done: false, series_done: false });

test("Diário: Home = os primeiros momentos do Diário, mesma ordem e mesma copy", () => {
  const items = [
    watch("2026-10-14", "21:00", MOVIE, { rating: 8 }),
    ep("2026-10-13", "20:00", SHOW, 1, 1),
    ep("2026-10-13", "20:40", SHOW, 1, 2),
    ev("status_changed", "2026-10-12", "10:00", MOVIE, { from: "watching", to: "dropped" }),
    ev("library_removed", "2026-10-11", "09:00", GONE),
    watch("2026-10-10", "09:00", MOVIE, { is_rewatch: true, watch_number: 2 }),
  ];
  const days = buildDays(items);
  const flat = days.flatMap((d) => d.moments);
  const recent = recentMoments(days, 3);
  assert.deepEqual(recent.map((m) => m.id), flat.slice(0, 3).map((m) => m.id));
  assert.deepEqual(recent.map(headline), ["Assistiu", "Assistiu 2 episódios", "Parou de assistir"]);
  assert.ok(!recent.some((m) => /mudou de status/i.test(headline(m))));
  const all = recentMoments(days, 10);
  const removed = all.find((m) => m.kind === "removed");
  assert.equal(removed.media.title, "Removido da Biblioteca", "título removido continua com nome");
  assert.equal(headline(removed), "Removeu da biblioteca");
  assert.equal(headline(all.find((m) => m.kind === "rewatched")), "Reassistiu");
});

test("Diário: sem horário conhecido → só a data (time = null)", () => {
  const days = buildDays([watch("2026-10-14", "00:00", MOVIE, { time: null })]);
  assert.equal(recentMoments(days)[0].time, null);
});

test("Diário: recentMoments respeita o limite e não duplica", () => {
  const days = buildDays([watch("2026-10-14", "21:00", MOVIE), watch("2026-10-14", "10:00", GONE)]);
  const twice = [...days, ...days];
  const r = recentMoments(twice, 5);
  assert.equal(new Set(r.map((m) => m.id)).size, r.length);
  assert.equal(recentMoments(days, 1).length, 1);
  assert.deepEqual(recentMoments([], 3), []);
});

/** sql falso para loadDiaryMonth: meses + 3 consultas por mês. */
function diarySql(byMonth) {
  const calls = [];
  const sql = async (strings, ...values) => {
    const text = strings.join("?");
    calls.push(text);
    if (text.includes("GROUP BY 1")) return Object.keys(byMonth).sort().reverse().map((m) => ({ m }));
    const start = String(values.find((v) => typeof v === "string" && /^\d{4}-\d{2}-01 /.test(v)) || "");
    const month = start.slice(0, 7);
    if (text.includes("activity_events ae") || text.includes("FROM public.activity_events e")) return byMonth[month] ?? [];
    return [];
  };
  return { sql, calls };
}
const evRow = (month, day, hm, title) => ({ id: ++seq, event_type: "status_changed", metadata: { from: "want", to: "watching" }, occurred_at: `${month}-${day}T${hm}:00-03:00`, day: `${month}-${day}`, hm, mid: seq, tmdb_id: seq, media_type: "movie", title, poster_path: null, recovered: false });

test("Diário: mês recente com poucos momentos → completa com o mês anterior (máx. 2 meses)", async () => {
  const { sql, calls } = diarySql({ "2026-10": [evRow("2026-10", "02", "10:00", "Outubro")], "2026-09": [evRow("2026-09", "20", "10:00", "Set A"), evRow("2026-09", "21", "11:00", "Set B")], "2026-08": [evRow("2026-08", "01", "10:00", "Ago")] });
  const moments = await loadRecentMoments(sql, "user-a", "2026-10-15", 3);
  assert.deepEqual(moments.map((m) => m.media.title), ["Outubro", "Set B", "Set A"]);
  assert.equal(calls.filter((c) => c.includes("GROUP BY 1")).length, 2);
  const full = diarySql({ "2026-10": [evRow("2026-10", "01", "10:00", "A"), evRow("2026-10", "02", "10:00", "B"), evRow("2026-10", "03", "10:00", "C")] });
  assert.equal((await loadRecentMoments(full.sql, "user-a", "2026-10-15", 3)).length, 3);
  assert.equal(full.calls.length, 4, "mês suficiente: 4 consultas, sem buscar o anterior");
});

/** sql falso por mês: { "AAAA-MM": { events, watches } } — mesmas 4 consultas de loadDiaryMonth. */
function diarySql2(byMonth) {
  const calls = [];
  const sql = async (strings, ...values) => {
    const text = strings.join("?");
    calls.push(text);
    if (text.includes("GROUP BY 1")) return Object.keys(byMonth).sort().reverse().map((m) => ({ m }));
    const month = String(values.find((v) => typeof v === "string" && /^\d{4}-\d{2}-01 /.test(v)) || "").slice(0, 7);
    const data = byMonth[month] ?? {};
    if (text.includes("FROM public.activity_events e")) return data.events ?? [];
    if (text.includes("FROM public.watch_entries we")) return data.watches ?? [];
    return [];
  };
  return { sql, calls };
}
// `day`/`hm` chegam do banco já no dia civil de Brasília (AT TIME ZONE); a fronteira real é provada no TEST.
const evAt = (day, hm, title, type = "status_changed", meta = { from: "want", to: "watching" }) => ({ id: ++seq, event_type: type, metadata: meta, occurred_at: `${day}T${hm}:00-03:00`, day, hm, mid: seq, tmdb_id: seq, media_type: "movie", title, poster_path: null, recovered: false });
const watchAt = (day, hm, title, precision) => ({ id: ++seq, watched_at: `${day}T${hm}:00-03:00`, watched_at_precision: precision, rating: null, comment: null, is_rewatch: false, day, hm, watch_number: 1, mid: seq, tmdb_id: seq, media_type: "movie", title, poster_path: null });

test("Diário recente: 1º de novembro sem nada em novembro → momentos de outubro (nunca seção vazia)", async () => {
  const { sql, calls } = diarySql2({ "2026-10": { events: [evAt("2026-10-31", "23:50", "Dia 31"), evAt("2026-10-30", "20:00", "Dia 30"), evAt("2026-10-28", "19:00", "Dia 28")] } });
  const moments = await loadRecentMoments(sql, "user-a", "2026-11-01", 3);
  assert.deepEqual(moments.map((m) => [m.media.title, m.day, m.time]), [["Dia 31", "2026-10-31", "23:50"], ["Dia 30", "2026-10-30", "20:00"], ["Dia 28", "2026-10-28", "19:00"]]);
  assert.equal(calls.length, 4, "um mês basta: 4 consultas");
});

test("Diário recente: novembro com 1 momento + outubro com vários → 1 de novembro + 2 mais recentes de outubro", async () => {
  const { sql } = diarySql2({
    "2026-11": { events: [evAt("2026-11-01", "08:00", "Nov 1")] },
    "2026-10": { events: [evAt("2026-10-31", "23:50", "Out 31"), evAt("2026-10-30", "20:00", "Out 30"), evAt("2026-10-12", "10:00", "Out 12")] },
  });
  const moments = await loadRecentMoments(sql, "user-a", "2026-11-01", 3);
  assert.deepEqual(moments.map((m) => m.media.title), ["Nov 1", "Out 31", "Out 30"]);
});

test("Diário recente: meses esparsos são percorridos progressivamente, com teto de meses", async () => {
  const months = { "2026-11": { events: [evAt("2026-11-01", "08:00", "Nov")] }, "2026-09": { events: [evAt("2026-09-10", "08:00", "Set")] }, "2026-06": { events: [evAt("2026-06-10", "08:00", "Jun")] }, "2026-01": { events: [evAt("2026-01-10", "08:00", "Jan")] }, "2025-12": { events: [evAt("2025-12-10", "08:00", "Dez")] } };
  const all = diarySql2(months);
  assert.deepEqual((await loadRecentMoments(all.sql, "user-a", "2026-11-01", 3)).map((m) => m.media.title), ["Nov", "Set", "Jun"], "pula meses sem atividade");
  const capped = diarySql2(months);
  const few = await loadRecentMoments(capped.sql, "user-a", "2026-11-01", 10, 4);
  assert.deepEqual(few.map((m) => m.media.title), ["Nov", "Set", "Jun", "Jan"], "teto de 4 meses: dezembro de 2025 não é lido");
  assert.equal(capped.calls.length, 16);
});

test("Diário recente: precisão temporal preservada (datetime → hora; date/desconhecida → só a data)", async () => {
  const { sql } = diarySql2({ "2026-10": { watches: [watchAt("2026-10-20", "21:10", "Com hora", "datetime"), watchAt("2026-10-19", "00:00", "Só data", "date"), watchAt("2026-10-18", "00:00", "Desconhecida", null)] } });
  const moments = await loadRecentMoments(sql, "user-a", "2026-11-01", 3);
  assert.deepEqual(moments.map((m) => [m.media.title, m.time]), [["Com hora", "21:10"], ["Só data", null], ["Desconhecida", null]]);
});

test("Diário recente: título removido da Biblioteca continua identificado", async () => {
  const { sql } = diarySql2({ "2026-10": { events: [evAt("2026-10-31", "22:00", "Removido", "library_removed", {})] } });
  const [moment] = await loadRecentMoments(sql, "user-a", "2026-11-01", 3);
  assert.equal(moment.kind, "removed");
  assert.equal(moment.media.title, "Removido");
  assert.equal(headline(moment), "Removeu da biblioteca");
});

/* ================================================================ AGENDA */

const TODAY = "2026-10-15";
function calendarEvents() {
  const library = new Map([
    ["tv-1", { tmdb_id: 1, media_type: "tv", status: "watching", watched: new Set(["1-1", "1-2"]) }],
    ["tv-2", { tmdb_id: 2, media_type: "tv", status: "paused", watched: new Set() }],
    ["movie-3", { tmdb_id: 3, media_type: "movie", status: "want", watched: new Set() }],
  ]);
  const series = [
    { tmdb_id: 1, title: "The Chosen", poster_path: null, backdrop_path: null, popularity: 5, seasons: [{ season_number: 1, episode_count: 8 }], episodes: [
      { season_number: 1, episode_number: 3, air_date: "2026-10-15" },
      { season_number: 1, episode_number: 4, air_date: "2026-10-22" },
      { season_number: 1, episode_number: 5, air_date: "2026-10-29" },
    ] },
    { tmdb_id: 2, title: "Pausada", poster_path: null, backdrop_path: null, popularity: 1, seasons: [{ season_number: 2, episode_count: 10 }], episodes: [{ season_number: 2, episode_number: 1, air_date: "2026-10-16" }] },
  ];
  const movies = [{ tmdb_id: 3, title: "Filme", poster_path: null, backdrop_path: null, date: "2026-10-15", release_label: "Digital", popularity: 0, fromLibrary: true }];
  const discoveries = [{ tmdb_id: 77, media_type: "movie", title: "Não é seu", poster_path: null, backdrop_path: null, date: "2026-10-15", popularity: 99 }];
  return buildEvents({ from: "2026-10-01", to: "2026-12-13", library, series, movies, discoveries, watchedMovies: new Set() });
}

test("Agenda: mesmos eventos do Calendário (subconjunto pessoal, mesma ordem), só futuros", () => {
  const events = calendarEvents();
  const a = homeAgenda(events, TODAY);
  const calendarOrder = events.filter((e) => e.date >= TODAY && !e.watched && e.relationship).map((e) => e.id);
  assert.deepEqual(a.preview.map((e) => e.id), calendarOrder.slice(0, 6));
  assert.ok(a.preview.every((e) => events.includes(e)), "mesmos objetos do Calendário, nenhum evento próprio");
  assert.ok(!a.preview.some((e) => e.title === "Não é seu"), "descoberta geral não entra na agenda pessoal");
  assert.equal(a.next.date, TODAY);
  assert.equal(a.nextInDays, 0);
});

test("Agenda: data pura de Brasília — evento de hoje entra, de ontem não, sem meia-noite falsa", () => {
  const ev = (id, date, extra = {}) => ({ id, date, relationship: "following", watched: false, ...extra });
  const a = homeAgenda([ev("a", "2026-10-14"), ev("b", "2026-10-15"), ev("c", "2026-10-16"), ev("d", "2026-10-16", { watched: true }), ev("e", "2026-10-17", { relationship: null })], TODAY);
  assert.deepEqual(a.preview.map((e) => e.id), ["b", "c"]);
  assert.equal(homeAgenda([ev("x", "2026-10-16")], TODAY).nextInDays, 1);
  assert.equal(homeAgenda([ev("x", "2026-11-01")], "2026-10-31").nextInDays, 1);
});

test("Agenda: '3 próximos' = a MESMA lista da prévia (contagem não truncada pelo limite)", () => {
  const many = Array.from({ length: 10 }, (_, i) => ({ id: `e${i}`, date: `2026-10-${String(16 + i).padStart(2, "0")}`, relationship: "following", watched: false }));
  const a = homeAgenda([...many, many[0]], TODAY);
  assert.equal(a.count, 10, "deduplicado e não limitado a 6");
  assert.equal(a.preview.length, 6);
  const metric = homeMetrics({ library: 1, watched: 0, rated: 0, average_rating: null, completion_base: 0 }, a).find((m) => m.key === "agenda");
  assert.equal(metric.value, "10");
  assert.equal(homeMetrics({ library: 1, watched: 0, rated: 0, average_rating: null, completion_base: 0 }, { count: 0 }).some((m) => m.key === "agenda"), false);
});

/* ================================================================ MÉTRICAS */

const BY_STATUS_144 = { want: 39, watching: 9, watched: 70, rewatched: 12, rewatching: 0, paused: 2, dropped: 12 };

test("métricas: 144-equivalente — status exclusivos somam a Biblioteca; curtidos/notas fora da soma", () => {
  const t = statusTotals(BY_STATUS_144);
  assert.equal(t.library, 144);
  assert.equal(t.want, 39);
  assert.equal(t.watching, 9);
  assert.equal(t.watched, 82);
  assert.equal(t.completion_base, 105);
  const sumExclusive = Object.values(BY_STATUS_144).reduce((a, b) => a + b, 0);
  assert.equal(sumExclusive, t.library);
  // Curtidos (13) e Avaliados (96) são ortogonais: somar os 4 cards ≠ Biblioteca, e está certo.
  assert.notEqual(t.watching + t.want + 13 + 96, t.library);
});

test("métricas: Reassistindo conta como em andamento E como já concluído uma vez", () => {
  const t = statusTotals({ rewatching: 2, watched: 1 });
  assert.equal(t.watching, 2);
  assert.equal(t.watched, 3);
});

test("'concluídos': contagem factual (Assistido/Reassistindo/Reassistido), não % ambíguo", () => {
  const totals = { ...statusTotals(BY_STATUS_144), favorites: 13, rated: 96, average_rating: 7.63 };
  const m = homeMetrics(totals, { count: 3 });
  assert.deepEqual(m.map((x) => `${x.value} ${x.label}`), ["144 títulos", "82 concluídos", "★ 7.6 nota média", "3 próximos"]);
  assert.ok(!m.some((x) => x.value.includes("%")));
  assert.match(m[1].hint, /Assistido, Reassistindo ou Reassistido/);
  // Abandonado, Pausado, Assistindo e Quero assistir NÃO são concluídos.
  assert.equal(statusTotals({ dropped: 3, paused: 2, watching: 4, want: 5 }).watched, 0);
});

test("nota média: só notas pessoais; sem notas → sem métrica; uma nota → aparece", () => {
  const base = { library: 2, watched: 0, completion_base: 0 };
  assert.equal(homeMetrics({ ...base, rated: 0, average_rating: null }, null).some((m) => m.key === "rating"), false);
  const one = homeMetrics({ ...base, rated: 1, average_rating: 9 }, null).find((m) => m.key === "rating");
  assert.equal(one.value, "★ 9.0");
  assert.equal(one.hint, "Sua única nota pessoal");
  assert.equal(homeMetrics({ ...base, rated: 2, average_rating: 7.25 }, null).find((m) => m.key === "rating").hint, "Média das suas 2 notas pessoais");
});

/* ================================================================ COLD START */

function layout({ byStatus = {}, favorites = 0, rated = 0, average = null, watching = [], want = 0, best = 0, agendaCount = 0, moments = 0 }) {
  const totals = { ...statusTotals(byStatus), favorites, rated, average_rating: average };
  const hero = pickHeroItem(watching);
  const kind = heroKind({ hero, urgentEvent: false, queue: want > 0 });
  const show = homeSections({ homeState: "ready", agendaState: "ready", activityState: "ready", totals, watching: watching.length, want, best, kind, agendaCount, moments });
  return { totals, kind, show, metrics: homeMetrics(totals, { count: agendaCount }), cards: summaryCards(totals) };
}

test("cold start A — vazio total: direção simples, nenhum '0' e nenhuma seção vazia", () => {
  const l = layout({});
  assert.equal(l.kind, "discover");
  assert.equal(l.show.empty, true);
  assert.deepEqual(l.metrics, []);
  assert.deepEqual(l.cards, []);
  for (const key of ["resume", "agenda", "activity", "summary", "queue", "best"]) assert.equal(l.show[key], false, key);
});

test("cold start B — 1 Quero assistir: destaque da fila, só o card da fila", () => {
  const l = layout({ byStatus: { want: 1 }, want: 1 });
  assert.equal(l.kind, "queue");
  assert.deepEqual(l.cards, ["want"]);
  assert.deepEqual(l.metrics.map((m) => m.key), ["library"]);
  assert.equal(l.show.resume, false);
  assert.equal(l.show.queue, true);
});

test("cold start C — 1 filme Assistindo: destaque é o filme, Retomar não repete", async () => {
  const movie = await one(movieRow({ title: "Filme" }));
  const l = layout({ byStatus: { watching: 1 }, watching: [movie] });
  assert.equal(l.kind, "watching");
  assert.equal(l.show.resume, false);
  assert.deepEqual(l.cards, ["watching"]);
  assert.equal(activeHero(movie).bar, null);
});

test("cold start D — 1 série Assistindo sem episodes_progress", async () => {
  const show = await one(tvRow({ title: "Série" }));
  const l = layout({ byStatus: { watching: 1 }, watching: [show] });
  assert.equal(l.kind, "watching");
  assert.equal(activeHero(show).action, "Começar");
});

test("cold start E — 1 série com alguns episódios", async () => {
  const show = await one(tvRow({ title: "Série", watched: eps([[1, 1, 4]]) }));
  const l = layout({ byStatus: { watching: 1 }, watching: [show] });
  assert.equal(activeHero(show).description, "Próximo episódio: T1:E05");
  assert.equal(l.show.summary, true);
});

test("cold start F — Biblioteca sem notas: sem nota média, sem 'Avaliados', sem 'Melhores'", () => {
  const l = layout({ byStatus: { watched: 3, want: 2 }, want: 2 });
  assert.equal(l.metrics.some((m) => m.key === "rating"), false);
  assert.equal(l.cards.includes("rated"), false);
  assert.equal(l.show.best, false);
});

test("cold start G — notas mas nada Assistindo: sem Retomar, destaque cai para fila/descobrir", () => {
  const g = layout({ byStatus: { watched: 4 }, rated: 4, average: 8, best: 4 });
  assert.equal(g.kind, "discover");
  assert.equal(g.show.resume, false);
  assert.equal(g.show.best, true);
  assert.deepEqual(g.cards, ["rated"]);
});

test("seções: carregando → esqueleto; falha da Home não derruba Agenda/Atividade", () => {
  const base = { totals: { library: 0 }, watching: 0, want: 0, best: 0, kind: "discover", agendaCount: 2, moments: 1 };
  const loading = homeSections({ ...base, homeState: "loading", agendaState: "loading", activityState: "loading" });
  assert.equal(loading.skeleton, true);
  assert.equal(loading.empty, false, "nunca mostra 'comece seu catálogo' enquanto carrega");
  const failed = homeSections({ ...base, homeState: "error", agendaState: "ready", activityState: "ready" });
  assert.equal(failed.error, true);
  assert.equal(failed.empty, false, "erro não vira 'biblioteca vazia'");
  assert.equal(failed.agenda, true);
  assert.equal(failed.activity, true);
  const agendaDown = homeSections({ ...base, totals: { library: 3 }, homeState: "ready", agendaState: "error", activityState: "ready" });
  assert.equal(agendaDown.agenda, false);
  assert.equal(agendaDown.hero, true);
});

test("histórico fora da Biblioteca: Atividade aparece mesmo com Biblioteca vazia", () => {
  const l = layout({ moments: 2 });
  assert.equal(l.show.activity, true);
});

/* ================================================================ DUPLICAÇÃO */

test("duplicação por função: o mesmo título pode estar no destaque, Retomar e Agenda", async () => {
  const { items } = await homeItems([tvRow({ title: "The Chosen", watched: [[1, 1]] }), tvRow({ title: "Outra", watched: [[1, 1]] })]);
  const hero = pickHeroItem(items);
  const agenda = homeAgenda([{ id: `tv:${hero.tmdb_id}:s1:2026-10-16`, tmdb_id: hero.tmdb_id, date: "2026-10-16", relationship: "following", watched: false }], TODAY);
  assert.ok(items.includes(hero));
  assert.equal(agenda.preview[0].tmdb_id, hero.tmdb_id);
});

test("duplicação interna: a prévia da Agenda nunca repete um evento", () => {
  const e = { id: "x", date: "2026-10-16", relationship: "following", watched: false };
  assert.equal(homeAgenda([e, { ...e }, e], TODAY).preview.length, 1);
});

/* ================================================================ ÚLTIMA ATIVIDADE (V3.0 final) */

const { lastActivityOf, orderActive, CONTINUITY_STATUSES } = home;
const { loadHome, HOME_SHELF_LIMIT } = await import("../lib/home/load.ts");
const { statusTransition, rewatchEffect, applyStatusTransition } = await import("../lib/library/status-event.ts");

const facts = (id, o = {}) => ({ id, added_at: o.added ?? "2026-01-01T00:00:00Z", last_episode_at: o.ep ?? null, last_watch_at: o.watch ?? null, last_continuity_at: o.ev ?? null });

test("lastActivity: maior entre episódio, visualização e evento de continuidade; entrada na Biblioteca só sem fatos", () => {
  assert.equal(lastActivityOf(facts("a", { ep: "2026-10-10T10:00:00Z", watch: "2026-10-12T10:00:00Z", ev: "2026-10-11T10:00:00Z" })), "2026-10-12T10:00:00.000Z");
  assert.equal(lastActivityOf(facts("a", { added: "2026-03-01T00:00:00Z" })), "2026-03-01T00:00:00.000Z");
  assert.equal(lastActivityOf(facts("a", { added: "2026-10-14T00:00:00Z", ep: "2026-09-01T00:00:00Z" })), "2026-09-01T00:00:00.000Z", "fato real vence a data de entrada");
  assert.deepEqual([...CONTINUITY_STATUSES], ["watching", "rewatching"]);
});

test("nota / Curtir / review (só mudam updated_at, sem fato de continuidade) não reordenam", () => {
  const A = facts("a", { ep: "2026-10-15T20:00:00Z" });
  const B = facts("b", { ep: "2026-09-24T21:00:00Z", ev: "2026-09-24T20:00:00Z" });
  assert.deepEqual(orderActive([B, A], 12).map((f) => f.id), ["a", "b"]);
  // Nota, Curtir, descurtir e review em B: só `updated_at` muda — e ele não é lido.
  for (const updated of ["2026-10-15T21:00:00Z", "2026-10-15T21:01:00Z", "2026-10-15T21:02:00Z"]) {
    assert.deepEqual(orderActive([{ ...B, updated_at: updated }, A], 12).map((f) => f.id), ["a", "b"]);
  }
  // Continuidade real em B (episódio) sobe B.
  assert.deepEqual(orderActive([{ ...B, last_episode_at: "2026-10-15T22:00:00Z" }, A], 12).map((f) => f.id), ["b", "a"]);
  // Entrada real em Assistindo (evento de transição) também.
  assert.deepEqual(orderActive([{ ...B, last_continuity_at: "2026-10-15T22:00:00Z" }, A], 12).map((f) => f.id), ["b", "a"]);
});

test("ordem: desempate determinístico por id (desc) e limite", () => {
  const same = "2026-10-15T20:00:00Z";
  const list = ["0a", "ff", "7c"].map((id) => facts(id, { ep: same }));
  assert.deepEqual(orderActive(list, 12).map((f) => f.id), ["ff", "7c", "0a"]);
  assert.equal(orderActive(Array.from({ length: 50 }, (_, i) => facts(`id${i}`)), 12).length, 12);
});

/** sql falso que reproduz as consultas de loadHome e CONTA as idas ao banco. */
function homeSql(activeCount) {
  const calls = [];
  const ids = Array.from({ length: activeCount }, (_, i) => `00000000-0000-0000-0000-${String(i).padStart(12, "0")}`);
  const tagged = async (strings) => {
    const text = strings.join("?");
    calls.push(text.includes("episodes_progress") ? "progress" : "totals");
    return text.includes("episodes_progress") ? [] : [{ favorites: 0, rated: 0, average_rating: null, by_status: { watching: activeCount } }];
  };
  tagged.query = async (text, params) => {
    if (text.includes("WITH active")) {
      calls.push("facts");
      return ids.map((id, i) => facts(id, { ep: new Date(Date.UTC(2026, 9, 1 + (i % 28))).toISOString() }));
    }
    if (text.includes("li.id = ANY($2::uuid[])")) {
      calls.push("details");
      return params[1].map((id, i) => ({ id, status: "watching", completed_seasons: 0, media: { id: i + 1, tmdb_id: i + 1, media_type: "tv", title: `S${i}` }, _seasons: [{ season_number: 1, episode_count: 10 }], _last_episode: { season_number: 1, episode_number: 10 }, _series_status: "Ended", _run_time: [45] }));
    }
    calls.push("shelf");
    return [];
  };
  return { sql: tagged, calls };
}

test("query count constante: 1, 12 ou 50 títulos ativos → mesmas 7 consultas", async () => {
  const counts = {};
  for (const n of [1, 12, 50]) {
    const { sql, calls } = homeSql(n);
    const body = await loadHome(sql, "user-a");
    counts[n] = calls.length;
    assert.equal(body.watching.length, Math.min(n, HOME_SHELF_LIMIT));
    assert.equal(calls.filter((c) => c === "facts").length, 1, "fatos de continuidade: UMA consulta");
    assert.equal(calls.filter((c) => c === "details").length, 1);
    assert.equal(calls.filter((c) => c === "progress").length, 1);
  }
  assert.deepEqual(counts, { 1: 7, 12: 7, 50: 7 });
  const none = homeSql(0);
  await loadHome(none.sql, "user-a");
  assert.equal(none.calls.length, 5, "sem ativos: nem detalhes nem progresso");
});

/* ================================================================ EVENTO DE STATUS (PATCH = POST) */

test("transição: só quando o status pedido é diferente do gravado (mesma regra no PATCH e no POST)", () => {
  assert.deepEqual(statusTransition("want", "watching"), { from: "want", to: "watching" });
  assert.deepEqual(statusTransition("watching", "rewatching"), { from: "watching", to: "rewatching" });
  assert.equal(statusTransition("watching", "watching"), null, "mesmo status (retry/duplo clique)");
  assert.equal(statusTransition("watching", undefined), null, "salvar só nota/Curtir/review");
  assert.equal(statusTransition(null, "watching"), null, "item novo: a criação é library_added, não 'mudou de status'");
});

test("reassistidas: só entrar em Reassistindo ou ir direto a Reassistido conta +1; só a 1ª gera rewatch_started", () => {
  assert.deepEqual(rewatchEffect({ from: "watched", to: "rewatching" }), { increment: true, startsRewatch: true });
  assert.deepEqual(rewatchEffect({ from: "watching", to: "rewatching" }), { increment: true, startsRewatch: true });
  assert.deepEqual(rewatchEffect({ from: "watched", to: "rewatched" }), { increment: true, startsRewatch: false });
  assert.deepEqual(rewatchEffect({ from: "rewatching", to: "rewatched" }), { increment: false, startsRewatch: false }, "conclui a já contada");
  for (const [from, to] of [["want", "watching"], ["watching", "watched"], ["rewatching", "watching"], ["rewatched", "watched"], ["watching", "dropped"], ["dropped", "watching"]]) {
    assert.deepEqual(rewatchEffect({ from, to }), { increment: false, startsRewatch: false }, `${from} → ${to}`);
  }
});

test("transição atômica: UM comando com CAS, incremento na linha e os dois eventos condicionados ao vencedor", async () => {
  const calls = [];
  const sql = async (strings, ...values) => { calls.push({ text: strings.join("$"), values }); return [{ rewatch_count: 4, status_events: 1, rewatch_events: 1 }]; };
  const r = await applyStatusTransition(sql, { userId: "u", libraryItemId: "li", transition: { from: "watched", to: "rewatching" }, derived: { current_season: 1, completed_seasons: 0, stopped_season: null } });
  assert.equal(calls.length, 1, "uma ida ao banco = uma transação");
  const { text, values } = calls[0];
  assert.match(text, /WHERE id = \$ AND user_id = \$ AND status = \$/, "compare-and-set pelo status de origem");
  assert.match(text, /rewatch_count = COALESCE\(rewatch_count, 0\) \+ \$::int/, "incremento na própria linha, nunca valor lido antes");
  assert.match(text, /'status_changed'[\s\S]*FROM won/);
  assert.match(text, /'rewatch_started'[\s\S]*FROM won/);
  assert.ok(values.includes(1) && values.includes(true));
  assert.deepEqual(r, { won: true, rewatch_count: 4, status_events: 1, rewatch_events: 1 });
  // Quem perde o CAS não recebe linha: nenhum evento, nenhum incremento.
  const lost = await applyStatusTransition(async () => [], { userId: "u", libraryItemId: "li", transition: { from: "want", to: "watching" }, derived: { current_season: null, completed_seasons: 0, stopped_season: null } });
  assert.deepEqual(lost, { won: false, rewatch_count: null, status_events: 0, rewatch_events: 0 });
});

test("retry: o mesmo payload aplicado duas vezes gera UMA transição", () => {
  let stored = "want";
  const events = [];
  for (let i = 0; i < 2; i++) {
    const t = statusTransition(stored, "watching");
    if (t) events.push(t);
    stored = "watching";
  }
  assert.equal(events.length, 1);
});

const DAY = "2026-10-15";
test("novo item criado já Assistindo → um momento só ('Começou a assistir')", () => {
  const days = buildDays([ev("library_added", DAY, "20:00", SHOW, { status: "watching", media_type: "tv" })]);
  assert.equal(days[0].moments.length, 1);
  assert.equal(headline(days[0].moments[0]), "Começou a assistir");
});

test("item existente want → watching (POST ou PATCH) → um momento 'Começou a assistir'", () => {
  const added = ev("library_added", "2026-10-01", "10:00", MOVIE, { status: "want", media_type: "movie" });
  const meta = { from: "want", to: "watching", current_season: null, stopped_season: null };
  const viaPatch = buildDays([added, ev("status_changed", DAY, "20:00", MOVIE, meta)]);
  const viaPost = buildDays([added, ev("status_changed", DAY, "20:00", MOVIE, { ...meta })]);
  const today = (days) => days.find((d) => d.day === DAY).moments;
  assert.deepEqual(today(viaPatch).map(headline), ["Começou a assistir"]);
  assert.deepEqual(today(viaPost).map(headline), today(viaPatch).map(headline));
  assert.deepEqual(today(viaPost).map((m) => m.kind), today(viaPatch).map((m) => m.kind));
});

test("want → watching logo depois de adicionar (mesmo momento) → não vira 'Adicionou' + 'Começou'", () => {
  const days = buildDays([
    ev("library_added", DAY, "20:00", MOVIE, { status: "want", media_type: "movie" }),
    ev("status_changed", DAY, "20:05", MOVIE, { from: "want", to: "watching" }),
  ]);
  assert.deepEqual(days[0].moments.map(headline), ["Começou a assistir"]);
});

test("watching → rewatching: rewatch_started + status_changed (PATCH e POST gravam os dois) → um momento", () => {
  const days = buildDays([
    ev("rewatch_started", DAY, "21:00", SHOW, { rewatch_count: 1 }),
    ev("status_changed", DAY, "21:00", SHOW, { from: "watched", to: "rewatching" }),
  ]);
  assert.equal(days[0].moments.length, 1);
  assert.equal(days[0].moments[0].kind, "rewatch_started");
});
