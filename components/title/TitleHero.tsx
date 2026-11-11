"use client";

import "@/styles/features/title-detail.css";
import "@/styles/features/title-hero.css";
import { Heart, ListPlus } from "lucide-react";
import { useId, useState } from "react";

import { AddToListDialog } from "@/components/lists/AddToListDialog";
import { useAuthState } from "@/hooks/useLibraryAuth";
import type { LibraryLookupState } from "@/lib/library/lookup";
import { genreName, languageName, runtimeLabel, workStatusLabel } from "@/lib/title-locale";
import type { Status } from "@/lib/types";
import { TitleBand } from "./hero/TitleBand";
import { TitleMeta } from "./hero/TitleMeta";
import { TitleRating } from "./hero/TitleRating";
import { TitleStatusMenu } from "./hero/TitleStatusMenu";
import { TitleWhereToWatch } from "./TitleWhereToWatch";
import { WatchNowButton } from "./WatchNowButton";
import type { LibraryItem, LooseTitleDetails, TitleType } from "./types";
import { Button } from "@/components/ui/Button";

export type TitleHeroProps = {
  type: TitleType;
  details: LooseTitleDetails;
  libraryItem: LibraryItem | null;
  status: Status;
  rating: number | null;
  favorite: boolean;
  saving: boolean;
  /** Fase 0: "ready" = estado confirmado; "loading"/"error" = sem Adicionar/Curtir. */
  libraryLookup: LibraryLookupState;
  onRetryLibraryLookup: () => void;
  onStatusChange: (status: Status) => void;
  onRemoveFromLibrary: () => void;
  onToggleFavorite: () => void;
  onRatingChange: (rating: number | null) => void;
};

/**
 * Topo da página do Título — Fase 4, direção "Tela 2.39:1".
 *
 * Faixa panorâmica sobre fundo preto; abaixo, pôster, título e uma frase de
 * ficha técnica. UMA ação principal (clara): o status — fora da biblioteca,
 * "Adicionar à biblioteca". Curtir, listas, onde assistir e (Modo Sem
 * Censura) assistir agora são discretas. "Sua nota" fica ao lado.
 * No celular as ações viram uma barra fixa acima da navegação inferior e o
 * status abre numa folha.
 *
 * Apresentacional: as mutações continuam no TitleView.
 */
