"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

import { Search } from "@/components/Search";
import { useToast } from "@/components/ToastProvider";

import {
  CLEAR_FILTERS_PATCH,
  countActiveFilters,
  type DiscoverParams,
  type MediaType,
} from "@/lib/discover/params";
import { useDiscoverParams } from "@/lib/discover/useDiscoverParams";

import {
  DiscoverActiveFilters,
  DiscoverEmptyState,
  DiscoverErrorState,
  DiscoverFilters,
  DiscoverGrid,
  DiscoverGridSkeleton,
  DiscoverHeader,
  DiscoverPagination,
  DiscoverRemoveDialog,
  DiscoverToolbar,
  type DiscoverItem,
  type DiscoverResponse,
  type FilterResponse,
} from "@/components/discover";

import { MediaPreviewDialog } from "@/components/media/preview/MediaPreviewDialog";
import { WatchProviderList } from "@/components/media/preview/WatchProviderList";
import { fromDiscoverItem } from "@/components/media/preview/adapters";
import { normalizeWatchProviders } from "@/components/media/providers";

export default function DiscoverPage() {
  return (
    <Suspense
      fallback={
        <>
          <div className="topbar">
            <Search />
          </div>

          <div className="empty discover-loading">
            <Loader2 className="spin" size={28} />
            <span>Carregando Descobrir...</span>
          </div>
        </>
      }
    >
      <DiscoverContent />
    </Suspense>
  );
}

