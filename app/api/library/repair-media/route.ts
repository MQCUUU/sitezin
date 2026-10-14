import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { getDb } from "@/lib/db/neon";
import { naoAutenticado, respostaDeErro } from "@/lib/api-error";

/*
 * V2.3 — POST /api/library/repair-media
 *
 * Alguns títulos entraram na biblioteca por import (Letterboxd/backup) só
 * com o nome, sem pôster, gêneros nem sinopse — o card aparecia sem imagem
 * (ex.: Interestelar, Clube da Luta) e o gosto do usuário perdia sinal de
 * gênero. Esta rota completa, a partir do TMDB, os títulos DA BIBLIOTECA do
 * usuário que estão incompletos (≤ 25 por chamada, em paralelo).
 * Privado, escopado à sessão; só preenche dados públicos do TMDB.
 */

const TMDB_BASE = "https://api.themoviedb.org/3";
const BATCH = 25;

export async function POST() {
  try {
    const session = await auth.getSession().catch(() => null);
    const userId = session?.data?.user?.id;

    if (!userId) return naoAutenticado();

    const apiKey = process.env.TMDB_API_KEY;

    if (!apiKey) return NextResponse.json({ repaired: 0, remaining: 0 });

    const sql = getDb();

    const incomplete = (await sql`
      SELECT m.id, m.tmdb_id, m.media_type
      FROM public.library_items li
      JOIN public.media m ON m.id = li.media_id
      WHERE li.user_id = ${userId}
        AND m.tmdb_id IS NOT NULL
        AND (m.poster_path IS NULL OR m.overview IS NULL OR m.genres IS NULL OR m.genres = '{}')
      ORDER BY m.updated_at ASC
      LIMIT ${BATCH + 1}
    `) as { id: number; tmdb_id: number; media_type: "movie" | "tv" }[];

    const batch = incomplete.slice(0, BATCH);
    const language = process.env.TMDB_LANGUAGE || "pt-BR";

    const results = await Promise.all(
      batch.map(async (row) => {
        const response = await fetch(
          `${TMDB_BASE}/${row.media_type}/${row.tmdb_id}?api_key=${encodeURIComponent(apiKey)}&language=${encodeURIComponent(language)}`,
          { signal: AbortSignal.timeout(8000), cache: "no-store" }
        ).catch(() => null);

        if (!response?.ok) return false;

        const d = await response.json().catch(() => null);

        if (!d?.id) return false;

        const isTv = row.media_type === "tv";
        const genres = Array.isArray(d.genres) ? d.genres.map((g: { name: string }) => String(g.name)) : [];

        await sql`
          UPDATE public.media SET
            title = COALESCE(${d.title || d.name || null}, title),
            original_title = COALESCE(${d.original_title || d.original_name || null}, original_title),
            overview = COALESCE(NULLIF(${d.overview || ""}, ''), overview),
            poster_path = COALESCE(${d.poster_path || null}, poster_path),
            backdrop_path = COALESCE(${d.backdrop_path || null}, backdrop_path),
            release_date = COALESCE(${isTv ? null : d.release_date || null}::date, release_date),
            first_air_date = COALESCE(${isTv ? d.first_air_date || null : null}::date, first_air_date),
            genres = CASE WHEN cardinality(${genres}::text[]) > 0 THEN ${genres}::text[] ELSE genres END,
            popularity = COALESCE(${d.popularity ?? null}, popularity),
            tmdb_rating = COALESCE(${d.vote_average ?? null}, tmdb_rating),
            tmdb_vote_count = COALESCE(${d.vote_count ?? null}, tmdb_vote_count),
            runtime = COALESCE(${isTv ? null : d.runtime ?? null}, runtime),
            seasons_count = COALESCE(${isTv ? d.number_of_seasons ?? null : null}, seasons_count),
            episodes_count = COALESCE(${isTv ? d.number_of_episodes ?? null : null}, episodes_count),
            updated_at = now()
          WHERE id = ${row.id}
        `;

        return true;
      })
    );

    const repaired = results.filter(Boolean).length;

    return NextResponse.json(
      { repaired, remaining: Math.max(0, incomplete.length - BATCH) },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    return respostaDeErro(error, "POST /api/library/repair-media");
  }
}
