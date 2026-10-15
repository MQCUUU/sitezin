// Testes de domínio do Diário (V2.5): node scripts/test-diary-moments.mjs
// Node 24 executa os .ts puros direto (sem dependências de runtime).
import test from "node:test";
import assert from "node:assert/strict";

import { buildDays, clusterItems, filterDays, toMoment, LIBRARY_GROUP_MIN } from "../lib/diary/moments.ts";
import { episodeRange, headline, detail, milestone, seasonsLabel, plural, formatRating, groupSummary, momentAria } from "../lib/diary/copy.ts";

/* ---------- fábricas ---------- */
const MOVIE = { id: 1, tmdb_id: 693134, media_type: "movie", title: "Duna: Parte Dois", poster_path: "/d.jpg" };
const MOVIE2 = { id: 2, tmdb_id: 558, media_type: "movie", title: "Homem-Aranha 2", poster_path: null };
const SHOW = { id: 3, tmdb_id: 95480, media_type: "tv", title: "Slow Horses", poster_path: "/s.jpg" };
const SHOW2 = { id: 4, tmdb_id: 1396, media_type: "tv", title: "Breaking Bad", poster_path: "/b.jpg" };
let seq = 0;
const at = (day, hm, s = 0) => new Date(`${day}T${hm}:${String(s).padStart(2, "0")}-03:00`).toISOString();
const ev = (type, day, hm, media, meta = {}, s = 0) => ({ id: `e${++seq}`, source: "event", type, at: at(day, hm, s), day, time: hm, media, meta });
const watch = (day, hm, media, o = {}) => ({ id: `w${++seq}`, source: "watch", at: at(day, hm), day, time: o.time === undefined ? hm : o.time, media, rating: o.rating ?? null, comment: o.comment ?? null, is_rewatch: Boolean(o.is_rewatch), watch_number: o.watch_number ?? 1 });
const ep = (day, hm, media, season, episode, o = {}) => ({ id: `p${++seq}`, source: "episode", at: at(day, hm, o.s ?? 0), day, time: o.time === undefined ? hm : o.time, media, season, episode, season_done: Boolean(o.season_done), series_done: Boolean(o.series_done) });
const D = "2026-10-14";
const one = (items) => {
  const days = buildDays(items);
  assert.equal(days.length, 1);
  return days[0];
};

/* ---------- FILME ---------- */
test("filme: assistiu", () => {
  const m = toMoment([watch(D, "21:14", MOVIE)]);
  assert.equal(m.kind, "watched");
  assert.equal(headline(m), "Assistiu");
  assert.equal(m.time, "21:14");
});

test("filme: avaliou e comentou no mesmo momento (sem card separado)", () => {
  const d = one([watch(D, "21:14", MOVIE, { rating: 8.5, comment: "Visualmente incrível." })]);
  assert.equal(d.moments.length, 1);
  assert.equal(d.moments[0].rating, 8.5);
  assert.equal(d.moments[0].comment, "Visualmente incrível.");
  assert.equal(formatRating(8.5), "8,5");
  assert.equal(formatRating(7), "7,0");
});

test("filme: adicionou + mudou para assistido + registrou = 1 momento 'Assistiu'", () => {
  const items = [
    ev("library_added", D, "18:40", MOVIE, { status: "want", media_type: "movie" }),
    ev("status_changed", D, "18:42", MOVIE, { from: "want", to: "watched" }),
    watch(D, "18:42", MOVIE, { rating: 7.5, comment: "Gostei" }),
  ];
  const d = one(items);
  assert.equal(d.moments.length, 1);
  const m = d.moments[0];
  assert.equal(m.kind, "watched");
  assert.equal(m.rating, 7.5);
  assert.equal(m.raw.length, 3, "nenhuma linha crua perdida");
});

test("filme: NUNCA vira 'Concluiu a série' (legado series_completed + status → watched)", () => {
  const items = [
    ev("status_changed", D, "10:00", MOVIE, { from: "want", to: "watched" }),
    ev("series_completed", D, "10:00", MOVIE, { completed_seasons: 0, current_season: null }),
  ];
  const m = toMoment(items);
  assert.equal(m.kind, "watched");
  assert.equal(headline(m), "Assistiu");
  assert.doesNotMatch(momentAria(m), /série/i);
  // series_completed sozinho em filme também
  assert.equal(headline(toMoment([ev("series_completed", D, "10:00", MOVIE, {})])), "Assistiu");
});

