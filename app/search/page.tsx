"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

import { Search } from "@/components/Search";
import { useToast } from "@/components/ToastProvider";

import {
  SearchAdvancedPanel,
  SearchMediaSection,
  SearchPageEmptyState,
  SearchPageErrorState,
  SearchPageHeader,
  SearchPageIdleState,
  SearchPersonPanel,
  SearchRemoveDialog,
  SearchResultsSkeleton,
  SearchUserSection,
  getTitle,
  type AdvancedMeta,
  type LibraryState,
  type SearchItem,
  type UserSearchResult,
} from "@/components/search/page";

import { MediaPreviewDialog } from "@/components/media/preview/MediaPreviewDialog";
import { WatchProviderList } from "@/components/media/preview/WatchProviderList";
import { fromSearchItem } from "@/components/media/preview/adapters";
import { normalizeWatchProviders } from "@/components/media/providers";

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function findStrongPersonMatch(query: string, rawResults: any[]) {
  const normalizedQuery = normalizeText(query);
  const people = rawResults.filter((item) => item.media_type === "person");

  const exact = people.find((person) => normalizeText(person.name || "") === normalizedQuery);
  if (exact) return exact;

  const words = normalizedQuery.split(" ").filter(Boolean);
  if (words.length >= 2) {
    return (
      people.find((person) => {
        const name = normalizeText(person.name || "");
        return name.includes(normalizedQuery) || normalizedQuery.includes(name);
      }) || null
    );
  }

  return null;
}

async function safeJson(response: Response) {
  const type = response.headers.get("content-type") || "";

  if (!type.includes("application/json")) {
    const text = await response.text();
    throw new Error(
      `A rota ${response.url} não retornou JSON (${response.status}). ${
        text.startsWith("<!DOCTYPE") ? "Provavelmente retornou uma página 404/HTML." : ""
      }`
    );
  }

  return response.json();
}

const SEARCH_CACHE_TTL = 30 * 60 * 1000;

type StoredSearchResponse = { expiresAt: number; data: any };

/*
 * sessionStorage sobrevive ao F5, ao contrário de um cache React/em memória.
 * Os endpoints abaixo só devolvem dados públicos do catálogo, portanto é
 * seguro reaproveitá-los durante a sessão da aba.
 */
async function cachedSearchJson(url: string, signal: AbortSignal) {
  const key = `mycatalog:search:v1:${url}`;

  try {
    const stored = sessionStorage.getItem(key);
    if (stored) {
      const cached = JSON.parse(stored) as StoredSearchResponse;
      if (cached.expiresAt > Date.now()) return cached.data;
      sessionStorage.removeItem(key);
    }
  } catch {
    // Storage bloqueado/cheio não pode impedir a pesquisa.
  }

  const response = await fetch(url, { signal });
  const data = await safeJson(response);

  if (response.ok) {
    try {
      sessionStorage.setItem(
        key,
        JSON.stringify({ expiresAt: Date.now() + SEARCH_CACHE_TTL, data } satisfies StoredSearchResponse)
      );
    } catch {
      // O resultado continua válido mesmo sem cache local.
    }
  }

  return data;
}

export default function SearchPage() {
  return (
    <Suspense
      fallback={
        <>
          <div className="topbar">
            <Search />
          </div>
          <section className="section">
            <SearchResultsSkeleton />
          </section>
        </>
      }
    >
      <SearchPageContent />
    </Suspense>
  );
}

