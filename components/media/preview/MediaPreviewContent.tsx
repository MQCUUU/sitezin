import Link from "next/link";
import { Film, Star, Tv } from "lucide-react";

import { Poster } from "@/components/Poster";
import { MediaPreviewActions } from "./MediaPreviewActions";
import type {
  MediaPreviewActionsConfig,
  MediaPreviewData,
  MediaPreviewProvidersSlot,
} from "./types";

export type MediaPreviewContentProps = {
  data: MediaPreviewData;
  actions?: MediaPreviewActionsConfig;
  providers?: MediaPreviewProvidersSlot;
  titleId: string;
};

function formatRuntime(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours > 0 ? `${hours}h ${rest}min` : `${rest}min`;
}

/**
 * The visual body of the Quick Peek — everything inside the Dialog panel.
 * Purely presentational: it renders exactly the MediaPreviewData contract
 * it's given and never knows which of the four surfaces produced it.
 */
export function MediaPreviewContent({ data, actions, providers, titleId }: MediaPreviewContentProps) {
  const year = (data.releaseDate || "").slice(0, 4);
  const rating = data.voteAverage && data.voteAverage > 0 ? data.voteAverage.toFixed(1) : null;
  const titleHref = `/title/${data.mediaType}/${data.id}`;

  return (
    <>
      {data.backdropPath && (
        <div className="mc-preview-backdrop">
          <Poster path={data.backdropPath} alt="" sizes="(max-width: 700px) 100vw, 760px" tmdbSize="w780" />
          <div className="mc-preview-backdrop-scrim" />
        </div>
      )}

      <div className="mc-preview-body">
        <div className="mc-preview-poster">
          <Poster
            path={data.posterPath}
            alt={data.title}
            sizes="(max-width: 700px) 96px, 140px"
          />

          {data.libraryState?.libraryId && (
            <div className="mc-preview-poster-status">
              <span className="mc-preview-status-dot" />
              {data.libraryState.statusLabel || "Na biblioteca"}
            </div>
          )}
        </div>

        <div className="mc-preview-main">
          <div className="mc-preview-eyebrow">
            {data.mediaType === "tv" ? <Tv size={14} /> : <Film size={14} />}
            {data.mediaType === "tv" ? "Série" : "Filme"}
            {year && (
              <>
                <span aria-hidden="true">•</span>
                {year}
              </>
            )}
          </div>

          <h2 id={titleId} className="mc-preview-title">
            {data.title}
          </h2>

          {data.originalTitle && data.originalTitle !== data.title && (
            <div className="mc-preview-original-title">{data.originalTitle}</div>
          )}

          {(rating || data.runtime || (data.genres && data.genres.length > 0)) && (
            <div className="mc-preview-meta-row">
              {rating && (
                <span className="mc-preview-rating-pill">
                  <Star size={14} fill="currentColor" />
                  {rating}
                </span>
              )}

              {data.runtime && <span>{formatRuntime(data.runtime)}</span>}

              {data.genres && data.genres.length > 0 && <span>{data.genres.join(", ")}</span>}
            </div>
          )}

          {data.overview && <p className="mc-preview-overview">{data.overview}</p>}

          {providers}

          <div className="mc-preview-footer">
            <MediaPreviewActions data={data} actions={actions} />

            <Link href={titleHref} className="btn mc-preview-full-link">
              Ver página completa
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
