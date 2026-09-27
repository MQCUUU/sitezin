import { CalendarDays, Clock3, Play } from "lucide-react";

import { SeasonProgress } from "@/components/SeasonProgress";
import type { Status } from "@/lib/types";
import { STATUS_LABELS } from "@/lib/types";
import type {
  LibraryItem,
  LibraryItemUpdate,
  LooseTitleDetails,
  TitleType,
} from "./types";

export type TitleOverviewSectionProps = {
  type: TitleType;
  details: LooseTitleDetails;
  status: Status;
  libraryItem: LibraryItem | null;
  onStatusChange: (value: Status) => void;
  episodeProgress: Record<number, { watched: number; released: number }>;
  onSeasonProgressChange: (item: LibraryItemUpdate) => void;
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
  onStatusChange,
  episodeProgress,
  onSeasonProgressChange,
}: TitleOverviewSectionProps) {
  const runtime = details.runtime || null;

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

        <p className="title-overview">
          {details.overview || "Sem sinopse disponível."}
        </p>

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

                <strong>
                  {Math.floor(runtime / 60) > 0
                    ? `${Math.floor(runtime / 60)}h ${runtime % 60}min`
                    : `${runtime}min`}
                </strong>
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
        </div>
      </div>

      {/* SIDEBAR */}

      <aside className="title-sidebar">
        <div className="title-status-card">
          <div className="title-section-heading">
            <span>Minha coleção</span>

            <h3>Status</h3>
          </div>

          <select
            className="title-status-select"
            value={status}
            onChange={(event) => onStatusChange(event.target.value as Status)}
          >
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>

          {!libraryItem && (
            <p className="title-status-hint">
              Adicione à biblioteca para acompanhar o status.
            </p>
          )}
        </div>

        {type === "tv" && libraryItem && (
          <SeasonProgress
            libraryItem={libraryItem}
            totalSeasons={Number(
              details.number_of_seasons || libraryItem?.media?.seasons_count || 0
            )}
            tvId={Number(details.id)}
            episodeProgress={episodeProgress}
            onChange={onSeasonProgressChange}
          />
        )}
      </aside>
    </section>
  );
}
