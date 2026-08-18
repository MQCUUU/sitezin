"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, Check, Loader2, RotateCcw, Save, Star } from "lucide-react";
import { Search } from "@/components/Search";
import { img } from "@/lib/tmdb";

export default function EpisodePage() {
  const params = useParams<{ id: string; season: string; episode: string }>();
  const seasonNumber = Number(params.season);
  const episodeNumber = Number(params.episode);
  const [episode, setEpisode] = useState<any>(null);
  const [show, setShow] = useState<any>(null);
  const [library, setLibrary] = useState<any>(null);
  const [progress, setProgress] = useState<any>(null);
  const [comment, setComment] = useState("");
  const [watchedAt, setWatchedAt] = useState(new Date().toISOString().slice(0, 10));
  const [rewatch, setRewatch] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [releasedCount, setReleasedCount] = useState(0);
  const [contentTab, setContentTab] = useState<"details" | "journal">("details");

  useEffect(() => {
    async function load() {
      const [seasonResponse, showResponse, libraryResponse] = await Promise.all([
        fetch(`/api/tv/${params.id}/season/${seasonNumber}`),
        fetch(`/api/tmdb/tv/${params.id}`),
        fetch(`/api/library?tmdb_id=${params.id}&type=tv`, { cache: "no-store" }),
      ]);
      const [seasonData, showData, libraryData] = await Promise.all([seasonResponse.json(), showResponse.json(), libraryResponse.json()]);
      const found = seasonData?.episodes?.find((item: any) => Number(item.episode_number) === episodeNumber) || null;
      setReleasedCount((Array.isArray(seasonData?.episodes) ? seasonData.episodes : []).filter((item: any) => !item.air_date || new Date(`${item.air_date}T23:59:59`) <= new Date()).length);
      setEpisode(found); setShow(showData); setLibrary(libraryData || null);
      if (libraryData?.id) {
        const response = await fetch(`/api/episodes?library_id=${libraryData.id}&season=${seasonNumber}`, { cache: "no-store" });
        const values = await response.json();
        const saved = Array.isArray(values) ? values.find((item) => Number(item.episode_number) === episodeNumber) : null;
        setProgress(saved || null); setComment(saved?.comment || ""); setRewatch(Boolean(saved?.is_rewatch));
        if (saved?.watched_at) setWatchedAt(String(saved.watched_at).slice(0, 10));
      }
      setLoading(false);
    }
    load().catch(() => setLoading(false));
  }, [params.id, seasonNumber, episodeNumber]);

  async function save(watched: boolean) {
    if (!library?.id) return;
    setSaving(true);
    const response = await fetch("/api/episodes", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ library_id: library.id, season_number: seasonNumber, episode_number: episodeNumber, watched, watched_at: `${watchedAt}T12:00:00`, comment, is_rewatch: rewatch, released_episode_count: releasedCount, total_seasons: Number(show?.number_of_seasons || 0) }),
    });
    if (response.ok) setProgress(await response.json());
    setSaving(false);
  }

  if (loading) return <><Search /><div className="empty"><Loader2 className="spin" /> Carregando episódio...</div></>;
  if (!episode) return <><Search /><div className="empty">Episódio não encontrado.</div></>;

  return <>
    <Search />
    <div className="section episode-detail">
      <Link className="episode-back" href={`/title/tv/${params.id}`}><ArrowLeft size={16} /> Voltar para {show?.name || "a série"}</Link>
      <nav className="title-content-tabs episode-content-tabs" aria-label="Seções do episódio"><button className={contentTab === "details" ? "active" : ""} onClick={() => setContentTab("details")}>Sinopse e detalhes</button><button className={contentTab === "journal" ? "active" : ""} onClick={() => setContentTab("journal")}>Progresso e diário</button></nav>
      {contentTab === "details" &&
      <div className="episode-detail-hero panel">
        <div className="episode-detail-image">{episode.still_path ? <img src={img(episode.still_path, "w780")} alt={episode.name} /> : null}</div>
        <div className="episode-detail-copy">
          <span className="eyebrow">TEMPORADA {seasonNumber} · EPISÓDIO {episodeNumber}</span>
          <h1>{episode.name}</h1>
          <div className="episode-detail-meta">{episode.air_date || "Sem data"}{episode.runtime ? ` · ${episode.runtime} min` : ""}{episode.vote_average ? <span><Star size={13} /> {Number(episode.vote_average).toFixed(1)}</span> : null}</div>
          <p>{episode.overview || "Sinopse indisponível."}</p>
          {Array.isArray(episode.crew) && episode.crew.length > 0 && <small>Direção/roteiro: {episode.crew.filter((person: any) => ["Director", "Writer", "Screenplay"].includes(person.job)).map((person: any) => person.name).filter((name: string, index: number, all: string[]) => all.indexOf(name) === index).join(", ") || "Não informado"}</small>}
        </div>
      </div>}

      {contentTab === "journal" && (library ? <div className="episode-journal panel">
        <h2>Seu progresso</h2>
        <label>Data assistida<input type="date" value={watchedAt} onChange={(event) => setWatchedAt(event.target.value)} /></label>
        <label className="episode-rewatch"><input type="checkbox" checked={rewatch} onChange={(event) => setRewatch(event.target.checked)} /><RotateCcw size={15} /> Foi uma reassistida</label>
        <label>Comentário<textarea maxLength={4000} value={comment} onChange={(event) => setComment(event.target.value)} placeholder="O que achou deste episódio?" /></label>
        <div className="episode-journal-actions">
          {progress?.watched && <button className="btn" disabled={saving} onClick={() => save(false)}>Desmarcar assistido</button>}
          <button className="btn primary" disabled={saving} onClick={() => save(true)}>{saving ? <Loader2 className="spin" size={15} /> : progress?.watched ? <Save size={15} /> : <Check size={15} />} {progress?.watched ? "Salvar alterações" : "Marcar como assistido"}</button>
        </div>
      </div> : <div className="panel episode-journal">Adicione a série à biblioteca para registrar este episódio.</div>)}
    </div>
  </>;
}
