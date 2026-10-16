import { MediaPosterActions } from "@/components/media/MediaPosterActions";
import { MediaPosterTags } from "@/components/media/MediaBadges";
import Link from "next/link";
import {
  Check,
  ChevronDown,
  Eye,
  Heart,
  Loader2,
  Plus,
  Star,
  Trash2,
} from "lucide-react";

import { MediaCard, MediaCardActions, MediaCardImage, MediaCardMeta } from "@/components/media";
import { Poster } from "@/components/Poster";

import { STATUS_OPTIONS, getStatusLabel, getTitle, type LibraryState, type SearchItem } from "./types";

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
  isMenuOpen,
  onPreview,
  onAdd,
  onToggleStatusMenu,
  onToggleFavorite,
  onUpdateStatus,
  onRequestRemove,
}: SearchMediaCardProps) {
  const title = getTitle(item);
  const year = (item.release_date || item.first_air_date || "").slice(0, 4);
  const key = `${item.media_type}-${item.id}`;

  return (
    <MediaCard className="discover-card">
      <MediaCardImage>
        <Link href={`/title/${item.media_type}/${item.id}`} className="poster-link">
          <Poster
            path={item.poster_path ?? null}
            alt={title}
            sizes="(max-width:700px) 46vw, (max-width:1100px) 24vw, 170px"
          />
        </Link>

        <MediaPosterTags type={item.media_type} status={libraryItem ? libraryItem.status : null} />

        <MediaPosterActions
          title={title}
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
