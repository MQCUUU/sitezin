import { Globe2, MessageSquare, TrendingUp } from "lucide-react";

import type { LooseTitleDetails } from "./types";

export type TitleStatsSectionProps = {
  details: LooseTitleDetails;
};

/**
 * Bloco de estatísticas rápidas (popularidade, votos, país de origem) da
 * aba "info". País só aparece quando `production_countries` existe.
 */
export function TitleStatsSection({ details }: TitleStatsSectionProps) {
  const popularity = Number(details.popularity || 0).toFixed(0);
  const countries = details.production_countries || [];

  return (
    <section className="section mc-title-section">
      <div className="title-section-heading">
        <span>Detalhes</span>

        <h2>Informações</h2>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "12px",
        }}
      >
        <div className="panel" style={{ padding: "18px" }}>
          <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
            <TrendingUp size={20} />

            <div>
              <span className="muted">Popularidade</span>

              <strong
                style={{ display: "block", marginTop: "4px", fontSize: "18px" }}
              >
                {popularity}
              </strong>
            </div>
          </div>
        </div>

        <div className="panel" style={{ padding: "18px" }}>
          <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
            <MessageSquare size={20} />

            <div>
              <span className="muted">Avaliações no TMDB</span>

              <strong
                style={{ display: "block", marginTop: "4px", fontSize: "18px" }}
              >
                {Number(details.vote_count || 0).toLocaleString("pt-BR")}
              </strong>
            </div>
          </div>
        </div>

        {countries.length > 0 && (
          <div className="panel" style={{ padding: "18px" }}>
            <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
              <Globe2 size={20} />

              <div>
                <span className="muted">País de origem</span>

                <strong
                  style={{
                    display: "block",
                    marginTop: "4px",
                    fontSize: "16px",
                  }}
                >
                  {countries.map((country: any) => country.name).join(", ")}
                </strong>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
