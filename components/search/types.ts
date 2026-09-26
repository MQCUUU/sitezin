export type MediaResult = {
  kind: "media";
  id: number;
  media_type: "movie" | "tv";
  title?: string;
  name?: string;
  poster_path?: string | null;
  release_date?: string;
  first_air_date?: string;
  vote_average?: number;
  overview?: string;
  reason?: string;
};

export type PersonResult = {
  kind: "person";
  id: number;
  name: string;
  profile_path?: string | null;
  known_for_department?: string;
  href: string;
};

export type CharacterResult = {
  kind: "character";
  name: string;
  matched: string;
  count: number;
  poster_path?: string | null;
  href: string;
};

export type CollectionResult = {
  kind: "collection";
  id: number;
  name: string;
  poster_path?: string | null;
  href: string;
};

export type UserResult = {
  kind: "user";
  id: string;
  name: string;
  username: string;
  avatar_url?: string | null;
  href: string;
};

export type SearchSuggestion =
  | MediaResult
  | PersonResult
  | CharacterResult
  | CollectionResult
  | UserResult;

export type SuggestResponse = {
  query?: string;
  suggestions?: SearchSuggestion[];
};

export type SearchTab = "all" | "movies" | "actors" | "users";

/**
 * Explicit state model (A3.2/B0 gap: previously everything was inferred
 * from `results.length === 0`, with no distinct "the request failed"
 * state — a network error looked identical to "no results").
 */
export type SearchState = "idle" | "loading" | "results" | "no-results" | "error";

/** Stable key/id shared between React `key` and the DOM `id` used for
 * `aria-activedescendant` — one function so they can never drift apart. */
export function getResultKey(item: SearchSuggestion): string {
  switch (item.kind) {
    case "user":
      return `user-${item.id}`;
    case "character":
      return `character-${item.name}-${item.matched}`;
    case "person":
      return `person-${item.id}`;
    case "collection":
      return `collection-${item.id}`;
    case "media":
      return `${item.media_type}-${item.id}`;
  }
}
