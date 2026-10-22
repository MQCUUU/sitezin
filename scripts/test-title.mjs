// Testes de domínio da Página de Título (V3.1): node scripts/test-title.mjs
// Node 24 executa os .ts puros direto; o hook abaixo só completa a extensão dos imports
// relativos e resolve o alias "@/" (raiz do projeto) usado por alguns módulos puros.
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
const { workStatusLabel, languageName, countryNames, runtimeLabel, pickTrailer, pickOverviewFallback } = await import("../lib/title-locale.ts");
const { collapseProviderVariants } = await import("../lib/streaming/providers-br.ts");
const { normalizeWatchProviders } = await import("../components/media/providers/normalize.ts");
const { MEDIA_STATUS_OPTIONS } = await import("../lib/media-status.ts");
const { attachSeriesProgress } = await import("../lib/library/attach-progress.ts");
const { activeHero } = await import("../lib/home/home.ts");
const { upsertEpisodeRows } = await import("../lib/episode-progress.ts");
const { statusTransition, rewatchEffect } = await import("../lib/library/status-event.ts");
const { buildDays } = await import("../lib/diary/moments.ts");
const { headline } = await import("../lib/diary/copy.ts");
const { getEpisodeReleaseStatus } = await import("../lib/title-seasons.ts");

/* ================================================================ LOCALIZAÇÃO */

test("situação da obra (TMDB status) em PT-BR — distinta do status pessoal", () => {
  assert.equal(workStatusLabel("Returning Series", "tv"), "Em exibição");
  assert.equal(workStatusLabel("Ended", "tv"), "Encerrada");
  assert.equal(workStatusLabel("Canceled", "tv"), "Cancelada");
  assert.equal(workStatusLabel("Released", "movie"), "Lançado");
  assert.equal(workStatusLabel("In Production", "movie"), "Em produção");
  assert.equal(workStatusLabel("Algo novo", "tv"), null, "valor desconhecido não aparece cru em inglês");
  assert.equal(workStatusLabel(null, "tv"), null);
});

test("'EN' é idioma original (não classificação): vira 'Inglês'; código desconhecido não aparece", () => {
  assert.equal(languageName("en"), "Inglês");
  assert.equal(languageName("ja"), "Japonês");
  assert.equal(languageName("pt"), "Português");
  assert.equal(languageName("xx"), null);
  assert.equal(languageName("EN-US"), null);
  assert.equal(languageName(undefined), null);
});

test("países de origem pelo código ISO em PT-BR; sem código mantém o nome; sem repetição", () => {
  assert.deepEqual(countryNames([{ iso_3166_1: "US", name: "United States of America" }, { iso_3166_1: "GB", name: "United Kingdom" }]), ["Estados Unidos", "Reino Unido"]);
  assert.deepEqual(countryNames([{ iso_3166_1: "BR", name: "Brazil" }, { iso_3166_1: "br", name: "Brazil" }]), ["Brasil"]);
  assert.deepEqual(countryNames([{ name: "Atlantis" }]), ["Atlantis"]);
  assert.deepEqual(countryNames(null), []);
});

test("duração de filme sem inventar", () => {
  assert.equal(runtimeLabel(135), "2h 15min");
  assert.equal(runtimeLabel(45), "45min");
  assert.equal(runtimeLabel(0), null);
  assert.equal(runtimeLabel(null), null);
});

test("sinopse: pt-BR vazia → pt-PT → inglês → idioma original; nada → null (sem tradução automática)", () => {
  const t = (lang, region, overview) => ({ iso_639_1: lang, iso_3166_1: region, data: { overview } });
  assert.deepEqual(pickOverviewFallback({ translations: [t("en", "US", "English"), t("pt", "PT", "Português de Portugal")] }, "en"), { overview: "Português de Portugal", language: "pt" });
  assert.deepEqual(pickOverviewFallback({ translations: [t("ja", "JP", "日本語"), t("en", "GB", "British"), t("en", "US", "American")] }, "ja"), { overview: "American", language: "en" });
  assert.deepEqual(pickOverviewFallback({ translations: [t("ja", "JP", "日本語"), t("pt", "BR", "")] }, "ja"), { overview: "日本語", language: "ja" });
  assert.equal(pickOverviewFallback({ translations: [t("en", "US", "  ")] }, "en"), null);
  assert.equal(pickOverviewFallback(null, "en"), null);
});

/* ================================================================ TRAILER */

