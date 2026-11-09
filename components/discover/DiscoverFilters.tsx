import "@/styles/features/discover.css";
import "@/styles/features/screen-kit.css";
import { motion } from "motion/react";
import { X } from "lucide-react";

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
 * Fase 4b: painel liso (sem borda, sombra nem rótulo em caixa alta). Os mesmos
 * campos de antes — 5 seletores + 2 preferências pessoais, agora fichinhas
 * com aria-pressed. Entra e sai com um fade curto (AnimatePresence na página).
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
    <motion.section
      className="sk-panel"
      id="discover-filters-panel"
      aria-label="Filtros do Descobrir"
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6, transition: { duration: 0.12 } }}
      transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
    >
      <div className="sk-panel-head">
        <h2>Filtros</h2>
        <button type="button" className="sk-close" onClick={onClose} title="Fechar filtros" aria-label="Fechar filtros">
          <X size={18} />
        </button>
      </div>

      <fieldset className="sk-fields">
        <legend className="mc-visually-hidden">Filtros de catálogo</legend>

        <label className="sk-field">
          Gênero
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

        <label className="sk-field">
          Ano
          <select value={params.year} onChange={(event) => onChange({ year: event.target.value })}>
            <option value="">Todos os anos</option>
            {years.map((itemYear) => (
              <option key={itemYear} value={itemYear}>
                {itemYear}
              </option>
            ))}
          </select>
        </label>

        <label className="sk-field">
          Nota mínima
          <select value={params.rating} onChange={(event) => onChange({ rating: event.target.value })}>
            <option value="">Qualquer nota</option>
            {[5, 6, 7, 8, 9].map((value) => (
              <option key={value} value={value}>
                {value}+
              </option>
            ))}
          </select>
        </label>

        <label className="sk-field">
          País de origem
          <select value={params.country} onChange={(event) => onChange({ country: event.target.value })}>
            <option value="">Todos os países</option>
            {COUNTRIES.map(([code, name]) => (
              <option key={code} value={code}>
                {name}
              </option>
            ))}
          </select>
        </label>

        <label className="sk-field">
          Onde assistir no Brasil
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

      <div className="sk-panel-foot">
        <fieldset className="sk-field">
          <legend>Na sua biblioteca</legend>
          <div className="sk-chips">
            <button
              type="button"
              className="sk-chip"
              aria-pressed={params.hideWatched}
              onClick={() => onChange({ hideWatched: !params.hideWatched })}
            >
              Ocultar assistidos
            </button>
            <button
              type="button"
              className="sk-chip"
              aria-pressed={params.onlyNew}
              onClick={() => onChange({ onlyNew: !params.onlyNew })}
            >
              Só títulos fora da biblioteca
            </button>
          </div>
        </fieldset>

        {activeFilters > 0 && (
          <button type="button" className="btn ghost" onClick={onClearFilters}>
            Limpar filtros
          </button>
        )}
      </div>
    </motion.section>
  );
}
