// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sql = (strings: TemplateStringsArray, ...values: any[]) => Promise<any>;

export type EpisodeUpsertRow = {
  season_number: number;
  episode_number: number;
  /** ISO ou Date vindo do banco; normalizado para ISO antes de gravar. */
  watched_at: string | Date | null;
  watched_at_precision: string | null;
};

/**
 * V3.1 — grava N episódios de UMA série numa ÚNICA consulta (`unnest`), em vez
 * de um INSERT por episódio (marcar T15:E01 de uma série longa cascateava
 * ~300 consultas em série). Mesma semântica de antes: upsert por
 * (user, media, temporada, episódio), sobrescrevendo watched/data/proveniência;
 * comentário e "reassistido" do episódio não são tocados.
 */
export async function upsertEpisodeRows(
  sql: Sql,
  input: { userId: string; mediaId: number; watched: boolean; rows: EpisodeUpsertRow[] }
) {
  if (input.rows.length === 0) return [];

  const rows = (await episodeRowsUpsertQuery(sql, input)) as Record<string, unknown>[];

  return rows.sort((a, b) => Number(a.season_number) - Number(b.season_number) || Number(a.episode_number) - Number(b.episode_number));
}

/**
 * A mesma consulta SEM executar — para compor uma transação (`sql.transaction`)
 * junto com a atualização do estado derivado da série (V3.1: tudo ou nada).
 */
export function episodeRowsUpsertQuery(
  sql: Sql,
  input: { userId: string; mediaId: number; watched: boolean; rows: EpisodeUpsertRow[] }
) {
  return sql`
    INSERT INTO public.episodes_progress (
      user_id, media_id, season_number, episode_number, watched, watched_at, watched_at_precision
    )
    SELECT ${input.userId}::uuid, ${input.mediaId}::int, t.season_number, t.episode_number, ${input.watched}::boolean, t.watched_at, t.watched_at_precision
    FROM unnest(
      ${input.rows.map((r) => r.season_number)}::int[],
      ${input.rows.map((r) => r.episode_number)}::int[],
      ${input.rows.map((r) => (r.watched_at === null || r.watched_at === undefined ? null : new Date(r.watched_at).toISOString()))}::timestamptz[],
      ${input.rows.map((r) => r.watched_at_precision)}::text[]
    ) AS t(season_number, episode_number, watched_at, watched_at_precision)
    ON CONFLICT (user_id, media_id, season_number, episode_number)
    DO UPDATE SET
      watched = EXCLUDED.watched,
      watched_at = EXCLUDED.watched_at,
      watched_at_precision = EXCLUDED.watched_at_precision
    RETURNING *
  `;
}

export type EpisodeJournalWrite = {
  commentProvided: boolean;
  comment: string | null;
  isRewatchProvided: boolean;
  isRewatch: boolean;
};

/**
 * Normalize journal fields for POST /api/episodes. The provided flags are
 * part of the persistence contract: SQL preserves stored values when a
 * quick watched toggle omits these fields, while an explicit empty comment
 * clears it and an explicit false resets the rewatch flag.
 */
export function getEpisodeJournalWrite(input: {
  comment?: unknown;
  is_rewatch?: unknown;
}): EpisodeJournalWrite {
  const commentProvided = typeof input.comment === "string";
  const isRewatchProvided = typeof input.is_rewatch === "boolean";

  return {
    commentProvided,
    comment: typeof input.comment === "string"
      ? input.comment.trim().slice(0, 4000) || null
      : null,
    isRewatchProvided,
    isRewatch: input.is_rewatch === true,
  };
}
