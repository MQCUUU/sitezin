export type Person = {
  id: number;
  name: string;
  profile_path:
    | string
    | null;
  known_for_department?:
    string;
  biography?:
    string;
  birthday?:
    string |
    null;
  deathday?:
    string |
    null;
  place_of_birth?:
    string |
    null;
  also_known_as?:
    string[];
  homepage?:
    string |
    null;
  popularity?:
    number;
};

export type Credit = {
  id: number;
  media_type:
    | "movie"
    | "tv";
  title?: string;
  name?: string;
  poster_path?:
    | string
    | null;
  backdrop_path?:
    | string
    | null;
  release_date?: string;
  first_air_date?: string;
  vote_average?: number;
  vote_count?: number;
  popularity?: number;
  character?: string;
  job?: string;
  department?: string;
  roles?: string[];
  [key: string]: any;
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
    throw new Error(
      `A rota não retornou JSON (${response.status}).`
    );
  }

  return response.json();
}

export function formatDate(
  value?:
    string |
    null
) {
  if (!value) {
    return "";
  }

  const [
    year,
    month,
    day,
  ] =
    value.split("-");

  if (
    !year ||
    !month ||
    !day
  ) {
    return value;
  }

  return `${day}/${month}/${year}`;
}

export function getYear(
  item:
    Credit
) {
  return (
    item.release_date ||
    item.first_air_date ||
    ""
  ).slice(
    0,
    4
  );
}

export function getTitle(
  item:
    Credit
) {
  return (
    item.title ||
    item.name ||
    "Sem título"
  );
}
