"use client";


import "@/styles/features/search-suggest.css";
import { useId } from "react";
import { Drama, Film, Layers3, UserRound, Users } from "lucide-react";

import { useSearchSuggestions } from "@/components/search/useSearchSuggestions";
import { SearchInput } from "@/components/search/SearchInput";
import { SearchEmptyState, SearchErrorState } from "@/components/search/SearchEmptyState";
import { SearchSuggestionGroup } from "@/components/search/SearchSuggestionGroup";
import { SearchMediaResult } from "@/components/search/SearchMediaResult";
import { SearchPersonResult } from "@/components/search/SearchPersonResult";
import { SearchUserResult } from "@/components/search/SearchUserResult";
import { SearchFranchiseResult } from "@/components/search/SearchFranchiseResult";
import { RecentSearches } from "@/components/search/RecentSearches";

/**
 * Global search box (topbar). B1 split this into:
 *   components/search/useSearchSuggestions.ts — all state/debounce/cache/abort
 *   components/search/SearchInput.tsx         — the <input> + combobox ARIA
 *   components/search/SearchEmptyState.tsx    — no-results / error prompts
 *   components/search/SearchSuggestionGroup.tsx — shared group header
 * B3 adds the idle state (RecentSearches) and splits each result kind into
 * its own row component (SearchMediaResult/SearchPersonResult/
 * SearchUserResult/SearchFranchiseResult) — a person no longer risks
 * looking like a MediaCard, a user no longer risks looking like a TMDB row.
 */
/**
 * Fase 2 (P2-05): `syncedQuery` — termo da URL na página /search (?q=), para o
 * campo vir preenchido e poder ser refinado. Nas outras telas, omitido.
 */
