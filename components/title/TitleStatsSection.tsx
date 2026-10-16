import { Globe2, Languages, MessageSquare } from "lucide-react";

import { countryNames, languageName } from "@/lib/title-locale";
import type { LooseTitleDetails } from "./types";

export type TitleStatsSectionProps = {
  details: LooseTitleDetails;
};

/**
 * Informações da obra na aba "info" — só o que ajuda a entender o título,
 * em PT-BR (lib/title-locale.ts): idioma original, país de origem e volume de
 * votos do TMDB (contexto externo, nunca a sua nota). V3.1: a "popularidade"
 * crua do TMDB (número sem unidade para o usuário) saiu.
 */
export function TitleStatsSection({ details }: TitleStatsSectionProps) {
  const language = languageName(details.original_language);
  const countries = countryNames(details.production_countries);
  const votes = Number(details.vote_count || 0);
  const facts = [
    language ? { icon: <Languages size={20} aria-hidden="true" />, label: "Idioma original", value: language } : null,
    countries.length ? { icon: <Globe2 size={20} aria-hidden="true" />, label: countries.length > 1 ? "Países de origem" : "País de origem", value: countries.join(", ") } : null,
    votes > 0 ? { icon: <MessageSquare size={20} aria-hidden="true" />, label: "Votos no TMDB", value: votes.toLocaleString("pt-BR") } : null,
  ].filter((fact): fact is { icon: React.JSX.Element; label: string; value: string } => fact !== null);

  if (facts.length === 0) return null;

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
        {facts.map((fact) => (
          <div key={fact.label} className="panel" style={{ padding: "18px" }}>
            <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
              {fact.icon}

              <div>
                <span className="muted">{fact.label}</span>

                <strong style={{ display: "block", marginTop: "4px", fontSize: "16px" }}>{fact.value}</strong>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
