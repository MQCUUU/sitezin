import { forwardRef } from "react";
import type { HTMLAttributes } from "react";

import { cx } from "@/components/ui/cx";

export type MediaCardProps = HTMLAttributes<HTMLDivElement>;

/**
 * Presentational shell for a poster-style media card. Kept deliberately
 * thin: it renders the same `.card` class PosterGrid.tsx already relies
 * on (globals.css layout/positioning), plus `mc-media-card` as a hook for
 * the new token-driven visual pass in styles/media-card.css. No state, no
 * handlers — those stay in PosterGrid, which owns the actual behavior.
 */
export const MediaCard = forwardRef<HTMLDivElement, MediaCardProps>(
  function MediaCard({ className, ...rest }, ref) {
    return (
      <div ref={ref} className={cx("card", "mc-media-card", className)} {...rest} />
    );
  }
);
