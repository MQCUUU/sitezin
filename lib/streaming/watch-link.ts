import { normalizeWatchProviders } from "../../components/media/providers/normalize";
import type { RawWatchProviders, WatchProviderItem } from "../../components/media/providers/types";

/*
 * Link oficial "onde assistir" de um título.
 *
 * O TMDB não entrega um link por plataforma: entrega UM link por país, a página
 * oficial do título no TMDB (dados do JustWatch), onde cada plataforma já leva
 * direto ao título. Só aceitamos esse endereço vindo do próprio TMDB — https e
 * domínio do TMDB ou do JustWatch. Nada é montado ou adivinhado aqui.
 */
const TRUSTED_HOSTS = ["themoviedb.org", "justwatch.com"];

export function safeWatchLink(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;

  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const trusted = TRUSTED_HOSTS.some((base) => host === base || host.endsWith(`.${base}`));

    return url.protocol === "https:" && trusted ? url.toString() : null;
  } catch {
    return null;
  }
}

export type WatchOffer = "subscription" | "free" | "ads" | "rent" | "buy";
export type WatchRow = WatchProviderItem & { offer: WatchOffer };

/** Dados crus do TMDB → uma linha por plataforma e tipo de oferta + o link oficial (ou null). */
export function whereToWatchRows(raw: unknown, region = "BR"): { rows: WatchRow[]; link: string | null } {
  const data = normalizeWatchProviders(raw as RawWatchProviders | null | undefined, region);
  const rows: WatchRow[] = [];

  for (const group of data.groups) {
    for (const provider of group.providers) {
      const offer: WatchOffer = group.kind === "streaming" ? provider.access ?? "subscription" : group.kind;
      rows.push({ ...provider, offer });
    }
  }

  return { rows, link: safeWatchLink(data.attributionUrl) };
}
