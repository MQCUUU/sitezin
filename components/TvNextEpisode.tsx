import type { TvProgress } from "@/lib/tv-progress";

/*
 * V2.1-E — "S2 E4 · Próximo episódio" + barra de progresso discreta.
 * Só apresenta o que `computeTvProgress` calculou a partir de
 * `episodes_progress.watched` (nunca inferido). Sem dados → nada.
 */
export function tvProgressLabel(progress: TvProgress | null | undefined): string | null {
  if (!progress) return null;

  if (progress.state === "in_progress" && progress.next) {
    return `S${progress.next.season} E${progress.next.episode} · Próximo episódio`;
  }

  if (progress.state === "not_started" && progress.next) {
    return `S${progress.next.season} E${progress.next.episode} · Começar`;
  }

  if (progress.state === "rewatching") return "Reassistindo";
  if (progress.state === "caught_up") return "Em dia com os episódios";
  if (progress.state === "completed") return "Série concluída";

  return null;
}

export function TvNextEpisode({ progress }: { progress?: TvProgress | null }) {
  const label = tvProgressLabel(progress);

  if (!progress || !label) return null;

  const percent = progress.percent;

  return (
    <div className="tv-next-episode">
      <span className="tv-next-episode-label">{label}</span>
      {percent !== null && progress.total ? (
        <span
          className="tv-next-episode-bar"
          role="progressbar"
          aria-label="Progresso da série"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-valuetext={`${progress.watched} de ${progress.total} episódios`}
        >
          <span style={{ width: `${percent}%` }} />
        </span>
      ) : null}
    </div>
  );
}
