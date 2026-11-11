"use client";

import "@/styles/features/watchlist.css";
import "@/styles/features/screen-kit.css";
import Link from "next/link";
import { ArrowDown, ArrowDownToLine, ArrowUp, ArrowUpToLine, GripVertical } from "lucide-react";
import { motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Poster } from "@/components/Poster";
import { ConnectedPosterActions } from "@/components/media/ConnectedPosterActions";
import { useToast } from "@/components/ToastProvider";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { setLibraryEntry, useLibraryEntry } from "@/lib/library/entry-store";
import type { WatchlistItem } from "@/lib/watchlist";
import { Button } from "@/components/ui/Button";

/*
 * Watchlist automática — tudo que está como "Quero assistir", na ordem de
 * prioridade do usuário (1 = assistir primeiro).
 *
 * - Entra/sai sozinha: é a própria Biblioteca filtrada por status (lib/watchlist.ts).
 *   Mudar o status pelos botões do pôster tira o título daqui na hora.
 * - Ordem: setas (subir/descer), topo/fim e arrastar e soltar (desktop). Cada
 *   movimento é salvo na hora (PATCH /api/watchlist), com a fila renumerada no
 *   servidor; se falhar, a ordem anterior volta.
 */

const PAGE = 100;

type State = "loading" | "ready" | "error";

