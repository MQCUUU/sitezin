import { NextResponse, type NextRequest } from "next/server";
import { naoAutenticado, respostaDeErro } from "@/lib/api-error";
import { sessionUnavailableResponse } from "@/lib/auth/route-session";
import { getDb } from "@/lib/db/neon";
import { candidates, findMediaId } from "@/lib/recommendations/db";
import { PRIVATE, viewerOf } from "@/lib/reviews/route-helpers";

/* GET ?tmdb_id=&type= — seus amigos, marcando quem já viu e a quem você já indicou o título. */
export async function GET(request: NextRequest) {
  try {
    const viewer = await viewerOf();
    if (viewer.unavailable) return sessionUnavailableResponse();
    if (!viewer.id) return naoAutenticado();

    const params = request.nextUrl.searchParams;
    const tmdbId = Number(params.get("tmdb_id"));
    const type = params.get("type");
    const sql = getDb();
    const mediaId =
      Number.isInteger(tmdbId) && tmdbId > 0 && (type === "movie" || type === "tv") ? await findMediaId(sql, type, tmdbId) : null;
    return NextResponse.json({ friends: await candidates(sql, viewer.id, mediaId) }, { headers: PRIVATE });
  } catch (error) {
    return respostaDeErro(error, "GET /api/recommendations/candidates");
  }
}
