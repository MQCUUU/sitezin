"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import Link from "next/link";

import {
  CalendarDays,
  ChevronRight,
  Clock3,
  Loader2,
  Play,
  Radio,
  Tv,
} from "lucide-react";

import {
  img,
} from "@/lib/tmdb";

type Episode = {
  id:
    number;

  season_number:
    number;

  episode_number:
    number;

  name:
    string;

  overview:
    string;

  air_date:
    string;

  runtime:
    number |
    null;

  still_path:
    string |
    null;

  vote_average:
    number |
    null;
};

type Schedule = {
  id:
    number;

  name:
    string;

  status:
    string |
    null;

  in_production:
    boolean;

  number_of_seasons:
    number;

  number_of_episodes:
    number;

  last_episode_to_air:
    any;

  next_episode_to_air:
    any;

  next_season:
    any;

  upcoming:
    Episode[];
};

function formatDate(
  value:
    string
) {
  return new Intl.DateTimeFormat(
    "pt-BR",
    {
      weekday:
        "short",

      day:
        "2-digit",

      month:
        "short",

      year:
        "numeric",
    }
  )
    .format(
      new Date(
        `${value}T12:00:00`
      )
    )
    .replace(
      ".",
      ""
    );
}

function daysUntil(
  value:
    string
) {
  const now =
    new Date();

  const today =
    new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    );

  const target =
    new Date(
      `${value}T12:00:00`
    );

  const targetDay =
    new Date(
      target.getFullYear(),
      target.getMonth(),
      target.getDate()
    );

  return Math.round(
    (
      targetDay.getTime() -
      today.getTime()
    ) /
      86400000
  );
}

function countdownLabel(
  value:
    string
) {
  const days =
    daysUntil(
      value
    );

  if (
    days < 0
  ) {
    return "Já lançado";
  }

  if (
    days ===
    0
  ) {
    return "Hoje";
  }

  if (
    days ===
    1
  ) {
    return "Amanhã";
  }

  if (
    days <=
    7
  ) {
    return `Em ${days} dias`;
  }

  return `Em ${days} dias`;
}

