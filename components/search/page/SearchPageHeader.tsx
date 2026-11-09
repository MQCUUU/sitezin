import "@/styles/features/screen-kit.css";

export type SearchPageHeaderProps = {
  query: string;
  isPerson: boolean;
};

/** Fase 4b: só o título grande; a contagem vem logo abaixo (resumo da página). */
export function SearchPageHeader({ query }: SearchPageHeaderProps) {
  return (
    <header className="sk-head sp-head">
      <div className="sk-head-text">
        <h1>Resultados para “{query}”</h1>
      </div>
    </header>
  );
}