test("trailer: oficial > trailer > teaser > qualquer; PT antes de EN; só YouTube", () => {
  const v = (o) => ({ site: "YouTube", key: o.key, type: o.type ?? "Trailer", official: o.official ?? false, iso_639_1: o.lang ?? "en", name: o.key });
  assert.equal(pickTrailer({ results: [v({ key: "teaser", type: "Teaser" }), v({ key: "trailer" }), v({ key: "oficial", official: true })] }).key, "oficial");
  assert.equal(pickTrailer({ results: [v({ key: "en", official: true }), v({ key: "pt", official: true, lang: "pt" })] }).key, "pt");
  assert.equal(pickTrailer({ results: [{ site: "Vimeo", key: "x", type: "Trailer" }] }), null);
  assert.equal(pickTrailer({ results: [v({ key: "clip", type: "Clip" })] }).key, "clip");
  assert.equal(pickTrailer(undefined), null);
});

/* ================================================================ STREAMING BR */

test("streaming: variante some quando o serviço-base está na lista; variante sozinha fica", () => {
  const p = (id, name) => ({ id, name, logoPath: null });
  assert.deepEqual(collapseProviderVariants([p(8, "Netflix"), p(1796, "Netflix Standard with Ads"), p(119, "Amazon Prime Video"), p(2100, "Amazon Prime Video with Ads")]).map((x) => x.name), ["Netflix", "Amazon Prime Video"]);
  assert.deepEqual(collapseProviderVariants([p(582, "Paramount+ Amazon Channel")]).map((x) => x.name), ["Paramount+ Amazon Channel"], "única forma de assistir não some");
  assert.deepEqual(collapseProviderVariants([p(1, "HBO Max"), p(2, "HBO Max Amazon Channel"), p(3, "Globoplay")]).map((x) => x.name), ["HBO Max", "Globoplay"]);
});

test("streaming: região BR, mesma estrutura para filme e série (normalizador compartilhado)", () => {
  const raw = (extra = {}) => ({ results: { BR: { link: "https://tmdb/br", flatrate: [{ provider_id: 8, provider_name: "Netflix" }], ads: [{ provider_id: 1796, provider_name: "Netflix Standard with Ads" }], rent: [{ provider_id: 2, provider_name: "Apple TV" }], ...extra }, US: { flatrate: [{ provider_id: 15, provider_name: "Hulu" }] } } });
  const movie = normalizeWatchProviders(raw(), "BR");
  const tv = normalizeWatchProviders(raw(), "BR");
  assert.deepEqual(movie, tv);
  assert.deepEqual(movie.groups.map((g) => [g.kind, g.providers.map((x) => x.name)]), [["streaming", ["Netflix"]], ["rent", ["Apple TV"]]]);
  assert.ok(!JSON.stringify(movie).includes("Hulu"), "nunca mistura outra região");
  assert.deepEqual(normalizeWatchProviders({ results: {} }, "BR"), { groups: [], attributionUrl: null });
});

/* ================================================================ STATUS */

test("status: a página usa a lista canônica (mesma da Biblioteca e do banco)", () => {
  assert.deepEqual(MEDIA_STATUS_OPTIONS.map((o) => o.value).sort(), ["dropped", "paused", "rewatched", "rewatching", "want", "watched", "watching"]);
  assert.equal(MEDIA_STATUS_OPTIONS.find((o) => o.value === "dropped").label, "Abandonado");
  assert.equal(statusTransition("watching", "watching"), null, "salvar o mesmo status: 0 transição");
  assert.equal(statusTransition("watching", undefined), null, "nota/Curtir/review: sem transição");
  assert.deepEqual(rewatchEffect({ from: "watched", to: "rewatching" }), { increment: true, startsRewatch: true });
});

/* ================================================================ PROGRESSO: TÍTULO = BIBLIOTECA = HOME = QUICK VIEW */

