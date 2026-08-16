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
  CalendarDays,
  Clapperboard,
  Clock3,
  Film,
  Play,
  Tv,
} from "lucide-react";

type CalendarEvent = {
  tmdb_id: number;

  media_type:
    | "movie"
    | "tv";

  title: string;

  poster_path:
    string | null;

  backdrop_path:
    string | null;

  date:
    string | null;

  event_type:
    | "movie_release"
    | "episode"
    | "season"
    | "series_premiere";

  season_number:
    number | null;

  episode_number:
    number | null;

  episode_name:
    string | null;

  release_type:
    number | null;

  release_label:
    string | null;

  status:
    string | null;

  overview:
    string | null;

  source:
    | "library"
    | "discovery";

  in_library:
    boolean;

  library_item_id:
    string | null;

  library_status:
    string | null;

  current_season:
    number | null;

  completed_seasons:
    number;

  stopped_season:
    number | null;

  popularity?: number;

  vote_average?: number;

  original_language?: string | null;
};

function dateKey(
  date: string
) {
  const d =
    new Date(
      `${date}T00:00:00`
    );

  return [
    d.getFullYear(),

    String(
      d.getMonth() + 1
    ).padStart(
      2,
      "0"
    ),

    String(
      d.getDate()
    ).padStart(
      2,
      "0"
    ),
  ].join("-");
}

function formatFullDate(
  date: string
) {
  return new Intl.DateTimeFormat(
    "pt-BR",
    {
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric",
    }
  ).format(
    new Date(
      `${date}T00:00:00`
    )
  );
}

function formatShortDate(
  date: string
) {
  const parsed =
    new Date(
      `${date}T00:00:00`
    );

  return {
    day:
      String(
        parsed.getDate()
      ).padStart(
        2,
        "0"
      ),

    month:
      new Intl.DateTimeFormat(
        "pt-BR",
        {
          month: "short",
        }
      )
        .format(parsed)
        .replace(".", "")
        .toUpperCase(),
  };
}

function eventLabel(
  event: CalendarEvent
) {
  if (
    event.event_type ===
    "movie_release"
  ) {
    return (
      event.release_label ||
      "Lançamento"
    );
  }

  if (
    event.event_type ===
    "season"
  ) {
    return event.season_number
      ? `Estreia da temporada ${event.season_number}`
      : "Nova temporada";
  }

  if (
    event.event_type ===
    "series_premiere"
  ) {
    return "Estreia de série";
  }

  if (
    event.event_type ===
    "episode"
  ) {
    const season =
      event.season_number;

    const episode =
      event.episode_number;

    if (
      season &&
      episode
    ) {
      return `T${season} · E${episode}`;
    }

    return "Novo episódio";
  }

  return "Lançamento";
}

function eventDescription(
  event: CalendarEvent
) {
  if (
    event.event_type ===
    "movie_release"
  ) {
    return (
      event.release_label ||
      "Lançamento do filme"
    );
  }

  if (
    event.event_type ===
    "season"
  ) {
    return event.season_number
      ? `Temporada ${event.season_number}`
      : "Nova temporada";
  }

  if (
    event.event_type ===
    "series_premiere"
  ) {
    return "Nova série estreando";
  }

  if (
    event.event_type ===
    "episode"
  ) {
    const season =
      event.season_number;

    const episode =
      event.episode_number;

    const episodeName =
      event.episode_name;

    if (
      season &&
      episode &&
      episodeName
    ) {
      return `Temporada ${season}, episódio ${episode} · ${episodeName}`;
    }

    if (
      season &&
      episode
    ) {
      return `Temporada ${season}, episódio ${episode}`;
    }

    return (
      episodeName ||
      "Novo episódio"
    );
  }

  return "Lançamento";
}