function SearchPageContent() {
  const toast = useToast();
  const searchParams = useSearchParams();
  const query = searchParams.get("q")?.trim() || "";

  const [results, setResults] = useState<SearchItem[]>([]);
  const [userResults, setUserResults] = useState<UserSearchResult[]>([]);
  const [library, setLibrary] = useState<LibraryState[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retryTick, setRetryTick] = useState(0);

  /*
   * B3.7 (LOW — continuidade de foco): Retry desaparece assim que os
   * resultados voltam, então o foco precisa de um destino explícito em
   * vez de cair em <body>. Mesmo padrão do Discover (B2.6): um heading
   * focável programaticamente (tabIndex=-1, fora da ordem normal de Tab)
   * logo acima da área de resultados.
   */
  const resultsSummaryRef = useRef<HTMLHeadingElement>(null);
  const focusResultsSummaryRef = useRef(false);

  function handleRetry() {
    focusResultsSummaryRef.current = true;
    setRetryTick((tick) => tick + 1);
  }

  useEffect(() => {
    if (loading) return;
    if (!focusResultsSummaryRef.current) return;

    focusResultsSummaryRef.current = false;
    resultsSummaryRef.current?.focus();
  }, [loading]);

  /*
   * Focus restore on close (B3.7) now comes for free from
   * `MediaPreviewDialog`'s underlying `Dialog`, which captures
   * `document.activeElement` on open and restores it on close (C2.2) —
   * no manual trigger ref needed anymore.
   */
  function openPreview(item: SearchItem) {
    setPreviewItem(item);
  }

  function closePreview() {
    setPreviewItem(null);
  }

  const [personLoading, setPersonLoading] = useState(false);
  const [processing, setProcessing] = useState<string | null>(null);

  const [person, setPerson] = useState<any>(null);
  const [personCredits, setPersonCredits] = useState<SearchItem[]>([]);

  const [advancedMeta, setAdvancedMeta] = useState<AdvancedMeta>({
    used: false,
    mode: "",
    title: "",
    subtitle: "",
  });
  const [advancedLoading, setAdvancedLoading] = useState(false);

  const [openLibraryMenu, setOpenLibraryMenu] = useState<string | null>(null);
  const [previewItem, setPreviewItem] = useState<SearchItem | null>(null);
  const [previewDetails, setPreviewDetails] = useState<any>(null);
  const [previewDetailsLoading, setPreviewDetailsLoading] = useState(false);

  const [removeTarget, setRemoveTarget] = useState<SearchItem | null>(null);
  const [skipRemoveConfirm, setSkipRemoveConfirm] = useState(false);

  useEffect(() => {
    try {
      setSkipRemoveConfirm(localStorage.getItem("mycatalog_skip_remove_confirm") === "1");
    } catch {
      // localStorage indisponível
    }
  }, []);

  /*
   * Fecha menu de status clicando
   * em qualquer outro lugar da tela.
   */
  useEffect(() => {
    if (openLibraryMenu === null) return;

    function outside(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;

      if (
        target.closest(".discover-library-menu-button") ||
        target.closest(".discover-library-status-menu")
      ) {
        return;
      }

      setOpenLibraryMenu(null);
    }

    document.addEventListener("mousedown", outside);
    return () => document.removeEventListener("mousedown", outside);
  }, [openLibraryMenu]);

  /*
   * Remove confirm dialog only — the Quick Peek's Escape/scroll lock now
   * comes from `MediaPreviewDialog`'s underlying `Dialog` (C2.2).
   */
  useEffect(() => {
    if (!removeTarget) return;

    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setRemoveTarget(null);
      }
    }

    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [removeTarget]);

  /*
   * Streaming, gêneros e detalhes
   * só carregam ao abrir o olhinho.
   */
  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!previewItem) {
        setPreviewDetails(null);
        return;
      }

      try {
        setPreviewDetailsLoading(true);

        const response = await fetch(`/api/tmdb/${previewItem.media_type}/${previewItem.id}`);
        const data = await safeJson(response);

        if (!response.ok || data?.error) {
          throw new Error(data?.error || "Erro ao carregar detalhes.");
        }

        if (!cancelled) setPreviewDetails(data);
      } catch (error) {
        console.error("Preview:", error);
        if (!cancelled) setPreviewDetails(null);
      } finally {
        if (!cancelled) setPreviewDetailsLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [previewItem?.id, previewItem?.media_type]);

  /*
   * ==========================================
   * CARREGAMENTO DA BIBLIOTECA
   * ==========================================
   */
  useEffect(() => {
    const controller = new AbortController();

    async function loadLibrary() {
      try {
        const response = await fetch("/api/library", { cache: "no-store", signal: controller.signal });
        if (!response.ok) return;

        const data = await safeJson(response);
        if (!Array.isArray(data)) return;

        setLibrary(
          data
            .filter((item: any) => item.media?.tmdb_id && item.media?.media_type)
            .map((item: any) => ({
              library_id: String(item.id),
              tmdb_id: Number(item.media.tmdb_id),
              media_type: item.media.media_type,
              favorite: Boolean(item.favorite),
              status: item.status || null,
              personal_rating:
                item.personal_rating === null || item.personal_rating === undefined
                  ? null
                  : Number(item.personal_rating),
            }))
        );
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          console.error("Biblioteca da pesquisa:", error);
        }
      }
    }

    loadLibrary();
    return () => controller.abort();
  }, []);

  /*
   * ==========================================
   * CARREGAMENTO DA PESQUISA
   * ==========================================
   */
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    if (!query) {
      setResults([]);
      setUserResults([]);
      setLoading(false);
      setError(false);
      return;
    }

    async function load() {
      try {
        setLoading(true);
        setError(false);
        setPersonLoading(false);
        setPerson(null);
        setPersonCredits([]);
        setAdvancedMeta({ used: false, mode: "", title: "", subtitle: "" });
        setAdvancedLoading(false);

        const usersOnly = query.startsWith("@");
        const catalogQuery = query.replace(/^@+/, "").trim();
        const [searchData, advancedData, usersData] = await Promise.all([
          usersOnly
            ? Promise.resolve({ results: [] })
            : cachedSearchJson(`/api/search?q=${encodeURIComponent(catalogQuery)}`, controller.signal),
          usersOnly
            ? Promise.resolve({ handled: false, results: [] })
            : cachedSearchJson(`/api/search/advanced?q=${encodeURIComponent(catalogQuery)}`, controller.signal),
          cachedSearchJson(`/api/search/users?q=${encodeURIComponent(query)}`, controller.signal),
        ]);

        setUserResults(Array.isArray(usersData?.users) ? usersData.users : []);

        const rawResults = Array.isArray(searchData?.results) ? searchData.results : [];
        const normalResults = rawResults.filter(
          (item: any) => item.media_type === "movie" || item.media_type === "tv"
        ) as SearchItem[];

        if (cancelled) return;

        setResults(normalResults);

        /*
         * O resolvedor local precisa decidir antes do fallback
         * de pessoa do TMDB. Sem isso, um profissional obscuro
         * com o mesmo nome do personagem encerra a busca cedo.
         */
        if (
          !cancelled &&
          !advancedData?.error &&
          advancedData?.handled &&
          Array.isArray(advancedData.results) &&
          advancedData.results.length > 0
        ) {
          const advancedResults = advancedData.results.filter(
            (item: any) => item.media_type === "movie" || item.media_type === "tv"
          );

          if (advancedResults.length > 0) {
            setResults(advancedResults);
            setAdvancedMeta({
              used: true,
              mode: advancedData.mode || "",
              title: advancedData.title || "Busca avançada",
              subtitle: advancedData.subtitle || "Resultados encontrados pelo índice local.",
              person: advancedData.person || null,
              collection: advancedData.collection || null,
            });
            setAdvancedLoading(false);
            return;
          }
        }

        /*
         * PESSOAS: 100% TMDB.
         */
        const personMatch = findStrongPersonMatch(query, rawResults);

        if (personMatch && !cancelled) {
          try {
            setPersonLoading(true);

            const response = await fetch(`/api/person/${personMatch.id}/credits`, {
              signal: controller.signal,
            });
            const data = await safeJson(response);

            if (response.ok && !data?.error) {
              const credits = Array.isArray(data.results) ? data.results : [];
              setPerson(data.person || personMatch);
              setPersonCredits(credits);
              setResults(credits);
              return;
            }
          } finally {
            if (!cancelled) setPersonLoading(false);
          }
        }

        /*
         * ======================================
         * BUSCA AVANÇADA TMDB — ZERO IA
         * ======================================
         *
         * diretor Christopher Nolan
         * filmes com Zendaya
         * coleção Harry Potter
         * filmes de terror 2024 nota 7+
         * filmes de ação na Netflix
         */
        try {
          setAdvancedLoading(true);

          if (
            !cancelled &&
            !advancedData?.error &&
            advancedData?.handled &&
            Array.isArray(advancedData.results) &&
            advancedData.results.length > 0
          ) {
            const advancedResults = advancedData.results.filter(
              (item: any) => item.media_type === "movie" || item.media_type === "tv"
            );

            if (advancedResults.length > 0) {
              setResults(advancedResults);
              setAdvancedMeta({
                used: true,
                mode: advancedData.mode || "",
                title: advancedData.title || "Busca avançada",
                subtitle: advancedData.subtitle || "Resultados encontrados diretamente no TMDB.",
                person: advancedData.person || null,
                collection: advancedData.collection || null,
              });

              /*
               * Busca avançada resolveu:
               * NÃO chama Gemini.
               */
              return;
            }
          }
        } catch (error) {
          console.error("Busca avançada:", error);
        } finally {
          if (!cancelled) setAdvancedLoading(false);
        }

        // A busca comum termina aqui. IA fica exclusiva da pagina Assistente IA.
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        console.error("Pesquisa:", error);

        if (!cancelled) {
          setResults([]);
          setUserResults([]);
          setError(true);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          setPersonLoading(false);
          setAdvancedLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [query, retryTick]);

  function getLibraryItem(item: SearchItem) {
    return library.find(
      (entry) => entry.tmdb_id === Number(item.id) && entry.media_type === item.media_type
    );
  }

  function patchLibraryState(item: SearchItem, patch: Partial<LibraryState>) {
    setLibrary((current) =>
      current.map((entry) =>
        entry.tmdb_id === Number(item.id) && entry.media_type === item.media_type
          ? { ...entry, ...patch }
          : entry
      )
    );
  }

  /*
   * ==========================================
   * ADICIONAR
   * ==========================================
   */
  async function addToLibrary(item: SearchItem) {
    const key = `${item.media_type}-${item.id}`;

    try {
      setProcessing(key);

      /*
       * Busca os detalhes completos antes de
       * salvar, assim gêneros etc. também ficam
       * corretos no item adicionado pela pesquisa.
       */
      let media: SearchItem = item;

      try {
        const detailResponse = await fetch(`/api/tmdb/${item.media_type}/${item.id}`);
        if (detailResponse.ok) {
          const detail = await safeJson(detailResponse);
          media = { ...item, ...detail, id: item.id, media_type: item.media_type };
        }
      } catch {
        // Usa o item da busca como fallback.
      }

      const response = await fetch("/api/library", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          media: {
            ...media,
            media_type: item.media_type,
            title: media.title || media.name || getTitle(item),
            original_title: media.original_title || media.original_name || getTitle(item),
            genres: media.genres || [],
          },
          status: "want",
          favorite: false,
        }),
      });

      const data = await safeJson(response);

      if (!response.ok || data?.error) {
        throw new Error(data?.error || "Não foi possível adicionar.");
      }

      setLibrary((current) => [
        ...current.filter(
          (entry) => !(entry.tmdb_id === Number(item.id) && entry.media_type === item.media_type)
        ),
        {
          library_id: String(data.id),
          tmdb_id: Number(item.id),
          media_type: item.media_type,
          favorite: Boolean(data.favorite),
          status: data.status || "want",
          personal_rating: data.personal_rating ?? null,
        },
      ]);
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Erro ao adicionar.");
    } finally {
      setProcessing(null);
    }
  }

  /*
   * ==========================================
   * STATUS
   * ==========================================
   */
  async function updateStatus(item: SearchItem, nextStatus: string) {
    const existing = getLibraryItem(item);
    if (!existing) return;

    const key = `${item.media_type}-${item.id}`;

    try {
      setProcessing(key);

      const response = await fetch(`/api/library/${existing.library_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });

      const data = await safeJson(response);

      if (!response.ok || data?.error) {
        throw new Error(data?.error || "Não foi possível alterar o status.");
      }

      patchLibraryState(item, { status: data.status || nextStatus });
      setOpenLibraryMenu(null);
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Erro ao alterar status.");
    } finally {
      setProcessing(null);
    }
  }

  /*
   * ==========================================
   * FAVORITO
   * ==========================================
   */
  async function toggleFavorite(item: SearchItem) {
    const existing = getLibraryItem(item);
    if (!existing) return;

    const next = !existing.favorite;
    const key = `${item.media_type}-${item.id}`;

    try {
      setProcessing(key);

      const response = await fetch(`/api/library/${existing.library_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ favorite: next }),
      });

      const data = await safeJson(response);

      if (!response.ok || data?.error) {
        throw new Error(data?.error || "Não foi possível atualizar a curtida.");
      }

      patchLibraryState(item, { favorite: data.favorite ?? next });
    } finally {
      setProcessing(null);
    }
  }

  /*
   * ==========================================
   * MINHA NOTA PELO OLHINHO
   * ==========================================
   */
  async function updateRating(item: SearchItem, rating: number | null) {
    const existing = getLibraryItem(item);
    if (!existing) return;

    const key = `${item.media_type}-${item.id}`;

    try {
      setProcessing(key);

      const response = await fetch(`/api/library/${existing.library_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personal_rating: rating }),
      });

      const data = await safeJson(response);

      if (!response.ok || data?.error) {
        throw new Error(data?.error || "Não foi possível alterar sua nota.");
      }

      patchLibraryState(item, { personal_rating: rating });
    } finally {
      setProcessing(null);
    }
  }

  /*
   * ==========================================
   * REMOVER + MODAL PADRÃO
   * ==========================================
   */
  function requestRemove(item: SearchItem) {
    if (skipRemoveConfirm) {
      performRemove(item);
      return;
    }

    setRemoveTarget(item);
    setOpenLibraryMenu(null);
  }

  async function performRemove(item: SearchItem) {
    const existing = getLibraryItem(item);
    if (!existing) return;

    const key = `${item.media_type}-${item.id}`;

    try {
      setProcessing(key);

      const response = await fetch(`/api/library/${existing.library_id}`, { method: "DELETE" });
      const data = await safeJson(response);

      if (!response.ok || data?.error) {
        throw new Error(data?.error || "Não foi possível remover.");
      }

      setLibrary((current) => current.filter((entry) => entry.library_id !== existing.library_id));
      setRemoveTarget(null);
      setOpenLibraryMenu(null);
    } finally {
      setProcessing(null);
    }
  }

  const movies = results.filter((item) => item.media_type === "movie");
  const series = results.filter((item) => item.media_type === "tv");
  const isBusy = loading || personLoading || advancedLoading;

  return (
    <>
      <div className="topbar">
        <Search />
      </div>

      <div className="section search-page-shell">
        {query ? (
          <SearchPageHeader query={query} isPerson={Boolean(person)} />
        ) : (
          <>
            <div className="eyebrow">Pesquisa</div>
            <h1>Pesquisar</h1>
          </>
        )}

        {person && <SearchPersonPanel person={person} creditsCount={personCredits.length} />}

        {advancedMeta.used && <SearchAdvancedPanel meta={advancedMeta} />}

        {query && !isBusy && (
          <h2 ref={resultsSummaryRef} tabIndex={-1} className="mc-discover-results-summary">
            {error
              ? "Não foi possível carregar os resultados"
              : results.length === 0 && userResults.length === 0
                ? "Nenhum resultado encontrado"
                : `${results.length + userResults.length} resultados para "${query}"`}
          </h2>
        )}

        {!query ? (
          <SearchPageIdleState />
        ) : isBusy ? (
          <SearchResultsSkeleton />
        ) : error ? (
          <SearchPageErrorState onRetry={handleRetry} />
        ) : results.length === 0 && userResults.length === 0 ? (
          <SearchPageEmptyState query={query} />
        ) : (
          <>
            <SearchUserSection users={userResults} />

            {movies.length > 0 && (
              <SearchMediaSection
                title={
                  person
                    ? `Filmes com ${person.name}`
                    : advancedMeta.used && advancedMeta.mode === "collection"
                      ? "Filmes da coleção"
                      : "Filmes"
                }
                items={movies}
                library={library}
                processing={processing}
                openLibraryMenu={openLibraryMenu}
                onPreview={openPreview}
                onAdd={addToLibrary}
                onToggleStatusMenu={(key) =>
                  setOpenLibraryMenu((current) => (current === key ? null : key))
                }
                onToggleFavorite={toggleFavorite}
                onUpdateStatus={updateStatus}
                onRequestRemove={requestRemove}
              />
            )}

            {series.length > 0 && (
              <SearchMediaSection
                title={person ? `Séries com ${person.name}` : "Séries"}
                items={series}
                library={library}
                processing={processing}
                openLibraryMenu={openLibraryMenu}
                onPreview={openPreview}
                onAdd={addToLibrary}
                onToggleStatusMenu={(key) =>
                  setOpenLibraryMenu((current) => (current === key ? null : key))
                }
                onToggleFavorite={toggleFavorite}
                onUpdateStatus={updateStatus}
                onRequestRemove={requestRemove}
              />
            )}
          </>
        )}
      </div>

      <MediaPreviewDialog
        open={Boolean(previewItem)}
        onClose={closePreview}
        data={previewItem ? fromSearchItem(previewItem, previewDetails, getLibraryItem(previewItem) || null) : null}
        actions={{
          onAdd: () => previewItem && addToLibrary(previewItem),
          addLabel: "Quero assistir",
          onRating: (_, rating) => previewItem && updateRating(previewItem, rating),
          disabled: previewItem ? processing === `${previewItem.media_type}-${previewItem.id}` : false,
        }}
        providers={<WatchProviderList data={normalizeWatchProviders(previewDetails?.watch_providers, "BR")} loading={previewDetailsLoading} />}
      />

      {removeTarget && (
        <SearchRemoveDialog
          item={removeTarget}
          skipConfirm={skipRemoveConfirm}
          isProcessing={processing === `${removeTarget.media_type}-${removeTarget.id}`}
          onSkipConfirmChange={(checked) => {
            setSkipRemoveConfirm(checked);

            try {
              localStorage.setItem("mycatalog_skip_remove_confirm", checked ? "1" : "0");
            } catch {
              // localStorage indisponível
            }
          }}
          onCancel={() => setRemoveTarget(null)}
          onConfirm={performRemove}
        />
      )}
    </>
  );
}
