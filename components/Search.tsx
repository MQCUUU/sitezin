"use client";

import { useId } from "react";
import { Star, Film, Tv, UserRound, Drama, Layers3, ArrowRight, Users } from "lucide-react";
import { img } from "@/lib/tmdb";
import Link from "next/link";

import { useSearchSuggestions } from "@/components/search/useSearchSuggestions";
import { SearchInput } from "@/components/search/SearchInput";
import { SearchEmptyState, SearchErrorState } from "@/components/search/SearchEmptyState";
import { SearchSuggestionGroup } from "@/components/search/SearchSuggestionGroup";

/**
 * Global search box (topbar). B1 split this into:
 *   components/search/useSearchSuggestions.ts — all state/debounce/cache/abort
 *   components/search/SearchInput.tsx         — the <input> + combobox ARIA
 *   components/search/SearchEmptyState.tsx    — no-results / error prompts
 *   components/search/SearchSuggestionGroup.tsx — shared group header
 * This file is now composition + the per-kind result row markup, which
 * only renders once each and wasn't worth its own component.
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
    handleSubmit,
    handleKeyDown,
    resultClass,
    resultId,
    activeDescendantId,
    onFormFocus,
    onFormBlur,
  } = useSearchSuggestions();

  const trimmedQuery = q.trim();
  const dropdownOpen =
    focused && (searchState === "results" || searchState === "no-results" || searchState === "error");

  return (
    <form className="search" onSubmit={handleSubmit} onFocus={onFormFocus} onBlur={onFormBlur}>
      <SearchInput
        q={q}
        onChange={setQ}
        onKeyDown={handleKeyDown}
        loading={loading}
        expanded={dropdownOpen}
        listboxId={listboxId}
        activeDescendantId={activeDescendantId}
      />

      {focused && searchState === "no-results" && (
        <SearchEmptyState query={trimmedQuery} listboxId={listboxId} optionId={`${listboxId}-empty`} />
      )}

      {focused && searchState === "error" && <SearchErrorState listboxId={listboxId} />}

      {focused && searchState === "results" && (
        <div className="results universal-search-results" role="listbox" id={listboxId}>
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
                <Link
                  className={resultClass(item)}
                  href={item.href}
                  onClick={clearSearch}
                  key={`user-${item.id}`}
                  role="option"
                  id={resultId(item)}
                  aria-selected={resultId(item) === activeDescendantId}
                >
                  <div className="search-result-poster search-result-person">
                    {item.avatar_url ? (
                      <img src={item.avatar_url} alt={item.name} />
                    ) : (
                      <div className="search-result-poster-empty">
                        <UserRound size={20} />
                      </div>
                    )}
                  </div>
                  <div className="search-result-info">
                    <b>{item.name}</b>
                    <div className="muted">@{item.username} · Ver perfil</div>
                  </div>
                  <ArrowRight size={14} />
                </Link>
              ))}
            </SearchSuggestionGroup>
          )}

          {(searchTab === "all" || searchTab === "actors") && characterResults.length > 0 && (
            <SearchSuggestionGroup icon={<Drama size={12} />} label="Personagem">
              {characterResults.map((item) => (
                <Link
                  className={resultClass(item)}
                  href={item.href}
                  onClick={clearSearch}
                  key={`character-${item.name}-${item.matched}`}
                  role="option"
                  id={resultId(item)}
                  aria-selected={resultId(item) === activeDescendantId}
                >
                  <div className="search-result-poster search-result-person">
                    {item.poster_path ? (
                      <img loading="lazy" decoding="async" src={img(item.poster_path, "w92")} alt={item.name} />
                    ) : (
                      <div className="search-result-poster-empty">
                        <Drama size={20} />
                      </div>
                    )}
                  </div>
                  <div className="search-result-info">
                    <b>{item.name}</b>
                    <div className="muted">
                      {item.count} {item.count === 1 ? "título encontrado" : "títulos encontrados"} · Personagem
                    </div>
                  </div>
                  <ArrowRight size={14} />
                </Link>
              ))}
            </SearchSuggestionGroup>
          )}

          {(searchTab === "all" || searchTab === "actors") && personResults.length > 0 && (
            <SearchSuggestionGroup icon={<UserRound size={12} />} label="Pessoas">
              {personResults.map((item) => (
                <Link
                  className={resultClass(item)}
                  href={item.href}
                  onClick={clearSearch}
                  key={`person-${item.id}`}
                  role="option"
                  id={resultId(item)}
                  aria-selected={resultId(item) === activeDescendantId}
                >
                  <div className="search-result-poster search-result-person">
                    {item.profile_path ? (
                      <img loading="lazy" decoding="async" src={img(item.profile_path, "w92")} alt={item.name} />
                    ) : (
                      <div className="search-result-poster-empty">
                        <UserRound size={20} />
                      </div>
                    )}
                  </div>
                  <div className="search-result-info">
                    <b>{item.name}</b>
                    <div className="muted">{item.known_for_department || "Cinema e TV"} · Ver trabalhos</div>
                  </div>
                  <ArrowRight size={14} />
                </Link>
              ))}
            </SearchSuggestionGroup>
          )}

          {(searchTab === "all" || searchTab === "movies") && collectionResults.length > 0 && (
            <SearchSuggestionGroup icon={<Layers3 size={12} />} label="Franquias">
              {collectionResults.map((item) => (
                <Link
                  className={resultClass(item)}
                  href={item.href}
                  onClick={clearSearch}
                  key={`collection-${item.id}`}
                  role="option"
                  id={resultId(item)}
                  aria-selected={resultId(item) === activeDescendantId}
                >
                  <div className="search-result-poster">
                    {item.poster_path ? (
                      <img loading="lazy" decoding="async" src={img(item.poster_path, "w92")} alt={item.name} />
                    ) : (
                      <div className="search-result-poster-empty">
                        <Layers3 size={20} />
                      </div>
                    )}
                  </div>
                  <div className="search-result-info">
                    <b>{item.name}</b>
                    <div className="muted">Coleção / franquia</div>
                  </div>
                  <ArrowRight size={14} />
                </Link>
              ))}
            </SearchSuggestionGroup>
          )}

          {(searchTab === "all" || searchTab === "movies") && mediaResults.length > 0 && (
            <SearchSuggestionGroup icon={<Film size={12} />} label="Títulos">
              {mediaResults.map((item) => {
                const title = getTitle(item);
                const year = getYear(item);
                const isMovie = item.media_type === "movie";

                return (
                  <Link
                    className={resultClass(item)}
                    href={`/title/${item.media_type}/${item.id}`}
                    onClick={clearSearch}
                    key={`${item.media_type}-${item.id}`}
                    role="option"
                    id={resultId(item)}
                    aria-selected={resultId(item) === activeDescendantId}
                  >
                    <div className="search-result-poster">
                      {item.poster_path ? (
                        <img loading="lazy" decoding="async" src={img(item.poster_path, "w92")} alt={title} />
                      ) : (
                        <div className="search-result-poster-empty">
                          {isMovie ? <Film size={20} /> : <Tv size={20} />}
                        </div>
                      )}
                    </div>
                    <div className="search-result-info">
                      <b>{title}</b>
                      <div className="muted">
                        {year || "Ano desconhecido"} · {isMovie ? "Filme" : "Série"}
                        {item.reason ? ` · ${item.reason}` : ""}
                        {typeof item.vote_average === "number" && item.vote_average > 0 && (
                          <>
                            {" · "}
                            <Star size={11} fill="currentColor" /> {item.vote_average.toFixed(1)}
                          </>
                        )}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </SearchSuggestionGroup>
          )}

          <button type="submit" className="search-see-all">
            Ver todos os resultados para “{trimmedQuery}”
          </button>
        </div>
      )}
    </form>
  );
}