test("filme: adicionado direto como assistido = Assistiu", () => {
  assert.equal(headline(toMoment([ev("library_added", D, "09:00", MOVIE, { status: "watched", media_type: "movie" })])), "Assistiu");
});

test("adição isolada à watchlist é secundária", () => {
  const m = toMoment([ev("library_added", D, "09:00", MOVIE, { status: "want", media_type: "movie" })]);
  assert.equal(m.tier, "secondary");
  assert.equal(headline(m), "Adicionou à watchlist");
});

/* ---------- SÉRIE ---------- */
test("série: começou", () => {
  const m = toMoment([ev("status_changed", D, "20:00", SHOW, { from: "want", to: "watching" })]);
  assert.equal(headline(m), "Começou a assistir");
  assert.equal(m.tier, "primary");
});

test("série: 1 episódio", () => {
  const m = toMoment([ep(D, "22:30", SHOW, 3, 4)]);
  assert.equal(headline(m), "Assistiu T3:E04");
  assert.equal(detail(m), null);
});

test("série: sessão de 3 episódios (intervalos reais) = 1 momento", () => {
  const items = [ep(D, "20:00", SHOW, 3, 2), ep(D, "20:50", SHOW, 3, 3), ep(D, "21:45", SHOW, 3, 4)];
  const d = one(items);
  assert.equal(d.moments.length, 1);
  assert.equal(headline(d.moments[0]), "Assistiu 3 episódios");
  assert.equal(detail(d.moments[0]), "T3:E02–E04");
  assert.equal(d.moments[0].time, "21:45");
});

test("série: marcação em lote (segundos) diz que foi marcada, não que assistiu tudo ali", () => {
  const items = Array.from({ length: 10 }, (_, i) => ep(D, "14:12", SHOW, 1, i + 1, { s: i }));
  const m = one(items).moments[0];
  assert.equal(m.batch, true);
  assert.equal(headline(m), "Marcou 10 episódios como assistidos");
  assert.equal(detail(m), "T1:E01–E10");
});

test("série: episódios com mais de 3 h de intervalo não se juntam", () => {
  const d = one([ep(D, "09:00", SHOW, 1, 1), ep(D, "13:30", SHOW, 1, 2)]);
  assert.equal(d.moments.length, 2);
});

test("série: episódio avulso + lote 2 h depois = 2 momentos (sem falso 'assistiu 14')", () => {
  const items = [ep(D, "20:00", SHOW2, 5, 10, { season_done: true }), ...Array.from({ length: 13 }, (_, i) => ep(D, "22:10", SHOW2, 6, i + 1, { s: i, season_done: i === 12, series_done: i === 12 }))];
  const d = one(items);
  assert.equal(d.moments.length, 2);
  const [batch, single] = d.moments;
  assert.equal(headline(batch), "Marcou 13 episódios como assistidos");
  assert.equal(milestone(batch), "Série concluída");
  assert.equal(headline(single), "Assistiu T5:E10");
  assert.equal(detail(single), "Temporada 5 concluída");
});

test("série: dois lotes separados não se juntam; avulsos em sessão sim", () => {
  const lotA = [0, 1, 2].map((i) => ep(D, "10:00", SHOW, 1, i + 1, { s: i }));
  const lotB = [0, 1].map((i) => ep(D, "11:00", SHOW, 2, i + 1, { s: i }));
  assert.equal(one([...lotA, ...lotB]).moments.length, 2);
});

test("série: episódio final conclui a temporada no mesmo momento", () => {
  const m = toMoment([ep(D, "23:00", SHOW, 2, 10, { season_done: true })]);
  assert.equal(headline(m), "Assistiu T2:E10");
  assert.equal(detail(m), "Temporada 2 concluída");
  assert.equal(milestone(m), null);
});

test("série: último episódio conclui a série (marco)", () => {
  const m = toMoment([ep(D, "23:42", SHOW2, 5, 16, { season_done: true, series_done: true })]);
  assert.equal(headline(m), "Assistiu T5:E16");
  assert.equal(milestone(m), "Série concluída");
  assert.equal(detail(m), null, "sem repetir 'Temporada 5 concluída' quando a série acabou");
});

