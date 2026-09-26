import { SlidersHorizontal } from "lucide-react";

import { PickForMe } from "@/components/PickForMe";
import type { DiscoverParams, DiscoverSort } from "@/lib/discover/params";

import { DiscoverShortcuts } from "./DiscoverShortcuts";
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
          <PickForMe />

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

          <label className="discover-sort">
            <span>Ordenar por</span>
            <select
              value={params.sort}
              onChange={(event) => onChange({ sort: event.target.value as DiscoverSort })}
            >
              <option value="popular">Mais populares</option>
              <option value="rating">Mais bem avaliados</option>
              <option value="newest">Mais recentes</option>
            </select>
          </label>
        </div>
      </div>

      <DiscoverShortcuts params={params} onApply={onChange} />
    </section>
  );
}
