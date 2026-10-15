import type { getDb } from "@/lib/db/neon";
import { lightweightDetailsTMDB } from "@/lib/tmdb";

/*
 * Garante que um título do TMDB exista no catálogo compartilhado (public.media)
 * SEM tocar na Biblioteca do usuário. Dados vêm do TMDB pelo servidor (nunca do
 * cliente). Já existindo, reaproveita a linha (identidade = tmdb_id + tipo).
 */
export async function ensureMedia(sql: ReturnType<typeof getDb>, type: "movie" | "tv", tmdbId: number): Promise<number | null> {
  const existing = (await sql`SELECT id FROM public.media WHERE tmdb_id = ${tmdbId} AND media_type = ${type} LIMIT 1`) as { id: number }[];

  if (existing[0]) return Number(existing[0].id);

  const details = (await lightweightDetailsTMDB(type, tmdbId).catch(() => null)) as Record<string, any> | null;

  if (!details?.id) return null;

  const genres = Array.isArray(details.genres) ? details.genres.map((g: { name?: string }) => g?.name).filter(Boolean) : [];
  const rows = (await sql`
    INSERT INTO public.media (
      tmdb_id, media_type, title, original_title, overview, poster_path, backdrop_path,
      release_date, first_air_date, genres, tmdb_rating, tmdb_vote_count, runtime,
      seasons_count, episodes_count, raw, updated_at
    )
    VALUES (
      ${tmdbId}, ${type}, ${details.title ?? details.name ?? "Sem título"},
      ${details.original_title ?? details.original_name ?? null}, ${details.overview || null},
      ${details.poster_path ?? null}, ${details.backdrop_path ?? null},
      ${details.release_date || null}, ${details.first_air_date || null}, ${genres},
      ${details.vote_average ?? null}, ${details.vote_count ?? null}, ${details.runtime ?? null},
      ${details.number_of_seasons ?? null}, ${details.number_of_episodes ?? null}, ${JSON.stringify(details)}::jsonb, now()
    )
    ON CONFLICT (tmdb_id, media_type) DO UPDATE SET updated_at = public.media.updated_at
    RETURNING id
  `) as { id: number }[];

  return rows[0] ? Number(rows[0].id) : null;
}