let seq = 0;
function tvRow({ status = "watching", seasons, last, showStatus = "Ended", counts = {} }) {
  const id = ++seq;
  return {
    id: `li-${id}`,
    status,
    completed_seasons: 0,
    media: { id, tmdb_id: 5000 + id, media_type: "tv", title: `Série ${id}`, seasons_count: counts.seasons ?? null, episodes_count: counts.episodes ?? null },
    _seasons: seasons.map(([n, c]) => ({ season_number: n, episode_count: c })),
    _last_episode: last ? { season_number: last[0], episode_number: last[1] } : null,
    _series_status: showStatus,
  };
}
const eps = (list) => list.flatMap(([s, from, to]) => Array.from({ length: to - from + 1 }, (_, i) => [s, from + i]));
const fakeSql = (watched, mediaId) => {
  const calls = [];
  const sql = async (strings) => {
    calls.push(strings.join("?"));
    return watched.map(([s, e]) => ({ media_id: mediaId, season_number: s, episode_number: e }));
  };
  return { sql, calls };
};
async function surfaces(spec, watched) {
  // Mesma linha, três leituras: GET /api/library?tmdb_id (título/episódio), lista da Biblioteca, /api/home.
  const title = structuredClone(spec);
  const list = structuredClone(spec);
  const home = structuredClone(spec);
  await attachSeriesProgress(fakeSql(watched, spec.media.id).sql, "u", [title], { tvProgress: true });
  await attachSeriesProgress(fakeSql(watched, spec.media.id).sql, "u", [list]);
  await attachSeriesProgress(fakeSql(watched, spec.media.id).sql, "u", [home], { tvProgress: true });
  return { title, list, home };
}

test("série sintética: Título = Biblioteca = Quick View = Home → Próximo T2:E04 · 18/30", async () => {
  const spec = tvRow({ seasons: [[1, 15], [2, 15]], last: [2, 15] });
  const { title, list, home } = await surfaces(spec, eps([[1, 1, 15], [2, 1, 3]]));
  assert.deepEqual(title.library_progress, list.library_progress, "Título = Biblioteca (= Quick View, que usa library_progress)");
  assert.deepEqual(title.progress, home.progress, "Título = Home (contagem global)");
  assert.equal(title.library_progress.title, "Próximo episódio: T2:E04");
  assert.equal(list.library_progress.card, "Próximo: T2:E04 · 3/15");
  assert.equal(`${title.progress.watched}/${title.progress.total}`, "18/30");
  const hero = activeHero({ ...home, ...home.media, library_id: home.id });
  assert.equal(hero.description, "Próximo episódio: T2:E04");
  assert.equal(hero.bar.label, "18 de 30 episódios exibidos", "mesma frase da barra na página de título");
});

test("Season 0 não contamina o progresso; episódio futuro não é disponível nem 'próximo'", async () => {
  const s0 = tvRow({ seasons: [[0, 6], [1, 10]], last: [1, 10] });
  const a = await surfaces(s0, [[0, 1], [0, 2], [1, 1]]);
  assert.equal(a.title.progress.total, 10);
  assert.equal(a.title.progress.watched, 1);
  assert.deepEqual(a.title.library_progress.next, { season: 1, episode: 2 });
  const future = tvRow({ seasons: [[1, 10], [2, 8]], last: [2, 4], showStatus: "Returning Series" });
  const b = await surfaces(future, eps([[1, 1, 10], [2, 1, 4]]));
  assert.equal(b.title.library_progress.state, "caught_up");
  assert.equal(b.title.library_progress.next, null, "T2:E05 ainda não foi ao ar");
  assert.equal(b.title.progress.total, 14);
  assert.equal(getEpisodeReleaseStatus("2999-01-01"), "future");
  assert.equal(getEpisodeReleaseStatus(null), "unknown");
});

test("conclusão factual: 'Série concluída' só se encerrada/cancelada; em exibição = 'Você está em dia'", async () => {
  const all = eps([[1, 1, 10], [2, 1, 10]]);
  const airing = await surfaces(tvRow({ seasons: [[1, 10], [2, 10]], last: [2, 10], showStatus: "Returning Series" }), all);
  const ended = await surfaces(tvRow({ seasons: [[1, 10], [2, 10]], last: [2, 10], showStatus: "Ended" }), all);
  const canceled = await surfaces(tvRow({ seasons: [[1, 10], [2, 10]], last: [2, 10], showStatus: "Canceled" }), all);
  assert.equal(airing.title.library_progress.title, "Você está em dia");
  assert.equal(ended.title.library_progress.title, "Série concluída");
  assert.equal(canceled.title.library_progress.title, "Série concluída");
});

