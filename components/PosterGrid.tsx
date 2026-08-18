"use client";

import Link from "next/link";
import {
  Heart,
  Trash2,
  Loader2,
  Eye,
  ChevronDown,
  Play,
  Check,
  Clock,
  Grid3X3,
  LayoutGrid,
  List,
  Star,
} from "lucide-react";

import { img } from "@/lib/tmdb";
import type { LibraryItem } from "@/lib/types";
import { STATUS_LABELS } from "@/lib/types";
import { useToast } from "@/components/ToastProvider";

import { Poster } from "@/components/Poster";
import { CarouselRail } from "@/components/CarouselRail";

import { useEffect, useState } from "react";

type ViewMode =
  | "grid"
  | "compact"
  | "list";

export function PosterGrid({
  items,
  onChanged,
  viewMode = "grid",
  onViewModeChange,
  carousel = false,
}: {
  items: LibraryItem[];
  onChanged?: () => void;
  viewMode?: ViewMode;
  onViewModeChange?: (
    mode: ViewMode
  ) => void;
  carousel?: boolean;
}) {
  const toast =
    useToast();

  const [processing, setProcessing] =
    useState<string | number | null>(null);

  const [openStatusMenu, setOpenStatusMenu] =
    useState<string | number | null>(null);

  const [previewItem, setPreviewItem] =
    useState<LibraryItem | null>(null);

  const [previewDetails, setPreviewDetails] =
    useState<any>(null);

  const [previewDetailsLoading, setPreviewDetailsLoading] =
    useState(false);

  const [localItems, setLocalItems] =
    useState<LibraryItem[]>(items);

  const [removeTarget, setRemoveTarget] =
    useState<LibraryItem | null>(null);

useEffect(() => {
  if (
    !previewItem &&
    !removeTarget
  ) {
    return;
  }

  const previousOverflow =
    document.body.style.overflow;

  function handleModalKeyDown(
    event: KeyboardEvent,
  ) {
    if (event.key !== "Escape") {
      return;
    }

    setPreviewItem(null);
    setRemoveTarget(null);
  }

  document.body.style.overflow =
    "hidden";

  document.addEventListener(
    "keydown",
    handleModalKeyDown,
  );

  return () => {
    document.body.style.overflow =
      previousOverflow;

    document.removeEventListener(
      "keydown",
      handleModalKeyDown,
    );
  };
}, [previewItem, removeTarget]);

  const [
  skipRemoveConfirm,
  setSkipRemoveConfirm
] =
  useState(() => {
    if (
      typeof window ===
      "undefined"
    ) {
      return false;
    }

    try {
      return (
        window.localStorage
          .getItem(
            "mycatalog_skip_remove_confirm"
          ) === "1"
      );
    } catch {
      return false;
    }
  });

  useEffect(() => {
    setLocalItems(items);
  }, [items]);


  useEffect(() => {
    let cancelled =
      false;

    async function loadPreviewDetails() {
      if (
        !previewItem?.tmdb_id ||
        !previewItem?.media_type
      ) {
        setPreviewDetails(null);
        return;
      }

      try {
        setPreviewDetailsLoading(true);

        const response =
          await fetch(
            `/api/tmdb/${previewItem.media_type}/${previewItem.tmdb_id}`
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
          setPreviewDetails(result);
        }
      } catch (error) {
        console.error(
          "Erro ao carregar preview:",
          error
        );

        if (!cancelled) {
          setPreviewDetails(null);
        }
      } finally {
        if (!cancelled) {
          setPreviewDetailsLoading(false);
        }
      }
    }

    loadPreviewDetails();

    return () => {
      cancelled = true;
    };
  }, [
    previewItem?.tmdb_id,
    previewItem?.media_type,
  ]);



  useEffect(() => {
    if (
      openStatusMenu ===
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
       * Se clicou no botão que abre o menu
       * ou dentro do próprio menu, não fecha.
       */
      if (
        target.closest(
          ".library-status-action"
        ) ||
        target.closest(
          ".library-card-status-menu"
        )
      ) {
        return;
      }

      setOpenStatusMenu(
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
    openStatusMenu,
  ]);

  if (!localItems.length) {
    return (
      <div className="empty">
        Nenhum título encontrado.
        <br />
        Tente alterar os filtros ou
        adicionar novos títulos.
      </div>
    );
  }

  function patchItemLocal(
    libraryId:
      string |
      number,
    patch:
      Partial<
        LibraryItem
      >
  ) {
    setLocalItems(
      (
        current
      ) =>
        current.map(
          (
            currentItem
          ) =>
            currentItem.library_id ===
            libraryId
              ? {
                  ...currentItem,
                  ...patch,
                }
              : currentItem
        )
    );

    setPreviewItem(
      (
        current
      ) =>
        current?.library_id ===
        libraryId
          ? {
              ...current,
              ...patch,
            }
          : current
    );
  }

  function mediaPayload(
    item:
      LibraryItem
  ) {
    return {
      id:
        item.tmdb_id,

      media_type:
        item.media_type,

      title:
        item.title,

      original_title:
        item.original_title,

      overview:
        item.overview,

      poster_path:
        item.poster_path,

      backdrop_path:
        item.backdrop_path,

      release_date:
        item.release_date,

      first_air_date:
        item.first_air_date,

      genres:
        item.genres ||
        [],

      vote_average:
        item.tmdb_rating,

      vote_count:
        item.tmdb_vote_count,

      number_of_seasons:
        (item as any)
          .number_of_seasons ||
        (item as any)
          .seasons_count ||
        null,

      number_of_episodes:
        (item as any)
          .number_of_episodes ||
        null,
    };
  }

  async function toggleFavorite(
    item:
      LibraryItem
  ) {
    const oldValue =
      Boolean(
        item.favorite
      );

    const nextValue =
      !oldValue;

    try {
      setProcessing(
        item.library_id
      );

      patchItemLocal(
        item.library_id,
        {
          favorite:
            nextValue,
        }
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
                  nextValue,
              }),
          }
        );

      const data =
        await response.json();

      if (
        !response.ok ||
        data?.error
      ) {
        throw new Error(
          data?.error ||
            "Não foi possível atualizar a curtida."
        );
      }

      toast.success(
        nextValue
          ? `${item.title} foi curtido`
          : `${item.title} saiu dos curtidos`,
        {
          actionLabel:
            "Desfazer",

          onAction:
            async () => {
              const undo =
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
                          oldValue,
                      }),
                  }
                );

              const undone =
                await undo.json();

              if (
                !undo.ok ||
                undone?.error
              ) {
                throw new Error(
                  undone?.error ||
                    "Não foi possível desfazer."
                );
              }

              patchItemLocal(
                item.library_id,
                {
                  favorite:
                    oldValue,
                }
              );
            },
        }
      );
    } catch (
      error
    ) {
      console.error(
        error
      );

      patchItemLocal(
        item.library_id,
        {
          favorite:
            oldValue,
        }
      );

      toast.error(
        "Erro ao atualizar curtida",
        {
          description:
            error instanceof Error
              ? error.message
              : "Tente novamente.",
        }
      );
    } finally {
      setProcessing(
        null
      );
    }
  }

  async function changeStatus(
    item:
      LibraryItem,
    nextStatus:
      string
  ) {
    const oldStatus =
      item.status;

    try {
      setProcessing(
        item.library_id
      );

      patchItemLocal(
        item.library_id,
        {
          status:
            nextStatus as any,
        }
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

      const data =
        await response.json();

      if (
        !response.ok ||
        data?.error
      ) {
        throw new Error(
          data?.error ||
            "Não foi possível alterar o status."
        );
      }

      setOpenStatusMenu(
        null
      );

      toast.success(
        `Status de ${item.title} atualizado`,
        {
          description:
            STATUS_LABELS[
              nextStatus as keyof typeof STATUS_LABELS
            ] ||
            nextStatus,

          actionLabel:
            "Desfazer",

          onAction:
            async () => {
              const undo =
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
                          oldStatus,
                      }),
                  }
                );

              const undone =
                await undo.json();

              if (
                !undo.ok ||
                undone?.error
              ) {
                throw new Error(
                  undone?.error ||
                    "Não foi possível desfazer."
                );
              }

              patchItemLocal(
                item.library_id,
                {
                  status:
                    oldStatus,
                }
              );
            },
        }
      );

    } catch (
      error
    ) {
      console.error(
        error
      );

      patchItemLocal(
        item.library_id,
        {
          status:
            oldStatus,
        }
      );

      toast.error(
        "Erro ao alterar status",
        {
          description:
            error instanceof Error
              ? error.message
              : "A alteração foi revertida.",
        }
      );
    } finally {
      setProcessing(
        null
      );

    }
  }

  async function updatePersonalRating(
    item:
      LibraryItem,
    rating:
      number |
      null
  ) {
    const oldRating =
      item.personal_rating ??
      null;

    try {
      setProcessing(
        item.library_id
      );

      patchItemLocal(
        item.library_id,
        {
          personal_rating:
            rating,
        }
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

      const data =
        await response.json();

      if (
        !response.ok ||
        data?.error
      ) {
        throw new Error(
          data?.error ||
            "Não foi possível alterar sua nota."
        );
      }

      toast.success(
        rating ===
          null
          ? `Nota de ${item.title} removida`
          : `Você deu ${Number(
              rating
            ).toFixed(
              1
            )} para ${item.title}`,
        {
          actionLabel:
            "Desfazer",

          onAction:
            async () => {
              const undo =
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
                          oldRating,
                      }),
                  }
                );

              const undone =
                await undo.json();

              if (
                !undo.ok ||
                undone?.error
              ) {
                throw new Error(
                  undone?.error ||
                    "Não foi possível desfazer."
                );
              }

              patchItemLocal(
                item.library_id,
                {
                  personal_rating:
                    oldRating,
                }
              );
            },
        }
      );

    } catch (
      error
    ) {
      console.error(
        error
      );

      patchItemLocal(
        item.library_id,
        {
          personal_rating:
            oldRating,
        }
      );

      toast.error(
        "Erro ao alterar sua nota",
        {
          description:
            error instanceof Error
              ? error.message
              : "A alteração foi revertida.",
        }
      );
    } finally {
      setProcessing(
        null
      );

    }
  }

  async function performRemove(
    item:
      LibraryItem
  ) {
    const snapshot = {
      ...item,
    };

    try {
      setProcessing(
        item.library_id
      );

      const response =
        await fetch(
          `/api/library?id=${encodeURIComponent(
            String(
              item.library_id
            )
          )}`,
          {
            method:
              "DELETE",
          }
        );

      const data =
        await response.json();

      if (
        !response.ok ||
        data?.error
      ) {
        throw new Error(
          data?.error ||
            "Não foi possível remover."
        );
      }

      setLocalItems(
        (
          current
        ) =>
          current.filter(
            (
              currentItem
            ) =>
              currentItem.library_id !==
              item.library_id
          )
      );

      if (
        previewItem?.library_id ===
        item.library_id
      ) {
        setPreviewItem(
          null
        );
      }

      setOpenStatusMenu(
        null
      );

      setRemoveTarget(
        null
      );

      toast.success(
        `${item.title} removido da biblioteca`,
        {
          description:
            "Você pode restaurar o item por alguns segundos.",

          actionLabel:
            "Desfazer",

          duration:
            8000,

          onAction:
            async () => {
              const restore =
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
                        media:
                          mediaPayload(
                            snapshot
                          ),

                        status:
                          snapshot.status,

                        favorite:
                          Boolean(
                            snapshot.favorite
                          ),

                        personal_rating:
                          snapshot.personal_rating ??
                          null,

                        review:
                          (snapshot as any)
                            .review ||
                          "",
                      }),
                  }
                );

              const restored =
                await restore.json();

              if (
                !restore.ok ||
                restored?.error
              ) {
                throw new Error(
                  restored?.error ||
                    "Não foi possível restaurar."
                );
              }

              const restoredItem:
                LibraryItem = {
                  ...snapshot,

                  ...restored,

                  library_id:
                    restored.id,

                  ...(restored.media ||
                    {}),
                };

              setLocalItems(
                (
                  current
                ) => [
                  restoredItem,
                  ...current.filter(
                    (
                      currentItem
                    ) =>
                      currentItem.library_id !==
                      restoredItem.library_id
                  ),
                ]
              );

              onChanged?.();
            },
        }
      );
    } catch (
      error
    ) {
      console.error(
        error
      );

      toast.error(
        "Erro ao remover",
        {
          description:
            error instanceof Error
              ? error.message
              : "Não foi possível remover o título.",
        }
      );
    } finally {
      setProcessing(
        null
      );
    }
  }

  function requestRemove(
    item: LibraryItem
  ) {
    if (
      skipRemoveConfirm
    ) {
      performRemove(
        item
      );

      return;
    }

    setRemoveTarget(
      item
    );

    setOpenStatusMenu(
      null
    );
  }

  function confirmRemove() {
    if (
      !removeTarget
    ) {
      return;
    }

    performRemove(
      removeTarget
    );
  }


  function getStatus(
    item: LibraryItem
  ) {
    switch (item.status) {
      case "watching":
        return {
          label: "ASSISTINDO",
          icon: (
            <Play
              size={11}
              fill="currentColor"
            />
          ),
          className:
            "status-watching",
        };

      case "watched":
        return {
          label: "ASSISTIDO",
          icon: <Check size={11} />,
          className:
            "status-watched",
        };

      case "want":
        return {
          label: "QUERO ASSISTIR",
          icon: <Clock size={11} />,
          className:
            "status-want",
        };

      case "dropped":
        return {
          label: "ABANDONEI",
          icon: (
            <Trash2 size={11} />
          ),
          className:
            "status-dropped",
        };

      case "rewatching":
        return {
          label: "REASSISTINDO",
          icon: (
            <Play
              size={11}
              fill="currentColor"
            />
          ),
          className:
            "status-rewatching",
        };

      case "rewatched":
        return {
          label: "REASSISTIDO",
          icon: <Check size={11} />,
          className:
            "status-rewatched",
        };

      default:
        return {
          label:
            STATUS_LABELS[
              item.status as keyof typeof STATUS_LABELS
            ] ||
            String(
              item.status || ""
            ).toUpperCase(),
          icon: null,
          className:
            "status-default",
        };
    }
  }


  function toggleStatusMenuWithoutScroll(
    key: string | number
  ) {
    setOpenStatusMenu(
      (
        current
      ) =>
        current === key
          ? null
          : key
    );
  }


  function ActionButtons({
    item,
  }: {
    item: LibraryItem;
  }) {
    const busy =
      processing ===
      item.library_id;

    const menuOpen =
      openStatusMenu ===
      item.library_id;

    return (
      <>
        <div className="card-actions">

          <button
            type="button"
            className="card-action"
            title="Preview rápido"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();

              setPreviewItem(
                item
              );
            }}
          >
            <Eye size={17} />
          </button>

          <button
            type="button"
            className={
              item.favorite
                ? "card-action active"
                : "card-action"
            }
            title={
              item.favorite
                ? "Remover dos curtidos"
                : "Curtir"
            }
            disabled={busy}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();

              toggleFavorite(
                item
              );
            }}
          >
            <Heart
              size={17}
              fill={
                item.favorite
                  ? "currentColor"
                  : "none"
              }
            />
          </button>

          <button
            type="button"
            className="card-action active library-status-action"
            title="Alterar status"
            disabled={busy}
            onMouseDown={(event) => {
              event.preventDefault();
            }}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();

              toggleStatusMenuWithoutScroll(
                item.library_id
              );
            }}
          >
            {busy ? (
              <Loader2
                size={16}
                className="spin"
              />
            ) : (
              <>
                <Check size={15} />
                <ChevronDown size={11} />
              </>
            )}
          </button>

        </div>

        {menuOpen && (
          <div
            className="library-card-status-menu"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
          >
            <div className="library-card-status-menu-title">
              Alterar status
            </div>

            {Object.entries(
              STATUS_LABELS
            ).map(
              ([value, label]) => (
                <button
                  type="button"
                  key={value}
                  className={
                    item.status ===
                    value
                      ? "active"
                      : ""
                  }
                  disabled={busy}
                  onMouseDown={(
                    event
                  ) => {
                    event.preventDefault();
                  }}
                  onClick={() =>
                    changeStatus(
                      item,
                      value
                    )
                  }
                >
                  <span>
                    {label}
                  </span>

                  {item.status ===
                    value && (
                    <Check
                      size={14}
                    />
                  )}
                </button>
              )
            )}

            <div className="library-card-status-divider" />

            <button
              type="button"
              className="remove"
              disabled={busy}
              onMouseDown={(
                event
              ) => {
                event.preventDefault();
              }}
              onClick={() =>
                requestRemove(item)
              }
            >
              <Trash2 size={14} />
              Remover da biblioteca
            </button>
          </div>
        )}
      </>
    );
  }

  function Card({
    item,
  }: {
    item: LibraryItem;
  }) {
    const status = getStatus(item);

    const date =
      item.media_type === "tv"
        ? item.first_air_date
        : item.release_date;

    const year = date
      ? new Date(date).getFullYear()
      : null;

    return (
      <div className="card">
        <div className="poster">
          <Link
            href={`/title/${item.media_type}/${item.tmdb_id}`}
            className="poster-link"
          >
            <Poster path={item.poster_path} alt={item.title} sizes="(max-width:700px) 46vw, (max-width:1100px) 24vw, 170px" />
          </Link>

          <span className="badge">
            {item.media_type === "tv"
              ? "SÉRIE"
              : "FILME"}
          </span>

          <span
            className={`card-status ${status.className}`}
          >
            {status.icon}
            {status.label}
          </span>

          <ActionButtons
            item={item}
          />
        </div>

        <Link
          href={`/title/${item.media_type}/${item.tmdb_id}`}
          className="card-title"
        >
          {item.title}
        </Link>

        <div className="card-meta">
          {item.personal_rating !==
            null &&
          item.personal_rating !==
            undefined ? (
            <span className="rating">
              <Star
                size={12}
                fill="currentColor"
              />
              {Number(
                item.personal_rating
              ).toFixed(1)}
            </span>
          ) : (
            <span className="no-rating">
              Sem nota
            </span>
          )}

          {year && (
            <span className="muted">
              {year}
            </span>
          )}

          {item.favorite && (
            <span className="favorite-label">
              <Heart
                size={11}
                fill="currentColor"
              />
              Curtido
            </span>
          )}
        </div>
      </div>
    );
  }

  function ListItem({
    item,
  }: {
    item: LibraryItem;
  }) {
    const status = getStatus(item);

    const date =
      item.media_type === "tv"
        ? item.first_air_date
        : item.release_date;

    const year = date
      ? new Date(date).getFullYear()
      : null;

    return (
      <div className="library-list-item">
        <Link
          href={`/title/${item.media_type}/${item.tmdb_id}`}
          className="library-list-poster"
        >
          <Poster
  path={item.poster_path}
  alt={item.title}
  sizes="80px"
  tmdbSize="w342"
/>
        </Link>

        <div className="library-list-info">
          <div className="library-list-top">
            <div>
              <div className="library-list-type">
                {item.media_type ===
                "tv"
                  ? "SÉRIE"
                  : "FILME"}
              </div>

              <Link
                href={`/title/${item.media_type}/${item.tmdb_id}`}
                className="library-list-title"
              >
                {item.title}
              </Link>
            </div>

            <ActionButtons
              item={item}
            />
          </div>

          <div className="library-list-meta">
            <span
              className={`card-status ${status.className}`}
            >
              {status.icon}
              {status.label}
            </span>

            {year && (
              <span>
                {year}
              </span>
            )}

            {item.personal_rating !==
              null &&
              item.personal_rating !==
                undefined && (
                <span className="rating">
                  <Star
                    size={12}
                    fill="currentColor"
                  />
                  {Number(
                    item.personal_rating
                  ).toFixed(1)}
                </span>
              )}

            {item.tmdb_rating !==
              undefined &&
              item.tmdb_rating !==
                null && (
                <span className="muted">
                  TMDB{" "}
                  {Number(
                    item.tmdb_rating
                  ).toFixed(1)}
                </span>
              )}

            {item.favorite && (
              <span className="favorite-label">
                <Heart
                  size={11}
                  fill="currentColor"
                />
                Curtido
              </span>
            )}
          </div>

          {item.overview && (
            <p className="library-list-overview">
              {item.overview}
            </p>
          )}

          {item.genres &&
            item.genres.length > 0 && (
              <div className="library-list-genres">
                {item.genres
                  .slice(0, 4)
                  .map((itemGenre) => (
                    <span
                      key={itemGenre.id}
                      className="chip"
                    >
                      {itemGenre.name}
                    </span>
                  ))}
              </div>
            )}
        </div>
      </div>
    );
  }

  return (
    <div>
      {onViewModeChange && (
        <div
          style={{
            display: "flex",
            justifyContent:
              "flex-end",
            marginBottom: "14px",
          }}
        >
          <div className="view-switcher">
            <button
              className={
                viewMode === "grid"
                  ? "active"
                  : ""
              }
              title="Grade"
              onClick={() =>
                onViewModeChange(
                  "grid"
                )
              }
            >
              <Grid3X3 size={16} />
            </button>

            <button
              className={
                viewMode === "compact"
                  ? "active"
                  : ""
              }
              title="Grade compacta"
              onClick={() =>
                onViewModeChange(
                  "compact"
                )
              }
            >
              <LayoutGrid
                size={16}
              />
            </button>

            <button
              className={
                viewMode === "list"
                  ? "active"
                  : ""
              }
              title="Lista"
              onClick={() =>
                onViewModeChange(
                  "list"
                )
              }
            >
              <List size={16} />
            </button>
          </div>
        </div>
      )}

      {carousel && viewMode !== "list" ? (
        <CarouselRail className="library-carousel">
          {localItems.map((item) => (
            <Card key={item.library_id} item={item} />
          ))}
        </CarouselRail>
      ) : viewMode === "list" ? (
        <div className="library-list">
          {localItems.map((item) => (
            <ListItem
              key={item.library_id}
              item={item}
            />
          ))}
        </div>
      ) : (
        <div
          className={
            viewMode === "compact"
              ? "grid compact"
              : "grid"
          }
        >
          {localItems.map((item) => (
            <Card
              key={item.library_id}
              item={item}
            />
          ))}
        </div>
      )}

      {previewItem && (
        <div
          className="library-preview-backdrop"
          onClick={() =>
            setPreviewItem(
              null
            )
          }
        >
          <div
  className="library-preview-modal"
  role="dialog"
  aria-modal="true"
  aria-labelledby="library-preview-title"
  onClick={(event) =>
              event.stopPropagation()
            }
          >
            <button
              type="button"
              className="library-preview-close"
              onClick={() =>
                setPreviewItem(
                  null
                )
              }
              title="Fechar"
            
              aria-label="Fechar prévia"

            >
              ×
            </button>

            <div className="library-preview-poster">
              <img
  src={img(
    previewItem.poster_path
  )}
  alt={
    previewItem.title
  }
  loading="lazy"
/>
            </div>

            <div className="library-preview-content">
              <div className="eyebrow">
                {previewItem.media_type ===
                "tv"
                  ? "Série"
                  : "Filme"}
              </div>

              <h2 id="library-preview-title">
                {previewItem.title}
              </h2>

              <div className="library-preview-meta">
                {(
                  previewItem.media_type ===
                    "tv"
                    ? previewItem.first_air_date
                    : previewItem.release_date
                ) && (
                  <span>
                    {new Date(
                      previewItem.media_type ===
                        "tv"
                        ? previewItem.first_air_date!
                        : previewItem.release_date!
                    ).getFullYear()}
                  </span>
                )}

                {previewItem.tmdb_rating !==
                  null &&
                  previewItem.tmdb_rating !==
                    undefined && (
                  <span className="rating">
                    <Star
                      size={13}
                      fill="currentColor"
                    />
                    {Number(
                      previewItem.tmdb_rating
                    ).toFixed(1)}
                  </span>
                )}

                <span
                  className={`card-status ${
                    getStatus(
                      previewItem
                    ).className
                  }`}
                >
                  {
                    getStatus(
                      previewItem
                    ).icon
                  }
                  {
                    getStatus(
                      previewItem
                    ).label
                  }
                </span>
              </div>

              {previewItem.genres &&
                previewItem.genres.length >
                  0 && (
                <div className="library-preview-genres">
                  {previewItem.genres
                    .slice(0, 5)
                    .map(
                      (
                        itemGenre: any
                      ) => (
                        <span
                          key={
                            typeof itemGenre ===
                            "string"
                              ? itemGenre
                              : itemGenre.id ??
                                itemGenre.name
                          }
                        >
                          {typeof itemGenre === "string"
  ? (() => {
      try {
        const parsed =
          JSON.parse(itemGenre);

        return (
          parsed?.name ||
          itemGenre
        );
      } catch {
        return itemGenre;
      }
    })()
  : itemGenre.name}
                        </span>
                      )
                    )}
                </div>
              )}

              <PreviewWatchProviders
                details={previewDetails}
                loading={previewDetailsLoading}
              />

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
                          previewItem.library_id
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
                      previewItem.library_id
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

              <p className="library-preview-overview">
                {previewItem.overview ||
                  "Sinopse não disponível."}
              </p>

              <div className="library-preview-actions">
                <Link
                  href={`/title/${previewItem.media_type}/${previewItem.tmdb_id}`}
                  className="btn primary"
                >
                  Ver página completa
                </Link>

                <button
                  type="button"
                  className={
                    previewItem.favorite
                      ? "btn primary"
                      : "btn"
                  }
                  disabled={
                    processing ===
                    previewItem.library_id
                  }
                  onClick={() =>
                    toggleFavorite(
                      previewItem
                    )
                  }
                >
                  <Heart
                    size={16}
                    fill={
                      previewItem.favorite
                        ? "currentColor"
                        : "none"
                    }
                  />

                  {previewItem.favorite
                    ? "Curtido"
                    : "Curtir"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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
  aria-labelledby="library-remove-title"
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

              <h3 id="library-remove-title">
                Remover “{removeTarget.title}”?
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
                  removeTarget.library_id
                }
                onClick={
                  confirmRemove
                }
              >
                {processing ===
                removeTarget.library_id ? (
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
    </div>
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
