import { img } from "@/lib/tmdb";

export type WatchProvider = {
  provider_id: number;
  provider_name: string;
  logo_path?: string | null;
};

export type WatchProviderRowProps = {
  label: string;
  providers: WatchProvider[];
};

/**
 * One "Streaming"/"Aluguel"/"Compra" row of provider logos.
 * Extracted from app/discover/page.tsx + app/search/page.tsx (B1) —
 * both pages had a byte-for-byte identical copy of this component.
 */
export function WatchProviderRow({ label, providers }: WatchProviderRowProps) {
  return (
    <div className="preview-watch-row">
      <strong>{label}</strong>

      <div className="preview-watch-provider-list">
        {providers.map((provider) => (
          <div
            key={provider.provider_id}
            className="preview-watch-provider"
            title={provider.provider_name}
          >
            {provider.logo_path ? (
              <img src={img(provider.logo_path, "w92")} alt={provider.provider_name} loading="lazy" />
            ) : (
              <span>{String(provider.provider_name || "?").slice(0, 1)}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