test("série: legado temporadas 1–9 de uma vez + série concluída", () => {
  const items = [...Array.from({ length: 9 }, (_, i) => ev("season_completed", D, "05:55", SHOW2, { season: i + 1 })), ev("status_changed", D, "05:56", SHOW2, { from: "watching", to: "watched" }), ev("series_completed", D, "05:56", SHOW2, { completed_seasons: 9 })];
  const d = one(items);
  assert.equal(d.moments.length, 1);
  assert.equal(headline(d.moments[0]), "Série concluída");
  assert.equal(detail(d.moments[0]), "9 temporadas");
});

test("série: temporada concluída (legado) sem fim da série", () => {
  assert.equal(headline(toMoment([ev("season_completed", D, "10:00", SHOW, { season: 2 })])), "Temporada 2 concluída");
});

test("série: abandonou (neutro) e retomou", () => {
  const drop = toMoment([ev("status_changed", D, "10:00", SHOW, { from: "watching", to: "dropped", stopped_season: 2 })]);
  assert.equal(headline(drop), "Parou de assistir na T2");
  assert.doesNotMatch(headline(drop), /falh|abandon/i);
  const back = toMoment([ev("status_changed", D, "10:00", SHOW, { from: "dropped", to: "watching" })]);
  assert.equal(headline(back), "Retomou a série");
});

/* ---------- REASSISTIR ---------- */
test("reassistida: 1ª, 2ª, 3ª (filme)", () => {
  assert.equal(headline(toMoment([watch(D, "20:10", MOVIE2, { is_rewatch: true, watch_number: 2 })])), "Reassistiu");
  assert.equal(headline(toMoment([watch(D, "20:10", MOVIE2, { is_rewatch: true, watch_number: 3 })])), "Reassistiu pela 2ª vez");
  assert.equal(headline(toMoment([watch(D, "20:10", MOVIE2, { is_rewatch: true, watch_number: 4 })])), "Reassistiu pela 3ª vez");
});

test("reassistida: começou (rewatch_started + status no mesmo instante) = 1 momento", () => {
  const d = one([ev("status_changed", D, "19:00", SHOW, { from: "watched", to: "rewatching" }), ev("rewatch_started", D, "19:00", SHOW, { rewatch_count: 2 })]);
  assert.equal(d.moments.length, 1);
  assert.equal(headline(d.moments[0]), "Começou a reassistir pela 2ª vez");
});

test("reassistida: Reassistindo → Reassistido usa o número da reassistida", () => {
  const m = toMoment([ev("status_changed", D, "22:00", MOVIE2, { from: "rewatching", to: "rewatched", rewatch_number: 3 })]);
  assert.equal(headline(m), "Reassistiu pela 3ª vez");
});

test("reassistida: terminou e começou a reassistir minutos depois = 2 momentos (sem duplicar)", () => {
  const items = [ev("status_changed", D, "21:00", MOVIE, { from: "watching", to: "watched" }), ev("rewatch_started", D, "21:10", MOVIE, { rewatch_count: 1 }), ev("status_changed", D, "21:10", MOVIE, { from: "watched", to: "rewatching" })];
  const d = one(items);
  assert.deepEqual(d.moments.map(headline).sort(), ["Assistiu", "Começou a reassistir"]);
  assert.equal(d.moments.flatMap((m) => m.raw).length, 3);
});

/* ---------- AGRUPAMENTO ---------- */
test("mesmo título em horários distantes não agrupa", () => {
  const d = one([ev("library_added", D, "10:00", MOVIE, { status: "want", media_type: "movie" }), watch(D, "23:00", MOVIE)]);
  assert.equal(d.moments.length, 2);
});

test("títulos diferentes nunca agrupam", () => {
  const d = one([watch(D, "21:00", MOVIE), watch(D, "21:05", MOVIE2)]);
  assert.equal(d.moments.length, 2);
});

test("dias diferentes nunca agrupam (mesmo a minutos de distância)", () => {
  const days = buildDays([ep("2026-10-13", "23:58", SHOW, 1, 1), ep("2026-10-14", "00:03", SHOW, 1, 2)]);
  assert.equal(days.length, 2);
  assert.deepEqual(days.map((d) => d.day), ["2026-10-14", "2026-10-13"]);
});

