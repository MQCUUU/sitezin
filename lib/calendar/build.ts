import type { CalendarEvent, CalendarEventType, Progress, Relationship } from "./types";

/*
 * Calendário — normalização PURA (sem rede/banco/React), testável.
 * Recebe o que a rota já leu e devolve eventos únicos, agrupados e ordenados.
 */

export type LibraryEntry = {
  tmdb_id: number;
  media_type: "movie" | "tv";
  status: string;
  /** Episódios regulares assistidos (temporada > 0), "S-E". */
  watched: Set<string>;
};

export type SeriesInput = {
  tmdb_id: number;
  title: string;
  poster_path: string | null;
  backdrop_path: string | null;
  popularity: number;
  /** Temporadas regulares (> 0) com nº de episódios — para calcular progresso. */
  seasons: { season_number: number; episode_count: number }[];
  /** Episódios com data dentro do período pedido. */
  episodes: { season_number: number; episode_number: number; air_date: string }[];
};

export type MovieInput = {
  tmdb_id: number;
  title: string;
  poster_path: string | null;
  backdrop_path: string | null;
  date: string;
  release_label: string | null;
  popularity: number;
  /** true = data veio da biblioteca (lançamento BR/US conferido). */
  fromLibrary: boolean;
};

export type DiscoveryInput = {
  tmdb_id: number;
  media_type: "movie" | "tv";
  title: string;
  poster_path: string | null;
  backdrop_path: string | null;
  date: string;
  popularity: number;
};

const FOLLOWING = new Set(["watching", "rewatching", "watched", "rewatched"]);
const REL_RANK: Record<Relationship, number> = { following: 0, watchlist: 1, library: 2 };
const TYPE_RANK: Record<CalendarEventType, number> = {
  episode_release: 0,
  season_premiere: 1,
  season_release: 1,
  series_premiere: 2,
  movie_release: 3,
};

export function relationshipOf(entry: LibraryEntry | undefined): Relationship | null {
  if (!entry || entry.status === "dropped") return null;
  if (entry.status === "want") return "watchlist";
  if (entry.media_type === "tv" && (FOLLOWING.has(entry.status) || entry.watched.size > 0)) return "following";

  return "library";
}

/**
 * Progresso até um lançamento (temporada S, a partir do episódio E).
 * Uma única mensagem, a mais útil: em dia · faltam N · está na T{n} · não começou.
 */
export function progressFor(entry: LibraryEntry, seasons: SeriesInput["seasons"], season: number, episode: number): Progress | null {
  const airedBefore =
    seasons.filter((s) => s.season_number > 0 && s.season_number < season).reduce((sum, s) => sum + s.episode_count, 0) + (episode - 1);
  let watchedBefore = 0;
  let lastSeason = 0;

  for (const key of entry.watched) {
    const [s, e] = key.split("-").map(Number);

    if (s < season || (s === season && e < episode)) watchedBefore += 1;
    if (s > lastSeason) lastSeason = s;
  }

  // Nada lançado antes (estreia da série): não há progresso a mostrar.
  if (airedBefore === 0) return null;
  if (watchedBefore === 0) return { kind: "not_started" };

  const behind = Math.max(0, airedBefore - watchedBefore);

  if (behind === 0) return { kind: "caught_up" };
  if (behind <= 6) return { kind: "behind", episodes: behind };

  return { kind: "in_season", season: Math.max(1, lastSeason) };
}

/** Compara eventos do MESMO dia: pessoal primeiro, depois tipo, depois popularidade. */
export function compareSameDay(a: CalendarEvent, b: CalendarEvent) {
  const ra = a.relationship ? REL_RANK[a.relationship] : 9;
  const rb = b.relationship ? REL_RANK[b.relationship] : 9;

  if (ra !== rb) return ra - rb;
  if (TYPE_RANK[a.type] !== TYPE_RANK[b.type]) return TYPE_RANK[a.type] - TYPE_RANK[b.type];
  if (b.popularity !== a.popularity) return b.popularity - a.popularity;

  return a.id.localeCompare(b.id);
}

export function sortEvents(events: CalendarEvent[]) {
  return events.sort((a, b) => (a.date === b.date ? compareSameDay(a, b) : a.date < b.date ? -1 : 1));
}

function inRange(day: string, from: string, to: string) {
  return day >= from && day <= to;
}

