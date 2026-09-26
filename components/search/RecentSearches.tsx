import { useEffect, useRef } from "react";
import { Clock, Film, Layers3, Search as SearchIcon, UserRound, X } from "lucide-react";

import type { RecentSearchEntry } from "@/lib/search/recentSearches";

const TYPE_ICON: Record<NonNullable<RecentSearchEntry["type"]>, typeof Film> = {
  query: SearchIcon,
  media: Film,
  person: UserRound,
  character: UserRound,
  user: UserRound,
  collection: Layers3,
};

export type RecentSearchesProps = {
  entries: RecentSearchEntry[];
  onOpen: (entry: RecentSearchEntry) => void;
  onRemove: (query: string) => void;
  onClear: () => void;
};

function focusSearchInput() {
  document.querySelector<HTMLElement>('input[aria-label="Pesquisa universal"]')?.focus();
}

/**
 * The dropdown's idle state (B3 §4-6): no query yet, so instead of an
 * empty box we show what the user searched for recently. Local-only
 * (localStorage) — nothing here ever touches the network, and there's no
 * "trending" section because no existing endpoint provides that data
 * without a new backend call (out of scope for this phase).
 *
 * B3.7 (LOW — continuidade de foco): removing/clearing a recently-focused
 * entry used to leave focus stranded on <body> (only reachable via
 * keyboard Tab, since mouse clicks here keep focus on the input via
 * `onMouseDown preventDefault`). Removing an item now moves focus to the
 * next remaining item's remove button, falling back to the previous one,
 * falling back to the search input if the list becomes empty; clearing
 * always returns focus to the search input.
 */
export function RecentSearches({ entries, onOpen, onRemove, onClear }: RecentSearchesProps) {
  const listRef = useRef<HTMLUListElement>(null);
  const pendingRemoveIndexRef = useRef<number | null>(null);
  const pendingClearRef = useRef(false);

  useEffect(() => {
    if (pendingClearRef.current) {
      pendingClearRef.current = false;
      focusSearchInput();
      return;
    }

    if (pendingRemoveIndexRef.current === null) return;

    const index = pendingRemoveIndexRef.current;
    pendingRemoveIndexRef.current = null;

    const buttons = listRef.current?.querySelectorAll<HTMLElement>(".mc-search-recent-remove");

    if (buttons && buttons.length > 0) {
      buttons[Math.min(index, buttons.length - 1)]?.focus();
    } else {
      focusSearchInput();
    }
  }, [entries]);

  function handleRemove(query: string, index: number) {
    pendingRemoveIndexRef.current = index;
    onRemove(query);
  }

  function handleClear() {
    pendingClearRef.current = true;
    onClear();
  }

  if (entries.length === 0) {
    return (
      <div className="mc-search-idle">
        <p className="muted">Busque por filme, série, pessoa, personagem ou usuário.</p>
      </div>
    );
  }

  return (
    <div className="mc-search-idle">
      <div className="mc-search-idle-header">
        <span>
          <Clock size={13} />
          Buscas recentes
        </span>

        <button type="button" className="mc-search-idle-clear" onClick={handleClear}>
          Limpar
        </button>
      </div>

      <ul className="mc-search-recent-list" ref={listRef}>
        {entries.map((entry, index) => {
          const Icon = TYPE_ICON[entry.type || "query"];

          return (
            <li key={entry.query} className="mc-search-recent-item">
              <button
                type="button"
                className="mc-search-recent-open"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => onOpen(entry)}
              >
                <Icon size={14} />
                <span>{entry.label || entry.query}</span>
              </button>

              <button
                type="button"
                className="mc-search-recent-remove"
                title={`Remover “${entry.label || entry.query}” dos recentes`}
                aria-label={`Remover “${entry.label || entry.query}” dos recentes`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => handleRemove(entry.query, index)}
              >
                <X size={13} />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
