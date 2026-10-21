import { Heart, Plus, RefreshCw, Star, Trash2, Film, Tv } from "lucide-react";

import { Poster } from "@/components/Poster";
import { mediaStatusLabel } from "@/lib/media-status";
import { languageName, runtimeLabel, workStatusLabel } from "@/lib/title-locale";
import type { LibraryLookupState } from "@/lib/library/lookup";
import type { LibraryItem, LooseTitleDetails, TitleType } from "./types";

export type TitleHeroProps = {
  type: TitleType;
  details: LooseTitleDetails;
  libraryItem: LibraryItem | null;
  favorite: boolean;
  saving: boolean;
  /** Fase 0: "ready" = estado confirmado; "loading"/"error" = sem Adicionar/Curtir. */
  libraryLookup: LibraryLookupState;
  onRetryLibraryLookup: () => void;
  onAddToLibrary: () => void;
  onRemoveFromLibrary: () => void;
  onToggleFavorite: () => void;
};

/**
 * Cabeçalho principal da title page: backdrop, poster, título, badges e as
 * ações primárias (adicionar/remover da biblioteca, curtir). Puramente
 * apresentacional — as mutações continuam no container (TitleView), que
 * decide o que `onAddToLibrary`/`onRemoveFromLibrary`/`onToggleFavorite`
 * de fato fazem.
 *
 * O backdrop é o maior bloco de pixels acima da dobra (cobre a largura
 * inteira do hero); o poster é bem menor e some atrás dele visualmente até
 * carregar. Por isso só o backdrop leva `priority` — marcar os dois
 * "prioritários" não prioriza nada de verdade.
 */
