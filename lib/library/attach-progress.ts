import { libraryProgress } from "./progress";
import { computeTvProgress, groupWatchedByMedia, tvStructureFromRaw } from "../tv-progress";

/*
 * Progresso de séries para linhas de `library_items` — UM caminho para
 * Biblioteca (V2.6) e Home (V3.0), sem terceira definição de progresso.
 *
 * Quem chama seleciona, por linha, `media` (sem raw) + as colunas auxiliares
 * `_seasons`, `_last_episode`, `_series_status` (de `media.raw`). Aqui:
 *  - UMA consulta em lote a `episodes_progress` para todas as séries (nunca
 *    uma por série);
 *  - regra canônica `computeTvProgress` + copy `libraryProgress`;
 *  - as colunas auxiliares são removidas de TODAS as linhas antes da resposta.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sql = (strings: TemplateStringsArray, ...values: any[]) => Promise<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

const AUX = ["_seasons", "_last_episode", "_series_status"] as const;

export async function attachSeriesProgress(
  sql: Sql,
  userId: string,
  rows: Row[],
  options: { tvProgress?: boolean } = {}
) {
  const tvRows = rows.filter((row) => row.media?.media_type === "tv");

  if (tvRows.length > 0) {
    const ids = [...new Set(tvRows.map((row) => Number(row.media.id)))];
    const progressRows = (await sql`
      SELECT media_id, season_number, episode_number
      FROM public.episodes_progress
      WHERE user_id = ${userId}
        AND watched = true
        AND media_id = ANY(${ids}::int[])
    `) as { media_id: number; season_number: number; episode_number: number }[];
    const byMedia = groupWatchedByMedia(progressRows);

    for (const row of tvRows) {
      const structure = tvStructureFromRaw(
        { seasons: row._seasons, last_episode_to_air: row._last_episode, status: row._series_status },
        { seasons_count: row.media.seasons_count, episodes_count: row.media.episodes_count }
      );
      const watched = byMedia.get(Number(row.media.id)) ?? [];
      const progress = computeTvProgress(structure, watched, { rewatching: row.status === "rewatching" });

      row.library_progress = libraryProgress({
        status: row.status,
        progress,
        structure,
        watched,
        completedSeasons: Number(row.completed_seasons || 0),
      });

      // Home: contagem global (watched/total) para a barra do destaque — mesma fonte.
      if (options.tvProgress) row.progress = progress;
    }
  }

  for (const row of rows) for (const key of AUX) delete row[key];

  return rows;
}
