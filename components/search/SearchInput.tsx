import { forwardRef } from "react";
import { Search as SearchIcon, Loader2 } from "lucide-react";

export type SearchInputProps = {
  q: string;
  onChange: (value: string) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  loading: boolean;
  expanded: boolean;
  listboxId: string;
  activeDescendantId?: string;
};

/**
 * Combobox semantics (B0 gap): role/aria-expanded/aria-autocomplete/
 * aria-controls/aria-activedescendant on the input itself, so a screen
 * reader announces the suggestion list and the currently highlighted
 * option — none of that existed before B1.
 */
export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(function SearchInput(
  { q, onChange, onKeyDown, loading, expanded, listboxId, activeDescendantId },
  ref
) {
  return (
    <>
      <SearchIcon size={19} />

      <input
        ref={ref}
        value={q}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Filme, série, ator ou @usuário..."
        aria-label="Pesquisa universal"
        autoComplete="off"
        role="combobox"
        aria-expanded={expanded}
        aria-autocomplete="list"
        aria-controls={listboxId}
        aria-activedescendant={activeDescendantId}
      />

      {loading && (
        <Loader2
          size={17}
          className="search-loading"
          style={{ animation: "spin 1s linear infinite" }}
        />
      )}
    </>
  );
});
