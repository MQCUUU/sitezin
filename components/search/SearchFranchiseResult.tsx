import Link from "next/link";
import { Layers3 } from "lucide-react";

import { img } from "@/lib/tmdb";

import type { CollectionResult } from "./types";

export type SearchFranchiseResultProps = {
  item: CollectionResult;
  className: string;
  id: string;
  ariaSelected: boolean;
  onOpen: () => void;
};

/** A collection/franchise — labelled explicitly so it never reads as a
 * single movie result. */
export function SearchFranchiseResult({
  item,
  className,
  id,
  ariaSelected,
  onOpen,
}: SearchFranchiseResultProps) {
  return (
    <Link
      className={className}
      href={item.href}
      onClick={onOpen}
      role="option"
      id={id}
      aria-selected={ariaSelected}
    >
      <div className="search-result-poster">
        {item.poster_path ? (
          <img loading="lazy" decoding="async" src={img(item.poster_path, "w92")} alt={item.name} />
        ) : (
          <div className="search-result-poster-empty">
            <Layers3 size={20} />
          </div>
        )}
      </div>

      <div className="search-result-info">
        <b>{item.name}</b>
        <div className="muted">Coleção / franquia</div>
      </div>
    </Link>
  );
}