function DiscoverContent() {
  const toast = useToast();
  const { params, setParams } = useDiscoverParams();

  const [showFilters, setShowFilters] = useState(false);

  const [data, setData] = useState<DiscoverResponse | null>(null);
  const [filters, setFilters] = useState<FilterResponse>({ genres: [], providers: [] });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retryTick, setRetryTick] = useState(0);

  /*
   * BUG-B2.5-01(POLISH-02) fix: remover um chip, limpar filtros, tentar
   * de novo ou trocar de página substitui/remove o elemento que o usuário
   * acabou de clicar, e o foco cai para <body>. `focusIntentRef` registra
   * O QUE aconteceu antes de disparar a mudança; o efeito abaixo (que
   * observa `loading` virar `false`, ou seja, o fetch seguinte já
   * terminou) consome essa intenção e devolve o foco a um alvo com
   * sentido. Mudanças comuns de filtro (tabs, sort, atalhos, selects,
   * toggles) NUNCA setam essa ref, então não roubam foco.
   */
  const focusIntentRef = useRef<
    { kind: "chip"; index: number } | { kind: "summary" } | null
  >(null);

  const resultsSummaryRef = useRef<HTMLHeadingElement>(null);

  const [filtersLoading, setFiltersLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [openLibraryMenu, setOpenLibraryMenu] = useState<string | null>(null);

  const [removeTarget, setRemoveTarget] = useState<DiscoverItem | null>(null);
  const [skipRemoveConfirm, setSkipRemoveConfirm] = useState(false);

  useEffect(() => {
    try {
      setSkipRemoveConfirm(
        localStorage.getItem("mycatalog_skip_remove_confirm") === "1"
      );
    } catch {
      // localStorage indisponível
    }
  }, []);

  useEffect(() => {
    if (openLibraryMenu === null) return;

    function handleOutsideClick(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;

      /*
       * Mantém aberto quando o clique
       * acontece no botão ou no menu.
       */
      if (
        target.closest(".discover-library-menu-button") ||
        target.closest(".discover-library-status-menu")
      ) {
        return;
      }

      setOpenLibraryMenu(null);
    }

    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [openLibraryMenu]);

  const [previewItem, setPreviewItem] = useState<DiscoverItem | null>(null);
  const [previewDetails, setPreviewDetails] = useState<any>(null);
  const [previewDetailsLoading, setPreviewDetailsLoading] = useState(false);

  /*
   * Only `removeTarget` needs this anymore — the Quick Peek's Escape/scroll
   * lock now comes from `MediaPreviewDialog`'s underlying `Dialog` (C2.2).
   */
  useEffect(() => {
    if (!removeTarget) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setRemoveTarget(null);
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [removeTarget]);

  useEffect(() => {
    let cancelled = false;

    async function loadPreviewDetails() {
      if (!previewItem?.id || !previewItem?.media_type) {
        setPreviewDetails(null);
        return;
      }

      try {
        setPreviewDetailsLoading(true);

        const response = await fetch(
          `/api/tmdb/${previewItem.media_type}/${previewItem.id}`
        );
        const result = await response.json();

        if (!response.ok || result?.error) {
          throw new Error(result?.error || "Erro ao carregar detalhes.");
        }

        if (!cancelled) setPreviewDetails(result);
      } catch (error) {
        console.error("Erro ao carregar preview:", error);
        if (!cancelled) setPreviewDetails(null);
      } finally {
        if (!cancelled) setPreviewDetailsLoading(false);
      }
    }

    loadPreviewDetails();
    return () => {
      cancelled = true;
    };
  }, [previewItem?.id, previewItem?.media_type]);

  const currentYear = new Date().getFullYear();

  const years = useMemo(
    () =>
      Array.from(
        { length: currentYear + 3 - 1900 + 1 },
        (_, index) => currentYear + 3 - index
      ),
    [currentYear]
  );

  const activeFilters = countActiveFilters(params);

  /*
   * ==========================================
   * METADADOS DE FILTROS
   * ==========================================
   */

  useEffect(() => {
    let cancelled = false;

    async function loadFilters() {
      try {
        setFiltersLoading(true);

        const filterTypes: MediaType[] =
          params.type === "all" ? ["movie", "tv"] : [params.type];
        const responses = await Promise.all(
          filterTypes.map((mediaType) =>
            fetch(`/api/discover/filters?type=${mediaType}`)
          )
        );
        const payloads = await Promise.all(
          responses.map((response) => response.json())
        );

        if (
          responses.some((response) => !response.ok) ||
          payloads.some((result) => result?.error)
        ) {
          throw new Error(
            payloads.find((result) => result?.error)?.error ||
              "Erro ao carregar filtros."
          );
        }

        const result = {
          genres: Array.from(
            new Map(
              payloads
                .flatMap((entry) => entry.genres || [])
                .map((entry: any) => [entry.id, entry])
            ).values()
          ),
          providers: Array.from(
            new Map(
              payloads
                .flatMap((entry) => entry.providers || [])
                .map((entry: any) => [entry.provider_id, entry])
            ).values()
          ),
        };

        if (!cancelled) {
          setFilters({
            genres: Array.isArray(result.genres) ? result.genres : [],
            providers: Array.isArray(result.providers) ? result.providers : [],
          });
        }
      } catch (error) {
        console.error(error);
        if (!cancelled) setFilters({ genres: [], providers: [] });
      } finally {
        if (!cancelled) setFiltersLoading(false);
      }
    }

    loadFilters();
    return () => {
      cancelled = true;
    };
  }, [params.type]);

  /*
   * ==========================================
   * RESULTADOS
   * ==========================================
   */

  useEffect(() => {
    let cancelled = false;

    /*
     * AbortController (B1): cancela de verdade as requests obsoletas
     * quando o usuário troca de filtro antes da resposta anterior chegar.
     */
    const controller = new AbortController();

    async function load() {
      try {
        setLoading(true);
        setError(false);

        const baseParams = new URLSearchParams({
          type: params.type,
          sort: params.sort,
          page: String(params.page),
        });

        if (params.genre) baseParams.set("genre", params.genre);
        if (params.year) baseParams.set("year", params.year);
        if (params.rating) baseParams.set("rating", params.rating);
        if (params.country) baseParams.set("country", params.country);
        if (params.provider) baseParams.set("provider", params.provider);
        if (params.hideWatched) baseParams.set("hide_watched", "1");
        if (params.onlyNew) baseParams.set("only_new", "1");

        const requestTypes: MediaType[] =
          params.type === "all" ? ["movie", "tv"] : [params.type];
        const responses = await Promise.all(
          requestTypes.map((mediaType) => {
            const requestParams = new URLSearchParams(baseParams);
            requestParams.set("type", mediaType);
            return fetch(`/api/discover?${requestParams.toString()}`, {
              cache: "no-store",
              signal: controller.signal,
            });
          })
        );
        const payloads = await Promise.all(
          responses.map((response) => response.json())
        );

        if (
          responses.some((response) => !response.ok) ||
          payloads.some((result) => result?.error)
        ) {
          throw new Error(
            payloads.find((result) => result?.error)?.error ||
              "Erro ao carregar títulos."
          );
        }

        const result =
          params.type === "all"
            ? {
                page: params.page,
                total_pages: Math.max(
                  ...payloads.map((entry) => Number(entry.total_pages || 1))
                ),
                total_results: payloads.reduce(
                  (total, entry) => total + Number(entry.total_results || 0),
                  0
                ),
                results: payloads
                  .flatMap((entry) => entry.results || [])
                  .sort((a: any, b: any) =>
                    params.sort === "rating"
                      ? Number(b.vote_average || 0) - Number(a.vote_average || 0)
                      : params.sort === "newest"
                        ? String(b.release_date || b.first_air_date || "").localeCompare(
                            String(a.release_date || a.first_air_date || "")
                          )
                        : Number(b.popularity || 0) - Number(a.popularity || 0)
                  ),
              }
            : payloads[0];

        if (!cancelled)
          setData(
            payloads.some((entry) => entry?.needs_streaming_setup)
              ? { ...result, needs_streaming_setup: true }
              : result
          );
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        console.error(error);

        if (!cancelled) {
          setData(null);
          setError(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [
    params.type,
    params.sort,
    params.page,
    params.genre,
    params.year,
    params.rating,
    params.country,
    params.provider,
    params.hideWatched,
    params.onlyNew,
    retryTick,
  ]);

  /*
   * Consome a intenção de foco assim que o fetch seguinte à ação
   * (remover chip / limpar filtros / retry / trocar página) termina.
   * `loading` já cobre os quatro casos: os três primeiros mudam `params`
   * (novo fetch de qualquer forma), retry incrementa `retryTick` (também
   * está nas deps do fetch). Mudanças comuns de filtro nunca setam
   * `focusIntentRef`, então este efeito não faz nada para elas.
   */
  useEffect(() => {
    if (loading) return;

    const intent = focusIntentRef.current;
    if (!intent) return;

    focusIntentRef.current = null;

    if (intent.kind === "chip") {
      const chipButtons = document.querySelectorAll<HTMLElement>(
        ".mc-discover-chip:not(.mc-discover-chip--clear)"
      );

      if (chipButtons.length > 0) {
        const nextIndex = Math.min(intent.index, chipButtons.length - 1);
        chipButtons[nextIndex]?.focus();
        return;
      }
    }

    resultsSummaryRef.current?.focus();
  }, [loading]);

  function goToPage(target: number) {
    const total = data?.total_pages || 1;
    const next = Math.min(Math.max(target, 1), total);

    focusIntentRef.current = { kind: "summary" };
    setParams({ page: next });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleChange(patch: Partial<DiscoverParams>) {
    setParams(patch);
  }

  function handleClearFilters() {
    focusIntentRef.current = { kind: "summary" };
    setParams(CLEAR_FILTERS_PATCH);
  }

  function handleChipRemove(patch: Partial<DiscoverParams>, index: number) {
    focusIntentRef.current = { kind: "chip", index };
    setParams(patch);
  }

  function handleRetry() {
    focusIntentRef.current = { kind: "summary" };
    setRetryTick((tick) => tick + 1);
  }

  async function addToLibrary(item: DiscoverItem) {
    const key = `${item.media_type}-${item.id}`;

    try {
      setProcessing(key);

      const response = await fetch("/api/library", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          media: {
            ...item,
            media_type: item.media_type,
            title: item.title || item.name,
            original_title: item.original_title || item.original_name,
            genres: [],
          },
          status: "want",
          favorite: false,
        }),
      });

      const result = await response.json();

      if (!response.ok || result?.error) {
        throw new Error(result?.error || "Não foi possível adicionar.");
      }

      setData((current) => {
        if (!current) return current;

        return {
          ...current,
          results: current.results.map((currentItem) =>
            currentItem.id === item.id && currentItem.media_type === item.media_type
              ? {
                  ...currentItem,
                  in_library: true,
                  library_id: result.id,
                  library_status: "want",
                }
              : currentItem
          ),
        };
      });

      setPreviewItem((current) =>
        current && current.id === item.id && current.media_type === item.media_type
          ? { ...current, in_library: true, library_status: "want", library_id: result.id }
          : current
      );
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Erro ao adicionar.");
    } finally {
      setProcessing(null);
    }
  }

  async function updateLibraryStatus(item: DiscoverItem, nextStatus: string) {
    if (!item.library_id) return;

    const key = `${item.media_type}-${item.id}`;

    try {
      setProcessing(key);

      const response = await fetch(`/api/library/${item.library_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });

      const result = await response.json();

      if (!response.ok || result?.error) {
        throw new Error(result?.error || "Não foi possível alterar o status.");
      }

      setData((current) => {
        if (!current) return current;

        return {
          ...current,
          results: current.results.map((currentItem) =>
            currentItem.id === item.id && currentItem.media_type === item.media_type
              ? {
                  ...currentItem,
                  in_library: true,
                  library_id: result.id || item.library_id,
                  library_status: result.status || nextStatus,
                  favorite: Boolean(result.favorite ?? currentItem.favorite),
                }
              : currentItem
          ),
        };
      });

      setOpenLibraryMenu(null);
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Erro ao alterar status.");
    } finally {
      setProcessing(null);
    }
  }

  async function performRemoveFromLibrary(item: DiscoverItem) {
    if (!item.library_id) return;

    const key = `${item.media_type}-${item.id}`;

    try {
      setProcessing(key);

      const response = await fetch(`/api/library/${item.library_id}`, {
        method: "DELETE",
      });

      const result = await response.json();

      if (!response.ok || result?.error) {
        throw new Error(result?.error || "Não foi possível remover da biblioteca.");
      }

      setData((current) => {
        if (!current) return current;

        return {
          ...current,
          results: current.results.map((currentItem) =>
            currentItem.id === item.id && currentItem.media_type === item.media_type
              ? {
                  ...currentItem,
                  in_library: false,
                  library_id: null,
                  library_status: null,
                  favorite: false,
                }
              : currentItem
          ),
        };
      });

      setOpenLibraryMenu(null);
      setRemoveTarget(null);
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Erro ao remover.");
    } finally {
      setProcessing(null);
    }
  }

  function requestRemoveFromLibrary(item: DiscoverItem) {
    if (skipRemoveConfirm) {
      performRemoveFromLibrary(item);
      return;
    }

    setRemoveTarget(item);
    setOpenLibraryMenu(null);
  }

  async function updatePersonalRating(item: DiscoverItem, rating: number | null) {
    if (!item.library_id) return;

    const key = `${item.media_type}-${item.id}`;

    try {
      setProcessing(key);

      const response = await fetch(`/api/library/${item.library_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personal_rating: rating }),
      });

      const result = await response.json();

      if (!response.ok || result?.error) {
        throw new Error(result?.error || "Não foi possível alterar sua nota.");
      }

      setData((current) => {
        if (!current) return current;

        return {
          ...current,
          results: current.results.map((currentItem) =>
            currentItem.id === item.id && currentItem.media_type === item.media_type
              ? { ...currentItem, personal_rating: rating }
              : currentItem
          ),
        };
      });

      setPreviewItem((current) =>
        current && current.id === item.id && current.media_type === item.media_type
          ? { ...current, personal_rating: rating }
          : current
      );
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Erro ao alterar sua nota.");
    } finally {
      setProcessing(null);
    }
  }

  async function toggleFavorite(item: DiscoverItem) {
    if (!item.library_id) return;

    const key = `${item.media_type}-${item.id}`;

    try {
      setProcessing(key);

      const response = await fetch(`/api/library/${item.library_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ favorite: !item.favorite }),
      });

      const result = await response.json();

      if (!response.ok || result?.error) {
        throw new Error(result?.error || "Não foi possível alterar a curtida.");
      }

      const nextFavorite = Boolean(result.favorite ?? !item.favorite);

      setData((current) => {
        if (!current) return current;

        return {
          ...current,
          results: current.results.map((currentItem) =>
            currentItem.id === item.id && currentItem.media_type === item.media_type
              ? { ...currentItem, favorite: nextFavorite }
              : currentItem
          ),
        };
      });

      setPreviewItem((current) =>
        current && current.id === item.id && current.media_type === item.media_type
          ? { ...current, favorite: nextFavorite }
          : current
      );
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Erro ao alterar curtida.");
    } finally {
      setProcessing(null);
    }
  }

  function toggleStatusMenuWithoutScroll(key: string) {
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;

    setOpenLibraryMenu((current) => (current === key ? null : key));

    /*
     * Alguns navegadores podem reposicionar
     * a página quando um controle sobreposto
     * recebe foco. Mantemos exatamente a
     * posição atual.
     */
    requestAnimationFrame(() => {
      window.scrollTo(scrollX, scrollY);
    });
  }

  /*
   * ==========================================
   * RESULTADOS SEM DUPLICATAS
   * ==========================================
   *
   * A API/TMDB pode devolver o mesmo título mais de uma vez em algumas
   * combinações de filtros. Em vez de mascarar o problema colocando o
   * index na key do React, removemos a duplicata de verdade.
   */
  const items = useMemo(() => {
    const source = data?.results || [];
    const unique = new Map<string, DiscoverItem>();

    for (const item of source) {
      const itemKey = `${item.media_type}-${item.id}`;
      if (!unique.has(itemKey)) unique.set(itemKey, item);
    }

    return Array.from(unique.values());
  }, [data?.results]);

  return (
    <>
      <div className="topbar">
        <Search />
      </div>

      <DiscoverHeader
        totalLabel={data ? data.total_results.toLocaleString("pt-BR") : null}
      />

      <DiscoverToolbar
        params={params}
        activeFilters={activeFilters}
        showFilters={showFilters}
        onChange={handleChange}
        onToggleFilters={() => setShowFilters((value) => !value)}
      />

      {activeFilters > 0 && (
        <section className="section">
          <DiscoverActiveFilters
            params={params}
            filters={filters}
            onRemove={handleChipRemove}
            onClearAll={handleClearFilters}
          />
        </section>
      )}

      {showFilters && (
        <DiscoverFilters
          params={params}
          filters={filters}
          filtersLoading={filtersLoading}
          years={years}
          activeFilters={activeFilters}
          onChange={handleChange}
          onClearFilters={handleClearFilters}
          onClose={() => setShowFilters(false)}
        />
      )}

      <h2 ref={resultsSummaryRef} tabIndex={-1} className="mc-discover-results-summary">
        {loading
          ? "Carregando resultados..."
          : error
            ? "Não foi possível carregar os resultados"
            : items.length === 0
              ? "Nenhum resultado encontrado"
              : `${items.length} títulos nesta página`}
      </h2>

      {loading ? (
        <DiscoverGridSkeleton />
      ) : error ? (
        <DiscoverErrorState onRetry={handleRetry} />
      ) : items.length === 0 ? (
        <DiscoverEmptyState
          hasActiveFilters={activeFilters > 0}
          onClearFilters={handleClearFilters}
          needsStreamingSetup={Boolean(data?.needs_streaming_setup)}
        />
      ) : (
        <>
          <DiscoverGrid
            items={items}
            personalFiltersNote={Boolean(data?.personal_filters)}
            perPage={data?.per_page}
            processingKey={processing}
            openLibraryMenu={openLibraryMenu}
            onPreview={setPreviewItem}
            onAdd={addToLibrary}
            onToggleStatusMenu={toggleStatusMenuWithoutScroll}
            onToggleFavorite={toggleFavorite}
            onUpdateStatus={updateLibraryStatus}
            onRequestRemove={requestRemoveFromLibrary}
          />

          <DiscoverPagination
            page={data?.page || params.page}
            totalPages={data?.total_pages || 1}
            onGoToPage={goToPage}
          />
        </>
      )}

      <MediaPreviewDialog
        open={Boolean(previewItem)}
        onClose={() => setPreviewItem(null)}
        data={previewItem ? fromDiscoverItem(previewItem, filters.genres) : null}
        actions={{
          onAdd: () => previewItem && addToLibrary(previewItem),
          addLabel: "Quero assistir",
          onRating: (_, rating) => previewItem && updatePersonalRating(previewItem, rating),
          disabled: previewItem ? processing === `${previewItem.media_type}-${previewItem.id}` : false,
        }}
        providers={<WatchProviderList data={normalizeWatchProviders(previewDetails?.watch_providers, "BR")} loading={previewDetailsLoading} />}
      />

      {removeTarget && (
        <DiscoverRemoveDialog
          item={removeTarget}
          skipConfirm={skipRemoveConfirm}
          isProcessing={processing === `${removeTarget.media_type}-${removeTarget.id}`}
          onSkipConfirmChange={(checked) => {
            setSkipRemoveConfirm(checked);

            try {
              localStorage.setItem(
                "mycatalog_skip_remove_confirm",
                checked ? "1" : "0"
              );
            } catch {
              // localStorage indisponível
            }
          }}
          onCancel={() => setRemoveTarget(null)}
          onConfirm={performRemoveFromLibrary}
        />
      )}
    </>
  );
}
