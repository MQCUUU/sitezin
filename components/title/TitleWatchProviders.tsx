import { ExternalLink } from "lucide-react";

import { img } from "@/lib/tmdb";
import type { LooseTitleDetails } from "./types";

export type TitleWatchProvidersProps = {
  details: LooseTitleDetails;
};

/**
 * "Onde assistir no Brasil" — deriva as listas de streaming/aluguel/compra
 * do `watch_providers` que já vem embutido em `details` e não renderiza
 * nada quando não há nenhum provider (mesma condição `hasWatchProviders`
 * que o container aplicava antes de montar a seção).
 */
export function TitleWatchProviders({ details }: TitleWatchProvidersProps) {
  const watchProviders = details.watch_providers as any;
  const brazilWatch = watchProviders?.results?.BR || null;

  const streamingProviders = Array.isArray(brazilWatch?.flatrate)
    ? brazilWatch.flatrate
    : [];

  const freeProviders = Array.isArray(brazilWatch?.free)
    ? brazilWatch.free
    : [];

  const adsProviders = Array.isArray(brazilWatch?.ads) ? brazilWatch.ads : [];

  const rentProviders = Array.isArray(brazilWatch?.rent)
    ? brazilWatch.rent
    : [];

  const buyProviders = Array.isArray(brazilWatch?.buy) ? brazilWatch.buy : [];

  const subscriptionProviders = [
    ...streamingProviders,
    ...freeProviders,
    ...adsProviders,
  ].filter(
    (provider: any, index: number, all: any[]) =>
      all.findIndex((item) => item.provider_id === provider.provider_id) ===
      index
  );

  const hasWatchProviders =
    subscriptionProviders.length > 0 ||
    rentProviders.length > 0 ||
    buyProviders.length > 0;

  if (!hasWatchProviders) return null;

  return (
    <section className="section title-watch-section">
      <div className="title-section-heading">
        <span>Disponibilidade</span>

        <h2>Onde assistir no Brasil</h2>
      </div>

      <div className="title-watch-panel panel">
        {subscriptionProviders.length > 0 && (
          <WatchProviderGroup
            title="Streaming"
            description="Incluído em assinatura, gratuito ou com anúncios"
            providers={subscriptionProviders}
          />
        )}

        {rentProviders.length > 0 && (
          <WatchProviderGroup
            title="Aluguel"
            description="Disponível para alugar digitalmente"
            providers={rentProviders}
          />
        )}

        {buyProviders.length > 0 && (
          <WatchProviderGroup
            title="Compra"
            description="Disponível para compra digital"
            providers={buyProviders}
          />
        )}

        {brazilWatch?.link && (
          <div className="title-watch-footer">
            <span className="muted">
              Disponibilidade fornecida pelo TMDB/JustWatch e pode mudar.
            </span>

            <a
              href={brazilWatch.link}
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

function WatchProviderGroup({
  title,
  description,
  providers,
}: {
  title: string;
  description: string;
  providers: any[];
}) {
  return (
    <div className="title-watch-group">
      <div className="title-watch-group-head">
        <div>
          <strong>{title}</strong>

          <span>{description}</span>
        </div>

        <b>{providers.length}</b>
      </div>

      <div className="title-watch-providers">
        {providers.map((provider: any) => (
          <div
            key={provider.provider_id}
            className="title-watch-provider"
            title={provider.provider_name}
          >
            {provider.logo_path ? (
              <img
                src={img(provider.logo_path, "w92")}
                alt={provider.provider_name}
                loading="lazy"
              />
            ) : (
              <div className="title-watch-provider-fallback">
                {String(provider.provider_name || "?").slice(0, 1)}
              </div>
            )}

            <span>{provider.provider_name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
