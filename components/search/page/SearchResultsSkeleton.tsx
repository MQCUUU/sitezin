import { MediaCardSkeleton } from "@/components/media";
import { Skeleton } from "@/components/ui/Skeleton";

const SKELETON_COUNT = 12;

/**
 * B3 §12: replaces the page-level spinner. The query/title stays visible
 * above (rendered by the container, not this component) while only the
 * results area shows skeletons — no full-page blank-then-spinner flash.
 */
export function SearchResultsSkeleton() {
  return (
    <section className="section" aria-hidden="true">
      <div className="mc-search-page-user-skeleton">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="mc-search-page-user-skeleton-row">
            <Skeleton className="mc-search-page-user-skeleton-avatar" />
            <Skeleton className="mc-search-page-user-skeleton-line" />
          </div>
        ))}
      </div>

      <div className="discover-grid mc-media-grid">
        {Array.from({ length: SKELETON_COUNT }).map((_, index) => (
          <MediaCardSkeleton key={index} />
        ))}
      </div>
    </section>
  );
}
