import { Skeleton } from "@/components/ui/Skeleton";
import { cx } from "@/components/ui/cx";

export type MediaCardSkeletonProps = {
  className?: string;
};

/**
 * Loading placeholder matching MediaCard's real proportions 1:1 (same
 * `.poster` aspect-ratio/radius, same title/meta heights) so a grid never
 * jumps when data replaces skeletons.
 *
 * This intentionally does NOT replace `components/AsyncState.tsx`'s
 * `PosterSkeleton` (used by the existing page-level loading.tsx files) —
 * that one already matches the current grid and works. This skeleton is
 * for new call sites built directly on the MediaCard system.
 */
export function MediaCardSkeleton({ className }: MediaCardSkeletonProps) {
  return (
    <div className={cx("card mc-media-card mc-media-card-skeleton", className)}>
      <Skeleton className="mc-media-card-skeleton-poster" />
      <Skeleton className="mc-media-card-skeleton-title" />
      <Skeleton className="mc-media-card-skeleton-meta" />
    </div>
  );
}
