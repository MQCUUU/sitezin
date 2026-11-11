"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import { Film, RotateCcw, Shuffle, Sparkles, Tv, WandSparkles } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { MultiPicker } from "@/components/pick-for-me/parts";
import { COUNTRIES, DECADES, type FilterMeta, type MediaType, type PickMode } from "@/components/pick-for-me/shared";

/*
 * Passo 1 do "Escolher pra mim": filtros. Saiu de components/PickForMe.tsx
 * (o JSX é o mesmo); o estado continua lá e chega por props tipadas —
 * valores do formulário, setters e as duas ações (limpar, sortear).
 */

type Setter<T> = Dispatch<SetStateAction<T>>;

export type PickFilterValues = {
  type: "any" | MediaType;
  mode: PickMode;
  genres: string[];
  genreMatch: "all" | "any";
  providers: string[];
  country: string;
  decade: string;
  minRating: string;
  duration: string;
  excludeWatched: boolean;
  excludeLibrary: boolean;
};

export type PickFilterSetters = {
  setType: Setter<"any" | MediaType>;
  setMode: Setter<PickMode>;
  setGenres: Setter<string[]>;
  setGenreMatch: Setter<"all" | "any">;
  setProviders: Setter<string[]>;
  setCountry: Setter<string>;
  setDecade: Setter<string>;
  setMinRating: Setter<string>;
  setDuration: Setter<string>;
  setExcludeWatched: Setter<boolean>;
  setExcludeLibrary: Setter<boolean>;
};

export type PickFilterStepProps = {
  values: PickFilterValues;
  setters: PickFilterSetters;
  filters: FilterMeta;
  loadingFilters: boolean;
  error: string;
  activeFilters: number;
  inheritedSummary: string[];
  reset: () => void;
  pick: (surprise?: boolean) => void;
};

