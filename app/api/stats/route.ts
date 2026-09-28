import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { getDb } from "@/lib/db/neon";
import { naoAutenticado, respostaDeErro } from "@/lib/api-error";

/*
 * ==========================================
 * GET /api/stats — F1, corrigido em V2.1-A
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
 *
 * V2.1-A — STATS-01/02/03/04 (docs/V2.1-POST-V2-AUDIT.md): os campos
 * `episodes`/`seasons`/`watch_time`/`rewatched` de nível raiz somavam o
 * CATÁLOGO inteiro da biblioteca (`episodes_count`/`seasons_count` do
 * TMDB, para QUALQUER status, inclusive `want` nunca assistido) como se
 * fosse consumo real. Substituídos pelo objeto `watched`, com fontes
 * canônicas reais de consumo (ver docs/V2.1-A-DATA-INTEGRITY.md):
 *   - filme assistido: `library_items.status IN ('watched','rewatched')`
 *     — não `watch_entries` (98% dos itens watched no banco real não têm
 *     nenhuma linha em watch_entries; é um recurso secundário de baixa
 *     adoção, não a fonte primária de "assisti isso").
 *   - episódio assistido: `episodes_progress.watched = true` (93% de
 *     adoção real no banco de teste, contra ~2% de watch_entries) — modo
 *     correto de medir progresso real de série, nunca `episodes_count`
 *     (que é o total da série no TMDB, catálogo, não progresso).
 *   - temporada concluída: `library_items.completed_seasons` (contador
 *     de progresso real já mantido por app/api/episodes/route.ts), nunca
 *     `activity_events.season_completed` (sem nenhum produtor de código
 *     ativo hoje — ver RETRO-03 na auditoria).
 *   - `status = 'want'` nunca soma para nada em `watched`.
 *   - `status IN ('paused','dropped')` também não soma para filmes
 *     assistidos nem para tempo de filme (sem evidência de conclusão);
 *     para séries, o que conta é só o progresso real por episódio, que já
 *     é imune a isso (só soma o que tem `watched=true`).
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
  genres: { name: string; count: number }[];
  years: { year: string; count: number }[];
  highest_rated: {
    title: string;
    personal_rating: number;
    tmdb_rating: number | null;
  } | null;
  /**
   * Consumo real — nunca inclui itens `want`/`paused`/`dropped` sem
   * evidência de progresso. Ver comentário acima e
   * docs/V2.1-A-DATA-INTEGRITY.md para a semântica canônica completa.
   */
  watched: {
    movies_watched: number;
    episodes_watched: number;
    seasons_completed: number;
    series_completed: number;
    rewatched: number;
    watch_time: {
      total_minutes: number;
      total_hours: number;
      days_watched: number;
      /** A UI deve deixar explícito que isto é estimativa, nunca medição exata. */
      is_estimate: true;
    };
  };
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

    const [overviewRows, watchedRows, episodesWatchedRows, distributionRows, genreRows, yearRows, highestRatedRows] = await Promise.all([
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
          count(*) FILTER (WHERE li.status = 'rewatching')::int AS rewatching
        FROM public.library_items li
        JOIN public.media m ON m.id = li.media_id
        WHERE li.user_id = ${userId}
      `,
      // V2.1-A — consumo real. `movies_watched` só conta filme com status
      // que implica conclusão (`watched`/`rewatched`) — nunca `want`,
      // nunca `watching` (ainda em andamento, sem evidência de fim),
      // nunca `paused`/`dropped` (sem progresso parcial mensurável para
      // filme). `seasons_completed`/`series_completed` vêm do contador
      // de progresso real (`completed_seasons`), nunca do catálogo TMDB.
      sql`
        SELECT
          count(*) FILTER (WHERE m.media_type = 'movie' AND li.status IN ('watched', 'rewatched'))::int AS movies_watched,
          coalesce(sum(li.completed_seasons) FILTER (WHERE m.media_type = 'tv'), 0)::int AS seasons_completed,
          count(*) FILTER (
            WHERE m.media_type = 'tv' AND m.seasons_count > 0 AND li.completed_seasons >= m.seasons_count
          )::int AS series_completed,
          coalesce(sum(
            GREATEST(coalesce(li.rewatch_count, 0), CASE WHEN li.status = 'rewatched' THEN 1 ELSE 0 END)
          ), 0)::int AS rewatched,
          -- (ajuste pós-gate) rewatch_count é escrito em 4 pontos
          -- (app/api/library/route.ts, app/api/library/[id]/route.ts,
          -- app/api/watch-history/route.ts, app/api/watch-history/
          -- [id]/route.ts), todos reconciliados para representar o
          -- número de REASSISTIDAS (não o total de visualizações) —
          -- confirmado por auditoria de todos os writes, ver
          -- docs/V2.1-A-DATA-INTEGRITY.md. total_views = 1 + rewatch_count.
          -- Só filmes com status watched/rewatched contam (nunca
          -- 'rewatching', que é reassistida em andamento, ainda sem
          -- evidência de conclusão).
          coalesce(sum(
            CASE WHEN m.media_type = 'movie' AND li.status IN ('watched', 'rewatched')
              THEN coalesce(m.runtime, 0) * (1 + coalesce(li.rewatch_count, 0))
              ELSE 0 END
          ), 0)::bigint AS movies_minutes
        FROM public.library_items li
        JOIN public.media m ON m.id = li.media_id
        WHERE li.user_id = ${userId}
      `,
      // Progresso real por episódio — fonte muito mais confiável que
      // episodes_count (93% de adoção real vs. ~2% de watch_entries no
      // banco observado). `coalesce(m.runtime, 45)` é a mesma estimativa
      // de duração média por episódio já usada antes, só que agora
      // multiplicada por episódio REALMENTE assistido, não pelo total.
      sql`
        SELECT
          count(*)::int AS episodes_watched,
          coalesce(sum(coalesce(m.runtime, 45)), 0)::bigint AS episodes_minutes
        FROM public.episodes_progress ep
        JOIN public.media m ON m.id = ep.media_id
        WHERE ep.user_id = ${userId} AND ep.watched = true
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
    const watchedOverview = watchedRows[0] as Record<string, unknown>;
    const episodesWatched = episodesWatchedRows[0] as Record<string, unknown>;
    const totalMinutes =
      Number(watchedOverview.movies_minutes || 0) + Number(episodesWatched.episodes_minutes || 0);
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
      genres: genreRows as { name: string; count: number }[],
      years: (yearRows as { year: string; count: number }[]).slice().reverse(),
      highest_rated: highestRated
        ? {
            title: highestRated.title,
            personal_rating: Number(highestRated.personal_rating),
            tmdb_rating: highestRated.tmdb_rating !== null ? Number(highestRated.tmdb_rating) : null,
          }
        : null,
      watched: {
        movies_watched: Number(watchedOverview.movies_watched || 0),
        episodes_watched: Number(episodesWatched.episodes_watched || 0),
        seasons_completed: Number(watchedOverview.seasons_completed || 0),
        series_completed: Number(watchedOverview.series_completed || 0),
        rewatched: Number(watchedOverview.rewatched || 0),
        watch_time: {
          total_minutes: totalMinutes,
          total_hours: Math.round(totalMinutes / 60),
          days_watched: Math.round(totalMinutes / 60 / 24),
          is_estimate: true,
        },
      },
    };

    return NextResponse.json(summary, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return respostaDeErro(error, "GET /api/stats");
  }
}
