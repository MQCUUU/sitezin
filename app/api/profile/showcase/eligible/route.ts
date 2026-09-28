import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { getDb } from "@/lib/db/neon";
import { entradaInvalida, naoAutenticado, respostaDeErro } from "@/lib/api-error";

/*
 * ==========================================
 * GET /api/profile/showcase/eligible — H1
 * ==========================================
 *
 * Antes, o editor de vitrine (ProfileShowcaseEditor) buscava a
 * biblioteca inteira via `/api/library` só para montar o seletor de
 * "escolher filme/série" (H0, achado novo). A regra de elegibilidade
 * (status assistido/reassistindo/reassistido) é a mesma que
 * `PUT /api/profile/showcase` já valida no servidor — este GET só
 * expõe essa mesma regra para popular o seletor, já filtrado por tipo
 * e busca, sem nunca trazer a biblioteca inteira.
 */

const ALLOWED_STATUSES = ["watched", "rewatching", "rewatched"];

export async function GET(request: NextRequest) {
  try {
    const session = await auth.getSession().catch(() => null);
    const user = session?.data?.user;
    if (!user || !user.id) {
      return naoAutenticado();
    }

    const type = request.nextUrl.searchParams.get("type");
    if (type !== "movie" && type !== "tv") {
      return entradaInvalida("type deve ser movie ou tv.");
    }

    const search = (request.nextUrl.searchParams.get("search") || "").trim();
    const sql = getDb();

    const rows = search
      ? await sql`
          SELECT li.status, m.id as media_id, m.tmdb_id, m.media_type, m.title, m.poster_path
          FROM public.library_items li
          JOIN public.media m ON m.id = li.media_id
          WHERE li.user_id = ${user.id}
            AND li.status = ANY(${ALLOWED_STATUSES})
            AND m.media_type = ${type}
            AND m.title ILIKE ${`%${search.replace(/[%_\\]/g, (c) => `\\${c}`)}%`}
          ORDER BY m.title ASC
          LIMIT 40
        `
      : await sql`
          SELECT li.status, m.id as media_id, m.tmdb_id, m.media_type, m.title, m.poster_path
          FROM public.library_items li
          JOIN public.media m ON m.id = li.media_id
          WHERE li.user_id = ${user.id}
            AND li.status = ANY(${ALLOWED_STATUSES})
            AND m.media_type = ${type}
          ORDER BY m.title ASC
          LIMIT 40
        `;

    return NextResponse.json(
      rows.map((row: any) => ({
        media_id: row.media_id,
        tmdb_id: row.tmdb_id,
        media_type: row.media_type,
        title: row.title,
        poster_path: row.poster_path,
      })),
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    return respostaDeErro(error, "GET /api/profile/showcase/eligible");
  }
}
