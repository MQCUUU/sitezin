"use client";

import Link from "next/link";
import {
  Heart,
  Trash2,
  Loader2,
  Play,
  Check,
  Clock,
} from "lucide-react";
import { img } from "@/lib/tmdb";
import type { LibraryItem } from "@/lib/types";
import { STATUS_LABELS } from "@/lib/types";
import { useState } from "react";

export function PosterGrid({
  items,
  onChanged,
}: {
  items: LibraryItem[];
  onChanged?: () => void;
}) {
  const [processing, setProcessing] =
    useState<string | number | null>(null);

  if (!items.length) {
    return (
      <div className="empty">
        Nenhum título encontrado.
        <br />
        Use a busca para adicionar filmes e séries.
      </div>
    );
  }

  async function toggleFavorite(item: LibraryItem) {
    try {
      setProcessing(item.library_id);

      const response = await fetch("/api/library", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          media: {
            id: item.tmdb_id,
            media_type: item.media_type,
            title: item.title,
            original_title: item.original_title,
            overview: item.overview,
            poster_path: item.poster_path,
            backdrop_path: item.backdrop_path,
            release_date: item.release_date,
            first_air_date: item.first_air_date,
            genres: item.genres || [],
            vote_average: item.vote_average,
            vote_count: item.vote_count,
          },

          status: item.status,

          favorite: !item.favorite,

          personal_rating: item.personal_rating,
        }),
      });

      if (!response.ok) {
        const data = await response.json();

        throw new Error(
          data?.error ||
            "Não foi possível atualizar o favorito."
        );
      }

      onChanged?.();
    } catch (error) {
      console.error(error);

      alert(
        error instanceof Error
          ? error.message
          : "Erro ao atualizar favorito."
      );
    } finally {
      setProcessing(null);
    }
  }

  async function remove(item: LibraryItem) {
    const confirmed = window.confirm(
      `Remover "${item.title}" da sua biblioteca?`
    );

    if (!confirmed) return;

    try {
      setProcessing(item.library_id);

      const response = await fetch(
        `/api/library?id=${encodeURIComponent(
          String(item.library_id)
        )}`,
        {
          method: "DELETE",
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error ||
            "Não foi possível remover."
        );
      }

      onChanged?.();
    } catch (error) {
      console.error(error);

      alert(
        error instanceof Error
          ? error.message
          : "Erro ao remover."
      );
    } finally {
      setProcessing(null);
    }
  }

  function getStatus(item: LibraryItem) {
    switch (item.status) {
      case "watching":
        return {
          label: "ASSISTINDO",
          icon: (
            <Play
              size={11}
              fill="currentColor"
            />
          ),
          className: "status-watching",
        };

      case "watched":
        return {
          label: "ASSISTIDO",
          icon: <Check size={11} />,
          className: "status-watched",
        };

      case "want":
        return {
          label: "QUERO ASSISTIR",
          icon: <Clock size={11} />,
          className: "status-want",
        };

      case "dropped":
        return {
          label: "ABANDONEI",
          icon: <Trash2 size={11} />,
          className: "status-dropped",
        };

      case "rewatching":
        return {
          label: "REASSISTINDO",
          icon: (
            <Play
              size={11}
              fill="currentColor"
            />
          ),
          className: "status-rewatching",
        };

      default:
        return {
          label:
            STATUS_LABELS[
              item.status as keyof typeof STATUS_LABELS
            ] ||
            String(item.status || "").toUpperCase(),
          icon: null,
          className: "status-default",
        };
    }
  }

  return (
    <div className="grid">
      {items.map((item) => {
        const busy =
          processing === item.library_id;

        const status = getStatus(item);

        return (
          <div
            className="card"
            key={item.library_id}
          >
            <div className="poster">
              <Link
                href={`/title/${item.media_type}/${item.tmdb_id}`}
                className="poster-link"
              >
                <img
                  src={img(item.poster_path)}
                  alt={item.title}
                />
              </Link>

              {/* TIPO */}
              <span className="badge">
                {item.media_type === "tv"
                  ? "SÉRIE"
                  : "FILME"}
              </span>

              {/* STATUS */}
              <span
                className={`card-status ${status.className}`}
              >
                {status.icon}
                {status.label}
              </span>

              {/* AÇÕES */}
              <div className="card-actions">
                <button
                  type="button"
                  className={
                    item.favorite
                      ? "card-action active"
                      : "card-action"
                  }
                  title={
                    item.favorite
                      ? "Remover dos favoritos"
                      : "Favoritar"
                  }
                  disabled={busy}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    toggleFavorite(item);
                  }}
                >
                  <Heart
                    size={17}
                    fill={
                      item.favorite
                        ? "currentColor"
                        : "none"
                    }
                  />
                </button>

                <button
                  type="button"
                  className="card-action remove"
                  title="Remover da biblioteca"
                  disabled={busy}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    remove(item);
                  }}
                >
                  {busy ? (
                    <Loader2
                      size={17}
                      className="spin"
                    />
                  ) : (
                    <Trash2 size={17} />
                  )}
                </button>
              </div>
            </div>

            {/* TÍTULO */}
            <Link
              href={`/title/${item.media_type}/${item.tmdb_id}`}
              className="card-title"
            >
              {item.title}
            </Link>

            {/* INFORMAÇÕES */}
            <div className="card-meta">
              {item.personal_rating !== null &&
              item.personal_rating !== undefined ? (
                <span className="rating">
                  ★{" "}
                  {Number(
                    item.personal_rating
                  ).toFixed(1)}
                </span>
              ) : (
                <span className="no-rating">
                  Sem nota
                </span>
              )}

              {item.favorite && (
                <span className="favorite-label">
                  <Heart
                    size={11}
                    fill="currentColor"
                  />
                  Favorito
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}