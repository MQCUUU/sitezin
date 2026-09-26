import type { HTMLAttributes } from "react";

import { cx } from "@/components/ui/cx";

export type MediaCardMetaProps = HTMLAttributes<HTMLDivElement>;

/** Meta row below the title (rating, year, favorite). Keeps `.card-meta`. */
export function MediaCardMeta({ className, ...rest }: MediaCardMetaProps) {
  return <div className={cx("card-meta", "mc-media-card-meta", className)} {...rest} />;
}
