import { Poster } from "@/components/Poster";
import type { WatchProviderItem } from "./types";

export type ProviderLogoProps = {
  provider: WatchProviderItem;
  /** Forwarded to `Poster`'s `sizes` — the caller knows its own layout, this primitive doesn't guess. */
  sizes: string;
  /**
   * Sizes/positions the logo box (e.g. `position:relative; width:Npx;
   * height:Npx`). `Poster` renders with `fill`, so it needs a positioned,
   * sized ancestor — every audited renderer already wraps its logo in
   * exactly that kind of box (`.mc-title-provider-logo`,
   * `.preview-watch-provider`, etc.), just with different sizes. No
   * titleMode/previewMode/pickForMeMode branch here — the caller's
   * className is the only thing that varies (C3.1 spec §19/§20).
   */
  className?: string;
};

/**
 * Provider logo with a deterministic, accessible fallback (first letter of
 * the provider name) when there's no `logoPath` — same fallback all six
 * audited renderers already used (C3.1 spec §21). Uses `w92` via `Poster`,
 * the common denominator size across every renderer that used TMDB sizing.
 *
 * Not consumed by any surface yet — C3.1 is foundation-only.
 */
export function ProviderLogo({ provider, sizes, className }: ProviderLogoProps) {
  if (!provider.logoPath) {
    return (
      <div className={className} title={provider.name}>
        <span aria-hidden="true">{String(provider.name || "?").slice(0, 1)}</span>
      </div>
    );
  }

  return (
    <div className={className} title={provider.name}>
      <Poster path={provider.logoPath} alt={provider.name} sizes={sizes} tmdbSize="w92" />
    </div>
  );
}
