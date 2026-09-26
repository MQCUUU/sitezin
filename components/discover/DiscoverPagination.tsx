import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { buildPages } from "./types";

const COMPACT_QUERY = "(max-width: 480px)";

/**
 * At narrow widths the desktop sibling count (2) can render up to 11
 * buttons (BUG-B4.1-03: e.g. page 50 of 741 wrapped to 3 rows at 390px).
 * Dropping to 1 sibling keeps first/last + prev/current/next visible on a
 * single line without shrinking touch targets or hiding the current page.
 */
function useIsCompactPagination() {
  const [isCompact, setIsCompact] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(COMPACT_QUERY);
    setIsCompact(mql.matches);
    const listener = (event: MediaQueryListEvent) => setIsCompact(event.matches);
    mql.addEventListener("change", listener);
    return () => mql.removeEventListener("change", listener);
  }, []);

  return isCompact;
}

export type DiscoverPaginationProps = {
  page: number;
  totalPages: number;
  onGoToPage: (page: number) => void;
};

export function DiscoverPagination({
  page,
  totalPages,
  onGoToPage,
}: DiscoverPaginationProps) {
  const isCompact = useIsCompactPagination();
  const pagination = buildPages(page, totalPages, isCompact ? 0 : 2);

  return (
    <section className="section discover-pagination-wrap mc-discover-pagination-wrap">
      <div className="discover-page-info">
        Página <strong>{page}</strong> de{" "}
        <strong>{totalPages.toLocaleString("pt-BR")}</strong>
      </div>

      <nav className="discover-pagination mc-discover-pagination" aria-label="Paginação">
        <button
          type="button"
          className="discover-page-btn mc-discover-page-btn"
          disabled={page <= 1}
          onClick={() => onGoToPage(page - 1)}
          title="Página anterior"
          aria-label="Página anterior"
        >
          <ChevronLeft size={17} />
        </button>

        {pagination.map((value) =>
          typeof value === "number" ? (
            <button
              type="button"
              key={value}
              className={
                "discover-page-btn mc-discover-page-btn" +
                (value === page ? " active mc-discover-page-btn--active" : "")
              }
              aria-current={value === page ? "page" : undefined}
              onClick={() => onGoToPage(value)}
            >
              {value.toLocaleString("pt-BR")}
            </button>
          ) : (
            <span key={value} className="discover-page-ellipsis mc-discover-page-ellipsis">
              …
            </span>
          )
        )}

        <button
          type="button"
          className="discover-page-btn mc-discover-page-btn"
          disabled={page >= totalPages}
          onClick={() => onGoToPage(page + 1)}
          title="Próxima página"
          aria-label="Próxima página"
        >
          <ChevronRight size={17} />
        </button>
      </nav>
    </section>
  );
}
