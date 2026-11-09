import "@/styles/features/discover.css";
import "@/styles/features/screen-kit.css";

export type DiscoverHeaderProps = {
  totalLabel: string | null;
};

/**
 * Fase 4b: título grande + frase (sem rótulo em caixa alta); a contagem é
 * texto à direita, não uma pílula.
 */
export function DiscoverHeader({ totalLabel }: DiscoverHeaderProps) {
  return (
    <header className="sk-head">
      <div className="sk-head-text">
        <h1>Descobrir</h1>
        <p>Encontre o próximo filme ou série com filtros do seu jeito.</p>
      </div>

      {totalLabel ? (
        <p className="sk-head-aside" aria-live="polite">
          <strong>{totalLabel}</strong> títulos
        </p>
      ) : null}
    </header>
  );
}
