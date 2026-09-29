import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { getDb } from "@/lib/db/neon";
import { naoAutenticado, respostaDeErro } from "@/lib/api-error";
import {
  computeTvProgress,
  estimateEpisodeRuntime,
  tvStructureFromRaw,
} from "@/lib/tv-progress";

/*
 * V2.1-E — GET /api/tv-progress?tmdb_id=<id>
 *
 * Progresso real (episodes_progress.watched) e próximo episódio de UMA
 * série da biblioteca do usuário logado. Privado (`no-store`), sempre
 * escopado ao usuário da sessão. Uma query (série + episódios assistidos).
 */

const PRIVATE = { "Cache-Control": "private, no-store" };

export async function GET(req: NextRequest) {
  try {
    const session = await auth.getSession().catch(() => null);
    const userId = session?.data?.user?.id;

    if (!userId) return naoAutenticado();

    const tmdbId = Number(req.nextUrl.searchParams.get("tmdb_id"));

    if (!Number.isInteger(tmdbId) || tmdbId <= 0) {
      return NextResponse.json({ error: "tmdb_id inválido." }, { status: 400, headers: PRIVATE });
    }

    const sql = getDb();

    const rows = (await sql`
      SELECT m.id AS media_id, m.raw, m.seasons_count, m.episodes_count, li.status,
             COALESCE(
               (SELECT json_agg(json_build_object(
                         'season_number', ep.season_number,
                         'episode_number', ep.episode_number))
                  FROM public.episodes_progress ep
                 WHERE ep.user_id = ${userId}
                   AND ep.media_id = m.id
                   AND ep.watched = true),
               '[]'::json
             ) AS watched
      FROM public.library_items li
      JOIN public.media m ON m.id = li.media_id
      WHERE li.user_id = ${userId}
        AND m.tmdb_id = ${tmdbId}
        AND m.media_type = 'tv'
      LIMIT 1
    `) as { media_id: number; raw: Record<string, unknown> | null; seasons_count: number | null; episodes_count: number | null; status: string; watched: { season_number: number; episode_number: number }[] }[];

    if (rows.length === 0) {
      return NextResponse.json({ progress: null }, { headers: PRIVATE });
    }

    const progress = computeTvProgress(
      tvStructureFromRaw(rows[0].raw, {
        seasons_count: rows[0].seasons_count,
        episodes_count: rows[0].episodes_count,
      }),
      rows[0].watched,
      { rewatching: rows[0].status === "rewatching" }
    );

    return NextResponse.json(
      { progress, episode_runtime_estimate: estimateEpisodeRuntime(rows[0].raw) },
      { headers: PRIVATE }
    );
  } catch (error) {
    return respostaDeErro(error, "GET /api/tv-progress");
  }
}
