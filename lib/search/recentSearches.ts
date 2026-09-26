/**
 * Local-only recent-search history for the global search box.
 *
 * Lives entirely in `localStorage` — no table, no endpoint, nothing sent
 * to the server. Every read/write is guarded so it's safe to call from a
 * component that also renders during SSR (Next always renders the shell
 * once on the server first; `window`/`localStorage` don't exist there).
 */

const STORAGE_KEY = "mycatalog:recent-searches:v1";
const MAX_ENTRIES = 8;

export type RecentSearchEntry = {
  query: string;
  label?: string;
  type?: "query" | "media" | "person" | "user" | "collection" | "character";
  href?: string;
  timestamp: number;
};

function normalize(query: string): string {
  return query.trim().toLowerCase();
}

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function readRecentSearches(): RecentSearchEntry[] {
  if (!isBrowser()) return [];

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter(
      (entry): entry is RecentSearchEntry =>
        entry && typeof entry.query === "string" && typeof entry.timestamp === "number"
    );
  } catch {
    return [];
  }
}

function writeRecentSearches(entries: RecentSearchEntry[]) {
  if (!isBrowser()) return;

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Storage indisponível (privado/cheio) — histórico apenas não persiste.
  }
}

/**
 * Adds (or bumps to the top) a recent search entry. Dedupes case/whitespace
 * -insensitively on `query` so "Batman"/"batman"/"BATMAN" share one slot —
 * the newest label/href wins, so opening the same query again refreshes
 * what it points to.
 */
export function addRecentSearch(entry: Omit<RecentSearchEntry, "timestamp">): RecentSearchEntry[] {
  const key = normalize(entry.query);
  if (key.length < 2) return readRecentSearches();

  const current = readRecentSearches();
  const withoutDuplicate = current.filter((item) => normalize(item.query) !== key);

  const next = [{ ...entry, timestamp: Date.now() }, ...withoutDuplicate].slice(0, MAX_ENTRIES);

  writeRecentSearches(next);
  return next;
}

export function removeRecentSearch(query: string): RecentSearchEntry[] {
  const key = normalize(query);
  const next = readRecentSearches().filter((item) => normalize(item.query) !== key);
  writeRecentSearches(next);
  return next;
}

export function clearRecentSearches(): RecentSearchEntry[] {
  writeRecentSearches([]);
  return [];
}
