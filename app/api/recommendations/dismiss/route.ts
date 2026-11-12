import { NextResponse, type NextRequest } from "next/server";
import { entradaInvalida, naoAutenticado, respostaDeErro } from "@/lib/api-error";
import { sessionUnavailableResponse } from "@/lib/auth/route-session";
import { getDb } from "@/lib/db/neon";
import { dismiss } from "@/lib/recommendations/db";
import { viewerOf } from "@/lib/reviews/route-helpers";

/* POST { media_id } — dispensa todas as indicações daquele título para você. Quem indicou não fica sabendo. */
export async function POST(request: NextRequest) {
  try {
    const viewer = await viewerOf();
    if (viewer.unavailable) return sessionUnavailableResponse();
    if (!viewer.id) return naoAutenticado();

    const body = await request.json().catch(() => ({}));
    const mediaId = Number(body?.media_id);
    if (!Number.isInteger(mediaId) || mediaId <= 0) return entradaInvalida("Título inválido.");

    await dismiss(getDb(), viewer.id, mediaId);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return respostaDeErro(error, "POST /api/recommendations/dismiss");
  }
}
