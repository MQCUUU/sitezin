"use client";

import {
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  usePathname,
  useRouter,
  useSearchParams,
} from "next/navigation";

import {
  ArrowDownUp,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Database,
  Film,
  Heart,
  Loader2,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Star,
  Tag,
  Tv,
  X,
} from "lucide-react";

import { PosterGrid } from "@/components/PosterGrid";
import { AddToListDialog } from "@/components/lists/AddToListDialog";

import type {
  LibraryItem,
  Status,
} from "@/lib/types";

import {
  STATUS_LABELS,
} from "@/lib/types";

import {
  readPreferences,
} from "@/lib/preferences";

type SortOption =
  | "added"
  | "updated"
  | "rating"
  | "rating-low"
  | "tmdb"
  | "az"
  | "za"
  | "newest"
  | "oldest";

type ViewMode =
  | "grid"
  | "compact"
  | "list";

type PaginatedResponse = {
  items: any[];

  page: number;

  per_page: number;

  total_pages: number;

  total_results: number;

  total_library: number;

  counts: Record<
    string,
    number
  >;

  genres: string[];

  years: string[];
};

const PER_PAGE =
  27;

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
      let value = 1;
      value <= total;
      value++
    ) {
      values.push(
        value
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
    let value =
      start;
    value <= end;
    value++
  ) {
    values.push(
      value
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

export default function Library() {
  return (
    <Suspense
      fallback={
        <div className="empty library-page-loading" role="status" aria-live="polite">
          <Loader2 size={25} className="spin" />
          <span>Carregando biblioteca...</span>
        </div>
      }
    >
      <LibraryContent />
    </Suspense>
  );
}

function LibraryContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [
    data,
    setData,
  ] =
    useState<
      LibraryItem[]
    >([]);

  /*
   * ==========================================
   * ESTADO DE FILTROS — INICIALIZADO DA URL (D1)
   * ==========================================
   *
   * `useSearchParams()` já está disponível no primeiro render (dentro
   * do <Suspense> acima), então os filtros nascem com o valor certo
   * sem precisar de um useEffect de "inicialização" rodando depois do
   * primeiro paint. Isso corrige back/forward/refresh/compartilhar
   * link: a URL é a fonte da verdade, não um efeito colateral dela.
   *
   * `view mode` é a ÚNICA exceção — fica fora da URL, só em
   * localStorage (decisão de produto fechada do D1).
   */
  const urlTypeParam = searchParams.get("type");
  const urlStatusParam = searchParams.get("status");
  const urlSortParam = searchParams.get("sort");
  const urlSearchParam = searchParams.get("search") || "";
  const urlGenreParam = searchParams.get("genre") || "all";
  const urlYearParam = searchParams.get("year") || "all";
  const urlFavoriteParam = searchParams.get("favorite") === "true";
  const urlMinRatingParam = searchParams.get("min_rating") || "all";
  const urlMinTmdbRatingParam = searchParams.get("min_tmdb_rating") || "all";
  const urlPageParam = Number(searchParams.get("page") || "1");

  const [
    type,
    setType,
  ] =
    useState<
      "all" |
      "movie" |
      "tv"
    >(
      urlTypeParam === "movie" || urlTypeParam === "tv" ? urlTypeParam : "all"
    );

  const [
    status,
    setStatus,
  ] =
    useState<
      "all" |
      Status
    >(
      (urlStatusParam as Status) || "all"
    );

  const [
    sort,
    setSort,
  ] =
    useState<
      SortOption
    >(
      () => {
        if (urlSortParam) return urlSortParam as SortOption;

        if (
          typeof window ===
          "undefined"
        ) {
          return "added";
        }

        return (
          readPreferences()
            .defaultSort ||
          "added"
        ) as SortOption;
      }
    );

  const [
    search,
    setSearch,
  ] =
    useState(
      urlSearchParam
    );

  const [
    debouncedSearch,
    setDebouncedSearch,
  ] =
    useState(
      urlSearchParam
    );

  const [
    genre,
    setGenre,
  ] =
    useState(
      urlGenreParam
    );

  const [
    year,
    setYear,
  ] =
    useState(
      urlYearParam
    );

  const [
    favoriteOnly,
    setFavoriteOnly,
  ] =
    useState(
      urlFavoriteParam
    );

  const [
    minRating,
    setMinRating,
  ] =
    useState(
      urlMinRatingParam
    );

  const [
    minTmdbRating,
    setMinTmdbRating,
  ] =
    useState(
      urlMinTmdbRatingParam
    );

  const [
    showFilters,
    setShowFilters,
  ] =
    useState(
      false
    );

  const [
    viewMode,
    setViewMode,
  ] =
    useState<
      ViewMode
    >(
      () => {
        if (typeof window === "undefined") return "grid";

        try {
          const stored = window.localStorage.getItem("mycatalog_library_view_mode");
          if (stored === "grid" || stored === "compact" || stored === "list") {
            return stored;
          }
        } catch {
          // localStorage indisponível — usa o padrão.
        }

        return "grid";
      }
    );

  useEffect(() => {
    try {
      window.localStorage.setItem("mycatalog_library_view_mode", viewMode);
    } catch {
      // localStorage indisponível — a preferência só não persiste.
    }
  }, [viewMode]);

  const [
    page,
    setPage,
  ] =
    useState(
      Number.isFinite(urlPageParam) && urlPageParam > 0 ? Math.floor(urlPageParam) : 1
    );

  const [
    totalPages,
    setTotalPages,
  ] =
    useState(
      1
    );

  const [
    totalResults,
    setTotalResults,
  ] =
    useState(
      0
    );

  const [
    totalLibrary,
    setTotalLibrary,
  ] =
    useState(
      0
    );

  const [
    quickCounts,
    setQuickCounts,
  ] =
    useState<
      Record<
        string,
        number
      >
    >({
      all: 0,
      want: 0,
      watching: 0,
      watched: 0,
      paused: 0,
      dropped: 0,
      rewatching: 0,
      rewatched: 0,
      favorites: 0,
    });

  const [
    genres,
    setGenres,
  ] =
    useState<
      string[]
    >([]);

  const [
    years,
    setYears,
  ] =
    useState<
      string[]
    >([]);

  const [
    loading,
    setLoading,
  ] =
    useState(
      true
    );

  const [
    authRequired,
    setAuthRequired,
  ] =
    useState(
      false
    );

  const [
    loadError,
    setLoadError,
  ] =
    useState(
      false
    );

  const [
    retryTick,
    setRetryTick,
  ] =
    useState(
      0
    );

  function retryLoad() {
    setLoadError(false);
    setRetryTick((tick) => tick + 1);
  }

  const [addToListTarget, setAddToListTarget] = useState<LibraryItem | null>(null);

  /*
   * ==========================================
   * URL <- ESTADO (D1)
   * ==========================================
   *
   * Direção inversa do efeito de inicialização: sempre que um filtro
   * muda, a URL é atualizada via router.replace (sem empilhar
   * histórico a cada tecla digitada — só a navegação real do usuário,
   * como voltar para a Home, deve empilhar). Isso é o que permite
   * back/forward/refresh/compartilhar link funcionarem de verdade.
   *
   * `viewMode` fica de fora de propósito (decisão de produto: só
   * localStorage).
   */
  useEffect(() => {
    const params = new URLSearchParams();

    if (page > 1) params.set("page", String(page));
    if (type !== "all") params.set("type", type);
    if (status !== "all") params.set("status", status);
    if (favoriteOnly) params.set("favorite", "true");
    if (genre !== "all") params.set("genre", genre);
    if (year !== "all") params.set("year", year);
    if (minRating !== "all") params.set("min_rating", minRating);
    if (minTmdbRating !== "all") params.set("min_tmdb_rating", minTmdbRating);
    if (sort !== "added") params.set("sort", sort);
    if (debouncedSearch) params.set("search", debouncedSearch);

    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, type, status, favoriteOnly, genre, year, minRating, minTmdbRating, sort, debouncedSearch]);

  /*
   * ==========================================
   * RESET DE PÁGINA CENTRALIZADO (D1)
   * ==========================================
   *
   * Antes, cada onChange de filtro chamava resetPage() manualmente —
   * fácil de esquecer em um novo filtro. Agora existe uma única regra:
   * qualquer mudança nos filtros abaixo (não a página em si) volta
   * para a página 1. Os resetPage() que já existiam nos handlers viram
   * no-ops redundantes (ainda seguros de manter) em vez de serem a
   * única linha de defesa.
   */
  const filtersFingerprint = JSON.stringify([
    type, status, favoriteOnly, genre, year, minRating, minTmdbRating, sort, debouncedSearch,
  ]);
  const previousFiltersFingerprint = useRef(filtersFingerprint);

  useEffect(() => {
    if (previousFiltersFingerprint.current === filtersFingerprint) return;
    previousFiltersFingerprint.current = filtersFingerprint;
    setPage(1);
  }, [filtersFingerprint]);

  /*
   * ==========================================
   * PESQUISA COM DEBOUNCE
   * ==========================================
   */

  useEffect(() => {
    const timer =
      window.setTimeout(
        () => {
          setDebouncedSearch(
            search.trim()
          );

          setPage(
            1
          );
        },
        250
      );

    return () => {
      clearTimeout(
        timer
      );
    };
  }, [
    search,
  ]);

  /*
   * ==========================================
   * CARREGAR BIBLIOTECA PAGINADA
   * ==========================================
   */

  async function loadLibrary() {
    try {
      setLoading(
        true
      );

      const params =
        new URLSearchParams({
          paginated:
            "true",

          page:
            String(
              page
            ),

          limit:
            String(
              PER_PAGE
            ),

          sort,
        });

      if (
        debouncedSearch
      ) {
        params.set(
          "search",
          debouncedSearch
        );
      }

      if (
        type !== "all"
      ) {
        params.set(
          "media_type",
          type
        );
      }

      if (
        status !== "all"
      ) {
        params.set(
          "status",
          status
        );
      }

      if (
        genre !== "all"
      ) {
        params.set(
          "genre",
          genre
        );
      }

      if (
        year !== "all"
      ) {
        params.set(
          "year",
          year
        );
      }

      if (
        favoriteOnly
      ) {
        params.set(
          "favorite",
          "true"
        );
      }

      if (
        minRating !==
        "all"
      ) {
        params.set(
          "min_rating",
          minRating
        );
      }

      if (
        minTmdbRating !==
        "all"
      ) {
        params.set(
          "min_tmdb_rating",
          minTmdbRating
        );
      }

      const response =
        await fetch(
          `/api/library?${params.toString()}`,
          {
            cache:
              "no-store",
          }
        );

      if (response.status === 401) {
        setAuthRequired(true);
        setData([]);
        setTotalResults(0);
        return;
      }

      const result:
        PaginatedResponse |
        {
          error:
            string;
        } =
        await response.json();

      if (
        !response.ok ||
        "error" in
          result
      ) {
        throw new Error(
          "error" in
            result
            ? result.error
            : "Erro ao carregar biblioteca."
        );
      }

      setAuthRequired(false);
      setLoadError(false);

      const library =
        Array.isArray(
          result.items
        )
          ? result.items.map(
              (
                item: any
              ) => ({
                ...item,

                library_id:
                  item.id,

                ...item.media,
              })
            )
          : [];

      setData(
        library
      );

      setTotalPages(
        Number(
          result.total_pages ||
            1
        )
      );

      setTotalResults(
        Number(
          result.total_results ||
            0
        )
      );

      setTotalLibrary(
        Number(
          result.total_library ||
            0
        )
      );

      setQuickCounts(
        result.counts ||
          {}
      );

      setGenres(
        Array.isArray(
          result.genres
        )
          ? result.genres
          : []
      );

      setYears(
        Array.isArray(
          result.years
        )
          ? result.years
          : []
      );

      if (
        Number(
          result.page
        ) !== page
      ) {
        setPage(
          Number(
            result.page
          ) || 1
        );
      }
    } catch (
      error
    ) {
      console.error(
        "Erro ao carregar biblioteca:",
        error
      );

      setLoadError(true);

      setData(
        []
      );

      setTotalResults(
        0
      );
    } finally {
      setLoading(
        false
      );
    }
  }

  useEffect(() => {
    loadLibrary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    page,
    debouncedSearch,
    type,
    status,
    genre,
    year,
    favoriteOnly,
    minRating,
    minTmdbRating,
    sort,
    retryTick,
  ]);

  /*
   * ==========================================
   * RESETAR PARA PÁGINA 1 AO FILTRAR
   * ==========================================
   */

  function resetPage() {
    setPage(
      1
    );
  }

  const quickStatuses =
    [
      [
        "all",
        "Todos",
      ],

      ...Object.entries(
        STATUS_LABELS
      ),
    ] as const;

  const defaultSort =
    useMemo(
      () => {
        if (
          typeof window ===
          "undefined"
        ) {
          return "added";
        }

        return (
          readPreferences()
            .defaultSort ||
          "added"
        ) as SortOption;
      },
      []
    );

  const activeFilters =
    Number(
      type !==
        "all"
    ) +
    Number(
      status !==
        "all"
    ) +
    Number(
      genre !==
        "all"
    ) +
    Number(
      year !==
        "all"
    ) +
    Number(
      favoriteOnly
    ) +
    Number(
      minRating !==
        "all"
    ) +
    Number(
      minTmdbRating !==
        "all"
    ) +
    Number(
      sort !==
        defaultSort
    );

  function clearFilters() {
    const preferences =
      readPreferences();

    setType(
      "all"
    );

    setStatus(
      "all"
    );

    setGenre(
      "all"
    );

    setYear(
      "all"
    );

    setFavoriteOnly(
      false
    );

    setMinRating(
      "all"
    );

    setMinTmdbRating(
      "all"
    );

    setSort(
      (
        preferences.defaultSort ||
        "added"
      ) as SortOption
    );

    setPage(
      1
    );
  }

  function clearAll() {
    clearFilters();

    setSearch(
      ""
    );

    setDebouncedSearch(
      ""
    );

    setPage(
      1
    );

    /*
     * Não precisa mais de window.history.replaceState manual — o
     * efeito de sincronização URL<-estado detecta os filtros voltando
     * ao padrão e já limpa a query string sozinho.
     */
  }

  function goToPage(
    target:
      number
  ) {
    const next =
      Math.min(
        Math.max(
          target,
          1
        ),
        totalPages
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

  const pagination =
    useMemo(
      () =>
        buildPages(
          page,
          totalPages
        ),
      [
        page,
        totalPages,
      ]
    );

  return (
    <>

      {/* BUSCA */}

      <div className="topbar">

        <div className="library-search">

          <Search
            size={17}
          />

          <input
            value={
              search
            }
            onChange={(
              event
            ) =>
              setSearch(
                event.target.value
              )
            }
            placeholder="Buscar na biblioteca..."
          />

          {search && (
            <button
              type="button"
              onClick={() =>
                setSearch(
                  ""
                )
              }
              title="Limpar busca"
              aria-label="Limpar busca"
            >
              <X
                size={15}
              />
            </button>
          )}

        </div>

      </div>

      {/* CABEÇALHO */}

      <div className="library-head">

        <div>

          <div className="eyebrow">
            Minha coleção
          </div>

          <h1
            style={{
              margin:
                "5px 0",
            }}
          >
            Biblioteca
          </h1>

          <div className="muted">
            {totalResults} de{" "}
            {totalLibrary}{" "}
            {totalLibrary ===
            1
              ? "título"
              : "títulos"}
          </div>

        </div>

        <div className="library-head-actions">

          <button
            type="button"
            className={
              "btn " +
              (favoriteOnly
                ? "primary"
                : "")
            }
            aria-pressed={favoriteOnly}
            onClick={() => {
              setFavoriteOnly(
                (
                  value
                ) =>
                  !value
              );

              resetPage();
            }}
          >
            <Heart
              size={16}
              fill={
                favoriteOnly
                  ? "currentColor"
                  : "none"
              }
            />

            Curtidos
          </button>

          <button
            type="button"
            className={
              "btn " +
              (showFilters
                ? "primary"
                : "")
            }
            aria-expanded={showFilters}
            aria-controls="library-filters-panel"
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
              <span className="library-active-filter-count">
                {
                  activeFilters
                }
              </span>
            )}
          </button>

        </div>

      </div>

      {/* FILTROS RÁPIDOS */}

      <div className="library-quick-toolbar">

        <div className="library-quick-filters">

          {quickStatuses.map(
            (
              [
                value,
                label,
              ]
            ) => {
              const active =
                status ===
                  value &&
                !favoriteOnly;

              return (
                <button
                  key={
                    value
                  }
                  type="button"
                  className={
                    "library-quick-filter " +
                    (active
                      ? "active"
                      : "")
                  }
                  aria-pressed={active}
                  onClick={() => {
                    setStatus(
                      value ===
                        "all"
                        ? "all"
                        : (
                            value as Status
                          )
                    );

                    setFavoriteOnly(
                      false
                    );

                    resetPage();
                  }}
                >
                  <span>
                    {
                      label
                    }
                  </span>

                  <b>
                    {
                      quickCounts[
                        value
                      ] || 0
                    }
                  </b>
                </button>
              );
            }
          )}

          <button
            type="button"
            className={
              "library-quick-filter " +
              (favoriteOnly
                ? "active"
                : "")
            }
            aria-pressed={favoriteOnly}
            onClick={() => {
              setFavoriteOnly(
                true
              );

              setStatus(
                "all"
              );

              resetPage();
            }}
          >
            <Heart
              size={14}
              fill={
                favoriteOnly
                  ? "currentColor"
                  : "none"
              }
            />

            <span>
              Curtidos
            </span>

            <b>
              {
                quickCounts.favorites ||
                0
              }
            </b>
          </button>

        </div>

        <label className="library-quick-sort">

          <ArrowDownUp
            size={16}
          />

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
                event.target
                  .value as SortOption
              );

              resetPage();
            }}
          >
            <option value="added">
              Adicionados recentemente
            </option>

            <option value="updated">
              Atualizados recentemente
            </option>

            <option value="rating">
              Maior nota pessoal
            </option>

            <option value="rating-low">
              Menor nota pessoal
            </option>

            <option value="tmdb">
              Maior nota TMDB
            </option>

            <option value="az">
              Título A-Z
            </option>

            <option value="za">
              Título Z-A
            </option>

            <option value="newest">
              Lançamento mais recente
            </option>

            <option value="oldest">
              Lançamento mais antigo
            </option>
          </select>

        </label>

      </div>

      {/* FILTROS AVANÇADOS */}

      {showFilters && (
        <div className="library-filter-panel" id="library-filters-panel">

          <div className="library-filter-header">

            <div>
              <div className="eyebrow">
                Personalização
              </div>

              <h2>
                Filtros da biblioteca
              </h2>

              <p>
                Encontre exatamente o que você quer assistir.
              </p>
            </div>

            <div className="library-filter-header-actions">

              <span className="library-filter-count">
                {
                  totalResults
                }{" "}
                resultados
              </span>

              <button
                type="button"
                className="library-filter-close"
                onClick={() =>
                  setShowFilters(
                    false
                  )
                }
                title="Fechar filtros"
                aria-label="Fechar filtros"
              >
                <X
                  size={17}
                />
              </button>

            </div>

          </div>

          <div className="library-filter-divider" />

          {/* TIPO */}

          <section className="library-filter-section">

            <div className="library-filter-section-title">

              <Film
                size={17}
              />

              <div>
                <strong>
                  Tipo de conteúdo
                </strong>

                <span>
                  Escolha entre filmes e séries
                </span>
              </div>

            </div>

            <div className="library-filter-options">

              {[
                [
                  "all",
                  "Todos",
                ],
                [
                  "movie",
                  "Filmes",
                ],
                [
                  "tv",
                  "Séries",
                ],
              ].map(
                (
                  [
                    value,
                    label,
                  ]
                ) => (
                  <button
                    key={
                      value
                    }
                    className={
                      "library-filter-option " +
                      (type ===
                      value
                        ? "active"
                        : "")
                    }
                    onClick={() => {
                      setType(
                        value as
                          | "all"
                          | "movie"
                          | "tv"
                      );

                      resetPage();
                    }}
                  >
                    {value ===
                      "movie" && (
                      <Film
                        size={14}
                      />
                    )}

                    {value ===
                      "tv" && (
                      <Tv
                        size={14}
                      />
                    )}

                    {
                      label
                    }
                  </button>
                )
              )}

            </div>

          </section>

          {/* STATUS */}

          <section className="library-filter-section">

            <div className="library-filter-section-title">

              <Database
                size={17}
              />

              <div>
                <strong>
                  Status
                </strong>

                <span>
                  Filtre pelo seu progresso
                </span>
              </div>

            </div>

            <div className="library-filter-options">

              <button
                className={
                  "library-filter-option " +
                  (status ===
                  "all"
                    ? "active"
                    : "")
                }
                onClick={() => {
                  setStatus(
                    "all"
                  );

                  resetPage();
                }}
              >
                Todos
              </button>

              {Object.entries(
                STATUS_LABELS
              ).map(
                (
                  [
                    value,
                    label,
                  ]
                ) => (
                  <button
                    key={
                      value
                    }
                    className={
                      "library-filter-option " +
                      (status ===
                      value
                        ? "active"
                        : "")
                    }
                    onClick={() => {
                      setStatus(
                        value as Status
                      );

                      resetPage();
                    }}
                  >
                    {
                      label
                    }
                  </button>
                )
              )}

            </div>

          </section>

          {/* FAVORITOS */}

          <section className="library-filter-section">

            <button
              type="button"
              className={
                "library-special-filter " +
                (favoriteOnly
                  ? "active"
                  : "")
              }
              onClick={() => {
                setFavoriteOnly(
                  (
                    value
                  ) =>
                    !value
                );

                resetPage();
              }}
            >

              <div className="library-special-icon">

                <Heart
                  size={18}
                  fill={
                    favoriteOnly
                      ? "currentColor"
                      : "none"
                  }
                />

              </div>

              <div>
                <strong>
                  Apenas curtidos
                </strong>

                <span>
                  Mostrar somente títulos curtidos
                </span>
              </div>

              <div
                className={
                  "library-toggle " +
                  (favoriteOnly
                    ? "active"
                    : "")
                }
              >
                <span />
              </div>

            </button>

          </section>

          {/* CATEGORIA / ANO */}

          <section className="library-filter-section">

            <div className="library-filter-section-title">

              <Tag
                size={17}
              />

              <div>
                <strong>
                  Categoria e período
                </strong>

                <span>
                  Refine sua biblioteca
                </span>
              </div>

            </div>

            <div className="library-filter-grid">

              <div className="library-filter-box">

                <div className="library-filter-box-icon">
                  <Tag
                    size={17}
                  />
                </div>

                <div className="library-filter-box-content">

                  <span>
                    Gênero
                  </span>

                  <select
                    value={
                      genre
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
                    <option value="all">
                      Todos os gêneros
                    </option>

                    {genres.map(
                      (
                        name
                      ) => (
                        <option
                          key={
                            name
                          }
                          value={
                            name
                          }
                        >
                          {
                            name
                          }
                        </option>
                      )
                    )}
                  </select>

                </div>

              </div>

              <div className="library-filter-box">

                <div className="library-filter-box-icon">
                  <CalendarDays
                    size={17}
                  />
                </div>

                <div className="library-filter-box-content">

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
                    <option value="all">
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

                </div>

              </div>

            </div>

          </section>

          {/* NOTAS */}

          <section className="library-filter-section">

            <div className="library-filter-section-title">

              <Star
                size={17}
              />

              <div>
                <strong>
                  Notas mínimas
                </strong>

                <span>
                  Mostre somente títulos acima de determinada nota
                </span>
              </div>

            </div>

            <div className="library-rating-row">

              <RatingFilter
                label="Sua nota pessoal"
                value={
                  minRating
                }
                onChange={(
                  value
                ) => {
                  setMinRating(
                    value
                  );

                  resetPage();
                }}
              />

              <RatingFilter
                label="Nota do TMDB"
                value={
                  minTmdbRating
                }
                onChange={(
                  value
                ) => {
                  setMinTmdbRating(
                    value
                  );

                  resetPage();
                }}
              />

            </div>

          </section>

          {/* ORDENAÇÃO */}

          <section className="library-filter-section">

            <div className="library-filter-section-title">

              <ArrowDownUp
                size={17}
              />

              <div>
                <strong>
                  Ordenação
                </strong>

                <span>
                  Escolha como os títulos serão organizados
                </span>
              </div>

            </div>

            <div className="library-sort-current">

              <span>
                Ordenar biblioteca por
              </span>

              <select
                value={
                  sort
                }
                onChange={(
                  event
                ) => {
                  setSort(
                    event.target
                      .value as SortOption
                  );

                  resetPage();
                }}
              >
                <option value="added">
                  Adicionados recentemente
                </option>

                <option value="updated">
                  Atualizados recentemente
                </option>

                <option value="rating">
                  Maior nota pessoal
                </option>

                <option value="rating-low">
                  Menor nota pessoal
                </option>

                <option value="tmdb">
                  Maior nota TMDB
                </option>

                <option value="az">
                  Título A-Z
                </option>

                <option value="za">
                  Título Z-A
                </option>

                <option value="newest">
                  Lançamento mais recente
                </option>

                <option value="oldest">
                  Lançamento mais antigo
                </option>
              </select>

            </div>

          </section>

          {activeFilters >
            0 && (
            <div className="library-filter-footer">

              <button
                type="button"
                className="library-clear-filters"
                onClick={
                  clearFilters
                }
              >
                <RotateCcw
                  size={14}
                />
                Limpar todos os filtros
              </button>

            </div>
          )}

        </div>
      )}

      {/* GRID */}

      {loading ? (
        <div className="empty library-page-loading" role="status" aria-live="polite">

          <Loader2
            size={25}
            className="spin"
          />

          <span>
            Carregando biblioteca...
          </span>

        </div>
      ) : authRequired ? (
        <div className="empty" role="alert">
          <strong>Sua sessão expirou.</strong>
          <p className="muted">
            Entre novamente para ver sua biblioteca.
          </p>
          <a
            className="btn primary"
            href={`/login?reason=session&next=${encodeURIComponent(
              pathname + (searchParams.toString() ? `?${searchParams.toString()}` : "")
            )}`}
          >
            Entrar
          </a>
        </div>
      ) : loadError ? (
        <div className="empty" role="alert">
          <strong>Não foi possível carregar sua biblioteca.</strong>
          <p className="muted">
            Verifique sua conexão e tente novamente.
          </p>
          <button
            type="button"
            className="btn primary"
            onClick={retryLoad}
          >
            Tentar de novo
          </button>
        </div>
      ) : (
        <PosterGrid
          items={
            data
          }
          onChanged={
            loadLibrary
          }
          viewMode={
            viewMode
          }
          onViewModeChange={
            setViewMode
          }
          onAddToList={setAddToListTarget}
        />
      )}

      {addToListTarget && (
        <AddToListDialog
          libraryItemId={addToListTarget.library_id}
          title={addToListTarget.title}
          onClose={() => setAddToListTarget(null)}
        />
      )}

      {/* PAGINAÇÃO */}

      {!loading &&
        totalResults >
          0 &&
        totalPages >
          1 && (
        <section className="library-pagination-wrap">

          <div className="library-page-info">
            Página{" "}
            <strong>
              {page}
            </strong>{" "}
            de{" "}
            <strong>
              {
                totalPages
              }
            </strong>

            <span>
              ·
            </span>

            <span>
              {
                totalResults
              }{" "}
              resultados
            </span>
          </div>

          <nav className="library-pagination">

            <button
              type="button"
              className="library-page-btn"
              disabled={
                page <= 1
              }
              onClick={() =>
                goToPage(
                  page - 1
                )
              }
              title="Página anterior"
              aria-label="Página anterior"
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
                      "library-page-btn " +
                      (value ===
                      page
                        ? "active"
                        : "")
                    }
                    onClick={() =>
                      goToPage(
                        value
                      )
                    }
                  >
                    {
                      value
                    }
                  </button>
                ) : (
                  <span
                    key={
                      value
                    }
                    className="library-page-ellipsis"
                  >
                    …
                  </span>
                )
            )}

            <button
              type="button"
              className="library-page-btn"
              disabled={
                page >=
                totalPages
              }
              onClick={() =>
                goToPage(
                  page + 1
                )
              }
              title="Próxima página"
              aria-label="Próxima página"
            >
              <ChevronRight
                size={17}
              />
            </button>

          </nav>

        </section>
      )}

      {/* LIMPAR */}

      {(search ||
        activeFilters >
          0) &&
        totalLibrary >
          0 && (
        <div className="library-clear-all-wrap">

          <button
            className="btn"
            onClick={
              clearAll
            }
          >
            <X
              size={15}
            />

            Limpar busca e filtros
          </button>

        </div>
      )}

    </>
  );
}

function RatingFilter({
  label,
  value,
  onChange,
}: {
  label:
    string;

  value:
    string;

  onChange:
    (
      value:
        string
    ) => void;
}) {
  return (
    <div className="library-rating-filter">

      <span>
        {label}
      </span>

      <div className="library-rating-options">

        <button
          className={
            value ===
            "all"
              ? "active"
              : ""
          }
          onClick={() =>
            onChange(
              "all"
            )
          }
        >
          Todas
        </button>

        {[
          5,
          6,
          7,
          8,
          9,
        ].map(
          (
            rating
          ) => (
            <button
              key={
                rating
              }
              className={
                value ===
                String(
                  rating
                )
                  ? "active"
                  : ""
              }
              onClick={() =>
                onChange(
                  String(
                    rating
                  )
                )
              }
            >
              {rating}+
            </button>
          )
        )}

      </div>

    </div>
  );
}
