import type { getDb } from "@/lib/db/neon";

/*
 * Remover da Biblioteca = apagar o título E todo o histórico dele (regra de
 * produto desde a Fase 1 da reforma de qualidade, 2026-11).
 *
 * Antes (V2.5/V3.1) o histórico sobrevivia à remoção: a Biblioteca dizia
 * "0 títulos" enquanto Diário, Insights e Para você seguiam mostrando o filme.
 * Agora, numa única transação e sempre filtrando pelo dono:
 *  1. visualizações (watch_entries) do título;
 *  2. episódios marcados (episodes_progress) do título;
 *  3. eventos do Diário (activity_events) do título;
 *  4. o item da Biblioteca — status, nota, curtida, resenha, tags e notas por
 *     categoria saem em cascata (FKs do schema).
 * Listas personalizadas NÃO são histórico (são curadoria): o título continua
 * na lista e o vínculo com a Biblioteca vira NULL (FK SET NULL).
 *
 * Nenhum retrato `library_removed` é gravado: não sobra rastro do título.
 * Eventos `library_removed` antigos (de antes desta regra) continuam sendo
 * lidos pelo Diário e pelo Insights até uma limpeza explícita dos dados.
 *
 * Os DELETEs de histórico só rodam se o item existe e é do usuário: um id
 * inválido ou de outra conta não apaga nada.
 */
/**
 * O que REMOVER da Biblioteca faz com cada dado. Readicionar cria uma NOVA
 * entrada: por isso a ação depois de remover é "Adicionar novamente", nunca
 * "Desfazer".
 */
export const REMOVAL_EFFECTS = {
  /** Apagado junto, sem volta. */
  deleted: [
    "status",
    "nota",
    "curtido",
    "resenha",
    "tags (library_tags)",
    "notas por categoria (review_scores)",
    "Diário (activity_events)",
    "visualizações (watch_entries)",
    "episódios (episodes_progress)",
  ],
  /** Fica: não é histórico. */
  preserved: ["listas (custom_list_items)"],
  /** "Adicionar novamente" na mesma tela devolve (a tela ainda os tinha em memória). */
  restoredOnReadd: ["status", "nota", "curtido", "resenha"],
  /** Não voltam: não há cópia guardada. */
  notRestored: ["tags", "notas por categoria", "histórico"],
} as const;

/** Copy da confirmação e das ações pós-adição/remoção — semântica verdadeira. */
export const LIBRARY_ACTION_COPY = {
  confirmDescription:
    "O título sai da sua biblioteca junto com todo o histórico dele: visualizações, episódios marcados e registros do Diário. Isso não pode ser desfeito.",
  removedDescription: "O histórico do título também foi apagado. Listas continuam com ele.",
  readdLabel: "Adicionar novamente",
  readded: "Adicionado novamente à biblioteca",
  readdedDescription: "Status, nota, curtida e resenha voltaram; tags, notas por categoria e o histórico não.",
  addedRemoveLabel: "Remover",
  addedRemoved: "Removido da biblioteca",
} as const;

/**
 * Chave do "Não mostrar novamente" da confirmação de remoção. É nova (v2) de
 * propósito: quem pulava a confirmação antiga ("o histórico continua") precisa
 * ver o aviso de que agora o histórico é apagado antes de poder pulá-lo de novo.
 */
export const REMOVAL_SKIP_KEY = "mycatalog_skip_remove_confirm_v2";

/** Opções da confirmação de remoção — iguais em todas as telas. */
export function removalConfirmOptions(title: string | null | undefined) {
  return {
    title: `Remover “${title || "este título"}”?`,
    description: LIBRARY_ACTION_COPY.confirmDescription,
    confirmLabel: "Remover",
    danger: true,
    skipKey: REMOVAL_SKIP_KEY,
  };
}

export async function removeLibraryItem(sql: ReturnType<typeof getDb>, userId: string, id: string) {
  // Cada DELETE de histórico se ancora no item (USING library_items): só age se ele existir E for do usuário.
  const [, , , deleted] = await sql.transaction([
    sql`
      DELETE FROM public.watch_entries we
      USING public.library_items li
      WHERE li.id = ${id} AND li.user_id = ${userId}
        AND we.user_id = ${userId} AND we.media_id = li.media_id
    `,
    sql`
      DELETE FROM public.episodes_progress ep
      USING public.library_items li
      WHERE li.id = ${id} AND li.user_id = ${userId}
        AND ep.user_id = ${userId} AND ep.media_id = li.media_id
    `,
    sql`
      DELETE FROM public.activity_events ae
      USING public.library_items li
      WHERE li.id = ${id} AND li.user_id = ${userId}
        AND ae.user_id = ${userId} AND (ae.media_id = li.media_id OR ae.library_item_id = li.id)
    `,
    sql`
      DELETE FROM public.library_items
      WHERE id = ${id} AND user_id = ${userId}
      RETURNING id
    `,
  ]);

  return { removed: (deleted as unknown[]).length > 0 };
}
