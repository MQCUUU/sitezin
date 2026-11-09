import "@/styles/features/search-page.css";
import "@/styles/features/screen-kit.css";
import Link from "next/link";
import { UserRound } from "lucide-react";

import type { UserSearchResult } from "./types";

export type SearchUserSectionProps = {
  users: UserSearchResult[];
};

export function SearchUserSection({ users }: SearchUserSectionProps) {
  if (users.length === 0) return null;

  return (
    <section className="sk-section sp-section" aria-labelledby="search-users-title">
      <div className="sk-section-head">
        <h2 id="search-users-title">
          Pessoas no MyCatalog <span className="sp-count">{users.length}</span>
        </h2>
      </div>

      <div className="sp-users">
        {users.map((user) => (
          <Link className="sp-user" href={`/u/${user.username}`} key={user.username}>
            <div className="sp-user-avatar">
              {user.avatar_url ? (
                <img
                  loading="lazy"
                  decoding="async"
                  src={user.avatar_url}
                  alt=""
                />
              ) : (
                <UserRound size={22} />
              )}
            </div>
            <div className="sp-user-copy">
              <strong>{user.display_name || user.username}</strong>
              <span>@{user.username}</span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
