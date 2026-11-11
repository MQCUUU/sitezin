import Link from "next/link";

import { Credits } from "@/components/ui/Credits";
import { countryNames, languageName, runtimeLabel } from "@/lib/title-locale";
import type { CrewCredit, LooseTitleDetails, PersonCredit, TitleType } from "./types";

export type TitleStatsSectionProps = {
  type: TitleType;
  details: LooseTitleDetails;
  directors?: CrewCredit[];
  writers?: CrewCredit[];
  creators?: PersonCredit[];
};

const names = (people: { name: string }[] | undefined, max = 2) => {
  const list = (people || []).map((person) => person.name).filter(Boolean);
  const unique = [...new Set(list)].slice(0, max);
  return unique.length ? unique.join(", ") : null;
};

/**
 * Projeção (Fase 4) — Ficha do título na coluna lateral da Visão geral, em
 * Créditos (função à direita, nome à esquerda): lançamento, duração ou
 * temporadas, direção/criação, roteiro, franquia, idioma, origem e votos no
 * TMDB (contexto externo, nunca a sua nota). Em PT-BR (lib/title-locale.ts).
 */
export function TitleStatsSection({ type, details, directors, writers, creators }: TitleStatsSectionProps) {
  const language = languageName(details.original_language);
  const countries = countryNames(details.production_countries);
  const votes = Number(details.vote_count || 0);
  const seasons = Number(details.number_of_seasons || 0);
  const episodes = Number(details.number_of_episodes || 0);
  const released = (details.first_air_date || details.release_date || "").split("-").reverse().join("/");

  const items = [
    { label: type === "tv" ? "Estreia" : "Lançamento", value: released || null },
    { label: "Duração", value: type === "movie" ? runtimeLabel(details.runtime) || null : null },
    {
      label: "Conteúdo",
      value: type === "tv" && seasons ? `${seasons} ${seasons === 1 ? "temporada" : "temporadas"}, ${episodes} episódios` : null,
    },
    { label: type === "tv" ? "Criação" : "Direção", value: type === "tv" ? names(creators) : names(directors) },
    { label: "Roteiro", value: type === "movie" ? names(writers) : null },
    {
      label: "Franquia",
      value:
        type === "movie" && details.belongs_to_collection ? (
          <Link href={`/collection/${details.belongs_to_collection.id}`}>{details.belongs_to_collection.name}</Link>
        ) : null,
    },
    { label: "Idioma original", value: language || null },
    { label: countries.length > 1 ? "Países de origem" : "País de origem", value: countries.length ? countries.join(", ") : null },
    { label: "Votos no TMDB", value: votes > 0 ? votes.toLocaleString("pt-BR") : null },
  ];

  if (items.every((item) => !item.value)) return null;

  return (
    <section className="tt-ficha" aria-labelledby="tt-ficha-title">
      <h2 id="tt-ficha-title" className="tt-side-heading">Ficha</h2>
      <Credits items={items} />
    </section>
  );
}
