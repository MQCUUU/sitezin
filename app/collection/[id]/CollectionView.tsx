"use client";

import { useConfirm } from "@/components/ConfirmProvider";
import "@/styles/features/collection.css";
import "@/styles/features/screen-kit.css";
import { removeFromLibrary } from "@/lib/library/actions";
import { removalConfirmOptions } from "@/lib/library/remove";
import { apiFetch } from "@/lib/api-client";
import { Poster } from "@/components/Poster";
import { chunkLibraryStateIds } from "@/lib/library-state-batches";
import { ApiError } from "@/lib/api-client";
import { intentForMedia, type LibraryIntent } from "@/lib/auth/pending-action";
import { useLibraryAuth } from "@/hooks/useLibraryAuth";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Layers3, Loader2, Plus } from "lucide-react";
import { SmartBackButton } from "@/components/SmartBackButton";
import { img } from "@/lib/tmdb";
import { MediaPreviewDialog } from "@/components/media/preview/MediaPreviewDialog";
import { WatchProviderList } from "@/components/media/preview/WatchProviderList";
import { fromLooseMediaItem } from "@/components/media/preview/adapters";
import { normalizeWatchProviders } from "@/components/media/providers";
import { safeJson, formatRuntime, type CollectionMovie, type LibraryItem } from "@/components/collection/shared";
import { CollectionCard } from "@/components/collection/CollectionCard";
import { ReelProgress } from "@/components/ui/ReelProgress";
/*
 * Fase 6 — o Server Component (page.tsx) busca a coleção e entrega aqui em
 * `initialData`: o HTML inicial já traz o hero e a lista. Só se o servidor
 * falhar o cliente busca de novo, como antes.
 */
