import { NextRequest, NextResponse } from "next/server";
import { entradaInvalida, respostaDeErro } from "@/lib/api-error";
import { auth } from "@/lib/auth/server";
import { getDb } from "@/lib/db/neon";
import { limitPublicRequest } from "@/lib/rate-limit";
import { listCommunityReviews } from "@/lib/reviews/community";

/*
 * GET /api/reviews/community?type=movie|tv&tmdb_id=&offset=&limit=
 *
 * Avaliações (nota + resenha) de outras pessoas para um título, respeitando a
 * privacidade de cada perfil (lib/reviews/community.ts). Visitante vê as de perfis
 * públicos; com sessão, também as de quem ele segue — e essas vêm primeiro.
 * Resposta pessoal (depende de quem pede): nunca em cache compartilhado.
 */
export async function GET(request: NextRequest) {
  const limited = limitPublicRequest(request, "communityReviews");
  if (limited) return limited;

  try {
    const params = request.nextUrl.searchParams;
    const type = params.get("type");
    const tmdbId = Number(params.get("tmdb_id"));

    if (type !== "movie" && type !== "tv") return entradaInvalida("Tipo inválido.");
    if (!Number.isInteger(tmdbId) || tmdbId <= 0) return entradaInvalida("Título inválido.");

    const session = await auth.getSession().catch(() => null);
    const viewerId = session?.data?.user?.id ?? null;

    const data = await listCommunityReviews(getDb(), {
      mediaType: type,
      tmdbId,
      viewerId,
      limit: Number(params.get("limit") || 10),
      offset: Number(params.get("offset") || 0),
    });

    return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return respostaDeErro(error, "GET /api/reviews/community");
  }
}
