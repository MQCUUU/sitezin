/*
 * Watchlist automática — a fila "Quero assistir" com prioridade.
 *
 * Não existe lista separada: a watchlist é a visão dos itens da Biblioteca com
 * status "want". Marcar "Quero assistir" (em qualquer lugar do site) entra na hora;
 * trocar para outro status sai na hora — impossível ficar fora de sincronia.
 *
 * `library_items.watchlist_position` guarda só a ORDEM escolhida pelo usuário
 * (1 = assistir primeiro). Quem ainda não tem posição entra no fim, por ordem de
 * chegada. A transição de status limpa a posição ao sair de "want"
 * (lib/library/status-event.ts): voltar para "Quero assistir" = fim da fila.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sql = (strings: TemplateStringsArray, ...values: any[]) => Promise<any[]>;

export const WATCHLIST_PAGE_MAX = 200;

export type WatchlistItem = {
  library_id: string;
  rank: number;
  favorite: boolean;
  added_at: string;
  media: {
    tmdb_id: number;
    media_type: "movie" | "tv";
    title: string;
    poster_path: string | null;
    backdrop_path: string | null;
    release_date: string | null;
    first_air_date: string | null;
    runtime: number | null;
    tmdb_rating: number | null;
    overview: string | null;
  };
};

/** Coluna `date` do banco chega como Date (não como texto): vira "AAAA-MM-DD". */
function dayOf(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
  const text = String(value);
  return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : null;
}

export async function listWatchlist(sql: Sql, userId: string, opts: { limit: number; offset: number }) {
  const limit = Math.min(Math.max(1, Math.floor(opts.limit) || 50), WATCHLIST_PAGE_MAX);
  const offset = Math.max(0, Math.floor(opts.offset) || 0);
  const [rows, minutesRows] = await Promise.all([
    sql`
    WITH q AS (
      SELECT
        li.id, li.favorite, li.added_at, li.media_id,
        row_number() OVER (ORDER BY li.watchlist_position ASC NULLS LAST, li.added_at ASC, li.id ASC)::int AS rank,
        count(*) OVER ()::int AS total
      FROM public.library_items li
      WHERE li.user_id = ${userId} AND li.status = 'want'
    )
    SELECT
      q.id AS library_id, q.rank, q.total, q.favorite, q.added_at,
      m.tmdb_id, m.media_type, m.title, m.poster_path, m.backdrop_path,
      m.release_date, m.first_air_date, m.runtime, m.tmdb_rating, m.overview
    FROM q
    JOIN public.media m ON m.id = q.media_id
    ORDER BY q.rank
    LIMIT ${limit} OFFSET ${offset}
  `,
    // Fase 6: duração estimada da fila inteira (não só da página): filme = runtime; série = episódios x duração (45 min se faltar).
    sql`
      SELECT COALESCE(sum(
        CASE WHEN m.media_type = 'tv'
          THEN COALESCE(m.episodes_count, 0) * COALESCE(NULLIF(m.runtime, 0), 45)
          ELSE COALESCE(NULLIF(m.runtime, 0), 0)
        END
      ), 0)::int AS minutes
      FROM public.library_items li
      JOIN public.media m ON m.id = li.media_id
      WHERE li.user_id = ${userId} AND li.status = 'want'
    `,
  ]);
  const total = rows.length ? Number(rows[0].total) : Number((await sql`SELECT count(*)::int AS n FROM public.library_items WHERE user_id = ${userId} AND status = 'want'`)[0]?.n || 0);

  const items: WatchlistItem[] = rows.map((r) => ({
    library_id: String(r.library_id),
    rank: Number(r.rank),
    favorite: Boolean(r.favorite),
    added_at: r.added_at instanceof Date ? r.added_at.toISOString() : String(r.added_at),
    media: {
      tmdb_id: Number(r.tmdb_id),
      media_type: r.media_type === "tv" ? "tv" : "movie",
      title: String(r.title),
      poster_path: r.poster_path ?? null,
      backdrop_path: r.backdrop_path ?? null,
      release_date: dayOf(r.release_date),
      first_air_date: dayOf(r.first_air_date),
      runtime: r.runtime === null || r.runtime === undefined ? null : Number(r.runtime),
      tmdb_rating: r.tmdb_rating === null || r.tmdb_rating === undefined ? null : Number(r.tmdb_rating),
      overview: r.overview ?? null,
    },
  }));

  return { items, total, total_minutes: Number(minutesRows[0]?.minutes || 0) };
}

/**
 * Move um item da fila para a posição `to` (0 = topo), renumerando a fila inteira
 * num ÚNICO comando (sem estados intermediários). Devolve a nova posição (1-based)
 * ou null se o item não está na watchlist do usuário.
 */
export async function moveWatchlistItem(sql: Sql, userId: string, libraryId: string, to: number): Promise<number | null> {
  const target = Math.max(0, Math.floor(to));
  const rows = await sql`
    WITH ordered AS (
      SELECT id, (row_number() OVER (ORDER BY watchlist_position ASC NULLS LAST, added_at ASC, id ASC) - 1)::int AS idx
      FROM public.library_items
      WHERE user_id = ${userId} AND status = 'want'
    ),
    cur AS (
      SELECT idx, LEAST(${target}::int, (SELECT count(*)::int - 1 FROM ordered)) AS dest
      FROM ordered WHERE id = ${libraryId}
    ),
    renumbered AS (
      SELECT o.id,
        CASE
          WHEN o.id = ${libraryId} THEN cur.dest
          WHEN cur.idx < cur.dest AND o.idx > cur.idx AND o.idx <= cur.dest THEN o.idx - 1
          WHEN cur.idx > cur.dest AND o.idx >= cur.dest AND o.idx < cur.idx THEN o.idx + 1
          ELSE o.idx
        END AS new_idx
      FROM ordered o CROSS JOIN cur
    )
    UPDATE public.library_items li
    SET watchlist_position = r.new_idx + 1
    FROM renumbered r
    WHERE li.id = r.id AND li.user_id = ${userId} AND li.status = 'want'
    RETURNING li.id, li.watchlist_position
  `;
  const mine = rows.find((r) => String(r.id) === String(libraryId));
  return mine ? Number(mine.watchlist_position) : null;
}
