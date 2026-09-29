"use client";

import { TvNextEpisode } from "@/components/TvNextEpisode";
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
  ListPlus,
  Star,
} from "lucide-react";

import { img } from "@/lib/tmdb";
import type { LibraryItem } from "@/lib/types";
import { STATUS_LABELS } from "@/lib/types";
import { useToast } from "@/components/ToastProvider";

import { Poster } from "@/components/Poster";
import { CarouselRail } from "@/components/CarouselRail";
import {
  MediaCard,
  MediaCardImage,
  MediaCardMeta,
  MediaCardActions,
} from "@/components/media";

import { useEffect, useRef, useState } from "react";

import { MediaPreviewDialog } from "@/components/media/preview/MediaPreviewDialog";
import { WatchProviderList } from "@/components/media/preview/WatchProviderList";
import { fromLibraryItem } from "@/components/media/preview/adapters";
import { normalizeWatchProviders } from "@/components/media/providers";

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
  onAddToList,
}: {
  items: LibraryItem[];
  onChanged?: () => void;
  viewMode?: ViewMode;
  onViewModeChange?: (
    mode: ViewMode
  ) => void;
  carousel?: boolean;
  /**
   * Opcional: quando presente, o menu de status ganha "Adicionar à
   * lista...". Sem ele (Discover/Favorites/Ranking/Search), o item de
   * menu simplesmente não aparece — nenhuma dessas páginas precisa
   * saber que listas existem.
   */
  onAddToList?: (item: LibraryItem) => void;
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

/*
 * Escape/scroll-lock for previewItem now come from MediaPreviewDialog's
 * underlying Dialog (C2.4) — this effect covers removeTarget only.
 */
useEffect(() => {
  if (!removeTarget) {
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
}, [removeTarget]);

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

  /*
   * Card/ActionButtons/ListItem are module-level components (below) so
   * their DOM nodes survive PosterGrid re-renders — a nested function
   * component gets a new identity every render, forcing React to unmount
   * and remount it (and its focused trigger button) even though its `key`
   * doesn't change. That silently broke MediaPreviewDialog's focus-restore
   * on close, since the button it needed to refocus no longer existed by
   * the time the dialog closed. Bundling the action callbacks here keeps
   * the three render call sites below simple.
   */
  const cardActionProps = {
    processing,
    openStatusMenu,
    onPreview: setPreviewItem,
    onToggleFavorite: toggleFavorite,
    onToggleStatusMenu: toggleStatusMenuWithoutScroll,
    onChangeStatus: changeStatus,
    onRequestRemove: requestRemove,
    onAddToList,
  };

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
          <div className="view-switcher" role="group" aria-label="Modo de visualização">
            <button
              type="button"
              className={
                viewMode === "grid"
                  ? "active"
                  : ""
              }
              title="Grade"
              aria-label="Grade"
              aria-pressed={viewMode === "grid"}
              onClick={() =>
                onViewModeChange(
                  "grid"
                )
              }
            >
              <Grid3X3 size={16} />
            </button>

            <button
              type="button"
              className={
                viewMode === "compact"
                  ? "active"
                  : ""
              }
              title="Grade compacta"
              aria-label="Grade compacta"
              aria-pressed={viewMode === "compact"}
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
              type="button"
              className={
                viewMode === "list"
                  ? "active"
                  : ""
              }
              title="Lista"
              aria-label="Lista"
              aria-pressed={viewMode === "list"}
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
            <Card key={item.library_id} item={item} {...cardActionProps} />
          ))}
        </CarouselRail>
      ) : viewMode === "list" ? (
        <div className="library-list">
          {localItems.map((item) => (
            <ListItem
              key={item.library_id}
              item={item}
              {...cardActionProps}
            />
          ))}
        </div>
      ) : (
        <div
          className={
            viewMode === "compact"
              ? "grid compact mc-media-grid"
              : "grid mc-media-grid"
          }
        >
          {localItems.map((item) => (
            <Card
              key={item.library_id}
              item={item}
              {...cardActionProps}
            />
          ))}
        </div>
      )}

      <MediaPreviewDialog
        open={Boolean(previewItem)}
        onClose={() => setPreviewItem(null)}
        data={previewItem ? fromLibraryItem(previewItem) : null}
        actions={{
          onRating: (_, rating) => previewItem && updatePersonalRating(previewItem, rating),
          disabled: previewItem ? processing === previewItem.library_id : false,
        }}
        providers={<WatchProviderList data={normalizeWatchProviders(previewDetails?.watch_providers, "BR")} loading={previewDetailsLoading} />}
        extraActions={
          previewItem && (
            <button
              type="button"
              className={
                previewItem.favorite
                  ? "btn primary mc-preview-favorite-btn"
                  : "btn mc-preview-favorite-btn"
              }
              onClick={() => toggleFavorite(previewItem)}
              disabled={processing === previewItem.library_id}
            >
              <Heart size={16} fill={previewItem.favorite ? "currentColor" : "none"} />
              {previewItem.favorite ? "Curtido" : "Curtir"}
            </button>
          )
        }
      />

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

