import Link from "next/link";
import { Film, Star, Tv } from "lucide-react";

import { img } from "@/lib/tmdb";

import type { MediaResult } from "./types";

export type SearchMediaResultProps = {
  item: MediaResult;
  title: string;
  year: string;
  className: string;
  id: string;
  ariaSelected: boolean;
  onOpen: () => void;
};

/** A title (movie/tv) suggestion row — distinct poster shape from a
 * person/character row, never confusable with a MediaCard grid item. */
export function SearchMediaResult({
  item,
  title,
  year,
  className,
  id,
  ariaSelected,
  onOpen,
}: SearchMediaResultProps) {
  const isMovie = item.media_type === "movie";

  return (
    <Link
      className={className}
      href={`/title/${item.media_type}/${item.id}`}
      onClick={onOpen}
      role="option"
      id={id}
      aria-selected={ariaSelected}
    >
      <div className="search-result-poster">
        {item.poster_path ? (
          <img loading="lazy" decoding="async" src={img(item.poster_path, "w92")} alt={title} />
        ) : (
          <div className="search-result-poster-empty">
            {isMovie ? <Film size={20} /> : <Tv size={20} />}
          </div>
        )}
      </div>

      <div className="search-result-info">
        <b>{title}</b>
        <div className="muted">
          {year || "Ano desconhecido"} · {isMovie ? "Filme" : "Série"}
          {item.reason ? ` · ${item.reason}` : ""}
          {typeof item.vote_average === "number" && item.vote_average > 0 && (
            <>
              {" · "}
              <Star size={11} fill="currentColor" /> {item.vote_average.toFixed(1)}
            </>
          )}
        </div>
      </div>
    </Link>
  );
}
