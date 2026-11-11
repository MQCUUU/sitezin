/*
 * Biblioteca — transição de status como UM fato atômico.
 *
 * Regra ÚNICA para PATCH /api/library/[id] (cards, Quick View, Biblioteca, página
 * do título). POST /api/library só cria item novo e nunca muda o status de um
 * item existente (lib/library/add.ts). Só há transição quando o pedido traz
 * um status E ele é diferente do status gravado. Repetir o mesmo payload
 * (retry, duplo clique, salvar nota/Curtir/review sem mudar o status) não
 * gera nada. Item novo não passa por aqui: a criação é contada por
 * `library_added` (com o status inicial), nunca também como "mudou de status".
 *
 * `applyStatusTransition` grava, num ÚNICO comando SQL (uma transação
 * PostgreSQL — tudo ou nada):
 *   1. compare-and-set do status (`WHERE status = from`): só a requisição que
 *      de fato troca o status continua; as concorrentes não fazem nada;
 *   2. campos derivados da transição (temporadas);
 *   3. `status_changed` — lido do resultado do passo 1 (sem vencedor, sem
 *      evento).
 * Não existe mais reassistir (migration 0008): só Assistindo e Assistido.
 * Qualquer erro em qualquer passo desfaz todos.
 */

export type StatusTransition = { from: string; to: string };

export function statusTransition(previous: string | null | undefined, requested: string | null | undefined): StatusTransition | null {
  if (!previous || !requested || previous === requested) return null;

  return { from: previous, to: requested };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sql = (strings: TemplateStringsArray, ...values: any[]) => Promise<any>;

export type TransitionResult = {
  /** Esta requisição realizou a transição (venceu o compare-and-set). */
  won: boolean;
  status_events: number;
};

export async function applyStatusTransition(
  sql: Sql,
  input: {
    userId: string;
    libraryItemId: string;
    transition: StatusTransition;
    derived: { current_season: number | null; completed_seasons: number; stopped_season: number | null };
  }
): Promise<TransitionResult> {
  const { userId, libraryItemId, transition, derived } = input;

  const rows = (await sql`
    WITH won AS (
      UPDATE public.library_items
      SET
        status = ${transition.to},
        current_season = ${derived.current_season},
        completed_seasons = ${derived.completed_seasons},
        stopped_season = ${derived.stopped_season},
        -- Watchlist: sair de "Quero assistir" limpa a posição (voltar = fim da fila).
        watchlist_position = CASE WHEN ${transition.to}::text = 'want' THEN watchlist_position ELSE NULL END
      WHERE id = ${libraryItemId} AND user_id = ${userId} AND status = ${transition.from}
      RETURNING id, media_id, current_season, stopped_season
    ),
    status_event AS (
      INSERT INTO public.activity_events (user_id, media_id, library_item_id, event_type, metadata)
      SELECT
        ${userId}, won.media_id, won.id, 'status_changed',
        jsonb_build_object(
          'from', ${transition.from}::text,
          'to', ${transition.to}::text,
          'current_season', won.current_season,
          'stopped_season', won.stopped_season
        )
      FROM won
      RETURNING id
    )
    SELECT (SELECT count(*) FROM status_event)::int AS status_events
    FROM won
  `) as { status_events: number }[];

  const row = rows[0];

  return {
    won: Boolean(row),
    status_events: row ? Number(row.status_events) : 0,
  };
}
