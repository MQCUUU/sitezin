"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  useParams,
} from "next/navigation";

import Link from "next/link";

import {
  Check,
  ChevronDown,
  Clock3,
  Eye,
  Film,
  Heart,
  Layers3,
  Loader2,
  Plus,
  Sparkles,
  Star,
  Trash2,
  X,
} from "lucide-react";

import {
  Search,
} from "@/components/Search";

import {
  SmartBackButton,
} from "@/components/SmartBackButton";

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

type CollectionMovie = {
  id: number;
  media_type:
    "movie";
  title?: string;
  original_title?: string;
  poster_path?:
    | string
    | null;
  backdrop_path?:
    | string
    | null;
  release_date?: string;
  vote_average?: number;
  vote_count?: number;
  overview?: string;
  runtime?: number;
  genres?: any[];
  popularity?: number;
  status?: string;
  [key: string]: any;
};

type LibraryItem = {
  library_id: string;
  tmdb_id: number;
  media_type:
    "movie";
  favorite: boolean;
  status:
    string |
    null;
  personal_rating:
    number |
    null;
};

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
          ? "Provavelmente retornou uma página HTML/404."
          : ""
      }`
    );
  }

  return response.json();
}

function statusLabel(
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

function formatRuntime(
  minutes:
    number
) {
  if (
    !minutes ||
    minutes <=
      0
  ) {
    return "—";
  }

  const hours =
    Math.floor(
      minutes /
      60
    );

  const rest =
    minutes %
    60;

  if (
    hours ===
    0
  ) {
    return `${rest}min`;
  }

  return `${hours}h ${rest}min`;
}

export default function CollectionPage() {
  const params =
    useParams<{
      id:
        string;
    }>();

  const [
    collection,
    setCollection,
  ] =
    useState<any>(
      null
    );

  const [
    stats,
    setStats,
  ] =
    useState<any>(
      null
    );

  const [
    movies,
    setMovies,
  ] =
    useState<
      CollectionMovie[]
    >([]);

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
    error,
    setError,
  ] =
    useState("");

  const [
    filter,
    setFilter,
  ] =
    useState<
      "all" |
      "watched" |
      "missing"
    >("all");

  const [
    sort,
    setSort,
  ] =
    useState<
      "release" |
      "rating"
    >("release");

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
    useState<
      CollectionMovie |
      null
    >(null);

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
    bulkProcessing,
    setBulkProcessing,
  ] =
    useState(false);

  const [
    removeTarget,
    setRemoveTarget,
  ] =
    useState<
      CollectionMovie |
      null
    >(null);

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

  /*
   * Menu de status fecha clicando fora.
   */
  useEffect(() => {
    if (
      !openMenu
    ) {
      return;
    }

    function outside(
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
          ".collection-status-trigger"
        ) ||
        target.closest(
          ".collection-status-menu"
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
      outside
    );

    return () =>
      document.removeEventListener(
        "mousedown",
        outside
      );
  }, [
    openMenu,
  ]);

  /*
   * Preview fecha com ESC e bloqueia scroll.
   */
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

    function keydown(
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
      keydown
    );

    return () => {
      document.body
        .style.overflow =
        old;

      window.removeEventListener(
        "keydown",
        keydown
      );
    };
  }, [
    previewItem,
  ]);

  /*
   * Streaming/detalhes do olhinho.
   */
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
            `/api/tmdb/movie/${previewItem.id}`
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
  ]);

  useEffect(() => {
    let cancelled =
      false;

    async function load() {
      if (
        !params.id
      ) {
        return;
      }

      try {
        setLoading(
          true
        );

        setError(
          ""
        );

        const [
          collectionResponse,
          libraryResponse,
        ] =
          await Promise.all([
            fetch(
              `/api/collection/${params.id}`
            ),

            fetch(
              "/api/library"
            ),
          ]);

        const collectionData =
          await safeJson(
            collectionResponse
          );

        if (
          !collectionResponse.ok ||
          collectionData?.error
        ) {
          throw new Error(
            collectionData?.error ||
              "Não foi possível carregar a coleção."
          );
        }

        if (
          cancelled
        ) {
          return;
        }

        setCollection(
          collectionData.collection ||
            null
        );

        setStats(
          collectionData.stats ||
            null
        );

        setMovies(
          Array.isArray(
            collectionData.parts
          )
            ? collectionData.parts
            : []
        );

        if (
          libraryResponse.ok
        ) {
          const libraryData =
            await safeJson(
              libraryResponse
            );

          if (
            Array.isArray(
              libraryData
            )
          ) {
            setLibrary(
              libraryData
                .filter(
                  (
                    item:
                      any
                  ) =>
                    item.media
                      ?.tmdb_id &&
                    item.media
                      ?.media_type ===
                      "movie"
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
                      "movie",

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
          }
        }
      } catch (
        error
      ) {
        if (
          !cancelled
        ) {
          setError(
            error instanceof Error
              ? error.message
              : "Erro ao carregar coleção."
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
    params.id,
  ]);

  function getLibraryItem(
    movie:
      CollectionMovie
  ) {
    return library.find(
      (
        item
      ) =>
        item.tmdb_id ===
        Number(
          movie.id
        )
    );
  }

  function patchLibrary(
    movie:
      CollectionMovie,
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
            item
          ) =>
            item.tmdb_id ===
            Number(
              movie.id
            )
              ? {
                  ...item,
                  ...patch,
                }
              : item
        )
    );
  }

  const watchedCount =
    useMemo(
      () =>
        movies.filter(
          (
            movie
          ) => {
            const item =
              getLibraryItem(
                movie
              );

            return (
              item &&
              [
                "watched",
                "rewatched",
              ].includes(
                item.status ||
                  ""
              )
            );
          }
        ).length,
      [
        movies,
        library,
      ]
    );

  const libraryCount =
    useMemo(
      () =>
        movies.filter(
          (
            movie
          ) =>
            Boolean(
              getLibraryItem(
                movie
              )
            )
        ).length,
      [
        movies,
        library,
      ]
    );

  const progress =
    movies.length >
      0
      ? Math.round(
          (
            watchedCount /
            movies.length
          ) *
            100
        )
      : 0;

  const visibleMovies =
    useMemo(
      () => {
        let list =
          [
            ...movies,
          ];

        if (
          filter ===
          "watched"
        ) {
          list =
            list.filter(
              (
                movie
              ) => {
                const item =
                  getLibraryItem(
                    movie
                  );

                return (
                  item &&
                  [
                    "watched",
                    "rewatched",
                  ].includes(
                    item.status ||
                      ""
                  )
                );
              }
            );
        }

        if (
          filter ===
          "missing"
        ) {
          list =
            list.filter(
              (
                movie
              ) => {
                const item =
                  getLibraryItem(
                    movie
                  );

                return (
                  !item ||
                  ![
                    "watched",
                    "rewatched",
                  ].includes(
                    item.status ||
                      ""
                  )
                );
              }
            );
        }

        if (
          sort ===
          "rating"
        ) {
          list.sort(
            (
              a,
              b
            ) =>
              Number(
                b.vote_average ||
                  0
              ) -
              Number(
                a.vote_average ||
                  0
              )
          );
        } else {
          list.sort(
            (
              a,
              b
            ) =>
              String(
                a.release_date ||
                  "9999-12-31"
              ).localeCompare(
                String(
                  b.release_date ||
                    "9999-12-31"
                )
              )
          );
        }

        return list;
      },
      [
        movies,
        library,
        filter,
        sort,
      ]
    );

  async function addToLibrary(
    movie:
      CollectionMovie,
    status =
      "want"
  ) {
    const existing =
      getLibraryItem(
        movie
      );

    if (
      existing
    ) {
      if (
        existing.status !==
        status
      ) {
        await updateStatus(
          movie,
          status
        );
      }

      return;
    }

    const key =
      `movie-${movie.id}`;

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
              JSON.stringify({
                media: {
                  ...movie,

                  media_type:
                    "movie",

                  title:
                    movie.title,

                  original_title:
                    movie.original_title ||
                    movie.title,

                  genres:
                    movie.genres ||
                    [],
                },

                status,

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
          ...current,
          {
            library_id:
              String(
                data.id
              ),

            tmdb_id:
              Number(
                movie.id
              ),

            media_type:
              "movie",

            favorite:
              Boolean(
                data.favorite
              ),

            status:
              data.status ||
              status,

            personal_rating:
              data.personal_rating ??
              null,
          },
        ]
      );
    } finally {
      setProcessing(
        null
      );
    }
  }

  async function updateStatus(
    movie:
      CollectionMovie,
    status:
      string
  ) {
    const existing =
      getLibraryItem(
        movie
      );

    if (
      !existing
    ) {
      await addToLibrary(
        movie,
        status
      );

      return;
    }

    const key =
      `movie-${movie.id}`;

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
            "Não foi possível alterar o status."
        );
      }

      patchLibrary(
        movie,
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
    movie:
      CollectionMovie
  ) {
    const existing =
      getLibraryItem(
        movie
      );

    if (
      !existing
    ) {
      return;
    }

    const next =
      !existing.favorite;

    const key =
      `movie-${movie.id}`;

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
            "Não foi possível atualizar o favorito."
        );
      }

      patchLibrary(
        movie,
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
    movie:
      CollectionMovie,
    rating:
      number |
      null
  ) {
    const existing =
      getLibraryItem(
        movie
      );

    if (
      !existing
    ) {
      return;
    }

    const key =
      `movie-${movie.id}`;

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
            "Não foi possível alterar a nota."
        );
      }

      patchLibrary(
        movie,
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
    movie:
      CollectionMovie
  ) {
    if (
      skipRemoveConfirm
    ) {
      removeMovie(
        movie
      );

      return;
    }

    setRemoveTarget(
      movie
    );

    setOpenMenu(
      null
    );
  }

  async function removeMovie(
    movie:
      CollectionMovie
  ) {
    const existing =
      getLibraryItem(
        movie
      );

    if (
      !existing
    ) {
      return;
    }

    const key =
      `movie-${movie.id}`;

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
            "Não foi possível remover."
        );
      }

      setLibrary(
        (
          current
        ) =>
          current.filter(
            (
              item
            ) =>
              item.library_id !==
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

  /*
   * Adiciona apenas os que ainda não estão.
   */
  async function addAll() {
    try {
      setBulkProcessing(
        true
      );

      for (
        const movie
        of movies
      ) {
        if (
          !getLibraryItem(
            movie
          )
        ) {
          await addToLibrary(
            movie,
            "want"
          );
        }
      }
    } finally {
      setBulkProcessing(
        false
      );
    }
  }

  /*
   * Coloca TODOS como Quero assistir.
   * Os já existentes também mudam de status.
   */
  async function setAllWant() {
    try {
      setBulkProcessing(
        true
      );

      for (
        const movie
        of movies
      ) {
        await addToLibrary(
          movie,
          "want"
        );
      }
    } finally {
      setBulkProcessing(
        false
      );
    }
  }

  if (
    loading
  ) {
    return (
      <>
        <div className="topbar">
          <Search />
        </div>

        <div className="empty collection-loading">
          <Loader2
            size={25}
            className="spin"
          />

          Carregando franquia...
        </div>
      </>
    );
  }

  if (
    error ||
    !collection
  ) {
    return (
      <>
        <div className="topbar">
          <Search />
        </div>

        <div className="empty">
          {
            error ||
            "Coleção não encontrada."
          }
        </div>
      </>
    );
  }

  return (
    <>
      <div className="topbar">
        <Search />
      </div>

      <div className="title-back-wrap">
        <SmartBackButton />
      </div>

      {/* =====================================
          HERO
          ===================================== */}

      <section className="collection-hero">
        {collection.backdrop_path && (
          <div
            className="collection-hero-backdrop"
            style={{
              backgroundImage:
                `url(${img(
                  collection.backdrop_path,
                  "w1280"
                )})`,
            }}
          />
        )}

        <div className="collection-hero-overlay" />

        <div className="collection-hero-content">
          <div className="collection-poster-wrap">
            {collection.poster_path ? (
              <img loading="lazy" decoding="async"
                src={img(
                  collection.poster_path,
                  "w500"
                )}
                alt={
                  collection.name
                }
              />
            ) : (
              <div className="collection-poster-empty">
                <Layers3
                  size={48}
                />
              </div>
            )}
          </div>

          <div className="collection-hero-copy">
            <div className="collection-kicker">
              <Layers3
                size={15}
              />

              Coleção / Franquia
            </div>

            <h1>
              {
                collection.name
              }
            </h1>

            {collection.overview && (
              <p className="collection-overview">
                {
                  collection.overview
                }
              </p>
            )}

            <div className="collection-stats">
              <div>
                <strong>
                  {
                    movies.length
                  }
                </strong>

                <span>
                  Filmes
                </span>
              </div>

              <div>
                <strong>
                  {
                    watchedCount
                  }
                </strong>

                <span>
                  Assistidos
                </span>
              </div>

              <div>
                <strong>
                  {
                    libraryCount
                  }
                </strong>

                <span>
                  Na biblioteca
                </span>
              </div>

              {stats?.total_runtime >
                0 && (
                <div>
                  <strong>
                    {formatRuntime(
                      Number(
                        stats.total_runtime
                      )
                    )}
                  </strong>

                  <span>
                    Duração total
                  </span>
                </div>
              )}

              {stats?.average_rating && (
                <div>
                  <strong>
                    {Number(
                      stats.average_rating
                    ).toFixed(
                      1
                    )}
                  </strong>

                  <span>
                    Média TMDB
                  </span>
                </div>
              )}
            </div>

            <div className="collection-hero-actions">
              <button
                type="button"
                className="btn primary"
                disabled={
                  bulkProcessing
                }
                onClick={
                  addAll
                }
              >
                {bulkProcessing ? (
                  <Loader2
                    size={16}
                    className="spin"
                  />
                ) : (
                  <Plus
                    size={16}
                  />
                )}

                Adicionar os que faltam
              </button>

              <button
                type="button"
                className="btn"
                disabled={
                  bulkProcessing
                }
                onClick={
                  setAllWant
                }
              >
                <Sparkles
                  size={16}
                />

                Quero assistir todos
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* =====================================
          PROGRESSO
          ===================================== */}

      <section className="section">
        <div className="panel collection-progress-panel">
          <div className="collection-progress-head">
            <div>
              <span className="eyebrow">
                SEU PROGRESSO
              </span>

              <h2>
                {watchedCount} de{" "}
                {movies.length}{" "}
                assistidos
              </h2>
            </div>

            <strong>
              {
                progress
              }%
            </strong>
          </div>

          <div className="collection-progress-track">
            <div
              style={{
                width:
                  `${progress}%`,
              }}
            />
          </div>

          <p className="muted">
            {progress ===
            100
              ? "Franquia concluída."
              : progress ===
                  0
                ? "Você ainda não concluiu nenhum filme desta coleção."
                : `Faltam ${
                    movies.length -
                    watchedCount
                  } para concluir a coleção.`}
          </p>
        </div>
      </section>

      {/* =====================================
          CONTROLES
          ===================================== */}

      <section className="section collection-toolbar">
        <div className="collection-tabs">
          <button
            type="button"
            className={
              filter ===
              "all"
                ? "active"
                : ""
            }
            onClick={() =>
              setFilter(
                "all"
              )
            }
          >
            Todos
            <span>
              {
                movies.length
              }
            </span>
          </button>

          <button
            type="button"
            className={
              filter ===
              "watched"
                ? "active"
                : ""
            }
            onClick={() =>
              setFilter(
                "watched"
              )
            }
          >
            Assistidos
            <span>
              {
                watchedCount
              }
            </span>
          </button>

          <button
            type="button"
            className={
              filter ===
              "missing"
                ? "active"
                : ""
            }
            onClick={() =>
              setFilter(
                "missing"
              )
            }
          >
            Faltando
            <span>
              {movies.length -
                watchedCount}
            </span>
          </button>
        </div>

        <label className="collection-sort">
          <span>
            Ordenar
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
                  .value as
                  | "release"
                  | "rating"
              )
            }
          >
            <option value="release">
              Ordem de lançamento
            </option>

            <option value="rating">
              Melhor avaliados
            </option>
          </select>
        </label>
      </section>

      {/* =====================================
          FILMES
          ===================================== */}

      <section className="section">
        <div className="section-head">
          <div>
            <div className="eyebrow">
              FILMOGRAFIA DA FRANQUIA
            </div>

            <h2>
              {
                filter ===
                "all"
                  ? "Todos os filmes"
                  : filter ===
                      "watched"
                    ? "Já assistidos"
                    : "Ainda faltam"
              }
            </h2>
          </div>

          <span className="muted">
            {
              visibleMovies.length
            } títulos
          </span>
        </div>

        {visibleMovies.length ===
        0 ? (
          <div className="empty collection-filter-empty">
            <Film
              size={25}
            />

            Nenhum filme neste filtro.
          </div>
        ) : (
          <div className="collection-grid">
            {visibleMovies.map(
              (
                movie,
                index
              ) => (
                <CollectionCard
                  key={
                    movie.id
                  }
                  movie={
                    movie
                  }
                  index={
                    index
                  }
                  libraryItem={
                    getLibraryItem(
                      movie
                    )
                  }
                  processing={
                    processing
                  }
                  menuOpen={
                    openMenu ===
                    `movie-${movie.id}`
                  }
                  setOpenMenu={
                    setOpenMenu
                  }
                  setPreviewItem={
                    setPreviewItem
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
        )}
      </section>

      {/* PREVIEW */}

      {previewItem && (
        <CollectionPreview
          movie={
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

      {/* CONFIRMAÇÃO REMOVER */}

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
                REMOVER DA BIBLIOTECA
              </div>

              <h3>
                Remover “{
                  removeTarget.title
                }”?
              </h3>

              <p className="muted">
                O filme sairá da sua biblioteca, mas continuará aparecendo nesta franquia.
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
                  removeMovie(
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

function CollectionCard({
  movie,
  index,
  libraryItem,
  processing,
  menuOpen,
  setOpenMenu,
  setPreviewItem,
  addToLibrary,
  updateStatus,
  toggleFavorite,
  requestRemove,
}: any) {
  const key =
    `movie-${movie.id}`;

  const busy =
    processing ===
    key;

  const year =
    (
      movie.release_date ||
      ""
    ).slice(
      0,
      4
    );

  return (
    <article className="collection-card">
      <div className="collection-card-poster">
        <Link
          href={`/title/movie/${movie.id}`}
        >
          {movie.poster_path ? (
            <img
              src={img(
                movie.poster_path
              )}
              alt={
                movie.title
              }
              loading="lazy"
            />
          ) : (
            <div className="collection-no-poster">
              <Film
                size={28}
              />
            </div>
          )}
        </Link>

        <span className="collection-order">
          #{index + 1}
        </span>

        <span className="badge">
          FILME
        </span>

        {libraryItem && (
          <span className="collection-status-badge">
            {statusLabel(
              libraryItem.status
            )}
          </span>
        )}

        <div className="collection-card-actions">
          <button
            type="button"
            title="Ver rápido"
            onClick={() =>
              setPreviewItem(
                movie
              )
            }
          >
            <Eye
              size={16}
            />
          </button>

          {libraryItem ? (
            <button
              type="button"
              className="active collection-status-trigger"
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
                  movie,
                  "want"
                )
              }
            >
              {busy ? (
                <Loader2
                  size={15}
                  className="spin"
                />
              ) : (
                <Plus
                  size={17}
                />
              )}
            </button>
          )}

          {libraryItem && (
            <button
              type="button"
              className={
                libraryItem.favorite
                  ? "active"
                  : ""
              }
              title={
                libraryItem.favorite
                  ? "Remover dos favoritos"
                  : "Favoritar"
              }
              disabled={
                busy
              }
              onClick={() =>
                toggleFavorite(
                  movie
                )
              }
            >
              <Heart
                size={15}
                fill={
                  libraryItem.favorite
                    ? "currentColor"
                    : "none"
                }
              />
            </button>
          )}
        </div>

        {libraryItem &&
          menuOpen && (
          <div className="collection-status-menu">
            <div className="collection-status-menu-head">
              <span>
                Status
              </span>

              <strong>
                {statusLabel(
                  libraryItem.status
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
                    libraryItem.status ===
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
                      movie,
                      value
                    )
                  }
                >
                  <span>
                    {
                      label
                    }
                  </span>

                  {libraryItem.status ===
                    value && (
                    <Check
                      size={13}
                    />
                  )}
                </button>
              )
            )}

            <div className="collection-status-divider" />

            <button
              type="button"
              className="remove"
              onClick={() =>
                requestRemove(
                  movie
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
        href={`/title/movie/${movie.id}`}
        className="collection-card-body"
      >
        <strong>
          {
            movie.title
          }
        </strong>

        <div className="collection-card-meta">
          <span>
            {year ||
              "Sem data"}
          </span>

          {Number(
            movie.runtime ||
              0
          ) >
            0 && (
            <span>
              <Clock3
                size={11}
              />
              {formatRuntime(
                Number(
                  movie.runtime
                )
              )}
            </span>
          )}

          {Number(
            movie.vote_average ||
              0
          ) >
            0 && (
            <span className="rating">
              <Star
                size={11}
                fill="currentColor"
              />
              {Number(
                movie.vote_average
              ).toFixed(
                1
              )}
            </span>
          )}
        </div>
      </Link>
    </article>
  );
}

function CollectionPreview({
  movie,
  details,
  loading,
  libraryItem,
  processing,
  onClose,
  onAdd,
  onRating,
}: any) {
  const source =
    details ||
    movie;

  const busy =
    processing ===
    `movie-${movie.id}`;

  const genres =
    Array.isArray(
      source?.genres
    )
      ? source.genres
      : [];

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
              source.poster_path
            )}
            alt={
              source.title
            }
          />
        </div>

        <div className="discover-preview-content">
          <div className="eyebrow">
            FILME
          </div>

          <h2>
            {
              source.title
            }
          </h2>

          <div className="discover-preview-meta">
            <span>
              {(
                source.release_date ||
                ""
              ).slice(
                0,
                4
              ) ||
                "Ano não informado"}
            </span>

            {source.runtime && (
              <span>
                {formatRuntime(
                  Number(
                    source.runtime
                  )
                )}
              </span>
            )}

            {Number(
              source.vote_average ||
                0
            ) >
              0 && (
              <span className="rating">
                <Star
                  size={14}
                  fill="currentColor"
                />
                {Number(
                  source.vote_average
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
                {statusLabel(
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

          <CollectionProviders
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
                          movie,
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
                      movie,
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
            {source.overview?.trim() ||
              "Ainda não há sinopse disponível para este filme."}
          </p>

          <div className="discover-preview-actions">
            <Link
              href={`/title/movie/${movie.id}`}
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
                    movie,
                    "want"
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

function CollectionProviders({
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
    ].filter(
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
    streaming.length ===
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

      {streaming.length >
        0 && (
        <ProviderRow
          label="Streaming"
          providers={
            streaming
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
              key={
                provider.provider_id
              }
              className="preview-watch-provider"
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