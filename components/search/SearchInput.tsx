import "@/styles/features/search-suggest.css";
import { forwardRef, useSyncExternalStore } from "react";
import { Search as SearchIcon, Loader2 } from "lucide-react";

export type SearchInputProps = {
  q: string;
  onChange: (value: string) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  loading: boolean;
  expanded: boolean;
  listboxId: string;
  /**
   * B3.7 (POLISH — ARIA idle): true whenever `listboxId` actually points
   * at an element with `role="listbox"` — true for results/no-results/
   * error (all three render one, even "no-results" being a single
   * "Buscar X" option), false only for the idle state, where the popup is
   * Recent Searches — a plain auxiliary region of `button`s, not a
   * listbox. `aria-controls` is omitted rather than pointing
   * `aria-autocomplete="list"` at a container that isn't one.
   * `aria-expanded` still reflects any open popup either way.
   */
  hasListbox: boolean;
  activeDescendantId?: string;
};

/*
 * Fase 3: em telas estreitas o campo tem ~120–200px e o texto longo ficava
 * cortado ("Título, pessoa, pers…"). Lá o placeholder vira "Buscar…"; o nome
 * acessível ("Pesquisa universal") e o ícone de lupa continuam dizendo o que é.
 */
const NARROW_QUERY = "(max-width: 480px)";

function subscribeNarrow(onChange: () => void) {
  const media = window.matchMedia(NARROW_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

/**
 * Combobox semantics (B0 gap): role/aria-expanded/aria-autocomplete/
 * aria-controls/aria-activedescendant on the input itself, so a screen
 * reader announces the suggestion list and the currently highlighted
 * option — none of that existed before B1.
 */
export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(function SearchInput(
  { q, onChange, onKeyDown, loading, expanded, listboxId, hasListbox, activeDescendantId },
  ref
) {
  const narrow = useSyncExternalStore(subscribeNarrow, () => window.matchMedia(NARROW_QUERY).matches, () => false);

  return (
    <>
      <SearchIcon size={18} />

      <input
        ref={ref}
        value={q}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder={narrow ? "Buscar…" : "Título, pessoa, personagem ou @usuário..."}
        aria-label="Pesquisa universal"
        autoComplete="off"
        role="combobox"
        aria-expanded={expanded}
        aria-autocomplete="list"
        aria-controls={hasListbox ? listboxId : undefined}
        aria-activedescendant={activeDescendantId}
      />

      {loading && (
        <Loader2
          size={18}
          className="search-loading"
          style={{ animation: "spin 1s linear infinite" }}
        />
      )}
    </>
  );
});
