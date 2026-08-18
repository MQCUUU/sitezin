"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Check, ChevronRight, Loader2 } from "lucide-react";
import { img } from "@/lib/tmdb";

export function EpisodeBrowser({ tvId, libraryItem, totalSeasons, initialSeason, onProgressChange, onLibraryChange }: {
  tvId: number; libraryItem: any; totalSeasons: number; initialSeason?: number;
  onProgressChange?: (progress: { season: number; watched: number; released: number }) => void;
  onLibraryChange?: (library: any) => void;
}) {
  const [season, setSeason] = useState(initialSeason || libraryItem?.current_season || 1);
  const [episodes, setEpisodes] = useState<any[]>([]);
  const [progress, setProgress] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const requests: Promise<Response>[] = [fetch(`/api/tv/${tvId}/season/${season}`)];
      if (libraryItem?.id) requests.push(fetch(`/api/episodes?library_id=${libraryItem.id}&season=${season}`, { cache: "no-store" }));
      const responses = await Promise.all(requests);
      const values = await Promise.all(responses.map((response) => response.json()));
      if (!cancelled) {
        setEpisodes(Array.isArray(values[0]?.episodes) ? values[0].episodes : []);
        setProgress(Array.isArray(values[1]) ? values[1] : []);
        setLoading(false);
      }
    }
    load().catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [tvId, season, libraryItem?.id]);

  const watched = useMemo(() => new Set(progress.filter((item) => item.watched).map((item) => item.episode_number)), [progress]);
  const released = episodes.filter((episode) => !episode.air_date || new Date(`${episode.air_date}T23:59:59`) <= new Date());
  const watchedReleased = released.filter((episode) => watched.has(episode.episode_number)).length;

  useEffect(() => {
    onProgressChange?.({ season, watched: watchedReleased, released: released.length });
  }, [season, watchedReleased, released.length, onProgressChange]);

  async function toggle(episode: any) {
    if (!libraryItem?.id || saving) return;
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
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ library_id: libraryItem.id, season_number: season, episode_number: episode.episode_number, watched: next, released_episode_count: released.length, total_seasons: totalSeasons }),
      });
      if (!response.ok) throw new Error("Falha ao salvar episódio.");
      const data = await response.json();
      setProgress((current) => [...current.filter((item) => item.episode_number !== episode.episode_number), data]);
      if (data.library) onLibraryChange?.(data.library);
    } catch {
      setProgress(previous);
    }
  }

  async function completeSeason() {
    if (!libraryItem?.id || !released.length || saving) return;
    setSaving(true);
    const previous = progress;
    setProgress(released.map((episode) => ({ episode_number: episode.episode_number, watched: true })));
    try {
      const response = await fetch("/api/episodes", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ library_id: libraryItem.id, season_number: season, episode_numbers: released.map((episode) => episode.episode_number), watched: true, total_seasons: totalSeasons }),
      });
      if (!response.ok) throw new Error("Falha ao concluir temporada.");
      const data = await response.json();
      if (data.library) onLibraryChange?.(data.library);
    } catch {
      setProgress(previous);
    }
    setSaving(false);
  }

  return (
    <section className="episode-browser panel">
      <div className="episode-browser-head">
        <div><span>Episódios</span><h2>Temporada {season}</h2></div>
        <select value={season} onChange={(event) => setSeason(Number(event.target.value))}>
          {Array.from({ length: totalSeasons }, (_, index) => index + 1).map((value) => <option key={value} value={value}>Temporada {value}</option>)}
        </select>
      </div>

      {loading ? <div className="episode-browser-loading"><Loader2 className="spin" size={18} /> Carregando episódios...</div> : (
        <div className="episode-list">
          {episodes.map((episode) => {
            const isWatched = watched.has(episode.episode_number);
            return <article className={`episode-row ${isWatched ? "watched" : ""}`} key={episode.id || episode.episode_number}>
              <Link className="episode-row-main" href={`/title/tv/${tvId}/season/${season}/episode/${episode.episode_number}`}>
                <div className="episode-still">{episode.still_path ? <img src={img(episode.still_path, "w300")} alt="" /> : <span>E{episode.episode_number}</span>}</div>
                <div><b>E{episode.episode_number} · {episode.name}</b><small>{episode.air_date || "Sem data"}{episode.runtime ? ` · ${episode.runtime} min` : ""}</small><p>{episode.overview || "Sinopse indisponível."}</p></div>
              </Link>
              {libraryItem ? <button type="button" className={`episode-check ${isWatched ? "active" : ""}`} disabled={saving} onClick={() => toggle(episode)} aria-label={isWatched ? "Desmarcar episódio" : "Marcar episódio como assistido"}><Check size={16} /></button> : <ChevronRight size={16} />}
            </article>;
          })}
        </div>
      )}

      {libraryItem && released.length > 0 && <button type="button" className="btn primary episode-complete-season" disabled={saving} onClick={completeSeason}><Check size={16} /> Marcar episódios lançados como assistidos</button>}
    </section>
  );
}