test("virada de temporada, início, sem episódios e estrutura stale", async () => {
  const turn = await surfaces(tvRow({ seasons: [[1, 10], [2, 10]], last: [2, 10] }), eps([[1, 1, 10]]));
  assert.deepEqual(turn.title.library_progress.next, { season: 2, episode: 1 });
  const none = await surfaces(tvRow({ seasons: [[1, 10]], last: [1, 10] }), []);
  assert.equal(none.title.library_progress.title, "Ainda não começou");
  const stale = await surfaces(tvRow({ seasons: [[1, 10], [2, 10]], last: [2, 10], counts: { seasons: 3, episodes: 30 } }), eps([[1, 1, 10], [2, 1, 10]]));
  assert.equal(stale.title.library_progress.state, "unknown", "não afirma 'em dia' com estrutura desatualizada");
  assert.equal(stale.title.progress.total, null, "sem barra");
});

test("filme: nenhum progresso inventado na página de título", async () => {
  const movie = { id: "m1", status: "watching", completed_seasons: 0, media: { id: 99, media_type: "movie", title: "Filme" } };
  const { calls } = fakeSql([], 99);
  await attachSeriesProgress(async (...a) => { calls.push(a); return []; }, "u", [movie], { tvProgress: true });
  assert.equal(movie.library_progress, undefined);
  assert.equal(movie.progress, undefined);
  assert.equal(calls.length, 0, "filme nem consulta episódios");
});

/* ================================================================ EPISÓDIOS EM LOTE (sem N+1) */

test("marcar 300 episódios = UMA consulta (antes: um INSERT por episódio)", async () => {
  const calls = [];
  const sql = async (strings, ...values) => { calls.push({ text: strings.join("$"), values }); return []; };
  const rows = Array.from({ length: 300 }, (_, i) => ({ season_number: 1 + Math.floor(i / 20), episode_number: 1 + (i % 20), watched_at: new Date(Date.UTC(2026, 0, 1)), watched_at_precision: "datetime" }));
  await upsertEpisodeRows(sql, { userId: "u", mediaId: 7, watched: true, rows });
  assert.equal(calls.length, 1);
  const [{ text, values }] = calls;
  assert.match(text, /FROM unnest\(/);
  assert.match(text, /ON CONFLICT \(user_id, media_id, season_number, episode_number\)/);
  const arrays = values.filter(Array.isArray);
  assert.equal(arrays.length, 4);
  assert.ok(arrays.every((a) => a.length === 300), "colunas alinhadas");
  assert.equal(arrays[2][0], "2026-01-01T00:00:00.000Z", "data do banco normalizada para ISO");
  const none = [];
  await upsertEpisodeRows(async (...a) => { none.push(a); return []; }, { userId: "u", mediaId: 7, watched: true, rows: [] });
  assert.equal(none.length, 0);
});

test("desmarcar a temporada: watched_at nulo, mesma consulta única", async () => {
  const calls = [];
  await upsertEpisodeRows(async (strings, ...values) => { calls.push(values); return []; }, { userId: "u", mediaId: 7, watched: false, rows: [1, 2, 3].map((e) => ({ season_number: 1, episode_number: e, watched_at: null, watched_at_precision: null })) });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].filter(Array.isArray)[2], [null, null, null]);
  assert.ok(calls[0].includes(false));
});

/* ================================================================ DIÁRIO */

const SHOW = { id: 3, tmdb_id: 95480, media_type: "tv", title: "Slow Horses", poster_path: null };
const at = (day, hm, s = 0) => new Date(`${day}T${hm}:${String(s).padStart(2, "0")}-03:00`).toISOString();
const ep = (day, hm, season, episode, s = 0) => ({ id: `p${season}-${episode}-${s}`, source: "episode", at: at(day, hm, s), day, time: hm, media: SHOW, season, episode, season_done: false, series_done: false });

test("marcar temporada em lote: UM momento 'Marcou N episódios', nunca 'mudou de status'", () => {
  const batch = Array.from({ length: 10 }, (_, i) => ep("2026-10-16", "21:00", 2, i + 1, i));
  const days = buildDays(batch);
  assert.equal(days[0].moments.length, 1);
  assert.equal(headline(days[0].moments[0]), "Marcou 10 episódios como assistidos");
});

test("episódio individual: 'Assistiu T1:E03'", () => {
  const days = buildDays([ep("2026-10-16", "21:00", 1, 3)]);
  assert.equal(headline(days[0].moments[0]), "Assistiu T1:E03");
});

/* ================================================================ ESTADO DERIVADO DE EPISÓDIOS (V3.1 final) */