/*
 * D1 — STATUS_LABELS (lib/types.ts) é a ÚNICA fonte do texto dos
 * status. Antes, este badge tinha seu próprio texto hardcoded em
 * maiúsculas ("ASSISTINDO" etc.), duplicado e independente de
 * STATUS_LABELS — mudar um não mudava o outro.
 */
function statusLabel(status: LibraryItem["status"]) {
  const label =
    STATUS_LABELS[status as keyof typeof STATUS_LABELS] || String(status || "");
  return label.toUpperCase();
}

function getStatus(item: LibraryItem) {
  switch (item.status) {
    case "watching":
      return {
        label: statusLabel(item.status),
        icon: <Play size={11} fill="currentColor" />,
        className: "status-watching",
      };

    case "watched":
      return {
        label: statusLabel(item.status),
        icon: <Check size={11} />,
        className: "status-watched",
      };

    case "want":
      return {
        label: statusLabel(item.status),
        icon: <Clock size={11} />,
        className: "status-want",
      };

    case "dropped":
      return {
        label: statusLabel(item.status),
        icon: <Trash2 size={11} />,
        className: "status-dropped",
      };

    case "rewatching":
      return {
        label: statusLabel(item.status),
        icon: <Play size={11} fill="currentColor" />,
        className: "status-rewatching",
      };

    case "rewatched":
      return {
        label: statusLabel(item.status),
        icon: <Check size={11} />,
        className: "status-rewatched",
      };

    default:
      return {
        label: statusLabel(item.status),
        icon: null,
        className: "status-default",
      };
  }
}

type CardActionProps = {
  processing: string | number | null;
  openStatusMenu: string | number | null;
  onPreview: (item: LibraryItem) => void;
  onToggleFavorite: (item: LibraryItem) => void;
  onToggleStatusMenu: (key: string | number) => void;
  onChangeStatus: (item: LibraryItem, status: string) => void;
  onRequestRemove: (item: LibraryItem) => void;
  onAddToList?: (item: LibraryItem) => void;
};

function ActionButtons({
  item,
  processing,
  openStatusMenu,
  onPreview,
  onToggleFavorite,
  onToggleStatusMenu,
  onChangeStatus,
  onRequestRemove,
  onAddToList,
}: CardActionProps & { item: LibraryItem }) {
  const busy = processing === item.library_id;
  const menuOpen = openStatusMenu === item.library_id;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  /*
   * H1 — o menu já fechava com Escape e já era navegável por Tab, mas
   * não movia o foco para dentro ao abrir nem o devolvia ao botão de
   * disparo ao fechar (H0, achado). `ActionButtons` continua sendo um
   * componente module-level (ver comentário acima de `cardActionProps`
   * — identidade estável entre renders do pai); os hooks abaixo vivem
   * dentro dele mesmo, sem afetar essa garantia.
   */
  useEffect(() => {
    if (!menuOpen) return;
    const firstItem = menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]');
    firstItem?.focus();
  }, [menuOpen]);

  function closeAndRestoreFocus() {
    onToggleStatusMenu(item.library_id);
    triggerRef.current?.focus();
  }

  function moveFocus(direction: 1 | -1) {
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') || []);
    if (!items.length) return;
    const currentIndex = items.indexOf(document.activeElement as HTMLElement);
    const nextIndex = (currentIndex + direction + items.length) % items.length;
    items[nextIndex]?.focus();
  }

  return (
    <>
      <MediaCardActions>
        <button
          type="button"
          className="card-action"
          title="Preview rápido"
          aria-label="Preview rápido"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onPreview(item);
          }}
        >
          <Eye size={17} />
        </button>

        <button
          type="button"
          className={item.favorite ? "card-action active" : "card-action"}
          title={item.favorite ? "Remover dos curtidos" : "Curtir"}
          aria-label={item.favorite ? "Remover dos curtidos" : "Curtir"}
          aria-pressed={item.favorite}
          disabled={busy}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onToggleFavorite(item);
          }}
        >
          <Heart size={17} fill={item.favorite ? "currentColor" : "none"} />
        </button>

        <button
          ref={triggerRef}
          type="button"
          className="card-action active library-status-action"
          title="Alterar status"
          aria-label="Alterar status"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          disabled={busy}
          onMouseDown={(event) => {
            event.preventDefault();
          }}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onToggleStatusMenu(item.library_id);
          }}
        >
          {busy ? (
            <Loader2 size={16} className="spin" />
          ) : (
            <>
              <Check size={15} />
              <ChevronDown size={11} />
            </>
          )}
        </button>
      </MediaCardActions>

      {menuOpen && (
        <div
          ref={menuRef}
          className="library-card-status-menu"
          role="menu"
          aria-label="Alterar status"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              closeAndRestoreFocus();
            } else if (event.key === "ArrowDown") {
              event.preventDefault();
              moveFocus(1);
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              moveFocus(-1);
            }
          }}
        >
          <div className="library-card-status-menu-title">Alterar status</div>

          {Object.entries(STATUS_LABELS).map(([value, label]) => (
            <button
              type="button"
              key={value}
              role="menuitem"
              className={item.status === value ? "active" : ""}
              disabled={busy}
              onMouseDown={(event) => {
                event.preventDefault();
              }}
              onClick={() => onChangeStatus(item, value)}
            >
              <span>{label}</span>
              {item.status === value && <Check size={14} />}
            </button>
          ))}

          <div className="library-card-status-divider" />

          {onAddToList && (
            <button
              type="button"
              role="menuitem"
              onMouseDown={(event) => {
                event.preventDefault();
              }}
              onClick={() => onAddToList(item)}
            >
              <span>
                <ListPlus size={14} style={{ marginRight: 6, verticalAlign: "-2px" }} />
                Adicionar à lista...
              </span>
            </button>
          )}

          <button
            type="button"
            role="menuitem"
            className="remove"
            disabled={busy}
            onMouseDown={(event) => {
              event.preventDefault();
            }}
            onClick={() => onRequestRemove(item)}
          >
            <Trash2 size={14} />
            Remover da biblioteca
          </button>
        </div>
      )}
    </>
  );
}

