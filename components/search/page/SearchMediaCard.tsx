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

        <span className="badge">{item.media_type === "tv" ? "SÉRIE" : "FILME"}</span>

        <MediaCardActions>
          <button
            type="button"
            className="card-action"
            title="Ver rápido"
            aria-label={`Ver detalhes rápidos de ${title}`}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onPreview(item);
            }}
          >
            <Eye size={17} />
          </button>

          {libraryItem ? (
            <button
              type="button"
              className="card-action active discover-library-menu-button"
              title="Alterar status"
              disabled={isProcessing}
              onMouseDown={(event) => event.preventDefault()}
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
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onAdd(item);
              }}
            >
              {isProcessing ? (
                <Loader2 size={17} className="spin" />
              ) : (
                <Plus size={18} />
              )}
            </button>
          )}

          {libraryItem && (
            <button
              type="button"
              className={
                "card-action discover-favorite-button " + (libraryItem.favorite ? "active" : "")
              }
              title={libraryItem.favorite ? "Remover dos curtidos" : "Curtir título"}
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
                <Heart size={16} fill={libraryItem.favorite ? "currentColor" : "none"} />
              )}
            </button>
          )}
        </MediaCardActions>

        {libraryItem && (
          <span className="discover-status-badge">{getStatusLabel(libraryItem.status)}</span>
        )}
      </MediaCardImage>

      {libraryItem && isMenuOpen && (
        <div
          className="discover-library-status-menu"
          onMouseDown={(event) => event.stopPropagation()}
        >
          <div className="discover-library-status-menu-head">
            <span>Status</span>
            <strong>{getStatusLabel(libraryItem.status)}</strong>
          </div>

          <div className="discover-library-status-options">
            {STATUS_OPTIONS.map(([value, label]) => (
              <button
                type="button"
                key={value}
                className={libraryItem.status === value ? "active" : ""}
                disabled={isProcessing}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => onUpdateStatus(item, value)}
              >
                <span>{label}</span>
                {libraryItem.status === value && <Check size={14} />}
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
        <span>{year || "—"}</span>

        {Number(item.vote_average || 0) > 0 && (
          <span className="rating">
            <Star size={12} fill="currentColor" />
            {Number(item.vote_average).toFixed(1)}
          </span>
        )}

        {libraryItem && (
          <span className="in-library">
            <Check size={12} />
            {getStatusLabel(libraryItem.status)}
          </span>
        )}
      </MediaCardMeta>

      {item.reason && <p className="smart-search-reason">{item.reason}</p>}
    </MediaCard>
  );
}
