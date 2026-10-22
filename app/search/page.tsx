"use client";

import { removeFromLibrary } from "@/lib/library/actions";
import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

import { Search } from "@/components/Search";
import { isSearchable, MIN_QUERY_LENGTH } from "@/lib/search/rank";
import { chunkLibraryStatePairs } from "@/lib/library-state-batches";
import { ApiError, apiFetch, errorFromResponse, isAbortError } from "@/lib/api-client";
import { searchErrorKind } from "@/components/search/errorCopy";
import type { SearchErrorKind } from "@/components/search/types";
import { intentForMedia } from "@/lib/auth/pending-action";
import { useLibraryAuth } from "@/hooks/useLibraryAuth";

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
import { SeriesProgressPanel } from "@/components/library/SeriesProgress";
import type { LibraryProgress } from "@/lib/library/progress";

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

  // Fase 6: falha de rede vira ApiError NETWORK_ERROR; erro HTTP leva o status junto (`errorStatus`)
  // para a página dizer a causa (limite, servidor, pedido inválido) em vez de sempre "conexão".
  let response: Response;
  try {
    response = await fetch(url, { signal });
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw new ApiError("Não foi possível se conectar ao servidor.", { code: "NETWORK_ERROR", retryable: true });
  }

  if (!response.ok) {
    const failure = await errorFromResponse(response);
    return { error: failure.message, errorStatus: response.status };
  }

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
  // Fase 1: visitante é convidado a entrar; 401 nunca vira "Não autenticado".
  const libraryAuth = useLibraryAuth();
  const canLookupLibrary = libraryAuth.state === "authenticated" || libraryAuth.state === "unknown";
  const searchParams = useSearchParams();
  const query = searchParams.get("q")?.trim() || "";

  const [results, setResults] = useState<SearchItem[]>([]);
  const [userResults, setUserResults] = useState<UserSearchResult[]>([]);
  const [library, setLibrary] = useState<LibraryState[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<SearchErrorKind | null>(null);
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
  // V3.2: progresso canônico da série na Quick View (o mesmo da Biblioteca/Título).
  const [previewProgressEntry, setPreviewProgressEntry] = useState<{
    libraryId: string;
    progress: LibraryProgress | null;
  } | null>(null);

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
   * Série na biblioteca: progresso canônico do item individual (`library_progress`;
   * sessão, nunca cacheado). Depende do library_id para também rodar quando o
   * lote de estado pessoal chega depois de a Quick View abrir.
   */
  const previewTvLibraryId =
    previewItem?.media_type === "tv" ? getLibraryItem(previewItem)?.library_id : undefined;
  const previewTvTmdbId = previewTvLibraryId ? Number(previewItem?.id) : null;
  const previewProgress =
    previewTvLibraryId && previewProgressEntry?.libraryId === previewTvLibraryId
      ? previewProgressEntry.progress
      : null;

  useEffect(() => {
    if (!previewTvTmdbId || !previewTvLibraryId) return;

    const controller = new AbortController();

    fetch(`/api/library?tmdb_id=${previewTvTmdbId}&type=tv`, { cache: "no-store", signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) =>
        setPreviewProgressEntry({ libraryId: previewTvLibraryId, progress: data?.library_progress ?? null })
      )
      .catch(() => {});

    return () => controller.abort();
  }, [previewTvTmdbId, previewTvLibraryId]);

  /*
   * ==========================================
   * ESTADO PESSOAL DOS RESULTADOS
   * ==========================================
   *
   * V3.2: a Busca não baixa mais a Biblioteca inteira. Depois que os
   * resultados exibidos estão definidos, busca o estado pessoal (status,
   * favorito, nota) SÓ desses títulos, em lote (POST /api/library/state:
   * uma consulta por até 100 títulos — nunca uma por card). Títulos já
   * consultados nesta página não são consultados de novo; ações locais
   * (adicionar/status/remover) atualizam o estado direto.
   */
  const lookedUpRef = useRef(new Set<string>());

  useEffect(() => {
    // Fase 1 (P2-03): visitante (ou sessão ainda carregando) não tem estado pessoal para consultar.
    if (!canLookupLibrary) return;

    const batches = chunkLibraryStatePairs(
      results.filter((item) => !lookedUpRef.current.has(`${item.media_type}:${Number(item.id)}`))
    );

    if (batches.length === 0) return;

    const controller = new AbortController();

    async function lookup() {
      try {
        const responses = await Promise.all(
          batches.map((items) =>
            fetch("/api/library/state", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ items }),
              cache: "no-store",
              signal: controller.signal,
            }).then(async (response) => (response.ok ? { items, data: await safeJson(response) } : null))
          )
        );
        const found: LibraryState[] = [];

        for (const entry of responses) {
          if (!entry) continue;

          for (const pair of entry.items) lookedUpRef.current.add(`${pair.media_type}:${pair.tmdb_id}`);
          if (Array.isArray(entry.data?.items)) found.push(...entry.data.items);
        }

        if (found.length === 0) return;

        // Não sobrescreve o que uma ação local já gravou enquanto o lote estava em voo.
        setLibrary((current) => [
          ...current,
          ...found.filter(
            (row) => !current.some((entry) => entry.tmdb_id === row.tmdb_id && entry.media_type === row.media_type)
          ),
        ]);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          console.error("Estado pessoal da pesquisa:", error);
        }
      }
    }

    lookup();
    return () => controller.abort();
  }, [results, canLookupLibrary]);

  /*
   * ==========================================
   * CARREGAMENTO DA PESQUISA
   * ==========================================
   */
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    // V3.2: abaixo do mínimo (2 caracteres) não pesquisa — e a tela diz isso (não "nenhum resultado").
    if (!query || !isSearchable(query)) {
      setResults([]);
      setUserResults([]);
      setLoading(false);
      setError(null);
      return;
    }

    async function load() {
      try {
        setLoading(true);
        setError(null);
        setPersonLoading(false);
        setPerson(null);
        setPersonCredits([]);
        setAdvancedMeta({ used: false, mode: "", title: "", subtitle: "" });
        setAdvancedLoading(false);

        const usersOnly = query.startsWith("@");
        const catalogQuery = query.replace(/^@+/, "").trim();
        const [advancedData, usersData] = await Promise.all([
          usersOnly
            ? Promise.resolve({ handled: false, results: [] })
            : cachedSearchJson(`/api/search/advanced?q=${encodeURIComponent(catalogQuery)}`, controller.signal),
          cachedSearchJson(`/api/search/users?q=${encodeURIComponent(query)}`, controller.signal),
        ]);

        /*
         * V3.2: o /search/multi do TMDB já vem no advanced (`catalog`) quando
         * ele não resolve uma entidade — o /api/search (mesmo multi) só é
         * chamado como reserva, se o advanced falhar ou não trouxer catálogo.
         */
        const advancedResolved =
          advancedData?.handled &&
          Array.isArray(advancedData.results) &&
          advancedData.results.some((item: any) => item.media_type === "movie" || item.media_type === "tv");
        const searchData = usersOnly
          ? { results: [] }
          : Array.isArray(advancedData?.catalog)
            ? { results: advancedData.catalog }
            : advancedResolved && !advancedData?.error
              ? { results: [] }
              : await cachedSearchJson(`/api/search?q=${encodeURIComponent(catalogQuery)}`, controller.signal);

        // V3.4: catálogo indisponível (TMDB/servidor) é erro, não "nenhum resultado".
        if (!usersOnly && !advancedResolved && searchData?.error) {
          throw new ApiError(searchData.error, { status: searchData.errorStatus ?? 500 });
        }

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
          setError(searchErrorKind(error));
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

    if (!libraryAuth.requireUser(intentForMedia(item, "add"))) return;

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

      const data = await apiFetch("/api/library", {
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
      libraryAuth.handleError(error, intentForMedia(item, "add"), "Erro ao adicionar");
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

      const data = await apiFetch(`/api/library/${existing.library_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });

      patchLibraryState(item, { status: data.status || nextStatus });
      setOpenLibraryMenu(null);
    } catch (error) {
      console.error(error);
      libraryAuth.handleError(error, intentForMedia(item, "status", nextStatus), "Erro ao alterar status");
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

      const data = await apiFetch(`/api/library/${existing.library_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ favorite: next }),
      });

      patchLibraryState(item, { favorite: data.favorite ?? next });
    } catch (error) {
      console.error(error);
      libraryAuth.handleError(error, next ? intentForMedia(item, "favorite") : undefined, "Erro ao alterar curtida");
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

      await apiFetch(`/api/library/${existing.library_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personal_rating: rating }),
      });

      patchLibraryState(item, { personal_rating: rating });
    } catch (error) {
      console.error(error);
      libraryAuth.handleError(error, undefined, "Erro ao alterar sua nota");
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

      await removeFromLibrary(existing.library_id);

      setLibrary((current) => current.filter((entry) => entry.library_id !== existing.library_id));
      setRemoveTarget(null);
      setOpenLibraryMenu(null);
    } catch (error) {
      console.error(error);
      libraryAuth.handleError(error, undefined, "Erro ao remover");
    } finally {
      setProcessing(null);
    }
  }

  const movies = results.filter((item) => item.media_type === "movie");
  const series = results.filter((item) => item.media_type === "tv");
  const seriesFirst = results[0]?.media_type === "tv";
  const isBusy = loading || personLoading || advancedLoading;

  return (
    <>
      <div className="topbar">
        <Search syncedQuery={query} />
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

        {query && isSearchable(query) && !isBusy && (
          <h2 ref={resultsSummaryRef} tabIndex={-1} className="mc-discover-results-summary">
            {error
              ? "Não foi possível carregar os resultados"
              : results.length === 0 && userResults.length === 0
                ? "Nenhum resultado encontrado"
                : `${results.length + userResults.length} resultados`}
          </h2>
        )}

        {!query ? (
          <SearchPageIdleState />
        ) : !isSearchable(query) ? (
          <div className="empty mc-discover-empty" role="status">
            <span>Digite pelo menos {MIN_QUERY_LENGTH} caracteres para pesquisar.</span>
          </div>
        ) : isBusy ? (
          <SearchResultsSkeleton />
        ) : error ? (
          <SearchPageErrorState onRetry={handleRetry} kind={error} />
        ) : results.length === 0 && userResults.length === 0 ? (
          <SearchPageEmptyState query={query} />
        ) : (
          <>
            <SearchUserSection users={userResults} />

            {/* V3.2: a seção do resultado MAIS relevante vem primeiro (série exata não fica abaixo de todos os filmes). */}
            {seriesFirst ? (
              <>
            {series.length > 0 && (
              <SearchMediaSection
                priority
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
              </>
            ) : (
              <>
            {movies.length > 0 && (
              <SearchMediaSection
                priority
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
        personal={previewProgress ? <SeriesProgressPanel progress={previewProgress} /> : null}
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
