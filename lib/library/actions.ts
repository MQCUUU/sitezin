/*
 * Fase 1 — ações de biblioteca de um título: "adicionar", "mudar status" e
 * "curtir", inclusive quando o título ainda não está na biblioteca.
 *
 * Nunca usa o POST como atualização (proteção da Fase 0):
 *  1. POST /api/library garante que o item existe (cria se não existe; se já
 *     existe, devolve-o intacto — `created: false`);
 *  2. se o item já existia, PATCH /api/library/[id] altera SÓ o campo pedido.
 * Nota, resenha e os demais campos nunca são enviados.
 *
 * Erros chegam como ApiError (lib/api-client): `status === 401` = precisa
 * entrar; o chamador decide como avisar (useLibraryAuth).
 */
import { apiFetch, isApiError } from "../api-client";
import type { LibraryIntent } from "../auth/pending-action";

export type LibraryActionResult = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  item: Record<string, any>;
  created: boolean;
};

type Fetcher = typeof apiFetch;

const JSON_HEADERS = { "Content-Type": "application/json" };

export async function runLibraryAction(intent: LibraryIntent, fetcher: Fetcher = apiFetch): Promise<LibraryActionResult> {
  const media = { id: intent.tmdb_id, media_type: intent.media_type };
  const initial =
    intent.kind === "status"
      ? { status: intent.status }
      : intent.kind === "favorite"
        ? { status: "want", favorite: true }
        : { status: "want" };

  const ensured = await fetcher("/api/library", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ media, ...initial }),
  });

  if (ensured?.created !== false || intent.kind === "add") {
    return { item: ensured, created: ensured?.created !== false };
  }

  const patch = intent.kind === "status" ? { status: intent.status } : { favorite: true };
  const updated = await fetcher(`/api/library/${ensured.id}`, {
    method: "PATCH",
    headers: JSON_HEADERS,
    body: JSON.stringify(patch),
  });

  return { item: { ...ensured, ...updated }, created: false };
}

/** Fila por título: a ação mais recente sempre roda por último (sem bloquear a tela). */
export function createMutationQueue() {
  let tail: Promise<unknown> = Promise.resolve();

  return function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = tail.then(task, task);
    tail = run.catch(() => undefined);
    return run;
  };
}

/**
 * Fase 6 — remover da Biblioteca. A API responde 404 quando não havia o que
 * remover (mesma resposta para "não existe" e "é de outra conta": não vaza
 * nada). Para a tela, "já não estava lá" é o resultado pedido — clique duplo
 * ou outra aba não vira erro. Qualquer outro erro sobe (401, 5xx, rede).
 */
export async function removeFromLibrary(libraryId: string | number, fetcher: Fetcher = apiFetch): Promise<{ removed: boolean }> {
  try {
    await fetcher(`/api/library/${encodeURIComponent(String(libraryId))}`, { method: "DELETE" });
    return { removed: true };
  } catch (error) {
    if (isApiError(error, "NOT_FOUND")) return { removed: false };
    throw error;
  }
}
