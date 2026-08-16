"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  CalendarDays,
  Check,
  ChevronDown,
  Eye,
  Film,
  Filter,
  Gem,
  Heart,
  Loader2,
  Plus,
  RotateCcw,
  Sparkles,
  Star,
  Trash2,
  TrendingUp,
  Tv,
  X,
} from "lucide-react";

import Link from "next/link";

import {
  Search,
} from "@/components/Search";

import {
  img,
} from "@/lib/tmdb";

const STATUS_OPTIONS = [
  ["want", "Quero assistir"],
  ["watching", "Assistindo"],
  ["watched", "Assistido"],
  ["paused", "Pausado"],
  ["dropped", "Abandonado"],
  ["rewatching", "Reassistindo"],
  ["rewatched", "Reassistido"],
] as const;

type Shelf = {
  id: string;
  title: string;
  subtitle?: string;
  icon:
    | "sparkles"
    | "star"
    | "film"
    | "tv"
    | "gem"
    | "trending"
    | "calendar";
  results: any[];
};

type FilterData = {
  genres:
    string[];
  providers:
    {
      id: string;
      name: string;
    }[];
};

type LibraryItem = {
  library_id: string;
  tmdb_id: number;
  media_type:
    | "movie"
    | "tv";
  favorite: boolean;
  status:
    string |
    null;
  personal_rating:
    number |
    null;
};

function getStatusLabel(
  status?:
    string |
    null
) {
  return (
    STATUS_OPTIONS.find(
      ([value]) =>
        value ===
        status
    )?.[1] ||
    "Na biblioteca"
  );
}

async function safeJson(
  response:
    Response
) {
  const type =
    response.headers.get(
      "content-type"
    ) ||
    "";

  if (
    !type.includes(
      "application/json"
    )
  ) {
    const text =
      await response.text();

    throw new Error(
      `A rota ${response.url} não retornou JSON (${response.status}). ${
        text.startsWith(
          "<!DOCTYPE"
        )
          ? "Provavelmente retornou HTML/404."
          : ""
      }`
    );
  }

  return response.json();
}

