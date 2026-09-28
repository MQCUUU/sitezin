"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, Check, Clock, Eye, Loader2, RotateCcw, Save, Star } from "lucide-react";

import { Search } from "@/components/Search";
import { img } from "@/lib/tmdb";
import { getEpisodeReleaseStatus, type EpisodeSummary } from "@/lib/title-seasons";
import { BRAZIL_TIME_ZONE, dateKeyInTimeZone } from "@/lib/date-only";
import type { LibraryItem, LooseTitleDetails } from "@/components/title";

type EpisodeProgressRow = {
  watched?: boolean;
  watched_at?: string;
  comment?: string;
  is_rewatch?: boolean;
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
  const [rewatch, setRewatch] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [releasedCount, setReleasedCount] = useState(0);
  const [contentTab, setContentTab] = useState<"details" | "journal">("details");
  const [spoilerRevealed, setSpoilerRevealed] = useState(false);

  useEffect(() => {
    if (!paramsValid) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function load() {
      const [seasonResponse, showResponse, libraryResponse] = await Promise.all([
        fetch(`/api/tv/${params.id}/season/${seasonNumber}`),
        fetch(`/api/tmdb/tv/${params.id}`),
        fetch(`/api/library?tmdb_id=${params.id}&type=tv`, { cache: "no-store" }),
      ]);
      const [seasonData, showData, libraryData] = await Promise.all([
        seasonResponse.json(),
        showResponse.json(),
        libraryResponse.json(),
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

      if (libraryData?.id) {
        const response = await fetch(`/api/episodes?library_id=${libraryData.id}&season=${seasonNumber}`, {
          cache: "no-store",
        });
        const values = await response.json();
        const saved = Array.isArray(values)
          ? values.find((item: EpisodeProgressRow) => Number(item.episode_number) === episodeNumber)
          : null;
        setProgress(saved || null);
        setComment(saved?.comment || "");
        setRewatch(Boolean(saved?.is_rewatch));
        if (saved?.watched_at) setWatchedAt(String(saved.watched_at).slice(0, 10));
      }

      setLoading(false);
    }

    load().catch(() => {
      if (!cancelled) setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [params.id, seasonNumber, episodeNumber, paramsValid]);

  async function save(watched: boolean) {
    if (!library?.id) return;
    setSaving(true);
    const response = await fetch("/api/episodes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        library_id: library.id,
        season_number: seasonNumber,
        episode_number: episodeNumber,
        watched,
        watched_at: `${watchedAt}T12:00:00`,
        comment,
        is_rewatch: rewatch,
        released_episode_count: releasedCount,
        total_seasons: Number(show?.number_of_seasons || 0),
      }),
    });
    if (response.ok) setProgress(await response.json());
    setSaving(false);
  }

  if (!paramsValid) return <><Search /><div className="empty">Episódio não encontrado.</div></>;
  if (loading) return <><Search /><div className="empty"><Loader2 className="spin" /> Carregando episódio...</div></>;
  if (!episode) return <><Search /><div className="empty">Episódio não encontrado.</div></>;

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

  return <>
    <Search />
    <div className="section episode-detail">
      <Link className="episode-back" href={`/title/tv/${params.id}`}><ArrowLeft size={16} /> Voltar para {show?.name || "a série"}</Link>
      <nav className="title-content-tabs episode-content-tabs" aria-label="Seções do episódio"><button className={contentTab === "details" ? "active" : ""} onClick={() => setContentTab("details")}>Sinopse e detalhes</button><button className={contentTab === "journal" ? "active" : ""} onClick={() => setContentTab("journal")}>Progresso e diário</button></nav>
      {contentTab === "details" &&
      <div className="episode-detail-hero panel">
        <div className="episode-detail-image">
          {episode.still_path
            ? <img src={img(episode.still_path, "w780")} alt="" loading="lazy" decoding="async" />
            : <span className="episode-detail-image-fallback" aria-hidden="true">E{episode.episode_number}</span>}
        </div>
        <div className="episode-detail-copy">
          <span className="eyebrow">TEMPORADA {seasonNumber} · EPISÓDIO {episodeNumber}</span>
          <h1>{episode.name || `Episódio ${episodeNumber}`}</h1>
          <div className="episode-detail-meta">
            {episode.air_date || "Sem data"}
            {episode.runtime ? ` · ${episode.runtime} min` : ""}
            {episode.vote_average ? <span><Star size={13} /> {Number(episode.vote_average).toFixed(1)}</span> : null}
            {isFuture && <span className="episode-future-badge"><Clock size={11} aria-hidden="true" /> Futuro</span>}
          </div>
          {hideOverview ? (
            <p className="episode-spoiler-hidden">
              Sinopse oculta até o lançamento.{" "}
              <button type="button" className="episode-spoiler-toggle" onClick={() => setSpoilerRevealed(true)}>
                <Eye size={12} aria-hidden="true" /> Mostrar sinopse
              </button>
            </p>
          ) : (
            <p>{episode.overview || "Sinopse indisponível."}</p>
          )}
          {crewNames && <small>Direção/roteiro: {crewNames}</small>}
        </div>
      </div>}

      {contentTab === "journal" && (library ? <div className="episode-journal panel">
        <h2>Seu progresso</h2>
        <label>Data assistida<input type="date" value={watchedAt} onChange={(event) => setWatchedAt(event.target.value)} /></label>
        <label className="episode-rewatch"><input type="checkbox" checked={rewatch} onChange={(event) => setRewatch(event.target.checked)} /><RotateCcw size={15} /> Foi uma reassistida</label>
        <label>Comentário<textarea maxLength={4000} value={comment} onChange={(event) => setComment(event.target.value)} placeholder="O que achou deste episódio?" /></label>
        {watchActionDisabled && !progress?.watched && (
          <p className="episode-journal-locked">{watchDisabledReason} — ainda não é possível marcar este episódio como assistido.</p>
        )}
        <div className="episode-journal-actions">
          {progress?.watched && <button className="btn" disabled={saving} onClick={() => save(false)}>Desmarcar assistido</button>}
          <button
            className="btn primary"
            disabled={saving || (watchActionDisabled && !progress?.watched)}
            title={watchActionDisabled && !progress?.watched ? watchDisabledReason || undefined : undefined}
            onClick={() => save(true)}
          >
            {saving ? <Loader2 className="spin" size={15} /> : progress?.watched ? <Save size={15} /> : <Check size={15} />} {progress?.watched ? "Salvar alterações" : "Marcar como assistido"}
          </button>
        </div>
      </div> : <div className="panel episode-journal">Adicione a série à biblioteca para registrar este episódio.</div>)}
    </div>
  </>;
}
