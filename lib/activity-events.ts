/**
 * Tipo e utilitário compartilhados entre Diário e Retrospectiva — os dois
 * únicos consumidores de `GET /api/activity` no client.
 *
 * V2.1-A (docs/V2.1-A-DATA-INTEGRITY.md) — `season_completed`/
 * `series_completed` têm linhas duplicadas reais no banco (mesmo
 * usuário+mídia+timestamp idêntico até o milissegundo, sem nenhum
 * produtor de código ativo hoje — origem histórica não identificada).
 * `deduplicateActivityEvents` protege a leitura por identidade lógica do
 * evento, sem apagar nada no banco e sem eliminar eventos legítimos de
 * rewatch (que têm `occurred_at` real distinto entre si).
 */
export type ActivityEvent = {
  id: string;
  event_type:
    | "library_added"
    | "status_changed"
    | "season_completed"
    | "series_completed"
    | "rewatch_started"
    | "watch_logged";
  metadata: Record<string, any>;
  occurred_at: string;
  media: {
    id: string;
    tmdb_id: number;
    media_type: "movie" | "tv";
    title: string;
    poster_path: string | null;
    seasons_count: number | null;
    runtime: number | null;
    genres: (string | { id?: number; name?: string })[] | null;
  } | null;
};

/**
 * V2.1-A (ajuste pós-gate) — a chave original (event_type + mídia +
 * occurred_at) não distinguia `season_completed` de temporadas
 * diferentes da mesma série concluídas no mesmíssimo instante: duas
 * conclusões legítimas (temporada 1 e temporada 2) com timestamp
 * idêntico colidiriam e uma seria descartada. `metadata.season`
 * (já usado pela própria timeline para o rótulo "Temporada N
 * concluída") agora entra na chave só para `season_completed`.
 * `series_completed` não tem sub-dimensão de temporada — segue com a
 * mesma identidade de antes.
 */
export function deduplicateActivityEvents(events: ActivityEvent[]): ActivityEvent[] {
  const seen = new Set<string>();
  const result: ActivityEvent[] = [];

  for (const event of events) {
    const seasonPart =
      event.event_type === "season_completed"
        ? `|season=${event.metadata?.season ?? "none"}`
        : "";
    const key = `${event.event_type}|${event.media?.tmdb_id ?? "none"}|${event.media?.media_type ?? "none"}|${event.occurred_at}${seasonPart}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(event);
  }

  return result;
}
