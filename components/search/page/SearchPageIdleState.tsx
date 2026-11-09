"use client";


import "@/styles/features/search-page.css";
import "@/styles/features/screen-kit.css";
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

import {
  clearRecentSearches,
  readRecentSearches,
  removeRecentSearch,
  type RecentSearchEntry,
} from "@/lib/search/recentSearches";

function focusSearchInput() {
  document.querySelector<HTMLElement>('input[aria-label="Pesquisa universal"]')?.focus();
}

/**
 * B3 §35: today, no query and "no results" looked the same. This is the
 * page's own idle state, reading the same localStorage history as the
 * topbar dropdown (read fresh on mount — client-only, no SSR mismatch)
 * but presented as a chip grid instead of a narrow list, fitting the
 * page's wider canvas.
 *
 * B3.7 (LOW — continuidade de foco): same fix as the dropdown's
 * RecentSearches — removing a focused chip moves focus to the next
 * remaining chip's remove button (falling back to the previous one, then
 * to the search input if the list empties out); clearing always returns
 * focus to the search input.
 */
export function SearchPageIdleState() {
  const [entries, setEntries] = useState<RecentSearchEntry[]>([]);
  const chipsRef = useRef<HTMLDivElement>(null);
  const pendingRemoveIndexRef = useRef<number | null>(null);
  const pendingClearRef = useRef(false);

  useEffect(() => {
    setEntries(readRecentSearches());
  }, []);

  useEffect(() => {
    if (pendingClearRef.current) {
      pendingClearRef.current = false;
      focusSearchInput();
      return;
    }

    if (pendingRemoveIndexRef.current === null) return;

    const index = pendingRemoveIndexRef.current;
    pendingRemoveIndexRef.current = null;

    const buttons = chipsRef.current?.querySelectorAll<HTMLElement>(".sp-recent-item button");

    if (buttons && buttons.length > 0) {
      buttons[Math.min(index, buttons.length - 1)]?.focus();
    } else {
      focusSearchInput();
    }
  }, [entries]);

  function handleRemove(query: string, index: number) {
    pendingRemoveIndexRef.current = index;
    setEntries(removeRecentSearch(query));
  }

  function handleClear() {
    pendingClearRef.current = true;
    setEntries(clearRecentSearches());
  }

  return (
    <div className="sp-idle">
      <p className="sp-idle-lead">Busque um filme, série, pessoa, personagem ou usuário.</p>

      {entries.length > 0 && (
        <section className="sk-section" aria-labelledby="search-recent-title">
          <div className="sk-section-head">
            <h2 id="search-recent-title">Buscas recentes</h2>
            <button type="button" className="sk-link" onClick={handleClear}>
              Limpar
            </button>
          </div>

          <div className="sk-chips" ref={chipsRef}>
            {entries.map((entry, index) => (
              <span key={entry.query} className="sp-recent-item">
                <a className="sk-chip" href={entry.href || `/search?q=${encodeURIComponent(entry.query)}`}>
                  {entry.label || entry.query}
                </a>

                <button
                  type="button"
                  aria-label={`Remover “${entry.label || entry.query}” dos recentes`}
                  onClick={() => handleRemove(entry.query, index)}
                >
                  <X size={14} />
                </button>
              </span>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
