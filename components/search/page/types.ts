export type SearchItem = {
  id: number;
  media_type: "movie" | "tv";
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  release_date?: string;
  first_air_date?: string;
  vote_average?: number;
  vote_count?: number;
  overview?: string;
  genre_ids?: number[];
  genres?: any[];
  popularity?: number;
  reason?: string;
  [key: string]: any;
};

export type LibraryState = {
  library_id: string;
  tmdb_id: number;
  media_type: "movie" | "tv";
  favorite: boolean;
  status: string | null;
  personal_rating: number | null;
};

export type AdvancedMeta = {
  used: boolean;
  mode: "person" | "director" | "collection" | "filters" | "character" | "";
  title: string;
  subtitle: string;
  person?: any;
  collection?: any;
};

export type UserSearchResult = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
};

export const STATUS_OPTIONS = [
  ["want", "Quero assistir"],
  ["watching", "Assistindo"],
  ["watched", "Assistido"],
  ["paused", "Pausado"],
  ["dropped", "Abandonado"],
  ["rewatching", "Reassistindo"],
  ["rewatched", "Reassistido"],
] as const;

export function getStatusLabel(status?: string | null) {
  return STATUS_OPTIONS.find(([value]) => value === status)?.[1] || "Na biblioteca";
}

export function getTitle(item: SearchItem) {
  return item.title || item.name || "Sem título";
}
