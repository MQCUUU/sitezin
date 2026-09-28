import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { getDb } from "@/lib/db/neon";
import { naoAutenticado, respostaDeErro } from "@/lib/api-error";

/*
 * ==========================================
 * GET /api/ranking — H1
 * ==========================================
 *
 * Antes, `/ranking` buscava a biblioteca inteira via `/api/library`
 * (sem filtro nem paginação) e aplicava a regra de elegibilidade
 * (`personal_rating IS NOT NULL AND status != "want"`) inteira em JS
 * (H0, achado novo não coberto por D1/E1/F1). Essa regra não se encaixa
 * nos filtros de igualdade que `/api/library` já suporta (`status =`,
 * não `status !=`), então em vez de forçar isso na API de Library —
 * cujo contrato a D1 já consolidou — este é um endpoint pequeno e
 * dedicado, só para essa regra específica.
 *
 * IMPORTANTE: nota 0 é um valor válido de `personal_rating` — a
 * checagem correta é `IS NOT NULL`, nunca `> 0` (que descartaria notas
 * zero silenciosamente).
 */

export async function GET(request: NextRequest) {
  try {
    const session = await auth.getSession().catch(() => null);
    const user = session?.data?.user;
    if (!user || !user.id) {
      return naoAutenticado();
    }

    const userId = user.id;
    const type = request.nextUrl.searchParams.get("type");
    const sql = getDb();

    const rows =
      type === "movie" || type === "tv"
        ? await sql`
            SELECT
              li.id,
              li.personal_rating,
              m.tmdb_id,
              m.media_type,
              m.title,
              m.poster_path
            FROM public.library_items li
            JOIN public.media m ON m.id = li.media_id
            WHERE li.user_id = ${userId}
              AND li.personal_rating IS NOT NULL
              AND li.status <> 'want'
              AND m.media_type = ${type}
            ORDER BY li.personal_rating DESC, li.updated_at DESC
          `
        : await sql`
            SELECT
              li.id,
              li.personal_rating,
              m.tmdb_id,
              m.media_type,
              m.title,
              m.poster_path
            FROM public.library_items li
            JOIN public.media m ON m.id = li.media_id
            WHERE li.user_id = ${userId}
              AND li.personal_rating IS NOT NULL
              AND li.status <> 'want'
            ORDER BY li.personal_rating DESC, li.updated_at DESC
          `;

    return NextResponse.json(
      rows.map((row: any) => ({
        library_id: row.id,
        personal_rating: row.personal_rating !== null ? Number(row.personal_rating) : null,
        tmdb_id: row.tmdb_id,
        media_type: row.media_type,
        title: row.title,
        poster_path: row.poster_path,
      })),
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    return respostaDeErro(error, "GET /api/ranking");
  }
}
