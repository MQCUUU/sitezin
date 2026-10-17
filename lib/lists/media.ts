import type { getDb } from "@/lib/db/neon";
import { lightweightDetailsTMDB } from "@/lib/tmdb";

/*
 * Garante que um título do TMDB exista no catálogo compartilhado (public.media)
 * SEM tocar na Biblioteca do usuário. Dados vêm do TMDB pelo servidor (nunca do
 * cliente). Já existindo, reaproveita a linha (identidade = tmdb_id + tipo) e
 * não chama o TMDB nem altera nada nela.
 *
 * V3.3: fonte única para TODA rota de usuário que precise de um `media`
 * (Listas, adicionar à Biblioteca, restaurar backup). O cliente nunca é
 * autoridade de título/sinopse/pôster/datas/gêneros: era assim que o
 * POST /api/library sobrescrevia o catálogo de todos com o que o navegador
 * mandasse.
 */

export type CatalogMediaResult =
  | { ok: true; id: number; created: boolean }
  | { ok: false; reason: "not_found" | "unavailable" };

export async function resolveCatalogMedia(
  sql: ReturnType<typeof getDb>,
  type: "movie" | "tv",
  tmdbId: number
): Promise<CatalogMediaResult> {
  const existing = (await sql`SELECT id FROM public.media WHERE tmdb_id = ${tmdbId} AND media_type = ${type} LIMIT 1`) as { id: number }[];
  if (existing[0]) return { ok: true, id: Number(existing[0].id), created: false };

  let details: Record<string, any> | null = null;

  try {
    details = (await lightweightDetailsTMDB(type, tmdbId)) as Record<string, any> | null;
  } catch (error) {
    // 404 = a obra não existe no TMDB (nada é criado); o resto é falha temporária.
    return { ok: false, reason: /^TMDB 404\b/.test(String((error as Error)?.message)) ? "not_found" : "unavailable" };
  }

  if (!details?.id || Number(details.id) !== tmdbId) return { ok: false, reason: "not_found" };

  const genres = Array.isArray(details.genres) ? details.genres.map((g: { name?: string }) => g?.name).filter(Boolean) : [];
  // Duas contas criando o mesmo título ao mesmo tempo: uma linha só (UNIQUE tmdb_id+tipo);
  // a segunda reaproveita a da primeira sem alterá-la.
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
    RETURNING id, (xmax = 0) AS created
  `) as { id: number; created: boolean }[];

  return rows[0] ? { ok: true, id: Number(rows[0].id), created: Boolean(rows[0].created) } : { ok: false, reason: "unavailable" };
}

export async function ensureMedia(sql: ReturnType<typeof getDb>, type: "movie" | "tv", tmdbId: number): Promise<number | null> {
  const result = await resolveCatalogMedia(sql, type, tmdbId);

  return result.ok ? result.id : null;
}