export default function CalendarPage() {
  const [
    events,
    setEvents,
  ] =
    useState<
      CalendarEvent[]
    >([]);

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    error,
    setError,
  ] =
    useState("");

  const [
    filter,
    setFilter,
  ] =
    useState<
      "all" | "library" | "movie" | "tv"
    >("all");

  useEffect(() => {
    async function load() {
      try {
        setLoading(
          true
        );

        setError("");

        const response =
          await fetch(
            "/api/calendar",
            {
              cache:
                "no-store",
            }
          );

        const data =
          await response.json();

        if (
          !response.ok ||
          data?.error
        ) {
          throw new Error(
            data?.error ||
              "Não foi possível carregar o calendário."
          );
        }

        const allEvents =
          Array.isArray(data?.all)
            ? data.all
            : [];

        setEvents(allEvents);
      } catch (err) {
        console.error(
          err
        );

        setError(
          err instanceof Error
            ? err.message
            : "Erro ao carregar calendário."
        );
      } finally {
        setLoading(
          false
        );
      }
    }

    load();
  }, []);

  const filteredEvents =
    useMemo(() => {
      if (
        filter ===
        "all"
      ) {
        return events;
      }

      if (
        filter ===
        "library"
      ) {
        return events.filter(
          (event) =>
            event.in_library
        );
      }

      return events.filter(
        (event) =>
          event.media_type ===
          filter
      );
    }, [
      events,
      filter,
    ]);

  const groupedEvents =
    useMemo(() => {
      const groups:
        Record<
          string,
          CalendarEvent[]
        > = {};

      for (
        const event
        of filteredEvents
      ) {
        if (
          !event.date
        ) {
          continue;
        }

        const key =
          dateKey(
            event.date
          );

        if (
          !groups[key]
        ) {
          groups[key] =
            [];
        }

        groups[key].push(
          event
        );
      }

      return Object.entries(
        groups
      ).sort(
        ([a], [b]) =>
          new Date(
            a
          ).getTime() -
          new Date(
            b
          ).getTime()
      );
    }, [
      filteredEvents,
    ]);

  const nextEvent =
    filteredEvents[0] ||
    null;

  return (
    <>
      <div className="topbar">
        <Search />
      </div>

      <section className="section calendar-head">

        <div>

          <div className="eyebrow">
            O que vem por aí
          </div>

          <h1>
            Calendário
          </h1>

          <p className="muted">
            Próximos episódios,
            novas temporadas,
            filmes e séries que
            estão chegando.
          </p>

        </div>

        <div className="calendar-filters">

          <button
            className={
              filter === "all"
                ? "btn active"
                : "btn"
            }
            onClick={() =>
              setFilter(
                "all"
              )
            }
          >
            Todos
          </button>

          <button
            className={
              filter === "library"
                ? "btn active"
                : "btn"
            }
            onClick={() =>
              setFilter(
                "library"
              )
            }
          >
            Minha biblioteca
          </button>

          <button
            className={
              filter === "movie"
                ? "btn active"
                : "btn"
            }
            onClick={() =>
              setFilter(
                "movie"
              )
            }
          >
            <Film
              size={15}
            />

            Filmes
          </button>

          <button
            className={
              filter === "tv"
                ? "btn active"
                : "btn"
            }
            onClick={() =>
              setFilter(
                "tv"
              )
            }
          >
            <Tv
              size={15}
            />

            Séries
          </button>

        </div>

      </section>

      {loading && (
        <div className="empty">
          Buscando próximos
          lançamentos...
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
        filteredEvents.length ===
          0 && (
        <div className="empty calendar-empty">

          <CalendarDays
            size={38}
          />

          <strong>
            Nenhum lançamento
            próximo encontrado
          </strong>

          <span>
            Quando houver novos
            filmes, séries, episódios
            ou temporadas com data no
            TMDB, eles aparecerão aqui
            automaticamente.
          </span>

        </div>
      )}

      {!loading &&
        !error &&
        nextEvent && (

        <section className="section">

          <div className="title-section-heading">

            <span>
              Próximo
            </span>

            <h2>
              Mais perto de chegar
            </h2>

          </div>

          <Link
            href={`/title/${nextEvent.media_type}/${nextEvent.tmdb_id}`}
            className="panel calendar-featured"
          >

            {nextEvent.backdrop_path && (
              <div
                className="calendar-featured-bg"
                style={{
                  backgroundImage:
                    `url(${img(
                      nextEvent.backdrop_path,
                      "w1280"
                    )})`,
                }}
              />
            )}

            <div className="calendar-featured-overlay" />

            <div className="calendar-featured-content">

              <div className="calendar-featured-date">

                <strong>
                  {
                    formatShortDate(
                      nextEvent.date!
                    ).day
                  }
                </strong>

                <span>
                  {
                    formatShortDate(
                      nextEvent.date!
                    ).month
                  }
                </span>

              </div>

              <div className="calendar-featured-info">

                <span className="calendar-featured-type">

                  {nextEvent.media_type ===
                  "tv" ? (
                    <Tv
                      size={14}
                    />
                  ) : (
                    <Film
                      size={14}
                    />
                  )}

                  {eventLabel(
                    nextEvent
                  )}

                  {nextEvent.in_library && (
                    <b className="calendar-library-badge">
                      Na sua biblioteca
                    </b>
                  )}

                </span>

                <h2>
                  {
                    nextEvent.title
                  }
                </h2>

                <p>
                  {eventDescription(
                    nextEvent
                  )}
                </p>

              </div>

            </div>

          </Link>

        </section>
      )}

      {!loading &&
        !error &&
        groupedEvents.length >
          0 && (

        <section className="section">

          <div className="title-section-heading">

            <span>
              Agenda
            </span>

            <h2>
              Agenda completa
            </h2>

          </div>

          <div className="calendar-list">

            {groupedEvents.map(
              ([
                date,
                dayEvents,
              ]) => (

                <div
                  key={date}
                  className="calendar-day"
                >

                  <div className="calendar-day-head">

                    <CalendarDays
                      size={15}
                    />

                    <strong>
                      {formatFullDate(
                        dayEvents[0]
                          .date!
                      )}
                    </strong>

                    <span>
                      {
                        dayEvents.length
                      }{" "}
                      {dayEvents.length ===
                      1
                        ? "lançamento"
                        : "lançamentos"}
                    </span>

                  </div>

                  <div className="calendar-day-items">

                    {dayEvents.map(
                      (
                        event
                      ) => {

                        const shortDate =
                          formatShortDate(
                            event.date!
                          );

                        return (
                          <Link
                            key={[
                              event.tmdb_id,
                              event.event_type,
                              event.date,
                              event.season_number,
                              event.episode_number,
                            ].join(
                              "-"
                            )}
                            href={`/title/${event.media_type}/${event.tmdb_id}`}
                            className="panel calendar-item"
                          >

                            <div className="calendar-date-box">

                              <strong>
                                {
                                  shortDate.day
                                }
                              </strong>

                              <span>
                                {
                                  shortDate.month
                                }
                              </span>

                            </div>

                            <div className="calendar-poster-wrap">

                              {event.poster_path ? (
                                <img loading="lazy" decoding="async"
                                  src={img(
                                    event.poster_path,
                                    "w185"
                                  )}
                                  alt={
                                    event.title
                                  }
                                  className="calendar-poster"
                                />
                              ) : (
                                <div className="calendar-poster calendar-poster-placeholder">

                                  {event.media_type ===
                                  "tv" ? (
                                    <Tv
                                      size={22}
                                    />
                                  ) : (
                                    <Clapperboard
                                      size={22}
                                    />
                                  )}

                                </div>
                              )}

                            </div>

                            <div className="calendar-item-content">

                              <div className="calendar-item-type">

                                {event.media_type ===
                                "tv" ? (
                                  <Tv
                                    size={13}
                                  />
                                ) : (
                                  <Film
                                    size={13}
                                  />
                                )}

                                <span>
                                  {eventLabel(
                                    event
                                  )}
                                </span>

                                {event.in_library && (
                                  <b className="calendar-library-badge">
                                    Na sua biblioteca
                                  </b>
                                )}

                              </div>

                              <strong className="calendar-item-title">
                                {
                                  event.title
                                }
                              </strong>

                              <span className="calendar-item-description">
                                {eventDescription(
                                  event
                                )}
                              </span>

                              {event.event_type ===
                                "episode" &&
                                event.in_library && (
                                <div className="calendar-progress-info">

                                  <Play
                                    size={12}
                                  />

                                  <span>
                                    Você está na T
                                    {event.current_season ||
                                      1}
                                  </span>

                                </div>
                              )}

                            </div>

                            <div className="calendar-item-arrow">
                              →
                            </div>

                          </Link>
                        );
                      }
                    )}

                  </div>

                </div>
              )
            )}

          </div>

        </section>
      )}
    </>
  );
}