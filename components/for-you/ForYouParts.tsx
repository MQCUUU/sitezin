"use client";
import { MediaPosterActions } from "@/components/media/MediaPosterActions";
import { MediaPosterTags, mediaTypeLabel } from "@/components/media/MediaBadges";
import { MediaCard, MediaCardImage } from "@/components/media";
import { Poster } from "@/components/Poster";
import { TitleBand } from "@/components/title/hero/TitleBand";
import { TitleMeta } from "@/components/title/hero/TitleMeta";
import { Button } from "@/components/ui/Button";
import { Film, Star, Tv } from "lucide-react";
import { CarouselRail } from "@/components/CarouselRail";
import Link from "next/link";

import { FriendOpinions } from "@/components/for-you/FriendOpinions";

export function ShelfRow({
  shelf,
  openMenu,
  setOpenMenu,
  setPreviewItem,
  getLibraryItem,
  processing,
  addToLibrary,
  updateStatus,
  toggleFavorite,
  requestRemove,
}: any) {
  return (
    <section className="fy-shelf" data-rec-shelf={shelf.kind || undefined}>
      {/* Fase 4: título e o motivo da prateleira; sem ícone em caixa nem contador. */}
      <div className="fy-shelf-head">
        <h2>{shelf.title}</h2>
        {shelf.subtitle && <p>{shelf.subtitle}</p>}
      </div>

      <CarouselRail className="fy-row" label={shelf.title}>
        {shelf.results.map(
          (
            item:
              any
          ) => (
            <MovieCard
              key={`${item.media_type}-${item.id}`}
              item={
                item
              }
              openMenu={
                openMenu
              }
              setOpenMenu={
                setOpenMenu
              }
              setPreviewItem={
                setPreviewItem
              }
              getLibraryItem={
                getLibraryItem
              }
              processing={
                processing
              }
              addToLibrary={
                addToLibrary
              }
              updateStatus={
                updateStatus
              }
              toggleFavorite={
                toggleFavorite
              }
              requestRemove={
                requestRemove
              }
            />
          )
        )}
      </CarouselRail>
    </section>
  );
}

export function MovieCard({
  item,
  setPreviewItem,
  getLibraryItem,
  processing,
  addToLibrary,
  updateStatus,
  toggleFavorite,
  requestRemove,
}: any) {
  const type =
    item.media_type ===
      "tv"
      ? "tv"
      : "movie";

  const title =
    item.title ||
    item.name ||
    "Sem título";

  const year =
    (
      item.release_date ||
      item.first_air_date ||
      ""
    ).slice(
      0,
      4
    );

  const key =
    `${type}-${item.id}`;

  const existing =
    getLibraryItem(
      item
    );

  const busy =
    processing ===
    key;

  const endorsement = item.friend_endorsement || item.friend_opinion_summary;

  return (
    <MediaCard className="fy-card-wrap" data-projection={item.backdrop_path || undefined}>
      <MediaCardImage className="fy-card-poster-wrap">
        <Link
          href={`/title/${type}/${item.id}`}
          className="poster-link fy-poster-link"
          tabIndex={-1}
          aria-hidden="true"
        >
          {item.poster_path ? (
            <Poster
              path={item.poster_path}
              alt={title}
              sizes="(max-width: 700px) 45vw, 190px"
            />
          ) : (
            <div className="fy-no-poster">
              {type ===
              "tv" ? (
                <Tv
                  size={28}
                />
              ) : (
                <Film
                  size={28}
                />
              )}
            </div>
          )}
        </Link>

        <MediaPosterTags type={type} status={existing ? existing.status : null} />

        <MediaPosterActions
          title={title}
          inLibrary={Boolean(existing)}
          status={existing?.status}
          favorite={Boolean(existing?.favorite)}
          busy={busy}
          onPreview={() => setPreviewItem(item)}
          onMarkWatched={() => updateStatus(item, "watched")}
          onAdd={() => addToLibrary(item)}
          onChangeStatus={(status: string) => updateStatus(item, status)}
          onToggleFavorite={() => toggleFavorite(item)}
          onRemove={() => requestRemove(item)}
        />
      </MediaCardImage>
      <Link
        href={`/title/${type}/${item.id}`}
        className="card-title fy-card-title"
      >
        {title}
      </Link>

      <div className="card-meta fy-card-meta">
        <span className="mc-media-type-year">{mediaTypeLabel(type)}{year ? ` ${year}` : ""}</span>

        {Number(item.vote_average || 0) > 0 && (
          <span className="rating fy-rating">
            <Star size={12} fill="currentColor" />
            {Number(item.vote_average).toFixed(1)}
          </span>
        )}
      </div>

      {endorsement && <FriendOpinions item={item} />}
    </MediaCard>
  );
}

