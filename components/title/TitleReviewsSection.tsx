import { ReviewPanel } from "@/components/ReviewPanel";
import { WatchHistory } from "@/components/WatchHistory";
import type { LibraryItem, LibraryItemUpdate, TitleType } from "./types";

export type TitleReviewsSectionProps = {
  type: TitleType;
  libraryItem: LibraryItem | null;
  onWatchHistoryChange: (item: LibraryItemUpdate) => void;
  onRatingChange: (value: number | null) => void;
  onReviewChange: (value: string) => void;
};

/**
 * Conteúdo inteiro da aba "reviews": histórico de visualizações
 * (title-tabpanel-reviews-1, só com libraryItem), estado vazio para guest
 * (reviews-2) e o painel de avaliação/opinião (reviews-3, só com
 * libraryItem — coexiste com reviews-1). Mesmos ids e condições de antes
 * da C1.2.
 */
export function TitleReviewsSection({
  type,
  libraryItem,
  onWatchHistoryChange,
  onRatingChange,
  onReviewChange,
}: TitleReviewsSectionProps) {
  return (
    <>
      {libraryItem && (
        <div
          role="tabpanel"
          id="title-tabpanel-reviews-1"
          aria-labelledby="title-tab-reviews"
        >
          <section className="section mc-title-section title-watch-history-section">
            <WatchHistory
              libraryId={libraryItem.id}
              mediaType={type === "tv" ? "tv" : "movie"}
              currentRating={
                libraryItem.personal_rating !== null &&
                libraryItem.personal_rating !== undefined
                  ? Number(libraryItem.personal_rating)
                  : null
              }
              onLibraryItemChange={onWatchHistoryChange}
            />
          </section>
        </div>
      )}

      {!libraryItem && (
        <div
          role="tabpanel"
          id="title-tabpanel-reviews-2"
          aria-labelledby="title-tab-reviews"
        >
          <div className="mc-title-section">
            <div className="mc-title-empty-state">
              Adicione este título à biblioteca para registrar sua avaliação e
              resenha.
            </div>
          </div>
        </div>
      )}

      {libraryItem && (
        <div
          role="tabpanel"
          id="title-tabpanel-reviews-3"
          aria-labelledby="title-tab-reviews"
        >
          <section className="section mc-title-section title-review-section">
            <div className="title-section-heading">
              <span>Sua experiência</span>

              <h2>Avaliação e opinião</h2>
            </div>

            <ReviewPanel
              libraryId={libraryItem.id}
              initialRating={
                libraryItem.personal_rating !== null &&
                libraryItem.personal_rating !== undefined
                  ? Number(libraryItem.personal_rating)
                  : null
              }
              initialReview={libraryItem.review || ""}
              onRatingChange={onRatingChange}
              onReviewChange={onReviewChange}
            />
          </section>
        </div>
      )}
    </>
  );
}
