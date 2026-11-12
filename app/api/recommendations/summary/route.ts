import { NextResponse } from "next/server";
import { naoAutenticado, respostaDeErro } from "@/lib/api-error";
import { sessionUnavailableResponse } from "@/lib/auth/route-session";
import { getDb } from "@/lib/db/neon";
import { summary } from "@/lib/recommendations/db";
import { PRIVATE, viewerOf } from "@/lib/reviews/route-helpers";

/* GET — { unseen, pending }: o número da barra e se a fileira do Início aparece. */
export async function GET() {
  try {
    const viewer = await viewerOf();
    if (viewer.unavailable) return sessionUnavailableResponse();
    if (!viewer.id) return naoAutenticado();
    return NextResponse.json(await summary(getDb(), viewer.id), { headers: PRIVATE });
  } catch (error) {
    return respostaDeErro(error, "GET /api/recommendations/summary");
  }
}
