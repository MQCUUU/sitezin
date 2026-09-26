import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import type {
  CharacterResult,
  CollectionResult,
  MediaResult,
  PersonResult,
  SearchState,
  SearchSuggestion,
  SearchTab,
  SuggestResponse,
  UserResult,
} from "./types";
import { getResultKey } from "./types";
import {
  addRecentSearch,
  readRecentSearches,
  removeRecentSearch,
  clearRecentSearches,
  type RecentSearchEntry,
} from "@/lib/search/recentSearches";

function suggestionToRecentEntry(item: SearchSuggestion): Omit<RecentSearchEntry, "timestamp"> {
  switch (item.kind) {
    case "media":
      return {
        query: item.title || item.name || "",
        label: item.title || item.name,
        type: "media",
        href: `/title/${item.media_type}/${item.id}`,
      };
    case "person":
      return { query: item.name, label: item.name, type: "person", href: item.href };
    case "character":
      return { query: item.name, label: item.name, type: "character", href: item.href };
    case "collection":
      return { query: item.name, label: item.name, type: "collection", href: item.href };
    case "user":
      return { query: `@${item.username}`, label: item.name, type: "user", href: item.href };
  }
}

/**
 * All the non-visual behavior behind the global search box: debounce,
 * two-layer caching, request cancellation, keyboard navigation and
 * submit routing. Extracted from components/Search.tsx (B1) — the
 * request semantics below are byte-for-byte the same as before the
 * split (260ms debounce, 2-char minimum, 15min memory + sessionStorage
 * cache, AbortController per keystroke).
 */