const { deriveSeriesStatus, deriveSeasonFields } = await import("../lib/library/episode-status.ts");
const { planSeriesUpdate } = await import("../lib/library/episode-write.ts");
const { REMOVAL_EFFECTS, LIBRARY_ACTION_COPY } = await import("../lib/library/remove.ts");
const { tvStructureFromRaw } = await import("../lib/tv-progress.ts");

const series = (status, seasons, last, showStatus, counts = {}) => ({
  status,
  seasons_count: counts.seasons ?? null,
  episodes_count: counts.episodes ?? null,
  _seasons: seasons.map(([n, c]) => ({ season_number: n, episode_count: c })),
  _last_episode: last ? { season_number: last[0], episode_number: last[1] } : null,
  _series_status: showStatus,
});
const W = (list) => list.map(([s, e]) => ({ season_number: s, episode_number: e }));
const mark = (list, watched = true) => list.map(([s, e]) => ({ season_number: s, episode_number: e, watched }));
const range = (s, from, to) => Array.from({ length: to - from + 1 }, (_, i) => [s, from + i]);

test("série EM EXIBIÇÃO, todos os exibidos vistos → 'em dia', NÃO Assistido; E11 futuro não conta", () => {
  // 10 exibidos, 11º anunciado (temporada com 11, último exibido = E10).
  const row = series("watching", [[1, 11]], [1, 10], "Returning Series");
  const plan = planSeriesUpdate({ row, watchedBefore: [], changes: mark(range(1, 1, 10)), action: "watch" });
  assert.equal(plan.progress.state, "caught_up");
  assert.equal(`${plan.progress.watched}/${plan.progress.total}`, "10/10", "E11 fora do denominador");
  assert.equal(plan.status, "watching", "não vira Assistido por estar em dia");
  for (const previous of ["want", "paused", "dropped"]) {
    assert.equal(planSeriesUpdate({ row: { ...row, status: previous }, watchedBefore: [], changes: mark(range(1, 1, 10)), action: "watch" }).status, "watching");
  }
  // Mesmo se E11 aparecesse marcado (não deveria), não conta como disponível nem conclui.
  const withFuture = planSeriesUpdate({ row, watchedBefore: W(range(1, 1, 10)), changes: mark([[1, 11]]), action: "watch" });
  assert.equal(withFuture.progress.watched, 10);
  assert.equal(withFuture.status, "watching");
});

test("série ENCERRADA com tudo exibido visto → concluída → Assistido; Season 0 irrelevante", () => {
  for (const showStatus of ["Ended", "Canceled"]) {
    const row = series("watching", [[0, 5], [1, 10], [2, 10]], [2, 10], showStatus);
    const plan = planSeriesUpdate({ row, watchedBefore: W(range(1, 1, 10)), changes: mark(range(2, 1, 10)), action: "watch" });
    assert.equal(plan.progress.state, "completed");
    assert.equal(plan.status, "watched");
    assert.equal(plan.completed_seasons, 2);
  }
  // Especiais marcados ou não: nada muda.
  const row = series("watching", [[0, 5], [1, 10]], [1, 10], "Ended");
  const a = planSeriesUpdate({ row, watchedBefore: W(range(1, 1, 9)), changes: mark([[0, 1], [0, 2]]), action: "watch" });
  assert.equal(a.progress.watched, 9);
  assert.equal(a.status, "watching");
});

test("encerrada faltando episódio regular → não concluída, com próximo factual", () => {
  const row = series("watching", [[1, 10], [2, 10]], [2, 10], "Ended");
  const plan = planSeriesUpdate({ row, watchedBefore: W(range(1, 1, 10)), changes: mark(range(2, 1, 9)), action: "watch" });
  assert.equal(plan.progress.state, "in_progress");
  assert.deepEqual(plan.progress.next, { season: 2, episode: 10 });
  assert.equal(plan.status, "watching");
});

test("desmarcar o último de uma série concluída → Assistindo + próximo (sem 'Assistido + Próximo episódio')", () => {
  const row = series("watched", [[1, 10], [2, 10]], [2, 10], "Ended");
  const plan = planSeriesUpdate({ row, watchedBefore: W([...range(1, 1, 10), ...range(2, 1, 10)]), changes: mark([[2, 10]], false), action: "unwatch" });
  assert.equal(plan.progress.state, "in_progress");
  assert.deepEqual(plan.progress.next, { season: 2, episode: 10 });
  assert.equal(plan.status, "watching");
  assert.equal(plan.completed_seasons, 1);
  assert.equal(plan.current_season, 2);
});

