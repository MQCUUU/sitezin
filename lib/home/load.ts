import { attachSeriesProgress } from "../library/attach-progress";
import { estimateEpisodeRuntime } from "../tv-progress";
import { ACTIVE_STATUSES, CONTINUITY_STATUSES, orderActive, statusTotals, type ActivityFacts } from "./home";

/*
 * Home — leitura do banco para GET /api/home (V3.0).
 *
 * Número de consultas CONSTANTE, qualquer que seja o tamanho da Biblioteca
 * ou a quantidade de títulos ativos (1, 12 ou 50):
 *   rodada 1 (em paralelo)  totais · fatos de continuidade · fila · notas · curtidos
 *   rodada 2                detalhes dos ≤ 12 ativos escolhidos
 *   rodada 3                progresso das séries de todas as prateleiras (1 consulta)
 * = 7 consultas. Os fatos de continuidade saem de UMA consulta com agregação
 * em lote (GROUP BY por fonte, uma vez só) — nada por título.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type HomeSql = ((strings: TemplateStringsArray, ...values: any[]) => Promise<any>) & {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: (text: string, params?: any[]) => Promise<any>;
};

export const HOME_SHELF_LIMIT = 12;
/* "Curtidos" (mini-stack de posters no card-resumo): só os 4 mais recentes. */
export const HOME_LIKED_LIMIT = 4;

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
  CASE WHEN m.media_type = 'tv' THEN m.raw->'seasons' END AS _seasons,
  CASE WHEN m.media_type = 'tv' THEN m.raw->'last_episode_to_air' END AS _last_episode,
  CASE WHEN m.media_type = 'tv' THEN m.raw->>'status' END AS _series_status
`;

/**
 * Fatos de continuidade de TODOS os títulos ativos, numa consulta:
 * cada fonte é agregada uma única vez (GROUP BY), restrita aos ativos.
 * Eventos válidos: ver CONTINUITY_STATUSES / lib/home/home.ts.
 */
export const ACTIVITY_FACTS_SQL = `
  WITH active AS (
    SELECT li.id, li.media_id, li.added_at
    FROM public.library_items li
    WHERE li.user_id = $1 AND li.status = ANY($2::text[])
  ),
  ep AS (
    SELECT ep.media_id, max(ep.watched_at) AS at
    FROM public.episodes_progress ep
    WHERE ep.user_id = $1 AND ep.watched = true AND ep.media_id IN (SELECT media_id FROM active)
    GROUP BY ep.media_id
  ),
  we AS (
    SELECT we.media_id, max(we.watched_at) AS at
    FROM public.watch_entries we
    WHERE we.user_id = $1 AND we.media_id IN (SELECT media_id FROM active)
    GROUP BY we.media_id
  ),
  ev AS (
    SELECT a.id, max(ae.occurred_at) AS at
    FROM active a
    JOIN public.activity_events ae
      ON ae.user_id = $1
     AND (ae.media_id = a.media_id OR ae.library_item_id = a.id)
    WHERE ae.event_type = 'rewatch_started'
       OR (ae.event_type = 'status_changed' AND ae.metadata->>'to' = ANY($3::text[]))
       OR (ae.event_type = 'library_added' AND ae.metadata->>'status' = ANY($3::text[]))
    GROUP BY a.id
  )
  SELECT
    a.id,
    a.added_at,
    ep.at AS last_episode_at,
    we.at AS last_watch_at,
    ev.at AS last_continuity_at
  FROM active a
  LEFT JOIN ep ON ep.media_id = a.media_id
  LEFT JOIN we ON we.media_id = a.media_id
  LEFT JOIN ev ON ev.id = a.id
