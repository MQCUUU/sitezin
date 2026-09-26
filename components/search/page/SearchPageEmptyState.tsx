import Link from "next/link";
import { Filter } from "lucide-react";

export type SearchPageEmptyStateProps = {
  query: string;
};

/** Distinct from idle (no query) and error (request failed) — this means
 * the search ran and genuinely found nothing for this query. */
export function SearchPageEmptyState({ query }: SearchPageEmptyStateProps) {
  return (
    <div className="empty mc-discover-empty">
      <Filter size={28} />
      <span>Nenhum resultado para “{query}”.</span>
      <p className="muted">Revise a grafia ou tente um termo mais genérico.</p>
      <Link href="/discover" className="btn">
        Explorar o catálogo
      </Link>
    </div>
  );
}
