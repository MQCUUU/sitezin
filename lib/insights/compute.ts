import { addDays, daysBetween, inRange, INSIGHTS_TZ, normalizeParams, resolveRanges } from "./period";
import { discoveryStats, recommendationStats } from "./engagement";
import { generateInsights } from "./rules";
import type {
  Bucket,
  Change,
  Core,
  DayRange,
  EpisodeDay,
  GenreStat,
  InsightsInput,
  InsightsParams,
  InsightsPayload,
  LibRow,
  PersonStat,
  RatedRef,
  SectionKey,
  SeriesProgress,
  TitleRef,
} from "./types";

/*
 * Motor de Insights — funções PURAS (sem rede, banco ou React).
 *
 * Definições (iguais às da antiga página Estatísticas, para os números
 * baterem — ver docs/V2.1-A-DATA-INTEGRITY.md):
 *   filme assistido   status watched|rewatched (rewatching = em andamento)
 *   tempo de filme    duração × (1 + reassistidas) em "Todo período";
 *                     num período: 1× por filme com watched_at no período
 *                     + 1× por reassistida datada (watch_entries) no período
 *   episódio          linha de episodes_progress com watched=true (única por
 *                     episódio — nunca conta duas vezes); sem duração = 45 min
 *   reassistidas      Todo período: max(rewatch_count, 1 se status rewatched)
 *                     período: watch_entries.is_rewatch datadas no período
 *   "Quero assistir"  nunca entra em consumo
 * Datas: dia civil em America/Sao_Paulo (calculado no SQL).
 */

export const MIN = {
  genreAvg: 5, // média por gênero
  personAvg: 3, // média por pessoa
  person: 2, // aparecer no ranking de pessoas
  bucketAvg: 3, // média por década/idioma/país
  weekdayDays: 15,
  habitsDays: 14,
  ratingsProfile: 15,
  community: 10,
  votes: 100,
  divergenceVotes: 300,
  coverage: 0.4,
  dropGenre: 5,
  paceDays: 10,
  hoursEvents: 20,
  changeSample: 10,
  changeRated: 5,
} as const;

const WATCHED_MOVIE = new Set(["watched", "rewatched"]);
const SERIES_STARTED = new Set(["watched", "rewatched", "rewatching", "watching", "paused", "dropped"]);
const DEFAULT_EPISODE_MINUTES = 45;
const DEFAULT_MOVIE_MINUTES = 110;
const ASIAN_LANGS = new Set(["ko", "ja", "zh", "cn", "th", "hi", "ta", "te", "id", "vi", "tl"]);
const ASIAN_COUNTRIES = new Set(["KR", "JP", "CN", "TW", "HK", "TH", "IN", "ID", "VN", "PH"]);

const round1 = (value: number) => Math.round(value * 10) / 10;
const mean = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);

function median(values: number[]): number | null {
  if (!values.length) return null;

  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);

  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

const ref = (row: LibRow): TitleRef => ({ tmdb_id: row.tmdb_id, type: row.type, title: row.title, poster_path: row.poster_path });
const rated = (row: LibRow): RatedRef => ({ ...ref(row), rating: Number(row.rating) });
const monthOf = (day: string) => day.slice(0, 7);
const bounded = (range: DayRange) => range.from !== null && range.to !== null;

