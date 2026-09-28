import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { getDb } from "@/lib/db/neon";
import { naoAutenticado, respostaDeErro } from "@/lib/api-error";

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
  to_jsonb(m.*) AS media
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

    const [totalsRows, watching, want, best, recent] = await Promise.all([
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
         WHERE li.user_id = $1
         ORDER BY li.added_at DESC
         LIMIT ${HOME_SHELF_LIMIT}`,
        [userId]
      ),
    ]);

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
      recent,
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
