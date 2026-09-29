"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PlayCircle } from "lucide-react";
import type { TvProgress } from "@/lib/tv-progress";

/*
 * V2.1-E — "Continuar: Temporada 2, Episódio 4" na página da série.
 * Não duplica o EpisodeBrowser: só destaca o próximo episódio calculado
 * de `episodes_progress.watched` e leva à temporada certa. Reage a
 * mudanças (`refreshKey`) quando o usuário marca episódios.
 */
export function NextEpisodeCallout({
  tvId,
  refreshKey,
}: {
  tvId: number;
  refreshKey: number;
}) {
  const [progress, setProgress] = useState<TvProgress | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch(`/api/tv-progress?tmdb_id=${tvId}`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!cancelled) setProgress(data?.progress ?? null);
      })
      .catch(() => {
        if (!cancelled) setProgress(null);
      });

    return () => {
      cancelled = true;
    };
  }, [tvId, refreshKey]);

  if (!progress) return null;

  if (progress.state === "rewatching") {
    return (
      <p className="next-episode-callout muted" role="status">
        Você está reassistindo esta série. O MyCatalog ainda não acompanha o progresso de cada reassistida.
      </p>
    );
  }

  if (progress.state === "completed") {
    return (
      <p className="next-episode-callout muted" role="status">
        Série concluída — todos os episódios assistidos.
      </p>
    );
  }

  if (progress.state === "caught_up") {
    return (
      <p className="next-episode-callout muted" role="status">
        Você está em dia com os episódios já lançados.
      </p>
    );
  }

  if (!progress.next || (progress.state !== "in_progress" && progress.state !== "not_started")) {
    return null;
  }

  const { season, episode } = progress.next;
  const started = progress.state === "in_progress";

  return (
    <div className="next-episode-callout panel">
      <PlayCircle size={20} aria-hidden="true" />
      <div>
        <strong>
          {started ? "Continuar" : "Começar"}: Temporada {season}, Episódio {episode}
        </strong>
        {progress.total ? (
          <span className="muted">
            {progress.watched} de {progress.total} episódios assistidos
            {progress.percent !== null ? ` (${progress.percent}%)` : ""}
          </span>
        ) : null}
      </div>
      <Link className="btn" href={`?season=${season}`} scroll={false}>
        Ver temporada {season}
      </Link>
    </div>
  );
}
