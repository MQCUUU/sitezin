"use client";

import {
  Suspense,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Film,
  Filter,
  Heart,
  Eye,
  Loader2,
  Layers3,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  Star,
  Trash2,
  Tv,
  X,
} from "lucide-react";

import Link from "next/link";

import {
  useRouter,
  useSearchParams,
} from "next/navigation";

import { Search } from "@/components/Search";
import { PickForMe } from "@/components/PickForMe";
import { img } from "@/lib/tmdb";
import { useToast } from "@/components/ToastProvider";

type MediaType =
  | "movie"
  | "tv";

type DiscoverType = "all" | MediaType;

type DiscoverSort =
  | "popular"
  | "rating"
  | "newest";

type DiscoverItem = {
  id: number;

  media_type:
    MediaType;

  title?: string;
  name?: string;

  original_title?: string;
  original_name?: string;

  poster_path:
    string | null;

  release_date?: string;
  first_air_date?: string;

  vote_average:
    number;

  overview?:
    string;

  genre_ids?:
    number[];

  in_library:
    boolean;

  library_id:
    string | null;

  favorite:
    boolean;

  library_status?:
    string | null;

  personal_rating?:
    number | null;
};

type DiscoverResponse = {
  page: number;
  total_pages: number;
  total_results: number;
  per_page?: number;
  personal_filters?: boolean;

  results:
    DiscoverItem[];
};

type Genre = {
  id: number;
  name: string;
};

type Provider = {
  provider_id: number;
  provider_name: string;
  logo_path:
    string | null;
};

type FilterResponse = {
  genres:
    Genre[];

  providers:
    Provider[];
};

const COUNTRIES = [
  ["BR", "Brasil"],
  ["US", "Estados Unidos"],
  ["GB", "Reino Unido"],
  ["KR", "Coreia do Sul"],
  ["JP", "Japão"],
  ["FR", "França"],
  ["ES", "Espanha"],
  ["DE", "Alemanha"],
  ["IT", "Itália"],
  ["MX", "México"],
  ["CA", "Canadá"],
  ["IN", "Índia"],
  ["CN", "China"],
  ["AU", "Austrália"],
] as const;

const DISCOVER_STATUS_OPTIONS = [
  ["want", "Quero assistir"],
  ["watching", "Assistindo"],
  ["watched", "Assistido"],
  ["paused", "Pausado"],
  ["dropped", "Abandonado"],
  ["rewatching", "Reassistindo"],
  ["rewatched", "Reassistido"],
] as const;

function getStatusLabel(
  status?: string | null
) {
  return (
    DISCOVER_STATUS_OPTIONS.find(
      ([value]) =>
        value === status
    )?.[1] ||
    "Na biblioteca"
  );
}

function buildPages(
  current: number,
  total: number
) {
  const values:
    (
      | number
      | "ellipsis-left"
      | "ellipsis-right"
    )[] = [];

  if (
    total <= 9
  ) {
    for (
      let page = 1;
      page <= total;
      page++
    ) {
      values.push(
        page
      );
    }

    return values;
  }

  values.push(
    1
  );

  if (
    current > 4
  ) {
    values.push(
      "ellipsis-left"
    );
  }

  const start =
    Math.max(
      2,
      current - 2
    );

  const end =
    Math.min(
      total - 1,
      current + 2
    );

  for (
    let page =
      start;
    page <= end;
    page++
  ) {
    values.push(
      page
    );
  }

  if (
    current <
    total - 3
  ) {
    values.push(
      "ellipsis-right"
    );
  }

  values.push(
    total
  );

  return values;
}

