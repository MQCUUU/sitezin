export const STATUS_OPTIONS = [
  ["want", "Quero assistir"],
  ["watching", "Assistindo"],
  ["watched", "Assistido"],
  ["paused", "Pausado"],
  ["dropped", "Abandonado"],
] as const;

export const COUNTRIES = [
  ["", "Qualquer país"],
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

export const DECADES = [
  ["", "Qualquer época"],
  ["2020", "2020–2029"],
  ["2010", "2010–2019"],
  ["2000", "2000–2009"],
  ["1990", "1990–1999"],
  ["1980", "1980–1989"],
  ["1970", "1970–1979"],
  ["1960", "1960–1969"],
  ["1950", "1950–1959"],
  ["1940", "1940–1949"],
  ["1930", "1930–1939"],
  ["1920", "1920–1929"],
  ["1910", "1910–1919"],
  ["1900", "1900–1909"],
] as const;

export type MediaType =
  | "movie"
  | "tv";

export type PickMode =
  | "safe"
  | "popular"
  | "discover"
  | "gems";

export type PickResult = {
  id: number;
  media_type:
    MediaType;
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  overview?: string;
  release_date?: string;
  first_air_date?: string;
  vote_average?: number;
  vote_count?: number;
  runtime?: number;
  episode_run_time?: number[];
  genres?: {
    id: number;
    name: string;
  }[];
  watch_providers?: any;
  in_library?: boolean;
  library_id?: string | null;
  library_status?: string | null;
  favorite?: boolean;
  personal_rating?: number | null;
  [key: string]: any;
};

export type FilterMeta = {
  genres: {
    key: string;
    name: string;
    movie_id?: number;
    tv_id?: number;
    special?: "teen";
  }[];
  providers: {
    provider_id: number;
    provider_name: string;
    logo_path?: string | null;
  }[];
};

export function titleOf(
  item:
    PickResult |
    null
) {
  return (
    item?.title ||
    item?.name ||
    "Sem título"
  );
}

export function statusLabel(
  status?:
    string |
    null
) {
  return (
    STATUS_OPTIONS.find(
      ([value]) =>
        value ===
        status
    )?.[1] ||
    "Na biblioteca"
  );
}

export function runtimeOf(
  item:
    PickResult |
    null
) {
  if (!item) {
    return null;
  }

  if (
    item.media_type ===
    "movie"
  ) {
    return Number(
      item.runtime ||
        0
    ) ||
      null;
  }

  const values =
    Array.isArray(
      item.episode_run_time
    )
      ? item.episode_run_time
          .map(
            Number
          )
          .filter(
            (
              value
            ) =>
              value >
              0
          )
      : [];

  return (
    values[
      0
    ] ||
    null
  );
}

export function formatRuntime(
  minutes:
    number |
    null,
  isTv:
    boolean
) {
  if (
    !minutes
  ) {
    return "";
  }

  if (
    isTv
  ) {
    return `~${minutes} min/ep.`;
  }

  const hours =
    Math.floor(
      minutes /
      60
    );

  const rest =
    minutes %
    60;

  if (!hours) {
    return `${rest} min`;
  }

  return `${hours}h ${rest}min`;
}

export function normalizeGenreName(
  value:
    string
) {
  return value
    .normalize("NFD")
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .toLowerCase()
    .replace(
      /&/g,
      " e "
    )
    .replace(
      /[^a-z0-9]+/g,
      " "
    )
    .trim();
}

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
    throw new Error(
      `A rota não retornou JSON (${response.status}).`
    );
  }

  return response.json();
}
