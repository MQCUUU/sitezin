import type { DiaryDay, DiaryFilter, DiaryGroup, DiaryMoment, MomentKind, RawEpisode, RawEvent, RawItem, RawWatch } from "./types";

/*
 * Diário — eventos crus → momentos. Puro e determinístico (testado em
 * scripts/diary-moments.test.ts). Regras:
 *
 * 1. Dias diferentes nunca se juntam (dia civil de Brasília, vindo do servidor).
 * 2. Títulos diferentes nunca se juntam.
 * 3. Do mesmo título no mesmo dia, linhas viram UM momento quando são a mesma
 *    jornada: intervalo ≤ 30 min entre linhas consecutivas (≤ 3 h entre
 *    episódios avulsos — uma sessão; um lote marcado de uma vez só junta a
 *    própria rajada), e sem "virada de ciclo" (ver `joins`).
 * 4. O momento é contado pela linha de maior valor narrativo (consumo >
 *    conclusão > reassistida > abandono/retomada > adição > status); as
 *    demais são absorvidas (ids preservados em `raw`).
 * 5. Linhas sem título identificável vão para um grupo recolhido do dia;
 *    4+ momentos de organização (adições/status) no dia também.
 */

const SAME_MOMENT_MS = 30 * 60 * 1000;
const SAME_SESSION_MS = 3 * 60 * 60 * 1000;
/** Marcação em lote: a mesma operação grava os episódios em poucos segundos. */
const BATCH_MS = 2 * 60 * 1000;
export const LIBRARY_GROUP_MIN = 4;

const ms = (iso: string) => new Date(iso).getTime();

function statusTo(item: RawItem) {
  return item.source === "event" && item.type === "status_changed" ? String(item.meta.to ?? "") : null;
}

function statusFrom(item: RawItem) {
  return item.source === "event" && item.type === "status_changed" ? String(item.meta.from ?? "") : null;
}

/** Consumo ou marco: depois dele, uma nova fase começa outro momento. */
function isTerminal(item: RawItem) {
  if (item.source !== "event") return true;
  if (item.type === "season_completed" || item.type === "series_completed" || item.type === "watch_logged") return true;

  const to = statusTo(item);

  return to === "watched" || to === "rewatched";
}

function isCycleStart(item: RawItem) {
  if (item.source !== "event") return false;
  if (item.type === "rewatch_started") return true;

  const to = statusTo(item);

  return to === "rewatching" || to === "watching" || to === "dropped" || to === "want";
}

/**
 * Rajadas de episódios: marcações a ≤ 2 min uma da outra são a mesma operação.
 * Uma rajada com 2+ episódios é um lote ("marcou N de uma vez") e nunca se
 * junta a episódios avulsos — senão "assistiu T5:E10 às 20h" + "marcou a T6
 * inteira às 22h" viraria um falso "assistiu 14 episódios".
 */
function burstSizes(items: RawItem[]) {
  const sizes = new Map<string, number>();
  let burst: RawItem[] = [];
  const flush = () => burst.forEach((i) => sizes.set(i.id, burst.length));

  for (const item of items) {
    if (item.source !== "episode") continue;

    const last = burst[burst.length - 1];

    if (last && ms(item.at) - ms(last.at) > BATCH_MS) {
      flush();
      burst = [];
    }

    burst.push(item);
  }

  flush();

  return sizes;
}

const isRemoval = (item: RawItem) => item.source === "event" && item.type === "library_removed";

function joins(cluster: RawItem[], item: RawItem, bursts: Map<string, number>) {
  const last = cluster[cluster.length - 1];

  // Remover da Biblioteca é sempre um momento à parte (nunca some dentro de "Assistiu"),
  // e o que vem depois de uma remoção (ex.: readicionar) também.
  if (isRemoval(item) || cluster.some(isRemoval)) return false;
  const gap = ms(item.at) - ms(last.at);
  const episodes = item.source === "episode" && last.source === "episode";
  const window = episodes ? SAME_SESSION_MS : SAME_MOMENT_MS;

  if (gap > window) return false;
  // Sessão (até 3 h) só entre episódios avulsos; lote só com a própria rajada.
  if (episodes && gap > BATCH_MS && ((bursts.get(item.id) ?? 1) > 1 || (bursts.get(last.id) ?? 1) > 1)) return false;
  // Nova fase depois de um consumo/marco = outro momento (ex.: terminou e começou a reassistir).
  if (isCycleStart(item) && cluster.some(isTerminal)) return false;
  // Duas visualizações registradas = duas sessões.
  if (item.source === "watch" && cluster.some((c) => c.source === "watch")) return false;

  return true;
}

