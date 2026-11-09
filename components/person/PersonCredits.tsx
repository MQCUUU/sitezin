"use client";
import { mediaTypeLabel } from "@/components/media/MediaBadges";
import { MediaCard, MediaCardImage, MediaCardMeta } from "@/components/media";
import { Poster } from "@/components/Poster";
import { Button } from "@/components/ui/Button";
import Link from "next/link";

import { Film, Star, Tv } from "lucide-react";
import { ConnectedPosterActions } from "@/components/media/ConnectedPosterActions";
import { getYear, getTitle, type Credit } from "@/components/person/shared";

export function PersonCreditsSection({
  title,
  items,
  total,
  expanded,
  onToggle,
}: {
  title: string;
  items: Credit[];
  total: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <section className="sk-section pp-section">
      <div className="sk-section-head">
        <h2>
          {title} <span className="pp-count">{total}</span>
        </h2>
      </div>

      <div className="person-credit-grid">
        {items.map((item) => (
          <PersonCreditCard key={`${item.media_type}-${item.id}`} item={item} />
        ))}
      </div>

      {total > 12 && (
        <div className="person-show-more">
          <Button type="button" onClick={onToggle}>
            {expanded ? "Mostrar menos" : `Ver todos os ${total}`}
          </Button>
        </div>
      )}
    </section>
  );
}

export function PersonCreditCard({
  item,
  featured =
    false,
}: {
  item:
    Credit;
  featured?:
    boolean;
}) {
  const title =
    getTitle(
      item
    );

  const year =
    getYear(
      item
    );

  const role =
    (
      item.roles ||
      []
    )
      .filter(
        Boolean
      )
      .slice(
        0,
        2
      )
      .join(
        ", "
      ) ||
    item.character ||
    item.job ||
    "";

  const href = `/title/${item.media_type}/${item.id}`;

  const rating = Number(item.vote_average || 0);

  /* Fase 3: mesmo cartão de mídia das grades (MediaCard) — antes era um cartão próprio, com <img> cru. */
  return (
    <MediaCard className={featured ? "person-work-card featured" : "person-work-card"}>
      <MediaCardImage className="mc-pa-host">
        {/* Pôster (atalho decorativo) + botões do pôster FORA do link; o link acessível é o nome. */}
        <Link href={href} tabIndex={-1} aria-hidden="true" className="poster-link">
          {item.poster_path ? (
            <Poster
              path={item.poster_path}
              alt=""
              sizes={featured ? "(max-width:700px) 46vw, 220px" : "(max-width:700px) 46vw, (max-width:1100px) 24vw, 170px"}
            />
          ) : (
            <div className="person-work-poster-empty">
              {item.media_type === "tv" ? <Tv size={26} /> : <Film size={26} />}
            </div>
          )}
        </Link>

        <ConnectedPosterActions
          media={{ tmdbId: Number(item.id), mediaType: item.media_type === "tv" ? "tv" : "movie", title, year, posterPath: item.poster_path ?? null, voteAverage: rating || null }}
        />
      </MediaCardImage>

      <Link href={href} className="card-title">
        {title}
      </Link>

      <MediaCardMeta>
        <span className="mc-media-type-year">{mediaTypeLabel(item.media_type)}{year ? ` ${year}` : ""}</span>
        {rating > 0 && (
          <span className="rating">
            <Star size={12} fill="currentColor" />
            {rating.toFixed(1)}
          </span>
        )}
      </MediaCardMeta>

      {role && <span className="person-work-role">{role}</span>}
    </MediaCard>
  );
}
