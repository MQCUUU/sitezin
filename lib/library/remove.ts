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
 *     episodes_progress nunca dependeu do item. Tags, listas e notas por
 *     categoria (estado do item) continuam saindo junto.
 *
 * Se o retrato não puder ser gravado, nada é apagado.
 */
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
