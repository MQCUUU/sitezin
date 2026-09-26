import Link from "next/link";
import { Drama, UserRound } from "lucide-react";

import { img } from "@/lib/tmdb";

import type { CharacterResult, PersonResult } from "./types";

export type SearchPersonResultProps = {
  item: PersonResult | CharacterResult;
  className: string;
  id: string;
  ariaSelected: boolean;
  onOpen: () => void;
};

/** Person or character suggestion row — same silhouette (a face, not a
 * poster), so both read visually as "someone", never as a title. */
export function SearchPersonResult({ item, className, id, ariaSelected, onOpen }: SearchPersonResultProps) {
  const isCharacter = item.kind === "character";
  const imagePath = isCharacter ? item.poster_path : item.profile_path;

  return (
    <Link
      className={className}
      href={item.href}
      onClick={onOpen}
      role="option"
      id={id}
      aria-selected={ariaSelected}
    >
      <div className="search-result-poster search-result-person">
        {imagePath ? (
          <img loading="lazy" decoding="async" src={img(imagePath, "w92")} alt={item.name} />
        ) : (
          <div className="search-result-poster-empty">
            {isCharacter ? <Drama size={20} /> : <UserRound size={20} />}
          </div>
        )}
      </div>

      <div className="search-result-info">
        <b>{item.name}</b>
        <div className="muted">
          {isCharacter
            ? `${item.count} ${item.count === 1 ? "título encontrado" : "títulos encontrados"} · Personagem`
            : `${item.known_for_department || "Cinema e TV"} · Ver trabalhos`}
        </div>
      </div>
    </Link>
  );
}
