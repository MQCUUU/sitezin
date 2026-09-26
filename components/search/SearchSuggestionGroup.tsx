import type { ReactNode } from "react";

export type SearchSuggestionGroupProps = {
  icon: ReactNode;
  label: string;
  children: ReactNode;
};

/** Shared label+icon header for a suggestion group (Usuários/Personagem/
 * Pessoas/Franquias/Títulos) — the one piece of markup that was
 * byte-for-byte repeated 5 times in the pre-B1 component. */
export function SearchSuggestionGroup({ icon, label, children }: SearchSuggestionGroupProps) {
  return (
    <>
      <div className="search-group-label">
        {icon}
        {label}
      </div>
      {children}
    </>
  );
}
