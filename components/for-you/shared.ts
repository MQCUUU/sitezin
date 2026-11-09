/*
 * Cache do Para você (sessionStorage). `v3`: a v2 não tinha a lista de amigos
 * avaliadores necessária para o indicador social compacto.
 * A v1 foi gravada por versões
 * anteriores; qualquer entrada v1 é ignorada e removida (AccountMenu limpa
 * tudo que começa com `mycatalog:foryou:` fora do prefixo atual).
 */
export const FOR_YOU_CACHE_PREFIX = "mycatalog:foryou:v3:";

/*
 * Nunca reaproveita um cache cujo formato não seja exatamente o que a tela
 * consome: prateleiras com `results` de objetos que têm id e tipo de mídia.
 * Campos de imagem ausentes/nulos são OK (o Poster usa o placeholder).
 */
export function isValidForYouPayload(data: any): boolean {
  return (
    !!data &&
    Array.isArray(data.shelves) &&
    data.shelves.every(
      (shelf: any) =>
        shelf &&
        typeof shelf.id === "string" &&
        Array.isArray(shelf.results) &&
        shelf.results.every(
          (item: any) =>
            item &&
            (typeof item.id === "number" || typeof item.id === "string") &&
            (item.media_type === "movie" || item.media_type === "tv") &&
            (item.poster_path === undefined || item.poster_path === null || typeof item.poster_path === "string")
        )
    )
  );
}

export type Shelf = {
  id: string;
  kind?: string;
  title: string;
  subtitle?: string;
  icon:
    | "sparkles"
    | "star"
    | "film"
    | "tv"
    | "gem"
    | "trending"
    | "calendar"
    | "users";
  results: any[];
};

export type FilterData = {
  genres:
    string[];
  providers:
    {
      id: string;
      name: string;
    }[];
};

export type LibraryItem = {
  library_id: string;
  tmdb_id: number;
  media_type:
    | "movie"
    | "tv";
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
          ? "Provavelmente retornou HTML/404."
          : ""
      }`
    );
  }

  return response.json();
}
