import "@/styles/features/screen-kit.css";
import { Button } from "@/components/ui/Button";

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
    <div className="sk-empty" role="alert">
      <h2>Não foi possível carregar os títulos agora</h2>
      <p>Verifique sua conexão e tente de novo.</p>
      <Button type="button" onClick={onRetry}>
        Tentar de novo
      </Button>
    </div>
  );
}
