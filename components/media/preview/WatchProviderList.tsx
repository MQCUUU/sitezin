import { WatchProviderRow } from "./WatchProviderRow";
import { WATCH_PROVIDER_KIND_LABELS } from "@/components/media/providers/types";
import type { WatchProviderData } from "@/components/media/providers/types";

export type WatchProviderListProps = {
  /** Already normalized by the caller via `normalizeWatchProviders(details?.watch_providers, "BR")` — this renderer no longer interprets raw TMDB payloads itself (C3.2 §3). */
  data: WatchProviderData | null | undefined;
  loading: boolean;
};

/**
 * "Onde assistir no Brasil" box — the single canonical Quick Peek provider
 * renderer (C3.2). Consumed by Discover, Search, For You, Collection and
 * PosterGrid (Home/Library/Favorites). Purely presentational: region,
 * fetching and normalization all live in the caller.
 */
export function WatchProviderList({ data, loading }: WatchProviderListProps) {
  if (loading) {
    return (
      <div className="preview-watch-box">
        <span className="muted">Carregando onde assistir...</span>
      </div>
    );
  }

  if (!data || data.groups.length === 0) {
    return null;
  }

  return (
    <div className="preview-watch-box">
      <div className="preview-watch-head">Onde assistir no Brasil</div>

      {data.groups.map((group) => (
        <WatchProviderRow key={group.kind} label={WATCH_PROVIDER_KIND_LABELS[group.kind]} providers={group.providers} />
      ))}
    </div>
  );
}
