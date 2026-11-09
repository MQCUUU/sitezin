import "@/styles/features/screen-kit.css";
import Link from "next/link";
import { Button } from "@/components/ui/Button";

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
      <div className="sk-empty">
        <h2>Você ainda não escolheu seus serviços de streaming</h2>
        <p>Escolha onde você assiste para ver só o que está disponível para você.</p>
        <div className="sk-chips">
          <Link className="btn primary" href="/settings?tab=general">
            Escolher meus serviços
          </Link>
          <Button variant="ghost" type="button" onClick={onClearFilters}>
            Limpar filtros
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="sk-empty">
      <h2>Nenhum título com estes filtros</h2>
      {hasActiveFilters ? (
        <>
          <p>Tente tirar um ou dois filtros, ou limpe todos.</p>
          <Button type="button" onClick={onClearFilters}>
            Limpar filtros
          </Button>
        </>
      ) : (
        <p>Tente outra combinação de tipo e ordem.</p>
      )}
    </div>
  );
}