function sortKey(item: RawItem) {
  return item.source === "episode" ? item.season * 10_000 + item.episode : 0;
}

function bySequence(a: RawItem, b: RawItem) {
  return ms(a.at) - ms(b.at) || sortKey(a) - sortKey(b) || a.id.localeCompare(b.id);
}

/** Agrupa as linhas de um mesmo título num mesmo dia em clusters (jornadas). */
export function clusterItems(items: RawItem[]): RawItem[][] {
  const clusters: RawItem[][] = [];
  const sorted = [...items].sort(bySequence);
  const bursts = burstSizes(sorted);

  for (const item of sorted) {
    const current = clusters[clusters.length - 1];

    if (current && joins(current, item, bursts)) current.push(item);
    else clusters.push([item]);
  }

  return clusters;
}

function blank(primary: RawItem, items: RawItem[], kind: MomentKind): DiaryMoment {
  return {
    id: items[0].id,
    day: primary.day,
    time: primary.time,
    at: primary.at,
    kind,
    tier: kind === "added" || kind === "status" || kind === "removed" ? "secondary" : "primary",
    media: items.find((i) => i.media)?.media ?? null,
    rating: null,
    comment: null,
    rewatch_number: null,
    rewatch_started: false,
    episodes: [],
    batch: false,
    seasons_completed: [],
    series_completed: false,
    stopped_season: null,
    status: null,
    from_status: null,
    raw: items.map((i) => i.id),
  };
}

const num = (value: unknown) => {
  const n = Number(value);

  return Number.isFinite(n) && n > 0 ? n : null;
};

/** Um cluster → um momento. */
export function toMoment(items: RawItem[]): DiaryMoment {
  const events = items.filter((i): i is RawEvent => i.source === "event");
  const watches = items.filter((i): i is RawWatch => i.source === "watch");
  const episodes = items.filter((i): i is RawEpisode => i.source === "episode").sort(bySequence);
  const statuses = events.filter((e) => e.type === "status_changed");
  const lastStatus = statuses[statuses.length - 1];
  const to = (target: string) => [...statuses].reverse().find((s) => statusTo(s) === target);
  const added = events.find((e) => e.type === "library_added");
  const rewatchStart = events.find((e) => e.type === "rewatch_started") || to("rewatching");
  const seriesEvent = events.find((e) => e.type === "series_completed");
  const legacySeasons = events.filter((e) => e.type === "season_completed").map((e) => num(e.meta.season)).filter((n): n is number => n !== null);
  const mediaType = items.find((i) => i.media)?.media?.media_type ?? (added?.meta.media_type === "movie" || added?.meta.media_type === "tv" ? added.meta.media_type : null);
  const addedStatus = added ? String(added.meta.status ?? "") : null;
  const dropped = to("dropped");
  const resumed = statuses.find((s) => statusFrom(s) === "dropped" && (statusTo(s) === "watching" || statusTo(s) === "rewatching"));
  const back = statuses.find((s) => (statusFrom(s) === "watched" || statusFrom(s) === "rewatched") && statusTo(s) === "watching");
  const finished = statuses.find((s) => statusTo(s) === "watched" && statusFrom(s) !== "rewatched");
  const rewatched = to("rewatched");
  const make = (primary: RawItem, kind: MomentKind) => blank(primary, items, kind);
  const removal = events.find((e) => e.type === "library_removed");

  if (removal) return make(removal, "removed");

  // ---------- filme ----------
  if (mediaType === "movie") {
    if (watches.length) {
      const w = watches[watches.length - 1];
      const m = make(w, w.is_rewatch ? "rewatched" : "watched");

      m.rating = w.rating;
      m.comment = w.comment;
      m.rewatch_number = w.is_rewatch ? Math.max(1, w.watch_number - 1) : null;

      return m;
    }

    // `series_completed` em filme = legado "terminou de assistir" (ver docs/V2.5-DIARY.md §1.4).
    if (finished || seriesEvent || addedStatus === "watched") return make(finished || seriesEvent || added!, "watched");
  }

  // ---------- série ----------
  if (mediaType === "tv") {
    const seasons = new Set(legacySeasons);

    for (const e of episodes) if (e.season_done) seasons.add(e.season);

    const seriesDone = episodes.some((e) => e.series_done) || Boolean(seriesEvent) || Boolean(finished) || addedStatus === "watched";

    if (episodes.length) {
      const last = episodes[episodes.length - 1];
      const m = make(last, "episodes");

      m.episodes = episodes.map((e) => ({ season: e.season, episode: e.episode }));
      m.batch = episodes.length > 1 && ms(last.at) - ms(episodes[0].at) <= BATCH_MS;
      m.seasons_completed = [...seasons].sort((a, b) => a - b);
      m.series_completed = seriesDone;
      m.rewatch_started = Boolean(rewatchStart);

      return m;
    }

    if (!rewatched && seriesDone) {
      const m = make(finished || seriesEvent || added!, "series_completed");

      m.seasons_completed = [...seasons].sort((a, b) => a - b);
      m.series_completed = true;

      return m;
    }

    if (!rewatched && seasons.size) {
      const m = make(events.find((e) => e.type === "season_completed")!, "season_completed");

      m.seasons_completed = [...seasons].sort((a, b) => a - b);

      return m;
    }
  }

  // ---------- comum (filme, série e título não identificado) ----------
  if (!mediaType && (seriesEvent || finished)) return make(seriesEvent || finished!, "completed_unknown");

  if (!mediaType && legacySeasons.length) {
    const m = make(events.find((e) => e.type === "season_completed")!, "season_completed");

    m.seasons_completed = [...new Set(legacySeasons)].sort((a, b) => a - b);

    return m;
  }

  if (rewatched || addedStatus === "rewatched") {
    const m = make(rewatched || added!, "rewatched");

    m.rewatch_number = num(rewatched?.meta.rewatch_number);

    return m;
  }

  if (rewatchStart) {
    const m = make(rewatchStart, "rewatch_started");
    const count = events.find((e) => e.type === "rewatch_started")?.meta.rewatch_count;

    m.rewatch_number = num(count);

    return m;
  }

  if (dropped) {
    const m = make(dropped, "dropped");

    m.stopped_season = num(dropped.meta.stopped_season) ?? num(dropped.meta.current_season);

    return m;
  }

  if (resumed || back) {
    const m = make((resumed || back)!, "resumed");

    m.from_status = statusFrom((resumed || back)!);

    return m;
  }

  if (to("watching") || addedStatus === "watching") return make(to("watching") || added!, "started");

  if (added) {
    const m = make(added, "added");

    m.status = addedStatus;

    return m;
  }

  const m = make(lastStatus || items[items.length - 1], "status");

  m.status = lastStatus ? statusTo(lastStatus) : null;
  m.from_status = lastStatus ? statusFrom(lastStatus) : null;

  return m;
}

