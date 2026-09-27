import type {
  RawWatchProviderItem,
  RawWatchProviderRegion,
  RawWatchProviders,
  WatchProviderData,
  WatchProviderGroup,
  WatchProviderItem,
} from "./types";

function toItems(list: RawWatchProviderItem[] | undefined): WatchProviderItem[] {
  if (!Array.isArray(list)) return [];
  return list.map((provider) => ({
    id: provider.provider_id,
    name: provider.provider_name,
    logoPath: provider.logo_path ?? null,
  }));
}

/** First occurrence wins; relative order preserved (C3.1 spec §10). */
function dedupeById(items: WatchProviderItem[]): WatchProviderItem[] {
  const seen = new Set<number>();
  const result: WatchProviderItem[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    result.push(item);
  }
  return result;
}

/**
 * Pure raw payload → normalized data. No fetch, no region default, no
 * surface knowledge (C3.1 spec §7, §24, §25). All six audited renderers
 * hardcoded "BR" at their own call site — this function never does.
 */
export function normalizeWatchProviders(
  watchProviders: RawWatchProviders | null | undefined,
  region: string
): WatchProviderData {
  const regionPayload: RawWatchProviderRegion | undefined = watchProviders?.results?.[region];

  if (!regionPayload) {
    return { groups: [], attributionUrl: null };
  }

  // Streaming = flatrate + free + ads, in that order, deduped by provider id
  // (flatrate wins over free, free wins over ads — C3.1 spec §9/§10).
  const streaming = dedupeById([
    ...toItems(regionPayload.flatrate),
    ...toItems(regionPayload.free),
    ...toItems(regionPayload.ads),
  ]);

  // Rent/buy are never deduped against streaming or each other — matches
  // every audited renderer exactly (C3.1 spec §11).
  const rent = toItems(regionPayload.rent);
  const buy = toItems(regionPayload.buy);

  const groups: WatchProviderGroup[] = [];
  if (streaming.length > 0) groups.push({ kind: "streaming", providers: streaming });
  if (rent.length > 0) groups.push({ kind: "rent", providers: rent });
  if (buy.length > 0) groups.push({ kind: "buy", providers: buy });

  return {
    groups,
    attributionUrl: regionPayload.link ?? null,
  };
}
