/**
 * URL <-> Discover filter state mapping.
 *
 * B1.5 flagged the real debt here: Discover mirrored the URL into local
 * `useState` once on mount, then only ever wrote state -> URL. Back/Forward
 * changed the URL but nothing re-read it, so the page never visually
 * reacted. The fix is structural: there is no local filter state anymore.
 * `useSearchParams()` IS the state, parsed fresh on every render — so a
 * popstate (Back/Forward) that changes the URL automatically produces new
 * parsed params and a normal re-render/re-fetch, no listener needed.
 */

export type MediaType = "movie" | "tv";
export type DiscoverType = "all" | MediaType;
export type DiscoverSort = "popular" | "rating" | "newest";

export type DiscoverParams = {
  type: DiscoverType;
  sort: DiscoverSort;
  page: number;
  genre: string;
  year: string;
  rating: string;
  country: string;
  provider: string;
  hideWatched: boolean;
  onlyNew: boolean;
};

export const DEFAULT_DISCOVER_PARAMS: DiscoverParams = {
  type: "all",
  sort: "popular",
  page: 1,
  genre: "",
  year: "",
  rating: "",
  country: "",
  provider: "",
  hideWatched: false,
  onlyNew: false,
};

export function parseDiscoverParams(searchParams: URLSearchParams): DiscoverParams {
  const rawType = searchParams.get("type");
  const rawSort = searchParams.get("sort");
  const rawPage = Number(searchParams.get("page") || 1);

  return {
    type: rawType === "tv" || rawType === "movie" ? rawType : "all",
    sort: rawSort === "rating" || rawSort === "newest" ? rawSort : "popular",
    page: Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1,
    genre: searchParams.get("genre") || "",
    year: searchParams.get("year") || "",
    rating: searchParams.get("rating") || "",
    country: searchParams.get("country") || "",
    provider: searchParams.get("provider") || "",
    hideWatched: searchParams.get("hide_watched") === "1",
    onlyNew: searchParams.get("only_new") === "1",
  };
}

export function serializeDiscoverParams(params: DiscoverParams): URLSearchParams {
  const next = new URLSearchParams();

  next.set("type", params.type);
  next.set("sort", params.sort);
  next.set("page", String(params.page));

  if (params.genre) next.set("genre", params.genre);
  if (params.year) next.set("year", params.year);
  if (params.rating) next.set("rating", params.rating);
  if (params.country) next.set("country", params.country);
  if (params.provider) next.set("provider", params.provider);
  if (params.hideWatched) next.set("hide_watched", "1");
  if (params.onlyNew) next.set("only_new", "1");

  return next;
}

export function countActiveFilters(params: DiscoverParams): number {
  return (
    Number(!!params.genre) +
    Number(!!params.year) +
    Number(!!params.rating) +
    Number(!!params.country) +
    Number(!!params.provider) +
    Number(params.hideWatched) +
    Number(params.onlyNew)
  );
}

export const CLEAR_FILTERS_PATCH: Partial<DiscoverParams> = {
  genre: "",
  year: "",
  rating: "",
  country: "",
  provider: "",
  hideWatched: false,
  onlyNew: false,
};
