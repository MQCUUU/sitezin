/**
 * Shared watch-provider foundation (C3.1). Built from a re-audit of the six
 * real renderers found in C3.0 (TitleWatchProviders, WatchProviderList,
 * PreviewProviders, CollectionProviders, PreviewWatchProviders, PickForMe's
 * WatchProviders) — all six read the exact same raw shape and apply the
 * exact same streaming dedupe/grouping logic, just with different visual
 * compositions (rich Title cards vs. compact Quick Peek rows vs. Pick for
 * Me's own compact layout). This file is the normalized model + the raw
 * TMDB-shaped input type; no renderer has been migrated onto it yet.
 */

export type WatchProviderKind = "streaming" | "rent" | "buy";

/** Presentation label per kind — kept out of the data model itself (C3.1 spec §15). */
export const WATCH_PROVIDER_KIND_LABELS: Record<WatchProviderKind, string> = {
  streaming: "Streaming",
  rent: "Aluguel",
  buy: "Compra",
};

/**
 * `id` → dedupe key and React `key`.
 * `name` → alt text / fallback initial / accessible label.
 * `logoPath` → image source; `null`/absent triggers the initial-letter fallback.
 */
export type WatchProviderItem = {
  id: number;
  name: string;
  logoPath?: string | null;
};

/** `providers` is already deduped and ordered — see normalize.ts. */
export type WatchProviderGroup = {
  kind: WatchProviderKind;
  providers: WatchProviderItem[];
};

/**
 * `groups` → ordered streaming → rent → buy, only non-empty groups included
 * (C3.1 spec §12/§13). `attributionUrl` → TMDB/JustWatch "Ver opções" link
 * (Title is the only current consumer, but the raw payload always carries
 * it per-region, so it's part of the normalized shape rather than something
 * Title has to re-derive from the raw payload itself).
 *
 * Deliberately excluded: `loading`/`error` (caller/composition state, not
 * data — C3.1 spec §17/§18) and any UI-only field (label strings, rich
 * descriptions — those stay in the composition, C3.1 spec §15/§16).
 */
export type WatchProviderData = {
  groups: WatchProviderGroup[];
  attributionUrl?: string | null;
};

/**
 * Minimal raw-payload typing — only the fields the six renderers actually
 * read. Not a full TMDB `/watch/providers` response type.
 */
export type RawWatchProviderItem = {
  provider_id: number;
  provider_name: string;
  logo_path?: string | null;
};

export type RawWatchProviderRegion = {
  link?: string;
  flatrate?: RawWatchProviderItem[];
  free?: RawWatchProviderItem[];
  ads?: RawWatchProviderItem[];
  rent?: RawWatchProviderItem[];
  buy?: RawWatchProviderItem[];
};

export type RawWatchProviders = {
  results?: Record<string, RawWatchProviderRegion>;
};
