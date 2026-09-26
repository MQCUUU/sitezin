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

import { DISCOVER_STATUS_OPTIONS, getStatusLabel, type DiscoverItem } from "./types";

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
  isMenuOpen,
  onPreview,
  onAdd,
  onToggleStatusMenu,
  onToggleFavorite,
  onUpdateStatus,
  onRequestRemove,
}: DiscoverCardProps) {
  const title = item.title || item.name || "Sem título";
  const itemYear = (item.release_date || item.first_air_date || "").slice(0, 4);
  const key = `${item.media_type}-${item.id}`;

  return (
    <MediaCard className="discover-card">
      <MediaCardImage>
        <Link href={`/title/${item.media_type}/${item.id}`} className="poster-link">
          <Poster
            path={item.poster_path}
            alt={title}
            sizes="(max-width:700px) 46vw, (max-width:1100px) 24vw, 170px"
          />
        </Link>

        <span className="badge">{item.media_type === "tv" ? "SÉRIE" : "FILME"}</span>

        <MediaCardActions>
          <button
            type="button"
            className="card-action"
            title="Ver rápido"
            aria-label={`Ver detalhes rápidos de ${title}`}
            onClick={() => onPreview(item)}
          >
            <Eye size={17} />
          </button>

          {item.in_library ? (
            <button
              type="button"
              className="card-action active discover-library-menu-button"
              title="Alterar status da biblioteca"
              disabled={isProcessing}
              onMouseDown={(event) => {
                event.preventDefault();
              }}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onToggleStatusMenu(key);
              }}
            >
              {isProcessing ? (
                <Loader2 size={16} className="spin" />
              ) : (
                <>
                  <Check size={16} />
                  <ChevronDown size={12} />
                </>
              )}
            </button>
          ) : (
            <button
              type="button"
              className="card-action add"
              title="Adicionar como Quero assistir"
              disabled={isProcessing}
              onClick={() => onAdd(item)}
            >
              {isProcessing ? (
                <Loader2 size={17} className="spin" />
              ) : (
                <Plus size={18} />
              )}
            </button>
          )}

          {item.in_library && (
            <button
              type="button"
              className={
                "card-action discover-favorite-button " + (item.favorite ? "active" : "")
              }
              title={item.favorite ? "Remover dos curtidos" : "Curtir título"}
              disabled={isProcessing}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onToggleFavorite(item);
              }}
            >
              {isProcessing ? (
                <Loader2 size={16} className="spin" />
              ) : (
                <Heart size={16} fill={item.favorite ? "currentColor" : "none"} />
              )}
            </button>
          )}
        </MediaCardActions>

        {item.in_library && (
          <span className="discover-status-badge">{getStatusLabel(item.library_status)}</span>
        )}
      </MediaCardImage>

      {item.in_library && isMenuOpen && (
        <div
          className="discover-library-status-menu"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="discover-library-status-menu-head">
            <span>Status</span>
            <strong>{getStatusLabel(item.library_status)}</strong>
          </div>

          <div className="discover-library-status-options">
            {DISCOVER_STATUS_OPTIONS.map(([value, label]) => (
              <button
                type="button"
                key={value}
                className={item.library_status === value ? "active" : ""}
                disabled={isProcessing}
                onClick={() => onUpdateStatus(item, value)}
              >
                <span>{label}</span>
                {item.library_status === value && <Check size={14} />}
              </button>
            ))}
          </div>

          <div className="discover-library-status-divider" />

          <button
            type="button"
            className="discover-library-remove"
            disabled={isProcessing}
            onClick={() => onRequestRemove(item)}
          >
            <Trash2 size={15} />
            Remover da biblioteca
          </button>
        </div>
      )}

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

        {item.in_library && (
          <span className="in-library">
            <Check size={12} />
            {getStatusLabel(item.library_status)}
          </span>
        )}
      </MediaCardMeta>
    </MediaCard>
  );
}