export function buildEvents(input: {
  from: string;
  to: string;
  library: Map<string, LibraryEntry>;
  series: SeriesInput[];
  movies: MovieInput[];
  discoveries: DiscoveryInput[];
  watchedMovies: Set<number>;
}): CalendarEvent[] {
  const { from, to, library } = input;
  const byId = new Map<string, CalendarEvent>();
  const put = (event: CalendarEvent) => {
    const existing = byId.get(event.id);

    // Mesma coisa vinda de duas fontes: fica a versão pessoal (mais dados).
    if (!existing || (!existing.relationship && event.relationship)) byId.set(event.id, event);
  };

  /* ----- séries da biblioteca: episódios do período, agrupados por (temporada, dia) ----- */
  for (const s of input.series) {
    const entry = library.get(`tv-${s.tmdb_id}`);
    const relationship = relationshipOf(entry);
    const groups = new Map<string, { season: number; date: string; episodes: number[] }>();

    for (const ep of s.episodes) {
      if (ep.season_number <= 0 || !inRange(ep.air_date, from, to)) continue;

      const key = `${ep.season_number}|${ep.air_date}`;
      const g = groups.get(key) ?? { season: ep.season_number, date: ep.air_date, episodes: [] };

      g.episodes.push(ep.episode_number);
      groups.set(key, g);
    }

    for (const g of groups.values()) {
      const eps = [...new Set(g.episodes)].sort((a, b) => a - b);
      const first = eps[0];
      const last = eps[eps.length - 1];
      const seasonSize = s.seasons.find((x) => x.season_number === g.season)?.episode_count ?? 0;
      const wholeSeason = first === 1 && seasonSize > 1 && eps.length >= seasonSize;
      let type: CalendarEventType = "episode_release";

      if (first === 1 && g.season === 1) type = "series_premiere";
      else if (wholeSeason) type = "season_release";
      else if (first === 1) type = "season_premiere";

      const watched = Boolean(entry && eps.every((e) => entry.watched.has(`${g.season}-${e}`)));

      put({
        id: type === "series_premiere" ? `tv:${s.tmdb_id}:premiere` : `tv:${s.tmdb_id}:s${g.season}:${g.date}`,
        date: g.date,
        type,
        media_type: "tv",
        tmdb_id: s.tmdb_id,
        title: s.title,
        poster_path: s.poster_path,
        backdrop_path: s.backdrop_path,
        season_number: g.season,
        episode_from: first,
        episode_to: last,
        episode_count: eps.length,
        release_label: null,
        relationship,
        progress: relationship === "following" && entry && !watched ? progressFor(entry, s.seasons, g.season, first) : null,
        watched,
        popularity: s.popularity,
      });
    }
  }

  /* ----- filmes da biblioteca (data BR/US conferida) e descobertas ----- */
  for (const m of input.movies) {
    if (!inRange(m.date, from, to)) continue;

    const entry = library.get(`movie-${m.tmdb_id}`);

    put({
      id: `movie:${m.tmdb_id}`,
      date: m.date,
      type: "movie_release",
      media_type: "movie",
      tmdb_id: m.tmdb_id,
      title: m.title,
      poster_path: m.poster_path,
      backdrop_path: m.backdrop_path,
      season_number: null,
      episode_from: null,
      episode_to: null,
      episode_count: 0,
      release_label: m.release_label,
      relationship: relationshipOf(entry),
      progress: null,
      watched: input.watchedMovies.has(m.tmdb_id),
      popularity: m.popularity,
    });
  }

  for (const d of input.discoveries) {
    if (!inRange(d.date, from, to)) continue;

    const key = `${d.media_type}-${d.tmdb_id}`;
    const entry = library.get(key);
    const id = d.media_type === "movie" ? `movie:${d.tmdb_id}` : `tv:${d.tmdb_id}:premiere`;

    // Filme da biblioteca já tem data conferida: a descoberta não sobrescreve.
    if (byId.has(id)) continue;

    put({
      id,
      date: d.date,
      type: d.media_type === "movie" ? "movie_release" : "series_premiere",
      media_type: d.media_type,
      tmdb_id: d.tmdb_id,
      title: d.title,
      poster_path: d.poster_path,
      backdrop_path: d.backdrop_path,
      season_number: d.media_type === "tv" ? 1 : null,
      episode_from: null,
      episode_to: null,
      episode_count: 0,
      release_label: null,
      relationship: relationshipOf(entry),
      progress: null,
      watched: d.media_type === "movie" ? input.watchedMovies.has(d.tmdb_id) : false,
      popularity: d.popularity,
    });
  }

  return sortEvents([...byId.values()]);
}

/** Próximo evento a destacar: pessoal primeiro (a partir de hoje); senão, o próximo lançamento. */
export function pickHero(events: CalendarEvent[], today: string) {
  const upcoming = events.filter((e) => e.date >= today && !e.watched);
  const personal = upcoming.filter((e) => e.relationship === "following" || e.relationship === "watchlist");
  const pick = personal[0] ?? upcoming.find((e) => e.relationship) ?? upcoming[0] ?? null;

  return pick ? { event: pick, personal: Boolean(pick.relationship) } : null;
}

/** Resumo leve de um período (ex.: semana atual). */
export function summarize(events: CalendarEvent[]) {
  return {
    following: events.filter((e) => e.relationship === "following").length,
    watchlist: events.filter((e) => e.relationship === "watchlist").length,
    library: events.filter((e) => e.relationship === "library").length,
    other: events.filter((e) => !e.relationship).length,
  };
}

export function isPersonal(e: CalendarEvent) {
  return e.relationship !== null;
}

