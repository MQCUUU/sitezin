/*
 * Insights — contratos de dados.
 *
 * Fontes (todas já existentes, exceto user_events — ver db/legacy/supabase/v2.3-insights.sql):
 *   library_items + media     → BIBLIOTECA (o que foi catalogado) e status/nota/curtido
 *   episodes_progress         → HISTÓRICO de séries (episódio marcado, com data)
 *   library_items.watched_at  → HISTÓRICO de filmes
 *   watch_entries             → reassistidas datadas e notas por visualização
 *   user_hidden_titles        → "Não tenho interesse"
 *   user_events               → recomendação exibida/aberta/rejeitada e origem das adições
 * "Quero assistir" NUNCA entra em consumo.
 */

export type MediaKind = "movie" | "tv";
export type TypeFilter = "all" | MediaKind;
export type PeriodKey = "all" | "year" | "12m" | "last_year" | "month" | "30d" | "custom" | `${number}`;

export type DayRange = { from: string | null; to: string | null };

export type InsightsParams = {
  period: PeriodKey;
  type: TypeFilter;
  from?: string | null;
  to?: string | null;
  compare: boolean;
};

/* ---------- Entradas ---------- */

export type LibRow = {
  media_id: number;
  tmdb_id: number;
  type: MediaKind;
  title: string;
  poster_path: string | null;
  status: string;
  favorite: boolean;
  rating: number | null;
  watched_day: string | null;
  added_day: string;
  updated_day: string;
  rewatch_count: number;
  release_year: number | null;
  runtime: number | null;
  seasons_count: number | null;
  episodes_count: number | null;
  completed_seasons: number;
  genres: string[];
  tmdb_rating: number | null;
  vote_count: number | null;
  language: string | null;
  countries: string[];
  cast: string[];
  creators: string[];
  directors: string[];
  /** TMDB já consultado para idioma/país/diretor. */
  enriched: boolean;
  /**
   * V2.5 — linha só de HISTÓRICO: o título saiu da Biblioteca (ou voltou sem o
   * status de assistido), mas o consumo aconteceu. Conta em consumo/horas/
   * reassistidas/ano; nunca no estado atual (watchlist, assistindo, favoritos…).
   */
  removed?: boolean;
};

/** Episódios marcados agrupados por (dia, série). `regular` exclui especiais (temporada 0). */
export type EpisodeDay = { media_id: number; day: string | null; n: number; regular: number; rewatch: number };

export type EntryRow = { media_id: number; day: string | null; rating: number | null; is_rewatch: boolean };

/** Registros por (dia, hora local, tipo). `timed` = tinha horário real (não 00:00). */
export type HourRow = { day: string; hour: number; type: MediaKind; n: number; timed: number };

export type HiddenRow = { type: MediaKind; day: string };

export type EventRow = {
  kind: "rec_shown" | "rec_opened" | "rec_dismissed" | "library_added";
  source: string;
  tmdb_id: number;
  type: MediaKind;
  day: string;
  /** Exposição da recomendação (null em library_added sem vínculo e em linhas legadas). */
  exposure: string | null;
};

export type InsightsInput = {
  library: LibRow[];
  episodes: EpisodeDay[];
  entries: EntryRow[];
  hours: HourRow[];
  hidden: HiddenRow[];
  /** null = tabela user_events ainda não existe (migração pendente). */
  events: EventRow[] | null;
  today: string;
};

/* ---------- Saída ---------- */

export type Core = {
  movies: number;
  episodes: number;
  series: number;
  minutes: number;
  movieMinutes: number;
  seriesMinutes: number;
  /** Horas inteiras: movieHours + seriesHours === hours (sempre). */
  hours: number;
  movieHours: number;
  seriesHours: number;
  rewatches: number;
  activeDays: number;
  rated: number;
  avgRating: number | null;
  dropped: number;
  added: number;
};

export type TitleRef = { tmdb_id: number; type: MediaKind; title: string; poster_path: string | null };
export type RatedRef = TitleRef & { rating: number };
export type Divergence = RatedRef & { community: number; diff: number };

export type SectionKey =
  | "summary"
  | "activity"
  | "taste"
  | "ratings"
  | "titles"
  | "rewatch"
  | "watchlist"
  | "evolution"
  | "ai";

export type Insight = {
  id: string;
  section: SectionKey;
  /** 1 = mais relevante. */
  priority: number;
  message: string;
  /** Números que sustentam a frase (mostrados em "Como chegamos nisso"). */
  evidence: string;
  sample: number;
};

