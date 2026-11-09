"use client";
import { MediaPosterActions } from "@/components/media/MediaPosterActions";
import { MediaPosterTags, mediaTypeLabel } from "@/components/media/MediaBadges";
import { MediaCard, MediaCardImage, MediaCardMeta } from "@/components/media";
import { Poster } from "@/components/Poster";
import Link from "next/link";

import { Film, Star } from "lucide-react";

export function CollectionCard({
  movie,
  libraryItem,
  processing,
  setPreviewItem,
  addToLibrary,
  updateStatus,
  toggleFavorite,
  requestRemove,
}: any) {
  const busy = processing === `movie-${movie.id}`;
  const year = (movie.release_date || "").slice(0, 4);
  const href = `/title/movie/${movie.id}`;
  const rating = Number(movie.vote_average || 0);

  /* Fase 4: o mesmo cartão de mídia das outras grades (antes, um cartão próprio com "#n" sobre o pôster). */
  return (
    <MediaCard className="collection-card">
      <MediaCardImage>
        <Link href={href} className="poster-link" tabIndex={-1} aria-hidden="true">
          {movie.poster_path ? (
            <Poster path={movie.poster_path} alt="" sizes="(max-width: 700px) 45vw, 190px" />
          ) : (
            <div className="collection-no-poster">
              <Film size={28} aria-hidden="true" />
            </div>
          )}
        </Link>
        <MediaPosterTags type="movie" status={libraryItem ? libraryItem.status : null} />
        <MediaPosterActions
          title={movie.title}
          year={year}
          inLibrary={Boolean(libraryItem)}
          status={libraryItem?.status}
          favorite={Boolean(libraryItem?.favorite)}
          busy={busy}
          onPreview={() => setPreviewItem(movie)}
          onMarkWatched={() => updateStatus(movie, "watched")}
          onAdd={() => addToLibrary(movie, "want")}
          onChangeStatus={(status: string) => updateStatus(movie, status)}
          onToggleFavorite={() => toggleFavorite(movie)}
          onRemove={() => requestRemove(movie)}
        />
      </MediaCardImage>

      <Link href={href} className="card-title">
        {movie.title}
      </Link>

      <MediaCardMeta>
        <span className="mc-media-type-year">
          {mediaTypeLabel("movie")}
          {year ? ` ${year}` : ""}
        </span>
        {rating > 0 && (
          <span className="rating">
            <Star size={12} fill="currentColor" />
            {rating.toFixed(1)}
          </span>
        )}
      </MediaCardMeta>
    </MediaCard>
  );
}
