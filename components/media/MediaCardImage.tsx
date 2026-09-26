import type { HTMLAttributes } from "react";

import { cx } from "@/components/ui/cx";

export type MediaCardImageProps = HTMLAttributes<HTMLDivElement>;

/**
 * Poster/image container — keeps `.poster` (aspect-ratio, overflow,
 * PopoverCollisionGuard targets `.poster:has(.library-card-status-menu)`,
 * see components/PopoverCollisionGuard.tsx) and adds `mc-media-card-image`
 * for the new hover/elevation treatment.
 */
export function MediaCardImage({ className, ...rest }: MediaCardImageProps) {
  return <div className={cx("poster", "mc-media-card-image", className)} {...rest} />;
}
