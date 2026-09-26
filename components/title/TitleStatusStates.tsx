import { Search } from "@/components/Search";

export function TitleLoadingState() {
  return (
    <>
      <div className="topbar">
        <Search />
      </div>

      <div className="empty">
        Carregando título...
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

      <div className="empty">
        <p>{message}</p>
        <button className="btn" onClick={onRetry}>
          Tentar novamente
        </button>
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

      <div className="empty">Título não encontrado.</div>
    </>
  );
}