export function TitleHero({
  type,
  details,
  libraryItem,
  favorite,
  saving,
  libraryLookup,
  onRetryLibraryLookup,
  onAddToLibrary,
  onRemoveFromLibrary,
  onToggleFavorite,
}: TitleHeroProps) {
  const title = details.title || details.name;

  // Fase 0: sem item e sem estado confirmado, nada pode ser criado nem curtido.
  const lookupPending = !libraryItem && libraryLookup !== "ready";

  const year = (details.first_air_date || details.release_date || "").slice(
    0,
    4
  );

  const runtime = runtimeLabel(details.runtime);

  // V3.1: dados do TMDB apresentados em PT-BR (lib/title-locale.ts) — o cru não muda.
  const workStatus = workStatusLabel(details.status, type);
  const originalLanguage = languageName(details.original_language);

  const voteCount = Number(details.vote_count || 0);
  const tmdbRating = voteCount > 0 ? Number(details.vote_average || 0).toFixed(1) : null;

  return (
    <section className="mc-title-hero">
      <div className="title-hero mc-title-hero-frame">
        <div className="title-hero-backdrop mc-title-hero-backdrop">
          <Poster
            path={details.backdrop_path}
            alt=""
            sizes="100vw"
            tmdbSize="w1280"
            priority
          />
        </div>

        <div className="title-hero-overlay mc-title-hero-scrim" />

        <div className="title-hero-content mc-title-hero-layer">
          <div className="title-poster-wrap mc-title-poster-wrap">
            <Poster
              path={details.poster_path}
              alt={title}
              sizes="(max-width: 700px) 128px, (max-width: 1024px) 170px, 200px"
              className="title-poster"
            />

            {libraryItem && (
              <div className="title-poster-status" title="Seu status na biblioteca">
                <span className="status-dot" />
                {mediaStatusLabel(libraryItem.status)}
              </div>
            )}
          </div>

          <div className="title-main mc-title-main">
            <div className="title-type">
              {type === "tv" ? <Tv size={16} /> : <Film size={16} />}

              {type === "tv" ? "Série" : "Filme"}

              {year && (
                <>
                  <span>•</span>
                  {year}
                </>
              )}
            </div>

            <h1>{title}</h1>

            {(details.original_title || details.original_name) &&
              (details.original_title || details.original_name) !==
                title && (
                <div className="title-original-name">
                  {details.original_title || details.original_name}
                </div>
              )}

            {details.tagline && (
              <p className="title-tagline">“{details.tagline}”</p>
            )}

            <div className="title-quick-facts">
              {workStatus && <span title={type === "tv" ? "Situação da série" : "Situação do filme"}>{workStatus}</span>}

              {type === "movie" && runtime && <span>{runtime}</span>}

              {type === "tv" && details.number_of_seasons && (
                <span>
                  {details.number_of_seasons}{" "}
                  {Number(details.number_of_seasons) === 1
                    ? "temporada"
                    : "temporadas"}
                </span>
              )}

              {/* Idioma ORIGINAL da obra (não é classificação etária). */}
              {originalLanguage && <span>Idioma original: {originalLanguage}</span>}
            </div>

            <div className="title-ratings mc-title-meta-row">
              {tmdbRating && (
                <div className="title-rating tmdb-rating" title={`Média de ${voteCount.toLocaleString("pt-BR")} votos no TMDB`}>
                  <Star size={18} fill="currentColor" />

                  <div>
                    <strong>{tmdbRating}</strong>

                    <span>Média TMDB</span>
                  </div>
                </div>
              )}

              {libraryItem &&
                libraryItem.personal_rating !== null &&
                libraryItem.personal_rating !== undefined && (
                  <div className="title-rating my-rating">
                    <Star size={18} fill="currentColor" />

                    <div>
                      <strong>
                        {Number(libraryItem.personal_rating).toFixed(1)}
                      </strong>

                      <span>Sua nota</span>
                    </div>
                  </div>
                )}
            </div>

            <div className="title-actions mc-title-actions">
              {!libraryItem && libraryLookup === "error" ? (
                <button
                  type="button"
                  className="btn primary title-main-btn"
                  onClick={onRetryLibraryLookup}
                >
                  <RefreshCw size={18} />
                  Tentar de novo
                </button>
              ) :!libraryItem && libraryLookup === "loading" ? (
                <button
                  type="button"
                  className="btn primary title-main-btn"
                  disabled
                  aria-busy="true"
                >
                  <Plus size={18} />
                  Verificando biblioteca...
                </button>
              ) : !libraryItem ? (
                <button
                  className="btn primary title-main-btn"
                  onClick={onAddToLibrary}
                  disabled={saving}
                >
                  <Plus size={18} />

                  {saving ? "Adicionando..." : "Adicionar à biblioteca"}
                </button>
              ) : (
                // Fase 3: remover (reversível, com "Desfazer") não tem o peso do CTA principal — variante discreta.
                <button
                  type="button"
                  className="btn title-main-btn title-remove-btn"
                  onClick={onRemoveFromLibrary}
                  disabled={saving}
                  aria-label={saving ? undefined : "Remover da biblioteca"}
                >
                  <Trash2 size={18} />

                  {/* Fase 3: em telas estreitas o rótulo visível encurta para "Remover" (o nome acessível continua completo). */}
                  {saving ? (
                    "Removendo..."
                  ) : (
                    <span>
                      Remover<span className="title-remove-label-extra"> da biblioteca</span>
                    </span>
                  )}
                </button>
              )}

              <button
                type="button"
                aria-pressed={favorite}
                className={
                  favorite ? "btn favorite-btn active" : "btn favorite-btn"
                }
                onClick={onToggleFavorite}
                disabled={lookupPending}
              >
                <Heart size={18} fill={favorite ? "currentColor" : "none"} />

                {favorite ? "Curtido" : "Curtir"}
              </button>
            </div>

            {!libraryItem && libraryLookup === "error" && (
              <p className="title-status-hint" role="alert">
                Não foi possível verificar se este título está na sua biblioteca.
                Nada foi alterado. Tente de novo.
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
