/*
 * Listas V2.7 — validação de entrada (pura, testada em scripts/test-lists.mjs).
 * Nada do cliente é usado cru: nome, descrição, IDs e posição são normalizados aqui.
 */

export const NAME_MAX = 80;
export const DESCRIPTION_MAX = 300;
export const ITEMS_PAGE = 60;
export const LISTS_PAGE = 24;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

/** Nome: trim, espaços internos colapsados, 2–80 caracteres. null = inválido. */
export function normalizeName(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const name = value.replace(/\s+/g, " ").trim().slice(0, NAME_MAX);

  return name.length >= 2 ? name : null;
}

/**
 * Descrição opcional: null/undefined/""/só espaços/o texto "null" → null.
 * (O bug antigo gravava `String(null)` = "null" e a tela mostrava.)
 */
export function normalizeDescription(value: unknown): string | null {
  if (value === null || value === undefined || typeof value !== "string") return null;

  const text = value.trim().slice(0, DESCRIPTION_MAX);

  return text && text !== "null" ? text : null;
}

/** Descrição para exibir: só texto real, nunca "null"/vazio. */
export function displayDescription(value: unknown): string | null {
  return normalizeDescription(value);
}

export function parseMediaType(value: unknown): "movie" | "tv" | null {
  return value === "movie" || value === "tv" ? value : null;
}

export function parsePositiveInt(value: unknown, max = 2_147_483_647): number | null {
  const n = Number(value);

  return Number.isInteger(n) && n > 0 && n <= max ? n : null;
}

/** Índice de destino (0-based) para mover um item; fora do intervalo é ajustado pelo servidor. */
export function parseIndex(value: unknown): number | null {
  const n = Number(value);

  return Number.isInteger(n) && n >= 0 && n < 100_000 ? n : null;
}

export function parsePage(value: unknown): number {
  const n = Number(value);

  return Number.isInteger(n) && n > 1 ? Math.min(n, 10_000) : 1;
}

/** Nova ordem ao mover `from` para `to` (mesma regra do SQL do servidor) — usada na UI otimista e nos testes. */
export function moveInOrder<T>(items: T[], from: number, to: number): T[] {
  if (from < 0 || from >= items.length) return items;

  const target = Math.max(0, Math.min(items.length - 1, to));
  const next = [...items];
  const [moved] = next.splice(from, 1);

  next.splice(target, 0, moved);

  return next;
}

export function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}
