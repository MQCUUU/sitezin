import { AlertTriangle, Sparkles } from "lucide-react";

export type SearchEmptyStateProps = {
  query: string;
  listboxId: string;
  optionId: string;
};

/** "No results yet" prompt — same visual/behavioral contract as before
 * the split, now with listbox/option roles so it's reachable by the
 * combobox's aria-activedescendant wiring. */
export function SearchEmptyState({ query, listboxId, optionId }: SearchEmptyStateProps) {
  return (
    <div className="results" role="listbox" id={listboxId}>
      <button
        type="submit"
        className="search-smart-empty"
        role="option"
        id={optionId}
        aria-selected="false"
      >
        <span className="search-smart-empty-icon">
          <Sparkles size={16} />
        </span>

        <span>
          <strong>Buscar “{query}”</strong>
          <small>Procurar por título, pessoa, personagem, franquia e busca avançada.</small>
        </span>
      </button>
    </div>
  );
}

export type SearchErrorStateProps = {
  listboxId: string;
};

/**
 * New (B1): before this, a failed request looked identical to
 * "no results" — both just showed the smart-empty prompt. This makes a
 * failed fetch visually distinct instead of silently pretending nothing
 * was found.
 */
export function SearchErrorState({ listboxId }: SearchErrorStateProps) {
  return (
    <div className="results" role="listbox" id={listboxId}>
      <div className="search-smart-empty" role="option" aria-selected="false">
        <span className="search-smart-empty-icon">
          <AlertTriangle size={16} />
        </span>

        <span>
          <strong>Não foi possível buscar agora</strong>
          <small>Verifique sua conexão e tente novamente.</small>
        </span>
      </div>
    </div>
  );
}
