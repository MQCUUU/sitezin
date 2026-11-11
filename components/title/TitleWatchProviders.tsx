import "@/styles/features/title-detail.css";
import { ExternalLink } from "lucide-react";

import { normalizeWatchProviders } from "@/components/media/providers/normalize";
import { ProviderLogo } from "@/components/media/providers/ProviderLogo";
import type { RawWatchProviders, WatchProviderKind } from "@/components/media/providers/types";
import type { LooseTitleDetails } from "./types";

export type TitleWatchProvidersProps = {
  details: LooseTitleDetails;
};

/** Rótulo de cada linha (apresentação do Título; o modelo normalizado só carrega o `kind`). */
const GROUP_LABEL: Record<WatchProviderKind, string> = {
  streaming: "Assinatura",
  rent: "Aluguel",
  buy: "Compra",
};

/**
 * "Onde assistir no Brasil" — Projeção (Fase 4): linhas, não caixas. Cada
 * forma de acesso é uma linha (rótulo à esquerda, serviços à direita, logo
 * pequeno + nome), separada por um fio. Fonte: `normalizeWatchProviders`
 * (região BR explícita aqui). `watch_providers` é `unknown` em
 * lib/title-details.ts — esta é a única asserção de tipo na fronteira.
 */
export function TitleWatchProviders({ details }: TitleWatchProvidersProps) {
  const rawWatchProviders = details.watch_providers as RawWatchProviders | null | undefined;
  const data = normalizeWatchProviders(rawWatchProviders, "BR");

  if (data.groups.length === 0) return null;

  return (
    <section className="section mc-title-section tt-watch">
      <div className="title-section-heading">
        <h2>Onde assistir no Brasil</h2>
      </div>

      <dl className="tt-watch-rows">
        {data.groups.map((group) => (
          <div key={group.kind} className="tt-watch-row">
            <dt>{GROUP_LABEL[group.kind]}</dt>
            <dd>
              <ul className="tt-watch-list">
                {group.providers.map((provider) => (
                  <li key={provider.id} className="tt-watch-provider">
                    <ProviderLogo provider={provider} sizes="24px" className="mc-title-provider-logo" />
                    <span>{provider.name}</span>
                  </li>
                ))}
              </ul>
            </dd>
          </div>
        ))}
      </dl>

      {data.attributionUrl ? (
        <p className="tt-watch-source">
          Disponibilidade no Brasil pelo TMDB e JustWatch; pode mudar.{" "}
          <a href={data.attributionUrl} target="_blank" rel="noreferrer">
            Ver opções
            <ExternalLink size={14} aria-hidden="true" />
          </a>
        </p>
      ) : null}
    </section>
  );
}
