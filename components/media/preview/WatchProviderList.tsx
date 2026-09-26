import { WatchProviderRow } from "./WatchProviderRow";

export type WatchProviderListProps = {
  /** Raw TMDB `/watch/providers` response for a single title (or null/loading). */
  details: { watch_providers?: { results?: Record<string, any> } } | null | undefined;
  loading: boolean;
};

/**
 * "Onde assistir no Brasil" box — extracted from the near-identical
 * `PreviewWatchProviders` that existed in both app/discover/page.tsx and
 * app/search/page.tsx (B0 found them duplicated; B1 only removes the
 * duplication, the presentation/behavior is unchanged). Region is
 * hardcoded to BR here exactly as it was in both originals — not
 * generalized, since neither caller passed a different region.
 */
export function WatchProviderList({ details, loading }: WatchProviderListProps) {
  if (loading) {
    return (
      <div className="preview-watch-box">
        <span className="muted">Carregando onde assistir...</span>
      </div>
    );
  }

  const brazil = details?.watch_providers?.results?.BR || null;
  if (!brazil) {
    return null;
  }

  const subscription = [
    ...(Array.isArray(brazil.flatrate) ? brazil.flatrate : []),
    ...(Array.isArray(brazil.free) ? brazil.free : []),
    ...(Array.isArray(brazil.ads) ? brazil.ads : []),
  ].filter(
    (provider: any, index: number, all: any[]) =>
      all.findIndex((item) => item.provider_id === provider.provider_id) === index
  );

  const rent = Array.isArray(brazil.rent) ? brazil.rent : [];
  const buy = Array.isArray(brazil.buy) ? brazil.buy : [];

  if (subscription.length === 0 && rent.length === 0 && buy.length === 0) {
    return null;
  }

  return (
    <div className="preview-watch-box">
      <div className="preview-watch-head">Onde assistir no Brasil</div>

      {subscription.length > 0 && <WatchProviderRow label="Streaming" providers={subscription} />}
      {rent.length > 0 && <WatchProviderRow label="Aluguel" providers={rent} />}
      {buy.length > 0 && <WatchProviderRow label="Compra" providers={buy} />}
    </div>
  );
}
