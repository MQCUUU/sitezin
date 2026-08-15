"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Search } from "@/components/Search";
import { img } from "@/lib/tmdb";
import {
  Heart,
  Star,
  Plus,
  Trash2,
  CalendarDays,
  Clock3,
  Film,
  Tv,
  Play,
} from "lucide-react";
import type { Status } from "@/lib/types";
import { STATUS_LABELS } from "@/lib/types";
import { ReviewPanel } from "@/components/ReviewPanel";

export default function TitlePage() {
  const params = useParams<{
    type: string;
    id: string;
  }>();

  const [details, setDetails] = useState<any>(null);
  const [libraryItem, setLibraryItem] =
    useState<any>(null);

  const [status, setStatus] =
    useState<Status>("want");

  const [rating, setRating] =
    useState("");

  const [review, setReview] =
    useState("");

  const [favorite, setFavorite] =
    useState(false);

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  const [message, setMessage] =
    useState("");

  useEffect(() => {
    async function load() {
      if (!params.type || !params.id) {
        return;
      }

      try {
        setLoading(true);

        const [
          detailsResponse,
          libraryResponse,
        ] = await Promise.all([
          fetch(
            `/api/tmdb/${params.type}/${params.id}`
          ),
          fetch("/api/library"),
        ]);

        const detailsData =
          await detailsResponse.json();

        const libraryData =
          await libraryResponse.json();

        setDetails(detailsData);

        const library = Array.isArray(
          libraryData
        )
          ? libraryData
          : [];

        const found = library.find(
          (item: any) =>
            item.media?.tmdb_id ===
              Number(params.id) &&
            item.media?.media_type ===
              params.type
        );

        if (found) {
          setLibraryItem(found);
          setStatus(found.status);

          setRating(
            found.personal_rating !==
              null &&
              found.personal_rating !==
                undefined
              ? String(
                  found.personal_rating
                )
              : ""
          );

          setReview(
            found.review || ""
          );

          setFavorite(
            !!found.favorite
          );
        }
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [params.type, params.id]);

  function showMessage(
    text: string
  ) {
    setMessage(text);

    setTimeout(() => {
      setMessage("");
    }, 3000);
  }

  async function addToLibrary() {
    if (!details || saving) return;

    try {
      setSaving(true);

      const type =
        params.type === "tv"
          ? "tv"
          : "movie";

      const title =
        details.title ||
        details.name;

      const payload = {
        media: {
          ...details,

          id: details.id,

          media_type: type,

          title,

          original_title:
            details.original_title ||
            details.original_name ||
            title,

          genres:
            details.genres || [],

          creator_names:
            (
              details.created_by ||
              []
            ).map(
              (person: any) =>
                person.name
            ),

          cast_names:
            (
              details.credits?.cast ||
              []
            )
              .slice(0, 10)
              .map(
                (person: any) =>
                  person.name
              ),

          number_of_seasons:
            details.number_of_seasons ||
            null,

          number_of_episodes:
            details.number_of_episodes ||
            null,

          runtime:
            details.runtime || null,

          vote_average:
            details.vote_average ||
            null,

          vote_count:
            details.vote_count ||
            null,
        },

        status,

        favorite,

        personal_rating:
          rating === ""
            ? null
            : Number(rating),

        review,
      };

      const response =
        await fetch("/api/library", {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify(
            payload
          ),
        });

      const result =
        await response.json();

      if (
        !response.ok ||
        result?.error
      ) {
        throw new Error(
          result?.error ||
            "Não foi possível adicionar à biblioteca."
        );
      }

      setLibraryItem(result);

      showMessage(
        `${title} adicionada à biblioteca 🟢`
      );
    } catch (error) {
      console.error(error);

      showMessage(
        error instanceof Error
          ? error.message
          : "Erro ao adicionar à biblioteca."
      );
    } finally {
      setSaving(false);
    }
  }

  async function removeFromLibrary() {
    if (!libraryItem || saving) {
      return;
    }

    try {
      setSaving(true);

      const response =
        await fetch(
          `/api/library/${libraryItem.id}`,
          {
            method: "DELETE",
          }
        );

      const result =
        await response.json();

      if (
        !response.ok ||
        result?.error
      ) {
        throw new Error(
          result?.error ||
            "Não foi possível remover da biblioteca."
        );
      }

      const title =
        details.title ||
        details.name ||
        "Título";

      setLibraryItem(null);

      showMessage(
        `${title} removida da biblioteca`
      );
    } catch (error) {
      console.error(error);

      showMessage(
        error instanceof Error
          ? error.message
          : "Erro ao remover da biblioteca."
      );
    } finally {
      setSaving(false);
    }
  }

  async function updateLibrary(
    field: string,
    value: any
  ) {
    if (!libraryItem) return;

    try {
      const response =
        await fetch(
          `/api/library/${libraryItem.id}`,
          {
            method: "PATCH",

            headers: {
              "Content-Type":
                "application/json",
            },

            body: JSON.stringify({
              [field]: value,
            }),
          }
        );

      const result =
        await response.json();

      if (
        !response.ok ||
        result?.error
      ) {
        throw new Error(
          result?.error ||
            "Erro ao atualizar."
        );
      }

      setLibraryItem(
        (current: any) => ({
          ...current,
          [field]: value,
        })
      );
    } catch (error) {
      console.error(error);
    }
  }

  if (
    loading ||
    !details?.id
  ) {
    return (
      <>
        <div className="topbar">
          <Search />
        </div>

        <div className="empty">
          Carregando título...
        </div>
      </>
    );
  }

  const type =
    params.type === "tv"
      ? "tv"
      : "movie";

  const title =
    details.title ||
    details.name;

  const year = (
    details.first_air_date ||
    details.release_date ||
    ""
  ).slice(0, 4);

  const runtime =
    details.runtime ||
    null;

  const tmdbRating =
    Number(
      details.vote_average || 0
    ).toFixed(1);

  const genres =
    (details.genres || [])
      .map(
        (genre: any) =>
          genre.name
      )
      .join(" · ");

  return (
    <>
      <div className="topbar title-topbar">
        <Search />
      </div>

      {message && (
        <div className="title-toast">
          <span>{message}</span>
        </div>
      )}

      {/* HERO */}

      <section className="title-hero">

        <div
          className="title-hero-backdrop"
          style={{
            backgroundImage: `url(${img(
              details.backdrop_path,
              "w1280"
            )})`,
          }}
        />

        <div className="title-hero-overlay" />

        <div className="title-hero-content">

          <div className="title-poster-wrap">
            <img
              src={img(
                details.poster_path
              )}
              alt={title}
              className="title-poster"
            />

            {libraryItem && (
              <div className="title-poster-status">
                <span className="status-dot" />
                Na biblioteca
              </div>
            )}
          </div>

          <div className="title-main">

            <div className="title-type">

              {type === "tv" ? (
                <Tv size={15} />
              ) : (
                <Film size={15} />
              )}

              {type === "tv"
                ? "Série"
                : "Filme"}

              {year && (
                <>
                  <span>•</span>
                  {year}
                </>
              )}

            </div>

            <h1>{title}</h1>

            {details.tagline && (
              <p className="title-tagline">
                “{details.tagline}”
              </p>
            )}

            <div className="title-ratings">

              <div className="title-rating tmdb-rating">
                <Star
                  size={18}
                  fill="currentColor"
                />

                <div>
                  <strong>
                    {tmdbRating}
                  </strong>

                  <span>
                    TMDB
                  </span>
                </div>
              </div>

              {libraryItem &&
                libraryItem.personal_rating !==
                  null &&
                libraryItem.personal_rating !==
                  undefined && (
                  <div className="title-rating my-rating">
                    <Star
                      size={18}
                      fill="currentColor"
                    />

                    <div>
                      <strong>
                        {Number(
                          libraryItem.personal_rating
                        ).toFixed(1)}
                      </strong>

                      <span>
                        Minha nota
                      </span>
                    </div>
                  </div>
                )}

            </div>

            <div className="title-actions">

              {!libraryItem ? (
                <button
                  className="btn primary title-main-btn"
                  onClick={
                    addToLibrary
                  }
                  disabled={saving}
                >
                  <Plus size={18} />

                  {saving
                    ? "Adicionando..."
                    : "Adicionar à biblioteca"}
                </button>
              ) : (
                <button
                  className="btn title-main-btn"
                  onClick={
                    removeFromLibrary
                  }
                  disabled={saving}
                >
                  <Trash2 size={18} />

                  {saving
                    ? "Removendo..."
                    : "Remover da biblioteca"}
                </button>
              )}

              <button
                className={
                  favorite
                    ? "btn favorite-btn active"
                    : "btn favorite-btn"
                }
                onClick={() => {
                  const value =
                    !favorite;

                  setFavorite(value);

                  if (libraryItem) {
                    updateLibrary(
                      "favorite",
                      value
                    );
                  }
                }}
              >
                <Heart
                  size={18}
                  fill={
                    favorite
                      ? "currentColor"
                      : "none"
                  }
                />

                {favorite
                  ? "Favoritado"
                  : "Favoritar"}
              </button>

            </div>

          </div>
        </div>
      </section>

      {/* INFORMAÇÕES */}

      <section className="title-info section">

        <div className="title-info-main">

          <div className="title-section-heading">
            <span>Sobre</span>
            <h2>
              {type === "tv"
                ? "Sobre a série"
                : "Sobre o filme"}
            </h2>
          </div>

          <p className="title-overview">
            {details.overview ||
              "Sem sinopse disponível."}
          </p>

          {genres && (
            <div className="title-genres">
              {(
                details.genres ||
                []
              ).map(
                (genre: any) => (
                  <span
                    key={genre.id}
                  >
                    {genre.name}
                  </span>
                )
              )}
            </div>
          )}

          <div className="title-facts">

            <div className="title-fact">
              <CalendarDays
                size={18}
              />

              <div>
                <span>
                  Lançamento
                </span>

                <strong>
                  {(
                    details.first_air_date ||
                    details.release_date ||
                    "—"
                  )
                    .split("-")
                    .reverse()
                    .join("/")}
                </strong>
              </div>
            </div>

            {runtime && (
              <div className="title-fact">
                <Clock3 size={18} />

                <div>
                  <span>
                    Duração
                  </span>

                  <strong>
                    {Math.floor(
                      runtime / 60
                    ) > 0
                      ? `${Math.floor(
                          runtime / 60
                        )}h ${
                          runtime % 60
                        }min`
                      : `${runtime}min`}
                  </strong>
                </div>
              </div>
            )}

            {type === "tv" && (
              <div className="title-fact">
                <Play size={18} />

                <div>
                  <span>
                    Conteúdo
                  </span>

                  <strong>
                    {details.number_of_seasons ||
                      0}{" "}
                    {details.number_of_seasons ===
                    1
                      ? "temporada"
                      : "temporadas"}
                    {" · "}
                    {details.number_of_episodes ||
                      0}{" "}
                    episódios
                  </strong>
                </div>
              </div>
            )}

          </div>

        </div>

        <aside className="title-sidebar">

          <div className="title-status-card">

            <div className="title-section-heading">
              <span>Minha coleção</span>
              <h3>
                Status
              </h3>
            </div>

            <select
              className="title-status-select"
              value={status}
              onChange={(event) => {
                const value =
                  event.target.value as Status;

                setStatus(value);

                if (libraryItem) {
                  updateLibrary(
                    "status",
                    value
                  );
                }
              }}
            >
              {Object.entries(
                STATUS_LABELS
              ).map(
                ([value, label]) => (
                  <option
                    key={value}
                    value={value}
                  >
                    {label}
                  </option>
                )
              )}
            </select>

            {!libraryItem && (
              <p className="title-status-hint">
                Adicione à biblioteca
                para acompanhar o
                status.
              </p>
            )}

          </div>

        </aside>

      </section>

      {/* AVALIAÇÃO */}

      {libraryItem && (
        <section className="section title-review-section">

          <div className="title-section-heading">
            <span>Sua experiência</span>
            <h2>
              Avaliação e opinião
            </h2>
          </div>

          <ReviewPanel
            libraryId={
              libraryItem.id
            }
            initialRating={
              libraryItem.personal_rating !==
                null &&
              libraryItem.personal_rating !==
                undefined
                ? Number(
                    libraryItem.personal_rating
                  )
                : null
            }
            initialReview={
              libraryItem.review || ""
            }
            onRatingChange={(
              value
            ) => {
              setRating(
                value === null
                  ? ""
                  : String(value)
              );
            }}
            onReviewChange={(
              value
            ) => {
              setReview(value);
            }}
          />

        </section>
      )}
    </>
  );
}