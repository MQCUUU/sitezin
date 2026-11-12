import "@/styles/features/states.css";
import "@/styles/features/review.css";

/* Mesmo formato da avaliação: pôster ao lado do cabeçalho, texto embaixo. */
export default function Loading() {
  return (
    <div className="rv-page" role="status" aria-label="Carregando avaliação">
      <div className="mc-sk-back-wrap" aria-hidden="true">
        <div className="mc-skeleton mc-sk-back" />
      </div>
      <div className="rv-card" aria-hidden="true">
        <div className="rv-poster mc-skeleton" />
        <div className="rv-head">
          <div className="rv-sk-byline">
            <span className="rv-avatar mc-skeleton" />
            <span className="mc-skeleton rv-skeleton-line rv-skeleton-line--short" />
          </div>
          <div className="mc-skeleton rv-sk-title" />
          <div className="mc-skeleton rv-skeleton-line rv-skeleton-line--short" />
        </div>
        <div className="rv-review">
          <div className="mc-skeleton rv-skeleton-line" />
          <div className="mc-skeleton rv-skeleton-line" />
          <div className="mc-skeleton rv-skeleton-line rv-skeleton-line--short" />
        </div>
      </div>
    </div>
  );
}
