import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { getDb } from "@/lib/db/neon";
import {
  entradaInvalida,
  naoAutenticado,
  respostaDeErro,
} from "@/lib/api-error";

/*
 * V2.1-D — estado pessoal (na biblioteca? status/favorito/nota) de um
 * conjunto LIMITADO de títulos, em UMA consulta batched.
 *
 * Existe para telas que só precisam saber o estado de poucos títulos já
 * visíveis (ex.: os filmes de uma coleção) sem baixar a biblioteca
 * inteira via `GET /api/library`. É deliberadamente estreito:
 *  - exige sessão (nunca responde para guest);
 *  - sempre escopado a `user_id` da sessão (o cliente não escolhe de
 *    quem é o estado);
 *  - no máximo MAX_ITEMS pares (media_type, tmdb_id) por chamada;
 *  - só devolve os campos que a UI usa, e só dos títulos que existem
 *    na biblioteca do usuário (ausentes simplesmente não vêm).
 */
const MAX_ITEMS = 100;

export async function POST(req: Request) {
  try {
    const session = await auth.getSession().catch(() => null);
    const user = session?.data?.user;

    if (!user || !user.id) {
      return naoAutenticado();
    }

    const body = await req.json().catch(() => null);
    const items = Array.isArray(body?.items) ? body.items : null;

    if (!items) {
      return entradaInvalida("Informe `items` como uma lista.");
    }

    if (items.length === 0) {
      return NextResponse.json(
        { items: [] },
        { headers: { "Cache-Control": "private, no-store" } }
      );
    }

    if (items.length > MAX_ITEMS) {
      return entradaInvalida(`No máximo ${MAX_ITEMS} títulos por chamada.`);
    }

    const mediaTypes: string[] = [];
    const tmdbIds: number[] = [];

    for (const item of items) {
      const mediaType = item?.media_type;
      const tmdbId = Number(item?.tmdb_id);

      if (
        (mediaType !== "movie" && mediaType !== "tv") ||
        !Number.isInteger(tmdbId) ||
        tmdbId <= 0
      ) {
        return entradaInvalida(
          "Cada item precisa de `media_type` (movie|tv) e `tmdb_id` inteiro positivo."
        );
      }

      mediaTypes.push(mediaType);
      tmdbIds.push(tmdbId);
    }

    const sql = getDb();
    const rows = await sql.query(
      `SELECT
         li.id AS library_id,
         m.tmdb_id,
         m.media_type,
         li.status,
         li.favorite,
         li.personal_rating
       FROM public.library_items li
       JOIN public.media m ON m.id = li.media_id
       JOIN unnest($2::text[], $3::bigint[]) AS wanted(media_type, tmdb_id)
         ON wanted.media_type = m.media_type
        AND wanted.tmdb_id = m.tmdb_id
       WHERE li.user_id = $1`,
      [user.id, mediaTypes, tmdbIds]
    );

    return NextResponse.json(
      {
        items: (rows as any[]).map((row) => ({
          library_id: String(row.library_id),
          tmdb_id: Number(row.tmdb_id),
          media_type: row.media_type,
          status: row.status || null,
          favorite: Boolean(row.favorite),
          personal_rating:
            row.personal_rating === null || row.personal_rating === undefined
              ? null
              : Number(row.personal_rating),
        })),
      },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    return respostaDeErro(error, "POST /api/library/state");
  }
}