test("Assistido manual: em dia (no ar) continua Assistido; com próximo disponível vira Assistindo", () => {
  const airing = series("watched", [[1, 10], [2, 8]], [2, 4], "Returning Series");
  assert.equal(planSeriesUpdate({ row: airing, watchedBefore: W(range(1, 1, 10)), changes: mark(range(2, 1, 4)), action: "watch" }).status, "watched");
  assert.equal(planSeriesUpdate({ row: airing, watchedBefore: W(range(1, 1, 10)), changes: mark(range(2, 1, 2)), action: "watch" }).status, "watching");
});

test("Reassistindo / Reassistido nunca são sobrescritos por episódios", () => {
  for (const status of ["rewatching", "rewatched"]) {
    const row = series(status, [[1, 10]], [1, 10], "Ended");
    assert.equal(planSeriesUpdate({ row, watchedBefore: [], changes: mark(range(1, 1, 10)), action: "watch" }).status, status);
    assert.equal(planSeriesUpdate({ row, watchedBefore: W(range(1, 1, 10)), changes: mark([[1, 10]], false), action: "unwatch" }).status, status);
  }
});

test("Pausado / Abandonado / Quero assistir: marcar = retomar (Assistindo); desmarcar não muda", () => {
  const p = { state: "in_progress", watched: 3, total: 10, percent: 30, next: { season: 1, episode: 4 } };
  for (const previous of ["paused", "dropped", "want"]) {
    assert.equal(deriveSeriesStatus(previous, "watch", p), "watching");
    assert.equal(deriveSeriesStatus(previous, "unwatch", p), previous);
  }
  assert.equal(deriveSeriesStatus("watching", "unwatch", p), "watching");
});

test("estrutura desatualizada (stale) nunca conclui; só a retomada", () => {
  const row = series("want", [[1, 10]], [1, 10], "Ended", { seasons: 2, episodes: 20 });
  const plan = planSeriesUpdate({ row, watchedBefore: [], changes: mark(range(1, 1, 10)), action: "watch" });
  assert.equal(plan.progress.state, "unknown");
  assert.equal(plan.status, "watching");
});

test("campos legados derivados dos mesmos fatos (temporadas completas consecutivas, temporada atual)", () => {
  const structure = tvStructureFromRaw({ seasons: [{ season_number: 1, episode_count: 3 }, { season_number: 2, episode_count: 3 }, { season_number: 3, episode_count: 3 }], last_episode_to_air: { season_number: 3, episode_number: 1 }, status: "Returning Series" });
  const watched = W([...range(1, 1, 3), ...range(2, 1, 2)]);
  const fields = deriveSeasonFields(structure, watched, { next: { season: 2, episode: 3 } });
  assert.deepEqual(fields, { completed_seasons: 1, current_season: 2 });
  const all = W([...range(1, 1, 3), ...range(2, 1, 3), [3, 1]]);
  assert.deepEqual(deriveSeasonFields(structure, all, { next: null }), { completed_seasons: 2, current_season: 3 }, "T3 ainda no ar não conta como completa");
});

/* ================================================================ REMOÇÃO / AÇÕES PÓS-AÇÃO */

test("remoção: o que fica, o que sai, o que volta ao readicionar — e copy verdadeira", () => {
  const preserved = REMOVAL_EFFECTS.preserved.join(" ");
  for (const fact of ["Diário", "visualizações", "episódios", "listas"]) assert.match(preserved, new RegExp(fact));
  assert.ok(REMOVAL_EFFECTS.deleted.some((d) => /tags/.test(d)) && REMOVAL_EFFECTS.deleted.some((d) => /categoria/.test(d)));
  assert.ok(REMOVAL_EFFECTS.restoredOnReadd.every((f) => REMOVAL_EFFECTS.deleted.includes(f)));
  assert.deepEqual([...REMOVAL_EFFECTS.notRestored], ["tags", "notas por categoria"]);
  assert.equal(LIBRARY_ACTION_COPY.readdLabel, "Adicionar novamente");
  assert.equal(LIBRARY_ACTION_COPY.addedRemoveLabel, "Remover");
  assert.ok(!Object.values(LIBRARY_ACTION_COPY).some((text) => /desfa/i.test(text)), "nada promete 'desfazer'");
  assert.match(LIBRARY_ACTION_COPY.readdedDescription, /tags e notas por categoria não/);
});
