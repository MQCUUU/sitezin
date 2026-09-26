import Link from "next/link";
import { Check, Loader2, Plus, Star, X } from "lucide-react";

import { WatchProviderList } from "@/components/media/preview/WatchProviderList";
import { img } from "@/lib/tmdb";

import { getStatusLabel, getTitle, type LibraryState, type SearchItem } from "./types";

const RATING_VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export type SearchPagePreviewModalProps = {
  item: SearchItem;
  details: any;
  detailsLoading: boolean;
  libraryItem: LibraryState | undefined;
  isProcessing: boolean;
  onClose: () => void;
  onAdd: (item: SearchItem) => void;
  onRating: (item: SearchItem, rating: number | null) => void;
};

/**
 * Same bespoke quick-look chrome as before (B3 §22 — the Quick Peek
 * redesign itself is out of scope, reserved for the Media Experience
 * phase). Only the watch-providers block is the shared component.
 */
export function SearchPagePreviewModal({
  item,
  details,
  detailsLoading,
  libraryItem,
  isProcessing,
  onClose,
  onAdd,
  onRating,
}: SearchPagePreviewModalProps) {
  const title = getTitle(item);
  const year = (item.release_date || item.first_air_date || details?.release_date || details?.first_air_date || "").slice(0, 4);
  const genres = Array.isArray(details?.genres) ? details.genres : [];

  return (
    <div
      className="discover-preview-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="panel discover-preview-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`Detalhes rápidos de ${title}`}
      >
        <button type="button" className="discover-preview-close" title="Fechar" onClick={onClose}>
          <X size={18} />
        </button>

        <div className="discover-preview-poster">
          <img loading="lazy" decoding="async" src={img(item.poster_path || details?.poster_path)} alt={title} />
        </div>

        <div className="discover-preview-content">
          <div className="eyebrow">{item.media_type === "tv" ? "Série" : "Filme"}</div>
          <h2>{title}</h2>

          <div className="discover-preview-meta">
            <span>{year || "Ano não informado"}</span>

            {Number(item.vote_average || details?.vote_average || 0) > 0 && (
              <span className="rating">
                <Star size={14} fill="currentColor" />
                {Number(item.vote_average || details?.vote_average).toFixed(1)}
              </span>
            )}

            {libraryItem && (
              <span className="in-library">
                <Check size={13} />
                {getStatusLabel(libraryItem.status)}
              </span>
            )}
          </div>

          {genres.length > 0 && (
            <div className="discover-preview-genres">
              {genres.map((genre: any) => (
                <span key={genre.id || genre.name}>{genre.name}</span>
              ))}
            </div>
          )}

          <WatchProviderList details={details} loading={detailsLoading} />

          {libraryItem && (
            <div className="preview-personal-rating">
              <div className="preview-personal-rating-head">
                <span>Minha nota</span>
                <strong>
                  {libraryItem.personal_rating !== null
                    ? Number(libraryItem.personal_rating).toFixed(1)
                    : "Sem nota"}
                </strong>
              </div>

              <div className="preview-rating-options">
                {RATING_VALUES.map((value) => (
                  <button
                    type="button"
                    key={value}
                    className={Number(libraryItem.personal_rating) === value ? "active" : ""}
                    disabled={isProcessing}
                    onClick={() => onRating(item, value)}
                  >
                    {value}
                  </button>
                ))}

                <button
                  type="button"
                  className="clear"
                  disabled={isProcessing}
                  onClick={() => onRating(item, null)}
                >
                  Limpar
                </button>
              </div>
            </div>
          )}

          <p className="discover-preview-overview">
            {details?.overview?.trim() || item.overview?.trim() || "Ainda não há sinopse disponível para este título."}
          </p>

          <div className="discover-preview-actions">
            <Link href={`/title/${item.media_type}/${item.id}`} className="btn primary">
              Ver página completa
            </Link>

            {!libraryItem && (
              <button type="button" className="btn" disabled={isProcessing} onClick={() => onAdd(item)}>
                {isProcessing ? <Loader2 size={16} className="spin" /> : <Plus size={17} />}
                Quero assistir
              </button>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
