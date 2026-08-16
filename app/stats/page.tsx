"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import { Search } from "@/components/Search";

import {
  Film,
  Tv,
  Star,
  Heart,
  Clock3,
  Play,
  Check,
  XCircle,
  Clock,
  RotateCcw,
  Trophy,
} from "lucide-react";

import type {
  LibraryItem,
} from "@/lib/types";

export default function Stats() {
  const [data, setData] =
    useState<LibraryItem[]>([]);

  useEffect(() => {
  const controller =
    new AbortController();

  async function loadStats() {
    try {
      const response = await fetch(
        "/api/library",
        {
          cache: "no-store",
          signal: controller.signal,
        },
      );

      if (!response.ok) {
        throw new Error(
          "Não foi possível carregar as estatísticas.",
        );
      }

      const result =
        await response.json();

      if (
        controller.signal.aborted
      ) {
        return;
      }

      setData(
        Array.isArray(result)
          ? result.map(
              (item: any) => ({
                ...item,
                library_id: item.id,
                ...item.media,
              }),
            )
          : [],
      );
    } catch (error) {
      if (
        error instanceof DOMException &&
        error.name === "AbortError"
      ) {
        return;
      }

      console.error(
        "Estatísticas:",
        error,
      );

      setData([]);
    }
  }

  loadStats();

  return () => {
    controller.abort();
  };
}, []);

  const movies = useMemo(
    () =>
      data.filter(
        (item) =>
          item.media_type === "movie"
      ),
    [data]
  );

  const series = useMemo(
    () =>
      data.filter(
        (item) =>
          item.media_type === "tv"
      ),
    [data]
  );

  const rated = useMemo(
    () =>
      data.filter(
        (item) =>
          item.personal_rating !==
            null &&
          item.personal_rating !==
            undefined
      ),
    [data]
  );

  const averageRating = useMemo(() => {
    if (!rated.length) return 0;

    return (
      rated.reduce(
        (total, item) =>
          total +
          Number(
            item.personal_rating || 0
          ),
        0
      ) / rated.length
    );
  }, [rated]);

  const averageTmdb = useMemo(() => {
    const ratedTmdb =
      data.filter(
        (item) =>
          item.tmdb_rating !==
            null &&
          item.tmdb_rating !==
            undefined
      );

    if (!ratedTmdb.length) return 0;

    return (
      ratedTmdb.reduce(
        (total, item) =>
          total +
          Number(
            item.tmdb_rating || 0
          ),
        0
      ) / ratedTmdb.length
    );
  }, [data]);

  const episodes = useMemo(
    () =>
      series.reduce(
        (total, item) =>
          total +
          Number(
            item.episodes_count || 0
          ),
        0
      ),
    [series]
  );

  const seasons = useMemo(
    () =>
      series.reduce(
        (total, item) =>
          total +
          Number(
            item.seasons_count || 0
          ),
        0
      ),
    [series]
  );

  const totalMinutes = useMemo(
    () =>
      data.reduce((total, item) => {
        if (
          item.media_type === "tv"
        ) {
          const runtime =
            item.runtime || 45;

          const episodeCount =
            item.episodes_count || 0;

          return (
            total +
            runtime * episodeCount
          );
        }

        return (
          total +
          Number(item.runtime || 0)
        );
      }, 0),
    [data]
  );

  const totalHours =
    Math.round(totalMinutes / 60);

  const daysWatched =
    Math.round(
      totalMinutes / 60 / 24
    );

  const favorites = data.filter(
    (item) => item.favorite
  ).length;

  const watched = data.filter(
    (item) =>
      item.status === "watched"
  ).length;

  const watching = data.filter(
    (item) =>
      item.status === "watching"
  ).length;

  const want = data.filter(
    (item) => item.status === "want"
  ).length;

  const dropped = data.filter(
    (item) =>
      item.status === "dropped"
  ).length;

  const rewatching = data.filter(
    (item) =>
      item.status === "rewatching"
  ).length;

  const rewatched = data.reduce(
    (total, item) =>
      total +
      Number(
        item.rewatch_count || 0
      ),
    0
  );

  const highestRated = useMemo(() => {
    if (!rated.length) return null;

    return [...rated].sort(
      (a, b) =>
        Number(
          b.personal_rating || 0
        ) -
        Number(
          a.personal_rating || 0
        )
    )[0];
  }, [rated]);

  const ratingDistribution =
    useMemo(() => {
      const values = Array.from(
        { length: 10 },
        (_, index) =>
          index + 1
      );

      return values.map((rating) => ({
        rating,
        count: rated.filter(
          (item) =>
            Math.round(
              Number(
                item.personal_rating
              )
            ) === rating
        ).length,
      }));
    }, [rated]);

  const maxRatingCount =
    Math.max(
      ...ratingDistribution.map(
        (item) => item.count
      ),
      1
    );

  const genres = useMemo(() => {
    const map =
      new Map<string, number>();

    data.forEach((item) => {
      item.genres?.forEach(
        (genre) => {
          map.set(
            genre.name,
            (map.get(
              genre.name
            ) || 0) + 1
          );
        }
      );
    });

    return [...map.entries()]
      .sort(
        (a, b) => b[1] - a[1]
      )
      .slice(0, 8);
  }, [data]);

  const maxGenreCount =
    Math.max(
      ...genres.map(
        (item) => item[1]
      ),
      1
    );

  const years = useMemo(() => {
    const map =
      new Map<string, number>();

    data.forEach((item) => {
      const date =
        item.media_type === "tv"
          ? item.first_air_date
          : item.release_date;

      const year =
        date?.slice(0, 4);

      if (year) {
        map.set(
          year,
          (map.get(year) || 0) + 1
        );
      }
    });

    return [...map.entries()]
      .sort((a, b) =>
        a[0].localeCompare(b[0])
      )
      .slice(-10);
  }, [data]);

  const maxYearCount =
    Math.max(
      ...years.map(
        (item) => item[1]
      ),
      1
    );

  return (
    <>
      <Search />

      <div className="section">
        <div className="eyebrow">
          Seu histórico
        </div>

        <h1>Estatísticas</h1>

        <p className="muted">
          Uma visão completa da sua
          biblioteca.
        </p>
      </div>

      {/* VISÃO GERAL */}

      <div className="stat-grid">
        <div className="stat">
          <Film size={18} />

          <span className="muted">
            Filmes
          </span>

          <b>{movies.length}</b>
        </div>

        <div className="stat">
          <Tv size={18} />

          <span className="muted">
            Séries
          </span>

          <b>{series.length}</b>
        </div>

        <div className="stat">
          <Star size={18} />

          <span className="muted">
            Nota média
          </span>

          <b>
            {averageRating
              ? averageRating.toFixed(
                  1
                )
              : "—"}
          </b>
        </div>

        <div className="stat">
          <Heart size={18} />

          <span className="muted">
            Favoritos
          </span>

          <b>{favorites}</b>
        </div>

        <div className="stat">
          <Clock3 size={18} />

          <span className="muted">
            Tempo estimado
          </span>

          <b>{totalHours}h</b>
        </div>

        <div className="stat">
          <Play size={18} />

          <span className="muted">
            Episódios
          </span>

          <b>{episodes}</b>
        </div>
      </div>

      {/* STATUS */}

      <div className="section">
        <h2>Status da biblioteca</h2>
      </div>

      <div className="stats-status-grid">
        <div className="stats-status-card">
          <Check size={18} />
          <span>Assistidos</span>
          <b>{watched}</b>
        </div>

        <div className="stats-status-card">
          <Play size={18} />
          <span>Assistindo</span>
          <b>{watching}</b>
        </div>

        <div className="stats-status-card">
          <Clock size={18} />
          <span>Quero assistir</span>
          <b>{want}</b>
        </div>

        <div className="stats-status-card">
          <RotateCcw size={18} />
          <span>Reassistindo</span>
          <b>{rewatching}</b>
        </div>

        <div className="stats-status-card">
          <XCircle size={18} />
          <span>Abandonados</span>
          <b>{dropped}</b>
        </div>
      </div>

      {/* NOTAS + RESUMO */}

      <div className="two section">
        <div className="panel">
          <h3>
            Distribuição das suas notas
          </h3>

          <div className="rating-chart">
            {ratingDistribution
              .slice()
              .reverse()
              .map((item) => (
                <div
                  className="rating-row"
                  key={item.rating}
                >
                  <span>
                    {item.rating}
                  </span>

                  <div className="rating-bar">
                    <div
                      style={{
                        width: `${
                          item.count
                            ? Math.max(
                                5,
                                (item.count /
                                  maxRatingCount) *
                                  100
                              )
                            : 0
                        }%`,
                      }}
                    />
                  </div>

                  <b>
                    {item.count}
                  </b>
                </div>
              ))}
          </div>
        </div>

        <div className="panel">
          <h3>Resumo</h3>

          <div className="row">
            <span>
              Títulos na biblioteca
            </span>
            <b>{data.length}</b>
          </div>

          <div className="row">
            <span>
              Avaliados
            </span>
            <b>{rated.length}</b>
          </div>

          <div className="row">
            <span>
              Nota média TMDB
            </span>
            <b>
              {averageTmdb
                ? averageTmdb.toFixed(
                    1
                  )
                : "—"}
            </b>
          </div>

          <div className="row">
            <span>
              Temporadas
            </span>
            <b>{seasons}</b>
          </div>

          <div className="row">
            <span>
              Reassistências
            </span>
            <b>{rewatched}</b>
          </div>

          <div className="row">
            <span>
              Dias equivalentes
            </span>
            <b>{daysWatched}</b>
          </div>
        </div>
      </div>

      {/* GÊNEROS + ANOS */}

      <div className="two section">
        <div className="panel">
          <h3>
            Gêneros mais presentes
          </h3>

          {years.length ? (
  years.map(
    ([year, count], index) => (
      <div
        className="row"
        key={`year-${year}-${index}`}
      >
                  <span>{year}</span>

                  <div
                    style={{
                      width: "45%",
                      display: "flex",
                      alignItems:
                        "center",
                      gap: "8px",
                    }}
                  >
                    <div
                      style={{
                        flex: 1,
                        height: 8,
                        borderRadius:
                          999,
                        background:
                          "rgba(255,255,255,.07)",
                        overflow:
                          "hidden",
                      }}
                    >
                      <div
                        style={{
                          height:
                            "100%",
                          width: `${
                            (count /
                              maxGenreCount) *
                            100
                          }%`,
                          borderRadius:
                            999,
                          background:
                            "var(--accent)",
                        }}
                      />
                    </div>

                    <b>{count}</b>
                  </div>
                </div>
              )
            )
          ) : (
            <div className="muted">
              Nenhum gênero disponível.
            </div>
          )}
        </div>

        <div className="panel">
          <h3>
            Títulos por ano
          </h3>

          {years.length ? (
            years.map(
              ([year, count]) => (
                <div
                  className="row"
                  key={year}
                >
                  <span>{year}</span>

                  <div
                    style={{
                      width: "55%",
                      display: "flex",
                      alignItems:
                        "center",
                      gap: "8px",
                    }}
                  >
                    <div
                      style={{
                        flex: 1,
                        height: 8,
                        borderRadius:
                          999,
                        background:
                          "rgba(255,255,255,.07)",
                        overflow:
                          "hidden",
                      }}
                    >
                      <div
                        style={{
                          height:
                            "100%",
                          width: `${
                            (count /
                              maxYearCount) *
                            100
                          }%`,
                          borderRadius:
                            999,
                          background:
                            "var(--accent)",
                        }}
                      />
                    </div>

                    <b>{count}</b>
                  </div>
                </div>
              )
            )
          ) : (
            <div className="muted">
              Nenhum dado disponível.
            </div>
          )}
        </div>
      </div>

      {/* DESTAQUE */}

      {highestRated && (
        <div className="section">
          <div className="panel stats-highlight">
            <div>
              <div className="eyebrow">
                Sua maior nota
              </div>

              <h2>
                {highestRated.title}
              </h2>

              <div className="stats-highlight-meta">
                <Trophy size={16} />

                <span>
                  Você deu{" "}
                  <strong>
                    {Number(
                      highestRated.personal_rating
                    ).toFixed(1)}
                  </strong>
                  /10
                </span>

                {highestRated.tmdb_rating && (
                  <span className="muted">
                    TMDB{" "}
                    {Number(
                      highestRated.tmdb_rating
                    ).toFixed(1)}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <p className="muted">
        * O tempo é uma estimativa baseada
        na duração disponível. Para séries,
        é calculado usando a duração média
        disponível e o número de episódios.
      </p>
    </>
  );
}