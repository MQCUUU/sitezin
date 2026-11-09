export type CollectionMovie = {
  id: number;
  media_type:
    "movie";
  title?: string;
  original_title?: string;
  poster_path?:
    | string
    | null;
  backdrop_path?:
    | string
    | null;
  release_date?: string;
  vote_average?: number;
  vote_count?: number;
  overview?: string;
  runtime?: number;
  genres?: any[];
  popularity?: number;
  status?: string;
  [key: string]: any;
};

export type LibraryItem = {
  library_id: string;
  tmdb_id: number;
  media_type:
    "movie";
  favorite: boolean;
  status:
    string |
    null;
  personal_rating:
    number |
    null;
};

export async function safeJson(
  response:
    Response
) {
  const type =
    response.headers.get(
      "content-type"
    ) ||
    "";

  if (
    !type.includes(
      "application/json"
    )
  ) {
    const text =
      await response.text();

    throw new Error(
      `A rota ${response.url} não retornou JSON (${response.status}). ${
        text.startsWith(
          "<!DOCTYPE"
        )
          ? "Provavelmente retornou uma página HTML/404."
          : ""
      }`
    );
  }

  return response.json();
}

export function formatRuntime(
  minutes:
    number
) {
  if (
    !minutes ||
    minutes <=
      0
  ) {
    return "—";
  }

  const hours =
    Math.floor(
      minutes /
      60
    );

  const rest =
    minutes %
    60;

  if (
    hours ===
    0
  ) {
    return `${rest}min`;
  }

  return `${hours}h ${rest}min`;
}
