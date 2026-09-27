import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { getDb } from "@/lib/db/neon";
import { naoAutenticado, respostaDeErro } from "@/lib/api-error";

/*
 * ==========================================
 * GET /api/stats — F1
 * ==========================================
 *
 * Antes, `/stats` buscava a biblioteca inteira via `/api/library` (sem
 * `paginated=true`) e agregava tudo — contagens, médias, distribuição
 * de notas, gêneros, anos, tempo assistido — em `useMemo` no browser
 * (F0, HIGH). Essa rota substitui isso por agregação real em SQL:
 * `COUNT`/`AVG`/`SUM`/`GROUP BY` fazem o trabalho no banco, e a página
 * recebe só o resumo já pronto — nunca as linhas da biblioteca.
 *
 * `genres` é `text[]` no schema (não objetos `{id,name}` como o tipo
 * `Media` no client sugere) — daí `unnest()` direto.
 */

export type StatsSummary = {
  totals: {
    items: number;
    movies: number;
    series: number;
    rated: number;
  };
  ratings: {
    average_personal: number | null;
    average_tmdb: number | null;
    distribution: { rating: number; count: number }[];
  };
  statuses: {
    watched: number;
    watching: number;
    want: number;
    dropped: number;
    rewatching: number;
  };
  favorites: number;
  watch_time: {
    total_minutes: number;
    total_hours: number;
    days_watched: number;
  };
  episodes: number;
  seasons: number;
  rewatched: number;
  genres: { name: string; count: number }[];
  years: { year: string; count: number }[];
  highest_rated: {
    title: string;
    personal_rating: number;
    tmdb_rating: number | null;
  } | null;
};

export async function GET() {
  try {
    const session = await auth.getSession().catch(() => null);
    const user = session?.data?.user;
    if (!user || !user.id) {
      return naoAutenticado();
    }

    const userId = user.id;
    const sql = getDb();

    const [overviewRows, distributionRows, genreRows, yearRows, highestRatedRows] = await Promise.all([
      sql`
        SELECT
          count(*)::int AS items,
          count(*) FILTER (WHERE m.media_type = 'movie')::int AS movies,
          count(*) FILTER (WHERE m.media_type = 'tv')::int AS series,
          count(*) FILTER (WHERE li.personal_rating IS NOT NULL)::int AS rated,
          avg(li.personal_rating) FILTER (WHERE li.personal_rating IS NOT NULL) AS average_personal,
          avg(m.tmdb_rating) FILTER (WHERE m.tmdb_rating IS NOT NULL) AS average_tmdb,
          count(*) FILTER (WHERE li.favorite)::int AS favorites,
          count(*) FILTER (WHERE li.status IN ('watched', 'rewatching', 'rewatched'))::int AS watched,
          count(*) FILTER (WHERE li.status = 'watching')::int AS watching,
          count(*) FILTER (WHERE li.status = 'want')::int AS want,
          count(*) FILTER (WHERE li.status = 'dropped')::int AS dropped,
          count(*) FILTER (WHERE li.status = 'rewatching')::int AS rewatching,
          coalesce(sum(m.episodes_count) FILTER (WHERE m.media_type = 'tv'), 0)::int AS episodes,
          coalesce(sum(m.seasons_count) FILTER (WHERE m.media_type = 'tv'), 0)::int AS seasons,
          coalesce(sum(
            CASE
              WHEN m.media_type = 'tv' THEN coalesce(m.runtime, 45) * coalesce(m.episodes_count, 0)
              ELSE coalesce(m.runtime, 0)
            END
          ), 0)::bigint AS total_minutes,
          coalesce(sum(
            GREATEST(coalesce(li.rewatch_count, 0), CASE WHEN li.status = 'rewatched' THEN 1 ELSE 0 END)
          ), 0)::int AS rewatched
        FROM public.library_items li
        JOIN public.media m ON m.id = li.media_id
        WHERE li.user_id = ${userId}
      `,
      sql`
        SELECT round(li.personal_rating)::int AS rating, count(*)::int AS count
        FROM public.library_items li
        WHERE li.user_id = ${userId} AND li.personal_rating IS NOT NULL
        GROUP BY round(li.personal_rating)
      `,
      sql`
        SELECT genre AS name, count(*)::int AS count
        FROM public.library_items li
        JOIN public.media m ON m.id = li.media_id
        CROSS JOIN LATERAL unnest(m.genres) AS genre
        WHERE li.user_id = ${userId}
        GROUP BY genre
        ORDER BY count DESC, genre ASC
        LIMIT 8
      `,
      sql`
        SELECT
          extract(year FROM (CASE WHEN m.media_type = 'tv' THEN m.first_air_date ELSE m.release_date END))::text AS year,
          count(*)::int AS count
        FROM public.library_items li
        JOIN public.media m ON m.id = li.media_id
        WHERE li.user_id = ${userId}
          AND (CASE WHEN m.media_type = 'tv' THEN m.first_air_date ELSE m.release_date END) IS NOT NULL
        GROUP BY year
        ORDER BY year DESC
        LIMIT 10
      `,
      sql`
        SELECT m.title, li.personal_rating, m.tmdb_rating
        FROM public.library_items li
        JOIN public.media m ON m.id = li.media_id
        WHERE li.user_id = ${userId} AND li.personal_rating IS NOT NULL
        ORDER BY li.personal_rating DESC, li.updated_at DESC
        LIMIT 1
      `,
    ]);

    const overview = overviewRows[0] as Record<string, unknown>;
    const totalMinutes = Number(overview.total_minutes || 0);
    const highestRated = highestRatedRows[0] as
      | { title: string; personal_rating: number; tmdb_rating: number | null }
      | undefined;

    const distributionMap = new Map(
      (distributionRows as { rating: number; count: number }[]).map((row) => [row.rating, row.count])
    );

    const summary: StatsSummary = {
      totals: {
        items: Number(overview.items || 0),
        movies: Number(overview.movies || 0),
        series: Number(overview.series || 0),
        rated: Number(overview.rated || 0),
      },
      ratings: {
        average_personal: overview.average_personal !== null ? Number(overview.average_personal) : null,
        average_tmdb: overview.average_tmdb !== null ? Number(overview.average_tmdb) : null,
        distribution: Array.from({ length: 10 }, (_, index) => index + 1).map((rating) => ({
          rating,
          count: distributionMap.get(rating) || 0,
        })),
      },
      statuses: {
        watched: Number(overview.watched || 0),
        watching: Number(overview.watching || 0),
        want: Number(overview.want || 0),
        dropped: Number(overview.dropped || 0),
        rewatching: Number(overview.rewatching || 0),
      },
      favorites: Number(overview.favorites || 0),
      watch_time: {
        total_minutes: totalMinutes,
        total_hours: Math.round(totalMinutes / 60),
        days_watched: Math.round(totalMinutes / 60 / 24),
      },
      episodes: Number(overview.episodes || 0),
      seasons: Number(overview.seasons || 0),
      rewatched: Number(overview.rewatched || 0),
      genres: genreRows as { name: string; count: number }[],
      years: (yearRows as { year: string; count: number }[]).slice().reverse(),
      highest_rated: highestRated
        ? {
            title: highestRated.title,
            personal_rating: Number(highestRated.personal_rating),
            tmdb_rating: highestRated.tmdb_rating !== null ? Number(highestRated.tmdb_rating) : null,
          }
        : null,
    };

    return NextResponse.json(summary, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return respostaDeErro(error, "GET /api/stats");
  }
}