function Card({ item, ...actionProps }: CardActionProps & { item: LibraryItem }) {
  const status = getStatus(item);
  const date = item.media_type === "tv" ? item.first_air_date : item.release_date;
  const year = date ? new Date(date).getFullYear() : null;

  return (
    <MediaCard>
      <MediaCardImage>
        <Link href={`/title/${item.media_type}/${item.tmdb_id}`} className="poster-link">
          <Poster path={item.poster_path} alt={item.title} sizes="(max-width:700px) 46vw, (max-width:1100px) 24vw, 170px" />
        </Link>

        <span className="badge">{item.media_type === "tv" ? "SÉRIE" : "FILME"}</span>

        <span className={`card-status mc-media-card-status ${status.className}`}>
          {status.icon}
          {status.label}
        </span>

        <ActionButtons item={item} {...actionProps} />
      </MediaCardImage>

      <Link href={`/title/${item.media_type}/${item.tmdb_id}`} className="card-title">
        {item.title}
      </Link>

      <MediaCardMeta>
        {item.personal_rating !== null && item.personal_rating !== undefined ? (
          <span className="rating">
            <Star size={12} fill="currentColor" />
            {Number(item.personal_rating).toFixed(1)}
          </span>
        ) : (
          <span className="no-rating">Sem nota</span>
        )}

        {year && <span className="muted">{year}</span>}

        {item.favorite && (
          <span className="favorite-label">
            <Heart size={11} fill="currentColor" />
            Curtido
          </span>
        )}
      </MediaCardMeta>
      <TvNextEpisode progress={item.progress} />
    </MediaCard>
  );
}

function ListItem({ item, ...actionProps }: CardActionProps & { item: LibraryItem }) {
  const status = getStatus(item);
  const date = item.media_type === "tv" ? item.first_air_date : item.release_date;
  const year = date ? new Date(date).getFullYear() : null;

  return (
    <div className="library-list-item">
      <Link href={`/title/${item.media_type}/${item.tmdb_id}`} className="library-list-poster">
        <Poster path={item.poster_path} alt={item.title} sizes="80px" tmdbSize="w342" />
      </Link>

      <div className="library-list-info">
        <div className="library-list-top">
          <div>
            <div className="library-list-type">{item.media_type === "tv" ? "SÉRIE" : "FILME"}</div>

            <Link href={`/title/${item.media_type}/${item.tmdb_id}`} className="library-list-title">
              {item.title}
            </Link>
          </div>

          <ActionButtons item={item} {...actionProps} />
        </div>

        <div className="library-list-meta">
          <span className={`card-status ${status.className}`}>
            {status.icon}
            {status.label}
          </span>

          {year && <span>{year}</span>}

          {item.personal_rating !== null && item.personal_rating !== undefined && (
            <span className="rating">
              <Star size={12} fill="currentColor" />
              {Number(item.personal_rating).toFixed(1)}
            </span>
          )}

          {item.tmdb_rating !== undefined && item.tmdb_rating !== null && (
            <span className="muted">TMDB {Number(item.tmdb_rating).toFixed(1)}</span>
          )}

          {item.favorite && (
            <span className="favorite-label">
              <Heart size={11} fill="currentColor" />
              Curtido
            </span>
          )}
        </div>

        {item.overview && <p className="library-list-overview">{item.overview}</p>}

        {item.genres && item.genres.length > 0 && (
          <div className="library-list-genres">
            {item.genres.slice(0, 4).map((itemGenre) => (
              <span key={itemGenre.id} className="chip">
                {itemGenre.name}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
