import { ProviderLogo } from "@/components/media/providers/ProviderLogo";
import type { WatchProviderItem } from "@/components/media/providers/types";

export type WatchProviderRowProps = {
  label: string;
  providers: WatchProviderItem[];
};

/**
 * One "Streaming"/"Aluguel"/"Compra" row of provider logos. Consumes the
 * normalized `WatchProviderItem[]` shape (C3.2) — logos render through the
 * shared `ProviderLogo` primitive instead of a raw `<img>`.
 */
export function WatchProviderRow({ label, providers }: WatchProviderRowProps) {
  return (
    <div className="preview-watch-row">
      <strong>{label}</strong>

      <div className="preview-watch-provider-list">
        {providers.map((provider) => (
          <ProviderLogo key={provider.id} provider={provider} sizes="34px" className="preview-watch-provider" />
        ))}
      </div>
    </div>
  );
}
