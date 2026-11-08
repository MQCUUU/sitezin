import "@/styles/features/media.css";
import { Bookmark, Check, CheckCheck, Film, Pause, Play, Repeat, Tv, X as XIcon } from "lucide-react";

import { mediaStatusGroup, mediaStatusLabel } from "@/lib/media-status";

/*
 * V2.3 — tags de pôster PADRÃO do site (tipo + status). Substitui `.badge`,
 * `.card-status`, `.discover-status-badge`, `.fy-type`, `.fy-status-badge`:
 * mesma forma, tamanho, posição e cores em Biblioteca, Descobrir, Para você,
 * Busca, Coleção e Home.
 */

export function MediaStatusIcon({ status, size = 14 }: { status?: string | null; size?: number }) {
  const props = { size, "aria-hidden": true as const };
  switch (status) {
    case "want": return <Bookmark {...props} />;
    case "watching": return <Play {...props} fill="currentColor" />;
    case "rewatching": return <Repeat {...props} />;
    case "paused": return <Pause {...props} fill="currentColor" />;
    case "watched": return <Check {...props} />;
    case "rewatched": return <CheckCheck {...props} />;
    case "dropped": return <XIcon {...props} />;
    default: return <Check {...props} />;
  }
}

export function MediaTypeTag({ type }: { type: "movie" | "tv" | string }) {
  const isTv = type === "tv";
  const label = isTv ? "Série" : "Filme";

  return (
    <span className={`mc-type-chip mc-type-chip--${isTv ? "tv" : "movie"}`} role="img" aria-label={label}>
      {isTv ? <Tv size={14} aria-hidden="true" /> : <Film size={14} aria-hidden="true" />}
      <span className="mc-type-chip-label" aria-hidden="true">{label}</span>
    </span>
  );
}

export function mediaTypeLabel(type: "movie" | "tv" | string) {
  return type === "tv" ? "Série" : "Filme";
}

export function MediaStatusTag({ status }: { status?: string | null }) {
  if (!status) return null;

  return (
    <span className={`mc-tag mc-tag--status mc-status-level--${mediaStatusGroup(status)}`}>
      <MediaStatusIcon status={status} size={13} />
      <span>{mediaStatusLabel(status)}</span>
    </span>
  );
}

function MediaPosterStatusChip({ status }: { status: string }) {
  const label = mediaStatusLabel(status);
  return (
    <span
      className={`mc-status-chip mc-status-level--${mediaStatusGroup(status)}`}
      role="img"
      aria-label={label}
      title={label}
    >
      <MediaStatusIcon status={status} size={14} />
      <span className="mc-status-chip-label" aria-hidden="true">{label}</span>
    </span>
  );
}

/*
 * Fase 3 (V3): sobre o pôster fica só o status. O tipo saiu daqui — repetia a
 * legenda logo abaixo ("Filme · 2015") e cobria a arte. `type` segue na
 * assinatura para os chamadores não mudarem.
 */
export function MediaPosterTags({
  status,
}: {
  type?: "movie" | "tv" | string;
  status?: string | null;
}) {
  if (!status) return null;
  return (
    <span className="mc-tag-slot mc-tag-slot--bottom">
      <MediaPosterStatusChip status={status} />
    </span>
  );
}
