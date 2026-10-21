/*
 * Fase 0 — consulta do estado de UM título na biblioteca (GET /api/library?tmdb_id=…).
 *
 * Só duas respostas significam "não está na biblioteca":
 *  - 200 com `null`   → confirmado: o usuário não tem o título;
 *  - 401              → visitante: não há estado pessoal para mostrar.
 * Qualquer outra coisa (5xx, 4xx, corpo inválido, rede, tempo esgotado) LANÇA
 * erro: quem chama mostra "não foi possível verificar" e nunca trata a falha
 * como ausência (P0-01: a falha virava "ausente" e "Adicionar" apagava dados).
 */

export type LibraryLookupState = "loading" | "ready" | "error";

export const LIBRARY_LOOKUP_TIMEOUT_MS = 15_000;

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

export async function fetchLibraryState<T extends { id?: unknown } = { id: string }>(
  type: string,
  id: string | number,
  options: { fetcher?: Fetcher; timeoutMs?: number } = {}
): Promise<T | null> {
  const fetcher = options.fetcher ?? ((input, init) => fetch(input, init));
  const response = await fetcher(
    `/api/library?tmdb_id=${encodeURIComponent(String(id))}&type=${encodeURIComponent(type)}`,
    {
      cache: "no-store",
      signal: AbortSignal.timeout(options.timeoutMs ?? LIBRARY_LOOKUP_TIMEOUT_MS),
    }
  );

  if (response.status === 401) return null;

  if (!response.ok) {
    throw new Error(`Biblioteca indisponível (HTTP ${response.status}).`);
  }

  const data = await response.json().catch(() => {
    throw new Error("Resposta inválida da biblioteca.");
  });

  if (data === null) return null;

  if (typeof data !== "object" || !data || !("id" in data) || !data.id) {
    throw new Error("Resposta inválida da biblioteca.");
  }

  return data as T;
}
