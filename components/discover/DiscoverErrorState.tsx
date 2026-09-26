import { AlertTriangle, RotateCcw } from "lucide-react";

export type DiscoverErrorStateProps = {
  onRetry: () => void;
};

/**
 * B1 had no real error state: a failed fetch just left `data` null, which
 * rendered identically to "0 results" and separately fired a toast. That
 * conflated "nothing matched" with "something broke" — same distinction
 * Search's B1 error state already draws. No technical detail is shown to
 * the user; the console still has it for debugging.
 */
export function DiscoverErrorState({ onRetry }: DiscoverErrorStateProps) {
  return (
    <div className="empty mc-discover-empty mc-discover-empty--error" role="alert">
      <AlertTriangle size={28} />
      <span>Não foi possível carregar os títulos agora.</span>
      <p className="muted">Verifique sua conexão e tente novamente.</p>
      <button type="button" className="btn" onClick={onRetry}>
        <RotateCcw size={15} />
        Tentar novamente
      </button>
    </div>
  );
}
