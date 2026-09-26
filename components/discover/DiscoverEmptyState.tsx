import { Filter, RotateCcw } from "lucide-react";

export type DiscoverEmptyStateProps = {
  hasActiveFilters: boolean;
  onClearFilters: () => void;
};

/**
 * Distinct from `DiscoverErrorState`: this means the request succeeded and
 * genuinely found nothing for the current combination, not that something
 * broke. When filters are the likely cause, offers the one action that
 * actually helps instead of a dead end.
 */
export function DiscoverEmptyState({
  hasActiveFilters,
  onClearFilters,
}: DiscoverEmptyStateProps) {
  return (
    <div className="empty mc-discover-empty">
      <Filter size={28} />
      <span>Nenhum título encontrado com esses filtros.</span>

      {hasActiveFilters && (
        <>
          <p className="muted">Tente reduzir ou limpar os filtros ativos.</p>
          <button type="button" className="btn" onClick={onClearFilters}>
            <RotateCcw size={15} />
            Limpar filtros
          </button>
        </>
      )}
    </div>
  );
}
