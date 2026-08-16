export type MediaType =
  | "movie"
  | "tv";

export type Status =
  | "want"
  | "watching"
  | "watched"
  | "dropped"
  | "rewatching"
  | "rewatched";

export type Media = {
  id: string;
  tmdb_id: number;
  media_type: MediaType;
  title: string;
  original_title?: string;
  overview?: string;
  poster_path?: string;
  backdrop_path?: string;
  release_date?: string;
  first_air_date?: string;
  genres?: {
    id: number;
    name: string;
  }[];
  tmdb_rating?: number;
  tmdb_vote_count?: number;
  runtime?: number;
  seasons_count?: number;
  episodes_count?: number;
  creator_names?: string[];
  cast_names?: string[];
};

export type LibraryItem = Media & {
  library_id: string;
  status: Status;
  favorite: boolean;
  personal_rating: number | null;
  review: string | null;
  watched_at: string | null;
  rewatch_count: number;
  added_at: string;
  updated_at: string;
};

export const STATUS_LABELS: Record<
  Status,
  string
> = {
  want: "Quero assistir",
  watching: "Assistindo",
  watched: "Assistido",
  dropped: "Abandonei",
  rewatching: "Reassistindo",
  rewatched: "Reassistido",
};