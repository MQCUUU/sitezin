import "@/styles/features/title-meta.css";
import { Star } from "lucide-react";

type Fact = string | null | undefined | false;

/**
 * Fase 4 — ficha do título, cada dado no seu lugar (antes ia tudo numa frase
 * e o ano e a nota se perdiam):
 *  - 1ª linha: tipo e ano em negrito + a nota do TMDB com a estrela;
 *  - 2ª linha: gêneros, duração/temporadas, situação e idioma em fichinhas
 *    discretas (fundo suave, sem borda), que quebram de linha sem sobras.
 */
export function TitleMeta({
  lead,
  tags = [],
  rating,
  votes,
  className,
}: {
  lead: Fact[];
  tags?: Fact[];
  /** Média do TMDB (0–10); só aparece com votos. */
  rating?: number | null;
  votes?: number | null;
  className?: string;
}) {
  const leadItems = lead.filter((item): item is string => Boolean(item));
  const tagItems = tags.filter((item): item is string => Boolean(item));
  const showRating = rating !== null && rating !== undefined && rating > 0 && Number(votes || 0) > 0;

  if (!leadItems.length && !tagItems.length && !showRating) return null;

  return (
    <div className={`tt-meta${className ? ` ${className}` : ""}`}>
      <div className="tt-meta-lead">
        {leadItems.map((item, index) => (
          <strong key={`${index}-${item}`}>{item}</strong>
        ))}
        {showRating ? (
          <span
            className="tt-meta-rating"
            title={votes ? `Média de ${Number(votes).toLocaleString("pt-BR")} votos no TMDB` : undefined}
          >
            <Star size={16} fill="currentColor" aria-hidden="true" className="tt-meta-star" />
            <strong>{rating.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</strong>
            <span className="tt-meta-rating-label">TMDB</span>
          </span>
        ) : null}
      </div>
      {tagItems.length ? (
        <ul className="tt-meta-tags">
          {tagItems.map((tag, index) => (
            <li key={`${index}-${tag}`}>{tag}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
