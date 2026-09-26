import { Heart, Plus, Star, Trash2, Film, Tv } from "lucide-react";

import { img } from "@/lib/tmdb";
import type { LibraryItem, LooseTitleDetails, TitleType } from "./types";

export type TitleHeroProps = {
  type: TitleType;
  details: LooseTitleDetails;
  libraryItem: LibraryItem | null;
  favorite: boolean;
  saving: boolean;
  onAddToLibrary: () => void;
  onRemoveFromLibrary: () => void;
  onToggleFavorite: () => void;
};

/**
 * Cabeçalho principal da title page: backdrop, poster, título, badges e as
 * ações primárias (adicionar/remover da biblioteca, curtir). Puramente
 * apresentacional — as mutações continuam no container (TitleView), que
 * decide o que `onAddToLibrary`/`onRemoveFromLibrary`/`onToggleFavorite`
 * de fato fazem.
 */
export function TitleHero({
  type,
  details,
  libraryItem,
  favorite,
  saving,
  onAddToLibrary,
  onRemoveFromLibrary,
  onToggleFavorite,
}: TitleHeroProps) {
  const title = details.title || details.name;

  const year = (details.first_air_date || details.release_date || "").slice(
    0,
    4
  );

  const runtime = details.runtime || null;

  const tmdbRating = Number(details.vote_average || 0).toFixed(1);

  return (
    <section className="title-hero">
      <div
        className="title-hero-backdrop"
        style={{
          backgroundImage: `url(${img(details.backdrop_path, "w1280")})`,
        }}
      />

      <div className="title-hero-overlay" />

      <div className="title-hero-content">
        <div className="title-poster-wrap">
          <img
            loading="lazy"
            decoding="async"
            src={img(details.poster_path)}
            alt={title}
            className="title-poster"
          />

          {libraryItem && (
            <div className="title-poster-status">
              <span className="status-dot" />
              Na biblioteca
            </div>
          )}
        </div>

        <div className="title-main">
          <div className="title-type">
            {type === "tv" ? <Tv size={15} /> : <Film size={15} />}

            {type === "tv" ? "Série" : "Filme"}

            {year && (
              <>
                <span>•</span>
                {year}
              </>
            )}
          </div>

          <h1>{title}</h1>

          {(details.original_title || details.original_name) &&
            (details.original_title || details.original_name) !== title && (
              <div className="title-original-name">
                {details.original_title || details.original_name}
              </div>
            )}

          {details.tagline && (
            <p className="title-tagline">“{details.tagline}”</p>
          )}

          <div className="title-quick-facts">
            {details.status && <span>{details.status}</span>}

            {type === "movie" && runtime && (
              <span>
                {Math.floor(Number(runtime) / 60)}h{" "}
                {Number(runtime) % 60}min
              </span>
            )}

            {type === "tv" && details.number_of_seasons && (
              <span>
                {details.number_of_seasons}{" "}
                {Number(details.number_of_seasons) === 1
                  ? "temporada"
                  : "temporadas"}
              </span>
            )}

            {details.original_language && (
              <span>{String(details.original_language).toUpperCase()}</span>
            )}
          </div>

          <div className="title-ratings">
            <div className="title-rating tmdb-rating">
              <Star size={18} fill="currentColor" />

              <div>
                <strong>{tmdbRating}</strong>

                <span>TMDB</span>
              </div>
            </div>

            {libraryItem &&
              libraryItem.personal_rating !== null &&
              libraryItem.personal_rating !== undefined && (
                <div className="title-rating my-rating">
                  <Star size={18} fill="currentColor" />

                  <div>
                    <strong>
                      {Number(libraryItem.personal_rating).toFixed(1)}
                    </strong>

                    <span>Minha nota</span>
                  </div>
                </div>
              )}
          </div>

          <div className="title-actions">
            {!libraryItem ? (
              <button
                className="btn primary title-main-btn"
                onClick={onAddToLibrary}
                disabled={saving}
              >
                <Plus size={18} />

                {saving ? "Adicionando..." : "Adicionar à biblioteca"}
              </button>
            ) : (
              <button
                className="btn title-main-btn"
                onClick={onRemoveFromLibrary}
                disabled={saving}
              >
                <Trash2 size={18} />

                {saving ? "Removendo..." : "Remover da biblioteca"}
              </button>
            )}

            <button
              className={
                favorite ? "btn favorite-btn active" : "btn favorite-btn"
              }
              onClick={onToggleFavorite}
            >
              <Heart size={18} fill={favorite ? "currentColor" : "none"} />

              {favorite ? "Curtido" : "Curtir"}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