`;

export async function loadHome(sql: HomeSql, userId: string) {
  const [totalsRows, facts, want, best, liked] = (await Promise.all([
    sql`
      SELECT
        count(*) FILTER (WHERE favorite)::int AS favorites,
        count(*) FILTER (WHERE personal_rating IS NOT NULL)::int AS rated,
        avg(personal_rating) FILTER (WHERE personal_rating IS NOT NULL) AS average_rating,
        COALESCE((
          SELECT jsonb_object_agg(s.status, s.n)
          FROM (SELECT status, count(*)::int AS n FROM public.library_items WHERE user_id = ${userId} GROUP BY status) s
        ), '{}'::jsonb) AS by_status
      FROM public.library_items
      WHERE user_id = ${userId}
    `,
    sql.query(ACTIVITY_FACTS_SQL, [userId, [...ACTIVE_STATUSES], [...CONTINUITY_STATUSES]]),
    sql.query(
      `SELECT ${ITEM_COLUMNS}
       FROM public.library_items li
       JOIN public.media m ON m.id = li.media_id
       WHERE li.user_id = $1 AND li.status = 'want'
       ORDER BY li.added_at DESC, li.id DESC
       LIMIT ${HOME_SHELF_LIMIT}`,
      [userId]
    ),
    sql.query(
      `SELECT ${ITEM_COLUMNS}
       FROM public.library_items li
       JOIN public.media m ON m.id = li.media_id
       WHERE li.user_id = $1 AND li.personal_rating IS NOT NULL
       ORDER BY li.personal_rating DESC, li.updated_at DESC, li.id DESC
       LIMIT ${HOME_SHELF_LIMIT}`,
      [userId]
    ),
    sql.query(
      `SELECT ${ITEM_COLUMNS}
       FROM public.library_items li
       JOIN public.media m ON m.id = li.media_id
       WHERE li.user_id = $1 AND li.favorite = true
       ORDER BY li.updated_at DESC, li.id DESC
       LIMIT ${HOME_LIKED_LIMIT}`,
      [userId]
    ),
  ])) as [Row[], ActivityFacts[], Row[], Row[], Row[]];

  // Ordem "Em andamento" = regra pura (última atividade de continuidade, desempate por id).
  const chosen = orderActive(facts, HOME_SHELF_LIMIT);
  let watching: Row[] = [];

  if (chosen.length > 0) {
    const rows = (await sql.query(
      `SELECT ${ITEM_COLUMNS},
         CASE WHEN m.media_type = 'tv' THEN m.raw->'episode_run_time' END AS _run_time
       FROM public.library_items li
       JOIN public.media m ON m.id = li.media_id
       WHERE li.user_id = $1 AND li.id = ANY($2::uuid[]) AND li.status = ANY($3::text[])`,
      [userId, chosen.map((c) => c.id), [...ACTIVE_STATUSES]]
    )) as Row[];
    const byId = new Map(rows.map((row) => [String(row.id), row]));

    watching = chosen.flatMap((c) => {
      const row = byId.get(String(c.id));

      return row ? [{ ...row, last_activity_at: c.last_activity_at }] : [];
    });
  }

  // Duração ESTIMADA de um episódio (média do TMDB) — só um número; `raw` nunca vai ao client.
  for (const row of watching) {
    if (row.media?.media_type === "tv") {
      row.episode_runtime = estimateEpisodeRuntime({ episode_run_time: row._run_time, last_episode_to_air: row._last_episode });
    }

    delete row._run_time;
  }

  // UMA consulta em lote para as séries de TODAS as prateleiras (mesma regra da Biblioteca).
  await attachSeriesProgress(sql, userId, [...watching, ...want, ...best, ...liked], { tvProgress: true });

  const totals = (totalsRows[0] || {}) as Row;
  const byStatus = Object.fromEntries(
    Object.entries((totals.by_status || {}) as Record<string, unknown>).map(([key, value]) => [key, Number(value || 0)])
  );

  return {
    totals: {
      // library / watching / want / watched / completion_base — UMA fórmula (lib/home/home.ts).
      ...statusTotals(byStatus),
      favorites: Number(totals.favorites || 0),
      rated: Number(totals.rated || 0),
      average_rating: totals.average_rating === null || totals.average_rating === undefined ? null : Number(totals.average_rating),
      by_status: byStatus,
    },
    watching,
    want,
    best,
    liked,
  };
}