export function useSearchSuggestions() {
  const router = useRouter();

  const [searchTab, setSearchTab] = useState<SearchTab>("all");
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [focused, setFocused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  /*
   * B3.7 (Candidato 1): true from the moment a query reaches 2+ chars
   * until the 260ms debounce actually resolves (cache hit or fetch
   * settled). Folded into `searchState` below so the UI shows a
   * transitional/loading state through the whole debounce window instead
   * of momentarily reading `results.length === 0` as "no results" before
   * the timer has even fired.
   */
  const [pending, setPending] = useState(false);

  /*
   * Recent searches are read from localStorage only after mount (SSR has
   * no `window`) — starting at `[]` means the server-rendered markup and
   * the first client render match, so there's no hydration mismatch.
   */
  const [recentSearches, setRecentSearches] = useState<RecentSearchEntry[]>([]);

  useEffect(() => {
    setRecentSearches(readRecentSearches());
  }, []);

  function removeRecent(query: string) {
    setRecentSearches(removeRecentSearch(query));
  }

  function clearRecent() {
    setRecentSearches(clearRecentSearches());
  }

  const requestRef = useRef<AbortController | null>(null);
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suggestionCacheRef = useRef(
    new Map<string, { expiresAt: number; suggestions: SearchSuggestion[] }>()
  );

  useEffect(() => {
    if (q.trim().startsWith("@")) {
      setSearchTab("users");
    }
  }, [q]);

  /*
   * ==========================================
   * BUSCA UNIVERSAL INSTANTÂNEA
   * ==========================================
   *
   * A barra NÃO chama IA.
   *
   * /api/search/suggest combina:
   *
   * - títulos;
   * - pessoas;
   * - sobrenomes;
   * - typos;
   * - personagens indexados;
   * - coleções / franquias.
   *
   * A IA continua sendo responsabilidade
   * apenas da página /search, se necessário.
   */
  useEffect(() => {
    /*
     * Marca "pending" SINCRONAMENTE, no mesmo tick da mudança de `q` —
     * antes mesmo do timer de debounce abaixo ser agendado. É isso que
     * fecha a janela do flash: sem isso, entre o keystroke e o timer
     * disparar (260ms depois), `loading` continuava `false` e `results`
     * continuava do estado anterior (geralmente vazio), então
     * `searchState` calculava "no-results" incorretamente por ~260ms.
     */
    if (q.trim().length >= 2) {
      setPending(true);
    } else {
      setPending(false);
    }

    const timer = setTimeout(async () => {
      const query = q.trim();

      if (query.length < 2) {
        requestRef.current?.abort();
        setResults([]);
        setLoading(false);
        setError(false);
        setPending(false);
        setActiveIndex(-1);
        return;
      }

      /*
       * O debounce em si já terminou (estamos dentro do callback do
       * timer) — a partir daqui é cache/fetch, não mais "pending".
       */
      setPending(false);

      /*
       * Cancela a busca anterior de verdade.
       *
       * Ex.:
       * n -> no -> nol -> nolan
       */
      requestRef.current?.abort();

      const cacheKey = query
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase();
      const memoryCached = suggestionCacheRef.current.get(cacheKey);

      if (memoryCached && memoryCached.expiresAt > Date.now()) {
        setResults(memoryCached.suggestions);
        setLoading(false);
        setError(false);
        setActiveIndex(-1);
        return;
      }

      try {
        const stored = sessionStorage.getItem(`mycatalog:suggest:v1:${cacheKey}`);
        if (stored) {
          const cached = JSON.parse(stored);
          if (cached.expiresAt > Date.now() && Array.isArray(cached.suggestions)) {
            suggestionCacheRef.current.set(cacheKey, cached);
            setResults(cached.suggestions);
            setLoading(false);
            setError(false);
            setActiveIndex(-1);
            return;
          }
          sessionStorage.removeItem(`mycatalog:suggest:v1:${cacheKey}`);
        }
      } catch {
        // A busca continua normalmente quando o storage está indisponível.
      }

      const controller = new AbortController();
      requestRef.current = controller;

      try {
        setLoading(true);
        setError(false);

        const response = await fetch(
          `/api/search/suggest?q=${encodeURIComponent(query)}`,
          { signal: controller.signal }
        );

        if (!response.ok) {
          setResults([]);
          setError(true);
          return;
        }

        const data: SuggestResponse = await response.json();
        const normalized = Array.isArray(data.suggestions) ? data.suggestions : [];
        const suggestions = normalized.slice(0, 10);
        const cached = { expiresAt: Date.now() + 15 * 60 * 1000, suggestions };
        suggestionCacheRef.current.set(cacheKey, cached);
        try {
          sessionStorage.setItem(`mycatalog:suggest:v1:${cacheKey}`, JSON.stringify(cached));
        } catch {
          // Cache local é opcional.
        }
        setResults(suggestions);
        setActiveIndex(-1);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }

        console.error("Erro na busca universal:", err);
        setResults([]);
        setError(true);
      } finally {
        if (requestRef.current === controller) {
          setLoading(false);
          requestRef.current = null;
        }
      }
    }, 260);

    return () => {
      clearTimeout(timer);
      requestRef.current?.abort();
    };
  }, [q]);

  const mediaResults = useMemo(
    () => results.filter((item): item is MediaResult => item.kind === "media"),
    [results]
  );

  const userResults = useMemo(
    () =>
      ["movies", "actors"].includes(searchTab)
        ? []
        : results.filter((item): item is UserResult => item.kind === "user"),
    [results, searchTab]
  );

  const personResults = useMemo(
    () => results.filter((item): item is PersonResult => item.kind === "person"),
    [results]
  );

  const characterResults = useMemo(
    () => results.filter((item): item is CharacterResult => item.kind === "character"),
    [results]
  );

  const collectionResults = useMemo(
    () => results.filter((item): item is CollectionResult => item.kind === "collection"),
    [results]
  );

  /*
   * B3.7 (Candidato 2 — HIGH): single source of truth for "what's actually
   * navigable right now". Concatenates the same groups, in the same
   * order and under the same `searchTab` conditions, as the JSX in
   * Search.tsx renders them (Usuários → Personagem/Pessoas →
   * Franquias/Títulos). Keyboard nav, aria-activedescendant, aria-selected
   * and Enter all read from THIS array instead of the raw `results` —
   * previously they read `results` directly, so on a tab that hides most
   * kinds (e.g. "Atores": only characters+people), ArrowDown/Home/End
   * could set `aria-activedescendant` to an id that was never rendered in
   * that tab, and Enter could navigate to an item the user never saw.
   *
   * If the two render conditions below ever drift from Search.tsx's own,
   * this drifts back out of sync — they must be changed together.
   */
  const visibleResults = useMemo(() => {
    const visible: SearchSuggestion[] = [];

    if (!(searchTab === "movies" || searchTab === "actors")) {
      visible.push(...userResults);
    }

    if (searchTab === "all" || searchTab === "actors") {
      visible.push(...characterResults, ...personResults);
    }

    if (searchTab === "all" || searchTab === "movies") {
      visible.push(...collectionResults, ...mediaResults);
    }

    return visible;
  }, [searchTab, userResults, characterResults, personResults, collectionResults, mediaResults]);

  /*
   * Whenever the navigable set shrinks (tab switch, new results, query
   * change) such that `activeIndex` no longer points at a real, visible
   * option, drop it back to -1 instead of leaving it stale — this is what
   * makes an invalid `aria-activedescendant` impossible by construction.
   */
  useEffect(() => {
    setActiveIndex((current) => (current >= visibleResults.length ? -1 : current));
  }, [visibleResults]);

  const searchState: SearchState = useMemo(() => {
    if (q.trim().length < 2) return "idle";
    if (pending || loading) return "loading";
    if (error) return "error";
    if (results.length > 0) return "results";
    return "no-results";
  }, [q, pending, loading, error, results.length]);

  function clearSearch() {
    setSearchTab("all");
    setQ("");
    setResults([]);
    setError(false);
    setPending(false);
    setFocused(false);
    setActiveIndex(-1);
  }

  function getTitle(item: MediaResult) {
    return item.title || item.name || "Sem título";
  }

  function getYear(item: MediaResult) {
    return (item.release_date || item.first_air_date || "").slice(0, 4);
  }

  function getHref(item: SearchSuggestion) {
    if (item.kind === "media") {
      return `/title/${item.media_type}/${item.id}`;
    }
    return item.href;
  }

  /**
   * Recording strategy (B3 §5): a recent-search entry always represents
   * something the user can click to land back exactly where they just
   * went — either a specific suggestion they opened, or the full results
   * page for a typed query. Never recorded per keystroke, only on a
   * confirmed action (submit or picking a suggestion).
   */
  function recordSuggestion(item: SearchSuggestion) {
    setRecentSearches(addRecentSearch(suggestionToRecentEntry(item)));
  }

  function recordQuery(query: string) {
    setRecentSearches(
      addRecentSearch({ query, type: "query", href: `/search?q=${encodeURIComponent(query)}` })
    );
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    const query = q.trim();
    if (query.length < 2) {
      return;
    }

    /*
     * Se o usuário selecionou algo com
     * ↑ / ↓, Enter abre a sugestão.
     */
    if (activeIndex >= 0 && visibleResults[activeIndex]) {
      const item = visibleResults[activeIndex];
      recordSuggestion(item);
      clearSearch();
      router.push(getHref(item));
      return;
    }

    recordQuery(query);
    setResults([]);
    setFocused(false);

    /*
     * A página /search decide se precisa
     * de IA. A barra nunca decide isso.
     */
    router.push(`/search?q=${encodeURIComponent(query)}`);
  }

  function openRecent(entry: RecentSearchEntry) {
    setFocused(false);
    setQ("");

    if (entry.href) {
      router.push(entry.href);
      return;
    }

    router.push(`/search?q=${encodeURIComponent(entry.query)}`);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" && visibleResults.length > 0) {
      event.preventDefault();
      setActiveIndex((current) => Math.min(visibleResults.length - 1, current + 1));
      return;
    }

    if (event.key === "ArrowUp" && visibleResults.length > 0) {
      event.preventDefault();
      setActiveIndex((current) => Math.max(-1, current - 1));
      return;
    }

    if (event.key === "Home" && visibleResults.length > 0) {
      event.preventDefault();
      setActiveIndex(0);
      return;
    }

    if (event.key === "End" && visibleResults.length > 0) {
      event.preventDefault();
      setActiveIndex(visibleResults.length - 1);
      return;
    }

    if (event.key === "Escape") {
      setFocused(false);
      setActiveIndex(-1);
    }
  }

  function resultClass(item: SearchSuggestion) {
    const index = visibleResults.indexOf(item);
    return ["result", index === activeIndex ? "active" : ""].filter(Boolean).join(" ");
  }

  function resultId(item: SearchSuggestion) {
    return `search-option-${getResultKey(item)}`;
  }

  function onFormFocus() {
    if (blurTimerRef.current) {
      clearTimeout(blurTimerRef.current);
    }
    setFocused(true);
  }

  function onFormBlur() {
    blurTimerRef.current = setTimeout(() => {
      setFocused(false);
    }, 150);
  }

  const activeDescendantId =
    activeIndex >= 0 && visibleResults[activeIndex]
      ? resultId(visibleResults[activeIndex])
      : undefined;

  return {
    searchTab,
    setSearchTab,
    q,
    setQ,
    results,
    loading,
    error,
    searchState,
    focused,
    activeIndex,
    mediaResults,
    userResults,
    personResults,
    characterResults,
    collectionResults,
    clearSearch,
    getTitle,
    getYear,
    getHref,
    handleSubmit,
    handleKeyDown,
    resultClass,
    resultId,
    activeDescendantId,
    onFormFocus,
    onFormBlur,
    recentSearches,
    recordSuggestion,
    removeRecent,
    clearRecent,
    openRecent,
  };
}