export function TitleHero({
  type,
  details,
  libraryItem,
  status,
  rating,
  favorite,
  saving,
  libraryLookup,
  onRetryLibraryLookup,
  onStatusChange,
  onRemoveFromLibrary,
  onToggleFavorite,
  onRatingChange,
}: TitleHeroProps) {
  const ratingHeadingId = useId();
  const authState = useAuthState();
  const [listOpen, setListOpen] = useState(false);
  // Pulso do coração só quando a pessoa curte agora (não ao carregar algo já curtido).
  const [likePulse, setLikePulse] = useState(0);

  const title: string = details.title || details.name || "Sem título";
  const originalTitle: string | undefined = details.original_title || details.original_name;
  const year = (details.first_air_date || details.release_date || "").slice(0, 4);
  // Fase 0: sem item e sem estado confirmado, nada pode ser criado nem curtido.
  const lookupPending = !libraryItem && libraryLookup !== "ready";
  const currentStatus = libraryItem ? status : null;

  function toggleFavorite() {
    if (!favorite) setLikePulse((n) => n + 1);
    onToggleFavorite();
  }

  const statusMenuProps = {
    status: currentStatus,
    libraryLookup,
    saving,
    onRetryLookup: onRetryLibraryLookup,
    onChange: onStatusChange,
    onRemove: onRemoveFromLibrary,
  };

  const likeLabel = favorite ? "Curtido" : "Curtir";
  const heart = (
    <Heart
      key={likePulse}
      size={18}
      fill={favorite ? "currentColor" : "none"}
      aria-hidden="true"
      className={likePulse > 0 && favorite ? "tt-heart-pulse" : undefined}
    />
  );

  return (
    <section className="tt-hero" aria-labelledby="tt-title">
      <TitleBand path={details.backdrop_path || details.poster_path} />

      <div className="tt-head">
        <div className="tt-identity">
          <div className="tt-copy">
            <h1 id="tt-title" className="tt-title">{title}</h1>
            {originalTitle && originalTitle !== title ? <p className="tt-original">{originalTitle}</p> : null}
            <TitleMeta
              lead={[type === "tv" ? "Série" : "Filme", year || null]}
              tags={titleTags(type, details)}
              rating={Number(details.vote_average || 0)}
              votes={Number(details.vote_count || 0)}
            />

            <div className="tt-actions">
              <TitleStatusMenu {...statusMenuProps} variant="menu" />
              {/* Projeção (Fase 4): Curtir e Listas viram ícones com nome acessível; o status é a única ação com rótulo grande. */}
              <Button
                type="button"
                className="tt-quiet tt-icon tt-like"
                aria-pressed={favorite}
                aria-label={likeLabel}
                title={likeLabel}
                onClick={toggleFavorite}
                disabled={lookupPending}
              >
                {heart}
              </Button>
              {/*
               * Enquanto a sessão é verificada o botão já ocupa o lugar (invisível):
               * antes ele surgia depois do carregamento, a linha de ações ganhava uma
               * fileira e tudo abaixo (inclusive as abas) descia ~120px sob o cursor.
               */}
              {authState !== "guest" ? (
                <Button
                  type="button"
                  className="tt-quiet tt-icon tt-list"
                  aria-label="Adicionar a uma lista"
                  title="Adicionar a uma lista"
                  onClick={() => setListOpen(true)}
                  disabled={authState !== "authenticated"}
                  data-reserved={authState !== "authenticated" ? "true" : undefined}
                  aria-hidden={authState !== "authenticated" ? true : undefined}
                  tabIndex={authState !== "authenticated" ? -1 : undefined}
                >
                  <ListPlus size={19} aria-hidden="true" />
                </Button>
              ) : null}
              <WatchNowButton
                type={type}
                id={details.id}
                title={title}
                year={year}
                releaseDate={details.release_date || details.first_air_date}
                className="btn tt-quiet"
              />
              <TitleWhereToWatch key={`${type}-${details.id}`} type={type} details={details} />
            </div>

            {!libraryItem && libraryLookup === "error" ? (
              <p className="tt-hint" role="alert">
                Não foi possível verificar se este título está na sua biblioteca. Nada foi alterado. Tente de novo.
              </p>
            ) : null}
          </div>
        </div>

        {libraryItem ? (
          <aside className="tt-rating-aside" aria-labelledby={ratingHeadingId}>
            <h2 id={ratingHeadingId} className="tt-rating-heading">Sua nota</h2>
            <TitleRating value={rating} onChange={onRatingChange} headingId={ratingHeadingId} />
          </aside>
        ) : null}
      </div>

      {/* Celular: ações fixas acima da navegação inferior (antes "Curtir" ficava escondido sob ela). */}
      <div className="tt-mobile-bar">
        <TitleStatusMenu {...statusMenuProps} variant="sheet" className="tt-mobile-primary" />
        <Button
          type="button"
          className="tt-quiet tt-icon tt-like"
          aria-pressed={favorite}
          aria-label={likeLabel}
          onClick={toggleFavorite}
          disabled={lookupPending}
        >
          {heart}
        </Button>
        {authState === "authenticated" ? (
          <Button type="button" className="tt-quiet tt-icon" aria-label="Adicionar a uma lista" onClick={() => setListOpen(true)}>
            <ListPlus size={20} aria-hidden="true" />
          </Button>
        ) : null}
      </div>

      {listOpen ? (
        <AddToListDialog
          tmdbId={Number(details.id)}
          mediaType={type}
          title={title}
          onClose={() => setListOpen(false)}
        />
      ) : null}
    </section>
  );
}

/**
 * Fichinhas da ficha, cada dado no seu lugar: cada gênero, duração (filme) ou
 * temporadas e situação (série), e o idioma original. Tipo, ano e nota ficam
 * na primeira linha (TitleMeta).
 */
function titleTags(type: TitleType, details: LooseTitleDetails) {
  const genres: string[] = (details.genres || []).map((genre: { name: string }) => genreName(genre.name)).filter(Boolean).slice(0, 3);
  const language = languageName(details.original_language);
  const seasons = Number(details.number_of_seasons || 0);

  return [
    ...genres,
    type === "movie" ? runtimeLabel(details.runtime) || null : null,
    type === "tv" && seasons ? `${seasons} ${seasons === 1 ? "temporada" : "temporadas"}` : null,
    type === "tv" ? workStatusLabel(details.status, type) || null : null,
    language ? `Idioma original: ${language}` : null,
  ];
}
