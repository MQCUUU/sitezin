export type SearchPageHeaderProps = {
  query: string;
  isPerson: boolean;
};

/** Compact editorial header — no hero, this is a tool (B3 §15). */
export function SearchPageHeader({ query, isPerson }: SearchPageHeaderProps) {
  return (
    <>
      <div className="eyebrow">{isPerson ? "Pessoa" : "Pesquisa"}</div>
      <h1>Resultados para “{query}”</h1>
    </>
  );
}
