import { SlidersHorizontal } from "lucide-react";

// Fase 4: botão leve; o PickForMe (grande) é baixado só ao abrir.
import { PickForMeLauncher } from "@/components/PickForMeLauncher";
import type { DiscoverParams } from "@/lib/discover/params";

import { DiscoverSortControl } from "./DiscoverSortControl";
import { DiscoverTabs } from "./DiscoverTabs";

export type DiscoverToolbarProps = {
  params: DiscoverParams;
  activeFilters: number;
  showFilters: boolean;
  onChange: (patch: Partial<DiscoverParams>) => void;
  onToggleFilters: () => void;
};

export function DiscoverToolbar({
  params,
  activeFilters,
  showFilters,
  onChange,
  onToggleFilters,
}: DiscoverToolbarProps) {
  return (
    <section className="section discover-toolbar mc-discover-toolbar">
      <div className="mc-discover-toolbar-row">
        <DiscoverTabs value={params.type} onChange={(type) => onChange({ type })} />

        <div className="discover-toolbar-actions mc-discover-toolbar-actions">
          <PickForMeLauncher
            inherit={{
              type: params.type,
              genre: params.genre,
              provider: params.provider,
              country: params.country,
              rating: params.rating,
              hideWatched: params.hideWatched,
              onlyNew: params.onlyNew,
            }}
          />

          <button
            type="button"
            className={
              "btn " + (showFilters || activeFilters > 0 ? "primary" : "")
            }
            aria-expanded={showFilters}
            onClick={onToggleFilters}
          >
            <SlidersHorizontal size={16} />
            Filtros
            {activeFilters > 0 && (
              <b className="discover-filter-count">{activeFilters}</b>
            )}
          </button>
        </div>
      </div>

      <DiscoverSortControl value={params.sort} onChange={(sort) => onChange({ sort })} />
    </section>
  );
}