export type GenreStat = {
  name: string;
  count: number;
  minutes: number;
  rated: number;
  avg: number | null;
  high: number;
  favorites: number;
  share: number;
};

export type PersonStat = { name: string; count: number; avg: number | null; best: string | null };
export type Bucket = { label: string; count: number; avg: number | null };

export type SeriesProgress = TitleRef & {
  watched: number;
  total: number | null;
  remaining: number | null;
  remainingMinutes: number | null;
  lastDay: string | null;
  staleDays: number | null;
};

export type Change = { id: string; label: string; from: number; to: number; unit: "pct" | "rating" };

export type ToolStat = {
  tool: string;
  /** Títulos distintos exibidos. */
  shown: number;
  /** Exposições (o mesmo título pode ser exibido de novo em outro momento). */
  exposures: number;
  opened: number;
  added: number;
  started: number;
  watched: number;
  liked: number;
  avgRating: number | null;
  dismissed: number;
};

export type SourceStat = { source: string; added: number; watched: number; liked: number; avgRating: number | null };

export type InsightsPayload = {
  meta: {
    period: PeriodKey;
    type: TypeFilter;
    range: DayRange;
    prevRange: DayRange | null;
    today: string;
    timeZone: string;
    libraryTotal: number;
    historyTotal: number;
    enrichmentPending: number;
    /** Partes que falharam no cálculo (o resto da página continua). */
    failed: SectionKey[];
  };
  summary: {
    cur: Core;
    prev: Core | null;
    favorites: number;
  };
  insights: Insight[];
  activity: {
    days: [string, number, number, number][];
    monthly: { month: string; movies: number; episodes: number; minutes: number }[];
    favoriteWeekday: number | null;
    weekday: number[];
    weekendShare: number | null;
    peakHours: { from: number; to: number; share: number } | null;
    hoursReliable: boolean;
    longestStreak: number;
    currentStreak: number;
    busiestMonth: { month: string; minutes: number } | null;
  } | null;
  taste: {
    consumed: number;
    genres: GenreStat[];
    genresByYear: { year: number; total: number; parts: { name: string; share: number }[] }[];
    decades: Bucket[];
    classicShare: number | null;
    languages: Bucket[];
    countries: Bucket[];
    directors: PersonStat[];
    cast: PersonStat[];
  } | null;
  ratings: {
    n: number;
    mean: number | null;
    median: number | null;
    mode: number | null;
    histogram: number[];
    coverage: number | null;
    band79: number | null;
    below6: number | null;
    community: { n: number; mine: number; tmdb: number; bias: number } | null;
    higher: Divergence[];
    lower: Divergence[];
  } | null;
  titles: {
    movies: {
      count: number;
      minutes: number;
      avgRuntime: number | null;
      avgRating: number | null;
      rewatches: number;
      topGenre: string | null;
      topDecade: string | null;
      topDirector: string | null;
      monthly: { month: string; count: number }[];
    };
    series: {
      watching: number;
      completed: number;
      dropped: number;
      paused: number;
      seasonsCompleted: number;
      episodes: number;
      minutes: number;
      inProgress: SeriesProgress[];
      nearlyDone: SeriesProgress[];
      remainingEpisodes: number;
      remainingMinutes: number;
    };
  } | null;
  rewatch: {
    total: number;
    share: number | null;
    top: (TitleRef & { times: number })[];
    topGenre: string | null;
    intervalDays: number | null;
    ratingChange: { n: number; mean: number } | null;
  } | null;
  dropped: {
    count: number;
    rate: number | null;
    genres: { name: string; dropped: number; tracked: number; rate: number }[];
    medianEpisode: number | null;
  } | null;
  watchlist: {
    size: number;
    movies: number;
    series: number;
    addedInPeriod: number;
    converted: { added: number; watched: number } | null;
    avgAgeDays: number | null;
    clearMonths: number | null;
    growing: { added90: number; watched90: number } | null;
    oldest: (TitleRef & { days: number })[];
  } | null;
  evolution: {
    fromYear: number;
    toYear: number;
    changes: Change[];
    years: { year: number; count: number; avg: number | null }[];
  } | null;
  ai: {
    tracking: boolean;
    since: string | null;
    tools: ToolStat[];
    monthly: { month: string; watched: number; liked: number }[];
    sources: SourceStat[];
    hidden: number;
  } | null;
  ranking: RatedRef[];
  year: {
    year: number;
    core: Core;
    bestMovie: RatedRef | null;
    bestSeries: RatedRef | null;
    topGenre: string | null;
    busiestMonth: string | null;
    top: RatedRef[];
  } | null;
};
