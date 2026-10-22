import { MediaPosterActions } from "@/components/media/MediaPosterActions";
import { MediaPosterTags } from "@/components/media/MediaBadges";
import Link from "next/link";
import {
  Star,
} from "lucide-react";

import { MediaCard, MediaCardImage, MediaCardMeta } from "@/components/media";
import { Poster } from "@/components/Poster";
import { posterLoading } from "@/lib/poster-loading";

import { type DiscoverItem } from "./types";

export type DiscoverCardProps = {
  item: DiscoverItem;
  isProcessing: boolean;
  isMenuOpen: boolean;
  onPreview: (item: DiscoverItem) => void;
  onAdd: (item: DiscoverItem) => void;
  onToggleStatusMenu: (key: string) => void;
  onToggleFavorite: (item: DiscoverItem) => void;
  onUpdateStatus: (item: DiscoverItem, status: string) => void;
  onRequestRemove: (item: DiscoverItem) => void;
  /** Fase 4: posição na grade (1ª linha carrega antes — lib/poster-loading.ts). */
  position?: number;
};

/**
 * One Discover result. Pure presentation — every action here just calls a
 * prop the container (app/discover/page.tsx) supplies; state (`processing`,
 * `openLibraryMenu`, the actual mutation requests) all stays up there,
 * unchanged from B1.
 */
export function DiscoverCard({
  item,
  isProcessing,
  onPreview,
  onAdd,
  onToggleFavorite,
  onUpdateStatus,
  onRequestRemove,
  position,
}: DiscoverCardProps) {
  const title = item.title || item.name || "Sem título";
  const itemYear = (item.release_date || item.first_air_date || "").slice(0, 4);

  return (
    <MediaCard className="discover-card">
      <MediaCardImage>
        <Link href={`/title/${item.media_type}/${item.id}`} className="poster-link">
          <Poster
            {...posterLoading(position)}
            path={item.poster_path}
            alt={title}
            sizes="(max-width:700px) 46vw, (max-width:1100px) 24vw, 170px"
          />
        </Link>

        <MediaPosterTags type={item.media_type} status={item.in_library ? item.library_status : null} />

        <MediaPosterActions
          title={title}
          year={itemYear}
          inLibrary={Boolean(item.in_library)}
          status={item.library_status}
          favorite={Boolean(item.favorite)}
          busy={isProcessing}
          onPreview={() => onPreview(item)}
          onAdd={() => onAdd(item)}
          onChangeStatus={(status) => onUpdateStatus(item, status)}
          onToggleFavorite={() => onToggleFavorite(item)}
          onRemove={() => onRequestRemove(item)}
        />
      </MediaCardImage>

      <Link href={`/title/${item.media_type}/${item.id}`} className="card-title">
        {title}
      </Link>

      <MediaCardMeta>
        <span>{itemYear || "—"}</span>

        {item.vote_average > 0 && (
          <span className="rating">
            <Star size={12} fill="currentColor" />
            {Number(item.vote_average).toFixed(1)}
          </span>
        )}

      </MediaCardMeta>
    </MediaCard>
  );
}