export default function ForYouPage() {
  const [
    shelves,
    setShelves,
  ] =
    useState<
      Shelf[]
    >([]);

  const [
    basedOn,
    setBasedOn,
  ] =
    useState<
      string[]
    >([]);

  const [
    profileGenres,
    setProfileGenres,
  ] =
    useState<
      string[]
    >([]);

  const [
    filters,
    setFilters,
  ] =
    useState<FilterData>({
      genres:
        [],
      providers:
        [],
    });

  const [
    library,
    setLibrary,
  ] =
    useState<
      LibraryItem[]
    >([]);

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    loadingMore,
    setLoadingMore,
  ] =
    useState(false);

  const [
    error,
    setError,
  ] =
    useState("");

  const [
    page,
    setPage,
  ] =
    useState(1);

  const [
    hasMore,
    setHasMore,
  ] =
    useState(true);

  const [
    filtersOpen,
    setFiltersOpen,
  ] =
    useState(false);

  const [
    type,
    setType,
  ] =
    useState<
      "all" |
      "movie" |
      "tv"
    >("all");

  const [
    genre,
    setGenre,
  ] =
    useState("");

  const [
    provider,
    setProvider,
  ] =
    useState("");

  const [
    minRating,
    setMinRating,
  ] =
    useState("");

  const [
    year,
    setYear,
  ] =
    useState("");

  const [
    sort,
    setSort,
  ] =
    useState(
      "recommended"
    );

  const [
    hideWatched,
    setHideWatched,
  ] =
    useState(true);

  const [
    onlyNew,
    setOnlyNew,
  ] =
    useState(true);

  const [
    openMenu,
    setOpenMenu,
  ] =
    useState<
      string |
      null
    >(null);

  const [
    previewItem,
    setPreviewItem,
  ] =
    useState<any>(
      null
    );

  const [
    previewDetails,
    setPreviewDetails,
  ] =
    useState<any>(
      null
    );

  const [
    previewLoading,
    setPreviewLoading,
  ] =
    useState(false);

  const [
    processing,
    setProcessing,
  ] =
    useState<
      string |
      null
    >(null);

  const [
    removeTarget,
    setRemoveTarget,
  ] =
    useState<any>(
      null
    );

  const [
    skipRemoveConfirm,
    setSkipRemoveConfirm,
  ] =
    useState(false);

  useEffect(() => {
    try {
      setSkipRemoveConfirm(
        localStorage.getItem(
          "mycatalog_skip_remove_confirm"
        ) ===
          "1"
      );
    } catch {}
  }, []);

  useEffect(() => {
    if (
      !openMenu
    ) {
      return;
    }

    function closeOutside(
      event:
        MouseEvent
    ) {
      const target =
        event.target;

      if (
        !(
          target instanceof
          Element
        )
      ) {
        return;
      }

      if (
        target.closest(
          ".fy-status-trigger"
        ) ||
        target.closest(
          ".fy-status-menu"
        )
      ) {
        return;
      }

      setOpenMenu(
        null
      );
    }

    document.addEventListener(
      "mousedown",
      closeOutside
    );

    return () =>
      document.removeEventListener(
        "mousedown",
        closeOutside
      );
  }, [
    openMenu,
  ]);

  useEffect(() => {
    if (
      !previewItem
    ) {
      return;
    }

    const old =
      document.body
        .style.overflow;

    document.body
      .style.overflow =
      "hidden";

    function esc(
      event:
        KeyboardEvent
    ) {
      if (
        event.key ===
        "Escape"
      ) {
        setPreviewItem(
          null
        );
      }
    }

    window.addEventListener(
      "keydown",
      esc
    );

    return () => {
      document.body
        .style.overflow =
        old;

      window.removeEventListener(
        "keydown",
        esc
      );
    };
  }, [
    previewItem,
  ]);

  useEffect(() => {
    let cancelled =
      false;

    async function loadPreview() {
      if (
        !previewItem
      ) {
        setPreviewDetails(
          null
        );

        return;
      }

      try {
        setPreviewLoading(
          true
        );

        const response =
          await fetch(
            `/api/tmdb/${previewItem.media_type}/${previewItem.id}`
          );

        const data =
          await safeJson(
            response
          );

        if (
          !response.ok ||
          data?.error
        ) {
          throw new Error(
            data?.error ||
              "Erro ao carregar detalhes."
          );
        }

        if (
          !cancelled
        ) {
          setPreviewDetails(
            data
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
          setPreviewDetails(
            null
          );
        }
      } finally {
        if (
          !cancelled
        ) {
          setPreviewLoading(
            false
          );
        }
      }
    }

    loadPreview();

    return () => {
      cancelled =
        true;
    };
  }, [
    previewItem?.id,
    previewItem?.media_type,
  ]);

  const activeFilterCount =
    useMemo(
      () =>
        [
          genre,
          provider,
          minRating,
          year,
          sort !==
          "recommended",
          hideWatched,
          onlyNew,
        ].filter(
          Boolean
        ).length,
      [
        genre,
        provider,
        minRating,
        year,
        sort,
        hideWatched,
        onlyNew,
      ]
    );

  function queryFor(
    nextPage:
      number
  ) {
    const q =
      new URLSearchParams({
        page:
          String(
            nextPage
          ),
        type,
        sort,
      });

    if (genre) {
      q.set(
        "genre",
        genre
      );
    }

    if (
      provider
    ) {
      q.set(
        "provider",
        provider
      );
    }

    if (
      minRating
    ) {
      q.set(
        "min_rating",
        minRating
      );
    }

    if (year) {
      q.set(
        "year",
        year
      );
    }

    if (
      hideWatched
    ) {
      q.set(
        "hide_watched",
        "1"
      );
    }

    if (
      onlyNew
    ) {
      q.set(
        "only_new",
        "1"
      );
    }

    return q;
  }

  async function loadLibrary() {
    try {
      const response =
        await fetch(
          "/api/library"
        );

      if (
        !response.ok
      ) {
        return;
      }

      const data =
        await safeJson(
          response
        );

      if (
        !Array.isArray(
          data
        )
      ) {
        return;
      }

      setLibrary(
        data
          .filter(
            (
              item:
                any
            ) =>
              item.media
                ?.tmdb_id &&
              item.media
                ?.media_type
          )
          .map(
            (
              item:
                any
            ) => ({
              library_id:
                String(
                  item.id
                ),
              tmdb_id:
                Number(
                  item.media
                    .tmdb_id
                ),
              media_type:
                item.media
                  .media_type,
              favorite:
                Boolean(
                  item.favorite
                ),
              status:
                item.status ||
                null,
              personal_rating:
                item.personal_rating ===
                  null ||
                item.personal_rating ===
                  undefined
                  ? null
                  : Number(
                      item.personal_rating
                    ),
            })
          )
      );
    } catch (
      error
    ) {
      console.error(
        "Biblioteca:",
        error
      );
    }
  }

  async function load(
    nextPage:
      number,
    append:
      boolean
  ) {
    try {
      if (
        append
      ) {
        setLoadingMore(
          true
        );
      } else {
        setLoading(
          true
        );

        setError(
          ""
        );
      }

      const [
        response,
      ] =
        await Promise.all([
          fetch(
            `/api/for-you?${queryFor(
              nextPage
            ).toString()}`
          ),

          append
            ? Promise.resolve()
            : loadLibrary(),
        ]);

      const data =
        await safeJson(
          response
        );

      if (
        !response.ok ||
        data?.error
      ) {
        throw new Error(
          data?.error ||
            "Erro ao carregar recomendações."
        );
      }

      const incoming =
        Array.isArray(
          data.shelves
        )
          ? data.shelves
          : [];

      setShelves(
        (
          current
        ) =>
          append
            ? [
                ...current,
                ...incoming,
              ]
            : incoming
      );

      setBasedOn(
        Array.isArray(
          data.based_on
        )
          ? data.based_on
          : []
      );

      setProfileGenres(
        Array.isArray(
          data.profile
            ?.favorite_genres
        )
          ? data.profile
              .favorite_genres
          : []
      );

      if (
        data.filters
      ) {
        setFilters({
          genres:
            Array.isArray(
              data.filters
                .genres
            )
              ? data.filters
                  .genres
              : [],
          providers:
            Array.isArray(
              data.filters
                .providers
            )
              ? data.filters
                  .providers
              : [],
        });
      }

      setPage(
        nextPage
      );

      setHasMore(
        Boolean(
          data.has_more
        )
      );
    } catch (
      err
    ) {
      setError(
        err instanceof Error
          ? err.message
          : "Erro ao carregar recomendações."
      );
    } finally {
      setLoading(
        false
      );

      setLoadingMore(
        false
      );
    }
  }

  useEffect(() => {
    const timer =
      setTimeout(
        () => {
          load(
            1,
            false
          );
        },
        180
      );

    return () =>
      clearTimeout(
        timer
      );
  }, [
    type,
    genre,
    provider,
    minRating,
    year,
    sort,
    hideWatched,
    onlyNew,
  ]);

  function getLibraryItem(
    item:
      any
  ) {
    return library.find(
      (
        entry
      ) =>
        entry.tmdb_id ===
          Number(
            item.id
          ) &&
        entry.media_type ===
          item.media_type
    );
  }

  function patchLibrary(
    item:
      any,
    patch:
      Partial<
        LibraryItem
      >
  ) {
    setLibrary(
      (
        current
      ) =>
        current.map(
          (
            entry
          ) =>
            entry.tmdb_id ===
                Number(
                  item.id
                ) &&
              entry.media_type ===
                item.media_type
              ? {
                  ...entry,
                  ...patch,
                }
              : entry
        )
    );
  }

  async function addToLibrary(
    item:
      any
  ) {
    const key =
      `${item.media_type}-${item.id}`;

    try {
      setProcessing(
        key
      );

      let media =
        item;

      try {
        const response =
          await fetch(
            `/api/tmdb/${item.media_type}/${item.id}`
          );

        if (
          response.ok
        ) {
          media =
            await safeJson(
              response
            );
        }
      } catch {}

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
              JSON.stringify({
                media: {
                  ...item,
                  ...media,
                  id:
                    item.id,
                  media_type:
                    item.media_type,
                  title:
                    media.title ||
                    media.name ||
                    item.title ||
                    item.name,
                  original_title:
                    media.original_title ||
                    media.original_name ||
                    item.title ||
                    item.name,
                  genres:
                    media.genres ||
                    [],
                },
                status:
                  "want",
                favorite:
                  false,
              }),
          }
        );

      const data =
        await safeJson(
          response
        );

      if (
        !response.ok ||
        data?.error
      ) {
        throw new Error(
          data?.error ||
            "Não foi possível adicionar."
        );
      }

      setLibrary(
        (
          current
        ) => [
          ...current.filter(
            (
              entry
            ) =>
              !(
                entry.tmdb_id ===
                  Number(
                    item.id
                  ) &&
                entry.media_type ===
                  item.media_type
              )
          ),
          {
            library_id:
              String(
                data.id
              ),
            tmdb_id:
              Number(
                item.id
              ),
            media_type:
              item.media_type,
            favorite:
              Boolean(
                data.favorite
              ),
            status:
              data.status ||
              "want",
            personal_rating:
              data.personal_rating ??
              null,
          },
        ]
      );
    } catch (
      error
    ) {
      console.error(
        error
      );
    } finally {
      setProcessing(
        null
      );
    }
  }

  async function updateStatus(
    item:
      any,
    status:
      string
  ) {
    const existing =
      getLibraryItem(
        item
      );

    if (
      !existing
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
          `/api/library/${existing.library_id}`,
          {
            method:
              "PATCH",
            headers: {
              "Content-Type":
                "application/json",
            },
            body:
              JSON.stringify({
                status,
              }),
          }
        );

      const data =
        await safeJson(
          response
        );

      if (
        !response.ok ||
        data?.error
      ) {
        throw new Error(
          data?.error ||
            "Erro ao alterar status."
        );
      }

      patchLibrary(
        item,
        {
          status:
            data.status ||
            status,
        }
      );

      setOpenMenu(
        null
      );
    } finally {
      setProcessing(
        null
      );
    }
  }

  async function toggleFavorite(
    item:
      any
  ) {
    const existing =
      getLibraryItem(
        item
      );

    if (
      !existing
    ) {
      return;
    }

    const next =
      !existing.favorite;

    const key =
      `${item.media_type}-${item.id}`;

    try {
      setProcessing(
        key
      );

      const response =
        await fetch(
          `/api/library/${existing.library_id}`,
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
                  next,
              }),
          }
        );

      const data =
        await safeJson(
          response
        );

      if (
        !response.ok ||
        data?.error
      ) {
        throw new Error(
          data?.error ||
            "Erro ao favoritar."
        );
      }

      patchLibrary(
        item,
        {
          favorite:
            data.favorite ??
            next,
        }
      );
    } finally {
      setProcessing(
        null
      );
    }
  }

  async function updateRating(
    item:
      any,
    rating:
      number |
      null
  ) {
    const existing =
      getLibraryItem(
        item
      );

    if (
      !existing
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
          `/api/library/${existing.library_id}`,
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

      const data =
        await safeJson(
          response
        );

      if (
        !response.ok ||
        data?.error
      ) {
        throw new Error(
          data?.error ||
            "Erro ao alterar nota."
        );
      }

      patchLibrary(
        item,
        {
          personal_rating:
            rating,
        }
      );
    } finally {
      setProcessing(
        null
      );
    }
  }

  function requestRemove(
    item:
      any
  ) {
    if (
      skipRemoveConfirm
    ) {
      removeItem(
        item
      );

      return;
    }

    setRemoveTarget(
      item
    );

    setOpenMenu(
      null
    );
  }

  async function removeItem(
    item:
      any
  ) {
    const existing =
      getLibraryItem(
        item
      );

    if (
      !existing
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
          `/api/library/${existing.library_id}`,
          {
            method:
              "DELETE",
          }
        );

      const data =
        await safeJson(
          response
        );

      if (
        !response.ok ||
        data?.error
      ) {
        throw new Error(
          data?.error ||
            "Erro ao remover."
        );
      }

      setLibrary(
        (
          current
        ) =>
          current.filter(
            (
              entry
            ) =>
              entry.library_id !==
              existing.library_id
          )
      );

      setRemoveTarget(
        null
      );
    } finally {
      setProcessing(
        null
      );
    }
  }

  function resetFilters() {
    setGenre("");
    setProvider("");
    setMinRating("");
    setYear("");
    setSort("recommended");
    setHideWatched(true);
    setOnlyNew(true);
  }

  return (
    <>
      <div className="topbar">
        <Search />
      </div>

      <main className="fy-page">

        <section className="fy-hero">
          <div className="fy-hero-glow" />

          <div className="fy-hero-copy">
            <div className="eyebrow">
              PERSONALIZADO
            </div>

            <h1>
              Para você
            </h1>

            <p>
              Recomendações que aprendem com suas notas, favoritos e com o que você já assistiu.
            </p>

            {basedOn.length >
              0 && (
              <div className="fy-based-on">
                <span>
                  Baseado em
                </span>

                <strong>
                  {basedOn
                    .slice(
                      0,
                      4
                    )
                    .join(
                      " · "
                    )}
                </strong>
              </div>
            )}
          </div>

          <div className="fy-profile-card">
            <div className="fy-profile-icon">
              <Sparkles
                size={21}
              />
            </div>

            <div>
              <strong>
                Seu feed
              </strong>

              <span>
                Muda conforme você usa o MyCatalog
              </span>
            </div>
          </div>
        </section>

        {profileGenres.length >
          0 && (
          <section className="fy-profile-genres">
            <span>
              Seu gosto:
            </span>

            {profileGenres
              .slice(
                0,
                6
              )
              .map(
                (
                  item
                ) => (
                  <button
                    type="button"
                    key={
                      item
                    }
                    className={
                      genre ===
                      item
                        ? "active"
                        : ""
                    }
                    onClick={() =>
                      setGenre(
                        genre ===
                        item
                          ? ""
                          : item
                      )
                    }
                  >
                    {
                      item
                    }
                  </button>
                )
              )}
          </section>
        )}

        <section className="fy-toolbar">
          <div className="fy-tabs">
            <button
              type="button"
              className={
                type ===
                  "all"
                  ? "active"
                  : ""
              }
              onClick={() =>
                setType(
                  "all"
                )
              }
            >
              Tudo
            </button>

            <button
              type="button"
              className={
                type ===
                  "movie"
                  ? "active"
                  : ""
              }
              onClick={() =>
                setType(
                  "movie"
                )
              }
            >
              <Film
                size={14}
              />
              Filmes
            </button>

            <button
              type="button"
              className={
                type ===
                  "tv"
                  ? "active"
                  : ""
              }
              onClick={() =>
                setType(
                  "tv"
                )
              }
            >
              <Tv
                size={14}
              />
              Séries
            </button>
          </div>

          <button
            type="button"
            className={
              "fy-filter-button " +
              (filtersOpen
                ? "active"
                : "")
            }
            onClick={() =>
              setFiltersOpen(
                (
                  value
                ) =>
                  !value
              )
            }
          >
            <Filter
              size={15}
            />
            Filtros

            {activeFilterCount >
              0 && (
              <span className="fy-filter-count">
                {
                  activeFilterCount
                }
              </span>
            )}

            <ChevronDown
              size={14}
            />
          </button>
        </section>

        {filtersOpen && (
          <section className="fy-filter-panel">
            <div className="fy-filter-title">
              <div>
                <strong>
                  Afinar recomendações
                </strong>

                <span>
                  Esses filtros valem para todas as prateleiras.
                </span>
              </div>

              <button
                type="button"
                onClick={() =>
                  setFiltersOpen(
                    false
                  )
                }
              >
                <X
                  size={16}
                />
              </button>
            </div>

            <div className="fy-filter-fields">
              <label>
                <span>
                  Gênero
                </span>

                <select
                  value={
                    genre
                  }
                  onChange={(
                    event
                  ) =>
                    setGenre(
                      event.target
                        .value
                    )
                  }
                >
                  <option value="">
                    Todos
                  </option>

                  {filters.genres.map(
                    (
                      item
                    ) => (
                      <option
                        key={
                          item
                        }
                        value={
                          item
                        }
                      >
                        {
                          item
                        }
                      </option>
                    )
                  )}
                </select>
              </label>

              <label>
                <span>
                  Streaming
                </span>

                <select
                  value={
                    provider
                  }
                  onChange={(
                    event
                  ) =>
                    setProvider(
                      event.target
                        .value
                    )
                  }
                >
                  <option value="">
                    Qualquer um
                  </option>

                  {filters.providers.map(
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
                  Nota mínima
                </span>

                <select
                  value={
                    minRating
                  }
                  onChange={(
                    event
                  ) =>
                    setMinRating(
                      event.target
                        .value
                    )
                  }
                >
                  <option value="">
                    Qualquer
                  </option>
                  <option value="6">
                    6+
                  </option>
                  <option value="7">
                    7+
                  </option>
                  <option value="8">
                    8+
                  </option>
                  <option value="9">
                    9+
                  </option>
                </select>
              </label>

              <label>
                <span>
                  Ano
                </span>

                <input
                  type="number"
                  placeholder="Ex.: 2025"
                  min="1900"
                  max="2100"
                  value={
                    year
                  }
                  onChange={(
                    event
                  ) =>
                    setYear(
                      event.target
                        .value
                    )
                  }
                />
              </label>

              <label>
                <span>
                  Ordenar por
                </span>

                <select
                  value={
                    sort
                  }
                  onChange={(
                    event
                  ) =>
                    setSort(
                      event.target
                        .value
                    )
                  }
                >
                  <option value="recommended">
                    Recomendado
                  </option>
                  <option value="rating">
                    Melhor avaliados
                  </option>
                  <option value="popular">
                    Mais populares
                  </option>
                  <option value="newest">
                    Mais recentes
                  </option>
                  <option value="hidden">
                    Menos conhecidos
                  </option>
                </select>
              </label>
            </div>

            <div className="fy-toggle-grid">
              <button
                type="button"
                className={
                  hideWatched
                    ? "active"
                    : ""
                }
                onClick={() =>
                  setHideWatched(
                    (
                      value
                    ) =>
                      !value
                  )
                }
              >
                <span className="fy-toggle-check">
                  {hideWatched
                    ? "✓"
                    : ""}
                </span>

                <div>
                  <strong>
                    Ocultar assistidos
                  </strong>

                  <small>
                    Não repete o que você já concluiu
                  </small>
                </div>
              </button>

              <button
                type="button"
                className={
                  onlyNew
                    ? "active"
                    : ""
                }
                onClick={() =>
                  setOnlyNew(
                    (
                      value
                    ) =>
                      !value
                  )
                }
              >
                <span className="fy-toggle-check">
                  {onlyNew
                    ? "✓"
                    : ""}
                </span>

                <div>
                  <strong>
                    Só fora da biblioteca
                  </strong>

                  <small>
                    Mostra apenas descobertas novas
                  </small>
                </div>
              </button>
            </div>

            <button
              type="button"
              className="fy-reset"
              onClick={
                resetFilters
              }
            >
              <RotateCcw
                size={14}
              />
              Restaurar filtros
            </button>
          </section>
        )}

        {loading ? (
          <FeedSkeleton />
        ) : error ? (
          <section className="fy-error">
            <Sparkles
              size={26}
            />

            <strong>
              Não foi possível montar seu feed
            </strong>

            <span>
              {
                error
              }
            </span>

            <button
              type="button"
              className="btn"
              onClick={() =>
                load(
                  1,
                  false
                )
              }
            >
              Tentar novamente
            </button>
          </section>
        ) : shelves.length ===
          0 ? (
          <section className="fy-error">
            <Filter
              size={26}
            />

            <strong>
              Nenhuma recomendação com esses filtros
            </strong>

            <span>
              Tente remover algum filtro ou continue avaliando títulos.
            </span>

            <button
              type="button"
              className="btn"
              onClick={
                resetFilters
              }
            >
              Limpar filtros
            </button>
          </section>
        ) : (
          <>
            <div className="fy-feed">
              {shelves.map(
                (
                  shelf
                ) => (
                  <ShelfRow
                    key={
                      shelf.id
                    }
                    shelf={
                      shelf
                    }
                    openMenu={
                      openMenu
                    }
                    setOpenMenu={
                      setOpenMenu
                    }
                    setPreviewItem={
                      setPreviewItem
                    }
                    getLibraryItem={
                      getLibraryItem
                    }
                    processing={
                      processing
                    }
                    addToLibrary={
                      addToLibrary
                    }
                    updateStatus={
                      updateStatus
                    }
                    toggleFavorite={
                      toggleFavorite
                    }
                    requestRemove={
                      requestRemove
                    }
                  />
                )
              )}
            </div>

            {hasMore && (
              <section className="fy-load-more">
                <div>
                  <Sparkles
                    size={18}
                  />

                  <div>
                    <strong>
                      Quer continuar descobrindo?
                    </strong>

                    <span>
                      Carregamos outras partes do seu perfil sem apagar o que já apareceu.
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  className="btn primary"
                  disabled={
                    loadingMore
                  }
                  onClick={() =>
                    load(
                      page +
                        1,
                      true
                    )
                  }
                >
                  {loadingMore ? (
                    <>
                      <Loader2
                        size={16}
                        className="spin"
                      />
                      Carregando...
                    </>
                  ) : (
                    <>
                      <Sparkles
                        size={16}
                      />
                      Mais recomendações
                    </>
                  )}
                </button>
              </section>
            )}
          </>
        )}

      </main>

      {previewItem && (
        <PreviewModal
          item={
            previewItem
          }
          details={
            previewDetails
          }
          loading={
            previewLoading
          }
          libraryItem={
            getLibraryItem(
              previewItem
            )
          }
          processing={
            processing
          }
          onClose={() =>
            setPreviewItem(
              null
            )
          }
          onAdd={
            addToLibrary
          }
          onRating={
            updateRating
          }
        />
      )}

      {removeTarget && (
        <div
          className="mycatalog-confirm-backdrop"
          onMouseDown={(
            event
          ) => {
            if (
              event.target ===
              event.currentTarget
            ) {
              setRemoveTarget(
                null
              );
            }
          }}
        >
          <div
            className="mycatalog-confirm-modal"
            onMouseDown={(
              event
            ) =>
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

              <h3>
                Remover “{
                  removeTarget.title ||
                  removeTarget.name
                }”?
              </h3>

              <p className="muted">
                Você poderá adicionar este título novamente depois.
              </p>
            </div>

            <label className="mycatalog-confirm-option">
              <input
                type="checkbox"
                checked={
                  skipRemoveConfirm
                }
                onChange={(
                  event
                ) => {
                  const checked =
                    event.target
                      .checked;

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
                  } catch {}
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
                onClick={() =>
                  removeItem(
                    removeTarget
                  )
                }
              >
                <Trash2
                  size={15}
                />
                Remover
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ShelfRow({
  shelf,
  openMenu,
  setOpenMenu,
  setPreviewItem,
  getLibraryItem,
  processing,
  addToLibrary,
  updateStatus,
  toggleFavorite,
  requestRemove,
}: any) {
  return (
    <section className="fy-shelf">
      <div className="fy-shelf-head">
        <div className="fy-shelf-title">
          <div className="fy-shelf-icon">
            <IconForShelf
              icon={
                shelf.icon
              }
            />
          </div>

          <div>
            <h2>
              {
                shelf.title
              }
            </h2>

            {shelf.subtitle && (
              <p>
                {
                  shelf.subtitle
                }
              </p>
            )}
          </div>
        </div>

        <span className="fy-shelf-count">
          {
            shelf.results
              .length
          } sugestões
        </span>
      </div>

      <div className="fy-row">
        {shelf.results.map(
          (
            item:
              any
          ) => (
            <MovieCard
              key={`${item.media_type}-${item.id}`}
              item={
                item
              }
              openMenu={
                openMenu
              }
              setOpenMenu={
                setOpenMenu
              }
              setPreviewItem={
                setPreviewItem
              }
              getLibraryItem={
                getLibraryItem
              }
              processing={
                processing
              }
              addToLibrary={
                addToLibrary
              }
              updateStatus={
                updateStatus
              }
              toggleFavorite={
                toggleFavorite
              }
              requestRemove={
                requestRemove
              }
            />
          )
        )}
      </div>
    </section>
  );
}

function MovieCard({
  item,
  openMenu,
  setOpenMenu,
  setPreviewItem,
  getLibraryItem,
  processing,
  addToLibrary,
  updateStatus,
  toggleFavorite,
  requestRemove,
}: any) {
  const type =
    item.media_type ===
      "tv"
      ? "tv"
      : "movie";

  const title =
    item.title ||
    item.name ||
    "Sem título";

  const year =
    (
      item.release_date ||
      item.first_air_date ||
      ""
    ).slice(
      0,
      4
    );

  const key =
    `${type}-${item.id}`;

  const existing =
    getLibraryItem(
      item
    );

  const busy =
    processing ===
    key;

  const menuOpen =
    openMenu ===
    key;

  return (
    <article className="fy-card-wrap">
      <div className="fy-card-poster-wrap">
        <Link
          href={`/title/${type}/${item.id}`}
          className="fy-poster"
        >
          {item.poster_path ? (
            <img
              src={img(
                item.poster_path
              )}
              alt={
                title
              }
              loading="lazy"
            />
          ) : (
            <div className="fy-no-poster">
              {type ===
              "tv" ? (
                <Tv
                  size={28}
                />
              ) : (
                <Film
                  size={28}
                />
              )}
            </div>
          )}

          <span className="fy-type">
            {type ===
            "tv"
              ? "SÉRIE"
              : "FILME"}
          </span>

          {existing && (
            <span className="fy-status-badge">
              {getStatusLabel(
                existing.status
              )}
            </span>
          )}
        </Link>

        <div className="fy-card-actions">
          <button
            type="button"
            title="Ver rápido"
            onClick={() =>
              setPreviewItem(
                item
              )
            }
          >
            <Eye
              size={16}
            />
          </button>

          {existing ? (
            <button
              type="button"
              className="active fy-status-trigger"
              title="Alterar status"
              disabled={
                busy
              }
              onMouseDown={(
                event
              ) =>
                event.preventDefault()
              }
              onClick={() =>
                setOpenMenu(
                  menuOpen
                    ? null
                    : key
                )
              }
            >
              {busy ? (
                <Loader2
                  size={15}
                  className="spin"
                />
              ) : (
                <>
                  <Check
                    size={15}
                  />
                  <ChevronDown
                    size={11}
                  />
                </>
              )}
            </button>
          ) : (
            <button
              type="button"
              title="Adicionar como Quero assistir"
              disabled={
                busy
              }
              onClick={() =>
                addToLibrary(
                  item
                )
              }
            >
              {busy ? (
                <Loader2
                  size={16}
                  className="spin"
                />
              ) : (
                <Plus
                  size={17}
                />
              )}
            </button>
          )}

          {existing && (
            <button
              type="button"
              className={
                existing.favorite
                  ? "active"
                  : ""
              }
              title={
                existing.favorite
                  ? "Remover dos favoritos"
                  : "Favoritar"
              }
              disabled={
                busy
              }
              onClick={() =>
                toggleFavorite(
                  item
                )
              }
            >
              <Heart
                size={15}
                fill={
                  existing.favorite
                    ? "currentColor"
                    : "none"
                }
              />
            </button>
          )}
        </div>

        {existing &&
          menuOpen && (
          <div className="fy-status-menu">
            <div className="fy-status-menu-head">
              <span>
                Status
              </span>

              <strong>
                {getStatusLabel(
                  existing.status
                )}
              </strong>
            </div>

            {STATUS_OPTIONS.map(
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
                    existing.status ===
                    value
                      ? "active"
                      : ""
                  }
                  onMouseDown={(
                    event
                  ) =>
                    event.preventDefault()
                  }
                  onClick={() =>
                    updateStatus(
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

                  {existing.status ===
                    value && (
                    <Check
                      size={13}
                    />
                  )}
                </button>
              )
            )}

            <div className="fy-status-divider" />

            <button
              type="button"
              className="remove"
              onClick={() =>
                requestRemove(
                  item
                )
              }
            >
              <Trash2
                size={14}
              />
              Remover da biblioteca
            </button>
          </div>
        )}
      </div>

      <Link
        href={`/title/${type}/${item.id}`}
        className="fy-card-body"
      >
        <strong>
          {
            title
          }
        </strong>

        <div className="fy-card-meta">
          <span>
            {year ||
              "—"}
          </span>

          {Number(
            item.vote_average ||
              0
          ) >
            0 && (
            <span className="fy-rating">
              <Star
                size={11}
                fill="currentColor"
              />
              {Number(
                item.vote_average
              ).toFixed(
                1
              )}
            </span>
          )}
        </div>

        {item.reason && (
          <p>
            {
              item.reason
            }
          </p>
        )}
      </Link>
    </article>
  );
}

function PreviewModal({
  item,
  details,
  loading,
  libraryItem,
  processing,
  onClose,
  onAdd,
  onRating,
}: any) {
  const title =
    item.title ||
    item.name ||
    "Sem título";

  const year =
    (
      item.release_date ||
      item.first_air_date ||
      details?.release_date ||
      details?.first_air_date ||
      ""
    ).slice(
      0,
      4
    );

  const genres =
    Array.isArray(
      details?.genres
    )
      ? details.genres
      : [];

  const busy =
    processing ===
    `${item.media_type}-${item.id}`;

  return (
    <div
      className="discover-preview-backdrop"
      onMouseDown={(
        event
      ) => {
        if (
          event.target ===
          event.currentTarget
        ) {
          onClose();
        }
      }}
    >
      <section className="panel discover-preview-modal">
        <button
          type="button"
          className="discover-preview-close"
          onClick={
            onClose
          }
        >
          <X
            size={18}
          />
        </button>

        <div className="discover-preview-poster">
          <img loading="lazy" decoding="async"
            src={img(
              item.poster_path ||
              details?.poster_path
            )}
            alt={
              title
            }
          />
        </div>

        <div className="discover-preview-content">
          <div className="eyebrow">
            {item.media_type ===
            "tv"
              ? "Série"
              : "Filme"}
          </div>

          <h2>
            {
              title
            }
          </h2>

          <div className="discover-preview-meta">
            <span>
              {year ||
                "Ano não informado"}
            </span>

            {Number(
              item.vote_average ||
                details?.vote_average ||
                0
            ) >
              0 && (
              <span className="rating">
                <Star
                  size={14}
                  fill="currentColor"
                />
                {Number(
                  item.vote_average ||
                    details?.vote_average
                ).toFixed(
                  1
                )}
              </span>
            )}

            {libraryItem && (
              <span className="in-library">
                <Check
                  size={13}
                />
                {getStatusLabel(
                  libraryItem.status
                )}
              </span>
            )}
          </div>

          {genres.length >
            0 && (
            <div className="discover-preview-genres">
              {genres.map(
                (
                  genre:
                    any
                ) => (
                  <span
                    key={
                      genre.id ||
                      genre.name
                    }
                  >
                    {
                      genre.name
                    }
                  </span>
                )
              )}
            </div>
          )}

          <PreviewProviders
            details={
              details
            }
            loading={
              loading
            }
          />

          {libraryItem && (
            <div className="preview-personal-rating">
              <div className="preview-personal-rating-head">
                <span>
                  Minha nota
                </span>

                <strong>
                  {libraryItem.personal_rating !==
                    null
                    ? Number(
                        libraryItem.personal_rating
                      ).toFixed(
                        1
                      )
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
                          libraryItem.personal_rating
                        ) ===
                        value
                          ? "active"
                          : ""
                      }
                      disabled={
                        busy
                      }
                      onClick={() =>
                        onRating(
                          item,
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
                  onClick={() =>
                    onRating(
                      item,
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
            {details?.overview?.trim() ||
              item.overview?.trim() ||
              "Ainda não há sinopse disponível."}
          </p>

          <div className="discover-preview-actions">
            <Link
              href={`/title/${item.media_type}/${item.id}`}
              className="btn primary"
            >
              Ver página completa
            </Link>

            {!libraryItem && (
              <button
                type="button"
                className="btn"
                disabled={
                  busy
                }
                onClick={() =>
                  onAdd(
                    item
                  )
                }
              >
                <Plus
                  size={16}
                />
                Quero assistir
              </button>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function PreviewProviders({
  details,
  loading,
}: any) {
  if (
    loading
  ) {
    return (
      <div className="preview-watch-box">
        <span className="muted">
          Carregando onde assistir...
        </span>
      </div>
    );
  }

  const br =
    details?.watch_providers
      ?.results?.BR ||
    null;

  if (!br) {
    return null;
  }

  const streaming =
    [
      ...(Array.isArray(
        br.flatrate
      )
        ? br.flatrate
        : []),
      ...(Array.isArray(
        br.free
      )
        ? br.free
        : []),
      ...(Array.isArray(
        br.ads
      )
        ? br.ads
        : []),
    ];

  const unique =
    streaming.filter(
      (
        provider:
          any,
        index:
          number,
        all:
          any[]
      ) =>
        all.findIndex(
          (
            current
          ) =>
            current.provider_id ===
            provider.provider_id
        ) ===
        index
    );

  if (
    unique.length ===
      0 &&
    !Array.isArray(
      br.rent
    ) &&
    !Array.isArray(
      br.buy
    )
  ) {
    return null;
  }

  return (
    <div className="preview-watch-box">
      <div className="preview-watch-head">
        Onde assistir no Brasil
      </div>

      {unique.length >
        0 && (
        <ProviderRow
          label="Streaming"
          providers={
            unique
          }
        />
      )}

      {Array.isArray(
        br.rent
      ) &&
        br.rent.length >
          0 && (
        <ProviderRow
          label="Aluguel"
          providers={
            br.rent
          }
        />
      )}

      {Array.isArray(
        br.buy
      ) &&
        br.buy.length >
          0 && (
        <ProviderRow
          label="Compra"
          providers={
            br.buy
          }
        />
      )}
    </div>
  );
}

function ProviderRow({
  label,
  providers,
}: any) {
  return (
    <div className="preview-watch-row">
      <strong>
        {
          label
        }
      </strong>

      <div className="preview-watch-provider-list">
        {providers.map(
          (
            provider:
              any
          ) => (
            <div
              className="preview-watch-provider"
              key={
                provider.provider_id
              }
              title={
                provider.provider_name
              }
            >
              {provider.logo_path ? (
                <img loading="lazy" decoding="async"
                  src={img(
                    provider.logo_path,
                    "w92"
                  )}
                  alt={
                    provider.provider_name
                  }
                />
              ) : (
                <span>
                  {String(
                    provider.provider_name ||
                      "?"
                  ).slice(
                    0,
                    1
                  )}
                </span>
              )}
            </div>
          )
        )}
      </div>
    </div>
  );
}

function IconForShelf({
  icon,
}: {
  icon:
    Shelf["icon"];
}) {
  if (icon === "star") return <Star size={18} />;
  if (icon === "film") return <Film size={18} />;
  if (icon === "tv") return <Tv size={18} />;
  if (icon === "gem") return <Gem size={18} />;
  if (icon === "trending") return <TrendingUp size={18} />;
  if (icon === "calendar") return <CalendarDays size={18} />;
  return <Sparkles size={18} />;
}

function FeedSkeleton() {
  return (
    <div className="fy-feed">
      {[1,2,3].map(
        (
          row
        ) => (
          <section
            className="fy-shelf"
            key={
              row
            }
          >
            <div className="fy-skeleton-title" />

            <div className="fy-row">
              {[1,2,3,4,5,6,7].map(
                (
                  item
                ) => (
                  <div
                    key={
                      item
                    }
                    className="fy-skeleton-card"
                  >
                    <div />
                    <span />
                    <small />
                  </div>
                )
              )}
            </div>
          </section>
        )
      )}
    </div>
  );
}