import type { ReactNode } from "react";

export type MediaPreviewMediaType = "movie" | "tv";

/**
 * Library membership + personal state for the title being previewed.
 * `statusLabel` is pre-computed by the caller (each of the four surfaces
 * derives it differently — Discover from a flat `library_status` string,
 * Search/For You/Collection from a joined `libraryItem.status`) so the core
 * never has to know a status-code → label mapping.
 */
export type MediaPreviewLibraryState = {
  libraryId: string | null;
  statusLabel?: string | null;
  personalRating?: number | null;
};

/**
 * Normalized shape the shared Quick Peek renders from. Built by an adapter
 * per surface (see adapters.ts) from whatever shape that surface's list/
 * details data actually has — the core never sees `DiscoverItem`,
 * `SearchItem`, or the untyped `any` used by For You/Collection today.
 *
 * Only fields the four audited previews actually display are included.
 * Full cast, seasons/episodes, reviews, etc. belong to the title page, not
 * the Quick Peek (see C2.1 spec §19).
 */
export type MediaPreviewData = {
  id: number;
  mediaType: MediaPreviewMediaType;
  title: string;
  originalTitle?: string | null;
  overview?: string | null;
  posterPath?: string | null;
  backdropPath?: string | null;
  /** Raw `release_date`/`first_air_date` string; the core derives the year. */
  releaseDate?: string | null;
  /** Minutes. Only Collection's preview shows this today; Discover/Search/For You don't. */
  runtime?: number | null;
  /** Resolved genre names — the core never resolves `genre_ids` itself. */
  genres?: string[];
  voteAverage?: number | null;
  libraryState?: MediaPreviewLibraryState | null;
};

/**
 * Add-to-library and rating are the only two actions all four surfaces
 * share in some form; remove-from-library is not
 * exposed from inside any of the four audited preview modals today, so
 * they're intentionally left out here rather than invented (C2.1 spec §11).
 *
 * `disabled` is a single flat boolean by design: Discover/Search already
 * pass a flat `isProcessing` boolean, while For You/Collection derive one
 * locally from a page-wide `processing: string | null` key
 * (`processing === \`${mediaType}-${id}\``) before reaching the modal. The
 * core only ever consumes the already-derived boolean — it never
 * interprets a string key itself (C2.1 spec §12).
 */
export type MediaPreviewActionsConfig = {
  onAdd?: (data: MediaPreviewData) => void;
  addLabel?: string;
  onRating?: (data: MediaPreviewData, rating: number | null) => void;
  disabled?: boolean;
};

export type MediaPreviewProvidersSlot = ReactNode;