export function SeriesSchedule({
  tvId,
  libraryItem,
}: {
  tvId:
    number |
    string;

  libraryItem?:
    any;
}) {
  const [
    data,
    setData,
  ] =
    useState<
      Schedule |
      null
    >(null);

  const [
    loading,
    setLoading,
  ] =
    useState(
      true
    );

  const [
    error,
    setError,
  ] =
    useState("");

  useEffect(() => {
    let cancelled =
      false;

    async function load() {
      try {
        setLoading(
          true
        );

        setError(
          ""
        );

        const response =
          await fetch(
            `/api/tv/${tvId}/schedule`
          );

        const result =
          await response.json();

        if (
          !response.ok ||
          result?.error
        ) {
          throw new Error(
            result?.error ||
              "Não foi possível carregar os próximos episódios."
          );
        }

        if (
          !cancelled
        ) {
          setData(
            result
          );
        }
      } catch (
        error
      ) {
        if (
          !cancelled
        ) {
          setError(
            error instanceof Error
              ? error.message
              : "Erro ao carregar episódios."
          );
        }
      } finally {
        if (
          !cancelled
        ) {
          setLoading(
            false
          );
        }
      }
    }

    load();

    return () => {
      cancelled =
        true;
    };
  }, [
    tvId,
  ]);

  const next =
    data
      ?.upcoming?.[
        0
      ] ||
    null;

  const currentSeason =
    Number(
      libraryItem
        ?.current_season ||
        1
    );

  const relevantEpisodes =
    useMemo(
      () => {
        if (
          !data
        ) {
          return [];
        }

        return (
          data.upcoming ||
          []
        ).slice(
          0,
          8
        );
      },
      [
        data,
      ]
    );

  if (
    loading
  ) {
    return (
      <section className="series-schedule panel">
        <div className="series-schedule-loading">
          <Loader2
            size={20}
            className="spin"
          />

          Buscando próximos episódios...
        </div>
      </section>
    );
  }

  if (
    error
  ) {
    return null;
  }

  if (
    !data
  ) {
    return null;
  }

  return (
    <section className="series-schedule">
      <div className="series-schedule-head">
        <div>
          <span className="eyebrow">
            AGENDA DA SÉRIE
          </span>

          <h2>
            Próximos episódios
          </h2>

          <p className="muted">
            Datas informadas pelo TMDB para os próximos lançamentos da série.
          </p>
        </div>

        <Link
          href="/calendar"
          className="btn"
        >
          <CalendarDays
            size={15}
          />

          Ver calendário
        </Link>
      </div>

      {next ? (
        <>
          <div className="series-next-episode panel">
            <div className="series-next-visual">
              {next.still_path ? (
                <img loading="lazy" decoding="async"
                  src={img(
                    next.still_path,
                    "w780"
                  )}
                  alt={
                    next.name
                  }
                />
              ) : (
                <div className="series-next-placeholder">
                  <Tv
                    size={34}
                  />
                </div>
              )}

              <span className="series-next-countdown">
                <Radio
                  size={12}
                />

                {countdownLabel(
                  next.air_date
                )}
              </span>
            </div>

            <div className="series-next-copy">
              <div className="series-next-kicker">
                PRÓXIMO LANÇAMENTO
              </div>

              <div className="series-next-code">
                T{
                  next.season_number
                }
                E{
                  next.episode_number
                }
              </div>

              <h3>
                {
                  next.name
                }
              </h3>

              <div className="series-next-meta">
                <span>
                  <CalendarDays
                    size={13}
                  />

                  {formatDate(
                    next.air_date
                  )}
                </span>

                {next.runtime && (
                  <span>
                    <Clock3
                      size={13}
                    />

                    {
                      next.runtime
                    } min
                  </span>
                )}
              </div>

              {next.overview && (
                <p>
                  {
                    next.overview
                  }
                </p>
              )}

              {libraryItem && (
                <div className="series-progress-hint">
                  <Play
                    size={13}
                  />

                  Você está na temporada{" "}
                  <strong>
                    {
                      currentSeason
                    }
                  </strong>

                  {next.season_number >
                    currentSeason && (
                    <span>
                      · Este episódio é de uma temporada futura para você
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          {relevantEpisodes.length >
            1 && (
            <div className="series-episode-list">
              {relevantEpisodes.map(
                (
                  episode,
                  index
                ) => (
                  <article
                    key={`${episode.season_number}-${episode.episode_number}-${episode.id}`}
                    className={
                      "series-episode-row panel " +
                      (index ===
                      0
                        ? "next"
                        : "")
                    }
                  >
                    <div className="series-episode-date">
                      <strong>
                        {new Intl.DateTimeFormat(
                          "pt-BR",
                          {
                            day:
                              "2-digit",
                          }
                        ).format(
                          new Date(
                            `${episode.air_date}T12:00:00`
                          )
                        )}
                      </strong>

                      <span>
                        {new Intl.DateTimeFormat(
                          "pt-BR",
                          {
                            month:
                              "short",
                          }
                        )
                          .format(
                            new Date(
                              `${episode.air_date}T12:00:00`
                            )
                          )
                          .replace(
                            ".",
                            ""
                          )}
                      </span>
                    </div>

                    <div className="series-episode-number">
                      T{
                        episode.season_number
                      }
                      E{
                        episode.episode_number
                      }
                    </div>

                    <div className="series-episode-info">
                      <strong>
                        {
                          episode.name
                        }
                      </strong>

                      <span>
                        {formatDate(
                          episode.air_date
                        )}

                        {episode.runtime
                          ? ` · ${episode.runtime} min`
                          : ""}
                      </span>
                    </div>

                    <div className="series-episode-when">
                      {countdownLabel(
                        episode.air_date
                      )}
                    </div>

                    <ChevronRight
                      size={16}
                    />
                  </article>
                )
              )}
            </div>
          )}
        </>
      ) : (
        <div className="series-schedule-empty panel">
          <CalendarDays
            size={27}
          />

          <div>
            <strong>
              Nenhum próximo episódio com data
            </strong>

            <span>
              {data.in_production
                ? "A série ainda está em produção, mas o TMDB não possui um próximo episódio agendado no momento."
                : "Não há novos episódios anunciados para esta série no momento."}
            </span>
          </div>
        </div>
      )}
    </section>
  );
}