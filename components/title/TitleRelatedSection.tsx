import "@/styles/features/title-detail.css";
import Link from "next/link";
import { Star } from "lucide-react";

import { CarouselRail } from "@/components/CarouselRail";
import { Poster } from "@/components/Poster";
import { ConnectedPosterActions } from "@/components/media/ConnectedPosterActions";
import type { RelatedItem, TitleType } from "./types";

export type TitleRelatedSectionProps = {
  type: TitleType;
  recommendations: RelatedItem[];
};

/**
 * Conteúdo da aba "related": estado vazio (title-tabpanel-related-1) ou o
 * carrossel de recomendações (related-2) — mutuamente exclusivos, como
 * antes da C1.2. `recommendations` agora vem normalizado e populado de
 * verdade pelo `sanitizeTitleDetails` (C6) — mesma fonte TMDB, mesmo fetch
 * de details, self-filter/dedupe/limite já aplicados lá.
 */
export function TitleRelatedSection({
  recommendations,
}: TitleRelatedSectionProps) {
  if (recommendations.length === 0) {
    return (
      <div
        role="tabpanel"
        id="title-tabpanel-related-1"
        aria-labelledby="title-tab-related"
      >
        <div className="mc-title-section">
          <div className="mc-title-empty-state">
            Nenhum título relacionado disponível.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      role="tabpanel"
      id="title-tabpanel-related-2"
      aria-labelledby="title-tab-related"
    >
      <section className="section mc-title-section">
        <div className="title-section-heading">
          <span>Recomendações</span>

          <h2>Você também pode gostar</h2>
        </div>

        <CarouselRail className="title-recommendation-carousel">
          {recommendations.map((item) => (
            <div
              key={`${item.media_type}-${item.id}`}
              className="panel title-recommendation-card"
              style={{ overflow: "hidden", padding: 0 }}
            >
              <div className="mc-title-recommendation-media mc-pa-host">
                {/* Pôster = atalho decorativo (fora do Tab); o link acessível é o
                    nome logo abaixo. Os botões ficam FORA do link. */}
                <Link href={`/title/${item.media_type}/${item.id}`} tabIndex={-1} aria-hidden="true" className="poster-link">
                  <Poster
                    path={item.poster_path}
                    alt=""
                    sizes="(max-width: 700px) 45vw, 210px"
                  />
                </Link>
                <ConnectedPosterActions
                  media={{ tmdbId: item.id, mediaType: item.media_type, title: item.title, year: item.date?.slice(0, 4), posterPath: item.poster_path, backdropPath: item.backdrop_path, voteAverage: item.vote_average, releaseDate: item.date }}
                />
              </div>

              <Link href={`/title/${item.media_type}/${item.id}`} style={{ display: "block", padding: "11px", color: "inherit", textDecoration: "none" }}>
                <strong style={{ display: "block", fontSize: "14px" }}>
                  {item.title}
                </strong>

                {item.vote_average ? (
                  <div
                    className="muted"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                      marginTop: "5px",
                      fontSize: "12px",
                    }}
                  >
                    <Star size={12} fill="currentColor" />

                    {item.vote_average.toFixed(1)}
                  </div>
                ) : null}
              </Link>
            </div>
          ))}
        </CarouselRail>
      </section>
    </div>
  );
}