export function PickFilterStep({
  values,
  setters,
  filters,
  loadingFilters,
  error,
  activeFilters,
  inheritedSummary,
  reset,
  pick,
}: PickFilterStepProps) {
  const { type, mode, genres, genreMatch, providers, country, decade, minRating, duration, excludeWatched, excludeLibrary } = values;
  const {
    setType,
    setMode,
    setGenres,
    setGenreMatch,
    setProviders,
    setCountry,
    setDecade,
    setMinRating,
    setDuration,
    setExcludeWatched,
    setExcludeLibrary,
  } = setters;

  const [moreOpen, setMoreOpen] = useState(false);

  return (
      <>
        <div className="pick-heading">
          <div>
            <h2>
              O que vamos assistir?
            </h2>

            <p>
              Você escolhe o clima. O MyCatalog elimina opções ruins e sorteia entre as melhores candidatas.
            </p>

            {inheritedSummary.length > 0 ? (
              <p className="pick-inherited" role="note">
                Usando seus filtros de Descobrir: <strong>{inheritedSummary.join(", ")}</strong>. Ajuste abaixo se quiser.
              </p>
            ) : null}
          </div>
        </div>

        <div className="pick-type-tabs">
          <button
            type="button"
            className={
              type ===
                "any"
                ? "active"
                : ""
            }
            onClick={() =>
              setType(
                "any"
              )
            }
          >
            <Sparkles
              size={16}
            />
            Qualquer
          </button>

          <button
            type="button"
            className={
              type ===
                "movie"
                ? "active"
                : ""
            }
            onClick={() =>
              setType(
                "movie"
              )
            }
          >
            <Film
              size={16}
            />
            Filme
          </button>

          <button
            type="button"
            className={
              type ===
                "tv"
                ? "active"
                : ""
            }
            onClick={() =>
              setType(
                "tv"
              )
            }
          >
            <Tv
              size={16}
            />
            Série
          </button>
        </div>

        <div className="pick-duration">
          <div className="pick-mode-title" id="pick-duration-title">
            Quanto tempo você tem
          </div>

          <div className="pick-choice-row" role="radiogroup" aria-labelledby="pick-duration-title">
            {[
              ["any", "Qualquer"],
              ["short", "Curto"],
              ["medium", "Médio"],
              ["long", "Longo"],
            ].map(([value, label]) => (
              <button key={value} type="button" role="radio" aria-checked={duration === value} className={duration === value ? "active" : ""} onClick={() => setDuration(value)}>
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="pick-mode-title">
          Estilo da escolha
        </div>

        <div className="pick-mode-grid">
          <button
            type="button"
            className={
              mode ===
                "safe"
                ? "active"
                : ""
            }
            onClick={() =>
              setMode(
                "safe"
              )
            }
          >
            <strong>
              Seguro
            </strong>

            <span>
              Mais confiável e bem consolidado
            </span>
          </button>

          <button
            type="button"
            className={
              mode ===
                "popular"
                ? "active"
                : ""
            }
            onClick={() =>
              setMode(
                "popular"
              )
            }
          >
            <strong>
              Popular
            </strong>

            <span>
              Favorece títulos conhecidos
            </span>
          </button>

          <button
            type="button"
            className={
              mode ===
                "discover"
                ? "active"
                : ""
            }
            onClick={() =>
              setMode(
                "discover"
              )
            }
          >
            <strong>
              Descobrir
            </strong>

            <span>
              Sai um pouco do óbvio sem baixar a qualidade
            </span>
          </button>

          <button
            type="button"
            className={
              mode ===
                "gems"
                ? "active"
                : ""
            }
            onClick={() =>
              setMode(
                "gems"
              )
            }
          >
            <strong>
              Joias escondidas
            </strong>

            <span>
              Menos populares, mas bem avaliados
            </span>
          </button>
        </div>

        <button type="button" className="pick-more-toggle" aria-expanded={moreOpen} aria-controls="pick-more" onClick={() => setMoreOpen((v) => !v)}>
          {moreOpen ? "Menos filtros" : "Mais filtros"}
          {activeFilters > 0 ? ` (${activeFilters})` : ""}
        </button>

        <div className="pick-more" id="pick-more" hidden={!moreOpen}>
        <div className="pick-form-grid">
          <div className="pick-field">
            <span>
              Gêneros
            </span>

            <MultiPicker
              disabled={
                loadingFilters
              }
              placeholder="Qualquer gênero"
              searchPlaceholder="Buscar gênero..."
              selected={
                genres
              }
              onChange={
                setGenres
              }
              options={
                filters.genres.map(
                  (
                    item
                  ) => ({
                    value:
                      item.key,

                    label:
                      item.name,

                    badge:
                      item.special ===
                      "teen"
                        ? "SMART"
                        : undefined,
                  })
                )
              }
            />

            {genres.length > 1 && (
              <div
                className="pick-genre-match"
                role="group"
                aria-label="Como combinar os gêneros"
              >
                <button
                  type="button"
                  className={`chip${
                    genreMatch === "all" ? " active" : ""
                  }`}
                  aria-pressed={genreMatch === "all"}
                  onClick={() => setGenreMatch("all")}
                >
                  Todos os gêneros
                </button>

                <button
                  type="button"
                  className={`chip${
                    genreMatch === "any" ? " active" : ""
                  }`}
                  aria-pressed={genreMatch === "any"}
                  onClick={() => setGenreMatch("any")}
                >
                  Qualquer um
                </button>

                <p className="pick-genre-match-hint">
                  {genreMatch === "all"
                    ? "O título precisa ter todos os gêneros escolhidos."
                    : "Basta o título ter um dos gêneros escolhidos."}
                </p>
              </div>
            )}
          </div>

          <div className="pick-field">
            <span>
              Onde assistir
            </span>

            <MultiPicker
              disabled={
                loadingFilters
              }
              placeholder="Qualquer streaming"
              searchPlaceholder="Buscar streaming..."
              selected={
                providers
              }
              onChange={
                setProviders
              }
              options={
                filters.providers.map(
                  (
                    item
                  ) => ({
                    value:
                      String(
                        item.provider_id
                      ),

                    label:
                      item.provider_name,

                    logo:
                      item.logo_path ||
                      null,
                  })
                )
              }
            />
          </div>

          <label>
            <span>
              Nota mínima
            </span>

            <select
              value={
                minRating
              }
              onChange={(
                event
              ) =>
                setMinRating(
                  event.target
                    .value
                )
              }
            >
              <option value="5">
                5+
              </option>

              <option value="6">
                6+
              </option>

              <option value="6.5">
                6.5+
              </option>

              <option value="7">
                7+
              </option>

              <option value="7.5">
                7.5+
              </option>

              <option value="8">
                8+
              </option>

              <option value="9">
                9+
              </option>
            </select>
          </label>

          <label>
            <span>
              País
            </span>

            <select
              value={
                country
              }
              onChange={(
                event
              ) =>
                setCountry(
                  event.target
                    .value
                )
              }
            >
              {COUNTRIES.map(
                (
                  [
                    value,
                    label,
                  ]
                ) => (
                  <option
                    key={
                      value ||
                      "all"
                    }
                    value={
                      value
                    }
                  >
                    {
                      label
                    }
                  </option>
                )
              )}
            </select>
          </label>

          <label>
            <span>
              Época
            </span>

            <select
              value={
                decade
              }
              onChange={(
                event
              ) =>
                setDecade(
                  event.target
                    .value
                )
              }
            >
              {DECADES.map(
                (
                  [
                    value,
                    label,
                  ]
                ) => (
                  <option
                    key={
                      value ||
                      "all"
                    }
                    value={
                      value
                    }
                  >
                    {
                      label
                    }
                  </option>
                )
              )}
            </select>
          </label>
        </div>

        <div className="pick-toggle-grid">
          <button
            type="button"
            className={
              excludeWatched
                ? "active"
                : ""
            }
            onClick={() =>
              setExcludeWatched(
                (
                  value
                ) =>
                  !value
              )
            }
          >
            <span>
              {excludeWatched
                ? "✓"
                : ""}
            </span>

            <div>
              <strong>
                Não repetir assistidos
              </strong>

              <small>
                Evita coisas que você já concluiu
              </small>
            </div>
          </button>

          <button
            type="button"
            className={
              excludeLibrary
                ? "active"
                : ""
            }
            onClick={() =>
              setExcludeLibrary(
                (
                  value
                ) =>
                  !value
              )
            }
          >
            <span>
              {excludeLibrary
                ? "✓"
                : ""}
            </span>

            <div>
              <strong>
                Só fora da biblioteca
              </strong>

              <small>
                A escolha vira uma descoberta nova
              </small>
            </div>
          </button>
        </div>
        </div>

        {error && (
          <div className="pick-error">
            {
              error
            }
          </div>
        )}

        <div className="pick-filter-footer">
          <button
            type="button"
            className="pick-reset"
            onClick={
              reset
            }
          >
            <RotateCcw
              size={14}
            />

            Restaurar
          </button>

          <span>
            {activeFilters}{" "}
            {activeFilters ===
            1
              ? "filtro ativo"
              : "filtros ativos"}
          </span>
        </div>

        <p className="pick-surprise-hint muted">
          “Surpreenda-me” ignora gênero, streaming, país, época e duração; mantém tipo, nota mínima e exclusões.
        </p>

        <div className="pick-main-actions">
          <Button
            type="button"
            className="pick-surprise"
            onClick={() =>
              pick(
                true
              )
            }
          >
            <WandSparkles
              size={18}
            />

            Surpreenda-me
          </Button>

          <Button variant="primary"
            type="button"
            className="pick-go"
            onClick={() =>
              pick(
                false
              )
            }
          >
            <Shuffle
              size={18}
            />

            Escolher pra mim
          </Button>
        </div>
      </>
  );
}
