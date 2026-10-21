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
 *   2. campos derivados da transição (temporadas) e o contador de
 *      reassistidas, incrementado NA LINHA (`rewatch_count + 1`), nunca a partir
 *      de uma leitura anterior;
 *   3. `status_changed` e, quando a transição inicia uma reassistida,
 *      `rewatch_started` — lidos do resultado do passo 1 (sem vencedor, sem
 *      evento).
 * Qualquer erro em qualquer passo desfaz todos.
 */

export type StatusTransition = { from: string; to: string };

export function statusTransition(previous: string | null | undefined, requested: string | null | undefined): StatusTransition | null {
  if (!previous || !requested || previous === requested) return null;

  return { from: previous, to: requested };
}

/**
 * Efeito de uma transição nas reassistidas (regra que já existia nas rotas):
 *  - entrar em Reassistindo (vindo de qualquer outro status) inicia uma
 *    reassistida: contador +1 e evento `rewatch_started`;
 *  - ir direto para Reassistido sem passar por Reassistindo conta uma
 *    reassistida (contador +1), sem `rewatch_started`;
 *  - Reassistindo → Reassistido conclui a que já foi contada (nada);
 *  - qualquer outra transição: nada.
 */
export function rewatchEffect(transition: StatusTransition) {
  const startsRewatch = transition.to === "rewatching";
  const completesDirectly = transition.to === "rewatched" && transition.from !== "rewatching";

  return { increment: startsRewatch || completesDirectly, startsRewatch };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sql = (strings: TemplateStringsArray, ...values: any[]) => Promise<any>;

export type TransitionResult = {
  /** Esta requisição realizou a transição (venceu o compare-and-set). */
  won: boolean;
  rewatch_count: number | null;
  status_events: number;
  rewatch_events: number;
};

export async function applyStatusTransition(
  sql: Sql,
  input: {
    userId: string;
    libraryItemId: string;
    transition: StatusTransition;
    derived: { current_season: number | null; completed_seasons: number; stopped_season: number | null };
    /** Campos extras do `rewatch_started` (o POST também grava o título, como antes). */
    rewatchMeta?: Record<string, unknown>;
  }
): Promise<TransitionResult> {
  const { userId, libraryItemId, transition, derived } = input;
  const { increment, startsRewatch } = rewatchEffect(transition);

  const rows = (await sql`
    WITH won AS (
      UPDATE public.library_items
      SET
        status = ${transition.to},
        rewatch_count = COALESCE(rewatch_count, 0) + ${increment ? 1 : 0}::int,
        current_season = ${derived.current_season},
        completed_seasons = ${derived.completed_seasons},
        stopped_season = ${derived.stopped_season}
      WHERE id = ${libraryItemId} AND user_id = ${userId} AND status = ${transition.from}
      RETURNING id, media_id, rewatch_count, current_season, stopped_season
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
    ),
    rewatch_event AS (
      INSERT INTO public.activity_events (user_id, media_id, library_item_id, event_type, metadata)
      SELECT
        ${userId}, won.media_id, won.id, 'rewatch_started',
        jsonb_build_object('rewatch_count', won.rewatch_count) || ${JSON.stringify(input.rewatchMeta ?? {})}::jsonb
      FROM won
      WHERE ${startsRewatch}::boolean
      RETURNING id
    )
    SELECT
      won.rewatch_count,
      (SELECT count(*) FROM status_event)::int AS status_events,
      (SELECT count(*) FROM rewatch_event)::int AS rewatch_events
    FROM won
  `) as { rewatch_count: number; status_events: number; rewatch_events: number }[];

  const row = rows[0];

  return {
    won: Boolean(row),
    rewatch_count: row ? Number(row.rewatch_count) : null,
    status_events: row ? Number(row.status_events) : 0,
    rewatch_events: row ? Number(row.rewatch_events) : 0,
  };
}