const desc = (a: DiaryMoment, b: DiaryMoment) => ms(b.at) - ms(a.at) || b.id.localeCompare(a.id);

/** Linhas cruas → dias (mais recente primeiro) com momentos e grupos recolhidos. */
export function buildDays(items: RawItem[]): DiaryDay[] {
  const byDay = new Map<string, Map<string, RawItem[]>>();

  for (const item of items) {
    // Sem título: cada instante é uma operação (ex.: legado "T1…T9 concluídas" de uma vez).
    const subject = item.media ? `m${item.media.id}` : `x${item.at}`;
    const day = byDay.get(item.day) ?? new Map<string, RawItem[]>();

    day.set(subject, [...(day.get(subject) ?? []), item]);
    byDay.set(item.day, day);
  }

  return [...byDay.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([day, subjects]) => {
      const all = [...subjects.values()].flatMap((list) => clusterItems(list).map(toMoment)).sort(desc);
      const unlinked = all.filter((m) => !m.media);
      const linked = all.filter((m) => m.media);
      const secondary = linked.filter((m) => m.tier === "secondary");
      const collapse = secondary.length >= LIBRARY_GROUP_MIN;
      const groups: DiaryGroup[] = [];

      if (collapse) groups.push({ id: `${day}:library`, kind: "library", moments: secondary });
      if (unlinked.length) groups.push({ id: `${day}:unlinked`, kind: "unlinked", moments: unlinked });

      return { day, moments: collapse ? linked.filter((m) => m.tier === "primary") : linked, groups };
    });
}

export function matchesFilter(m: DiaryMoment, filter: DiaryFilter) {
  if (filter === "watched") return ["watched", "rewatched", "episodes", "season_completed", "series_completed"].includes(m.kind);
  if (filter === "rewatch") return m.kind === "rewatched" || m.kind === "rewatch_started" || m.rewatch_started;
  if (filter === "rated") return m.rating !== null || Boolean(m.comment);

  return true;
}

/** Filtros recortam momentos com título; grupos de organização só em "Tudo". */
export function filterDays(days: DiaryDay[], filter: DiaryFilter): DiaryDay[] {
  if (filter === "all") return days;

  return days
    .map((d) => ({ day: d.day, moments: d.moments.filter((m) => matchesFilter(m, filter)), groups: [] }))
    .filter((d) => d.moments.length);
}