export function Search({ syncedQuery }: { syncedQuery?: string } = {}) {
  const listboxId = useId();
  const {
    searchTab,
    setSearchTab,
    q,
    setQ,
    loading,
    searchState,
    focused,
    errorKind,
    mediaResults,
    userResults,
    personResults,
    characterResults,
    collectionResults,
    groupOrder,
    getTitle,
    getYear,
    clearSearch,
    recordSuggestion,
    recentSearches,
    removeRecent,
    clearRecent,
    openRecent,
    handleSubmit,
    handleKeyDown,
    resultClass,
    resultId,
    activeDescendantId,
    onFormFocus,
    onFormBlur,
  } = useSearchSuggestions(syncedQuery);

  const trimmedQuery = q.trim();
  const dropdownOpen = focused && searchState !== "loading";

  return (
    <form className="search mc-search" onSubmit={handleSubmit} onFocus={onFormFocus} onBlur={onFormBlur}>
      <SearchInput
        q={q}
        onChange={setQ}
        onKeyDown={handleKeyDown}
        loading={loading}
        expanded={dropdownOpen}
        listboxId={listboxId}
        hasListbox={searchState !== "idle"}
        activeDescendantId={activeDescendantId}
      />

      {focused && searchState === "idle" && (
        <div className="results mc-search-dropdown" id={listboxId}>
          <RecentSearches
            entries={recentSearches}
            onOpen={openRecent}
            onRemove={removeRecent}
            onClear={clearRecent}
          />
        </div>
      )}

      {focused && searchState === "no-results" && (
        <SearchEmptyState query={trimmedQuery} listboxId={listboxId} optionId={`${listboxId}-empty`} />
      )}

      {focused && searchState === "error" && <SearchErrorState listboxId={listboxId} kind={errorKind} />}

      {focused && searchState === "results" && (
        <div className="results universal-search-results mc-search-dropdown">
          {/* V3.2: abas e rodapé FORA do listbox (ARIA: listbox só contém opções). */}
          <div className="search-result-tabs" role="tablist" aria-label="Tipo de resultado">
            <button
              type="button"
              role="tab"
              aria-selected={searchTab === "all"}
              className={searchTab === "all" ? "active" : ""}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => setSearchTab("all")}
            >
              Todos
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={searchTab === "movies"}
              className={searchTab === "movies" ? "active" : ""}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => setSearchTab("movies")}
            >
              Títulos
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={searchTab === "actors"}
              className={searchTab === "actors" ? "active" : ""}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => setSearchTab("actors")}
            >
              Pessoas
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={searchTab === "users"}
              className={searchTab === "users" ? "active" : ""}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => setSearchTab("users")}
            >
              Usuários
            </button>
          </div>

          <div role="listbox" id={listboxId} aria-label="Sugestões">
          {/* Fase 2 (P2-04): grupos na ordem de relevância (mesma ordem do teclado — groupOrder). */}
          {groupOrder.map((kind) => {
            switch (kind) {
              case "user":
                return userResults.length > 0 && (
                  <SearchSuggestionGroup key="user" icon={<Users size={12} />} label="Usuários">
                    {userResults.map((item) => (
                      <SearchUserResult
                        key={`user-${item.id}`}
                        item={item}
                        className={resultClass(item)}
                        id={resultId(item)}
                        ariaSelected={resultId(item) === activeDescendantId}
                        onOpen={() => {
                          recordSuggestion(item);
                          clearSearch();
                        }}
                      />
                    ))}
                  </SearchSuggestionGroup>
                );
              case "character":
                return characterResults.length > 0 && (
                  <SearchSuggestionGroup key="character" icon={<Drama size={12} />} label="Personagem">
                    {characterResults.map((item) => (
                      <SearchPersonResult
                        key={`character-${item.name}-${item.matched}`}
                        item={item}
                        className={resultClass(item)}
                        id={resultId(item)}
                        ariaSelected={resultId(item) === activeDescendantId}
                        onOpen={() => {
                          recordSuggestion(item);
                          clearSearch();
                        }}
                      />
                    ))}
                  </SearchSuggestionGroup>
                );
              case "person":
                return personResults.length > 0 && (
                  <SearchSuggestionGroup key="person" icon={<UserRound size={12} />} label="Pessoas">
                    {personResults.map((item) => (
                      <SearchPersonResult
                        key={`person-${item.id}`}
                        item={item}
                        className={resultClass(item)}
                        id={resultId(item)}
                        ariaSelected={resultId(item) === activeDescendantId}
                        onOpen={() => {
                          recordSuggestion(item);
                          clearSearch();
                        }}
                      />
                    ))}
                  </SearchSuggestionGroup>
                );
              case "collection":
                return collectionResults.length > 0 && (
                  <SearchSuggestionGroup key="collection" icon={<Layers3 size={12} />} label="Franquias">
                    {collectionResults.map((item) => (
                      <SearchFranchiseResult
                        key={`collection-${item.id}`}
                        item={item}
                        className={resultClass(item)}
                        id={resultId(item)}
                        ariaSelected={resultId(item) === activeDescendantId}
                        onOpen={() => {
                          recordSuggestion(item);
                          clearSearch();
                        }}
                      />
                    ))}
                  </SearchSuggestionGroup>
                );
              case "media":
                return mediaResults.length > 0 && (
                  <SearchSuggestionGroup key="media" icon={<Film size={12} />} label="Títulos">
                    {mediaResults.map((item) => (
                      <SearchMediaResult
                        key={`${item.media_type}-${item.id}`}
                        item={item}
                        title={getTitle(item)}
                        year={getYear(item)}
                        className={resultClass(item)}
                        id={resultId(item)}
                        ariaSelected={resultId(item) === activeDescendantId}
                        onOpen={() => {
                          recordSuggestion(item);
                          clearSearch();
                        }}
                      />
                    ))}
                  </SearchSuggestionGroup>
                );
            }
          })}

          </div>

          <div className="mc-search-footer">
            <button type="submit" className="search-see-all">
              Ver todos os resultados para “{trimmedQuery}”
            </button>

            <span className="mc-search-kbd-hint" aria-hidden="true">
              <kbd>↑</kbd><kbd>↓</kbd> navegar <kbd>↵</kbd> abrir <kbd>Esc</kbd> fechar
            </span>
          </div>
        </div>
      )}
    </form>
  );
}
