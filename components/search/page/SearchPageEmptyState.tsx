import Link from "next/link";
import "@/styles/features/screen-kit.css";

export type SearchPageEmptyStateProps = {
  query: string;
};

/** Distinct from idle (no query) and error (request failed) — this means
 * the search ran and genuinely found nothing for this query. */
export function SearchPageEmptyState({ query }: SearchPageEmptyStateProps) {
  return (
    <div className="sk-empty">
      <h2>Nenhum resultado para “{query}”</h2>
      <p>Revise a grafia ou tente um termo mais genérico.</p>
      <Link href="/discover" className="btn">
        Explorar o catálogo
      </Link>
    </div>
  );
}