function weekdayOf(day: string) {
  const [y, m, d] = day.split("-").map(Number);

  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function movieMinutes(row: LibRow) {
  return row.runtime && row.runtime > 0 ? row.runtime : 0;
}

function episodeMinutes(row: LibRow) {
  return row.runtime && row.runtime > 0 ? row.runtime : DEFAULT_EPISODE_MINUTES;
}

type Consumed = { row: LibRow; minutes: number; episodes: number };

type Ctx = {
  input: InsightsInput;
  /** Consumo: Biblioteca + linhas só de histórico (títulos removidos). */
  lib: LibRow[];
  /** Estado atual: só a Biblioteca. */
  state: LibRow[];
  byId: Map<number, LibRow>;
  eps: EpisodeDay[];
  /**
   * Filmes com registros em watch_entries: dia da 1ª visualização (registro
   * não-rewatch mais antigo; null se só há reassistidas). O watch-history
   * sincroniza library_items.watched_at com a visualização MAIS RECENTE — usar
   * watched_at junto com as reassistidas contaria a mesma sessão duas vezes.
   */
  firstDay: Map<number, string | null>;
};

/** Dia da 1ª visualização de um filme (ver Ctx.firstDay). */
function firstViewDay(ctx: Ctx, row: LibRow): string | null {
  return ctx.firstDay.has(row.media_id) ? (ctx.firstDay.get(row.media_id) as string | null) : row.watched_day;
}

/** Divide o total em horas inteiras que SEMPRE somam o total exibido. */
export function splitHours(movieMinutes: number, seriesMinutes: number) {
  const hours = Math.round((movieMinutes + seriesMinutes) / 60);
  const movieHours = Math.min(hours, Math.round(movieMinutes / 60));

  return { hours, movieHours, seriesHours: hours - movieHours };
}

/** O que foi efetivamente assistido num intervalo (nunca "Quero assistir"). */
function consume(ctx: Ctx, range: DayRange): Consumed[] {
  const isBounded = bounded(range);
  const episodesByMedia = new Map<number, number>();

  for (const ep of ctx.eps) {
    if (inRange(ep.day, range)) episodesByMedia.set(ep.media_id, (episodesByMedia.get(ep.media_id) ?? 0) + ep.n);
  }

  const out: Consumed[] = [];

  for (const row of ctx.lib) {
    if (row.type === "movie") {
      if (!WATCHED_MOVIE.has(row.status) || !inRange(firstViewDay(ctx, row), range)) continue;

      out.push({ row, minutes: movieMinutes(row) * (isBounded ? 1 : 1 + Math.max(0, row.rewatch_count)), episodes: 0 });
      continue;
    }

    const n = episodesByMedia.get(row.media_id) ?? 0;

    // "Todo período": série concluída por import (sem episódios) também conta.
    if (n === 0 && (isBounded || !SERIES_STARTED.has(row.status) || row.status === "want")) continue;

    out.push({ row, minutes: n * episodeMinutes(row), episodes: n });
  }

  return out;
}

function core(ctx: Ctx, range: DayRange): Core {
  const consumed = consume(ctx, range);
  const isBounded = bounded(range);
  let movieMin = 0;
  let seriesMin = 0;
  let rewatches = 0;
  const active = new Set<string>();

  for (const c of consumed) {
    if (c.row.type === "movie") {
      movieMin += c.minutes;
      const first = firstViewDay(ctx, c.row);

      if (first) active.add(first);
    } else {
      seriesMin += c.minutes;
    }
  }

  for (const ep of ctx.eps) if (ep.day && inRange(ep.day, range)) active.add(ep.day);

  if (isBounded) {
    for (const entry of ctx.input.entries) {
      const row = ctx.byId.get(entry.media_id);

      if (!row || !entry.is_rewatch || !inRange(entry.day, range)) continue;

      rewatches += 1;
      if (row.type === "movie") movieMin += movieMinutes(row);
      if (entry.day) active.add(entry.day);
    }
  } else {
    for (const row of ctx.lib) rewatches += Math.max(row.rewatch_count, row.status === "rewatched" ? 1 : 0);
  }

  const ratings = consumed.map((c) => c.row.rating).filter((r): r is number => r !== null);

  return {
    movies: consumed.filter((c) => c.row.type === "movie").length,
    episodes: consumed.reduce((s, c) => s + c.episodes, 0),
    series: consumed.filter((c) => c.row.type === "tv").length,
    minutes: movieMin + seriesMin,
    movieMinutes: movieMin,
    seriesMinutes: seriesMin,
    ...splitHours(movieMin, seriesMin),
    rewatches,
    activeDays: active.size,
    rated: ratings.length,
    avgRating: ratings.length ? round1(mean(ratings) as number) : null,
    dropped: ctx.state.filter((r) => r.status === "dropped" && inRange(r.updated_day, range)).length,
    added: ctx.state.filter((r) => inRange(r.added_day, range)).length,
  };
}

function buckets<T>(items: T[], keys: (item: T) => string[], rating: (item: T) => number | null): Bucket[] {
  const map = new Map<string, { count: number; ratings: number[] }>();

  for (const item of items) {
    for (const key of new Set(keys(item))) {
      if (!key) continue;

      const entry = map.get(key) ?? { count: 0, ratings: [] };
      const value = rating(item);

      entry.count += 1;
      if (value !== null) entry.ratings.push(value);
      map.set(key, entry);
    }
  }

  return [...map.entries()]
    .map(([label, e]) => ({ label, count: e.count, avg: e.ratings.length >= MIN.bucketAvg ? round1(mean(e.ratings) as number) : null }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

function people(consumed: Consumed[], pick: (row: LibRow) => string[]): PersonStat[] {
  const map = new Map<string, LibRow[]>();

  for (const { row } of consumed) {
    for (const name of new Set(pick(row))) if (name) map.set(name, [...(map.get(name) ?? []), row]);
  }

  return [...map.entries()]
    .filter(([, rows]) => rows.length >= MIN.person)
    .map(([name, rows]) => {
      const ratings = rows.map((r) => r.rating).filter((r): r is number => r !== null);
      const best = [...rows].filter((r) => r.rating !== null).sort((a, b) => Number(b.rating) - Number(a.rating))[0];

      return {
        name,
        count: rows.length,
        avg: ratings.length >= MIN.personAvg ? round1(mean(ratings) as number) : null,
        best: best?.title ?? null,
      };
    })
    .sort((a, b) => b.count - a.count || (b.avg ?? 0) - (a.avg ?? 0))
    .slice(0, 20);
}

function isAsian(row: LibRow): boolean | null {
  if (row.language) return ASIAN_LANGS.has(row.language);
  if (row.countries.length) return row.countries.some((c) => ASIAN_COUNTRIES.has(c));

  return null;
}

export function buildInsights(input: InsightsInput, raw: Partial<InsightsParams> & { period?: string }): InsightsPayload {
  const params = normalizeParams({
    period: raw.period,
    type: raw.type,
    from: raw.from ?? null,
    to: raw.to ?? null,
    compare: raw.compare === false ? "0" : "1",
  });
  const { range, prev } = resolveRanges(params, input.today);
  const typed = (row: { type: string }) => params.type === "all" || row.type === params.type;
  // V2.5 — história × estado: remover um título da Biblioteca não muda o que foi
  // consumido (`all`), só o estado atual (`lib`: watchlist, assistindo, favoritos…).
  const all = input.library.filter(typed);
  const lib = all.filter((row) => !row.removed);
  const byId = new Map(all.map((row) => [row.media_id, row]));
  const firstDay = new Map<number, string | null>();

  for (const entry of input.entries) {
    if (!firstDay.has(entry.media_id)) firstDay.set(entry.media_id, null);
    if (entry.is_rewatch || !entry.day) continue;

    const current = firstDay.get(entry.media_id);

    if (!current || entry.day < current) firstDay.set(entry.media_id, entry.day);
  }

  const ctx: Ctx = { input, lib: all, state: lib, byId, eps: input.episodes.filter((ep) => byId.has(ep.media_id)), firstDay };
  const failed: SectionKey[] = [];

  function guard<T>(key: SectionKey, run: () => T): T | null {
    try {
      return run();
    } catch (error) {
      console.error(`[insights] falha em ${key}:`, error);
      failed.push(key);
      return null;
    }
  }

  const cur = core(ctx, range);
  const previous = prev && params.compare ? core(ctx, prev) : null;
  const consumed = consume(ctx, range);
  const today = input.today;

  /* ---------- Mapa diário (histórico inteiro, por tipo) ---------- */
  const dayMap = new Map<string, { movies: number; eps: number; minutes: number }>();

  guard("activity", () => {
    const touch = (day: string) => {
      const e = dayMap.get(day) ?? { movies: 0, eps: 0, minutes: 0 };

      dayMap.set(day, e);

      return e;
    };

    for (const row of all) {
      const first = row.type === "movie" ? firstViewDay(ctx, row) : null;

      if (row.type === "movie" && WATCHED_MOVIE.has(row.status) && first) {
        const e = touch(first);

        e.movies += 1;
        e.minutes += movieMinutes(row);
      }
    }

    for (const ep of ctx.eps) {
      if (!ep.day) continue;

      const e = touch(ep.day);

      e.eps += ep.n;
      e.minutes += ep.n * episodeMinutes(byId.get(ep.media_id) as LibRow);
    }

    for (const entry of input.entries) {
      const row = byId.get(entry.media_id);

      if (!row || row.type !== "movie" || !entry.is_rewatch || !entry.day) continue;

      const e = touch(entry.day);

      e.movies += 1;
      e.minutes += movieMinutes(row);
    }
  });

  const allDays = [...dayMap.keys()].sort();
  const periodDays = allDays.filter((d) => inRange(d, range));

  /* ---------- Atividade ---------- */
  const activity = guard("activity", () => {
    const weekday = Array.from({ length: 7 }, () => 0);

    for (const day of periodDays) weekday[weekdayOf(day)] += dayMap.get(day)!.minutes;

    const weekTotal = weekday.reduce((a, b) => a + b, 0);

    // Meses do período (com zeros), ou últimos 24 meses em "Todo período".
    const months: string[] = [];
    const floor = monthOf(addDays(today, -730));
    const firstActive = allDays[0]?.slice(0, 7) ?? floor;
    const end = (range.to && range.to < today ? range.to : today).slice(0, 7);
    let cursor = range.from ? range.from.slice(0, 7) : firstActive > floor ? firstActive : floor;

    for (let guardCount = 0; cursor <= end && guardCount < 400; guardCount += 1) {
      months.push(cursor);
      const [y, m] = cursor.split("-").map(Number);
      cursor = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
    }

    const monthly = months.map((month) => ({ month, movies: 0, episodes: 0, minutes: 0 }));
    const index = new Map(monthly.map((m, i) => [m.month, i]));

    for (const day of periodDays) {
      const i = index.get(monthOf(day));

      if (i === undefined) continue;

      const e = dayMap.get(day)!;

      monthly[i].movies += e.movies;
      monthly[i].episodes += e.eps;
      monthly[i].minutes += e.minutes;
    }

    let longest = 0;
    let run = 0;

    periodDays.forEach((day, i) => {
      run = i > 0 && daysBetween(periodDays[i - 1], day) === 1 ? run + 1 : 1;
      longest = Math.max(longest, run);
    });

    const activeSet = new Set(allDays);
    let currentStreak = 0;
    let c = activeSet.has(today) ? today : addDays(today, -1);

    while (activeSet.has(c)) {
      currentStreak += 1;
      c = addDays(c, -1);
    }

    // Horário: só com registros que têm hora real.
    const hourly = Array.from({ length: 24 }, () => 0);
    let timed = 0;
    let total = 0;

    for (const h of input.hours) {
      if (!typed(h) || !inRange(h.day, range)) continue;

      total += h.n;
      timed += h.timed;
      if (h.timed) hourly[h.hour] += h.timed;
    }

    const hoursReliable = timed >= MIN.hoursEvents && timed / Math.max(1, total) >= 0.3;
    let peakHours: { from: number; to: number; share: number } | null = null;

    if (hoursReliable) {
      let best = -1;

      for (let h = 0; h < 24; h += 1) {
        const sum = hourly[h] + hourly[(h + 1) % 24] + hourly[(h + 2) % 24];

        if (sum > best) {
          best = sum;
          peakHours = { from: h, to: (h + 3) % 24, share: sum / timed };
        }
      }
    }

    const withData = monthly.filter((m) => m.minutes > 0);
    const busiest = withData.length >= 2 ? [...withData].sort((a, b) => b.minutes - a.minutes)[0] : null;

    return {
      days: allDays.slice(-2500).map((d) => {
        const e = dayMap.get(d)!;

        return [d, e.movies, e.eps, Math.round(e.minutes)] as [string, number, number, number];
      }),
      monthly: monthly.map((m) => ({ ...m, minutes: Math.round(m.minutes) })),
      favoriteWeekday: periodDays.length >= MIN.weekdayDays && weekTotal > 0 ? weekday.indexOf(Math.max(...weekday)) : null,
      weekday: weekday.map((m) => Math.round(m)),
      weekendShare: periodDays.length >= MIN.habitsDays && weekTotal > 0 ? (weekday[0] + weekday[6]) / weekTotal : null,
      peakHours,
      hoursReliable,
      longestStreak: longest,
      currentStreak,
      busiestMonth: busiest ? { month: busiest.month, minutes: Math.round(busiest.minutes) } : null,
    };
  });

  /* ---------- Gosto ---------- */
  const taste = guard("taste", () => {
    const genreMap = new Map<string, Consumed[]>();

    for (const c of consumed) for (const g of new Set(c.row.genres)) if (g) genreMap.set(g, [...(genreMap.get(g) ?? []), c]);

    const genres: GenreStat[] = [...genreMap.entries()]
      .map(([name, list]) => {
        const ratings = list.map((c) => c.row.rating).filter((r): r is number => r !== null);

        return {
          name,
          count: list.length,
          minutes: Math.round(list.reduce((s, c) => s + c.minutes, 0)),
          rated: ratings.length,
          avg: ratings.length >= MIN.genreAvg ? round1(mean(ratings) as number) : null,
          high: list.filter((c) => (c.row.rating ?? 0) >= 9).length,
          favorites: list.filter((c) => c.row.favorite).length,
          share: consumed.length ? list.length / consumed.length : 0,
        };
      })
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

    // Gênero PRINCIPAL por ano (soma 100%): top 4 do histórico + "Outros".
    const yearRows = new Map<number, LibRow[]>();
    const seenYear = new Set<string>();

    for (const row of all) {
      const first = row.type === "movie" ? firstViewDay(ctx, row) : null;

      if (row.type === "movie" && WATCHED_MOVIE.has(row.status) && first) {
        const y = Number(first.slice(0, 4));

        yearRows.set(y, [...(yearRows.get(y) ?? []), row]);
      }
    }

    for (const ep of ctx.eps) {
      if (!ep.day) continue;

      const key = `${ep.day.slice(0, 4)}|${ep.media_id}`;

      if (seenYear.has(key)) continue;

      seenYear.add(key);
      const y = Number(ep.day.slice(0, 4));

      yearRows.set(y, [...(yearRows.get(y) ?? []), byId.get(ep.media_id) as LibRow]);
    }

    const primaryCount = new Map<string, number>();

    for (const rows of yearRows.values()) for (const r of rows) if (r.genres[0]) primaryCount.set(r.genres[0], (primaryCount.get(r.genres[0]) ?? 0) + 1);

    const main = [...primaryCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([g]) => g);
    const genresByYear = [...yearRows.entries()]
      .filter(([, rows]) => rows.length >= 5)
      .sort((a, b) => a[0] - b[0])
      .slice(-5)
      .map(([year, rows]) => {
        const parts = main.map((name) => ({ name, share: rows.filter((r) => r.genres[0] === name).length / rows.length }));
        const rest = 1 - parts.reduce((s, p) => s + p.share, 0);

        return { year, total: rows.length, parts: rest > 0.001 ? [...parts, { name: "Outros", share: rest }] : parts };
      });

    const dated = consumed.filter((c) => c.row.release_year);
    const decadeMap = new Map<number, Consumed[]>();

    for (const c of dated) {
      const d = Math.floor((c.row.release_year as number) / 10) * 10;

      decadeMap.set(d, [...(decadeMap.get(d) ?? []), c]);
    }

    const decades: Bucket[] = [...decadeMap.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([d, list]) => {
        const ratings = list.map((c) => c.row.rating).filter((r): r is number => r !== null);

        return { label: `${d}s`, count: list.length, avg: ratings.length >= MIN.bucketAvg ? round1(mean(ratings) as number) : null };
      });

    const langCoverage = consumed.length ? consumed.filter((c) => c.row.language).length / consumed.length : 0;
    const countryCoverage = consumed.length ? consumed.filter((c) => c.row.countries.length).length / consumed.length : 0;
    const enough = consumed.length >= 10;

    return {
      consumed: consumed.length,
      genres,
      genresByYear,
      decades,
      classicShare: dated.length >= 10 ? dated.filter((c) => (c.row.release_year as number) < 2000).length / dated.length : null,
      languages:
        enough && langCoverage >= MIN.coverage
          ? buckets(consumed, (c) => (c.row.language ? [c.row.language] : []), (c) => c.row.rating).slice(0, 8)
          : [],
      countries:
        enough && countryCoverage >= MIN.coverage ? buckets(consumed, (c) => c.row.countries, (c) => c.row.rating).slice(0, 8) : [],
      directors: people(consumed.filter((c) => c.row.type === "movie"), (r) => r.directors),
      cast: people(consumed, (r) => r.cast),
    };
  });

  /* ---------- Notas ---------- */
  const ratings = guard("ratings", () => {
    const ratedRows = consumed.filter((c) => c.row.rating !== null);
    const values = ratedRows.map((c) => Number(c.row.rating));
    const histogram = Array.from({ length: 10 }, () => 0);

    for (const v of values) histogram[Math.max(1, Math.min(10, Math.round(v))) - 1] += 1;

    const max = Math.max(0, ...histogram);
    const community = ratedRows.filter((c) => (c.row.tmdb_rating ?? 0) > 0 && (c.row.vote_count ?? 0) >= MIN.votes);
    const diff = (c: Consumed) => Number(c.row.rating) - Number(c.row.tmdb_rating);
    const divergent = community.filter((c) => (c.row.vote_count ?? 0) >= MIN.divergenceVotes);
    const toDivergence = (c: Consumed) => ({ ...rated(c.row), community: round1(Number(c.row.tmdb_rating)), diff: round1(diff(c)) });
    const enoughCommunity = community.length >= MIN.community;

    return {
      n: values.length,
      mean: values.length ? round1(mean(values) as number) : null,
      median: median(values),
      mode: values.length ? histogram.lastIndexOf(max) + 1 : null,
      histogram,
      coverage: consumed.length ? ratedRows.length / consumed.length : null,
      band79: values.length >= MIN.ratingsProfile ? values.filter((v) => Math.round(v) >= 7 && Math.round(v) <= 9).length / values.length : null,
      below6: values.length >= MIN.ratingsProfile ? values.filter((v) => v < 6).length / values.length : null,
      community: enoughCommunity
        ? {
            n: community.length,
            mine: round1(mean(community.map((c) => Number(c.row.rating))) as number),
            tmdb: round1(mean(community.map((c) => Number(c.row.tmdb_rating))) as number),
            bias: round1(mean(community.map(diff)) as number),
          }
        : null,
      higher: enoughCommunity ? [...divergent].filter((c) => diff(c) >= 1.5).sort((a, b) => diff(b) - diff(a)).slice(0, 3).map(toDivergence) : [],
      lower: enoughCommunity ? [...divergent].filter((c) => diff(c) <= -1.5).sort((a, b) => diff(a) - diff(b)).slice(0, 3).map(toDivergence) : [],
    };
  });

  /* ---------- Filmes e séries ---------- */
  const epsByMedia = new Map<number, { regular: number; all: number; last: string | null }>();

  for (const ep of ctx.eps) {
    const e = epsByMedia.get(ep.media_id) ?? { regular: 0, all: 0, last: null };

    e.regular += ep.regular;
    e.all += ep.n;
    if (ep.day && (!e.last || ep.day > e.last)) e.last = ep.day;
    epsByMedia.set(ep.media_id, e);
  }

  const titles = guard("titles", () => {
    const movies = consumed.filter((c) => c.row.type === "movie");
    const seriesConsumed = consumed.filter((c) => c.row.type === "tv");
    const runtimes = movies.map((c) => c.row.runtime).filter((r): r is number => Boolean(r && r > 0));
    const movieRatings = movies.map((c) => c.row.rating).filter((r): r is number => r !== null);
    const genreTop = buckets(movies, (c) => c.row.genres, () => null)[0];
    const decadeTop = buckets(movies.filter((c) => c.row.release_year), (c) => [`${Math.floor((c.row.release_year as number) / 10) * 10}s`], () => null)[0];
    const directorTop = people(movies, (r) => r.directors)[0];
    const movieMonths = new Map<string, number>();

    for (const c of movies) {
      const first = firstViewDay(ctx, c.row);

      if (first && inRange(first, range)) movieMonths.set(monthOf(first), (movieMonths.get(monthOf(first)) ?? 0) + 1);
    }

    const tv = lib.filter((r) => r.type === "tv");
    // Conclusões são história: contam também títulos que saíram da Biblioteca.
    const tvHistory = all.filter((r) => r.type === "tv");
    const progress: SeriesProgress[] = tv
      .filter((r) => r.status === "watching" || r.status === "rewatching" || r.status === "paused")
      .map((r) => {
        const e = epsByMedia.get(r.media_id);
        const total = r.episodes_count && r.episodes_count > 0 ? r.episodes_count : null;
        const watched = Math.min(e?.regular ?? 0, total ?? Number.MAX_SAFE_INTEGER);
        const remaining = total !== null ? Math.max(0, total - watched) : null;

        return {
          ...ref(r),
          watched,
          total,
          remaining,
          remainingMinutes: remaining !== null ? remaining * episodeMinutes(r) : null,
          lastDay: e?.last ?? null,
          staleDays: e?.last ? daysBetween(e.last, today) : null,
        };
      })
      .sort((a, b) => (b.lastDay ?? "").localeCompare(a.lastDay ?? ""));

    const movieRewatches = bounded(range)
      ? input.entries.filter((e) => e.is_rewatch && inRange(e.day, range) && byId.get(e.media_id)?.type === "movie").length
      : all.filter((r) => r.type === "movie").reduce((s, r) => s + Math.max(r.rewatch_count, r.status === "rewatched" ? 1 : 0), 0);

    return {
      movies: {
        count: movies.length,
        minutes: cur.movieMinutes,
        avgRuntime: runtimes.length ? Math.round(mean(runtimes) as number) : null,
        avgRating: movieRatings.length ? round1(mean(movieRatings) as number) : null,
        rewatches: movieRewatches,
        topGenre: genreTop && movies.length >= 3 ? genreTop.label : null,
        topDecade: decadeTop && movies.length >= 3 ? decadeTop.label : null,
        topDirector: directorTop ? directorTop.name : null,
        monthly: [...movieMonths.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-12).map(([month, count]) => ({ month, count })),
      },
      series: {
        watching: tv.filter((r) => r.status === "watching" || r.status === "rewatching").length,
        completed: tvHistory.filter((r) => (r.seasons_count ?? 0) > 0 && r.completed_seasons >= (r.seasons_count as number)).length,
        dropped: tv.filter((r) => r.status === "dropped").length,
        paused: tv.filter((r) => r.status === "paused").length,
        seasonsCompleted: tvHistory.reduce((s, r) => s + Math.max(0, r.completed_seasons), 0),
        episodes: cur.episodes,
        minutes: cur.seriesMinutes,
        inProgress: progress,
        nearlyDone: progress.filter((p) => p.remaining !== null && p.remaining >= 1 && p.remaining <= 3 && p.watched > 0).sort((a, b) => (a.remaining as number) - (b.remaining as number)),
        remainingEpisodes: progress.reduce((s, p) => s + (p.remaining ?? 0), 0),
        remainingMinutes: progress.reduce((s, p) => s + (p.remainingMinutes ?? 0), 0),
      },
    };
  });

  /* ---------- Reassistidos ---------- */
  const rewatch = guard("rewatch", () => {
    const rewatched = all.filter((r) => r.rewatch_count > 0 || r.status === "rewatched");
    const consumedRewatched = consumed.filter((c) => c.row.rewatch_count > 0 || c.row.status === "rewatched");
    const genre = buckets(rewatched, (r) => r.genres, () => null)[0];
    const datesByMedia = new Map<number, string[]>();
    const ratingsByMedia = new Map<number, number[]>();

    for (const e of input.entries) {
      if (!byId.has(e.media_id)) continue;
      if (e.day) datesByMedia.set(e.media_id, [...(datesByMedia.get(e.media_id) ?? []), e.day]);
      if (e.rating !== null) ratingsByMedia.set(e.media_id, [...(ratingsByMedia.get(e.media_id) ?? []), Number(e.rating)]);
    }

    const gaps: number[] = [];

    for (const dates of datesByMedia.values()) {
      const sorted = [...dates].sort();

      for (let i = 1; i < sorted.length; i += 1) gaps.push(daysBetween(sorted[i - 1], sorted[i]));
    }

    const changes = [...ratingsByMedia.values()].filter((v) => v.length >= 2).map((v) => v[v.length - 1] - v[0]);

    return {
      total: cur.rewatches,
      share: consumed.length >= 10 ? consumedRewatched.length / consumed.length : null,
      top: [...rewatched]
        .sort((a, b) => b.rewatch_count - a.rewatch_count)
        .slice(0, 5)
        .map((r) => ({ ...ref(r), times: Math.max(1, r.rewatch_count) })),
      topGenre: rewatched.length >= 4 && genre ? genre.label : null,
      intervalDays: gaps.length >= 3 ? Math.round(median(gaps) as number) : null,
      ratingChange: changes.length >= 3 ? { n: changes.length, mean: round1(mean(changes) as number) } : null,
    };
  });

  /* ---------- Abandonos ---------- */
  const dropped = guard("rewatch", () => {
    const tracked = lib.filter((r) => r.status !== "want");
    const droppedRows = lib.filter((r) => r.status === "dropped");
    const genreMap = new Map<string, { dropped: number; tracked: number }>();

    for (const r of tracked) {
      for (const g of new Set(r.genres)) {
        const e = genreMap.get(g) ?? { dropped: 0, tracked: 0 };

        e.tracked += 1;
        if (r.status === "dropped") e.dropped += 1;
        genreMap.set(g, e);
      }
    }

    const droppedEpisodes = droppedRows
      .filter((r) => r.type === "tv")
      .map((r) => epsByMedia.get(r.media_id)?.regular ?? 0)
      .filter((n) => n > 0);

    return {
      count: droppedRows.filter((r) => inRange(r.updated_day, range)).length,
      rate: tracked.length >= 10 ? droppedRows.length / tracked.length : null,
      genres: [...genreMap.entries()]
        .filter(([, e]) => e.tracked >= MIN.dropGenre && e.dropped >= 2)
        .map(([name, e]) => ({ name, ...e, rate: e.dropped / e.tracked }))
        .sort((a, b) => b.rate - a.rate)
        .slice(0, 3),
      medianEpisode: droppedEpisodes.length >= 3 ? Math.round(median(droppedEpisodes) as number) : null,
    };
  });

  /* ---------- Watchlist (biblioteca) ---------- */
  const watchlist = guard("watchlist", () => {
    const want = lib.filter((r) => r.status === "want");
    const age = (r: LibRow) => Math.max(0, daysBetween(r.added_day, today));
    const addedInRange = lib.filter((r) => inRange(r.added_day, range));
    const startedFromAdded = addedInRange.filter((r) => r.status !== "want" && r.status !== "dropped");
    const wantMinutes = want.reduce(
      (s, r) => s + (r.type === "movie" ? movieMinutes(r) || DEFAULT_MOVIE_MINUTES : (r.episodes_count ?? 0) * episodeMinutes(r)),
      0
    );
    const since = addDays(today, -89);
    const recent = allDays.filter((d) => d >= since && d <= today);
    const pace = recent.reduce((s, d) => s + dayMap.get(d)!.minutes, 0) / 90;
    const last90 = { from: since, to: today };
    const added90 = lib.filter((r) => inRange(r.added_day, last90)).length;
    const watched90 = consume(ctx, last90).length;

    return {
      size: want.length,
      movies: want.filter((r) => r.type === "movie").length,
      series: want.filter((r) => r.type === "tv").length,
      addedInPeriod: addedInRange.length,
      converted: addedInRange.length >= 5 ? { added: addedInRange.length, watched: startedFromAdded.length } : null,
      avgAgeDays: want.length ? Math.round(mean(want.map(age)) as number) : null,
      clearMonths: want.length >= 3 && recent.length >= MIN.paceDays && pace > 0 ? Math.max(1, Math.round(wantMinutes / pace / 30)) : null,
      growing: added90 >= 6 ? { added90, watched90 } : null,
      oldest: [...want]
        .filter((r) => age(r) >= 90)
        .sort((a, b) => a.added_day.localeCompare(b.added_day))
        .slice(0, 3)
        .map((r) => ({ ...ref(r), days: age(r) })),
    };
  });

  /* ---------- Evolução do gosto (ano × ano anterior) ---------- */
  const evolution = guard("evolution", () => {
    const toYear = /^\d{4}$/.test(params.period) ? Number(params.period) : Number(today.slice(0, 4));
    const fromYear = toYear - 1;
    const yearRange = (y: number): DayRange => ({ from: `${y}-01-01`, to: `${y}-12-31` });
    const a = consume(ctx, yearRange(fromYear));
    const b = consume(ctx, yearRange(toYear));
    const changes: Change[] = [];

    if (a.length >= MIN.changeSample && b.length >= MIN.changeSample) {
      const share = (list: Consumed[], test: (r: LibRow) => boolean) => list.filter((c) => test(c.row)).length / list.length;
      const genreNames = new Set([...buckets(a, (c) => c.row.genres, () => null).slice(0, 6), ...buckets(b, (c) => c.row.genres, () => null).slice(0, 6)].map((x) => x.label));

      for (const g of genreNames) {
        const from = share(a, (r) => r.genres.includes(g));
        const to = share(b, (r) => r.genres.includes(g));

        if (Math.abs(to - from) >= 0.06) changes.push({ id: `genre-${g}`, label: g, from, to, unit: "pct" });
      }

      const knownA = a.filter((c) => isAsian(c.row) !== null);
      const knownB = b.filter((c) => isAsian(c.row) !== null);

      if (knownA.length >= a.length * MIN.coverage && knownB.length >= b.length * MIN.coverage && knownA.length >= MIN.changeSample && knownB.length >= MIN.changeSample) {
        const from = share(knownA, (r) => isAsian(r) === true);
        const to = share(knownB, (r) => isAsian(r) === true);

        if (Math.abs(to - from) >= 0.05) changes.push({ id: "asian", label: "Produções asiáticas", from, to, unit: "pct" });
      }

      const datedA = a.filter((c) => c.row.release_year);
      const datedB = b.filter((c) => c.row.release_year);

      if (datedA.length >= MIN.changeSample && datedB.length >= MIN.changeSample) {
        const from = share(datedA, (r) => (r.release_year as number) < 2000);
        const to = share(datedB, (r) => (r.release_year as number) < 2000);

        if (Math.abs(to - from) >= 0.05) changes.push({ id: "classic", label: "Títulos anteriores a 2000", from, to, unit: "pct" });
      }

      const ra = a.map((c) => c.row.rating).filter((r): r is number => r !== null);
      const rb = b.map((c) => c.row.rating).filter((r): r is number => r !== null);

      if (ra.length >= MIN.changeRated && rb.length >= MIN.changeRated) {
        const from = round1(mean(ra) as number);
        const to = round1(mean(rb) as number);

        if (Math.abs(to - from) >= 0.3) changes.push({ id: "rating", label: "Nota média", from, to, unit: "rating" });
      }

      const minutesA = a.reduce((s, c) => s + c.minutes, 0);
      const minutesB = b.reduce((s, c) => s + c.minutes, 0);

      if (minutesA > 0 && minutesB > 0) {
        const from = a.filter((c) => c.row.type === "tv").reduce((s, c) => s + c.minutes, 0) / minutesA;
        const to = b.filter((c) => c.row.type === "tv").reduce((s, c) => s + c.minutes, 0) / minutesB;

        if (params.type === "all" && Math.abs(to - from) >= 0.1) changes.push({ id: "series-share", label: "Tempo em séries", from, to, unit: "pct" });
      }
    }

    const years = new Map<number, Consumed[]>();

    for (let y = Number(today.slice(0, 4)); y >= Number(today.slice(0, 4)) - 9; y -= 1) {
      const list = consume(ctx, yearRange(y));

      if (list.length) years.set(y, list);
    }

    return {
      fromYear,
      toYear,
      changes: changes.sort((x, y) => Math.abs(y.to - y.from) / (y.unit === "rating" ? 10 : 1) - Math.abs(x.to - x.from) / (x.unit === "rating" ? 10 : 1)).slice(0, 6),
      years: [...years.entries()]
        .sort((x, y) => x[0] - y[0])
        .map(([year, list]) => {
          const r = list.map((c) => c.row.rating).filter((v): v is number => v !== null);

          return { year, count: list.length, avg: r.length >= MIN.changeRated ? round1(mean(r) as number) : null };
        }),
    };
  });

  /* ---------- Descoberta e IA ---------- */
  const ai = guard("ai", () => {
    const events = (input.events ?? []).filter(typed);
    const epsCount = new Map<number, number>();

    for (const [id, e] of epsByMedia) epsCount.set(id, e.all);

    const rec = recommendationStats(events, lib, epsCount, range);

    return {
      tracking: input.events !== null,
      since: rec.since,
      tools: rec.tools,
      monthly: rec.monthly,
      sources: discoveryStats(events, lib, epsCount, range),
      hidden: input.hidden.filter(typed).length,
    };
  });

  /* ---------- Ranking (biblioteca inteira, como /ranking) ---------- */
  const ranking = lib
    .filter((r) => r.rating !== null && r.status !== "want")
    // sort é estável: empates mantêm a ordem do SQL (updated_at DESC, id ASC),
    // a mesma de GET /api/ranking.
    .sort((a, b) => Number(b.rating) - Number(a.rating))
    .slice(0, 10)
    .map(rated);

  /* ---------- Seu ano ---------- */
  const year = guard("summary", () => {
    const y = /^\d{4}$/.test(params.period) ? Number(params.period) : Number(today.slice(0, 4));
    const yr: DayRange = { from: `${y}-01-01`, to: `${y}-12-31` };
    const list = consume(ctx, yr);
    const yc = core(ctx, yr);
    const best = (kind: "movie" | "tv") =>
      list.filter((c) => c.row.type === kind && c.row.rating !== null).sort((a, b) => Number(b.row.rating) - Number(a.row.rating))[0];
    const genre = buckets(list, (c) => c.row.genres, () => null)[0];
    const months = new Map<string, number>();

    for (const d of allDays) if (d.startsWith(String(y))) months.set(monthOf(d), (months.get(monthOf(d)) ?? 0) + dayMap.get(d)!.minutes);

    const busiest = [...months.entries()].sort((a, b) => b[1] - a[1])[0];
    const bm = best("movie");
    const bs = best("tv");

    return {
      year: y,
      core: yc,
      bestMovie: bm ? rated(bm.row) : null,
      bestSeries: bs ? rated(bs.row) : null,
      topGenre: genre && list.length >= 3 ? genre.label : null,
      busiestMonth: busiest && months.size >= 2 ? busiest[0] : null,
      top: list
        .filter((c) => c.row.rating !== null)
        .sort((a, b) => Number(b.row.rating) - Number(a.row.rating))
        .slice(0, 5)
        .map((c) => rated(c.row)),
    };
  });

  const payload: InsightsPayload = {
    meta: {
      period: params.period,
      type: params.type,
      range,
      prevRange: previous ? prev : null,
      today,
      timeZone: INSIGHTS_TZ,
      libraryTotal: lib.length,
      historyTotal: consume(ctx, { from: null, to: null }).length,
      enrichmentPending: lib.filter((r) => !r.enriched).length,
      failed,
    },
    summary: { cur, prev: previous, favorites: lib.filter((r) => r.favorite).length },
    insights: [],
    activity,
    taste,
    ratings,
    titles,
    rewatch,
    dropped,
    watchlist,
    evolution,
    ai,
    ranking,
    year,
  };

  payload.insights = guard("summary", () => generateInsights(payload)) ?? [];

  return payload;
}
