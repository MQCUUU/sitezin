import { NextRequest, NextResponse } from "next/server";

import { naoAutenticado, respostaDeErro } from "@/lib/api-error";
import { auth } from "@/lib/auth/server";
import { getDb } from "@/lib/db/neon";

/*
 * GET /api/account/hidden-titles?offset=N — "Não tenho interesse" (preferência
 * de recomendação: Para você, Escolha por mim, fila inteligente, assistente).
 *
 * V3.3: paginado (antes: LIMIT 100 silencioso — o resto ficava inalcançável)
 * e local-first: título/pôster/ano saem do catálogo local (`media`) numa
 * única consulta; o TMDB só é chamado para os títulos da PÁGINA que o
 * catálogo ainda não conhece (antes: 1 chamada por título, toda vez que a aba
 * abria, mesmo com a lista recolhida).
 */

const TMDB_BASE = "https://api.themoviedb.org/3";
const PRIVATE_NO_STORE = { "Cache-Control": "private, no-store" };
const PAGE_SIZE = 24;

type HiddenRow = {
  id: string;
  tmdb_id: number;
  media_type: "movie" | "tv";
  reason: string | null;
  created_at: string;
  title: string | null;
  poster_path: string | null;
  release_date: string | null;
  vote_average: number | null;
};

export async function GET(request: NextRequest) {
  try {
    const session = await auth.getSession().catch(() => null);
    const user = session?.data?.user;
    if (!user || !user.id) return naoAutenticado();

    // offset = quantos itens a tela já tem (restaurar um título não faz pular o próximo).
    const requested = Number(request.nextUrl.searchParams.get("offset") || 0);
    const offset = Number.isInteger(requested) && requested > 0 ? Math.min(requested, 100_000) : 0;
    const sql = getDb();

    const [countRows, rows] = await Promise.all([
      sql`SELECT count(*)::int AS total FROM public.user_hidden_titles WHERE user_id = ${user.id}`,
      sql`
        SELECT
          h.id, h.tmdb_id::int AS tmdb_id, h.media_type, h.reason, h.created_at,
          m.title, m.poster_path,
          COALESCE(m.release_date, m.first_air_date)::text AS release_date,
          m.tmdb_rating AS vote_average
        FROM public.user_hidden_titles h
        LEFT JOIN public.media m ON m.tmdb_id = h.tmdb_id AND m.media_type = h.media_type
        WHERE h.user_id = ${user.id}
        ORDER BY h.created_at DESC, h.id
        LIMIT ${PAGE_SIZE} OFFSET ${offset}
      `,
    ]);

    const total = Number(countRows[0]?.total || 0);
    const apiKey = process.env.TMDB_API_KEY;
    const language = process.env.TMDB_LANGUAGE || "pt-BR";

    const items = await Promise.all(
      (rows as HiddenRow[]).map(async (row) => {
        let { title, poster_path: posterPath, release_date: releaseDate, vote_average: voteAverage } = row;

        if (!title && apiKey) {
          try {
            const response = await fetch(
              `${TMDB_BASE}/${row.media_type}/${row.tmdb_id}?api_key=${encodeURIComponent(apiKey)}&language=${encodeURIComponent(language)}`,
              { next: { revalidate: 21600 }, signal: AbortSignal.timeout(8000) }
            );

            if (response.ok) {
              const details = await response.json();

              title = details.title || details.name || null;
              posterPath = details.poster_path || null;
              releaseDate = details.release_date || details.first_air_date || null;
              voteAverage = typeof details.vote_average === "number" ? details.vote_average : null;
            }
          } catch {
            // Sem rede para o TMDB: o item continua identificável e restaurável.
          }
        }

        return {
          id: row.id,
          tmdb_id: Number(row.tmdb_id),
          media_type: row.media_type,
          reason: row.reason,
          created_at: row.created_at,
          title: title || `${row.media_type === "tv" ? "Série" : "Filme"} #${row.tmdb_id}`,
          poster_path: posterPath || null,
          year: releaseDate ? String(releaseDate).slice(0, 4) : "",
          vote_average: typeof voteAverage === "number" ? Number(Number(voteAverage).toFixed(1)) : null,
        };
      })
    );

    return NextResponse.json(
      { total, offset, page_size: PAGE_SIZE, has_more: offset + items.length < total, items },
      { headers: PRIVATE_NO_STORE }
    );
  } catch (error) {
    return respostaDeErro(error, "GET /api/account/hidden-titles");
  }
}