export default function DiscoverPage() {
  return (
    <Suspense
      fallback={
        <>
          <div className="topbar">
            <Search />
          </div>

          <div className="empty discover-loading">
            <Loader2
              className="spin"
              size={28}
            />

            <span>
              Carregando Descobrir...
            </span>
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
  const router =
    useRouter();

  const searchParams =
    useSearchParams();

  const [
    type,
    setType,
  ] =
    useState<
      DiscoverType
    >(
      searchParams.get("type") === "tv"
        ? "tv"
        : searchParams.get("type") === "movie"
          ? "movie"
          : "all"
    );

  const rawSort =
    searchParams.get(
      "sort"
    );

  const [
    sort,
    setSort,
  ] =
    useState<
      DiscoverSort
    >(
      rawSort === "rating" ||
        rawSort === "newest"
        ? rawSort
        : "popular"
    );

  const [
    page,
    setPage,
  ] =
    useState(
      Math.max(
        1,
        Number(
          searchParams.get(
            "page"
          ) || 1
        ) || 1
      )
    );

  const [
    genre,
    setGenre,
  ] =
    useState(
      searchParams.get(
        "genre"
      ) || ""
    );

  const [
    year,
    setYear,
  ] =
    useState(
      searchParams.get(
        "year"
      ) || ""
    );

  const [
    rating,
    setRating,
  ] =
    useState(
      searchParams.get(
        "rating"
      ) || ""
    );

  const [
    country,
    setCountry,
  ] =
    useState(
      searchParams.get(
        "country"
      ) || ""
    );

  const [
    provider,
    setProvider,
  ] =
    useState(
      searchParams.get(
        "provider"
      ) || ""
    );

  const [
    hideWatched,
    setHideWatched,
  ] =
    useState(
      searchParams.get(
        "hide_watched"
      ) === "1"
    );

  const [
    onlyNew,
    setOnlyNew,
  ] =
    useState(
      searchParams.get(
        "only_new"
      ) === "1"
    );

  const [
    showFilters,
    setShowFilters,
  ] =
    useState(
      false
    );

  const [
    data,
    setData,
  ] =
    useState<
      DiscoverResponse
        | null
    >(
      null
    );

  const [
    filters,
    setFilters,
  ] =
    useState<
      FilterResponse
    >({
      genres: [],
      providers: [],
    });

  const [
    loading,
    setLoading,
  ] =
    useState(
      true
    );

  const [
    filtersLoading,
    setFiltersLoading,
  ] =
    useState(
      true
    );

  const [
    processing,
    setProcessing,
  ] =
    useState<
      string | null
    >(
      null
    );

  const [
    openLibraryMenu,
    setOpenLibraryMenu,
  ] =
    useState<
      string | null
    >(
      null
    );

  const [
    removeTarget,
    setRemoveTarget,
  ] =
    useState<
      DiscoverItem | null
    >(
      null
    );

  const [
    skipRemoveConfirm,
    setSkipRemoveConfirm,
  ] =
    useState(
      false
    );

  useEffect(() => {
    try {
      setSkipRemoveConfirm(
        localStorage.getItem(
          "mycatalog_skip_remove_confirm"
        ) === "1"
      );
    } catch {
      // localStorage indisponível
    }
  }, []);


  useEffect(() => {
    if (
      openLibraryMenu ===
      null
    ) {
      return;
    }

    function handleOutsideClick(
      event: MouseEvent
    ) {
      const target =
        event.target;

      if (
        !(target instanceof Element)
      ) {
        return;
      }

      /*
       * Mantém aberto quando o clique
       * acontece no botão ou no menu.
       */
      if (
        target.closest(
          ".discover-library-menu-button"
        ) ||
        target.closest(
          ".discover-library-status-menu"
        )
      ) {
        return;
      }

      setOpenLibraryMenu(
        null
      );
    }

    document.addEventListener(
      "mousedown",
      handleOutsideClick
    );

    return () => {
      document.removeEventListener(
        "mousedown",
        handleOutsideClick
      );
    };
  }, [
    openLibraryMenu,
  ]);

  const [
    previewItem,
    setPreviewItem,
  ] =
    useState<
      DiscoverItem | null
    >(null);


  const [
    previewDetails,
    setPreviewDetails,
  ] =
    useState<any>(
      null
    );

  const [
    previewDetailsLoading,
    setPreviewDetailsLoading,
  ] =
    useState(
      false
    );

  useEffect(() => {
    if (
  !previewItem &&
  !removeTarget
) {
  return;
}

    const onKeyDown =
      (event: KeyboardEvent) => {
        if (
  event.key ===
  "Escape"
) {
  setPreviewItem(
    null
  );

  setRemoveTarget(
    null
  );
}
      };

    const previousOverflow =
      document.body.style.overflow;

    document.body.style.overflow =
      "hidden";

    window.addEventListener(
      "keydown",
      onKeyDown
    );

    return () => {
      document.body.style.overflow =
        previousOverflow;

      window.removeEventListener(
        "keydown",
        onKeyDown
      );
    };
  }, [previewItem, removeTarget]);

  useEffect(() => {
    let cancelled =
      false;

    async function loadPreviewDetails() {
      if (
        !previewItem?.id ||
        !previewItem?.media_type
      ) {
        setPreviewDetails(
          null
        );
        return;
      }

      try {
        setPreviewDetailsLoading(
          true
        );

        const response =
          await fetch(
            `/api/tmdb/${previewItem.media_type}/${previewItem.id}`
          );

        const result =
          await response.json();

        if (
          !response.ok ||
          result?.error
        ) {
          throw new Error(
            result?.error ||
              "Erro ao carregar detalhes."
          );
        }

        if (!cancelled) {
          setPreviewDetails(
            result
          );
        }
      } catch (error) {
        console.error(
          "Erro ao carregar preview:",
          error
        );

        if (!cancelled) {
          setPreviewDetails(
            null
          );
        }
      } finally {
        if (!cancelled) {
          setPreviewDetailsLoading(
            false
          );
        }
      }
    }

    loadPreviewDetails();

    return () => {
      cancelled = true;
    };
  }, [
    previewItem?.id,
    previewItem?.media_type,
  ]);


  const currentYear =
    new Date()
      .getFullYear();

  const years =
    useMemo(
      () =>
        Array.from(
          {
            length:
              currentYear +
              3 -
              1900 +
              1,
          },
          (
            _,
            index
          ) =>
            currentYear +
            3 -
            index
        ),
      [
        currentYear,
      ]
    );

  const activeFilters =
    Number(
      !!genre
    ) +
    Number(
      !!year
    ) +
    Number(
      !!rating
    ) +
    Number(
      !!country
    ) +
    Number(
      !!provider
    ) +
    Number(
      hideWatched
    ) +
    Number(
      onlyNew
    );

  /*
   * ==========================================
   * URL
   * ==========================================
   */

  useEffect(() => {
    const params =
      new URLSearchParams();

    params.set(
      "type",
      type
    );

    params.set(
      "sort",
      sort
    );

    params.set(
      "page",
      String(page)
    );

    if (genre) {
      params.set(
        "genre",
        genre
      );
    }

    if (year) {
      params.set(
        "year",
        year
      );
    }

    if (rating) {
      params.set(
        "rating",
        rating
      );
    }

    if (country) {
      params.set(
        "country",
        country
      );
    }

    if (provider) {
      params.set(
        "provider",
        provider
      );
    }

    if (
      hideWatched
    ) {
      params.set(
        "hide_watched",
        "1"
      );
    }

    if (
      onlyNew
    ) {
      params.set(
        "only_new",
        "1"
      );
    }

    router.replace(
      `/discover?${params.toString()}`,
      {
        scroll:
          false,
      }
    );
  }, [
    type,
    sort,
    page,
    genre,
    year,
    rating,
    country,
    provider,
    hideWatched,
    onlyNew,
    router,
  ]);

  /*
   * ==========================================
   * METADADOS DE FILTROS
   * ==========================================
   */

  useEffect(() => {
    let cancelled =
      false;

    async function loadFilters() {
      try {
        setFiltersLoading(
          true
        );

        const filterTypes: MediaType[] = type === "all" ? ["movie", "tv"] : [type];
        const responses = await Promise.all(filterTypes.map((mediaType) => fetch(`/api/discover/filters?type=${mediaType}`)));
        const payloads = await Promise.all(responses.map((response) => response.json()));

        if (responses.some((response) => !response.ok) || payloads.some((result) => result?.error)) {
          throw new Error(
            payloads.find((result) => result?.error)?.error ||
              "Erro ao carregar filtros."
          );
        }

        const result = {
          genres: Array.from(new Map(payloads.flatMap((entry) => entry.genres || []).map((entry: any) => [entry.id, entry])).values()),
          providers: Array.from(new Map(payloads.flatMap((entry) => entry.providers || []).map((entry: any) => [entry.provider_id, entry])).values()),
        };

        if (
          !cancelled
        ) {
          setFilters({
            genres:
              Array.isArray(
                result.genres
              )
                ? result.genres
                : [],

            providers:
              Array.isArray(
                result.providers
              )
                ? result.providers
                : [],
          });
        }
      } catch (
        error
      ) {
        console.error(
          error
        );

        if (
          !cancelled
        ) {
          setFilters({
            genres:
              [],

            providers:
              [],
          });
        }
      } finally {
        if (
          !cancelled
        ) {
          setFiltersLoading(
            false
          );
        }
      }
    }

    loadFilters();

    return () => {
      cancelled =
        true;
    };
  }, [
    type,
  ]);

  /*
   * ==========================================
   * RESULTADOS
   * ==========================================
   */

  useEffect(() => {
    let cancelled =
      false;

    async function load() {
      try {
        setLoading(
          true
        );

        const params =
          new URLSearchParams({
            type,
            sort,
            page:
              String(page),
          });

        if (genre) {
          params.set(
            "genre",
            genre
          );
        }

        if (year) {
          params.set(
            "year",
            year
          );
        }

        if (rating) {
          params.set(
            "rating",
            rating
          );
        }

        if (country) {
          params.set(
            "country",
            country
          );
        }

        if (provider) {
          params.set(
            "provider",
            provider
          );
        }

        if (
          hideWatched
        ) {
          params.set(
            "hide_watched",
            "1"
          );
        }

        if (
          onlyNew
        ) {
          params.set(
            "only_new",
            "1"
          );
        }

        const requestTypes: MediaType[] = type === "all" ? ["movie", "tv"] : [type];
        const responses = await Promise.all(requestTypes.map((mediaType) => {
          const requestParams = new URLSearchParams(params);
          requestParams.set("type", mediaType);
          return fetch(`/api/discover?${requestParams.toString()}`, { cache: "no-store" });
        }));
        const payloads = await Promise.all(responses.map((response) => response.json()));

        if (responses.some((response) => !response.ok) || payloads.some((result) => result?.error)) {
          throw new Error(
            payloads.find((result) => result?.error)?.error ||
              "Erro ao carregar títulos."
          );
        }

        const result = type === "all"
          ? {
              page,
              total_pages: Math.max(...payloads.map((entry) => Number(entry.total_pages || 1))),
              total_results: payloads.reduce((total, entry) => total + Number(entry.total_results || 0), 0),
              results: payloads
                .flatMap((entry) => entry.results || [])
                .sort((a: any, b: any) => sort === "rating"
                  ? Number(b.vote_average || 0) - Number(a.vote_average || 0)
                  : sort === "newest"
                    ? String(b.release_date || b.first_air_date || "").localeCompare(String(a.release_date || a.first_air_date || ""))
                    : Number(b.popularity || 0) - Number(a.popularity || 0)),
            }
          : payloads[0];

        if (
          !cancelled
        ) {
          setData(
            result
          );
        }
      } catch (
        error
      ) {
        console.error(
          error
        );

        if (
          !cancelled
        ) {
          setData(
            null
          );
        }
      } finally {
        if (
          !cancelled
        ) {
          setLoading(
            false
          );
        }
      }
    }

    load();

    return () => {
      cancelled =
        true;
    };
  }, [
    type,
    sort,
    page,
    genre,
    year,
    rating,
    country,
    provider,
    hideWatched,
    onlyNew,
  ]);

  const pagination =
    useMemo(
      () =>
        buildPages(
          data?.page ||
            page,

          data
            ?.total_pages ||
            1
        ),
      [
        data,
        page,
      ]
    );

  function goToPage(
    target:
      number
  ) {
    const total =
      data?.total_pages ||
      1;

    const next =
      Math.min(
        Math.max(
          target,
          1
        ),
        total
      );

    setPage(
      next
    );

    window.scrollTo({
      top: 0,
      behavior:
        "smooth",
    });
  }

  function resetPage() {
    setPage(
      1
    );
  }

  function clearFilters() {
    setGenre(
      ""
    );

    setYear(
      ""
    );

    setRating(
      ""
    );

    setCountry(
      ""
    );

    setProvider(
      ""
    );

    setHideWatched(
      false
    );

    setOnlyNew(
      false
    );

    setPage(
      1
    );
  }

  async function addToLibrary(
    item:
      DiscoverItem
  ) {
    const key =
      `${item.media_type}-${item.id}`;

    try {
      setProcessing(
        key
      );

      const response =
        await fetch(
          "/api/library",
          {
            method:
              "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify(
                {
                  media: {
                    ...item,

                    media_type:
                      item.media_type,

                    title:
                      item.title ||
                      item.name,

                    original_title:
                      item.original_title ||
                      item.original_name,

                    genres:
                      [],
                  },

                  status:
                    "want",

                  favorite:
                    false,
                }
              ),
          }
        );

      const result =
        await response.json();

      if (
        !response.ok ||
        result?.error
      ) {
        throw new Error(
          result?.error ||
            "Não foi possível adicionar."
        );
      }

      setData(
        (
          current
        ) => {
          if (
            !current
          ) {
            return current;
          }

          return {
            ...current,

            results:
              current.results.map(
                (
                  currentItem
                ) =>
                  currentItem.id ===
                    item.id &&
                  currentItem.media_type ===
                    item.media_type
                    ? {
                        ...currentItem,

                        in_library:
                          true,

                        library_id:
                          result.id,

                        library_status:
                          "want",
                      }
                    : currentItem
              ),
          };
        }
      );
    } catch (
      error
    ) {
      console.error(
        error
      );

      toast.error(
        error instanceof Error
          ? error.message
          : "Erro ao adicionar."
      );
    } finally {
      setProcessing(
        null
      );
    }
  }


  async function updateLibraryStatus(
    item: DiscoverItem,
    nextStatus: string
  ) {
    if (
      !item.library_id
    ) {
      return;
    }

    const key =
      `${item.media_type}-${item.id}`;

    try {
      setProcessing(
        key
      );

      const response =
        await fetch(
          `/api/library/${item.library_id}`,
          {
            method:
              "PATCH",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                status:
                  nextStatus,
              }),
          }
        );

      const result =
        await response.json();

      if (
        !response.ok ||
        result?.error
      ) {
        throw new Error(
          result?.error ||
            "Não foi possível alterar o status."
        );
      }

      setData(
        (
          current
        ) => {
          if (
            !current
          ) {
            return current;
          }

          return {
            ...current,

            results:
              current.results.map(
                (
                  currentItem
                ) =>
                  currentItem.id ===
                    item.id &&
                  currentItem.media_type ===
                    item.media_type
                    ? {
                        ...currentItem,

                        in_library:
                          true,

                        library_id:
                          result.id ||
                          item.library_id,

                        library_status:
                          result.status ||
                          nextStatus,

                        favorite:
                          Boolean(
                            result.favorite ??
                              currentItem.favorite
                          ),
                      }
                    : currentItem
              ),
          };
        }
      );

      setOpenLibraryMenu(
        null
      );
    } catch (
      error
    ) {
      console.error(
        error
      );

      toast.error(
        error instanceof Error
          ? error.message
          : "Erro ao alterar status."
      );
    } finally {
      setProcessing(
        null
      );
    }
  }

  async function performRemoveFromLibrary(
    item: DiscoverItem
  ) {
    if (
      !item.library_id
    ) {
      return;
    }

    const key =
      `${item.media_type}-${item.id}`;

    try {
      setProcessing(
        key
      );

      const response =
        await fetch(
          `/api/library/${item.library_id}`,
          {
            method:
              "DELETE",
          }
        );

      const result =
        await response.json();

      if (
        !response.ok ||
        result?.error
      ) {
        throw new Error(
          result?.error ||
            "Não foi possível remover da biblioteca."
        );
      }

      setData(
        (
          current
        ) => {
          if (
            !current
          ) {
            return current;
          }

          return {
            ...current,

            results:
              current.results.map(
                (
                  currentItem
                ) =>
                  currentItem.id ===
                    item.id &&
                  currentItem.media_type ===
                    item.media_type
                    ? {
                        ...currentItem,

                        in_library:
                          false,

                        library_id:
                          null,

                        library_status:
                          null,

                        favorite:
                          false,
                      }
                    : currentItem
              ),
          };
        }
      );

      setOpenLibraryMenu(
        null
      );

      setRemoveTarget(
        null
      );
    } catch (
      error
    ) {
      console.error(
        error
      );

      toast.error(
        error instanceof Error
          ? error.message
          : "Erro ao remover."
      );
    } finally {
      setProcessing(
        null
      );
    }
  }

  function requestRemoveFromLibrary(
    item: DiscoverItem
  ) {
    if (
      skipRemoveConfirm
    ) {
      performRemoveFromLibrary(
        item
      );

      return;
    }

    setRemoveTarget(
      item
    );

    setOpenLibraryMenu(
      null
    );
  }


  async function updatePersonalRating(
    item: DiscoverItem,
    rating: number | null
  ) {
    if (
      !item.library_id
    ) {
      return;
    }

    const key =
      `${item.media_type}-${item.id}`;

    try {
      setProcessing(
        key
      );

      const response =
        await fetch(
          `/api/library/${item.library_id}`,
          {
            method:
              "PATCH",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                personal_rating:
                  rating,
              }),
          }
        );

      const result =
        await response.json();

      if (
        !response.ok ||
        result?.error
      ) {
        throw new Error(
          result?.error ||
            "Não foi possível alterar sua nota."
        );
      }

      setData(
        (
          current
        ) => {
          if (
            !current
          ) {
            return current;
          }

          return {
            ...current,

            results:
              current.results.map(
                (
                  currentItem
                ) =>
                  currentItem.id ===
                    item.id &&
                  currentItem.media_type ===
                    item.media_type
                    ? {
                        ...currentItem,
                        personal_rating:
                          rating,
                      }
                    : currentItem
              ),
          };
        }
      );

      if (
        previewItem?.id ===
          item.id &&
        previewItem?.media_type ===
          item.media_type
      ) {
        setPreviewItem({
          ...previewItem,
          personal_rating:
            rating,
        });
      }
    } catch (
      error
    ) {
      console.error(
        error
      );

      toast.error(
        error instanceof Error
          ? error.message
          : "Erro ao alterar sua nota."
      );
    } finally {
      setProcessing(
        null
      );
    }
  }

  function toggleStatusMenuWithoutScroll(
    key: string | number
  ) {
    const scrollX =
      window.scrollX;

    const scrollY =
      window.scrollY;

    setOpenLibraryMenu(
      (
        current
      ) =>
        current === String(key)
          ? null
          : String(key)
    );

    /*
     * Alguns navegadores podem reposicionar
     * a página quando um controle sobreposto
     * recebe foco. Mantemos exatamente a
     * posição atual.
     */
    requestAnimationFrame(
      () => {
        window.scrollTo(
          scrollX,
          scrollY
        );
      }
    );
  }

  /*
   * ==========================================
   * RESULTADOS SEM DUPLICATAS
   * ==========================================
   *
   * A API/TMDB pode devolver o mesmo título mais
   * de uma vez em algumas combinações de filtros.
   *
   * Em vez de mascarar o problema colocando o index
   * na key do React, removemos a duplicata de verdade.
   */
  const items =
    useMemo(
      () => {
        const source =
          data?.results ||
          [];

        const unique =
          new Map<
            string,
            DiscoverItem
          >();

        for (
          const item
          of source
        ) {
          const itemKey =
            `${item.media_type}-${item.id}`;

          /*
           * Mantemos a primeira ocorrência.
           * Se vier duplicado, ela é ignorada.
           */
          if (
            !unique.has(
              itemKey
            )
          ) {
            unique.set(
              itemKey,
              item
            );
          }
        }

        return Array.from(
          unique.values()
        );
      },
      [
        data?.results,
      ]
    );

  return (
    <>

      <div className="topbar">
        <Search />
      </div>

      <section className="section discover-head">

        <div>

          <div className="eyebrow">
            Explore o catálogo
          </div>

          <h1>
            Descobrir
          </h1>

          <p className="muted">
            Encontre o próximo filme ou série
            usando filtros do seu jeito.
          </p>

        </div>

        <div className="discover-total">
          {data
            ? `${data.total_results.toLocaleString(
                "pt-BR"
              )} títulos`
            : ""}
        </div>

      </section>

      <section className="section discover-toolbar">

        <div className="discover-tabs">

          <button
            type="button"
            className={type === "all" ? "btn primary" : "btn"}
            onClick={() => { setType("all"); resetPage(); }}
          >
            <Layers3 size={16} />
            Todos
          </button>

          <button
            type="button"
            className={
              type ===
              "movie"
                ? "btn primary"
                : "btn"
            }
            onClick={() => {
              setType(
                "movie"
              );

              resetPage();
            }}
          >
            <Film
              size={16}
            />
            Filmes
          </button>

          <button
            type="button"
            className={
              type ===
              "tv"
                ? "btn primary"
                : "btn"
            }
            onClick={() => {
              setType(
                "tv"
              );

              resetPage();
            }}
          >
            <Tv
              size={16}
            />
            Séries
          </button>

        </div>

        <div className="discover-toolbar-actions">

          <PickForMe />

          <button
            type="button"
            className={
              "btn " +
              (showFilters ||
              activeFilters >
                0
                ? "primary"
                : "")
            }
            onClick={() =>
              setShowFilters(
                (
                  value
                ) =>
                  !value
              )
            }
          >
            <SlidersHorizontal
              size={16}
            />

            Filtros

            {activeFilters >
              0 && (
              <b className="discover-filter-count">
                {
                  activeFilters
                }
              </b>
            )}
          </button>

          <label className="discover-sort">

            <span>
              Ordenar por
            </span>

            <select
              value={
                sort
              }
              onChange={(
                event
              ) => {
                setSort(
                  event
                    .target
                    .value as DiscoverSort
                );

                resetPage();
              }}
            >
              <option value="popular">
                Mais populares
              </option>

              <option value="rating">
                Mais bem avaliados
              </option>

              <option value="newest">
                Mais recentes
              </option>
            </select>

          </label>

        </div>

      </section>

      {showFilters && (
        <section className="section">

          <div className="panel discover-filter-panel">

            <div className="discover-filter-header">

              <div>
                <div className="eyebrow">
                  Descoberta avançada
                </div>

                <h2>
                  Filtrar títulos
                </h2>
              </div>

              <button
                type="button"
                className="btn ghost"
                onClick={() =>
                  setShowFilters(
                    false
                  )
                }
              >
                <X
                  size={16}
                />
                Fechar
              </button>

            </div>

            <div className="discover-filter-grid">

              <label>
                <span>
                  Gênero
                </span>

                <select
                  value={
                    genre
                  }
                  disabled={
                    filtersLoading
                  }
                  onChange={(
                    event
                  ) => {
                    setGenre(
                      event.target.value
                    );

                    resetPage();
                  }}
                >
                  <option value="">
                    Todos os gêneros
                  </option>

                  {filters.genres.map(
                    (
                      item
                    ) => (
                      <option
                        key={
                          item.id
                        }
                        value={
                          item.id
                        }
                      >
                        {
                          item.name
                        }
                      </option>
                    )
                  )}
                </select>
              </label>

              <label>
                <span>
                  Ano
                </span>

                <select
                  value={
                    year
                  }
                  onChange={(
                    event
                  ) => {
                    setYear(
                      event.target.value
                    );

                    resetPage();
                  }}
                >
                  <option value="">
                    Todos os anos
                  </option>

                  {years.map(
                    (
                      itemYear
                    ) => (
                      <option
                        key={
                          itemYear
                        }
                        value={
                          itemYear
                        }
                      >
                        {
                          itemYear
                        }
                      </option>
                    )
                  )}
                </select>
              </label>

              <label>
                <span>
                  Nota mínima
                </span>

                <select
                  value={
                    rating
                  }
                  onChange={(
                    event
                  ) => {
                    setRating(
                      event.target.value
                    );

                    resetPage();
                  }}
                >
                  <option value="">
                    Qualquer nota
                  </option>

                  {[5, 6, 7, 8, 9].map(
                    (
                      value
                    ) => (
                      <option
                        key={
                          value
                        }
                        value={
                          value
                        }
                      >
                        {value}+
                      </option>
                    )
                  )}
                </select>
              </label>

              <label>
                <span>
                  País de origem
                </span>

                <select
                  value={
                    country
                  }
                  onChange={(
                    event
                  ) => {
                    setCountry(
                      event.target.value
                    );

                    resetPage();
                  }}
                >
                  <option value="">
                    Todos os países
                  </option>

                  {COUNTRIES.map(
                    (
                      [
                        code,
                        name,
                      ]
                    ) => (
                      <option
                        key={
                          code
                        }
                        value={
                          code
                        }
                      >
                        {
                          name
                        }
                      </option>
                    )
                  )}
                </select>
              </label>

              <label className="discover-provider-field">
                <span>
                  Onde assistir no Brasil
                </span>

                <select
                  value={
                    provider
                  }
                  disabled={
                    filtersLoading
                  }
                  onChange={(
                    event
                  ) => {
                    setProvider(
                      event.target.value
                    );

                    resetPage();
                  }}
                >
                  <option value="">
                    Qualquer streaming
                  </option>

                  {filters.providers.map(
                    (
                      item
                    ) => (
                      <option
                        key={
                          item.provider_id
                        }
                        value={
                          item.provider_id
                        }
                      >
                        {
                          item.provider_name
                        }
                      </option>
                    )
                  )}
                </select>
              </label>

            </div>

            <div className="discover-personal-filters">

              <button
                type="button"
                className={
                  "discover-personal-filter " +
                  (hideWatched
                    ? "active"
                    : "")
                }
                onClick={() => {
                  setHideWatched(
                    (
                      value
                    ) =>
                      !value
                  );

                  resetPage();
                }}
              >
                <Check
                  size={17}
                />

                <div>
                  <strong>
                    Ocultar assistidos
                  </strong>

                  <span>
                    Esconde o que você já concluiu
                  </span>
                </div>
              </button>

              <button
                type="button"
                className={
                  "discover-personal-filter " +
                  (onlyNew
                    ? "active"
                    : "")
                }
                onClick={() => {
                  setOnlyNew(
                    (
                      value
                    ) =>
                      !value
                  );

                  resetPage();
                }}
              >
                <Plus
                  size={17}
                />

                <div>
                  <strong>
                    Só não adicionados
                  </strong>

                  <span>
                    Mostra apenas títulos fora da biblioteca
                  </span>
                </div>
              </button>

            </div>

            {activeFilters >
              0 && (
              <div className="discover-filter-footer">

                <button
                  type="button"
                  className="btn"
                  onClick={
                    clearFilters
                  }
                >
                  <RotateCcw
                    size={15}
                  />
                  Limpar filtros
                </button>

              </div>
            )}

          </div>

        </section>
      )}

      {loading ? (
        <div className="empty discover-loading">
          <Loader2
            className="spin"
            size={28}
          />

          <span>
            Carregando títulos...
          </span>
        </div>
      ) : items.length ===
        0 ? (
        <div className="empty">

          <Filter
            size={28}
          />

          <span>
            Nenhum título encontrado com esses filtros.
          </span>

        </div>
      ) : (
        <>

          {data?.personal_filters && (
            <div className="discover-personal-note muted">
              Filtros pessoais podem esconder alguns dos 27 resultados da página atual.
            </div>
          )}

          <section className="section">

            <div className="discover-grid">

              {items.map(
                (
                  item
                ) => {
                  const title =
                    item.title ||
                    item.name ||
                    "Sem título";

                  const itemYear =
                    (
                      item.release_date ||
                      item.first_air_date ||
                      ""
                    ).slice(
                      0,
                      4
                    );

                  const key =
                    `${item.media_type}-${item.id}`;

                  const isProcessing =
                    processing ===
                    key;

                  async function toggleFavorite(
                    item: DiscoverItem
                  ) {
                    if (
                      !item.library_id
                    ) {
                      return;
                    }

                    try {
                      setProcessing(
                        key
                      );

                      const response =
                        await fetch(
                          `/api/library/${item.library_id}`,
                          {
                            method:
                              "PATCH",

                            headers: {
                              "Content-Type":
                                "application/json",
                            },

                            body:
                              JSON.stringify({
                                favorite:
                                  !item.favorite,
                              }),
                          }
                        );

                      const result =
                        await response.json();

                      if (
                        !response.ok ||
                        result?.error
                      ) {
                        throw new Error(
                          result?.error ||
                            "Não foi possível alterar a curtida."
                        );
                      }

                      const nextFavorite =
                        Boolean(
                          result.favorite ??
                            !item.favorite
                        );

                      setData(
                        (
                          current
                        ) => {
                          if (
                            !current
                          ) {
                            return current;
                          }

                          return {
                            ...current,

                            results:
                              current.results.map(
                                (
                                  currentItem
                                ) =>
                                  currentItem.id ===
                                    item.id &&
                                  currentItem.media_type ===
                                    item.media_type
                                    ? {
                                        ...currentItem,
                                        favorite:
                                          nextFavorite,
                                      }
                                    : currentItem
                              ),
                          };
                        }
                      );

                      if (
                        previewItem?.id ===
                          item.id &&
                        previewItem?.media_type ===
                          item.media_type
                      ) {
                        setPreviewItem({
                          ...previewItem,
                          favorite:
                            nextFavorite,
                        });
                      }
                    } catch (
                      error
                    ) {
                      console.error(
                        error
                      );

                      toast.error(
                        error instanceof Error
                          ? error.message
                          : "Erro ao alterar curtida."
                      );
                    } finally {
                      setProcessing(
                        null
                      );
                    }
                  }

                  return (
                    <article
                      key={
                        key
                      }
                      className="card discover-card"
                    >

                      <div className="poster">

                        <Link
                          href={`/title/${item.media_type}/${item.id}`}
                        >
                          <img
                            src={img(
                              item.poster_path
                            )}
                            alt={
                              title
                            }
                            loading="lazy"
                          />
                        </Link>

                        <span className="badge">
                          {item.media_type ===
                          "tv"
                            ? "SÉRIE"
                            : "FILME"}
                        </span>

                        <div className="card-actions">

                          <button
                            type="button"
                            className="card-action"
                            title="Ver rápido"
                            aria-label={`Ver detalhes rápidos de ${title}`}
                            onClick={() =>
                              setPreviewItem(
                                item
                              )
                            }
                          >
                            <Eye
                              size={17}
                            />
                          </button>

                          {item.in_library ? (
                            <button
                              type="button"
                              className="card-action active discover-library-menu-button"
                              title="Alterar status da biblioteca"
                              disabled={
                                isProcessing
                              }
                              onMouseDown={(
                                event
                              ) => {
                                /*
                                 * Evita o foco do botão causar
                                 * reposicionamento da página.
                                 */
                                event.preventDefault();
                              }}
                              onClick={(
                                event
                              ) => {
                                event.preventDefault();
                                event.stopPropagation();

                                toggleStatusMenuWithoutScroll(
                                  key
                                );
                              }}
                            >
                              {isProcessing ? (
                                <Loader2
                                  size={16}
                                  className="spin"
                                />
                              ) : (
                                <>
                                  <Check
                                    size={16}
                                  />

                                  <ChevronDown
                                    size={12}
                                  />
                                </>
                              )}
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="card-action add"
                              title="Adicionar como Quero assistir"
                              disabled={
                                isProcessing
                              }
                              onClick={() =>
                                addToLibrary(
                                  item
                                )
                              }
                            >
                              {isProcessing ? (
                                <Loader2
                                  size={17}
                                  className="spin"
                                />
                              ) : (
                                <Plus
                                  size={18}
                                />
                              )}
                            </button>
                          )}

                          {item.in_library && (
                            <button
                              type="button"
                              className={
                                "card-action discover-favorite-button " +
                                (item.favorite
                                  ? "active"
                                  : "")
                              }
                              title={
                                item.favorite
                                  ? "Remover dos curtidos"
                                  : "Curtir título"
                              }
                              disabled={
                                isProcessing
                              }
                              onClick={(
                                event
                              ) => {
                                event.preventDefault();
                                event.stopPropagation();

                                toggleFavorite(
                                  item
                                );
                              }}
                            >
                              {isProcessing ? (
                                <Loader2
                                  size={16}
                                  className="spin"
                                />
                              ) : (
                                <Heart
                                  size={16}
                                  fill={
                                    item.favorite
                                      ? "currentColor"
                                      : "none"
                                  }
                                />
                              )}
                            </button>
                          )}

                        </div>

                        {item.in_library && (
                          <span className="discover-status-badge">
                            {getStatusLabel(
                              item.library_status
                            )}
                          </span>
                        )}

                      </div>

                      {item.in_library &&
                        openLibraryMenu ===
                          key && (
                        <div
                          className="discover-library-status-menu"
                          onClick={(
                            event
                          ) =>
                            event.stopPropagation()
                          }
                        >
                          <div className="discover-library-status-menu-head">
                            <span>
                              Status
                            </span>

                            <strong>
                              {getStatusLabel(
                                item.library_status
                              )}
                            </strong>
                          </div>

                          <div className="discover-library-status-options">
                            {DISCOVER_STATUS_OPTIONS.map(
                              (
                                [
                                  value,
                                  label,
                                ]
                              ) => (
                                <button
                                  type="button"
                                  key={
                                    value
                                  }
                                  className={
                                    item.library_status ===
                                    value
                                      ? "active"
                                      : ""
                                  }
                                  disabled={
                                    isProcessing
                                  }
                                  onClick={() =>
                                    updateLibraryStatus(
                                      item,
                                      value
                                    )
                                  }
                                >
                                  <span>
                                    {
                                      label
                                    }
                                  </span>

                                  {item.library_status ===
                                    value && (
                                    <Check
                                      size={14}
                                    />
                                  )}
                                </button>
                              )
                            )}
                          </div>

                          <div className="discover-library-status-divider" />

                          <button
                            type="button"
                            className="discover-library-remove"
                            disabled={
                              isProcessing
                            }
                            onClick={() =>
                              requestRemoveFromLibrary(
                                item
                              )
                            }
                          >
                            <Trash2
                              size={15}
                            />

                            Remover da biblioteca
                          </button>
                        </div>
                      )}

                      <Link
                        href={`/title/${item.media_type}/${item.id}`}
                        className="card-title"
                      >
                        {title}
                      </Link>

                      <div className="card-meta">

                        <span>
                          {itemYear ||
                            "—"}
                        </span>

                        {item.vote_average >
                          0 && (
                          <span className="rating">
                            <Star
                              size={12}
                              fill="currentColor"
                            />

                            {Number(
                              item.vote_average
                            ).toFixed(
                              1
                            )}
                          </span>
                        )}

                        {item.in_library && (
                          <span className="in-library">
                            <Check
                              size={12}
                            />

                            {getStatusLabel(
                              item.library_status
                            )}
                          </span>
                        )}

                      </div>

                    </article>
                  );
                }
              )}

            </div>

          </section>

          <section className="section discover-pagination-wrap">

            <div className="discover-page-info">
              Página{" "}
              <strong>
                {data?.page}
              </strong>{" "}
              de{" "}
              <strong>
                {data?.total_pages.toLocaleString(
                  "pt-BR"
                )}
              </strong>
            </div>

            <nav className="discover-pagination">

              <button
                type="button"
                className="discover-page-btn"
                disabled={
                  (data?.page ||
                    1) <=
                  1
                }
                onClick={() =>
                  goToPage(
                    (
                      data?.page ||
                      1
                    ) - 1
                  )
                }
                title="Página anterior"
              >
                <ChevronLeft
                  size={17}
                />
              </button>

              {pagination.map(
                (
                  value
                ) =>
                  typeof value ===
                  "number" ? (
                    <button
                      type="button"
                      key={
                        value
                      }
                      className={
                        "discover-page-btn " +
                        (value ===
                        data?.page
                          ? "active"
                          : "")
                      }
                      onClick={() =>
                        goToPage(
                          value
                        )
                      }
                    >
                      {value.toLocaleString(
                        "pt-BR"
                      )}
                    </button>
                  ) : (
                    <span
                      key={
                        value
                      }
                      className="discover-page-ellipsis"
                    >
                      …
                    </span>
                  )
              )}

              <button
                type="button"
                className="discover-page-btn"
                disabled={
                  (data?.page ||
                    1) >=
                  (data
                    ?.total_pages ||
                    1)
                }
                onClick={() =>
                  goToPage(
                    (
                      data?.page ||
                      1
                    ) + 1
                  )
                }
                title="Próxima página"
              >
                <ChevronRight
                  size={17}
                />
              </button>

            </nav>

          </section>

        </>
      )}

      {previewItem && (() => {
        const previewTitle =
          previewItem.title ||
          previewItem.name ||
          "Sem título";

        const previewYear =
          (
            previewItem.release_date ||
            previewItem.first_air_date ||
            ""
          ).slice(0, 4);

        const previewGenres =
          Array.isArray(
            previewItem.genre_ids
          )
            ? previewItem.genre_ids
                .map(
                  (
                    genreId
                  ) =>
                    filters.genres.find(
                      (
                        item
                      ) =>
                        item.id ===
                        genreId
                    )?.name
                )
                .filter(
                  (
                    name
                  ): name is string =>
                    Boolean(
                      name
                    )
                )
            : [];

        const previewKey =
          `${previewItem.media_type}-${previewItem.id}`;

        const previewProcessing =
          processing ===
          previewKey;

        return (
          <div
            className="discover-preview-backdrop"
            role="presentation"
            onMouseDown={(event) => {
              if (
                event.target ===
                event.currentTarget
              ) {
                setPreviewItem(
                  null
                );
              }
            }}
          >
            <section
              className="panel discover-preview-modal"
              role="dialog"
              aria-modal="true"
              aria-label={`Detalhes rápidos de ${previewTitle}`}
            >
              <button
                type="button"
                className="discover-preview-close"
                title="Fechar"
                aria-label="Fechar"
                onClick={() =>
                  setPreviewItem(
                    null
                  )
                }
              >
                <X size={18} />
              </button>

              <div className="discover-preview-poster">
                <img loading="lazy" decoding="async"
                  src={img(
                    previewItem.poster_path
                  )}
                  alt={previewTitle}
                />
              </div>

              <div className="discover-preview-content">
                <div className="eyebrow">
                  {previewItem.media_type ===
                  "tv"
                    ? "Série"
                    : "Filme"}
                </div>

                <h2>
                  {previewTitle}
                </h2>

                <div className="discover-preview-meta">
                  <span>
                    {previewYear ||
                      "Ano não informado"}
                  </span>

                  {previewItem.vote_average >
                    0 && (
                    <span className="rating">
                      <Star
                        size={14}
                        fill="currentColor"
                      />
                      {Number(
                        previewItem.vote_average
                      ).toFixed(1)}
                    </span>
                  )}

                  {previewItem.in_library && (
                    <span className="in-library">
                      <Check size={13} />
                      Na biblioteca
                    </span>
                  )}
                </div>

                {previewGenres.length > 0 && (
                  <div className="discover-preview-genres">
                    {previewGenres.map(
                      (
                        genreName
                      ) => (
                        <span
                          key={
                            genreName
                          }
                        >
                          {
                            genreName
                          }
                        </span>
                      )
                    )}
                  </div>
                )}

                <PreviewWatchProviders
                  details={previewDetails}
                  loading={previewDetailsLoading}
                />

                {previewItem.in_library &&
                  previewItem.library_id && (
                  <div className="preview-personal-rating">
                    <div className="preview-personal-rating-head">
                      <span>
                        Minha nota
                      </span>

                      <strong>
                        {previewItem.personal_rating !==
                          null &&
                        previewItem.personal_rating !==
                          undefined
                          ? Number(
                              previewItem.personal_rating
                            ).toFixed(1)
                          : "Sem nota"}
                      </strong>
                    </div>

                    <div className="preview-rating-options">
                      {[1,2,3,4,5,6,7,8,9,10].map(
                        (
                          value
                        ) => (
                          <button
                            type="button"
                            key={
                              value
                            }
                            className={
                              Number(
                                previewItem.personal_rating
                              ) === value
                                ? "active"
                                : ""
                            }
                            disabled={
                              processing ===
                              `${previewItem.media_type}-${previewItem.id}`
                            }
                            onClick={() =>
                              updatePersonalRating(
                                previewItem,
                                value
                              )
                            }
                          >
                            {
                              value
                            }
                          </button>
                        )
                      )}

                      <button
                        type="button"
                        className="clear"
                        disabled={
                          processing ===
                          `${previewItem.media_type}-${previewItem.id}`
                        }
                        onClick={() =>
                          updatePersonalRating(
                            previewItem,
                            null
                          )
                        }
                      >
                        Limpar
                      </button>
                    </div>
                  </div>
                )}

                <p className="discover-preview-overview">
                  {previewItem.overview?.trim() ||
                    "Ainda não há sinopse disponível para este título."}
                </p>

                <div className="discover-preview-actions">
                  <Link
                    href={`/title/${previewItem.media_type}/${previewItem.id}`}
                    className="btn primary"
                  >
                    Ver página completa
                  </Link>

                  {!previewItem.in_library && (
                    <button
                      type="button"
                      className="btn"
                      disabled={
                        previewProcessing
                      }
                      onClick={async () => {
                        await addToLibrary(
                          previewItem
                        );

                        setPreviewItem(
                          (current) =>
                            current
                              ? {
                                  ...current,
                                  in_library:
                                    true,
                                  library_status:
                                    "want",
                                }
                              : current
                        );
                      }}
                    >
                      {previewProcessing ? (
                        <Loader2
                          size={16}
                          className="spin"
                        />
                      ) : (
                        <Plus size={17} />
                      )}
                      Quero assistir
                    </button>
                  )}
                </div>
              </div>
            </section>
          </div>
        );
      })()}

      {removeTarget && (
        <div
          className="mycatalog-confirm-backdrop"
          onClick={() =>
            setRemoveTarget(
              null
            )
          }
        >
          <div
  className="mycatalog-confirm-modal"
  role="alertdialog"
  aria-modal="true"
  aria-labelledby="discover-remove-title"
  onClick={(event) =>
              event.stopPropagation()
            }
          >
            <div className="mycatalog-confirm-icon danger">
              <Trash2
                size={20}
              />
            </div>

            <div>
              <div className="eyebrow">
                Remover da biblioteca
              </div>

              <h3 id="discover-remove-title">
                Remover “{
                  removeTarget.title ||
                  removeTarget.name ||
                  "este título"
                }”?
              </h3>

              <p className="muted">
                O título será removido da sua biblioteca.
                Você poderá adicioná-lo novamente depois.
              </p>
            </div>

            <label className="mycatalog-confirm-option">
              <input
                type="checkbox"
                checked={
                  skipRemoveConfirm
                }
                onChange={(event) => {
                  const checked =
                    event.target.checked;

                  setSkipRemoveConfirm(
                    checked
                  );

                  try {
                    localStorage.setItem(
                      "mycatalog_skip_remove_confirm",
                      checked
                        ? "1"
                        : "0"
                    );
                  } catch {
                    // localStorage indisponível
                  }
                }}
              />

              <span>
                Não mostrar novamente
              </span>
            </label>

            <div className="mycatalog-confirm-actions">
              <button
                type="button"
                className="btn"
                onClick={() =>
                  setRemoveTarget(
                    null
                  )
                }
              >
                Cancelar
              </button>

              <button
                type="button"
                className="btn danger"
                disabled={
                  processing ===
                  `${removeTarget.media_type}-${removeTarget.id}`
                }
                onClick={() =>
                  performRemoveFromLibrary(
                    removeTarget
                  )
                }
              >
                {processing ===
                `${removeTarget.media_type}-${removeTarget.id}` ? (
                  <Loader2
                    size={16}
                    className="spin"
                  />
                ) : (
                  <Trash2
                    size={16}
                  />
                )}

                Remover
              </button>
            </div>
          </div>
        </div>
      )}

    </>
  );
}

