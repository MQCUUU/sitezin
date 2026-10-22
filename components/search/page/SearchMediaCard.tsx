import "@/styles/features/search-page.css";
import { MediaPosterActions } from "@/components/media/MediaPosterActions";
import { MediaPosterTags } from "@/components/media/MediaBadges";
import Link from "next/link";
import {
  Star,
} from "lucide-react";

import { MediaCard, MediaCardImage, MediaCardMeta } from "@/components/media";
import { Poster } from "@/components/Poster";
import { posterLoading } from "@/lib/poster-loading";

import { getTitle, type LibraryState, type SearchItem } from "./types";

export type SearchMediaCardProps = {
  item: SearchItem;
  libraryItem: LibraryState | undefined;
  isProcessing: boolean;
  isMenuOpen: boolean;
  onPreview: (item: SearchItem) => void;
  onAdd: (item: SearchItem) => void;
  onToggleStatusMenu: (key: string) => void;
  onToggleFavorite: (item: SearchItem) => void;
  onUpdateStatus: (item: SearchItem, status: string) => void;
  onRequestRemove: (item: SearchItem) => void;
  /** Fase 4: posição na grade (lib/poster-loading.ts). */
  position?: number;
};

/**
 * B3 §18: Search results now consume the shared MediaCard system instead
 * of a locally copy-pasted `<article className="card discover-card">`.
 * Layout/props mirror components/discover/DiscoverCard.tsx (same actions,
 * same status menu), adapted to Search's own data shape — a `SearchItem`
 * plus a separate `LibraryState` lookup, rather than Discover's fields
 * embedded directly on the item.
 */
export function SearchMediaCard({
  item,
  libraryItem,
  isProcessing,
  onPreview,
  onAdd,
  onToggleFavorite,
  onUpdateStatus,
  onRequestRemove,
  position,
}: SearchMediaCardProps) {
  const title = getTitle(item);
  const year = (item.release_date || item.first_air_date || "").slice(0, 4);

  return (
    <MediaCard className="discover-card">
      <MediaCardImage>
        <Link href={`/title/${item.media_type}/${item.id}`} className="poster-link">
          <Poster
            {...posterLoading(position)}
            path={item.poster_path ?? null}
            alt={title}
            sizes="(max-width:700px) 46vw, (max-width:1100px) 24vw, 170px"
          />
        </Link>

        <MediaPosterTags type={item.media_type} status={libraryItem ? libraryItem.status : null} />

        <MediaPosterActions
          title={title}
          year={year}
          inLibrary={Boolean(libraryItem)}
          status={libraryItem?.status}
          favorite={Boolean(libraryItem?.favorite)}
          busy={isProcessing}
          onPreview={() => onPreview(item)}
          onAdd={() => onAdd(item)}
          onChangeStatus={(status: string) => onUpdateStatus(item, status)}
          onToggleFavorite={() => onToggleFavorite(item)}
          onRemove={() => onRequestRemove(item)}
        />
      </MediaCardImage>

      <Link href={`/title/${item.media_type}/${item.id}`} className="card-title">
        {title}
      </Link>

      <MediaCardMeta>
        <span>{year || "—"}</span>

        {Number(item.vote_average || 0) > 0 && (
          <span className="rating" title="Média TMDB (não é a sua nota)">
            <Star size={12} fill="currentColor" aria-hidden="true" />
            {Number(item.vote_average).toFixed(1)}
            <span className="mc-visually-hidden"> de média no TMDB</span>
          </span>
        )}
      </MediaCardMeta>

      {item.reason && <p className="smart-search-reason">{item.reason}</p>}
    </MediaCard>
  );
}
