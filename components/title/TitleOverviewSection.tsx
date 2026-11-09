import "@/styles/features/title-detail.css";
import Link from "next/link";
import { CalendarDays, Clock3, Layers3, Play } from "lucide-react";

import { genreName, languageName, runtimeLabel } from "@/lib/title-locale";
import { TitleSeriesProgress } from "./TitleSeriesProgress";
import type {
  LibraryItem,
  LooseTitleDetails,
  TitleType,
} from "./types";

export type TitleOverviewSectionProps = {
  type: TitleType;
  details: LooseTitleDetails;
  libraryItem: LibraryItem | null;
};

/**
 * Sinopse, gêneros e fatos rápidos (lançamento/duração/conteúdo), mais a
 * progresso de temporadas (séries na biblioteca). O status mora no topo (Fase 4).
 */
export function TitleOverviewSection({
  type,
  details,
  libraryItem,
}: TitleOverviewSectionProps) {

  const runtime = runtimeLabel(details.runtime);
  const overviewLanguage = details.overview_language ? languageName(details.overview_language) : null;

  const genres = (details.genres || [])
    .map((genre: any) => genreName(genre.name))
    .join(", ");

  return (
    <section className="title-info section mc-title-overview-section">
      <div className="title-info-main">
        <div className="title-section-heading">
          <span>Sobre</span>

          <h2>{type === "tv" ? "Sobre a série" : "Sobre o filme"}</h2>
        </div>

        <p className="title-overview" lang={details.overview_language || undefined}>
          {details.overview || "Sem sinopse disponível."}
        </p>

        {overviewLanguage && (
          <p className="title-overview-note muted">Sinopse em {overviewLanguage.toLowerCase()} — ainda não há versão em português.</p>
        )}

        {genres && (
          <div className="title-genres">
            {(details.genres || []).map((genre: any) => (
              <span key={genre.id}>{genreName(genre.name)}</span>
            ))}
          </div>
        )}

        <div className="title-facts">
          <div className="title-fact">
            <CalendarDays size={18} />

            <div>
              <span>Lançamento</span>

              <strong>
                {(details.first_air_date || details.release_date || "—")
                  .split("-")
                  .reverse()
                  .join("/")}
              </strong>
            </div>
          </div>

          {runtime && (
            <div className="title-fact">
              <Clock3 size={18} />

              <div>
                <span>Duração</span>

                <strong>{runtime}</strong>
              </div>
            </div>
          )}

          {type === "tv" && (
            <div className="title-fact">
              <Play size={18} />

              <div>
                <span>Conteúdo</span>

                <strong>
                  {details.number_of_seasons || 0}{" "}
                  {details.number_of_seasons === 1 ? "temporada" : "temporadas"}

                  {", "}

                  {details.number_of_episodes || 0} episódios
                </strong>
              </div>
            </div>
          )}

          {type === "movie" && details.belongs_to_collection && (
            <Link
              href={`/collection/${details.belongs_to_collection.id}`}
              className="title-fact title-fact-link"
            >
              <Layers3 size={18} />

              <div>
                <span>Franquia</span>

                <strong>{details.belongs_to_collection.name}</strong>
              </div>
            </Link>
          )}
        </div>
      </div>

      {/* Fase 4: o status saiu daqui (é a ação principal do topo). Fica só o progresso da série. */}
      {type === "tv" && libraryItem && (
        <aside className="title-sidebar">
          <TitleSeriesProgress
            tvId={Number(details.id)}
            progress={libraryItem.library_progress}
            totals={libraryItem.progress}
          />
        </aside>
      )}
    </section>
  );
}
