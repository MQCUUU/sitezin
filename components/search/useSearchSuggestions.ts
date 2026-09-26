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
    const timer = setTimeout(async () => {
      const query = q.trim();

      if (query.length < 2) {
        requestRef.current?.abort();
        setResults([]);
        setLoading(false);
        setError(false);
        setActiveIndex(-1);
        return;
      }

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

  const searchState: SearchState = useMemo(() => {
    if (q.trim().length < 2) return "idle";
    if (loading) return "loading";
    if (error) return "error";
    if (results.length > 0) return "results";
    return "no-results";
  }, [q, loading, error, results.length]);

  function clearSearch() {
    setSearchTab("all");
    setQ("");
    setResults([]);
    setError(false);
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
    if (activeIndex >= 0 && results[activeIndex]) {
      const item = results[activeIndex];
      clearSearch();
      router.push(getHref(item));
      return;
    }

    setResults([]);
    setFocused(false);

    /*
     * A página /search decide se precisa
     * de IA. A barra nunca decide isso.
     */
    router.push(`/search?q=${encodeURIComponent(query)}`);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" && results.length > 0) {
      event.preventDefault();
      setActiveIndex((current) => Math.min(results.length - 1, current + 1));
      return;
    }

    if (event.key === "ArrowUp" && results.length > 0) {
      event.preventDefault();
      setActiveIndex((current) => Math.max(-1, current - 1));
      return;
    }

    if (event.key === "Escape") {
      setFocused(false);
      setActiveIndex(-1);
    }
  }

  function resultClass(item: SearchSuggestion) {
    const index = results.indexOf(item);
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
    activeIndex >= 0 && results[activeIndex] ? resultId(results[activeIndex]) : undefined;

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
  };
}
