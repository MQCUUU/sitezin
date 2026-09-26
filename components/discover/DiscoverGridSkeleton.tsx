import { MediaCardSkeleton } from "@/components/media";

const SKELETON_COUNT = 12;

/**
 * Replaces B1's page-level spinner. Filters/tabs/sort stay mounted and
 * interactive while this shows — only the results area swaps to
 * skeletons — so changing a filter never blanks the whole page or shifts
 * layout once real cards arrive.
 */
export function DiscoverGridSkeleton() {
  return (
    <section className="section" aria-hidden="true">
      <div className="discover-grid mc-media-grid">
        {Array.from({ length: SKELETON_COUNT }).map((_, index) => (
          <MediaCardSkeleton key={index} />
        ))}
      </div>
    </section>
  );
}
