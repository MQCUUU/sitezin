import type { DiscoverItem, Genre } from "@/components/discover/types";
import { getStatusLabel as getDiscoverStatusLabel } from "@/components/discover/types";
import type { LibraryState, SearchItem } from "@/components/search/page/types";
import { getStatusLabel as getSearchStatusLabel } from "@/components/search/page/types";

import type { MediaPreviewData } from "./types";

/**
 * TMDB `/movie/{id}` or `/tv/{id}` details payload, trimmed to the fields
 * the Quick Peek actually reads. Optional throughout because Discover/
 * Search/For You/Collection all render the preview before details finish
 * loading, falling back to the list item's own fields.
 */
export type TmdbDetailsLike = {
  genres?: { id: number; name: string }[];
  runtime?: number | null;
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  release_date?: string;
  first_air_date?: string;
  vote_average?: number;
  original_title?: string;
  original_name?: string;
  title?: string;
  name?: string;
};

/**
 * For You and Collection type their preview item as `any` today (see C2.1
 * audit) — this is the shape they actually put on it at the call sites,
 * used here only so the adapters below don't have to take `any`.
 */
export type LooseMediaItem = {
  id: number;
  media_type?: "movie" | "tv";
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  release_date?: string;
  first_air_date?: string;
  vote_average?: number;
  overview?: string;
};

export type LooseLibraryItem = {
  library_id?: string | null;
  status?: string | null;
  personal_rating?: number | null;
};

function libraryStateFrom(
  libraryId: string | null,
  statusLabel: string | null,
  personalRating: number | null | undefined
) {
  if (!libraryId) return null;
  return { libraryId, statusLabel, personalRating: personalRating ?? null };
}

/** Discover items only carry `genre_ids` — resolve them against the filter response's genre list. */
export function fromDiscoverItem(item: DiscoverItem, genreLookup: Genre[]): MediaPreviewData {
  const genres = (item.genre_ids || [])
    .map((id) => genreLookup.find((genre) => genre.id === id)?.name)
    .filter((name): name is string => Boolean(name));

  return {
    id: item.id,
    mediaType: item.media_type,
    title: item.title || item.name || "Sem título",
    originalTitle: item.original_title || item.original_name || null,
    overview: item.overview || null,
    posterPath: item.poster_path,
    backdropPath: null,
    releaseDate: item.release_date || item.first_air_date || null,
    runtime: null,
    genres,
    voteAverage: item.vote_average || null,
    libraryState: libraryStateFrom(
      item.in_library ? item.library_id : null,
      item.in_library ? getDiscoverStatusLabel(item.library_status) : null,
      item.personal_rating
    ),
  };
}

export function fromSearchItem(
  item: SearchItem,
  details: TmdbDetailsLike | null | undefined,
  libraryItem: LibraryState | null | undefined
): MediaPreviewData {
  return {
    id: item.id,
    mediaType: item.media_type,
    title: item.title || item.name || "Sem título",
    originalTitle: item.original_title || item.original_name || null,
    overview: details?.overview || item.overview || null,
    posterPath: item.poster_path || details?.poster_path || null,
    backdropPath: item.backdrop_path || details?.backdrop_path || null,
    releaseDate: item.release_date || item.first_air_date || details?.release_date || details?.first_air_date || null,
    runtime: details?.runtime ?? null,
    genres: (details?.genres || []).map((genre) => genre.name),
    voteAverage: item.vote_average || details?.vote_average || null,
    libraryState: libraryStateFrom(
      libraryItem?.library_id ?? null,
      libraryItem ? getSearchStatusLabel(libraryItem.status) : null,
      libraryItem?.personal_rating
    ),
  };
}

/**
 * For You and Collection both use a page-level `LooseLibraryItem` shaped
 * exactly like Search's `LibraryState` (same fields, no shared type today)
 * — this adapter covers both, since the underlying data shape is identical.
 */
export function fromLooseMediaItem(
  item: LooseMediaItem,
  details: TmdbDetailsLike | null | undefined,
  libraryItem: LooseLibraryItem | null | undefined,
  fallbackMediaType: "movie" | "tv" = "movie"
): MediaPreviewData {
  return {
    id: item.id,
    mediaType: item.media_type || fallbackMediaType,
    title: item.title || item.name || details?.title || details?.name || "Sem título",
    originalTitle: item.original_title || item.original_name || details?.original_title || details?.original_name || null,
    overview: details?.overview || item.overview || null,
    posterPath: item.poster_path || details?.poster_path || null,
    backdropPath: item.backdrop_path || details?.backdrop_path || null,
    releaseDate: item.release_date || item.first_air_date || details?.release_date || details?.first_air_date || null,
    runtime: details?.runtime ?? null,
    genres: (details?.genres || []).map((genre) => genre.name),
    voteAverage: item.vote_average || details?.vote_average || null,
    libraryState: libraryStateFrom(
      libraryItem?.library_id ?? null,
      libraryItem ? getSearchStatusLabel(libraryItem.status) : null,
      libraryItem?.personal_rating
    ),
  };
}
