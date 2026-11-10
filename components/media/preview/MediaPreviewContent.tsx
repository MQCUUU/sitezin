import "@/styles/features/media.css";
import Link from "next/link";
import type { ReactNode } from "react";
import { Star } from "lucide-react";

import { Poster } from "@/components/Poster";
import { MediaPreviewActions } from "./MediaPreviewActions";
import type {
  MediaPreviewActionsConfig,
  MediaPreviewData,
  MediaPreviewExtraActionsSlot,
  MediaPreviewProvidersSlot,
} from "./types";

export type MediaPreviewContentProps = {
  data: MediaPreviewData;
  actions?: MediaPreviewActionsConfig;
  providers?: MediaPreviewProvidersSlot;
  extraActions?: MediaPreviewExtraActionsSlot;
  /** Estado pessoal opcional (ex.: progresso da série na Biblioteca — V2.6). */
  personal?: ReactNode;
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
export function MediaPreviewContent({ data, actions, providers, extraActions, personal, titleId }: MediaPreviewContentProps) {
  const year = (data.releaseDate || "").slice(0, 4);
  const rating = data.voteAverage && data.voteAverage > 0 ? data.voteAverage.toFixed(1) : null;
  const titleHref = `/title/${data.mediaType}/${data.id}`;

  /*
   * Banner (2.39:1) no lugar do pôster: o pôster mudava de tamanho conforme a
   * coluna de texto e a prévia "pulava". O painel tem tamanho fixo (media-preview.css);
   * o banner entra com fade quando a imagem chega (Poster / mc-poster-fade).
   */
  return (
    <>
      <div className="mc-preview-banner">
        {data.backdropPath ? (
          <Poster path={data.backdropPath} alt="" sizes="(max-width: 700px) 100vw, 640px" tmdbSize="w780" />
        ) : null}
        <div className="mc-preview-backdrop-scrim" />

        {data.libraryState?.libraryId && (
          <div className="mc-preview-poster-status">
            <span className="mc-preview-status-dot" />
            {data.libraryState.statusLabel || "Na biblioteca"}
          </div>
        )}
      </div>

      <div className="mc-preview-body">
        <div className="mc-preview-main">
          <div className="mc-preview-eyebrow">
            {data.mediaType === "tv" ? "Série" : "Filme"}
            {year ? ` ${year}` : ""}
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

          {personal}

          <div className="mc-preview-providers">{providers}</div>

          <div className="mc-preview-footer">
            <MediaPreviewActions data={data} actions={actions} />

            {extraActions}

            <Link href={titleHref} className="btn mc-preview-full-link">
              Ver página completa
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
