import Link from "next/link";
import { ArrowRight, UserRound } from "lucide-react";

import type { UserResult } from "./types";

export type SearchUserResultProps = {
  item: UserResult;
  className: string;
  id: string;
  ariaSelected: boolean;
  onOpen: () => void;
};

/** A MyCatalog profile — deliberately social (avatar, @handle, "Ver
 * perfil") so it never reads as a TMDB result. */
export function SearchUserResult({ item, className, id, ariaSelected, onOpen }: SearchUserResultProps) {
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
        {item.avatar_url ? (
          <img src={item.avatar_url} alt={item.name} />
        ) : (
          <div className="search-result-poster-empty">
            <UserRound size={20} />
          </div>
        )}
      </div>

      <div className="search-result-info">
        <b>{item.name}</b>
        <div className="muted">@{item.username} · Ver perfil</div>
      </div>

      <ArrowRight size={14} />
    </Link>
  );
}
