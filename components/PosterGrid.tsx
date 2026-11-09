"use client";

import { useConfirm } from "@/components/ConfirmProvider";
import "@/styles/features/library-page.css";
import { removeFromLibrary } from "@/lib/library/actions";
import { SeriesProgressPanel } from "@/components/library/SeriesProgress";
import { Heart, Grid3X3, LayoutGrid, List } from "lucide-react";
import type { LibraryItem } from "@/lib/types";
import { STATUS_LABELS } from "@/lib/types";
import { useToast } from "@/components/ToastProvider";
import { useLibraryAuth } from "@/hooks/useLibraryAuth";
import { apiFetch } from "@/lib/api-client";
import { CarouselRail } from "@/components/CarouselRail";
import { useEffect, useState } from "react";
import { MediaPreviewDialog } from "@/components/media/preview/MediaPreviewDialog";
import { WatchProviderList } from "@/components/media/preview/WatchProviderList";
import { fromLibraryItem } from "@/components/media/preview/adapters";
import { normalizeWatchProviders } from "@/components/media/providers";
import { LIBRARY_ACTION_COPY, removalConfirmOptions } from "@/lib/library/remove";
import { Button } from "@/components/ui/Button";
import { Card, ListItem } from "@/components/library/PosterGridItems";
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
  // Fase 6: 401 numa ação vira "Sua sessão expirou" (padrão da Fase 1), nunca "Não autenticado".
  const { handleError } = useLibraryAuth();

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

  const confirm = useConfirm();

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

        const result = await apiFetch(`/api/tmdb/${previewItem.media_type}/${previewItem.tmdb_id}`);

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

      await apiFetch(`/api/library/${item.library_id}`, { method: "PATCH", json: {
                favorite:
                  nextValue,
              } });

      toast.success(
        nextValue
          ? `${item.title} foi curtido`
          : `${item.title} saiu dos curtidos`,
        {
          actionLabel:
            "Desfazer",

          onAction:
            async () => {
              await apiFetch(`/api/library/${item.library_id}`, { method: "PATCH", json: {
                        favorite:
                          oldValue,
                      } });

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

      handleError(error, undefined, "Erro ao atualizar curtida");
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

      await apiFetch(`/api/library/${item.library_id}`, { method: "PATCH", json: {
                status:
                  nextStatus,
              } });

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
              await apiFetch(`/api/library/${item.library_id}`, { method: "PATCH", json: {
                        status:
                          oldStatus,
                      } });

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

      handleError(error, undefined, "Erro ao alterar status");
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

      await apiFetch(`/api/library/${item.library_id}`, { method: "PATCH", json: {
                personal_rating:
                  rating,
              } });

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
              await apiFetch(`/api/library/${item.library_id}`, { method: "PATCH", json: {
                        personal_rating:
                          oldRating,
                      } });

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

      handleError(error, undefined, "Erro ao alterar sua nota");
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

      await removeFromLibrary(item.library_id);

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

      toast.success(
        `${item.title} removido da biblioteca`,
        {
          // Readicionar é uma NOVA entrada (tags, notas por categoria e histórico não voltam) — não é "desfazer".
          description:
            LIBRARY_ACTION_COPY.removedDescription,

          actionLabel:
            LIBRARY_ACTION_COPY.readdLabel,

          duration:
            8000,

          onAction:
            async () => {
              const restored = await apiFetch("/api/library", { method: "POST", json: {
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
                      } });

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

              toast.info(
                LIBRARY_ACTION_COPY.readded,
                { description: LIBRARY_ACTION_COPY.readdedDescription }
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

      handleError(error, undefined, "Erro ao remover");
    } finally {
      setProcessing(
        null
      );
    }
  }

  async function requestRemove(
    item: LibraryItem
  ) {
    setOpenStatusMenu(
      null
    );

    const ok = await confirm(removalConfirmOptions(item.title));

    if (!ok) return;

    performRemove(
      item
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
          {localItems.map((item, position) => (
            <Card
              key={item.library_id}
              item={item}
              position={position}
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
        personal={previewItem?.library_progress ? <SeriesProgressPanel progress={previewItem.library_progress} /> : null}
        providers={<WatchProviderList data={normalizeWatchProviders(previewDetails?.watch_providers, "BR")} loading={previewDetailsLoading} />}
        extraActions={
          previewItem && (
            <Button
              type="button"
              variant={previewItem.favorite ? "primary" : "secondary"}
              className="mc-preview-favorite-btn"
              onClick={() => toggleFavorite(previewItem)}
              disabled={processing === previewItem.library_id}
            >
              <Heart size={16} fill={previewItem.favorite ? "currentColor" : "none"} />
              {previewItem.favorite ? "Curtido" : "Curtir"}
            </Button>
          )
        }
      />

    </div>
  );
}

