"use client";

/*
 * Botões do pôster (olhinho = ver rápido, seta = status/adicionar, coração =
 * curtir) em QUALQUER pôster do site, sem a página precisar ligar nada.
 *
 * - Estado do título: lib/library/entry-store (uma consulta em lote por tela).
 * - Ações: as mesmas funções protegidas da Biblioteca (lib/library/actions): o
 *   "adicionar" nunca sobrescreve um item existente (proteção P0).
 * - Visitante: "Entre para salvar" com a ação guardada (useLibraryAuth).
 * - Ver rápido: um diálogo global (PosterPreviewHost, montado em AppProviders).
 *
 * O pai precisa ter `position: relative` (os botões ficam sobre o pôster, como
 * em Descobrir/Biblioteca). Use dentro do mesmo bloco do <Poster>.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { useConfirm } from "@/components/ConfirmProvider";
import { MediaPosterActions } from "@/components/media/MediaPosterActions";
import { MediaPosterTags } from "@/components/media/MediaBadges";
import { MediaPreviewDialog } from "@/components/media/preview/MediaPreviewDialog";
import { WatchProviderList } from "@/components/media/preview/WatchProviderList";
import { fromLooseMediaItem, type LooseMediaItem } from "@/components/media/preview/adapters";
import { normalizeWatchProviders } from "@/components/media/providers";
import { useToast } from "@/components/ToastProvider";
import { useLibraryAuth } from "@/hooks/useLibraryAuth";
import { apiFetch } from "@/lib/api-client";
import { intentForMedia, type LibraryIntent } from "@/lib/auth/pending-action";
import { removeFromLibrary, runLibraryAction } from "@/lib/library/actions";
import { setLibraryEntry, setLibraryGuest, useLibraryEntry, type MediaType } from "@/lib/library/entry-store";

export type PosterMedia = {
  tmdbId: number;
  mediaType: MediaType;
  title: string;
  year?: string | number | null;
  posterPath?: string | null;
  backdropPath?: string | null;
  overview?: string | null;
  voteAverage?: number | null;
  releaseDate?: string | null;
};

/* ------------------------------------------------------------ ver rápido global */

type PreviewContextValue = { open: (media: PosterMedia) => void };
const PreviewContext = createContext<PreviewContextValue | null>(null);

export function PosterPreviewHost({ children }: { children: ReactNode }) {
  const [media, setMedia] = useState<PosterMedia | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [details, setDetails] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const entry = useLibraryEntry(media?.mediaType ?? "movie", media?.tmdbId ?? 0);

  useEffect(() => {
    if (!media) return;
    let alive = true;
    apiFetch(`/api/tmdb/${media.mediaType}/${media.tmdbId}`)
      .then((data) => alive && setDetails(data))
      .catch(() => alive && setDetails(null))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [media]);

  const open = useCallback((next: PosterMedia) => {
    setDetails(null);
    setLoading(true);
    setMedia(next);
  }, []);
  const value = useMemo(() => ({ open }), [open]);

  const item: LooseMediaItem | null = media
    ? {
        id: media.tmdbId,
        media_type: media.mediaType,
        title: media.title,
        poster_path: media.posterPath ?? null,
        backdrop_path: media.backdropPath ?? null,
        overview: media.overview ?? undefined,
        vote_average: media.voteAverage ?? undefined,
        release_date: media.releaseDate ?? undefined,
      }
    : null;

  return (
    <PreviewContext.Provider value={value}>
      {children}
      {item && media ? (
        <MediaPreviewDialog
          open
          onClose={() => setMedia(null)}
          data={fromLooseMediaItem(item, details, entry ? { library_id: entry.library_id, status: entry.status } : null, media.mediaType, true)}
          providers={<WatchProviderList data={normalizeWatchProviders(details?.watch_providers, "BR")} loading={loading} />}
        />
      ) : null}
    </PreviewContext.Provider>
  );
}

/* ------------------------------------------------------------ botões do pôster */

export function ConnectedPosterActions({ media, tags = false, inline = false }: { media: PosterMedia; tags?: boolean; inline?: boolean }) {
  const entry = useLibraryEntry(media.mediaType, media.tmdbId);
  const libraryAuth = useLibraryAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const preview = useContext(PreviewContext);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (libraryAuth.state === "guest" || libraryAuth.state === "authenticated") setLibraryGuest(libraryAuth.state === "guest");
  }, [libraryAuth.state]);

  const asItem = { id: media.tmdbId, media_type: media.mediaType, title: media.title };

  async function run(intent: LibraryIntent | undefined, fallback: string) {
    if (!intent || busy) return;
    if (!libraryAuth.requireUser(intent)) return;
    setBusy(true);
    try {
      const { item } = await runLibraryAction(intent);
      setLibraryEntry(media.mediaType, media.tmdbId, { library_id: String(item.id), status: String(item.status), favorite: Boolean(item.favorite) });
    } catch (error) {
      libraryAuth.handleError(error, intent, fallback);
    } finally {
      setBusy(false);
    }
  }

  async function toggleFavorite() {
    if (entry?.favorite) {
      if (busy) return;
      setBusy(true);
      try {
        await apiFetch(`/api/library/${entry.library_id}`, { method: "PATCH", json: { favorite: false } });
        setLibraryEntry(media.mediaType, media.tmdbId, { ...entry, favorite: false });
      } catch (error) {
        libraryAuth.handleError(error, undefined, "Não foi possível descurtir");
      } finally {
        setBusy(false);
      }
      return;
    }
    await run(intentForMedia(asItem, "favorite"), "Não foi possível curtir");
  }

  async function remove() {
    if (!entry || busy) return;
    const ok = await confirm({ title: `Remover “${media.title}”?`, description: "O título sai da sua Biblioteca. Seu histórico de visualizações continua no Diário.", confirmLabel: "Remover" });
    if (!ok) return;
    setBusy(true);
    try {
      await removeFromLibrary(entry.library_id);
      setLibraryEntry(media.mediaType, media.tmdbId, null);
      toast.success("Removido da Biblioteca");
    } catch (error) {
      libraryAuth.handleError(error, undefined, "Não foi possível remover");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {tags ? <MediaPosterTags type={media.mediaType} status={entry ? entry.status : null} /> : null}
      <MediaPosterActions
        title={media.title}
        year={media.year}
        inLibrary={Boolean(entry)}
        status={entry?.status ?? null}
        favorite={Boolean(entry?.favorite)}
        busy={busy || entry === undefined}
        inline={inline}
        onPreview={preview ? () => preview.open(media) : undefined}
        onAdd={() => run(intentForMedia(asItem, "add"), "Não foi possível adicionar")}
        onChangeStatus={(status) => run(intentForMedia(asItem, "status", status), "Não foi possível mudar o status")}
        onToggleFavorite={toggleFavorite}
        onRemove={remove}
      />
    </>
  );
}
