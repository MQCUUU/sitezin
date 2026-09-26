import Link from "next/link";
import { Star } from "lucide-react";

import { CarouselRail } from "@/components/CarouselRail";
import { img } from "@/lib/tmdb";
import type { TitleType } from "./types";

export type TitleRelatedSectionProps = {
  type: TitleType;
  recommendations: any[];
};

/**
 * Conteúdo da aba "related": estado vazio (title-tabpanel-related-1) ou o
 * carrossel de recomendações (related-2) — mutuamente exclusivos, como
 * antes da C1.2. `recommendations` continua com a dívida conhecida de não
 * ser populado hoje (C6 resolve isso); esta seção só preserva o
 * comportamento atual.
 */
export function TitleRelatedSection({
  type,
  recommendations,
}: TitleRelatedSectionProps) {
  if (recommendations.length === 0) {
    return (
      <div
        role="tabpanel"
        id="title-tabpanel-related-1"
        aria-labelledby="title-tab-related"
      >
        <div className="empty">Nenhum título relacionado disponível.</div>
      </div>
    );
  }

  return (
    <div
      role="tabpanel"
      id="title-tabpanel-related-2"
      aria-labelledby="title-tab-related"
    >
      <section className="section">
        <div className="title-section-heading">
          <span>Recomendações</span>

          <h2>Você também pode gostar</h2>
        </div>

        <CarouselRail className="title-recommendation-carousel">
          {recommendations.map((item: any) => (
            <Link
              key={`${item.media_type}-${item.id}`}
              href={`/title/${item.media_type || type}/${item.id}`}
              className="panel title-recommendation-card"
              style={{ overflow: "hidden", padding: 0, textDecoration: "none" }}
            >
              <img
                loading="lazy"
                decoding="async"
                src={img(item.poster_path)}
                alt={item.title || item.name}
                style={{
                  width: "100%",
                  aspectRatio: "2 / 3",
                  objectFit: "cover",
                  display: "block",
                }}
              />

              <div style={{ padding: "11px" }}>
                <strong style={{ display: "block", fontSize: "14px" }}>
                  {item.title || item.name}
                </strong>

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

                  {Number(item.vote_average || 0).toFixed(1)}
                </div>
              </div>
            </Link>
          ))}
        </CarouselRail>
      </section>
    </div>
  );
}
