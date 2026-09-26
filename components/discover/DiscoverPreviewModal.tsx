import Link from "next/link";
import { Check, Loader2, Plus, Star, X } from "lucide-react";

import { WatchProviderList } from "@/components/media/preview/WatchProviderList";
import { img } from "@/lib/tmdb";

import type { DiscoverItem, Genre } from "./types";

const RATING_VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export type DiscoverPreviewModalProps = {
  item: DiscoverItem;
  details: any;
  detailsLoading: boolean;
  genres: Genre[];
  isProcessing: boolean;
  onClose: () => void;
  onAdd: (item: DiscoverItem) => void;
  onUpdateRating: (item: DiscoverItem, rating: number | null) => void;
};

/**
 * Quick-look modal opened from a card's "Ver rápido" action. Bespoke chrome
 * per B2's scope (a shared MediaPreviewDialog is out of scope for this
 * phase) — only the watch-providers block is the shared
 * `WatchProviderList`, same as Search.
 */
export function DiscoverPreviewModal({
  item,
  details,
  detailsLoading,
  genres,
  isProcessing,
  onClose,
  onAdd,
  onUpdateRating,
}: DiscoverPreviewModalProps) {
  const title = item.title || item.name || "Sem título";
  const year = (item.release_date || item.first_air_date || "").slice(0, 4);

  const previewGenres = Array.isArray(item.genre_ids)
    ? item.genre_ids
        .map((genreId) => genres.find((genre) => genre.id === genreId)?.name)
        .filter((name): name is string => Boolean(name))
    : [];

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
        <button
          type="button"
          className="discover-preview-close"
          title="Fechar"
          aria-label="Fechar"
          onClick={onClose}
        >
          <X size={18} />
        </button>

        <div className="discover-preview-poster">
          <img loading="lazy" decoding="async" src={img(item.poster_path)} alt={title} />
        </div>

        <div className="discover-preview-content">
          <div className="eyebrow">{item.media_type === "tv" ? "Série" : "Filme"}</div>
          <h2>{title}</h2>

          <div className="discover-preview-meta">
            <span>{year || "Ano não informado"}</span>

            {item.vote_average > 0 && (
              <span className="rating">
                <Star size={14} fill="currentColor" />
                {Number(item.vote_average).toFixed(1)}
              </span>
            )}

            {item.in_library && (
              <span className="in-library">
                <Check size={13} />
                Na biblioteca
              </span>
            )}
          </div>

          {previewGenres.length > 0 && (
            <div className="discover-preview-genres">
              {previewGenres.map((genreName) => (
                <span key={genreName}>{genreName}</span>
              ))}
            </div>
          )}

          <WatchProviderList details={details} loading={detailsLoading} />

          {item.in_library && item.library_id && (
            <div className="preview-personal-rating">
              <div className="preview-personal-rating-head">
                <span>Minha nota</span>
                <strong>
                  {item.personal_rating !== null && item.personal_rating !== undefined
                    ? Number(item.personal_rating).toFixed(1)
                    : "Sem nota"}
                </strong>
              </div>

              <div className="preview-rating-options">
                {RATING_VALUES.map((value) => (
                  <button
                    type="button"
                    key={value}
                    className={Number(item.personal_rating) === value ? "active" : ""}
                    disabled={isProcessing}
                    onClick={() => onUpdateRating(item, value)}
                  >
                    {value}
                  </button>
                ))}

                <button
                  type="button"
                  className="clear"
                  disabled={isProcessing}
                  onClick={() => onUpdateRating(item, null)}
                >
                  Limpar
                </button>
              </div>
            </div>
          )}

          <p className="discover-preview-overview">
            {item.overview?.trim() || "Ainda não há sinopse disponível para este título."}
          </p>

          <div className="discover-preview-actions">
            <Link href={`/title/${item.media_type}/${item.id}`} className="btn primary">
              Ver página completa
            </Link>

            {!item.in_library && (
              <button
                type="button"
                className="btn"
                disabled={isProcessing}
                onClick={() => onAdd(item)}
              >
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
