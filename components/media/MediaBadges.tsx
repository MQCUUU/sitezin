import "@/styles/features/media.css";
import { Check, CircleMinus, Clock, Pause, Play, Repeat, RotateCcw, Film, Tv } from "lucide-react";
import type { ReactNode } from "react";

import { mediaStatusLabel, mediaStatusTone } from "@/lib/media-status";

/*
 * V2.3 — tags de pôster PADRÃO do site (tipo + status). Substitui `.badge`,
 * `.card-status`, `.discover-status-badge`, `.fy-type`, `.fy-status-badge`:
 * mesma forma, tamanho, posição e cores em Biblioteca, Descobrir, Para você,
 * Busca, Coleção e Home.
 */

const STATUS_ICON: Record<string, ReactNode> = {
  want: <Clock size={12} aria-hidden="true" />,
  watching: <Play size={12} fill="currentColor" aria-hidden="true" />,
  watched: <Check size={12} aria-hidden="true" />,
  rewatching: <RotateCcw size={12} aria-hidden="true" />,
  rewatched: <Repeat size={12} aria-hidden="true" />,
  paused: <Pause size={12} fill="currentColor" aria-hidden="true" />,
  dropped: <CircleMinus size={12} aria-hidden="true" />,
};

export function MediaTypeTag({ type }: { type: "movie" | "tv" | string }) {
  const isTv = type === "tv";

  return (
    <span className="mc-tag mc-tag--type">
      {isTv ? <Tv size={12} aria-hidden="true" /> : <Film size={12} aria-hidden="true" />}
      {isTv ? "Série" : "Filme"}
    </span>
  );
}

export function MediaStatusTag({ status }: { status?: string | null }) {
  if (!status) return null;

  return (
    <span className={`mc-tag mc-tag--status mc-tag--${mediaStatusTone(status)}`}>
      {STATUS_ICON[status] ?? <Check size={12} aria-hidden="true" />}
      {mediaStatusLabel(status)}
    </span>
  );
}

/** Tipo (canto superior esquerdo) + status (canto inferior esquerdo) sobre o pôster. */
export function MediaPosterTags({
  type,
  status,
}: {
  type: "movie" | "tv" | string;
  status?: string | null;
}) {
  return (
    <>
      <span className="mc-tag-slot mc-tag-slot--top">
        <MediaTypeTag type={type} />
      </span>
      {status ? (
        <span className="mc-tag-slot mc-tag-slot--bottom">
          <MediaStatusTag status={status} />
        </span>
      ) : null}
    </>
  );
}
