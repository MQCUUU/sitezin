/*
 * Biblioteca V2.6 — estado navegável na URL (fonte única da verdade).
 *
 * Nomes mantidos (links existentes em Home/Insights/Ranking): status, favorite=true,
 * search, page, type, genre, year, min_rating, min_tmdb_rating, sort.
 * Apelidos aceitos na leitura: q → search, liked=1 → favorite.
 * Valores inválidos são normalizados (nunca vão crus para a API).
 * Puro: testado em scripts/test-library-url.mjs.
 */

export const LIBRARY_STATUSES = ["want", "watching", "watched", "dropped", "rewatching", "rewatched", "paused"] as const;
export const LIBRARY_SORTS = ["added", "updated", "rating", "rating-low", "tmdb", "az", "za", "newest", "oldest"] as const;
export const RATING_STEPS = ["5", "6", "7", "8", "9"] as const;

export type LibraryStatusFilter = "all" | (typeof LIBRARY_STATUSES)[number];
export type LibrarySort = (typeof LIBRARY_SORTS)[number];

export type LibraryQuery = {
  page: number;
  status: LibraryStatusFilter;
  favorite: boolean;
  type: "all" | "movie" | "tv";
  genre: string;
  year: string;
  minRating: string;
  minTmdbRating: string;
  /** null = sem sort na URL (vale a preferência do usuário). */
  sort: LibrarySort | null;
  search: string;
};

type ParamsLike = { get(name: string): string | null };

const oneOf = <T extends string>(list: readonly T[], value: string | null): T | null => (value && (list as readonly string[]).includes(value) ? (value as T) : null);

export function parseLibraryQuery(params: ParamsLike): LibraryQuery {
  const page = Number(params.get("page"));
  const type = params.get("type");
  const year = params.get("year") || "";
  const search = (params.get("search") ?? params.get("q") ?? "").trim().slice(0, 100);
  const favorite = params.get("favorite") === "true" || params.get("liked") === "1" || params.get("liked") === "true";

  return {
    page: Number.isInteger(page) && page > 1 ? page : 1,
    status: oneOf(LIBRARY_STATUSES, params.get("status")) ?? "all",
    favorite,
    type: type === "movie" || type === "tv" ? type : "all",
    genre: (params.get("genre") || "").trim().slice(0, 60) || "all",
    year: /^\d{4}$/.test(year) ? year : "all",
    minRating: oneOf(RATING_STEPS, params.get("min_rating")) ?? "all",
    minTmdbRating: oneOf(RATING_STEPS, params.get("min_tmdb_rating")) ?? "all",
    sort: oneOf(LIBRARY_SORTS, params.get("sort")),
    search,
  };
}

/** Query canônica (ordem fixa, só o que difere do padrão). */
export function serializeLibraryQuery(query: LibraryQuery): string {
  const p = new URLSearchParams();

  if (query.status !== "all") p.set("status", query.status);
  if (query.favorite) p.set("favorite", "true");
  if (query.type !== "all") p.set("type", query.type);
  if (query.genre !== "all") p.set("genre", query.genre);
  if (query.year !== "all") p.set("year", query.year);
  if (query.minRating !== "all") p.set("min_rating", query.minRating);
  if (query.minTmdbRating !== "all") p.set("min_tmdb_rating", query.minTmdbRating);
  if (query.sort) p.set("sort", query.sort);
  if (query.search) p.set("search", query.search);
  if (query.page > 1) p.set("page", String(query.page));

  return p.toString();
}

/** Qualquer mudança que não seja a própria página volta para a página 1. */
export function withChange(query: LibraryQuery, change: Partial<LibraryQuery>): LibraryQuery {
  const next = { ...query, ...change };

  if (!("page" in change)) next.page = 1;

  return next;
}

/** Filtros do painel ativos (status/curtidos/ordenação/busca têm controle próprio). */
export function panelFilterCount(query: LibraryQuery) {
  return [query.type !== "all", query.genre !== "all", query.year !== "all", query.minRating !== "all", query.minTmdbRating !== "all"].filter(Boolean).length;
}

export function hasAnyFilter(query: LibraryQuery) {
  return query.status !== "all" || query.favorite || panelFilterCount(query) > 0 || Boolean(query.search);
}

/** Parâmetros para GET /api/library (paginado). */
export function apiParams(query: LibraryQuery, sort: LibrarySort, perPage: number): URLSearchParams {
  const p = new URLSearchParams({ paginated: "true", page: String(query.page), limit: String(perPage), sort });

  if (query.search) p.set("search", query.search);
  if (query.type !== "all") p.set("media_type", query.type);
  if (query.status !== "all") p.set("status", query.status);
  if (query.genre !== "all") p.set("genre", query.genre);
  if (query.year !== "all") p.set("year", query.year);
  if (query.favorite) p.set("favorite", "true");
  if (query.minRating !== "all") p.set("min_rating", query.minRating);
  if (query.minTmdbRating !== "all") p.set("min_tmdb_rating", query.minTmdbRating);

  return p;
}
