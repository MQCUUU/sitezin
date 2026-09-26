"use client";

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
export function Search() {
  const listboxId = useId();
  const {
    searchTab,
    setSearchTab,
    q,
    setQ,
    loading,
    searchState,
    focused,
    mediaResults,
    userResults,
    personResults,
    characterResults,
    collectionResults,
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
  } = useSearchSuggestions();

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

      {focused && searchState === "error" && <SearchErrorState listboxId={listboxId} />}

      {focused && searchState === "results" && (
        <div className="results universal-search-results mc-search-dropdown" role="listbox" id={listboxId}>
          <div className="search-result-tabs" role="tablist">
            <button
              type="button"
              className={searchTab === "all" ? "active" : ""}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => setSearchTab("all")}
            >
              Todos
            </button>
            <button
              type="button"
              className={searchTab === "movies" ? "active" : ""}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => setSearchTab("movies")}
            >
              Filmes
            </button>
            <button
              type="button"
              className={searchTab === "actors" ? "active" : ""}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => setSearchTab("actors")}
            >
              Atores
            </button>
            <button
              type="button"
              className={searchTab === "users" ? "active" : ""}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => setSearchTab("users")}
            >
              Usuários
            </button>
          </div>

          {userResults.length > 0 && (
            <SearchSuggestionGroup icon={<Users size={12} />} label="Usuários">
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
          )}

          {(searchTab === "all" || searchTab === "actors") && characterResults.length > 0 && (
            <SearchSuggestionGroup icon={<Drama size={12} />} label="Personagem">
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
          )}

          {(searchTab === "all" || searchTab === "actors") && personResults.length > 0 && (
            <SearchSuggestionGroup icon={<UserRound size={12} />} label="Pessoas">
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
          )}

          {(searchTab === "all" || searchTab === "movies") && collectionResults.length > 0 && (
            <SearchSuggestionGroup icon={<Layers3 size={12} />} label="Franquias">
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
          )}

          {(searchTab === "all" || searchTab === "movies") && mediaResults.length > 0 && (
            <SearchSuggestionGroup icon={<Film size={12} />} label="Títulos">
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
          )}

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
