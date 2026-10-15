/*
 * V2.8 — gêneros canônicos para "Para você".
 *
 * O TMDB usa listas diferentes para filme e série ("Ficção científica" e
 * "Fantasia" no filme viram "Sci-Fi & Fantasy" na série; "Ação"/"Aventura"
 * viram "Action & Adventure"). Sem uma chave comum, quem ama ficção científica
 * em filme não recebia afinidade em séries do mesmo gênero. Aqui cada id/nome
 * do TMDB (pt-BR, como gravado em media.genres) vira uma ou mais chaves canônicas.
 */
export type GenreKey =
  | "action" | "adventure" | "animation" | "comedy" | "crime" | "documentary" | "drama"
  | "family" | "fantasy" | "history" | "horror" | "music" | "mystery" | "romance"
  | "scifi" | "tvmovie" | "thriller" | "war" | "western" | "kids" | "news" | "reality"
  | "soap" | "talk" | "politics";

export const GENRE_LABEL: Record<GenreKey, string> = {
  action: "Ação",
  adventure: "Aventura",
  animation: "Animação",
  comedy: "Comédia",
  crime: "Crime",
  documentary: "Documentário",
  drama: "Drama",
  family: "Família",
  fantasy: "Fantasia",
  history: "História",
  horror: "Terror",
  music: "Música",
  mystery: "Mistério",
  romance: "Romance",
  scifi: "Ficção científica",
  tvmovie: "Cinema TV",
  thriller: "Thriller",
  war: "Guerra",
  western: "Faroeste",
  kids: "Infantil",
  news: "Notícias",
  reality: "Reality",
  soap: "Novela",
  talk: "Talk show",
  politics: "Política",
};

/* id do TMDB → chaves canônicas, por tipo de mídia */
const MOVIE_IDS: Record<number, GenreKey[]> = {
  28: ["action"], 12: ["adventure"], 16: ["animation"], 35: ["comedy"], 80: ["crime"],
  99: ["documentary"], 18: ["drama"], 10751: ["family"], 14: ["fantasy"], 36: ["history"],
  27: ["horror"], 10402: ["music"], 9648: ["mystery"], 10749: ["romance"], 878: ["scifi"],
  10770: ["tvmovie"], 53: ["thriller"], 10752: ["war"], 37: ["western"],
};

const TV_IDS: Record<number, GenreKey[]> = {
  10759: ["action", "adventure"], 16: ["animation"], 35: ["comedy"], 80: ["crime"],
  99: ["documentary"], 18: ["drama"], 10751: ["family"], 10762: ["kids"], 9648: ["mystery"],
  10763: ["news"], 10764: ["reality"], 10765: ["scifi", "fantasy"], 10766: ["soap"],
  10767: ["talk"], 10768: ["war", "politics"], 37: ["western"],
};

/* nomes como gravados em media.genres (pt-BR do TMDB) e apelidos comuns */
const NAME_KEYS: Record<string, GenreKey[]> = {
  "acao": ["action"], "aventura": ["adventure"], "animacao": ["animation"], "comedia": ["comedy"],
  "crime": ["crime"], "documentario": ["documentary"], "drama": ["drama"], "familia": ["family"],
  "fantasia": ["fantasy"], "historia": ["history"], "terror": ["horror"], "musica": ["music"],
  "misterio": ["mystery"], "romance": ["romance"], "ficcao cientifica": ["scifi"],
  "cinema tv": ["tvmovie"], "thriller": ["thriller"], "guerra": ["war"], "faroeste": ["western"],
  "action & adventure": ["action", "adventure"], "sci-fi & fantasy": ["scifi", "fantasy"],
  "war & politics": ["war", "politics"], "kids": ["kids"], "infantil": ["kids"], "news": ["news"],
  "noticias": ["news"], "reality": ["reality"], "soap": ["soap"], "novela": ["soap"],
  "talk": ["talk"], "talk show": ["talk"], "politica": ["politics"],
};

const fold = (value: string) =>
  value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

export function keysFromIds(mediaType: "movie" | "tv", ids: unknown): GenreKey[] {
  const table = mediaType === "tv" ? TV_IDS : MOVIE_IDS;
  const out = new Set<GenreKey>();

  for (const id of Array.isArray(ids) ? ids : []) for (const key of table[Number(id)] ?? []) out.add(key);

  return [...out];
}

export function keysFromNames(names: unknown): GenreKey[] {
  const out = new Set<GenreKey>();

  for (const raw of Array.isArray(names) ? names : []) {
    const name = typeof raw === "string" ? raw : (raw as { name?: string })?.name;

    for (const key of name ? NAME_KEYS[fold(name)] ?? [] : []) out.add(key);
  }

  return [...out];
}

/* Filtro "Gênero": aceita a chave, o rótulo canônico ou o nome antigo do TMDB. */
export function genreKeyFromParam(value: string): GenreKey | null {
  const v = fold(value);

  if (!v) return null;
  if ((GENRE_LABEL as Record<string, string>)[v]) return v as GenreKey;

  for (const [key, label] of Object.entries(GENRE_LABEL)) if (fold(label) === v) return key as GenreKey;

  return NAME_KEYS[v]?.[0] ?? null;
}

/* ids do TMDB que representam a chave em cada tipo (para with_genres) */
export function idsForKey(mediaType: "movie" | "tv", key: GenreKey): number[] {
  const table = mediaType === "tv" ? TV_IDS : MOVIE_IDS;

  return Object.entries(table)
    .filter(([, keys]) => keys.includes(key))
    .map(([id]) => Number(id));
}

/* Opções do filtro: rótulos canônicos que existem em filmes ou séries, em ordem alfabética. */
export function genreFilterLabels(): string[] {
  return (Object.keys(GENRE_LABEL) as GenreKey[])
    .filter((key) => idsForKey("movie", key).length || idsForKey("tv", key).length)
    .map((key) => GENRE_LABEL[key])
    .sort((a, b) => a.localeCompare(b, "pt-BR"));
}
