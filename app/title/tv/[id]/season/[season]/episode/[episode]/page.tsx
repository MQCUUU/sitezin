"use client";

import { Poster } from "@/components/Poster";
import "@/styles/features/episode.css";
import "@/styles/features/screen-kit.css";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, Check, Clock, Eye, Loader2, Save, SkipBack, SkipForward, Star } from "lucide-react";

import { useLibraryAuth } from "@/hooks/useLibraryAuth";
import { apiFetch, errorMessage, isApiError } from "@/lib/api-client";
import { getEpisodeReleaseStatus, type EpisodeSummary } from "@/lib/title-seasons";
import { BRAZIL_TIME_ZONE, dateKeyInTimeZone } from "@/lib/date-only";
import { WatchNowButton } from "@/components/title/WatchNowButton";
import type { LibraryItem, LooseTitleDetails } from "@/components/title";
import { Button } from "@/components/ui/Button";

type EpisodeProgressRow = {
  watched?: boolean;
  watched_at?: string;
  comment?: string;
  episode_number: number;
  [key: string]: unknown;
};

export default function EpisodePage() {
  const params = useParams<{ id: string; season: string; episode: string }>();
  const seasonNumber = Number(params.season);
  const episodeNumber = Number(params.episode);

  /*
   * Validação de params ANTES do fetch (C5.1 §52) — season/episode
   * inválidos nunca disparam request; caem direto no mesmo estado
   * "Episódio não encontrado." que já existia.
   */
  const paramsValid =
    /^\d+$/.test(params.id || "") &&
    Number.isInteger(seasonNumber) &&
    seasonNumber >= 0 &&
    Number.isInteger(episodeNumber) &&
    episodeNumber >= 1;

  const [episode, setEpisode] = useState<EpisodeSummary | null>(null);
  const [show, setShow] = useState<LooseTitleDetails | null>(null);
  const [library, setLibrary] = useState<LibraryItem | null>(null);
  const [progress, setProgress] = useState<EpisodeProgressRow | null>(null);
  const [comment, setComment] = useState("");
  // I1 — usava toISOString().slice(0,10) (UTC); trocado pelo mesmo fuso
  // de referência do produto usado em getEpisodeReleaseStatus, evitando
  // que o default de "assistido em" caia no dia errado perto da meia-noite.
  const [watchedAt, setWatchedAt] = useState(() =>
    dateKeyInTimeZone(new Date(), BRAZIL_TIME_ZONE)
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { handleError, state: authState } = useLibraryAuth();
  const [releasedCount, setReleasedCount] = useState(0);
  const [spoilerRevealed, setSpoilerRevealed] = useState(false);
  const [nextEpisode, setNextEpisode] = useState<{ season: number; episode: number } | null>(null);
  const [prevEpisode, setPrevEpisode] = useState<{ season: number; episode: number } | null>(null);

  useEffect(() => {
    if (!paramsValid) {
      setLoading(false);
      return;
    }

    // Fase 7: espera saber se há sessão — visitante não consulta a biblioteca (evita o 401 no console).
    if (authState === "loading") return;

    let cancelled = false;

    /*
     * Fase 6: cada leitura pelo cliente padrão. Antes, um erro virava "Episódio não encontrado"
     * e, pior, uma falha ao ler o progresso deixava o comentário vazio na tela — "Salvar" apagava
     * o comentário guardado. Agora erro = estado de erro (nada para salvar por cima).
     */
    async function load() {
      const [seasonData, showData, libraryData] = await Promise.all([
        apiFetch(`/api/tv/${params.id}/season/${seasonNumber}`),
        apiFetch(`/api/tmdb/tv/${params.id}`),
        // Visitante (401) não tem biblioteca: é ausência, não erro.
        authState === "guest"
          ? Promise.resolve(null)
          : apiFetch(`/api/library?tmdb_id=${params.id}&type=tv`, { cache: "no-store" }).catch((error) => {
              if (isApiError(error, "UNAUTHENTICATED")) return null;
              throw error;
            }),
      ]);

      const episodesList: EpisodeSummary[] = Array.isArray(seasonData?.episodes) ? seasonData.episodes : [];
      const found = episodesList.find((item) => item.episode_number === episodeNumber) || null;

      setReleasedCount(
        episodesList.filter((item) => getEpisodeReleaseStatus(item.air_date) === "released").length
      );

      if (cancelled) return;
      setEpisode(found);
      setShow(showData);
      setLibrary(libraryData || null);

      // Descobre o próximo episódio da série
      let nextEp: { season: number; episode: number } | null = null;
      const hasNextInSeason = episodesList.some((item) => item.episode_number === episodeNumber + 1);
      if (hasNextInSeason) {
        nextEp = { season: seasonNumber, episode: episodeNumber + 1 };
      } else if (showData && Array.isArray(showData.seasons)) {
        const nextSeasonExists = showData.seasons.some(
          (s: { season_number: number }) => s.season_number === seasonNumber + 1
        );
        if (nextSeasonExists) {
          nextEp = { season: seasonNumber + 1, episode: 1 };
        }
      }
      setNextEpisode(nextEp);

      // E o anterior: o episódio de antes nesta temporada ou o último da temporada anterior.
      let prevEp: { season: number; episode: number } | null = null;
      if (episodesList.some((item) => item.episode_number === episodeNumber - 1)) {
        prevEp = { season: seasonNumber, episode: episodeNumber - 1 };
      } else if (episodeNumber === 1 && showData && Array.isArray(showData.seasons)) {
        const previousSeason = showData.seasons.find(
          (s: { season_number: number; episode_count?: number }) => s.season_number === seasonNumber - 1 && seasonNumber - 1 >= 1
        );
        if (previousSeason?.episode_count) prevEp = { season: seasonNumber - 1, episode: previousSeason.episode_count };
      }
      setPrevEpisode(prevEp);

      if (libraryData?.id) {
        const values = await apiFetch(`/api/episodes?library_id=${libraryData.id}&season=${seasonNumber}`, {
          cache: "no-store",
        });
        const saved = Array.isArray(values)
          ? values.find((item: EpisodeProgressRow) => Number(item.episode_number) === episodeNumber)
          : null;
        setProgress(saved || null);
        setComment(saved?.comment || "");
        if (saved?.watched_at) setWatchedAt(String(saved.watched_at).slice(0, 10));
      }

      setLoading(false);
    }

    load().catch((error) => {
      if (cancelled) return;
      // Temporada inexistente no TMDB = episódio não encontrado; o resto é falha de carregamento.
      if (!isApiError(error, "NOT_FOUND")) setLoadError(errorMessage(error, "Não foi possível carregar o episódio."));
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [params.id, seasonNumber, episodeNumber, paramsValid, authState]);

  async function save(watched: boolean) {
    if (!library?.id) return;
    setSaving(true);
    try {
      const saved = await apiFetch("/api/episodes", {
      method: "POST",
      json: {
        library_id: library.id,
        season_number: seasonNumber,
        episode_number: episodeNumber,
        watched,
        watched_at: `${watchedAt}T12:00:00`,
        watched_at_precision: "date",
        comment,
        released_episode_count: releasedCount,
        total_seasons: Number(show?.number_of_seasons || 0),
      },
    });
      setProgress(saved);
    } catch (error) {
      // Fase 6: antes, erro era ignorado (e falha de rede deixava o botão preso em "salvando").
      handleError(error, undefined, "Não foi possível salvar o episódio");
    } finally {
      setSaving(false);
    }
  }

  if (!paramsValid) return <><div className="empty">Episódio não encontrado.</div></>;
  if (loading) return <><div className="empty"><Loader2 className="spin" /> Carregando episódio...</div></>;
  if (loadError) return <><div className="empty" role="alert">{loadError}</div></>;
  if (!episode) return <><div className="empty">Episódio não encontrado.</div></>;

  const releaseStatus = getEpisodeReleaseStatus(episode.air_date);
  const isFuture = releaseStatus === "future";
  const isUnknown = releaseStatus === "unknown";
  const watchActionDisabled = isFuture || isUnknown;
  const watchDisabledReason = isFuture
    ? "Episódio ainda não foi lançado"
    : isUnknown
      ? "Data de estreia indisponível"
      : null;
  const hideOverview = isFuture && !spoilerRevealed;

  const crewNames = episode.crew
    .filter((person) => person.job && ["Director", "Writer", "Screenplay"].includes(person.job))
    .map((person) => person.name)
    .filter((name, index, all) => all.indexOf(name) === index)
    .join(", ");

  const airLabel = episode.air_date
    ? new Date(`${episode.air_date}T12:00:00`).toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" })
    : "Sem data de estreia";

  /* Fase 4b: uma página só (antes, duas abas) — imagem panorâmica, o episódio
     e, logo abaixo, o registro (data, comentário). */
  return <>
    <div className="ep-page">
      <Link className="sk-link ep-back" href={`/title/tv/${params.id}`}><ArrowLeft size={16} aria-hidden="true" /> {show?.name || "Voltar para a série"}</Link>

      <div className="ep-still">
        {episode.still_path
          ? <Poster path={episode.still_path} alt="" sizes="(max-width: 760px) 100vw, 1100px" tmdbSize="w1280" priority />
          : <span className="ep-still-fallback" aria-hidden="true">E{episode.episode_number}</span>}
      </div>

      <div className="ep-copy">
        <p className="ep-kicker">Temporada {seasonNumber}, episódio {episodeNumber}</p>
        <h1>{episode.name || `Episódio ${episodeNumber}`}</h1>
        <p className="ep-meta">
          <span>{airLabel}</span>
          {episode.runtime ? <span>{episode.runtime} min</span> : null}
          {episode.vote_average ? <span className="ep-rating"><Star size={14} fill="currentColor" aria-hidden="true" /> {Number(episode.vote_average).toFixed(1).replace(".", ",")}</span> : null}
          {isFuture && <span className="ep-future"><Clock size={14} aria-hidden="true" /> Ainda não lançado</span>}
        </p>

        <div className="ep-actions">
          <WatchNowButton
            type="tv"
            id={params.id}
            title={show?.name || ""}
            year={show?.first_air_date ? show.first_air_date.slice(0, 4) : undefined}
            season={seasonNumber}
            episode={episodeNumber}
            className="btn primary episode-action-btn"
          >
            Assistir agora
          </WatchNowButton>

          {prevEpisode && (
            <Link
              href={`/title/tv/${params.id}/season/${prevEpisode.season}/episode/${prevEpisode.episode}`}
              className="btn ghost episode-action-btn"
              title={`Ir para o episódio ${prevEpisode.episode} da temporada ${prevEpisode.season}`}
            >
              <SkipBack size={16} aria-hidden="true" />
              Episódio anterior
            </Link>
          )}

          {nextEpisode && (
            <Link
              href={`/title/tv/${params.id}/season/${nextEpisode.season}/episode/${nextEpisode.episode}`}
              className="btn sk-btn episode-action-btn"
              title={`Ir para o episódio ${nextEpisode.episode} da temporada ${nextEpisode.season}`}
            >
              Próximo episódio
              <SkipForward size={16} aria-hidden="true" />
            </Link>
          )}
        </div>

        {hideOverview ? (
          <p className="ep-overview ep-muted">
            Sinopse oculta até o lançamento.{" "}
            <button type="button" className="sk-link" onClick={() => setSpoilerRevealed(true)}>
              <Eye size={14} aria-hidden="true" /> Mostrar sinopse
            </button>
          </p>
        ) : (
          <p className="ep-overview">{episode.overview || "Sinopse indisponível."}</p>
        )}
        {crewNames && <p className="ep-crew">Direção e roteiro: {crewNames}</p>}
      </div>

      <section className="ep-journal" aria-labelledby="episode-journal-title">
        <h2 id="episode-journal-title">Seu registro</h2>
        {library ? (
          <>
            <div className="ep-journal-fields">
              <label className="sk-field">Data assistida<input type="date" value={watchedAt} onChange={(event) => setWatchedAt(event.target.value)} /></label>
            </div>
            <label className="sk-field ep-comment">Comentário<textarea maxLength={4000} value={comment} onChange={(event) => setComment(event.target.value)} placeholder="O que achou deste episódio?" /></label>
            {watchActionDisabled && !progress?.watched && (
              <p className="ep-muted">{watchDisabledReason}: ainda não é possível marcar este episódio como assistido.</p>
            )}
            <div className="ep-actions">
              <Button variant="primary"
               
                disabled={saving || (watchActionDisabled && !progress?.watched)}
                title={watchActionDisabled && !progress?.watched ? watchDisabledReason || undefined : undefined}
                onClick={() => save(true)}
              >
                {saving ? <Loader2 className="spin" size={16} /> : progress?.watched ? <Save size={16} /> : <Check size={16} />} {progress?.watched ? "Salvar alterações" : "Marcar como assistido"}
              </Button>
              {progress?.watched && <Button variant="ghost" disabled={saving} onClick={() => save(false)}>Desmarcar assistido</Button>}
            </div>
          </>
        ) : (
          <p className="ep-muted">Adicione a série à biblioteca para registrar este episódio.</p>
        )}
      </section>
    </div>
  </>;
}
