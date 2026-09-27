"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, ChevronRight, Clock, Eye, EyeOff, Loader2 } from "lucide-react";

import { img } from "@/lib/tmdb";
import {
  getEpisodeReleaseStatus,
  type EpisodeSummary,
  type SeasonDetails,
  type SeasonSummary,
} from "@/lib/title-seasons";
import type { LibraryItem, LibraryItemUpdate } from "@/components/title";

type EpisodeProgressRow = {
  episode_number: number;
  watched: boolean;
  [key: string]: unknown;
};

export type EpisodeBrowserProps = {
  tvId: number;
  libraryItem: LibraryItem | null;
  /** Resumo real de temporadas do detalhe (já normalizado) — única fonte do seletor. */
  seasons: SeasonSummary[];
  /**
   * Total de temporadas REGULARES para os cálculos que já existiam
   * (`total_seasons` enviado a `/api/episodes`) — preservado exatamente
   * como antes; Season 0 nunca entra nessa contagem (C5.1 §54).
   */
  totalSeasons: number;
  onProgressChange?: (progress: { season: number; watched: number; released: number }) => void;
  onLibraryChange?: (library: LibraryItemUpdate) => void;
};

function seasonLabel(season: SeasonSummary): string {
  if (season.season_number === 0) return "Especiais";
  const name = season.name.trim();
  if (!name) return `Temporada ${season.season_number}`;
  return name.length > 40 ? `${name.slice(0, 39)}…` : name;
}