export default function CollectionView({
  id,
  initialData,
}: {
  id: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mesmo formato livre de antes (collection/stats eram any)
  initialData: { collection: any; stats: any; parts: CollectionMovie[] } | null;
}) {
  // Fase 1: visitante é convidado a entrar; 401 nunca vira "Não autenticado".
  const libraryAuth = useLibraryAuth();
  const canLookupLibrary = libraryAuth.state === "authenticated" || libraryAuth.state === "unknown";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [collection, setCollection] = useState<any>(initialData?.collection ?? null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [stats, setStats] = useState<any>(initialData?.stats ?? null);
  const [movies, setMovies] = useState<CollectionMovie[]>(initialData?.parts ?? []);

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
    useState(!initialData);

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

  const confirm = useConfirm();

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
   * Escape/scroll-lock for previewItem now come from MediaPreviewDialog's
   * underlying Dialog (C2.3) — this effect used to duplicate that.
   */

  /*
   * Streaming/detalhes do olhinho.
   */
  // Só o id (e o tipo) disparam a prévia; o resto do item não muda o pedido.
  const previewId = previewItem?.id;
  useEffect(() => {
    let cancelled =
      false;

    async function loadPreview() {
      if (
        !previewId
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
            `/api/tmdb/movie/${previewId}`
          );

        const data =
          await safeJson(
            response
          );

        if (!response.ok || data?.error) {
        throw new ApiError(data?.error || "Erro ao carregar detalhes.", { status: response.status });
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
    previewId,
  ]);

  useEffect(() => {
    let cancelled =
      false;

    async function load() {
      if (initialData) {
        return;
      }

      try {
        setLoading(
          true
        );

        setError(
          ""
        );

        const collectionData = await apiFetch(`/api/collection/${id}`);

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
    id,
    initialData,
  ]);

  /*
   * Fase 1 (P2-03): estado pessoal das partes só com sessão — visitante não
   * dispara POST /api/library/state (que daria 401). Efeito próprio para
   * rodar também quando a sessão termina de carregar depois da coleção.
   * V2.1-D: ceil(N/100) chamadas em lote, só com os IDs das partes.
   */
  useEffect(() => {
    if (!canLookupLibrary || movies.length === 0) return;

    let cancelled = false;

    const partIds: number[] = movies
      .map((part: any) => Number(part?.id))
      .filter((id: number) => Number.isInteger(id) && id > 0);

    Promise.all(
      chunkLibraryStateIds(partIds).map(async (ids) => {
        const stateResponse = await fetch("/api/library/state", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: ids.map((id) => ({ media_type: "movie", tmdb_id: id })),
          }),
        });

        if (!stateResponse.ok) return [];

        const stateData = await safeJson(stateResponse);
        return Array.isArray(stateData?.items) ? stateData.items : [];
      })
    )
      .then((batches) => {
        if (cancelled) return;

        setLibrary(
          batches.flat().map((item: any) => ({
            library_id: String(item.library_id),
            tmdb_id: Number(item.tmdb_id),
            media_type: "movie",
            favorite: Boolean(item.favorite),
            status: item.status || null,
            personal_rating:
              item.personal_rating === null ||
              item.personal_rating === undefined
                ? null
                : Number(item.personal_rating),
          }))
        );
      })
      .catch(() => {
        /* estado pessoal é opcional — a coleção pública segue funcionando */
      });

    return () => {
      cancelled = true;
    };
  }, [movies, canLookupLibrary]);

  /*
   * Fase 1 — pontos de entrada das ações (cards, "Ver rápido", botões em lote):
   * visitante confirmado é convidado a entrar (sem chamar a API) e qualquer
   * falha vira mensagem amigável — 401 = "entre para salvar"/"sessão expirou".
   */
  function runGuarded(intent: LibraryIntent | undefined, fallback: string, run: () => Promise<unknown>) {
    if (!libraryAuth.requireUser(intent)) return;

    void run().catch((error) => {
      console.error(error);
      libraryAuth.handleError(error, intent, fallback);
    });
  }

  // useCallback: as listas memorizadas abaixo dependem dele (e, por ele, de `library`).
  // Declarado antes de qualquer função que o use — o React Compiler exige essa ordem.
  const getLibraryItem = useCallback(
    (movie: CollectionMovie) => library.find((item) => item.tmdb_id === Number(movie.id)),
    [library]
  );

  const asMedia = (movie: CollectionMovie) => ({ ...movie, media_type: "movie" });

  function guardedAdd(movie: CollectionMovie, status = "want") {
    runGuarded(intentForMedia(asMedia(movie), status === "want" ? "add" : "status", status), "Erro ao adicionar", () => addToLibrary(movie, status));
  }

  function guardedUpdateStatus(movie: CollectionMovie, status: string) {
    runGuarded(intentForMedia(asMedia(movie), "status", status), "Erro ao alterar status", () => updateStatus(movie, status));
  }

  function guardedToggleFavorite(movie: CollectionMovie) {
    const intent = getLibraryItem(movie)?.favorite ? undefined : intentForMedia(asMedia(movie), "favorite");
    runGuarded(intent, "Erro ao alterar curtida", () => toggleFavorite(movie));
  }

  function guardedUpdateRating(movie: CollectionMovie, rating: number | null) {
    runGuarded(undefined, "Erro ao alterar sua nota", () => updateRating(movie, rating));
  }

  function guardedBulk(run: () => Promise<unknown>) {
    runGuarded(undefined, "Não foi possível atualizar a coleção", run);
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
                "rewatching",
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
        getLibraryItem,
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
        getLibraryItem,
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
                    "rewatching",
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
                    "rewatching",
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
        getLibraryItem,
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

      if (!response.ok || data?.error) {
        throw new ApiError(data?.error || "Não foi possível adicionar.", { status: response.status });
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

      if (!response.ok || data?.error) {
        throw new ApiError(data?.error || "Não foi possível alterar o status.", { status: response.status });
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

      if (!response.ok || data?.error) {
        throw new ApiError(data?.error || "Não foi possível atualizar a curtida.", { status: response.status });
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

      if (!response.ok || data?.error) {
        throw new ApiError(data?.error || "Não foi possível alterar a nota.", { status: response.status });
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

  async function requestRemove(
    movie: CollectionMovie
  ) {
    setOpenMenu(null);

    const ok = await confirm(removalConfirmOptions(movie.title));

    if (!ok) return;

    await removeMovie(movie);
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

      await removeFromLibrary(existing.library_id);

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

      <div className="title-back-wrap">
        <SmartBackButton />
      </div>

      {/* Fase 4b: uma página só (antes, duas abas): topo, progresso e os filmes. */}
      <section className="sk-hero">
        {collection.backdrop_path && (
          <div
            className="sk-hero-backdrop"
            aria-hidden="true"
            style={{ backgroundImage: `url(${img(collection.backdrop_path, "w1280")})` }}
          />
        )}

        <div className="sk-hero-content">
          <div className="sk-hero-poster">
            {collection.poster_path ? (
              <Poster path={collection.poster_path} alt={collection.name} sizes="(max-width: 700px) 120px, 220px" priority />
            ) : (
              <div className="sk-hero-poster-empty">
                <Layers3 size={48} aria-hidden="true" />
              </div>
            )}
          </div>

          <div className="sk-hero-copy">
            <p className="sk-hero-kicker">Coleção</p>
            <h1>{collection.name}</h1>
            {collection.overview && <p className="sk-hero-text">{collection.overview}</p>}

            <dl className="sk-stats">
              <div>
                <dt>Filmes</dt>
                <dd>{movies.length}</dd>
              </div>
              {stats?.total_runtime > 0 && (
                <div>
                  <dt>Duração total</dt>
                  <dd>{formatRuntime(Number(stats.total_runtime))}</dd>
                </div>
              )}
              {stats?.average_rating && (
                <div>
                  <dt>Média no TMDB</dt>
                  <dd>{Number(stats.average_rating).toFixed(1).replace(".", ",")}</dd>
                </div>
              )}
              <div>
                <dt>Na biblioteca</dt>
                <dd>{libraryCount}</dd>
              </div>
            </dl>

            <div className="sk-hero-actions">
              <Button variant="primary" type="button" disabled={bulkProcessing} onClick={() => guardedBulk(addAll)}>
                {bulkProcessing ? <Loader2 size={16} className="spin" aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />}
                Adicionar os que faltam
              </Button>
              <Button type="button" className="sk-btn" disabled={bulkProcessing} onClick={() => guardedBulk(setAllWant)}>
                Quero assistir todos
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section className="cl-progress" aria-label="Seu progresso na coleção">
        <div className="cl-progress-head">
          <h2>
            {watchedCount} de {movies.length} assistidos
          </h2>
          <span>{progress}%</span>
        </div>
        <ReelProgress
          watched={watchedCount}
          total={movies.length}
          label="Progresso da coleção"
          valueText={`${watchedCount} de ${movies.length} assistidos`}
        />
        <p>
          {progress === 100
            ? "Coleção concluída."
            : progress === 0
              ? "Você ainda não assistiu nenhum filme desta coleção."
              : `Faltam ${movies.length - watchedCount} para concluir a coleção.`}
        </p>
      </section>

      <section className="sk-section cl-films" aria-labelledby="collection-films-title">
        <div className="sk-section-head">
          <h2 id="collection-films-title">Filmes</h2>
        </div>

        <div className="sk-bar cl-bar">
          <div className="sk-chips" role="radiogroup" aria-label="Mostrar">
            {(
              [
                ["all", "Todos", movies.length],
                ["watched", "Assistidos", watchedCount],
                ["missing", "Faltando", movies.length - watchedCount],
              ] as const
            ).map(([value, label, count]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={filter === value}
                className="sk-chip"
                onClick={() => setFilter(value)}
              >
                {label} <span className="cl-chip-count">{count}</span>
              </button>
            ))}
          </div>

          <label className="sk-field cl-sort">
            <span className="mc-visually-hidden">Ordenar</span>
            <select value={sort} onChange={(event) => setSort(event.target.value as "release" | "rating")}>
              <option value="release">Ordem de lançamento</option>
              <option value="rating">Mais bem avaliados</option>
            </select>
          </label>
        </div>

        {visibleMovies.length === 0 ? (
          <div className="sk-empty">
            <h2>{filter === "watched" ? "Nenhum filme assistido ainda" : "Você já assistiu todos"}</h2>
          </div>
        ) : (
          <div className="collection-grid">
            {visibleMovies.map((movie) => (
              <CollectionCard
                key={movie.id}
                movie={movie}
                libraryItem={getLibraryItem(movie)}
                processing={processing}
                menuOpen={openMenu === `movie-${movie.id}`}
                setOpenMenu={setOpenMenu}
                setPreviewItem={setPreviewItem}
                addToLibrary={guardedAdd}
                updateStatus={guardedUpdateStatus}
                toggleFavorite={guardedToggleFavorite}
                requestRemove={requestRemove}
              />
            ))}
          </div>
        )}
      </section>

      {/* PREVIEW */}

      <MediaPreviewDialog
        open={Boolean(previewItem)}
        onClose={() => setPreviewItem(null)}
        data={
          previewItem
            ? fromLooseMediaItem(previewItem, previewDetails, getLibraryItem(previewItem) || null, "movie", true)
            : null
        }
        actions={{
          onAdd: () => previewItem && guardedAdd(previewItem),
          addLabel: "Quero assistir",
          onRating: (_, rating) => previewItem && guardedUpdateRating(previewItem, rating),
          disabled: previewItem ? processing === `movie-${previewItem.id}` : false,
        }}
        providers={<WatchProviderList data={normalizeWatchProviders(previewDetails?.watch_providers, "BR")} loading={previewLoading} />}
      />

    </>
  );
}

