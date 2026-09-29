import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { getDb } from "@/lib/db/neon";
import { naoAutenticado, respostaDeErro } from "@/lib/api-error";
import {
  computeTvProgress,
  estimateEpisodeRuntime,
  groupWatchedByMedia,
  tvStructureFromRaw,
} from "@/lib/tv-progress";

/*
 * ==========================================
 * GET /api/home — V2.1-D
 * ==========================================
 *
 * A Home autenticada buscava `GET /api/library` INTEIRA (sem paginação)
 * para montar 4 prateleiras + alguns totais, e ainda renderizava o
 * array inteiro em cada prateleira. Custo O(N biblioteca) em payload,
 * memória e DOM.
 *
 * Esta rota devolve SÓ o que a Home usa:
 *  - `totals`: agregado SQL (COUNT/AVG) — payload constante,
 *    independente do tamanho da biblioteca;
 *  - 4 prateleiras, cada uma com `LIMIT HOME_SHELF_LIMIT`, com o mesmo
 *    formato de linha de `GET /api/library` (o client continua
 *    achatando `...item.media` exatamente como antes).
 *
 * Índices já existentes cobrem as 4 queries
 * (`library_items_user_updated_idx`, `library_items_user_added_idx`,
 * `library_items_user_rating_idx`, `library_items_user_status_added_idx`)
 * — nenhuma migration nova.
 *
 * Calendário e Atividade continuam com seus endpoints próprios
 * (`/api/calendar`, `/api/activity`), que já têm contrato enxuto.
 */

const HOME_SHELF_LIMIT = 12;

/*
 * V2.2-B — "Curtidos" (mini-stack de posters no card-resumo): só os 4 mais
 * recentes. Substitui a prateleira "recentes" (12 itens) que a Home deixou de
 * usar: mesma contagem fixa de queries (5), payload menor.
 */
const HOME_LIKED_LIMIT = 4;

const ITEM_COLUMNS = `
  li.id,
  li.status,
  li.favorite,
  li.personal_rating,
  li.review,
  li.watched_at,
  li.rewatch_count,
  li.current_season,
  li.completed_seasons,
  li.stopped_season,
  li.added_at,
  li.updated_at,
  to_jsonb(m.*) - 'raw' AS media,
  m.raw->'seasons' AS _seasons,
  m.raw->'last_episode_to_air' AS _last_episode,
  m.raw->'status' AS _series_status,
  m.raw->'episode_run_time' AS _run_time
`;

