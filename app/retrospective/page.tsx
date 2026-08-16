"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import Link from "next/link";

import { Search } from "@/components/Search";
import { img } from "@/lib/tmdb";

import {
  CalendarRange,
  CheckCircle2,
  Clapperboard,
  Clock3,
  Film,
  RefreshCcw,
  Star,
  Trophy,
  Tv,
} from "lucide-react";

type ActivityEvent = {
  id: string;

  event_type:
    | "library_added"
    | "status_changed"
    | "season_completed"
    | "series_completed"
    | "rewatch_started";

  metadata:
    Record<string, any>;

  occurred_at:
    string;

  media: {
    id: string;

    tmdb_id: number;

    media_type:
      | "movie"
      | "tv";

    title: string;

    poster_path:
      string | null;

    seasons_count:
      number | null;

    runtime:
      number | null;

    genres:
      (
        | string
        | {
            id?: number;
            name?: string;
          }
      )[] | null;
  } | null;
};

function currentYear() {
  return new Date().getFullYear();
}

function getYearFromDate(
  date: string
) {
  return new Date(
    date
  ).getFullYear();
}

export default function RetrospectivePage() {
  const [year, setYear] =
    useState(
      currentYear()
    );

  const [events, setEvents] =
    useState<
      ActivityEvent[]
    >([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  /*
   * ==========================================
   * CARREGAR RETROSPECTIVA
   * ==========================================
   */

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setError("");

        const response =
          await fetch(
            `/api/activity?year=${year}&limit=1000`
          );

        const data =
          await response.json();

        if (
          !response.ok ||
          data?.error
        ) {
          throw new Error(
            data?.error ||
              "Não foi possível carregar a retrospectiva."
          );
        }

        setEvents(
          Array.isArray(
            data
          )
            ? data
            : []
        );
      } catch (err) {
        console.error(
          err
        );

        setError(
          err instanceof Error
            ? err.message
            : "Erro ao carregar retrospectiva."
        );
      } finally {
        setLoading(
          false
        );
      }
    }

    load();
  }, [year]);

  /*
   * ==========================================
   * ANOS DISPONÍVEIS
   * ==========================================
   */

  const yearOptions =
    useMemo(() => {
      const now =
        currentYear();

      return Array.from(
        {
          length: 10,
        },
        (_, index) =>
          now - index
      );
    }, []);

  /*
   * ==========================================
   * EVENTOS IMPORTANTES
   * ==========================================
   */

  const addedEvents =
    useMemo(
      () =>
        events.filter(
          (event) =>
            event.event_type ===
            "library_added"
        ),
      [events]
    );

  const seasonEvents =
    useMemo(
      () =>
        events.filter(
          (event) =>
            event.event_type ===
            "season_completed"
        ),
      [events]
    );

  const completedEvents =
    useMemo(
      () =>
        events.filter(
          (event) =>
            event.event_type ===
            "series_completed"
        ),
      [events]
    );

  const rewatchEvents =
    useMemo(
      () =>
        events.filter(
          (event) =>
            event.event_type ===
            "rewatch_started"
        ),
      [events]
    );

  /*
   * ==========================================
   * FILMES E SÉRIES ADICIONADOS
   * ==========================================
   */

  const moviesAdded =
    useMemo(
      () =>
        addedEvents.filter(
          (event) =>
            event.media
              ?.media_type ===
            "movie"
        ),
      [addedEvents]
    );

  const showsAdded =
    useMemo(
      () =>
        addedEvents.filter(
          (event) =>
            event.media
              ?.media_type ===
            "tv"
        ),
      [addedEvents]
    );

  /*
   * ==========================================
   * GÊNERO MAIS PRESENTE
   * ==========================================
   */

  const topGenre =
    useMemo(() => {
      const counts =
        new Map<
          string,
          number
        >();

      /*
       * Alguns registros do banco podem ter
       * gêneros como string:
       *
       * "Drama"
       *
       * e outros como objeto do TMDB:
       *
       * { id: 18, name: "Drama" }
       *
       * Aqui normalizamos os dois formatos.
       */

      for (
        const event
        of events
      ) {
        const genres =
          event.media
            ?.genres ||
          [];

        for (
          const genre
          of genres
        ) {
          const genreName =
            typeof genre ===
            "string"
              ? genre
              : genre?.name;

          if (!genreName) {
            continue;
          }

          counts.set(
            genreName,
            (
              counts.get(
                genreName
              ) || 0
            ) + 1
          );
        }
      }

      const sorted =
        Array.from(
          counts.entries()
        ).sort(
          (a, b) =>
            b[1] -
            a[1]
        );

      if (
        sorted.length ===
        0
      ) {
        return null;
      }

      return {
        name:
          sorted[0][0],

        count:
          sorted[0][1],
      };
    }, [
      events,
    ]);

  /*
   * ==========================================
   * TÍTULOS MAIS IMPORTANTES
   * ==========================================
   */

  const highlights =
    useMemo(() => {
      const map =
        new Map<
          string,
          {
            media:
              NonNullable<
                ActivityEvent["media"]
              >;

            score:
              number;
          }
        >();

      for (
        const event
        of events
      ) {
        if (
          !event.media
        ) {
          continue;
        }

        const key =
          `${event.media.media_type}-${event.media.tmdb_id}`;

        const current =
          map.get(
            key
          ) || {
            media:
              event.media,

            score: 0,
          };

        /*
         * Quanto mais relevante
         * o evento, maior o peso.
         */

        if (
          event.event_type ===
          "library_added"
        ) {
          current.score +=
            1;
        }

        if (
          event.event_type ===
          "season_completed"
        ) {
          current.score +=
            2;
        }

        if (
          event.event_type ===
          "rewatch_started"
        ) {
          current.score +=
            3;
        }

        if (
          event.event_type ===
          "series_completed"
        ) {
          current.score +=
            5;
        }

        map.set(
          key,
          current
        );
      }

      return Array.from(
        map.values()
      )
        .sort(
          (a, b) =>
            b.score -
            a.score
        )
        .slice(
          0,
          6
        );
    }, [
      events,
    ]);

  /*
   * ==========================================
   * MESES MAIS ATIVOS
   * ==========================================
   */

  const topMonth =
    useMemo(() => {
      const counts =
        new Map<
          number,
          number
        >();

      for (
        const event
        of events
      ) {
        const month =
          new Date(
            event.occurred_at
          ).getMonth();

        counts.set(
          month,
          (
            counts.get(
              month
            ) || 0
          ) + 1
        );
      }

      const sorted =
        Array.from(
          counts.entries()
        ).sort(
          (a, b) =>
            b[1] -
            a[1]
        );

      if (
        sorted.length ===
        0
      ) {
        return null;
      }

      const monthName =
        new Intl.DateTimeFormat(
          "pt-BR",
          {
            month:
              "long",
          }
        ).format(
          new Date(
            year,
            sorted[0][0],
            1
          )
        );

      return {
        name:
          monthName,

        count:
          sorted[0][1],
      };
    }, [
      events,
      year,
    ]);

  /*
   * ==========================================
   * TOTAL DE ATIVIDADES
   * ==========================================
   */

  const totalActivity =
    events.length;

  return (
    <>
      <div className="topbar">
        <Search />
      </div>

      <section className="section retrospective-head">

        <div>

          <div className="eyebrow">
            Seu ano no MyCatalog
          </div>

          <h1>
            Retrospectiva
          </h1>

          <p className="muted">
            Veja como foi seu ano
            entre filmes, séries,
            temporadas e
            reassistidas.
          </p>

        </div>

        <label className="retrospective-year">

          <CalendarRange
            size={17}
          />

          <select
            value={year}
            onChange={(
              event
            ) =>
              setYear(
                Number(
                  event.target
                    .value
                )
              )
            }
          >

            {yearOptions.map(
              (
                option
              ) => (
                <option
                  key={
                    option
                  }
                  value={
                    option
                  }
                >
                  {option}
                </option>
              )
            )}

          </select>

        </label>

      </section>

      {loading && (

        <div className="empty">
          Montando sua
          retrospectiva...
        </div>

      )}

      {!loading &&
        error && (

        <div className="empty">
          {error}
        </div>

      )}

      {!loading &&
        !error &&
        events.length ===
          0 && (

        <div className="empty retrospective-empty">

          <Trophy
            size={38}
          />

          <strong>
            Ainda não há
            atividades em{" "}
            {year}
          </strong>

          <span>
            Conforme você usar
            o MyCatalog, sua
            retrospectiva será
            criada
            automaticamente.
          </span>

        </div>

      )}

      {!loading &&
        !error &&
        events.length >
          0 && (
        <>

          {/* RESUMO */}

          <section className="section">

            <div className="retrospective-stats">

              <div className="panel retrospective-stat">

                <div className="retrospective-stat-icon">
                  <Film
                    size={20}
                  />
                </div>

                <span>
                  Filmes adicionados
                </span>

                <strong>
                  {
                    moviesAdded.length
                  }
                </strong>

              </div>

              <div className="panel retrospective-stat">

                <div className="retrospective-stat-icon">
                  <Tv
                    size={20}
                  />
                </div>

                <span>
                  Séries adicionadas
                </span>

                <strong>
                  {
                    showsAdded.length
                  }
                </strong>

              </div>

              <div className="panel retrospective-stat">

                <div className="retrospective-stat-icon">
                  <CheckCircle2
                    size={20}
                  />
                </div>

                <span>
                  Temporadas concluídas
                </span>

                <strong>
                  {
                    seasonEvents.length
                  }
                </strong>

              </div>

              <div className="panel retrospective-stat">

                <div className="retrospective-stat-icon">
                  <Trophy
                    size={20}
                  />
                </div>

                <span>
                  Séries concluídas
                </span>

                <strong>
                  {
                    completedEvents.length
                  }
                </strong>

              </div>

              <div className="panel retrospective-stat">

                <div className="retrospective-stat-icon">
                  <RefreshCcw
                    size={20}
                  />
                </div>

                <span>
                  Reassistidas
                </span>

                <strong>
                  {
                    rewatchEvents.length
                  }
                </strong>

              </div>

              <div className="panel retrospective-stat">

                <div className="retrospective-stat-icon">
                  <Clock3
                    size={20}
                  />
                </div>

                <span>
                  Atividades registradas
                </span>

                <strong>
                  {
                    totalActivity
                  }
                </strong>

              </div>

            </div>

          </section>

          {/* DESTAQUES */}

          <section className="section">

            <div className="title-section-heading">

              <span>
                Destaques
              </span>

              <h2>
                Seu {year}
              </h2>

            </div>

            <div className="retrospective-highlights">

              <div className="panel retrospective-highlight">

                <Star
                  size={20}
                />

                <span>
                  Gênero mais presente
                </span>

                <strong>
                  {topGenre
                    ? topGenre.name
                    : "—"}
                </strong>

                {topGenre && (
                  <small>
                    apareceu em{" "}
                    {
                      topGenre.count
                    }{" "}
                    atividades
                  </small>
                )}

              </div>

              <div className="panel retrospective-highlight">

                <CalendarRange
                  size={20}
                />

                <span>
                  Mês mais ativo
                </span>

                <strong className="capitalize">
                  {topMonth
                    ? topMonth.name
                    : "—"}
                </strong>

                {topMonth && (
                  <small>
                    {
                      topMonth.count
                    }{" "}
                    atividades
                  </small>
                )}

              </div>

              <div className="panel retrospective-highlight">

                <CheckCircle2
                  size={20}
                />

                <span>
                  Temporadas finalizadas
                </span>

                <strong>
                  {
                    seasonEvents.length
                  }
                </strong>

                <small>
                  durante {year}
                </small>

              </div>

              <div className="panel retrospective-highlight">

                <RefreshCcw
                  size={20}
                />

                <span>
                  Reassistidas iniciadas
                </span>

                <strong>
                  {
                    rewatchEvents.length
                  }
                </strong>

                <small>
                  durante {year}
                </small>

              </div>

            </div>

          </section>

          {/* TÍTULOS MARCANTES */}

          {highlights.length >
            0 && (

            <section className="section">

              <div className="title-section-heading">

                <span>
                  Memórias do ano
                </span>

                <h2>
                  Títulos que marcaram seu {year}
                </h2>

              </div>

              <div className="retrospective-posters">

                {highlights.map(
                  (
                    highlight
                  ) => {

                    const media =
                      highlight.media;

                    return (
                      <Link
                        key={`${media.media_type}-${media.tmdb_id}`}
                        href={`/title/${media.media_type}/${media.tmdb_id}`}
                        className="panel retrospective-media"
                      >

                        {media.poster_path ? (

                          <img loading="lazy" decoding="async"
                            src={img(
                              media.poster_path
                            )}
                            alt={
                              media.title
                            }
                          />

                        ) : (

                          <div className="retrospective-media-placeholder">

                            {media.media_type ===
                            "tv" ? (
                              <Tv
                                size={30}
                              />
                            ) : (
                              <Clapperboard
                                size={30}
                              />
                            )}

                          </div>

                        )}

                        <div>

                          <strong>
                            {
                              media.title
                            }
                          </strong>

                          <span className="muted">
                            {media.media_type ===
                            "tv"
                              ? "Série"
                              : "Filme"}
                          </span>

                        </div>

                      </Link>
                    );
                  }
                )}

              </div>

            </section>

          )}

          {/* LINHA DO TEMPO RESUMIDA */}

          <section className="section">

            <div className="title-section-heading">

              <span>
                Linha do tempo
              </span>

              <h2>
                Atividades de {year}
              </h2>

            </div>

            <div className="retrospective-timeline">

              {events
                .slice(
                  0,
                  12
                )
                .map(
                  (
                    event
                  ) => {

                    const media =
                      event.media;

                    return (
                      <div
                        key={
                          event.id
                        }
                        className="panel retrospective-timeline-item"
                      >

                        <div className="retrospective-timeline-date">

                          {new Intl.DateTimeFormat(
                            "pt-BR",
                            {
                              day:
                                "2-digit",
                              month:
                                "short",
                            }
                          ).format(
                            new Date(
                              event.occurred_at
                            )
                          )}

                        </div>

                        <div>

                          <strong>
                            {media
                              ?.title ||
                              "Título removido"}
                          </strong>

                          <span className="muted">

                            {event.event_type ===
                              "library_added" &&
                              "Adicionado à biblioteca"}

                            {event.event_type ===
                              "season_completed" &&
                              `Temporada ${event.metadata?.season ?? "—"} concluída`}

                            {event.event_type ===
                              "series_completed" &&
                              "Série concluída"}

                            {event.event_type ===
                              "rewatch_started" &&
                              "Começou a reassistir"}

                            {event.event_type ===
                              "status_changed" &&
                              event.metadata?.to ===
                                "dropped" &&
                              `Abandonou na temporada ${
                                event.metadata
                                  ?.stopped_season ||
                                event.metadata
                                  ?.current_season ||
                                "?"
                              }`}

                            {event.event_type ===
                              "status_changed" &&
                              event.metadata?.to !==
                                "dropped" &&
                              `Mudou o status para ${
                                event.metadata
                                  ?.to ||
                                "—"
                              }`}

                          </span>

                        </div>

                      </div>
                    );
                  }
                )}

            </div>

          </section>

        </>
      )}
    </>
  );
}