function PreviewWatchProviders({
  details,
  loading,
}: {
  details: any;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="preview-watch-box">
        <span className="muted">
          Carregando onde assistir...
        </span>
      </div>
    );
  }

  const brazilWatch =
    details?.watch_providers
      ?.results?.BR ||
    null;

  if (!brazilWatch) {
    return null;
  }

  const subscription =
    [
      ...(Array.isArray(
        brazilWatch.flatrate
      )
        ? brazilWatch.flatrate
        : []),

      ...(Array.isArray(
        brazilWatch.free
      )
        ? brazilWatch.free
        : []),

      ...(Array.isArray(
        brazilWatch.ads
      )
        ? brazilWatch.ads
        : []),
    ].filter(
      (
        provider: any,
        index: number,
        all: any[]
      ) =>
        all.findIndex(
          (item) =>
            item.provider_id ===
            provider.provider_id
        ) === index
    );

  const rent =
    Array.isArray(
      brazilWatch.rent
    )
      ? brazilWatch.rent
      : [];

  const buy =
    Array.isArray(
      brazilWatch.buy
    )
      ? brazilWatch.buy
      : [];

  if (
    subscription.length === 0 &&
    rent.length === 0 &&
    buy.length === 0
  ) {
    return null;
  }

  return (
    <div className="preview-watch-box">
      <div className="preview-watch-head">
        Onde assistir no Brasil
      </div>

      {subscription.length > 0 && (
        <PreviewWatchRow
          label="Streaming"
          providers={
            subscription
          }
        />
      )}

      {rent.length > 0 && (
        <PreviewWatchRow
          label="Aluguel"
          providers={rent}
        />
      )}

      {buy.length > 0 && (
        <PreviewWatchRow
          label="Compra"
          providers={buy}
        />
      )}
    </div>
  );
}

function PreviewWatchRow({
  label,
  providers,
}: {
  label: string;
  providers: any[];
}) {
  return (
    <div className="preview-watch-row">
      <strong>
        {label}
      </strong>

      <div className="preview-watch-provider-list">
        {providers.map(
          (provider: any) => (
            <div
              key={
                provider.provider_id
              }
              className="preview-watch-provider"
              title={
                provider.provider_name
              }
            >
              {provider.logo_path ? (
                <img
                  src={img(
                    provider.logo_path,
                    "w92"
                  )}
                  alt={
                    provider.provider_name
                  }
                  loading="lazy"
                />
              ) : (
                <span>
                  {String(
                    provider.provider_name ||
                      "?"
                  ).slice(0, 1)}
                </span>
              )}
            </div>
          )
        )}
      </div>
    </div>
  );
}
