import { AlertTriangle, SearchX } from "lucide-react";

import { Search } from "@/components/Search";
import { Button, Skeleton } from "@/components/ui";

/**
 * Skeleton com a MESMA forma do hero real (backdrop/poster/linhas de
 * texto/ações), em vez de um spinner genérico — evita o "salto" visual
 * entre o loading e o conteúdo real assim que `initialDetails` chega.
 */
export function TitleLoadingState() {
  return (
    <>
      <div className="topbar">
        <Search />
      </div>

      <div className="mc-title-status-page">
        <div className="mc-title-skeleton-hero">
          <Skeleton className="mc-title-skeleton-poster" />

          <div className="mc-title-skeleton-lines">
            <Skeleton width="35%" height={12} />
            <Skeleton width="70%" height={34} />
            <Skeleton width="90%" height={14} />
            <Skeleton width="55%" height={14} />

            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <Skeleton width={120} height={40} radius="var(--mc-radius-pill)" />
              <Skeleton width={100} height={40} radius="var(--mc-radius-pill)" />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export type TitleErrorStateProps = {
  message: string;
  onRetry: () => void;
};

export function TitleErrorState({ message, onRetry }: TitleErrorStateProps) {
  return (
    <>
      <div className="topbar">
        <Search />
      </div>

      <div className="mc-title-status-page">
        <div className="mc-title-error-card" role="alert">
          <AlertTriangle size={28} color="var(--mc-color-danger)" />

          <p>{message}</p>

          <Button variant="primary" onClick={onRetry}>
            Tentar novamente
          </Button>
        </div>
      </div>
    </>
  );
}

/**
 * Não deveria acontecer em uso normal — type/id inválidos já caem em
 * notFound() no Server Component (page.tsx). Isto é só uma rede de
 * segurança contra um payload inesperado, para nunca deixar a tela presa
 * sem nenhuma indicação ao usuário.
 */
export function TitleMissingState() {
  return (
    <>
      <div className="topbar">
        <Search />
      </div>

      <div className="mc-title-status-page">
        <div className="mc-title-error-card">
          <SearchX size={28} color="var(--mc-color-text-muted)" />

          <p>Título não encontrado.</p>
        </div>
      </div>
    </>
  );
}
