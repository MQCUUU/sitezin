import { ExternalLink } from "lucide-react";

import { normalizeWatchProviders } from "@/components/media/providers/normalize";
import { ProviderLogo } from "@/components/media/providers/ProviderLogo";
import type { RawWatchProviders, WatchProviderGroup, WatchProviderKind } from "@/components/media/providers/types";
import type { LooseTitleDetails } from "./types";

export type TitleWatchProvidersProps = {
  details: LooseTitleDetails;
};

/**
 * Group copy (title + description) is Title-specific presentation, not part
 * of the shared model — the normalized `kind` only carries the semantic
 * grouping, never UI strings (C3.1 spec §15, C3.3 §10). `watch_providers` on
 * `LooseTitleDetails` is `any` via the pre-existing `Record<string, any>`
 * intersection (components/title/types.ts) — a documented boundary from
 * C1.2, not something this migration introduces or widens.
 */
const GROUP_COPY: Record<WatchProviderKind, { title: string; description: string }> = {
  streaming: { title: "Streaming", description: "Incluído em assinatura, gratuito ou com anúncios" },
  rent: { title: "Aluguel", description: "Disponível para alugar digitalmente" },
  buy: { title: "Compra", description: "Disponível para compra digital" },
};

/**
 * "Onde assistir no Brasil" — Title's own rich composition (section heading,
 * per-group description + count, attribution footer), now sourced from
 * `normalizeWatchProviders` instead of parsing `watch_providers` itself.
 * Region stays explicit here ("BR"), not in the foundation (C3.3 spec §5).
 */
export function TitleWatchProviders({ details }: TitleWatchProvidersProps) {
  /*
   * `details.watch_providers` is `unknown` (lib/title-details.ts:136 —
   * `let watchProviders: unknown = null`), not `any`. This is the one,
   * specifically-typed assertion needed to cross that pre-existing
   * boundary — not `as any`, and not a new `any`/`Record<string, any>`
   * (C3.3 spec §7/§45).
   */
  const rawWatchProviders = details.watch_providers as RawWatchProviders | null | undefined;
  const data = normalizeWatchProviders(rawWatchProviders, "BR");

  if (data.groups.length === 0) return null;

  return (
    <section className="section mc-title-section title-watch-section">
      <div className="title-section-heading">
        <span>Disponibilidade</span>

        <h2>Onde assistir no Brasil</h2>
      </div>

      <div className="title-watch-panel panel">
        {data.groups.map((group) => (
          <TitleWatchProviderGroup key={group.kind} group={group} />
        ))}

        {data.attributionUrl && (
          <div className="title-watch-footer">
            <span className="muted">
              Disponibilidade fornecida pelo TMDB/JustWatch e pode mudar.
            </span>

            <a
              href={data.attributionUrl}
              target="_blank"
              rel="noreferrer"
              className="btn"
            >
              Ver opções
              <ExternalLink size={15} />
            </a>
          </div>
        )}
      </div>
    </section>
  );
}

function TitleWatchProviderGroup({ group }: { group: WatchProviderGroup }) {
  const copy = GROUP_COPY[group.kind];

  return (
    <div className="title-watch-group">
      <div className="title-watch-group-head">
        <div>
          <strong>{copy.title}</strong>

          <span>{copy.description}</span>
        </div>

        <b>{group.providers.length}</b>
      </div>

      <div className="title-watch-providers">
        {group.providers.map((provider) => (
          <div key={provider.id} className="title-watch-provider" title={provider.name}>
            <ProviderLogo provider={provider} sizes="40px" className="mc-title-provider-logo" />

            <span>{provider.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
