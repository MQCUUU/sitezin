import "@/styles/features/screen-kit.css";

import { SEARCH_ERROR_COPY } from "../errorCopy";
import type { SearchErrorKind } from "../types";
import { Button } from "@/components/ui/Button";

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
    <div className="sk-empty" role="alert">
      <h2>{copy.title}.</h2>
      <p>{copy.hint}</p>
      <Button type="button" onClick={onRetry}>
        Tentar de novo
      </Button>
    </div>
  );
}
