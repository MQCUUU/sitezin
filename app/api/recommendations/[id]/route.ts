import { NextResponse } from "next/server";
import { naoAutenticado, respostaDeErro } from "@/lib/api-error";
import { sessionUnavailableResponse } from "@/lib/auth/route-session";
import { getDb } from "@/lib/db/neon";
import { cancel } from "@/lib/recommendations/db";
import { isUuid } from "@/lib/reviews/load";
import { PRIVATE, viewerOf } from "@/lib/reviews/route-helpers";

/*
 * DELETE — cancela uma indicação sua enquanto o amigo ainda não pôs o título na
 * biblioteca. Indicação alheia, inexistente ou já salva/assistida: 404.
 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const viewer = await viewerOf();
    if (viewer.unavailable) return sessionUnavailableResponse();
    if (!viewer.id) return naoAutenticado();

    const notFound = NextResponse.json({ error: "Indicação não encontrada." }, { status: 404, headers: PRIVATE });
    if (!isUuid(id)) return notFound;
    return (await cancel(getDb(), viewer.id, id)) ? new NextResponse(null, { status: 204 }) : notFound;
  } catch (error) {
    return respostaDeErro(error, "DELETE /api/recommendations/[id]");
  }
}
