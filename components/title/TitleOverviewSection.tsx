import "@/styles/features/title-detail.css";

import { languageName } from "@/lib/title-locale";
import type { LooseTitleDetails, TitleType } from "./types";

export type TitleOverviewSectionProps = {
  type: TitleType;
  details: LooseTitleDetails;
};

/**
 * Sinopse do título. Projeção (Fase 4): só o texto — gêneros, duração e
 * ficha moram no topo (TitleMeta) e na coluna lateral (TitleStatsSection,
 * em Créditos); o progresso da série também foi para a coluna lateral.
 */
export function TitleOverviewSection({ type, details }: TitleOverviewSectionProps) {
  const overviewLanguage = details.overview_language ? languageName(details.overview_language) : null;

  return (
    <section className="section mc-title-overview-section">
      <div className="title-section-heading">
        <h2>{type === "tv" ? "Sobre a série" : "Sobre o filme"}</h2>
      </div>

      <p className="title-overview" lang={details.overview_language || undefined}>
        {details.overview || "Sem sinopse disponível."}
      </p>

      {overviewLanguage && (
        <p className="title-overview-note muted">Sinopse em {overviewLanguage.toLowerCase()} — ainda não há versão em português.</p>
      )}
    </section>
  );
}