test("duas visualizações do mesmo filme no dia = 2 momentos", () => {
  const d = one([watch(D, "14:00", MOVIE), watch(D, "14:10", MOVIE, { is_rewatch: true, watch_number: 2 })]);
  assert.equal(d.moments.length, 2);
});

/* ---------- REMOÇÃO DA BIBLIOTECA (V2.5 integridade) ---------- */
test("remover logo depois de assistir: 'Assistiu' continua + remoção à parte (secundária)", () => {
  const d = one([watch(D, "21:00", MOVIE, { rating: 8 }), ev("library_removed", D, "21:05", MOVIE, { status: "watched" })]);
  const kinds = d.moments.map((m) => m.kind).sort();
  assert.deepEqual(kinds, ["removed", "watched"]);
  const removed = d.moments.find((m) => m.kind === "removed");
  assert.equal(removed.tier, "secondary");
  assert.equal(headline(removed), "Removeu da biblioteca");
  assert.equal(d.moments.find((m) => m.kind === "watched").rating, 8);
});

test("remover e readicionar minutos depois: momentos separados, nada fundido", () => {
  const d = one([ev("library_removed", D, "10:00", MOVIE, { status: "watched" }), ev("library_added", D, "10:03", MOVIE, { status: "want", media_type: "movie" })]);
  assert.deepEqual(d.moments.map(headline).sort(), ["Adicionou à watchlist", "Removeu da biblioteca"]);
});

test("muitas remoções no dia entram no grupo de organização", () => {
  const items = Array.from({ length: 12 }, (_, i) => ev("library_removed", D, `14:${String(i).padStart(2, "0")}`, { ...MOVIE, id: 300 + i, title: `F${i}` }, { status: "want" }));
  const d = one(items);
  assert.equal(d.moments.length, 0);
  assert.equal(groupSummary(d.groups[0]), "12 títulos removidos");
});

/* ---------- REMOVIDOS / SEM TÍTULO ---------- */
const orphan = (n, type = "status_changed") => Array.from({ length: n }, (_, i) => ev(type, D, "09:00", null, type === "season_completed" ? { season: 1 } : { from: "want", to: "watched" }, i % 60));

for (const n of [1, 20, 245]) {
  test(`sem título: ${n} registro(s) viram 1 grupo recolhido`, () => {
    const d = one(orphan(n));
    assert.equal(d.moments.length, 0);
    assert.equal(d.groups.length, 1);
    assert.equal(d.groups[0].kind, "unlinked");
    assert.ok(d.groups[0].moments.length >= 1);
    assert.equal(d.groups[0].moments.flatMap((m) => m.raw).length, n, "todas as linhas preservadas");
  });
}

test("sem título: legado 'concluído' sem tipo conhecido não diz 'série'", () => {
  const m = toMoment([ev("series_completed", D, "09:00", null, {})]);
  assert.equal(headline(m), "Marcou como concluído");
});

test("título recuperado pelo nome continua com link e fica fora do grupo sem título", () => {
  const rec = { ...MOVIE, recovered: true };
  const d = one([ev("library_added", D, "09:00", rec, { status: "want", media_type: "movie", title: MOVIE.title })]);
  assert.equal(d.moments.length, 1);
  assert.equal(d.groups.length, 0);
});

test(`organização: ${LIBRARY_GROUP_MIN}+ adições no dia recolhem; consumo continua visível`, () => {
  const adds = Array.from({ length: 30 }, (_, i) => ev("library_added", D, `1${i % 10}:0${i % 6}`, { ...MOVIE, id: 100 + i, title: `Filme ${i}` }, { status: "want", media_type: "movie" }));
  const d = one([...adds, watch(D, "22:00", MOVIE2)]);
  assert.equal(d.moments.length, 1);
  assert.equal(d.groups[0].kind, "library");
  assert.equal(d.groups[0].moments.length, 30);
  assert.equal(groupSummary(d.groups[0]), "30 títulos adicionados");
  const few = one(adds.slice(0, LIBRARY_GROUP_MIN - 1));
  assert.equal(few.groups.length, 0);
});

