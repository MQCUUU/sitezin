import Link from "next/link";
import { PlayCircle } from "lucide-react";

import { SeriesProgressPanel } from "@/components/library/SeriesProgress";
import { episodeCode } from "@/lib/library/progress";
import type { LibraryProgress } from "@/lib/library/progress";
import type { TvProgress } from "@/lib/tv-progress";

/**
 * V3.1 — "Seu progresso" na página da série. NENHUMA regra própria: mostra o
 * `library_progress` (mesma copy da Biblioteca/Quick View) e a contagem global
 * `progress` (mesma da Home), ambos calculados por attachSeriesProgress no
 * servidor (computeTvProgress: especiais fora, episódio não exibido não
 * conta, "concluída" só em série encerrada). Substitui o antigo
 * SeasonProgress (progresso por temporadas, gravação automática ao abrir a
 * página) e o NextEpisodeCallout (copy própria via /api/tv-progress).
 *
 * A barra mede exatamente o que o texto ao lado diz: episódios exibidos
 * assistidos ÷ episódios exibidos (série inteira).
 */
export function TitleSeriesProgress({
  tvId,
  progress,
  totals,
}: {
  tvId: number;
  progress: LibraryProgress | null | undefined;
  totals: TvProgress | null | undefined;
}) {
  if (!progress?.title) return null;

  const showBar =
    totals && totals.total && totals.percent !== null && progress.state !== "rewatching" && progress.state !== "unknown" && progress.state !== "legacy";
  const barLabel = showBar ? `${totals!.watched} de ${totals!.total} episódios exibidos` : null;
  const next = progress.next && (progress.state === "in_progress" || progress.state === "not_started") ? progress.next : null;

  return (
    <div className="title-series-progress">
      <SeriesProgressPanel progress={progress} />

      {showBar && (
        <div className="title-series-progress-total">
          <span>{barLabel}</span>
          <span
            className="title-series-progress-bar"
            role="progressbar"
            aria-label="Episódios exibidos assistidos"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={totals!.percent!}
            aria-valuetext={barLabel!}
          >
            <span style={{ width: `${totals!.percent}%` }} />
          </span>
        </div>
      )}

      {next && (
        <div className="title-series-progress-actions">
          <Link className="btn primary" href={`/title/tv/${tvId}/season/${next.season}/episode/${next.episode}`}>
            <PlayCircle size={15} aria-hidden="true" />
            {progress.state === "not_started" ? "Começar" : "Continuar"} {episodeCode(next.season, next.episode)}
          </Link>
          <Link className="btn" href={`?season=${next.season}`} scroll={false}>
            Ver temporada {next.season}
          </Link>
        </div>
      )}
    </div>
  );
}
