import { Credits } from "@/components/ui/Credits";
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
    { label: "Idioma original", value: language || null },
    { label: countries.length > 1 ? "Países de origem" : "País de origem", value: countries.length ? countries.join(", ") : null },
    { label: "Votos no TMDB", value: votes > 0 ? votes.toLocaleString("pt-BR") : null },
  ];

  if (facts.every((fact) => !fact.value)) return null;

  return (
    <section className="section mc-title-section">
      <div className="title-section-heading">
        <h2>Informações</h2>
      </div>

      <Credits items={facts} label="Informações" />
    </section>
  );
}
