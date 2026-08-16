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
  CheckCircle2,
  Clapperboard,
  History,
  Plus,
  RefreshCcw,
  Star,
  Tv,
  XCircle,
} from "lucide-react";

type ActivityEvent = {
  id: string;

  event_type:
    | "library_added"
    | "status_changed"
    | "season_completed"
    | "series_completed"
    | "rewatch_started"
    | "watch_logged";

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

const STATUS_LABELS: Record<
  string,
  string
> = {
  want:
    "Quero assistir",

  watching:
    "Assistindo",

  watched:
    "Assistido",

  dropped:
    "Abandonei",

  rewatching:
    "Reassistindo",

  rewatched:
    "Reassistido",
};

function formatDate(
  date: string
) {
  return new Intl.DateTimeFormat(
    "pt-BR",
    {
      day: "2-digit",
      month: "long",
      year: "numeric",
    }
  ).format(
    new Date(date)
  );
}

function formatTime(
  date: string
) {
  return new Intl.DateTimeFormat(
    "pt-BR",
    {
      hour: "2-digit",
      minute: "2-digit",
    }
  ).format(
    new Date(date)
  );
}

function dateKey(
  date: string
) {
  const d =
    new Date(date);

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

function eventDescription(
  event: ActivityEvent
) {
  const meta =
    event.metadata ||
    {};

  switch (
    event.event_type
  ) {
    case "library_added":
      return "Adicionou à biblioteca";

    case "season_completed":
      return `Concluiu a temporada ${
        meta.season ?? "—"
      }`;

    case "series_completed":
      return "Concluiu a série";

    case "rewatch_started":
      return meta.rewatch_count
        ? `Começou a reassistir pela ${meta.rewatch_count}ª vez`
        : "Começou a reassistir";

    case "watch_logged":
      return meta.is_rewatch
        ? meta.rating !==
            null &&
          meta.rating !==
            undefined
          ? `Reassistiu e deu nota ${Number(
              meta.rating
            ).toFixed(1)}`
          : "Reassistiu"
        : meta.rating !==
            null &&
          meta.rating !==
            undefined
          ? `Assistiu e deu nota ${Number(
              meta.rating
            ).toFixed(1)}`
          : "Assistiu";

    case "status_changed": {
      const from =
        STATUS_LABELS[
          meta.from
        ] ||
        meta.from ||
        "—";

      const to =
        STATUS_LABELS[
          meta.to
        ] ||
        meta.to ||
        "—";

      if (
        meta.to ===
        "dropped"
      ) {
        const season =
          meta.stopped_season ||
          meta.current_season ||
          meta.season;

        return season
          ? `Abandonou na temporada ${season}`
          : "Marcou como Abandonei";
      }

      return `Mudou de ${from} para ${to}`;
    }

    default:
      return "Atualizou o título";
  }
}

function eventIcon(
  event: ActivityEvent
) {
  switch (
    event.event_type
  ) {
    case "library_added":
      return (
        <Plus
          size={17}
        />
      );

    case "season_completed":
      return (
        <CheckCircle2
          size={17}
        />
      );

    case "series_completed":
      return (
        <Star
          size={17}
        />
      );

    case "rewatch_started":
      return (
        <RefreshCcw
          size={17}
        />
      );

    case "watch_logged":
      return (
        <CheckCircle2
          size={17}
        />
      );

    case "status_changed":
      if (
        event.metadata
          ?.to ===
        "dropped"
      ) {
        return (
          <XCircle
            size={17}
          />
        );
      }

      return (
        <History
          size={17}
        />
      );

    default:
      return (
        <History
          size={17}
        />
      );
  }
}

export default function DiaryPage() {
  const [
    events,
    setEvents,
  ] =
    useState<
      ActivityEvent[]
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

  useEffect(() => {
    async function load() {
      try {
        setLoading(
          true
        );

        setError("");

        const response =
          await fetch(
            "/api/activity?limit=500",
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
              "Não foi possível carregar o Diário."
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
            : "Erro ao carregar o Diário."
        );
      } finally {
        setLoading(
          false
        );
      }
    }

    load();
  }, []);

  const groupedEvents =
    useMemo(() => {
      const groups:
        Record<
          string,
          ActivityEvent[]
        > = {};

      for (
        const event
        of events
      ) {
        const key =
          dateKey(
            event.occurred_at
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
            b
          ).getTime() -
          new Date(
            a
          ).getTime()
      );
    }, [
      events,
    ]);

  return (
    <>
      <div className="topbar">
        <Search />
      </div>

      <section className="section">

        <div className="eyebrow">
          Sua história
        </div>

        <h1>
          Diário
        </h1>

        <p className="muted">
          Um histórico automático
          do que você adicionou,
          assistiu, reassistiu,
          concluiu ou abandonou.
        </p>

      </section>

      {loading && (
        <div className="empty">
          Carregando Diário...
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
        <div className="empty diary-empty">

          <History
            size={34}
          />

          <strong>
            Seu Diário ainda
            está vazio
          </strong>

          <span>
            As próximas
            atividades do
            MyCatalog aparecerão
            aqui automaticamente.
          </span>

        </div>
      )}

      {!loading &&
        !error &&
        groupedEvents.length >
          0 && (
        <div className="diary">

          {groupedEvents.map(
            ([
              date,
              dayEvents,
            ]) => (
              <section
                key={date}
                className="diary-day"
              >

                <div className="diary-date">

                  <CalendarDays
                    size={16}
                  />

                  <strong>
                    {formatDate(
                      dayEvents[0]
                        .occurred_at
                    )}
                  </strong>

                  <span>
                    {
                      dayEvents.length
                    }{" "}
                    {dayEvents.length ===
                    1
                      ? "atividade"
                      : "atividades"}
                  </span>

                </div>

                <div className="diary-list">

                  {dayEvents.map(
                    (
                      event
                    ) => {
                      const media =
                        event.media;

                      const href =
                        media
                          ? `/title/${media.media_type}/${media.tmdb_id}`
                          : "#";

                      return (
                        <article
                          key={
                            event.id
                          }
                          className="panel diary-item"
                        >

                          <div className="diary-time">
                            {formatTime(
                              event.occurred_at
                            )}
                          </div>

                          {media?.poster_path ? (
                            <Link
                              href={
                                href
                              }
                              className="diary-poster-link"
                            >
                              <img loading="lazy" decoding="async"
                                src={img(
                                  media.poster_path,
                                  "w185"
                                )}
                                alt={
                                  media.title
                                }
                                className="diary-poster"
                              />
                            </Link>
                          ) : (
                            <div className="diary-poster diary-poster-placeholder">

                              {media?.media_type ===
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

                          <div className="diary-content">

                            <div className="diary-event">

                              <div className="diary-event-icon">
                                {eventIcon(
                                  event
                                )}
                              </div>

                              <span>
                                {eventDescription(
                                  event
                                )}
                              </span>

                            </div>

                            {media ? (
                              <Link
                                href={
                                  href
                                }
                                className="diary-title"
                              >
                                {
                                  media.title
                                }
                              </Link>
                            ) : (
                              <strong className="diary-title">
                                Título removido
                              </strong>
                            )}

                            {event.event_type ===
                              "watch_logged" && (
                              <div className="diary-watch-session">
                                <div className="diary-watch-session-badges">
                                  {event.metadata?.rating !==
                                    null &&
                                    event.metadata?.rating !==
                                      undefined && (
                                    <span className="diary-watch-rating">
                                      <Star
                                        size={12}
                                        fill="currentColor"
                                      />

                                      {Number(
                                        event.metadata.rating
                                      ).toFixed(
                                        1
                                      )}
                                    </span>
                                  )}

                                  <span className="diary-watch-type">
                                    {event.metadata?.is_rewatch
                                      ? "Reassistida"
                                      : "Visualização"}
                                  </span>

                                  {event.metadata?.watch_number && (
                                    <span className="diary-watch-number">
                                      #{Number(
                                        event.metadata.watch_number
                                      )}
                                    </span>
                                  )}
                                </div>

                                {event.metadata?.comment && (
                                  <p className="diary-watch-comment">
                                    {
                                      event.metadata.comment
                                    }
                                  </p>
                                )}
                              </div>
                            )}

                            {media && (
                              <div className="diary-meta">

                                <span>
                                  {media.media_type ===
                                  "tv"
                                    ? "Série"
                                    : "Filme"}
                                </span>

                                {event.event_type ===
                                  "season_completed" &&
                                  event.metadata
                                    ?.season && (
                                  <>
                                    <span>
                                      •
                                    </span>

                                    <span>
                                      Temporada{" "}
                                      {
                                        event
                                          .metadata
                                          .season
                                      }
                                    </span>
                                  </>
                                )}

                                {event.event_type ===
                                  "status_changed" &&
                                  event.metadata
                                    ?.to ===
                                    "dropped" && (
                                  <>
                                    <span>
                                      •
                                    </span>

                                    <span>
                                      Parou na T
                                      {event
                                        .metadata
                                        ?.stopped_season ||
                                        event
                                          .metadata
                                          ?.current_season ||
                                        "?"}
                                    </span>
                                  </>
                                )}

                              </div>
                            )}

                          </div>

                        </article>
                      );
                    }
                  )}

                </div>

              </section>
            )
          )}

        </div>
      )}
    </>
  );
}