/** Esqueleto do destaque (mesma caixa da faixa e do texto do FeaturedPick): sem salto quando as sugestões chegam. */
export function FeaturedSkeleton() {
  return (
    <section className="fy-feature fy-feature--skeleton" role="status" aria-label="Carregando destaque">
      <div className="tt-band">
        <div className="tt-band-screen mc-skeleton dc-band-skeleton" />
      </div>
      <div className="fy-feature-body">
        <div className="fy-feature-copy">
          <div className="mc-skeleton fy-feat-skel-title" />
          <div className="mc-skeleton fy-feat-skel-meta" />
          <div className="mc-skeleton fy-feat-skel-text" />
        </div>
      </div>
    </section>
  );
}

export function FeedSkeleton() {
  return (
    <div className="fy-feed">
      {[1,2,3].map(
        (
          row
        ) => (
          <section
            className="fy-shelf"
            key={
              row
            }
          >
            <div className="fy-skeleton-title" />

            <div className="fy-row">
              {[1,2,3,4,5,6,7].map(
                (
                  item
                ) => (
                  <div
                    key={
                      item
                    }
                    className="fy-skeleton-card"
                  >
                    <div />
                    <span />
                    <small />
                  </div>
                )
              )}
            </div>
          </section>
        )
      )}
    </div>
  );
}

/* "A, B, C e D" */
export function joinNames(names: string[]) {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}`;
}

/**
 * Fase 4 — a melhor aposta do momento: faixa panorâmica, nome grande, o motivo
 * e uma ação clara ("Quero assistir"). Já na biblioteca, a ação vira abrir o título.
 */
export function FeaturedPick({
  item,
  reason,
  inLibrary,
  busy,
  onAdd,
  onPreview,
}: {
  item: any;
  reason: string;
  inLibrary: boolean;
  busy: boolean;
  onAdd: () => void;
  onPreview: () => void;
}) {
  const title = item.title || item.name || "Sem título";
  const href = `/title/${item.media_type}/${item.id}`;
  const year = String(item.release_date || item.first_air_date || "").slice(0, 4);

  return (
    <section className="fy-feature" aria-labelledby="fy-feature-title">
      <TitleBand path={item.backdrop_path} />
      <div className="fy-feature-body">
        <div className="fy-feature-copy">
          <h1 id="fy-feature-title" className="fy-feature-title">
            <Link href={href}>{title}</Link>
          </h1>
          <TitleMeta
            lead={[mediaTypeLabel(item.media_type), year || null]}
            rating={Number(item.vote_average || 0)}
            votes={Number(item.vote_count || 1)}
          />
          <p className="fy-feature-text">{reason}</p>
        </div>
        <div className="fy-feature-actions">
          {inLibrary ? (
            <Link href={href} className="btn primary fy-feature-action">
              Abrir o título
            </Link>
          ) : (
            <Button variant="primary" type="button" className="fy-feature-action" onClick={onAdd} disabled={busy}>
              {busy ? "Adicionando…" : "Quero assistir"}
            </Button>
          )}
          <Button type="button" className="fy-feature-action fy-feature-action--quiet" onClick={onPreview}>
            Ver detalhes
          </Button>
        </div>
      </div>
    </section>
  );
}
