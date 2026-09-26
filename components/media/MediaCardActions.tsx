import type { HTMLAttributes } from "react";

import { cx } from "@/components/ui/cx";

export type MediaCardActionsProps = HTMLAttributes<HTMLDivElement>;

/**
 * Quick-action button row overlaid on the poster (preview, favorite,
 * status). Keeps `.card-actions` — including the existing
 * `@media(hover:hover)` rule in globals.css that already hides it behind
 * hover ONLY on devices that support hover, so touch users always see it.
 */
export function MediaCardActions({ className, ...rest }: MediaCardActionsProps) {
  return <div className={cx("card-actions", "mc-media-card-actions", className)} {...rest} />;
}