export async function GET() {
  const startedAt = performance.now();

  try {
    const session = await auth.getSession().catch(() => null);
    const user = session?.data?.user;

    if (!user || !user.id) {
      return naoAutenticado();
    }

    const userId = user.id;
    const sql = getDb();

    const dbStartedAt = performance.now();

    const [totalsRows, watching, want, best, liked] = await Promise.all([
      sql`
        SELECT
          count(*)::int AS library,
          count(*) FILTER (WHERE status IN ('watching', 'rewatching'))::int AS watching,
          count(*) FILTER (WHERE status = 'want')::int AS want,
          count(*) FILTER (WHERE status IN ('watched', 'rewatching', 'rewatched'))::int AS watched,
          count(*) FILTER (WHERE favorite)::int AS favorites,
          count(*) FILTER (WHERE personal_rating IS NOT NULL)::int AS rated,
          avg(personal_rating) FILTER (WHERE personal_rating IS NOT NULL) AS average_rating,
          count(*) FILTER (WHERE status <> 'want')::int AS completion_base
        FROM public.library_items
        WHERE user_id = ${userId}
      `,
      sql.query(
        `SELECT ${ITEM_COLUMNS}
         FROM public.library_items li
         JOIN public.media m ON m.id = li.media_id
         WHERE li.user_id = $1 AND li.status IN ('watching', 'rewatching')
         ORDER BY li.updated_at DESC
         LIMIT ${HOME_SHELF_LIMIT}`,
        [userId]
      ),
      sql.query(
        `SELECT ${ITEM_COLUMNS}
         FROM public.library_items li
         JOIN public.media m ON m.id = li.media_id
         WHERE li.user_id = $1 AND li.status = 'want'
         ORDER BY li.updated_at DESC
         LIMIT ${HOME_SHELF_LIMIT}`,
        [userId]
      ),
      sql.query(
        `SELECT ${ITEM_COLUMNS}
         FROM public.library_items li
         JOIN public.media m ON m.id = li.media_id
         WHERE li.user_id = $1 AND li.personal_rating IS NOT NULL
         ORDER BY li.personal_rating DESC, li.updated_at DESC
         LIMIT ${HOME_SHELF_LIMIT}`,
        [userId]
      ),
      sql.query(
        `SELECT ${ITEM_COLUMNS}
         FROM public.library_items li
         JOIN public.media m ON m.id = li.media_id
         WHERE li.user_id = $1 AND li.favorite = true
         ORDER BY li.updated_at DESC
         LIMIT ${HOME_LIKED_LIMIT}`,
        [userId]
      ),
    ]);

    /*
     * V2.1-E — próximo episódio das séries em andamento. UMA query batched
     * para todas as séries da prateleira (≤ HOME_SHELF_LIMIT), agrupada em
     * memória: nunca uma query por série.
     */
    const tvRows = (watching as Record<string, any>[]).filter(
      (row) => row.media?.media_type === "tv"
    );

    if (tvRows.length > 0) {
      const mediaIds = tvRows.map((row) => Number(row.media.id));
      const progressRows = (await sql`
        SELECT media_id, season_number, episode_number
        FROM public.episodes_progress
        WHERE user_id = ${userId}
          AND watched = true
          AND media_id = ANY(${mediaIds}::int[])
      `) as { media_id: number; season_number: number; episode_number: number }[];

      const byMedia = groupWatchedByMedia(progressRows);

      for (const row of tvRows) {
        // Duração ESTIMADA de um episódio (média do TMDB) — só um número; o
        // `raw` continua sem ir ao client.
        row.episode_runtime = estimateEpisodeRuntime({
          episode_run_time: row._run_time,
          last_episode_to_air: row._last_episode,
        });

        row.progress = computeTvProgress(
          tvStructureFromRaw(
            {
              seasons: row._seasons,
              last_episode_to_air: row._last_episode,
              status: row._series_status,
            },
            {
              seasons_count: row.media.seasons_count,
              episodes_count: row.media.episodes_count,
            }
          ),
          byMedia.get(Number(row.media.id)) ?? [],
          { rewatching: row.status === "rewatching" }
        );
      }
    }

    /*
     * V2.2-A — `raw` (payload bruto do TMDB, ~10-20 KB por título) nunca é
     * enviado ao client (nenhuma tela o usa); as colunas auxiliares só
     * existem para calcular o progresso e são removidas antes da resposta.
     */
    for (const shelf of [watching, want, best, liked] as Record<string, any>[][]) {
      for (const row of shelf) {
        delete row._seasons;
        delete row._last_episode;
        delete row._series_status;
        delete row._run_time;
      }
    }

    const dbMs = performance.now() - dbStartedAt;
    const totals = (totalsRows[0] || {}) as Record<string, unknown>;

    const body = {
      totals: {
        library: Number(totals.library || 0),
        watching: Number(totals.watching || 0),
        want: Number(totals.want || 0),
        watched: Number(totals.watched || 0),
        favorites: Number(totals.favorites || 0),
        rated: Number(totals.rated || 0),
        average_rating:
          totals.average_rating === null || totals.average_rating === undefined
            ? null
            : Number(totals.average_rating),
        completion_base: Number(totals.completion_base || 0),
      },
      watching,
      want,
      best,
      liked,
    };

    const totalMs = performance.now() - startedAt;

    return NextResponse.json(body, {
      headers: {
        "Cache-Control": "private, no-store",
        // Só durações agregadas — nenhum SQL, id ou dado de conexão.
        "Server-Timing": `db;dur=${dbMs.toFixed(1)}, total;dur=${totalMs.toFixed(1)}`,
      },
    });
  } catch (error) {
    return respostaDeErro(error, "GET /api/home");
  }
}
