import { Check, Plus, RotateCcw, X } from "lucide-react";

import { COUNTRIES, type FilterResponse } from "./types";
import type { DiscoverParams } from "@/lib/discover/params";

export type DiscoverFiltersProps = {
  params: DiscoverParams;
  filters: FilterResponse;
  filtersLoading: boolean;
  years: number[];
  activeFilters: number;
  onChange: (patch: Partial<DiscoverParams>) => void;
  onClearFilters: () => void;
  onClose: () => void;
};

/**
 * The filter panel itself. Same underlying fields as B1 (5 selects + 2
 * personal toggles) — grouped now under labelled `fieldset`s so the
 * relationship between a group's controls is announced, and the layout
 * scales from a dense desktop grid down to a single stacked column on
 * mobile via CSS alone (no separate mobile markup to keep in sync).
 */
export function DiscoverFilters({
  params,
  filters,
  filtersLoading,
  years,
  activeFilters,
  onChange,
  onClearFilters,
  onClose,
}: DiscoverFiltersProps) {
  return (
    <section className="section">
      <div className="mc-discover-filters">
        <div className="mc-discover-filters-header">
          <div>
            <div className="eyebrow">Descoberta avançada</div>
            <h2>Filtrar títulos</h2>
          </div>

          <button type="button" className="btn ghost" onClick={onClose}>
            <X size={16} />
            Fechar
          </button>
        </div>

        <fieldset className="mc-discover-filters-grid">
          <legend className="mc-visually-hidden">Filtros de catálogo</legend>

          <label>
            <span>Gênero</span>
            <select
              value={params.genre}
              disabled={filtersLoading}
              onChange={(event) => onChange({ genre: event.target.value })}
            >
              <option value="">Todos os gêneros</option>
              {filters.genres.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Ano</span>
            <select
              value={params.year}
              onChange={(event) => onChange({ year: event.target.value })}
            >
              <option value="">Todos os anos</option>
              {years.map((itemYear) => (
                <option key={itemYear} value={itemYear}>
                  {itemYear}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Nota mínima</span>
            <select
              value={params.rating}
              onChange={(event) => onChange({ rating: event.target.value })}
            >
              <option value="">Qualquer nota</option>
              {[5, 6, 7, 8, 9].map((value) => (
                <option key={value} value={value}>
                  {value}+
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>País de origem</span>
            <select
              value={params.country}
              onChange={(event) => onChange({ country: event.target.value })}
            >
              <option value="">Todos os países</option>
              {COUNTRIES.map(([code, name]) => (
                <option key={code} value={code}>
                  {name}
                </option>
              ))}
            </select>
          </label>

          <label className="discover-provider-field mc-discover-filters-provider">
            <span>Onde assistir no Brasil</span>
            <select
              value={params.provider}
              disabled={filtersLoading}
              onChange={(event) => onChange({ provider: event.target.value })}
            >
              <option value="">Qualquer streaming</option>
              <option value="mine">Nos meus serviços</option>
              {filters.providers.map((item) => (
                <option key={item.provider_id} value={item.provider_id}>
                  {item.provider_name}
                </option>
              ))}
            </select>
          </label>
        </fieldset>

        <fieldset className="mc-discover-filters-toggles">
          <legend className="mc-visually-hidden">Preferências pessoais</legend>

          <button
            type="button"
            className={
              "mc-discover-toggle" +
              (params.hideWatched ? " mc-discover-toggle--active" : "")
            }
            aria-pressed={params.hideWatched}
            onClick={() => onChange({ hideWatched: !params.hideWatched })}
          >
            <Check size={17} />
            <div>
              <strong>Ocultar assistidos</strong>
              <span>Esconde o que você já concluiu</span>
            </div>
          </button>

          <button
            type="button"
            className={
              "mc-discover-toggle" +
              (params.onlyNew ? " mc-discover-toggle--active" : "")
            }
            aria-pressed={params.onlyNew}
            onClick={() => onChange({ onlyNew: !params.onlyNew })}
          >
            <Plus size={17} />
            <div>
              <strong>Só não adicionados</strong>
              <span>Mostra apenas títulos fora da biblioteca</span>
            </div>
          </button>
        </fieldset>

        {activeFilters > 0 && (
          <div className="mc-discover-filters-footer">
            <button
              type="button"
              className="btn"
              onClick={onClearFilters}
            >
              <RotateCcw size={15} />
              Limpar filtros
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