function formatEpisodeDate(airDate: string | null): string {
  if (!airDate) return "Sem data";
  const parsed = new Date(`${airDate}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return "Sem data";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" })
    .format(parsed)
    .replace(".", "");
}

function EpisodeStill({ episode }: { episode: EpisodeSummary }) {
  return (
    <div className="episode-still">
      {episode.still_path ? (
        <img src={img(episode.still_path, "w300")} alt="" loading="lazy" decoding="async" />
      ) : (
        <span aria-hidden="true">E{episode.episode_number}</span>
      )}
    </div>
  );
}

function EpisodeRow({
  episode,
  isWatched,
  canToggle,
  saving,
  spoilerRevealed,
  onToggleSpoiler,
  onToggleWatched,
  href,
}: {
  episode: EpisodeSummary;
  isWatched: boolean;
  canToggle: boolean;
  saving: boolean;
  spoilerRevealed: boolean;
  onToggleSpoiler: () => void;
  onToggleWatched: () => void;
  href: string;
}) {
  const status = getEpisodeReleaseStatus(episode.air_date);
  const isFuture = status === "future";
  const isUnknown = status === "unknown";
  const hideOverview = isFuture && !spoilerRevealed;

  const watchDisabledReason = isFuture
    ? "Episódio ainda não foi lançado"
    : isUnknown
      ? "Data de estreia indisponível"
      : null;

  return (
    <article className={`episode-row ${isWatched ? "watched" : ""}`}>
      <Link className="episode-row-main" href={href}>
        <EpisodeStill episode={episode} />
        <div>
          <b>
            E{episode.episode_number} · {episode.name || `Episódio ${episode.episode_number}`}
          </b>

          <small>
            {formatEpisodeDate(episode.air_date)}
            {episode.runtime ? ` · ${episode.runtime} min` : ""}
            {isFuture && (
              <span className="episode-future-badge">
                <Clock size={11} aria-hidden="true" /> Futuro
              </span>
            )}
          </small>

          {hideOverview ? (
            <p className="episode-spoiler-hidden">
              Sinopse oculta até o lançamento.{" "}
              <button
                type="button"
                className="episode-spoiler-toggle"
                onClick={(event) => {
                  event.preventDefault();
                  onToggleSpoiler();
                }}
              >
                <Eye size={12} aria-hidden="true" /> Mostrar sinopse
              </button>
            </p>
          ) : (
            <p>
              {episode.overview || "Sinopse indisponível."}
              {isFuture && spoilerRevealed && (
                <button
                  type="button"
                  className="episode-spoiler-toggle"
                  onClick={(event) => {
                    event.preventDefault();
                    onToggleSpoiler();
                  }}
                >
                  <EyeOff size={12} aria-hidden="true" /> Ocultar
                </button>
              )}
            </p>
          )}
        </div>
      </Link>

      {canToggle ? (
        <button
          type="button"
          className={`episode-check ${isWatched ? "active" : ""}`}
          disabled={saving || !!watchDisabledReason}
          title={watchDisabledReason || undefined}
          onClick={onToggleWatched}
          aria-label={
            watchDisabledReason ||
            (isWatched ? "Desmarcar episódio" : "Marcar episódio como assistido")
          }
        >
          <Check size={16} aria-hidden="true" />
        </button>
      ) : (
        <ChevronRight size={16} aria-hidden="true" />
      )}
    </article>
  );
}

export function EpisodeBrowser({
  tvId,
  libraryItem,
  seasons,
  totalSeasons,
  onProgressChange,
  onLibraryChange,
}: EpisodeBrowserProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const regularSeasons = useMemo(
    () => seasons.filter((season) => season.season_number > 0).sort((a, b) => a.season_number - b.season_number),
    [seasons]
  );
  const specialsSeason = useMemo(
    () => seasons.find((season) => season.season_number === 0) || null,
    [seasons]
  );
  const selectableSeasons = useMemo(
    () => (specialsSeason ? [...regularSeasons, specialsSeason] : regularSeasons),
    [regularSeasons, specialsSeason]
  );

  /*
   * URL é a única fonte de verdade da temporada selecionada (C5.1 §3/§22)
   * — sem useState espelhado. `season` é derivado a cada render.
   */
  const urlSeasonRaw = searchParams.get("season");
  const urlSeasonNumber = urlSeasonRaw !== null ? Number(urlSeasonRaw) : null;
  const urlSeasonValid =
    urlSeasonNumber !== null &&
    Number.isInteger(urlSeasonNumber) &&
    selectableSeasons.some((item) => item.season_number === urlSeasonNumber);

  const libraryCurrentSeason = Number(libraryItem?.current_season || 0);
  const libraryDefaultSeason = regularSeasons.some((item) => item.season_number === libraryCurrentSeason)
    ? libraryCurrentSeason
    : null;

  const season: number | null = urlSeasonValid
    ? (urlSeasonNumber as number)
    : libraryDefaultSeason !== null
      ? libraryDefaultSeason
      : (regularSeasons[0]?.season_number ?? specialsSeason?.season_number ?? null);

  const selectedSeasonSummary = season === null
    ? null
    : selectableSeasons.find((item) => item.season_number === season) || null;
  const headTitle = season === null
    ? "Temporada"
    : selectedSeasonSummary
      ? seasonLabel(selectedSeasonSummary)
      : season === 0
        ? "Especiais"
        : `Temporada ${season}`;

  const selectSeason = useCallback(
    (next: number) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("season", String(next));
      router.push(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  const [seasonData, setSeasonData] = useState<SeasonDetails | null>(null);
  const [progress, setProgress] = useState<EpisodeProgressRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [retryToken, setRetryToken] = useState(0);
  const [revealedSpoilers, setRevealedSpoilers] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (season === null) {
      setLoading(false);
      setSeasonData(null);
      return;
    }

    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      setRevealedSpoilers(new Set());

      try {
        const requests: Promise<Response>[] = [fetch(`/api/tv/${tvId}/season/${season}`)];
        if (libraryItem?.id) {
          requests.push(fetch(`/api/episodes?library_id=${libraryItem.id}&season=${season}`, { cache: "no-store" }));
        }

        const responses = await Promise.all(requests);
        if (!responses[0].ok) {
          throw new Error("season request failed");
        }

        const values = await Promise.all(responses.map((response) => response.json()));
        if (cancelled) return;

        setSeasonData(values[0] as SeasonDetails);
        setProgress(Array.isArray(values[1]) ? values[1] : []);
        setLoading(false);
      } catch {
        if (!cancelled) {
          setError("Não foi possível carregar os episódios desta temporada.");
          setSeasonData(null);
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [tvId, season, libraryItem?.id, retryToken]);

  const episodes = seasonData?.episodes || [];

  const watched = useMemo(
    () => new Set(progress.filter((item) => item.watched).map((item) => item.episode_number)),
    [progress]
  );

  /*
   * "released" agora usa a mesma getEpisodeReleaseStatus do gating
   * individual (C5.2 §28/§29/§30) — alimenta released_episode_count
   * enviado a /api/episodes e a lista de episode_numbers de "Marcar
   * episódios lançados como assistidos". Antes da C5.2, essa definição
   * tratava air_date ausente como lançado, então o botão em lote podia
   * marcar episódios com data desconhecida mesmo com o toggle individual
   * já bloqueado para o mesmo episódio — agora as duas ações usam a
   * mesma regra.
   */
  const released = episodes.filter((episode) => getEpisodeReleaseStatus(episode.air_date) === "released");
  const watchedReleased = released.filter((episode) => watched.has(episode.episode_number)).length;

  useEffect(() => {
    if (season === null) return;
    onProgressChange?.({ season, watched: watchedReleased, released: released.length });
  }, [season, watchedReleased, released.length, onProgressChange]);

  async function toggle(episode: EpisodeSummary) {
    if (!libraryItem?.id || saving || season === null) return;
    const next = !watched.has(episode.episode_number);
    const previous = progress;

    // Feedback instantâneo; o servidor confirma em segundo plano.
    setProgress((current) => {
      if (!next) {
        return [
          ...current.filter((item) => item.episode_number !== episode.episode_number),
          { episode_number: episode.episode_number, watched: false },
        ];
      }

      const earlierNumbers = episodes
        .map((item) => Number(item.episode_number))
        .filter((number) => number <= Number(episode.episode_number));
      return [
        ...current.filter((item) => !earlierNumbers.includes(Number(item.episode_number))),
        ...earlierNumbers.map((number) => ({ episode_number: number, watched: true })),
      ];
    });

    try {
      const response = await fetch("/api/episodes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          library_id: libraryItem.id,
          season_number: season,
          episode_number: episode.episode_number,
          watched: next,
          released_episode_count: released.length,
          total_seasons: totalSeasons,
        }),
      });
      if (!response.ok) throw new Error("Falha ao salvar episódio.");
      const data = await response.json();
      setProgress((current) => [
        ...current.filter((item) => item.episode_number !== episode.episode_number),
        data,
      ]);
      if (data.library) onLibraryChange?.(data.library);
    } catch {
      setProgress(previous);
    }
  }

  async function completeSeason() {
    if (!libraryItem?.id || !released.length || saving || season === null) return;
    setSaving(true);
    const previous = progress;
    setProgress(released.map((episode) => ({ episode_number: episode.episode_number, watched: true })));
    try {
      const response = await fetch("/api/episodes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          library_id: libraryItem.id,
          season_number: season,
          episode_numbers: released.map((episode) => episode.episode_number),
          watched: true,
          total_seasons: totalSeasons,
        }),
      });
      if (!response.ok) throw new Error("Falha ao concluir temporada.");
      const data = await response.json();
      if (data.library) onLibraryChange?.(data.library);
    } catch {
      setProgress(previous);
    }
    setSaving(false);
  }

  function toggleSpoiler(episodeNumber: number) {
    setRevealedSpoilers((current) => {
      const next = new Set(current);
      if (next.has(episodeNumber)) {
        next.delete(episodeNumber);
      } else {
        next.add(episodeNumber);
      }
      return next;
    });
  }

  return (
    <section className="episode-browser panel">
      <div className="episode-browser-head">
        <div>
          <span>Episódios</span>
          <h2>{headTitle}</h2>
        </div>

        {selectableSeasons.length > 0 && (
          <select
            aria-label="Selecionar temporada"
            value={season ?? ""}
            onChange={(event) => selectSeason(Number(event.target.value))}
          >
            {regularSeasons.map((item) => (
              <option key={item.id} value={item.season_number}>
                {seasonLabel(item)}
              </option>
            ))}
            {specialsSeason && (
              <option key={specialsSeason.id} value={specialsSeason.season_number}>
                Especiais
              </option>
            )}
          </select>
        )}
      </div>

      {season === null && (
        <div className="episode-browser-empty">Nenhuma temporada disponível.</div>
      )}

      {season !== null && loading && (
        <div className="episode-browser-loading">
          <Loader2 className="spin" size={18} aria-hidden="true" /> Carregando episódios...
        </div>
      )}

      {!loading && error && (
        <div className="episode-browser-error" role="alert">
          <AlertTriangle size={18} aria-hidden="true" />
          <span>{error}</span>
          <button type="button" className="btn" onClick={() => setRetryToken((value) => value + 1)}>
            Tentar novamente
          </button>
        </div>
      )}

      {!loading && !error && seasonData && episodes.length === 0 && (
        <div className="episode-browser-empty">Nenhum episódio disponível para esta temporada.</div>
      )}

      {!loading && !error && episodes.length > 0 && (
        <div className="episode-list">
          {episodes.map((episode) => (
            <EpisodeRow
              key={episode.id || episode.episode_number}
              episode={episode}
              isWatched={watched.has(episode.episode_number)}
              canToggle={!!libraryItem}
              saving={saving}
              spoilerRevealed={revealedSpoilers.has(episode.episode_number)}
              onToggleSpoiler={() => toggleSpoiler(episode.episode_number)}
              onToggleWatched={() => toggle(episode)}
              href={`/title/tv/${tvId}/season/${season}/episode/${episode.episode_number}`}
            />
          ))}
        </div>
      )}

      {libraryItem && released.length > 0 && (
        <button type="button" className="btn primary episode-complete-season" disabled={saving} onClick={completeSeason}>
          <Check size={16} aria-hidden="true" /> Marcar episódios lançados como assistidos
        </button>
      )}
    </section>
  );
}
