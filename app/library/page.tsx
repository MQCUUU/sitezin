"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

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
  const [
    data,
    setData,
  ] =
    useState<
      LibraryItem[]
    >([]);

  const [
    type,
    setType,
  ] =
    useState<
      "all" |
      "movie" |
      "tv"
    >(
      "all"
    );

  const [
    status,
    setStatus,
  ] =
    useState<
      "all" |
      Status
    >(
      "all"
    );

  const [
    sort,
    setSort,
  ] =
    useState<
      SortOption
    >(
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
      }
    );

  const [
    search,
    setSearch,
  ] =
    useState(
      ""
    );

  const [
    debouncedSearch,
    setDebouncedSearch,
  ] =
    useState(
      ""
    );

  const [
    genre,
    setGenre,
  ] =
    useState(
      "all"
    );

  const [
    year,
    setYear,
  ] =
    useState(
      "all"
    );

  const [
    favoriteOnly,
    setFavoriteOnly,
  ] =
    useState(
      false
    );

  const [
    minRating,
    setMinRating,
  ] =
    useState(
      "all"
    );

  const [
    minTmdbRating,
    setMinTmdbRating,
  ] =
    useState(
      "all"
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
      "grid"
    );

  const [
    page,
    setPage,
  ] =
    useState(
      1
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
    initializedFromUrl,
    setInitializedFromUrl,
  ] =
    useState(
      false
    );

  /*
   * ==========================================
   * FILTROS VINDOS DA URL
   * ==========================================
   *
   * Exemplos:
   *
   * /library?status=watching
   * /library?status=want
   * /library?favorite=true
   * /library?type=movie
   *
   * Isso faz os links "Ver todos" da Home
   * abrirem exatamente no filtro correto.
   */

  useEffect(() => {
    const params =
      new URLSearchParams(
        window.location.search
      );

    const urlStatus =
      params.get(
        "status"
      );

    const urlFavorite =
      params.get(
        "favorite"
      );

    const urlType =
      params.get(
        "type"
      );

    if (
      urlStatus &&
      urlStatus !== "all"
    ) {
      setStatus(
        urlStatus as Status
      );
    }

    if (
      urlFavorite === "true"
    ) {
      setFavoriteOnly(
        true
      );

      setStatus(
        "all"
      );
    }

    if (
      urlType === "movie" ||
      urlType === "tv"
    ) {
      setType(
        urlType
      );
    }

    setPage(
      1
    );

    setInitializedFromUrl(
      true
    );
  }, []);

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
    if (
      !initializedFromUrl
    ) {
      return;
    }

    loadLibrary();
  }, [
    initializedFromUrl,
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
     * Remove filtros que vieram da URL,
     * sem recarregar a página.
     */
    window.history.replaceState(
      {},
      "",
      "/library"
    );
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
            className={
              "btn " +
              (favoriteOnly
                ? "primary"
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
            <Heart
              size={16}
              fill={
                favoriteOnly
                  ? "currentColor"
                  : "none"
              }
            />

            Favoritos
          </button>

          <button
            className={
              "btn " +
              (showFilters
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

                    const params =
                      new URLSearchParams();

                    if (
                      value !== "all"
                    ) {
                      params.set(
                        "status",
                        String(
                          value
                        )
                      );
                    }

                    window.history.replaceState(
                      {},
                      "",
                      params.toString()
                        ? `/library?${params.toString()}`
                        : "/library"
                    );
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
            onClick={() => {
              setFavoriteOnly(
                true
              );

              setStatus(
                "all"
              );

              resetPage();

              window.history.replaceState(
                {},
                "",
                "/library?favorite=true"
              );
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
              Favoritos
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
        <div className="library-filter-panel">

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
                  Apenas favoritos
                </strong>

                <span>
                  Mostrar somente títulos marcados como favoritos
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
        <div className="empty library-page-loading">

          <Loader2
            size={25}
            className="spin"
          />

          <span>
            Carregando biblioteca...
          </span>

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