export type DiscoverHeaderProps = {
  totalLabel: string | null;
};

/**
 * Discover's entry point. Kept small and control-forward on purpose — this
 * is a tool for exploring the catalog, not the Home hero, so hierarchy is
 * eyebrow -> title -> one-line description -> a contextual result count.
 */
export function DiscoverHeader({ totalLabel }: DiscoverHeaderProps) {
  return (
    <section className="section discover-head mc-discover-head">
      <div>
        <div className="eyebrow">Explore o catálogo</div>
        <h1>Descobrir</h1>
        <p className="muted">
          Encontre o próximo filme ou série usando filtros do seu jeito.
        </p>
      </div>

      <div className="discover-total mc-discover-total">
        {totalLabel ? (
          <>
            <strong>{totalLabel}</strong>
            <span>títulos encontrados</span>
          </>
        ) : null}
      </div>
    </section>
  );
}
