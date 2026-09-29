import type { MediaType } from "@/lib/discover/params";

export type DiscoverItem = {
  id: number;
  media_type: MediaType;

  title?: string;
  name?: string;

  original_title?: string;
  original_name?: string;

  poster_path: string | null;

  release_date?: string;
  first_air_date?: string;

  vote_average: number;

  overview?: string;

  genre_ids?: number[];

  in_library: boolean;
  library_id: string | null;
  favorite: boolean;
  library_status?: string | null;
  personal_rating?: number | null;
};

export type DiscoverResponse = {
  page: number;
  total_pages: number;
  total_results: number;
  per_page?: number;
  personal_filters?: boolean;
  needs_streaming_setup?: boolean;

  results: DiscoverItem[];
};

export type Genre = {
  id: number;
  name: string;
};

export type Provider = {
  provider_id: number;
  provider_name: string;
  logo_path: string | null;
};

export type FilterResponse = {
  genres: Genre[];
  providers: Provider[];
};

export const DISCOVER_STATUS_OPTIONS = [
  ["want", "Quero assistir"],
  ["watching", "Assistindo"],
  ["watched", "Assistido"],
  ["paused", "Pausado"],
  ["dropped", "Abandonado"],
  ["rewatching", "Reassistindo"],
  ["rewatched", "Reassistido"],
] as const;

export function getStatusLabel(status?: string | null) {
  return (
    DISCOVER_STATUS_OPTIONS.find(([value]) => value === status)?.[1] ||
    "Na biblioteca"
  );
}

export const COUNTRIES = [
  ["BR", "Brasil"],
  ["US", "Estados Unidos"],
  ["GB", "Reino Unido"],
  ["KR", "Coreia do Sul"],
  ["JP", "Japão"],
  ["FR", "França"],
  ["ES", "Espanha"],
  ["DE", "Alemanha"],
  ["IT", "Itália"],
  ["MX", "México"],
  ["CA", "Canadá"],
  ["IN", "Índia"],
  ["CN", "China"],
  ["AU", "Austrália"],
] as const;

/**
 * `siblingCount` controls how many page numbers show on each side of the
 * current page (desktop default: 2, matching the original layout). Mobile
 * passes 1 — "previous/current/next" — to keep the pagination strip on one
 * line at narrow widths without shrinking button size or hiding first/last.
 */
export function buildPages(
  current: number,
  total: number,
  siblingCount = 2
): (number | "ellipsis-left" | "ellipsis-right")[] {
  const values: (number | "ellipsis-left" | "ellipsis-right")[] = [];
  const maxSingleRow = siblingCount * 2 + 5;

  if (total <= maxSingleRow) {
    for (let page = 1; page <= total; page++) {
      values.push(page);
    }
    return values;
  }

  values.push(1);

  if (current > siblingCount + 2) {
    values.push("ellipsis-left");
  }

  const start = Math.max(2, current - siblingCount);
  const end = Math.min(total - 1, current + siblingCount);

  for (let page = start; page <= end; page++) {
    values.push(page);
  }

  if (current < total - siblingCount - 1) {
    values.push("ellipsis-right");
  }

  values.push(total);

  return values;
}