export function WatchlistPage() {
  const toast = useToast();
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [total, setTotal] = useState(0);
  const [state, setState] = useState<State>("loading");
  const [loadingMore, setLoadingMore] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const liveRef = useRef<HTMLParagraphElement>(null);

  const load = useCallback(async (offset: number) => {
    const data = await apiFetch<{ items: WatchlistItem[]; total: number }>(`/api/watchlist?limit=${PAGE}&offset=${offset}`, { cache: "no-store" });
    // Os botões do pôster já nascem sabendo o estado (sem consulta extra).
    for (const item of data.items) {
      setLibraryEntry(item.media.media_type, item.media.tmdb_id, { library_id: item.library_id, status: "want", favorite: item.favorite });
    }
    return data;
  }, []);

  useEffect(() => {
    let alive = true;
    load(0)
      .then((data) => {
        if (!alive) return;
        setItems(data.items);
        setTotal(data.total);
        setState("ready");
      })
      .catch(() => alive && setState("error"));
    return () => {
      alive = false;
    };
  }, [load]);

  async function loadMore() {
    setLoadingMore(true);
    try {
      const data = await load(items.length);
      setItems((current) => [...current, ...data.items.filter((i) => !current.some((c) => c.library_id === i.library_id))]);
      setTotal(data.total);
    } catch (error) {
      toast.error("Não foi possível carregar mais", { description: errorMessage(error, "Tente novamente.") });
    } finally {
      setLoadingMore(false);
    }
  }

  /** Saiu de "Quero assistir" (status trocado/removido pelos botões do pôster). */
  const leave = useCallback((libraryId: string) => {
    setItems((current) => current.filter((i) => i.library_id !== libraryId));
    setTotal((t) => Math.max(0, t - 1));
  }, []);

  async function move(libraryId: string, to: number) {
    const from = items.findIndex((i) => i.library_id === libraryId);
    const dest = Math.max(0, Math.min(to, total - 1));
    if (from < 0 || from === dest || saving) return;

    const previous = items;
    const next = [...items];
    const [moved] = next.splice(from, 1);
    // Destino além do que está carregado (ex.: "para o fim"): vai para o fim da parte visível.
    next.splice(Math.min(dest, next.length), 0, moved);
    setItems(next);
    setSaving(true);
    try {
      const result = await apiFetch<{ position: number }>("/api/watchlist", { method: "PATCH", json: { library_id: libraryId, to: dest } });
      if (liveRef.current) liveRef.current.textContent = `${moved.media.title} agora é o número ${result.position} da fila.`;
    } catch (error) {
      setItems(previous);
      toast.error("Não foi possível mudar a ordem", { description: errorMessage(error, "Tente novamente.") });
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
    <div className="wl-page">
      <header className="sk-head">
        <div className="sk-head-text">
          <h1>Watchlist</h1>
          <p>
            Tudo que você marca como Quero assistir entra aqui sozinho e sai quando o status muda. Arraste ou use as
            setas para escolher o que assistir primeiro.
          </p>
        </div>
        {state === "ready" ? (
          <p className="sk-head-aside">
            <strong>{total}</strong> {total === 1 ? "título na fila" : "títulos na fila"}
          </p>
        ) : null}
      </header>

      <p className="wl-sr" role="status" aria-live="polite" ref={liveRef} />

      {state === "loading" ? (
        <div className="wl-state" role="status">
          Carregando sua fila…
        </div>
      ) : state === "error" ? (
        <div className="sk-empty" role="alert">
          <h2>Não foi possível carregar sua watchlist</h2>
          <p>Verifique sua conexão e tente de novo.</p>
          <Button type="button" onClick={() => window.location.reload()}>
            Tentar de novo
          </Button>
        </div>
      ) : items.length === 0 ? (
        <div className="sk-empty">
          <h2>Sua fila está vazia</h2>
          <p>Marque títulos como Quero assistir e eles aparecem aqui, na ordem que você escolher.</p>
          <Link className="btn primary" href="/discover">
            Descobrir títulos
          </Link>
        </div>
      ) : (
        <ol className={`wl-list${saving ? " is-saving" : ""}`} aria-label="Watchlist em ordem de prioridade">
          {items.map((item, index) => (
            <WatchlistRow
              key={item.library_id}
              item={item}
              rank={index + 1}
              last={index === total - 1}
              dragging={dragId === item.library_id}
              over={overId === item.library_id && dragId !== item.library_id}
              disabled={saving}
              onLeave={leave}
              onMove={(to) => move(item.library_id, to)}
              index={index}
              total={total}
              dnd={{
                onDragStart: () => setDragId(item.library_id),
                onDragEnter: () => setOverId(item.library_id),
                onDragEnd: () => {
                  setDragId(null);
                  setOverId(null);
                },
                onDrop: () => {
                  if (dragId && dragId !== item.library_id) void move(dragId, index);
                  setDragId(null);
                  setOverId(null);
                },
              }}
            />
          ))}
        </ol>
      )}

      {state === "ready" && items.length < total ? (
        <div className="wl-more">
          <Button type="button" disabled={loadingMore} onClick={loadMore}>
            {loadingMore ? "Carregando…" : `Carregar mais (${total - items.length})`}
          </Button>
        </div>
      ) : null}
    </div>
    </>
  );
}

function WatchlistRow({
  item,
  rank,
  index,
  total,
  last,
  dragging,
  over,
  disabled,
  onLeave,
  onMove,
  dnd,
}: {
  item: WatchlistItem;
  rank: number;
  index: number;
  total: number;
  last: boolean;
  dragging: boolean;
  over: boolean;
  disabled: boolean;
  onLeave: (libraryId: string) => void;
  onMove: (to: number) => void;
  dnd: { onDragStart: () => void; onDragEnter: () => void; onDragEnd: () => void; onDrop: () => void };
}) {
  const { media } = item;
  const entry = useLibraryEntry(media.media_type, media.tmdb_id);
  const year = (media.media_type === "tv" ? media.first_air_date : media.release_date)?.slice(0, 4);
  const href = `/title/${media.media_type}/${media.tmdb_id}`;

  // Status trocado (ou removido) pelos botões do pôster: sai da fila.
  useEffect(() => {
    if (entry === null || (entry && entry.status !== "want")) onLeave(item.library_id);
  }, [entry, item.library_id, onLeave]);

  return (
    <li
      className={`wl-item${dragging ? " is-dragging" : ""}${over ? " is-over" : ""}`}
      draggable={!disabled}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", item.library_id);
        dnd.onDragStart();
      }}
      onDragEnter={dnd.onDragEnter}
      onDragOver={(event) => event.preventDefault()}
      onDragEnd={dnd.onDragEnd}
      onDrop={(event) => {
        event.preventDefault();
        dnd.onDrop();
      }}
    >
      <motion.div layout="position" transition={{ type: "spring", duration: 0.35, bounce: 0 }} className="wl-row">
      <span className="wl-grip" aria-hidden="true">
        <GripVertical size={18} />
      </span>
      <span className="wl-rank" aria-label={`Prioridade ${rank}`}>
        {rank}
      </span>
      <div className="wl-poster mc-pa-host">
        <Link href={href} tabIndex={-1} aria-hidden="true" className="poster-link">
          <Poster path={media.poster_path} alt="" sizes="92px" tmdbSize="w185" />
        </Link>
        <ConnectedPosterActions
          media={{
            tmdbId: media.tmdb_id,
            mediaType: media.media_type,
            title: media.title,
            year,
            posterPath: media.poster_path,
            backdropPath: media.backdrop_path,
            overview: media.overview,
            voteAverage: media.tmdb_rating,
            releaseDate: media.media_type === "tv" ? media.first_air_date : media.release_date,
          }}
        />
      </div>
      <div className="wl-info">
        <Link href={href} className="wl-title">
          {media.title}
        </Link>
        <small className="wl-meta">
          {media.media_type === "tv" ? "Série" : "Filme"}
          {year ? ` ${year}` : ""}
          {media.runtime && media.media_type === "movie" ? `, ${media.runtime} min` : ""}
        </small>
      </div>
      <div className="wl-controls" role="group" aria-label={`Prioridade de ${media.title}`}>
        <button type="button" className="wl-btn" disabled={disabled || index === 0} onClick={() => onMove(0)} aria-label={`Mover ${media.title} para o topo`} title="Para o topo">
          <ArrowUpToLine size={16} />
        </button>
        <button type="button" className="wl-btn" disabled={disabled || index === 0} onClick={() => onMove(index - 1)} aria-label={`Subir ${media.title}`} title="Subir">
          <ArrowUp size={16} />
        </button>
        <button type="button" className="wl-btn" disabled={disabled || last} onClick={() => onMove(index + 1)} aria-label={`Descer ${media.title}`} title="Descer">
          <ArrowDown size={16} />
        </button>
        <button type="button" className="wl-btn" disabled={disabled || last} onClick={() => onMove(total - 1)} aria-label={`Mover ${media.title} para o fim`} title="Para o fim">
          <ArrowDownToLine size={16} />
        </button>
      </div>
      </motion.div>
    </li>
  );
}
