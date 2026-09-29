import Link from "next/link";
import { Filter, RotateCcw, Tv } from "lucide-react";

export type DiscoverEmptyStateProps = {
  hasActiveFilters: boolean;
  onClearFilters: () => void;
  /** V2.1-E: "Nos meus serviços" ativo, mas o usuário ainda não escolheu nenhum serviço. */
  needsStreamingSetup?: boolean;
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
  needsStreamingSetup = false,
}: DiscoverEmptyStateProps) {
  if (needsStreamingSetup) {
    return (
      <div className="empty mc-discover-empty">
        <Tv size={28} />
        <span>Você ainda não escolheu seus serviços de streaming.</span>
        <p className="muted">
          Escolha onde você assiste para ver só o que está disponível para você.
        </p>
        <Link className="btn primary" href="/settings?tab=general">
          Escolher meus serviços
        </Link>
        <button type="button" className="btn" onClick={onClearFilters}>
          <RotateCcw size={15} />
          Limpar filtros
        </button>
      </div>
    );
  }

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
