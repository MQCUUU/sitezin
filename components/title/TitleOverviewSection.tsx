import Link from "next/link";
import { CalendarDays, Clock3, Layers3, Play } from "lucide-react";

import { MEDIA_STATUS_OPTIONS } from "@/lib/media-status";
import { languageName, runtimeLabel } from "@/lib/title-locale";
import type { LibraryLookupState } from "@/lib/library/lookup";
import type { Status } from "@/lib/types";
import { TitleSeriesProgress } from "./TitleSeriesProgress";
import type {
  LibraryItem,
  LooseTitleDetails,
  TitleType,
} from "./types";

export type TitleOverviewSectionProps = {
  type: TitleType;
  details: LooseTitleDetails;
  status: Status;
  libraryItem: LibraryItem | null;
  /** Fase 0: sem estado confirmado, o status não pode ser escolhido. */
  libraryLookup: LibraryLookupState;
  onStatusChange: (value: Status) => void;
};

/**
 * Sinopse, gêneros e fatos rápidos (lançamento/duração/conteúdo), mais a
 * sidebar de coleção (status + progresso de temporadas para séries).
 */
export function TitleOverviewSection({
  type,
  details,
  status,
  libraryItem,
  libraryLookup,
  onStatusChange,
}: TitleOverviewSectionProps) {
  const lookupPending = !libraryItem && libraryLookup !== "ready";

  const runtime = runtimeLabel(details.runtime);
  const overviewLanguage = details.overview_language ? languageName(details.overview_language) : null;

  const genres = (details.genres || [])
    .map((genre: any) => genre.name)
    .join(" · ");

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
              <span key={genre.id}>{genre.name}</span>
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

                  {" · "}

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

      {/* SIDEBAR */}

      <aside className="title-sidebar">
        <div className="title-status-card">
          <div className="title-section-heading">
            <span>Minha coleção</span>

            <h3>Status</h3>
          </div>

          {/* V3.1: lista canônica de status (lib/media-status.ts) — a mesma da Biblioteca. */}
          <select
            className="title-status-select"
            aria-label="Status na sua biblioteca"
            value={status}
            onChange={(event) => onStatusChange(event.target.value as Status)}
            disabled={lookupPending}
          >
            {MEDIA_STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          {!libraryItem && libraryLookup === "ready" && (
            <p className="title-status-hint">
              Adicione à biblioteca para acompanhar o status.
            </p>
          )}

          {!libraryItem && libraryLookup === "error" && (
            <p className="title-status-hint">
              Não foi possível verificar sua biblioteca agora.
            </p>
          )}
        </div>

        {type === "tv" && libraryItem && (
          <TitleSeriesProgress
            tvId={Number(details.id)}
            progress={libraryItem.library_progress}
            totals={libraryItem.progress}
          />
        )}
      </aside>
    </section>
  );
}
