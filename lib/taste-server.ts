import { getDb } from "@/lib/db/neon";
import { buildTasteProfile, tasteKey, type TasteProfile, type TasteRow } from "@/lib/taste-profile";

/*
 * V2.3 — leitura do gosto do usuário (só servidor). Uma query para a
 * biblioteca (colunas mínimas), uma para ocultos, uma para serviços —
 * independentes da quantidade de títulos exibidos (sem N+1).
 */

export type UserTaste = {
  profile: TasteProfile;
  rows: TasteRow[];
  hidden: Set<string>;
  services: { provider_id: number; provider_name: string }[];
};

const TMDB_BASE = "https://api.themoviedb.org/3";

export async function loadUserTaste(
  userId: string,
  options: { strictServices?: boolean } = {}
): Promise<UserTaste> {
  const sql = getDb();

  const [library, hiddenRows, serviceRows] = await Promise.all([
    sql`
      SELECT m.tmdb_id, m.media_type, m.title, m.genres,
             li.status, li.favorite, li.personal_rating
      FROM public.library_items li
      JOIN public.media m ON m.id = li.media_id
      WHERE li.user_id = ${userId}
    `,
    sql`
      SELECT tmdb_id, media_type
      FROM public.user_hidden_titles
      WHERE user_id = ${userId}
    `.catch(() => [] as Record<string, unknown>[]),
    // Serviços são só um sinal a mais aqui (a funcionalidade principal não
    // depende deles): se a tabela faltar, segue sem o sinal.
    options.strictServices
      ? sql`
          SELECT provider_id, provider_name
          FROM public.user_streaming_services
          WHERE user_id = ${userId}
        `
      : sql`
          SELECT provider_id, provider_name
          FROM public.user_streaming_services
          WHERE user_id = ${userId}
        `.catch((error: unknown) => {
          console.error("[taste] serviços indisponíveis:", error);
          return [] as Record<string, unknown>[];
        }),
  ]);

  const rows: TasteRow[] = (library as Record<string, any>[]).map((row) => ({
    tmdb_id: Number(row.tmdb_id),
    media_type: row.media_type === "tv" ? "tv" : "movie",
    title: String(row.title ?? ""),
    status: String(row.status ?? ""),
    favorite: Boolean(row.favorite),
    personal_rating: row.personal_rating === null || row.personal_rating === undefined ? null : Number(row.personal_rating),
    genres: Array.isArray(row.genres) ? row.genres.map(String) : [],
  }));

  return {
    profile: buildTasteProfile(rows),
    rows,
    hidden: new Set(
      (hiddenRows as Record<string, any>[]).map((row) => tasteKey(String(row.media_type), Number(row.tmdb_id)))
    ),
    services: (serviceRows as Record<string, any>[]).map((row) => ({
      provider_id: Number(row.provider_id),
      provider_name: String(row.provider_name),
    })),
  };
}

export type TmdbOptions = { apiKey: string; language: string };

export async function tmdbGet(path: string, options: TmdbOptions, params: Record<string, string> = {}, revalidate = 21600) {
  const search = new URLSearchParams({ api_key: options.apiKey, language: options.language, ...params });

  const response = await fetch(`${TMDB_BASE}${path}?${search.toString()}`, {
    signal: AbortSignal.timeout(8000),
    next: { revalidate },
  }).catch(() => null);

  return response?.ok ? response.json().catch(() => null) : null;
}

let genreCache: { at: number; map: Map<number, string> } | null = null;

/** id → nome do gênero (filmes ∪ séries), em cache de 24 h no processo. */
export async function genreNameMap(options: TmdbOptions): Promise<Map<number, string>> {
  if (genreCache && Date.now() - genreCache.at < 24 * 3600_000) return genreCache.map;

  const [movie, tv] = await Promise.all([
    tmdbGet("/genre/movie/list", options, {}, 86400),
    tmdbGet("/genre/tv/list", options, {}, 86400),
  ]);

  const map = new Map<number, string>();

  for (const list of [movie, tv]) {
    for (const genre of list?.genres ?? []) map.set(Number(genre.id), String(genre.name));
  }

  if (map.size > 0) genreCache = { at: Date.now(), map };

  return map;
}

export type SeedCandidate = {
  item: Record<string, any>;
  media_type: "movie" | "tv";
  genres: string[];
  because: string[];
};

/**
 * Recomendações do TMDB para os títulos que o usuário mais curtiu
 * (≤ 6 requisições em paralelo, em cache). Um candidato recomendado por
 * vários títulos curtidos acumula `because`. Já remove o que está na
 * biblioteca/ocultos.
 */
export async function seedRecommendations(
  taste: UserTaste,
  options: TmdbOptions,
  types: ("movie" | "tv")[]
): Promise<Map<string, SeedCandidate>> {
  const genres = await genreNameMap(options);
  const result = new Map<string, SeedCandidate>();

  const responses = await Promise.all(
    taste.profile.seeds.map(async (seed) => ({
      seed,
      data: await tmdbGet(`/${seed.media_type}/${seed.tmdb_id}/recommendations`, options, { page: "1" }),
    }))
  );

  for (const { seed, data } of responses) {
    for (const item of (data?.results ?? []) as Record<string, any>[]) {
      const mediaType: "movie" | "tv" = item.media_type === "tv" || (!item.title && item.name) ? "tv" : item.media_type === "movie" ? "movie" : seed.media_type;
      const key = tasteKey(mediaType, item.id);

      if (!types.includes(mediaType) || !item.poster_path) continue;
      if (taste.profile.owned.has(key) || taste.hidden.has(key)) continue;
      if (Number(item.vote_average || 0) < 6.2 && Number(item.vote_count || 0) > 50) continue;

      const entry = result.get(key) ?? {
        item,
        media_type: mediaType,
        genres: (item.genre_ids ?? []).map((id: number) => genres.get(Number(id))).filter(Boolean) as string[],
        because: [],
      };

      if (!entry.because.includes(seed.title)) entry.because.push(seed.title);
      result.set(key, entry);
    }
  }

  return result;
}
