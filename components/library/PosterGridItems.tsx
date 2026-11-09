"use client";
import { MediaPosterActions } from "@/components/media/MediaPosterActions";
import { MediaPosterTags, MediaStatusTag, mediaTypeLabel } from "@/components/media/MediaBadges";
import { TvNextEpisode } from "@/components/TvNextEpisode";
import { SeriesProgressLine } from "@/components/library/SeriesProgress";
import Link from "next/link";
import { Heart, Star } from "lucide-react";
import type { LibraryItem } from "@/lib/types";
import { Poster } from "@/components/Poster";
import { posterLoading } from "@/lib/poster-loading";
import { MediaCard, MediaCardImage, MediaCardMeta } from "@/components/media";
import { genreName } from "@/lib/title-locale";

export type CardActionProps = {
  processing: string | number | null;
  openStatusMenu: string | number | null;
  onPreview: (item: LibraryItem) => void;
  onToggleFavorite: (item: LibraryItem) => void;
  onToggleStatusMenu: (key: string | number) => void;
  onChangeStatus: (item: LibraryItem, status: string) => void;
  onRequestRemove: (item: LibraryItem) => void;
  onAddToList?: (item: LibraryItem) => void;
};

export function ActionButtons({
  item,
  processing,
  onPreview,
  onToggleFavorite,
  onChangeStatus,
  onRequestRemove,
  onAddToList,
  inline = false,
}: CardActionProps & { item: LibraryItem; inline?: boolean }) {
  /*
   * V2.3 — ações e menu de status vêm do componente PADRÃO do site
   * (MediaPosterActions): portal + posição fixa + foco sem rolar.
   */
  return (
    <MediaPosterActions
      inline={inline}
      title={item.title}
      year={(item.media_type === "tv" ? item.first_air_date : item.release_date)?.slice(0, 4)}
      inLibrary
      status={item.status}
      favorite={Boolean(item.favorite)}
      busy={processing === item.library_id}
      onPreview={() => onPreview(item)}
      onMarkWatched={() => onChangeStatus(item, "watched")}
      onToggleFavorite={() => onToggleFavorite(item)}
      onChangeStatus={(status) => onChangeStatus(item, status)}
      onRemove={() => onRequestRemove(item)}
      onAddToList={onAddToList ? () => onAddToList(item) : undefined}
    />
  );
}

export function Card({ item, position, leaving = false, ...actionProps }: CardActionProps & { item: LibraryItem; position?: number; leaving?: boolean }) {
  const date = item.media_type === "tv" ? item.first_air_date : item.release_date;
  const year = date ? new Date(date).getFullYear() : null;

  return (
    <MediaCard data-leaving={leaving || undefined} aria-hidden={leaving || undefined}>
      <MediaCardImage>
        <Link href={`/title/${item.media_type}/${item.tmdb_id}`} className="poster-link">
          <Poster path={item.poster_path} alt={item.title} sizes="(max-width:700px) 46vw, (max-width:1100px) 24vw, 170px" {...posterLoading(position)} />
        </Link>

        <MediaPosterTags type={item.media_type} status={item.status} />
        <ActionButtons item={item} {...actionProps} />
      </MediaCardImage>
      <Link href={`/title/${item.media_type}/${item.tmdb_id}`} className="card-title">
        {item.title}
      </Link>

      {/* Fase 4: uma linha que nunca quebra — tipo e ano; sua nota só se existir; curtido = só o coração. */}
      <MediaCardMeta>
        <span className="mc-media-type-year">
          {mediaTypeLabel(item.media_type)}
          {year ? ` ${year}` : ""}
        </span>
        {item.personal_rating !== null && item.personal_rating !== undefined ? (
          <span className="rating" title="Sua nota">
            <Star size={12} fill="currentColor" aria-hidden="true" />
            {Number(item.personal_rating).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
          </span>
        ) : null}

        {item.favorite && (
          <span className="favorite-label" role="img" aria-label="Curtido" title="Curtido">
            <Heart size={13} fill="currentColor" aria-hidden="true" />
          </span>
        )}
      </MediaCardMeta>
      {item.library_progress !== undefined ? (
        <SeriesProgressLine progress={item.library_progress} />
      ) : (
        <TvNextEpisode progress={item.progress} runtime={item.episode_runtime} />
      )}
    </MediaCard>
  );
}

/** `media.genres` é `text[]` no banco; objetos {id,name} (TMDB) também são aceitos. Vazios nunca viram chip. */
export function genreNames(genres: unknown): string[] {
  if (!Array.isArray(genres)) return [];

  // Fase 4: gêneros de série do TMDB em português ("Action & Adventure" → "Ação e aventura").
  return [...new Set(genres.map((g) => genreName((typeof g === "string" ? g : (g as { name?: string })?.name || "").trim())).filter(Boolean))];
}

export function ListItem({ item, leaving = false, ...actionProps }: CardActionProps & { item: LibraryItem; leaving?: boolean }) {
  const date = item.media_type === "tv" ? item.first_air_date : item.release_date;
  const year = date ? new Date(date).getFullYear() : null;

  return (
    <div className="library-list-item" data-leaving={leaving || undefined} aria-hidden={leaving || undefined}>
      <Link href={`/title/${item.media_type}/${item.tmdb_id}`} className="library-list-poster">
        <Poster path={item.poster_path} alt={item.title} sizes="80px" tmdbSize="w342" />
      </Link>

      <div className="library-list-info">
        <div className="library-list-top">
          <div>
            <Link href={`/title/${item.media_type}/${item.tmdb_id}`} className="library-list-title">
              {item.title}
            </Link>
          </div>

          <ActionButtons item={item} {...actionProps} inline />
        </div>

        <div className="library-list-meta">
          <MediaStatusTag status={item.status} />

          <span className="library-list-kind">
            {mediaTypeLabel(item.media_type)}
            {year ? ` ${year}` : ""}
          </span>

          {item.personal_rating !== null && item.personal_rating !== undefined && (
            <span className="rating" title="Sua nota">
              <Star size={12} fill="currentColor" aria-hidden="true" />
              {Number(item.personal_rating).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
            </span>
          )}

          {item.tmdb_rating !== undefined && item.tmdb_rating !== null && Number(item.tmdb_rating) > 0 && (
            <span className="muted">TMDB {Number(item.tmdb_rating).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</span>
          )}

          {item.favorite && (
            <span className="favorite-label">
              <Heart size={12} fill="currentColor" aria-hidden="true" />
              Curtido
            </span>
          )}
        </div>

        {item.library_progress ? <SeriesProgressLine progress={item.library_progress} /> : null}

        {item.overview && <p className="library-list-overview lib-clamp-2">{item.overview}</p>}

        {genreNames(item.genres).length > 0 && (
          <div className="library-list-genres">
            {genreNames(item.genres).slice(0, 4).map((name) => (
              <span key={name} className="chip">
                {name}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