/* ---------- FILTROS ---------- */
test("filtros: Assistidos / Reassistidos / Avaliações", () => {
  const days = buildDays([
    watch(D, "21:00", MOVIE, { rating: 9 }),
    watch(D, "18:00", MOVIE2, { is_rewatch: true, watch_number: 2 }),
    ev("library_added", D, "10:00", SHOW, { status: "want", media_type: "tv" }),
    ...orphan(3),
  ]);
  const count = (f) => filterDays(days, f).flatMap((d) => d.moments).length;
  assert.equal(count("watched"), 2);
  assert.equal(count("rewatch"), 1);
  assert.equal(count("rated"), 1);
  assert.equal(filterDays(days, "watched").flatMap((d) => d.groups).length, 0);
});

/* ---------- DATAS ---------- */
test("datas: só-data não ganha horário; datetime 21:00 continua válido", () => {
  assert.equal(toMoment([watch(D, "12:00", MOVIE, { time: null })]).time, null);
  assert.equal(toMoment([watch(D, "21:00", MOVIE)]).time, "21:00");
  assert.equal(toMoment([ep(D, "12:00", SHOW, 1, 1, { time: null })]).time, null);
});

test("datas: virada de mês, de ano e 29/02 ficam em dias separados e ordenados", () => {
  const days = buildDays([watch("2026-12-31", "23:59", MOVIE), watch("2027-01-01", "00:01", MOVIE2), watch("2028-02-29", "20:00", MOVIE), watch("2026-09-30", "23:30", MOVIE2), watch("2026-10-01", "00:10", MOVIE)]);
  assert.deepEqual(days.map((d) => d.day), ["2028-02-29", "2027-01-01", "2026-12-31", "2026-10-01", "2026-09-30"]);
});

/* ---------- COPY ---------- */
test("copy: plurais, intervalos e temporadas", () => {
  assert.equal(plural(1, "episódio", "episódios"), "1 episódio");
  assert.equal(plural(2, "episódio", "episódios"), "2 episódios");
  assert.equal(episodeRange([{ season: 3, episode: 2 }, { season: 3, episode: 5 }]), "T3:E02 e E05");
  assert.equal(episodeRange([{ season: 3, episode: 2 }, { season: 3, episode: 5 }, { season: 3, episode: 7 }]), "T3:E02, E05 e E07");
  assert.equal(episodeRange([{ season: 1, episode: 1 }, { season: 2, episode: 10 }]), "T1:E01 – T2:E10");
  assert.equal(seasonsLabel([2]), "Temporada 2 concluída");
  assert.equal(seasonsLabel([3, 1, 2]), "Temporadas 1–3 concluídas");
  assert.equal(seasonsLabel([1, 3, 4]), "Temporadas 1, 3 e 4 concluídas");
});

/* ---------- ESCALA ---------- */
test("escala: milhares de linhas, nenhuma perdida nem duplicada", () => {
  const items = [];
  for (let day = 1; day <= 28; day += 1) {
    const d = `2026-02-${String(day).padStart(2, "0")}`;
    for (let i = 0; i < 120; i += 1) items.push(ep(d, `${String(8 + (i % 14)).padStart(2, "0")}:${String(i % 60).padStart(2, "0")}`, { ...SHOW, id: 500 + (i % 7) }, 1 + (i % 5), 1 + i));
  }
  const t0 = performance.now();
  const days = buildDays(items);
  const elapsed = performance.now() - t0;
  const raw = days.flatMap((d) => [...d.moments, ...d.groups.flatMap((g) => g.moments)]).flatMap((m) => m.raw);
  assert.equal(raw.length, items.length);
  assert.equal(new Set(raw).size, items.length);
  const ids = days.flatMap((d) => d.moments.map((m) => m.id));
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(elapsed < 1500, `${elapsed} ms`);
});

test("cluster: ordem determinística independente da ordem de entrada", () => {
  const items = [ep(D, "20:00", SHOW, 1, 2), ep(D, "19:00", SHOW, 1, 1), ep(D, "21:00", SHOW, 1, 3)];
  const a = clusterItems(items).map((c) => c.map((i) => i.id));
  const b = clusterItems([...items].reverse()).map((c) => c.map((i) => i.id));
  assert.deepEqual(a, b);
});
