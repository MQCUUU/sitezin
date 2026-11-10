import "@/styles/features/screen-kit.css";

export type SearchPageHeaderProps = {
  query: string;
  isPerson: boolean;
  /** Fase 6: a busca não achou nada como digitado e usou o título mais parecido. */
  correctedTo?: string | null;
};

/** Fase 4b: só o título grande; a contagem vem logo abaixo (resumo da página). */
export function SearchPageHeader({ query, correctedTo }: SearchPageHeaderProps) {
  return (
    <header className="sk-head sp-head">
      <div className="sk-head-text">
        <h1>Resultados para “{query}”</h1>
        {correctedTo ? (
          <p>
            Nada encontrado com essa grafia. Mostrando resultados para “{correctedTo}”.
          </p>
        ) : null}
      </div>
    </header>
  );
}
