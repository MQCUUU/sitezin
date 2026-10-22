import { AlertTriangle, Sparkles } from "lucide-react";

import type { SearchErrorKind } from "./types";

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
  kind?: SearchErrorKind;
};

/*
 * Fase 5 — cada falha com a sua causa (antes, tudo virava "Verifique sua
 * conexão", inclusive o limite de buscas, HTTP 429).
 */
const ERROR_COPY: Record<SearchErrorKind, { title: string; hint: string }> = {
  "rate-limit": {
    title: "Muitas buscas em pouco tempo",
    hint: "Aguarde um momento e tente novamente.",
  },
  network: {
    title: "Não foi possível buscar agora",
    hint: "Verifique sua conexão e tente novamente.",
  },
  unavailable: {
    title: "Não foi possível buscar agora",
    hint: "A busca está indisponível no momento. Tente novamente em instantes.",
  },
};

/**
 * New (B1): before this, a failed request looked identical to
 * "no results" — both just showed the smart-empty prompt. This makes a
 * failed fetch visually distinct instead of silently pretending nothing
 * was found.
 */
export function SearchErrorState({ listboxId, kind = "unavailable" }: SearchErrorStateProps) {
  const copy = ERROR_COPY[kind];

  return (
    <div className="results" role="listbox" id={listboxId}>
      <div className="search-smart-empty" role="option" aria-selected="false">
        <span className="search-smart-empty-icon">
          <AlertTriangle size={16} />
        </span>

        <span>
          <strong>{copy.title}</strong>
          <small>{copy.hint}</small>
        </span>
      </div>
    </div>
  );
}
