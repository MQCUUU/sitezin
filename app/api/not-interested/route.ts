import { NextRequest, NextResponse } from "next/server";
import { entradaInvalida, naoAutenticado, respostaDeErro } from "@/lib/api-error";
import { auth } from "@/lib/auth/server";
import { getDb } from "@/lib/db/neon";

function validType(value: unknown): value is "movie" | "tv" {
  return value === "movie" || value === "tv";
}

export async function GET() {
  try {
    const session = await auth.getSession().catch(() => null);
    const user = session?.data?.user;
    if (!user || !user.id) return naoAutenticado();

    const sql = getDb();
    const rows = await sql`
      SELECT id, tmdb_id, media_type, reason, created_at
      FROM public.user_hidden_titles
      WHERE user_id = ${user.id}
      ORDER BY created_at DESC
      LIMIT 100
    `;
    return NextResponse.json(rows || [], { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return respostaDeErro(error, "GET /api/not-interested");
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth.getSession().catch(() => null);
    const user = session?.data?.user;
    if (!user || !user.id) return naoAutenticado();

    const body = await request.json().catch(() => ({}));
    const tmdbId = Number(body?.tmdb_id);
    const mediaType = body?.media_type;

    if (!Number.isInteger(tmdbId) || tmdbId <= 0 || !validType(mediaType)) {
      return entradaInvalida("Título inválido.");
    }

    const suppliedReason = typeof body?.reason === "string" ? body.reason.trim() : "";
    const reason = suppliedReason.slice(0, 100) || "not_interested";

    const sql = getDb();
    const rows = await sql`
      INSERT INTO public.user_hidden_titles (user_id, tmdb_id, media_type, reason)
      VALUES (${user.id}, ${tmdbId}, ${mediaType}, ${reason})
      ON CONFLICT (user_id, tmdb_id, media_type)
      DO UPDATE SET reason = EXCLUDED.reason
      RETURNING id, tmdb_id, media_type, reason, created_at
    `;
    return NextResponse.json(rows[0], { status: 201 });
  } catch (error) {
    return respostaDeErro(error, "POST /api/not-interested");
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await auth.getSession().catch(() => null);
    const user = session?.data?.user;
    if (!user || !user.id) return naoAutenticado();

    const tmdbId = Number(request.nextUrl.searchParams.get("tmdb_id"));
    const mediaType = request.nextUrl.searchParams.get("media_type");

    if (!Number.isInteger(tmdbId) || tmdbId <= 0 || !validType(mediaType)) {
      return entradaInvalida("Título inválido.");
    }

    const sql = getDb();
    await sql`
      DELETE FROM public.user_hidden_titles
      WHERE user_id = ${user.id} AND tmdb_id = ${tmdbId} AND media_type = ${mediaType}
    `;
    return NextResponse.json({ success: true });
  } catch (error) {
    return respostaDeErro(error, "DELETE /api/not-interested");
  }
}
