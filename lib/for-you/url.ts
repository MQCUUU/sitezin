/*
 * V2.8 — filtros de "Para você" na URL (refresh, voltar e avançar mantêm o contexto).
 *
 * Mesmos nomes que a API já usa: type, genre, provider, min_rating, year, sort.
 * Os dois padrões ligados (Ocultar assistidos, Só fora da biblioteca) só vão
 * para a URL quando DESLIGADOS: hide_watched=0, only_new=0.
 * Valores inválidos são normalizados. Puro: testado em scripts/test-for-you.mjs.
 */
export const FOR_YOU_SORTS = ["recommended", "rating", "popular", "newest", "hidden"] as const;
export const FOR_YOU_MIN_RATINGS = ["6", "7", "8", "9"] as const;

export type ForYouSort = (typeof FOR_YOU_SORTS)[number];

export type ForYouQuery = {
  type: "all" | "movie" | "tv";
  genre: string;
  provider: string;
  minRating: string;
  year: string;
  sort: ForYouSort;
  hideWatched: boolean;
  onlyNew: boolean;
};

export const DEFAULT_FOR_YOU_QUERY: ForYouQuery = {
  type: "all",
  genre: "",
  provider: "",
  minRating: "",
  year: "",
  sort: "recommended",
  hideWatched: true,
  onlyNew: true,
};

type ParamsLike = { get(name: string): string | null };

export function parseForYouQuery(params: ParamsLike): ForYouQuery {
  const type = params.get("type");
  const sort = params.get("sort");
  const minRating = params.get("min_rating") || "";
  const year = params.get("year") || "";
  const provider = (params.get("provider") || "").trim();

  return {
    type: type === "movie" || type === "tv" ? type : "all",
    genre: (params.get("genre") || "").trim().slice(0, 40),
    provider: provider === "mine" || /^\d{1,7}$/.test(provider) ? provider : "",
    minRating: (FOR_YOU_MIN_RATINGS as readonly string[]).includes(minRating) ? minRating : "",
    year: /^(19|20)\d{2}$/.test(year) ? year : "",
    sort: (FOR_YOU_SORTS as readonly string[]).includes(sort || "") ? (sort as ForYouSort) : "recommended",
    hideWatched: params.get("hide_watched") !== "0",
    onlyNew: params.get("only_new") !== "0",
  };
}

/** Query canônica para a URL da página (ordem fixa, só o que difere do padrão). */
export function serializeForYouQuery(query: ForYouQuery): string {
  const p = new URLSearchParams();

  if (query.type !== "all") p.set("type", query.type);
  if (query.genre) p.set("genre", query.genre);
  if (query.provider) p.set("provider", query.provider);
  if (query.minRating) p.set("min_rating", query.minRating);
  if (query.year) p.set("year", query.year);
  if (query.sort !== "recommended") p.set("sort", query.sort);
  if (!query.hideWatched) p.set("hide_watched", "0");
  if (!query.onlyNew) p.set("only_new", "0");

  return p.toString();
}
