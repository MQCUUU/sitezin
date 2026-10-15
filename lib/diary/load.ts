import type { ActivityType, MediaRef, RawItem } from "./types";

/*
 * Diário — leitura de UM mês (dia civil de Brasília) nas fontes canônicas,
 * sem alterar nada:
 *   watch_entries      visualizações (data, precisão, nota, comentário, reassistida)
 *   episodes_progress  episódios assistidos (+ conclusão de temporada/série derivada)
 *   activity_events    ações na biblioteca (adicionar, status, reassistir, legado)
 * `watch_logged` só entra quando a visualização dele não existe mais em
 * watch_entries (ela é o espelho; a fonte é watch_entries). 4 consultas por
 * mês, sem N+1 (pôster/título vêm no JOIN; temporadas de `media.raw`).
 * Sem imports de runtime: roda também nos scripts de verificação.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sql = (strings: TemplateStringsArray, ...values: any[]) => Promise<any>;

const TZ = "America/Sao_Paulo";
const ROW_LIMIT = 4000;

type Row = Record<string, any>;

function mediaOf(row: Row, recovered = false): MediaRef | null {
  if (row.mid === null || row.mid === undefined) return null;

  return {
    id: Number(row.mid),
    tmdb_id: Number(row.tmdb_id),
    media_type: row.media_type === "tv" ? "tv" : "movie",
    title: String(row.title || ""),
    poster_path: row.poster_path || null,
    ...(recovered ? { recovered: true } : {}),
  };
}

function nextMonth(month: string) {
  const [y, m] = month.split("-").map(Number);

  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}

export type DiaryMonth = { month: string; months: string[]; items: RawItem[]; truncated: boolean };

export async function loadDiaryMonth(sql: Sql, userId: string, askedMonth: string | null, today: string): Promise<DiaryMonth> {
  const current = today.slice(0, 7);

  // Meses com atividade (índices por usuário; só datas, sem conteúdo).
  const monthRows = (await sql`
    SELECT to_char(ts AT TIME ZONE ${TZ}, 'YYYY-MM') AS m
    FROM (
      SELECT occurred_at AS ts FROM public.activity_events WHERE user_id = ${userId}
      UNION ALL
      SELECT watched_at FROM public.watch_entries WHERE user_id = ${userId}
      UNION ALL
      SELECT watched_at FROM public.episodes_progress
      WHERE user_id = ${userId} AND watched = true AND watched_at IS NOT NULL
    ) s
    GROUP BY 1
    ORDER BY 1 DESC
  `) as Row[];
  const months = monthRows.map((r) => String(r.m)).filter((m) => m <= current);
  const asked = askedMonth || "";
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(asked) ? asked : months[0] || current;
  const start = `${month}-01 00:00:00`;
  const end = `${nextMonth(month)}-01 00:00:00`;

  const [events, watches, episodes] = (await Promise.all([
    sql`
      SELECT
        ae.id, ae.event_type, ae.metadata, ae.occurred_at,
        to_char(ae.occurred_at AT TIME ZONE ${TZ}, 'YYYY-MM-DD') AS day,
        to_char(ae.occurred_at AT TIME ZONE ${TZ}, 'HH24:MI') AS hm,
        COALESCE(m.id, rec.id) AS mid,
        COALESCE(m.tmdb_id, rec.tmdb_id) AS tmdb_id,
        COALESCE(m.media_type, rec.media_type) AS media_type,
        COALESCE(m.title, rec.title) AS title,
        COALESCE(m.poster_path, rec.poster_path) AS poster_path,
        (m.id IS NULL AND rec.id IS NOT NULL) AS recovered,
        CASE WHEN ae.event_type = 'status_changed' AND ae.metadata->>'to' = 'rewatched' THEN (
          SELECT r.metadata->>'rewatch_count'
          FROM public.activity_events r
          WHERE r.user_id = ae.user_id
            AND r.event_type = 'rewatch_started'
            AND r.media_id = m.id
            AND r.occurred_at <= ae.occurred_at
          ORDER BY r.occurred_at DESC
          LIMIT 1
        ) END AS rewatch_number
      FROM (
        -- Duplicatas legadas idênticas (docs/V2.1-A-DATA-INTEGRITY.md §5): uma por identidade lógica.
        SELECT DISTINCT ON (
          e.event_type,
          COALESCE(e.media_id, li.media_id),
          e.occurred_at,
          CASE WHEN e.event_type = 'season_completed' THEN e.metadata->>'season' END,
          CASE WHEN e.media_id IS NULL AND li.media_id IS NULL THEN e.id END
        ) e.*, COALESCE(e.media_id, li.media_id) AS resolved_media_id
        FROM public.activity_events e
        LEFT JOIN public.library_items li ON li.id = e.library_item_id
        WHERE e.user_id = ${userId}
          AND e.occurred_at >= (${start}::timestamp AT TIME ZONE ${TZ})
          AND e.occurred_at < (${end}::timestamp AT TIME ZONE ${TZ})
          AND NOT (
            e.event_type = 'watch_logged'
            AND EXISTS (SELECT 1 FROM public.watch_entries we WHERE we.user_id = e.user_id AND we.id::text = e.metadata->>'watch_entry_id')
          )
        ORDER BY
          e.event_type,
          COALESCE(e.media_id, li.media_id),
          e.occurred_at,
          CASE WHEN e.event_type = 'season_completed' THEN e.metadata->>'season' END,
          CASE WHEN e.media_id IS NULL AND li.media_id IS NULL THEN e.id END,
          e.id
      ) ae
      LEFT JOIN public.media m ON m.id = ae.resolved_media_id
      -- Evento legado sem vínculo: reconhece o título SÓ pelo nome+tipo gravados nele e SÓ se for inequívoco.
      LEFT JOIN LATERAL (
        SELECT mm.id, mm.tmdb_id, mm.media_type, mm.title, mm.poster_path
        FROM public.media mm
        WHERE ae.resolved_media_id IS NULL
          AND ae.event_type = 'library_added'
          AND mm.title = ae.metadata->>'title'
          AND mm.media_type = ae.metadata->>'media_type'
          AND NOT EXISTS (
            SELECT 1 FROM public.media m2
            WHERE m2.title = mm.title AND m2.media_type = mm.media_type AND m2.id <> mm.id
          )
        LIMIT 1
      ) rec ON true
      ORDER BY ae.occurred_at DESC
      LIMIT ${ROW_LIMIT}
    `,
    sql`
      SELECT
        we.id, we.watched_at, we.watched_at_precision, we.rating, we.comment, we.is_rewatch,
        to_char(we.watched_at AT TIME ZONE ${TZ}, 'YYYY-MM-DD') AS day,
        to_char(we.watched_at AT TIME ZONE ${TZ}, 'HH24:MI') AS hm,
        (
          SELECT count(*)::int FROM public.watch_entries w2
          WHERE w2.user_id = we.user_id
          -- por título (media_id): a numeração sobrevive a remover/readicionar
            AND w2.media_id = we.media_id
            AND (w2.watched_at < we.watched_at OR (w2.watched_at = we.watched_at AND w2.id <= we.id))
        ) AS watch_number,
        m.id AS mid, m.tmdb_id, m.media_type, m.title, m.poster_path
      FROM public.watch_entries we
      JOIN public.media m ON m.id = we.media_id
      WHERE we.user_id = ${userId}
        AND we.watched_at >= (${start}::timestamp AT TIME ZONE ${TZ})
        AND we.watched_at < (${end}::timestamp AT TIME ZONE ${TZ})
      ORDER BY we.watched_at DESC
      LIMIT ${ROW_LIMIT}
    `,
    sql`
      WITH series AS (
        SELECT DISTINCT media_id
        FROM public.episodes_progress
        WHERE user_id = ${userId} AND watched = true
          AND watched_at >= (${start}::timestamp AT TIME ZONE ${TZ})
          AND watched_at < (${end}::timestamp AT TIME ZONE ${TZ})
      ),
      eps AS (
        SELECT
          ep.id, ep.media_id, ep.season_number, ep.episode_number, ep.watched_at, ep.watched_at_precision,
          row_number() OVER (PARTITION BY ep.media_id, ep.season_number ORDER BY ep.watched_at DESC, ep.episode_number DESC) AS rn_last
        FROM public.episodes_progress ep
        WHERE ep.user_id = ${userId} AND ep.watched = true AND ep.watched_at IS NOT NULL
          AND ep.media_id IN (SELECT media_id FROM series)
      ),
      meta AS (
        SELECT
          m.id,
          m.raw->>'status' AS show_status,
          -- temporada que ainda tem episódio por vir (no ar): nunca "concluída"
          NULLIF(m.raw->'next_episode_to_air'->>'season_number', '')::int AS airing_season,
          CASE WHEN jsonb_typeof(m.raw->'seasons') = 'array' THEN m.raw->'seasons' ELSE '[]'::jsonb END AS seasons
        FROM public.media m
        WHERE m.id IN (SELECT media_id FROM series)
      ),
      -- Só temporadas regulares (Especiais = temporada 0 nunca contam) com contagem conhecida.
      season_meta AS (
        SELECT meta.id AS media_id, (s->>'season_number')::int AS season_number, NULLIF((s->>'episode_count')::int, 0) AS episode_count
        FROM meta, jsonb_array_elements(meta.seasons) s
        WHERE (s->>'season_number')::int > 0
      ),
      -- Concluída = todos os episódios 1..N vistos e nenhum além de N (contagem desatualizada não conclui).
      season_state AS (
        SELECT
          sm.media_id, sm.season_number,
          (sm.episode_count IS NOT NULL
            AND count(e.id) >= sm.episode_count
            AND COALESCE(max(e.episode_number), 0) <= sm.episode_count) AS complete
        FROM season_meta sm
        LEFT JOIN eps e ON e.media_id = sm.media_id AND e.season_number = sm.season_number
        GROUP BY sm.media_id, sm.season_number, sm.episode_count
      ),
      show_state AS (
        SELECT media_id, bool_and(complete) AS all_complete, max(season_number) AS last_season
        FROM season_state
        GROUP BY media_id
      )
      SELECT
        eps.id, eps.season_number, eps.episode_number, eps.watched_at, eps.watched_at_precision,
        to_char(eps.watched_at AT TIME ZONE ${TZ}, 'YYYY-MM-DD') AS day,
        to_char(eps.watched_at AT TIME ZONE ${TZ}, 'HH24:MI') AS hm,
        m.id AS mid, m.tmdb_id, m.media_type, m.title, m.poster_path,
        (
          eps.rn_last = 1
          AND COALESCE(ss.complete, false)
          AND (meta.airing_season IS NULL OR meta.airing_season > eps.season_number)
        ) AS season_done,
        (
          meta.show_status IN ('Ended', 'Canceled')
          AND eps.season_number = sh.last_season
          AND COALESCE(sh.all_complete, false)
        ) AS last_season
      FROM eps
      JOIN public.media m ON m.id = eps.media_id
      JOIN meta ON meta.id = eps.media_id
      LEFT JOIN season_state ss ON ss.media_id = eps.media_id AND ss.season_number = eps.season_number
      LEFT JOIN show_state sh ON sh.media_id = eps.media_id
      WHERE eps.watched_at >= (${start}::timestamp AT TIME ZONE ${TZ})
        AND eps.watched_at < (${end}::timestamp AT TIME ZONE ${TZ})
      ORDER BY eps.watched_at DESC
      LIMIT ${ROW_LIMIT}
    `,
  ])) as [Row[], Row[], Row[]];

  const items: RawItem[] = [];

  for (const r of events) {
    const base = {
      id: `e:${r.id}`,
      at: new Date(r.occurred_at).toISOString(),
      day: String(r.day),
      media: mediaOf(r, Boolean(r.recovered)),
    };
    const meta = (r.metadata || {}) as Record<string, unknown>;

    if (r.event_type === "watch_logged") {
      // Espelho sem a visualização original: data sem proveniência de horário → só a data.
      items.push({
        ...base,
        source: "watch",
        time: null,
        rating: meta.rating === null || meta.rating === undefined ? null : Number(meta.rating),
        comment: typeof meta.comment === "string" ? meta.comment : null,
        is_rewatch: Boolean(meta.is_rewatch),
        watch_number: Number(meta.watch_number) || 1,
      });
      continue;
    }

    items.push({
      ...base,
      source: "event",
      // Ações na biblioteca: relógio do servidor no momento da ação (proveniência 'datetime').
      time: String(r.hm),
      type: r.event_type as ActivityType,
      meta: r.rewatch_number ? { ...meta, rewatch_number: Number(r.rewatch_number) } : meta,
    });
  }

  for (const r of watches) {
    items.push({
      id: `w:${r.id}`,
      source: "watch",
      at: new Date(r.watched_at).toISOString(),
      day: String(r.day),
      time: r.watched_at_precision === "datetime" ? String(r.hm) : null,
      media: mediaOf(r),
      rating: r.rating === null || r.rating === undefined ? null : Number(r.rating),
      comment: r.comment || null,
      is_rewatch: Boolean(r.is_rewatch),
      watch_number: Number(r.watch_number) || 1,
    });
  }

  for (const r of episodes) {
    items.push({
      id: `p:${r.id}`,
      source: "episode",
      at: new Date(r.watched_at).toISOString(),
      day: String(r.day),
      time: r.watched_at_precision === "datetime" ? String(r.hm) : null,
      media: mediaOf(r),
      season: Number(r.season_number),
      episode: Number(r.episode_number),
      season_done: Boolean(r.season_done),
      series_done: Boolean(r.season_done) && Boolean(r.last_season),
    });
  }


  return { month, months, items, truncated: [events, watches, episodes].some((rows) => rows.length >= ROW_LIMIT) };
}
