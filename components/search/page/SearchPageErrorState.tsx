import { AlertTriangle, RotateCcw } from "lucide-react";

export type SearchPageErrorStateProps = {
  onRetry: () => void;
};

/**
 * B3 §14: the page's fetch previously had no distinct failure state — an
 * error just left stale/empty `results`, indistinguishable from "no
 * results". No technical detail shown; console still has it.
 */
export function SearchPageErrorState({ onRetry }: SearchPageErrorStateProps) {
  return (
    <div className="empty mc-discover-empty mc-discover-empty--error" role="alert">
      <AlertTriangle size={28} />
      <span>Não foi possível buscar agora.</span>
      <p className="muted">Verifique sua conexão e tente novamente.</p>
      <button type="button" className="btn" onClick={onRetry}>
        <RotateCcw size={15} />
        Tentar novamente
      </button>
    </div>
  );
}
