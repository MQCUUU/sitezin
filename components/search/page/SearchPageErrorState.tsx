import { AlertTriangle, RotateCcw } from "lucide-react";

import { SEARCH_ERROR_COPY } from "../errorCopy";
import type { SearchErrorKind } from "../types";

export type SearchPageErrorStateProps = {
  onRetry: () => void;
  /** Fase 6: a causa (limite, rede, servidor, pedido inválido) — antes, sempre "Verifique sua conexão". */
  kind?: SearchErrorKind;
};

/**
 * B3 §14: the page's fetch previously had no distinct failure state — an
 * error just left stale/empty `results`, indistinguishable from "no
 * results". No technical detail shown; console still has it.
 */
export function SearchPageErrorState({ onRetry, kind = "unavailable" }: SearchPageErrorStateProps) {
  const copy = SEARCH_ERROR_COPY[kind];

  return (
    <div className="empty mc-discover-empty mc-discover-empty--error" role="alert">
      <AlertTriangle size={28} />
      <span>{copy.title}.</span>
      <p className="muted">{copy.hint}</p>
      <button type="button" className="btn" onClick={onRetry}>
        <RotateCcw size={16} />
        Tentar novamente
      </button>
    </div>
  );
}
