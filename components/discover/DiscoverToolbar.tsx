import "@/styles/features/discover.css";
import "@/styles/features/screen-kit.css";
import { SlidersHorizontal } from "lucide-react";

// Fase 4: botão leve; o PickForMe (grande) é baixado só ao abrir.
import { PickForMeLauncher } from "@/components/PickForMeLauncher";
import type { DiscoverParams } from "@/lib/discover/params";

import { DiscoverSortControl } from "./DiscoverSortControl";
import { DiscoverTabs } from "./DiscoverTabs";
import { Button } from "@/components/ui/Button";

export type DiscoverToolbarProps = {
  params: DiscoverParams;
  activeFilters: number;
  showFilters: boolean;
  onChange: (patch: Partial<DiscoverParams>) => void;
  onToggleFilters: () => void;
};

/**
 * Fase 4b: abas de tipo numa linha; abaixo, a ordenação em fichinhas e, à
 * direita, os dois controles neutros (Escolha pra mim, Filtros). Nenhum deles
 * usa a cor de destaque — o número de filtros ativos é texto.
 */
export function DiscoverToolbar({
  params,
  activeFilters,
  showFilters,
  onChange,
  onToggleFilters,
}: DiscoverToolbarProps) {
  return (
    <section className="dc-toolbar" aria-label="Tipo, ordem e filtros">
      <DiscoverTabs value={params.type} onChange={(type) => onChange({ type })} />

      <div className="sk-bar">
        <DiscoverSortControl value={params.sort} onChange={(sort) => onChange({ sort })} />

        <div className="sk-bar-end">
          <PickForMeLauncher
            className="sk-btn"
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

          <Button
            type="button"
            className="sk-btn"
            aria-expanded={showFilters}
            aria-label={activeFilters > 0 ? `Filtros, ${activeFilters} ${activeFilters === 1 ? "ativo" : "ativos"}` : undefined}
            onClick={onToggleFilters}
          >
            <SlidersHorizontal size={16} aria-hidden="true" />
            Filtros
            {activeFilters > 0 && (
              <span className="sk-btn-count" aria-hidden="true">{activeFilters}</span>
            )}
          </Button>
        </div>
      </div>
    </section>
  );
}
