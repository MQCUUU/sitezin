import { X } from "lucide-react";

import { COUNTRIES, type FilterResponse } from "./types";
import type { DiscoverParams } from "@/lib/discover/params";

export type DiscoverActiveFiltersProps = {
  params: DiscoverParams;
  filters: FilterResponse;
  onRemove: (patch: Partial<DiscoverParams>, index: number) => void;
  onClearAll: () => void;
};

type Chip = { key: string; label: string; patch: Partial<DiscoverParams> };

function buildChips(params: DiscoverParams, filters: FilterResponse): Chip[] {
  const chips: Chip[] = [];

  if (params.genre) {
    const name = filters.genres.find(
      (item) => String(item.id) === params.genre
    )?.name;
    chips.push({ key: "genre", label: name || `Gênero ${params.genre}`, patch: { genre: "" } });
  }

  if (params.year) {
    chips.push({ key: "year", label: params.year, patch: { year: "" } });
  }

  if (params.rating) {
    chips.push({ key: "rating", label: `Nota ${params.rating}+`, patch: { rating: "" } });
  }

  if (params.country) {
    const name = COUNTRIES.find(([code]) => code === params.country)?.[1];
    chips.push({ key: "country", label: name || params.country, patch: { country: "" } });
  }

  if (params.provider) {
    const name = params.provider === "mine" ? "Nos meus serviços" : filters.providers.find(
      (item) => String(item.provider_id) === params.provider
    )?.provider_name;
    chips.push({
      key: "provider",
      label: name || `Streaming ${params.provider}`,
      patch: { provider: "" },
    });
  }

  if (params.hideWatched) {
    chips.push({ key: "hideWatched", label: "Ocultar assistidos", patch: { hideWatched: false } });
  }

  if (params.onlyNew) {
    chips.push({ key: "onlyNew", label: "Só não adicionados", patch: { onlyNew: false } });
  }

  return chips;
}

/**
 * Visible, removable summary of everything currently filtering the grid.
 * Each chip removes only its own filter (patches just that field back to
 * its empty/false default) — "Limpar tudo" is the only control that resets
 * every field at once, so it stays unambiguous which action does what.
 */
export function DiscoverActiveFilters({
  params,
  filters,
  onRemove,
  onClearAll,
}: DiscoverActiveFiltersProps) {
  const chips = buildChips(params, filters);

  if (chips.length === 0) return null;

  return (
    <div className="mc-discover-active-filters" role="group" aria-label="Filtros ativos">
      {chips.map((chip, index) => (
        <button
          key={chip.key}
          type="button"
          className="mc-discover-chip"
          onClick={() => onRemove(chip.patch, index)}
        >
          {chip.label}
          <X size={12} />
        </button>
      ))}

      {chips.length > 1 && (
        <button
          type="button"
          className="mc-discover-chip mc-discover-chip--clear"
          onClick={onClearAll}
        >
          Limpar tudo
        </button>
      )}
    </div>
  );
}
