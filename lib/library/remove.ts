import type { getDb } from "@/lib/db/neon";

/*
 * Remover da Biblioteca = remover o ESTADO atual do título, nunca o histórico.
 *
 * Numa única transação:
 *  1. grava `library_removed` com o retrato mínimo do item (status, datas,
 *     nota e contadores — os únicos fatos que só existiam em library_items;
 *     nenhum texto livre). library_item_id fica NULL de propósito: o evento
 *     não depende do item que está sendo apagado.
 *  2. apaga o item. Pela migration db/migrations/2026-10-14_v2.5-history-integrity.sql,
 *     activity_events e watch_entries ficam (library_item_id → NULL);
 *     episodes_progress nunca dependeu do item. Listas (V2.7) também ficam:
 *     o item da lista aponta para a mídia e o vínculo com a Biblioteca vira
 *     NULL. Tags e notas por categoria (estado do item) saem junto.
 *
 * Se o retrato não puder ser gravado, nada é apagado.
 */
/**
 * V3.1 — o que REMOVER da Biblioteca faz com cada dado (auditado no schema e
 * provado no TEST). Readicionar cria uma NOVA entrada: por isso a ação depois
 * de remover é "Adicionar novamente", nunca "Desfazer".
 */
export const REMOVAL_EFFECTS = {
  /** Fatos: ficam (FK → NULL ou não dependem do item). */
  preserved: ["Diário (activity_events)", "visualizações (watch_entries)", "episódios (episodes_progress)", "listas (custom_list_items)"],
  /** Estado do item: apagado em cascata, junto com library_items. */
  deleted: ["status", "nota", "curtido", "resenha", "tags (library_tags)", "notas por categoria (review_scores / category_ratings)"],
  /** "Adicionar novamente" na mesma tela devolve (a tela ainda os tinha em memória). */
  restoredOnReadd: ["status", "nota", "curtido", "resenha"],
  /** Não voltam: não há cópia guardada. */
  notRestored: ["tags", "notas por categoria"],
} as const;

/** Copy das ações pós-adição/remoção — semântica verdadeira (V3.1). */
export const LIBRARY_ACTION_COPY = {
  removedDescription: "Diário, episódios, visualizações e listas continuam salvos.",
  readdLabel: "Adicionar novamente",
  readded: "Adicionado novamente à biblioteca",
  readdedDescription: "Status, nota, curtida e resenha voltaram; tags e notas por categoria não.",
  addedRemoveLabel: "Remover",
  addedRemoved: "Removido da biblioteca",
} as const;

export async function removeLibraryItem(sql: ReturnType<typeof getDb>, userId: string, id: string) {
  const [snapshot, deleted] = await sql.transaction([
    sql`
      INSERT INTO public.activity_events (user_id, media_id, library_item_id, event_type, metadata)
      SELECT
        li.user_id,
        li.media_id,
        NULL,
        'library_removed',
        jsonb_strip_nulls(jsonb_build_object(
          'status', li.status,
          'watched_at', li.watched_at,
          'watched_at_precision', li.watched_at_precision,
          'personal_rating', li.personal_rating,
          'rewatch_count', li.rewatch_count,
          'completed_seasons', li.completed_seasons,
          'current_season', li.current_season,
          'added_at', li.added_at
        ))
      FROM public.library_items li
      WHERE li.id = ${id} AND li.user_id = ${userId}
      RETURNING id
    `,
    sql`
      DELETE FROM public.library_items
      WHERE id = ${id} AND user_id = ${userId}
      RETURNING id
    `,
  ]);

  return { removed: (deleted as unknown[]).length > 0, snapshot: (snapshot as unknown[]).length > 0 };
}
