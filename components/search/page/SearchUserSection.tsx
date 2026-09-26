import Link from "next/link";
import { UserRound } from "lucide-react";

import type { UserSearchResult } from "./types";

export type SearchUserSectionProps = {
  users: UserSearchResult[];
};

export function SearchUserSection({ users }: SearchUserSectionProps) {
  if (users.length === 0) return null;

  return (
    <section className="search-users-section" aria-labelledby="search-users-title">
      <div className="section-title-row">
        <h2 id="search-users-title">Usuários</h2>
        <span className="muted">{users.length} encontrados</span>
      </div>

      <div className="search-users-grid">
        {users.map((user) => (
          <Link className="search-user-card panel" href={`/u/${user.username}`} key={user.id}>
            <div className="search-user-avatar">
              {user.avatar_url ? (
                <img
                  loading="lazy"
                  decoding="async"
                  src={user.avatar_url}
                  alt={user.display_name || user.username}
                />
              ) : (
                <UserRound size={24} />
              )}
            </div>
            <div className="search-user-copy">
              <strong>{user.display_name || user.username}</strong>
              <span>@{user.username}</span>
            </div>
            <span className="search-user-open">Ver perfil</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
